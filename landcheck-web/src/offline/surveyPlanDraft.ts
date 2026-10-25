import { getAnonymousSurveyLocalScope, getSurveyLocalScope, surveyLocalStorageKey } from "./surveyLocalScope";

type DraftEnvelope<T = any> = {
  id: string;
  updatedAt: string;
  state: T;
};

const DB_NAME = "landcheck-local-first";
const STORE_NAME = "survey-plan-drafts";
const DB_VERSION = 2;
const FALLBACK_KEY = "landcheck_survey_plan_drafts_v1";

function supportsIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (oldVersion < 2) {
        const store = request.transaction?.objectStore(STORE_NAME);
        if (store) {
          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const row = cursor.value as DraftEnvelope;
            if (row?.id && !String(row.id).includes("::")) {
              store.put({ ...row, id: surveyLocalStorageKey(String(row.id), getAnonymousSurveyLocalScope()) });
            }
            cursor.continue();
          };
        }
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

const scopedDraftId = (id: string) => surveyLocalStorageKey(id, getSurveyLocalScope());

const readLegacyAnonymousDraft = <T = any>(id: string): DraftEnvelope<T> | null => {
  if (getSurveyLocalScope().startsWith("user:")) return null;
  const fallback = readFallbackMap();
  return (fallback[id] as DraftEnvelope<T>) || null;
};

export async function loadSurveyPlanDraft<T = any>(id = "active"): Promise<DraftEnvelope<T> | null> {
  const storageId = scopedDraftId(id);
  if (!supportsIndexedDb()) {
    const fallback = readFallbackMap();
    const scoped = (fallback[storageId] as DraftEnvelope<T>) || null;
    if (scoped) return scoped;
    const legacy = readLegacyAnonymousDraft<T>(id);
    if (legacy) {
      fallback[storageId] = { ...legacy, id } as DraftEnvelope;
      writeFallbackMap(fallback);
    }
    return legacy;
  }

  try {
    return await withStore("readonly", (store) => {
      return new Promise<DraftEnvelope<T> | null>((resolve, reject) => {
        const request = store.get(storageId);
        request.onsuccess = () => {
          const scoped = (request.result as DraftEnvelope<T>) || null;
          if (scoped || getSurveyLocalScope().startsWith("user:")) {
            resolve(scoped);
            return;
          }
          const legacyRequest = store.get(id);
          legacyRequest.onsuccess = () => {
            const legacy = (legacyRequest.result as DraftEnvelope<T>) || null;
            resolve(legacy);
          };
          legacyRequest.onerror = () => reject(legacyRequest.error);
        };
        request.onerror = () => reject(request.error);
      });
    });
  } catch {
    const fallback = readFallbackMap();
    const scoped = (fallback[storageId] as DraftEnvelope<T>) || null;
    if (scoped) return scoped;
    const legacy = readLegacyAnonymousDraft<T>(id);
    if (legacy) {
      fallback[storageId] = { ...legacy, id } as DraftEnvelope;
      writeFallbackMap(fallback);
    }
    return legacy;
  }
}

export async function saveSurveyPlanDraft<T = any>(id: string, state: T): Promise<string> {
  const updatedAt = new Date().toISOString();
  const record: DraftEnvelope<T> = { id, updatedAt, state };
  const storageId = scopedDraftId(id);

  if (!supportsIndexedDb()) {
    const fallback = readFallbackMap();
    fallback[storageId] = record as DraftEnvelope;
    writeFallbackMap(fallback);
    return updatedAt;
  }

  try {
    await withStore("readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.put({ ...record, id: storageId });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  } catch {
    const fallback = readFallbackMap();
    fallback[storageId] = record as DraftEnvelope;
    writeFallbackMap(fallback);
  }

  return updatedAt;
}

export async function clearSurveyPlanDraft(id = "active"): Promise<void> {
  const storageId = scopedDraftId(id);
  if (!supportsIndexedDb()) {
    const fallback = readFallbackMap();
    delete fallback[storageId];
    writeFallbackMap(fallback);
    return;
  }

  try {
    await withStore("readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.delete(storageId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  } catch {
    const fallback = readFallbackMap();
    delete fallback[storageId];
    writeFallbackMap(fallback);
  }
}
