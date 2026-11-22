import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  FileText,
  FolderOpen,
  HardDrive,
  KeyRound,
  Laptop,
  Loader2,
  Mic2,
  Monitor,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Volume2,
  Wand2,
  X,
  Youtube,
  Zap,
} from "lucide-react";
import { api, bridge } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/AppStore";
import type {
  AppSettings,
  ClaudeStatus,
  DiagnosticsResult,
  Job,
  Provider,
  SystemInfo,
} from "@/lib/types";
import {
  cn,
  errorMessage,
  formatBytes,
  formatDateTime,
  statusLabel,
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
  StatusBadge,
  Tabs,
  Textarea,
  Toggle,
} from "@/components/ui";
import { useModels } from "@/components/shared";
import { useToast } from "@/components/Toast";

const STORAGE_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: "workspace_root", label: "Studio workspace", hint: "The main Katha Studio folder." },
  { key: "channels_root", label: "Channels & animation projects", hint: "Permanent Claude animation projects live here." },
  { key: "packages_root", label: "Production packages", hint: "Generated handoff packages for each story." },
  { key: "outputs_root", label: "Default finished outputs", hint: "Fallback folder for finished videos." },
  { key: "assets_root", label: "Shared assets", hint: "Reference styles and reusable media." },
  { key: "music_root", label: "Music library", hint: "Imported and licensed audio." },
  { key: "imports_root", label: "Imports & uploads", hint: "Staging for reference uploads." },
];

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

const LANGUAGES = ["Hindi", "English", "Hinglish", "Tamil", "Telugu", "Bengali", "Marathi", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Urdu"];

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<"connections" | "studio" | "diagnostics">(() => {
    const value = searchParams.get("tab");
    return value === "studio" || value === "diagnostics" ? value : "connections";
  });

  const changeTab = (value: "connections" | "studio" | "diagnostics") => {
    setTab(value);
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    setSearchParams(next);
  };

  return (
    <div className="animate-float-in">
      <PageHeader
        eyebrow="The studio's wiring"
        title="Connections & Settings"
        description="API keys live in Windows Credential Manager. Every connection is optional and clearly marked — the studio still works offline with local storage and the Windows voice."
        actions={
          <Tabs
            value={tab}
            onChange={changeTab}
            tabs={[
              { id: "connections", label: "Connections" },
              { id: "studio", label: "Studio" },
              { id: "diagnostics", label: "Diagnostics" },
            ]}
          />
        }
      />

      {tab === "connections" ? <ConnectionsTab /> : null}
      {tab === "studio" ? <StudioTab /> : null}
      {tab === "diagnostics" ? <DiagnosticsTab /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ connections */

function ConnectionsTab() {
  const navigate = useNavigate();
  const toast = useToast();
  const { providers, refreshProviders, refreshSettings, dataVersion, settings } = useAppStore();
  const info = useFetch<SystemInfo>(() => api("/system/info"), [dataVersion]);
  const youtube = useFetch<{ client: { configured: boolean }; accounts: Array<{ id: number }> }>(
    () => api("/publishing/youtube/status"),
    [dataVersion],
  );
  const [keyModal, setKeyModal] = useState<Provider | null>(null);

  const aiProviders = providers.filter((provider) => ["zen", "openrouter"].includes(provider.provider));
  const eleven = providers.find((provider) => provider.provider === "elevenlabs");
  const windows = providers.find((provider) => provider.provider === "windows_sapi");
  const claude = info.data?.claude;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        {aiProviders.length === 0 ? (
          <Card className="p-6 xl:col-span-2">
            <EmptyState icon={<Sparkles size={20} />} title="Provider list unavailable" message="Restart the local studio service and refresh this page." />
          </Card>
        ) : (
          aiProviders.map((provider) => (
            <ProviderCard
              key={provider.provider}
              provider={provider}
              onEditKey={() => setKeyModal(provider)}
              onChanged={async () => {
                await refreshProviders();
                await refreshSettings();
              }}
            />
          ))
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-6">
          <CardHeader
            title="ElevenLabs voice"
            subtitle="Premium multilingual narration. Your account, your credits."
            icon={<Mic2 size={16} />}
            action={
              <Badge tone={eleven?.credential_status === "configured" ? "sage" : "neutral"} dot>
                {eleven?.credential_status === "configured" ? "Connected" : "Not connected"}
              </Badge>
            }
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<KeyRound size={12} />} onClick={() => eleven && setKeyModal(eleven)}>
              {eleven?.credential_status === "configured" ? "Replace API key" : "Add API key"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw size={12} />}
              disabled={eleven?.credential_status !== "configured"}
              onClick={async () => {
                try {
                  const result = await api<{ message?: string; account?: { tier?: string; character_count?: number; character_limit?: number } }>(
                    "/system/providers/test",
                    { method: "POST", json: { provider: "elevenlabs" } },
                  );
                  const account = result.account || {};
                  toast.success(
                    "ElevenLabs responded",
                    [result.message, account.tier ? `Plan: ${account.tier}` : "", account.character_limit ? `${account.character_count || 0}/${account.character_limit} characters` : ""]
                      .filter(Boolean)
                      .join(" · "),
                  );
                  await refreshProviders();
                } catch (error) {
                  toast.error("ElevenLabs did not respond", errorMessage(error));
                }
              }}
            >
              Test connection
            </Button>
            <Button size="sm" variant="ghost" icon={<ArrowRight size={12} />} onClick={() => navigate("/voice")}>
              Voice & Music Lab
            </Button>
          </div>
          {eleven?.last_error ? (
            <p className="mt-3 rounded-xl bg-rose/30 px-3 py-2 text-[10.5px] leading-relaxed text-[#8f555b]">{eleven.last_error}</p>
          ) : null}
          <p className="mt-3 text-[10px] leading-relaxed text-muted">
            Voice generation sends only the exact dialogue text. ElevenLabs usage depends on your plan and character limits.
            Katha Studio never includes a hidden demo voice pretending to be ElevenLabs.
          </p>
        </Card>

        <Card className="p-6">
          <CardHeader
            title="Windows local voice"
            subtitle="Offline fallback through the installed Windows speech engine."
            icon={<Volume2 size={16} />}
            action={
              <Badge tone={(info.data?.windows_voices || []).length ? "sage" : "neutral"} dot>
                {(info.data?.windows_voices || []).length} voices
              </Badge>
            }
          />
          <div className="mt-4 flex flex-wrap gap-1.5">
            {(info.data?.windows_voices || []).slice(0, 10).map((voice) => (
              <span key={voice.name} className="rounded-full bg-white/60 px-2.5 py-1 text-[9.5px] font-semibold text-ink/60">
                {voice.name}
                {voice.culture ? ` · ${voice.culture}` : ""}
              </span>
            ))}
            {!info.loading && (info.data?.windows_voices || []).length === 0 ? (
              <p className="text-[10.5px] text-muted">No Windows voices detected. Install a language voice pack in Windows Settings.</p>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Play size={12} />}
              onClick={async () => {
                try {
                  const result = await api<{ message: string }>("/system/providers/test", { method: "POST", json: { provider: "windows_sapi" } });
                  toast.success("Windows speech is available", result.message);
                } catch (error) {
                  toast.error("Windows speech failed", errorMessage(error));
                }
              }}
            >
              Test local speech
            </Button>
            {windows ? (
              <Badge tone={windows.enabled ? "sage" : "neutral"}>{windows.enabled ? "Enabled" : "Disabled"}</Badge>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-6">
          <CardHeader
            title="YouTube publishing"
            subtitle="Official Google OAuth, one or more channels."
            icon={<Youtube size={16} />}
            action={
              <Badge tone={youtube.data?.client.configured ? "sage" : "neutral"} dot>
                {youtube.data?.client.configured ? "Client configured" : "Not configured"}
              </Badge>
            }
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{youtube.data?.accounts.length || 0} connected channel{youtube.data?.accounts.length === 1 ? "" : "s"}</Badge>
            <Button size="sm" variant="secondary" icon={<ArrowRight size={12} />} onClick={() => navigate("/publishing")}>
              Publishing Manager
            </Button>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted">
            OAuth client credentials and channel tokens are stored in Windows Credential Manager. Katha Studio never asks
            for your Google password.
          </p>
        </Card>

        <Card className="p-6">
          <CardHeader
            title="Claude handoff"
            subtitle="Detected locally. Never automated with fake prompt injection."
            icon={<Wand2 size={16} />}
            action={
              <Badge tone={claude?.cli.installed || claude?.desktop.installed ? "sage" : "neutral"} dot>
                {claude?.cli.installed || claude?.desktop.installed ? "Detected" : "Not detected"}
              </Badge>
            }
          />
          <div className="mt-4 space-y-2 text-[10.5px]">
            <div className="flex items-center justify-between rounded-xl bg-white/50 px-3 py-2">
              <span className="flex items-center gap-2 font-semibold text-ink/70">
                <Terminal size={12} /> Claude Code CLI
              </span>
              <span className={cn("font-bold", claude?.cli.installed ? "text-moss" : "text-muted/60")}>
                {claude?.cli.installed ? claude.cli.version || "Installed" : "Not found"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/50 px-3 py-2">
              <span className="flex items-center gap-2 font-semibold text-ink/70">
                <Monitor size={12} /> Claude Desktop
              </span>
              <span className={cn("font-bold", claude?.desktop.installed ? "text-moss" : "text-muted/60")}>
                {claude?.desktop.installed ? (claude.desktop.running ? "Running" : "Installed") : "Not found"}
              </span>
            </div>
          </div>
          <Button className="mt-3" size="sm" variant="secondary" icon={<ArrowRight size={12} />} onClick={() => navigate("/animation")}>
            Animation Studio
          </Button>
        </Card>
      </div>

      <Card className="p-6">
        <CardHeader title="What needs an account" subtitle="An honest map of the studio's external connections" icon={<ShieldCheck size={16} />} />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { title: "AI writing", text: "OpenCode Zen or OpenRouter for ideas, scripts and metadata.", done: aiProviders.some((provider) => provider.credential_status === "configured"), to: "/settings" },
            { title: "Premium voice", text: "ElevenLabs for high-quality multilingual narration.", done: eleven?.credential_status === "configured", to: "/voice" },
            { title: "YouTube", text: "A Google Cloud OAuth client and a YouTube channel.", done: Boolean(youtube.data?.client.configured), to: "/publishing" },
            { title: "Everything else", text: "Storage, FFmpeg, Windows voice and the Claude handoff work locally.", done: true, to: "/settings?tab=diagnostics" },
          ].map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => navigate(item.to)}
              className="rounded-2xl border border-ink/[0.06] bg-white/45 p-4 text-left transition hover:bg-white/70"
            >
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-full", item.done ? "bg-sage/70 text-moss" : "bg-ink/[0.05] text-ink/35")}>
                {item.done ? <Check size={12} strokeWidth={3} /> : <AlertTriangle size={11} />}
              </span>
              <p className="mt-2.5 text-[11.5px] font-bold">{item.title}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted">{item.text}</p>
            </button>
          ))}
        </div>
      </Card>

      <ApiKeyModal
        provider={keyModal}
        onClose={() => setKeyModal(null)}
        onSaved={async () => {
          await refreshProviders();
          await refreshSettings();
          setKeyModal(null);
        }}
      />
    </div>
  );
}

function ProviderCard({
  provider,
  onEditKey,
  onChanged,
}: {
  provider: Provider;
  onEditKey: () => void;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const { models, loading, error } = useModels(provider.provider, provider.credential_status === "configured");
  const [model, setModel] = useState(provider.default_model || "");
  const [savingModel, setSavingModel] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    setModel(provider.default_model || "");
  }, [provider.default_model]);

  const configured = provider.credential_status === "configured";
  const modelOptions = useMemo(() => {
    const list = models.map((item) => ({ id: item.id, label: item.name || item.id }));
    if (provider.default_model && !list.some((item) => item.id === provider.default_model)) {
      list.unshift({ id: provider.default_model, label: `${provider.default_model} (saved)` });
    }
    return list;
  }, [models, provider.default_model]);

  return (
    <Card className="p-6">
      <CardHeader
        title={provider.label}
        subtitle={provider.provider === "zen" ? "OpenCode Zen inference. Choose any model your account exposes." : "OpenRouter's multi-model catalogue."}
        icon={<Sparkles size={16} />}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={configured ? "sage" : "neutral"} dot>
              {configured ? "Connected" : "Needs key"}
            </Badge>
            <Toggle
              checked={provider.enabled}
              disabled={toggling}
              onChange={async (value) => {
                setToggling(true);
                try {
                  await api(`/system/providers/${provider.provider}`, { method: "PATCH", json: { enabled: value } });
                  await onChanged();
                } catch (err) {
                  toast.error("Could not update the provider", errorMessage(err));
                } finally {
                  setToggling(false);
                }
              }}
              label="Enable provider"
            />
          </div>
        }
      />
      <div className="mt-4 space-y-3">
        <Field label="API key" hint={configured ? "A key is saved in Windows Credential Manager." : "Required before this provider can be used."}>
          <div className="flex gap-2">
            <Input value={configured ? "••••••••••••••••••••" : ""} readOnly placeholder="Not connected" />
            <Button variant="secondary" icon={<KeyRound size={13} />} onClick={onEditKey}>
              {configured ? "Replace" : "Add key"}
            </Button>
            {configured ? (
              <IconButton
                label="Remove API key"
                onClick={async () => {
                  if (!window.confirm(`Remove the ${provider.label} API key?`)) return;
                  try {
                    await api(`/system/credentials/${provider.provider}`, { method: "DELETE" });
                    toast.success("API key removed");
                    await onChanged();
                  } catch (err) {
                    toast.error("Could not remove the key", errorMessage(err));
                  }
                }}
              >
                <Trash2 size={13} />
              </IconButton>
            ) : null}
          </div>
        </Field>

        <Field
          label="Default model"
          hint={
            error
              ? error
              : loading
                ? "Loading the live model catalogue…"
                : configured
                  ? "Loaded live from the provider. Nothing is hard-coded."
                  : "Connect the provider to load its real model list."
          }
        >
          <div className="flex gap-2">
            <Select value={model} onChange={(event) => setModel(event.target.value)} disabled={!configured}>
              {!model ? <option value="">Provider default</option> : null}
              {modelOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              loading={savingModel}
              disabled={!configured || model === provider.default_model}
              icon={<Save size={13} />}
              onClick={async () => {
                setSavingModel(true);
                try {
                  await api(`/system/providers/${provider.provider}`, { method: "PATCH", json: { default_model: model } });
                  toast.success("Default model saved", model || "Provider default");
                  await onChanged();
                } catch (err) {
                  toast.error("Could not save the model", errorMessage(err));
                } finally {
                  setSavingModel(false);
                }
              }}
            >
              Save
            </Button>
          </div>
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={testing}
            disabled={!configured}
            icon={<Zap size={12} />}
            onClick={async () => {
              setTesting(true);
              try {
                const result = await api<{ message?: string }>("/system/providers/test", { method: "POST", json: { provider: provider.provider } });
                toast.success(`${provider.label} responded`, result.message || "Connection is working.");
                await onChanged();
              } catch (err) {
                toast.error(`${provider.label} failed`, errorMessage(err));
              } finally {
                setTesting(false);
              }
            }}
          >
            Test connection
          </Button>
          <span className="truncate font-mono text-[9px] text-muted/50">{provider.base_url}</span>
        </div>

        {provider.last_error ? (
          <p className="rounded-xl bg-rose/30 px-3 py-2 text-[10px] leading-relaxed text-[#8f555b]">{provider.last_error}</p>
        ) : null}
      </div>
    </Card>
  );
}

function ApiKeyModal({
  provider,
  onClose,
  onSaved,
}: {
  provider: Provider | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (provider) setValue("");
  }, [provider?.provider]);

  return (
    <Modal
      open={Boolean(provider)}
      onClose={onClose}
      title={provider ? `Connect ${provider.label}` : "Connect a provider"}
      description="The key is written to Windows Credential Manager. It is never stored in the database or in a text file."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={!value.trim()}
            icon={<KeyRound size={13} />}
            onClick={async () => {
              if (!provider) return;
              setSaving(true);
              try {
                await api("/system/credentials", { method: "POST", json: { provider: provider.provider, value: value.trim() } });
                toast.success(`${provider.label} connected`, "The key is saved securely.");
                await onSaved();
              } catch (error) {
                toast.error("Could not save the key", errorMessage(error));
              } finally {
                setSaving(false);
              }
            }}
          >
            Save securely
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="API key">
          <Input type="password" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Paste the key" autoFocus />
        </Field>
        <div className="rounded-xl bg-powder/40 px-3 py-2.5 text-[10.5px] leading-relaxed text-[#5b7088]">
          {provider?.provider === "zen"
            ? "Create an OpenCode Zen API key in your OpenCode account. Models are loaded from the provider's live catalogue."
            : provider?.provider === "openrouter"
              ? "Create an OpenRouter key in your OpenRouter account. Model IDs come from the live OpenRouter catalogue."
              : "Create an ElevenLabs API key in your ElevenLabs profile settings."}
        </div>
        <div className="flex items-start gap-2 rounded-xl bg-peach/30 px-3 py-2 text-[10px] leading-relaxed text-[#8a5f48]">
          <ShieldCheck size={12} className="mt-0.5 shrink-0" />
          Never paste a key into a prompt or a script. Katha Studio does not display a saved key again.
        </div>
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------------- studio */

function StudioTab() {
  const toast = useToast();
  const { settings, providers, refreshSettings, dataVersion, refreshJobs, jobs } = useAppStore();
  const [form, setForm] = useState<Record<string, string>>({});
  const [watcherEnabled, setWatcherEnabled] = useState(true);
  const [watcherInterval, setWatcherInterval] = useState(20);
  const [timezone, setTimezone] = useState("local");
  const [defaultProvider, setDefaultProvider] = useState("zen");
  const [defaultLanguage, setDefaultLanguage] = useState("Hindi");
  const [youtubeCategory, setYoutubeCategory] = useState("24");
  const [saving, setSaving] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const logs = useFetch<{ lines: string[]; path: string }>(() => api("/system/logs?lines=250"), [dataVersion]);
  const backups = useFetch<{ backups: Array<{ name: string; path: string; size: number; created_at: string }> }>(
    () => api("/system/backups"),
    [dataVersion],
  );
  const jobList = useFetch<{ jobs: Job[] }>(() => api("/system/jobs?limit=60"), [dataVersion]);

  useEffect(() => {
    if (!settings) return;
    setForm({ ...(settings.storage_roots || {}) });
    setWatcherEnabled(settings.watcher_enabled ?? true);
    setWatcherInterval(settings.watcher_interval_seconds ?? 20);
    setTimezone(settings.timezone || "local");
    setDefaultProvider(settings.default_provider || "zen");
    setDefaultLanguage(settings.default_language || "Hindi");
    setYoutubeCategory(settings.youtube_category || "24");
  }, [settings]);

  const saveStorage = async () => {
    setSaving(true);
    try {
      await api("/system/settings/storage", {
        method: "PUT",
        json: {
          ...form,
          watcher_enabled: watcherEnabled,
          watcher_interval_seconds: watcherInterval,
          timezone,
          default_provider: defaultProvider,
          default_language: defaultLanguage,
        },
      });
      await refreshSettings();
      toast.success("Studio settings saved", "New storage roots apply to future projects and imports.");
    } catch (error) {
      toast.error("Could not save the settings", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const saveGeneral = async () => {
    setSavingGeneral(true);
    try {
      await api("/system/settings/general", { method: "PUT", json: { youtube_category: youtubeCategory } });
      await refreshSettings();
      toast.success("Defaults saved");
    } catch (error) {
      toast.error("Could not save defaults", errorMessage(error));
    } finally {
      setSavingGeneral(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-6">
          <CardHeader
            title="Storage & workspace folders"
            subtitle="Absolute paths. Katha Studio creates a folder if it does not exist."
            icon={<HardDrive size={16} />}
          />
          <div className="mt-4 space-y-3">
            {STORAGE_FIELDS.map((field) => (
              <Field key={field.key} label={field.label} hint={field.hint}>
                <div className="flex gap-2">
                  <Input
                    value={form[field.key] || ""}
                    onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                    placeholder="Choose an absolute folder path"
                    className="font-mono text-[10.5px]"
                  />
                  <Button
                    variant="secondary"
                    icon={<FolderOpen size={13} />}
                    onClick={async () => {
                      const chosen = await bridge.pickFolder(`Choose ${field.label.toLowerCase()}`);
                      if (chosen) setForm({ ...form, [field.key]: chosen });
                    }}
                  >
                    Pick
                  </Button>
                </div>
              </Field>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Default AI provider">
              <Select value={defaultProvider} onChange={(event) => setDefaultProvider(event.target.value)}>
                {providers
                  .filter((provider) => ["zen", "openrouter"].includes(provider.provider))
                  .map((provider) => (
                    <option key={provider.provider} value={provider.provider}>
                      {provider.label}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Default language">
              <Select value={defaultLanguage} onChange={(event) => setDefaultLanguage(event.target.value)}>
                {LANGUAGES.map((language) => (
                  <option key={language}>{language}</option>
                ))}
              </Select>
            </Field>
            <Field label="Timezone" hint="IANA name or “local”.">
              <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Asia/Kolkata" />
            </Field>
            <Field label="Watch folder interval (seconds)" hint="5–300 seconds.">
              <Input
                type="number"
                min={5}
                max={300}
                value={watcherInterval}
                onChange={(event) => setWatcherInterval(Number(event.target.value))}
              />
            </Field>
          </div>
          <div className="mt-3 flex items-start justify-between gap-4 rounded-xl bg-white/60 p-3">
            <div>
              <p className="text-[11.5px] font-bold">Watch output folders automatically</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
                Detects new videos, validates them with FFprobe and imports them. Duplicates are rejected.
              </p>
            </div>
            <Toggle checked={watcherEnabled} onChange={setWatcherEnabled} label="Watch folders" />
          </div>
          <Button className="mt-4" loading={saving} icon={<Save size={13} />} onClick={() => void saveStorage()}>
            Save storage settings
          </Button>
        </Card>

        <div className="space-y-4">
          <Card className="p-6">
            <CardHeader title="Publishing defaults" subtitle="Used when preparing YouTube uploads" icon={<Youtube size={16} />} />
            <Field label="Default YouTube category" className="mt-4">
              <Select value={youtubeCategory} onChange={(event) => setYoutubeCategory(event.target.value)}>
                {YOUTUBE_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button className="mt-3" size="sm" variant="secondary" loading={savingGeneral} icon={<Save size={12} />} onClick={() => void saveGeneral()}>
              Save defaults
            </Button>
          </Card>

          <Card className="p-6">
            <CardHeader
              title="Backups"
              subtitle="Local SQLite snapshots. No cloud upload."
              icon={<Database size={16} />}
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  loading={backupBusy}
                  icon={<RefreshCw size={12} />}
                  onClick={async () => {
                    setBackupBusy(true);
                    try {
                      const result = await api<{ name: string; path: string }>("/system/backups", { method: "POST" });
                      toast.success("Backup created", result.name);
                      await backups.reload(true);
                    } catch (error) {
                      toast.error("Backup failed", errorMessage(error));
                    } finally {
                      setBackupBusy(false);
                    }
                  }}
                >
                  Create backup
                </Button>
              }
            />
            <div className="mt-3 max-h-[230px] space-y-1.5 overflow-y-auto pr-1">
              {backups.loading ? (
                [1, 2].map((index) => <div key={index} className="skeleton h-12 rounded-xl" />)
              ) : (backups.data?.backups || []).length === 0 ? (
                <p className="rounded-xl bg-white/45 px-3 py-3 text-[10.5px] text-muted">No backups yet.</p>
              ) : (
                (backups.data?.backups || []).map((backup) => (
                  <div key={backup.path} className="flex items-center gap-2 rounded-xl bg-white/50 px-2.5 py-2">
                    <FileText size={12} className="shrink-0 text-muted/50" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[9.5px] text-ink/65">{backup.name}</p>
                      <p className="text-[8.5px] text-muted/60">
                        {formatBytes(backup.size)} · {formatDateTime(backup.created_at)}
                      </p>
                    </div>
                    <IconButton
                      label="Reveal backup"
                      onClick={async () => {
                        const result = await bridge.showItem(backup.path);
                        if (!result.ok) toast.error("Could not reveal the backup", result.error);
                      }}
                    >
                      <ExternalLink size={11} />
                    </IconButton>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-6">
          <CardHeader
            title="Job activity"
            subtitle="Local jobs, progress, retries and real errors"
            icon={<Activity size={16} />}
            action={
              <Button
                size="sm"
                variant="ghost"
                icon={<RefreshCw size={12} />}
                onClick={async () => {
                  await jobList.reload(true);
                  await refreshJobs();
                }}
              >
                Refresh
              </Button>
            }
          />
          <div className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
            {jobList.loading ? (
              [1, 2, 3].map((index) => <div key={index} className="skeleton h-16 rounded-xl" />)
            ) : (jobList.data?.jobs || []).length === 0 ? (
              <p className="rounded-xl bg-white/45 px-3 py-3 text-[10.5px] text-muted">No jobs have run yet.</p>
            ) : (
              (jobList.data?.jobs || []).map((job) => (
                <div key={job.id} className="rounded-xl border border-ink/[0.05] bg-white/50 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[10.5px] font-bold">
                        {job.type.replace(/_/g, " ")} <span className="font-normal text-muted/50">#{job.id}</span>
                      </p>
                      <p className="mt-0.5 truncate text-[9.5px] text-muted">{job.message || job.error || "—"}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={job.status} />
                      {["queued", "running"].includes(job.status) ? (
                        <IconButton
                          label="Cancel job"
                          onClick={async () => {
                            setCancelling(job.id);
                            try {
                              await api(`/system/jobs/${job.id}/cancel`, { method: "POST" });
                              toast.info("Cancellation requested");
                              await jobList.reload(true);
                              await refreshJobs();
                            } catch (error) {
                              toast.error("Could not cancel", errorMessage(error));
                            } finally {
                              setCancelling(null);
                            }
                          }}
                          disabled={cancelling === job.id}
                        >
                          <X size={11} />
                        </IconButton>
                      ) : null}
                    </div>
                  </div>
                  {["queued", "running"].includes(job.status) ? <Progress value={job.progress} className="mt-1.5" /> : null}
                  {job.error ? <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-[#a95f66]">{job.error}</p> : null}
                  <p className="mt-1 text-[8.5px] text-muted/50">{formatDateTime(job.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-6">
          <CardHeader
            title="Backend log"
            subtitle="The last 250 lines, with secrets redacted"
            icon={<Terminal size={16} />}
            action={
              <div className="flex gap-1">
                <IconButton label="Refresh log" onClick={() => void logs.reload(true)}>
                  <RefreshCw size={12} />
                </IconButton>
                <IconButton
                  label="Open log folder"
                  onClick={async () => {
                    if (!logs.data?.path) return;
                    const result = await bridge.showItem(logs.data.path);
                    if (!result.ok) toast.error("Could not reveal the log", result.error);
                  }}
                >
                  <FolderOpen size={12} />
                </IconButton>
              </div>
            }
          />
          <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl bg-[#2f2b35] p-3 font-mono text-[9px] leading-relaxed text-[#e9e2ef]/80">
            {logs.loading ? "Loading…" : (logs.data?.lines || []).join("\n") || "No log lines yet."}
          </pre>
        </Card>
      </div>

      <div className="rounded-xl bg-powder/35 px-4 py-3 text-[10px] leading-relaxed text-[#5b7088]">
        Job history and logs are stored locally. Secrets are redacted before they reach the log file. Cancelling a job
        asks it to stop at the next safe boundary; a provider request already in flight may still complete.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ diagnostics */

function DiagnosticsTab() {
  const toast = useToast();
  const { dataVersion } = useAppStore();
  const [runKey, setRunKey] = useState(0);
  const diagnostics = useFetch<DiagnosticsResult>(() => api("/system/diagnostics"), [runKey, dataVersion]);
  const info = useFetch<SystemInfo>(() => api("/system/info"), [dataVersion]);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="p-6">
          <CardHeader
            title="Health checks"
            subtitle={diagnostics.data ? `Last run ${formatDateTime(diagnostics.data.time)}` : "Checking local tools"}
            icon={<ShieldCheck size={16} />}
            action={
              <Button
                size="sm"
                variant="secondary"
                loading={diagnostics.loading || busy}
                icon={<RefreshCw size={12} />}
                onClick={async () => {
                  setBusy(true);
                  setRunKey((value) => value + 1);
                  await diagnostics.reload();
                  setBusy(false);
                  toast.info("Diagnostics refreshed");
                }}
              >
                Run checks
              </Button>
            }
          />
          <div className="mt-4 space-y-1.5">
            {diagnostics.loading && !diagnostics.data ? (
              [1, 2, 3, 4].map((index) => <div key={index} className="skeleton h-14 rounded-xl" />)
            ) : diagnostics.error ? (
              <p className="rounded-xl bg-rose/30 px-3 py-2 text-[10.5px] text-[#8f555b]">{diagnostics.error}</p>
            ) : (
              (diagnostics.data?.checks || []).map((check) => (
                <div key={check.name} className="flex items-start gap-3 rounded-xl border border-ink/[0.05] bg-white/50 p-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      check.ok ? "bg-sage/70 text-moss" : "bg-peach/70 text-clay",
                    )}
                  >
                    {check.ok ? <Check size={12} strokeWidth={3} /> : <AlertTriangle size={11} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold">{check.name}</p>
                    <p className="mt-0.5 break-words text-[9.5px] leading-relaxed text-muted">{check.detail}</p>
                  </div>
                  <Badge tone={check.ok ? "sage" : "peach"}>{check.ok ? "OK" : "Attention"}</Badge>
                </div>
              ))
            )}
          </div>
          {diagnostics.data ? (
            <p
              className={cn(
                "mt-3 rounded-xl px-3 py-2 text-[10px] font-semibold",
                diagnostics.data.all_critical_ok ? "bg-sage/40 text-[#50694f]" : "bg-peach/40 text-[#8a5f48]",
              )}
            >
              {diagnostics.data.all_critical_ok
                ? "Critical local tools are available."
                : "A critical local tool needs attention before media work can be reliable."}
            </p>
          ) : null}
        </Card>

        <Card className="p-6">
          <CardHeader title="System" subtitle="Paths and local tool versions" icon={<Laptop size={16} />} />
          <div className="mt-4 space-y-2">
            {info.loading ? (
              [1, 2, 3, 4].map((index) => <div key={index} className="skeleton h-10 rounded-lg" />)
            ) : info.data ? (
              <>
                <InfoLine label="App version" value={`${info.data.app} ${info.data.version}`} />
                <InfoLine label="Platform" value={info.data.platform} />
                <InfoLine label="Python" value={info.data.python} />
                <InfoLine label="Disk free" value={`${info.data.disk_free_gb} GB`} />
                <InfoLine label="Database" value={info.data.database_path} mono />
                <InfoLine label="Workspace" value={info.data.workspace_dir} mono />
                <InfoLine label="Logs" value={info.data.log_dir} mono />
                <InfoLine label="FFmpeg" value={info.data.media_tools.ffmpeg || "Not found"} mono />
                <InfoLine label="FFprobe" value={info.data.media_tools.ffprobe || "Not found"} mono />
                <InfoLine label="Credential store" value={info.data.keyring} />
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<FolderOpen size={12} />}
                    onClick={async () => {
                      const result = await bridge.openPath(info.data?.workspace_dir || "");
                      if (!result.ok) toast.error("Could not open the workspace", result.error);
                    }}
                  >
                    Open workspace
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<FolderOpen size={12} />}
                    onClick={async () => {
                      const result = await bridge.openPath(info.data?.log_dir || "");
                      if (!result.ok) toast.error("Could not open the log folder", result.error);
                    }}
                  >
                    Open logs
                  </Button>
                  <CopyButton value={info.data.database_path} label="Copy DB path" />
                </div>
              </>
            ) : (
              <p className="text-[10.5px] text-muted">{info.error || "System information unavailable."}</p>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <CardHeader title="Claude detection detail" subtitle="What Katha Studio can and cannot see" icon={<Wand2 size={16} />} />
        {info.data?.claude ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-ink/[0.06] bg-white/50 p-4">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-[11.5px] font-bold">
                  <Terminal size={13} /> Claude Code CLI
                </p>
                <Badge tone={info.data.claude.cli.installed ? "sage" : "neutral"} dot>
                  {info.data.claude.cli.installed ? "Installed" : "Not detected"}
                </Badge>
              </div>
              <div className="mt-2 space-y-1 text-[9.5px] leading-relaxed text-muted">
                <p className="break-all font-mono">{info.data.claude.cli.path || "No executable path"}</p>
                <p>Version: {info.data.claude.cli.version || "—"}</p>
                <p>Config folder: {info.data.claude.cli.config_directory_exists ? "present" : "not found"}</p>
                <p>Settings: {info.data.claude.cli.settings_exists ? "present" : "not found"}</p>
                <p>Auth note: {info.data.claude.cli.auth_note}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-ink/[0.06] bg-white/50 p-4">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-[11.5px] font-bold">
                  <Monitor size={13} /> Claude Desktop
                </p>
                <Badge tone={info.data.claude.desktop.installed ? "sage" : "neutral"} dot>
                  {info.data.claude.desktop.installed ? (info.data.claude.desktop.running ? "Running" : "Installed") : "Not detected"}
                </Badge>
              </div>
              <div className="mt-2 space-y-1 text-[9.5px] leading-relaxed text-muted">
                <p className="break-all font-mono">{info.data.claude.desktop.path || "No executable path"}</p>
                <p className="mt-2">{info.data.claude.handoff.note}</p>
                <p>Automatic prompt injection: {info.data.claude.handoff.automatic_prompt_injection ? "yes" : "no"}</p>
              </div>
            </div>
          </div>
        ) : null}
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-peach/30 px-3 py-2 text-[10px] leading-relaxed text-[#8a5f48]">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Katha Studio does not read Claude credentials or inject prompts. The handoff is a real folder and a generated
          master prompt that you open yourself.
        </div>
      </Card>
    </div>
  );
}

function InfoLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink/[0.05] py-1.5 last:border-0">
      <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted/60">{label}</span>
      <span className={cn("max-w-[70%] break-all text-right text-[10px] text-ink/70", mono && "font-mono text-[9px]")}>{value || "—"}</span>
    </div>
  );
}
