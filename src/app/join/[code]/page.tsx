import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function JoinProjectPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const resolvedParams = await params;
  const pairingCode = resolvedParams.code.toUpperCase();

  const supabase = await createClient();

  // Buscar el proyecto correspondiente al código de vinculación
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('pairing_code', pairingCode)
    .single();

  if (project) {
    redirect(`/project/${project.id}/camera`);
  }

  redirect('/dashboard');
}

