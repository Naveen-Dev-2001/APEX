import logging
logger = logging.getLogger("ai_app")

import httpx
import os
import json
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from common.models.db_models import GLMaster
from common.repository.repositories import gl_master_repo


class GLSyncService:
    # --- State Management ---
    _sync_lock: Optional[asyncio.Lock] = None

    @classmethod
    def _get_lock(cls) -> asyncio.Lock:
        if cls._sync_lock is None:
            cls._sync_lock = asyncio.Lock()
        return cls._sync_lock

    def __init__(self, db: Session):
        self.db = db
        # Read credentials directly from environment loaded via .env.zoho
        self.client_id = os.getenv("ZOHO_CLIENT_ID")
        self.client_secret = os.getenv("ZOHO_CLIENT_SECRET")
        self.refresh_token = os.getenv("ZOHO_REFRESH_TOKEN")
        self.org_id = os.getenv("ZOHO_ORG_ID")
        self.token_url = os.getenv("ZOHO_TOKEN_URL", "https://accounts.zoho.com/oauth/v2/token")
        self.api_base = os.getenv("ZOHO_API_BASE", "https://www.zohoapis.com/books/v3")
        self.verify_ssl = os.getenv("ZOHO_VERIFY_SSL", "false").lower() == "true"

    async def _get_access_token(self, client: httpx.AsyncClient) -> str:
        payload = {
            "grant_type": "refresh_token",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": self.refresh_token,
        }
        response = await client.post(self.token_url, data=payload, timeout=30.0)
        response.raise_for_status()
        data = response.json()
        
        if "error" in data:
            raise RuntimeError(f"Zoho token error: {data['error']}")
            
        access_token = data.get("access_token")
        if not access_token:
            raise RuntimeError(f"No access_token in Zoho response: {data}")
            
        return access_token

    def _extract_map(self, a: Dict[str, Any]) -> Dict[str, Any]:
        account_id = str(a.get("account_id"))
        account_code = a.get("account_code")
        account_name = a.get("account_name") or "Unknown"
        
        return {
            "gl_key": account_id,
            "account_number": account_code,
            "title": account_name[:200],
            "account_name": account_name[:200],
            "account_code": (account_code or "")[:100],
            "account_type": (a.get("account_type") or "")[:100],
            "status": "active" if a.get("is_active", True) else "inactive",
            "raw_data": json.dumps(a, default=str),
            
            # Configurations & Defaults
            "normal_balance": None,
            "require_department": False,
            "require_location": False,
            "disallow_direct_posting": False,
            "updated_at": datetime.utcnow()
        }

    def _bulk_upsert_gl_accounts(self, accounts: List[Dict[str, Any]], key_to_id: Dict[str, int], code_to_id: Dict[str, int]):
        to_insert = []
        to_update = []
        
        # Deduplicate accounts in the current batch first to avoid inserting duplicates in same transaction
        seen_in_batch = set()
        unique_accounts = []
        for a in accounts:
            code = a.get("account_code")
            if code:
                code_stripped = str(code).strip()
                if code_stripped not in seen_in_batch:
                    seen_in_batch.add(code_stripped)
                    unique_accounts.append(a)
            else:
                unique_accounts.append(a)
        
        for a in unique_accounts:
            mapped = self._extract_map(a)
            gl_key_stripped = mapped["gl_key"].strip() if mapped.get("gl_key") else None
            acc_num_stripped = mapped["account_number"].strip() if mapped.get("account_number") else None
            
            exist_id = None
            if gl_key_stripped:
                exist_id = key_to_id.get(gl_key_stripped)
            if not exist_id and acc_num_stripped:
                exist_id = code_to_id.get(acc_num_stripped)
            
            if exist_id:
                mapped["id"] = exist_id
                to_update.append(mapped)
            else:
                to_insert.append(mapped)

        if to_insert:
            self.db.bulk_insert_mappings(GLMaster, to_insert)
        if to_update:
            self.db.bulk_update_mappings(GLMaster, to_update)
        
        self.db.commit()

        # Retrieve actual database IDs for newly inserted records to update tracking maps for subsequent pages
        if to_insert:
            inserted_codes = [r["account_number"].strip() for r in to_insert if r.get("account_number")]
            if inserted_codes:
                new_records = self.db.query(GLMaster.id, GLMaster.gl_key, GLMaster.account_number).filter(GLMaster.account_number.in_(inserted_codes)).all()
                for r in new_records:
                    if r.gl_key:
                        key_to_id[str(r.gl_key).strip()] = r.id
                    if r.account_number:
                        code_to_id[str(r.account_number).strip()] = r.id

        return len(to_insert), len(to_update)

    async def sync_gl_accounts(self, event: Optional[asyncio.Event] = None):
        lock = self._get_lock()
        if lock.locked():
            logger.warning("Zoho GL sync is already running. Skipping request.")
            return {"status": "skipped", "message": "Sync already in progress"}
            
        async with lock:
            start_time = datetime.utcnow()
            logger.info("Starting Zoho GL Accounts Sync...")
            
            try:
                if not all([self.client_id, self.client_secret, self.refresh_token, self.org_id]):
                    raise ValueError("Zoho credentials (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID) must be configured in environment variables.")

                # Pre-fetch existing mappings with stripped values
                existing = self.db.query(GLMaster.id, GLMaster.gl_key, GLMaster.account_number).all()
                key_to_id = {str(r.gl_key).strip(): r.id for r in existing if r.gl_key}
                code_to_id = {str(r.account_number).strip(): r.id for r in existing if r.account_number}
                
                async with httpx.AsyncClient(timeout=60.0, verify=self.verify_ssl) as client:
                    access_token = await self._get_access_token(client)
                    headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}
                    
                    page = 1
                    total_inserted = 0
                    total_updated = 0
                    
                    while True:
                        url = f"{self.api_base}/chartofaccounts"
                        params = {
                            "organization_id": self.org_id,
                            "per_page": 200,
                            "page": page,
                        }
                        
                        logger.info(f"Fetching Zoho GL accounts page {page}...")
                        response = await client.get(url, headers=headers, params=params, timeout=30.0)
                        response.raise_for_status()
                        data = response.json()
                        
                        if data.get("code") != 0:
                            raise RuntimeError(
                                f"Zoho API error {data.get('code')}: {data.get('message', 'unknown error')}"
                            )
                        
                        accounts = data.get("chartofaccounts", [])
                        # Keep only accounts with non-empty code
                        accounts = [
                            a for a in accounts
                            if a.get("account_code") and a.get("account_code").strip()
                        ]
                        
                        if not accounts:
                            break
                            
                        inserted, updated = self._bulk_upsert_gl_accounts(accounts, key_to_id, code_to_id)
                        total_inserted += inserted
                        total_updated += updated
                        
                        page_context = data.get("page_context", {})
                        has_more = page_context.get("has_more_page", False)
                        
                        logger.info(
                            f"[fetch] Page {page} processed. "
                            f"Inserted: {inserted}, Updated: {updated}. "
                            f"Has more: {has_more}"
                        )
                        
                        if not has_more:
                            break
                        page += 1
                        
                duration = datetime.utcnow() - start_time
                logger.info(f"Zoho GL accounts sync complete. Duration: {duration}. Total Inserted: {total_inserted}, Total Updated: {total_updated}")
                if event:
                    event.set()
                return {
                    "status": "success",
                    "inserted": total_inserted,
                    "updated": total_updated,
                    "duration_seconds": duration.total_seconds()
                }
            except Exception as e:
                logger.error(f"Zoho GL sync failed: {e}", exc_info=True)
                if event:
                    event.set()
                raise e


class LOBSyncService:
    def __init__(self, db):
        self.db = db
    async def sync_lob(self):
        logger.warning("Zoho LOBSyncService.sync_lob is not implemented yet.")

class DepartmentSyncService:
    def __init__(self, db):
        self.db = db
    async def sync_departments(self):
        logger.warning("Zoho DepartmentSyncService.sync_departments is not implemented yet.")

class CustomerSyncService:
    # --- State Management ---
    _sync_lock: Optional[asyncio.Lock] = None

    @classmethod
    def _get_lock(cls) -> asyncio.Lock:
        if cls._sync_lock is None:
            cls._sync_lock = asyncio.Lock()
        return cls._sync_lock

    def __init__(self, db: Session):
        self.db = db
        # Read credentials directly from environment loaded via .env.zoho
        self.client_id = os.getenv("ZOHO_CLIENT_ID")
        self.client_secret = os.getenv("ZOHO_CLIENT_SECRET")
        self.refresh_token = os.getenv("ZOHO_REFRESH_TOKEN")
        self.org_id = os.getenv("ZOHO_ORG_ID")
        self.token_url = os.getenv("ZOHO_TOKEN_URL", "https://accounts.zoho.com/oauth/v2/token")
        self.api_base = os.getenv("ZOHO_API_BASE", "https://www.zohoapis.com/books/v3")
        self.verify_ssl = os.getenv("ZOHO_VERIFY_SSL", "false").lower() == "true"

    async def _get_access_token(self, client: httpx.AsyncClient) -> str:
        payload = {
            "grant_type": "refresh_token",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": self.refresh_token,
        }
        response = await client.post(self.token_url, data=payload, timeout=30.0)
        response.raise_for_status()
        data = response.json()
        
        if "error" in data:
            raise RuntimeError(f"Zoho token error: {data['error']}")
            
        access_token = data.get("access_token")
        if not access_token:
            raise RuntimeError(f"No access_token in Zoho response: {data}")
            
        return access_token

    def _extract_customer_map(self, c: Dict[str, Any]) -> Dict[str, Any]:
        contact_id = str(c.get("contact_id"))
        customer_name = c.get("contact_name") or c.get("company_name") or "Unknown"
        
        billing_address = c.get("billing_address")
        if not isinstance(billing_address, dict):
            billing_address = {}
            
        return {
            "customer_key": contact_id,
            "customer_id": contact_id,
            "customer_name": customer_name[:200],
            "company_name": (c.get("company_name") or "")[:200],
            "display_name": (c.get("company_name") or c.get("contact_name") or "")[:200],
            "email_id": (c.get("email") or "")[:255],
            "phone": (c.get("phone") or c.get("mobile") or "")[:50],
            "currency_code": (c.get("currency_code") or "")[:10],
            "billing_address": (billing_address.get("address") or "")[:255],
            "billing_street2": (billing_address.get("street2") or "")[:255],
            "billing_city": (billing_address.get("city") or "")[:100],
            "status": c.get("status", "active"),
            "raw_data": json.dumps(c, default=str),
            "updated_at": datetime.utcnow()
        }

    def _bulk_upsert_customers(self, customer_details: List[Dict[str, Any]], key_to_id: Dict[str, int], cid_to_id: Dict[str, int]):
        from common.models.db_models import CustomerMaster
        to_insert = []
        to_update = []
        
        # Deduplicate customers in current batch first
        seen_in_batch = set()
        unique_customers = []
        for c in customer_details:
            cid = c.get("contact_id")
            if cid:
                cid_stripped = str(cid).strip()
                if cid_stripped not in seen_in_batch:
                    seen_in_batch.add(cid_stripped)
                    unique_customers.append(c)
            else:
                unique_customers.append(c)
        
        for c in unique_customers:
            cm = self._extract_customer_map(c)
            key_stripped = cm["customer_key"].strip() if cm.get("customer_key") else None
            cid_stripped = cm["customer_id"].strip() if cm.get("customer_id") else None
            
            exist_id = None
            if key_stripped:
                exist_id = key_to_id.get(key_stripped)
            if not exist_id and cid_stripped:
                exist_id = cid_to_id.get(cid_stripped)
            
            if exist_id:
                cm["id"] = exist_id
                to_update.append(cm)
            else:
                to_insert.append(cm)

        if to_insert:
            self.db.bulk_insert_mappings(CustomerMaster, to_insert)
        if to_update:
            self.db.bulk_update_mappings(CustomerMaster, to_update)
        
        self.db.commit()

        # Update tracking maps with database IDs of newly inserted customers
        if to_insert:
            inserted_cids = [r["customer_id"].strip() for r in to_insert if r.get("customer_id")]
            if inserted_cids:
                new_records = self.db.query(CustomerMaster.id, CustomerMaster.customer_key, CustomerMaster.customer_id).filter(CustomerMaster.customer_id.in_(inserted_cids)).all()
                for r in new_records:
                    if r.customer_key:
                        key_to_id[str(r.customer_key).strip()] = r.id
                    if r.customer_id:
                        cid_to_id[str(r.customer_id).strip()] = r.id

        return len(to_insert), len(to_update)

    async def sync_customers(self, event: Optional[asyncio.Event] = None):
        from common.models.db_models import CustomerMaster
        lock = self._get_lock()
        if lock.locked():
            logger.warning("Zoho Customer sync is already running. Skipping request.")
            return {"status": "skipped", "message": "Sync already in progress"}
            
        async with lock:
            start_time = datetime.utcnow()
            logger.info("Starting Zoho Customer Sync...")
            
            try:
                if not all([self.client_id, self.client_secret, self.refresh_token, self.org_id]):
                    raise ValueError("Zoho credentials (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID) must be configured in environment variables.")

                # Pre-fetch existing mappings with stripped values
                existing = self.db.query(CustomerMaster.id, CustomerMaster.customer_key, CustomerMaster.customer_id).all()
                key_to_id = {str(r.customer_key).strip(): r.id for r in existing if r.customer_key}
                cid_to_id = {str(r.customer_id).strip(): r.id for r in existing if r.customer_id}
                
                async with httpx.AsyncClient(timeout=60.0, verify=self.verify_ssl) as client:
                    access_token = await self._get_access_token(client)
                    headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}
                    
                    page = 1
                    total_inserted = 0
                    total_updated = 0
                    
                    while True:
                        url = f"{self.api_base}/contacts"
                        params = {
                            "organization_id": self.org_id,
                            "contact_type": "customer",
                            "per_page": 200,
                            "page": page,
                        }
                        
                        logger.info(f"Fetching Zoho customers page {page}...")
                        response = await client.get(url, headers=headers, params=params, timeout=30.0)
                        response.raise_for_status()
                        data = response.json()
                        
                        if data.get("code") != 0:
                            raise RuntimeError(
                                f"Zoho API error {data.get('code')}: {data.get('message', 'unknown error')}"
                            )
                        
                        contacts = data.get("contacts", [])
                        if not contacts:
                            break
                            
                        inserted, updated = self._bulk_upsert_customers(contacts, key_to_id, cid_to_id)
                        total_inserted += inserted
                        total_updated += updated
                        
                        page_context = data.get("page_context", {})
                        has_more = page_context.get("has_more_page", False)
                        
                        logger.info(
                            f"[fetch] Page {page} processed. "
                            f"Inserted: {inserted}, Updated: {updated}. "
                            f"Has more: {has_more}"
                        )
                        
                        if not has_more:
                            break
                        page += 1
                        
                duration = datetime.utcnow() - start_time
                logger.info(f"Zoho Customer Sync complete. Duration: {duration}. Total Inserted: {total_inserted}, Total Updated: {total_updated}")
                if event:
                    event.set()
                return {
                    "status": "success",
                    "inserted": total_inserted,
                    "updated": total_updated,
                    "duration_seconds": duration.total_seconds()
                }
            except Exception as e:
                logger.error(f"Zoho Customer Sync failed: {e}", exc_info=True)
                if event:
                    event.set()
                raise e

class ItemSyncService:
    def __init__(self, db):
        self.db = db
    async def sync_items(self):
        logger.warning("Zoho ItemSyncService.sync_items is not implemented yet.")

class ExchangeRateSyncService:
    def __init__(self, db):
        self.db = db
    async def sync_exchange_rates(self):
        logger.warning("Zoho ExchangeRateSyncService.sync_exchange_rates is not implemented yet.")

class EntitySyncService:
    def __init__(self, db):
        self.db = db
    async def sync_entities(self):
        logger.warning("Zoho EntitySyncService.sync_entities is not implemented yet.")
