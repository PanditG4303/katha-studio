# Acceptance Tests

This document records what was verified automatically, what was verified locally without external credentials, and what still requires your authentication. A test is never marked passed on faith.

- Date: 2026-11-22
- App version: 1.0.0
- Database migration: version 2
- Baseline Git commit before the upgrade: `11b155d`
- Pre-upgrade backup: `C:\Users\LENOVO\AppData\Local\Temp\opencode\katha-backup-20261122-163553.zip`
- Real database backup before migration: `C:\Users\LENOVO\AppData\Local\Temp\opencode\katha-db-before-migration-20261122-172547.db`

---

## 1. Automated acceptance - passed

| Area | Check | Command / evidence | Result |
| --- | --- | --- | --- |
| Backend | Existing API flows plus agent, skill, MCP, browser guard, worker lifecycle and output-state tests | `backend\.venv\Scripts\python.exe -m pytest backend\tests -q` | 17 passed |
| Browser profile launch | Real headless Chrome through Playwright in an isolated profile | `pytest backend\tests\test_production_upgrade.py::test_browser_profile_test_opens_isolated_chrome` | Passed |
| Renderer types | Strict TypeScript | `npx tsc --noEmit` | Passed |
| Electron types | Strict TypeScript | `npx tsc -p electron/tsconfig.json --noEmit` | Passed |
| Production build | Vite renderer + Electron build | `npm run build` | Passed |
| End-to-end | Electron launch, backend startup, all twelve sections, skills/MCP tabs, browser accounts, Production settings, output-state import | `npm run test:e2e` | 6 passed |
| Real database migration | Copy first, then apply migration 2 | `migrate_real_db.py` | `user_version = 2`; 6 new tables; 4 new video columns; data preserved |
| Real server smoke | Real DB and real backend process | `real_server_smoke.py` | 9/9 endpoints passed |
| Agent detection | Claude Code 2.1.195 and Antigravity detected | `/api/agents` | Passed |
| Skill seeding | Seven built-in skills | `/api/skills` | Passed |
| Browser seeding | Four YouTube and two Instagram profiles | `/api/browser` | Passed |
| Packaged backend | Frozen Playwright, Chrome launch, agents, skills, profiles, diagnostics | `packaged_smoke.py` against `release\win-unpacked` | 12/12 checks passed |
| Packaged desktop app | Installer output starts and Diagnostics renders | `release\win-unpacked\Katha Studio.exe` with a temporary data folder | Passed |

The E2E suite uses `.testdata\e2e`; it does not touch the real library. Screenshots are written to `test-results\screens`.

### Covered end-to-end

- Channel creation and permanent `ANIMATION_PROJECT` scaffolding.
- Demo ideation and script generation.
- Overview, Voice & Music Lab, Animation Studio, Animation Agents, Video Library, Publishing Manager, Browser Accounts, Content Calendar and Settings render without page or console errors.
- Animation Agents tab deep links (`?tab=skills`, `?tab=mcp`).
- Settings > Production shows agent detection, skills/MCP counts, browser account summary and channel folder controls.
- Import from `Outputs\<channel>\READY\` through the watcher, with the `READY` output badge.
- Instagram manual preparation and calendar visibility.
- Diagnostics and a clean renderer console.

---

## 2. Local acceptance - passed without external accounts

These checks use real files and real local processes, but no external login.

| Feature | What was verified |
| --- | --- |
| Agent detection | Real paths for Claude Code and Antigravity; manual always available |
| Agent handoff | Production task, handoff note and JSON written into the episode folder |
| Project/episode locking | A second handoff on the same project/episode returns HTTP 409 |
| Handoff completion | Completing a handoff releases the lock and records the status |
| Missing package guard | A handoff without a production package returns HTTP 400 |
| Skill library | Built-ins seeded, import inspection, approval, install/uninstall paths |
| MCP | Discovery, environment-name-only storage, safe merge with timestamped backup, manual-required fallback |
| Browser profiles | Create, list, open, close, test runtime, remove with confirmation; isolated user-data directories |
| Browser runtime | Playwright 1.55.0 launches the installed Chrome channel in a persistent context |
| Output watcher | Depth-2 scan, state-folder mapping, stable-file rule, FFprobe validation, dedupe, originals untouched |
| Video library | Output-state filter, badges, open output folder, bulk state change and archive |
| Settings | Agent paths, selected agent, permission mode, channel output/watch folders, workspace refresh |

---

## 3. Awaiting user authentication

The following acceptance tests cannot be completed without your accounts. The app reports these states honestly and does not fake a pass.

### 3.1 YouTube OAuth upload

Status: **awaiting user authentication**

1. Create a Google Cloud project and enable **YouTube Data API v3**.
2. Configure an OAuth consent screen and create an OAuth client of type **Desktop app**.
3. In Katha Studio open **Connections & Settings > Connections > YouTube**, or **Publishing Manager**, and paste the client ID and secret.
4. Choose **Connect YouTube**, sign in, and approve the scopes in the browser.
5. Import a real film with a valid MP4 file.
6. Open **Publishing Manager > YouTube > New YouTube upload**.
7. Choose the connected account, fill the metadata, choose **Private**, and confirm the upload.
8. Verify that Katha records the real YouTube video ID/URL and processing status.
9. Optional schedule test: upload as a schedule with a future time and private privacy; verify that Katha only marks the schedule confirmed after YouTube accepts it.
10. Optional failure test: use a file or account that YouTube rejects and verify that the real error is preserved.

Pass criteria: the upload happens on YouTube, the returned URL resolves, and no success is shown before YouTube confirms.

### 3.2 YouTube guided browser publishing

Status: **awaiting user authentication**

1. Install Google Chrome or Microsoft Edge if neither is already installed.
2. Open **Browser Accounts** and choose a YouTube profile.
3. Choose **Open** and sign in manually on the official YouTube/Google page. Complete 2FA yourself.
4. Return to Katha and choose **Test** on that profile. Confirm the verified identity matches the intended channel.
5. Choose **Publish with a browser profile**, select a real video and the verified profile.
6. Review the metadata, thumbnail and visibility on the real YouTube Studio page.
7. Wait for **awaiting confirmation**, then choose **Confirm publish**.
8. Verify that Katha records success only after YouTube Studio confirms the upload, and that the URL is real.
9. Negative test: start a job, trigger a CAPTCHA or a wrong-account state, and verify that the job stops with `manual_required` or `failed` and keeps a screenshot.

Pass criteria: identity is verified before upload, the final action waits for explicit confirmation, and success requires the website's confirmation.

### 3.3 Instagram guided browser publishing

Status: **awaiting user authentication**

1. Open **Browser Accounts** and choose an Instagram profile.
2. Choose **Open** and sign in manually on the official Instagram website. Complete 2FA yourself.
3. Choose **Test** and verify the signed-in identity.
4. Start a guided Instagram publish for a real vertical video.
5. Review the caption and file on the real Instagram page.
6. Wait for **awaiting confirmation**, then choose **Confirm publish**.
7. Verify that Katha records the real post URL only after Instagram confirms it.
8. Negative test: trigger a security check or use a non-vertical video and verify the real failure/manual-required state.

Pass criteria: no password or cookie is stored by Katha, the final publish is explicitly confirmed, and the real website result is recorded.

### 3.4 Claude Code production run

Status: **awaiting user authentication**

1. Install the official Claude Code CLI and run `claude` once to sign in.
2. In Katha open **Connections & Settings > Production** and confirm the Claude Code path, or set it manually.
3. Create a channel and a project with an approved script and a generated production package.
4. Open **Animation Studio** or **Animation Agents** and prepare a Claude Code handoff.
5. Choose **Open Claude Code terminal**. Confirm the terminal opens in the permanent project and the task refers to the real `PRODUCTION_TASK.md`.
6. Alternatively, choose the captured/headless mode and verify stdout, stderr and exit code are recorded.
7. Let Claude produce a real render, then place it in the channel `READY` folder.
8. Verify that the watcher imports the film and the handoff can be completed, releasing the lock.

Pass criteria: the official CLI is used, no credential is read by Katha, the real project and package paths are used, and only a real validated render is imported.

### 3.5 Google Antigravity production run

Status: **awaiting user authentication**

1. Install Google Antigravity and sign in.
2. Confirm the Antigravity path in **Connections & Settings > Production**.
3. Prepare an Antigravity handoff for a project with a production package.
4. Choose **Open Antigravity**. Confirm the app opens with the permanent project folder.
5. In Antigravity, read `AGENTS.md`, `.agent/rules/katha-animation.md` and the episode `PRODUCTION_TASK.md`.
6. Produce a render and place it in `READY`.
7. Verify the watcher imports it and the lock can be released.

Pass criteria: Katha opens the real app and folder, does not automate an unsupported UI, and only imports a real validated file. If your Antigravity version uses a different rules/skills format, the shared `AGENTS.md` and prepared prompt remain the fallback.

### 3.6 ElevenLabs synthesis

Status: **awaiting user authentication**

1. Add an ElevenLabs API key in **Connections & Settings > Connections**.
2. Test the connection and choose a voice and model.
3. Generate one dialogue line in **Voice & Music Lab**.
4. Verify the audio is real, stored locally and playable.

### 3.7 OpenCode Zen / OpenRouter generation

Status: **awaiting user authentication**

1. Add a Zen or OpenRouter API key.
2. Load the live model catalogue and choose a default model.
3. Generate ideas and a script with demo mode off.
4. Verify the real provider response is stored and errors are shown without being hidden.

---

## 4. Regression checks

| Check | Expected |
| --- | --- |
| Existing database | Channels, projects, videos, settings and credentials remain intact after migration 2 |
| Existing screens | All previous routes and actions still work |
| Existing visual identity | Pastel palette, layout and typography are preserved |
| No duplicate settings | Agent, skill, MCP and browser settings use the existing settings system |
| No destructive overwrite | Workspace refresh, handoffs and imports never overwrite edited user files or delete originals |
| No secret leakage | API keys, OAuth tokens, social passwords, cookies and MCP secret values are absent from SQLite and logs |

---

## 5. Known limits

- The installer is unsigned.
- Guided browser publishing depends on the current YouTube Studio and Instagram page layouts. If a page changes, the job stops with a real error instead of guessing.
- Guided publishing needs Google Chrome or Microsoft Edge; without either, manual publishing remains.
- Antigravity's documented rules/skills format may vary by version. The shared `AGENTS.md`, `.agent/rules` and prepared task are the stable fallback.
- A real agent production run, a real social publish and live provider calls require your accounts and are listed above as awaiting authentication.
