'use client';

import { useState, useEffect, useCallback } from 'react';

export function useCopiedItems(projectId: string) {
  const storageKey = `fotogrid_copied_items_${projectId}`;

  const [copiedIds, setCopiedIds] = useState<Set<string>>(() => new Set());

  // Cargar estado inicial desde localStorage
  useEffect(() => {
    if (typeof window === 'undefined' || !projectId) return;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCopiedIds(new Set(parsed));
        }
      }
    } catch (_err) {
      console.warn('Error al cargar items copiados desde localStorage');
    }
  }, [storageKey, projectId]);

  const markAsCopied = useCallback(
    (ids: string | string[]) => {
      const idArray = Array.isArray(ids) ? ids : [ids];
      if (idArray.length === 0) return;

      setCopiedIds((prev) => {
        const next = new Set(prev);
        let changed = false;
        idArray.forEach((id) => {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        });
        if (!changed) return prev;

        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
          } catch (_err) {
            // Ignorar errores de almacenamiento
          }
        }
        return next;
      });
    },
    [storageKey]
  );

  const unmarkAsCopied = useCallback(
    (id: string) => {
      setCopiedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);

        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
          } catch (_err) {
            // Ignorar errores de almacenamiento
          }
        }
        return next;
      });
    },
    [storageKey]
  );

  const clearAllCopied = useCallback(() => {
    setCopiedIds(new Set());
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(storageKey);
      } catch (_err) {
        // Ignorar
      }
    }
  }, [storageKey]);

  const isCopied = useCallback((id: string) => copiedIds.has(id), [copiedIds]);

  return {
    copiedIds,
    copiedCount: copiedIds.size,
    markAsCopied,
    unmarkAsCopied,
    clearAllCopied,
    isCopied,
  };
}
