import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AudioLines,
  Bot,
  CalendarDays,
  Clapperboard,
  Feather,
  Film,
  LayoutDashboard,
  MonitorSmartphone,
  Plus,
  Radio,
  Send,
  Settings2,
  Sparkles,
  ChevronDown,
  CircleHelp,
  X,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/AppStore";
import { Avatar, Badge, Button, Progress } from "@/components/ui";
import { LogoWordmark } from "@/components/Logo";
import { bridge } from "@/lib/api";
import { useToast } from "@/components/Toast";

const navigation = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/channels", label: "My Channels", icon: Radio },
  { to: "/create", label: "Create Content", icon: Sparkles },
  { to: "/scripts", label: "Story & Script Studio", icon: Feather },
  { to: "/voice", label: "Voice & Music Lab", icon: AudioLines },
  { to: "/animation", label: "Animation Studio", icon: Film },
  { to: "/agents", label: "Animation Agents", icon: Bot },
  { to: "/videos", label: "Video Library", icon: Clapperboard },
  { to: "/publishing", label: "Publishing Manager", icon: Send },
  { to: "/browser", label: "Browser Accounts", icon: MonitorSmartphone },
  { to: "/calendar", label: "Content Calendar", icon: CalendarDays },
];

const bottomNavigation = [{ to: "/settings", label: "Connections & Settings", icon: Settings2 }];

const pageTitles: Record<string, string> = {
  "/": "Overview",
  "/channels": "My Channels",
  "/create": "Create Content",
  "/scripts": "Story & Script Studio",
  "/voice": "Voice & Music Lab",
  "/animation": "Animation Studio",
  "/agents": "Animation Agents",
  "/videos": "Video Library",
  "/publishing": "Publishing Manager",
  "/browser": "Browser Accounts",
  "/calendar": "Content Calendar",
  "/settings": "Connections & Settings",
};

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { channels, activeJobs, selectedChannelId, setSelectedChannelId, jobs, refreshJobs } = useAppStore();
  const [channelMenu, setChannelMenu] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [version, setVersion] = useState("1.0.0");

  useEffect(() => {
    void bridge.appInfo().then((info) => {
      if (info?.version) setVersion(info.version);
    });
  }, []);

  useEffect(() => {
    setChannelMenu(false);
    setHelpOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() !== "n") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      navigate("/create");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const currentChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) || null,
    [channels, selectedChannelId],
  );

  const runningJob = activeJobs[0] || null;
  const title = pageTitles[location.pathname] || "Katha Studio";

  return (
    <div className="relative h-screen overflow-hidden bg-cream">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-lavender/30 blur-[120px]" />
        <div className="absolute -right-40 top-1/3 h-[460px] w-[460px] rounded-full bg-sage/30 blur-[130px]" />
        <div className="absolute bottom-0 left-1/3 h-[380px] w-[380px] rounded-full bg-peach/25 blur-[120px]" />
      </div>

      <div className="drag-region absolute inset-x-0 top-0 z-40 h-[42px]" />

      <div className="relative z-10 flex h-full pt-[42px]">
        <aside className="flex w-[248px] shrink-0 flex-col border-r border-white/70 bg-white/35 backdrop-blur-xl">
          <div className="px-5 pb-4 pt-4">
            <LogoWordmark />
          </div>

          <div className="px-4 pb-3">
            <button
              type="button"
              onClick={() => navigate("/create")}
              className="no-drag group flex w-full items-center justify-between rounded-xl border border-ink/[0.07] bg-white/75 px-3 py-2.5 text-left shadow-[0_4px_16px_-12px_rgba(63,58,70,0.4)] transition hover:bg-white"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-ink text-cream">
                  <Plus size={13} strokeWidth={2.5} />
                </span>
                <span className="text-[12px] font-bold text-ink">New story</span>
              </div>
              <span className="text-[10px] font-semibold text-muted/60 group-hover:text-muted">Ctrl N</span>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 pb-4">
            <p className="px-3 pb-2 pt-2 text-[9px] font-bold uppercase tracking-[0.22em] text-muted/50">Studio</p>
            <div className="space-y-0.5">
              {navigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => cn("nav-item", isActive && "nav-item-active")}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        size={16}
                        strokeWidth={isActive ? 2.2 : 1.9}
                        className={cn("shrink-0", isActive ? "text-ink" : "text-ink/40")}
                      />
                      <span className="truncate">{item.label}</span>
                      {isActive ? (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-clay/80" />
                      ) : null}
                    </>
                  )}
                </NavLink>
              ))}
            </div>

            <p className="px-3 pb-2 pt-5 text-[9px] font-bold uppercase tracking-[0.22em] text-muted/50">Configure</p>
            <div className="space-y-0.5">
              {bottomNavigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => cn("nav-item", isActive && "nav-item-active")}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        size={16}
                        strokeWidth={isActive ? 2.2 : 1.9}
                        className={cn("shrink-0", isActive ? "text-ink" : "text-ink/40")}
                      />
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>

          {runningJob ? (
            <div className="mx-3 mb-3 rounded-2xl border border-white/80 bg-white/70 p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Activity size={12} className="text-moss" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink/60">Working</p>
                </div>
                <span className="text-[10px] font-bold text-moss">{Math.round(runningJob.progress)}%</span>
              </div>
              <p className="mt-1.5 truncate text-[11px] font-semibold text-ink/80">
                {runningJob.message || "Studio job running"}
              </p>
              <Progress value={runningJob.progress} className="mt-2" />
              <button
                type="button"
                onClick={() => {
                  void refreshJobs();
                  navigate("/settings?tab=studio");
                }}
                className="mt-2 text-[10px] font-bold text-muted transition hover:text-ink"
              >
                View activity →
              </button>
            </div>
          ) : null}

          <div className="border-t border-ink/[0.05] px-3 py-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setChannelMenu((value) => !value)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-white/60"
              >
                <Avatar name={currentChannel?.name || "Katha Studio"} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-bold text-ink">
                    {currentChannel?.name || "No channel selected"}
                  </p>
                  <p className="truncate text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted/70">
                    {currentChannel ? `${currentChannel.category} · ${currentChannel.language}` : "Create your first channel"}
                  </p>
                </div>
                <ChevronDown size={13} className={cn("text-muted transition", channelMenu && "rotate-180")} />
              </button>
              {channelMenu ? (
                <div className="absolute bottom-full left-0 z-30 mb-2 w-full overflow-hidden rounded-2xl border border-white bg-[#fdfbf7] p-1.5 shadow-lift">
                  {channels.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => navigate("/channels")}
                      className="w-full rounded-xl px-3 py-2 text-left text-[11.5px] font-semibold text-muted hover:bg-ink/[0.04]"
                    >
                      Create a channel
                    </button>
                  ) : (
                    channels.map((channel) => (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => {
                          setSelectedChannelId(channel.id);
                          setChannelMenu(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-ink/[0.04]",
                          channel.id === selectedChannelId && "bg-ink/[0.045]",
                        )}
                      >
                        <span
                          className="h-5 w-5 rounded-full"
                          style={{ background: channel.accent_color }}
                        />
                        <span className="truncate text-[11.5px] font-semibold">{channel.name}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <div className="mt-2 flex items-center justify-between px-2">
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="flex items-center gap-1 text-[10px] font-semibold text-muted/70 transition hover:text-ink"
              >
                <CircleHelp size={11} /> Help & honest limits
              </button>
              <span className="text-[9px] font-semibold text-muted/40">v{version}</span>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-drag flex h-[54px] shrink-0 items-center justify-between gap-4 border-b border-white/60 bg-cream/40 px-8 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-muted">
              <span className="text-ink/70">{title}</span>
              <span className="text-muted/40">/</span>
              <span className="text-muted/60">{currentChannel?.name || "Studio"}</span>
            </div>
            <div className="flex items-center gap-2">
              {activeJobs.length > 0 ? (
                <Badge tone="sage" dot>
                  {activeJobs.length} job{activeJobs.length > 1 ? "s" : ""} running
                </Badge>
              ) : (
                <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-muted/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-moss/70" /> Local studio ready
                </span>
              )}
              <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => navigate("/create")}>
                New story
              </Button>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto w-full max-w-[1380px] px-8 py-7"
            >
              <Outlet />
            </motion.div>
          </main>
        </div>
      </div>

      {helpOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-[#3f3a46]/25 backdrop-blur-[3px]" onClick={() => setHelpOpen(false)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-[26px] border border-white bg-[#fdfbf7] shadow-lift">
            <div className="flex items-start justify-between border-b border-ink/[0.06] px-6 py-5">
              <div>
                <h2 className="display text-[22px]">What Katha Studio does — and doesn't</h2>
                <p className="mt-1 text-[12px] text-muted">An honest guide to the studio's real capabilities.</p>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-ink/5"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5 text-[12.5px] leading-relaxed text-ink/75">
              <p>
                <strong className="text-ink">Real:</strong> local project storage, script structure, voice generation
                (with your keys), production packages, FFprobe validation, YouTube OAuth uploads, scheduling
                confirmation from YouTube, backups and logs.
              </p>
              <p>
                <strong className="text-ink">Handoff:</strong> Claude Code, Google Antigravity and manual production share
                one permanent channel project. Claude Code uses its official CLI; Antigravity opens the real folder. Katha
                never injects fake prompts or reads credentials.
              </p>
              <p>
                <strong className="text-ink">Needs your accounts:</strong> OpenCode Zen, OpenRouter, ElevenLabs and
                YouTube. Demo mode is clearly labelled and generates fictional sample material, not researched facts.
              </p>
              <p className="rounded-xl bg-peach/50 px-3 py-2 text-[11.5px] text-[#8a5f48]">
                Instagram is available through a manual workflow and a guided, isolated browser profile. Katha fills the
                real website but never claims success until the website confirms it.
              </p>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setHelpOpen(false)}>
                  Understood
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
          <h1 className="display text-[32px] font-medium leading-[1.1] tracking-[-0.02em]">{title}</h1>
          {description ? <p className="mt-2 text-[13px] leading-relaxed text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

export function useToastSafe() {
  return useToast();
}

export function navigateTo(path: string) {
  window.location.hash = `#${path}`;
}

export function StudioPageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink/10 border-t-moss" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/60">Preparing the studio</p>
      </div>
    </div>
  );
}
