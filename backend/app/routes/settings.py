from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.models.db_models import GlobalSetting, User
from app.repository.repositories import global_setting_repo, user_repo
from app.auth.jwt import get_current_user
from app.utils.settings import get_app_settings
import json

router = APIRouter()

@router.get("/")
async def get_settings(db: Session = Depends(get_db)):
    return get_app_settings(db)


@router.put("/")
async def update_settings(payload: dict, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    # Get current settings to check for removed statuses
    current_settings = get_app_settings(db)
    old_statuses = current_settings.get("statuses", [])
    new_statuses = payload.get("statuses", [])
    
    # Check if any removed status is currently assigned to users
    removed_statuses = [s for s in old_statuses if s not in new_statuses]
    for status in removed_statuses:
        user_in_use_list = user_repo.get_multi(db, filters={"status": status}, limit=1)
        if user_in_use_list:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot delete status '{status}' because it is explicitly assigned to one or more users."
            )

    # Check if any removed role is currently assigned to users
    old_roles = current_settings.get("roles", [])
    new_roles = payload.get("roles", [])
    removed_roles = [r for r in old_roles if r not in new_roles]
    for role in removed_roles:
        user_in_use_role_list = user_repo.get_multi(db, filters={"role": role}, limit=1)
        if user_in_use_role_list:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot delete role '{role}' because it is explicitly assigned to one or more users."
            )

    # Find or create the settings record
    existing_list = global_setting_repo.get_multi(db, filters={"setting_key": "app_settings"}, limit=1)
    setting = existing_list[0] if existing_list else None
    
    if setting:
        # Update existing
        global_setting_repo.update(db, db_obj=setting, obj_in={"setting_value": json.dumps(payload)})
    else:
        # Create new
        new_setting = {
            "setting_key": "app_settings",
            "setting_value": json.dumps(payload)
        }
        global_setting_repo.create(db, obj_in=new_setting)

    return {"message": "Settings updated"}
