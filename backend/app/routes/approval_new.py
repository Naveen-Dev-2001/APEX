
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

from app.auth.jwt import get_current_user
from app.database.database import get_db
from app.dependencies import get_current_entity
from app.models.db_models import Invoice, User, WorkflowStep, EntityMaster, InvoiceApprovedBy
from app.models.user import UserResponse
from app.repository.repositories import (
    coding_repo,
    invoice_repo,
    vendor_workflow_repo,
    codification_workflow_repo,
    workflow_step_repo,
)

from app.routes.workflow import get_invoice_total_from_invoice, get_required_approver_count
from app.models.delegation import check_active_delegation
from app.services.audit_service import audit_service
from app.models.audit_log import AuditAction
from app.services.email_service import email_service

logger = logging.getLogger(__name__)
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


def _check_concurrency(invoice: Invoice, last_updated_at: Optional[datetime]):
    if last_updated_at and invoice.updated_at:
        db_ts = invoice.updated_at.replace(microsecond=0)
        req_ts = last_updated_at.replace(microsecond=0)
        if db_ts > req_ts:
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
                ~func.lower(User.department).like("%non-finance%")
            )
            .all()
        )

        return [u.email.lower() for u in users]

    except Exception as exc:
        logger.warning("Could not fetch users: %s", exc)
        return []


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
        timestamp=datetime.utcnow(),
        entity=entity
    )
    db.add(step)
    db.flush()
    return step


def _update_invoice_status(db: Session, invoice: Invoice, new_status: str):
    invoice.status = new_status
    db.add(invoice)


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
        
    for next_email in emails:
        if not next_email: continue
        
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


def _find_previous_finance_level(
    assigned_approvers: List[Dict],
    current_level: int,
) -> Optional[int]:
    """
    Scan backwards from current_level-1 to find the most recent finance-team level.
    Returns the level number or None.
    """
    mandatory = [
        a for a in assigned_approvers
        if a.get("type") == "mandatory" and a.get("is_finance")
    ]
    for entry in reversed(mandatory):
        if entry.get("level", 9999) < current_level:
            return entry["level"]
    return None

async def _finalize_and_post(db: Session, invoice: Invoice, current_user: UserResponse, email: str, entity: str, comment: str, step_name: str = "Invoice Approved", step_type: str = StepType.APPROVED):
    """
    Sets status to APPROVED, records approval steps, and triggers Sage posting.
    """
    from app.services.audit_service import audit_service
    from app.models.audit_log import AuditAction
    from app.models.invoice import InvoiceStatus
    from app.repository.repositories import invoice_repo
    
    invoice_id = invoice.id
    
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
    sage_result = await _post_to_sage(invoice_id, entity)

    if sage_result["success"]:
        invoice = invoice_repo.get(db, invoice_id)
        _update_invoice_status(db, invoice, InvoiceStatus.SAGE_POSTED)
        
        # Use the correct column name 'sage_bill_number' from db_models.py
        actual_bill_no = sage_result.get("sage_bill_number")
        invoice.sage_bill_number = actual_bill_no
        
        _record_step(
            db, invoice_id,
            step_name="Posted to Sage",
            step_type=StepType.POSTED,
            user_email=email,
            comment=f"Sage Bill Number: {actual_bill_no}",
            entity=entity,
        )
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id,
            action=AuditAction.SAGE_POSTED,
            user=current_user.username,
            entity=entity,
            details={"sage_bill_number": actual_bill_no},
            sage_bill_number=actual_bill_no
        )
        db.commit()
        return ActionResponse(
            success=True,
            message="Invoice approved and successfully posted to Sage.",
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
    try:
        from app.postapbill import post_ap_bill
        from app.services.pdf_service import generate_approval_pdf

        # 1. Fetch invoice
        invoice = invoice_repo.get(db, invoice_id)
        if not invoice:
            return {"success": False, "message": "Invoice not found", "sage_bill_number": None}

        # 2. Ensure Approval PDF exists (or regenerate it)
        pdf_path = None
        try:
             pdf_path = generate_approval_pdf(db, invoice_id)
             logger.info(f"[SagePost] Approval report path: {pdf_path}")
        except Exception as pdf_err:
             logger.error(f"[SagePost] Error ensuring approval PDF: {pdf_err}", exc_info=True)

        # 3. Extract coding details
        hc = {}
        if invoice.coding and invoice.coding.header_coding:
            try:
                hc = json.loads(invoice.coding.header_coding)
            except:
                hc = {}
        
        line_items = []
        if invoice.coding and invoice.coding.line_items:
            try:
                line_items = json.loads(invoice.coding.line_items)
                # Robust extraction: if header fields are missing, try to get from first line item
                if line_items and not hc.get("gl_code"):
                    first = line_items[0]
                    if not hc.get("gl_code"): hc["gl_code"] = first.get("gl_code")
                    if not hc.get("department"): hc["department"] = first.get("department") or first.get("department_id")
                    if not hc.get("item"): hc["item"] = first.get("item") or first.get("item_id")
                    if not hc.get("lob"): hc["lob"] = first.get("lob") or first.get("class")
            except:
                line_items = []

        # 4. Resolve Sage Location ID from EntityMaster partition mapping
        entity_record = db.query(EntityMaster).filter(EntityMaster.entity_name == invoice.entity).first()
        sage_location = entity_record.entity_id if entity_record else (hc.get("location") or hc.get("location_id"))

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
            return {
                "success": True,
                "message": "Posted to Sage successfully",
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


# ─────────────────────────────────────────────
# Authorization helper
# ─────────────────────────────────────────────

def _resolve_user_role_in_workflow(
    db: Session,
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
    
    approved_levels = _get_approved_levels(current_cycle_steps)
    threshold_done = _threshold_approved(current_cycle_steps)
    posting_done = _posting_approved(current_cycle_steps)

    result = {
        "user_level": None,
        "is_finance_team": email in [f.lower() for f in finance_users],
        "is_threshold_approver": False,
        "is_posting_approver": False,
        "level_already_approved": False,
        "already_acted": False,
        "can_act": False,
    }

    # Check if user already acted (any approve / reject)
    acted_types = {
        StepType.APPROVED,
        StepType.REJECTED,
        StepType.LEVEL_APPROVED,
        StepType.THRESHOLD_APPROVED,
        StepType.POSTING_APPROVED,
    }
    result["already_acted"] = any(
        (s.user or "").lower() == email and s.step_type in acted_types
        for s in current_cycle_steps
    )

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

    has_threshold = bool(threshold_entries)
    has_posting = bool(posting_entries)

    # Check for direct eligibility at the current level
    # This covers mandatory levels AND reconstructed threshold/posting levels
    current_entry = next((e for e in mandatory if e.get("level") == current_level), None)
    if current_entry:
        is_fin_lvl = current_entry.get("is_finance", False)
        emails_at_lvl = [e.lower() for e in _parse_list(current_entry.get("emails", []))]
        
        # Check eligibility for THIS specific level
        is_eligible = (
            (is_fin_lvl and result["is_finance_team"])
            or (email in emails_at_lvl)
            or any(email in [s.lower() for s in check_active_delegation(db, e, entity)] for e in emails_at_lvl)
        )
        if is_eligible:
            result["can_act"] = not result["level_already_approved"]
            result["user_level"] = current_level

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
                result["can_act"] = not result["already_acted"]
        elif has_posting and not posting_done:
            delegated_posting = False
            for o_email in [e.lower() for pe in posting_entries for e in _parse_list(pe.get("emails", []))]:
                if not o_email: continue
                subs = check_active_delegation(db, o_email, entity)
                if email in [s.lower() for s in subs]:
                    delegated_posting = True
                    break
            if result["is_posting_approver"] or delegated_posting:
                result["can_act"] = not result["already_acted"]
    # else: all done — no one can act

    return result


@router.post("/status", response_model=ApproverUIStatus)
async def get_ui_status_from_frontend(
    payload: Dict = Body(...),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
):
    invoice_id = payload.get("invoice_id")
    assigned = payload.get("assigned_approvers", [])
    current_level = payload.get("current_approver_level", 1)
    current_status = payload.get("current_status")
 
    email = current_user.email.lower()
    finance_users = _get_finance_users(db, entity)
    is_finance = email in [f.lower() for f in finance_users]
 
    steps = _steps_for_invoice(db, invoice_id)
    approval_types = [StepType.LEVEL_APPROVED, StepType.THRESHOLD_APPROVED,
                      StepType.POSTING_APPROVED, StepType.APPROVED]
 
    mandatory = [a for a in assigned if a.get("type") == "mandatory"]
    threshold_entries = [a for a in assigned if a.get("type") == "threshold"]
    posting_entries = [a for a in assigned if a.get("type") == "posting"]
 
    # ── If reworked, only count approval steps AFTER the last rework ──
    if current_status == InvoiceStatus.REWORKED:
        rework_steps = [s for s in steps if s.step_type == StepType.REWORKED]
        last_rework_ts = max((s.timestamp for s in rework_steps), default=None)
        if last_rework_ts:
            steps_for_level_check = [
                s for s in steps
                if s.step_type not in approval_types or s.timestamp > last_rework_ts
            ]
        else:
            steps_for_level_check = steps
    else:
        steps_for_level_check = steps
 
    approved_levels = _get_approved_levels(steps_for_level_check)
    threshold_done = _threshold_approved(steps_for_level_check)
    posting_done = _posting_approved(steps_for_level_check)
 
    mandatory_levels_done = all(
        bool(approved_levels.get(e.get("level"))) for e in mandatory
    )
    has_threshold = bool(threshold_entries)
    has_posting = bool(posting_entries)
 
    # ── Posting approver check ──
    posting_emails = []
    for pe in posting_entries:
        posting_emails.extend(_parse_list(pe.get("emails", [])))
    is_posting_approver = email in [e.lower() for e in posting_emails]
 
    # ── Threshold approver check ──
    threshold_emails = []
    for te in threshold_entries:
        threshold_emails.extend(_parse_list(te.get("emails", [])))
    is_threshold_approver = email in [e.lower() for e in threshold_emails]
 
    # ── already_acted defined HERE so all branches below can safely use it ──
    # FIX: was defined after the explicit check block, causing NameError when
    # can_act was False and the block tried to evaluate `not already_acted`.
    already_acted = any((s.user or "").lower() == email for s in steps)
 
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
 
            user_in_level = (
                (is_finance_level and is_finance)
                or (email in emails_at_level)
                or delegated_authority
            )
            already_acted_in_workflow = any(
                (s.user or "").lower() == email
                and s.step_type in approval_types
                for s in steps_for_level_check
            )
            can_act = user_in_level and not already_acted_in_workflow
 
    elif has_threshold and not threshold_done:
        delegated_threshold = False
        for orig_email in threshold_emails:
            if not orig_email:
                continue
            substitutes = check_active_delegation(db, orig_email, entity)
            if email in [s.lower() for s in substitutes]:
                delegated_threshold = True
                break
 
        already_acted_in_workflow = any(
            (s.user or "").lower() == email
            and s.step_type in approval_types
            for s in steps_for_level_check
        )
        can_act = (
            is_threshold_approver or delegated_threshold) and not already_acted_in_workflow
 
    elif has_posting and not posting_done:
        delegated_posting = False
        for orig_email in posting_emails:
            if not orig_email:
                continue
            substitutes = check_active_delegation(db, orig_email, entity)
            if email in [s.lower() for s in substitutes]:
                delegated_posting = True
                break
 
        # FIX: only block if they already did POSTING_APPROVED specifically.
        # A posting approver who approved at a mandatory level must NOT be blocked here.
        already_posting_approved = any(
            (s.user or "").lower() == email
            and s.step_type == StepType.POSTING_APPROVED
            for s in steps_for_level_check
        )
        can_act = (
            is_posting_approver or delegated_posting) and not already_posting_approved
 
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
            if current_level > len(mandatory) and not already_posting_approved:
                can_act = True
            else:
                current_lvl_entry = next(
                    (e for e in assigned if e.get("level") == current_level), None)
                if current_lvl_entry and current_lvl_entry.get("type") == "posting" and not already_posting_approved:
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

    _check_concurrency(invoice, payload.last_updated_at)

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

    approved_levels = _get_approved_levels(current_cycle_steps)
    threshold_done = _threshold_approved(current_cycle_steps)
    posting_done_already = _posting_approved(current_cycle_steps)

    mandatory_levels_done = all(
        bool(approved_levels.get(e.get("level"))) for e in mandatory
    )
    has_threshold = bool(threshold_entries)
    has_posting = bool(posting_entries)

    # ── CASE A: Mandatory levels ──
    if not mandatory_levels_done:
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

        user_eligible = (
            (is_finance_level and email in [f.lower() for f in finance_users])
            or (not is_finance_level and email in emails_at_level)
            or delegated_authority
        )
        if not user_eligible:
            raise HTTPException(
                403, f"You are not an approver for level {current_level}")

        if bool(approved_levels.get(current_level)):
            raise HTTPException(
                400, f"Level {current_level} has already been approved")

        # Check if user already acted in this cycle (any level)
        already = any(
            (s.user or "").lower() == email
            and s.step_type == StepType.LEVEL_APPROVED
            and s.approver_number == current_level   # ← scoped to current level only
            for s in current_cycle_steps
        )
        if already:
            raise HTTPException(400, "You have already acted in this workflow cycle")

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
                        _record_step(
                            db, invoice_id,
                            step_name="Posted to Sage",
                            step_type=StepType.POSTED,
                            user_email=email,
                            comment=f"Sage Bill Number: {sage_result.get('sage_bill_number')}",
                            entity=entity,
                        )
                        db.commit()
                        return ActionResponse(
                            success=True,
                            message="Invoice fully approved and posted to Sage.",
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
            if sage_result["success"]:
                invoice = invoice_repo.get(db, invoice_id)
                _update_invoice_status(db, invoice, InvoiceStatus.SAGE_POSTED)
                invoice.sage_bill_number = sage_result.get("sage_bill_number")
                _record_step(
                    db, invoice_id,
                    step_name="Posted to Sage",
                    step_type=StepType.POSTED,
                    user_email=email,
                    comment=f"Sage Bill Number: {sage_result.get('sage_bill_number')}",
                    entity=entity,
                )
                db.commit()
                return ActionResponse(
                    success=True,
                    message="Invoice fully approved after threshold and posted to Sage.",
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
                db.commit()
                return ActionResponse(
                    success=False,
                    message=f"Invoice fully approved after threshold but Sage post failed: {sage_result['message']}",
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
            _record_step(
                db, invoice_id,
                step_name="Posted to Sage",
                step_type=StepType.POSTED,
                user_email=email,
                comment=f"Sage Bill Number: {sage_result.get('sage_bill_number')}",
                entity=entity,
            )
            db.commit()
            return ActionResponse(
                success=True,
                message="Invoice approved and successfully posted to Sage.",
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
            db.commit()
            return ActionResponse(
                success=False,
                message=f"Invoice approved but Sage posting failed: {sage_result['message']}",
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

    _check_concurrency(invoice, payload.last_updated_at)

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
        db, email, workflow, steps, finance_users, current_level, entity
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
    from app.models.db_models import InvoiceStatusEnum
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

    _check_concurrency(invoice, payload.last_updated_at)

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
        db, email, workflow, steps, finance_users, current_level, entity
    )

    # Explicitly allow Posting/Threshold approvers to rework
    is_authorized = (
        role["can_act"] 
        or role["is_finance_team"]
        or (role["is_posting_approver"] and not role["already_acted"])
        or (role["is_threshold_approver"] and not role["already_acted"])
        or (role["user_level"] == current_level)
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

        return ActionResponse(
            success=True,
            message="Invoice returned to coders for rework.",
            new_status=InvoiceStatus.WAITING_CODING,
            next_level=1,
        )

    assigned: List[Dict] = workflow.get("assigned_approvers", [])
    prev_finance_level = _find_previous_finance_level(assigned, current_level)

    if prev_finance_level is None:
        # No previous finance-team approver — frontend should show the alert
        raise HTTPException(
            400,
            detail={
                "code": "NO_FINANCE_APPROVER",
                "message": (
                    "There is no previous Finance Team approver to send this invoice for rework. "
                    "Please use 'Enable Editing' to edit the invoice directly."
                ),
            },
        )

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

    _check_concurrency(invoice, payload.last_updated_at)

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

    _check_concurrency(invoice, payload.last_updated_at)

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

    error_msg = sage_result.get("message", "")
    is_duplicate = "already exists" in error_msg.lower()

    if sage_result["success"] or is_duplicate:
        if is_duplicate:
            logger.info(f"Posted to sage successfully")
            if not invoice.sage_bill_number:
                invoice.sage_bill_number = invoice.invoice_number

        _update_invoice_status(db, invoice, InvoiceStatus.SAGE_POSTED)
        if sage_result.get("sage_bill_number"):
            invoice.sage_bill_number = sage_result.get("sage_bill_number")
        _record_step(
            db,
            invoice_id,
            step_name="Reposted to Sage — Success",
            step_type=StepType.POSTED,
            user_email=email,
            comment=f"Sage Bill Number: {sage_result.get('sage_bill_number')}",
            entity=entity,
        )
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id,
            action="Sage Reposted",
            user=current_user.username,
            entity=entity,
            details={"sage_bill_number": invoice.sage_bill_number},
            sage_bill_number=invoice.sage_bill_number
        )
        db.commit()
        msg = "Invoice successfully reposted to Sage." if not is_duplicate else "Invoice successfully reposted to Sage."
        return ActionResponse(
            success=True,
            message=msg,
            new_status=InvoiceStatus.SAGE_POSTED,
            sage_post_result=sage_result,
        )
    else:
        _record_step(
            db,
            invoice_id,
            step_name="Sage Repost Failed",
            step_type=StepType.POST_FAILED,
            user_email=email,
            comment=sage_result.get("message"),
            entity=entity,
        )
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id,
            action="Sage Repost Failed",
            user=current_user.username,
            entity=entity,
            details={"error": sage_result.get("message")}
        )
        db.commit()
        return ActionResponse(
            success=False,
            message=f"Sage repost failed: {sage_result['message']}",
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

    _check_concurrency(invoice, request.last_updated_at)

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

    return ActionResponse(
        success=True,
        message="Invoice successfully recalled to coding stage.",
        new_status=InvoiceStatus.WAITING_CODING
    )
