import os
import sys
from sqlalchemy import create_engine, text

backend_path = os.path.join(os.getcwd(), 'backend')
if backend_path not in sys.path:
    sys.path.append(backend_path)

from app.config.settings import settings

def fix_database():
    print(f"Connecting to: {settings.DATABASE_URL}")
    engine = create_engine(settings.DATABASE_URL)
    
    queries = [
        """
        DECLARE @ConstraintName nvarchar(200)
        SELECT @ConstraintName = Name FROM sys.default_constraints
        WHERE parent_object_id = OBJECT_ID('vendor_workflows') 
        AND parent_column_id = (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID('vendor_workflows') AND name = 'is_parallel')

        IF @ConstraintName IS NOT NULL
        BEGIN
            EXEC('ALTER TABLE vendor_workflows DROP CONSTRAINT ' + @ConstraintName)
        END
        """,
        """
        IF EXISTS(SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('vendor_workflows') AND name = 'is_parallel')
        BEGIN
            ALTER TABLE vendor_workflows DROP COLUMN is_parallel
        END
        """
    ]
    
    try:
        with engine.connect() as conn:
            for query in queries:
                print(f"Executing constraint/column drop query")
                conn.execute(text(query))
            conn.commit()
            print("Successfully updated database schema (dropped is_parallel from vendor_workflows).")
    except Exception as e:
        print(f"Error updating database: {e}")

if __name__ == "__main__":
    fix_database()
