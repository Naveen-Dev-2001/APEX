
"""
workflow_actions.py
-------------------
Approval workflow action endpoints.

Endpoints:
  POST /workflow/action/approve/{invoice_id}
  POST /workflow/action/reject/{invoice_id}
  POST /workflow/action/rework/{invoice_id}
  POST /workflow/action/enable-editing/{invoice_id}
  POST /workflow/action/repost-sage/{invoice_id}
  GET  /workflow/action/status/{invoice_id}        ← UI uses this to decide which buttons to show
"""

from __future__ import annotations
from fastapi import Body
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import func
import httpx
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from common.utils.date_utils import get_ist_now
from common.config.settings import settings

from common.auth.jwt import get_current_user
from common.database.database import get_db
from common.dependencies import get_current_entity
from common.models.db_models import Invoice, User, WorkflowStep, EntityMaster, InvoiceApprovedBy, InvoiceAssignedApprover
from common.models.user import UserResponse
from common.repository.repositories import (
    coding_repo,
    invoice_repo,
    vendor_workflow_repo,
    codification_workflow_repo,
    workflow_step_repo,
)

from common.routes.workflow import get_invoice_total_from_invoice, get_required_approver_count
from common.models.delegation import check_active_delegation
from common.services.audit_service import audit_service
from common.models.audit_log import AuditAction
from common.services.email_service import email_service

from common.middleware.logger import logger
router = APIRouter(prefix="/workflow/action", tags=["Workflow Actions"])


# ─────────────────────────────────────────────
# Status constants
# ─────────────────────────────────────────────
class InvoiceStatus:
    WAITING_CODING = "waiting_coding"
    WAITING_APPROVAL = "waiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    PROCESSED = "processed"
    REWORKED = "reworked"
    SAGE_POSTED = "sage_posted"
    SAGE_POST_FAILED = "sage_post_failed"
    ARCHIVED = "archived"


class StepType:
    APPROVED = "approved"
    REJECTED = "rejected"
    REWORKED = "reworked"
    POSTED = "posted"
    POST_FAILED = "post_failed"
    EDITING_ENABLED = "editing_enabled"
    LEVEL_APPROVED = "level_approved"
    THRESHOLD_APPROVED = "threshold_approved"
    POSTING_APPROVED = "posting_approved"
    RECALLED = "recalled"


# ─────────────────────────────────────────────
# Request / Response schemas
# ─────────────────────────────────────────────
class ActionRequest(BaseModel):
    comment: Optional[str] = None
    last_updated_at: Optional[datetime] = None


class EnableEditingRequest(BaseModel):
    comment: Optional[str] = None
    last_updated_at: Optional[datetime] = None


class ActionResponse(BaseModel):
    success: bool
    message: str
    new_status: Optional[str] = None
    next_level: Optional[int] = None
    sage_post_result: Optional[Dict[str, Any]] = None


class ApproverUIStatus(BaseModel):
    """
    Tells the frontend exactly which buttons to render and
    whether the current user can act on this invoice.
    """
    invoice_id: str
    current_status: str
    current_level: int
    workflow_type: Optional[str]

    # Current user's role in this workflow
    can_approve: bool
    can_reject: bool
    can_rework: bool
    can_enable_editing: bool
    can_repost_sage: bool

    # Richer context for UI
    is_posting_approver: bool
    is_threshold_approver: bool
    is_finance_team: bool
    # Which mandatory level this user belongs to
    user_level: Optional[int]
    level_already_approved: bool        # True → user's level is already done
    # True → this specific user already approved/rejected
    already_acted: bool
    assigned_approvers: List[Dict]
    sage_post_error: Optional[str]
    rework_error: Optional[str] = None


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _parse_list(val: Any) -> List[str]:
    """Safely parse approver email lists stored as JSON strings or plain strings."""
    if not val:
        return []
    if isinstance(val, list):
        return [str(v).strip() for v in val if v]
    if isinstance(val, str):
        s = val.strip()
        if s.startswith("["):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    return [str(v).strip() for v in parsed if v]
            except Exception:
                pass
        return [s] if s else []
    return []


def _check_concurrency(db: Session, invoice: Invoice, last_updated_at: Optional[datetime], current_user: UserResponse):
    if last_updated_at and invoice.updated_at:
        db_ts = invoice.updated_at.replace(microsecond=0)
        req_ts = last_updated_at.replace(microsecond=0)
        if db_ts > req_ts:
            from common.models.db_models import AuditLog
            latest_audit = db.query(AuditLog).filter(AuditLog.invoice_id == invoice.id).order_by(AuditLog.timestamp.desc()).first()
            last_audit_user = latest_audit.user if latest_audit else None
            if not last_audit_user or (last_audit_user != current_user.email and last_audit_user != current_user.username):
                raise HTTPException(
                    status_code=409,
                    detail="This invoice has been modified by another user. Please refresh."
                )


def _get_finance_users(db: Session, entity: str) -> List[str]:
    try:
        users = (
            db.query(User)
            .filter(
                User.department != None,
                func.lower(User.department).like("%finance%"),
                ~func.lower(User.department).like("%non-finance%"),
                User.role.ilike("%approver%"),
                User.status == "active"
            )
            .all()
        )

        return [u.email.lower() for u in users]

    except Exception as exc:
        logger.warning("Could not fetch users: %s", exc)
        return []


def _is_future_threshold_approver_db(db: Session, invoice_id: int, email: str, current_level: int) -> bool:
    """
    Query the DB to determine if `email` is a threshold approver for this invoice
    at a stage LATER than the current level.
    """
    if not _has_threshold_db(db, invoice_id):
        return False
    try:
        from sqlalchemy import func as sqla_func
        max_seq = db.query(sqla_func.max(InvoiceAssignedApprover.sequence_order)).filter(
            InvoiceAssignedApprover.invoice_id == invoice_id
        ).scalar() or 0

        if max_seq <= 1:
            return False

        has_posting = _has_posting_db(db, invoice_id)
        max_threshold_seq = max_seq - 1 if has_posting else max_seq

        row = db.query(InvoiceAssignedApprover).filter(
            InvoiceAssignedApprover.invoice_id == invoice_id,
            InvoiceAssignedApprover.approver_email.ilike(email),
            InvoiceAssignedApprover.is_finance == False,
            InvoiceAssignedApprover.sequence_order > current_level, # Only future levels
            InvoiceAssignedApprover.sequence_order <= max_threshold_seq
        ).first()
        return row is not None
    except Exception as exc:
        logger.warning("_is_future_threshold_approver_db error: %s", exc)
        return False


def _is_posting_approver_db(db: Session, invoice_id: int, email: str) -> bool:
    """
    Query the DB to determine if `email` is the posting approver (last level).
    """
    if not _has_posting_db(db, invoice_id):
        return False
    try:
        from sqlalchemy import func as sqla_func
        max_seq = db.query(sqla_func.max(InvoiceAssignedApprover.sequence_order)).filter(
            InvoiceAssignedApprover.invoice_id == invoice_id
        ).scalar() or 0

        if max_seq == 0:
            return False

        row = db.query(InvoiceAssignedApprover).filter(
            InvoiceAssignedApprover.invoice_id == invoice_id,
            InvoiceAssignedApprover.approver_email.ilike(email),
            InvoiceAssignedApprover.sequence_order == max_seq
        ).first()
        return row is not None
    except Exception as exc:
        logger.warning("_is_posting_approver_db error: %s", exc)
        return False


def _is_last_level_approver_db(db: Session, invoice_id: int, email: str) -> bool:
    """
    Query the DB to determine if `email` is assigned to the last level (max_seq) of the workflow.
    """
    try:
        from sqlalchemy import func as sqla_func
        max_seq = db.query(sqla_func.max(InvoiceAssignedApprover.sequence_order)).filter(
            InvoiceAssignedApprover.invoice_id == invoice_id
        ).scalar() or 0

        if max_seq == 0:
            return False

        row = db.query(InvoiceAssignedApprover).filter(
            InvoiceAssignedApprover.invoice_id == invoice_id,
            InvoiceAssignedApprover.approver_email.ilike(email),
            InvoiceAssignedApprover.sequence_order == max_seq
        ).first()
        return row is not None
    except Exception as exc:
        logger.warning("_is_last_level_approver_db error: %s", exc)
        return False


def _is_finance_level_db(db: Session, invoice_id: int, level: int) -> bool:
    """Check if a specific level is a Finance Team (pool-expanded) level in DB."""
    try:
        row = db.query(InvoiceAssignedApprover).filter(
            InvoiceAssignedApprover.invoice_id == invoice_id,
            InvoiceAssignedApprover.sequence_order == level,
            InvoiceAssignedApprover.is_finance == True
        ).first()
        return row is not None
    except: return False


def _has_threshold_db(db: Session, invoice_id: int) -> bool:
    """Check if invoice has a threshold stage in DB."""
    try:
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        if invoice and invoice.approver_breakdown:
            bd = json.loads(invoice.approver_breakdown) if isinstance(invoice.approver_breakdown, str) else invoice.approver_breakdown
            if isinstance(bd, dict) and "has_threshold_approver" in bd:
                return bool(bd.get("has_threshold_approver"))

        from sqlalchemy import func as sqla_func
        max_seq = db.query(sqla_func.max(InvoiceAssignedApprover.sequence_order)).filter(
            InvoiceAssignedApprover.invoice_id == invoice_id
        ).scalar() or 0
        if max_seq <= 1: return False
        count = db.query(InvoiceAssignedApprover).filter(
            InvoiceAssignedApprover.invoice_id == invoice_id,
            InvoiceAssignedApprover.is_finance == False,
            InvoiceAssignedApprover.sequence_order > 1,
            InvoiceAssignedApprover.sequence_order < max_seq
        ).count()
        return count > 0
    except: return False


def _has_posting_db(db: Session, invoice_id: int) -> bool:
    """Check if invoice has a posting stage in DB."""
    try:
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        if invoice and invoice.approver_breakdown:
            bd = json.loads(invoice.approver_breakdown) if isinstance(invoice.approver_breakdown, str) else invoice.approver_breakdown
            if isinstance(bd, dict) and "has_posting_approver" in bd:
                return bool(bd.get("has_posting_approver"))

        from sqlalchemy import func as sqla_func
        max_seq = db.query(sqla_func.max(InvoiceAssignedApprover.sequence_order)).filter(
            InvoiceAssignedApprover.invoice_id == invoice_id
        ).scalar() or 0
        return max_seq > 0
    except: return False


def _get_workflow_data(
    db: Session,
    invoice: Invoice,
    entity: str,
) -> Dict:
    """
    Resolve the full workflow requirement object for an invoice.
    Uses vendor-based first, then codification-based (mirrors backend logic).
    """
    total_amount = get_invoice_total_from_invoice(db, invoice.id)
    return get_required_approver_count(
        db=db,
        vendor_name=invoice.vendor_name,
        amount=total_amount,
        invoice_id=invoice.id,
        invoice_data=invoice,
        entity=entity,
    )


def _steps_for_invoice(db: Session, invoice_id: int) -> List[WorkflowStep]:
    return workflow_step_repo.get_multi(
        db,
        filters={"invoice_id": invoice_id},
        order_by="timestamp",
        limit=1000,
    )


def _record_step(
    db: Session,
    invoice_id: int,
    step_name: str,
    step_type: str,
    user_email: str,
    status: str = "completed",
    approver_number: Optional[int] = None,
    comment: Optional[str] = None,
    entity: Optional[str] = None,
) -> WorkflowStep:
    step = WorkflowStep(
        invoice_id=invoice_id,
        step_name=step_name,
        step_type=step_type,
        user=user_email,
        status=status,
        approver_number=approver_number,
        comment=comment,
        timestamp=get_ist_now(),
        entity=entity
    )
    db.add(step)
    db.flush()
    return step


def _update_invoice_status(db: Session, invoice: Invoice, new_status: str):
    invoice.status = new_status
    db.add(invoice)
    if new_status == InvoiceStatus.SAGE_POSTED:
        try:
            from common.services.file_manager import move_invoice_file
            new_path = move_invoice_file(invoice.file_path, "posted_stage")
            if new_path:
                invoice.file_path = new_path
                logger.info(f"Moved invoice {invoice.id} PDF to posted_stage folder: {new_path}")
        except Exception as e:
            logger.error(f"Failed to move invoice {invoice.id} PDF on status change to SAGE_POSTED: {e}", exc_info=True)


def _advance_level(db: Session, invoice: Invoice, new_level: int):
    invoice.current_approver_level = new_level
    db.add(invoice)


def notify_next_approvers(db: Session, invoice: Invoice, next_level_data: Dict, background_tasks: BackgroundTasks):
    """
    Sends email notifications to the next set of approvers in the background.
    """
    emails = _parse_list(next_level_data.get("emails", []))
    is_finance = next_level_data.get("is_finance", False)
    
    # Expand finance emails if needed
    if is_finance:
        finance_emails = _get_finance_users(db, invoice.entity)
        emails = list(set(emails) | set(finance_emails))

    # Identify user emails who already approved a level in this cycle to avoid duplicate notifications
    steps = _steps_for_invoice(db, invoice.id)
    current_cycle_steps = _get_current_cycle_steps(steps)
    already_acted_emails = {
        s.user.lower() for s in current_cycle_steps
        if s.user and s.step_type in {
            StepType.LEVEL_APPROVED,
            StepType.THRESHOLD_APPROVED,
            StepType.POSTING_APPROVED,
            StepType.APPROVED
        }
    }
        
    for next_email in emails:
        if not next_email: continue
        if next_email.lower() in already_acted_emails:
            logger.info(f"[Workflow] Skipping approval notification to {next_email} because they already acted in this cycle.")
            continue
        
        # Fetch username for personal touch if possible
        approver_user = db.query(User).filter(User.email == next_email).first()
        approver_name = approver_user.username if approver_user else "Approver"
        
        total_amount = get_invoice_total_from_invoice(db, invoice.id)
        
        # Extract currency
        extracted_data = {}
        if invoice.extracted_data:
            try:
                extracted_data = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
            except: pass
        currency = extracted_data.get("invoice_details", {}).get("currency", {}).get("value", "USD")

        background_tasks.add_task(
            email_service.send_approval_request_email,
            email=next_email,
            username=approver_name,
            vendor_name=invoice.vendor_name or "Unknown",
            invoice_number=invoice.invoice_number or "N/A",
            amount=str(total_amount),
            currency=currency
        )


def _get_approved_levels(steps: List[WorkflowStep]) -> Dict[int, List[str]]:
    """
    Returns {level: [emails_that_approved_at_this_level]}
    from recorded StepType.LEVEL_APPROVED steps.
    """
    result: Dict[int, List[str]] = {}
    for s in steps:
        if s.step_type == StepType.LEVEL_APPROVED and s.approver_number is not None:
            result.setdefault(s.approver_number, []).append(
                (s.user or "").lower()
            )
    return result


def _threshold_approved(steps: List[WorkflowStep]) -> bool:
    return any(s.step_type == StepType.THRESHOLD_APPROVED for s in steps)


def _get_current_cycle_steps(steps: List[WorkflowStep]) -> List[WorkflowStep]:
    """
    Returns only the steps that occurred after the most recent 'reset' event
    (REWORKED or RECALLED). If no reset occurred, returns all steps.
    """
    if not steps:
        return []
    
    # Reset types
    resets = {StepType.REWORKED, StepType.RECALLED}
    
    # Find the index of the latest reset
    latest_reset_idx = -1
    for i in range(len(steps) - 1, -1, -1):
        if steps[i].step_type in resets:
            latest_reset_idx = i
            break
            
    if latest_reset_idx == -1:
        return steps
    
    return steps[latest_reset_idx + 1:]


def _posting_approved(steps: List[WorkflowStep]) -> bool:
    return any(s.step_type == StepType.POSTING_APPROVED for s in steps)


def _reconstruct_workflow_state(steps: List[WorkflowStep], mandatory_count: int) -> tuple[Dict[int, List[str]], bool, bool]:
    """
    Chronologically reconstructs the workflow state of approvals.
    Properly handles partial reworks so that previous levels are not incorrectly
    considered unapproved when a rework goes back to a middle level.
    """
    import re
    approved_levels: Dict[int, List[str]] = {}
    threshold_done = False
    posting_done = False
    
    for s in steps:
        if s.step_type == StepType.LEVEL_APPROVED and s.approver_number is not None:
            approved_levels.setdefault(s.approver_number, []).append((s.user or "").lower())
        elif s.step_type == StepType.THRESHOLD_APPROVED:
            threshold_done = True
        elif s.step_type == StepType.POSTING_APPROVED:
            posting_done = True
        elif s.step_type == StepType.APPROVED:
            threshold_done = True
            posting_done = True
        elif s.step_type in {StepType.REWORKED, StepType.RECALLED}:
            if s.step_type == StepType.RECALLED:
                approved_levels.clear()
                threshold_done = False
                posting_done = False
            else:
                # REWORKED
                target_level = 1
                if s.approver_number and s.approver_number > 1:
                    target_level = s.approver_number - 1
                if s.step_name:
                    match = re.search(r'Level\s*(\d+)', s.step_name)
                    if match:
                        target_level = int(match.group(1))
                
                # Remove any approved levels >= target_level
                keys_to_remove = [k for k in approved_levels.keys() if k >= target_level]
                for k in keys_to_remove:
                    approved_levels.pop(k, None)
                    
                # Reset threshold/posting if the rework affected mandatory or previous virtual stages
                if target_level <= mandatory_count:
                    threshold_done = False
                    posting_done = False
                elif target_level == mandatory_count + 1:
                    threshold_done = False
                    posting_done = False
                elif target_level == mandatory_count + 2:
                    posting_done = False
                    
    return approved_levels, threshold_done, posting_done



def _level_is_complete(
    db: Session,
    level_entry: Dict,
    approved_emails_at_level: List[str],
    finance_users: List[str],
    entity: str,
) -> bool:
    """
    A level is complete when ANY ONE authorized approver (original or delegate) has approved.
    """
    if not approved_emails_at_level:
        return False

    # Short circuit: Since approve_invocie already validates eligibility,
    # any recorded approval for this level counts as completion.
    return True


async def _finalize_and_post(db: Session, invoice: Invoice, current_user: UserResponse, email: str, entity: str, comment: str, step_name: str = "Invoice Approved", step_type: str = StepType.APPROVED):
    """
    Sets status to APPROVED, records approval steps, and triggers Sage posting.
    """
    invoice_id = invoice.id
    logger.info(f"[Workflow] Invoice {invoice_id} approved by {current_user.username} (Level/Action: {step_name})")

    from common.services.audit_service import audit_service
    from common.models.audit_log import AuditAction
    from common.models.invoice import InvoiceStatus
    from common.repository.repositories import invoice_repo
    
    # 1. Internal status: APPROVED
    _update_invoice_status(db, invoice, InvoiceStatus.APPROVED)
    
    # Record the specific level/posting step first
    _record_step(
        db, invoice_id,
        step_name=step_name,
        step_type=step_type,
        user_email=email,
        comment=comment,
        entity=entity,
    )
    
    # Also record the final "Fully Approved" step for clarity in history if it's different
    if step_type != StepType.APPROVED:
        _record_step(
            db, invoice_id,
            step_name="Invoice Fully Approved",
            step_type=StepType.APPROVED,
            user_email=email,
            comment="All approval levels completed.",
            entity=entity,
        )

    await audit_service.log_action(
        db=db,
        invoice_id=invoice_id,
        action=AuditAction.APPROVED,
        user=current_user.username,
        entity=entity,
        details={"comment": comment, "final_step": step_name}
    )
    db.commit()

    # 2. Trigger Sage Posting
    sage_result = await _post_to_sage(invoice_id, entity, db)

    if sage_result["success"]:
        invoice = invoice_repo.get(db, invoice_id)
        _update_invoice_status(db, invoice, InvoiceStatus.SAGE_POSTED)
        
        # Use the correct column name 'sage_bill_number' from db_models.py
        actual_bill_no = sage_result.get("sage_bill_number")
        invoice.sage_bill_number = actual_bill_no
        
        erp_name = settings.TOOL.capitalize()
        _record_step(
            db, invoice_id,
            step_name=f"Posted to {erp_name}",
            step_type=StepType.POSTED,
            user_email=email,
            comment=f"{erp_name} Bill Number: {actual_bill_no}",
            entity=entity,
        )
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id,
            action=AuditAction.SAGE_POSTED,
            user=current_user.username,
            entity=entity,
            details={f"{erp_name.lower()}_bill_number": actual_bill_no},
            sage_bill_number=actual_bill_no
        )
        db.commit()
        logger.info(f"[{erp_name}Post] Successfully posted invoice {invoice_id} to {erp_name} (Bill Number: {actual_bill_no})")
        return ActionResponse(
            success=True,
            message=f"Invoice approved and successfully posted to {erp_name}.",
            new_status=InvoiceStatus.SAGE_POSTED,
            sage_post_result=sage_result,
        )
    else:
        invoice = invoice_repo.get(db, invoice_id)
        _update_invoice_status(db, invoice, InvoiceStatus.SAGE_POST_FAILED)
        _record_step(
            db, invoice_id,
            step_name="Sage Post Failed",
            step_type=StepType.POST_FAILED,
            user_email=email,
            comment=sage_result.get("message"),
            entity=entity,
        )
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id,
            action=AuditAction.SAGE_POST_FAILED,
            user=current_user.username,
            entity=entity,
            details={"error": sage_result.get("message")}
        )
        db.commit()
        logger.error(f"[SagePost] Sage posting failed for invoice {invoice_id}: {sage_result.get('message')}")
        return ActionResponse(
            success=False,
            message=f"Approved, but Sage posting failed: {sage_result['message']}",
            new_status=InvoiceStatus.SAGE_POST_FAILED,
            sage_post_result=sage_result,
        )


async def _post_to_sage(invoice_id: int, entity: str, db: Session) -> Dict:
    """
    Call the Sage posting logic.
    Returns {"success": bool, "message": str, "sage_bill_number": str|None}.
    """
    pdf_path = None
    try:
        from common.utils.erp_locator import get_erp_function
        post_ap_bill = get_erp_function("postapbill", "post_ap_bill")
        generate_approval_pdf = get_erp_function("services.pdf_service", "generate_approval_pdf")

        # 1. Fetch invoice
        invoice = invoice_repo.get(db, invoice_id)
        if not invoice:
            return {"success": False, "message": "Invoice not found", "sage_bill_number": None}

        # 2. Extract finalized coding details FIRST (Capture at approval)
        # This must happen before PDF generation so the PDF reads the correct per-item coding.
        hc, line_items = _get_finalized_coding_data(invoice)
        
        # Synchronously update the coding record so the DB is consistent before PDF is rendered
        if invoice.coding:
            from common.repository.repositories import coding_repo
            invoice.coding.header_coding = json.dumps(hc) if hc else None
            invoice.coding.line_items = json.dumps(line_items) if line_items else None
            db.add(invoice.coding)
            db.flush()
            logger.info(f"[SagePost] Finalized coding captured and saved for invoice {invoice_id}")

        # 3. Generate Approval PDF AFTER coding is flushed to DB
        try:
             pdf_path = generate_approval_pdf(db, invoice_id)
             logger.info(f"[SagePost] Approval report path: {pdf_path}")
        except Exception as pdf_err:
             logger.error(f"[SagePost] Error ensuring approval PDF: {pdf_err}", exc_info=True)

        # Robust extraction: if header fields are missing, try to get from first line item
        if line_items and not hc.get("gl_code"):
            first = line_items[0]
            if not hc.get("gl_code"): hc["gl_code"] = first.get("gl_code")
            if not hc.get("department"): hc["department"] = first.get("department") or first.get("department_id")
            if not hc.get("item"): hc["item"] = first.get("item") or first.get("item_id")
            if not hc.get("lob"): hc["lob"] = first.get("lob") or first.get("class")

        # 4. Resolve Sage Location ID dynamically
        # Mapping: DEFAULT/None -> "" (Top Level), otherwise use entity ID
        raw_entity = str(invoice.entity).strip() if invoice.entity else ""
        sage_location = raw_entity if raw_entity.upper() != "DEFAULT" else ""

        # 5. Call Sage Posting Logic
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
            sage_response = post_result.get("data", {})
            # User requested Sage bill number to be same as invoice number
            intended_bill_no = f"{invoice.invoice_number}"
            sage_bill_no = sage_response.get("billNumber") or intended_bill_no
            erp_name = settings.TOOL.capitalize()
            return {
                "success": True,
                "message": f"Posted to {erp_name} successfully",
                "sage_bill_number": sage_bill_no,
            }
        else:
            return {
                "success": False,
                "message": post_result.get("error") if post_result else "Unknown error",
                "sage_bill_number": None,
            }

    except Exception as exc:
        logger.error("Sage posting error for invoice %s: %s", invoice_id, exc, exc_info=True)
        return {
            "success": False,
            "message": str(exc),
            "sage_bill_number": None,
        }
    finally:
        if pdf_path:
            try:
                import os
                if os.path.exists(pdf_path):
                    os.remove(pdf_path)
                    logger.info(f"[SagePost] Deleted local PDF file: {pdf_path}")
            except Exception as e:
                logger.warning(f"[SagePost] Failed to delete local PDF {pdf_path}: {e}")



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

    # Fallback to existing coding if no snapshot exists (should not happen if saved via new UI)
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


# ─────────────────────────────────────────────
# Authorization helper
# ─────────────────────────────────────────────

def _resolve_user_role_in_workflow(
    db: Session,
    invoice_id: int,
    current_user_email: str,
    workflow: Dict,
    steps: List[WorkflowStep],
    finance_users: List[str],
    current_level: int,
    entity: str,
) -> Dict:
    """
    Returns a dict describing the logged-in user's current position in the workflow.
    Keys:
      user_level           – mandatory level index or None
      is_finance_team      – bool
      is_threshold_approver – bool
      is_posting_approver  – bool
      level_already_approved – bool
      already_acted        – bool (this specific user already took an action)
      can_act              – bool (should action buttons be shown at all)
    """
    email = current_user_email.lower()
    assigned: List[Dict] = workflow.get("assigned_approvers", [])
    
    # Filter steps to the current cycle (post-rework/recall)
    current_cycle_steps = _get_current_cycle_steps(steps)
    
    # Reconstruct active approval states from full step history to handle partial reworks correctly
    mandatory = [a for a in assigned if a.get("type") == "mandatory"]
    approved_levels, threshold_done, posting_done = _reconstruct_workflow_state(steps, len(mandatory))


    # Determine if user is the posting/threshold approver via DB-authoritative check
    # (Snapshot reconstruction often loses the 'type' field, marking everything as mandatory).
    has_posting = _has_posting_db(db, invoice_id)
    db_is_posting = _is_posting_approver_db(db, invoice_id, email) or (not has_posting and _is_last_level_approver_db(db, invoice_id, email))
    db_is_threshold = _is_future_threshold_approver_db(db, invoice_id, email, current_level)

    result = {
        "user_level": None,
        "is_finance_team": email in [f.lower() for f in finance_users],
        "is_threshold_approver": db_is_threshold,
        "is_posting_approver": db_is_posting,
        "level_already_approved": False,
        "already_acted": any((s.user or "").lower() == email for s in current_cycle_steps),
        "can_act": False,
    }

    # ── Posting/Threshold approver check (Fallback for explicit workflow entries) ──
    for entry in assigned:
        entry_type = entry.get("type")
        emails = [e.lower() for e in _parse_list(entry.get("emails", []))]
        if email in emails:
            if entry_type == "posting":
                result["is_posting_approver"] = True
            elif entry_type == "threshold":
                result["is_threshold_approver"] = True

    # Walk assigned_approvers
    mandatory = [a for a in assigned if a.get("type") == "mandatory"]
    threshold_entries = [a for a in assigned if a.get("type") == "threshold"]
    posting_entries = [a for a in assigned if a.get("type") == "posting"]

    # ── Posting approver check ──
    for pe in posting_entries:
        if email in [e.lower() for e in _parse_list(pe.get("emails", []))]:
            result["is_posting_approver"] = True

    # ── Threshold approver check ──
    for te in threshold_entries:
        if email in [e.lower() for e in _parse_list(te.get("emails", []))]:
            result["is_threshold_approver"] = True

    # ── Mandatory level check ──
    for entry in mandatory:
        lvl = entry.get("level")
        is_finance = entry.get("is_finance", False)
        emails_at_level = [e.lower()
                           for e in _parse_list(entry.get("emails", []))]

        # Delegation check
        delegated_at_level = False
        for o_email in emails_at_level:
            if not o_email:
                continue
            subs = check_active_delegation(db, o_email, entity)
            if email in [s.lower() for s in subs]:
                delegated_at_level = True
                break

        user_in_level = (
            (is_finance and result["is_finance_team"])
            or (email in emails_at_level)
            or delegated_at_level
        )
        if user_in_level:
            result["user_level"] = lvl
            result["level_already_approved"] = bool(
                approved_levels.get(lvl)
            )
            break

    # ── Determine if user can act RIGHT NOW ──
    mandatory_levels_done = all(
        bool(approved_levels.get(e.get("level")))
        for e in mandatory
    )

    has_threshold = bool(threshold_entries) or _has_threshold_db(db, invoice_id)
    has_posting = bool(posting_entries) or _has_posting_db(db, invoice_id)

    # Check for direct eligibility at the current level
    # This covers mandatory levels AND reconstructed threshold/posting levels
    current_entry = next((e for e in mandatory if e.get("level") == current_level), None)
    if current_entry:
        is_fin_lvl = current_entry.get("is_finance", False)
        emails_at_lvl = [e.lower() for e in _parse_list(current_entry.get("emails", []))]
        
        # Check eligibility for THIS specific level
        is_assigned_at_later_level = False
        from sqlalchemy import func as sqla_func
        max_seq = db.query(sqla_func.max(InvoiceAssignedApprover.sequence_order)).filter(
            InvoiceAssignedApprover.invoice_id == invoice_id
        ).scalar() or 0

        for idx, entry in enumerate(assigned):
            entry_level = entry.get("level") or (idx + 1)
            if entry_level > current_level:
                is_entry_posting = (
                    entry.get("type") == "posting"
                    or (has_posting and entry_level == max_seq)
                )
                if is_entry_posting or entry.get("is_finance"):
                    continue
                entry_emails = [e.lower() for e in _parse_list(entry.get("emails", []))]
                if email in entry_emails:
                    is_assigned_at_later_level = True
                    break

        is_threshold_at_lower_level = _is_future_threshold_approver_db(db, invoice_id, email, current_level)

        if is_threshold_at_lower_level or is_assigned_at_later_level:
            is_eligible = False
        else:
            is_eligible = (
                (is_fin_lvl and result["is_finance_team"])
                or (email in emails_at_lvl)
                or any(email in [s.lower() for s in check_active_delegation(db, e, entity)] for e in emails_at_lvl)
            )
        if is_eligible:
            # Scoped to current mandatory level
            # IMPORTANT: Re-derive level_already_approved for THIS specific
            # level — do NOT use result["level_already_approved"] which was set
            # by the mandatory loop above and may reflect a *different* level
            # (e.g. the user appears in both level 2 and level 4; the loop
            # matched level 2 first and stamped level_already_approved=True).
            current_level_approved = bool(approved_levels.get(current_level))
            already_acted_here = any(
                (s.user or "").lower() == email 
                and s.step_type == StepType.LEVEL_APPROVED 
                and s.approver_number == current_level
                for s in current_cycle_steps
            )
            # Rule: if a user already acted at ANY other mandatory level in this cycle
            # they cannot act again at this level — UNLESS they are the posting approver
            # (posting approvers are allowed at their mandatory level + posting stage).
            acted_in_current_cycle = any(
                (s.user or "").lower() == email
                and s.step_type == StepType.LEVEL_APPROVED
                and s.approver_number != current_level
                for s in current_cycle_steps
            )
            acted_in_valid_previous_level = any(
                email in emails and lvl != current_level
                for lvl, emails in approved_levels.items()
            )
            already_acted_at_other_mandatory = (
                not (result["is_posting_approver"] and has_posting)
                and (acted_in_current_cycle or acted_in_valid_previous_level)
            )
            result["can_act"] = (
                not current_level_approved
                and not already_acted_here
                and not already_acted_at_other_mandatory
            )
            result["user_level"] = current_level
            result["level_already_approved"] = current_level_approved  # fix stale value

    # Explicit stage-based eligibility for virtual Posting/Threshold levels
    if not result["can_act"]:
        if has_threshold and not threshold_done:
            delegated_threshold = False
            for o_email in [e.lower() for te in threshold_entries for e in _parse_list(te.get("emails", []))]:
                if not o_email: continue
                subs = check_active_delegation(db, o_email, entity)
                if email in [s.lower() for s in subs]:
                    delegated_threshold = True
                    break
            if result["is_threshold_approver"] or delegated_threshold:
                already_threshold = any(
                    (s.user or "").lower() == email 
                    and s.step_type == StepType.THRESHOLD_APPROVED 
                    for s in current_cycle_steps
                )
                result["can_act"] = not already_threshold

        # NOTE: standalone `if` (not elif) — posting must be evaluated even when
        # threshold is present but already done (threshold_done=True).
        if not result["can_act"] and has_posting and not posting_done:
            delegated_posting = False
            for o_email in [e.lower() for pe in posting_entries for e in _parse_list(pe.get("emails", []))]:
                if not o_email: continue
                subs = check_active_delegation(db, o_email, entity)
                if email in [s.lower() for s in subs]:
                    delegated_posting = True
                    break
            if result["is_posting_approver"] or delegated_posting:
                already_posting = any(
                    (s.user or "").lower() == email 
                    and s.step_type == StepType.POSTING_APPROVED 
                    for s in current_cycle_steps
                )
                result["can_act"] = not already_posting
    # else: all done — no one can act

    return result


def _get_rework_error(db: Session, current_level: int, assigned: List[Dict]) -> Optional[str]:
    """
    Checks if rework is possible from the current level.
    If current_level == 1, rework goes to coder (always possible).
    If current_level > 1, checks if previous level is finance.
    Returns None if OK, or a descriptive error message.
    """
    if current_level <= 1:
        return None  # Rework to coder is always allowed
        
    prev_level_num = current_level - 1
    prev_level_entry = next((a for a in assigned if a.get("level") == prev_level_num), None)
    
    if not prev_level_entry:
        return "No previous approval level found to rework to."
        
    is_prev_finance = False
    if prev_level_entry.get("is_finance"):
        is_prev_finance = True
    else:
        # Check if any user at this level belongs to the finance department
        prev_emails = _parse_list(prev_level_entry.get("emails", []))
        if prev_emails:
            # Use a case-insensitive check for "finance"
            fin_user = db.query(User).filter(
                User.email.in_(prev_emails),
                func.lower(User.department) == "finance"
            ).first()
            if fin_user:
                is_prev_finance = True
                
    if not is_prev_finance:
        return "Previous level approver was not a finance team"
        
    return None


@router.post("/status", response_model=ApproverUIStatus)
async def get_ui_status_from_frontend(
    payload: Dict = Body(...),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
):
    invoice_id = payload.get("invoice_id")
    # Fetch fresh data from DB to avoid stale frontend state issues
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    assigned = payload.get("assigned_approvers", [])
    current_level = invoice.current_approver_level or 1
    current_status = (
        invoice.status.value
        if hasattr(invoice.status, "value")
        else str(invoice.status)
    )
 
    email = current_user.email.lower()
    finance_users = _get_finance_users(db, entity)
    is_finance = email in [f.lower() for f in finance_users]
 
    steps = _steps_for_invoice(db, invoice_id)
    # ── Filter steps to the current cycle (post-rework/recall) ──
    steps_for_level_check = _get_current_cycle_steps(steps)

    mandatory = [a for a in assigned if a.get("type") == "mandatory"]
    threshold_entries = [a for a in assigned if a.get("type") == "threshold"]
    posting_entries = [a for a in assigned if a.get("type") == "posting"]
 
    # Reconstruct active approval states from full step history to handle partial reworks correctly
    approved_levels, threshold_done, posting_done = _reconstruct_workflow_state(steps, len(mandatory))

 
    mandatory_levels_done = all(
        bool(approved_levels.get(e.get("level"))) for e in mandatory
    )
    has_threshold = bool(threshold_entries) or _has_threshold_db(db, invoice_id)
    has_posting = bool(posting_entries) or _has_posting_db(db, invoice_id)
 
    # ── Posting approver check ──
    posting_emails = []
    for pe in posting_entries:
        posting_emails.extend(_parse_list(pe.get("emails", [])))
    is_posting_approver = (
        email in [e.lower() for e in posting_emails]
        or _is_posting_approver_db(db, invoice_id, email)
        or (not has_posting and _is_last_level_approver_db(db, invoice_id, email))
    )
 
    # ── Threshold approver check ──
    threshold_emails = []
    for te in threshold_entries:
        threshold_emails.extend(_parse_list(te.get("emails", [])))
    is_threshold_approver = (
        email in [e.lower() for e in threshold_emails]
        or _is_future_threshold_approver_db(db, invoice_id, email, current_level)
    )
 
    # ── already_acted defined HERE so all branches below can safely use it ──
    # FIX: was defined after the explicit check block, causing NameError when
    # can_act was False and the block tried to evaluate `not already_acted`.
    # FIX: use steps_for_level_check to only look at the current cycle
    already_acted = any((s.user or "").lower() == email for s in steps_for_level_check)
 
    # ── can_act logic ────────────────────────────────────────────────────────
    can_act = False
 
    if not mandatory_levels_done:
        current_entry = next(
            (a for a in mandatory if a.get("level") == current_level), None
        )
        if current_entry:
            is_finance_level = current_entry.get("is_finance", False)
            emails_at_level = [e.lower() for e in _parse_list(
                current_entry.get("emails", []))]
 
            delegated_authority = False
            for orig_email in emails_at_level:
                if not orig_email:
                    continue
                substitutes = check_active_delegation(db, orig_email, entity)
                if email in [s.lower() for s in substitutes]:
                    delegated_authority = True
                    break
 
            # Block threshold approvers from acting at Finance Team levels (DB check).
            #authoritative check for is_finance_level using DB.
            is_fin_lvl_db = is_finance_level or _is_finance_level_db(db, invoice_id, current_level)
            
            is_assigned_at_later_level = False
            from sqlalchemy import func as sqla_func
            max_seq = db.query(sqla_func.max(InvoiceAssignedApprover.sequence_order)).filter(
                InvoiceAssignedApprover.invoice_id == invoice_id
            ).scalar() or 0

            for idx, entry in enumerate(assigned):
                entry_level = entry.get("level") or (idx + 1)
                if entry_level > current_level:
                    is_entry_posting = (
                        entry.get("type") == "posting"
                        or (has_posting and entry_level == max_seq)
                    )
                    if is_entry_posting or entry.get("is_finance"):
                        continue
                    entry_emails = [e.lower() for e in _parse_list(entry.get("emails", []))]
                    if email in entry_emails:
                        is_assigned_at_later_level = True
                        break


            is_threshold_at_lower_level = _is_future_threshold_approver_db(db, invoice_id, email, current_level)

            if is_threshold_at_lower_level or is_assigned_at_later_level:
                user_in_level = False
            else:
                user_in_level = (
                    (is_finance_level and is_finance)
                    or (email in emails_at_level)
                    or delegated_authority
                )
            already_acted_here = any(
                (s.user or "").lower() == email
                and s.step_type == StepType.LEVEL_APPROVED
                and s.approver_number == current_level
                for s in steps_for_level_check
            )
            # Rule: if user already acted at any OTHER mandatory level in this cycle,
            # disable their button at this level — UNLESS this is the posting stage.
            # We determine posting stage by checking if it's the max sequence.
            from sqlalchemy import func as sqla_func
            max_seq = db.query(sqla_func.max(InvoiceAssignedApprover.sequence_order)).filter(
                InvoiceAssignedApprover.invoice_id == invoice_id
            ).scalar() or 0

            acted_in_current_cycle = any(
                (s.user or "").lower() == email
                and s.step_type == StepType.LEVEL_APPROVED
                and s.approver_number != current_level
                for s in steps_for_level_check
            )
            acted_in_valid_previous_level = any(
                email in emails and lvl != current_level
                for lvl, emails in approved_levels.items()
            )
            already_acted_at_other_mandatory = (
                not (is_posting_approver and has_posting and current_level == max_seq)
                and (acted_in_current_cycle or acted_in_valid_previous_level)
            )
            can_act = user_in_level and not already_acted_here and not already_acted_at_other_mandatory
 
    elif has_threshold and not threshold_done:
        delegated_threshold = False
        for orig_email in threshold_emails:
            if not orig_email:
                continue
            substitutes = check_active_delegation(db, orig_email, entity)
            if email in [s.lower() for s in substitutes]:
                delegated_threshold = True
                break
 
        already_threshold = any(
            (s.user or "").lower() == email
            and s.step_type == StepType.THRESHOLD_APPROVED
            for s in steps_for_level_check
        )
        can_act = (
            is_threshold_approver or delegated_threshold) and not already_threshold
 
    # NOTE: standalone `if` (not elif) — posting must be evaluated even when threshold
    # is present but already done. Without this, a user who is both threshold and
    # posting approver would be locked out of the posting stage after threshold approval.
    if not can_act and has_posting and not posting_done:
        delegated_posting = False
        for orig_email in posting_emails:
            if not orig_email:
                continue
            substitutes = check_active_delegation(db, orig_email, entity)
            if email in [s.lower() for s in substitutes]:
                delegated_posting = True
                break

        already_posting_approved = any(
            (s.user or "").lower() == email
            and s.step_type == StepType.POSTING_APPROVED
            for s in steps_for_level_check
        )
        # can_act is NOT set here to avoid incorrectly enabling buttons at earlier mandatory levels.
        # It will be set in the explicit fallback block below if the level is correct.
 
    # ── Explicit fallback for virtual Posting/Threshold levels ───────────────
    # FIX: replaced `not already_acted` with stage-specific checks so a posting
    # approver who acted at a mandatory level is not incorrectly blocked here.
    if not can_act:
        if is_posting_approver:
            already_posting_approved = any(
                (s.user or "").lower() == email
                and s.step_type == StepType.POSTING_APPROVED
                for s in steps_for_level_check
            )
            # Guard: posting approver can only act once threshold (if any) is done
            posting_stage_ready = not has_threshold or threshold_done
            if current_level > len(mandatory) and not already_posting_approved and posting_stage_ready:
                can_act = True
            else:
                current_lvl_entry = next(
                    (e for e in assigned if e.get("level") == current_level), None)
                if current_lvl_entry and current_lvl_entry.get("type") == "posting" and not already_posting_approved and posting_stage_ready:
                    can_act = True
 
        elif is_threshold_approver:
            already_threshold_approved = any(
                (s.user or "").lower() == email
                and s.step_type == StepType.THRESHOLD_APPROVED
                for s in steps_for_level_check
            )
            if current_level > len(mandatory) and not already_threshold_approved:
                can_act = True
            else:
                current_lvl_entry = next(
                    (e for e in assigned if e.get("level") == current_level), None)
                if current_lvl_entry and current_lvl_entry.get("type") == "threshold" and not already_threshold_approved:
                    can_act = True
 
    # ── can_enable_editing logic ─────────────────────────────────────────────
    can_enable_editing = (
        (is_finance or is_threshold_approver or is_posting_approver)
        and can_act
    )
 
    # Pre-calculate delegated flags for the response
    delegated_finance = False
    for f_user in finance_users:
        subs = check_active_delegation(db, f_user, entity)
        if email in [s.lower() for s in subs]:
            delegated_finance = True
            break
 
    delegated_posting = False
    for p_email in posting_emails:
        if not p_email:
            continue
        subs = check_active_delegation(db, p_email, entity)
        if email in [s.lower() for s in subs]:
            delegated_posting = True
            break
 
    rework_error = _get_rework_error(db, current_level, assigned)

    return ApproverUIStatus(
        invoice_id=str(invoice_id),
        current_status=current_status,
        current_level=current_level,
        workflow_type=payload.get("workflow_type"),
        can_approve=can_act,
        can_reject=can_act,
        can_rework=can_act,
        can_enable_editing=can_enable_editing,
        can_repost_sage=current_status == InvoiceStatus.SAGE_POST_FAILED and is_posting_approver,
        is_posting_approver=is_posting_approver,
        is_threshold_approver=is_threshold_approver,
        is_finance_team=is_finance,
        user_level=current_level,
        level_already_approved=bool(approved_levels.get(current_level)),
        already_acted=already_acted,
        assigned_approvers=assigned,
        sage_post_error=None,
        rework_error=rework_error,
    )

@router.post("/approve/{invoice_id}", response_model=ActionResponse)
async def approve_invoice(
    invoice_id: int,
    payload: ActionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
):
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    _check_concurrency(db, invoice, payload.last_updated_at, current_user)

    current_status = (
        invoice.status.value
        if hasattr(invoice.status, "value")
        else str(invoice.status)
    )

    if current_status not in (InvoiceStatus.WAITING_APPROVAL, InvoiceStatus.REWORKED):
        raise HTTPException(
            400, f"Invoice is not awaiting approval (status: {current_status})")

    workflow = _get_workflow_data(db, invoice, entity)
    steps = _steps_for_invoice(db, invoice_id)
    approval_types = [StepType.LEVEL_APPROVED, StepType.THRESHOLD_APPROVED, StepType.POSTING_APPROVED, StepType.APPROVED]
    finance_users = _get_finance_users(db, entity)
    current_level = invoice.current_approver_level or 1
    email = current_user.email.lower()

    assigned: List[Dict] = workflow.get("assigned_approvers", [])
    mandatory = [a for a in assigned if a.get("type") == "mandatory"]
    threshold_entries = [a for a in assigned if a.get("type") == "threshold"]
    posting_entries = [a for a in assigned if a.get("type") == "posting"]

    # ── Filter steps to the current cycle (post-rework/recall) ──
    current_cycle_steps = _get_current_cycle_steps(steps)

    # Reconstruct active approval states from full step history to handle partial reworks correctly
    approved_levels, threshold_done, posting_done_already = _reconstruct_workflow_state(steps, len(mandatory))


    mandatory_levels_done = all(
        bool(approved_levels.get(e.get("level"))) for e in mandatory
    )
    has_threshold = bool(threshold_entries)
    has_posting = bool(posting_entries) or _has_posting_db(db, invoice_id)

    # ── CASE A: Mandatory levels ──
    if current_level <= len(mandatory):
        level_entry = next(
            (e for e in mandatory if e.get("level") == current_level), None
        )
        if level_entry is None:
            raise HTTPException(
                400, "No workflow level entry found for current level")

        is_finance_level = level_entry.get("is_finance", False)
        emails_at_level = [e.lower()
                           for e in _parse_list(level_entry.get("emails", []))]

        # Delegation check
        delegated_authority = False
        for orig_email in emails_at_level:
            if not orig_email:
                continue
            substitutes = check_active_delegation(db, orig_email, entity)
            if email in [s.lower() for s in substitutes]:
                delegated_authority = True
                break

        # ── Block threshold approvers and future level approvers from acting at lower levels ──
        # Query the DB directly — the snapshot reconstruction loses 'type' info,
        # so we cannot rely on threshold_entries being populated here.
        is_threshold_approver_here = _is_future_threshold_approver_db(db, invoice_id, email, current_level)

        is_posting_approver_here = (
            email in [e.lower() for pe in posting_entries for e in _parse_list(pe.get("emails", []))]
            or _is_posting_approver_db(db, invoice_id, email)
        )

        is_assigned_at_later_level = False
        from sqlalchemy import func as sqla_func
        max_seq = db.query(sqla_func.max(InvoiceAssignedApprover.sequence_order)).filter(
            InvoiceAssignedApprover.invoice_id == invoice_id
        ).scalar() or 0

        for idx, entry in enumerate(assigned):
            entry_level = entry.get("level") or (idx + 1)
            if entry_level > current_level:
                is_entry_posting = (
                    entry.get("type") == "posting"
                    or (has_posting and entry_level == max_seq)
                )
                if is_entry_posting or entry.get("is_finance"):
                    continue
                entry_emails = [e.lower() for e in _parse_list(entry.get("emails", []))]
                if email in entry_emails:
                    is_assigned_at_later_level = True
                    break


        user_eligible = (
            (is_finance_level and email in [f.lower() for f in finance_users])
            or (not is_finance_level and email in emails_at_level)
            or delegated_authority
        )
        if is_threshold_approver_here or is_assigned_at_later_level:
            user_eligible = False

        if not user_eligible:
            if is_threshold_approver_here:
                raise HTTPException(
                    403, "You are a threshold approver and cannot act at earlier levels.")
            if is_assigned_at_later_level:
                raise HTTPException(
                    403, "You are assigned to a later level of this workflow and cannot approve at an earlier level.")
            raise HTTPException(
                403, f"You are not an approver for level {current_level}")

        if bool(approved_levels.get(current_level)):
            raise HTTPException(
                400, f"Level {current_level} has already been approved")

        # Check if user already acted at THIS SPECIFIC mandatory level.
        already = any(
            (s.user or "").lower() == email
            and s.step_type == StepType.LEVEL_APPROVED
            and s.approver_number == current_level
            for s in current_cycle_steps
        )
        if already:
            raise HTTPException(400, f"You have already acted at level {current_level}")

        # Rule: block a user who already acted at a DIFFERENT mandatory level in this
        # cycle from acting again here — UNLESS they are the posting approver.
        # Posting approvers (e.g. approver_3) are allowed at their mandatory level
        # AND later at the posting stage.
        is_posting_approver_here = (
            email in [e.lower() for pe in posting_entries for e in _parse_list(pe.get("emails", []))]
            or _is_posting_approver_db(db, invoice_id, email)
            or (not has_posting and _is_last_level_approver_db(db, invoice_id, email))
        )
        acted_in_current_cycle = any(
            (s.user or "").lower() == email
            and s.step_type == StepType.LEVEL_APPROVED
            and s.approver_number != current_level
            for s in current_cycle_steps
        )
        acted_in_valid_previous_level = any(
            email in emails and lvl != current_level
            for lvl, emails in approved_levels.items()
        )
        
        from sqlalchemy import func as sqla_func
        max_seq = db.query(sqla_func.max(InvoiceAssignedApprover.sequence_order)).filter(
            InvoiceAssignedApprover.invoice_id == invoice_id
        ).scalar() or 0

        if not (is_posting_approver_here and has_posting and current_level == max_seq):
            if acted_in_current_cycle or acted_in_valid_previous_level:
                raise HTTPException(
                    400,
                    "You have already acted at a different approval level"
                )

        _record_step(
            db, invoice_id,
            step_name=f"Level {current_level} Approval",
            step_type=StepType.LEVEL_APPROVED,
            user_email=email,
            approver_number=current_level,
            comment=payload.comment,
            entity=entity,
        )

        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id,
            action=f"Approved (Level {current_level})",
            user=current_user.username,
            entity=entity,
            details={"comment": payload.comment}
        )
        # Record approver email in invoice.approved_by_list
        if email not in [a.approver_email.lower() for a in (invoice.approved_by_list or [])]:
            invoice.approved_by_list.append(InvoiceApprovedBy(approver_email=email))

        updated_approved_at_level = list(
            approved_levels.get(current_level, [])) + [email]
        level_complete = _level_is_complete(
            db, level_entry, updated_approved_at_level, finance_users, entity)

        if level_complete:
            next_mandatory = next(
                (e for e in mandatory if e.get("level", 0) > current_level), None
            )
            if next_mandatory:
                _advance_level(db, invoice, next_mandatory["level"])
                if invoice.status == InvoiceStatus.REWORKED:
                    _update_invoice_status(db, invoice, InvoiceStatus.WAITING_APPROVAL)
                
                # Notify next mandatory level
                notify_next_approvers(db, invoice, next_mandatory, background_tasks)
                
                db.commit()
                logger.info(f"[Workflow] Level {current_level} approved by {current_user.username} for invoice {invoice_id}. Moved to level {next_mandatory['level']}.")
                return ActionResponse(
                    success=True,
                    message=f"Level {current_level} approved. Moved to level {next_mandatory['level']}.",
                    new_status=invoice.status,
                    next_level=next_mandatory["level"],
                )
            else:
                if has_threshold and not threshold_done:
                    threshold_virtual_level = len(mandatory) + 1
                    _advance_level(db, invoice, threshold_virtual_level)
                    if invoice.status == InvoiceStatus.REWORKED:
                        _update_invoice_status(db, invoice, InvoiceStatus.WAITING_APPROVAL)
                    
                    # Notify threshold approvers
                    for te in threshold_entries:
                        notify_next_approvers(db, invoice, te, background_tasks)
                        
                    db.commit()
                    return ActionResponse(
                        success=True,
                        message="All mandatory levels approved. Awaiting threshold approver.",
                        new_status=invoice.status,
                        next_level=threshold_virtual_level,
                    )
                elif has_posting and not posting_done_already:
                    posting_virtual_level = len(
                        mandatory) + (2 if has_threshold else 1)
                    _advance_level(db, invoice, posting_virtual_level)
                    if invoice.status == InvoiceStatus.REWORKED:
                        _update_invoice_status(db, invoice, InvoiceStatus.WAITING_APPROVAL)
                    
                    # Notify posting approvers
                    for pe in posting_entries:
                        notify_next_approvers(db, invoice, pe, background_tasks)
                        
                    db.commit()
                    return ActionResponse(
                        success=True,
                        message="All mandatory levels approved. Awaiting posting approver.",
                        new_status=invoice.status,
                        next_level=posting_virtual_level,
                    )
                else:
                    # Final Level — Fully Approved
                    _update_invoice_status(db, invoice, InvoiceStatus.APPROVED)
                    _record_step(
                        db, invoice_id,
                        step_name="Invoice Approved",
                        step_type=StepType.APPROVED,
                        user_email=email,
                        comment=payload.comment,
                        entity=entity,
                    )
                    db.commit()

                    # Trigger Sage Post
                    sage_result = await _post_to_sage(invoice_id, entity, db)
                    if sage_result["success"]:
                        invoice = invoice_repo.get(db, invoice_id)
                        _update_invoice_status(db, invoice, InvoiceStatus.SAGE_POSTED)
                        invoice.sage_bill_number = sage_result.get("sage_bill_number")
                        erp_name = settings.TOOL.capitalize()
                        _record_step(
                            db, invoice_id,
                            step_name=f"Posted to {erp_name}",
                            step_type=StepType.POSTED,
                            user_email=email,
                            comment=f"{erp_name} Bill Number: {sage_result.get('sage_bill_number')}",
                            entity=entity,
                        )
                        db.commit()
                        return ActionResponse(
                            success=True,
                            message=f"Invoice fully approved and posted to {erp_name}.",
                            new_status=InvoiceStatus.SAGE_POSTED,
                            sage_post_result=sage_result,
                        )
                    else:
                        invoice = invoice_repo.get(db, invoice_id)
                        _update_invoice_status(db, invoice, InvoiceStatus.SAGE_POST_FAILED)
                        erp_name = settings.TOOL.capitalize()
                        _record_step(
                            db, invoice_id,
                            step_name=f"{erp_name} Post Failed",
                            step_type=StepType.POST_FAILED,
                            user_email=email,
                            comment=sage_result.get("message"),
                            entity=entity,
                        )
                        db.commit()
                        return ActionResponse(
                            success=False,
                            message=f"Invoice fully approved but Sage post failed: {sage_result['message']}",
                            new_status=InvoiceStatus.SAGE_POST_FAILED,
                            sage_post_result=sage_result,
                        )
        else:
            db.commit()
            return ActionResponse(
                success=True,
                message=f"Your approval recorded for level {current_level}. Awaiting other approvers at this level.",
                new_status=current_status,
                next_level=current_level,
            )

    # ── CASE B: Threshold stage ──
    if has_threshold and not threshold_done:
        threshold_emails = []
        for te in threshold_entries:
            threshold_emails.extend(_parse_list(te.get("emails", [])))

        delegated_threshold = False
        for orig_email in threshold_emails:
            if not orig_email:
                continue
            substitutes = check_active_delegation(db, orig_email, entity)
            if email in [s.lower() for s in substitutes]:
                delegated_threshold = True
                break

        if email not in [e.lower() for e in threshold_emails] and not delegated_threshold:
            raise HTTPException(403, "You are not the threshold approver")

        # Guard against double-approval at the threshold stage
        already_threshold = any(
            (s.user or "").lower() == email
            and s.step_type == StepType.THRESHOLD_APPROVED
            for s in current_cycle_steps
        )
        if already_threshold:
            raise HTTPException(400, "You have already submitted your threshold approval")

        _record_step(
            db, invoice_id,
            step_name="Threshold Approval",
            step_type=StepType.THRESHOLD_APPROVED,
            user_email=email,
            comment=payload.comment,
            entity=entity,
        )

        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id,
            action="Threshold Approved",
            user=current_user.username,
            entity=entity,
            details={"comment": payload.comment}
        )
        # Record approver email in invoice.approved_by_list
        if email not in [a.approver_email.lower() for a in (invoice.approved_by_list or [])]:
            invoice.approved_by_list.append(InvoiceApprovedBy(approver_email=email))

        if has_posting:
            posting_virtual_level = len(mandatory) + 2
            _advance_level(db, invoice, posting_virtual_level)
            if invoice.status == InvoiceStatus.REWORKED:
                _update_invoice_status(db, invoice, InvoiceStatus.WAITING_APPROVAL)
            
            # Notify posting approvers
            for pe in posting_entries:
                notify_next_approvers(db, invoice, pe, background_tasks)
                
            db.commit()
            logger.info(f"[Workflow] Invoice {invoice_id} THRESHOLD approved by {current_user.username}. Advancing to posting stage.")
            return ActionResponse(
                success=True,
                message="Threshold approved. Awaiting posting approver.",
                new_status=invoice.status,
                next_level=posting_virtual_level,
            )
        else:
            _update_invoice_status(db, invoice, InvoiceStatus.APPROVED)
            _record_step(
                db, invoice_id,
                step_name="Invoice Approved",
                step_type=StepType.APPROVED,
                user_email=email,
                comment=payload.comment,
                entity=entity,
            )
            db.commit()

            # Trigger Sage Post
            sage_result = await _post_to_sage(invoice_id, entity, db)
            erp_name = settings.TOOL.capitalize()
            if sage_result["success"]:
                invoice = invoice_repo.get(db, invoice_id)
                _update_invoice_status(db, invoice, InvoiceStatus.SAGE_POSTED)
                invoice.sage_bill_number = sage_result.get("sage_bill_number")
                _record_step(
                    db, invoice_id,
                    step_name=f"Posted to {erp_name}",
                    step_type=StepType.POSTED,
                    user_email=email,
                    comment=f"{erp_name} Bill Number: {sage_result.get('sage_bill_number')}",
                    entity=entity,
                )
                db.commit()
                logger.info(f"[Workflow] Invoice {invoice_id} fully approved after THRESHOLD by {current_user.username}. Posted to {erp_name} (Bill: {sage_result.get('sage_bill_number')}).")
                return ActionResponse(
                    success=True,
                    message=f"Invoice fully approved after threshold and posted to {erp_name}.",
                    new_status=InvoiceStatus.SAGE_POSTED,
                    sage_post_result=sage_result,
                )
            else:
                invoice = invoice_repo.get(db, invoice_id)
                _update_invoice_status(db, invoice, InvoiceStatus.SAGE_POST_FAILED)
                _record_step(
                    db, invoice_id,
                    step_name=f"{erp_name} Post Failed",
                    step_type=StepType.POST_FAILED,
                    user_email=email,
                    comment=sage_result.get("message"),
                    entity=entity,
                )
                db.commit()
                logger.error(f"[{erp_name}Post] {erp_name} posting failed after threshold approval for invoice {invoice_id}: {sage_result.get('message')}")
                return ActionResponse(
                    success=False,
                    message=f"Invoice fully approved after threshold but {erp_name} post failed: {sage_result['message']}",
                    new_status=InvoiceStatus.SAGE_POST_FAILED,
                    sage_post_result=sage_result,
                )

    # ── CASE C: Posting approver stage ──
    if has_posting and not posting_done_already:
        posting_emails = []
        for pe in posting_entries:
            posting_emails.extend(_parse_list(pe.get("emails", [])))

        delegated_posting = False
        for orig_email in posting_emails:
            if not orig_email:
                continue
            substitutes = check_active_delegation(db, orig_email, entity)
            if email in [s.lower() for s in substitutes]:
                delegated_posting = True
                break

        if email not in [e.lower() for e in posting_emails] and not delegated_posting:
            raise HTTPException(403, "You are not the posting approver")

        # Guard against double-approval at the posting stage
        already_posting = any(
            (s.user or "").lower() == email
            and s.step_type == StepType.POSTING_APPROVED
            for s in current_cycle_steps
        )
        if already_posting:
            raise HTTPException(400, "You have already submitted your posting approval")

        return await _finalize_and_post(
            db, invoice, current_user, email, entity, payload.comment,
            step_name="Posting Approver Approved",
            step_type=StepType.POSTING_APPROVED
        )

        # Record approver email in invoice.approved_by_list
        if email not in [a.approver_email.lower() for a in (invoice.approved_by_list or [])]:
            invoice.approved_by_list.append(InvoiceApprovedBy(approver_email=email))
        _record_step(
            db, invoice_id,
            step_name="Invoice Approved",
            step_type=StepType.APPROVED,
            user_email=email,
            comment=payload.comment,
            entity=entity,
        )
        db.commit()

        sage_result = await _post_to_sage(invoice_id, entity, db)

        if sage_result["success"]:
            invoice = invoice_repo.get(db, invoice_id)
            _update_invoice_status(db, invoice, InvoiceStatus.SAGE_POSTED)
            invoice.sage_bill_number = sage_result.get("sage_bill_number")
            erp_name = settings.TOOL.capitalize()
            _record_step(
                db, invoice_id,
                step_name=f"Posted to {erp_name}",
                step_type=StepType.POSTED,
                user_email=email,
                comment=f"{erp_name} Bill Number: {sage_result.get('sage_bill_number')}",
                entity=entity,
            )
            db.commit()
            return ActionResponse(
                success=True,
                message=f"Invoice approved and successfully posted to {erp_name}.",
                new_status=InvoiceStatus.SAGE_POSTED,
                sage_post_result=sage_result,
            )
        else:
            invoice = invoice_repo.get(db, invoice_id)
            _update_invoice_status(db, invoice, InvoiceStatus.SAGE_POST_FAILED)
            erp_name = settings.TOOL.capitalize()
            _record_step(
                db, invoice_id,
                step_name=f"{erp_name} Post Failed",
                step_type=StepType.POST_FAILED,
                user_email=email,
                comment=sage_result.get("message"),
                entity=entity,
            )
            db.commit()
            return ActionResponse(
                success=False,
                message=f"Invoice approved but {erp_name} posting failed: {sage_result['message']}",
                new_status=InvoiceStatus.SAGE_POST_FAILED,
                sage_post_result=sage_result,
            )

    raise HTTPException(
        400, "No pending approval stage found for this invoice")

# ─────────────────────────────────────────────
# POST /workflow/action/reject/{invoice_id}
# ─────────────────────────────────────────────


@router.post("/reject/{invoice_id}", response_model=ActionResponse)
async def reject_invoice(
    invoice_id: int,
    payload: ActionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
):
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    _check_concurrency(db, invoice, payload.last_updated_at, current_user)

    current_status = (
        invoice.status.value
        if hasattr(invoice.status, "value")
        else str(invoice.status)
    )
    if current_status not in (InvoiceStatus.WAITING_APPROVAL, InvoiceStatus.REWORKED):
        raise HTTPException(
            400, f"Invoice cannot be rejected from status: {current_status}")

    workflow = _get_workflow_data(db, invoice, entity)
    steps = _steps_for_invoice(db, invoice_id)
    finance_users = _get_finance_users(db, entity)
    current_level = invoice.current_approver_level or 1
    email = current_user.email.lower()

    role = _resolve_user_role_in_workflow(
        db, invoice_id, email, workflow, steps, finance_users, current_level, entity
    )
    
    # Explicitly allow Posting/Threshold approvers to reject
    is_authorized = (
        role["can_act"] 
        or (role["is_posting_approver"] and not role["already_acted"])
        or (role["is_threshold_approver"] and not role["already_acted"])
    )

    if not is_authorized:
        raise HTTPException(
            403, "You are not authorized to reject this invoice at its current stage")

    import json as _json

    # ── 1. Update status to REJECTED ──────────────────────
    from common.models.db_models import InvoiceStatusEnum
    _update_invoice_status(db, invoice, InvoiceStatus.REJECTED)
    invoice.current_approver_level = 1
    invoice.approved_by_list = []

    # ── 2. Record the rejection step ──────────────────────
    _record_step(
        db,
        invoice_id,
        step_name="Invoice Rejected",
        step_type=StepType.REJECTED,
        user_email=email,
        comment=payload.comment,
        entity=entity,
        approver_number=current_level,
    )

    # ── 3. Audit Log ──────────────────────
    await audit_service.log_action(
        db=db,
        invoice_id=invoice_id,
        action=AuditAction.REJECTED,
        user=current_user.username,
        entity=entity,
        details={"comment": payload.comment}
    )

    db.commit()
    logger.info(f"[Workflow] Invoice {invoice_id} REJECTED by {current_user.username} at level {current_level}. Comment: {payload.comment!r}")

    # --- NOTIFY CODER OF REJECTION ---
    # Find the user who did the coding step
    coding_step = db.query(WorkflowStep).filter(
        WorkflowStep.invoice_id == invoice_id,
        WorkflowStep.step_type == StepType.EDITING_ENABLED  # Often coding is done here or initial upload
    ).order_by(WorkflowStep.timestamp.desc()).first()
    
    # Fallback to uploader if no coding step found
    coder_email = None
    coder_name = "Coder"
    
    if coding_step:
        coder_user = db.query(User).filter(User.username == coding_step.user).first()
        if coder_user:
            coder_email = coder_user.email
            coder_name = coder_user.username
            
    if not coder_email:
        coder_email = invoice.uploaded_by
        
    if coder_email:
        background_tasks.add_task(
            email_service.send_rejection_notification,
            email=coder_email,
            username=coder_name,
            vendor_name=invoice.vendor_name or "Unknown",
            invoice_number=invoice.invoice_number or "N/A",
            status=InvoiceStatus.REJECTED,
            comment=payload.comment
        )

    return ActionResponse(
        success=True,
        message="Invoice has been rejected. It remains in the system with status REJECTED.",
        new_status=InvoiceStatus.REJECTED,
    )

# ─────────────────────────────────────────────
# POST /workflow/action/rework/{invoice_id}
# ─────────────────────────────────────────────


@router.post("/rework/{invoice_id}", response_model=ActionResponse)
async def rework_invoice(
    invoice_id: int,
    payload: ActionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
):
    """
    Send invoice back for rework to the previous finance-team approver level.
    - If a previous finance-team level exists → status = REWORKED, level reset to that level.
    - If no previous finance level → HTTP 400 with descriptive error (frontend shows alert).
    - The finance team at that level gets full editing privileges (tracked by REWORKED status).
    """
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    _check_concurrency(db, invoice, payload.last_updated_at, current_user)

    current_status = (
        invoice.status.value
        if hasattr(invoice.status, "value")
        else str(invoice.status)
    )
    if current_status != InvoiceStatus.WAITING_APPROVAL:
        raise HTTPException(
            400, f"Invoice cannot be sent for rework from status: {current_status}")

    workflow = _get_workflow_data(db, invoice, entity)
    steps = _steps_for_invoice(db, invoice_id)
    finance_users = _get_finance_users(db, entity)
    current_level = invoice.current_approver_level or 1
    email = current_user.email.lower()

    role = _resolve_user_role_in_workflow(
        db, invoice_id, email, workflow, steps, finance_users, current_level, entity
    )

    # DEBUG — remove after diagnosis
    assigned_debug = workflow.get("assigned_approvers", [])
    logger.warning(
        "[REWORK DEBUG] invoice=%s email=%s current_level=%s role=%s assigned_approvers=%s",
        invoice_id, email, current_level, role, assigned_debug
    )

    # Posting/threshold approvers must be able to rework at their stage.
    # _resolve_user_role_in_workflow can return can_act=False for posting
    # approvers when a threshold stage is present (elif chain skips posting
    # branch), so we mirror the same explicit fallback used in reject_invoice.
    already_posting_acted = any(
        (s.user or "").lower() == email
        and s.step_type == StepType.POSTING_APPROVED
        for s in _get_current_cycle_steps(steps)
    )
    already_threshold_acted = any(
        (s.user or "").lower() == email
        and s.step_type == StepType.THRESHOLD_APPROVED
        for s in _get_current_cycle_steps(steps)
    )
    is_authorized = (
        role["can_act"]
        or (role["is_posting_approver"] and not already_posting_acted)
        or (role["is_threshold_approver"] and not already_threshold_acted)
    )

    if not is_authorized:
        raise HTTPException(
            403, "You are not authorized to send this invoice for rework")

    if current_level == 1:
        # Approver 1 reworks -> send back to coder
        _update_invoice_status(db, invoice, InvoiceStatus.WAITING_CODING)
        invoice.current_approver_level = 1
        
        _record_step(
            db,
            invoice_id,
            step_name="Sent for Rework to Coding",
            step_type=StepType.REWORKED,
            user_email=email,
            approver_number=current_level,
            comment=payload.comment,
            entity=entity,
        )
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id,
            action=AuditAction.REWORKED,
            user=current_user.username,
            entity=entity,
            details={"comment": payload.comment, "rework_to": "coder"}
        )
        db.commit()
        logger.info(f"[Workflow] Invoice {invoice_id} sent for REWORK to Coder by {current_user.username}. Comment: {payload.comment!r}")

        return ActionResponse(
            success=True,
            message="Invoice returned to coders for rework.",
            new_status=InvoiceStatus.WAITING_CODING,
            next_level=1,
        )

    assigned: List[Dict] = workflow.get("assigned_approvers", [])
    
    rework_err = _get_rework_error(db, current_level, assigned)
    if rework_err:
        raise HTTPException(
            400,
            detail={
                "code": "PREVIOUS_NOT_FINANCE",
                "message": rework_err,
            },
        )

    # Reset level to previous level
    prev_level_num = current_level - 1
    prev_finance_level = prev_level_num
    # Reset level to previous finance level and clear approvals beyond it
    _advance_level(db, invoice, prev_finance_level)
    _update_invoice_status(db, invoice, InvoiceStatus.REWORKED)

    _record_step(
        db,
        invoice_id,
        step_name=f"Sent for Rework — Level {prev_finance_level} (Finance Team)",
        step_type=StepType.REWORKED,
        user_email=email,
        approver_number=current_level,
        comment=payload.comment,
        entity=entity,
    )
    await audit_service.log_action(
        db=db,
        invoice_id=invoice_id,
        action=AuditAction.REWORKED,
        user=current_user.username,
        entity=entity,
        details={"comment": payload.comment, "rework_to_level": prev_finance_level}
    )
    db.commit()
    logger.info(f"[Workflow] Invoice {invoice_id} sent for REWORK to level {prev_finance_level} by {current_user.username}. Comment: {payload.comment!r}")

    # --- NOTIFY PREVIOUS FINANCE TEAM OF REWORK ---
    prev_finance_emails = []
    level_entry = next((e for e in assigned if e.get("level") == prev_finance_level), None)
    if level_entry:
        emails = _parse_list(level_entry.get("emails", []))
        if level_entry.get("is_finance"):
            f_users = _get_finance_users(db, entity)
            prev_finance_emails = list(set(emails) | set(f_users))
        else:
            prev_finance_emails = emails
            
    for f_email in prev_finance_emails:
        if not f_email: continue
        f_user = db.query(User).filter(User.email == f_email).first()
        f_name = f_user.username if f_user else "Approver"
        
        background_tasks.add_task(
            email_service.send_rejection_notification,
            email=f_email,
            username=f_name,
            vendor_name=invoice.vendor_name or "Unknown",
            invoice_number=invoice.invoice_number or "N/A",
            status=InvoiceStatus.REWORKED,
            comment=payload.comment
        )

    return ActionResponse(
        success=True,
        message=(
            f"Invoice sent for rework to Finance Team (level {prev_finance_level}). "
            "Finance team members can now edit and re-submit for approval."
        ),
        new_status=InvoiceStatus.REWORKED,
        next_level=prev_finance_level,
    )


# ─────────────────────────────────────────────
# POST /workflow/action/enable-editing/{invoice_id}
# ─────────────────────────────────────────────

@router.post("/enable-editing/{invoice_id}", response_model=ActionResponse)
async def enable_editing(
    invoice_id: int,
    payload: EnableEditingRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
):
    """
    Finance-team approvers can enable editing for themselves.
    Once enabled (status stays WAITING_APPROVAL) the frontend unlocks
    all invoice tabs for this approver.  The approver must re-submit
    for approval once edits are complete.
    """
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    _check_concurrency(db, invoice, payload.last_updated_at, current_user)

    current_status = (
        invoice.status.value
        if hasattr(invoice.status, "value")
        else str(invoice.status)
    )
    if current_status not in (InvoiceStatus.WAITING_APPROVAL, InvoiceStatus.REWORKED):
        raise HTTPException(
            400, f"Editing cannot be enabled for status: {current_status}")

    finance_users = _get_finance_users(db, entity)
    email = current_user.email.lower()

    delegated_finance = False
    for f_user in finance_users:
        subs = check_active_delegation(db, f_user, entity)
        if email in [s.lower() for s in subs]:
            delegated_finance = True
            break

    # Check if user is a threshold or posting approver (or delegate)
    workflow = _get_workflow_data(db, invoice, entity)
    assigned = workflow.get("assigned_approvers", [])
    post_emails = []
    for a in assigned:
        if a.get("type") in ("threshold", "posting"):
            post_emails.extend(_parse_list(a.get("emails", [])))
    
    is_post_approver = email in [e.lower() for e in post_emails]
    delegated_post = False
    if not is_post_approver:
        for p_email in post_emails:
            if not p_email: continue
            subs = check_active_delegation(db, p_email, entity)
            if email in [s.lower() for s in subs]:
                delegated_post = True
                break

    is_authorized = (
        email in [f.lower() for f in finance_users]
        or delegated_finance
        or is_post_approver
        or delegated_post
    )

    if not is_authorized:
        raise HTTPException(
            403, "Only Finance Team members or Post Approvers (or their delegates) can enable editing")

    _record_step(
        db, invoice_id,
        step_name="Editing Enabled by Finance Team",
        step_type=StepType.EDITING_ENABLED,
        user_email=email,
        comment=payload.comment,
        entity=entity,
    )
    db.commit()
    logger.info(f"[Workflow] Invoice {invoice_id} — EDITING ENABLED by {current_user.username}")

    return ActionResponse(
        success=True,
        message="Editing enabled. You can now modify all invoice tabs. Re-submit for approval when done.",
        new_status=current_status,
    )


# ─────────────────────────────────────────────
# POST /workflow/action/repost-sage/{invoice_id}
# ─────────────────────────────────────────────

@router.post("/repost-sage/{invoice_id}", response_model=ActionResponse)
async def repost_to_sage(
    invoice_id: int,
    payload: ActionRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
):
    """
    Retry posting to Sage after a previous failure.
    Only the posting approver may trigger a repost.
    """
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    _check_concurrency(db, invoice, payload.last_updated_at, current_user)

    current_status = (
        invoice.status.value
        if hasattr(invoice.status, "value")
        else str(invoice.status)
    )
    if current_status != InvoiceStatus.SAGE_POST_FAILED:
        raise HTTPException(
            400, f"Invoice is not in SAGE_POST_FAILED state (current: {current_status})")

    workflow = _get_workflow_data(db, invoice, entity)
    assigned: List[Dict] = workflow.get("assigned_approvers", [])
    posting_entries = [a for a in assigned if a.get("type") == "posting"]
    if not posting_entries and assigned:
        posting_entries = [assigned[-1]]

    posting_emails: List[str] = []
    for pe in posting_entries:
        posting_emails.extend(_parse_list(pe.get("emails", [])))

    email = current_user.email.lower()
    delegated_posting = False
    for orig_email in posting_emails:
        if not orig_email:
            continue
        substitutes = check_active_delegation(db, orig_email, entity)
        if email in [s.lower() for s in substitutes]:
            delegated_posting = True
            break

    if email not in [e.lower() for e in posting_emails] and not delegated_posting:
        raise HTTPException(
            403, "Only the posting approver (or their delegate) can repost to Sage")

    # Attempt repost
    sage_result = await _post_to_sage(invoice_id, entity, db)

    if sage_result["success"]:
        # The bill number sent to Sage is always invoice.invoice_number.
        # It must NEVER change on repost — use invoice_number as the
        # single source of truth regardless of what Sage echoes back.
        resolved_bill_number = invoice.invoice_number

        erp_name = settings.TOOL.capitalize()
        logger.info(
            f"[{erp_name}Repost] Successfully reposted invoice {invoice_id} to {erp_name}. "
            f"Bill number: {resolved_bill_number}"
        )

        invoice.sage_bill_number = resolved_bill_number
        _update_invoice_status(db, invoice, InvoiceStatus.SAGE_POSTED)
        _record_step(
            db,
            invoice_id,
            step_name=f"Reposted to {erp_name} — Success",
            step_type=StepType.POSTED,
            user_email=email,
            comment=f"{erp_name} Bill Number: {resolved_bill_number}",
            entity=entity,
        )
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id,
            action=f"{erp_name} Reposted",
            user=current_user.username,
            entity=entity,
            details={f"{erp_name.lower()}_bill_number": resolved_bill_number},
            sage_bill_number=resolved_bill_number
        )
        db.commit()
        # Always return the resolved bill number to the frontend — never None
        final_sage_result = dict(sage_result)
        final_sage_result["sage_bill_number"] = resolved_bill_number
        return ActionResponse(
            success=True,
            message=f"Invoice successfully reposted to {erp_name}.",
            new_status=InvoiceStatus.SAGE_POSTED,
            sage_post_result=final_sage_result,
        )
    else:
        erp_name = settings.TOOL.capitalize()
        _record_step(
            db,
            invoice_id,
            step_name=f"{erp_name} Repost Failed",
            step_type=StepType.POST_FAILED,
            user_email=email,
            comment=sage_result.get("message"),
            entity=entity,
        )
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id,
            action=f"{erp_name} Repost Failed",
            user=current_user.username,
            entity=entity,
            details={"error": sage_result.get("message")}
        )
        db.commit()
        logger.error(f"[{erp_name}Repost] {erp_name} repost failed for invoice {invoice_id} by {current_user.username}: {sage_result.get('message')}")
        return ActionResponse(
            success=False,
            message=f"{erp_name} repost failed: {sage_result['message']}",
            new_status=InvoiceStatus.SAGE_POST_FAILED,
            sage_post_result=sage_result,
        )


@router.post("/recall/{invoice_id}")
async def recall_invoice(
    invoice_id: int,
    request: ActionRequest = Body(...),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Allows a Coder to recall an invoice that is currently sitting with the Level 1 approvers.
    Resets the status to 'waiting_coding'.
    Only available if current_approver_level is 1.
    """
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    _check_concurrency(db, invoice, request.last_updated_at, current_user)

    # Strictly Coder check
    user_role = (current_user.role or "").lower()
    if "coder" not in user_role:
        raise HTTPException(status_code=403, detail="Only Coders can recall invoices.")

    # Status check: strictly waiting_approval
    if invoice.status != InvoiceStatus.WAITING_APPROVAL:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot recall invoice in current status: {invoice.status}"
        )

    # Level check: strictly level 1
    if invoice.current_approver_level != 1:
        raise HTTPException(
            status_code=400,
            detail="Recall is only available before Level 1 approval has been completed."
        )

    # Action: Reset to waiting_coding  
    _update_invoice_status(db, invoice, InvoiceStatus.WAITING_CODING)

    # Record the action
    _record_step(
        db,
        invoice_id,
        step_name="Recalled to Coding",
        step_type=StepType.RECALLED,
        user_email=current_user.email,
        comment=request.comment or "Recalled by Coder",
        entity=invoice.entity
    )
    
    await audit_service.log_action(
        db=db,
        invoice_id=invoice_id,
        action=AuditAction.RECALLED,
        user=current_user.username,
        entity=invoice.entity,
        details={"comment": request.comment or "Recalled by Coder"}
    )

    db.commit()
    logger.info(f"[Workflow] Invoice {invoice_id} RECALLED to coding by {current_user.username}. Comment: {request.comment!r}")

    return ActionResponse(
        success=True,
        message="Invoice successfully recalled to coding stage.",
        new_status=InvoiceStatus.WAITING_CODING
    )
