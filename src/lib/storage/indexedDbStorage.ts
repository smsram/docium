/**
 * DOCIUM Client-Side IndexedDB Storage Layer
 *
 * Provides a resilient, high-capacity local storage engine for:
 * 1. Large conversation histories and rich AI responses
 * 2. Uploaded file binaries and image blobs
 * 3. Document contents and structured workspace state
 *
 * Bypasses the 5MB browser localStorage limit and prevents QuotaExceededError crashes.
 */

const DB_NAME = 'docium-storage-db';
const DB_VERSION = 1;

export interface StorageRecord<T = unknown> {
  key: string;
  value: T;
  updatedAt: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function getDatabase(): Promise<IDBDatabase | null> {
  if (!isBrowser()) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        // Key-value stores for large data categories
        if (!db.objectStoreNames.contains('conversations')) {
          db.createObjectStore('conversations', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('sources')) {
          db.createObjectStore('sources', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('workspaceData')) {
          db.createObjectStore('workspaceData', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onerror = (err) => {
        console.warn('[DOCIUM IndexedDB] Failed to open IndexedDB, using fallback:', err);
        resolve(null);
      };
    } catch (err) {
      console.warn('[DOCIUM IndexedDB] Unexpected error initializing IndexedDB:', err);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Save an item into an IndexedDB store.
 */
export async function idbSet<T = unknown>(
  storeName: 'conversations' | 'sources' | 'workspaceData',
  key: string,
  value: T
): Promise<boolean> {
  if (!isBrowser()) return false;
  try {
    const db = await getDatabase();
    if (!db) return false;

    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const record: StorageRecord<T> = {
        key,
        value,
        updatedAt: new Date().toISOString(),
      };
      const req = store.put(record);

      req.onsuccess = () => resolve(true);
      req.onerror = () => {
        console.warn(`[DOCIUM IndexedDB] Put error for key "${key}" in ${storeName}`);
        resolve(false);
      };
    });
  } catch (err) {
    console.warn(`[DOCIUM IndexedDB] Transaction error for key "${key}":`, err);
    return false;
  }
}

/**
 * Retrieve an item from an IndexedDB store.
 */
export async function idbGet<T = unknown>(
  storeName: 'conversations' | 'sources' | 'workspaceData',
  key: string
): Promise<T | null> {
  if (!isBrowser()) return null;
  try {
    const db = await getDatabase();
    if (!db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);

      req.onsuccess = () => {
        const res = req.result as StorageRecord<T> | undefined;
        resolve(res ? res.value : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn(`[DOCIUM IndexedDB] Get error for key "${key}":`, err);
    return null;
  }
}

/**
 * Delete an item from an IndexedDB store.
 */
export async function idbDelete(
  storeName: 'conversations' | 'sources' | 'workspaceData',
  key: string
): Promise<boolean> {
  if (!isBrowser()) return false;
  try {
    const db = await getDatabase();
    if (!db) return false;

    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    return false;
  }
}

/**
 * Clear all items in an IndexedDB store.
 */
export async function idbClear(
  storeName: 'conversations' | 'sources' | 'workspaceData'
): Promise<boolean> {
  if (!isBrowser()) return false;
  try {
    const db = await getDatabase();
    if (!db) return false;

    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    return false;
  }
}

