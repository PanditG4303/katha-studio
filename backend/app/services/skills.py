"""Shared SKILL.md library and safe installation into agent project folders."""
from __future__ import annotations

import json
import logging
import re
import shutil
from pathlib import Path
from typing import Iterable

from sqlalchemy.orm import Session

from ..config import config
from ..models import Channel, Skill
from ..utils import slugify

logger = logging.getLogger(__name__)

FRONT_MATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
DANGEROUS_PATTERNS = {
    "os.system": "Runs shell commands",
    "subprocess": "Starts local processes",
    "child_process": "Starts local processes",
    "eval(": "Evaluates code dynamically",
    "exec(": "Executes dynamic code",
    "requests.post": "Sends data over the network",
    "fetch(": "Sends data over the network",
    "curl ": "Sends data over the network",
    "wget ": "Sends data over the network",
    "browser": "May access browser data",
    "cookie": "May access browser cookies",
    "credential": "References credentials",
    "keyring": "May read credential storage",
}

BUILTINS: list[dict] = [
    {
        "slug": "faceless-shorts",
        "name": "Faceless Shorts",
        "description": "Turn a story beat into a vertical faceless short with a strong hook, clean pacing and safe captions.",
        "permissions": ["read project files", "write episode files", "no network access", "no credentials"],
        "tools": ["read", "write", "edit"],
        "body": """# Faceless Shorts

Use this skill when the deliverable is a 9:16 short without an on-camera presenter.

## Rules
- Open on the strongest visual or question in the first 1.5 seconds.
- One idea per short. Cut anything that does not serve the hook.
- Keep captions inside the platform safe area and readable on a phone.
- Build to the supplied narration; never re-time or replace it.
- End with a clean loop or a single call to action. No clutter.
- Reuse channel characters and backgrounds before creating new assets.
""",
    },
    {
        "slug": "animation-production",
        "name": "Animation Production",
        "description": "Run a complete episode animation production from a Katha Studio package, preserving audio and shared assets.",
        "permissions": ["read project files", "read production package", "write episode files", "write output renders", "no credentials"],
        "tools": ["read", "write", "edit", "bash"],
        "body": """# Animation Production

## Workflow
1. Read `AGENTS.md`, the character bible, style guide, audio guide and asset manifest.
2. Read the production package master prompt and every part timeline.
3. Audit supplied audio before building scenes. Report missing clips instead of inventing them.
4. Reuse shared assets; version new assets and update the manifest.
5. Build, review and render into the channel `READY/` output folder.
6. Report absolute paths, duration, resolution, frame rate and codec.
""",
    },
    {
        "slug": "storytelling",
        "name": "Storytelling",
        "description": "Shape a factual or fictional story with a clear promise, escalation, emotional turn and satisfying close.",
        "permissions": ["read project files", "write episode files", "no credentials"],
        "tools": ["read", "write", "edit"],
        "body": """# Storytelling

- State the promise of the story early: why should the viewer stay?
- Escalate stakes through cause and effect, not coincidence.
- Give the central figure a visible choice and a cost.
- Keep exposition inside action or dialogue.
- Land the ending on the story's promise; do not add a second ending.
- Mark uncertain facts; never present invented detail as research.
""",
    },
    {
        "slug": "video-editing",
        "name": "Video Editing",
        "description": "Assemble a clean master with consistent timing, subtitles, audio levels and publishing encodes.",
        "permissions": ["read project files", "write episode files", "write output renders", "no credentials"],
        "tools": ["read", "write", "edit", "bash"],
        "body": """# Video Editing

- Cut on action, breath or music emphasis. Avoid arbitrary cuts.
- Keep dialogue intelligible; duck music under speech.
- Use one subtitle style per channel and respect the safe area.
- Check the first and last frames, black frames and audio tails.
- Render a clean master and the requested publishing encode.
- Verify the final file with FFprobe before reporting it.
""",
    },
    {
        "slug": "character-animation",
        "name": "Character Animation",
        "description": "Keep character rigs, silhouettes, expressions and motion consistent across a channel's episodes.",
        "permissions": ["read project files", "write episode files", "no credentials"],
        "tools": ["read", "write", "edit"],
        "body": """# Character Animation

- Read the character bible and rig notes before animating.
- Preserve silhouette, proportions, costume, palette and defining marks.
- Use expression changes to support the spoken emotion, not random motion.
- Keep eyelines and screen direction consistent between shots.
- Reuse existing rigs. If a new pose is required, add it as a versioned asset.
- Never redesign a recurring character without explicit approval.
""",
    },
    {
        "slug": "research",
        "name": "Research",
        "description": "Gather and separate sourced facts, interpretation and uncertainty before writing.",
        "permissions": ["read project files", "write research notes", "no credentials"],
        "tools": ["read", "write", "edit"],
        "body": """# Research

- Record the source, date and what each source actually supports.
- Separate direct evidence, interpretation and open questions.
- Prefer primary sources. Note conflicts instead of silently choosing one.
- Never invent quotations, dates or statistics.
- Put uncertainty in the production package so animation does not harden it into fact.
""",
    },
    {
        "slug": "script-writing",
        "name": "Script Writing",
        "description": "Write production-ready narration and dialogue with scene intent, emotion and delivery notes.",
        "permissions": ["read project files", "write episode files", "no credentials"],
        "tools": ["read", "write", "edit"],
        "body": """# Script Writing

- Write for the ear: short sentences, concrete images, natural breath.
- Give every scene a purpose: advance, reveal or turn.
- Mark speaker, emotion and delivery for every spoken line.
- Do not put production labels in spoken text.
- Keep the narration consistent with the approved research and story promise.
- End each part with a reason to continue without breaking the story's integrity.
""",
    },
]


def ensure_builtin_skills(db: Session) -> None:
    config.skill_library_dir.mkdir(parents=True, exist_ok=True)
    for item in BUILTINS:
        slug = item["slug"]
        folder = config.skill_library_dir / slug
        folder.mkdir(parents=True, exist_ok=True)
        skill_file = folder / "SKILL.md"
        if not skill_file.exists():
            skill_file.write_text(
                _render_skill_md(item["name"], item["description"], item["permissions"], item["tools"], item["body"]),
                encoding="utf-8",
            )
        row = db.query(Skill).filter(Skill.slug == slug).first()
        if not row:
            row = Skill(
                name=item["name"],
                slug=slug,
                description=item["description"],
                version="1.0.0",
                source="builtin",
                path=str(folder),
                compatible_agents=["claude_code", "antigravity", "manual"],
                required_tools=item["tools"],
                permissions=item["permissions"],
                installed_agents=[],
                status="available",
                approved=True,
                metadata_json={"builtin": True},
            )
            db.add(row)
    db.commit()


def _render_skill_md(name: str, description: str, permissions: list[str], tools: list[str], body: str) -> str:
    front = {
        "name": name,
        "description": description,
        "version": "1.0.0",
        "tools": tools,
        "permissions": permissions,
    }
    lines = ["---"]
    for key, value in front.items():
        if isinstance(value, list):
            lines.append(f"{key}:")
            for entry in value:
                lines.append(f"  - {entry}")
        else:
            lines.append(f"{key}: {value}")
    lines.extend(["---", "", body.strip(), ""])
    return "\n".join(lines)


def parse_skill_md(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    match = FRONT_MATTER_RE.match(text)
    meta: dict = {}
    if match:
        current_key = ""
        for raw in match.group(1).splitlines():
            line = raw.rstrip()
            if not line.strip():
                continue
            if line.startswith(("  - ", "- ")) and current_key:
                meta.setdefault(current_key, [])
                if isinstance(meta[current_key], list):
                    meta[current_key].append(line.split("-", 1)[1].strip())
                continue
            if ":" in line:
                key, value = line.split(":", 1)
                current_key = key.strip()
                value = value.strip()
                if value:
                    meta[current_key] = value
                else:
                    meta[current_key] = []
    if not meta.get("name"):
        meta["name"] = path.parent.name.replace("-", " ").title()
    if not meta.get("description"):
        for line in text.splitlines():
            if line.strip() and not line.startswith(("---", "#", "name:", "description:")):
                meta["description"] = line.strip()[:300]
                break
    meta["_content"] = text
    return meta


def inspect_skill_folder(folder: Path) -> dict:
    skill_file = folder / "SKILL.md"
    if not skill_file.exists():
        raise ValueError("The folder does not contain a SKILL.md file.")
    meta = parse_skill_md(skill_file)
    files = []
    warnings = []
    for path in folder.rglob("*"):
        if not path.is_file():
            continue
        relative = str(path.relative_to(folder)).replace("\\", "/")
        size = path.stat().st_size
        files.append({"path": relative, "size": size, "kind": path.suffix.lower().lstrip(".") or "file"})
        if path.suffix.lower() in {".ps1", ".bat", ".cmd", ".exe", ".dll", ".msi", ".sh", ".py", ".js", ".ts"}:
            try:
                content = path.read_text(encoding="utf-8", errors="replace").lower()
            except OSError:
                content = ""
            for pattern, reason in DANGEROUS_PATTERNS.items():
                if pattern.lower() in content:
                    warning = f"{relative}: {reason} ({pattern})"
                    if warning not in warnings:
                        warnings.append(warning)
    return {
        "metadata": {key: value for key, value in meta.items() if key != "_content"},
        "content": meta.get("_content", ""),
        "files": files,
        "warnings": warnings,
        "has_scripts": any(item["kind"] in {"ps1", "bat", "cmd", "sh", "py", "js", "ts"} for item in files),
        "dependencies": _dependencies(folder),
    }


def _dependencies(folder: Path) -> list[str]:
    found: list[str] = []
    package = folder / "package.json"
    if package.exists():
        try:
            data = json.loads(package.read_text(encoding="utf-8"))
            for key in ("dependencies", "devDependencies"):
                found.extend(f"npm: {name}" for name in (data.get(key) or {}))
        except Exception:
            found.append("package.json could not be parsed")
    for name in ("requirements.txt", "pyproject.toml"):
        candidate = folder / name
        if candidate.exists():
            try:
                lines = candidate.read_text(encoding="utf-8", errors="replace").splitlines()
                found.extend(f"python: {line.strip()}" for line in lines if line.strip() and not line.startswith("#"))
            except OSError:
                pass
    return found[:80]


def import_skill(db: Session, source_path: str, *, name: str = "", description: str = "") -> Skill:
    source = Path(source_path)
    if not source.exists() or not source.is_dir():
        raise ValueError("Choose a folder that contains SKILL.md.")
    inspection = inspect_skill_folder(source)
    meta = inspection["metadata"]
    skill_name = name.strip() or str(meta.get("name") or source.name)
    slug = _unique_slug(db, slugify(skill_name, "skill"))
    target = config.skill_library_dir / slug
    if target.exists():
        raise ValueError(f"A skill folder already exists at {target}.")
    shutil.copytree(source, target)
    row = Skill(
        name=skill_name[:200],
        slug=slug,
        description=(description or str(meta.get("description") or ""))[:2000],
        version=str(meta.get("version") or "1.0.0")[:40],
        source="imported",
        path=str(target),
        compatible_agents=["claude_code", "antigravity", "manual"],
        required_tools=meta.get("tools") if isinstance(meta.get("tools"), list) else [],
        permissions=meta.get("permissions") if isinstance(meta.get("permissions"), list) else [],
        installed_agents=[],
        status="review",
        approved=False,
        metadata_json={
            "warnings": inspection["warnings"],
            "files": inspection["files"],
            "dependencies": inspection["dependencies"],
            "has_scripts": inspection["has_scripts"],
            "source_path": str(source),
        },
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _unique_slug(db: Session, base: str) -> str:
    slug = base
    index = 2
    while db.query(Skill).filter(Skill.slug == slug).first():
        slug = f"{base}-{index}"
        index += 1
    return slug


def install_skill(
    db: Session,
    skill: Skill,
    *,
    channel_id: int,
    agents: Iterable[str],
) -> dict:
    if not skill.approved:
        raise ValueError("Review and approve this skill before installing it.")
    channel = db.get(Channel, channel_id)
    if not channel or not channel.animation_project_path:
        raise ValueError("Choose a channel with a permanent animation project.")
    project = Path(channel.animation_project_path)
    source = Path(skill.path)
    if not source.exists() or not (source / "SKILL.md").exists():
        raise ValueError("The skill library folder is missing SKILL.md.")
    installed: list[str] = []
    targets: list[str] = []
    requested = [agent for agent in agents if agent in {"claude_code", "antigravity", "manual"}]
    if not requested:
        raise ValueError("Choose at least one agent.")
    for agent in requested:
        if agent == "claude_code":
            target = project / ".claude" / "skills" / skill.slug
            _copy_tree(source, target)
            targets.append(str(target))
            installed.append(agent)
        elif agent == "antigravity":
            target = project / ".agent" / "skills" / skill.slug
            _copy_tree(source, target)
            targets.append(str(target))
            installed.append(agent)
        elif agent == "manual":
            target = project / ".katha" / "skills" / skill.slug
            _copy_tree(source, target)
            targets.append(str(target))
            installed.append(agent)
    shared_target = project / ".katha" / "skills" / skill.slug
    if not shared_target.exists():
        _copy_tree(source, shared_target)
        targets.append(str(shared_target))
    installed_now = sorted(set((skill.installed_agents or []) + installed))
    skill.installed_agents = installed_now
    skill.status = "installed"
    db.commit()
    _write_skill_rule(project, db)
    _update_project_skill_index(project, db)
    return {
        "ok": True,
        "installed_agents": installed,
        "targets": targets,
        "shared_library": str(source),
        "note": (
            "Claude Code loads .claude/skills. Antigravity also receives the skill through "
            "AGENTS.md, SKILLS.md and .agent/rules/katha-skills.md; .agent/skills is installed "
            "for versions that support it."
        ),
    }


def uninstall_skill(db: Session, skill: Skill, channel_id: int) -> dict:
    channel = db.get(Channel, channel_id)
    if not channel or not channel.animation_project_path:
        raise ValueError("Choose a channel with a permanent animation project.")
    project = Path(channel.animation_project_path)
    removed: list[str] = []
    for target in [
        project / ".claude" / "skills" / skill.slug,
        project / ".agent" / "skills" / skill.slug,
        project / ".katha" / "skills" / skill.slug,
    ]:
        if target.exists():
            shutil.rmtree(target)
            removed.append(str(target))
    skill.installed_agents = []
    skill.status = "available"
    db.commit()
    _write_skill_rule(project, db)
    _update_project_skill_index(project, db)
    return {"ok": True, "removed": removed}


def _copy_tree(source: Path, target: Path) -> None:
    if target.exists():
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target)


def _write_skill_rule(project: Path, db: Session) -> None:
    installed = db.query(Skill).filter(Skill.status == "installed").order_by(Skill.name).all()
    lines = [
        "# Installed Katha skills",
        "",
        "These skills are shared by every animation agent in this project. Read the linked SKILL.md",
        "before using one. No skill may read credentials, browser profiles, cookies or private account data.",
        "",
    ]
    if not installed:
        lines.append("_No project skills installed yet._")
    for skill in installed:
        lines.extend(
            [
                f"## {skill.name}",
                "",
                skill.description,
                "",
                f"- Shared skill: `.katha/skills/{skill.slug}/SKILL.md`",
                f"- Claude Code: `.claude/skills/{skill.slug}/SKILL.md`",
                f"- Antigravity: `.agent/skills/{skill.slug}/SKILL.md`",
                "",
            ]
        )
    target = project / ".agent" / "rules" / "katha-skills.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def _update_project_skill_index(project: Path, db: Session) -> None:
    installed = db.query(Skill).filter(Skill.status == "installed").order_by(Skill.name).all()
    block = [
        "<!-- KATHA-SKILLS:START -->",
        "## Installed skills",
        "",
    ]
    if not installed:
        block.append("_No project skills installed yet._")
    for skill in installed:
        block.append(f"- **{skill.name}** — `{skill.description}` (`SKILL.md` in `.katha/skills/{skill.slug}/`)")
    block.extend(["", "<!-- KATHA-SKILLS:END -->"])
    target = project / "SKILLS.md"
    existing = target.read_text(encoding="utf-8") if target.exists() else "# Shared Skills\n"
    if "<!-- KATHA-SKILLS:START -->" in existing:
        existing = re.sub(
            r"<!-- KATHA-SKILLS:START -->.*?<!-- KATHA-SKILLS:END -->",
            "\n".join(block),
            existing,
            flags=re.DOTALL,
        )
    else:
        existing = existing.rstrip() + "\n\n" + "\n".join(block) + "\n"
    target.write_text(existing, encoding="utf-8")


def skill_dict(skill: Skill, detail: bool = False) -> dict:
    data = {
        "id": skill.id,
        "name": skill.name,
        "slug": skill.slug,
        "description": skill.description,
        "version": skill.version,
        "source": skill.source,
        "path": skill.path,
        "compatible_agents": skill.compatible_agents or [],
        "required_tools": skill.required_tools or [],
        "permissions": skill.permissions or [],
        "installed_agents": skill.installed_agents or [],
        "status": skill.status,
        "approved": skill.approved,
        "metadata": skill.metadata_json or {},
        "created_at": skill.created_at.isoformat() if skill.created_at else None,
    }
    if detail:
        try:
            inspection = inspect_skill_folder(Path(skill.path))
            data["inspection"] = inspection
        except Exception as exc:  # noqa: BLE001
            data["inspection"] = {"error": str(exc), "files": [], "warnings": []}
    return data
