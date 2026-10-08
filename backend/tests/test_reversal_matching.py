from decimal import Decimal
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from common.models.db_models import Base, SageGLTransactionCache
from bank_reconciliation.service import BankReconciliationService


def test_auto_match_same_check_number_reversal_pair():
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    rows = [
        (Decimal('100.00'), 'Payment reversal', 'CHK-1234', 'debit'),
        (Decimal('-100.00'), 'Vendor refund', 'CHK-1234', 'credit'),
    ]

    for amount, description, doc_number, transaction_type in rows:
        db.add(SageGLTransactionCache(
            sage_key=f'k-{description}',
            date=date(2026, 1, 1),
            description=description,
            account='1001',
            amount=amount,
            transaction_type=transaction_type,
            entry_date=date(2026, 1, 1),
            doc_number=doc_number,
            bank='Bank A',
            is_matched=False,
        ))

    db.commit()
    service = BankReconciliationService(db)

    matched_count = service._auto_match_sage_internal_reversals(
        account_number='1001',
        financial_entity='Bank A',
    )

    assert matched_count == 1
    remaining = db.query(SageGLTransactionCache).order_by(SageGLTransactionCache.id).all()
    assert all(t.is_matched for t in remaining)


def test_reversal_pair_with_non_zero_total_stays_unmatched():
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    rows = [
        (Decimal('500.00'), 'Payment reversal', 'CHK-5678', 'debit'),
        (Decimal('-200.00'), 'Vendor refund', 'CHK-5678', 'credit'),
    ]

    for amount, description, doc_number, transaction_type in rows:
        db.add(SageGLTransactionCache(
            sage_key=f'k-{description}',
            date=date(2026, 1, 1),
            description=description,
            account='1001',
            amount=amount,
            transaction_type=transaction_type,
            entry_date=date(2026, 1, 1),
            doc_number=doc_number,
            bank='Bank A',
            is_matched=False,
        ))

    db.commit()
    service = BankReconciliationService(db)

    matched_count = service._auto_match_sage_internal_reversals(
        account_number='1001',
        financial_entity='Bank A',
    )

    assert matched_count == 0
    remaining = db.query(SageGLTransactionCache).order_by(SageGLTransactionCache.id).all()
    assert all(not t.is_matched for t in remaining)
