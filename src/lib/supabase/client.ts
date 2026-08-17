import { createBrowserClient } from '@supabase/ssr';

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return url.trim().replace(/\/+$/, '');
}

let clientInstance: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (typeof window === 'undefined') {
    return createBrowserClient(
      getSupabaseUrl(),
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
    );
  }

  if (!clientInstance) {
    clientInstance = createBrowserClient(
      getSupabaseUrl(),
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
    );
  }

  return clientInstance;
}
