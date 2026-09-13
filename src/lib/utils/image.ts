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
 * Compresión de emergencia mediante HTML5 Canvas cuando browser-image-compression
 * falla o se queda sin memoria en navegadores móviles.
 */
export async function compressImageWithCanvas(
  file: File,
  maxDimension = 2048,
  quality = 0.82
): Promise<ProcessedImageResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { naturalWidth: width, naturalHeight: height } = img;

      // Calcular escala proporcional manteniendo relación de aspecto
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback mínimo si no hay contexto canvas
        return resolve({ file, width: img.naturalWidth, height: img.naturalHeight });
      }

      // Dibujar imagen escalada
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            return resolve({ file, width, height });
          }

          const cleanName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
          const optimizedFile = new File([blob], cleanName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });

          resolve({
            file: optimizedFile,
            width,
            height,
          });
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo cargar la imagen para compresión con Canvas.'));
    };

    img.src = url;
  });
}

/**
 * Comprime una imagen en el navegador corrigiendo su orientación si es necesario.
 * Si la compresión por Worker falla, recurre a Canvas para garantizar un archivo ligero (<1.5MB).
 */
export async function compressImage(file: File): Promise<ProcessedImageResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo seleccionado no es una imagen válida.');
  }

  // Si la compresión está desactivada o el archivo ya es muy ligero (< 300KB)
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

    // Si por alguna razón el archivo resultante sigue superando los 2MB, usar canvas
    if (renamedFile.size > 2 * 1024 * 1024) {
      return await compressImageWithCanvas(renamedFile);
    }

    return { file: renamedFile, ...dimensions };
  } catch (error) {
    console.warn('Falló la compresión con Worker, aplicando compresión segura con Canvas:', error);
    try {
      return await compressImageWithCanvas(file);
    } catch (canvasErr) {
      console.warn('Falló compresión Canvas, usando dimensiones originales:', canvasErr);
      const dimensions = await getImageDimensions(file);
      return { file, ...dimensions };
    }
  }
}
