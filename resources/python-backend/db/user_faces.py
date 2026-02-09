import time
import uuid
from typing import List, Optional

from .models import UserFace


def _col(row, key: str, default=None):
    try:
        return row[key]
    except (IndexError, KeyError):
        return default


def _row_to_user_face(row) -> UserFace:
    return UserFace(
        id=row["id"],
        user_id=row["user_id"],
        local_path=row["local_path"],
        created_at=float(row["created_at"]),
    )


class UserFacesMixin:
    def insert_user_face(self, user_id: str, local_path: str, face_id: Optional[str] = None) -> UserFace:
        fid = face_id or str(uuid.uuid4())
        created_at = time.time()
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO user_faces (id, user_id, local_path, created_at) VALUES (?, ?, ?, ?)",
            (fid, user_id, local_path, created_at),
        )
        conn.commit()
        conn.close()
        return UserFace(id=fid, user_id=user_id, local_path=local_path, created_at=created_at)

    def get_user_face(self, face_id: str, user_id: Optional[str] = None) -> Optional[UserFace]:
        conn = self._get_conn()
        cursor = conn.cursor()
        if user_id:
            cursor.execute("SELECT * FROM user_faces WHERE id = ? AND user_id = ?", (face_id, user_id))
        else:
            cursor.execute("SELECT * FROM user_faces WHERE id = ?", (face_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return _row_to_user_face(row)

    def list_user_faces_by_user_id(self, user_id: str) -> List[UserFace]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM user_faces WHERE user_id = ? ORDER BY created_at ASC", (user_id,))
        rows = cursor.fetchall()
        conn.close()
        return [_row_to_user_face(row) for row in rows]

    def delete_user_face(self, face_id: str, user_id: str) -> bool:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_faces WHERE id = ? AND user_id = ?", (face_id, user_id))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return deleted
