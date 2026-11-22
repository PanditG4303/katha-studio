import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  ClipboardCheck,
  FolderOpen,
  Layers,
  LockKeyhole,
  PackageCheck,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Unplug,
  Upload,
} from "lucide-react";
import { api, bridge } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/AppStore";
import type {
  AgentHandoff,
  AgentInfo,
  AgentLock,
  AgentsPayload,
  McpServer,
  Project,
  ProjectSummary,
  Skill,
} from "@/lib/types";
import { cn, errorMessage, formatDateTime } from "@/lib/utils";
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
} from "@/components/ui";
import { useToast } from "@/components/Toast";

type Tab = "agents" | "skills" | "mcp" | "activity";

const agentTone: Record<string, "lavender" | "blue" | "sage"> = {
  claude_code: "lavender",
  antigravity: "blue",
  manual: "sage",
};

const handoffTone: Record<string, "sage" | "blue" | "peach" | "rose" | "neutral" | "lavender"> = {
  prepared: "neutral",
  launched: "blue",
  running: "lavender",
  completed: "sage",
  failed: "rose",
  cancelled: "neutral",
};

export function AnimationAgentsPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { channels, selectedChannelId, setSelectedChannelId, dataVersion } = useAppStore();
  const [tab, setTab] = useState<Tab>(() => {
    const value = searchParams.get("tab");
    return value === "skills" || value === "mcp" || value === "activity" ? value : "agents";
  });

  const changeTab = (value: Tab) => {
    setTab(value);
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    setSearchParams(next, { replace: true });
  };
  const [channelId, setChannelId] = useState<number | null>(selectedChannelId);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState("");
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [episodeId, setEpisodeId] = useState<number | null>(null);
  const [mode, setMode] = useState<"prepare" | "terminal" | "headless" | "manual">("prepare");
  const [projectDetail, setProjectDetail] = useState<Project | null>(null);
  const [skillDetail, setSkillDetail] = useState<Skill | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importPath, setImportPath] = useState("");
  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpForm, setMcpForm] = useState({
    name: "",
    transport: "stdio",
    command: "",
    args: "",
    url: "",
    env_keys: "",
    target_agent: "claude_code",
  });
  const [pathDraft, setPathDraft] = useState({ claude_path: "", antigravity_path: "" });

  const agents = useFetch<AgentsPayload>(() => api("/agents"), [dataVersion, version]);
  const skills = useFetch<{ skills: Skill[]; library_path: string }>(() => api("/skills"), [dataVersion, version]);
  const mcp = useFetch<{ servers: McpServer[] }>(
    () => api(`/mcp${channelId ? `?channel_id=${channelId}` : ""}`),
    [channelId, dataVersion, version],
  );
  const projects = useFetch<{ projects: ProjectSummary[] }>(
    () => api(`/projects?limit=200${channelId ? `&channel_id=${channelId}` : ""}`),
    [channelId, dataVersion],
  );

  useEffect(() => {
    if (!channelId && channels.length) setChannelId(channels[0].id);
  }, [channels, channelId]);

  useEffect(() => {
    if (agents.data?.settings) {
      setPathDraft({
        claude_path: agents.data.settings.claude_path || "",
        antigravity_path: agents.data.settings.antigravity_path || "",
      });
    }
  }, [agents.data?.settings]);

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectDetail(null);
      return;
    }
    let cancelled = false;
    void api<Project>(`/projects/${selectedProjectId}`)
      .then((detail) => {
        if (!cancelled) setProjectDetail(detail);
      })
      .catch(() => {
        if (!cancelled) setProjectDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const channel = channels.find((item) => item.id === channelId) || null;
  const selectedAgent = agents.data?.selected_agent || "claude_code";
  const currentAgent = agents.data?.agents.find((item) => item.agent === selectedAgent) || null;
  const projectList = projects.data?.projects || [];
  const locks = agents.data?.active_locks || [];
  const handoffs = agents.data?.recent_handoffs || [];

  const refresh = async () => {
    setVersion((value) => value + 1);
    await Promise.all([agents.reload(true), skills.reload(true), mcp.reload(true), projects.reload(true)]);
  };

  const saveSettings = async (values: Record<string, unknown>, message = "Agent settings saved") => {
    setBusy("settings");
    try {
      await api("/agents/settings", { method: "PATCH", json: values });
      await agents.reload(true);
      toast.success(message);
    } catch (error) {
      toast.error("Could not save agent settings", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const startHandoff = async () => {
    if (!selectedProjectId) {
      toast.error("Choose a story", "Select the project that the agent should animate.");
      return;
    }
    setBusy("handoff");
    try {
      const handoff = await api<AgentHandoff>("/agents/handoffs", {
        method: "POST",
        json: {
          project_id: selectedProjectId,
          episode_id: episodeId || null,
          agent: selectedAgent,
          mode,
          confirm: true,
        },
      });
      if (mode !== "prepare") {
        try {
          await api(`/agents/handoffs/${handoff.id}/launch`, {
            method: "POST",
            json: { mode: mode === "manual" ? "manual" : mode },
          });
        } catch (error) {
          toast.error("Handoff prepared, but the agent did not open", errorMessage(error));
        }
      }
      toast.success(
        mode === "prepare" ? "Handoff prepared" : "Handoff prepared and agent opened",
        mode === "headless"
          ? "Claude Code is running in the background. Watch the handoff activity for captured output."
          : "The real project, package and prompt are in the handoff folder. The lock is held until you finish.",
      );
      setHandoffOpen(false);
      setEpisodeId(null);
      await refresh();
    } catch (error) {
      toast.error("Could not prepare the handoff", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const handoffAction = async (handoff: AgentHandoff, action: "launch" | "complete" | "cancel") => {
    setBusy(`handoff-${handoff.id}-${action}`);
    try {
      await api(`/agents/handoffs/${handoff.id}/${action}`, {
        method: "POST",
        json: action === "launch" ? { mode: handoff.mode === "prepare" ? "terminal" : handoff.mode } : {},
      });
      toast.success(
        action === "launch" ? "Agent launched" : action === "complete" ? "Handoff completed" : "Handoff cancelled",
      );
      await refresh();
    } catch (error) {
      toast.error(`Could not ${action} the handoff`, errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const releaseLock = async (lock: AgentLock) => {
    if (!window.confirm(`Release the lock held by ${lock.agent_label}? Only do this if that agent has stopped working.`)) return;
    setBusy(`lock-${lock.id}`);
    try {
      await api(`/agents/locks/${lock.id}/release`, { method: "POST" });
      toast.success("Lock released");
      await refresh();
    } catch (error) {
      toast.error("Could not release the lock", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const approveSkill = async (skill: Skill, approved: boolean) => {
    setBusy(`skill-${skill.id}`);
    try {
      await api(`/skills/${skill.id}/approve`, { method: "POST", json: { approved } });
      toast.success(approved ? "Skill approved" : "Skill approval removed");
      await refresh();
    } catch (error) {
      toast.error("Could not update the skill", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const installSkill = async (skill: Skill) => {
    if (!channelId) {
      toast.error("Choose a channel", "Skills install into a channel's permanent animation project.");
      return;
    }
    setBusy(`skill-${skill.id}`);
    try {
      const result = await api<{ installed_agents: string[]; note: string }>(`/skills/${skill.id}/install`, {
        method: "POST",
        json: { channel_id: channelId, agents: ["claude_code", "antigravity", "manual"] },
      });
      toast.success("Skill installed", `${result.installed_agents.join(", ")} · ${result.note}`);
      await refresh();
    } catch (error) {
      toast.error("Could not install the skill", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const uninstallSkill = async (skill: Skill) => {
    if (!channelId) return;
    setBusy(`skill-${skill.id}`);
    try {
      await api(`/skills/${skill.id}/uninstall?channel_id=${channelId}`, { method: "POST" });
      toast.success("Skill removed from this channel project");
      await refresh();
    } catch (error) {
      toast.error("Could not remove the skill", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const inspectSkill = async (skill: Skill) => {
    setBusy(`skill-${skill.id}`);
    try {
      const detail = await api<Skill>(`/skills/${skill.id}`);
      setSkillDetail(detail);
    } catch (error) {
      toast.error("Could not inspect the skill", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const importSkill = async () => {
    if (!importPath.trim()) return;
    setBusy("import");
    try {
      await api("/skills/import", { method: "POST", json: { path: importPath.trim() } });
      toast.success("Skill imported for review", "Read its files and warnings, then approve it before installing.");
      setImportOpen(false);
      setImportPath("");
      await refresh();
    } catch (error) {
      toast.error("Could not import the skill", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const addMcp = async () => {
    if (!mcpForm.name.trim()) {
      toast.error("Give the MCP server a name");
      return;
    }
    setBusy("mcp");
    try {
      const result = await api<{ written: string[]; manual_instructions: string }>("/mcp", {
        method: "POST",
        json: {
          name: mcpForm.name.trim(),
          transport: mcpForm.transport,
          command: mcpForm.command.trim(),
          args: mcpForm.args.split(/\s+/).filter(Boolean),
          url: mcpForm.url.trim(),
          env_keys: mcpForm.env_keys.split(",").map((item) => item.trim()).filter(Boolean),
          target_agent: mcpForm.target_agent,
          channel_id: channelId,
          write_to_project: true,
        },
      });
      toast.success(
        result.written.length ? "MCP server configured" : "MCP server saved",
        result.written.length ? result.written.join(", ") : result.manual_instructions,
      );
      setMcpOpen(false);
      await refresh();
    } catch (error) {
      toast.error("Could not add the MCP server", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const deleteMcp = async (server: McpServer) => {
    if (!window.confirm(`Remove ${server.name} from Katha's MCP list? The agent's own config file is not deleted.`)) return;
    setBusy(`mcp-${server.id}`);
    try {
      await api(`/mcp/${server.id}`, { method: "DELETE" });
      toast.success("MCP server removed from the list");
      await refresh();
    } catch (error) {
      toast.error("Could not remove the MCP server", errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const tabCounts = useMemo(
    () => ({
      agents: agents.data?.agents.length || 0,
      skills: skills.data?.skills.length || 0,
      mcp: mcp.data?.servers.length || 0,
      activity: handoffs.length,
    }),
    [agents.data, skills.data, mcp.data, handoffs.length],
  );

  return (
    <div className="animate-float-in">
      <PageHeader
        eyebrow="One project, three ways to animate"
        title="Animation Agents"
        description="Claude Code, Google Antigravity and manual production share the same permanent channel project, assets and episode files. Katha Studio enforces one agent per episode at a time."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={14} />} loading={agents.loading} onClick={() => void refresh()}>
              Refresh
            </Button>
            <Button icon={<Sparkles size={14} />} onClick={() => setHandoffOpen(true)}>
              New handoff
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={tab}
            onChange={changeTab}
            tabs={[
              { id: "agents", label: "Agents", count: tabCounts.agents },
              { id: "skills", label: "Skills", count: tabCounts.skills },
              { id: "mcp", label: "MCP", count: tabCounts.mcp },
              { id: "activity", label: "Handoffs & locks", count: tabCounts.activity },
            ]}
          />
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted/60">Channel project</span>
            <Select
              value={channelId || ""}
              onChange={(event) => {
                setChannelId(Number(event.target.value));
                setSelectedChannelId(Number(event.target.value));
              }}
              className="w-[190px] py-1.5 text-[11px]"
            >
              {channels.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </PageHeader>

      {agents.error ? (
        <Card className="mb-4 border-rose/40 bg-rose/15 p-4 text-[11.5px] text-[#8f555b]">{agents.error}</Card>
      ) : null}

      {tab === "agents" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {(agents.data?.agents || []).map((agent) => (
            <AgentCard
              key={agent.agent}
              agent={agent}
              selected={agent.agent === selectedAgent}
              busy={busy === "settings"}
              onSelect={() => void saveSettings({ selected_agent: agent.agent }, `${agent.label} selected`)}
              onLaunch={async () => {
                const result = await bridge.launchAgent({
                  agent: agent.agent,
                  folder: channel?.animation_project_path || "",
                  path:
                    agent.agent === "antigravity"
                      ? agents.data?.settings.antigravity_path || ""
                      : agent.agent === "claude_code"
                        ? agents.data?.settings.claude_path || ""
                        : "",
                });
                if (result.ok) toast.success(`${agent.label} opened`, "Use the prepared handoff task in the project folder.");
                else toast.error(`Could not open ${agent.label}`, result.error);
              }}
            />
          ))}

          <Card className="p-5 lg:col-span-2">
            <CardHeader
              title="Shared permanent project"
              subtitle="Every agent reads the same instructions and assets. Only the handoff prompt and app are agent-specific."
              icon={<Layers size={16} />}
              action={currentAgent ? <Badge tone={agentTone[currentAgent.agent] || "neutral"} dot>{currentAgent.label}</Badge> : null}
            />
            {channel ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <PathRow label="Animation project" path={channel.animation_project_path} />
                <PathRow label="Output folder" path={channel.output_folder} />
                <PathRow label="READY" path={channel.output_folder ? `${channel.output_folder}\\READY` : null} />
                <PathRow label="REVIEWED" path={channel.output_folder ? `${channel.output_folder}\\REVIEWED` : null} />
                <PathRow label="PUBLISHED" path={channel.output_folder ? `${channel.output_folder}\\PUBLISHED` : null} />
                <PathRow label="FAILED" path={channel.output_folder ? `${channel.output_folder}\\FAILED` : null} />
              </div>
            ) : (
              <EmptyState compact title="No channel" message="Create a channel to prepare its permanent animation project." />
            )}
            <div className="mt-4 rounded-xl bg-powder/35 px-3 py-2.5 text-[10.5px] leading-relaxed text-[#5b7088]">
              <strong>Locking:</strong> a project or episode lock is stored in Katha's database and in
              <code className="mx-1 rounded bg-white/60 px-1">.katha/LOCK.json</code>
              inside the project. A second agent is refused before any file is written.
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Detection & paths" subtitle="Advanced" icon={<Terminal size={16} />} />
            <div className="mt-4 space-y-3">
              <Field label="Claude Code CLI path" hint="Leave empty to auto-detect the official CLI.">
                <Input
                  value={pathDraft.claude_path}
                  placeholder="C:\\Users\\you\\.local\\bin\\claude.exe"
                  onChange={(event) => setPathDraft((value) => ({ ...value, claude_path: event.target.value }))}
                />
              </Field>
              <Field label="Antigravity application path" hint="Leave empty to auto-detect Antigravity.exe.">
                <Input
                  value={pathDraft.antigravity_path}
                  placeholder="C:\\Users\\you\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe"
                  onChange={(event) => setPathDraft((value) => ({ ...value, antigravity_path: event.target.value }))}
                />
              </Field>
              <Field label="Claude permission mode" hint="Used only for headless Claude Code runs.">
                <Select
                  value={agents.data?.settings.permission_mode || "acceptEdits"}
                  onChange={(event) => void saveSettings({ permission_mode: event.target.value })}
                >
                  {(agents.data?.permission_modes || ["default", "acceptEdits", "plan"]).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button size="sm" variant="secondary" loading={busy === "settings"} onClick={() => void saveSettings(pathDraft, "Detection paths saved")}>
                Save paths
              </Button>
            </div>
          </Card>

          <Card className="p-5 lg:col-span-3">
            <CardHeader
              title="What each agent can really do"
              subtitle="No invented APIs. Claude Code uses its official CLI; Antigravity opens the real project folder."
              icon={<ShieldCheck size={16} />}
            />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <LimitColumn
                title="Claude Code"
                tone="lavender"
                items={[
                  "Official `claude` CLI only",
                  "Interactive terminal with the real task",
                  "Optional headless run with captured stdout",
                  "Uses your existing Claude sign-in",
                ]}
              />
              <LimitColumn
                title="Antigravity"
                tone="blue"
                items={[
                  "Opens the real permanent project folder",
                  "Prepared PRODUCTION_TASK.md in the handoff",
                  "No private prompt injection",
                  "Uses your Antigravity sign-in",
                ]}
              />
              <LimitColumn
                title="Manual"
                tone="sage"
                items={[
                  "Complete folder and prompt handoff",
                  "Works with any animation tool",
                  "Same project, assets and locks",
                  "Katha imports only a real finished file",
                ]}
              />
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "skills" ? (
        <div className="space-y-4">
          <Card className="p-5">
            <CardHeader
              title="Shared skill library"
              subtitle={skills.data?.library_path || "Review skills before they are copied into a channel project."}
              icon={<Sparkles size={16} />}
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" icon={<RefreshCw size={12} />} onClick={() => void refresh()}>
                    Refresh
                  </Button>
                  <Button size="sm" icon={<Upload size={12} />} onClick={() => setImportOpen(true)}>
                    Import skill
                  </Button>
                </div>
              }
            />
            <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
              Katha inspects SKILL.md, scripts, dependencies and permission hints. Imported skills stay unapproved until
              you review them. Installation copies the skill into <code>.claude/skills</code>, <code>.agent/skills</code> and
              the shared <code>.katha/skills</code> folder of the selected channel project. Secrets are never passed to a skill.
            </p>
          </Card>

          {(skills.data?.skills || []).length === 0 ? (
            <EmptyState
              icon={<Sparkles size={22} />}
              title="No skills yet"
              message="Built-in storytelling, animation and editing skills appear here on first launch. You can also import a SKILL.md folder."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(skills.data?.skills || []).map((skill) => (
                <Card key={skill.id} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-bold">{skill.name}</p>
                      <p className="mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted/60">
                        v{skill.version} · {skill.source}
                      </p>
                    </div>
                    <Badge tone={skill.status === "installed" ? "sage" : skill.approved ? "blue" : "peach"} dot>
                      {skill.status === "installed" ? "Installed" : skill.approved ? "Approved" : "Review"}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-muted">{skill.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(skill.installed_agents || []).map((agent) => (
                      <Badge key={agent} tone="neutral">
                        {agent.replace("_", " ")}
                      </Badge>
                    ))}
                    {(skill.permissions || []).slice(0, 2).map((permission) => (
                      <Badge key={permission} tone="neutral">
                        {permission}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                    <Button size="sm" variant="ghost" onClick={() => void inspectSkill(skill)}>
                      Inspect
                    </Button>
                    {!skill.approved ? (
                      <Button size="sm" variant="secondary" loading={busy === `skill-${skill.id}`} onClick={() => void approveSkill(skill, true)}>
                        Approve
                      </Button>
                    ) : null}
                    {skill.approved && !skill.installed_agents?.length ? (
                      <Button size="sm" loading={busy === `skill-${skill.id}`} onClick={() => void installSkill(skill)}>
                        Install
                      </Button>
                    ) : null}
                    {skill.installed_agents?.length ? (
                      <Button size="sm" variant="secondary" loading={busy === `skill-${skill.id}`} onClick={() => void uninstallSkill(skill)}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "mcp" ? (
        <div className="space-y-4">
          <Card className="p-5">
            <CardHeader
              title="MCP servers"
              subtitle="Katha reads definitions and environment variable names only. Secret values stay in each agent's own config."
              icon={<Server size={16} />}
              action={
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<RefreshCw size={12} />}
                    onClick={async () => {
                      try {
                        await api(`/mcp/refresh${channelId ? `?channel_id=${channelId}` : ""}`, { method: "POST" });
                        await refresh();
                        toast.success("MCP configuration rescanned");
                      } catch (error) {
                        toast.error("Could not rescan MCP", errorMessage(error));
                      }
                    }}
                  >
                    Rescan
                  </Button>
                  <Button size="sm" icon={<Plus size={12} />} onClick={() => setMcpOpen(true)}>
                    Add server
                  </Button>
                </div>
              }
            />
          </Card>
          {(mcp.data?.servers || []).length === 0 ? (
            <EmptyState
              icon={<Server size={22} />}
              title="No MCP servers found"
              message="Add a server here, or configure one in Claude Code/Antigravity and press Rescan. Katha never reads secret values."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {(mcp.data?.servers || []).map((server) => (
                <Card key={server.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-bold">{server.name}</p>
                      <p className="mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted/60">
                        {server.transport} · {server.agents.join(", ")}
                      </p>
                    </div>
                    <Badge tone={server.status === "configured" ? "sage" : server.status === "manual_required" ? "peach" : "rose"} dot>
                      {server.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1 rounded-xl bg-white/55 p-2.5 font-mono text-[9.5px] leading-relaxed text-ink/60">
                    {server.command ? <p>command: {server.command}</p> : null}
                    {server.url ? <p>url: {server.url}</p> : null}
                    {server.args.length ? <p>args: {server.args.join(" ")}</p> : null}
                    {server.env_keys.length ? <p>env names: {server.env_keys.join(", ")}</p> : null}
                    {server.source_path ? <p className="truncate">config: {server.source_path}</p> : null}
                  </div>
                  {server.error ? <p className="mt-2 text-[10px] text-[#9c5c63]">{server.error}</p> : null}
                  <p className="mt-2 text-[10px] leading-relaxed text-muted">{server.note}</p>
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} loading={busy === `mcp-${server.id}`} onClick={() => void deleteMcp(server)}>
                      Remove from list
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "activity" ? (
        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <Card className="p-5">
            <CardHeader
              title="Handoffs"
              subtitle="Real agent runs and prepared folders. Output is captured only for headless Claude Code."
              icon={<ClipboardCheck size={16} />}
            />
            <div className="mt-4 space-y-2.5">
              {handoffs.length === 0 ? (
                <EmptyState compact title="No handoffs yet" message="Prepare a handoff for a project with a production package." />
              ) : (
                handoffs.map((handoff) => (
                  <div key={handoff.id} className="rounded-2xl border border-ink/[0.06] bg-white/45 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-bold">
                          #{handoff.id} · {handoff.project_title}
                          {handoff.episode_title ? ` · ${handoff.episode_title}` : ""}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {handoff.agent_label} · {handoff.mode} · {formatDateTime(handoff.created_at)}
                        </p>
                      </div>
                      <Badge tone={handoffTone[handoff.status] || "neutral"} dot>
                        {handoff.status}
                      </Badge>
                    </div>
                    <div className="mt-2 rounded-lg bg-white/60 px-2.5 py-1.5">
                      <p className="truncate font-mono text-[9px] text-ink/55">{handoff.working_dir}</p>
                      <p className="truncate font-mono text-[9px] text-ink/45">{handoff.prompt_path}</p>
                    </div>
                    {handoff.error ? <p className="mt-2 text-[10px] leading-relaxed text-[#9c5c63]">{handoff.error}</p> : null}
                    {handoff.output_tail ? (
                      <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-ink/[0.04] p-2 font-mono text-[9px] leading-relaxed text-ink/55">
                        {handoff.output_tail}
                      </pre>
                    ) : null}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {handoff.prompt_path ? (
                        <Button size="sm" variant="secondary" icon={<FolderOpen size={11} />} onClick={() => void bridge.showItem(handoff.prompt_path)}>
                          Task file
                        </Button>
                      ) : null}
                      <Button size="sm" variant="secondary" icon={<FolderOpen size={11} />} onClick={() => void bridge.openPath(handoff.working_dir)}>
                        Project
                      </Button>
                      {["prepared", "launched", "running"].includes(handoff.status) ? (
                        <>
                          {handoff.agent === "claude_code" && handoff.status !== "running" ? (
                            <Button size="sm" loading={busy === `handoff-${handoff.id}-launch`} onClick={() => void handoffAction(handoff, "launch")}>
                              Launch
                            </Button>
                          ) : null}
                          <Button size="sm" variant="secondary" icon={<Check size={11} />} loading={busy === `handoff-${handoff.id}-complete`} onClick={() => void handoffAction(handoff, "complete")}>
                            Mark complete
                          </Button>
                          <Button size="sm" variant="ghost" icon={<Unplug size={11} />} loading={busy === `handoff-${handoff.id}-cancel`} onClick={() => void handoffAction(handoff, "cancel")}>
                            Cancel
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Active locks" subtitle="One agent per project or episode" icon={<LockKeyhole size={16} />} />
            <div className="mt-4 space-y-2">
              {locks.length === 0 ? (
                <div className="rounded-xl bg-sage/30 px-3 py-3 text-[11px] font-semibold text-[#50694f]">
                  No active locks. Any agent can start.
                </div>
              ) : (
                locks.map((lock) => (
                  <div key={lock.id} className="rounded-xl border border-ink/[0.06] bg-white/55 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11.5px] font-bold">{lock.agent_label}</p>
                        <p className="text-[9.5px] text-muted">
                          {lock.scope} · since {formatDateTime(lock.acquired_at)}
                        </p>
                      </div>
                      <Badge tone="peach" dot>
                        Locked
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-[10px] leading-relaxed text-muted">{lock.note}</p>
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="secondary"
                      icon={<Unplug size={11} />}
                      loading={busy === `lock-${lock.id}`}
                      onClick={() => void releaseLock(lock)}
                    >
                      Release lock
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : null}

      <Modal
        open={handoffOpen}
        onClose={() => setHandoffOpen(false)}
        title="Prepare an agent handoff"
        description="The agent receives the real permanent project, production package and a complete production task. A project or episode lock prevents conflicts."
        footer={
          <>
            <Button variant="ghost" onClick={() => setHandoffOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy === "handoff"} onClick={() => void startHandoff()}>
              Prepare handoff
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Agent">
            <Select
              value={selectedAgent}
              onChange={(event) => void saveSettings({ selected_agent: event.target.value })}
            >
              {(agents.data?.agents || []).map((agent) => (
                <option key={agent.agent} value={agent.agent}>
                  {agent.label} {agent.installed ? "" : "(not detected)"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Story / project">
            <Select
              value={selectedProjectId || ""}
              onChange={(event) => {
                setSelectedProjectId(Number(event.target.value) || null);
                setEpisodeId(null);
              }}
            >
              <option value="">Choose a project with a production package</option>
              {projectList.map((project) => (
                <option key={project.id} value={project.id} disabled={!project.production_package_path}>
                  {project.title} {project.production_package_path ? "" : "(no package)"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Episode (optional)" hint="Leave empty to hand off the whole project.">
            <Select value={episodeId || ""} onChange={(event) => setEpisodeId(Number(event.target.value) || null)}>
              <option value="">Whole project</option>
              {(projectDetail?.episodes || []).map((episode) => (
                <option key={episode.id} value={episode.id}>
                  Part {episode.episode_number}: {episode.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How to open the agent">
            <Select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="prepare">Prepare only — I will open it myself</option>
              {selectedAgent === "claude_code" ? (
                <>
                  <option value="terminal">Open Claude Code in a terminal with the task</option>
                  <option value="headless">Run Claude Code headless and capture output</option>
                </>
              ) : null}
              {selectedAgent === "antigravity" ? <option value="manual">Open Antigravity with the project folder</option> : null}
              {selectedAgent === "manual" ? <option value="manual">Open the project folder</option> : null}
            </Select>
          </Field>
          {locks.length ? (
            <div className="flex items-start gap-2 rounded-xl bg-peach/35 px-3 py-2 text-[10px] leading-relaxed text-[#8a5f48]">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {locks.length} active lock{locks.length === 1 ? "" : "s"}. Katha will refuse a conflicting handoff instead of
              overwriting active files.
            </div>
          ) : null}
          <div className="rounded-xl bg-white/60 px-3 py-2 text-[10px] leading-relaxed text-muted">
            <strong className="text-ink">Selected:</strong> {currentAgent?.label || selectedAgent}.{" "}
            {currentAgent?.installed ? "Detected on this computer." : "Not detected; the prepared handoff still works manually."}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(skillDetail)}
        onClose={() => setSkillDetail(null)}
        title={skillDetail?.name || "Skill"}
        description="Review every file, script, dependency and permission hint before approving."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSkillDetail(null)}>
              Close
            </Button>
            {skillDetail ? (
              <>
                <Button variant="secondary" onClick={() => void approveSkill(skillDetail, !skillDetail.approved)}>
                  {skillDetail.approved ? "Remove approval" : "Approve skill"}
                </Button>
                <Button onClick={() => void installSkill(skillDetail)} disabled={!skillDetail.approved}>
                  Install in {channel?.name || "channel"}
                </Button>
              </>
            ) : null}
          </>
        }
      >
        {skillDetail ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={skillDetail.approved ? "sage" : "peach"} dot>
                {skillDetail.approved ? "Approved" : "Needs review"}
              </Badge>
              <Badge tone="neutral">{skillDetail.inspection?.files.length || 0} files</Badge>
              {skillDetail.inspection?.has_scripts ? <Badge tone="rose">Contains scripts</Badge> : null}
            </div>
            {(skillDetail.inspection?.warnings || []).length ? (
              <div className="rounded-xl bg-rose/20 px-3 py-2 text-[10.5px] leading-relaxed text-[#8f555b]">
                <p className="font-bold">Review warnings</p>
                <ul className="mt-1 list-disc pl-4">
                  {skillDetail.inspection?.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-xl bg-sage/30 px-3 py-2 text-[10.5px] text-[#50694f]">
                No obvious dangerous patterns were found. This is a review aid, not a security guarantee.
              </div>
            )}
            {(skillDetail.inspection?.dependencies || []).length ? (
              <div>
                <p className="eyebrow">Dependencies</p>
                <p className="mt-1 font-mono text-[10px] leading-relaxed text-ink/60">
                  {skillDetail.inspection?.dependencies.join(" · ")}
                </p>
              </div>
            ) : null}
            <div>
              <p className="eyebrow">Files</p>
              <div className="mt-1 max-h-28 overflow-auto rounded-xl bg-white/60 p-2 font-mono text-[9.5px] leading-relaxed text-ink/60">
                {(skillDetail.inspection?.files || []).map((file) => (
                  <p key={file.path}>
                    {file.path} · {file.size} bytes
                  </p>
                ))}
              </div>
            </div>
            <div>
              <p className="eyebrow">SKILL.md</p>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-white/60 p-3 font-mono text-[10px] leading-relaxed text-ink/65">
                {skillDetail.inspection?.content || "No content available."}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import a skill"
        description="Choose a folder that contains SKILL.md. Katha copies it into the shared library and marks it for review."
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy === "import"} onClick={() => void importSkill()}>
              Import for review
            </Button>
          </>
        }
      >
        <Field label="Skill folder" hint="The original folder is not modified.">
          <div className="flex gap-2">
            <Input value={importPath} placeholder="C:\\path\\to\\my-skill" onChange={(event) => setImportPath(event.target.value)} />
            <Button
              variant="secondary"
              onClick={async () => {
                const folder = await bridge.pickFolder("Choose a skill folder containing SKILL.md");
                if (folder) setImportPath(folder);
              }}
            >
              Browse
            </Button>
          </div>
        </Field>
      </Modal>

      <Modal
        open={mcpOpen}
        onClose={() => setMcpOpen(false)}
        title="Add an MCP server"
        description="Katha records the definition and environment variable names. It never asks for or stores secret values."
        footer={
          <>
            <Button variant="ghost" onClick={() => setMcpOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy === "mcp"} onClick={() => void addMcp()}>
              Add server
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={mcpForm.name} onChange={(event) => setMcpForm((value) => ({ ...value, name: event.target.value }))} />
            </Field>
            <Field label="Agent">
              <Select value={mcpForm.target_agent} onChange={(event) => setMcpForm((value) => ({ ...value, target_agent: event.target.value }))}>
                <option value="claude_code">Claude Code</option>
                <option value="antigravity">Antigravity</option>
              </Select>
            </Field>
          </div>
          <Field label="Transport">
            <Select value={mcpForm.transport} onChange={(event) => setMcpForm((value) => ({ ...value, transport: event.target.value }))}>
              <option value="stdio">stdio</option>
              <option value="http">http</option>
              <option value="sse">sse</option>
            </Select>
          </Field>
          {mcpForm.transport === "stdio" ? (
            <>
              <Field label="Command">
                <Input value={mcpForm.command} placeholder="npx" onChange={(event) => setMcpForm((value) => ({ ...value, command: event.target.value }))} />
              </Field>
              <Field label="Arguments" hint="Space-separated.">
                <Input value={mcpForm.args} placeholder="-y @modelcontextprotocol/server-filesystem C:\\project" onChange={(event) => setMcpForm((value) => ({ ...value, args: event.target.value }))} />
              </Field>
            </>
          ) : (
            <Field label="URL">
              <Input value={mcpForm.url} placeholder="https://example.com/mcp" onChange={(event) => setMcpForm((value) => ({ ...value, url: event.target.value }))} />
            </Field>
          )}
          <Field label="Environment variable names" hint="Comma-separated names only. Values stay in the agent's own configuration.">
            <Input value={mcpForm.env_keys} placeholder="GITHUB_TOKEN, API_KEY" onChange={(event) => setMcpForm((value) => ({ ...value, env_keys: event.target.value }))} />
          </Field>
          <div className="rounded-xl bg-powder/35 px-3 py-2 text-[10px] leading-relaxed text-[#5b7088]">
            Katha writes Claude project MCP config to the permanent project's <code>.mcp.json</code>. For Antigravity, it
            writes only to a detected, documented config file; otherwise it asks you to add the server inside Antigravity.
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AgentCard({
  agent,
  selected,
  busy,
  onSelect,
  onLaunch,
}: {
  agent: AgentInfo;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onLaunch: () => Promise<void>;
}) {
  const tone = agentTone[agent.agent] || "neutral";
  return (
    <Card className={cn("p-5", selected && "ring-2 ring-ink/15")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              tone === "lavender" ? "bg-lavender/60 text-[#71618c]" : tone === "blue" ? "bg-powder/70 text-[#5b7088]" : "bg-sage/60 text-[#50694f]",
            )}
          >
            {agent.agent === "claude_code" ? <Terminal size={16} /> : agent.agent === "antigravity" ? <Bot size={16} /> : <Layers size={16} />}
          </span>
          <div>
            <p className="text-[12.5px] font-bold">{agent.label}</p>
            <p className="text-[9.5px] font-semibold text-muted/70">
              {agent.installed ? agent.version || "Installed" : "Not detected"}
            </p>
          </div>
        </div>
        <Badge tone={selected ? "ink" : "neutral"} dot={selected}>
          {selected ? "Selected" : "Available"}
        </Badge>
      </div>
      <p className="mt-3 min-h-[40px] text-[10.5px] leading-relaxed text-muted">
        {agent.agent === "claude_code"
          ? "Official CLI. Interactive terminal or captured headless run with your existing Claude sign-in."
          : agent.agent === "antigravity"
            ? "Opens the same permanent channel project. The prepared task is in the handoff folder."
            : "A complete folder and prompt handoff for any tool or manual production."}
      </p>
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted">Project access</span>
          <span className="font-semibold">{agent.project_access ? "Yes" : "No"}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted">Busy now</span>
          <span className="font-semibold">{agent.busy ? "Yes" : "No"}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted">Authentication</span>
          <span className="max-w-[160px] truncate font-semibold" title={agent.authentication.note}>
            {agent.authentication.verified ? "Verified" : agent.authentication.available === false ? "Not set up" : "Managed by app"}
          </span>
        </div>
      </div>
      {agent.error ? <p className="mt-2 text-[10px] leading-relaxed text-[#9c5c63]">{agent.error}</p> : null}
      <div className="mt-4 flex gap-2">
        <Button size="sm" variant={selected ? "secondary" : "primary"} loading={busy} onClick={onSelect}>
          {selected ? "Selected" : "Use this agent"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void onLaunch()} disabled={!agent.installed}>
          Open
        </Button>
      </div>
    </Card>
  );
}

function LimitColumn({ title, tone, items }: { title: string; tone: "lavender" | "blue" | "sage"; items: string[] }) {
  const styles = {
    lavender: "bg-lavender/30",
    blue: "bg-powder/35",
    sage: "bg-sage/35",
  };
  return (
    <div className={cn("rounded-2xl p-4", styles[tone])}>
      <p className="text-[11.5px] font-bold">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-1.5 text-[10px] leading-relaxed text-ink/65">
            <Check size={10} className="mt-0.5 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PathRow({ label, path }: { label: string; path: string | null | undefined }) {
  return (
    <div className="rounded-xl bg-white/55 px-2.5 py-2">
      <p className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-muted/60">{label}</p>
      <p className="truncate font-mono text-[9px] text-ink/60">{path || "Not configured"}</p>
    </div>
  );
}
