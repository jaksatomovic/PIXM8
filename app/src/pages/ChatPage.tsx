import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Bot, Mic, Paperclip, Send } from 'lucide-react';
import { useActiveUser } from '../state/ActiveUserContext';
import { ExperienceModal, ExperienceForModal } from '../components/ExperienceModal';
import { Link, useSearchParams } from 'react-router-dom';
import { ChatTranscript, type ChatMessage } from '../components/ChatTranscript';
import { useDocsContextOptional } from '../state/DocsContext';
import { Modal } from '../components/Modal';
import { DocsTab } from './DocsTab';
import { useVoiceWs } from '../state/VoiceWsContext';

export const ChatPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<{ active_personality_id: string | null; active_personality_name: string | null } | null>(null);

  // Modal state (create experience from URL ?create=...)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedExperience, setSelectedExperience] = useState<ExperienceForModal | null>(null);

  const { activeUserId, activeUser } = useActiveUser();
  const docsContext = useDocsContextOptional();
  const voiceWs = useVoiceWs();

  const selectedDocsMeta = docsContext?.selectedDocsMeta ?? [];
  const removeDoc = docsContext?.removeDoc;

  const [activePersonalityNameUi, setActivePersonalityNameUi] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  const [docsModalOpen, setDocsModalOpen] = useState(false);

  // Auto-connect voice WebSocket when Chat page is opened
  useEffect(() => {
    if (!voiceWs.isActive) {
      voiceWs.connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveStatus = voiceWs.status;
  const statusDotClass =
    effectiveStatus === 'connected'
      ? 'bg-[#00c853]'
      : effectiveStatus === 'error'
      ? 'bg-red-500'
      : 'bg-[#ffd400]';

  const micStatusLabel = useMemo(() => {
    if (voiceWs.isSpeaking) return 'speaking';
    if (!voiceWs.isRecording) return voiceWs.status === 'connected' ? 'waiting' : null;
    if (voiceWs.isPaused) return 'processing';
    return 'listening';
  }, [voiceWs.isRecording, voiceWs.isPaused, voiceWs.isSpeaking, voiceWs.status]);

  const aiStatusLabel = useMemo(() => {
    if (effectiveStatus !== 'connected') return null;
    if (voiceWs.aiPhase === 'thinking') {
      return selectedDocsMeta.length > 0 ? 'thinking with docs' : 'thinking';
    }
    if (voiceWs.aiPhase === 'responding') return 'responding';
    return null;
  }, [effectiveStatus, voiceWs.aiPhase, selectedDocsMeta.length]);

  const orbScale = useMemo(() => {
    const base = voiceWs.isRecording ? 1.03 : 1;
    const speak = voiceWs.isSpeaking ? 0.08 : 0;
    return base + speak;
  }, [voiceWs.isRecording, voiceWs.isSpeaking]);

  const load = async () => {
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, []);

  useEffect(() => {
    const create = searchParams.get('create');
    if (!create) return;
    setModalMode('create');
    setSelectedExperience(null);
    setModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    const loadActive = async () => {
      try {
        const data = await api.getActiveSession().catch(() => null);
        if (!cancelled && data) {
          setActiveSession({
            active_personality_id: data?.active_personality_id ?? null,
            active_personality_name: data?.active_personality_name ?? null,
          });
        } else if (!cancelled) {
          setActiveSession(null);
        }
      } catch {
        if (!cancelled) setActiveSession(null);
      }
    };
    loadActive();
    return () => { cancelled = true; };
  }, []);

  // Load active personality + voice for display (no dropdowns)
  useEffect(() => {
    let cancelled = false;
    const loadMeta = async () => {
      try {
        const personalityId =
          activeSession?.active_personality_id ?? activeUser?.current_personality_id ?? null;
        if (!personalityId) {
          if (!cancelled) {
            setActivePersonalityNameUi(null);
          }
          return;
        }

        const ps = await api.getPersonalities(true).catch(() => []);
        if (cancelled) return;

        const personalities = Array.isArray(ps) ? ps : [];
        const selectedPersonality = personalities.find((p: any) => String(p.id) === String(personalityId));

        const personalityName =
          selectedPersonality?.name || activeSession?.active_personality_name || null;

        if (!cancelled) {
          setActivePersonalityNameUi(personalityName);
        }
      } catch {
        if (!cancelled) {
          setActivePersonalityNameUi(null);
        }
      }
    };
    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [activeSession?.active_personality_id, activeSession?.active_personality_name, activeUser?.current_personality_id]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text) return;
    voiceWs.sendText(text);
    setInputValue('');
  };

  const liveEmptyLabel = useMemo(() => {
    if (voiceWs.isRecording && !voiceWs.isPaused) {
      return '🎙 Listening...';
    }
    return 'Say the wake word or press Push-to-Talk';
  }, [voiceWs.isRecording, voiceWs.isPaused]);

  const handleMicClick = () => {
    if (voiceWs.isRecording) {
      voiceWs.stopRecording();
    } else {
      voiceWs.startRecording();
    }
  };

  const handleSendSuggestion = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    voiceWs.sendText(trimmed);
  };

  const rawTranscript = voiceWs.transcript as ChatMessage[];
  const hasAnyMessages = rawTranscript.length > 0;
  const displayTranscript = hasAnyMessages ? rawTranscript : [];
  const hasMessages = hasAnyMessages;

  return (
    <div className="-mt-8 flex flex-col h-full">
      <ExperienceModal
        open={modalOpen}
        mode={modalMode}
        experience={selectedExperience}
        experienceType="personality"
        onClose={() => setModalOpen(false)}
        onSuccess={async () => {
          await load();
        }}
      />

      {/* LIVE header (mirrors TestPage layout) */}
      <div className="sticky top-0 z-20 -mx-8 px-8 pb-2 bg-[var(--color-retro-bg)]">
        <div className="bg-white border-b border-gray-100 px-6 pt-6 pb-4 rounded-t-3xl shadow-sm">
          <div className="flex justify-between items-start gap-6">
            <div>
              <h2 className="text-3xl font-black">LIVE</h2>
              <div className="mt-2 font-mono text-xs text-gray-600">
                Character:{' '}
                <span className="font-bold text-black">
                  {activePersonalityNameUi || 'No character selected'}
                </span>
              </div>
              <div className="mt-1 font-mono text-xs text-gray-600 inline-flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full border border-black ${statusDotClass}`}
                />
                <span className="capitalize">
                  {effectiveStatus === 'connected'
                    ? 'connected'
                    : effectiveStatus === 'error'
                    ? 'error'
                    : 'disconnected'}
                </span>
                {micStatusLabel && (
                  <span className="text-gray-500">• {micStatusLabel}</span>
                )}
                {aiStatusLabel && (
                  <span className="text-gray-500">• AI: {aiStatusLabel}</span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-center">
              <div
                className="rounded-full shadow-[0_14px_30px_rgba(0,0,0,0.18)] transition-shadow"
                aria-hidden
                style={{
                  width: 96,
                  height: 96,
                  transform: `scale(${orbScale})`,
                  transition: 'transform 80ms linear',
                  opacity: effectiveStatus === 'connected' ? 1 : 0.7,
                }}
              >
                <div className="w-full h-full rounded-full border-2 border-black bg-[#9b5cff]" />
              </div>
              <div className="mt-3 font-mono text-xs text-gray-600 text-center">
                {effectiveStatus === 'connecting' && 'Connecting…'}
                {effectiveStatus === 'error' && 'WebSocket error'}
                {effectiveStatus === 'disconnected' && 'Disconnected'}
                {effectiveStatus === 'connected' && 'Live'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main live chat area */}
      <div className="flex-1 min-h-0 flex flex-col pt-4 pb-24">
        {/* Info banner if no user / character yet */}
        <div className="space-y-3 mb-3">
          {!activeUserId && !loading && (
            <div
              className="retro-card font-mono text-sm"
              style={{ backgroundColor: 'rgba(255, 193, 7, 0.15)', border: '1px solid rgba(255, 152, 0, 0.4)' }}
            >
              Select a member in{' '}
              <Link to="/users" className="underline font-bold">
                Members
              </Link>{' '}
              first, then choose a character to start chatting.
            </div>
          )}
          {activeUserId && !(activeSession?.active_personality_id ?? activeUser?.current_personality_id) && !loading && (
            <div
              className="retro-card font-mono text-sm"
              style={{ backgroundColor: 'rgba(124, 141, 255, 0.15)', border: '1px solid rgba(124, 141, 255, 0.4)' }}
            >
              <div className="flex items-center gap-3 mb-2">
                <Bot size={20} />
                <span className="font-bold">Choose a character</span>
              </div>
              <p className="text-sm mb-3">
                Pick a character (personality) to chat with. Voice is set on the Voices page.
              </p>
              <Link to="/profiles" className="retro-btn inline-flex items-center gap-2">
                <Bot size={16} />
                Go to Characters
              </Link>
            </div>
          )}
          {loading && <div className="retro-card font-mono text-sm">Loading…</div>}
          {error && <div className="retro-card font-mono text-sm">{error}</div>}
        </div>

        {/* Scrollable transcript (live from VoiceWs) */}
        <div className="flex-1 min-h-0 overflow-y-auto pb-4">
          {hasMessages ? (
            <ChatTranscript
              messages={displayTranscript}
              isLive
              autoScroll
              emptyLabel={liveEmptyLabel}
              className="border-0 bg-transparent"
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-4 mt-[30vh]">
              <div className="font-mono text-sm text-[var(--color-retro-fg-secondary)]">
                What can I help you with?
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className="retro-btn retro-btn-outline no-lift text-xs px-3 py-1.5"
                  onClick={() => handleSendSuggestion('Summarize this document.')}
                >
                  Summarize a document
                </button>
                <button
                  type="button"
                  className="retro-btn retro-btn-outline no-lift text-xs px-3 py-1.5"
                  onClick={() => handleSendSuggestion('Help me plan my day.')}
                >
                  Plan my day
                </button>
                <button
                  type="button"
                  className="retro-btn retro-btn-outline no-lift text-xs px-3 py-1.5"
                  onClick={() => handleSendSuggestion('Help me debug this issue.')}
                >
                  Help me debug
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom input bar (aligned with layout width) */}
      <div className="fixed bottom-0 z-20 left-[17rem] right-0 pointer-events-none">
        <div className="max-w-4xl mx-auto px-8 pb-6 pointer-events-auto">
          <div className="space-y-2">
            {/* Input row */}
            <div className="retro-card rounded-full px-3 py-2 flex items-center gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message…"
                className="flex-1 bg-transparent border-0 focus:outline-none text-sm"
              />
              <button
                type="button"
                className="retro-icon-btn w-9 h-9 flex items-center justify-center"
                aria-label={voiceWs.isRecording ? 'Stop microphone' : 'Start microphone'}
                onClick={handleMicClick}
              >
                <Mic size={16} />
              </button>
              <button
                type="button"
                className="retro-btn retro-btn-purple no-lift h-9 px-3 text-xs flex items-center gap-1"
                onClick={handleSend}
              >
                <Send size={14} />
                <span>Send</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

