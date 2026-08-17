import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeProjectId } from '@/lib/utils/project';

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

// POST /api/projects/compact?projectId=XYZ
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get('projectId');
  if (!rawId) {
    return NextResponse.json({ error: 'projectId es requerido' }, { status: 400 });
  }

  const projectId = normalizeProjectId(rawId);
  const supabase = getSupabaseAdmin();

  try {
    // 1. Intentar llamar al RPC compact_project_positions
    const { data: rpcResult, error: rpcError } = await supabase.rpc('compact_project_positions', {
      p_project_id: projectId,
    });

    if (!rpcError) {
      return NextResponse.json({ success: true, next_position: rpcResult });
    }

    console.warn('RPC compact_project_positions falló, aplicando compactación directa en servidor:', rpcError.message);

    // 2. Fallback de compactación directa en servidor si el RPC tiene un error de constraint
    // A. Eliminar casillas vacías
    await supabase
      .from('project_items')
      .delete()
      .eq('project_id', projectId)
      .eq('status', 'empty');

    // B. Obtener items activos ordenados
    const { data: items, error: fetchErr } = await supabase
      .from('project_items')
      .select('id, position')
      .eq('project_id', projectId)
      .order('position', { ascending: true });

    if (fetchErr) throw fetchErr;

    if (!items || items.length === 0) {
      await supabase.from('projects').update({ next_position: 1, updated_at: new Date().toISOString() }).eq('id', projectId);
      return NextResponse.json({ success: true, next_position: 1 });
    }

    // C. Mover temporalmente a offset positivo alto para evitar conflicto de clave única
    for (const item of items) {
      await supabase
        .from('project_items')
        .update({ position: item.position + 500000 })
        .eq('id', item.id);
    }

    // D. Reasignar posiciones secuenciales 1, 2, 3...
    let nextPos = 1;
    for (const item of items) {
      await supabase
        .from('project_items')
        .update({ position: nextPos, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      nextPos++;
    }

    // E. Actualizar tabla projects
    await supabase
      .from('projects')
      .update({ next_position: nextPos, updated_at: new Date().toISOString() })
      .eq('id', projectId);

    return NextResponse.json({ success: true, next_position: nextPos });
  } catch (err: any) {
    console.error('Error en /api/projects/compact:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
