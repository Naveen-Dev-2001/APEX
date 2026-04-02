import subprocess
import os
import sys

# Add backend to path
backend_path = r"c:\Users\LDNA40022\Lokesh\APEX\backend"
sys.path.append(backend_path)

with open("init_db_output.log", "w") as f:
    result = subprocess.run(
        [r"c:\Users\LDNA40022\Lokesh\APEX\.venv\Scripts\python.exe", "-m", "app.database.init_db"],
        cwd=backend_path,
        capture_output=True,
        text=True
    )
    f.write("STDOUT:\n")
    f.write(result.stdout)
    f.write("\nSTDERR:\n")
    f.write(result.stderr)

print("init_db_output.log created")
