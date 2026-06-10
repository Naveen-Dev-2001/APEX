import os
import shutil
import logging
from typing import Optional

logger = logging.getLogger("application_trace")

UPLOAD_BASE_DIR = "uploads"
SUBFOLDERS = {
    "in_progress": "inprogress",
    "deleted": "deleted",
    "posted_stage": "posted to sage",
    "archive": "archived"
}



def init_upload_folders():
    """Initialize upload base directory and subfolders."""
    if not os.path.exists(UPLOAD_BASE_DIR):
        os.makedirs(UPLOAD_BASE_DIR)
        logger.info(f"Created base upload directory: {UPLOAD_BASE_DIR}")
    
    for folder in SUBFOLDERS.values():
        path = os.path.join(UPLOAD_BASE_DIR, folder)
        if not os.path.exists(path):
            os.makedirs(path)
            logger.info(f"Created subfolder: {path}")

def get_folder_path(category: str) -> str:
    """Get the relative path of a subfolder."""
    folder = SUBFOLDERS.get(category)
    if not folder:
        raise ValueError(f"Invalid folder category: {category}")
    return os.path.join(UPLOAD_BASE_DIR, folder)

def find_file_in_any_folder(filename: str) -> Optional[str]:
    """Try to find a file in any of the current subfolders, or root uploads."""
    # 1. Check in root uploads (legacy)
    root_path = os.path.join(UPLOAD_BASE_DIR, filename)
    if os.path.exists(root_path):
        return root_path
    
    # 2. Check in all current subfolders
    for folder in SUBFOLDERS.values():
        path = os.path.join(UPLOAD_BASE_DIR, folder, filename)
        if os.path.exists(path):
            return path
            
    return None

def move_invoice_file(current_path: str, target_category: str) -> Optional[str]:
    """
    Move an invoice file to a new subfolder.
    Returns the new relative path if successful, otherwise None.
    """
    if not current_path:
        return None
    
    # Resolve current absolute path
    if not os.path.isabs(current_path):
        current_abs_path = os.path.abspath(current_path)
    else:
        current_abs_path = current_path
        
    if not os.path.exists(current_abs_path):
        # Fallback to finding it anywhere
        filename = os.path.basename(current_path)
        found_path = find_file_in_any_folder(filename)
        if found_path:
            current_abs_path = os.path.abspath(found_path)
        else:
            logger.warning(f"File not found for moving: {current_path}")
            return None

    filename = os.path.basename(current_abs_path)
    target_dir = get_folder_path(target_category)
    new_relative_path = os.path.join(target_dir, filename)
    new_abs_path = os.path.abspath(new_relative_path)

    # Don't move if it's already in the target directory
    if current_abs_path == new_abs_path:
        return new_relative_path

    try:
        shutil.move(current_abs_path, new_abs_path)
        logger.info(f"Moved file from {current_abs_path} to {new_abs_path}")
        return new_relative_path
    except Exception as e:
        logger.error(f"Failed to move file {filename} to {target_category}: {e}")
        return None

