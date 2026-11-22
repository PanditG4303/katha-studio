import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileVideo,
  FolderOpen,
  Image,
  Info,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  X,
  Youtube,
} from "lucide-react";
import { api, bridge } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/AppStore";
import type {
  Job,
  Publication,
  SocialAccount,
  UploadJob,
  Video,
  YouTubeStatus,
} from "@/lib/types";
import {
  cn,
  errorMessage,
  formatDateTime,
  formatDuration,
  fromLocalInput,
  statusLabel,
  toLocalInput,
  truncate,
} from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CopyButton,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Progress,
  Select,
  Stat,
  StatusBadge,
  Tabs,
  Textarea,
  Toggle,
} from "@/components/ui";
import { VideoThumbnail } from "@/components/shared";
import { useToast } from "@/components/Toast";

const YOUTUBE_CATEGORIES = [
  { id: "1", label: "Film & Animation" },
  { id: "10", label: "Music" },
  { id: "17", label: "Sports" },
  { id: "20", label: "Gaming" },
  { id: "22", label: "People & Blogs" },
  { id: "23", label: "Comedy" },
  { id: "24", label: "Entertainment" },
  { id: "25", label: "News & Politics" },
  { id: "26", label: "Howto & Style" },
  { id: "27", label: "Education" },
  { id: "28", label: "Science & Technology" },
];

const LANGUAGES = [
  { code: "hi", label: "Hindi" },
  { code: "en", label: "English" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "bn", label: "Bengali" },
  { code: "mr", label: "Marathi" },
  { code: "gu", label: "Gujarati" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "pa", label: "Punjabi" },
  { code: "ur", label: "Urdu" },
];

export function PublishingPage() {
  const toast = useToast();
  const { channels, settings, dataVersion, refreshSettings } = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<"youtube" | "instagram" | "activity">(() => {
    const value = searchParams.get("tab");
    return value === "instagram" || value === "activity" ? value : "youtube";
  });
  const [clientOpen, setClientOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(Boolean(searchParams.get("video")));
  const [uploadVideoId, setUploadVideoId] = useState<number | null>(
    searchParams.get("video") ? Number(searchParams.get("video")) : null,
  );
  const [instagramOpen, setInstagramOpen] = useState(false);
  const [instagramVideoId, setInstagramVideoId] = useState<number | null>(null);
  const [oauthWaiting, setOauthWaiting] = useState(false);
  const [busyAccount, setBusyAccount] = useState<number | null>(null);
  const [rescheduling, setRescheduling] = useState<Publication | null>(null);
  const [marking, setMarking] = useState<Publication | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const status = useFetch<YouTubeStatus>(() => api("/publishing/youtube/status"), [dataVersion, refreshKey]);
  const videos = useFetch<{ videos: Video[]; total: number }>(() => api("/videos?limit=300"), [dataVersion, refreshKey]);
  const publications = useFetch<{ publications: Publication[] }>(() => api("/publications?limit=200"), [dataVersion, refreshKey]);
  const uploads = useFetch<{ uploads: UploadJob[] }>(() => api("/publishing/uploads?limit=60"), [dataVersion, refreshKey]);

  const videoList = videos.data?.videos || [];
  const accounts = status.data?.accounts || [];
  const youtubeConfigured = Boolean(status.data?.client.configured);

  const refreshAll = async () => {
    setRefreshKey((value) => value + 1);
    await status.reload(true);
  };

  const readyVideos = useMemo(
    () =>
      videoList.filter(
        (video) =>
          video.has_video &&
          !video.youtube_video_id &&
          !["PUBLISHED", "SCHEDULED", "ARCHIVED"].includes(video.production_status),
      ),
    [videoList],
  );

  const youtubePublications = (publications.data?.publications || []).filter((item) => item.platform === "youtube");
  const instagramPublications = (publications.data?.publications || []).filter((item) => item.platform === "instagram");

  useEffect(() => {
    const videoParam = searchParams.get("video");
    if (videoParam) {
      setUploadVideoId(Number(videoParam));
      setUploadOpen(true);
      setTab("youtube");
    }
  }, [searchParams]);

  const startOauth = async () => {
    try {
      const result = await api<{ auth_url: string; redirect_uri: string; expires_in: number }>("/publishing/youtube/oauth/start", {
        method: "POST",
      });
      const opened = await bridge.openExternal(result.auth_url);
      if (!opened.ok) {
        toast.error("Could not open the browser", opened.error || result.auth_url);
        return;
      }
      setOauthWaiting(true);
      toast.info("Google sign-in opened", "Finish the consent screen in your browser, then press refresh here.");
    } catch (error) {
      toast.error("Could not start YouTube sign-in", errorMessage(error));
    }
  };

  const finishOauth = async () => {
    setOauthWaiting(false);
    await refreshAll();
    toast.info("Checking YouTube accounts", "If the consent screen is complete, the new channel will appear here.");
  };

  const openUpload = (videoId: number | null) => {
    setUploadVideoId(videoId);
    setUploadOpen(true);
    const next = new URLSearchParams(searchParams);
    if (videoId) next.set("video", String(videoId));
    else next.delete("video");
    setSearchParams(next);
  };

  const closeUpload = () => {
    setUploadOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete("video");
    setSearchParams(next);
  };

  return (
    <div className="animate-float-in">
      <PageHeader
        eyebrow="Out into the world"
        title="Publishing Manager"
        description="Official YouTube OAuth uploads, real scheduling confirmation, and an honest manual Instagram workflow. Nothing is published without your explicit confirmation."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void refreshAll()}>
              Refresh
            </Button>
            <Button icon={<Upload size={14} />} disabled={!youtubeConfigured || accounts.length === 0} onClick={() => openUpload(null)}>
              New YouTube upload
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "youtube", label: "YouTube" },
            { id: "instagram", label: "Instagram", count: instagramPublications.length },
            { id: "activity", label: "Activity", count: uploads.data?.uploads.length },
          ]}
        />
        <div className="flex items-center gap-2">
          {youtubeConfigured ? (
            <Badge tone="sage" dot>
              OAuth client configured
            </Badge>
          ) : (
            <Badge tone="peach" dot>
              YouTube not configured
            </Badge>
          )}
          <Badge tone="neutral">{accounts.length} channel{accounts.length === 1 ? "" : "s"}</Badge>
        </div>
      </div>

      {tab === "youtube" ? (
        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <YouTubeConnectionCard
              status={status.data}
              loading={status.loading}
              oauthWaiting={oauthWaiting}
              busyAccount={busyAccount}
              onConfigure={() => setClientOpen(true)}
              onStartOauth={() => void startOauth()}
              onFinishOauth={() => void finishOauth()}
              onTestAccount={async (account) => {
                setBusyAccount(account.id);
                try {
                  const result = await api<{ account_name: string }>(`/publishing/youtube/accounts/${account.id}/test`, { method: "POST" });
                  toast.success("YouTube account responded", result.account_name);
                  await refreshAll();
                } catch (error) {
                  toast.error("Could not reach this account", errorMessage(error));
                } finally {
                  setBusyAccount(null);
                }
              }}
              onDisconnect={async (account) => {
                if (!window.confirm(`Disconnect “${account.account_name}”? Stored tokens are removed from Windows Credential Manager.`)) return;
                setBusyAccount(account.id);
                try {
                  await api(`/publishing/youtube/accounts/${account.id}?confirm=true`, { method: "DELETE" });
                  toast.success("YouTube account disconnected");
                  await refreshAll();
                } catch (error) {
                  toast.error("Could not disconnect", errorMessage(error));
                } finally {
                  setBusyAccount(null);
                }
              }}
            />

            <Card className="p-6">
              <CardHeader
                title="Films ready for YouTube"
                subtitle={`${readyVideos.length} validated film${readyVideos.length === 1 ? "" : "s"} without a YouTube upload`}
                icon={<FileVideo size={16} />}
                action={
                  <Button size="sm" variant="ghost" icon={<Upload size={12} />} onClick={() => openUpload(null)} disabled={!accounts.length}>
                    Upload
                  </Button>
                }
              />
              <div className="mt-4 space-y-2">
                {videos.loading ? (
                  [1, 2].map((index) => <div key={index} className="skeleton h-20 rounded-2xl" />)
                ) : readyVideos.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<FileVideo size={20} />}
                    title="Nothing waiting to upload"
                    message="Import a finished video or finish an animation handoff. Films with a file on disk appear here."
                  />
                ) : (
                  readyVideos.slice(0, 12).map((video) => (
                    <div key={video.id} className="flex items-center gap-3 rounded-2xl border border-ink/[0.06] bg-white/45 p-2.5">
                      <VideoThumbnail
                        videoId={video.id}
                        title={video.title}
                        hasThumbnail={video.has_thumbnail}
                        duration={video.duration}
                        className="h-12 w-20 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11.5px] font-bold">{video.title}</p>
                        <p className="mt-0.5 truncate text-[9.5px] text-muted">
                          {video.channel_name} · {formatDuration(video.duration)} · {statusLabel(video.production_status)}
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" icon={<Upload size={11} />} onClick={() => openUpload(video.id)}>
                        Upload
                      </Button>
                    </div>
                  ))
                )}
              </div>
              {!youtubeConfigured ? (
                <p className="mt-3 rounded-xl bg-peach/35 px-3 py-2 text-[10px] leading-relaxed text-[#8a5f48]">
                  Configure a Google OAuth client and connect a YouTube channel before uploading.
                </p>
              ) : null}
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-6">
              <CardHeader
                title="YouTube publication queue"
                subtitle="Scheduled and published items, as recorded locally"
                icon={<CalendarClock size={16} />}
              />
              <div className="mt-4 space-y-2">
                {publications.loading ? (
                  [1, 2].map((index) => <div key={index} className="skeleton h-24 rounded-2xl" />)
                ) : youtubePublications.length === 0 ? (
                  <EmptyState compact icon={<Youtube size={20} />} title="No YouTube publications yet" message="Uploads and confirmed schedules will be listed here." />
                ) : (
                  youtubePublications.slice(0, 20).map((publication) => (
                    <PublicationRow
                      key={publication.id}
                      publication={publication}
                      video={videoList.find((item) => item.id === publication.video_id)}
                      onReschedule={() => setRescheduling(publication)}
                      onCancel={() => void cancelPublication(publication, refreshAll, toast)}
                    />
                  ))
                )}
              </div>
            </Card>

            <Card className="p-6">
              <CardHeader
                title="Recent upload activity"
                subtitle="Real progress from the local upload queue"
                icon={<ActivityIcon />}
                action={
                  <Button size="sm" variant="ghost" onClick={() => setTab("activity")}>
                    See all
                  </Button>
                }
              />
              <div className="mt-3 space-y-2">
                {(uploads.data?.uploads || []).slice(0, 4).map((upload) => (
                  <UploadRow
                    key={upload.id}
                    upload={upload}
                    video={videoList.find((item) => item.id === upload.video_id)}
                    onRetry={async () => {
                      try {
                        await api(`/publishing/uploads/${upload.id}/retry`, { method: "POST" });
                        toast.info("Upload queued again");
                        await refreshAll();
                      } catch (error) {
                        toast.error("Could not retry", errorMessage(error));
                      }
                    }}
                  />
                ))}
                {!uploads.loading && (uploads.data?.uploads || []).length === 0 ? (
                  <p className="rounded-xl bg-white/45 px-3 py-3 text-[10.5px] text-muted">No uploads attempted yet.</p>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "instagram" ? (
        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="p-6">
            <CardHeader
              title="Prepared Instagram posts"
              subtitle="Captions and files ready for you to post by hand"
              icon={<Image size={16} />}
              action={
                <Button size="sm" icon={<Plus size={12} />} onClick={() => { setInstagramVideoId(null); setInstagramOpen(true); }}>
                  Prepare post
                </Button>
              }
            />
            <div className="mt-4 space-y-2">
              {instagramPublications.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Image size={20} />}
                  title="No Instagram posts prepared"
                  message="Choose a video, write the caption, and Katha Studio prepares a manual workflow with the file path and caption ready to copy."
                  action={
                    <Button size="sm" variant="secondary" onClick={() => { setInstagramVideoId(null); setInstagramOpen(true); }}>
                      Prepare the first post
                    </Button>
                  }
                />
              ) : (
                instagramPublications.map((publication) => {
                  const video = videoList.find((item) => item.id === publication.video_id);
                  return (
                    <div key={publication.id} className="rounded-2xl border border-ink/[0.06] bg-white/45 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-bold">{video?.title || `Video #${publication.video_id}`}</p>
                          <p className="mt-0.5 text-[10px] text-muted">
                            {publication.channel_name || video?.channel_name || "Unassigned"} ·{" "}
                            {publication.scheduled_at ? `Planned for ${formatDateTime(publication.scheduled_at)}` : "No planned time"}
                          </p>
                        </div>
                        <Badge tone={publication.status === "published" ? "sage" : publication.status === "manual_ready" ? "peach" : "neutral"}>
                          {statusLabel(publication.status)}
                        </Badge>
                      </div>
                      {publication.caption ? (
                        <p className="mt-2 line-clamp-3 whitespace-pre-line rounded-xl bg-white/60 px-3 py-2 text-[10.5px] leading-relaxed text-ink/70">
                          {publication.caption}
                        </p>
                      ) : null}
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {publication.caption ? <CopyButton value={publication.caption} label="Copy caption" /> : null}
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<FolderOpen size={11} />}
                          disabled={!video?.final_video_path}
                          onClick={async () => {
                            if (!video?.final_video_path) return;
                            const result = await bridge.showItem(video.final_video_path);
                            if (!result.ok) toast.error("Could not reveal the file", result.error);
                          }}
                        >
                          Reveal file
                        </Button>
                        {publication.status !== "published" ? (
                          <>
                            <Button size="sm" variant="secondary" icon={<CheckCircle2 size={11} />} onClick={() => setMarking(publication)}>
                              Mark posted
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<X size={11} />}
                              onClick={() => void cancelPublication(publication, refreshAll, toast)}
                            >
                              Remove
                            </Button>
                          </>
                        ) : publication.remote_url ? (
                          <Button size="sm" variant="ghost" icon={<ExternalLink size={11} />} onClick={() => bridge.openExternal(publication.remote_url)}>
                            Open post
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-6">
              <p className="eyebrow">Why this is manual</p>
              <h3 className="display mt-1 text-[23px]">Instagram has no official publishing API in Katha Studio</h3>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                Katha Studio prepares everything you need — caption, hashtags, file location and a planned time — but you
                post from the Instagram app or website yourself. No fake automation, no stored Instagram password.
              </p>
              <ol className="mt-4 space-y-2.5">
                {[
                  "Choose a finished video and write the caption.",
                  "Katha saves a manual_ready publication with the file path.",
                  "Copy the caption and open the file location.",
                  "Post it yourself, then mark it posted with the real link.",
                ].map((step, index) => (
                  <li key={step} className="flex gap-2.5 text-[11px] leading-relaxed text-muted">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-[8.5px] font-bold text-ink/50">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </Card>
            <Card className="p-6">
              <p className="eyebrow">Format reminder</p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                Instagram Reels are vertical. If your film is 16:9, choose or render a 9:16 version first. Katha Studio
                does not reframe a video automatically.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="neutral">9:16 for Reels</Badge>
                <Badge tone="neutral">1:1 for feed</Badge>
                <Badge tone="neutral">4:5 for portrait feed</Badge>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "activity" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Card className="p-6">
            <CardHeader title="Upload jobs" subtitle="Every attempted YouTube upload and its real state" icon={<Upload size={16} />} />
            <div className="mt-4 space-y-2">
              {uploads.loading ? (
                [1, 2, 3].map((index) => <div key={index} className="skeleton h-20 rounded-2xl" />)
              ) : (uploads.data?.uploads || []).length === 0 ? (
                <EmptyState compact icon={<Upload size={20} />} title="No uploads yet" message="Start an upload from the YouTube tab." />
              ) : (
                (uploads.data?.uploads || []).map((upload) => (
                  <UploadRow
                    key={upload.id}
                    upload={upload}
                    video={videoList.find((item) => item.id === upload.video_id)}
                    onRetry={async () => {
                      try {
                        await api(`/publishing/uploads/${upload.id}/retry`, { method: "POST" });
                        toast.info("Upload queued again");
                        await refreshAll();
                      } catch (error) {
                        toast.error("Could not retry", errorMessage(error));
                      }
                    }}
                  />
                ))
              )}
            </div>
          </Card>

          <Card className="p-6">
            <CardHeader title="All publications" subtitle="YouTube schedules and manual Instagram items" icon={<Send size={16} />} />
            <div className="mt-4 space-y-2">
              {(publications.data?.publications || []).length === 0 ? (
                <EmptyState compact icon={<Send size={20} />} title="Nothing published or scheduled" message="Publications appear after a real YouTube upload, a confirmed schedule, or a prepared Instagram post." />
              ) : (
                (publications.data?.publications || []).map((publication) => (
                  <PublicationRow
                    key={publication.id}
                    publication={publication}
                    video={videoList.find((item) => item.id === publication.video_id)}
                    onReschedule={() => setRescheduling(publication)}
                    onCancel={() => void cancelPublication(publication, refreshAll, toast)}
                    onMarkPosted={() => setMarking(publication)}
                  />
                ))
              )}
            </div>
          </Card>
        </div>
      ) : null}

      <YouTubeClientModal
        open={clientOpen}
        onClose={() => setClientOpen(false)}
        status={status.data}
        onSaved={async () => {
          await refreshAll();
          void refreshSettings();
          setClientOpen(false);
        }}
      />

      <UploadModal
        open={uploadOpen}
        onClose={closeUpload}
        initialVideoId={uploadVideoId}
        videos={videoList}
        accounts={accounts}
        defaultCategory={String(settings?.youtube_category || "24")}
        onStarted={async () => {
          closeUpload();
          await refreshAll();
        }}
      />

      <InstagramModal
        open={instagramOpen}
        onClose={() => setInstagramOpen(false)}
        videos={videoList}
        initialVideoId={instagramVideoId}
        onCreated={async () => {
          setInstagramOpen(false);
          await refreshAll();
        }}
      />

      <RescheduleModal
        publication={rescheduling}
        video={videoList.find((item) => item.id === rescheduling?.video_id)}
        onClose={() => setRescheduling(null)}
        onSaved={async () => {
          setRescheduling(null);
          await refreshAll();
        }}
      />

      <MarkPostedModal
        publication={marking}
        onClose={() => setMarking(null)}
        onSaved={async () => {
          setMarking(null);
          await refreshAll();
        }}
      />
    </div>
  );
}

function ActivityIcon() {
  return <RefreshCw size={16} />;
}

async function cancelPublication(
  publication: Publication,
  refresh: () => Promise<void>,
  toast: ReturnType<typeof useToast>,
) {
  try {
    await api(`/publications/${publication.id}`, { method: "PATCH", json: { status: "cancelled" } });
    toast.success("Publication cancelled", publication.platform === "youtube" ? "This only changes the local record unless YouTube has confirmed a schedule." : "The prepared item was removed.");
    await refresh();
  } catch (error) {
    toast.error("Could not cancel", errorMessage(error));
  }
}

function YouTubeConnectionCard({
  status,
  loading,
  oauthWaiting,
  busyAccount,
  onConfigure,
  onStartOauth,
  onFinishOauth,
  onTestAccount,
  onDisconnect,
}: {
  status: YouTubeStatus | null;
  loading: boolean;
  oauthWaiting: boolean;
  busyAccount: number | null;
  onConfigure: () => void;
  onStartOauth: () => void;
  onFinishOauth: () => void;
  onTestAccount: (account: SocialAccount) => Promise<void>;
  onDisconnect: (account: SocialAccount) => Promise<void>;
}) {
  const configured = Boolean(status?.client.configured);
  return (
    <Card className="p-6">
      <CardHeader
        title="YouTube connection"
        subtitle="Official Google OAuth. Tokens live in Windows Credential Manager."
        icon={<Youtube size={16} />}
        action={
          <Button size="sm" variant="secondary" icon={<Settings2 size={12} />} onClick={onConfigure}>
            {configured ? "Edit client" : "Set up"}
          </Button>
        }
      />

      {loading ? (
        <div className="mt-4 space-y-2">
          <div className="skeleton h-16 rounded-xl" />
          <div className="skeleton h-16 rounded-xl" />
        </div>
      ) : !configured ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-gradient-to-br from-peach/40 via-parchment/60 to-powder/40 p-4">
            <p className="text-[12px] font-bold">A Google Cloud OAuth client is required</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
              Create a project, enable YouTube Data API v3, and make an OAuth client of type <strong>Desktop app</strong>.
              Paste the client ID and secret here. Katha Studio never asks for your Google password.
            </p>
            <Button className="mt-3" size="sm" icon={<KeyRound size={12} />} onClick={onConfigure}>
              Add client credentials
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-white/50 px-3 py-2 text-[10px] leading-relaxed text-muted">
            <ShieldCheck size={13} className="mt-0.5 shrink-0 text-moss" />
            The OAuth callback runs on your local studio service. Google returns you here after consent.
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/55 px-3 py-2.5">
            <Badge tone="sage" dot>
              Client configured
            </Badge>
            <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-muted">
              {status?.client.client_id ? maskClientId(status.client.client_id) : "Client ID hidden"}
            </span>
            <Badge tone={status?.client.secret_saved ? "sage" : "rose"}>
              {status?.client.secret_saved ? "Secret saved" : "Secret missing"}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Link2 size={12} />} onClick={onStartOauth}>
              Connect a YouTube channel
            </Button>
            {oauthWaiting ? (
              <Button size="sm" variant="secondary" icon={<RefreshCw size={12} />} onClick={onFinishOauth}>
                I finished in the browser
              </Button>
            ) : null}
          </div>

          {oauthWaiting ? (
            <div className="flex items-start gap-2 rounded-xl bg-powder/40 px-3 py-2 text-[10px] leading-relaxed text-[#5b7088]">
              <Info size={12} className="mt-0.5 shrink-0" />
              Complete Google's consent screen in the browser. When the local callback page says “Connected”, return
              here and refresh. If the browser was already open, use the same flow again.
            </div>
          ) : null}

          <div className="space-y-2">
            {(status?.accounts || []).length === 0 ? (
              <p className="rounded-xl border border-dashed border-ink/10 bg-white/35 px-3 py-4 text-center text-[10.5px] text-muted">
                No YouTube channel connected yet.
              </p>
            ) : (
              (status?.accounts || []).map((account) => (
                <div key={account.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink/[0.06] bg-white/50 p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose/50 text-[#9c5c63]">
                    <UserRound size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-bold">{account.account_name}</p>
                    <p className="mt-0.5 truncate text-[9.5px] text-muted">
                      {account.handle || account.account_id} · {account.status} ·{" "}
                      {account.last_synced_at ? `synced ${formatDateTime(account.last_synced_at)}` : "not synced"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" icon={<RefreshCw size={11} />} loading={busyAccount === account.id} onClick={() => void onTestAccount(account)}>
                      Test
                    </Button>
                    <IconButton label="Disconnect account" onClick={() => void onDisconnect(account)}>
                      <Trash2 size={12} />
                    </IconButton>
                  </div>
                </div>
              ))
            )}
          </div>

          <p className="text-[9.5px] leading-relaxed text-muted/70">{status?.quota_note}</p>
        </div>
      )}
    </Card>
  );
}

function maskClientId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function PublicationRow({
  publication,
  video,
  onReschedule,
  onCancel,
  onMarkPosted,
}: {
  publication: Publication;
  video?: Video;
  onReschedule: () => void;
  onCancel: () => void;
  onMarkPosted?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-ink/[0.06] bg-white/45 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Badge tone={publication.platform === "youtube" ? "rose" : "peach"} className="px-1.5 py-0.5 text-[8.5px]">
              {publication.platform === "youtube" ? "YouTube" : "Instagram"}
            </Badge>
            <p className="truncate text-[11.5px] font-bold">{video?.title || `Video #${publication.video_id}`}</p>
          </div>
          <p className="mt-1 text-[9.5px] text-muted">
            {publication.scheduled_at
              ? `Scheduled ${formatDateTime(publication.scheduled_at)}`
              : publication.published_at
                ? `Published ${formatDateTime(publication.published_at)}`
                : publication.status === "manual_ready"
                  ? "Prepared for manual posting"
                  : "No date"}
          </p>
        </div>
        <StatusBadge status={publication.status} />
      </div>
      {publication.notes ? <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-muted">{publication.notes}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {publication.remote_url ? (
          <Button size="sm" variant="ghost" icon={<ExternalLink size={11} />} onClick={() => bridge.openExternal(publication.remote_url)}>
            Open
          </Button>
        ) : null}
        {publication.caption ? <CopyButton value={publication.caption} label="Copy caption" /> : null}
        {publication.status === "scheduled" ? (
          <Button size="sm" variant="ghost" icon={<CalendarClock size={11} />} onClick={onReschedule}>
            Reschedule
          </Button>
        ) : null}
        {["scheduled", "manual_ready", "draft"].includes(publication.status) ? (
          <Button size="sm" variant="ghost" icon={<X size={11} />} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        {publication.platform === "instagram" && publication.status === "manual_ready" && onMarkPosted ? (
          <Button size="sm" variant="secondary" icon={<CheckCircle2 size={11} />} onClick={onMarkPosted}>
            Mark posted
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function UploadRow({ upload, video, onRetry }: { upload: UploadJob; video?: Video; onRetry: () => Promise<void> }) {
  const active = ["queued", "uploading"].includes(upload.status);
  return (
    <div className="rounded-2xl border border-ink/[0.06] bg-white/45 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold">{video?.title || `Video #${upload.video_id}`}</p>
          <p className="mt-0.5 text-[9.5px] text-muted">
            {formatDateTime(upload.created_at)}
            {upload.attempts > 0 ? ` · attempt ${upload.attempts + 1}` : ""}
          </p>
        </div>
        <StatusBadge status={upload.status} />
      </div>
      {active ? (
        <div className="mt-2">
          <Progress value={upload.progress} />
          <p className="mt-1 text-[9px] font-semibold text-muted">{Math.round(upload.progress)}% · keep the studio open</p>
        </div>
      ) : null}
      {upload.error ? (
        <p className="mt-2 rounded-lg bg-rose/30 px-2.5 py-1.5 text-[9.5px] leading-relaxed text-[#8f555b]">{upload.error}</p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {upload.remote_url ? (
          <Button size="sm" variant="ghost" icon={<ExternalLink size={11} />} onClick={() => bridge.openExternal(upload.remote_url)}>
            Open on YouTube
          </Button>
        ) : null}
        {["failed", "cancelled"].includes(upload.status) ? (
          <Button size="sm" variant="ghost" icon={<RefreshCw size={11} />} onClick={() => void onRetry()}>
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function YouTubeClientModal({
  open,
  onClose,
  status,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  status: YouTubeStatus | null;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setClientId(status?.client.client_id || "");
      setClientSecret("");
    }
  }, [open, status?.client.client_id]);

  const save = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error("Enter both values", "Google requires the client ID and the client secret.");
      return;
    }
    setSaving(true);
    try {
      await api("/publishing/youtube/client", { method: "POST", json: { client_id: clientId.trim(), client_secret: clientSecret.trim() } });
      toast.success("YouTube OAuth client saved", "The secret is stored in Windows Credential Manager.");
      await onSaved();
    } catch (error) {
      toast.error("Could not save the client", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="YouTube OAuth client"
      description="From Google Cloud Console → APIs & Services → Credentials. Use an OAuth client of type Desktop app."
      size="lg"
      footer={
        <>
          {status?.client.configured ? (
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={12} />}
              onClick={async () => {
                if (!window.confirm("Remove the Google OAuth client? Existing channel connections remain listed but cannot refresh.")) return;
                try {
                  await api("/publishing/youtube/client?confirm=true", { method: "DELETE" });
                  toast.success("OAuth client removed");
                  await onSaved();
                } catch (error) {
                  toast.error("Could not remove the client", errorMessage(error));
                }
              }}
            >
              Remove client
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            Save client
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Client ID">
          <Input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="…apps.googleusercontent.com" autoFocus />
        </Field>
        <Field
          label="Client secret"
          hint={
            status?.client.secret_saved
              ? "A secret is already saved. Enter both values only if you are replacing the client."
              : "Stored only in Windows Credential Manager."
          }
        >
          <Input
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            placeholder={status?.client.secret_saved ? "•••••••• (saved)" : "Paste the client secret"}
          />
        </Field>
        <div className="rounded-xl bg-powder/40 px-3 py-2.5 text-[10.5px] leading-relaxed text-[#5b7088]">
          <p className="font-bold">Google Cloud checklist</p>
          <ol className="mt-1 list-inside list-decimal space-y-0.5">
            <li>Create or choose a Google Cloud project.</li>
            <li>Enable “YouTube Data API v3”.</li>
            <li>Configure the OAuth consent screen (External is fine for testing).</li>
            <li>Create credentials → OAuth client ID → Desktop app.</li>
            <li>Paste the client ID and secret here, then connect your channel.</li>
          </ol>
          <p className="mt-2 text-[9.5px] text-[#5b7088]/80">
            Uploads and schedule changes consume your Google API quota. Katha Studio cannot increase that quota.
          </p>
        </div>
        <div className="flex items-start gap-2 rounded-xl bg-peach/30 px-3 py-2 text-[10px] leading-relaxed text-[#8a5f48]">
          <Lock size={12} className="mt-0.5 shrink-0" />
          Katha Studio never asks for your Google password and never stores it.
        </div>
      </div>
    </Modal>
  );
}

function UploadModal({
  open,
  onClose,
  initialVideoId,
  videos,
  accounts,
  defaultCategory,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  initialVideoId: number | null;
  videos: Video[];
  accounts: SocialAccount[];
  defaultCategory: string;
  onStarted: () => Promise<void>;
}) {
  const toast = useToast();
  const [videoId, setVideoId] = useState<number | null>(initialVideoId);
  const [accountId, setAccountId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategory);
  const [privacy, setPrivacy] = useState("private");
  const [scheduled, setScheduled] = useState(false);
  const [publishAt, setPublishAt] = useState("");
  const [madeForKids, setMadeForKids] = useState(false);
  const [language, setLanguage] = useState("hi");
  const [thumbnailPath, setThumbnailPath] = useState("");
  const [subtitlePath, setSubtitlePath] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [starting, setStarting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepJob, setPrepJob] = useState<Job | null>(null);
  const [prepNote, setPrepNote] = useState("");

  const video = videos.find((item) => item.id === videoId);

  useEffect(() => {
    if (!open) return;
    const initial = videos.find((item) => item.id === initialVideoId) || null;
    setVideoId(initial?.id ?? null);
    setAccountId(accounts[0] ? String(accounts[0].id) : "");
    setTitle(initial?.title || "");
    setDescription(initial?.description || "");
    setTags((initial?.tags || []).join(", "));
    setCategoryId(defaultCategory);
    setPrivacy("private");
    setScheduled(false);
    setPublishAt("");
    setMadeForKids(false);
    setLanguage("hi");
    setThumbnailPath(initial?.thumbnail_path || "");
    setSubtitlePath(initial?.subtitle_path || "");
    setConfirm(false);
    setPrepJob(null);
    setPrepNote("");
  }, [open, initialVideoId]);

  useEffect(() => {
    if (!open) return;
    if (!video) return;
    setTitle(video.title);
    setDescription(video.description);
    setTags(video.tags.join(", "));
    setThumbnailPath(video.thumbnail_path || "");
    setSubtitlePath(video.subtitle_path || "");
  }, [videoId]);

  useEffect(() => {
    if (!prepJob || !["queued", "running"].includes(prepJob.status)) return;
    const id = window.setInterval(async () => {
      try {
        const fresh = await api<Job>(`/system/jobs/${prepJob.id}`);
        setPrepJob(fresh);
        if (fresh.status === "completed") {
          window.clearInterval(id);
          setPreparing(false);
          const result = fresh.result || {};
          if (result.title) setTitle(String(result.title));
          if (result.description) setDescription(String(result.description));
          if (Array.isArray(result.tags)) setTags(result.tags.join(", "));
          setPrepNote(String(result.note || "Review these suggestions before uploading."));
          toast.success("Metadata suggestions ready", "Review every line before confirming the upload.");
        } else if (fresh.status === "failed") {
          window.clearInterval(id);
          setPreparing(false);
          toast.error("Could not prepare metadata", fresh.error);
        }
      } catch {
        // keep polling
      }
    }, 1800);
    return () => window.clearInterval(id);
  }, [prepJob?.id, prepJob?.status]);

  const prepareMetadata = async () => {
    if (!videoId) {
      toast.error("Choose a video first");
      return;
    }
    setPreparing(true);
    setPrepNote("");
    try {
      const result = await api<{ job: Job }>("/publishing/metadata/prepare", {
        method: "POST",
        json: { video_id: videoId, platform: "youtube" },
      });
      setPrepJob(result.job);
    } catch (error) {
      setPreparing(false);
      toast.error("Could not start metadata preparation", errorMessage(error));
    }
  };

  const submit = async () => {
    if (!videoId || !accountId) {
      toast.error("Choose a video and a YouTube channel");
      return;
    }
    if (!title.trim()) {
      toast.error("A YouTube title is required");
      return;
    }
    if (scheduled && !publishAt) {
      toast.error("Choose the YouTube publication time");
      return;
    }
    if (!confirm) {
      toast.error("Confirm the upload", "Katha Studio requires explicit confirmation before sending anything to YouTube.");
      return;
    }
    setStarting(true);
    try {
      const result = await api<{ job: Job; upload: UploadJob }>("/publishing/uploads", {
        method: "POST",
        json: {
          video_id: videoId,
          account_id: Number(accountId),
          title: title.trim(),
          description,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          category_id: categoryId,
          privacy: scheduled ? "private" : privacy,
          publish_at: scheduled ? fromLocalInput(publishAt) : null,
          made_for_kids: madeForKids,
          thumbnail_path: thumbnailPath || null,
          subtitle_path: subtitlePath || null,
          language,
          confirm: true,
        },
      });
      toast.success(scheduled ? "YouTube upload queued" : "YouTube upload queued", scheduled ? "The video will stay private until YouTube confirms the schedule." : "Progress appears in the activity panel.");
      void result;
      await onStarted();
    } catch (error) {
      toast.error("Could not start the upload", errorMessage(error));
    } finally {
      setStarting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload to YouTube"
      description="A real upload through the official YouTube Data API. Nothing is sent until you confirm."
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={starting} disabled={!confirm} icon={<Upload size={14} />} onClick={() => void submit()}>
            {scheduled ? "Upload & schedule" : "Upload to YouTube"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <Field label="Video">
            <Select
              value={videoId || ""}
              onChange={(event) => setVideoId(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">Choose a validated film…</option>
              {videos
                .filter((item) => item.has_video && !item.youtube_video_id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} · {item.channel_name}
                  </option>
                ))}
            </Select>
          </Field>

          {video ? (
            <div className="flex items-center gap-3 rounded-xl bg-white/60 p-2.5">
              <VideoThumbnail
                videoId={video.id}
                title={video.title}
                hasThumbnail={video.has_thumbnail}
                duration={video.duration}
                className="h-14 w-24 shrink-0"
              />
              <div className="min-w-0 flex-1 text-[10px] leading-relaxed text-muted">
                <p className="truncate text-[11px] font-bold text-ink">{video.title}</p>
                <p className="mt-0.5">
                  {formatDuration(video.duration)} · {video.width}×{video.height} · {video.channel_name}
                </p>
                <p className="mt-0.5 truncate font-mono text-[9px] text-muted/60">{video.final_video_path}</p>
              </div>
            </div>
          ) : null}

          <Field label="YouTube channel">
            <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts.length === 0 ? <option value="">No connected channel</option> : null}
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">Metadata</p>
            <Button size="sm" variant="secondary" loading={preparing} icon={<Sparkles size={12} />} onClick={() => void prepareMetadata()}>
              Suggest metadata
            </Button>
          </div>

          {prepJob && ["queued", "running"].includes(prepJob.status) ? (
            <div className="rounded-xl bg-white/60 p-2.5">
              <p className="text-[10px] font-bold">{prepJob.message || "Preparing suggestions…"}</p>
              <Progress value={prepJob.progress} className="mt-1.5" />
            </div>
          ) : null}
          {prepNote ? (
            <p className="rounded-xl bg-lavender/35 px-3 py-2 text-[10px] leading-relaxed text-[#71618c]">{prepNote}</p>
          ) : null}

          <Field label="Title" hint={`${title.length}/100 characters`}>
            <Input value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Description" hint={`${description.length}/5000 characters`}>
            <Textarea value={description} maxLength={5000} onChange={(event) => setDescription(event.target.value)} className="min-h-[110px]" />
          </Field>
          <Field label="Tags" hint="Comma separated, used for YouTube tags.">
            <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="folk tale, hindi, animation" />
          </Field>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="YouTube category">
              <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                {YOUTUBE_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Spoken language">
              <Select value={language} onChange={(event) => setLanguage(event.target.value)}>
                {LANGUAGES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Visibility" hint={scheduled ? "Scheduled uploads must stay private until YouTube publishes them." : "Public uploads go live immediately."}>
            <Select value={scheduled ? "private" : privacy} onChange={(event) => setPrivacy(event.target.value)} disabled={scheduled}>
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </Select>
          </Field>

          <div className="flex items-start justify-between gap-4 rounded-xl bg-white/60 p-3">
            <div>
              <p className="text-[11.5px] font-bold">Schedule on YouTube</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
                The video uploads privately and YouTube publishes it at the chosen time. Katha Studio reports the
                schedule only after YouTube confirms it.
              </p>
            </div>
            <Toggle checked={scheduled} onChange={setScheduled} label="Schedule upload" />
          </div>
          {scheduled ? (
            <Field label="Publication time (your local time)">
              <Input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} />
            </Field>
          ) : null}

          <div className="flex items-start justify-between gap-4 rounded-xl bg-white/60 p-3">
            <div>
              <p className="text-[11.5px] font-bold">Made for kids</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
                Required by YouTube. Choose truthfully; this affects features and comments.
              </p>
            </div>
            <Toggle checked={madeForKids} onChange={setMadeForKids} label="Made for kids" />
          </div>

          <Field label="Thumbnail" hint="JPG or PNG. YouTube limits thumbnails to 2 MB.">
            <div className="flex gap-2">
              <Input value={thumbnailPath} onChange={(event) => setThumbnailPath(event.target.value)} placeholder="Uses the generated thumbnail" />
              <Button
                variant="secondary"
                icon={<Image size={13} />}
                onClick={async () => {
                  const chosen = await bridge.pickFile("Choose a YouTube thumbnail", ["jpg", "jpeg", "png"]);
                  if (chosen) setThumbnailPath(chosen);
                }}
              >
                Pick
              </Button>
            </div>
          </Field>

          <Field label="Captions (SRT)" hint="Uploaded as an official YouTube caption track when present.">
            <div className="flex gap-2">
              <Input value={subtitlePath} onChange={(event) => setSubtitlePath(event.target.value)} placeholder="Uses the project's subtitles" />
              <Button
                variant="secondary"
                icon={<FileVideo size={13} />}
                onClick={async () => {
                  const chosen = await bridge.pickFile("Choose a subtitle file", ["srt", "vtt"]);
                  if (chosen) setSubtitlePath(chosen);
                }}
              >
                Pick
              </Button>
            </div>
          </Field>

          <div className="rounded-xl bg-peach/35 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold text-[#8a5f48]">I confirm this upload</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[#8a5f48]/90">
                  This sends the real video file, metadata and any thumbnail or captions to YouTube using your connected
                  account and quota.
                </p>
              </div>
              <Toggle checked={confirm} onChange={setConfirm} label="Confirm upload" />
            </div>
          </div>

          <p className="text-[9.5px] leading-relaxed text-muted/70">
            Duplicate prevention: a video that already has a YouTube upload is rejected before any request is sent.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function InstagramModal({
  open,
  onClose,
  videos,
  initialVideoId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  videos: Video[];
  initialVideoId: number | null;
  onCreated: () => Promise<void>;
}) {
  const toast = useToast();
  const [videoId, setVideoId] = useState<number | null>(initialVideoId);
  const [caption, setCaption] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  const video = videos.find((item) => item.id === videoId);

  useEffect(() => {
    if (!open) return;
    const initial = videos.find((item) => item.id === initialVideoId) || null;
    setVideoId(initial?.id ?? null);
    setCaption(initial ? [initial.description, ...(initial.hashtags || []).map((tag) => `#${tag}`)].filter(Boolean).join("\n\n") : "");
    setNotes("");
    setScheduledAt("");
  }, [open, initialVideoId]);

  useEffect(() => {
    if (!video) return;
    setCaption([video.description, ...(video.hashtags || []).map((tag) => `#${tag}`)].filter(Boolean).join("\n\n"));
  }, [videoId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Prepare an Instagram post"
      description="This creates a manual workflow item. Nothing is posted to Instagram automatically."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={!videoId}
            icon={<Image size={13} />}
            onClick={async () => {
              if (!videoId) return;
              setSaving(true);
              try {
                await api("/publishing/instagram/manual", {
                  method: "POST",
                  json: {
                    video_id: videoId,
                    caption,
                    notes,
                    scheduled_at: fromLocalInput(scheduledAt),
                    platform: "instagram",
                    status: "manual_ready",
                  },
                });
                toast.success("Instagram post prepared", "Copy the caption and post the file yourself when ready.");
                await onCreated();
              } catch (error) {
                toast.error("Could not prepare the post", errorMessage(error));
              } finally {
                setSaving(false);
              }
            }}
          >
            Prepare post
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Video">
          <Select value={videoId || ""} onChange={(event) => setVideoId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">Choose a video…</option>
            {videos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {item.aspect_ratio}
              </option>
            ))}
          </Select>
        </Field>
        {video ? (
          <div className="flex items-center gap-3 rounded-xl bg-white/60 p-2.5">
            <VideoThumbnail
              videoId={video.id}
              title={video.title}
              hasThumbnail={video.has_thumbnail}
              duration={video.duration}
              className="h-14 w-24 shrink-0"
            />
            <div className="min-w-0 text-[10px] leading-relaxed text-muted">
              <p className="truncate text-[11px] font-bold text-ink">{video.title}</p>
              <p className="mt-0.5">
                {video.channel_name} · {video.aspect_ratio} · {formatDuration(video.duration)}
              </p>
              {video.aspect_ratio !== "9:16" ? (
                <p className="mt-1 font-semibold text-[#a95f66]">Not vertical. Reels need a 9:16 render.</p>
              ) : null}
            </div>
          </div>
        ) : null}
        <Field label="Caption" hint="Prepared from the video description and hashtags. Edit freely.">
          <Textarea value={caption} onChange={(event) => setCaption(event.target.value)} className="min-h-[130px]" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Planned time (optional)">
            <Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
          </Field>
          <Field label="Private notes">
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. post after the YouTube premiere" />
          </Field>
        </div>
        <div className="flex items-start gap-2 rounded-xl bg-powder/40 px-3 py-2.5 text-[10.5px] leading-relaxed text-[#5b7088]">
          <Info size={12} className="mt-0.5 shrink-0" />
          Katha Studio does not store an Instagram password and does not claim to publish for you. Mark the item posted
          after you have actually posted it.
        </div>
      </div>
    </Modal>
  );
}

function RescheduleModal({
  publication,
  video,
  onClose,
  onSaved,
}: {
  publication: Publication | null;
  video?: Video;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (publication) setValue(toLocalInput(publication.scheduled_at));
  }, [publication?.id]);

  return (
    <Modal
      open={Boolean(publication)}
      onClose={onClose}
      title="Reschedule publication"
      description="For a YouTube-confirmed schedule, Katha Studio updates YouTube first. If YouTube rejects the change, the local time is not silently changed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={!value}
            onClick={async () => {
              if (!publication) return;
              setSaving(true);
              try {
                await api(`/publications/${publication.id}`, {
                  method: "PATCH",
                  json: { scheduled_at: fromLocalInput(value) },
                });
                toast.success("Publication rescheduled");
                await onSaved();
              } catch (error) {
                toast.error("Could not reschedule", errorMessage(error));
              } finally {
                setSaving(false);
              }
            }}
          >
            Save time
          </Button>
        </>
      }
    >
      {publication ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-white/60 p-3">
            <p className="text-[11.5px] font-bold">{video?.title || `Video #${publication.video_id}`}</p>
            <p className="mt-0.5 text-[10px] text-muted">
              {publication.platform} · currently {publication.scheduled_at ? formatDateTime(publication.scheduled_at) : "unscheduled"}
            </p>
          </div>
          <Field label="New publication time (your local time)">
            <Input type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
          </Field>
        </div>
      ) : null}
    </Modal>
  );
}

function MarkPostedModal({
  publication,
  onClose,
  onSaved,
}: {
  publication: Publication | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (publication) setUrl(publication.remote_url || "");
  }, [publication?.id]);

  return (
    <Modal
      open={Boolean(publication)}
      onClose={onClose}
      title="Mark as posted"
      description="Record the real link after you have posted the item yourself. Katha Studio does not verify an Instagram post."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            icon={<CheckCircle2 size={13} />}
            onClick={async () => {
              if (!publication) return;
              setSaving(true);
              try {
                await api(`/publications/${publication.id}`, {
                  method: "PATCH",
                  json: {
                    status: "published",
                    published_at: new Date().toISOString(),
                    remote_url: url.trim(),
                  },
                });
                toast.success("Marked as posted", "This is a manual record, not an API confirmation.");
                await onSaved();
              } catch (error) {
                toast.error("Could not update the publication", errorMessage(error));
              } finally {
                setSaving(false);
              }
            }}
          >
            Mark posted
          </Button>
        </>
      }
    >
      <Field label="Post URL (optional)">
        <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.instagram.com/p/…" autoFocus />
      </Field>
      <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
        Leave it blank if you do not have the link. The item will still be recorded as manually posted.
      </p>
    </Modal>
  );
}
