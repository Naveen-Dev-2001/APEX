import os
import sys
import logging
import logging.handlers
import asyncio
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ---------------------------------------------------------------------------
# Logging — writes to both console (INFO)
# ---------------------------------------------------------------------------

def _setup_logging() -> logging.Logger:
    logger = logging.getLogger("email_reminder")
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)

    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console output (INFO)
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)

    # File output (INFO) - Appends to email_reminder.log
    fh = logging.FileHandler(
        "email_reminder.log",
        encoding="utf-8",
    )
    fh.setLevel(logging.INFO)
    fh.setFormatter(fmt)

    logger.addHandler(ch)
    logger.addHandler(fh)

    # Also attach the same handlers to the "app" logger
    # so logs from common.utils.reminders (which use getLogger("app")) are captured
    app_logger = logging.getLogger("app")
    app_logger.setLevel(logging.INFO)
    app_logger.addHandler(ch)
    app_logger.addHandler(fh)

    return logger

log = _setup_logging()

async def main():
    log.info("=" * 60)
    log.info("Approval reminder job started")
    
    try:
        from common.utils.reminders import check_approval_reminders
        await check_approval_reminders()
        log.info("Approval reminder job completed successfully")
    except Exception as e:
        log.error("Unhandled error in check_approval_reminders: %s", e, exc_info=True)
        sys.exit(1)
    log.info("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
