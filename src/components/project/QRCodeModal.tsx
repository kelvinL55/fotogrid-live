'use client';

import React from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Copy, Smartphone, Check } from 'lucide-react';
import { Project } from '@/lib/types';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
}

export function QRCodeModal({ isOpen, onClose, project }: QRCodeModalProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = React.useState(false);

  if (!project) return null;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const cameraUrl = `${baseUrl}/project/${project.id}/camera`;
  const joinUrl = `${baseUrl}/join/${project.pairing_code}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    showToast('¡Enlace de vinculación copiado al portapapeles!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Abrir en el Teléfono Móvil"
      description={`Escanea el código QR desde tu teléfono para tomar fotos en ${project.name}.`}
    >
      <div className="flex flex-col items-center justify-center p-4 text-center">
        <div className="p-4 bg-white rounded-2xl shadow-xl border-4 border-sky-500/30 mb-6">
          <QRCodeSVG value={cameraUrl} size={220} level="H" includeMargin />
        </div>

        <div className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 mb-5 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Smartphone className="w-4 h-4 text-sky-400" />
            Código corto de vinculación
          </div>
          <div className="text-2xl font-mono font-bold tracking-wider text-sky-400 bg-sky-950/40 px-4 py-1 rounded-lg border border-sky-800/50">
            {project.pairing_code}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Si no estás autenticado en el teléfono, el enlace te solicitará iniciar sesión y volverá a este proyecto.
          </p>
        </div>

        <div className="w-full flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleCopyLink}
            className="flex-1"
            leftIcon={copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          >
            {copied ? '¡Copiado!' : 'Copiar Enlace'}
          </Button>
          <Button type="button" variant="primary" onClick={onClose} className="px-6">
            Entendido
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
