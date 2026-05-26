import asyncio
import os
import shutil
import logging
from datetime import datetime, timedelta
from app.database.database import SessionLocal
from app.utils.settings import get_app_settings
from app.models.db_models import (
    Invoice, InvoiceStatusEnum, EntityMaster, InvoiceStatusHistory, 
    WorkflowStep, WorkflowStepTypeEnum, WorkflowStepStatusEnum, RawExtractionData
)
from app.services.invoice_processor import InvoiceProcessor
from app.repository.repositories import invoice_repo, workflow_step_repo, raw_extraction_repo
from app.utils.date_utils import get_ist_now
from app.services.file_manager import get_folder_path
from app.ai.duplicate_detector import get_vendor_id_from_master
from app.utils.invoice_registry import check_registry_duplicate, register_invoice
from app.database.db_utils import serialize_json_field
from app.utils.currency_utils import remove_currency_format
from app.services.audit_service import audit_service
from app.models.audit_log import AuditAction
from app.routes.invoices import parse_date_safely

logger = logging.getLogger("application_trace")

# Global variables to track the scheduler
cronjob_task = None
keep_running = True
last_run_time = None

async def process_cronjob_file(src_path: str, entity: str, folder_dir: str, idx: int):
    filename = os.path.basename(src_path)
    print(f"----------------------------------------------")
    print(f"{idx}. cronjon Start - {filename}")
    name, ext = os.path.splitext(filename)
    timestamp = get_ist_now().strftime("%Y%m%d_%H%M%S")
    new_name = f"{name}_{timestamp}{ext}"
    
    upload_dir = get_folder_path("in_progress")
    os.makedirs(upload_dir, exist_ok=True)
    dest_path = os.path.join(upload_dir, new_name)
    
    # Move file from source folder to application uploads folder
    try:
        shutil.move(src_path, dest_path)
        logger.info(f"[Cronjob] Moved file {filename} from {src_path} to {dest_path}")
    except Exception as move_err:
        logger.error(f"[Cronjob] Failed to move {filename} from {src_path} to {dest_path}: {move_err}")
        print(f"{idx}. cronjon issused- {filename}")
        return
        
    db = SessionLocal()
    invoice_id = None
    try:
        # Create Invoice record in DB
        new_invoice = Invoice(
            filename=new_name,
            original_filename=filename,
            file_path=dest_path,
            uploaded_by="cronjob",
            status=InvoiceStatusEnum.UPLOADING,
            entity=entity,
            uploaded_at=get_ist_now(),
            posting_date=get_ist_now().date(),
            extracted_data=serialize_json_field({}),
            processing_steps=serialize_json_field([]),
        )
        
        # Initial Status History
        history_item = InvoiceStatusHistory(
            status=InvoiceStatusEnum.UPLOADING,
            user="cronjob",
            timestamp=get_ist_now()
        )
        new_invoice.status_history.append(history_item)
        
        invoice_repo.create(db, obj_in=new_invoice)
        invoice_id = new_invoice.id
        db.commit()
        
        logger.info(f"[Cronjob] Created DB record for {filename} (ID: {invoice_id})")
        
        # Run Extraction
        invoice_processor = InvoiceProcessor()
        extraction = await invoice_processor.process_invoice_extraction(dest_path)
        
        extracted_data = extraction.get("extracted_data", {})
        
        # Save raw extraction record
        try:
            with open(dest_path, "rb") as pdf_file:
                pdf_bytes = pdf_file.read()
            raw_record = RawExtractionData(
                invoice_id=invoice_id,
                pdf_binary=pdf_bytes,
                raw_azure_response=serialize_json_field(extraction.get("raw_azure_full", {})),
                llm_prompt=extraction.get("llm_prompt"),
                llm_raw_response=extraction.get("llm_raw_response")
            )
            raw_extraction_repo.create(db, obj_in=raw_record)
        except Exception as raw_err:
            logger.warning(f"[Cronjob] Failed to save raw extraction data for {invoice_id}: {raw_err}")
            
        # Update Invoice details
        new_invoice.extracted_data = serialize_json_field(extracted_data)
        new_invoice.processing_steps = serialize_json_field(extraction.get("processing_steps", []))
        new_invoice.validation_results = serialize_json_field(extraction.get("validation_results", {}))
        new_invoice.confidence_score = extraction.get("metadata", {}).get("confidence_score", "low")
        new_invoice.processed_at = get_ist_now()
        
        # Vendor matching
        vendor_info = extracted_data.get("vendor_info", {})
        extracted_vendor = vendor_info.get("name", {}).get("value")
        extracted_address = vendor_info.get("address", {}).get("value")
        
        current_line_grouping = "No"
        if extracted_vendor or extracted_address:
            new_invoice.azure_vendor_name = extracted_vendor
            new_invoice.azure_vendor_address = extracted_address
            
            invoice_details = extracted_data.get("invoice_details", {})
            if "exchange_rate" in invoice_details:
                try:
                    new_invoice.exchange_rate = float(invoice_details.get("exchange_rate", {}).get("value"))
                except (ValueError, TypeError):
                    pass
                    
            res_v_id, res_v_name, res_v_grouping, vendor_details = get_vendor_id_from_master(db, extracted_vendor, entity, extracted_address)
            if res_v_id:
                new_invoice.vendor_id = res_v_id
                new_invoice.vendor_name = res_v_name
                new_invoice.line_grouping = res_v_grouping
                new_invoice.vendor_details = serialize_json_field(vendor_details)
                current_line_grouping = res_v_grouping
                
                if "vendor_info" not in extracted_data:
                    extracted_data["vendor_info"] = {}
                extracted_data["vendor_info"]["vendor_id"] = {"value": res_v_id}
                extracted_data["vendor_info"]["name"] = {"value": res_v_name}
                new_invoice.extracted_data = serialize_json_field(extracted_data)
                
        if not new_invoice.invoice_number:
            invoice_details = extracted_data.get("invoice_details", {})
            extracted_invoice_num = invoice_details.get("invoice_number", {}).get("value")
            if extracted_invoice_num:
                new_invoice.invoice_number = extracted_invoice_num
                
        # Line grouping
        if current_line_grouping == "Yes":
            items = extracted_data.get("Items", {}).get("value", [])
            if items and not new_invoice.original_items:
                import copy
                new_invoice.original_items = serialize_json_field(copy.deepcopy(items))
                
            if items:
                from app.services.line_grouping import aggregate_items
                aggregated_items = aggregate_items(items)
                extracted_data["Items"]["value"] = [aggregated_items]
                new_invoice.extracted_data = serialize_json_field(extracted_data)
                
        # Amounts
        amounts = extracted_data.get("amounts", {})
        total_val = amounts.get("total_invoice_amount", {}).get("value")
        due_val = amounts.get("amount_due", {}).get("value")
        new_invoice.total_amount = remove_currency_format(total_val)
        new_invoice.amount_due = remove_currency_format(due_val)
        
        # Sanitize amounts
        if isinstance(extracted_data, dict) and "amounts" in extracted_data:
            for amt_key in ["total_invoice_amount", "total_amount_payable", "amount_due", "total_tax_amount", "total_service_tax_amount"]:
                if amt_key in extracted_data["amounts"]:
                    val_obj = extracted_data["amounts"][amt_key]
                    if isinstance(val_obj, dict) and "value" in val_obj:
                          clean_val = remove_currency_format(val_obj["value"])
                          if clean_val is not None:
                              val_obj["value"] = str(clean_val)
        new_invoice.extracted_data = serialize_json_field(extracted_data)
        
        # Dates
        invoice_details = extracted_data.get("invoice_details", {})
        invoice_dt_val = invoice_details.get("invoice_date", {}).get("value")
        due_dt_val = invoice_details.get("due_date", {}).get("value")
        new_invoice.invoice_date = parse_date_safely(invoice_dt_val)
        new_invoice.due_date = parse_date_safely(due_dt_val)
        
        db.commit()
        
        # Post-extraction duplicate check
        final_vendor_id = new_invoice.vendor_id
        final_invoice_number = new_invoice.invoice_number
        if final_vendor_id and final_invoice_number:
            existing_duplicate = check_registry_duplicate(db, final_vendor_id, final_invoice_number, entity)
            if existing_duplicate and str(existing_duplicate.get("id")) != str(invoice_id):
                uploaded_date = existing_duplicate.get("uploaded_at")
                date_str = str(uploaded_date)[:16] if uploaded_date else "N/A"
                new_invoice.duplicate_info = serialize_json_field({
                    "is_duplicate": True,
                    "reason": f"Duplicate (Full): Vendor {new_invoice.vendor_name or final_vendor_id}, Invoice #{final_invoice_number} (Uploaded {date_str})",
                    "original_invoice_id": str(existing_duplicate.get("id"))
                })
                db.commit()
                
        # Workflow step
        workflow_step = WorkflowStep(
            invoice_id=invoice_id,
            step_name="Processed",
            step_type=WorkflowStepTypeEnum.PROCESSED,
            user="cronjob",
            status=WorkflowStepStatusEnum.COMPLETED,
            timestamp=get_ist_now(),
            entity=entity
        )
        workflow_step_repo.create(db, obj_in=workflow_step)
        
        # Audit log
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id,
            action=AuditAction.UPLOADED,
            user="cronjob",
            entity=entity,
            details={"filename": filename, "source": "cronjob"}
        )
        
        # Fast registry
        if final_vendor_id and final_invoice_number:
            register_invoice(
                db,
                vendor_id=final_vendor_id,
                invoice_number=final_invoice_number,
                entity=entity,
                invoice_id=invoice_id,
                uploaded_by="cronjob"
            )
            
        # Update final status to PROCESSED
        new_invoice.status = InvoiceStatusEnum.PROCESSED
        processed_history = InvoiceStatusHistory(
            status=InvoiceStatusEnum.PROCESSED,
            user="cronjob",
            timestamp=get_ist_now()
        )
        new_invoice.status_history.append(processed_history)
        db.commit()
        logger.info(f"[Cronjob] Successfully processed invoice {filename} (ID: {invoice_id})")
        print(f"{idx}. cronjon OVer- {filename}")
        
    except Exception as err:
        logger.error(f"[Cronjob] Error processing invoice {filename}: {err}")
        print(f"{idx}. cronjon issused- {filename}")
        db.rollback()
        
        # Clean up DB record if it failed during processing
        if invoice_id is not None:
            try:
                invoice_repo.remove(db, id=invoice_id)
                db.commit()
                logger.info(f"[Cronjob] Cleaned up DB record for failed invoice ID: {invoice_id}")
            except Exception as clean_err:
                logger.error(f"[Cronjob] Failed to clean up DB record for failed invoice: {clean_err}")
                
        # Move failed file to a failed/ subfolder in the watcher directory
        try:
            failed_dir = os.path.join(folder_dir, "failed")
            os.makedirs(failed_dir, exist_ok=True)
            failed_dest = os.path.join(failed_dir, filename)
            # Try to move from dest_path (uploads/in_progress_files)
            if os.path.exists(dest_path):
                shutil.move(dest_path, failed_dest)
            elif os.path.exists(src_path):
                shutil.move(src_path, failed_dest)
            logger.info(f"[Cronjob] Moved failed invoice {filename} to failed folder: {failed_dest}")
        except Exception as move_err:
            logger.error(f"[Cronjob] Failed to move failed invoice file {filename} to failed directory: {move_err}")
    finally:
        db.close()

async def run_cronjob_import(folder_dir: str, entity: str = "DEFAULT"):
    logger.info(f"[Cronjob] Starting scan of directory: {folder_dir} for entity: {entity}")
    if not os.path.exists(folder_dir) or not os.path.isdir(folder_dir):
        logger.error(f"[Cronjob] Watcher directory does not exist or is not a directory: {folder_dir}")
        return
        
    try:
        files = [f for f in os.listdir(folder_dir) if os.path.isfile(os.path.join(folder_dir, f))]
    except Exception as e:
        logger.error(f"[Cronjob] Error listing directory {folder_dir}: {e}")
        return
        
    supported_exts = {'.pdf', '.png', '.jpg', '.jpeg', '.tiff'}
    invoice_files = [f for f in files if os.path.splitext(f)[1].lower() in supported_exts]
    
    if not invoice_files:
        logger.info(f"[Cronjob] No invoices found to watch in {folder_dir}")
        return
        
    logger.info(f"[Cronjob] Found {len(invoice_files)} invoice file(s) to process")
        
    for idx, filename in enumerate(invoice_files, 1):
        src_path = os.path.join(folder_dir, filename)
        
        # Check size stability to avoid processing files currently being written/copied
        try:
            size_1 = os.path.getsize(src_path)
            await asyncio.sleep(1)
            size_2 = os.path.getsize(src_path)
            if size_1 != size_2:
                logger.info(f"[Cronjob] File {filename} is still being written, skipping for this cycle.")
                continue
        except Exception as e:
            logger.error(f"[Cronjob] Error checking file size stability for {filename}: {e}")
            continue
            
        await process_cronjob_file(src_path, entity, folder_dir, idx)
        
    print("cronjon completed for current seeesion")

async def run_cronjob_loop():
    global last_run_time, keep_running
    logger.info("[Cronjob] Watcher background task loop initialized")
    
    # Initial sleep of 10s on startup
    await asyncio.sleep(10)
    
    while keep_running:
        try:
            db = SessionLocal()
            try:
                settings = get_app_settings(db)
            except Exception as e:
                logger.error(f"[Cronjob] Error loading settings from database: {e}")
                settings = {}
            finally:
                db.close()
                
            cron_config = settings.get("cronjob_config", {})
            enabled = cron_config.get("enabled", False)
            folder_directory = cron_config.get("folder_directory", "")
            interval_minutes = int(cron_config.get("interval_minutes", 5))
            entity_id = cron_config.get("entity_id", "DEFAULT")
            
            # Enforce at least 1 minute interval to prevent lockups
            interval_minutes = max(1, interval_minutes)
            
            if enabled and folder_directory:
                now = datetime.now()
                should_run = False
                if last_run_time is None:
                    should_run = True
                else:
                    elapsed = now - last_run_time
                    if elapsed >= timedelta(minutes=interval_minutes):
                        should_run = True
                        
                if should_run:
                    last_run_time = now
                    await run_cronjob_import(folder_directory, entity_id)
            else:
                # Reset last_run_time if disabled so it runs instantly once re-enabled
                last_run_time = None
                
        except Exception as loop_err:
            logger.error(f"[Cronjob] Exception in scheduler watch loop: {loop_err}")
            
        # Check configuration every 10 seconds
        await asyncio.sleep(10)

def start_cronjob_task():
    global cronjob_task
    cronjob_task = asyncio.create_task(run_cronjob_loop())
    logger.info("[Cronjob] Background scheduler task started")
