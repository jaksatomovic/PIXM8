"""Local pack discovery and install from app assets (no remote)."""
import json
import logging
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from db.paths import assets_dir

logger = logging.getLogger(__name__)


def _assets_packs_root() -> Path:
    return assets_dir() / "packs"


def _is_pack_installed(pack_id: str) -> bool:
    """True if addon exists in DB or any voices/personalities have addon_id=pack_id."""
    try:
        from db import service as db_service
        if db_service.db_service.get_addon(pack_id):
            return True
        conn = db_service.db_service._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM voices WHERE addon_id = ? LIMIT 1", (pack_id,))
        if cursor.fetchone():
            conn.close()
            return True
        cursor.execute("SELECT 1 FROM personalities WHERE addon_id = ? LIMIT 1", (pack_id,))
        out = cursor.fetchone() is not None
        conn.close()
        return out
    except Exception as e:
        logger.warning(f"Check installed failed for {pack_id}: {e}")
        return False


def get_local_packs_catalog() -> List[Dict[str, Any]]:
    """
    Scan assets/packs/<pack_id>/ for manifest.json.
    Return list of manifests with installed=True/False and source='local_assets'.
    Do NOT insert anything into DB.
    """
    root = _assets_packs_root()
    if not root.exists() or not root.is_dir():
        return []

    out: List[Dict[str, Any]] = []
    for path in root.iterdir():
        if not path.is_dir():
            continue
        pack_id = path.name
        manifest_path = path / "manifest.json"
        if not manifest_path.exists():
            continue
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"Invalid manifest.json in {pack_id}: {e}")
            continue
        if not isinstance(manifest, dict):
            continue
        mid = (manifest.get("id") or "").strip()
        if mid and mid != pack_id:
            logger.warning(f"Pack folder {pack_id} has manifest.id={mid}, skipping")
            continue
        entry = {
            "id": pack_id,
            "name": manifest.get("name", pack_id),
            "version": manifest.get("version", "0.0.0"),
            "author": manifest.get("author"),
            "description": manifest.get("description"),
            "img_src": manifest.get("img_src"),
            "installed": _is_pack_installed(pack_id),
            "source": "local_assets",
        }
        out.append(entry)
    return out


def install_local_pack(pack_id: str) -> Dict[str, Any]:
    """
    Install a pack from assets/packs/<pack_id>/ into DB.
    Validates manifest.json id matches pack_id.
    Upserts addon (source=local_assets), imports voices (from voices/*.wav and/or voices.json),
    imports personalities from personalities.json only (type=personality). No games/stories.
    """
    root = _assets_packs_root()
    pack_dir = root / pack_id
    if not pack_dir.exists() or not pack_dir.is_dir():
        return {"success": False, "error": f"Pack '{pack_id}' not found in assets"}

    manifest_path = pack_dir / "manifest.json"
    if not manifest_path.exists():
        return {"success": False, "error": "manifest.json required"}

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as e:
        return {"success": False, "error": f"Invalid manifest.json: {e}"}

    if not isinstance(manifest, dict):
        return {"success": False, "error": "manifest.json must be an object"}

    mid = (manifest.get("id") or "").strip()
    if mid and mid != pack_id:
        return {"success": False, "error": f"manifest.id '{mid}' does not match pack_id '{pack_id}'"}

    from db import service as db_service
    from services.addons import get_voices_dir, validate_manifest

    ok, err = validate_manifest(manifest)
    if not ok:
        return {"success": False, "error": err or "Invalid manifest"}

    voices_added = 0
    personalities_added = 0
    personalities_updated = 0
    errors: List[str] = []

    now = time.time()
    db_service.db_service.upsert_addon(
        addon_id=pack_id,
        name=manifest.get("name", pack_id),
        version=manifest.get("version", "0.0.0"),
        author=manifest.get("author"),
        description=manifest.get("description"),
        source="local_assets",
        manifest_json=json.dumps(manifest),
        is_enabled=True,
    )

    voices_dir = get_voices_dir()
    voices_dir.mkdir(parents=True, exist_ok=True)

    voices_json_list: List[Dict[str, Any]] = []
    voices_json = pack_dir / "voices.json"
    if voices_json.exists():
        try:
            payload = json.loads(voices_json.read_text(encoding="utf-8"))
            if isinstance(payload, list):
                voices_json_list = [i for i in payload if isinstance(i, dict)]
        except Exception as e:
            errors.append(f"voices.json: {e}")

    pack_voices_dir = pack_dir / "voices"
    wav_voice_ids: Set[str] = set()
    if pack_voices_dir.exists() and pack_voices_dir.is_dir():
        for wav in pack_voices_dir.glob("*.wav"):
            voice_id = wav.stem
            wav_voice_ids.add(voice_id)
            dest = voices_dir / wav.name
            if not dest.exists():
                shutil.copy2(wav, dest)
            meta = next((m for m in voices_json_list if (m.get("voice_id") or m.get("id")) == voice_id), None)
            db_service.db_service.upsert_voice(
                voice_id=voice_id,
                voice_name=str(meta.get("voice_name") or meta.get("name") or voice_id) if meta else voice_id,
                gender=meta.get("gender") if meta else None,
                voice_description=str(meta.get("voice_description") or meta.get("description") or "") if meta else None,
                voice_src=meta.get("voice_src") or meta.get("src") if meta else None,
                is_global=False,
                addon_id=pack_id,
                is_builtin=False,
                local_path=str(dest.resolve()),
            )
            voices_added += 1

    for item in voices_json_list:
        vid = (item.get("voice_id") or item.get("id")) or ""
        vname = item.get("voice_name") or item.get("name")
        if not vid or not vname or vid in wav_voice_ids:
            continue
        db_service.db_service.upsert_voice(
            voice_id=str(vid),
            voice_name=str(vname),
            gender=item.get("gender"),
            voice_description=item.get("voice_description") or item.get("description"),
            voice_src=item.get("voice_src") or item.get("src"),
            is_global=False,
            addon_id=pack_id,
            is_builtin=False,
            local_path=None,
        )
        voices_added += 1

    personalities_json = pack_dir / "personalities.json"
    if personalities_json.exists():
        try:
            payload = json.loads(personalities_json.read_text(encoding="utf-8"))
            if not isinstance(payload, list):
                payload = [payload] if isinstance(payload, dict) else []
            for item in payload:
                if not isinstance(item, dict):
                    continue
                p_id = item.get("id")
                name = item.get("name")
                prompt = item.get("prompt")
                voice_id = item.get("voice_id")
                if not p_id or not name or not prompt or not voice_id:
                    continue
                if not db_service.db_service._voice_exists(str(voice_id)):
                    fallback = db_service.db_service._default_voice_id()
                    voice_id = fallback or voice_id
                    errors.append(f"{p_id}: voice not found, using {voice_id}")
                try:
                    existing = db_service.db_service.get_experience(str(p_id))
                    if existing:
                        db_service.db_service.update_experience(
                            str(p_id),
                            name=name,
                            prompt=prompt,
                            short_description=item.get("short_description", ""),
                            tags=item.get("tags", []),
                            voice_id=str(voice_id),
                            type="personality",
                            img_src=item.get("img_src"),
                            is_visible=True,
                            addon_id=pack_id,
                            is_builtin=False,
                        )
                        personalities_updated += 1
                    else:
                        db_service.db_service.create_experience(
                            name=name,
                            prompt=prompt,
                            short_description=item.get("short_description", ""),
                            tags=item.get("tags", []),
                            voice_id=str(voice_id),
                            experience_type="personality",
                            is_visible=True,
                            is_global=False,
                            img_src=item.get("img_src"),
                            addon_id=pack_id,
                            is_builtin=False,
                            experience_id=str(p_id),
                        )
                        personalities_added += 1
                except Exception as e:
                    errors.append(f"{p_id}: {e}")
        except Exception as e:
            errors.append(f"personalities.json: {e}")

    return {
        "success": True,
        "addon_id": pack_id,
        "addon_name": manifest.get("name", pack_id),
        "voices_added": voices_added,
        "personalities_added": personalities_added,
        "personalities_updated": personalities_updated,
        "errors": errors,
    }
