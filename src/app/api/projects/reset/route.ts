import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeProjectId } from '@/lib/utils/project';
import { APP_CONFIG } from '@/lib/config';

function getSupabaseAdmin() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// POST /api/projects/reset?projectId=XYZ
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let rawId = searchParams.get('projectId');

    if (!rawId) {
      try {
        const body = await request.json();
        rawId = body.projectId;
      } catch (_e) {
        // No body
      }
    }

    if (!rawId) {
      return NextResponse.json({ error: 'projectId es requerido' }, { status: 400 });
    }

    const projectId = normalizeProjectId(rawId);
    const supabase = getSupabaseAdmin();

    // 1. Obtener todos los storage_path de los ítems existentes para eliminarlos de Storage
    const { data: items } = await supabase
      .from('project_items')
      .select('storage_path')
      .eq('project_id', projectId);

    const pathsToDelete = (items || [])
      .map((i) => i.storage_path)
      .filter((p): p is string => Boolean(p));

    if (pathsToDelete.length > 0) {
      try {
        await supabase.storage.from(APP_CONFIG.storage.bucketName).remove(pathsToDelete);
      } catch (storageErr) {
        console.warn('Error no bloqueante al eliminar archivos de Storage:', storageErr);
      }
    }

    // 2. Intentar listar y limpiar cualquier archivo residual en la carpeta del proyecto en Storage
    try {
      const { data: folderFiles } = await supabase.storage
        .from(APP_CONFIG.storage.bucketName)
        .list(`public/${projectId}`);

      if (folderFiles && folderFiles.length > 0) {
        const remainingPaths = folderFiles.map((f) => `public/${projectId}/${f.name}`);
        await supabase.storage.from(APP_CONFIG.storage.bucketName).remove(remainingPaths);
      }
    } catch (_e) {
      // Ignorar fallo al listar carpeta
    }

    // 3. Eliminar todos los registros de la tabla project_items para este proyecto
    const { error: deleteItemsErr } = await supabase
      .from('project_items')
      .delete()
      .eq('project_id', projectId);

    if (deleteItemsErr) {
      console.error('Error al eliminar project_items en reset:', deleteItemsErr);
      return NextResponse.json({ error: deleteItemsErr.message }, { status: 500 });
    }

    // 4. Reiniciar el contador next_position a 1 en la tabla projects
    const { error: updateProjectErr } = await supabase
      .from('projects')
      .update({
        next_position: 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    if (updateProjectErr) {
      console.warn('Advertencia al actualizar next_position en projects:', updateProjectErr);
    }

    return NextResponse.json({
      success: true,
      next_position: 1,
      message: 'Proyecto reiniciado y cuadrícula vaciada correctamente.',
    });
  } catch (err: any) {
    console.error('Fallo inesperado en POST /api/projects/reset:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
