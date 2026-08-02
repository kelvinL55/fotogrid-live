'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { getPendingUploads, removePendingUpload } from '@/lib/utils/queue';
import { PendingUpload } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { APP_CONFIG } from '@/lib/config';
import { WifiOff, RefreshCw, Trash2, CloudUpload } from 'lucide-react';

interface UploadQueueManagerProps {
  projectId: string;
  onQueueEmpty?: () => void;
}

export function UploadQueueManager({ projectId, onQueueEmpty }: UploadQueueManagerProps) {
  const supabase = createClient();
  const { showToast } = useToast();

  const [pendingQueue, setPendingQueue] = useState<PendingUpload[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    const items = await getPendingUploads(projectId);
    setPendingQueue(items);
  }, [projectId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleRetry = async (upload: PendingUpload) => {
    setRetryingId(upload.id);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Sesión no encontrada.');

      const fileExt = upload.filename.split('.').pop() || 'jpg';
      const storagePath = `${userData.user.id}/${upload.project_id}/${upload.item_id}/v1.${fileExt}`;

      // Reintentar subida a Storage
      const { error: uploadError } = await supabase.storage
        .from(APP_CONFIG.storage.bucketName)
        .upload(storagePath, upload.file, {
          contentType: upload.file.type || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Actualizar registro en Postgres a 'active'
      const { error: updateError } = await supabase
        .from('project_items')
        .update({
          status: 'active',
          storage_path: storagePath,
          uploaded_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', upload.item_id);

      if (updateError) throw updateError;

      // Quitar de IndexedDB
      await removePendingUpload(upload.id);
      showToast(`¡Fotografía #${upload.position} reintentada y subida con éxito!`, 'success');
      await loadQueue();
      if (onQueueEmpty) onQueueEmpty();
    } catch (err: any) {
      showToast(`Fallo al reintentar: ${err.message || 'Sin conexión'}`, 'error');
    } finally {
      setRetryingId(null);
    }
  };

  const handleCancel = async (id: string) => {
    await removePendingUpload(id);
    showToast('Subida pendiente descartada.', 'info');
    await loadQueue();
  };

  if (pendingQueue.length === 0) return null;

  return (
    <div className="w-full max-w-md bg-amber-950/40 border border-amber-800/80 rounded-2xl p-4 shadow-xl mb-6">
      <div className="flex items-center justify-between mb-3 text-amber-300">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
          <WifiOff className="w-4 h-4 text-amber-400" />
          Subidas pendientes ({pendingQueue.length})
        </div>
      </div>

      <div className="space-y-2">
        {pendingQueue.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs"
          >
            <div className="flex flex-col">
              <span className="font-semibold text-white">Casilla #{item.position}</span>
              <span className="text-slate-400 text-[10px]">{item.filename}</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                isLoading={retryingId === item.id}
                onClick={() => handleRetry(item)}
                className="py-1 text-xs"
                leftIcon={<RefreshCw className="w-3 h-3 text-sky-400" />}
              >
                Reintentar
              </Button>

              <button
                onClick={() => handleCancel(item.id)}
                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800"
                title="Descartar"
                aria-label="Descartar subida pendiente"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
