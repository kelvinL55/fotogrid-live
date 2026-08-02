'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Project, ProjectItem } from '@/lib/types';
import { CameraCapture } from '@/components/camera/CameraCapture';
import { UploadQueueManager } from '@/components/camera/UploadQueueManager';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ArrowLeft, Grid } from 'lucide-react';

export default function MobileCameraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;

  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const replaceItemId = searchParams.get('replaceItemId');
  const { showToast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [replacementItem, setReplacementItem] = useState<ProjectItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProjectData() {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single();

        if (error || !data) {
          showToast('Proyecto no encontrado.', 'error');
          router.push('/dashboard');
          return;
        }

        setProject(data);

        // Si existe replaceItemId, cargar sus datos
        if (replaceItemId) {
          const { data: itemData } = await supabase
            .from('project_items')
            .select('*')
            .eq('id', replaceItemId)
            .single();

          if (itemData) setReplacementItem(itemData);
        }
      } catch (err: any) {
        showToast('Error al cargar la cámara.', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadProjectData();
  }, [projectId, replaceItemId, supabase, router, showToast]);

  const handleUploadSuccess = async () => {
    // Recargar datos del proyecto para actualizar contador next_position
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (data) setProject(data);
    setReplacementItem(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center justify-center gap-6">
        <Skeleton className="h-12 w-full max-w-md rounded-xl" />
        <Skeleton className="h-96 w-full max-w-md rounded-3xl" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-4">
      {/* Header Móvil */}
      <div className="w-full max-w-md flex items-center justify-between py-3 mb-4">
        <Link href={`/project/${project.id}`}>
          <Button
            variant="ghost"
            size="sm"
            className="p-2 text-slate-400 hover:text-white"
            aria-label="Volver a la cuadrícula del visor"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>

        <span className="text-xs font-mono font-bold text-sky-400 bg-sky-950/60 border border-sky-800/60 px-3 py-1 rounded-full">
          Código: {project.pairing_code}
        </span>

        <Link href={`/project/${project.id}`}>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Grid className="w-4 h-4 text-sky-400" />}
          >
            Visor
          </Button>
        </Link>
      </div>

      {/* Administrador de Cola sin Conexión */}
      <UploadQueueManager
        projectId={project.id}
        onQueueEmpty={handleUploadSuccess}
      />

      {/* Componente Principal de Captura Móvil */}
      <CameraCapture
        project={project}
        onUploadSuccess={handleUploadSuccess}
        replacementTargetItem={replacementItem}
        onCancelReplacement={() => setReplacementItem(null)}
      />
    </div>
  );
}
