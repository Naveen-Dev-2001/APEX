from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from typing import List, Optional, Union
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, asc
import json

from app.database.database import get_db
from app.models.db_models import (
    VendorWorkflow as DBVendorWorkflow,
    CodificationWorkflow as DBCodificationWorkflow,
    VendorMaster, LOBMaster, DepartmentMaster, User as DBUser
)
import json
from fastapi.responses import JSONResponse
from app.repository.repositories import (
    vendor_workflow_repo, codification_workflow_repo,
    vendor_repo, lob_repo, dept_repo, user_repo
)
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from app.models.workflow_vendor import VendorWorkflow, VendorWorkflowResponse
from app.models.workflow_codification import CodificationWorkflow, CodificationWorkflowResponse
from app.dependencies import get_current_entity

router = APIRouter(tags=["Workflow Configuration"])


def serialize_approver(val):
    if isinstance(val, list):
        return json.dumps(val)
    return str(val) if val else None


def deserialize_approver(val):
    if not val:
        return []
    if isinstance(val, str) and val.startswith("["):
        try:
            return json.loads(val)
        except:
            return [val]
    return [val] if val else []


def retrieve_single_approver(val):
    lst = deserialize_approver(val)
    return lst[0] if lst else None


def serialize_approver_(val):
    """Serialize ApproverSchema | dict | list | None → JSON string | None"""
    if val is None:
        return None  # store actual NULL, not "[]"

    # Pydantic ApproverSchema object
    if hasattr(val, "is_finance_team"):
        return json.dumps({
            "is_finance_team": val.is_finance_team,
            # preserve is_finance_team
            "users": [str(u) for u in (val.users or [])]
        })

    # Already a dict (e.g. from a PUT request passing raw dict)
    if isinstance(val, dict):
        return json.dumps({
            "is_finance_team": val.get("is_finance_team", False),
            "users": val.get("users", [])
        })

    # Legacy plain list
    if isinstance(val, list):
        return json.dumps({"is_finance_team": False, "users": val})

    return None


def deserialize_users(val):
    if not val:
        return []
    try:
        return json.loads(val)
    except:
        return []


def deserialize_approver_schema(val):
    """Returns a dict like {is_finance_team: bool, users: []} or None"""
    if not val:
        return None
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, dict):
                return parsed
            # legacy list format
            return {"is_finance_team": False, "users": parsed}
        except:
            return {"is_finance_team": False, "users": [val]}
    if isinstance(val, list):
        return {"is_finance_team": False, "users": val}
    return None


# In workflow_config.py

def transform_workflow_response(w):
    return {
        "id": w.id,
        "vendor_id": getattr(w, 'vendor_id', None),
        "vendor_name": getattr(w, 'vendor_name', None),
        "lob": getattr(w, 'lob', None),
        "department_id": getattr(w, 'department_id', None),
        #  Use deserialize_approver_schema (returns dict | None) instead of
        #    deserialize_users (returns list) to match Optional[dict] response model
        "mandatory_approver_1": deserialize_approver(w.mandatory_approver_1),
        "mandatory_approver_2": deserialize_approver(w.mandatory_approver_2),
        "mandatory_approver_3": deserialize_approver(w.mandatory_approver_3),
        "mandatory_approver_4": deserialize_approver(w.mandatory_approver_4),
        "mandatory_approver_5": deserialize_approver(w.mandatory_approver_5),
        "is_threshold_enabled": getattr(w, 'is_threshold_enabled', False),
        "amount_threshold": w.amount_threshold,
        #  Same fix here
        "threshold_approver": deserialize_approver(w.threshold_approver),
        "approver_count": w.approver_count or 1,
        "posting_approver": getattr(w, 'posting_approver', None),
        "entity": getattr(w, 'entity', None),
        "created_at": getattr(w, 'created_at', datetime.utcnow()),
        "updated_at": getattr(w, 'updated_at', None),
        "approver_flags": deserialize_approver_flags(w.approver_flags),
    }


def deserialize_approver_flags(val) -> dict:
    """Returns dict like {"1": True, "2": False} or empty dict."""
    if not val:
        return {}
    if isinstance(val, dict):
        return val
    try:
        parsed = json.loads(val)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}

# ==================== VENDOR WORKFLOW ====================


@router.get("/vendor", response_model=List[VendorWorkflowResponse])
async def get_vendor_workflows(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    workflows = vendor_workflow_repo.get_multi(
        db,
        filters={"entity": entity},
        limit=1000  # Assume reasonable number of workflows
    )

    return [transform_workflow_response(w) for w in workflows]


@router.post("/vendor", response_model=VendorWorkflowResponse)
async def create_vendor_workflow(
    workflow: VendorWorkflow,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    print("workflow", workflow)
    existing_list = vendor_workflow_repo.get_multi(
        db,
        filters={"vendor_id": workflow.vendor_id, "entity": entity},
        limit=1
    )
    existing = existing_list[0] if existing_list else None

    if existing:
        raise HTTPException(
            400, f"Workflow already exists for vendor '{workflow.vendor_id}'")

    try:
        new_wf_data = {
            "entity": entity,
            "vendor_id": workflow.vendor_id,
            "vendor_name": workflow.vendor_name,
            "approver_count": workflow.approver_count,

            "mandatory_approver_1": json.dumps(workflow.mandatory_approver_1) if workflow.mandatory_approver_1 else None,
            "mandatory_approver_2": json.dumps(workflow.mandatory_approver_2) if workflow.mandatory_approver_2 else None,
            "mandatory_approver_3": json.dumps(workflow.mandatory_approver_3) if workflow.mandatory_approver_3 else None,
            "mandatory_approver_4": json.dumps(workflow.mandatory_approver_4) if workflow.mandatory_approver_4 else None,
            "mandatory_approver_5": json.dumps(workflow.mandatory_approver_5) if workflow.mandatory_approver_5 else None,

            "is_threshold_enabled": workflow.is_threshold_enabled,
            "amount_threshold": workflow.amount_threshold if workflow.is_threshold_enabled else None,

            "threshold_approver": json.dumps(workflow.threshold_approver) if workflow.threshold_approver else None,

            "created_at": datetime.utcnow(),
            "posting_approver": str(workflow.posting_approver) if workflow.posting_approver else None,
            "approver_flags": json.dumps(workflow.approver_flags) if workflow.approver_flags else None,
        }
        new_workflow = vendor_workflow_repo.create(db, obj_in=new_wf_data)

        return transform_workflow_response(new_workflow)
    except Exception as e:
        db.rollback()
        import traceback
        error_trace = traceback.format_exc()
        print(error_trace)
        raise HTTPException(400, detail=f"Save Error: {str(e)}")


@router.put("/vendor/{workflow_id}", response_model=VendorWorkflowResponse)
async def update_vendor_workflow(
    workflow_id: int,
    workflow: VendorWorkflow,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    existing = vendor_workflow_repo.get(db, workflow_id)
    if not existing or existing.entity != entity:
        raise HTTPException(404, "Workflow not found")

    if not existing:
        raise HTTPException(404, "Workflow not found")

    try:
        update_data = {
            "vendor_id": workflow.vendor_id,
            "vendor_name": workflow.vendor_name,
            "approver_count": workflow.approver_count,

            "mandatory_approver_1": json.dumps(workflow.mandatory_approver_1) if workflow.mandatory_approver_1 else None,
            "mandatory_approver_2": json.dumps(workflow.mandatory_approver_2) if workflow.mandatory_approver_2 else None,
            "mandatory_approver_3": json.dumps(workflow.mandatory_approver_3) if workflow.mandatory_approver_3 else None,
            "mandatory_approver_4": json.dumps(workflow.mandatory_approver_4) if workflow.mandatory_approver_4 else None,
            "mandatory_approver_5": json.dumps(workflow.mandatory_approver_5) if workflow.mandatory_approver_5 else None,

            "is_threshold_enabled": workflow.is_threshold_enabled,
            "amount_threshold": workflow.amount_threshold if workflow.is_threshold_enabled else None,

            "threshold_approver": json.dumps(workflow.threshold_approver) if workflow.threshold_approver else None,

            "posting_approver": str(workflow.posting_approver) if workflow.posting_approver else None,
            "approver_flags": json.dumps(workflow.approver_flags) if workflow.approver_flags else None,

            "entity": entity,
            "updated_at": datetime.utcnow()
        }

        updated_wf = vendor_workflow_repo.update(
            db, db_obj=existing, obj_in=update_data)
        return transform_workflow_response(updated_wf)
    except Exception as e:
        db.rollback()
        raise HTTPException(400, detail=f"Update Error: {str(e)}")


@router.delete("/vendor/{workflow_id}")
async def delete_vendor_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    existing = vendor_workflow_repo.get(db, workflow_id)
    if not existing or existing.entity != entity:
        raise HTTPException(404, "Workflow not found")

    vendor_workflow_repo.remove(db, id=workflow_id)
    return {"message": "Workflow deleted successfully"}


@router.get("/vendor/vendors")
async def get_workflow_vendors(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    # Move filtering to DB level. 
    # workflow_applicable is a Boolean column. 
    # We want True or NULL (for backward compatibility).
    vendors = vendor_repo.get_multi(
        db,
        expressions=[or_(
            VendorMaster.workflow_applicable == True,
            VendorMaster.workflow_applicable == None
        )],
        limit=10000,
        order_by="vendor_name"
    )
    
    workflow_vendors = []
    for v in vendors:
        label = f"{v.vendor_id} - {v.vendor_name}" if v.vendor_id else str(v.vendor_name)
        unique_val = f"{v.vendor_id}|{v.vendor_name}" if v.vendor_id else str(v.vendor_name)
        workflow_vendors.append({
            "id": str(v.vendor_id) if v.vendor_id else "",
            "value": unique_val,
            "label": label,
            "vendor_name": str(v.vendor_name)
        })
    return workflow_vendors

# ==================== CODIFICATION WORKFLOW ====================


@router.get("/codification", response_model=List[CodificationWorkflowResponse])
async def get_codification_workflows(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    workflows = codification_workflow_repo.get_multi(
        db,
        filters={"entity": entity},
        limit=1000
    )

    return [transform_workflow_response(w) for w in workflows]


@router.post("/codification", response_model=CodificationWorkflowResponse)
async def create_codification_workflow(
    workflow: CodificationWorkflow,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    # Check for duplicate lob + department_id under same entity
    existing_list = codification_workflow_repo.get_multi(
        db,
        filters={"lob": workflow.lob,
                 "department_id": workflow.department_id, "entity": entity},
        limit=1
    )
    existing = existing_list[0] if existing_list else None

    if existing:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "DUPLICATE_WORKFLOW",
                "message": f"Workflow already exists for LOB '{workflow.lob}' and Department '{workflow.department_id}'",
                "field": "lob_department",
                "lob": workflow.lob,
                "department_id": workflow.department_id
            }
        )

    try:
        new_wf_data = {
            "entity": entity,
            "lob": workflow.lob,
            "department_id": workflow.department_id,
            "approver_count": workflow.approver_count,

            # Serialize lists → JSON strings for SQL Server Text columns
            "mandatory_approver_1": json.dumps(workflow.mandatory_approver_1) if workflow.mandatory_approver_1 else None,
            "mandatory_approver_2": json.dumps(workflow.mandatory_approver_2) if workflow.mandatory_approver_2 else None,
            "mandatory_approver_3": json.dumps(workflow.mandatory_approver_3) if workflow.mandatory_approver_3 else None,
            "mandatory_approver_4": json.dumps(workflow.mandatory_approver_4) if workflow.mandatory_approver_4 else None,
            "mandatory_approver_5": json.dumps(workflow.mandatory_approver_5) if workflow.mandatory_approver_5 else None,

            "is_threshold_enabled": workflow.is_threshold_enabled,
            "amount_threshold": workflow.amount_threshold if workflow.is_threshold_enabled else None,

            "threshold_approver": json.dumps(workflow.threshold_approver) if workflow.threshold_approver else None,

            "posting_approver": str(workflow.posting_approver) if workflow.posting_approver else None,
            "created_at": datetime.utcnow(),
            "updated_at": None,
            "approver_flags": json.dumps(workflow.approver_flags) if workflow.approver_flags else None,
        }

        new_workflow = codification_workflow_repo.create(
            db, obj_in=new_wf_data)
        return CodificationWorkflowResponse.model_validate(new_workflow)

    except Exception as e:
        db.rollback()
        import traceback
        error_trace = traceback.format_exc()
        print(error_trace)
        raise HTTPException(400, detail=f"Save Error: {str(e)}")


@router.put("/codification/{workflow_id}", response_model=CodificationWorkflowResponse)
async def update_codification_workflow(
    workflow_id: int,
    workflow: CodificationWorkflow,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    existing = codification_workflow_repo.get(db, workflow_id)
    if not existing or existing.entity != entity:
        raise HTTPException(404, "Workflow not found")

    if not existing:
        raise HTTPException(404, "Workflow not found")

    try:
        update_data = {
            "lob": workflow.lob,
            "department_id": workflow.department_id,
            "approver_count": workflow.approver_count,

            "mandatory_approver_1": json.dumps(workflow.mandatory_approver_1) if workflow.mandatory_approver_1 else None,
            "mandatory_approver_2": json.dumps(workflow.mandatory_approver_2) if workflow.mandatory_approver_2 else None,
            "mandatory_approver_3": json.dumps(workflow.mandatory_approver_3) if workflow.mandatory_approver_3 else None,
            "mandatory_approver_4": json.dumps(workflow.mandatory_approver_4) if workflow.mandatory_approver_4 else None,
            "mandatory_approver_5": json.dumps(workflow.mandatory_approver_5) if workflow.mandatory_approver_5 else None,

            "is_threshold_enabled": workflow.is_threshold_enabled,
            "amount_threshold": workflow.amount_threshold if workflow.is_threshold_enabled else None,
            "threshold_approver": json.dumps(workflow.threshold_approver) if workflow.threshold_approver else None,

            "posting_approver": workflow.posting_approver,
            "entity": entity,
            "updated_at": datetime.utcnow(),
            "approver_flags": json.dumps(workflow.approver_flags) if workflow.approver_flags else None,
        }

        updated_wf = codification_workflow_repo.update(
            db, db_obj=existing, obj_in=update_data)
        return transform_workflow_response(updated_wf)
    except Exception as e:
        db.rollback()
        raise HTTPException(400, detail=f"Update Error: {str(e)}")


@router.delete("/codification/{workflow_id}")
async def delete_codification_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    existing = codification_workflow_repo.get(db, workflow_id)
    if not existing or existing.entity != entity:
        raise HTTPException(404, "Workflow not found")

    codification_workflow_repo.remove(db, id=workflow_id)
    return {"message": "Workflow deleted successfully"}


@router.get("/codification/lobs")
async def get_lobs(db: Session = Depends(get_db)):
    # Sort by lob_id in DB
    lobs = lob_repo.get_multi(db, limit=1000, order_by="lob_id")
    result = []
    for w in lobs:
        val = str(w.lob_id) if w.lob_id is not None else str(w.id)
        result.append({
            "value": val,
            "label": f"{val} - {w.name}" if getattr(w, 'name', None) else val
        })
    return result


@router.get("/codification/departments")
async def get_departments(db: Session = Depends(get_db)):
    # Sort by department_id in DB
    depts = dept_repo.get_multi(db, limit=1000, order_by="department_id")
    result = []
    for w in depts:
        val = str(w.department_id) if w.department_id is not None else str(w.id)
        name = getattr(w, 'department_name', None) or getattr(w, 'name', None)
        result.append({
            "value": val,
            "label": f"{val} - {name}" if name else val
        })
    return result


@router.get("/approvers")
async def get_approvers(db: Session = Depends(get_db)):
    # Include users who have the 'approver' role, including those with dual roles like 'admin,approver'
    # but excluding those who are only 'admin'.
    approvers = user_repo.get_multi(
        db,
        expressions=[DBUser.role.ilike('%approver%')],
        limit=1000
    )
    return [{
        "value": a.email,
        "label": f"{a.username or a.email.split('@')[0]} ({a.email})",
        "department": a.department
    } for a in approvers if a.email]
