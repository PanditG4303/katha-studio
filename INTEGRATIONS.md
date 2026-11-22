# Integrations

Katha Studio connects to external services only when you provide your own account and key. Every integration is optional. The app works offline for channel setup, demo content, Windows narration, packaging, the Claude handoff, video import and manual Instagram preparation.

Credentials are stored in **Windows Credential Manager** under the service name `KathaStudio`. They are never written to SQLite, `backend\.env`, logs or the renderer. The backend reads a secret only at the moment it calls the provider.

---

## OpenCode Zen

Used for ideation, script generation and metadata suggestions.

| Setting | Value |
| --- | --- |
| Provider ID | `zen` |
| Chat base URL | `https://opencode.ai/inference/openai/v1` |
| Model catalogue | `https://opencode.ai/inference/v1/models` |
| Auth header | `Authorization: Bearer <zen_api_key>` |
| Credential | Windows Credential Manager entry `zen_api_key` |

### Setup

1. Create or open your OpenCode Zen account and generate an API key.
2. In Katha Studio open **Connections & Settings > Connections**.
3. Paste the key into **OpenCode Zen** and save.
4. Choose a model from the loaded catalogue. The list comes from the live endpoint; Katha Studio does not hard-code model names.
5. Use **Test** to verify the key.

### Behaviour and limits

- Requests are sent to `{base_url}/chat/completions` with the selected model.
- If no model is selected, generation stops with a clear message instead of guessing an ID.
- The catalogue is only loaded when a key is present. Until then the saved default (if any) is shown and generation is not attempted.
- HTTP 401, 402, 403, 429 and 5xx responses are mapped to readable messages. 429 and 5xx are retried twice with a short delay.
- JSON mode is requested for structured output. If the provider rejects `response_format`, the request is retried once without it.
- A 300-second timeout applies to generation. Long scripts can take a while.
- Model availability, pricing and quotas are controlled by Zen, not by Katha Studio. A model that disappears from the catalogue must be re-selected.

### Demo fallback

**Offline demo mode** in Create Content bypasses the provider entirely. It generates fictional sample ideas and scripts locally. Demo sessions are stored with `is_demo = true` and labelled **Demo** in the interface. They are for learning the workflow, not for research or publication as fact.

---

## OpenRouter

Used for the same tasks as Zen, with access to OpenRouter's catalogue.

| Setting | Value |
| --- | --- |
| Provider ID | `openrouter` |
| Chat base URL | `https://openrouter.ai/api/v1` |
| Model catalogue | `https://openrouter.ai/api/v1/models` |
| Auth header | `Authorization: Bearer <openrouter_api_key>` |
| Extra headers | `HTTP-Referer: https://katha.studio`, `X-Title: Katha Studio` |
| Credential | Windows Credential Manager entry `openrouter_api_key` |

Setup is identical to Zen: add the key, load the catalogue, pick a model, test.

OpenRouter model IDs include a vendor prefix (for example a `vendor/model` form). Always choose from the loaded list rather than typing an ID from memory. Free and paid models have different quotas; OpenRouter returns its own error text, which Katha Studio displays.

You can enable both Zen and OpenRouter and choose per generation. The selected provider and model are stored on the ideation session and script job so the history shows what produced the result.

---

## ElevenLabs

Used for premium per-line narration.

| Setting | Value |
| --- | --- |
| Provider ID | `elevenlabs` |
| Base URL | `https://api.elevenlabs.io/v1` |
| Voice catalogue | `GET /v1/voices` |
| Model catalogue | `GET /v1/models` |
| Synthesis | `POST /v1/text-to-speech/{voice_id}` |
| Auth header | `xi-api-key: <elevenlabs_api_key>` |
| Credential | Windows Credential Manager entry `elevenlabs_api_key` |

### Setup

1. Create an ElevenLabs API key in your ElevenLabs account.
2. In **Connections & Settings > Connections**, save the key under **ElevenLabs**.
3. Use **Test** to confirm the key and see the account tier and character usage if the API returns it.
4. Open **Voice & Music Lab > Voice Studio**.
5. Create a voice profile: choose ElevenLabs, select a voice from the live list, select a model from the live list, and set language and delivery controls.
6. Assign the profile to characters or individual lines, then generate.

### What is sent

Only the exact spoken text of each dialogue line. Emotion, delivery notes, scene headings and visual direction are metadata and are never sent as speech. Each line produces its own audio file:

```text
<channel>\AUDIO\PART_01\part_01_scene_01_narrator_01.mp3
```

### Voice settings

A profile can set stability, similarity boost, style, speed and a rate adjustment. These are translated into the provider's request body. Unsupported combinations are rejected by ElevenLabs and the error is shown on the line.

### Model IDs

The app loads models from `/v1/models`. It does not assume a specific model ID exists. If a profile references a model that is no longer available, synthesis fails with the provider's error and you can pick a new model.

### Failure handling

| Response | What Katha Studio reports |
| --- | --- |
| 401 | The key was rejected; check it in Connections |
| 402 | The plan or character limit does not allow the request; use the Windows voice or upgrade |
| 429 | Rate limit reached; wait and retry |
| Empty or tiny audio | "ElevenLabs returned an empty audio response" |
| Network error | Could not reach ElevenLabs |

Failures are stored per line (`audio_status = failed`, `audio_error`) and the rest of the batch continues.

### Windows local voice (real alternative)

| Setting | Value |
| --- | --- |
| Provider ID | `windows_sapi` |
| Engine | Windows Speech API through `resources/sapi_tts.ps1` |
| Credential | None |
| Network | None |

Katha Studio lists installed SAPI voices, writes the exact line text to a temporary UTF-8 file, and invokes PowerShell with that file. Using a file avoids quoting and encoding problems with punctuation and non-Latin scripts.

Voice quality depends on the language packs installed in Windows. Install additional voices in **Windows Settings > Time & language > Speech** if a language is missing. This path is fully local and is used for drafts, timing and offline work. It is a genuine implementation, not a placeholder.

---

## YouTube

Katha Studio uses the official YouTube Data API v3 with OAuth 2.0. It does not ask for a Google password and does not automate a browser.

| Setting | Value |
| --- | --- |
| Provider ID | `youtube` |
| Scopes | `https://www.googleapis.com/auth/youtube.upload`, `https://www.googleapis.com/auth/youtube.force-ssl` |
| Redirect | `http://127.0.0.1:<backend-port>/api/youtube/oauth/callback` |
| Flow | Authorization Code with PKCE, `access_type=offline`, `prompt=consent` |
| Token storage | Windows Credential Manager (`youtube_token_<account_id>`, client secret) |
| Upload | Resumable upload through the Data API |

### Google Cloud setup

You need a Google Cloud project and a YouTube channel. This is a one-time setup per Google Cloud project.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (or select one).
2. Go to **APIs & Services > Library**, search for **YouTube Data API v3**, and enable it.
3. Go to **APIs & Services > OAuth consent screen**.
   - Choose **External** unless you have a Google Workspace organization.
   - Fill in the app name, support email and developer email.
   - Add the two scopes above under **Scopes**.
   - While the app is in **Testing**, add the Google account that owns the channel as a **Test user**. Otherwise Google blocks the consent screen with "Access blocked".
4. Go to **APIs & Services > Credentials > Create credentials > OAuth client ID**.
5. Choose **Desktop app** as the application type. Do not choose Web application; the loopback flow expects a desktop client.
6. Copy the **Client ID** and **Client secret**.
7. In Katha Studio open **Publishing Manager > YouTube**.
8. Paste the client ID and secret, save, then choose **Connect YouTube**.
9. Your browser opens Google's consent screen. Sign in with the channel's Google account and approve the scopes.
10. Google redirects to the local callback. The page confirms the channel name; you can close the tab.
11. Return to Katha Studio and refresh. The channel appears in the account list.

Repeat **Connect YouTube** for each additional channel. Katha Studio supports multiple connected YouTube channels and lets you choose one per upload.

### Publishing status model

Katha Studio keeps local and remote state separate:

| State | Meaning |
| --- | --- |
| `draft` | A local plan. Nothing was sent to YouTube. |
| `scheduled` | A local plan with a time. Not yet confirmed by YouTube. |
| `uploading` | The upload job is running. |
| `processing` | YouTube accepted the upload and is processing it. |
| `published` | YouTube reports the video as published. |
| `failed` | The upload or API call failed; the real error is stored. |
| `manual_ready` | An Instagram item prepared locally. |
| `posted_manual` | You marked an Instagram post as done yourself. |

A YouTube schedule is only marked confirmed after YouTube accepts it. If YouTube rejects a schedule change, the local time is not silently changed. Cancelling a YouTube-scheduled publication locally is refused with a 409 telling you to manage it in YouTube Studio, because a local delete would not cancel the remote schedule.

### Upload behaviour

- The video must exist on disk and pass FFprobe validation.
- Scheduled uploads are sent as `private` with a `publishAt` time. YouTube requires private for scheduled uploads.
- Title, description, tags and category are limited and sanitised before sending. Tags are capped to YouTube's limit.
- A thumbnail is uploaded after the video when one exists.
- A captions file is uploaded when present and in a supported format.
- Progress is reported from the resumable upload chunks.
- Made-for-kids is an explicit choice; it is not guessed.
- The YouTube video ID and URL are stored on success. The app never invents them.

### Quotas and errors

The YouTube Data API has a daily quota. An upload costs a large part of the default quota, and thumbnail/caption calls cost additional units. A quota error is shown as returned by Google. Quotas reset on Google's schedule, not Katha Studio's.

Common Google errors and their meaning:

| Error | Meaning |
| --- | --- |
| `access_denied` | The Google account was not a test user, or consent was refused |
| `redirect_uri_mismatch` | The OAuth client is not a Desktop app client |
| `invalid_client` | Client ID/secret do not match or the client was deleted |
| `quotaExceeded` | Daily API quota is used up |
| `uploadLimitExceeded` | The channel cannot upload more today |
| `forbidden` / 403 | The channel or account lacks permission for the action |

Disconnecting an account removes the local account and its stored tokens. It does not delete videos from YouTube.

---

## Animation agents: Claude Code, Google Antigravity and manual

Katha Studio prepares animation work for a real agent; it does not impersonate one. All three modes share the same permanent channel project, assets and episode files.

### Detection

The backend checks standard Windows install locations and `PATH` for:

- the official Claude Code CLI (`claude`),
- Claude Desktop (legacy handoff option),
- Google Antigravity.

You can override the Claude Code and Antigravity paths in **Connections & Settings > Production** or **Animation Agents > Agents**. Detection is best-effort. If an app is installed somewhere unusual, Katha reports "not detected" and manual handoff still works.

No agent credentials, cookies or session files are requested or read. Each agent signs in through its own application.

### One permanent project

For each channel there is one permanent `ANIMATION_PROJECT` containing:

- `CLAUDE.md` - Claude-specific instructions,
- `AGENTS.md` - the shared instruction contract for every agent,
- `.agent/rules/katha-animation.md` and `.agent/workflows/animation-production.md` - Antigravity-compatible rules and workflow,
- `ANIMATION_CONVENTIONS.md`,
- `VISUAL_STYLE_GUIDE.md`,
- `CHARACTER_BIBLE.md`,
- `AUDIO_GUIDE.md`,
- `ASSET_MANIFEST.json`,
- `SKILLS.md` and the installed skill folders,
- folders for characters, rigs, backgrounds, props, expressions, effects, templates, assets, music, fonts, episodes, renders and references.

A story handoff creates `episodes/<story-slug>/` with `PRODUCTION_TASK.md`, `HANDOFF.md` and `AGENT_HANDOFF.json`. The production package is linked, not copied over. Existing files are never overwritten by a new handoff.

### Locks and handoffs

- A project lock and an optional episode lock are stored in SQLite and in `.katha/LOCK.json`.
- Starting a second agent on a locked project or episode returns a clear conflict instead of overwriting active work.
- Finishing, cancelling or releasing a handoff frees the lock.
- **Claude Code, visible terminal** launches the official CLI in the permanent project with the prepared task.
- **Claude Code, captured run** uses the official CLI in headless mode, sends the production task on stdin, captures stdout/stderr and records the real exit code. Permission mode is configurable (`default`, `acceptEdits`, `plan`).
- **Antigravity** opens the installed application with the permanent project folder. The prepared `PRODUCTION_TASK.md` is inside the episode folder; there is no unsupported UI automation.
- **Manual** opens the project folder and leaves the complete prompt for any animation tool or a person.

There is no UI automation, fake chat, prompt injection or session reading. If a documented agent integration is unavailable, the handoff falls back to a folder plus a prompt.

### Skills and MCP

- One shared skill library holds reviewed skills. Built-in skills are seeded approved; imported skills stay unapproved until you inspect their `SKILL.md`, scripts, dependencies and permission hints.
- Installing a skill copies it into the locations each agent actually reads: `.claude/skills/`, `.agent/skills/` and `.katha/skills/`, and updates `SKILLS.md` plus the shared rules.
- MCP discovery reads Claude and Antigravity configuration files. Katha stores server definitions and environment variable **names** only; it never reads or stores secret values.
- A safe MCP config merge writes a timestamped backup first. If an agent's format is unsupported, Katha tells you to configure it in that agent.

### Returning the film

The agent (or you) writes the rendered video into the channel output folder, preferably `READY/`. Katha's watcher validates it with FFprobe after it is stable, or you can use **Video Library > Scan folders** / **Import video**. The original file is never deleted. See [USER_GUIDE.md](USER_GUIDE.md).

---

## Instagram

Instagram has two honest paths.

### Prepared manual post

- Katha Studio does not ask for an Instagram username or password.
- It prepares a `manual_ready` publication with a caption, notes, an optional planned time and the video path.
- You post from your phone or browser.
- After posting, you choose **Mark posted** and can add the real URL.

### Guided browser publishing

- **Browser Accounts** seeds isolated, persistent Chromium profiles (two for Instagram, four for YouTube).
- You open a profile and sign in manually on the official Instagram website. Chromium owns the password, cookies and session; Katha stores only profile metadata and status.
- Katha tests the profile and verifies the signed-in identity before an upload.
- The guided flow opens the real Instagram upload page, fills the caption and file where the site supports it, and stops at **awaiting confirmation**.
- Nothing is posted until you explicitly confirm. Katha records success only when the website itself confirms the post.
- CAPTCHA, 2FA, a security check or an unverified identity stops the job with a real error or a manual-required state. Nothing is faked.

Katha Studio warns when a film is 16:9 and you plan a Reel, because Reels need vertical video. It does not reframe or crop for you.

---

## Windows speech

Windows SAPI is not an external service, but it is an integration point:

- Voices come from the operating system.
- Synthesis runs locally through PowerShell.
- Additional voices are installed in Windows settings.
- No network call is made and no key is required.

If no voices are listed, the PowerShell script or the speech subsystem is unavailable. Diagnostics and the troubleshooting guide cover this.

---

## Integration checklist

| Integration | Key or account | Tested without credentials |
| --- | --- | --- |
| OpenCode Zen | Zen API key + selected model | No live call; demo mode tested |
| OpenRouter | OpenRouter API key + selected model | No live call; demo mode tested |
| ElevenLabs | API key + voice + model | No live call; Windows SAPI tested end to end |
| YouTube | Google Cloud project, OAuth client, channel | OAuth validation paths tested; real upload needs your account |
| Claude Code | Official CLI and your Claude account | Detection, lock conflict, handoff creation and package wiring tested; a real production run needs your account |
| Google Antigravity | Installed app and your account | Detection and folder launch tested on this machine |
| Skills / MCP | Local files and agent configs | Seeding, inspection, approval, install and safe MCP discovery tested locally |
| Browser profiles | Google Chrome or Microsoft Edge and manual sign-in | Profile CRUD, isolation, runtime and identity checks tested locally; real site publishing needs your login |
| Windows SAPI | None | Yes, real synthesis and playback tested |
| Instagram | Your own account, manual or browser profile | Preparation and marking tested locally; guided publishing awaits your login |
| YouTube browser publishing | Your own Google account in a browser profile | Guided flow and confirmation gate tested locally; a real upload needs your login |

Where a real external call could not be made without your credentials, this documentation says so. The app reports those states honestly rather than faking success.
