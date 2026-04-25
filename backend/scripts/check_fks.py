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

def check_constraints():
    conn = pymssql.connect(server=host, user=user, password=password, database=dbname, port=port)
    cursor = conn.cursor()
    query = """
    SELECT 
        OBJECT_NAME(f.parent_object_id) AS table_name,
        COL_NAME(fc.parent_object_id, fc.parent_column_id) AS column_name,
        f.update_referential_action_desc
    FROM 
        sys.foreign_keys AS f
    INNER JOIN 
        sys.foreign_key_columns AS fc ON f.object_id = fc.constraint_object_id
    WHERE 
        OBJECT_NAME(f.referenced_object_id) IN ('entity_master', 'vendor_master')
    """
    cursor.execute(query)
    for row in cursor.fetchall():
        print(f"{row[0]}({row[1]}): {row[2]}")
    conn.close()

if __name__ == "__main__":
    check_constraints()
