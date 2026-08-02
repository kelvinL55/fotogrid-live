import JSZip from 'jszip';
import { ProjectItem } from '@/lib/types';

/**
 * Formatea el número de posición con ceros a la izquierda (ej: 4 -> "004")
 */
export function formatPositionNumber(position: number): string {
  return String(position).padStart(3, '0');
}

/**
 * Genera el nombre de archivo limpio de descarga
 * Ej: "Nombre-Proyecto-004.jpg"
 */
export function generateDownloadFilename(projectName: string, position: number, extension = 'jpg'): string {
  const sanitizedProjectName = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-');
  
  const paddedPosition = formatPositionNumber(position);
  return `${sanitizedProjectName}-${paddedPosition}.${extension}`;
}

/**
 * Descarga una sola imagen directamente en el navegador.
 */
export async function downloadSingleImage(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Error al descargar el archivo');
  }
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Descarga múltiples imágenes seleccionadas empaquetadas en un archivo ZIP.
 */
export async function downloadMultipleAsZip(
  items: Array<{ item: ProjectItem; url: string }>,
  projectName: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  const zip = new JSZip();
  const folderName = projectName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const folder = zip.folder(folderName) || zip;

  let loadedCount = 0;
  const total = items.length;

  for (const { item, url } of items) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const ext = item.mime_type?.split('/')[1] || 'jpg';
        const filename = generateDownloadFilename(projectName, item.position, ext);
        folder.file(filename, blob);
      }
    } catch (err) {
      console.error(`Error al empaquetar item ${item.position} en ZIP:`, err);
    }
    loadedCount++;
    if (onProgress) {
      onProgress(Math.round((loadedCount / total) * 100));
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipFilename = `${folderName}-fotogrid.zip`;

  const blobUrl = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = zipFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}
