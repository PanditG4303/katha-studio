from __future__ import annotations

import json
import logging
import math
import os
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Any

from ..config import config

logger = logging.getLogger(__name__)

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


class MediaToolError(RuntimeError):
    pass


def tools_status() -> dict[str, Any]:
    ffmpeg = config.ffmpeg_path if config.ffmpeg_path and Path(config.ffmpeg_path).exists() else None
    ffprobe = config.ffprobe_path if config.ffprobe_path and Path(config.ffprobe_path).exists() else None
    return {
        "ffmpeg": ffmpeg,
        "ffprobe": ffprobe,
        "ffmpeg_available": bool(ffmpeg),
        "ffprobe_available": bool(ffprobe),
        "ready": bool(ffmpeg and ffprobe),
    }


def _require(tool: str) -> str:
    path = config.ffmpeg_path if tool == "ffmpeg" else config.ffprobe_path
    if not path or not Path(path).exists():
        raise MediaToolError(
            f"{tool} is not available. Re-run setup so the bundled media tools are installed."
        )
    return path


def run_ffmpeg(args: list[str], timeout: int = 600) -> subprocess.CompletedProcess:
    exe = _require("ffmpeg")
    command = [exe, "-hide_banner", "-loglevel", "error", "-y", *args]
    try:
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=timeout, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        )
    except subprocess.TimeoutExpired as exc:
        raise MediaToolError("Media processing timed out.") from exc
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "Unknown FFmpeg error").strip()
        raise MediaToolError(f"FFmpeg failed: {message[-600:]}")
    return result


def probe(path: str | Path) -> dict[str, Any]:
    file_path = Path(path)
    if not file_path.exists() or not file_path.is_file():
        raise MediaToolError("The media file could not be found.")
    exe = _require("ffprobe")
    command = [
        exe,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(file_path),
    ]
    try:
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=120, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        )
    except subprocess.TimeoutExpired as exc:
        raise MediaToolError("Media inspection timed out.") from exc
    if result.returncode != 0:
        raise MediaToolError(f"FFprobe could not read this file: {(result.stderr or '').strip()[-400:]}")
    try:
        data = json.loads(result.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise MediaToolError("FFprobe returned an unreadable response.") from exc

    video_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
    audio_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)
    fmt = data.get("format", {})
    duration = 0.0
    try:
        duration = float(fmt.get("duration") or (video_stream or {}).get("duration") or (audio_stream or {}).get("duration") or 0)
    except (TypeError, ValueError):
        duration = 0.0
    fps = 0.0
    if video_stream:
        raw_rate = video_stream.get("avg_frame_rate") or video_stream.get("r_frame_rate") or "0/1"
        try:
            numerator, denominator = raw_rate.split("/")
            fps = float(numerator) / float(denominator) if float(denominator) else 0.0
        except (ValueError, ZeroDivisionError):
            fps = 0.0
    width = int((video_stream or {}).get("width") or 0)
    height = int((video_stream or {}).get("height") or 0)
    aspect = "16:9"
    if width and height:
        ratio = width / height
        if abs(ratio - 9 / 16) < 0.03:
            aspect = "9:16"
        elif abs(ratio - 1) < 0.03:
            aspect = "1:1"
        elif abs(ratio - 4 / 5) < 0.03:
            aspect = "4:5"
        elif abs(ratio - 4 / 3) < 0.03:
            aspect = "4:3"
        elif ratio > 1:
            aspect = "16:9"
        else:
            aspect = "9:16"
    return {
        "duration": round(duration, 3),
        "width": width,
        "height": height,
        "fps": round(fps, 3),
        "aspect_ratio": aspect,
        "video_codec": (video_stream or {}).get("codec_name", ""),
        "audio_codec": (audio_stream or {}).get("codec_name", ""),
        "has_video": bool(video_stream),
        "has_audio": bool(audio_stream),
        "format": fmt.get("format_name", ""),
        "size": int(fmt.get("size") or file_path.stat().st_size),
        "bit_rate": int(fmt.get("bit_rate") or 0),
        "tags": fmt.get("tags", {}),
        "streams": data.get("streams", []),
    }


def validate_video(path: str | Path) -> dict[str, Any]:
    file_path = Path(path)
    if file_path.suffix.lower() not in VIDEO_EXTENSIONS:
        raise MediaToolError("Only MP4, MOV, M4V and WebM video files can be imported.")
    if not file_path.exists() or file_path.stat().st_size < 1024:
        raise MediaToolError("The video file is missing or incomplete.")
    info = probe(file_path)
    if not info["has_video"]:
        raise MediaToolError("This file does not contain a video stream.")
    if info["duration"] <= 0:
        raise MediaToolError("The video duration could not be read. The file may be incomplete.")
    return info


def generate_thumbnail(video_path: str | Path, output_path: str | Path, duration: float | None = None) -> Path:
    source = Path(video_path)
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    if duration is None:
        duration = float(probe(source).get("duration") or 0)
    seek = max(0.3, min(duration * 0.12, 8.0)) if duration else 1.0
    run_ffmpeg(
        [
            "-ss",
            f"{seek:.2f}",
            "-i",
            str(source),
            "-frames:v",
            "1",
            "-vf",
            "scale='min(960,iw)':-2",
            "-q:v",
            "3",
            str(output),
        ]
    )
    if not output.exists():
        raise MediaToolError("Thumbnail generation did not produce a file.")
    return output


def extract_frame(video_path: str | Path, output_path: str | Path, at_seconds: float) -> Path:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(["-ss", f"{max(0, at_seconds):.2f}", "-i", str(video_path), "-frames:v", "1", "-q:v", "2", str(output)])
    return output


def waveform_and_energy(path: str | Path, sample_rate: int = 4000) -> dict[str, Any]:
    """Extract peaks and approximate tempo from a short analysis WAV.

    This is deliberately lightweight and local: no ML model, no cloud upload.
    BPM is an estimate and is labelled as such in the UI.
    """
    source = Path(path)
    with tempfile.TemporaryDirectory(prefix="katha-wave-") as tmp:
        wav_path = Path(tmp) / "analysis.wav"
        run_ffmpeg(
            ["-i", str(source), "-vn", "-ac", "1", "-ar", str(sample_rate), "-f", "wav", str(wav_path)],
            timeout=300,
        )
        with wave.open(str(wav_path), "rb") as handle:
            channels = handle.getnchannels()
            width = handle.getsampwidth()
            rate = handle.getframerate()
            frames = handle.readframes(handle.getnframes())
        if width != 2:
            raise MediaToolError("Unexpected audio sample format during analysis.")
        import array

        samples = array.array("h")
        samples.frombytes(frames)
        if os.name == "nt":
            pass
        if channels > 1:
            samples = samples[::channels]
        total = len(samples)
        if total == 0:
            return {"waveform": [], "bpm": None, "energy": 0, "sections": []}
        buckets = 180
        bucket_size = max(1, total // buckets)
        peaks = []
        energies = []
        for index in range(0, total, bucket_size):
            chunk = samples[index : index + bucket_size]
            if not chunk:
                continue
            peak = max(abs(v) for v in chunk) / 32768
            rms = math.sqrt(sum(v * v for v in chunk) / len(chunk)) / 32768
            peaks.append(round(peak, 4))
            energies.append(rms)
        waveform = peaks[:buckets]
        while len(waveform) < buckets:
            waveform.append(0)
        energy = round(sum(energies) / len(energies), 4) if energies else 0
        duration = total / rate
        bpm = _estimate_bpm(energies, rate / bucket_size)
        sections = _detect_sections(energies, duration)
        return {
            "waveform": waveform,
            "bpm": bpm,
            "energy": energy,
            "sections": sections,
            "sample_rate": rate,
            "duration": round(duration, 3),
        }


def _estimate_bpm(energies: list[float], envelope_rate: float) -> float | None:
    if len(energies) < 30 or envelope_rate <= 0:
        return None
    mean = sum(energies) / len(energies)
    onset = [max(0.0, value - mean) for value in energies]
    min_lag = max(1, int(envelope_rate * 60 / 180))  # 180 BPM
    max_lag = min(len(onset) - 2, int(envelope_rate * 60 / 50))  # 50 BPM
    if max_lag <= min_lag:
        return None
    best_lag, best_score = None, 0.0
    for lag in range(min_lag, max_lag):
        score = sum(onset[i] * onset[i + lag] for i in range(len(onset) - lag))
        if score > best_score:
            best_score, best_lag = score, lag
    if not best_lag:
        return None
    bpm = 60.0 * envelope_rate / best_lag
    while bpm < 70:
        bpm *= 2
    while bpm > 180:
        bpm /= 2
    return round(bpm, 1)


def _detect_sections(energies: list[float], duration: float) -> list[dict[str, Any]]:
    if not energies or duration <= 0:
        return []
    count = min(8, max(3, int(duration // 30) + 1))
    size = max(1, len(energies) // count)
    sections = []
    for index in range(count):
        chunk = energies[index * size : (index + 1) * size]
        if not chunk:
            continue
        avg = sum(chunk) / len(chunk)
        label = "quiet" if avg < 0.035 else "building" if avg < 0.08 else "energetic"
        start = round(index * duration / count, 2)
        end = round(min(duration, (index + 1) * duration / count), 2)
        sections.append({"label": label, "start": start, "end": end, "energy": round(avg, 4)})
    return sections


def analyze_video_style(path: str | Path) -> dict[str, Any]:
    from PIL import Image

    info = probe(path)
    duration = info["duration"]
    samples = [duration * fraction for fraction in (0.12, 0.35, 0.6, 0.84)]
    colors: list[str] = []
    brightness: list[float] = []
    with tempfile.TemporaryDirectory(prefix="katha-style-") as tmp:
        for index, at in enumerate(samples):
            frame_path = Path(tmp) / f"frame_{index}.jpg"
            try:
                extract_frame(path, frame_path, at)
            except MediaToolError:
                continue
            if not frame_path.exists():
                continue
            with Image.open(frame_path) as image:
                image = image.convert("RGB").resize((120, 68))
                pixels = list(image.getdata())
                count = len(pixels)
                if not count:
                    continue
                avg = tuple(sum(pixel[channel] for pixel in pixels) // count for channel in range(3))
                brightness.append(round(sum(avg) / 765, 3))
                quantized = image.quantize(colors=5, method=Image.Quantize.MEDIANCUT).convert("RGB")
                palette = quantized.getcolors(maxcolors=10000) or []
                for _, color in sorted(palette, reverse=True)[:4]:
                    hex_color = "#{:02x}{:02x}{:02x}".format(*color)
                    if hex_color not in colors:
                        colors.append(hex_color)
    avg_brightness = sum(brightness) / len(brightness) if brightness else 0.5
    summary = (
        f"Reference video is {info['width']}×{info['height']} at {info['fps']:.1f} fps. "
        f"Average sampled brightness is {avg_brightness:.0%}. "
        f"Dominant sampled colours: {', '.join(colors[:6]) or 'not available'}. "
        f"The pacing should follow a {info['duration']:.1f}-second reference with a consistent visual identity."
    )
    return {
        "summary": summary,
        "palette": colors[:8],
        "brightness": avg_brightness,
        "duration": duration,
        "width": info["width"],
        "height": info["height"],
        "fps": info["fps"],
        "aspect_ratio": info["aspect_ratio"],
        "storytelling_pace": "reference-led",
        "analysis_method": "local keyframe and colour sampling",
        "limitations": "Local analysis describes measurable visual properties. It does not copy characters, scenes, music or artwork.",
    }


def convert_to_mp3(source: str | Path, target: str | Path) -> Path:
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(["-i", str(source), "-vn", "-codec:a", "libmp3lame", "-q:a", "3", str(target)])
    return target


def copy_with_unique_name(source: str | Path, target_dir: Path, prefix: str = "") -> Path:
    source = Path(source)
    target_dir.mkdir(parents=True, exist_ok=True)
    name = f"{prefix}{source.name}" if prefix else source.name
    target = target_dir / name
    index = 2
    while target.exists():
        target = target_dir / f"{Path(name).stem}_{index}{source.suffix}"
        index += 1
    shutil.copy2(source, target)
    return target
