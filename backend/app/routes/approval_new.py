
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
from app.models.db_models import Invoice, User, WorkflowStep
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


# ─────────────────────────────────────────────
# Request / Response schemas
# ─────────────────────────────────────────────
class ActionRequest(BaseModel):
    comment: Optional[str] = None


class EnableEditingRequest(BaseModel):
    comment: Optional[str] = None


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


async def _post_to_sage(invoice_id: int, entity: str) -> Dict:
    """
    Call the Sage posting endpoint.
    Replace the URL / auth with your actual Sage integration.
    Returns {"success": bool, "message": str, "sage_bill_id": str|None}.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"https://your-sage-api/postapbill",   # ← Replace with real URL
                json={"invoice_id": invoice_id, "entity": entity},
                # ← Replace
                headers={"Authorization": "Bearer YOUR_SAGE_TOKEN"},
            )
            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "message": "Posted to Sage successfully",
                    "sage_bill_id": data.get("bill_id"),
                }
            return {
                "success": False,
                "message": f"Sage returned HTTP {response.status_code}: {response.text[:200]}",
                "sage_bill_id": None,
            }
    except Exception as exc:
        logger.error("Sage posting error for invoice %s: %s", invoice_id, exc)
        return {
            "success": False,
            "message": str(exc),
            "sage_bill_id": None,
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
    approved_levels = _get_approved_levels(steps)
    threshold_done = _threshold_approved(steps)
    posting_done = _posting_approved(steps)

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
        for s in steps
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
            if not o_email: continue
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
    # Logic:
    #   mandatory levels not yet complete → user must be at current_level and level not done
    #   all mandatory done + threshold exists + threshold not done → threshold approver acts
    #   all mandatory (+ threshold) done → posting approver acts
    mandatory_levels_done = all(
        bool(approved_levels.get(e.get("level")))
        for e in mandatory
    )

    has_threshold = bool(threshold_entries)
    has_posting = bool(posting_entries)

    if not mandatory_levels_done:
        # Must be the user whose level == current_level and level not yet complete
        user_lvl = result["user_level"]
        if user_lvl is not None and user_lvl == current_level:
            result["can_act"] = not result["level_already_approved"]
    elif has_threshold and not threshold_done:
        delegated_threshold = False
        for o_email in [e.lower() for te in threshold_entries for e in _parse_list(te.get("emails", []))]:
            if not o_email: continue
            subs = check_active_delegation(db, o_email, entity)
            if email in [s.lower() for s in subs]:
                delegated_threshold = True
                break
        result["can_act"] = (result["is_threshold_approver"] or delegated_threshold) and not result["already_acted"]
    elif has_posting and not posting_done:
        delegated_posting = False
        for o_email in [e.lower() for pe in posting_entries for e in _parse_list(pe.get("emails", []))]:
            if not o_email: continue
            subs = check_active_delegation(db, o_email, entity)
            if email in [s.lower() for s in subs]:
                delegated_posting = True
                break
        result["can_act"] = (result["is_posting_approver"] or delegated_posting) and not result["already_acted"]
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

    mandatory = [a for a in assigned if a.get("type") == "mandatory"]
    threshold_entries = [a for a in assigned if a.get("type") == "threshold"]
    posting_entries = [a for a in assigned if a.get("type") == "posting"]

    # ── If reworked, only count level_approved steps AFTER the last rework ──
    if current_status == InvoiceStatus.REWORKED:
        rework_steps = [s for s in steps if s.step_type == StepType.REWORKED]
        last_rework_ts = max((s.timestamp for s in rework_steps), default=None)
        if last_rework_ts:
            steps_for_level_check = [
                s for s in steps
                if s.step_type != StepType.LEVEL_APPROVED or s.timestamp > last_rework_ts
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

    can_act = False

    if not mandatory_levels_done:
        current_entry = next(
            (a for a in mandatory if a.get("level") == current_level), None
        )
        if current_entry:
            is_finance_level = current_entry.get("is_finance", False)
            emails_at_level = [e.lower() for e in _parse_list(
                current_entry.get("emails", []))]

            # Delegation check
            delegated_authority = False
            for orig_email in emails_at_level:
                if not orig_email: continue
                substitutes = check_active_delegation(db, orig_email, entity)
                if email in [s.lower() for s in substitutes]:
                    delegated_authority = True
                    break

            user_in_level = (
                (is_finance_level and is_finance) 
                or (email in emails_at_level)
                or delegated_authority
            )

            # Use post-rework steps to check if already acted at this level (by anyone)
            level_is_done = bool(approved_levels.get(current_level))
            can_act = user_in_level and not level_is_done
    elif has_threshold and not threshold_done:
        delegated_threshold = False
        for orig_email in threshold_emails:
            if not orig_email: continue
            substitutes = check_active_delegation(db, orig_email, entity)
            if email in [s.lower() for s in substitutes]:
                delegated_threshold = True
                break

        already_threshold = any(
            (s.user or "").lower() == email
            and s.step_type == StepType.THRESHOLD_APPROVED
            for s in steps_for_level_check
        )
        can_act = (is_threshold_approver or delegated_threshold) and not already_threshold

    elif has_posting and not posting_done:
        delegated_posting = False
        for orig_email in posting_emails:
            if not orig_email: continue
            substitutes = check_active_delegation(db, orig_email, entity)
            if email in [s.lower() for s in substitutes]:
                delegated_posting = True
                break

        already_posted = any(
            (s.user or "").lower() == email
            and s.step_type == StepType.POSTING_APPROVED
            for s in steps_for_level_check
        )
        can_act = (is_posting_approver or delegated_posting) and not already_posted

    # already_acted is for display only
    already_acted = any((s.user or "").lower() == email for s in steps)

    # Pre-calculate flags for the response
    delegated_finance = False
    for f_user in finance_users:
        subs = check_active_delegation(db, f_user, entity)
        if email in [s.lower() for s in subs]:
            delegated_finance = True
            break

    delegated_posting = False
    for p_email in posting_emails:
        if not p_email: continue
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
        can_enable_editing=(is_finance or delegated_finance) and not mandatory_levels_done and current_level == 1,
        can_repost_sage=current_status == InvoiceStatus.SAGE_POST_FAILED and (is_posting_approver or delegated_posting),
        is_posting_approver=is_posting_approver or delegated_posting,
        is_threshold_approver=is_threshold_approver or (any(email in [s.lower() for s in check_active_delegation(db, te, entity)] for te in threshold_emails)),
        is_finance_team=is_finance or delegated_finance,
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
    finance_users = _get_finance_users(db, entity)
    current_level = invoice.current_approver_level or 1
    email = current_user.email.lower()

    assigned: List[Dict] = workflow.get("assigned_approvers", [])
    mandatory = [a for a in assigned if a.get("type") == "mandatory"]
    threshold_entries = [a for a in assigned if a.get("type") == "threshold"]
    posting_entries = [a for a in assigned if a.get("type") == "posting"]

    # ── If reworked, only count level_approved steps AFTER the last rework ──
    if current_status == InvoiceStatus.REWORKED:
        rework_steps = [s for s in steps if s.step_type == StepType.REWORKED]
        last_rework_ts = max((s.timestamp for s in rework_steps), default=None)
        if last_rework_ts:
            steps_for_level_check = [
                s for s in steps
                if s.step_type != StepType.LEVEL_APPROVED or s.timestamp > last_rework_ts
            ]
        else:
            steps_for_level_check = steps
    else:
        steps_for_level_check = steps

    approved_levels = _get_approved_levels(steps_for_level_check)
    threshold_done = _threshold_approved(steps_for_level_check)
    posting_done_already = _posting_approved(steps_for_level_check)

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
            if not orig_email: continue
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

        # Check if user already approved at this level (post-rework only)
        already = any(
            (s.user or "").lower() == email
            and s.step_type == StepType.LEVEL_APPROVED
            and s.approver_number == current_level
            for s in steps_for_level_check
        )
        if already:
            raise HTTPException(400, "You have already approved at this level")

        _record_step(
            db, invoice_id,
            step_name=f"Level {current_level} Approval",
            step_type=StepType.LEVEL_APPROVED,
            user_email=email,
            approver_number=current_level,
            comment=payload.comment,
            entity=entity,
        )

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
                db.commit()
                return ActionResponse(
                    success=True,
                    message=f"Level {current_level} approved. Moved to level {next_mandatory['level']}.",
                    new_status=current_status,
                    next_level=next_mandatory["level"],
                )
            else:
                if has_threshold and not threshold_done:
                    threshold_virtual_level = len(mandatory) + 1
                    _advance_level(db, invoice, threshold_virtual_level)
                    db.commit()
                    return ActionResponse(
                        success=True,
                        message="All mandatory levels approved. Awaiting threshold approver.",
                        new_status=current_status,
                        next_level=threshold_virtual_level,
                    )
                elif has_posting and not posting_done_already:
                    posting_virtual_level = len(
                        mandatory) + (2 if has_threshold else 1)
                    _advance_level(db, invoice, posting_virtual_level)
                    db.commit()
                    return ActionResponse(
                        success=True,
                        message="All mandatory levels approved. Awaiting posting approver.",
                        new_status=current_status,
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
                    return ActionResponse(
                        success=True,
                        message="Invoice fully approved.",
                        new_status=InvoiceStatus.APPROVED,
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
            if not orig_email: continue
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

        if has_posting:
            posting_virtual_level = len(mandatory) + 2
            _advance_level(db, invoice, posting_virtual_level)
            db.commit()
            return ActionResponse(
                success=True,
                message="Threshold approved. Awaiting posting approver.",
                new_status=current_status,
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
            return ActionResponse(
                success=True,
                message="Invoice fully approved after threshold.",
                new_status=InvoiceStatus.APPROVED,
            )

    # ── CASE C: Posting approver stage ──
    if has_posting and not posting_done_already:
        posting_emails = []
        for pe in posting_entries:
            posting_emails.extend(_parse_list(pe.get("emails", [])))

        delegated_posting = False
        for orig_email in posting_emails:
            if not orig_email: continue
            substitutes = check_active_delegation(db, orig_email, entity)
            if email in [s.lower() for s in substitutes]:
                delegated_posting = True
                break

        if email not in [e.lower() for e in posting_emails] and not delegated_posting:
            raise HTTPException(403, "You are not the posting approver")

        _update_invoice_status(db, invoice, InvoiceStatus.APPROVED)
        _record_step(
            db, invoice_id,
            step_name="Posting Approver Approved",
            step_type=StepType.POSTING_APPROVED,
            user_email=email,
            comment=payload.comment,
            entity=entity,
        )
        _record_step(
            db, invoice_id,
            step_name="Invoice Approved",
            step_type=StepType.APPROVED,
            user_email=email,
            comment=payload.comment,
            entity=entity,
        )
        db.commit()

        sage_result = await _post_to_sage(invoice_id, entity)

        if sage_result["success"]:
            invoice = invoice_repo.get(db, invoice_id)
            _update_invoice_status(db, invoice, InvoiceStatus.SAGE_POSTED)
            invoice.sage_bill_id = sage_result.get("sage_bill_id")
            _record_step(
                db, invoice_id,
                step_name="Posted to Sage",
                step_type=StepType.POSTED,
                user_email=email,
                comment=f"Sage Bill ID: {sage_result.get('sage_bill_id')}",
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
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
):
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")

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
    if not role["can_act"]:
        raise HTTPException(
            403, "You are not authorized to reject this invoice at its current stage")

    import json as _json

    # ── 1. Snapshot all child tables into DeletedInvoice ──────────────────
    from app.models.db_models import (
        DeletedInvoice, InvoiceStatusHistory, InvoiceApprovedBy,
        InvoiceAssignedApprover, Coding, AuditLog, WorkflowStep as WFStep
    )

    # Fetch child data
    status_history = db.query(InvoiceStatusHistory).filter_by(
        invoice_id=invoice_id).all()
    workflow_steps_rows = db.query(WFStep).filter_by(
        invoice_id=invoice_id).all()
    approved_by_rows = db.query(InvoiceApprovedBy).filter_by(
        invoice_id=invoice_id).all()
    assigned_approvers_rows = db.query(
        InvoiceAssignedApprover).filter_by(invoice_id=invoice_id).all()
    coding_row = db.query(Coding).filter_by(invoice_id=invoice_id).first()
    audit_logs_rows = db.query(AuditLog).filter_by(invoice_id=invoice_id).all()

    deleted = DeletedInvoice(
        original_invoice_id=invoice.id,
        filename=invoice.filename,
        original_filename=invoice.original_filename,
        file_path=invoice.file_path,
        uploaded_by=invoice.uploaded_by,
        uploaded_by_id=invoice.uploaded_by_id,
        status="rejected",
        entity=invoice.entity,
        vendor_id=invoice.vendor_id,
        vendor_name=invoice.vendor_name,
        invoice_number=invoice.invoice_number,
        azure_vendor_name=invoice.azure_vendor_name,
        azure_vendor_address=invoice.azure_vendor_address,
        line_grouping=invoice.line_grouping,
        exchange_rate=invoice.exchange_rate,
        total_amount=invoice.total_amount,
        amount_due=invoice.amount_due,
        invoice_date=invoice.invoice_date,
        due_date=invoice.due_date,
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

        # Child table snapshots as JSON
        status_history_json=_json.dumps([
            {"status": s.status, "user": s.user, "timestamp": str(s.timestamp),
             "comment": s.comment, "approver_level": s.approver_level}
            for s in status_history
        ]),
        workflow_steps_json=_json.dumps([
            {"step_name": s.step_name, "step_type": s.step_type, "user": s.user,
             "status": s.status, "timestamp": str(s.timestamp),
             "approver_number": s.approver_number, "comment": s.comment}
            for s in workflow_steps_rows
        ]),
        approved_by_json=_json.dumps([
            {"approver_email": a.approver_email} for a in approved_by_rows
        ]),
        assigned_approvers_json=_json.dumps([
            {"approver_email": a.approver_email,
                "sequence_order": a.sequence_order}
            for a in assigned_approvers_rows
        ]),
        coding_json=_json.dumps({
            "header_coding": coding_row.header_coding,
            "line_items": coding_row.line_items,
        }) if coding_row else None,
        audit_logs_json=_json.dumps([
            {"action": a.action, "user": a.user, "details": a.details,
             "timestamp": str(a.timestamp)}
            for a in audit_logs_rows
        ]),

        deleted_at=datetime.utcnow(),
        deleted_by=email,
    )
    db.add(deleted)
    db.flush()  # get deleted.id before deleting invoice

    # ── 2. Record the rejection step BEFORE deleting ──────────────────────
    _record_step(
        db,
        invoice_id,
        step_name="Invoice Rejected",
        step_type=StepType.REJECTED,
        user_email=email,
        comment=payload.comment,
        entity=entity,
    )
    db.flush()

    # ── 3. Delete the invoice (cascades to all child tables) ──────────────
    db.delete(invoice)
    db.commit()

    return ActionResponse(
        success=True,
        message="Invoice has been rejected and permanently removed. No further actions are possible.",
        new_status=InvoiceStatus.REJECTED,
    )

# ─────────────────────────────────────────────
# POST /workflow/action/rework/{invoice_id}
# ─────────────────────────────────────────────


@router.post("/rework/{invoice_id}", response_model=ActionResponse)
async def rework_invoice(
    invoice_id: int,
    payload: ActionRequest,
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
    is_current_level_user = role["user_level"] == current_level
    is_finance_user = role["is_finance_team"]

    if not (role["can_act"] or is_current_level_user or is_finance_user):
        raise HTTPException(
            403, "You are not authorized to send this invoice for rework"
        )

    # ── Early check: level 1 can never have a previous finance approver ──
    if current_level == 1:
        raise HTTPException(
            400,
            detail={
                "code": "NO_FINANCE_APPROVER",
                "message": (
                    "You are the first approver. There is no previous Finance Team approver "
                    "to send this invoice for rework. "
                    "Please use 'Enable Editing' to edit the invoice directly."
                ),
            },
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
        approver_number=prev_finance_level,
        comment=payload.comment,
        entity=entity,
    )
    db.commit()

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

    if email not in [f.lower() for f in finance_users] and not delegated_finance:
        raise HTTPException(
            403, "Only Finance Team members (or their delegates) can enable editing")

    _record_step(
        db,
        invoice_id,
        step_name="Editing Enabled by Finance Team",
        step_type=StepType.EDITING_ENABLED,
        user_email=email,
        comment=payload.comment,
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

    posting_emails: List[str] = []
    for pe in posting_entries:
        posting_emails.extend(_parse_list(pe.get("emails", [])))

    email = current_user.email.lower()
    delegated_posting = False
    for orig_email in posting_emails:
        if not orig_email: continue
        substitutes = check_active_delegation(db, orig_email, entity)
        if email in [s.lower() for s in substitutes]:
            delegated_posting = True
            break

    if email not in [e.lower() for e in posting_emails] and not delegated_posting:
        raise HTTPException(
            403, "Only the posting approver (or their delegate) can repost to Sage")

    # Attempt repost
    sage_result = await _post_to_sage(invoice_id, entity)

    if sage_result["success"]:
        _update_invoice_status(db, invoice, InvoiceStatus.SAGE_POSTED)
        invoice.sage_bill_id = sage_result.get("sage_bill_id")
        _record_step(
            db,
            invoice_id,
            step_name="Reposted to Sage — Success",
            step_type=StepType.POSTED,
            user_email=email,
            comment=f"Sage Bill ID: {sage_result.get('sage_bill_id')}",
        )
        db.commit()
        return ActionResponse(
            success=True,
            message="Invoice successfully reposted to Sage.",
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
        )
        db.commit()
        return ActionResponse(
            success=False,
            message=f"Sage repost failed: {sage_result['message']}",
            new_status=InvoiceStatus.SAGE_POST_FAILED,
            sage_post_result=sage_result,
        )
