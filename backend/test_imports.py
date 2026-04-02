import sys
import os
sys.path.append(os.getcwd())

try:
    from app.repository.repositories import (
        user_repo, vendor_master_repo, audit_log_repo, exchange_rate_master_repo, entity_repo
    )
    print("Import successful!")
    print(f"user_repo: {user_repo}")
    print(f"vendor_master_repo: {vendor_master_repo}")
    print(f"entity_repo (alias): {entity_repo}")
except Exception as e:
    print(f"Import failed: {e}")
    sys.exit(1)
