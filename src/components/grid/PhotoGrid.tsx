'use client';

import React, { useState } from 'react';
import { Project, ProjectItem, GridDensity } from '@/lib/types';
import { useProjectRealtime } from '@/hooks/useProjectRealtime';
import { GridItem } from './GridItem';
import { DensitySelector } from './DensitySelector';
import { LightboxModal } from './LightboxModal';
import { MultiSelectToolbar } from './MultiSelectToolbar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
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
} from 'lucide-react';

interface PhotoGridProps {
  project: Project;
  onOpenMobileCamera: () => void;
  onReplaceItemTarget: (item: ProjectItem) => void;
}

export function PhotoGrid({ project, onOpenMobileCamera, onReplaceItemTarget }: PhotoGridProps) {
  const supabase = createClient();
  const { showToast } = useToast();

  const { items, loading, connectionState, refreshItems } = useProjectRealtime(project.id);

  const [density, setDensity] = useState<GridDensity>('auto');
  const [selectedLightboxItem, setSelectedLightboxItem] = useState<ProjectItem | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [compacting, setCompacting] = useState(false);

  // Mapear densidad a clases Tailwind para cuadrícula responsiva
  const getGridClass = () => {
    switch (density) {
      case 6:
        return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';
      case 10:
        return 'grid-cols-3 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10';
      case 15:
        return 'grid-cols-4 sm:grid-cols-8 md:grid-cols-12 lg:grid-cols-15';
      case 20:
        return 'grid-cols-5 sm:grid-cols-10 md:grid-cols-15 lg:grid-cols-20';
      case 'auto':
      default:
        return 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10 xl:grid-cols-12';
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
      const { error } = await supabase.rpc('compact_project_positions', {
        p_project_id: project.id,
      });

      if (error) throw error;

      showToast('Cuadrícula compactada secuencialmente.', 'success');
      refreshItems();
    } catch (err: any) {
      showToast(err.message || 'Error al compactar cuadrícula.', 'error');
    } fontally: {
      setCompacting(false);
    }
  };

  const selectedItems = items.filter((i) => selectedItemIds.includes(i.id));

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Barra de Control de la Cuadrícula */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <DensitySelector currentDensity={density} onChange={setDensity} />

          <Button
            size="sm"
            variant={isMultiSelectMode ? 'primary' : 'outline'}
            onClick={() => {
              setIsMultiSelectMode(!isMultiSelectMode);
              if (isMultiSelectMode) setSelectedItemIds([]);
            }}
            leftIcon={
              isMultiSelectMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />
            }
          >
            {isMultiSelectMode ? 'Cancelar Selección' : 'Selección Múltiple'}
          </Button>

          {isMultiSelectMode && (
            <Button size="sm" variant="ghost" onClick={handleSelectAll}>
              {selectedItemIds.length === items.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            isLoading={compacting}
            onClick={handleCompactGrid}
            className="text-slate-400 hover:text-white"
            leftIcon={<Minimize2 className="w-4 h-4" />}
            title="Eliminar casillas vacías y re-ordenar secuencialmente"
          >
            Compactar
          </Button>
        </div>

        {/* Indicador Realtime de Conexión */}
        <div className="flex items-center gap-2">
          {connectionState === 'connected' && (
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-950/80 border border-emerald-800/80 rounded-full text-xs text-emerald-300 font-medium">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>Realtime Activo</span>
            </div>
          )}
          {connectionState === 'reconnecting' && (
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-950/80 border border-amber-800/80 rounded-full text-xs text-amber-300 font-medium">
              <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              <span>Reconectando Realtime...</span>
            </div>
          )}
          {connectionState === 'disconnected' && (
            <div className="flex items-center gap-2 px-3 py-1 bg-rose-950/80 border border-rose-800/80 rounded-full text-xs text-rose-300 font-medium">
              <WifiOff className="w-3.5 h-3.5 text-rose-400" />
              <span>Sin conexión Realtime</span>
            </div>
          )}
        </div>
      </div>

      {/* Nota sutil sobre arrastre de imágenes */}
      <div className="flex items-center gap-2 px-4 py-2 bg-sky-950/30 border border-sky-900/40 rounded-xl text-xs text-sky-300">
        <Info className="w-4 h-4 text-sky-400 shrink-0" />
        <span>
          <strong>Tip de uso:</strong> Puedes arrastrar las miniaturas hacia otra app (como ChatGPT). Si tu navegador no acepta el arrastre directo, usa el botón <strong>Copiar imagen</strong> o <strong>Descargar</strong>.
        </span>
      </div>

      {/* Grid Contenedor Principal */}
      {loading ? (
        <div className={`grid ${getGridClass()} gap-3`}>
          {Array.from({ length: 12 }).map((_, idx) => (
            <Skeleton key={idx} className="aspect-square w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        /* ESTADO VACÍO CUANDO EL PROYECTO TIENE 0 FOTOGRAFÍAS */
        <div className="flex flex-col items-center justify-center p-12 bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl text-center my-8">
          <div className="w-16 h-16 rounded-full bg-slate-800/60 flex items-center justify-center mb-4 text-slate-500">
            <GridIcon className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">Aún no hay fotografías en este proyecto</h3>
          <p className="text-sm text-slate-400 max-w-md mb-6">
            Abre este proyecto desde tu teléfono móvil o toma tu primera captura para ver las imágenes aparecer aquí en tiempo real.
          </p>
          <Button variant="primary" onClick={onOpenMobileCamera}>
            Abrir Código QR Móvil
          </Button>
        </div>
      ) : (
        <div className={`grid ${getGridClass()} gap-3`}>
          {items.map((item) => (
            <GridItem
              key={item.id}
              item={item}
              project={project}
              onOpenLightbox={setSelectedLightboxItem}
              onReplaceItem={onReplaceItemTarget}
              onRefresh={refreshItems}
              isSelected={selectedItemIds.includes(item.id)}
              onToggleSelect={handleToggleSelect}
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
      />

      {/* Barra de Acciones de Selección Múltiple */}
      <MultiSelectToolbar
        selectedItems={selectedItems}
        project={project}
        onClearSelection={() => setSelectedItemIds([])}
        onRefresh={refreshItems}
      />
    </div>
  );
}
