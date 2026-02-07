import time
import uuid
from typing import List, Optional

from .models import Conversation


def _col(row, key: str, default=None):
    try:
        return row[key]
    except (IndexError, KeyError):
        return default


class ConversationsMixin:
    def log_conversation(
        self,
        role: str,
        transcript: str,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        experience_id: Optional[str] = None,
    ) -> Conversation:
        c_id = str(uuid.uuid4())
        timestamp = time.time()
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO conversations (id, role, transcript, timestamp, session_id, user_id, experience_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (c_id, role, transcript, timestamp, session_id, user_id, experience_id),
        )
        conn.commit()
        conn.close()
        return Conversation(
            id=c_id,
            role=role,
            transcript=transcript,
            timestamp=timestamp,
            session_id=session_id,
            user_id=user_id,
            experience_id=experience_id,
        )

    def get_conversations(
        self,
        limit: int = 50,
        offset: int = 0,
        session_id: Optional[str] = None,
    ) -> List[Conversation]:
        conn = self._get_conn()
        cursor = conn.cursor()
        if session_id:
            cursor.execute(
                "SELECT * FROM conversations WHERE session_id = ? ORDER BY timestamp ASC",
                (session_id,),
            )
        else:
            cursor.execute(
                "SELECT * FROM conversations ORDER BY timestamp DESC LIMIT ? OFFSET ?",
                (limit, offset),
            )
        rows = cursor.fetchall()
        conn.close()
        return [
            Conversation(
                id=row["id"],
                role=row["role"],
                transcript=row["transcript"],
                timestamp=row["timestamp"],
                session_id=_col(row, "session_id"),
                user_id=_col(row, "user_id"),
                experience_id=_col(row, "experience_id"),
            )
            for row in rows
        ]
