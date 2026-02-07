"""DB layer for addons table: install tracking, enable/disable."""
import time
from typing import List, Optional

from .models import Addon


def _col(row, key: str, default=None):
    try:
        return row[key]
    except (IndexError, KeyError):
        return default


class AddonsMixin:
    def get_addon(self, addon_id: str) -> Optional[Addon]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM addons WHERE id = ?", (addon_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return self._row_to_addon(row)

    def list_addons(self, enabled_only: bool = False) -> List[Addon]:
        conn = self._get_conn()
        cursor = conn.cursor()
        if enabled_only:
            cursor.execute("SELECT * FROM addons WHERE is_enabled = 1 ORDER BY installed_at DESC")
        else:
            cursor.execute("SELECT * FROM addons ORDER BY installed_at DESC")
        rows = cursor.fetchall()
        conn.close()
        return [self._row_to_addon(row) for row in rows]

    def _row_to_addon(self, row) -> Addon:
        inst = _col(row, "installed_at")
        return Addon(
            id=row["id"],
            name=row["name"],
            version=row["version"],
            author=_col(row, "author"),
            description=_col(row, "description"),
            source=_col(row, "source") or "local_zip",
            installed_at=float(inst) if inst is not None else 0.0,
            is_enabled=bool(_col(row, "is_enabled") if _col(row, "is_enabled") is not None else True),
            manifest_json=_col(row, "manifest_json"),
            permissions_json=_col(row, "permissions_json"),
        )

    def upsert_addon(
        self,
        addon_id: str,
        name: str,
        version: str,
        author: Optional[str] = None,
        description: Optional[str] = None,
        source: str = "local_zip",
        manifest_json: Optional[str] = None,
        permissions_json: Optional[str] = None,
        is_enabled: bool = True,
    ) -> Addon:
        conn = self._get_conn()
        cursor = conn.cursor()
        installed_at = time.time()
        cursor.execute(
            """
            INSERT INTO addons (id, name, version, author, description, source, installed_at, is_enabled, manifest_json, permissions_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              version = excluded.version,
              author = excluded.author,
              description = excluded.description,
              source = excluded.source,
              installed_at = excluded.installed_at,
              is_enabled = excluded.is_enabled,
              manifest_json = excluded.manifest_json,
              permissions_json = excluded.permissions_json
            """,
            (
                addon_id,
                name,
                version,
                author,
                description,
                source,
                installed_at,
                1 if is_enabled else 0,
                manifest_json,
                permissions_json,
            ),
        )
        conn.commit()
        conn.close()
        return self.get_addon(addon_id)

    def set_addon_enabled(self, addon_id: str, enabled: bool) -> Optional[Addon]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("UPDATE addons SET is_enabled = ? WHERE id = ?", (1 if enabled else 0, addon_id))
        conn.commit()
        conn.close()
        return self.get_addon(addon_id)

    def delete_addon(self, addon_id: str) -> bool:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM addons WHERE id = ?", (addon_id,))
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success

    def addon_is_enabled(self, addon_id: str) -> bool:
        addon = self.get_addon(addon_id)
        return addon is not None and addon.is_enabled
