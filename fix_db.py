import os
import sys
from sqlalchemy import create_engine, text

# Add backend to sys.path for settings import
backend_path = os.path.join(os.getcwd(), 'backend')
if backend_path not in sys.path:
    sys.path.append(backend_path)

from app.config.settings import settings

def fix_database():
    print(f"Connecting to: {settings.DATABASE_URL}")
    engine = create_engine(settings.DATABASE_URL)
    
    # Columns to add if they are missing
    queries = [
        # Vendor Workflows
        "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('vendor_workflows') AND name = 'is_parallel') ALTER TABLE vendor_workflows ADD is_parallel BIT NOT NULL DEFAULT 0;",
        "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('vendor_workflows') AND name = 'optional_approver') ALTER TABLE vendor_workflows ADD optional_approver NVARCHAR(MAX) NULL;",
        "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('vendor_workflows') AND name = 'updated_at') ALTER TABLE vendor_workflows ADD updated_at DATETIME NULL;",
        
        # Codification Workflows
        "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('codification_workflows') AND name = 'is_parallel') ALTER TABLE codification_workflows ADD is_parallel BIT NOT NULL DEFAULT 0;",
        "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('codification_workflows') AND name = 'optional_approver') ALTER TABLE codification_workflows ADD optional_approver NVARCHAR(MAX) NULL;",
        "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('codification_workflows') AND name = 'updated_at') ALTER TABLE codification_workflows ADD updated_at DATETIME NULL;"
    ]
    
    try:
        with engine.connect() as conn:
            for query in queries:
                print(f"Executing: {query}")
                conn.execute(text(query))
            conn.commit()
            print("Successfully updated database schema.")
    except Exception as e:
        print(f"Error updating database: {e}")

if __name__ == "__main__":
    fix_database()
