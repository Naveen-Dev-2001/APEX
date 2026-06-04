from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.models.auth import LoginRequest, Token, CheckEmailRequest, ResetPasswordRequest, SendOTPRequest, VerifyOTPRequest, ChangePasswordFirstTimeRequest
from app.models.user import User as UserPydantic, UserResponse
from app.models.db_models import User as UserDB
from app.repository.repositories import user_repo, otp_repo
from app.database.database import get_db
from app.auth.jwt import verify_password, get_password_hash, create_access_token, create_refresh_token, verify_token, get_current_user
from app.services.email_service import email_service
from app.services.otp_service import otp_service
from datetime import datetime, timedelta
from app.utils.date_utils import get_ist_now
from app.config.settings import settings
from dotenv import load_dotenv
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi import FastAPI, HTTPException, Body, Query, Request
import os
import random
import urllib.parse
import base64
import zlib
import xmltodict
import uuid
import logging

logger = logging.getLogger("app")

SSO_TEMP_STORE = {}
SSO_TOKEN_TTL = 60

router = APIRouter()

sso_router = APIRouter()


class SSOVerifyModel(BaseModel):
    token: str


@router.post("/send-otp")
async def send_otp(request: SendOTPRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # If purpose is forgot_password, check if email exists
    if request.purpose == "forgot_password":
        user = user_repo.get_multi(
            db, filters={"email": request.email}, limit=1)
        if not user:
            raise HTTPException(status_code=404, detail="Email not found")

    otp = otp_service.create_otp_record(db, request.email, request.purpose)

    user_list = user_repo.get_multi(
        db, filters={"email": request.email}, limit=1)
    user = user_list[0] if user_list else None
    background_tasks.add_task(email_service.send_forgot_password_otp,
                              request.email, user.username if user else "User", otp)

    return {"message": "OTP sent successfully"}


@router.post("/verify-otp")
async def verify_otp(request: VerifyOTPRequest, db: Session = Depends(get_db)):
    valid = otp_service.verify_otp(
        db, request.email, request.otp_code, request.purpose)
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    return {"message": "OTP verified successfully"}





@router.post("/login", response_model=Token)
async def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    # Find user by email
    user_list = user_repo.get_multi(
        db, filters={"email": login_data.email}, limit=1)
    user = user_list[0] if user_list else None

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email id not registered"
        )

    if not verify_password(login_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password"
        )

    # Check status
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account {user.status}. Please contact administrator."
        )

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    refresh_token = create_refresh_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    )
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "id": getattr(user, 'id', None),
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "department": getattr(user, 'department', None),
        "ispasswordchange": user.ispasswordchange,
        "email_notifications": getattr(user, 'email_notifications', True)
    }


@router.post("/refresh", response_model=Token)
async def refresh_token_endpoint(refresh_token: str, db: Session = Depends(get_db)):
    email = verify_token(refresh_token, expected_type="refresh")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    # Find user by email
    user_list = user_repo.get_multi(db, filters={"email": email}, limit=1)
    user = user_list[0] if user_list else None

    if not user or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    # Optionally issue a new refresh token (refresh token rotation)
    new_refresh_token = create_refresh_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    )

    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "username": user.username,
        "role": user.role,
        "ispasswordchange": user.ispasswordchange,
        "email_notifications": getattr(user, 'email_notifications', True)
    }


@router.post("/change-password-first-time")
async def change_password_first_time(request: ChangePasswordFirstTimeRequest, db: Session = Depends(get_db)):
    user_list = user_repo.get_multi(
        db, filters={"email": request.email}, limit=1)
    user = user_list[0] if user_list else None
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    hashed_password = get_password_hash(request.new_password)
    user_repo.update(db, db_obj=user, obj_in={
                     "password": hashed_password, "ispasswordchange": True})

    return {"message": "Password updated successfully"}


@router.post("/check-email")
async def check_email(request: CheckEmailRequest, db: Session = Depends(get_db)):
    try:
        user_list = user_repo.get_multi(
            db, filters={"email": request.email}, limit=1)
        if not user_list:
            return {"exists": False, "message": "Email does not exist"}
        return {"exists": True, "message": "Email exists"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    # Check if OTP was verified
    if not otp_service.is_verified(db, request.email, "forgot_password"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP not verified for this email."
        )

    user_list = user_repo.get_multi(
        db, filters={"email": request.email}, limit=1)
    user = user_list[0] if user_list else None
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    hashed_password = get_password_hash(request.new_password)
    user_repo.update(db, db_obj=user, obj_in={"password": hashed_password, "ispasswordchange": True})

    return {"message": "Password updated successfully"}


@router.post("/toggle-email-notifications")
async def toggle_email_notifications(
    enabled: bool,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    user = user_repo.get(db, int(current_user.id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_repo.update(db, db_obj=user, obj_in={"email_notifications": enabled})
    return {"message": f"Email notifications {'enabled' if enabled else 'disabled'}", "email_notifications": enabled}


@sso_router.get("/ValidateAzureAD")
async def login():
    print("************************* Azure AD Login Triggered *************************")

    load_dotenv()

    tenant_id = os.environ['TENANT_ID']
    number = random.randint(100000, 999999)
    unique_id = f"_{number}"
    issue_instant = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    sso_login_url = f"https://login.microsoftonline.com/{tenant_id}/saml2"
    sso_reply_url = os.environ['SSO_REPLY_URL']
    print(f"Using SSO Reply URL: {sso_reply_url}")

    # http://incomeanalyzer/api/SSOReplyURI
    # http://localhost:4000/api/SSOReplyURI
    # http://localhost:4000/api/SSOReplyURI

    application_base_url = "APEX_SSO"
    # application_base_url = "IncomeCalculator"

    xml = f"""<samlp:AuthnRequest
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="{unique_id}"
    Version="2.0"
    IssueInstant="{issue_instant}"
    Destination="{sso_login_url}"
    AssertionConsumerServiceURL="{sso_reply_url}"
    ForceAuthn="false">
    <saml:Issuer>{application_base_url}</saml:Issuer>
    <samlp:NameIDPolicy
        Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        AllowCreate="true"/>
</samlp:AuthnRequest>"""

    def deflate_raw(data: bytes) -> bytes:
        compressor = zlib.compressobj(level=9, wbits=-15)
        compressed = compressor.compress(data)
        compressed += compressor.flush()
        return compressed

    xml_bytes = xml.encode("utf-8")
    deflated = deflate_raw(xml_bytes)
    base64_encoded = base64.b64encode(deflated).decode("utf-8")
    url_encoded = urllib.parse.quote(base64_encoded)

    relay_state = "Apex"
    redirect_url = f"{sso_login_url}?SAMLRequest={url_encoded}&RelayState={urllib.parse.quote(relay_state)}"

    print(f"Redirecting to: {redirect_url}")

    return RedirectResponse(url=redirect_url)


@sso_router.post("/SSOReplyURI")
async def SSOReplyURI(
    req: Request,
    db: Session = Depends(get_db)
):
    print("************************* SSO Reply Received *************************")
    form = await req.form()
    saml_response = form.get("SAMLResponse")

    load_dotenv()

    if not saml_response:
        print("[SSO] Missing SAMLResponse in form data")
        raise HTTPException(
            status_code=400,
            detail="Missing SAMLResponse"
        )

    decoded_xml = base64.b64decode(saml_response).decode("utf-8")
    parsed = xmltodict.parse(decoded_xml)

    response = (
        parsed.get("samlp:Response") or
        parsed.get("saml2p:Response") or
        parsed.get("Response") or
        parsed.get("{urn:oasis:names:tc:SAML:2.0:protocol}Response")
    )

    if not response:
        print("[SSO] Invalid SAML response - no response key found")
        raise HTTPException(
            status_code=400,
            detail="Invalid SAML response"
        )

    assertion = (
        response.get("saml:Assertion") or
        response.get("saml2:Assertion") or
        response.get("Assertion") or
        response.get("{urn:oasis:names:tc:SAML:2.0:assertion}Assertion")
    )

    if not assertion:
        encrypted = (
            response.get("saml:EncryptedAssertion") or
            response.get("saml2:EncryptedAssertion") or
            response.get("EncryptedAssertion")
        )

        if encrypted:
            print("[SSO] EncryptedAssertion received - decryption not supported")

            raise HTTPException(
                status_code=400,
                detail="EncryptedAssertion received. Disable encryption or decrypt it."
            )

        print("[SSO] SAML Assertion missing from response")

        raise HTTPException(
            status_code=400,
            detail="SAML Assertion missing"
        )

    attr_stmt = (
        assertion.get("saml:AttributeStatement", {}) or
        assertion.get("saml2:AttributeStatement", {}) or
        assertion.get("AttributeStatement", {})
    )

    attributes = (
        attr_stmt.get("saml:Attribute", []) or
        attr_stmt.get("saml2:Attribute", []) or
        attr_stmt.get("Attribute", [])
    )

    if isinstance(attributes, dict):
        attributes = [attributes]

    sso_email = None

    for attr in attributes:
        name = attr.get("@Name", "")

        if "email" in name.lower() or "mail" in name.lower():

            attr_value = (
                attr.get("saml:AttributeValue") or
                attr.get("saml2:AttributeValue") or
                attr.get("AttributeValue")
            )

            print(f"Found email attribute value: {attr_value}")

            if isinstance(attr_value, dict):
                sso_email = (
                    attr_value.get("#text") or
                    attr_value.get("text")
                )

            elif isinstance(attr_value, str):
                sso_email = attr_value

            elif isinstance(attr_value, list) and len(attr_value) > 0:
                first_val = attr_value[0]

                if isinstance(first_val, dict):
                    sso_email = (
                        first_val.get("#text") or
                        first_val.get("text")
                    )
                else:
                    sso_email = first_val

            if sso_email:
                break

    if not sso_email:
        print("[SSO] Email not found in SAML attributes")

        print(
            "Available attributes:",
            [attr.get("@Name", "unknown") for attr in attributes]
        )

        raise HTTPException(
            status_code=400,
            detail="SSO email not found"
        )

    sso_email = sso_email.lower()

    # SQL DATABASE CHECK
    existing_user = (
        db.query(UserDB)
        .filter(
            UserDB.email == sso_email,
            UserDB.status == "active"
        )
        .first()
    )

    print(
        f"SSO login attempt for email: {sso_email}. "
        f"Active user exists: {bool(existing_user)}"
    )

    if not existing_user:
        print(
            f"[SSO] Access denied - inactive or unregistered email: {sso_email}"
        )

        raise HTTPException(
            status_code=403,
            detail="Access denied. Your account is either not registered or inactive."
        )

    temp_token = str(uuid.uuid4())

    SSO_TEMP_STORE[temp_token] = {
        "email": sso_email,
        "expires": datetime.utcnow() + timedelta(seconds=SSO_TOKEN_TTL)
    }

    print(f"[SSO] Temp token generated for: {sso_email}")

    FRONTEND_URL = os.environ['FRONTEND_URL']

    frontend_url = f"{FRONTEND_URL}/sso?token={temp_token}"

    print(f"[SSO] Redirecting to frontend: {frontend_url}")

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta http-equiv="refresh" content="0; url={frontend_url}">
        <title>Redirecting...</title>
    </head>
    <body>
        <p>Redirecting to chat...</p>

        <script>
            window.location.href = "{frontend_url}";
        </script>
    </body>
    </html>
    """

    return HTMLResponse(content=html_content)


@sso_router.post("/sso-exchange")
async def sso_exchange(
    payload: SSOVerifyModel,
    db: Session = Depends(get_db)
):
    try:
        token = payload.token

        if not token or not token.strip():
            print("[SSO] Exchange attempted with missing token")

            raise HTTPException(
                status_code=400,
                detail="Token is required"
            )

        data = SSO_TEMP_STORE.pop(token, None)

        if not data:
            print(f"[SSO] Invalid token attempted: {token[:8]}...")

            raise HTTPException(
                status_code=401,
                detail="Invalid SSO token"
            )

        if data["expires"] < datetime.utcnow():
            print(f"[SSO] Expired token for email: {data.get('email')}")

            raise HTTPException(
                status_code=401,
                detail="SSO token has expired"
            )

        email = data.get("email")

        if not email:
            print("[SSO] Token data missing email field")

            raise HTTPException(
                status_code=500,
                detail="Malformed SSO token data"
            )

        # CREATE JWT TOKENS
        try:
            access_token = create_access_token(
                {"sub": email, "email": email}
            )

            refresh_token = create_refresh_token(
                {"sub": email, "email": email}
            )

        except Exception as e:
            print(f"[SSO] Token generation failed for {email}: {str(e)}")

            raise HTTPException(
                status_code=500,
                detail="Failed to generate authentication tokens"
            )

        # SQL DATABASE CHECK
        try:
            user = (
                db.query(UserDB)
                .filter(
                    UserDB.email == email,
                    UserDB.status == "active"
                )
                .first()
            )

        except Exception as e:
            print(f"[SSO] Database error for {email}: {str(e)}")

            raise HTTPException(
                status_code=503,
                detail="Database unavailable, please try again"
            )

        if not user:
            print(f"[SSO] Active user not found in DB: {email}")

            raise HTTPException(
                status_code=404,
                detail="User account not found or inactive"
            )

        if not user.username:
            print(f"[SSO] Username missing for: {email}")

            raise HTTPException(
                status_code=500,
                detail="User account is incomplete"
            )

        print(f"[SSO] Exchange successful for: {email}")

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "email": email,
            "role": user.role if user.role else "User",
            "status": user.status if user.status else "active",
            "is_first_time_user": getattr(user, "is_first_time_user", False),
            "username": user.username,
            "email_notifications": getattr(user, 'email_notifications', True)
        }

    except HTTPException:
        raise

    except Exception as e:
        print(f"❌ [SSO] Unexpected error: {str(e)}")

        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred during SSO login"
        )
