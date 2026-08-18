import { ProjectItem } from '@/lib/types';
import { generateDownloadFilename } from './download';

// Caché en memoria para almacenar objetos File listos para dataTransfer.items.add
const fileCache = new Map<string, File>();

/**
 * Convierte una URL pública a un objeto File y lo guarda en caché.
 */
export async function getOrFetchImageFile(
  url: string,
  filename: string,
  mimeType: string = 'image/jpeg'
): Promise<File | null> {
  if (fileCache.has(url)) {
    return fileCache.get(url)!;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = blob.type || mimeType || 'image/jpeg';
    const file = new File([blob], filename, { type });
    fileCache.set(url, file);
    return file;
  } catch (err) {
    console.warn(`Error al precargar File para drag & drop (${filename}):`, err);
    return null;
  }
}

/**
 * Precarga en segundo plano los Files de los items activos para que estén listos de forma síncrona en el dragstart.
 */
export function preloadItemsFiles(items: ProjectItem[], projectName: string = 'FotoGrid') {
  if (typeof window === 'undefined') return;

  const activeItems = items.filter((i) => i.status === 'active' && Boolean(i.public_url));
  activeItems.forEach((item) => {
    if (item.public_url && !fileCache.has(item.public_url)) {
      const filename = generateDownloadFilename(
        projectName,
        item.position,
        item.mime_type?.includes('png') ? 'png' : 'jpg'
      );
      getOrFetchImageFile(item.public_url, filename, item.mime_type || 'image/jpeg');
    }
  });
}

/**
 * Crea un elemento DOM visual flotante (ghost badge) para el arrastre de múltiples imágenes.
 */
function createDragGhostElement(count: number): HTMLElement {
  const ghost = document.createElement('div');
  ghost.id = 'fotogrid-drag-ghost';
  ghost.style.position = 'fixed';
  ghost.style.top = '-9999px';
  ghost.style.left = '-9999px';
  ghost.style.zIndex = '99999';
  ghost.style.pointerEvents = 'none';
  ghost.style.display = 'flex';
  ghost.style.alignItems = 'center';
  ghost.style.gap = '8px';
  ghost.style.padding = '8px 16px';
  ghost.style.backgroundColor = '#0284c7'; // Sky 600
  ghost.style.color = '#ffffff';
  ghost.style.borderRadius = '9999px';
  ghost.style.fontSize = '12px';
  ghost.style.fontWeight = 'bold';
  ghost.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)';
  ghost.style.border = '2px solid #38bdf8';
  ghost.style.fontFamily = 'system-ui, -apple-system, sans-serif';

  // Ícono SVG y texto
  ghost.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
      <circle cx="9" cy="9" r="2"/>
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
    </svg>
    <span>${count > 1 ? `${count} imágenes seleccionadas` : '1 imagen'}</span>
  `;

  document.body.appendChild(ghost);
  return ghost;
}

export interface SetupMultiDragOptions {
  event: React.DragEvent;
  targetItem: ProjectItem;
  selectedItems: ProjectItem[];
  projectName: string;
}

/**
 * Prepara el payload completo de Drag & Drop para una o múltiples imágenes.
 */
export function setupMultiImageDrag({
  event,
  targetItem,
  selectedItems,
  projectName,
}: SetupMultiDragOptions): ProjectItem[] {
  if (!targetItem.public_url) return [];

  // Determinar si arrastramos la selección múltiple o solo el elemento individual
  const isTargetInSelection = selectedItems.some((i) => i.id === targetItem.id);
  const activeSelected = selectedItems.filter((i) => i.status === 'active' && Boolean(i.public_url));

  const itemsToDrag: ProjectItem[] =
    isTargetInSelection && activeSelected.length > 1 ? activeSelected : [targetItem];

  const urls = itemsToDrag.map((i) => i.public_url!).filter(Boolean);

  // 1. Añadir Files a dataTransfer.items si están disponibles en caché
  if (event.dataTransfer && event.dataTransfer.items) {
    itemsToDrag.forEach((item) => {
      if (item.public_url) {
        const cachedFile = fileCache.get(item.public_url);
        if (cachedFile) {
          try {
            event.dataTransfer.items.add(cachedFile);
          } catch (_e) {
            // Algunos navegadores imponen restricciones
          }
        }
      }
    });
  }

  // 2. Establecer representaciones estándar de texto/URI/HTML para aplicaciones externas (ChatGPT, DeepSeek, etc.)
  try {
    event.dataTransfer.setData('text/uri-list', urls.join('\r\n'));
    event.dataTransfer.setData('text/plain', urls.join('\n'));
    
    // HTML con tags <img> para editores enriquecidos
    const htmlSnippet = urls.map((url, idx) => `<img src="${url}" alt="Foto ${idx + 1}" />`).join('\n');
    event.dataTransfer.setData('text/html', htmlSnippet);
    
    // Formato personalizado con metadatos estructurados
    event.dataTransfer.setData(
      'application/json',
      JSON.stringify(
        itemsToDrag.map((i) => ({
          id: i.id,
          position: i.position,
          url: i.public_url,
          filename: i.original_filename,
        }))
      )
    );
  } catch (_err) {
    // Ignorar si el navegador restringe tipos personalizados
  }

  event.dataTransfer.effectAllowed = 'copyMove';

  // 3. Crear ghost image visual
  if (typeof document !== 'undefined' && event.dataTransfer.setDragImage) {
    const ghostEl = createDragGhostElement(itemsToDrag.length);
    event.dataTransfer.setDragImage(ghostEl, 20, 20);

    // Limpiar el elemento del DOM tras el inicio del drag
    setTimeout(() => {
      if (ghostEl && ghostEl.parentNode) {
        ghostEl.parentNode.removeChild(ghostEl);
      }
    }, 0);
  }

  return itemsToDrag;
}
