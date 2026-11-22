import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { AppSettings, Channel, Job, Provider } from "@/lib/types";
import { useToast } from "@/components/Toast";

interface AppStoreValue {
  channels: Channel[];
  providers: Provider[];
  settings: AppSettings | null;
  jobs: Job[];
  activeJobs: Job[];
  loadingChannels: boolean;
  selectedChannelId: number | null;
  setSelectedChannelId: (id: number | null) => void;
  refreshChannels: () => Promise<void>;
  refreshProviders: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshJobs: () => Promise<void>;
  dataVersion: number;
  bumpData: () => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [selectedChannelId, setSelectedChannelIdState] = useState<number | null>(() => {
    const raw = localStorage.getItem("katha:channel");
    return raw ? Number(raw) : null;
  });
  const [dataVersion, setDataVersion] = useState(0);
  const finishedRef = useRef<Set<number>>(new Set());

  const setSelectedChannelId = useCallback((id: number | null) => {
    setSelectedChannelIdState(id);
    if (id) localStorage.setItem("katha:channel", String(id));
    else localStorage.removeItem("katha:channel");
  }, []);

  const refreshChannels = useCallback(async () => {
    try {
      const data = await api<{ channels: Channel[] }>("/channels");
      setChannels(data.channels);
      setSelectedChannelIdState((current) => {
        if (current && data.channels.some((channel) => channel.id === current)) return current;
        return data.channels[0]?.id ?? null;
      });
    } catch {
      // The shell stays usable; pages surface their own errors.
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  const refreshProviders = useCallback(async () => {
    try {
      const data = await api<{ providers: Provider[] }>("/system/providers");
      setProviders(data.providers);
    } catch {
      // ignore
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const data = await api<AppSettings>("/system/settings");
      setSettings(data);
    } catch {
      // ignore
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const data = await api<{ jobs: Job[] }>("/system/jobs?limit=30");
      setJobs(data.jobs);
      for (const job of data.jobs) {
        if (finishedRef.current.has(job.id)) continue;
        if (job.status === "completed") {
          finishedRef.current.add(job.id);
          if (job.type !== "metadata_prepare") {
            toast.success(jobLabel(job.type), job.message || "Finished successfully.");
          }
          setDataVersion((version) => version + 1);
        } else if (job.status === "failed") {
          finishedRef.current.add(job.id);
          toast.error(`${jobLabel(job.type)} failed`, job.error || "Check the job details.");
          setDataVersion((version) => version + 1);
        } else if (job.status === "cancelled") {
          finishedRef.current.add(job.id);
          setDataVersion((version) => version + 1);
        }
      }
    } catch {
      // ignore
    }
  }, [toast]);

  useEffect(() => {
    void refreshChannels();
    void refreshProviders();
    void refreshSettings();
    void refreshJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshJobs();
    }, 2500);
    return () => window.clearInterval(id);
  }, [refreshJobs]);

  const activeJobs = useMemo(
    () => jobs.filter((job) => ["queued", "running"].includes(job.status)),
    [jobs],
  );

  const value = useMemo<AppStoreValue>(
    () => ({
      channels,
      providers,
      settings,
      jobs,
      activeJobs,
      loadingChannels,
      selectedChannelId,
      setSelectedChannelId,
      refreshChannels,
      refreshProviders,
      refreshSettings,
      refreshJobs,
      dataVersion,
      bumpData: () => setDataVersion((version) => version + 1),
    }),
    [
      channels,
      providers,
      settings,
      jobs,
      activeJobs,
      loadingChannels,
      selectedChannelId,
      setSelectedChannelId,
      refreshChannels,
      refreshProviders,
      refreshSettings,
      refreshJobs,
      dataVersion,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const context = useContext(AppStoreContext);
  if (!context) throw new Error("useAppStore must be used inside AppStoreProvider");
  return context;
}

function jobLabel(type: string): string {
  const labels: Record<string, string> = {
    ideation: "Content ideas",
    script_generation: "Script generation",
    voice_generation: "Voice generation",
    music_import: "Music import",
    production_package: "Production package",
    youtube_upload: "YouTube upload",
    metadata_prepare: "Publishing metadata",
  };
  return labels[type] || "Studio job";
}
