#!/usr/bin/env python3

import os
import smtplib
import socket
from email import encoders
from email.mime.application import MIMEApplication
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def send_email(config, exe_dir, html_content, hostname=None):
    """
    Send email alert using SMTP

    Args:
        config (dict): Configuration dictionary containing recipients and smtp_server
        html_content (str): HTML content for the email body
        hostname (str): Hostname for the email (optional, uses system hostname if not provided)

    Returns:
        bool: True if email sent successfully

    Raises:
        Exception: If email sending fails
    """
    smtp_client = None

    try:
        # Get hostname if not provided
        if hostname is None:
            hostname = socket.gethostname()

        # Extract configuration
        recipients = config.get("recipients", [])
        attachments = config.get("attachments", [])
        subject = config.get("subject")
        smtp_server = "SMTP.intel.com"

        # Validate recipients
        if not recipients:
            raise ValueError("No recipients configured")

        # Create SMTP client
        smtp_client = smtplib.SMTP(smtp_server)

        # Create email message
        msg = MIMEMultipart("mixed")
        msg["From"] = f"{hostname}@intel.com"
        msg["Subject"] = f"{subject} {str(hostname).upper()}"

        # Add recipients
        valid_recipients = [r.strip() for r in recipients if r.strip()]
        if not valid_recipients:
            raise ValueError("No valid recipients found")

        msg["To"] = ", ".join(valid_recipients)

        # Add HTML content
        html_part = MIMEText(html_content, "html", "utf-8")
        msg.attach(html_part)

        # Add attachments if provided
        if len(attachments) > 0:
            for path in attachments:
                file_path = os.path.join(exe_dir, path)
                if os.path.exists(file_path):
                    print(file_path)
                    filename = os.path.basename(file_path)
                    file_extension = os.path.splitext(filename)[1].lower()

                    with open(file_path, "rb") as attachment_file:
                        if file_extension == ".pdf":
                            # Handle PDF files specifically
                            part = MIMEApplication(
                                attachment_file.read(), _subtype="pdf"
                            )
                            part.add_header(
                                "Content-Disposition",
                                f'attachment; filename="{filename}"',
                            )
                        else:
                            # Handle other file types
                            part = MIMEBase("application", "octet-stream")
                            part.set_payload(attachment_file.read())
                            encoders.encode_base64(part)
                            part.add_header(
                                "Content-Disposition",
                                f'attachment; filename="{filename}"',
                            )

                    msg.attach(part)

        # Send email
        smtp_client.send_message(msg, to_addrs=valid_recipients)

        return True

    except Exception as e:
        raise Exception(f"Failed to send email: {e!s}")

    finally:
        if smtp_client:
            try:
                smtp_client.quit()
            except:
                pass
