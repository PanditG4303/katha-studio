# Troubleshooting

Katha Studio is designed to fail visibly. When something goes wrong, the real error is usually in one of three places:

1. the message in the interface or on the affected record,
2. **Connections & Settings > Diagnostics**,
3. the log files.

Start there before changing anything.

---

## First checks

### Run Diagnostics

Open **Connections & Settings > Diagnostics**. It checks:

- FFmpeg and FFprobe availability and paths,
- Windows Credential Manager availability,
- SQLite connectivity and database path,
- free disk space,
- Claude Desktop and Claude Code detection,
- OpenCode Zen, OpenRouter and ElevenLabs configuration.

The same panel shows the app version, Windows version, Python version, database path, workspace path and log path. Use **Open logs** to open the log folder.

### Find the logs

| File | What it contains |
| --- | --- |
| `%LOCALAPPDATA%\Katha Studio\logs\backend.log` | API requests, job progress, provider errors, watcher activity |
| `%LOCALAPPDATA%\Katha Studio\logs\backend-process.log` | Raw stdout/stderr of the Python process |
| `%LOCALAPPDATA%\Katha Studio\logs\desktop.log` | Electron startup, backend spawn, window and IPC events |

If you changed the data directory, the logs are under the new data directory.

Secrets are redacted by the logging filter. Still, review logs before sharing them.

### Check jobs

The top bar shows active jobs. **Connections & Settings > Jobs** shows recent jobs with status, progress and error text. A failed job keeps its error; retrying creates a new attempt. If a job was interrupted by a crash, it is marked failed at the next startup.

---

## The app does not start

### The splash stays on screen

Electron is waiting for the backend health check. Look at `desktop.log` and `backend-process.log`.

Common causes:

- **Python environment missing (source install).** Run `scripts\setup.ps1`.
- **Backend crashed on import.** Run it manually to see the traceback:

  ```powershell
  cd backend
  .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8765
  ```

- **Port conflict.** Electron chooses a free port, so a fixed conflict is unlikely. A firewall or security product blocking loopback is possible; allow the app on private networks.
- **Database locked by another copy.** Close other Katha Studio windows. A single-instance lock prevents most cases, but a crashed process can linger. End stray `Katha Studio.exe` or `katha-backend.exe` processes and relaunch.
- **Antivirus quarantine.** Unsigned executables are sometimes quarantined. Check the antivirus log and restore the file only if you trust the build.

### The window opens but every request fails

The renderer does not have the backend token or the backend restarted.

1. Close the app completely.
2. Check for stray `katha-backend.exe` processes.
3. Relaunch.

In development, if you start the backend yourself, set `KATHA_API_TOKEN` to an empty string or to the same value Electron uses. Mismatched tokens produce `401` responses and "Katha Studio backend authorization failed."

### The installer warns about an unknown publisher

The build is not code-signed. Windows SmartScreen shows this for unsigned installers. Use **More info > Run anyway** only when you built the installer yourself or trust its source. For distribution, add a code-signing certificate.

---

## FFmpeg and FFprobe

### Diagnostics says "Not found"

Source install:

```powershell
npm install
Test-Path node_modules\ffmpeg-static\ffmpeg.exe
Test-Path node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe
```

If either is missing, reinstall dependencies:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

Packaged install: the tools should be at:

```text
resources\tools\ffmpeg.exe
resources\tools\ffprobe.exe
```

If they are missing, rebuild with `npm run dist`. Do not copy random binaries into the install directory.

You can point the backend at explicit binaries:

```powershell
$env:KATHA_FFMPEG_PATH = "C:\tools\ffmpeg.exe"
$env:KATHA_FFPROBE_PATH = "C:\tools\ffprobe.exe"
```

### Import fails with an FFprobe error

The file is not a readable video, is truncated, uses an unsupported codec, or is still being written. The message includes FFprobe's own text. Try playing the file in a normal player. If it plays, remux it:

```powershell
ffmpeg -i input.mkv -c copy output.mp4
```

### Thumbnail generation fails

The video may have an unusual pixel format or a corrupt frame at time zero. The import can still succeed without a thumbnail; the card shows a placeholder. Re-import after remuxing if you need a thumbnail.

---

## Credentials and keys

### "Windows Credential Manager unavailable"

Katha Studio uses Python `keyring` with the Windows backend. If the credential store cannot be reached, keys cannot be saved and the app says so; it does not fall back to plaintext.

Try:

1. Confirm you are running as the same Windows user who installed the app.
2. Check that the **Credential Manager** service is running (`services.msc`).
3. In a source install, verify `keyring` is installed in the venv:

   ```powershell
   backend\.venv\Scripts\python.exe -c "import keyring; print(keyring.get_keyring())"
   ```

4. Some locked-down enterprise machines disable the Credential Manager. In that case, use the Windows local voice and demo mode, or ask your administrator.

### A key was saved but the provider says "not connected"

- Re-open **Connections & Settings**. The status comes from the credential store, not from a cached value.
- Confirm the key was saved under the correct provider. Zen, OpenRouter and ElevenLabs use separate entries.
- If you changed Windows users, credentials from the other user are not visible.

### Replacing or removing a key

Use **Replace key** or **Remove** in Connections. Removing a key also clears the provider's tested status. It does not delete projects or generated audio.

---

## OpenCode Zen and OpenRouter

### "Choose a model ... before generating content"

No model is selected. Open **Connections & Settings**, connect the provider, wait for the live catalogue, and select a model. The app does not guess a model ID.

### The model list does not load

- The key must be present and valid.
- Check the network and any proxy. The backend calls the provider directly over HTTPS.
- A 401 means the key is wrong. A 403 means the account lacks access. A 429 means rate limiting.
- If the catalogue endpoint is temporarily unavailable, the saved default model is used for generation. If no default is saved, choose one when the catalogue returns.

### "The saved model is not in the catalogue"

Providers retire models. Select a current model. A stale model produces the provider's own error, usually a 400 or 404, which is shown in the job.

### Generation times out

The backend allows 300 seconds per chat completion. Long multi-part scripts can exceed provider limits or your connection speed. Reduce the episode count or length, or retry. A timeout is reported on the job; it is not silently retried forever.

### Output is malformed or incomplete

AI output can be wrong or truncated. The script generator validates structure and reports partial failures. If one episode fails, the others are kept. Open the project and edit or regenerate the missing part. Do not publish unverified research summaries as fact.

---

## ElevenLabs

### "ElevenLabs is not connected"

Add the API key in Connections. The voice lab does not fall back to a fake voice.

### 401 rejected API key

Regenerate the key in ElevenLabs and replace it in Katha Studio.

### 402 plan or character limit

The account's plan or character quota does not allow the request. Options:

- use **Windows local voice** for drafts,
- shorten the lines,
- upgrade the ElevenLabs plan,
- wait for the quota to reset.

### 429 rate limit

Wait and retry. Large batches are sent line by line; the app keeps going after a failed line, so retry only the failed lines.

### No voices or models appear

The key is valid but the account has no voices, or the catalogue call failed. Create a voice in ElevenLabs or check the network. The app loads both lists live and does not ship a hard-coded voice ID.

### Audio is silent or truncated

Check the generated file in the project's `AUDIO\PART_XX` folder and play it in the app. If the provider returned an empty response, the line is marked failed with that message. Regenerate the line. Verify the spoken text is not empty and does not contain only stage directions.

### Windows voice says nothing

1. Confirm voices exist in **Windows Settings > Time & language > Speech**.
2. Test the Windows voice in Connections & Settings.
3. Run the SAPI script manually:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File backend\app\resources\sapi_tts.ps1 -ListVoices
   ```

4. If the list is empty, install a language voice pack.
5. Some Windows Server or stripped Windows installs have no SAPI voices. Use ElevenLabs in that case.

PowerShell execution policy is bypassed for this single script invocation; no system policy is changed.

---

## Video import

### A file in the output folder is not imported

The watcher requires:

- a supported extension (`.mp4`, `.mov`, `.m4v`, `.webm`, `.mkv`),
- more than 1 KB,
- an mtime at least 5 seconds old,
- the file seen in two scans at least 8 seconds apart.

It scans the output root and the `READY`, `REVIEWED`, `PUBLISHED` and `FAILED` subfolders to a depth of two. Wait at least 15 seconds after the file stops changing, or use **Video Library > Scan folders**. If it still does not import, read the import history and the backend log for the FFprobe error.

### The output state is blank

A blank state means the file was found directly in the output root or outside a recognised state folder. Move it into `READY`, `REVIEWED`, `PUBLISHED` or `FAILED`, then scan again, or select the video in the library and set the output state in bulk.

### A state folder does not exist

Open **Connections & Settings > Production**, choose the channel and choose **Ensure folders**. The workspace refresh creates the four state folders without deleting anything.

### "This video is already in the library"

The path is already recorded, case-insensitively. This is intentional duplicate prevention. If you replaced the file at the same path and want new metadata, open the existing video and use **Refresh metadata**. If you want a separate record, move or rename the file.

### "The video is still being written"

The file's mtime is too recent. Wait for the render or copy to finish, then scan again.

### The wrong title or channel is linked

Katha Studio links by path and filename. Rename the file to match the project or episode, or edit the video's title and channel in the detail drawer. Linking is best-effort; it never invents a match.

### A placeholder video says "File not on disk"

A placeholder is created when a script completes. It represents the expected film. Import the real file or scan the output folder. The placeholder becomes a real video when a matching file is found.

---

## YouTube

### "Add your Google OAuth client first"

You need a Google Cloud project with the YouTube Data API v3 enabled and an OAuth client of type **Desktop app**. Follow [INTEGRATIONS.md](INTEGRATIONS.md#google-cloud-setup) exactly. Katha Studio does not ship a client ID or secret.

### "Access blocked" or `access_denied`

While the OAuth consent screen is in **Testing**, only listed **Test users** can authorize. Add the Google account that owns the channel. Alternatively publish the consent screen (Google may require verification for sensitive scopes).

### `redirect_uri_mismatch`

The OAuth client is not a **Desktop app** client, or it was created as a Web application. Create a new Desktop app client and use its ID and secret. The app uses a loopback redirect on a random port; Desktop clients allow this.

### The callback page says the connection failed

Read the message on the page. Common causes:

- the authorization code expired (the flow must finish within about 15 minutes),
- the state value did not match because the app restarted,
- the client secret was replaced between starting and finishing the flow.

Start the connection again from **Publishing Manager**.

### A channel does not appear after consent

Choose **Refresh** in Publishing Manager. The account is created only after the token exchange and the channel lookup succeed. If the channel has no upload permission, Google may return an empty channel list.

### Upload fails immediately

Check, in order:

1. the video file still exists and is readable,
2. FFprobe validated it,
3. the selected account is connected,
4. the title/description/tags are within YouTube's limits,
5. the daily quota is not exhausted.

The job stores Google's error text. Do not retry blindly; fix the cause.

### `quotaExceeded`

The YouTube Data API daily quota is shared by uploads, thumbnails and captions. Wait for Google's reset. A default project quota is small; request an increase in Google Cloud if you upload regularly.

### The schedule is not confirmed

A local plan is not a YouTube schedule. The app only marks a schedule confirmed after YouTube accepts the `publishAt` time. Scheduled uploads are sent as private, as YouTube requires. Check the publication detail for the remote state and any error.

### "Manage this schedule in YouTube Studio"

Katha Studio refuses to cancel a YouTube-scheduled publication locally because that would not cancel the remote schedule. Open YouTube Studio and change or delete the scheduled video there. Then update or cancel the local record.

### Thumbnail or captions failed

The video may have uploaded while the thumbnail or captions failed. The error is recorded separately. Thumbnail requirements depend on the channel (size, verification, format). Captions must be a supported subtitle format. Fix the file and retry the auxiliary upload where available.

---

## Animation agents

### An agent is "not detected"

Detection checks standard install locations and `PATH`. If an agent is installed elsewhere:

- set the Claude Code CLI path or Antigravity path in **Connections & Settings > Production** or **Animation Agents > Agents**,
- for Claude Code, ensure the official `claude` executable is on `PATH` or point Katha at it,
- for Antigravity, point Katha at `Antigravity.exe`.

Detection is a convenience, not a requirement. Manual handoff is always available.

### "Another agent already holds this project"

A project or episode lock is active. Open **Animation Agents > Activity** (or the Agents tab) and finish, cancel or release the existing handoff. Locks also live in `.katha/LOCK.json`; do not delete that file while an agent is working.

### Claude Code opens but the task is missing

Open the episode folder and read `PRODUCTION_TASK.md`. If the terminal opened without it, prepare a new handoff and choose **Open Claude Code terminal** again. Katha never injects a prompt into a running chat.

### The captured Claude Code run failed

Read the recorded exit code, stdout and stderr in the handoff. Common causes are a missing `claude` sign-in, a bad custom path, or a permission mode that blocks edits. Sign in with the official CLI and retry. Katha does not read or store Claude credentials.

### Antigravity did not open the project

Make sure the app path is correct and Antigravity is installed. If the app opens without a folder, use **Open project folder** and choose the permanent project. Katha does not automate Antigravity's UI.

### The package is missing files

Generate the package again from an approved script. Audio and subtitles are included only if they exist. Partial failures are reported; read the message. The script must be approved before packaging.

### An agent did not produce a video

Katha Studio does not control the agent's work. Check the handoff note, the package path and the agent's output. When a video exists, put it in `READY/` in the channel output folder or import it manually.

### A render is not imported

See [Video import](#video-import). The watcher only imports stable, valid files.

---

## Skills and MCP

### An imported skill is not approved

This is intentional. Open **Animation Agents > Skills**, choose **Inspect**, read `SKILL.md`, the file list, scripts, dependencies and permission hints, then approve it. Nothing is copied into an agent project before approval.

### A skill is installed but the agent does not see it

Check the skill's installed locations. Katha copies into `.claude/skills/`, `.agent/skills/` and `.katha/skills/` and updates `SKILLS.md`. Some Antigravity versions do not load a skill directory; the shared summary and production prompt still contain the skill.

### An MCP server shows "manual required"

Katha only merges formats it understands. If the agent's config format differs, configure the server in that agent directly, then press **Rescan**. Katha never guesses at a config shape.

### MCP secrets are missing

By design, Katha stores environment variable **names** only. Add the values in the agent's own configuration or environment. Katha does not read or display secret values.

---

## Browser accounts and guided publishing

### "Automation unavailable"

Guided publishing needs Google Chrome and the bundled Playwright runtime. Install Chrome, then press **Refresh** in **Browser Accounts**. The manual Instagram workflow still works without Chrome.

### A profile will not open

Close any other Katha browser window for that profile, then try again. Check the profile path under `%LOCALAPPDATA%\Katha Studio\browser\profiles`. Do not delete the folder while the profile is open.

### The profile is not signed in

Open the profile and sign in manually on the official website. Katha never asks for the password. After signing in, choose **Test** to verify the identity.

### Identity verification failed

The site may show a different account, a consent screen or a security check. Sign in to the correct account in the profile, complete any 2FA manually, and test again. Katha refuses to publish to an unverified identity.

### The job stops at "awaiting confirmation"

This is the safety gate. Review the real website page, then choose **Confirm publish** in Katha. Nothing has been posted yet.

### CAPTCHA, 2FA or a security check

Complete it manually in the open browser window if the site allows, then retry. If the page cannot continue, the job records `manual_required` and keeps a screenshot. Katha does not bypass these checks.

### The website changed and the upload form was not filled

The guided flow is site-dependent. Use the manual workflow or finish the upload in the open browser, then record the real result. Katha never marks a publish successful without the website's confirmation.

### Removing a profile

Removing a profile deletes its local Chromium user-data directory after confirmation. It does not delete anything from YouTube or Instagram. You will need to sign in again if you recreate it.

---

## Database, backups and recovery

### Where is the database?

`%LOCALAPPDATA%\Katha Studio\katha.db` by default. Diagnostics shows the exact path.

### Create a backup

**Connections & Settings > Studio > Backups > Create backup**. Backups are consistent SQLite copies in `%LOCALAPPDATA%\Katha Studio\backups`. The app also writes one on clean shutdown.

### Restore a backup

1. Close Katha Studio completely.
2. Copy the current database somewhere safe.
3. Copy the chosen backup over `katha.db`.
4. Delete `katha.db-wal` and `katha.db-shm` if present.
5. Relaunch. Migrations run automatically.

Files in the workspace (scripts are in the database, but audio, videos and packages are on disk) are not part of the database backup. Back up the workspace separately if you need a full restore.

### "Database is locked"

Close other instances and wait a few seconds. SQLite uses WAL and a 30-second busy timeout. A stuck backend process can hold the lock; end it and relaunch.

### A migration failed

Do not delete the database. Restore the pre-update backup, update the app again, and check `backend.log` for the failing statement. Migrations are versioned and transactional.

---

## Build and packaging

### `npm run build` fails on TypeScript

Read the first error, not the last. Run `npm run typecheck` alone for a clean list. Do not suppress errors with `any`; the project is strict.

### `npm run build:backend` fails

- Confirm `backend\.venv` exists and `scripts\setup.ps1` completed.
- PyInstaller is installed by the script. If installation fails, check the network and pip.
- The script uses absolute paths for `--distpath`, `--workpath` and `--specpath`; do not run it from another directory expecting relative paths to work.
- If the packaged backend starts but exits immediately, run it from a terminal and read stderr. A common cause is a missing hidden import; add it to `scripts/build-backend.ps1` and rebuild.

### The packaged app shows a blank window

- Check `desktop.log` for the backend health check.
- Confirm `resources\app.asar\dist\index.html` exists.
- Rebuild with `npm run dist`. The Electron build must run after Vite; the scripts do this in order.

### `npm run test:e2e` fails to launch

- Run `npm run build` first, or use `npm run test:e2e`, which builds automatically.
- Make sure no previous Electron instance is running.
- Delete `test-results\` and `.testdata\e2e\` for a clean run.
- E2E needs a desktop session; it cannot run in a headless service without a virtual display.

### A video import E2E test times out

The test respects the real watcher rules: a file must be stable and seen in two scans. If the machine is slow, the test waits longer. Do not lower the stability threshold in production code to make a test pass.

---

## Performance

- Large video files are not copied on import; only metadata and a thumbnail are stored. Keep the originals where the app can reach them.
- The library loads metadata, not video data. Playback streams from disk.
- AI generation is the slowest operation. The job queue keeps the interface responsive.
- If the database grows very large, back it up and archive old projects. SQLite handles many thousands of rows comfortably.
- Thumbnails and waveforms live under the data directory. Deleting them is safe; they are regenerated on demand.

---

## Resetting the studio

Only do this when you intend to remove local data.

### Reset settings but keep work

Use the app's settings screens to restore defaults. Removing and re-adding a provider key does not touch projects.

### Start completely fresh

1. Back up anything you need.
2. Close the app.
3. Rename `%LOCALAPPDATA%\Katha Studio` to `Katha Studio.old`.
4. Rename `Documents\Katha Studio` to `Katha Studio.old`.
5. Relaunch. A new database and workspace are created.

To remove credentials, delete the `KathaStudio` entries in Windows Credential Manager.

---

## Reporting a problem

Include:

- what you were doing and what you expected,
- the exact error message from the interface or job,
- the relevant lines from `backend.log` and `desktop.log`,
- Diagnostics output (paths, FFmpeg/FFprobe status, versions),
- whether the build is source or packaged.

Remove API keys, OAuth tokens, personal file paths and private content before sharing logs.
