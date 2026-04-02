from fastapi import APIRouter, HTTPException, Depends, status, BackgroundTasks
from datetime import datetime
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database.database import get_db
from app.models.db_models import User as DBUser
from app.repository.repositories import user_repo
from app.auth.jwt import get_current_user
from app.utils.settings import get_app_settings
from app.models.user import UserResponse
from pydantic import BaseModel

router = APIRouter()

class UserRoleUpdate(BaseModel):
    role: str
    status: str

# Helper to check if user is admin
def get_current_admin(current_user: UserResponse = Depends(get_current_user)):
    if current_user.role != "admin": 
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user
 
class UserCreate(BaseModel):
    username: str
    email: str
    role: str
    status: str

@router.post("/", response_model=UserResponse)
async def create_new_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_admin)
):
    """Create a new user by Admin"""
    # Check if user already exists
    existing_email_list = user_repo.get_multi(db, filters={"email": user_data.email}, limit=1)
    if existing_email_list:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    existing_username_list = user_repo.get_multi(db, filters={"username": user_data.username}, limit=1)
    if existing_username_list:
        raise HTTPException(status_code=400, detail="Username already taken")

    from app.auth.jwt import get_password_hash
    hashed_password = get_password_hash("Apex2026")

    new_user_data = {
        "username": user_data.username,
        "email": user_data.email,
        "password": hashed_password,
        "role": user_data.role,
        "status": user_data.status,
        "isCreatedByUser": False,
        "createdby": "admin",
        "ispasswordchange": False,
        "created_at": datetime.utcnow()
    }
    new_user = user_repo.create(db, obj_in=new_user_data)
    return new_user

@router.get("/", response_model=List[UserResponse])
async def get_all_users(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_admin)
):
    """Get all users (Admin only)"""
    users = user_repo.get_multi(
        db, 
        order_by="id", 
        descending=True, 
        limit=1000
    )
    return users


@router.put("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: int,
    update_data: UserRoleUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_admin)
):
    #  Load global settings
    settings = get_app_settings(db)

    allowed_roles = settings.get("roles", [])
    allowed_statuses = settings.get("statuses", [])

    # Validate role
    if update_data.role not in allowed_roles:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role: {update_data.role}"
        )

    # Validate status
    if update_data.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {update_data.status}"
        )

    user = user_repo.get(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from removing own admin role
    if current_user.id == user_id:
        raise HTTPException(
            status_code=400,
            detail="admin cannot change the role"
        )


    old_status = user.status
    user_repo.update(db, db_obj=user, obj_in={
        "role": update_data.role,
        "status": update_data.status
    })

    # If user is approved (status changed to active), send notification
    if old_status != "active" and user.status == "active":
        from app.services.email_service import email_service
        background_tasks.add_task(email_service.send_approval_notification, user.email, user.username, user.role)

    return user
