import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useActiveUser } from '../state/ActiveUserContext';
import { UserCircle, Plus } from 'lucide-react';
import { Modal } from '../components/Modal';

type ActiveSession = {
  session_id: string | null;
  active_personality_id: string | null;
  default_personality_id: string | null;
  active_personality_name: string | null;
  default_personality_name: string | null;
  profiles?: Array<{ id: string; name: string; voice_id: string; personality_id: string }>;
  default_profile_id?: string | null;
};

type Personality = { id: string; name: string; short_description?: string };

export const ProfilesPage = () => {
  const navigate = useNavigate();
  const { activeUserId, refreshUsers } = useActiveUser();
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string; voice_id: string; personality_id: string }>>([]);
  const [voices, setVoices] = useState<Array<{ voice_id: string; voice_name: string }>>([]);
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [preferences, setPreferences] = useState<{ default_profile_id?: string | null }>({ default_profile_id: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileVoiceId, setNewProfileVoiceId] = useState('');
  const [newProfilePersonalityId, setNewProfilePersonalityId] = useState('');
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadActiveSession = async () => {
    try {
      const data = await api.getActiveSession();
      setActiveSession({
        session_id: data?.session_id ?? null,
        active_personality_id: data?.active_personality_id ?? null,
        default_personality_id: data?.default_personality_id ?? null,
        active_personality_name: data?.active_personality_name ?? null,
        default_personality_name: data?.default_personality_name ?? null,
        profiles: data?.profiles ?? [],
        default_profile_id: data?.default_profile_id ?? null,
      });
      if (Array.isArray(data?.profiles)) setProfiles(data.profiles);
    } catch {
      setActiveSession(null);
    }
  };

  const loadProfiles = async () => {
    try {
      const res = await api.getProfiles();
      const list = (res as any)?.profiles ?? [];
      setProfiles(Array.isArray(list) ? list : []);
    } catch {
      setProfiles([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setError(null);
        const [voicesRes, prefs, active, exps] = await Promise.all([
          api.getVoices().catch(() => []),
          api.getPreferences().catch(() => ({ default_profile_id: null })),
          api.getActiveSession().catch(() => null),
          api.getExperiences(false, 'personality').catch(() => []),
        ]);
        if (!cancelled) {
          setVoices(Array.isArray(voicesRes) ? voicesRes : []);
          setPreferences({ default_profile_id: (prefs as any)?.default_profile_id ?? null });
          setPersonalities(Array.isArray(exps) ? exps : []);
          if (active) {
            setActiveSession({
              session_id: active?.session_id ?? null,
              active_personality_id: active?.active_personality_id ?? null,
              default_personality_id: active?.default_personality_id ?? null,
              active_personality_name: active?.active_personality_name ?? null,
              default_personality_name: active?.default_personality_name ?? null,
              profiles: active?.profiles ?? [],
              default_profile_id: active?.default_profile_id ?? null,
            });
            if (Array.isArray(active?.profiles)) setProfiles(active.profiles);
          } else {
            setActiveSession(null);
          }
          const profRes = await api.getProfiles().catch(() => ({ profiles: [] }));
          if (!cancelled && Array.isArray((profRes as any)?.profiles)) setProfiles((profRes as any).profiles);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load profiles');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const setDefaultProfile = async (profileId: string) => {
    try {
      await api.setPreferences({ default_profile_id: profileId });
      setPreferences((p) => ({ ...p, default_profile_id: profileId }));
      await loadActiveSession();
    } catch (e: any) {
      console.error('Set default profile failed', e);
    }
  };

  const useProfileForSession = async (profileId: string) => {
    if (!activeUserId) {
      setError('Select a member first in Members.');
      return;
    }
    try {
      setError(null);
      await api.setActiveSessionProfile(profileId);
      await Promise.all([loadActiveSession(), refreshUsers()]);
      try {
        await api.setAppMode('chat');
      } catch {
        // non-blocking
      }
      navigate('/chat');
    } catch (e: any) {
      setError(e?.message || 'Failed to set profile');
    }
  };

  const createProfile = async () => {
    if (!newProfileName.trim() || !newProfileVoiceId || !newProfilePersonalityId) return;
    setCreateError(null);
    setCreateSaving(true);
    try {
      await api.createProfile({
        name: newProfileName.trim(),
        voice_id: newProfileVoiceId,
        personality_id: newProfilePersonalityId,
      });
      setNewProfileName('');
      setNewProfileVoiceId('');
      setNewProfilePersonalityId('');
      setCreateModalOpen(false);
      await loadProfiles();
      await loadActiveSession();
    } catch (e: any) {
      console.error('Create profile failed', e);
      const msg = e?.message || 'Failed to create profile.';
      setCreateError(
        e?.status === 404
          ? 'Profiles API not found. Restart the app (close and run again) so the backend uses the latest code.'
          : msg
      );
    } finally {
      setCreateSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-black flex items-center gap-3">
          <UserCircle className="w-7 h-7" />
          Profiles
        </h1>
        <div className="retro-card font-mono text-sm py-12 text-center text-[var(--color-retro-fg-secondary)]">
          Loading profiles…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-black flex items-center gap-3">
          <UserCircle className="w-7 h-7" />
          Profiles
        </h1>
        <button
          type="button"
          className="retro-btn retro-btn-outline flex items-center gap-2"
          onClick={() => {
            setCreateModalOpen(true);
            setNewProfileName('');
            setNewProfileVoiceId('');
            setNewProfilePersonalityId('');
            setCreateError(null);
          }}
        >
          <Plus size={16} />
          Create profile
        </button>
      </div>

      <Modal
        open={createModalOpen}
        icon={<UserCircle size={24} />}
        title="Create profile"
        onClose={() => setCreateModalOpen(false)}
        panelClassName="w-full max-w-lg"
      >
        <p className="text-sm text-gray-600 mb-4">
          Save a voice + personality pair for the robot (e.g. Friendly Anna, Bossy Robot). Set one as default for device or use for this session.
        </p>
        <div className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Profile name"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            className="retro-input w-full"
          />
          <select
            className="retro-input w-full"
            value={newProfileVoiceId}
            onChange={(e) => setNewProfileVoiceId(e.target.value)}
          >
            <option value="">— Voice —</option>
            {voices.map((v) => (
              <option key={v.voice_id} value={v.voice_id}>{v.voice_name}</option>
            ))}
          </select>
          <select
            className="retro-input w-full"
            value={newProfilePersonalityId}
            onChange={(e) => setNewProfilePersonalityId(e.target.value)}
          >
            <option value="">— Personality —</option>
            {personalities.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {createError && (
            <div className="p-3 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-start justify-between gap-2">
              <span>{createError}</span>
              <button type="button" className="shrink-0 text-red-600 dark:text-red-400 hover:underline" onClick={() => setCreateError(null)} aria-label="Dismiss">×</button>
            </div>
          )}
          <button
            type="button"
            className="retro-btn flex items-center gap-2"
            onClick={createProfile}
            disabled={createSaving || !newProfileName.trim() || !newProfileVoiceId || !newProfilePersonalityId}
          >
            <Plus size={16} /> Create
          </button>
        </div>
      </Modal>

      {!activeUserId && (
        <div
          className="retro-card font-mono text-sm mb-4"
          style={{ backgroundColor: 'rgba(255, 193, 7, 0.15)', border: '1px solid rgba(255, 152, 0, 0.4)' }}
        >
          Select a member in <Link to="/users" className="underline font-bold">Members</Link> first, then use &quot;Use for this session&quot; to start chatting with a profile.
        </div>
      )}

      {error && (
        <div className="retro-card font-mono text-sm text-red-600">{error}</div>
      )}

      <p className="text-sm text-gray-600">
        Saved voice + personality pairs for the robot. Use for this session or set as default for device. Create a new profile with the button above.
      </p>

      {profiles.length === 0 ? (
        <div className="retro-card font-mono text-sm py-6 text-center text-[var(--color-retro-fg-secondary)]">
          No profiles yet. Click Create profile above to add one.
        </div>
      ) : (
        <ul className="space-y-2">
          {profiles.map((pr) => {
            const voiceName = voices.find((v) => v.voice_id === pr.voice_id)?.voice_name ?? pr.voice_id;
            const personalityName = personalities.find((p) => p.id === pr.personality_id)?.name ?? pr.personality_id;
            const isDefault = (activeSession?.default_profile_id ?? preferences.default_profile_id) === pr.id;
            return (
              <li key={pr.id} className="retro-card flex items-center justify-between gap-2 py-2 px-4">
                <span className="font-medium truncate">{pr.name}</span>
                <span className="text-xs text-gray-600 truncate">{voiceName} + {personalityName}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    className={`retro-btn retro-btn-outline text-sm ${isDefault ? 'opacity-100 font-bold' : ''}`}
                    onClick={() => setDefaultProfile(pr.id)}
                  >
                    {isDefault ? 'Default' : 'Set as Default'}
                  </button>
                  <button
                    type="button"
                    className="retro-btn text-sm"
                    onClick={() => useProfileForSession(pr.id)}
                    title="Use for this session"
                  >
                    Use for session
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
