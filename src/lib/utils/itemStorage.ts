import { Project, ProjectItem } from '@/lib/types';
import { normalizeProjectId } from './project';

/**
 * Utilidades para sincronizar y limpiar de forma consistente los ítems en localStorage,
 * evitando que fotos eliminadas revivan o se queden trabadas en el cliente.
 */

export function removeLocalProjectItem(projectId: string, itemId: string, position?: number) {
  if (typeof window === 'undefined') return;

  const normalized = normalizeProjectId(projectId);
  const keysToClean = Array.from(new Set([`demo_items_${projectId}`, `demo_items_${normalized}`]));

  for (const key of keysToClean) {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const items: ProjectItem[] = JSON.parse(stored);
        const filtered = items.filter((i) => i.id !== itemId && (position === undefined || i.position !== position));
        if (filtered.length === 0) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify(filtered));
        }
      }
    } catch (_e) {
      // Ignorar error de parseo
    }
  }

  window.dispatchEvent(new Event('storage'));
}

export function removeLocalProjectItems(projectId: string, itemIds: string[]) {
  if (typeof window === 'undefined' || itemIds.length === 0) return;

  const idSet = new Set(itemIds);
  const normalized = normalizeProjectId(projectId);
  const keysToClean = Array.from(new Set([`demo_items_${projectId}`, `demo_items_${normalized}`]));

  for (const key of keysToClean) {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const items: ProjectItem[] = JSON.parse(stored);
        const filtered = items.filter((i) => !idSet.has(i.id));
        if (filtered.length === 0) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify(filtered));
        }
      }
    } catch (_e) {
      // Ignorar error de parseo
    }
  }

  window.dispatchEvent(new Event('storage'));
}

export function clearLocalProject(projectId: string) {
  if (typeof window === 'undefined') return;

  const normalized = normalizeProjectId(projectId);
  const keysToRemove = [
    `demo_items_${projectId}`,
    `demo_items_${normalized}`,
    `fotogrid_copied_${projectId}`,
    `fotogrid_copied_${normalized}`,
  ];

  for (const key of keysToRemove) {
    try {
      localStorage.removeItem(key);
    } catch (_e) {}
  }

  // Reiniciar next_position en demo_projects si existe
  try {
    const demoProjects: Project[] = JSON.parse(localStorage.getItem('demo_projects') || '[]');
    let modified = false;
    for (const p of demoProjects) {
      if (p.id === projectId || p.id === normalized) {
        p.next_position = 1;
        modified = true;
      }
    }
    if (modified) {
      localStorage.setItem('demo_projects', JSON.stringify(demoProjects));
    }
  } catch (_e) {}

  window.dispatchEvent(new Event('storage'));
}
