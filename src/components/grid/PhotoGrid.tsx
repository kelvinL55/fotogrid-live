'use client';

import React, { useState, useEffect } from 'react';
import { Project, ProjectItem, GridDensity } from '@/lib/types';
import { useProjectRealtime } from '@/hooks/useProjectRealtime';
import { useCopiedItems } from '@/lib/hooks/useCopiedItems';
import { preloadItemsFiles, clearDragFileCache } from '@/lib/utils/dragDrop';
import { clearClipboardCache } from '@/lib/utils/clipboard';
import { clearLocalProject } from '@/lib/utils/itemStorage';
import { GridItem } from './GridItem';
import { DensitySelector } from './DensitySelector';
import { LightboxModal } from './LightboxModal';
import { MultiSelectToolbar } from './MultiSelectToolbar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Info,
  CheckSquare,
  Square,
  Grid as GridIcon,
  Minimize2,
  Camera,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';

interface PhotoGridProps {
  project: Project;
  onOpenMobileCamera: () => void;
  onReplaceItemTarget: (item: ProjectItem) => void;
  onItemsChange?: (items: ProjectItem[]) => void;
}

export function PhotoGrid({
  project,
  onOpenMobileCamera,
  onReplaceItemTarget,
  onItemsChange,
}: PhotoGridProps) {
  const { showToast } = useToast();

  const { items, loading, connectionState, latestPhotoId, refreshItems } = useProjectRealtime(project.id);
  const { isCopied, markAsCopied, unmarkAsCopied, clearAllCopied, copiedCount } = useCopiedItems(project.id);

  const [density, setDensity] = useState<GridDensity>('auto');
  const [selectedLightboxItem, setSelectedLightboxItem] = useState<ProjectItem | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Notificar al componente padre de la lista de ítems actualizada
  useEffect(() => {
    onItemsChange?.(items);
  }, [items, onItemsChange]);

  // Precargar en segundo plano los Files de las imágenes para que estén listas síncronamente al arrastrar
  useEffect(() => {
    if (items.length > 0) {
      preloadItemsFiles(items, project.name);
    }
  }, [items, project.name]);

  // Mapear densidad a clases Tailwind para cuadrícula responsiva móvil y escritorio
  const getGridClass = () => {
    switch (density) {
      case 6:
        return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';
      case 10:
        return 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10';
      case 15:
        return 'grid-cols-3 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-15';
      case 20:
        return 'grid-cols-3 sm:grid-cols-6 md:grid-cols-10 lg:grid-cols-20';
      case 'auto':
      default:
        return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-10 xl:grid-cols-12';
    }
  };

  const handleToggleSelect = (item: ProjectItem) => {
    setSelectedItemIds((prev) =>
      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
    );
  };

  const handleSelectAll = () => {
    if (selectedItemIds.length === items.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(items.map((i) => i.id));
    }
  };

  const handleCompactGrid = async () => {
    setCompacting(true);
    try {
      const res = await fetch(`/api/projects/compact?projectId=${project.id}`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al compactar cuadrícula');

      showToast('Cuadrícula compactada secuencialmente.', 'success');
      refreshItems();
    } catch (err: any) {
      showToast(err.message || 'Error al compactar cuadrícula.', 'error');
    } finally {
      setCompacting(false);
    }
  };

  const handleResetProject = async () => {
    setResetting(true);
    try {
      const res = await fetch(`/api/projects/reset?projectId=${project.id}`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al reiniciar cuadrícula');

      // Limpiar datos locales y caches para evitar que ninguna foto reviva
      clearLocalProject(project.id);
      clearDragFileCache();
      clearClipboardCache();
      clearAllCopied();
      setSelectedItemIds([]);
      setIsMultiSelectMode(false);
      setConfirmResetOpen(false);

      showToast('Cuadrícula vaciada. Lista para comenzar desde la casilla #1.', 'success');
      refreshItems();
    } catch (err: any) {
      showToast(err.message || 'Error al reiniciar la cuadrícula.', 'error');
    } finally {
      setResetting(false);
    }
  };

  const selectedItems = items.filter((i) => selectedItemIds.includes(i.id));

  return (
    <div className="w-full flex flex-col gap-2 sm:gap-4">
      {/* Barra de Control de la Cuadrícula Compacta */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-3 p-1.5 sm:p-2.5 md:p-3 bg-slate-900 border border-slate-800 rounded-lg sm:rounded-xl shadow-lg overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <DensitySelector currentDensity={density} onChange={setDensity} />

          <Button
            size="sm"
            variant={isMultiSelectMode ? 'primary' : 'outline'}
            onClick={() => {
              setIsMultiSelectMode(!isMultiSelectMode);
              if (isMultiSelectMode) setSelectedItemIds([]);
            }}
            leftIcon={
              isMultiSelectMode ? <CheckSquare className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <Square className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            }
            className="text-[11px] sm:text-xs py-1 px-2 sm:py-1.5 sm:px-3 h-7 sm:h-8 shrink-0"
          >
            {isMultiSelectMode ? 'Cancelar' : 'Selección'}
          </Button>

          {isMultiSelectMode && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSelectAll}
              className="text-[11px] sm:text-xs py-1 px-2 sm:py-1.5 sm:px-2.5 h-7 sm:h-8 shrink-0"
            >
              {selectedItemIds.length === items.length ? 'Deselec.' : 'Todos'}
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            isLoading={compacting}
            onClick={handleCompactGrid}
            className="text-slate-400 hover:text-white text-[11px] sm:text-xs py-1 px-2 sm:py-1.5 sm:px-2.5 h-7 sm:h-8 hidden md:inline-flex shrink-0"
            leftIcon={<Minimize2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
            title="Compactar posiciones secuencialmente"
          >
            Compactar
          </Button>

          {items.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmResetOpen(true)}
              className="text-rose-400 hover:text-rose-200 hover:bg-rose-950/40 text-[11px] sm:text-xs py-1 px-2 sm:py-1.5 sm:px-2.5 h-7 sm:h-8 shrink-0"
              leftIcon={<Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-400" />}
              title="Vaciar todas las fotos y comenzar de nuevo desde la casilla #1"
            >
              Vaciar Cuadrícula
            </Button>
          )}

          {/* Botón para limpiar marcas de copiado si existen */}
          {copiedCount > 0 && (
            <button
              onClick={() => {
                clearAllCopied();
                showToast('Marcas de copiado eliminadas.', 'info');
              }}
              title="Limpiar todas las marcas de imágenes copiadas en esta sesión"
              className="flex items-center gap-1 text-[10px] sm:text-xs text-amber-400 hover:text-amber-200 bg-amber-950/40 hover:bg-amber-950/80 border border-amber-800/60 px-2 py-1 rounded-lg transition-all active:scale-95 shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{copiedCount} transferida{copiedCount > 1 ? 's' : ''} (Limpiar)</span>
            </button>
          )}
        </div>

        {/* Indicador Realtime de Conexión */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto pl-1">
          {connectionState === 'connected' && (
            <div className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 bg-emerald-950/80 border border-emerald-800/80 rounded-full text-[10px] sm:text-xs text-emerald-300 font-medium shadow-sm shrink-0">
              <Wifi className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-emerald-400 animate-pulse" />
              <span>En Vivo</span>
            </div>
          )}
          {connectionState === 'reconnecting' && (
            <div className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 bg-amber-950/80 border border-amber-800/80 rounded-full text-[10px] sm:text-xs text-amber-300 font-medium shrink-0">
              <RefreshCw className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-amber-400 animate-spin" />
              <span>Reconectando</span>
            </div>
          )}
          {connectionState === 'disconnected' && (
            <div className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 bg-rose-950/80 border border-rose-800/80 rounded-full text-[10px] sm:text-xs text-rose-300 font-medium shrink-0">
              <WifiOff className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-rose-400" />
              <span>Desconectado</span>
            </div>
          )}
        </div>
      </div>

      {/* Nota informativa en escritorio - Oculta en pantallas compactas para maximizar el visor del grid */}
      <div className="hidden md:flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-sky-950/30 border border-sky-900/40 rounded-xl text-xs text-sky-300">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-sky-400 shrink-0" />
          <span>
            Las fotos tomadas aparecen automáticamente aquí en tiempo real. Puedes arrastrar una o varias fotos directamente hacia ChatGPT u otras aplicaciones.
          </span>
        </div>

        <button
          onClick={onOpenMobileCamera}
          className="text-sky-400 hover:text-sky-200 font-semibold underline shrink-0 ml-1"
        >
          Código QR
        </button>
      </div>

      {/* Grid Contenedor Principal */}
      {loading ? (
        <div className={`grid ${getGridClass()} gap-2 sm:gap-3`}>
          {Array.from({ length: 8 }).map((_, idx) => (
            <Skeleton key={idx} className="aspect-square w-full rounded-xl sm:rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        /* ESTADO VACÍO */
        <div className="flex flex-col items-center justify-center p-8 sm:p-12 bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl sm:rounded-3xl text-center my-4 sm:my-8">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-800/60 flex items-center justify-center mb-3 sm:mb-4 text-slate-500">
            <GridIcon className="w-7 h-7 sm:w-8 sm:h-8 text-sky-400" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-white mb-1">Aún no hay fotos en esta sesión</h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-5">
            Abre el modo cámara para empezar a capturar y ver las fotos en tiempo real.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href={`/project/${project.id}/camera`}>
              <Button variant="primary" leftIcon={<Camera className="w-4 h-4" />}>
                Abrir Modo Cámara
              </Button>
            </Link>
            <Button variant="outline" onClick={onOpenMobileCamera}>
              Escanear QR con Teléfono
            </Button>
          </div>
        </div>
      ) : (
        <div className={`grid ${getGridClass()} ${density === 20 ? 'gap-1 sm:gap-1.5' : density === 15 ? 'gap-1.5 sm:gap-2' : 'gap-2 sm:gap-3'}`}>
          {items.map((item) => (
            <GridItem
              key={item.id}
              item={item}
              project={project}
              density={density}
              onOpenLightbox={setSelectedLightboxItem}
              onReplaceItem={onReplaceItemTarget}
              onRefresh={refreshItems}
              isSelected={selectedItemIds.includes(item.id)}
              isLatest={latestPhotoId === item.id}
              isCopied={isCopied(item.id)}
              onToggleSelect={handleToggleSelect}
              onToggleCopied={(id) => (isCopied(id) ? unmarkAsCopied(id) : markAsCopied(id))}
              onMarkCopied={markAsCopied}
              selectedItems={selectedItems}
              isMultiSelectMode={isMultiSelectMode}
            />
          ))}
        </div>
      )}

      {/* Visor Modal Lightbox */}
      <LightboxModal
        isOpen={Boolean(selectedLightboxItem)}
        onClose={() => setSelectedLightboxItem(null)}
        currentItem={selectedLightboxItem}
        items={items}
        project={project}
        onNavigate={setSelectedLightboxItem}
        onReplaceItem={onReplaceItemTarget}
        onRefresh={refreshItems}
        onMarkCopied={markAsCopied}
      />

      {/* Barra de Acciones de Selección Múltiple */}
      <MultiSelectToolbar
        selectedItems={selectedItems}
        project={project}
        onClearSelection={() => setSelectedItemIds([])}
        onRefresh={refreshItems}
      />

      {/* Modal de Confirmación para Vaciar y Reiniciar Cuadrícula */}
      <Dialog
        isOpen={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        title="Vaciar Cuadrícula y Comenzar de Nuevo"
        description="Esta acción eliminará todas las fotografías del proyecto y reiniciará el visor para que la próxima foto comience en la casilla #1."
      >
        <div className="space-y-4 pt-2">
          <div className="p-3 bg-rose-950/30 border border-rose-900/50 rounded-xl text-xs text-rose-200">
            <p className="font-semibold mb-1">¿Estás seguro de que deseas vaciar este proyecto?</p>
            <p className="text-rose-300/80">
              Se eliminarán {items.length} fotografía{items.length !== 1 ? 's' : ''} y sus archivos almacenados. La cuadrícula quedará completamente limpia lista para una nueva sesión.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <Button variant="ghost" onClick={() => setConfirmResetOpen(false)}>
              Cancelar
            </Button>

            <Button
              variant="danger"
              isLoading={resetting}
              onClick={handleResetProject}
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              Vaciar Todo y Reiniciar a #1
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

