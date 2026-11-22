import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  AudioLines,
  CalendarDays,
  Check,
  Circle,
  Clapperboard,
  Clock3,
  Feather,
  Film,
  Radio,
  Send,
  Sparkles,
  Wand2,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/AppStore";
import type { DashboardData, Job, SocialAccount } from "@/lib/types";
import { cn, formatDate, greeting, relativeTime, statusLabel } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { Badge, Button, Card, CardHeader, EmptyState, Progress, Stat, StatusBadge } from "@/components/ui";
import { VideoThumbnail } from "@/components/shared";

const pipeline = [
  { key: "draft_scripts", label: "Scripts", icon: Feather, tone: "lavender" },
  { key: "awaiting_voice", label: "Voice", icon: AudioLines, tone: "peach" },
  { key: "awaiting_animation", label: "Animation", icon: Film, tone: "powder" },
  { key: "awaiting_review", label: "Review", icon: Clapperboard, tone: "sage" },
  { key: "scheduled", label: "Scheduled", icon: CalendarDays, tone: "lavender" },
  { key: "published", label: "Published", icon: Send, tone: "sage" },
] as const;

export function OverviewPage() {
  const navigate = useNavigate();
  const { channels, providers, settings, jobs, dataVersion } = useAppStore();
  const { data, loading } = useFetch<DashboardData>(() => api("/dashboard"), [dataVersion]);
  const accounts = useFetch<{ accounts: SocialAccount[] }>(() => api("/publishing/accounts"), [dataVersion]);
  const counts = data?.counts || {};

  const aiReady = providers
    .filter((provider) => ["zen", "openrouter"].includes(provider.provider))
    .some((provider) => provider.credential_status === "configured");
  const elevenReady = providers.find((provider) => provider.provider === "elevenlabs")?.credential_status === "configured";
  const youtubeReady = (accounts.data?.accounts || []).some((account) => account.provider === "youtube");

  const onboarding = [
    { label: "Create your first channel", done: channels.length > 0, to: "/channels" },
    { label: "Connect an AI provider", done: aiReady, to: "/settings" },
    { label: "Connect ElevenLabs for premium voice", done: elevenReady, to: "/settings" },
    { label: "Connect YouTube for publishing", done: youtubeReady, to: "/publishing" },
  ];
  const completed = onboarding.filter((step) => step.done).length;

  const recentVideos = data?.recent_videos || [];
  const upcoming = data?.upcoming_publications || [];
  const activeJobs = useMemo(
    () => (data?.active_jobs?.length ? data.active_jobs : jobs.filter((job) => ["queued", "running"].includes(job.status))),
    [data, jobs],
  );

  const totalInMotion =
    (counts.draft_scripts || 0) +
    (counts.awaiting_voice || 0) +
    (counts.awaiting_animation || 0) +
    (counts.animation_in_progress || 0) +
    (counts.awaiting_review || 0) +
    (counts.ready_to_upload || 0);

  return (
    <div className="animate-float-in">
      <PageHeader
        eyebrow={`${greeting()} · ${formatDate(new Date().toISOString(), "long")}`}
        title="Your stories, taking shape."
        description="One quiet studio for ideas, scripts, voices, animation handoff and publishing. Everything stays on this computer unless you connect an account."
        actions={
          <>
            <Button variant="secondary" icon={<Clapperboard size={14} />} onClick={() => navigate("/videos")}>
              Video library
            </Button>
            <Button icon={<Sparkles size={14} />} onClick={() => navigate("/create")}>
              Create something
            </Button>
          </>
        }
      />

      {channels.length === 0 ? (
        <Card className="overflow-hidden">
          <div className="grid gap-8 p-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <Badge tone="lavender" dot>
                First steps
              </Badge>
              <h2 className="display mt-4 text-[30px] leading-tight">
                A calm home for the stories you keep meaning to make.
              </h2>
              <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-muted">
                Katha Studio turns a channel and a spark into a structured story, scene-by-scene script, voice audio,
                a production package for Claude, and a publishing plan. Start by creating a channel — nothing leaves
                your computer.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button icon={<Radio size={14} />} onClick={() => navigate("/channels")}>
                  Create your first channel
                </Button>
                <Button variant="secondary" onClick={() => navigate("/settings")}>
                  Connect AI & voice
                </Button>
              </div>
              <div className="mt-7 grid gap-2 sm:grid-cols-2">
                {onboarding.map((step) => (
                  <button
                    key={step.label}
                    type="button"
                    onClick={() => navigate(step.to)}
                    className="flex items-center gap-2.5 rounded-xl border border-white/80 bg-white/50 px-3 py-2.5 text-left transition hover:bg-white/80"
                  >
                    {step.done ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sage text-moss">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    ) : (
                      <Circle size={18} className="text-ink/20" />
                    )}
                    <span className={cn("text-[11.5px] font-semibold", step.done ? "text-muted line-through" : "text-ink/80")}>
                      {step.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-[26px] bg-gradient-to-br from-lavender/70 via-parchment to-sage/60 p-8">
              <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full border border-white/60" />
              <div className="absolute -bottom-10 -left-6 h-52 w-52 rounded-full border border-white/50" />
              <div className="relative text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-white/70 shadow-soft">
                  <Wand2 size={26} className="text-clay" />
                </div>
                <p className="display mt-5 text-[21px] leading-snug">
                  “Every finished film
                  <br />
                  begins as a small flame.”
                </p>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted/60">Katha Studio</p>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
            <Card className="relative overflow-hidden p-6">
              <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-lavender/40 blur-2xl" />
              <div className="relative flex flex-wrap items-start justify-between gap-6">
                <div>
                  <p className="eyebrow">Studio pulse</p>
                  <p className="display mt-2 text-[42px] leading-none">{totalInMotion}</p>
                  <p className="mt-2 max-w-xs text-[12.5px] leading-relaxed text-muted">
                    pieces of story in motion across {channels.length} channel{channels.length === 1 ? "" : "s"}.
                    {counts.scheduled ? ` ${counts.scheduled} already scheduled.` : ""}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Videos" value={counts.total_videos || 0} tone="cream" />
                  <Stat label="Published" value={counts.published || 0} tone="sage" />
                  <Stat label="Scheduled" value={counts.scheduled || 0} tone="lavender" />
                  <Stat label="Scripts" value={counts.draft_scripts || 0} tone="peach" />
                </div>
              </div>
              <div className="relative mt-6 flex flex-wrap gap-1.5">
                {pipeline.map((stage, index) => {
                  const count = counts[stage.key] || 0;
                  return (
                    <div key={stage.key} className="flex items-center gap-1.5">
                      <div
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10.5px] font-bold",
                          count > 0 ? "bg-white/80 text-ink/75 shadow-sm" : "bg-ink/[0.035] text-ink/30",
                        )}
                      >
                        <stage.icon size={11} />
                        {stage.label}
                        <span className={count > 0 ? "text-clay" : "text-ink/20"}>{count}</span>
                      </div>
                      {index < pipeline.length - 1 ? <span className="text-ink/15">·</span> : null}
                    </div>
                  );
                })}
              </div>
              <div className="relative mt-4 flex flex-wrap items-center gap-1.5 border-t border-ink/[0.06] pt-3">
                <span className="mr-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted/60">Output folders</span>
                {[
                  { state: "READY", count: counts.output_ready || 0, tone: "bg-peach/45" },
                  { state: "REVIEWED", count: counts.output_reviewed || 0, tone: "bg-lavender/45" },
                  { state: "PUBLISHED", count: counts.output_published || 0, tone: "bg-sage/45" },
                  { state: "FAILED", count: counts.output_failed || 0, tone: "bg-rose/35" },
                ].map((item) => (
                  <button
                    key={item.state}
                    type="button"
                    onClick={() => navigate(`/videos?output=${item.state}`)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9.5px] font-bold transition hover:brightness-95",
                      item.count > 0 ? `${item.tone} text-ink/75` : "bg-ink/[0.035] text-ink/30",
                    )}
                  >
                    {item.state}
                    <span className={item.count > 0 ? "text-clay" : "text-ink/20"}>{item.count}</span>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <CardHeader
                title="Upcoming"
                subtitle="Scheduled publications"
                icon={<CalendarDays size={16} />}
                action={
                  <button onClick={() => navigate("/calendar")} className="text-[10.5px] font-bold text-muted hover:text-ink">
                    Calendar →
                  </button>
                }
              />
              <div className="mt-4 space-y-3">
                {upcoming.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Clock3 size={18} />}
                    title="Nothing scheduled yet"
                    message="Schedule a video when it's ready to meet its audience."
                    action={
                      <Button size="sm" variant="secondary" onClick={() => navigate("/calendar")}>
                        Open calendar
                      </Button>
                    }
                  />
                ) : (
                  upcoming.slice(0, 3).map((publication) => (
                    <div key={publication.id} className="flex items-start gap-3 rounded-xl bg-white/50 p-2.5">
                      {publication.video ? (
                        <VideoThumbnail
                          videoId={publication.video.id}
                          title={publication.video.title}
                          hasThumbnail={publication.video.has_thumbnail}
                          className="h-11 w-16 shrink-0"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate text-[11.5px] font-bold">{publication.video?.title || "Publication"}</p>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {relativeTime(publication.scheduled_at)} · {publication.platform}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
            <Card className="p-6">
              <CardHeader
                title="Recent work"
                subtitle="The latest videos moving through your studio"
                icon={<Clapperboard size={16} />}
                action={
                  <button onClick={() => navigate("/videos")} className="text-[10.5px] font-bold text-muted hover:text-ink">
                    View library →
                  </button>
                }
              />
              <div className="mt-4 space-y-1">
                {recentVideos.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Film size={18} />}
                    title="The stage is quiet"
                    message="Finish a script, generate voice and package it for Claude. Finished videos appear here."
                    action={
                      <Button size="sm" variant="secondary" onClick={() => navigate("/scripts")}>
                        Open script studio
                      </Button>
                    }
                  />
                ) : (
                  recentVideos.map((video) => (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => navigate(`/videos?video=${video.id}`)}
                      className="group flex w-full items-center gap-3 rounded-xl px-1.5 py-2 text-left transition hover:bg-white/60"
                    >
                      <VideoThumbnail
                        videoId={video.id}
                        title={video.title}
                        hasThumbnail={video.has_thumbnail}
                        className="h-12 w-[74px] shrink-0"
                        duration={video.duration}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-bold group-hover:text-ink">{video.title}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: video.channel_accent }} />
                          {video.channel_name}
                          <span className="text-ink/20">·</span>
                          {formatDate(video.updated_at)}
                        </p>
                      </div>
                      <StatusBadge status={video.production_status} />
                      <ArrowRight size={14} className="shrink-0 text-ink/20 transition group-hover:text-ink/50" />
                    </button>
                  ))
                )}
              </div>
            </Card>

            <div className="space-y-4">
              <Card className="p-6">
                <CardHeader
                  title="Channels"
                  subtitle="Your creative worlds"
                  icon={<Radio size={16} />}
                  action={
                    <button onClick={() => navigate("/channels")} className="text-[10.5px] font-bold text-muted hover:text-ink">
                      Manage →
                    </button>
                  }
                />
                <div className="mt-4 space-y-2">
                  {channels.slice(0, 4).map((channel) => (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => navigate(`/channels?channel=${channel.id}`)}
                      className="flex w-full items-center gap-3 rounded-xl bg-white/45 p-2.5 text-left transition hover:bg-white/80"
                    >
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-[12px] font-bold text-white/90"
                        style={{ background: channel.accent_color }}
                      >
                        {channel.name.slice(0, 1)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-bold">{channel.name}</p>
                        <p className="text-[10px] text-muted">
                          {channel.stats?.projects || 0} stories · {channel.stats?.videos || 0} videos
                        </p>
                      </div>
                      <ArrowRight size={13} className="text-ink/20" />
                    </button>
                  ))}
                </div>
              </Card>

              {activeJobs.length > 0 ? (
                <Card className="p-6">
                  <CardHeader title="Working now" subtitle="Background studio jobs" icon={<Sparkles size={16} />} />
                  <div className="mt-4 space-y-3">
                    {activeJobs.slice(0, 3).map((job) => (
                      <JobRow key={job.id} job={job} />
                    ))}
                  </div>
                </Card>
              ) : (
                <Card className="p-6">
                  <CardHeader title="Studio readiness" subtitle="Connections that unlock more" icon={<Wand2 size={16} />} />
                  <div className="mt-3 space-y-1">
                    {onboarding.map((step) => (
                      <button
                        key={step.label}
                        type="button"
                        onClick={() => navigate(step.to)}
                        className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left"
                      >
                        {step.done ? (
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-sage text-moss">
                            <Check size={9} strokeWidth={3} />
                          </span>
                        ) : (
                          <Circle size={14} className="text-ink/20" />
                        )}
                        <span className={cn("text-[11px] font-semibold", step.done ? "text-muted" : "text-ink/70")}>
                          {step.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] font-semibold text-muted/60">
                    {completed} of {onboarding.length} ready
                  </p>
                </Card>
              )}
            </div>
          </div>

          {counts.failed ? (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-rose/70 bg-rose/30 px-4 py-3">
              <AlertTriangle size={15} className="text-[#a95f66]" />
              <p className="text-[12px] font-semibold text-[#8f555b]">
                {counts.failed} item{counts.failed === 1 ? "" : "s"} need attention. Review failed uploads and jobs.
              </p>
              <Button size="sm" variant="secondary" className="ml-auto" onClick={() => navigate("/calendar")}>
                Review
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  return (
    <div className="rounded-xl bg-white/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-bold capitalize">{job.type.replace(/_/g, " ")}</p>
        <span className="text-[10px] font-bold text-muted">{Math.round(job.progress)}%</span>
      </div>
      <p className="mt-1 truncate text-[10.5px] text-muted">{job.message || statusLabel(job.status)}</p>
      <Progress value={job.progress} className="mt-2" />
    </div>
  );
}
