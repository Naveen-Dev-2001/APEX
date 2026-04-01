from sqlalchemy import text
from app.database.database import engine

def main():
    tables = {
        'customer_master': 'customer_key',
        'gl_master': 'gl_key',
        'department_master': 'dept_key',
        'lob_master': 'lob_key',
        'item_master': 'item_key',
        'vendor_master': 'vendor_key',
    }
    
    with engine.connect() as conn:
        for table, col in tables.items():
            index_name = f"ix_{table}_{col}"
            
            # Drop existing index
            try:
                conn.execute(text(f"DROP INDEX {index_name} ON {table}"))
                print(f"Successfully dropped index {index_name} on {table}")
            except Exception as e:
                print(f"Skipping drop for {index_name}: {e}")
                
            # Create new filtered unique index
            try:
                conn.execute(text(f"CREATE UNIQUE INDEX {index_name} ON {table} ({col}) WHERE {col} IS NOT NULL"))
                print(f"Successfully created filtered index {index_name} on {table}")
            except Exception as e:
                print(f"Failed to create index {index_name}: {e}")
        
        try:
            conn.commit()
            print("Changes committed successfully.")
        except Exception as e:
            print(f"Commit failed: {e}")

if __name__ == "__main__":
    main()
