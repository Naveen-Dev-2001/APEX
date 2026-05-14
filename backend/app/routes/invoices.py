from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status, BackgroundTasks
import logging
from fastapi.responses import FileResponse
from typing import List
from app.services.invoice_processor import InvoiceProcessor
from app.services.line_grouping import aggregate_items
from app.models.invoice import InvoiceCreate, InvoiceResponse, InvoiceStatus, InvoiceUpdate, InvoicePaginatedResponse
from app.models.workflow import WorkflowStepType, WorkflowStepStatus
from app.database.database import get_db, SessionLocal

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, exists, func, cast, Date, DateTime
from app.middleware.logger import logger
error_logger = logging.getLogger("application_error")
from fastapi import Query
from fastapi.responses import StreamingResponse
import json
from typing import Dict, Optional, Any
from app.services.email_service import email_service



from app.models.db_models import (
    Invoice, WorkflowStep, WorkflowStepTypeEnum, 
    WorkflowStepStatusEnum, InvoiceStatusEnum, InvoiceStatusHistory,
    VendorMetadata, RawExtractionData, User, EntityMaster, InvoiceAssignedApprover,
    DeletedInvoice, Delegation
)
from app.services.file_manager import init_upload_folders, move_invoice_file, find_file_in_any_folder, get_folder_path
init_upload_folders()
from app.routes.approval_new import StepType
from app.repository.repositories import (
    invoice_repo, workflow_step_repo, invoice_status_history_repo,
    user_repo, entity_repo, vendor_metadata_repo, raw_extraction_repo,
    deleted_invoice_repo
)

from app.database.db_utils import (
    invoice_to_dict, serialize_json_field, deserialize_json_field
)
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from datetime import datetime, date
from decimal import Decimal
import os
import uuid
import asyncio
import traceback
from app.services.audit_service import audit_service
from app.models.audit_log import AuditAction
from dateutil import parser
from app.utils.date_utils import get_ist_now

def remove_currency_format(value):
    if not value or value == "" or value == "N/A":
        return None
    try:
        # Remove commas and $ symbols
        clean_val = str(value).replace(',', '').replace('$', '').strip()
        if not clean_val:
            return None
        return float(clean_val)
    except (ValueError, TypeError):
        return None

def parse_date_safely(value):
    if not value or value == "" or value == "N/A":
        return None
    try:
        if isinstance(value, datetime):
            return value.date()
        # Parse common date formats
        dt = parser.parse(str(value))
        return dt.date()
    except (ValueError, TypeError, parser.ParserError):
        return None


def _flatten_emails(items):
    """Refined helper to extract a flat list of emails from strings or JSON-encoded lists."""
    if not items:
        return []
    res = []
    if isinstance(items, str):
        items = [items]
    
    for item in items:
        if not item:
            continue
        if isinstance(item, list):
            res.extend(_flatten_emails(item))
        elif isinstance(item, str):
            item = item.strip()
            if item.startswith("[") and item.endswith("]"):
                try:
                    parsed = json.loads(item)
                    if isinstance(parsed, list):
                        res.extend(_flatten_emails(parsed))
                    else:
                        res.append(item.lower())
                except:
                    res.append(item.lower())
            else:
                res.append(item.lower())
    return list(set(res)) # deduplicate and return

def _apply_status_label_filters(status_vals, expressions, db):
    """Transform human-readable status labels back to SQLAlchemy expressions."""
    if not isinstance(status_vals, list):
        status_vals = [status_vals]
    
    conditions = []
    actual_statuses = []
    
    for val in status_vals:
        val_str = str(val)
        if val_str.startswith("Waiting for approver "):
            try:
                level_str = val_str.replace("Waiting for approver ", "").strip()
                level = int(level_str)
                
                # Logic: Waiting for approver 1/2 always matches those levels (if not last)
                # For levels 3+, it only matches if it's a finance level.
                max_level_sq = db.query(func.max(InvoiceAssignedApprover.sequence_order)).filter(
                    InvoiceAssignedApprover.invoice_id == Invoice.id
                ).correlate(Invoice).scalar_subquery()
                
                is_threshold_sq = exists().where(
                    and_(
                        InvoiceAssignedApprover.invoice_id == Invoice.id,
                        InvoiceAssignedApprover.sequence_order == level,
                        InvoiceAssignedApprover.is_finance == False
                    )
                )
                
                if level in [1, 2]:
                    # For levels 1 and 2, we don't care about the is_finance flag for the label
                    conditions.append(
                        and_(
                            Invoice.status == InvoiceStatusEnum.WAITING_APPROVAL,
                            Invoice.current_approver_level == level,
                            Invoice.current_approver_level != max_level_sq
                        )
                    )
                else:
                    # For levels 3+, only match if it's NOT a threshold level
                    conditions.append(
                        and_(
                            Invoice.status == InvoiceStatusEnum.WAITING_APPROVAL,
                            Invoice.current_approver_level == level,
                            Invoice.current_approver_level != max_level_sq,
                            ~is_threshold_sq
                        )
                    )
            except:
                actual_statuses.append(val)
        elif val_str == "Waiting for threshold approver":
            max_level_sq = db.query(func.max(InvoiceAssignedApprover.sequence_order)).filter(
                InvoiceAssignedApprover.invoice_id == Invoice.id
            ).correlate(Invoice).scalar_subquery()
            
            is_threshold_sq = exists().where(
                and_(
                    InvoiceAssignedApprover.invoice_id == Invoice.id,
                    InvoiceAssignedApprover.sequence_order == Invoice.current_approver_level,
                    InvoiceAssignedApprover.is_finance == False
                )
            )
            
            conditions.append(
                and_(
                    Invoice.status == InvoiceStatusEnum.WAITING_APPROVAL,
                    Invoice.current_approver_level != max_level_sq,
                    Invoice.current_approver_level > 2, # Threshold label only for 3+
                    is_threshold_sq
                )
            )
        elif val_str == "Waiting for posting approver":
            max_level_sq = db.query(func.max(InvoiceAssignedApprover.sequence_order)).filter(
                InvoiceAssignedApprover.invoice_id == Invoice.id
            ).correlate(Invoice).scalar_subquery()
            
            conditions.append(
                and_(
                    Invoice.status == InvoiceStatusEnum.WAITING_APPROVAL,
                    Invoice.current_approver_level == max_level_sq
                )
            )
        else:
            # Map back other labels if they were changed
            reverse_map = {
                "Posted to Sage": "sage_posted",
                "Sage Post Failed": "sage_post_failed",
                "Waiting For Coding": "waiting_coding",
                "Reworked": "reworked",
                "Archived": "archived",
                "Approved": "approved",
                "Rejected": "rejected",
                "Processed": "processed",
                "Pending": "pending"
            }
            mapped_val = reverse_map.get(val_str, val_str)
            actual_statuses.append(mapped_val)
            
    if actual_statuses:
        conditions.append(Invoice.status.in_(actual_statuses))
        
    if conditions:
        expressions.append(or_(*conditions))

router = APIRouter()
invoice_processor = InvoiceProcessor()

# Global dictionary to hold asyncio queues for each upload task (progress tracking)
upload_progress_queues: Dict[str, asyncio.Queue] = {}
cancelled_tasks = set()

@router.get("/upload-progress/{task_id}")
async def get_upload_progress(task_id: str):
    async def event_stream():
        if task_id not in upload_progress_queues:
            upload_progress_queues[task_id] = asyncio.Queue()
        queue = upload_progress_queues[task_id]
        try:
            while True:
                message = await queue.get()
                yield f"data: {json.dumps(message)}\n\n"
                if message.get("status") in ("completed", "error"):
                    break
        except asyncio.CancelledError:
            print(f"[Backend] Client disconnected from progress stream {task_id}")
        finally:
            if task_id in upload_progress_queues:
                del upload_progress_queues[task_id]

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/cancel-upload/{task_id}")
async def cancel_upload(task_id: str):
    cancelled_tasks.add(task_id)
    print(f"[Backend] Task {task_id} marked for cancellation")
    return {"status": "cancelled", "task_id": task_id}


@router.post("/check-duplicate")
async def check_duplicate_invoice_endpoint(
    payload: dict,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: Session = Depends(get_db)
):
    from app.utils.invoice_registry import check_registry_duplicate
    from app.ai.duplicate_detector import check_duplicate_invoice

    vendor_id = payload.get("vendor_id")
    invoice_number = payload.get("invoice_number")
    current_invoice_id = payload.get("current_invoice_id")
    
    if not vendor_id or not invoice_number:
         return {"is_duplicate": False}

    # 1. Try Fast Registry Lookup
    existing = check_registry_duplicate(db, vendor_id, invoice_number, entity)
    
    # 2. Fallback to Direct Collection Lookup (if registry empty or out of sync)
    if not existing:
        existing = check_duplicate_invoice(db, vendor_id, invoice_number, entity)

    if existing:
        # Check if it is the SAME invoice
        if current_invoice_id and str(existing.get("id")) == str(current_invoice_id):
             return {"is_duplicate": False}
             
        uploaded_date = existing.get("uploaded_at")
        date_str = uploaded_date.strftime("%Y-%m-%d %H:%M") if uploaded_date else "N/A"
        
        return {
            "is_duplicate": True,
            "message": f"Duplicate found: Vendor '{existing.get('vendor_name', vendor_id)}', Invoice #{invoice_number} (Uploaded {date_str})",
            "original_invoice_id": str(existing.get("id"))
        }

    return {"is_duplicate": False}

@router.post("/upload")
async def upload_invoices(
    files: List[UploadFile] = File(...),
    task_id: Optional[str] = Query(None),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: Session = Depends(get_db)
):
    from app.ai.duplicate_detector import (
        get_vendor_id_from_master
    )
    from app.utils.invoice_registry import check_registry_duplicate, register_invoice
    upload_dir = get_folder_path("in_progress")
    os.makedirs(upload_dir, exist_ok=True)
    
    # 🔁 Sequential Processing: invoices are processed one at a time

    duplicates = []  # Track duplicate files
    saved_invoices = []  # Track successfully uploaded invoices
    failed_uploads = []  # Track failed uploads

    queue = upload_progress_queues.get(task_id) if task_id else None

    async def emit_progress(status, message, data=None, progress=0):
        if queue:
            await queue.put({"status": status, "message": message, "data": data, "progress": progress})

    async def _process_single_file(file: UploadFile, index: int, total_files: int):
        # ⚡️ Isolated DB Session per Task
        task_db = SessionLocal()
        request_id = str(uuid.uuid4())
        clean_name = file.filename.replace("\\", "/").split("/")[-1]
        
        await emit_progress("processing", f"[{index}/{total_files}] Starting processing for {clean_name}...", progress=25)

        clean_name = file.filename.replace("\\", "/").split("/")[-1]
        file_path = None
        try:
            import time
            total_start = time.time()

            logger.info({
            "request_id": request_id,
            "event": "file_processing_started",
            "filename": clean_name,
            "user": current_user.username,
            "entity": entity
            })
            
            # ---- CLEAN FILENAME ----
            clean_name = file.filename.replace("\\", "/").split("/")[-1]

            # split filename and extension
            name, ext = os.path.splitext(clean_name)

            # create timestamp
            timestamp = get_ist_now().strftime("%Y%m%d_%H%M%S")

            # new filename
            new_name = f"{name}_{timestamp}{ext}"

            file_path = os.path.join(upload_dir, new_name)

            # ---- SAVE FILE ----
            save_start = time.time()
            contents = await file.read()
            with open(file_path, "wb") as f:
                f.write(contents)
            print(f"[Backend] File saved in {time.time() - save_start:.2f}s: {file_path}")
            await emit_progress("processing", f"[{index}/{total_files}] Processing file...", progress=50)


            logger.info({
            "request_id": request_id,
            "stage": "file_saved",
            "file_path": file_path,
            "size_bytes": len(contents)
            })




            # ---- CHECK CANCELLATION AFTER SAVE ----
            if task_id in cancelled_tasks:
                if file_path and os.path.exists(file_path):
                    os.remove(file_path)
                return {"success": False, "filename": clean_name, "reason": "cancelled"}

            # ---- CREATE DB RECORD (INITIAL) ----
            new_invoice = Invoice(
                filename=new_name,
                original_filename=clean_name,
                file_path=file_path,
                uploaded_by=current_user.username,
                status=InvoiceStatusEnum.PROCESSED,
                entity=entity,
                uploaded_at=get_ist_now(),
                posting_date=get_ist_now().date(),
                extracted_data=serialize_json_field({}),
                processing_steps=serialize_json_field([]),
            )
            
            # Initial Status History
            history_item = InvoiceStatusHistory(
                status=InvoiceStatusEnum.PROCESSED,
                user=current_user.username,
                timestamp=get_ist_now()
            )
            new_invoice.status_history.append(history_item)
            
            db_start = time.time()
            invoice_repo.create(task_db, obj_in=new_invoice)
            invoice_id = new_invoice.id
            print(f"[Backend] Initial DB record created in {time.time() - db_start:.2f}s: {invoice_id}")
            logger.info({
            "request_id": request_id,
            "stage": "db_record_created",
            "invoice_id": invoice_id
            })

            # ---- CHECK CANCELLATION AFTER DB RECORD ----
            if task_id in cancelled_tasks:
                if file_path and os.path.exists(file_path):
                    os.remove(file_path)
                invoice_repo.remove(task_db, id=invoice_id)
                task_db.commit()
                return {"success": False, "filename": clean_name, "reason": "cancelled"}

            # ---- RUN EXTRACTION ----
            extract_start = time.time()
            print(f"[Backend] Starting full extraction for {invoice_id}")
            extraction = await invoice_processor.process_invoice_extraction(file_path)
            extract_time = time.time() - extract_start
            print(f"[Backend] Full extraction completed in {extract_time:.2f}s")

            # ---- CHECK CANCELLATION AFTER EXTRACTION ----
            if task_id in cancelled_tasks:
                if file_path and os.path.exists(file_path):
                    os.remove(file_path)
                invoice_repo.remove(task_db, id=invoice_id)
                task_db.commit()
                return {"success": False, "filename": clean_name, "reason": "cancelled"}

            await emit_progress("processing", f"[{index}/{total_files}] Extracting data...", progress=75)

            # Extract key values from Azure response
            extracted_data = extraction.get("extracted_data", {})

            raw_azure_response = extraction.get("raw_azure_full", {})
            
            # Extract raw OCR text from Azure response
            raw_ocr_text = ""
            if raw_azure_response and "content" in raw_azure_response:
                raw_ocr_text = raw_azure_response.get("content", "")
            
            # Log raw OCR text separately
            logger.info({
                "request_id": request_id,
                "stage": "azure_ocr_text_extracted",
                "invoice_id": invoice_id,
                "raw_ocr_text": raw_ocr_text
            })
            
            # Log structured extraction data separately
            logger.info({
                "request_id": request_id,
                "stage": "azure_extraction_completed",
                "invoice_id": invoice_id,
                "duration_sec": extract_time,
                "confidence_score": extraction.get("metadata", {}).get("confidence_score"),
                "azure_extracted_data": extracted_data
            })
            
            # ---- LLM LOGGING ----
            # Log LLM metadata
            logger.info({
                "request_id": request_id,
                "stage": "llm_invocation",
                "prompt_length": len(extraction.get("llm_prompt", "")),
                "response_length": len(str(extraction.get("llm_raw_response", "")))
            })
            
            # Log LLM response values separately
            logger.info({
                "request_id": request_id,
                "stage": "llm_response_values",
                "llm_response": extraction.get("llm_raw_response", "")
            })

            # ---- SAVE RAW EXTRACTION DATA ----
            try:
                raw_start = time.time()
                # Read PDF binary
                with open(file_path, "rb") as f:
                    pdf_bytes = f.read()
                
                raw_record = RawExtractionData(
                    invoice_id=invoice_id,
                    pdf_binary=pdf_bytes,
                    raw_azure_response=serialize_json_field(extraction.get("raw_azure_full", {})),
                    llm_prompt=extraction.get("llm_prompt"),
                    llm_raw_response=extraction.get("llm_raw_response")
                )
                raw_extraction_repo.create(task_db, obj_in=raw_record)
                print(f"[Backend] Raw extraction data and PDF binary saved in {time.time() - raw_start:.2f}s")
                logger.info({
                    "request_id": request_id,
                    "stage": "raw_extraction_persisted",
                    "invoice_id": invoice_id
                })

            except Exception as e:
                print(f"[Backend] Warning: Failed to save raw extraction data: {e}")
                # Don't fail the whole upload if this part fails
                logger.warning({
                    "request_id": request_id,
                    "stage": "raw_extraction_save_failed",
                    "error": str(e)
                })

            # Update invoice instance with extraction results
            new_invoice.extracted_data = serialize_json_field(extraction.get("extracted_data", {}))
            new_invoice.processing_steps = serialize_json_field(extraction.get("processing_steps", []))
            new_invoice.validation_results = serialize_json_field(extraction.get("validation_results", {}))
            new_invoice.confidence_score = extraction.get("metadata", {}).get("confidence_score", "low")
            new_invoice.processed_at = get_ist_now()

            logger.info({
                "request_id": request_id,
                "stage": "structured_extraction_completed",
                "invoice_id": invoice_id,
                "confidence_score": new_invoice.confidence_score
            })
            
            # Update vendor_id and vendor_name from full extraction
            extracted_data = extraction.get("extracted_data", {})
            current_line_grouping = "No"
            
            # Resolve vendor from master data
            vendor_info = extracted_data.get("vendor_info", {})
            extracted_vendor = vendor_info.get("name", {}).get("value")
            extracted_address = vendor_info.get("address", {}).get("value")
            
            if extracted_vendor or extracted_address:
                new_invoice.azure_vendor_name = extracted_vendor
                new_invoice.azure_vendor_address = extracted_address
                
                # Check for exchange rate
                invoice_details = extracted_data.get("invoice_details", {})
                if "exchange_rate" in invoice_details:
                    try:
                        new_invoice.exchange_rate = float(invoice_details.get("exchange_rate", {}).get("value"))
                    except (ValueError, TypeError):
                        pass

                vendor_start = time.time()
                res_v_id, res_v_name, res_v_grouping, vendor_details = get_vendor_id_from_master(task_db, extracted_vendor, entity, extracted_address)
                print(f"[Backend] Vendor matching completed in {time.time() - vendor_start:.2f}s")
                if res_v_id:
                    new_invoice.vendor_id = res_v_id
                    new_invoice.vendor_name = res_v_name
                    new_invoice.line_grouping = res_v_grouping
                    new_invoice.vendor_details = serialize_json_field(vendor_details)
                    current_line_grouping = res_v_grouping
                    
                    # Sync to extracted_data for frontend consistency
                    if "vendor_info" not in extracted_data:
                        extracted_data["vendor_info"] = {}
                    extracted_data["vendor_info"]["vendor_id"] = {"value": res_v_id}
                    extracted_data["vendor_info"]["name"] = {"value": res_v_name}
                    new_invoice.extracted_data = serialize_json_field(extracted_data)
                    await emit_progress("processing", f"[{index}/{total_files}] Finalizing...", progress=100)
            
                logger.info({
                    "request_id": request_id,
                    "stage": "vendor_matching_completed",
                    "vendor_matching_details": {
                        "azure_extracted_vendor": extracted_vendor,
                        "azure_extracted_address": extracted_address,
                        "matched_vendor_id": res_v_id,
                        "matched_vendor_name": res_v_name,
                        "line_grouping": res_v_grouping,
                        "vendor_details": vendor_details
                    }
                })

            if not new_invoice.invoice_number:
                # Try to get invoice number from extraction
                invoice_details = extracted_data.get("invoice_details", {})
                extracted_invoice_num = invoice_details.get("invoice_number", {}).get("value")
                if extracted_invoice_num:
                    new_invoice.invoice_number = extracted_invoice_num

            # ---- LINE GROUPING LOGIC ----
            if current_line_grouping == "Yes":
                # ---- LINE GROUPING LOGIC (NON-DESTRUCTIVE) ----
                # ---- PRESERVE ORIGINAL ITEMS (FIRST, ALWAYS) ----
                items = extracted_data.get("Items", {}).get("value", [])

                if items and not new_invoice.original_items:
                    import copy
                    new_invoice.original_items = serialize_json_field(copy.deepcopy(items))

                if current_line_grouping == "Yes" and items:
                    from app.services.line_grouping import aggregate_items
                    aggregated_items = aggregate_items(items)
                    extracted_data["Items"]["value"] = [aggregated_items]
                    new_invoice.extracted_data = serialize_json_field(extracted_data)

                else:
                    # Restore original items when grouping is No
                    original_items = deserialize_json_field(new_invoice.original_items) or items
                    extracted_data["Items"]["value"] = original_items
                    new_invoice.extracted_data = serialize_json_field(extracted_data)
            
            # Populate numeric columns for filtering/sorting
            amounts = extracted_data.get("amounts", {})
            total_val = amounts.get("total_invoice_amount", {}).get("value")
            due_val = amounts.get("amount_due", {}).get("value")
            
            new_invoice.total_amount = remove_currency_format(total_val)
            new_invoice.amount_due = remove_currency_format(due_val)

            # Populate date columns for filtering/sorting
            invoice_dt_val = invoice_details.get("invoice_date", {}).get("value")
            due_dt_val = invoice_details.get("due_date", {}).get("value")
            
            new_invoice.invoice_date = parse_date_safely(invoice_dt_val)
            new_invoice.due_date = parse_date_safely(due_dt_val)

            task_db.commit()

            # ---- POST-EXTRACTION DUPLICATE CHECK (Fallback) ----
            # If quick extraction failed, check for duplicates after full extraction
            final_vendor_id = new_invoice.vendor_id
            final_invoice_number = new_invoice.invoice_number
            
            if final_vendor_id and final_invoice_number:
                # Check if this combination already exists (excluding current invoice)
                # Note: check_registry_duplicate now returns dict from invoice_to_dict
                existing_duplicate = check_registry_duplicate(task_db, final_vendor_id, final_invoice_number, entity)
                
                if existing_duplicate and str(existing_duplicate.get("id")) != str(invoice_id):
                     # Duplicate found AFTER extraction - Flag it
                    uploaded_date = existing_duplicate.get("uploaded_at")
                    date_str = str(uploaded_date)[:16] if uploaded_date else "N/A"
                    
                    new_invoice.duplicate_info = serialize_json_field({
                         "is_duplicate": True,
                         "reason": f"Duplicate (Full): Vendor {new_invoice.vendor_name or final_vendor_id}, Invoice #{final_invoice_number} (Uploaded {date_str})",
                         "original_invoice_id": str(existing_duplicate.get("id"))
                    })
                    task_db.commit()
                    logger.info({
                        "request_id": request_id,
                        "stage": "duplicate_check_completed",
                        "vendor_id": final_vendor_id,
                        "invoice_number": final_invoice_number,
                        "is_duplicate": bool(existing_duplicate)
                    })

            # ---- CREATE WORKFLOW STEP: PROCESSED ----
            workflow_step = WorkflowStep(
                invoice_id=invoice_id,
                step_name="Processed",
                step_type=WorkflowStepTypeEnum.PROCESSED,
                user=current_user.username,
                status=WorkflowStepStatusEnum.COMPLETED,
                timestamp=get_ist_now(),
                entity=entity
            )
            workflow_step_repo.create(task_db, obj_in=workflow_step)

            logger.info({
                "request_id": request_id,
                "stage": "workflow_step_created",
                "invoice_id": invoice_id
            })
            
            # [AUDIT] Log Upload (Passing DB Session)
            await audit_service.log_action(
                db=task_db,
                invoice_id=invoice_id, 
                action=AuditAction.UPLOADED, 
                user=current_user.username,
                entity=entity,
                details={"filename": clean_name}
            )

            # ---- REGISTER IN FAST LOOKUP REGISTRY ----
            final_vendor_id = new_invoice.vendor_id
            final_invoice_number = new_invoice.invoice_number
            
            if final_vendor_id and final_invoice_number:
                reg_start = time.time()
                register_invoice(
                    task_db,
                    vendor_id=final_vendor_id,
                    invoice_number=final_invoice_number,
                    entity=entity,
                    invoice_id=invoice_id,
                    uploaded_by=current_user.username
                )
                print(f"[Backend] Registered in fast lookup registry in {time.time() - reg_start:.2f}s")

            print(f"[Backend] TOTAL processing for {invoice_id} completed in {time.time() - total_start:.2f}s")
            # ✅ 6️⃣ SUCCESS LOGGER (ADD HERE)
            total_time = round(time.time() - total_start, 2)

            logger.info({
                "request_id": request_id,
                "event": "invoice_processing_completed",
                "invoice_id": invoice_id,
                "total_time_sec": total_time
            })
            await emit_progress("processing", f"[{index}/{total_files}] Completed processing {clean_name}!", progress=100)

            return {"success": True, "data": invoice_to_dict(new_invoice)}

        except Exception as e:
            # ❌ FAILURE LOGGER (ADD HERE)
            print(f"[Backend] ERROR in _process_single_file for {clean_name}: {str(e)}")
            traceback.print_exc()
            
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except:
                    pass

            logger.error({
                "request_id": request_id,
                "event": "invoice_processing_failed",
                "filename": clean_name,
                "error": str(e)
            }, exc_info=True)
            await emit_progress("processing", f"[{index}/{total_files}] Failed processing {clean_name}: {str(e)}")

            return {"success": False, "filename": clean_name, "reason": str(e)}
        finally:
            task_db.close()

    # If task_id is provided, register queue (already done above)
    if task_id and task_id not in upload_progress_queues:
         upload_progress_queues[task_id] = asyncio.Queue()
         queue = upload_progress_queues[task_id]

    await emit_progress("processing", f"Starting upload for {len(files)} files...")

    # 🔁 Sequential Processing: process one invoice at a time
    total_files = len(files)
    try:
        for idx, file in enumerate(files):
            # Check for cancellation before processing each file
            if task_id in cancelled_tasks:
                print(f"[Backend] Task {task_id} cancelled. Stopping at file {idx+1}/{total_files}")
                # Note: We don't remove from cancelled_tasks here, we'll do it in finally
                await emit_progress("error", f"Upload cancelled by user.", progress=0)
                break

            try:
                res = await _process_single_file(file, idx + 1, total_files)
                if res["success"]:
                    saved_invoices.append(res["data"])
                elif res.get("reason") == "cancelled":
                    print(f"[Backend] File {idx+1} processing aborted due to cancellation")
                    break
                else:
                    failed_uploads.append({"filename": res["filename"], "reason": res["reason"]})
            except Exception as e:
                failed_uploads.append({"filename": "unknown", "reason": f"System Error: {str(e)}"})
    finally:
        # Cleanup cancellation flag if it exists (in case it wasn't caught in the loop)
        if task_id in cancelled_tasks:
            cancelled_tasks.remove(task_id)

    await emit_progress("completed", f"Finished uploading {len(files)} files.")

    return {
        "count": len(saved_invoices),
        "invoices": saved_invoices,
        "failed": failed_uploads
    }


@router.get("/", response_model=InvoicePaginatedResponse)
async def get_invoices(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    skip: int = 0,
    limit: int = 15,
    search: str = None,
    filters: Optional[str] = Query(None),
    sort_by: str = "uploaded_at",
    sort_dir: str = "desc",
    show_all: bool = True,
    tab: Optional[str] = Query(None), # in_progress, posted_stage, archive
    db: Session = Depends(get_db)
):
    repo_filters = {"entity": entity}
    

    from sqlalchemy.orm import joinedload
    user_email = current_user.email.lower()
    user_dept = (current_user.department or "").lower()
    user_roles = [r.strip().lower() for r in (current_user.role or "user").split(",")]
    is_finance_user = "finance" in user_dept and "non" not in user_dept
    is_admin = "admin" in user_roles
    is_coder = "coder" in user_roles
    is_scanner = "scanner" in user_roles

    if is_finance_user or is_admin or is_coder or is_scanner:
        show_all = True  # Finance, Admin, Coders, and Scanners see all records

    if not show_all:
        repo_filters["uploaded_by"] = current_user.username

    expressions = []
    extra_filters = {}

    # Get active delegations for the current user
    curr_time = get_ist_now()
    active_delegations = db.query(Delegation.delegator_email).filter(
        Delegation.substitute_email.ilike(current_user.email),
        Delegation.entity == entity,
        Delegation.start_date <= curr_time,
        Delegation.end_date >= curr_time
    ).all()
    target_emails = [user_email] + [d[0].lower() for d in active_delegations]

    # Apply Tab-based filtering
    if tab == "posted_stage":
        expressions.append(Invoice.status == InvoiceStatusEnum.SAGE_POSTED)
    elif tab == "archive":
        expressions.append(Invoice.status == InvoiceStatusEnum.ARCHIVED)
    elif tab == "in_progress" or not tab:
        # Default view: Exclude Posted and Archived
        expressions.append(and_(
            Invoice.status != InvoiceStatusEnum.SAGE_POSTED,
            Invoice.status != InvoiceStatusEnum.ARCHIVED
        ))

    # Parse JSON filters if provided
    if filters:
        try:
            extra_filters = json.loads(filters)
            if isinstance(extra_filters, dict):
                # Handle virtual 'last_modified_by' filter
                if "last_modified_by" in extra_filters:
                    user_vals = extra_filters.pop("last_modified_by")
                    if not isinstance(user_vals, list):
                        user_vals = [user_vals]
                    
                    if user_vals:
                        # Search in workflow steps OR uploaded_by
                        step_exists = exists().where(
                            and_(
                                WorkflowStep.invoice_id == Invoice.id,
                                WorkflowStep.user.in_(user_vals)
                            )
                        )
                        uploader_match = Invoice.uploaded_by.in_(user_vals)
                        expressions.append(or_(step_exists, uploader_match))

                # Apply special coding_view logic if requested
                if extra_filters.get("coding_view"):

                    expressions.append(
                        or_(
                            Invoice.status == InvoiceStatusEnum.WAITING_CODING,
                            and_(
                                Invoice.status == InvoiceStatusEnum.WAITING_APPROVAL,
                                Invoice.current_approver_level == 1
                            ),
                            Invoice.status == InvoiceStatusEnum.REWORKED
                        )
                    )
                    del extra_filters["coding_view"]

                # Apply special approvals_view logic
                if extra_filters.get("approvals_view"):
                    # 1. Base eligibility: Current level match
                    # User is assigned to current level OR current level is a Finance level
                    
                    # Get active delegations for current level
                    # (Already calculated at top)

                    # Detect if this user is a THRESHOLD approver at a future level.
                    # Threshold levels are non-finance (is_finance=False) and not the last level
                    # (posting). Only these users are blocked from lower Finance Team levels.
                    # Posting approvers (last level) and regular finance users are NOT affected.
                    from sqlalchemy.orm import aliased
                    FutureApprover = aliased(InvoiceAssignedApprover)
                    # Compute max sequence_order (the posting/last level)
                    max_level_sq = db.query(
                        func.max(InvoiceAssignedApprover.sequence_order)
                    ).filter(
                        InvoiceAssignedApprover.invoice_id == Invoice.id
                    ).correlate(Invoice).scalar_subquery()

                    is_future_threshold_approver_subquery = exists().where(
                        and_(
                            FutureApprover.invoice_id == Invoice.id,
                            FutureApprover.approver_email.in_(target_emails),
                            FutureApprover.sequence_order > Invoice.current_approver_level,
                            FutureApprover.sequence_order < max_level_sq,  # not the posting level
                            FutureApprover.is_finance == False  # dedicated threshold slot
                        )
                    )

                    approver_subquery = exists().where(
                        and_(
                            InvoiceAssignedApprover.invoice_id == Invoice.id,
                            InvoiceAssignedApprover.sequence_order == Invoice.current_approver_level,
                            or_(
                                # 1. Specifically assigned (always allowed, includes delegates)
                                InvoiceAssignedApprover.approver_email.in_(target_emails),
                                # 2. Finance pool (only allowed if not a future threshold approver)
                                and_(
                                    InvoiceAssignedApprover.is_finance == True, 
                                    is_finance_user == True,
                                    ~is_future_threshold_approver_subquery
                                )
                            )
                        )
                    )
                    
                    # 2. Exclude if already acted in current cycle
                    # Find the timestamp of the most recent 'reset' event (rework or recall)
                    last_reset_subquery = db.query(func.max(WorkflowStep.timestamp)).filter(
                        WorkflowStep.invoice_id == Invoice.id,
                        WorkflowStep.step_type.in_([StepType.REWORKED, StepType.RECALLED])
                    ).correlate(Invoice).scalar_subquery()

                    # Identify if we are at the final stage (typically the Posting stage)
                    is_last_stage_subquery = db.query(func.max(InvoiceAssignedApprover.sequence_order)).filter(
                        InvoiceAssignedApprover.invoice_id == Invoice.id
                    ).correlate(Invoice).scalar_subquery()

                    # Strict check: User acted at ANY level (for mandatory/threshold)
                    user_acted_any_subquery = exists().where(
                        and_(
                            WorkflowStep.invoice_id == Invoice.id,
                            func.lower(WorkflowStep.user) == user_email,
                            WorkflowStep.step_type.in_([
                                StepType.LEVEL_APPROVED,
                                StepType.APPROVED,
                                StepType.REJECTED,
                                StepType.THRESHOLD_APPROVED,
                                StepType.POSTING_APPROVED
                            ]),
                            or_(
                                last_reset_subquery == None,
                                WorkflowStep.timestamp > last_reset_subquery
                            )
                        )
                    )

                    # Stage-specific check: User acted specifically at the Posting stage
                    user_acted_posting_subquery = exists().where(
                        and_(
                            WorkflowStep.invoice_id == Invoice.id,
                            func.lower(WorkflowStep.user) == user_email,
                            WorkflowStep.step_type == StepType.POSTING_APPROVED,
                            or_(
                                last_reset_subquery == None,
                                WorkflowStep.timestamp > last_reset_subquery
                            )
                        )
                    )

                    # Combine: Hide if...
                    # - We are NOT at the last stage AND user has acted at any level
                    # - OR we ARE at the last stage AND user has already done a Posting Approval
                    hide_condition = or_(
                        and_(
                            Invoice.current_approver_level != is_last_stage_subquery,
                            user_acted_any_subquery
                        ),
                        and_(
                            Invoice.current_approver_level == is_last_stage_subquery,
                            user_acted_posting_subquery
                        )
                    )

                    expressions.append(
                        and_(
                            or_(
                                Invoice.status == InvoiceStatusEnum.WAITING_APPROVAL,
                                Invoice.status == InvoiceStatusEnum.REWORKED
                            ),
                            approver_subquery,
                            # Block ONLY threshold approvers from seeing the invoice at lower
                            # Finance Team levels.
                            ~is_future_threshold_approver_subquery,
                            ~hide_condition
                        )
                    )
                    del extra_filters["approvals_view"]

                # Handle mm-dd-yyyy date filters
                to_delete = []
                for k, v in extra_filters.items():
                    col_attr = getattr(Invoice, k, None)
                    if col_attr is not None and hasattr(col_attr, "type"):
                        from sqlalchemy import Date as SADate, DateTime as SADateTime, cast
                        if isinstance(col_attr.type, (SADate, SADateTime)):
                            vals = v if isinstance(v, list) else [v]
                            try:
                                parsed_dates = [datetime.strptime(str(x), "%m-%d-%Y").date() for x in vals]
                                from sqlalchemy import cast, Date
                                expressions.append(cast(col_attr, Date).in_(parsed_dates))
                                to_delete.append(k)
                            except:
                                # Not a date string, skip custom handling
                                pass
                for k in to_delete:
                    del extra_filters[k]

                # Special handling for status with labels
                if "status" in extra_filters:
                    _apply_status_label_filters(extra_filters.pop("status"), expressions, db)

                # Special handling for virtual column: next_approver
                if "next_approver" in extra_filters:
                    vals = extra_filters["next_approver"]
                    if not isinstance(vals, list): vals = [vals]
                    
                    conditions = []
                    # Pre-fetch user map for name-to-email resolution
                    user_map_rev = {u.username.lower(): u.email.lower() for u in db.query(User).all() if u.username}
                    
                    for val in vals:
                        if not val: continue
                        if val == "Finance Team":
                            conditions.append(
                                and_(
                                    Invoice.status == InvoiceStatusEnum.WAITING_APPROVAL,
                                    exists().where(
                                        and_(
                                            InvoiceAssignedApprover.invoice_id == Invoice.id,
                                            InvoiceAssignedApprover.sequence_order == Invoice.current_approver_level,
                                            InvoiceAssignedApprover.is_finance == True
                                        )
                                    )
                                )
                            )
                        elif val == "Completed":
                            conditions.append(Invoice.status.in_([InvoiceStatusEnum.SAGE_POSTED, InvoiceStatusEnum.APPROVED]))
                        elif val == "Rejected":
                            conditions.append(Invoice.status == InvoiceStatusEnum.REJECTED)
                        else:
                            # Try to match name to email from user table
                            email = user_map_rev.get(val.lower())
                            
                            # Build the subquery condition
                            if email:
                                approver_cond = InvoiceAssignedApprover.approver_email == email
                            else:
                                # Fallback: match by email prefix (common for auto-generated names)
                                approver_cond = InvoiceAssignedApprover.approver_email.ilike(f"{val}@%")
                            
                            conditions.append(
                                and_(
                                    Invoice.status == InvoiceStatusEnum.WAITING_APPROVAL,
                                    exists().where(
                                        and_(
                                            InvoiceAssignedApprover.invoice_id == Invoice.id,
                                            InvoiceAssignedApprover.sequence_order == Invoice.current_approver_level,
                                            approver_cond
                                        )
                                    )
                                )
                            )
                    
                    if conditions:
                        expressions.append(or_(*conditions))
                    del extra_filters["next_approver"]

                # Convert list of values to list if they're not already
                for k, v in extra_filters.items():
                    if isinstance(v, list):
                        repo_filters[k] = v
                    else:
                        repo_filters[k] = v
        except Exception as e:
            print(f"Error parsing filters: {e}")
    
    # 3. Base Visibility Restriction for Non-Finance Approvers
    # (Applied if not already handled by approvals_view or coding_view)
    # We exempt Admins, Coders, and Scanners from this 'assigned-only' restriction.
    is_restricted_approver = not is_finance_user and not is_admin and not is_coder and not is_scanner
    
    if is_restricted_approver and not extra_filters.get("approvals_view") and not extra_filters.get("coding_view"):
        assigned_at_any_level_subquery = exists().where(
            and_(
                InvoiceAssignedApprover.invoice_id == Invoice.id,
                InvoiceAssignedApprover.approver_email.in_(target_emails)
            )
        )
        expressions.append(
            or_(
                Invoice.uploaded_by_id == current_user.id,
                assigned_at_any_level_subquery
            )
        )

    search_fields = ["invoice_number", "vendor_name", "vendor_id", "status", "filename"]
    
    paginated_res = invoice_repo.get_paginated(
        db,
        skip=skip,
        limit=limit,
        filters=repo_filters,
        search=search,
        search_fields=search_fields,
        order_by=sort_by,
        descending=(sort_dir.lower() == "desc"),
        expressions=expressions,
        options=[
            joinedload(Invoice.workflow_steps),
            joinedload(Invoice.assigned_approvers_list)
        ]
    )
    
    # Convert models to dicts (Minimal mode for list performance)
    user_map = {u.email.lower(): u.username for u in db.query(User).all()}
    data = [invoice_to_dict(inv, minimal=True, user_map=user_map) for inv in paginated_res["data"]]
    
    return {
        "data": data,
        "total": paginated_res["total"],
        "page": paginated_res["page"],
        "page_size": paginated_res["page_size"]
    }


@router.get("/filter-options")
async def get_invoice_filter_options(
    column: str,
    filters: Optional[str] = Query(None),
    tab: Optional[str] = Query(None),
    entity: str = Depends(get_current_entity),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns all unique values for a specific column in the invoices table, 
    filtered by the active entity and optionally by other active filters.
    """
    repo_filters = {"entity": entity}
    expressions = []

    # Apply Tab-based filtering (same logic as get_invoices)
    if tab == "posted_stage":
        expressions.append(Invoice.status == InvoiceStatusEnum.SAGE_POSTED)
    elif tab == "archive":
        expressions.append(Invoice.status == InvoiceStatusEnum.ARCHIVED)
    elif tab == "in_progress" or not tab:
        # Default view: Exclude Posted and Archived
        expressions.append(and_(
            Invoice.status != InvoiceStatusEnum.SAGE_POSTED,
            Invoice.status != InvoiceStatusEnum.ARCHIVED
        ))
    
    # Pre-calculate user info for complex filters (same as get_invoices)
    user_email = current_user.email.lower()
    user_dept = (current_user.department or "").lower()
    user_roles = [r.strip().lower() for r in (current_user.role or "user").split(",")]
    is_finance_user = "finance" in user_dept and "non" not in user_dept
    is_admin = "admin" in user_roles
    is_coder = "coder" in user_roles
    is_scanner = "scanner" in user_roles
    
    # Get active delegations for current level logic
    curr_time = get_ist_now()
    active_delegations = db.query(Delegation.delegator_email).filter(
        Delegation.substitute_email.ilike(current_user.email),
        Delegation.entity == entity,
        Delegation.start_date <= curr_time,
        Delegation.end_date >= curr_time
    ).all()
    target_emails = [user_email] + [d[0].lower() for d in active_delegations]
    if column == "last_modified_by":
        # Get unique users from workflow steps
        query = db.query(WorkflowStep.user).join(Invoice).filter(
            WorkflowStep.user != None,
            Invoice.entity == entity
        )
        for expr in expressions:
            query = query.filter(expr)
        
        step_users = query.distinct().all()
        
        options = set()
        for u in step_users:
            if u[0]: options.add(u[0])
            
        # Also add uploader names
        query_uploaders = db.query(Invoice.uploaded_by).filter(
            Invoice.entity == entity
        )
        for expr in expressions:
            query_uploaders = query_uploaders.filter(expr)
            
        uploaders = query_uploaders.distinct().all()
        for u in uploaders:
            if u[0]: options.add(u[0])
        
        return sorted([o for o in options if o], key=lambda x: str(x))

    if filters:
        try:
            extra_filters = json.loads(filters)
            if isinstance(extra_filters, dict):
                # Apply special coding_view logic
                if extra_filters.get("coding_view"):
                    expressions.append(
                        or_(
                            Invoice.status == InvoiceStatusEnum.WAITING_CODING,
                            and_(
                                Invoice.status == InvoiceStatusEnum.WAITING_APPROVAL,
                                Invoice.current_approver_level == 1
                            ),
                            Invoice.status == InvoiceStatusEnum.REWORKED
                        )
                    )
                    del extra_filters["coding_view"]

                # Apply special approvals_view logic
                if extra_filters.get("approvals_view"):
                    # Detect if this user is a THRESHOLD approver at a future level.
                    # Threshold levels are non-finance and not the last (posting) level.
                    from sqlalchemy.orm import aliased
                    FutureApproverFO = aliased(InvoiceAssignedApprover)
                    max_level_fo_sq = db.query(
                        func.max(InvoiceAssignedApprover.sequence_order)
                    ).filter(
                        InvoiceAssignedApprover.invoice_id == Invoice.id
                    ).correlate(Invoice).scalar_subquery()

                    is_future_threshold_approver_fo_subquery = exists().where(
                        and_(
                            FutureApproverFO.invoice_id == Invoice.id,
                            FutureApproverFO.approver_email.in_(target_emails),
                            FutureApproverFO.sequence_order > Invoice.current_approver_level,
                            FutureApproverFO.sequence_order < max_level_fo_sq,  # not the posting level
                            FutureApproverFO.is_finance == False  # dedicated threshold slot
                        )
                    )

                    approver_subquery = exists().where(
                        and_(
                            InvoiceAssignedApprover.invoice_id == Invoice.id,
                            InvoiceAssignedApprover.sequence_order == Invoice.current_approver_level,
                            or_(
                                InvoiceAssignedApprover.approver_email.in_(target_emails),
                                and_(
                                    InvoiceAssignedApprover.is_finance == True, 
                                    is_finance_user == True,
                                    ~is_future_threshold_approver_fo_subquery
                                )
                            )
                        )
                    )
                    
                    last_reset_subquery = db.query(func.max(WorkflowStep.timestamp)).filter(
                        WorkflowStep.invoice_id == Invoice.id,
                        WorkflowStep.step_type.in_([StepType.REWORKED, StepType.RECALLED])
                    ).correlate(Invoice).scalar_subquery()

                    is_last_stage_subquery = db.query(func.max(InvoiceAssignedApprover.sequence_order)).filter(
                        InvoiceAssignedApprover.invoice_id == Invoice.id
                    ).correlate(Invoice).scalar_subquery()

                    user_acted_any_subquery = exists().where(
                        and_(
                            WorkflowStep.invoice_id == Invoice.id,
                            func.lower(WorkflowStep.user) == user_email,
                            WorkflowStep.step_type.in_([
                                StepType.LEVEL_APPROVED,
                                StepType.APPROVED,
                                StepType.REJECTED,
                                StepType.THRESHOLD_APPROVED,
                                StepType.POSTING_APPROVED
                            ]),
                            or_(
                                last_reset_subquery == None,
                                WorkflowStep.timestamp > last_reset_subquery
                            )
                        )
                    )

                    user_acted_posting_subquery = exists().where(
                        and_(
                            WorkflowStep.invoice_id == Invoice.id,
                            func.lower(WorkflowStep.user) == user_email,
                            WorkflowStep.step_type == StepType.POSTING_APPROVED,
                            or_(
                                last_reset_subquery == None,
                                WorkflowStep.timestamp > last_reset_subquery
                            )
                        )
                    )

                    hide_condition = or_(
                        and_(
                            Invoice.current_approver_level != is_last_stage_subquery,
                            user_acted_any_subquery
                        ),
                        and_(
                            Invoice.current_approver_level == is_last_stage_subquery,
                            user_acted_posting_subquery
                        )
                    )

                    expressions.append(
                        and_(
                            or_(
                                Invoice.status == InvoiceStatusEnum.WAITING_APPROVAL,
                                Invoice.status == InvoiceStatusEnum.REWORKED
                            ),
                            approver_subquery,
                            # Block ONLY threshold approvers from seeing the invoice at lower
                            # Finance Team levels.
                            ~is_future_threshold_approver_fo_subquery,
                            ~hide_condition
                        )
                    )
                    del extra_filters["approvals_view"]

                # Special handling for status labels in filter-options
                if "status" in extra_filters:
                    _apply_status_label_filters(extra_filters.pop("status"), expressions, db)

                repo_filters.update(extra_filters)
        except Exception as e:
            print(f"Error parsing filters in filter-options: {e}")

    if column == "next_approver":
        # Get all invoices matching the current tab/filters
        query = db.query(Invoice).filter(Invoice.entity == entity)
        query = invoice_repo._apply_filters(query, repo_filters)
        for expr in expressions:
            query = query.filter(expr)
        
        # Load relationships for calculation
        invoices = query.options(joinedload(Invoice.assigned_approvers_list)).all()
        
        user_map = {u.email.lower(): u.username for u in db.query(User).all()}
        
        options = set()
        for inv in invoices:
            if inv.status == InvoiceStatusEnum.WAITING_APPROVAL:
                level = inv.current_approver_level or 1
                # Find approvers for this level
                approvers = [a for a in inv.assigned_approvers_list if a.sequence_order == level]
                for a in approvers:
                    if a.is_finance:
                        options.add("Finance Team")
                    else:
                        name = user_map.get(a.approver_email.lower()) or a.approver_email.split("@")[0]
                        options.add(name)
            elif inv.status in [InvoiceStatusEnum.SAGE_POSTED, InvoiceStatusEnum.APPROVED]:
                options.add("Completed")
            elif inv.status == InvoiceStatusEnum.REJECTED:
                options.add("Rejected")
        
        return sorted([o for o in options if o], key=lambda x: str(x))

    if column == "status":
        query = db.query(Invoice)
        query = invoice_repo._apply_filters(query, repo_filters)
        for expr in expressions:
            query = query.filter(expr)
            
        invoices = query.options(joinedload(Invoice.assigned_approvers_list)).all()
        formatted_options = []
        seen = set()
        
        from app.database.db_utils import get_status_label
        
        for inv in invoices:
            label = get_status_label(inv, db)
            if label and label not in seen:
                formatted_options.append(label)
                seen.add(label)
        return sorted(formatted_options)

    # Query unique non-null values for the column with applied filters
    target_model = Invoice
    
    if tab == "delete":
        target_model = DeletedInvoice
        expressions = [DeletedInvoice.entity == entity]

    if not hasattr(target_model, column):
        raise HTTPException(status_code=400, detail=f"Column '{column}' does not exist on {target_model.__name__} model")

    col_attr = getattr(target_model, column)

    query = db.query(col_attr)
    
    # Apply filters using repository helper
    if target_model == Invoice:
        query = invoice_repo._apply_filters(query, repo_filters)
    else:
        query = deleted_invoice_repo._apply_filters(query, repo_filters)


    for expr in expressions:
        query = query.filter(expr)
        
    results = query.filter(col_attr != None).distinct().all()
    
    # Flatten result list (SQLAlchemy returns tuples)
    # Normalize numeric types to handle precision issues (e.g., 100.0 vs 100.00)
    raw_values = []
    seen_raw = set()
    for r in results:
        val = r[0]
        if val is None or str(val).strip() == "":
            continue
        
        # Normalize numeric types
        if isinstance(val, (Decimal, float)):
            val = float(val)
        
        if val not in seen_raw:
            raw_values.append(val)
            seen_raw.add(val)
    
    # Sort raw values
    try:
        raw_values.sort()
    except:
        # Fallback if mixed types or non-sortable
        raw_values = sorted(raw_values, key=lambda x: str(x))
    
    formatted_options = []
    seen_fmt = set()
    for val in raw_values:
        if isinstance(val, (datetime, date)):
            fmt = val.strftime("%m-%d-%Y")
        else:
            fmt = val
        
        if fmt not in seen_fmt:
            formatted_options.append(fmt)
            seen_fmt.add(fmt)
            
    return formatted_options


@router.get("/{invoice_id}/", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: int,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: Session = Depends(get_db)
):
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice or invoice.entity != entity:
        raise HTTPException(status_code=404, detail="Invoice not found")

    return InvoiceResponse(**invoice_to_dict(invoice))

@router.get("/debug/raw/{invoice_id}")
async def get_raw_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice:
        return {"error": "Not found"}
    user_map = {u.email.lower(): u.username for u in db.query(User).all()}
    return invoice_to_dict(invoice, user_map=user_map)


@router.get("/{invoice_id}/file")
async def get_invoice_pdf(
    invoice_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        # Check archive if not found in active invoices
        archived = db.query(DeletedInvoice).filter(DeletedInvoice.original_invoice_id == invoice_id).first()
        if not archived:
             # Also try searching by archive ID if passed directly
             archived = db.query(DeletedInvoice).filter(DeletedInvoice.id == invoice_id).first()
        
        if archived:
            invoice = archived
        else:
            raise HTTPException(status_code=404, detail="Invoice not found")

    file_path = invoice.file_path
    
    # Ensure path is absolute/resolvable
    if file_path and not os.path.isabs(file_path):
        base_dir = os.getcwd()
        full_path = os.path.join(base_dir, file_path)
        if os.path.exists(full_path):
            file_path = full_path

    if not file_path or not os.path.exists(file_path):
        # Fallback: try to find it in any subfolder
        filename = os.path.basename(file_path) if file_path else (invoice.filename)
        found_path = find_file_in_any_folder(filename)
        if found_path:
            file_path = found_path

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"PDF file not found")

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=invoice.original_filename or "invoice.pdf"
    )

@router.put("/{invoice_id}/status")
async def update_invoice_status(
    invoice_id: int,
    status: InvoiceStatusEnum,
    comment: str = None,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    approver_name = current_user.username
    timestamp = get_ist_now()
    
    # DEBUG: Capture any request
    try:
        with open("output/requests_debug.txt", "a") as f:
            f.write(f"REQUEST: ID={invoice_id}, Status={status}, User={approver_name}, Time={timestamp.isoformat()}\n")
    except:
        pass

    invoice = invoice_repo.get_for_update(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Idempotency check: if already approved, return success immediately
    if status == InvoiceStatusEnum.APPROVED and invoice.status == InvoiceStatusEnum.APPROVED:
        return {"message": "Invoice already fully approved", "main_status": invoice.status, "sage_post_status": "success"}

    status_history = list(invoice.status_history) if invoice.status_history else []

    # =====================================================
    # FIND CURRENT APPROVAL CYCLE (AFTER LAST REWORK)
    # =====================================================
    last_rework_index = -1
    for i in range(len(status_history) - 1, -1, -1):
        if status_history[i].status == InvoiceStatusEnum.REWORKED:
            last_rework_index = i
            break

    current_cycle_history = (
        status_history[last_rework_index + 1 :]
        if last_rework_index != -1
        else status_history
    )

    # =====================================================
    # BLOCK DOUBLE ACTION IN SAME CYCLE (SOPHISTICATED CHECK)
    # =====================================================
    
    # We need to know which approvers are assigned to fetch delegation
    from app.routes.workflow import (
        get_vendor_data_from_invoice,
        get_required_approver_count,
        get_invoice_total_from_invoice
    )
    vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
    total_amount = get_invoice_total_from_invoice(db, invoice_id)
    
    # extracted_data is stored as string in SQL, but db_utils deserialize it
    extracted_data = deserialize_json_field(invoice.extracted_data) or {}
    currency = extracted_data.get("invoice_details", {}).get("currency", {}).get("value", "USD")
    
    # Get assigned approvers and is_parallel flag from requirement data
    requirement_data = get_required_approver_count(db, vendor_name, total_amount, invoice_id, invoice_data=invoice_to_dict(invoice), currency=currency, entity=invoice.entity)
    assigned_approvers = requirement_data.get("assigned_approvers", []) # This is a List[List[str]] or List[str]
    
    # -----------------------------------------------------
    # NEW PARALLEL AUTHORIZATION LOGIC
    # -----------------------------------------------------
    user_email = current_user.email.lower()
    from app.models.delegation import check_active_delegation
    
    # Find all levels where the user (or their substitute) is assigned
    user_assigned_levels = []
    
    def _is_user_in_group(group_item, target_email, entity_str):
        emails = [group_item] if isinstance(group_item, str) else group_item
        # Flatten if needed (handle nested JSON lists)
        flat_emails = []
        for e in emails:
            if not e: continue
            if isinstance(e, str) and e.startswith("["):
                try: 
                    parsed = json.loads(e)
                    if isinstance(parsed, list): flat_emails.extend([x.lower() for x in parsed])
                    else: flat_emails.append(e.lower())
                except: flat_emails.append(e.lower())
            else: flat_emails.append(e.lower())
        
        if target_email in flat_emails:
            return True
        
        # Check delegations
        for e in flat_emails:
            substitutes = check_active_delegation(db, e, entity_str)
            if target_email in [s.lower() for s in substitutes]:
                return True
        return False

    for idx, group in enumerate(assigned_approvers):
        if _is_user_in_group(group, user_email, invoice.entity):
            user_assigned_levels.append(idx + 1)

    current_level = invoice.current_approver_level or 1
    is_authorized = False
    
    if not user_assigned_levels:
        # User not assigned to any level
        raise HTTPException(status_code=403, detail="You are not authorized to approve this invoice.")

    # If the user is at the current level BUT ALSO has a future THRESHOLD-level assignment
    # (non-finance, not the last/posting level), block them — their presence at the lower
    # Finance Team level was from pool expansion, not an intentional assignment.
    # Posting approvers (last level == max_assigned_level) are NOT blocked.
    max_assigned_level = len(assigned_approvers)  # last level index in 1-based numbering
    future_threshold_levels = []
    for idx, group in enumerate(assigned_approvers):
        level_num = idx + 1
        if level_num <= current_level:
            continue
        if level_num >= max_assigned_level:
            continue  # this is the posting (last) level — posting approvers can act at lower levels
        # Check if this is a non-finance dedicated slot (threshold)
        is_fin = False
        if isinstance(group, dict):
            is_fin = group.get("is_finance", False)
        if not is_fin and _is_user_in_group(group, user_email, invoice.entity):
            future_threshold_levels.append(level_num)

    if current_level in user_assigned_levels and future_threshold_levels:
        print(f"[AUTH] Blocking {user_email} from acting at level {current_level} — "
              f"they are a threshold approver at future level(s) {future_threshold_levels}")
        raise HTTPException(
            status_code=400,
            detail="It is not yet your turn for approval."
        )

    # Check if user is at the CURRENT active level
    if current_level in user_assigned_levels:
        is_authorized = True
    elif any(lvl < current_level for lvl in user_assigned_levels):
        # User was in a previous level that is already approved
        raise HTTPException(status_code=400, detail="In the same level another already approves the invoices.")
    elif any(lvl > current_level for lvl in user_assigned_levels):
        # User is in a future level
        raise HTTPException(status_code=400, detail="It is not yet your turn for approval.")
    else:
        raise HTTPException(status_code=403, detail="Approver level mismatch.")

    # Idempotency / Double action check within the same level
    existing_approvals = sum(1 for h in current_cycle_history if h.status == InvoiceStatusEnum.APPROVED)
    already_acted_for_this_level = any(
        h.user == approver_name and 
        h.approver_level == current_level and 
        h.status in [InvoiceStatusEnum.APPROVED, InvoiceStatusEnum.REJECTED, InvoiceStatusEnum.REWORKED]
        for h in current_cycle_history
    )

    if already_acted_for_this_level and status in [InvoiceStatusEnum.APPROVED, InvoiceStatusEnum.REJECTED, InvoiceStatusEnum.REWORKED]:
         raise HTTPException(
            status_code=400,
            detail=f"User {approver_name} has already taken action for this level."
        )

    # =====================================================
    # PREPARE STATUS ENTRY
    # =====================================================
    new_status_entry = InvoiceStatusHistory(
        status=status,
        user=approver_name,
        timestamp=timestamp,
        comment=comment,
        approver_level=current_level if status in [InvoiceStatusEnum.APPROVED, InvoiceStatusEnum.REJECTED, InvoiceStatusEnum.REWORKED] else None
    )


    main_status = InvoiceStatusEnum.WAITING_APPROVAL

    # =====================================================
    #  WAITING_CODING (RECALL)
    # =====================================================
    if status == InvoiceStatusEnum.WAITING_CODING:
        main_status = InvoiceStatusEnum.WAITING_CODING

        workflow_step_repo.delete_all(db, filters={
            "invoice_id": invoice_id,
            "step_type": WorkflowStepTypeEnum.CODING
        })

        invoice.status = main_status
        invoice.validation_results = serialize_json_field({})
        # Empty the approved_by list in SQL
        invoice.approved_by_list = []
        invoice.current_approver_level = 1
        invoice.status_history.append(new_status_entry)
        
        db.commit()

        # [AUDIT] Log Recall
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id, 
            action=AuditAction.RECALLED, 
            user=current_user.username,
            entity=invoice.entity,
            details={"comment": comment}
        )
        
        return {"message": "Status updated", "main_status": main_status}

    # Remove the second (now redundant/unreachable) WAITING_CODING audit block


    # =====================================================
    # REJECT / REWORK
    # =====================================================
    # =====================================================
    # REJECT / REWORK / APPROVE
    # =====================================================
    if status in [InvoiceStatusEnum.REJECTED, InvoiceStatusEnum.REWORKED, InvoiceStatusEnum.APPROVED]:
        from app.routes.workflow import (
            get_vendor_data_from_invoice,
            get_required_approver_count,
            get_invoice_total_from_invoice
        )

        vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
        total_amount = get_invoice_total_from_invoice(db, invoice_id)
        
        extracted_data = deserialize_json_field(invoice.extracted_data) or {}
        currency = extracted_data.get("invoice_details", {}).get("currency", {}).get("value", "USD")

        requirement_data = get_required_approver_count(
            db, vendor_name, total_amount, invoice_id, invoice_data=invoice_to_dict(invoice), currency=currency, entity=invoice.entity
        )
        required_approvers = requirement_data["required"]
        assigned_approvers = requirement_data.get("assigned_approvers", [])
        is_parallel = requirement_data.get("is_parallel", False)

        # COUNT ONLY CURRENT CYCLE APPROVALS
        existing_approvals = sum(
            1 for h in current_cycle_history
            if h.status == InvoiceStatusEnum.APPROVED
        )

        if assigned_approvers:
            if not is_authorized:
                 # Fetch the specific group assigned to the current stage
                 expected_emails = assigned_approvers[current_level - 1] if 0 <= current_level - 1 < len(assigned_approvers) else []
                 expected_flat = _flatten_emails(expected_emails)
                 
                 detail_msg = f"Only {', '.join(expected_flat)} (or their active substitute) can take action at this level."
                 if is_parallel:
                     all_flat = _flatten_emails(assigned_approvers)
                     detail_msg = f"Only designated parallel approvers {', '.join(all_flat)} (or their active substitutes) can take action."
                 
                 raise HTTPException(
                    status_code=403,
                    detail=detail_msg
                )

        if status == InvoiceStatusEnum.APPROVED:
            if existing_approvals >= required_approvers:
                # Already have enough approvals, likely a duplicate click
                return {"message": "Invoice already has required approvals", "main_status": invoice.status, "sage_post_status": "success"}
            
            approvals = existing_approvals + 1
            if approvals >= required_approvers:
                main_status = InvoiceStatusEnum.APPROVED
            else:
                main_status = InvoiceStatusEnum.WAITING_APPROVAL
        else:
            main_status = status

    # =====================================================
    # SAVE INVOICE
    # =====================================================
    invoice.status = main_status
    invoice.is_parallel = is_parallel
    
    validation_results = deserialize_json_field(invoice.validation_results) or {}
    validation_results.update({
        "approver_name": approver_name,
        "approval_timestamp": timestamp.isoformat(),
        "last_action": status.value if hasattr(status, 'value') else status,
        "approver_comment": comment
    })
    invoice.validation_results = serialize_json_field(validation_results)
    
    invoice.status_history.append(new_status_entry)

    # Determine the status after this action
    main_status = InvoiceStatusEnum.WAITING_APPROVAL
    if status == InvoiceStatusEnum.APPROVED:
        if current_level >= len(assigned_approvers):
            main_status = InvoiceStatusEnum.APPROVED
        else:
            main_status = InvoiceStatusEnum.WAITING_APPROVAL
    elif status == InvoiceStatusEnum.REJECTED:
        main_status = InvoiceStatusEnum.REJECTED
    elif status == InvoiceStatusEnum.REWORKED:
        main_status = InvoiceStatusEnum.REWORKED
    elif status == InvoiceStatusEnum.WAITING_CODING:
        main_status = InvoiceStatusEnum.WAITING_CODING

    # [AUDIT] Log Approval Action 
    # (Note: we log it before updating the main status if we want to capture the transition)
    
    # Update main invoice status
    invoice.status = main_status
    
    if status == InvoiceStatusEnum.APPROVED:
        # Add to approved_by_list for tracking
        if not any(a.approver_email == current_user.email for a in invoice.approved_by_list):
            from app.models.db_models import InvoiceApprovedBy
            invoice.approved_by_list.append(InvoiceApprovedBy(approver_email=current_user.email))
        
        # If not final level, increment level for next group
        if main_status == InvoiceStatusEnum.WAITING_APPROVAL:
            invoice.current_approver_level = current_level + 1
            
    elif status in [InvoiceStatusEnum.REJECTED, InvoiceStatusEnum.REWORKED, InvoiceStatusEnum.WAITING_CODING]:
        invoice.approved_by_list = []
        invoice.current_approver_level = 1

        # TRIGGER NOTIFICATION TO CODER (REJECTED/REWORKED)
        if status in [InvoiceStatusEnum.REJECTED, InvoiceStatusEnum.REWORKED]:
            coding_step = db.query(WorkflowStep).filter(
                WorkflowStep.invoice_id == invoice_id,
                WorkflowStep.step_type == WorkflowStepTypeEnum.CODING
            ).order_by(WorkflowStep.timestamp.desc()).first()
            
            if coding_step:
                coder_username = coding_step.user
                coder_user = db.query(User).filter(User.username == coder_username).first()
                if coder_user and coder_user.email:
                    extracted_data = deserialize_json_field(invoice.extracted_data) or {}
                    invoice_number = extracted_data.get("invoice_details", {}).get("invoice_number", {}).get("value")
                    if not invoice_number:
                        invoice_number = invoice.invoice_number

                    email_service.send_rejection_notification(
                        email=coder_user.email,
                        username=coder_username,
                        vendor_name=vendor_name or "Unknown",
                        invoice_number=invoice_number or "N/A",
                        status=status.value if hasattr(status, 'value') else status,
                        comment=comment
                    )


    db.commit()


    # 8. TRIGGER NEXT APPROVER EMAIL
    if status == InvoiceStatusEnum.APPROVED and main_status == InvoiceStatusEnum.WAITING_APPROVAL:
        # We need the next approver's email
        # assigned_approvers is a list of lists. If current_level was 1, index 1 is next.
        if assigned_approvers and current_level < len(assigned_approvers):
            next_level_approvers = assigned_approvers[current_level]
            emails = [next_level_approvers] if isinstance(next_level_approvers, str) else next_level_approvers

            
            for next_approver_email in emails:
                if not next_approver_email: continue
                
                # Use email service to notify next approver
                next_approver_user = db.query(User).filter(User.email == next_approver_email).first()
                next_approver_name = next_approver_user.username if next_approver_user else "Approver"

                extracted_data_json = {}
                if invoice.extracted_data:
                    try:
                        extracted_data_json = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
                    except: pass
                    
                inv_number = extracted_data_json.get("invoice_details", {}).get("invoice_number", {}).get("value")
                if not inv_number:
                    inv_number = invoice.invoice_number

                email_service.send_approval_request_email(
                    email=next_approver_email,
                    username=next_approver_name,
                    vendor_name=vendor_name or "Unknown",
                    invoice_number=inv_number or "N/A",
                    amount=str(total_amount),
                    currency=currency
                )



    # =====================================================
    # CREATE WORKFLOW STEP (RESET AFTER REWORK)
    # =====================================================
    if status in [
        InvoiceStatusEnum.APPROVED,
        InvoiceStatusEnum.REJECTED,
        InvoiceStatusEnum.REWORKED
    ]:
        cycle_approvals = [
            h for h in current_cycle_history
            if h.status == InvoiceStatusEnum.APPROVED
        ]

        approver_number = len(cycle_approvals) + 1

        step_type_map = {
            1: WorkflowStepTypeEnum.APPROVER_1,
            2: WorkflowStepTypeEnum.APPROVER_2,
            3: WorkflowStepTypeEnum.APPROVER_3,
            4: WorkflowStepTypeEnum.APPROVER_4
        }

        workflow_status = WorkflowStepStatusEnum.APPROVED
        if status == InvoiceStatusEnum.REJECTED:
            workflow_status = WorkflowStepStatusEnum.REJECTED
        elif status == InvoiceStatusEnum.REWORKED:
            workflow_status = WorkflowStepStatusEnum.REWORKED

        new_step = WorkflowStep(
            invoice_id=invoice_id,
            step_name=f"{approver_number}{['st','nd','rd','th'][min(approver_number-1,3)]} Approver",
            step_type=step_type_map.get(approver_number, WorkflowStepTypeEnum.APPROVER_4),
            user=approver_name,
            status=workflow_status,
            timestamp=timestamp,
            approver_number=approver_number,
            comment=comment,
            entity=invoice.entity
        )

        
        db.add(new_step)
        db.commit()

    # [AUDIT] Log Detailed Status Change
    action_map = {
        InvoiceStatusEnum.APPROVED: AuditAction.APPROVED,
        InvoiceStatusEnum.REJECTED: AuditAction.REJECTED,
        InvoiceStatusEnum.REWORKED: AuditAction.REWORKED,
        InvoiceStatusEnum.WAITING_CODING: AuditAction.RECALLED
    }
    
    if status in action_map:
        base_action = action_map[status].value
        if status == InvoiceStatusEnum.APPROVED:
            level_suffix = f" ({approver_number}{['st','nd','rd','th'][min(approver_number-1,3)]} Approver)"
            display_action = base_action + level_suffix
        elif status == InvoiceStatusEnum.REWORKED:
            display_action = base_action
        else:
            display_action = base_action
            
        # Prepare specific audit details for approvals/rework
        specific_details = {
            "comment": comment,
            "approver_level": approver_number if status in [InvoiceStatusEnum.APPROVED, InvoiceStatusEnum.REJECTED, InvoiceStatusEnum.REWORKED] else None
        }
        
        # Only include status diff if it's NOT a standard approval update (keep it clean)
        if status != InvoiceStatusEnum.APPROVED:
             specific_details["status"] = {
                 "old": invoice.status.value if hasattr(invoice.status, 'value') else invoice.status, 
                 "new": main_status.value if hasattr(main_status, 'value') else main_status
             }

        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id, 
            action=display_action, 
            user=current_user.username,
            entity=invoice.entity,
            details=specific_details
        )

    # =====================================================
    # GENERATE APPROVAL PDF ON FINAL APPROVAL
    # =====================================================
    sage_status = None
    if main_status == InvoiceStatusEnum.APPROVED:
        logger.info(f"[PDF] Final approval detected for invoice {invoice_id}. Starting PDF generation...")
        pdf_path = None
        try:
            from app.services.pdf_service import generate_approval_pdf
            # Now all steps are committed, PDF will include the final approver
            pdf_path = generate_approval_pdf(db, invoice_id)
            logger.info(f"[PDF] Approval report saved: {pdf_path}")
        except Exception as pdf_err:
            logger.error(f"[PDF] Error generating approval PDF: {pdf_err}", exc_info=True)

        # Post AP Bill to Sage Intacct
        try:
            from app.postapbill import post_ap_bill
            fresh_invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
            inv = fresh_invoice or invoice
            
            # 3. Extract finalized coding details (Capture at approval)
            hc, line_items = _get_finalized_coding_data(inv)
            
            # Synchronously update the coding record
            if inv.coding:
                inv.coding.header_coding = json.dumps(hc) if hc else None
                inv.coding.line_items = json.dumps(line_items) if line_items else None
                db.add(inv.coding)
                db.flush()
                logger.info(f"[SagePost] Finalized coding captured and saved for invoice {invoice_id}")

            # Resolve Sage Location ID dynamically
            # Mapping: DEFAULT/None -> "" (Top Level), otherwise use entity ID
            raw_entity = str(inv.entity).strip() if inv.entity else ""
            sage_location = raw_entity if raw_entity.upper() != "DEFAULT" else ""

            # Compute the intended bill number upfront (matches what postapbill.py sends to Sage)
            intended_bill_no = f"{inv.invoice_number}-{inv.id}"

            post_result = post_ap_bill(
                inv, 
                pdf_path or "",
                gl_account=hc.get("gl_code") or hc.get("glAccount"),
                location=sage_location,
                dept=hc.get("department") or hc.get("department_id"),
                vendor_dim=inv.vendor_id,
                item=hc.get("item") or hc.get("item_id"),
                class_lob=hc.get("lob") or hc.get("class") or hc.get("class_id"),
                line_items=line_items if line_items else None
            )
            
            if post_result and post_result.get("success"):
                sage_status = "success"
                invoice.status = InvoiceStatusEnum.SAGE_POSTED
                sage_response = post_result.get("data", {})
                sage_bill_no = sage_response.get("billNumber") or intended_bill_no
                # Persist the bill number on the invoice record
                invoice.sage_bill_number = sage_bill_no
                
                await audit_service.log_action(
                    db=db,
                    invoice_id=invoice_id,
                    action=AuditAction.SAGE_POSTED.value,
                    user=current_user.username,
                    entity=invoice.entity,
                    details={"sage_response": sage_response},
                    sage_bill_number=sage_bill_no
                )
                # Create/Update Workflow Step
                db.add(WorkflowStep(
                    invoice_id=invoice_id,
                    step_name="Posted to Sage",
                    step_type=WorkflowStepTypeEnum.SAGE_POSTED,
                    user=current_user.username,
                    status=WorkflowStepStatusEnum.COMPLETED,
                    timestamp=get_ist_now(),
                    entity=invoice.entity
                ))
                
                # Move file to posted_stage_files
                new_path = move_invoice_file(invoice.file_path, "posted_stage")
                if new_path:
                    invoice.file_path = new_path
                    db.commit()
            else:
                sage_status = "failure"
                invoice.status = InvoiceStatusEnum.SAGE_POST_FAILED
                error_msg = post_result.get("error") if post_result else "Unknown error"
                
                # Log to application_error.log
                error_logger.error(f"[Sage Post Failure] Invoice {invoice_id} ({invoice.entity}): {error_msg}")
                
                await audit_service.log_action(
                    db=db,
                    invoice_id=invoice_id,
                    action=AuditAction.SAGE_POST_FAILED.value,
                    user=current_user.username,
                    entity=invoice.entity,
                    details={"error": error_msg},
                    sage_bill_number=intended_bill_no
                )
        except Exception as bill_err:
            logger.error(f"[PostAPBill] Error: {bill_err}", exc_info=True)
            error_logger.error(f"[PostAPBill Critical Error] Invoice {invoice_id} ({invoice.entity}): {str(bill_err)}", exc_info=True)
            sage_status = "error"
            invoice.status = InvoiceStatusEnum.SAGE_POST_FAILED
            # Compute intended bill number for exception path too
            intended_bill_no_exc = f"{invoice.invoice_number}-{invoice.id}"
            await audit_service.log_action(
                db=db,
                invoice_id=invoice_id,
                action=AuditAction.SAGE_POST_FAILED.value,
                user=current_user.username,
                entity=invoice.entity,
                details={"error": str(bill_err)},
                sage_bill_number=intended_bill_no_exc
            )
        
        db.commit()

    return {"message": "Status updated", "main_status": main_status, "sage_post_status": sage_status}


@router.post("/{invoice_id}/repost-sage")
async def repost_to_sage(
    invoice_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually trigger AP Bill posting to Sage Intacct for an already approved invoice.
    """
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.status not in [InvoiceStatusEnum.APPROVED, InvoiceStatusEnum.SAGE_POST_FAILED]:
        raise HTTPException(
            status_code=400,
            detail=f"Invoice {invoice_id} is in status {invoice.status}. Only approved or failed-to-post invoices can be reposted to Sage."
        )

    # 1. Ensure Approval PDF exists (or regenerate it)
    pdf_path = None
    try:
        from app.services.pdf_service import generate_approval_pdf
        # This will return the path if it exists, or regenerate it
        pdf_path = generate_approval_pdf(db, invoice_id)
        logger.info(f"[RepostSage] Approval report path: {pdf_path}")
    except Exception as pdf_err:
        logger.error(f"[RepostSage] Error ensuring approval PDF: {pdf_err}", exc_info=True)
        # We can still try to post even if PDF generation fails, but it's better to have it

    # 2. Extract finalized coding details (Capture at approval)
    hc, line_items = _get_finalized_coding_data(invoice)
    
    # Synchronously update the coding record
    if invoice.coding:
        invoice.coding.header_coding = json.dumps(hc) if hc else None
        invoice.coding.line_items = json.dumps(line_items) if line_items else None
        db.add(invoice.coding)
        db.flush()
        logger.info(f"[SageRepost] Finalized coding captured and saved for invoice {invoice_id}")

    # 3. Call Sage Posting Logic
    try:
        from app.postapbill import post_ap_bill
        
        # Resolve Sage Location ID dynamically
        # Mapping: DEFAULT/None -> "" (Top Level), otherwise use entity ID
        raw_entity = str(invoice.entity).strip() if invoice.entity else ""
        sage_location = raw_entity if raw_entity.upper() != "DEFAULT" else ""

        # Compute the intended bill number upfront
        intended_bill_no = f"{invoice.invoice_number}-{invoice.id}"

        post_result = post_ap_bill(
            invoice, 
            pdf_path or "",
            gl_account=hc.get("gl_code") or hc.get("glAccount"),
            location=sage_location,
            dept=hc.get("department") or hc.get("department_id"),
            vendor_dim=invoice.vendor_id,
            item=hc.get("item") or hc.get("item_id"),
            class_lob=hc.get("lob") or hc.get("class") or hc.get("class_id"),
            line_items=line_items if line_items else None
        )
        
        if post_result and post_result.get("success"):
            invoice.status = InvoiceStatusEnum.SAGE_POSTED
            logger.info(f"[RepostSage] Success: Updating status for invoice {invoice_id} to {invoice.status.value}")
            
            # Ensure post_result data is serializable and not "[object Object]"
            sage_data = post_result.get("data")
            if isinstance(sage_data, str) and sage_data == "[object Object]":
                sage_data = {"error": "Received [object Object] from Sage API"}
            
            sage_response = post_result.get("data", {})
            sage_bill_no = sage_response.get("billNumber") or intended_bill_no
            # Persist the bill number on the invoice record
            invoice.sage_bill_number = sage_bill_no

            await audit_service.log_action(
                db=db,
                invoice_id=invoice_id,
                action=AuditAction.SAGE_REPOSTED.value,
                user=current_user.username,
                entity=invoice.entity,
                details={"sage_response": sage_data},
                sage_bill_number=sage_bill_no
            )
            
            # Create/Update Workflow Step
            db.add(WorkflowStep(
                invoice_id=invoice_id,
                step_name="Posted to Sage",
                step_type=WorkflowStepTypeEnum.SAGE_POSTED,
                user=current_user.username,
                status=WorkflowStepStatusEnum.COMPLETED,
                timestamp=get_ist_now(),
                entity=invoice.entity
            ))
            
            db.add(invoice)
            db.commit()
            return {"success": True, "message": "Manual repost to Sage successful", "status": invoice.status.value if hasattr(invoice.status, 'value') else invoice.status}
        else:
            invoice.status = InvoiceStatusEnum.SAGE_POST_FAILED
            db.commit()
            error_msg = post_result.get("error") if post_result else "Unknown error"
            
            # Log to application_error.log
            error_logger.error(f"[Sage Repost Failure] Invoice {invoice_id} ({invoice.entity}): {error_msg}")
            
            await audit_service.log_action(
                db=db,
                invoice_id=invoice_id,
                action=AuditAction.SAGE_REPOST_FAILED.value,
                user=current_user.username,
                entity=invoice.entity,
                details={"error": error_msg},
                sage_bill_number=intended_bill_no
            )
            return {"success": False, "error": error_msg, "status": invoice.status.value if hasattr(invoice.status, 'value') else invoice.status}
            
    except Exception as bill_err:
        invoice.status = InvoiceStatusEnum.SAGE_POST_FAILED
        db.commit()
        logger.error(f"[RepostSage] Critical Error: {bill_err}", exc_info=True)
        error_logger.error(f"[Sage Repost Critical Error] Invoice {invoice_id} ({invoice.entity}): {str(bill_err)}", exc_info=True)
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id,
            action=AuditAction.SAGE_POST_FAILED.value,
            user=current_user.username,
            entity=invoice.entity,
            details={"error": str(bill_err), "type": "manual_repost"},
            sage_bill_number=f"{invoice.invoice_number}-{invoice.id}"
        )
        return {"success": False, "error": str(bill_err), "status": invoice.status}


@router.get("/{invoice_id}/approval-report")
async def download_approval_report(
    invoice_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Download (or regenerate) the approval PDF report for a fully-approved invoice.
    Serves the PDF from the local output/ folder.
    If the file does not exist yet it is regenerated on the fly.
    """
    from fastapi.responses import FileResponse as FR
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.status != InvoiceStatusEnum.APPROVED:
        raise HTTPException(
            status_code=400,
            detail=f"Invoice {invoice_id} is not fully approved (current status: {invoice.status})."
        )

    from pathlib import Path
    output_dir = Path(__file__).resolve().parent.parent.parent / "output"
    pdf_file = output_dir / f"invoice_{invoice_id}_approval.pdf"

    if not pdf_file.exists():
        try:
            from app.services.pdf_service import generate_approval_pdf
            generate_approval_pdf(db, invoice_id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {e}")

    if not pdf_file.exists():
        raise HTTPException(status_code=404, detail="PDF report could not be generated.")

    return FR(
        path=str(pdf_file),
        media_type="application/pdf",
        filename=f"invoice_{invoice_id}_approval_report.pdf",
        headers={"Content-Disposition": f'attachment; filename="invoice_{invoice_id}_approval_report.pdf"'}
    )


@router.put("/{invoice_id}")
async def update_invoice(
    invoice_id: int,
    invoice_update: InvoiceUpdate,
    background_tasks: BackgroundTasks,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    update_data = {k: v for k, v in invoice_update.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Capture state BEFORE updates
    old_invoice_dict = invoice_to_dict(invoice)

    # ─── Concurrency Check (Optimistic Locking) ───
    if invoice_update.last_updated_at and invoice.updated_at:
        # Round to seconds to handle potential precision mismatch across DB/Protocols
        db_ts = invoice.updated_at.replace(microsecond=0)
        req_ts = invoice_update.last_updated_at.replace(microsecond=0)
        
        if db_ts > req_ts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This invoice has been modified by another user. Please refresh."
            )

    # --- Duplicate Check Logic (Constraint Enforcement) ---
    # Determine the effective vendor_id and invoice_number after update
    # Check if they are being updated in extracted_data
    
    current_vendor_id = invoice.vendor_id
    current_invoice_number = invoice.invoice_number
    
    new_vendor_id = current_vendor_id
    new_invoice_number = current_invoice_number
    
    requires_check = False
    
    # 1. Check top-level updates
    # if "vendor_id" in update_data:
    #     new_vendor_id = update_data["vendor_id"]
    #     requires_check = True
    # ---- Line grouping toggle when vendor changes ----
    if "vendor_id" in update_data and update_data["vendor_id"] != invoice.vendor_id:
        from app.models.db_models import VendorMaster
        # Simplified vendor lookup for grouping logic
        vendor = db.query(VendorMaster).filter(VendorMaster.vendor_id == new_vendor_id).first()
        new_grouping = vendor.line_grouping if vendor else "No"

        extracted_data = update_data.get("extracted_data") or deserialize_json_field(invoice.extracted_data) or {}
        items = extracted_data.get("Items", {}).get("value", [])

        original_items = deserialize_json_field(invoice.original_items) or items
        update_data["original_items"] = original_items # Save as dict, will be serialized later

        if new_grouping == "Yes":
            from app.services.line_grouping import aggregate_items
            aggregated = aggregate_items(original_items)
            extracted_data["Items"]["value"] = [aggregated]
        else:
            extracted_data["Items"]["value"] = original_items

        update_data["extracted_data"] = extracted_data # Save as dict, will be serialized later

    if "invoice_number" in update_data:
        new_invoice_number = update_data["invoice_number"]
        requires_check = True
        
    # 2. Check extracted_data updates (which might override or sync with top-level)
    extracted_data = update_data.get("extracted_data")
    if extracted_data:
        # Vendor ID
        ev_id = extracted_data.get("vendor_info", {}).get("vendor_id", {}).get("value")
        if ev_id:
            new_vendor_id = ev_id
            requires_check = True
            
        # Invoice Number
        ein_num = extracted_data.get("invoice_details", {}).get("invoice_number", {}).get("value")
        if ein_num:
            new_invoice_number = ein_num
            requires_check = True

    if requires_check and new_vendor_id and new_invoice_number:
        from app.utils.invoice_registry import check_registry_duplicate
        from app.ai.duplicate_detector import check_duplicate_invoice
        
        duplicate = check_registry_duplicate(db, new_vendor_id, new_invoice_number, invoice.entity)
        if not duplicate:
            duplicate = check_duplicate_invoice(db, new_vendor_id, new_invoice_number, invoice.entity)
        
        if duplicate and str(duplicate.get("id")) != str(invoice_id):
             raise HTTPException(
                status_code=409, 
                detail=f"Duplicate detected: Vendor ID '{new_vendor_id}' already has Invoice #'{new_invoice_number}'."
            )
        else:
            invoice.duplicate_info = None

    # --- Vendor Mapping Persistence ---
    extracted_data = update_data.get("extracted_data")
    if extracted_data:
        # Check if vendor info is being updated
        new_vendor_id = extracted_data.get("vendor_info", {}).get("vendor_id", {}).get("value")
        new_vendor_name = extracted_data.get("vendor_info", {}).get("name", {}).get("value")
        
        old_vendor_id = invoice.vendor_id
        old_vendor_name = invoice.vendor_name
        azure_vendor_name = invoice.azure_vendor_name
        azure_vendor_address = invoice.azure_vendor_address
        
        # Determine if we should update metadata
        # We update if the vendor_id has changed, OR if the vendor_name has changed for the same ID
        vendor_changed = (new_vendor_id and new_vendor_id != old_vendor_id) or \
                         (new_vendor_name and new_vendor_name != old_vendor_name)

        if new_vendor_id and vendor_changed:
            from app.ai.normalizer import normalize_vendor, normalize_address
            
            # Combine name and address mappings into a single VendorMetadata record per vendor_id
            norm_azure_name = normalize_vendor(azure_vendor_name) if azure_vendor_name else None
            
            # Get address from extracted_data if possible
            vendor_info = extracted_data.get("vendor_info", {})
            azure_address = vendor_info.get("address", {}).get("value") or azure_vendor_address
            norm_azure_addr = normalize_address(azure_address) if azure_address else None

            if norm_azure_name or norm_azure_addr:
                # 1. Search by vendor_id and entity (Canonical Record)
                mapping = db.query(VendorMetadata).filter(
                    VendorMetadata.vendor_id == new_vendor_id,
                    VendorMetadata.entity == invoice.entity
                ).first()
                
                # 2. If not found, search by name or address to see if we should "take over" an existing record
                if not mapping:
                    if norm_azure_name:
                        mapping = db.query(VendorMetadata).filter(
                            VendorMetadata.extracted_name_normalized == norm_azure_name,
                            VendorMetadata.entity == invoice.entity
                        ).first()
                    
                    if not mapping and norm_azure_addr:
                        mapping = db.query(VendorMetadata).filter(
                            VendorMetadata.extracted_address_normalized == norm_azure_addr,
                            VendorMetadata.entity == invoice.entity
                        ).first()

                if not mapping:
                    # Create new unified record
                    mapping = VendorMetadata(
                        entity=invoice.entity,
                        vendor_id=new_vendor_id,
                        official_name=new_vendor_name or invoice.vendor_name,
                        extracted_name=azure_vendor_name,
                        extracted_name_normalized=norm_azure_name,
                        extracted_address=azure_address,
                        extracted_address_normalized=norm_azure_addr,
                        updated_by=current_user.username
                    )
                    db.add(mapping)
                else:
                    # Update existing record with the best available info
                    mapping.vendor_id = new_vendor_id
                    mapping.official_name = new_vendor_name or invoice.vendor_name
                    
                    if norm_azure_name:
                        mapping.extracted_name = azure_vendor_name
                        mapping.extracted_name_normalized = norm_azure_name
                    
                    if norm_azure_addr:
                        mapping.extracted_address = azure_address
                        mapping.extracted_address_normalized = norm_azure_addr
                        
                    mapping.updated_by = current_user.username

        # --- MANDATORY SYNCHRONIZATION (UI -> Columns) ---
        # Ensure top-level columns match extraction data
        if new_vendor_id:
            update_data["vendor_id"] = new_vendor_id
        if new_vendor_name:
            update_data["vendor_name"] = new_vendor_name
        if new_invoice_number:
            update_data["invoice_number"] = new_invoice_number
        
        # Sync reference number
        ref_num = extracted_data.get("invoice_details", {}).get("reference_number", {}).get("value")
        if ref_num:
            update_data["reference_number"] = ref_num
            
        # Sync back to extracted_data for frontend consistency
        if isinstance(extracted_data, dict):
            if "vendor_info" not in extracted_data: extracted_data["vendor_info"] = {}
            if new_vendor_id: 
                extracted_data["vendor_info"]["vendor_id"] = {"value": new_vendor_id}
            if new_vendor_name: 
                extracted_data["vendor_info"]["name"] = {"value": new_vendor_name}
                
            if "invoice_number" not in extracted_data["invoice_details"]: extracted_data["invoice_details"]["invoice_number"] = {}
            extracted_data["invoice_details"]["invoice_number"]["value"] = new_invoice_number

        # --- Date Columns Sync ---
        inv_dt = extracted_data.get("invoice_details", {}).get("invoice_date", {}).get("value")
        due_dt = extracted_data.get("invoice_details", {}).get("due_date", {}).get("value")
        posting_dt = extracted_data.get("invoice_details", {}).get("posting_date", {}).get("value")
        
        if inv_dt is not None:
            update_data["invoice_date"] = parse_date_safely(inv_dt)
        if due_dt is not None:
            update_data["due_date"] = parse_date_safely(due_dt)
        if posting_dt is not None:
            update_data["posting_date"] = parse_date_safely(posting_dt)
            
        # --- Amount Columns Sync ---
        total_amt = extracted_data.get("amounts", {}).get("total_invoice_amount", {}).get("value")
        amt_due = extracted_data.get("amounts", {}).get("amount_due", {}).get("value")
        
        if total_amt is not None:
            update_data["total_amount"] = remove_currency_format(total_amt)
        if amt_due is not None:
            update_data["amount_due"] = remove_currency_format(amt_due)

        update_data["extracted_data"] = extracted_data # Keep as dict for now


    # Merge validation
    if "validation_results" in update_data:
        existing_validation = deserialize_json_field(invoice.validation_results) or {}
        merged_validation = {**existing_validation, **update_data["validation_results"]}
        invoice.validation_results = serialize_json_field(merged_validation)

    # Status transition logic
    if "status" in update_data and update_data["status"] == InvoiceStatusEnum.WAITING_APPROVAL:
         from app.routes.workflow import get_vendor_data_from_invoice, get_required_approver_count, get_invoice_total_from_invoice
         from app.models.db_models import User
         from app.repository.repositories import invoice_assigned_approver_repo
         
         vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
         total_amount = get_invoice_total_from_invoice(db, invoice_id)
         currency = (deserialize_json_field(invoice.extracted_data) or {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")
         
         # Always recalculate requirements on transition
         requirement_data = get_required_approver_count(
             db, vendor_name, total_amount, invoice_id,
             currency=currency, entity=invoice.entity,
             force_vendor_id=vendor_id, force_vendor_name=vendor_name
         )
         
         invoice.required_approvers = requirement_data["required"]
         invoice.approver_breakdown = serialize_json_field(requirement_data.get("breakdown", {}))
         
         # Clear existing assigned approvers
         invoice_assigned_approver_repo.delete_all(db, filters={"invoice_id": invoice_id})
         
         # Fetch all finance-department users once (used for finance-level expansion)
         finance_users = (
             db.query(User)
             .filter(
                 User.department != None,
                 User.department.ilike("%finance%"),
                 ~User.department.ilike("%non-finance%"),
                 User.status == "active"
             )
             .all()
         )
         finance_emails = [u.email.lower() for u in finance_users if u.email]
         
         # Store assigned approvers
         assigned_approvers = requirement_data.get("assigned_approvers", [])
         level_1_emails = []
         for idx, level_data in enumerate(assigned_approvers):
             is_finance_level = False
             emails = []
             
             if isinstance(level_data, dict):
                 emails = level_data.get("emails", [])
                 is_finance_level = level_data.get("is_finance", False)
             else:
                 emails = [level_data] if isinstance(level_data, str) else level_data
                 
             if is_finance_level and finance_emails:
                 combined = set(e.lower() for e in emails if e) | set(finance_emails)
             else:
                 combined = set(e.lower() for e in emails if e)
                 
             if idx == 0:
                 level_1_emails = list(combined)


             for email in combined:
                 if email:
                     invoice_assigned_approver_repo.create(db, obj_in={
                         "invoice_id": invoice_id,
                         "approver_email": email,
                         "sequence_order": idx + 1,
                         "is_finance": is_finance_level
                     })

    # Update attributes
    update_fields = [
        "vendor_id", "vendor_name", "invoice_number", "reference_number", "status", 
        "exchange_rate", "confidence_score", "total_amount", 
        "amount_due", "invoice_date", "due_date", "posting_date"
    ]
    
    # Process potentially raw strings for financial and date fields
    for field in ["exchange_rate", "total_amount", "amount_due"]:
        if field in update_data:
            update_data[field] = remove_currency_format(update_data[field])
            
    for field in ["invoice_date", "due_date", "posting_date"]:
        if field in update_data:
            update_data[field] = parse_date_safely(update_data[field])

    for field in update_fields:
        if field in update_data:
            setattr(invoice, field, update_data[field])
            
    if "extracted_data" in update_data:
        invoice.extracted_data = serialize_json_field(update_data["extracted_data"])
            
    if "original_items" in update_data:
        invoice.original_items = serialize_json_field(update_data["original_items"])

    if "extracted_data" in update_data:
        # Use a local variable to ensure we have the dict version for coding sync
        ext_data_dict = update_data["extracted_data"]
        if isinstance(ext_data_dict, str):
            try:
                ext_data_dict = json.loads(ext_data_dict)
            except:
                pass
    db.commit()

    # --- Record Coding Completion Step ---
    if "status" in update_data and update_data["status"] == InvoiceStatusEnum.WAITING_APPROVAL:
        # Check the most recent step to avoid back-to-back duplicate Coding steps
        # but allow a new Coding step if it was previously Reworked
        last_step = db.query(WorkflowStep).filter(
            WorkflowStep.invoice_id == invoice_id
        ).order_by(WorkflowStep.timestamp.desc()).first()
        
        if not last_step or last_step.step_type != WorkflowStepTypeEnum.CODING:
            db.add(WorkflowStep(
                invoice_id=invoice_id,
                step_name="Coding",
                step_type=WorkflowStepTypeEnum.CODING,
                user=current_user.username,
                status=WorkflowStepStatusEnum.COMPLETED,
                timestamp=get_ist_now(),
                entity=invoice.entity
            ))
            db.commit()
            logger.info(f"[Workflow] Recorded coding completion for invoice {invoice_id} by {current_user.username}")

        # --- TRIGGER LEVEL 1 EMAIL NOTIFICATION ---
        if 'level_1_emails' in locals() and level_1_emails:
            for next_email in level_1_emails:
                if not next_email: continue
                
                # Fetch username for personal touch if possible
                approver_user = db.query(User).filter(User.email == next_email).first()
                approver_name = approver_user.username if approver_user else "Approver"
                
                background_tasks.add_task(
                    email_service.send_approval_request_email,
                    email=next_email,
                    username=approver_name,
                    vendor_name=invoice.vendor_name or "Unknown",
                    invoice_number=invoice.invoice_number or "N/A",
                    amount=str(invoice.total_amount),
                    currency=currency if 'currency' in locals() else "USD"
                )

    # --- Auto-Coding Suggestions on transition to waiting_coding ---
    # When an invoice is sent to coding, automatically apply AI-based GL suggestions
    # in the background to provide an immediate response.
    if "status" in update_data and update_data["status"] == InvoiceStatusEnum.WAITING_CODING:
        def run_auto_coding(inv_id):
            bg_db = SessionLocal()
            try:
                from app.routes.coding import apply_coding_suggestions_to_invoice
                inv = bg_db.query(Invoice).filter(Invoice.id == inv_id).first()
                if inv:
                    apply_coding_suggestions_to_invoice(bg_db, inv)
                    logger.info(f"[AutoCode] Background: Applied suggestions to invoice {inv_id}")
            except Exception as e:
                logger.error(f"[AutoCode] Background Error for invoice {inv_id}: {e}")
            finally:
                bg_db.close()
        
        background_tasks.add_task(run_auto_coding, invoice_id)

    # --- Coding Synchronization ---
    # If extracted_data was updated, sync coding fields in the background
    if "extracted_data" in update_data:
        # Prepare the data needed for the background task to avoid closure issues
        def run_coding_sync(inv_id, data_dict, v_name, v_id):
            bg_db = SessionLocal()
            try:
                from app.routes.coding import update_coding_history
                from app.models.coding import LineItemCoding
                from app.models.db_models import Coding as DBCoding

                inv = bg_db.query(Invoice).filter(Invoice.id == inv_id).first()
                if not inv:
                    return

                items = data_dict.get("Items", {}).get("value", [])
                if not items:
                    return

                # ── lineItemsSnapshot is the authoritative coding source ───────
                # useSaveInvoice.js stores the full Zustand lineItems array
                # (including user-filled glCode/lob/department) as lineItemsSnapshot
                # inside extracted_data at save time. extracted_data.Items always
                # has empty gl_code/lob/department because those are never written
                # back to the nested Items structure.
                snapshot = data_dict.get("lineItemsSnapshot") or []
                # Build lookup by description (lowercased) for fast matching
                snap_by_desc = {}
                snap_by_idx  = {}
                for i, s in enumerate(snapshot):
                    desc_key = (s.get("description") or "").strip().lower()
                    if desc_key:
                        snap_by_desc[desc_key] = s
                    snap_by_idx[i] = s

                def get_val(item_obj, key, default=""):
                    val_obj = item_obj.get(key)
                    if isinstance(val_obj, dict):
                        return val_obj.get("value", default)
                    return val_obj if val_obj is not None else default

                coding_line_items = []
                for idx, item in enumerate(items):
                    desc = get_val(item, "description")
                    desc_key = desc.strip().lower()

                    # Resolve coding from snapshot first (has glCode/lob/etc.)
                    snap = snap_by_desc.get(desc_key) or snap_by_idx.get(idx) or {}

                    # Snapshot uses camelCase keys (glCode, lob, department ...)
                    gl_code    = snap.get("glCode")    or get_val(item, "gl_code",    "")
                    lob        = snap.get("lob")        or get_val(item, "lob",        "")
                    department = snap.get("department") or get_val(item, "department", "")
                    customer   = snap.get("customer")   or get_val(item, "customer",   "")
                    item_val   = snap.get("item")       or get_val(item, "item",       "")

                    coding_line_items.append(LineItemCoding(
                        s_no=idx + 1,
                        description=desc,
                        line_type="Expense",
                        quantity=float(get_val(item, "qty", 1) or 1),
                        unit_price=float(get_val(item, "unit_price", 0) or 0),
                        net_amount=float(get_val(item, "amount", 0) or 0),
                        gl_code=gl_code,
                        lob=lob,
                        department=department,
                        customer=customer,
                        item=item_val,
                        original_index=idx
                    ))

                line_items_json = json.dumps([li.dict() for li in coding_line_items])
                existing_coding = bg_db.query(DBCoding).filter(DBCoding.invoice_id == inv_id).first()

                if existing_coding:
                    existing_coding.line_items = line_items_json
                    existing_coding.updated_at = get_ist_now()
                else:
                    bg_db.add(DBCoding(
                        invoice_id=inv_id,
                        line_items=line_items_json,
                        entity=inv.entity,
                        created_at=get_ist_now()
                    ))

                logger.info(f"[CodingSync] invoice {inv_id} gl_codes: {[(li.description, li.gl_code) for li in coding_line_items]}")
                update_coding_history(bg_db, v_name, coding_line_items, vendor_id=v_id)
                bg_db.commit()
                logger.info(f"[CodingSync] Committed coding_history for invoice {inv_id}")
            except Exception as e:
                logger.error(f"[CodingSync] Background Error for invoice {inv_id}: {e}", exc_info=True)
            finally:
                bg_db.close()

        background_tasks.add_task(
            run_coding_sync, 
            invoice_id, 
            ext_data_dict if 'ext_data_dict' in locals() else deserialize_json_field(update_data.get("extracted_data")),
            invoice.vendor_name, 
            invoice.vendor_id
        )

    # --- Registry Sync ---
    if new_vendor_id != current_vendor_id or new_invoice_number != current_invoice_number:
        from app.utils.invoice_registry import remove_from_registry, register_invoice
        
        remove_from_registry(db, invoice_id)
        
        if new_vendor_id and new_invoice_number:
            register_invoice(
                db,
                vendor_id=new_vendor_id,
                invoice_number=new_invoice_number,
                entity=invoice.entity or "",
                invoice_id=invoice_id,
                uploaded_by=invoice.uploaded_by or "system"
            )

    # [AUDIT] Log Update with Deep Diff
    audit_details = {}
    
    # Capture state AFTER updates
    new_invoice_dict = invoice_to_dict(invoice)

    # 1. Compare Top-Level Fields
    # List of simple fields to check
    simple_fields = [
        "vendor_id", "vendor_name", "invoice_number", "reference_number", "status",
        "line_grouping", "confidence_score", "exchange_rate"
    ]
    
    for field in simple_fields:
        old_val = old_invoice_dict.get(field)
        new_val = new_invoice_dict.get(field)
        
        # Normalize: Treat None as equivalent to "" for noise reduction
        norm_old = "" if old_val is None else old_val
        norm_new = "" if new_val is None else new_val
        
        if norm_old != norm_new:
            audit_details[field] = {"old": old_val, "new": new_val}

    # 2. Compare Extracted Data (Critical Fields)
    # We check specific paths in the JSON data
    critical_checks = [
        # (Paths to check, Human Label)
        (["vendor_info", "vendor_id", "value"], "Extracted Vendor ID"),
        (["vendor_info", "name", "value"], "Extracted Vendor Name"),
        (["vendor_info", "address", "value"], "Extracted Vendor Address"),
        (["invoice_details", "invoice_number", "value"], "Extracted Invoice Number"),
        (["invoice_details", "reference_number", "value"], "Reference Number"),
        (["invoice_details", "invoice_date", "value"], "Extracted Invoice Date"),
        (["invoice_details", "po_number", "value"], "PO Number"),
        (["amounts", "total_invoice_amount", "value"], "Total Invoice Amount"),
        (["amounts", "total_amount_payable", "value"], "Total Amount Payable"),
        (["amounts", "total_tax_amount", "value"], "Total Tax Amount"),
        (["amounts", "total_service_tax_amount", "value"], "Service Tax Amount"),
        (["invoice_details", "currency", "value"], "Currency")
    ]

    def get_nested(d, p):
        val = d
        if not val: return None
        for step in p:
            if isinstance(val, dict):
                val = val.get(step)
            else:
                return None
        return val

    old_extracted = old_invoice_dict.get("extracted_data") or {}
    new_extracted = new_invoice_dict.get("extracted_data") or {}

    for path, label in critical_checks:
        old_val = get_nested(old_extracted, path)
        new_val = get_nested(new_extracted, path)
        
        # Normalize: Treat None as equivalent to ""
        norm_old = "" if old_val is None else old_val
        norm_new = "" if new_val is None else new_val
        
        if norm_old != norm_new:
            audit_details[label] = {"old": old_val, "new": new_val}
            
    # Check Line Items Count (High level check)
    old_items = old_extracted.get("Items", {}).get("value", [])
    new_items = new_extracted.get("Items", {}).get("value", [])
    if len(old_items) != len(new_items):
        audit_details["Line Items Count"] = {"old": len(old_items), "new": len(new_items)}

    # 3. Check for Line Items (Coding) changes
    old_coding = old_extracted.get("lineItemsSnapshot") or []
    new_coding = new_extracted.get("lineItemsSnapshot") or []
    if old_coding != new_coding:
        # Format line items for readability in audit trail
        coding_summary = []
        for i, item in enumerate(new_coding):
            gl = item.get("glCode") or item.get("gl_code")
            lob = item.get("lob")
            dept = item.get("department")
            cust = item.get("customer")
            prod_item = item.get("item")
            desc = item.get("description")
            
            # Helper to check if a value is meaningful
            def is_valid(v):
                return v and str(v).strip() and str(v).upper() != "N/A"

            parts = []
            if is_valid(gl): parts.append(f"GL: {gl}")
            if is_valid(lob): parts.append(f"LOB: {lob}")
            if is_valid(dept): parts.append(f"Dept: {dept}")
            if is_valid(cust): parts.append(f"Cust: {cust}")
            if is_valid(prod_item): parts.append(f"Item: {prod_item}")
            if is_valid(desc): parts.append(f"Desc: {desc}")
            
            if parts:
                coding_summary.append(f"Item {i+1}:\n  " + " | ".join(parts))
        
        if coding_summary:
            audit_details["Line Items (Coding)"] = "\n\n".join(coding_summary)

   


    # [AUDIT] Log Update with Specific Action if Status Changed
    action = AuditAction.UPDATED
    
    # If status changed, prioritize that action name
    if "status" in audit_details:
        new_status = new_invoice_dict.get("status")
        if new_status == InvoiceStatusEnum.WAITING_CODING:
            action = AuditAction.SENT_FOR_CODING
        elif new_status == InvoiceStatusEnum.WAITING_APPROVAL:
            action = AuditAction.SENT_TO_APPROVAL
    
    # Only log if there are actual changes
    if audit_details:
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id, 
            action=action, 
            user=current_user.username,
            entity=invoice.entity,
            details=audit_details
        )
 
    db.refresh(invoice)  # Reload updated_at from DB after commit
    return InvoiceResponse(**invoice_to_dict(invoice))


# @router.delete("/{invoice_id}")
# async def delete_invoice(
#     invoice_id: int,
#     current_user: UserResponse = Depends(get_current_user),
#     db: Session = Depends(get_db)
# ):
#     invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
#     if not invoice:
#         raise HTTPException(status_code=404, detail="Invoice not found")

#     # Remove from registry
#     from app.utils.invoice_registry import remove_from_registry
#     remove_from_registry(db, invoice_id)

#     db.delete(invoice)
#     db.commit()

#     return {"message": "Invoice deleted successfully"}

# @router.get("/debug/last-approved")
# async def debug_last_approved(db: Session = Depends(get_db)):
#     from app.models.db_models import Invoice
#     invs = db.query(Invoice).filter(Invoice.status == InvoiceStatusEnum.APPROVED).order_by(Invoice.id.desc()).limit(10).all()
#     return [{"id": i.id, "number": i.invoice_number, "status": i.status, "approvals": len(i.approved_by_list or []), "required": i.required_approvers} for i in invs]

# @router.get("/{invoice_id}/generate-pdf-debug")
# async def generate_pdf_debug(invoice_id: int, db: Session = Depends(get_db)):
#     from app.services.pdf_service import generate_approval_pdf
#     try:
#         path = generate_approval_pdf(db, invoice_id)
#         return {"status": "success", "path": path}
#     except Exception as e:
#         import traceback
#         return {"status": "error", "message": str(e), "traceback": traceback.format_exc()}

# @router.get("/debug/log")
# async def debug_log(lines: int = 100):
#     try:
#         with open("application_error.log", "r") as f:
#             content = f.readlines()
#             return {"log": content[-lines:]}
#     except Exception as e:
#         return {"error": str(e)}




@router.delete("/{invoice_id}")
async def delete_invoice(
    invoice_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Soft-delete an invoice: snapshot the invoice and all its related child rows
    into the `deleted_invoices` table, then remove from `invoices` (cascade).
    This preserves full history and allows re-upload of the same invoice
    without triggering a duplicate warning.
    """
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    try:
        # ------------------------------------------------------------------
        # 0. Record deletion in status and workflow BEFORE snapshotting
        # ------------------------------------------------------------------
        invoice.status = InvoiceStatusEnum.DELETED
        
        # Add to history
        history_item = InvoiceStatusHistory(
            invoice_id=invoice_id,
            status=InvoiceStatusEnum.DELETED,
            user=current_user.username,
            timestamp=get_ist_now(),
            comment="Invoice deleted by user"
        )
        db.add(history_item)
        
        # Add to workflow
        workflow_step = WorkflowStep(
            invoice_id=invoice_id,
            step_name="Deleted",
            step_type=WorkflowStepTypeEnum.DELETED,
            user=current_user.username,
            status="completed",
            timestamp=get_ist_now(),
            entity=invoice.entity
        )
        db.add(workflow_step)
        
        db.flush()
        db.refresh(invoice)

        # ------------------------------------------------------------------
        # 1. Snapshot child-table rows as JSON
        # ------------------------------------------------------------------
        def _row_to_dict(row):
            """Serialize a SQLAlchemy row to a plain dict (primitive values only)."""
            result = {}
            for col in row.__table__.columns:
                val = getattr(row, col.name)
                if isinstance(val, datetime):
                    val = val.isoformat()
                elif hasattr(val, 'value'):   # Enum
                    val = val.value
                result[col.name] = val
            return result

        status_history_snapshot = json.dumps(
            [_row_to_dict(h) for h in (invoice.status_history or [])]
        )
        workflow_steps_snapshot = json.dumps(
            [_row_to_dict(s) for s in (invoice.workflow_steps or [])]
        )
        approved_by_snapshot = json.dumps(
            [_row_to_dict(a) for a in (invoice.approved_by_list or [])]
        )
        assigned_approvers_snapshot = json.dumps(
            [_row_to_dict(a) for a in (invoice.assigned_approvers_list or [])]
        )
        coding_snapshot = json.dumps(
            _row_to_dict(invoice.coding) if invoice.coding else None
        )
        audit_logs_snapshot = json.dumps(
            [_row_to_dict(al) for al in (invoice.audit_logs or [])]
        )

        # ------------------------------------------------------------------
        # 2. Build and insert the DeletedInvoice archive row
        # ------------------------------------------------------------------
        deleted_record = DeletedInvoice(
            original_invoice_id=invoice.id,
            filename=invoice.filename,
            original_filename=invoice.original_filename,
            file_path=invoice.file_path,
            uploaded_by=invoice.uploaded_by,
            uploaded_by_id=invoice.uploaded_by_id,
            status=invoice.status.value if hasattr(invoice.status, 'value') else invoice.status,
            entity=invoice.entity,
            vendor_id=invoice.vendor_id,
            vendor_name=invoice.vendor_name,
            invoice_number=invoice.invoice_number,
            azure_vendor_name=invoice.azure_vendor_name,
            azure_vendor_address=invoice.azure_vendor_address,
            line_grouping=invoice.line_grouping,
            exchange_rate=invoice.exchange_rate,
            sage_bill_number=invoice.sage_bill_number,
            extracted_data=invoice.extracted_data,
            vendor_details=invoice.vendor_details,
            processing_steps=invoice.processing_steps,
            validation_results=invoice.validation_results,
            duplicate_info=invoice.duplicate_info,
            original_items=invoice.original_items,
            approver_breakdown=invoice.approver_breakdown,
            gl_summary=invoice.gl_summary,
            confidence_score=invoice.confidence_score,
            uploaded_at=invoice.uploaded_at,
            processed_at=invoice.processed_at,
            required_approvers=invoice.required_approvers,
            current_approver_level=invoice.current_approver_level,
            # Child-table snapshots
            status_history_json=status_history_snapshot,
            workflow_steps_json=workflow_steps_snapshot,
            approved_by_json=approved_by_snapshot,
            assigned_approvers_json=assigned_approvers_snapshot,
            coding_json=coding_snapshot,
            audit_logs_json=audit_logs_snapshot,
            # Deletion metadata
            deleted_at=get_ist_now(),
            deleted_by=current_user.username,
        )
        db.add(deleted_record)
        db.flush()  # Write archive row before deleting the source

        # ------------------------------------------------------------------
        # 3. Remove from invoice_registry (so re-upload isn't flagged as duplicate)
        # ------------------------------------------------------------------
        from app.utils.invoice_registry import remove_from_registry
        remove_from_registry(db, invoice_id)

        # ------------------------------------------------------------------
        # 4. Delete from invoices table (cascade removes all child rows)
        # ------------------------------------------------------------------
        # Move file to deleted_files
        new_path = move_invoice_file(invoice.file_path, "deleted")
        if new_path:
            # We update the archived record's file path to reflect the move
            deleted_record.file_path = new_path
            db.commit()

        db.delete(invoice)
        db.commit()

        logger.info(
            f"[DeleteInvoice] Invoice {invoice_id} soft-deleted by {current_user.username}. "
            f"Archived as deleted_invoice id={deleted_record.id}."
        )
        return {"message": "Invoice deleted and archived successfully"}

    except Exception as e:
        db.rollback()
        logger.error(f"[DeleteInvoice] Failed to soft-delete invoice {invoice_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete invoice: {str(e)}")


@router.post("/{invoice_id}/archive")
async def archive_invoice(
    invoice_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Archive an invoice: change status to ARCHIVED and move file to archive_files.
    """
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.status != InvoiceStatusEnum.SAGE_POSTED:
        raise HTTPException(
            status_code=400, 
            detail="Only invoices with 'Posted To Stage' status can be archived."
        )

    try:
        # Move file to archive_files
        new_path = move_invoice_file(invoice.file_path, "archive")
        if new_path:
            invoice.file_path = new_path
        
        invoice.status = InvoiceStatusEnum.ARCHIVED
        
        # Add to history
        history_item = InvoiceStatusHistory(
            invoice_id=invoice_id,
            status=InvoiceStatusEnum.ARCHIVED,
            user=current_user.username,
            timestamp=get_ist_now(),
            comment="Invoiced archived by user"
        )
        db.add(history_item)
        
        # [AUDIT] Log Archive
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id, 
            action=AuditAction.ARCHIVED.value if hasattr(AuditAction, 'ARCHIVED') else "Archived", 
            user=current_user.username,
            entity=invoice.entity,
            details={"action": "archived"}
        )
        
        db.commit()
        logger.info(f"[ArchiveInvoice] Invoice {invoice_id} archived by {current_user.username}")
        return {"message": "Invoice archived successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"[ArchiveInvoice] Failed to archive invoice {invoice_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to archive invoice: {str(e)}")


@router.post("/bulk-delete")
async def bulk_delete_invoices(
    payload: dict,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Bulk soft-delete invoices.
    """
    invoice_ids = payload.get("invoice_ids", [])
    if not invoice_ids:
        raise HTTPException(status_code=400, detail="No invoice IDs provided")
    
    results = {"success": [], "failed": []}
    
    for inv_id in invoice_ids:
        try:
            # We call the logic for individual delete but within this loop
            # To avoid large complex transactions, we commit each one or handle carefully
            # For simplicity, let's just use the logic from delete_invoice
            invoice = db.query(Invoice).filter(Invoice.id == inv_id).first()
            if not invoice:
                results["failed"].append({"id": inv_id, "reason": "Invoice not found"})
                continue
            
            # ------------------------------------------------------------------
            # 0. Record deletion in status and workflow BEFORE snapshotting
            # ------------------------------------------------------------------
            invoice.status = InvoiceStatusEnum.DELETED
            
            # Add to history
            history_item = InvoiceStatusHistory(
                invoice_id=inv_id,
                status=InvoiceStatusEnum.DELETED,
                user=current_user.username,
                timestamp=get_ist_now(),
                comment="Invoice deleted by user (Bulk)"
            )
            db.add(history_item)
            
            # Add to workflow
            workflow_step = WorkflowStep(
                invoice_id=inv_id,
                step_name="Deleted",
                step_type=WorkflowStepTypeEnum.DELETED,
                user=current_user.username,
                status="completed",
                timestamp=get_ist_now(),
                entity=invoice.entity
            )
            db.add(workflow_step)
            
            db.flush()
            db.refresh(invoice)

            # (Reusing logic from delete_invoice)
            # ------------------------------------------------------------------
            # 1. Snapshot child-table rows as JSON
            # ------------------------------------------------------------------
            def _row_to_dict(row):
                result = {}
                for col in row.__table__.columns:
                    val = getattr(row, col.name)
                    if isinstance(val, datetime):
                        val = val.isoformat()
                    elif hasattr(val, 'value'):
                        val = val.value
                    result[col.name] = val
                return result

            status_history_snapshot = json.dumps([_row_to_dict(h) for h in (invoice.status_history or [])])
            workflow_steps_snapshot = json.dumps([_row_to_dict(s) for s in (invoice.workflow_steps or [])])
            approved_by_snapshot = json.dumps([_row_to_dict(a) for a in (invoice.approved_by_list or [])])
            assigned_approvers_snapshot = json.dumps([_row_to_dict(a) for a in (invoice.assigned_approvers_list or [])])
            coding_snapshot = json.dumps(_row_to_dict(invoice.coding) if invoice.coding else None)
            audit_logs_snapshot = json.dumps([_row_to_dict(al) for al in (invoice.audit_logs or [])])

            deleted_record = DeletedInvoice(
                original_invoice_id=invoice.id,
                filename=invoice.filename,
                original_filename=invoice.original_filename,
                file_path=invoice.file_path,
                uploaded_by=invoice.uploaded_by,
                uploaded_by_id=invoice.uploaded_by_id,
                status=invoice.status.value if hasattr(invoice.status, 'value') else invoice.status,
                entity=invoice.entity,
                vendor_id=invoice.vendor_id,
                vendor_name=invoice.vendor_name,
                invoice_number=invoice.invoice_number,
                azure_vendor_name=invoice.azure_vendor_name,
                azure_vendor_address=invoice.azure_vendor_address,
                line_grouping=invoice.line_grouping,
                exchange_rate=invoice.exchange_rate,
                sage_bill_number=invoice.sage_bill_number,
                extracted_data=invoice.extracted_data,
                vendor_details=invoice.vendor_details,
                processing_steps=invoice.processing_steps,
                validation_results=invoice.validation_results,
                duplicate_info=invoice.duplicate_info,
                original_items=invoice.original_items,
                approver_breakdown=invoice.approver_breakdown,
                gl_summary=invoice.gl_summary,
                confidence_score=invoice.confidence_score,
                uploaded_at=invoice.uploaded_at,
                processed_at=invoice.processed_at,
                required_approvers=invoice.required_approvers,
                current_approver_level=invoice.current_approver_level,
                status_history_json=status_history_snapshot,
                workflow_steps_json=workflow_steps_snapshot,
                approved_by_json=approved_by_snapshot,
                assigned_approvers_json=assigned_approvers_snapshot,
                coding_json=coding_snapshot,
                audit_logs_json=audit_logs_snapshot,
                deleted_at=get_ist_now(),
                deleted_by=current_user.username,
            )
            db.add(deleted_record)
            db.flush()

            from app.utils.invoice_registry import remove_from_registry
            remove_from_registry(db, inv_id)

            new_path = move_invoice_file(invoice.file_path, "deleted")
            if new_path:
                deleted_record.file_path = new_path
            
            db.delete(invoice)
            db.commit()
            results["success"].append(inv_id)
        except Exception as e:
            db.rollback()
            logger.error(f"[BulkDelete] Failed to delete invoice {inv_id}: {e}")
            results["failed"].append({"id": inv_id, "reason": str(e)})

    return results


@router.post("/bulk-archive")
async def bulk_archive_invoices(
    payload: dict,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Bulk archive invoices.
    """
    invoice_ids = payload.get("invoice_ids", [])
    if not invoice_ids:
        raise HTTPException(status_code=400, detail="No invoice IDs provided")
    
    results = {"success": [], "failed": []}
    
    for inv_id in invoice_ids:
        try:
            invoice = db.query(Invoice).filter(Invoice.id == inv_id).first()
            if not invoice:
                results["failed"].append({"id": inv_id, "reason": "Invoice not found"})
                continue

            if invoice.status != InvoiceStatusEnum.SAGE_POSTED:
                results["failed"].append({"id": inv_id, "reason": "Only invoices with 'Posted To Stage' status can be archived."})
                continue

            # Move file to archive_files
            new_path = move_invoice_file(invoice.file_path, "archive")
            if new_path:
                invoice.file_path = new_path
            
            invoice.status = InvoiceStatusEnum.ARCHIVED
            
            # Add to history
            history_item = InvoiceStatusHistory(
                invoice_id=inv_id,
                status=InvoiceStatusEnum.ARCHIVED,
                user=current_user.username,
                timestamp=get_ist_now(),
                comment="Invoiced archived by user (Bulk)"
            )
            db.add(history_item)
            
            # [AUDIT] Log Archive
            await audit_service.log_action(
                db=db,
                invoice_id=inv_id, 
                action=AuditAction.ARCHIVED.value if hasattr(AuditAction, 'ARCHIVED') else "Archived", 
                user=current_user.username,
                entity=invoice.entity,
                details={"action": "archived", "bulk": True}
            )
            
            db.commit()
            results["success"].append(inv_id)
        except Exception as e:
            db.rollback()
            logger.error(f"[BulkArchive] Failed to archive invoice {inv_id}: {e}")
            results["failed"].append({"id": inv_id, "reason": str(e)})

    return results


@router.get("/deleted", summary="List deleted (archived) invoices")
async def list_deleted_invoices(
    entity: str = Depends(get_current_entity),
    vendor_id: Optional[str] = Query(None, description="Filter by vendor ID"),
    invoice_number: Optional[str] = Query(None, description="Filter by invoice number"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    sort_by: str = Query("deleted_at", description="Field to sort by"),
    sort_dir: str = Query("desc", description="Sort direction (asc/desc)"),
    filters: Optional[str] = Query(None, description="JSON string of filters"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Return a paginated list of soft-deleted (archived) invoices.
    Accessible by all authenticated users.
    """
    # [Requirement Update] Deleted invoices can be viewed by all roles.
    # if current_user.role != "admin":
    #     raise HTTPException(status_code=403, detail="Only admins can view deleted invoices")

    query = db.query(DeletedInvoice)
    if entity:
        query = query.filter(DeletedInvoice.entity == entity)
    if vendor_id:
        query = query.filter(DeletedInvoice.vendor_id == vendor_id)
    if invoice_number:
        query = query.filter(DeletedInvoice.invoice_number == invoice_number)

    if filters:
        try:
            extra_filters = json.loads(filters)
            if isinstance(extra_filters, dict):
                # Apply date casting for date fields if needed by _apply_filters
                for k, v in list(extra_filters.items()):
                    col_attr = getattr(DeletedInvoice, k, None)
                    if col_attr is not None and hasattr(col_attr, "type"):
                        from sqlalchemy import Date, DateTime, cast
                        if isinstance(col_attr.type, (Date, DateTime)):
                            vals = v if isinstance(v, list) else [v]
                            try:
                                parsed_dates = [datetime.strptime(str(x), "%m-%d-%Y").date() for x in vals]
                                query = query.filter(cast(col_attr, Date).in_(parsed_dates))
                                del extra_filters[k]
                            except:
                                pass
                
                # Apply remaining filters using repo helper for robustness (between, ops, etc)
                query = deleted_invoice_repo._apply_filters(query, extra_filters)
        except Exception as e:
            print(f"Error parsing filters in list_deleted_invoices: {e}")


    # Dynamic sorting
    if hasattr(DeletedInvoice, sort_by):
        col = getattr(DeletedInvoice, sort_by)
        if sort_dir.lower() == "desc":
            query = query.order_by(col.desc())
        else:
            query = query.order_by(col.asc())
    else:
        query = query.order_by(DeletedInvoice.deleted_at.desc())

    # Extra role filtering for non-finance approvers in archived invoices
    user_roles = [r.strip().lower() for r in current_user.role.split(",")]
    user_dept = (current_user.department or "").lower()
    
    is_approver = "approver" in user_roles
    is_admin = "admin" in user_roles
    is_finance = "finance" in user_dept and "non-finance" not in user_dept

    if is_approver and not is_admin and not is_finance:
        from app.models.db_models import Delegation
        curr_time = get_ist_now()
        active_delegations = db.query(Delegation.delegator_email).filter(
            Delegation.substitute_email.ilike(current_user.email),
            Delegation.entity == entity,
            Delegation.start_date <= curr_time,
            Delegation.end_date >= curr_time
        ).all()
        target_emails = [current_user.email.lower()] + [d[0].lower() for d in active_delegations]
        
        from sqlalchemy import or_
        # DeletedInvoice has assigned_approvers_json (JSON string snapshot)
        # We use ILIKE to search for any target email within the JSON string
        email_filters = [DeletedInvoice.assigned_approvers_json.ilike(f"%{email}%") for email in target_emails]
        if email_filters:
            query = query.filter(or_(*email_filters))
        else:
            # If no target emails (shouldn't happen), return nothing for safety
            query = query.filter(DeletedInvoice.id == -1)

    total = query.count()
    records = query.offset(skip).limit(limit).all()

    def _serialize(r: DeletedInvoice):
        # Parse JSON fields safely
        try:
            extracted_data = json.loads(r.extracted_data) if r.extracted_data else {}
        except:
            extracted_data = {}

        # Calculate last_modified_by from workflow_steps_json snapshot
        last_modified_by = r.uploaded_by
        try:
            if r.workflow_steps_json:
                steps = json.loads(r.workflow_steps_json)
                if isinstance(steps, list) and steps:
                    # Sort by timestamp desc to find the most recent non-pending action
                    # Steps in JSON usually have ISO format timestamps
                    sorted_steps = sorted(steps, key=lambda x: x.get("timestamp", ""), reverse=True)
                    for step in sorted_steps:
                        if step.get("status") in ["completed", "approved", "rejected", "reworked"]:
                            last_modified_by = step.get("user")
                            break
        except Exception as e:
            print(f"Error parsing workflow steps for deleted invoice {r.id}: {e}")

        # Resolve email to username for last_modified_by if possible
        if last_modified_by and "@" in last_modified_by:
            user_obj = db.query(User).filter(User.email == last_modified_by).first()
            if user_obj:
                last_modified_by = user_obj.username or last_modified_by.split("@")[0]
            else:
                last_modified_by = last_modified_by.split("@")[0]

        return {
            "id": r.id,
            "original_invoice_id": r.original_invoice_id,
            "filename": r.original_filename or r.filename,
            "vendor_id": r.vendor_id,
            "vendor_name": r.vendor_name,
            "invoice_number": r.invoice_number,
            "entity": r.entity,
            "status": r.status,
            "uploaded_by": r.uploaded_by,
            "uploaded_at": r.uploaded_at.strftime("%m-%d-%Y") if r.uploaded_at else None,
            "deleted_by": r.deleted_by,
            "deleted_at": r.deleted_at.strftime("%m-%d-%Y") if r.deleted_at else None,
            "sage_bill_number": r.sage_bill_number,
            "extracted_data": extracted_data,
            "total_amount": float(r.total_amount) if r.total_amount else None,
            "amount_due": float(r.amount_due) if r.amount_due else None,
            "invoice_date": r.invoice_date.strftime("%m-%d-%Y") if r.invoice_date else None,
            "due_date": r.due_date.strftime("%m-%d-%Y") if r.due_date else None,
            "confidence_score": r.confidence_score,
            "processed_at": r.processed_at.strftime("%m-%d-%Y") if r.processed_at else None,
            "last_modified_by": last_modified_by,
            "action_time": r.processed_at.strftime("%m-%d-%Y") if r.processed_at else None,
        }

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": [_serialize(r) for r in records]
    }

@router.get("/deleted/{archive_id}", summary="Get deleted invoice details")
async def get_deleted_invoice(
    archive_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Return full snapshot details of a deleted invoice.
    """
    record = db.query(DeletedInvoice).filter(DeletedInvoice.id == archive_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Archived invoice not found")

    # Helper to deserialize the snapshots
    def _safe_json(s):
        if not s: return None
        try: return json.loads(s)
        except: return s

    # Reconstruct a dictionary similar to invoice_to_dict but from snapshots
    extracted_data = _safe_json(record.extracted_data) or {}
    coding_row = _safe_json(record.coding_json)
    
    line_items_list = []
    if coding_row and isinstance(coding_row, dict):
        line_items_str = coding_row.get("line_items")
        if line_items_str:
            line_items_list = _safe_json(line_items_str) or []
    
    # Ensure the frontend's loadLineItemTable sees this as a saved record with a snapshot
    if line_items_list:
        extracted_data["isModified"] = True
        extracted_data["lineItemsSnapshot"] = line_items_list
    
    # Enrich extracted_data with metadata for specific UI views
    if record.status in ['waiting_approval', 'approved', 'processed', 'sage_posted', 'rejected', 'reworked']:
        if line_items_list:
            extracted_data["is_coded"] = True

    res = {
        "id": record.id,
        "original_invoice_id": record.original_invoice_id,
        "filename": record.filename,
        "original_filename": record.original_filename,
        "file_path": record.file_path,
        "uploaded_by": record.uploaded_by,
        "status": record.status,
        "entity": record.entity,
        "vendor_id": record.vendor_id,
        "vendor_name": record.vendor_name,
        "invoice_number": record.invoice_number,
        "azure_vendor_name": record.azure_vendor_name,
        "azure_vendor_address": record.azure_vendor_address,
        "line_grouping": record.line_grouping,
        "exchange_rate": float(record.exchange_rate) if record.exchange_rate else None,
        "sage_bill_number": record.sage_bill_number,
        "extracted_data": extracted_data,
        "vendor_details": _safe_json(record.vendor_details),
        "processing_steps": _safe_json(record.processing_steps),
        "validation_results": _safe_json(record.validation_results),
        "duplicate_info": _safe_json(record.duplicate_info),
        "original_items": _safe_json(record.original_items),
        "approver_breakdown": _safe_json(record.approver_breakdown),
        "gl_summary": _safe_json(record.gl_summary),
        "confidence_score": record.confidence_score,
        "uploaded_at": record.uploaded_at.isoformat() if record.uploaded_at else None,
        "processed_at": record.processed_at.isoformat() if record.processed_at else None,
        "deleted_at": record.deleted_at.isoformat() if record.deleted_at else None,
        "deleted_by": record.deleted_by,
        "current_approver_level": record.current_approver_level or 1,
        "required_approvers": record.required_approvers or 0,
        # Snapshots
        "status_history": _safe_json(record.status_history_json),
        "workflow_steps": _safe_json(record.workflow_steps_json),
        "coding": coding_row,
        "audit_logs": _safe_json(record.audit_logs_json),
        "is_archived": True
    }

    # Resolve User Names for Workflow Steps
    if res["workflow_steps"]:
        involved_users = set()
        for step in res["workflow_steps"]:
            if step.get("user"):
                involved_users.add(step.get("user").lower())
        
        if involved_users:
            user_list = db.query(User).filter(User.email.in_(list(involved_users))).all()
            user_names_map = {u.email.lower(): u.username for u in user_list}
            # For each step, if it has a user email, try to attach username if not already there
            # (Though history snapshot might already have some names, resolution ensures consistency)
            res["user_names"] = user_names_map

    # Normalize approved_by
    approved_by_snap = _safe_json(record.approved_by_json) or []
    res["approved_by"] = [a.get("approver_email") for a in approved_by_snap if a.get("approver_email")]

    # Normalize assigned_approvers
    assigned_snap = _safe_json(record.assigned_approvers_json) or []
    if assigned_snap:
        grouped = {}
        for a in sorted(assigned_snap, key=lambda x: x.get("sequence_order", 0)):
            seq = a.get("sequence_order", 0)
            if seq not in grouped: grouped[seq] = []
            grouped[seq].append(a.get("approver_email"))
        res["assigned_approvers"] = [grouped[seq] for seq in sorted(grouped.keys())]
    else:
        res["assigned_approvers"] = []

    return res

@router.get("/debug/last-approved")
async def debug_last_approved(db: Session = Depends(get_db)):
    from app.models.db_models import Invoice
    invs = db.query(Invoice).filter(Invoice.status == InvoiceStatusEnum.APPROVED).order_by(Invoice.id.desc()).limit(10).all()
    return [{"id": i.id, "number": i.invoice_number, "status": i.status, "approvals": len(i.approved_by_list or []), "required": i.required_approvers} for i in invs]

@router.get("/{invoice_id}/delegation-info")
async def get_delegation_info(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(403, "Only admins can view delegation info")
    
    # 1. Get current cycle acted users and completed levels
    last_reset = db.query(func.max(WorkflowStep.timestamp)).filter(
        WorkflowStep.invoice_id == invoice_id,
        WorkflowStep.step_type.in_([StepType.REWORKED, StepType.RECALLED])
    ).scalar()

    acted_query = db.query(WorkflowStep).filter(
        WorkflowStep.invoice_id == invoice_id,
        WorkflowStep.step_type.in_([
            StepType.LEVEL_APPROVED, StepType.APPROVED, StepType.REJECTED,
            StepType.THRESHOLD_APPROVED, StepType.POSTING_APPROVED
        ])
    )
    if last_reset:
        acted_query = acted_query.filter(WorkflowStep.timestamp > last_reset)
    
    steps = acted_query.all()
    acted_users = set(s.user.lower() for s in steps if s.user)
    completed_levels = set(s.approver_number for s in steps if s.approver_number)

    # 2. Get current specific approvers who haven't acted and are in uncompleted levels
    assigned_rows = db.query(InvoiceAssignedApprover).filter(
        InvoiceAssignedApprover.invoice_id == invoice_id,
        InvoiceAssignedApprover.is_finance == False
    ).all()
    
    approver_map = {}
    for a in assigned_rows:
        email = a.approver_email.lower()
        if email not in acted_users and a.sequence_order not in completed_levels:
            if email not in approver_map:
                approver_map[email] = []
            approver_map[email].append(a.sequence_order)
    
    current_approvers = []
    for email, lvls in approver_map.items():
        current_approvers.append({
            "email": email,
            "levels": sorted(list(set(lvls)))
        })
    current_approvers.sort(key=lambda x: x["email"])

    # 3. Get all active users who are approvers
    all_users = db.query(User).filter(
        User.status == "active",
        User.role.ilike("%approver%")
    ).all()
    
    current_approver_emails = set(approver_map.keys())
    
    eligible_users = []
    for u in all_users:
        email = u.email.lower()
        levels = approver_map.get(email, [])
        
        eligible_users.append({
            "email": email,
            "username": u.username,
            "department": u.department,
            "role": u.role,
            "assigned_levels": sorted(list(set(levels))),
            "has_acted": email in acted_users
        })
    
    return {
        "current_approvers": current_approvers,
        "eligible_users": eligible_users
    }

@router.post("/{invoice_id}/delegate")
async def delegate_invoice(
    invoice_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(403, "Only admins can delegate approvals")
    
    replace_email = payload.get("replace_email", "").lower()
    assign_to_email = payload.get("assign_to_email", "").lower()
    level = payload.get("level")
    
    if not replace_email or not assign_to_email:
        raise HTTPException(400, "Both replace_email and assign_to_email are required")

    last_reset = db.query(func.max(WorkflowStep.timestamp)).filter(
        WorkflowStep.invoice_id == invoice_id,
        WorkflowStep.step_type.in_([StepType.REWORKED, StepType.RECALLED])
    ).scalar()

    acted_query = db.query(WorkflowStep).filter(
        WorkflowStep.invoice_id == invoice_id,
        WorkflowStep.step_type.in_([
            StepType.LEVEL_APPROVED, StepType.APPROVED, StepType.REJECTED,
            StepType.THRESHOLD_APPROVED, StepType.POSTING_APPROVED
        ])
    )
    if last_reset:
        acted_query = acted_query.filter(WorkflowStep.timestamp > last_reset)
    
    steps = acted_query.all()
    acted_users = set(s.user.lower() for s in steps if s.user)
    completed_levels = set(s.approver_number for s in steps if s.approver_number)

    if replace_email in acted_users:
        raise HTTPException(400, f"Approver {replace_email} has already acted on this invoice and cannot be replaced.")
    
    if level and level in completed_levels:
        raise HTTPException(400, f"Approval level {level} is already completed.")
    
    # Update InvoiceAssignedApprover
    query = db.query(InvoiceAssignedApprover).filter(
        InvoiceAssignedApprover.invoice_id == invoice_id,
        InvoiceAssignedApprover.approver_email.ilike(replace_email)
    )
    
    if level:
        query = query.filter(InvoiceAssignedApprover.sequence_order == level)
    else:
        # If no level specified, only target specific (non-finance) rows by default
        # to avoid accidentally replacing all finance team entries if the user happened 
        # to be part of the pool.
        query = query.filter(InvoiceAssignedApprover.is_finance == False)
        
    rows = query.all()
    
    if not rows:
        raise HTTPException(404, f"Approver {replace_email} not found for this invoice")
    
    for row in rows:
        row.approver_email = assign_to_email
        row.is_finance = False # Replaced user becomes a specific approver
    
    # Add WorkflowStep for delegation history
    from app.routes.approval_new import _record_step
    _record_step(
        db, invoice_id,
        step_name=f"Delegated from {replace_email} to {assign_to_email}",
        step_type="DELEGATED",
        user_email=current_user.email,
        comment=f"Admin delegation by {current_user.username}",
        entity=rows[0].invoice.entity if rows[0].invoice else None
    )
    
    # Audit log
    await audit_service.log_action(
        db=db,
        invoice_id=invoice_id,
        action=AuditAction.DELEGATED,
        user=current_user.username,
        entity=rows[0].invoice.entity if rows[0].invoice else None,
        details={
            "original_approver": replace_email,
            "new_approver": assign_to_email,
            "delegated_by": current_user.username
        }
    )
    
    db.commit()
    return {"success": True, "message": f"Successfully delegated approvals from {replace_email} to {assign_to_email}"}

def _get_finalized_coding_data(invoice: Invoice):
    """
    Extracts the latest line items and header coding from extracted_data['lineItemsSnapshot'].
    This ensures we capture the exact state seen by the approver in the UI.
    """
    extracted = {}
    if invoice.extracted_data:
        try:
            extracted = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        except:
            pass
    
    snapshot = extracted.get("lineItemsSnapshot", [])
    if snapshot:
        # Convert snapshot (camelCase from UI) to snake_case for Sage/DB
        final_line_items = []
        for item in snapshot:
            final_line_items.append({
                "description": item.get("description", ""),
                "qty": item.get("qty", 1),
                "unit_price": item.get("unitPrice", 0),
                "net_amount": item.get("netAmount", 0),
                "gl_code": item.get("glCode", ""),
                "lob": item.get("lob", ""),
                "department": item.get("department", ""),
                "customer": item.get("customer", ""),
                "item": item.get("item", ""),
                "location": item.get("location", ""),
            })
        
        # Use existing header coding if available
        hc = {}
        if invoice.coding and invoice.coding.header_coding:
             try: hc = json.loads(invoice.coding.header_coding) if isinstance(invoice.coding.header_coding, str) else invoice.coding.header_coding
             except: pass
        
        logger.info(f"[Capture] Extracted {len(final_line_items)} items from snapshot for invoice {invoice.id}")
        return hc, final_line_items

    # Fallback to existing coding if no snapshot exists
    hc = {}
    li = []
    if invoice.coding:
        if invoice.coding.header_coding:
            try: hc = json.loads(invoice.coding.header_coding) if isinstance(invoice.coding.header_coding, str) else invoice.coding.header_coding
            except: pass
        if invoice.coding.line_items:
            try: li = json.loads(invoice.coding.line_items) if isinstance(invoice.coding.line_items, str) else invoice.coding.line_items
            except: pass
            
    return hc, li


@router.get("/{invoice_id}/generate-pdf-debug")
async def generate_pdf_debug(invoice_id: int, db: Session = Depends(get_db)):
    from app.services.pdf_service import generate_approval_pdf
    try:
        path = generate_approval_pdf(db, invoice_id)
        return {"status": "success", "path": path}
    except Exception as e:
        import traceback
        return {"status": "error", "message": str(e), "traceback": traceback.format_exc()}

@router.get("/debug/log")
async def debug_log(lines: int = 100):
    try:
        with open("application_error.log", "r") as f:
            content = f.readlines()
            return {"log": content[-lines:]}
    except Exception as e:
        return {"error": str(e)}











