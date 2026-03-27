import os
import sys
import json
from dotenv import load_dotenv

# Define paths
ROOT_DIR = os.getcwd()
BACKEND_DIR = os.path.join(ROOT_DIR, 'backend')
ENV_PATH = os.path.join(BACKEND_DIR, '.env')

# Load environment variables from backend/.env
if os.path.exists(ENV_PATH):
    print(f"Loading .env from {ENV_PATH}")
    load_dotenv(ENV_PATH)
else:
    print(f".env not found at {ENV_PATH}")

# Add backend to path
sys.path.append(BACKEND_DIR)

try:
    from app.database.database import SessionLocal
    from app.models.db_models import GlobalSetting
    print("Successfully imported database modules")
except ImportError as e:
    print(f"Import error: {e}")
    sys.exit(1)

def check_settings():
    print("Connecting to database...")
    try:
        db = SessionLocal()
        setting = db.query(GlobalSetting).filter(GlobalSetting.setting_key == "app_settings").first()
        if not setting:
            print("No settings found in database (will use DEFAULT_SETTINGS in app).")
            return
        
        print("Settings found in database:")
        settings_data = json.loads(setting.setting_value) if isinstance(setting.setting_value, str) else setting.setting_value
        print(json.dumps(settings_data, indent=2))
        
        navigation = settings_data.get('navigation', [])
        labels = [nav.get('label') for nav in navigation]
        print("\nCurrent Navigation Labels in DB:", labels)
        
    except Exception as e:
        print(f"Error checking settings: {e}")
    finally:
        if 'db' in locals():
            db.close()

if __name__ == "__main__":
    check_settings()
