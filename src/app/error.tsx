'use client';

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { RefreshCw, Home, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Next.js Client Exception:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Visor FotoGrid en Vivo</h2>
        <p className="text-xs text-slate-400 max-w-xs mb-6">
          Sincronizando sesión en tiempo real... Si no carga inmediatamente, pulsa continuar.
        </p>
        <div className="w-full flex flex-col gap-3">
          <Button
            variant="primary"
            onClick={() => reset()}
            leftIcon={<RefreshCw className="w-4 h-4" />}
            className="w-full py-3"
          >
            Continuar al Visor
          </Button>
          <Link href="/dashboard" className="w-full">
            <Button variant="secondary" leftIcon={<Home className="w-4 h-4" />} className="w-full py-2.5">
              Panel Principal
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
