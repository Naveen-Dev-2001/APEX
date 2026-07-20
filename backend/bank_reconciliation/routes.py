from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form, Query
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from common.database.database import get_db
from common.auth.jwt import get_current_user
from bank_reconciliation.service import BankReconciliationService
from common.models.db_models import (
    BankStatement, BankStatementTransaction,
    SageGLTransactionCache, ReconciliationResult, BankAccount
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reconciliation", tags=["bank-reconciliation"])


class ManualMatchRequest(BaseModel):
    bank_transaction_ids: list[int]
    sage_transaction_ids: list[int]


@router.post("/bank-accounts/upload")
async def upload_bank_accounts(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Upload bank accounts master file (CSV/Excel) into bank_accounts."""
    if not file.filename.endswith(('.csv', '.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only CSV and Excel files are supported.")

    uploader = getattr(current_user, "email", "unknown")
    service = BankReconciliationService(db)
    try:
        count = await service.process_bank_accounts_file(file=file, uploader=uploader)
        return {"message": f"Uploaded {count} bank account row(s).", "count": count}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Bank accounts upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process bank accounts file: {str(e)}")


@router.get("/bank-accounts")
def get_bank_accounts(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Get all bank accounts."""
    service = BankReconciliationService(db)
    rows = service.get_bank_accounts()
    return {"items": rows, "total": len(rows)}


@router.post("/bank-accounts/sync")
async def sync_bank_accounts_from_sage(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Sync bank accounts table from Sage REST API."""
    service = BankReconciliationService(db)
    try:
        count = await service.sync_bank_accounts_from_sage_api()
        return {"message": f"Synced {count} bank account(s) from Sage.", "count": count}
    except Exception as e:
        logger.error(f"Bank accounts sync failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to sync bank accounts: {str(e)}")


@router.post("/upload")
async def upload_bank_statement(
    file: UploadFile = File(...),
    entity: Optional[str] = Form(None),
    account_number: Optional[str] = Form(None),
    statement_month: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Upload and parse a bank statement (CSV or Excel) linked to a GL account."""
    if not file.filename.endswith(('.csv', '.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only CSV and Excel files are supported.")

    uploader = getattr(current_user, "email", "unknown")
    service = BankReconciliationService(db)

    try:
        statement = await service.process_bank_statement(
            file,
            uploader=uploader,
            entity=entity,
            account_number=account_number,
            statement_month=statement_month
        )
        return {
            "statement_id": statement.id,
            "filename": statement.filename,
            "account_number": statement.account_number,
            "statement_month": statement.statement_month,
            "status": statement.status,
            "upload_date": statement.upload_date.isoformat(),
            "transaction_count": len(statement.transactions)
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process the bank statement: {str(e)}")


@router.get("/statements")
async def get_statements(
    account_number: Optional[str] = Query(None, description="Filter by GL account number"),
    statement_month: Optional[str] = Query(None, description="Filter by statement month in YYYY-MM format"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get all uploaded bank statements."""
    query = db.query(BankStatement)
    if account_number:
        query = query.filter(BankStatement.account_number == account_number)
    if statement_month:
        query = query.filter(BankStatement.statement_month == statement_month)
    
    statements = query.order_by(BankStatement.upload_date.desc()).all()
    
    return [
        {
            "id": s.id,
            "filename": s.filename,
            "account_number": s.account_number,
            "statement_month": s.statement_month,
            "upload_date": s.upload_date.isoformat(),
            "status": s.status,
            "transaction_count": len(s.transactions)
        }
        for s in statements
    ]

@router.delete("/statements/{statement_id}")
async def delete_statement(
    statement_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete a bank statement and its associated transactions."""
    service = BankReconciliationService(db)
    success = service.delete_statement(statement_id)
    if not success:
        raise HTTPException(status_code=404, detail="Statement not found")
    return {"message": "Statement deleted successfully"}


@router.get("/statements/{statement_id}/transactions")
def get_statement_transactions(
    statement_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Get all parsed transactions for a bank statement."""
    statement = db.query(BankStatement).filter(BankStatement.id == statement_id).first()
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found.")

    transactions = db.query(BankStatementTransaction).filter(
        BankStatementTransaction.statement_id == statement_id
    ).order_by(BankStatementTransaction.date).all()

    return {
        "statement": {
            "id": statement.id,
            "filename": statement.filename,
            "account_number": statement.account_number,
            "status": statement.status,
            "upload_date": statement.upload_date.isoformat(),
        },
        "transactions": [
            {
                "id": t.id,
                "account_number": t.account_number,
                "date": t.date.isoformat(),
                "check_number": t.check_number,
                "debit": float(t.debit) if t.debit is not None else None,
                "credit": float(t.credit) if t.credit is not None else None,
                "description": t.description,
                "reference": t.reference,
                "amount": float(t.amount),
                "account_name": t.account_name,
                "transaction_type": t.transaction_type,
                "status": t.status,

                "is_matched": t.is_matched,
            }
            for t in transactions
        ],
        "total": len(transactions),
        "debits": sum(float(t.amount) for t in transactions if t.transaction_type == "debit"),
        "credits": sum(float(t.amount) for t in transactions if t.transaction_type == "credit"),
    }


@router.post("/fetch-sage-transactions")
async def fetch_sage_transactions(
    account_number: Optional[str] = Query(None, description="Filter by GL account number"),
    financial_entity: Optional[str] = Query(None, description="Filter by financial entity/bank"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Fetch GL transactions from Sage Intacct and cache them, optionally filtered by account and financial entity."""
    service = BankReconciliationService(db)
    try:
        count = await service.fetch_sage_gl_transactions(
            account_filter=account_number,
            financial_entity_filter=financial_entity,
        )
        return {
            "message": f"Fetched and cached {count} new Sage GL transactions.",
            "count": count,
            "account_number": account_number,
            "financial_entity": financial_entity,
        }
    except Exception as e:
        logger.error(f"Sage fetch failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch Sage transactions: {str(e)}")


@router.get("/sage-transactions")
def get_sage_transactions(
    account_number: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Get cached Sage GL transactions, optionally filtered by account number."""
    query = db.query(SageGLTransactionCache)
    if account_number:
        query = query.filter(SageGLTransactionCache.account == account_number)

    transactions = query.order_by(SageGLTransactionCache.date.desc()).all()

    # Group accounts for the summary bar
    accounts = sorted(set(t.account for t in db.query(SageGLTransactionCache).all() if t.account))

    return {
        "accounts": accounts,
        "selected_account": account_number,
        "transactions": [
            {
                "id": t.id,
                "sage_key": t.sage_key,
                "date": t.date.isoformat(),
                "description": t.description,
                "account": t.account,
                "amount": float(t.amount),
                "transaction_type": t.transaction_type,
                "is_matched": t.is_matched,
                "entry_date": t.entry_date.isoformat() if t.entry_date else None,
                "doc_number": t.doc_number,
                "vendor": t.vendor,
                "customer": t.customer,
                "record_type": t.record_type,
                "cleared": t.cleared,
                "tr_type": t.tr_type,
                "bank": t.bank,
            }
            for t in transactions
        ],
        "total": len(transactions),
        "debits": sum(float(t.amount) for t in transactions if t.transaction_type == "debit"),
        "credits": sum(float(t.amount) for t in transactions if t.transaction_type == "credit"),
    }


@router.post("/match")
def run_matching(
    account_number: Optional[str] = Query(None, description="Match only for a specific GL account"),
    statement_id: Optional[int] = Query(None, description="Match only for a specific statement"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Run the reconciliation matching algorithm, scoped to an account or statement."""
    service = BankReconciliationService(db)
    try:
        matches_found = service.run_matching(statement_id=statement_id, account_number=account_number)
        return {
            "message": f"Matching complete. {matches_found} transactions matched.",
            "matches_found": matches_found,
            "account_number": account_number
        }
    except Exception as e:
        logger.error(f"Matching failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Matching process failed.")


@router.post("/mark-matched")
def mark_matched_pairs(
    payload: ManualMatchRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Manually mark selected bank/sage transaction pairs as matched."""
    service = BankReconciliationService(db)
    try:
        if not payload.bank_transaction_ids or not payload.sage_transaction_ids:
            raise HTTPException(status_code=400, detail="Select at least one bank and one Sage transaction.")

        bank_count = len(payload.bank_transaction_ids)
        sage_count = len(payload.sage_transaction_ids)
        if bank_count != sage_count and bank_count != 1 and sage_count != 1:
            raise HTTPException(
                status_code=400,
                detail="Select equal counts, or use one bank with many Sage rows (or vice versa)."
            )

        marked = service.mark_pairs_as_matched(
            bank_transaction_ids=payload.bank_transaction_ids,
            sage_transaction_ids=payload.sage_transaction_ids,
        )
        return {
            "message": f"{marked} transaction pair(s) marked as matched.",
            "marked_count": marked,
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Manual match failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Manual matching failed.")


@router.get("/results")
def get_results(
    account_number: Optional[str] = Query(None, description="Filter results by GL account"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Get reconciliation results grouped by GL account number."""
    service = BankReconciliationService(db)
    return service.get_results_by_account(account_number=account_number)
