# PAL Core + Addon Packs — Content Layout

This folder holds JSON content for the desktop AI companion: voices, personalities (modes), games, stories, and LLM profiles.

## Core vs Packs

- **Core** — Adult/creator-focused, minimal set. Always loaded first. Usable without any addon.
  - **core_voices.json** — Six neutral voices: crisp_narrator, warm_narrator, friendly_male, friendly_female, radio_host, british_narrator.
  - **core_personalities.json** — Six to eight “modes”: pal_default, focus_mode, dev_assistant, writer_mode, explainer, researcher, planner.

- **Packs** — Optional addon content (playful characters, games, interactive stories, fun voices).
  - **packs/play_pack/** — Character personalities (e.g. Paddy Bear, Santa, Buzz the Host) and games (trivia, riddles, adventure quest, etc.).
  - **packs/stories_pack/** — Interactive storytelling (bedtime, space, mystery, fairy-tale remix, etc.) with tone and age-appropriateness options.
  - **packs/fun_voices/** — Character/fun voices used by play_pack (e.g. paddy_bear, quiz_show, wrestling, troll, tiktok, santa).

## Where the JSON Files Live

| Content        | Core (always)           | Packs (optional)                          |
|----------------|-------------------------|--------------------------------------------|
| Voices         | `core_voices.json`      | `packs/fun_voices/voices.json`             |
| Personalities  | `core_personalities.json` | `packs/play_pack/personalities.json`    |
| Games          | —                       | `packs/play_pack/games.json`               |
| Stories        | —                       | `packs/stories_pack/stories.json`         |
| LLMs           | `llms.json` (unchanged) | —                                          |

**Legacy fallback:** If `core_voices.json` is missing, `voices.json` is used. If `core_personalities.json` is missing, `personalities.json` is used. If pack files are missing, `games.json` and `stories.json` in this folder are used when present.

## Addon DB Mapping (after migrations)

- **addon_id** — Each pack can be assigned an `addon_id` (e.g. `play_pack`, `stories_pack`, `fun_voices`) once DB migrations support it. Seeds currently use `addon_id = NULL` and `is_builtin = 1` for all built-in content.
- **is_builtin** — Built-in core and pack content is seeded with `is_builtin = 1`. Community addons installed from ZIP will use their own `addon_id` and `is_builtin = 0` when that flow is implemented.

## Schema (unchanged)

- **Voices:** `voice_id`, `gender`, `voice_name`, `voice_description`, `voice_src`
- **Experiences (personalities/games/stories):** `id`, `name`, `type`, `prompt`, `short_description`, `tags`, `voice_id`, optional `img_src`
- **LLMs:** `id`, `name`, `repo_id`, `params`, `quantization`, `specialty`, `thinking`; optional: `recommended`, `speed_tier`, `notes`

All `voice_id` references in personalities, games, and stories must exist in either core_voices or fun_voices (or legacy voices.json) so seeds can resolve them.
