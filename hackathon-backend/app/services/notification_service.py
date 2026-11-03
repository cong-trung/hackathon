"""Email notifications to PdO owners and product groups when a PYPCS matrix submission becomes final."""

import argparse
import html
import logging
import re
import smtplib
import ssl
import sys
from collections.abc import Iterable
from email.message import EmailMessage
from urllib.parse import quote

from fastapi import HTTPException

from app.auth import validate_email
from app.config import (
    QUALITY_MATRIX_MAIL_FROM,
    QUALITY_MATRIX_MAIL_TRANSPORT,
    QUALITY_MATRIX_PUBLIC_URL,
    QUALITY_MATRIX_SMTP_HOST,
    QUALITY_MATRIX_SMTP_PASSWORD,
    QUALITY_MATRIX_SMTP_PORT,
    QUALITY_MATRIX_SMTP_STARTTLS,
    QUALITY_MATRIX_SMTP_USERNAME,
)
from app.io.csv_excel import value_to_str
from app.services.product_action_matrix_service import _group_for_module, _module_catalog

logger = logging.getLogger(__name__)

PDO_OWNER_QUESTION_ID = "pdo_owner"
PRODUCT_GROUP_EMAIL_QUESTION_ID = "product_group_email"
SMTP_TIMEOUT_SECONDS = 10


def _valid_address(value: str) -> str | None:
    try:
        email = validate_email(value)
    except HTTPException:
        return None
    if not email or "\r" in email or "\n" in email:
        return None
    return email


def collect_pdo_owner_groups(
    cells: Iterable[dict[str, str]],
) -> dict[str, tuple[str, list[str]]]:
    """Map each unique owner email (casefolded) to its display email and module groups."""
    by_key, _ = _module_catalog()
    recipients: dict[str, tuple[str, list[str]]] = {}
    for cell in cells:
        if value_to_str(cell.get("question_id", "")) != PDO_OWNER_QUESTION_ID:
            continue
        module_key = value_to_str(cell.get("module_key", "")).strip()
        if not module_key:
            continue
        group = _group_for_module(module_key, by_key)
        for raw in re.split(r"[;,|\s]+", value_to_str(cell.get("answer", ""))):
            raw = raw.strip()
            if not raw:
                continue
            email = _valid_address(raw)
            if not email:
                logger.warning("Skipping invalid PdO owner email for module group %s.", group)
                continue
            display, groups = recipients.setdefault(email.casefold(), (email, []))
            if group not in groups:
                groups.append(group)
    return recipients


def collect_notification_recipients(
    cells: list[dict[str, str]],
    selected_modules: list[str],
) -> dict[str, tuple[str, list[str]]]:
    """Merge PdO owners (their module groups) with the product group email (all module groups)."""
    by_key, _ = _module_catalog()
    recipients = collect_pdo_owner_groups(cells)
    all_groups = list(dict.fromkeys(_group_for_module(module, by_key) for module in selected_modules))
    for cell in cells:
        if value_to_str(cell.get("question_id", "")) != PRODUCT_GROUP_EMAIL_QUESTION_ID:
            continue
        email = _valid_address(value_to_str(cell.get("answer", "")).strip())
        if not email:
            continue
        display, groups = recipients.setdefault(email.casefold(), (email, []))
        for group in all_groups:
            if group not in groups:
                groups.append(group)
    return recipients


def _review_url(group: str) -> str:
    return f"{QUALITY_MATRIX_PUBLIC_URL}/quality-product-matrix?module={quote(group, safe='')}"


def build_final_submission_messages(
    *,
    recipients: dict[str, tuple[str, list[str]]],
    product_name: str,
    prodgroup3: str,
    submitter_username: str,
    submitter_display_name: str,
    submitter_email: str,
) -> list[tuple[str, EmailMessage]]:
    if submitter_email and ("\r" in submitter_email or "\n" in submitter_email):
        raise ValueError("Sender address must not contain line breaks.")
    submitter_email = _valid_address(submitter_email) or ""
    sender = submitter_email or QUALITY_MATRIX_MAIL_FROM
    if not submitter_email:
        logger.info("No submitter email; using default sender %s.", sender)
    submitter = submitter_username.strip() or submitter_display_name.strip() or "A user"
    subject = " ".join(
        f"[Quality Matrix] {submitter} submitted {product_name} ({prodgroup3}) for review".split()
    )
    open_url = f"{QUALITY_MATRIX_PUBLIC_URL}/quality-product-matrix"
    intro = (
        f"{submitter} has submitted Product Info for product {product_name} "
        f"(ProdGroup3: {prodgroup3})."
    )
    footer = "This is an automated message from Quality Matrix."
    if submitter_email:
        footer += f" Reply to contact {submitter}."

    messages = []
    for email_address, module_groups in recipients.values():
        links = [(group, _review_url(group)) for group in module_groups]
        text_body = "\n".join(
            [
                "Hello,",
                "",
                intro,
                "Please review it in the Quality Product Matrix:",
                "",
                *(f"- {group}: {url}" for group, url in links),
                "",
                f"Open Quality Matrix: {open_url}",
                "",
                footer,
            ]
        ) + "\n"
        html_items = "".join(
            f'<li><a href="{html.escape(url, quote=True)}">'
            f"Quality Product Matrix \u2013 {html.escape(group)}</a></li>"
            for group, url in links
        )
        html_footer = "This is an automated message from Quality Matrix."
        if submitter_email:
            html_footer += f" Reply to contact <strong>{html.escape(submitter)}</strong>."
        html_body = (
            "<p>Hello,</p>"
            f"<p><strong>{html.escape(submitter)}</strong> has submitted Product Info "
            f"for product {html.escape(product_name)} "
            f"(ProdGroup3: {html.escape(prodgroup3)}).</p>"
            "<p>Please review it in the Quality Product Matrix:</p>"
            f"<ul>{html_items}</ul>"
            f'<p><a href="{html.escape(open_url, quote=True)}">Open Quality Matrix</a></p>'
            f"<p>{html_footer}</p>"
        )
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = sender
        message["To"] = email_address
        if submitter_email:
            message["Reply-To"] = submitter_email
        message.set_content(text_body)
        message.add_alternative(html_body, subtype="html")
        messages.append((email_address, message))
    return messages


def _log_mail(recipient: str, message: EmailMessage) -> str:
    body = message.get_body(preferencelist=("plain",)).get_content()
    logger.warning(
        "Quality Matrix mail (log mode, not sent)\nTo: %s\nFrom: %s\nSubject: %s\n\n%s",
        recipient,
        message["From"],
        message["Subject"],
        body,
    )
    return "log"


def _deliver_outlook(recipient: str, message: EmailMessage) -> str:
    try:
        import pythoncom
        from win32com import client as win32_client
    except ImportError:
        logger.error(
            "Outlook mail transport needs pywin32 and desktop Outlook; install pywin32 or set "
            "QUALITY_MATRIX_MAIL_TRANSPORT=log. Logging this mail instead of sending it."
        )
        return _log_mail(recipient, message)
    # BackgroundTasks run in a worker thread, which needs COM initialized per thread.
    pythoncom.CoInitialize()
    try:
        outlook = win32_client.Dispatch("Outlook.Application")
        mail = outlook.CreateItem(0)
        mail.To = recipient
        mail.Subject = message["Subject"]
        mail.HTMLBody = message.get_body(preferencelist=("html",)).get_content()
        reply_to = message["Reply-To"]
        if reply_to:
            mail.ReplyRecipients.Add(reply_to)
        mail.Send()
    finally:
        pythoncom.CoUninitialize()
    return "outlook"


def _deliver_smtp(recipient: str, message: EmailMessage) -> str:
    with smtplib.SMTP(
        QUALITY_MATRIX_SMTP_HOST, QUALITY_MATRIX_SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS
    ) as smtp:
        if QUALITY_MATRIX_SMTP_STARTTLS:
            smtp.starttls(context=ssl.create_default_context())
        if QUALITY_MATRIX_SMTP_USERNAME:
            smtp.login(QUALITY_MATRIX_SMTP_USERNAME, QUALITY_MATRIX_SMTP_PASSWORD)
        smtp.send_message(message, to_addrs=[recipient])
    return "smtp"


def _deliver(recipient: str, message: EmailMessage) -> str:
    """Send one message via the configured transport and return the transport used."""
    if QUALITY_MATRIX_MAIL_TRANSPORT == "outlook":
        return _deliver_outlook(recipient, message)
    if QUALITY_MATRIX_MAIL_TRANSPORT == "smtp" and QUALITY_MATRIX_SMTP_HOST:
        return _deliver_smtp(recipient, message)
    return _log_mail(recipient, message)


def _deliver_with_sender_fallback(recipient: str, message: EmailMessage) -> str:
    """Retry once with the configured sender when the relay refuses the submitter's From."""
    try:
        return _deliver(recipient, message)
    except smtplib.SMTPSenderRefused as exc:
        if message["From"] == QUALITY_MATRIX_MAIL_FROM:
            raise
        logger.warning(
            "SMTP relay refused sender %s (%s); retrying with %s as From (Reply-To unchanged).",
            message["From"],
            exc.smtp_code,
            QUALITY_MATRIX_MAIL_FROM,
        )
        message.replace_header("From", QUALITY_MATRIX_MAIL_FROM)
        return _deliver(recipient, message)


def notify_final_submission(
    *,
    submission_id: str,
    cells: list[dict[str, str]],
    selected_modules: list[str],
    product_name: str,
    prodgroup3: str,
    submitter_username: str,
    submitter_display_name: str,
    submitter_email: str,
) -> None:
    """Background-task entry point; logs and swallows every failure."""
    try:
        recipients = collect_notification_recipients(cells, selected_modules)
        messages = build_final_submission_messages(
            recipients=recipients,
            product_name=product_name,
            prodgroup3=prodgroup3,
            submitter_username=submitter_username,
            submitter_display_name=submitter_display_name,
            submitter_email=submitter_email,
        )
    except Exception:
        logger.exception("Could not build final-submission notifications for %s.", submission_id)
        return
    logger.info(
        "Final-submission notification for %s: %d recipient(s) via %s",
        submission_id,
        len(messages),
        QUALITY_MATRIX_MAIL_TRANSPORT,
    )
    if not messages:
        logger.warning("Final-submission notification for %s: no valid PdO owner or product group emails.", submission_id)
        return
    for recipient, message in messages:
        try:
            transport = _deliver_with_sender_fallback(recipient, message)
        except Exception:
            logger.exception("Failed to send final-submission notification for %s.", submission_id)
            continue
        if transport != "log":
            logger.info("Sent final-submission notification for %s to %s via %s.", submission_id, recipient, transport)


def _send_test(recipient: str) -> int:
    message = EmailMessage()
    message["Subject"] = "[Quality Matrix] Mail transport test"
    message["From"] = QUALITY_MATRIX_MAIL_FROM
    message["To"] = recipient
    message.set_content("This is a test message from the Quality Matrix backend. No action is needed.\n")
    host = f"{QUALITY_MATRIX_SMTP_HOST}:{QUALITY_MATRIX_SMTP_PORT}" if QUALITY_MATRIX_SMTP_HOST else "(none)"
    print(f"Transport: {QUALITY_MATRIX_MAIL_TRANSPORT}")
    print(f"SMTP host:port: {host}")
    try:
        transport = _deliver(recipient, message)
    except Exception as exc:
        print(f"Result: FAILED to send to {recipient}: {type(exc).__name__}: {exc}")
        return 1
    if transport == "log":
        print(f"Result: NOT sent to {recipient}; transport is log (see log output above).")
        return 1
    print(f"Result: sent to {recipient} via {transport}.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Send a Quality Matrix test email through the configured transport.")
    parser.add_argument("--test-to", required=True, metavar="EMAIL", help="recipient address")
    args = parser.parse_args(argv)
    recipient = _valid_address(args.test_to)
    if not recipient:
        print(f"Result: invalid recipient address: {args.test_to}")
        return 1
    return _send_test(recipient)


if __name__ == "__main__":
    sys.exit(main())
