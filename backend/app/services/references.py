from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

import httpx
from sqlalchemy.orm import Session

from ..models import Asset, Channel, ReferenceStyle
from .ffmpeg import IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, analyze_video_style, probe
from .workspace import get_storage_roots


class ReferenceError(RuntimeError):
    pass


def inspect_url(url: str) -> dict:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ReferenceError("Enter a complete http(s) URL.")
    result = {
        "url": url,
        "platform": parsed.netloc.replace("www.", ""),
        "accessible": False,
        "download_supported": False,
        "note": "",
        "title": "",
    }
    if "youtube.com" in parsed.netloc or "youtu.be" in parsed.netloc:
        try:
            with httpx.Client(timeout=15, follow_redirects=True) as client:
                response = client.get(
                    "https://www.youtube.com/oembed",
                    params={"url": url, "format": "json"},
                )
            if response.status_code == 200:
                data = response.json()
                result.update(
                    {
                        "accessible": True,
                        "title": data.get("title", ""),
                        "author": data.get("author_name", ""),
                        "thumbnail": data.get("thumbnail_url", ""),
                        "note": (
                            "YouTube page metadata is accessible, but Katha Studio does not download videos from YouTube. "
                            "Upload the reference video file to analyse its visual style."
                        ),
                    }
                )
                return result
        except httpx.HTTPError:
            pass
        result["note"] = (
            "This YouTube link could not be read automatically. Upload the video file to analyse its visual style."
        )
        return result
    if "instagram.com" in parsed.netloc:
        result["note"] = (
            "Instagram does not provide public media download access for this workflow. "
            "Katha Studio saved the link as context only. Upload the reference video to analyse it."
        )
        return result
    try:
        with httpx.Client(timeout=15, follow_redirects=True) as client:
            response = client.get(url, headers={"User-Agent": "KathaStudio/1.0"})
        result["accessible"] = response.status_code < 400
        result["note"] = (
            "Link saved as context. Katha Studio does not scrape or download arbitrary web video. "
            "Upload the media file for frame-level analysis."
        )
        title_match = re.search(r"<title[^>]*>(.*?)</title>", response.text[:20000], re.IGNORECASE | re.DOTALL)
        if title_match:
            result["title"] = re.sub(r"\s+", " ", title_match.group(1)).strip()[:300]
    except httpx.HTTPError as exc:
        result["note"] = f"Link saved as context, but it could not be reached ({exc}). Upload the reference file to analyse it."
    return result


def analyze_reference_file(
    db: Session,
    path: str,
    name: str,
    channel_id: int | None,
    source_url: str = "",
    save_to_channel: bool = False,
    apply_style: bool = False,
) -> dict:
    file_path = Path(path)
    if not file_path.exists():
        raise ReferenceError("The selected reference file could not be found.")
    suffix = file_path.suffix.lower()
    channel = db.get(Channel, channel_id) if channel_id else None
    if suffix in VIDEO_EXTENSIONS:
        analysis = analyze_video_style(file_path)
        analysis["reference_note"] = (
            "Visual style analysis based on locally sampled keyframes. Use it as abstract guidance only; "
            "do not copy characters, artwork, music or exact scenes."
        )
        summary = analysis["summary"]
    elif suffix in IMAGE_EXTENSIONS:
        from PIL import Image

        with Image.open(file_path) as image:
            image = image.convert("RGB").resize((120, 120))
            pixels = list(image.getdata())
            count = len(pixels) or 1
            avg = tuple(sum(p[channel] for p in pixels) // count for channel in range(3))
            quantized = image.quantize(colors=6).convert("RGB")
            palette = [
                "#{:02x}{:02x}{:02x}".format(*color)
                for _, color in sorted(quantized.getcolors(maxcolors=10000) or [], reverse=True)[:6]
            ]
        brightness = round(sum(avg) / 765, 3)
        summary = (
            f"Reference image analysed locally. Dominant colours: {', '.join(palette)}. "
            f"Average brightness: {brightness:.0%}. Use these as abstract palette guidance only."
        )
        analysis = {
            "summary": summary,
            "palette": palette,
            "brightness": brightness,
            "analysis_method": "local colour sampling",
            "limitations": "No characters or artwork are copied. Upload video for pacing and camera analysis.",
            "reference_note": "Reference image palette guidance. Do not copy the original artwork.",
        }
    else:
        raise ReferenceError("Choose an image or video file for visual reference analysis.")

    style = ReferenceStyle(
        channel_id=channel_id,
        name=name or file_path.stem,
        source_type="local",
        source_path=str(file_path),
        source_url=source_url,
        summary=summary,
        analysis=analysis,
        is_reusable=save_to_channel,
    )
    db.add(style)
    db.commit()
    db.refresh(style)

    if save_to_channel and channel:
        channel.animation_style = (
            (channel.animation_style + "\n\n" if channel.animation_style else "")
            + f"Reference style '{style.name}': {summary}"
        )
        db.commit()
    if apply_style and channel:
        channel.animation_style = (
            (channel.animation_style + "\n\n" if channel.animation_style else "")
            + f"Project style direction from '{style.name}': {summary}"
        )
        db.commit()
    return {
        "id": style.id,
        "name": style.name,
        "summary": style.summary,
        "analysis": style.analysis,
        "palette": analysis.get("palette", []),
        "saved_to_channel": bool(save_to_channel),
        "applied": bool(apply_style),
    }
