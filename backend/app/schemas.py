from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- channels
class ChannelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = ""
    category: str = "Storytelling"
    language: str = "Hindi"
    preferred_formats: list[str] = Field(default_factory=lambda: ["16:9 long-form", "9:16 short"])
    animation_style: str = ""
    narrator_voice: str = ""
    voice_settings: dict = Field(default_factory=dict)
    subtitle_preferences: dict = Field(default_factory=dict)
    typography: dict = Field(default_factory=dict)
    music_preferences: str = ""
    accent_color: str = "#c88f78"
    logo_path: Optional[str] = None
    output_folder: Optional[str] = None
    watch_folder: Optional[str] = None
    is_demo: bool = False


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    language: Optional[str] = None
    preferred_formats: Optional[list[str]] = None
    animation_style: Optional[str] = None
    narrator_voice: Optional[str] = None
    voice_settings: Optional[dict] = None
    subtitle_preferences: Optional[dict] = None
    typography: Optional[dict] = None
    music_preferences: Optional[str] = None
    accent_color: Optional[str] = None
    logo_path: Optional[str] = None
    animation_project_path: Optional[str] = None
    output_folder: Optional[str] = None
    watch_folder: Optional[str] = None
    archived: Optional[bool] = None


# --------------------------------------------------------------------------- ideation
class IdeationRequest(BaseModel):
    channel_id: int
    prompt: str = ""
    input_text: str = ""
    reference_urls: list[str] = Field(default_factory=list)
    asset_ids: list[int] = Field(default_factory=list)
    category: str = "Storytelling"
    language: str = "Hindi"
    audience: str = "General audience"
    video_count: int = Field(default=5, ge=1, le=30)
    desired_duration: int = Field(default=10, ge=1, le=180)
    aspect_ratio: str = "16:9"
    content_form: str = "long-form"
    series_mode: str = "smart"
    animation_style: str = ""
    voice_style: str = ""
    research_depth: str = "standard"
    tone: str = "Cinematic"
    provider: Optional[str] = None
    model: Optional[str] = None
    demo: bool = False


class GenerateScriptsRequest(BaseModel):
    idea_ids: list[int]
    provider: Optional[str] = None
    model: Optional[str] = None


class ReferenceAnalyzeRequest(BaseModel):
    path: str
    channel_id: Optional[int] = None
    name: str = ""
    source_url: str = ""
    save_to_channel: bool = False
    apply_style: bool = False


class ReferenceUrlRequest(BaseModel):
    url: str
    channel_id: Optional[int] = None


# --------------------------------------------------------------------------- projects / scripts
class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    language: Optional[str] = None
    audience: Optional[str] = None
    format: Optional[str] = None
    aspect_ratio: Optional[str] = None
    tone: Optional[str] = None
    research_summary: Optional[str] = None
    sources: Optional[list] = None
    opening_hook: Optional[str] = None
    outro: Optional[str] = None
    cta: Optional[str] = None
    animation_style: Optional[str] = None
    status: Optional[str] = None
    archived: Optional[bool] = None


class EpisodeUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    narration_script: Optional[str] = None
    screenplay: Optional[str] = None
    opening_hook: Optional[str] = None
    outro: Optional[str] = None
    teaser: Optional[str] = None
    cta: Optional[str] = None
    estimated_duration: Optional[int] = None
    status: Optional[str] = None


class SceneUpdate(BaseModel):
    heading: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    action: Optional[str] = None
    visual_composition: Optional[str] = None
    background: Optional[str] = None
    lighting: Optional[str] = None
    camera_movement: Optional[str] = None
    expressions: Optional[str] = None
    animation_instructions: Optional[str] = None
    sound_effects: Optional[str] = None
    music_cue: Optional[str] = None
    transition: Optional[str] = None
    continuity: Optional[str] = None
    narration: Optional[str] = None


class DialogueUpdate(BaseModel):
    speaker: Optional[str] = None
    speaker_type: Optional[str] = None
    text: Optional[str] = None
    emotion: Optional[str] = None
    delivery: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    voice_profile_id: Optional[int] = None


class ApproveScriptRequest(BaseModel):
    approved: bool = True


# --------------------------------------------------------------------------- voice / music
class VoiceProfileCreate(BaseModel):
    channel_id: Optional[int] = None
    name: str
    role: str = "Custom"
    provider: str = "elevenlabs"
    provider_voice_id: str = ""
    model_id: str = ""
    language: str = "Hindi"
    settings: dict = Field(default_factory=dict)
    description: str = ""
    is_demo: bool = False


class VoiceProfileUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    provider: Optional[str] = None
    provider_voice_id: Optional[str] = None
    model_id: Optional[str] = None
    language: Optional[str] = None
    settings: Optional[dict] = None
    description: Optional[str] = None


class VoiceGenerateRequest(BaseModel):
    project_id: int
    provider: str = "elevenlabs"
    voice_profile_id: Optional[int] = None
    model_id: Optional[str] = None
    language: str = "Hindi"
    line_ids: Optional[list[int]] = None
    episode_id: Optional[int] = None
    overwrite: bool = False


class DialogueVoiceRequest(BaseModel):
    voice_profile_id: int
    provider: Optional[str] = None


class MusicImportRequest(BaseModel):
    path: str
    channel_id: Optional[int] = None
    project_id: Optional[int] = None
    title: str = ""
    tags: list[str] = Field(default_factory=list)
    rights_note: str = ""
    copy_to_library: bool = True
    workflow: str = ""


class MusicLyricsRequest(BaseModel):
    lyrics: list[dict]


class MusicUpdateRequest(BaseModel):
    title: Optional[str] = None
    channel_id: Optional[int] = None
    project_id: Optional[int] = None
    tags: Optional[list[str]] = None
    rights_note: Optional[str] = None
    lyrics: Optional[list[dict]] = None


# --------------------------------------------------------------------------- videos
class VideoUpdate(BaseModel):
    title: Optional[str] = None
    channel_id: Optional[int] = None
    project_id: Optional[int] = None
    episode_id: Optional[int] = None
    category: Optional[str] = None
    episode_number: Optional[int] = None
    description: Optional[str] = None
    hashtags: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    aspect_ratio: Optional[str] = None
    production_status: Optional[str] = None
    youtube_status: Optional[str] = None
    youtube_url: Optional[str] = None
    platform: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    subtitle_path: Optional[str] = None
    thumbnail_path: Optional[str] = None
    archived: Optional[bool] = None


class VideoBulkUpdate(BaseModel):
    video_ids: list[int]
    channel_id: Optional[int] = None
    production_status: Optional[str] = None
    platform: Optional[str] = None
    category: Optional[str] = None
    archived: Optional[bool] = None
    tags: Optional[list[str]] = None


class VideoImportRequest(BaseModel):
    path: str
    channel_id: Optional[int] = None
    project_id: Optional[int] = None
    title: Optional[str] = None
    source: str = "manual"
    wait_for_stable: bool = False


class MarkPublishedRequest(BaseModel):
    youtube_url: str
    published_at: Optional[datetime] = None


# --------------------------------------------------------------------------- providers / settings
class CredentialRequest(BaseModel):
    provider: str
    value: str
    client_id: Optional[str] = None
    client_secret: Optional[str] = None


class ProviderUpdate(BaseModel):
    enabled: Optional[bool] = None
    default_model: Optional[str] = None
    base_url: Optional[str] = None
    models_url: Optional[str] = None


class ProviderTestRequest(BaseModel):
    provider: str


class StorageSettings(BaseModel):
    workspace_root: Optional[str] = None
    channels_root: Optional[str] = None
    packages_root: Optional[str] = None
    outputs_root: Optional[str] = None
    assets_root: Optional[str] = None
    music_root: Optional[str] = None
    imports_root: Optional[str] = None
    watcher_enabled: Optional[bool] = None
    watcher_interval_seconds: Optional[int] = Field(default=None, ge=5, le=300)
    timezone: Optional[str] = None
    default_provider: Optional[str] = None
    default_language: Optional[str] = None


class GeneralSettings(BaseModel):
    youtube_category: Optional[str] = None
    onboarding_complete: Optional[bool] = None


# --------------------------------------------------------------------------- youtube / publishing
class YouTubeClientRequest(BaseModel):
    client_id: str
    client_secret: str


class UploadRequest(BaseModel):
    video_id: int
    account_id: int
    title: str
    description: str = ""
    tags: list[str] = Field(default_factory=list)
    category_id: str = "24"
    privacy: Literal["private", "unlisted", "public"] = "private"
    publish_at: Optional[datetime] = None
    made_for_kids: bool = False
    thumbnail_path: Optional[str] = None
    subtitle_path: Optional[str] = None
    language: str = "hi"
    confirm: bool = False


class PublicationCreate(BaseModel):
    video_id: int
    channel_id: Optional[int] = None
    account_id: Optional[int] = None
    platform: str = "youtube"
    status: str = "draft"
    scheduled_at: Optional[datetime] = None
    notes: str = ""
    caption: str = ""


class PublicationUpdate(BaseModel):
    status: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    notes: Optional[str] = None
    caption: Optional[str] = None
    remote_url: Optional[str] = None
    published_at: Optional[datetime] = None


class MetadataPrepareRequest(BaseModel):
    video_id: int
    provider: Optional[str] = None
    model: Optional[str] = None
    platform: str = "youtube"


class PackageGenerateRequest(BaseModel):
    project_id: Optional[int] = None
    include_audio: bool = True
    overwrite: bool = False


# --------------------------------------------------------------------------- misc
class OpenPathRequest(BaseModel):
    path: str


class PathRequest(BaseModel):
    path: str


class JobResponse(ORMModel):
    id: int
    type: str
    status: str
    progress: float
    message: str
    error: str
    result: dict
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]


class BulkDeleteRequest(BaseModel):
    ids: list[int]
    confirm: bool = False

    @field_validator("confirm")
    @classmethod
    def must_confirm(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Explicit confirmation is required.")
        return value
