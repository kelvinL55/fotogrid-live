import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from '@/lib/config';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Validación de seguridad opcional si CRON_SECRET está configurado
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const now = new Date().toISOString();

    // 1. Consultar proyectos vencidos
    const { data: expiredProjects, error: fetchErr } = await supabase
      .from('projects')
      .select('id, name')
      .not('expires_at', 'is', null)
      .lte('expires_at', now);

    if (fetchErr) throw fetchErr;

    if (!expiredProjects || expiredProjects.length === 0) {
      return NextResponse.json({ message: 'No hay proyectos vencidos para limpiar.', deleted_count: 0 });
    }

    let totalDeleted = 0;

    for (const project of expiredProjects) {
      // Obtener items para borrar de Storage
      const { data: items } = await supabase
        .from('project_items')
        .select('storage_path')
        .eq('project_id', project.id);

      if (items && items.length > 0) {
        const pathsToDelete = items
          .map((i) => i.storage_path)
          .filter((p): p is string => Boolean(p));

        if (pathsToDelete.length > 0) {
          await supabase.storage.from(APP_CONFIG.storage.bucketName).remove(pathsToDelete);
        }
      }

      // Eliminar el proyecto (CASCADE borrará project_items)
      await supabase.from('projects').delete().eq('id', project.id);
      totalDeleted++;
    }

    return NextResponse.json({
      success: true,
      message: `Se limpiaron ${totalDeleted} proyectos vencidos.`,
      deleted_count: totalDeleted,
    });
  } catch (err: any) {
    console.error('Error en la tarea de limpieza de proyectos:', err);
    return NextResponse.json({ error: err.message || 'Error durante la limpieza' }, { status: 500 });
  }
}
