import os
import sys
from pathlib import Path
from typing import Optional


def default_db_path() -> str:
    app_id = (
        os.environ.get("PIXM8_APP_ID")
        or os.environ.get("TAURI_BUNDLE_IDENTIFIER")
        or "com.pixm8.pixm8-local"
    )
    if os.name == "nt":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
        return os.path.join(base, app_id, "pixm8.db")
    if sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support")
        return os.path.join(base, app_id, "pixm8.db")
    base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return os.path.join(base, app_id, "pixm8.db")


def resolve_db_path(db_path: Optional[str] = None) -> str:
    resolved = db_path or os.environ.get("PIXM8_DB_PATH") or default_db_path()
    if resolved and resolved != ":memory:":
        return str(Path(resolved).expanduser().resolve())
    return resolved


def assets_dir() -> Path:
    if os.environ.get("PIXM8_ASSETS_DIR"):
        return Path(os.environ["PIXM8_ASSETS_DIR"]).expanduser().resolve()
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / "app" / "src" / "assets"
