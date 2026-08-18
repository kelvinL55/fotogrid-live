'use client';

import React, { useState } from 'react';
import { ProjectItem, Project } from '@/lib/types';
import { downloadMultipleAsZip } from '@/lib/utils/download';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { APP_CONFIG } from '@/lib/config';
import { Download, Trash2, X, CheckSquare } from 'lucide-react';

interface MultiSelectToolbarProps {
  selectedItems: ProjectItem[];
  project: Project;
  onClearSelection: () => void;
  onRefresh: () => void;
}

export function MultiSelectToolbar({
  selectedItems,
  project,
  onClearSelection,
  onRefresh,
}: MultiSelectToolbarProps) {
  const supabase = createClient();
  const { showToast } = useToast();

  const [downloading, setDownloading] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'empty' | 'compact'>('empty');
  const [deleting, setDeleting] = useState(false);

  if (selectedItems.length === 0) return null;

  const handleDownloadZip = async () => {
    setDownloading(true);
    setZipProgress(0);

    try {
      const itemsToDownload = selectedItems
        .filter((i) => i.status === 'active' && Boolean(i.public_url))
        .map((i) => ({ item: i, url: i.public_url! }));

      if (itemsToDownload.length === 0) {
        showToast('Ninguna de las casillas seleccionadas contiene una imagen activa.', 'error');
        return;
      }

      await downloadMultipleAsZip(itemsToDownload, project.name, (progress) => {
        setZipProgress(progress);
      });

      showToast(`¡Descargadas ${itemsToDownload.length} imágenes en ZIP!`, 'success');
    } catch (err: any) {
      showToast('Error al generar el archivo ZIP.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleBatchDelete = async () => {
    setDeleting(true);

    try {
      // 1. Eliminar archivos de Storage
      const pathsToDelete = selectedItems
        .map((i) => i.storage_path)
        .filter((p): p is string => Boolean(p));

      if (pathsToDelete.length > 0) {
        await supabase.storage.from(APP_CONFIG.storage.bucketName).remove(pathsToDelete);
      }

      const itemIds = selectedItems.map((i) => i.id);

      if (deleteMode === 'empty') {
        // Dejar casillas vacías
        const { error } = await supabase
          .from('project_items')
          .update({
            status: 'empty',
            storage_path: null,
            original_filename: null,
            mime_type: null,
            file_size: null,
          })
          .in('id', itemIds);

        if (error) throw error;

        showToast(`${selectedItems.length} casillas vaciadas.`, 'success');
      } else {
        // Eliminar y compactar
        const { error: delError } = await supabase
          .from('project_items')
          .delete()
          .in('id', itemIds);

        if (delError) throw delError;

        const { error: rpcError } = await supabase.rpc('compact_project_positions', {
          p_project_id: project.id,
        });

        if (rpcError) throw rpcError;

        showToast(`${selectedItems.length} fotografías eliminadas y cuadrícula compactada.`, 'success');
      }

      onClearSelection();
      setConfirmDeleteOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Error durante la eliminación múltiple.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-slate-700/80 backdrop-blur-xl rounded-xl sm:rounded-2xl shadow-2xl px-3 sm:px-6 py-2 sm:py-3 flex items-center gap-2 sm:gap-4 animate-fade-in text-white max-w-[95vw]">
        <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-semibold text-sky-400 border-r border-slate-700 pr-2 sm:pr-4 shrink-0">
          <CheckSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>{selectedItems.length} sel.</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            isLoading={downloading}
            onClick={handleDownloadZip}
            leftIcon={<Download className="w-4 h-4 text-indigo-400" />}
          >
            {downloading ? `ZIP (${zipProgress}%)` : 'Descargar ZIP'}
          </Button>

          <Button
            size="sm"
            variant="danger"
            onClick={() => setConfirmDeleteOpen(true)}
            leftIcon={<Trash2 className="w-4 h-4" />}
          >
            Eliminar Selección
          </Button>
        </div>

        <button
          onClick={onClearSelection}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-2"
          aria-label="Deseleccionar todas"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <Dialog
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title={`Eliminar ${selectedItems.length} fotografías`}
        description="Selecciona cómo deseas procesar las casillas eliminadas."
      >
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label
              onClick={() => setDeleteMode('empty')}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                deleteMode === 'empty'
                  ? 'bg-sky-950/40 border-sky-500 text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <input
                type="radio"
                name="deleteMode"
                checked={deleteMode === 'empty'}
                onChange={() => setDeleteMode('empty')}
                className="mt-1 accent-sky-500"
              />
              <div>
                <span className="font-semibold text-sm block">Dejar las casillas vacías</span>
                <span className="text-xs text-slate-400">
                  Mantiene las posiciones numeradas de las casillas intactas para rellenarlas más tarde.
                </span>
              </div>
            </label>

            <label
              onClick={() => setDeleteMode('compact')}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                deleteMode === 'compact'
                  ? 'bg-rose-950/40 border-rose-500 text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <input
                type="radio"
                name="deleteMode"
                checked={deleteMode === 'compact'}
                onChange={() => setDeleteMode('compact')}
                className="mt-1 accent-rose-500"
              />
              <div>
                <span className="font-semibold text-sm block">Compactar la cuadrícula</span>
                <span className="text-xs text-slate-400">
                  Re-ordena secuencialmente las posiciones sin dejar agujeros ni espacios vacíos.
                </span>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <Button variant="ghost" onClick={() => setConfirmDeleteOpen(false)}>
              Cancelar
            </Button>

            <Button
              variant="danger"
              isLoading={deleting}
              onClick={handleBatchDelete}
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              Confirmar Eliminación
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
