import json
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, EmailStr, field_validator


class CodificationWorkflow(BaseModel):
    lob: str
    department_id: str
    approver_count: int = 1

    mandatory_approver_1: Optional[List[EmailStr]] = None
    mandatory_approver_2: Optional[List[EmailStr]] = None
    mandatory_approver_3: Optional[List[EmailStr]] = None
    mandatory_approver_4: Optional[List[EmailStr]] = None
    mandatory_approver_5: Optional[List[EmailStr]] = None

    is_threshold_enabled: bool = False
    amount_threshold: Optional[float] = None
    threshold_approver: Optional[List[EmailStr]] = None

    posting_approver: Optional[EmailStr] = None
    approver_flags: Optional[dict] = None

    @field_validator(
        'mandatory_approver_1', 'mandatory_approver_2', 'mandatory_approver_3',
        'mandatory_approver_4', 'mandatory_approver_5', 'threshold_approver',
        mode='before'
    )
    @classmethod
    def parse_list_field(cls, v):
        """Accept list or JSON string; normalize to list or None."""
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except json.JSONDecodeError:
                v = [x.strip() for x in v.split(',') if x.strip()]
        if isinstance(v, list):
            v = [x for x in v if x and str(x).strip()]
            return v if v else None
        return v


class CodificationWorkflowInDB(CodificationWorkflow):
    id: int


class CodificationWorkflowResponse(BaseModel):
    id: int
    lob: Optional[str] = None
    department_id: Optional[str] = None
    approver_count: int

    mandatory_approver_1: Optional[List[str]] = None
    mandatory_approver_2: Optional[List[str]] = None
    mandatory_approver_3: Optional[List[str]] = None
    mandatory_approver_4: Optional[List[str]] = None
    mandatory_approver_5: Optional[List[str]] = None

    is_threshold_enabled: bool
    amount_threshold: Optional[float] = None
    threshold_approver: Optional[List[str]] = None

    posting_approver: Optional[str] = None
    entity: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    approver_flags: Optional[dict] = None

    @field_validator(
        'mandatory_approver_1', 'mandatory_approver_2', 'mandatory_approver_3',
        'mandatory_approver_4', 'mandatory_approver_5', 'threshold_approver',
        mode='before'
    )
    @classmethod
    def parse_json_string(cls, v):
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [x for x in parsed if x and str(x).strip()] or None
                return None
            except json.JSONDecodeError:
                result = [x.strip() for x in v.split(',') if x.strip()]
                return result if result else None
        if isinstance(v, list):
            cleaned = [x for x in v if x and str(x).strip()]
            return cleaned if cleaned else None
        return v

    # ── ADD THIS ──
    @field_validator('approver_flags', mode='before')
    @classmethod
    def parse_approver_flags(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return {}
        return v

    class Config:
        from_attributes = True
