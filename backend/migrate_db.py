import sys
import os
from sqlalchemy import text

# Add the parent directory to sys.path to import app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database.database import engine

def migrate():
    print("Starting database migration...")
    
    statements = [
        # vendor_workflows
        """
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('vendor_workflows') AND name = 'optional_approver')
        ALTER TABLE vendor_workflows ADD optional_approver NVARCHAR(200) NULL;
        """,
        """
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('vendor_workflows') AND name = 'updated_at')
        ALTER TABLE vendor_workflows ADD updated_at DATETIME NULL;
        """,
        
        # codification_workflows
        """
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('codification_workflows') AND name = 'optional_approver')
        ALTER TABLE codification_workflows ADD optional_approver NVARCHAR(200) NULL;
        """,
        """
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('codification_workflows') AND name = 'updated_at')
        ALTER TABLE codification_workflows ADD updated_at DATETIME NULL;
        """
    ]
    
    with engine.connect() as connection:
        # We need to use autocommit for ALTER TABLE statements in some cases, 
        # but SQLAlchemy usually handles this. We'll wrap in a transaction if needed.
        trans = connection.begin()
        try:
            for statement in statements:
                print(f"Executing: {statement.strip().splitlines()[0]}...")
                connection.execute(text(statement))
            trans.commit()
            print("Migration completed successfully.")
        except Exception as e:
            trans.rollback()
            print(f"Migration failed: {e}")
            sys.exit(1)

if __name__ == "__main__":
    migrate()
