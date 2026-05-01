from app.database.database import SessionLocal
from app.models.db_models import Invoice
import json
import re
from datetime import datetime
from app.database.db_utils import deserialize_json_field

def parse_amount(val):
    if val is None:
        return None
    try:
        if isinstance(val, (int, float)):
            return float(val)
        val_str = str(val).strip().replace(",", "")
        match = re.search(r'-?\d+(\.\d+)?', val_str)
        if match:
            return float(match.group())
        return None
    except:
        return None

def parse_date(val):
    if not val:
        return None
    try:
        if isinstance(val, datetime):
            return val
        return datetime.fromisoformat(str(val))
    except:
        try:
            return datetime.strptime(str(val), "%Y-%m-%d")
        except:
            return None

def sync_flat_columns():
    db = SessionLocal()
    try:
        invoices = db.query(Invoice).all()
        updated_count = 0
        for inv in invoices:
            changed = False
            extracted = deserialize_json_field(inv.extracted_data) or {}
            
            # 1. Total Amount
            if inv.total_amount is None:
                amounts = extracted.get("amounts", {})
                val = amounts.get("total_invoice_amount", {}).get("value")
                if val is None:
                    # Fallback to direct field
                    val = extracted.get("total_amount", {}).get("value")
                
                parsed = parse_amount(val)
                if parsed is not None:
                    inv.total_amount = parsed
                    changed = True
            
            # 2. Amount Due
            if inv.amount_due is None:
                amounts = extracted.get("amounts", {})
                val = amounts.get("amount_due", {}).get("value")
                parsed = parse_amount(val)
                if parsed is not None:
                    inv.amount_due = parsed
                    changed = True
            
            # 3. Invoice Number
            if not inv.invoice_number:
                details = extracted.get("invoice_details", {})
                val = details.get("invoice_number", {}).get("value")
                if val:
                    inv.invoice_number = str(val)
                    changed = True
            
            # 4. Vendor Name
            if not inv.vendor_name:
                vendor = extracted.get("vendor_info", {})
                val = vendor.get("name", {}).get("value")
                if val:
                    inv.vendor_name = str(val)
                    changed = True

            # 5. Dates
            if inv.invoice_date is None:
                details = extracted.get("invoice_details", {})
                val = details.get("invoice_date", {}).get("value")
                parsed = parse_date(val)
                if parsed:
                    inv.invoice_date = parsed
                    changed = True

            if changed:
                updated_count += 1
        
        db.commit()
        print(f"Successfully synchronized {updated_count} invoices.")
    except Exception as e:
        db.rollback()
        print(f"Error during sync: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    sync_flat_columns()
