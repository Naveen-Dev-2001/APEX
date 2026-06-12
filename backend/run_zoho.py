import uvicorn
import os
from dotenv import load_dotenv

if __name__ == "__main__":
    os.environ["TOOL"] = "zoho"   # Must be set before importing app modules
    load_dotenv(".env.zoho", override=True)
    uvicorn.run("common.main:app", host="0.0.0.0", port=8015, reload=True)
