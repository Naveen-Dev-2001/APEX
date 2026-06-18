from fastapi import APIRouter, HTTPException, Body, UploadFile, File, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import asc, func, Boolean, String, DateTime
from sqlalchemy.exc import IntegrityError
import traceback
import pandas as pd
import numpy as np
import io
import re
import json
from datetime import datetime
from typing import Dict, Any, List, Union
import logging

logger = logging.getLogger(__name__)

from common.database.database import get_db
from common.models.db_models import (
    EntityMaster, VendorMaster, TdsRate, GLMaster,
    LOBMaster, DepartmentMaster, CustomerMaster, ItemMaster, ExchangeRateMaster,
    Currency, Invoice, DeletedInvoice, Coding, AuditLog, WorkflowStep, 
    Delegation, VendorWorkflow, CodificationWorkflow
)
from common.repository.repositories import (
    entity_master_repo, vendor_master_repo, tds_rate_repo, gl_master_repo, lob_master_repo, department_master_repo, 
    customer_master_repo, item_master_repo, exchange_rate_master_repo,
    currency_repo
)
from common.auth.jwt import get_current_user
from common.models.user import UserResponse
from common.ai.vector_matcher import find_best_vendor_match

router = APIRouter(tags=["Master Data"])

# Mapping frontend tab names to SQLAlchemy models
TAB_MODEL_MAP = {
    "Entity_Master": EntityMaster,
    "Vendor_Master": VendorMaster,
    "Line_Items": ItemMaster,
    "TDS_Rates": TdsRate,
    "GL": GLMaster,
    "LOB": LOBMaster,
    "Department": DepartmentMaster,
    "Customer": CustomerMaster,
    "Entity": EntityMaster,
    "Vendor": VendorMaster,
    "Item": ItemMaster,
    "TDS": TdsRate,
    # Frontend fallback aliases
    "master_data_Entity_Master": EntityMaster,
    "master_data_Vendor_Master": VendorMaster,
    "master_data_Line_Items": ItemMaster,
    "master_data_TDS_Rates": TdsRate,
    "master_data_GL": GLMaster,
    "master_data_LOB": LOBMaster,
    "master_data_Department": DepartmentMaster,
    "master_data_Customer": CustomerMaster,
    "master_data_Item": ItemMaster,
    "Exchange_Rate": ExchangeRateMaster,
    "master_data_Exchange_Rate": ExchangeRateMaster,
    "Currency": Currency,
    "master_data_Currency": Currency
}

# Search fields for each model
TAB_SEARCH_FIELDS = {
    "Entity_Master": ["entity_id", "entity_name", "registered_address", "city"],
    "Vendor_Master": ["vendor_id", "vendor_name", "address_line1", "city", "primary_email_address"],
    "Line_Items": ["item_id", "name", "gl_group"],
    "TDS_Rates": ["section", "nature_of_payment"],
    "GL": ["account_number", "title", "account_name", "account_code", "account_type"],
    "LOB": ["lob_id", "name"],
    "Department": ["department_id", "department_name"],
    "Customer": ["customer_id", "customer_name"],
    "Exchange_Rate": ["base_currency", "target_currency", "rate_key", "rate_type", "exchange_rate", "effective_date"],
    "Currency": ["code", "name"],
    "Entity": ["entity_id", "entity_name"],
    "Vendor": ["vendor_id", "vendor_name"],
    "Item": ["item_id", "name"]
}

TAB_REPO_MAP = {
    "Entity_Master": entity_master_repo,
    "Vendor_Master": vendor_master_repo,
    "Line_Items": item_master_repo,
    "TDS_Rates": tds_rate_repo,
    "GL": gl_master_repo,
    "LOB": lob_master_repo,
    "Department": department_master_repo,
    "Customer": customer_master_repo,
    "Entity": entity_master_repo,
    "Vendor": vendor_master_repo,
    "Item": item_master_repo,
    "TDS": tds_rate_repo,
    "Exchange_Rate": exchange_rate_master_repo,
    "Currency": currency_repo
}


def normalize_column(col_name: str) -> str:
    """Normalize Excel column names to snake_case attribute names."""
    # Remove special characters, replace spaces/hyphens with underscores, lowercase
    name = re.sub(r'[^a-zA-Z0-9\s_]', '', str(col_name))
    name = name.strip().replace(' ', '_').replace('-', '_').lower()
    # Handle specific common variations/typos
    if 'terittory' in name:
        name = name.replace('terittory', 'territory')

    mapping = {
        "gst_use_tax_eligibility_configuration": "gst_eligibility",
        "tdswithhold_tax_applicability_configuration": "tds_applicability",
        "tds_percentage": "tds_percentage",
        "tds_section_code_and_description": "tds_section_code",
        "workflow_applicability_configuration": "workflow_applicable",
        "line_grouping": "line_grouping",
        "gst_applicable": "gst_applicable"
    }
    return mapping.get(name, name)


class SearchVendorRequest(BaseModel):
    vendor_name: str
    vendor_address: str = None


@router.post("/search-vendor")
def search_vendor(
    request: SearchVendorRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Search for a vendor in the active Vendor Master list.
    """
    result = find_best_vendor_match(
        db, request.vendor_name, request.vendor_address)
    if result and result["match"]:
        return {"match": result["match"], "score": result["score"], "method": result["method"]}
    return {"match": None, "score": 0.0, "method": "none"}


@router.post("/sync-vendors")
async def trigger_vendor_sync(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Trigger manual sync of vendors from Sage Intacct.
    """
    from common.utils.erp_locator import get_erp_class
    VendorSyncService = get_erp_class("services.vendor_sync_service", "VendorSyncService")
    sync_service = VendorSyncService(db)
    result = await sync_service.sync_vendors()
    return result


@router.post("/sync/{tab_name}")
async def trigger_master_sync(
    tab_name: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Trigger manual sync for specific master data.
    """
    from common.utils.erp_locator import get_erp_class
    GLSyncService = get_erp_class("services.master_sync_services", "GLSyncService")
    LOBSyncService = get_erp_class("services.master_sync_services", "LOBSyncService")
    DepartmentSyncService = get_erp_class("services.master_sync_services", "DepartmentSyncService")
    CustomerSyncService = get_erp_class("services.master_sync_services", "CustomerSyncService")
    ItemSyncService = get_erp_class("services.master_sync_services", "ItemSyncService")
    ExchangeRateSyncService = get_erp_class("services.master_sync_services", "ExchangeRateSyncService")
    EntitySyncService = get_erp_class("services.master_sync_services", "EntitySyncService")

    services = {
        "GL": GLSyncService,
        "LOB": LOBSyncService,
        "Department": DepartmentSyncService,
        "Customer": CustomerSyncService,
        "Item": ItemSyncService,
        "Line_Items": ItemSyncService,
        "Exchange_Rate": ExchangeRateSyncService,
        "Entity": EntitySyncService,
        "Entity_Master": EntitySyncService
    }

    service_class = services.get(tab_name)
    if not service_class:
        if tab_name in ["Vendor", "Vendor_Master"]:
            from common.utils.erp_locator import get_erp_class
            VendorSyncService = get_erp_class("services.vendor_sync_service", "VendorSyncService")
            background_tasks.add_task(_run_sync, VendorSyncService(db).sync_vendors)
            return {"status": "success", "message": "Sync started for Vendor"}
        raise HTTPException(400, f"Sync not supported for {tab_name}")

    method_map = {
        "GL": "sync_gl_accounts",
        "LOB": "sync_lob",
        "Department": "sync_departments",
        "Customer": "sync_customers",
        "Item": "sync_items",
        "Line_Items": "sync_items",
        "Exchange_Rate": "sync_exchange_rates",
        "Entity": "sync_entities",
        "Entity_Master": "sync_entities"
    }

    method_name = method_map.get(tab_name)
    sync_service = service_class(db)
    if not hasattr(sync_service, method_name):
        raise HTTPException(500, f"Service method {method_name} not found")

    background_tasks.add_task(_run_sync, getattr(sync_service, method_name))
    return {"status": "success", "message": f"Sync started for {tab_name}"}


async def _run_sync(method):
    try:
        await method()
    except Exception as e:
        if "Network issue try again" in str(e):
            logger.error(f"Sync network error: {e}")
        else:
            logger.error(f"Sync error: {e}", exc_info=True)


@router.get("/entities")
def get_entities(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get all active entities from the structured table.
    Used by SelectEntity.jsx
    """
    entities = db.query(EntityMaster).all()
    result = []
    for e in entities:
        row_dict = {}
        for column in e.__table__.columns:
            val = getattr(e, column.name)
            if isinstance(val, (datetime)):
                val = val.isoformat()
            elif isinstance(val, (float)) and np.isnan(val):
                val = None
            row_dict[column.name] = val
        result.append(row_dict)
    return result


@router.get("/files")
def list_files(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    List status of the fixed master data tabs by checking if tables have data.
    """
    tabs = ["Entity_Master", "Vendor_Master",
            "TDS_Rates", "Item", "Exchange_Rate"]
    # Add new tabs if needed by frontend
    additional_tabs = ["GL", "LOB", "Department", "Customer"]

    result = []

    for tab in tabs + additional_tabs:
        model = TAB_MODEL_MAP.get(tab)
        if not model:
            continue

        count = db.query(func.count(model.id)).scalar()
        is_vendor = tab in ["Vendor_Master", "vendor_master", "Vendor"]

        if count > 0 or is_vendor:
            result.append({
                "id": tab,
                "tab_name": tab,
                "file_name": f"API Sync ({count} rows)" if is_vendor else f"Structured Table ({count} rows)",
                "uploaded_at": None,
                "uploaded_by": "system",
                "status": "active",
                "sheets": [{"name": "Default", "collection_name": tab}]
            })
        else:
            result.append({
                "tab_name": tab,
                "file_name": None,
                "status": "missing",
                "sheets": []
            })
    return result

    vendor_id: int


@router.get("/vendor/{vendor_id}")
def get_vendor_master_by_vendor_id(
    vendor_id: str,
    db: Session = Depends(get_db)
):
    """
    Fetch all Vendor_Master rows for a given vendor_id
    """

    data = db.query(VendorMaster).filter(
        VendorMaster.vendor_id == vendor_id).all()

    print("data", data)

    if not data:
        raise HTTPException(
            status_code=404,
            detail=f"No records found for vendor_id: {vendor_id}"
        )

    result = []
    for v in data:
        row_dict = {}
        for column in v.__table__.columns:
            row_dict[column.name] = getattr(v, column.name)
        result.append(row_dict)

    return result


@router.post("/upload")
async def upload_master_file(
    tab_name: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    try:
        model = TAB_MODEL_MAP.get(tab_name)
        if not model:
            raise HTTPException(400, f"Unsupported tab: {tab_name}")

        if not file.filename.endswith(('.xls', '.xlsx', '.csv')):
            raise HTTPException(
                400, "Invalid format. Use .xls, .xlsx, or .csv")

        contents = await file.read()

        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))

        df = df.replace({np.nan: None})

        # Normalize columns and prepare data
        model_cols = [c.name for c in model.__table__.columns if c.name not in [
            'id', 'created_at', 'updated_at']]

        records_to_insert = []
        for _, row in df.iterrows():
            record = {}
            row_dict = row.to_dict()

            # Map Excel column to model column
            excel_cols_normalized = {
                normalize_column(c): c for c in row_dict.keys()}

            for m_col in model_cols:
                # Direct match
                if m_col in excel_cols_normalized:
                    raw_val = row_dict[excel_cols_normalized[m_col]]

                    # Boolean Conversion for SQLAlchemy Boolean columns
                    col_info = model.__table__.columns.get(m_col)
                    if col_info is not None and isinstance(col_info.type, Boolean):
                        if isinstance(raw_val, str):
                            rv_lower = raw_val.strip().lower()
                            if rv_lower in ["yes", "true", "1", "y", "t", "eligible"]:
                                raw_val = True
                            elif rv_lower in ["no", "false", "0", "n", "f", "ineligible"]:
                                raw_val = False
                            else:
                                raw_val = None  # Or default
                        elif isinstance(raw_val, (int, float)):
                            raw_val = bool(raw_val)

                    elif col_info is not None and isinstance(col_info.type, String):
                        if raw_val is not None:
                            # Handle numeric types becoming strings, remove .0 if it's an integer-like float
                            if isinstance(raw_val, float) and raw_val.is_integer():
                                raw_val = str(int(raw_val))
                            else:
                                raw_val = str(raw_val)
                            
                            if isinstance(raw_val, str) and raw_val.strip() == "":
                                raw_val = None

                    record[m_col] = raw_val
                # Also check some variations if needed

            if record:
                # Defaults for Vendor Master Config
                if tab_name == "Vendor_Master" or tab_name == "vendor_master":
                    if record.get("gst_eligibility") is None:
                        record["gst_eligibility"] = False
                    if record.get("tds_applicability") is None:
                        record["tds_applicability"] = False
                    if record.get("workflow_applicable") is None:
                        record["workflow_applicable"] = True
                    if record.get("line_grouping") is None:
                        record["line_grouping"] = False
                    
                    # Zoho compatibility: Map display_name / company_name to vendor_name / vendor_id if they are missing
                    if not record.get("vendor_name"):
                        record["vendor_name"] = (record.get("display_name") or record.get("company_name") or "Unknown")[:200]
                    if not record.get("vendor_id"):
                        record["vendor_id"] = record["vendor_name"][:100]

                if tab_name == "Entity_Master" or tab_name == "entity_master":
                    if record.get("gst_applicable") is None:
                        record["gst_applicable"] = True

                if tab_name in ["GL", "GL_Master", "gl_master", "master_data_GL", "master_data_GL_Master"]:
                    if not record.get("title"):
                        record["title"] = (record.get("account_name") or "Unknown")[:200]
                    if not record.get("account_name"):
                        record["account_name"] = record.get("title")
                    if not record.get("account_number"):
                        record["account_number"] = (record.get("account_code") or "Unknown")[:100]
                    if not record.get("account_code"):
                        record["account_code"] = record.get("account_number")

                records_to_insert.append(record)

        # Deduplicate records based on unique key to prevent db IntegrityErrors
        if tab_name in ["GL", "GL_Master", "gl_master", "master_data_GL", "master_data_GL_Master"]:
            seen_acc_nums = set()
            deduped_records = []
            for r in records_to_insert:
                acc_num = r.get("account_number")
                if acc_num not in seen_acc_nums:
                    seen_acc_nums.add(acc_num)
                    deduped_records.append(r)
            records_to_insert = deduped_records

        if tab_name in ["Vendor_Master", "vendor_master", "Vendor", "master_data_Vendor_Master"]:
            seen_vendor_ids = set()
            deduped_records = []
            for r in records_to_insert:
                v_id = r.get("vendor_id")
                if v_id not in seen_vendor_ids:
                    seen_vendor_ids.add(v_id)
                    deduped_records.append(r)
            records_to_insert = deduped_records

        # Clear existing and insert (except for Entity Master which skips duplicates)
        repo = TAB_REPO_MAP.get(tab_name)
        if tab_name in ["Entity_Master", "entity_master", "Entity"]:
            # For Entity Master, we don't delete all. We skip existing ones.
            if records_to_insert:
                # Fetch existing IDs and Names to avoid duplicates
                existing_entities = db.query(EntityMaster.entity_id, EntityMaster.entity_name).all()
                existing_ids = {e.entity_id for e in existing_entities if e.entity_id}
                existing_names = {e.entity_name for e in existing_entities if e.entity_name}
                
                # Filter out records that already exist
                filtered_records = []
                for r in records_to_insert:
                    r_id = str(r.get("entity_id", ""))
                    r_name = str(r.get("entity_name", ""))
                    if r_id not in existing_ids and r_name not in existing_names:
                        filtered_records.append(r)
                        # Add to sets to avoid internal duplicates within the same upload file
                        existing_ids.add(r_id)
                        existing_names.add(r_name)
                
                if filtered_records:
                    if repo:
                        repo.bulk_create(db, obj_list=filtered_records)
                    else:
                        db.bulk_insert_mappings(model, filtered_records)
                        db.commit()
            
            return {"message": f"Processed {len(records_to_insert)} rows. Uploaded {len(filtered_records) if 'filtered_records' in locals() else 0} new rows to {tab_name}."}

        # Standard behavior for other tabs: Clear and Replace
        if repo:
            repo.delete_all(db)
            if records_to_insert:
                repo.bulk_create(db, obj_list=records_to_insert)
        else:
             # Fallback for aliases not in repo map
             db.query(model).delete()
             if records_to_insert:
                 db.bulk_insert_mappings(model, records_to_insert)
             db.commit()

        return {"message": f"Uploaded {len(records_to_insert)} rows to {tab_name}"}

    except Exception as e:
        db.rollback()
        print(f"Error uploading: {e}")
        traceback.print_exc()
        raise HTTPException(500, f"Upload failed: {str(e)}")


@router.delete("/files/{tab_name}")
async def delete_tab_data(
    tab_name: str,
    db: Session = Depends(get_db)
):
    # Special handling for Entity Master: Preserve entities with invoices or top-level entities
    if tab_name in ["Entity_Master", "entity_master", "Entity", "master_data_Entity_Master"]:
        try:
            # 1. Collect all entity_ids currently in use to avoid breaking data integrity
            used_ids = set()
            
            # Check Invoices (Active and Deleted)
            active_inv = db.query(Invoice.entity).filter(Invoice.entity.isnot(None)).distinct().all()
            deleted_inv = db.query(DeletedInvoice.entity).filter(DeletedInvoice.entity.isnot(None)).distinct().all()
            used_ids.update([r[0] for r in active_inv])
            used_ids.update([r[0] for r in deleted_inv])
            
            # Check other referencing tables to prevent FK violations
            used_ids.update([r[0] for r in db.query(Coding.entity).filter(Coding.entity.isnot(None)).distinct().all()])
            used_ids.update([r[0] for r in db.query(AuditLog.entity).filter(AuditLog.entity.isnot(None)).distinct().all()])
            used_ids.update([r[0] for r in db.query(WorkflowStep.entity).filter(WorkflowStep.entity.isnot(None)).distinct().all()])
            used_ids.update([r[0] for r in db.query(Delegation.entity).filter(Delegation.entity.isnot(None)).distinct().all()])
            used_ids.update([r[0] for r in db.query(VendorWorkflow.entity).filter(VendorWorkflow.entity.isnot(None)).distinct().all()])
            used_ids.update([r[0] for r in db.query(CodificationWorkflow.entity).filter(CodificationWorkflow.entity.isnot(None)).distinct().all()])
            used_ids.update([r[0] for r in db.query(VendorMaster.entity_id).filter(VendorMaster.entity_id.isnot(None)).distinct().all()])

            # 2. Identify "Top Level" entities that should always be preserved
            top_level_entities = db.query(EntityMaster.entity_id).filter(
                (EntityMaster.entity_name == "Top Level") | 
                (EntityMaster.entity_name == "Default Entity")
            ).all()
            used_ids.update([r[0] for r in top_level_entities])

            # 3. Delete only those that are NOT used and NOT top-level
            delete_query = db.query(EntityMaster).filter(EntityMaster.entity_id.not_in(used_ids))
            count = delete_query.delete(synchronize_session=False)
            db.commit()
            
            return {"message": f"Cleared {count} unused entities. Entities with invoices or Top Level status were preserved."}
        except Exception as e:
            db.rollback()
            logger.error(f"Error clearing Entity Master: {e}")
            raise HTTPException(500, f"Failed to clear Entity Master: {str(e)}")

    repo = TAB_REPO_MAP.get(tab_name)
    if repo:
        repo.delete_all(db)
    else:
        model = TAB_MODEL_MAP.get(tab_name)
        if model:
            db.query(model).delete()
            db.commit()
        else:
            raise HTTPException(400, f"No model or repository found for {tab_name}")
    return {"message": f"Data for {tab_name} deleted successfully"}


@router.get("/sheet/{identifier}")
async def get_sheet_data(
    identifier: str,
    page: int = 1,
    page_size: int = 1000,
    search: str = None,
    filters: str = None,
    sort_by: str = None,
    sort_dir: str = 'asc',
    db: Session = Depends(get_db)
):
    model = TAB_MODEL_MAP.get(identifier)
    if not model:
        raise HTTPException(404, "Table not found")

    # Normalize identifier (remove prefix used by some frontend components)
    clean_id = identifier.replace("master_data_", "")
    repo = TAB_REPO_MAP.get(clean_id) or TAB_REPO_MAP.get(identifier)

    # Use generic pagination if repo exists
    if repo:
        skip = (page - 1) * page_size
        search_fields = TAB_SEARCH_FIELDS.get(clean_id) or TAB_SEARCH_FIELDS.get(identifier)
        
        repo_filters = {}
        if filters:
            try:
                repo_filters = json.loads(filters)
            except Exception as e:
                logger.error(f"Error parsing filters: {e}")

        paginated_res = repo.get_paginated(
            db,
            skip=skip,
            limit=page_size,
            filters=repo_filters,
            search=search,
            search_fields=search_fields,
            order_by=sort_by,
            descending=(sort_dir.lower() == 'desc')
        )

        rows = paginated_res["data"]
        total_count = paginated_res["total"]
    else:
        # Fallback for models without repositories (if any)
        rows = db.query(model).order_by(model.id).all()
        total_count = len(rows)

    # Pre-calculate invoice counts for Entity Master to avoid N+1 queries
    active_invoice_map = {}
    deleted_invoice_map = {}
    if identifier in ["Entity_Master", "entity_master", "Entity"]:
        # Count active invoices per entity
        active_counts = db.query(
            Invoice.entity, 
            func.count(Invoice.id).label('count')
        ).filter(Invoice.entity.isnot(None)).group_by(Invoice.entity).all()
        active_invoice_map = {e: c for e, c in active_counts}

        # Count deleted invoices per entity
        deleted_counts = db.query(
            DeletedInvoice.entity, 
            func.count(DeletedInvoice.id).label('count')
        ).filter(DeletedInvoice.entity.isnot(None)).group_by(DeletedInvoice.entity).all()
        deleted_invoice_map = {e: c for e, c in deleted_counts}

    # Convert SQLAlchemy objects to dicts
    result = []
    for row in rows:
        row_dict = {}
        for column in row.__table__.columns:
            val = getattr(row, column.name)
            if isinstance(val, (datetime)):
                val = val.isoformat()
            elif isinstance(val, (float)) and np.isnan(val):
                val = None

            # No custom mapping required, matching frontend expectations.
            if identifier in ["TDS_Rates", "tds_rates", "TDS"]:
                # Keep snake_case keys to match frontend table accessors
                # (section, nature_of_payment, tds_rate)
                if column.name in ["section", "nature_of_payment", "tds_rate"]:
                    row_dict[column.name] = val
                    continue

            row_dict[column.name] = val
        
        # Add invoice_count for Entity Master
        if identifier in ["Entity_Master", "entity_master", "Entity"]:
            ent_id = row_dict.get('entity_id')
            row_dict['invoice_count'] = active_invoice_map.get(ent_id, 0) + deleted_invoice_map.get(ent_id, 0)

        result.append(row_dict)

    # Wrap result in a standardized paginated response
    return {
        "data": result,
        "total": total_count,
        "page": page,
        "page_size": page_size
    }


@router.get("/sheet/{identifier}/filter-options")
def get_master_filter_options(
    identifier: str,
    column: str,
    search: str = None,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """
    Returns unique values for a specific column in a master data table.
    Used by DataTable filter dropdowns.
    Supports optional search and limit for better performance with large datasets.
    """
    model = TAB_MODEL_MAP.get(identifier)
    if not model:
        # Try without prefix
        clean_id = identifier.replace("master_data_", "")
        model = TAB_MODEL_MAP.get(clean_id)
        
    if not model:
        raise HTTPException(404, "Table not found")

    # Check if column exists in the model
    if not hasattr(model, column):
        raise HTTPException(400, f"Column '{column}' not found in {identifier}")

    try:
        col_attr = getattr(model, column)
        query = db.query(col_attr).filter(col_attr.isnot(None))
        
        if search:
            # Use ilike for case-insensitive search
            query = query.filter(col_attr.ilike(f"%{search}%"))
            
        query = query.distinct()
        
        if limit:
            query = query.limit(limit)
            
        results = query.all()
        options = [r[0] for r in results]
        
        # Sort options for better UX
        return sorted(options, key=lambda x: str(x))
    except Exception as e:
        logger.error(f"Error fetching filter options for {identifier}.{column}: {e}")
        return []



@router.get("/bulk-coding-data")
async def get_bulk_coding_data(
    page_size: int = 2000,
    db: Session = Depends(get_db)
):
    """
    Returns GL, LOB, Department, Customer, and Item master data in a single
    request so the CodingTab doesn't have to fire 5 separate round-trips.
    Each dataset is fetched independently and returned together.
    """
    import numpy as np
    from decimal import Decimal

    def fetch_rows(model, page_size: int):
        try:
            rows = db.query(model).order_by(model.id).limit(page_size).all()
            result = []
            for row in rows:
                row_dict = {}
                for column in row.__table__.columns:
                    val = getattr(row, column.name)
                    if isinstance(val, datetime):
                        val = val.isoformat()
                    elif isinstance(val, Decimal):
                        val = float(val)
                    elif isinstance(val, float) and np.isnan(val):
                        val = None
                    row_dict[column.name] = val
                result.append(row_dict)
            
            logger.info(f"Fetched {len(result)} rows for {model.__name__}")
            return result
        except Exception as e:
            logger.error(f"Error fetching rows for {model.__name__}: {e}")
            return []

    try:
        return {
            "gl":         fetch_rows(GLMaster, page_size),
            "lob":        fetch_rows(LOBMaster, page_size),
            "department": fetch_rows(DepartmentMaster, page_size),
            "customer":   fetch_rows(CustomerMaster, page_size),
            "item":       fetch_rows(ItemMaster, page_size),
        }
    except Exception as e:
        logger.error(f"Error in get_bulk_coding_data: {e}")
        traceback.print_exc()
        return {
            "gl": [], "lob": [], "department": [], "customer": [], "item": []
        }




@router.get("/getvendors")
def get_all_vendors(db: Session = Depends(get_db)):
    """
    Fetch all vendor_id and vendor_name
    """

    data = db.query(
        VendorMaster.vendor_id,
        VendorMaster.vendor_name
    ).all()

    if not data:
        raise HTTPException(
            status_code=404,
            detail="No vendors found"
        )

    # Convert tuple → dict
    result = [
        {
            "vendor_id": row.vendor_id,
            "vendor_name": row.vendor_name
        }
        for row in data
    ]

    return result


@router.post("/sheet/{identifier}/add")
def add_row(
    identifier: str,
    request: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    model = TAB_MODEL_MAP.get(identifier)
    if not model:
        raise HTTPException(404, "Table not found")

    # Remove metadata if present
    data = request.get("new_row", request)
    data.pop('id', None)
    data.pop('created_at', None)
    data.pop('updated_at', None)

    final_data = {}
    for k, v in data.items():
        m_col = k

        # Boolean Conversion
        col_info = model.__table__.columns.get(m_col)
        if col_info is not None and isinstance(col_info.type, Boolean):
            if isinstance(v, str):
                v_lower = v.strip().lower()
                if v_lower in ["yes", "true", "1", "eligible"]:
                    v = True
                elif v_lower in ["no", "false", "0", "ineligible"]:
                    v = False
            elif isinstance(v, (int, float)):
                v = bool(v)

        if v == "":
            v = None

        final_data[m_col] = v

    if identifier in ["Vendor_Master", "vendor_master", "Vendor"]:
        if not final_data.get("vendor_name"):
            final_data["vendor_name"] = (final_data.get("display_name") or final_data.get("company_name") or "Unknown")[:200]
        if not final_data.get("vendor_id"):
            final_data["vendor_id"] = final_data["vendor_name"][:100]

    if identifier in ["GL", "GL_Master", "gl_master", "master_data_GL", "master_data_GL_Master"]:
        if not final_data.get("title"):
            final_data["title"] = (final_data.get("account_name") or "Unknown")[:200]
        if not final_data.get("account_name"):
            final_data["account_name"] = final_data.get("title")
        if not final_data.get("account_number"):
            final_data["account_number"] = (final_data.get("account_code") or "Unknown")[:100]
        if not final_data.get("account_code"):
            final_data["account_code"] = final_data.get("account_number")


    repo = TAB_REPO_MAP.get(identifier)
    if not repo:
        raise HTTPException(404, "Table not found")

    # Check for existing Entity ID or Name to prevent duplicates
    if identifier in ["Entity_Master", "entity_master", "Entity"]:
        existing = db.query(EntityMaster).filter(
            (EntityMaster.entity_id == final_data.get('entity_id')) | 
            (EntityMaster.entity_name == final_data.get('entity_name'))
        ).first()
        if existing:
            raise HTTPException(400, "Entity ID or Entity Name already exists")

    try:
        new_record = repo.create(db, obj_in=final_data)
        return {"status": "success", "id": new_record.id}
    except IntegrityError as e:
        db.rollback()
        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
        if "FOREIGN KEY constraint" in error_msg:
            raise HTTPException(400, "Validation Error: A provided key (e.g., Entity ID, Vendor ID) does not exist in its parent master list. Please verify your data and try again.")
        elif any(term in error_msg for term in ["UNIQUE KEY constraint", "Violation of UNIQUE KEY", "unique index", "duplicate key"]):
            raise HTTPException(400, "Validation Error: A record with this unique identifier already exists.")
        else:
            raise HTTPException(400, f"Database Integrity Error: {error_msg}")


@router.patch("/sheet/{identifier}/edit")
def edit_row(
    identifier: str,
    request: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    repo = TAB_REPO_MAP.get(identifier)
    if not repo:
        raise HTTPException(404, "Table not found")

    # PREFER PK LOOKUP FOR SPEED
    updated_data = request.get("updated_row", {})
    record_id = updated_data.get('id')
    
    if record_id:
        record = repo.get(db, record_id)
    else:
        # Fallback to offset (Requires order_by for MSSQL)
        row_index = request.get("row_index")
        if row_index is not None:
             record = db.query(repo.model).order_by(repo.model.id).offset(row_index).limit(1).first()

    if not record:
        raise HTTPException(404, "Record not found")

    valid_update_data = {}
    for k, v in updated_data.items():
        if k in ['id', 'created_at', 'updated_at']:
            continue

        m_col = k
        if hasattr(record, m_col):
            # Do not allow updating entity_id or entity_name for Entity Master
            if identifier in ["Entity_Master", "entity_master", "Entity"] and m_col in ["entity_id", "entity_name"]:
                continue

            # Boolean Conversion
            col_info = repo.model.__table__.columns.get(m_col)
            if col_info is not None and isinstance(col_info.type, Boolean):
                if isinstance(v, str):
                    v_lower = v.strip().lower()
                    if v_lower in ["yes", "true", "1", "eligible"]:
                        v = True
                    elif v_lower in ["no", "false", "0", "ineligible"]:
                        v = False
                elif isinstance(v, (int, float)):
                    v = bool(v)
            
            if v == "":
                v = None
                
            valid_update_data[m_col] = v

    if identifier in ["Vendor_Master", "vendor_master", "Vendor"]:
        # If we updated display_name or company_name, sync vendor_name
        if "display_name" in valid_update_data or "company_name" in valid_update_data:
            new_name = valid_update_data.get("display_name") or valid_update_data.get("company_name") or getattr(record, "display_name") or getattr(record, "company_name")
            if new_name:
                valid_update_data["vendor_name"] = new_name[:200]

    if identifier in ["GL", "GL_Master", "gl_master", "master_data_GL", "master_data_GL_Master"]:
        if "account_name" in valid_update_data or "title" in valid_update_data:
            new_name = valid_update_data.get("account_name") or valid_update_data.get("title") or getattr(record, "account_name") or getattr(record, "title")
            if new_name:
                valid_update_data["account_name"] = new_name[:200]
                valid_update_data["title"] = new_name[:200]
        if "account_code" in valid_update_data or "account_number" in valid_update_data:
            new_code = valid_update_data.get("account_code") or valid_update_data.get("account_number") or getattr(record, "account_code") or getattr(record, "account_number")
            if new_code:
                valid_update_data["account_code"] = new_code[:100]
                valid_update_data["account_number"] = new_code[:100]


    try:
        repo.update(db, db_obj=record, obj_in=valid_update_data)
        return {"status": "updated"}
    except IntegrityError as e:
        db.rollback()
        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
        if "FOREIGN KEY constraint" in error_msg:
            raise HTTPException(400, "Validation Error: A provided key (e.g., Entity ID, Vendor ID) does not exist in its parent master list. Please verify your data and try again.")
        elif any(term in error_msg for term in ["UNIQUE KEY constraint", "Violation of UNIQUE KEY", "unique index", "duplicate key"]):
            raise HTTPException(400, "Validation Error: A record with this unique identifier already exists.")
        else:
            raise HTTPException(400, f"Database Integrity Error: {error_msg}")


@router.delete("/sheet/{identifier}/delete")
def delete_row(
    identifier: str,
    row_index: int,  # Frontend sends list index, we need ID or to query by offset
    db: Session = Depends(get_db)
):
    repo = TAB_REPO_MAP.get(identifier)
    if not repo:
        raise HTTPException(404, "Table not found")

    # Prefer primary key lookup for accuracy (frontend passes row.id)
    record = repo.get(db, id=row_index) if hasattr(repo, 'get') else db.query(repo.model).filter(repo.model.id == row_index).first()
    
    if not record:
        # Fallback to offset if record not found by ID (legacy behavior)
        record = db.query(repo.model).order_by(
            repo.model.id).offset(row_index).limit(1).first()
    
    if record:
        # Restriction: Prevent deletion if invoices exist for this entity
        if identifier in ["Entity_Master", "entity_master", "Entity"]:
            active_count = 0
            deleted_count = 0
            if record.entity_id:
                active_count = db.query(Invoice).filter(Invoice.entity == record.entity_id).count()
                deleted_count = db.query(DeletedInvoice).filter(DeletedInvoice.entity == record.entity_id).count()
            
            if active_count > 0 or deleted_count > 0:
                raise HTTPException(status_code=400, detail="invoices is under this level,you can't deelte")

        repo.remove(db, id=record.id)

    return {"status": "deleted"}
