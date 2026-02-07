import json
import logging
import time
import uuid
from pathlib import Path
from typing import List

from .paths import assets_dir

logger = logging.getLogger(__name__)


class SeedMixin:
    def sync_global_voices_and_experiences(self) -> None:
        """Sync voices and experiences (personalities, games, stories) from JSON assets.
        Load order: core_voices.json (fallback voices.json), then packs/fun_voices/voices.json.
        Experiences: core_personalities.json (fallback personalities.json), then pack files.
        """
        root = assets_dir()
        voice_files: List[Path] = []
        if (root / "core_voices.json").exists():
            voice_files.append(root / "core_voices.json")
        elif (root / "voices.json").exists():
            voice_files.append(root / "voices.json")
        fun_voices = root / "packs" / "fun_voices" / "voices.json"
        if fun_voices.exists():
            voice_files.append(fun_voices)

        if not voice_files:
            return

        conn = self._get_conn()
        cursor = conn.cursor()

        for voices_path in voice_files:
            try:
                voices_payload = json.loads(voices_path.read_text(encoding="utf-8"))
            except Exception:
                continue
            if not isinstance(voices_payload, list):
                continue

            # Sync voices from this file
            for item in voices_payload:
                if not isinstance(item, dict):
                    continue
                vid = item.get("voice_id") or item.get("id")
                vname = item.get("voice_name") or item.get("name")
                if not vid or not vname:
                    continue
                now = time.time()
                cursor.execute(
                    """
                    INSERT INTO voices (voice_id, gender, voice_name, voice_description, voice_src, is_global, created_at, addon_id, is_builtin, local_path, updated_at)
                    VALUES (?, ?, ?, ?, ?, 1, ?, NULL, 1, NULL, ?)
                    ON CONFLICT(voice_id) DO UPDATE SET
                      gender = excluded.gender,
                      voice_name = excluded.voice_name,
                      voice_description = excluded.voice_description,
                      voice_src = excluded.voice_src,
                      is_global = excluded.is_global,
                      created_at = COALESCE(voices.created_at, excluded.created_at),
                      addon_id = COALESCE(voices.addon_id, excluded.addon_id),
                      is_builtin = 1,
                      updated_at = excluded.updated_at
                    """,
                    (
                        str(vid),
                        item.get("gender"),
                        str(vname),
                        item.get("voice_description") or item.get("description"),
                        item.get("voice_src") or item.get("src"),
                        now,
                        now,
                    ),
                )

        # Sync experiences: core then pack files (fallback to legacy filenames)
        experience_paths: List[Path] = []
        if (root / "core_personalities.json").exists():
            experience_paths.append(root / "core_personalities.json")
        elif (root / "personalities.json").exists():
            experience_paths.append(root / "personalities.json")
        experience_paths.append(root / "packs" / "play_pack" / "personalities.json")
        experience_paths.append(root / "packs" / "play_pack" / "games.json")
        experience_paths.append(root / "packs" / "stories_pack" / "stories.json")
        if not (root / "packs" / "play_pack" / "games.json").exists() and (root / "games.json").exists():
            experience_paths.append(root / "games.json")
        if not (root / "packs" / "stories_pack" / "stories.json").exists() and (root / "stories.json").exists():
            experience_paths.append(root / "stories.json")

        for filepath in experience_paths:
            if not filepath.exists():
                continue
            try:
                payload = json.loads(filepath.read_text(encoding="utf-8"))
            except Exception:
                continue

            if not isinstance(payload, list):
                continue

            for item in payload:
                if not isinstance(item, dict):
                    continue
                p_id = item.get("id")
                name = item.get("name")
                prompt = item.get("prompt")
                voice_id = item.get("voice_id")
                exp_type = item.get("type", "personality")
                if not p_id or not name or not prompt or not voice_id:
                    continue
                cursor.execute(
                    "SELECT 1 FROM voices WHERE voice_id = ? LIMIT 1",
                    (str(voice_id),),
                )
                if not cursor.fetchone():
                    logger.warning(f"Voice {voice_id} not found, skipping {p_id}")
                    continue
                now = time.time()
                cursor.execute(
                    """
                    INSERT INTO personalities (id, name, prompt, short_description, tags, is_visible, voice_id, is_global, img_src, type, created_at, addon_id, is_builtin, updated_at, meta_json)
                    VALUES (?, ?, ?, ?, ?, 1, ?, 1, ?, ?, ?, NULL, 1, ?, NULL)
                    ON CONFLICT(id) DO UPDATE SET
                      name = excluded.name,
                      prompt = excluded.prompt,
                      short_description = excluded.short_description,
                      tags = excluded.tags,
                      is_visible = excluded.is_visible,
                      voice_id = excluded.voice_id,
                      is_global = 1,
                      img_src = excluded.img_src,
                      type = excluded.type,
                      created_at = COALESCE(personalities.created_at, excluded.created_at),
                      addon_id = COALESCE(personalities.addon_id, excluded.addon_id),
                      is_builtin = 1,
                      updated_at = excluded.updated_at
                    """,
                    (
                        str(p_id),
                        str(name),
                        str(prompt),
                        str(item.get("short_description") or ""),
                        json.dumps(item.get("tags") or []),
                        str(voice_id),
                        str(item.get("img_src") or ""),
                        str(exp_type),
                        now,
                        now,
                    ),
                )

        conn.commit()
        conn.close()

    def sync_global_voices_and_personalities(self) -> None:
        """Backward-compatible alias."""
        self.sync_global_voices_and_experiences()

    def _seed_default_user(self) -> None:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(1) AS n FROM users")
        row = cursor.fetchone()
        if row and row["n"]:
            conn.close()
            return

        user_id = str(uuid.uuid4())
        cursor.execute(
            """
            INSERT INTO users (id, name, age, dob, hobbies, about_you, personality_type, likes, current_personality_id, user_type, avatar_emoji)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                "User",
                None,
                None,
                json.dumps([]),
                "",
                None,
                json.dumps([]),
                None,
                "family",
                "🙂",
            ),
        )
        conn.commit()
        conn.close()

        if not self.get_active_user_id():
            self.set_active_user_id(user_id)
