import time
import uuid
from typing import List, Optional, Tuple

from .models import Document, DocumentText


def _col(row, key: str, default=None):
    try:
        return row[key]
    except (IndexError, KeyError):
        return default


class DocumentsMixin:
    def insert_document(
        self,
        doc_id: str,
        filename: str,
        ext: str,
        mime: str,
        doc_type: str,
        size_bytes: int,
        sha256: str,
        local_path: str,
        title: Optional[str] = None,
    ) -> Document:
        created_at = time.time()
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO documents (id, filename, title, ext, mime, doc_type, size_bytes, sha256, local_path, created_at, updated_at, is_deleted)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)""",
            (doc_id, filename, title or None, ext, mime, doc_type, size_bytes, sha256, local_path, created_at),
        )
        conn.commit()
        conn.close()
        return Document(
            id=doc_id,
            filename=filename,
            title=title,
            ext=ext,
            mime=mime,
            doc_type=doc_type,
            size_bytes=size_bytes,
            sha256=sha256,
            local_path=local_path,
            created_at=created_at,
            updated_at=None,
            is_deleted=0,
        )

    def get_document(self, doc_id: str) -> Optional[Document]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return _row_to_document(row)

    def list_documents(
        self,
        q: Optional[str] = None,
        doc_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        include_deleted: bool = False,
    ) -> List[Document]:
        conn = self._get_conn()
        cursor = conn.cursor()
        sql = "SELECT * FROM documents WHERE 1=1"
        params: list = []
        if not include_deleted:
            sql += " AND is_deleted = 0"
        if q and q.strip():
            sql += " AND (filename LIKE ? OR title LIKE ?)"
            p = f"%{q.strip()}%"
            params.extend([p, p])
        if doc_type and doc_type.strip():
            sql += " AND doc_type = ?"
            params.append(doc_type.strip())
        sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        conn.close()
        return [_row_to_document(row) for row in rows]

    def update_document_title(self, doc_id: str, title: Optional[str]) -> None:
        updated_at = time.time()
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("UPDATE documents SET title = ?, updated_at = ? WHERE id = ?", (title, updated_at, doc_id))
        conn.commit()
        conn.close()

    def soft_delete_document(self, doc_id: str) -> None:
        updated_at = time.time()
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("UPDATE documents SET is_deleted = 1, updated_at = ? WHERE id = ?", (updated_at, doc_id))
        conn.commit()
        conn.close()

    def insert_document_text(
        self,
        doc_id: str,
        extracted_text: Optional[str],
        extractor: Optional[str] = None,
    ) -> None:
        extracted_at = time.time()
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(
            """INSERT OR REPLACE INTO document_text (doc_id, extracted_text, extracted_at, extractor)
               VALUES (?, ?, ?, ?)""",
            (doc_id, extracted_text, extracted_at, extractor),
        )
        conn.commit()
        conn.close()

    def get_document_text(self, doc_id: str) -> Optional[DocumentText]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM document_text WHERE doc_id = ?", (doc_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return DocumentText(
            doc_id=row["doc_id"],
            extracted_text=_col(row, "extracted_text"),
            extracted_at=_col(row, "extracted_at"),
            extractor=_col(row, "extractor"),
        )

    def get_documents_text_for_ids(
        self, doc_ids: List[str], max_total_chars: int = 20000
    ) -> List[Tuple[str, str]]:
        """Return list of (doc_id, extracted_text) for context, capped by max_total_chars."""
        if not doc_ids:
            return []
        conn = self._get_conn()
        cursor = conn.cursor()
        placeholders = ",".join("?" * len(doc_ids))
        cursor.execute(
            f"SELECT doc_id, extracted_text FROM document_text WHERE doc_id IN ({placeholders}) AND extracted_text IS NOT NULL AND extracted_text != ''",
            doc_ids,
        )
        rows = cursor.fetchall()
        conn.close()
        result: List[Tuple[str, str]] = []
        total = 0
        for row in rows:
            text = (row["extracted_text"] or "").strip()
            if not text or total >= max_total_chars:
                continue
            if total + len(text) > max_total_chars:
                text = text[: max_total_chars - total]
            total += len(text)
            result.append((row["doc_id"], text))
        return result

    def set_conversation_documents(self, conversation_id: str, doc_ids: List[str]) -> None:
        """Replace doc selection for a conversation."""
        added_at = time.time()
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM conversation_documents WHERE conversation_id = ?", (conversation_id,))
        for doc_id in doc_ids:
            if doc_id:
                cursor.execute(
                    "INSERT OR IGNORE INTO conversation_documents (conversation_id, doc_id, added_at) VALUES (?, ?, ?)",
                    (conversation_id, doc_id, added_at),
                )
        conn.commit()
        conn.close()

    def get_conversation_document_ids(self, conversation_id: str) -> List[str]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT doc_id FROM conversation_documents WHERE conversation_id = ? ORDER BY added_at ASC",
            (conversation_id,),
        )
        rows = cursor.fetchall()
        conn.close()
        return [row["doc_id"] for row in rows]


def _row_to_document(row) -> Document:
    return Document(
        id=row["id"],
        filename=row["filename"],
        title=_col(row, "title"),
        ext=row["ext"],
        mime=row["mime"],
        doc_type=row["doc_type"],
        size_bytes=int(row["size_bytes"]),
        sha256=row["sha256"],
        local_path=row["local_path"],
        created_at=float(row["created_at"]),
        updated_at=_col(row, "updated_at"),
        is_deleted=int(_col(row, "is_deleted", 0)),
    )
