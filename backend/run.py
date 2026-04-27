import uvicorn
import os

if __name__ == "__main__":
    env = os.getenv("ENV", "development")
    host = "0.0.0.0" if env == "production" else "localhost"
    reload = env != "production"
    uvicorn.run("app.main:app", host=host, port=8014, reload=reload)