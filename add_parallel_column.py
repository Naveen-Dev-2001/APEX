from sqlalchemy import create_engine, text
import sys
import os

# Add the backend to path so we can import settings
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from app.config.settings import settings

def migrate():
    engine = create_engine(settings.DATABASE_URL)
    
    commands = [
        # For vendor_workflows
        "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('vendor_workflows') AND name = 'is_parallel') ALTER TABLE vendor_workflows ADD is_parallel BIT NOT NULL DEFAULT 0;",
        "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('vendor_workflows') AND name = 'optional_approver') ALTER TABLE vendor_workflows ADD optional_approver NVARCHAR(MAX) NULL;",
        "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('vendor_workflows') AND name = 'updated_at') ALTER TABLE vendor_workflows ADD updated_at DATETIME NULL;",
        
        # For codification_workflows
        "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('codification_workflows') AND name = 'is_parallel') ALTER TABLE codification_workflows ADD is_parallel BIT NOT NULL DEFAULT 0;",
        "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('codification_workflows') AND name = 'optional_approver') ALTER TABLE codification_workflows ADD optional_approver NVARCHAR(MAX) NULL;",
        "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('codification_workflows') AND name = 'updated_at') ALTER TABLE codification_workflows ADD updated_at DATETIME NULL;"
    ]
    
    with engine.connect() as conn:
        for cmd in commands:
            print(f"Executing: {cmd}")
            conn.execute(text(cmd))
            conn.commit()
    
    print("Migration completed successfully.")

if __name__ == "__main__":
    migrate()
