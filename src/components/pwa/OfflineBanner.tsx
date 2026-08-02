'use client';

import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="w-full bg-amber-950/90 border-b border-amber-800 text-amber-200 px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 backdrop-blur-md sticky top-0 z-50">
      <WifiOff className="w-4 h-4 text-amber-400 animate-pulse" />
      <span>Modo sin conexión. Las capturas tomadas se guardarán en la cola para subirse al reconectar.</span>
    </div>
  );
}
