/** Docs Library tab: upload, search, filter, list, select for chat context. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useDocsContext, type DocMeta } from "../state/DocsContext";
import { useSearchParams } from "react-router-dom";
import {
  Upload,
  Trash2,
  MessageCircle,
  CheckSquare,
  Square,
  Pencil,
  Filter,
  ArrowUpDown,
  Check,
  FilePlus,
} from "lucide-react";
import { Modal } from "../components/Modal";

const DOC_TYPES = [
  { value: "", label: "All" },
  { value: "pdf", label: "PDF" },
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "doc", label: "Doc" },
  { value: "other", label: "Other" },
];

type DocRow = {
  id: string;
  filename: string;
  title?: string | null;
  ext: string;
  mime: string;
  doc_type: string;
  size_bytes: number;
  created_at: number;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { dateStyle: "short" });
}

export const DocsTab = ({ compact = false }: { compact?: boolean } = {}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"name_asc" | "name_desc" | "date_desc" | "date_asc" | "size_desc" | "size_asc">("date_desc");
  const [sortOpen, setSortOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renameModalDoc, setRenameModalDoc] = useState<DocRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteModalDoc, setDeleteModalDoc] = useState<DocRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  const { addDoc, removeDoc, isSelected: isAttached, selectedDocIds, setDocIds, setDocsMeta } = useDocsContext();

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listDocs({
        q: search.trim() || undefined,
        type: typeFilter || undefined,
        limit: 100,
        offset: 0,
      });
      setDocs(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load docs");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => {
    const t = setTimeout(loadDocs, 300);
    return () => clearTimeout(t);
  }, [loadDocs]);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      setUploading(true);
      setError(null);
      try {
        const created = await api.uploadDoc(file);
        await loadDocs();
        if (created?.id) {
          addDoc(created.id, {
            id: created.id,
            filename: created.filename ?? file.name,
            title: created.title ?? null,
            doc_type: created.doc_type ?? "other",
            size_bytes: created.size_bytes ?? 0,
            created_at: created.created_at ?? 0,
          });
        }
      } catch (err: any) {
        setError(err?.message || "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [loadDocs, addDoc]
  );

  const handleDelete = useCallback(
    async (docId: string) => {
      setDeleteModalDoc(null);
      try {
        await api.deleteDoc(docId);
        removeDoc(docId);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(docId);
          return next;
        });
        await loadDocs();
      } catch (err: any) {
        setError(err?.message || "Delete failed");
      }
    },
    [loadDocs, removeDoc]
  );

  const handleRenameSubmit = useCallback(
    async (docId: string) => {
      const title = renameValue.trim() || null;
      try {
        await api.renameDoc(docId, title);
        setRenameModalDoc(null);
        setRenameValue("");
        await loadDocs();
      } catch (err: any) {
        setError(err?.message || "Rename failed");
      }
    },
    [renameValue, loadDocs]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const attachToChat = (doc: DocRow) => {
    addDoc(doc.id, {
      id: doc.id,
      filename: doc.filename,
      title: doc.title ?? null,
      doc_type: doc.doc_type,
      size_bytes: doc.size_bytes,
      created_at: doc.created_at,
    });
  };

  const chatWithSelected = () => {
    const ids = Array.from(selectedIds);
    const metas = docs.filter((d) => selectedIds.has(d.id)).map((d) => ({
      id: d.id,
      filename: d.filename,
      title: d.title ?? null,
      doc_type: d.doc_type,
      size_bytes: d.size_bytes,
      created_at: d.created_at,
    }));
    setDocIds(ids);
    setDocsMeta(metas);
    setSearchParams({ tab: "personality" });
  };

  const displayName = (d: DocRow) => (d.title && d.title.trim() ? d.title.trim() : d.filename) || d.id;

  const sortedDocs = useMemo(() => {
    const arr = [...docs];
    if (sortBy === "name_asc") arr.sort((a, b) => (displayName(a)).localeCompare(displayName(b)));
    else if (sortBy === "name_desc") arr.sort((a, b) => (displayName(b)).localeCompare(displayName(a)));
    else if (sortBy === "date_desc") arr.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    else if (sortBy === "date_asc") arr.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    else if (sortBy === "size_desc") arr.sort((a, b) => b.size_bytes - a.size_bytes);
    else if (sortBy === "size_asc") arr.sort((a, b) => a.size_bytes - b.size_bytes);
    return arr;
  }, [docs, sortBy]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const sortLabels: Record<typeof sortBy, string> = {
    name_asc: "Name A–Z",
    name_desc: "Name Z–A",
    date_desc: "Date (newest)",
    date_asc: "Date (oldest)",
    size_desc: "Size (largest)",
    size_asc: "Size (smallest)",
  };

  const handleAddDocClick = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-4 pt-8">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf,.txt,.md,.json,.csv,image/*,.doc,.docx,application/pdf,text/*,image/*"
        onChange={handleUpload}
      />
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search documents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="retro-input flex-1 min-w-0 max-w-md"
        />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              className="retro-icon-btn p-2"
              onClick={(e) => { e.stopPropagation(); setFilterOpen((o) => !o); setSortOpen(false); }}
              title="Filter by type"
              aria-label="Filter"
              aria-expanded={filterOpen}
            >
              <Filter size={18} />
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-10 min-w-[140px] retro-card py-1 shadow-lg">
                {DOC_TYPES.map((o) => (
                  <button
                    key={o.value || "all"}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => { setTypeFilter(o.value); setFilterOpen(false); }}
                  >
                    {typeFilter === o.value ? <Check size={16} className="shrink-0 text-green-600" /> : <span className="w-4 shrink-0" />}
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative" ref={sortRef}>
            <button
              type="button"
              className="retro-icon-btn p-2"
              onClick={(e) => { e.stopPropagation(); setSortOpen((o) => !o); setFilterOpen(false); }}
              title="Sort"
              aria-label="Sort"
              aria-expanded={sortOpen}
            >
              <ArrowUpDown size={18} />
            </button>
            {sortOpen && (
              <div className="absolute right-0 top-full mt-1 z-10 min-w-[160px] retro-card py-1 shadow-lg">
                {(["date_desc", "date_asc", "name_asc", "name_desc", "size_desc", "size_asc"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => { setSortBy(key); setSortOpen(false); }}
                  >
                    {sortBy === key ? <Check size={16} className="shrink-0 text-green-600" /> : <span className="w-4 shrink-0" />}
                    {sortLabels[key]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 retro-card py-2 px-3">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            className="retro-btn flex items-center gap-2"
            onClick={chatWithSelected}
          >
            <MessageCircle size={16} />
            Chat with selected
          </button>
        </div>
      )}

      {error && (
        <div className="retro-card font-mono text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="retro-card font-mono text-sm py-8 text-center text-[var(--color-retro-fg-secondary)]">
          Loading…
        </div>
      ) : (
        <ul className={`grid gap-3 ${compact ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          {/* Card: Add new document - Always visible */}
            <li
              role="button"
              tabIndex={0}
              onClick={handleAddDocClick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleAddDocClick();
              }}
              className={`retro-card retro-not-selected flex flex-col cursor-pointer transition-shadow hover:shadow-[var(--shadow-retro-hover)] text-left list-none ${
                uploading ? "opacity-60 pointer-events-none" : ""
              } ${compact ? "min-h-[150px]" : "min-h-[175px]"}`}
              style={{ padding: 0 }}
          >
            <div className={`w-full ${compact ? "h-[110px]" : "h-[140px]"} rounded-t-[24px] bg-orange-50/50 retro-cross flex items-center justify-center overflow-hidden border-b border-[var(--color-retro-border)]`}>
              <FilePlus size={32} className="text-gray-500" />
            </div>
            <div className="min-w-0 flex-1 p-4">
              <h3 className="text-lg font-black leading-tight">Add new document</h3>
              <p className="text-gray-600 text-xs font-medium mt-2">
                Upload a PDF, text file, image, or document. It will be available as context for chat.
              </p>
            </div>
            <div className="mt-auto border-t border-gray-200 dark:border-gray-700 p-4">
              <span className="retro-btn w-full justify-center inline-flex gap-2">
                <Upload size={16} />
                {uploading ? "Uploading…" : "Choose file"}
              </span>
            </div>
          </li>
          {sortedDocs.map((d) => (
            <li
              key={d.id}
              className={`retro-card flex flex-col gap-3 p-4 relative ${
                compact ? "min-h-[150px]" : "min-h-[175px]"
              }`}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  className="shrink-0 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => toggleSelect(d.id)}
                  aria-label={selectedIds.has(d.id) ? "Deselect" : "Select"}
                >
                  {selectedIds.has(d.id) ? (
                    <CheckSquare size={18} className="text-blue-600" />
                  ) : (
                    <Square size={18} className="text-gray-400" />
                  )}
                </button>
                <div className="min-w-0 flex-1 pr-16">
                  <div className="font-medium truncate" title={displayName(d)}>
                    {displayName(d)}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700">
                      {d.doc_type}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatSize(d.size_bytes)} · {formatDate(d.created_at)}
                    </span>
                  </div>
                </div>
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <button
                    type="button"
                    className="retro-icon-btn p-1.5"
                    onClick={() => {
                      setRenameModalDoc(d);
                      setRenameValue((d.title || d.filename || "").trim());
                    }}
                    title="Rename"
                    aria-label="Rename"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="retro-icon-btn p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => setDeleteModalDoc(d)}
                    title="Delete"
                    aria-label="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-auto pt-1">
                <button
                  type="button"
                  className="retro-btn text-xs w-full flex items-center justify-center gap-1.5 py-2"
                  onClick={() => attachToChat(d)}
                  title="Attach to Chat"
                >
                  <MessageCircle size={12} />
                  {isAttached(d.id) ? "Attached" : "Attach to Chat"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!renameModalDoc}
        title="Rename document"
        onClose={() => {
          setRenameModalDoc(null);
          setRenameValue("");
        }}
      >
        {renameModalDoc && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display name</label>
              <input
                type="text"
                className="retro-input w-full"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSubmit(renameModalDoc.id);
                  if (e.key === "Escape") {
                    setRenameModalDoc(null);
                    setRenameValue("");
                  }
                }}
                placeholder={renameModalDoc.filename}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="retro-btn retro-btn-outline"
                onClick={() => {
                  setRenameModalDoc(null);
                  setRenameValue("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="retro-btn"
                onClick={() => handleRenameSubmit(renameModalDoc.id)}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleteModalDoc}
        title="Delete document?"
        onClose={() => setDeleteModalDoc(null)}
      >
        {deleteModalDoc && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to delete &quot;{displayName(deleteModalDoc)}&quot;? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="retro-btn retro-btn-outline"
                onClick={() => setDeleteModalDoc(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="retro-btn text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => handleDelete(deleteModalDoc.id)}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
