import os
import sys
import json
import socket
from dotenv import load_dotenv

# Define paths
ROOT_DIR = os.getcwd()
BACKEND_DIR = os.path.join(ROOT_DIR, 'backend')
ENV_PATH = os.path.join(BACKEND_DIR, '.env')

if os.path.exists(ENV_PATH):
    load_dotenv(ENV_PATH)

sys.path.append(BACKEND_DIR)

from app.database.database import SessionLocal
from app.models.db_models import GlobalSetting

def migrate_navigation():
    print("Connecting to database (with 10s timeout)...")
    socket.setdefaulttimeout(10)
    
    try:
        db = SessionLocal()
        setting = db.query(GlobalSetting).filter(GlobalSetting.setting_key == "app_settings").first()
        if not setting:
            print("No settings found in database. Defaults will be used.")
            return

        settings_data = json.loads(setting.setting_value) if isinstance(setting.setting_value, str) else setting.setting_value
        navigation = settings_data.get('navigation', [])
        
        updated = False
        new_navigation = []
        found_invoice = False
        
        for nav in navigation:
            label = nav.get('label')
            if label == 'Invoice':
                print(f"Updating '{label}' -> 'Invoices'")
                nav['label'] = 'Invoices'
                nav['path'] = '/invoices'
                updated = True
                found_invoice = True
                new_navigation.append(nav)
            elif label == 'Invoices':
                print("'Invoices' already exists.")
                if nav.get('path') != '/invoices':
                    nav['path'] = '/invoices'
                    updated = True
                found_invoice = True
                new_navigation.append(nav)
            elif label in ['Coding', 'Approvals']:
                print(f"Removing '{label}'")
                updated = True
            else:
                new_navigation.append(nav)
        
        if not found_invoice:
            print("Adding 'Invoices'")
            new_navigation.insert(1, {"label": "Invoices", "path": "/invoices", "roles": ["all"]})
            updated = True
            
        if updated:
            settings_data['navigation'] = new_navigation
            setting.setting_value = json.dumps(settings_data)
            db.commit()
            print("Successfully updated database.")
        else:
            print("No updates needed.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'db' in locals(): db.close()

if __name__ == "__main__":
    migrate_navigation()
