import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Clapperboard,
  Clock3,
  Feather,
  FileText,
  Film,
  Image,
  Lightbulb,
  Loader2,
  Paperclip,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { api, uploadFiles } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { useAppStore } from "@/store/AppStore";
import type { IdeationSession, Job } from "@/lib/types";
import { cn, errorMessage, formatDate, formatDuration, truncate } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Progress,
  Select,
  Tabs,
  Textarea,
  Toggle,
} from "@/components/ui";
import { ProviderModelPicker } from "@/components/shared";
import { useToast } from "@/components/Toast";

const SEEDS = [
  "A forgotten folk tale with a quiet, hopeful ending",
  "A true historical mystery told like a thriller",
  "A mythological story reimagined for young adults",
  "A small-town legend that may or may not be true",
  "A motivational story about failing forward",
];

const CATEGORIES = ["Storytelling", "Mythology", "History", "Mystery", "Motivation", "Kids", "Culture", "Documentary", "Comedy", "Education"];
const LANGUAGES = ["Hindi", "English", "Hinglish", "Tamil", "Telugu", "Bengali", "Marathi", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Urdu"];
const TONES = ["Cinematic", "Warm & intimate", "Suspenseful", "Playful", "Reflective", "Epic", "Documentary calm"];
const ASPECTS = ["16:9", "9:16", "1:1", "4:5"];

export function CreateContentPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { channels, selectedChannelId, setSelectedChannelId, refreshChannels, dataVersion } = useAppStore();
  const [form, setForm] = useState({
    prompt: "",
    input_text: "",
    category: "Storytelling",
    language: "Hindi",
    audience: "General audience",
    video_count: 5,
    desired_duration: 10,
    aspect_ratio: "16:9",
    content_form: "long-form",
    series_mode: "smart",
    animation_style: "",
    voice_style: "",
    research_depth: "standard",
    tone: "Cinematic",
    provider: "zen",
    model: "",
    demo: false,
  });
  const [assets, setAssets] = useState<Array<{ id: number; name: string; kind: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState<IdeationSession | null>(null);
  const [selectedIdeas, setSelectedIdeas] = useState<number[]>([]);
  const [scriptJob, setScriptJob] = useState<Job | null>(null);
  const [activeTab, setActiveTab] = useState<"plan" | "history">("plan");
  const fileInput = useRef<HTMLInputElement>(null);

  const channelId = selectedChannelId || channels[0]?.id || null;
  const channel = channels.find((item) => item.id === channelId);

  const history = useFetch<{ sessions: IdeationSession[] }>(
    () => api(`/content/ideation${channelId ? `?channel_id=${channelId}` : ""}`),
    [channelId, dataVersion],
  );

  useEffect(() => {
    if (!channel) return;
    setForm((current) => ({
      ...current,
      language: current.language === "Hindi" && channel.language ? channel.language : current.language,
      category: current.category === "Storytelling" && channel.category ? channel.category : current.category,
      animation_style: current.animation_style || channel.animation_style || "",
    }));
  }, [channel?.id]);

  useEffect(() => {
    if (!session || session.status !== "generating") return;
    const id = window.setInterval(async () => {
      try {
        const fresh = await api<IdeationSession>(`/content/ideation/${session.id}`);
        setSession(fresh);
        if (fresh.status === "ready") {
          setSelectedIdeas(fresh.ideas.slice(0, 2).map((idea) => idea.id));
        }
        if (fresh.status === "failed") {
          toast.error("Idea generation failed", fresh.error || "Check the provider settings and try again.");
        }
      } catch {
        // keep polling
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [session?.id, session?.status, toast]);

  useEffect(() => {
    if (!scriptJob) return;
    const id = window.setInterval(async () => {
      try {
        const fresh = await api<Job>(`/system/jobs/${scriptJob.id}`);
        setScriptJob(fresh);
        if (fresh.status === "completed") {
          window.clearInterval(id);
          const freshSession = await api<IdeationSession>(`/content/ideation/${session?.id}`);
          setSession(freshSession);
          void history.reload(true);
          void refreshChannels();
          toast.success("Scripts are ready", "Open Story & Script Studio to review the scenes and dialogue.");
          const projectId = freshSession.ideas.find((idea) => idea.project_id)?.project_id;
          if (projectId) navigate(`/scripts?project=${projectId}`);
        } else if (fresh.status === "failed") {
          window.clearInterval(id);
          toast.error("Script generation failed", fresh.error || "Review the job details and try again.");
        }
      } catch {
        // keep polling
      }
    }, 2200);
    return () => window.clearInterval(id);
  }, [scriptJob?.id, session?.id]);

  const update = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const attachFiles = async (files: FileList | null) => {
    if (!files?.length || !channelId) return;
    setUploading(true);
    try {
      const result = await uploadFiles(Array.from(files), channelId);
      setAssets((current) => [...current, ...result.assets.map((asset) => ({ id: asset.id, name: asset.name, kind: asset.kind }))]);
      toast.success("Reference attached", "It will be analysed locally and included as source context.");
    } catch (error) {
      toast.error("Upload failed", errorMessage(error));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const addUrl = async () => {
    if (!urlInput.trim()) return;
    try {
      const result = await api<{ accessible: boolean; note: string; title?: string }>("/content/references/url", {
        method: "POST",
        json: { url: urlInput.trim() },
      });
      setReferenceUrls((current) => [...current, urlInput.trim()]);
      toast.info(result.accessible ? "Link added as context" : "Link added, but not readable", result.note);
      setUrlInput("");
    } catch (error) {
      toast.error("Could not inspect the link", errorMessage(error));
    }
  };

  const submit = async () => {
    if (!channelId) {
      toast.error("Choose a channel first");
      return;
    }
    if (!form.prompt.trim() && !form.input_text.trim() && assets.length === 0) {
      toast.error("Give the studio a spark", "Describe an idea, paste source material, or attach a reference.");
      return;
    }
    setSubmitting(true);
    setScriptJob(null);
    try {
      const result = await api<{ session: IdeationSession; job: Job }>("/content/ideation", {
        method: "POST",
        json: {
          channel_id: channelId,
          ...form,
          reference_urls: referenceUrls,
          asset_ids: assets.map((asset) => asset.id),
        },
      });
      setSession(result.session);
      setSelectedIdeas([]);
      setActiveTab("plan");
      void history.reload(true);
    } catch (error) {
      toast.error("Could not start idea generation", errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const generateScripts = async () => {
    if (!session || selectedIdeas.length === 0) return;
    try {
      const result = await api<{ job: Job }>(`/content/ideation/${session.id}/scripts`, {
        method: "POST",
        json: { idea_ids: selectedIdeas, provider: form.provider, model: form.model },
      });
      setScriptJob(result.job);
      toast.info("Writing your scripts", "This can take a few minutes for a multi-part story.");
    } catch (error) {
      toast.error("Could not start script generation", errorMessage(error));
    }
  };

  const ideas = session?.ideas || [];
  const isGenerating = session?.status === "generating";
  const scriptsRunning = scriptJob && ["queued", "running"].includes(scriptJob.status);
  const demoIdeas = ideas.some((idea) => session?.is_demo);

  return (
    <div className="animate-float-in">
      <PageHeader
        eyebrow="From spark to story"
        title="Create Content"
        description="Describe what you want to make. Katha Studio develops a structure, researches where it can, and proposes story ideas before writing a single line of script."
        actions={
          <Tabs
            value={activeTab}
            onChange={setActiveTab}
            tabs={[
              { id: "plan", label: "New plan" },
              { id: "history", label: "History", count: history.data?.sessions.length },
            ]}
          />
        }
      />

      {activeTab === "history" ? (
        <HistoryPanel
          sessions={history.data?.sessions || []}
          loading={history.loading}
          onOpen={(item) => {
            setSession(item);
            setActiveTab("plan");
            setSelectedIdeas(item.ideas.slice(0, 2).map((idea) => idea.id));
          }}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-4">
            <Card className="p-6">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-peach/70 text-clay">
                  <Lightbulb size={14} />
                </span>
                <div>
                  <p className="text-[12.5px] font-bold">The spark</p>
                  <p className="text-[10.5px] text-muted">What should this story make people feel?</p>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <Field label="Channel">
                  <Select
                    value={channelId || ""}
                    onChange={(event) => setSelectedChannelId(Number(event.target.value))}
                  >
                    {channels.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.language}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Describe the idea or theme">
                  <Textarea
                    value={form.prompt}
                    onChange={(event) => update({ prompt: event.target.value })}
                    placeholder="A cinematic retelling of a little-known Indian folk tale about a lantern keeper who guides lost travellers…"
                    className="min-h-[104px]"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SEEDS.map((seed) => (
                      <button
                        key={seed}
                        type="button"
                        onClick={() => update({ prompt: seed })}
                        className="rounded-full border border-ink/[0.07] bg-white/50 px-2.5 py-1 text-[10px] font-semibold text-muted transition hover:bg-white hover:text-ink"
                      >
                        {truncate(seed, 38)}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Source material (optional)" hint="Paste research notes, a story draft or factual material. It is treated as source context, not instructions.">
                  <Textarea
                    value={form.input_text}
                    onChange={(event) => update({ input_text: event.target.value })}
                    placeholder="Paste source notes, a rough story, or facts that must remain accurate…"
                    className="min-h-[86px]"
                  />
                </Field>

                <div>
                  <label className="field-label">References</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="flex items-center gap-1.5 rounded-xl border border-dashed border-ink/15 bg-white/40 px-3 py-2 text-[11px] font-bold text-ink/60 transition hover:bg-white/80"
                    >
                      {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                      Attach files
                    </button>
                    <input
                      ref={fileInput}
                      type="file"
                      multiple
                      className="hidden"
                      accept="video/*,audio/*,image/*,.pdf,.docx,.txt,.md,.json,.srt,.vtt,.csv"
                      onChange={(event) => void attachFiles(event.target.files)}
                    />
                    <span className="self-center text-[10px] text-muted/60">Video, audio, image, PDF, DOCX, text</span>
                  </div>
                  {assets.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {assets.map((asset) => (
                        <span key={asset.id} className="chip">
                          <Paperclip size={10} /> {truncate(asset.name, 24)}
                          <button
                            type="button"
                            onClick={() => setAssets((current) => current.filter((item) => item.id !== asset.id))}
                            className="text-muted/50 hover:text-ink"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div>
                  <label className="field-label">Reference links</label>
                  <div className="flex gap-2">
                    <Input
                      value={urlInput}
                      onChange={(event) => setUrlInput(event.target.value)}
                      placeholder="https://…"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void addUrl();
                        }
                      }}
                    />
                    <Button variant="secondary" size="md" onClick={() => void addUrl()}>
                      Add
                    </Button>
                  </div>
                  {referenceUrls.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {referenceUrls.map((url) => (
                        <div key={url} className="flex items-center justify-between gap-2 rounded-lg bg-white/50 px-2 py-1.5">
                          <span className="truncate text-[10px] text-muted">{url}</span>
                          <button
                            type="button"
                            onClick={() => setReferenceUrls((current) => current.filter((item) => item !== url))}
                            className="text-muted/50 hover:text-ink"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-1.5 text-[10px] leading-relaxed text-muted/70">
                    Links are context only. Katha Studio does not download or copy media from platforms without a file
                    you own.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <p className="text-[12.5px] font-bold">Shape the production</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Category">
                  <Select value={form.category} onChange={(event) => update({ category: event.target.value })}>
                    {CATEGORIES.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Language">
                  <Select value={form.language} onChange={(event) => update({ language: event.target.value })}>
                    {LANGUAGES.map((language) => (
                      <option key={language}>{language}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Audience">
                  <Input value={form.audience} onChange={(event) => update({ audience: event.target.value })} />
                </Field>
                <Field label="Tone">
                  <Select value={form.tone} onChange={(event) => update({ tone: event.target.value })}>
                    {TONES.map((tone) => (
                      <option key={tone}>{tone}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Aspect ratio">
                  <Select value={form.aspect_ratio} onChange={(event) => update({ aspect_ratio: event.target.value })}>
                    {ASPECTS.map((aspect) => (
                      <option key={aspect}>{aspect}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Format">
                  <Select value={form.content_form} onChange={(event) => update({ content_form: event.target.value })}>
                    <option value="long-form">Long-form</option>
                    <option value="short">Short</option>
                    <option value="series">Series</option>
                  </Select>
                </Field>
                <Field label="Number of ideas">
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={form.video_count}
                    onChange={(event) => update({ video_count: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Target duration (minutes)">
                  <Input
                    type="number"
                    min={1}
                    max={180}
                    value={form.desired_duration}
                    onChange={(event) => update({ desired_duration: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Series approach">
                  <Select value={form.series_mode} onChange={(event) => update({ series_mode: event.target.value })}>
                    <option value="smart">Let the studio decide</option>
                    <option value="single">Single episode</option>
                    <option value="series">Multi-part series</option>
                  </Select>
                </Field>
                <Field label="Research depth">
                  <Select value={form.research_depth} onChange={(event) => update({ research_depth: event.target.value })}>
                    <option value="light">Light — source material only</option>
                    <option value="standard">Standard — careful, no invented facts</option>
                    <option value="deep">Deep — flag every uncertain claim</option>
                  </Select>
                </Field>
              </div>
              <div className="mt-4 grid gap-4">
                <Field label="Animation direction (optional)" hint="Leave blank to inherit the channel direction.">
                  <Input
                    value={form.animation_style}
                    onChange={(event) => update({ animation_style: event.target.value })}
                    placeholder="Painterly, warm, slow camera"
                  />
                </Field>
                <ProviderModelPicker
                  provider={form.provider}
                  model={form.model}
                  onProviderChange={(value) => update({ provider: value })}
                  onModelChange={(value) => update({ model: value })}
                />
              </div>
              <div className="mt-4 flex items-start justify-between gap-4 rounded-xl bg-peach/35 p-3">
                <div>
                  <p className="text-[11.5px] font-bold text-ink/80">Offline demo mode</p>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                    Generates fictional sample ideas and scripts without an API key. Every result is labelled as demo and
                    is never presented as researched fact.
                  </p>
                </div>
                <Toggle checked={form.demo} onChange={(value) => update({ demo: value })} label="Demo mode" />
              </div>
              <Button
                className="mt-4 w-full"
                size="lg"
                loading={submitting}
                icon={<Sparkles size={15} />}
                onClick={() => void submit()}
                disabled={!channelId}
              >
                Develop content ideas
              </Button>
              {!channelId ? (
                <p className="mt-2 text-center text-[10.5px] text-muted">Create a channel before planning content.</p>
              ) : null}
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="min-h-[500px] p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Story ideas</p>
                  <h2 className="display mt-1 text-[22px] leading-tight">
                    {isGenerating ? "Listening for the story…" : ideas.length ? "Choose what to develop" : "Your ideas will appear here"}
                  </h2>
                </div>
                {session?.is_demo ? <Badge tone="peach">Demo content</Badge> : null}
                {session?.provider && !session.is_demo ? <Badge tone="neutral">{session.provider}</Badge> : null}
              </div>

              {!session ? (
                <div className="mt-8">
                  <EmptyState
                    icon={<Feather size={22} />}
                    title="A blank page, held open"
                    message="Describe a spark on the left. The studio will propose structures and ideas for you to approve before any script is written."
                  />
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    {[
                      { icon: Lightbulb, label: "Ideas" },
                      { icon: FileText, label: "Scripts" },
                      { icon: Film, label: "Animation" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl bg-white/45 p-3 text-center">
                        <item.icon size={15} className="mx-auto text-ink/30" />
                        <p className="mt-1.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted/70">{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : isGenerating ? (
                <div className="mt-10 flex flex-col items-center">
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-lavender/50">
                    <span className="absolute inset-0 animate-ping rounded-full bg-lavender/30" />
                    <Loader2 size={26} className="animate-spin text-[#9a88b8]" />
                  </div>
                  <p className="mt-5 text-[13px] font-bold">Developing ideas for {session.channel_name}</p>
                  <p className="mt-1 max-w-xs text-center text-[11.5px] leading-relaxed text-muted">
                    Reading source material, considering structure and writing premises. This usually takes under a minute.
                  </p>
                  <div className="mt-5 w-full max-w-xs">
                    <Progress value={55} tone="slate" />
                  </div>
                </div>
              ) : session.status === "failed" ? (
                <div className="mt-8">
                  <EmptyState
                    icon={<X size={20} />}
                    title="The ideas did not arrive"
                    message={session.error || "Check your AI provider settings and try again."}
                    action={
                      <Button variant="secondary" onClick={() => navigate("/settings")}>
                        Open connections
                      </Button>
                    }
                  />
                </div>
              ) : (
                <>
                  {demoIdeas ? (
                    <div className="mt-4 rounded-xl bg-peach/40 px-3 py-2 text-[10.5px] leading-relaxed text-[#8a5f48]">
                      Demo content is fictional sample material. Do not publish it as researched fact.
                    </div>
                  ) : null}
                  {session.analysis ? (
                    <p className="mt-4 rounded-xl bg-white/50 p-3 text-[11px] leading-relaxed text-muted">{session.analysis}</p>
                  ) : null}
                  <div className="mt-4 space-y-2.5">
                    {ideas.map((idea) => {
                      const active = selectedIdeas.includes(idea.id);
                      return (
                        <button
                          key={idea.id}
                          type="button"
                          onClick={() =>
                            setSelectedIdeas((current) =>
                              current.includes(idea.id) ? current.filter((id) => id !== idea.id) : [...current, idea.id],
                            )
                          }
                          className={cn(
                            "w-full rounded-2xl border p-4 text-left transition",
                            active
                              ? "border-ink/15 bg-white shadow-soft"
                              : "border-ink/[0.06] bg-white/40 hover:border-ink/10 hover:bg-white/70",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={cn(
                                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
                                active ? "border-moss bg-moss text-white" : "border-ink/15 bg-white/70 text-transparent",
                              )}
                            >
                              <Check size={11} strokeWidth={3} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[13px] font-bold leading-snug">{idea.title}</p>
                                <Badge tone={idea.episode_count > 1 ? "lavender" : "neutral"}>
                                  {idea.episode_count > 1 ? `${idea.episode_count} parts` : "Single"}
                                </Badge>
                              </div>
                              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{idea.short_description}</p>
                              {idea.hook ? (
                                <p className="mt-2 border-l-2 border-clay/40 pl-2 text-[10.5px] italic leading-relaxed text-ink/60">
                                  {truncate(idea.hook, 160)}
                                </p>
                              ) : null}
                              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[9.5px] font-semibold text-muted/70">
                                <span className="flex items-center gap-1">
                                  <Clock3 size={10} /> {formatDuration(idea.estimated_duration)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clapperboard size={10} /> {idea.visual_potential ? truncate(idea.visual_potential, 40) : "Visual story"}
                                </span>
                                {idea.project_id ? (
                                  <span className="flex items-center gap-1 text-moss">
                                    <Check size={10} /> Script ready
                                  </span>
                                ) : null}
                              </div>
                              {idea.source_status ? (
                                <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-muted/50">
                                  {idea.source_status}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="sticky bottom-0 mt-4 rounded-2xl border border-white/80 bg-[#fdfbf7]/95 p-3 backdrop-blur">
                    {scriptsRunning ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="flex items-center gap-2">
                            <Loader2 size={13} className="animate-spin text-moss" />
                            {scriptJob?.message || "Writing scripts…"}
                          </span>
                          <span className="text-muted">{Math.round(scriptJob?.progress || 0)}%</span>
                        </div>
                        <Progress value={scriptJob?.progress || 0} />
                        <p className="text-[10px] text-muted">
                          Keep this window open. You can follow the job in the sidebar.
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10.5px] text-muted">
                          {selectedIdeas.length} selected · scripts are written scene by scene
                        </p>
                        <Button
                          size="sm"
                          icon={<Feather size={13} />}
                          disabled={selectedIdeas.length === 0}
                          onClick={() => void generateScripts()}
                        >
                          Write scripts
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </Card>

            {session?.suggested_structure ? (
              <Card className="p-5">
                <p className="eyebrow">Suggested structure</p>
                <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{session.suggested_structure}</p>
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryPanel({
  sessions,
  loading,
  onOpen,
}: {
  sessions: IdeationSession[];
  loading: boolean;
  onOpen: (session: IdeationSession) => void;
}) {
  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((index) => (
          <div key={index} className="skeleton h-40 rounded-3xl" />
        ))}
      </div>
    );
  }
  if (!sessions.length) {
    return (
      <Card className="p-2">
        <EmptyState icon={<Sparkles size={22} />} title="No planning sessions yet" message="Your idea sessions will be saved here with their full history." />
      </Card>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {sessions.map((session) => (
        <button
          key={session.id}
          type="button"
          onClick={() => onOpen(session)}
          className="surface p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lift"
        >
          <div className="flex items-start justify-between gap-2">
            <Badge tone={session.is_demo ? "peach" : session.status === "ready" ? "sage" : "neutral"}>
              {session.is_demo ? "Demo" : session.status}
            </Badge>
            <span className="text-[9.5px] font-semibold text-muted/60">{formatDate(session.created_at)}</span>
          </div>
          <p className="mt-3 line-clamp-2 text-[13px] font-bold leading-snug">
            {String((session.request as Record<string, unknown>)?.prompt || "Untitled planning session")}
          </p>
          <p className="mt-1 text-[10.5px] text-muted">
            {session.channel_name} · {session.ideas.length} ideas
          </p>
          <div className="mt-3 flex items-center gap-2 text-[10px] font-semibold text-ink/50">
            <ArrowRight size={12} /> Review ideas
          </div>
        </button>
      ))}
    </div>
  );
}
