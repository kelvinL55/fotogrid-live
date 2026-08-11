'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ProjectItem } from '@/lib/types';
import { APP_CONFIG } from '@/lib/config';

export type RealtimeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export function useProjectRealtime(projectId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('connecting');
  const [latestPhotoId, setLatestPhotoId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    let supabaseItems: ProjectItem[] = [];

    try {
      const { data, error } = await supabase
        .from('project_items')
        .select('*')
        .eq('project_id', projectId)
        .order('position', { ascending: true });

      if (!error && data) {
        supabaseItems = await Promise.all(
          data.map(async (item: ProjectItem) => {
            if (item.storage_path && item.status === 'active') {
              const { data: urlData } = await supabase.storage
                .from(APP_CONFIG.storage.bucketName)
                .createSignedUrl(item.storage_path, APP_CONFIG.storage.signedUrlExpiresInSeconds);

              return {
                ...item,
                public_url: urlData?.signedUrl || undefined,
              };
            }
            return item;
          })
        );
      }
    } catch (_err) {
      // Ignorar fallo de Supabase en modo demo
    }

    // Cargar items guardados localmente para Modo Demo si no hay conexión a Supabase
    let demoItems: ProjectItem[] = [];
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`demo_items_${projectId}`);
      if (stored) {
        try {
          demoItems = JSON.parse(stored);
        } catch (_e) {
          demoItems = [];
        }
      }
    }

    // Fusionar manteniendo prioridad y orden por posición
    const combined = [...supabaseItems];
    for (const demoItem of demoItems) {
      if (!combined.some((i) => i.position === demoItem.position)) {
        combined.push(demoItem);
      }
    }

    combined.sort((a, b) => a.position - b.position);
    setItems(combined);
    setLoading(false);
  }, [projectId, supabase]);

  useEffect(() => {
    fetchItems();

    // Escuchar eventos 'storage' entre pestañas/ventanas para actualizar la cuadrícula local en tiempo real
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `demo_items_${projectId}` || e.key === 'demo_projects') {
        fetchItems();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
    }

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
  }, [projectId, fetchItems, supabase]);

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

