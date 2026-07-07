from azure.storage.blob import BlobServiceClient
 
# Connection configurations
CONNECTION_STRING = "DefaultEndpointsProtocol=https;AccountName=ldnaapex;AccountKey=P7EkK/Mk2KtIUVTrAXi+HVrvpni/k3o45AVrJF/wGXviCrILkcsZr/4osxho8zpqjZmdaH4foVbV+AStXpPI0g==;EndpointSuffix=core.windows.net"
CONTAINER_NAME = "apex-testing"
 
def list_folder_structure(prefix):
    print(f"\n=========================================")
    print(f" Structure for: {prefix}")
    print(f"=========================================")
    try:
        blob_service_client = BlobServiceClient.from_connection_string(CONNECTION_STRING)
        container_client = blob_service_client.get_container_client(CONTAINER_NAME)
       
        blobs = container_client.list_blobs(name_starts_with=prefix)
       
        # Build a tree structure of paths
        files_by_folder = {}
        for blob in blobs:
            # e.g., "sage/in_progress_files/file.pdf"
            parts = blob.name.split('/')
            if len(parts) > 1:
                # The subfolder name (e.g. "in_progress_files")
                subfolder = parts[1]
                filename = "/".join(parts[2:]) if len(parts) > 2 else ""
               
                if subfolder not in files_by_folder:
                    files_by_folder[subfolder] = []
               
                if filename:
                    files_by_folder[subfolder].append(filename)
            else:
                # Top level files within the prefix directory itself
                if "" not in files_by_folder:
                    files_by_folder[""] = []
                files_by_folder[""].append(parts[0])
 
        if not files_by_folder:
            print("No folders or files found.")
            return
 
        for folder, files in sorted(files_by_folder.items()):
            if folder == "":
                for file in sorted(files):
                    print(f" 📄 {file}")
            else:
                print(f" 📂 {folder}/")
                for file in sorted(files):
                    print(f"   📄 {file}")
                   
    except Exception as e:
        print(f"Error listing folder structure: {e}")
 
if __name__ == "__main__":
    # List both Sage and Zoho structures
    list_folder_structure("sage/")
    list_folder_structure("zoho/")
