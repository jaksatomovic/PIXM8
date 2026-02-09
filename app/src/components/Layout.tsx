import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useActiveUser } from '../state/ActiveUserContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useEffect, useState } from 'react';
import { Bot, X, RefreshCw, Plus, Paperclip } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { VoiceWsProvider, useVoiceWs } from '../state/VoiceWsContext';
import { useDocsContextOptional } from '../state/DocsContext';
import { Modal } from './Modal';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8000';

const LayoutInner = () => {
  const { activeUser } = useActiveUser();
  const location = useLocation();
  const navigate = useNavigate();
  const voiceWs = useVoiceWs();
  const docsContext = useDocsContextOptional();
  const selectedDocsMeta = docsContext?.selectedDocsMeta ?? [];
  const removeDoc = docsContext?.removeDoc;
  const [activePersonalityName, setActivePersonalityName] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<{
    active_personality_id: string | null;
    default_personality_id: string | null;
    active_personality_name: string | null;
  } | null>(null);
  const [activePersonalityImageSrc, setActivePersonalityImageSrc] = useState<string | null>(null);
  const [activePersonalityImageError, setActivePersonalityImageError] = useState(false);
  const [activePersonalityImageFallback, setActivePersonalityImageFallback] = useState<string | null>(null);
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);
  const [deviceConnected, setDeviceConnected] = useState<boolean>(false);
  const [deviceSessionId, setDeviceSessionId] = useState<string | null>(null);
  const [downloadedVoiceIds, setDownloadedVoiceIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Network monitoring
  const [initialIp, setInitialIp] = useState<string | null>(null);
  const [showNetworkBanner, setShowNetworkBanner] = useState(false);
  const [showAttachDropdown, setShowAttachDropdown] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showCharacterSetupWizard, setShowCharacterSetupWizard] = useState(false);
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string; voice_id: string; personality_id: string }>>([]);
  const [voices, setVoices] = useState<Array<{ voice_id: string; voice_name: string }>>([]);

  const GLOBAL_PERSONALITY_IMAGE_BASE_URL = 'https://pub-a64cd21521e44c81a85db631f1cdaacc.r2.dev';

  const personalityImageSrc = (p: any) => {
    if (!p) return null;
    const src = typeof p?.img_src === 'string' ? p.img_src.trim() : '';
    if (src) {
      if (/^https?:\/\//i.test(src)) return src;
      return convertFileSrc(src);
    }
    // Fallback: try global URL even if is_global is not set, if we have an ID
    if (p?.is_global || p?.id) {
      const pid = p?.id != null ? String(p.id) : '';
      if (pid) {
        return `${GLOBAL_PERSONALITY_IMAGE_BASE_URL}/${encodeURIComponent(pid)}.png`;
      }
    }
    return null;
  };

  useEffect(() => {
    let cancelled = false;
    const checkIp = async () => {
      try {
        const info = await api.getNetworkInfo();
        if (cancelled) return;
        
        if (!initialIp) {
          setInitialIp(info.ip);
        } else if (info.ip !== initialIp) {
          setShowNetworkBanner(true);
        }
      } catch {
        // ignore errors
      }
    };

    checkIp();
    const interval = setInterval(checkIp, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [initialIp]);

  const localActive = voiceWs.isActive;
  const sessionActive = deviceConnected || localActive;
  const isEsp32View =
    location.pathname === '/test' && new URLSearchParams(location.search).get('view') === 'esp32';

  const statusLabel = sessionActive ? 'Chat in progress' : 'Ready on device';
  const statusDotClass = sessionActive ? 'bg-emerald-500' : 'bg-green-400';
  const statusTextClass = sessionActive ? 'text-emerald-700' : 'text-gray-600';

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const ds = await api.getDeviceStatus().catch(() => null);
        if (!cancelled && ds) {
          setDeviceConnected(ds?.ws_status === 'connected');
          setDeviceSessionId(ds?.session_id || null);
        }

        const activeData = await api.getActiveSession().catch(() => null);
        if (!cancelled && activeData) {
          setActiveSession({
            active_personality_id: activeData?.active_personality_id ?? null,
            default_personality_id: activeData?.default_personality_id ?? null,
            active_personality_name: activeData?.active_personality_name ?? null,
          });
        } else if (!cancelled) {
          setActiveSession(null);
        }

        const selectedId = activeUser?.current_personality_id ?? activeData?.active_personality_id;
        if (!selectedId) {
          if (!cancelled) setActivePersonalityName(null);
          return;
        }

        const ps = await api.getPersonalities(true).catch(() => []);
        const selected = ps.find((p: any) => p.id === selectedId);
        if (!cancelled) {
          setActivePersonalityName(selected?.name || activeData?.active_personality_name || null);
          setActiveVoiceId(selected?.voice_id ? String(selected.voice_id) : null);
          const imgSrc = personalityImageSrc(selected);
          const fallbackSrc = selected?.id ? `${GLOBAL_PERSONALITY_IMAGE_BASE_URL}/${encodeURIComponent(selected.id)}.png` : null;
          console.log('[Layout] Selected personality:', selected?.id, selected?.name, 'img_src:', selected?.img_src, 'is_global:', selected?.is_global, 'computed imgSrc:', imgSrc, 'fallback:', fallbackSrc);
          setActivePersonalityImageSrc(imgSrc);
          setActivePersonalityImageFallback(fallbackSrc);
          setActivePersonalityImageError(false);
        }
      } catch {
        // ignore
        if (!cancelled) {
          setActivePersonalityImageSrc(null);
          setActivePersonalityImageError(false);
        }
      }
    };

    load();
  }, [activeUser?.current_personality_id]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    let es: EventSource | null = null;
    const base = API_BASE.replace('localhost', '127.0.0.1').replace(/\/+$/, '');

    const start = () => {
      if (cancelled) return;
      try {
        es = new EventSource(`${base}/events/device`);
      } catch {
        retryTimer = window.setTimeout(start, 3000);
        return;
      }

      es.onmessage = (ev) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(ev.data || '{}');
          setDeviceConnected(data?.ws_status === 'connected');
          setDeviceSessionId(data?.session_id || null);
        } catch {
          // ignore
        }
      };

      es.onerror = () => {
        if (cancelled) return;
        try {
          es?.close();
        } catch {
          // ignore
        }
        es = null;
        if (retryTimer == null) {
          retryTimer = window.setTimeout(start, 3000);
        }
      };
    };

    start();
    return () => {
      cancelled = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
      try {
        es?.close();
      } catch {
        // ignore
      }
      es = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadDownloaded = async () => {
      try {
        const ids = await api.listDownloadedVoices();
        if (!cancelled) setDownloadedVoiceIds(new Set(Array.isArray(ids) ? ids : []));
      } catch {
        if (!cancelled) setDownloadedVoiceIds(new Set());
      }
    };
    loadDownloaded();
    return () => {
      cancelled = true;
    };
  }, [activeVoiceId]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const ids = await api.listDownloadedVoices();
        if (!cancelled) setDownloadedVoiceIds(new Set(Array.isArray(ids) ? ids : []));
      } catch {
        if (!cancelled) setDownloadedVoiceIds(new Set());
      }
    };

    const onDownloaded = () => {
      void refresh();
    };

    window.addEventListener('voice:downloaded', onDownloaded as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener('voice:downloaded', onDownloaded as EventListener);
    };
  }, []);

  // Check if user needs to set up a character (profile) for chat
  useEffect(() => {
    let cancelled = false;
    const checkCharacterSetup = async () => {
      if (!activeUser?.id) return;
      try {
        const [profilesRes, voicesRes, downloadedRes] = await Promise.all([
          api.getProfiles().catch(() => ({ profiles: [] })),
          api.getVoices().catch(() => []),
          api.listDownloadedVoices().catch(() => []),
        ]);
        if (cancelled) return;
        const profilesList = Array.isArray((profilesRes as any)?.profiles) ? (profilesRes as any).profiles : [];
        const voicesList = Array.isArray(voicesRes) ? voicesRes : [];
        const downloaded = new Set(Array.isArray(downloadedRes) ? downloadedRes : []);
        setProfiles(profilesList);
        setVoices(voicesList);
        setDownloadedVoiceIds(downloaded);
        // Show wizard if no characters exist and user is on home/chat page
        if (profilesList.length === 0 && (location.pathname === '/' || location.pathname === '/playground')) {
          setShowCharacterSetupWizard(true);
        }
      } catch {
        // ignore
      }
    };
    checkCharacterSetup();
    return () => {
      cancelled = true;
    };
  }, [activeUser?.id, location.pathname]);

  const canStartChat =
    sessionActive || !activeVoiceId || downloadedVoiceIds.has(String(activeVoiceId));

  useEffect(() => {
    const onDeleted = () => {
      navigate('/');
    };
    window.addEventListener('voicews:empty-session-deleted', onDeleted as EventListener);
    return () => {
      window.removeEventListener('voicews:empty-session-deleted', onDeleted as EventListener);
    };
  }, [navigate]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-(--color-retro-bg)">
      {showNetworkBanner && (
        <div className="bg-[var(--color-retro-accent)] text-white px-4 py-3 flex items-center justify-between shadow-md z-50 shrink-0 border-b border-[var(--color-retro-border)]">
          <div className="font-mono text-sm flex items-center gap-2">
            <RefreshCw size={16} />
            <span>
              <strong>WiFi Change Detected: Refresh your app so your toy can find you.</strong>
            </span>
          </div>
          <button
            disabled={isRefreshing}
            onClick={async () => {
              try {
                setIsRefreshing(true);
                await api.restartMdns();
              } catch (e) {
                console.error("Failed to restart mDNS:", e);
              }
              setIsRefreshing(false);
              window.location.reload();
            }}
            className="retro-btn retro-btn-outline no-lift px-3 py-1.5 text-xs uppercase font-bold flex items-center gap-2"
          >
            Refresh
          </button>
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />
        <main className={`flex-1 min-h-0 overflow-y-auto ${location.pathname === '/test' ? 'p-0 pb-36' : 'p-8 pb-36'}`}>
          <div className={`max-w-4xl mx-auto ${location.pathname === '/test' ? 'px-8 pt-0' : ''}`}>
            <Outlet />
          </div>

        {(activeSession?.active_personality_id ?? activeUser?.current_personality_id) && (
          <div className="fixed bottom-0 z-20 left-[17rem] right-0 pointer-events-none">
            <div className="max-w-4xl mx-auto px-8 pb-6 pointer-events-auto">
              <div className="retro-card rounded-full px-5 py-5 flex flex-col relative">
                {/* Top row: Attached files */}
                {selectedDocsMeta.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {selectedDocsMeta.map((d) => (
                      <span
                        key={d.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-xs"
                      >
                        <span className="truncate max-w-[120px]" title={d.title || d.filename}>
                          {d.title?.trim() || d.filename || d.id}
                        </span>
                        {removeDoc && (
                          <button
                            type="button"
                            className="shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                            onClick={() => removeDoc(d.id)}
                            aria-label="Remove from context"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {/* Bottom row: Plus button, Status and personality info */}
                <div className="min-w-0 flex items-center justify-between flex-1">
                  <div className="min-w-0 flex items-center gap-4 flex-1">
                    {/* Attach button - far left, icon only */}
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        className="retro-icon-btn p-2 rounded-full w-9 h-9 flex items-center justify-center mr-2"
                        onClick={() => setShowAttachDropdown(!showAttachDropdown)}
                        title="Add photos & files"
                        aria-label="Add photos & files"
                      >
                        <Plus size={20} />
                      </button>
                      {showAttachDropdown && (
                        <div className="absolute bottom-full left-0 mb-2 z-30 w-[240px] retro-card py-1.5 shadow-lg">
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-4 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap"
                            disabled={uploadingFile}
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.multiple = true;
                              input.accept = '.pdf,.txt,.md,.json,.csv,image/*,.doc,.docx,application/pdf,text/*';
                              input.onchange = async (e) => {
                                const files = (e.target as HTMLInputElement).files;
                                if (!files || files.length === 0) return;
                                setUploadingFile(true);
                                try {
                                  for (const file of Array.from(files)) {
                                    const created = await api.uploadDoc(file);
                                    if (created?.id && docsContext?.addDoc) {
                                      docsContext.addDoc(created.id, {
                                        id: created.id,
                                        filename: created.filename ?? file.name,
                                        title: created.title ?? null,
                                        doc_type: created.doc_type ?? 'other',
                                        size_bytes: created.size_bytes ?? 0,
                                        created_at: created.created_at ?? 0,
                                      });
                                    }
                                  }
                                } catch (err: any) {
                                  console.error('Upload failed', err);
                                } finally {
                                  setUploadingFile(false);
                                  setShowAttachDropdown(false);
                                }
                              };
                              input.click();
                            }}
                          >
                            <Paperclip size={16} />
                            <span className="truncate">{uploadingFile ? 'Uploading…' : 'Add photos & files'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                    {(activePersonalityImageSrc || activePersonalityImageFallback) && (
                      <div className="w-12 h-12 rounded-full overflow-hidden retro-card border border-[var(--color-retro-border)] shrink-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        {!activePersonalityImageError ? (
                          <img
                            src={activePersonalityImageSrc || activePersonalityImageFallback || ''}
                            alt={activePersonalityName || ''}
                            className="w-full h-full object-cover"
                            crossOrigin="anonymous"
                            onError={(e) => {
                              console.error('[Layout] Image failed to load:', activePersonalityImageSrc || activePersonalityImageFallback, e);
                              if (activePersonalityImageSrc && activePersonalityImageFallback && activePersonalityImageSrc !== activePersonalityImageFallback) {
                                // Try fallback if primary failed
                                console.log('[Layout] Trying fallback image:', activePersonalityImageFallback);
                                setActivePersonalityImageSrc(activePersonalityImageFallback);
                                setActivePersonalityImageError(false);
                              } else {
                                setActivePersonalityImageError(true);
                              }
                            }}
                            onLoad={() => {
                              console.log('[Layout] Image loaded successfully:', activePersonalityImageSrc || activePersonalityImageFallback);
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                            ?
                          </div>
                        )}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-[var(--color-retro-fg-secondary)] flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full border border-[var(--color-retro-border)] ${statusDotClass} ${sessionActive ? 'retro-blink' : ''}`} />
                        <span className={statusTextClass}>{statusLabel}</span>
                      </div>
                      <div className="mt-1 font-black text-base truncate" style={{ color: 'var(--color-retro-fg)' }}>{activePersonalityName || '—'}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      {!localActive && !deviceConnected && (
                        <button
                          type="button"
                          className="retro-btn retro-btn-purple no-lift px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                          onClick={() => {
                            if (!canStartChat) return;
                            navigate('/test');
                            voiceWs.connect();
                          }}
                          disabled={!canStartChat}
                        >
                          <Bot size={18} className="shrink-0" /> Preview
                        </button>
                      )}
                    </div>
                    {!localActive && deviceConnected && !isEsp32View && (
                      <button
                        type="button"
                        className="retro-btn retro-btn-green no-lift px-4 py-2 text-sm flex items-center gap-2 animate-pulse"
                        onClick={() => navigate('/test?view=esp32')}
                      >
                        <Bot size={18} className="shrink-0" /> View
                      </button>
                    )}
                    {!localActive && deviceConnected && isEsp32View && (
                      <button
                        type="button"
                        className="retro-btn retro-btn-outline no-lift px-4 py-2 text-sm flex items-center gap-2"
                        onClick={async () => {
                          try {
                            await api.disconnectDevice();
                            setDeviceConnected(false);
                            const sid = deviceSessionId;
                            if (sid) {
                              navigate(`/conversations?session=${encodeURIComponent(sid)}`);
                            } else {
                              navigate('/conversations');
                            }
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        <X size={18} className="shrink-0" /> End
                      </button>
                    )}
                    {localActive && (
                      <button
                        type="button"
                        className="retro-btn retro-btn-outline no-lift px-4 py-2 text-sm flex items-center gap-2"
                        onClick={() => {
                          voiceWs.disconnect();
                          const sid = voiceWs.latestSessionId;
                          if (sid) {
                            navigate(`/conversations?session=${encodeURIComponent(sid)}`);
                          } else {
                            navigate('/conversations');
                          }
                        }}
                      >
                        <X size={18} className="shrink-0" /> End
                      </button>
                    )}
                    {!canStartChat && !sessionActive && !deviceConnected && (
                      <div className="mt-1 font-mono text-xs text-gray-500">
                        Download voice to start chat
                      </div>
                    )}
                  </div>
                  </div>
                </div>
              </div>
              
              {/* Click outside to close dropdown */}
              {showAttachDropdown && (
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowAttachDropdown(false)}
                />
              )}
            </div>
          </div>
        )}
        </main>
      </div>

      {/* Character Setup Wizard - shown when user has no characters */}
      <Modal
        open={showCharacterSetupWizard}
        icon={<Bot size={24} />}
        title="Set up your first Character"
        onClose={() => setShowCharacterSetupWizard(false)}
        panelClassName="w-full max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Chat is driven by Characters (voice + personality pairs). To start chatting, you need at least one character.
          </p>
          {downloadedVoiceIds.size === 0 ? (
            <div className="space-y-3">
              <div className="p-3 rounded bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-1">
                  No voices downloaded yet
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                  Download at least one voice first. Voices are not loaded automatically, so you need to download them manually.
                </p>
              </div>
              <button
                type="button"
                className="retro-btn w-full flex items-center justify-center gap-2"
                onClick={() => {
                  setShowCharacterSetupWizard(false);
                  navigate('/voices');
                }}
              >
                Go to Voices
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                You have {downloadedVoiceIds.size} downloaded voice{downloadedVoiceIds.size !== 1 ? 's' : ''}. Create your first character now.
              </p>
              <button
                type="button"
                className="retro-btn w-full flex items-center justify-center gap-2"
                onClick={() => {
                  setShowCharacterSetupWizard(false);
                  navigate('/profiles');
                }}
              >
                <Bot size={16} />
                Go to Characters
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export const Layout = () => {
  return (
    <VoiceWsProvider>
      <LayoutInner />
    </VoiceWsProvider>
  );
};
