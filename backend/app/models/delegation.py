from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.models.db_models import Delegation as DBDelegation
from app.repository.repositories import delegation_repo

class DelegationBase(BaseModel):
    original_approver: str = Field(..., description="Email of the original approver")
    substitute_approver: str = Field(..., description="Email of the substitute approver")
    start_date: date = Field(..., description="Start date of the delegation")
    end_date: date = Field(..., description="End date of the delegation")
    entity: Optional[str] = Field(None, description="Entity to which this delegation applies")

class DelegationCreate(DelegationBase):
    pass

class DelegationResponse(DelegationBase):
    id: int
    created_at: datetime
    created_by: str

    class Config:
        from_attributes = True

def check_active_delegation(db: Session, original_approver_email: str, entity: str) -> List[str]:
    """
    Checks if there is an active delegation for the given original approver.
    Returns the list of substitute approver emails if active.
    """
    today = datetime.utcnow().date()

    delegations = delegation_repo.get_multi(
        db,
        filters={
            "original_approver": original_approver_email.lower(),
            "entity": entity
        },
        expressions=[
            DBDelegation.start_date <= today,
            DBDelegation.end_date >= today
        ],
        limit=100
    )
    
    return [d.substitute_approver.lower() for d in delegations]
