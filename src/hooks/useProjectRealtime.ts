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

  const fetchItems = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('project_items')
        .select('*')
        .eq('project_id', projectId)
        .order('position', { ascending: true });

      if (error) throw error;

      const itemsWithUrls = await Promise.all(
        (data || []).map(async (item: ProjectItem) => {
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

      setItems(itemsWithUrls);
    } catch (err) {
      console.error('Error al cargar items del proyecto:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, supabase]);

  useEffect(() => {
    fetchItems();

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
        async () => {
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
      supabase.removeChannel(channel);
    };
  }, [projectId, fetchItems, supabase]);

  return {
    items,
    loading,
    connectionState,
    refreshItems: fetchItems,
  };
}
