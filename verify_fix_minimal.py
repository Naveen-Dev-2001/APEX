import sys
import os
from sqlalchemy import create_engine

# Path setup
backend_path = r"c:\Users\LDNA40022\Lokesh\APEX\backend"
sys.path.append(backend_path)

from app.models.db_models import Base
from app.config.settings import settings

engine = create_engine(settings.DATABASE_URL)

try:
    print("Attempting to create tables...")
    Base.metadata.create_all(bind=engine)
    print("✓ Tables created successfully!")
except Exception as e:
    print(f"✗ Error: {e}")
