import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Film,
  Folder,
  FolderOpen,
  Layers,
  Loader2,
  Monitor,
  Package,
  Play,
  RefreshCw,
  Sparkles,
  Terminal,
  Wand2,
  AlertTriangle,
} from "lucide-react";
import { api, bridge } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/AppStore";
import type { AgentHandoff, AgentsPayload, Channel, ClaudeStatus, Project, ProjectSummary } from "@/lib/types";
import { cn, errorMessage, formatDate, statusLabel } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CopyButton,
  EmptyState,
  IconButton,
  Modal,
  Progress,
  StatusBadge,
  Tabs,
} from "@/components/ui";
import { useToast } from "@/components/Toast";

export function AnimationStudioPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const { channels, selectedChannelId, setSelectedChannelId, dataVersion, refreshChannels } = useAppStore();
  const [channelId, setChannelId] = useState<number | null>(
    searchParams.get("channel") ? Number(searchParams.get("channel")) : selectedChannelId,
  );
  const [launching, setLaunching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [promptProject, setPromptProject] = useState<ProjectSummary | null>(null);
  const [promptText, setPromptText] = useState("");
  const [handoffBusy, setHandoffBusy] = useState<number | null>(null);

  const claude = useFetch<ClaudeStatus>(() => api("/system/claude"), [dataVersion]);
  const agents = useFetch<AgentsPayload>(() => api("/agents"), [dataVersion]);
  const projects = useFetch<{ projects: ProjectSummary[] }>(
    () => api(`/projects?limit=200${channelId ? `&channel_id=${channelId}` : ""}`),
    [channelId, dataVersion],
  );

  useEffect(() => {
    if (!channelId && channels.length) setChannelId(channels[0].id);
  }, [channels, channelId]);

  const channel = channels.find((item) => item.id === channelId) || null;
  const channelProjects = projects.data?.projects || [];
  const ready = channelProjects.filter((project) =>
    ["READY_FOR_CLAUDE", "ANIMATION_IN_PROGRESS", "AWAITING_VOICE", "VOICE_READY"].includes(project.status),
  );
  const completed = channelProjects.filter((project) => project.status === "ANIMATION_COMPLETED");

  const openPath = async (path: string | null | undefined) => {
    if (!path) {
      toast.info("No folder yet", "Refresh the workspace or generate a package first.");
      return;
    }
    const result = await bridge.openPath(path);
    if (!result.ok) toast.error("Could not open the folder", result.error);
  };

  const launchClaudeCode = async () => {
    if (!channel?.animation_project_path) {
      toast.error("No animation workspace", "Refresh the channel workspace first.");
      return;
    }
    setLaunching(true);
    try {
      const result = await bridge.launchClaudeCode(
        channel.animation_project_path,
        agents.data?.settings.claude_path || "",
      );
      if (result.ok) toast.success("Claude Code opened", "Use the prepared production task inside the channel project.");
      else toast.error("Could not launch Claude Code", result.error);
    } finally {
      setLaunching(false);
    }
  };

  const startHandoff = async (project: ProjectSummary) => {
    const agent = agents.data?.selected_agent || "claude_code";
    setHandoffBusy(project.id);
    try {
      const mode = agent === "claude_code" ? "terminal" : "manual";
      const handoff = await api<AgentHandoff>("/agents/handoffs", {
        method: "POST",
        json: { project_id: project.id, agent, mode, confirm: true },
      });
      try {
        await api(`/agents/handoffs/${handoff.id}/launch`, { method: "POST", json: { mode } });
      } catch (launchError) {
        toast.error("Handoff prepared, but the agent did not open", errorMessage(launchError));
        navigate("/agents");
        return;
      }
      toast.success(
        `${handoff.agent_label} handoff started`,
        "The real project, package and production task are in the handoff folder. The episode is locked until you finish.",
      );
      navigate("/agents");
    } catch (error) {
      toast.error("Could not start the handoff", errorMessage(error));
    } finally {
      setHandoffBusy(null);
    }
  };

  const refreshWorkspace = async () => {
    if (!channel) return;
    setRefreshing(true);
    try {
      await api(`/channels/${channel.id}/workspace/refresh`, { method: "POST" });
      await refreshChannels();
      toast.success("Workspace refreshed", "Missing guide files and folders were recreated.");
    } catch (error) {
      toast.error("Could not refresh", errorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const rescan = async () => {
    setRescanning(true);
    try {
      const result = await api<{ imported: Array<{ title?: string; message: string }>; count: number }>("/videos/rescan", { method: "POST" });
      if (result.count) toast.success(`${result.count} video${result.count === 1 ? "" : "s"} imported`, "Validated with FFprobe and added to the library.");
      else toast.info("No new videos found", "The watch and output folders were scanned.");
    } catch (error) {
      toast.error("Scan failed", errorMessage(error));
    } finally {
      setRescanning(false);
    }
  };

  const showPrompt = async (project: ProjectSummary) => {
    setPromptProject(project);
    setPromptText("");
    try {
      if (!project.production_package_path) throw new Error("Generate the production package first.");
      const handoff = await api<{ package_path: string }>(`/projects/${project.id}/handoff`);
      const path = handoff.package_path;
      // The prompt text is read by the desktop bridge through the local backend media route.
      const detail = await api<Project>(`/projects/${project.id}`);
      setPromptText(
        [
          `Katha Studio handoff — ${detail.title}`,
          "",
          `Production package: ${path}`,
          `Permanent animation project: ${channel?.animation_project_path || ""}`,
          `Finished output folder: ${channel?.output_folder || ""}`,
          "",
          `Open the package's MASTER_ANIMATION_PROMPT.md and follow it exactly. Reuse existing channel assets.`,
          `Never invent dialogue audio. Render final videos into the output folder.`,
        ].join("\n"),
      );
    } catch (error) {
      setPromptText(`Could not prepare the handoff note: ${errorMessage(error)}`);
    }
  };

  return (
    <div className="animate-float-in">
      <PageHeader
        eyebrow="The handoff room"
        title="Animation Studio"
        description="Claude Code, Google Antigravity and manual production share one permanent animation project per channel. Each story gets a complete production package; each episode is locked to one agent at a time."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={14} />} loading={rescanning} onClick={() => void rescan()}>
              Scan output folders
            </Button>
            <Button variant="secondary" icon={<Layers size={14} />} onClick={() => navigate("/agents")}>
              Manage agents
            </Button>
            <Button icon={<Terminal size={14} />} loading={launching} onClick={() => void launchClaudeCode()}>
              Open Claude Code
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <DetectionCard
          icon={<Monitor size={17} />}
          title="Claude Desktop"
          ok={Boolean(claude.data?.desktop.installed)}
          value={claude.data?.desktop.installed ? (claude.data?.desktop.running ? "Installed · running" : "Installed") : "Not detected"}
          detail={claude.data?.desktop.path || "Install Claude Desktop from Anthropic if you prefer a desktop chat handoff."}
          action={
            <Button
              size="sm"
              variant="secondary"
              disabled={!claude.data?.desktop.installed}
              onClick={async () => {
                const result = await bridge.launchClaudeDesktop();
                if (result.ok) toast.success("Claude Desktop opened");
                else toast.error("Could not open Claude Desktop", result.error);
              }}
            >
              Launch
            </Button>
          }
        />
        <DetectionCard
          icon={<Terminal size={17} />}
          title="Claude Code CLI"
          ok={Boolean(claude.data?.cli.installed)}
          value={claude.data?.cli.version || (claude.data?.cli.installed ? "Installed" : "Not detected")}
          detail={claude.data?.cli.path || "Install the official Claude Code CLI and sign in yourself."}
          action={
            <Button size="sm" variant="secondary" disabled={!claude.data?.cli.installed} onClick={() => void launchClaudeCode()}>
              Open in folder
            </Button>
          }
        />
        <DetectionCard
          icon={<Layers size={17} />}
          title="Antigravity"
          ok={Boolean(agents.data?.agents.find((agent) => agent.agent === "antigravity")?.installed)}
          value={agents.data?.agents.find((agent) => agent.agent === "antigravity")?.installed ? "Installed" : "Not detected"}
          detail={agents.data?.agents.find((agent) => agent.agent === "antigravity")?.path || "Install Google Antigravity or use the manual handoff."}
          action={
            <Button
              size="sm"
              variant="secondary"
              disabled={!agents.data?.agents.find((agent) => agent.agent === "antigravity")?.installed}
              onClick={async () => {
                const result = await bridge.launchAgent({
                  agent: "antigravity",
                  folder: channel?.animation_project_path || "",
                  path: agents.data?.settings.antigravity_path || "",
                });
                if (result.ok) toast.success("Antigravity opened", "Open the prepared PRODUCTION_TASK.md in the handoff folder.");
                else toast.error("Could not open Antigravity", result.error);
              }}
            >
              Open
            </Button>
          }
        />
        <DetectionCard
          icon={<Layers size={17} />}
          title="Selected handoff agent"
          ok={Boolean(agents.data?.agents.find((agent) => agent.agent === agents.data?.selected_agent)?.installed)}
          value={agents.data?.agents.find((agent) => agent.agent === agents.data?.selected_agent)?.label || "Manual"}
          detail={
            agents.data?.active_locks.length
              ? `${agents.data.active_locks.length} active lock(s). A conflicting handoff is refused.`
              : "No active locks. The selected agent can start."
          }
          action={<Badge tone={agents.data?.active_locks.length ? "peach" : "sage"}>{agents.data?.active_locks.length ? "Locked" : "Ready"}</Badge>}
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <Card className="p-6">
            <CardHeader
              title="Permanent channel project"
              subtitle="One reusable animation world per channel"
              icon={<Folder size={16} />}
              action={
                <select
                  value={channelId || ""}
                  onChange={(event) => {
                    setChannelId(Number(event.target.value));
                    setSelectedChannelId(Number(event.target.value));
                  }}
                  className="field w-[180px] py-1.5 text-[11px]"
                >
                  {channels.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              }
            />
            {channel ? (
              <>
                <div className="mt-4 rounded-2xl bg-gradient-to-br from-lavender/40 via-parchment/60 to-sage/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-2xl text-[15px] font-bold text-white"
                        style={{ background: channel.accent_color }}
                      >
                        {channel.name.slice(0, 1)}
                      </div>
                      <div>
                        <p className="text-[13px] font-bold">{channel.name}</p>
                        <p className="text-[10px] text-muted">
                          {channel.language} · {channel.category}
                        </p>
                      </div>
                    </div>
                    <Badge tone={channel.animation_project_path ? "sage" : "rose"} dot>
                      {channel.animation_project_path ? "Workspace ready" : "Missing"}
                    </Badge>
                  </div>
                  <div className="mt-4 space-y-1.5">
                    <PathLine label="Animation project" path={channel.animation_project_path} onOpen={() => openPath(channel.animation_project_path)} />
                    <PathLine label="Finished outputs" path={channel.output_folder} onOpen={() => openPath(channel.output_folder)} />
                    <PathLine label="Watch folder" path={channel.watch_folder} onOpen={() => openPath(channel.watch_folder)} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={<FolderOpen size={13} />} onClick={() => openPath(channel.animation_project_path)}>
                    Open project
                  </Button>
                  <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} loading={refreshing} onClick={() => void refreshWorkspace()}>
                    Refresh files
                  </Button>
                  <Button size="sm" icon={<Terminal size={13} />} loading={launching} onClick={() => void launchClaudeCode()}>
                    Launch Claude Code here
                  </Button>
                </div>
                <div className="mt-4">
                  <p className="eyebrow">Project structure</p>
                  <div className="mt-2 rounded-xl bg-white/55 p-3 font-mono text-[9.5px] leading-[1.8] text-ink/55">
                    <p>CLAUDE.md</p>
                    <p>CHARACTER_BIBLE.md · VISUAL_STYLE_GUIDE.md</p>
                    <p>AUDIO_GUIDE.md · ASSET_MANIFEST.json</p>
                    <p>characters/ · backgrounds/ · props/ · effects/</p>
                    <p>templates/ · audio/ · episodes/&lt;story-slug&gt;/</p>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState compact title="No channel selected" message="Create a channel to prepare its permanent animation project." />
            )}
          </Card>

          <Card className="p-6">
            <CardHeader title="The honest handoff" subtitle="What Katha Studio does — and what you do" icon={<Wand2 size={16} />} />
            <ol className="mt-4 space-y-3">
              {[
                { title: "Approve & voice", text: "Finish the script and generate final dialogue audio." },
                { title: "Package", text: "Katha writes the complete production package with timelines, subtitles, audio and prompts." },
                { title: "Choose an agent", text: "Claude Code, Antigravity or manual production. All three read the same permanent project." },
                { title: "Start a locked handoff", text: "Katha prepares the real task and refuses a second agent on the same project or episode." },
                { title: "Render", text: "The agent builds the animation and saves the final video into the output folder, preferably READY." },
                { title: "Import", text: "Katha validates the new video with FFprobe and adds it to the library without deleting the original." },
              ].map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-[9px] font-bold text-ink/50">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-[11.5px] font-bold">{step.title}</p>
                    <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-xl bg-peach/35 px-3 py-2 text-[10px] leading-relaxed text-[#8a5f48]">
              Katha Studio cannot verify that Claude rendered a video until a real file appears in the watch folder and
              passes FFprobe validation. It never marks animation complete on faith.
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-6">
            <CardHeader
              title="Stories in the handoff queue"
              subtitle={`${ready.length} ready or waiting for voice · ${completed.length} animation complete`}
              icon={<Film size={16} />}
              action={
                <Button size="sm" variant="ghost" icon={<ArrowRight size={12} />} onClick={() => navigate("/scripts")}>
                  Script studio
                </Button>
              }
            />
            <div className="mt-4 space-y-2.5">
              {projects.loading ? (
                [1, 2].map((index) => <div key={index} className="skeleton h-24 rounded-2xl" />)
              ) : ready.length === 0 && completed.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Package size={20} />}
                  title="Nothing in the queue"
                  message="Approve a script and generate its production package. It will appear here with a real folder path."
                  action={
                    <Button size="sm" variant="secondary" onClick={() => navigate("/scripts")}>
                      Open scripts
                    </Button>
                  }
                />
              ) : (
                [...ready, ...completed].map((project) => (
                  <div key={project.id} className="rounded-2xl border border-ink/[0.06] bg-white/45 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold">{project.title}</p>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {project.channel_name} · {project.episode_count} part{project.episode_count === 1 ? "" : "s"} · updated {formatDate(project.updated_at)}
                        </p>
                      </div>
                      <StatusBadge status={project.status} />
                    </div>
                    <div className="mt-2 rounded-lg bg-white/60 px-2.5 py-1.5">
                      <p className="truncate font-mono text-[9px] text-ink/55">
                        {project.production_package_path || "No package yet"}
                      </p>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<FolderOpen size={11} />}
                        disabled={!project.production_package_path}
                        onClick={() => openPath(project.production_package_path)}
                      >
                        Package
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Sparkles size={11} />}
                        disabled={!project.production_package_path}
                        onClick={() => void showPrompt(project)}
                      >
                        Handoff note
                      </Button>
                      {project.production_package_path ? (
                        <Button
                          size="sm"
                          icon={<Play size={11} />}
                          loading={handoffBusy === project.id}
                          onClick={() => void startHandoff(project)}
                        >
                          Start with {agents.data?.agents.find((agent) => agent.agent === (agents.data?.selected_agent || "claude_code"))?.label || "agent"}
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => navigate(`/scripts?project=${project.id}`)}>
                          Finish package
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/scripts?project=${project.id}`)}>
                        Review script
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-6">
            <CardHeader title="Output inbox" subtitle="Videos Katha has genuinely detected and validated" icon={<Film size={16} />} />
            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-white/50 p-4">
              <div>
                <p className="text-[11.5px] font-bold">{channel?.output_folder || "No output folder configured"}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
                  New MP4, MOV, M4V or WebM files in the output root, READY, REVIEWED, PUBLISHED or FAILED are validated with
                  FFprobe, thumbnailed and imported. Duplicates are rejected by file path and originals are never deleted.
                </p>
              </div>
              <Button size="sm" variant="secondary" icon={<RefreshCw size={12} />} loading={rescanning} onClick={() => void rescan()}>
                Scan
              </Button>
            </div>
            <Button className="mt-3 w-full" size="sm" variant="ghost" icon={<ArrowRight size={12} />} onClick={() => navigate("/videos")}>
              Open video library
            </Button>
          </Card>

          {claude.data ? (
            <Card className="p-5">
              <p className="eyebrow">Claude sign-in & privacy</p>
              <p className="mt-2 text-[10.5px] leading-relaxed text-muted">{claude.data.cli.auth_note}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="neutral">Config folder {claude.data.cli.config_directory_exists ? "present" : "not found"}</Badge>
                <Badge tone="neutral">Settings {claude.data.cli.settings_exists ? "present" : "not found"}</Badge>
                <Badge tone="neutral">No credentials requested</Badge>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <Modal
        open={Boolean(promptProject)}
        onClose={() => setPromptProject(null)}
        title="Handoff note"
        description="A plain-language note you can keep beside the package. The authoritative instructions live in MASTER_ANIMATION_PROMPT.md."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPromptProject(null)}>
              Close
            </Button>
            {promptProject?.production_package_path ? (
              <Button
                variant="secondary"
                icon={<FolderOpen size={13} />}
                onClick={() => openPath(promptProject.production_package_path)}
              >
                Open package
              </Button>
            ) : null}
            <CopyButton value={promptText} label="Copy note" />
          </>
        }
      >
        <pre className="whitespace-pre-wrap rounded-xl bg-white/60 p-4 font-mono text-[10.5px] leading-relaxed text-ink/70">
          {promptText || "Preparing…"}
        </pre>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-powder/35 px-3 py-2 text-[10px] leading-relaxed text-[#5b7088]">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          This is not an automatic prompt injection. You decide what to share with Claude.
        </div>
      </Modal>
    </div>
  );
}

function DetectionCard({
  icon,
  title,
  ok,
  value,
  detail,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  ok: boolean;
  value: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", ok ? "bg-sage/60 text-moss" : "bg-ink/[0.05] text-ink/35")}>
            {icon}
          </span>
          <div>
            <p className="text-[11.5px] font-bold">{title}</p>
            <p className="flex items-center gap-1 text-[9.5px] font-semibold text-muted/70">
              <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-moss" : "bg-ink/20")} />
              {value}
            </p>
          </div>
        </div>
        {action}
      </div>
      <p className="mt-2.5 truncate font-mono text-[9px] text-muted/60" title={detail}>
        {detail}
      </p>
    </Card>
  );
}

function PathLine({ label, path, onOpen }: { label: string; path: string | null | undefined; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/55 px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-muted/60">{label}</p>
        <p className="truncate font-mono text-[9px] text-ink/60">{path || "Not configured"}</p>
      </div>
      <IconButton label="Open folder" onClick={onOpen} disabled={!path}>
        <ExternalLink size={11} />
      </IconButton>
    </div>
  );
}
