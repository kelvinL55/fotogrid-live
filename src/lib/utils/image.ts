import imageCompression from 'browser-image-compression';
import { APP_CONFIG } from '@/lib/config';

export interface ProcessedImageResult {
  file: File;
  width: number;
  height: number;
}

/**
 * Obtiene las dimensiones de un objeto File o Blob de imagen.
 */
export function getImageDimensions(file: File | Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const dimensions = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dimensions);
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudieron leer las dimensiones de la imagen.'));
    };

    img.src = url;
  });
}

/**
 * Comprime una imagen en el navegador corrigiendo su orientación si es necesario.
 * Si la compresión está desactivada en la configuración o falla, devuelve el archivo original o procesado por Canvas.
 */
export async function compressImage(file: File): Promise<ProcessedImageResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo seleccionado no es una imagen válida.');
  }

  // Si la compresión está desactivada o el archivo es muy pequeño (< 300KB), se retornan sus dimensiones
  if (!APP_CONFIG.compression.enabled && file.size < 300 * 1024) {
    const dimensions = await getImageDimensions(file);
    return { file, ...dimensions };
  }

  try {
    const options = {
      maxSizeMB: APP_CONFIG.compression.maxSizeMB,
      maxWidthOrHeight: APP_CONFIG.compression.maxWidthOrHeight,
      useWebWorker: true,
      fileType: APP_CONFIG.compression.fileType,
      initialQuality: APP_CONFIG.compression.initialQuality,
    };

    const compressedFile = await imageCompression(file, options);
    const dimensions = await getImageDimensions(compressedFile);

    // Asegurar que el objeto conserve el nombre original
    const renamedFile = new File([compressedFile], file.name, {
      type: compressedFile.type,
      lastModified: Date.now(),
    });

    return { file: renamedFile, ...dimensions };
  } catch (error) {
    console.warn('Falló la compresión con browser-image-compression, usando archivo original:', error);
    const dimensions = await getImageDimensions(file);
    return { file, ...dimensions };
  }
}
