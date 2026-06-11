from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

class AuditAction(str, Enum):
    UPLOADED = "Invoice Uploaded"
    UPDATED = "Invoice Updated"
    STATUS_CHANGE = "Status Changed"
    CODING_SAVED = "Coding Saved"
    SENT_FOR_CODING = "Sent for Coding"
    SENT_TO_APPROVAL = "Sent for Approval"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    REWORKED = "Reworked"
    RECALLED = "Recalled"
    COMMENT_ADDED = "Comment Added"
    SAGE_POSTED = "Sage Posted"
    SAGE_POST_FAILED = "Sage Post Failed"
    SAGE_REPOSTED = "Sage Reposted"
    SAGE_REPOST_FAILED = "Sage Repost Failed"
    ARCHIVED = "Archived"
    DELETED = "Deleted"
    DELEGATED = "Delegated"

class AuditLogCreate(BaseModel):
    invoice_id: str
    action: str
    user: str
    entity: str
    details: Optional[Dict[str, Any]] = None
    timestamp: Optional[datetime] = None

class AuditLogResponse(AuditLogCreate):
    id: str
    timestamp: datetime
