import sys
import os
import json
import asyncio
from sqlalchemy.orm import Session
from fastapi import HTTPException
from pathlib import Path
from dotenv import load_dotenv

# Set up paths
backend_path = Path("C:/Users/LDNA40022/Lokesh/APEX/backend")
sys.path.append(str(backend_path))

# Load .env
load_dotenv(dotenv_path=backend_path / '.env')

from app.database.database import SessionLocal
from app.models.db_models import GlobalSetting, User
from app.routes.settings import update_settings

async def test_status_deletion():
    print("Starting test_status_deletion...")
    try:
        print("Creating DB session...")
        db = SessionLocal()
        print("DB session created.")
    except Exception as e:
        print(f"Failed to create DB session: {e}")
        return False
    
    try:
        print("Querying GlobalSetting...")
        # 1. Setup: Ensure we have a GlobalSetting record
        setting = db.query(GlobalSetting).filter(GlobalSetting.setting_key == "app_settings").first()
        if not setting:
            initial_data = {"roles": ["admin", "coder"], "statuses": ["active", "pending"], "navigation": []}
            setting = GlobalSetting(setting_key="app_settings", setting_value=json.dumps(initial_data))
            db.add(setting)
            db.commit()
            print("Created initial app_settings.")
        
        settings_data = json.loads(setting.setting_value)
        if "statuses" not in settings_data:
            settings_data["statuses"] = ["active", "pending"]
            
        test_status = "test_to_delete_v1"
        if test_status not in settings_data["statuses"]:
            settings_data["statuses"].append(test_status)
            setting.setting_value = json.dumps(settings_data)
            db.commit()
            print(f"Added '{test_status}' to settings.")
        
        # 2. Assign the test status to a dummy user
        dummy_username = "deletion_test_user_v1"
        dummy_user = db.query(User).filter(User.username == dummy_username).first()
        if not dummy_user:
            dummy_user = User(
                username=dummy_username, 
                email="test_v1@example.com", 
                password="hashed_password", 
                role="coder", 
                status=test_status
            )
            db.add(dummy_user)
        else:
            dummy_user.status = test_status
        db.commit()
        print(f"Assigned '{test_status}' to user '{dummy_user.username}'.")
        
        # 3. Try to remove the status from settings (Expected to fail)
        new_payload = json.loads(setting.setting_value) # Get fresh Copy
        new_payload["statuses"] = [s for s in new_payload["statuses"] if s != test_status]
        
        print(f"Attempting to remove '{test_status}' from settings while in use...")
        
        class MockUser:
            def __init__(self, role): self.role = role
        
        mock_admin = MockUser("admin")
        
        try:
            await update_settings(new_payload, mock_admin, db)
            print("FAILED: Status was removed even though it was in use!")
            return False
        except HTTPException as e:
            if e.status_code == 400 and f"Cannot delete status '{test_status}'" in e.detail:
                print(f"SUCCESS: Received expected error: {e.detail}")
            else:
                print(f"FAILED: Received unexpected error: {e.status_code} - {e.detail}")
                return False
        
        # 4. Remove status from user and try again (Expected to succeed)
        dummy_user.status = "active"
        db.commit()
        print(f"Changed user status to 'active'.")
        
        print(f"Attempting to remove '{test_status}' from settings while NOT in use...")
        try:
            await update_settings(new_payload, mock_admin, db)
            print("SUCCESS: Status was removed successfully.")
        except HTTPException as e:
            print(f"FAILED: Received unexpected error: {e.status_code} - {e.detail}")
            return False
            
        # Cleanup
        db.delete(dummy_user)
        db.commit()
        print("Cleanup done.")
        return True
        
    except Exception as e:
        print(f"Error during test: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    if asyncio.run(test_status_deletion()):
        print("\nALL TESTS PASSED")
        sys.exit(0)
    else:
        print("\nTESTS FAILED")
        sys.exit(1)
