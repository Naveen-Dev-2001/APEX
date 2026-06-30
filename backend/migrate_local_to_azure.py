import os
import shutil
from pathlib import Path
from dotenv import load_dotenv

# Explicitly load .env from parent directory
env_path = Path(__file__).resolve().parent / '.env'
load_dotenv(dotenv_path=env_path, override=True)

from app.services.azure_blob import container_client, upload_file_to_blob
from app.database.database import SessionLocal
from sqlalchemy import text

UPLOAD_DIR = Path("uploads")

# Map of local folder candidates to target Azure prefixes and DB path folders
MAPPING = {
    "in_progress": {
        "local_folders": ["in_progress_files"],
        "azure_prefix": "in_progress_files",
        "db_folder": "in_progress_files"
    },
    "posted_stage": {
        "local_folders": ["posted_stage_files", "posted_to_sage_files"],
        "azure_prefix": "posted_to_sage_files",
        "db_folder": "posted_to_sage_files"
    },
    "deleted": {
        "local_folders": ["deleted_files"],
        "azure_prefix": "deleted_files",
        "db_folder": "deleted_files"
    },
    "archive": {
        "local_folders": ["archive_files", "archived_files"],
        "azure_prefix": "archived_files",
        "db_folder": "archived_files"
    }
}

def migrate():
    db = SessionLocal()
    try:
        for category, info in MAPPING.items():
            print(f"\n--- Migrating category: {category} ---")
            azure_prefix = info["azure_prefix"]
            db_folder = info["db_folder"]
            
            for local_folder in info["local_folders"]:
                folder_path = UPLOAD_DIR / local_folder
                if not folder_path.exists():
                    print(f"Local folder {folder_path} does not exist. Skipping.")
                    continue
                
                # List files in the local folder
                files = [f for f in folder_path.iterdir() if f.is_file()]
                print(f"Found {len(files)} file(s) in local folder {folder_path}")
                
                for local_file in files:
                    filename = local_file.name
                    target_blob = f"{azure_prefix}/{filename}"
                    print(f"Uploading {local_file} to Azure Blob: {target_blob}...")
                    
                    try:
                        # Upload to Azure
                        upload_file_to_blob(str(local_file), target_blob)
                        print(f"Successfully uploaded {filename} to Azure Blob.")
                        
                        # Delete local file
                        local_file.unlink()
                        print(f"Removed local file: {local_file}")
                        
                        # Update DB records for this filename if file_path needs updating
                        standard_relative_path = f"uploads/{db_folder}/{filename}"
                        
                        # Find any records with this filename
                        query = text("""
                            SELECT id, file_path 
                            FROM invoices 
                            WHERE filename = :filename
                        """)
                        records = db.execute(query, {"filename": filename}).fetchall()
                        for r_id, current_path in records:
                            normalized_current = current_path.replace("\\", "/")
                            normalized_target = standard_relative_path.replace("\\", "/")
                            if normalized_current != normalized_target:
                                print(f"Updating DB record ID {r_id}: {current_path} -> {standard_relative_path}")
                                update_query = text("""
                                    UPDATE invoices 
                                    SET file_path = :new_path 
                                    WHERE id = :id
                                """)
                                db.execute(update_query, {"new_path": standard_relative_path, "id": r_id})
                                db.commit()
                                
                    except Exception as e:
                        print(f"Error migrating file {filename}: {e}")
                        db.rollback()
                        
    finally:
        db.close()
        print("\nMigration finished!")

if __name__ == "__main__":
    migrate()
