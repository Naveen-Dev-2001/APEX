import sys
import os
from sqlalchemy import text

# Add the parent directory to sys.path to allow importing from 'app'
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database.database import SessionLocal

def test_conn():
    print("Testing database connection...")
    db = SessionLocal()
    try:
        result = db.execute(text("SELECT 1"))
        print(f"Connection successful: {result.scalar()}")
    except Exception as e:
        print(f"Connection failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    test_conn()
