'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  RefreshCw,
  Calendar,
  HardDrive,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
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
  onMarkCopied?: (itemId: string) => void;
}

export function LightboxModal({
  isOpen,
  onClose,
  currentItem,
  items,
  project,
  onNavigate,
  onReplaceItem,
  onMarkCopied,
}: LightboxModalProps) {
  const { showToast } = useToast();

  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const activeItems = items.filter((i) => i.status === 'active' && Boolean(i.public_url));
  const currentIndex = currentItem
    ? activeItems.findIndex((i) => i.id === currentItem.id)
    : -1;

  const prevItem = currentIndex > 0 ? activeItems[currentIndex - 1] : null;
  const nextItem =
    currentIndex >= 0 && currentIndex < activeItems.length - 1
      ? activeItems[currentIndex + 1]
      : null;

  // Restablecer zoom al cambiar de imagen o abrir modal
  const resetZoom = useCallback(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
  }, []);

  useEffect(() => {
    resetZoom();
  }, [currentItem?.id, resetZoom]);

  const handleZoomIn = useCallback(() => {
    setZoomScale((prev) => Math.min(4, Math.round((prev + 0.5) * 10) / 10));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomScale((prev) => {
      const next = Math.max(1, Math.round((prev - 0.5) * 10) / 10);
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleToggleZoom = useCallback(() => {
    setZoomScale((prev) => {
      if (prev > 1) {
        setPanOffset({ x: 0, y: 0 });
        return 1;
      } else {
        return 2.5;
      }
    });
  }, []);

  // Control con rueda del mouse
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoomScale((prev) => Math.min(4, Math.round((prev + 0.25) * 100) / 100));
    } else {
      setZoomScale((prev) => {
        const next = Math.max(1, Math.round((prev - 0.25) * 100) / 100);
        if (next === 1) setPanOffset({ x: 0, y: 0 });
        return next;
      });
    }
  };

  // Paneo al arrastrar cuando hay zoom
  const handlePointerDown = (e: React.PointerEvent) => {
    if (zoomScale <= 1) return;
    setIsPanning(true);
    dragStartRef.current = {
      x: e.clientX - panOffset.x,
      y: e.clientY - panOffset.y,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanning || zoomScale <= 1) return;
    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;
    setPanOffset({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsPanning(false);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch (_e) {}
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (zoomScale > 1) {
          resetZoom();
        } else {
          onClose();
        }
      }
      if (e.key === 'ArrowLeft' && prevItem && zoomScale === 1) onNavigate(prevItem);
      if (e.key === 'ArrowRight' && nextItem && zoomScale === 1) onNavigate(nextItem);
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === '0') resetZoom();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, prevItem, nextItem, onClose, onNavigate, zoomScale, resetZoom, handleZoomIn, handleZoomOut]);

  if (!isOpen || !currentItem || !currentItem.public_url) return null;

  const formattedPos = formatPositionNumber(currentItem.position);
  const fileSizeKB = currentItem.file_size
    ? (currentItem.file_size / 1024).toFixed(1) + ' KB'
    : 'Desconocido';

  const handleCopy = async () => {
    showToast('Copiando imagen...', 'info');
    const res = await copyImageToClipboard(currentItem.public_url!);
    if (res.success) {
      onMarkCopied?.(currentItem.id);
    }
    showToast(res.message, res.success ? 'success' : 'error');
  };

  const handleDownload = async () => {
    const filename = generateDownloadFilename(project.name, currentItem.position);
    await downloadSingleImage(currentItem.public_url!, filename);
    showToast(`Descargando ${filename}`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-xl animate-fade-in text-white p-2 sm:p-4 select-none">
      {/* Botón Cerrar */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 sm:top-4 sm:right-4 z-50 p-2 sm:p-2.5 bg-slate-900/90 border border-slate-800 hover:bg-slate-800 rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer shadow-lg"
        aria-label="Cerrar visor"
      >
        <X className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      {/* Control Anterior */}
      {prevItem && (
        <button
          onClick={() => onNavigate(prevItem)}
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-50 p-2 sm:p-3 bg-slate-900/80 border border-slate-800 hover:bg-slate-800 rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer shadow-lg"
          aria-label="Fotografía anterior"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      )}

      {/* Control Siguiente */}
      {nextItem && (
        <button
          onClick={() => onNavigate(nextItem)}
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-50 p-2 sm:p-3 bg-slate-900/80 border border-slate-800 hover:bg-slate-800 rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer shadow-lg"
          aria-label="Siguiente fotografía"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      )}

      {/* Área Central: Imagen y Metadatos */}
      <div className="max-w-5xl w-full max-h-[94vh] flex flex-col items-center justify-between gap-2 sm:gap-3 px-2">
        {/* Header Metadatos y Barra de Controles de Zoom */}
        <div className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-900/90 border border-slate-800/80 rounded-xl sm:rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-xs sm:text-sm bg-sky-600 px-2.5 py-0.5 sm:py-1 rounded-lg text-white">
              #{formattedPos}
            </span>
            <span className="text-xs sm:text-sm font-semibold text-slate-300 truncate max-w-[120px] sm:max-w-[200px]">
              {currentItem.original_filename || `Foto-${formattedPos}`}
            </span>
          </div>

          {/* BARRA DE ZOOM INTERACTIVO */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-700/80 px-2 py-1 rounded-xl shadow-inner">
            <button
              onClick={handleZoomOut}
              disabled={zoomScale <= 1}
              className="p-1 text-slate-300 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800 transition-colors cursor-pointer"
              title="Alejar zoom (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <button
              onClick={handleToggleZoom}
              className="font-mono text-xs font-bold text-sky-400 hover:text-sky-300 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
              title="Doble clic o clic aquí para ampliar / restablecer"
            >
              {Math.round(zoomScale * 100)}%
            </button>

            <button
              onClick={handleZoomIn}
              disabled={zoomScale >= 4}
              className="p-1 text-slate-300 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800 transition-colors cursor-pointer"
              title="Acercar zoom (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            {zoomScale > 1 && (
              <button
                onClick={resetZoom}
                className="p-1 text-amber-400 hover:text-amber-300 rounded hover:bg-slate-800 transition-colors cursor-pointer ml-1"
                title="Restablecer a tamaño normal (0)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-slate-400">
            {currentItem.uploaded_at && (
              <div className="hidden sm:flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>{new Date(currentItem.uploaded_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}
            {currentItem.width && currentItem.height && (
              <div className="flex items-center gap-1">
                <Maximize2 className="w-3 h-3 text-slate-500" />
                <span>{currentItem.width}×{currentItem.height}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-slate-500" />
              <span>{fileSizeKB}</span>
            </div>
          </div>
        </div>

        {/* CONTENEDOR CON ZOOM Y PANEO INTERACTIVO */}
        <div
          ref={containerRef}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleToggleZoom}
          className={`relative flex-1 w-full flex items-center justify-center min-h-[50vh] max-h-[68vh] sm:max-h-[72vh] overflow-hidden py-1 touch-none select-none rounded-xl sm:rounded-2xl border border-slate-800 bg-black/40 ${
            zoomScale > 1
              ? isPanning
                ? 'cursor-grabbing'
                : 'cursor-grab'
              : 'cursor-zoom-in'
          }`}
          title={zoomScale > 1 ? 'Arrastra para moverte por la foto. Doble clic para 100%.' : 'Doble clic o rueda del mouse para ampliar letras.'}
        >
          <img
            src={currentItem.public_url}
            alt={`Fotografía ${formattedPos}`}
            draggable={false}
            style={{
              transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale})`,
              transition: isPanning ? 'none' : 'transform 0.15s ease-out',
            }}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl pointer-events-none"
          />

          {/* Guía visual sutil cuando está ampliada */}
          {zoomScale > 1 && (
            <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-sky-300 border border-slate-700/60 pointer-events-none shadow-md">
              Arrastra con el mouse para panear • Doble clic para 100%
            </div>
          )}
        </div>

        {/* Barra de Acciones */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 py-1.5 sm:py-2 px-3 sm:px-4 bg-slate-900 border border-slate-800 rounded-xl sm:rounded-2xl shadow-2xl">
          <Button
            size="sm"
            variant="primary"
            onClick={handleCopy}
            leftIcon={<Copy className="w-3.5 h-3.5" />}
            className="text-xs py-1.5"
          >
            Copiar
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleDownload}
            leftIcon={<Download className="w-3.5 h-3.5" />}
            className="text-xs py-1.5"
          >
            Descargar
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onClose();
              onReplaceItem(currentItem);
            }}
            leftIcon={<RefreshCw className="w-3.5 h-3.5 text-amber-400" />}
            className="text-xs py-1.5"
          >
            Reemplazar
          </Button>
        </div>
      </div>
    </div>
  );
}
