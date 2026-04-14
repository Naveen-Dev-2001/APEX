import sys
import os

# Add APEX path to sys.path
sys.path.append(r'c:\Users\LDNA40022\Lokesh\APEX\backend')

from app.utils.settings import get_app_settings

settings = get_app_settings()
print(settings['roles'])
