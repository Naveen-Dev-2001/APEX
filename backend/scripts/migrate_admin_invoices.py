import os
import sys
import json
from dotenv import load_dotenv

# Define paths
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT_DIR, '.env')

if os.path.exists(ENV_PATH):
    load_dotenv(ENV_PATH)

sys.path.append(ROOT_DIR)

try:
    from app.database.database import SessionLocal
    from app.models.db_models import GlobalSetting
except ImportError:
    # If standard imports fail, try adding one more level up
    sys.path.append(os.path.dirname(ROOT_DIR))
    from app.database.database import SessionLocal
    from app.models.db_models import GlobalSetting

def migrate_navigation():
    print("Connecting to database...")
    
    try:
        db = SessionLocal()
        setting = db.query(GlobalSetting).filter(GlobalSetting.setting_key == "app_settings").first()
        if not setting:
            print("No settings found in database. Defaults will be used.")
            return

        # Parse JSON value
        settings_data = json.loads(setting.setting_value) if isinstance(setting.setting_value, str) else setting.setting_value
        navigation = settings_data.get('navigation', [])
        
        updated = False
        new_navigation = []
        found_invoices = False
        
        for nav in navigation:
            label = nav.get('label')
            
            # 1. Rename 'Invoice' to 'Invoices'
            if label == 'Invoice':
                print(f"Updating '{label}' -> 'Invoices'")
                nav['label'] = 'Invoices'
                nav['path'] = '/invoices'
                label = 'Invoices' # Update local label for next checks
                updated = True
            
            if label == 'Invoices':
                # 2. Ensure 'admin' is in roles
                roles = nav.get('roles', [])
                if 'admin' not in roles and 'all' not in roles:
                    print("Adding 'admin' role to 'Invoices'")
                    roles.append('admin')
                    nav['roles'] = roles
                    updated = True
                
                # Check for path consistency
                if nav.get('path') != '/invoices':
                    nav['path'] = '/invoices'
                    updated = True
                
                found_invoices = True
                new_navigation.append(nav)
            else:
                new_navigation.append(nav)
        
        # 3. Handle case where 'Invoices' was missing entirely
        if not found_invoices:
            print("Adding missing 'Invoices' navigation entry")
            new_navigation.insert(1, {"label": "Invoices", "path": "/invoices", "roles": ["coder", "admin"]})
            updated = True
            
        if updated:
            # Deduplicate just in case
            seen_labels = set()
            dedup_nav = []
            for item in new_navigation:
                if item['label'] not in seen_labels:
                    dedup_nav.append(item)
                    seen_labels.add(item['label'])
                else:
                    # Merge roles if duplicate label found (unlikely but safe)
                    existing = next(i for i in dedup_nav if i['label'] == item['label'])
                    for r in item.get('roles', []):
                        if r not in existing['roles']:
                            existing['roles'].append(r)
                    print(f"Merged duplicate label: {item['label']}")

            settings_data['navigation'] = dedup_nav
            setting.setting_value = json.dumps(settings_data)
            db.commit()
            print("Successfully updated database settings.")
        else:
            print("No updates needed in database.")
            
    except Exception as e:
        print(f"Error during migration: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if 'db' in locals(): db.close()

if __name__ == "__main__":
    migrate_navigation()
