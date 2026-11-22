# User Guide

This guide walks through Katha Studio as it is actually built. Where an action needs an external account or a manual step, it says so.

If you have not installed the app yet, start with [INSTALLATION.md](INSTALLATION.md).

---

## The twelve sections

| Section | What it is for |
| --- | --- |
| Overview | A calm dashboard of stories, videos, jobs, output-folder states and upcoming publications |
| My Channels | Create and manage channel workspaces and their permanent animation projects |
| Create Content | Turn a prompt, notes, links or files into ideas and scripts |
| Story & Script Studio | Read, edit, approve and package a multi-part script |
| Voice & Music Lab | Generate narration line by line and manage a music library |
| Animation Studio | Prepare and hand off the production package, then receive the rendered film |
| Animation Agents | Detect agents, prepare and launch handoffs, review locks, skills and MCP servers |
| Video Library | Import, validate, filter, edit and organise finished films |
| Publishing Manager | Upload and schedule on YouTube; prepare Instagram posts or use guided browser publishing |
| Browser Accounts | Manage isolated YouTube and Instagram browser profiles and guided publish jobs |
| Content Calendar | See plans, confirmed schedules and reminders in a month view |
| Connections & Settings | Keys, models, agents, storage, backups, jobs, logs and diagnostics |

The left sidebar is always available. The bottom-left channel switcher changes the active channel for pages that are channel-aware.

---

## First ten minutes

### 1. Create a channel

Open **My Channels** and choose **New channel**.

Fill in:

- **Name** - the channel name.
- **Description** - what the channel is about.
- **Category** and **language** - used by prompts and metadata.
- **Animation direction** - the visual language Claude should follow.
- **Accent colour** - used in the interface for this channel.
- Optional logo.

Creating a channel prepares a permanent folder structure:

```text
Documents\Katha Studio\Channels\<channel-slug>\
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
  ...
Documents\Katha Studio\Outputs\<channel-slug>\
```

Open the channel drawer to see the paths, copy them, or open them in File Explorer. The **ANIMATION_PROJECT** is reused for every story on that channel; each story gets an episode folder inside it.

### 2. Choose how you will generate content

Open **Connections & Settings > Connections**.

- **OpenCode Zen** and **OpenRouter** are the AI writing providers. Add an API key and pick a model from the live catalogue.
- **ElevenLabs** is the premium voice provider. Add an API key and choose a voice later in the Voice Lab.
- **YouTube** needs a Google Cloud OAuth client. See [INTEGRATIONS.md](INTEGRATIONS.md) for the exact steps.
- **Windows local voice** needs nothing. It is a real fallback, not a placeholder.

If you do not want to connect anything yet, use **Offline demo mode** in Create Content. Demo output is fictional sample material and is labelled **Demo** throughout the app.

### 3. Make a story

Open **Create Content**, choose the channel, and write a prompt such as:

> A lantern keeper guides lost travellers through a foggy mountain pass.

Optionally attach reference files or links. Set how many ideas and how long the episodes should be, then choose **Develop content ideas**.

When the session is ready, select the ideas you want and choose **Write scripts**. Katha Studio generates a project with one or more episodes, scenes and dialogue lines. You are taken to **Story & Script Studio**.

### 4. Review and voice the script

In **Story & Script Studio**:

- **Story** shows the premise, hook, research summary, sources, outro and call to action.
- **Episodes** shows every scene, visual direction and dialogue line. Click a line to edit the spoken text, speaker, emotion or delivery.
- **Characters** shows the character bible and lets you assign a voice profile.
- **Production** shows the package state and handoff paths.

Editing spoken text marks existing audio as stale. Regenerate that line, then approve the script again.

In **Voice & Music Lab > Voice Studio**, choose the project, select lines or a scene, and generate. Every line gets its own audio file under the project's `AUDIO\PART_XX` folder. The spoken text sent to the provider is exactly the line text shown in the script; no stage directions or emotion labels are read aloud.

### 5. Approve and package

When the script is ready, choose **Approve script**. Approval unlocks the production package.

Open **Animation Studio** and generate the package for the story. The package contains:

- the master animation prompt,
- the episode script,
- character and style references,
- audio files if generated,
- subtitles if available,
- a handoff note with the real paths.

The package is written under:

```text
Documents\Katha Studio\Production Packages\<project>\
```

and linked into the channel's `ANIMATION_PROJECT\episodes\<slug>\`.

### 6. Hand off to an animation agent

Katha Studio detects the official Claude Code CLI and Google Antigravity, but it does not automate their UI. Manual handoff always works.

- **Prepare handoff** creates `PRODUCTION_TASK.md`, `HANDOFF.md` and `AGENT_HANDOFF.json` inside the episode folder and takes a project/episode lock.
- **Open project folder** opens the permanent animation project in File Explorer.
- **Open package** opens the production package.
- **Copy master prompt** copies the prompt.
- **Open Claude Code terminal** opens the official CLI in the animation project if it is detected.
- **Open Antigravity** opens the app with the permanent project folder if it is detected.
- **Manual** opens the folder and leaves the complete task for any tool.

Claude Code, Antigravity or you do the animation work outside Katha Studio. A second agent cannot start on the same project or episode until the first handoff is finished, cancelled or released.

### 7. Import the finished film

When an agent renders a video into the channel output folder, preferably `READY/`, Katha Studio's watcher validates it with FFprobe after the file has stopped changing. You can also choose **Video Library > Scan folders** or **Import video**.

A film is only imported when it is a real, readable video. Katha Studio records its duration, resolution, codec, frame rate, file size, thumbnail, output state and a fingerprint to prevent duplicates.

### 8. Publish or prepare

- **YouTube**: connect an account in **Publishing Manager**, then upload or schedule a film. Katha Studio uses the official API, uploads the thumbnail and captions when present, and only reports a schedule after YouTube confirms it.
- **Instagram**: prepare a caption, notes, a planned time and the file path, then post it yourself and mark it posted. Or open **Browser Accounts**, sign in to a verified profile, and use guided publishing with an explicit confirmation before the final post.

---

## My Channels

The channel shelf shows every channel with its accent colour, language and counts of projects, videos and published films.

### Create a channel

Use **New channel**. Only the name is required. The channel slug is derived from the name and made unique.

### Open a channel

Click a channel card to open its drawer. The drawer shows:

- the channel description and settings,
- the animation project path and output folder,
- the channel's projects and videos,
- actions to open folders, refresh the workspace or edit settings.

### Edit a channel

Use **Edit** in the channel drawer. Changing the animation direction or style updates the channel record. Existing files are not rewritten automatically; the style guide is regenerated when you refresh the workspace, and missing files are recreated without overwriting your edits.

### Archive a channel

Archiving hides a channel from normal lists without deleting its files. Archived channels can be restored from the archive filter. Deleting files is always a manual action in File Explorer.

---

## Create Content

Create Content has two tabs: **Plan** and **History**.

### Plan

1. Choose the channel.
2. Write a prompt or seed.
3. Add links or attach files if useful. Attachments are copied into the local workspace and summarised as references; they are not uploaded anywhere.
4. Choose the number of ideas and the target episode duration.
5. Pick an AI provider and model, or switch on **Offline demo mode**.
6. Choose **Develop content ideas**.

The job runs locally through the job queue. Progress is visible in the job list and in the top bar. You can leave the page; the session is saved.

When ideas are ready, select the ones you want. **Write scripts** generates one project per selected idea. If one generation fails, the others are kept and the error is reported on the session.

### History

History lists previous ideation sessions with their prompt, status, provider and demo flag. Open one to review its ideas or create scripts from it again.

### Demo mode

Demo mode is intentionally obvious:

- the session is marked **Demo**,
- ideas are fictional sample material,
- scripts are generated locally from templates, not from research,
- videos created for demo projects are placeholders and show **File not on disk** until you import a real file.

Use demo mode to learn the workflow. Do not publish demo material as if it were researched fact.

---

## Story & Script Studio

The left shelf lists projects. Filter by channel or search by title. Open a project to see its tabs.

### Story

Shows the idea, research summary, sources, opening hook, outro and call to action. Use **Edit story details** to change the title, description, category, tags and other metadata. Sources are kept as references; they are not verified automatically.

### Episodes

Each episode contains scenes. A scene has a heading, visual direction, location, time of day and dialogue lines. A dialogue line has:

- speaker and speaker type,
- spoken text,
- emotion and delivery notes,
- timing if known,
- voice profile, provider, audio status and audio path.

Click a line to edit it. Use the line actions to regenerate audio, preview audio, or mark it for review.

Editing the spoken text sets the audio status to stale. This is deliberate: the app will not silently reuse audio that no longer matches the words.

### Characters

The character bible keeps names, roles, appearance, personality and voice assignments consistent. Assign a voice profile to a character so every line by that character uses the same voice. You can still override the voice for a single line.

### Production

Shows whether the script is approved and whether a production package exists. From here you can:

- approve or unapprove the script,
- generate or regenerate the package,
- open the package and handoff note,
- copy the master prompt.

Approval is required before packaging. Regenerating a package with `overwrite` replaces generated files; your source script stays in the database.

---

## Voice & Music Lab

### Voice Studio

1. Choose a project with dialogue.
2. Choose a provider: **ElevenLabs** (needs a key) or **Windows local** (no key).
3. Select a scene, a speaker, or individual lines.
4. Choose a voice profile. ElevenLabs profiles need a voice ID; Windows profiles can use an installed SAPI voice.
5. Generate.

Each line is synthesised separately and saved as an audio file in the project folder. The job records progress and errors per line. Failed lines keep their error message and can be retried.

The app never sends the whole script as one blob. It sends the exact spoken text of each selected line. Emotion and delivery are metadata for the performance, not words to be read aloud.

**Windows local voice** is a genuine SAPI implementation. Voice quality depends on the language packs installed in Windows. It is useful for timing, drafts and offline work.

**ElevenLabs** model IDs are loaded from the live API after a key is connected. Choose a model in Settings or in the voice profile. The app does not assume a model exists.

### Music Library

Import audio you have the right to use. Katha Studio copies it into the music library, analyses duration, waveform and tempo, and stores a rights note. Music can be previewed in the app and mapped into production packages.

Katha Studio does not generate music and does not claim a track is cleared for commercial use. The rights note is your record.

---

## Animation Studio

This page is the handoff desk for Claude Code, Google Antigravity and manual production. It is not a chat window.

### Status cards

- **Claude Desktop** - detected installation and whether it appears to be running (legacy option).
- **Claude Code CLI** - detected executable and version.
- **Antigravity** - detected application and path.
- **Selected handoff agent** - the agent currently chosen in Settings.
- **Locks** - active project or episode locks.

Detection is best-effort and based on standard install locations and PATH. You can override paths in **Animation Agents > Agents** or **Connections & Settings > Production**. If an agent is installed somewhere unusual, open the folder yourself.

### Permanent channel project

Each channel has one `ANIMATION_PROJECT`. It holds the reusable visual world: shared instructions, style guide, character bible, animation conventions, rigs, backgrounds, props, templates and references. The page shows the path and lets you open it, copy it or refresh missing folders. Claude Code, Antigravity and manual work all use this same project and the same episode files.

### Handoff queue

Approved stories with a production package appear here. A story can be:

- ready for an agent,
- in progress,
- animation complete,
- failed.

Actions include opening the package, preparing a real handoff, copying the master prompt, opening the handoff note and opening the output folder. A handoff creates `PRODUCTION_TASK.md`, `HANDOFF.md` and `AGENT_HANDOFF.json` inside the episode folder and takes a project/episode lock.

### Output inbox

When a validated video is imported from the channel output tree, it appears in the output inbox. A placeholder video record is created when a script is completed, so you can see the expected film before it exists. Placeholder records show **File not on disk** until a real file is imported.

### What Katha Studio does not do

- It does not type into an agent's UI, click its buttons, or inject a fake chat prompt.
- It does not read agent credentials, cookies or session data.
- It does not claim a render exists until a real file is validated.
- It does not delete or overwrite an agent's work, and it does not allow two agents to hold the same project or episode lock.

The handoff is intentionally plain: a folder, a real prompt, a lock, and a human.

---

## Animation Agents

This page has four tabs: **Agents**, **Skills**, **MCP** and **Activity**.

### Agents

- See every detected agent and its real path.
- Choose the default animation agent.
- Override the Claude Code CLI and Antigravity paths.
- Prepare a handoff for a project with a production package.
- Launch Claude Code in a visible terminal, run a captured Claude Code headless job, open Antigravity with the project folder, or use manual handoff.
- Review active locks and recent handoffs.

A second handoff on the same project or episode is refused with a conflict. Finish, cancel or release the first handoff before switching agents.

### Skills

Katha ships a shared library of built-in storytelling, animation and editing skills. Built-ins are approved. Imported skills stay unapproved until you inspect them:

- read `SKILL.md`,
- review scripts, dependencies and permission hints,
- approve or reject,
- install only into the agents that actually load skills.

Installing copies the skill into `.claude/skills/`, `.agent/skills/` and `.katha/skills/` and updates `SKILLS.md`. Uninstalling removes those copies but leaves the shared library entry.

### MCP

MCP definitions are discovered from Claude and Antigravity configuration. Katha shows server names, commands, arguments and environment variable **names** only. It never displays or stores secret values. Adding a server performs a safe merge with a timestamped backup; if the agent's format is unsupported, configure it in that agent.

### Activity

Shows real handoff records, modes, status, captured output where available, and lock history.

---

## Browser Accounts

Katha seeds six isolated persistent Chromium profiles: four YouTube and two Instagram. You can add more.

### Profile lifecycle

1. Create a profile with a name and platform.
2. Choose **Open** to launch an isolated Chromium browser window.
3. Sign in manually on the official website.
4. Choose **Test** to verify the profile opens and, where supported, read the signed-in identity.
5. Choose **Close** when finished.
6. Remove a profile with explicit confirmation.

Each profile has its own Chromium user-data directory. Katha stores only the profile name, platform, path, status and verified identity in SQLite. Passwords, cookies and tokens stay in Chromium's profile and are never copied into the database.

### Guided publishing

1. Choose a video and a verified profile.
2. Review the title, description, caption, thumbnail and schedule where the site supports them.
3. Start the guided upload.
4. Katha opens the real website, checks the signed-in identity and fills what it can.
5. The job stops at **awaiting confirmation**. Nothing is published yet.
6. Choose **Confirm publish** only after you have reviewed the page.
7. Katha waits for the website's own confirmation and records the real URL or the real failure.

CAPTCHA, 2FA, a security check, a wrong account or an unsupported page stops the job. Katha records `manual_required` or `failed`; it never reports a fake success. Screenshots of the final state are saved for review.

---

## Video Library

### Import a video

Use **Import video**, paste a path, or choose **Browse**. Supported formats are MP4, MOV, M4V, WebM and MKV, subject to FFprobe support.

Katha Studio:

1. checks that the file exists and has a supported extension,
2. validates it with FFprobe,
3. reads duration, resolution, codec, frame rate and audio streams,
4. generates a thumbnail with FFmpeg,
5. fingerprints the file to prevent duplicates,
6. links it to a project, episode and channel when the path or filename matches.

A file that is still being written is rejected with a clear message. The folder watcher waits for a file to be stable and to be seen in two consecutive scans before importing.

### Scan folders

**Scan folders** checks the configured channel watch/output folders, including the `READY`, `REVIEWED`, `PUBLISHED` and `FAILED` subfolders to a depth of two. This is how rendered films normally arrive. The scan is safe to run repeatedly; duplicates are recorded in the import log instead of creating another video. A file found inside a state folder receives that output state and a matching production status.

### Video cards and detail

Each card shows the thumbnail, title, channel, production status, output state, duration, resolution and aspect ratio. Placeholder videos show **File not on disk**.

Use the search, channel, status, platform and output-folder filters, and switch between grid and table views. Select one or more videos to change their output state or archive them in bulk.

Open a video to:

- play the real file in the app,
- edit title, description, tags, hashtags, category and platform,
- re-read metadata,
- reveal the file in Explorer,
- open its output folder,
- open subtitles,
- archive or restore the video,
- mark it published manually,
- jump to publishing.

### Metadata

Metadata is stored locally. **Suggest metadata** in the publishing flow can use an AI provider to draft a title, description and tags. Nothing is sent to YouTube until you confirm an upload.

---

## Publishing Manager

The page has three tabs: **YouTube**, **Instagram** and **Activity**.

### YouTube connection

1. Create a Google Cloud project.
2. Enable **YouTube Data API v3**.
3. Configure an OAuth consent screen.
4. Create an OAuth client of type **Desktop app**.
5. Paste the client ID and secret into Katha Studio.
6. Choose **Connect YouTube** and complete Google's consent screen in the browser.

The app uses the official loopback OAuth flow. Tokens are stored in Windows Credential Manager. Multiple YouTube channels can be connected and chosen per upload.

If the client is missing, the app says so. It never asks for a Google password.

### Upload or schedule

1. Choose a validated film with a real file.
2. Choose the YouTube account.
3. Review the title, description, tags, category, privacy and made-for-kids setting.
4. Choose a thumbnail and captions file if you have them.
5. For a schedule, choose a future time. Scheduled uploads must use private privacy until publication.
6. Confirm the upload explicitly.

The upload runs as a job with progress. Katha Studio reports:

- local upload state,
- YouTube video ID and URL,
- YouTube processing status,
- whether YouTube confirmed the schedule.

A local plan is not the same as a YouTube schedule. The interface keeps those states separate.

### Reschedule and cancel

A YouTube-confirmed schedule is changed through the YouTube API first. If YouTube rejects the change, the local time is not silently changed.

Cancelling a YouTube-scheduled publication locally returns a clear error telling you to manage it in YouTube Studio. This prevents the app from pretending a remote schedule was cancelled when it was not.

### Instagram

Instagram has two paths:

**Prepared manual post**

1. Choose a film.
2. Write or edit the caption.
3. Add private notes and an optional planned time.
4. Choose **Prepare post**.

Katha Studio saves a `manual_ready` item with the caption, file path and notes. It does not post, does not store an Instagram password, and does not verify a post. After posting yourself, use **Mark posted** and add the real URL if you have one.

**Guided browser publishing**

1. Open **Browser Accounts** and make sure an Instagram profile is verified.
2. Choose **Publish with a browser profile** in Publishing Manager, or start from Browser Accounts.
3. Choose the film, profile and caption.
4. Review the real Instagram page when it opens.
5. Confirm the final publish explicitly.
6. Katha records success only after Instagram confirms the post.

The job stops at CAPTCHA, 2FA, a security check or an unverified account. Nothing is faked.

Instagram Reels need a vertical 9:16 video. Katha Studio warns when the selected film is 16:9 but does not reframe it.

### Activity

Shows upload jobs and all publications. Failed uploads keep their real error text.

---

## Content Calendar

The calendar shows a month grid with three kinds of items:

- **YouTube production plans** - local drafts, not confirmed by YouTube.
- **YouTube confirmed schedules** - only after YouTube accepts the schedule.
- **Instagram manual reminders** - planned manual posts.

Use the channel and platform filters to narrow the view. Click an event to see its details, open the film or publication, or move a local plan. Moving a confirmed YouTube schedule asks YouTube first.

**Plan a publication** creates a local plan or an Instagram reminder. It does not upload anything.

---

## Connections & Settings

### Connections

- **OpenCode Zen** and **OpenRouter**: add or replace API keys, choose a default model from the live catalogue, test the connection, enable or disable the provider.
- **ElevenLabs**: add or replace the key, test the account, see character usage if the API returns it.
- **Windows speech**: test the installed SAPI voices.
- **YouTube**: open the Publishing Manager for OAuth setup.

Keys are written to Windows Credential Manager. The database stores only provider configuration and status, never the secret value.

### Production

- **Animation agents**: detected Claude Code, Antigravity and manual; choose the default agent, override paths, choose the Claude headless permission mode and re-detect.
- **Skills & MCP**: counts of the shared library, approved skills, installed projects and MCP servers, with direct links to the matching tabs.
- **Browser accounts**: profile counts, verified identities, confirmed publishes and a link to Browser Accounts.
- **Channel project & output folders**: choose a channel, see its permanent animation project, set its output and optional watch folder, open `READY` / `REVIEWED` / `PUBLISHED` / `FAILED`, save, and ensure the folder scaffolding exists.

### Studio

- **Storage**: workspace root and individual roots for channels, packages, outputs, assets, music and incoming videos.
- **General**: studio name and week start.
- **Backups**: create a backup and see existing backups. Backups are SQLite copies stored under the data directory.
- **Danger zone**: archive or restore data through the app; destructive file deletion is manual.

### Diagnostics

Runs real checks:

- FFmpeg and FFprobe availability and paths,
- Windows Credential Manager availability,
- SQLite connectivity,
- free disk space,
- Claude Desktop and Claude Code detection,
- Antigravity detection,
- browser runtime availability and seeded profiles,
- provider configuration.

The same page shows the app version, platform, Python version, database path, workspace path and log path. Use **Open logs** when something fails.

### Jobs

The top bar and Settings show recent jobs with status, progress and errors. Jobs can be cancelled where the backend supports it. A failed job keeps its error; retrying creates a new attempt or reuses the operation depending on the job type.

---

## Keyboard and window behaviour

- The window uses a custom title bar. The standard Windows minimise, maximise and close controls are available at the top right.
- `Ctrl+N` opens a new story. It is ignored while you are typing in a field.
- The app uses a hash router, so deep links look like `#/scripts?project=12`. The selected channel is remembered between launches.
- Media is served by the local backend with a short-lived token in the URL for `<video>` and `<audio>` elements. The token is generated per app launch.

---

## Honest limits

- Demo content is fictional and is labelled as such.
- AI output can be wrong. Research summaries and sources are drafts, not verified facts.
- ElevenLabs, Zen, OpenRouter, YouTube and Instagram require your own accounts and are subject to their quotas and terms.
- YouTube uploads can fail for quota, permissions, processing or policy reasons. The app shows the real error.
- Instagram guided publishing depends on the current website layout. If a page changes, Katha stops with `manual_required` rather than guessing.
- Browser publishing uses the installed Google Chrome or Microsoft Edge through an isolated profile. If neither browser is available, the guided path is disabled and manual posting still works.
- Claude Code and Antigravity animation happens outside Katha Studio. Katha prepares, locks and validates; it does not render or fake a chat.
- Antigravity's skill/rules format may differ between versions. The shared `AGENTS.md`, `.agent/rules` and prepared prompt remain the reliable handoff.
- Video import depends on FFmpeg/FFprobe and on the file being a real, readable video.
- The installer is unsigned unless you add a certificate.

When in doubt, open **Connections & Settings > Diagnostics** and read the job error. The app is designed to fail visibly rather than invent success.
