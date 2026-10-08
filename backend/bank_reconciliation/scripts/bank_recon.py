import httpx
import xmltodict
import asyncio
import json
import os
import sys
from typing import Optional



from dotenv import load_dotenv

# Load .env file from the backend directory (two levels up)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

SAGE_URL = os.getenv("SAGE_URL", "https://api.intacct.com/ia/xml/xmlgw.phtml")

# ── Credentials ───────────────────────────────────────────────────────────────
SENDER_ID = os.getenv("SENDER_ID")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD")
USER_ID = os.getenv("USER_ID")
COMPANY_ID = os.getenv("COMPANY_ID")
USER_PASSWORD = os.getenv("USER_PASSWORD")


# ── Auth ──────────────────────────────────────────────────────────────────────

async def get_session_id(max_retries: int = 3, timeout: float = 60.0) -> str:
    payload = f"""<?xml version="1.0" encoding="UTF-8"?>
<request>
  <control>
    <senderid>{SENDER_ID}</senderid>
    <password>{SENDER_PASSWORD}</password>
    <controlid>get-session</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <login>
        <userid>{USER_ID}</userid>
        <companyid>{COMPANY_ID}</companyid>
        <password>{USER_PASSWORD}</password>
      </login>
    </authentication>
    <content>
      <function controlid="session">
        <getAPISession/>
      </function>
    </content>
  </operation>
</request>"""

    print("  → Getting session token...")
    client_timeout = httpx.Timeout(timeout, connect=20.0)
    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=client_timeout) as client:
                response = await client.post(
                    SAGE_URL, content=payload,
                    headers={"Content-Type": "application/xml"}
                )
            break
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            if attempt == max_retries:
                print(f"  ✗ Auth request failed after {max_retries} attempts: {exc}")
                raise
            wait_time = attempt * 2
            print(f"  ! Timeout/network error on session attempt {attempt}/{max_retries}: {exc}. Retrying in {wait_time}s...")
            await asyncio.sleep(wait_time)

    data   = xmltodict.parse(response.text)
    op     = data["response"]["operation"]

    if op["authentication"]["status"] != "success":
        raise Exception(f"Auth failed: {op['authentication']}")

    result = op["result"]
    if result["status"] != "success":
        raise Exception(f"Session error: {result['errormessage']['error']['description2']}")

    session_id = result["data"]["api"]["sessionid"]
    print(f"  ✓ Session obtained: {session_id[:20]}...")
    return session_id



async def fetch_all_gldetail(
    session_id: str,
    financial_entity: str = "FFB_4449",
    account_no: str = "",
    after_date: str = "10/02/2025",
    page_size: int = 1000,
    timeout: float = 180.0,
    max_retries: int = 3,
) -> list[dict]:

    all_records = []
    page_num = 1
    result_id = None
    total_count = None

    query_str = (
        f"FINANCIALENTITY = '{financial_entity}' "
        f"AND ACCOUNTNO = '{account_no}' "
        f"AND CLEARED = 'F' "
        f"AND BATCH_DATE > '{after_date}'"
    )

    # UPDATED FIELDS
    fields_str = (
        "RECORDNO,"
        "DOCNUMBER,"
        "TR_TYPE,"
        "ENTRY_DATE,"
        "BATCH_DATE,"
        "TRX_AMOUNT,"
        "TRX_DEBITAMOUNT,"
        "TRX_CREDITAMOUNT,"
        "ACCOUNTNO,"
        "FINANCIALENTITY,"
        "CLEARED,"
        "PRDESCRIPTION,"
        "VENDORNAME,"
        "CUSTOMERNAME,"
        "RECORDTYPE"
    )

    client_timeout = httpx.Timeout(timeout, connect=30.0)
    async with httpx.AsyncClient(timeout=client_timeout) as client:

        while True:

            print(f"\n→ Fetching page {page_num}")

            if result_id is None:

                function_xml = f"""
<function controlid="page-{page_num}">
<readByQuery>
<object>GLDETAIL</object>
<fields>{fields_str}</fields>
<query>{query_str}</query>
<pagesize>{page_size}</pagesize>
<returnFormat>xml</returnFormat>
</readByQuery>
</function>
"""

            else:

                function_xml = f"""
<function controlid="page-{page_num}">
<readMore>
<resultId>{result_id}</resultId>
</readMore>
</function>
"""

            payload = f"""<?xml version="1.0"?>
<request>

<control>
<senderid>{SENDER_ID}</senderid>
<password>{SENDER_PASSWORD}</password>
<controlid>batch-{page_num}</controlid>
<uniqueid>false</uniqueid>
<dtdversion>3.0</dtdversion>
</control>

<operation>

<authentication>
<sessionid>{session_id}</sessionid>
</authentication>

<content>
{function_xml}
</content>

</operation>

</request>
"""

            for attempt in range(1, max_retries + 1):
                try:
                    response = await client.post(
                        SAGE_URL,
                        content=payload,
                        headers={
                            "Content-Type": "application/xml"
                        }
                    )
                    break
                except (httpx.TimeoutException, httpx.NetworkError) as exc:
                    if attempt == max_retries:
                        print(f"  ✗ Fetch request failed after {max_retries} attempts on page {page_num}: {exc}")
                        raise
                    wait_time = attempt * 2
                    print(f"  ! Timeout/network error on attempt {attempt}/{max_retries} (page {page_num}): {exc}. Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)

            data = xmltodict.parse(
                response.text,
                force_list=["GLDETAIL"]
            )

            result = data["response"]["operation"]["result"]

            if result["status"] != "success":
                raise Exception(result["errormessage"])

            data_block = result.get("data", {})

            if total_count is None:
                total_count = int(
                    data_block.get("@totalcount", 0)
                )

            num_remaining = int(
                data_block.get("@numremaining", 0)
            )

            if data_block.get("@resultId"):
                result_id = data_block["@resultId"]

            records = (
                data_block.get("GLDETAIL")
                or data_block.get("gldetail")
                or []
            )

            if isinstance(records, dict):
                records = [records]

            if total_count and len(records) == 0 and num_remaining > 0:
                print("  ! Warning: page had 0 parsed rows while numremaining > 0; continuing with fallback key parsing")

            all_records.extend(records)

            print(
                f"✓ Page {page_num}"
                f" | +{len(records)}"
                f" | total={len(all_records)}"
                f" | remaining={num_remaining}"
            )

            if num_remaining <= 0:
                break

            if result_id is None:
                break

            page_num += 1
            await asyncio.sleep(0.2)

    return all_records

def _normalize_txn_type_label(value):
    text = str(value or "").strip().lower()
    if not text:
        return ""

    if text in ("-1", "dr", "debit", "withdrawal", "out", "outflow"):
        return "debit"
    if text in ("1", "cr", "credit", "deposit", "in", "inflow"):
        return "credit"

    # Preserve Sage-native labels like ACH/WIRE/etc.
    return text


def _resolve_sage_txn_type(source: dict):
    preferred = (
        source.get("TRX_TYPE")
        or source.get("TRANSACTIONTYPE")
        or source.get("TRANSACTION_TYPE")
        or source.get("TYPE")
    )
    if preferred not in (None, ""):
        return _normalize_txn_type_label(preferred)

    fallback = source.get("TR_TYPE") or source.get("TRTYPE")
    return _normalize_txn_type_label(fallback)


def normalize_records(records: list[dict]):

    normalized = []

    for r in records:
        source = r.get("GLDETAIL") if isinstance(r.get("GLDETAIL"), dict) else r

        # ── Amount resolution ──────────────────────────────────────────────
        # In Sage GLDETAIL:
        #   TRX_CREDITAMOUNT  → positive value for credits (money IN)
        #   TRX_DEBITAMOUNT   → positive value for debits  (money OUT)
        #   TRX_AMOUNT        → signed amount (credit=positive, debit=negative)
        # We prefer the explicit credit/debit fields first so direction is clear.
        def _to_float(v):
            try:
                return float(v) if v not in (None, "") else 0.0
            except (ValueError, TypeError):
                return 0.0

        credit_amt = _to_float(source.get("TRX_CREDITAMOUNT"))
        debit_amt  = _to_float(source.get("TRX_DEBITAMOUNT"))
        trx_amount = _to_float(source.get("TRX_AMOUNT"))

        # Determine direction and canonical signed amount
        if credit_amt > 0:
            # Explicit credit (money IN)
            direction  = "credit"
            txn_amount = credit_amt
        elif debit_amt > 0:
            # Explicit debit (money OUT)
            direction  = "debit"
            txn_amount = debit_amt
        elif trx_amount > 0:
            # Positive TRX_AMOUNT → credit
            direction  = "credit"
            txn_amount = trx_amount
        elif trx_amount < 0:
            # Negative TRX_AMOUNT → debit
            direction  = "debit"
            txn_amount = abs(trx_amount)
        else:
            direction  = _resolve_sage_txn_type(source) or ""
            txn_amount = 0.0

        # Override with explicit TR_TYPE if resolved is meaningful
        resolved_type = _resolve_sage_txn_type(source)
        if resolved_type in ("credit", "debit"):
            direction = resolved_type

        normalized.append({

            # RECORD KEY
            "record_no":
                source.get("RECORDNO"),

            # CHECK NUMBER (DOCNO is the check/doc number in GLDETAIL)
            "check_no":
                source.get("DOCNUMBER"),

            # TRANSACTION TYPE: "credit" or "debit" (or raw Sage label)
            "txn_type":
                direction,

            # TRANSACTION DATE
            "txn_date":
                source.get("ENTRY_DATE")
                or source.get("BATCH_DATE"),

            # TRANSACTION AMOUNT (always positive; direction is in txn_type)
            "txn_amount":
                txn_amount,

            # RAW signed amount for reference
            "trx_amount_raw":
                trx_amount,

            "credit_amount":
                credit_amt,

            "debit_amount":
                debit_amt,

            "account_no":
                source.get("ACCOUNTNO"),

            "financial_entity":
                source.get("FINANCIALENTITY"),

            "cleared":
                source.get("CLEARED"),

            "description":
                source.get("PRDESCRIPTION")
                or source.get("DESCRIPTION"),

            "payee":
                source.get("PAYEE")
                or source.get("VENDORNAME")
                or source.get("CUSTOMERNAME"),

            "vendor":
                source.get("VENDORNAME"),

            "customer":
                source.get("CUSTOMERNAME"),

            "record_type":
                source.get("RECORDTYPE")
        })

    return normalized


