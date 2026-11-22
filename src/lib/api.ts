import type { ApiError } from "./types";

export interface BackendInfo {
  url: string;
  token: string;
  port: number;
}

declare global {
  interface Window {
    katha?: {
      getBackendInfo: () => Promise<BackendInfo>;
      getAppInfo: () => Promise<{
        version: string;
        name: string;
        platform: string;
        userData: string;
        logs: string;
        isPackaged: boolean;
      }>;
      pickFolder: (title?: string) => Promise<string | null>;
      pickFile: (options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>;
      pickFiles: (options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string[]>;
      openPath: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
      showItemInFolder: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
      openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
      detectClaude: () => Promise<unknown>;
      launchClaudeDesktop: () => Promise<{ ok: boolean; error?: string }>;
      launchClaudeCode: (folder: string) => Promise<{ ok: boolean; error?: string }>;
    };
  }
}

let backendPromise: Promise<BackendInfo> | null = null;

export function getBackend(): Promise<BackendInfo> {
  if (!backendPromise) {
    backendPromise = (async () => {
      if (window.katha) return window.katha.getBackendInfo();
      return {
        url: "http://127.0.0.1:8765",
        token: localStorage.getItem("katha-dev-token") || "",
        port: 8765,
      };
    })();
  }
  return backendPromise;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown; timeout?: number } = {},
): Promise<T> {
  const backend = await getBackend();
  const { json, timeout = 120_000, ...rest } = options;
  const headers = new Headers(rest.headers);
  headers.set("X-Katha-Token", backend.token);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  let response: Response;
  try {
    response = await fetch(`${backend.url}/api${path}`, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      signal: controller.signal,
    });
  } catch (error) {
    window.clearTimeout(timer);
    if ((error as Error).name === "AbortError") {
      const err = new Error("The studio service took too long to respond. Try again.") as ApiError;
      throw err;
    }
    const err = new Error(
      "Katha Studio cannot reach its local service. Restart the app and check Diagnostics.",
    ) as ApiError;
    throw err;
  }
  window.clearTimeout(timer);
  if (!response.ok) {
    let detail = `Request failed (${response.status}).`;
    try {
      const payload = await response.json();
      if (typeof payload.detail === "string") detail = payload.detail;
      else if (Array.isArray(payload.detail))
        detail = payload.detail.map((item: { msg?: string }) => item.msg || "Invalid value").join(". ");
      else if (payload.detail) detail = JSON.stringify(payload.detail);
    } catch {
      // keep default detail
    }
    const err = new Error(detail) as ApiError;
    err.status = response.status;
    throw err;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function mediaUrl(kind: string, id: number | string): Promise<string> {
  const backend = await getBackend();
  return `${backend.url}/api/media/${kind}/${id}?token=${encodeURIComponent(backend.token)}`;
}

export async function uploadFiles(
  files: File[],
  channelId?: number | null,
): Promise<{ assets: Array<{ id: number; name: string; kind: string; path: string; metadata: Record<string, unknown> }> }> {
  const backend = await getBackend();
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  if (channelId) form.append("channel_id", String(channelId));
  const response = await fetch(`${backend.url}/api/content/uploads`, {
    method: "POST",
    headers: { "X-Katha-Token": backend.token },
    body: form,
  });
  if (!response.ok) {
    let detail = "Upload failed.";
    try {
      const payload = await response.json();
      detail = typeof payload.detail === "string" ? payload.detail : detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return response.json();
}

export const bridge = {
  async pickFolder(title?: string): Promise<string | null> {
    if (window.katha) return window.katha.pickFolder(title);
    return window.prompt(title || "Folder path") || null;
  },
  async pickFile(title?: string, extensions?: string[]): Promise<string | null> {
    if (window.katha)
      return window.katha.pickFile({
        title,
        filters: extensions ? [{ name: "Supported files", extensions }] : undefined,
      });
    return window.prompt(title || "File path") || null;
  },
  async pickFiles(title?: string, extensions?: string[]): Promise<string[]> {
    if (window.katha)
      return window.katha.pickFiles({
        title,
        filters: extensions ? [{ name: "Supported files", extensions }] : undefined,
      });
    return [];
  },
  async openPath(targetPath: string): Promise<{ ok: boolean; error?: string }> {
    if (window.katha) return window.katha.openPath(targetPath);
    return { ok: false, error: "Opening folders is available in the desktop app." };
  },
  async showItem(targetPath: string): Promise<{ ok: boolean; error?: string }> {
    if (window.katha) return window.katha.showItemInFolder(targetPath);
    return { ok: false, error: "Revealing files is available in the desktop app." };
  },
  async openExternal(url: string): Promise<{ ok: boolean; error?: string }> {
    if (window.katha) return window.katha.openExternal(url);
    window.open(url, "_blank", "noopener,noreferrer");
    return { ok: true };
  },
  async launchClaudeDesktop(): Promise<{ ok: boolean; error?: string }> {
    if (window.katha) return window.katha.launchClaudeDesktop();
    return { ok: false, error: "Claude launch is available in the desktop app." };
  },
  async launchClaudeCode(folder: string): Promise<{ ok: boolean; error?: string }> {
    if (window.katha) return window.katha.launchClaudeCode(folder);
    return { ok: false, error: "Claude Code launch is available in the desktop app." };
  },
  async appInfo() {
    if (window.katha) return window.katha.getAppInfo();
    return null;
  },
};
