import pymssql
import sys

# Connection details from settings
server = 'localhost'
user = 'sa'
password = 'Loandna@2026'
database = 'accounts_payable'

try:
    print(f"Connecting to {server}...")
    conn = pymssql.connect(server, user, password, database)
    cursor = conn.cursor()
    print("Connected. Checking column...")
    
    cursor.execute("""
        SELECT COUNT(*) FROM sys.columns 
        WHERE object_id = OBJECT_ID(N'[dbo].[entity_master]') 
        AND name = 'gst_applicable'
    """)
    exists = cursor.fetchone()[0]
    
    if not exists:
        print("Adding gst_applicable column...")
        cursor.execute("ALTER TABLE entity_master ADD gst_applicable BIT DEFAULT 0 NOT NULL")
        conn.commit()
        print("Column added successfully.")
    else:
        print("Column already exists.")
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
