import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { api } from '../api';
import { RefreshCw, Brain, Radio, MonitorUp, Rss, Zap, Package, User, Volume2, Settings as SettingsIcon, UserCircle, FileText } from 'lucide-react';
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
    assistant_language: string | null;
  }>({
    default_voice_id: null,
    default_personality_id: null,
    default_profile_id: null,
    use_default_voice_everywhere: true,
    allow_experience_voice_override: false,
    assistant_language: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tesseractStatus, setTesseractStatus] = useState<{ installed: boolean; path?: string; manual_download_url: string; can_auto_install: boolean } | null>(null);
  const [tesseractInstalling, setTesseractInstalling] = useState(false);
  const [tesseractInstallError, setTesseractInstallError] = useState<string | null>(null);
  const [downloadedVoiceIds, setDownloadedVoiceIds] = useState<Set<string>>(new Set());
  const [downloadingVoiceId, setDownloadingVoiceId] = useState<string | null>(null);
  const [audioSrcByVoiceId, setAudioSrcByVoiceId] = useState<Record<string, string>>({});

  const [ttsBackend, setTtsBackend] = useState<'chatterbox' | 'elevenlabs'>('chatterbox');
  const [elevenApiKey, setElevenApiKey] = useState('');
  const [elevenVoiceId, setElevenVoiceId] = useState('');
  const [elevenModelId, setElevenModelId] = useState('eleven_multilingual_v2');
  const [elevenOutputFormat, setElevenOutputFormat] = useState('pcm_24000');
  const [elevenLatency, setElevenLatency] = useState('2');

  const [llmBackend, setLlmBackend] = useState<'local' | 'openai'>('local');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiModelId, setOpenaiModelId] = useState('gpt-4o-mini');

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
        const [
          voicesRes,
          personalitiesRes,
          prefsRes,
          downloadedRes,
          profilesRes,
          ttsBackendSetting,
          elevenApiKeySetting,
          elevenVoiceIdSetting,
          elevenModelIdSetting,
          elevenOutputFormatSetting,
          elevenLatencySetting,
          llmBackendSetting,
          openaiApiKeySetting,
          openaiModelIdSetting,
        ] = await Promise.all([
          api.getVoices(),
          api.getExperiences(false, 'personality'),
          api.getPreferences().catch(() => ({
            default_voice_id: null,
            default_personality_id: null,
            default_profile_id: null,
            use_default_voice_everywhere: true,
            allow_experience_voice_override: false,
            assistant_language: null,
          })),
          api.listDownloadedVoices(),
          api.getProfiles().catch(() => ({ profiles: [] })),
          api.getSetting('tts_backend').catch(() => ({ key: 'tts_backend', value: 'chatterbox' })),
          api.getSetting('elevenlabs_api_key').catch(() => ({ key: 'elevenlabs_api_key', value: '' })),
          api.getSetting('elevenlabs_voice_id').catch(() => ({ key: 'elevenlabs_voice_id', value: '' })),
          api.getSetting('elevenlabs_model_id').catch(() => ({ key: 'elevenlabs_model_id', value: 'eleven_multilingual_v2' })),
          api.getSetting('elevenlabs_output_format').catch(() => ({ key: 'elevenlabs_output_format', value: 'pcm_24000' })),
          api.getSetting('elevenlabs_optimize_streaming_latency').catch(() => ({ key: 'elevenlabs_optimize_streaming_latency', value: '2' })),
          api.getSetting('llm_backend').catch(() => ({ key: 'llm_backend', value: 'local' })),
          api.getSetting('openai_api_key').catch(() => ({ key: 'openai_api_key', value: '' })),
          api.getSetting('openai_model_id').catch(() => ({ key: 'openai_model_id', value: 'gpt-4o-mini' })),
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
            assistant_language: (prefsRes as any)?.assistant_language ?? null,
          });
          setDownloadedVoiceIds(new Set(Array.isArray(downloadedRes) ? downloadedRes : []));

          const backendRaw = (ttsBackendSetting as any)?.value || 'chatterbox';
          const normalizedBackend = String(backendRaw).trim().toLowerCase() === 'elevenlabs' ? 'elevenlabs' : 'chatterbox';
          setTtsBackend(normalizedBackend);
          setElevenApiKey(String((elevenApiKeySetting as any)?.value || ''));
          setElevenVoiceId(String((elevenVoiceIdSetting as any)?.value || ''));
          setElevenModelId(String((elevenModelIdSetting as any)?.value || 'eleven_multilingual_v2'));
          setElevenOutputFormat(String((elevenOutputFormatSetting as any)?.value || 'pcm_24000'));
          setElevenLatency(String((elevenLatencySetting as any)?.value ?? '2'));

          const llmRaw = (llmBackendSetting as any)?.value || 'local';
          setLlmBackend(String(llmRaw).trim().toLowerCase() === 'openai' ? 'openai' : 'local');
          setOpenaiApiKey(String((openaiApiKeySetting as any)?.value || ''));
          setOpenaiModelId(String((openaiModelIdSetting as any)?.value || 'gpt-4o-mini'));
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await invoke<{ installed: boolean; path?: string; manual_download_url: string; can_auto_install: boolean }>('tesseract_status');
        if (!cancelled) setTesseractStatus(status);
      } catch {
        if (!cancelled) setTesseractStatus(null);
      }
    })();
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
        assistant_language: next.assistant_language ?? null,
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
        {/* Voice / TTS backend */}
        <div className="space-y-4  border-[var(--color-retro-border)]">
          <h3 className="flex items-center gap-2 font-bold uppercase text-lg">
            <Volume2 className="w-5 h-5" />
            Voice / TTS Backend
          </h3>
          <p className="text-xs text-gray-600">
            Choose between fully local Chatterbox TTS or ElevenLabs cloud TTS. Changes apply immediately; no restart required.
          </p>
          <div className="space-y-3">
            <label className="block text-xs font-mono uppercase tracking-wide text-[var(--color-retro-fg-secondary)]">
              Backend
            </label>
            <select
              className="retro-input w-full max-w-sm"
              value={ttsBackend}
              onChange={(e) => {
                const next = e.target.value === 'elevenlabs' ? 'elevenlabs' : 'chatterbox';
                setTtsBackend(next);
                api.setSetting('tts_backend', next).catch(console.error);
              }}
            >
              <option value="chatterbox">Local (Chatterbox)</option>
              <option value="elevenlabs">ElevenLabs (Cloud)</option>
            </select>
          </div>

          {ttsBackend === 'elevenlabs' && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wide text-[var(--color-retro-fg-secondary)] mb-1">
                  ElevenLabs API Key
                </label>
                <input
                  type="password"
                  className="retro-input w-full max-w-md"
                  value={elevenApiKey}
                  onChange={(e) => {
                    const v = e.target.value;
                    setElevenApiKey(v);
                    api.setSetting('elevenlabs_api_key', v || null).catch(console.error);
                  }}
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase tracking-wide text-[var(--color-retro-fg-secondary)] mb-1">
                  Voice ID
                </label>
                <input
                  type="text"
                  className="retro-input w-full max-w-md"
                  value={elevenVoiceId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setElevenVoiceId(v);
                    api.setSetting('elevenlabs_voice_id', v || null).catch(console.error);
                  }}
                  placeholder="ElevenLabs voice ID"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wide text-[var(--color-retro-fg-secondary)] mb-1">
                    Model
                  </label>
                  <select
                    className="retro-input w-full"
                    value={elevenModelId}
                    onChange={(e) => {
                      const v = e.target.value || 'eleven_multilingual_v2';
                      setElevenModelId(v);
                      api.setSetting('elevenlabs_model_id', v).catch(console.error);
                    }}
                  >
                    <option value="eleven_multilingual_v2">eleven_multilingual_v2</option>
                    <option value="eleven_turbo_v2">eleven_turbo_v2</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wide text-[var(--color-retro-fg-secondary)] mb-1">
                    Output format
                  </label>
                  <select
                    className="retro-input w-full"
                    value={elevenOutputFormat}
                    onChange={(e) => {
                      const v = e.target.value || 'pcm_24000';
                      setElevenOutputFormat(v);
                      api.setSetting('elevenlabs_output_format', v).catch(console.error);
                    }}
                  >
                    <option value="pcm_24000">pcm_24000</option>
                    <option value="pcm_16000">pcm_16000</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wide text-[var(--color-retro-fg-secondary)] mb-1">
                    Latency optimize
                  </label>
                  <select
                    className="retro-input w-full"
                    value={elevenLatency}
                    onChange={(e) => {
                      const v = e.target.value || '2';
                      setElevenLatency(v);
                      api.setSetting('elevenlabs_optimize_streaming_latency', v).catch(console.error);
                    }}
                  >
                    <option value="0">0 (highest quality)</option>
                    <option value="1">1</option>
                    <option value="2">2 (balanced)</option>
                    <option value="3">3</option>
                    <option value="4">4 (lowest latency)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* LLM Backend */}
        <div className="space-y-4 pt-6 border-t border-[var(--color-retro-border)]">
          <h3 className="flex items-center gap-2 font-bold uppercase text-lg">
            <Brain className="w-5 h-5" />
            LLM Backend
          </h3>
          <p className="text-xs text-gray-600">
            Use a local model (Settings → Models) or ChatGPT via OpenAI API. Changes apply immediately.
          </p>
          <div className="space-y-3">
            <label className="block text-xs font-mono uppercase tracking-wide text-[var(--color-retro-fg-secondary)]">
              Backend
            </label>
            <select
              className="retro-input w-full max-w-sm"
              value={llmBackend}
              onChange={(e) => {
                const next = e.target.value === 'openai' ? 'openai' : 'local';
                setLlmBackend(next);
                api.setSetting('llm_backend', next).catch(console.error);
              }}
            >
              <option value="local">Local (on-device model)</option>
              <option value="openai">OpenAI (ChatGPT)</option>
            </select>
          </div>
          {llmBackend === 'openai' && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wide text-[var(--color-retro-fg-secondary)] mb-1">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  className="retro-input w-full max-w-md"
                  value={openaiApiKey}
                  onChange={(e) => {
                    const v = e.target.value;
                    setOpenaiApiKey(v);
                    api.setSetting('openai_api_key', v || null).catch(console.error);
                  }}
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase tracking-wide text-[var(--color-retro-fg-secondary)] mb-1">
                  Model
                </label>
                <select
                  className="retro-input w-full max-w-md"
                  value={openaiModelId}
                  onChange={(e) => {
                    const v = e.target.value || 'gpt-4o-mini';
                    setOpenaiModelId(v);
                    api.setSetting('openai_model_id', v).catch(console.error);
                  }}
                >
                  <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4-turbo">gpt-4-turbo</option>
                  <option value="gpt-4o-nano">gpt-4o-nano</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 pt-6 border-t border-[var(--color-retro-border)]">
          <h3 className="font-bold uppercase text-lg">Assistant language</h3>
          <p className="text-xs text-gray-600">
            Choose the primary language for the assistant&apos;s replies. This influences how the AI responds, independently of the voice.
          </p>
          <select
            className="retro-input w-full max-w-md"
            value={preferences.assistant_language ?? 'auto'}
            onChange={(e) => {
              const v = e.target.value || 'auto';
              const normalized = v === 'auto' ? null : v;
              setPreferences((p) => ({ ...p, assistant_language: normalized }));
              savePreferences({ assistant_language: normalized });
            }}
            disabled={saving}
          >
            <option value="auto">Auto (follow conversation)</option>
            <option value="en">English</option>
            <option value="hr">Hrvatski</option>
          </select>
        </div>

        <div className="space-y-4 pt-6 border-t border-[var(--color-retro-border)]">
          <h3 className="flex items-center gap-2 font-bold uppercase text-lg">
            <UserCircle className="w-5 h-5" />
            Characters (voice + personality)
          </h3>
          <p className="text-xs text-gray-600">
            Set the default character for the device. Create and manage characters on the{" "}
            <a href="/profiles" className="underline font-medium">Characters</a> page.
          </p>
          {profiles.length === 0 ? (
            <p className="text-sm text-gray-500">
              No characters yet. Create one on the{" "}
              <a href="/profiles" className="underline font-medium">Characters</a> page.
            </p>
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
              <option value="">— Default character —</option>
              {profiles.map((pr) => (
                <option key={pr.id} value={pr.id}>{pr.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="space-y-4 pt-6 border-t border-[var(--color-retro-border)]">
          <h3 className="flex items-center gap-2 font-bold uppercase text-lg">
            <FileText className="w-5 h-5" />
            OCR (Tesseract) for images
          </h3>
          <p className="text-xs text-gray-600">
            To extract text from uploaded images in Docs, Tesseract must be installed. We don&apos;t bundle it to keep the app size small. Install it once and the app will use it automatically.
          </p>
          {tesseractStatus === null ? (
            <p className="text-sm text-gray-500">Checking Tesseract…</p>
          ) : tesseractStatus.installed ? (
            <p className="text-sm text-green-700 dark:text-green-400">
              Tesseract is available{tesseractStatus.path ? ` at ${tesseractStatus.path}` : ''}. OCR for images in Docs is enabled.
            </p>
          ) : (
            <div className="text-sm space-y-2">
              <p className="text-gray-600">Tesseract is not installed. Enable OCR by installing it once; the app will use it automatically.</p>
              {tesseractInstallError && (
                <p className="text-red-600 dark:text-red-400 text-xs">{tesseractInstallError}</p>
              )}
              <div className="flex flex-wrap gap-2 items-center">
                {tesseractStatus.can_auto_install && (
                  <button
                    type="button"
                    className="retro-btn inline-flex items-center gap-2"
                    disabled={tesseractInstalling}
                    onClick={async () => {
                      setTesseractInstallError(null);
                      setTesseractInstalling(true);
                      try {
                        await invoke('tesseract_install');
                        const status = await invoke<{ installed: boolean; path?: string; manual_download_url: string; can_auto_install: boolean }>('tesseract_status');
                        setTesseractStatus(status);
                      } catch (e: unknown) {
                        setTesseractInstallError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setTesseractInstalling(false);
                      }
                    }}
                  >
                    {tesseractInstalling ? 'Installing…' : 'Install Tesseract (via Homebrew)'}
                  </button>
                )}
                <a
                  href={tesseractStatus.manual_download_url}
                  target="_blank"
                  rel="noreferrer"
                  className="retro-btn retro-btn-outline inline-flex items-center gap-2"
                >
                  Open install instructions
                </a>
              </div>
              {!tesseractStatus.can_auto_install && (
                <p className="text-xs text-gray-500">On Windows and Linux, install Tesseract manually using the link above.</p>
              )}
            </div>
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
