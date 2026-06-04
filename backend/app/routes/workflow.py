from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc
import json
import re
from datetime import datetime

from app.database.database import get_db
from app.models.db_models import (
    Invoice, WorkflowStep, VendorWorkflow, CodificationWorkflow, 
    VendorMaster, Coding as DBCoding
)
from app.repository.repositories import (
    invoice_repo, workflow_step_repo, vendor_workflow_repo,
    codification_workflow_repo, vendor_master_repo, coding_repo
)
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from app.models.workflow import (
    WorkflowStepCreate,
    WorkflowStepResponse,
    WorkflowHistoryResponse,
    WorkflowStepType,
    WorkflowStepStatus
)
from app.ai.vector_matcher import get_cached_vendors
from app.ai.normalizer import normalize_vendor

router = APIRouter()

def get_vendor_data_from_invoice(db: Session, invoice_id: int):
    """Helper to extract vendor name and ID from invoice using SQLAlchemy"""
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice:
        return None, None
    
    # Check direct fields first
    v_name = invoice.vendor_name
    v_id = invoice.vendor_id
    if v_name and v_id:
        return v_name, v_id

    # Fallback to extraction data
    extracted = {}
    if invoice.extracted_data:
        try:
            extracted = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        except:
            pass
            
    if "vendor_info" in extracted:
        v_info = extracted["vendor_info"]
        if isinstance(v_info, dict):
            name_val = v_info.get("name", {}).get("value") if isinstance(v_info.get("name"), dict) else v_info.get("name")
            if name_val: v_name = str(name_val).strip()
            
            # Also try to get vendor_id if LLM extracted it (unlikely but possible) or it was stored in metadata
            id_val = v_info.get("vendor_id", {}).get("value") if isinstance(v_info.get("vendor_id"), dict) else v_info.get("vendor_id")
            if id_val: v_id = str(id_val).strip()
    
    if not v_name:
        for field in ["VendorName", "MerchantName", "vendor_name", "merchant_name"]:
            if field in extracted and isinstance(extracted[field], dict):
                val = extracted[field].get("value")
                if val: v_name = str(val).strip()
    
    if not v_id:
    # Try to get from top level of extraction if LLM put it there
        for field in ["VendorId", "vendor_id", "CustomerID", "customer_id"]:
            if field in extracted and isinstance(extracted[field], dict):
                val = extracted[field].get("value")
                if val:
                    v_id = str(val).strip()
                    if not v_name:
                        v_name = str(val).strip()
                    break

    return v_name, v_id


def get_invoice_total_from_invoice(db: Session, invoice_id: int):
    """Helper to extract total amount from invoice using SQLAlchemy"""
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice:
        return None
        
    extracted = {}
    if invoice.extracted_data:
        try:
            extracted = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        except:
            pass
    
    def parse_amount(val):
        if not val:
            return None
        try:
            if isinstance(val, (int, float)):
                return float(val)
            val_str = str(val).strip().replace(",", "")
            match = re.search(r'-?\d+(\.\d+)?', val_str)
            if match:
                return float(match.group())
            return None
        except:
            return None

    # 1. Primary source: Database column (already a Decimal/Number)
    if getattr(invoice, 'total_amount', None) is not None:
        try: return float(invoice.total_amount)
        except: pass

    # 2. Fallback: Parse from extracted_data JSON
    if "amounts" in extracted:
        amounts = extracted["amounts"]
        if isinstance(amounts, dict):
            total_obj = amounts.get("total_invoice_amount", {})
            if isinstance(total_obj, dict):
                return parse_amount(total_obj.get("value"))
                
    for field in ["Total Invoice Amount", "TotalAmount", "InvoiceTotal", "Total", "total_amount"]:
        if field in extracted and isinstance(extracted[field], dict):
            return parse_amount(extracted[field].get("value"))
            
    return None

def get_required_approver_count(
    db: Session, 
    vendor_name: str, 
    amount: float = None, 
    invoice_id: int = None, 
    invoice_data: Any = None, 
    currency: str = "USD", 
    entity: str = None, 
    force_vendor_id: str = None, 
    force_vendor_name: str = None,
    force_lob: str = None,
    force_dept: str = None
):
    """
    Get the required approvers based on Workflow rules in SQL Server.
    """
    # 0. Check persisted values
    if not force_vendor_name and not force_vendor_id and invoice_data:
        req_approvers = getattr(invoice_data, "required_approvers", None)
        if req_approvers is None and isinstance(invoice_data, dict):
            req_approvers = invoice_data.get("required_approvers")
            
        if req_approvers is not None:
            assigned_approvers_list = getattr(invoice_data, "assigned_approvers_list", None)
            if assigned_approvers_list is None and isinstance(invoice_data, dict):
                from app.models.db_models import InvoiceAssignedApprover
                inv_id = invoice_data.get("id") or invoice_id
                if inv_id:
                    assigned_approvers_list = db.query(InvoiceAssignedApprover).filter(InvoiceAssignedApprover.invoice_id == inv_id).all()
            
            if assigned_approvers_list:
                # Group by sequence_order to recreate the levels
                levels = {}
                for a in assigned_approvers_list:
                    seq = a.sequence_order
                    if seq not in levels:
                        levels[seq] = {
                            "emails": [], 
                            "is_finance": getattr(a, "is_finance", False), 
                            "level": seq,
                            "type": "mandatory" 
                        }
                    levels[seq]["emails"].append(a.approver_email)
                
                # Sort levels and format as list of dicts
                assigned_approvers = [levels[s] for s in sorted(levels.keys())]
                
                # Restore threshold/posting types from breakdown
                breakdown_data = {}
                app_breakdown = getattr(invoice_data, "approver_breakdown", None)
                if app_breakdown is None and isinstance(invoice_data, dict):
                    app_breakdown = invoice_data.get("approver_breakdown")
                if app_breakdown:
                    try:
                        breakdown_data = json.loads(app_breakdown) if isinstance(app_breakdown, str) else app_breakdown
                    except:
                        pass
                
                has_posting = breakdown_data.get("has_posting_approver", False) if isinstance(breakdown_data, dict) else False
                has_threshold = breakdown_data.get("has_threshold_approver", False) if isinstance(breakdown_data, dict) else False
                
                if assigned_approvers:
                    if has_posting:
                        assigned_approvers[-1]["type"] = "posting"
                    if has_threshold:
                        idx = len(assigned_approvers) - (2 if has_posting else 1)
                        if idx >= 0:
                            assigned_approvers[idx]["type"] = "threshold"
                            
                return {
                    "required": req_approvers,
                    "assigned_approvers": assigned_approvers,
                    "workflow_type": "persisted",
                    "breakdown": breakdown_data 
                }

    assigned_approvers = []
    workflow_found = False
    workflow_type = None
    vendor_eligible = False
    is_parallel = False
    
    # Resolve vendor identity
    if force_vendor_name or force_vendor_id:
         v_name_resolved = force_vendor_name
         v_id_resolved = force_vendor_id
    else:
        v_name_resolved, v_id_resolved = get_vendor_data_from_invoice(db, invoice_id) if invoice_id else (vendor_name, None)

    # 1. Check Vendor Eligibility in Vendor Master (Using Cache)
    vendors, vendor_map, address_map = get_cached_vendors(db)
    
    vendor_entry = None
    if v_id_resolved:
        # Search for vendor_id across all rows in the list
        for row in vendors:
            rid = row.get("vendor_id") or row.get("VENDOR_ID") or row.get("Vendor ID")
            if str(rid) == str(v_id_resolved):
                vendor_entry = row
                break
    
    if not vendor_entry and v_name_resolved:
        norm_name = normalize_vendor(v_name_resolved)
        vendor_entry = vendor_map.get(norm_name)

    if vendor_entry:
        if not v_id_resolved:
            v_id_resolved = vendor_entry.get("vendor_id") or vendor_entry.get("VENDOR_ID") or vendor_entry.get("Vendor ID")
        workflow_applicable = None
        for key in vendor_entry.keys():
            kl = key.lower()
            if "workflow" in kl and ("applicable" in kl or "applicability" in kl or "eligible" in kl or "eligibility" in kl):
                workflow_applicable = vendor_entry[key]
                break
        if str(workflow_applicable).strip().lower() == "yes":
            vendor_eligible = True

    # 2. Try Vendor Based Workflow
    if entity:
        v_workflow = None
        if v_id_resolved:
            v_workflow_list = vendor_workflow_repo.get_multi(db, filters={"vendor_id": v_id_resolved, "entity": entity}, limit=1)
            v_workflow = v_workflow_list[0] if v_workflow_list else None
        
        if not v_workflow and v_name_resolved:
            v_workflow_list = vendor_workflow_repo.get_multi(db, filters={"vendor_name": v_name_resolved, "entity": entity}, limit=1)
            v_workflow = v_workflow_list[0] if v_workflow_list else None
            if not v_workflow:
                # Still use LIKE for name matching
                v_workflow = db.query(VendorWorkflow).filter(VendorWorkflow.vendor_name.like(f"%{v_name_resolved}%"), VendorWorkflow.entity == entity).first()
            
        if v_workflow:
            # If we found a workflow, we prioritize it
            workflow_found = True
            workflow_type = "vendor"
            count = v_workflow.approver_count
            def parse_approvers(val):
                if not val: return []
                if isinstance(val, str) and val.startswith("["):
                    try: return json.loads(val)
                    except: return [val]
                return [val] if val else []

            def parse_flags(val):
                if not val: return {}
                if isinstance(val, dict): return val
                try: return json.loads(val)
                except: return {}

            flags = parse_flags(v_workflow.approver_flags)

            mandatory_fields = [
                parse_approvers(v_workflow.mandatory_approver_1),
                parse_approvers(v_workflow.mandatory_approver_2),
                parse_approvers(v_workflow.mandatory_approver_3),
                parse_approvers(v_workflow.mandatory_approver_4),
                parse_approvers(v_workflow.mandatory_approver_5)
            ]
            assigned_approvers = []
            for i, a in enumerate(mandatory_fields[:count]):
                is_fin = flags.get(str(i+1)) == True or flags.get(i+1) == True
                assigned_approvers.append({
                    "emails": a, 
                    "type": "mandatory", 
                    "level": i+1,
                    "is_finance": is_fin
                })
            is_parallel = getattr(v_workflow, 'is_parallel', False)
            
            has_threshold_approver = False
            if getattr(v_workflow, 'is_threshold_enabled', False):
                threshold = float(v_workflow.amount_threshold) if v_workflow.amount_threshold is not None else 0.0
                rule_amount_threshold = threshold
                if amount is not None and amount >= threshold and v_workflow.threshold_approver:
                    assigned_approvers.append({"emails": parse_approvers(v_workflow.threshold_approver), "type": "threshold"})
                    has_threshold_approver = True

            # Posting Approver
            has_posting_approver = False
            if getattr(v_workflow, 'posting_approver', None):
                assigned_approvers.append({"emails": parse_approvers(v_workflow.posting_approver), "type": "posting"})
                has_posting_approver = True


    # 3. Try Codification Based Workflow
    if not workflow_found and entity:
        # Use forced values if provided (preview mode)
        if force_lob and force_dept:
            items = [{"lob": force_lob, "department_id": force_dept}]
        elif invoice_id:
            coding_list = coding_repo.get_multi(db, filters={"invoice_id": invoice_id}, limit=1)
            coding = coding_list[0] if coding_list else None
            items = json.loads(coding.line_items) if coding and coding.line_items else []
        else:
            items = []

        # User requested to only check the first line item
        if items:
            item = items[0]
            lob_raw = item.get("lob")
            dept_raw = item.get("department_id") or item.get("department")
            lob = lob_raw.split(" - ")[0].strip() if lob_raw and " - " in str(lob_raw) else lob_raw
            dept = dept_raw.split(" - ")[0].strip() if dept_raw and " - " in str(dept_raw) else dept_raw

            if lob and dept:
                cod_workflow_list = codification_workflow_repo.get_multi(
                    db,
                    filters={
                        "lob": lob,
                        "department_id": dept,
                        "entity": entity
                    },
                    limit=1
                )
                cod_workflow = cod_workflow_list[0] if cod_workflow_list else None
                
                if cod_workflow:
                    workflow_found = True
                    workflow_type = "codification"
                    count = cod_workflow.approver_count
                    
                    def parse_approvers(val):
                        if not val: return []
                        if isinstance(val, str) and val.startswith("["):
                            try: return json.loads(val)
                            except: return [val]
                        return [val] if val else []

                    def parse_flags(val):
                        if not val: return {}
                        if isinstance(val, dict): return val
                        try: return json.loads(val)
                        except: return {}

                    flags = parse_flags(cod_workflow.approver_flags)

                    mandatory_fields = [
                        parse_approvers(cod_workflow.mandatory_approver_1),
                        parse_approvers(cod_workflow.mandatory_approver_2),
                        parse_approvers(cod_workflow.mandatory_approver_3),
                        parse_approvers(cod_workflow.mandatory_approver_4),
                        parse_approvers(cod_workflow.mandatory_approver_5)
                    ]
                    assigned_approvers = []
                    for i, a in enumerate(mandatory_fields[:count]):
                        is_fin = flags.get(str(i+1)) == True or flags.get(i+1) == True
                        assigned_approvers.append({
                            "emails": a, 
                            "type": "mandatory", 
                            "level": i+1,
                            "is_finance": is_fin
                        })
                    is_parallel = getattr(cod_workflow, 'is_parallel', False)
                    
                    has_threshold_approver = False
                    if getattr(cod_workflow, 'is_threshold_enabled', False):
                        threshold = float(cod_workflow.amount_threshold) if cod_workflow.amount_threshold is not None else 0.0
                        rule_amount_threshold = threshold
                        if amount is not None and amount >= threshold and cod_workflow.threshold_approver:
                            assigned_approvers.append({"emails": parse_approvers(cod_workflow.threshold_approver), "type": "threshold"})
                            has_threshold_approver = True

                    # Posting Approver
                    has_posting_approver = False
                    if getattr(cod_workflow, 'posting_approver', None):
                        assigned_approvers.append({"emails": parse_approvers(cod_workflow.posting_approver), "type": "posting"})
                        has_posting_approver = True

    # 4. Fallback Logic removed as requested
    if not workflow_found:
        return {
            "required": 1,
            "assigned_approvers": [],
            "workflow_type": "hardcoded_default",
            "breakdown": {"default": 1}
        }

    # total required = number of levels
    
    # Parallel means: each level requires 1 approval.
    # Total required = number of stages.
    # (Even if sequential, total required = number of stages, because current_approver_level matches stage)
    req_count = len(assigned_approvers)

    return {
        "required": req_count,
        "assigned_approvers": assigned_approvers,
        "workflow_type": workflow_type,
        "is_parallel": is_parallel,
        "breakdown": {
            "type": workflow_type, 
            "vendor_eligible": vendor_eligible, 
            "is_parallel": is_parallel,
            "has_posting_approver": has_posting_approver if 'has_posting_approver' in locals() else False,
            "has_threshold_approver": has_threshold_approver if 'has_threshold_approver' in locals() else False,
            "amount_threshold": rule_amount_threshold if 'rule_amount_threshold' in locals() else None
        }
    }

@router.get("/{invoice_id}", response_model=WorkflowHistoryResponse)
async def get_workflow_history(
    invoice_id: int,
    preview_vendor_id: Optional[str] = None,
    preview_vendor_name: Optional[str] = None,
    preview_lob: Optional[str] = None,
    preview_department_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    
    # Use the entity stored on the invoice
    entity = invoice.entity
        
    vendor_name = preview_vendor_name if preview_vendor_name else (invoice.vendor_name or "Unknown")
    vendor_id = preview_vendor_id if preview_vendor_id else invoice.vendor_id
    total_amount = get_invoice_total_from_invoice(db, invoice_id)
    
    # Support currency extraction
    extracted = {}
    if invoice.extracted_data:
        try:
            extracted = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        except: pass
    currency = extracted.get("invoice_details", {}).get("currency", {}).get("value", "USD")

    # --- SNAPSHOT LOCK ---
    # If the invoice already has a persisted approver snapshot (waiting_approval / reworked),
    # read it directly from the DB.  Do NOT re-run get_required_approver_count with live
    # config params, because that bypasses the snapshot guard and returns current workflow
    # config values instead of the locked-in approvers.
    invoice_status_str = invoice.status.value if hasattr(invoice.status, "value") else str(invoice.status)
    snapshot_statuses = {"waiting_approval", "reworked", "sage_post_failed", "approved", "sage_posted", "rejected"}
    snapshot_approvers_list = getattr(invoice, "assigned_approvers_list", None) or []

    breakdown_data = {}
    if invoice.approver_breakdown:
        try: breakdown_data = json.loads(invoice.approver_breakdown) if isinstance(invoice.approver_breakdown, str) else invoice.approver_breakdown
        except: pass

    is_custom = False
    if isinstance(breakdown_data, dict) and breakdown_data.get("is_custom_workflow"):
        is_custom = True

    if (invoice_status_str in snapshot_statuses or is_custom) and snapshot_approvers_list:
        # Reconstruct levels from persisted rows
        levels = {}
        for a in snapshot_approvers_list:
            seq = a.sequence_order
            if seq not in levels:
                levels[seq] = {
                    "emails": [],
                    "is_finance": getattr(a, "is_finance", False),
                    "level": seq,
                    "type": "mandatory",
                }
            levels[seq]["emails"].append(a.approver_email)
        locked_approvers = [levels[s] for s in sorted(levels.keys())]
        
        # Restore threshold/posting types from breakdown
        breakdown_data = {}
        if invoice.approver_breakdown:
            try: breakdown_data = json.loads(invoice.approver_breakdown) if isinstance(invoice.approver_breakdown, str) else invoice.approver_breakdown
            except: pass
        
        has_posting = breakdown_data.get("has_posting_approver", False)
        has_threshold = breakdown_data.get("has_threshold_approver", False)
        
        if locked_approvers:
            if has_posting:
                locked_approvers[-1]["type"] = "posting"
            if has_threshold:
                idx = len(locked_approvers) - (2 if has_posting else 1)
                if idx >= 0:
                    locked_approvers[idx]["type"] = "threshold"

        requirement_data = {
            "required": invoice.required_approvers or len(locked_approvers),
            "assigned_approvers": locked_approvers,
            "workflow_type": "persisted",
            "breakdown": breakdown_data,
        }
    else:
        # Invoice is not yet submitted (or is in a terminal state) —
        # use live workflow config so the tab shows a preview of who would approve.
        requirement_data = get_required_approver_count(
            db, vendor_name, total_amount, invoice_id, invoice_data=invoice,
            currency=currency, entity=entity, force_vendor_id=vendor_id, force_vendor_name=vendor_name,
            force_lob=preview_lob, force_dept=preview_department_id
        )
    
    steps = workflow_step_repo.get_multi(
        db, 
        filters={"invoice_id": invoice_id}, 
        order_by="timestamp", 
        limit=500
    )
    
    # Fetch Delegations
    delegations_map = {}
    from app.models.delegation import check_active_delegation
    assigned_approvers = requirement_data.get("assigned_approvers", [])
    
    def _flatten_emails(items):
        res = []
        if items is None: return res
        
        # Wrap single item in list for unified processing
        work_list = items if isinstance(items, list) else [items]
        
        for item in work_list:
            if isinstance(item, list):
                res.extend(_flatten_emails(item))
            elif isinstance(item, dict):
                # Recursively extract from 'emails' key if present
                emails_val = item.get("emails", [])
                res.extend(_flatten_emails(emails_val))
            elif isinstance(item, str):
                item = item.strip()
                if item.startswith("["):
                    try:
                        parsed = json.loads(item)
                        res.extend(_flatten_emails(parsed))
                    except:
                        res.append(item)
                else:
                    res.append(item)
        return res

    flat_emails = set(_flatten_emails(assigned_approvers))
    for email in flat_emails:
        if email and isinstance(email, str):
            subs = check_active_delegation(db, email, entity)
            if subs: delegations_map[email.lower()] = subs

    # Fetch User Names for Display
    user_names_map = {}
    involved_emails = set(flat_emails)
    for s in steps:
        if s.user: involved_emails.add(s.user.lower())
    for orig, substitutes in delegations_map.items():
        involved_emails.add(orig.lower())
        for sub in substitutes:
            involved_emails.add(sub.lower())
    
    if involved_emails:
        from app.models.db_models import User
        user_list = db.query(User).filter(User.email.in_(list(involved_emails))).all()
        for u in user_list:
            user_names_map[u.email.lower()] = u.username

    return WorkflowHistoryResponse(
        invoice_id=str(invoice_id),
        vendor_name=vendor_name,
        required_approvers=requirement_data["required"],
        assigned_approvers=assigned_approvers,
        current_approver_level=invoice.current_approver_level or 1,
        current_status=invoice.status.value if hasattr(invoice.status, "value") else str(invoice.status),
        approver_breakdown=requirement_data["breakdown"],
        delegations=delegations_map,
        user_names=user_names_map,
        workflow_type=requirement_data.get("workflow_type", "unknown"),
        steps=[
            WorkflowStepResponse(
                id=str(s.id),
                invoice_id=str(s.invoice_id),
                step_name=s.step_name,
                step_type=s.step_type,
                user=s.user,
                status=s.status,
                approver_number=s.approver_number,
                comment=s.comment,
                timestamp=s.timestamp
            ) for s in steps
        ]
    )
    
@router.get("/approvers/{invoice_id}")
async def get_approver_status(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """
    Get the workflow status/history for an invoice.
    This is called by the frontend to show the approval timeline.
    """
    steps = workflow_step_repo.get_multi(
        db, 
        filters={"invoice_id": invoice_id}, 
        order_by="timestamp", 
        limit=500
    )
    
    return {
        "approvers": [
            {
                "id": str(s.id),
                "invoice_id": str(s.invoice_id),
                "step_name": s.step_name,
                "step_type": s.step_type,
                "user": s.user,
                "status": s.status,
                "timestamp": s.timestamp.isoformat() if s.timestamp else None,
                "comment": s.comment
            } for s in steps
        ]
    }

@router.put("/custom/{invoice_id}")
async def save_custom_invoice_workflow(
    invoice_id: int,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Save an ad-hoc custom workflow sequence for a specific invoice.
    Updates the database with assigned approvers and marks the invoice
    as using a custom workflow override.
    """
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    # User can only edit if status is waiting_coding
    status_str = invoice.status.value if hasattr(invoice.status, "value") else str(invoice.status)
    if status_str != "waiting_coding":
        raise HTTPException(
            status_code=400, 
            detail="Invoice workflow can only be edited when status is waiting_coding"
        )

    # ─── Concurrency Check (Optimistic Locking) ───
    req_last_updated = payload.get("last_updated_at")
    if req_last_updated and invoice.updated_at:
        try:
            from dateutil.parser import parse as parse_date
            if isinstance(req_last_updated, str):
                req_ts = parse_date(req_last_updated).replace(microsecond=0, tzinfo=None)
            else:
                req_ts = req_last_updated.replace(microsecond=0, tzinfo=None)
                
            db_ts = invoice.updated_at.replace(microsecond=0, tzinfo=None)
            if db_ts > req_ts:
                from app.models.db_models import AuditLog
                latest_audit = db.query(AuditLog).filter(AuditLog.invoice_id == invoice.id).order_by(AuditLog.timestamp.desc()).first()
                last_audit_user = latest_audit.user if latest_audit else None
                
                if not last_audit_user or (last_audit_user != current_user.email and last_audit_user != current_user.username):
                    raise HTTPException(
                        status_code=409,
                        detail="This invoice has been modified by another user. Please refresh."
                    )
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error checking workflow timestamp: {e}")
        
    approvers = payload.get("approvers", [])  # list of levels: [{"level": 1, "emails": [...], "is_finance": bool}]
    if not approvers:
        raise HTTPException(status_code=400, detail="Approvers sequence cannot be empty")
        
    # Validate structure and resolve flat list of levels
    from app.repository.repositories import invoice_assigned_approver_repo
    
    # 1. Clear existing assigned approvers
    invoice_assigned_approver_repo.delete_all(db, filters={"invoice_id": invoice_id})
    
    # 2. Write new custom assigned approvers
    from app.models.db_models import User
    
    for idx, lvl in enumerate(approvers):
        emails = lvl.get("emails", [])
        is_finance = lvl.get("is_finance", False)
        
        if is_finance:
            # Fetch active finance department users
            finance_users = (
                db.query(User)
                .filter(
                    User.department != None,
                    User.department.ilike("%finance%"),
                    ~User.department.ilike("%non-finance%"),
                    User.role.ilike("%approver%"),
                    User.status == "active"
                )
                .all()
            )
            finance_emails = [u.email.lower() for u in finance_users if u.email]
            combined = set(e.strip().lower() for e in emails if e) | set(finance_emails)
        else:
            combined = set(e.strip().lower() for e in emails if e)
            
        # Save each email in this level with the sequence order
        for email in combined:
            if email:
                invoice_assigned_approver_repo.create(db, obj_in={
                    "invoice_id": invoice_id,
                    "approver_email": email.strip().lower(),
                    "sequence_order": idx + 1,
                    "is_finance": is_finance
                })
                
    # 3. Update Invoice required approvers and breakdown
    invoice.required_approvers = len(approvers)
    
    has_posting_approver = payload.get("has_posting_approver", False)
    has_threshold_approver = payload.get("has_threshold_approver", False)
    amount_threshold = payload.get("amount_threshold")
    
    # Store custom breakdown with is_custom_workflow set to True
    custom_breakdown = {
        "type": "custom",
        "is_custom_workflow": True,
        "vendor_eligible": False,
        "is_parallel": False,
        "has_posting_approver": has_posting_approver,
        "has_threshold_approver": has_threshold_approver,
        "amount_threshold": amount_threshold
    }
    invoice.approver_breakdown = json.dumps(custom_breakdown)
    
    from app.models.db_models import get_ist_now
    invoice.updated_at = get_ist_now()
    
    db.commit()
    
    return {"message": "Custom invoice workflow saved successfully"}
