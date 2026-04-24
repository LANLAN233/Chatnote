import base64
import logging
import os

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

_ENCRYPTION_KEY: bytes | None = None


def _get_or_create_key() -> bytes:
    global _ENCRYPTION_KEY
    if _ENCRYPTION_KEY is not None:
        return _ENCRYPTION_KEY

    env_key = os.environ.get("ENCRYPTION_KEY", "")
    if env_key:
        try:
            key = base64.urlsafe_b64decode(env_key)
            if len(key) == 32:
                _ENCRYPTION_KEY = base64.urlsafe_b64encode(key)
                return _ENCRYPTION_KEY
        except Exception:
            pass

    # Fallback: generate a random key and log a warning
    raw_key = os.urandom(32)
    _ENCRYPTION_KEY = base64.urlsafe_b64encode(raw_key)
    masked = f"{_ENCRYPTION_KEY.decode()[:8]}...{_ENCRYPTION_KEY.decode()[-4:]}"
    logger.warning(
        f"ENCRYPTION_KEY not set or invalid. Using auto-generated key ({masked}). "
        "Data encrypted with this key will be unreadable after restart unless you persist the key."
    )
    return _ENCRYPTION_KEY


def encrypt(plain_text: str) -> str:
    if not plain_text:
        return ""
    key = _get_or_create_key()
    f = Fernet(key)
    return f.encrypt(plain_text.encode("utf-8")).decode("utf-8")


def decrypt(cipher_text: str) -> str:
    if not cipher_text:
        return ""
    key = _get_or_create_key()
    f = Fernet(key)
    return f.decrypt(cipher_text.encode("utf-8")).decode("utf-8")


def mask_key(key: str | None, visible_head: int = 3, visible_tail: int = 2) -> str:
    """Return a masked version of the key like sk-******3d"""
    if not key:
        return ""
    if len(key) <= visible_head + visible_tail:
        return "*" * len(key)
    return f"{key[:visible_head]}{'*' * max(4, len(key) - visible_head - visible_tail)}{key[-visible_tail:]}"
