import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ProjectItem } from '@/lib/types';
import { APP_CONFIG } from '@/lib/config';
import { normalizeProjectId, generateUUID, isValidUUID } from '@/lib/utils/project';

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

// GET /api/items?projectId=XYZ
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawProjectId = searchParams.get('projectId');

  if (!rawProjectId) {
    return NextResponse.json({ items: [] });
  }

  const projectId = normalizeProjectId(rawProjectId);
  const supabase = getSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from('project_items')
      .select('*')
      .eq('project_id', projectId)
      .order('position', { ascending: true });

    if (error) {
      console.error('Error al consultar project_items de Supabase:', error);
      return NextResponse.json({ items: [], warning: error.message });
    }

    const items = (data || []).map((item: any) => {
      let publicUrl = item.public_url;
      if (!publicUrl && item.storage_path) {
        const { data: urlData } = supabase.storage
          .from(APP_CONFIG.storage.bucketName)
          .getPublicUrl(item.storage_path);
        publicUrl = urlData?.publicUrl ? `${urlData.publicUrl}?v=${item.version || 1}` : undefined;
      }
      return {
        ...item,
        public_url: publicUrl || undefined,
      };
    });

    return NextResponse.json({ items });
  } catch (err: any) {
    console.error('Fallo inesperado en GET /api/items:', err);
    return NextResponse.json({ items: [], error: err.message });
  }
}

// POST /api/items
export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();

  try {
    const contentType = request.headers.get('content-type') || '';
    let itemData: Partial<ProjectItem> = {};
    let uploadedFileBuffer: Buffer | null = null;
    let fileExt = 'jpg';
    let fileMimeType = 'image/jpeg';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      itemData = body.item || body;
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const rawItem = formData.get('item');
      if (rawItem && typeof rawItem === 'string') {
        itemData = JSON.parse(rawItem);
      }

      const file = formData.get('file') as File | null;
      if (file) {
        fileExt = file.name.split('.').pop() || 'jpg';
        fileMimeType = file.type || 'image/jpeg';
        uploadedFileBuffer = Buffer.from(await file.arrayBuffer());
      }
    }

    const projectId = normalizeProjectId(itemData.project_id);
    const targetPosition = Number(itemData.position) || 1;

    // 1. Comprobar si ya existe un item en esta casilla
    const { data: existingItem } = await supabase
      .from('project_items')
      .select('*')
      .eq('project_id', projectId)
      .eq('position', targetPosition)
      .maybeSingle();

    const finalItemId = existingItem?.id || (itemData.id && isValidUUID(itemData.id) ? itemData.id : generateUUID());
    const newVersion = (existingItem?.version || itemData.version || 0) + 1;

    // 2. Si se está reemplazando y existía un archivo previo, eliminar el archivo antiguo de Storage
    if (existingItem?.storage_path && uploadedFileBuffer) {
      try {
        await supabase.storage.from(APP_CONFIG.storage.bucketName).remove([existingItem.storage_path]);
      } catch (_e) {
        // No bloqueante
      }
    }

    let storagePath = existingItem?.storage_path || null;
    let publicUrl: string | undefined = itemData.public_url;

    // 3. Subir el nuevo archivo al bucket 'project-photos' con path versionado
    if (uploadedFileBuffer) {
      storagePath = `public/${projectId}/${finalItemId}_v${newVersion}_${Date.now()}.${fileExt}`;
      const { error: uploadErr } = await supabase.storage
        .from(APP_CONFIG.storage.bucketName)
        .upload(storagePath, uploadedFileBuffer, {
          contentType: fileMimeType,
          upsert: true,
        });

      if (uploadErr) {
        console.error('Error al subir imagen a Supabase Storage:', uploadErr);
      } else {
        const { data: urlData } = supabase.storage
          .from(APP_CONFIG.storage.bucketName)
          .getPublicUrl(storagePath);
        publicUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : undefined;
      }
    }

    const nowIso = new Date().toISOString();
    const dbRecord = {
      id: finalItemId,
      project_id: projectId,
      position: targetPosition,
      status: itemData.status || 'active',
      storage_path: storagePath,
      original_filename: itemData.original_filename || `${finalItemId}.${fileExt}`,
      mime_type: fileMimeType,
      file_size: itemData.file_size || (uploadedFileBuffer ? uploadedFileBuffer.length : null),
      width: itemData.width || null,
      height: itemData.height || null,
      captured_at: itemData.captured_at || nowIso,
      uploaded_at: nowIso,
      updated_at: nowIso,
      version: newVersion,
      error_message: null,
    };

    const { data: savedRecord, error: upsertErr } = await supabase
      .from('project_items')
      .upsert(dbRecord, { onConflict: 'project_id,position' })
      .select()
      .single();

    if (upsertErr) {
      console.error('Error al guardar registro en project_items:', upsertErr);
      return NextResponse.json({
        error: upsertErr.message,
        details: upsertErr.details,
        item: { ...dbRecord, public_url: publicUrl },
      }, { status: 500 });
    }

    const resultItem: ProjectItem = {
      ...(savedRecord || dbRecord),
      public_url: publicUrl || undefined,
    };

    // Incrementar next_position en proyectos solo si no es un reemplazo
    if (!existingItem) {
      try {
        await supabase
          .from('projects')
          .update({
            next_position: targetPosition + 1,
            updated_at: nowIso,
          })
          .eq('id', projectId);
      } catch (_e) {
        // No bloqueante
      }
    }

    return NextResponse.json({ item: resultItem });
  } catch (err: any) {
    console.error('Fallo crítico en POST /api/items:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
