import pandas as pd
from io import BytesIO
from sqlalchemy.orm import Session
from fastapi import UploadFile
from typing import List, Dict, Any, Optional
from datetime import datetime
from decimal import Decimal
import logging
import httpx
import os
import json
import re

from app.models.db_models import (
    BankStatement, BankStatementTransaction, 
    SageGLTransactionCache, ReconciliationResult
)
from app.services.base_sync_service import BaseSyncService
from app.utils.date_utils import get_ist_now

logger = logging.getLogger(__name__)


def _to_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")

class BankReconciliationService:
    def __init__(self, db: Session):
        self.db = db
        self.sync_service = BaseSyncService(db)

    @staticmethod
    def _first_non_empty(*values):
        for value in values:
            if isinstance(value, dict):
                text_value = value.get("#text")
                if text_value not in (None, ""):
                    return text_value
            if value not in (None, ""):
                return value
        return None

    @staticmethod
    def _pick_key(record: Dict[str, Any], *keys: str):
        for key in keys:
            if key in record and record.get(key) not in (None, ""):
                return record.get(key)

        lowered = {str(k).lower(): v for k, v in record.items()}
        for key in keys:
            value = lowered.get(str(key).lower())
            if value not in (None, ""):
                return value

        return None

    @staticmethod
    def _as_text(value: Any) -> Any:
        if isinstance(value, dict):
            return value.get("#text")
        return value

    @staticmethod
    def _normalize_check_number(value: Any) -> str:
        if value is None:
            return ""
        text = str(value).strip()
        # Normalize values like 9351.0 -> 9351 and ignore whitespace/hyphen variants.
        if re.fullmatch(r"\d+\.0+", text):
            text = text.split(".")[0]
        return re.sub(r"\s+", "", text).lower()

    def _normalize_raw_sage_record(self, raw_record: Dict[str, Any]) -> Dict[str, Any]:
        # Some XML parser paths can nest actual row data under GLDETAIL.
        source = raw_record.get("GLDETAIL") if isinstance(raw_record.get("GLDETAIL"), dict) else raw_record

        amount_value = self._as_text(
            self._pick_key(source, "TRX_AMOUNT", "TRX_DEBITAMOUNT", "TRX_CREDITAMOUNT")
        ) or 0
        try:
            amount = abs(float(amount_value))
        except Exception:
            amount = 0.0

        return {
            "record_no": self._as_text(self._pick_key(source, "RECORDNO")),
            "check_no": self._as_text(self._pick_key(source, "DOCNUMBER", "DOCNO", "DOCUMENTNO", "DOCUMENT")),
            "txn_type": self._as_text(self._pick_key(source, "TR_TYPE", "TRX_TYPE", "TRTYPE")),
            "txn_date": self._as_text(self._pick_key(source, "ENTRY_DATE", "BATCH_DATE")),
            "txn_amount": amount,
            "account_no": self._as_text(self._pick_key(source, "ACCOUNTNO", "ACCOUNT")),
            "financial_entity": self._as_text(self._pick_key(source, "FINANCIALENTITY", "BANK")) or "FFB_4449",
            "cleared": self._as_text(self._pick_key(source, "CLEARED")),
            "description": self._as_text(self._pick_key(source, "PRDESCRIPTION", "DESCRIPTION", "MEMO")),
            "payee": self._as_text(self._pick_key(source, "PAYEE", "VENDORNAME", "CUSTOMERNAME", "NAME")),
            "vendor": self._as_text(self._pick_key(source, "VENDORNAME")),
            "customer": self._as_text(self._pick_key(source, "CUSTOMERNAME")),
            "record_type": self._as_text(self._pick_key(source, "RECORDTYPE")),
        }
        
    async def process_bank_statement(
        self, 
        file: UploadFile, 
        uploader: str, 
        entity: str = None,
        account_number: str = None
    ) -> BankStatement:
        content = await file.read()
        filename = file.filename.lower()
        
        try:
            if filename.endswith('.csv'):
                df = pd.read_csv(BytesIO(content))
            elif filename.endswith('.xlsx') or filename.endswith('.xls'):
                df = pd.read_excel(BytesIO(content))
            else:
                raise ValueError("Unsupported file format. Please upload CSV or Excel.")
                
            cols = [str(c).lower().strip() for c in df.columns]
            df.columns = cols
            
            date_col = next((c for c in cols if 'date' in c), None)
            if not date_col:
                raise ValueError("Could not find a 'Date' column in the uploaded file.")
                
            desc_col = next((c for c in cols if 'description' in c or 'particulars' in c or 'narration' in c), None)
            ref_col  = next((c for c in cols if 'ref' in c or 'cheque' in c or 'check' in c), None)
            check_no_col = next((c for c in cols if 'check number' in c or 'cheque number' in c or 'check no' in c or 'cheque no' in c), None)
            amount_col = next((c for c in cols if c == 'amount'), None)
            debit_col = next((c for c in cols if 'debit' in c or 'withdrawal' in c or 'dr' == c), None)
            credit_col = next((c for c in cols if 'credit' in c or 'deposit' in c or 'cr' == c), None)
            account_number_col = next((c for c in cols if 'account number' in c or c in ('accountno', 'account_no', 'account_number')), None)
            account_name_col = next((c for c in cols if 'account name' in c), None)
            txn_type_col = next((c for c in cols if 'transaction type' in c or 'txn type' in c), None)
            status_col = next((c for c in cols if c == 'status' or 'transaction status' in c), None)
            
            if not amount_col and not (debit_col or credit_col):
                raise ValueError("Could not find Amount or Debit/Credit columns in the uploaded file.")
                
            account_col = next((c for c in cols if 'account' in c), None)
            if not account_number and account_col:
                first_valid_account = df[account_col].dropna().iloc[0] if not df[account_col].dropna().empty else None
                if first_valid_account:
                    # Convert to string, taking care of potential floats (e.g., 1000.0 -> 1000)
                    account_number = str(int(first_valid_account)) if isinstance(first_valid_account, float) and first_valid_account.is_integer() else str(first_valid_account).strip()

            statement = BankStatement(
                filename=file.filename,
                uploaded_by=uploader,
                entity=entity,
                account_number=account_number,
                status="uploaded"
            )
            self.db.add(statement)
            self.db.flush()
            
            transactions = []
            for _, row in df.iterrows():
                try:
                    raw_date = row[date_col]
                    if pd.isna(raw_date):
                        continue
                    parsed_date = pd.to_datetime(raw_date).date()
                    
                    description = str(row[desc_col]) if desc_col and not pd.isna(row.get(desc_col, None)) else ""
                    reference   = str(row[ref_col])  if ref_col  and not pd.isna(row.get(ref_col, None))  else ""
                    check_number = str(row[check_no_col]).strip() if check_no_col and not pd.isna(row.get(check_no_col, None)) else reference
                    row_account_number = str(row[account_number_col]).strip() if account_number_col and not pd.isna(row.get(account_number_col, None)) else (account_number or "")
                    account_name = str(row[account_name_col]).strip() if account_name_col and not pd.isna(row.get(account_name_col, None)) else ""
                    txn_type_raw = str(row[txn_type_col]).strip().lower() if txn_type_col and not pd.isna(row.get(txn_type_col, None)) else ""
                    status_raw = str(row[status_col]).strip() if status_col and not pd.isna(row.get(status_col, None)) else "Pending"
                    
                    amount = Decimal('0.00')
                    t_type = ""
                    debit_amount = None
                    credit_amount = None
                    
                    if amount_col:
                        raw_val = row.get(amount_col)
                        if raw_val is not None and not pd.isna(raw_val):
                            raw_amount = float(raw_val)
                            if raw_amount < 0:
                                amount = Decimal(str(abs(raw_amount)))
                                t_type = "debit"
                                debit_amount = amount
                            else:
                                amount = Decimal(str(raw_amount))
                                t_type = "credit"
                                credit_amount = amount
                        else:
                            continue
                    else:
                        debit_val  = float(row[debit_col])  if debit_col  and not pd.isna(row.get(debit_col, None))  else 0.0
                        credit_val = float(row[credit_col]) if credit_col and not pd.isna(row.get(credit_col, None)) else 0.0
                        
                        if debit_val > 0:
                            amount = Decimal(str(debit_val))
                            t_type = "debit"
                            debit_amount = amount
                        elif credit_val > 0:
                            amount = Decimal(str(credit_val))
                            t_type = "credit"
                            credit_amount = amount
                        else:
                            continue

                    if txn_type_raw:
                        if txn_type_raw in ("debit", "dr", "withdrawal"):
                            t_type = "debit"
                        elif txn_type_raw in ("credit", "cr", "deposit"):
                            t_type = "credit"
                    
                    if not t_type or amount == Decimal('0.00'):
                        continue
                            
                    txn = BankStatementTransaction(
                        statement_id=statement.id,
                        date=parsed_date,
                        description=description,
                        reference=reference,
                        account_number=row_account_number,
                        account_name=account_name,
                        debit=debit_amount,
                        credit=credit_amount,
                        check_number=check_number,
                        status=status_raw or "Pending",
                        amount=amount,
                        transaction_type=t_type,
                        is_matched=False
                    )
                    transactions.append(txn)
                except Exception as e:
                    logger.warning(f"Failed to parse row: {row.to_dict() if hasattr(row, 'to_dict') else row}, error: {e}")
                    continue
                    
            if transactions:
                self.db.bulk_save_objects(transactions)
            self.db.commit()
            self.db.refresh(statement)
            return statement
            
        except Exception as e:
            self.db.rollback()
            raise e

    def delete_statement(self, statement_id: int) -> bool:
        """Delete a bank statement by ID. Also removes any matching records linked to its transactions."""
        statement = self.db.query(BankStatement).filter(BankStatement.id == statement_id).first()
        if not statement:
            return False
            
        try:
            # We need to un-match any sage transactions that were matched to this statement's bank transactions
            bank_txns = self.db.query(BankStatementTransaction).filter(BankStatementTransaction.statement_id == statement_id).all()
            bank_txn_ids = [t.id for t in bank_txns]
            
            if bank_txn_ids:
                # Find all reconciliation results involving these bank transactions
                results = self.db.query(ReconciliationResult).filter(ReconciliationResult.bank_transaction_id.in_(bank_txn_ids)).all()
                sage_txn_ids = [r.sage_transaction_id for r in results]
                
                # Unmatch Sage transactions
                if sage_txn_ids:
                    self.db.query(SageGLTransactionCache).filter(
                        SageGLTransactionCache.id.in_(sage_txn_ids)
                    ).update({"is_matched": False}, synchronize_session=False)
                
                # Delete results
                self.db.query(ReconciliationResult).filter(ReconciliationResult.bank_transaction_id.in_(bank_txn_ids)).delete(synchronize_session=False)
                
                # Delete bank transactions
                self.db.query(BankStatementTransaction).filter(BankStatementTransaction.statement_id == statement_id).delete(synchronize_session=False)
                
            self.db.delete(statement)
            self.db.commit()
            return True
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error deleting statement: {e}")
            return False

    async def fetch_sage_gl_transactions(self, account_filter: str = None) -> int:
        """Fetch GL transactions from Sage. Optionally filter by account number."""
        try:
            from scripts.bank_recon import get_session_id, fetch_all_gldetail, normalize_records
            
            session_id = await get_session_id()
            acct = account_filter or "10012"
            
            records = await fetch_all_gldetail(
                session_id=session_id,
                financial_entity="FFB_4449",
                account_no=acct,
                after_date="09/30/2023"
            )
            normalized = normalize_records(records)

            if records and not normalized:
                logger.warning(
                    "normalize_records returned 0 items for %s records; applying fallback normalization",
                    len(records),
                )
                normalized = [self._normalize_raw_sage_record(r) for r in records if isinstance(r, dict)]

            logger.info(
                "Sage fetch completed: raw_records=%s normalized_records=%s account=%s",
                len(records),
                len(normalized),
                acct,
            )

            script_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))
            output_path = os.path.join(script_dir, "uncleared_transactions.json")

            try:
                os.makedirs(script_dir, exist_ok=True)
                with open(output_path, "w", encoding="utf-8") as f:
                    json.dump(
                        {
                            "total": len(normalized),
                            "financial_entity": "FFB_4449",
                            "gl_account": acct,
                            "fetched_at": get_ist_now().isoformat(),
                            "transactions": normalized,
                        },
                        f,
                        indent=2,
                    )
            except Exception as file_error:
                # File write failure should not block DB sync.
                logger.warning(f"Failed writing uncleared transactions JSON: {file_error}")
            
            to_save = []
            updated_count = 0
            for idx, item in enumerate(normalized):
                raw = records[idx] if idx < len(records) else {}

                doc_number = self._first_non_empty(
                    item.get("check_no"),
                    item.get("doc_number"),
                    self._pick_key(raw, "DOCNUMBER", "DOCNO", "DOCUMENTNO", "DOCUMENT"),
                )
                tr_type = self._first_non_empty(
                    item.get("txn_type"),
                    item.get("tr_type"),
                    self._pick_key(raw, "TR_TYPE", "TRX_TYPE", "TRTYPE"),
                )
                bank = self._first_non_empty(
                    item.get("financial_entity"),
                    item.get("bank"),
                    self._pick_key(raw, "FINANCIALENTITY", "BANK"),
                    "FFB_4449",
                )

                sage_key = str(item.get("record_no") or f"{item.get('txn_date')}_{item.get('check_no')}_{item.get('txn_amount')}_{item.get('account_no')}")
                
                existing = self.db.query(SageGLTransactionCache).filter_by(sage_key=sage_key).first()
                if existing:
                    changed = False

                    new_description = item.get("description") or item.get("payee")
                    new_vendor = item.get("vendor") or item.get("payee")
                    new_customer = item.get("customer")
                    new_record_type = item.get("record_type")
                    new_cleared = item.get("cleared")
                    new_doc_number = str(doc_number) if doc_number is not None else None
                    new_tr_type = str(tr_type) if tr_type is not None else None
                    new_bank = str(bank) if bank is not None else None

                    if not existing.doc_number and new_doc_number:
                        existing.doc_number = new_doc_number
                        changed = True
                    if not existing.tr_type and new_tr_type:
                        existing.tr_type = new_tr_type
                        changed = True
                    if not existing.bank and new_bank:
                        existing.bank = new_bank
                        changed = True
                    if not existing.description and new_description:
                        existing.description = new_description
                        changed = True
                    if not existing.vendor and new_vendor:
                        existing.vendor = new_vendor
                        changed = True
                    if not existing.customer and new_customer:
                        existing.customer = new_customer
                        changed = True
                    if not existing.record_type and new_record_type:
                        existing.record_type = new_record_type
                        changed = True
                    if not existing.cleared and new_cleared:
                        existing.cleared = new_cleared
                        changed = True

                    if changed:
                        updated_count += 1
                    continue
                    
                raw_date = item.get("txn_date")
                try:
                    date_obj = datetime.strptime(raw_date, "%m/%d/%Y").date() if raw_date else datetime.now().date()
                except ValueError:
                    date_obj = datetime.now().date()
                
                entry_date_obj = date_obj # default to txn_date

                amount = Decimal(str(item.get("txn_amount", 0)))
                t_type = "debit" if str(item.get("txn_type")) in ("1", "-1") else "credit"
                
                cache_item = SageGLTransactionCache(
                    sage_key=sage_key,
                    date=date_obj,
                    description=item.get("description") or item.get("payee") or "",
                    account=item.get("account_no", ""),
                    amount=amount,
                    transaction_type=t_type,
                    is_matched=False,
                    entry_date=entry_date_obj,
                    doc_number=str(doc_number) if doc_number is not None else None,
                    vendor=item.get("vendor") or item.get("payee"),
                    customer=item.get("customer"),
                    record_type=item.get("record_type"),
                    cleared=item.get("cleared"),
                    tr_type=str(tr_type) if tr_type is not None else None,
                    bank=str(bank) if bank is not None else None,
                )
                to_save.append(cache_item)
                
            if to_save:
                self.db.bulk_save_objects(to_save)

            if to_save or updated_count:
                self.db.commit()

            return len(to_save) + updated_count
            
        except Exception as e:
            logger.error(f"Error fetching Sage transactions: {e}", exc_info=True)
            self.db.rollback()
            raise e

    def run_matching(self, statement_id: int = None, account_number: str = None) -> int:
        """
        Account-aware matching:
        - If account_number is given, only match bank transactions from statements
          for that account against Sage GL entries for that account.
        - Otherwise matches all unmatched transactions globally.
        """
        bank_query = self.db.query(BankStatementTransaction).filter(
            BankStatementTransaction.is_matched == False
        )
        sage_query = self.db.query(SageGLTransactionCache).filter(
            SageGLTransactionCache.is_matched == False
        )

        if statement_id:
            bank_query = bank_query.filter(BankStatementTransaction.statement_id == statement_id)
        
        if account_number:
            # Get statement IDs that belong to this account
            stmt_ids = [
                s.id for s in self.db.query(BankStatement).filter(
                    BankStatement.account_number == account_number
                ).all()
            ]
            if stmt_ids:
                bank_query = bank_query.filter(BankStatementTransaction.statement_id.in_(stmt_ids))
            sage_query = sage_query.filter(SageGLTransactionCache.account == account_number)

        unmatched_bank = bank_query.all()
        unmatched_sage = sage_query.all()
        
        matches_found = 0
        
        for b_txn in unmatched_bank:
            for s_txn in unmatched_sage:
                if not s_txn.is_matched:
                    if b_txn.amount == s_txn.amount and b_txn.transaction_type == s_txn.transaction_type:
                        bank_check = self._normalize_check_number(b_txn.check_number)
                        sage_check = self._normalize_check_number(s_txn.doc_number)

                        # Exact match rule: amount + type + check number must match.
                        check_number_match = bool(bank_check and sage_check and bank_check == sage_check)

                        if check_number_match:
                            b_txn.is_matched = True
                            s_txn.is_matched = True
                            
                            result = ReconciliationResult(
                                bank_transaction_id=b_txn.id,
                                sage_transaction_id=s_txn.id,
                                match_status="matched"
                            )
                            self.db.add(result)
                            matches_found += 1
                            break
                            
        self.db.commit()
        return matches_found

    def mark_pairs_as_matched(self, bank_transaction_ids: List[int], sage_transaction_ids: List[int]) -> int:
        """Manually mark selected bank/sage pairs as matched.

        Supported combinations:
        - one bank to many sage
        - many bank to one sage
        - one-to-one list pairing (same count)
        """
        if not bank_transaction_ids or not sage_transaction_ids:
            return 0

        bank_txns = self.db.query(BankStatementTransaction).filter(
            BankStatementTransaction.id.in_(bank_transaction_ids)
        ).all()
        sage_txns = self.db.query(SageGLTransactionCache).filter(
            SageGLTransactionCache.id.in_(sage_transaction_ids)
        ).all()

        bank_by_id = {t.id: t for t in bank_txns}
        sage_by_id = {t.id: t for t in sage_txns}

        missing_bank = [bid for bid in bank_transaction_ids if bid not in bank_by_id]
        missing_sage = [sid for sid in sage_transaction_ids if sid not in sage_by_id]
        if missing_bank or missing_sage:
            raise ValueError("Some selected transactions were not found.")

        pairs: List[tuple[int, int]] = []

        if len(bank_transaction_ids) == len(sage_transaction_ids):
            pairs = list(zip(bank_transaction_ids, sage_transaction_ids))
        elif len(bank_transaction_ids) == 1:
            bank_id = bank_transaction_ids[0]
            bank_total = _to_decimal(bank_by_id[bank_id].amount)
            sage_total = sum((_to_decimal(sage_by_id[sid].amount) for sid in sage_transaction_ids), Decimal("0"))
            if bank_total != sage_total:
                raise ValueError("Selected Sage total must equal the selected Bank amount.")
            pairs = [(bank_id, sid) for sid in sage_transaction_ids]
        elif len(sage_transaction_ids) == 1:
            sage_id = sage_transaction_ids[0]
            sage_total = _to_decimal(sage_by_id[sage_id].amount)
            bank_total = sum((_to_decimal(bank_by_id[bid].amount) for bid in bank_transaction_ids), Decimal("0"))
            if bank_total != sage_total:
                raise ValueError("Selected Bank total must equal the selected Sage amount.")
            pairs = [(bid, sage_id) for bid in bank_transaction_ids]
        else:
            raise ValueError(
                "For manual matching, select equal counts or use one-to-many / many-to-one selection."
            )

        marked = 0
        for bank_id, sage_id in pairs:
            bank_txn = bank_by_id[bank_id]
            sage_txn = sage_by_id[sage_id]

            existing = self.db.query(ReconciliationResult).filter(
                ReconciliationResult.bank_transaction_id == bank_id,
                ReconciliationResult.sage_transaction_id == sage_id,
                ReconciliationResult.match_status == "matched"
            ).first()

            if not bank_txn.is_matched:
                bank_txn.is_matched = True
            if not sage_txn.is_matched:
                sage_txn.is_matched = True

            if existing:
                continue

            self.db.add(ReconciliationResult(
                bank_transaction_id=bank_id,
                sage_transaction_id=sage_id,
                match_status="matched"
            ))
            marked += 1

        self.db.commit()
        return marked

    def get_results_by_account(self, account_number: str = None) -> Dict:
        """Return reconciliation results grouped by GL account number."""
        
        # Get all GL accounts from Sage cache (or filtered)
        sage_query = self.db.query(SageGLTransactionCache)
        if account_number:
            sage_query = sage_query.filter(SageGLTransactionCache.account == account_number)
        
        all_sage = sage_query.all()
        
        # Also get all GL accounts from Bank Statements
        bank_stmt_query = self.db.query(BankStatement.account_number).filter(BankStatement.account_number != None)
        if account_number:
            bank_stmt_query = bank_stmt_query.filter(BankStatement.account_number == account_number)
        
        bank_accounts = [r[0] for r in bank_stmt_query.all() if r[0]]
        
        accounts = sorted(set([t.account for t in all_sage if t.account] + bank_accounts))

        groups = []
        for acct in accounts:
            # Matched for this account
            matched_results = (
                self.db.query(ReconciliationResult)
                .join(SageGLTransactionCache, ReconciliationResult.sage_transaction_id == SageGLTransactionCache.id)
                .filter(
                    ReconciliationResult.match_status == "matched",
                    SageGLTransactionCache.account == acct
                ).all()
            )

            # All Sage transactions for this account
            all_sage_for_acct = self.db.query(SageGLTransactionCache).filter(
                SageGLTransactionCache.account == acct
            ).all()

            # Bank transactions directly tied by statement account number
            bank_from_stmt_account = self.db.query(BankStatementTransaction).join(
                BankStatement, BankStatementTransaction.statement_id == BankStatement.id
            ).filter(
                BankStatement.account_number == acct
            ).all()

            # Bank transactions linked to Sage transactions in this account via matched results
            bank_from_matched_links = (
                self.db.query(BankStatementTransaction)
                .join(ReconciliationResult, ReconciliationResult.bank_transaction_id == BankStatementTransaction.id)
                .join(SageGLTransactionCache, ReconciliationResult.sage_transaction_id == SageGLTransactionCache.id)
                .filter(
                    ReconciliationResult.match_status == "matched",
                    SageGLTransactionCache.account == acct,
                )
                .all()
            )

            bank_by_id = {t.id: t for t in bank_from_stmt_account}
            for txn in bank_from_matched_links:
                bank_by_id[txn.id] = txn
            all_bank_for_acct = list(bank_by_id.values())

            groups.append({
                "account": acct,
                "matched_count": len(matched_results),
                "unmatched_sage_count": sum(1 for t in all_sage_for_acct if not t.is_matched),
                "unmatched_bank_count": sum(1 for t in all_bank_for_acct if not t.is_matched),
                "matched": [
                    {
                        "id": r.id,
                        "bank": {
                            "id": r.bank_transaction.id,
                            "date": r.bank_transaction.date.isoformat(),
                            "description": r.bank_transaction.description,
                            "reference": r.bank_transaction.reference,
                            "amount": float(r.bank_transaction.amount),
                            "type": r.bank_transaction.transaction_type,
                        },
                        "sage": {
                            "id": r.sage_transaction.id,
                            "date": r.sage_transaction.date.isoformat(),
                            "description": r.sage_transaction.description,
                            "amount": float(r.sage_transaction.amount),
                            "type": r.sage_transaction.transaction_type,
                            "account": r.sage_transaction.account,
                            "bank": r.sage_transaction.bank,
                        },
                        "matched_at": r.matched_at.isoformat() if r.matched_at else None,
                    }
                    for r in matched_results if r.bank_transaction and r.sage_transaction
                ],
                "sage_transactions": [
                    {
                        "id": t.id,
                        "date": t.date.isoformat(),
                        "description": t.description,
                        "check_number": t.doc_number,
                        "amount": float(t.amount),
                        "type": t.transaction_type,
                        "account": t.account,
                        "bank": t.bank,
                        "is_matched": t.is_matched,
                    }
                    for t in all_sage_for_acct
                ],
                "bank_transactions": [
                    {
                        "id": t.id,
                        "date": t.date.isoformat(),
                        "description": t.description,
                        "reference": t.reference,
                        "check_number": t.check_number,
                        "amount": float(t.amount),
                        "type": t.transaction_type,
                        "is_matched": t.is_matched,
                    }
                    for t in all_bank_for_acct
                ],
                # Retain for backward compatibility with other tabs if needed
                "unmatched_sage": [
                    {
                        "id": t.id,
                        "date": t.date.isoformat(),
                        "description": t.description,
                        "check_number": t.doc_number,
                        "amount": float(t.amount),
                        "type": t.transaction_type,
                        "account": t.account,
                        "source": "sage",
                    }
                    for t in all_sage_for_acct if not t.is_matched
                ],
            })

        # Unmatched bank (no sage account linked)
        unmatched_bank = self.db.query(BankStatementTransaction).filter(
            BankStatementTransaction.is_matched == False
        ).all()

        return {
            "accounts": groups,
            "unmatched_bank": [
                {
                    "id": t.id,
                    "date": t.date.isoformat(),
                    "description": t.description,
                    "reference": t.reference,
                    "check_number": t.check_number,
                    "amount": float(t.amount),
                    "type": t.transaction_type,
                    "source": "bank",
                }
                for t in unmatched_bank
            ],
            "summary": {
                "total_accounts": len(accounts),
                "total_matched": sum(g["matched_count"] for g in groups),
                "total_unmatched_sage": sum(g["unmatched_sage_count"] for g in groups),
                "total_unmatched_bank": len(unmatched_bank),
            }
        }
