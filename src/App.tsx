import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { ToastProvider } from "@/components/Toast";
import { AppStoreProvider } from "@/store/AppStore";
import { AppShell, StudioPageLoader } from "@/components/AppShell";
import { Button } from "@/components/ui";
import { LogoWordmark } from "@/components/Logo";
import { OverviewPage } from "@/pages/OverviewPage";
import { ChannelsPage } from "@/pages/ChannelsPage";
import { CreateContentPage } from "@/pages/CreateContentPage";
import { ScriptStudioPage } from "@/pages/ScriptStudioPage";
import { VoiceMusicPage } from "@/pages/VoiceMusicPage";
import { AnimationStudioPage } from "@/pages/AnimationStudioPage";
import { VideoLibraryPage } from "@/pages/VideoLibraryPage";
import { PublishingPage } from "@/pages/PublishingPage";
import { CalendarPage } from "@/pages/CalendarPage";
import { SettingsPage } from "@/pages/SettingsPage";

export function App() {
  return (
    <ToastProvider>
      <BackendGate>
        <AppStoreProvider>
          <HashRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<OverviewPage />} />
                <Route path="/channels" element={<ChannelsPage />} />
                <Route path="/create" element={<CreateContentPage />} />
                <Route path="/scripts" element={<ScriptStudioPage />} />
                <Route path="/voice" element={<VoiceMusicPage />} />
                <Route path="/animation" element={<AnimationStudioPage />} />
                <Route path="/videos" element={<VideoLibraryPage />} />
                <Route path="/publishing" element={<PublishingPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </HashRouter>
        </AppStoreProvider>
      </BackendGate>
    </ToastProvider>
  );
}

type BootState = "checking" | "ready" | "failed";

function BackendGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BootState>("checking");
  const [detail, setDetail] = useState("");
  const [attempt, setAttempt] = useState(0);

  const check = useCallback(async (signal: { cancelled: boolean }) => {
    setState("checking");
    setDetail("");
    // The Python service starts alongside Electron. Give it up to ~40 seconds
    // on a cold start, then show a real error instead of an endless splash.
    for (let index = 0; index < 60; index += 1) {
      if (signal.cancelled) return;
      try {
        const result = await api<{ ok: boolean; version: string }>("/health", { timeout: 3000 });
        if (result?.ok) {
          setState("ready");
          return;
        }
      } catch (error) {
        setDetail(error instanceof Error ? error.message : "The local service did not respond.");
      }
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    }
    if (!signal.cancelled) setState("failed");
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    void check(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [check, attempt]);

  if (state === "ready") {
    return <ErrorBoundary>{children}</ErrorBoundary>;
  }

  if (state === "failed") {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream p-6">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-lavender/30 blur-[120px]" />
          <div className="absolute -right-40 bottom-0 h-[460px] w-[460px] rounded-full bg-sage/30 blur-[130px]" />
        </div>
        <div className="relative w-full max-w-md rounded-[26px] border border-white bg-white/80 p-7 shadow-lift backdrop-blur-xl">
          <LogoWordmark />
          <div className="mt-6 flex h-10 w-10 items-center justify-center rounded-2xl bg-peach/60 text-clay">
            <AlertTriangle size={18} />
          </div>
          <h1 className="display mt-3 text-[24px]">The local service did not start</h1>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            Katha Studio runs a small Python service on this computer. It did not answer in time. Nothing was uploaded or
            changed anywhere.
          </p>
          {detail ? (
            <p className="mt-3 break-words rounded-xl bg-rose/25 px-3 py-2 font-mono text-[10px] leading-relaxed text-[#8f555b]">
              {detail}
            </p>
          ) : null}
          <ol className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-muted">
            <li>1. Close this window and start Katha Studio again.</li>
            <li>2. Check that Python and the backend dependencies are installed.</li>
            <li>3. Open the logs folder from the app's data directory for the real error.</li>
          </ol>
          <div className="mt-5 flex gap-2">
            <Button icon={<RefreshCw size={13} />} onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream p-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-lavender/30 blur-[120px]" />
        <div className="absolute -right-40 bottom-0 h-[460px] w-[460px] rounded-full bg-sage/30 blur-[130px]" />
        <div className="absolute bottom-0 left-1/3 h-[380px] w-[380px] rounded-full bg-peach/25 blur-[120px]" />
      </div>
      <div className="relative flex flex-col items-center text-center">
        <LogoWordmark />
        <div className="mt-8 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted/60">
          <Sparkles size={12} className="text-clay" />
          Preparing the studio
        </div>
        <div className="mt-4 h-1 w-40 overflow-hidden rounded-full bg-ink/[0.06]">
          <div className="h-full w-1/2 animate-shimmer rounded-full bg-ink/25" />
        </div>
        <p className="mt-4 max-w-xs text-[11px] leading-relaxed text-muted/70">
          Starting the local service, checking the database and your workspace folders.
        </p>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-cream p-6">
          <div className="w-full max-w-lg rounded-[26px] border border-white bg-white/80 p-7 shadow-lift">
            <p className="eyebrow">Something broke on this screen</p>
            <h1 className="display mt-2 text-[26px]">Katha Studio hit an unexpected error</h1>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              Your projects, scripts and videos are safe on disk. Reload the window to continue. If it happens again,
              open Diagnostics after restarting.
            </p>
            <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-ink/[0.05] p-3 font-mono text-[9.5px] leading-relaxed text-ink/60">
              {this.state.error.message}
            </pre>
            <div className="mt-5 flex gap-2">
              <Button icon={<RefreshCw size={13} />} onClick={() => window.location.reload()}>
                Reload the studio
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  this.setState({ error: null });
                  window.location.hash = "#/";
                }}
              >
                Back to Overview
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export { StudioPageLoader };
