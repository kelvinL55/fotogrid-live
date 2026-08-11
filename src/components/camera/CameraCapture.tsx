'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/lib/utils/image';
import { APP_CONFIG } from '@/lib/config';
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

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setStatus('idle');
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  // Convertir File a DataURL base64 para Modo Demo local
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
        currentVersion = replacementTargetItem.version + 1;
        setStatus('compressing');
      } else {
        setStatus('reserving');

        let rpcData: any = null;
        try {
          const res = await supabase.rpc('reserve_next_project_position', {
            p_project_id: project.id,
          });
          if (res.data && res.data.length > 0) {
            rpcData = res.data;
          }
        } catch (_e) {
          // Ignorar error en modo demo
        }

        if (rpcData) {
          itemId = rpcData[0].item_id;
          targetPosition = rpcData[0].reserved_position;
        } else {
          // Fallback para Modo Demo
          itemId = Math.random().toString(36).substring(2, 11);
          targetPosition = project.next_position || 1;
        }
        setAssignedPosition(targetPosition);
      }

      setStatus('compressing');
      const processed = await compressImage(fileToUpload);

      setStatus('uploading');
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id || 'demo-user-123';

      const fileExt = processed.file.name.split('.').pop() || 'jpg';
      const storagePath = `${userId}/${project.id}/${itemId}/v${currentVersion}.${fileExt}`;

      let isSupabaseUploaded = false;
      let finalPublicUrl: string | undefined = undefined;

      // 1. Intentar subir a Supabase Storage
      try {
        const { error: uploadError } = await supabase.storage
          .from(APP_CONFIG.storage.bucketName)
          .upload(storagePath, processed.file, {
            contentType: processed.file.type,
            upsert: true,
          });

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from(APP_CONFIG.storage.bucketName)
            .getPublicUrl(storagePath);
          finalPublicUrl = urlData?.publicUrl;

          await supabase
            .from('project_items')
            .upsert({
              id: itemId,
              project_id: project.id,
              position: targetPosition,
              status: 'active',
              storage_path: storagePath,
              original_filename: fileToUpload.name,
              mime_type: processed.file.type,
              file_size: processed.file.size,
              width: processed.width,
              height: processed.height,
              uploaded_at: new Date().toISOString(),
              version: currentVersion,
              error_message: null,
            });

          isSupabaseUploaded = true;
        }
      } catch (_supabaseErr) {
        // Fallback a almacenamiento local si falla Supabase Storage/DB
      }

      // 2. Si no hay publicUrl de Supabase, generar Data URL base64
      if (!finalPublicUrl) {
        finalPublicUrl = await fileToDataUrl(processed.file);
      }

      const activeItem: ProjectItem = {
        id: itemId,
        project_id: project.id,
        position: targetPosition,
        status: 'active',
        storage_path: isSupabaseUploaded ? storagePath : null,
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

      // 3. Guardar localmente en el dispositivo
      if (typeof window !== 'undefined') {
        const existing: ProjectItem[] = JSON.parse(
          localStorage.getItem(`demo_items_${project.id}`) || '[]'
        );

        const updated = existing.filter((i) => i.position !== targetPosition && i.id !== itemId);
        updated.push(activeItem);
        updated.sort((a, b) => a.position - b.position);

        localStorage.setItem(`demo_items_${project.id}`, JSON.stringify(updated));

        if (!replacementTargetItem) {
          const demoProjects: Project[] = JSON.parse(
            localStorage.getItem('demo_projects') || '[]'
          );
          const pIndex = demoProjects.findIndex((p) => p.id === project.id);
          if (pIndex >= 0) {
            demoProjects[pIndex].next_position = targetPosition + 1;
            localStorage.setItem('demo_projects', JSON.stringify(demoProjects));
          }
        }

        window.dispatchEvent(new Event('storage'));
      }

      // 4. Transmitir inmediatamente vía Supabase Realtime Broadcast a todas las pantallas web suscritas en vivo
      try {
        const channel = supabase.channel(`project_items:${project.id}`);
        channel.send({
          type: 'broadcast',
          event: 'new_photo',
          payload: { item: activeItem, itemId: activeItem.id, position: targetPosition, timestamp: new Date().toISOString() },
        });
      } catch (_bcErr) {
        // Ignorar fallo de broadcast
      }

      setStatus('success');
      setSentCount((prev) => prev + 1);
      showToast(`¡Foto #${targetPosition} enviada en vivo a la pantalla web!`, 'success');
      onUploadSuccess();

      // Reinicio ultrarrápido para estar listo para la siguiente toma
      setTimeout(() => {
        handleRetake();
      }, 700);
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
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center">
      {/* Cabecera de estado del teléfono */}
      <div className="w-full flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
        <div>
          <span className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider block">Control Remoto Fotográfico</span>
          <h2 className="text-lg font-bold text-white truncate max-w-[200px]">{project.name}</h2>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-950/80 border border-emerald-800 rounded-full text-xs text-emerald-300 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          Conectado en Vivo
        </div>
      </div>

      {replacementTargetItem && (
        <div className="w-full mb-4 p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl flex items-center justify-between text-xs text-amber-200">
          <span>Reemplazando casilla <strong>#{replacementTargetItem.position}</strong></span>
          <button onClick={onCancelReplacement} className="text-amber-400 hover:underline">
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
        <div className="w-full flex flex-col items-center gap-4 animate-fade-in">
          <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner">
            <img src={previewUrl} alt="Vista previa" className="w-full h-full object-contain" />

            {assignedPosition && (
              <div className="absolute top-3 left-3 bg-sky-600 text-white font-mono font-bold text-sm px-3 py-1 rounded-xl shadow-lg border border-sky-400/40">
                Casilla #{assignedPosition}
              </div>
            )}

            {status !== 'idle' && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
                {status === 'reserving' && (
                  <>
                    <RefreshCw className="w-10 h-10 text-sky-400 animate-spin mb-2" />
                    <p className="text-sm font-semibold text-white">Reservando casilla...</p>
                  </>
                )}
                {status === 'compressing' && (
                  <>
                    <RefreshCw className="w-10 h-10 text-sky-400 animate-spin mb-2" />
                    <p className="text-sm font-semibold text-white">Optimizando imagen para la web...</p>
                  </>
                )}
                {status === 'uploading' && (
                  <>
                    <UploadCloud className="w-10 h-10 text-sky-400 animate-bounce mb-2" />
                    <p className="text-sm font-semibold text-white">Enviando en tiempo real a la pantalla...</p>
                  </>
                )}
                {status === 'success' && (
                  <>
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-2 animate-bounce" />
                    <p className="text-base font-bold text-emerald-300">¡Foto recibida en el visor web!</p>
                  </>
                )}
                {status === 'error' && (
                  <>
                    <AlertCircle className="w-10 h-10 text-rose-400 mb-2" />
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
            <div className="w-full flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={handleRetake}
                className="flex-1 py-3 text-sm"
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Descartar
              </Button>

              <Button
                variant="primary"
                onClick={handleConfirmAndUpload}
                className="flex-1 py-3 text-sm font-semibold"
                leftIcon={<UploadCloud className="w-4 h-4" />}
              >
                Enviar a la Web
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full flex flex-col items-center gap-5 py-4">
          {/* Botón Disparador Principal Móvil */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-12 bg-gradient-to-b from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 active:scale-95 text-white font-bold text-xl rounded-3xl shadow-2xl shadow-sky-500/40 border border-sky-300/40 flex flex-col items-center justify-center gap-3 transition-all duration-200 group"
          >
            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30 group-hover:scale-110 transition-transform">
              <Camera className="w-10 h-10 text-white" />
            </div>
            <span className="tracking-wide">TOMAR FOTOGRAFÍA</span>
            <span className="text-xs font-normal text-sky-100/90">Haz clic para abrir la cámara de tu teléfono</span>
          </button>

          {/* Toggle de Auto-Envío Instantáneo */}
          <div className="w-full bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Zap className={`w-4 h-4 ${autoUpload ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
              <div>
                <span className="font-semibold block text-white">Envío Automático Instantáneo</span>
                <span className="text-[10px] text-slate-400">Envía la foto a la web inmediatamente sin previsualizar</span>
              </div>
            </div>

            <button
              onClick={() => setAutoUpload(!autoUpload)}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                autoUpload ? 'bg-sky-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  autoUpload ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="w-full flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => galleryInputRef.current?.click()}
              className="flex-1 py-2.5 text-xs text-slate-300 border-slate-800"
              leftIcon={<ImageIcon className="w-4 h-4 text-slate-400" />}
            >
              Elegir de la Galería
            </Button>

            {sentCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-sky-950/60 border border-sky-800/80 rounded-xl text-xs font-semibold text-sky-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>{sentCount} enviadas</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

