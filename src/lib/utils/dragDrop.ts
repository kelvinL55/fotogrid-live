import { ProjectItem } from '@/lib/types';
import { generateDownloadFilename } from './download';

// Caché en memoria para almacenar metadatos de archivos listos
const fileCache = new Map<string, File>();

/**
 * Convierte una URL pública a un objeto File y lo guarda en caché con timeout seguro.
 */
export async function getOrFetchImageFile(
  url: string,
  filename: string,
  mimeType: string = 'image/jpeg'
): Promise<File | null> {
  if (fileCache.has(url)) {
    return fileCache.get(url)!;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = blob.type || mimeType || 'image/jpeg';
    const file = new File([blob], filename, { type });
    fileCache.set(url, file);
    return file;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

let isPreloading = false;
const preloadQueue: Array<{ url: string; filename: string; mimeType: string }> = [];

async function processPreloadQueue() {
  if (isPreloading) return;
  isPreloading = true;

  while (preloadQueue.length > 0) {
    const batch = preloadQueue.splice(0, 2);
    await Promise.all(
      batch.map(async (task) => {
        try {
          await getOrFetchImageFile(task.url, task.filename, task.mimeType);
        } catch (_e) {}
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  isPreloading = false;
}

/**
 * Precarga en segundo plano los Files de los items activos de manera dosificada.
 */
export function preloadItemsFiles(items: ProjectItem[], projectName: string = 'FotoGrid') {
  if (typeof window === 'undefined') return;

  const activeItems = items.filter((i) => i.status === 'active' && Boolean(i.public_url));
  for (const item of activeItems) {
    if (item.public_url && !fileCache.has(item.public_url)) {
      const filename = generateDownloadFilename(
        projectName,
        item.position,
        item.mime_type?.includes('png') ? 'png' : 'jpg'
      );
      if (!preloadQueue.some((q) => q.url === item.public_url)) {
        preloadQueue.push({
          url: item.public_url,
          filename,
          mimeType: item.mime_type || 'image/jpeg',
        });
      }
    }
  }

  processPreloadQueue();
}

export function clearDragFileCache() {
  fileCache.clear();
  preloadQueue.length = 0;
  isPreloading = false;
}

/**
 * Crea o actualiza el elemento DOM visual flotante (ghost badge) para el arrastre.
 */
function getOrCreateDragGhostElement(count: number): HTMLElement {
  let ghost = document.getElementById('fotogrid-drag-ghost');
  if (!ghost) {
    ghost = document.createElement('div');
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
    document.body.appendChild(ghost);
  }

  ghost.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
      <circle cx="9" cy="9" r="2"/>
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
    </svg>
    <span>${count > 1 ? `${count} imágenes seleccionadas` : '1 imagen'}</span>
  `;

  return ghost;
}

export function cleanupDragGhostElement() {
  if (typeof document === 'undefined') return;
  const ghost = document.getElementById('fotogrid-drag-ghost');
  if (ghost && ghost.parentNode) {
    ghost.parentNode.removeChild(ghost);
  }
}

export interface SetupMultiDragOptions {
  event: React.DragEvent;
  targetItem: ProjectItem;
  selectedItems: ProjectItem[];
  projectName: string;
}

/**
 * Prepara el payload completo y SEGURO de Drag & Drop para una o múltiples imágenes.
 * Evita llamar a dataTransfer.items.add(File) en memoria que congela la máquina de estados de Chromium en Windows.
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

  try {
    // 1. URLs en listas estándar para aplicaciones web y clientes (ChatGPT, Gemini, etc.)
    event.dataTransfer.setData('text/uri-list', urls.join('\r\n'));
    event.dataTransfer.setData('text/plain', urls.join('\n'));

    // 2. HTML enriquecido con etiquetas <img>
    const htmlSnippet = urls.map((url, idx) => `<img src="${url}" alt="Foto ${idx + 1}" />`).join('\n');
    event.dataTransfer.setData('text/html', htmlSnippet);

    // 3. Formato nativo DownloadURL para navegadores basados en Chromium (permite arrastrar a carpetas/escritorio)
    if (itemsToDrag.length === 1 && itemsToDrag[0].public_url) {
      const item = itemsToDrag[0];
      const mime = item.mime_type || 'image/jpeg';
      const filename = generateDownloadFilename(
        projectName,
        item.position,
        mime.includes('png') ? 'png' : 'jpg'
      );
      event.dataTransfer.setData('DownloadURL', `${mime}:${filename}:${item.public_url}`);
    }

    // 4. Metadatos JSON estructurados
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
    // Si algún navegador restringe ciertos tipos, continuar con los básicos
  }

  event.dataTransfer.effectAllowed = 'copyMove';

  // 5. Configurar drag ghost seguro
  if (typeof document !== 'undefined' && event.dataTransfer.setDragImage) {
    const ghostEl = getOrCreateDragGhostElement(itemsToDrag.length);
    event.dataTransfer.setDragImage(ghostEl, 20, 20);
  }

  return itemsToDrag;
}
