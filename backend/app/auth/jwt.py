from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config.settings import settings
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.models.db_models import User as UserDB
from app.repository.repositories import user_repo
from app.models.user import UserResponse
from typing import Optional

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def verify_token(token: str, expected_type: str = "access"):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        token_type: str = payload.get("type")
        
        # Backward compatibility for tokens without type claim (default to access)
        if token_type and token_type != expected_type:
             return None
             
        email: str = payload.get("sub")
        if email is None:
            return None
        return email
    except JWTError:
        return None

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(
    token: str = Depends(oauth2_scheme), 
    db: Session = Depends(get_db),
    x_active_role: Optional[str] = Header(None)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    email = verify_token(token)
    if email is None:
        raise credentials_exception
        
    user_list = user_repo.get_multi(db, filters={"email": email}, limit=1)
    user = user_list[0] if user_list else None
    if user is None:
        raise credentials_exception
            
    # Determine which role to return in the response
    # If the user has multiple roles (comma separated) and an active role is specified, use it.
    actual_role = user.role
    if x_active_role and user.role and x_active_role in user.role.split(','):
        actual_role = x_active_role
    elif user.role and ',' in user.role:
        # Default to first role if multiple but none specified
        actual_role = user.role.split(',')[0]

    user_response = UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        created_at=user.created_at,
        role=actual_role,
        status=user.status
    )
        
    return user_response
