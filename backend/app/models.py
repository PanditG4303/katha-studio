from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, utcnow


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class Channel(Base, TimestampMixin):
    __tablename__ = "channels"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(80), default="Storytelling")
    language: Mapped[str] = mapped_column(String(40), default="Hindi")
    logo_path: Mapped[Optional[str]] = mapped_column(String(1000))
    preferred_formats: Mapped[list] = mapped_column(JSON, default=list)
    animation_style: Mapped[str] = mapped_column(Text, default="")
    narrator_voice: Mapped[str] = mapped_column(String(160), default="")
    voice_settings: Mapped[dict] = mapped_column(JSON, default=dict)
    subtitle_preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    typography: Mapped[dict] = mapped_column(JSON, default=dict)
    music_preferences: Mapped[str] = mapped_column(Text, default="")
    accent_color: Mapped[str] = mapped_column(String(20), default="#c88f78")
    channels_root: Mapped[Optional[str]] = mapped_column(String(1000))
    animation_project_path: Mapped[Optional[str]] = mapped_column(String(1000))
    output_folder: Mapped[Optional[str]] = mapped_column(String(1000))
    watch_folder: Mapped[Optional[str]] = mapped_column(String(1000))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)

    projects: Mapped[list["Project"]] = relationship(back_populates="channel", cascade="all, delete-orphan")
    voice_profiles: Mapped[list["VoiceProfile"]] = relationship(back_populates="channel")
    videos: Mapped[list["Video"]] = relationship(back_populates="channel")


class VoiceProfile(Base, TimestampMixin):
    __tablename__ = "voice_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[Optional[int]] = mapped_column(ForeignKey("channels.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    role: Mapped[str] = mapped_column(String(80), default="Custom")
    provider: Mapped[str] = mapped_column(String(40), default="elevenlabs")
    provider_voice_id: Mapped[str] = mapped_column(String(200), default="")
    model_id: Mapped[str] = mapped_column(String(200), default="")
    language: Mapped[str] = mapped_column(String(40), default="Hindi")
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    description: Mapped[str] = mapped_column(Text, default="")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    channel: Mapped[Optional[Channel]] = relationship(back_populates="voice_profiles")


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("channels.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), nullable=False)
    category: Mapped[str] = mapped_column(String(80), default="Storytelling")
    language: Mapped[str] = mapped_column(String(40), default="Hindi")
    audience: Mapped[str] = mapped_column(String(120), default="General audience")
    format: Mapped[str] = mapped_column(String(40), default="long-form")
    aspect_ratio: Mapped[str] = mapped_column(String(20), default="16:9")
    tone: Mapped[str] = mapped_column(String(160), default="Cinematic")
    status: Mapped[str] = mapped_column(String(50), default="IDEA", index=True)
    idea: Mapped[dict] = mapped_column(JSON, default=dict)
    research_summary: Mapped[str] = mapped_column(Text, default="")
    sources: Mapped[list] = mapped_column(JSON, default=list)
    source_status: Mapped[str] = mapped_column(String(120), default="Not researched")
    opening_hook: Mapped[str] = mapped_column(Text, default="")
    outro: Mapped[str] = mapped_column(Text, default="")
    cta: Mapped[str] = mapped_column(Text, default="")
    reference_style_id: Mapped[Optional[int]] = mapped_column(ForeignKey("reference_styles.id"))
    animation_style: Mapped[str] = mapped_column(Text, default="")
    production_package_path: Mapped[Optional[str]] = mapped_column(String(1000))
    animation_episode_path: Mapped[Optional[str]] = mapped_column(String(1000))
    provider: Mapped[str] = mapped_column(String(40), default="")
    model: Mapped[str] = mapped_column(String(200), default="")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    last_error: Mapped[str] = mapped_column(Text, default="")
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)

    channel: Mapped[Channel] = relationship(back_populates="projects")
    episodes: Mapped[list["Episode"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Episode.episode_number"
    )
    characters: Mapped[list["Character"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    videos: Mapped[list["Video"]] = relationship(back_populates="project")


class Episode(Base, TimestampMixin):
    __tablename__ = "episodes"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    episode_number: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(300), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    narration_script: Mapped[str] = mapped_column(Text, default="")
    screenplay: Mapped[str] = mapped_column(Text, default="")
    opening_hook: Mapped[str] = mapped_column(Text, default="")
    outro: Mapped[str] = mapped_column(Text, default="")
    teaser: Mapped[str] = mapped_column(Text, default="")
    cta: Mapped[str] = mapped_column(Text, default="")
    estimated_duration: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(50), default="SCRIPT_READY")
    subtitle_path: Mapped[Optional[str]] = mapped_column(String(1000))
    audio_manifest_path: Mapped[Optional[str]] = mapped_column(String(1000))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    project: Mapped[Project] = relationship(back_populates="episodes")
    scenes: Mapped[list["Scene"]] = relationship(
        back_populates="episode", cascade="all, delete-orphan", order_by="Scene.scene_number"
    )
    videos: Mapped[list["Video"]] = relationship(back_populates="episode")


class Character(Base, TimestampMixin):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    role: Mapped[str] = mapped_column(String(160), default="Character")
    description: Mapped[str] = mapped_column(Text, default="")
    appearance: Mapped[str] = mapped_column(Text, default="")
    personality: Mapped[str] = mapped_column(Text, default="")
    continuity_notes: Mapped[str] = mapped_column(Text, default="")
    voice_profile_id: Mapped[Optional[int]] = mapped_column(ForeignKey("voice_profiles.id", ondelete="SET NULL"))

    project: Mapped[Project] = relationship(back_populates="characters")


class Scene(Base, TimestampMixin):
    __tablename__ = "scenes"

    id: Mapped[int] = mapped_column(primary_key=True)
    episode_id: Mapped[int] = mapped_column(ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False)
    scene_number: Mapped[int] = mapped_column(Integer, default=1)
    heading: Mapped[str] = mapped_column(String(300), default="")
    start_time: Mapped[float] = mapped_column(Float, default=0)
    end_time: Mapped[float] = mapped_column(Float, default=0)
    action: Mapped[str] = mapped_column(Text, default="")
    visual_composition: Mapped[str] = mapped_column(Text, default="")
    background: Mapped[str] = mapped_column(Text, default="")
    lighting: Mapped[str] = mapped_column(Text, default="")
    camera_movement: Mapped[str] = mapped_column(Text, default="")
    expressions: Mapped[str] = mapped_column(Text, default="")
    animation_instructions: Mapped[str] = mapped_column(Text, default="")
    sound_effects: Mapped[str] = mapped_column(Text, default="")
    music_cue: Mapped[str] = mapped_column(Text, default="")
    transition: Mapped[str] = mapped_column(Text, default="Cut")
    continuity: Mapped[str] = mapped_column(Text, default="")
    narration: Mapped[str] = mapped_column(Text, default="")

    episode: Mapped[Episode] = relationship(back_populates="scenes")
    dialogue_lines: Mapped[list["DialogueLine"]] = relationship(
        back_populates="scene", cascade="all, delete-orphan", order_by="DialogueLine.line_order"
    )


class DialogueLine(Base, TimestampMixin):
    __tablename__ = "dialogue_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    scene_id: Mapped[int] = mapped_column(ForeignKey("scenes.id", ondelete="CASCADE"), nullable=False)
    line_order: Mapped[int] = mapped_column(Integer, default=1)
    speaker: Mapped[str] = mapped_column(String(160), default="Narrator")
    speaker_type: Mapped[str] = mapped_column(String(40), default="narrator")
    text: Mapped[str] = mapped_column(Text, nullable=False)
    emotion: Mapped[str] = mapped_column(String(160), default="Neutral")
    delivery: Mapped[str] = mapped_column(Text, default="")
    start_time: Mapped[float] = mapped_column(Float, default=0)
    end_time: Mapped[float] = mapped_column(Float, default=0)
    voice_profile_id: Mapped[Optional[int]] = mapped_column(ForeignKey("voice_profiles.id", ondelete="SET NULL"))
    provider: Mapped[str] = mapped_column(String(40), default="")
    audio_path: Mapped[Optional[str]] = mapped_column(String(1000))
    audio_duration: Mapped[float] = mapped_column(Float, default=0)
    audio_status: Mapped[str] = mapped_column(String(40), default="pending")
    audio_error: Mapped[str] = mapped_column(Text, default="")

    scene: Mapped[Scene] = relationship(back_populates="dialogue_lines")


class IdeationSession(Base, TimestampMixin):
    __tablename__ = "ideation_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("channels.id", ondelete="CASCADE"), nullable=False)
    request: Mapped[dict] = mapped_column(JSON, default=dict)
    analysis: Mapped[str] = mapped_column(Text, default="")
    suggested_structure: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(40), default="generating")
    provider: Mapped[str] = mapped_column(String(40), default="")
    model: Mapped[str] = mapped_column(String(200), default="")
    error: Mapped[str] = mapped_column(Text, default="")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    channel: Mapped[Channel] = relationship()
    ideas: Mapped[list["ContentIdea"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="ContentIdea.id"
    )


class ContentIdea(Base, TimestampMixin):
    __tablename__ = "content_ideas"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("ideation_sessions.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    short_description: Mapped[str] = mapped_column(Text, default="")
    hook: Mapped[str] = mapped_column(Text, default="")
    story_premise: Mapped[str] = mapped_column(Text, default="")
    why_interesting: Mapped[str] = mapped_column(Text, default="")
    estimated_duration: Mapped[int] = mapped_column(Integer, default=600)
    episode_count: Mapped[int] = mapped_column(Integer, default=1)
    visual_potential: Mapped[str] = mapped_column(Text, default="")
    source_status: Mapped[str] = mapped_column(String(160), default="")
    selected: Mapped[bool] = mapped_column(Boolean, default=False)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    raw: Mapped[dict] = mapped_column(JSON, default=dict)

    session: Mapped[IdeationSession] = relationship(back_populates="ideas")


class ReferenceStyle(Base, TimestampMixin):
    __tablename__ = "reference_styles"

    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[Optional[int]] = mapped_column(ForeignKey("channels.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_type: Mapped[str] = mapped_column(String(40), default="local")
    source_path: Mapped[str] = mapped_column(String(1000), default="")
    source_url: Mapped[str] = mapped_column(String(2000), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    analysis: Mapped[dict] = mapped_column(JSON, default=dict)
    is_reusable: Mapped[bool] = mapped_column(Boolean, default=True)


class Asset(Base, TimestampMixin):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[Optional[int]] = mapped_column(ForeignKey("channels.id", ondelete="CASCADE"))
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(40), default="reference")
    name: Mapped[str] = mapped_column(String(300), default="")
    path: Mapped[str] = mapped_column(String(1000), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), default="")
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)


class AudioAsset(Base, TimestampMixin):
    __tablename__ = "audio_assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[Optional[int]] = mapped_column(ForeignKey("channels.id", ondelete="CASCADE"))
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    episode_id: Mapped[Optional[int]] = mapped_column(ForeignKey("episodes.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(40), default="music", index=True)
    title: Mapped[str] = mapped_column(String(300), default="")
    path: Mapped[str] = mapped_column(String(1000), nullable=False)
    duration: Mapped[float] = mapped_column(Float, default=0)
    bpm: Mapped[Optional[float]] = mapped_column(Float)
    energy: Mapped[Optional[float]] = mapped_column(Float)
    waveform: Mapped[list] = mapped_column(JSON, default=list)
    sections: Mapped[list] = mapped_column(JSON, default=list)
    lyrics: Mapped[list] = mapped_column(JSON, default=list)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    rights_note: Mapped[str] = mapped_column(Text, default="")
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Video(Base, TimestampMixin):
    __tablename__ = "videos"
    __table_args__ = (Index("ix_videos_status_channel", "production_status", "channel_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[Optional[int]] = mapped_column(ForeignKey("channels.id", ondelete="SET NULL"))
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    episode_id: Mapped[Optional[int]] = mapped_column(ForeignKey("episodes.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    category: Mapped[str] = mapped_column(String(80), default="")
    episode_number: Mapped[int] = mapped_column(Integer, default=1)
    description: Mapped[str] = mapped_column(Text, default="")
    hashtags: Mapped[list] = mapped_column(JSON, default=list)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(1000))
    aspect_ratio: Mapped[str] = mapped_column(String(20), default="16:9")
    duration: Mapped[float] = mapped_column(Float, default=0)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    fps: Mapped[float] = mapped_column(Float, default=0)
    codec: Mapped[str] = mapped_column(String(80), default="")
    project_location: Mapped[Optional[str]] = mapped_column(String(1000))
    production_package_path: Mapped[Optional[str]] = mapped_column(String(1000))
    audio_path: Mapped[Optional[str]] = mapped_column(String(1000))
    final_video_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    subtitle_path: Mapped[Optional[str]] = mapped_column(String(1000))
    thumbnail_source_path: Mapped[Optional[str]] = mapped_column(String(1000))
    production_status: Mapped[str] = mapped_column(String(50), default="ANIMATION_COMPLETED", index=True)
    youtube_status: Mapped[str] = mapped_column(String(50), default="not_uploaded")
    youtube_url: Mapped[Optional[str]] = mapped_column(String(1000))
    youtube_video_id: Mapped[Optional[str]] = mapped_column(String(80))
    youtube_account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("social_accounts.id", ondelete="SET NULL"))
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    platform: Mapped[str] = mapped_column(String(40), default="youtube")
    source: Mapped[str] = mapped_column(String(40), default="watch_folder")
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    file_mtime: Mapped[float] = mapped_column(Float, default=0)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)

    channel: Mapped[Optional[Channel]] = relationship(back_populates="videos")
    project: Mapped[Optional[Project]] = relationship(back_populates="videos")
    episode: Mapped[Optional[Episode]] = relationship(back_populates="videos")
    publications: Mapped[list["Publication"]] = relationship(back_populates="video", cascade="all, delete-orphan")
    upload_jobs: Mapped[list["UploadJob"]] = relationship(back_populates="video", cascade="all, delete-orphan")


class SocialAccount(Base, TimestampMixin):
    __tablename__ = "social_accounts"
    __table_args__ = (UniqueConstraint("provider", "account_id", name="uq_social_provider_account"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(40), default="youtube")
    account_id: Mapped[str] = mapped_column(String(200), nullable=False)
    account_name: Mapped[str] = mapped_column(String(300), default="")
    handle: Mapped[str] = mapped_column(String(200), default="")
    avatar_url: Mapped[str] = mapped_column(String(1000), default="")
    token_ref: Mapped[str] = mapped_column(String(200), default="")
    scopes: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(40), default="connected")
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class UploadJob(Base, TimestampMixin):
    __tablename__ = "upload_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    video_id: Mapped[int] = mapped_column(ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("social_accounts.id", ondelete="SET NULL"))
    platform: Mapped[str] = mapped_column(String(40), default="youtube")
    status: Mapped[str] = mapped_column(String(40), default="queued")
    progress: Mapped[float] = mapped_column(Float, default=0)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    remote_video_id: Mapped[str] = mapped_column(String(80), default="")
    remote_url: Mapped[str] = mapped_column(String(1000), default="")
    error: Mapped[str] = mapped_column(Text, default="")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    video: Mapped[Video] = relationship(back_populates="upload_jobs")
    account: Mapped[Optional[SocialAccount]] = relationship()


class Publication(Base, TimestampMixin):
    __tablename__ = "publications"

    id: Mapped[int] = mapped_column(primary_key=True)
    video_id: Mapped[int] = mapped_column(ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    channel_id: Mapped[Optional[int]] = mapped_column(ForeignKey("channels.id", ondelete="SET NULL"))
    account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("social_accounts.id", ondelete="SET NULL"))
    platform: Mapped[str] = mapped_column(String(40), default="youtube")
    status: Mapped[str] = mapped_column(String(40), default="draft", index=True)
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    remote_url: Mapped[str] = mapped_column(String(1000), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    caption: Mapped[str] = mapped_column(Text, default="")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    video: Mapped[Video] = relationship(back_populates="publications")
    channel: Mapped[Optional[Channel]] = relationship()


class ImportHistory(Base, TimestampMixin):
    __tablename__ = "import_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    file_mtime: Mapped[float] = mapped_column(Float, default=0)
    video_id: Mapped[Optional[int]] = mapped_column(ForeignKey("videos.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(40), default="imported")
    message: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(40), default="watch_folder")


class JobRecord(Base, TimestampMixin):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    progress: Mapped[float] = mapped_column(Float, default=0)
    message: Mapped[str] = mapped_column(Text, default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str] = mapped_column(Text, default="")
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime)


class Provider(Base, TimestampMixin):
    __tablename__ = "providers"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(120), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    base_url: Mapped[str] = mapped_column(String(1000), default="")
    models_url: Mapped[str] = mapped_column(String(1000), default="")
    default_model: Mapped[str] = mapped_column(String(200), default="")
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    credential_ref: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(40), default="not_configured")
    last_tested_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_error: Mapped[str] = mapped_column(Text, default="")


class AppSetting(Base, TimestampMixin):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)
