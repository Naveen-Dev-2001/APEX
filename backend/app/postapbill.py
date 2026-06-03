import logging
import os
import base64
import uuid

import requests

logger = logging.getLogger("ai_app")

from app.config.settings import settings

# --------------------------------------------------
# CONFIG
# --------------------------------------------------

BASE_URL = settings.SAGE_BASE_URL
TOKEN_URL = settings.SAGE_TOKEN_URL

CLIENT_ID = settings.SAGE_CLIENT_ID
CLIENT_SECRET = settings.SAGE_CLIENT_SECRET
USERNAME = settings.SAGE_USERNAME

LOCATION_ID = "" # Default fallback
ATTACHMENT_FOLDER_KEY = settings.ATTACHMENT_FOLDER_KEY


# --------------------------------------------------
# PUBLIC ENTRY POINT
# --------------------------------------------------

def post_ap_bill(
    invoice, 
    pdf_path: str,
    gl_account: str = None,
    location: str = LOCATION_ID,
    dept: str = None,
    vendor_dim: str = None,
    item: str = None,
    class_lob: str = None,
    line_items: list = None
) -> dict:
    """
    Post an AP Bill to Sage Intacct after a final invoice approval.

    Args:
        invoice:  SQLAlchemy Invoice ORM object (fully approved).
        pdf_path: Absolute path to the generated approval PDF.
        gl_account: GL Account ID.
        location: Location ID.
        dept: Department ID.
        vendor_dim: Vendor ID for dimensions.
        item: Item ID.
        class_lob: Class (LOB) ID.
        line_items: Detailed line-item coding data (if any).

    Returns:
        dict with keys 'success' (bool) and 'data' (API response) or 'error'.
    """
    try:
        # ── 1. Authenticate ──────────────────────────────────────────────────
        access_token = _get_access_token(location)
            
        auth_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if location:
            auth_headers["X-IA-API-Param-Entity"] = location
        
        # logger.info(f"[PostAPBill] Sage Auth Headers: {auth_headers}")
        logger.info(f"[PostAPBill] Posting invoice {invoice.id} to location: '{location or 'Top Level'}'")
        logger.info(f"[PostAPBill] Authenticated with Sage Intacct for invoice {invoice.id}")

        # ── 2. Create attachment record ──────────────────────────────────────
        attachment_key, attachment_id = _create_attachment(
            auth_headers,
            name=f"Invoice_{invoice.id}_{invoice.invoice_number or 'approval'}",
        )
        logger.info(f"[PostAPBill] Attachment created: key={attachment_key}, id={attachment_id}")

        # ── 3. Build PDF file list ───────────────────────────────────────────
        #  • The original invoice PDF (invoice.file_path)
        #  • The generated approval PDF (pdf_path)
        pdf_files = []
        if invoice.file_path and os.path.exists(invoice.file_path):
            pdf_files.append(invoice.file_path)
        else:
            logger.warning(
                f"[PostAPBill] Original invoice file not found at '{invoice.file_path}'; skipping."
            )
        if pdf_path and os.path.exists(pdf_path):
            pdf_files.append(pdf_path)
        else:
            logger.warning(
                f"[PostAPBill] Approval PDF not found at '{pdf_path}'; skipping."
            )

        # ── 4. Upload files to attachment ────────────────────────────────────
        if pdf_files:
            _upload_files(auth_headers, attachment_key, pdf_files)
            logger.info(f"[PostAPBill] Uploaded {len(pdf_files)} file(s) to attachment {attachment_key}")
        else:
            logger.warning("[PostAPBill] No PDF files to attach.")

        # ── 5. Create AP Bill ────────────────────────────────────────────────
        bill_response = _create_ap_bill(
            auth_headers, 
            invoice, 
            attachment_id,
            gl_account=gl_account,
            location=location,
            dept=dept,
            vendor_dim=vendor_dim,
            item=item,
            class_lob=class_lob,
            line_items=line_items
        )
        logger.info(f"[PostAPBill] AP Bill created successfully for invoice {invoice.id}")
        return {"success": True, "data": bill_response}

    except Exception as exc:
        logger.error(
            f"[PostAPBill] Failed to post AP Bill for invoice {invoice.id}: {exc}"
        )
        return {"success": False, "error": str(exc)}


# --------------------------------------------------
# PRIVATE HELPERS
# --------------------------------------------------

def _get_access_token(location=None) -> str:
    # If the username in .env already has an entity ID (e.g., User@Company|201),
    # extract just the base 'User@Company' part so we don't end up with two pipes.
    base_username = USERNAME.split("|")[0] if USERNAME else ""
    
    token_username = USERNAME
    if location:
        token_username = f"{base_username}|{location}"
        
    token_payload = {
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "username": token_username,
    }
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    resp = requests.post(TOKEN_URL, json=token_payload, headers=headers, timeout=30)
    
    if not resp.ok:
        logger.error(f"[PostAPBill] Token request failed: {resp.status_code} - {resp.text}")
        
    resp.raise_for_status()
    return resp.json()["access_token"]


def _create_attachment(auth_headers: dict, name: str) -> tuple:
    """Create a Sage Intacct attachment record. Returns (key, id)."""
    attachment_id = f"ap_{uuid.uuid4().hex[:8]}"
    payload = {
        "id": attachment_id,
        "name": name,
        "folder": {"key": ATTACHMENT_FOLDER_KEY},
    }
    url = f"{BASE_URL}/objects/company-config/attachment"
    resp = requests.post(url, json=payload, headers=auth_headers, timeout=30)
    if not resp.ok:
        raise RuntimeError(
            f"Failed to create attachment: {resp.status_code} — {resp.text}"
        )
    result = resp.json()["ia::result"]
    return result["key"], result["id"]


def _upload_files(auth_headers: dict, attachment_key: str, file_paths: list) -> None:
    """Base64-encode and upload PDF files to an existing attachment."""
    files_payload = []
    for fp in file_paths:
        with open(fp, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("utf-8")
        files_payload.append({"name": os.path.basename(fp), "data": encoded})

    url = f"{BASE_URL}/objects/company-config/attachment/{attachment_key}"
    resp = requests.patch(url, json={"files": files_payload}, headers=auth_headers, timeout=60)
    resp.raise_for_status()

def _create_ap_bill(
    auth_headers: dict, 
    invoice, 
    attachment_id: str,
    gl_account: str,
    location: str,
    dept: str,
    vendor_dim: str,
    item: str,
    class_lob: str,
    line_items: list = None
) -> dict:
    """POST an AP Bill to Sage Intacct and return the API response JSON."""
    import json as _json
    from datetime import datetime, timedelta

    # --------------------------------------------------
    # Extract total amount (Aggregate fallback)
    # --------------------------------------------------
    total_amount = "0"
    try:
        from app.services.pdf_service import _extract_total
        extracted_data_obj = _json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else (invoice.extracted_data or {})
        
        # Prefer total_amount_payable
        pdf_amt_str = extracted_data_obj.get("amounts", {}).get("total_amount_payable", {}).get("value")

        if pdf_amt_str and pdf_amt_str != "—":
            clean_amt = str(pdf_amt_str).replace(",", "").replace("$", "").replace("€", "").replace("£", "").strip()
            import re
            match = re.search(r'-?\d+(\.\d+)?', clean_amt)
            if match:
                total_float = float(match.group())
                total_amount = str(int(total_float)) if total_float.is_integer() else str(total_float)

    except Exception as e:
        logger.warning(f"[PostAPBill] Error getting total amount from PDF service logic: {e}")

    # --------------------------------------------------
    # Vendor and invoice details
    # --------------------------------------------------
    vendor_id = invoice.vendor_id or ""
    invoice_number = invoice.invoice_number
    description = f"Invoice Id: {invoice.id} - {invoice.vendor_name or vendor_id}"

    # --------------------------------------------------
    # Date calculation
    # --------------------------------------------------
    from dateutil.parser import parse
    current_date = datetime.utcnow()
    posting_date = invoice.posting_date if invoice.posting_date else (invoice.uploaded_at if invoice.uploaded_at else current_date)
    posting_date_str = posting_date.strftime("%Y-%m-%d")
    base_date = invoice.uploaded_at if invoice.uploaded_at else current_date
    due_date = base_date + timedelta(days=30)
    
    try:
        ed = _json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else (invoice.extracted_data or {})
        inv_details = ed.get("invoice_details", {})
        inv_date_str = inv_details.get("invoice_date", {}).get("value")
        due_date_str_ext = inv_details.get("due_date", {}).get("value")
        
        if inv_date_str:
            try: base_date = parse(str(inv_date_str), fuzzy=True)
            except: pass
        if due_date_str_ext:
            try: due_date = parse(str(due_date_str_ext), fuzzy=True)
            except: due_date = base_date + timedelta(days=30)
        else:
            due_date = base_date + timedelta(days=30)
    except Exception as e:
        logger.warning(f"[PostAPBill] Error parsing dates: {e}")

    base_date_str = base_date.strftime("%Y-%m-%d")
    due_date_str = due_date.strftime("%Y-%m-%d")

    # --------------------------------------------------
    # Dimensions Helpers
    # --------------------------------------------------
    def _extract_id(val: str) -> str:
        if not val: return ""
        val = str(val).strip()
        return val.split(" - ", 1)[0].strip() if " - " in val else val

    # --------------------------------------------------
    # Build Lines
    # --------------------------------------------------
    final_lines = []

    if line_items and isinstance(line_items, list) and len(line_items) > 0:
        logger.info(f"[PostAPBill] Constructing {len(line_items)} lines for bill.")
        for item_data in line_items:
            # 1. Resolve GL Account for this line
            line_gl = item_data.get("gl_code") or item_data.get("glAccount") or gl_account
            line_gl = _extract_id(line_gl)
            if not line_gl or str(line_gl).lower() in ["none", "null", ""]:
                raise ValueError(
                    f"GL Account is required for line item: {item_data}"
                )

            # 2. Resolve Amount for this line
            line_amt = item_data.get("amount") or item_data.get("net_amount") or item_data.get("total_amount") or "0"
            try:
                amt_float = float(str(line_amt).replace(",", "").replace("$", "").strip() or 0)
                line_amt_str = str(int(amt_float)) if amt_float.is_integer() else str(amt_float)
            except:
                line_amt_str = "0"

            # 3. Dimensions for this line (fallback to header if missing)
            line_loc = _extract_id(item_data.get("location") or item_data.get("location_id") or (location if location is not None else LOCATION_ID))
            line_dept = _extract_id(item_data.get("department") or item_data.get("department_id") or dept)
            line_item_dim = _extract_id(item_data.get("item") or item_data.get("item_id") or item)
            line_class = _extract_id(item_data.get("lob") or item_data.get("class") or item_data.get("class_id") or class_lob)
            line_memo = item_data.get("description") or description

            line_dims = {
                "location": {"id": line_loc} if line_loc else None,
                "department": {"id": line_dept} if line_dept else None,
                "vendor": {"id": str(vendor_dim)} if vendor_dim else None,
                "item": {"id": line_item_dim} if line_item_dim else None,
                "class": {"id": line_class} if line_class else None
            }
            # Clean up empty dims 
            line_dims = {k: v for k, v in line_dims.items() if v is not None}

            final_lines.append({
                "glAccount": {"id": line_gl},
                "txnAmount": line_amt_str,
                "dimensions": line_dims,
                "memo": line_memo
            })
    else:
        # Fallback to single aggregate line
        gl_account_clean = _extract_id(gl_account)
        if not gl_account_clean or str(gl_account_clean).lower() in ["none", "null", ""]:
            raise ValueError("GL Account is required to create AP Bill")

        header_dims = {
            "location": {"id": _extract_id(location)} if location else None,
            "department": {"id": _extract_id(dept)} if dept else None,
            "vendor": {"id": str(vendor_dim)} if vendor_dim else None,
            "item": {"id": _extract_id(item)} if item else None,
            "class": {"id": _extract_id(class_lob)} if class_lob else None
        }
        header_dims = {k: v for k, v in header_dims.items() if v is not None}

        final_lines.append({
            "glAccount": {"id": gl_account_clean},
            "txnAmount": str(total_amount),
            "dimensions": header_dims,
            "memo": description
        })

    # --------------------------------------------------
    # Bill payload
    # --------------------------------------------------
    bill_payload = {
        "billNumber": f"{invoice_number}",
        "vendor": {"id": str(vendor_id)},
        "referenceNumber": str(invoice.reference_number or invoice_number),
        "description": description,
        "createdDate": base_date_str,
        "postingDate": posting_date_str,
        "dueDate": due_date_str,
        "attachment": {"id": str(attachment_id)},
        "lines": final_lines
    }

    # Debug log
    logger.info("SAGE BILL PAYLOAD:")
    logger.info(_json.dumps(bill_payload, indent=2))
    
    print("----- BILL PAYLOAD -----")
    print(_json.dumps(bill_payload, indent=2))

    # --------------------------------------------------
    # Call Sage API
    # --------------------------------------------------
    url = f"{BASE_URL}/objects/accounts-payable/bill"
    resp = requests.post(url, json=bill_payload, headers=auth_headers, timeout=30)

    if not resp.ok:
        error_msg = resp.text
        try:
            error_data = resp.json()
            error_details = error_data.get("ia::result", {}).get("ia::error", {}).get("details", [])
            messages = [d.get("message") for d in error_details if d.get("message")]
            if messages:
                error_msg = " | ".join(messages)
        except Exception:
            pass
            
        raise RuntimeError(
            f"Failed to create AP Bill: {resp.status_code} — {error_msg}"
        )

    return resp.json()