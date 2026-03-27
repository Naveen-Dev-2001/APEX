from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.models.db_models import GlobalSetting, User
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
        user_in_use = db.query(User).filter(User.status == status).first()
        if user_in_use:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot delete status '{status}' because it is explicitly assigned to one or more users."
            )

    # Check if any removed role is currently assigned to users
    old_roles = current_settings.get("roles", [])
    new_roles = payload.get("roles", [])
    removed_roles = [r for r in old_roles if r not in new_roles]
    for role in removed_roles:
        user_in_use_role = db.query(User).filter(User.role == role).first()
        if user_in_use_role:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot delete role '{role}' because it is explicitly assigned to one or more users."
            )

    # Find or create the settings record
    setting = db.query(GlobalSetting).filter(GlobalSetting.setting_key == "app_settings").first()
    
    if setting:
        # Update existing
        setting.setting_value = json.dumps(payload)
    else:
        # Create new
        setting = GlobalSetting(
            setting_key="app_settings",
            setting_value=json.dumps(payload)
        )
        db.add(setting)
    
    db.commit()

    return {"message": "Settings updated"}
