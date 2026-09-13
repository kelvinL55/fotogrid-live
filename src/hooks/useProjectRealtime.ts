'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ProjectItem } from '@/lib/types';
import { normalizeProjectId } from '@/lib/utils/project';

export type RealtimeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export function useProjectRealtime(rawProjectId: string) {
  const projectId = normalizeProjectId(rawProjectId);
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('connecting');
  const [latestPhotoId, setLatestPhotoId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    let apiItems: ProjectItem[] = [];
    let apiSuccess = false;

    try {
      const res = await fetch(`/api/items?projectId=${projectId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.items && Array.isArray(json.items)) {
          apiItems = json.items;
          apiSuccess = true;
        }
      }
    } catch (_err) {
      // Ignorar fallo de red
    }

    if (apiSuccess) {
      // El servidor es la fuente de verdad: evitar que fotos borradas revivan desde localStorage
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(`demo_items_${projectId}`);
        if (stored) {
          try {
            const demoItems: ProjectItem[] = JSON.parse(stored);
            const pendingUploading = demoItems.filter((i) => i.status === 'uploading');
            if (pendingUploading.length > 0) {
              const merged = [...apiItems];
              for (const p of pendingUploading) {
                if (!merged.some((i) => i.id === p.id || i.position === p.position)) {
                  merged.push(p);
                }
              }
              merged.sort((a, b) => a.position - b.position);
              setItems(merged);
              setLoading(false);
              return;
            } else {
              localStorage.removeItem(`demo_items_${projectId}`);
              localStorage.removeItem(`demo_items_${rawProjectId}`);
            }
          } catch (_e) {}
        }
      }

      apiItems.sort((a, b) => a.position - b.position);
      setItems(apiItems);
      setLoading(false);
      return;
    }

    // Fallback de contingencia únicamente si estamos sin conexión o falló la red
    let demoItems: ProjectItem[] = [];
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`demo_items_${projectId}`) || localStorage.getItem(`demo_items_${rawProjectId}`);
      if (stored) {
        try {
          demoItems = JSON.parse(stored);
        } catch (_e) {
          demoItems = [];
        }
      }
    }

    demoItems.sort((a, b) => a.position - b.position);
    setItems(demoItems);
    setLoading(false);
  }, [projectId, rawProjectId]);

  useEffect(() => {
    fetchItems();

    // Escuchar eventos 'storage' entre pestañas para actualización local inmediata
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `demo_items_${projectId}` || e.key === `demo_items_${rawProjectId}` || e.key === 'demo_projects') {
        fetchItems();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
    }

    // Suscribir al canal Realtime de Supabase
    const channel = supabase
      .channel(`project_items:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_items',
          filter: `project_id=eq.${projectId}`,
        },
        async (payload: any) => {
          if (payload.new && payload.new.id) {
            setLatestPhotoId(payload.new.id);
          }
          await fetchItems();
        }
      )
      .on(
        'broadcast',
        { event: 'new_photo' },
        async (payload: any) => {
          const incomingItem = payload.payload?.item as ProjectItem | undefined;
          if (incomingItem) {
            setLatestPhotoId(incomingItem.id);
            setItems((prev) => {
              const filtered = prev.filter(
                (i) => i.id !== incomingItem.id && i.position !== incomingItem.position
              );
              const updated = [...filtered, incomingItem];
              updated.sort((a, b) => a.position - b.position);
              return updated;
            });
          }
          await fetchItems();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionState('connected');
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          setConnectionState('reconnecting');
        } else if (status === 'CLOSED') {
          setConnectionState('disconnected');
        }
      });

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageChange);
      }
      supabase.removeChannel(channel);
    };
  }, [projectId, rawProjectId, fetchItems, supabase]);

  const broadcastNewPhoto = useCallback((item: ProjectItem) => {
    setLatestPhotoId(item.id);
    const channel = supabase.channel(`project_items:${projectId}`);
    channel.send({
      type: 'broadcast',
      event: 'new_photo',
      payload: { item, itemId: item.id, position: item.position, timestamp: new Date().toISOString() },
    });
  }, [projectId, supabase]);

  return {
    items,
    loading,
    connectionState,
    latestPhotoId,
    refreshItems: fetchItems,
    broadcastNewPhoto,
  };
}
