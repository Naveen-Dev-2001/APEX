import os
import base64
import re
import logging
import logging.handlers
from datetime import datetime
from pathlib import Path
import shutil
import asyncio

import msal
import requests
from dotenv import load_dotenv

load_dotenv()

TENANT_ID = os.getenv("TENANT_ID")
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")

MAILBOX_ENV = os.getenv("MAILBOX", "")
if "|" in MAILBOX_ENV:
    MAILBOX, ENTITY_ID = MAILBOX_ENV.split("|", 1)
else:
    MAILBOX = MAILBOX_ENV
    ENTITY_ID = "201"

UNREAD_DIR = Path("uploads/unread")
READ_DIR = Path("uploads/read")
NON_INVOICE_DIR = Path("uploads/non_invoice")

UNREAD_DIR.mkdir(parents=True, exist_ok=True)
READ_DIR.mkdir(parents=True, exist_ok=True)
NON_INVOICE_DIR.mkdir(parents=True, exist_ok=True)

AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
SCOPE = ["https://graph.microsoft.com/.default"]
GRAPH = "https://graph.microsoft.com/v1.0"

# Module-level MSAL app so the in-memory token cache is reused across calls.
_msal_app: msal.ConfidentialClientApplication | None = None


# ---------------------------------------------------------------------------
# Logging — writes to both console (INFO) and rotating file (DEBUG)
# ---------------------------------------------------------------------------

def _setup_logging() -> logging.Logger:
    logger = logging.getLogger("apgraphmail")
    if logger.handlers:          # already configured (e.g. re-import in REPL)
        return logger
    logger.setLevel(logging.DEBUG)

    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)

    fh = logging.handlers.RotatingFileHandler(
        "invoice_download.log",
        maxBytes=5 * 1024 * 1024,   # 5 MB per file
        backupCount=10,
        encoding="utf-8",
    )
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)

    logger.addHandler(ch)
    logger.addHandler(fh)
    return logger


log = _setup_logging()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def safe_filename(name: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\r\n\t]', "_", name).strip()
    return cleaned or "unnamed"


def _format_datestamp(received_datetime: str) -> str:
    """Convert Graph receivedDateTime into YYYYMMDD_HHMMSS for filenames."""
    if not received_datetime:
        return "unknown_date"

    try:
        # Graph commonly returns UTC timestamps ending with 'Z'.
        parsed = datetime.fromisoformat(received_datetime.replace("Z", "+00:00"))
        return parsed.strftime("%Y%m%d_%H%M%S")
    except ValueError:
        # Fallback keeps only safe date/time characters if parsing fails.
        fallback = re.sub(r"[^0-9T]", "", received_datetime)
        fallback = fallback.replace("T", "_")
        return fallback[:15] or "unknown_date"


def _build_output_filename(original_name: str, datestamp: str, subject: str, duplicate_index: int) -> str:
    """Build sanitized filename as: name_datestamp_subject(.ext), with optional _N suffix."""
    original_path = Path(safe_filename(original_name))
    stem = original_path.stem or "attachment"
    suffix = original_path.suffix or ".bin"
    subject_part = safe_filename(subject)[:80]
    core = safe_filename(f"{stem}_{datestamp}_{subject_part}")

    if duplicate_index > 1:
        core = f"{core}_{duplicate_index}"

    return f"{core}{suffix}"


def _get_msal_app() -> msal.ConfidentialClientApplication:
    global _msal_app
    if _msal_app is None:
        _msal_app = msal.ConfidentialClientApplication(
            CLIENT_ID,
            authority=AUTHORITY,
            client_credential=CLIENT_SECRET,
        )
    return _msal_app


def get_token() -> str:
    result = _get_msal_app().acquire_token_for_client(scopes=SCOPE)
    if "access_token" not in result:
        error = result.get("error", "unknown")
        desc = result.get("error_description", "no description")
        raise RuntimeError(f"Token acquisition failed: {error} — {desc}")
    return result["access_token"]


def _graph_get(url: str, token: str) -> dict:
    import time
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.get(
                url,
                headers={"Authorization": f"Bearer {token}"},
                timeout=60,
            )
            # Retry on transient server errors (502, 503, 504)
            if resp.status_code in (502, 503, 504) and attempt < max_retries:
                log.warning("Graph GET transient error %s. Retrying in %ds... (Attempt %d/%d)", 
                            resp.status_code, attempt * 2, attempt, max_retries)
                time.sleep(attempt * 2)
                continue

            if resp.status_code >= 400:
                log.error("Graph GET failed | status=%s | url=%s | body=%.500s",
                          resp.status_code, url, resp.text)
                resp.raise_for_status()
            return resp.json()
        except requests.exceptions.RequestException as e:
            if attempt == max_retries:
                raise
            log.warning("Graph GET failed with exception: %s. Retrying in %ds... (Attempt %d/%d)", 
                        e, attempt * 2, attempt, max_retries)
            time.sleep(attempt * 2)


def _graph_patch(url: str, token: str, payload: dict) -> None:
    resp = requests.patch(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def _fetch_all_unread_with_attachments(token: str) -> list[dict]:
    """
    Page through ALL unread messages that have attachments using server-side
    OData filtering so we never miss emails beyond a $top limit.
    """
    url = (
        f"{GRAPH}/users/{MAILBOX}/messages"
        "?$filter=isRead eq false and hasAttachments eq true"
        "&$select=id,subject,from,receivedDateTime"
        "&$top=50"
    )

    messages: list[dict] = []
    page = 1
    while url:
        log.debug("Fetching message page %d", page)
        data = _graph_get(url, token)
        batch = data.get("value", [])
        messages.extend(batch)
        log.debug("Page %d returned %d messages", page, len(batch))
        url = data.get("@odata.nextLink")
        page += 1

    messages.sort(key=lambda m: m.get("receivedDateTime") or "")

    return messages


def _fetch_attachment_bytes(msg_id: str, att_id: str, att_name: str, token: str) -> bytes | None:
    """Fetch a single attachment by its ID."""
    url = f"{GRAPH}/users/{MAILBOX}/messages/{msg_id}/attachments/{att_id}"
    data = _graph_get(url, token)
    raw = data.get("contentBytes")
    if not raw:
        log.error("contentBytes missing even on individual fetch | file=%s | att_id=%s", att_name, att_id)
        return None
    return base64.b64decode(raw)


async def process_and_save_invoice_async(unread_filepath: Path, filename: str, original_filename: str, entity_id: str, sender: str, subject: str) -> bool:
    from app.database.database import SessionLocal
    from app.models.db_models import Invoice, InvoiceStatusEnum, InvoiceStatusHistory, WorkflowStep, WorkflowStepTypeEnum, WorkflowStepStatusEnum, RawExtractionData
    from app.repository.repositories import invoice_repo, workflow_step_repo, raw_extraction_repo
    from app.services.invoice_processor import InvoiceProcessor
    from app.utils.date_utils import get_ist_now
    from app.database.db_utils import serialize_json_field
    from app.services.audit_service import audit_service
    from app.models.audit_log import AuditAction
    from app.ai.duplicate_detector import get_vendor_id_from_master
    from app.utils.invoice_registry import check_registry_duplicate, register_invoice
    from app.utils.currency_utils import remove_currency_format
    from app.routes.invoices import parse_date_safely
    import uuid
    import time

    db = SessionLocal()
    request_id = str(uuid.uuid4())
    
    # Target paths
    read_filepath = READ_DIR / filename
    in_progress_filepath = Path("uploads/in_progress_files") / filename
    
    invoice_id = None
    processor = None
    try:
        # Create initial DB record
        new_invoice = Invoice(
            filename=filename,
            original_filename=original_filename,
            file_path=str(in_progress_filepath),  # Store as in_progress_files path in DB
            uploaded_by="system",
            status=InvoiceStatusEnum.UPLOADING,
            entity=entity_id,
            uploaded_at=get_ist_now(),
            posting_date=get_ist_now().date(),
            extracted_data=serialize_json_field({}),
            processing_steps=serialize_json_field([]),
        )
        
        history_item = InvoiceStatusHistory(
            status=InvoiceStatusEnum.UPLOADING,
            user="system",
            timestamp=get_ist_now()
        )
        new_invoice.status_history.append(history_item)
        invoice_repo.create(db, obj_in=new_invoice)
        invoice_id = new_invoice.id
        db.commit()

        # Run extraction
        processor = InvoiceProcessor()
        extraction = await processor.process_invoice_extraction(str(unread_filepath))
        
        extracted_data = extraction.get("extracted_data", {})
        raw_azure_response = extraction.get("raw_azure_full", {})
        
        new_invoice.extracted_data = serialize_json_field(extracted_data)
        new_invoice.processing_steps = serialize_json_field(extraction.get("processing_steps", []))
        new_invoice.validation_results = serialize_json_field(extraction.get("validation_results", {}))
        new_invoice.confidence_score = extraction.get("metadata", {}).get("confidence_score", "low")
        new_invoice.processed_at = get_ist_now()
        
        # Save raw extraction
        with open(unread_filepath, "rb") as f:
            pdf_bytes = f.read()
        raw_record = RawExtractionData(
            invoice_id=invoice_id,
            pdf_binary=pdf_bytes,
            raw_azure_response=serialize_json_field(raw_azure_response),
            llm_prompt=extraction.get("llm_prompt"),
            llm_raw_response=extraction.get("llm_raw_response")
        )
        raw_extraction_repo.create(db, obj_in=raw_record)

        # Resolve vendor
        vendor_info = extracted_data.get("vendor_info", {})
        extracted_vendor = vendor_info.get("name", {}).get("value")
        extracted_address = vendor_info.get("address", {}).get("value")
        
        if extracted_vendor or extracted_address:
            new_invoice.azure_vendor_name = extracted_vendor
            new_invoice.azure_vendor_address = extracted_address
            res_v_id, res_v_name, res_v_grouping, vendor_details = get_vendor_id_from_master(db, extracted_vendor, entity_id, extracted_address)
            if res_v_id:
                new_invoice.vendor_id = res_v_id
                new_invoice.vendor_name = res_v_name
                new_invoice.line_grouping = res_v_grouping
                new_invoice.vendor_details = serialize_json_field(vendor_details)
                
                if "vendor_info" not in extracted_data:
                    extracted_data["vendor_info"] = {}
                extracted_data["vendor_info"]["vendor_id"] = {"value": res_v_id}
                extracted_data["vendor_info"]["name"] = {"value": res_v_name}
                new_invoice.extracted_data = serialize_json_field(extracted_data)

        # Populate numeric columns
        amounts = extracted_data.get("amounts", {})
        total_val = amounts.get("total_invoice_amount", {}).get("value")
        due_val = amounts.get("amount_due", {}).get("value")
        new_invoice.total_amount = remove_currency_format(total_val)
        new_invoice.amount_due = remove_currency_format(due_val)

        # Populate dates & invoice details
        invoice_details = extracted_data.get("invoice_details", {})
        invoice_dt_val = invoice_details.get("invoice_date", {}).get("value")
        due_dt_val = invoice_details.get("due_date", {}).get("value")
        new_invoice.invoice_date = parse_date_safely(invoice_dt_val)
        new_invoice.due_date = parse_date_safely(due_dt_val)
        
        extracted_invoice_num = invoice_details.get("invoice_number", {}).get("value")
        if extracted_invoice_num:
            new_invoice.invoice_number = extracted_invoice_num
            
        if "exchange_rate" in invoice_details:
            try:
                new_invoice.exchange_rate = float(invoice_details.get("exchange_rate", {}).get("value"))
            except (ValueError, TypeError):
                pass

        # Move file locally from unread to read folder
        shutil.move(str(unread_filepath), str(read_filepath))
        log.info(f"Moved file locally to: {read_filepath}")

        # Upload the file to Azure Blob Storage under 'in_progress_files/'
        from common.services.azure_blob import upload_file_to_blob, get_blob_name_from_path
        blob_name = get_blob_name_from_path(str(in_progress_filepath))
        upload_file_to_blob(str(read_filepath), blob_name)
        log.info(f"Uploaded successfully to Azure Blob: {blob_name}")

        # Create workflow step
        workflow_step = WorkflowStep(
            invoice_id=invoice_id,
            step_name="Processed",
            step_type=WorkflowStepTypeEnum.PROCESSED,
            user="system",
            status=WorkflowStepStatusEnum.COMPLETED,
            timestamp=get_ist_now(),
            entity=entity_id
        )
        workflow_step_repo.create(db, obj_in=workflow_step)
        
        # Log action
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id,
            action=AuditAction.UPLOADED,
            user="system",
            entity=entity_id,
            details={"filename": filename}
        )

        # Register in lookup registry
        final_vendor_id = new_invoice.vendor_id
        final_invoice_number = new_invoice.invoice_number
        if final_vendor_id and final_invoice_number:
            register_invoice(
                db,
                vendor_id=final_vendor_id,
                invoice_number=final_invoice_number,
                entity=entity_id,
                invoice_id=invoice_id,
                uploaded_by="system"
            )

        new_invoice.status = InvoiceStatusEnum.PROCESSED
        processed_history = InvoiceStatusHistory(
            status=InvoiceStatusEnum.PROCESSED,
            user="system",
            timestamp=get_ist_now()
        )
        new_invoice.status_history.append(processed_history)
        db.commit()
        return True

    except Exception as e:
        db.rollback()
        log.error(f"Error processing invoice DB record for {filename}: {e}")
        # Clean up database record
        try:
            if invoice_id is not None:
                invoice_repo.remove(db, id=invoice_id)
                db.commit()
        except:
            pass
            
        error_msg = str(e)
        if "No invoice found in the document" in error_msg:
            # Move file locally from unread to non_invoice
            non_invoice_filepath = NON_INVOICE_DIR / filename
            try:
                shutil.move(str(unread_filepath), str(non_invoice_filepath))
                log.info(f"Moved non-invoice file locally to: {non_invoice_filepath}")
                
                # Upload to Azure Blob Storage under 'non_invoice/'
                from common.services.azure_blob import upload_file_to_blob, get_blob_name_from_path
                blob_name = get_blob_name_from_path(str(non_invoice_filepath))
                upload_file_to_blob(str(non_invoice_filepath), blob_name)
                log.info(f"Uploaded non-invoice file to Azure Blob: {blob_name}")
            except Exception as move_err:
                log.error(f"Failed to move or upload non-invoice file: {move_err}")
            return False  # This counts as handled (it is not an invoice)
        else:
            # Raise exception so the caller marks it as failed and retries
            raise e
    finally:
        db.close()
        if processor:
            try:
                await processor.close()
            except Exception as close_err:
                log.error(f"Failed to close processor: {close_err}")

async def download_invoice_attachments(start_time: float, processing_window_seconds: float) -> None:
    """Download all unread invoice attachments and process PDFs within the allowed window.

    Args:
        start_time: Loop reference time from asyncio event-loop clock.
        processing_window_seconds: Hard deadline (in seconds) after start_time by which
            no NEW file processing must be started.  Any file already running is allowed
            to finish.  Files not started before the deadline stay in the unread folder
            and will be picked up on the next cycle.
    """
    log.info("=" * 60)
    log.info("Invoice download run started")

    token = get_token()
    messages = _fetch_all_unread_with_attachments(token)

    log.info("Unread emails with attachments found: %d", len(messages))

    pdf_queue = []

    total_downloaded = 0
    total_skipped = 0
    total_failed = 0

    if messages:
        for msg in messages:
            msg_id = msg["id"]
            subject = msg.get("subject") or "No Subject"
            sender = (msg.get("from") or {}).get("emailAddress", {}).get("address", "unknown")
            received = msg.get("receivedDateTime", "unknown")

            log.info("-" * 50)
            log.info("Email | from=%s | subject=%s | received=%s", sender, subject, received)

            # Refresh token before each message so long runs never hit expiry.
            token = get_token()

            try:
                att_list_url = (
                    f"{GRAPH}/users/{MAILBOX}/messages/{msg_id}/attachments"
                    "?$select=id,name,contentType,size,isInline"
                )
                attachments = _graph_get(att_list_url, token).get("value", [])
            except Exception as exc:
                log.error("Failed to list attachments | subject=%s | error=%s", subject, exc)
                total_failed += 1
                continue

            log.info("Attachments in this email: %d", len(attachments))

            # Keeps duplicate attachment names deterministic within this email.
            per_message_name_count: dict[str, int] = {}

            msg_downloaded = 0
            msg_failed = 0
            msg_skipped = 0

            for att in attachments:
                att_type = att.get("@odata.type")
                if att_type and att_type != "#microsoft.graph.fileAttachment":
                    log.debug("Skipped (not a file attachment) | type=%s", att_type)
                    continue

                is_inline = att.get("isInline", False)
                if is_inline:
                    log.info("Skipped inline attachment (signature image/logo) | file=%s", att.get("name"))
                    continue

                att_id = att["id"]
                filename = safe_filename(att.get("name") or "attachment")
                att_size = att.get("size", 0)

                datestamp = _format_datestamp(received)
                unique_key = f"{Path(filename).stem.lower()}|{datestamp}|{safe_filename(subject).lower()}"
                per_message_name_count[unique_key] = per_message_name_count.get(unique_key, 0) + 1

                output_name = _build_output_filename(
                    original_name=filename,
                    datestamp=datestamp,
                    subject=subject,
                    duplicate_index=per_message_name_count[unique_key],
                )
                unread_filepath = UNREAD_DIR / output_name

                if unread_filepath.exists() or (READ_DIR / output_name).exists() or (NON_INVOICE_DIR / output_name).exists():
                    log.info("Already exists in staging folders, skipping download | file=%s", output_name)
                    msg_downloaded += 1
                    total_downloaded += 1
                    
                    # Queue for processing if it is a PDF and exists in the unread folder
                    if unread_filepath.exists() and output_name.lower().endswith(".pdf"):
                        pdf_queue.append({
                            "unread_filepath": unread_filepath,
                            "filename": output_name,
                            "original_filename": filename,
                            "entity_id": ENTITY_ID,
                            "sender": sender,
                            "subject": subject
                        })
                    continue

                log.debug("Downloading to unread folder | file=%s | size=%d bytes", output_name, att_size)

                try:
                    content = _fetch_attachment_bytes(msg_id, att_id, filename, token)

                    if content is None:
                        msg_failed += 1
                        total_failed += 1
                        continue

                    with open(unread_filepath, "wb") as fh:
                        fh.write(content)

                    log.info("Downloaded to UNREAD | file=%s", unread_filepath)

                    if output_name.lower().endswith(".pdf"):
                        pdf_queue.append({
                            "unread_filepath": unread_filepath,
                            "filename": output_name,
                            "original_filename": filename,
                            "entity_id": ENTITY_ID,
                            "sender": sender,
                            "subject": subject
                        })
                        msg_downloaded += 1
                        total_downloaded += 1
                    else:
                        # Non-PDF: move to non_invoice directly
                        non_invoice_filepath = NON_INVOICE_DIR / output_name
                        shutil.move(str(unread_filepath), str(non_invoice_filepath))
                        log.info("Non-PDF file moved to non_invoice | file=%s", non_invoice_filepath)
                        
                        # Upload to Azure Blob Storage under 'non_invoice/'
                        from common.services.azure_blob import upload_file_to_blob, get_blob_name_from_path
                        blob_name = get_blob_name_from_path(str(non_invoice_filepath))
                        try:
                            upload_file_to_blob(str(non_invoice_filepath), blob_name)
                            log.info(f"Uploaded non-pdf file to Azure Blob: {blob_name}")
                        except Exception as upload_err:
                            log.error(f"Failed to upload non-pdf file to Azure Blob: {upload_err}")
                            
                        msg_skipped += 1
                        total_skipped += 1

                except Exception as exc:
                    log.error(
                        "Download failed | file=%s | from=%s | subject=%s | error=%s",
                        filename, sender, subject, exc,
                    )
                    msg_failed += 1
                    total_failed += 1

            # Only mark as read when every eligible attachment succeeded/handled.
            if msg_failed > 0:
                log.warning(
                    "NOT marking as read (%d failures) — will retry next run | subject=%s",
                    msg_failed, subject,
                )
            else:
                try:
                    _graph_patch(
                        f"{GRAPH}/users/{MAILBOX}/messages/{msg_id}",
                        token,
                        {"isRead": True},
                    )
                    log.info("Marked as read | subject=%s | from=%s", subject, sender)
                except Exception as exc:
                    log.error("Failed to mark as read | subject=%s | error=%s", subject, exc)

    # Scan unread directory for any other leftover PDF files from previous aborted runs
    import glob
    existing_pdfs = glob.glob(os.path.join(str(UNREAD_DIR), "*.pdf"))
    queued_paths = {str(item["unread_filepath"]) for item in pdf_queue}
    for pdf_path_str in existing_pdfs:
        pdf_path = Path(pdf_path_str)
        if pdf_path_str not in queued_paths:
            log.info("Found leftover PDF in UNREAD folder, queueing for processing: %s", pdf_path.name)
            pdf_queue.append({
                "unread_filepath": pdf_path,
                "filename": pdf_path.name,
                "original_filename": pdf_path.name,
                "entity_id": ENTITY_ID,
                "sender": "unknown",
                "subject": "leftover"
            })

    # ---------------------------------------------------------------------------
    # Phase 2: Process queued PDFs — hard deadline enforced BEFORE each new file
    # ---------------------------------------------------------------------------
    # Rule: once elapsed >= processing_window_seconds we must NOT start any new
    # file.  The current file (if any) is allowed to finish naturally.
    # Files not started will remain in the unread folder and be picked up next
    # cycle automatically.
    if pdf_queue:
        log.info("=" * 60)
        log.info(
            "Starting processing of %d queued invoice file(s). "
            "Hard cutoff in %.0f s.",
            len(pdf_queue), processing_window_seconds,
        )

        loop = asyncio.get_event_loop()
        skipped_count = 0

        for index, item in enumerate(pdf_queue):
            elapsed = loop.time() - start_time

            if elapsed >= processing_window_seconds:
                # Hard stop — do NOT start this file or any that follow.
                skipped_count = len(pdf_queue) - index
                log.warning(
                    "Processing window expired (elapsed: %.1fs / %.1fs). "
                    "Skipping %d remaining file(s) — they will be processed next cycle.",
                    elapsed, processing_window_seconds, skipped_count,
                )
                break

            log.info(
                "Processing file %d/%d: %s (elapsed: %.1fs / %.1fs)",
                index + 1, len(pdf_queue), item["filename"],
                elapsed, processing_window_seconds,
            )
            try:
                await process_and_save_invoice_async(
                    unread_filepath=item["unread_filepath"],
                    filename=item["filename"],
                    original_filename=item["original_filename"],
                    entity_id=item["entity_id"],
                    sender=item["sender"],
                    subject=item["subject"]
                )
            except Exception as e:
                log.error(
                    "Processing failed | file=%s | error=%s",
                    item["filename"], e
                )

    log.info("=" * 60)
    log.info(
        "Run complete | downloaded=%d | skipped=%d | failed=%d",
        total_downloaded, total_skipped, total_failed,
    )

async def main():
    """Periodic entry-point.

    Timing model (example: interval=15 min, margin=4 min)
    ─────────────────────────────────────────────────────
    T+00:00  Run starts  → download emails + begin processing
    T+11:00  Hard cutoff → do NOT start any new file (11 = interval − margin)
    T+11:xx  Last in-flight file finishes naturally
    T+15:00  Rest period ends → next run starts (sleep fills remaining time)

    Environment variables
    ─────────────────────
    MAIL_CHECK_INTERVAL_MINUTES  Total cycle length in minutes  (default 15)
    MAIL_CHECK_MARGIN_MINUTES    Mandatory rest period in minutes (default 4)
    """
    # Ensure Azure Blob Storage container and folders exist
    try:
        from common.services.azure_blob import ensure_container_and_folders
        ensure_container_and_folders()
    except Exception as e:
        log.error(f"Failed to initialize Azure container/folders: {e}")

    interval_str = os.getenv("MAIL_CHECK_INTERVAL_MINUTES", "15")
    try:
        interval_minutes = float(interval_str)
    except ValueError:
        interval_minutes = 15.0

    margin_minutes = float(os.getenv("MAIL_CHECK_MARGIN_MINUTES", "4.0"))

    # Hard processing window: no new file must be STARTED after this many seconds.
    processing_window_seconds = max(0.0, (interval_minutes - margin_minutes) * 60.0)
    interval_seconds = interval_minutes * 60.0

    log.info(
        "Starting periodic mail check | cycle=%.1f min | processing window=%.1f min | rest=%.1f min",
        interval_minutes, interval_minutes - margin_minutes, margin_minutes,
    )

    loop = asyncio.get_event_loop()

    while True:
        start_time = loop.time()

        try:
            await download_invoice_attachments(start_time, processing_window_seconds)
        except Exception as e:
            log.error("Unhandled error in download_invoice_attachments: %s", e)

        # Always sleep whatever time remains to reach the full interval boundary.
        # This guarantees the mandatory rest period is always honoured even if
        # processing finished early.
        elapsed = loop.time() - start_time
        sleep_time = max(1.0, interval_seconds - elapsed)
        log.info(
            "Cycle finished (elapsed: %.1fs). Resting for %.1fs (%.2f min) before next run.",
            elapsed, sleep_time, sleep_time / 60.0,
        )
        await asyncio.sleep(sleep_time)


if __name__ == "__main__":
    asyncio.run(main())
