import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return url.trim().replace(/\/+$/, '');
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Verificar si está activo el Modo Demostración Temporal vía Cookie
  const isDemoMode = request.cookies.get('demo_mode')?.value === 'true';

  const supabase = createServerClient(
    getSupabaseUrl(),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage = request.nextUrl.pathname.startsWith('/login');
  const isAuthCallback = request.nextUrl.pathname.startsWith('/auth');
  const isPublicAsset =
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/api/cron') ||
    request.nextUrl.pathname.endsWith('.json') ||
    request.nextUrl.pathname.endsWith('.js') ||
    request.nextUrl.pathname.endsWith('.png') ||
    request.nextUrl.pathname.endsWith('.ico');

  // Permitir paso si existe un usuario autenticado O si está en Modo Demo
  if (!user && !isDemoMode && !isAuthPage && !isAuthCallback && !isPublicAsset) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if ((user || isDemoMode) && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
