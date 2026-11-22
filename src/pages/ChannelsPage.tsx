import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Archive,
  ArrowRight,
  Check,
  Folder,
  FolderOpen,
  Image,
  Languages,
  Mic2,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Sparkles,
  Wand2,
  ExternalLink,
} from "lucide-react";
import { api, bridge } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/AppStore";
import type { Channel } from "@/lib/types";
import { cn, errorMessage, formatDate, statusLabel } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Tabs,
  Textarea,
  Toggle,
} from "@/components/ui";
import { useToast } from "@/components/Toast";

const ACCENTS = ["#c88f78", "#718a70", "#7b8fa8", "#a58bb8", "#b57f8f", "#b09a6a", "#6f9a95", "#9a7f6a"];
const LANGUAGES = ["Hindi", "English", "Hinglish", "Tamil", "Telugu", "Bengali", "Marathi", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Urdu"];
const CATEGORIES = ["Storytelling", "Mythology", "History", "Mystery", "Motivation", "Kids", "Culture", "Documentary", "Comedy", "Education"];

interface ChannelForm {
  name: string;
  description: string;
  category: string;
  language: string;
  accent_color: string;
  animation_style: string;
  music_preferences: string;
  preferred_formats: string[];
  logo_path: string;
  output_folder: string;
  watch_folder: string;
  is_demo: boolean;
}

const emptyForm: ChannelForm = {
  name: "",
  description: "",
  category: "Storytelling",
  language: "Hindi",
  accent_color: "#c88f78",
  animation_style: "",
  music_preferences: "",
  preferred_formats: ["16:9 long-form", "9:16 short"],
  logo_path: "",
  output_folder: "",
  watch_folder: "",
  is_demo: false,
};

export function ChannelsPage() {
  const toast = useToast();
  const { channels, loadingChannels, refreshChannels, setSelectedChannelId } = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<ChannelForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Channel | null>(null);

  const selectedId = searchParams.get("channel");

  useEffect(() => {
    if (!selectedId || !channels.length) return;
    const channel = channels.find((item) => item.id === Number(selectedId));
    if (channel) setSelected(channel);
  }, [selectedId, channels]);

  const openChannel = (channel: Channel) => {
    setSelected(channel);
    setSelectedChannelId(channel.id);
    setSearchParams({ channel: String(channel.id) });
  };

  const closeChannel = () => {
    setSelected(null);
    setSearchParams({});
  };

  const createChannel = async () => {
    if (!form.name.trim()) {
      toast.error("Name your channel", "A channel needs a name before it can hold stories.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        logo_path: form.logo_path || null,
        output_folder: form.output_folder || null,
        watch_folder: form.watch_folder || null,
      };
      const created = await api<Channel>("/channels", { method: "POST", json: payload });
      await refreshChannels();
      setSelectedChannelId(created.id);
      setCreateOpen(false);
      setForm(emptyForm);
      toast.success("Channel created", "A permanent animation workspace was prepared on disk.");
      setSelected(created);
      setSearchParams({ channel: String(created.id) });
    } catch (error) {
      toast.error("Could not create the channel", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-float-in">
      <PageHeader
        eyebrow="Your worlds"
        title="My Channels"
        description="Each channel is a creative universe with its own voice, visual language, permanent Claude animation project and output folders."
        actions={
          <Button icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
            New channel
          </Button>
        }
      />

      {loadingChannels ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((index) => (
            <div key={index} className="skeleton h-64 rounded-3xl" />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={<Radio size={22} />}
            title="No channels yet"
            message="A channel holds your language, visual style, narrator voice and permanent animation workspace. Create one to begin."
            action={
              <Button icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
                Create your first channel
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {channels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} onOpen={() => openChannel(channel)} />
          ))}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="group flex min-h-[230px] flex-col items-center justify-center rounded-3xl border border-dashed border-ink/10 bg-white/25 p-6 text-center transition hover:border-ink/20 hover:bg-white/45"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-ink/35 shadow-sm transition group-hover:text-ink/60">
              <Plus size={20} />
            </div>
            <p className="mt-4 text-[13px] font-bold text-ink/70">Add another world</p>
            <p className="mt-1 max-w-[200px] text-[11px] leading-relaxed text-muted">
              A new channel gets its own folder structure and animation project.
            </p>
          </button>
        </div>
      )}

      <CreateChannelModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        form={form}
        setForm={setForm}
        saving={saving}
        onSubmit={createChannel}
      />

      <ChannelDrawer
        channel={selected}
        onClose={closeChannel}
        onChanged={async () => {
          await refreshChannels();
          if (selected) {
            try {
              const fresh = await api<Channel>(`/channels/${selected.id}`);
              setSelected(fresh);
            } catch {
              // ignore
            }
          }
        }}
      />
    </div>
  );
}

function ChannelCard({ channel, onOpen }: { channel: Channel; onOpen: () => void }) {
  const stats = channel.stats;
  return (
    <Card className="group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
      <div
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: `linear-gradient(90deg, ${channel.accent_color}, ${channel.accent_color}55)` }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-[17px] font-bold text-white/95 shadow-sm"
            style={{ background: `linear-gradient(145deg, ${channel.accent_color}, ${channel.accent_color}bb)` }}
          >
            {channel.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h3 className="display text-[19px] leading-tight">{channel.name}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted/70">
              {channel.category} <span className="text-ink/15">·</span> {channel.language}
            </p>
          </div>
        </div>
        <IconButton label="Open channel" onClick={onOpen}>
          <ArrowRight size={15} />
        </IconButton>
      </div>

      <p className="mt-4 line-clamp-2 min-h-[34px] text-[11.5px] leading-relaxed text-muted">
        {channel.description || "A new creative world waiting for its first story."}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: "Stories", value: stats?.projects ?? 0 },
          { label: "Videos", value: stats?.videos ?? 0 },
          { label: "Published", value: stats?.published ?? 0 },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-white/55 px-2.5 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted/70">{item.label}</p>
            <p className="display mt-0.5 text-[18px] leading-none">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-ink/[0.05] pt-3">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted/70">
          <Folder size={11} />
          {channel.animation_project_path ? "Workspace ready" : "Workspace pending"}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="text-[10.5px] font-bold text-ink/50 transition hover:text-ink"
        >
          Manage →
        </button>
      </div>
    </Card>
  );
}

function CreateChannelModal({
  open,
  onClose,
  form,
  setForm,
  saving,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  form: ChannelForm;
  setForm: (form: ChannelForm) => void;
  saving: boolean;
  onSubmit: () => void;
}) {
  const update = (patch: Partial<ChannelForm>) => setForm({ ...form, ...patch });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a channel"
      description="This prepares a permanent animation project, brand folder and output folders on disk."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} icon={<Sparkles size={14} />} onClick={onSubmit}>
            Create channel
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Channel name">
            <Input
              value={form.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="e.g. The Lantern Library"
              autoFocus
            />
          </Field>
          <Field label="Language">
            <Select value={form.language} onChange={(event) => update({ language: event.target.value })}>
              {LANGUAGES.map((language) => (
                <option key={language}>{language}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="What is this channel about?">
          <Textarea
            value={form.description}
            onChange={(event) => update({ description: event.target.value })}
            placeholder="A warm, cinematic channel retelling Indian folk tales for young adults."
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Select value={form.category} onChange={(event) => update({ category: event.target.value })}>
              {CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </Select>
          </Field>
          <Field label="Accent colour">
            <div className="flex flex-wrap gap-2 pt-1">
              {ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  onClick={() => update({ accent_color: accent })}
                  className={cn(
                    "h-8 w-8 rounded-full border-2 transition",
                    form.accent_color === accent ? "border-ink/60 scale-105" : "border-white/70 hover:scale-105",
                  )}
                  style={{ background: accent }}
                  aria-label={accent}
                />
              ))}
            </div>
          </Field>
        </div>
        <Field label="Preferred formats">
          <div className="flex flex-wrap gap-2 pt-1">
            {["16:9 long-form", "9:16 short", "1:1 square", "4:5 portrait"].map((format) => {
              const active = form.preferred_formats.includes(format);
              return (
                <button
                  key={format}
                  type="button"
                  onClick={() =>
                    update({
                      preferred_formats: active
                        ? form.preferred_formats.filter((item) => item !== format)
                        : [...form.preferred_formats, format],
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                    active
                      ? "border-ink/15 bg-white text-ink shadow-sm"
                      : "border-ink/10 bg-white/40 text-muted hover:bg-white/70",
                  )}
                >
                  {format}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Visual & animation direction" hint="This becomes part of the permanent channel animation guide.">
          <Textarea
            value={form.animation_style}
            onChange={(event) => update({ animation_style: event.target.value })}
            placeholder="Painterly 2D animation, muted earth palette, soft paper texture, slow cinematic camera moves."
          />
        </Field>
        <Field label="Music direction">
          <Input
            value={form.music_preferences}
            onChange={(event) => update({ music_preferences: event.target.value })}
            placeholder="Warm acoustic strings, tabla, gentle ambient beds"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <FolderField
            label="Output folder (finished videos)"
            value={form.output_folder}
            onChange={(value) => update({ output_folder: value })}
            title="Choose the channel output folder"
          />
          <FolderField
            label="Watch folder (optional)"
            value={form.watch_folder}
            onChange={(value) => update({ watch_folder: value })}
            title="Choose a watch folder"
          />
        </div>
        <Field label="Channel logo (optional)">
          <div className="flex items-center gap-2">
            <Input value={form.logo_path} readOnly placeholder="No logo selected" />
            <Button
              variant="secondary"
              size="sm"
              icon={<Image size={13} />}
              onClick={async () => {
                const path = await bridge.pickFile("Choose a channel logo", ["png", "jpg", "jpeg", "webp", "svg"]);
                if (path) update({ logo_path: path });
              }}
            >
              Choose
            </Button>
          </div>
        </Field>
        <div className="flex items-start justify-between gap-4 rounded-xl bg-peach/30 p-3">
          <div>
            <p className="text-[11.5px] font-bold text-ink/80">Create sample/demo channel</p>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
              Adds a clearly labelled fictional demo project you can explore without API keys. Never presented as real research.
            </p>
          </div>
          <Toggle checked={form.is_demo} onChange={(value) => update({ is_demo: value })} label="Demo channel" />
        </div>
      </div>
    </Modal>
  );
}

function FolderField({
  label,
  value,
  onChange,
  title,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  title: string;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Default studio folder" />
        <Button
          variant="secondary"
          size="sm"
          icon={<FolderOpen size={13} />}
          onClick={async () => {
            const path = await bridge.pickFolder(title);
            if (path) onChange(path);
          }}
        >
          Pick
        </Button>
      </div>
    </Field>
  );
}

function ChannelDrawer({
  channel,
  onClose,
  onChanged,
}: {
  channel: Channel | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<"overview" | "workspace" | "voice" | "references">("overview");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [edit, setEdit] = useState<Partial<ChannelForm>>({});

  useEffect(() => {
    setTab("overview");
    setEdit({});
  }, [channel?.id]);

  const assets = useFetch<{ folders: string[]; files: Array<{ name: string; relative_path: string; size: number; kind: string }> }>(
    () => api(`/channels/${channel?.id}/assets`),
    [channel?.id, tab],
    { immediate: Boolean(channel?.id && tab === "workspace") },
  );

  if (!channel) return null;

  const save = async () => {
    setSaving(true);
    try {
      await api(`/channels/${channel.id}`, { method: "PATCH", json: edit });
      await onChanged();
      setEdit({});
      toast.success("Channel updated");
    } catch (error) {
      toast.error("Could not save", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const result = await api<{ ok: boolean; project_path?: string }>(`/channels/${channel.id}/workspace/refresh`, {
        method: "POST",
      });
      toast.success("Workspace refreshed", "Missing folders and guide files were recreated.");
      await onChanged();
      void assets.reload();
      if (result.project_path) {
        // Path is shown in the workspace tab.
      }
    } catch (error) {
      toast.error("Could not refresh workspace", errorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const openFolder = async (path: string | null | undefined) => {
    if (!path) {
      toast.info("No folder yet", "Refresh the workspace to create the channel folders.");
      return;
    }
    const result = await bridge.openPath(path);
    if (!result.ok) toast.error("Could not open the folder", result.error);
  };

  return (
    <Drawer
      open={Boolean(channel)}
      onClose={onClose}
      title={channel.name}
      subtitle={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="lavender">{channel.category}</Badge>
          <Badge tone="neutral">{channel.language}</Badge>
          {channel.is_demo ? <Badge tone="peach">Demo channel</Badge> : null}
        </div>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {tab === "overview" && Object.keys(edit).length > 0 ? (
            <Button loading={saving} onClick={save}>
              Save changes
            </Button>
          ) : null}
          <Button variant="secondary" icon={<FolderOpen size={14} />} onClick={() => openFolder(channel.animation_project_path)}>
            Open workspace
          </Button>
        </>
      }
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "workspace", label: "Workspace" },
            { id: "voice", label: "Voices", count: channel.voice_profiles?.length },
            { id: "references", label: "References", count: channel.reference_styles?.length },
          ]}
        />
      </div>

      {tab === "overview" ? (
        <div className="space-y-6">
          <div
            className="rounded-2xl p-5"
            style={{ background: `linear-gradient(135deg, ${channel.accent_color}22, ${channel.accent_color}08)` }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Channel description</p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink/75">
                  {channel.description || "No description yet. Add one so every AI prompt understands this world."}
                </p>
              </div>
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[20px] font-bold text-white"
                style={{ background: channel.accent_color }}
              >
                {channel.name.slice(0, 1)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Stories", value: channel.stats?.projects ?? 0 },
              { label: "Videos", value: channel.stats?.videos ?? 0 },
              { label: "Published", value: channel.stats?.published ?? 0 },
              { label: "In production", value: channel.stats?.in_production ?? 0 },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-white/60 p-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted/70">{item.label}</p>
                <p className="display mt-1 text-[22px]">{item.value}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="eyebrow mb-2">Editable details</p>
            <div className="grid gap-3">
              <Field label="Name">
                <Input
                  value={edit.name ?? channel.name}
                  onChange={(event) => setEdit({ ...edit, name: event.target.value })}
                />
              </Field>
              <Field label="Description">
                <Textarea
                  value={edit.description ?? channel.description}
                  onChange={(event) => setEdit({ ...edit, description: event.target.value })}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Category">
                  <Select
                    value={edit.category ?? channel.category}
                    onChange={(event) => setEdit({ ...edit, category: event.target.value })}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Language">
                  <Select
                    value={edit.language ?? channel.language}
                    onChange={(event) => setEdit({ ...edit, language: event.target.value })}
                  >
                    {LANGUAGES.map((language) => (
                      <option key={language}>{language}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Animation direction">
                <Textarea
                  value={edit.animation_style ?? channel.animation_style}
                  onChange={(event) => setEdit({ ...edit, animation_style: event.target.value })}
                />
              </Field>
              <Field label="Music direction">
                <Input
                  value={edit.music_preferences ?? channel.music_preferences}
                  onChange={(event) => setEdit({ ...edit, music_preferences: event.target.value })}
                />
              </Field>
            </div>
          </div>

          <div>
            <p className="eyebrow mb-2">Folders</p>
            <div className="space-y-2">
              <FolderRow label="Permanent animation project" path={channel.animation_project_path} onOpen={openFolder} />
              <FolderRow label="Finished video output" path={channel.output_folder} onOpen={openFolder} />
              <FolderRow label="Watch folder" path={channel.watch_folder} onOpen={openFolder} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-ink/[0.06] pt-4">
            <Button variant="secondary" size="sm" loading={refreshing} icon={<RefreshCw size={13} />} onClick={refresh}>
              Refresh workspace
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Archive size={13} />}
              onClick={async () => {
                try {
                  await api(`/channels/${channel.id}/archive?archived=true`, { method: "POST" });
                  toast.success("Channel archived");
                  onClose();
                  await onChanged();
                } catch (error) {
                  toast.error("Could not archive", errorMessage(error));
                }
              }}
            >
              Archive channel
            </Button>
          </div>
        </div>
      ) : null}

      {tab === "workspace" ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-powder/30 p-4 text-[11.5px] leading-relaxed text-[#5b7088]">
            This permanent project is reused for every episode. Claude Code should reuse existing characters, rigs and
            backgrounds instead of creating duplicates.
          </div>
          <FolderRow label="Animation project" path={channel.animation_project_path} onOpen={openFolder} />
          <FolderRow label="Finished outputs" path={channel.output_folder} onOpen={openFolder} />
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" loading={refreshing} icon={<RefreshCw size={13} />} onClick={refresh}>
              Rebuild missing files
            </Button>
          </div>
          {assets.loading ? (
            <div className="space-y-2">
              <div className="skeleton h-8" />
              <div className="skeleton h-8" />
            </div>
          ) : assets.data ? (
            <div>
              <p className="eyebrow mb-2">Files ({assets.data.files.length})</p>
              <div className="max-h-[380px] space-y-1 overflow-y-auto rounded-xl border border-ink/[0.06] bg-white/40 p-2">
                {assets.data.files.length === 0 ? (
                  <p className="px-2 py-3 text-[11.5px] text-muted">No files yet.</p>
                ) : (
                  assets.data.files.map((file) => (
                    <div key={file.relative_path} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-white/70">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[10.5px] text-ink/70">{file.relative_path}</p>
                        <p className="text-[9px] text-muted/60">
                          {file.kind} · {Math.max(1, Math.round(file.size / 1024))} KB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => bridge.showItem(file.relative_path)}
                        className="text-[9px] font-bold text-muted hover:text-ink"
                      >
                        Reveal
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <EmptyState compact title="No workspace files" message="Refresh the workspace to generate the channel structure." />
          )}
        </div>
      ) : null}

      {tab === "voice" ? (
        <div className="space-y-3">
          {channel.voice_profiles?.length ? (
            channel.voice_profiles.map((profile) => (
              <div key={profile.id} className="flex items-start gap-3 rounded-xl border border-ink/[0.06] bg-white/50 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-lavender/60 text-ink/50">
                  <Mic2 size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold">{profile.name}</p>
                  <p className="mt-0.5 text-[10.5px] text-muted">
                    {profile.role} · {profile.provider === "elevenlabs" ? "ElevenLabs" : "Windows voice"} · {profile.language}
                  </p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-muted/80">{profile.description}</p>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              compact
              icon={<Mic2 size={18} />}
              title="No voice profiles"
              message="Create narrator and character voices in the Voice & Music Lab."
            />
          )}
          <p className="text-[10.5px] leading-relaxed text-muted">
            Manage voices in <span className="font-bold text-ink/70">Voice & Music Lab</span>. The channel narrator is
            stored as “{channel.narrator_voice || "not set"}”.
          </p>
        </div>
      ) : null}

      {tab === "references" ? (
        <div className="space-y-3">
          {channel.reference_styles?.length ? (
            channel.reference_styles.map((style) => (
              <div key={style.id} className="rounded-xl border border-ink/[0.06] bg-white/50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-bold">{style.name}</p>
                  <Badge tone="neutral">{style.source_type}</Badge>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">{style.summary}</p>
                <p className="mt-1 text-[9.5px] text-muted/50">{formatDate(style.created_at)}</p>
              </div>
            ))
          ) : (
            <EmptyState
              compact
              icon={<Image size={18} />}
              title="No visual references"
              message="Add local reference clips or images in Create Content to build a reusable style guide."
            />
          )}
        </div>
      ) : null}
    </Drawer>
  );
}

function FolderRow({
  label,
  path,
  onOpen,
}: {
  label: string;
  path: string | null | undefined;
  onOpen: (path: string | null | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-white/50 p-3">
      <Folder size={15} className="shrink-0 text-ink/35" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted/70">{label}</p>
        <p className="mt-0.5 truncate font-mono text-[10px] text-ink/60">{path || "Not configured"}</p>
      </div>
      <IconButton label="Open folder" onClick={() => onOpen(path)} disabled={!path}>
        <ExternalLink size={13} />
      </IconButton>
    </div>
  );
}
