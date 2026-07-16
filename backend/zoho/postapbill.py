import logging
import os
import requests
from datetime import datetime, timedelta
from dateutil.parser import parse
import json as _json

logger = logging.getLogger("ai_app")

from common.config.settings import settings

# --------------------------------------------------
# CONFIG
# --------------------------------------------------
ZOHO_CLIENT_ID = settings.ZOHO_CLIENT_ID
ZOHO_CLIENT_SECRET = settings.ZOHO_CLIENT_SECRET
ZOHO_REFRESH_TOKEN = settings.ZOHO_REFRESH_TOKEN
ZOHO_ORG_ID = settings.ZOHO_ORG_ID
ZOHO_TOKEN_URL = settings.ZOHO_TOKEN_URL
ZOHO_API_BASE = settings.ZOHO_API_BASE


def _get_access_token() -> str:
    """Exchange refresh token for a new Zoho access token."""
    payload = {
        "grant_type": "refresh_token",
        "client_id": ZOHO_CLIENT_ID,
        "client_secret": ZOHO_CLIENT_SECRET,
        "refresh_token": ZOHO_REFRESH_TOKEN,
    }
    logger.info(f"[PostAPBill Zoho] Getting fresh access token from {ZOHO_TOKEN_URL}")
    resp = requests.post(ZOHO_TOKEN_URL, data=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"Zoho token error: {data['error']}")
    access_token = data.get("access_token")
    if not access_token:
        raise RuntimeError(f"No access_token in Zoho response: {data}")
    return access_token


def _upload_document(access_token: str, file_path_or_bytes: str | bytes, file_name: str = None) -> tuple[str, str]:
    """Uploads document to Zoho Books and returns (document_id, file_name)."""
    url = f"{ZOHO_API_BASE}/documents"
    headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}
    params = {"organization_id": ZOHO_ORG_ID}
    
    if isinstance(file_path_or_bytes, bytes):
        if not file_name:
            file_name = "document.pdf"
        logger.info(f"[PostAPBill Zoho] Uploading {file_name} from bytes to Zoho documents store")
        files = {"document": (file_name, file_path_or_bytes)}
        resp = requests.post(url, headers=headers, params=params, files=files, timeout=60)
    else:
        file_name = os.path.basename(file_path_or_bytes)
        logger.info(f"[PostAPBill Zoho] Uploading {file_name} to Zoho documents store")
        with open(file_path_or_bytes, "rb") as f:
            files = {"document": (file_name, f)}
            resp = requests.post(url, headers=headers, params=params, files=files, timeout=60)
        
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != 0:
        raise RuntimeError(f"Zoho upload API error {data.get('code')}: {data.get('message', 'unknown error')}")
        
    document = data.get("documents", {})
    document_id = document.get("document_id")
    if not document_id:
        raise RuntimeError(f"No document_id returned from Zoho document upload: {data}")
        
    return document_id, document.get("file_name", file_name)



def _resolve_gl_account_id(gl_code: str) -> str:
    """
    Resolve a user-coded GL account number/code (e.g. '10045') to
    the Zoho unique account_id (e.g. '8881566000000100216') stored in gl_master.gl_key.
    If no match is found or code matches Zoho format, returns the code as-is.
    """
    if not gl_code:
        return ""
    gl_code_str = str(gl_code).strip()
    
    # If the code already looks like a Zoho ID (e.g. long string of digits >= 15 chars), return as-is
    if gl_code_str.isdigit() and len(gl_code_str) >= 15:
        return gl_code_str
        
    from common.database.database import SessionLocal
    from common.models.db_models import GLMaster
    
    db = SessionLocal()
    try:
        # Search by account_number (e.g. '10045')
        gl_record = db.query(GLMaster).filter(GLMaster.account_number == gl_code_str).first()
        if gl_record and gl_record.gl_key:
            logger.info(f"[PostAPBill Zoho] Resolved GL code '{gl_code_str}' to Zoho account_id '{gl_record.gl_key}'")
            return gl_record.gl_key
            
        # Fallback search by account_code / account_name if account_number didn't match
        gl_record = db.query(GLMaster).filter(GLMaster.account_code == gl_code_str).first()
        if gl_record and gl_record.gl_key:
            logger.info(f"[PostAPBill Zoho] Resolved GL code '{gl_code_str}' (via account_code) to Zoho account_id '{gl_record.gl_key}'")
            return gl_record.gl_key
            
        logger.warning(f"[PostAPBill Zoho] Could not find Zoho mapping for GL account '{gl_code_str}' in database. Using as-is.")
        return gl_code_str
    except Exception as e:
        logger.error(f"[PostAPBill Zoho] Error resolving GL account mapping: {e}", exc_info=True)
        return gl_code_str
    finally:
        db.close()





def post_ap_bill(
    invoice, 
    pdf_path: str,
    gl_account: str = None,
    location: str = None,
    dept: str = None,
    vendor_dim: str = None,
    item: str = None,
    class_lob: str = None,
    line_items: list = None
) -> dict:
    """
    Post an AP Bill to Zoho Books after a final invoice approval.

    Args:
        invoice:      SQLAlchemy Invoice ORM object (fully approved).
        pdf_path:     Absolute path to the generated approval PDF.
        gl_account:   GL Account ID.
        location:     Location ID.
        dept:         Department ID.
        vendor_dim:   Vendor ID (Zoho contact_id).
        item:         Item ID.
        class_lob:    Class (LOB) ID.
        line_items:   Detailed line-item coding data (if any).

    Returns:
        dict with keys 'success' (bool) and 'data' (API response) or 'error'.
    """
    try:
        # ── 1. Authenticate ──────────────────────────────────────────────────
        access_token = _get_access_token()
        logger.info(f"[PostAPBill Zoho] Authenticated with Zoho Books for invoice {invoice.id}")

        # ── 2. Upload Scanned Invoices/PDFs ──────────────────────────────────
        documents_payload = []
        
        # Original invoice PDF upload
        if invoice.file_path:
            try:
                if os.path.exists(invoice.file_path):
                    doc_id, f_name = _upload_document(access_token, invoice.file_path)
                    documents_payload.append({"document_id": doc_id, "file_name": f_name})
                else:
                    # Fetch from Azure Blob Storage
                    from common.services.azure_blob import get_blob_name_from_path, container_client
                    blob_name = get_blob_name_from_path(invoice.file_path)
                    blob_client = container_client.get_blob_client(blob_name)
                    if blob_client.exists():
                        logger.info(f"[PostAPBill Zoho] Downloading original invoice '{blob_name}' from Azure Blob Storage.")
                        invoice_bytes = blob_client.download_blob().readall()
                        doc_id, f_name = _upload_document(access_token, invoice_bytes, os.path.basename(invoice.file_path))
                        documents_payload.append({"document_id": doc_id, "file_name": f_name})
                    else:
                        logger.warning(f"[PostAPBill Zoho] Original invoice file not found in blob or locally: {invoice.file_path}")
            except Exception as e:
                logger.warning(f"[PostAPBill Zoho] Failed to fetch or upload original invoice PDF: {e}")


        # Final approval PDF upload
        if pdf_path and os.path.exists(pdf_path):
            try:
                doc_id, f_name = _upload_document(access_token, pdf_path)
                documents_payload.append({"document_id": doc_id, "file_name": f_name})
            except Exception as e:
                logger.warning(f"[PostAPBill Zoho] Failed to upload approval PDF: {e}")
        else:
            logger.warning(f"[PostAPBill Zoho] Approval PDF not found at '{pdf_path}'; skipping upload.")

        # ── 3. Date & Term Calculations ──────────────────────────────────────
        current_date = datetime.utcnow()
        base_date = invoice.uploaded_at if invoice.uploaded_at else current_date
        due_date = base_date + timedelta(days=30)

        try:
            ed = _json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else (invoice.extracted_data or {})
            inv_details = ed.get("invoice_details", {})
            inv_date_str = inv_details.get("invoice_date", {}).get("value")
            due_date_str_ext = inv_details.get("due_date", {}).get("value")
            
            if inv_date_str:
                try:
                    base_date = parse(str(inv_date_str), fuzzy=True)
                except:
                    pass
            if due_date_str_ext:
                try:
                    due_date = parse(str(due_date_str_ext), fuzzy=True)
                except:
                    due_date = base_date + timedelta(days=30)
            else:
                due_date = base_date + timedelta(days=30)
        except Exception as e:
            logger.warning(f"[PostAPBill Zoho] Error parsing dates: {e}")

        base_date_str = base_date.strftime("%Y-%m-%d")
        due_date_str = due_date.strftime("%Y-%m-%d")
        
        # Calculate payment terms dynamically in days (0 if same/negative)
        days_diff = (due_date - base_date).days
        payment_terms = max(0, days_diff)
        payment_terms_label = f"Net {payment_terms}" if payment_terms > 0 else "Due on Receipt"

        # ── 4. Resolve Vendor ID ─────────────────────────────────────────────
        vendor_id = invoice.vendor_id or vendor_dim or ""
        if not vendor_id:
            raise ValueError("Vendor ID (Zoho contact_id) is required to post a bill to Zoho Books")

        # ── 5. Resolve Total Amount (for aggregate fallback) ────────────────
        total_amount = 0.0
        if invoice.total_amount is not None:
            total_amount = float(invoice.total_amount)
        else:
            try:
                ed = _json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else (invoice.extracted_data or {})
                amt_str = ed.get("amounts", {}).get("total_amount_payable", {}).get("value")
                if not amt_str:
                    amt_str = ed.get("amounts", {}).get("total_invoice_amount", {}).get("value")
                if amt_str:
                    clean_amt = str(amt_str).replace(",", "").replace("$", "").replace("€", "").replace("£", "").strip()
                    import re
                    match = re.search(r'-?\d+(\.\d+)?', clean_amt)
                    if match:
                        total_amount = float(match.group())
            except Exception as e:
                logger.warning(f"[PostAPBill Zoho] Error resolving total amount: {e}")

        # ── 6. Description / Notes ───────────────────────────────────────────
        description = ""
        try:
            ed = _json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else (invoice.extracted_data or {})
            description = ((ed.get("additional_info") or {}).get("memo", {}).get("value") or "").strip()
        except:
            pass
        if not description:
            description = f"Bill posted from AP System for Invoice {invoice.invoice_number}"

        # ── 7. Build Lines ───────────────────────────────────────────────────
        final_lines = []

        def _extract_id(val: str) -> str:
            if not val:
                return ""
            val = str(val).strip()
            return val.split(" - ", 1)[0].strip() if " - " in val else val

        if line_items and isinstance(line_items, list) and len(line_items) > 0:
            logger.info(f"[PostAPBill Zoho] Constructing {len(line_items)} lines for Zoho bill.")
            for item_data in line_items:
                line_gl = item_data.get("gl_code") or item_data.get("glAccount") or gl_account
                line_gl = _extract_id(line_gl)
                if not line_gl or str(line_gl).lower() in ["none", "null", ""]:
                    raise ValueError(f"GL Account ID is required for Zoho line item: {item_data}")

                # Resolve user-facing code to Zoho Books unique account_id
                line_gl = _resolve_gl_account_id(line_gl)

                qty = item_data.get("qty") or item_data.get("quantity") or 1
                try:
                    qty = float(qty)
                except:
                    qty = 1.0

                unit_price = item_data.get("unit_price") or item_data.get("unitPrice") or item_data.get("rate")
                if unit_price is not None:
                    try:
                        rate = float(unit_price)
                    except:
                        rate = 0.0
                else:
                    net_amt = item_data.get("net_amount") or item_data.get("amount") or 0.0
                    try:
                        net_amt = float(net_amt)
                        rate = net_amt / qty if qty > 0 else net_amt
                    except:
                        rate = 0.0

                line_desc = item_data.get("description") or description
                final_lines.append({
                    "account_id": line_gl,
                    "name": line_desc[:100],  # Zoho name is usually shorter
                    "description": line_desc,
                    "quantity": qty,
                    "rate": rate,
                    "tax_id": "",
                    "unit": "pcs",
                })
        else:
            # Fallback to single aggregate line
            gl_account_clean = _extract_id(gl_account)
            if not gl_account_clean or str(gl_account_clean).lower() in ["none", "null", ""]:
                raise ValueError("GL Account is required to create Zoho AP Bill")

            # Resolve user-facing code to Zoho Books unique account_id
            gl_account_clean = _resolve_gl_account_id(gl_account_clean)

            final_lines.append({
                "account_id": gl_account_clean,
                "name": description[:100],
                "description": description,
                "quantity": 1.0,
                "rate": total_amount,
                "tax_id": "",
                "unit": "pcs",
            })

        # ── 8. Assemble Zoho Bill Payload ────────────────────────────────────
        bill_number = f"{invoice.invoice_number}"
        
        bill_payload = {
            "vendor_id": str(vendor_id),
            "bill_number": bill_number,
            "date": base_date_str,
            "due_date": due_date_str,
            "payment_terms": payment_terms,
            "payment_terms_label": payment_terms_label,
            "reference_number": str(invoice.reference_number or bill_number),
            "exchange_rate": float(invoice.exchange_rate) if invoice.exchange_rate else 1.0,
            "notes": "Received via AP system",
            "documents": documents_payload,
            "line_items": final_lines,
        }

        logger.info(f"[PostAPBill Zoho] Zoho Books Bill Payload:\n{_json.dumps(bill_payload, indent=2)}")

        # ── 9. Call Zoho Books API ───────────────────────────────────────────
        url = f"{ZOHO_API_BASE}/bills"
        headers = {
            "Authorization": f"Zoho-oauthtoken {access_token}",
            "Content-Type": "application/json",
        }
        params = {"organization_id": ZOHO_ORG_ID}
        
        resp = requests.post(url, headers=headers, params=params, json=bill_payload, timeout=30)
        
        if not resp.ok:
            error_msg = resp.text
            try:
                err_data = resp.json()
                if "message" in err_data:
                    error_msg = f"{err_data.get('code')}: {err_data.get('message')}"
            except:
                pass
            raise RuntimeError(f"Failed to create Zoho AP Bill: {resp.status_code} — {error_msg}")

        resp_data = resp.json()
        if resp_data.get("code") != 0:
            raise RuntimeError(f"Zoho API error {resp_data.get('code')}: {resp_data.get('message', 'unknown error')}")

        bill = resp_data.get("bill", {})
        created_bill_no = bill.get("bill_number") or bill_number
        logger.info(f"[PostAPBill Zoho] AP Bill created successfully: bill_number={created_bill_no}, bill_id={bill.get('bill_id')}")
        
        # Map Zoho books fields to fit Sage's response format:
        # Caller reads: sage_response.get("billNumber") or intended_bill_no
        return {
            "success": True, 
            "data": {
                "billNumber": created_bill_no,
                "bill_id": bill.get("bill_id"),
                "status": bill.get("status"),
                "total": bill.get("total")
            }
        }

    except Exception as exc:
        logger.error(f"[PostAPBill Zoho] Failed to post AP Bill for invoice {invoice.id}: {exc}", exc_info=True)
        return {"success": False, "error": str(exc)}
