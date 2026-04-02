from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database.database import SessionLocal
from app.models.db_models import User as DBUser
from app.repository.repositories import user_repo
from app.config.settings import settings
from app.auth.jwt import get_password_hash
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def bootstrap_admin():
    """
    Check if admin user exists, if not create one using env vars. (SQLAlchemy version)
    """
    db = SessionLocal()
    try:
        # Check if admin exists using repository with complex OR expression
        existing_admin_list = user_repo.get_multi(
            db,
            expressions=[
                or_(
                    DBUser.username == settings.ADMIN_USERNAME,
                    DBUser.email == settings.ADMIN_EMAIL
                )
            ],
            limit=1
        )
        existing_admin = existing_admin_list[0] if existing_admin_list else None
        
        if not existing_admin:
            logger.info(f"Admin user not found. Creating default admin: {settings.ADMIN_USERNAME}")
            
            admin_data = {
                "username": settings.ADMIN_USERNAME,
                "email": settings.ADMIN_EMAIL,
                "password": get_password_hash(settings.ADMIN_PASSWORD),
                "role": "admin",
                "status": "active",
                "created_at": datetime.utcnow()
            }
            user_repo.create(db, obj_in=admin_data)
            logger.info(f"Admin user created successfully")
        else:
            if existing_admin.role != "admin":
                logger.info("Updating existing admin user to have admin role")
                user_repo.update(db, db_obj=existing_admin, obj_in={"role": "admin", "status": "active"})
    except Exception as e:
        logger.error(f"Error during admin bootstrap: {e}")
        db.rollback()
    finally:
        db.close()
