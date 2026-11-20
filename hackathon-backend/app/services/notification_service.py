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
    is_allowed_email_domain,
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
from app.services.pypcs_service import canonical_module_key
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


def _recipient_address(value: str) -> str | None:
    """Valid, allowed recipient address, or None (disallowed addresses are logged and dropped)."""
    email = _valid_address(value)
    if email and not is_allowed_email_domain(email):
        logger.warning("Skipping recipient %s: domain is not in QUALITY_MATRIX_MAIL_ALLOWED_DOMAINS.", email)
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
            email = _recipient_address(raw)
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
        for raw in re.split(r"[;,|\s]+", value_to_str(cell.get("answer", ""))):
            email = _recipient_address(raw.strip())
            if not email:
                continue
            display, groups = recipients.setdefault(email.casefold(), (email, []))
            for group in all_groups:
                if group not in groups:
                    groups.append(group)
    return recipients


def _resolve_sender(submitter_email: str) -> tuple[str, str]:
    """Return (From, Reply-To). From is always the configured sender; the submitter is only Reply-To."""
    if submitter_email and ("\r" in submitter_email or "\n" in submitter_email):
        raise ValueError("Sender address must not contain line breaks.")
    valid = _valid_address(submitter_email) or ""
    if not valid:
        logger.info("No submitter email; Reply-To omitted.")
    return QUALITY_MATRIX_MAIL_FROM, valid


def build_final_submission_messages(
    *,
    recipients: dict[str, tuple[str, list[str]]],
    product_name: str,
    prodgroup3: str,
    submitter_username: str,
    submitter_display_name: str,
    submitter_email: str,
) -> list[tuple[str, EmailMessage]]:
    sender, submitter_email = _resolve_sender(submitter_email)
    subject = " ".join(
        f"New Product Final Submission \u2013 {product_name} ({prodgroup3}) for ICMPCS Set up and Quality Matrix review".split()
    )
    submitted_url = f"{QUALITY_MATRIX_PUBLIC_URL}/"
    matrix_url = f"{QUALITY_MATRIX_PUBLIC_URL}/quality-product-matrix"
    text_body = "\n".join(
        [
            "Hi Team,",
            "",
            f"The Product Info for {product_name} (ProdGroup3: {prodgroup3}) has been finalized "
            f"and submitted at: {submitted_url}",
            "",
            "Please:",
            "",
            "1. Go to ICMPCS app for NPI setup : goto/icmpcsapp.",
            f"2. Review quality matrix at: Quality matrix ({matrix_url})",
            "",
            "Thank you.",
        ]
    ) + "\n"
    html_body = (
        "<p>Hi Team,</p>"
        f"<p>The Product Info for {html.escape(product_name)} "
        f"(ProdGroup3: {html.escape(prodgroup3)}) has been finalized and submitted at: "
        f'<a href="{html.escape(submitted_url, quote=True)}">{html.escape(submitted_url)}</a></p>'
        "<p>Please:</p>"
        "<ol>"
        "<li>Go to ICMPCS app for NPI setup : goto/icmpcsapp.</li>"
        f'<li>Review quality matrix at: <a href="{html.escape(matrix_url, quote=True)}">'
        f"Quality matrix</a> ({html.escape(matrix_url)})</li>"
        "</ol>"
        "<p>Thank you.</p>"
    )
    messages = []
    for email_address, _module_groups in recipients.values():
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
            transport = _deliver(recipient, message)
        except Exception:
            logger.exception("Failed to send final-submission notification for %s.", submission_id)
            continue
        if transport != "log":
            logger.info("Sent final-submission notification for %s to %s via %s.", submission_id, recipient, transport)


def collect_pdo_owner_modules(
    cells: Iterable[dict[str, str]],
) -> dict[str, tuple[str, list[str]]]:
    """Map each PdO owner email (casefolded) to its display address and canonical module keys."""
    recipients: dict[str, tuple[str, list[str]]] = {}
    for cell in cells:
        if value_to_str(cell.get("question_id", "")) != PDO_OWNER_QUESTION_ID:
            continue
        module_key = canonical_module_key(cell.get("module_key", ""))
        if not module_key:
            continue
        for raw in re.split(r"[;,|\s]+", value_to_str(cell.get("answer", ""))):
            email = _recipient_address(raw.strip())
            if not email:
                continue
            display, modules = recipients.setdefault(email.casefold(), (email, []))
            if module_key not in modules:
                modules.append(module_key)
    return recipients


def _product_info_url(submission_id: str, module_key: str) -> str:
    return (
        f"{QUALITY_MATRIX_PUBLIC_URL}/product-info"
        f"?submission={quote(submission_id, safe='')}&module={quote(module_key, safe='')}"
    )


def build_waiting_me_messages(
    *,
    recipients: dict[str, tuple[str, list[str]]],
    submission_id: str,
    product_name: str,
    prodgroup3: str,
    submitter_username: str,
    submitter_email: str,
) -> list[tuple[str, EmailMessage]]:
    sender, reply_to = _resolve_sender(submitter_email)
    submitter = submitter_username.strip() or "A user"
    subject = " ".join(
        f"[Quality Matrix] {submitter} needs ME input for {product_name} ({prodgroup3})".split()
    )
    general_url = f"{QUALITY_MATRIX_PUBLIC_URL}/product-info"
    intro = (
        f"{submitter} has submitted the TI part of Product Info for product {product_name} "
        f"(ProdGroup3: {prodgroup3}). Please complete the ME fields for your module(s):"
    )
    footer = "This is an automated message from Quality Matrix."
    if reply_to:
        footer += f" Reply to contact {submitter}."

    messages = []
    for email_address, modules in recipients.values():
        links = [(module, _product_info_url(submission_id, module)) for module in modules]
        text_body = "\n".join(
            [
                "Hello,",
                "",
                intro,
                *(f"- {module}: {url}" for module, url in links),
                "",
                f"Open Product Info: {general_url}",
                "",
                footer,
            ]
        ) + "\n"
        html_items = "".join(
            f'<li><a href="{html.escape(url, quote=True)}">'
            f"Product Info \u2013 {html.escape(module)}</a></li>"
            for module, url in links
        )
        html_footer = "This is an automated message from Quality Matrix."
        if reply_to:
            html_footer += f" Reply to contact <strong>{html.escape(submitter)}</strong>."
        html_body = (
            "<p>Hello,</p>"
            f"<p><strong>{html.escape(submitter)}</strong> has submitted the TI part of "
            f"Product Info for product {html.escape(product_name)} "
            f"(ProdGroup3: {html.escape(prodgroup3)}). Please complete the ME fields "
            "for your module(s):</p>"
            f"<ul>{html_items}</ul>"
            f'<p><a href="{html.escape(general_url, quote=True)}">Open Product Info</a></p>'
            f"<p>{html_footer}</p>"
        )
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = sender
        message["To"] = email_address
        if reply_to:
            message["Reply-To"] = reply_to
        message.set_content(text_body)
        message.add_alternative(html_body, subtype="html")
        messages.append((email_address, message))
    return messages


def notify_waiting_me_submission(
    *,
    submission_id: str,
    cells: list[dict[str, str]],
    product_name: str,
    prodgroup3: str,
    submitter_username: str,
    submitter_email: str,
) -> None:
    """Background-task entry point: emails each PdO owner their ME modules. Never raises."""
    try:
        recipients = collect_pdo_owner_modules(cells)
        if not recipients:
            logger.warning(
                "Waiting-for-ME notification for %s: no valid PdO owner emails; nobody was notified.",
                submission_id,
            )
            return
        messages = build_waiting_me_messages(
            recipients=recipients,
            submission_id=submission_id,
            product_name=product_name,
            prodgroup3=prodgroup3,
            submitter_username=submitter_username,
            submitter_email=submitter_email,
        )
    except Exception:
        logger.exception("Could not build waiting-for-ME notifications for %s.", submission_id)
        return
    logger.info(
        "Waiting-for-ME notification for %s: %d recipient(s) via %s",
        submission_id,
        len(messages),
        QUALITY_MATRIX_MAIL_TRANSPORT,
    )
    for recipient, message in messages:
        try:
            transport = _deliver(recipient, message)
        except Exception:
            logger.exception("Failed to send waiting-for-ME notification for %s.", submission_id)
            continue
        if transport != "log":
            logger.info("Sent waiting-for-ME notification for %s to %s via %s.", submission_id, recipient, transport)


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
