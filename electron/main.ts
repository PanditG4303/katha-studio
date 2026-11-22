import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import { spawn, ChildProcess, execFile } from "child_process";
import crypto from "crypto";
import fs from "fs";
import net from "net";
import path from "path";
import { pathToFileURL } from "url";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const APP_NAME = "Katha Studio";
let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendInfo: { url: string; token: string; port: number } | null = null;
let shuttingDown = false;

function projectRoot(): string {
  return isDev ? path.resolve(__dirname, "..") : app.getAppPath();
}

function logDir(): string {
  const dir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function appIconPath(): string | undefined {
  const candidate = path.join(projectRoot(), "build", "icon.ico");
  return fs.existsSync(candidate) ? candidate : undefined;
}

function appendLog(message: string): void {
  try {
    const line = `${new Date().toISOString()} ${message}\n`;
    fs.appendFileSync(path.join(logDir(), "desktop.log"), line);
  } catch {
    // Logging must never take down the app.
  }
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function backendExecutable(): { command: string; args: string[]; cwd: string; kind: string } {
  if (app.isPackaged) {
    const exe = path.join(process.resourcesPath, "backend", "katha-backend", "katha-backend.exe");
    if (fs.existsSync(exe)) {
      return { command: exe, args: [], cwd: path.dirname(exe), kind: "packaged" };
    }
    const alt = path.join(process.resourcesPath, "backend", "katha-backend.exe");
    if (fs.existsSync(alt)) {
      return { command: alt, args: [], cwd: path.dirname(alt), kind: "packaged" };
    }
    throw new Error("The packaged Katha Studio backend was not found. Reinstall the application.");
  }
  const root = projectRoot();
  const venvPython = path.join(root, "backend", ".venv", "Scripts", "python.exe");
  const python = fs.existsSync(venvPython) ? venvPython : "python";
  return {
    command: python,
    args: ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1"],
    cwd: path.join(root, "backend"),
    kind: "development",
  };
}

function mediaToolPath(name: string): string | null {
  const root = projectRoot();
  const candidates = [
    path.join(root, "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.join(root, "node_modules", "ffprobe-static", "bin", "win32", "x64", "ffprobe.exe"),
    path.join(process.resourcesPath, "tools", name === "ffprobe" ? "ffprobe.exe" : "ffmpeg.exe"),
  ];
  const match = candidates.find((candidate) => candidate.includes(name) && fs.existsSync(candidate));
  return match || null;
}

async function startBackend(): Promise<void> {
  const port = await findFreePort();
  const token = crypto.randomBytes(32).toString("hex");
  const target = backendExecutable();
  const logStream = fs.createWriteStream(path.join(logDir(), "backend-process.log"), { flags: "a" });
  const ffmpeg = mediaToolPath("ffmpeg");
  const ffprobe = mediaToolPath("ffprobe");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    KATHA_API_TOKEN: token,
    KATHA_PORT: String(port),
    KATHA_HOST: "127.0.0.1",
    KATHA_LOG_LEVEL: isDev ? "INFO" : "INFO",
    PYTHONUNBUFFERED: "1",
    ...(ffmpeg ? { KATHA_FFMPEG_PATH: ffmpeg } : {}),
    ...(ffprobe ? { KATHA_FFPROBE_PATH: ffprobe } : {}),
  };
  const args = target.kind === "packaged" ? [...target.args] : [...target.args, "--port", String(port)];
  appendLog(`Starting backend (${target.kind}) on port ${port}`);
  backendProcess = spawn(target.command, args, {
    cwd: target.cwd,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  backendProcess.stdout?.pipe(logStream);
  backendProcess.stderr?.pipe(logStream);
  backendProcess.on("error", (error) => {
    appendLog(`Backend process error: ${error.message}`);
  });
  backendProcess.on("exit", (code, signal) => {
    appendLog(`Backend exited code=${code} signal=${signal}`);
    if (!shuttingDown && mainWindow) {
      dialog.showErrorBox(
        "Katha Studio backend stopped",
        "The local studio service stopped unexpectedly. Your saved projects are safe. Restart Katha Studio and check Diagnostics."
      );
    }
  });
  backendInfo = { url: `http://127.0.0.1:${port}`, token, port };
  await waitForBackend(port);
}

async function waitForBackend(port: number): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (backendProcess?.exitCode !== null && backendProcess?.exitCode !== undefined) {
      throw new Error("The local studio service exited while starting.");
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        appendLog("Backend health check passed");
        return;
      }
    } catch {
      // Not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  throw new Error("The local studio service did not become ready in time.");
}

function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 520,
    height: 340,
    frame: false,
    resizable: false,
    show: true,
    alwaysOnTop: true,
    backgroundColor: "#fbf8f2",
    icon: appIconPath(),
    webPreferences: { sandbox: true },
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;height:100vh;background:radial-gradient(circle at 25% 15%,#efe7f7,transparent 55%),radial-gradient(circle at 90% 80%,#e6efe2,transparent 50%),#fbf8f2;font-family:Segoe UI,sans-serif;color:#3f3a46;display:flex;align-items:center;justify-content:center;-webkit-app-region:drag}
  .wrap{text-align:center}.mark{width:76px;height:76px;margin:0 auto 24px;border-radius:26px;background:linear-gradient(145deg,#e9def5,#d7e6f2);display:grid;place-items:center;box-shadow:0 18px 50px -20px rgba(78,62,92,.45)}
  .lamp{width:32px;height:38px;position:relative}.flame{width:15px;height:21px;border-radius:50% 50% 45% 45%;background:linear-gradient(#f5cfa8,#d69b78);margin:0 auto;transform:rotate(2deg);box-shadow:0 0 22px #eac7a8}
  .base{width:30px;height:3px;border-radius:3px;background:#8f7f9f;margin-top:9px}.stem{width:3px;height:8px;background:#8f7f9f;margin:0 auto}
  h1{font-family:Georgia,serif;font-weight:500;letter-spacing:.02em;font-size:29px;margin:0 0 8px}p{color:#817889;font-size:13px;margin:0;letter-spacing:.03em}.bar{width:180px;height:3px;background:#eee6de;border-radius:4px;overflow:hidden;margin:28px auto 0}.bar span{display:block;height:100%;width:35%;border-radius:4px;background:linear-gradient(90deg,#c8a6c2,#9fb7a8);animation:move 1.5s ease-in-out infinite}@keyframes move{0%{transform:translateX(-110%)}100%{transform:translateX(330%)}}
  </style></head><body><div class="wrap"><div class="mark"><div class="lamp"><div class="flame"></div><div class="stem"></div><div class="base"></div></div></div><h1>Katha Studio</h1><p>Preparing your creative studio…</p><div class="bar"><span></span></div></div></body></html>`;
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  splashWindow.on("closed", () => (splashWindow = null));
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    backgroundColor: "#fbf8f2",
    title: APP_NAME,
    icon: appIconPath(),
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#fbf8f2",
      symbolColor: "#4c4555",
      height: 42,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl && url.startsWith(devUrl)) return;
    if (url.startsWith("file://")) return;
    event.preventDefault();
  });

  mainWindow.once("ready-to-show", () => {
    splashWindow?.close();
    mainWindow?.show();
  });
  if (isDev) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL as string);
  } else {
    await mainWindow.loadFile(path.join(projectRoot(), "dist", "index.html"));
  }
  // The page is loaded at this point. Show the window even if the
  // ready-to-show event fired before the listener could observe it.
  splashWindow?.close();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.on("closed", () => (mainWindow = null));
}

function installCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const devOrigins = isDev ? " http://localhost:5173 ws://localhost:5173" : "";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " http://localhost:5173" : ""}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: http://127.0.0.1:* https://img.youtube.com https://i.ytimg.com",
      "media-src 'self' blob: http://127.0.0.1:*",
      `connect-src 'self' http://127.0.0.1:*${devOrigins} https://www.googleapis.com https://oauth2.googleapis.com`,
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; ");
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}

function registerIpc(): void {
  ipcMain.handle("backend-info", () => {
    if (!backendInfo) throw new Error("The backend is not ready yet.");
    return backendInfo;
  });

  ipcMain.handle("app-info", () => ({
    version: app.getVersion(),
    name: APP_NAME,
    platform: process.platform,
    userData: app.getPath("userData"),
    logs: logDir(),
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle("pick-folder", async (_event, title?: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: title || "Choose a folder",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("pick-file", async (_event, options?: { title?: string; filters?: Electron.FileFilter[] }) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: options?.title || "Choose a file",
      properties: ["openFile"],
      filters: options?.filters,
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("pick-files", async (_event, options?: { title?: string; filters?: Electron.FileFilter[] }) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: options?.title || "Choose files",
      properties: ["openFile", "multiSelections"],
      filters: options?.filters,
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("open-path", async (_event, targetPath: string) => {
    if (!targetPath || !fs.existsSync(targetPath)) return { ok: false, error: "This file or folder no longer exists." };
    const lower = targetPath.toLowerCase();
    const blocked = [".exe", ".bat", ".cmd", ".ps1", ".vbs", ".msi", ".scr"];
    if (blocked.some((extension) => lower.endsWith(extension))) {
      return { ok: false, error: "Executable files are opened through approved actions only." };
    }
    const result = await shell.openPath(targetPath);
    return result ? { ok: false, error: result } : { ok: true };
  });

  ipcMain.handle("show-item", async (_event, targetPath: string) => {
    if (!targetPath || !fs.existsSync(targetPath)) return { ok: false, error: "This file or folder no longer exists." };
    shell.showItemInFolder(targetPath);
    return { ok: true };
  });

  ipcMain.handle("open-external", async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: "Only http(s) links can be opened." };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle("detect-claude", async () => detectClaude());

  ipcMain.handle("launch-claude-desktop", async () => {
    const detection = await detectClaude();
    if (!detection.desktop.path) {
      return { ok: false, error: "Claude Desktop was not detected. Install it from Anthropic or use Claude Code." };
    }
    const child = spawn(detection.desktop.path, [], { detached: true, stdio: "ignore", windowsHide: false });
    child.unref();
    return { ok: true };
  });

  ipcMain.handle("launch-claude-code", async (_event, folder: string) => {
    if (!folder || !fs.existsSync(folder)) {
      return { ok: false, error: "The channel animation folder does not exist yet." };
    }
    const detection = await detectClaude();
    if (!detection.cli.path) {
      return { ok: false, error: "The official Claude Code CLI was not detected. Install and sign in to Claude Code first." };
    }
    try {
      const wt = findOnPath("wt.exe");
      if (wt) {
        const child = spawn(wt, ["-d", folder, "cmd.exe", "/k", `"${detection.cli.path}"`], {
          detached: true,
          stdio: "ignore",
          windowsHide: false,
        });
        child.unref();
      } else {
        const child = spawn("cmd.exe", ["/c", "start", "", "cmd.exe", "/k", `"${detection.cli.path}"`], {
          cwd: folder,
          detached: true,
          stdio: "ignore",
          windowsHide: false,
        });
        child.unref();
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: `Could not open Claude Code: ${(error as Error).message}` };
    }
  });
}

function findOnPath(command: string): string | null {
  const pathEnv = process.env.PATH || "";
  const extensions = [".exe", ".cmd", ".bat", ""];
  for (const dir of pathEnv.split(path.delimiter)) {
    for (const extension of extensions) {
      const candidate = path.join(dir, command.endsWith(extension) ? command : `${command}${extension}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function claudeDesktopCandidates(): string[] {
  const local = process.env.LOCALAPPDATA || path.join(app.getPath("home"), "AppData", "Local");
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  return [
    path.join(local, "AnthropicClaude", "claude.exe"),
    path.join(local, "Programs", "Claude", "Claude.exe"),
    path.join(local, "Programs", "claude", "Claude.exe"),
    path.join(local, "Claude", "Claude.exe"),
    path.join(local, "AnthropicClaude", "Claude.exe"),
    path.join(programFiles, "Claude", "Claude.exe"),
    path.join(programFilesX86, "Claude", "Claude.exe"),
  ];
}

async function detectClaude(): Promise<{
  desktop: { installed: boolean; path: string };
  cli: { installed: boolean; path: string; version: string };
}> {
  const desktopPath = claudeDesktopCandidates().find((candidate) => fs.existsSync(candidate)) || "";
  const cliPath = findOnPath("claude.exe") || findOnPath("claude.cmd") || "";
  let version = "";
  if (cliPath) {
    version = await new Promise<string>((resolve) => {
      execFile(cliPath, ["--version"], { timeout: 8000, windowsHide: true }, (error, stdout, stderr) => {
        if (error) return resolve("");
        resolve((stdout || stderr || "").trim().split(/\r?\n/)[0] || "");
      });
    });
  }
  return {
    desktop: { installed: Boolean(desktopPath), path: desktopPath },
    cli: { installed: Boolean(cliPath), path: cliPath, version },
  };
}

function killBackend(): void {
  if (!backendProcess || !backendProcess.pid) return;
  try {
    spawn("taskkill", ["/pid", String(backendProcess.pid), "/T", "/F"], { windowsHide: true });
  } catch {
    try {
      backendProcess.kill();
    } catch {
      // ignore
    }
  }
  backendProcess = null;
}

app.setAppUserModelId("studio.katha.app");
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    installCsp();
    registerIpc();
    createSplash();
    try {
      await startBackend();
      await createWindow();
    } catch (error) {
      appendLog(`Startup failed: ${(error as Error).stack || error}`);
      splashWindow?.close();
      dialog.showErrorBox(
        "Katha Studio could not start",
        `${(error as Error).message}\n\nCheck ${path.join(logDir(), "backend-process.log")} and run setup again if needed.`
      );
      app.quit();
    }
  });

  app.on("before-quit", () => {
    shuttingDown = true;
    killBackend();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && backendInfo) createWindow();
});
