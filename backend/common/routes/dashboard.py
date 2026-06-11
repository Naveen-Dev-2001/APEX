from fastapi import APIRouter, Depends
from datetime import datetime
from sqlalchemy.orm import Session
import json
from enum import Enum
import re

from common.database.database import get_db
from common.models.db_models import Invoice, InvoiceStatusEnum
from common.repository.repositories import invoice_repo
from common.auth.jwt import get_current_user
from common.dependencies import get_current_entity
from common.models.user import UserResponse

router = APIRouter(tags=["Dashboard"])

EXCLUDED_STATUSES = [
    InvoiceStatusEnum.DELETED,
    InvoiceStatusEnum.SAGE_POSTED,
    InvoiceStatusEnum.ARCHIVED
]

def to_float(value):
    """Safely convert value to float"""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    value_str = str(value).strip()
    if not value_str:
        return 0.0
    try:
        value_str = re.sub(r"[^\d.-]", "", value_str)
        if value_str.startswith("(") and value_str.endswith(")"):
            value_str = "-" + value_str[1:-1]
        return float(value_str)
    except:
        return 0.0

def parse_date(date_str):
    """Parse date string to datetime object"""
    if not date_str:
        return None
    if isinstance(date_str, datetime):
        return date_str
    if hasattr(date_str, "year") and hasattr(date_str, "month") and hasattr(date_str, "day"):
        # Handles datetime.date objects
        return datetime(date_str.year, date_str.month, date_str.day)
    if "/" in date_str:
        try:
            m, d, y = date_str.split("/")
            date_str = f"{y}-{m}-{d}"
        except:
            pass
    formats = ["%Y-%m-%d", "%d-%m-%Y", "%m-%d-%Y", "%Y-%m-%dT%H:%M:%S"]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except:
            continue
    return None

def aging_days(due_date):
    """Calculate aging days from due date"""
    d = parse_date(due_date)
    if not d:
        return None
    return (datetime.utcnow() - d).days

def safe_get(inv_data, *keys, default=None):
    """Safely navigate dictionary data"""
    try:
        result = inv_data
        for key in keys:
            if isinstance(result, dict):
                result = result.get(key, {})
            else:
                return default
        
        value = result.get("value") if isinstance(result, dict) else result
        return value if value is not None else default
    except:
        return default

def get_extracted_data_json(inv: Invoice):
    """Safely parse extracted_data JSON"""
    if not inv.extracted_data:
        return {}
    if isinstance(inv.extracted_data, dict):
        return inv.extracted_data
    try:
        return json.loads(inv.extracted_data)
    except:
        return {}

@router.get("/summary")
def summary(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    # Total Invoices includes Sage Posted and Archived, but excludes Deleted
    invoices = invoice_repo.get_multi(
        db, 
        filters={"entity": entity}, 
        expressions=[Invoice.status != InvoiceStatusEnum.DELETED],
        limit=10000
    )
    
    total_overdue = 0.0
    waiting = 0
    rejected_count = 0
    sage_posted_count = 0
    
    now = datetime.utcnow()
    
    for inv in invoices:
        status = inv.status.value if hasattr(inv.status, "value") else str(inv.status)
        
        # Track counts for all invoices fetched
        if status == InvoiceStatusEnum.WAITING_APPROVAL.value:
            waiting += 1
        elif status == InvoiceStatusEnum.REJECTED.value:
            rejected_count += 1
        elif status == InvoiceStatusEnum.SAGE_POSTED.value:
            sage_posted_count += 1
            
        # Total Overdue excludes Sage Posted, Archived, and Deleted
        if status in [InvoiceStatusEnum.DELETED.value, 
                     InvoiceStatusEnum.SAGE_POSTED.value, 
                     InvoiceStatusEnum.ARCHIVED.value]:
            continue
            
        # Overdue calculation
        amt = float(inv.total_amount) if inv.total_amount is not None else 0.0
        if amt == 0.0:
            data = get_extracted_data_json(inv)
            amt = to_float(safe_get(data, "amounts", "total_invoice_amount"))
        
        due_date = inv.due_date
        if due_date is None:
            data = get_extracted_data_json(inv)
            due_date = parse_date(safe_get(data, "invoice_details", "due_date"))
        else:
            due_date = parse_date(due_date)
            
        if due_date is None or due_date < now:
            total_overdue += amt
    
    return {
        "total_invoices": len(invoices),
        "total_due": total_overdue,
        "sage_posted": sage_posted_count,
        "waiting_approval": waiting,
        "rejected": rejected_count
    }

@router.get("/aging")
def aging(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoices = invoice_repo.get_multi(
        db, 
        filters={"entity": entity}, 
        expressions=[Invoice.status.notin_(EXCLUDED_STATUSES)],
        limit=10000
    )
    buckets = {"0_30": 0, "31_60": 0, "61_90": 0, "91_120": 0, "120_plus": 0}
    
    for inv in invoices:
        status = inv.status.value if hasattr(inv.status, "value") else str(inv.status)
        if status in [InvoiceStatusEnum.DELETED, 
                     InvoiceStatusEnum.SAGE_POSTED, InvoiceStatusEnum.ARCHIVED]:
            continue

        amt = float(inv.total_amount) if inv.total_amount is not None else 0.0
        due_date = inv.due_date
        
        if amt == 0.0 or due_date is None:
            data = get_extracted_data_json(inv)
            if amt == 0.0:
                amt = to_float(safe_get(data, "amounts", "total_invoice_amount"))
            if due_date is None:
                due_date = safe_get(data, "invoice_details", "due_date")
        
        days = aging_days(due_date)
        
        if days is None or days < 0:
            continue
        if days <= 30:
            buckets["0_30"] += amt
        elif days <= 60:
            buckets["31_60"] += amt
        elif days <= 90:
            buckets["61_90"] += amt
        elif days <= 120:
            buckets["91_120"] += amt
        else:
            buckets["120_plus"] += amt
    
    return buckets

@router.get("/status_breakdown")
def status_breakdown(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoices = invoice_repo.get_multi(
        db, 
        filters={"entity": entity}, 
        limit=10000
    )
    
    counts = {status.value: 0 for status in InvoiceStatusEnum}
    
    for inv in invoices:
        status = inv.status.value if hasattr(inv.status, "value") else str(inv.status)
        if status in counts:
            counts[status] += 1
            
    return counts

@router.get("/vendors")
def vendors(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoices = invoice_repo.get_multi(
        db, 
        filters={"entity": entity}, 
        expressions=[Invoice.status.notin_(EXCLUDED_STATUSES)],
        limit=10000
    )
    
    vendor_count = {}
    vendor_amount = {}
    
    for inv in invoices:
        data = get_extracted_data_json(inv)
        vendor = safe_get(data, "vendor_info", "name", default="Unknown")
        amt = to_float(safe_get(data, "amounts", "total_invoice_amount"))
        
        vendor_count[vendor] = vendor_count.get(vendor, 0) + 1
        vendor_amount[vendor] = vendor_amount.get(vendor, 0) + amt
    
    # Sort and limit to top 10
    by_count = sorted(
        [{"vendor": v, "count": c} for v, c in vendor_count.items()],
        key=lambda x: x["count"],
        reverse=True
    )[:10]
    
    by_amount = sorted(
        [{"vendor": v, "amount": a} for v, a in vendor_amount.items()],
        key=lambda x: x["amount"],
        reverse=True
    )[:10]
    
    return {
        "by_count": by_count,
        "by_amount": by_amount,
    }

@router.get("/top_vendors")
def top_vendors(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoices = invoice_repo.get_multi(
        db, 
        filters={"entity": entity}, 
        expressions=[Invoice.status.notin_(EXCLUDED_STATUSES)],
        limit=10000
    )
    
    totals = {}
    counts = {}
    
    for inv in invoices:
        data = get_extracted_data_json(inv)
        vendor = safe_get(data, "vendor_info", "name", default="Unknown")
        amt = to_float(safe_get(data, "amounts", "total_invoice_amount"))
        
        totals[vendor] = totals.get(vendor, 0) + amt
        counts[vendor] = counts.get(vendor, 0) + 1
    
    # User Request: top vendors : highest number of invoices processed
    sorted_vendors = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:10]
    
    return [
        {"vendor": vendor, "total": totals[vendor], "count": count}
        for vendor, count in sorted_vendors
    ]

@router.get("/payments")
def payments(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoices = invoice_repo.get_multi(
        db, 
        filters={"entity": entity}, 
        expressions=[Invoice.status.notin_(EXCLUDED_STATUSES)],
        limit=10000
    )
    
    total = 0.0
    paid = 0.0
    
    for inv in invoices:
        data = get_extracted_data_json(inv)
        total += to_float(safe_get(data, "amounts", "total_invoice_amount"))
        paid += to_float(safe_get(data, "amounts", "amount_paid"))
    
    return {
        "done": paid,
        "pending": total - paid,
    }