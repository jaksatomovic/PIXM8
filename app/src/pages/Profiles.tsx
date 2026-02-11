import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useActiveUser } from '../state/ActiveUserContext';
import { Bot, Package, Star } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';

type Personality = {
  id: string;
  name: string;
  short_description?: string;
  voice_id?: string;
  type?: string;
  img_src?: string | null;
  is_global?: boolean;
  created_at?: number | string | null;
};

type ActiveSession = {
  active_personality_id: string | null;
  default_personality_id: string | null;
  active_personality_name: string | null;
  default_personality_name: string | null;
};

const GLOBAL_IMAGE_BASE_URL = 'https://pub-a64cd21521e44c81a85db631f1cdaacc.r2.dev';

export const ProfilesPage = () => {
  const { activeUserId, activeUser, refreshUsers } = useActiveUser();
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [preferences, setPreferences] = useState<{ default_personality_id: string | null }>({ default_personality_id: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [brokenImgById, setBrokenImgById] = useState<Record<string, boolean>>({});

  const imgSrcFor = (p: Personality) => {
    const src = typeof p?.img_src === 'string' ? p.img_src.trim() : '';
    if (src) {
      if (/^https?:\/\//i.test(src)) return src;
      return convertFileSrc(src);
    }
    if (p?.is_global) {
      const id = p?.id != null ? String(p.id) : '';
      if (!id) return null;
      return `${GLOBAL_IMAGE_BASE_URL}/${encodeURIComponent(id)}.png`;
    }
    return null;
  };

  const toTimestamp = (v: unknown) => {
    if (v == null) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'string') {
      const asNum = Number(v);
      if (Number.isFinite(asNum)) return asNum;
      const ms = Date.parse(v);
      if (Number.isFinite(ms)) return Math.floor(ms / 1000);
    }
    return 0;
  };

  const loadActiveSession = async () => {
    try {
      const data = await api.getActiveSession();
      setActiveSession({
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
          setPreferences({ default_personality_id: (prefs as { default_personality_id?: string | null })?.default_personality_id ?? null });
          if (active) {
            setActiveSession({
              active_personality_id: active?.active_personality_id ?? null,
              default_personality_id: active?.default_personality_id ?? null,
              active_personality_name: active?.active_personality_name ?? null,
              default_personality_name: active?.default_personality_name ?? null,
            });
          } else {
            setActiveSession(null);
          }
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load characters');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const setAsDefault = async (e: React.MouseEvent, personalityId: string) => {
    e.stopPropagation();
    try {
      await api.setPreferences({ default_personality_id: personalityId });
      setPreferences((p) => ({ ...p, default_personality_id: personalityId }));
      await loadActiveSession();
    } catch (err) {
      console.error('Set default failed', err);
    }
  };

  const activateCharacter = async (personalityId: string) => {
    if (!activeUserId) return;
    try {
      setError(null);
      await api.setActiveSessionPersonality(personalityId);
      await Promise.all([loadActiveSession(), refreshUsers()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to set character');
    }
  };

  const filtered = useMemo(() => {
    if (!filter.trim()) return personalities;
    const q = filter.trim().toLowerCase();
    return personalities.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        (p.short_description ?? '').toLowerCase().includes(q)
    );
  }, [personalities, filter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const aG = Boolean(a?.is_global);
      const bG = Boolean(b?.is_global);
      if (aG !== bG) return aG ? 1 : -1;
      const aT = toTimestamp(a?.created_at);
      const bT = toTimestamp(b?.created_at);
      if (aT !== bT) return bT - aT;
      return 0;
    });
    return arr;
  }, [filtered]);

  const activeId = activeSession?.active_personality_id ?? activeUser?.current_personality_id ?? null;
  const defaultId = activeSession?.default_personality_id ?? preferences.default_personality_id ?? null;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-black flex items-center gap-3">
          <Bot className="w-7 h-7" />
          Characters
        </h1>
        <div className="retro-card font-mono text-sm py-12 text-center text-[var(--color-retro-fg-secondary)]">
          Loading characters…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-black flex items-center gap-3">
          <Bot className="w-7 h-7" />
          Characters
        </h1>
        <Link to="/packs" className="retro-btn retro-btn-outline flex items-center gap-2">
          <Package size={16} />
          Get more characters
        </Link>
      </div>

      {!activeUserId && (
        <div
          className="retro-card font-mono text-sm mb-4"
          style={{ backgroundColor: 'rgba(255, 193, 7, 0.15)', border: '1px solid rgba(255, 152, 0, 0.4)' }}
        >
          Select a member in <Link to="/users" className="underline font-bold">Members</Link> first, then click a character to use it.
        </div>
      )}

      {error && (
        <div className="retro-card font-mono text-sm text-red-600">{error}</div>
      )}

      {/* {activeId && activeSession?.active_personality_name && (
        <div className="retro-card font-mono text-sm flex flex-wrap gap-4">
          <span><strong>Active:</strong> {activeSession.active_personality_name}</span>
          {defaultId && activeSession?.default_personality_name && (
            <span><strong>Default:</strong> {activeSession.default_personality_name}</span>
          )}
        </div>
      )} */}

      <input
        type="text"
        placeholder="Search characters…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="retro-input w-full max-w-md"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sorted.map((p) => {
          const isActive = activeId === p.id;
          const isDefault = defaultId === p.id;
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => activeUserId && activateCharacter(p.id)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && activeUserId) {
                  e.preventDefault();
                  activateCharacter(p.id);
                }
              }}
              className={`retro-card relative flex flex-col text-left cursor-pointer transition-shadow h-[300px] ${
                isActive ? 'retro-selected ring-2 ring-[var(--color-retro-accent)]' : 'retro-not-selected'
              }`}
              style={{ padding: 0 }}
            >
              <button
                type="button"
                onClick={(e) => setAsDefault(e, p.id)}
                className="absolute top-3 right-3 z-10 p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-amber-500 transition-colors"
                title={isDefault ? 'Default character' : 'Set as default'}
                aria-label={isDefault ? 'Default' : 'Set as default'}
              >
                <Star
                  size={18}
                  className={isDefault ? 'fill-amber-500 text-amber-500' : ''}
                />
              </button>
              <div className="w-full h-[160px] rounded-t-[24px] bg-orange-50/50 dark:bg-orange-950/20 retro-cross flex items-center justify-center overflow-hidden border-b border-[var(--color-retro-border)] shrink-0">
                {imgSrcFor(p) && !brokenImgById[p.id] ? (
                  <img
                    src={imgSrcFor(p) || ''}
                    alt=""
                    className="h-auto w-auto max-h-full max-w-full object-contain"
                    onError={() => setBrokenImgById((prev) => ({ ...prev, [p.id]: true }))}
                  />
                ) : (
                  <Bot size={48} className="text-gray-400" />
                )}
              </div>
              <div className="min-w-0 flex-1 flex flex-col p-4 pr-12 overflow-hidden">
                <h3 className="text-lg font-black leading-tight retro-clamp-2">{p.name}</h3>
                <p className="text-gray-600 text-xs font-medium mt-2 retro-clamp-2 flex-1 min-h-0">
                  {p.short_description || '—'}
                </p>
                {isActive && (
                  <span className="mt-2 text-xs font-bold text-green-600 dark:text-green-400 shrink-0">
                    Active
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length === 0 && (
        <div className="retro-card font-mono text-sm py-8 text-center text-[var(--color-retro-fg-secondary)]">
          {filter.trim() ? 'No characters match your search.' : 'No characters installed. Get more from Packs.'}
        </div>
      )}
    </div>
  );
};
