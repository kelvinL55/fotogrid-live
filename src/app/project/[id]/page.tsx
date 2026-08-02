'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Project, ProjectItem } from '@/lib/types';
import { PhotoGrid } from '@/components/grid/PhotoGrid';
import { QRCodeModal } from '@/components/project/QRCodeModal';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import {
  ArrowLeft,
  Camera,
  QrCode,
  Smartphone,
  Copy,
  Check,
} from 'lucide-react';

export default function ProjectViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;

  const supabase = createClient();
  const router = useRouter();
  const { showToast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    async function loadProject() {
      let foundProject: Project | null = null;

      try {
        const { data } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single();

        if (data) foundProject = data;
      } catch (_err) {
        // Ignorar error si no hay conexión
      }

      // Si no se encontró en Supabase, buscar en demo_projects en localStorage
      if (!foundProject && typeof window !== 'undefined') {
        const demoProjects: Project[] = JSON.parse(localStorage.getItem('demo_projects') || '[]');
        foundProject = demoProjects.find((p) => p.id === projectId) || null;
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
  }, [projectId, supabase, router, showToast]);

  const handleCopyCode = () => {
    if (!project) return;
    navigator.clipboard.writeText(project.pairing_code);
    setCopiedCode(true);
    showToast('Código de vinculación copiado.', 'success');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleReplaceItemTarget = (item: ProjectItem) => {
    router.push(`/project/${projectId}/camera?replaceItemId=${item.id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex flex-col gap-6">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button
                variant="ghost"
                size="sm"
                className="p-2 text-slate-400 hover:text-white"
                aria-label="Volver al panel"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">{project.name}</h1>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1 font-mono text-xs px-2.5 py-0.5 rounded-lg bg-sky-950/60 border border-sky-800/60 text-sky-400 hover:bg-sky-900/60 transition-colors"
                  title="Copiar código de vinculación"
                >
                  <Smartphone className="w-3 h-3" />
                  <span>{project.pairing_code}</span>
                  {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Visor en tiempo real • Siguiente casilla disponible: <strong>#{project.next_position}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => setQrModalOpen(true)}
              leftIcon={<QrCode className="w-4 h-4 text-sky-400" />}
            >
              Abrir en el Teléfono
            </Button>

            <Link href={`/project/${project.id}/camera`}>
              <Button variant="primary" leftIcon={<Camera className="w-4 h-4" />}>
                Modo Cámara
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PhotoGrid
          project={project}
          onOpenMobileCamera={() => setQrModalOpen(true)}
          onReplaceItemTarget={handleReplaceItemTarget}
        />
      </main>

      <QRCodeModal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        project={project}
      />
    </div>
  );
}
