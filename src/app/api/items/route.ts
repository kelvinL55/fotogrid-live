import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ProjectItem } from '@/lib/types';
import { APP_CONFIG } from '@/lib/config';

function getSupabaseAdmin() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  return createClient(url, key);
}

// GET /api/items?projectId=XYZ
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ items: [] });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from('project_items')
      .select('*')
      .eq('project_id', projectId)
      .order('position', { ascending: true });

    if (error || !data) {
      return NextResponse.json({ items: [] });
    }

    const items = data.map((item: any) => {
      let publicUrl = item.public_url;
      if (!publicUrl && item.storage_path) {
        const { data: urlData } = supabase.storage
          .from(APP_CONFIG.storage.bucketName)
          .getPublicUrl(item.storage_path);
        publicUrl = urlData?.publicUrl;
      }
      return {
        ...item,
        public_url: publicUrl || undefined,
      };
    });

    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json({ items: [], error: err.message });
  }
}

// POST /api/items
export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();

  try {
    const contentType = request.headers.get('content-type') || '';
    let itemData: Partial<ProjectItem> = {};

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
      if (file && itemData.project_id && itemData.id) {
        const fileExt = file.name.split('.').pop() || 'jpg';
        const storagePath = `public/${itemData.project_id}/${itemData.id}.${fileExt}`;

        const buffer = Buffer.from(await file.arrayBuffer());
        const { error: uploadErr } = await supabase.storage
          .from(APP_CONFIG.storage.bucketName)
          .upload(storagePath, buffer, {
            contentType: file.type || 'image/jpeg',
            upsert: true,
          });

        if (!uploadErr) {
          const { data: urlData } = supabase.storage
            .from(APP_CONFIG.storage.bucketName)
            .getPublicUrl(storagePath);

          itemData.storage_path = storagePath;
          itemData.public_url = urlData?.publicUrl;
        }
      }
    }

    if (!itemData.project_id || !itemData.id) {
      return NextResponse.json({ error: 'Datos incompletos para el item' }, { status: 400 });
    }

    const dbRecord = {
      id: itemData.id,
      project_id: itemData.project_id,
      position: itemData.position || 1,
      status: itemData.status || 'active',
      storage_path: itemData.storage_path || null,
      original_filename: itemData.original_filename || null,
      mime_type: itemData.mime_type || null,
      file_size: itemData.file_size || null,
      width: itemData.width || null,
      height: itemData.height || null,
      captured_at: itemData.captured_at || new Date().toISOString(),
      uploaded_at: itemData.uploaded_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: itemData.version || 1,
      error_message: null,
    };

    const { data: savedRecord, error: upsertErr } = await supabase
      .from('project_items')
      .upsert(dbRecord)
      .select()
      .single();

    const resultItem: ProjectItem = {
      ...(savedRecord || dbRecord),
      public_url: itemData.public_url || undefined,
    };

    // Incrementar next_position en proyectos si aplica
    try {
      await supabase
        .from('projects')
        .update({
          next_position: (itemData.position || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemData.project_id);
    } catch (_e) {
      // Ignorar
    }

    return NextResponse.json({ item: resultItem });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
