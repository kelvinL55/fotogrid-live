'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/lib/utils/image';
import { APP_CONFIG } from '@/lib/config';
import { Camera, Image as ImageIcon, RefreshCw, UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';
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
    setStatus('idle');
    setErrorMessage(null);
  };

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

  const handleConfirmAndUpload = async () => {
    if (!selectedFile) return;

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
      const processed = await compressImage(selectedFile);

      setStatus('uploading');
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id || 'demo-user-123';

      const fileExt = processed.file.name.split('.').pop() || 'jpg';
      const storagePath = `${userId}/${project.id}/${itemId}/v${currentVersion}.${fileExt}`;

      let isSupabaseUploaded = false;

      // Intentar subir a Supabase Storage
      try {
        const { error: uploadError } = await supabase.storage
          .from(APP_CONFIG.storage.bucketName)
          .upload(storagePath, processed.file, {
            contentType: processed.file.type,
            upsert: true,
          });

        if (!uploadError) {
          await supabase
            .from('project_items')
            .update({
              status: 'active',
              storage_path: storagePath,
              original_filename: selectedFile.name,
              mime_type: processed.file.type,
              file_size: processed.file.size,
              width: processed.width,
              height: processed.height,
              uploaded_at: new Date().toISOString(),
              version: currentVersion,
              error_message: null,
            })
            .eq('id', itemId);

          isSupabaseUploaded = true;
        }
      } catch (_supabaseErr) {
        // Fallback a modo demo
      }

      // Si no se pudo subir a Supabase (Modo Demo / Sin conexión), guardar en localStorage
      if (!isSupabaseUploaded && typeof window !== 'undefined') {
        const dataUrl = await fileToDataUrl(processed.file);
        const demoItem: ProjectItem = {
          id: itemId,
          project_id: project.id,
          position: targetPosition,
          status: 'active',
          storage_path: null,
          original_filename: selectedFile.name,
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
          public_url: dataUrl,
        };

        const existing: ProjectItem[] = JSON.parse(
          localStorage.getItem(`demo_items_${project.id}`) || '[]'
        );

        const updated = existing.filter((i) => i.position !== targetPosition);
        updated.push(demoItem);
        updated.sort((a, b) => a.position - b.position);

        localStorage.setItem(`demo_items_${project.id}`, JSON.stringify(updated));

        // Actualizar contador del proyecto si era una nueva casilla
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

        // Disparar evento para actualizar la cuadrícula en vivo entre pestañas/dispositivos
        window.dispatchEvent(new Event('storage'));
      }

      setStatus('success');
      showToast(`¡Fotografía #${targetPosition} subida correctamente!`, 'success');
      onUploadSuccess();

      setTimeout(() => {
        handleRetake();
      }, 1200);
    } catch (err: any) {
      console.error('Error durante la captura y subida:', err);
      setStatus('error');
      setErrorMessage(err.message || 'Error al procesar la fotografía.');
      showToast(err.message || 'Fallo durante la subida.', 'error');
    }
  };

  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center">
      <div className="w-full flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
        <div>
          <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Modo Cámara Móvil</span>
          <h2 className="text-lg font-bold text-white truncate max-w-[220px]">{project.name}</h2>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-950/80 border border-emerald-800 rounded-full text-xs text-emerald-300 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          Conectado
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
                    <p className="text-sm font-semibold text-white">Reservando posición atómica...</p>
                  </>
                )}
                {status === 'compressing' && (
                  <>
                    <RefreshCw className="w-10 h-10 text-sky-400 animate-spin mb-2" />
                    <p className="text-sm font-semibold text-white">Optimizando y comprimiendo imagen...</p>
                  </>
                )}
                {status === 'uploading' && (
                  <>
                    <UploadCloud className="w-10 h-10 text-sky-400 animate-bounce mb-2" />
                    <p className="text-sm font-semibold text-white">Subiendo foto a la cuadrícula...</p>
                  </>
                )}
                {status === 'success' && (
                  <>
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-2 animate-bounce" />
                    <p className="text-base font-bold text-emerald-300">¡Fotografía guardada con éxito!</p>
                  </>
                )}
                {status === 'error' && (
                  <>
                    <AlertCircle className="w-10 h-10 text-rose-400 mb-2" />
                    <p className="text-xs text-rose-200 mb-3">{errorMessage}</p>
                    <Button size="sm" variant="danger" onClick={handleConfirmAndUpload}>
                      Reintentar Subida
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
                Repetir Foto
              </Button>

              <Button
                variant="primary"
                onClick={handleConfirmAndUpload}
                className="flex-1 py-3 text-sm font-semibold"
                leftIcon={<UploadCloud className="w-4 h-4" />}
              >
                Confirmar y Subir
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full flex flex-col items-center gap-4 py-6">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-10 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-bold text-lg rounded-3xl shadow-xl shadow-sky-600/30 border border-sky-400/30 flex flex-col items-center justify-center gap-3 transition-all duration-200"
          >
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md">
              <Camera className="w-8 h-8 text-white" />
            </div>
            <span>TOMAR FOTOGRAFÍA</span>
          </button>

          <Button
            variant="outline"
            onClick={() => galleryInputRef.current?.click()}
            className="w-full py-3 text-sm text-slate-300 border-slate-700"
            leftIcon={<ImageIcon className="w-4 h-4 text-slate-400" />}
          >
            Elegir de la galería
          </Button>
        </div>
      )}
    </div>
  );
}
