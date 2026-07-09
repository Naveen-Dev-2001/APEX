"""
Database initialization and bootstrap utilities.
Creates the accounts_payable database if it doesn't exist,
then creates tables and inserts default data.
"""

from sqlalchemy import create_engine, text
from common.database.database import Base, engine, SessionLocal
from common.models.db_models import (
    User, Currency, GlobalSetting, EntityMaster
)
from common.auth.jwt import get_password_hash
from common.config.settings import settings
from datetime import datetime
import json


def create_database_if_not_exists(db_url: str):
    """
    Connect to the 'master' database (which always exists in SQL Server)
    and create the target database if it doesn't already exist.
    This must be done BEFORE SQLAlchemy tries to connect to the target db.
    """

    # Extract the database name from the URL
    parts = db_url.rsplit("/", 1)
    if len(parts) == 2:
        db_name = parts[1].split("?")[0]
        master_url = parts[0] + "/master"
    else:
        raise ValueError(f"Could not parse database name from URL: {db_url}")

    print(f"Connecting to master DB to ensure '{db_name}' exists...")
    try:
        # isolation_level=AUTOCOMMIT is required for CREATE DATABASE
        master_engine = create_engine(master_url, isolation_level="AUTOCOMMIT")
        with master_engine.connect() as conn:
            result = conn.execute(
                text(f"SELECT COUNT(*) FROM sys.databases WHERE name = '{db_name}'")
            )
            count = result.scalar()
            if count == 0:
                conn.execute(text(f"CREATE DATABASE {db_name}"))
                print(f"SUCCESS: Database '{db_name}' created successfully")
            else:
                print(f"SUCCESS: Database '{db_name}' already exists")
        master_engine.dispose()
    except Exception as e:
        print(f"ERROR: Failed to create database: {e}")
        raise


def _add_column_if_not_exists(conn, table_name: str, column_name: str, column_def: str):
    """Check if column exists in the table, if not, add it."""
    result = conn.execute(text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE LOWER(TABLE_NAME) = :table_name AND LOWER(COLUMN_NAME) = :column_name"
    ), {"table_name": table_name.lower(), "column_name": column_name.lower()})
    if result.scalar() == 0:
        conn.execute(text(f"ALTER TABLE {table_name} ADD {column_name} {column_def}"))
        print(f"SUCCESS: Added column '{column_name}' ({column_def}) to table '{table_name}'")


def create_tables(engine_obj, base_obj):
    """Create all database tables and schema migrations"""
    print("Creating database tables...")
    base_obj.metadata.create_all(bind=engine_obj)
    
    # Run manual migrations if required
    try:
        with engine_obj.connect() as conn:
            # Check users columns
            _add_column_if_not_exists(conn, "users", "department", "NVARCHAR(100) NULL")
            _add_column_if_not_exists(conn, "users", "email_notifications", "BIT NOT NULL DEFAULT 1")

            # Check gl_master columns
            _add_column_if_not_exists(conn, "gl_master", "account_name", "NVARCHAR(200) NULL")
            _add_column_if_not_exists(conn, "gl_master", "account_code", "NVARCHAR(100) NULL")
            _add_column_if_not_exists(conn, "gl_master", "account_type", "NVARCHAR(100) NULL")

            # Check vendor_master columns (Zoho specific and new fields)
            _add_column_if_not_exists(conn, "vendor_master", "company_name", "NVARCHAR(200) NULL")
            _add_column_if_not_exists(conn, "vendor_master", "display_name", "NVARCHAR(200) NULL")
            _add_column_if_not_exists(conn, "vendor_master", "email_id", "NVARCHAR(255) NULL")
            _add_column_if_not_exists(conn, "vendor_master", "phone", "NVARCHAR(50) NULL")
            _add_column_if_not_exists(conn, "vendor_master", "currency_code", "NVARCHAR(10) NULL")
            _add_column_if_not_exists(conn, "vendor_master", "payment_terms_label", "NVARCHAR(100) NULL")
            _add_column_if_not_exists(conn, "vendor_master", "billing_address", "NVARCHAR(MAX) NULL")

            # Check customer_master columns (Zoho specific and new fields)
            _add_column_if_not_exists(conn, "customer_master", "company_name", "NVARCHAR(200) NULL")
            _add_column_if_not_exists(conn, "customer_master", "display_name", "NVARCHAR(200) NULL")
            _add_column_if_not_exists(conn, "customer_master", "email_id", "NVARCHAR(255) NULL")
            _add_column_if_not_exists(conn, "customer_master", "phone", "NVARCHAR(50) NULL")
            _add_column_if_not_exists(conn, "customer_master", "currency_code", "NVARCHAR(10) NULL")
            _add_column_if_not_exists(conn, "customer_master", "billing_address", "NVARCHAR(MAX) NULL")
            _add_column_if_not_exists(conn, "customer_master", "billing_street2", "NVARCHAR(255) NULL")
            _add_column_if_not_exists(conn, "customer_master", "billing_city", "NVARCHAR(100) NULL")

                        # Check bank_statements columns
            _add_column_if_not_exists(
                conn,
                "bank_statements",
                "account_number",
                "NVARCHAR(100) NULL"
            )
            _add_column_if_not_exists(
                conn,
                "bank_statements",
                "statement_month",
                "NVARCHAR(7) NULL"
            )

            # Check bank_accounts columns
            _add_column_if_not_exists(
                conn,
                "bank_accounts",
                "bank_id",
                "NVARCHAR(100) NULL"
            )
            _add_column_if_not_exists(
                conn,
                "bank_accounts",
                "bank_name",
                "NVARCHAR(255) NULL"
            )
            _add_column_if_not_exists(
                conn,
                "bank_accounts",
                "account_number",
                "NVARCHAR(100) NULL"
            )
            _add_column_if_not_exists(
                conn,
                "bank_accounts",
                "account_name",
                "NVARCHAR(255) NULL"
            )
            _add_column_if_not_exists(
                conn,
                "bank_accounts",
                "gl_account",
                "NVARCHAR(100) NULL"
            )
            _add_column_if_not_exists(
                conn,
                "bank_accounts",
                "gl_account_title",
                "NVARCHAR(255) NULL"
            )
            _add_column_if_not_exists(
                conn,
                "bank_accounts",
                "currency_code",
                "NVARCHAR(10) NULL"
            )
            _add_column_if_not_exists(
                conn,
                "bank_accounts",
                "is_active",
                "BIT NOT NULL DEFAULT 1"
            )
            _add_column_if_not_exists(
                conn,
                "bank_accounts",
                "source",
                "NVARCHAR(50) NOT NULL DEFAULT 'upload'"
            )
            _add_column_if_not_exists(
                conn,
                "bank_accounts",
                "created_at",
                "DATETIME NULL"
            )
            _add_column_if_not_exists(
                conn,
                "bank_accounts",
                "updated_at",
                "DATETIME NULL"
            )

            # Check sage_gl_transaction_cache columns
            _add_column_if_not_exists(
                conn,
                "sage_gl_transaction_cache",
                "entry_date",
                "DATE NULL"
            )
            _add_column_if_not_exists(
                conn,
                "sage_gl_transaction_cache",
                "doc_number",
                "NVARCHAR(100) NULL"
            )
            _add_column_if_not_exists(
                conn,
                "sage_gl_transaction_cache",
                "vendor",
                "NVARCHAR(200) NULL"
            )
            _add_column_if_not_exists(
                conn,
                "sage_gl_transaction_cache",
                "customer",
                "NVARCHAR(200) NULL"
            )
            _add_column_if_not_exists(
                conn,
                "sage_gl_transaction_cache",
                "record_type",
                "NVARCHAR(100) NULL"
            )
            _add_column_if_not_exists(
                conn,
                "sage_gl_transaction_cache",
                "cleared",
                "NVARCHAR(50) NULL"
            )
            _add_column_if_not_exists(
                conn,
                "sage_gl_transaction_cache",
                "tr_type",
                "NVARCHAR(50) NULL"
            )
            _add_column_if_not_exists(
                conn,
                "sage_gl_transaction_cache",
                "bank",
                "NVARCHAR(100) NULL"
            )

            # Explicitly commit the changes
            conn.commit()
            print("SUCCESS: Database schema migrations completed successfully")
    except Exception as e:
        print(f"Migration error (might be expected if table newly created): {e}")

    print("SUCCESS: All tables created successfully")


def create_admin_user(db, settings_obj):
    """Create default admin user if not exists"""
    existing_admin = db.query(User).filter(User.email == settings_obj.ADMIN_EMAIL).first()
    
    if not existing_admin:
        admin_user = User(
            username=settings_obj.ADMIN_USERNAME,
            email=settings_obj.ADMIN_EMAIL,
            password=get_password_hash(settings_obj.ADMIN_PASSWORD),
            role="admin",
            status="active",
            created_at=datetime.utcnow()
        )
        db.add(admin_user)
        db.commit()
        print(f"SUCCESS: Admin user created: {settings_obj.ADMIN_EMAIL}")
    else:
        print(f"SUCCESS: Admin user already exists: {settings_obj.ADMIN_EMAIL}")


def create_default_currencies(db):
    """Create default currencies if not exists"""
    default_currencies = [
        {"code": "USD", "name": "US Dollar", "symbol": "$", "exchange_rate": 1.0},
        {"code": "EUR", "name": "Euro", "symbol": "€", "exchange_rate": 0.85},
        {"code": "GBP", "name": "British Pound", "symbol": "£", "exchange_rate": 0.73},
        {"code": "INR", "name": "Indian Rupee", "symbol": "₹", "exchange_rate": 83.0},
        {"code": "CAD", "name": "Canadian Dollar", "symbol": "C$", "exchange_rate": 1.35},
        {"code": "AUD", "name": "Australian Dollar", "symbol": "A$", "exchange_rate": 1.52},
    ]
    
    existing_count = db.query(Currency).count()
    
    if existing_count == 0:
        for curr_data in default_currencies:
            currency = Currency(**curr_data)
            db.add(currency)
        db.commit()
        print(f"SUCCESS: Created {len(default_currencies)} default currencies")
    else:
        print(f"SUCCESS: Currencies already exist ({existing_count} currencies)")


def create_default_settings(db):
    """Create default global settings if not exists"""
    default_settings = {
        "roles": ["admin", "coder", "approver", "scanner"],
        "statuses": ["active", "pending", "rejected"],
        "navigation": [
            {"label": "Dashboard", "path": "/dashboard", "roles": ["all"]},
            {"label": "Invoices", "path": "/invoices", "roles": ["coder", "approver", "scanner"]},
            {"label": "Coding", "path": "/coding", "roles": ["coder"]},
            {"label": "Approvals", "path": "/approvals", "roles": ["approver"]},
            {"label": "Master Data", "path": "/master-data", "roles": ["admin","scanner","coder"]},
            {"label": "Settings", "path": "/settings", "roles": ["admin"]},
            {"label": "Admin", "path": "/admin", "roles": ["admin"]}
        ]
    }
    
    existing_setting = db.query(GlobalSetting).filter(
        GlobalSetting.setting_key == "app_settings"
    ).first()
    
    if not existing_setting:
        setting = GlobalSetting(
            setting_key="app_settings",
            setting_value=json.dumps(default_settings),
            updated_at=datetime.utcnow()
        )
        db.add(setting)
        db.commit()
        print("SUCCESS: Default global settings created")
    else:
        print("SUCCESS: Global settings already exist")


def create_default_entity(db):
    """Create a default entity if entity_master table is empty.
    This placeholder entity is used until a real entity master file is uploaded.
    """
    existing_count = db.query(EntityMaster).count()

    if existing_count == 0:
        default_entity = EntityMaster(
            entity_id="DEFAULT",
            entity_name="Default Entity",
            registered_address="",
            address_line1="",
            address_line2="",
            address_line3="",
            city="",
            state_or_territory="",
            zip_or_postal_code="",
            country_code="",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(default_entity)
        db.commit()
        print("SUCCESS: Default entity created (entity_id='DEFAULT') — replace by uploading an entity master file")
    else:
        print(f"SUCCESS: Entity master already has {existing_count} record(s), skipping default")


def init_database(db_url=None, engine_obj=None, SessionLocal_cls=None, base_obj=None, settings_obj=None):
    """
    Initialize the database with tables and default data.
    This should be called on application startup.
    """
    # Use defaults if not provided
    if db_url is None:
        db_url = settings.DATABASE_URL
    if engine_obj is None:
        engine_obj = engine
    if SessionLocal_cls is None:
        SessionLocal_cls = SessionLocal
    if base_obj is None:
        base_obj = Base
    if settings_obj is None:
        settings_obj = settings

    print("\n" + "="*50)
    print(f"DATABASE INITIALIZATION for {db_url.rsplit('/', 1)[-1].split('?')[0]}")
    print("="*50 + "\n")

    # Step 1: Ensure the 'accounts_payable' database exists in SQL Server.
    # SQL Server Docker images only ship with 'master'; we must create our DB
    # BEFORE the main engine (which points to accounts_payable) is first used.
    create_database_if_not_exists(db_url)

    # Step 2: Create all ORM tables
    create_tables(engine_obj, base_obj)
    
    # Create session for data insertion
    db = SessionLocal_cls()
    try:
        # Create default data
        create_admin_user(db, settings_obj)
        create_default_currencies(db)
        create_default_settings(db)
        create_default_entity(db)
        
        print("\n" + "="*50)
        print("SUCCESS: DATABASE INITIALIZATION COMPLETE")
        print("="*50 + "\n")
        
    except Exception as e:
        print(f"ERROR: Error during initialization: {e}")
        db.rollback()
        raise
    finally:
        db.close()


async def seed_api_master_data(db, force=False):
    """
    Seed master data from Sage Intacct.
    If force=False (default), it only seeds if tables are empty.
    If force=True, it syncs regardless of current data.
    Calls sync services for Vendors, GL, LOB, Items, Departments, and Customers.
    """
    from common.utils.erp_locator import get_erp_class
    VendorSyncService = get_erp_class("services.vendor_sync_service", "VendorSyncService")
    
    GLSyncService = get_erp_class("services.master_sync_services", "GLSyncService")
    LOBSyncService = get_erp_class("services.master_sync_services", "LOBSyncService")
    DepartmentSyncService = get_erp_class("services.master_sync_services", "DepartmentSyncService")
    CustomerSyncService = get_erp_class("services.master_sync_services", "CustomerSyncService")
    ItemSyncService = get_erp_class("services.master_sync_services", "ItemSyncService")
    ExchangeRateSyncService = get_erp_class("services.master_sync_services", "ExchangeRateSyncService")
    EntitySyncService = get_erp_class("services.master_sync_services", "EntitySyncService")
    from common.models.db_models import (
        VendorMaster, GLMaster, LOBMaster, ItemMaster, DepartmentMaster, CustomerMaster, ExchangeRateMaster,
        EntityMaster
    )

    masters = [
        (EntityMaster, EntitySyncService, "sync_entities"),
        (VendorMaster, VendorSyncService, "sync_vendors"),
        (GLMaster, GLSyncService, "sync_gl_accounts"),
        (LOBMaster, LOBSyncService, "sync_lob"),
        (ItemMaster, ItemSyncService, "sync_items"),
        (DepartmentMaster, DepartmentSyncService, "sync_departments"),
        (CustomerMaster, CustomerSyncService, "sync_customers"),
        (ExchangeRateMaster, ExchangeRateSyncService, "sync_exchange_rates")
    ]

    print("\n" + "-"*30)
    print("SYNCING MASTER DATA FROM SAGE" if force else "SEEDING MASTER DATA FROM SAGE")
    print("-"*30)

    for model, service_class, sync_method in masters:
        try:
            count = db.query(model).count()
            if count == 0 or force:
                action = "Syncing" if force else "Seeding"
                print(f"→ {action} {model.__name__}...")
                service = service_class(db)
                sync_func = getattr(service, sync_method)
                await sync_func()
                new_count = db.query(model).count()
                print(f"  SUCCESS: {model.__name__} {action.lower()} completed ({new_count} records)")
            else:
                print(f"SUCCESS: {model.__name__} already has {count} records, skipping seed (use force to re-sync)")
        except Exception as e:
            print(f"  ERROR: Error checking/syncing {model.__name__}: {e}")
    
    print("-"*30 + "\n")


if __name__ == "__main__":
    # Run initialization when script is executed directly
    init_database()
