/**
 * Utilidades para normalización de IDs de proyecto y UUIDs en FotoGrid Live
 */

export const DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_PROJECT_SLUG = 'session-live-default';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(id: string): boolean {
  if (!id) return false;
  return UUID_REGEX.test(id);
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback estándar RFC4122 v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Normaliza un ID de proyecto proveniente de la URL o el cliente.
 * Si es el alias 'session-live-default', lo convierte al UUID canónico.
 * Si es un UUID válido, lo devuelve en minúsculas.
 * Si no es un UUID válido, genera uno consistente.
 */
export function normalizeProjectId(id?: string | null): string {
  if (!id) return DEFAULT_PROJECT_ID;
  const clean = id.trim();
  if (clean === DEFAULT_PROJECT_SLUG || clean === 'default') {
    return DEFAULT_PROJECT_ID;
  }
  if (isValidUUID(clean)) {
    return clean.toLowerCase();
  }
  return DEFAULT_PROJECT_ID;
}
