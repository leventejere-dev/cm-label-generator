/**
 * Minimal IndexedDB blob store.
 * Only used by the local (mock / no-Supabase) repository so that a previously
 * scanned photo can still be shown when reopening a label from history.
 */

const DB_NAME = 'cm-label-generator';
const DB_VERSION = 1;
const STORE = 'source-images';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  } finally {
    db.close();
  }
}

export async function putBlob(key: string, blob: Blob): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.put(blob, key) as IDBRequest<IDBValidKey>);
  } catch {
    /* best effort — local history photo is a convenience, never load-bearing */
  }
}

export async function getBlob(key: string): Promise<Blob | null> {
  try {
    const value = await withStore<Blob | undefined>('readonly', (store) => store.get(key));
    return value ?? null;
  } catch {
    return null;
  }
}

export async function deleteBlob(key: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(key) as IDBRequest<undefined>);
  } catch {
    /* ignore */
  }
}
