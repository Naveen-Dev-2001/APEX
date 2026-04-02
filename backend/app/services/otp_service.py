import random
import string
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.db_models import OTPRecord
from app.repository.repositories import otp_repo
from app.config.settings import settings
import logging

logger = logging.getLogger("app")

class OTPService:
    @staticmethod
    def generate_otp(length: int = 6) -> str:
        """Generate a numeric OTP string."""
        return ''.join(random.choices(string.digits, k=length))

    @staticmethod
    def create_otp_record(db: Session, email: str, purpose: str) -> str:
        """Create a new OTP record in the database and return the OTP code."""
        # Deactivate any previous codes for the same email and purpose
        otp_repo.delete_all(db, filters={
            "email": email,
            "purpose": purpose,
            "is_verified": False
        })
        
        otp_code = OTPService.generate_otp()
        expires_at = datetime.utcnow() + timedelta(minutes=settings.OTP_EXPIRY_MINUTES)
        
        db_otp = OTPRecord(
            email=email,
            otp_code=otp_code,
            purpose=purpose,
            expires_at=expires_at
        )
        otp_repo.create(db, obj_in=db_otp)
        return otp_code

    @staticmethod
    def verify_otp(db: Session, email: str, otp_code: str, purpose: str) -> bool:
        # Verify an OTP code.
        otps = otp_repo.get_multi(
            db,
            filters={
                "email": email,
                "otp_code": otp_code,
                "purpose": purpose,
                "is_verified": False
            },
            limit=1
        )
        db_otp = otps[0] if otps and otps[0].expires_at > datetime.utcnow() else None

        if not db_otp:
            # Increment attempts for the record if found by code or just email/purpose
            db_otp_any = db.query(OTPRecord).filter(
                OTPRecord.email == email,
                OTPRecord.purpose == purpose,
                OTPRecord.is_verified == False
            ).order_by(OTPRecord.created_at.desc()).first()
            
            if db_otp_any:
                otp_repo.update(db, db_obj=db_otp_any, obj_in={"attempts": db_otp_any.attempts + 1})
                # Check if max retries exceeded (e.g., 5)
                if db_otp_any.attempts >= 5:
                    otp_repo.remove(db, id=db_otp_any.id)
            return False

        otp_repo.update(db, db_obj=db_otp, obj_in={"is_verified": True})
        return True

    @staticmethod
    def is_verified(db: Session, email: str, purpose: str) -> bool:
        """Check if an email has recently verified an OTP for a specific purpose."""
        # Check for a verified record that isn't too old (e.g., verified in last 15 mins)
        cutoff = datetime.utcnow() - timedelta(minutes=15)
        # Using a direct query because the filter has a range (> cutoff) which get_multi doesn't handle yet
        # But we use the repository's model for consistency
        return db.query(otp_repo.model).filter(
            otp_repo.model.email == email,
            otp_repo.model.purpose == purpose,
            otp_repo.model.is_verified == True,
            otp_repo.model.created_at > cutoff
        ).first() is not None

otp_service = OTPService()
