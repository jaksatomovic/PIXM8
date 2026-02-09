import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Pencil, Plus } from 'lucide-react';
import { AddUserModal } from '../components/AddUserModal';
import { EditUserModal, type FaceItem } from '../components/EditUserModal';
import { useActiveUser } from '../state/ActiveUserContext';
import { EmojiAvatar } from '../components/EmojiAvatar';

export const UsersPage = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [userFaces, setUserFaces] = useState<Record<string, FaceItem[]>>({});
  const [faceImageCache, setFaceImageCache] = useState<Record<string, string>>({});
  const [uploadingFaceFor, setUploadingFaceFor] = useState<string | null>(null);
  const { refreshUsers, setActiveUserId, activeUserId } = useActiveUser();

  const loadFacesForUser = useCallback(async (userId: string) => {
    try {
      const res = await api.listUserFaces(userId) as { faces?: FaceItem[] };
      setUserFaces((prev) => ({ ...prev, [userId]: res?.faces || [] }));
    } catch {
      setUserFaces((prev) => ({ ...prev, [userId]: [] }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setError(null);
        const data = await api.getUsers();
        if (!cancelled) setUsers(data);
        if (!cancelled && Array.isArray(data)) {
          for (const u of data) {
            if (u?.id) loadFacesForUser(u.id);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load users');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [loadFacesForUser]);

  const getFaceImageUrl = useCallback(async (userId: string, faceId: string): Promise<string | null> => {
    const key = `${userId}:${faceId}`;
    if (faceImageCache[key]) return faceImageCache[key];
    try {
      const res = await api.getUserFaceImage(userId, faceId) as { base64?: string };
      if (res?.base64) {
        const url = `data:image/jpeg;base64,${res.base64}`;
        setFaceImageCache((prev) => ({ ...prev, [key]: url }));
        return url;
      }
    } catch {
      //
    }
    return null;
  }, [faceImageCache]);

  const handleAddFace = async (userId: string, file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploadingFaceFor(userId);
    try {
      await api.uploadUserFace(userId, file);
      await loadFacesForUser(userId);
    } catch (e: any) {
      console.error('Upload face failed', e);
    } finally {
      setUploadingFaceFor(null);
    }
  };

  const handleDeleteFace = async (userId: string, faceId: string) => {
    try {
      await api.deleteUserFace(userId, faceId);
      setUserFaces((prev) => ({
        ...prev,
        [userId]: (prev[userId] || []).filter((f) => f.id !== faceId),
      }));
      setFaceImageCache((prev) => {
        const next = { ...prev };
        delete next[`${userId}:${faceId}`];
        return next;
      });
    } catch (e: any) {
      console.error('Delete face failed', e);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-8">
        <h2 className="text-3xl font-black">MEMBERS</h2>
        <button className="retro-btn retro-btn-outline" onClick={() => setAddOpen(true)}>
          <Plus size={16} /> Add
        </button>
      </div>

      <AddUserModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={async () => {
          await refreshUsers();
          const next = await api.getUsers();
          setUsers(next); // Explicitly update local state
          if (next && next.length > 0) {
            const newest = next[next.length - 1];
            // Only set active if it's the first user ever
            if (next.length === 1 && newest?.id) {
              await setActiveUserId(newest.id);
            }
          }
        }}
      />

      <EditUserModal
        open={editOpen}
        user={editingUser}
        onClose={() => {
          setEditOpen(false);
          setEditingUser(null);
        }}
        onSaved={async () => {
          await refreshUsers();
          const data = await api.getUsers();
          setUsers(data);
        }}
        userFaces={editingUser ? (userFaces[editingUser.id] || []) : []}
        getFaceImageUrl={getFaceImageUrl}
        onLoadFaces={editingUser ? () => loadFacesForUser(editingUser.id) : undefined}
        onAddFace={editingUser ? (file: File) => handleAddFace(editingUser.id, file) : undefined}
        onDeleteFace={editingUser ? (faceId: string) => handleDeleteFace(editingUser.id, faceId) : undefined}
        uploadingFace={editingUser ? uploadingFaceFor === editingUser.id : false}
      />

      {loading && (
        <div className="retro-card font-mono text-sm mb-4">Loading…</div>
      )}
      {error && (
        <div className="retro-card font-mono text-sm mb-4">{error}</div>
      )}
      {!loading && !error && users.length === 0 && (
        <div className="retro-card font-mono text-sm mb-4">No members found.</div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {users.map((u) => {
          const isActive = activeUserId === u.id;
          return (
          <div
            key={u.id}
            role="button"
            tabIndex={0}
            onClick={() => setActiveUserId(u.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveUserId(u.id);
              }
            }}
            className={`retro-card relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer transition-shadow ${
              isActive ? 'retro-selected' : 'retro-not-selected'
            }`}
          >
            <button
              type="button"
              className="retro-icon-btn absolute top-3 right-3"
              aria-label="Edit user"
              onClick={(e) => {
                e.stopPropagation();
                setEditingUser(u);
                setEditOpen(true);
              }}
            >
              <Pencil size={16} />
            </button>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[14px] border border-gray-200 flex items-center justify-center bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                <EmojiAvatar emoji={u.avatar_emoji} size={28} />
              </div>
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  {u.name}
                  {isActive && (
                    <span className="text-xs bg-[#9b5cff] text-white px-2 py-0.5 uppercase">
                      Active
                    </span>
                  )}
                  <span className="text-xs bg-black text-white px-2 py-0.5 uppercase">
                    {u.user_type || 'family'}
                  </span>
                </h3>
                <div className="flex gap-4 text-sm text-gray-600 mt-1">
                  <span>Age: {u.age || 'N/A'}</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-2 pr-8 w-full sm:w-[320px] sm:max-w-[45%] overflow-hidden">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-500">
                About you
              </div>
              <div className="font-mono text-xs text-gray-700 text-right whitespace-pre-wrap break-all retro-clamp-3">
                {u.about_you ? String(u.about_you) : '—'}
              </div>
            </div>
          </div>
        )})}
      </div>
    </div>
  );
};
