# Addon Pack Examples

This directory contains example addon packs for the KEERO application.

## Addon Pack Structure

An addon pack is a ZIP file containing:

```
addon-pack.zip
├── manifest.json          (required)
├── experiences.json       (optional, any types)
├── personalities.json     (optional, type=personality)
├── games.json             (optional, type=game)
├── stories.json           (optional, type=story)
├── voices/                (optional)
│   └── *.wav
└── images/                (optional)
    └── *.png, *.jpg, *.webp
```

## manifest.json Format

```json
{
  "id": "unique-addon-id",
  "name": "Addon Name",
  "version": "1.0.0",
  "author": "Author Name (optional)",
  "description": "Description (optional)"
}
```

**Rules:**
- `id` must be unique and contain only alphanumeric characters, underscores, and hyphens
- `id`, `name`, and `version` are required
- `author` and `description` are optional

## experiences.json Format

An array of experience objects:

```json
[
  {
    "id": "unique-experience-id",
    "name": "Experience Name",
    "type": "personality" | "game" | "story",
    "prompt": "System prompt for the AI",
    "short_description": "Brief description",
    "tags": ["tag1", "tag2"],
    "voice_id": "radio",
    "is_visible": true,
    "img_src": "optional-image-path"
  }
]
```

**Rules:**
- `id` must be unique across all experiences
- `type` must be one of: "personality", "game", or "story"
- `voice_id` should reference an existing voice or one included in the addon
- If an experience with the same `id` already exists, it will be updated

## Creating an Addon Pack

1. Create a directory with your addon files
2. Create `manifest.json` with required fields
3. Optionally add `experiences.json` with your experiences
4. Optionally add `voices/` directory with WAV files
5. Optionally add `images/` directory with image files
6. Zip the directory:
   ```bash
   cd your-addon-directory
   zip -r ../your-addon.zip .
   ```

## Installing an Addon Pack

1. Open the KEERO application
2. Go to Settings → Addons
3. Click "Install Addon"
4. Select your ZIP file
5. The addon will be installed and experiences will be available immediately

## Demo Pack

The `demo_pack` directory contains a complete example addon pack with:
- A valid manifest.json
- Sample experiences (personality, game, story)

To create the demo pack ZIP:
```bash
cd examples/addons/demo_pack
zip -r ../demo_pack.zip .
```

## Dummy Test Pack

The `dummy_test_pack` directory is a minimal addon for testing install:

- **manifest.json** – id: `dummy-test-pack`, name: "Dummy Test Pack"
- **experiences.json** – 2 experiences: "Dummy Buddy" (personality) and "Yes/No Game" (game)

To create a ZIP you can install in the app:
```bash
cd examples/addons/dummy_test_pack
zip -r ../dummy_test_pack.zip .
```
Then in the app: Settings → Addons → Install → select `examples/addons/dummy_test_pack.zip`.

## Retro Future Pack

The `retro_future_pack` directory is a themed demo pack (synthwave, CRT, arcade):

- **manifest.json** – id: `retro_future_pack`, name: "Retro Future Pack"
- **personalities.json** – 6 personalities (Neon Navigator, CRT Archivist, Arcade Operator, etc.)
- **games.json** – 4 games (Neon District, Debug Quest, Retro Tech Trivia, Memory Grid)
- **stories.json** – 6 interactive stories (Neon City Rain, Orbital Station Log, etc.)

All entries use core voice IDs (`crisp_narrator`, `warm_narrator`, `friendly_male`, etc.) so no extra WAVs are required.

To zip and install:

```bash
cd examples/addons
zip -r retro_future_pack.zip retro_future_pack/
```

Then open the app → **Packs** → **Install from file** → select `retro_future_pack.zip`. New personalities, games, and stories appear on **Home**.
