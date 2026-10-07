import asyncio
import logging
import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from common.database.database import SessionLocal
from common.models.db_models import Invoice, InvoiceAssignedApprover, User, WorkflowStep, InvoiceStatusEnum
from common.utils.settings import get_app_settings
from common.utils.date_utils import get_ist_now
from common.routes.approval_new import (
    _steps_for_invoice,
    _get_current_cycle_steps,
    _parse_list,
    _get_finance_users,
    _record_step
)
from common.services.email_service import email_service

logger = logging.getLogger("app")

async def check_approval_reminders():
    db = SessionLocal()
    try:
        settings_data = get_app_settings(db)
        reminder_days = settings_data.get("reminder_days", 3)
        try:
            reminder_days = int(reminder_days)
        except (ValueError, TypeError):
            reminder_days = 3

        if reminder_days <= 0:
            return

        now = get_ist_now()
        # Optimization: filter to invoices that were last updated at least reminder_days ago.
        cutoff = now - timedelta(days=reminder_days)

        invoices = db.query(Invoice).filter(
            Invoice.status == InvoiceStatusEnum.WAITING_APPROVAL,
            Invoice.updated_at <= cutoff
        ).all()
        
        for invoice in invoices:
            try:
                # Find last action time
                steps = _steps_for_invoice(db, invoice.id)
                current_cycle_steps = _get_current_cycle_steps(steps)
                
                if current_cycle_steps:
                    non_reminder_steps = [s for s in current_cycle_steps if s.step_type != "reminder"]
                    if non_reminder_steps:
                        last_action_time = non_reminder_steps[-1].timestamp
                    else:
                        last_action_time = invoice.uploaded_at
                else:
                    last_action_time = invoice.uploaded_at

                elapsed = now - last_action_time
                if elapsed.total_seconds() < reminder_days * 86400:
                    continue

                # Check if already reminded within the reminder interval (max once a day, or more frequently if reminder_days is less than 1 day)
                already_reminded = False
                for s in current_cycle_steps:
                    if s.step_type == "reminder" and s.approver_number == invoice.current_approver_level:
                        if (now - s.timestamp).total_seconds() < min(24 * 3600, reminder_days * 86400):
                            already_reminded = True
                            break

                if already_reminded:
                    continue

                # Identify currently assigned approver emails
                assigned_approvers = db.query(InvoiceAssignedApprover).filter(
                    InvoiceAssignedApprover.invoice_id == invoice.id,
                    InvoiceAssignedApprover.sequence_order == invoice.current_approver_level
                ).all()

                if not assigned_approvers:
                    continue

                emails = []
                is_finance = False
                for a in assigned_approvers:
                    if a.is_finance:
                        is_finance = True
                    if a.approver_email:
                        emails.append(a.approver_email.strip())

                if is_finance:
                    finance_emails = _get_finance_users(db, invoice.entity)
                    emails = list(set(emails) | set(finance_emails))

                # Exclude who has already approved in current cycle
                already_acted_emails = {
                    s.user.lower() for s in current_cycle_steps
                    if s.user and s.step_type in {
                        "approved", "level_approved", "threshold_approved", "posting_approved"
                    }
                }

                pending_emails = [e for e in emails if e.lower() not in already_acted_emails]
                if not pending_emails:
                    continue

                logger.info(f"[Reminders] Sending approval reminders for invoice {invoice.id} to: {pending_emails}")
                
                # Fetch amount and currency
                from common.routes.workflow import get_invoice_total_from_invoice
                total_amount = get_invoice_total_from_invoice(db, invoice.id)

                extracted_data = {}
                if invoice.extracted_data:
                    try:
                        extracted_data = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
                    except:
                        pass
                currency = extracted_data.get("invoice_details", {}).get("currency", {}).get("value", "USD")

                # Send emails
                for email in pending_emails:
                    if not email:
                        continue
                    approver_user = db.query(User).filter(User.email == email).first()
                    approver_name = approver_user.username if approver_user else "Approver"

                    email_service.send_approval_reminder_email(
                        email=email,
                        username=approver_name,
                        vendor_name=invoice.vendor_name or "Unknown",
                        invoice_number=invoice.invoice_number or "N/A",
                        amount=str(total_amount),
                        currency=currency,
                        pending_days=reminder_days
                    )

                # Record reminder step
                _record_step(
                    db=db,
                    invoice_id=invoice.id,
                    step_name="Approval Reminder",
                    step_type="reminder",
                    user_email="system",
                    status="sent",
                    approver_number=invoice.current_approver_level,
                    comment=f"Reminder email sent to pending approvers: {', '.join(pending_emails)}",
                    entity=invoice.entity
                )
                db.commit()

            except Exception as inv_err:
                logger.error(f"[Reminders] Error processing reminders for invoice {invoice.id}: {inv_err}")
                db.rollback()

    except Exception as e:
        logger.error(f"[Reminders] Error checking approval reminders: {e}")
    finally:
        db.close()


async def start_reminder_scheduler():
    logger.info("[Reminders] Starting approval reminder background loop...")
    while True:
        try:
            await check_approval_reminders()
        except Exception as err:
            logger.error(f"[Reminders] Error in reminder scheduler: {err}")
        # Run check every 1 hour (3600 seconds)
        await asyncio.sleep(3600)
