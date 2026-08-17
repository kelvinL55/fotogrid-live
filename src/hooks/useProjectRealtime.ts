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

    try {
      const res = await fetch(`/api/items?projectId=${projectId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.items && Array.isArray(json.items)) {
          apiItems = json.items;
        }
      }
    } catch (_err) {
      // Ignorar fallo de red
    }

    // Unir con items locales si estamos offline o en modo contingencia
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

    const combined = [...apiItems];
    for (const demoItem of demoItems) {
      if (!combined.some((i) => i.id === demoItem.id || i.position === demoItem.position)) {
        combined.push(demoItem);
      }
    }

    combined.sort((a, b) => a.position - b.position);
    setItems(combined);
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
