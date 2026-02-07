"""Schema creation and migrations. Uses app_state.schema_version for versioning."""
from sqlite3 import Connection

TARGET_SCHEMA_VERSION = 3


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
