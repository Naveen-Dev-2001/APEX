import pymssql
import os
from dotenv import load_dotenv
import re

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
db_url = os.getenv("DATABASE_URL")
match = re.match(r"mssql\+pymssql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/(.+)", db_url)
user, password, host, port, dbname = match.groups()
port = int(port) if port else 1433
password = password.replace('%40', '@')

def fix_constraints():
    try:
        conn = pymssql.connect(server=host, user=user, password=password, database=dbname, port=port, autocommit=True)
        cursor = conn.cursor()

        print(f"Connected to database: {dbname}")

        query = """
        SELECT 
            f.name AS foreign_key_name,
            OBJECT_NAME(f.parent_object_id) AS table_name,
            COL_NAME(fc.parent_object_id, fc.parent_column_id) AS column_name,
            OBJECT_NAME (f.referenced_object_id) AS referenced_table_name,
            COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS referenced_column_name,
            f.delete_referential_action_desc,
            f.update_referential_action_desc
        FROM 
            sys.foreign_keys AS f
        INNER JOIN 
            sys.foreign_key_columns AS fc ON f.object_id = fc.constraint_object_id
        WHERE 
            OBJECT_NAME(f.referenced_object_id) IN ('entity_master', 'vendor_master')
            AND COL_NAME(fc.referenced_object_id, fc.referenced_column_id) IN ('entity_id', 'vendor_id')
        """

        cursor.execute(query)
        constraints = cursor.fetchall()

        if not constraints:
            print("No matching foreign key constraints found.")
            return

        for row in constraints:
            fk_name, table_name, col_name, ref_table, ref_col, del_action, upd_action = row
            
            if upd_action == 'CASCADE':
                continue

            print(f"Updating {table_name}({col_name}) -> {ref_table}({ref_col})")
            
            delete_clause = "ON DELETE CASCADE" if del_action == 'CASCADE' else ""
            
            try:
                # Drop
                cursor.execute(f"ALTER TABLE [{table_name}] DROP CONSTRAINT [{fk_name}]")
                # Add with CASCADE
                cursor.execute(f"""
                    ALTER TABLE [{table_name}] 
                    ADD CONSTRAINT [{fk_name}] 
                    FOREIGN KEY ([{col_name}]) 
                    REFERENCES [{ref_table}] ([{ref_col}]) 
                    ON UPDATE CASCADE {delete_clause}
                """)
                print(f"  [SUCCESS] {fk_name} updated to CASCADE.")
            except Exception as e:
                print(f"  [FAILED] Could not update {fk_name}: {e}")
                # Try to restore the original constraint if it was dropped but couldn't be re-added
                try:
                    cursor.execute(f"""
                        ALTER TABLE [{table_name}] 
                        ADD CONSTRAINT [{fk_name}] 
                        FOREIGN KEY ([{col_name}]) 
                        REFERENCES [{ref_table}] ([{ref_col}]) 
                        {delete_clause}
                    """)
                    print(f"  [RESTORED] Original constraint restored for {fk_name}.")
                except Exception as restore_e:
                    print(f"  [CRITICAL] Failed to restore constraint {fk_name}: {restore_e}")

        conn.close()
        print("\nMigration finished.")

    except Exception as e:
        print(f"Global error: {e}")

if __name__ == "__main__":
    fix_constraints()
