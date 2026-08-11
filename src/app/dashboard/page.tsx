'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Project } from '@/lib/types';
import { ProjectCard } from '@/components/project/ProjectCard';
import { CreateProjectModal } from '@/components/project/CreateProjectModal';
import { QRCodeModal } from '@/components/project/QRCodeModal';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { APP_CONFIG } from '@/lib/config';
import {
  FolderPlus,
  Camera,
  Layers,
  Archive,
  RefreshCw,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

export default function DashboardPage() {
  const supabase = createClient();
  const { showToast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'archived'>('active');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedQRProject, setSelectedQRProject] = useState<Project | null>(null);
  const [cleaningExpired, setCleaningExpired] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    let supabaseProjects: Project[] = [];

    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        supabaseProjects = data;
      }
    } catch (_err) {
      // Ignorar error de red
    }

    // Unir con proyectos locales
    const localDemoProjects: Project[] = JSON.parse(
      (typeof window !== 'undefined' && localStorage.getItem('demo_projects')) || '[]'
    );

    let allProjects = [...supabaseProjects, ...localDemoProjects];

    // Si no hay ningún proyecto creado aún, crear uno automáticamente por defecto para acceso instantáneo
    if (allProjects.length === 0 && typeof window !== 'undefined') {
      const defaultProject: Project = {
        id: 'session-live-default',
        name: 'Mi Sesión FotoGrid en Vivo',
        pairing_code: 'FG-8888',
        status: 'active',
        created_at: new Date('2026-01-01').toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: null,
        archived_at: null,
        owner_id: 'public-user',
        preferred_density: 12,
        next_position: 1,
      };
      localStorage.setItem('demo_projects', JSON.stringify([defaultProject]));
      allProjects = [defaultProject];
    }

    setProjects(allProjects);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCleanupExpiredProjects = async () => {
    setCleaningExpired(true);
    try {
      const res = await fetch('/api/cron/cleanup');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al ejecutar limpieza.');
      showToast(data.message || 'Limpieza ejecutada.', 'success');
      fetchProjects();
    } catch (err: any) {
      showToast(err.message || 'Fallo durante la limpieza.', 'error');
    } finally {
      setCleaningExpired(false);
    }
  };

  const filteredProjects = projects.filter((p) => p.status === filter);
  const expiredCount = projects.filter(
    (p) => p.expires_at && new Date(p.expires_at) <= new Date()
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header Superior */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-sky-500/10 border border-sky-500/30 rounded-xl flex items-center justify-center text-sky-400">
              <Camera className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg text-white tracking-tight">
              {APP_CONFIG.name}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={() => setCreateModalOpen(true)}
              leftIcon={<FolderPlus className="w-4 h-4" />}
            >
              Nuevo Proyecto
            </Button>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {expiredCount > 0 && (
          <div className="mb-6 p-4 bg-amber-950/40 border border-amber-800/80 rounded-2xl flex items-center justify-between gap-4 text-amber-200">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <span className="text-sm">
                Tienes <strong>{expiredCount}</strong> proyecto(s) vencido(s) pendiente(s) de limpieza.
              </span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              isLoading={cleaningExpired}
              onClick={handleCleanupExpiredProjects}
              leftIcon={<Trash2 className="w-3.5 h-3.5 text-amber-400" />}
            >
              Limpiar Proyectos Vencidos
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between mb-8 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter('active')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                filter === 'active'
                  ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              Proyectos Activos (
              {projects.filter((p) => p.status === 'active').length})
            </button>

            <button
              onClick={() => setFilter('archived')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                filter === 'archived'
                  ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Archive className="w-4 h-4" />
              Archivados (
              {projects.filter((p) => p.status === 'archived').length})
            </button>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={fetchProjects}
            className="text-slate-400 hover:text-white"
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Actualizar
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full rounded-2xl" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl text-center my-12">
            <div className="w-16 h-16 rounded-full bg-slate-800/60 flex items-center justify-center mb-4 text-slate-500">
              <Layers className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white mb-1">
              {filter === 'active'
                ? 'No tienes proyectos activos'
                : 'No tienes proyectos archivados'}
            </h3>
            <p className="text-sm text-slate-400 max-w-sm mb-6">
              Crea tu primer proyecto para empezar a tomar y sincronizar fotografías con tu teléfono móvil.
            </p>
            {filter === 'active' && (
              <Button
                variant="primary"
                onClick={() => setCreateModalOpen(true)}
                leftIcon={<FolderPlus className="w-4 h-4" />}
              >
                Crear Mi Primer Proyecto
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpenQR={setSelectedQRProject}
                onRefresh={fetchProjects}
              />
            ))}
          </div>
        )}
      </main>

      <CreateProjectModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={fetchProjects}
      />

      <QRCodeModal
        isOpen={Boolean(selectedQRProject)}
        onClose={() => setSelectedQRProject(null)}
        project={selectedQRProject}
      />
    </div>
  );
}
