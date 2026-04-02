from typing import Optional, List, Union
from datetime import datetime
from pydantic import BaseModel, EmailStr, field_validator


class CodificationWorkflow(BaseModel):
    lob: str  # Line of Business
    department_id: str
    mandatory_approver_1: Optional[Union[EmailStr, List[EmailStr]]] = None
    mandatory_approver_2: Optional[Union[EmailStr, List[EmailStr]]] = None
    mandatory_approver_3: Optional[Union[EmailStr, List[EmailStr]]] = None
    mandatory_approver_4: Optional[Union[EmailStr, List[EmailStr]]] = None
    mandatory_approver_5: Optional[Union[EmailStr, List[EmailStr]]] = None
    threshold_approver: Optional[Union[EmailStr, List[EmailStr]]] = None
    optional_approver: Optional[Union[EmailStr, List[EmailStr]]] = None
    amount_threshold: Optional[float] = None
    approver_count: int = 1
    is_parallel: bool = False

    entity: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @field_validator(
        'mandatory_approver_1', 'mandatory_approver_2', 'mandatory_approver_3', 
        'mandatory_approver_4', 'mandatory_approver_5',
        'threshold_approver', 'optional_approver', 
        mode='before'
    )
    @classmethod
    def empty_to_none(cls, v):
        if v == "":
            return None
        return v


class CodificationWorkflowInDB(CodificationWorkflow):
    id: str

class CodificationWorkflowResponse(BaseModel):
    id: int
    lob: str
    department_id: str
    mandatory_approver_1: Optional[Union[str, List[str]]] = None
    mandatory_approver_2: Optional[Union[str, List[str]]] = None
    mandatory_approver_3: Optional[Union[str, List[str]]] = None
    mandatory_approver_4: Optional[Union[str, List[str]]] = None
    mandatory_approver_5: Optional[Union[str, List[str]]] = None
    threshold_approver: Optional[Union[str, List[str]]] = None
    optional_approver: Optional[Union[str, List[str]]] = None
    amount_threshold: Optional[float] = None
    approver_count: int
    is_parallel: bool = False

    entity: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
