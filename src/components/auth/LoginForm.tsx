'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Mail, Lock, Sparkles, ArrowRight, Camera } from 'lucide-react';
import { APP_CONFIG } from '@/lib/config';

export function LoginForm({ redirectTo = '/dashboard' }: { redirectTo?: string }) {
  const supabase = createClient();
  const { showToast } = useToast();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Por favor, ingresa tu correo y contraseña.', 'error');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?redirectTo=${redirectTo}`,
          },
        });
        if (error) throw error;
        showToast('Registro exitoso. Si se requiere confirmación, revisa tu correo o inicia sesión.', 'success');
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        showToast('¡Sesión iniciada correctamente!', 'success');
        window.location.href = redirectTo;
      }
    } catch (error: any) {
      showToast(error.message || 'Error de autenticación.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      showToast('Ingresa tu correo para recibir un Enlace Mágico.', 'error');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?redirectTo=${redirectTo}`,
        },
      });
      if (error) throw error;
      showToast('¡Enlace mágico enviado a tu correo electronico!', 'success');
    } catch (error: any) {
      showToast(error.message || 'Error al enviar el enlace mágico.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-14 h-14 bg-sky-500/10 border border-sky-500/30 rounded-2xl flex items-center justify-center mb-4 text-sky-400 shadow-inner">
          <Camera className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">{APP_CONFIG.name}</h1>
        <p className="text-sm text-slate-400 mt-1">
          Accede a tu cuadrícula fotográfica privada en tiempo real
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Correo electrónico
          </label>
          <div className="relative">
            <Mail className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@ejemplo.com"
              className="w-full bg-slate-950/80 border border-slate-800 focus:border-sky-500 rounded-xl pl-11 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Contraseña
          </label>
          <div className="relative">
            <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-950/80 border border-slate-800 focus:border-sky-500 rounded-xl pl-11 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors"
            />
          </div>
        </div>

        <Button
          type="submit"
          isLoading={loading}
          className="w-full py-3 text-sm font-semibold"
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          {isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-800"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-slate-900 px-3 text-slate-500 font-medium">O alternativamente</span>
        </div>
      </div>

      <div className="space-y-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleMagicLink}
          isLoading={loading}
          className="w-full py-2.5 text-xs text-sky-300 border-sky-900/50 hover:bg-sky-950/30"
          leftIcon={<Sparkles className="w-4 h-4 text-sky-400" />}
        >
          Enviar Enlace Mágico por correo
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs text-slate-400 hover:text-sky-400 transition-colors font-medium"
          >
            {isSignUp
              ? '¿Ya tienes una cuenta? Inicia sesión'
              : '¿No tienes cuenta? Regístrate aquí'}
          </button>
        </div>
      </div>
    </div>
  );
}
