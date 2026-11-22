# Installation

Katha Studio is a Windows desktop application. It runs a React interface inside Electron and a local Python service on `127.0.0.1`. No server needs to be hosted and no cloud account is required to start.

## Supported environment

- Windows 10 or 11, x64
- Node.js 20 or newer for source installs
- Python 3.11 or newer for source installs (tested with Python 3.13)
- At least 2 GB of free disk space for the app, workspace and videos
- A modern GPU is not required
- Google Chrome is optional and only needed for guided browser publishing
- Claude Code CLI and/or Google Antigravity are optional animation agents

FFmpeg and FFprobe are installed through npm (`ffmpeg-static`, `ffprobe-static`) for source installs. The installer bundles both tools inside the application resources. The Python Playwright client is included in `backend\requirements.txt`; it uses the installed Google Chrome channel and does not download a separate Chromium browser.

---

## Option 1: Install the built application

If someone has already built the installer, or you built it yourself:

1. Open `release\Katha Studio Setup 1.0.0.exe`.
2. Choose an installation directory.
3. The installer creates a Start menu shortcut and an optional desktop shortcut.
4. Launch **Katha Studio**.

The installer is currently **not code-signed**. Windows SmartScreen may display "Windows protected your PC" or "Unknown publisher". This is expected for an unsigned local build. Use **More info > Run anyway** only when you trust the build. For wider distribution, add a code-signing certificate to the electron-builder configuration.

You can also run the unpacked build without installing:

```text
release\win-unpacked\Katha Studio.exe
```

The unpacked build is useful for testing the packaged backend and bundled media tools.

---

## Option 2: Run from source

### 1. Install prerequisites

Install [Node.js 20+](https://nodejs.org) and [Python 3.11+](https://python.org). During Python installation, enable **Add python.exe to PATH**.

Verify in PowerShell:

```powershell
node --version
npm --version
python --version
```

### 2. Get the project

```powershell
cd C:\Users\<you>\Desktop
git clone <your-repository-url> social-media
cd social-media
```

If you received the project as a folder, open PowerShell in that folder instead.

### 3. Run setup

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

The script:

- installs npm dependencies,
- creates `backend\.venv`,
- installs `backend\requirements.txt`,
- writes a local `backend\.env` with loopback defaults,
- checks the bundled FFmpeg and FFprobe binaries,
- creates `Documents\Katha Studio`.

The first run downloads Electron and Python packages, so it can take several minutes.

### 4. Start the app

```powershell
.\start-katha.bat
```

`start-katha.bat` runs setup automatically when dependencies are missing. For hot-reload development use:

```powershell
.\scripts\start.ps1
```

The development script starts Vite on port 5173 and Electron. The Python backend is started by Electron on a free loopback port.

### 5. Run the tests (optional but recommended)

```powershell
npm test
npm run test:e2e
```

`npm test` runs the backend pytest suite, TypeScript checks and a production renderer build. `npm run test:e2e` builds the app and runs the Playwright Electron suite. The E2E suite uses a temporary workspace under `.testdata\e2e` and does not touch your real library.

---

## Build the Windows installer

```powershell
npm run dist
```

This runs:

1. `npm run build` - TypeScript checks, Vite renderer build and Electron TypeScript build.
2. `npm run build:backend` - installs PyInstaller if needed and creates `backend-dist\katha-backend\katha-backend.exe`, collecting the Playwright package.
3. `electron-builder` - packages the app and creates the NSIS installer.

Outputs:

```text
release\Katha Studio Setup 1.0.0.exe
release\Katha Studio Setup 1.0.0.exe.blockmap
release\win-unpacked\Katha Studio.exe
```

Build only the backend executable:

```powershell
npm run build:backend
```

The packaged backend is a PyInstaller **onedir** build. It lives at:

```text
release\win-unpacked\resources\backend\katha-backend\katha-backend.exe
```

Media tools are copied to:

```text
release\win-unpacked\resources\tools\ffmpeg.exe
release\win-unpacked\resources\tools\ffprobe.exe
```

Electron passes their paths to the backend at startup. If those files are missing, the app still opens but video import and audio analysis report that FFmpeg is unavailable.

### Code signing

No certificate is configured. To sign the installer, add a Windows code-signing certificate and electron-builder `win.signingHashAlgorithms` / certificate configuration. Do not distribute an unsigned build as a trusted commercial release without explaining the warning to users.

---

## First launch

1. A splash screen appears while Electron starts the local backend.
2. The backend creates or migrates the SQLite database.
3. The main window opens on **Overview**.
4. If there is no channel, create one in **My Channels**.
5. Optionally connect AI providers, ElevenLabs and YouTube in **Connections & Settings**.

The app works offline for channel setup, demo ideation, demo scripts, Windows SAPI narration, production packages, animation handoffs, video import, skill review and manual Instagram preparation. Online features require keys or accounts. Guided browser publishing requires Google Chrome and a manual sign-in; if Chrome is missing, the app reports automation unavailable and manual publishing still works.

---

## Data locations

Default paths:

| Item | Path |
| --- | --- |
| Database | `%LOCALAPPDATA%\Katha Studio\katha.db` |
| Backups | `%LOCALAPPDATA%\Katha Studio\backups` |
| Logs | `%LOCALAPPDATA%\Katha Studio\logs` |
| Thumbnails | `%LOCALAPPDATA%\Katha Studio\thumbnails` |
| Browser profiles | `%LOCALAPPDATA%\Katha Studio\browser\profiles` |
| Browser screenshots | `%LOCALAPPDATA%\Katha Studio\browser\screenshots` |
| Shared skill library | `%LOCALAPPDATA%\Katha Studio\skills` |
| Workspace | `Documents\Katha Studio` |
| Channels | `Documents\Katha Studio\Channels` |
| Production packages | `Documents\Katha Studio\Production Packages` |
| Rendered outputs | `Documents\Katha Studio\Outputs` |
| Music library | `Documents\Katha Studio\Music Library` |
| Incoming videos | `Documents\Katha Studio\Incoming Videos` |

You can change the workspace and individual storage roots in **Connections & Settings > Studio**. Existing files are not moved automatically; the app creates the new folders and uses them for new work. Move existing files yourself if needed.

API keys and OAuth tokens are stored in **Windows Credential Manager** under the service name `KathaStudio`. They are never written to SQLite or to a text file. If the credential store is unavailable, Katha Studio reports it and refuses to pretend a key was saved.

---

## Environment variables

These are optional and mainly for development, testing or a portable setup:

| Variable | Purpose |
| --- | --- |
| `KATHA_DATA_DIR` | Override the local data directory |
| `KATHA_WORKSPACE_DIR` | Override the workspace directory |
| `KATHA_DB_PATH` | Override the SQLite file |
| `KATHA_LOG_DIR` | Override the log directory |
| `KATHA_FFMPEG_PATH` | Explicit FFmpeg executable |
| `KATHA_FFPROBE_PATH` | Explicit FFprobe executable |
| `KATHA_PORT` | Backend port (development/packaged backend) |
| `KATHA_API_TOKEN` | Require an `X-Katha-Token` header on API requests. Electron always generates one. |
| `KATHA_DISABLE_WATCHER` | Disable the background folder watcher |
| `KATHA_SYNC_JOBS` | Run jobs synchronously (tests only) |

The Electron main process sets the data paths, media tool paths and a random API token for the backend it starts. Do not expose the backend port to a network; it binds to `127.0.0.1` and is intended for the local app only.

---

## Updating

### Installed build

Run the newer installer over the existing installation. Your database and workspace are outside the install directory and are preserved. Take a backup first from **Connections & Settings > Studio**.

### Source build

```powershell
git pull
npm install
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm run build
```

Database migrations run automatically on startup. Back up before major updates.

---

## Uninstall

### Installed build

Use **Settings > Apps > Installed apps > Katha Studio > Uninstall**, or the uninstaller in the installation directory.

The uninstaller removes the application but **does not delete your work**. To remove everything:

1. Back up anything you want to keep.
2. Delete `%LOCALAPPDATA%\Katha Studio`.
3. Delete `Documents\Katha Studio`.
4. Remove saved credentials from Windows Credential Manager if desired. Katha Studio entries use the service name `KathaStudio`.

### Source build

Delete the project folder. Remove the same data folders above if you no longer need them.

---

## Troubleshooting installation

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md). The most useful first step is **Connections & Settings > Diagnostics**, which checks FFmpeg, FFprobe, Windows Credential Manager, SQLite, disk space, Claude detection and provider configuration.
