type DraftEnvelope<T = any> = {
  id: string;
  updatedAt: string;
  state: T;
};

const DB_NAME = "landcheck-local-first";
const STORE_NAME = "survey-plan-drafts";
const DB_VERSION = 1;
const FALLBACK_KEY = "landcheck_survey_plan_drafts_v1";

function supportsIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);

    Promise.resolve(callback(store))
      .then((value) => {
        tx.oncomplete = () => {
          db.close();
          resolve(value);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      })
      .catch((error) => {
        db.close();
        reject(error);
      });
  });
}

function readFallbackMap(): Record<string, DraftEnvelope> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeFallbackMap(next: Record<string, DraftEnvelope>) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(next));
}

export async function loadSurveyPlanDraft<T = any>(id = "active"): Promise<DraftEnvelope<T> | null> {
  if (!supportsIndexedDb()) {
    const fallback = readFallbackMap();
    return (fallback[id] as DraftEnvelope<T>) || null;
  }

  try {
    return await withStore("readonly", (store) => {
      return new Promise<DraftEnvelope<T> | null>((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve((request.result as DraftEnvelope<T>) || null);
        request.onerror = () => reject(request.error);
      });
    });
  } catch {
    const fallback = readFallbackMap();
    return (fallback[id] as DraftEnvelope<T>) || null;
  }
}

export async function saveSurveyPlanDraft<T = any>(id: string, state: T): Promise<string> {
  const updatedAt = new Date().toISOString();
  const record: DraftEnvelope<T> = { id, updatedAt, state };

  if (!supportsIndexedDb()) {
    const fallback = readFallbackMap();
    fallback[id] = record as DraftEnvelope;
    writeFallbackMap(fallback);
    return updatedAt;
  }

  try {
    await withStore("readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  } catch {
    const fallback = readFallbackMap();
    fallback[id] = record as DraftEnvelope;
    writeFallbackMap(fallback);
  }

  return updatedAt;
}

export async function clearSurveyPlanDraft(id = "active"): Promise<void> {
  if (!supportsIndexedDb()) {
    const fallback = readFallbackMap();
    delete fallback[id];
    writeFallbackMap(fallback);
    return;
  }

  try {
    await withStore("readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  } catch {
    const fallback = readFallbackMap();
    delete fallback[id];
    writeFallbackMap(fallback);
  }
}
