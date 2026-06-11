from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc
import json
import concurrent.futures

from common.models.coding import CodingCreate, CodingResponse, LineItemCoding
from common.models.workflow import WorkflowStepType, WorkflowStepStatus
from common.database.database import get_db
from common.models.db_models import (
    Invoice, Coding as DBCoding, CodingHistory, InvoiceStatusHistory
)
from common.repository.repositories import (
    invoice_repo, coding_repo, coding_history_repo, vendor_repo
)
from common.database.db_utils import invoice_to_dict
from common.auth.jwt import get_current_user
from common.dependencies import get_current_entity
from common.models.user import UserResponse
from common.utils.date_utils import get_ist_now
from common.utils.currency_utils import remove_currency_format

# AI helpers
from common.ai.normalizer import normalize_description, normalize_vendor
from common.ai.embeddings import embed_text
from common.ai.similarity import cosine_similarity
from common.services.audit_service import audit_service
from common.models.audit_log import AuditAction

import logging

logger = logging.getLogger(__name__)

router = APIRouter()

def safe_float(value) -> float:
    result = remove_currency_format(value)
    return result if result is not None else 0.0

def get_vendor_name(invoice: Any) -> Optional[str]:
    if invoice.vendor_name: return invoice.vendor_name
    extracted = {}
    if invoice.extracted_data:
        try: extracted = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        except: pass
    if "vendor_info" in extracted:
        name = extracted.get("vendor_info", {}).get("name", {}).get("value")
        if name: return str(name).strip()
    return None

def get_line_items(invoice: Any) -> List[Dict[str, Any]]:
    extracted = {}
    if invoice.extracted_data:
        try: extracted = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        except: pass
    
    for key in ["line_items", "items", "LineItems", "lineItems", "item_list", "products", "details"]:
        if isinstance(extracted.get(key), list): return extracted[key]
    
    if isinstance(extracted.get("Items"), dict): return extracted["Items"].get("value", [])
    
    return []

def update_coding_history(db: Session, vendor_name: str, line_items: List[LineItemCoding], vendor_id: str = None):
    if not vendor_name and not vendor_id: return
    vendor_key = normalize_vendor(vendor_name) if vendor_name else None
    try:
        for item in line_items:
            if not item.description: continue
            
            # Skip if gl_code is empty - don't store empty/unfilled coding in history
            if not item.gl_code:
                continue

            norm_desc = normalize_description(item.description)
            embedding = embed_text(norm_desc)
            
            # Priority 1: vendor_id, Priority 2: vendor_key
            expressions = []
            if vendor_id:
                filters = {"vendor_id": vendor_id, "normalized_description": norm_desc}
            else:
                filters = {"vendor_key": vendor_key, "normalized_description": norm_desc}
                
            history_list = coding_history_repo.get_multi(db, filters=filters, limit=1)
            history = history_list[0] if history_list else None

            coding_data = {
                "gl_code": item.gl_code,
                "lob": item.lob,
                "department": item.department,
                "customer": item.customer,
                "item": item.item
            }

            if history:
                coding_history_repo.update(db, db_obj=history, obj_in={
                    "description": item.description,
                    "embedding": json.dumps(embedding),
                    "coding_json": json.dumps(coding_data),
                    "updated_at": get_ist_now(),
                    "vendor_id": vendor_id if vendor_id else history.vendor_id
                })
            else:
                new_history_data = {
                    "vendor_id": vendor_id,
                    "vendor_key": vendor_key,
                    "vendor_name": vendor_name,
                    "description": item.description,
                    "normalized_description": norm_desc,
                    "embedding": json.dumps(embedding),
                    "coding_json": json.dumps(coding_data)
                }
                coding_history_repo.create(db, obj_in=new_history_data)
    except Exception as e:
        logger.error(f"Error updating coding history: {e}")
        db.rollback()

def apply_coding_suggestions_to_invoice(db: Session, invoice: Any):
    """
    Enriches an invoice's extracted_data with history-based coding suggestions.
    This is typically called when an invoice moves to 'waiting_coding' status.
    """
    vendor_name = get_vendor_name(invoice)
    items = get_line_items(invoice)
    
    if not vendor_name or not items:
        return
        
    suggestions = get_coding_suggestions(db, vendor_name, items, vendor_id=invoice.vendor_id)
    
    # Update extracted_data
    try:
        ext_data = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        if not isinstance(ext_data, dict):
            ext_data = {}
            
        if "Items" not in ext_data:
            ext_data["Items"] = {"value": []}
            
        orig_items = ext_data["Items"].get("value", [])
        
        for idx, suggestion in enumerate(suggestions):
            if idx < len(orig_items):
                item = orig_items[idx]
                # Map LineItemCoding to extracted_data format
                # We use .get("value") check to avoid overwriting if something was already there, 
                # but for waiting_coding we usually want the best suggestion.
                # However, to be safe and "automatically display values", we fill them.
                
                if not item.get("gl_code", {}).get("value"):
                    item["gl_code"] = {"value": suggestion.gl_code}
                if not item.get("lob", {}).get("value"):
                    item["lob"] = {"value": suggestion.lob}
                if not item.get("department", {}).get("value"):
                    item["department"] = {"value": suggestion.department or ""}
                if not item.get("customer", {}).get("value"):
                    item["customer"] = {"value": suggestion.customer or ""}
                if not item.get("item", {}).get("value"):
                    item["item"] = {"value": suggestion.item or ""}
                if not item.get("line_type", {}).get("value"):
                    item["line_type"] = {"value": suggestion.line_type or "Expense"}
        
        from common.database.db_utils import serialize_json_field
        
        # 1. Update Coding record (Primary source for "LINE ITEMS CODING" table)
        line_items_data = [item.dict() if hasattr(item, 'dict') else item for item in suggestions]
        line_items_json = serialize_json_field(line_items_data)
        
        # We need to refresh the check for existing coding record
        existing_coding = db.query(DBCoding).filter(DBCoding.invoice_id == invoice.id).first()
        if existing_coding:
            existing_coding.line_items = line_items_json
            existing_coding.updated_at = get_ist_now()
        else:
            new_coding = DBCoding(
                invoice_id=invoice.id,
                line_items=line_items_json,
                entity=invoice.entity,
                created_at=get_ist_now()
            )
            db.add(new_coding)

        # 2. Update Invoice extracted_data (Sync for All Fields view and UI fallback)
        invoice.extracted_data = serialize_json_field(ext_data)
            
        db.add(invoice)
        db.commit()
        logger.info(f"Automatically applied coding suggestions to invoice {invoice.id}")
    except Exception as e:
        logger.error(f"Error applying coding suggestions: {e}")
        db.rollback()

def get_coding_suggestions(db: Session, vendor_name: str, extracted_items: List[Dict[str, Any]], vendor_id: str = None) -> List[LineItemCoding]:

    vendor_key = normalize_vendor(vendor_name) if vendor_name else None

    # Fetch vendor tax eligibility
    vendor_gst_eligible = False
    vendor_tds_eligible = False
    if vendor_id:
        try:
            vendor_list = vendor_repo.get_multi(db, filters={"vendor_id": vendor_id}, limit=1)
            vendor = vendor_list[0] if vendor_list else None
            if vendor:
                vendor_gst_eligible = bool(vendor.gst_eligibility)
                vendor_tds_eligible = bool(vendor.tds_applicability)
                logger.info(f"Vendor {vendor_id} tax flags: GST={vendor_gst_eligible}, TDS={vendor_tds_eligible}")
        except Exception as e:
            logger.error(f"Error checking vendor tax eligibility: {e}")

    history_entries = []
    seen_ids = set()

    # 1️. Fetch by Vendor ID (Strong match)
    if vendor_id:
        try:
            id_entries = coding_history_repo.get_multi(
                db,
                filters={"vendor_id": vendor_id},
                limit=500
            )
            for h in id_entries:
                history_entries.append(h)
                seen_ids.add(h.id)
        except Exception as e:
            logger.error(f"Error fetching ID-based history: {e}")

    # 2. Fetch by Vendor Name (Broad match)
    if vendor_key:
        try:
            expressions = []
            if vendor_id:
                expressions = [CodingHistory.vendor_id != vendor_id]

            name_entries = coding_history_repo.get_multi(
                db,
                filters={"vendor_key": vendor_key},
                expressions=expressions,
                limit=500
            )

            for h in name_entries:
                if h.id not in seen_ids:
                    history_entries.append(h)

        except Exception as e:
            logger.error(f"Error fetching Name-based history: {e}")

    suggestions: List[LineItemCoding] = []
    item_metadata = []
    descriptions = []

    for idx, raw in enumerate(extracted_items):

        #  Extract description
        desc = raw.get("description")
        if isinstance(desc, dict):
            desc = desc.get("value")

        if not desc:
            continue

        normalized_desc = normalize_description(desc)

        #  Flags (IMPORTANT)
        is_gst_eligible = (
            raw.get("gst_eligible") or 
            raw.get("gst") == "eligible" or 
            "gst" in normalized_desc.lower()
        )
        is_tds = (
            raw.get("is_tds") or 
            "tds" in normalized_desc.lower()
        )

        # COLLECT DATA FOR PARALLEL PROCESSING
        item_metadata.append({
            "idx": idx,
            "raw": raw,
            "desc": desc,
            "normalized_desc": normalized_desc,
            "is_gst_eligible": is_gst_eligible,
            "is_tds": is_tds
        })
        descriptions.append(normalized_desc)
    
    # Process embeddings in parallel to overcome sequential network latency
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(descriptions), 10)) as executor:
        embeddings = list(executor.map(embed_text, descriptions))

    for i, meta in enumerate(item_metadata):
        idx = meta["idx"]
        raw = meta["raw"]
        desc = meta["desc"]
        normalized_desc = meta["normalized_desc"]
        is_gst_eligible = meta["is_gst_eligible"]
        is_tds = meta["is_tds"]
        query_embedding = embeddings[i]

        best_match = None
        best_score = 0.0

        # 🔹 Find best similarity match
        try:
            for h in history_entries:
                if not h.embedding:
                    continue

                h_emb = json.loads(h.embedding)
                score = cosine_similarity(query_embedding, h_emb)

                if score > best_score:
                    best_score = score
                    best_match = h

        except Exception as e:
            logger.error(f"Error processing history entries: {e}")
            best_match = None

        # SIMILARITY THRESHOLD: Only accept match if similarity is high enough
        # This prevents "forcing" a match when only irrelevant history exists (like TDS lines)
        SIMILARITY_THRESHOLD = 0.75
        if best_score < SIMILARITY_THRESHOLD:
            best_match = None

        def val(key):
            v = raw.get(key)
            return v.get("value") if isinstance(v, dict) else v

        item = LineItemCoding(
            s_no=idx + 1,
            description=desc,
            line_type="Expense",
            quantity=safe_float(val("quantity")),
            unit_price=safe_float(val("unit_price") or val("price")),
            net_amount=safe_float(val("amount") or val("total")),
            gl_code="",
            lob="",
            department="",
            customer="",
            item=""
        )

        #  Match from history (AI match)
        if best_match and best_match.coding_json:
            try:
                coding = json.loads(best_match.coding_json)

                item.gl_code = coding.get("gl_code", "")
                item.lob = coding.get("lob", "")
                item.department = coding.get("department", "")
                item.customer = coding.get("customer", "")
                item.item = coding.get("item", "")

            except Exception as e:
                logger.error(f"Error parsing coding_json: {e}")

        # =========================================================
        #  BUSINESS RULE OVERRIDES (PRIORITY BASED)
        # =========================================================

        #  3. GST Ineligible (Implicit) → Already handled by history block above

        #  If no rule + no match → stays empty (manual input)

        suggestions.append(item)

    return suggestions

@router.get("/{invoice_id}", response_model=CodingResponse)
async def get_coding(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice or invoice.entity != entity:
        raise HTTPException(404, "Invoice not found or access denied")

    coding_list = coding_repo.get_multi(db, filters={"invoice_id": invoice_id}, limit=1)
    existing = coding_list[0] if coding_list else None
    if existing:
        saved_items = json.loads(existing.line_items) if existing.line_items else []
        
        # Auto-fill: If any saved item has NO GL Code, try to fetch suggestions to fill it
        # This handles cases where the user opened the invoice previously (creating empty records) 
        # but we now have better suggestions (e.g. via fallback logic).
        if any(not item.get("gl_code") for item in saved_items):
            try:
                vendor_name = get_vendor_name(invoice)
                raw_items = get_line_items(invoice)
                # Fetch fresh suggestions
                fresh_suggestions = get_coding_suggestions(db, vendor_name, raw_items, vendor_id=invoice.vendor_id)
                
                # Create a map of suggestions by description (or index)
                # Using index is riskier if lines changed, but description is safer
                suggestion_map = {s.description: s for s in fresh_suggestions}
                
                for idx, item in enumerate(saved_items):
                    if not item.get("gl_code"):
                        # Try to find match by description
                        desc = item.get("description")
                        if desc and desc in suggestion_map:
                            item["gl_code"] = suggestion_map[desc].gl_code
                            item["lob"] = suggestion_map[desc].lob
                            item["department"] = suggestion_map[desc].department
                            item["customer"] = suggestion_map[desc].customer
                            item["item"] = suggestion_map[desc].item
                        # Fallback: Try by index if descriptions perfectly align
                        elif idx < len(fresh_suggestions) and fresh_suggestions[idx].description == desc:
                             s = fresh_suggestions[idx]
                             item["gl_code"] = s.gl_code
                             item["lob"] = s.lob
                             item["department"] = s.department
                             item["customer"] = s.customer
                             item["item"] = s.item
            except Exception as e:
                logger.error(f"Error auto-filling coding suggestions: {e}")

        return CodingResponse(
            id=str(existing.id),
            invoice_id=str(existing.invoice_id),
            header_coding=existing.header_coding,
            line_items=saved_items,
            created_at=existing.created_at
        )

    vendor_name = get_vendor_name(invoice)
    items = get_line_items(invoice)
    if not vendor_name or not items:
        return CodingResponse(id="", invoice_id=str(invoice_id), line_items=[], total_amount=0.0, created_at=get_ist_now())

    suggestions = get_coding_suggestions(db, vendor_name, items, vendor_id=invoice.vendor_id)
    return CodingResponse(
        id="suggested",
        invoice_id=str(invoice_id),
        vendor_name=vendor_name,
        line_items=suggestions,
        total_amount=sum(i.net_amount for i in suggestions),
        created_at=get_ist_now()
    )

@router.get("/{invoice_id}/suggestions", response_model=List[LineItemCoding])
async def get_suggestions(
    invoice_id: int,
    vendor_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """
    Fetch coding suggestions for an invoice, optionally overriding the vendor_id.
    """
    invoice = invoice_repo.get(db, invoice_id)
    if not invoice or invoice.entity != entity:
        raise HTTPException(404, "Invoice not found or access denied")

    vendor_name = get_vendor_name(invoice)
    items = get_line_items(invoice)
    
    if not items:
        return []

    # Use provided vendor_id or fallback to invoice's vendor_id
    target_vendor_id = vendor_id or invoice.vendor_id
    
    logger.info(f"Fetching suggestions for invoice {invoice_id} with vendor {target_vendor_id}")
    
    suggestions = get_coding_suggestions(db, vendor_name, items, vendor_id=target_vendor_id)
    
    logger.info(f"Found {len(suggestions)} suggestions. First item GL: {suggestions[0].gl_code if suggestions else 'None'}")
    return suggestions

@router.post("/", response_model=CodingResponse)
async def create_or_update_coding(
    coding_data: CodingCreate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    # inv_id must be int
    try: inv_id = int(coding_data.invoice_id)
    except: raise HTTPException(400, "Invalid invoice ID")

    invoice = invoice_repo.get(db, inv_id)
    if not invoice or invoice.entity != entity:
        raise HTTPException(404, "Invoice not found or access denied")

    coding_list = coding_repo.get_multi(db, filters={"invoice_id": inv_id}, limit=1)
    existing_coding = coding_list[0] if coding_list else None
    
    line_items_json = json.dumps([item.dict() for item in coding_data.line_items]) if coding_data.line_items else "[]"
    
    if existing_coding:
        coding_repo.update(db, db_obj=existing_coding, obj_in={
            "header_coding": coding_data.header_coding,
            "line_items": line_items_json,
            "updated_at": get_ist_now()
        })
    else:
        new_coding_data = {
            "invoice_id": inv_id,
            "header_coding": coding_data.header_coding,
            "line_items": line_items_json,
            "entity": entity,
            "created_at": get_ist_now()
        }
        coding_repo.create(db, obj_in=new_coding_data)
    
    if coding_data.vendor_name is not None:
        invoice_repo.update(db, db_obj=invoice, obj_in={"vendor_name": coding_data.vendor_name})
    if getattr(coding_data, 'vendor_id', None) is not None:
        invoice_repo.update(db, db_obj=invoice, obj_in={"vendor_id": coding_data.vendor_id})

    # Update history and gl_summary
    vendor_name = coding_data.vendor_name or get_vendor_name(invoice)
    vendor_id = invoice.vendor_id
    if (vendor_name or vendor_id) and coding_data.line_items:
        update_coding_history(db, vendor_name, coding_data.line_items, vendor_id=vendor_id)

    summary_map = {}
    for item in coding_data.line_items:
        if item.gl_code:
            summary_map[item.gl_code] = summary_map.get(item.gl_code, 0.0) + item.net_amount
    
    gl_summary = [{"gl_code": k, "total_amount": v} for k, v in summary_map.items()]
    # Update gl_summary and extracted_data via invoice_repo
    update_vals = {"gl_summary": json.dumps(gl_summary)}
    
    # Sync to extracted_data
    try:
        ext_data = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        # ... logic as before ...
        if "Items" not in ext_data: ext_data["Items"] = {"value": []}
        orig_items = ext_data["Items"].get("value", [])
        new_ext_items = []
        for c_item in coding_data.line_items:
             if c_item.original_index is not None and 0 <= c_item.original_index < len(orig_items):
                 bi = orig_items[c_item.original_index]
                 # ...
                 bi["description"] = {"value": c_item.description}
                 bi["quantity"] = {"value": c_item.quantity}
                 bi["unit_price"] = {"value": c_item.unit_price}
                 bi["amount"] = {"value": c_item.net_amount}
                 new_ext_items.append(bi)
             else:
                 new_ext_items.append({
                     "description": {"value": c_item.description},
                     "quantity": {"value": c_item.quantity},
                     "unit_price": {"value": c_item.unit_price},
                     "amount": {"value": c_item.net_amount},
                     "item_code": {"value": c_item.item}
                 })
        ext_data["Items"]["value"] = new_ext_items
        update_vals["extracted_data"] = json.dumps(ext_data)
    except: pass
    
    invoice_repo.update(db, db_obj=invoice, obj_in=update_vals)

    saved_list = coding_repo.get_multi(db, filters={"invoice_id": inv_id}, limit=1)
    saved = saved_list[0] if saved_list else None
    return CodingResponse(
        id=str(saved.id),
        invoice_id=str(saved.invoice_id),
        header_coding=saved.header_coding,
        line_items=json.loads(saved.line_items) if saved.line_items else [],
        created_at=saved.created_at
    )
