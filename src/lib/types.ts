export interface Channel {
  id: number;
  name: string;
  slug: string;
  description: string;
  category: string;
  language: string;
  logo_path: string | null;
  preferred_formats: string[];
  animation_style: string;
  narrator_voice: string;
  voice_settings: Record<string, unknown>;
  subtitle_preferences: Record<string, unknown>;
  typography: Record<string, unknown>;
  music_preferences: string;
  accent_color: string;
  animation_project_path: string | null;
  output_folder: string | null;
  watch_folder: string | null;
  is_demo: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
  stats?: {
    projects: number;
    videos: number;
    published: number;
    in_production: number;
    drafts: number;
  };
  projects?: ProjectSummary[];
  voice_profiles?: VoiceProfile[];
  reference_styles?: ReferenceStyle[];
  workspace_exists?: boolean;
}

export interface VoiceProfile {
  id: number;
  channel_id: number | null;
  channel_name: string;
  name: string;
  role: string;
  provider: string;
  provider_voice_id: string;
  model_id: string;
  language: string;
  settings: Record<string, unknown>;
  description: string;
  is_demo: boolean;
  created_at: string;
}

export interface Idea {
  id: number;
  session_id: number;
  title: string;
  short_description: string;
  hook: string;
  story_premise: string;
  why_interesting: string;
  estimated_duration: number;
  episode_count: number;
  visual_potential: string;
  source_status: string;
  selected: boolean;
  project_id: number | null;
  created_at: string;
}

export interface IdeationSession {
  id: number;
  channel_id: number;
  channel_name: string;
  request: Record<string, unknown>;
  analysis: string;
  suggested_structure: string;
  status: string;
  provider: string;
  model: string;
  error: string;
  is_demo: boolean;
  created_at: string;
  ideas: Idea[];
}

export interface DialogueLine {
  id: number;
  scene_id: number;
  line_order: number;
  speaker: string;
  speaker_type: string;
  text: string;
  emotion: string;
  delivery: string;
  start_time: number;
  end_time: number;
  voice_profile_id: number | null;
  provider: string;
  audio_path: string | null;
  audio_duration: number | null;
  audio_status: string;
  audio_error: string;
}

export interface Scene {
  id: number;
  episode_id: number;
  scene_number: number;
  heading: string;
  start_time: number;
  end_time: number;
  action: string;
  visual_composition: string;
  background: string;
  lighting: string;
  camera_movement: string;
  expressions: string;
  animation_instructions: string;
  sound_effects: string;
  music_cue: string;
  transition: string;
  continuity: string;
  narration: string;
  dialogue: DialogueLine[];
}

export interface Episode {
  id: number;
  project_id: number;
  episode_number: number;
  title: string;
  summary: string;
  narration_script: string;
  screenplay: string;
  opening_hook: string;
  outro: string;
  teaser: string;
  cta: string;
  estimated_duration: number;
  status: string;
  subtitle_path: string | null;
  audio_manifest_path: string | null;
  is_demo: boolean;
  scene_count: number;
  scenes?: Scene[];
  dialogue_count?: number;
  audio_ready_count?: number;
}

export interface Character {
  id: number;
  project_id: number;
  name: string;
  role: string;
  description: string;
  appearance: string;
  personality: string;
  continuity_notes: string;
  voice_profile_id: number | null;
}

export interface ProjectSummary {
  id: number;
  channel_id: number;
  channel_name: string;
  channel_slug: string;
  title: string;
  slug: string;
  category: string;
  language: string;
  audience: string;
  format: string;
  aspect_ratio: string;
  tone: string;
  status: string;
  source_status: string;
  animation_style: string;
  production_package_path: string | null;
  animation_episode_path: string | null;
  provider: string;
  model: string;
  is_demo: boolean;
  last_error: string;
  approved_at: string | null;
  episode_count: number;
  video_count: number;
  created_at: string;
  updated_at: string;
}

export interface Project extends ProjectSummary {
  idea: Record<string, string>;
  research_summary: string;
  sources: Array<Record<string, string> | string>;
  opening_hook: string;
  outro: string;
  cta: string;
  episodes: Episode[];
  characters: Character[];
  videos: Video[];
}

export interface Video {
  id: number;
  channel_id: number | null;
  channel_name: string;
  channel_accent: string;
  project_id: number | null;
  project_title: string;
  episode_id: number | null;
  episode_title: string;
  title: string;
  category: string;
  episode_number: number;
  description: string;
  hashtags: string[];
  tags: string[];
  thumbnail_path: string | null;
  has_thumbnail: boolean;
  aspect_ratio: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  project_location: string | null;
  production_package_path: string | null;
  audio_path: string | null;
  final_video_path: string | null;
  has_video: boolean;
  subtitle_path: string | null;
  production_status: string;
  youtube_status: string;
  youtube_url: string;
  youtube_video_id: string;
  youtube_account_id: number | null;
  scheduled_at: string | null;
  published_at: string | null;
  platform: string;
  source: string;
  selected_agent: string;
  browser_account_id: number | null;
  platform_url: string;
  output_state: string;
  file_size: number;
  is_demo: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
  publications?: Publication[];
  upload_jobs?: UploadJob[];
}

export interface SocialAccount {
  id: number;
  provider: string;
  account_id: string;
  account_name: string;
  handle: string;
  avatar_url: string;
  status: string;
  scopes: string[];
  last_synced_at: string | null;
  is_demo: boolean;
}

export interface UploadJob {
  id: number;
  video_id: number;
  account_id: number | null;
  platform: string;
  status: string;
  progress: number;
  remote_video_id: string;
  remote_url: string;
  error: string;
  attempts: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Publication {
  id: number;
  video_id: number;
  channel_id: number | null;
  account_id: number | null;
  platform: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  remote_url: string;
  notes: string;
  caption: string;
  is_demo: boolean;
  created_at: string;
  video?: Video;
  channel_name?: string;
}

export interface AudioAsset {
  id: number;
  channel_id: number | null;
  channel_name: string;
  project_id: number | null;
  project_title: string;
  episode_id: number | null;
  kind: string;
  title: string;
  path: string;
  duration: number;
  bpm: number | null;
  energy: number | null;
  waveform: number[];
  sections: Array<Record<string, unknown>>;
  lyrics: Array<{ start: number; end: number; text: string }>;
  tags: string[];
  rights_note: string;
  metadata: Record<string, unknown>;
  is_demo: boolean;
  created_at: string;
}

export interface ReferenceStyle {
  id: number;
  channel_id: number | null;
  name: string;
  source_type: string;
  source_path: string | null;
  source_url: string | null;
  summary: string;
  analysis: Record<string, unknown>;
  is_reusable: boolean;
  created_at: string;
}

export interface Job {
  id: number;
  type: string;
  status: string;
  progress: number;
  message: string;
  error: string;
  result: Record<string, unknown>;
  payload: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Provider {
  provider: string;
  label: string;
  enabled: boolean;
  base_url: string;
  models_url: string;
  default_model: string;
  config: Record<string, unknown>;
  status: string;
  last_tested_at: string | null;
  last_error: string;
  credential_status: string;
}

export interface ModelInfo {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: Record<string, unknown>;
}

export interface ClaudeStatus {
  desktop: { installed: boolean; path: string; running: boolean };
  cli: {
    installed: boolean;
    path: string;
    version: string;
    error: string;
    config_directory_exists: boolean;
    settings_exists: boolean;
    global_config_exists: boolean;
    env_api_key_present: boolean;
    auth_note: string;
  };
  handoff: { mode: string; automatic_prompt_injection: boolean; note: string };
}

export interface SystemInfo {
  app: string;
  version: string;
  platform: string;
  python: string;
  data_dir: string;
  database_path: string;
  log_dir: string;
  workspace_dir: string;
  storage_roots: Record<string, string>;
  media_tools: {
    ffmpeg: string;
    ffprobe: string;
    ffmpeg_available: boolean;
    ffprobe_available: boolean;
  };
  disk_free_gb: number;
  keyring: string;
  claude: ClaudeStatus;
  windows_voices: Array<{ name: string; culture?: string; gender?: string }>;
  counts: { channels: number; projects: number; videos: number };
}

export interface AppSettings {
  storage_roots: Record<string, string> | null;
  watcher_enabled: boolean | null;
  watcher_interval_seconds: number | null;
  timezone: string | null;
  default_provider: string | null;
  default_language: string | null;
  youtube_category: string | null;
  onboarding_complete: boolean | null;
  media_tools: SystemInfo["media_tools"];
}

export interface DashboardData {
  counts: Record<string, number>;
  by_channel: Array<{
    id: number;
    name: string;
    accent_color: string;
    total: number;
    published: number;
    scheduled: number;
    in_production: number;
  }>;
  by_platform: Array<{ platform: string; total: number; published: number; scheduled: number }>;
  recent_videos: Video[];
  upcoming_publications: Publication[];
  active_jobs: Job[];
}

export interface CalendarData {
  start: string;
  end: string;
  timezone: string;
  events: Publication[];
  drafts: Video[];
  failed_uploads: Array<UploadJob & { video: Video | null }>;
}

export interface YouTubeStatus {
  client: {
    configured: boolean;
    client_id: string;
    secret_saved: boolean;
    redirect_note: string;
    scopes: string[];
  };
  accounts: SocialAccount[];
  setup_note: string;
  quota_note: string;
}

export interface VoiceProviderOptions {
  providers: Array<{
    id: string;
    label: string;
    connected: boolean;
    requires_profile: boolean;
    description: string;
    requires_api_key?: boolean;
    note?: string;
  }>;
  elevenlabs_connected?: boolean;
  windows_voices?: Array<{ name: string; culture?: string; gender?: string }>;
  default_voices?: Record<string, string>;
}

export interface DiagnosticsResult {
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  all_critical_ok: boolean;
  time: string;
}

export interface ApiError extends Error {
  status?: number;
}

// ------------------------------------------------------------------ animation agents
export interface AgentInfo {
  agent: "claude_code" | "antigravity" | "manual";
  label: string;
  installed: boolean;
  path: string;
  version: string;
  error: string;
  authentication: { available: boolean | null; verified: boolean; note: string };
  project_access: boolean;
  busy: boolean;
  running_processes: string[];
  desktop?: { installed: boolean; path: string };
  application_path?: string;
  cli_path?: string;
  handoff: Record<string, boolean | string>;
}

export interface AgentLock {
  id: number;
  scope: string;
  channel_id: number | null;
  project_id: number | null;
  episode_id: number | null;
  agent: string;
  agent_label: string;
  handoff_id: number | null;
  status: string;
  note: string;
  acquired_at: string | null;
  heartbeat_at: string | null;
  released_at: string | null;
}

export interface AgentHandoff {
  id: number;
  channel_id: number | null;
  channel_name: string;
  project_id: number | null;
  project_title: string;
  episode_id: number | null;
  episode_title: string;
  agent: string;
  agent_label: string;
  mode: string;
  status: string;
  working_dir: string;
  package_path: string;
  prompt_path: string;
  command: string;
  pid: number | null;
  exit_code: number | null;
  output_tail: string;
  error: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
  prompt?: string;
}

export interface AgentSettings {
  selected_agent: string;
  claude_path: string;
  antigravity_path: string;
  permission_mode: string;
  keep_terminal_open: boolean;
}

export interface AgentsPayload {
  selected_agent: string;
  agents: AgentInfo[];
  settings: AgentSettings;
  active_locks: AgentLock[];
  recent_handoffs: AgentHandoff[];
  permission_modes: string[];
}

export interface Skill {
  id: number;
  name: string;
  slug: string;
  description: string;
  version: string;
  source: string;
  path: string;
  compatible_agents: string[];
  required_tools: string[];
  permissions: string[];
  installed_agents: string[];
  status: string;
  approved: boolean;
  metadata: {
    warnings?: string[];
    files?: Array<{ path: string; size: number; kind: string }>;
    dependencies?: string[];
    has_scripts?: boolean;
    [key: string]: unknown;
  };
  created_at: string | null;
  inspection?: {
    metadata?: Record<string, unknown>;
    content?: string;
    files: Array<{ path: string; size: number; kind: string }>;
    warnings: string[];
    has_scripts: boolean;
    dependencies: string[];
    error?: string;
  };
}

export interface McpServer {
  id: number;
  name: string;
  slug: string;
  transport: string;
  command: string;
  args: string[];
  url: string;
  env_keys: string[];
  agents: string[];
  status: string;
  source_path: string;
  error: string;
  last_checked_at: string | null;
  config: Record<string, unknown>;
  note: string;
}

export interface BrowserAccount {
  id: number;
  platform: "youtube" | "instagram";
  platform_label: string;
  label: string;
  slug: string;
  profile_dir: string;
  status: string;
  detected_identity: string;
  identity_verified: boolean;
  last_used_at: string | null;
  last_check_at: string | null;
  error: string;
  archived: boolean;
  browser_open: boolean;
  busy: boolean;
  profile_exists: boolean;
  meta: Record<string, unknown>;
}

export interface BrowserPublish {
  id: number;
  video_id: number;
  video_title: string;
  video_path: string;
  browser_account_id: number;
  account_label: string;
  platform: string;
  action: string;
  status: string;
  stage: string;
  title: string;
  description: string;
  tags: string[];
  visibility: string;
  scheduled_at: string | null;
  remote_url: string;
  remote_id: string;
  screenshot_path: string | null;
  log: string;
  error: string;
  confirmation_required: boolean;
  confirmed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  attempts: number;
  created_at: string | null;
}

export interface BrowserOverview {
  runtime: {
    playwright_installed: boolean;
    browser: { channel: string; path: string; found: boolean };
    profiles_root: string;
    screenshots_root: string;
    platforms: Record<string, { label: string; login_url: string; color: string }>;
    automation_available: boolean;
    security_note: string;
  };
  accounts: BrowserAccount[];
  jobs: BrowserPublish[];
  platforms: Record<string, { label: string; login_url: string; color: string }>;
  security_note: string;
}
