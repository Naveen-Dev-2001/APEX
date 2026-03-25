import sys
import os
# Add the backend directory to sys.path
sys.path.append(r'c:\Users\LDNA40022\Lokesh\APEX\backend')

try:
    from app.database.database import engine
    from sqlalchemy import text
except ImportError as e:
    print(f"Import Error: {e}")
    sys.exit(1)

def migrate():
    try:
        with engine.connect() as connection:
            print("Running migration for 'entity_master'...")
            # SQL Server specific check and alter
            sql = """
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID(N'[dbo].[entity_master]') 
                AND name = 'gst_applicable'
            )
            BEGIN
                ALTER TABLE [dbo].[entity_master] ADD [gst_applicable] BIT DEFAULT 0 NOT NULL;
                PRINT 'Column gst_applicable added.';
            END
            ELSE
            BEGIN
                PRINT 'Column gst_applicable already exists.';
            END
            """
            # SQL Server doesn't always like PRINT in execute depending on driver, but let's try
            connection.execute(text(sql))
            connection.commit()
            print("Migration completed successfully.")
    except Exception as e:
        print(f"Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    migrate()
