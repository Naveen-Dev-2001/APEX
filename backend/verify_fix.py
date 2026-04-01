from app.models.db_models import VendorWorkflow as DBVendorWorkflow
from datetime import datetime

try:
    new_workflow = DBVendorWorkflow(
        entity="test_entity",
        vendor_id="test_vendor",
        vendor_name="test_name",
        approver_count=1,
        optional_approver="optional@example.com",
        created_at=datetime.utcnow()
    )
    print("SUCCESS: DBVendorWorkflow instantiated with optional_approver.")
    print(f"Object: {new_workflow.optional_approver}")
except TypeError as e:
    print(f"FAILURE: {e}")
except Exception as e:
    print(f"Unexpected error: {e}")
