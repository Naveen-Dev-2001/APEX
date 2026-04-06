import asyncio
import os
import sys
from pathlib import Path

# Add the backend directory to sys.path to allow importing from 'app'
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from dotenv import load_dotenv

# Load environment variables
env_path = backend_dir / '.env'
load_dotenv(dotenv_path=env_path)

from app.database.database import SessionLocal
from app.database.init_db import seed_api_master_data

async def main():
    # Check for --force flag
    force = "--force" in sys.argv
    
    print("\n" + "="*60)
    print("MASTER DATA SYNC SCRIPT (FROM SAGE/STAGE)")
    if force:
        print("FORCING FULL SYNC (OVERWRITING/UPDATING EXISTING DATA)")
    print("="*60)
    
    db = SessionLocal()
    try:
        # Run sync/seed
        await seed_api_master_data(db, force=force)
        print("✓ Master data sync process completed.")
    except Exception as e:
        print(f"✗ Sync error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()
    
    print("="*60 + "\n")

if __name__ == "__main__":
    asyncio.run(main())
