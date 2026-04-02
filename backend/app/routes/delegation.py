from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime

from app.database.database import get_db
from app.models.db_models import Delegation as DBDelegation
from app.repository.repositories import delegation_repo
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from app.models.delegation import DelegationCreate, DelegationResponse

router = APIRouter()

@router.post("/", response_model=DelegationResponse)
async def create_delegation(
    delegation: DelegationCreate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    # Validation
    if delegation.original_approver.lower() == delegation.substitute_approver.lower():
        raise HTTPException(400, "Original approver and substitute approver cannot be the same.")
    
    if current_user.role != "admin" and current_user.email.lower() != delegation.original_approver.lower():
        raise HTTPException(403, "You do not have permission to delegate this user's approvals.")

    # Overlap validation: s1 <= e2 AND e1 >= s2
    overlap_list = delegation_repo.get_multi(
        db,
        filters={
            "original_approver": delegation.original_approver.lower(),
            "entity": entity
        },
        expressions=[
            DBDelegation.start_date <= delegation.end_date,
            DBDelegation.end_date >= delegation.start_date
        ],
        limit=1
    )
    existing_overlap = overlap_list[0] if overlap_list else None
    
    if existing_overlap:
        raise HTTPException(
            status_code=400, 
            detail=f"An active or scheduled delegation already exists for this approver in the selected period ({existing_overlap.start_date} to {existing_overlap.end_date})."
        )

    new_del_data = {
        "delegator_email": delegation.original_approver.lower(),
        "substitute_email": delegation.substitute_approver.lower(),
        "is_active": True,
        "original_approver": delegation.original_approver.lower(),
        "substitute_approver": delegation.substitute_approver.lower(),
        "start_date": delegation.start_date,
        "end_date": delegation.end_date,
        "entity": entity,
        "created_at": datetime.utcnow(),
        "created_by": current_user.email
    }
    new_del = delegation_repo.create(db, obj_in=new_del_data)
    
    return DelegationResponse(
        id=new_del.id,
        original_approver=new_del.original_approver,
        substitute_approver=new_del.substitute_approver,
        start_date=new_del.start_date,
        end_date=new_del.end_date,
        entity=new_del.entity,
        created_at=new_del.created_at,
        created_by=new_del.created_by
    )

@router.get("/", response_model=List[DelegationResponse])
async def get_delegations(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    delegations = delegation_repo.get_multi(
        db, 
        filters={"entity": entity},
        order_by="created_at",
        descending=True,
        limit=1000
    )
    return delegations

@router.delete("/{delegation_id}")
async def delete_delegation(
    delegation_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    delegation = delegation_repo.get(db, delegation_id)
    if not delegation:
        raise HTTPException(404, "Delegation not found")
    
    print(f"DEBUG REVERT: User={current_user.email} Role={current_user.role} CreatedBy={delegation.created_by} Orig={delegation.original_approver}")

    if current_user.role != "admin" and \
       current_user.email.lower() != (delegation.created_by or "").lower() and \
       current_user.email.lower() != (delegation.original_approver or "").lower():
        raise HTTPException(403, "You do not have permission to revert this delegation.")
        
    delegation_repo.remove(db, id=delegation_id)
    return {"message": "Delegation reverted successfully"}
