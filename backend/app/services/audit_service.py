import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.db_models import AuditLog, DeletedInvoice
from app.repository.repositories import audit_log_repo
from app.models.audit_log import AuditLogCreate, AuditLogResponse
from app.middleware.trace_middleware import trace_logger

from app.utils.date_utils import get_ist_now

class AuditService:
    def __init__(self):
        pass

    async def log_action(self, db: Session, invoice_id: Any, action: str, user: str, entity: str, details: Optional[Dict[str, Any]] = None, sage_bill_number: Optional[str] = None):
        """
        Logs an action into the audit_logs table (SQL Server).
        """
        # Ensure invoice_id is int if it's a string from old logic
        try:
            if isinstance(invoice_id, str) and invoice_id.isdigit():
                inv_id = int(invoice_id)
            else:
                inv_id = invoice_id
        except:
            inv_id = invoice_id

        log_data = {
            "invoice_id": inv_id,
            "action": action,
            "user": user,
            "entity": entity,
            "details": json.dumps(details) if details else None,
            "sage_bill_number": sage_bill_number,
            "timestamp": get_ist_now()
        }
        audit_log_repo.create(db, obj_in=log_data)
        
        # Echo to trace log
        trace_logger.info(f"AUDIT_EVENT | {user} | {action} | Invoice: {invoice_id} | Details: {json.dumps(details if details else {})}")
        print(f"[Audit] Logged action: {action} for invoice {invoice_id} by {user}")

    async def get_audit_trail(self, db: Session, invoice_id: Any, entity: str) -> List[AuditLogResponse]:
        """
        Retrieves the audit trail for a specific invoice from SQL Server.
        Handles both active invoices (from audit_logs table) and deleted invoices
        (from deleted_invoices table snapshot).
        """
        try:
            if isinstance(invoice_id, str) and invoice_id.isdigit():
                inv_id = int(invoice_id)
            else:
                inv_id = invoice_id
        except:
            inv_id = invoice_id

        # 1. Try fetching from active audit_logs table
        logs = audit_log_repo.get_multi(
            db,
            filters={"invoice_id": inv_id, "entity": entity},
            order_by="timestamp",
            descending=True,
            limit=1000
        )
        
        # 2. If no logs found, it might be a deleted invoice (using archive_id)
        if not logs:
            deleted_record = db.query(DeletedInvoice).filter(
                (DeletedInvoice.id == inv_id) | (DeletedInvoice.original_invoice_id == inv_id)
            ).filter(DeletedInvoice.entity == entity).first()
            
            if deleted_record and deleted_record.audit_logs_json:
                try:
                    raw_logs = json.loads(deleted_record.audit_logs_json)
                    # Convert dicts back to AuditLogResponse
                    result = []
                    for log in raw_logs:
                        result.append(AuditLogResponse(
                            id=str(log.get("id", "")),
                            invoice_id=str(log.get("invoice_id", inv_id)),
                            action=log.get("action", ""),
                            user=log.get("user", ""),
                            entity=log.get("entity", entity),
                            details=json.loads(log.get("details")) if isinstance(log.get("details"), str) else log.get("details"),
                            timestamp=datetime.fromisoformat(log.get("timestamp")) if isinstance(log.get("timestamp"), str) else log.get("timestamp")
                        ))
                    # Sort by timestamp descending (snapshots might be in any order but usually ascending)
                    result.sort(key=lambda x: x.timestamp, reverse=True)
                    return result
                except Exception as e:
                    print(f"[AuditService] Error parsing snapshot logs: {e}")

        result = []
        for log in logs:
            result.append(AuditLogResponse(
                id=str(log.id),
                invoice_id=str(log.invoice_id),
                action=log.action,
                user=log.user,
                entity=log.entity,
                details=json.loads(log.details) if log.details else None,
                timestamp=log.timestamp
            ))
        return result

audit_service = AuditService()
