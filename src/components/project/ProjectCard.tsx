'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Project } from '@/lib/types';
import { ExpirationBadge } from './ExpirationBadge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { APP_CONFIG } from '@/lib/config';
import {
  Grid,
  Camera,
  QrCode,
  Trash2,
  Archive,
  RefreshCw,
  Calendar,
  Layers,
  AlertOctagon,
} from 'lucide-react';

interface ProjectCardProps {
  project: Project;
  onOpenQR: (project: Project) => void;
  onRefresh: () => void;
}

export function ProjectCard({ project, onOpenQR, onRefresh }: ProjectCardProps) {
  const supabase = createClient();
  const { showToast } = useToast();

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isArchived = project.status === 'archived';
  const createdAtFormatted = new Date(project.created_at).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const handleArchiveToggle = async () => {
    const newStatus = isArchived ? 'active' : 'archived';
    const archivedAt = newStatus === 'archived' ? new Date().toISOString() : null;

    // Actualizar en localStorage
    if (typeof window !== 'undefined') {
      const demoProjects: Project[] = JSON.parse(localStorage.getItem('demo_projects') || '[]');
      const pIndex = demoProjects.findIndex((p) => p.id === project.id);
      if (pIndex >= 0) {
        demoProjects[pIndex].status = newStatus;
        demoProjects[pIndex].archived_at = archivedAt;
        localStorage.setItem('demo_projects', JSON.stringify(demoProjects));
      }
    }

    // Actualizar en Supabase
    try {
      await supabase
        .from('projects')
        .update({
          status: newStatus,
          archived_at: archivedAt,
        })
        .eq('id', project.id);
    } catch (_err) {
      // Ignorar
    }

    showToast(
      isArchived ? 'Proyecto restaurado correctamente.' : 'Proyecto archivado.',
      'success'
    );
    onRefresh();
  };

  const handleHardDelete = async () => {
    setDeleting(true);

    try {
      // 1. Eliminar a través de la API centralizada
      try {
        await fetch(`/api/projects?id=${project.id}`, { method: 'DELETE' });
      } catch (_apiErr) {
        // Ignorar
      }

      // 2. Eliminar de localStorage (demo_projects) y demo_items
      if (typeof window !== 'undefined') {
        const demoProjects: Project[] = JSON.parse(localStorage.getItem('demo_projects') || '[]');
        const filteredProjects = demoProjects.filter((p) => p.id !== project.id);
        localStorage.setItem('demo_projects', JSON.stringify(filteredProjects));
        localStorage.removeItem(`demo_items_${project.id}`);
        window.dispatchEvent(new Event('storage'));
      }

      // 3. Eliminar de Supabase Storage & DB directamente
      try {
        const { data: items } = await supabase
          .from('project_items')
          .select('storage_path')
          .eq('project_id', project.id);

        if (items && items.length > 0) {
          const pathsToDelete = items
            .map((i) => i.storage_path)
            .filter((p): p is string => Boolean(p));

          if (pathsToDelete.length > 0) {
            await supabase.storage.from(APP_CONFIG.storage.bucketName).remove(pathsToDelete);
          }
        }
        await supabase.from('project_items').delete().eq('project_id', project.id);
        await supabase.from('projects').delete().eq('id', project.id);
      } catch (_dbErr) {
        // Ignorar
      }

      showToast(`Proyecto "${project.name}" eliminado correctamente.`, 'success');
      setDeleteModalOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast(`Proyecto "${project.name}" eliminado.`, 'success');
      setDeleteModalOpen(false);
      onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between hover:border-slate-700 transition-all group">
        <div>
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="text-lg font-bold text-white tracking-tight group-hover:text-sky-400 transition-colors">
              {project.name}
            </h3>
            <ExpirationBadge expiresAt={project.expires_at} />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mb-6">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>{createdAtFormatted}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>Siguiente casilla: #{project.next_position}</span>
            </div>
            <div className="font-mono bg-slate-950 px-2 py-0.5 rounded text-sky-400 border border-slate-800">
              {project.pairing_code}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link href={`/project/${project.id}`}>
              <Button size="sm" variant="primary" leftIcon={<Grid className="w-4 h-4" />}>
                Abrir Visor
              </Button>
            </Link>

            <Link href={`/project/${project.id}/camera`}>
              <Button size="sm" variant="secondary" leftIcon={<Camera className="w-4 h-4" />}>
                Cámara
              </Button>
            </Link>

            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenQR(project)}
              className="p-2"
              title="Mostrar Código QR para teléfono"
              aria-label="Mostrar Código QR"
            >
              <QrCode className="w-4 h-4 text-sky-400" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleArchiveToggle}
              className="p-2 text-slate-400 hover:text-white"
              title={isArchived ? 'Restaurar proyecto' : 'Archivar proyecto'}
              aria-label={isArchived ? 'Restaurar proyecto' : 'Archivar proyecto'}
            >
              {isArchived ? (
                <RefreshCw className="w-4 h-4 text-emerald-400" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteModalOpen(true)}
              className="p-2 text-slate-400 hover:text-rose-400"
              title="Eliminar proyecto definitivamente"
              aria-label="Eliminar proyecto"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* DIÁLOGO DE CONFIRMACIÓN DE ELIMINACIÓN */}
      <Dialog
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirmar Eliminación"
        description={`¿Estás seguro de que deseas eliminar permanentemente el proyecto "${project.name}"?`}
      >
        <div className="space-y-4 pt-2">
          <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl flex items-start gap-3 text-rose-200 text-sm">
            <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <span>
              Esta acción eliminará el proyecto y todas sus imágenes asociadas. No se podrá deshacer.
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>
              Cancelar
            </Button>

            <Button
              variant="danger"
              isLoading={deleting}
              onClick={handleHardDelete}
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              Eliminar Definitivamente
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
