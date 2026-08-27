"""
Retrieve Sage Intacct records via OAuth2 + REST API.

Supports the following Cash Management / AR objects:
  1. cash-management/deposit          (Deposits)
  2. cash-management/funds-transfer   (Funds Transfer)
  3. cash-management/other-receipt    (Other Receipts)
  4. accounts-receivable/payment      (AR Payments)

Usage:
  # Run all four objects
  python backend/sage_retrieve_all_rest.py

  # Run a single object (by alias)
  python backend/sage_retrieve_all_rest.py --objects deposit
  python backend/sage_retrieve_all_rest.py --objects funds-transfer
  python backend/sage_retrieve_all_rest.py --objects other-receipt
  python backend/sage_retrieve_all_rest.py --objects ar-payment

  # Run multiple specific objects
  python backend/sage_retrieve_all_rest.py --objects deposit,ar-payment

  # Override entity and max-keys
  python backend/sage_retrieve_all_rest.py --entity 302 --max-keys 500

Environment Variables (override defaults):
  SAGE_TOKEN_URL          = "https://api.intacct.com/ia/api/v1/oauth2/token"
  SAGE_BASE_URL           = "https://api.intacct.com/ia/api/v1"
  SAGE_REST_CLIENT_ID     = "586b7a1825a18fd5e966.app.sage.com"
  SAGE_REST_CLIENT_SECRET = "a0fb87e95f7a9be71bf11154dd87b09a19d393b0"
  SAGE_REST_USERNAME      = "Apex AP Workflow@consolidatedanalytics-sandbox"
  SAGE_ENTITY_ID          = "302"
  PAGE_SIZE               = "1000"
  MAX_KEYS                = ""          (empty = unlimited)
  SAGE_VERIFY_SSL         = "false"
"""

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx


# ---------------------------------------------------------------------------
# Environment / Configuration
# ---------------------------------------------------------------------------

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
BASE_URL  = os.environ.get("SAGE_BASE_URL")  or "https://api.intacct.com/ia/api/v1"

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

TARGET_ENTITY_ID: Optional[str] = os.environ.get("SAGE_ENTITY_ID", "302") or None
PAGE_SIZE  = int(os.environ.get("PAGE_SIZE", "1000"))
VERIFY_SSL = os.environ.get("SAGE_VERIFY_SSL", "false").lower() == "true"

_MAX_KEYS_ENV = os.environ.get("MAX_KEYS")
if (
    _MAX_KEYS_ENV is None
    or _MAX_KEYS_ENV == ""
    or str(_MAX_KEYS_ENV).lower() in ("0", "all", "none", "unlimited")
):
    MAX_KEYS: Optional[int] = None  # unlimited by default
else:
    MAX_KEYS = int(_MAX_KEYS_ENV)


# ---------------------------------------------------------------------------
# Sage object definitions
# ---------------------------------------------------------------------------

# Human-readable short aliases  ->  canonical Sage object path
OBJECT_ALIASES: Dict[str, str] = {
    "deposit":        "cash-management/deposit",
    "funds-transfer": "cash-management/funds-transfer",
    "other-receipt":  "cash-management/other-receipt",
    "ar-payment":     "accounts-receivable/payment",
}

# Fields to include in the initial key-query for each object
OBJECT_QUERY_FIELDS: Dict[str, List[str]] = {
    "cash-management/deposit": [
        "key",
        "id",
        "depositId",
        "description",
        "totalEntered",
    ],
    "cash-management/funds-transfer": [
        "key",
        "id",
        "referenceNumber",
        "description",
    ],
    "cash-management/other-receipt": [
        "key",
        "id",
        "description",
    ],
    "accounts-receivable/payment": [
        "key",
        "id",
        "referenceNumber",
        "description",
        "paymentDate",
        "totalEntered",
        "currency",
        "customer.id",
        "customer.name",
        "state",
    ],
}

# All canonical object paths (in desired run order)
ALL_OBJECTS: List[str] = list(OBJECT_QUERY_FIELDS.keys())


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def build_entity_headers(access_token: str, entity_id: Optional[str]) -> Dict[str, str]:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if entity_id and entity_id.lower() not in ("toplevel", "none", "top"):
        headers["locationid"]            = str(entity_id)
        headers["X-IA-API-Param-Entity"] = str(entity_id)
        headers["Sage-Location-Entity"]  = str(entity_id)
    return headers


def _extract_entity_id(row: dict) -> Optional[str]:
    entity = row.get("entity")
    if isinstance(entity, dict):
        for key in ("id", "key", "name"):
            if entity.get(key):
                return str(entity[key])
    elif entity is not None:
        return str(entity)

    for key in ("financialEntity", "financialEntityId", "locationId", "bankAccountId", "entityId"):
        if row.get(key) is not None:
            return str(row[key])
    return None


def _is_target_entity(row: dict, target: Optional[str]) -> bool:
    """Return True if the record belongs to *target* entity (or no filter is set)."""
    if not target or target.lower() in ("toplevel", "none", "top"):
        return True  # no entity filter -> include everything
    entity_value = _extract_entity_id(row)
    if not entity_value:
        return True  # no entity tag found -> include (avoid accidental drops)
    return (
        entity_value.upper() == target.upper()
        or target.upper() in entity_value.upper()
        or target.upper() in entity_value
    )


# ---------------------------------------------------------------------------
# OAuth2
# ---------------------------------------------------------------------------

async def get_oauth_token() -> str:
    """Obtain a Bearer token using the client-credentials grant."""
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    payload = {
        "grant_type":    "client_credentials",
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "username":      USERNAME,
    }

    print(f"Requesting OAuth token from {TOKEN_URL}...")
    print(f"  client_id : {CLIENT_ID}")
    print(f"  username  : {USERNAME}")

    async with httpx.AsyncClient(timeout=30, verify=VERIFY_SSL) as client:
        response = await client.post(TOKEN_URL, json=payload, headers=headers)

        try:
            token_data = response.json()
        except Exception:
            token_data = {}

        # Persist the raw token response for debugging
        try:
            with open("debug_oauth_token_response.json", "w", encoding="utf-8") as f:
                json.dump(token_data, f, indent=2)
        except Exception:
            pass

        if response.status_code < 400:
            access_token = token_data.get("access_token")
            if access_token:
                print("OAuth token acquired successfully.\n")
                return access_token
            raise RuntimeError(f"Token response missing access_token. Response: {token_data}")

        err      = token_data.get("error")
        err_desc = token_data.get("error_description")
        error_msg = f"{err}: {err_desc}" if (err or err_desc) else response.text[:500]
        raise RuntimeError(
            f"OAuth token request failed (HTTP {response.status_code}). Error: {error_msg}"
        )


# ---------------------------------------------------------------------------
# Core paginated key query
# ---------------------------------------------------------------------------

async def fetch_object_keys(
    access_token: str,
    object_name: str,
    entity_id: Optional[str],
    max_keys: Optional[int],
) -> List[dict]:
    """
    Use POST /services/core/query to retrieve key + summary rows for *object_name*.
    Returns an empty list if the query service is unavailable (caller should fall back).
    Auto-removes unsupported fields (HTTP 400 with FIELD error) and retries.
    """
    headers = build_entity_headers(access_token, entity_id)
    fields = OBJECT_QUERY_FIELDS.get(object_name, ["key", "id"])
    active_fields = list(fields)
    query_url = f"{BASE_URL}/services/core/query"
    all_rows: List[dict] = []
    start = 1

    async with httpx.AsyncClient(timeout=60, verify=VERIFY_SSL) as client:
        while True:
            current_page_size = PAGE_SIZE
            if max_keys is not None and max_keys > 0:
                remaining = max_keys - len(all_rows)
                if remaining <= 0:
                    break
                current_page_size = min(PAGE_SIZE, remaining)

            query_payload = {
                "object": object_name,
                "fields": active_fields,
                "start":  start,
                "size":   current_page_size,
            }

            scope_desc = f"Entity: {entity_id}" if entity_id else "Top Level"
            print(
                f"[{object_name}] Querying page: start={start}, "
                f"size={current_page_size} ({scope_desc})"
            )

            # Retry loop for rate-limiting
            retry_count = 0
            response = None
            while retry_count < 5:
                response = await client.post(query_url, json=query_payload, headers=headers)
                if response.status_code == 429:
                    retry_count += 1
                    wait_time = retry_count * 3
                    print(
                        f"HTTP 429 Rate limit hit. "
                        f"Backing off for {wait_time}s (retry {retry_count}/5)..."
                    )
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
                            f"Field '{bad_field}' unsupported for '{object_name}'. "
                            "Retrying without it."
                        )
                        continue

                print(
                    f"Core query failed (HTTP {response.status_code}). "
                    "Will try direct GET list..."
                )
                return []

            data  = response.json()
            rows  = data.get("ia::result", [])
            if isinstance(rows, dict):
                rows = [rows]

            meta        = data.get("ia::meta", {})
            count       = int(meta.get("count",      len(rows)) or len(rows))
            total_count = int(meta.get("totalCount", 0)         or 0)

            all_rows.extend(rows)
            print(
                f"[{object_name}] Retrieved {len(rows)} rows "
                f"(Total collected: {len(all_rows)} / {total_count or 'unknown'})"
            )

            if max_keys is not None and max_keys > 0 and len(all_rows) >= max_keys:
                all_rows = all_rows[:max_keys]
                print(f"MAX_KEYS limit ({max_keys}) reached. Stopping key query.")
                break

            if not rows or count < current_page_size:
                break
            if total_count and len(all_rows) >= total_count:
                break

            start += count
            await asyncio.sleep(0.1)

    return all_rows


# ---------------------------------------------------------------------------
# Direct GET list (fallback)
# ---------------------------------------------------------------------------

async def fetch_object_list_direct(
    access_token: str,
    object_name: str,
    entity_id: Optional[str],
    max_keys: Optional[int],
) -> List[dict]:
    """
    Fallback: GET /objects/{object_name}  (summary list, not full details).
    Used when the core query service returns no results.
    """
    headers = build_entity_headers(access_token, entity_id)
    url = f"{BASE_URL}/objects/{object_name}"

    async with httpx.AsyncClient(timeout=60, verify=VERIFY_SSL) as client:
        scope_desc = f"Entity: {entity_id}" if entity_id else "Top Level"
        print(f"[{object_name}] Listing records via direct GET ({scope_desc})...")
        response = await client.get(url, headers=headers)

        if response.status_code >= 400:
            print(f"Direct list HTTP {response.status_code}: {response.text[:500]}")
            return []

        data = response.json()
        rows = data.get("ia::result", [])
        if isinstance(rows, dict):
            rows = [rows]

        if max_keys is not None and max_keys > 0:
            rows = rows[:max_keys]

        meta        = data.get("ia::meta", {})
        total_count = int(meta.get("totalCount", 0) or 0)
        print(
            f"[{object_name}] Direct GET retrieved {len(rows)} rows "
            f"(API totalCount: {total_count or 'unknown'})"
        )

    return rows


# ---------------------------------------------------------------------------
# Per-key detail fetch
# ---------------------------------------------------------------------------

async def fetch_object_details(
    access_token: str,
    object_name: str,
    key_rows: List[dict],
    entity_id: Optional[str],
    max_keys: Optional[int],
) -> List[dict]:
    """
    Fetch full detail records via GET /objects/{object_name}/{key} for every
    key in *key_rows*. Runs up to 5 concurrent requests with automatic
    back-off on HTTP 429.
    """
    headers = build_entity_headers(access_token, entity_id)

    keys = [str(r.get("key")) for r in key_rows if r.get("key") is not None]
    if max_keys is not None and max_keys > 0:
        keys = keys[:max_keys]
    if not keys:
        return []

    scope_desc = f"Entity: {entity_id}" if entity_id else "Top Level"
    print(
        f"[{object_name}] Fetching details via GET /objects/{object_name}/{{key}} "
        f"for {len(keys)} keys ({scope_desc})..."
    )
    details: List[dict] = []
    semaphore = asyncio.Semaphore(5)

    async with httpx.AsyncClient(timeout=60, verify=VERIFY_SSL) as client:

        async def fetch_one(one_key: str) -> Optional[dict]:
            url = f"{BASE_URL}/objects/{object_name}/{one_key}"
            async with semaphore:
                retries = 0
                while retries < 4:
                    resp = await client.get(url, headers=headers)
                    if resp.status_code == 429:
                        retries += 1
                        await asyncio.sleep(retries * 2)
                        continue
                    if resp.status_code >= 400:
                        print(f"Skipping key {one_key}: HTTP {resp.status_code}")
                        return None
                    data = resp.json()
                    return data.get("ia::result", data)
                return None

        tasks = [fetch_one(k) for k in keys]
        batch_size = 50
        rows = []
        for i in range(0, len(tasks), batch_size):
            batch = tasks[i:i + batch_size]
            rows.extend(await asyncio.gather(*batch))
            
        for idx, row in enumerate(rows, start=1):
            if row is not None:
                details.append(row)
            if idx % 50 == 0 or idx == len(keys):
                print(f"[{object_name}] Fetched detail {idx}/{len(keys)}")

    return details


# ---------------------------------------------------------------------------
# Single-object orchestration
# ---------------------------------------------------------------------------

async def retrieve_object(
    token: str,
    object_name: str,
    entity_id: Optional[str],
    max_keys: Optional[int],
) -> Dict[str, Any]:
    """
    Full retrieval pipeline for one Sage object:
      1. Query keys via core/query  (paginated, with retry)
      2. If no keys -> fallback to direct GET list
      3. Fetch full detail records for every key
      4. Filter by entity
      5. Save to a timestamped JSON file
    Returns the result payload dict.
    """
    scope_desc = f"Entity: {entity_id}" if entity_id else "Top Level"
    print(f"\n{'='*60}")
    print(f"  Starting retrieval: {object_name}  ({scope_desc})")
    print(f"{'='*60}")

    key_rows = await fetch_object_keys(token, object_name, entity_id, max_keys)

    if key_rows:
        details = await fetch_object_details(token, object_name, key_rows, entity_id, max_keys)
    else:
        # Fallback: direct GET list
        direct_rows = await fetch_object_list_direct(token, object_name, entity_id, max_keys)
        if direct_rows and any(isinstance(r, dict) and r.get("key") for r in direct_rows):
            key_rows = [
                {"key": r.get("key")}
                for r in direct_rows
                if isinstance(r, dict) and r.get("key") is not None
            ]
            details = await fetch_object_details(
                token, object_name, key_rows, entity_id, max_keys
            )
        else:
            details = direct_rows

    # Entity filter
    filtered_records = [
        row for row in details
        if isinstance(row, dict) and _is_target_entity(row, entity_id)
    ]

    # Build output
    now_utc    = datetime.now(timezone.utc)
    timestamp  = now_utc.strftime("%Y%m%d_%H%M%S")
    clean_name = object_name.replace("/", "_")
    suffix = (
        str(entity_id)
        if entity_id and entity_id.lower() not in ("toplevel", "none", "top")
        else "toplevel"
    )
    output_path = f"sage_sandbox_{clean_name}_{suffix}_{timestamp}.json"

    payload = {
        "fetched_at_utc":   now_utc.isoformat(),
        "object":           object_name,
        "entity_scope":     suffix,
        "max_keys":         max_keys,
        "key_count":        len(key_rows),
        "raw_detail_count": len(details),
        "count":            len(filtered_records),
        "records":          filtered_records,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=str)

    print(f"\nSuccess! {len(filtered_records)} records saved -> {output_path}")
    return payload


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _resolve_objects(raw: Optional[str]) -> List[str]:
    """Parse --objects argument (comma-separated aliases or full paths)."""
    if not raw or raw.lower() in ("all", ""):
        return ALL_OBJECTS

    result: List[str] = []
    for token in raw.split(","):
        token = token.strip()
        if token in OBJECT_ALIASES:
            result.append(OBJECT_ALIASES[token])
        elif token in ALL_OBJECTS:
            result.append(token)
        else:
            print(
                f"[WARN] Unknown object alias '{token}'. "
                f"Valid aliases: {', '.join(OBJECT_ALIASES.keys())}"
            )
    return result or ALL_OBJECTS


async def main() -> None:
    global MAX_KEYS, TARGET_ENTITY_ID

    parser = argparse.ArgumentParser(
        description=(
            "Retrieve Sage Intacct records: "
            "deposits / funds-transfer / other-receipt / ar-payment."
        )
    )
    parser.add_argument(
        "--objects", "-o",
        default="all",
        help=(
            "Comma-separated objects to retrieve. "
            "Aliases: deposit, funds-transfer, other-receipt, ar-payment  "
            "(default: all)"
        ),
    )
    parser.add_argument(
        "--entity", "-e",
        default=None,
        help="Entity/location ID to scope requests (overrides SAGE_ENTITY_ID env var).",
    )
    parser.add_argument(
        "--max-keys", "-k",
        default=None,
        help="Maximum records per object (0 / all / none = unlimited).",
    )
    args = parser.parse_args()

    # --entity override
    if args.entity is not None:
        val = args.entity.strip()
        TARGET_ENTITY_ID = None if val.lower() in ("toplevel", "none", "top") else val

    # --max-keys override
    if args.max_keys is not None:
        val = args.max_keys.strip().lower()
        MAX_KEYS = None if val in ("0", "all", "none", "unlimited") else int(val)

    objects_to_run = _resolve_objects(args.objects)

    print("=" * 60)
    print("  Sage Intacct -- Unified REST Retrieval Script")
    print("=" * 60)
    print(f"  Objects     : {', '.join(objects_to_run)}")
    print(f"  Entity scope: {TARGET_ENTITY_ID if TARGET_ENTITY_ID else 'Top Level'}")
    print(f"  Max keys cap: {MAX_KEYS if MAX_KEYS is not None else 'Unlimited (All Records)'}")
    print("=" * 60)

    token = await get_oauth_token()

    results: Dict[str, Dict[str, Any]] = {}
    for obj in objects_to_run:
        try:
            results[obj] = await retrieve_object(token, obj, TARGET_ENTITY_ID, MAX_KEYS)
        except Exception as exc:
            print(f"\n[ERROR] Failed to retrieve '{obj}': {exc}")
            results[obj] = {"error": str(exc)}

    # Summary table
    print("\n" + "=" * 60)
    print("  Summary")
    print("=" * 60)
    for obj, res in results.items():
        if "error" in res:
            print(f"  FAIL  {obj:<42} ERROR: {res['error']}")
        else:
            print(f"  OK    {obj:<42} {res.get('count', 0):>6} records")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
