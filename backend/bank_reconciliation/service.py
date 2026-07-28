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

from common.models.db_models import (
    BankStatement, BankStatementTransaction, 
    SageGLTransactionCache, ReconciliationResult, BankAccount, GLMaster
)
from sage.services.base_sync_service import BaseSyncService
from common.utils.date_utils import get_ist_now

logger = logging.getLogger(__name__)


def _to_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def _to_cents(value: Any) -> int:
    amount = _to_decimal(value)
    return int((amount * Decimal("100")).quantize(Decimal("1")))


def _sign_decimal(value: Any) -> int:
    amount = _to_decimal(value)
    if amount > 0:
        return 1
    if amount < 0:
        return -1
    return 0

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

    @staticmethod
    def _normalize_text(value: Any) -> str:
        if value is None:
            return ""
        text = str(value).strip().lower()
        text = re.sub(r"\s+", " ", text)
        return text

    @staticmethod
    def _normalize_date(value: Any):
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.date()
        if hasattr(value, "isoformat") and not isinstance(value, str):
            try:
                return value
            except Exception:
                return None
        text = str(value).strip()
        if not text:
            return None

        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y"):
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue
        return None

    @staticmethod
    def _normalize_txn_type_label(value: Any) -> str:
        text = str(value or "").strip().lower()
        if not text:
            return ""

        if text in ("-1", "dr", "debit", "withdrawal", "out", "outflow"):
            return "debit"
        if text in ("1", "cr", "credit", "deposit", "in", "inflow"):
            return "credit"

        # Preserve Sage-native labels like ACH/WIRE/etc.
        return text

    def _resolve_sage_txn_type(self, source: Dict[str, Any]) -> str:
        # Prefer textual type fields from Sage. Fall back to TR_TYPE mapping.
        preferred = self._as_text(
            self._pick_key(source, "TRX_TYPE", "TRANSACTIONTYPE", "TRANSACTION_TYPE", "TYPE")
        )
        if preferred not in (None, ""):
            return self._normalize_txn_type_label(preferred)

        fallback = self._as_text(self._pick_key(source, "TR_TYPE", "TRTYPE"))
        return self._normalize_txn_type_label(fallback)

    def _is_ach_transaction(self, bank_txn: BankStatementTransaction, sage_txn: SageGLTransactionCache) -> bool:
        bank_type = self._normalize_text(bank_txn.transaction_type)
        sage_type = self._normalize_text(sage_txn.transaction_type)
        bank_desc = self._normalize_text(bank_txn.description)
        bank_ref = self._normalize_text(bank_txn.reference)
        sage_desc = self._normalize_text(sage_txn.description)

        return (
            bank_type == "ach" or "ach" in bank_type or "ach" in bank_desc or "ach" in bank_ref or
            sage_type == "ach" or "ach" in sage_type or "ach" in sage_desc
        )

    def _pair_matches_criteria(self, bank_txn: BankStatementTransaction, sage_txn: SageGLTransactionCache) -> bool:
        bank_amount_cents = _to_cents(bank_txn.amount)
        sage_amount_cents = _to_cents(sage_txn.amount)

        if bank_amount_cents != sage_amount_cents:
            return False

        # ACH matching rule: check date + amount + description match
        if self._is_ach_transaction(bank_txn, sage_txn):
            bank_date = self._normalize_date(bank_txn.date)
            sage_date = self._normalize_date(sage_txn.entry_date or sage_txn.date)
            if not bank_date or not sage_date or bank_date != sage_date:
                return False

            bank_desc = self._normalize_text(bank_txn.description)
            sage_desc = self._normalize_text(sage_txn.description)
            return bool(bank_desc and sage_desc and bank_desc == sage_desc)

        bank_type = self._normalize_text(bank_txn.transaction_type)
        sage_type = self._normalize_text(sage_txn.transaction_type)

        # Debit matching rule: check check_number + debit amount match
        if bank_type == "debit":
            if sage_type != "debit":
                return False

            bank_check = self._normalize_check_number(bank_txn.check_number)
            sage_check = self._normalize_check_number(sage_txn.doc_number)
            return bool(bank_check and sage_check and bank_check == sage_check)

        # Credit matching rule: reference number + posting date + description + amount
        if bank_type == "credit":
            if sage_type != "credit":
                return False

            bank_date = self._normalize_date(bank_txn.date)
            sage_posting_date = self._normalize_date(sage_txn.entry_date or sage_txn.date)
            if not bank_date or not sage_posting_date or bank_date != sage_posting_date:
                return False

            bank_desc = self._normalize_text(bank_txn.description)
            sage_desc = self._normalize_text(sage_txn.description)
            if not bank_desc or not sage_desc or bank_desc != sage_desc:
                return False

            bank_reference = self._normalize_check_number(bank_txn.reference or bank_txn.check_number)
            sage_reference = self._normalize_check_number(sage_txn.doc_number)
            if bank_reference or sage_reference:
                if bank_reference != sage_reference:
                    return False

            return True

        return False

    def _auto_match_sage_internal_reversals(
        self,
        account_number: Optional[str] = None,
        financial_entity: Optional[str] = None,
    ) -> int:
        """Auto-match Sage internal reversals and void pairs.

        Rule 1 — Check Number Void Pair:
            One doc_number is a check number (e.g. "8241") and the other is a
            voided variant (e.g. "Voided - 8241"). Both share the same numeric suffix,
            account, and bank.

        Rule 2 — Same Description Reversal Pair (amounts may vary, e.g. 500 vs -100):
            Two entries with the exact same normalized description, but opposite
            directions/signs (one positive/debit, one negative/credit). Amounts
            can vary (e.g. 500 and -100).
        """
        query = self.db.query(SageGLTransactionCache).filter(
            SageGLTransactionCache.is_matched == False
        )

        if account_number:
            query = query.filter(SageGLTransactionCache.account == account_number)
        if financial_entity:
            query = query.filter(SageGLTransactionCache.bank == financial_entity)

        unmatched = query.order_by(SageGLTransactionCache.id.asc()).all()
        if not unmatched:
            return 0

        def _doc_check_suffix(raw: str) -> str:
            norm = re.sub(r"\s+", "", str(raw or "")).lower()
            m = re.search(r"(\d+)$", norm)
            return m.group(1) if m else ""

        def _doc_is_voided(raw: str) -> bool:
            norm = self._normalize_text(raw or "")
            return any(kw in norm for kw in ("void", "voided"))

        def _save_matched_pair(txn_a: SageGLTransactionCache, txn_b: SageGLTransactionCache) -> None:
            txn_a.is_matched = True
            txn_b.is_matched = True
            for sid in (txn_a.id, txn_b.id):
                existing = self.db.query(ReconciliationResult).filter(
                    ReconciliationResult.bank_transaction_id.is_(None),
                    ReconciliationResult.sage_transaction_id == sid,
                    ReconciliationResult.match_status == "matched",
                ).first()
                if not existing:
                    self.db.add(ReconciliationResult(
                        bank_transaction_id=None,
                        sage_transaction_id=sid,
                        match_status="matched",
                    ))

        # Buckets for Rule 1 (Check number void pair)
        # key: (account, bank, check_suffix)
        check_voided_grouped: Dict[tuple, Dict[str, List[SageGLTransactionCache]]] = {}

        # Buckets for Rule 2 (Same description reversal pair, amounts may vary)
        # key: (account, bank, normalized_desc)
        desc_reversal_grouped: Dict[tuple, Dict[str, List[SageGLTransactionCache]]] = {}

        for txn in unmatched:
            acct_key = (txn.account or "").strip().lower()
            bank_key = (txn.bank or "").strip().lower()

            # Rule 1: Check number void pair
            raw_doc = txn.doc_number or ""
            suffix = _doc_check_suffix(raw_doc)
            if suffix:
                check_key = (acct_key, bank_key, suffix)
                bucket = check_voided_grouped.setdefault(check_key, {"base": [], "voided": []})
                if _doc_is_voided(raw_doc):
                    bucket["voided"].append(txn)
                else:
                    bucket["base"].append(txn)

            # Rule 2: Description based reversal pair
            normalized_desc = self._normalize_text(txn.description)
            if not normalized_desc:
                continue

            # Determine direction: positive vs negative
            amt = _to_decimal(txn.amount)
            txn_type = self._normalize_text(txn.transaction_type)

            if amt < 0 or txn_type == "credit":
                direction = "negative"
            else:
                direction = "positive"

            rev_key = (acct_key, bank_key, normalized_desc)
            rev_bucket = desc_reversal_grouped.setdefault(rev_key, {"positive": [], "negative": []})
            rev_bucket[direction].append(txn)

        matched_pairs = 0

        # Apply Rule 1: Check number void pairs
        for bucket in check_voided_grouped.values():
            bases = [t for t in bucket["base"] if not t.is_matched]
            voideds = [t for t in bucket["voided"] if not t.is_matched]
            pair_count = min(len(bases), len(voideds))
            for i in range(pair_count):
                _save_matched_pair(bases[i], voideds[i])
                matched_pairs += 1

        # Apply Rule 2: Same description reversal pairs (amount may vary)
        for bucket in desc_reversal_grouped.values():
            positives = [t for t in bucket["positive"] if not t.is_matched]
            negatives = [t for t in bucket["negative"] if not t.is_matched]
            pair_count = min(len(positives), len(negatives))
            for i in range(pair_count):
                _save_matched_pair(positives[i], negatives[i])
                matched_pairs += 1

        return matched_pairs


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
            "txn_type": self._resolve_sage_txn_type(source),
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
        account_number: str = None,
        statement_month: str = None
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

            resolved_statement_month = None
            if statement_month:
                month_text = str(statement_month).strip()
                if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month_text):
                    raise ValueError("Invalid statement_month format. Expected YYYY-MM.")
                resolved_statement_month = month_text

            if not resolved_statement_month and date_col:
                date_series = df[date_col].dropna()
                if not date_series.empty:
                    try:
                        resolved_statement_month = pd.to_datetime(date_series.iloc[0]).date().strftime("%Y-%m")
                    except Exception:
                        resolved_statement_month = None

            normalized_account_number = str(account_number).strip() if account_number else ""
            if normalized_account_number and resolved_statement_month:
                existing_statements = self.db.query(BankStatement).filter(
                    BankStatement.account_number == normalized_account_number,
                    BankStatement.statement_month == resolved_statement_month
                ).order_by(BankStatement.upload_date.desc(), BankStatement.id.desc()).all()

                for existing_statement in existing_statements:
                    deleted = self.delete_statement(existing_statement.id)
                    if not deleted:
                        raise ValueError(
                            f"Failed to replace existing statement for account {normalized_account_number} and month {resolved_statement_month}."
                        )

            statement = BankStatement(
                filename=file.filename,
                uploaded_by=uploader,
                entity=entity,
                account_number=normalized_account_number or None,
                statement_month=resolved_statement_month,
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

    async def process_bank_accounts_file(self, file: UploadFile, uploader: str) -> int:
        """Upload a bank accounts master file and upsert rows into bank_accounts."""
        content = await file.read()
        filename = (file.filename or "").lower()

        if filename.endswith('.csv'):
            df = pd.read_csv(BytesIO(content))
        elif filename.endswith('.xlsx') or filename.endswith('.xls'):
            df = pd.read_excel(BytesIO(content))
        else:
            raise ValueError("Unsupported file format. Please upload CSV or Excel.")

        cols = [str(c).lower().strip() for c in df.columns]
        df.columns = cols

        bank_id_col = next((c for c in cols if c in ("bank_id", "bank id", "bankid", "id")), None)
        bank_name_col = next((c for c in cols if c in ("bank_name", "bank name", "bank")), None)
        account_number_col = next((c for c in cols if c in ("account_number", "account number", "account_no", "account no", "accountno")), None)
        account_name_col = next((c for c in cols if c in ("account_name", "account name")), None)
        gl_account_col = next((c for c in cols if c in ("gl_account", "gl account", "gl_account_number", "gl account number", "gl")), None)
        gl_account_title_col = next((c for c in cols if c in ("gl_account_title", "gl account title", "gl_title", "gl title")), None)
        currency_col = next((c for c in cols if c in ("currency", "currency_code", "currency code")), None)
        is_active_col = next((c for c in cols if c in ("is_active", "active", "status")), None)

        if not account_number_col:
            raise ValueError("Could not find Account Number column in uploaded file.")

        def _to_bool(value: Any) -> bool:
            if value is None or (isinstance(value, float) and pd.isna(value)):
                return True
            text = str(value).strip().lower()
            if text in ("1", "true", "yes", "active", "y"):
                return True
            if text in ("0", "false", "no", "inactive", "n"):
                return False
            return True

        upserted = 0
        try:
            for _, row in df.iterrows():
                account_number = str(row.get(account_number_col)).strip() if account_number_col and not pd.isna(row.get(account_number_col, None)) else ""
                if not account_number:
                    continue

                bank_id = str(row.get(bank_id_col)).strip() if bank_id_col and not pd.isna(row.get(bank_id_col, None)) else ""
                bank_name = str(row.get(bank_name_col)).strip() if bank_name_col and not pd.isna(row.get(bank_name_col, None)) else ""
                if not bank_id and bank_name:
                    bank_id = bank_name

                account_name = str(row.get(account_name_col)).strip() if account_name_col and not pd.isna(row.get(account_name_col, None)) else None
                gl_account = str(row.get(gl_account_col)).strip() if gl_account_col and not pd.isna(row.get(gl_account_col, None)) else None
                gl_account_title = str(row.get(gl_account_title_col)).strip() if gl_account_title_col and not pd.isna(row.get(gl_account_title_col, None)) else None
                currency_code = str(row.get(currency_col)).strip() if currency_col and not pd.isna(row.get(currency_col, None)) else None
                is_active = _to_bool(row.get(is_active_col, None)) if is_active_col else True

                existing_query = self.db.query(BankAccount).filter(BankAccount.account_number == account_number)
                if bank_id:
                    existing_query = existing_query.filter(BankAccount.bank_id == bank_id)
                existing = existing_query.first()

                if existing:
                    existing.account_name = account_name or existing.account_name
                    existing.bank_name = bank_name or existing.bank_name
                    existing.gl_account = gl_account or existing.gl_account
                    existing.gl_account_title = gl_account_title or existing.gl_account_title
                    existing.currency_code = currency_code or existing.currency_code
                    existing.is_active = is_active
                    existing.source = "upload"
                    existing.updated_at = get_ist_now()
                else:
                    self.db.add(BankAccount(
                        bank_id=bank_id or None,
                        account_number=account_number,
                        account_name=account_name,
                        bank_name=bank_name or None,
                        gl_account=gl_account,
                        gl_account_title=gl_account_title,
                        currency_code=currency_code,
                        is_active=is_active,
                        source="upload",
                    ))

                upserted += 1

            self.db.commit()
            return upserted
        except Exception:
            self.db.rollback()
            raise

    def get_bank_accounts(self) -> List[Dict[str, Any]]:
        rows = self.db.query(BankAccount).order_by(BankAccount.updated_at.desc(), BankAccount.id.desc()).all()
        return [
            {
                "id": r.id,
                "bank_id": r.bank_id,
                "bank_name": r.bank_name,
                "account_number": r.account_number,
                "account_name": r.account_name,
                "gl_account": r.gl_account,
                "gl_account_title": r.gl_account_title,
                "currency_code": r.currency_code,
                "is_active": r.is_active,
                "source": r.source,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]

    def delete_bank_account(self, account_id: int) -> bool:
        """Delete a bank account by ID."""
        account = self.db.query(BankAccount).filter(BankAccount.id == account_id).first()
        if not account:
            return False

        try:
            self.db.delete(account)
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            raise

    def sync_bank_accounts_from_sage_cache(self) -> int:
        """Build/refresh bank_accounts from existing Sage cache + GL master."""
        gl_title_by_acct = {
            g.account_number: g.title
            for g in self.db.query(GLMaster).all()
            if g.account_number
        }

        source_rows = self.db.query(SageGLTransactionCache).filter(
            SageGLTransactionCache.account != None
        ).all()

        upserted = 0
        try:
            seen = set()
            for row in source_rows:
                account_number = (row.account or "").strip()
                if not account_number:
                    continue

                bank_name = (row.bank or "").strip() or None
                bank_id = bank_name
                key = (bank_id or "", account_number)
                if key in seen:
                    continue
                seen.add(key)

                gl_title = gl_title_by_acct.get(account_number)

                existing_query = self.db.query(BankAccount).filter(BankAccount.account_number == account_number)
                if bank_id:
                    existing_query = existing_query.filter(BankAccount.bank_id == bank_id)
                existing = existing_query.first()

                if existing:
                    existing.bank_name = bank_name or existing.bank_name
                    existing.gl_account = account_number
                    existing.gl_account_title = gl_title or existing.gl_account_title
                    existing.source = existing.source or "sage_cache"
                    existing.updated_at = get_ist_now()
                else:
                    self.db.add(BankAccount(
                        bank_id=bank_id,
                        bank_name=bank_name,
                        account_number=account_number,
                        gl_account=account_number,
                        gl_account_title=gl_title,
                        is_active=True,
                        source="sage_cache",
                    ))

                upserted += 1

            self.db.commit()
            return upserted
        except Exception:
            self.db.rollback()
            raise

    async def sync_bank_accounts_from_sage_api(self) -> int:
        """Fetch bank accounts directly from Sage Intacct REST API (list only).

        The individual detail endpoint (/checking-account/{key}) is broken on
        Sage's side (REST-9024 / printOn field error), so we use the list
        response which contains the account `id` (e.g. 'FFB_4449') and `key`.

        Mapping:
          - bank_id        → full id value ('FFB_4449')
          - bank_name      → prefix before last '_' ('FFB')
          - account_number → suffix after last '_' ('4449')

        GL enrichment:
          - gl_account       → from SageGLTransactionCache where bank = bank_id
          - gl_account_title → from GLMaster where account_number = gl_account
        """
        import httpx

        sync_svc = BaseSyncService(self.db)
        upserted = 0

        try:
            # ── Build enrichment lookups from existing DB data ──────────────
            # bank_id → GL account number (from cached Sage GL transactions)
            bank_to_gl: dict[str, str] = {}
            for row in self.db.query(SageGLTransactionCache).filter(
                SageGLTransactionCache.bank != None,
                SageGLTransactionCache.account != None
            ).all():
                if row.bank and row.account:
                    bank_to_gl.setdefault(row.bank.strip(), row.account.strip())

            # GL account number → title (from GL master)
            gl_to_title: dict[str, str] = {
                g.account_number: g.title
                for g in self.db.query(GLMaster).all()
                if g.account_number
            }
            # ────────────────────────────────────────────────────────────────

            async with httpx.AsyncClient(timeout=120.0, verify=sync_svc.verify_ssl) as client:
                token = await sync_svc._get_access_token(client)

                headers = {
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                }

                list_url = f"{sync_svc.base_url}/objects/cash-management/checking-account"
                r = await client.get(list_url, headers=headers)
                r.raise_for_status()

                items = r.json().get("ia::result", [])

                for item in items:
                    raw_id = (item.get("id") or "").strip()
                    if not raw_id:
                        continue

                    # Parse bank prefix and account number from e.g. "FFB_4449"
                    if "_" in raw_id:
                        last_underscore = raw_id.rfind("_")
                        bank_name = raw_id[:last_underscore]
                        account_number = raw_id[last_underscore + 1:]
                    else:
                        bank_name = raw_id
                        account_number = raw_id

                    bank_id = raw_id  # full id as the unique bank identifier

                    # Enrich with GL data
                    gl_account = bank_to_gl.get(bank_id)
                    gl_account_title = gl_to_title.get(gl_account) if gl_account else None

                    existing = (
                        self.db.query(BankAccount)
                        .filter(BankAccount.bank_id == bank_id)
                        .first()
                    )

                    if existing:
                        existing.bank_name = bank_name or existing.bank_name
                        existing.account_number = account_number or existing.account_number
                        existing.gl_account = gl_account or existing.gl_account
                        existing.gl_account_title = gl_account_title or existing.gl_account_title
                        existing.is_active = True
                        existing.source = "sage_api"
                        existing.updated_at = get_ist_now()
                    else:
                        self.db.add(BankAccount(
                            bank_id=bank_id,
                            bank_name=bank_name,
                            account_number=account_number,
                            gl_account=gl_account,
                            gl_account_title=gl_account_title,
                            is_active=True,
                            source="sage_api",
                        ))

                    upserted += 1

                self.db.commit()
                return upserted

        except Exception as e:
            logger.error(f"Failed to sync checking accounts from Sage API: {e}", exc_info=True)
            self.db.rollback()
            raise

    async def fetch_sage_gl_transactions(self, account_filter: str = None, financial_entity_filter: str = None) -> int:
        """Fetch GL transactions from Sage. Optionally filter by account number and financial entity."""
        try:
            from bank_reconciliation.scripts.bank_recon import get_session_id, fetch_all_gldetail, normalize_records
            
            session_id = await get_session_id()
            acct = account_filter or "10012"
            financial_entity = financial_entity_filter or "FFB_4449"
            
            records = await fetch_all_gldetail(
                session_id=session_id,
                financial_entity=financial_entity,
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
                            "financial_entity": financial_entity,
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
                    financial_entity,
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
                normalized_txn_type = self._normalize_txn_type_label(item.get("txn_type"))
                if normalized_txn_type == "debit":
                    t_type = "debit"
                elif normalized_txn_type == "credit":
                    t_type = "credit"
                else:
                    # Keep matching behavior stable: unknown Sage labels default by amount sign.
                    t_type = "debit" if amount < 0 else "credit"
                
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
                    tr_type=str(item.get("txn_type") or tr_type) if (item.get("txn_type") or tr_type) is not None else None,
                    bank=str(bank) if bank is not None else None,
                )
                to_save.append(cache_item)
                
            if to_save:
                self.db.bulk_save_objects(to_save)

            auto_matched_pairs = self._auto_match_sage_internal_reversals(
                account_number=acct,
                financial_entity=financial_entity,
            )

            if auto_matched_pairs:
                logger.info(
                    "Auto-matched %s internal Sage reversal pair(s) for account=%s financial_entity=%s",
                    auto_matched_pairs,
                    acct,
                    financial_entity,
                )

            if to_save or updated_count or auto_matched_pairs:
                self.db.commit()

            return len(to_save) + updated_count
            
        except httpx.TimeoutException as e:
            logger.error(f"Sage API connection timed out: {e}", exc_info=True)
            self.db.rollback()
            raise Exception("Sage Intacct server timed out while fetching transactions. Please try again.") from e
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
        auto_matched_pairs = self._auto_match_sage_internal_reversals(
            account_number=account_number
        )
        if auto_matched_pairs:
            logger.info(
                "Auto-matched %s internal Sage pair(s) before bank-vs-sage matching (account=%s)",
                auto_matched_pairs,
                account_number,
            )

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

        candidate_bank_ids = [b.id for b in unmatched_bank]
        candidate_sage_ids = [s.id for s in unmatched_sage]

        matches_found = auto_matched_pairs
        
        for b_txn in unmatched_bank:
            if b_txn.is_matched:
                continue

            # Per current business rules:
            # - Debit: check no + debit amount + transaction type
            # - Credit: reference no + posting date + description + amount
            # - ACH debit: date + amount + description
            for s_txn in unmatched_sage:
                if s_txn.is_matched:
                    continue

                if not self._pair_matches_criteria(b_txn, s_txn):
                    continue

                b_txn.is_matched = True
                s_txn.is_matched = True
                self.db.add(ReconciliationResult(
                    bank_transaction_id=b_txn.id,
                    sage_transaction_id=s_txn.id,
                    match_status="matched"
                ))
                matches_found += 1
                break

        # Refresh unmatched snapshots after applying matches in-memory.
        remaining_unmatched_bank_ids = [b.id for b in unmatched_bank if not b.is_matched]
        remaining_unmatched_sage_ids = [s.id for s in unmatched_sage if not s.is_matched]

        # Clear old unmatched rows for this run scope to avoid duplicates/stale entries.
        if candidate_bank_ids or candidate_sage_ids:
            stale_unmatched_query = self.db.query(ReconciliationResult).filter(
                ReconciliationResult.match_status == "unmatched"
            )
            if candidate_bank_ids and candidate_sage_ids:
                stale_unmatched_query = stale_unmatched_query.filter(
                    (ReconciliationResult.bank_transaction_id.in_(candidate_bank_ids)) |
                    (ReconciliationResult.sage_transaction_id.in_(candidate_sage_ids))
                )
            elif candidate_bank_ids:
                stale_unmatched_query = stale_unmatched_query.filter(
                    ReconciliationResult.bank_transaction_id.in_(candidate_bank_ids)
                )
            else:
                stale_unmatched_query = stale_unmatched_query.filter(
                    ReconciliationResult.sage_transaction_id.in_(candidate_sage_ids)
                )
            stale_unmatched_query.delete(synchronize_session=False)

        # Persist unmatched bank-only rows.
        for bank_id in remaining_unmatched_bank_ids:
            self.db.add(ReconciliationResult(
                bank_transaction_id=bank_id,
                sage_transaction_id=None,
                match_status="unmatched"
            ))

        # Persist unmatched sage-only rows.
        for sage_id in remaining_unmatched_sage_ids:
            self.db.add(ReconciliationResult(
                bank_transaction_id=None,
                sage_transaction_id=sage_id,
                match_status="unmatched"
            ))
                            
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
        pairing_mode = "pairwise"

        if len(bank_transaction_ids) == len(sage_transaction_ids):
            pairs = list(zip(bank_transaction_ids, sage_transaction_ids))
        elif len(bank_transaction_ids) == 1:
            pairing_mode = "one-to-many"
            bank_id = bank_transaction_ids[0]
            bank_txn = bank_by_id[bank_id]

            if self._normalize_text(bank_txn.transaction_type) != "debit":
                raise ValueError("Grouped matching is allowed only for debit transactions.")
            if self._is_ach_debit(bank_txn):
                raise ValueError("ACH debit must be matched one-to-one.")

            bank_check = self._normalize_check_number(bank_by_id[bank_id].check_number)
            if not bank_check:
                raise ValueError("Check no is wrong.")

            # Validate every sage check number — accept voided variants like "Voided - 8241"
            # by extracting the trailing numeric portion from the normalised doc_number.
            def _extract_check_suffix(raw_doc: str) -> str:
                """Return the trailing digit-run from a normalised check string.
                e.g. 'voided-8241' -> '8241',  '8241' -> '8241'."""
                m = re.search(r"(\d+)$", raw_doc)
                return m.group(1) if m else raw_doc

            for sid in sage_transaction_ids:
                if self._normalize_text(sage_by_id[sid].transaction_type) != "debit":
                    raise ValueError("Grouped matching is allowed only for debit transactions.")
                sage_check_raw = self._normalize_check_number(sage_by_id[sid].doc_number)
                sage_check = _extract_check_suffix(sage_check_raw)
                bank_check_digits = _extract_check_suffix(bank_check)
                if not sage_check or sage_check != bank_check_digits:
                    raise ValueError("Check no is wrong.")

            # Amount validation: for void pairs the Sage items include an original + its
            # void (same amount, both debits) which net to $0 when summed.  In that case
            # the bank amount should equal the original (non-voided) Sage entry amount.
            bank_total = _to_decimal(bank_by_id[bank_id].amount)
            sage_total = sum((_to_decimal(sage_by_id[sid].amount) for sid in sage_transaction_ids), Decimal("0"))

            # Detect a pure void-pair: exactly two sage rows with the same absolute amount
            # where one doc_number contains a "void" indicator.
            is_void_pair = False
            if len(sage_transaction_ids) == 2:
                sid_a, sid_b = sage_transaction_ids
                amt_a = _to_decimal(sage_by_id[sid_a].amount)
                amt_b = _to_decimal(sage_by_id[sid_b].amount)
                doc_a = self._normalize_text(sage_by_id[sid_a].doc_number or "")
                doc_b = self._normalize_text(sage_by_id[sid_b].doc_number or "")
                void_keywords = ("void", "voided")
                one_is_void = any(kw in doc_a for kw in void_keywords) or any(kw in doc_b for kw in void_keywords)
                if one_is_void and amt_a == amt_b:
                    # Bank should match the amount of the original (non-void) entry
                    is_void_pair = bank_total == amt_a
                    if not is_void_pair:
                        raise ValueError("Amount does not match.")

            if not is_void_pair and bank_total != sage_total:
                raise ValueError("Amount does not match.")

            pairs = [(bank_id, sid) for sid in sage_transaction_ids]
        elif len(sage_transaction_ids) == 1:
            pairing_mode = "many-to-one"
            sage_id = sage_transaction_ids[0]
            sage_txn = sage_by_id[sage_id]

            if self._normalize_text(sage_txn.transaction_type) != "debit":
                raise ValueError("Grouped matching is allowed only for debit transactions.")

            sage_total = _to_decimal(sage_by_id[sage_id].amount)
            bank_total = sum((_to_decimal(bank_by_id[bid].amount) for bid in bank_transaction_ids), Decimal("0"))
            if bank_total != sage_total:
                raise ValueError("Amount does not match.")

            sage_check = self._normalize_check_number(sage_by_id[sage_id].doc_number)
            if not sage_check:
                raise ValueError("Check no is wrong.")

            for bid in bank_transaction_ids:
                if self._normalize_text(bank_by_id[bid].transaction_type) != "debit":
                    raise ValueError("Grouped matching is allowed only for debit transactions.")
                if self._is_ach_debit(bank_by_id[bid]):
                    raise ValueError("ACH debit must be matched one-to-one.")
                bank_check = self._normalize_check_number(bank_by_id[bid].check_number)
                if not bank_check or bank_check != sage_check:
                    raise ValueError("Check no is wrong.")

            pairs = [(bid, sage_id) for bid in bank_transaction_ids]
        else:
            raise ValueError(
                "For manual matching, select equal counts or use one-to-many / many-to-one selection."
            )

        if pairing_mode == "pairwise":
            for bank_id, sage_id in pairs:
                bank_txn = bank_by_id[bank_id]
                sage_txn = sage_by_id[sage_id]

                if not self._pair_matches_criteria(bank_txn, sage_txn):
                    raise ValueError("Selected pair does not meet matching criteria.")

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

    def mark_void_pair_matched(self, sage_transaction_ids: List[int]) -> int:
        """Mark a Sage-only void pair (original + voided entry) as matched with no bank counterpart.

        Rules:
        - Exactly 2 Sage rows must be selected.
        - Both must share the same numeric check number (e.g. '8241' and 'Voided - 8241').
        - Both amounts must be equal (they cancel each other out).
        - bank_transaction_id is stored as NULL in ReconciliationResult.
        """
        if len(sage_transaction_ids) != 2:
            raise ValueError("Void pair matching requires exactly 2 Sage rows (original + voided).")

        sage_txns = self.db.query(SageGLTransactionCache).filter(
            SageGLTransactionCache.id.in_(sage_transaction_ids)
        ).all()

        if len(sage_txns) != 2:
            raise ValueError("Some selected Sage transactions were not found.")

        sage_by_id = {t.id: t for t in sage_txns}
        sid_a, sid_b = sage_transaction_ids
        txn_a, txn_b = sage_by_id[sid_a], sage_by_id[sid_b]

        # Extract trailing digit suffix to normalise "Voided - 8241" -> "8241"
        def _check_suffix(raw: str) -> str:
            m = re.search(r"(\d+)$", raw)
            return m.group(1) if m else raw

        check_a = _check_suffix(self._normalize_check_number(txn_a.doc_number or ""))
        check_b = _check_suffix(self._normalize_check_number(txn_b.doc_number or ""))

        if not check_a or not check_b or check_a != check_b:
            raise ValueError(
                "Both Sage rows must share the same check number (e.g. '8241' and 'Voided - 8241')."
            )

        # Confirm one entry carries a void indicator
        void_keywords = ("void", "voided")
        doc_a_norm = self._normalize_text(txn_a.doc_number or "")
        doc_b_norm = self._normalize_text(txn_b.doc_number or "")
        one_is_void = (
            any(kw in doc_a_norm for kw in void_keywords)
            or any(kw in doc_b_norm for kw in void_keywords)
        )
        if not one_is_void:
            raise ValueError(
                "One of the Sage rows must be a voided entry (doc number should contain 'Void')."
            )

        amt_a = _to_decimal(txn_a.amount)
        amt_b = _to_decimal(txn_b.amount)
        if amt_a != amt_b:
            raise ValueError("Both Sage rows must have the same amount to form a void pair.")

        marked = 0
        for sid in sage_transaction_ids:
            sage_txn = sage_by_id[sid]
            if not sage_txn.is_matched:
                sage_txn.is_matched = True

            existing = self.db.query(ReconciliationResult).filter(
                ReconciliationResult.bank_transaction_id.is_(None),
                ReconciliationResult.sage_transaction_id == sid,
                ReconciliationResult.match_status == "matched",
            ).first()

            if existing:
                continue

            self.db.add(ReconciliationResult(
                bank_transaction_id=None,
                sage_transaction_id=sid,
                match_status="matched",
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
                            "check_number": r.bank_transaction.check_number,
                            "amount": float(r.bank_transaction.amount),
                            "type": r.bank_transaction.transaction_type,
                            "account_number": r.bank_transaction.account_number,
                        },
                        "sage": {
                            "id": r.sage_transaction.id,
                            "date": r.sage_transaction.date.isoformat(),
                            "description": r.sage_transaction.description,
                            "check_number": r.sage_transaction.doc_number,
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
                        "account_number": t.account_number,
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
                    "account_number": t.account_number,
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
