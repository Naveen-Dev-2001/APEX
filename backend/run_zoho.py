import uvicorn
import os
from dotenv import load_dotenv

if __name__ == "__main__":
    load_dotenv(".env.zoho")
    uvicorn.run("common.main:app", host="0.0.0.0", port=8015, reload=True)
