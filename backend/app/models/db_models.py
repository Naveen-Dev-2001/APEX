"""
SQLAlchemy database models for Accounts Payable application.
These models replace the MongoDB collections with SQL Server tables.
"""

from sqlalchemy import (
    Column, Integer, String, DateTime, Text, ForeignKey,
    DECIMAL, Boolean, Index, UniqueConstraint, Enum as SQLEnum,
    Float, LargeBinary, Date
)
from sqlalchemy.orm import relationship, backref
from sqlalchemy.dialects.mssql import NVARCHAR
from datetime import datetime
from app.database.database import Base
from app.utils.date_utils import get_ist_now
import enum


# ==================== ENUMS ====================

class InvoiceStatusEnum(str, enum.Enum):
    WAITING_CODING = "waiting_coding"
    WAITING_APPROVAL = "waiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    PROCESSED = "processed"
    UPLOADING = "uploading"
    REWORKED = "reworked"
    SAGE_POSTED = "sage_posted"
    SAGE_POST_FAILED = "sage_post_failed"
    ARCHIVED = "archived"
    DELETED = "deleted"


class WorkflowStepTypeEnum(str, enum.Enum):
    PROCESSED = "processed"
    CODING = "coding"
    APPROVER_1 = "approver_1"
    APPROVER_2 = "approver_2"
    APPROVER_3 = "approver_3"
    APPROVER_4 = "approver_4"
    SAGE_POSTED = "sage_posted"
    DELETED = "deleted"
    ARCHIVED = "archived"


class WorkflowStepStatusEnum(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    APPROVED = "approved"
    REJECTED = "rejected"
    REWORKED = "reworked"


# ==================== USER MODEL ====================

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    # admin, coder, approver
    role = Column(String(50), nullable=False, default="coder")
    # pending, active, rejected
    status = Column(String(50), nullable=False, default="pending")
    department = Column(String(100), nullable=False,
                        default="finance", index=True)  # finance, non-finance
    isCreatedByUser = Column(Boolean, nullable=False, default=True)
    createdby = Column(String(100), nullable=False, default="self")
    ispasswordchange = Column(Boolean, nullable=False, default=True)
    email_notifications = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=get_ist_now)

    # Relationships
    invoices = relationship(
        "Invoice", back_populates="uploader", foreign_keys="Invoice.uploaded_by_id")


# ==================== OTP RECORD MODEL ====================

class OTPRecord(Base):
    __tablename__ = "otp_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False, index=True)
    otp_code = Column(String(10), nullable=False)
    # registration, forgot_password
    purpose = Column(String(50), nullable=False)
    is_verified = Column(Boolean, default=False)
    attempts = Column(Integer, default=0)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=get_ist_now)

    __table_args__ = (
        Index('ix_otp_email_purpose', 'email', 'purpose'),
    )


# ==================== INVOICE MODEL ====================

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String(500), nullable=False)
    original_filename = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    # Username for backward compatibility
    uploaded_by = Column(String(100), nullable=False, index=True)
    uploaded_by_id = Column(Integer, ForeignKey(
        "users.id"), nullable=True, index=True)  # FK to users
    status = Column(SQLEnum(InvoiceStatusEnum), nullable=False,
                    default=InvoiceStatusEnum.WAITING_APPROVAL, index=True)
    entity = Column(String(100), ForeignKey(
        "entity_master.entity_id"), nullable=True, index=True)

    # Vendor information
    vendor_id = Column(String(100), ForeignKey(
        "vendor_master.vendor_id"), nullable=True, index=True)
    vendor_name = Column(String(500), nullable=True, index=True)
    invoice_number = Column(String(200), nullable=True, index=True)
    reference_number = Column(String(255), nullable=True, index=True)
    azure_vendor_name = Column(String(500), nullable=True)
    azure_vendor_address = Column(String(500), nullable=True)
    line_grouping = Column(String(10), nullable=True)  # Yes/No

    # Financial data
    exchange_rate = Column(DECIMAL(18, 6), nullable=True)
    total_amount = Column(DECIMAL(18, 2), nullable=True, index=True)
    amount_due = Column(DECIMAL(18, 2), nullable=True, index=True)
    invoice_date = Column(Date, nullable=True, index=True)
    due_date = Column(Date, nullable=True, index=True)
    posting_date = Column(Date, nullable=True, index=True)

    # JSON fields (stored as NVARCHAR(MAX))
    extracted_data = Column(Text, nullable=True)  # JSON
    vendor_details = Column(Text, nullable=True)  # JSON
    processing_steps = Column(Text, nullable=True)  # JSON (array)
    validation_results = Column(Text, nullable=True)  # JSON
    duplicate_info = Column(Text, nullable=True)  # JSON
    original_items = Column(Text, nullable=True)  # JSON (array)
    approver_breakdown = Column(Text, nullable=True)  # JSON
    gl_summary = Column(Text, nullable=True)  # JSON (array)
    # Bill number returned by Sage Intacct
    sage_bill_number = Column(String(200), nullable=True, index=True)

    # Metadata
    confidence_score = Column(String(50), nullable=True)
    uploaded_at = Column(DateTime, nullable=False,
                         default=get_ist_now, index=True)
    processed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=get_ist_now, onupdate=get_ist_now)

    # Approval tracking
    required_approvers = Column(Integer, nullable=True)
    current_approver_level = Column(Integer, nullable=True, default=1, index=True)

    # Relationships
    uploader = relationship(
        "User", back_populates="invoices", foreign_keys=[uploaded_by_id])
    status_history = relationship(
        "InvoiceStatusHistory", back_populates="invoice", cascade="all, delete-orphan")
    approved_by_list = relationship(
        "InvoiceApprovedBy", back_populates="invoice", cascade="all, delete-orphan")
    assigned_approvers_list = relationship(
        "InvoiceAssignedApprover", back_populates="invoice", cascade="all, delete-orphan")
    coding = relationship("Coding", back_populates="invoice",
                          uselist=False, cascade="all, delete-orphan")
    workflow_steps = relationship(
        "WorkflowStep", back_populates="invoice", cascade="all, delete-orphan")
    audit_logs = relationship(
        "AuditLog", back_populates="invoice", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index('ix_invoice_vendor_number', 'vendor_id', 'invoice_number'),
        Index('ix_invoice_entity_status', 'entity', 'status'),
        Index('ix_invoice_uploaded_at_desc', uploaded_at.desc()),
        Index('ix_invoice_date', 'invoice_date'),
        Index('ix_invoice_due_date', 'due_date'),
    )


# ==================== INVOICE STATUS HISTORY ====================

class InvoiceStatusHistory(Base):
    __tablename__ = "invoice_status_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey(
        "invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(50), nullable=False)
    user = Column(String(100), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=get_ist_now)
    comment = Column(Text, nullable=True)
    approver_level = Column(Integer, nullable=True)

    # Relationships
    invoice = relationship("Invoice", back_populates="status_history")

    __table_args__ = (
        Index('ix_status_history_invoice_timestamp',
              'invoice_id', timestamp.desc()),
    )


# ==================== INVOICE APPROVED BY ====================

class InvoiceApprovedBy(Base):
    __tablename__ = "invoice_approved_by"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey(
        "invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    approver_email = Column(String(255), nullable=False)

    # Relationships
    invoice = relationship("Invoice", back_populates="approved_by_list")

    __table_args__ = (
        UniqueConstraint('invoice_id', 'approver_email',
                         name='uq_invoice_approver'),
    )


# ==================== INVOICE ASSIGNED APPROVERS ====================

class InvoiceAssignedApprover(Base):
    __tablename__ = "invoice_assigned_approvers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey(
        "invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    approver_email = Column(String(255), nullable=False, index=True)
    sequence_order = Column(Integer, nullable=False,
                            default=0)  # For maintaining order
    is_finance = Column(Boolean, nullable=False, default=False, index=True)

    # Relationships
    invoice = relationship("Invoice", back_populates="assigned_approvers_list")

    __table_args__ = (
        Index('ix_assigned_approvers_invoice_order',
              'invoice_id', 'sequence_order'),
    )


# ==================== CODING MODEL ====================

class Coding(Base):
    __tablename__ = "coding"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey(
        "invoices.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    header_coding = Column(Text, nullable=True)  # Store as JSON string
    line_items = Column(Text, nullable=True)    # Store as JSON string
    entity = Column(String(100), ForeignKey(
        "entity_master.entity_id"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=get_ist_now)
    updated_at = Column(DateTime, nullable=True, onupdate=get_ist_now)

    # Relationships
    invoice = relationship("Invoice", back_populates="coding")


# ==================== AUDIT LOG ====================

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey(
        "invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(100), nullable=False, index=True)
    user = Column(String(100), nullable=False, index=True)
    entity = Column(String(100), ForeignKey(
        "entity_master.entity_id"), nullable=False, index=True)
    details = Column(Text, nullable=True)  # JSON stored as text
    sage_bill_number = Column(String(200), nullable=True)
    timestamp = Column(DateTime, nullable=False,
                       default=get_ist_now, index=True)

    # Relationships
    invoice = relationship("Invoice", back_populates="audit_logs")

    __table_args__ = (
        Index('ix_audit_invoice_timestamp', 'invoice_id', timestamp.desc()),
        Index('ix_audit_entity_timestamp', 'entity', timestamp.desc()),
    )


# ==================== WORKFLOW STEP ====================

class WorkflowStep(Base):
    __tablename__ = "workflow_steps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey(
        "invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    step_name = Column(String(200), nullable=False)
    # Changed to String for flexibility with approver_N
    step_type = Column(String(100), nullable=False)
    user = Column(String(100), nullable=False, index=True)
    status = Column(String(100), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=get_ist_now, index=True)
    approver_number = Column(Integer, nullable=True, index=True)
    comment = Column(Text, nullable=True)
    entity = Column(String(100), ForeignKey(
        "entity_master.entity_id"), nullable=False, index=True)

    # Relationships
    invoice = relationship("Invoice", back_populates="workflow_steps")

    __table_args__ = (
        Index('ix_workflow_invoice_type', 'invoice_id', 'step_type'),
        Index('ix_workflow_entity_status', 'entity', 'status'),
    )


# ==================== CURRENCY ====================

class Currency(Base):
    __tablename__ = "currencies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False, index=True)
    symbol = Column(NVARCHAR(10), nullable=True)
    exchange_rate = Column(Float, nullable=True)
    created_at = Column(DateTime, nullable=False, default=get_ist_now)
    updated_at = Column(DateTime, nullable=True, onupdate=get_ist_now)


# ==================== DELEGATION ====================

class Delegation(Base):
    __tablename__ = "delegations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity = Column(String(100), ForeignKey(
        "entity_master.entity_id"), nullable=False, index=True)
    # Copied from original_approver usually
    delegator_email = Column(String(200), nullable=False, index=True)
    substitute_email = Column(String(200), nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    original_approver = Column(String(200), nullable=False, index=True)
    substitute_approver = Column(String(200), nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    created_at = Column(DateTime, nullable=False, default=get_ist_now)
    created_by = Column(String(100), nullable=True)

    __table_args__ = (
        Index('ix_delegation_approver_entity', 'original_approver', 'entity'),
        Index('ix_delegation_dates', 'start_date', 'end_date'),
    )


# ==================== GLOBAL SETTINGS ====================

class GlobalSetting(Base):
    __tablename__ = "global_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    setting_key = Column(String(100), unique=True, nullable=False, index=True)
    setting_value = Column(Text, nullable=False)  # JSON
    updated_at = Column(DateTime, nullable=True, onupdate=get_ist_now)


# ==================== MASTER DATA ====================
class EntityMaster(Base):
    """
    Entity Master table to store business entity details.
    """
    __tablename__ = "entity_master"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity_id = Column(String(100), unique=True, nullable=False, index=True)
    entity_name = Column(String(200), nullable=False, index=True)
    registered_address = Column(Text, nullable=True)
    address_line1 = Column(String(255), nullable=True)
    address_line2 = Column(String(255), nullable=True)
    address_line3 = Column(String(255), nullable=True)
    city = Column(String(100), nullable=True)
    state_or_territory = Column(String(100), nullable=True)
    zip_or_postal_code = Column(String(20), nullable=True)
    country_code = Column(String(10), nullable=True)
    gst_applicable = Column(Boolean, nullable=True, default=True)
    created_at = Column(DateTime, default=get_ist_now)
    updated_at = Column(DateTime, default=get_ist_now,
                        onupdate=get_ist_now)


class VendorMaster(Base):
    """
    Vendor Master table to store vendor details.
    """
    __tablename__ = "vendor_master"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor_id = Column(String(100), unique=True, nullable=False, index=True)
    vendor_name = Column(String(200), nullable=False, index=True)
    vendor_is_an_individual_person = Column(Boolean, default=False)
    address_line1 = Column(String(255), nullable=True)
    address_line2 = Column(String(255), nullable=True)
    address_line3 = Column(String(255), nullable=True)
    city = Column(String(100), nullable=True)
    state_or_territory = Column(String(100), nullable=True)
    zip_or_postal_code = Column(String(20), nullable=True)
    country_code = Column(String(10), nullable=True)
    country = Column(String(100), nullable=True)
    primary_phone = Column(String(50), nullable=True)
    secondary_phone_no = Column(String(50), nullable=True)
    mobile_phone = Column(String(50), nullable=True)
    primary_email_address = Column(String(255), nullable=True)
    secondary_email_address = Column(String(255), nullable=True)
    pay_terms = Column(String(100), nullable=True)
    tax_id = Column(String(50), nullable=True)

    # Configuration Columns (Boolean for DB compatibility with BIT columns)
    gst_eligibility = Column(Boolean, nullable=True, default=False)
    tds_applicability = Column(Boolean, nullable=True, default=False)
    tds_percentage = Column(DECIMAL(10, 4), nullable=True)
    tds_section_code = Column(String(255), nullable=True)
    workflow_applicable = Column(Boolean, nullable=True, default=True)
    line_grouping = Column(Boolean, nullable=True, default=False)

    # Suggested Foreign Key to Entity
    entity_id = Column(String(100), ForeignKey(
        "entity_master.entity_id"), nullable=True, index=True)

    # Sage Intacct Sync Fields
    vendor_key = Column(String(100), index=True, nullable=True)
    status = Column(String(50), nullable=True)
    raw_data = Column(Text, nullable=True)  # Full JSON response

    created_at = Column(DateTime, default=get_ist_now)
    updated_at = Column(DateTime, default=get_ist_now,
                        onupdate=get_ist_now)


class TdsRate(Base):
    """
    TDS Rates table for tax calculations.
    """
    __tablename__ = "tds_rates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    section = Column(String(50), nullable=False, index=True)
    nature_of_payment = Column(String(255), nullable=False)
    tds_rate = Column(DECIMAL(10, 4), nullable=False)

    created_at = Column(DateTime, default=get_ist_now)


class GLMaster(Base):
    """
    General Ledger Master table.
    """
    __tablename__ = "gl_master"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_number = Column(String(100), unique=True,
                            nullable=False, index=True)
    title = Column(String(200), nullable=False, index=True)
    normal_balance = Column(String(20), nullable=True)  # Debit/Credit
    require_department = Column(Boolean, default=False)
    require_location = Column(Boolean, default=False)
    period_end_closing_type = Column(String(50), nullable=True)
    close_into_account = Column(String(50), nullable=True)
    disallow_direct_posting = Column(Boolean, default=False)
    internal_rate = Column(DECIMAL(18, 4), nullable=True)

    # Sage Intacct Sync Fields
    gl_key = Column(String(100), index=True, nullable=True)
    status = Column(String(50), nullable=True, default="active")
    raw_data = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=get_ist_now,
                        onupdate=get_ist_now)

    created_at = Column(DateTime, default=get_ist_now)

    # Relationships


class LOBMaster(Base):
    """
    Line of Business Master table.
    """
    __tablename__ = "lob_master"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lob_id = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False, index=True)
    parent_id = Column(String(50), nullable=True)

    # Sage Intacct Sync Fields
    lob_key = Column(String(100), index=True, nullable=True)
    status = Column(String(50), nullable=True, default="active")
    raw_data = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=get_ist_now,
                        onupdate=get_ist_now)

    created_at = Column(DateTime, default=get_ist_now)


class DepartmentMaster(Base):
    """
    Department Master table.
    """
    __tablename__ = "department_master"

    id = Column(Integer, primary_key=True, autoincrement=True)
    department_id = Column(String(100), unique=True,
                           nullable=False, index=True)
    department_name = Column(String(200), nullable=False, index=True)

    # Sage Intacct Sync Fields
    dept_key = Column(String(100), index=True, nullable=True)
    status = Column(String(50), nullable=True, default="active")
    raw_data = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=get_ist_now,
                        onupdate=get_ist_now)

    created_at = Column(DateTime, default=get_ist_now)


class CustomerMaster(Base):
    """
    Customer Master table.
    """
    __tablename__ = "customer_master"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(String(100), unique=True, nullable=False, index=True)
    customer_name = Column(String(200), nullable=False, index=True)

    # Sage Intacct Sync Fields
    customer_key = Column(String(100), index=True, nullable=True)
    status = Column(String(50), nullable=True, default="active")
    raw_data = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=get_ist_now,
                        onupdate=get_ist_now)

    created_at = Column(DateTime, default=get_ist_now)


class ItemMaster(Base):
    """
    Item Master table.
    """
    __tablename__ = "item_master"

    id = Column(Integer, primary_key=True, autoincrement=True)
    item_id = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False, index=True)
    product_line_id = Column(String(50), nullable=True)
    gl_group = Column(String(50), nullable=True)

    # Sage Intacct Sync Fields
    item_key = Column(String(100), index=True, nullable=True)
    status = Column(String(50), nullable=True, default="active")
    raw_data = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=get_ist_now,
                        onupdate=get_ist_now)

    created_at = Column(DateTime, default=get_ist_now)


class InvoiceRegistry(Base):
    """Fast lookup registry for duplicate invoice detection"""
    __tablename__ = "invoice_registry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor_id = Column(String(100), nullable=False, index=True)
    invoice_number = Column(String(200), nullable=False, index=True)
    entity = Column(String(100), nullable=False, index=True)
    invoice_id = Column(Integer, nullable=False)  # Reference to invoices.id
    uploaded_by = Column(String(100), nullable=False)
    uploaded_at = Column(DateTime, nullable=False, default=get_ist_now)

    __table_args__ = (
        UniqueConstraint('vendor_id', 'invoice_number',
                         'entity', name='uq_vendor_invoice_entity'),
        Index('ix_registry_lookup', 'vendor_id', 'invoice_number', 'entity'),
    )


class VendorMetadata(Base):
    __tablename__ = "vendor_metadata"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity = Column(String(100), nullable=True, index=True)
    vendor_id = Column(String(100), nullable=False, index=True)
    official_name = Column(String(500), nullable=False)
    extracted_name = Column(String(500), nullable=True)
    extracted_address = Column(String(1000), nullable=True)
    extracted_name_normalized = Column(String(500), nullable=True, index=True)
    extracted_address_normalized = Column(
        String(1000), nullable=True, index=True)
    line_grouping = Column(String(10), nullable=True, default="No")  # Yes/No
    created_at = Column(DateTime, nullable=False, default=get_ist_now)
    updated_at = Column(DateTime, nullable=True, onupdate=get_ist_now)
    updated_by = Column(String(100), nullable=True)

    __table_args__ = (
        UniqueConstraint('entity', 'vendor_id',
                         name='uq_vendor_entity_metadata'),
        Index('ix_vendor_metadata_lookup', 'entity',
              'extracted_name_normalized', 'extracted_address_normalized'),
    )


class VendorWorkflow(Base):
    __tablename__ = "vendor_workflows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity = Column(String(100), ForeignKey(
        "entity_master.entity_id"), nullable=False, index=True)
    vendor_id = Column(String(100), ForeignKey(
        "vendor_master.vendor_id"), nullable=True, index=True)
    vendor_name = Column(String(500), nullable=True)
    approver_count = Column(Integer, default=3)
    mandatory_approver_1 = Column(Text, nullable=True)
    mandatory_approver_2 = Column(Text, nullable=True)
    mandatory_approver_3 = Column(Text, nullable=True)
    mandatory_approver_4 = Column(Text, nullable=True)
    mandatory_approver_5 = Column(Text, nullable=True)
    is_threshold_enabled = Column(Boolean, default=False)
    amount_threshold = Column(Float, default=0.0)
    threshold_approver = Column(Text, nullable=True)
    # is_parallel = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, nullable=False, default=get_ist_now)
    updated_at = Column(DateTime, nullable=True, onupdate=get_ist_now)
    approver_flags = Column(Text, nullable=True)
    posting_approver = Column(String(255), nullable=True)


class CodificationWorkflow(Base):
    __tablename__ = "codification_workflows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity = Column(String(100), ForeignKey(
        "entity_master.entity_id"), nullable=False, index=True)
    lob = Column(String(200), nullable=False, index=True)
    department_id = Column(String(200), nullable=False, index=True)
    approver_count = Column(Integer, default=3)
    mandatory_approver_1 = Column(Text, nullable=True)
    mandatory_approver_2 = Column(Text, nullable=True)
    mandatory_approver_3 = Column(Text, nullable=True)
    mandatory_approver_4 = Column(Text, nullable=True)
    mandatory_approver_5 = Column(Text, nullable=True)
    is_threshold_enabled = Column(Boolean, default=False)
    amount_threshold = Column(Float, default=0.0)
    threshold_approver = Column(Text, nullable=True)
    posting_approver = Column(String, nullable=True)
    # is_parallel = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, nullable=False, default=get_ist_now)
    updated_at = Column(DateTime, nullable=True, onupdate=get_ist_now)
    approver_flags = Column(Text, nullable=True)


class ExchangeRateMaster(Base):
    """
    Exchange Rate Master table to store point-in-time exchange rates from Sage.
    """
    __tablename__ = "exchange_rate_master"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rate_key = Column(String(100), unique=True, index=True, nullable=False)
    rate_type = Column(String(50), nullable=True)
    base_currency = Column(String(10), nullable=False, index=True)
    target_currency = Column(String(10), nullable=False, index=True)
    exchange_rate = Column(Float, nullable=False)
    effective_date = Column(DateTime, nullable=True)
    status = Column(String(50), nullable=True, default="active")
    raw_data = Column(Text, nullable=True)  # Full JSON response
    created_at = Column(DateTime, default=get_ist_now)
    updated_at = Column(DateTime, default=get_ist_now,
                        onupdate=get_ist_now)


class CodingHistory(Base):
    __tablename__ = "coding_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor_id = Column(String(100), nullable=True, index=True)
    vendor_key = Column(String(500), nullable=False, index=True)
    vendor_name = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    normalized_description = Column(String(1000), nullable=False, index=True)
    embedding = Column(Text, nullable=True)  # Store JSON serialized embedding
    coding_json = Column(Text, nullable=True)  # Store JSON of GL, LOB, etc.
    updated_at = Column(DateTime, nullable=False, default=get_ist_now)

    __table_args__ = (
        Index('ix_coding_history_lookup', 'vendor_id',
              'vendor_key', 'normalized_description'),
    )


class RawExtractionData(Base):
    __tablename__ = "raw_extraction_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey(
        "invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    pdf_binary = Column(LargeBinary, nullable=True)  # Store PDF binary data
    # Full Azure response (JSON string)
    raw_azure_response = Column(Text, nullable=True)
    llm_prompt = Column(Text, nullable=True)         # Prompt sent to LLM
    llm_raw_response = Column(Text, nullable=True)   # Raw response from LLM
    created_at = Column(DateTime, nullable=False, default=get_ist_now)

    # Relationships
    invoice = relationship("Invoice", backref=backref(
        "raw_data_record", uselist=False, cascade="all, delete-orphan"))


# ==================== DELETED INVOICES (SOFT-DELETE ARCHIVE) ====================

class DeletedInvoice(Base):
    """
    Archive table for soft-deleted invoices.
    When an invoice is deleted, all its data and related child-table rows
    are snapshotted here as JSON before being removed from the invoices table.
    This preserves full history and allows the same invoice to be re-uploaded
    without triggering a duplicate warning.
    """
    __tablename__ = "deleted_invoices"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # ---- Original invoice identity ----
    original_invoice_id = Column(Integer, nullable=False, index=True)
    filename = Column(String(500), nullable=True)
    original_filename = Column(String(500), nullable=True)
    file_path = Column(String(1000), nullable=True)
    uploaded_by = Column(String(100), nullable=True)
    uploaded_by_id = Column(Integer, nullable=True)

    # ---- Status & workflow ----
    status = Column(String(100), nullable=True)
    entity = Column(String(100), nullable=True)

    # ---- Vendor information ----
    vendor_id = Column(String(100), nullable=True, index=True)
    vendor_name = Column(String(500), nullable=True, index=True)
    invoice_number = Column(String(200), nullable=True, index=True)
    azure_vendor_name = Column(String(500), nullable=True)
    azure_vendor_address = Column(String(500), nullable=True)
    line_grouping = Column(String(10), nullable=True)

    total_amount = Column(DECIMAL(18, 2), nullable=True)
    amount_due = Column(DECIMAL(18, 2), nullable=True)
    invoice_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)

    # ---- Financial ----
    exchange_rate = Column(DECIMAL(18, 6), nullable=True)
    total_amount = Column(DECIMAL(18, 2), nullable=True)
    amount_due = Column(DECIMAL(18, 2), nullable=True)
    invoice_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    sage_bill_number = Column(String(200), nullable=True)

    # ---- JSON fields (copied from Invoice) ----
    extracted_data = Column(Text, nullable=True)
    vendor_details = Column(Text, nullable=True)
    processing_steps = Column(Text, nullable=True)
    validation_results = Column(Text, nullable=True)
    duplicate_info = Column(Text, nullable=True)
    original_items = Column(Text, nullable=True)
    approver_breakdown = Column(Text, nullable=True)
    gl_summary = Column(Text, nullable=True)

    # ---- Metadata ----
    confidence_score = Column(String(50), nullable=True)
    uploaded_at = Column(DateTime, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    required_approvers = Column(Integer, nullable=True)
    current_approver_level = Column(Integer, nullable=True)

    # ---- Child-table snapshots (JSON) ----
    # Snapshot of invoice_status_history
    status_history_json = Column(Text, nullable=True)
    # Snapshot of workflow_steps
    workflow_steps_json = Column(Text, nullable=True)
    # Snapshot of invoice_approved_by
    approved_by_json = Column(Text, nullable=True)
    # Snapshot of invoice_assigned_approvers
    assigned_approvers_json = Column(Text, nullable=True)
    # Snapshot of coding table row
    coding_json = Column(Text, nullable=True)
    # Snapshot of audit_logs
    audit_logs_json = Column(Text, nullable=True)

    # ---- Deletion metadata ----
    deleted_at = Column(DateTime, nullable=False,
                        default=get_ist_now, index=True)
    deleted_by = Column(String(100), nullable=False)

    __table_args__ = (
        Index('ix_deleted_invoices_vendor_number',
              'vendor_id', 'invoice_number'),
        Index('ix_deleted_invoices_entity', 'entity'),
    )


class InvoiceWorkflowState(Base):
    __tablename__ = "invoice_workflow_states"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, nullable=False, unique=True, index=True)

    # Which workflow matched this invoice
    workflow_id = Column(Integer, nullable=True)
    # "vendor" | "codification"
    workflow_type = Column(String(20), nullable=True)

    # Current position in the approval ladder
    # current_level: 1–5 for mandatory, 0 for threshold/posting/done
    # current_level_type: "mandatory" | "threshold" | "posting" | "done"
    current_level = Column(Integer, default=1)
    current_level_type = Column(String(20), default="mandatory")

    # JSON dict: { "1": "who@approved.com", "2": null, ... }
    # null means that level is not yet approved in the current round
    approved_levels = Column(Text, nullable=True)

    # Dedicated columns for non-mandatory stages
    threshold_approved_by = Column(String(255), nullable=True)
    posting_approved_by = Column(String(255), nullable=True)

    # Rework state
    # rework_level         : mandatory level that triggered rework (the finance-team level we go back to)
    # rework_assigned_to   : JSON list of finance-team email addresses
    rework_level = Column(Integer, nullable=True)
    rework_assigned_to = Column(Text, nullable=True)

    # Editing flag — set by approver "Enable Editing" action
    is_editing_enabled = Column(Boolean, default=False)
    editing_enabled_by = Column(String(255), nullable=True)

    entity = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)


class InvoiceApprovalLog(Base):
    __tablename__ = "invoice_approval_logs"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, nullable=False, index=True)

    # level is null for threshold / posting rows
    level = Column(Integer, nullable=True)
    # mandatory | threshold | posting
    level_type = Column(String(20), nullable=True)

    approver_email = Column(String(255), nullable=False)
    approver_name = Column(String(255), nullable=True)

    # approved | rejected | rework | editing_enabled | sent_for_approval | repost_sage
    action = Column(String(30), nullable=False)
    comments = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=True)
    entity = Column(String(100), nullable=True)

    __table_args__ = (
        Index("ix_approval_logs_invoice_action", "invoice_id", "action"),
    )

# ==================== BANK RECONCILIATION MODELS ====================

class BankStatement(Base):
    __tablename__ = "bank_statements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String(255), nullable=False)
    account_number = Column(String(100), nullable=True, index=True)  # GL account this statement belongs to
    upload_date = Column(DateTime, nullable=False, default=get_ist_now)
    status = Column(String(50), nullable=False, default="uploaded") # uploaded, reconciled
    entity = Column(String(100), nullable=True)
    uploaded_by = Column(String(255), nullable=True)

    transactions = relationship("BankStatementTransaction", back_populates="statement", cascade="all, delete-orphan")


# class BankStatementTransaction(Base):
#     __tablename__ = "bank_statement_transactions"

#     id = Column(Integer, primary_key=True, autoincrement=True)
#     statement_id = Column(Integer, ForeignKey("bank_statements.id"), nullable=False)
#     date = Column(Date, nullable=False)
#     description = Column(String(500), nullable=True)
#     reference = Column(String(255), nullable=True)
#     amount = Column(DECIMAL(18, 2), nullable=False)
#     transaction_type = Column(String(20), nullable=False) # debit, credit
#     is_matched = Column(Boolean, default=False)
    
#     statement = relationship("BankStatement", back_populates="transactions")
#     reconciliation_results = relationship("ReconciliationResult", back_populates="bank_transaction")


class BankStatementTransaction(Base):
    __tablename__ = "bank_statement_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)

    statement_id = Column(
        Integer,
        ForeignKey("bank_statements.id"),
        nullable=False
    )

    # Existing
    date = Column(Date, nullable=False)
    description = Column(String(500), nullable=True)
    reference = Column(String(255), nullable=True)

    # New columns
    account_number = Column(String(100), nullable=True)
    account_name = Column(String(255), nullable=True)

    debit = Column(DECIMAL(18, 2), nullable=True)
    credit = Column(DECIMAL(18, 2), nullable=True)

    check_number = Column(String(100), nullable=True)

    transaction_type = Column(
        String(20),
        nullable=True
    )  # debit / credit

    status = Column(
        String(50),
        default="Pending"
    )  # Pending / Matched / Unmatched

    amount = Column(
        DECIMAL(18, 2),
        nullable=False
    )

    is_matched = Column(
        Boolean,
        default=False
    )

    statement = relationship(
        "BankStatement",
        back_populates="transactions"
    )

    reconciliation_results = relationship(
        "ReconciliationResult",
        back_populates="bank_transaction"
    )

class SageGLTransactionCache(Base):
    __tablename__ = "sage_gl_transaction_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sage_key = Column(String(100), nullable=False, unique=True, index=True)
    date = Column(Date, nullable=False)
    description = Column(String(500), nullable=True)
    account = Column(String(100), nullable=True)
    amount = Column(DECIMAL(18, 2), nullable=False)
    transaction_type = Column(String(20), nullable=False) # debit, credit
    is_matched = Column(Boolean, default=False)
    fetch_date = Column(DateTime, nullable=False, default=get_ist_now)
    
    # Extra columns extracted from Sage
    entry_date = Column(Date, nullable=True)
    doc_number = Column(String(100), nullable=True)
    vendor = Column(String(200), nullable=True)
    customer = Column(String(200), nullable=True)
    record_type = Column(String(100), nullable=True)
    cleared = Column(String(50), nullable=True)
    tr_type = Column(String(50), nullable=True)
    bank = Column(String(100), nullable=True)
    
    reconciliation_results = relationship("ReconciliationResult", back_populates="sage_transaction")


class ReconciliationResult(Base):
    __tablename__ = "reconciliation_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    bank_transaction_id = Column(Integer, ForeignKey("bank_statement_transactions.id"), nullable=True)
    sage_transaction_id = Column(Integer, ForeignKey("sage_gl_transaction_cache.id"), nullable=True)
    match_status = Column(String(50), nullable=False) # matched, unmatched
    matched_at = Column(DateTime, default=get_ist_now)

    bank_transaction = relationship("BankStatementTransaction", back_populates="reconciliation_results")
    sage_transaction = relationship("SageGLTransactionCache", back_populates="reconciliation_results")
