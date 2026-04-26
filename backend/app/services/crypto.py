import base64
import logging
import os

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

_ENCRYPTION_KEY: bytes | None = None

# Path to persist auto-generated key (relative to project root)
_KEY_FILE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", ".encryption_key")


def _load_key_from_file() -> bytes | None:
    """Load a previously persisted encryption key from disk."""
    try:
        if os.path.exists(_KEY_FILE_PATH):
            with open(_KEY_FILE_PATH, "rb") as f:
                key = f.read().strip()
                # Validate it's a valid Fernet key (32 bytes raw, 44 bytes base64)
                decoded = base64.urlsafe_b64decode(key)
                if len(decoded) == 32:
                    return key
    except Exception:
        pass
    return None


def _save_key_to_file(key: bytes) -> None:
    """Persist the encryption key to disk so it survives restarts."""
    try:
        os.makedirs(os.path.dirname(_KEY_FILE_PATH), exist_ok=True)
        with open(_KEY_FILE_PATH, "wb") as f:
            f.write(key)
    except Exception as e:
        logger.warning("Failed to persist encryption key to %s: %s", _KEY_FILE_PATH, e)


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

    # Try to load a previously persisted key
    persisted = _load_key_from_file()
    if persisted:
        _ENCRYPTION_KEY = persisted
        logger.info("Loaded encryption key from %s", _KEY_FILE_PATH)
        return _ENCRYPTION_KEY

    # Final fallback: generate a random key and persist it
    raw_key = os.urandom(32)
    _ENCRYPTION_KEY = base64.urlsafe_b64encode(raw_key)
    _save_key_to_file(_ENCRYPTION_KEY)
    masked = f"{_ENCRYPTION_KEY.decode()[:8]}...{_ENCRYPTION_KEY.decode()[-4:]}"
    logger.warning(
        "ENCRYPTION_KEY not set. Auto-generated and persisted key (%s) to %s. "
        "For production, set the ENCRYPTION_KEY environment variable.",
        masked, _KEY_FILE_PATH,
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
