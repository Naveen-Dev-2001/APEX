import os
from dotenv import load_dotenv
from common.config.config import TOOL, ACTIVE_CONFIG  # noqa: E402 — central tool config

load_dotenv()


class Settings:
    # -----------------------------------------------------------------------
    # Active tool: "sage" or "zoho" — driven by the TOOL environment variable.
    # Port and DB name are resolved via ACTIVE_CONFIG from config.py.
    # -----------------------------------------------------------------------
    TOOL: str = TOOL
    FRONTEND_PORT: int = ACTIVE_CONFIG["frontend_port"]
    BACKEND_PORT: int = ACTIVE_CONFIG["backend_port"]
    ERP_NAME: str = ACTIVE_CONFIG["erp_name"]

    # SQL Server Database URL — set per tool in .env.sage / .env.zoho
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

    # App Settings — BASE_URL should match the frontend origin for the active tool
    BASE_URL: str = os.getenv(
        "BASE_URL",
        f"http://localhost:{ACTIVE_CONFIG['frontend_port']}"
    )

    # Sage Intacct API — only used when TOOL=sage (configured via .env.sage)
    SAGE_TOKEN_URL: str = os.getenv("SAGE_TOKEN_URL", "https://api.intacct.com/ia/api/v1/oauth2/token")
    SAGE_BASE_URL: str = os.getenv("SAGE_BASE_URL", "https://api.intacct.com/ia/api/v1")
    SAGE_CLIENT_ID: str = os.getenv("SAGE_CLIENT_ID")
    SAGE_CLIENT_SECRET: str = os.getenv("SAGE_CLIENT_SECRET")
    SAGE_USERNAME: str = os.getenv("SAGE_USERNAME")
    ATTACHMENT_FOLDER_KEY: str = os.getenv("ATTACHMENT_FOLDER_KEY")


settings = Settings()