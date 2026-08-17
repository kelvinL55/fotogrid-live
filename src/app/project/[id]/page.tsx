'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { Project, ProjectItem } from '@/lib/types';
import { PhotoGrid } from '@/components/grid/PhotoGrid';
import { QRCodeModal } from '@/components/project/QRCodeModal';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { normalizeProjectId } from '@/lib/utils/project';
import {
  ArrowLeft,
  Camera,
  QrCode,
  Smartphone,
  Copy,
  Check,
} from 'lucide-react';

export default function ProjectViewerPage() {
  const router = useRouter();
  const routeParams = useParams();
  const rawProjectId = (routeParams?.id as string) || 'session-live-default';
  const projectId = normalizeProjectId(rawProjectId);

  const { showToast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    async function loadProject() {
      let foundProject: Project | null = null;

      try {
        const res = await fetch(`/api/projects?id=${rawProjectId}`);
        if (res.ok) {
          const json = await res.json();
          if (json.project) foundProject = json.project;
        }
      } catch (_err) {
        // Ignorar fallo de red
      }

      // Si no se encontró en API, buscar en demo_projects en localStorage
      if (!foundProject && typeof window !== 'undefined') {
        const demoProjects: Project[] = JSON.parse(localStorage.getItem('demo_projects') || '[]');
        foundProject = demoProjects.find((p) => p.id === rawProjectId || p.id === projectId) || null;
      }

      if (!foundProject) {
        showToast('Proyecto no encontrado.', 'error');
        router.push('/dashboard');
        return;
      }

      setProject(foundProject);
      setLoading(false);
    }

    loadProject();
  }, [rawProjectId, projectId, router, showToast]);

  const handleCopyCode = () => {
    if (!project) return;
    navigator.clipboard.writeText(project.pairing_code);
    setCopiedCode(true);
    showToast('Código de vinculación copiado.', 'success');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleReplaceItemTarget = (item: ProjectItem) => {
    router.push(`/project/${rawProjectId}/camera?replaceItemId=${item.id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-4 sm:p-6 flex flex-col gap-6">
        <Skeleton className="h-16 sm:h-20 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative pb-20 sm:pb-8">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link href="/dashboard">
              <Button
                variant="ghost"
                size="sm"
                className="p-1.5 sm:p-2 text-slate-400 hover:text-white"
                aria-label="Volver al panel"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </Link>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-base sm:text-xl font-bold text-white tracking-tight truncate max-w-[140px] sm:max-w-xs md:max-w-md">
                  {project.name}
                </h1>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1 font-mono text-[10px] sm:text-xs px-2 py-0.5 rounded-lg bg-sky-950/60 border border-sky-800/60 text-sky-400 hover:bg-sky-900/60 transition-colors shrink-0"
                  title="Copiar código de vinculación"
                >
                  <Smartphone className="w-3 h-3" />
                  <span>{project.pairing_code}</span>
                  {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">
                Visor en vivo • Casilla siguiente: <strong>#{project.next_position}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setQrModalOpen(true)}
              leftIcon={<QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400" />}
              className="hidden sm:inline-flex text-xs"
            >
              Código QR
            </Button>

            <Link href={`/project/${rawProjectId}/camera`}>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                className="text-xs sm:text-sm font-semibold"
              >
                <span className="hidden sm:inline">Modo</span> Cámara
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <PhotoGrid
          project={project}
          onOpenMobileCamera={() => setQrModalOpen(true)}
          onReplaceItemTarget={handleReplaceItemTarget}
        />
      </main>

      {/* BOTÓN FLOTANTE (FAB) PARA MÓVIL: ACCESO INSTANTÁNEO A LA CÁMARA */}
      <div className="fixed bottom-4 right-4 z-40 sm:hidden animate-fade-in">
        <Link href={`/project/${rawProjectId}/camera`}>
          <button
            className="flex items-center gap-2 px-5 py-3.5 bg-gradient-to-r from-sky-500 to-sky-600 active:scale-95 text-white font-bold text-sm rounded-full shadow-2xl shadow-sky-500/50 border border-sky-300/40"
            aria-label="Abrir cámara móvil"
          >
            <Camera className="w-5 h-5 text-white animate-pulse" />
            <span>Tomar Foto</span>
          </button>
        </Link>
      </div>

      <QRCodeModal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        project={project}
      />
    </div>
  );
}
