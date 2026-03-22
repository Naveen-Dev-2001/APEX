import os
import sys

# Add the project root to the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database.database import SessionLocal
from app.models.db_models import User

def fix_admin_email():
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == "admin@example.com").first()
        if admin:
            admin.email = "AppDevNotification@LoanDNA.com"
            db.commit()
            print("Admin email successfully updated from admin@example.com to AppDevNotification@LoanDNA.com")
        else:
            print("Admin email admin@example.com not found in the database. It might have already been updated.")
    except Exception as e:
        print(f"Error updating admin email: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    fix_admin_email()
