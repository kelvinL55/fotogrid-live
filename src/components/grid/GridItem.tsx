'use client';

import React, { useState } from 'react';
import { ProjectItem, Project } from '@/lib/types';
import { formatPositionNumber, generateDownloadFilename, downloadSingleImage } from '@/lib/utils/download';
import { copyImageToClipboard } from '@/lib/utils/clipboard';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { APP_CONFIG } from '@/lib/config';
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
  Minimize2,
} from 'lucide-react';

interface GridItemProps {
  item: ProjectItem;
  project: Project;
  onOpenLightbox: (item: ProjectItem) => void;
  onReplaceItem: (item: ProjectItem) => void;
  onRefresh: () => void;
  isSelected?: boolean;
  isLatest?: boolean;
  onToggleSelect?: (item: ProjectItem) => void;
  isMultiSelectMode?: boolean;
}

export function GridItem({
  item,
  project,
  onOpenLightbox,
  onReplaceItem,
  onRefresh,
  isSelected = false,
  isLatest = false,
  onToggleSelect,
  isMultiSelectMode = false,
}: GridItemProps) {
  const supabase = createClient();
  const { showToast } = useToast();

  const [menuOpen, setMenuOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const formattedPos = formatPositionNumber(item.position);
  const isActive = item.status === 'active';
  const isEmpty = item.status === 'empty';
  const isUploading = item.status === 'uploading';
  const isFailed = item.status === 'failed';

  // Copiar imagen al portapapeles
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!item.public_url) return;

    showToast('Copiando imagen al portapapeles...', 'info');
    const res = await copyImageToClipboard(item.public_url);
    showToast(res.message, res.success ? 'success' : 'error');
  };

  // Descargar imagen individual con ceros a la izquierda
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!item.public_url) return;

    try {
      const filename = generateDownloadFilename(project.name, item.position);
      await downloadSingleImage(item.public_url, filename);
      showToast(`Descargando ${filename}`, 'success');
    } catch (err: any) {
      showToast('Error al descargar la imagen.', 'error');
    }
  };

  // Opción A: Eliminar dejando casilla vacía
  const handleDeleteLeaveEmpty = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setActionLoading(true);

    try {
      // 1. Eliminar de Storage si existe
      if (item.storage_path) {
        await supabase.storage.from(APP_CONFIG.storage.bucketName).remove([item.storage_path]);
      }

      // 2. Cambiar registro en Postgres a 'empty'
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

      showToast(`Casilla #${item.position} vaciada. La posición se conserva.`, 'success');
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
      // 1. Eliminar archivo de Storage
      if (item.storage_path) {
        await supabase.storage.from(APP_CONFIG.storage.bucketName).remove([item.storage_path]);
      }

      // 2. Eliminar fila de la base de datos
      const { error: delError } = await supabase.from('project_items').delete().eq('id', item.id);
      if (delError) throw delError;

      // 3. Invocar RPC SQL transaccional para compactar
      const { error: rpcError } = await supabase.rpc('compact_project_positions', {
        p_project_id: project.id,
      });

      if (rpcError) throw rpcError;

      showToast(`Fotografía eliminada y cuadrícula compactada secuencialmente.`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Error al compactar posiciones.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent) => {
    if (!item.public_url) return;
    e.dataTransfer.setData('text/uri-list', item.public_url);
    e.dataTransfer.setData('text/plain', item.public_url);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      draggable={isActive && Boolean(item.public_url)}
      onDragStart={handleDragStart}
      onClick={() => {
        if (isMultiSelectMode && onToggleSelect) {
          onToggleSelect(item);
        } else if (isActive && item.public_url) {
          onOpenLightbox(item);
        } else if (isEmpty) {
          onReplaceItem(item);
        }
      }}
      className={`group relative aspect-square bg-slate-900 border rounded-2xl overflow-hidden shadow-md transition-all duration-200 select-none cursor-pointer flex flex-col justify-between p-2.5 ${
        isSelected
          ? 'border-sky-500 ring-2 ring-sky-500/50 bg-sky-950/20'
          : isLatest
          ? 'border-emerald-400 ring-4 ring-emerald-400/40 shadow-emerald-500/30 animate-pulse bg-emerald-950/20'
          : isEmpty
          ? 'border-dashed border-slate-800 hover:border-slate-600 bg-slate-950/40'
          : 'border-slate-800 hover:border-slate-700 hover:shadow-xl'
      }`}
    >
      {/* Insignia de Posición Cronológica */}
      <div className="flex items-center justify-between z-10">
        <span className="font-mono font-bold text-xs bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded-lg border border-slate-800 text-sky-400">
          #{formattedPos}
        </span>

        {/* Checkbox Selección Múltiple */}
        {isMultiSelectMode && onToggleSelect && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(item);
            }}
            className="text-sky-400 hover:text-sky-300 p-0.5"
            aria-label="Seleccionar casilla"
          >
            {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-slate-500" />}
          </button>
        )}

        {/* Botón de Menú de Acciones */}
        {!isMultiSelectMode && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="p-1 rounded-lg bg-slate-950/80 backdrop-blur-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Menú de opciones de casilla"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-7 z-30 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1 text-xs text-slate-200 animate-fade-in"
              >
                {isActive && (
                  <>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenLightbox(item);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2"
                    >
                      <Eye className="w-3.5 h-3.5 text-sky-400" />
                      Ver imagen grande
                    </button>

                    <button
                      onClick={handleCopy}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5 text-emerald-400" />
                      Copiar imagen
                    </button>

                    <button
                      onClick={handleDownload}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5 text-indigo-400" />
                      Descargar original
                    </button>

                    <div className="my-1 border-t border-slate-800"></div>
                  </>
                )}

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onReplaceItem(item);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2 text-amber-300"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {isEmpty ? 'Ocupar con foto' : 'Reemplazar foto'}
                </button>

                {isActive && (
                  <button
                    onClick={handleDeleteLeaveEmpty}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2 text-rose-300"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Dejar espacio vacío
                  </button>
                )}

                <button
                  onClick={handleDeleteAndCompact}
                  className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2 text-rose-400"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  Compactar cuadrícula
                </button>
              </div>
            )}
          </div>
        )}
      </div>

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
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : isUploading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-sky-950/20">
          <Loader2 className="w-6 h-6 text-sky-400 animate-spin mb-1" />
          <span className="text-[10px] text-sky-300 font-medium">Subiendo foto...</span>
        </div>
      ) : isFailed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-rose-950/20">
          <AlertCircle className="w-6 h-6 text-rose-400 mb-1" />
          <span className="text-[10px] text-rose-300 font-medium">Error al subir</span>
        </div>
      ) : (
        /* ESTADO VACÍO (ESPERANDO REEMPLAZO O SIGUIENTE CAPTURA) */
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 hover:text-sky-400 transition-colors p-2 text-center">
          <PlusCircle className="w-7 h-7 mb-1" />
          <span className="text-[11px] font-semibold">Espacio Vacío</span>
          <span className="text-[9px] text-slate-500">Clic para rellenar</span>
        </div>
      )}

      {/* Overlay inferior con timestamp */}
      {isActive && item.uploaded_at && (
        <div className="z-10 bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] text-slate-400 self-start border border-slate-800">
          {new Date(item.uploaded_at).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      )}
    </div>
  );
}
