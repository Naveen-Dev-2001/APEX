"""
Database initialization and bootstrap utilities.
Creates the accounts_payable database if it doesn't exist,
then creates tables and inserts default data.
"""

from sqlalchemy import create_engine, text
from app.database.database import Base, engine, SessionLocal
from app.models.db_models import (
    User, Currency, GlobalSetting, EntityMaster
)
from app.auth.jwt import get_password_hash
from app.config.settings import settings
from datetime import datetime
import json


def create_database_if_not_exists():
    """
    Connect to the 'master' database (which always exists in SQL Server)
    and create the 'accounts_payable' database if it doesn't already exist.
    This must be done BEFORE SQLAlchemy tries to connect to accounts_payable.
    """
    db_url = settings.DATABASE_URL
    # Build a URL that points to 'master' instead of 'accounts_payable'
    # Handles both formats:
    #   mssql+pymssql://user:pass@host:port/accounts_payable
    #   mssql+pymssql://user:pass@host:port/accounts_payable?...
    if "/accounts_payable" in db_url:
        master_url = db_url.replace("/accounts_payable", "/master", 1)
    else:
        # Fallback: append /master
        master_url = db_url.rsplit("/", 1)[0] + "/master"

    print(f"Connecting to master DB to ensure 'accounts_payable' exists...")
    try:
        # isolation_level=AUTOCOMMIT is required for CREATE DATABASE
        master_engine = create_engine(master_url, isolation_level="AUTOCOMMIT")
        with master_engine.connect() as conn:
            result = conn.execute(
                text("SELECT COUNT(*) FROM sys.databases WHERE name = 'accounts_payable'")
            )
            count = result.scalar()
            if count == 0:
                conn.execute(text("CREATE DATABASE accounts_payable"))
                print("SUCCESS: Database 'accounts_payable' created successfully")
            else:
                print("SUCCESS: Database 'accounts_payable' already exists")
        master_engine.dispose()
    except Exception as e:
        print(f"ERROR: Failed to create database: {e}")
        raise


def create_tables():
    """Create all database tables and schema migrations"""
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    
    # Run manual migrations if required
    try:
        with engine.connect() as conn:
            # Check if department column exists
            result = conn.execute(text(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'department'"
            ))
            if result.scalar() == 0:
                conn.execute(text("ALTER TABLE users ADD department NVARCHAR(100) NULL"))
                conn.execute(text("COMMIT"))
                print("SUCCESS: Added department column to users table")
            
            # Check if email_notifications column exists
            result = conn.execute(text(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'email_notifications'"
            ))
            if result.scalar() == 0:
                conn.execute(text("ALTER TABLE users ADD email_notifications BIT NOT NULL DEFAULT 1"))
                conn.execute(text("COMMIT"))
                print("SUCCESS: Added email_notifications column to users table")

            # ── Bank Reconciliation migrations ──────────────────────────────
            # Add account_number column to bank_statements if it doesn't exist
            result = conn.execute(text(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_NAME = 'bank_statements' AND COLUMN_NAME = 'account_number'"
            ))
            if result.scalar() == 0:
                conn.execute(text("ALTER TABLE bank_statements ADD account_number NVARCHAR(100) NULL"))
                conn.execute(text("COMMIT"))
                print("SUCCESS: Added account_number column to bank_statements table")

            # Add statement_month column to bank_statements if it doesn't exist
            result = conn.execute(text(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_NAME = 'bank_statements' AND COLUMN_NAME = 'statement_month'"
            ))
            if result.scalar() == 0:
                conn.execute(text("ALTER TABLE bank_statements ADD statement_month NVARCHAR(7) NULL"))
                conn.execute(text("COMMIT"))
                print("SUCCESS: Added statement_month column to bank_statements table")

            # Ensure no duplicate statements per account per month
            duplicate_count = conn.execute(text(
                "SELECT COUNT(*) FROM ("
                "SELECT account_number, statement_month "
                "FROM bank_statements "
                "WHERE account_number IS NOT NULL AND statement_month IS NOT NULL "
                "GROUP BY account_number, statement_month "
                "HAVING COUNT(*) > 1"
                ") dup"
            )).scalar()

            unique_index_exists = conn.execute(text(
                "SELECT COUNT(*) FROM sys.indexes "
                "WHERE object_id = OBJECT_ID('bank_statements') AND name = 'ux_bank_statements_account_month'"
            )).scalar()

            if not unique_index_exists:
                if duplicate_count and duplicate_count > 0:
                    print("WARNING: Duplicate account_number + statement_month rows exist in bank_statements; skipping unique index creation")
                else:
                    conn.execute(text(
                        "CREATE UNIQUE INDEX ux_bank_statements_account_month "
                        "ON bank_statements(account_number, statement_month) "
                        "WHERE account_number IS NOT NULL AND statement_month IS NOT NULL"
                    ))
                    conn.execute(text("COMMIT"))
                    print("SUCCESS: Added unique index ux_bank_statements_account_month on bank_statements")

            # Add SageGLTransactionCache extra columns if they don't exist
            columns_to_add = [
                ("entry_date", "DATE NULL"),
                ("doc_number", "NVARCHAR(100) NULL"),
                ("vendor", "NVARCHAR(200) NULL"),
                ("customer", "NVARCHAR(200) NULL"),
                ("record_type", "NVARCHAR(100) NULL"),
                ("cleared", "NVARCHAR(50) NULL"),
                ("tr_type", "NVARCHAR(50) NULL"),
                ("bank", "NVARCHAR(100) NULL")
            ]
            for col_name, col_type in columns_to_add:
                result = conn.execute(text(
                    f"SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                    f"WHERE TABLE_NAME = 'sage_gl_transaction_cache' AND COLUMN_NAME = '{col_name}'"
                ))
                if result.scalar() == 0:
                    conn.execute(text(f"ALTER TABLE sage_gl_transaction_cache ADD {col_name} {col_type}"))
                    try:
                        conn.execute(text("COMMIT"))
                    except Exception:
                        pass
                    print(f"SUCCESS: Added {col_name} column to sage_gl_transaction_cache table")

            # Bank accounts schema migration
            table_exists = conn.execute(text(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'bank_accounts'"
            )).scalar()

            if table_exists:
                # Drop old constraint/index that depend on entity before dropping the column
                old_constraint_exists = conn.execute(text(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS "
                    "WHERE TABLE_NAME = 'bank_accounts' AND CONSTRAINT_NAME = 'uq_bank_accounts_entity_account'"
                )).scalar()
                if old_constraint_exists:
                    conn.execute(text("ALTER TABLE bank_accounts DROP CONSTRAINT uq_bank_accounts_entity_account"))
                    try:
                        conn.execute(text("COMMIT"))
                    except Exception:
                        pass
                    print("SUCCESS: Dropped uq_bank_accounts_entity_account constraint")

                old_index_exists = conn.execute(text(
                    "SELECT COUNT(*) FROM sys.indexes "
                    "WHERE object_id = OBJECT_ID('bank_accounts') AND name = 'ix_bank_accounts_bank_entity'"
                )).scalar()
                if old_index_exists:
                    conn.execute(text("DROP INDEX ix_bank_accounts_bank_entity ON bank_accounts"))
                    try:
                        conn.execute(text("COMMIT"))
                    except Exception:
                        pass
                    print("SUCCESS: Dropped ix_bank_accounts_bank_entity index")

                legacy_entity_index_exists = conn.execute(text(
                    "SELECT COUNT(*) FROM sys.indexes "
                    "WHERE object_id = OBJECT_ID('bank_accounts') AND name = 'ix_bank_accounts_entity'"
                )).scalar()
                if legacy_entity_index_exists:
                    conn.execute(text("DROP INDEX ix_bank_accounts_entity ON bank_accounts"))
                    try:
                        conn.execute(text("COMMIT"))
                    except Exception:
                        pass
                    print("SUCCESS: Dropped ix_bank_accounts_entity index")

                # Remove deprecated columns if they exist
                for old_col in ["entity", "raw_data"]:
                    old_col_exists = conn.execute(text(
                        f"SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        f"WHERE TABLE_NAME = 'bank_accounts' AND COLUMN_NAME = '{old_col}'"
                    )).scalar()
                    if old_col_exists:
                        if old_col == "entity":
                            fk_rows = conn.execute(text(
                                "SELECT fk.name "
                                "FROM sys.foreign_keys fk "
                                "JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id "
                                "JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id "
                                "WHERE fkc.parent_object_id = OBJECT_ID('bank_accounts') AND c.name = 'entity'"
                            )).fetchall()

                            for fk_row in fk_rows:
                                fk_name = fk_row[0]
                                conn.execute(text(f"ALTER TABLE bank_accounts DROP CONSTRAINT [{fk_name}]"))
                                try:
                                    conn.execute(text("COMMIT"))
                                except Exception:
                                    pass
                                print(f"SUCCESS: Dropped {fk_name} foreign key constraint")

                        conn.execute(text(f"ALTER TABLE bank_accounts DROP COLUMN {old_col}"))
                        try:
                            conn.execute(text("COMMIT"))
                        except Exception:
                            pass
                        print(f"SUCCESS: Dropped {old_col} column from bank_accounts table")

                # Add requested columns if they don't exist
                new_columns = [
                    ("bank_id", "NVARCHAR(100) NULL"),
                    ("gl_account", "NVARCHAR(100) NULL"),
                    ("gl_account_title", "NVARCHAR(255) NULL"),
                ]
                for col_name, col_type in new_columns:
                    col_exists = conn.execute(text(
                        f"SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        f"WHERE TABLE_NAME = 'bank_accounts' AND COLUMN_NAME = '{col_name}'"
                    )).scalar()
                    if col_exists == 0:
                        conn.execute(text(f"ALTER TABLE bank_accounts ADD {col_name} {col_type}"))
                        try:
                            conn.execute(text("COMMIT"))
                        except Exception:
                            pass
                        print(f"SUCCESS: Added {col_name} column to bank_accounts table")

                # Ensure new constraint/index exist
                new_constraint_exists = conn.execute(text(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS "
                    "WHERE TABLE_NAME = 'bank_accounts' AND CONSTRAINT_NAME = 'uq_bank_accounts_bank_account'"
                )).scalar()
                if new_constraint_exists == 0:
                    conn.execute(text(
                        "ALTER TABLE bank_accounts "
                        "ADD CONSTRAINT uq_bank_accounts_bank_account UNIQUE (bank_id, account_number)"
                    ))
                    try:
                        conn.execute(text("COMMIT"))
                    except Exception:
                        pass
                    print("SUCCESS: Added uq_bank_accounts_bank_account constraint")

                new_index_exists = conn.execute(text(
                    "SELECT COUNT(*) FROM sys.indexes "
                    "WHERE object_id = OBJECT_ID('bank_accounts') AND name = 'ix_bank_accounts_bank_gl'"
                )).scalar()
                if new_index_exists == 0:
                    conn.execute(text("CREATE INDEX ix_bank_accounts_bank_gl ON bank_accounts (bank_id, gl_account)"))
                    try:
                        conn.execute(text("COMMIT"))
                    except Exception:
                        pass
                    print("SUCCESS: Added ix_bank_accounts_bank_gl index")

    except Exception as e:
        print(f"Migration error (might be expected if table newly created): {e}")

    print("SUCCESS: All tables created successfully")


def create_admin_user(db):
    """Create default admin user if not exists"""
    existing_admin = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
    
    if not existing_admin:
        admin_user = User(
            username=settings.ADMIN_USERNAME,
            email=settings.ADMIN_EMAIL,
            password=get_password_hash(settings.ADMIN_PASSWORD),
            role="admin",
            status="active",
            created_at=datetime.utcnow()
        )
        db.add(admin_user)
        db.commit()
        print(f"SUCCESS: Admin user created: {settings.ADMIN_EMAIL}")
    else:
        print(f"SUCCESS: Admin user already exists: {settings.ADMIN_EMAIL}")


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


def init_database():
    """
    Initialize the database with tables and default data.
    This should be called on application startup.
    """
    print("\n" + "="*50)
    print("DATABASE INITIALIZATION")
    print("="*50 + "\n")

    # Step 1: Ensure the 'accounts_payable' database exists in SQL Server.
    # SQL Server Docker images only ship with 'master'; we must create our DB
    # BEFORE the main engine (which points to accounts_payable) is first used.
    create_database_if_not_exists()

    # Step 2: Create all ORM tables
    create_tables()
    
    # Create session for data insertion
    db = SessionLocal()
    try:
        # Create default data
        create_admin_user(db)
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
    from app.services.vendor_sync_service import VendorSyncService
    from app.services.master_sync_services import (
        GLSyncService, LOBSyncService, DepartmentSyncService, 
        CustomerSyncService, ItemSyncService, ExchangeRateSyncService,
        EntitySyncService
    )
    from app.models.db_models import (
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
