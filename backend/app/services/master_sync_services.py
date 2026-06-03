import asyncio
import logging
from typing import Dict, Any, List, Optional, Type
from sqlalchemy.orm import Session
from datetime import datetime
import json

from app.services.base_sync_service import BaseSyncService
from app.models.db_models import (
    GLMaster, LOBMaster, DepartmentMaster, CustomerMaster, ItemMaster, ExchangeRateMaster, EntityMaster
)
from app.repository.repositories import (
    gl_master_repo, lob_master_repo, department_master_repo, 
    customer_master_repo, item_master_repo, exchange_rate_master_repo, entity_master_repo
)

logger = logging.getLogger(__name__)

class GLSyncService(BaseSyncService):
    def _extract_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "gl_key": str(v.get("key")),
            "account_number": v.get("id"),
            "title": v.get("name") or "Unknown",
            "normal_balance": v.get("normalBalance"),
            "status": v.get("status", "active"),
            "raw_data": json.dumps(v, default=str),
            "updated_at": datetime.utcnow()
        }

    async def sync_gl_accounts(self, event: Optional[asyncio.Event] = None):
        fields = ["key", "id", "name", "normalBalance", "status"]
        await self.sync_object(GLMaster, "general-ledger/account", fields, "gl_key", event)

    async def get_all_data(self) -> List[GLMaster]:
        return gl_master_repo.get_multi(self.db, limit=50000)

class LOBSyncService(BaseSyncService):
    def _extract_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        parent = v.get("parent") or {}
        parent_id = parent.get("id") if isinstance(parent, dict) else v.get("parent.id")
        return {
            "lob_key": str(v.get("key")),
            "lob_id": v.get("id"),
            "name": v.get("name") or "Unknown",
            "parent_id": parent_id,
            "status": v.get("status", "active"),
            "raw_data": json.dumps(v, default=str),
            "updated_at": datetime.utcnow()
        }

    async def sync_lob(self, event: Optional[asyncio.Event] = None):
        fields = ["key", "id", "name", "parent.id", "status"]
        await self.sync_object(LOBMaster, "company-config/class", fields, "lob_key", event)

    async def get_all_data(self) -> List[LOBMaster]:
        return lob_master_repo.get_multi(self.db, limit=50000)

class DepartmentSyncService(BaseSyncService):
    def _extract_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "dept_key": str(v.get("key")),
            "department_id": v.get("id"),
            "department_name": v.get("name") or "Unknown",
            "status": v.get("status", "active"),
            "raw_data": json.dumps(v, default=str),
            "updated_at": datetime.utcnow()
        }

    async def sync_departments(self, event: Optional[asyncio.Event] = None):
        fields = ["key", "id", "name", "status"]
        await self.sync_object(DepartmentMaster, "company-config/department", fields, "dept_key", event)

    async def get_all_data(self) -> List[DepartmentMaster]:
        return department_master_repo.get_multi(self.db, limit=50000)

class CustomerSyncService(BaseSyncService):
    def _extract_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "customer_key": str(v.get("key")),
            "customer_id": v.get("id"),
            "customer_name": v.get("name") or "Unknown",
            "status": v.get("status", "active"),
            "raw_data": json.dumps(v, default=str),
            "updated_at": datetime.utcnow()
        }

    async def sync_customers(self, event: Optional[asyncio.Event] = None):
        fields = ["key", "id", "name", "status"]
        await self.sync_object(CustomerMaster, "accounts-receivable/customer", fields, "customer_key", event)

    async def get_all_data(self) -> List[CustomerMaster]:
        return customer_master_repo.get_multi(self.db, limit=50000)

class ItemSyncService(BaseSyncService):
    def _extract_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        product_line = v.get("productLine") or {}
        product_line_id = product_line.get("id") if isinstance(product_line, dict) else v.get("productLineId")
        
        gl_group = v.get("glGroup") or {}
        gl_group_name = gl_group.get("name") if isinstance(gl_group, dict) else v.get("glGroupName")

        return {
            "item_key": str(v.get("key")),
            "item_id": v.get("id"),
            "name": v.get("name") or "Unknown",
            "product_line_id": product_line_id,
            "gl_group": gl_group_name,
            "status": v.get("status", "active"),
            "raw_data": json.dumps(v, default=str),
            "updated_at": datetime.utcnow()
        }

    async def sync_items(self, event: Optional[asyncio.Event] = None):
        fields = ["key", "id", "name", "productLineId", "glGroupName", "status"]
        await self.sync_object(ItemMaster, "inventory-control/item", fields, "item_key", event)

    async def get_all_data(self) -> List[ItemMaster]:
        return item_master_repo.get_multi(self.db, limit=50000)

class ExchangeRateSyncService(BaseSyncService):
    def __init__(self, db: Session):
        super().__init__(db)
        self._exchange_rate_cache = {} # Cache Parent (exchange-rate) by key

    def _extract_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        """
        Custom map for exchange-rate-line objects.
        Handles nested objects and fetches currencies from parent cache.
        """
        # 1. Rate Type Handling
        er_obj = v.get("exchangeRate") or {}
        rate_type = er_obj.get("id") if isinstance(er_obj, dict) else v.get("exchangeRateTypeId")
        
        # 2. Currency Handling (from parent cache populated in sync_exchange_rates)
        er_key = er_obj.get("key") if isinstance(er_obj, dict) else None
        base_curr, target_curr = self._exchange_rate_cache.get(er_key, (None, None))
        
        # 3. Rate and Date (Specific field names in REST v1)
        rate_value = v.get("rate")
        # Ensure we don't accidentally grab a dict if field is missing
        if isinstance(rate_value, dict): rate_value = 0.0
        
        return {
            "rate_key": str(v.get("key")),
            "rate_type": rate_type or "Actual",
            "base_currency": base_curr or "INR",
            "target_currency": target_curr or "USD",
            "exchange_rate": float(rate_value) if rate_value is not None else 0.0,
            "effective_date": v.get("effectiveStartDate") or v.get("date"),
            "status": v.get("status", "active"),
            "raw_data": json.dumps(v, default=str),
            "updated_at": datetime.utcnow()
        }

    async def sync_exchange_rates(self, event: Optional[asyncio.Event] = None):
        """
        Enhanced REST Sync: Fetches lines, then resolves parent currencies.
        """
        lock = self._get_lock("company-config/exchange-rate-line")
        if lock.locked(): return
        
        async with lock:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=120.0, verify=self.verify_ssl) as client:
                    token = await self._get_access_token(client)
                    location_id = "201"
                    if "|" in self.username:
                        location_id = self.username.split("|")[-1].strip()
                        
                    headers = {
                        "Authorization": f"Bearer {token}", 
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "locationid": location_id
                    }
                    
                    # 1. Fetch List of Lines with Query API (Handles Pagination)
                    query_url = f"{self.base_url}/services/core/query"
                    all_lines = []
                    page_size = 1000
                    query_body = {
                        "object": "company-config/exchange-rate-line",
                        "fields": ["key", "exchangeRate.key"],
                        "start": 1,
                        "size": page_size
                    }

                    logger.info(f"Syncing exchange-rate-line via Query API...")
                    
                    # Initial call
                    r = await client.post(query_url, json=query_body, headers=headers)
                    r.raise_for_status()
                    
                    res_json = r.json()
                    batch = res_json.get("ia::result", [])
                    meta = res_json.get("ia::meta", {})
                    total_count = meta.get("totalCount", 0)
                    
                    all_lines.extend(batch)
                    
                    if total_count > page_size:
                        for start in range(page_size + 1, total_count + 1, page_size):
                            query_body["start"] = start
                            r = await client.post(query_url, json=query_body, headers=headers)
                            if r.is_success:
                                batch_raw = r.json().get("ia::result", [])
                                if batch_raw:
                                    all_lines.extend(batch_raw)

                    logger.info(f"Fetched {len(all_lines)} exchange rate line keys (Expected Total: {total_count})")
                    
                    if not all_lines:
                        if event: event.set()
                        return

                    # 2. Batch Fetch Details and Parent Currencies
                    from app.models.db_models import ExchangeRateMaster
                    
                    # Pre-cache unique parent rate info
                    parent_keys = set()
                    for line in all_lines:
                        er = line.get("exchangeRate")
                        if isinstance(er, dict) and er.get("key"):
                            parent_keys.add(er.get("key"))
                    
                    # Fetch Parents Concurrently with Limit
                    logger.info(f"Pre-fetching {len(parent_keys)} exchange rate parents for currency info...")
                    parent_semaphore = asyncio.Semaphore(15)
                    async def fetch_parent(pkey):
                        async with parent_semaphore:
                            try:
                                resp = await client.get(f"{self.base_url}/objects/company-config/exchange-rate/{pkey}", headers=headers)
                                if resp.status_code == 200:
                                    pdata = resp.json().get("ia::result", {})
                                    f_curr = pdata.get("fromCurrency")
                                    t_curr = pdata.get("toCurrency")
                                    # Handle if currencies are objects
                                    f_code = f_curr.get("key") if isinstance(f_curr, dict) else f_curr
                                    t_code = t_curr.get("key") if isinstance(t_curr, dict) else t_curr
                                    self._exchange_rate_cache[pkey] = (f_code, t_code)
                            except Exception as e:
                                logger.error(f"Failed to fetch parent exchange rate {pkey}: {e}")

                    if parent_keys:
                        await asyncio.gather(*[fetch_parent(pk) for pk in parent_keys])

                    # Fetch line details (if not already fully populated in list)
                    # For REST v1 objects, detailed fetch is often needed for all fields
                    line_semaphore = asyncio.Semaphore(15)
                    async def fetch_line_detail(line):
                        key = line.get("key")
                        if not key: return line
                        async with line_semaphore:
                            try:
                                resp = await client.get(f"{self.base_url}/objects/company-config/exchange-rate-line/{key}", headers=headers)
                                if resp.status_code == 200:
                                    return resp.json().get("ia::result", {})
                                return line
                            except: return line

                    detailed_lines = await asyncio.gather(*[fetch_line_detail(l) for l in all_lines])
                    valid_lines = [l for l in detailed_lines if l]
                    
                    if valid_lines:
                        self._bulk_upsert(ExchangeRateMaster, valid_lines, "rate_key")
                        logger.info(f"Successfully synced {len(valid_lines)} exchange rates.")

                if event: event.set()
                if event: event.set()
            except httpx.ConnectError as e:
                if "CERTIFICATE_VERIFY_FAILED" in str(e):
                    msg = "Network issue try again"
                    logger.error(f"SSL Certificate Verification Failed in ExchangeRateSync: {e}")
                    if event: event.set()
                    raise RuntimeError(msg)
                raise e
            except Exception as e:
                logger.error(f"Exchange Rate Sync failed: {e}", exc_info=True)
                if event: event.set()
                raise e

    async def get_all_data(self) -> List[ExchangeRateMaster]:
        return exchange_rate_master_repo.get_multi(self.db, limit=100000)


class EntitySyncService(BaseSyncService):
    def _extract_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        address = v.get("address") or {}
        if not isinstance(address, dict):
            address = {}

        addr_line1 = address.get("addressLine1") or v.get("addressLine1") or v.get("address_line1")
        addr_line2 = address.get("addressLine2") or v.get("addressLine2") or v.get("address_line2")
        addr_line3 = address.get("addressLine3") or v.get("addressLine3") or v.get("address_line3")
        city = address.get("city") or v.get("city")
        state = address.get("state") or v.get("stateOrTerritory") or v.get("state_or_territory")
        zip_code = address.get("zip") or v.get("zipOrPostalCode") or v.get("zip_or_postal_code")
        country = address.get("country") or v.get("countryCode") or v.get("country_code")

        gst_app = v.get("gstApplicable")
        if gst_app is None:
            gst_app = False
        elif isinstance(gst_app, str):
            gst_app = gst_app.strip().lower() in ["true", "yes", "1", "t", "y"]
        else:
            gst_app = bool(gst_app)

        return {
            "entity_id": v.get("id"),
            "entity_name": v.get("name") or "Unknown",
            "registered_address": v.get("registeredAddress") or v.get("registered_address"),
            "address_line1": addr_line1,
            "address_line2": addr_line2,
            "address_line3": addr_line3,
            "city": city,
            "state_or_territory": state,
            "zip_or_postal_code": zip_code,
            "country_code": country,
            "gst_applicable": gst_app,
            "updated_at": datetime.utcnow()
        }

    def _bulk_upsert(self, model: Type, items: List[Dict[str, Any]], key_field: str):
        if not items: return 0, 0
        
        total_insert = 0
        total_update = 0
        chunk_size = 1000
        
        for i in range(0, len(items), chunk_size):
            chunk = items[i:i+chunk_size]
            to_insert = []
            to_update = []
            
            # Use 'id' from Sage (which maps to 'entity_id') as key
            ids = [str(item.get("id")) for item in chunk if item.get("id")]
            
            col = getattr(model, key_field)
            existing = self.db.query(col).filter(col.in_(ids)).all()
            existing_keys = {str(r[0]) for r in existing}

            for item in chunk:
                mapped = self._extract_map(item)
                if not mapped.get(key_field):
                    continue
                if str(mapped[key_field]) in existing_keys:
                    to_update.append(mapped)
                else:
                    to_insert.append(mapped)

            if to_insert:
                self.db.bulk_insert_mappings(model, to_insert)
            
            if to_update:
                existing_records = self.db.query(model.id, col).filter(col.in_(ids)).all()
                key_to_id = {str(r[1]): r.id for r in existing_records}
                
                for m in to_update:
                    k_val = str(m[key_field])
                    if k_val in key_to_id:
                        m["id"] = key_to_id[k_val]
                
                to_update = [m for m in to_update if "id" in m]
                if to_update:
                    self.db.bulk_update_mappings(model, to_update)
            
            self.db.commit()
            total_insert += len(to_insert)
            total_update += len(to_update)
            
        return total_insert, total_update

    async def sync_entities(self, event: Optional[asyncio.Event] = None):
        fields = ["key", "id", "name", "status"]
        await self.sync_object(EntityMaster, "company-config/entity", fields, "entity_id", event, top_level=True)

    async def get_all_data(self) -> List[EntityMaster]:
        return entity_master_repo.get_multi(self.db, limit=10000)


