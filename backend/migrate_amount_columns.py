import json
import decimal
from sqlalchemy import create_engine, text, Column, DECIMAL, Integer, Text, String, DateTime
from sqlalchemy.orm import sessionmaker
import sys
import os

# Import settings to get DATABASE_URL
sys.path.append(os.getcwd())
from app.config.settings import settings

def remove_currency_format(value):
    if not value or value == "" or value == "N/A":
        return None
    try:
        # Remove commas and $ symbols
        clean_val = str(value).replace(',', '').replace('$', '').strip()
        if not clean_val:
            return None
        return float(clean_val)
    except (ValueError, TypeError):
        return None

try:
    print(f"Connecting to database...")
    engine = create_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    print("Checking and adding columns...")
    
    # Use raw SQL for ALTER TABLE as SQLAlchemy won't do it via create_all for existing tables
    # Check if columns exist first (SQL Server syntax)
    with engine.connect() as conn:
        # Check total_amount
        res = conn.execute(text("""
            SELECT COUNT(*) FROM sys.columns 
            WHERE object_id = OBJECT_ID(N'[dbo].[invoices]') 
            AND name = 'total_amount'
        """)).scalar()
        
        if res == 0:
            print("Adding total_amount column...")
            conn.execute(text("ALTER TABLE invoices ADD total_amount DECIMAL(18, 2) NULL"))
            conn.execute(text("CREATE INDEX ix_invoices_total_amount ON invoices(total_amount)"))
            conn.commit()
        else:
            print("total_amount column already exists.")
            
        # Check amount_due
        res = conn.execute(text("""
            SELECT COUNT(*) FROM sys.columns 
            WHERE object_id = OBJECT_ID(N'[dbo].[invoices]') 
            AND name = 'amount_due'
        """)).scalar()
        
        if res == 0:
            print("Adding amount_due column...")
            conn.execute(text("ALTER TABLE invoices ADD amount_due DECIMAL(18, 2) NULL"))
            conn.execute(text("CREATE INDEX ix_invoices_amount_due ON invoices(amount_due)"))
            conn.commit()
        else:
            print("amount_due column already exists.")

    print("Migrating data from extracted_data JSON...")
    # Fetch all invoices
    result = db.execute(text("SELECT id, extracted_data FROM invoices")).fetchall()
    
    update_count = 0
    for row in result:
        invoice_id = row[0]
        extracted_data_str = row[1]
        
        if not extracted_data_str:
            continue
            
        try:
            data = json.loads(extracted_data_str)
            
            # Helper to navigate nested dicts
            total = remove_currency_format(data.get("amounts", {}).get("total_invoice_amount", {}).get("value"))
            due = remove_currency_format(data.get("amounts", {}).get("amount_due", {}).get("value"))
            
            if total is not None or due is not None:
                db.execute(
                    text("UPDATE invoices SET total_amount = :total, amount_due = :due WHERE id = :id"),
                    {"total": total, "due": due, "id": invoice_id}
                )
                update_count += 1
        except Exception as e:
            print(f"Skipping ID {invoice_id} due to error: {e}")

    db.commit()
    print(f"Migration completed. {update_count} records updated.")
    
    db.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
