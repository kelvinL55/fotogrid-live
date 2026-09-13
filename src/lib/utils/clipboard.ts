const pngCache = new Map<string, Blob>();

/**
 * Copia una imagen al portapapeles usando navigator.clipboard.write.
 * Si el navegador exige PNG (como Chrome/Safari/Edge), convierte la imagen a Blob PNG mediante Canvas.
 * Incluye caché en memoria para copiado instantáneo (<30ms) en subsecuentes toques.
 */
export async function copyImageToClipboard(imageUrl: string): Promise<{ success: boolean; message: string }> {
  if (!navigator.clipboard || !window.ClipboardItem) {
    return {
      success: false,
      message: 'Tu navegador no admite la copia directa de imágenes al portapapeles. Utiliza el botón Descargar.',
    };
  }

  try {
    let pngBlob: Blob | undefined = pngCache.get(imageUrl);

    if (!pngBlob) {
      // 1. Descargar la imagen como Blob si no está en caché
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Error al obtener la imagen: ${response.statusText}`);
      }
      const blob = await response.blob();

      // 2. Convertir a PNG si no es PNG
      if (blob.type === 'image/png') {
        pngBlob = blob;
      } else {
        pngBlob = await convertBlobToPng(blob);
      }

      // Guardar en caché para que próximas copias sean inmediatas
      pngCache.set(imageUrl, pngBlob);
    }

    // 3. Escribir en el portapapeles en formato image/png (estándar requerido por Gemini y DeepSeek)
    const item = new ClipboardItem({ 'image/png': pngBlob });
    await navigator.clipboard.write([item]);

    return {
      success: true,
      message: '¡Imagen copiada al portapapeles! Lista para pegar en Gemini o DeepSeek (Ctrl+V).',
    };
  } catch (error: any) {
    console.error('Error al copiar la imagen al portapapeles:', error);
    return {
      success: false,
      message: `No se pudo copiar: ${error.message || 'Permiso denegado'}.`,
    };
  }
}

/**
 * Convierte cualquier Blob de imagen a PNG usando HTMLCanvasElement
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
