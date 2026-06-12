import os
from dotenv import load_dotenv

# Explicitly load the .env.zoho file
load_dotenv(".env.zoho")

class ZohoSettings:
    # Read the ZOHO_DATABASE_URL
    ZOHO_DATABASE_URL: str = os.getenv("ZOHO_DATABASE_URL")

zoho_settings = ZohoSettings()
