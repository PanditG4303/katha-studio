import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleCheck,
  ExternalLink,
  FolderOpen,
  Globe2,
  Instagram,
  Loader2,
  Lock,
  MonitorSmartphone,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
  Youtube,
} from "lucide-react";
import { api, bridge } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/AppStore";
import type { BrowserAccount, BrowserOverview, BrowserPublish, Video } from "@/lib/types";
import {
  cn,
  errorMessage,
  formatDateTime,
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
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
  Toggle,
} from "@/components/ui";
import { useToast } from "@/components/Toast";

const ACTIVE = new Set(["queued", "preparing", "awaiting_confirmation", "publishing"]);

const jobTone: Record<string, "sage" | "blue" | "peach" | "rose" | "neutral" | "lavender"> = {
  queued: "neutral",
  preparing: "blue",
  awaiting_confirmation: "peach",
  publishing: "lavender",
  published: "sage",
  scheduled: "sage",
  failed: "rose",
  cancelled: "neutral",
  manual_required: "peach",
};

export function BrowserManagerPage() {
  const toast = useToast();
  const { channels, dataVersion, bumpData } = useAppStore();
  const [tab, setTab] = useState<"accounts" | "jobs">("accounts");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [platform, setPlatform] = useState<"youtube" | "instagram">("youtube");
  const [label, setLabel] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [videoId, setVideoId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<"private" | "unlisted" | "public">("private");
  const [scheduledAt, setScheduledAt] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [logJob, setLogJob] = useState<BrowserPublish | null>(null);

  const overview = useFetch<BrowserOverview>(() => api("/browser"), [dataVersion, version]);
  const videos = useFetch<{ videos: Video[] }>(() => api("/videos?limit=300"), [dataVersion, version]);

  const accounts = overview.data?.accounts || [];
  const jobs = overview.data?.jobs || [];
  const runtime = overview.data?.runtime;
  const videoList = videos.data?.videos || [];

  const platformAccounts = useMemo(
    () => accounts.filter((account) => account.platform === platform),
    [accounts, platform],
  );

  const selectedVideo = videoList.find((video) => video.id === videoId) || null;
  const publishAccounts = accounts.filter((account) => account.platform === (selectedVideo?.platform === "instagram" ? "instagram" : "youtube"));

  useEffect(() => {
    if (!jobs.some((job) => ACTIVE.has(job.status))) return;
    const timer = window.setInterval(() => {
      void overview.reload(true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [jobs, overview]);

  useEffect(() => {
    if (logJob) {
      const next = jobs.find((job) => job.id === logJob.id);
      if (next) setLogJob(next);
    }
  }, [jobs, logJob]);

  const refresh = async () => {
    setVersion((value) => value + 1);
    await Promise.all([overview.reload(true), videos.reload(true)]);
  };

  const createProfile = async () => {
    if (!label.trim()) {
      toast.error("Give the account a label");
      return;
    }
    setBusy("create");
    try {
      await api("/browser/accounts", { method: "POST", json: { platform, label: label.trim() } });
      toast.success("Browser profile created", "Open it and sign in manually on the official website.");
      setCreateOpen(false);
      setLabel("");
      await refresh();
    } catch (error) {
      toast.error("Could not create the profile", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const openAccount = async (account: BrowserAccount) => {
    setBusy(`open-${account.id}`);
    try {
      const result = await api<{ result: { ok: boolean; error?: string; message?: string } }>(`/browser/accounts/${account.id}/open`, {
        method: "POST",
        json: { headless: false },
      });
      if (result.result.ok) {
        toast.success("Browser opened", "Sign in manually. Katha never asks for your password.");
      } else {
        toast.error("The browser could not open", result.result.error);
      }
      await refresh();
    } catch (error) {
      toast.error("Could not open the browser", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const closeAccount = async (account: BrowserAccount) => {
    setBusy(`close-${account.id}`);
    try {
      await api(`/browser/accounts/${account.id}/close`, { method: "POST" });
      toast.success("Browser profile closed");
      await refresh();
    } catch (error) {
      toast.error("Could not close the browser", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const testAccount = async (account: BrowserAccount) => {
    setBusy(`test-${account.id}`);
    try {
      const result = await api<{ result: { status: string; verified: boolean; identity: string; error: string } }>(
        `/browser/accounts/${account.id}/test`,
        { method: "POST" },
      );
      if (result.result.verified) toast.success(`Account verified: ${result.result.identity}`);
      else toast.error("Identity not verified", result.result.error || "Sign in manually and try again.");
      await refresh();
    } catch (error) {
      toast.error("Could not check the account", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const removeAccount = async (account: BrowserAccount) => {
    const first = window.confirm(
      `Remove "${account.label}"?\n\nThis deletes the isolated browser profile and its saved sign-in session from this computer. The real ${account.platform_label} account is not changed.`,
    );
    if (!first) return;
    setBusy(`delete-${account.id}`);
    try {
      await api(`/browser/accounts/${account.id}?confirm=true`, { method: "DELETE" });
      toast.success("Browser profile removed");
      await refresh();
    } catch (error) {
      toast.error("Could not remove the profile", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const openPublish = (account?: BrowserAccount) => {
    setPublishOpen(true);
    setReviewed(false);
    setScheduledAt("");
    if (account) {
      setPlatform(account.platform);
      setAccountId(account.id);
    }
    const firstVideo = videoList.find((video) => video.has_video && !video.archived);
    if (firstVideo) {
      setVideoId(firstVideo.id);
      setTitle(firstVideo.title);
      setDescription(firstVideo.description);
      setTags((firstVideo.tags || []).join(", "));
    } else {
      setVideoId(null);
      setTitle("");
      setDescription("");
      setTags("");
    }
  };

  const selectVideo = (id: number | null) => {
    setVideoId(id);
    const video = videoList.find((item) => item.id === id);
    if (!video) return;
    setTitle(video.title);
    setDescription(video.description || "");
    setTags((video.tags || []).join(", "));
    const matching = accounts.find((account) => account.platform === video.platform && account.identity_verified);
    setAccountId(matching?.id || null);
  };

  const startPublish = async () => {
    if (!videoId) {
      toast.error("Choose a video");
      return;
    }
    if (!accountId) {
      toast.error("Choose a verified browser account");
      return;
    }
    if (!reviewed) {
      toast.error("Review and confirm the metadata first");
      return;
    }
    setBusy("publish");
    try {
      const job = await api<BrowserPublish>("/browser/publish", {
        method: "POST",
        json: {
          video_id: videoId,
          browser_account_id: accountId,
          title,
          description,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          visibility,
          scheduled_at: scheduledAt ? fromLocalInput(scheduledAt) : null,
          confirm: true,
        },
      });
      toast.info("Publish started", "Katha verifies the signed-in identity, fills the real website and stops before the final publish for your confirmation.");
      setPublishOpen(false);
      setTab("jobs");
      await refresh();
      setLogJob(job);
    } catch (error) {
      toast.error("Could not start publishing", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const confirmJob = async (job: BrowserPublish) => {
    if (!window.confirm(`Confirm the final publish action for "${job.title}" on ${job.platform}?`)) return;
    setBusy(`job-${job.id}`);
    try {
      await api(`/browser/publishes/${job.id}/confirm`, { method: "POST", json: { confirm: true } });
      toast.success("Confirmation sent", "Katha is completing the real website action and will wait for the website's own confirmation.");
      await refresh();
    } catch (error) {
      toast.error("Could not confirm the job", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const cancelJob = async (job: BrowserPublish) => {
    setBusy(`job-${job.id}`);
    try {
      await api(`/browser/publishes/${job.id}/cancel`, { method: "POST" });
      toast.success("Publish cancelled", "Nothing was claimed as published.");
      await refresh();
    } catch (error) {
      toast.error("Could not cancel the job", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const retryJob = async (job: BrowserPublish) => {
    setBusy(`job-${job.id}`);
    try {
      await api(`/browser/publishes/${job.id}/retry`, { method: "POST" });
      toast.info("Retry started", "Katha will verify the account again before uploading.");
      await refresh();
    } catch (error) {
      toast.error("Could not retry the job", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="animate-float-in">
      <PageHeader
        eyebrow="Your accounts, your browser"
        title="Browser Accounts"
        description="Isolated Chromium profiles for YouTube and Instagram. You sign in manually on the official website; Katha never stores social passwords, cookies or tokens."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={14} />} loading={overview.loading} onClick={() => void refresh()}>
              Refresh
            </Button>
            <Button variant="secondary" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
              New profile
            </Button>
            <Button icon={<Upload size={14} />} onClick={() => openPublish()} disabled={!videoList.some((video) => video.has_video)}>
              Publish with browser
            </Button>
          </>
        }
      >
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "accounts", label: "Profiles", count: accounts.length },
            { id: "jobs", label: "Publish jobs", count: jobs.length },
          ]}
        />
      </PageHeader>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <MonitorSmartphone size={15} className="text-muted" />
            <p className="text-[11px] font-bold">Browser runtime</p>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
            {runtime?.automation_available
              ? `${runtime.browser.channel === "msedge" ? "Microsoft Edge" : "Google Chrome"} found. Persistent profiles are ready.`
              : "Automation is not available. Install Python Playwright and Google Chrome or Microsoft Edge."}
          </p>
          {runtime?.browser.path ? <p className="mt-1 truncate font-mono text-[9px] text-muted/60">{runtime.browser.path}</p> : null}
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-moss" />
            <p className="text-[11px] font-bold">Sign-in stays in Chromium</p>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
            Each profile is a separate user-data folder. Katha stores only a label, status and the detected account name.
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Lock size={15} className="text-clay" />
            <p className="text-[11px] font-bold">Explicit publish gate</p>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
            Katha fills the real upload form, then waits for your confirmation. Success is recorded only when the website
            itself confirms it.
          </p>
        </Card>
      </div>

      {!runtime?.automation_available ? (
        <div className="mb-4 flex items-start gap-2 rounded-2xl bg-peach/35 px-4 py-3 text-[11px] leading-relaxed text-[#8a5f48]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Browser automation is not available on this computer. You can still create and inspect profile folders, and
          publish manually. Install Playwright and Chrome/Edge to enable the guided browser flow.
        </div>
      ) : null}

      {tab === "accounts" ? (
        <div className="space-y-5">
          {(["youtube", "instagram"] as const).map((platformKey) => {
            const items = accounts.filter((account) => account.platform === platformKey);
            return (
              <div key={platformKey}>
                <div className="mb-2 flex items-center gap-2">
                  {platformKey === "youtube" ? <Youtube size={15} className="text-[#b56c6c]" /> : <Instagram size={15} className="text-[#c88f78]" />}
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted/70">
                    {platformKey === "youtube" ? "YouTube" : "Instagram"} · {items.length} profile{items.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      busy={busy.endsWith(`-${account.id}`)}
                      onOpen={() => void openAccount(account)}
                      onClose={() => void closeAccount(account)}
                      onTest={() => void testAccount(account)}
                      onRemove={() => void removeAccount(account)}
                      onPublish={() => openPublish(account)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setPlatform(platformKey);
                      setCreateOpen(true);
                    }}
                    className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-ink/12 bg-white/25 px-6 py-8 text-center transition hover:bg-white/45"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-ink/40 shadow-sm">
                      <Plus size={18} />
                    </span>
                    <p className="mt-3 text-[12px] font-bold">Add another {platformKey === "youtube" ? "YouTube" : "Instagram"} profile</p>
                    <p className="mt-1 max-w-[220px] text-[10.5px] leading-relaxed text-muted">
                      Each profile is isolated and signed in manually.
                    </p>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="p-5">
          <CardHeader
            title="Browser publish jobs"
            subtitle="The website must confirm the result. Katha never marks a job published on faith."
            icon={<Globe2 size={16} />}
            action={<Button size="sm" variant="secondary" icon={<RefreshCw size={12} />} onClick={() => void refresh()}>Refresh</Button>}
          />
          <div className="mt-4 space-y-2.5">
            {jobs.length === 0 ? (
              <EmptyState compact title="No browser publish jobs" message="Choose a video and a verified profile to start a guided upload." />
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="rounded-2xl border border-ink/[0.06] bg-white/45 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-bold">{job.title || job.video_title}</p>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {job.platform} · {job.account_label} · {formatDateTime(job.created_at)} · attempt {job.attempts}
                      </p>
                    </div>
                    <Badge tone={jobTone[job.status] || "neutral"} dot>
                      {statusLabel(job.status)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[10.5px] text-muted">{job.stage}</p>
                  {job.error ? <p className="mt-1 text-[10px] leading-relaxed text-[#9c5c63]">{job.error}</p> : null}
                  {job.remote_url ? (
                    <button
                      type="button"
                      className="mt-1 truncate text-left text-[10px] font-semibold text-slateblue hover:underline"
                      onClick={() => void bridge.openExternal(job.remote_url)}
                    >
                      {job.remote_url}
                    </button>
                  ) : null}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => setLogJob(job)}>
                      Log
                    </Button>
                    {job.screenshot_path ? (
                      <Button size="sm" variant="secondary" icon={<ExternalLink size={11} />} onClick={() => void bridge.openPath(job.screenshot_path || "")}>
                        Screenshot
                      </Button>
                    ) : null}
                    {job.status === "awaiting_confirmation" ? (
                      <Button size="sm" icon={<CircleCheck size={11} />} loading={busy === `job-${job.id}`} onClick={() => void confirmJob(job)}>
                        Confirm publish
                      </Button>
                    ) : null}
                    {ACTIVE.has(job.status) ? (
                      <Button size="sm" variant="ghost" icon={<Square size={10} />} loading={busy === `job-${job.id}`} onClick={() => void cancelJob(job)}>
                        Cancel
                      </Button>
                    ) : null}
                    {["failed", "cancelled", "manual_required"].includes(job.status) ? (
                      <Button size="sm" variant="secondary" icon={<RotateCcw size={11} />} loading={busy === `job-${job.id}`} onClick={() => void retryJob(job)}>
                        Retry
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New browser profile"
        description="A separate Chromium profile with its own sign-in session. You will sign in manually on the official website."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={busy === "create"} onClick={() => void createProfile()}>Create profile</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Platform">
            <Select value={platform} onChange={(event) => setPlatform(event.target.value as "youtube" | "instagram")}>
              <option value="youtube">YouTube</option>
              <option value="instagram">Instagram</option>
            </Select>
          </Field>
          <Field label="Label" hint="For example: Main Hindi channel, Shorts channel, Client A.">
            <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Main YouTube channel" />
          </Field>
          <div className="rounded-xl bg-powder/35 px-3 py-2 text-[10px] leading-relaxed text-[#5b7088]">
            Katha creates a dedicated user-data folder and restricts its Windows permissions to your local account. It
            never asks for or stores the social password.
          </div>
        </div>
      </Modal>

      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish with a real browser profile"
        description="Katha verifies the signed-in account, fills the real upload form, and stops before the final publish for your explicit confirmation."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>Cancel</Button>
            <Button loading={busy === "publish"} disabled={!reviewed || !accountId || !videoId} onClick={() => void startPublish()}>
              Start guided upload
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Video">
            <Select value={videoId || ""} onChange={(event) => selectVideo(Number(event.target.value) || null)}>
              <option value="">Choose a validated video</option>
              {videoList.filter((video) => video.has_video && !video.archived).map((video) => (
                <option key={video.id} value={video.id}>
                  {video.title} · {video.channel_name} {video.duration ? `· ${Math.round(video.duration)}s` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Verified browser account">
              <Select value={accountId || ""} onChange={(event) => setAccountId(Number(event.target.value) || null)}>
                <option value="">Choose a tested account</option>
                {publishAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label} {account.identity_verified ? `· ${account.detected_identity}` : "· not verified"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Visibility">
              <Select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}>
                <option value="private">Private</option>
                <option value="unlisted">Unlisted</option>
                <option value="public">Public</option>
              </Select>
            </Field>
          </div>
          <Field label="Title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} />
          </Field>
          <Field label="Description / caption">
            <Textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <Field label="Tags" hint="Comma-separated. YouTube only.">
            <Input value={tags} onChange={(event) => setTags(event.target.value)} />
          </Field>
          <Field label="Schedule (YouTube only)" hint="Leave empty to publish now after confirmation.">
            <Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
          </Field>
          <div className="flex items-start gap-3 rounded-xl bg-peach/30 px-3 py-2.5">
            <Toggle checked={reviewed} onChange={setReviewed} label="Confirm metadata review" />
            <p className="text-[10.5px] leading-relaxed text-[#8a5f48]">
              I reviewed the title, description, tags, thumbnail and visibility. Katha will still stop before the final
              platform action and ask me again.
            </p>
          </div>
          <div className="rounded-xl bg-white/60 px-3 py-2 text-[10px] leading-relaxed text-muted">
            <strong className="text-ink">Needs attention:</strong> CAPTCHA, 2FA and password prompts are completed by you
            in the visible browser. If the website changes or identity cannot be verified, Katha records a failure or
            manual-required state. Nothing is published silently.
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(logJob)}
        onClose={() => setLogJob(null)}
        title={logJob ? `Publish job #${logJob.id}` : "Publish job"}
        description={logJob ? `${logJob.stage} · ${logJob.status}` : ""}
        size="lg"
        footer={<Button onClick={() => setLogJob(null)}>Close</Button>}
      >
        {logJob ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={jobTone[logJob.status] || "neutral"} dot>{statusLabel(logJob.status)}</Badge>
              <Badge tone="neutral">{logJob.platform}</Badge>
              <Badge tone="neutral">{logJob.account_label}</Badge>
            </div>
            {logJob.error ? <p className="rounded-xl bg-rose/20 px-3 py-2 text-[10.5px] text-[#8f555b]">{logJob.error}</p> : null}
            <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl bg-ink/[0.04] p-3 font-mono text-[10px] leading-relaxed text-ink/65">
              {logJob.log || "No log yet."}
            </pre>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function AccountCard({
  account,
  busy,
  onOpen,
  onClose,
  onTest,
  onRemove,
  onPublish,
}: {
  account: BrowserAccount;
  busy: boolean;
  onOpen: () => void;
  onClose: () => void;
  onTest: () => void;
  onRemove: () => void;
  onPublish: () => void;
}) {
  const tone =
    account.identity_verified
      ? "sage"
      : account.status === "challenge" || account.status === "error"
        ? "rose"
        : account.browser_open
          ? "blue"
          : "neutral";
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-bold">{account.label}</p>
          <p className="mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted/60">
            {account.platform_label} · {account.slug}
          </p>
        </div>
        <Badge tone={tone} dot>{statusLabel(account.status)}</Badge>
      </div>
      <div className="mt-3 rounded-xl bg-white/55 px-2.5 py-2">
        <p className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-muted/60">Detected account</p>
        <p className="truncate text-[11px] font-semibold text-ink/70">{account.detected_identity || "Not verified yet"}</p>
      </div>
      {account.error ? <p className="mt-2 text-[10px] leading-relaxed text-[#9c5c63]">{account.error}</p> : null}
      <div className="mt-2 flex items-center justify-between text-[9.5px] text-muted/70">
        <span>{account.browser_open ? "Browser open" : "Browser closed"}</span>
        <span>{account.last_check_at ? `Checked ${formatDateTime(account.last_check_at)}` : "Never checked"}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {account.browser_open ? (
          <Button size="sm" variant="secondary" loading={busy} onClick={onClose}>Close browser</Button>
        ) : (
          <Button size="sm" loading={busy} onClick={onOpen}>Open & sign in</Button>
        )}
        <Button size="sm" variant="secondary" loading={busy} onClick={onTest}>Test account</Button>
        <Button size="sm" variant="ghost" icon={<Upload size={11} />} disabled={!account.identity_verified} onClick={onPublish}>
          Publish
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" icon={<FolderOpen size={11} />} onClick={() => void bridge.openPath(account.profile_dir)}>
          Profile folder
        </Button>
        <Button size="sm" variant="ghost" icon={<Trash2 size={11} />} onClick={onRemove}>
          Remove
        </Button>
      </div>
    </Card>
  );
}
