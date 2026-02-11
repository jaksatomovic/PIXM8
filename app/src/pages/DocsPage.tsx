import { useEffect, useState } from 'react';
import { ExperienceModal, ExperienceForModal } from '../components/ExperienceModal';
import { useSearchParams } from 'react-router-dom';
import { DocsTab } from './DocsTab';

export const DocsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedExperience, setSelectedExperience] = useState<ExperienceForModal | null>(null);

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

  return (
    <div>
      <ExperienceModal
        open={modalOpen}
        mode={modalMode}
        experience={selectedExperience}
        experienceType="docs"
        onClose={() => setModalOpen(false)}
        onSuccess={async () => {
          // no-op for now; DocsTab handles its own loading
        }}
      />
      <DocsTab />
    </div>
  );
};

