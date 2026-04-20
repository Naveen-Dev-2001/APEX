import sys
import os
from pathlib import Path
from datetime import datetime

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.append(str(backend_dir))

from app.database.database import SessionLocal
from app.models.db_models import User, Invoice, InvoiceAssignedApprover, InvoiceStatusEnum
from app.auth.jwt import get_current_user
from sqlalchemy import or_

def verify_visibility():
    db = SessionLocal()
    try:
        # 1. Setup Test Data (Temporary)
        print("Setting up test data...")
        
        # Find a non-finance approver
        non_finance_approver = db.query(User).filter(User.email == "approver_4@gmail.com").first()
        if not non_finance_approver:
            print("Error: approver_4@gmail.com not found. Check debug_sql_data output.")
            return

        # Find or create a test invoice
        test_invoice = db.query(Invoice).first()
        if not test_invoice:
             print("Error: No invoices in DB to test with.")
             return
        
        # Clear existing assignments for this test invoice
        db.query(InvoiceAssignedApprover).filter(InvoiceAssignedApprover.invoice_id == test_invoice.id).delete()
        
        # Assign the non-finance approver
        assignment = InvoiceAssignedApprover(
            invoice_id=test_invoice.id,
            approver_email=non_finance_approver.email.lower(),
            sequence_order=1
        )
        db.add(assignment)
        db.flush() # flush to DB but don't commit yet
        
        print(f"Test Setup: Invoice {test_invoice.id} assigned to {non_finance_approver.email}")

        # 2. Mock Logic and Verify
        def test_visibility_for_user(user_email, user_role, user_dept):
            class MockUser:
                def __init__(self, email, role, department):
                    self.email = email
                    self.role = role
                    self.department = department
            
            current_user = MockUser(user_email, user_role, user_dept)
            entity = test_invoice.entity
            
            # --- START COPIED LOGIC FROM invoices.py ---
            expressions = []
            user_roles = [r.strip().lower() for r in current_user.role.split(",")]
            user_dept_str = (current_user.department or "finance").lower()
            
            is_approver = "approver" in user_roles
            is_admin = "admin" in user_roles
            is_finance = "finance" in user_dept_str and "non-finance" not in user_dept_str
            
            if is_approver and not is_admin and not is_finance:
                # We'll skip delegation for this simple test
                target_emails = [current_user.email.lower()]
                expressions.append(
                    Invoice.assigned_approvers_list.any(
                        InvoiceAssignedApprover.approver_email.in_(target_emails)
                    )
                )
            # --- END COPIED LOGIC ---
            
            query = db.query(Invoice).filter(Invoice.entity == entity)
            if expressions:
                for expr in expressions:
                    query = query.filter(expr)
            
            results = query.all()
            return [inv.id for inv in results]

        # Scenario 1: Admin should see everything
        print("\nScenario 1: Admin in non-finance")
        ids = test_visibility_for_user("admin@gmail.com", "admin, approver", "non-finance")
        print(f"Admin saw {len(ids)} invoices. Success? {len(ids) > 0}")

        # Scenario 2: Finance approver should see everything
        print("\nScenario 2: Finance approver")
        ids = test_visibility_for_user("approver_1@gmail.com", "approver", "finance")
        print(f"Finance approver saw {len(ids)} invoices. Success? {len(ids) > 0}")

        # Scenario 3: Non-finance approver (assigned) should see the test invoice
        print("\nScenario 3: Non-finance approver (assigned)")
        ids = test_visibility_for_user("approver_4@gmail.com", "approver", "non-finance")
        print(f"Non-finance approver saw {len(ids)} invoices. Assigned Invoice in results? {test_invoice.id in ids}")
        
        # Scenario 4: Non-finance approver (NOT assigned) should see nothing (or only their own if any)
        print("\nScenario 4: Non-finance approver (NOT assigned)")
        ids = test_visibility_for_user("approver_5@gmail.com", "approver", "non-finance")
        print(f"Non-assigned approver saw {len(ids)} invoices. Assigned Invoice in results? {test_invoice.id in ids}")

        # 3. Verify DeletedInvoice Logic
        from app.models.db_models import DeletedInvoice
        print("\n--- DELETED INVOICES VERIFICATION ---")
        
        # Create a mock deleted invoice with assigned_approvers_json
        # We don't actually add it to DB because I want to keep it clean, 
        # but I can use a subquery or just check the logic in a small script.
        # Actually, let's just test the SQL query construction.
        
        import json
        test_deleted_inv = DeletedInvoice(
            original_invoice_id=9999,
            entity=test_invoice.entity,
            assigned_approvers_json=json.dumps([{"approver_email": "approver_4@gmail.com"}])
        )
        db.add(test_deleted_inv)
        db.flush()
        
        def test_deleted_visibility(user_email, user_role, user_dept):
            class MockUser:
                def __init__(self, email, role, department):
                    self.email = email
                    self.role = role
                    self.department = department
            
            current_user = MockUser(user_email, user_role, user_dept)
            entity = test_invoice.entity
            
            # --- START COPIED LOGIC FROM invoices.py ---
            user_roles = [r.strip().lower() for r in current_user.role.split(",")]
            user_dept_str = (current_user.department or "finance").lower()
            
            is_approver = "approver" in user_roles
            is_admin = "admin" in user_roles
            is_finance = "finance" in user_dept_str and "non-finance" not in user_dept_str

            query = db.query(DeletedInvoice).filter(DeletedInvoice.entity == entity)
            
            if is_approver and not is_admin and not is_finance:
                target_emails = [current_user.email.lower()]
                email_filters = [DeletedInvoice.assigned_approvers_json.ilike(f"%{email}%") for email in target_emails]
                if email_filters:
                    query = query.filter(or_(*email_filters))
            # --- END COPIED LOGIC ---
            
            results = query.all()
            return [inv.id for inv in results]

        print("Scenario 5: Non-finance approver (assigned to deleted)")
        ids = test_deleted_visibility("approver_4@gmail.com", "approver", "non-finance")
        print(f"Found {len(ids)} deleted invoices. Mock ID in results? {test_deleted_inv.id in ids}")

        print("\nScenario 6: Non-finance approver (NOT assigned to deleted)")
        ids = test_deleted_visibility("approver_5@gmail.com", "approver", "non-finance")
        print(f"Found {len(ids)} deleted invoices. Mock ID in results? {test_deleted_inv.id in ids}")

    finally:
        print("\nRolling back changes...")
        db.rollback()
        db.close()

if __name__ == "__main__":
    verify_visibility()
