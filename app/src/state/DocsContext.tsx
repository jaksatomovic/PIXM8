import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type DocMeta = {
  id: string;
  filename: string;
  title?: string | null;
  doc_type: string;
  size_bytes: number;
  created_at: number;
};

type DocsContextValue = {
  selectedDocIds: Set<string>;
  selectedDocsMeta: DocMeta[];
  addDoc: (id: string, meta?: DocMeta) => void;
  removeDoc: (id: string) => void;
  setDocIds: (ids: string[]) => void;
  setDocsMeta: (meta: DocMeta[]) => void;
  clearDocs: () => void;
  isSelected: (id: string) => boolean;
};

const DocsContext = createContext<DocsContextValue | null>(null);

export function DocsProvider({ children }: { children: React.ReactNode }) {
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [docsMeta, setDocsMetaState] = useState<DocMeta[]>([]);

  const addDoc = useCallback((id: string, meta?: DocMeta) => {
    setSelectedDocIds((prev) => new Set(prev).add(id));
    if (meta) {
      setDocsMetaState((prev) => (prev.some((d) => d.id === id) ? prev : [...prev, meta]));
    }
  }, []);

  const removeDoc = useCallback((id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDocsMetaState((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const setDocIds = useCallback((ids: string[]) => {
    setSelectedDocIds(new Set(ids));
  }, []);

  const setDocsMeta = useCallback((meta: DocMeta[]) => {
    setDocsMetaState(meta);
  }, []);

  const clearDocs = useCallback(() => {
    setSelectedDocIds(new Set());
    setDocsMeta([]);
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedDocIds.has(id),
    [selectedDocIds]
  );

  const selectedDocsMeta = useMemo(() => {
    return docsMeta.filter((d) => selectedDocIds.has(d.id));
  }, [docsMeta, selectedDocIds]);

  const value = useMemo(
    () => ({
      selectedDocIds,
      selectedDocsMeta,
      addDoc,
      removeDoc,
      setDocIds,
      setDocsMeta,
      clearDocs,
      isSelected,
    }),
    [
      selectedDocIds,
      selectedDocsMeta,
      addDoc,
      removeDoc,
      setDocIds,
      setDocsMeta,
      clearDocs,
      isSelected,
    ]
  );

  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>;
}

export function useDocsContext() {
  const ctx = useContext(DocsContext);
  if (!ctx) throw new Error("useDocsContext must be used within DocsProvider");
  return ctx;
}

export function useDocsContextOptional() {
  return useContext(DocsContext);
}
