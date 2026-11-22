# Architecture

Katha Studio is a local Windows desktop application made of three cooperating processes:

1. **Electron main process** (`electron/main.ts`) - owns the window, security policy, file dialogs, Claude detection/launch, and the lifecycle of the Python backend.
2. **React renderer** (`src/`) - the interface. It talks to the backend over HTTP on loopback and never touches SQLite or credentials directly.
3. **Python backend** (`backend/app/`) - FastAPI + SQLAlchemy + SQLite. It owns data, files, provider calls, media processing, the job queue and the folder watcher.

There is no cloud service and no hosted database. Nothing is exposed beyond `127.0.0.1`.

---

## Process and startup flow

```text
Katha Studio.exe
  └─ Electron main
       ├─ finds a free loopback port
       ├─ generates a random 32-byte hex API token
       ├─ spawns the backend (packaged exe or python -m uvicorn)
       ├─ waits for GET /api/health
       ├─ shows the main window
       └─ loads dist/index.html (or the Vite dev server)
            └─ React renderer ──HTTP──> 127.0.0.1:<port> ──> FastAPI
                                                              ├─ SQLite
                                                              ├─ workspace files
                                                              └─ external APIs
```

Key details:

- The backend binds `127.0.0.1` only. The port is chosen at launch and is never fixed in production.
- `KATHA_API_TOKEN` is generated per launch. The renderer sends it as `X-Katha-Token`.
- Media elements (`<video>`, `<audio>`, thumbnails) cannot set headers, so media GETs accept `?token=` as well. Token comparison uses `hmac.compare_digest`.
- The OAuth callback path is public because Google redirects the browser without the app header. It is restricted to the callback handler.
- The Electron window uses a preload bridge (`electron/preload.ts`) with a narrow `contextBridge` surface. `nodeIntegration` is off and `contextIsolation` is on.
- Navigation is locked down: external `http(s)` links open in the system browser, and in-app navigation is limited to the dev server or `file://`.
- A Content Security Policy is applied to responses. The renderer loads no remote scripts. Google Fonts styles are allowed; local fallbacks are Georgia and Segoe UI.
- A single-instance lock prevents two copies of the studio from competing for the same database.
- On shutdown, Electron terminates the backend, and the backend's lifespan hook stops the watcher and writes a backup.

### Renderer routing

The renderer uses `HashRouter` because production loads `file://.../dist/index.html`. Routes look like `#/scripts?project=12`. This keeps deep links working without a web server rewrite rule.

### Backend development vs packaged mode

| Mode | Backend command |
| --- | --- |
| Development | `backend\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port <free>` |
| Packaged | `resources\backend\katha-backend\katha-backend.exe` |

In both cases Electron sets `KATHA_DATA_DIR`, `KATHA_WORKSPACE_DIR`, `KATHA_API_TOKEN`, `KATHA_PORT` and the FFmpeg/FFprobe paths. The packaged backend is a PyInstaller **onedir** build, not onefile, so startup stays fast and resources resolve predictably.

---

## Backend layout

```text
backend/app/
  main.py            FastAPI app, lifespan, middleware, error handlers
  config.py          paths, env vars, media tool discovery, defaults
  database.py        engine, sessions, init, migrations, backups
  models.py          SQLAlchemy models
  migrations.py      PRAGMA user_version migration ladder
  schemas.py         Pydantic request models
  serializers.py     consistent JSON shapes for the renderer
  security.py        token dependency and public paths
  logging_config.py  rotating file logs and secret redaction
  routers/           channels, content, projects, voice, videos,
                     publishing, media, system
  services/          AI, ideation, scripts, TTS, music, packages,
                     video import, YouTube, Claude, jobs, demo,
                     credentials, ffmpeg, references, workspace
  resources/         sapi_tts.ps1
```

### Routers and responsibilities

| Router | Prefix | Responsibility |
| --- | --- | --- |
| `channels` | `/api/channels` | CRUD, archive, workspace refresh, channel assets and logo upload |
| `content` | `/api` | Ideation sessions, ideas, references, asset uploads |
| `projects` | `/api/projects` | Projects, episodes, scenes, dialogue, characters, approval, packages, handoff |
| `voice` | `/api` | Voice providers, profiles, ElevenLabs catalogues, generation, music |
| `videos` | `/api` | Video list/detail, import, rescan, metadata, archive, dashboard, imports history |
| `publishing` | `/api` | YouTube status/client/OAuth/accounts/uploads, publications, Instagram, calendar |
| `media` | `/api/media` | Video, thumbnail, voice, music, logo, subtitle and reference streaming |
| `system` | `/api` | Info, providers, credentials, models, settings, jobs, backups, logs, Claude, diagnostics |

### Data model

| Model | Purpose |
| --- | --- |
| `Channel` | Channel identity, accent, language, workspace paths, style direction, archive state |
| `VoiceProfile` | Provider, provider voice ID, model, language, stability/similarity/style/speed/rate |
| `Project` | One story, linked to a channel, with story fields, status, package state, episode count |
| `Episode` | Ordered part of a project |
| `Scene` | Ordered scene within an episode, with visual direction, location, time of day |
| `DialogueLine` | Speaker, spoken text, emotion, delivery, audio status/path/error, voice profile |
| `Character` | Character bible entry and default voice profile |
| `IdeationSession` | Prompt, references, provider/model, status, demo flag, error |
| `ContentIdea` | Idea belonging to a session, with title, hook, angle, selected flag |
| `ReferenceStyle` | Analysed link/file/note used for ideation |
| `Asset` | Uploaded channel or reference asset |
| `AudioAsset` | Music library item with waveform, BPM, duration, rights note |
| `Video` | Film metadata, path, fingerprint, thumbnail, production and publication status |
| `SocialAccount` | Connected YouTube channel (tokens live in Credential Manager) |
| `UploadJob` | Upload attempt state, progress, YouTube response, error |
| `Publication` | Local plan, YouTube schedule, Instagram manual item |
| `ImportHistory` | Every import attempt, including duplicates and failures |
| `JobRecord` | Background job state, progress, message, result, error, cancellation |
| `Provider` | Provider configuration, status, default model, credential reference |
| `AppSetting` | Studio name, week start, storage roots, watcher flag |

SQLite uses WAL mode, foreign keys, a 30-second busy timeout and `synchronous=NORMAL`. Sessions are short-lived. The schema is created by SQLAlchemy metadata and upgraded through `MIGRATIONS` keyed by `PRAGMA user_version`. Migration 1 is the baseline; future changes append entries rather than editing old ones.

Backups are consistent SQLite copies written to `BACKUP_DIR` on shutdown and on demand. The backup endpoint and diagnostics read the same database path the app uses.

---

## Job queue

Long operations never block an HTTP request. They are recorded as `JobRecord` rows and executed on a small thread pool (`ThreadPoolExecutor`, 3 workers).

Current job types include:

- `ideation`
- `script_generation`
- `tts`
- `music_import`
- `package_generation`
- `youtube_upload`
- `metadata_prepare`
- `video_import`

Each job receives a progress callback and a cancellation check. The UI polls recent jobs and shows progress in the top bar, Overview and Settings. Cancellation is cooperative: the worker checks between lines, scenes or upload chunks. A cancelled job keeps its cancelled state. A failed job keeps the real error string.

`mark_interrupted_jobs()` runs at startup: any job left `queued` or `running` from a previous crash is marked failed with a clear message instead of hanging forever.

Tests set `KATHA_SYNC_JOBS=1` to run jobs inline and make assertions deterministic. Production never sets this.

---

## File and folder model

```text
%LOCALAPPDATA%\Katha Studio\
  katha.db
  backups\
  logs\
    backend.log
    desktop.log
    backend-process.log
  thumbnails\
  uploads\
  packages\

Documents\Katha Studio\
  Channels\<channel-slug>\
    ANIMATION_PROJECT\
      CLAUDE.md
      VISUAL_STYLE_GUIDE.md
      CHARACTER_BIBLE.md
      AUDIO_GUIDE.md
      ASSET_MANIFEST.json
      characters\
      character_rigs\
      backgrounds\
      props\
      expressions\
      effects\
      animation_templates\
      visual_assets\
      music\
      fonts\
      episodes\
      renders\
      references\
    AUDIO\PART_01\...
  Production Packages\<project-slug>\
  Outputs\<channel-slug>\
  Assets\
  Music Library\
  Incoming Videos\
```

- A channel's `ANIMATION_PROJECT` is permanent. New stories create `episodes/<slug>/` and a handoff note inside it; they do not create a new top-level project.
- Generated files are written with `_write_if_missing` semantics. Refreshing a workspace recreates missing scaffolding but does not overwrite edited guides.
- Package generation writes to `Production Packages` and links the episode folder into the channel project. Partial failures are reported rather than hidden.
- Storage roots are configurable in Settings. Changing a root does not move existing files; the app uses the new root for new work.

---

## Video import and watching

The watcher is a daemon thread started in the FastAPI lifespan unless `KATHA_DISABLE_WATCHER=1`.

A watched file is imported only when:

1. it has a supported extension (`.mp4`, `.mov`, `.m4v`, `.webm`, `.mkv`),
2. it is larger than 1 KB,
3. its mtime is at least 5 seconds old,
4. it has been seen in two scans at least 8 seconds apart.

The first scan registers the file; the second imports it. This avoids importing a file that is still being written by Claude, FFmpeg or another editor.

Import then:

1. normalises the path and checks for an existing `Video.final_video_path` case-insensitively,
2. runs FFprobe and rejects unreadable or non-video files,
3. reads duration, width, height, codec, frame rate and audio presence,
4. generates a thumbnail with FFmpeg,
5. computes a fingerprint and stores an `ImportHistory` row,
6. creates or updates the `Video` row and links it to a project/episode when the path or filename matches.

Duplicates do not create a second video; they add a `duplicate` history entry. The manual **Scan folders** action runs the same scanner once and is safe to repeat.

Placeholder videos are created when a script is completed. They represent the expected film, show **File not on disk**, and become real when a matching file is imported.

---

## External integrations

All provider calls happen in the backend, never in the renderer, so API keys never enter the browser context.

- **OpenCode Zen / OpenRouter** - OpenAI-compatible chat completions plus a live model catalogue. Base URLs and headers live in `services/ai.py`. Model IDs are never assumed: the catalogue is fetched after a key is connected, and the saved default is used only as a fallback.
- **ElevenLabs** - voices, models and per-line text-to-speech over HTTPS. The exact spoken line is the only text sent.
- **Windows SAPI** - `resources/sapi_tts.ps1` is invoked through PowerShell with a text file, avoiding command-line quoting issues. This is a real local synthesis path.
- **YouTube** - Google OAuth 2.0 loopback flow, token refresh, resumable upload, thumbnail and caption upload. Local and remote states are stored separately.
- **Claude** - detection only. The backend checks standard install locations and PATH, and Electron can launch the desktop app or a terminal. No credentials are requested, read or stored.

See [INTEGRATIONS.md](INTEGRATIONS.md) for endpoints, scopes and setup steps.

---

## Security model

| Concern | Control |
| --- | --- |
| Network exposure | Bind `127.0.0.1`; no LAN access |
| API access | Random per-launch token, constant-time comparison |
| Renderer isolation | `contextIsolation`, no Node integration, narrow preload API |
| Navigation | External links via system browser only; file/dev navigation restricted |
| CSP | Applied by Electron; no remote scripts |
| Credentials | Windows Credential Manager via `keyring`; no plaintext fallback |
| Logs | Secret patterns redacted by the logging filter |
| OAuth | Official Google flow; tokens in Credential Manager; state checked |
| Destructive actions | Explicit confirmation for disconnect, archive and deletion of local records |
| Claude | No credential access, no UI automation |

`KATHA_API_TOKEN=""` disables token checks for local development and tests only. Electron always sets a token.

---

## Packaging

```text
npm run build         typecheck + Vite renderer + Electron tsc
npm run build:backend PyInstaller onedir backend
npm run dist          both, then electron-builder NSIS installer
```

`electron-builder` copies:

- `dist/` into `app.asar`,
- `backend-dist/katha-backend/` into `resources/backend/`,
- `ffmpeg-static` and `ffprobe-static` binaries into `resources/tools/`,
- `build/icon.ico` as the application icon.

The packaged app was launched and verified: the window loads, the bundled backend becomes healthy, and diagnostics report the bundled FFmpeg/FFprobe paths.

Unsigned builds trigger Windows SmartScreen. No certificate is configured in this repository.

---

## Testing strategy

| Layer | Command | What it proves |
| --- | --- | --- |
| Backend integration | `npm test` (pytest) | Real SQLite, real files, real FFprobe, real SAPI, API contracts |
| Type safety | `npm run typecheck` | Renderer and Electron compile under strict TypeScript |
| Production renderer | `npm run build` | Vite build succeeds and assets resolve |
| End-to-end | `npm run test:e2e` | Electron launches, backend starts, all ten sections render, real import and publishing flows work |
| Packaged launch | manual/Playwright against `release\win-unpacked` | Bundled backend, media tools and asar paths work |

The E2E suite uses `.testdata\e2e` and never touches the real library. It builds the renderer first because Electron loads `dist/index.html`.

---

## Deliberate architectural limits

- **No Instagram automation.** The API is manual by design; there is no password storage or browser automation.
- **No Claude automation.** Katha Studio prepares a folder and a prompt. It does not click, type or read Claude's session.
- **No hidden remote state.** A YouTube schedule is only marked confirmed after YouTube accepts it. Local plans are labelled as local.
- **No silent repair of media.** Corrupt or unreadable files are rejected with the real FFprobe error.
- **No multi-user mode.** One Windows user, one database, one workspace.
- **No cloud sync.** Backups are local SQLite copies.
