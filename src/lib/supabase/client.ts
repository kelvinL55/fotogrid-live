import { createBrowserClient } from '@supabase/ssr';

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return url.trim().replace(/\/+$/, '');
}

export function createClient() {
  return createBrowserClient(
    getSupabaseUrl(),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
  );
}
