import uvicorn
import os
from dotenv import load_dotenv

if __name__ == "__main__":
    os.environ["TOOL"] = "sage"   # Must be set before importing app modules
    load_dotenv(".env.sage", override=True)
    uvicorn.run("common.main:app", host="0.0.0.0", port=8014, reload=True)
