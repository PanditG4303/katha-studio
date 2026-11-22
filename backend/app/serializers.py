from __future__ import annotations

from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from .models import (
    AudioAsset,
    Channel,
    Character,
    ContentIdea,
    DialogueLine,
    Episode,
    IdeationSession,
    JobRecord,
    Project,
    Publication,
    ReferenceStyle,
    Scene,
    SocialAccount,
    UploadJob,
    Video,
    VoiceProfile,
)
from .utils import iso


def channel_dict(db: Session, channel: Channel, include_stats: bool = True) -> dict:
    data = {
        "id": channel.id,
        "name": channel.name,
        "slug": channel.slug,
        "description": channel.description,
        "category": channel.category,
        "language": channel.language,
        "logo_path": channel.logo_path,
        "preferred_formats": channel.preferred_formats or [],
        "animation_style": channel.animation_style,
        "narrator_voice": channel.narrator_voice,
        "voice_settings": channel.voice_settings or {},
        "subtitle_preferences": channel.subtitle_preferences or {},
        "typography": channel.typography or {},
        "music_preferences": channel.music_preferences,
        "accent_color": channel.accent_color,
        "animation_project_path": channel.animation_project_path,
        "output_folder": channel.output_folder,
        "watch_folder": channel.watch_folder,
        "is_demo": channel.is_demo,
        "archived": channel.archived,
        "created_at": iso(channel.created_at),
        "updated_at": iso(channel.updated_at),
    }
    if include_stats:
        projects = db.query(Project).filter(Project.channel_id == channel.id).all()
        videos = db.query(Video).filter(Video.channel_id == channel.id).all()
        data["stats"] = {
            "projects": len(projects),
            "videos": len(videos),
            "published": len([v for v in videos if v.production_status == "PUBLISHED"]),
            "in_production": len(
                [
                    v
                    for v in videos
                    if v.production_status
                    not in {"PUBLISHED", "ARCHIVED", "SCHEDULED", "FAILED"}
                ]
            ),
            "drafts": len([p for p in projects if p.status in {"IDEA", "RESEARCHING", "SCRIPT_READY", "AWAITING_VOICE"}]),
        }
    return data


def voice_profile_dict(db: Session, profile: VoiceProfile) -> dict:
    channel = db.get(Channel, profile.channel_id) if profile.channel_id else None
    return {
        "id": profile.id,
        "channel_id": profile.channel_id,
        "channel_name": channel.name if channel else "All channels",
        "name": profile.name,
        "role": profile.role,
        "provider": profile.provider,
        "provider_voice_id": profile.provider_voice_id,
        "model_id": profile.model_id,
        "language": profile.language,
        "settings": profile.settings or {},
        "description": profile.description,
        "is_demo": profile.is_demo,
        "created_at": iso(profile.created_at),
    }


def idea_dict(idea: ContentIdea) -> dict:
    return {
        "id": idea.id,
        "session_id": idea.session_id,
        "title": idea.title,
        "short_description": idea.short_description,
        "hook": idea.hook,
        "story_premise": idea.story_premise,
        "why_interesting": idea.why_interesting,
        "estimated_duration": idea.estimated_duration,
        "episode_count": idea.episode_count,
        "visual_potential": idea.visual_potential,
        "source_status": idea.source_status,
        "selected": idea.selected,
        "project_id": idea.project_id,
        "created_at": iso(idea.created_at),
    }


def ideation_dict(db: Session, session: IdeationSession) -> dict:
    channel = db.get(Channel, session.channel_id)
    return {
        "id": session.id,
        "channel_id": session.channel_id,
        "channel_name": channel.name if channel else "",
        "request": session.request or {},
        "analysis": session.analysis,
        "suggested_structure": session.suggested_structure,
        "status": session.status,
        "provider": session.provider,
        "model": session.model,
        "error": session.error,
        "is_demo": session.is_demo,
        "created_at": iso(session.created_at),
        "ideas": [idea_dict(idea) for idea in session.ideas],
    }


def dialogue_dict(line: DialogueLine) -> dict:
    return {
        "id": line.id,
        "scene_id": line.scene_id,
        "line_order": line.line_order,
        "speaker": line.speaker,
        "speaker_type": line.speaker_type,
        "text": line.text,
        "emotion": line.emotion,
        "delivery": line.delivery,
        "start_time": line.start_time,
        "end_time": line.end_time,
        "voice_profile_id": line.voice_profile_id,
        "provider": line.provider,
        "audio_path": line.audio_path,
        "audio_duration": line.audio_duration,
        "audio_status": line.audio_status,
        "audio_error": line.audio_error,
    }


def scene_dict(scene: Scene) -> dict:
    return {
        "id": scene.id,
        "episode_id": scene.episode_id,
        "scene_number": scene.scene_number,
        "heading": scene.heading,
        "start_time": scene.start_time,
        "end_time": scene.end_time,
        "action": scene.action,
        "visual_composition": scene.visual_composition,
        "background": scene.background,
        "lighting": scene.lighting,
        "camera_movement": scene.camera_movement,
        "expressions": scene.expressions,
        "animation_instructions": scene.animation_instructions,
        "sound_effects": scene.sound_effects,
        "music_cue": scene.music_cue,
        "transition": scene.transition,
        "continuity": scene.continuity,
        "narration": scene.narration,
        "dialogue": [dialogue_dict(line) for line in scene.dialogue_lines],
    }


def episode_dict(episode: Episode, include_scenes: bool = False) -> dict:
    data = {
        "id": episode.id,
        "project_id": episode.project_id,
        "episode_number": episode.episode_number,
        "title": episode.title,
        "summary": episode.summary,
        "narration_script": episode.narration_script,
        "screenplay": episode.screenplay,
        "opening_hook": episode.opening_hook,
        "outro": episode.outro,
        "teaser": episode.teaser,
        "cta": episode.cta,
        "estimated_duration": episode.estimated_duration,
        "status": episode.status,
        "subtitle_path": episode.subtitle_path,
        "audio_manifest_path": episode.audio_manifest_path,
        "is_demo": episode.is_demo,
        "scene_count": len(episode.scenes),
    }
    if include_scenes:
        data["scenes"] = [scene_dict(scene) for scene in episode.scenes]
        lines = [line for scene in episode.scenes for line in scene.dialogue_lines]
        data["dialogue_count"] = len(lines)
        data["audio_ready_count"] = len([line for line in lines if line.audio_status == "ready"])
    return data


def character_dict(character: Character) -> dict:
    return {
        "id": character.id,
        "project_id": character.project_id,
        "name": character.name,
        "role": character.role,
        "description": character.description,
        "appearance": character.appearance,
        "personality": character.personality,
        "continuity_notes": character.continuity_notes,
        "voice_profile_id": character.voice_profile_id,
    }


def project_summary(db: Session, project: Project) -> dict:
    channel = db.get(Channel, project.channel_id)
    videos = db.query(Video).filter(Video.project_id == project.id).all()
    return {
        "id": project.id,
        "channel_id": project.channel_id,
        "channel_name": channel.name if channel else "",
        "channel_slug": channel.slug if channel else "",
        "title": project.title,
        "slug": project.slug,
        "category": project.category,
        "language": project.language,
        "audience": project.audience,
        "format": project.format,
        "aspect_ratio": project.aspect_ratio,
        "tone": project.tone,
        "status": project.status,
        "source_status": project.source_status,
        "animation_style": project.animation_style,
        "production_package_path": project.production_package_path,
        "animation_episode_path": project.animation_episode_path,
        "provider": project.provider,
        "model": project.model,
        "is_demo": project.is_demo,
        "last_error": project.last_error,
        "approved_at": iso(project.approved_at),
        "episode_count": len(project.episodes),
        "video_count": len(videos),
        "created_at": iso(project.created_at),
        "updated_at": iso(project.updated_at),
    }


def project_detail(db: Session, project: Project) -> dict:
    data = project_summary(db, project)
    data.update(
        {
            "idea": project.idea or {},
            "research_summary": project.research_summary,
            "sources": project.sources or [],
            "opening_hook": project.opening_hook,
            "outro": project.outro,
            "cta": project.cta,
            "episodes": [episode_dict(episode, include_scenes=True) for episode in project.episodes],
            "characters": [character_dict(character) for character in project.characters],
            "videos": [video_dict(db, video, compact=True) for video in project.videos],
        }
    )
    return data


def video_dict(db: Session, video: Video, compact: bool = False) -> dict:
    channel = db.get(Channel, video.channel_id) if video.channel_id else None
    project = db.get(Project, video.project_id) if video.project_id else None
    episode = db.get(Episode, video.episode_id) if video.episode_id else None
    data = {
        "id": video.id,
        "channel_id": video.channel_id,
        "channel_name": channel.name if channel else "Unassigned",
        "channel_accent": channel.accent_color if channel else "#c88f78",
        "project_id": video.project_id,
        "project_title": project.title if project else "",
        "episode_id": video.episode_id,
        "episode_title": episode.title if episode else "",
        "title": video.title,
        "category": video.category,
        "episode_number": video.episode_number,
        "description": video.description,
        "hashtags": video.hashtags or [],
        "tags": video.tags or [],
        "thumbnail_path": video.thumbnail_path,
        "has_thumbnail": bool(video.thumbnail_path and Path(video.thumbnail_path).exists()),
        "aspect_ratio": video.aspect_ratio,
        "duration": video.duration,
        "width": video.width,
        "height": video.height,
        "fps": video.fps,
        "codec": video.codec,
        "project_location": video.project_location,
        "production_package_path": video.production_package_path,
        "audio_path": video.audio_path,
        "final_video_path": video.final_video_path,
        "has_video": bool(video.final_video_path and Path(video.final_video_path).exists()),
        "subtitle_path": video.subtitle_path,
        "production_status": video.production_status,
        "youtube_status": video.youtube_status,
        "youtube_url": video.youtube_url,
        "youtube_video_id": video.youtube_video_id,
        "youtube_account_id": video.youtube_account_id,
        "scheduled_at": iso(video.scheduled_at),
        "published_at": iso(video.published_at),
        "platform": video.platform,
        "source": video.source,
        "selected_agent": video.selected_agent,
        "browser_account_id": video.browser_account_id,
        "platform_url": video.platform_url,
        "output_state": video.output_state,
        "file_size": video.file_size,
        "is_demo": video.is_demo,
        "archived": video.archived,
        "created_at": iso(video.created_at),
        "updated_at": iso(video.updated_at),
    }
    if not compact:
        data["publications"] = [publication_dict(publication) for publication in video.publications]
        data["upload_jobs"] = [upload_job_dict(job) for job in video.upload_jobs]
    return data


def social_account_dict(account: SocialAccount) -> dict:
    return {
        "id": account.id,
        "provider": account.provider,
        "account_id": account.account_id,
        "account_name": account.account_name,
        "handle": account.handle,
        "avatar_url": account.avatar_url,
        "status": account.status,
        "scopes": account.scopes or [],
        "last_synced_at": iso(account.last_synced_at),
        "is_demo": account.is_demo,
    }


def upload_job_dict(job: UploadJob) -> dict:
    return {
        "id": job.id,
        "video_id": job.video_id,
        "account_id": job.account_id,
        "platform": job.platform,
        "status": job.status,
        "progress": job.progress,
        "remote_video_id": job.remote_video_id,
        "remote_url": job.remote_url,
        "error": job.error,
        "attempts": job.attempts,
        "created_at": iso(job.created_at),
        "started_at": iso(job.started_at),
        "finished_at": iso(job.finished_at),
    }


def publication_dict(publication: Publication) -> dict:
    return {
        "id": publication.id,
        "video_id": publication.video_id,
        "channel_id": publication.channel_id,
        "account_id": publication.account_id,
        "platform": publication.platform,
        "status": publication.status,
        "scheduled_at": iso(publication.scheduled_at),
        "published_at": iso(publication.published_at),
        "remote_url": publication.remote_url,
        "notes": publication.notes,
        "caption": publication.caption,
        "is_demo": publication.is_demo,
        "created_at": iso(publication.created_at),
    }


def audio_asset_dict(asset: AudioAsset, db: Session | None = None) -> dict:
    channel = db.get(Channel, asset.channel_id) if db and asset.channel_id else None
    project = db.get(Project, asset.project_id) if db and asset.project_id else None
    return {
        "id": asset.id,
        "channel_id": asset.channel_id,
        "channel_name": channel.name if channel else "Unassigned",
        "project_id": asset.project_id,
        "project_title": project.title if project else "",
        "episode_id": asset.episode_id,
        "kind": asset.kind,
        "title": asset.title,
        "path": asset.path,
        "duration": asset.duration,
        "bpm": asset.bpm,
        "energy": asset.energy,
        "waveform": asset.waveform or [],
        "sections": asset.sections or [],
        "lyrics": asset.lyrics or [],
        "tags": asset.tags or [],
        "rights_note": asset.rights_note,
        "metadata": asset.metadata_json or {},
        "is_demo": asset.is_demo,
        "created_at": iso(asset.created_at),
    }


def reference_style_dict(style: ReferenceStyle) -> dict:
    return {
        "id": style.id,
        "channel_id": style.channel_id,
        "name": style.name,
        "source_type": style.source_type,
        "source_path": style.source_path,
        "source_url": style.source_url,
        "summary": style.summary,
        "analysis": style.analysis or {},
        "is_reusable": style.is_reusable,
        "created_at": iso(style.created_at),
    }


def job_dict(job: JobRecord) -> dict:
    return {
        "id": job.id,
        "type": job.type,
        "status": job.status,
        "progress": job.progress,
        "message": job.message,
        "error": job.error,
        "result": job.result or {},
        "payload": job.payload or {},
        "created_at": iso(job.created_at),
        "started_at": iso(job.started_at),
        "finished_at": iso(job.finished_at),
    }


def browser_publish_dict(publish, db: Session | None = None) -> dict:
    from .models import BrowserAccount, Video

    account = db.get(BrowserAccount, publish.browser_account_id) if db else None
    video = db.get(Video, publish.video_id) if db else None
    return {
        "id": publish.id,
        "video_id": publish.video_id,
        "video_title": video.title if video else "",
        "video_path": video.final_video_path if video else "",
        "browser_account_id": publish.browser_account_id,
        "account_label": account.label if account else "",
        "platform": publish.platform,
        "action": publish.action,
        "status": publish.status,
        "stage": publish.stage,
        "title": publish.title,
        "description": publish.description,
        "tags": publish.tags or [],
        "visibility": publish.visibility,
        "scheduled_at": iso(publish.scheduled_at),
        "remote_url": publish.remote_url,
        "remote_id": publish.remote_id,
        "screenshot_path": publish.screenshot_path,
        "log": publish.log,
        "error": publish.error,
        "confirmation_required": publish.confirmation_required,
        "confirmed_at": iso(publish.confirmed_at),
        "started_at": iso(publish.started_at),
        "finished_at": iso(publish.finished_at),
        "attempts": publish.attempts,
        "created_at": iso(publish.created_at),
    }
