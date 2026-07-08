import os
from pathlib import Path
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Load the correct .env.<tool> file FIRST — before importing config.py or
# reading any os.getenv() values. This is critical for uvicorn reload worker
# processes: they spawn a fresh interpreter where no env has been pre-loaded.
#
# Resolution order:
#   1. TOOL already set in the OS environment (e.g. by run_sage.py / run_zoho.py
#      or the user's shell) → use that value.
#   2. Default to "sage".
# ---------------------------------------------------------------------------
# Preserve pre-existing TOOL from OS environment if set
_pre_existing_tool = os.getenv("TOOL") or os.getenv("Tool")

# Directly load the common .env file from the backend directory
_env_file = Path(__file__).resolve().parents[2] / ".env"
if _env_file.exists():
    load_dotenv(dotenv_path=_env_file, override=True)
else:
    load_dotenv()

# Read active TOOL, preferring pre-existing OS environment variable
_tool_name = _pre_existing_tool or os.getenv("TOOL") or os.getenv("Tool") or "sage"
_tool_name = _tool_name.lower()
os.environ["TOOL"] = _tool_name

# Now that env vars are populated, import the tool config.
from common.config.config import TOOL, ACTIVE_CONFIG  # noqa: E402


class Settings:
    # -----------------------------------------------------------------------
    # Active tool: "sage" or "zoho" — driven by the TOOL environment variable.
    # Port and DB name are resolved via ACTIVE_CONFIG from config.py.
    # -----------------------------------------------------------------------
    TOOL: str = TOOL

    # SQL Server Database URL — always read directly from DATABASE_URL in .env.
    # To switch tools (sage ↔ zoho), simply change the DB name at the end of
    # DATABASE_URL in .env:
    #   sage  → mssql+pymssql://...@localhost:1433/accounts_payable
    #   zoho  → mssql+pymssql://...@localhost:1433/accounts_payable_zoho
    DATABASE_URL: str = os.getenv("DATABASE_URL")

    # SMTP Settings (credentials should be configured in .env)
    SMTP_SERVER: str = os.getenv("SMTP_SERVER", "smtp.office365.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", 587))
    EMAIL_USER: str = os.getenv("EMAIL_USER")
    EMAIL_PASS: str = os.getenv("EMAIL_PASS")

    # OTP Settings
    OTP_EXPIRY_MINUTES: int = 5

    # JWT Settings (secret key must be configured in .env for production)
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-here")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 360
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    # Admin Defaults (admin password must be set via .env in production)
    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "admin123")
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "admin@example.com")


    # Sage Intacct API — only used when TOOL=sage (configured via .env.sage)
    SAGE_TOKEN_URL: str = os.getenv("SAGE_TOKEN_URL", "https://api.intacct.com/ia/api/v1/oauth2/token")
    SAGE_BASE_URL: str = os.getenv("SAGE_BASE_URL", "https://api.intacct.com/ia/api/v1")
    SAGE_CLIENT_ID: str = os.getenv("SAGE_CLIENT_ID")
    SAGE_CLIENT_SECRET: str = os.getenv("SAGE_CLIENT_SECRET")
    SAGE_USERNAME: str = os.getenv("SAGE_USERNAME")
    ATTACHMENT_FOLDER_KEY: str = os.getenv("ATTACHMENT_FOLDER_KEY")

    # Zoho Books API — only used when TOOL=zoho (configured via .env.zoho)
    ZOHO_CLIENT_ID: str = os.getenv("ZOHO_CLIENT_ID")
    ZOHO_CLIENT_SECRET: str = os.getenv("ZOHO_CLIENT_SECRET")
    ZOHO_REFRESH_TOKEN: str = os.getenv("ZOHO_REFRESH_TOKEN")
    ZOHO_ORG_ID: str = os.getenv("ZOHO_ORG_ID")
    ZOHO_TOKEN_URL: str = os.getenv("ZOHO_TOKEN_URL", "https://accounts.zoho.com/oauth/v2/token")
    ZOHO_API_BASE: str = os.getenv("ZOHO_API_BASE", "https://www.zohoapis.com/books/v3")


settings = Settings()
