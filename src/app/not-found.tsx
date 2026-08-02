import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Camera, Home } from 'lucide-react';
import { APP_CONFIG } from '@/lib/config';

export default function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-950 text-slate-100">
      <div className="w-16 h-16 bg-sky-500/10 border border-sky-500/30 rounded-2xl flex items-center justify-center mb-6 text-sky-400">
        <Camera className="w-8 h-8" />
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">404</h1>
      <h2 className="text-xl font-semibold text-slate-300 mb-4">Página o proyecto no encontrado</h2>
      <p className="text-sm text-slate-400 max-w-md mb-8">
        La dirección que intentas abrir no existe o no tienes permisos para acceder a ella en {APP_CONFIG.name}.
      </p>
      <Link href="/dashboard">
        <Button variant="primary" leftIcon={<Home className="w-4 h-4" />}>
          Volver al Panel Principal
        </Button>
      </Link>
    </div>
  );
}
