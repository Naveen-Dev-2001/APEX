import httpx
import os
import logging
import json
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from common.models.db_models import VendorMaster
from common.repository.repositories import vendor_master_repo

logger = logging.getLogger("ai_app")

class VendorSyncService:
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

    def _extract_vendor_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        contact_id = str(v.get("contact_id"))
        vendor_name = v.get("contact_name") or v.get("company_name") or "Unknown"
        billing_address = v.get("billing_address") or {}
        
        return {
            "vendor_key": contact_id,
            "vendor_id": contact_id,
            "vendor_name": vendor_name[:200],
            "company_name": (v.get("company_name") or "")[:200],
            "display_name": (v.get("company_name") or v.get("contact_name") or "")[:200],
            "email_id": (v.get("email") or "")[:255],
            "primary_email_address": (v.get("email") or "")[:255],
            "phone": (v.get("phone") or "")[:50],
            "primary_phone": (v.get("phone") or "")[:50],
            "mobile_phone": (v.get("mobile") or "")[:50],
            "currency_code": (v.get("currency_code") or "")[:10],
            "pay_terms": str(v.get("payment_terms", "") or ""),
            "payment_terms_label": (v.get("payment_terms_label") or "")[:100],
            "status": v.get("status", "active"),
            "address_line1": (billing_address.get("address") or "")[:255],
            "address_line2": (billing_address.get("street2") or "")[:255],
            "city": (billing_address.get("city") or "")[:100],
            "state_or_territory": (billing_address.get("state") or "")[:100],
            "zip_or_postal_code": (billing_address.get("zip") or "")[:20],
            "country": (billing_address.get("country") or "")[:100],
            "billing_address": json.dumps(billing_address, default=str),
            "raw_data": json.dumps(v, default=str),
            
            # Configurations (Boolean compatibility)
            "gst_eligibility": False,
            "tds_applicability": False,
            "workflow_applicable": True,
            "line_grouping": False,
            "updated_at": datetime.utcnow()
        }

    def _bulk_upsert_vendors(self, vendor_details: List[Dict[str, Any]], key_to_id: Dict[str, int], vid_to_id: Dict[str, int]):
        to_insert = []
        to_update = []
        
        # Deduplicate vendors in current batch first
        seen_in_batch = set()
        unique_vendors = []
        for v in vendor_details:
            cid = v.get("contact_id")
            if cid:
                cid_stripped = str(cid).strip()
                if cid_stripped not in seen_in_batch:
                    seen_in_batch.add(cid_stripped)
                    unique_vendors.append(v)
            else:
                unique_vendors.append(v)
        
        for v in unique_vendors:
            vm = self._extract_vendor_map(v)
            key_stripped = vm["vendor_key"].strip() if vm.get("vendor_key") else None
            vid_stripped = vm["vendor_id"].strip() if vm.get("vendor_id") else None
            
            exist_id = None
            if key_stripped:
                exist_id = key_to_id.get(key_stripped)
            if not exist_id and vid_stripped:
                exist_id = vid_to_id.get(vid_stripped)
            
            if exist_id:
                vm["id"] = exist_id
                to_update.append(vm)
            else:
                to_insert.append(vm)

        if to_insert:
            self.db.bulk_insert_mappings(VendorMaster, to_insert)
        if to_update:
            self.db.bulk_update_mappings(VendorMaster, to_update)
        
        self.db.commit()

        # Update tracking maps with database IDs of newly inserted vendors
        if to_insert:
            inserted_vids = [r["vendor_id"].strip() for r in to_insert if r.get("vendor_id")]
            if inserted_vids:
                new_records = self.db.query(VendorMaster.id, VendorMaster.vendor_key, VendorMaster.vendor_id).filter(VendorMaster.vendor_id.in_(inserted_vids)).all()
                for r in new_records:
                    if r.vendor_key:
                        key_to_id[str(r.vendor_key).strip()] = r.id
                    if r.vendor_id:
                        vid_to_id[str(r.vendor_id).strip()] = r.id

        return len(to_insert), len(to_update)

    async def sync_vendors(self, event: Optional[asyncio.Event] = None):
        lock = self._get_lock()
        if lock.locked():
            logger.warning("Zoho Vendor sync is already running. Skipping request.")
            return {"status": "skipped", "message": "Sync already in progress"}
            
        async with lock:
            start_time = datetime.utcnow()
            logger.info("Starting Zoho Vendor Sync...")
            
            try:
                if not all([self.client_id, self.client_secret, self.refresh_token, self.org_id]):
                    raise ValueError("Zoho credentials (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID) must be configured in environment variables.")

                # Pre-fetch existing mappings with stripped values
                existing = self.db.query(VendorMaster.id, VendorMaster.vendor_key, VendorMaster.vendor_id).all()
                key_to_id = {str(r.vendor_key).strip(): r.id for r in existing if r.vendor_key}
                vid_to_id = {str(r.vendor_id).strip(): r.id for r in existing if r.vendor_id}
                
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
                            "contact_type": "vendor",
                            "per_page": 200,
                            "page": page,
                        }
                        
                        logger.info(f"Fetching Zoho vendors page {page}...")
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
                            
                        inserted, updated = self._bulk_upsert_vendors(contacts, key_to_id, vid_to_id)
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
                logger.info(f"Zoho Vendor Sync complete. Duration: {duration}. Total Inserted: {total_inserted}, Total Updated: {total_updated}")
                if event:
                    event.set()
                return {
                    "status": "success",
                    "inserted": total_inserted,
                    "updated": total_updated,
                    "duration_seconds": duration.total_seconds()
                }
            except Exception as e:
                logger.error(f"Zoho Vendor Sync failed: {e}", exc_info=True)
                if event:
                    event.set()
                raise e

    async def get_all_vendors(self, skip: int = 0, limit: int = 15, search: str = None, sort_by: str = None, sort_dir: str = 'asc') -> Dict[str, Any]:
        search_fields = ["vendor_id", "vendor_name", "address_line1", "city", "primary_email_address"]
        return vendor_master_repo.get_paginated(
            self.db,
            skip=skip,
            limit=limit,
            search=search,
            search_fields=search_fields,
            order_by=sort_by,
            descending=(sort_dir.lower() == 'desc')
        )

