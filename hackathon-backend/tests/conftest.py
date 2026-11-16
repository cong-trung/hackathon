import pytest

TEST_MAIL_DOMAINS = frozenset({"example.com", "intel.com"})


@pytest.fixture(autouse=True)
def _test_mail_settings(monkeypatch):
    """Log-only mail transport and test domains; tests needing other values override them."""
    import app.config as config
    import app.services.notification_service as notification_service

    for module in (config, notification_service):
        monkeypatch.setattr(module, "QUALITY_MATRIX_MAIL_TRANSPORT", "log")
    monkeypatch.setattr(config, "QUALITY_MATRIX_MAIL_ALLOWED_DOMAINS", TEST_MAIL_DOMAINS)
