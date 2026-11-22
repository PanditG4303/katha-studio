from __future__ import annotations

from pathlib import Path

import pytest


def _create_channel(client) -> dict:
    response = client.post(
        "/api/channels",
        json={
            "name": "Test Story Channel",
            "description": "A channel used by the automated test suite.",
            "category": "Mythology",
            "language": "Hindi",
            "animation_style": "Warm gouache, paper texture, slow camera.",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_health_and_info(client):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["ok"] is True

    info = client.get("/api/system/info")
    assert info.status_code == 200
    assert info.json()["version"]


def test_channel_lifecycle_and_workspace(client, state):
    channel = _create_channel(client)
    state["channel_id"] = channel["id"]
    assert channel["slug"] == "test-story-channel"
    assert channel["animation_project_path"]

    workspace = Path(channel["animation_project_path"]).parent
    animation = Path(channel["animation_project_path"])
    assert animation.name == "ANIMATION_PROJECT"
    assert (animation / "CLAUDE.md").is_file()
    assert (animation / "characters").is_dir()
    assert (animation / "episodes").is_dir()
    assert Path(channel["output_folder"]).is_dir()
    assert Path(channel["watch_folder"]).is_dir()

    listing = client.get("/api/channels")
    assert listing.status_code == 200
    assert any(item["id"] == channel["id"] for item in listing.json()["channels"])

    detail = client.get(f"/api/channels/{channel['id']}")
    assert detail.status_code == 200

    patched = client.patch(
        f"/api/channels/{channel['id']}",
        json={"narrator_voice": "Warm female narrator", "target_audience": "Young adults"},
    )
    assert patched.status_code == 200
    assert patched.json()["narrator_voice"] == "Warm female narrator"

    refreshed = client.post(f"/api/channels/{channel['id']}/workspace/refresh")
    assert refreshed.status_code == 200

    assets = client.get(f"/api/channels/{channel['id']}/assets")
    assert assets.status_code == 200


def test_dashboard_providers_and_voice_providers(client, state):
    dashboard = client.get("/api/dashboard")
    assert dashboard.status_code == 200
    payload = dashboard.json()
    assert "counts" in payload and "by_channel" in payload
    assert any(item["id"] == state["channel_id"] for item in payload["by_channel"])

    providers = client.get("/api/system/providers")
    assert providers.status_code == 200
    assert providers.json()["providers"]

    voice = client.get("/api/voice/providers")
    assert voice.status_code == 200
    assert voice.json()["providers"]

    youtube = client.get("/api/publishing/youtube/status")
    assert youtube.status_code == 200
    assert "client" in youtube.json()


def test_demo_ideation_and_script_generation(client, state):
    response = client.post(
        "/api/content/ideation",
        json={
            "channel_id": state["channel_id"],
            "prompt": "A lantern keeper guides lost travellers through a foggy mountain pass.",
            "video_count": 2,
            "desired_duration": 6,
            "demo": True,
        },
    )
    assert response.status_code == 202, response.text
    session_id = response.json()["session"]["id"]
    state["session_id"] = session_id

    session = client.get(f"/api/content/ideation/{session_id}")
    assert session.status_code == 200
    payload = session.json()
    assert payload["status"] == "ready"
    assert payload["is_demo"] is True
    assert len(payload["ideas"]) >= 1

    idea_ids = [payload["ideas"][0]["id"]]
    scripts = client.post(f"/api/content/ideation/{session_id}/scripts", json={"idea_ids": idea_ids})
    assert scripts.status_code == 202, scripts.text

    projects = client.get(f"/api/projects?channel_id={state['channel_id']}")
    assert projects.status_code == 200
    project_list = projects.json()["projects"]
    assert project_list, "Script generation should create a project."
    project_id = project_list[0]["id"]
    state["project_id"] = project_id

    detail = client.get(f"/api/projects/{project_id}")
    assert detail.status_code == 200
    project = detail.json()
    assert project["episodes"], "The project should contain at least one episode."
    dialogue = [line for episode in project["episodes"] for scene in episode["scenes"] for line in scene["dialogue"]]
    assert dialogue, "The script should contain dialogue lines."
    assert project["status"] in {"SCRIPT_READY", "DRAFT"}
    state["first_line_id"] = dialogue[0]["id"]


def test_windows_voice_generation(client, state):
    providers = client.get("/api/voice/providers").json()
    windows = [item for item in providers["providers"] if item.get("id") == "windows_sapi"]
    if not windows or not windows[0].get("connected"):
        pytest.skip("Windows SAPI is not available on this machine.")

    response = client.post(
        "/api/voice/generate",
        json={
            "project_id": state["project_id"],
            "provider": "windows_sapi",
            "line_ids": [state["first_line_id"]],
            "overwrite": True,
        },
    )
    assert response.status_code == 202, response.text
    job_id = response.json()["job"]["id"]

    job = client.get(f"/api/system/jobs/{job_id}")
    assert job.status_code == 200
    assert job.json()["status"] == "completed", job.json()

    project = client.get(f"/api/projects/{state['project_id']}").json()
    line = next(
        line
        for episode in project["episodes"]
        for scene in episode["scenes"]
        for line in scene["dialogue"]
        if line["id"] == state["first_line_id"]
    )
    assert line["audio_status"] == "ready"
    assert line["audio_path"] and Path(line["audio_path"]).exists()

    audio = client.get(f"/api/media/voice/{state['first_line_id']}")
    assert audio.status_code == 200
    assert len(audio.content) > 0


def test_script_approval_and_production_package(client, state):
    approved = client.post(f"/api/projects/{state['project_id']}/approve", json={"approved": True})
    assert approved.status_code == 200, approved.text

    response = client.post(
        f"/api/projects/{state['project_id']}/package",
        json={"include_audio": False, "overwrite": True},
    )
    assert response.status_code == 202, response.text
    job_id = response.json()["job"]["id"]

    job = client.get(f"/api/system/jobs/{job_id}")
    assert job.status_code == 200
    assert job.json()["status"] == "completed", job.json()

    handoff = client.get(f"/api/projects/{state['project_id']}/handoff")
    assert handoff.status_code == 200
    payload = handoff.json()
    assert payload["package_exists"] is True
    assert payload["animation_project_exists"] is True


def test_video_import_media_and_duplicate_prevention(client, state, sample_video):
    response = client.post(
        "/api/videos/import",
        json={
            "path": str(sample_video),
            "title": "Automated Test Film",
            "channel_id": state["channel_id"],
            "source": "manual",
        },
    )
    assert response.status_code == 200, response.text
    imported = response.json()
    assert imported["duplicate"] is False
    assert imported["video_id"]
    video_id = imported["video_id"]
    state["video_id"] = video_id

    duplicate = client.post(
        "/api/videos/import",
        json={"path": str(sample_video), "channel_id": state["channel_id"], "source": "manual"},
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["duplicate"] is True

    videos = client.get("/api/videos?limit=20")
    assert videos.status_code == 200
    assert any(item["id"] == video_id for item in videos.json()["videos"])

    detail = client.get(f"/api/videos/{video_id}")
    assert detail.status_code == 200
    assert detail.json()["duration"] > 0

    patched = client.patch(
        f"/api/videos/{video_id}",
        json={"description": "A test film.", "tags": ["test"], "hashtags": ["Test"]},
    )
    assert patched.status_code == 200
    assert patched.json()["description"] == "A test film."

    media = client.get(f"/api/media/video/{video_id}")
    assert media.status_code == 200
    assert len(media.content) > 0

    thumbnail = client.get(f"/api/media/thumbnail/{video_id}")
    assert thumbnail.status_code == 200
    assert len(thumbnail.content) > 0

    refreshed = client.post(f"/api/videos/{video_id}/refresh-metadata")
    assert refreshed.status_code == 200

    rescan = client.post("/api/videos/rescan")
    assert rescan.status_code == 200

    history = client.get("/api/imports/history")
    assert history.status_code == 200


def test_publication_workflow_and_conflict_rules(client, state):
    response = client.post(
        "/api/publications",
        json={
            "video_id": state["video_id"],
            "platform": "youtube",
            "status": "scheduled",
            "scheduled_at": "2026-12-01T18:00:00",
        },
    )
    assert response.status_code == 201, response.text
    publication = response.json()
    state["publication_id"] = publication["id"]

    conflict = client.post(
        "/api/publications",
        json={"video_id": state["video_id"], "platform": "youtube", "status": "scheduled"},
    )
    assert conflict.status_code == 409

    listing = client.get("/api/publications")
    assert listing.status_code == 200
    assert any(item["id"] == publication["id"] for item in listing.json()["publications"])

    rescheduled = client.patch(
        f"/api/publications/{publication['id']}",
        json={"scheduled_at": "2026-12-02T18:00:00"},
    )
    assert rescheduled.status_code == 200

    cancelled = client.patch(f"/api/publications/{publication['id']}", json={"status": "cancelled"})
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"

    instagram = client.post(
        "/api/publishing/instagram/manual",
        json={
            "video_id": state["video_id"],
            "caption": "A quiet story for the evening.",
            "notes": "Post manually from the phone.",
            "platform": "instagram",
            "status": "manual_ready",
        },
    )
    assert instagram.status_code == 201, instagram.text
    assert instagram.json()["platform"] == "instagram"

    published = client.post(
        f"/api/videos/{state['video_id']}/mark-published",
        json={"youtube_url": "https://youtu.be/example"},
    )
    assert published.status_code == 200

    calendar = client.get("/api/calendar")
    assert calendar.status_code == 200
    assert "events" in calendar.json() and "drafts" in calendar.json()


def test_settings_backups_and_diagnostics(client):
    settings = client.get("/api/system/settings")
    assert settings.status_code == 200

    general = client.put(
        "/api/system/settings/general",
        json={"studio_name": "Test Studio", "week_starts_on": "monday"},
    )
    assert general.status_code == 200

    backup = client.post("/api/system/backups")
    assert backup.status_code == 200, backup.text
    backups = client.get("/api/system/backups")
    assert backups.status_code == 200
    assert backups.json()["backups"]

    diagnostics = client.get("/api/system/diagnostics")
    assert diagnostics.status_code == 200
    assert diagnostics.json()["checks"]

    logs = client.get("/api/system/logs")
    assert logs.status_code == 200

    claude = client.get("/api/system/claude")
    assert claude.status_code == 200

    jobs = client.get("/api/system/jobs")
    assert jobs.status_code == 200


def test_validation_and_not_found_errors(client):
    missing = client.get("/api/videos/999999")
    assert missing.status_code == 404

    missing_project = client.get("/api/projects/999999")
    assert missing_project.status_code == 404

    bad_client = client.post("/api/publishing/youtube/client", json={"client_id": "", "client_secret": ""})
    assert bad_client.status_code == 400

    oauth = client.post("/api/publishing/youtube/oauth/start")
    assert oauth.status_code == 400

    upload = client.post(
        "/api/publishing/uploads",
        json={
            "video_id": 999999,
            "account_id": 999999,
            "title": "Missing",
            "confirm": True,
        },
    )
    assert upload.status_code == 404
