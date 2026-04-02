from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime
import json
from app.models.invoice import InvoiceStatus
from app.models.workflow import WorkflowStepType, WorkflowStepStatus
from app.database.database import get_db
from app.models.db_models import (
    Invoice, WorkflowStep, InvoiceStatusHistory, Coding as DBCoding,
    InvoiceAssignedApprover, User
)
from app.repository.repositories import (
    invoice_repo, coding_repo, invoice_assigned_approver_repo,
    invoice_status_history_repo, workflow_step_repo, user_repo
)

from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from app.services.audit_service import audit_service
from app.models.audit_log import AuditAction
from app.routes.workflow import (
    get_vendor_data_from_invoice, 
    get_required_approver_count, 
    get_invoice_total_from_invoice
)

from app.services.email_service import email_service

router = APIRouter()

@router.post("/send-to-approval/{invoice_id}")
async def send_to_approval(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """
    Send invoice to approval workflow using SQLAlchemy.
    """
    # 1. Verify invoice exists
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Use the entity stored on the invoice for all subsequent lookups
    entity = invoice.entity
    
    # 2. Verify coding exists
    coding_list = coding_repo.get_multi(db, filters={"invoice_id": invoice_id}, limit=1)
    coding = coding_list[0] if coding_list else None
    if not coding:
        raise HTTPException(status_code=400, detail="Coding must be completed before sending to approval")
    
    # 3. Calculate Approvers
    vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
    total_amount = get_invoice_total_from_invoice(db, invoice_id)
    
    # Get currency from extraction
    extracted = {}
    if invoice.extracted_data:
        try: extracted = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        except: pass
    currency = extracted.get("invoice_details", {}).get("currency", {}).get("value", "USD")
    
    requirement_data = get_required_approver_count(db, vendor_name, total_amount, invoice_id, currency=currency, entity=entity, force_vendor_id=vendor_id)
    
    # 4. Update Invoice Status
    invoice.status = InvoiceStatus.WAITING_APPROVAL
    invoice.current_approver_level = 1
    invoice.required_approvers = requirement_data["required"]
    # Note: workflow_type is tracked in requirement_data but not stored on invoice

    
    # Clear existing assigned approvers
    invoice_assigned_approver_repo.delete_all(db, filters={"invoice_id": invoice_id})
    
    # Store assigned approvers
    assigned_approvers = requirement_data.get("assigned_approvers", [])
    for idx, email_item in enumerate(assigned_approvers):
        # email_item could be a string or a list of strings
        emails = [email_item] if isinstance(email_item, str) else email_item
        for email in emails:
            if email:
                invoice_assigned_approver_repo.create(db, obj_in={
                    "invoice_id": invoice_id,
                    "approver_email": email,
                    "sequence_order": idx + 1
                })
    import json
    
    # Update requirement breakdown if we want to persist it (using JSON field)
    invoice.approver_breakdown = json.dumps(requirement_data.get("breakdown", {}))
    
    # 5. Add to Status History
    history_data = {
        "invoice_id": invoice_id,
        "status": InvoiceStatus.WAITING_APPROVAL,
        "user": current_user.username,
        "timestamp": datetime.utcnow(),
        "comment": "Sent to approval"
    }
    invoice_status_history_repo.create(db, obj_in=history_data)

    # 6. Workflow Steps
    # Check if we need to insert "Coding Completed" step
    # We define cycle start
    last_cycle_start = datetime(1753, 1, 1)
    histories = invoice_status_history_repo.get_multi(
        db, 
        filters={"invoice_id": invoice_id}, 
        order_by="timestamp", 
        descending=True
    )
    for h in histories:
        if h.status in [InvoiceStatus.REWORKED, InvoiceStatus.WAITING_CODING]:
            last_cycle_start = h.timestamp
            break
            
    existing_coding_step_list = workflow_step_repo.get_multi(
        db,
        filters={
            "invoice_id": invoice_id,
            "step_type": WorkflowStepType.CODING
        },
        expressions=[WorkflowStep.timestamp > last_cycle_start],
        limit=1
    )
    existing_coding_step = existing_coding_step_list[0] if existing_coding_step_list else None

    if not existing_coding_step:
        workflow_step_repo.create(db, obj_in={
            "invoice_id": invoice_id,
            "step_name": "Coding",
            "step_type": WorkflowStepType.CODING,
            "user": current_user.username,
            "status": WorkflowStepStatus.COMPLETED,
            "timestamp": datetime.utcnow(),
            "entity": entity
        })

    # Add "Waiting for Approval" step
    workflow_step_repo.create(db, obj_in={
        "invoice_id": invoice_id,
        "step_name": "Waiting for Approval",
        "step_type": WorkflowStepType.WAITING_APPROVAL,
        "user": current_user.username,
        "status": WorkflowStepStatus.PENDING,
        "timestamp": datetime.utcnow(),
        "entity": entity
    })
    
    invoice_repo.update(db, db_obj=invoice, obj_in={
        "status": InvoiceStatus.WAITING_APPROVAL,
        "current_approver_level": 1,
        "required_approvers": requirement_data["required"],
        "approver_breakdown": json.dumps(requirement_data.get("breakdown", {}))
    })

    # 7. TRIGGER FIRST APPROVAL EMAIL
    if assigned_approvers:
        first_level_approvers = assigned_approvers[0]
        # emails could be a string or a list of strings
        emails = [first_level_approvers] if isinstance(first_level_approvers, str) else first_level_approvers
        
        for approver_email in emails:
            if not approver_email: continue
            
            # Get approver's name
            approver_user_list = user_repo.get_multi(db, filters={"email": approver_email}, limit=1)
            approver_user = approver_user_list[0] if approver_user_list else None
            approver_name = approver_user.username if approver_user else "Approver"
            
            # Prioritize invoice number from extracted_data
            extracted_data_json = {}
            if invoice.extracted_data:
                try:
                    extracted_data_json = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
                except: pass
                
            inv_number = extracted_data_json.get("invoice_details", {}).get("invoice_number", {}).get("value")
            if not inv_number:
                inv_number = invoice.invoice_number

            email_service.send_approval_request_email(
                email=approver_email,
                username=approver_name,
                vendor_name=vendor_name or "Unknown",
                invoice_number=inv_number or "N/A",
                amount=str(total_amount),
                currency=currency
            )



    # [AUDIT]
    await audit_service.log_action(db, invoice_id, AuditAction.SENT_TO_APPROVAL, current_user.username, entity,
                                   details={"approvers_required": requirement_data["required"]})

    return {"message": "Invoice sent to approval successfully"}

