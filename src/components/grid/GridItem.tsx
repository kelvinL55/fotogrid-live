'use client';

import React, { useState, useRef } from 'react';
import { ProjectItem, Project, GridDensity } from '@/lib/types';
import { formatPositionNumber, generateDownloadFilename, downloadSingleImage } from '@/lib/utils/download';
import { copyImageToClipboard } from '@/lib/utils/clipboard';
import { setupMultiImageDrag } from '@/lib/utils/dragDrop';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { APP_CONFIG } from '@/lib/config';
import { removeLocalProjectItem } from '@/lib/utils/itemStorage';
import {
  MoreVertical,
  Copy,
  Download,
  Trash2,
  RefreshCw,
  Eye,
  Loader2,
  AlertCircle,
  PlusCircle,
  CheckSquare,
  Square,
  CheckCheck,
  RotateCcw,
  Check,
} from 'lucide-react';

interface GridItemProps {
  item: ProjectItem;
  project: Project;
  density?: GridDensity;
  onOpenLightbox: (item: ProjectItem) => void;
  onReplaceItem: (item: ProjectItem) => void;
  onRefresh: () => void;
  isSelected?: boolean;
  isLatest?: boolean;
  isCopied?: boolean;
  onToggleSelect?: (item: ProjectItem) => void;
  onToggleCopied?: (itemId: string) => void;
  onMarkCopied?: (itemIds: string | string[]) => void;
  selectedItems?: ProjectItem[];
  isMultiSelectMode?: boolean;
}

export function GridItem({
  item,
  project,
  density = 'auto',
  onOpenLightbox,
  onReplaceItem,
  onRefresh,
  isSelected = false,
  isLatest = false,
  isCopied = false,
  onToggleSelect,
  onToggleCopied,
  onMarkCopied,
  selectedItems = [],
  isMultiSelectMode = false,
}: GridItemProps) {
  const supabase = createClient();
  const { showToast } = useToast();

  const [menuOpen, setMenuOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [copiedRecently, setCopiedRecently] = useState(false);
  const draggedItemsRef = useRef<ProjectItem[]>([]);

  const isDenseGrid = density === 20;
  const formattedPos = formatPositionNumber(item?.position ?? 0);
  const isActive = item?.status === 'active';
  const isEmpty = item?.status === 'empty';
  const isUploading = item?.status === 'uploading';
  const isFailed = item?.status === 'failed';

  // Copiar imagen al portapapeles
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!item?.public_url) return;

    const res = await copyImageToClipboard(item.public_url);
    if (res.success) {
      setCopiedRecently(true);
      setTimeout(() => setCopiedRecently(false), 1500);
      onMarkCopied?.(item.id);
      showToast(res.message, 'success');
    } else {
      showToast(res.message, 'error');
    }
  };

  // Descargar imagen individual
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!item?.public_url) return;

    try {
      const filename = generateDownloadFilename(project?.name || 'FotoGrid', item.position ?? 1);
      await downloadSingleImage(item.public_url, filename);
      showToast(`Descargando ${filename}`, 'success');
    } catch (_err) {
      showToast('Error al descargar la imagen.', 'error');
    }
  };

  // Opción A: Eliminar dejando casilla vacía
  const handleDeleteLeaveEmpty = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setActionLoading(true);

    try {
      if (item.storage_path) {
        try {
          await supabase.storage.from(APP_CONFIG.storage.bucketName).remove([item.storage_path]);
        } catch (_e) {}
      }

      const { error } = await supabase
        .from('project_items')
        .update({
          status: 'empty',
          storage_path: null,
          original_filename: null,
          mime_type: null,
          file_size: null,
          width: null,
          height: null,
        })
        .eq('id', item.id);

      if (error) throw error;

      // Limpiar de localStorage para evitar que la foto reviva
      removeLocalProjectItem(project.id, item.id, item.position);

      showToast(`Casilla #${item.position} vaciada.`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Error al vaciar la casilla.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Opción C: Eliminar y compactar posiciones de la cuadrícula
  const handleDeleteAndCompact = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setActionLoading(true);

    try {
      if (item.storage_path) {
        try {
          await supabase.storage.from(APP_CONFIG.storage.bucketName).remove([item.storage_path]);
        } catch (_e) {}
      }

      await supabase.from('project_items').delete().eq('id', item.id);

      // Limpiar de localStorage para evitar que la foto reviva
      removeLocalProjectItem(project.id, item.id, item.position);

      await fetch(`/api/projects/compact?projectId=${project.id}`, {
        method: 'POST',
      });

      showToast(`Fotografía eliminada y cuadrícula compactada.`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Error al compactar posiciones.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!item?.public_url) return;

    // Configurar payload de multi-drag o single drag
    const draggedItems = setupMultiImageDrag({
      event: e,
      targetItem: item,
      selectedItems,
      projectName: project?.name || 'FotoGrid',
    });

    draggedItemsRef.current = draggedItems;

    // Aviso informativo si la imagen (o alguna seleccionada) ya fue transferida previamente
    const hasCopiedItem = draggedItems.some((i) => (i.id === item.id ? isCopied : false));
    if (hasCopiedItem || isCopied) {
      showToast(
        draggedItems.length > 1
          ? 'Aviso: Algunas de las imágenes seleccionadas ya fueron transferidas previamente.'
          : 'Aviso: Esta imagen ya fue transferida previamente.',
        'info'
      );
    }
  };

  const handleDragEnd = (_e: React.DragEvent) => {
    // Al soltarse o transferirse a otra app externa, marcar como copiadas
    const dragged = draggedItemsRef.current;
    if (dragged.length > 0) {
      onMarkCopied?.(dragged.map((i) => i.id));
    }
    draggedItemsRef.current = [];
  };

  return (
    <div
      draggable={isActive && Boolean(item?.public_url)}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
      onClick={() => {
        if (isMultiSelectMode && onToggleSelect) {
          onToggleSelect(item);
        } else if (isActive && item?.public_url) {
          onOpenLightbox(item);
        } else if (isEmpty) {
          onReplaceItem(item);
        }
      }}
      className={`group relative aspect-square bg-slate-900 border rounded-xl sm:rounded-2xl transition-all duration-200 select-none cursor-pointer flex flex-col justify-between ${
        menuOpen ? 'overflow-visible z-30' : 'overflow-hidden shadow-md'
      } ${
        isDenseGrid ? 'p-1 sm:p-1.5' : 'p-2 sm:p-2.5'
      } ${
        isSelected
          ? 'border-sky-500 ring-2 ring-sky-500/50 bg-sky-950/20'
          : isLatest
          ? 'border-emerald-400 ring-2 sm:ring-4 ring-emerald-400/40 shadow-emerald-500/30 animate-pulse bg-emerald-950/20'
          : isCopied
          ? 'border-amber-500/70 hover:border-amber-400 shadow-amber-500/10 opacity-85 hover:opacity-100 bg-amber-950/10'
          : isEmpty
          ? 'border-dashed border-slate-800 hover:border-slate-600 bg-slate-950/40'
          : 'border-slate-800 hover:border-slate-700 hover:shadow-xl'
      }`}
    >
      {/* Insignia de Posición Cronológica y Badges en la parte superior */}
      <div className="flex items-start justify-between z-10 w-full gap-1">
        {/* Lado Izquierdo: Número de imagen y debajo el check de verificado */}
        <div className="flex flex-col items-start gap-0.5 sm:gap-1 shrink-0">
          <span
            className={`font-mono font-bold bg-slate-950/90 backdrop-blur-md border border-slate-800 text-sky-400 shrink-0 shadow-sm ${
              isDenseGrid
                ? 'text-[8px] sm:text-[9px] px-1 py-0.2 rounded'
                : 'text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg'
            }`}
          >
            #{formattedPos}
          </span>

          {/* Badge Interactivo de Ya Copiada / Verificada (Debajo del número) */}
          {isActive && isCopied && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCopied?.(item.id);
                showToast(`Marca de copiado removida (#${formattedPos})`, 'info');
              }}
              title="Imagen transferida previamente. Clic para desmarcar."
              className={`flex items-center gap-0.5 bg-amber-950/95 hover:bg-amber-900 text-amber-300 border border-amber-600/80 rounded-md transition-all shadow-md active:scale-95 shrink-0 ${
                isDenseGrid
                  ? 'p-0.5 text-[8px]'
                  : 'px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold'
              }`}
            >
              <CheckCheck className={`${isDenseGrid ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-amber-400 shrink-0`} />
              {!isDenseGrid && <span className="hidden xl:inline text-[9px]">Copiada</span>}
            </button>
          )}
        </div>

        {/* Lado Derecho: Checkbox Selección Múltiple o Botón de Copiar */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Checkbox Selección Múltiple */}
          {isMultiSelectMode && onToggleSelect ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(item);
              }}
              className="text-sky-400 hover:text-sky-300 p-0.5 bg-slate-950/85 rounded-md border border-slate-800"
              aria-label="Seleccionar casilla"
            >
              {isSelected ? <CheckSquare className="w-4 h-4 sm:w-5 sm:h-5" /> : <Square className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />}
            </button>
          ) : (
            /* Botón de Acción Principal: BOTÓN DIRECTO DE COPIAR (Siempre visible en Web y Móvil, y re-copiable) */
            <div className="relative shrink-0">
              {isActive && item.public_url ? (
                <button
                  onClick={handleCopy}
                  title="Copiar imagen al portapapeles para pegar en Gemini o DeepSeek (Ctrl+V)"
                  className={`rounded-md backdrop-blur-md transition-all active:scale-90 shrink-0 border z-10 cursor-pointer shadow-md flex items-center justify-center ${
                    isDenseGrid ? 'p-1' : 'p-1 sm:p-1.5'
                  } ${
                    copiedRecently
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-500/50 ring-2 ring-emerald-400/50'
                      : isCopied
                      ? 'bg-amber-950/90 text-amber-300 hover:text-white hover:bg-amber-600 border-amber-600/70 hover:border-amber-400'
                      : 'bg-slate-950/90 text-sky-400 hover:text-white hover:bg-sky-600 border-slate-700'
                  }`}
                  aria-label="Copiar imagen directamente"
                >
                  {copiedRecently ? (
                    <Check className={isDenseGrid ? 'w-2.5 h-2.5 text-white animate-bounce' : 'w-3.5 h-3.5 text-white animate-bounce'} />
                  ) : (
                    <Copy className={isDenseGrid ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
                  )}
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(true);
                  }}
                  className="p-1 rounded-md bg-slate-950/85 backdrop-blur-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label="Opciones de casilla"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL FLOTANTE DE OPCIONES (NUNCA SE RECORTA POR CELDAS NI BORDES) */}
      {menuOpen && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-72 max-w-[90vw] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 text-xs text-slate-200 animate-fade-in"
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <span className="font-bold text-white text-sm">Opciones Casilla #{formattedPos}</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              {isActive && (
                <>
                  <button
                    onClick={handleCopy}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 rounded-lg flex items-center gap-2.5 font-medium text-emerald-300 hover:text-emerald-200 transition-colors"
                  >
                    <Copy className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Copiar imagen (Gemini / DeepSeek)</span>
                  </button>

                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenLightbox(item);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 rounded-lg flex items-center gap-2.5 transition-colors"
                  >
                    <Eye className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Ver imagen en grande</span>
                  </button>

                  <button
                    onClick={handleDownload}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 rounded-lg flex items-center gap-2.5 transition-colors"
                  >
                    <Download className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Descargar imagen</span>
                  </button>

                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onToggleCopied?.(item.id);
                      showToast(isCopied ? 'Marca de copiado removida' : 'Marcada como copiada', 'info');
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 rounded-lg flex items-center gap-2.5 text-amber-400 transition-colors"
                  >
                    {isCopied ? <RotateCcw className="w-4 h-4 shrink-0" /> : <CheckCheck className="w-4 h-4 shrink-0" />}
                    <span>{isCopied ? 'Desmarcar como copiada' : 'Marcar como copiada'}</span>
                  </button>

                  <div className="my-1 border-t border-slate-800"></div>
                </>
              )}

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onReplaceItem(item);
                }}
                className="w-full px-3 py-2 text-left hover:bg-slate-800 rounded-lg flex items-center gap-2.5 text-amber-300 transition-colors"
              >
                <RefreshCw className="w-4 h-4 shrink-0" />
                <span>{isEmpty ? 'Ocupar con foto' : 'Reemplazar foto'}</span>
              </button>

              {isActive && (
                <button
                  onClick={handleDeleteLeaveEmpty}
                  className="w-full px-3 py-2 text-left hover:bg-slate-800 rounded-lg flex items-center gap-2.5 text-rose-300 transition-colors"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>Dejar casilla vacía</span>
                </button>
              )}

              <button
                onClick={handleDeleteAndCompact}
                className="w-full px-3 py-2 text-left hover:bg-slate-800 rounded-lg flex items-center gap-2.5 text-rose-400 transition-colors"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>
                  {isUploading || isFailed
                    ? 'Descartar foto / Eliminar casilla'
                    : 'Eliminar y compactar'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contenido Visual según el Estado de la Casilla */}
      {actionLoading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm z-20">
          <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
        </div>
      ) : isActive && item.public_url ? (
        <div className="absolute inset-0 w-full h-full">
          <img
            src={item.public_url}
            alt={`Fotografía ${formattedPos}`}
            loading="lazy"
            draggable={false}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none select-none"
          />
        </div>
      ) : isUploading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center bg-sky-950/20">
          <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-sky-400 animate-spin mb-1" />
          <span className="text-[9px] sm:text-[10px] text-sky-300 font-medium">Subiendo...</span>
        </div>
      ) : isFailed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center bg-rose-950/20">
          <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-rose-400 mb-1" />
          <span className="text-[9px] sm:text-[10px] text-rose-300 font-medium">Error</span>
        </div>
      ) : (
        /* ESTADO VACÍO */
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 hover:text-sky-400 transition-colors p-2 text-center">
          <PlusCircle className="w-6 h-6 sm:w-7 sm:h-7 mb-1" />
          <span className="text-[10px] sm:text-[11px] font-semibold">Vacío</span>
        </div>
      )}

      {/* Timestamp sutil solo en pantallas grandes con hover para que no tape la imagen */}
      {isActive && item.uploaded_at && (
        <div className="z-10 bg-slate-950/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] text-slate-400 self-start border border-slate-800/80 hidden lg:group-hover:block transition-opacity">
          {new Date(item.uploaded_at).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      )}
    </div>
  );
}

