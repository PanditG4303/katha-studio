import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("katha", {
  getBackendInfo: () => ipcRenderer.invoke("backend-info"),
  getAppInfo: () => ipcRenderer.invoke("app-info"),
  pickFolder: (title?: string) => ipcRenderer.invoke("pick-folder", title),
  pickFile: (options?: { title?: string; filters?: Electron.FileFilter[] }) =>
    ipcRenderer.invoke("pick-file", options),
  pickFiles: (options?: { title?: string; filters?: Electron.FileFilter[] }) =>
    ipcRenderer.invoke("pick-files", options),
  openPath: (targetPath: string) => ipcRenderer.invoke("open-path", targetPath),
  showItemInFolder: (targetPath: string) => ipcRenderer.invoke("show-item", targetPath),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  detectClaude: () => ipcRenderer.invoke("detect-claude"),
  detectAntigravity: () => ipcRenderer.invoke("detect-antigravity"),
  launchAgent: (payload: { agent: string; folder: string; promptPath?: string; prompt?: string }) =>
    ipcRenderer.invoke("launch-agent", payload),
  launchClaudeDesktop: () => ipcRenderer.invoke("launch-claude-desktop"),
  launchClaudeCode: (folder: string, customPath?: string) => ipcRenderer.invoke("launch-claude-code", folder, customPath),
});
