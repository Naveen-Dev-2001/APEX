from azure.storage.blob import BlobServiceClient, ContainerClient, generate_blob_sas, BlobSasPermissions
from datetime import datetime, timedelta, timezone
import os

# Azure Connection Details
CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
CONTAINER_NAME = os.getenv("AZURE_STORAGE_CONTAINER_NAME")

blob_service_client = BlobServiceClient.from_connection_string(CONNECTION_STRING)
container_client = blob_service_client.get_container_client(CONTAINER_NAME)

def upload_file_to_blob(local_path: str, blob_name: str) -> None:
    """Upload a local file to Azure Blob Storage."""
    try:
        blob_client = container_client.get_blob_client(blob_name)
        with open(local_path, "rb") as data:
            blob_client.upload_blob(data, overwrite=True)
    except Exception as e:
        raise RuntimeError(f"Upload failed for {blob_name}: {str(e)}")

def download_blob_to_file(blob_name: str, local_path: str) -> None:
    """Download a blob from Azure Storage to a local file."""
    try:
        blob_client = container_client.get_blob_client(blob_name)
        with open(local_path, "wb") as download_file:
            download_file.write(blob_client.download_blob().readall())
    except Exception as e:
        raise RuntimeError(f"Download failed for {blob_name}: {str(e)}")
		
def get_pdf_link(blob_name: str) -> str:
    """Generate a temporary read-only SAS token URL for a PDF blob."""
    try:
        sas_token = generate_blob_sas(
            account_name=blob_service_client.account_name,
            container_name=CONTAINER_NAME,
            blob_name=blob_name,
            account_key=blob_service_client.credential.account_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        sas_url = f"https://{blob_service_client.account_name}.blob.core.windows.net/{CONTAINER_NAME}/{blob_name}?{sas_token}"
        return sas_url
    except Exception as e:
        raise RuntimeError(f"Failed to generate SAS URL for {blob_name}: {str(e)}")

def delete_blob(blob_name: str) -> None:
    """Delete a blob from the Azure container if it exists."""
    try:
        blob_client = container_client.get_blob_client(blob_name)
        if blob_client.exists():
            blob_client.delete_blob()
    except Exception as e:
        raise RuntimeError(f"Delete failed for {blob_name}: {str(e)}")

def get_blob_name_from_path(file_path: str) -> str:
    """Standardize a file path to its relative blob name prefix."""
    from common.config.config import TOOL
    # Standardize separators
    normalized = file_path.replace("\\", "/")
    # Remove leading backend/ if present
    if normalized.startswith("backend/"):
        normalized = normalized[len("backend/"):]
    # Remove leading uploads/ if present
    if normalized.startswith("uploads/"):
        normalized = normalized[len("uploads/"):]
        
    # If the path already has the tool prefix, don't prepend it again
    if normalized.startswith("sage/") or normalized.startswith("zoho/"):
        return normalized
        
    # Prepend the active tool directory (sage/zoho) to separate their paths in the container
    return f"{TOOL}/{normalized}"

def ensure_container_and_folders() -> None:
    """Ensure the container exists and the five default folders are created in Azure Blob Storage for the active tool."""
    if not CONNECTION_STRING or not CONTAINER_NAME:
        return
    try:
        if not container_client.exists():
            container_client.create_container()
            print(f"Created container: {CONTAINER_NAME}")
        
        from common.config.config import TOOL
        folders = [
            "in_progress_files",
            "deleted_files",
            "posted_to_sage_files" if TOOL == "sage" else "posted_to_zoho_files",
            "archived_files",
            "non_invoice"
        ]
        
        for folder in folders:
            placeholder_blob = f"{TOOL}/{folder}/.placeholder"
            blob_client = container_client.get_blob_client(placeholder_blob)
            if not blob_client.exists():
                blob_client.upload_blob(b"", overwrite=True)
                print(f"Created folder placeholder: {placeholder_blob} in container {CONTAINER_NAME}")
    except Exception as e:
        import logging
        logger = logging.getLogger("application_trace")
        logger.error(f"Error ensuring container/folders for {CONTAINER_NAME}: {str(e)}")
