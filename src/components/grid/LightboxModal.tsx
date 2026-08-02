'use client';

import React, { useEffect } from 'react';
import { ProjectItem, Project } from '@/lib/types';
import { formatPositionNumber, generateDownloadFilename, downloadSingleImage } from '@/lib/utils/download';
import { copyImageToClipboard } from '@/lib/utils/clipboard';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Trash2,
  RefreshCw,
  Calendar,
  HardDrive,
  Maximize2,
} from 'lucide-react';

interface LightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentItem: ProjectItem | null;
  items: ProjectItem[];
  project: Project;
  onNavigate: (item: ProjectItem) => void;
  onReplaceItem: (item: ProjectItem) => void;
  onRefresh: () => void;
}

export function LightboxModal({
  isOpen,
  onClose,
  currentItem,
  items,
  project,
  onNavigate,
  onReplaceItem,
  onRefresh,
}: LightboxModalProps) {
  const { showToast } = useToast();

  const activeItems = items.filter((i) => i.status === 'active' && Boolean(i.public_url));
  const currentIndex = currentItem
    ? activeItems.findIndex((i) => i.id === currentItem.id)
    : -1;

  const prevItem = currentIndex > 0 ? activeItems[currentIndex - 1] : null;
  const nextItem =
    currentIndex >= 0 && currentIndex < activeItems.length - 1
      ? activeItems[currentIndex + 1]
      : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && prevItem) onNavigate(prevItem);
      if (e.key === 'ArrowRight' && nextItem) onNavigate(nextItem);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, prevItem, nextItem, onClose, onNavigate]);

  if (!isOpen || !currentItem || !currentItem.public_url) return null;

  const formattedPos = formatPositionNumber(currentItem.position);
  const fileSizeKB = currentItem.file_size
    ? (currentItem.file_size / 1024).toFixed(1) + ' KB'
    : 'Desconocido';

  const handleCopy = async () => {
    showToast('Copiando imagen...', 'info');
    const res = await copyImageToClipboard(currentItem.public_url!);
    showToast(res.message, res.success ? 'success' : 'error');
  };

  const handleDownload = async () => {
    const filename = generateDownloadFilename(project.name, currentItem.position);
    await downloadSingleImage(currentItem.public_url!, filename);
    showToast(`Descargando ${filename}`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-xl animate-fade-in text-white p-4 select-none">
      {/* Botón Cerrar */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-2.5 bg-slate-900/80 border border-slate-800 hover:bg-slate-800 rounded-full text-slate-300 hover:text-white transition-colors"
        aria-label="Cerrar visor"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Control Anterior */}
      {prevItem && (
        <button
          onClick={() => onNavigate(prevItem)}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-50 p-3 bg-slate-900/80 border border-slate-800 hover:bg-slate-800 rounded-full text-slate-300 hover:text-white transition-colors"
          aria-label="Fotografía anterior"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Control Siguiente */}
      {nextItem && (
        <button
          onClick={() => onNavigate(nextItem)}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-50 p-3 bg-slate-900/80 border border-slate-800 hover:bg-slate-800 rounded-full text-slate-300 hover:text-white transition-colors"
          aria-label="Siguiente fotografía"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Área Central: Imagen y Metadatos */}
      <div className="max-w-5xl w-full max-h-[90vh] flex flex-col items-center justify-between gap-4">
        {/* Header Metadatos */}
        <div className="w-full flex flex-wrap items-center justify-between gap-4 px-2 py-1 bg-slate-900/80 border border-slate-800/80 rounded-2xl">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-sm bg-sky-600 px-3 py-1 rounded-xl text-white">
              Fotografía #{formattedPos}
            </span>
            <span className="text-sm font-semibold text-slate-300 truncate max-w-[200px]">
              {currentItem.original_filename || `Foto-${formattedPos}`}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-400">
            {currentItem.uploaded_at && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>{new Date(currentItem.uploaded_at).toLocaleString('es-ES')}</span>
              </div>
            )}
            {currentItem.width && currentItem.height && (
              <div className="flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                <span>{currentItem.width} × {currentItem.height} px</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-slate-500" />
              <span>{fileSizeKB}</span>
            </div>
          </div>
        </div>

        {/* Imagen principal */}
        <div className="relative flex-1 w-full flex items-center justify-center min-h-0 overflow-hidden py-2">
          <img
            src={currentItem.public_url}
            alt={`Fotografía ${formattedPos}`}
            className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl border border-slate-800"
          />
        </div>

        {/* Barra de Acciones */}
        <div className="flex flex-wrap items-center justify-center gap-3 py-2 px-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
          <Button
            variant="primary"
            onClick={handleCopy}
            leftIcon={<Copy className="w-4 h-4" />}
          >
            Copiar Imagen
          </Button>

          <Button
            variant="secondary"
            onClick={handleDownload}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Descargar
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              onClose();
              onReplaceItem(currentItem);
            }}
            leftIcon={<RefreshCw className="w-4 h-4 text-amber-400" />}
          >
            Reemplazar
          </Button>
        </div>
      </div>
    </div>
  );
}
