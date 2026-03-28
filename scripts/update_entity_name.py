import sys
import os

# Add the backend directory to the sys.path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.database.database import SessionLocal
from app.models.db_models import EntityMaster

def update_entity_name():
    db = SessionLocal()
    try:
        # Find the default entity
        entity = db.query(EntityMaster).filter(EntityMaster.entity_id == 'DEFAULT').first()
        if entity:
            if entity.entity_name == 'Default Entity':
                print(f"Updating entity name from '{entity.entity_name}' to 'Top Level'")
                entity.entity_name = 'Top Level'
                db.commit()
                print("✓ Entity name updated successfully")
            else:
                print(f"Entity name is already '{entity.entity_name}', no update needed.")
        else:
            print("Default entity with ID 'DEFAULT' not found.")
    except Exception as e:
        print(f"✗ Error updating entity name: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    update_entity_name()
