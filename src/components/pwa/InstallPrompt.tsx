'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Download, X } from 'lucide-react';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-4 max-w-sm flex items-center justify-between gap-3 text-white animate-fade-in">
      <div className="flex flex-col">
        <span className="text-xs font-bold text-sky-400">Instalar FotoGrid Live</span>
        <span className="text-[11px] text-slate-400">Añade la app a tu pantalla de inicio para acceso rápido</span>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={handleInstall} leftIcon={<Download className="w-3.5 h-3.5" />}>
          Instalar
        </Button>

        <button
          onClick={() => setShowPrompt(false)}
          className="p-1 text-slate-400 hover:text-white rounded-lg"
          aria-label="Cerrar aviso de instalación"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
