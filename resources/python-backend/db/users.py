import json
import uuid
from typing import Any, List, Optional

from .models import User


def _col(row, key: str, default=None):
    """Safe column access for rows that may lack columns (e.g. older DB schema)."""
    try:
        return row[key]
    except (IndexError, KeyError):
        return default


class UsersMixin:
    def get_users(self) -> List[User]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users")
        rows = cursor.fetchall()
        conn.close()
        return [
            User(
                id=row["id"],
                name=row["name"],
                age=_col(row, "age"),
                dob=_col(row, "dob"),
                about_you=(_col(row, "about_you") or ""),
                personality_type=_col(row, "personality_type"),
                likes=json.loads(v) if (v := _col(row, "likes")) else [],
                current_personality_id=_col(row, "current_personality_id"),
                current_voice_id=_col(row, "current_voice_id"),
                user_type=(_col(row, "user_type") or "family"),
                avatar_emoji=_col(row, "avatar_emoji"),
                settings_json=_col(row, "settings_json"),
            )
            for row in rows
        ]

    def get_user(self, u_id: str) -> Optional[User]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (u_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return User(
            id=row["id"],
            name=row["name"],
            age=_col(row, "age"),
            dob=_col(row, "dob"),
            about_you=(_col(row, "about_you") or ""),
            personality_type=_col(row, "personality_type"),
            likes=json.loads(v) if (v := _col(row, "likes")) else [],
            current_personality_id=_col(row, "current_personality_id"),
            user_type=(_col(row, "user_type") or "family"),
            avatar_emoji=_col(row, "avatar_emoji"),
            settings_json=_col(row, "settings_json"),
        )

    def create_user(
        self,
        name: str,
        age: Optional[int] = None,
        dob: Optional[str] = None,
        about_you: str = "",
        personality_type: Optional[str] = None,
        likes: Optional[List[str]] = None,
        current_personality_id: Optional[str] = None,
        current_voice_id: Optional[str] = None,
        user_type: str = "family",
        avatar_emoji: Optional[str] = None,
        settings_json: Optional[str] = None,
    ) -> User:
        likes = likes or []
        u_id = str(uuid.uuid4())
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO users (id, name, age, dob, hobbies, about_you, personality_type, likes, current_personality_id, current_voice_id, user_type, avatar_emoji, settings_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                u_id,
                name,
                age,
                dob,
                json.dumps([]),
                about_you or "",
                personality_type,
                json.dumps(likes),
                current_personality_id,
                current_voice_id,
                user_type,
                avatar_emoji,
                settings_json,
            ),
        )
        conn.commit()
        conn.close()
        return User(
            id=u_id,
            name=name,
            age=age,
            dob=dob,
            about_you=about_you or "",
            personality_type=personality_type,
            likes=likes,
            current_personality_id=current_personality_id,
            current_voice_id=current_voice_id,
            user_type=user_type,
            avatar_emoji=avatar_emoji,
            settings_json=settings_json,
        )

    def update_user(self, u_id: str, **kwargs: Any) -> Optional[User]:
        current = self.get_user(u_id)
        if not current:
            return None

        fields: List[str] = []
        values: List[Any] = []

        if "name" in kwargs:
            fields.append("name = ?")
            values.append(kwargs["name"])
        if "age" in kwargs:
            fields.append("age = ?")
            values.append(kwargs["age"])
        if "dob" in kwargs:
            fields.append("dob = ?")
            values.append(kwargs["dob"])
        if "about_you" in kwargs:
            fields.append("about_you = ?")
            values.append(kwargs["about_you"] or "")
        if "personality_type" in kwargs:
            fields.append("personality_type = ?")
            values.append(kwargs["personality_type"])
        if "likes" in kwargs:
            fields.append("likes = ?")
            values.append(json.dumps(kwargs["likes"]))
        if "current_personality_id" in kwargs:
            fields.append("current_personality_id = ?")
            values.append(kwargs["current_personality_id"])
        if "current_voice_id" in kwargs:
            fields.append("current_voice_id = ?")
            values.append(kwargs["current_voice_id"])
        if "user_type" in kwargs:
            fields.append("user_type = ?")
            values.append(kwargs["user_type"])
        if "avatar_emoji" in kwargs:
            fields.append("avatar_emoji = ?")
            values.append(kwargs["avatar_emoji"])
        if "settings_json" in kwargs:
            fields.append("settings_json = ?")
            values.append(kwargs["settings_json"])

        if not fields:
            return current

        values.append(u_id)
        query = f"UPDATE users SET {', '.join(fields)} WHERE id = ?"
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(query, tuple(values))
        conn.commit()
        conn.close()
        return self.get_user(u_id)
