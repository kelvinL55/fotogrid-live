/**
 * Copia una imagen al portapapeles usando navigator.clipboard.write.
 * Si el navegador exige PNG (como Chrome/Safari), convierte la imagen a Blob PNG mediante Canvas.
 */
export async function copyImageToClipboard(imageUrl: string): Promise<{ success: boolean; message: string }> {
  if (!navigator.clipboard || !window.ClipboardItem) {
    return {
      success: false,
      message: 'Tu navegador no admite la copia directa de imágenes al portapapeles. Utiliza el botón Descargar.',
    };
  }

  try {
    // 1. Descargar la imagen como Blob
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Error al obtener la imagen: ${response.statusText}`);
    }
    const blob = await response.blob();

    // 2. Convertir a PNG si no es PNG
    let pngBlob = blob;
    if (blob.type !== 'image/png') {
      pngBlob = await convertBlobToPng(blob);
    }

    // 3. Escribir en el portapapeles
    const item = new ClipboardItem({ [pngBlob.type]: pngBlob });
    await navigator.clipboard.write([item]);

    return {
      success: true,
      message: '¡Imagen copiada al portapapeles! Puedes pegarla en ChatGPT u otra app (Ctrl+V / Cmd+V).',
    };
  } catch (error: any) {
    console.error('Error al copiar la imagen al portapapeles:', error);
    return {
      success: false,
      message: `No se pudo copiar la imagen automáticamente: ${error.message || 'Permiso denegado'}. Intenta con el botón Descargar.`,
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
