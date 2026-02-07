import os
import sys
from pathlib import Path
from typing import Optional


def default_db_path() -> str:
    app_id = (
        os.environ.get("KEERO_APP_ID")
        or os.environ.get("TAURI_BUNDLE_IDENTIFIER")
        or "io.keero"
    )
    if os.name == "nt":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
        return os.path.join(base, app_id, "keero.db")
    if sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support")
        return os.path.join(base, app_id, "keero.db")
    base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return os.path.join(base, app_id, "keero.db")


def resolve_db_path(db_path: Optional[str] = None) -> str:
    resolved = db_path or os.environ.get("KEERO_DB_PATH") or default_db_path()
    if resolved and resolved != ":memory:":
        return str(Path(resolved).expanduser().resolve())
    return resolved


def assets_dir() -> Path:
    if os.environ.get("KEERO_ASSETS_DIR"):
        return Path(os.environ["KEERO_ASSETS_DIR"]).expanduser().resolve()
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / "app" / "src" / "assets"
