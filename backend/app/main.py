from app.auth.jwt import get_current_user
from app.middleware.trace_middleware import TraceMiddleware
from app.routes.approval_new import router as approval_new_router
from app.database.init_db import init_database, seed_api_master_data
from app.database.database import engine, Base
from app.routes import master_data, workflow, approval, admin, settings as settings_route, workflow_config, delegation, audit
from app.routes import auth, invoices, coding, dashboard, currency
from app.routes.auth import sso_router
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, Depends
import os
from pathlib import Path
from dotenv import load_dotenv

# Explicitly load .env from the backend root directory (parent of app)
env_path = Path(__file__).resolve().parent.parent / '.env'
print(f"Loading .env from: {env_path}")
load_dotenv(dotenv_path=env_path, override=True)


app = FastAPI(title="Accounts Payable API", version="1.0.0")

# Register Trace Middleware
app.add_middleware(TraceMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/auth", tags=["authentication"])
app.include_router(sso_router, tags=["sso-authentication"])
app.include_router(invoices.public_router, prefix="/invoices", tags=["invoices"])
app.include_router(invoices.router, prefix="/invoices",
                   tags=["invoices"], dependencies=[Depends(get_current_user)])
app.include_router(coding.router, prefix="/coding",
                   tags=["coding"], dependencies=[Depends(get_current_user)])
app.include_router(dashboard.router, prefix="/dashboard",
                   tags=["dashboard"], dependencies=[Depends(get_current_user)])
app.include_router(master_data.router, prefix="/master",
                   tags=["master-data"], dependencies=[Depends(get_current_user)])
app.include_router(workflow.router, prefix="/workflow",
                   tags=["workflow"], dependencies=[Depends(get_current_user)])

app.include_router(approval.router, prefix="/approval",
                   tags=["approval"], dependencies=[Depends(get_current_user)])
app.include_router(admin.router, prefix="/users",
                   tags=["admin"], dependencies=[Depends(get_current_user)])
app.include_router(settings_route.router, prefix="/settings",
                   tags=["Settings"], dependencies=[Depends(get_current_user)])
app.include_router(currency.router, prefix="/currency",
                   tags=["Currencies"], dependencies=[Depends(get_current_user)])
app.include_router(workflow_config.router, prefix="/workflow-config",
                   tags=["workflow-config"], dependencies=[Depends(get_current_user)])
app.include_router(delegation.router, prefix="/delegations",
                   tags=["delegation"], dependencies=[Depends(get_current_user)])
app.include_router(audit.router, prefix="/api/audit",
                   tags=["audit"], dependencies=[Depends(get_current_user)])

app.include_router(
    approval_new_router,
    dependencies=[Depends(get_current_user)]
)


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    print("\n" + "="*60)
    print("STARTING ACCOUNTS PAYABLE API")
    print("="*60)

    try:
        # Initialize database (create tables and default data)
        init_database()
        print("✓ Database initialized successfully")
    except Exception as e:
        print(f"✗ Startup initialization error: {e}")
        import traceback
        traceback.print_exc()

    print("="*60 + "\n")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("\nShutting down Accounts Payable API...")
    # SQLAlchemy connections are managed by connection pool
    # No explicit cleanup needed


@app.get("/")
async def root():
    return {"message": "Accounts Payable API", "database": "SQL Server"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test database connection
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
