from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
TEST_DIR = Path(tempfile.mkdtemp(prefix="katha-tests-"))
DATA_DIR = TEST_DIR / "data"
WORKSPACE_DIR = TEST_DIR / "workspace"
DATA_DIR.mkdir(parents=True, exist_ok=True)
WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

FFMPEG = ROOT / "node_modules" / "ffmpeg-static" / "ffmpeg.exe"
FFPROBE = ROOT / "node_modules" / "ffprobe-static" / "bin" / "win32" / "x64" / "ffprobe.exe"

os.environ.update(
    {
        "KATHA_DATA_DIR": str(DATA_DIR),
        "KATHA_WORKSPACE_DIR": str(WORKSPACE_DIR),
        "KATHA_TESTING": "1",
        "KATHA_DISABLE_WATCHER": "1",
        "KATHA_SYNC_JOBS": "1",
        "KATHA_API_TOKEN": "",
        "KATHA_FFMPEG_PATH": str(FFMPEG),
        "KATHA_FFPROBE_PATH": str(FFPROBE),
    }
)

sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def state() -> dict:
    return {}


@pytest.fixture(scope="session")
def sample_video() -> Path:
    if not FFMPEG.exists():
        pytest.skip("ffmpeg-static is not installed; video import tests need a real FFmpeg binary.")
    target = TEST_DIR / "sample.mp4"
    if not target.exists():
        result = subprocess.run(
            [
                str(FFMPEG),
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=640x360:rate=24:duration=2",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=2",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
                str(target),
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            pytest.skip(f"Could not generate a test video: {result.stderr[-400:]}")
    return target


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(TEST_DIR, ignore_errors=True)
