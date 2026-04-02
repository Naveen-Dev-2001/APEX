from fastapi import APIRouter, HTTPException, Depends, Body, Query
from typing import List, Optional
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.database.database import get_db
from app.models.db_models import Currency, ExchangeRateMaster
from app.repository.repositories import currency_repo, exchange_rate_master_repo
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from app.models.currency import CurrencyCreate, CurrencyUpdate, CurrencyResponse

router = APIRouter(tags=["Currencies"])

@router.get("/", response_model=List[CurrencyResponse])
async def get_currencies(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    currencies = currency_repo.get_multi(db, limit=1000)
    
    # Seed default currencies if none exist
    if not currencies:
        default_currencies = [
            {"name": "US Dollar", "symbol": "$", "code": "USD"},
            {"name": "Indian Rupee", "symbol": "₹", "code": "INR"}
        ]
        currency_repo.bulk_create(db, obj_in=default_currencies)
        currencies = currency_repo.get_multi(db, limit=1000)
        
    return currencies

@router.post("/", response_model=CurrencyResponse)
async def create_currency(
    currency: CurrencyCreate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can add currencies")
        
    new_currency_data = {
        "name": currency.name,
        "symbol": currency.symbol,
        "code": currency.code
    }
    new_currency = currency_repo.create(db, obj_in=new_currency_data)
    
    return new_currency

@router.put("/{currency_id}", response_model=CurrencyResponse)
async def update_currency(
    currency_id: int,
    currency: CurrencyUpdate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update currencies")
        
    db_currency = currency_repo.get(db, currency_id)
    if not db_currency:
        raise HTTPException(status_code=404, detail="Currency not found")
        
    update_data = {}
    if currency.name is not None: update_data["name"] = currency.name
    if currency.symbol is not None: update_data["symbol"] = currency.symbol
    if currency.code is not None: update_data["code"] = currency.code
    update_data["updated_at"] = datetime.utcnow()
    
    db_currency = currency_repo.update(db, db_obj=db_currency, obj_in=update_data)
    return db_currency

@router.delete("/{currency_id}")
async def delete_currency(
    currency_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete currencies")
        
    db_currency = currency_repo.get(db, currency_id)
    if not db_currency:
        raise HTTPException(status_code=404, detail="Currency not found")
        
    currency_repo.remove(db, id=currency_id)
    
    return {"message": "Currency deleted successfully"}


@router.get("/exchange-rate")
async def get_exchange_rate(
    base_currency: str = Query(..., description="Base currency code, e.g. INR"),
    target_currency: str = Query(..., description="Target currency code, e.g. USD"),
    invoice_date: Optional[str] = Query(None, description="Invoice date in YYYY-MM-DD format"),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Fetch the exchange rate for a currency pair from the master table.
    
    Lookup logic:
    1. If invoice_date is provided and is NOT today, find the record whose
       effective_date is <= invoice_date (closest match, i.e. latest date not exceeding invoice date).
    2. If invoice_date is today, or no match found above, fall back to the latest
       record by effective_date (most recently effective rate).
    3. If still no record, return 404.
    """
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    use_fallback = True
    rate_record = None

    if invoice_date and invoice_date != today_str:
        try:
            # Parse invoice date — accept both YYYY-MM-DD and MM-DD-YYYY
            try:
                inv_date = datetime.strptime(invoice_date, "%Y-%m-%d")
            except ValueError:
                inv_date = datetime.strptime(invoice_date, "%m-%d-%Y")

            # Find the closest rate on or before the invoice date
            rate_list = exchange_rate_master_repo.get_multi(
                db,
                filters={
                    "base_currency": base_currency.upper(),
                    "target_currency": target_currency.upper(),
                    "status": "active"
                },
                expressions=[ExchangeRateMaster.effective_date <= inv_date],
                order_by="effective_date",
                descending=True,
                limit=1
            )
            rate_record = rate_list[0] if rate_list else None
            
            if rate_record:
                use_fallback = False
        except (ValueError, Exception):
            use_fallback = True

    if use_fallback or not rate_record:
        # Fall back to the latest effective rate available
        rate_list = exchange_rate_master_repo.get_multi(
            db,
            filters={
                "base_currency": base_currency.upper(),
                "target_currency": target_currency.upper(),
                "status": "active"
            },
            order_by="effective_date",
            descending=True,
            limit=1
        )
        rate_record = rate_list[0] if rate_list else None

    if not rate_record:
        raise HTTPException(
            status_code=404,
            detail=f"No exchange rate found for {base_currency.upper()} → {target_currency.upper()}"
        )

    return {
        "base_currency": rate_record.base_currency,
        "target_currency": rate_record.target_currency,
        "exchange_rate": float(rate_record.exchange_rate),
        "effective_date": rate_record.effective_date.isoformat() if rate_record.effective_date else None,
        "rate_key": rate_record.rate_key,
        "fallback_used": use_fallback
    }
