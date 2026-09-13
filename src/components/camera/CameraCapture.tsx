'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/lib/utils/image';
import { normalizeProjectId, generateUUID } from '@/lib/utils/project';
import { savePendingUpload } from '@/lib/utils/queue';
import {
  Camera,
  Image as ImageIcon,
  RefreshCw,
  UploadCloud,
  Zap,
  ShieldCheck,
  Send,
  Video,
  VideoOff,
  SwitchCamera,
  Check,
  Loader2,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { Project, ProjectItem } from '@/lib/types';

interface QueueItem {
  id: string;
  itemId: string;
  position: number;
  file: File;
  previewUrl: string;
  timestamp: number;
  status: 'pending' | 'compressing' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
  version?: number;
}

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Estados de captura actual
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentPosition, setCurrentPosition] = useState<number>(
    replacementTargetItem ? replacementTargetItem.position : project.next_position || 1
  );

  // Opciones de disparo
  const [autoUpload, setAutoUpload] = useState<boolean>(false);
  const [liveStreamActive, setLiveStreamActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Cola de subida en segundo plano
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  const [sentCount, setSentCount] = useState<number>(0);
  const isProcessingQueue = useRef<boolean>(false);

  const normalizedProjectId = normalizeProjectId(project.id);

  // Actualizar posición objetivo inicial
  useEffect(() => {
    if (replacementTargetItem) {
      setCurrentPosition(replacementTargetItem.position);
    } else if (project.next_position) {
      setCurrentPosition((prev) => Math.max(prev, project.next_position));
    }
  }, [project.next_position, replacementTargetItem]);

  // Manejo del flujo de cámara en vivo (getUserMedia) si el usuario lo activa
  useEffect(() => {
    let stream: MediaStream | null = null;

    if (liveStreamActive && !previewUrl) {
      navigator.mediaDevices
        ?.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        .then((mediaStream) => {
          stream = mediaStream;
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
            videoRef.current.play().catch(() => {});
          }
        })
        .catch((err) => {
          console.warn('No se pudo acceder a la cámara en vivo:', err);
          showToast('No se pudo activar la cámara en pantalla. Usa el disparador nativo.', 'info');
          setLiveStreamActive(false);
        });
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [liveStreamActive, facingMode, previewUrl, showToast]);

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // ----------------------------------------------------
  // WORKER DE COLA EN SEGUNDO PLANO (NON-BLOCKING)
  // ----------------------------------------------------
  const processNextQueueItem = useCallback(async () => {
    if (isProcessingQueue.current) return;

    setUploadQueue((currentQueue) => {
      const nextItemIndex = currentQueue.findIndex((item) => item.status === 'pending');
      if (nextItemIndex === -1) return currentQueue;

      isProcessingQueue.current = true;
      const targetItem = currentQueue[nextItemIndex];

      const updatedQueue = [...currentQueue];
      updatedQueue[nextItemIndex] = { ...targetItem, status: 'compressing' };

      (async () => {
        try {
          // 1. Optimizar imagen velozmente
          const processed = await compressImage(targetItem.file);

          setUploadQueue((q) =>
            q.map((it) => (it.id === targetItem.id ? { ...it, status: 'uploading' } : it))
          );

          let finalPublicUrl: string | undefined = undefined;
          let isUploadedToServer = false;

          // 2. Enviar a /api/items
          try {
            const formData = new FormData();
            const baseItem: Partial<ProjectItem> = {
              id: targetItem.itemId,
              project_id: normalizedProjectId,
              position: targetItem.position,
              status: 'active',
              original_filename: targetItem.file.name,
              mime_type: processed.file.type,
              file_size: processed.file.size,
              width: processed.width,
              height: processed.height,
              captured_at: new Date(targetItem.timestamp).toISOString(),
              uploaded_at: new Date().toISOString(),
              version: targetItem.version || 1,
            };

            formData.append('item', JSON.stringify(baseItem));
            formData.append('file', processed.file);

            const res = await fetch('/api/items', {
              method: 'POST',
              body: formData,
            });

            if (res.ok) {
              const json = await res.json();
              if (json.item?.public_url) {
                finalPublicUrl = json.item.public_url;
                isUploadedToServer = true;
              }
            }
          } catch (apiErr) {
            console.warn('Aviso API /api/items:', apiErr);
          }

          if (!finalPublicUrl) {
            finalPublicUrl = await fileToDataUrl(processed.file);
          }

          const activeItem: ProjectItem = {
            id: targetItem.itemId,
            project_id: normalizedProjectId,
            position: targetItem.position,
            status: 'active',
            storage_path: isUploadedToServer ? `public/${normalizedProjectId}/${targetItem.itemId}` : null,
            original_filename: targetItem.file.name,
            mime_type: processed.file.type,
            file_size: processed.file.size,
            width: processed.width,
            height: processed.height,
            captured_at: new Date(targetItem.timestamp).toISOString(),
            uploaded_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            version: targetItem.version || 1,
            error_message: null,
            public_url: finalPublicUrl,
          };

          // 3. Guardar en localStorage para visor local inmediato
          if (typeof window !== 'undefined') {
            const existing: ProjectItem[] = JSON.parse(
              localStorage.getItem(`demo_items_${normalizedProjectId}`) || '[]'
            );

            const updated = existing.filter(
              (i) => i.position !== targetItem.position && i.id !== targetItem.itemId
            );
            updated.push(activeItem);
            updated.sort((a, b) => a.position - b.position);

            localStorage.setItem(`demo_items_${normalizedProjectId}`, JSON.stringify(updated));
            if (project.id !== normalizedProjectId) {
              localStorage.setItem(`demo_items_${project.id}`, JSON.stringify(updated));
            }

            const demoProjects: Project[] = JSON.parse(
              localStorage.getItem('demo_projects') || '[]'
            );
            const pIndex = demoProjects.findIndex(
              (p) => p.id === project.id || p.id === normalizedProjectId
            );
            if (pIndex >= 0) {
              demoProjects[pIndex].next_position = Math.max(
                demoProjects[pIndex].next_position || 1,
                targetItem.position + 1
              );
              localStorage.setItem('demo_projects', JSON.stringify(demoProjects));
            }

            window.dispatchEvent(new Event('storage'));
          }

          // 4. Emitir evento Realtime
          try {
            const channel = supabase.channel(`project_items:${normalizedProjectId}`);
            channel.subscribe((subStatus) => {
              if (subStatus === 'SUBSCRIBED') {
                channel.send({
                  type: 'broadcast',
                  event: 'new_photo',
                  payload: {
                    item: activeItem,
                    itemId: activeItem.id,
                    position: targetItem.position,
                    timestamp: new Date().toISOString(),
                  },
                });
              }
            });
          } catch (_bcErr) {}

          // 5. Marcar como éxito en la cola
          setUploadQueue((q) =>
            q.map((it) => (it.id === targetItem.id ? { ...it, status: 'success' } : it))
          );
          setSentCount((prev) => prev + 1);
          onUploadSuccess();

          setTimeout(() => {
            setUploadQueue((q) => q.filter((it) => it.id !== targetItem.id));
          }, 2000);
        } catch (err: any) {
          console.error('Error procesando item de cola:', err);
          try {
            await savePendingUpload({
              id: targetItem.id,
              item_id: targetItem.itemId,
              project_id: normalizedProjectId,
              position: targetItem.position,
              file: targetItem.file,
              filename: targetItem.file.name,
              timestamp: targetItem.timestamp,
              retry_count: 0,
              status: 'failed',
              error_message: err.message || 'Error de conexión',
              preview_url: targetItem.previewUrl,
            });
          } catch (_dbErr) {}

          setUploadQueue((q) =>
            q.map((it) =>
              it.id === targetItem.id
                ? { ...it, status: 'error', errorMessage: err.message || 'Error al subir' }
                : it
            )
          );
        } finally {
          isProcessingQueue.current = false;
        }
      })();

      return updatedQueue;
    });
  }, [normalizedProjectId, onUploadSuccess, project.id, supabase]);

  // Disparar procesamiento cuando haya cambios en la cola
  useEffect(() => {
    const hasPending = uploadQueue.some((it) => it.status === 'pending');
    if (hasPending && !isProcessingQueue.current) {
      processNextQueueItem();
    }
  }, [uploadQueue, processNextQueueItem]);

  // ----------------------------------------------------
  // ENCOLAR FOTOGRAFÍA (INMEDIATO Y SIN BLOQUEO)
  // ----------------------------------------------------
  const enqueuePhoto = (fileToEnqueue: File, preview: string) => {
    let targetPos: number;
    let targetItemId: string;
    let currentVersion = 1;

    if (replacementTargetItem) {
      targetPos = replacementTargetItem.position;
      targetItemId = replacementTargetItem.id;
      currentVersion = (replacementTargetItem.version || 1) + 1;
    } else {
      targetPos = currentPosition;
      targetItemId = generateUUID();
      setCurrentPosition((prev) => prev + 1);
    }

    const newQueueItem: QueueItem = {
      id: generateUUID(),
      itemId: targetItemId,
      position: targetPos,
      file: fileToEnqueue,
      previewUrl: preview,
      timestamp: Date.now(),
      status: 'pending',
      version: currentVersion,
    };

    setUploadQueue((prev) => [...prev, newQueueItem]);
    showToast(`¡Foto #${targetPos} en cola de subida!`, 'success');

    // Despejar vista previa de inmediato para dejar la cámara lista en 0 segundos
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';

    if (replacementTargetItem && onCancelReplacement) {
      onCancelReplacement();
    }
  };

  const handleFileSelected = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Selecciona únicamente un archivo de imagen.', 'error');
      return;
    }

    const url = URL.createObjectURL(file);

    if (autoUpload) {
      enqueuePhoto(file, url);
    } else {
      setSelectedFile(file);
      setPreviewUrl(url);
    }
  };

  const handleNativeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  };

  const handleCaptureLiveFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `foto_${currentPosition}_${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });
      handleFileSelected(file);
    }, 'image/jpeg', 0.9);
  };

  const handleDiscardPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleConfirmSend = () => {
    if (selectedFile && previewUrl) {
      enqueuePhoto(selectedFile, previewUrl);
    }
  };

  const pendingCount = uploadQueue.filter((it) => it.status !== 'success').length;
  const activeUploadingItem = uploadQueue.find(
    (it) => it.status === 'compressing' || it.status === 'uploading'
  );

  return (
    <div className="w-full max-w-md flex flex-col items-center gap-3">
      {/* WIDGET DE COLA EN SEGUNDO PLANO (NO BLOQUEANTE) */}
      {pendingCount > 0 && (
        <div className="w-full bg-slate-900/90 border border-sky-800/80 rounded-2xl p-3 shadow-xl animate-fade-in">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-300">
              <UploadCloud className="w-4 h-4 text-sky-400 animate-bounce" />
              <span>
                {activeUploadingItem
                  ? `Subiendo Foto #${activeUploadingItem.position}...`
                  : 'Procesando fotos en cola...'}
              </span>
            </div>
            <span className="text-[11px] font-mono font-bold bg-sky-950 text-sky-400 px-2 py-0.5 rounded-full border border-sky-800">
              {pendingCount} en cola
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
            {uploadQueue.map((item) => (
              <div
                key={item.id}
                className="relative w-12 h-12 rounded-lg overflow-hidden border shrink-0 bg-slate-950 border-slate-700"
              >
                <img src={item.previewUrl} alt={`Foto ${item.position}`} className="w-full h-full object-cover" />
                <span className="absolute top-0.5 left-0.5 bg-slate-950/90 font-mono text-[9px] font-bold text-sky-300 px-1 rounded">
                  #{item.position}
                </span>
                <div className="absolute inset-0 bg-slate-950/40 flex items-center justify-center">
                  {item.status === 'pending' && <Layers className="w-3.5 h-3.5 text-slate-300" />}
                  {(item.status === 'compressing' || item.status === 'uploading') && (
                    <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                  )}
                  {item.status === 'success' && <Check className="w-4 h-4 text-emerald-400 font-bold" />}
                  {item.status === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TARJETA PRINCIPAL DEL DISPARADOR MÓVIL */}
      <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col items-center">
        <div className="w-full flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
          <div className="min-w-0 pr-2">
            <span className="text-[10px] font-semibold text-sky-400 uppercase tracking-wider block">
              Modo Fotografía Continuo
            </span>
            <h2 className="text-base font-bold text-white truncate max-w-[200px]">{project.name}</h2>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-950 border border-sky-800 rounded-full text-xs text-sky-300 font-mono font-bold shrink-0">
            <span>Siguiente: #{currentPosition}</span>
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
          onChange={handleNativeInputChange}
          className="hidden"
          id="camera-input-native"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleNativeInputChange}
          className="hidden"
          id="gallery-input"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* ESTADO 1: VISTA PREVIA RÁPIDA (TOMAR -> VISUALIZAR -> ENVIAR) */}
        {previewUrl ? (
          <div className="w-full flex flex-col items-center gap-3 animate-fade-in">
            <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner">
              <img src={previewUrl} alt="Foto capturada" className="w-full h-full object-contain" />

              <div className="absolute top-2.5 left-2.5 bg-sky-600/90 text-white font-mono font-bold text-xs px-2.5 py-1 rounded-xl shadow border border-sky-400/40">
                Casilla #{currentPosition}
              </div>
            </div>

            <div className="w-full flex items-center gap-2 pt-1">
              <Button
                variant="secondary"
                onClick={handleDiscardPreview}
                className="py-3 text-xs sm:text-sm flex-1 text-slate-300"
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Descartar
              </Button>

              <button
                onClick={handleConfirmSend}
                className="flex-[2] py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-600/40 border border-emerald-400/40 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Enviar y Tomar Siguiente</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              Al presionar enviar, la foto se encola en segundo plano y la cámara queda lista al instante.
            </p>
          </div>
        ) : liveStreamActive ? (
          /* ESTADO 2: CÁMARA WEB EN PANTALLA EN VIVO */
          <div className="w-full flex flex-col items-center gap-3 animate-fade-in">
            <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-black border border-slate-800">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover"
              />

              <div className="absolute top-2.5 left-2.5 bg-slate-950/80 text-white font-mono font-bold text-xs px-2.5 py-1 rounded-xl border border-slate-700">
                Casilla #{currentPosition}
              </div>

              <button
                onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                className="absolute top-2.5 right-2.5 p-2 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full border border-slate-700 active:scale-95"
                title="Cambiar cámara"
              >
                <SwitchCamera className="w-4 h-4" />
              </button>
            </div>

            <div className="w-full flex items-center justify-center py-2">
              <button
                onClick={handleCaptureLiveFrame}
                className="w-20 h-20 rounded-full bg-white/20 border-4 border-white flex items-center justify-center active:scale-90 transition-transform shadow-2xl group cursor-pointer"
                aria-label="Disparar foto"
              >
                <div className="w-14 h-14 rounded-full bg-white group-hover:bg-sky-400 transition-colors" />
              </button>
            </div>

            <button
              onClick={() => setLiveStreamActive(false)}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 mt-1 cursor-pointer"
            >
              <VideoOff className="w-3.5 h-3.5" />
              <span>Usar disparador nativo de Android</span>
            </button>
          </div>
        ) : (
          /* ESTADO 3: BOTÓN DE DISPARO PRINCIPAL (CÁMARA ANDROID NATIVA) */
          <div className="w-full flex flex-col items-center gap-3.5 py-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-10 sm:py-12 bg-gradient-to-b from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 active:scale-95 text-white font-bold text-lg sm:text-xl rounded-2xl sm:rounded-3xl shadow-2xl shadow-sky-500/40 border border-sky-300/40 flex flex-col items-center justify-center gap-2.5 transition-all duration-200 group cursor-pointer"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30 group-hover:scale-110 transition-transform shadow-inner">
                <Camera className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
              </div>
              <span className="tracking-wide text-base sm:text-xl">TOMAR FOTOGRAFÍA</span>
              <span className="text-[11px] sm:text-xs font-normal text-sky-100/90">
                Toca para abrir la cámara de tu teléfono
              </span>
            </button>

            {/* Toggle de Disparo Ráfaga */}
            <div className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Zap
                  className={`w-4 h-4 shrink-0 ${
                    autoUpload ? 'text-amber-400 fill-amber-400' : 'text-slate-500'
                  }`}
                />
                <div>
                  <span className="font-semibold block text-white text-xs">Modo Ráfaga (Auto-Encolar)</span>
                  <span className="text-[10px] text-slate-400 block">
                    Toma y encola al instante sin pedir confirmación
                  </span>
                </div>
              </div>

              <button
                onClick={() => setAutoUpload(!autoUpload)}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer ${
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

            {/* Botones complementarios: Galería y Cámara en Pantalla */}
            <div className="w-full flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => galleryInputRef.current?.click()}
                className="flex-1 py-2 text-xs text-slate-300 border-slate-800"
                leftIcon={<ImageIcon className="w-4 h-4 text-slate-400" />}
              >
                Galería
              </Button>

              <Button
                variant="outline"
                onClick={() => setLiveStreamActive(true)}
                className="flex-1 py-2 text-xs text-slate-300 border-slate-800"
                leftIcon={<Video className="w-4 h-4 text-sky-400" />}
              >
                Cámara en Pantalla
              </Button>
            </div>

            {sentCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs font-semibold text-emerald-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>{sentCount} {sentCount === 1 ? 'foto sincronizada' : 'fotos sincronizadas'}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
