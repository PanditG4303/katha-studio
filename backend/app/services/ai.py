from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy.orm import Session

from ..database import utcnow
from ..models import Provider
from . import credentials

logger = logging.getLogger(__name__)


class AIError(RuntimeError):
    pass


class AINotConfigured(AIError):
    pass


@dataclass
class ProviderSettings:
    provider: str
    label: str
    base_url: str
    models_url: str
    default_model: str
    api_key: str | None
    config: dict


def get_provider_row(db: Session, name: str) -> Provider:
    row = db.query(Provider).filter(Provider.provider == name).first()
    if not row:
        raise AIError(f"The {name} provider is not available.")
    return row


def resolve_provider(db: Session, name: str | None) -> ProviderSettings:
    if not name:
        row = db.query(Provider).filter(Provider.provider == "zen", Provider.enabled.is_(True)).first()
        if not row:
            row = db.query(Provider).filter(Provider.enabled.is_(True)).first()
    else:
        row = db.query(Provider).filter(Provider.provider == name).first()
    if not row:
        raise AINotConfigured("Select an AI provider in Connections.")
    if name in {"zen", "openrouter", "elevenlabs"} or row.credential_ref:
        key = credentials.get_secret(row.credential_ref) if row.credential_ref else None
        if not key:
            raise AINotConfigured(f"{row.label} is not connected. Add its API key in Connections & Settings.")
    else:
        key = None
    return ProviderSettings(
        provider=row.provider,
        label=row.label,
        base_url=row.base_url.rstrip("/"),
        models_url=row.models_url,
        default_model=row.default_model,
        api_key=key,
        config=row.config or {},
    )


def _extract_models(payload: Any) -> list[dict]:
    raw = []
    if isinstance(payload, dict):
        raw = payload.get("data") or payload.get("models") or []
    elif isinstance(payload, list):
        raw = payload
    models = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id") or item.get("model") or item.get("name")
        if not model_id:
            continue
        pricing = item.get("pricing") or {}
        input_price = pricing.get("prompt") if isinstance(pricing, dict) else None
        free = False
        try:
            if input_price is not None:
                free = float(input_price) == 0
        except (TypeError, ValueError):
            pass
        if "free" in str(model_id).lower():
            free = True
        models.append(
            {
                "id": str(model_id),
                "name": item.get("name") or str(model_id),
                "context_length": item.get("context_length") or item.get("context_window"),
                "pricing": pricing,
                "free": free,
            }
        )
    models.sort(key=lambda m: (not m["free"], m["id"]))
    return models


def list_models(db: Session, provider_name: str) -> dict:
    provider = resolve_provider(db, provider_name)
    if not provider.api_key:
        raise AINotConfigured(f"Connect {provider.label} before loading its models.")
    if not provider.models_url:
        raise AIError(f"{provider.label} does not expose a model catalogue.")
    headers = {"Authorization": f"Bearer {provider.api_key}", "Accept": "application/json"}
    if provider.provider == "openrouter":
        headers["HTTP-Referer"] = "https://katha.studio"
        headers["X-Title"] = "Katha Studio"
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            response = client.get(provider.models_url, headers=headers)
        if response.status_code >= 400:
            raise AIError(_http_error(provider.label, response))
        models = _extract_models(response.json())
    except httpx.HTTPError as exc:
        raise AIError(f"Could not reach {provider.label}: {exc}") from exc
    return {"provider": provider.provider, "models": models, "count": len(models)}


def test_provider(db: Session, provider_name: str) -> dict:
    row = get_provider_row(db, provider_name)
    try:
        if provider_name == "windows_sapi":
            from .tts import windows_voices

            voices = windows_voices()
            row.status = "connected"
            row.last_tested_at = utcnow()
            row.last_error = ""
            db.commit()
            return {
                "ok": True,
                "message": f"Windows local speech is available with {len(voices)} installed voice(s).",
                "voices": voices,
            }
        if provider_name == "elevenlabs":
            provider = resolve_provider(db, "elevenlabs")
            with httpx.Client(timeout=30) as client:
                response = client.get(
                    f"{provider.base_url}/user",
                    headers={"xi-api-key": provider.api_key or ""},
                )
            if response.status_code >= 400:
                raise AIError(_http_error("ElevenLabs", response))
            data = response.json()
            subscription = data.get("subscription") or {}
            row.status = "connected"
            row.last_tested_at = utcnow()
            row.last_error = ""
            db.commit()
            return {
                "ok": True,
                "message": "Connected to ElevenLabs.",
                "account": {
                    "tier": subscription.get("tier"),
                    "character_count": subscription.get("character_count"),
                    "character_limit": subscription.get("character_limit"),
                    "can_extend_character_limit": subscription.get("can_extend_character_limit"),
                },
            }
        models = list_models(db, provider_name)
        provider = resolve_provider(db, provider_name)
        row.status = "connected"
        row.last_tested_at = utcnow()
        row.last_error = ""
        if not row.default_model and models["models"]:
            row.default_model = models["models"][0]["id"]
        db.commit()
        return {
            "ok": True,
            "message": f"Connected to {provider.label}. {models['count']} models available.",
            "models": models["models"][:80],
            "default_model": row.default_model,
        }
    except Exception as exc:
        row.status = "error"
        row.last_tested_at = utcnow()
        row.last_error = str(exc)[:1000]
        db.commit()
        raise


def _http_error(label: str, response: httpx.Response) -> str:
    detail = ""
    try:
        payload = response.json()
        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict):
                detail = error.get("message") or error.get("code") or ""
            elif error:
                detail = str(error)
            detail = detail or payload.get("message") or payload.get("detail") or ""
    except Exception:
        detail = response.text[:300]
    detail = str(detail).strip()
    if response.status_code == 401:
        return f"{label} rejected the API key. Check the key in Connections."
    if response.status_code == 402:
        return f"{label} needs available credits for this request. {detail}".strip()
    if response.status_code == 403:
        return f"{label} denied access. {detail}".strip()
    if response.status_code == 429:
        return f"{label} rate limit reached. Wait a moment, then retry. {detail}".strip()
    if response.status_code >= 500:
        return f"{label} is temporarily unavailable ({response.status_code}). Retry shortly."
    return f"{label} request failed ({response.status_code}). {detail}".strip()


def chat_completion(
    db: Session,
    provider_name: str | None,
    model: str | None,
    messages: list[dict],
    *,
    temperature: float = 0.7,
    max_tokens: int = 12000,
    json_mode: bool = False,
) -> dict[str, Any]:
    provider = resolve_provider(db, provider_name)
    selected_model = (model or provider.default_model or "").strip()
    if not selected_model:
        raise AINotConfigured(
            f"Choose a model for {provider.label} in Connections & Settings before generating content."
        )
    url = f"{provider.base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {provider.api_key or ''}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if provider.provider == "openrouter":
        headers["HTTP-Referer"] = "https://katha.studio"
        headers["X-Title"] = "Katha Studio"
    body: dict[str, Any] = {
        "model": selected_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}

    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with httpx.Client(timeout=300, follow_redirects=True) as client:
                response = client.post(url, headers=headers, json=body)
            if response.status_code == 400 and json_mode and "response_format" in response.text.lower():
                body.pop("response_format", None)
                json_mode = False
                continue
            if response.status_code == 429 and attempt < 2:
                time.sleep(2 + attempt * 3)
                continue
            if response.status_code >= 500 and attempt < 2:
                time.sleep(2 + attempt * 2)
                continue
            if response.status_code >= 400:
                raise AIError(_http_error(provider.label, response))
            payload = response.json()
            choices = payload.get("choices") or []
            if not choices:
                raise AIError(f"{provider.label} returned no completion. Try another model.")
            content = choices[0].get("message", {}).get("content") or ""
            if isinstance(content, list):
                content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
            if not content.strip():
                raise AIError(f"{provider.label} returned an empty response. Try another model or retry.")
            return {
                "content": content,
                "model": payload.get("model") or selected_model,
                "provider": provider.provider,
                "usage": payload.get("usage") or {},
            }
        except httpx.TimeoutException as exc:
            last_error = AIError(f"{provider.label} timed out. The model may be busy; retry the job.")
        except httpx.HTTPError as exc:
            last_error = AIError(f"Could not reach {provider.label}: {exc}")
        except AIError:
            raise
        if attempt < 2:
            time.sleep(1 + attempt * 2)
    raise last_error or AIError("The AI request failed.")


def parse_json_response(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise AIError("The AI response was not valid JSON. Retry the job or choose a stronger model.")
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise AIError("The AI response was incomplete or malformed. Retry with a stronger model.") from exc
    if not isinstance(data, dict):
        raise AIError("The AI response had an unexpected shape.")
    return data


def generate_json(
    db: Session,
    provider_name: str | None,
    model: str | None,
    system: str,
    user: str,
    *,
    temperature: float = 0.7,
    max_tokens: int = 12000,
) -> dict[str, Any]:
    result = chat_completion(
        db,
        provider_name,
        model,
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=temperature,
        max_tokens=max_tokens,
        json_mode=True,
    )
    data = parse_json_response(result["content"])
    data["_meta"] = {"provider": result["provider"], "model": result["model"], "usage": result["usage"]}
    return data
