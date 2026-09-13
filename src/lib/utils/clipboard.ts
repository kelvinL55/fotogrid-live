const pngCache = new Map<string, Blob>();

/**
 * Intenta extraer el Blob PNG directamente de una imagen que ya esté cargada en el DOM.
 * Esto permite copiar de forma instantánea (<10ms) sin realizar ninguna petición de red.
 */
function getBlobFromDomImage(imageUrl: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      if (typeof document === 'undefined') return resolve(null);

      const imgs = Array.from(document.querySelectorAll('img'));
      const found = imgs.find(
        (img) =>
          img.src &&
          (img.src === imageUrl || img.src.startsWith(imageUrl) || imageUrl.startsWith(img.src))
      );

      if (found && found.complete && found.naturalWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = found.naturalWidth;
        canvas.height = found.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);

        ctx.drawImage(found, 0, 0);
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/png');
        return;
      }
    } catch (_e) {
      // Si el canvas se vuelve tainted por CORS u otro motivo, continuar con fallback
    }
    resolve(null);
  });
}

/**
 * Convierte un Blob de cualquier formato a PNG usando HTMLCanvasElement.
 */
function convertBlobToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo crear contexto de Canvas 2D'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          resolve(pngBlob);
        } else {
          reject(new Error('Error al generar el Blob PNG'));
        }
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Error al cargar la imagen para conversión PNG'));
    };

    img.src = url;
  });
}

/**
 * Resuelve el Blob PNG optimizado con caché y fallback a red con timeout seguro.
 */
async function resolvePngBlob(imageUrl: string): Promise<Blob> {
  // 1. Caché en memoria
  const cached = pngCache.get(imageUrl);
  if (cached) return cached;

  // 2. Extraer de elemento <img> del DOM si ya está pintado en pantalla (instantáneo)
  try {
    const domBlob = await getBlobFromDomImage(imageUrl);
    if (domBlob) {
      pngCache.set(imageUrl, domBlob);
      return domBlob;
    }
  } catch (_e) {}

  // 3. Descarga controlada por red con timeout de 8 segundos para evitar bloqueos
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(imageUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
    }
    const blob = await response.blob();
    const finalPng = blob.type === 'image/png' ? blob : await convertBlobToPng(blob);
    pngCache.set(imageUrl, finalPng);
    return finalPng;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Copia una imagen al portapapeles usando el estándar PNG requerido por Gemini y DeepSeek.
 * Prioriza la extracción DOM instantánea para no depender del estado de la red ni trabar la interfaz.
 */
export async function copyImageToClipboard(imageUrl: string): Promise<{ success: boolean; message: string }> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return {
      success: false,
      message: 'El portapapeles no está disponible en este entorno.',
    };
  }

  try {
    const blobPromise = resolvePngBlob(imageUrl);

    // En Chrome moderno, pasar la promesa dentro de ClipboardItem garantiza
    // que el registro de permiso ocurra de inmediato durante el gesto del usuario.
    let item: ClipboardItem;
    try {
      item = new ClipboardItem({
        'image/png': blobPromise,
      });
    } catch (_e) {
      const resolvedBlob = await blobPromise;
      item = new ClipboardItem({
        'image/png': resolvedBlob,
      });
    }

    await navigator.clipboard.write([item]);

    return {
      success: true,
      message: '¡Imagen copiada al portapapeles! Lista para pegar en Gemini o DeepSeek (Ctrl+V).',
    };
  } catch (error: any) {
    console.warn('Fallo al copiar imagen binaria PNG, intentando fallback de texto:', error);

    // Fallback de contingencia: copiar enlace directo de la imagen
    try {
      await navigator.clipboard.writeText(imageUrl);
      return {
        success: true,
        message: 'Enlace de la imagen copiado al portapapeles.',
      };
    } catch (_fallbackErr) {
      return {
        success: false,
        message: `No se pudo copiar: ${error.message || 'Permiso denegado por el navegador'}.`,
      };
    }
  }
}

export function clearClipboardCache() {
  pngCache.clear();
}
