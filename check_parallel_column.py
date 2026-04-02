import sqlalchemy
from sqlalchemy import create_engine, inspect
import sys
import os

# Add the backend to path so we can import settings
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from app.config.settings import settings

def check():
    engine = create_engine(settings.DATABASE_URL)
    inspector = inspect(engine)
    
    tables = ['vendor_workflows', 'codification_workflows']
    for table in tables:
        print(f"Checking table: {table}")
        columns = [c['name'] for c in inspector.get_columns(table)]
        print(f"Columns: {columns}")
        if 'is_parallel' in columns:
            print(f"SUCCESS: {table} has is_parallel column.")
        else:
            print(f"FAILURE: {table} is MISSING is_parallel column.")

if __name__ == "__main__":
    check()
