import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { PendingUpload } from '@/lib/types';

interface FotoGridDB extends DBSchema {
  pending_uploads: {
    key: string;
    value: PendingUpload;
    indexes: { 'by-project': string };
  };
}

const DB_NAME = 'fotogrid-live-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<FotoGridDB>> | null = null;

function getDB() {
  if (!dbPromise && typeof window !== 'undefined') {
    dbPromise = openDB<FotoGridDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pending_uploads')) {
          const store = db.createObjectStore('pending_uploads', { keyPath: 'id' });
          store.createIndex('by-project', 'project_id');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Guarda una subida pendiente en IndexedDB para resiliencia offline.
 */
export async function savePendingUpload(upload: PendingUpload): Promise<void> {
  const db = await getDB();
  if (db) {
    await db.put('pending_uploads', upload);
  }
}

/**
 * Obtiene todas las subidas pendientes de un proyecto o de todos.
 */
export async function getPendingUploads(projectId?: string): Promise<PendingUpload[]> {
  const db = await getDB();
  if (!db) return [];

  if (projectId) {
    return await db.getAllFromIndex('pending_uploads', 'by-project', projectId);
  }
  return await db.getAll('pending_uploads');
}

/**
 * Elimina una subida completada o cancelada de IndexedDB.
 */
export async function removePendingUpload(id: string): Promise<void> {
  const db = await getDB();
  if (db) {
    await db.delete('pending_uploads', id);
  }
}
