import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Clock3,
  Copy,
  ExternalLink,
  Feather,
  FileText,
  FolderOpen,
  Loader2,
  Mic2,
  Package,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { api, bridge } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/AppStore";
import type { DialogueLine, Job, Project, ProjectSummary, VoiceProfile } from "@/lib/types";
import { cn, errorMessage, formatDate, formatDuration, statusLabel, toLocalInput } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import {
  Badge,
  Button,
  Card,
  CopyButton,
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
import { VoiceAudio } from "@/components/shared";
import { useToast } from "@/components/Toast";

export function ScriptStudioPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { channels, selectedChannelId, dataVersion, refreshChannels } = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectParam = searchParams.get("project");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState<string>(selectedChannelId ? String(selectedChannelId) : "all");
  const [selectedId, setSelectedId] = useState<number | null>(projectParam ? Number(projectParam) : null);

  const projects = useFetch<{ projects: ProjectSummary[] }>(
    () => api(`/projects?limit=200${channelFilter !== "all" ? `&channel_id=${channelFilter}` : ""}`),
    [channelFilter, dataVersion],
  );

  useEffect(() => {
    if (projectParam) setSelectedId(Number(projectParam));
  }, [projectParam]);

  const filtered = useMemo(() => {
    const list = projects.data?.projects || [];
    return list.filter((project) => {
      if (statusFilter !== "all" && project.status !== statusFilter) return false;
      if (search.trim() && !`${project.title} ${project.channel_name} ${project.category}`.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [projects.data, search, statusFilter]);

  const project = useFetch<Project>(
    () => api(`/projects/${selectedId}`),
    [selectedId, dataVersion],
    { immediate: Boolean(selectedId) },
  );

  const openProject = (id: number) => {
    setSelectedId(id);
    setSearchParams({ project: String(id) });
  };

  return (
    <div className="animate-float-in">
      <PageHeader
        eyebrow="The writing room"
        title="Story & Script Studio"
        description="Read every scene, edit every line, approve the script and prepare the production package. Nothing is sent to Claude until you approve it."
        actions={
          <Button variant="secondary" icon={<Sparkles size={14} />} onClick={() => navigate("/create")}>
            New story
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[310px_1fr]">
        <div className="space-y-3">
          <Card className="p-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/50" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search stories…"
                className="pl-9"
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
                <option value="all">All channels</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </Select>
              <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Any status</option>
                <option value="SCRIPT_READY">Script ready</option>
                <option value="AWAITING_VOICE">Awaiting voice</option>
                <option value="VOICE_READY">Voice ready</option>
                <option value="READY_FOR_CLAUDE">Ready for Claude</option>
                <option value="ANIMATION_COMPLETED">Animation complete</option>
              </Select>
            </div>
          </Card>

          <div className="max-h-[calc(100vh-310px)] space-y-1.5 overflow-y-auto pr-1">
            {projects.loading ? (
              [1, 2, 3, 4].map((index) => <div key={index} className="skeleton h-20 rounded-2xl" />)
            ) : filtered.length === 0 ? (
              <Card className="p-2">
                <EmptyState compact icon={<Feather size={18} />} title="No stories found" message="Try another filter, or create a new story." />
              </Card>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openProject(item.id)}
                  className={cn(
                    "w-full rounded-2xl border p-3.5 text-left transition",
                    selectedId === item.id
                      ? "border-ink/10 bg-white shadow-soft"
                      : "border-transparent bg-white/35 hover:border-white hover:bg-white/65",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-[12px] font-bold leading-snug">{item.title}</p>
                    {item.is_demo ? <Badge tone="peach">Demo</Badge> : null}
                  </div>
                  <p className="mt-1 text-[10px] text-muted">
                    {item.channel_name} · {item.episode_count} part{item.episode_count === 1 ? "" : "s"}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <StatusBadge status={item.status} />
                    <span className="text-[9px] font-semibold text-muted/50">{formatDate(item.updated_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {!selectedId ? (
          <Card className="p-2">
            <EmptyState
              icon={<BookOpen size={24} />}
              title="Choose a story to open"
              message="Scripts are organised by scene, with dialogue, timing, visual direction and voice status. Select one from the shelf."
              action={
                <Button icon={<Sparkles size={14} />} onClick={() => navigate("/create")}>
                  Create a new story
                </Button>
              }
            />
          </Card>
        ) : project.loading && !project.data ? (
          <div className="space-y-3">
            <div className="skeleton h-40 rounded-3xl" />
            <div className="skeleton h-80 rounded-3xl" />
          </div>
        ) : project.error ? (
          <Card className="p-2">
            <EmptyState icon={<X size={20} />} title="Could not load the story" message={project.error} />
          </Card>
        ) : project.data ? (
          <ProjectDetail
            project={project.data}
            onReload={async () => {
              await project.reload(true);
              void projects.reload(true);
              void refreshChannels();
            }}
            onBack={() => {
              setSelectedId(null);
              setSearchParams({});
            }}
            onOpenAnimation={() => navigate(`/animation?project=${project.data?.id}`)}
          />
        ) : null}
      </div>
    </div>
  );
}

function ProjectDetail({
  project,
  onReload,
  onBack,
  onOpenAnimation,
}: {
  project: Project;
  onReload: () => Promise<void>;
  onBack: () => void;
  onOpenAnimation: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { dataVersion } = useAppStore();
  const [tab, setTab] = useState<"story" | "episodes" | "characters" | "package">("episodes");
  const [editOpen, setEditOpen] = useState(false);
  const [packageOpen, setPackageOpen] = useState(false);
  const [regenLine, setRegenLine] = useState<DialogueLine | null>(null);
  const [approving, setApproving] = useState(false);
  const [packageJob, setPackageJob] = useState<Job | null>(null);

  const profiles = useFetch<{ profiles: VoiceProfile[] }>(
    () => api(`/voice/profiles?channel_id=${project.channel_id}`),
    [project.channel_id, dataVersion],
  );

  const allLines = useMemo(
    () => project.episodes.flatMap((episode) => (episode.scenes || []).flatMap((scene) => scene.dialogue)),
    [project.episodes],
  );
  const readyLines = allLines.filter((line) => line.audio_status === "ready");
  const totalScenes = project.episodes.reduce((sum, episode) => sum + (episode.scenes?.length || 0), 0);

  useEffect(() => {
    if (!packageJob || !["queued", "running"].includes(packageJob.status)) return;
    const id = window.setInterval(async () => {
      try {
        const fresh = await api<Job>(`/system/jobs/${packageJob.id}`);
        setPackageJob(fresh);
        if (fresh.status === "completed") {
          window.clearInterval(id);
          await onReload();
          toast.success("Production package ready", String(fresh.result?.message || "Handoff files were written to disk."));
        } else if (fresh.status === "failed") {
          window.clearInterval(id);
          toast.error("Package generation failed", fresh.error || "Check the job log.");
        }
      } catch {
        // keep polling
      }
    }, 1800);
    return () => window.clearInterval(id);
  }, [packageJob?.id, packageJob?.status]);

  const approve = async (approved: boolean) => {
    setApproving(true);
    try {
      await api(`/projects/${project.id}/approve`, { method: "POST", json: { approved } });
      await onReload();
      toast.success(approved ? "Script approved" : "Approval removed", approved ? "Voice and package steps are now unlocked." : "Edit freely before approving again.");
    } catch (error) {
      toast.error("Could not update approval", errorMessage(error));
    } finally {
      setApproving(false);
    }
  };

  const openPath = async (path: string | null | undefined) => {
    if (!path) {
      toast.info("Nothing to open yet", "Generate the package first.");
      return;
    }
    const result = await bridge.openPath(path);
    if (!result.ok) toast.error("Could not open", result.error);
  };

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden p-6">
        <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-lavender/30 blur-2xl" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{project.channel_name}</Badge>
                <StatusBadge status={project.status} />
                {project.is_demo ? <Badge tone="peach">Demo story</Badge> : null}
                {project.approved_at ? (
                  <Badge tone="sage" dot>
                    Approved
                  </Badge>
                ) : null}
              </div>
              <h2 className="display mt-3 max-w-2xl text-[30px] leading-[1.12]">{project.title}</h2>
              <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-muted">
                {String(project.idea?.logline || project.idea?.description || project.idea?.premise || "A story taking shape.")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-semibold text-muted/70">
                <span className="flex items-center gap-1">
                  <Clapperboard size={11} /> {project.episodes.length} part{project.episodes.length === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1">
                  <FileText size={11} /> {totalScenes} scenes
                </span>
                <span className="flex items-center gap-1">
                  <Mic2 size={11} /> {readyLines.length}/{allLines.length} voiced
                </span>
                <span className="flex items-center gap-1">
                  <Clock3 size={11} /> {project.language} · {project.aspect_ratio}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" icon={<ArrowLeft size={13} />} onClick={onBack}>
                Shelf
              </Button>
              <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
              {project.approved_at ? (
                <Button variant="secondary" size="sm" icon={<RotateCcw size={13} />} onClick={() => void approve(false)} loading={approving}>
                  Reopen
                </Button>
              ) : (
                <Button size="sm" icon={<CheckCircle2 size={13} />} onClick={() => void approve(true)} loading={approving}>
                  Approve script
                </Button>
              )}
              <Button
                size="sm"
                variant="soft"
                icon={<Package size={13} />}
                onClick={() => setPackageOpen(true)}
                disabled={!project.approved_at}
              >
                {project.production_package_path ? "Regenerate package" : "Generate package"}
              </Button>
            </div>
          </div>

          {!project.approved_at ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-peach/40 px-3 py-2.5 text-[11px] leading-relaxed text-[#8a5f48]">
              <Feather size={13} className="mt-0.5 shrink-0" />
              Review the dialogue and scenes below. Approving the script unlocks voice generation, production packaging and
              the Claude handoff. Editing a line after approval requires approval again.
            </div>
          ) : null}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "story", label: "Story" },
            { id: "episodes", label: "Episodes", count: project.episodes.length },
            { id: "characters", label: "Characters", count: project.characters.length },
            { id: "package", label: "Production" },
          ]}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<AudioLines size={13} />}
            onClick={() => navigate(`/voice?project=${project.id}`)}
          >
            Voice studio
          </Button>
          <Button variant="secondary" size="sm" icon={<Wand2 size={13} />} onClick={onOpenAnimation}>
            Animation studio
          </Button>
        </div>
      </div>

      {tab === "story" ? <StoryTab project={project} /> : null}
      {tab === "episodes" ? (
        <EpisodesTab
          project={project}
          onReload={onReload}
          onRegenerate={setRegenLine}
          onOpenVoice={() => navigate(`/voice?project=${project.id}`)}
        />
      ) : null}
      {tab === "characters" ? (
        <CharactersTab project={project} profiles={profiles.data?.profiles || []} onReload={onReload} />
      ) : null}
      {tab === "package" ? (
        <PackageTab
          project={project}
          onReload={onReload}
          onGenerate={() => setPackageOpen(true)}
          onOpenPath={openPath}
          packageJob={packageJob}
          onOpenAnimation={onOpenAnimation}
        />
      ) : null}

      <EditProjectModal open={editOpen} onClose={() => setEditOpen(false)} project={project} onSaved={onReload} />

      <PackageModal
        open={packageOpen}
        onClose={() => setPackageOpen(false)}
        project={project}
        onStarted={(job) => {
          setPackageJob(job);
          setPackageOpen(false);
          setTab("package");
        }}
      />

      <RegenerateVoiceModal
        line={regenLine}
        profiles={profiles.data?.profiles || []}
        onClose={() => setRegenLine(null)}
        onStarted={async (job) => {
          setRegenLine(null);
          toast.info("Regenerating this line", job.message || "Audio will update when the job finishes.");
          await onReload();
        }}
      />
    </div>
  );
}

function StoryTab({ project }: { project: Project }) {
  const sources = Array.isArray(project.sources) ? project.sources : [];
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-4">
        <Card className="p-6">
          <p className="eyebrow">Story foundation</p>
          <div className="mt-4 space-y-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted/70">Logline</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink/80">
                {String(project.idea?.logline || project.idea?.description || "No logline recorded.")}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted/70">Premise</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink/80">
                {String(project.idea?.premise || project.idea?.story_premise || "No premise recorded.")}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Opening hook", value: project.opening_hook },
                { label: "Outro", value: project.outro },
                { label: "Call to action", value: project.cta },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-white/50 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted/60">{item.label}</p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink/70">{item.value || "Not written yet."}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <p className="eyebrow">Research summary</p>
          <p className="mt-3 whitespace-pre-line text-[12px] leading-relaxed text-ink/75">
            {project.research_summary || "No research summary was recorded for this story."}
          </p>
          <div className="mt-4 rounded-xl bg-peach/30 px-3 py-2 text-[10.5px] leading-relaxed text-[#8a5f48]">
            Source status: {project.source_status}. Treat unverified claims carefully and keep the distinction between
            supplied sources and interpretation.
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-6">
          <p className="eyebrow">Sources</p>
          {sources.length === 0 ? (
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              No source records were supplied. Add research notes before publishing factual content.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {sources.map((source, index) => {
                if (typeof source === "string")
                  return (
                    <p key={index} className="rounded-xl bg-white/50 p-3 text-[11px] text-ink/70">
                      {source}
                    </p>
                  );
                return (
                  <div key={index} className="rounded-xl bg-white/50 p-3">
                    <p className="text-[11.5px] font-bold">{source.title || `Source ${index + 1}`}</p>
                    {source.url ? (
                      <button
                        type="button"
                        onClick={() => bridge.openExternal(source.url)}
                        className="mt-0.5 flex items-center gap-1 text-[10px] text-slateblue hover:underline"
                      >
                        <ExternalLink size={9} /> {source.url}
                      </button>
                    ) : null}
                    {source.note ? <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">{source.note}</p> : null}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card className="p-6">
          <p className="eyebrow">Production facts</p>
          <div className="mt-3 space-y-2 text-[11px]">
            {[
              ["Provider", project.provider || "—"],
              ["Model", project.model || "—"],
              ["Created", formatDate(project.created_at, "long")],
              ["Updated", formatDate(project.updated_at, "long")],
              ["Demo", project.is_demo ? "Yes — fictional sample" : "No"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-ink/[0.05] py-1.5 last:border-0">
                <span className="font-bold uppercase tracking-[0.08em] text-muted/60">{label}</span>
                <span className="text-right text-ink/75">{value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function EpisodesTab({
  project,
  onReload,
  onRegenerate,
  onOpenVoice,
}: {
  project: Project;
  onReload: () => Promise<void>;
  onRegenerate: (line: DialogueLine) => void;
  onOpenVoice: () => void;
}) {
  const toast = useToast();
  const [openEpisodes, setOpenEpisodes] = useState<number[]>(() => project.episodes.slice(0, 1).map((episode) => episode.id));
  const [editing, setEditing] = useState<DialogueLine | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const result = await api<{ audio_stale: boolean; message: string }>(`/projects/dialogue/${editing.id}`, {
        method: "PATCH",
        json: { text },
      });
      toast.success("Dialogue saved", result.message);
      setEditing(null);
      await onReload();
    } catch (error) {
      toast.error("Could not save the line", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!project.episodes.length) {
    return <EmptyState icon={<FileText size={20} />} title="No episodes yet" message="Script generation did not produce episodes." />;
  }

  return (
    <div className="space-y-3">
      {project.episodes.map((episode) => {
        const open = openEpisodes.includes(episode.id);
        const lines = (episode.scenes || []).flatMap((scene) => scene.dialogue);
        const ready = lines.filter((line) => line.audio_status === "ready").length;
        return (
          <Card key={episode.id} className="overflow-hidden">
            <button
              type="button"
              onClick={() =>
                setOpenEpisodes((current) =>
                  current.includes(episode.id) ? current.filter((id) => id !== episode.id) : [...current, episode.id],
                )
              }
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lavender/60 text-[12px] font-bold text-[#71618c]">
                {String(episode.episode_number).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">{episode.title}</p>
                <p className="mt-0.5 line-clamp-1 text-[10.5px] text-muted">{episode.summary}</p>
              </div>
              <div className="hidden items-center gap-3 text-[10px] font-semibold text-muted/70 sm:flex">
                <span>{episode.scene_count} scenes</span>
                <span className={ready === lines.length && lines.length > 0 ? "text-moss" : ""}>
                  {ready}/{lines.length} voiced
                </span>
                <span>{formatDuration(episode.estimated_duration)}</span>
              </div>
              <ChevronDown size={15} className={cn("text-muted transition", open && "rotate-180")} />
            </button>
            {open ? (
              <div className="border-t border-ink/[0.05] bg-white/25 px-5 py-4">
                <div className="mb-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={<AudioLines size={12} />} onClick={onOpenVoice}>
                    Generate episode voice
                  </Button>
                  {episode.subtitle_path ? <Badge tone="sage">Subtitles ready</Badge> : null}
                  {episode.audio_manifest_path ? <Badge tone="blue">Audio manifest ready</Badge> : null}
                </div>
                <div className="space-y-3">
                  {(episode.scenes || []).map((scene) => (
                    <div key={scene.id} className="rounded-2xl border border-ink/[0.06] bg-white/45 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-[11.5px] font-bold">
                            Scene {scene.scene_number} · {scene.heading}
                          </p>
                          <p className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted/60">
                            {formatDuration(scene.start_time)} – {formatDuration(scene.end_time)} · {scene.camera_movement || "static"}
                          </p>
                        </div>
                        <Badge tone="neutral">{scene.dialogue.length} lines</Badge>
                      </div>
                      {scene.action ? <p className="mt-2 text-[11px] leading-relaxed text-ink/70">{scene.action}</p> : null}
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {[
                          ["Visual", scene.visual_composition],
                          ["Lighting", scene.lighting],
                          ["Animation", scene.animation_instructions],
                          ["Continuity", scene.continuity],
                        ]
                          .filter(([, value]) => value)
                          .map(([label, value]) => (
                            <p key={label} className="text-[10px] leading-relaxed text-muted">
                              <span className="font-bold text-ink/50">{label}:</span> {value}
                            </p>
                          ))}
                      </div>
                      <div className="mt-3 space-y-2">
                        {scene.dialogue.map((line) => (
                          <div key={line.id} className="rounded-xl bg-white/70 p-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-clay">
                                  {line.speaker}
                                </span>
                                <span className="text-[9px] text-muted/50">{line.emotion}</span>
                                {line.audio_status === "ready" ? (
                                  <Badge tone="sage" className="px-1.5 py-0.5 text-[8.5px]">
                                    voiced
                                  </Badge>
                                ) : line.audio_status === "stale" ? (
                                  <Badge tone="rose" className="px-1.5 py-0.5 text-[8.5px]">
                                    stale
                                  </Badge>
                                ) : (
                                  <Badge tone="neutral" className="px-1.5 py-0.5 text-[8.5px]">
                                    no audio
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {line.audio_status === "ready" ? <VoiceAudio lineId={line.id} compact /> : null}
                                <IconButton
                                  label="Edit dialogue"
                                  onClick={() => {
                                    setEditing(line);
                                    setText(line.text);
                                  }}
                                >
                                  <Pencil size={12} />
                                </IconButton>
                                <IconButton label="Regenerate voice" onClick={() => onRegenerate(line)}>
                                  <RefreshCw size={12} />
                                </IconButton>
                              </div>
                            </div>
                            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink/85">{line.text}</p>
                            <p className="mt-1 text-[9px] text-muted/50">
                              {formatDuration(line.start_time)} – {formatDuration(line.end_time)}
                              {line.audio_duration ? ` · audio ${line.audio_duration.toFixed(1)}s` : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        );
      })}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit dialogue"
        description="Changing spoken text marks its audio as stale and requires the script to be approved again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void save()}>
              Save line
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-muted">
              <Badge tone="neutral">{editing.speaker}</Badge>
              <Badge tone="neutral">{editing.emotion}</Badge>
              <span>
                {formatDuration(editing.start_time)} – {formatDuration(editing.end_time)}
              </span>
            </div>
            <Textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-[120px]" autoFocus />
            <p className="text-[10.5px] leading-relaxed text-muted">
              Keep only the words that should be spoken aloud. Stage directions belong in the scene action, not the dialogue.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function CharactersTab({
  project,
  profiles,
  onReload,
}: {
  project: Project;
  profiles: VoiceProfile[];
  onReload: () => Promise<void>;
}) {
  const toast = useToast();
  const [assigning, setAssigning] = useState<number | null>(null);
  const [profileId, setProfileId] = useState("");

  if (!project.characters.length) {
    return (
      <Card className="p-2">
        <EmptyState
          icon={<Users size={20} />}
          title="No character bible yet"
          message="Character definitions are generated with the script. They keep appearance, personality and voice consistent across episodes."
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {project.characters.map((character) => {
        const voice = profiles.find((profile) => profile.id === character.voice_profile_id);
        return (
          <Card key={character.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-lavender to-peach text-[14px] font-bold text-ink/60">
                  {character.name.slice(0, 1)}
                </div>
                <div>
                  <p className="text-[13px] font-bold">{character.name}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/60">{character.role}</p>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => { setAssigning(character.id); setProfileId(String(character.voice_profile_id || "")); }}>
                <Mic2 size={12} /> {voice ? "Change voice" : "Assign voice"}
              </Button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">{character.description}</p>
            <div className="mt-3 space-y-1.5 text-[10.5px] leading-relaxed">
              {character.appearance ? (
                <p>
                  <span className="font-bold text-ink/50">Appearance:</span> <span className="text-muted">{character.appearance}</span>
                </p>
              ) : null}
              {character.personality ? (
                <p>
                  <span className="font-bold text-ink/50">Personality:</span> <span className="text-muted">{character.personality}</span>
                </p>
              ) : null}
              {character.continuity_notes ? (
                <p>
                  <span className="font-bold text-ink/50">Continuity:</span> <span className="text-muted">{character.continuity_notes}</span>
                </p>
              ) : null}
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/50 px-3 py-2">
              <Mic2 size={12} className="text-muted/60" />
              <span className="text-[10.5px] font-semibold text-ink/60">{voice ? `${voice.name} · ${voice.provider}` : "No voice assigned"}</span>
            </div>
          </Card>
        );
      })}

      <Modal
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        title="Assign a character voice"
        description="The voice profile is used when generating this character's dialogue."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  await api(`/projects/characters/${assigning}?voice_profile_id=${profileId || ""}`, { method: "PATCH" });
                  toast.success("Voice assigned");
                  setAssigning(null);
                  await onReload();
                } catch (error) {
                  toast.error("Could not assign voice", errorMessage(error));
                }
              }}
            >
              Assign
            </Button>
          </>
        }
      >
        <Field label="Voice profile">
          <Select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            <option value="">No voice</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} · {profile.provider === "elevenlabs" ? "ElevenLabs" : "Windows"} · {profile.language}
              </option>
            ))}
          </Select>
        </Field>
        {profiles.length === 0 ? (
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            No voice profiles exist for this channel yet. Create one in the Voice & Music Lab.
          </p>
        ) : null}
      </Modal>
    </div>
  );
}

function PackageTab({
  project,
  onReload,
  onGenerate,
  onOpenPath,
  packageJob,
  onOpenAnimation,
}: {
  project: Project;
  onReload: () => Promise<void>;
  onGenerate: () => void;
  onOpenPath: (path: string | null | undefined) => void;
  packageJob: Job | null;
  onOpenAnimation: () => void;
}) {
  const toast = useToast();
  const handoff = useFetch<{
    package_path: string;
    package_exists: boolean;
    animation_project_path: string;
    animation_project_exists: boolean;
    animation_episode_path: string;
    output_folder: string;
    approved: boolean;
  }>(() => api(`/projects/${project.id}/handoff`), [project.id]);

  const missing = useMemo(() => {
    const lines = project.episodes.flatMap((episode) => (episode.scenes || []).flatMap((scene) => scene.dialogue));
    return lines.filter((line) => line.audio_status !== "ready");
  }, [project.episodes]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Production package</p>
              <h3 className="display mt-1 text-[22px]">
                {project.production_package_path ? "Package generated" : "Ready to package"}
              </h3>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                A complete folder with story docs, scene timelines, SRT subtitles, audio manifests and the master Claude
                animation prompt.
              </p>
            </div>
            <Package size={22} className="text-ink/25" />
          </div>

          {packageJob && ["queued", "running"].includes(packageJob.status) ? (
            <div className="mt-4 rounded-xl bg-white/60 p-3">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-moss" /> {packageJob.message}
                </span>
                <span className="text-muted">{Math.round(packageJob.progress)}%</span>
              </div>
              <Progress value={packageJob.progress} className="mt-2" />
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" icon={<Package size={13} />} onClick={onGenerate} disabled={!project.approved_at}>
              {project.production_package_path ? "Regenerate" : "Generate package"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<FolderOpen size={13} />}
              onClick={() => onOpenPath(project.production_package_path)}
              disabled={!project.production_package_path}
            >
              Open package
            </Button>
            {project.production_package_path ? <CopyButton value={project.production_package_path} label="Copy path" /> : null}
          </div>

          {!project.approved_at ? (
            <p className="mt-3 text-[10.5px] font-semibold text-[#a95f66]">Approve the script before packaging.</p>
          ) : null}

          {missing.length > 0 ? (
            <div className="mt-4 rounded-xl bg-rose/30 p-3">
              <p className="text-[11px] font-bold text-[#8f555b]">
                {missing.length} dialogue line{missing.length === 1 ? "" : "s"} still need voice audio
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-[#8f555b]/80">
                The package can still be generated, but Claude is instructed not to invent replacement narration. Finish
                the voice work and regenerate for a complete handoff.
              </p>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-sage/40 p-3 text-[11px] font-semibold text-[#50694f]">
              <CheckCircle2 size={14} /> All dialogue has final audio.
            </div>
          )}
        </Card>

        <Card className="p-6">
          <p className="eyebrow">Package contents</p>
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {[
              "MASTER_STORY.md",
              "RESEARCH_SOURCES.md",
              "CHARACTER_BIBLE.md",
              "VISUAL_STYLE_GUIDE.md",
              "MASTER_ANIMATION_PROMPT.md",
              "PROJECT_MANIFEST.json",
              "PART_XX/SCREENPLAY.md",
              "PART_XX/SCENE_TIMELINE.json",
              "PART_XX/ANIMATION_PROMPT.md",
              "PART_XX/SUBTITLES.srt",
              "PART_XX/AUDIO/ + manifest",
              "PART_XX/ASSET_MANIFEST.json",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-lg bg-white/45 px-2.5 py-1.5">
                <FileText size={10} className="text-muted/50" />
                <span className="font-mono text-[9.5px] text-ink/60">{item}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-6">
          <p className="eyebrow">Claude handoff</p>
          <div className="mt-3 space-y-2">
            <PathRow label="Permanent channel project" value={handoff.data?.animation_project_path || project.animation_episode_path?.replace(/\\episodes\\.*$/, "")} onOpen={() => onOpenPath(handoff.data?.animation_project_path)} />
            <PathRow label="Episode handoff note" value={project.animation_episode_path} onOpen={() => onOpenPath(project.animation_episode_path)} />
            <PathRow label="Finished video folder" value={handoff.data?.output_folder} onOpen={() => onOpenPath(handoff.data?.output_folder)} />
          </div>
          <Button className="mt-4 w-full" size="sm" variant="secondary" icon={<Wand2 size={13} />} onClick={onOpenAnimation}>
            Open Claude Animation Studio
          </Button>
        </Card>

        <Card className="p-6">
          <p className="eyebrow">How the handoff works</p>
          <ol className="mt-3 space-y-2.5">
            {[
              "Approve the script and finish the voice audio.",
              "Generate the production package and handoff note.",
              "Open the permanent channel project in Claude Code.",
              "Paste or open the generated master prompt yourself.",
              "Claude renders into the channel output folder.",
              "Katha Studio imports the finished video after validation.",
            ].map((step, index) => (
              <li key={step} className="flex gap-2.5 text-[11px] leading-relaxed text-muted">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-[8.5px] font-bold text-ink/50">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[10px] leading-relaxed text-muted/60">
            Katha Studio does not inject prompts into Claude Desktop or read Claude credentials. The handoff is a real
            folder plus an official CLI launch.
          </p>
        </Card>
      </div>
    </div>
  );
}

function PathRow({ label, value, onOpen }: { label: string; value: string | null | undefined; onOpen: () => void }) {
  return (
    <div className="rounded-xl bg-white/50 p-2.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted/60">{label}</p>
      <div className="mt-0.5 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-ink/60">{value || "Not created yet"}</p>
        <IconButton label="Open" onClick={onOpen} disabled={!value}>
          <ExternalLink size={11} />
        </IconButton>
      </div>
    </div>
  );
}

function EditProjectModal({
  open,
  onClose,
  project,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: project.title,
    opening_hook: project.opening_hook,
    outro: project.outro,
    cta: project.cta,
    research_summary: project.research_summary,
    animation_style: project.animation_style,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      title: project.title,
      opening_hook: project.opening_hook,
      outro: project.outro,
      cta: project.cta,
      research_summary: project.research_summary,
      animation_style: project.animation_style,
    });
  }, [project.id]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit story details"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await api(`/projects/${project.id}`, { method: "PATCH", json: form });
                toast.success("Story updated");
                onClose();
                await onSaved();
              } catch (error) {
                toast.error("Could not save", errorMessage(error));
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Opening hook">
            <Textarea value={form.opening_hook} onChange={(event) => setForm({ ...form, opening_hook: event.target.value })} />
          </Field>
          <Field label="Outro">
            <Textarea value={form.outro} onChange={(event) => setForm({ ...form, outro: event.target.value })} />
          </Field>
        </div>
        <Field label="Call to action">
          <Input value={form.cta} onChange={(event) => setForm({ ...form, cta: event.target.value })} />
        </Field>
        <Field label="Research summary">
          <Textarea
            value={form.research_summary}
            onChange={(event) => setForm({ ...form, research_summary: event.target.value })}
            className="min-h-[110px]"
          />
        </Field>
        <Field label="Animation direction for this story">
          <Textarea value={form.animation_style} onChange={(event) => setForm({ ...form, animation_style: event.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function PackageModal({
  open,
  onClose,
  project,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  onStarted: (job: Job) => void;
}) {
  const toast = useToast();
  const [includeAudio, setIncludeAudio] = useState(true);
  const [overwrite, setOverwrite] = useState(Boolean(project.production_package_path));
  const [starting, setStarting] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project.production_package_path ? "Regenerate production package" : "Generate production package"}
      description="Writes the complete Claude handoff to the studio workspace. Existing shared channel assets are never overwritten."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={starting}
            icon={<Package size={14} />}
            onClick={async () => {
              setStarting(true);
              try {
                const result = await api<{ job: Job }>(`/projects/${project.id}/package`, {
                  method: "POST",
                  json: { include_audio: includeAudio, overwrite },
                });
                onStarted(result.job);
              } catch (error) {
                toast.error("Could not start packaging", errorMessage(error));
              } finally {
                setStarting(false);
              }
            }}
          >
            Generate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-xl bg-white/60 p-3">
          <div>
            <p className="text-[11.5px] font-bold">Include dialogue audio</p>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
              Copies each final voice clip into PART_XX/AUDIO and maps it in the manifest. Missing clips are reported, never faked.
            </p>
          </div>
          <Toggle checked={includeAudio} onChange={setIncludeAudio} />
        </div>
        <div className="flex items-start justify-between gap-4 rounded-xl bg-white/60 p-3">
          <div>
            <p className="text-[11.5px] font-bold">Replace an existing generated package</p>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
              Required when a package already exists. Only generated package files are replaced; the permanent channel
              project stays intact.
            </p>
          </div>
          <Toggle checked={overwrite} onChange={setOverwrite} />
        </div>
        <div className="rounded-xl bg-lavender/35 px-3 py-2 text-[10.5px] leading-relaxed text-[#71618c]">
          Destination: the studio's Production Packages folder, inside the channel and story slug. The handoff note is
          written under the channel project's episodes folder.
        </div>
      </div>
    </Modal>
  );
}

function RegenerateVoiceModal({
  line,
  profiles,
  onClose,
  onStarted,
}: {
  line: DialogueLine | null;
  profiles: VoiceProfile[];
  onClose: () => void;
  onStarted: (job: Job) => Promise<void>;
}) {
  const toast = useToast();
  const [profileId, setProfileId] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (line) setProfileId(String(line.voice_profile_id || profiles[0]?.id || ""));
  }, [line?.id, profiles.length]);

  const profile = profiles.find((item) => item.id === Number(profileId));

  return (
    <Modal
      open={Boolean(line)}
      onClose={onClose}
      title="Regenerate this line"
      description="Uses the exact spoken text only. Choose the voice that should read it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={starting}
            disabled={!profile}
            icon={<RefreshCw size={13} />}
            onClick={async () => {
              if (!line || !profile) return;
              setStarting(true);
              try {
                const result = await api<{ job: Job }>(`/voice/lines/${line.id}/regenerate`, {
                  method: "POST",
                  json: { voice_profile_id: profile.id, provider: profile.provider },
                });
                await onStarted(result.job);
              } catch (error) {
                toast.error("Could not regenerate", errorMessage(error));
              } finally {
                setStarting(false);
              }
            }}
          >
            Generate
          </Button>
        </>
      }
    >
      {line ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-white/60 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted/60">{line.speaker}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink/80">{line.text}</p>
          </div>
          <Field label="Voice profile">
            <Select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
              {profiles.length === 0 ? <option value="">No profiles available</option> : null}
              {profiles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.provider === "elevenlabs" ? "ElevenLabs" : "Windows SAPI"} · {item.language}
                </option>
              ))}
            </Select>
          </Field>
          {profile?.provider === "elevenlabs" ? (
            <p className="text-[10.5px] leading-relaxed text-muted">
              ElevenLabs must be connected in Connections & Settings. Generation uses your account and may consume credits.
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
