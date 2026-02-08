# KEERO Local AI

## Installation instructions

1. Clone the repository with `git clone https://github.com/jaksatomovic/keero-local.git`
2. Install Rust and Tauri with `curl https://sh.rustup.rs -sSf | sh`
3. Install Node from [here](https://nodejs.org/en/download)
4. Run `cd app`
5. Run `npm install`
6. Run `npm run tauri dev`

## Flash to ESP32

1. Go to `AI Settings` and click on `Flash Firmware` with your ESP32-S3 device connected to your MacOS Apple Silicon device.
2. The device will open a WiFi captive portal `KEERO` to configure the WiFi network.
3. Add your WiFi network details and click connect.
4. Make sure your MacOS is on the same WiFi network. 
5. Your ESP32 should now connect whenever it is powered on while the server is running!

## Tested on

1. M1 Pro 2021 Macbook Pro
2. M4 Pro 2024 Macbook Pro

## Voice Cloning

The application supports voice cloning through the VoiceClone component:

1. **Recording a Voice Clone:**
   - Go to Voices page
   - Click "Create Voice" → "Clone Voice"
   - Record 12 seconds of audio or upload a WAV file
   - Provide a name and optional description
   - The voice will be saved to `~/Library/Application Support/io.keero/voices/{voice_id}.wav`

2. **Voice File Format:**
   - Must be WAV format with RIFF/WAVE header
   - Maximum size: 10MB
   - Voice ID is sanitized (alphanumeric, underscore, hyphen only)

3. **Using Cloned Voices:**
   - Cloned voices appear in the voice selector
   - Can be assigned to personalities, games, or stories
   - Voices are stored locally and persist across app restarts

## Packs (Addon Marketplace)

**Packs** replace the former Stories tab: install content packs (personalities, games, stories, voices) from ZIP files or from a remote catalog. The **Packs** page is in the sidebar.

### What is Packs

- **Installed Packs** — List of addons in the DB. Enable/disable each pack; when disabled, its experiences are hidden from Home. Uninstall removes the pack and its experiences/voices from the DB (and addon directory).
- **Discover Packs** — If `ELATO_ADDON_CATALOG_URL` is set (HTTPS), the app fetches a catalog and you can install packs by URL.

### How to install

**From file (ZIP):**

1. Go to **Packs** (sidebar).
2. Click **"Install from file"** and choose a `.zip` addon pack.
3. The pack is extracted (with zip-slip and size limits), then experiences and voices are imported. New personalities, games, and stories appear on **Home**.

**From URL (catalog):**

1. Set env var `ELATO_ADDON_CATALOG_URL` to an HTTPS URL that returns a JSON catalog (array or `{ "catalog": [...] }`). Each item should have `id`, `name`, `version`, `zip_url`, and optional `author`, `description`, `tags`.
2. Open **Packs** → **Discover Packs**, click **Refresh catalog**, then **Install** on a pack. The app downloads the ZIP (size limit applies) and runs the same install pipeline.

### Folder locations

- **Addons:** `{AppData}/addons/` — e.g. on macOS: `~/Library/Application Support/io.keero/addons/`. Each installed pack has a folder `{addon_id}/`.
- **Voices:** `{AppData}/voices/` (or `KEERO_VOICES_DIR`). Pack WAVs are copied here; DB stores `addon_id` and `local_path`.

### Pack format (ZIP)

- **manifest.json** (required): `id` (alphanumeric, `_`, `-`), `name`, `version`; optional `author`, `description`.
- **personalities.json** (optional): array of `{ id, name, type: "personality", prompt, short_description, tags, voice_id, ... }`.
- **games.json** (optional): array of `{ id, name, type: "game", prompt, short_description, voice_id, ... }`.
- **stories.json** (optional): array of `{ id, name, type: "story", prompt, short_description, voice_id, ... }`.
- **experiences.json** (optional): single array of experiences (any type).
- **voices/** (optional): `.wav` files; copied to app voices dir and registered with `addon_id`.
- **images/** (optional): `.png`, `.jpg`, `.webp`; allowed in zip.

Extraction is safe: zip-slip prevented, max zip size 100 MB, only `.json`, `.wav`, `.png`, `.jpg`, `.webp` are extracted.

### Test with the demo pack

1. Zip the demo: `cd examples/addons && zip -r retro_future_pack.zip retro_future_pack/`
2. Open the app → **Packs** (sidebar) → **Install from file** → select `retro_future_pack.zip`.
3. After install, go to **Home** and check **Docs**, **Games**, and **Chat** tabs; new personalities, games, and stories from the pack appear on Games and Chat. You can disable the pack in Packs to hide them, or uninstall to remove them.

### Managing Packs

- **Packs** page: list installed packs, enable/disable, uninstall, install from file, discover from catalog.
- **Settings → Addons**: same install/uninstall from file; list also shows installed packs.

### Built-in Content

The default personalities, games, and stories that come with KEERO are treated as "built-in addon" content:
- Tagged with `is_global = 1` flag in the database
- Protected from removal during addon uninstall
- Seeded automatically on first launch
- Can be updated via app updates

This ensures the core content always remains available while allowing community addons to extend functionality.

### PAL Core vs Addon Packs (content layout)

Built-in content: base voices in `app/src/assets/packs/fun_voices/voices.json`, base personalities in `app/src/assets/personalities.json`; optional pack content (play pack, stories pack) under `app/src/assets/packs/`. See **app/src/assets/README.md** for the full layout and addon mapping.

## Docs (Home tab)

The **Home** page has three tabs: **Docs**, **Games**, and **Chat**. The **Docs** tab is a document library for uploading files and using them as AI context in chat.

### What you can do

- **Upload** — Upload documents and images (max 50 MB per file). Supported formats: PDF, plain text (`.txt`, `.md`, `.json`, `.csv`), images (`.jpg`, `.png`, `.gif`, `.webp`), and Word (`.doc`, `.docx`).
- **Search and filter** — Search by filename or title; filter by type (All, PDF, Text, Image, Doc, Other).
- **Select for chat** — Use **Attach to Chat** on a doc to add it to the current context, or multi-select docs and click **Chat with selected** to switch to the Chat tab with those docs attached.
- **Context in Chat** — When a personality is selected, a **Context** area above the chat bar shows attached docs (chips with remove). Use **Add Docs** to open the Docs tab. The voice chat uses the attached document text (when available) to answer questions; the AI is instructed to reference the docs by filename or content.

### Supported formats and text extraction

- **PDF** — Text is extracted with pypdf and included in context (no OCR).
- **Plain text** (`.txt`, `.md`, `.json`, `.csv`) — Content is read as UTF-8 and stored for context.
- **Images** — Stored and listed; no OCR in MVP (metadata only).
- **Word** (`.doc`, `.docx`) — Stored; no text extraction in MVP.

Total document context sent to the model is capped (e.g. 20k characters) to stay within limits.

### Local storage

Documents are stored under the app data directory: **`{AppData}/Docs/{doc_id}/original.{ext}`**. On macOS: `~/Library/Application Support/io.keero/Docs/`. The app uses `KEERO_DOCS_DIR` when set (e.g. by the Tauri backend). Metadata and extracted text are stored in SQLite (`documents`, `document_text` tables).

## Default Voice and Default Personality (Personalization)

Voices and personalities are **decoupled**: you choose a **default voice** and a **default personality** that apply globally (chat, stories, games) unless you allow overrides.

### How it works

1. **Settings → Personalization**
   - **Default Voice** — Choose from all installed voices (download from Voices if needed). This voice is used for TTS in chat, stories, and games.
   - **Default Personality** — Choose from all installed personalities (type = personality). This is the default character/mode for chat and sessions.
   - **Use default voice everywhere** (default: ON) — When ON, your default voice is always used. When OFF, the experience’s own voice can be used if you enable the override below.
   - **Allow experience voice override** (default: OFF) — When ON, personalities/games/stories can use their own `voice_id` instead of your default.

2. **Personalities** (sidebar)
   - Browse all installed personalities (from built-in and packs).
   - **Set as Default** — Saves this personality as your default in preferences.
   - **Use for this session** — Sets this personality as the active one for the current member and opens chat.

3. **Voice resolution**
   - If you have a default voice and “use default voice everywhere” is ON → that voice is used.
   - If “allow experience voice override” is ON and the current experience has a `voice_id` → that experience voice is used.
   - Otherwise your default voice (or first available voice) is used.

### Installing more personalities

Install addon packs from **Packs** (sidebar): many packs include personalities. After installing a pack, new personalities appear on **Personalities** and in **Home** (Chat tab).

## Project Structure

```
keero/
├── app/
│   ├── src/
│   │   ├── components/    (React components)
│   │   ├── pages/         (Page components)
│   │   └── src-tauri/     (Rust backend)
│   └── resources/
│       ├── python-backend/ (Python API server)
│       ├── python_runtime/ (Bundled Python)
│       └── firmware/      (ESP32 firmware)
├── arduino/               (ESP32 source code)
├── examples/
│   └── addons/            (Example addon packs)
└── README.md
```
