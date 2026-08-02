'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { APP_CONFIG } from '@/lib/config';
import { FolderPlus, Clock } from 'lucide-react';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateProjectModal({ isOpen, onClose, onSuccess }: CreateProjectModalProps) {
  const supabase = createClient();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [expiration, setExpiration] = useState('never');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Por favor, ingresa un nombre para el proyecto.', 'error');
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Sesión no encontrada. Inicia sesión nuevamente.');

      // Generar código corto de vinculación único de 6 caracteres (ej: "FG-8X9K")
      const randomCode = 'FG-' + Math.random().toString(36).substring(2, 6).toUpperCase();

      // Calcular fecha de expiración
      let expiresAt: string | null = null;
      const now = new Date();
      if (expiration === '1d') {
        now.setDate(now.getDate() + 1);
        expiresAt = now.toISOString();
      } else if (expiration === '7d') {
        now.setDate(now.getDate() + 7);
        expiresAt = now.toISOString();
      } else if (expiration === '30d') {
        now.setDate(now.getDate() + 30);
        expiresAt = now.toISOString();
      }

      const { error } = await supabase.from('projects').insert({
        owner_id: user.id,
        name: name.trim(),
        pairing_code: randomCode,
        next_position: 1,
        preferred_density: APP_CONFIG.defaultDensity,
        status: 'active',
        expires_at: expiresAt,
      });

      if (error) throw error;

      showToast('¡Proyecto creado con éxito!', 'success');
      setName('');
      setExpiration('never');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Error al crear el proyecto.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Crear Nuevo Proyecto"
      description="Organiza tus fotografías en una cuadrícula numerada cronológicamente."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Nombre del Proyecto
          </label>
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Calzado Deportivo Primavera, Sesión Producto..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Caducidad / Limpieza Automática
          </label>
          <div className="relative">
            <Clock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <select
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl pl-11 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors appearance-none cursor-pointer"
            >
              {APP_CONFIG.expirationOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Los proyectos vencidos se podrán eliminar con 1-clic para mantener bajo el almacenamiento.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            isLoading={loading}
            leftIcon={<FolderPlus className="w-4 h-4" />}
          >
            Crear Proyecto
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
