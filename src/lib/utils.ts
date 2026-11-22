import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
  return `${secs}s`;
}

export function formatClock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(value: string | null | undefined, style: "short" | "long" = "short"): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  if (style === "long")
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${date.toLocaleTimeString(
    undefined,
    { hour: "numeric", minute: "2-digit" },
  )}`;
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = date.getTime() - Date.now();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return "just now";
  if (Math.abs(minutes) < 60) return minutes > 0 ? `in ${minutes}m` : `${Math.abs(minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return hours > 0 ? `in ${hours}h` : `${Math.abs(hours)}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return days > 0 ? `in ${days}d` : `${Math.abs(days)}d ago`;
  return formatDate(value);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const STATUS_LABELS: Record<string, string> = {
  IDEA: "Idea",
  RESEARCHING: "Researching",
  SCRIPT_GENERATING: "Writing script",
  SCRIPT_READY: "Script ready",
  AWAITING_VOICE: "Awaiting voice",
  VOICE_READY: "Voice ready",
  PACKAGE_GENERATING: "Packaging",
  READY_FOR_CLAUDE: "Ready for Claude",
  ANIMATION_IN_PROGRESS: "Animating",
  ANIMATION_COMPLETED: "Animation complete",
  AWAITING_REVIEW: "Awaiting review",
  READY_TO_UPLOAD: "Ready to upload",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  FAILED: "Failed",
  ARCHIVED: "Archived",
  queued: "Queued",
  running: "Running",
  uploading: "Uploading",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  generating: "Generating",
  ready: "Ready",
  draft: "Draft",
  manual_ready: "Manual ready",
  uploaded: "Uploaded",
  stale: "Audio stale",
  connected: "Connected",
  not_configured: "Not connected",
  configured: "Connected",
  error: "Error",
  scheduled: "Scheduled",
  published: "Published",
  private: "Private",
  public: "Public",
  unlisted: "Unlisted",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_LABELS[status] || STATUS_LABELS[status.toLowerCase()] || status.replace(/_/g, " ").toLowerCase();
}

export function statusTone(status: string | null | undefined): string {
  const key = (status || "").toLowerCase();
  if (["published", "completed", "ready", "connected", "ready_to_upload", "voice_ready"].includes(key))
    return "sage";
  if (["scheduled", "running", "generating", "uploading", "animating", "animation_in_progress"].includes(key))
    return "blue";
  if (["failed", "error", "stale"].includes(key)) return "rose";
  if (["awaiting_voice", "awaiting_review", "draft", "manual_ready", "idea"].includes(key)) return "peach";
  if (["ready_for_claude", "script_ready", "package_generating"].includes(key)) return "lavender";
  if (["archived", "cancelled"].includes(key)) return "neutral";
  return "neutral";
}

export function truncate(text: string, length = 120): string {
  if (!text) return "";
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

export function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || "Something went wrong.");
}
