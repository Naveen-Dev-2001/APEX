import sys
import os
import glob
from pathlib import Path
from sqlalchemy import create_engine, text

# Explicitly load .env from backend directory
env_path = Path(__file__).resolve().parent / '.env'
from dotenv import load_dotenv
load_dotenv(dotenv_path=env_path, override=True)

from common.services.azure_blob import upload_file_to_blob, get_blob_name_from_path

# Paths
BACKEND_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BACKEND_DIR / "output"

# DB URLs
SAGE_DB_URL = os.getenv("DATABASE_URL")
DEFAULT_TOOL = os.getenv("TOOL", "sage").lower()


def get_all_db_invoices(db_url):
    """Retrieve all invoice numbers from a database URL."""
    if not db_url:
        return set()
    try:
        engine = create_engine(db_url)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT invoice_number FROM invoices"))
            # Return set of normalized invoice numbers
            return {row[0] for row in result if row[0]}
    except Exception as e:
        print(f"Error reading from database ({db_url}): {e}")
        return set()


def sanitize_invoice_number(inv_num: str) -> str:
    """Sanitize invoice number matching the PDF filename pattern."""
    return str(inv_num).replace("/", "_").replace("\\", "_")


def run_migration():
    print("Starting migration of local PDF reports to Azure Blob Storage...")
    
    if not OUTPUT_DIR.exists():
        print(f"Output directory does not exist: {OUTPUT_DIR}")
        return

    # 1. Retrieve invoice numbers from Sage database
    print("Fetching invoice mappings from Sage database...")
    sage_invoices = get_all_db_invoices(SAGE_DB_URL)

    # Map sanitized names to Sage
    sage_sanitized = {sanitize_invoice_number(num): num for num in sage_invoices}

    # Find PDF files in the output directory
    pdf_files = glob.glob(str(OUTPUT_DIR / "*_approval.pdf"))
    if not pdf_files:
        print("No PDF files found in the output directory to migrate.")
        return

    print(f"Found {len(pdf_files)} PDF reports to check.")

    success_count = 0
    fail_count = 0

    for local_path_str in pdf_files:
        local_path = Path(local_path_str)
        filename = local_path.name
        
        # Strip '_approval.pdf' suffix to get the sanitized invoice number
        sanitized_inv_no = filename[:-13]  # Len('_approval.pdf') is 13
        
        # 2. Determine target tool/ERP — Sage only
        if sanitized_inv_no not in sage_sanitized:
            print(f"Skipping '{filename}' — not found in Sage database.")
            continue

        blob_name = get_blob_name_from_path(f"create_reports/{filename}")

        print(f"Migrating '{filename}' -> Azure Blob: '{blob_name}'...")
        
        try:
            # 3. Upload to Azure Blob Storage
            upload_file_to_blob(str(local_path), blob_name)
            
            # 4. Remove local file
            os.remove(local_path)
            print(f"✓ Successfully migrated and deleted local file: {filename}")
            success_count += 1
        except Exception as err:
            print(f"✗ Failed to migrate '{filename}': {err}")
            fail_count += 1

    print("\nMigration Completed:")
    print(f"Successfully migrated: {success_count}")
    print(f"Failed migrations:     {fail_count}")


if __name__ == "__main__":
    run_migration()
