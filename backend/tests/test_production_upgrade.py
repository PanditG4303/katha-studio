from __future__ import annotations

import time
from pathlib import Path

import pytest


def _require_state(state: dict, *keys: str) -> None:
    missing = [key for key in keys if not state.get(key)]
    if missing:
        pytest.skip(f"Run the API flow tests first; missing state: {', '.join(missing)}")


def test_agent_detection_settings_and_handoff_locks(client, state):
    _require_state(state, "project_id", "channel_id")

    detection = client.get("/api/agents")
    assert detection.status_code == 200, detection.text
    payload = detection.json()
    assert {agent["agent"] for agent in payload["agents"]} == {"claude_code", "antigravity", "manual"}
    assert payload["selected_agent"] in {"claude_code", "antigravity", "manual"}

    saved = client.patch(
        "/api/agents/settings",
        json={"selected_agent": "manual", "permission_mode": "plan"},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["settings"]["selected_agent"] == "manual"
    assert saved.json()["settings"]["permission_mode"] == "plan"

    project = client.get(f"/api/projects/{state['project_id']}")
    assert project.status_code == 200
    if not project.json().get("production_package_path"):
        pytest.skip("The project has no production package yet.")

    handoff = client.post(
        "/api/agents/handoffs",
        json={"project_id": state["project_id"], "agent": "manual", "mode": "prepare"},
    )
    assert handoff.status_code == 200, handoff.text
    body = handoff.json()
    assert body["agent"] == "manual"
    assert body["status"] == "prepared"
    assert body["prompt_path"] and Path(body["prompt_path"]).is_file()
    assert Path(body["working_dir"]).is_dir()

    conflict = client.post(
        "/api/agents/handoffs",
        json={"project_id": state["project_id"], "agent": "manual", "mode": "prepare"},
    )
    assert conflict.status_code == 409, conflict.text

    completed = client.post(f"/api/agents/handoffs/{body['id']}/complete")
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "completed"

    locks = client.get("/api/agents/locks")
    assert locks.status_code == 200
    assert all(lock["project_id"] != state["project_id"] for lock in locks.json()["locks"])

    restored = client.patch("/api/agents/settings", json={"selected_agent": "claude_code"})
    assert restored.status_code == 200


def test_skill_import_review_install_and_uninstall(client, state, tmp_path):
    _require_state(state, "channel_id")

    listing = client.get("/api/skills")
    assert listing.status_code == 200, listing.text
    assert len(listing.json()["skills"]) >= 7
    assert any(skill["source"] == "builtin" and skill["approved"] for skill in listing.json()["skills"])

    source = tmp_path / "test-acceptance-skill"
    source.mkdir()
    (source / "SKILL.md").write_text(
        "---\n"
        "name: Test Acceptance Skill\n"
        "description: A tiny skill used to verify review and installation.\n"
        "version: 1.0.0\n"
        "permissions:\n"
        "  - read project files\n"
        "---\n\n"
        "Read the project brief and summarise it.\n",
        encoding="utf-8",
    )

    imported = client.post("/api/skills/import", json={"path": str(source)})
    assert imported.status_code == 200, imported.text
    skill = imported.json()
    assert skill["approved"] is False
    assert skill["status"] == "review"
    assert skill["slug"] == "test-acceptance-skill"

    detail = client.get(f"/api/skills/{skill['id']}")
    assert detail.status_code == 200
    assert detail.json()["inspection"]["metadata"]["name"] == "Test Acceptance Skill"
    assert detail.json()["inspection"]["files"]

    install_before_approval = client.post(
        f"/api/skills/{skill['id']}/install",
        json={"channel_id": state["channel_id"], "agents": ["claude_code"]},
    )
    assert install_before_approval.status_code == 400

    approved = client.post(f"/api/skills/{skill['id']}/approve", json={"approved": True})
    assert approved.status_code == 200, approved.text
    assert approved.json()["approved"] is True

    installed = client.post(
        f"/api/skills/{skill['id']}/install",
        json={"channel_id": state["channel_id"], "agents": ["claude_code", "antigravity", "manual"]},
    )
    assert installed.status_code == 200, installed.text
    assert set(installed.json()["installed_agents"]) == {"claude_code", "antigravity", "manual"}

    channel = client.get(f"/api/channels/{state['channel_id']}").json()
    project = Path(channel["animation_project_path"])
    assert (project / ".claude" / "skills" / skill["slug"] / "SKILL.md").is_file()
    assert (project / ".agent" / "skills" / skill["slug"] / "SKILL.md").is_file()
    assert (project / ".katha" / "skills" / skill["slug"] / "SKILL.md").is_file()
    assert (project / ".agent" / "rules" / "katha-skills.md").is_file()
    assert "Test Acceptance Skill" in (project / "SKILLS.md").read_text(encoding="utf-8")

    uninstalled = client.post(f"/api/skills/{skill['id']}/uninstall?channel_id={state['channel_id']}")
    assert uninstalled.status_code == 200, uninstalled.text
    assert not (project / ".claude" / "skills" / skill["slug"]).exists()

    deleted = client.delete(f"/api/skills/{skill['id']}?confirm=true")
    assert deleted.status_code == 200, deleted.text


def test_mcp_definition_stores_names_not_secrets(client, state):
    _require_state(state, "channel_id")

    created = client.post(
        "/api/mcp",
        json={
            "name": "Acceptance Test MCP",
            "transport": "stdio",
            "command": "node",
            "args": ["server.js"],
            "env_keys": ["ACCEPTANCE_TOKEN"],
            "target_agent": "claude_code",
            "channel_id": state["channel_id"],
            "write_to_project": False,
        },
    )
    assert created.status_code == 200, created.text
    payload = created.json()
    server = payload["server"]
    assert server["env_keys"] == ["ACCEPTANCE_TOKEN"]
    assert "secret" not in str(server["config"]).lower()
    assert server["config"]["env_values_stored"] is False

    listing = client.get("/api/mcp")
    assert listing.status_code == 200
    assert any(item["id"] == server["id"] for item in listing.json()["servers"])

    deleted = client.delete(f"/api/mcp/{server['id']}")
    assert deleted.status_code == 200, deleted.text


def test_browser_profiles_and_publish_guard(client, state):
    overview = client.get("/api/browser")
    assert overview.status_code == 200, overview.text
    data = overview.json()
    assert len(data["accounts"]) >= 6
    assert {account["platform"] for account in data["accounts"]} == {"youtube", "instagram"}
    assert "never stores social passwords" in data["security_note"]

    created = client.post("/api/browser/accounts", json={"platform": "instagram", "label": "Acceptance Test Profile"})
    assert created.status_code == 200, created.text
    account = created.json()
    assert account["identity_verified"] is False

    refused = client.delete(f"/api/browser/accounts/{account['id']}")
    assert refused.status_code == 400

    deleted = client.delete(f"/api/browser/accounts/{account['id']}?confirm=true")
    assert deleted.status_code == 200, deleted.text

    if state.get("video_id"):
        youtube = next(item for item in data["accounts"] if item["platform"] == "youtube")
        publish = client.post(
            "/api/browser/publish",
            json={
                "video_id": state["video_id"],
                "browser_account_id": youtube["id"],
                "title": "Acceptance test",
                "confirm": True,
            },
        )
        assert publish.status_code == 400
        assert "Test this browser account first" in publish.json()["detail"]


def test_browser_profile_test_opens_isolated_chrome(client, state):
    overview = client.get("/api/browser")
    assert overview.status_code == 200, overview.text
    runtime = overview.json()["runtime"]
    if not runtime.get("automation_available"):
        pytest.skip("Playwright and Google Chrome or Microsoft Edge are not available on this machine.")

    account = next(item for item in overview.json()["accounts"] if item["platform"] == "youtube")
    tested = client.post(f"/api/browser/accounts/{account['id']}/test")
    assert tested.status_code == 200, tested.text
    result = tested.json()["result"]
    assert result.get("status"), result
    assert result.get("ok") is not False, result

    closed = client.post(f"/api/browser/accounts/{account['id']}/close")
    assert closed.status_code == 200, closed.text


def test_browser_worker_close_is_fast_and_dispatch_survives_thread_start(tmp_path):
    from app.services.browser_manager import BrowserWorker

    worker = BrowserWorker(999_999, str(tmp_path / "profile"), "youtube")
    worker.start()
    try:
        assert callable(worker._dispatch), "Thread.start() must not shadow the command dispatcher."
        started = time.time()
        worker.close(wait=True)
        elapsed = time.time() - started
        assert elapsed < 5, f"Closing an idle worker took {elapsed:.1f}s"
        assert not worker.is_alive() or worker._stop_requested
    finally:
        if worker.is_alive():
            worker.join(timeout=5)


def test_output_state_bulk_update_and_dashboard(client, state):
    _require_state(state, "video_id")

    updated = client.post(
        "/api/videos/bulk-update",
        json={"video_ids": [state["video_id"]], "output_state": "READY"},
    )
    assert updated.status_code == 200, updated.text

    videos = client.get("/api/videos?output_state=READY")
    assert videos.status_code == 200
    assert any(item["id"] == state["video_id"] for item in videos.json()["videos"])

    dashboard = client.get("/api/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["counts"]["output_ready"] >= 1
