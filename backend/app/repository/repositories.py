from app.repository.base_repository import BaseRepository
from app.models.db_models import (
    User, Invoice, EntityMaster, VendorMaster, TdsRate, GLMaster, 
    LOBMaster, DepartmentMaster, CustomerMaster, ItemMaster, 
    ExchangeRateMaster, OTPRecord, Coding, AuditLog, WorkflowStep, 
    Currency, Delegation, GlobalSetting, ApproverAmount, ApproverGL, 
    ApproverNumber, ApproverDefault, VendorMetadata, VendorWorkflow, 
    CodificationWorkflow, CodingHistory, RawExtractionData, InvoiceRegistry,
    InvoiceStatusHistory, InvoiceAssignedApprover, InvoiceApprovedBy
)
from pydantic import BaseModel
from typing import Any

# Generic schemas for models that don't have specialized ones yet
class GenericSchema(BaseModel):
    class Config:
        extra = "allow"

# Instantiate repositories for all models
user_repo = BaseRepository[User, Any, Any](User)
invoice_repo = BaseRepository[Invoice, Any, Any](Invoice)
entity_master_repo = BaseRepository[EntityMaster, Any, Any](EntityMaster)
vendor_master_repo = BaseRepository[VendorMaster, Any, Any](VendorMaster)
tds_rate_repo = BaseRepository[TdsRate, Any, Any](TdsRate)
gl_master_repo = BaseRepository[GLMaster, Any, Any](GLMaster)
lob_master_repo = BaseRepository[LOBMaster, Any, Any](LOBMaster)
department_master_repo = BaseRepository[DepartmentMaster, Any, Any](DepartmentMaster)
customer_master_repo = BaseRepository[CustomerMaster, Any, Any](CustomerMaster)
item_master_repo = BaseRepository[ItemMaster, Any, Any](ItemMaster)
exchange_rate_master_repo = BaseRepository[ExchangeRateMaster, Any, Any](ExchangeRateMaster)
otp_repo = BaseRepository[OTPRecord, Any, Any](OTPRecord)
coding_repo = BaseRepository[Coding, Any, Any](Coding)
audit_log_repo = BaseRepository[AuditLog, Any, Any](AuditLog)
workflow_step_repo = BaseRepository[WorkflowStep, Any, Any](WorkflowStep)
currency_repo = BaseRepository[Currency, Any, Any](Currency)
delegation_repo = BaseRepository[Delegation, Any, Any](Delegation)
global_setting_repo = BaseRepository[GlobalSetting, Any, Any](GlobalSetting)
approver_amount_repo = BaseRepository[ApproverAmount, Any, Any](ApproverAmount)
approver_gl_repo = BaseRepository[ApproverGL, Any, Any](ApproverGL)
approver_number_repo = BaseRepository[ApproverNumber, Any, Any](ApproverNumber)
approver_default_repo = BaseRepository[ApproverDefault, Any, Any](ApproverDefault)
vendor_metadata_repo = BaseRepository[VendorMetadata, Any, Any](VendorMetadata)
vendor_workflow_repo = BaseRepository[VendorWorkflow, Any, Any](VendorWorkflow)
codification_workflow_repo = BaseRepository[CodificationWorkflow, Any, Any](CodificationWorkflow)
coding_history_repo = BaseRepository[CodingHistory, Any, Any](CodingHistory)
raw_extraction_data_repo = BaseRepository[RawExtractionData, Any, Any](RawExtractionData)
invoice_registry_repo = BaseRepository[InvoiceRegistry, Any, Any](InvoiceRegistry)
invoice_status_history_repo = BaseRepository[InvoiceStatusHistory, Any, Any](InvoiceStatusHistory)
invoice_assigned_approver_repo = BaseRepository[InvoiceAssignedApprover, Any, Any](InvoiceAssignedApprover)
invoice_approved_by_repo = BaseRepository[InvoiceApprovedBy, Any, Any](InvoiceApprovedBy)

# Aliases for backward compatibility
entity_repo = entity_master_repo
vendor_repo = vendor_master_repo
tds_repo = tds_rate_repo
gl_repo = gl_master_repo
lob_repo = lob_master_repo
dept_repo = department_master_repo
customer_repo = customer_master_repo
item_repo = item_master_repo
exchange_repo = exchange_rate_master_repo
audit_repo = audit_log_repo
raw_extraction_repo = raw_extraction_data_repo
