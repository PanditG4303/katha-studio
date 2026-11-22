import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Archive,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clapperboard,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Film,
  FolderOpen,
  History,
  Image,
  Loader2,
  MonitorPlay,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { api, bridge, mediaUrl } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/AppStore";
import type { DashboardData, Job, ProjectSummary, Video } from "@/lib/types";
import {
  cn,
  errorMessage,
  formatBytes,
  formatDate,
  formatDateTime,
  formatDuration,
  statusLabel,
  truncate,
} from "@/lib/utils";
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
  Select,
  Stat,
  StatusBadge,
  Tabs,
  Textarea,
  Toggle,
} from "@/components/ui";
import { VideoThumbnail } from "@/components/shared";
import { useToast } from "@/components/Toast";

const PRODUCTION_STATUSES = [
  "ANIMATION_COMPLETED",
  "AWAITING_REVIEW",
  "READY_TO_UPLOAD",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
  "ARCHIVED",
];

const CATEGORIES = ["Storytelling", "Mythology", "History", "Mystery", "Motivation", "Kids", "Culture", "Documentary", "Comedy", "Education"];

interface ImportHistoryItem {
  id: number;
  file_path: string;
  file_size: number;
  video_id: number | null;
  status: string;
  message: string;
  source: string;
  created_at: string;
}

export function VideoLibraryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { channels, selectedChannelId, dataVersion, refreshChannels } = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState(selectedChannelId ? String(selectedChannelId) : "all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sort, setSort] = useState("updated_at");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rescanning, setRescanning] = useState(false);

  const selectedId = searchParams.get("video") ? Number(searchParams.get("video")) : null;

  const videos = useFetch<{ videos: Video[]; total: number }>(
    () => {
      const params = new URLSearchParams();
      params.set("limit", "300");
      params.set("sort", sort);
      if (search.trim()) params.set("search", search.trim());
      if (channelFilter !== "all") params.set("channel_id", channelFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (platformFilter !== "all") params.set("platform", platformFilter);
      return api(`/videos?${params.toString()}`);
    },
    [search, channelFilter, statusFilter, platformFilter, sort, dataVersion],
  );

  const dashboard = useFetch<DashboardData>(() => api("/dashboard"), [dataVersion]);
  const counts = dashboard.data?.counts || {};

  const projects = useFetch<{ projects: ProjectSummary[] }>(() => api("/projects?limit=300"), [dataVersion]);

  const detail = useFetch<Video>(() => api(`/videos/${selectedId}`), [selectedId, dataVersion], {
    immediate: Boolean(selectedId),
  });

  const list = videos.data?.videos || [];

  const openVideo = (video: Video) => {
    setSearchParams({ video: String(video.id) });
  };

  const closeVideo = () => setSearchParams({});

  const rescan = async () => {
    setRescanning(true);
    try {
      const result = await api<{ count: number; imported: Array<{ message: string }> }>("/videos/rescan", { method: "POST" });
      if (result.count) {
        toast.success(`${result.count} new film${result.count === 1 ? "" : "s"} imported`, "Each file passed FFprobe validation.");
        await videos.reload(true);
        void dashboard.reload(true);
        void refreshChannels();
      } else {
        toast.info("No new films found", "The watch and output folders were scanned.");
      }
    } catch (error) {
      toast.error("Could not scan folders", errorMessage(error));
    } finally {
      setRescanning(false);
    }
  };

  return (
    <div className="animate-float-in">
      <PageHeader
        eyebrow="The finished films"
        title="Video Library"
        description="Every validated film, its metadata and its publishing state. Files are imported from your watch folders or chosen by hand — never invented."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={14} />} loading={rescanning} onClick={() => void rescan()}>
              Scan folders
            </Button>
            <Button variant="secondary" icon={<History size={14} />} onClick={() => setHistoryOpen(true)}>
              Import log
            </Button>
            <Button icon={<Upload size={14} />} onClick={() => setImportOpen(true)}>
              Import video
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="In the library" value={counts.total_videos ?? 0} hint="Validated video files" icon={<Film size={15} />} />
        <Stat
          label="Ready to upload"
          value={counts.ready_to_upload ?? 0}
          hint="Metadata prepared, file present"
          tone="lavender"
          icon={<CheckCircle2 size={15} />}
        />
        <Stat label="Scheduled" value={counts.scheduled ?? 0} hint="On a publishing calendar" tone="powder" icon={<CalendarClock size={15} />} />
        <Stat label="Published" value={counts.published ?? 0} hint="Confirmed or marked published" tone="sage" icon={<Send size={15} />} />
      </div>

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/50" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search titles, descriptions, categories…" className="pl-9" />
          </div>
          <Select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} className="w-[170px]">
            <option value="all">All channels</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-[170px]">
            <option value="all">Any production state</option>
            {PRODUCTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </Select>
          <Select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} className="w-[140px]">
            <option value="all">Any platform</option>
            <option value="youtube">YouTube</option>
            <option value="instagram">Instagram</option>
          </Select>
          <Select value={sort} onChange={(event) => setSort(event.target.value)} className="w-[150px]">
            <option value="updated_at">Recently updated</option>
            <option value="created_at">Recently imported</option>
            <option value="title">Title A–Z</option>
            <option value="duration">Longest first</option>
            <option value="published_at">Recently published</option>
          </Select>
          <Tabs
            value={view}
            onChange={setView}
            tabs={[
              { id: "grid", label: "Grid" },
              { id: "list", label: "List" },
            ]}
          />
        </div>
      </Card>

      {videos.loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((index) => (
            <div key={index} className="skeleton h-72 rounded-3xl" />
          ))}
        </div>
      ) : videos.error ? (
        <Card className="p-2">
          <EmptyState icon={<X size={20} />} title="Could not load the library" message={videos.error} />
        </Card>
      ) : list.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={<Clapperboard size={22} />}
            title="No films yet"
            message="When Claude renders into your channel output folder, Katha Studio validates the file with FFprobe and adds it here. You can also import a finished video directly."
            action={
              <Button icon={<Upload size={14} />} onClick={() => setImportOpen(true)}>
                Import your first film
              </Button>
            }
          />
        </Card>
      ) : view === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((video) => (
            <VideoCard key={video.id} video={video} onOpen={() => openVideo(video)} onPublish={() => navigate(`/publishing?video=${video.id}`)} />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          {list.map((video, index) => (
            <button
              key={video.id}
              type="button"
              onClick={() => openVideo(video)}
              className={cn(
                "flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-white/60",
                index > 0 && "border-t border-ink/[0.05]",
              )}
            >
              <VideoThumbnail
                videoId={video.id}
                title={video.title}
                hasThumbnail={video.has_thumbnail}
                duration={video.duration}
                className="h-14 w-24 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-bold">{video.title}</p>
                <p className="mt-0.5 truncate text-[10.5px] text-muted">
                  {video.channel_name}
                  {video.project_title ? ` · ${video.project_title}` : ""} · {formatDate(video.updated_at)}
                </p>
              </div>
              <div className="hidden shrink-0 items-center gap-3 sm:flex">
                {video.youtube_url ? (
                  <Badge tone="rose">YouTube</Badge>
                ) : null}
                <StatusBadge status={video.production_status} />
              </div>
              <ArrowRight size={14} className="shrink-0 text-muted/50" />
            </button>
          ))}
        </Card>
      )}

      {detail.data ? (
        <VideoDrawer
          video={detail.data}
          channels={channels}
          projects={projects.data?.projects || []}
          onClose={closeVideo}
          onChanged={async () => {
            await detail.reload(true);
            await videos.reload(true);
            void dashboard.reload(true);
            void refreshChannels();
          }}
          onPublish={() => navigate(`/publishing?video=${detail.data?.id}`)}
        />
      ) : null}

      <ImportVideoModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={async () => {
          await videos.reload(true);
          void dashboard.reload(true);
          void refreshChannels();
        }}
      />

      <ImportHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}

function VideoCard({ video, onOpen, onPublish }: { video: Video; onOpen: () => void; onPublish: () => void }) {
  return (
    <Card className="group overflow-hidden p-0 transition hover:-translate-y-0.5 hover:shadow-lift">
      <button type="button" onClick={onOpen} className="relative block w-full text-left">
        <VideoThumbnail
          videoId={video.id}
          title={video.title}
          hasThumbnail={video.has_thumbnail}
          duration={video.duration}
          className="aspect-video w-full rounded-none"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <StatusBadge status={video.production_status} />
          {video.is_demo ? <Badge tone="peach">Demo</Badge> : null}
        </div>
        {!video.has_video ? (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/40 backdrop-blur-[1px]">
            <span className="rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold text-ink/70">File not on disk</span>
          </div>
        ) : null}
        {video.has_video ? (
          <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm transition group-hover:scale-105">
            <Play size={14} />
          </span>
        ) : null}
      </button>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="line-clamp-2 text-[13px] font-bold leading-snug">{video.title}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-muted">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: video.channel_accent }} />
              {video.channel_name}
              {video.project_title ? ` · ${video.project_title}` : ""}
            </p>
          </div>
          <IconButton label="Open video" onClick={onOpen}>
            <ArrowRight size={14} />
          </IconButton>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[9.5px] font-semibold text-muted/70">
          <span className="flex items-center gap-1">
            <Clock3 size={10} /> {formatDuration(video.duration)}
          </span>
          <span className="flex items-center gap-1">
            <MonitorPlay size={10} /> {video.width}×{video.height}
          </span>
          {video.aspect_ratio ? <Badge tone="neutral" className="px-1.5 py-0.5 text-[8.5px]">{video.aspect_ratio}</Badge> : null}
          {video.youtube_url ? <Badge tone="rose" className="px-1.5 py-0.5 text-[8.5px]">YouTube</Badge> : null}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-ink/[0.05] pt-2.5">
          <span className="text-[9.5px] font-semibold text-muted/60">Updated {formatDate(video.updated_at)}</span>
          <div className="flex items-center gap-1">
            {video.youtube_url ? (
              <Button size="sm" variant="ghost" icon={<ExternalLink size={11} />} onClick={() => bridge.openExternal(video.youtube_url)}>
                Watch
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" icon={<Send size={11} />} onClick={onPublish}>
              Publish
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function VideoDrawer({
  video,
  channels,
  projects,
  onClose,
  onChanged,
  onPublish,
}: {
  video: Video;
  channels: Array<{ id: number; name: string }>;
  projects: ProjectSummary[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onPublish: () => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<"details" | "metadata" | "publishing">("details");
  const [saving, setSaving] = useState(false);
  const [playback, setPlayback] = useState<string | null>(null);
  const [edit, setEdit] = useState({
    title: video.title,
    description: video.description,
    category: video.category,
    tags: video.tags.join(", "),
    hashtags: video.hashtags.join(", "),
    channel_id: video.channel_id ? String(video.channel_id) : "",
    project_id: video.project_id ? String(video.project_id) : "",
    aspect_ratio: video.aspect_ratio,
    production_status: video.production_status,
  });
  const [markOpen, setMarkOpen] = useState(false);
  const [markUrl, setMarkUrl] = useState(video.youtube_url || "");
  const [marking, setMarking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setTab("details");
    setEdit({
      title: video.title,
      description: video.description,
      category: video.category,
      tags: video.tags.join(", "),
      hashtags: video.hashtags.join(", "),
      channel_id: video.channel_id ? String(video.channel_id) : "",
      project_id: video.project_id ? String(video.project_id) : "",
      aspect_ratio: video.aspect_ratio,
      production_status: video.production_status,
    });
    setMarkUrl(video.youtube_url || "");
  }, [video.id, video.updated_at]);

  useEffect(() => {
    let active = true;
    if (!video.has_video) {
      setPlayback(null);
      return;
    }
    mediaUrl("video", video.id)
      .then((url) => {
        if (active) setPlayback(url);
      })
      .catch(() => setPlayback(null));
    return () => {
      active = false;
    };
  }, [video.id, video.has_video]);

  const projectOptions = useMemo(
    () => projects.filter((project) => !edit.channel_id || project.channel_id === Number(edit.channel_id)),
    [projects, edit.channel_id],
  );

  const save = async () => {
    setSaving(true);
    try {
      await api(`/videos/${video.id}`, {
        method: "PATCH",
        json: {
          title: edit.title,
          description: edit.description,
          category: edit.category,
          tags: edit.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          hashtags: edit.hashtags.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean),
          channel_id: edit.channel_id ? Number(edit.channel_id) : null,
          project_id: edit.project_id ? Number(edit.project_id) : null,
          aspect_ratio: edit.aspect_ratio,
          production_status: edit.production_status,
        },
      });
      toast.success("Video details saved");
      await onChanged();
    } catch (error) {
      toast.error("Could not save the video", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const refreshMetadata = async () => {
    setRefreshing(true);
    try {
      await api(`/videos/${video.id}/refresh-metadata`, { method: "POST" });
      toast.success("Technical metadata refreshed", "FFprobe re-read the file on disk.");
      await onChanged();
    } catch (error) {
      toast.error("Could not refresh metadata", errorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const reveal = async (path: string | null) => {
    if (!path) return;
    const result = await bridge.showItem(path);
    if (!result.ok) toast.error("Could not reveal the file", result.error);
  };

  const markPublished = async () => {
    if (!markUrl.startsWith("https://youtube.com/") && !markUrl.startsWith("https://www.youtube.com/") && !markUrl.startsWith("https://youtu.be/")) {
      toast.error("Enter a YouTube link", "The address must be a real YouTube video URL.");
      return;
    }
    setMarking(true);
    try {
      await api(`/videos/${video.id}/mark-published`, { method: "POST", json: { youtube_url: markUrl } });
      toast.success("Marked as published", "This records a manual confirmation; it does not upload anything.");
      setMarkOpen(false);
      await onChanged();
    } catch (error) {
      toast.error("Could not mark the video", errorMessage(error));
    } finally {
      setMarking(false);
    }
  };

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={video.title}
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{video.channel_name}</Badge>
            <StatusBadge status={video.production_status} />
            {video.youtube_url ? <Badge tone="rose">On YouTube</Badge> : null}
            {video.is_demo ? <Badge tone="peach">Demo</Badge> : null}
          </div>
        }
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="secondary" icon={<Send size={13} />} onClick={onPublish}>
              Publishing manager
            </Button>
            <Button loading={saving} onClick={() => void save()}>
              Save details
            </Button>
          </>
        }
      >
        <div className="mb-5">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "details", label: "Overview" },
              { id: "metadata", label: "Metadata" },
              { id: "publishing", label: "Publishing" },
            ]}
          />
        </div>

        {tab === "details" ? (
          <div className="space-y-5">
            {playback ? (
              <video
                key={playback}
                src={playback}
                controls
                preload="metadata"
                poster=""
                className="aspect-video w-full rounded-2xl bg-ink/90"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-gradient-to-br from-[#e8e1ef] via-[#f3e8dc] to-[#e2eadf]">
                <div className="text-center">
                  <Film size={30} className="mx-auto text-ink/20" />
                  <p className="mt-2 text-[11px] font-semibold text-ink/40">
                    {video.has_video ? "Preparing preview…" : "The video file is no longer on disk"}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Duration", value: formatDuration(video.duration) },
                { label: "Resolution", value: `${video.width}×${video.height}` },
                { label: "Frame rate", value: video.fps ? `${video.fps.toFixed(2)} fps` : "—" },
                { label: "File size", value: formatBytes(video.file_size) },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-white/55 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted/60">{item.label}</p>
                  <p className="mt-1 text-[12px] font-bold text-ink/80">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<FolderOpen size={13} />} disabled={!video.final_video_path} onClick={() => void reveal(video.final_video_path)}>
                Reveal file
              </Button>
              <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} loading={refreshing} disabled={!video.has_video} onClick={() => void refreshMetadata()}>
                Re-read metadata
              </Button>
              {video.subtitle_path ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Download size={13} />}
                  onClick={async () => {
                    const url = await mediaUrl("subtitle", video.id);
                    await bridge.openExternal(url);
                  }}
                >
                  Download subtitles
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                icon={<Archive size={13} />}
                onClick={async () => {
                  try {
                    await api(`/videos/${video.id}/archive?archived=${!video.archived}`, { method: "POST" });
                    toast.success(video.archived ? "Video restored" : "Video archived");
                    await onChanged();
                  } catch (error) {
                    toast.error("Could not update the archive", errorMessage(error));
                  }
                }}
              >
                {video.archived ? "Restore" : "Archive"}
              </Button>
            </div>

            <div className="rounded-2xl border border-ink/[0.06] bg-white/45 p-4">
              <p className="eyebrow">Where it came from</p>
              <div className="mt-2 space-y-2 text-[11px] leading-relaxed">
                <PathLine label="Final file" value={video.final_video_path} onOpen={() => void reveal(video.final_video_path)} />
                <PathLine label="Production package" value={video.production_package_path} onOpen={() => void reveal(video.production_package_path)} />
                <PathLine label="Source" value={video.source} />
                <PathLine label="Imported" value={formatDateTime(video.created_at)} />
              </div>
            </div>

            {video.description ? (
              <div>
                <p className="eyebrow mb-1.5">Description</p>
                <p className="whitespace-pre-line text-[12px] leading-relaxed text-ink/75">{video.description}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "metadata" ? (
          <div className="space-y-4">
            <Field label="Title">
              <Input value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} />
            </Field>
            <Field label="Description">
              <Textarea
                value={edit.description}
                onChange={(event) => setEdit({ ...edit, description: event.target.value })}
                className="min-h-[130px]"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category">
                <Select value={edit.category} onChange={(event) => setEdit({ ...edit, category: event.target.value })}>
                  {!CATEGORIES.includes(edit.category) ? <option value={edit.category}>{edit.category || "Uncategorised"}</option> : null}
                  {CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Aspect ratio">
                <Select value={edit.aspect_ratio} onChange={(event) => setEdit({ ...edit, aspect_ratio: event.target.value })}>
                  {["16:9", "9:16", "1:1", "4:5"].map((ratio) => (
                    <option key={ratio}>{ratio}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Channel">
                <Select
                  value={edit.channel_id}
                  onChange={(event) => setEdit({ ...edit, channel_id: event.target.value, project_id: "" })}
                >
                  <option value="">Unassigned</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Story">
                <Select value={edit.project_id} onChange={(event) => setEdit({ ...edit, project_id: event.target.value })}>
                  <option value="">No project</option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Tags" hint="Comma separated. Used for YouTube tags and local search.">
              <Input value={edit.tags} onChange={(event) => setEdit({ ...edit, tags: event.target.value })} placeholder="folk tale, hindi story, animation" />
            </Field>
            <Field label="Hashtags" hint="Comma separated. The # is added automatically in the publishing workflow.">
              <Input value={edit.hashtags} onChange={(event) => setEdit({ ...edit, hashtags: event.target.value })} placeholder="HindiStories, FolkTales" />
            </Field>
            <Field label="Production state" hint="Manual state changes are recorded locally. YouTube's real status is shown separately.">
              <Select value={edit.production_status} onChange={(event) => setEdit({ ...edit, production_status: event.target.value })}>
                {PRODUCTION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        {tab === "publishing" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-ink/[0.06] bg-white/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-bold">YouTube</p>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                    Local state: <span className="font-bold text-ink/70">{statusLabel(video.production_status)}</span>. YouTube status:{" "}
                    <span className="font-bold text-ink/70">{statusLabel(video.youtube_status)}</span>.
                  </p>
                </div>
                {video.youtube_url ? (
                  <Button size="sm" variant="secondary" icon={<ExternalLink size={12} />} onClick={() => bridge.openExternal(video.youtube_url)}>
                    Open on YouTube
                  </Button>
                ) : (
                  <Button size="sm" icon={<Send size={12} />} onClick={onPublish}>
                    Upload or schedule
                  </Button>
                )}
              </div>
              {video.scheduled_at ? (
                <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-powder/40 px-2.5 py-1.5 text-[10.5px] font-semibold text-[#5b7088]">
                  <CalendarClock size={11} /> Scheduled for {formatDateTime(video.scheduled_at)}
                </p>
              ) : null}
              {video.published_at ? (
                <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-sage/40 px-2.5 py-1.5 text-[10.5px] font-semibold text-[#50694f]">
                  <CheckCircle2 size={11} /> Published {formatDateTime(video.published_at)}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {!video.youtube_url ? (
                  <Button size="sm" variant="secondary" icon={<CheckCircle2 size={12} />} onClick={() => setMarkOpen(true)}>
                    Mark as published manually
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<RotateCcw size={12} />}
                    onClick={() => {
                      setMarkUrl(video.youtube_url);
                      setMarkOpen(true);
                    }}
                  >
                    Update YouTube link
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-ink/[0.06] bg-white/50 p-4">
              <p className="text-[12px] font-bold">Instagram</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                Instagram is a manual workflow. Prepare the caption and file in the Publishing Manager, then post it
                yourself. Katha Studio never claims an automatic Instagram publish.
              </p>
              <Button className="mt-3" size="sm" variant="secondary" icon={<Image size={12} />} onClick={onPublish}>
                Prepare Instagram post
              </Button>
            </div>

            <div className="rounded-xl bg-peach/30 px-3 py-2 text-[10.5px] leading-relaxed text-[#8a5f48]">
              Katha Studio only reports a YouTube schedule after YouTube confirms it. Marking a video as published by
              hand is a local record, clearly separate from an API upload.
            </div>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={markOpen}
        onClose={() => setMarkOpen(false)}
        title="Mark as published on YouTube"
        description="Use this when you uploaded the film yourself. It records the real link; it does not perform an upload."
        footer={
          <>
            <Button variant="ghost" onClick={() => setMarkOpen(false)}>
              Cancel
            </Button>
            <Button loading={marking} icon={<CheckCircle2 size={13} />} onClick={() => void markPublished()}>
              Save link
            </Button>
          </>
        }
      >
        <Field label="YouTube video URL">
          <Input value={markUrl} onChange={(event) => setMarkUrl(event.target.value)} placeholder="https://youtu.be/…" autoFocus />
        </Field>
        <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
          The video's production state becomes Published and a publication record is created. Nothing is sent to Google.
        </p>
      </Modal>
    </>
  );
}

function PathLine({ label, value, onOpen }: { label: string; value: string | null | undefined; onOpen?: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/55 px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-muted/60">{label}</p>
        <p className="truncate font-mono text-[9.5px] text-ink/60">{value || "Not recorded"}</p>
      </div>
      {onOpen && value ? (
        <IconButton label={`Open ${label}`} onClick={onOpen}>
          <ExternalLink size={11} />
        </IconButton>
      ) : null}
    </div>
  );
}

function ImportVideoModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const toast = useToast();
  const { channels, selectedChannelId } = useAppStore();
  const [path, setPath] = useState("");
  const [title, setTitle] = useState("");
  const [channelId, setChannelId] = useState(selectedChannelId ? String(selectedChannelId) : "");
  const [projectId, setProjectId] = useState("");
  const [waitStable, setWaitStable] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState<string>("");
  const projects = useFetch<{ projects: ProjectSummary[] }>(
    () => api(`/projects?limit=200${channelId ? `&channel_id=${channelId}` : ""}`),
    [channelId],
    { immediate: open },
  );

  useEffect(() => {
    if (!open) return;
    setLastResult("");
  }, [open]);

  const chooseFile = async () => {
    const chosen = await bridge.pickFile("Choose a finished video", ["mp4", "mov", "m4v", "webm", "mkv"]);
    if (!chosen) return;
    setPath(chosen);
    if (!title) setTitle(chosen.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "");
  };

  const submit = async () => {
    if (!path) {
      toast.error("Choose a video file first");
      return;
    }
    setImporting(true);
    try {
      const result = await api<{ video_id: number; duplicate: boolean; title?: string; message: string; duration?: number }>("/videos/import", {
        method: "POST",
        json: {
          path,
          title: title || null,
          channel_id: channelId ? Number(channelId) : null,
          project_id: projectId ? Number(projectId) : null,
          source: "manual",
          wait_for_stable: waitStable,
        },
      });
      if (result.duplicate) {
        toast.info("Already in the library", result.message);
        setLastResult(result.message);
      } else {
        toast.success("Video imported", result.message);
        setLastResult(`${result.title || title} · ${formatDuration(result.duration)}`);
        setPath("");
        setTitle("");
        await onImported();
      }
    } catch (error) {
      toast.error("Import failed", errorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import a finished video"
      description="The file is validated with FFprobe, thumbnailed, hashed for duplicate prevention, and added to the library. The original file stays where it is."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button loading={importing} disabled={!path} icon={<Upload size={13} />} onClick={() => void submit()}>
            Import & validate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Video file">
          <div className="flex gap-2">
            <Input value={path} onChange={(event) => setPath(event.target.value)} placeholder="Choose an MP4, MOV, M4V, WebM or MKV…" />
            <Button variant="secondary" icon={<FolderOpen size={13} />} onClick={() => void chooseFile()}>
              Browse
            </Button>
          </div>
        </Field>
        <Field label="Title (optional)">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Defaults to the file name" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
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
          <Field label="Story (optional)">
            <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">No project</option>
              {(projects.data?.projects || []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-xl bg-white/60 p-3">
          <div>
            <p className="text-[11.5px] font-bold">Wait for the file to stop changing</p>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
              Useful if another program is still writing the file. Otherwise the import fails cleanly and can be retried.
            </p>
          </div>
          <Toggle checked={waitStable} onChange={setWaitStable} label="Wait for stable file" />
        </div>
        {lastResult ? (
          <div className="flex items-start gap-2 rounded-xl bg-sage/40 px-3 py-2 text-[10.5px] leading-relaxed text-[#50694f]">
            <CheckCircle2 size={12} className="mt-0.5 shrink-0" /> {lastResult}
          </div>
        ) : null}
        <div className="rounded-xl bg-powder/35 px-3 py-2 text-[10px] leading-relaxed text-[#5b7088]">
          Duplicate prevention uses the resolved file path and a content hash. The same film cannot enter the library twice.
        </div>
      </div>
    </Modal>
  );
}

function ImportHistoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const history = useFetch<{ imports: ImportHistoryItem[] }>(() => api("/imports/history?limit=80"), [open], { immediate: open });
  return (
    <Modal open={open} onClose={onClose} title="Import log" description="Every attempted import, including failures, with its real reason." size="lg">
      {history.loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((index) => (
            <div key={index} className="skeleton h-14 rounded-xl" />
          ))}
        </div>
      ) : (history.data?.imports || []).length === 0 ? (
        <EmptyState compact icon={<History size={20} />} title="No imports yet" message="Imported and watched files will be logged here." />
      ) : (
        <div className="space-y-1.5">
          {(history.data?.imports || []).map((item) => (
            <div key={item.id} className="flex items-start gap-3 rounded-xl border border-ink/[0.06] bg-white/50 p-3">
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  item.status === "imported" ? "bg-sage/70 text-moss" : item.status === "duplicate" ? "bg-powder/70 text-slateblue" : "bg-rose/60 text-[#a95f66]",
                )}
              >
                {item.status === "imported" ? <CheckCircle2 size={12} /> : item.status === "duplicate" ? <FileText size={12} /> : <X size={12} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold">{item.file_path.split(/[\\/]/).pop()}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{item.message}</p>
                <p className="mt-1 text-[9px] font-semibold text-muted/50">
                  {formatDateTime(item.created_at)} · {item.source} · {formatBytes(item.file_size)}
                </p>
              </div>
              <Badge tone={item.status === "imported" ? "sage" : item.status === "duplicate" ? "blue" : "rose"}>{statusLabel(item.status)}</Badge>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
