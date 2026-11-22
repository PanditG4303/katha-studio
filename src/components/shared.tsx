import { useEffect, useMemo, useState } from "react";
import { Film, Pause, Play, Volume2 } from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import type { ModelInfo, Provider } from "@/lib/types";
import { useAppStore } from "@/store/AppStore";
import { cn, formatDuration } from "@/lib/utils";
import { Select } from "@/components/ui";

export function useModels(provider: string | null, enabled = true) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!provider || !enabled) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    api<{ models: ModelInfo[]; default_model?: string }>(`/system/providers/${provider}/models`)
      .then((data) => {
        if (!cancelled) setModels(data.models || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setModels([]);
          setError(err instanceof Error ? err.message : "Could not load models.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, enabled]);

  return { models, loading, error };
}

export function ProviderModelPicker({
  provider,
  model,
  onProviderChange,
  onModelChange,
  compact,
}: {
  provider: string;
  model: string;
  onProviderChange: (value: string) => void;
  onModelChange: (value: string) => void;
  compact?: boolean;
}) {
  const { providers } = useAppStore();
  const aiProviders = providers.filter((item) => ["zen", "openrouter"].includes(item.provider) && item.enabled !== false);
  const active = aiProviders.find((item) => item.provider === provider) || aiProviders[0];
  const providerReady = active?.credential_status === "configured";
  const { models, loading, error } = useModels(active?.provider || null, providerReady);
  const options = useMemo(() => {
    if (!active) return [];
    const list = models.map((item) => ({ id: item.id, label: item.name || item.id }));
    if (model && !list.some((item) => item.id === model)) {
      list.unshift({ id: model, label: `${model} (saved)` });
    }
    return list;
  }, [models, model, active]);

  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2")}>
      <div>
        <label className="field-label">AI provider</label>
        <Select
          value={active?.provider || ""}
          onChange={(event) => {
            onProviderChange(event.target.value);
            onModelChange("");
          }}
        >
          {aiProviders.length === 0 ? <option value="">No AI provider</option> : null}
          {aiProviders.map((item) => (
            <option key={item.provider} value={item.provider}>
              {item.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="field-label">Model</label>
        <Select
          value={model || active?.default_model || ""}
          onChange={(event) => onModelChange(event.target.value)}
          disabled={loading && options.length === 0}
        >
          {loading && options.length === 0 ? <option value="">Loading models…</option> : null}
          {!loading && options.length === 0 ? <option value={active?.default_model || ""}>{active?.default_model || "No models loaded"}</option> : null}
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </Select>
        {!providerReady && active ? (
          <p className="mt-1 text-[10px] leading-snug text-muted">
            Connect {active.label} in Connections &amp; Settings to load its model list. The saved default is used
            meanwhile.
          </p>
        ) : null}
        {error ? <p className="mt-1 text-[10px] leading-snug text-[#a95f66]">{error}</p> : null}
      </div>
    </div>
  );
}

export function ProviderStatus({ provider }: { provider?: Provider }) {
  if (!provider) return null;
  const connected = provider.credential_status === "configured";
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-muted">
      <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-moss" : "bg-ink/20")} />
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

export function VideoThumbnail({
  videoId,
  title,
  className,
  duration,
  hasThumbnail = true,
}: {
  videoId: number;
  title: string;
  className?: string;
  duration?: number;
  hasThumbnail?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!hasThumbnail) {
      setSrc(null);
      return;
    }
    mediaUrl("thumbnail", videoId)
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [videoId, hasThumbnail]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-gradient-to-br from-[#e8e1ef] via-[#f3e8dc] to-[#e2eadf]",
        className,
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={title}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Film size={22} className="text-ink/20" />
        </div>
      )}
      {duration ? (
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-ink/70 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
          {formatDuration(duration)}
        </span>
      ) : null}
    </div>
  );
}

export function Waveform({
  values,
  progress = 0,
  className,
  bars = 64,
}: {
  values: number[];
  progress?: number;
  className?: string;
  bars?: number;
}) {
  const sampled = useMemo(() => {
    if (!values.length) {
      return Array.from({ length: bars }, (_, index) => 0.25 + Math.abs(Math.sin(index * 0.7)) * 0.35);
    }
    const step = Math.max(1, Math.floor(values.length / bars));
    return Array.from({ length: bars }, (_, index) => {
      const value = values[index * step] ?? 0;
      return Math.max(0.08, Math.min(1, Number(value) || 0));
    });
  }, [values, bars]);

  return (
    <div className={cn("flex h-10 items-center gap-[2px]", className)}>
      {sampled.map((value, index) => {
        const active = (index / sampled.length) * 100 <= progress * 100;
        return (
          <span
            key={index}
            className={cn("w-full min-w-[1px] rounded-full transition-colors", active ? "bg-moss/80" : "bg-ink/15")}
            style={{ height: `${Math.max(8, value * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

export function AudioPlayButton({
  url,
  label,
  className,
  compact,
}: {
  url: string;
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audio?.pause();
    };
  }, [audio]);

  const toggle = async () => {
    if (playing && audio) {
      audio.pause();
      setPlaying(false);
      return;
    }
    const next = new Audio(url);
    next.onended = () => setPlaying(false);
    next.onerror = () => setPlaying(false);
    setAudio(next);
    try {
      await next.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/80 font-bold text-ink/70 transition hover:border-ink/20 hover:text-ink",
        compact ? "h-6 w-6 justify-center" : "px-3 py-1.5 text-[10.5px]",
        className,
      )}
      title={playing ? "Pause" : "Play audio"}
    >
      {playing ? <Pause size={compact ? 10 : 11} /> : <Play size={compact ? 10 : 11} />}
      {!compact ? <span>{playing ? "Pause" : label || "Listen"}</span> : null}
    </button>
  );
}

export function VoiceAudio({ lineId, label = "Listen", compact }: { lineId: number; label?: string; compact?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    mediaUrl("voice", lineId).then(setUrl).catch(() => setUrl(null));
  }, [lineId]);
  if (!url) return null;
  return <AudioPlayButton url={url} label={label} compact={compact} />;
}

export function MusicAudio({ assetId, label = "Listen", compact }: { assetId: number; label?: string; compact?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    mediaUrl("music", assetId).then(setUrl).catch(() => setUrl(null));
  }, [assetId]);
  if (!url) return null;
  return <AudioPlayButton url={url} label={label} compact={compact} />;
}

export function ChannelDots({ channels }: { channels: Array<{ id: number; name: string; accent_color: string }> }) {
  return (
    <div className="flex -space-x-1.5">
      {channels.slice(0, 4).map((channel) => (
        <span
          key={channel.id}
          title={channel.name}
          className="h-6 w-6 rounded-full border-2 border-white shadow-sm"
          style={{ background: channel.accent_color }}
        />
      ))}
    </div>
  );
}

export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="my-6 flex items-center gap-3">
      <span className="eyebrow whitespace-nowrap">{label}</span>
      <span className="h-px flex-1 bg-ink/[0.06]" />
    </div>
  );
}

export function VoiceNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-powder/40 px-3 py-2.5 text-[11.5px] leading-relaxed text-[#5b7088]">
      <Volume2 size={13} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
