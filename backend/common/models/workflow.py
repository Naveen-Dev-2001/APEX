from pydantic import BaseModel
from typing import Optional, Any, List
from datetime import datetime
from enum import Enum


class WorkflowStepType(str, Enum):
    PROCESSED = "processed"
    CODING = "coding"
    WAITING_APPROVAL = "waiting_approval"
    APPROVER_1 = "approver_1"
    APPROVER_2 = "approver_2"
    APPROVER_3 = "approver_3"
    APPROVER_4 = "approver_4"
    SAGE_POSTED = "sage_posted"


class WorkflowStepStatus(str, Enum):
    COMPLETED = "completed"
    APPROVED = "approved"
    REJECTED = "rejected"
    PENDING = "pending"
    REWORKED = "reworked"
    POSTED = "posted"
    POST_FAILED = "post_failed"
    EDITING_ENABLED = "editing_enabled"


class WorkflowStepBase(BaseModel):
    invoice_id: str
    step_name: str
    step_type: str          # plain str — accepts any value from workflow_actions.py
    user: Optional[str] = None
    status: str             # plain str — don't restrict with enum
    approver_number: Optional[int] = None
    comment: Optional[str] = None


class WorkflowStepCreate(WorkflowStepBase):
    pass


class WorkflowStep(WorkflowStepBase):
    id: str
    timestamp: datetime

    class Config:
        from_attributes = True


class WorkflowStepResponse(WorkflowStep):
    pass


class WorkflowHistoryResponse(BaseModel):
    invoice_id: str
    vendor_name: Optional[str] = None
    required_approvers: int
    assigned_approvers: Optional[List[Any]] = None
    current_approver_level: Optional[int] = 1
    current_status: Optional[str] = None
    approver_breakdown: Optional[dict] = None
    delegations: Optional[dict[str, List[str]]] = None
    user_names: Optional[dict[str, str]] = None
    workflow_type: Optional[str] = None
    steps: List[WorkflowStepResponse] = []  # ← was `str`, must be a list
