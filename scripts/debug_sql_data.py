import sys
import os
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.append(str(backend_dir))

from app.database.database import SessionLocal
from app.models.db_models import User, Invoice, InvoiceAssignedApprover

def debug_data():
    db = SessionLocal()
    try:
        print("--- USERS ---")
        users = db.query(User).all()
        for u in users:
            print(f"ID: {u.id}, Username: {u.username}, Role: {u.role}, Dept: {u.department}, Email: {u.email}")
            
        print("\n--- INVOICES WITH APPROVERS ---")
        invoices = db.query(Invoice).join(InvoiceAssignedApprover).limit(10).all()
        for inv in invoices:
            approvers = [a.approver_email for a in inv.assigned_approvers_list]
            print(f"ID: {inv.id}, Num: {inv.invoice_number}, Status: {inv.status}, Approvers: {approvers}")
            
    finally:
        db.close()

if __name__ == "__main__":
    debug_data()
