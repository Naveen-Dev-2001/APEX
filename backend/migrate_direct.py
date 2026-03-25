from sqlalchemy import create_engine, text
import sys

# Connection string from backend settings
DATABASE_URL = "mssql+pymssql://sa:Loandna%402026@localhost:1433/accounts_payable"

def migrate():
    try:
        engine = create_engine(DATABASE_URL)
        with engine.connect() as connection:
            print("Connected. Running ALTER TABLE...")
            sql = "ALTER TABLE entity_master ADD gst_applicable BIT DEFAULT 0"
            connection.execute(text(sql))
            connection.commit()
            print("Successfully added 'gst_applicable' to 'entity_master'.")
    except Exception as e:
        if "already an object named" in str(e) or "Column names in each table must be unique" in str(e):
            print("Column 'gst_applicable' already exists.")
        else:
            print(f"Migration failed: {e}")
            sys.exit(1)

if __name__ == "__main__":
    migrate()
