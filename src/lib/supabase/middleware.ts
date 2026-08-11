import { NextResponse, type NextRequest } from 'next/server';

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return url.trim().replace(/\/+$/, '');
}

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request,
  });

  // Acceso público directo sin barreras ni pantalla de login
  return supabaseResponse;
}

