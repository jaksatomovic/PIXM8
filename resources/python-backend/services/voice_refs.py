import json
import os
from pathlib import Path
from typing import Any, Dict, Optional


def get_user_preferences(settings_json: Optional[str]) -> Dict[str, Any]:
    """Parse user settings_json into preferences dict. Safe defaults."""
    out: Dict[str, Any] = {
        "default_voice_id": None,
        "default_personality_id": None,
        "default_profile_id": None,
        "profiles": [],
        "use_default_voice_everywhere": True,
        "allow_experience_voice_override": False,
        "assistant_language": None,
    }
    if not settings_json or not settings_json.strip():
        return out
    try:
        data = json.loads(settings_json)
        if isinstance(data, dict):
            if "default_voice_id" in data and data["default_voice_id"]:
                out["default_voice_id"] = str(data["default_voice_id"]).strip()
            if "default_personality_id" in data and data["default_personality_id"]:
                out["default_personality_id"] = str(data["default_personality_id"]).strip()
            if "default_profile_id" in data and data["default_profile_id"]:
                out["default_profile_id"] = str(data["default_profile_id"]).strip()
            if "profiles" in data and isinstance(data["profiles"], list):
                out["profiles"] = [
                    {
                        "id": str(p.get("id", "")).strip(),
                        "name": str(p.get("name", "")).strip(),
                        "voice_id": str(p.get("voice_id", "")).strip() if p.get("voice_id") else None,
                        "personality_id": str(p.get("personality_id", "")).strip() if p.get("personality_id") else None,
                    }
                    for p in data["profiles"]
                    if isinstance(p, dict) and (p.get("id") or p.get("name"))
                ]
            if "use_default_voice_everywhere" in data:
                out["use_default_voice_everywhere"] = bool(data["use_default_voice_everywhere"])
            if "allow_experience_voice_override" in data:
                out["allow_experience_voice_override"] = bool(data["allow_experience_voice_override"])
            if "assistant_language" in data and data["assistant_language"]:
                # Store as lowercased language code / keyword (e.g. "en", "hr", "auto")
                out["assistant_language"] = str(data["assistant_language"]).strip().lower()
    except Exception:
        pass
    return out


def resolve_voice_id(
    preferences: Dict[str, Any],
    experience_voice_id: Optional[str],
    fallback_voice_id: Optional[str] = None,
) -> str:
    """
    Resolve which voice_id to use for TTS.
    - If user has default_voice and use_default_voice_everywhere -> use default.
    - Else if allow_experience_voice_override and experience has voice_id -> use experience voice.
    - Else if user has default_voice -> use default.
    - Else use experience voice, or fallback_voice_id, or 'radio'.
    """
    default_voice = preferences.get("default_voice_id") or None
    use_default_everywhere = preferences.get("use_default_voice_everywhere", True)
    allow_experience_override = preferences.get("allow_experience_voice_override", False)

    if default_voice and use_default_everywhere:
        return default_voice
    if allow_experience_override and experience_voice_id:
        return experience_voice_id
    if default_voice:
        return default_voice
    return (experience_voice_id or fallback_voice_id or "radio").strip()


def resolve_voice_ref_audio_path(voice_id: Optional[str]) -> Optional[str]:
    if not voice_id:
        return None
    voices_dir = os.environ.get("KEERO_VOICES_DIR")
    if not voices_dir:
        return None
    try:
        path = Path(voices_dir).joinpath(f"{voice_id}.wav")
        if path.exists() and path.is_file():
            return str(path)
    except Exception:
        return None
    return None
