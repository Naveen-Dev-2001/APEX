from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional, Union, List
from datetime import datetime

class User(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = "user"  # admin, coder, approver, user
    status: str = "pending"  # pending, active, rejected
    department: Optional[str] = None
    email_notifications: bool = True
    created_at: Optional[datetime] = None

class UserInDB(User):
    id: Union[str, int]

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: Union[str, int]
    username: str
    email: str
    role: str
    status: str 
    department: Optional[str] = None
    isCreatedByUser: bool = True
    createdby: str = "self"
    ispasswordchange: bool = True
    email_notifications: bool = True
    created_at: datetime
    sno: Optional[int] = None

class UserPaginatedResponse(BaseModel):
    data: List[UserResponse]
    total: int
    page: int
    page_size: int
