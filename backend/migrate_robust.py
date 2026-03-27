from sqlalchemy import create_engine, text
import sys

DATABASE_URL = "mssql+pymssql://sa:Loandna%402026@localhost:1433/accounts_payable"

def migrate():
    print(f"Connecting to {DATABASE_URL}...")
    try:
        engine = create_engine(DATABASE_URL)
        with engine.connect() as connection:
            print("Connected successfully.")
            
            tables = ['vendor_workflows', 'codification_workflows']
            cols = ['mandatory_approver_4', 'mandatory_approver_5']
            
            for table in tables:
                print(f"\nChecking table: {table}")
                for col in cols:
                    try:
                        print(f"Adding column {col} to {table}...")
                        sql = f"ALTER TABLE {table} ADD {col} NVARCHAR(200) NULL"
                        connection.execute(text(sql))
                        print(f"✓ Successfully added {col} to {table}")
                    except Exception as e:
                        if "Column names in each table must be unique" in str(e) or "already exists" in str(e).lower():
                            print(f"! Column {col} already exists in {table}")
                        else:
                            print(f"✗ Failed to add {col} to {table}: {e}")
            
            connection.commit()
            print("\nMigration process completed.")
            
            # Verify columns
            print("\nVerifying columns...")
            for table in tables:
                res = connection.execute(text(f"SELECT TOP 0 * FROM {table}"))
                print(f"{table} columns: {res.keys()}")
                
    except Exception as e:
        print(f"CRITICAL: Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    migrate()
