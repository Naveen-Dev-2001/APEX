import sys
import os
from datetime import datetime

# Add the parent directory to sys.path to allow importing from 'app'
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database.database import SessionLocal
from app.models.db_models import User
from app.auth.jwt import get_password_hash


def seed_users():
    db = SessionLocal()
    try:
        roles = ["admin", "coder", "approver"]
        count_per_role = 5
        common_password_hash = get_password_hash("Lokesh@2001")

        print("Seeding users...")

        for role in roles:
            print(f"Creating {count_per_role} {role}s...")

            for i in range(1, count_per_role + 1):
                username = f"{role}_{i}"
                email = f"{username}@gmail.com"

                # Check if user already exists
                existing_user = db.query(User).filter(User.email == email).first()
                if existing_user:
                    print(f"User {email} already exists, skipping...")
                    continue

                new_user = User(
                    username=username,
                    email=email,
                    password=common_password_hash,
                    role=role,
                    status="active",
                    created_at=datetime.utcnow()
                )

                db.add(new_user)

        db.commit()
        print("✓ Successfully seeded users.")
        print("Common password for all users: Lokesh@2001")

    except Exception as e:
        print(f"Error seeding users: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    seed_users()