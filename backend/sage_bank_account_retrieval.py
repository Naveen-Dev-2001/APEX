"""
Sage Intacct - Bank Account / Financial Entity Retrieval

Purpose
-------
Given a selected BANK ACCOUNT / FINANCIAL ENTITY ID, retrieve records
across ALL Sage entities for:

    1. cash-management/deposit
    2. cash-management/funds-transfer
    3. cash-management/other-receipt
    4. accounts-receivable/payment

Important:
    The selected bank account is NOT used as the Sage entity/location header.

    Flow:
        selected bank account
              |
              v
        search at top level
        (all Sage entities)
              |
              v
        retrieve full records
              |
              v
        filter by bank account / financial entity
              |
              v
        save matching records

Configuration is read from environment variables:
    SAGE_BASE_URL
    SAGE_TOKEN_URL
    SAGE_CLIENT_ID
    SAGE_CLIENT_SECRET
    SAGE_USERNAME
    SAGE_VERIFY_SSL       (true/false, default=true)
    SAGE_PAGE_SIZE        (default=100)
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
# Configuration
# ---------------------------------------------------------------------------

# Selected bank account / financial entity.
# This is deliberately separate from Sage entity/location.
TARGET_BANK_ACCOUNT_ID: Optional[str] = None

# Optional maximum records PER OBJECT.
MAX_KEYS: Optional[int] = None


# ---------------------------------------------------------------------------
# Sage objects
# ---------------------------------------------------------------------------

OBJECT_ALIASES: Dict[str, str] = {
    "deposit": "cash-management/deposit",
    "funds-transfer": "cash-management/funds-transfer",
    "other-receipt": "cash-management/other-receipt",
    "ar-payment": "accounts-receivable/payment",
}

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

ALL_OBJECTS: List[str] = list(OBJECT_QUERY_FIELDS.keys())


# ---------------------------------------------------------------------------
# Bank account / financial entity matching
# ---------------------------------------------------------------------------

# We do NOT assume one exact field name because Sage records can expose
# financial entity / bank account information in different shapes.
#
# These are the direct field names we consider strong candidates.
BANK_ACCOUNT_FIELD_NAMES = {
    "financialentity",
    "financialentityid",
    "bankaccount",
    "bankaccountid",
    "bankaccountkey",
    "financialentitykey",
}

# Nested objects are handled recursively as well.
# For example:
#   {"financialEntity": {"id": "BANK001"}}
#   {"bankAccount": {"key": "BANK001"}}


def _normalize(value: Any) -> str:
    """Normalize IDs for case-insensitive exact comparison."""
    if value is None:
        return ""
    return str(value).strip().upper()


def _value_matches_target(value: Any, target: str) -> bool:
    """Exact match only; avoids accidental substring matches."""
    if value is None:
        return False

    if isinstance(value, (str, int, float)):
        return _normalize(value) == _normalize(target)

    if isinstance(value, dict):
        for key in ("id", "key", "name", "value"):
            if key in value and _normalize(value[key]) == _normalize(target):
                return True

    return False


def _record_has_bank_account(row: Any, target: Optional[str]) -> bool:
    """
    Return True when a transaction record is associated with the selected
    bank account / financial entity.

    Matching is intentionally exact.

    Supported examples:
        {"bankAccountId": "BA001"}
        {"financialEntityId": "BA001"}
        {"bankAccount": {"id": "BA001"}}
        {"financialEntity": {"key": "BA001"}}
        nested versions of the above
    """
    if not target or not isinstance(row, dict):
        return False

    target_norm = _normalize(target)

    def walk(value: Any, parent_key: Optional[str] = None) -> bool:
        if isinstance(value, dict):
            for key, child in value.items():
                key_norm = re.sub(r"[^a-z0-9]", "", str(key).lower())

                # Strong field-name match.
                if key_norm in BANK_ACCOUNT_FIELD_NAMES:
                    if _value_matches_target(child, target_norm):
                        return True

                # If the field itself is a financialEntity/bankAccount object,
                # inspect common identifier fields.
                if key_norm in {"financialentity", "bankaccount"}:
                    if isinstance(child, dict):
                        for id_key in ("id", "key", "name", "value"):
                            if id_key in child and _normalize(child[id_key]) == target_norm:
                                return True

                if walk(child, key_norm):
                    return True

        elif isinstance(value, list):
            for item in value:
                if walk(item, parent_key):
                    return True

        return False

    return walk(row)


# ---------------------------------------------------------------------------
# HTTP headers
# ---------------------------------------------------------------------------

def build_entity_headers(
    access_token: str,
    entity_id: Optional[str],
) -> Dict[str, str]:
    """
    Build Sage headers.

    For the bank-account retrieval workflow we intentionally call this with
    entity_id=None so that the request is made at TOP LEVEL and can search
    across Sage entities.
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    if entity_id and entity_id.lower() not in ("toplevel", "none", "top"):
        headers["locationid"] = str(entity_id)
        headers["X-IA-API-Param-Entity"] = str(entity_id)
        headers["Sage-Location-Entity"] = str(entity_id)

    return headers


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_configuration() -> None:
    missing = []

    if not BASE_URL:
        missing.append("SAGE_BASE_URL")
    if not TOKEN_URL:
        missing.append("SAGE_TOKEN_URL")
    if not CLIENT_ID:
        missing.append("SAGE_REST_CLIENT_ID")
    if not CLIENT_SECRET:
        missing.append("SAGE_REST_CLIENT_SECRET")
    if not USERNAME:
        missing.append("SAGE_REST_USERNAME")

    if missing:
        raise RuntimeError(
            "Missing required environment variables: " + ", ".join(missing)
        )


# ---------------------------------------------------------------------------
# OAuth2
# ---------------------------------------------------------------------------

async def get_oauth_token() -> str:
    """Obtain a Bearer token using the client-credentials grant."""

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    payload = {
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "username": USERNAME,
    }

    print(f"Requesting OAuth token from {TOKEN_URL}...")
    print(f"  client_id : {CLIENT_ID}")
    print(f"  username  : {USERNAME}")

    async with httpx.AsyncClient(
        timeout=30,
        verify=VERIFY_SSL,
    ) as client:

        response = await client.post(
            TOKEN_URL,
            json=payload,
            headers=headers,
        )

        try:
            token_data = response.json()
        except Exception:
            token_data = {}

        try:
            with open(
                "debug_oauth_token_response.json",
                "w",
                encoding="utf-8",
            ) as f:
                json.dump(token_data, f, indent=2)
        except Exception:
            pass

        if response.status_code < 400:
            access_token = token_data.get("access_token")

            if access_token:
                print("OAuth token acquired successfully.\n")
                return access_token

            raise RuntimeError(
                f"Token response missing access_token. Response: {token_data}"
            )

        err = token_data.get("error")
        err_desc = token_data.get("error_description")

        error_msg = (
            f"{err}: {err_desc}"
            if (err or err_desc)
            else response.text[:500]
        )

        raise RuntimeError(
            f"OAuth token request failed "
            f"(HTTP {response.status_code}). Error: {error_msg}"
        )


# ---------------------------------------------------------------------------
# Core paginated key query
# ---------------------------------------------------------------------------

async def fetch_object_keys(
    access_token: str,
    object_name: str,
    max_keys: Optional[int],
) -> List[dict]:
    """
    Retrieve keys/summary rows at TOP LEVEL.

    IMPORTANT:
        No Sage entity/location header is supplied here.

    Therefore the query is intended to search across all entities available
    to the authenticated Sage user.
    """

    headers = build_entity_headers(
        access_token,
        entity_id=None,  # <-- SEARCH ALL ENTITIES
    )

    fields = OBJECT_QUERY_FIELDS.get(
        object_name,
        ["key", "id"],
    )

    active_fields = list(fields)

    query_url = f"{BASE_URL}/services/core/query"

    all_rows: List[dict] = []
    start = 1

    async with httpx.AsyncClient(
        timeout=60,
        verify=VERIFY_SSL,
    ) as client:

        while True:

            current_page_size = PAGE_SIZE

            if max_keys is not None and max_keys > 0:
                remaining = max_keys - len(all_rows)

                if remaining <= 0:
                    break

                current_page_size = min(
                    PAGE_SIZE,
                    remaining,
                )

            query_payload = {
                "object": object_name,
                "fields": active_fields,
                "start": start,
                "size": current_page_size,
            }

            print(
                f"[{object_name}] Querying TOP LEVEL: "
                f"start={start}, size={current_page_size} "
                f"(ALL ENTITIES)"
            )

            retry_count = 0
            response = None

            while retry_count < 5:

                response = await client.post(
                    query_url,
                    json=query_payload,
                    headers=headers,
                )

                if response.status_code == 429:

                    retry_count += 1
                    wait_time = retry_count * 3

                    print(
                        f"HTTP 429 rate limit. "
                        f"Waiting {wait_time}s "
                        f"(retry {retry_count}/5)..."
                    )

                    await asyncio.sleep(wait_time)

                else:
                    break

            if response is None:
                return []

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
                            f"Field '{bad_field}' unsupported for "
                            f"'{object_name}'. Retrying without it."
                        )

                        continue

                print(
                    f"Core query failed "
                    f"(HTTP {response.status_code}). "
                    f"Will try direct GET list..."
                )

                return []

            data = response.json()

            rows = data.get(
                "ia::result",
                [],
            )

            if isinstance(rows, dict):
                rows = [rows]

            meta = data.get(
                "ia::meta",
                {},
            )

            count = int(
                meta.get("count", len(rows)) or len(rows)
            )

            total_count = int(
                meta.get("totalCount", 0) or 0
            )

            all_rows.extend(rows)

            print(
                f"[{object_name}] Retrieved {len(rows)} rows "
                f"(Total collected: {len(all_rows)} / "
                f"{total_count or 'unknown'})"
            )

            if (
                max_keys is not None
                and max_keys > 0
                and len(all_rows) >= max_keys
            ):
                all_rows = all_rows[:max_keys]

                print(
                    f"MAX_KEYS limit ({max_keys}) reached."
                )

                break

            if not rows or count < current_page_size:
                break

            if total_count and len(all_rows) >= total_count:
                break

            start += count

            await asyncio.sleep(0.1)

    return all_rows


# ---------------------------------------------------------------------------
# Direct GET fallback
# ---------------------------------------------------------------------------

async def fetch_object_list_direct(
    access_token: str,
    object_name: str,
    max_keys: Optional[int],
) -> List[dict]:
    """
    Fallback:
        GET /objects/{object_name}

    Also runs at TOP LEVEL so no entity is selected.
    """

    headers = build_entity_headers(
        access_token,
        entity_id=None,
    )

    url = f"{BASE_URL}/objects/{object_name}"

    async with httpx.AsyncClient(
        timeout=60,
        verify=VERIFY_SSL,
    ) as client:

        print(
            f"[{object_name}] Direct GET at TOP LEVEL "
            f"(ALL ENTITIES)..."
        )

        response = await client.get(
            url,
            headers=headers,
        )

        if response.status_code >= 400:

            print(
                f"Direct list HTTP "
                f"{response.status_code}: "
                f"{response.text[:500]}"
            )

            return []

        data = response.json()

        rows = data.get(
            "ia::result",
            [],
        )

        if isinstance(rows, dict):
            rows = [rows]

        if max_keys is not None and max_keys > 0:
            rows = rows[:max_keys]

        meta = data.get(
            "ia::meta",
            {},
        )

        total_count = int(
            meta.get("totalCount", 0) or 0
        )

        print(
            f"[{object_name}] Direct GET retrieved "
            f"{len(rows)} rows "
            f"(API totalCount: "
            f"{total_count or 'unknown'})"
        )

    return rows


# ---------------------------------------------------------------------------
# Per-key detail fetch
# ---------------------------------------------------------------------------

async def fetch_object_details(
    access_token: str,
    object_name: str,
    key_rows: List[dict],
    max_keys: Optional[int],
) -> List[dict]:
    """
    Fetch complete details for each key.

    IMPORTANT:
        Details are also requested at TOP LEVEL.

    Up to 5 requests are made concurrently.
    """

    headers = build_entity_headers(
        access_token,
        entity_id=None,  # <-- ALL ENTITIES
    )

    keys = [
        str(row.get("key"))
        for row in key_rows
        if row.get("key") is not None
    ]

    if max_keys is not None and max_keys > 0:
        keys = keys[:max_keys]

    if not keys:
        return []

    print(
        f"[{object_name}] Fetching full details for "
        f"{len(keys)} keys across ALL ENTITIES..."
    )

    details: List[dict] = []

    semaphore = asyncio.Semaphore(5)

    async with httpx.AsyncClient(
        timeout=60,
        verify=VERIFY_SSL,
    ) as client:

        async def fetch_one(
            one_key: str,
        ) -> Optional[dict]:

            url = (
                f"{BASE_URL}/objects/"
                f"{object_name}/{one_key}"
            )

            async with semaphore:

                retries = 0

                while retries < 4:

                    resp = await client.get(
                        url,
                        headers=headers,
                    )

                    if resp.status_code == 429:

                        retries += 1

                        wait_time = retries * 2

                        print(
                            f"[{object_name}] "
                            f"429 for key {one_key}. "
                            f"Waiting {wait_time}s..."
                        )

                        await asyncio.sleep(
                            wait_time
                        )

                        continue

                    if resp.status_code >= 400:

                        print(
                            f"[{object_name}] "
                            f"Skipping key {one_key}: "
                            f"HTTP {resp.status_code}"
                        )

                        return None

                    data = resp.json()

                    return data.get(
                        "ia::result",
                        data,
                    )

                return None

        tasks = [
            fetch_one(key)
            for key in keys
        ]

        batch_size = 50
        rows = []
        for i in range(0, len(tasks), batch_size):
            batch = tasks[i:i + batch_size]
            batch_rows = await asyncio.gather(*batch)
            rows.extend(batch_rows)

        for idx, row in enumerate(
            rows,
            start=1,
        ):

            if row is not None:
                details.append(row)

            if (
                idx % 50 == 0
                or idx == len(keys)
            ):

                print(
                    f"[{object_name}] "
                    f"Fetched detail "
                    f"{idx}/{len(keys)}"
                )

    return details


# ---------------------------------------------------------------------------
# Retrieve one object across ALL entities, then filter by bank account
# ---------------------------------------------------------------------------

async def retrieve_object_for_bank_account(
    token: str,
    object_name: str,
    bank_account_id: str,
    max_keys: Optional[int],
) -> Dict[str, Any]:

    print("\n" + "=" * 70)
    print(
        f"  Object        : {object_name}"
    )
    print(
        f"  Bank Account  : {bank_account_id}"
    )
    print(
        "  Entity Scope  : ALL ENTITIES"
    )
    print("=" * 70)

    # ---------------------------------------------------------------
    # 1. SEARCH ALL ENTITIES
    # ---------------------------------------------------------------

    key_rows = await fetch_object_keys(
        token,
        object_name,
        max_keys,
    )

    # ---------------------------------------------------------------
    # 2. FALLBACK IF CORE QUERY DID NOT WORK
    # ---------------------------------------------------------------

    if key_rows:

        details = await fetch_object_details(
            token,
            object_name,
            key_rows,
            max_keys,
        )

    else:

        direct_rows = await fetch_object_list_direct(
            token,
            object_name,
            max_keys,
        )

        if direct_rows and any(
            isinstance(row, dict)
            and row.get("key")
            for row in direct_rows
        ):

            key_rows = [
                {
                    "key": row.get("key")
                }
                for row in direct_rows
                if (
                    isinstance(row, dict)
                    and row.get("key") is not None
                )
            ]

            details = await fetch_object_details(
                token,
                object_name,
                key_rows,
                max_keys,
            )

        else:

            details = direct_rows

    # ---------------------------------------------------------------
    # 3. FILTER BY SELECTED BANK ACCOUNT / FINANCIAL ENTITY
    # ---------------------------------------------------------------

    matching_records = [
        row
        for row in details
        if isinstance(row, dict)
        and _record_has_bank_account(
            row,
            bank_account_id,
        )
    ]

    print(
        f"[{object_name}] "
        f"All-entity records : {len(details)}"
    )

    print(
        f"[{object_name}] "
        f"Matching bank account "
        f"{bank_account_id} : "
        f"{len(matching_records)}"
    )

    # ---------------------------------------------------------------
    # 4. BUILD RESULT
    # ---------------------------------------------------------------

    now_utc = datetime.now(
        timezone.utc
    )

    timestamp = now_utc.strftime(
        "%Y%m%d_%H%M%S"
    )

    clean_name = (
        object_name.replace(
            "/",
            "_",
        )
    )

    output_path = (
        f"sage_bank_account_"
        f"{clean_name}_"
        f"{bank_account_id}_"
        f"{timestamp}.json"
    )

    payload = {
        "fetched_at_utc": now_utc.isoformat(),
        "object": object_name,
        "search_scope": "ALL_ENTITIES",
        "bank_account_id": bank_account_id,
        "max_keys": max_keys,
        "key_count": len(key_rows),
        "raw_detail_count": len(details),
        "matching_count": len(matching_records),
        "records": matching_records,
    }

    with open(
        output_path,
        "w",
        encoding="utf-8",
    ) as f:

        json.dump(
            payload,
            f,
            indent=2,
            default=str,
        )

    print(
        f"[{object_name}] "
        f"Saved -> {output_path}"
    )

    return payload


# ---------------------------------------------------------------------------
# Run all four objects
# ---------------------------------------------------------------------------

async def retrieve_all_for_bank_account(
    token: str,
    bank_account_id: str,
    max_keys: Optional[int],
) -> Dict[str, Dict[str, Any]]:

    results: Dict[str, Dict[str, Any]] = {}

    for object_name in ALL_OBJECTS:

        try:

            results[object_name] = (
                await retrieve_object_for_bank_account(
                    token,
                    object_name,
                    bank_account_id,
                    max_keys,
                )
            )

        except Exception as exc:

            print(
                f"\n[ERROR] Failed to retrieve "
                f"'{object_name}': {exc}"
            )

            results[object_name] = {
                "error": str(exc)
            }

    return results


# ---------------------------------------------------------------------------
# Resolve object aliases
# ---------------------------------------------------------------------------

def _resolve_objects(
    raw: Optional[str],
) -> List[str]:

    if not raw or raw.lower() in (
        "all",
        "",
    ):

        return ALL_OBJECTS

    result: List[str] = []

    for token in raw.split(","):

        token = token.strip()

        if token in OBJECT_ALIASES:

            result.append(
                OBJECT_ALIASES[token]
            )

        elif token in ALL_OBJECTS:

            result.append(token)

        else:

            print(
                f"[WARN] Unknown object alias "
                f"'{token}'. "
                f"Valid aliases: "
                f"{', '.join(OBJECT_ALIASES.keys())}"
            )

    return result or ALL_OBJECTS


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:

    global MAX_KEYS
    global TARGET_BANK_ACCOUNT_ID

    parser = argparse.ArgumentParser(
        description=(
            "Retrieve Sage Intacct Deposit, "
            "Funds Transfer, Other Receipt, "
            "and AR Payment records across ALL "
            "entities for one selected bank account "
            "or financial entity."
        )
    )

    parser.add_argument(
        "--bank-account",
        "-b",
        required=True,
        help=(
            "Selected bank account / financial entity ID. "
            "Example: BANK001"
        ),
    )

    parser.add_argument(
        "--objects",
        "-o",
        default="all",
        help=(
            "Comma-separated objects to retrieve. "
            "Aliases: deposit, funds-transfer, "
            "other-receipt, ar-payment. "
            "Default: all."
        ),
    )

    parser.add_argument(
        "--max-keys",
        "-k",
        default=None,
        help=(
            "Maximum records PER OBJECT. "
            "Use 0/all/none/unlimited for unlimited."
        ),
    )

    args = parser.parse_args()

    # ---------------------------------------------------------------
    # Bank account
    # ---------------------------------------------------------------

    TARGET_BANK_ACCOUNT_ID = (
        args.bank_account.strip()
    )

    if not TARGET_BANK_ACCOUNT_ID:

        raise ValueError(
            "Bank account / financial entity ID "
            "cannot be empty."
        )

    # ---------------------------------------------------------------
    # Max records
    # ---------------------------------------------------------------

    if args.max_keys is not None:

        val = args.max_keys.strip().lower()

        if val in (
            "0",
            "all",
            "none",
            "unlimited",
        ):

            MAX_KEYS = None

        else:

            MAX_KEYS = int(val)

            if MAX_KEYS <= 0:
                MAX_KEYS = None

    # ---------------------------------------------------------------
    # Objects
    # ---------------------------------------------------------------

    objects_to_run = _resolve_objects(
        args.objects
    )

    print("\n" + "=" * 70)
    print(
        "  Sage Intacct -- Bank Account Retrieval"
    )
    print("=" * 70)

    print(
        f"  Bank Account       : "
        f"{TARGET_BANK_ACCOUNT_ID}"
    )

    print(
        "  Entity Scope       : ALL ENTITIES"
    )

    print(
        f"  Objects            : "
        f"{', '.join(objects_to_run)}"
    )

    print(
        f"  Max keys per obj   : "
        f"{MAX_KEYS if MAX_KEYS is not None else 'Unlimited'}"
    )

    print("=" * 70)

    validate_configuration()

    # ---------------------------------------------------------------
    # OAuth
    # ---------------------------------------------------------------

    token = await get_oauth_token()

    # ---------------------------------------------------------------
    # Retrieve selected objects
    # ---------------------------------------------------------------

    results: Dict[
        str,
        Dict[str, Any]
    ] = {}

    for object_name in objects_to_run:

        try:

            results[object_name] = (
                await retrieve_object_for_bank_account(
                    token,
                    object_name,
                    TARGET_BANK_ACCOUNT_ID,
                    MAX_KEYS,
                )
            )

        except Exception as exc:

            print(
                f"\n[ERROR] Failed to retrieve "
                f"'{object_name}': {exc}"
            )

            results[object_name] = {
                "error": str(exc)
            }

    # ---------------------------------------------------------------
    # Combined result
    # ---------------------------------------------------------------

    combined_records: List[dict] = []

    for object_name, result in results.items():

        if "error" in result:
            continue

        for record in result.get(
            "records",
            [],
        ):

            combined_records.append(
                {
                    "object": object_name,
                    "record": record,
                }
            )

    now_utc = datetime.now(
        timezone.utc
    )

    timestamp = now_utc.strftime(
        "%Y%m%d_%H%M%S"
    )

    combined_output = (
        f"sage_bank_account_"
        f"{TARGET_BANK_ACCOUNT_ID}_"
        f"ALL_OBJECTS_"
        f"{timestamp}.json"
    )

    combined_payload = {
        "fetched_at_utc": now_utc.isoformat(),
        "search_scope": "ALL_ENTITIES",
        "bank_account_id": TARGET_BANK_ACCOUNT_ID,
        "objects": objects_to_run,
        "total_matching_records": len(
            combined_records
        ),
        "records": combined_records,
    }

    with open(
        combined_output,
        "w",
        encoding="utf-8",
    ) as f:

        json.dump(
            combined_payload,
            f,
            indent=2,
            default=str,
        )

    # ---------------------------------------------------------------
    # Summary
    # ---------------------------------------------------------------

    print("\n" + "=" * 70)
    print("  FINAL SUMMARY")
    print("=" * 70)

    for object_name, result in results.items():

        if "error" in result:

            print(
                f"  FAIL  "
                f"{object_name:<42} "
                f"{result['error']}"
            )

        else:

            print(
                f"  OK    "
                f"{object_name:<42} "
                f"{result.get('matching_count', 0):>6} "
                f"matching records"
            )

    print("-" * 70)

    print(
        f"  TOTAL MATCHING RECORDS: "
        f"{len(combined_records)}"
    )

    print(
        f"  Combined output: "
        f"{combined_output}"
    )

    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
