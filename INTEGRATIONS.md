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

## Claude Desktop and Claude Code

Katha Studio prepares animation work for Claude; it does not run Claude.

### Detection

The backend checks standard Windows install locations for Claude Desktop and looks for the Claude Code CLI on `PATH`. It also checks whether a Claude process is running. Detection is best-effort. If Claude is installed somewhere unusual, the app reports "not detected" and you can still open the folder yourself.

No Claude credentials, cookies or session files are requested or read.

### Handoff

For each channel there is one permanent `ANIMATION_PROJECT` containing:

- `CLAUDE.md` - the channel's master instructions,
- `VISUAL_STYLE_GUIDE.md`,
- `CHARACTER_BIBLE.md`,
- `AUDIO_GUIDE.md`,
- `ASSET_MANIFEST.json`,
- folders for characters, rigs, backgrounds, props, expressions, effects, templates, assets, music, fonts, episodes, renders and references.

When a story is approved, **Claude Animation > Generate package** writes a production package and links an episode folder with a handoff note. The package includes the master prompt, script, references, audio and subtitles where available.

Actions available:

- **Open project folder** - opens the channel's animation project.
- **Open package** - opens the production package.
- **Copy master prompt** - copies the prompt to the clipboard.
- **Open handoff note** - opens the note with real paths.
- **Open Claude Desktop** - launches it only if detected.
- **Open Claude Code** - opens a terminal in the animation project only if the CLI is detected.

There is no UI automation, prompt injection or session reading. The handoff is intentionally a folder plus a prompt plus a person.

### Returning the film

Claude (or any editor) writes the rendered video into the channel's output/watch folder. Katha Studio's watcher validates it with FFprobe after it is stable, or you can use **Video Library > Scan folders** / **Import video**. See [USER_GUIDE.md](USER_GUIDE.md).

---

## Instagram

Instagram is a manual workflow by design.

- Katha Studio does not ask for an Instagram username or password.
- It does not use the Instagram API, browser automation or unofficial endpoints.
- It prepares a `manual_ready` publication with a caption, notes, an optional planned time and the video path.
- You post from your phone or browser.
- After posting, you choose **Mark posted** and can add the real URL.

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
| Claude Desktop / Code | Your own Claude installation | Detection tested on this machine |
| Windows SAPI | None | Yes, real synthesis and playback tested |
| Instagram | Your own account, manual | Preparation and marking tested locally |

Where a real external call could not be made without your credentials, this documentation says so. The app reports those states honestly rather than faking success.
