import json
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import sys
import os
from datetime import datetime
from dateutil import parser

# Import settings to get DATABASE_URL
sys.path.append(os.getcwd())
from app.config.settings import settings

def parse_date_safely(value):
    if not value or value == "" or value == "N/A":
        return None
    try:
        if isinstance(value, datetime):
            return value.date()
        dt = parser.parse(str(value))
        return dt.date()
    except (ValueError, TypeError, parser.ParserError):
        return None

try:
    print(f"Connecting to database...")
    engine = create_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    print("Checking and adding date columns...")
    
    with engine.connect() as conn:
        # Check invoice_date
        res = conn.execute(text("""
            SELECT COUNT(*) FROM sys.columns 
            WHERE object_id = OBJECT_ID(N'[dbo].[invoices]') 
            AND name = 'invoice_date'
        """)).scalar()
        
        if res == 0:
            print("Adding invoice_date column...")
            conn.execute(text("ALTER TABLE invoices ADD invoice_date DATE NULL"))
            conn.execute(text("CREATE INDEX ix_invoices_invoice_date ON invoices(invoice_date)"))
            conn.commit()
        else:
            print("invoice_date column already exists.")
            
        # Check due_date
        res = conn.execute(text("""
            SELECT COUNT(*) FROM sys.columns 
            WHERE object_id = OBJECT_ID(N'[dbo].[invoices]') 
            AND name = 'due_date'
        """)).scalar()
        
        if res == 0:
            print("Adding due_date column...")
            conn.execute(text("ALTER TABLE invoices ADD due_date DATE NULL"))
            conn.execute(text("CREATE INDEX ix_invoices_due_date ON invoices(due_date)"))
            conn.commit()
        else:
            print("due_date column already exists.")

    print("Migrating date data from extracted_data JSON...")
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
            
            # Navigate nested dicts
            invoice_details = data.get("invoice_details", {})
            inv_dt_val = invoice_details.get("invoice_date", {}).get("value")
            due_dt_val = invoice_details.get("due_date", {}).get("value")
            
            inv_date = parse_date_safely(inv_dt_val)
            due_date = parse_date_safely(due_dt_val)
            
            if inv_date is not None or due_date is not None:
                db.execute(
                    text("UPDATE invoices SET invoice_date = :inv_date, due_date = :due_date WHERE id = :id"),
                    {"inv_date": inv_date, "due_date": due_date, "id": invoice_id}
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
