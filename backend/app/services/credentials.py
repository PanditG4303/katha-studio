from __future__ import annotations

import json
import logging
from typing import Any

from ..config import KEYRING_SERVICE

logger = logging.getLogger(__name__)


class CredentialError(RuntimeError):
    pass


def _keyring():
    try:
        import keyring
        from keyring.errors import KeyringError
    except Exception as exc:  # pragma: no cover - environment dependent
        raise CredentialError("Secure credential storage is unavailable on this computer.") from exc
    try:
        backend = keyring.get_keyring()
        name = backend.__class__.__name__
        if "fail" in name.lower():
            raise CredentialError("Windows Credential Manager is not available.")
        return keyring
    except CredentialError:
        raise
    except Exception as exc:  # pragma: no cover
        raise CredentialError(f"Secure credential storage could not be opened: {exc}") from exc


def set_secret(name: str, value: str) -> None:
    if not value:
        raise CredentialError("A credential value is required.")
    try:
        _keyring().set_password(KEYRING_SERVICE, name, value)
    except Exception as exc:
        logger.exception("Credential save failed for %s", name)
        raise CredentialError(
            "Could not save the credential in Windows Credential Manager. "
            "Check that the Windows Credential Manager service is available."
        ) from exc


def get_secret(name: str) -> str | None:
    try:
        return _keyring().get_password(KEYRING_SERVICE, name)
    except Exception:
        logger.exception("Credential read failed for %s", name)
        return None


def delete_secret(name: str) -> None:
    try:
        keyring = _keyring()
        try:
            keyring.delete_password(KEYRING_SERVICE, name)
        except Exception as exc:
            if exc.__class__.__name__ != "PasswordDeleteError":
                raise
    except Exception:
        logger.exception("Credential delete failed for %s", name)


def has_secret(name: str) -> bool:
    return bool(get_secret(name))


def set_json_secret(name: str, value: dict[str, Any]) -> None:
    set_secret(name, json.dumps(value))


def get_json_secret(name: str) -> dict[str, Any] | None:
    raw = get_secret(name)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def credential_status(name: str) -> str:
    try:
        return "configured" if get_secret(name) else "not_configured"
    except CredentialError:
        return "unavailable"
