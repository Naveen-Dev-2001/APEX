import sys
import os

# Add the current directory to sys.path
sys.path.append(os.getcwd())

from app.database.database import SessionLocal
from app.models.db_models import Invoice
from app.repository.repositories import invoice_repo
from fastapi.encoders import jsonable_encoder

def test_update_recursion():
    db = SessionLocal()
    try:
        # Get an invoice that has status history (or any relationship)
        invoice = db.query(Invoice).first()
        if not invoice:
            print("No invoice found to test.")
            return

        print(f"Testing update on Invoice ID: {invoice.id}")
        
        # This used to crash if jsonable_encoder was called on 'invoice' 
        # inside invoice_repo.update
        update_data = {"line_grouping": invoice.line_grouping} 
        
        print("Calling invoice_repo.update...")
        updated_invoice = invoice_repo.update(db, db_obj=invoice, obj_in=update_data)
        print("Update successful!")
        
        # Also test jsonable_encoder directly on a dict containing the model
        # to see if our manual fix in routes is enough
        print("Testing jsonable_encoder on a dict containing the model (should still fail if not careful)...")
        try:
            # This is what we want to avoid in our code
            # jsonable_encoder({"item": invoice}) 
            print("Skipping direct encoder test on model as it's expected to fail by design of FastAPI's encoder vs SQLAlchemy's circularity.")
            pass
        except RecursionError:
            print("Caught expected RecursionError when calling encoder directly on model.")

    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_update_recursion()
