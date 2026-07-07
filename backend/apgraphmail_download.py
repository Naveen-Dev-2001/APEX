import os
import sys
import base64
import re
import logging
import logging.handlers
from datetime import datetime
from pathlib import Path
import shutil
import asyncio

import msal
import requests
from dotenv import load_dotenv

load_dotenv()

TENANT_ID = os.getenv("TENANT_ID")
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")

TOOL = os.getenv("TOOL", "sage")

MAILBOX_ENV = os.getenv("MAILBOX", "")
if "|" in MAILBOX_ENV:
    MAILBOX, parsed_entity = MAILBOX_ENV.split("|", 1)
    ENTITY_ID = parsed_entity if TOOL == "sage" else "DEFAULT"
else:
    MAILBOX = MAILBOX_ENV
    ENTITY_ID = "201" if TOOL == "sage" else "DEFAULT"

UNREAD_DIR = Path("uploads/unread")
READ_DIR = Path("uploads/read")
NON_INVOICE_DIR = Path("uploads/non_invoice")

UNREAD_DIR.mkdir(parents=True, exist_ok=True)
READ_DIR.mkdir(parents=True, exist_ok=True)
NON_INVOICE_DIR.mkdir(parents=True, exist_ok=True)

AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
SCOPE = ["https://graph.microsoft.com/.default"]
GRAPH = "https://graph.microsoft.com/v1.0"

_msal_app: msal.ConfidentialClientApplication | None = None


# ---------------------------------------------------------------------------
# Logging — writes to both console (INFO) and rotating file (DEBUG)
# ---------------------------------------------------------------------------

def _setup_logging() -> logging.Logger:
    logger = logging.getLogger("apgraphmail_download")
    if logger.handlers:
        return logger
    logger.setLevel(logging.DEBUG)

    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)

    fh = logging.handlers.RotatingFileHandler(
        "invoice_download.log",
        maxBytes=5 * 1024 * 1024,   # 5 MB per file
        backupCount=10,
        encoding="utf-8",
    )
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)

    logger.addHandler(ch)
    logger.addHandler(fh)
    return logger


log = _setup_logging()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def safe_filename(name: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\r\n\t]', "_", name).strip()
    return cleaned or "unnamed"


def _format_datestamp(received_datetime: str) -> str:
    """Convert Graph receivedDateTime into YYYYMMDD_HHMMSS for filenames."""
    if not received_datetime:
        return "unknown_date"

    try:
        parsed = datetime.fromisoformat(received_datetime.replace("Z", "+00:00"))
        return parsed.strftime("%Y%m%d_%H%M%S")
    except ValueError:
        fallback = re.sub(r"[^0-9T]", "", received_datetime)
        fallback = fallback.replace("T", "_")
        return fallback[:15] or "unknown_date"


def _build_output_filename(original_name: str, datestamp: str, subject: str, duplicate_index: int) -> str:
    """Build sanitized filename as: name_datestamp_subject(.ext), with optional _N suffix."""
    original_path = Path(safe_filename(original_name))
    stem = original_path.stem or "attachment"
    suffix = original_path.suffix or ".bin"
    subject_part = safe_filename(subject)[:80]
    core = safe_filename(f"{stem}_{datestamp}_{subject_part}")

    if duplicate_index > 1:
        core = f"{core}_{duplicate_index}"

    return f"{core}{suffix}"


def _get_msal_app() -> msal.ConfidentialClientApplication:
    global _msal_app
    if _msal_app is None:
        _msal_app = msal.ConfidentialClientApplication(
            CLIENT_ID,
            authority=AUTHORITY,
            client_credential=CLIENT_SECRET,
        )
    return _msal_app


def get_token() -> str:
    result = _get_msal_app().acquire_token_for_client(scopes=SCOPE)
    if "access_token" not in result:
        error = result.get("error", "unknown")
        desc = result.get("error_description", "no description")
        raise RuntimeError(f"Token acquisition failed: {error} — {desc}")
    return result["access_token"]


def _graph_get(url: str, token: str) -> dict:
    import time
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.get(
                url,
                headers={"Authorization": f"Bearer {token}"},
                timeout=60,
            )
            if resp.status_code in (502, 503, 504) and attempt < max_retries:
                log.warning("Graph GET transient error %s. Retrying in %ds... (Attempt %d/%d)", 
                            resp.status_code, attempt * 2, attempt, max_retries)
                time.sleep(attempt * 2)
                continue

            if resp.status_code >= 400:
                log.error("Graph GET failed | status=%s | url=%s | body=%.500s",
                          resp.status_code, url, resp.text)
                resp.raise_for_status()
            return resp.json()
        except requests.exceptions.RequestException as e:
            if attempt == max_retries:
                raise
            log.warning("Graph GET failed with exception: %s. Retrying in %ds... (Attempt %d/%d)", 
                        e, attempt * 2, attempt, max_retries)
            time.sleep(attempt * 2)


def _graph_patch(url: str, token: str, payload: dict) -> None:
    resp = requests.patch(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()


def _fetch_all_unread_with_attachments(token: str) -> list[dict]:
    """Page through ALL unread messages that have attachments."""
    url = (
        f"{GRAPH}/users/{MAILBOX}/messages"
        "?$filter=isRead eq false and hasAttachments eq true"
        "&$select=id,subject,from,receivedDateTime"
        "&$top=50"
    )

    messages: list[dict] = []
    page = 1
    while url:
        log.debug("Fetching message page %d", page)
        data = _graph_get(url, token)
        batch = data.get("value", [])
        messages.extend(batch)
        log.debug("Page %d returned %d messages", page, len(batch))
        url = data.get("@odata.nextLink")
        page += 1

    messages.sort(key=lambda m: m.get("receivedDateTime") or "")
    return messages


def _fetch_attachment_bytes(msg_id: str, att_id: str, att_name: str, token: str) -> bytes | None:
    """Fetch a single attachment by its ID."""
    url = f"{GRAPH}/users/{MAILBOX}/messages/{msg_id}/attachments/{att_id}"
    data = _graph_get(url, token)
    raw = data.get("contentBytes")
    if not raw:
        log.error("contentBytes missing even on individual fetch | file=%s | att_id=%s", att_name, att_id)
        return None
    return base64.b64decode(raw)


async def download_invoice_attachments(start_time: float, processing_window_seconds: float) -> None:
    """Download all unread invoice attachments within the allowed window."""
    log.info("=" * 60)
    log.info("Invoice download run started")

    token = get_token()
    messages = _fetch_all_unread_with_attachments(token)

    log.info("Unread emails with attachments found: %d", len(messages))

    total_downloaded = 0
    total_skipped = 0
    total_failed = 0

    loop = asyncio.get_event_loop()

    if messages:
        for msg in messages:
            elapsed = loop.time() - start_time
            if elapsed >= processing_window_seconds:
                log.warning(
                    "Processing window expired (elapsed: %.1fs / %.1fs). "
                    "Skipping remaining emails.",
                    elapsed, processing_window_seconds,
                )
                break

            msg_id = msg["id"]
            subject = msg.get("subject") or "No Subject"
            sender = (msg.get("from") or {}).get("emailAddress", {}).get("address", "unknown")
            received = msg.get("receivedDateTime", "unknown")

            log.info("-" * 50)
            log.info("Email | from=%s | subject=%s | received=%s", sender, subject, received)

            token = get_token()

            try:
                att_list_url = (
                    f"{GRAPH}/users/{MAILBOX}/messages/{msg_id}/attachments"
                    "?$select=id,name,contentType,size,isInline"
                )
                attachments = _graph_get(att_list_url, token).get("value", [])
            except Exception as exc:
                log.error("Failed to list attachments | subject=%s | error=%s", subject, exc)
                total_failed += 1
                continue

            log.info("Attachments in this email: %d", len(attachments))

            per_message_name_count: dict[str, int] = {}
            msg_downloaded = 0
            msg_failed = 0
            msg_skipped = 0

            for att in attachments:
                att_type = att.get("@odata.type")
                if att_type and att_type != "#microsoft.graph.fileAttachment":
                    log.debug("Skipped (not a file attachment) | type=%s", att_type)
                    continue

                is_inline = att.get("isInline", False)
                if is_inline:
                    log.info("Skipped inline attachment (signature image/logo) | file=%s", att.get("name"))
                    continue

                att_id = att["id"]
                filename = safe_filename(att.get("name") or "attachment")
                att_size = att.get("size", 0)

                datestamp = _format_datestamp(received)
                unique_key = f"{Path(filename).stem.lower()}|{datestamp}|{safe_filename(subject).lower()}"
                per_message_name_count[unique_key] = per_message_name_count.get(unique_key, 0) + 1

                output_name = _build_output_filename(
                    original_name=filename,
                    datestamp=datestamp,
                    subject=subject,
                    duplicate_index=per_message_name_count[unique_key],
                )
                unread_filepath = UNREAD_DIR / output_name

                if unread_filepath.exists() or (READ_DIR / output_name).exists() or (NON_INVOICE_DIR / output_name).exists():
                    log.info("Already exists in staging folders, skipping download | file=%s", output_name)
                    msg_downloaded += 1
                    total_downloaded += 1
                    continue

                log.debug("Downloading to unread folder | file=%s | size=%d bytes", output_name, att_size)

                try:
                    content = _fetch_attachment_bytes(msg_id, att_id, filename, token)

                    if content is None:
                        msg_failed += 1
                        total_failed += 1
                        continue

                    with open(unread_filepath, "wb") as fh:
                        fh.write(content)

                    log.info("Downloaded to UNREAD | file=%s", unread_filepath)

                    if output_name.lower().endswith(".pdf"):
                        msg_downloaded += 1
                        total_downloaded += 1
                    else:
                        # Non-PDF: move to non_invoice directly
                        non_invoice_filepath = NON_INVOICE_DIR / output_name
                        shutil.move(str(unread_filepath), str(non_invoice_filepath))
                        log.info("Non-PDF file moved to non_invoice | file=%s", non_invoice_filepath)
                        
                        # Upload to Azure Blob Storage under 'non_invoice/'
                        from common.services.azure_blob import upload_file_to_blob, get_blob_name_from_path
                        blob_name = get_blob_name_from_path(str(non_invoice_filepath))
                        try:
                            upload_file_to_blob(str(non_invoice_filepath), blob_name)
                            log.info(f"Uploaded non-pdf file to Azure Blob: {blob_name}")
                        except Exception as upload_err:
                            log.error(f"Failed to upload non-pdf file to Azure Blob: {upload_err}")
                            
                        msg_skipped += 1
                        total_skipped += 1

                except Exception as exc:
                    log.error(
                        "Download failed | file=%s | from=%s | subject=%s | error=%s",
                        filename, sender, subject, exc,
                    )
                    msg_failed += 1
                    total_failed += 1

            if msg_failed > 0:
                log.warning(
                    "NOT marking as read (%d failures) — will retry next run | subject=%s",
                    msg_failed, subject,
                )
            else:
                try:
                    _graph_patch(
                        f"{GRAPH}/users/{MAILBOX}/messages/{msg_id}",
                        token,
                        {"isRead": True},
                    )
                    log.info("Marked as read | subject=%s | from=%s", subject, sender)
                except Exception as exc:
                    log.error("Failed to mark as read | subject=%s | error=%s", subject, exc)

    log.info("=" * 60)
    log.info(
        "Run complete | downloaded=%d | skipped=%d | failed=%d",
        total_downloaded, total_skipped, total_failed,
    )


async def main():
    try:
        from common.services.azure_blob import ensure_container_and_folders
        ensure_container_and_folders()
    except Exception as e:
        log.error(f"Failed to initialize Azure container/folders: {e}")
        sys.exit(1)

    interval_str = os.getenv("MAIL_DOWNLOAD_INTERVAL_MINUTES", "15")
    try:
        interval_minutes = float(interval_str)
    except ValueError:
        interval_minutes = 15.0

    margin_minutes = float(os.getenv("MAIL_DOWNLOAD_MARGIN_MINUTES", "4.0"))
    processing_window_seconds = max(0.0, (interval_minutes - margin_minutes) * 60.0)

    log.info(
        "Starting mail check | cycle=%.1f min | processing window=%.1f min | rest=%.1f min",
        interval_minutes, interval_minutes - margin_minutes, margin_minutes,
    )

    loop = asyncio.get_event_loop()
    interval_seconds = interval_minutes * 60.0

    while True:
        start_time = loop.time()

        try:
            await download_invoice_attachments(start_time, processing_window_seconds)
        except Exception as e:
            log.error("Unhandled error in download_invoice_attachments: %s", e)

        elapsed = loop.time() - start_time
        sleep_time = max(1.0, interval_seconds - elapsed)
        log.info(
            "Cycle finished (elapsed: %.1fs). Resting for %.1fs (%.2f min) before next run.",
            elapsed, sleep_time, sleep_time / 60.0,
        )
        await asyncio.sleep(sleep_time)


if __name__ == "__main__":
    asyncio.run(main())
