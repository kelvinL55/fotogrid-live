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
  status: 'pending' | 'compressing' | 'uploading' | 'retrying' | 'success' | 'error';
  errorMessage?: string;
  version?: number;
  retryCount?: number;
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
  const [liveStreamActive, setLiveStreamActive] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('fotogrid_prefer_live_camera') === 'true';
    }
    return false;
  });
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Cola de subida en segundo plano
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  const uploadQueueRef = useRef<QueueItem[]>([]);
  uploadQueueRef.current = uploadQueue;

  const [sentCount, setSentCount] = useState<number>(0);
  const isProcessingQueue = useRef<boolean>(false);

  const normalizedProjectId = normalizeProjectId(project.id);

  // Sincronizar posición objetivo cuando cambia el proyecto
  useEffect(() => {
    if (replacementTargetItem) {
      setCurrentPosition(replacementTargetItem.position);
    } else if (project.next_position) {
      setCurrentPosition((prev) => Math.max(prev, project.next_position));
    }
  }, [project.next_position, replacementTargetItem]);

  // Manejo del flujo de cámara en vivo (getUserMedia) optimizado para panorámica horizontal
  useEffect(() => {
    let stream: MediaStream | null = null;

    if (liveStreamActive && !previewUrl) {
      navigator.mediaDevices
        ?.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 2560, min: 1280 },
            height: { ideal: 1440, min: 720 },
            aspectRatio: { ideal: 16 / 9 },
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
          if (typeof window !== 'undefined') {
            localStorage.removeItem('fotogrid_prefer_live_camera');
          }
        });
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [liveStreamActive, facingMode, previewUrl, showToast]);

  // ----------------------------------------------------
  // WORKER DE COLA EN SEGUNDO PLANO (FIFO SECUENCIAL Y ROBUSTO)
  // ----------------------------------------------------
  const runQueueWorker = useCallback(async () => {
    if (isProcessingQueue.current) return;
    isProcessingQueue.current = true;

    try {
      while (true) {
        // Encontrar el primer elemento en orden de cola que requiera procesamiento
        const queue = uploadQueueRef.current;
        const targetItem = queue.find(
          (it) => it.status === 'pending' || it.status === 'retrying'
        );

        if (!targetItem) break;

        // 1. Optimizar imagen
        setUploadQueue((prev) =>
          prev.map((it) => (it.id === targetItem.id ? { ...it, status: 'compressing' } : it))
        );

        let processed: { file: File; width: number; height: number };
        try {
          processed = await compressImage(targetItem.file);
        } catch (_compErr) {
          processed = { file: targetItem.file, width: 1920, height: 1080 };
        }

        // 2. Marcar como subiendo
        setUploadQueue((prev) =>
          prev.map((it) => (it.id === targetItem.id ? { ...it, status: 'uploading' } : it))
        );

        // 3. Subir al servidor con reintentos automáticos (Garantía de entrega tipo TCP)
        let uploadSuccess = false;
        let finalPublicUrl = '';
        let lastErrorMsg = '';
        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const formData = new FormData();
            const baseItem: Partial<ProjectItem> = {
              id: targetItem.itemId,
              project_id: normalizedProjectId,
              position: targetItem.position,
              status: 'active',
              original_filename: targetItem.file.name,
              mime_type: processed.file.type || 'image/jpeg',
              file_size: processed.file.size,
              width: processed.width,
              height: processed.height,
              captured_at: new Date(targetItem.timestamp).toISOString(),
              uploaded_at: new Date().toISOString(),
              version: targetItem.version || 1,
            };

            formData.append('item', JSON.stringify(baseItem));
            formData.append('file', processed.file);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s por intento

            const res = await fetch('/api/items', {
              method: 'POST',
              body: formData,
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (res.ok) {
              const json = await res.json();
              if (json.item?.public_url) {
                finalPublicUrl = json.item.public_url;
                uploadSuccess = true;
                break;
              } else {
                throw new Error('El servidor no devolvió una URL pública válida.');
              }
            } else {
              let msg = `Error del servidor HTTP ${res.status}`;
              try {
                const errJson = await res.json();
                if (errJson.error) msg = errJson.error;
              } catch (_e) {}
              throw new Error(msg);
            }
          } catch (err: any) {
            lastErrorMsg =
              err.name === 'AbortError'
                ? 'Conexión lenta: tiempo de espera agotado'
                : err.message || 'Error de red';

            console.warn(
              `Intento ${attempt}/${maxRetries} falló para foto #${targetItem.position}:`,
              lastErrorMsg
            );

            if (attempt < maxRetries) {
              setUploadQueue((prev) =>
                prev.map((it) =>
                  it.id === targetItem.id
                    ? {
                        ...it,
                        status: 'retrying',
                        retryCount: attempt,
                        errorMessage: `Reintentando (${attempt}/${maxRetries})...`,
                      }
                    : it
                )
              );
              // Pausa de 1.2 segundos antes del siguiente reintento
              await new Promise((resolve) => setTimeout(resolve, 1200));
            }
          }
        }

        if (uploadSuccess) {
          const activeItem: ProjectItem = {
            id: targetItem.itemId,
            project_id: normalizedProjectId,
            position: targetItem.position,
            status: 'active',
            storage_path: `public/${normalizedProjectId}/${targetItem.itemId}`,
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

          // Actualizar localStorage sin saturarlo
          if (typeof window !== 'undefined') {
            try {
              const existing: ProjectItem[] = JSON.parse(
                localStorage.getItem(`demo_items_${normalizedProjectId}`) || '[]'
              );
              const updated = existing.filter(
                (i) => i.position !== targetItem.position && i.id !== targetItem.itemId
              );
              updated.push(activeItem);
              updated.sort((a, b) => a.position - b.position);
              localStorage.setItem(`demo_items_${normalizedProjectId}`, JSON.stringify(updated));
            } catch (_e) {}
          }

          // Emitir evento Realtime al visor de escritorio
          try {
            const channel = supabase.channel(`project_items:${normalizedProjectId}`);
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
          } catch (_bcErr) {}

          // Marcar como éxito y notificar
          setUploadQueue((q) =>
            q.map((it) => (it.id === targetItem.id ? { ...it, status: 'success' } : it))
          );
          setSentCount((prev) => prev + 1);
          onUploadSuccess();

          // Retirar de la cola tras breve confirmación
          setTimeout(() => {
            setUploadQueue((q) => q.filter((it) => it.id !== targetItem.id));
          }, 1500);
        } else {
          // Si falló tras todos los reintentos, registrar y alertar
          console.error(`Fallo definitivo al subir foto #${targetItem.position}:`, lastErrorMsg);
          try {
            await savePendingUpload({
              id: targetItem.id,
              item_id: targetItem.itemId,
              project_id: normalizedProjectId,
              position: targetItem.position,
              file: targetItem.file,
              filename: targetItem.file.name,
              timestamp: targetItem.timestamp,
              retry_count: maxRetries,
              status: 'failed',
              error_message: lastErrorMsg,
              preview_url: targetItem.previewUrl,
            });
          } catch (_dbErr) {}

          setUploadQueue((q) =>
            q.map((it) =>
              it.id === targetItem.id
                ? { ...it, status: 'error', errorMessage: lastErrorMsg || 'Error al subir foto' }
                : it
            )
          );
        }
      }
    } finally {
      isProcessingQueue.current = false;
    }
  }, [normalizedProjectId, onUploadSuccess, supabase]);

  // Disparar worker ante cualquier elemento pendiente
  useEffect(() => {
    const hasWork = uploadQueue.some((it) => it.status === 'pending' || it.status === 'retrying');
    if (hasWork && !isProcessingQueue.current) {
      runQueueWorker();
    }
  }, [uploadQueue, runQueueWorker]);

  const handleRetryItem = (itemId: string) => {
    setUploadQueue((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? { ...it, status: 'pending', errorMessage: undefined, retryCount: 0 }
          : it
      )
    );
  };

  // ----------------------------------------------------
  // ENCOLAR FOTOGRAFÍA (SECUENCIAL, ESTRICTA Y SIN SALTOS)
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
      // Calcular la posición estrictamente consecutiva garantizada
      const maxQueuePos = uploadQueue.reduce((max, it) => Math.max(max, it.position), 0);
      targetPos = Math.max(currentPosition, maxQueuePos + 1, project.next_position || 1);
      targetItemId = generateUUID();
      setCurrentPosition(targetPos + 1);
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
    showToast(`¡Foto #${targetPos} en cola de subida segura!`, 'success');

    // Despejar vista previa de inmediato para dejar la cámara lista para la siguiente
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
                onClick={() => {
                  if (item.status === 'error') {
                    handleRetryItem(item.id);
                  }
                }}
                title={item.errorMessage || `Foto #${item.position}: ${item.status}`}
                className={`relative w-12 h-12 rounded-lg overflow-hidden border shrink-0 bg-slate-950 ${
                  item.status === 'error'
                    ? 'border-rose-500 ring-1 ring-rose-500/50 cursor-pointer hover:scale-105 transition-transform'
                    : 'border-slate-700'
                }`}
              >
                <img src={item.previewUrl} alt={`Foto ${item.position}`} className="w-full h-full object-cover" />
                <span className="absolute top-0.5 left-0.5 bg-slate-950/90 font-mono text-[9px] font-bold text-sky-300 px-1 rounded">
                  #{item.position}
                </span>
                <div className="absolute inset-0 bg-slate-950/40 flex items-center justify-center">
                  {item.status === 'pending' && <Layers className="w-3.5 h-3.5 text-slate-300" />}
                  {(item.status === 'compressing' || item.status === 'uploading' || item.status === 'retrying') && (
                    <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                  )}
                  {item.status === 'success' && <Check className="w-4 h-4 text-emerald-400 font-bold" />}
                  {item.status === 'error' && (
                    <div className="flex flex-col items-center">
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                      <span className="text-[7px] text-rose-300 font-bold">Reintentar</span>
                    </div>
                  )}
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

        {/* ESTADO 1: VISTA PREVIA INMERSIVA A PANTALLA COMPLETA (LANDSCAPE/PORTRAIT) */}
        {previewUrl ? (
          <div className="fixed inset-0 z-50 bg-black flex flex-col landscape:flex-row items-center justify-between overflow-hidden select-none animate-fade-in w-screen h-screen">
            {/* Contenedor de la Imagen Capturada Panorámica */}
            <div className="relative w-full h-full flex-1 bg-black flex items-center justify-center overflow-hidden p-1">
              <img
                src={previewUrl}
                alt="Foto capturada"
                className="w-full h-full object-contain"
              />

              <div className="absolute top-3 left-3 bg-sky-600/90 text-white font-mono font-bold text-xs px-3 py-1.5 rounded-xl shadow-lg border border-sky-400/40 backdrop-blur-md">
                Foto para Casilla #{currentPosition}
              </div>

              {pendingCount > 0 && (
                <div className="absolute top-3 right-3 landscape:right-36 z-30 flex items-center gap-2 px-3 py-1.5 bg-slate-900/90 border border-sky-800/90 rounded-xl text-xs text-sky-300 shadow-xl backdrop-blur-md">
                  <UploadCloud className="w-3.5 h-3.5 text-sky-400 animate-bounce" />
                  <span>{pendingCount} en cola</span>
                </div>
              )}
            </div>

            {/* BARRA LATERAL DE ACCIÓN (A LA DERECHA EN HORIZONTAL) */}
            <div className="w-full landscape:w-32 landscape:h-full bg-slate-950/90 backdrop-blur-xl border-t landscape:border-t-0 landscape:border-l border-slate-800 flex landscape:flex-col items-center justify-around landscape:justify-center gap-3 p-3 landscape:py-6 z-40 shrink-0 shadow-2xl">
              {/* Botón Principal: ENVIAR Y TOMAR SIGUIENTE (En el lateral derecho para el pulgar) */}
              <button
                onClick={handleConfirmSend}
                className="flex-1 landscape:flex-none landscape:w-20 landscape:h-20 py-3.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-90 text-white font-bold text-xs rounded-2xl landscape:rounded-full shadow-2xl shadow-emerald-500/50 border-2 border-emerald-300/60 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ring-4 ring-black/40"
              >
                <Send className="w-6 h-6 text-white" />
                <span className="text-[10px] font-extrabold uppercase tracking-tight">Enviar</span>
              </button>

              {/* Botón Secundario: DESCARTAR / REPETIR */}
              <button
                onClick={handleDiscardPreview}
                className="flex-1 landscape:flex-none landscape:w-14 landscape:h-14 py-3 px-3 bg-slate-800 hover:bg-slate-700 active:scale-90 text-slate-300 hover:text-white text-xs rounded-xl landscape:rounded-full border border-slate-700 flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer shadow-md"
                title="Descartar y volver a tomar"
              >
                <RefreshCw className="w-4 h-4 text-slate-400" />
                <span className="text-[9px] font-semibold">Repetir</span>
              </button>
            </div>
          </div>
        ) : liveStreamActive ? (
          /* ==================================================== */
          /* ESTADO 2: CÁMARA INMERSIVA EN PANTALLA COMPLETA      */
          /* HORIZONTAL (LANDSCAPE): DE BORDE A BORDE CON DISPARO A LA DERECHA */
          /* ==================================================== */
          <div className="fixed inset-0 z-50 bg-black flex flex-col landscape:flex-row items-center justify-between overflow-hidden select-none animate-fade-in w-screen h-screen">
            {/* Contenedor del Visor de Video / Preview a Pantalla Completa */}
            <div className="relative w-full h-full flex-1 bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-contain landscape:object-cover"
              />

              {/* Controles Flotantes Superiores en el Visor */}
              <div className="absolute top-3 left-3 z-30 flex items-center gap-2">
                <button
                  onClick={() => setLiveStreamActive(false)}
                  className="px-3 py-1.5 bg-slate-900/80 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold backdrop-blur-md border border-slate-700/80 flex items-center gap-1.5 shadow-lg active:scale-95 cursor-pointer"
                >
                  <VideoOff className="w-3.5 h-3.5 text-rose-400" />
                  <span>Salir</span>
                </button>

                <div className="bg-sky-950/90 text-sky-300 font-mono font-bold text-xs px-3 py-1.5 rounded-xl border border-sky-800/80 shadow-lg backdrop-blur-md">
                  Casilla #{currentPosition}
                </div>
              </div>

              {/* Widget Flotante de Cola en el Visor */}
              {pendingCount > 0 && (
                <div className="absolute top-3 right-3 landscape:right-28 z-30 flex items-center gap-2 px-3 py-1.5 bg-slate-900/90 border border-sky-800/90 rounded-xl text-xs text-sky-300 shadow-xl backdrop-blur-md">
                  <UploadCloud className="w-3.5 h-3.5 text-sky-400 animate-bounce" />
                  <span>{pendingCount} subiendo en cola...</span>
                </div>
              )}
            </div>

            {/* BARRA LATERAL DE CONTROL (A LA DERECHA EN HORIZONTAL, ABAJO EN VERTICAL) */}
            <div className="w-full landscape:w-28 landscape:h-full bg-slate-950/80 backdrop-blur-md border-t landscape:border-t-0 landscape:border-l border-slate-800 flex landscape:flex-col items-center justify-around landscape:justify-center p-3 landscape:py-6 landscape:gap-6 z-40 shrink-0 shadow-2xl">
              {/* Botón de Cambiar Cámara Frontal/Trasera */}
              <button
                onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                className="p-3 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-full border border-slate-700 active:scale-95 transition-all cursor-pointer shadow-lg"
                title="Girar cámara"
              >
                <SwitchCamera className="w-5 h-5" />
              </button>

              {/* BOTÓN OBTURADOR PRINCIPAL (EN EL LATERAL DERECHO) */}
              <button
                onClick={handleCaptureLiveFrame}
                className="w-20 h-20 landscape:w-22 landscape:h-22 rounded-full bg-white/20 border-4 border-white flex items-center justify-center active:scale-90 transition-transform shadow-2xl group cursor-pointer ring-4 ring-black/40"
                aria-label="Tomar fotografía"
              >
                <div className="w-15 h-15 landscape:w-16 landscape:h-16 rounded-full bg-white group-hover:bg-sky-400 transition-colors shadow-inner" />
              </button>

              {/* Toggle de Modo Ráfaga */}
              <button
                onClick={() => setAutoUpload(!autoUpload)}
                className={`p-3 rounded-full border active:scale-95 transition-all cursor-pointer shadow-lg ${
                  autoUpload
                    ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                    : 'bg-slate-900 border-slate-700 text-slate-500'
                }`}
                title={autoUpload ? 'Modo Ráfaga Activo (Auto-encolar)' : 'Modo Ráfaga Desactivado'}
              >
                <Zap className={`w-5 h-5 ${autoUpload ? 'fill-amber-400 text-amber-400' : ''}`} />
              </button>
            </div>
          </div>
        ) : (
          /* ESTADO 3: BOTÓN DE DISPARO PRINCIPAL (CÁMARA ANDROID NATIVA) */
          <div className="w-full flex flex-col items-center gap-3.5 py-1">
            {/* BOTÓN 1: CÁMARA EN PANTALLA PANORÁMICA (HORIZONTAL CON DISPARADOR A LA DERECHA) */}
            <button
              onClick={() => {
                setLiveStreamActive(true);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('fotogrid_prefer_live_camera', 'true');
                  document.documentElement.requestFullscreen?.().catch(() => {});
                }
              }}
              className="w-full py-5 sm:py-6 bg-gradient-to-r from-sky-600 via-sky-500 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 active:scale-95 text-white font-bold rounded-2xl shadow-xl shadow-sky-600/30 border border-sky-300/40 flex items-center justify-center gap-3 transition-all cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30 group-hover:scale-110 transition-transform">
                <Video className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <span className="block text-base font-bold">CÁMARA EN PANTALLA (HORIZONTAL)</span>
                <span className="block text-[11px] font-normal text-sky-100/90">
                  Visor de extremo a extremo con botón a la derecha
                </span>
              </div>
            </button>

            {/* BOTÓN 2: DISPARADOR NATIVO DE ANDROID */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 bg-slate-950/80 hover:bg-slate-800 active:scale-95 text-slate-200 font-semibold text-sm rounded-xl border border-slate-700/80 flex items-center justify-center gap-2.5 transition-all cursor-pointer"
            >
              <Camera className="w-5 h-5 text-sky-400" />
              <span>Usar Cámara Nativa de Android</span>
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

            {/* Botón Galería */}
            <Button
              variant="outline"
              onClick={() => galleryInputRef.current?.click()}
              className="w-full py-2.5 text-xs text-slate-300 border-slate-800"
              leftIcon={<ImageIcon className="w-4 h-4 text-slate-400" />}
            >
              Subir desde Galería
            </Button>

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
