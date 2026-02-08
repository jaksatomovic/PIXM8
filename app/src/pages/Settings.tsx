import { useEffect, useState } from 'react';
import { api } from '../api';
import { RefreshCw, Brain, Radio, MonitorUp, Rss, Zap, Package, User, Volume2, Settings as SettingsIcon, UserCircle } from 'lucide-react';
import { ModelSwitchModal } from '../components/ModelSwitchModal';
import { LlmSelector } from '../components/LlmSelector';
import { Addons } from '../components/Addons';
import { useSearchParams, Link } from 'react-router-dom';
import { VoiceActionButtons } from '../components/VoiceActionButtons';
import { useVoicePlayback } from '../hooks/useVoicePlayback';

type ModelConfig = {
  llm: {
    backend: string;
    repo: string;
    file: string | null;
    loaded: boolean;
  };
};

type Profile = { id: string; name: string; voice_id: string; personality_id: string };

function PersonalizationTab({ embedded = false }: { embedded?: boolean }) {
  const [voices, setVoices] = useState<Array<{ voice_id: string; voice_name: string; voice_description?: string; is_downloaded?: boolean }>>([]);
  const [personalities, setPersonalities] = useState<Array<{ id: string; name: string; short_description?: string }>>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [preferences, setPreferences] = useState<{
    default_voice_id: string | null;
    default_personality_id: string | null;
    default_profile_id: string | null;
    use_default_voice_everywhere: boolean;
    allow_experience_voice_override: boolean;
  }>({
    default_voice_id: null,
    default_personality_id: null,
    default_profile_id: null,
    use_default_voice_everywhere: true,
    allow_experience_voice_override: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadedVoiceIds, setDownloadedVoiceIds] = useState<Set<string>>(new Set());
  const [downloadingVoiceId, setDownloadingVoiceId] = useState<string | null>(null);
  const [audioSrcByVoiceId, setAudioSrcByVoiceId] = useState<Record<string, string>>({});

  const { playingVoiceId, isPaused, toggle: toggleVoice } = useVoicePlayback(async (voiceId) => {
    let src = audioSrcByVoiceId[voiceId];
    if (!src) {
      const b64 = await api.readVoiceBase64(voiceId);
      if (!b64) return null;
      src = `data:audio/wav;base64,${b64}`;
      setAudioSrcByVoiceId((prev) => ({ ...prev, [voiceId]: src! }));
    }
    return src;
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [voicesRes, personalitiesRes, prefsRes, downloadedRes, profilesRes] = await Promise.all([
          api.getVoices(),
          api.getExperiences(false, 'personality'),
          api.getPreferences().catch(() => ({ default_voice_id: null, default_personality_id: null, use_default_voice_everywhere: true, allow_experience_voice_override: false })),
          api.listDownloadedVoices(),
          api.getProfiles().catch(() => ({ profiles: [] })),
        ]);
        if (!cancelled) {
          setVoices(Array.isArray(voicesRes) ? voicesRes : []);
          setPersonalities(Array.isArray(personalitiesRes) ? personalitiesRes : []);
          setProfiles(Array.isArray((profilesRes as any)?.profiles) ? (profilesRes as any).profiles : []);
          setPreferences({
            default_voice_id: (prefsRes as any)?.default_voice_id ?? null,
            default_personality_id: (prefsRes as any)?.default_personality_id ?? null,
            default_profile_id: (prefsRes as any)?.default_profile_id ?? null,
            use_default_voice_everywhere: (prefsRes as any)?.use_default_voice_everywhere !== false,
            allow_experience_voice_override: !!(prefsRes as any)?.allow_experience_voice_override,
          });
          setDownloadedVoiceIds(new Set(Array.isArray(downloadedRes) ? downloadedRes : []));
        }
      } catch (e) {
        console.error('Personalization load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const savePreferences = async (updates: Partial<typeof preferences>) => {
    setSaving(true);
    try {
      const next = { ...preferences, ...updates };
      await api.setPreferences({
        default_voice_id: next.default_voice_id ?? undefined,
        default_personality_id: next.default_personality_id ?? undefined,
        default_profile_id: next.default_profile_id ?? undefined,
        use_default_voice_everywhere: next.use_default_voice_everywhere,
        allow_experience_voice_override: next.allow_experience_voice_override,
      });
      setPreferences(next);
    } catch (e: any) {
      console.error('Save preferences failed', e);
    } finally {
      setSaving(false);
    }
  };

  const loadProfiles = async () => {
    try {
      const res = await api.getProfiles();
      setProfiles(Array.isArray((res as any)?.profiles) ? (res as any).profiles : []);
      const prefs = await api.getPreferences();
      setPreferences((p) => ({ ...p, default_profile_id: (prefs as any)?.default_profile_id ?? null }));
    } catch {
      setProfiles([]);
    }
  };

  const setDefaultProfile = async (profileId: string) => {
    await savePreferences({ default_profile_id: profileId });
    await loadProfiles();
  };

  const downloadVoice = async (voiceId: string) => {
    setDownloadingVoiceId(voiceId);
    try {
      await api.downloadVoice(voiceId);
      setDownloadedVoiceIds((prev) => new Set(prev).add(voiceId));
    } finally {
      setDownloadingVoiceId(null);
    }
  };

  if (loading) {
    return (
      <div>
        {!embedded && <h2 className="text-3xl font-black flex items-center gap-3 mb-8">SETTINGS</h2>}
        <div className="retro-card font-mono text-sm py-12 text-center text-[var(--color-retro-fg-secondary)]">Loading personalization…</div>
      </div>
    );
  }

  return (
    <div>
      {!embedded && (
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-black flex items-center gap-3">SETTINGS</h2>
          <div className="flex gap-2">
            <a href="/settings?tab=general" className="retro-btn retro-btn-outline text-sm">General</a>
            <a href="/settings?tab=personalization" className="retro-btn retro-btn-outline text-sm bg-[var(--color-retro-accent-light)]">AI</a>
            <a href="/settings?tab=addons" className="retro-btn retro-btn-outline text-sm flex items-center gap-2"><Package className="w-4 h-4" /> Addons</a>
          </div>
        </div>
      )}
      <div className="retro-card space-y-8">
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 font-bold uppercase text-lg">
            <Volume2 className="w-5 h-5" />
            Default Voice
          </h3>
          <p className="text-xs text-gray-600">Used for chat, stories, and games unless you allow experience override.</p>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="retro-input flex-1 min-w-[200px]"
              value={preferences.default_voice_id ?? ''}
              onChange={(e) => {
                const v = e.target.value || null;
                setPreferences((p) => ({ ...p, default_voice_id: v }));
                savePreferences({ default_voice_id: v });
              }}
              disabled={saving}
            >
              <option value="">— Use first available —</option>
              {voices.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.voice_name} {!(v as any).is_downloaded && !downloadedVoiceIds.has(v.voice_id) ? '(download to use)' : ''}
                </option>
              ))}
            </select>
            {preferences.default_voice_id && (
              <VoiceActionButtons
                voiceId={preferences.default_voice_id}
                isDownloaded={(voices.find((x) => x.voice_id === preferences.default_voice_id) as any)?.is_downloaded ?? downloadedVoiceIds.has(preferences.default_voice_id ?? '')}
                downloadingVoiceId={downloadingVoiceId}
                onDownload={downloadVoice}
                onTogglePlay={(id) => toggleVoice(id)}
                isPlaying={playingVoiceId === preferences.default_voice_id}
                isPaused={isPaused}
                size="small"
              />
            )}
          </div>
        </div>
        <div className="space-y-4 pt-6 border-t border-[var(--color-retro-border)]">
          <h3 className="flex items-center gap-2 font-bold uppercase text-lg">
            <User className="w-5 h-5" />
            Default Personality
          </h3>
          <p className="text-xs text-gray-600">Default character/mode for chat and sessions.</p>
          <select
            className="retro-input w-full max-w-md"
            value={preferences.default_personality_id ?? ''}
            onChange={(e) => {
              const v = e.target.value || null;
              setPreferences((p) => ({ ...p, default_personality_id: v }));
              savePreferences({ default_personality_id: v });
            }}
            disabled={saving}
          >
            <option value="">— Use first available —</option>
            {personalities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-4 pt-6 border-t border-[var(--color-retro-border)]">
          <h3 className="font-bold uppercase text-lg">Voice behavior</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.use_default_voice_everywhere}
              onChange={(e) => {
                const v = e.target.checked;
                setPreferences((p) => ({ ...p, use_default_voice_everywhere: v }));
                savePreferences({ use_default_voice_everywhere: v });
              }}
              className="retro-input w-4 h-4"
            />
            <span className="text-sm">Use default voice everywhere (chat, stories, games)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.allow_experience_voice_override}
              onChange={(e) => {
                const v = e.target.checked;
                setPreferences((p) => ({ ...p, allow_experience_voice_override: v }));
                savePreferences({ allow_experience_voice_override: v });
              }}
              className="retro-input w-4 h-4"
            />
            <span className="text-sm">Allow experience voice override (use personality/game/story voice when set)</span>
          </label>
        </div>

        <div className="space-y-4 pt-6 border-t border-[var(--color-retro-border)]">
          <h3 className="flex items-center gap-2 font-bold uppercase text-lg">
            <UserCircle className="w-5 h-5" />
            Profiles (voice + personality)
          </h3>
          <p className="text-xs text-gray-600">Set the default profile for the device. Create new profiles on the <a href="/profiles" className="underline font-medium">Profiles</a> page.</p>
          {profiles.length === 0 ? (
            <p className="text-sm text-gray-500">No profiles yet. Create one on the <a href="/profiles" className="underline font-medium">Profiles</a> page.</p>
          ) : (
            <select
              className="retro-input w-full max-w-md"
              value={preferences.default_profile_id ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v) setDefaultProfile(v);
              }}
              disabled={saving}
            >
              <option value="">— Default profile —</option>
              {profiles.map((pr) => (
                <option key={pr.id} value={pr.id}>{pr.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}

export const Settings = () => {
  const [searchParams] = useSearchParams();
  const tabRaw = searchParams.get('tab') || 'general';
  const tab = ['general', 'personalization', 'addons'].includes(tabRaw) ? tabRaw : 'general';
  
  const [models, setModels] = useState<ModelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [llmRepo, setLlmRepo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [flashing, setFlashing] = useState(false);
  const [flashLog, setFlashLog] = useState<string>('');
  const [laptopVolume, setLaptopVolume] = useState<number>(70);

  // Model switch modal state
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [switchStage, setSwitchStage] = useState<'downloading' | 'loading' | 'complete' | 'error'>('downloading');
  const [switchProgress, setSwitchProgress] = useState(0);
  const [switchMessage, setSwitchMessage] = useState('');
  const [switchError, setSwitchError] = useState<string | undefined>();
  const [pendingModelRepo, setPendingModelRepo] = useState<string>('');

  const isLikelyDevicePort = (port: string) => /\/dev\/(cu|tty)\.(usbserial|usbmodem)/i.test(port);

  const getRecommendedPort = (candidates: string[]) => {
    const prefer = candidates.find((p) => isLikelyDevicePort(p));
    return prefer || '';
  };

  const recommendedPort = getRecommendedPort(ports);
  const flashEnabled = !!selectedPort && isLikelyDevicePort(selectedPort) && !flashing;

  useEffect(() => {
    loadSettings();
    return () => {};
  }, []);

  useEffect(() => {
    refreshPorts();
  }, []);

  const refreshPorts = async () => {
    try {
      const res = await api.firmwarePorts();
      const nextPorts = (res?.ports || []) as string[];
      setPorts(nextPorts);
      const recommended = getRecommendedPort(nextPorts);
      if (recommended && (!selectedPort || !isLikelyDevicePort(selectedPort))) {
        setSelectedPort(recommended);
      }
    } catch {
      setPorts([]);
    }
  };

  const flashFirmware = async () => {
    if (!selectedPort || flashing) return;
    setFlashing(true);
    setFlashLog('Flashing… do not unplug the device.\n');
    try {
      const res = await api.flashFirmware({ port: selectedPort, chip: 'esp32s3', baud: 460800 });
      if (res?.output) setFlashLog(String(res.output));
      else setFlashLog(JSON.stringify(res, null, 2));
      if (res?.ok) {
        setFlashLog((prev) => prev + "\n\nDone." );
      }
    } catch (e: any) {
      setFlashLog(e?.message || 'Flashing failed');
    } finally {
      setFlashing(false);
    }
  };

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const [modelData, volSetting] = await Promise.all([
        api.getModels(),
        api.getSetting('laptop_volume').catch(() => ({ key: 'laptop_volume', value: '70' })),
      ]);
      setModels(modelData);
      setLlmRepo(modelData.llm.repo);
      const raw = (volSetting as any)?.value;
      const parsed = raw != null ? Number(raw) : 70;
      setLaptopVolume(Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 70);

    } catch (e) {
      console.error('Failed to load settings:', e);
      setError('Failed to load settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveModel = async () => {
    if (!llmRepo.trim()) return;
    
    // Open the modal and start the switch process
    setPendingModelRepo(llmRepo);
    setShowSwitchModal(true);
    setSwitchStage('downloading');
    setSwitchProgress(0);
    setSwitchMessage('Starting...');
    setSwitchError(undefined);
    
    await performModelSwitch(llmRepo);
  };

  const performModelSwitch = async (modelRepo: string) => {
    try {
      for await (const update of api.switchModel(modelRepo)) {
        if (update.stage === 'error') {
          setSwitchStage('error');
          setSwitchError(update.error);
          setSwitchProgress(0);
          setSwitchMessage('Failed');
          return;
        }
        
        setSwitchStage(update.stage);
        setSwitchProgress(update.progress ?? 0);
        setSwitchMessage(update.message ?? '');
        
        if (update.stage === 'complete') {
          // Refresh settings to show the new model
          await loadSettings();
        }
      }
    } catch (e: any) {
      console.error('Model switch failed:', e);
      setSwitchStage('error');
      setSwitchError(e?.message || 'Unknown error');
    }
  };

  const handleRetrySwitch = () => {
    if (pendingModelRepo) {
      setSwitchStage('downloading');
      setSwitchProgress(0);
      setSwitchMessage('Retrying...');
      setSwitchError(undefined);
      performModelSwitch(pendingModelRepo);
    }
  };

  const handleCloseModal = () => {
    setShowSwitchModal(false);
    setPendingModelRepo('');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-black flex items-center gap-3">
          SETTINGS
        </h2>
        <div className="flex gap-2">
          <Link
            to="/settings?tab=general"
            className={`retro-btn retro-btn-outline text-sm flex items-center gap-2 ${tab === 'general' ? 'bg-[var(--color-retro-accent-light)] border-[var(--color-retro-accent)] font-semibold' : ''}`}
          >
            <SettingsIcon className="w-4 h-4" />
            General
          </Link>
          <Link
            to="/settings?tab=personalization"
            className={`retro-btn retro-btn-outline text-sm flex items-center gap-2 ${tab === 'personalization' ? 'bg-[var(--color-retro-accent-light)] border-[var(--color-retro-accent)] font-semibold' : ''}`}
          >
            <Brain className="w-4 h-4" />
            AI
          </Link>
          <Link
            to="/settings?tab=addons"
            className={`retro-btn retro-btn-outline text-sm flex items-center gap-2 ${tab === 'addons' ? 'bg-[var(--color-retro-accent-light)] border-[var(--color-retro-accent)] font-semibold' : ''}`}
          >
            <Package className="w-4 h-4" />
            Addons
          </Link>
        </div>
      </div>

      {tab === 'personalization' && <PersonalizationTab embedded />}
      {tab === 'addons' && <Addons />}
      {(tab === 'general' || !tab) && (
        <>
      {error && (
        <div className="mb-6 p-4 rounded-[12px] font-bold" style={{ backgroundColor: 'rgba(229, 115, 115, 0.1)', border: '1px solid rgba(229, 115, 115, 0.3)', color: 'var(--color-retro-error)' }}>
          {error}
        </div>
      )}
      
      <div className="retro-card space-y-8">
        
        {/* LLM Section */}
        <div className="space-y-4">
          <div className="flex flex-col relative">
<div className="flex items-center justify-between">
<div className="flex items-center gap-2 mb-2">
            <Brain className="w-5 h-5" />
            <h3 className="font-bold uppercase text-lg">Language Model (LLM)</h3>
            </div>
<button 
                onClick={handleSaveModel}
                disabled={showSwitchModal || loading || !llmRepo || llmRepo === models?.llm.repo}
                className="absolute top-0 right-0 retro-btn retro-btn-outline disabled:opacity-50 flex items-center gap-2"
              >
                <Rss className="w-4 h-4" />
                Update
              </button>
</div>
            
            <label className="font-bold mb-2 uppercase text-xs opacity-40">
              Hugging Face Repository
            </label>
          </div>
          
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <LlmSelector
                  value={llmRepo}
                  onChange={(repoId) => setLlmRepo(repoId)}
                  disabled={showSwitchModal || loading}
                  label=""
                />
              </div>
 
            </div>
            <p className="text-[10px] mt-2 opacity-60">
              {models?.llm.loaded ? (
                <span className="font-bold" style={{ color: 'var(--color-retro-green)' }}>● System Loaded</span>
              ) : (
                <span className="font-bold" style={{ color: 'var(--color-retro-error)' }}>● Not Loaded</span>
              )}
            </p>
          
        </div>

          <div className="pt-8 border-t border-[var(--color-retro-border)]">
          <div className="flex items-center gap-2 justify-between">
            <div className="flex flex-col gap-1">
              <h3 className="flex items-center gap-2 font-bold uppercase text-lg">
            <MonitorUp className="w-5 h-5" />
            Flash Firmware
          </h3>
          <div className="font-bold uppercase text-xs opacity-40">
              <div>Connect your ESP32 device</div>
            </div>

            </div>
            
              <button
                type="button"
                className="retro-btn retro-btn-outline disabled:opacity-50 flex items-center gap-2"
                onClick={flashFirmware}
                disabled={!flashEnabled}
              >
                <Zap size={16} />{flashing ? 'Flashing…' : 'Flash'}
              </button>
          </div>
          <div className="mt-5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-xs uppercase" style={{ color: 'var(--color-retro-fg-secondary)' }}>Serial Port</div>
              <button
                type="button"
                className="inline-flex items-center gap-2 text-xs font-bold uppercase opacity-60 hover:opacity-100 disabled:opacity-30"
                onClick={refreshPorts}
                disabled={flashing}
              >
                <RefreshCw className={flashing ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
                Refresh
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <select
                className="retro-input flex-1"
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                disabled={flashing}
              >
                {ports.length === 0 && <option value="">No ports found</option>}
                {ports.map((p) => (
                  <option key={p} value={p} disabled={!isLikelyDevicePort(p)}>
                    {p}{recommendedPort && p === recommendedPort ? ' (recommended)' : ''}{!isLikelyDevicePort(p) ? ' (not a device)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-2 text-[10px] opacity-60 font-mono">
              On MacOS, pick /dev/cu.usbserial-* (often -210/-110/-10) or /dev/cu.usbmodem*. Avoid Bluetooth ports.
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-gray-500 uppercase mb-2">Output</div>
            <pre className="retro-card rounded-[12px] p-3 text-xs font-mono whitespace-pre-wrap max-h-56 overflow-auto">
              {flashLog || '—'}
            </pre>
          </div>
        </div>

        {/* Device Status Section */}
        <div className="pt-8 border-t border-[var(--color-retro-border)]">
          <h3 className="flex items-center gap-2 font-bold uppercase text-lg">
            <Radio className="w-5 h-5" />
            Device Settings
          </h3>
          
          {/* <div className="grid grid-cols-1 md:grid-cols-2 mt-2 gap-4">
            <div className="p-4 flex items-start flex-col sm:flex-row gap-4 justify-between">
              <div>
                <div className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
                  <Wifi className="w-3 h-3" /> Connection
                </div>
                <div className={`text-lg font-black ${device?.ws_status === 'connected' ? 'text-green-600' : 'text-red-500'}`}>
                  {device?.ws_status === 'connected' ? 'ONLINE' : 'OFFLINE'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 uppercase mb-1">MAC Address</div>
                <div className="font-mono font-bold tracking-widest text-sm">
                  {device?.mac_address || 'Not found'}
                </div>
              </div>
            </div>
          </div> */}
          <div className="py-4">
            <div className="text-xs text-gray-500 uppercase mb-2">Laptop Volume</div>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="100"
                value={laptopVolume}
                onChange={(e) => {
                  const vol = Math.max(0, Math.min(100, Number(e.target.value)));
                  setLaptopVolume(vol);
                  api.setSetting('laptop_volume', String(vol)).catch(console.error);
                }}
                className="retro-range w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(#9b5cff 0 0) 0/${Math.max(0, Math.min(100, laptopVolume))}% 100% no-repeat, white`,
                }}
              />
              <span className="font-black w-12 text-right">{laptopVolume}%</span>
            </div>
          </div>
        </div>



      </div>
        </>
      )}

      {/* Model Switch Modal */}
      <ModelSwitchModal
        isOpen={showSwitchModal}
        stage={switchStage}
        progress={switchProgress}
        message={switchMessage}
        error={switchError}
        onRetry={handleRetrySwitch}
        onClose={handleCloseModal}
      />
    </div>
  );
};
