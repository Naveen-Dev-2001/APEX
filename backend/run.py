import uvicorn
import os
from dotenv import load_dotenv

if __name__ == "__main__":
    load_dotenv()
    port = int(os.getenv("BACKEND_PORT", 8014))
    uvicorn.run("common.main:app", host="0.0.0.0", port=port, reload=True)