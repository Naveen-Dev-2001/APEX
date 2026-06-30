import httpx
import xmltodict
import asyncio
import json
import os
import uvicorn
from fastapi import FastAPI, HTTPException
from typing import Optional

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

def normalize_records(records: list[dict]):

    normalized = []

    for r in records:
        source = r.get("GLDETAIL") if isinstance(r.get("GLDETAIL"), dict) else r

        amount = (
            source.get("TRX_AMOUNT")
            or source.get("TRX_DEBITAMOUNT")
            or source.get("TRX_CREDITAMOUNT")
            or 0
        )

        try:
            amount = float(amount)
        except:
            amount = 0

        normalized.append({

            # RECORD KEY
            "record_no":
                source.get("RECORDNO"),

            # CHECK NUMBER (DOCNO is the check/doc number in GLDETAIL)
            "check_no":
                source.get("DOCNUMBER"),

            # TRANSACTION TYPE
            "txn_type":
                source.get("TR_TYPE"),

            # TRANSACTION DATE
            "txn_date":
                source.get("ENTRY_DATE")
                or source.get("BATCH_DATE"),

            # TRANSACTION AMOUNT
            "txn_amount":
                abs(amount),

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


# ── Standalone runner ─────────────────────────────────────────────────────────

async def run_standalone():
    print("\n=== Sage Bank Reconciliation — Fetch Uncleared Transactions ===\n")
    try:
        session_id = await get_session_id()

        print("\nFetching uncleared transactions...")
        records    = await fetch_all_gldetail(
            session_id=session_id,
            financial_entity="FFB_4449",
            account_no="10012",
            after_date="09/30/2023"
        )
        normalized = normalize_records(records)

        print(f"\n{'='*60}")
        print(f"Total uncleared transactions: {len(normalized)}")
        print(f"{'='*60}\n")

        for txn in normalized[:10]:
            direction = "💸 OUT" if str(txn.get("txn_type")) in ("-1",) else "💰 IN"
            print(f"{direction}  {txn.get('txn_date')}  "
                  f"Check: {str(txn.get('check_no') or ''):<8}  "
                  f"${txn.get('txn_amount', 0):>10,.2f}  "
                  f"Account: {txn.get('account_no', '')}")

        if len(normalized) > 10:
            print(f"\n  ... and {len(normalized) - 10} more records")

        script_dir  = os.path.dirname(os.path.abspath(__file__))
        output_path = os.path.join(script_dir, "uncleared_transactions.json")
        with open(output_path, "w") as f:
            json.dump({"total": len(normalized), "transactions": normalized}, f, indent=2)
        print(f"\n✓ Full results saved to: {output_path}")

    except Exception as e:
        import traceback
        print(f"\n✗ Error: {e}")
        traceback.print_exc()


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "server":
        print("Starting FastAPI server on http://localhost:8000")
        print("Docs at: http://localhost:8000/docs\n")
        uvicorn.run("bank_recon:app", host="0.0.0.0", port=8000, reload=True)
    else:
        asyncio.run(run_standalone())
