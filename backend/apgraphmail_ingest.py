import os
import sys
import re
import logging
import logging.handlers
from datetime import datetime
from pathlib import Path
import shutil
import asyncio
import glob
from dotenv import load_dotenv

load_dotenv()

TOOL = os.getenv("TOOL", "sage")

MAILBOX_ENV = os.getenv("MAILBOX", "")
if "|" in MAILBOX_ENV:
    MAILBOX, parsed_entity = MAILBOX_ENV.split("|", 1)
    ENTITY_ID = parsed_entity if TOOL == "sage" else "DEFAULT"
else:
    MAILBOX = MAILBOX_ENV
    ENTITY_ID = "201" if TOOL == "sage" else "DEFAULT"

UNREAD_DIR = Path("uploads/unread")
READ_DIR = Path("uploads/read")
NON_INVOICE_DIR = Path("uploads/non_invoice")

UNREAD_DIR.mkdir(parents=True, exist_ok=True)
READ_DIR.mkdir(parents=True, exist_ok=True)
NON_INVOICE_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Logging — writes to both console (INFO) and rotating file (DEBUG)
# ---------------------------------------------------------------------------

def _setup_logging() -> logging.Logger:
    logger = logging.getLogger("apgraphmail_ingest")
    if logger.handlers:
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
# Core Ingestion Logic
# ---------------------------------------------------------------------------

async def process_and_save_invoice_async(unread_filepath: Path, filename: str, original_filename: str, entity_id: str, sender: str, subject: str) -> bool:
    from common.database.database import SessionLocal
    from common.models.db_models import Invoice, InvoiceStatusEnum, InvoiceStatusHistory, WorkflowStep, WorkflowStepTypeEnum, WorkflowStepStatusEnum, RawExtractionData
    from common.repository.repositories import invoice_repo, workflow_step_repo, raw_extraction_repo
    from common.services.invoice_processor import InvoiceProcessor
    from common.utils.date_utils import get_ist_now
    from common.database.db_utils import serialize_json_field
    from common.services.audit_service import audit_service
    from common.models.audit_log import AuditAction
    from common.ai.duplicate_detector import get_vendor_id_from_master
    from common.utils.invoice_registry import register_invoice
    from common.utils.currency_utils import remove_currency_format
    from common.routes.invoices import parse_date_safely
    import uuid

    db = SessionLocal()
    
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

        # Upload the file to Azure Blob Storage under 'in_progress_files/'
        from common.services.azure_blob import upload_file_to_blob, get_blob_name_from_path
        blob_name = get_blob_name_from_path(str(in_progress_filepath))
        upload_file_to_blob(str(unread_filepath), blob_name)
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

        # Move file locally from unread to read folder ONLY after successful commit
        try:
            shutil.move(str(unread_filepath), str(read_filepath))
            log.info(f"Moved file locally to: {read_filepath}")
        except Exception as move_err:
            log.error(f"Failed to move file locally to read folder: {move_err}")

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
            return False
        else:
            raise e
    finally:
        db.close()
        if processor:
            try:
                await processor.close()
            except Exception as close_err:
                log.error(f"Failed to close processor: {close_err}")


async def ingest_invoices(start_time: float, processing_window_seconds: float) -> None:
    """Scan and process PDF invoice attachments within the allowed window."""
    log.info("=" * 60)
    log.info("Invoice ingestion run started")

    existing_pdfs = glob.glob(os.path.join(str(UNREAD_DIR), "*.pdf"))
    if not existing_pdfs:
        log.info("No PDF files found in UNREAD folder to process.")
        return

    pdf_queue = []
    for pdf_path_str in existing_pdfs:
        pdf_path = Path(pdf_path_str)
        pdf_queue.append({
            "unread_filepath": pdf_path,
            "filename": pdf_path.name,
            "original_filename": pdf_path.name,
            "entity_id": ENTITY_ID,
            "sender": "unknown",
            "subject": "leftover"
        })

    log.info("Found %d PDF file(s) in UNREAD folder, starting processing. Hard cutoff in %.0f s.",
             len(pdf_queue), processing_window_seconds)

    loop = asyncio.get_event_loop()
    total_processed = 0
    total_failed = 0

    for index, item in enumerate(pdf_queue):
        elapsed = loop.time() - start_time

        if elapsed >= processing_window_seconds:
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
            success = await process_and_save_invoice_async(
                unread_filepath=item["unread_filepath"],
                filename=item["filename"],
                original_filename=item["original_filename"],
                entity_id=item["entity_id"],
                sender=item["sender"],
                subject=item["subject"]
            )
            if success:
                total_processed += 1
            else:
                total_failed += 1
        except Exception as e:
            log.error(
                "Processing failed | file=%s | error=%s",
                item["filename"], e
            )
            total_failed += 1

    log.info("=" * 60)
    log.info(
        "Run complete | processed=%d | failed=%d",
        total_processed, total_failed,
    )


async def main():
    try:
        from common.services.azure_blob import ensure_container_and_folders
        ensure_container_and_folders()
    except Exception as e:
        log.error(f"Failed to initialize Azure container/folders: {e}")
        sys.exit(1)

    interval_str = os.getenv("INGEST_INTERVAL_MINUTES", "11")
    try:
        interval_minutes = float(interval_str)
    except ValueError:
        interval_minutes = 11.0

    margin_minutes = float(os.getenv("INGEST_MARGIN_MINUTES", "2.0"))
    processing_window_seconds = max(0.0, (interval_minutes - margin_minutes) * 60.0)

    log.info(
        "Starting invoice ingestion check | cycle=%.1f min | processing window=%.1f min | rest=%.1f min",
        interval_minutes, interval_minutes - margin_minutes, margin_minutes,
    )

    loop = asyncio.get_event_loop()
    start_time = loop.time()

    try:
        await ingest_invoices(start_time, processing_window_seconds)
    except Exception as e:
        log.error("Unhandled error in ingest_invoices: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
