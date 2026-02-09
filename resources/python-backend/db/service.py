import logging
from typing import Optional

from .base import BaseDB
from .addons import AddonsMixin
from .conversations import ConversationsMixin
from .devices import DeviceMixin
from .documents import DocumentsMixin
from .paths import resolve_db_path
from .schema import init_schema
from .personalities import PersonalitiesMixin
from .profiles import ProfilesMixin
from .seeds import SeedMixin
from .sessions import SessionsMixin
from .settings import SettingsMixin
from .user_faces import UserFacesMixin
from .users import UsersMixin
from .voices import VoicesMixin

logger = logging.getLogger(__name__)


class DBService(
    BaseDB,
    AddonsMixin,
    SettingsMixin,
    DeviceMixin,
    DocumentsMixin,
    VoicesMixin,
    PersonalitiesMixin,
    ProfilesMixin,
    UserFacesMixin,
    UsersMixin,
    SessionsMixin,
    ConversationsMixin,
    SeedMixin,
):
    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = resolve_db_path(db_path)
        if self.db_path and self.db_path != ":memory:":
            from pathlib import Path

            Path(self.db_path).expanduser().parent.mkdir(parents=True, exist_ok=True)

        conn = self._get_conn()
        init_schema(conn)
        conn.commit()
        conn.close()

        self.seeded_ok = False
        try:
            self.sync_global_voices_and_personalities()
            self._seed_default_user()
            self.seeded_ok = True
        except Exception:
            logger.exception("DB seed failed")


db_service = DBService()
