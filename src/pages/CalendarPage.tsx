import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  Film,
  FolderOpen,
  Info,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { api, bridge } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/AppStore";
import type { CalendarData, Job, Publication, Video } from "@/lib/types";
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
  Select,
  StatusBadge,
  Textarea,
  Toggle,
} from "@/components/ui";
import { VideoThumbnail } from "@/components/shared";
import { useToast } from "@/components/Toast";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function startOfWeek(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (copy.getDay() + 6) % 7; // Monday = 0
  copy.setDate(copy.getDate() - day);
  return copy;
}

function addDays(date: Date, amount: number) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function CalendarPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { channels, selectedChannelId, dataVersion } = useAppStore();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [channelFilter, setChannelFilter] = useState(selectedChannelId ? String(selectedChannelId) : "all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [planOpen, setPlanOpen] = useState(false);
  const [planVideoId, setPlanVideoId] = useState<number | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Publication | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [savingEvent, setSavingEvent] = useState(false);
  const [retrying, setRetrying] = useState<number | null>(null);

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = addDays(gridStart, 42);
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)), [gridStart.getTime()]);

  const calendar = useFetch<CalendarData>(
    () => {
      const params = new URLSearchParams();
      params.set("start", gridStart.toISOString());
      params.set("end", gridEnd.toISOString());
      if (channelFilter !== "all") params.set("channel_id", channelFilter);
      if (platformFilter !== "all") params.set("platform", platformFilter);
      return api(`/calendar?${params.toString()}`);
    },
    [gridStart.getTime(), gridEnd.getTime(), channelFilter, platformFilter, dataVersion],
  );

  const videos = useFetch<{ videos: Video[] }>(() => api("/videos?limit=300"), [dataVersion]);

  const events = calendar.data?.events || [];
  const drafts = calendar.data?.drafts || [];
  const failed = calendar.data?.failed_uploads || [];

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Publication[]>();
    for (const event of events) {
      const raw = event.scheduled_at || event.published_at;
      if (!raw) continue;
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) continue;
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      map.set(key, [...(map.get(key) || []), event]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.scheduled_at || a.published_at || 0).getTime() - new Date(b.scheduled_at || b.published_at || 0).getTime());
    }
    return map;
  }, [events]);

  const openEvent = (event: Publication) => {
    setSelectedEvent(event);
    setRescheduleValue(toLocalInput(event.scheduled_at || event.published_at));
  };

  const saveEventTime = async () => {
    if (!selectedEvent || !rescheduleValue) return;
    setSavingEvent(true);
    try {
      await api(`/publications/${selectedEvent.id}`, {
        method: "PATCH",
        json: { scheduled_at: fromLocalInput(rescheduleValue) },
      });
      toast.success("Calendar updated");
      setSelectedEvent(null);
      await calendar.reload(true);
    } catch (error) {
      toast.error("Could not move the publication", errorMessage(error));
    } finally {
      setSavingEvent(false);
    }
  };

  const cancelEvent = async () => {
    if (!selectedEvent) return;
    setSavingEvent(true);
    try {
      await api(`/publications/${selectedEvent.id}`, { method: "PATCH", json: { status: "cancelled" } });
      toast.success("Publication removed from the plan");
      setSelectedEvent(null);
      await calendar.reload(true);
    } catch (error) {
      toast.error("Could not cancel the publication", errorMessage(error));
    } finally {
      setSavingEvent(false);
    }
  };

  const retryUpload = async (id: number) => {
    setRetrying(id);
    try {
      await api(`/publishing/uploads/${id}/retry`, { method: "POST" });
      toast.info("Upload queued again", "Watch the activity in Publishing Manager.");
      await calendar.reload(true);
    } catch (error) {
      toast.error("Could not retry", errorMessage(error));
    } finally {
      setRetrying(null);
    }
  };

  const today = new Date();
  const monthStart = startOfMonth(month);
  const monthEnd = addMonths(month, 1);
  const inMonthEvents = events.filter((event) => {
    const raw = event.scheduled_at || event.published_at;
    if (!raw) return false;
    const date = new Date(raw);
    return date >= monthStart && date < monthEnd;
  });

  return (
    <div className="animate-float-in">
      <PageHeader
        eyebrow="A quiet plan"
        title="Content Calendar"
        description="See what is scheduled, what is still a draft, and what YouTube has genuinely confirmed. Local plans are clearly separated from platform schedules."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void calendar.reload()}>
              Refresh
            </Button>
            <Button
              icon={<CalendarPlus size={14} />}
              onClick={() => {
                setPlanVideoId(null);
                setPlanOpen(true);
              }}
            >
              Plan a publication
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_310px]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
                  <ChevronLeft size={16} />
                </IconButton>
                <h2 className="display min-w-[190px] text-center text-[22px]">{monthLabel(month)}</h2>
                <IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
                  <ChevronRight size={16} />
                </IconButton>
                <Button size="sm" variant="ghost" onClick={() => setMonth(startOfMonth(new Date()))}>
                  Today
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} className="w-[165px]">
                  <option value="all">All channels</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </Select>
                <Select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} className="w-[145px]">
                  <option value="all">All platforms</option>
                  <option value="youtube">YouTube</option>
                  <option value="instagram">Instagram</option>
                </Select>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-[9.5px] font-semibold text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#9a88b8]" /> YouTube confirmed schedule
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-clay" /> Local plan
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#c98f9a]" /> Instagram manual
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-moss" /> Published
              </span>
              <span className="ml-auto text-muted/60">
                {inMonthEvents.length} item{inMonthEvents.length === 1 ? "" : "s"} this month
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-ink/[0.07]">
              <div className="grid grid-cols-7 border-b border-ink/[0.06] bg-white/50">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="px-2 py-2 text-center text-[9px] font-bold uppercase tracking-[0.1em] text-muted/60">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day, index) => {
                  const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
                  const dayEvents = eventsByDay.get(key) || [];
                  const isCurrentMonth = day.getMonth() === month.getMonth();
                  const isToday = sameDay(day, today);
                  return (
                    <div
                      key={key}
                      className={cn(
                        "min-h-[116px] border-b border-r border-ink/[0.05] p-1.5 transition",
                        index % 7 === 6 && "border-r-0",
                        index >= 35 && "border-b-0",
                        !isCurrentMonth && "bg-ink/[0.015]",
                        isToday && "bg-lavender/20",
                      )}
                    >
                      <div className="flex items-center justify-between px-1">
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                            isToday ? "bg-ink text-cream" : isCurrentMonth ? "text-ink/70" : "text-muted/40",
                          )}
                        >
                          {day.getDate()}
                        </span>
                        {dayEvents.length > 0 ? (
                          <span className="text-[8px] font-bold text-muted/40">{dayEvents.length}</span>
                        ) : null}
                      </div>
                      <div className="mt-1 space-y-1">
                        {dayEvents.slice(0, 3).map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => openEvent(event)}
                            className={cn(
                              "block w-full truncate rounded-md px-1.5 py-1 text-left text-[8.5px] font-bold leading-tight transition hover:brightness-[0.97]",
                              eventTone(event),
                            )}
                            title={event.video?.title || `Video #${event.video_id}`}
                          >
                            <span className="mr-1 opacity-70">
                              {new Date(event.scheduled_at || event.published_at || "").toLocaleTimeString(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                            {event.video?.title || `Video #${event.video_id}`}
                          </button>
                        ))}
                        {dayEvents.length > 3 ? (
                          <p className="px-1.5 text-[8px] font-semibold text-muted/50">+{dayEvents.length - 3} more</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {calendar.loading ? (
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
                <Loader2 size={11} className="animate-spin" /> Loading the calendar…
              </p>
            ) : null}
            {calendar.error ? <p className="mt-2 text-[10.5px] text-[#a95f66]">{calendar.error}</p> : null}
          </Card>

          <div className="flex items-start gap-2 rounded-2xl border border-white/70 bg-white/40 px-4 py-3 text-[10.5px] leading-relaxed text-muted">
            <Info size={13} className="mt-0.5 shrink-0 text-slateblue" />
            <p>
              A local plan is not a YouTube schedule. To schedule on YouTube, upload in the{" "}
              <button type="button" onClick={() => navigate("/publishing")} className="font-bold text-ink underline decoration-ink/20 underline-offset-2">
                Publishing Manager
              </button>
              . Katha Studio only marks a YouTube schedule after YouTube confirms it. Instagram items stay manual.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <CardHeader
              title="Unscheduled films"
              subtitle={`${drafts.length} film${drafts.length === 1 ? "" : "s"} without a planned date`}
              icon={<Film size={15} />}
            />
            <div className="mt-3 max-h-[330px] space-y-1.5 overflow-y-auto pr-1">
              {drafts.length === 0 ? (
                <p className="rounded-xl bg-white/45 px-3 py-3 text-[10.5px] leading-relaxed text-muted">
                  Every film has a plan, or the library is empty.
                </p>
              ) : (
                drafts.slice(0, 20).map((video) => (
                  <div key={video.id} className="flex items-center gap-2 rounded-xl bg-white/50 p-2">
                    <VideoThumbnail
                      videoId={video.id}
                      title={video.title}
                      hasThumbnail={video.has_thumbnail}
                      duration={video.duration}
                      className="h-10 w-16 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-bold">{video.title}</p>
                      <p className="truncate text-[8.5px] text-muted">
                        {video.channel_name} · {formatDuration(video.duration)}
                      </p>
                    </div>
                    <IconButton
                      label="Plan this film"
                      onClick={() => {
                        setPlanVideoId(video.id);
                        setPlanOpen(true);
                      }}
                    >
                      <CalendarPlus size={12} />
                    </IconButton>
                  </div>
                ))
              )}
            </div>
            <Button className="mt-3 w-full" size="sm" variant="secondary" icon={<ArrowRight size={12} />} onClick={() => navigate("/videos")}>
              Open video library
            </Button>
          </Card>

          <Card className="p-5">
            <CardHeader title="Failed uploads" subtitle="Real errors from YouTube upload jobs" icon={<AlertTriangle size={15} />} />
            <div className="mt-3 space-y-2">
              {failed.length === 0 ? (
                <p className="rounded-xl bg-white/45 px-3 py-3 text-[10.5px] text-muted">No failed uploads.</p>
              ) : (
                failed.slice(0, 6).map((upload) => (
                  <div key={upload.id} className="rounded-xl border border-rose/40 bg-rose/15 p-2.5">
                    <p className="truncate text-[10px] font-bold">{upload.video?.title || `Video #${upload.video_id}`}</p>
                    <p className="mt-1 line-clamp-3 text-[9px] leading-relaxed text-[#8f555b]">{upload.error || "Unknown upload error."}</p>
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="secondary"
                      icon={<RefreshCw size={10} />}
                      loading={retrying === upload.id}
                      onClick={() => void retryUpload(upload.id)}
                    >
                      Retry upload
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">Calendar honesty</p>
            <ul className="mt-2 space-y-2 text-[10px] leading-relaxed text-muted">
              <li>• YouTube-confirmed schedules come from the YouTube API, not from this screen.</li>
              <li>• Moving a confirmed YouTube schedule asks YouTube first.</li>
              <li>• Local plans can be moved freely without touching any platform.</li>
              <li>• Instagram items are reminders for a manual post.</li>
            </ul>
          </Card>
        </div>
      </div>

      <PlanModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        videos={videos.data?.videos || []}
        initialVideoId={planVideoId}
        onCreated={async () => {
          setPlanOpen(false);
          await calendar.reload(true);
        }}
      />

      <Modal
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent?.video?.title || "Publication"}
        description={
          selectedEvent
            ? `${selectedEvent.platform === "youtube" ? "YouTube" : "Instagram"} · ${statusLabel(selectedEvent.status)}`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelectedEvent(null)}>
              Close
            </Button>
            {selectedEvent && !["published", "cancelled"].includes(selectedEvent.status) ? (
              <Button variant="danger" size="sm" icon={<X size={12} />} loading={savingEvent} onClick={() => void cancelEvent()}>
                Cancel item
              </Button>
            ) : null}
            {selectedEvent && !["published", "cancelled"].includes(selectedEvent.status) ? (
              <Button loading={savingEvent} onClick={() => void saveEventTime()}>
                Save new time
              </Button>
            ) : null}
          </>
        }
      >
        {selectedEvent ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selectedEvent.status} />
              <Badge tone={selectedEvent.platform === "youtube" ? "rose" : "peach"}>
                {selectedEvent.platform === "youtube" ? "YouTube" : "Instagram"}
              </Badge>
              {selectedEvent.is_demo ? <Badge tone="peach">Demo</Badge> : null}
              {selectedEvent.platform === "youtube" && selectedEvent.status === "scheduled" ? (
                <Badge tone="lavender" dot>
                  Confirmed by YouTube
                </Badge>
              ) : null}
            </div>

            {selectedEvent.video ? (
              <div className="flex items-center gap-3 rounded-xl bg-white/60 p-2.5">
                <VideoThumbnail
                  videoId={selectedEvent.video.id}
                  title={selectedEvent.video.title}
                  hasThumbnail={selectedEvent.video.has_thumbnail}
                  duration={selectedEvent.video.duration}
                  className="h-14 w-24 shrink-0"
                />
                <div className="min-w-0 text-[10px] leading-relaxed text-muted">
                  <p className="truncate text-[11px] font-bold text-ink">{selectedEvent.video.title}</p>
                  <p className="mt-0.5">
                    {selectedEvent.video.channel_name} · {formatDuration(selectedEvent.video.duration)} ·{" "}
                    {selectedEvent.video.aspect_ratio}
                  </p>
                </div>
              </div>
            ) : null}

            {selectedEvent.scheduled_at ? (
              <Field label={selectedEvent.status === "published" ? "Scheduled time" : "Publication time (local)"}>
                <Input type="datetime-local" value={rescheduleValue} onChange={(event) => setRescheduleValue(event.target.value)} />
              </Field>
            ) : null}

            {selectedEvent.notes ? (
              <div>
                <p className="eyebrow mb-1">Notes</p>
                <p className="text-[11px] leading-relaxed text-muted">{selectedEvent.notes}</p>
              </div>
            ) : null}

            {selectedEvent.caption ? (
              <div>
                <p className="eyebrow mb-1">Caption</p>
                <p className="whitespace-pre-line rounded-xl bg-white/60 p-3 text-[10.5px] leading-relaxed text-ink/70">
                  {selectedEvent.caption}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {selectedEvent.remote_url ? (
                <Button size="sm" variant="secondary" icon={<ExternalLink size={11} />} onClick={() => bridge.openExternal(selectedEvent.remote_url)}>
                  Open post
                </Button>
              ) : null}
              {selectedEvent.caption ? <CopyButton value={selectedEvent.caption} label="Copy caption" /> : null}
              {selectedEvent.video ? (
                <Button size="sm" variant="ghost" icon={<FolderOpen size={11} />} onClick={() => navigate(`/videos?video=${selectedEvent.video?.id}`)}>
                  Open in library
                </Button>
              ) : null}
              {selectedEvent.platform === "youtube" && selectedEvent.status !== "published" ? (
                <Button size="sm" variant="ghost" icon={<Send size={11} />} onClick={() => navigate("/publishing")}>
                  Publishing manager
                </Button>
              ) : null}
            </div>

            {selectedEvent.platform === "youtube" && selectedEvent.status === "scheduled" ? (
              <p className="rounded-xl bg-powder/40 px-3 py-2 text-[10px] leading-relaxed text-[#5b7088]">
                This schedule is confirmed on YouTube. Moving it updates YouTube first; if YouTube rejects the change, the
                local time stays unchanged.
              </p>
            ) : null}
            {selectedEvent.platform === "instagram" ? (
              <p className="rounded-xl bg-peach/35 px-3 py-2 text-[10px] leading-relaxed text-[#8a5f48]">
                Instagram is manual. This date is a reminder, not an API schedule.
              </p>
            ) : null}
            {selectedEvent.status === "draft" ? (
              <p className="rounded-xl bg-peach/35 px-3 py-2 text-[10px] leading-relaxed text-[#8a5f48]">
                This is a local production plan. It is not uploaded or scheduled on YouTube yet.
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function eventTone(event: Publication): string {
  if (event.status === "published") return "bg-sage/70 text-[#50694f]";
  if (event.platform === "instagram") return "bg-[#f1d6d9] text-[#9c5c63]";
  if (event.status === "scheduled") return "bg-lavender/80 text-[#71618c]";
  return "bg-peach/80 text-[#8a5f48]";
}

function PlanModal({
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
  const [platform, setPlatform] = useState<"youtube" | "instagram">("youtube");
  const [when, setWhen] = useState("");
  const [caption, setCaption] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVideoId(initialVideoId);
    setPlatform("youtube");
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(18, 0, 0, 0);
    setWhen(toLocalInput(next.toISOString()));
    setCaption("");
    setNotes("");
  }, [open, initialVideoId]);

  const video = videos.find((item) => item.id === videoId);

  const submit = async () => {
    if (!videoId || !when) {
      toast.error("Choose a film and a time");
      return;
    }
    setSaving(true);
    try {
      if (platform === "instagram") {
        await api("/publishing/instagram/manual", {
          method: "POST",
          json: {
            video_id: videoId,
            caption: caption || [video?.description, ...(video?.hashtags || []).map((tag) => `#${tag}`)].filter(Boolean).join("\n\n"),
            notes: notes || "Manual Instagram workflow. Katha Studio does not publish automatically.",
            scheduled_at: fromLocalInput(when),
            platform: "instagram",
            status: "manual_ready",
          },
        });
        toast.success("Instagram reminder prepared", "Post it yourself when the time comes.");
      } else {
        await api("/publications", {
          method: "POST",
          json: {
            video_id: videoId,
            platform: "youtube",
            status: "draft",
            scheduled_at: fromLocalInput(when),
            notes: notes || "Local production plan. Upload and schedule on YouTube from Publishing Manager.",
            caption,
          },
        });
        toast.success("Local plan saved", "This does not schedule anything on YouTube. Upload in Publishing Manager to do that.");
      }
      await onCreated();
    } catch (error) {
      toast.error("Could not save the plan", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Plan a publication"
      description="A local plan keeps the studio organised. Only the YouTube Publishing Manager creates a real YouTube upload or schedule."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!videoId || !when} icon={<CalendarPlus size={13} />} onClick={() => void submit()}>
            {platform === "instagram" ? "Prepare Instagram item" : "Save local plan"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Film">
          <Select value={videoId || ""} onChange={(event) => setVideoId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">Choose a film…</option>
            {videos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {item.channel_name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="What kind of item is this?">
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "youtube" as const, label: "YouTube production plan", note: "Local only — upload later" },
              { id: "instagram" as const, label: "Instagram manual post", note: "Reminder + caption" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPlatform(item.id)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition",
                  platform === item.id ? "border-ink/20 bg-white shadow-sm" : "border-ink/10 bg-white/40 text-muted hover:bg-white/70",
                )}
              >
                <p className="text-[11px] font-bold">{item.label}</p>
                <p className="mt-0.5 text-[9.5px]">{item.note}</p>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Planned time (local)">
          <Input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
        </Field>

        {platform === "instagram" ? (
          <Field label="Caption" hint="Prepared for you to copy when posting manually.">
            <Textarea value={caption} onChange={(event) => setCaption(event.target.value)} className="min-h-[110px]" placeholder="Leave blank to use the video description and hashtags." />
          </Field>
        ) : null}

        <Field label="Notes">
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional context for future you" />
        </Field>

        <div className="flex items-start gap-2 rounded-xl bg-powder/40 px-3 py-2.5 text-[10px] leading-relaxed text-[#5b7088]">
          <Info size={12} className="mt-0.5 shrink-0" />
          {platform === "youtube"
            ? "This saves a draft calendar entry. The film's local production state is not changed to “Scheduled”, and YouTube is not contacted."
            : "Instagram has no automatic publishing in Katha Studio. This item is marked manual-ready."}
        </div>
      </div>
    </Modal>
  );
}
