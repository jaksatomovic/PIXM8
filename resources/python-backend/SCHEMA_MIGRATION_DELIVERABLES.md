# Schema Migration Deliverables

## Modified files

- **db/schema.py** – Migration mechanism (get_schema_version, set_schema_version, _column_exists, _index_exists), v1→v2 and v2→v3 migrations, base CREATE TABLE scripts.
- **db/base.py** – Added `addons` to ALLOWED_TABLES.
- **db/models.py** – ExperienceType as `str`; Experience (addon_id, is_builtin, updated_at, meta_json); Voice (addon_id, is_builtin, local_path, updated_at); Addon dataclass; User.settings_json; Conversation (user_id, experience_id).
- **db/addons.py** (new) – AddonsMixin: get_addon, list_addons, upsert_addon, set_addon_enabled, delete_addon.
- **db/personalities.py** – _col; _row_to_experience with new columns; get_experiences(include_disabled) with addon visibility; create_experience with addon_id, is_builtin, experience_id; update_experience with addon_id, is_builtin, meta_json, updated_at; delete_experiences_by_addon.
- **db/voices.py** – _col; _row_to_voice with new columns; get_voices(include_disabled_addons) with addon visibility; upsert_voice with addon_id, is_builtin, local_path, updated_at; delete_voices_by_addon.
- **db/seeds.py** – Voices INSERT with addon_id=NULL, is_builtin=1, local_path=NULL, updated_at; personalities INSERT with addon_id=NULL, is_builtin=1, updated_at.
- **db/conversations.py** – log_conversation(user_id, experience_id); get_conversations _col for user_id, experience_id.
- **db/users.py** – get_users/get_user/create_user/update_user with settings_json.
- **db/service.py** – Add AddonsMixin; init_schema runs migrations (unchanged call order).
- **services/addons.py** – install: upsert_addon after extract; voices upsert_voice with addon_id, local_path; experiences create_experience/update_experience with addon_id, is_builtin; uninstall: delete_experiences_by_addon, delete voice files by local_path, delete_voices_by_addon, delete_addon, rmtree.
- **server.py** – get_experiences: pass type as-is (no restriction to personality/game/story).

---

## Schema versions and migration steps

- **v1 (baseline)** – app_state, voices, personalities, sessions, conversations, users (legacy columns via previous inline block; v1→v2 now ensures users columns).
- **v2** – addons table; voices (addon_id, is_builtin, local_path, updated_at) + indexes; personalities (addon_id, is_builtin, updated_at, meta_json) + indexes; users legacy columns ensured.
- **v3** – users.settings_json; conversations (user_id, experience_id) + indexes.

**Rules:** If `app_state.schema_version` is missing, treat as v1. Run migrations in a transaction (BEGIN/COMMIT; rollback on error). Use _column_exists and _index_exists so each step is idempotent.

---

## Final schema (CREATE TABLE statements)

```sql
-- v1 base (unchanged)
CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS voices (
  voice_id TEXT PRIMARY KEY, gender TEXT, voice_name TEXT NOT NULL, voice_description TEXT,
  voice_src TEXT, is_global BOOLEAN DEFAULT 0, created_at REAL
);
CREATE TABLE IF NOT EXISTS personalities (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, prompt TEXT NOT NULL, short_description TEXT,
  tags TEXT, is_visible BOOLEAN DEFAULT 1, voice_id TEXT NOT NULL, is_global BOOLEAN DEFAULT 0,
  img_src TEXT, type TEXT DEFAULT 'personality', created_at REAL
);
CREATE TABLE IF NOT EXISTS sessions (...);
CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, role TEXT NOT NULL, transcript TEXT NOT NULL, timestamp REAL NOT NULL, session_id TEXT);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, ...);

-- v2
CREATE TABLE IF NOT EXISTS addons (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL, author TEXT, description TEXT,
  source TEXT NOT NULL DEFAULT 'local_zip', installed_at REAL NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1,
  manifest_json TEXT, permissions_json TEXT
);
CREATE INDEX idx_addons_enabled ON addons(is_enabled);
-- ALTER TABLE voices ADD COLUMN addon_id TEXT; ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0; ADD COLUMN local_path TEXT; ADD COLUMN updated_at REAL;
CREATE INDEX idx_voices_addon_id ON voices(addon_id);
CREATE INDEX idx_voices_builtin ON voices(is_builtin);
-- ALTER TABLE personalities ADD COLUMN addon_id TEXT; ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0; ADD COLUMN updated_at REAL; ADD COLUMN meta_json TEXT;
CREATE INDEX idx_personalities_addon_id ON personalities(addon_id);
CREATE INDEX idx_personalities_type ON personalities(type);
CREATE INDEX idx_personalities_builtin ON personalities(is_builtin);

-- v3
-- ALTER TABLE users ADD COLUMN settings_json TEXT;
-- ALTER TABLE conversations ADD COLUMN user_id TEXT; ADD COLUMN experience_id TEXT;
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_experience_id ON conversations(experience_id);
```

---

## How to verify in SQLite

```bash
# Open DB (replace with actual path, e.g. ~/Library/Application Support/io.keero/keero.db)
sqlite3 /path/to/keero.db

# Schema version
SELECT * FROM app_state WHERE key = 'schema_version';

# Addons table and sample
SELECT * FROM addons;
SELECT COUNT(*) FROM addons;

# Voices new columns
PRAGMA table_info(voices);

# Personalities new columns
PRAGMA table_info(personalities);

# Built-in content
SELECT id, name, is_builtin, addon_id FROM personalities WHERE is_builtin = 1 LIMIT 5;
SELECT voice_id, voice_name, is_builtin, addon_id FROM voices WHERE is_builtin = 1 LIMIT 5;

# Indexes
SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('addons','voices','personalities','conversations');
```

---

## Test plan

1. **Existing DB** – Run app against an existing DB; confirm no crash, schema_version becomes 2 then 3, existing users/sessions/conversations/voices/personalities still load.
2. **New DB** – Run app with fresh DB; confirm addons table exists, voices/personalities have new columns, seeds set is_builtin=1 and addon_id=NULL.
3. **Install addon** – Install a zip addon; confirm addons row exists, experiences have addon_id set, voices have addon_id and local_path.
4. **Uninstall addon** – Uninstall that addon; confirm addon row removed, experiences/voices with that addon_id removed, addon directory removed; voice files with that addon’s local_path deleted.
5. **Visibility** – Disable an addon (set addons.is_enabled=0); confirm get_experiences/get_voices exclude that addon’s content; re-enable and confirm they reappear.
6. **New experience type** – Create or install an experience with type e.g. "tool"; confirm no type restriction error and it appears in list when addon enabled.
