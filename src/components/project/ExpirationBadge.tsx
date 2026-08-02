'use client';

import React from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface ExpirationBadgeProps {
  expiresAt: string | null;
}

export function ExpirationBadge({ expiresAt }: ExpirationBadgeProps) {
  if (!expiresAt) return null;

  const now = new Date();
  const exp = new Date(expiresAt);
  const isExpired = exp <= now;

  const diffMs = exp.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-950/80 border border-rose-800 text-rose-300">
        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
        Vencido (Pendiente de limpieza)
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-950/60 border border-amber-800/50 text-amber-300">
      <Clock className="w-3.5 h-3.5 text-amber-400" />
      Vence en {diffDays} {diffDays === 1 ? 'día' : 'días'}
    </span>
  );
}
