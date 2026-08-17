'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Project, ProjectItem } from '@/lib/types';
import { CameraCapture } from '@/components/camera/CameraCapture';
import { UploadQueueManager } from '@/components/camera/UploadQueueManager';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { normalizeProjectId } from '@/lib/utils/project';
import { ArrowLeft, Grid } from 'lucide-react';

function MobileCameraContent() {
  const router = useRouter();
  const routeParams = useParams();
  const rawProjectId = (routeParams?.id as string) || 'session-live-default';
  const projectId = useMemo(() => normalizeProjectId(rawProjectId), [rawProjectId]);

  const supabase = createClient();
  const searchParams = useSearchParams();
  const replaceItemId = searchParams?.get('replaceItemId');

  const [project, setProject] = useState<Project>(() => ({
    id: projectId,
    name: 'Mi Sesión FotoGrid en Vivo',
    pairing_code: 'FG-8888',
    next_position: 1,
    preferred_density: 12,
    status: 'active',
    expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived_at: null,
    owner_id: '00000000-0000-0000-0000-000000000000',
  }));

  const [replacementItem, setReplacementItem] = useState<ProjectItem | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProjectData() {
      try {
        const res = await fetch(`/api/projects?id=${rawProjectId}`);
        if (res.ok) {
          const json = await res.json();
          if (json.project && isMounted) {
            setProject(json.project);
          }
        }
      } catch (_err) {
        // Ignorar
      }

      // Si existe replaceItemId, cargar sus datos
      if (replaceItemId) {
        try {
          const { data: itemData } = await supabase
            .from('project_items')
            .select('*')
            .eq('id', replaceItemId)
            .maybeSingle();

          if (itemData && isMounted) setReplacementItem(itemData);
        } catch (_e) {
          // Ignorar
        }
      }
    }

    loadProjectData();
    return () => {
      isMounted = false;
    };
  }, [rawProjectId, projectId, replaceItemId, supabase]);

  const handleUploadSuccess = async () => {
    try {
      const res = await fetch(`/api/projects?id=${rawProjectId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.project) setProject(json.project);
      }
    } catch (_e) {
      // Ignorar
    }
    setReplacementItem(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-3 sm:p-4">
      {/* Header Móvil Adaptable */}
      <div className="w-full max-w-md flex items-center justify-between py-2 mb-3">
        <Link href={`/project/${rawProjectId}`}>
          <Button
            variant="ghost"
            size="sm"
            className="p-2 text-slate-400 hover:text-white"
            aria-label="Volver al visor"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>

        <span className="text-xs font-mono font-bold text-sky-400 bg-sky-950/70 border border-sky-800/60 px-3 py-1 rounded-full">
          Código: {project.pairing_code}
        </span>

        <button
          onClick={() => router.push(`/project/${rawProjectId}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-sky-400 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-all shadow-md"
        >
          <Grid className="w-4 h-4 text-sky-400" />
          <span>Ver Visor</span>
        </button>
      </div>

      {/* Administrador de Cola sin Conexión */}
      <UploadQueueManager
        projectId={projectId}
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

export default function MobileCameraPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={
        <div className="min-h-screen bg-slate-950 p-4 flex flex-col items-center justify-center">
          <Skeleton className="h-96 w-full max-w-md rounded-3xl" />
        </div>
      }>
        <MobileCameraContent />
      </Suspense>
    </ErrorBoundary>
  );
}
