from dataclasses import dataclass
from typing import Any, Dict, List, Optional

# Experience type is a string; no restriction (personality, game, story, tool, workflow, etc.)
ExperienceType = str


@dataclass
class Experience:
    """Base model for personalities, games, stories, and future types."""
    id: str
    name: str
    prompt: str
    short_description: str
    tags: List[str]
    is_visible: bool
    is_global: bool
    voice_id: str
    type: str = "personality"
    img_src: Optional[str] = None
    created_at: Optional[float] = None
    addon_id: Optional[str] = None
    is_builtin: bool = False
    updated_at: Optional[float] = None
    meta_json: Optional[str] = None


# Alias for backward compatibility
Personality = Experience


@dataclass
class Voice:
    voice_id: str
    gender: Optional[str]
    voice_name: str
    voice_description: Optional[str]
    voice_src: Optional[str]
    is_global: bool
    created_at: Optional[float] = None
    addon_id: Optional[str] = None
    is_builtin: bool = False
    local_path: Optional[str] = None
    updated_at: Optional[float] = None


@dataclass
class Addon:
    id: str
    name: str
    version: str
    author: Optional[str]
    description: Optional[str]
    source: str
    installed_at: float
    is_enabled: bool
    manifest_json: Optional[str]
    permissions_json: Optional[str]


@dataclass
class Conversation:
    id: str
    role: str
    transcript: str
    timestamp: float
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    experience_id: Optional[str] = None


@dataclass
class User:
    id: str
    name: str
    age: Optional[int]
    dob: Optional[str]
    about_you: str
    personality_type: Optional[str]
    likes: List[str]
    current_personality_id: Optional[str]
    current_voice_id: Optional[str] = None
    user_type: str = "family"
    avatar_emoji: Optional[str] = None
    settings_json: Optional[str] = None


@dataclass
class Session:
    id: str
    started_at: float
    ended_at: Optional[float]
    duration_sec: Optional[float]
    client_type: str
    user_id: Optional[str]
    personality_id: Optional[str]


@dataclass
class Profile:
    """User profile: named voice + personality pair."""
    id: str
    user_id: str
    name: str
    voice_id: str
    personality_id: str
    created_at: Optional[float] = None


@dataclass
class Document:
    id: str
    filename: str
    title: Optional[str]
    ext: str
    mime: str
    doc_type: str
    size_bytes: int
    sha256: str
    local_path: str
    created_at: float
    updated_at: Optional[float]
    is_deleted: int = 0


@dataclass
class DocumentText:
    doc_id: str
    extracted_text: Optional[str]
    extracted_at: Optional[float]
    extractor: Optional[str]
