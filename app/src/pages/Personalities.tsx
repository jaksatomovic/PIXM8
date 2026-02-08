import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useActiveUser } from '../state/ActiveUserContext';
import { Package, Star, User } from 'lucide-react';

type Personality = {
  id: string;
  name: string;
  short_description?: string;
  voice_id?: string;
  type?: string;
};

type ActiveSession = {
  session_id: string | null;
  active_personality_id: string | null;
  default_personality_id: string | null;
  active_personality_name: string | null;
  default_personality_name: string | null;
};

export const PersonalitiesPage = () => {
  const navigate = useNavigate();
  const { activeUserId, activeUser, refreshUsers } = useActiveUser();
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [preferences, setPreferences] = useState<{ default_personality_id: string | null }>({ default_personality_id: null });
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const loadActiveSession = async () => {
    try {
      const data = await api.getActiveSession();
      setActiveSession({
        session_id: data?.session_id ?? null,
        active_personality_id: data?.active_personality_id ?? null,
        default_personality_id: data?.default_personality_id ?? null,
        active_personality_name: data?.active_personality_name ?? null,
        default_personality_name: data?.default_personality_name ?? null,
      });
    } catch {
      setActiveSession(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setError(null);
        const [exps, prefs, active] = await Promise.all([
          api.getExperiences(false, 'personality'),
          api.getPreferences().catch(() => ({ default_personality_id: null })),
          api.getActiveSession().catch(() => null),
        ]);
        if (!cancelled) {
          setPersonalities(Array.isArray(exps) ? exps : []);
          setPreferences({
            default_personality_id: (prefs as any)?.default_personality_id ?? null,
          });
          if (active) {
            setActiveSession({
              session_id: active?.session_id ?? null,
              active_personality_id: active?.active_personality_id ?? null,
              default_personality_id: active?.default_personality_id ?? null,
              active_personality_name: active?.active_personality_name ?? null,
              default_personality_name: active?.default_personality_name ?? null,
            });
          } else {
            setActiveSession(null);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load personalities');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!filter.trim()) return personalities;
    const q = filter.trim().toLowerCase();
    return personalities.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        (p.short_description ?? '').toLowerCase().includes(q)
    );
  }, [personalities, filter]);

  const setAsDefault = async (personalityId: string) => {
    try {
      await api.setPreferences({ default_personality_id: personalityId });
      setPreferences((p) => ({ ...p, default_personality_id: personalityId }));
      await loadActiveSession();
    } catch (e: any) {
      console.error('Set default failed', e);
    }
  };

  const useForSession = async (personalityId: string) => {
    if (!activeUserId) {
      setError('Select a member first in Members.');
      return;
    }
    try {
      setError(null);
      await api.setActiveSessionPersonality(personalityId);
      await Promise.all([loadActiveSession(), refreshUsers()]);
      try {
        await api.setAppMode('chat');
      } catch {
        // non-blocking
      }
      navigate('/chat');
    } catch (e: any) {
      setError(e?.message || 'Failed to set personality');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-black flex items-center gap-3">
          <User className="w-7 h-7" />
          Personalities
        </h1>
        <div className="retro-card font-mono text-sm py-12 text-center text-[var(--color-retro-fg-secondary)]">
          Loading personalities…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-black flex items-center gap-3">
          <User className="w-7 h-7" />
          Personalities
        </h1>
        <Link
          to="/packs"
          className="retro-btn retro-btn-outline flex items-center gap-2"
        >
          <Package className="w-4 h-4" />
          Get more personalities
        </Link>
      </div>

      {!activeUserId && (
        <div
          className="retro-card font-mono text-sm mb-4"
          style={{ backgroundColor: 'rgba(255, 193, 7, 0.15)', border: '1px solid rgba(255, 152, 0, 0.4)' }}
        >
          Select a member in <Link to="/users" className="underline font-bold">Members</Link> first, then use &quot;Use for this session&quot; to start chatting with a personality.
        </div>
      )}

      {error && (
        <div className="retro-card font-mono text-sm text-red-600">{error}</div>
      )}

      {(activeSession?.active_personality_name != null || activeSession?.default_personality_name != null) && (
        <div className="retro-card font-mono text-sm flex flex-wrap gap-4">
          {activeSession?.active_personality_id != null && (
            <span>
              <strong>Active:</strong> {activeSession.active_personality_name ?? activeSession.active_personality_id}
            </span>
          )}
          {activeSession?.default_personality_id != null && (
            <span>
              <strong>Default:</strong> {activeSession.default_personality_name ?? activeSession.default_personality_id}
            </span>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search personalities…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="retro-input flex-1 max-w-md"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((p) => (
          <div
            key={p.id}
            className={`retro-card flex flex-col text-left ${
              (activeSession?.active_personality_id ?? activeUser?.current_personality_id) === p.id ? 'retro-selected' : 'retro-not-selected'
            }`}
            style={{ padding: 0 }}
          >
            <div className="min-w-0 flex-1 p-4">
              <h3 className="text-lg font-black leading-tight retro-clamp-2">{p.name}</h3>
              <p className="text-gray-600 text-xs font-medium mt-2 retro-clamp-2">
                {p.short_description || '—'}
              </p>
            </div>
            <div className="mt-auto border-t border-gray-200 p-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAsDefault(p.id)}
                className={`retro-btn retro-btn-outline flex items-center gap-2 ${
                  (activeSession?.default_personality_id ?? preferences.default_personality_id) === p.id ? 'opacity-100 font-bold' : ''
                }`}
                title="Set as default personality"
              >
                <Star size={14} />
                {(activeSession?.default_personality_id ?? preferences.default_personality_id) === p.id ? 'Default' : 'Set as Default'}
              </button>
              <button
                type="button"
                onClick={() => useForSession(p.id)}
                className={`retro-btn flex items-center gap-2 ${
                  (activeSession?.active_personality_id ?? activeUser?.current_personality_id) === p.id ? 'opacity-100 font-bold' : ''
                }`}
                title="Use for this session and go to chat"
              >
                <User size={14} />
                {(activeSession?.active_personality_id ?? activeUser?.current_personality_id) === p.id ? 'Active' : 'Use for this session'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="retro-card font-mono text-sm py-8 text-center text-[var(--color-retro-fg-secondary)]">
          {filter.trim() ? 'No personalities match your search.' : 'No personalities installed. Get more from Packs.'}
        </div>
      )}
    </div>
  );
};
