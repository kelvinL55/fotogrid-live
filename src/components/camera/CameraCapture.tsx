'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/lib/utils/image';
import { normalizeProjectId, generateUUID } from '@/lib/utils/project';
import { Camera, Image as ImageIcon, RefreshCw, UploadCloud, CheckCircle2, AlertCircle, Zap, ShieldCheck } from 'lucide-react';
import { Project, ProjectItem } from '@/lib/types';

interface CameraCaptureProps {
  project: Project;
  onUploadSuccess: () => void;
  replacementTargetItem?: ProjectItem | null;
  onCancelReplacement?: () => void;
}

export function CameraCapture({
  project,
  onUploadSuccess,
  replacementTargetItem = null,
  onCancelReplacement,
}: CameraCaptureProps) {
  const supabase = createClient();
  const { showToast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'reserving' | 'compressing' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [assignedPosition, setAssignedPosition] = useState<number | null>(
    replacementTargetItem ? replacementTargetItem.position : null
  );
  const [autoUpload, setAutoUpload] = useState<boolean>(true);
  const [sentCount, setSentCount] = useState<number>(0);

  const normalizedProjectId = normalizeProjectId(project.id);

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setStatus('idle');
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processAndUploadFile = async (fileToUpload: File) => {
    try {
      let itemId: string;
      let targetPosition: number;
      let currentVersion = 1;

      if (replacementTargetItem) {
        itemId = replacementTargetItem.id;
        targetPosition = replacementTargetItem.position;
        currentVersion = (replacementTargetItem.version || 1) + 1;
        setStatus('compressing');
      } else {
        setStatus('reserving');

        let rpcData: any = null;
        try {
          const res = await supabase.rpc('reserve_next_project_position', {
            p_project_id: normalizedProjectId,
          });
          if (res.data && res.data.length > 0) {
            rpcData = res.data;
          }
        } catch (_e) {
          // Ignorar error si la función RPC aún no está creada
        }

        if (rpcData) {
          itemId = rpcData[0].item_id;
          targetPosition = rpcData[0].reserved_position;
        } else {
          // Fallback con UUID válido
          itemId = generateUUID();
          targetPosition = project.next_position || 1;
        }
        setAssignedPosition(targetPosition);
      }

      setStatus('compressing');
      const processed = await compressImage(fileToUpload);

      setStatus('uploading');
      let finalPublicUrl: string | undefined = undefined;
      let isUploadedToServer = false;

      // 1. Enviar imagen a la API centralizada del servidor /api/items
      try {
        const formData = new FormData();
        const baseItem: Partial<ProjectItem> = {
          id: itemId,
          project_id: normalizedProjectId,
          position: targetPosition,
          status: 'active',
          original_filename: fileToUpload.name,
          mime_type: processed.file.type,
          file_size: processed.file.size,
          width: processed.width,
          height: processed.height,
          captured_at: new Date().toISOString(),
          uploaded_at: new Date().toISOString(),
          version: currentVersion,
        };

        formData.append('item', JSON.stringify(baseItem));
        formData.append('file', processed.file);

        const res = await fetch('/api/items', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const json = await res.json();
          if (json.item && json.item.public_url) {
            finalPublicUrl = json.item.public_url;
            isUploadedToServer = true;
          }
        } else {
          const json = await res.json().catch(() => ({}));
          console.warn('API /api/items reportó error:', json);
        }
      } catch (apiErr) {
        console.error('Error conectando a /api/items:', apiErr);
      }

      // 2. Si no hay publicUrl del servidor, generar Data URL base64 como respaldo
      if (!finalPublicUrl) {
        finalPublicUrl = await fileToDataUrl(processed.file);
      }

      const activeItem: ProjectItem = {
        id: itemId,
        project_id: normalizedProjectId,
        position: targetPosition,
        status: 'active',
        storage_path: isUploadedToServer ? `public/${normalizedProjectId}/${itemId}` : null,
        original_filename: fileToUpload.name,
        mime_type: processed.file.type,
        file_size: processed.file.size,
        width: processed.width,
        height: processed.height,
        captured_at: new Date().toISOString(),
        uploaded_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: currentVersion,
        error_message: null,
        public_url: finalPublicUrl,
      };

      // 3. Guardar en caché local
      if (typeof window !== 'undefined') {
        const existing: ProjectItem[] = JSON.parse(
          localStorage.getItem(`demo_items_${normalizedProjectId}`) || '[]'
        );

        const updated = existing.filter((i) => i.position !== targetPosition && i.id !== itemId);
        updated.push(activeItem);
        updated.sort((a, b) => a.position - b.position);

        localStorage.setItem(`demo_items_${normalizedProjectId}`, JSON.stringify(updated));
        if (project.id !== normalizedProjectId) {
          localStorage.setItem(`demo_items_${project.id}`, JSON.stringify(updated));
        }

        if (!replacementTargetItem) {
          const demoProjects: Project[] = JSON.parse(
            localStorage.getItem('demo_projects') || '[]'
          );
          const pIndex = demoProjects.findIndex((p) => p.id === project.id || p.id === normalizedProjectId);
          if (pIndex >= 0) {
            demoProjects[pIndex].next_position = targetPosition + 1;
            localStorage.setItem('demo_projects', JSON.stringify(demoProjects));
          }
        }

        window.dispatchEvent(new Event('storage'));
      }

      // 4. Transmitir inmediatamente vía Supabase Realtime Broadcast
      try {
        const channel = supabase.channel(`project_items:${normalizedProjectId}`);
        channel.subscribe((subStatus) => {
          if (subStatus === 'SUBSCRIBED') {
            channel.send({
              type: 'broadcast',
              event: 'new_photo',
              payload: { item: activeItem, itemId: activeItem.id, position: targetPosition, timestamp: new Date().toISOString() },
            });
          }
        });
      } catch (_bcErr) {
        // Ignorar fallo de broadcast
      }

      setStatus('success');
      setSentCount((prev) => prev + 1);
      showToast(`¡Foto #${targetPosition} enviada en vivo!`, 'success');
      onUploadSuccess();

      // Reinicio automático inmediato para disparar la siguiente foto sin esperas
      setTimeout(() => {
        handleRetake();
      }, 500);
    } catch (err: any) {
      console.error('Error durante la captura y subida:', err);
      setStatus('error');
      setErrorMessage(err.message || 'Error al procesar la fotografía.');
      showToast(err.message || 'Fallo durante la subida.', 'error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Por favor, selecciona únicamente un archivo de imagen.', 'error');
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    if (autoUpload) {
      processAndUploadFile(file);
    } else {
      setStatus('idle');
      setErrorMessage(null);
    }
  };

  const handleConfirmAndUpload = () => {
    if (selectedFile) {
      processAndUploadFile(selectedFile);
    }
  };

  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col items-center">
      {/* Cabecera del control remoto */}
      <div className="w-full flex items-center justify-between pb-3 sm:pb-4 mb-3 sm:mb-4 border-b border-slate-800">
        <div className="min-w-0 pr-2">
          <span className="text-[10px] sm:text-[11px] font-semibold text-sky-400 uppercase tracking-wider block">Cámara Remota</span>
          <h2 className="text-base sm:text-lg font-bold text-white truncate max-w-[170px] sm:max-w-[200px]">{project.name}</h2>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 bg-emerald-950/80 border border-emerald-800 rounded-full text-[11px] sm:text-xs text-emerald-300 font-medium shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>En Vivo</span>
        </div>
      </div>

      {replacementTargetItem && (
        <div className="w-full mb-3 p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl flex items-center justify-between text-xs text-amber-200">
          <span>Reemplazando casilla <strong>#{replacementTargetItem.position}</strong></span>
          <button onClick={onCancelReplacement} className="text-amber-400 hover:underline font-semibold">
            Cancelar
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        id="camera-input"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        id="gallery-input"
      />

      {previewUrl ? (
        <div className="w-full flex flex-col items-center gap-3 sm:gap-4 animate-fade-in">
          <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner">
            <img src={previewUrl} alt="Vista previa" className="w-full h-full object-contain" />

            {assignedPosition && (
              <div className="absolute top-2.5 left-2.5 bg-sky-600 text-white font-mono font-bold text-xs sm:text-sm px-2.5 py-1 rounded-xl shadow-lg border border-sky-400/40">
                Casilla #{assignedPosition}
              </div>
            )}

            {status !== 'idle' && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
                {status === 'reserving' && (
                  <>
                    <RefreshCw className="w-8 h-8 sm:w-10 sm:h-10 text-sky-400 animate-spin mb-2" />
                    <p className="text-xs sm:text-sm font-semibold text-white">Reservando casilla...</p>
                  </>
                )}
                {status === 'compressing' && (
                  <>
                    <RefreshCw className="w-8 h-8 sm:w-10 sm:h-10 text-sky-400 animate-spin mb-2" />
                    <p className="text-xs sm:text-sm font-semibold text-white">Optimizando imagen...</p>
                  </>
                )}
                {status === 'uploading' && (
                  <>
                    <UploadCloud className="w-8 h-8 sm:w-10 sm:h-10 text-sky-400 animate-bounce mb-2" />
                    <p className="text-xs sm:text-sm font-semibold text-white">Enviando a la cuadrícula...</p>
                  </>
                )}
                {status === 'success' && (
                  <>
                    <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-400 mb-2 animate-bounce" />
                    <p className="text-sm sm:text-base font-bold text-emerald-300">¡Foto recibida en el visor!</p>
                  </>
                )}
                {status === 'error' && (
                  <>
                    <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-rose-400 mb-2" />
                    <p className="text-xs text-rose-200 mb-3">{errorMessage}</p>
                    <Button size="sm" variant="danger" onClick={handleConfirmAndUpload}>
                      Reintentar Enviar
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {status === 'idle' && (
            <div className="w-full flex items-center gap-2 sm:gap-3">
              <Button
                variant="secondary"
                onClick={handleRetake}
                className="flex-1 py-2.5 sm:py-3 text-xs sm:text-sm"
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Descartar
              </Button>

              <Button
                variant="primary"
                onClick={handleConfirmAndUpload}
                className="flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold"
                leftIcon={<UploadCloud className="w-4 h-4" />}
              >
                Enviar a la Web
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full flex flex-col items-center gap-4 py-2">
          {/* Botón Disparador Principal Móvil Ergonómico */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-10 sm:py-12 bg-gradient-to-b from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 active:scale-95 text-white font-bold text-lg sm:text-xl rounded-2xl sm:rounded-3xl shadow-2xl shadow-sky-500/40 border border-sky-300/40 flex flex-col items-center justify-center gap-2.5 transition-all duration-200 group"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30 group-hover:scale-110 transition-transform shadow-inner">
              <Camera className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
            </div>
            <span className="tracking-wide text-base sm:text-xl">TOMAR FOTOGRAFÍA</span>
            <span className="text-[11px] sm:text-xs font-normal text-sky-100/90">Toca para capturar con la cámara</span>
          </button>

          {/* Toggle de Auto-Envío Instantáneo */}
          <div className="w-full bg-slate-950/70 border border-slate-800 rounded-xl sm:rounded-2xl p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Zap className={`w-4 h-4 shrink-0 ${autoUpload ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
              <div>
                <span className="font-semibold block text-white text-xs">Envío Instantáneo</span>
                <span className="text-[10px] text-slate-400 block">Toma la foto y se envía automáticamente</span>
              </div>
            </div>

            <button
              onClick={() => setAutoUpload(!autoUpload)}
              className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ${
                autoUpload ? 'bg-sky-500' : 'bg-slate-700'
              }`}
              aria-label="Alternar envío instantáneo"
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  autoUpload ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="w-full flex items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => galleryInputRef.current?.click()}
              className="flex-1 py-2 sm:py-2.5 text-xs text-slate-300 border-slate-800"
              leftIcon={<ImageIcon className="w-4 h-4 text-slate-400" />}
            >
              Galería
            </Button>

            {sentCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-sky-950/60 border border-sky-800/80 rounded-xl text-xs font-semibold text-sky-300 shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{sentCount} {sentCount === 1 ? 'foto enviada' : 'fotos enviadas'}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
