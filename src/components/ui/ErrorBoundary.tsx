'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { RefreshCw, Home, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('FotoGrid ErrorBoundary capturó un error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 bg-slate-900/60 border border-slate-800 rounded-3xl text-center m-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Se produjo una interrupción en la vista</h2>
          <p className="text-xs text-slate-400 max-w-sm mb-6">
            La sesión sigue activa. Puedes recargar los componentes de la cuadrícula o volver al panel.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                this.setState({ hasError: false });
                if (typeof window !== 'undefined') window.location.reload();
              }}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Recargar Vista
            </Button>
            <Link href="/dashboard">
              <Button variant="secondary" size="sm" leftIcon={<Home className="w-4 h-4" />}>
                Ir al Inicio
              </Button>
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
