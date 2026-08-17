import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_PROJECT_SLUG } from '@/lib/utils/project';

export default async function JoinProjectPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const resolvedParams = await params;
  const pairingCode = resolvedParams.code.toUpperCase();

  if (pairingCode === 'FG-8888') {
    redirect(`/project/${DEFAULT_PROJECT_SLUG}/camera`);
  }

  try {
    const supabase = await createClient();

    // Buscar el proyecto correspondiente al código de vinculación
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('pairing_code', pairingCode)
      .maybeSingle();

    if (project) {
      redirect(`/project/${project.id}/camera`);
    }
  } catch (_e) {
    // Continuar a dashboard
  }

  redirect('/dashboard');
}
