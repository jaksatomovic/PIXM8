"""Schema creation and migrations. Uses app_state.schema_version for versioning."""
from sqlite3 import Connection

TARGET_SCHEMA_VERSION = 6


def _column_exists(conn: Connection, table: str, column: str) -> bool:
    # PRAGMA table_info(table) - table name cannot be bound in SQLite
    cur = conn.execute(f"PRAGMA table_info({table})")
    for row in cur.fetchall():
        if row[1] == column:
            return True
    return False


def _index_exists(conn: Connection, index_name: str) -> bool:
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='index' AND name=?", (index_name,))
    return cur.fetchone() is not None


def get_schema_version(conn: Connection) -> int:
    cur = conn.execute("SELECT value FROM app_state WHERE key = ?", ("schema_version",))
    row = cur.fetchone()
    if row is None:
        return 1
    try:
        return int(row[0])
    except (TypeError, ValueError):
        return 1


def set_schema_version(conn: Connection, version: int) -> None:
    conn.execute(
        "INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        ("schema_version", str(version)),
    )


def init_schema(conn: Connection) -> None:
    """Create base tables (v1) and run migrations up to TARGET_SCHEMA_VERSION."""
    conn.executescript(
        """
        PRAGMA journal_mode=WAL;

        CREATE TABLE IF NOT EXISTS app_state (
          key TEXT PRIMARY KEY,
          value TEXT
        );

        CREATE TABLE IF NOT EXISTS voices (
          voice_id TEXT PRIMARY KEY,
          gender TEXT,
          voice_name TEXT NOT NULL,
          voice_description TEXT,
          voice_src TEXT,
          is_global BOOLEAN DEFAULT 0,
          created_at REAL
        );

        CREATE TABLE IF NOT EXISTS personalities (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          prompt TEXT NOT NULL,
          short_description TEXT,
          tags TEXT,
          is_visible BOOLEAN DEFAULT 1,
          voice_id TEXT NOT NULL,
          is_global BOOLEAN DEFAULT 0,
          img_src TEXT,
          type TEXT DEFAULT 'personality',
          created_at REAL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          started_at REAL NOT NULL,
          ended_at REAL,
          duration_sec REAL,
          client_type TEXT NOT NULL,
          user_id TEXT,
          personality_id TEXT
        );

        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          role TEXT NOT NULL,
          transcript TEXT NOT NULL,
          timestamp REAL NOT NULL,
          session_id TEXT
        );

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          age INTEGER,
          dob TEXT,
          hobbies TEXT,
          about_you TEXT DEFAULT '',
          personality_type TEXT,
          likes TEXT,
          current_personality_id TEXT,
          user_type TEXT DEFAULT 'family',
          avatar_emoji TEXT,
          device_volume INTEGER DEFAULT 70,
          FOREIGN KEY (current_personality_id) REFERENCES personalities (id)
        );

        INSERT INTO app_state (key, value)
        VALUES ('laptop_volume', '70')
        ON CONFLICT(key) DO NOTHING;

        PRAGMA foreign_keys=ON;
        """
    )
    run_migrations(conn)


def run_migrations(conn: Connection) -> None:
    """Run migrations from current schema version to TARGET_SCHEMA_VERSION."""
    current = get_schema_version(conn)
    while current < TARGET_SCHEMA_VERSION:
        if current == 1:
            _migrate_v1_to_v2(conn)
            current = 2
            set_schema_version(conn, current)
        elif current == 2:
            _migrate_v2_to_v3(conn)
            current = 3
            set_schema_version(conn, current)
        elif current == 3:
            _migrate_v3_to_v4(conn)
            current = 4
            set_schema_version(conn, current)
        elif current == 4:
            _migrate_v4_to_v5(conn)
            current = 5
            set_schema_version(conn, current)
        elif current == 5:
            _migrate_v5_to_v6(conn)
            current = 6
            set_schema_version(conn, current)
        else:
            break


def _migrate_v1_to_v2(conn: Connection) -> None:
    """Add addons table; extend voices and personalities with addon ownership."""
    conn.rollback()
    conn.execute("BEGIN TRANSACTION")
    try:
        # Ensure users table has legacy columns (in case old DBs never had the inline block)
        for col, typ in [
            ("age", "INTEGER"),
            ("dob", "TEXT"),
            ("hobbies", "TEXT"),
            ("about_you", "TEXT DEFAULT ''"),
            ("personality_type", "TEXT"),
            ("likes", "TEXT"),
            ("current_personality_id", "TEXT"),
            ("user_type", "TEXT DEFAULT 'family'"),
            ("avatar_emoji", "TEXT"),
            ("device_volume", "INTEGER DEFAULT 70"),
        ]:
            if not _column_exists(conn, "users", col):
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} {typ}")

        # Addons table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS addons (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              version TEXT NOT NULL,
              author TEXT,
              description TEXT,
              source TEXT NOT NULL DEFAULT 'local_zip',
              installed_at REAL NOT NULL,
              is_enabled INTEGER NOT NULL DEFAULT 1,
              manifest_json TEXT,
              permissions_json TEXT
            )
            """
        )
        if not _index_exists(conn, "idx_addons_enabled"):
            conn.execute("CREATE INDEX idx_addons_enabled ON addons(is_enabled)")

        # Voices: addon_id, is_builtin, local_path, updated_at
        for col, typ in [
            ("addon_id", "TEXT"),
            ("is_builtin", "INTEGER NOT NULL DEFAULT 0"),
            ("local_path", "TEXT"),
            ("updated_at", "REAL"),
        ]:
            if not _column_exists(conn, "voices", col):
                conn.execute(f"ALTER TABLE voices ADD COLUMN {col} {typ}")
        if not _index_exists(conn, "idx_voices_addon_id"):
            conn.execute("CREATE INDEX idx_voices_addon_id ON voices(addon_id)")
        if not _index_exists(conn, "idx_voices_builtin"):
            conn.execute("CREATE INDEX idx_voices_builtin ON voices(is_builtin)")

        # Personalities: addon_id, is_builtin, updated_at, meta_json
        for col, typ in [
            ("addon_id", "TEXT"),
            ("is_builtin", "INTEGER NOT NULL DEFAULT 0"),
            ("updated_at", "REAL"),
            ("meta_json", "TEXT"),
        ]:
            if not _column_exists(conn, "personalities", col):
                conn.execute(f"ALTER TABLE personalities ADD COLUMN {col} {typ}")
        if not _index_exists(conn, "idx_personalities_addon_id"):
            conn.execute("CREATE INDEX idx_personalities_addon_id ON personalities(addon_id)")
        if not _index_exists(conn, "idx_personalities_type"):
            conn.execute("CREATE INDEX idx_personalities_type ON personalities(type)")
        if not _index_exists(conn, "idx_personalities_builtin"):
            conn.execute("CREATE INDEX idx_personalities_builtin ON personalities(is_builtin)")

        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def _migrate_v2_to_v3(conn: Connection) -> None:
    """Add users.settings_json; conversations.user_id, experience_id."""
    conn.rollback()
    conn.execute("BEGIN TRANSACTION")
    try:
        if not _column_exists(conn, "users", "settings_json"):
            conn.execute("ALTER TABLE users ADD COLUMN settings_json TEXT")
        if not _column_exists(conn, "conversations", "user_id"):
            conn.execute("ALTER TABLE conversations ADD COLUMN user_id TEXT")
        if not _column_exists(conn, "conversations", "experience_id"):
            conn.execute("ALTER TABLE conversations ADD COLUMN experience_id TEXT")
        if not _index_exists(conn, "idx_conversations_user_id"):
            conn.execute("CREATE INDEX idx_conversations_user_id ON conversations(user_id)")
        if not _index_exists(conn, "idx_conversations_experience_id"):
            conn.execute("CREATE INDEX idx_conversations_experience_id ON conversations(experience_id)")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def _migrate_v3_to_v4(conn: Connection) -> None:
    """Add users.current_voice_id for session voice override (voice + personality pair)."""
    conn.rollback()
    conn.execute("BEGIN TRANSACTION")
    try:
        if not _column_exists(conn, "users", "current_voice_id"):
            conn.execute("ALTER TABLE users ADD COLUMN current_voice_id TEXT")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def _migrate_v4_to_v5(conn: Connection) -> None:
    """Add documents, document_text, conversation_documents for Docs Library."""
    conn.rollback()
    conn.execute("BEGIN TRANSACTION")
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
              id TEXT PRIMARY KEY,
              filename TEXT NOT NULL,
              title TEXT,
              ext TEXT NOT NULL,
              mime TEXT NOT NULL,
              doc_type TEXT NOT NULL,
              size_bytes INTEGER NOT NULL,
              sha256 TEXT NOT NULL,
              local_path TEXT NOT NULL,
              created_at REAL NOT NULL,
              updated_at REAL,
              is_deleted INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        if not _index_exists(conn, "idx_documents_type"):
            conn.execute("CREATE INDEX idx_documents_type ON documents(doc_type)")
        if not _index_exists(conn, "idx_documents_filename"):
            conn.execute("CREATE INDEX idx_documents_filename ON documents(filename)")
        if not _index_exists(conn, "idx_documents_created_at"):
            conn.execute("CREATE INDEX idx_documents_created_at ON documents(created_at)")
        if not _index_exists(conn, "idx_documents_sha256"):
            conn.execute("CREATE INDEX idx_documents_sha256 ON documents(sha256)")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS document_text (
              doc_id TEXT PRIMARY KEY,
              extracted_text TEXT,
              extracted_at REAL,
              extractor TEXT
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS conversation_documents (
              conversation_id TEXT NOT NULL,
              doc_id TEXT NOT NULL,
              added_at REAL NOT NULL,
              PRIMARY KEY (conversation_id, doc_id)
            )
            """
        )
        if not _index_exists(conn, "idx_conversation_documents_conversation_id"):
            conn.execute("CREATE INDEX idx_conversation_documents_conversation_id ON conversation_documents(conversation_id)")
        if not _index_exists(conn, "idx_conversation_documents_doc_id"):
            conn.execute("CREATE INDEX idx_conversation_documents_doc_id ON conversation_documents(doc_id)")

        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def _migrate_v5_to_v6(conn: Connection) -> None:
    """Add profiles table; migrate profiles from users.settings_json into table."""
    import json
    import time
    conn.rollback()
    conn.execute("BEGIN TRANSACTION")
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS profiles (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              name TEXT NOT NULL,
              voice_id TEXT NOT NULL,
              personality_id TEXT NOT NULL,
              created_at REAL,
              FOREIGN KEY (user_id) REFERENCES users (id)
            )
            """
        )
        if not _index_exists(conn, "idx_profiles_user_id"):
            conn.execute("CREATE INDEX idx_profiles_user_id ON profiles(user_id)")

        # Data migration: move profiles from settings_json into profiles table
        cur = conn.execute("SELECT id, settings_json FROM users WHERE settings_json IS NOT NULL AND settings_json != ''")
        for row in cur.fetchall():
            user_id = row["id"]
            try:
                prefs = json.loads(row["settings_json"] or "{}")
            except (TypeError, ValueError):
                continue
            profiles_data = prefs.get("profiles")
            if not isinstance(profiles_data, list) or len(profiles_data) == 0:
                continue
            for pr in profiles_data:
                pid = pr.get("id") if isinstance(pr, dict) else None
                name = pr.get("name") if isinstance(pr, dict) else ""
                voice_id = pr.get("voice_id") if isinstance(pr, dict) else ""
                personality_id = pr.get("personality_id") if isinstance(pr, dict) else ""
                if not pid or not name or not voice_id or not personality_id:
                    continue
                created_at = time.time()
                conn.execute(
                    "INSERT OR IGNORE INTO profiles (id, user_id, name, voice_id, personality_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (str(pid), user_id, (str(name))[:80], str(voice_id), str(personality_id), created_at),
                )
            # Remove profiles from settings_json, keep rest (including default_profile_id)
            prefs.pop("profiles", None)
            new_json = json.dumps(prefs)
            conn.execute("UPDATE users SET settings_json = ? WHERE id = ?", (new_json, user_id))

        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
