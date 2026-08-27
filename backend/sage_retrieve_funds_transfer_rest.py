"""
Retrieve Funds Transfer records from Sage Intacct sandbox using OAuth2 + REST API.
Specifically configured for Cash Management -- Funds Transfer -- Entity 201.

Usage:
  python backend/sage_retrieve_funds_transfer_rest.py [entity_id]

Environment / Explicit Defaults:
  TOKEN_URL        = "https://api.intacct.com/ia/api/v1/oauth2/token"
  CLIENT_ID        = "586b7a1825a18fd5e966.app.sage.com"
  CLIENT_SECRET    = "a0fb87e95f7a9be71bf11154dd87b09a19d393b0"
  USERNAME         = "Apex AP Workflow@consolidatedanalytics-sandbox"
  SAGE_ENTITY_ID   = "Top level"
"""

import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

import httpx


def load_env_file() -> None:
    candidate_paths = [
        ".env",
        os.path.join("backend", ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
    ]
    for p in candidate_paths:
        abs_p = os.path.abspath(p)
        if os.path.exists(abs_p):
            try:
                with open(abs_p, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, _, v = line.partition("=")
                        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
                break
            except Exception:
                pass


load_env_file()

TOKEN_URL = os.environ.get("SAGE_TOKEN_URL") or "https://api.intacct.com/ia/api/v1/oauth2/token"
BASE_URL = os.environ.get("SAGE_BASE_URL") or "https://api.intacct.com/ia/api/v1"

CLIENT_ID = (
    os.environ.get("SAGE_REST_CLIENT_ID")
    or os.environ.get("OAUTH_CLIENT_ID")
    or "586b7a1825a18fd5e966.app.sage.com"
)
CLIENT_SECRET = (
    os.environ.get("SAGE_REST_CLIENT_SECRET")
    or os.environ.get("OAUTH_CLIENT_SECRET")
    or "a0fb87e95f7a9be71bf11154dd87b09a19d393b0"
)
USERNAME = (
    os.environ.get("SAGE_REST_USERNAME")
    or os.environ.get("OAUTH_USERNAME")
    or "Apex AP Workflow@consolidatedanalytics-sandbox"
)

# Entity default to 201 as requested
TARGET_ENTITY_ID = os.environ.get("SAGE_ENTITY_ID", "Top level")
LOCATION_ID = os.environ.get("SAGE_LOCATION_ID", TARGET_ENTITY_ID)
SAGE_OBJECT = os.environ.get("SAGE_OBJECT", "cash-management/funds-transfer")
PAGE_SIZE = int(os.environ.get("PAGE_SIZE", "1000"))

MAX_KEYS_ENV = os.environ.get("MAX_KEYS")
if MAX_KEYS_ENV is None or MAX_KEYS_ENV == "" or str(MAX_KEYS_ENV).lower() in ("0", "all", "none", "unlimited"):
    MAX_KEYS: Optional[int] = None  # Retrieve all records by default
else:
    MAX_KEYS = int(MAX_KEYS_ENV)

OBJECT_QUERY_FIELDS: Dict[str, List[str]] = {
    "cash-management/funds-transfer": [
        "key",
        "id",
        "referenceNumber",
        "description",
    ],
}


def build_entity_headers(access_token: str, entity_id: str) -> Dict[str, str]:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if entity_id:
        headers["locationid"] = str(entity_id)
        headers["X-IA-API-Param-Entity"] = str(entity_id)
        headers["Sage-Location-Entity"] = str(entity_id)
    return headers


async def get_oauth_token() -> str:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    token_response_path = "debug_oauth_token_response.json"

    payload = {
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "username": USERNAME,
    }

    print(f"Requesting OAuth token from {TOKEN_URL}...")
    print(f"  client_id: {CLIENT_ID}")
    print(f"  username:  {USERNAME}")

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(TOKEN_URL, json=payload, headers=headers)

        try:
            token_data = response.json()
        except Exception:
            token_data = {}

        try:
            with open(token_response_path, "w", encoding="utf-8") as f:
                json.dump(token_data, f, indent=2)
        except Exception:
            pass

        if response.status_code < 400:
            access_token = token_data.get("access_token")
            if access_token:
                print("OAuth token acquired successfully.")
                return access_token
            raise RuntimeError(f"Token response missing access_token. Response: {token_data}")

        err = token_data.get("error")
        err_desc = token_data.get("error_description")
        error_msg = f"{err}: {err_desc}" if err or err_desc else response.text[:500]

        raise RuntimeError(f"OAuth token request failed (HTTP {response.status_code}). Error: {error_msg}")


def _extract_entity_id(row: dict) -> Optional[str]:
    entity = row.get("entity")
    if isinstance(entity, dict):
        for key in ("id", "key", "name"):
            if entity.get(key):
                return str(entity.get(key))
    elif entity is not None:
        return str(entity)

    for key in ("financialEntity", "financialEntityId", "locationId", "bankAccountId", "entityId"):
        if row.get(key) is not None:
            return str(row.get(key))
    return None


def _is_target_entity(row: dict, target: str) -> bool:
    entity_value = _extract_entity_id(row)
    if not entity_value:
        return True  # Include if no explicit entity tag is found
    entity_upper = entity_value.upper()
    target_upper = target.upper()
    return entity_upper == target_upper or target_upper in entity_upper or target_upper in entity_value


async def fetch_object_keys(access_token: str, object_name: str, entity_id: str) -> List[dict]:
    headers = build_entity_headers(access_token, entity_id)

    fields = OBJECT_QUERY_FIELDS.get(object_name, ["key", "id"])
    query_url = f"{BASE_URL}/services/core/query"
    all_rows: List[dict] = []
    start = 1
    active_fields = list(fields)

    async with httpx.AsyncClient(timeout=60) as client:
        while True:
            current_page_size = PAGE_SIZE
            if MAX_KEYS is not None and MAX_KEYS > 0:
                remaining = MAX_KEYS - len(all_rows)
                if remaining <= 0:
                    break
                current_page_size = min(PAGE_SIZE, remaining)

            query_payload = {
                "object": object_name,
                "fields": active_fields,
                "start": start,
                "size": current_page_size,
            }

            print(f"[{object_name}] Querying page: start={start}, size={current_page_size} (Entity: {entity_id})")

            retry_count = 0
            response = None
            while retry_count < 5:
                response = await client.post(query_url, json=query_payload, headers=headers)
                if response.status_code == 429:
                    retry_count += 1
                    wait_time = retry_count * 3
                    print(f"HTTP 429 Rate limit hit. Backing off for {wait_time}s (retry {retry_count}/5)...")
                    await asyncio.sleep(wait_time)
                else:
                    break

            if response.status_code >= 400:
                body_text = response.text
                invalid_field_match = re.search(
                    r'"FIELD"\s*:\s*"([^"]+)"',
                    body_text,
                    flags=re.IGNORECASE,
                )
                if response.status_code == 400 and invalid_field_match:
                    bad_field = invalid_field_match.group(1)
                    if bad_field in active_fields:
                        active_fields.remove(bad_field)
                        if not active_fields:
                            active_fields = ["key"]
                        print(
                            f"Field '{bad_field}' unsupported for object '{object_name}'. Retrying without it."
                        )
                        continue

                print(f"Core query note (HTTP {response.status_code}). Will try direct GET list...")
                return []

            data = response.json()
            rows = data.get("ia::result", [])
            if isinstance(rows, dict):
                rows = [rows]

            meta = data.get("ia::meta", {})
            count = int(meta.get("count", len(rows)) or len(rows))
            total_count = int(meta.get("totalCount", 0) or 0)

            all_rows.extend(rows)
            print(f"[{object_name}] Retrieved {len(rows)} rows (Total collected: {len(all_rows)} / {total_count or 'unknown'})")

            if MAX_KEYS is not None and MAX_KEYS > 0 and len(all_rows) >= MAX_KEYS:
                all_rows = all_rows[:MAX_KEYS]
                print(f"MAX_KEYS limit ({MAX_KEYS}) reached. Stopping key query.")
                break

            if not rows or count < current_page_size:
                break
            if total_count and len(all_rows) >= total_count:
                break

            start += count
            await asyncio.sleep(0.1)

    return all_rows


async def fetch_funds_transfer_direct(access_token: str, entity_id: str) -> List[dict]:
    """
    Retrieve list directly from GET /objects/cash-management/funds-transfer
    """
    headers = build_entity_headers(access_token, entity_id)
    url = f"{BASE_URL}/objects/cash-management/funds-transfer"
    
    async with httpx.AsyncClient(timeout=60) as client:
        print(f"[cash-management/funds-transfer] Listing records from direct GET endpoint (Entity: {entity_id})...")
        response = await client.get(url, headers=headers)

        if response.status_code >= 400:
            print(f"Direct list response HTTP {response.status_code}: {response.text[:500]}")
            return []

        data = response.json()
        rows = data.get("ia::result", [])
        if isinstance(rows, dict):
            rows = [rows]

        if MAX_KEYS is not None and MAX_KEYS > 0:
            rows = rows[:MAX_KEYS]

        meta = data.get("ia::meta", {})
        total_count = int(meta.get("totalCount", 0) or 0)
        print(
            "[cash-management/funds-transfer] Direct endpoint retrieved "
            f"{len(rows)} rows (API totalCount: {total_count or 'unknown'})"
        )

    return rows


async def fetch_funds_transfer_details(access_token: str, object_name: str, key_rows: List[dict], entity_id: str) -> List[dict]:
    headers = build_entity_headers(access_token, entity_id)

    keys = [str(r.get("key")) for r in key_rows if r.get("key") is not None]
    if MAX_KEYS is not None and MAX_KEYS > 0:
        keys = keys[:MAX_KEYS]
    if not keys:
        return []

    print(f"[{object_name}] Fetching details via GET /objects/{object_name}/{{key}} for {len(keys)} keys (Entity: {entity_id})...")
    details: List[dict] = []
    semaphore = asyncio.Semaphore(5)

    async with httpx.AsyncClient(timeout=60) as client:
        async def fetch_one(one_key: str) -> Optional[dict]:
            url = f"{BASE_URL}/objects/{object_name}/{one_key}"
            async with semaphore:
                retries = 0
                while retries < 4:
                    response = await client.get(url, headers=headers)
                    if response.status_code == 429:
                        retries += 1
                        await asyncio.sleep(retries * 2)
                        continue
                    if response.status_code >= 400:
                        print(f"Skipping key {one_key}: HTTP {response.status_code}")
                        return None
                    data = response.json()
                    return data.get("ia::result", data)
                return None

        tasks = [fetch_one(k) for k in keys]
        for idx, row in enumerate(await asyncio.gather(*tasks), start=1):
            if row is not None:
                details.append(row)
            if idx % 50 == 0 or idx == len(keys):
                print(f"[{object_name}] Fetched detail {idx}/{len(keys)}")

    return details


async def process_funds_transfer_retrieval(token: str, object_name: str, entity_id: str) -> Dict[str, Any]:
    print(f"\n--- Starting retrieval for object: {object_name} (Entity: {entity_id}) ---")
    
    key_rows = await fetch_object_keys(token, object_name, entity_id)
    
    if key_rows:
        details = await fetch_funds_transfer_details(token, object_name, key_rows, entity_id)
    else:
        # Fallback directly to GET list
        direct_rows = await fetch_funds_transfer_direct(token, entity_id)
        if direct_rows and any(isinstance(r, dict) and r.get("key") for r in direct_rows):
            key_rows = [{"key": r.get("key")} for r in direct_rows if isinstance(r, dict) and r.get("key") is not None]
            details = await fetch_funds_transfer_details(token, object_name, key_rows, entity_id)
        else:
            details = direct_rows

    filtered_records = [row for row in details if isinstance(row, dict) and _is_target_entity(row, entity_id)]

    now_utc = datetime.now(timezone.utc)
    timestamp = now_utc.strftime("%Y%m%d_%H%M%S")
    clean_obj_name = object_name.replace("/", "_")
    output_path = f"sage_sandbox_{clean_obj_name}_{entity_id}_{timestamp}.json"

    payload = {
        "fetched_at_utc": now_utc.isoformat(),
        "object": object_name,
        "target_entity_id": entity_id,
        "max_keys": MAX_KEYS,
        "key_count": len(key_rows),
        "raw_detail_count": len(details),
        "count": len(filtered_records),
        "records": filtered_records,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=str)

    print(f"Success! Retrieved {len(filtered_records)} records for '{object_name}' (Entity: {entity_id}).")
    print(f"Saved to: {output_path}")
    return payload


async def main() -> None:
    global MAX_KEYS
    entity_id = TARGET_ENTITY_ID
    if len(sys.argv) > 1:
        entity_id = sys.argv[1]
    if len(sys.argv) > 2:
        arg_val = sys.argv[2].lower()
        if arg_val in ("0", "all", "none", "unlimited"):
            MAX_KEYS = None
        else:
            MAX_KEYS = int(sys.argv[2])

    print(f"Starting Sage Intacct Funds Transfer retrieval script via REST API...")
    print(f"Target Entity ID: {entity_id}")
    print(f"REST Endpoint Object: {SAGE_OBJECT}")
    print(f"Max Keys Cap: {MAX_KEYS if MAX_KEYS is not None else 'Unlimited (All Records)'}")

    token = await get_oauth_token()
    await process_funds_transfer_retrieval(token, SAGE_OBJECT, entity_id)


if __name__ == "__main__":
    asyncio.run(main())
