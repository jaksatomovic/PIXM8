import time
import uuid
from typing import List, Optional

from .models import Profile


def _col(row, key: str, default=None):
    try:
        return row[key]
    except (IndexError, KeyError):
        return default


def _row_to_profile(row) -> Profile:
    return Profile(
        id=row["id"],
        user_id=row["user_id"],
        name=row["name"],
        voice_id=row["voice_id"],
        personality_id=row["personality_id"],
        created_at=_col(row, "created_at"),
    )


class ProfilesMixin:
    def insert_profile(
        self,
        user_id: str,
        name: str,
        voice_id: str,
        personality_id: str,
        profile_id: Optional[str] = None,
    ) -> Profile:
        pid = profile_id or str(uuid.uuid4())
        created_at = time.time()
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO profiles (id, user_id, name, voice_id, personality_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (pid, user_id, (name or "Profile").strip()[:80], voice_id, personality_id, created_at),
        )
        conn.commit()
        conn.close()
        return Profile(
            id=pid,
            user_id=user_id,
            name=(name or "Profile").strip()[:80],
            voice_id=voice_id,
            personality_id=personality_id,
            created_at=created_at,
        )

    def get_profile(self, profile_id: str, user_id: Optional[str] = None) -> Optional[Profile]:
        conn = self._get_conn()
        cursor = conn.cursor()
        if user_id:
            cursor.execute("SELECT * FROM profiles WHERE id = ? AND user_id = ?", (profile_id, user_id))
        else:
            cursor.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return _row_to_profile(row)

    def list_profiles_by_user_id(self, user_id: str) -> List[Profile]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at ASC", (user_id,))
        rows = cursor.fetchall()
        conn.close()
        return [_row_to_profile(row) for row in rows]

    def update_profile(
        self,
        profile_id: str,
        user_id: str,
        name: Optional[str] = None,
        voice_id: Optional[str] = None,
        personality_id: Optional[str] = None,
    ) -> Optional[Profile]:
        pr = self.get_profile(profile_id, user_id)
        if not pr:
            return None
        updates = []
        values = []
        if name is not None:
            updates.append("name = ?")
            values.append((name or "").strip()[:80] or pr.name)
        if voice_id is not None:
            updates.append("voice_id = ?")
            values.append(voice_id.strip() if voice_id else pr.voice_id)
        if personality_id is not None:
            updates.append("personality_id = ?")
            values.append(personality_id.strip() if personality_id else pr.personality_id)
        if not updates:
            return pr
        values.extend([profile_id, user_id])
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(
            f"UPDATE profiles SET {', '.join(updates)} WHERE id = ? AND user_id = ?",
            values,
        )
        conn.commit()
        conn.close()
        return self.get_profile(profile_id, user_id)

    def delete_profile(self, profile_id: str, user_id: str) -> bool:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM profiles WHERE id = ? AND user_id = ?", (profile_id, user_id))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return deleted
