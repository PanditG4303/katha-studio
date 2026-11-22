import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AudioLines,
  CheckCircle2,
  Clock3,
  Download,
  FileAudio,
  FolderOpen,
  Headphones,
  Loader2,
  Mic2,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  Wand2,
  Waves,
  X,
} from "lucide-react";
import { api, bridge, mediaUrl } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/AppStore";
import type {
  AudioAsset,
  Channel,
  Job,
  Project,
  ProjectSummary,
  VoiceProfile,
  VoiceProviderOptions,
} from "@/lib/types";
import { cn, errorMessage, formatDate, formatDuration, statusLabel } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Progress,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
  Toggle,
} from "@/components/ui";
import { AudioPlayButton, MusicAudio, VoiceAudio, Waveform } from "@/components/shared";
import { useToast } from "@/components/Toast";

const LANGUAGES = ["Hindi", "English", "Hinglish", "Tamil", "Telugu", "Bengali", "Marathi", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Urdu"];

export function VoiceMusicPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<"voice" | "music">(() => (searchParams.get("tab") === "music" ? "music" : "voice"));
  const projectParam = searchParams.get("project");

  return (
    <div className="animate-float-in">
      <PageHeader
        eyebrow="Give the story a voice"
        title="Voice & Music Lab"
        description="Generate final dialogue audio with ElevenLabs or the offline Windows voice, and build a rights-aware music library for your films."
        actions={
          <Tabs
            value={tab}
            onChange={(value) => {
              setTab(value);
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                next.set("tab", value);
                return next;
              });
            }}
            tabs={[
              { id: "voice", label: "Voice Studio" },
              { id: "music", label: "Music Library" },
            ]}
          />
        }
      />

      {tab === "voice" ? (
        <VoiceStudio initialProjectId={projectParam ? Number(projectParam) : null} />
      ) : (
        <MusicLibrary />
      )}
    </div>
  );
}

function VoiceStudio({ initialProjectId }: { initialProjectId: number | null }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { channels, selectedChannelId, dataVersion, refreshChannels } = useAppStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<VoiceProfile | null>(null);
  const [projectId, setProjectId] = useState<number | null>(initialProjectId);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [provider, setProvider] = useState("elevenlabs");
  const [overwrite, setOverwrite] = useState(false);
  const [starting, setStarting] = useState(false);
  const [voiceJob, setVoiceJob] = useState<Job | null>(null);
  const [narratorSaving, setNarratorSaving] = useState<number | null>(null);

  const providers = useFetch<VoiceProviderOptions>(() => api("/voice/providers"), [dataVersion]);
  const profiles = useFetch<{ profiles: VoiceProfile[] }>(
    () => api(`/voice/profiles${selectedChannelId ? `?channel_id=${selectedChannelId}` : ""}`),
    [selectedChannelId, dataVersion],
  );
  const projects = useFetch<{ projects: ProjectSummary[] }>(
    () => api(`/projects?limit=100${selectedChannelId ? `&channel_id=${selectedChannelId}` : ""}`),
    [selectedChannelId, dataVersion],
  );

  useEffect(() => {
    if (initialProjectId) setProjectId(initialProjectId);
  }, [initialProjectId]);

  useEffect(() => {
    if (projectId && projects.data?.projects.some((project) => project.id === projectId)) return;
    if (projects.data?.projects.length) setProjectId(projects.data.projects[0].id);
  }, [projects.data, projectId]);

  const project = useFetch<Project>(() => api(`/projects/${projectId}`), [projectId, dataVersion], {
    immediate: Boolean(projectId),
  });

  const channelProfiles = useMemo(
    () => (profiles.data?.profiles || []).filter((profile) => !selectedChannelId || profile.channel_id === selectedChannelId || profile.channel_id === null),
    [profiles.data, selectedChannelId],
  );

  const elevenConnected = providers.data?.elevenlabs_connected;
  const windowsVoices = providers.data?.windows_voices || [];

  useEffect(() => {
    if (provider === "elevenlabs" && !elevenConnected && windowsVoices.length) setProvider("windows_sapi");
  }, [elevenConnected, windowsVoices.length, provider]);

  useEffect(() => {
    if (!voiceJob || !["queued", "running"].includes(voiceJob.status)) return;
    const id = window.setInterval(async () => {
      try {
        const fresh = await api<Job>(`/system/jobs/${voiceJob.id}`);
        setVoiceJob(fresh);
        if (fresh.status === "completed") {
          window.clearInterval(id);
          await project.reload(true);
          void refreshChannels();
          const generated = Number(fresh.result?.generated || 0);
          const failed = Number(fresh.result?.failed || 0);
          if (failed) toast.error("Voice finished with failures", `${generated} generated, ${failed} failed. Review the line errors.`);
          else toast.success("Voice generation finished", `${generated} audio clip${generated === 1 ? "" : "s"} created.`);
        } else if (fresh.status === "failed") {
          window.clearInterval(id);
          toast.error("Voice generation failed", fresh.error || "Check the job details.");
        }
      } catch {
        // keep polling
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [voiceJob?.id, voiceJob?.status]);

  const allLines = useMemo(
    () => project.data?.episodes.flatMap((episode) => (episode.scenes || []).flatMap((scene) => scene.dialogue)) || [],
    [project.data],
  );
  const missing = allLines.filter((line) => line.audio_status !== "ready");
  const ready = allLines.length - missing.length;

  const generate = async (mode: "missing" | "all" | "episode", episodeId?: number) => {
    if (!project.data) return;
    setStarting(true);
    try {
      const result = await api<{ job: Job }>("/voice/generate", {
        method: "POST",
        json: {
          project_id: project.data.id,
          provider,
          voice_profile_id: selectedProfileId ? Number(selectedProfileId) : null,
          language: project.data.language,
          episode_id: mode === "episode" ? episodeId : null,
          overwrite: mode === "all" ? true : overwrite,
        },
      });
      setVoiceJob(result.job);
      toast.info("Voice generation started", "Audio is generated line by line and saved per scene and speaker.");
    } catch (error) {
      toast.error("Could not start voice generation", errorMessage(error));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_0.72fr]">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Voice engine</p>
              <h2 className="display mt-1 text-[23px]">Choose how the story speaks</h2>
            </div>
            <Button size="sm" variant="secondary" icon={<Settings2 size={13} />} onClick={() => navigate("/settings")}>
              Connection settings
            </Button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setProvider("elevenlabs")}
              className={cn(
                "rounded-2xl border p-4 text-left transition",
                provider === "elevenlabs" ? "border-ink/15 bg-white shadow-soft" : "border-ink/[0.06] bg-white/40 hover:bg-white/70",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-lavender/70 text-[#71618c]">
                  <Sparkles size={15} />
                </span>
                <Badge tone={elevenConnected ? "sage" : "neutral"} dot>
                  {elevenConnected ? "Connected" : "Needs key"}
                </Badge>
              </div>
              <p className="mt-3 text-[12px] font-bold">ElevenLabs</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                Premium multilingual narration and character voices. Uses your account and credits.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setProvider("windows_sapi")}
              className={cn(
                "rounded-2xl border p-4 text-left transition",
                provider === "windows_sapi" ? "border-ink/15 bg-white shadow-soft" : "border-ink/[0.06] bg-white/40 hover:bg-white/70",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sage/70 text-moss">
                  <Volume2 size={15} />
                </span>
                <Badge tone={windowsVoices.length ? "sage" : "neutral"} dot>
                  {windowsVoices.length ? `${windowsVoices.length} voices` : "Unavailable"}
                </Badge>
              </div>
              <p className="mt-3 text-[12px] font-bold">Windows local voice</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                Offline fallback. Quality depends on the language packs installed on this PC.
              </p>
            </button>
          </div>
          {!elevenConnected ? (
            <div className="mt-3 rounded-xl bg-peach/40 px-3 py-2 text-[10.5px] leading-relaxed text-[#8a5f48]">
              ElevenLabs is not connected. Add an API key in Connections & Settings, or use the Windows local voice.
              Katha Studio never includes a hidden demo voice that pretends to be a real provider.
            </div>
          ) : null}
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Voice profiles</p>
              <h2 className="display mt-1 text-[23px]">The cast</h2>
            </div>
            <Button size="sm" icon={<Plus size={13} />} onClick={() => { setEditingProfile(null); setProfileOpen(true); }}>
              New voice
            </Button>
          </div>
          <div className="mt-3 max-h-[230px] space-y-1.5 overflow-y-auto">
            {channelProfiles.length === 0 ? (
              <p className="rounded-xl bg-white/45 p-3 text-[11px] leading-relaxed text-muted">
                No voice profiles for this channel. Create one, or choose a voice from the ElevenLabs library.
              </p>
            ) : (
              channelProfiles.map((profile) => (
                <div key={profile.id} className="flex items-center gap-2.5 rounded-xl bg-white/50 p-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lavender/60 text-ink/45">
                    <Mic2 size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold">{profile.name}</p>
                    <p className="text-[9.5px] text-muted">
                      {profile.role} · {profile.provider === "elevenlabs" ? "ElevenLabs" : "Windows"}
                    </p>
                  </div>
                  <IconButton
                    label="Edit voice"
                    onClick={() => {
                      setEditingProfile(profile);
                      setProfileOpen(true);
                    }}
                  >
                    <Settings2 size={12} />
                  </IconButton>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Scene-by-scene voiceover</p>
            <h2 className="display mt-1 text-[23px]">Generate final dialogue audio</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              Only the dialogue text is spoken. Each clip is stored by part, scene and speaker, then mapped into the production package.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={projectId || ""}
              onChange={(event) => setProjectId(Number(event.target.value))}
              className="w-[260px]"
            >
              {(projects.data?.projects || []).length === 0 ? <option value="">No projects</option> : null}
              {(projects.data?.projects || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {!project.data ? (
          <EmptyState
            compact
            className="mt-5"
            icon={<FileAudio size={20} />}
            title="Choose a story with dialogue"
            message="Scripts appear here once generated. Finish a script in Story & Script Studio first."
            action={
              <Button size="sm" variant="secondary" onClick={() => navigate("/scripts")}>
                Open script studio
              </Button>
            }
          />
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field label="Voice profile for this run">
                <Select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)}>
                  <option value="">Auto-match by character / narrator</option>
                  {channelProfiles
                    .filter((profile) => profile.provider === provider)
                    .map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} · {profile.role}
                      </option>
                    ))}
                </Select>
              </Field>
              <div className="flex items-end gap-2 pb-0.5">
                <Button
                  variant="secondary"
                  size="md"
                  loading={starting}
                  icon={<AudioLines size={14} />}
                  disabled={!project.data || missing.length === 0}
                  onClick={() => void generate("missing")}
                >
                  Generate missing ({missing.length})
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  icon={<RefreshCw size={13} />}
                  disabled={!project.data || allLines.length === 0}
                  onClick={() => void generate("all")}
                >
                  Regenerate all
                </Button>
              </div>
              <div className="flex items-end pb-0.5">
                <div className="flex items-center gap-2 rounded-xl bg-white/50 px-3 py-2.5">
                  <Toggle checked={overwrite} onChange={setOverwrite} label="Overwrite existing" />
                  <span className="text-[10px] font-semibold text-muted">Replace existing</span>
                </div>
              </div>
            </div>

            {voiceJob && ["queued", "running"].includes(voiceJob.status) ? (
              <div className="mt-4 rounded-xl bg-white/60 p-3">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin text-moss" /> {voiceJob.message}
                  </span>
                  <span className="text-muted">{Math.round(voiceJob.progress)}%</span>
                </div>
                <Progress value={voiceJob.progress} className="mt-2" />
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-white/40 px-3 py-2">
              <span className="text-[10.5px] font-bold text-ink/60">
                {ready}/{allLines.length} lines voiced
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.07]">
                <div className="h-full rounded-full bg-moss transition-all" style={{ width: `${allLines.length ? (ready / allLines.length) * 100 : 0}%` }} />
              </div>
              <StatusBadge status={project.data.status} />
            </div>

            <div className="mt-4 space-y-2">
              {project.data.episodes.map((episode) => {
                const lines = (episode.scenes || []).flatMap((scene) => scene.dialogue);
                const episodeReady = lines.filter((line) => line.audio_status === "ready").length;
                return (
                  <div key={episode.id} className="rounded-2xl border border-ink/[0.06] bg-white/35">
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-lavender/60 text-[10px] font-bold text-[#71618c]">
                        {episode.episode_number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11.5px] font-bold">{episode.title}</p>
                        <p className="text-[9.5px] text-muted">
                          {episodeReady}/{lines.length} voiced · {formatDuration(episode.estimated_duration)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Wand2 size={12} />}
                        onClick={() => void generate("episode", episode.id)}
                        disabled={starting}
                      >
                        Voice this part
                      </Button>
                    </div>
                    <div className="border-t border-ink/[0.05] px-4 py-2">
                      {lines.map((line) => (
                        <div key={line.id} className="flex items-center gap-2 border-b border-ink/[0.04] py-1.5 last:border-0">
                          <span className="w-20 shrink-0 truncate text-[9.5px] font-bold uppercase tracking-[0.05em] text-clay">
                            {line.speaker}
                          </span>
                          <p className="min-w-0 flex-1 truncate text-[10.5px] text-ink/70">{line.text}</p>
                          {line.audio_status === "ready" ? <VoiceAudio lineId={line.id} compact /> : null}
                          <span className="w-16 shrink-0 text-right text-[9px] text-muted/60">
                            {formatDuration(line.audio_duration || line.end_time - line.start_time)}
                          </span>
                          <Badge
                            tone={line.audio_status === "ready" ? "sage" : line.audio_status === "failed" ? "rose" : line.audio_status === "stale" ? "peach" : "neutral"}
                            className="shrink-0 px-1.5 py-0.5 text-[8px]"
                          >
                            {line.audio_status === "ready" ? "ready" : statusLabel(line.audio_status || "no audio")}
                          </Badge>
                        </div>
                      ))}
                      {lines.some((line) => line.audio_error) ? (
                        <p className="py-1.5 text-[9.5px] leading-relaxed text-[#a95f66]">
                          {lines.find((line) => line.audio_error)?.audio_error}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <p className="eyebrow">Narrator assignment</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            The channel narrator is the fallback voice when a dialogue line has no character profile. Set it on a voice
            profile so every future story inherits the right narrator.
          </p>
          <div className="mt-3 space-y-1.5">
            {channelProfiles.slice(0, 5).map((profile) => {
              const channel = channels.find((item) => item.id === profile.channel_id) || channels.find((item) => item.id === selectedChannelId);
              const isNarrator = channel?.narrator_voice === profile.name || channel?.narrator_voice === String(profile.id);
              return (
                <div key={profile.id} className="flex items-center gap-2 rounded-xl bg-white/50 px-2.5 py-2">
                  <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold">{profile.name}</span>
                  {isNarrator ? (
                    <Badge tone="sage" dot>
                      Channel narrator
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={narratorSaving === profile.id}
                      onClick={async () => {
                        if (!channel) {
                          toast.error("Assign this profile to a channel first");
                          return;
                        }
                        setNarratorSaving(profile.id);
                        try {
                          await api(`/channels/${channel.id}`, { method: "PATCH", json: { narrator_voice: profile.name } });
                          await refreshChannels();
                          void profiles.reload(true);
                          toast.success("Narrator updated");
                        } catch (error) {
                          toast.error("Could not update narrator", errorMessage(error));
                        } finally {
                          setNarratorSaving(null);
                        }
                      }}
                    >
                      Set narrator
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          <p className="eyebrow">How voice generation works</p>
          <ol className="mt-3 space-y-2">
            {[
              "Each dialogue line is sent as exact spoken text — no scene labels or production notes.",
              "Audio is stored as part_scene_speaker_line.mp3 in the project staging folder.",
              "Duration is measured with FFprobe and written to the timeline and audio manifest.",
              "Changing dialogue text marks its audio stale and requires the script to be approved again.",
              "ElevenLabs usage depends on your plan and character limits.",
            ].map((step, index) => (
              <li key={step} className="flex gap-2 text-[10.5px] leading-relaxed text-muted">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-[8.5px] font-bold text-ink/50">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        profile={editingProfile}
        channels={channels}
        defaultChannelId={selectedChannelId}
        elevenConnected={Boolean(elevenConnected)}
        windowsVoices={windowsVoices}
        onSaved={async () => {
          await profiles.reload(true);
          setProfileOpen(false);
        }}
      />
    </div>
  );
}

function ProfileModal({
  open,
  onClose,
  profile,
  channels,
  defaultChannelId,
  elevenConnected,
  windowsVoices,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: VoiceProfile | null;
  channels: Channel[];
  defaultChannelId: number | null;
  elevenConnected: boolean;
  windowsVoices: Array<{ name: string; culture?: string; gender?: string }>;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: "",
    role: "Main narrator",
    channel_id: defaultChannelId ? String(defaultChannelId) : "",
    provider: "elevenlabs",
    provider_voice_id: "",
    model_id: "",
    language: "Hindi",
    description: "",
    stability: 0.5,
    similarity: 0.75,
    style: 0.3,
    speed: 1,
    rate: 0,
  });
  const [saving, setSaving] = useState(false);
  const [voices, setVoices] = useState<Array<{ voice_id: string; name: string; category?: string; description?: string; labels?: Record<string, string> }>>([]);
  const [models, setModels] = useState<Array<{ model_id: string; name: string }>>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voicesError, setVoicesError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (profile) {
      const settings = profile.settings || {};
      setForm({
        name: profile.name,
        role: profile.role,
        channel_id: profile.channel_id ? String(profile.channel_id) : "",
        provider: profile.provider,
        provider_voice_id: profile.provider_voice_id,
        model_id: profile.model_id,
        language: profile.language,
        description: profile.description,
        stability: Number(settings.stability ?? 0.5),
        similarity: Number(settings.similarity_boost ?? settings.similarity ?? 0.75),
        style: Number(settings.style ?? 0.3),
        speed: Number(settings.speed ?? 1),
        rate: Number(settings.rate ?? 0),
      });
    } else {
      setForm({
        name: "",
        role: "Main narrator",
        channel_id: defaultChannelId ? String(defaultChannelId) : channels[0] ? String(channels[0].id) : "",
        provider: elevenConnected ? "elevenlabs" : "windows_sapi",
        provider_voice_id: "",
        model_id: "",
        language: "Hindi",
        description: "",
        stability: 0.5,
        similarity: 0.75,
        style: 0.3,
        speed: 1,
        rate: 0,
      });
    }
  }, [open, profile?.id, elevenConnected]);

  useEffect(() => {
    if (!open || form.provider !== "elevenlabs" || !elevenConnected) return;
    let cancelled = false;
    setLoadingVoices(true);
    setVoicesError("");
    Promise.all([api<{ voices: typeof voices }>("/voice/elevenlabs/voices"), api<{ models: typeof models }>("/voice/elevenlabs/models")])
      .then(([voiceData, modelData]) => {
        if (cancelled) return;
        setVoices(voiceData.voices || []);
        setModels(modelData.models || []);
        if (!profile) {
          setForm((current) => ({
            ...current,
            provider_voice_id: current.provider_voice_id || voiceData.voices?.[0]?.voice_id || "",
            model_id: current.model_id || modelData.models?.[0]?.model_id || "",
          }));
        }
      })
      .catch((error) => {
        if (!cancelled) setVoicesError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoadingVoices(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, form.provider, elevenConnected]);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name this voice");
      return;
    }
    if (form.provider === "elevenlabs" && !form.provider_voice_id) {
      toast.error("Choose an ElevenLabs voice");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        role: form.role,
        channel_id: form.channel_id ? Number(form.channel_id) : null,
        provider: form.provider,
        provider_voice_id: form.provider_voice_id,
        model_id: form.model_id,
        language: form.language,
        description: form.description,
        settings:
          form.provider === "elevenlabs"
            ? {
                stability: form.stability,
                similarity_boost: form.similarity,
                style: form.style,
                speed: form.speed,
                use_speaker_boost: true,
              }
            : { rate: form.rate },
      };
      if (profile) await api(`/voice/profiles/${profile.id}`, { method: "PATCH", json: payload });
      else await api("/voice/profiles", { method: "POST", json: payload });
      toast.success(profile ? "Voice profile updated" : "Voice profile created");
      await onSaved();
    } catch (error) {
      toast.error("Could not save the voice", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={profile ? "Edit voice profile" : "Create a voice profile"}
      description="A profile maps a role or character to a real provider voice. Settings are sent only when generating audio."
      size="lg"
      footer={
        <>
          {profile ? (
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={13} />}
              onClick={async () => {
                if (!window.confirm("Delete this voice profile? Existing audio files are kept.")) return;
                try {
                  await api(`/voice/profiles/${profile.id}?confirm=true`, { method: "DELETE" });
                  toast.success("Voice profile deleted");
                  await onSaved();
                } catch (error) {
                  toast.error("Could not delete", errorMessage(error));
                }
              }}
            >
              Delete
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            Save voice
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Profile name">
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Warm narrator" autoFocus />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              {["Main narrator", "Narrator", "Protagonist", "Antagonist", "Supporting", "Child", "Elder", "Custom"].map((role) => (
                <option key={role}>{role}</option>
              ))}
            </Select>
          </Field>
          <Field label="Channel">
            <Select value={form.channel_id} onChange={(event) => setForm({ ...form, channel_id: event.target.value })}>
              <option value="">All channels</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Language">
            <Select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })}>
              {LANGUAGES.map((language) => (
                <option key={language}>{language}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Provider">
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "elevenlabs", label: "ElevenLabs", available: elevenConnected },
              { id: "windows_sapi", label: "Windows local", available: windowsVoices.length > 0 },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setForm({ ...form, provider: item.id, provider_voice_id: "" })}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left text-[11px] font-bold transition",
                  form.provider === item.id ? "border-ink/20 bg-white shadow-sm" : "border-ink/10 bg-white/40 text-muted",
                )}
              >
                {item.label}
                <span className={cn("ml-2 text-[9px]", item.available ? "text-moss" : "text-muted/50")}>
                  {item.available ? "ready" : "not available"}
                </span>
              </button>
            ))}
          </div>
        </Field>

        {form.provider === "elevenlabs" ? (
          <>
            <Field label="ElevenLabs voice" hint={voicesError || "Voices are loaded from your ElevenLabs account."}>
              <Select
                value={form.provider_voice_id}
                onChange={(event) => setForm({ ...form, provider_voice_id: event.target.value })}
                disabled={!elevenConnected || loadingVoices}
              >
                {loadingVoices ? <option value="">Loading voices…</option> : null}
                {!loadingVoices && voices.length === 0 ? <option value="">{elevenConnected ? "No voices returned" : "Connect ElevenLabs first"}</option> : null}
                {voices.map((voice) => (
                  <option key={voice.voice_id} value={voice.voice_id}>
                    {voice.name} {voice.labels?.accent ? `· ${voice.labels.accent}` : ""} {voice.labels?.gender ? `· ${voice.labels.gender}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Model">
                <Select value={form.model_id} onChange={(event) => setForm({ ...form, model_id: event.target.value })}>
                  <option value="">Provider default</option>
                  {models.map((model) => (
                    <option key={model.model_id} value={model.model_id}>
                      {model.name || model.model_id}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={`Stability ${form.stability.toFixed(2)}`}>
                  <input type="range" min={0} max={1} step={0.05} value={form.stability} onChange={(event) => setForm({ ...form, stability: Number(event.target.value) })} className="w-full" />
                </Field>
                <Field label={`Similarity ${form.similarity.toFixed(2)}`}>
                  <input type="range" min={0} max={1} step={0.05} value={form.similarity} onChange={(event) => setForm({ ...form, similarity: Number(event.target.value) })} className="w-full" />
                </Field>
                <Field label={`Style ${form.style.toFixed(2)}`}>
                  <input type="range" min={0} max={1} step={0.05} value={form.style} onChange={(event) => setForm({ ...form, style: Number(event.target.value) })} className="w-full" />
                </Field>
                <Field label={`Speed ${form.speed.toFixed(2)}`}>
                  <input type="range" min={0.7} max={1.2} step={0.05} value={form.speed} onChange={(event) => setForm({ ...form, speed: Number(event.target.value) })} className="w-full" />
                </Field>
              </div>
            </div>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Windows voice">
              <Select value={form.provider_voice_id} onChange={(event) => setForm({ ...form, provider_voice_id: event.target.value })}>
                <option value="">System default</option>
                {windowsVoices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name} {voice.culture ? `· ${voice.culture}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`Speaking rate ${form.rate > 0 ? `+${form.rate}` : form.rate}`} hint="Negative is slower, positive is faster.">
              <input type="range" min={-10} max={10} step={1} value={form.rate} onChange={(event) => setForm({ ...form, rate: Number(event.target.value) })} className="w-full" />
            </Field>
          </div>
        )}

        <Field label="Description">
          <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Warm, low, measured delivery for folk tales." />
        </Field>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------------- music */

function MusicLibrary() {
  const toast = useToast();
  const { channels, selectedChannelId, dataVersion } = useAppStore();
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<AudioAsset | null>(null);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState(selectedChannelId ? String(selectedChannelId) : "all");

  const tracks = useFetch<{ tracks: AudioAsset[] }>(
    () => api(`/music?${channelFilter !== "all" ? `channel_id=${channelFilter}&` : ""}${search ? `search=${encodeURIComponent(search)}` : ""}`),
    [channelFilter, search, dataVersion],
  );

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} className="w-[200px]">
            <option value="all">All channels</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </Select>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tracks…" className="w-[220px]" />
        </div>
        <Button icon={<Upload size={14} />} onClick={() => setImportOpen(true)}>
          Import track
        </Button>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.42fr]">
        <div className="space-y-2">
          {tracks.loading ? (
            [1, 2, 3].map((index) => <div key={index} className="skeleton h-24 rounded-2xl" />)
          ) : (tracks.data?.tracks || []).length === 0 ? (
            <Card className="p-2">
              <EmptyState
                icon={<Music2 size={22} />}
                title="Your music library is quiet"
                message="Import original, licensed or generated audio. Katha Studio analyses the waveform and tempo, keeps a rights note, and maps it into production packages."
                action={
                  <Button icon={<Upload size={14} />} onClick={() => setImportOpen(true)}>
                    Import a track
                  </Button>
                }
              />
            </Card>
          ) : (
            tracks.data?.tracks.map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() => setSelected(track)}
                className="group flex w-full items-center gap-4 rounded-2xl border border-white/70 bg-white/45 p-3.5 text-left transition hover:border-white hover:bg-white/80"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sage/70 to-powder/70 text-moss">
                  <Music2 size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[12px] font-bold">{track.title}</p>
                    {track.is_demo ? <Badge tone="peach">Demo</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {track.channel_name}
                    {track.project_title ? ` · ${track.project_title}` : ""} · {formatDuration(track.duration)}
                    {track.bpm ? ` · ${Math.round(track.bpm)} BPM` : ""}
                  </p>
                  <Waveform values={track.waveform} className="mt-1.5 h-6 max-w-md" bars={48} />
                </div>
                <div className="hidden shrink-0 items-center gap-2 sm:flex">
                  <MusicAudio assetId={track.id} compact />
                  <span className="text-[9.5px] font-semibold text-muted/60">{formatDate(track.created_at)}</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="eyebrow">How music is used</p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Katha Studio does not generate music itself. It imports audio you own or licensed, estimates tempo and
              sections, stores a rights note, and copies the track into the production package so Claude can sync to it.
            </p>
            <div className="mt-3 rounded-xl bg-peach/35 px-3 py-2 text-[10.5px] leading-relaxed text-[#8a5f48]">
              Always confirm you have the rights to publish imported music. BPM and energy are lightweight local
              estimates, not a definitive analysis.
            </div>
          </Card>
          <Card className="p-5">
            <p className="eyebrow">Music direction by channel</p>
            <div className="mt-3 space-y-2">
              {channels.map((channel) => (
                <div key={channel.id} className="rounded-xl bg-white/50 px-3 py-2">
                  <p className="text-[10.5px] font-bold">{channel.name}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{channel.music_preferences || "No music direction recorded."}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <ImportMusicModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void tracks.reload(true)} />
      <TrackDrawer
        track={selected}
        onClose={() => setSelected(null)}
        onChanged={async () => {
          await tracks.reload(true);
          if (selected) {
            const fresh = await api<{ tracks: AudioAsset[] }>(`/music?search=${encodeURIComponent(selected.title)}`);
            setSelected(fresh.tracks.find((item) => item.id === selected.id) || null);
          }
        }}
      />
    </div>
  );
}

function ImportMusicModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const toast = useToast();
  const { channels, selectedChannelId, dataVersion } = useAppStore();
  const [path, setPath] = useState("");
  const [title, setTitle] = useState("");
  const [channelId, setChannelId] = useState(selectedChannelId ? String(selectedChannelId) : "");
  const [projectId, setProjectId] = useState("");
  const [tags, setTags] = useState("");
  const [rights, setRights] = useState("");
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const projects = useFetch<{ projects: ProjectSummary[] }>(
    () => api(`/projects?limit=100${channelId ? `&channel_id=${channelId}` : ""}`),
    [channelId, dataVersion],
  );

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const id = window.setInterval(async () => {
      try {
        const fresh = await api<Job>(`/system/jobs/${job.id}`);
        setJob(fresh);
        if (fresh.status === "completed") {
          window.clearInterval(id);
          toast.success("Track imported", String(fresh.result?.warning || "Waveform and tempo analysis saved."));
          onImported();
          onClose();
          setPath("");
          setTitle("");
        } else if (fresh.status === "failed") {
          window.clearInterval(id);
          toast.error("Import failed", fresh.error);
        }
      } catch {
        // keep polling
      }
    }, 1600);
    return () => window.clearInterval(id);
  }, [job?.id, job?.status]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import a music track"
      description="Choose an audio file you have the right to use. It is copied into the studio music library and analysed locally."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={starting}
            disabled={!path}
            icon={<Upload size={14} />}
            onClick={async () => {
              setStarting(true);
              try {
                const result = await api<{ job: Job }>("/music/import", {
                  method: "POST",
                  json: {
                    path,
                    channel_id: channelId ? Number(channelId) : null,
                    project_id: projectId ? Number(projectId) : null,
                    title,
                    tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                    rights_note: rights,
                    copy_to_library: true,
                  },
                });
                setJob(result.job);
              } catch (error) {
                toast.error("Could not start the import", errorMessage(error));
              } finally {
                setStarting(false);
              }
            }}
          >
            Import & analyse
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Audio file">
          <div className="flex gap-2">
            <Input value={path} onChange={(event) => setPath(event.target.value)} placeholder="Choose an MP3, WAV, M4A, FLAC…" />
            <Button
              variant="secondary"
              icon={<FolderOpen size={13} />}
              onClick={async () => {
                const chosen = await bridge.pickFile("Choose a music track", ["mp3", "wav", "m4a", "aac", "flac", "ogg"]);
                if (chosen) {
                  setPath(chosen);
                  if (!title) setTitle(chosen.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "");
                }
              }}
            >
              Browse
            </Button>
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Track title" />
          </Field>
          <Field label="Channel">
            <Select value={channelId} onChange={(event) => { setChannelId(event.target.value); setProjectId(""); }}>
              <option value="">Unassigned</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Assign to a story (optional)">
          <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">No project</option>
            {(projects.data?.projects || []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tags">
          <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="ambient, strings, hopeful" />
        </Field>
        <Field label="Rights note" hint="Required for your own records. Katha Studio cannot verify music rights.">
          <Textarea value={rights} onChange={(event) => setRights(event.target.value)} placeholder="Original composition by… / licensed from…" />
        </Field>
        {job && ["queued", "running"].includes(job.status) ? (
          <div className="rounded-xl bg-white/60 p-3">
            <p className="text-[11px] font-bold">{job.message || "Analysing audio…"}</p>
            <Progress value={job.progress} className="mt-2" />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function TrackDrawer({
  track,
  onClose,
  onChanged,
}: {
  track: AudioAsset | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const { channels, dataVersion } = useAppStore();
  const [form, setForm] = useState({ title: "", channel_id: "", project_id: "", tags: "", rights_note: "" });
  const [lyrics, setLyrics] = useState<Array<{ start: number; end: number; text: string }>>([]);
  const [saving, setSaving] = useState(false);
  const projects = useFetch<{ projects: ProjectSummary[] }>(
    () => api(`/projects?limit=100${form.channel_id ? `&channel_id=${form.channel_id}` : ""}`),
    [form.channel_id, dataVersion],
    { immediate: Boolean(track) },
  );

  useEffect(() => {
    if (!track) return;
    setForm({
      title: track.title,
      channel_id: track.channel_id ? String(track.channel_id) : "",
      project_id: track.project_id ? String(track.project_id) : "",
      tags: track.tags.join(", "),
      rights_note: track.rights_note,
    });
    setLyrics(track.lyrics || []);
  }, [track?.id]);

  if (!track) return null;

  return (
    <Drawer
      open={Boolean(track)}
      onClose={onClose}
      title={track.title}
      subtitle={`${track.channel_name}${track.project_title ? ` · ${track.project_title}` : ""}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await api(`/music/${track.id}`, {
                  method: "PATCH",
                  json: {
                    title: form.title,
                    channel_id: form.channel_id ? Number(form.channel_id) : null,
                    project_id: form.project_id ? Number(form.project_id) : null,
                    tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                    rights_note: form.rights_note,
                  },
                });
                await api(`/music/${track.id}/lyrics`, { method: "POST", json: { lyrics } });
                toast.success("Track updated");
                await onChanged();
              } catch (error) {
                toast.error("Could not save", errorMessage(error));
              } finally {
                setSaving(false);
              }
            }}
          >
            Save track
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl bg-gradient-to-br from-sage/50 to-powder/40 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MusicAudio assetId={track.id} label="Play track" />
              <Badge tone="neutral">{formatDuration(track.duration)}</Badge>
              {track.bpm ? <Badge tone="sage">{Math.round(track.bpm)} BPM</Badge> : null}
              {track.energy !== null && track.energy !== undefined ? <Badge tone="lavender">Energy {track.energy.toFixed(2)}</Badge> : null}
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<FolderOpen size={12} />}
              onClick={async () => {
                const result = await bridge.showItem(track.path);
                if (!result.ok) toast.error("Could not reveal the file", result.error);
              }}
            >
              Reveal
            </Button>
          </div>
          <Waveform values={track.waveform} className="mt-4 h-16" bars={90} />
          {track.sections.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {track.sections.map((section, index) => (
                <span key={index} className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-bold text-ink/60">
                  {String(section.label || `Section ${index + 1}`)}
                  {section.start !== undefined ? ` · ${formatDuration(Number(section.start))}` : ""}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </Field>
          <Field label="Channel">
            <Select value={form.channel_id} onChange={(event) => setForm({ ...form, channel_id: event.target.value, project_id: "" })}>
              <option value="">Unassigned</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Story">
          <Select value={form.project_id} onChange={(event) => setForm({ ...form, project_id: event.target.value })}>
            <option value="">No project</option>
            {(projects.data?.projects || []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tags">
          <Input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
        </Field>
        <Field label="Rights note">
          <Textarea value={form.rights_note} onChange={(event) => setForm({ ...form, rights_note: event.target.value })} />
        </Field>

        <div>
          <div className="flex items-center justify-between">
            <label className="field-label mb-0">Lyrics & timed text</label>
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={12} />}
              onClick={() => setLyrics((current) => [...current, { start: 0, end: 4, text: "" }])}
            >
              Add line
            </Button>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">
            Optional. Timed lyrics help with subtitles and visual sync. This does not transcribe audio automatically.
          </p>
          <div className="mt-2 space-y-2">
            {lyrics.length === 0 ? (
              <p className="rounded-xl bg-white/40 p-3 text-[10.5px] text-muted">No timed text yet.</p>
            ) : (
              lyrics.map((line, index) => (
                <div key={index} className="flex items-start gap-2 rounded-xl bg-white/50 p-2">
                  <div className="grid w-24 shrink-0 grid-cols-2 gap-1">
                    <Input
                      type="number"
                      step="0.1"
                      value={line.start}
                      onChange={(event) =>
                        setLyrics((current) => current.map((item, i) => (i === index ? { ...item, start: Number(event.target.value) } : item)))
                      }
                      className="px-1.5 py-1 text-[10px]"
                    />
                    <Input
                      type="number"
                      step="0.1"
                      value={line.end}
                      onChange={(event) =>
                        setLyrics((current) => current.map((item, i) => (i === index ? { ...item, end: Number(event.target.value) } : item)))
                      }
                      className="px-1.5 py-1 text-[10px]"
                    />
                  </div>
                  <Input
                    value={line.text}
                    onChange={(event) =>
                      setLyrics((current) => current.map((item, i) => (i === index ? { ...item, text: event.target.value } : item)))
                    }
                    placeholder="Lyric or spoken text"
                    className="py-1 text-[11px]"
                  />
                  <IconButton label="Remove line" onClick={() => setLyrics((current) => current.filter((_, i) => i !== index))}>
                    <X size={12} />
                  </IconButton>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl bg-peach/35 px-3 py-2 text-[10px] leading-relaxed text-[#8a5f48]">
          {track.rights_note || "No rights note recorded. Confirm you can publish this track."}
        </div>
      </div>
    </Drawer>
  );
}
