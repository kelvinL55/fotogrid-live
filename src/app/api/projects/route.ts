import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Project } from '@/lib/types';

function getSupabaseAdmin() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  return createClient(url, key);
}

// GET /api/projects?id=XYZ o /api/projects?pairingCode=ABC o list todos
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const pairingCode = searchParams.get('pairingCode');
  const supabase = getSupabaseAdmin();

  try {
    if (id) {
      let { data } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();

      if (!data && id === 'session-live-default') {
        // Auto-crear proyecto por defecto en la base de datos si no existe
        const defaultProject = {
          id: 'session-live-default',
          owner_id: '00000000-0000-0000-0000-000000000000',
          name: 'Mi Sesión FotoGrid en Vivo',
          pairing_code: 'FG-8888',
          next_position: 1,
          preferred_density: 12,
          status: 'active',
          expires_at: null,
          created_at: new Date('2026-01-01').toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: created } = await supabase
          .from('projects')
          .upsert(defaultProject)
          .select()
          .single();

        data = created || defaultProject;
      }

      return NextResponse.json({ project: data });
    }

    if (pairingCode) {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('pairing_code', pairingCode.toUpperCase())
        .single();

      return NextResponse.json({ project: data });
    }

    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    return NextResponse.json({ projects: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/projects (crear nuevo proyecto)
export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  try {
    const body = await request.json();
    const newProject: Partial<Project> = {
      id: body.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)),
      owner_id: body.owner_id || '00000000-0000-0000-0000-000000000000',
      name: body.name || 'Nuevo Proyecto FotoGrid',
      pairing_code: body.pairing_code || ('FG-' + Math.floor(1000 + Math.random() * 9000)),
      next_position: 1,
      preferred_density: body.preferred_density || 10,
      status: 'active',
      expires_at: body.expires_at || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('projects')
      .upsert(newProject)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ project: newProject, warning: error.message });
    }

    return NextResponse.json({ project: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/projects?id=XYZ
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('project_items').delete().eq('project_id', id);
    await supabase.from('projects').delete().eq('id', id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: true, warning: err.message });
  }
}
