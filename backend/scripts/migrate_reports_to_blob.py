import sys
import os
import glob
from pathlib import Path
from sqlalchemy import create_engine, text

# Add the parent directory to sys.path to allow importing common services
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Load dotenv to read database URLs and Azure Storage config
from dotenv import load_dotenv
load_dotenv()

from common.services.azure_blob import upload_file_to_blob, APEX_BLOB_FOLDER

# Paths
BACKEND_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BACKEND_DIR / "output"

# DB URLs
SAGE_DB_URL = os.getenv("DATABASE_URL")
ZOHO_DB_URL = os.getenv("ZOHO_DATABASE_URL")
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

    # 1. Retrieve invoice numbers from both Sage and Zoho databases
    print("Fetching invoice mappings from databases...")
    sage_invoices = get_all_db_invoices(SAGE_DB_URL)
    zoho_invoices = get_all_db_invoices(ZOHO_DB_URL)

    # Map sanitized names to their tools
    sage_sanitized = {sanitize_invoice_number(num): num for num in sage_invoices}
    zoho_sanitized = {sanitize_invoice_number(num): num for num in zoho_invoices}

    # Find PDF files in the output directory
    pdf_files = glob.glob(str(OUTPUT_DIR / "*_approval.pdf"))
    if not pdf_files:
        print("No PDF files found in the output directory to migrate.")
        return

    print(f"Found {len(pdf_files)} PDF reports to migrate.")

    success_count = 0
    fail_count = 0

    for local_path_str in pdf_files:
        local_path = Path(local_path_str)
        filename = local_path.name
        
        # Strip '_approval.pdf' suffix to get the sanitized invoice number
        sanitized_inv_no = filename[:-13]  # Len('_approval.pdf') is 13
        
        # 2. Determine target tool/ERP
        tool = None
        if sanitized_inv_no in sage_sanitized:
            tool = "sage"
        elif sanitized_inv_no in zoho_sanitized:
            tool = "zoho"
        else:
            # Fallback to the active default tool
            tool = DEFAULT_TOOL
            print(f"Could not match '{filename}' to database records. Using fallback tool: '{tool}'")

        prefix = f"{APEX_BLOB_FOLDER}/{tool}" if APEX_BLOB_FOLDER else tool
        blob_name = f"{prefix}/create_reports/{filename}"

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
