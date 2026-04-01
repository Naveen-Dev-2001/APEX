import sys
sys.path.append('backend')
from app.database.database import engine
from sqlalchemy import text

with engine.begin() as conn:
    print("Checking columns in 'users' table:")
    result = conn.execute(text("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users'"))
    for row in result:
        print(row[0])

    print("Adding missing columns to 'users' table...")
    queries = [
        "ALTER TABLE users ADD isCreatedByUser BIT NOT NULL DEFAULT 1",
        "ALTER TABLE users ADD createdby NVARCHAR(100) NOT NULL DEFAULT 'self'",
        "ALTER TABLE users ADD ispasswordchange BIT NOT NULL DEFAULT 1"
    ]
    for q in queries:
        try:
            conn.execute(text(q))
            print("Successfully executed:", q)
        except Exception as e:
            print("Error executing:", q, "Error:", e)
