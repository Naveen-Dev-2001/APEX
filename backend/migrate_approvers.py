from sqlalchemy import create_engine, text
import sys

DATABASE_URL = "mssql+pymssql://sa:Loandna%402026@localhost:1433/accounts_payable"

def migrate():
    try:
        engine = create_engine(DATABASE_URL)
        with engine.connect() as connection:
            print("Connected. Running ALTER TABLE for vendor_workflows...")
            
            # Vendor Workflows
            try:
                connection.execute(text("ALTER TABLE vendor_workflows ADD mandatory_approver_4 NVARCHAR(200) NULL"))
                print("Added mandatory_approver_4 to vendor_workflows")
            except Exception as e:
                print(f"mandatory_approver_4 already exists or error: {e}")
                
            try:
                connection.execute(text("ALTER TABLE vendor_workflows ADD mandatory_approver_5 NVARCHAR(200) NULL"))
                print("Added mandatory_approver_5 to vendor_workflows")
            except Exception as e:
                print(f"mandatory_approver_5 already exists or error: {e}")

            print("Running ALTER TABLE for codification_workflows...")
            # Codification Workflows
            try:
                connection.execute(text("ALTER TABLE codification_workflows ADD mandatory_approver_4 NVARCHAR(200) NULL"))
                print("Added mandatory_approver_4 to codification_workflows")
            except Exception as e:
                print(f"mandatory_approver_4 already exists or error: {e}")
                
            try:
                connection.execute(text("ALTER TABLE codification_workflows ADD mandatory_approver_5 NVARCHAR(200) NULL"))
                print("Added mandatory_approver_5 to codification_workflows")
            except Exception as e:
                print(f"mandatory_approver_5 already exists or error: {e}")

            connection.commit()
            print("Successfully updated tables.")
    except Exception as e:
        print(f"Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    migrate()
