import os
import shutil
import logging
from typing import Optional

logger = logging.getLogger("application_trace")

from common.config.config import TOOL
UPLOAD_BASE_DIR = f"uploads/{TOOL}"

SUBFOLDERS = {
    "in_progress": "in_progress_files",
    "deleted": "deleted_files",
    "posted_stage": "posted_to_sage_files" if TOOL == "sage" else "posted_to_zoho_files",
    "archive": "archived_files",
    "non_invoices": "non_invoice"
}

def init_upload_folders():
    """Initialize upload base directory and subfolders."""
    if not os.path.exists(UPLOAD_BASE_DIR):
        os.makedirs(UPLOAD_BASE_DIR)
        logger.info(f"Created base upload directory: {UPLOAD_BASE_DIR}")
    
    # Only create the "non_invoice" folder locally
    local_only_folders = [SUBFOLDERS["non_invoices"]]
    for folder in local_only_folders:
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

def ensure_local_file(file_path: str) -> str:
    """Ensure the file exists locally by downloading from Azure Blob Storage if missing."""
    if not file_path:
        return file_path
    if os.path.exists(file_path):
        return file_path
        
    from common.services.azure_blob import get_blob_name_from_path, download_blob_to_file
    blob_name = get_blob_name_from_path(file_path)
    
    # Create target parent directory
    parent_dir = os.path.dirname(file_path)
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)
        
    try:
        logger.info(f"Local file {file_path} missing. Downloading from Azure Blob: {blob_name}")
        download_blob_to_file(blob_name, file_path)
        if os.path.exists(file_path):
            return file_path
    except Exception as e:
        logger.error(f"Failed to download missing file from Azure Blob: {e}")
        
    return file_path

def move_invoice_file(current_path: str, target_category: str) -> Optional[str]:
    """
    Move an invoice file to a new subfolder in Azure Blob Storage.
    Only the "non_invoices" category keeps the file in local storage as well.
    For other categories, any local file is deleted after moving in Azure Blob.
    Returns the target path (which aligns with DB records).
    """
    if not current_path:
        return None
    
    # Resolve current absolute path
    if not os.path.isabs(current_path):
        current_abs_path = os.path.abspath(current_path)
    else:
        current_abs_path = current_path
        
    filename = os.path.basename(current_path)
    target_dir = get_folder_path(target_category)
    new_relative_path = os.path.join(target_dir, filename)
    new_abs_path = os.path.abspath(new_relative_path)

    # 1. Move file in Azure Blob Storage
    try:
        from common.services.azure_blob import get_blob_name_from_path, container_client, upload_file_to_blob
        source_blob = get_blob_name_from_path(current_path)
        target_blob = get_blob_name_from_path(new_relative_path)
        
        source_blob_client = container_client.get_blob_client(source_blob)
        
        # Robust lookup: if source blob does not exist directly, search other known prefixes in Azure
        if not source_blob_client.exists():
            from common.config.config import TOOL
            search_folders = ["in_progress_files", "deleted_files", "posted_to_sage_files", "posted_to_zoho_files", "archived_files", "non_invoice", "read", "unread"]
            found = False
            for folder_prefix in search_folders:
                for prefix in [f"{TOOL}/", "sage/", "zoho/", ""]:
                    candidate_blob = f"{prefix}{folder_prefix}/{filename}"
                    candidate_client = container_client.get_blob_client(candidate_blob)
                    if candidate_client.exists():
                        source_blob = candidate_blob
                        source_blob_client = candidate_client
                        found = True
                        break
                if found:
                    break
        
        target_blob_client = container_client.get_blob_client(target_blob)
        
        if source_blob_client.exists():
            data = source_blob_client.download_blob().readall()
            target_blob_client.upload_blob(data, overwrite=True)
            # If the source and target blob are different, delete the source blob
            if source_blob != target_blob:
                source_blob_client.delete_blob()
            logger.info(f"[Azure Blob] Moved blob from {source_blob} to {target_blob}")
        else:
            # Fallback: if the blob is missing in Azure, upload the local file directly if it exists
            local_source = current_abs_path if os.path.exists(current_abs_path) else find_file_in_any_folder(filename)
            if local_source and os.path.exists(local_source):
                upload_file_to_blob(local_source, target_blob)
                logger.info(f"[Azure Blob] Source blob not found. Uploaded local file {local_source} directly to target blob {target_blob}")
            else:
                logger.warning(f"[Azure Blob] Source blob {source_blob} not found and no local file found for moving")
    except Exception as blob_err:
        logger.error(f"[Azure Blob] Failed to move blob: {blob_err}")

    # 2. Local file handling
    local_source = current_abs_path if os.path.exists(current_abs_path) else find_file_in_any_folder(filename)

    if local_source and os.path.exists(local_source):
        if target_category == "non_invoices":
            if os.path.abspath(local_source) != new_abs_path:
                try:
                    os.makedirs(target_dir, exist_ok=True)
                    shutil.move(local_source, new_abs_path)
                    logger.info(f"Moved local file from {local_source} to {new_abs_path} (non_invoices category)")
                except Exception as e:
                    logger.error(f"Failed to move local file to non_invoices folder: {e}")
        else:
            try:
                os.remove(local_source)
                logger.info(f"Deleted local file {local_source} after Azure move (category {target_category})")
            except Exception as e:
                logger.error(f"Failed to delete local file: {e}")

    return new_relative_path

def find_file_in_any_folder(filename: str) -> Optional[str]:
    """Try to find a file in any of the subfolders, staging folders, or root uploads."""
    # 1. Check in root uploads (legacy)
    root_path = os.path.join(UPLOAD_BASE_DIR, filename)
    if os.path.exists(root_path):
        return root_path
    
    # 2. Check in staging read folder
    read_path = os.path.join(UPLOAD_BASE_DIR, "read", filename)
    if os.path.exists(read_path):
        return read_path

    # 3. Check in staging unread folder
    unread_path = os.path.join(UPLOAD_BASE_DIR, "unread", filename)
    if os.path.exists(unread_path):
        return unread_path
    
    # 4. Check in all other subfolders
    for folder in SUBFOLDERS.values():
        path = os.path.join(UPLOAD_BASE_DIR, folder, filename)
        if os.path.exists(path):
            return path
            
    return None
