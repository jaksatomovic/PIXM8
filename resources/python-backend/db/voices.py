import time
from typing import List, Optional

from .models import Voice


def _col(row, key: str, default=None):
    try:
        return row[key]
    except (IndexError, KeyError):
        return default


class VoicesMixin:
    def _voice_exists(self, voice_id: str) -> bool:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM voices WHERE voice_id = ? LIMIT 1", (voice_id,))
        exists = cursor.fetchone() is not None
        conn.close()
        return exists

    def _default_voice_id(self) -> Optional[str]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT voice_id FROM voices ORDER BY created_at ASC LIMIT 1")
        row = cursor.fetchone()
        conn.close()
        return row["voice_id"] if row else None

    def get_voices(
        self,
        include_non_global: bool = True,
        include_disabled_addons: bool = False,
    ) -> List[Voice]:
        """List voices. By default only built-in and those from enabled addons (or legacy addon_id NULL)."""
        conn = self._get_conn()
        cursor = conn.cursor()
        if include_disabled_addons:
            if include_non_global:
                cursor.execute("SELECT * FROM voices ORDER BY created_at DESC, rowid DESC")
            else:
                cursor.execute(
                    "SELECT * FROM voices WHERE is_global = 1 ORDER BY created_at DESC, rowid DESC"
                )
        else:
            # Visible: is_builtin=1, or addon enabled, or legacy (addon_id NULL)
            if include_non_global:
                cursor.execute(
                    """
                    SELECT * FROM voices
                    WHERE is_builtin = 1 OR addon_id IN (SELECT id FROM addons WHERE is_enabled = 1) OR addon_id IS NULL
                    ORDER BY created_at DESC, rowid DESC
                    """
                )
            else:
                cursor.execute(
                    """
                    SELECT * FROM voices
                    WHERE is_global = 1 AND (is_builtin = 1 OR addon_id IN (SELECT id FROM addons WHERE is_enabled = 1) OR addon_id IS NULL)
                    ORDER BY created_at DESC, rowid DESC
                    """
                )
        rows = cursor.fetchall()
        conn.close()
        return [self._row_to_voice(row) for row in rows]

    def _row_to_voice(self, row) -> Voice:
        return Voice(
            voice_id=row["voice_id"],
            gender=_col(row, "gender"),
            voice_name=row["voice_name"],
            voice_description=_col(row, "voice_description"),
            voice_src=_col(row, "voice_src"),
            is_global=bool(_col(row, "is_global")) if _col(row, "is_global") is not None else False,
            created_at=_col(row, "created_at"),
            addon_id=_col(row, "addon_id"),
            is_builtin=bool(_col(row, "is_builtin")) if _col(row, "is_builtin") is not None else False,
            local_path=_col(row, "local_path"),
            updated_at=_col(row, "updated_at"),
        )

    def get_voice(self, voice_id: str) -> Optional[Voice]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM voices WHERE voice_id = ?", (voice_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return self._row_to_voice(row)

    def upsert_voice(
        self,
        voice_id: str,
        voice_name: str,
        gender: Optional[str] = None,
        voice_description: Optional[str] = None,
        voice_src: Optional[str] = None,
        is_global: bool = False,
        addon_id: Optional[str] = None,
        is_builtin: bool = False,
        local_path: Optional[str] = None,
    ) -> Optional[Voice]:
        conn = self._get_conn()
        cursor = conn.cursor()
        created_at = time.time()
        updated_at = created_at
        cursor.execute(
            """
            INSERT INTO voices (voice_id, gender, voice_name, voice_description, voice_src, is_global, created_at, addon_id, is_builtin, local_path, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(voice_id) DO UPDATE SET
              gender = excluded.gender,
              voice_name = excluded.voice_name,
              voice_description = excluded.voice_description,
              voice_src = excluded.voice_src,
              is_global = excluded.is_global,
              addon_id = excluded.addon_id,
              is_builtin = excluded.is_builtin,
              local_path = excluded.local_path,
              updated_at = excluded.updated_at
            """,
            (
                voice_id,
                gender,
                voice_name,
                voice_description,
                voice_src,
                bool(is_global),
                created_at,
                addon_id,
                1 if is_builtin else 0,
                local_path,
                updated_at,
            ),
        )
        conn.commit()
        conn.close()
        return self.get_voice(voice_id)

    def delete_voices_by_addon(self, addon_id: str) -> int:
        """Delete all voices owned by the given addon. Returns count deleted."""
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM voices WHERE addon_id = ?", (addon_id,))
        count = cursor.rowcount
        conn.commit()
        conn.close()
        return count
