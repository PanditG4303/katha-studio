from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy.orm import Session

from ..models import Asset

logger = logging.getLogger(__name__)

TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".json", ".srt", ".vtt", ".csv"}
DOC_EXTENSIONS = {".pdf", ".docx"}


def extract_text(path: str | Path, limit: int = 100_000) -> str:
    file_path = Path(path)
    suffix = file_path.suffix.lower()
    try:
        if suffix in TEXT_EXTENSIONS:
            return file_path.read_text(encoding="utf-8", errors="replace")[:limit]
        if suffix == ".pdf":
            from pypdf import PdfReader

            reader = PdfReader(str(file_path))
            parts = []
            for page in reader.pages[:80]:
                parts.append(page.extract_text() or "")
                if sum(len(p) for p in parts) > limit:
                    break
            return "\n".join(parts)[:limit]
        if suffix == ".docx":
            from docx import Document

            document = Document(str(file_path))
            parts = [paragraph.text for paragraph in document.paragraphs]
            return "\n".join(parts)[:limit]
    except Exception as exc:
        logger.warning("Could not extract text from %s: %s", file_path.name, exc)
        return ""
    return ""


def collect_source_text(db: Session, asset_ids: list[int], pasted: str = "") -> str:
    sections = []
    if pasted.strip():
        sections.append(f"PASTED MATERIAL\n{pasted.strip()}")
    for asset_id in asset_ids:
        asset = db.get(Asset, asset_id)
        if not asset or not Path(asset.path).exists():
            continue
        text = extract_text(asset.path)
        if text.strip():
            sections.append(f"UPLOADED FILE: {asset.name or Path(asset.path).name}\n{text.strip()}")
        else:
            meta = asset.metadata_json or {}
            summary = meta.get("summary") or meta.get("analysis") or ""
            sections.append(
                f"UPLOADED REFERENCE: {asset.name or Path(asset.path).name}\n"
                f"{summary or 'Binary reference saved. It cannot be read as text; use the supplied metadata and user description.'}"
            )
    return "\n\n".join(sections)[:120_000]


def collect_reference_notes(db: Session, asset_ids: list[int], urls: list[str]) -> str:
    notes = []
    for asset_id in asset_ids:
        asset = db.get(Asset, asset_id)
        if not asset:
            continue
        meta = asset.metadata_json or {}
        note = meta.get("reference_note") or meta.get("summary") or meta.get("analysis")
        if note:
            notes.append(f"{asset.name or Path(asset.path).name}: {note}")
    if urls:
        notes.append(
            "Reference URLs supplied by the user: "
            + ", ".join(urls)
            + ". Social platforms do not all provide downloadable media. These URLs are context only unless the user also uploads the video."
        )
    return "\n".join(notes)[:20_000]
