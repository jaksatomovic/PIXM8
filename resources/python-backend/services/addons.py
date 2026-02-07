import json
import logging
import os
import re
import shutil
import zipfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Addon pack limits
ZIP_MAX_BYTES = 100 * 1024 * 1024  # 100 MB
ALLOWED_EXTENSIONS = {".json", ".wav", ".png", ".jpg", ".jpeg", ".webp"}
MANIFEST_ID_REGEX = re.compile(r"^[a-zA-Z0-9_-]+$")


def get_addons_dir() -> Path:
    """Get the addons directory path."""
    db_path = os.environ.get("KEERO_DB_PATH")
    if db_path:
        base = Path(db_path).expanduser().resolve().parent
    else:
        from db.paths import default_db_path
        base = Path(default_db_path()).expanduser().resolve().parent
    
    return base / "addons"


def get_voices_dir() -> Path:
    """Get the voices directory path."""
    voices_dir = os.environ.get("KEERO_VOICES_DIR")
    if voices_dir:
        return Path(voices_dir).expanduser().resolve()
    
    db_path = os.environ.get("KEERO_DB_PATH")
    if db_path:
        base = Path(db_path).expanduser().resolve().parent
    else:
        from db.paths import default_db_path
        base = Path(default_db_path()).expanduser().resolve().parent
    
    return base / "voices"


def get_images_dir() -> Path:
    """Get the images directory path."""
    images_dir = os.environ.get("KEERO_IMAGES_DIR")
    if images_dir:
        return Path(images_dir).expanduser().resolve()
    
    db_path = os.environ.get("KEERO_DB_PATH")
    if db_path:
        base = Path(db_path).expanduser().resolve().parent
    else:
        from db.paths import default_db_path
        base = Path(default_db_path()).expanduser().resolve().parent
    
    return base / "images"


def validate_manifest(manifest: Dict) -> tuple[bool, Optional[str]]:
    """Validate addon manifest structure."""
    required_fields = ["id", "name", "version"]
    for field in required_fields:
        if field not in manifest:
            return False, f"Missing required field: {field}"
    
    if not isinstance(manifest["id"], str) or not manifest["id"].strip():
        return False, "manifest.id must be a non-empty string"
    
    if not isinstance(manifest["name"], str) or not manifest["name"].strip():
        return False, "manifest.name must be a non-empty string"
    
    if not isinstance(manifest["version"], str) or not manifest["version"].strip():
        return False, "manifest.version must be a non-empty string"
    
    addon_id = manifest["id"].strip()
    if not MANIFEST_ID_REGEX.match(addon_id):
        return False, "manifest.id contains invalid characters (only alphanumeric, underscore, hyphen allowed)"

    return True, None


def _safe_zip_member_name(name: str, extract_to: Path) -> Optional[Path]:
    """Resolve member name to a path under extract_to; return None if zip-slip."""
    path = (extract_to / name).resolve()
    try:
        path.relative_to(extract_to.resolve())
    except ValueError:
        return None
    return path


def extract_addon_zip(zip_path: Path, extract_to: Path) -> Tuple[bool, Optional[str]]:
    """Extract addon zip with zip-slip protection, size limit, and allowed file types only."""
    try:
        if zip_path.stat().st_size > ZIP_MAX_BYTES:
            return False, f"Zip file exceeds size limit ({ZIP_MAX_BYTES // (1024*1024)} MB)"

        extract_to.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            namelist = zip_ref.namelist()
            if not any(n.endswith("manifest.json") for n in namelist):
                return False, "Addon zip must contain manifest.json"

            for member in zip_ref.infolist():
                if member.is_dir():
                    continue
                name = member.filename
                if ".." in name or name.startswith("/"):
                    return False, "Invalid path in zip (zip-slip)"
                ext = Path(name).suffix.lower()
                if ext not in ALLOWED_EXTENSIONS:
                    continue  # skip disallowed files
                dest = _safe_zip_member_name(name, extract_to)
                if dest is None:
                    return False, "Invalid path in zip (zip-slip)"
                dest.parent.mkdir(parents=True, exist_ok=True)
                with zip_ref.open(member) as src:
                    dest.write_bytes(src.read())

        return True, None
    except zipfile.BadZipFile:
        return False, "Invalid zip file"
    except Exception as e:
        return False, f"Failed to extract addon: {str(e)}"


def load_manifest(addon_dir: Path) -> tuple[Optional[Dict], Optional[str]]:
    """Load and validate manifest.json from addon directory."""
    manifest_path = addon_dir / "manifest.json"
    if not manifest_path.exists():
        return None, "manifest.json not found"
    
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        
        valid, error = validate_manifest(manifest)
        if not valid:
            return None, error
        
        return manifest, None
    except json.JSONDecodeError as e:
        return None, f"Invalid JSON in manifest.json: {str(e)}"
    except Exception as e:
        return None, f"Failed to read manifest.json: {str(e)}"


def install_addon_from_zip(zip_path: Path) -> Dict:
    """Install an addon from a zip file."""
    addons_dir = get_addons_dir()
    addons_dir.mkdir(parents=True, exist_ok=True)
    
    # Extract to temp location first
    temp_extract = addons_dir / f".temp_{zip_path.stem}"
    try:
        success, error = extract_addon_zip(zip_path, temp_extract)
        if not success:
            return {"success": False, "error": error}
        
        # Load and validate manifest
        manifest, error = load_manifest(temp_extract)
        if not manifest:
            shutil.rmtree(temp_extract, ignore_errors=True)
            return {"success": False, "error": error}
        
        addon_id = manifest["id"]
        final_dir = addons_dir / addon_id
        
        # Remove existing addon if present
        if final_dir.exists():
            shutil.rmtree(final_dir)
        
        # Move to final location
        shutil.move(str(temp_extract), str(final_dir))
        
        # Upsert addon in DB (track install, enable by default)
        from db import service as db_service
        db_service.db_service.upsert_addon(
            addon_id=addon_id,
            name=manifest["name"],
            version=manifest["version"],
            author=manifest.get("author"),
            description=manifest.get("description"),
            source="local_zip",
            manifest_json=json.dumps(manifest),
            is_enabled=True,
        )
        
        # Install voices (copy files and upsert into DB with addon_id, local_path)
        voices_added = 0
        voices_dir = get_voices_dir()
        voices_dir.mkdir(parents=True, exist_ok=True)
        
        addon_voices_dir = final_dir / "voices"
        if addon_voices_dir.exists() and addon_voices_dir.is_dir():
            for voice_file in addon_voices_dir.glob("*.wav"):
                dest_voice = voices_dir / voice_file.name
                if not dest_voice.exists():
                    shutil.copy2(voice_file, dest_voice)
                    voices_added += 1
                voice_id = voice_file.stem
                db_service.db_service.upsert_voice(
                    voice_id=voice_id,
                    voice_name=voice_id,
                    addon_id=addon_id,
                    is_builtin=False,
                    local_path=str(dest_voice),
                )
        
        # Install images
        images_added = 0
        images_dir = get_images_dir()
        images_dir.mkdir(parents=True, exist_ok=True)
        
        addon_images_dir = final_dir / "images"
        if addon_images_dir.exists() and addon_images_dir.is_dir():
            for image_file in addon_images_dir.glob("*"):
                if image_file.is_file():
                    dest_image = images_dir / image_file.name
                    if not dest_image.exists():
                        shutil.copy2(image_file, dest_image)
                        images_added += 1
        
        # Load and install experiences from experiences.json and/or personalities.json, games.json, stories.json
        experiences_added = 0
        experiences_updated = 0
        errors: List[str] = []

        def load_experience_list(path: Path, default_type: str) -> List[Tuple[Dict, str]]:
            out: List[Tuple[Dict, str]] = []
            if not path.exists():
                return out
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(data, list):
                    data = [data]
                for item in data:
                    if isinstance(item, dict):
                        out.append((item, item.get("type") or default_type))
            except Exception as e:
                logger.warning(f"Failed to load {path.name}: {e}")
            return out

        all_experiences: List[Tuple[Dict, str]] = []
        all_experiences.extend(load_experience_list(final_dir / "experiences.json", "personality"))
        all_experiences.extend(load_experience_list(final_dir / "personalities.json", "personality"))
        all_experiences.extend(load_experience_list(final_dir / "games.json", "game"))
        all_experiences.extend(load_experience_list(final_dir / "stories.json", "story"))

        for exp_data, exp_type in all_experiences:
            exp_id = exp_data.get("id")
            if not exp_id:
                continue
            voice_id = exp_data.get("voice_id") or "radio"
            if not db_service.db_service._voice_exists(voice_id):
                fallback = db_service.db_service._default_voice_id()
                voice_id = fallback or "radio"
                errors.append(f"{exp_id}: voice_id not found, using {voice_id}")
            try:
                existing = db_service.db_service.get_experience(exp_id)
                if existing:
                    db_service.db_service.update_experience(
                        exp_id,
                        name=exp_data.get("name", existing.name),
                        prompt=exp_data.get("prompt", existing.prompt),
                        short_description=exp_data.get("short_description", existing.short_description),
                        tags=exp_data.get("tags", []),
                        voice_id=voice_id,
                        type=exp_data.get("type", existing.type),
                        img_src=exp_data.get("img_src", existing.img_src),
                        is_visible=exp_data.get("is_visible", True),
                        addon_id=addon_id,
                        is_builtin=False,
                    )
                    experiences_updated += 1
                else:
                    db_service.db_service.create_experience(
                        name=exp_data.get("name", ""),
                        prompt=exp_data.get("prompt", ""),
                        short_description=exp_data.get("short_description", ""),
                        tags=exp_data.get("tags", []),
                        voice_id=voice_id,
                        experience_type=exp_type,
                        is_visible=exp_data.get("is_visible", True),
                        is_global=False,
                        img_src=exp_data.get("img_src"),
                        addon_id=addon_id,
                        is_builtin=False,
                        experience_id=exp_id,
                    )
                    experiences_added += 1
            except Exception as e:
                errors.append(f"{exp_id}: {e}")
                logger.warning(f"Failed to upsert experience {exp_id}: {e}")
        
        return {
            "success": True,
            "addon_id": addon_id,
            "addon_name": manifest.get("name"),
            "addon_version": manifest.get("version"),
            "voices_added": voices_added,
            "images_added": images_added,
            "experiences_added": experiences_added,
            "experiences_updated": experiences_updated,
            "errors": errors,
        }
    except Exception as e:
        if temp_extract.exists():
            shutil.rmtree(temp_extract, ignore_errors=True)
        return {"success": False, "error": str(e)}


def list_installed_addons() -> List[Dict]:
    """List installed addons from DB with experience and voice counts."""
    try:
        from db import service as db_service
        addon_list = db_service.db_service.list_addons(enabled_only=False)
        conn = db_service.db_service._get_conn()
        cursor = conn.cursor()
        out = []
        for a in addon_list:
            cursor.execute(
                "SELECT COUNT(1) AS n FROM personalities WHERE addon_id = ?",
                (a.id,),
            )
            row = cursor.fetchone()
            exp_count = row["n"] if row else 0
            cursor.execute(
                "SELECT COUNT(1) AS n FROM voices WHERE addon_id = ?",
                (a.id,),
            )
            row = cursor.fetchone()
            voice_count = row["n"] if row else 0
            out.append({
                "id": a.id,
                "name": a.name,
                "version": a.version,
                "author": a.author,
                "description": a.description,
                "is_enabled": a.is_enabled,
                "experiences_count": exp_count,
                "voices_count": voice_count,
                "installed_at": a.installed_at,
            })
        conn.close()
        return out
    except Exception as e:
        logger.warning(f"list_installed_addons from DB failed: {e}")
        return []


_CATALOG_CACHE: Optional[List[Dict]] = None
_CATALOG_CACHE_TIME: float = 0.0
_CATALOG_CACHE_TTL = 300.0  # 5 minutes


def get_addon_catalog() -> List[Dict]:
    """Fetch addon catalog from ELATO_ADDON_CATALOG_URL (HTTPS only). Cached 5 minutes."""
    global _CATALOG_CACHE, _CATALOG_CACHE_TIME
    import time
    url = os.environ.get("ELATO_ADDON_CATALOG_URL", "").strip()
    if not url:
        return []
    if not url.lower().startswith("https://"):
        logger.warning("ELATO_ADDON_CATALOG_URL must be HTTPS")
        return []
    now = time.time()
    if _CATALOG_CACHE is not None and (now - _CATALOG_CACHE_TIME) < _CATALOG_CACHE_TTL:
        return _CATALOG_CACHE
    try:
        import urllib.request
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if isinstance(data, list):
            _CATALOG_CACHE = data
        elif isinstance(data, dict) and "addons" in data:
            _CATALOG_CACHE = data["addons"]
        else:
            _CATALOG_CACHE = []
        _CATALOG_CACHE_TIME = now
        return _CATALOG_CACHE
    except Exception as e:
        logger.warning(f"Failed to fetch addon catalog: {e}")
        return _CATALOG_CACHE if _CATALOG_CACHE is not None else []


def install_addon_from_url(zip_url: str) -> Dict:
    """Download zip from URL (HTTPS only) and run install_addon_from_zip. Size limit applies."""
    zip_url = (zip_url or "").strip()
    if not zip_url.lower().startswith("https://"):
        return {"success": False, "error": "URL must be HTTPS"}
    try:
        import tempfile
        import urllib.request
        req = urllib.request.Request(zip_url, headers={"Accept": "application/zip, */*"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
        if len(raw) > ZIP_MAX_BYTES:
            return {"success": False, "error": f"Download exceeds {ZIP_MAX_BYTES // (1024*1024)} MB"}
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
            tmp.write(raw)
            tmp_path = Path(tmp.name)
        try:
            return install_addon_from_zip(tmp_path)
        finally:
            if tmp_path.exists():
                tmp_path.unlink()
    except Exception as e:
        return {"success": False, "error": str(e)}


def uninstall_addon(addon_id: str) -> Dict:
    """Uninstall an addon by ID: remove DB rows (experiences, voices, addon), delete owned voice files, then remove addon directory."""
    addons_dir = get_addons_dir()
    addon_dir = addons_dir / addon_id

    try:
        from db import service as db_service

        if not db_service.db_service.get_addon(addon_id):
            return {"success": False, "error": f"Addon '{addon_id}' not found"}

        experiences_removed = db_service.db_service.delete_experiences_by_addon(addon_id)

        conn = db_service.db_service._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT voice_id, local_path FROM voices WHERE addon_id = ?", (addon_id,))
        voice_rows = cursor.fetchall()
        conn.close()

        for row in voice_rows:
            try:
                local_path = row["local_path"]
            except (IndexError, KeyError, TypeError):
                local_path = None
            if local_path and Path(local_path).exists():
                try:
                    Path(local_path).unlink()
                except Exception as e:
                    logger.warning(f"Failed to delete voice file {local_path}: {e}")

        voices_removed = db_service.db_service.delete_voices_by_addon(addon_id)
        db_service.db_service.delete_addon(addon_id)

        if addon_dir.exists():
            shutil.rmtree(addon_dir, ignore_errors=True)

        return {
            "success": True,
            "addon_id": addon_id,
            "experiences_removed": experiences_removed,
            "voices_removed": voices_removed,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
