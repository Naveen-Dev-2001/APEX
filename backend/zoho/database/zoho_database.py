from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from zoho.config.zoho_settings import zoho_settings
from typing import Generator

# Create SQLAlchemy engine for Zoho
zoho_engine = create_engine(
    zoho_settings.ZOHO_DATABASE_URL,
    pool_pre_ping=True,  # Enable connection health checks
    pool_size=10,  # Connection pool size
    max_overflow=20,  # Maximum overflow connections
    echo=False,  # Set to True for SQL query logging during development
)

# Create SessionLocal class for Zoho
ZohoSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=zoho_engine)

# Base class for Zoho declarative models (if a separate one is needed)
ZohoBase = declarative_base()

def get_zoho_db() -> Generator[Session, None, None]:
    """
    Dependency function to get Zoho database session.
    Yields a database session and ensures it's closed after use.
    """
    db = ZohoSessionLocal()
    try:
        yield db
    finally:
        db.close()
