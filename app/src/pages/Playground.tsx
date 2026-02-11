import { useEffect, useState } from 'react';
import { api } from '../api';
import { MessageCircle, FileText, Bot } from 'lucide-react';
import { useActiveUser } from '../state/ActiveUserContext';
import { ExperienceModal, ExperienceForModal } from '../components/ExperienceModal';
import { Link, useSearchParams } from 'react-router-dom';
import { DocsTab } from './DocsTab';
import { Conversations } from './Conversations';

type ExperienceType = 'personality' | 'docs';

const TAB_CONFIG: { id: ExperienceType; label: string; icon: typeof MessageCircle }[] = [
  { id: 'personality', label: 'Chat', icon: MessageCircle },
  { id: 'docs', label: 'Docs', icon: FileText },
];

const VALID_TABS: ExperienceType[] = ['personality', 'docs'];

export const Playground = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = (searchParams.get('tab') as ExperienceType) || 'personality';
  const initialTab = VALID_TABS.includes(tabParam) ? tabParam : 'personality';
  const [activeTab, setActiveTab] = useState<ExperienceType>(initialTab);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<{ active_personality_id: string | null; active_personality_name: string | null } | null>(null);

  // Modal state (create experience from URL ?create=...)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedExperience, setSelectedExperience] = useState<ExperienceForModal | null>(null);

  const { activeUserId, activeUser } = useActiveUser();

  const load = async () => {
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [activeTab]);

  useEffect(() => {
    const tab = (searchParams.get('tab') as ExperienceType) || 'personality';
    if (tab !== activeTab) setActiveTab(tab);
  }, [searchParams, activeTab]);

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

  const handleTabChange = (tab: ExperienceType) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div>
      {/* Floating Tab Bar */}
      <div className="sticky top-0 z-20 -mx-8 px-8 pt-2 pb-4 bg-transparent">
        <div className="flex justify-center">
          <div className="inline-flex bg-gray-100 rounded-full p-1 shadow-[0_6px_0_rgba(210,210,210,1)]">
            {TAB_CONFIG.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2 px-5 py-2 rounded-full font-black uppercase tracking-wide transition-all ${
                    isActive
                      ? 'bg-white text-gray-900'
                      : 'bg-transparent text-gray-500 hover:bg-white'
                  }`}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <ExperienceModal 
        open={modalOpen && activeTab !== 'docs'}
        mode={modalMode}
        experience={selectedExperience}
        experienceType={activeTab === 'docs' ? 'personality' : activeTab}
        onClose={() => setModalOpen(false)}
        onSuccess={async () => {
          await load();
        }}
      />

      {activeTab === 'docs' ? (
        <DocsTab />
      ) : (
        <div className="pt-8 space-y-4">
          {!activeUserId && !loading && (
            <div className="retro-card font-mono text-sm mb-4" style={{ backgroundColor: 'rgba(255, 193, 7, 0.15)', border: '1px solid rgba(255, 152, 0, 0.4)' }}>
              Select a member in <Link to="/users" className="underline font-bold">Members</Link> first, then choose a character to start chatting.
            </div>
          )}
          {activeUserId && !(activeSession?.active_personality_id ?? activeUser?.current_personality_id) && !loading && (
            <div className="retro-card font-mono text-sm mb-4" style={{ backgroundColor: 'rgba(124, 141, 255, 0.15)', border: '1px solid rgba(124, 141, 255, 0.4)' }}>
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
          {loading && (
            <div className="retro-card font-mono text-sm mb-4">Loading…</div>
          )}
          {error && (
            <div className="retro-card font-mono text-sm mb-4">{error}</div>
          )}
          <Conversations noHeader />
        </div>
      )}
    </div>
  );
};
