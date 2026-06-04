from pydantic import EmailStr
from fastapi import APIRouter, HTTPException, Depends, status, BackgroundTasks
from datetime import datetime
from typing import List, Dict, Any, Optional 
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from app.database.database import get_db
from app.models.db_models import User as DBUser
from app.repository.repositories import user_repo
from app.auth.jwt import get_current_user
from app.utils.settings import get_app_settings
from app.models.user import UserResponse, UserPaginatedResponse
from pydantic import BaseModel

router = APIRouter()

class UserRoleUpdate(BaseModel):
    role: str
    status: str
    department: Optional[str] = None

# Helper to check if user is admin or super admin
def get_current_admin(current_user: UserResponse = Depends(get_current_user)):
    user_roles = [r.strip().lower() for r in (current_user.role or "").split(",")]
    if not any(r in ("admin", "super admin") for r in user_roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user
 
class UserCreate(BaseModel):
    username: str
    email: str
    password: Optional[str] = None
    role: str
    status: str
    department: Optional[str] = None

from app.utils.date_utils import get_ist_now

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
    
    from app.auth.jwt import get_password_hash
    password_to_hash = user_data.password if user_data.password else "Apex2026"
    hashed_password = get_password_hash(password_to_hash)

    new_user_data = {
        "username": user_data.username,
        "email": user_data.email,
        "password": hashed_password,
        "role": user_data.role,
        "status": user_data.status,
        "department": user_data.department,
        "isCreatedByUser": False,
        "createdby": "admin",
        "ispasswordchange": False,
        "created_at": get_ist_now()
    }
    new_user = user_repo.create(db, obj_in=new_user_data)
    return new_user

@router.get("/", response_model=UserPaginatedResponse)
async def get_all_users(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_admin),
    skip: int = 0,
    limit: int = 15,
    search: str = None,
    sort_by: str = "id",
    sort_dir: str = "desc"
):
    """Get All Users (Admin only) with pagination and search."""
    search_fields = ["username", "email", "role", "status"]
    
    paginated_res = user_repo.get_paginated(
        db,
        skip=skip,
        limit=limit,
        search=search,
        search_fields=search_fields,
        order_by=sort_by,
        descending=(sort_dir.lower() == 'desc')
    )
    
    # Calculate sequential SNO for each user (rank based on ID)
    final_data = []
    for user in paginated_res["data"]:
        sno_count = db.query(func.count(DBUser.id)).filter(DBUser.id <= user.id).scalar()
        
        # Manually construct the response dict to ensure sno is included
        user_data = {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "status": user.status,
            "department": user.department,
            "isCreatedByUser": user.isCreatedByUser,
            "createdby": user.createdby,
            "ispasswordchange": user.ispasswordchange,
            "email_notifications": user.email_notifications,
            "created_at": user.created_at,
            "sno": sno_count
        }
        final_data.append(user_data)
    
    paginated_res["data"] = final_data
    return paginated_res


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

    # Validate role(s)
    roles_to_validate = [r.strip() for r in update_data.role.split(',')]
    for r in roles_to_validate:
        if r not in allowed_roles:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid role: {r}"
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
        "status": update_data.status,
        "department": update_data.department
    })

    # If user is approved (status changed to active), send notification
    if old_status != "active" and user.status == "active":
        from app.services.email_service import email_service
        background_tasks.add_task(email_service.send_approval_notification, user.email, user.username, user.role)

    return user
