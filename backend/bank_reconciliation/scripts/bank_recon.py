import httpx
import xmltodict
import asyncio
import json
import os
import sys
import uvicorn
from fastapi import FastAPI, HTTPException
from typing import Optional

# ── DB (for bank_accounts lookup in standalone mode) ──────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:
    pass

try:
    import pymssql
    _DB_URL = os.getenv(
        "DATABASE_URL",
        "mssql+pymssql://sa:Loandna%402026@localhost:1433/accounts_payable"
    )
except ImportError:
    _DB_URL = None

app = FastAPI(title="Sage Bank Reconciliation API")

SAGE_URL = "https://api.intacct.com/ia/xml/xmlgw.phtml"

# ── Credentials ───────────────────────────────────────────────────────────────
SENDER_ID = "consolidatedanalytic"
SENDER_PASSWORD = "Cawebserviceuser1005*"
USER_ID = "Apex"
COMPANY_ID = "consolidatedanalytics-sandbox"
USER_PASSWORD = "mnvE5zt07Q*" 


# ── Auth ──────────────────────────────────────────────────────────────────────

async def get_session_id() -> str:
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
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            SAGE_URL, content=payload,
            headers={"Content-Type": "application/xml"}
        )
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


# ── Fetch with readByQuery + readMore pagination ──────────────────────────────

# async def fetch_all_gldetail(
#     session_id: str,
#     financial_entity: str = "FFB_4449",
#     account_no: str = "",
#     after_date: str = "10/02/2025",
#     page_size: int = 1000
# ) -> list[dict]:
#     """
#     readByQuery  → returns resultId + first page
#     readMore     → fetches subsequent pages using resultId
#     Stops when numremaining = 0
#     """

#     all_records = []
#     page_num    = 1
#     result_id   = None
#     total_count = None

#     # Build the filter string for readByQuery
#     # Note: readByQuery uses SQL-like string query, not XML filter elements
#     query_str = (
#         f"FINANCIALENTITY = '{financial_entity}' "
#         f"AND ACCOUNTNO = '{account_no}' "
#         f"AND CLEARED = 'F' "
#         f"AND BATCH_DATE > '{after_date}'"
#     )

#     fields_str = (
#         "RECORDNO,ENTRY_DATE,BATCH_DATE,DOCNUMBER,TR_TYPE,"
#         "TRX_AMOUNT,TRX_DEBITAMOUNT,TRX_CREDITAMOUNT,"
#         "CLEARED,CLRDATE,FINANCIALENTITY,ACCOUNTNO,"
#         "VENDORID,VENDORNAME,CUSTOMERID,CUSTOMERNAME,"
#         "RECORDTYPE,PRDESCRIPTION,SYMBOL,BATCH_STATE"
#     )

#     async with httpx.AsyncClient(timeout=60) as client:
#         while True:
#             print(f"  → Fetching page {page_num}...")

#             if result_id is None:
#                 # ── First call: readByQuery with filter ───────────────────────
#                 function_xml = f"""
# <function controlid="page-{page_num}">
#   <readByQuery>
#     <object>GLDETAIL</object>
#     <fields>{fields_str}</fields>
#     <query>{query_str}</query>
#     <pagesize>{page_size}</pagesize>
#   </readByQuery>
# </function>"""
#             else:
#                 # ── Subsequent calls: readMore with resultId ──────────────────
#                 function_xml = f"""
# <function controlid="page-{page_num}">
#   <readMore>
#     <resultId>{result_id}</resultId>
#   </readMore>
# </function>"""

#             payload = f"""<?xml version="1.0" encoding="UTF-8"?>
# <request>
#   <control>
#     <senderid>{SENDER_ID}</senderid>
#     <password>{SENDER_PASSWORD}</password>
#     <controlid>batch-page-{page_num}</controlid>
#     <uniqueid>false</uniqueid>
#     <dtdversion>3.0</dtdversion>
#   </control>
#   <operation>
#     <authentication>
#       <sessionid>{session_id}</sessionid>
#     </authentication>
#     <content>
#       {function_xml}
#     </content>
#   </operation>
# </request>"""

#             response = await client.post(
#                 SAGE_URL, content=payload,
#                 headers={"Content-Type": "application/xml"}
#             )

#             # ── Check control-level failure ───────────────────────────────────
#             control_check = xmltodict.parse(response.text)
#             ctrl = control_check.get("response", {}).get("control", {})
#             if ctrl.get("status") == "failure":
#                 err = control_check["response"]["errormessage"]["error"]["description2"]
#                 raise Exception(f"Sage control error: {err}")

#             data   = xmltodict.parse(response.text, force_list=("GLDETAIL",))
#             result = data["response"]["operation"]["result"]

#             if result["status"] == "failure":
#                 err = result["errormessage"]["error"]["description2"]
#                 raise Exception(f"Sage query error: {err}")

#             data_block = result["data"]

#             # Capture metadata
#             if total_count is None:
#                 total_count = int(data_block.get("@totalcount", 0))
#                 print(f"  ℹ Total records to fetch: {total_count}")

#             num_remaining = int(data_block.get("@numremaining", 0))

#             # readByQuery returns resultId — capture it from first page
#             new_result_id = data_block.get("@resultId")
#             if new_result_id:
#                 result_id = new_result_id

#             records = data_block.get("GLDETAIL", [])
#             if isinstance(records, dict):
#                 records = [records]

#             all_records.extend(records)

#             print(f"  ✓ Page {page_num}: +{len(records)} records "
#                   f"| total: {len(all_records)}/{total_count} "
#                   f"| remaining: {num_remaining} "
#                   f"| resultId: {'set' if result_id else 'MISSING'}")

#             # ── Stop conditions ────────────────────────────────────────────────
#             if num_remaining == 0:
#                 print("  ✓ Done — numremaining = 0")
#                 break
#             if len(all_records) >= total_count > 0:
#                 print(f"  ✓ Done — fetched {len(all_records)}/{total_count}")
#                 break
#             if len(records) == 0:
#                 print("  ✓ Done — empty page returned")
#                 break
#             if result_id is None:
#                 raise Exception("readByQuery did not return a resultId — cannot paginate.")

#             page_num += 1
#             await asyncio.sleep(0.2)

#     return all_records




# async def fetch_all_gldetail(
#     session_id: str,
#     financial_entity: str = "FFB_4449",
#     account_no: str = "",
#     after_date: str = "10/02/2025",
#     page_size: int = 1000
# ) -> list[dict]:

#     all_records = []
#     page_num = 1
#     result_id = None
#     total_count = None

#     query_str = (
#         f"FINANCIALENTITY = '{financial_entity}' "
#         f"AND ACCOUNTNO = '{account_no}' "
#         f"AND CLEARED = 'F' "
#         f"AND BATCH_DATE > '{after_date}'"
#     )

#     fields_str = (
#         "RECORDNO,ENTRY_DATE,BATCH_DATE,DOCNUMBER,TR_TYPE,"
#         "TRX_AMOUNT,TRX_DEBITAMOUNT,TRX_CREDITAMOUNT,"
#         "CLEARED,CLRDATE,FINANCIALENTITY,ACCOUNTNO,"
#         "VENDORID,VENDORNAME,CUSTOMERID,CUSTOMERNAME,"
#         "RECORDTYPE,PRDESCRIPTION,SYMBOL,BATCH_STATE"
#     )

#     async with httpx.AsyncClient(timeout=60) as client:

#         while True:

#             print(f"\n→ Fetching page {page_num}")

#             if result_id is None:

#                 function_xml = f"""
# <function controlid="page-{page_num}">
# <readByQuery>
# <object>GLDETAIL</object>
# <fields>{fields_str}</fields>
# <query>{query_str}</query>
# <pagesize>{page_size}</pagesize>
# <returnFormat>xml</returnFormat>
# </readByQuery>
# </function>
# """

#             else:

#                 function_xml = f"""
# <function controlid="page-{page_num}">
# <readMore>
# <resultId>{result_id}</resultId>
# </readMore>
# </function>
# """

#             payload = f"""<?xml version="1.0"?>
# <request>
# <control>
# <senderid>{SENDER_ID}</senderid>
# <password>{SENDER_PASSWORD}</password>
# <controlid>batch-{page_num}</controlid>
# <uniqueid>false</uniqueid>
# <dtdversion>3.0</dtdversion>
# </control>

# <operation>
# <authentication>
# <sessionid>{session_id}</sessionid>
# </authentication>

# <content>
# {function_xml}
# </content>

# </operation>
# </request>
# """

#             response = await client.post(
#                 SAGE_URL,
#                 content=payload,
#                 headers={"Content-Type": "application/xml"}
#             )

#             raw = response.text

#             data = xmltodict.parse(
#                 raw,
#                 force_list=["GLDETAIL"]
#             )

#             result = data["response"]["operation"]["result"]

#             if result["status"] != "success":
#                 raise Exception(result["errormessage"])

#             data_block = result.get("data", {})

#             print("DATA KEYS:", list(data_block.keys()))

#             if total_count is None:
#                 total_count = int(data_block.get("@totalcount", 0))

#             num_remaining = int(
#                 data_block.get("@numremaining", 0)
#             )

#             if data_block.get("@resultId"):
#                 result_id = data_block["@resultId"]

#             records = (
#                 data_block.get("GLDETAIL")
#                 or data_block.get("gldetail")
#                 or []
#             )

#             if isinstance(records, dict):
#                 records = [records]

#             all_records.extend(records)

#             print(
#                 f"✓ Got {len(records)} "
#                 f"| total={len(all_records)} "
#                 f"| remaining={num_remaining}"
#             )

#             # stop ONLY when Sage says finished
#             if num_remaining <= 0:
#                 print("✓ Pagination completed")
#                 break

#             if (
#                 total_count > 0
#                 and len(all_records) >= total_count
#             ):
#                 print("✓ Reached total count")
#                 break

#             if result_id is None:
#                 raise Exception(
#                     "No resultId returned"
#                 )

#             page_num += 1
#             await asyncio.sleep(0.2)

#     return all_records

async def fetch_all_gldetail(
    session_id: str,
    financial_entity: str = "FFB_4449",
    account_no: str = "",
    after_date: str = "10/02/2025",
    page_size: int = 1000
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

    async with httpx.AsyncClient(timeout=60) as client:

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

            response = await client.post(
                SAGE_URL,
                content=payload,
                headers={
                    "Content-Type": "application/xml"
                }
            )

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


# def normalize_records(records: list[dict]) -> list[dict]:
#     normalized = []
#     for r in records:
#         amount = float(r.get("TRX_AMOUNT", 0))
#         normalized.append({
#             "record_no":   r.get("RECORDNO"),
#             "entry_date":  r.get("ENTRY_DATE"),
#             "batch_date":  r.get("BATCH_DATE"),
#             "doc_number":  r.get("DOCNUMBER"),
#             "amount":      abs(amount),
#             "direction":   "out" if amount < 0 else "in",
#             "tr_type":     r.get("TR_TYPE"),
#             "vendor_id":   r.get("VENDORID"),
#             "vendor":      r.get("VENDORNAME"),
#             "customer_id": r.get("CUSTOMERID"),
#             "customer":    r.get("CUSTOMERNAME"),
#             "record_type": r.get("RECORDTYPE"),
#             "description": r.get("PRDESCRIPTION"),
#             "cleared":     r.get("CLEARED"),
#             "account_no":  r.get("ACCOUNTNO"),
#         })
#     return normalized

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

# ── FastAPI Endpoints ─────────────────────────────────────────────────────────

@app.get("/reconciliation/uncleared")
async def get_uncleared_transactions(
    financial_entity: str = "FFB_4449",
    account_no: str = "10012",
    after_date: str = "09/30/2023",
):
    session_id = await get_session_id()
    records    = await fetch_all_gldetail(
        session_id=session_id,
        financial_entity=financial_entity,
        account_no=account_no,
        after_date=after_date
    )
    normalized = normalize_records(records)
    return {
        "total":        len(normalized),
        "account":      financial_entity,
        "gl_account":   account_no,
        "after_date":   after_date,
        "transactions": normalized
    }


# ── DB helper: look up gl_account from bank_accounts table ───────────────────

def _get_gl_account_for_entity(financial_entity: str) -> str | None:
    """
    Query the local bank_accounts table and return the gl_account
    that corresponds to the given financial_entity (= bank_id in the table).
    Returns None if not found or if DB is unavailable.
    """
    try:
        import urllib.parse
        from sqlalchemy import create_engine, text

        db_url = _DB_URL or os.getenv("DATABASE_URL", "")
        if not db_url:
            print("  ! DATABASE_URL not set — skipping gl_account lookup")
            return None

        engine = create_engine(db_url, pool_pre_ping=True)
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT TOP 1 gl_account FROM bank_accounts "
                    "WHERE bank_id = :bid AND is_active = 1 "
                    "AND gl_account IS NOT NULL"
                ),
                {"bid": financial_entity}
            ).fetchone()

        engine.dispose()

        if row and row[0]:
            gl = str(row[0]).strip()
            print(f"  ✓ GL account for '{financial_entity}': {gl}")
            return gl
        else:
            print(f"  ! No active gl_account found for financial_entity='{financial_entity}'")
            return None

    except Exception as exc:
        print(f"  ! DB lookup failed: {exc}")
        return None


def _get_all_active_entities() -> list[dict]:
    """
    Return all active bank_accounts rows as list of
    {bank_id, gl_account} dicts for bulk run.
    """
    try:
        from sqlalchemy import create_engine, text

        db_url = _DB_URL or os.getenv("DATABASE_URL", "")
        if not db_url:
            return []

        engine = create_engine(db_url, pool_pre_ping=True)
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT bank_id, gl_account FROM bank_accounts "
                    "WHERE is_active = 1 "
                    "AND bank_id IS NOT NULL "
                    "AND gl_account IS NOT NULL"
                )
            ).fetchall()
        engine.dispose()

        return [{"bank_id": r[0], "gl_account": r[1]} for r in rows if r[0] and r[1]]

    except Exception as exc:
        print(f"  ! DB lookup failed: {exc}")
        return []


# ── Standalone runner ─────────────────────────────────────────────────────────

async def run_standalone(financial_entity: str, after_date: str = "09/30/2023"):
    """
    Fetch all uncleared transactions (debits + credits) for the given
    financial_entity. GL account is resolved automatically from bank_accounts.
    """
    print(f"\n=== Sage Bank Reconciliation — Uncleared Transactions ===")
    print(f"    Financial Entity : {financial_entity}")
    print(f"    After Date       : {after_date}\n")

    # ── Step 1: resolve GL account from DB ────────────────────────────────
    print("Looking up GL account from bank_accounts table...")
    account_no = _get_gl_account_for_entity(financial_entity) or ""
    if not account_no:
        print("  ⚠  No GL account found — will query Sage without ACCOUNTNO filter.")
    else:
        print(f"  → Using ACCOUNTNO = '{account_no}'")

    try:
        # ── Step 2: authenticate ───────────────────────────────────────────
        session_id = await get_session_id()

        # ── Step 3: fetch ALL uncleared (debit + credit) ───────────────────
        print(f"\nFetching uncleared transactions from Sage...")
        records = await fetch_all_gldetail(
            session_id=session_id,
            financial_entity=financial_entity,
            account_no=account_no,
            after_date=after_date
        )
        normalized = normalize_records(records)

        # ── Step 4: split by direction for reporting ───────────────────────
        credits = [t for t in normalized if t.get("txn_type") == "credit"]
        debits  = [t for t in normalized if t.get("txn_type") == "debit"]
        others  = [t for t in normalized if t.get("txn_type") not in ("credit", "debit")]

        print(f"\n{'='*65}")
        print(f"  Financial Entity : {financial_entity}")
        print(f"  GL Account       : {account_no or '(all)'}")
        print(f"  Total uncleared  : {len(normalized)}")
        print(f"    💰 Credits (IN) : {len(credits)}")
        print(f"    💸 Debits  (OUT): {len(debits)}")
        if others:
            print(f"    ❓ Unknown type  : {len(others)}")
        print(f"{'='*65}\n")

        # ── Step 5: preview first 10 ───────────────────────────────────────
        for txn in normalized[:10]:
            txn_type  = str(txn.get("txn_type") or "").lower()
            icon      = "💰 IN " if txn_type == "credit" else "💸 OUT"
            print(
                f"{icon}  {txn.get('txn_date'):<12}  "
                f"Check: {str(txn.get('check_no') or ''):<10}  "
                f"${txn.get('txn_amount', 0):>12,.2f}  "
                f"Type: {txn_type:<8}  "
                f"Payee: {str(txn.get('payee') or '')[:30]}"
            )

        if len(normalized) > 10:
            print(f"\n  ... and {len(normalized) - 10} more records")

        # ── Step 6: save output ────────────────────────────────────────────
        script_dir  = os.path.dirname(os.path.abspath(__file__))
        safe_entity = financial_entity.replace("/", "_").replace("\\", "_")
        output_path = os.path.join(script_dir, f"uncleared_{safe_entity}.json")
        with open(output_path, "w") as f:
            json.dump(
                {
                    "financial_entity": financial_entity,
                    "gl_account": account_no,
                    "after_date": after_date,
                    "total": len(normalized),
                    "credits": len(credits),
                    "debits": len(debits),
                    "transactions": normalized,
                },
                f,
                indent=2,
            )
        print(f"\n✓ Full results saved to: {output_path}")

    except Exception as e:
        import traceback
        print(f"\n✗ Error: {e}")
        traceback.print_exc()


if __name__ == "__main__":
    # Usage:
    #   python bank_recon.py server                          → start FastAPI
    #   python bank_recon.py FFB_4449                        → fetch for one entity
    #   python bank_recon.py FFB_4449 01/01/2024            → with custom after_date
    #   python bank_recon.py --all                           → fetch all active entities from DB

    if len(sys.argv) > 1 and sys.argv[1] == "server":
        print("Starting FastAPI server on http://localhost:8000")
        print("Docs at: http://localhost:8000/docs\n")
        uvicorn.run("bank_recon:app", host="0.0.0.0", port=8000, reload=True)

    elif len(sys.argv) > 1 and sys.argv[1] == "--all":
        # Fetch uncleared transactions for EVERY active bank entity in the DB
        after_date = sys.argv[2] if len(sys.argv) > 2 else "09/30/2023"
        entities   = _get_all_active_entities()
        if not entities:
            print("No active bank_accounts found in DB. Exiting.")
            sys.exit(1)
        print(f"Found {len(entities)} active bank account(s) in DB.\n")
        for entry in entities:
            asyncio.run(run_standalone(
                financial_entity=entry["bank_id"],
                after_date=after_date,
            ))

    else:
        # Single entity mode (required)
        if len(sys.argv) < 2:
            print("Usage:")
            print("  python bank_recon.py <financial_entity> [after_date]")
            print("  python bank_recon.py --all [after_date]")
            print("  python bank_recon.py server")
            print("\nExample:")
            print("  python bank_recon.py FFB_4449 09/30/2023")
            sys.exit(1)

        financial_entity = sys.argv[1]
        after_date       = sys.argv[2] if len(sys.argv) > 2 else "09/30/2023"
        asyncio.run(run_standalone(financial_entity=financial_entity, after_date=after_date))
