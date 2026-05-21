import os
import shutil
import subprocess
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

# =========================================================
# CONFIG
# =========================================================

ROOT_DIR = Path.cwd()

BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"

BACKEND_ZIP = ROOT_DIR / "backend.zip"
FRONTEND_ZIP = ROOT_DIR / "frontend.zip"

# =========================================================
# HELPER FUNCTIONS
# =========================================================

def run_command(command):
    print(f"\nRunning: {command}")
    result = subprocess.run(command, shell=True)

    if result.returncode != 0:
        raise Exception(f"Command failed: {command}")


def delete_pycache(folder):
    print("\nDeleting __pycache__ folders...")

    for root, dirs, files in os.walk(folder):
        for dir_name in dirs:
            if dir_name == "__pycache__":
                pycache_path = Path(root) / dir_name
                shutil.rmtree(pycache_path, ignore_errors=True)
                print(f"Deleted: {pycache_path}")


def zip_folder(source_dir, zip_path, exclude_folders=None):
    if exclude_folders is None:
        exclude_folders = []

    print(f"\nCreating ZIP: {zip_path.name}")

    with ZipFile(zip_path, "w", ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):

            # Remove excluded folders from traversal
            dirs[:] = [
                d for d in dirs
                if d not in exclude_folders
            ]

            for file in files:
                file_path = Path(root) / file

                relative_path = file_path.relative_to(source_dir)

                zipf.write(file_path, relative_path)

    print(f"ZIP Created: {zip_path}")


# =========================================================
# MAIN SCRIPT
# =========================================================

def main():
    print("======================================")
    print(" Git Merge + ZIP Automation Tool")
    print("======================================")

    branch_name = input(
        "\nEnter branch name to merge with main (example: version-8): "
    ).strip()

    try:
        # =================================================
        # Step 1 - Checkout Branch
        # =================================================

        run_command(f"git checkout {branch_name}")
        run_command(f"git pull origin {branch_name}")

        # =================================================
        # Step 2 - Checkout Main
        # =================================================

        run_command("git checkout main")
        run_command("git pull origin main")

        # =================================================
        # Step 3 - Merge Branch into Main
        # =================================================

        run_command(f"git merge {branch_name}")

        # =================================================
        # Step 4 - Push Main
        # =================================================

        run_command("git push origin main")

        # =================================================
        # Step 5 - Delete __pycache__
        # =================================================

        delete_pycache(BACKEND_DIR)

        # =================================================
        # Step 6 - Create Backend ZIP
        # Exclude uploads folder
        # =================================================

        if BACKEND_ZIP.exists():
            BACKEND_ZIP.unlink()

        zip_folder(
            BACKEND_DIR,
            BACKEND_ZIP,
            exclude_folders=["uploads", "__pycache__"]
        )

        # =================================================
        # Step 7 - Create Frontend ZIP
        # Exclude dist and node_modules
        # =================================================

        if FRONTEND_ZIP.exists():
            FRONTEND_ZIP.unlink()

        zip_folder(
            FRONTEND_DIR,
            FRONTEND_ZIP,
            exclude_folders=["dist", "node_modules"]
        )

        print("\n======================================")
        print(" Process Completed Successfully")
        print("======================================")

        print(f"\nBackend ZIP : {BACKEND_ZIP}")
        print(f"Frontend ZIP: {FRONTEND_ZIP}")

    except Exception as e:
        print("\nERROR:")
        print(str(e))


# =========================================================
# ENTRY
# =========================================================

if __name__ == "__main__":
    main()