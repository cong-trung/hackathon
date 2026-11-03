import json
from pathlib import Path

from mail_sender import send_email

SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_DIR / "dummy_mail_config.json"
HTML_CONTENT = (
    "<html><body><h1>Dummy mail</h1><p>This is a test email.</p></body></html>"
)


def main():
    with CONFIG_PATH.open(encoding="utf-8") as config_file:
        config = json.load(config_file)

    send_email(config, str(SCRIPT_DIR), HTML_CONTENT)
    print("Dummy email sent successfully.")


if __name__ == "__main__":
    main()
