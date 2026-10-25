/* eslint-disable @typescript-eslint/no-explicit-any -- offline payloads mirror the existing Green API contracts. */
import type { AxiosInstance } from "axios";
import { getGreenAuthSession } from "../auth/greenAuth";
import { getWorkAuthSession } from "../auth/workAuth";

type GreenQueueActionType =
  | "create_tree"
  | "update_task"
  | "submit_task"
  | "update_tree_status"
  | "upload_photo";

type GreenQueueContext = {
  projectId?: number;
  assigneeName?: string;
};

export type GreenOfflineScope = {
  key: string;
  userId: number;
  organizationId: number | null;
  roleKey: string;
  authMode: string;
  appMode: string;
};

type GreenQueueAction = {
  id?: number;
  type: GreenQueueActionType;
  payload: Record<string, any>;
  context?: GreenQueueContext;
  scopeKey?: string;
  idempotencyKey?: string;
  createdAt?: string;
  retries?: number;
  lastError?: string;
};

type GreenPhotoRecord = {
  id?: number;
  file: Blob;
  fileName: string;
  mimeType: string;
  scopeKey?: string;
  createdAt: string;
};

type GreenConflictRecord = {
  id: number;
  type: GreenQueueActionType;
  createdAt: string;
  detail: string;
  payload: Record<string, any>;
};

const DB_NAME = "landcheck-green-offline-db";
const DB_VERSION = 2;
const STORE_KV = "kv";
const STORE_QUEUE = "queue";
const STORE_PHOTOS = "photos";
const STORE_SYNC_LOCKS = "sync-locks";

const KEY_PROJECTS = "green:projects";
const KEY_USERS = "green:users";
const KEY_CONFLICTS = "green:conflicts";
const LEGACY_SCOPE_KEY = "legacy-unscoped-v1";
const SYNC_LOCK_KEY_PREFIX = "green-sync:";
const SYNC_LEASE_MS = 5 * 60 * 1000;
const TAB_OWNER_ID = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

let dbPromise: Promise<IDBDatabase> | null = null;
let syncPromise: Promise<{ synced: number; failed: number; conflicts: number; pending: number }> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this browser context."));
  }
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const queueStore = db.createObjectStore(STORE_QUEUE, { keyPath: "id", autoIncrement: true });
        queueStore.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        const photosStore = db.createObjectStore(STORE_PHOTOS, { keyPath: "id", autoIncrement: true });
        photosStore.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SYNC_LOCKS)) {
        db.createObjectStore(STORE_SYNC_LOCKS, { keyPath: "key" });
      }
      if (oldVersion < 2) {
        for (const storeName of [STORE_KV, STORE_QUEUE, STORE_PHOTOS]) {
          if (!db.objectStoreNames.contains(storeName)) continue;
          const store = request.transaction?.objectStore(storeName);
          if (!store) continue;
          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const row = cursor.value as Record<string, unknown>;
            if (!row.scopeKey) {
              const migrated: Record<string, unknown> = { ...row, scopeKey: LEGACY_SCOPE_KEY, legacy: true };
              if (storeName === STORE_QUEUE && !migrated.idempotencyKey) {
                migrated.idempotencyKey = `legacy-queue-${String(cursor.primaryKey)}`;
              }
              store.put(migrated);
            }
            cursor.continue();
          };
        }
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // If the connection is unexpectedly closed (e.g., mobile background),
      // clear the singleton so the next call re-opens it.
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onblocked = () => reject(new Error("IndexedDB open blocked by another tab."));
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error("Failed to open IndexedDB"));
    };
  });
  return dbPromise;
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let handlerResult: T | undefined;
    let handlerError: Error | null = null;

    tx.oncomplete = () => {
      if (handlerError) reject(handlerError);
      else resolve(handlerResult as T);
    };
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));

    // Execute handler synchronously within the transaction context.
    // The handler should only use requestToPromise() which resolves
    // on the same microtask tick as the IDB request success event.
    try {
      const maybePromise = handler(store);
      if (maybePromise && typeof (maybePromise as any).then === "function") {
        (maybePromise as Promise<T>).then(
          (val) => { handlerResult = val; },
          (err) => {
            handlerError = err;
            try { tx.abort(); } catch { /* noop */ }
          },
        );
      } else {
        handlerResult = maybePromise as T;
      }
    } catch (err) {
      handlerError = err as Error;
      try { tx.abort(); } catch { /* noop */ }
    }
  });
}

async function kvSet<T>(key: string, value: T): Promise<void> {
  await withStore(STORE_KV, "readwrite", async (store) => {
    await requestToPromise(store.put({ key, value, updatedAt: new Date().toISOString() }));
  });
}

async function kvGet<T>(key: string): Promise<T | null> {
  return withStore(STORE_KV, "readonly", async (store) => {
    const row: any = await requestToPromise(store.get(key));
    return (row?.value as T) ?? null;
  });
}

function kvKeyProjectDetail(projectId: number) {
  return `project:${projectId}:detail`;
}

function kvKeyProjectTrees(projectId: number) {
  return `project:${projectId}:trees`;
}

function kvKeyTasks(projectId: number, assigneeName: string) {
  return `project:${projectId}:tasks:${assigneeName}`;
}

function kvKeyWorkOrders(projectId: number, assigneeName: string) {
  return `project:${projectId}:workorders:${assigneeName}`;
}

function kvKeyTreeTasks(treeId: number) {
  return `tree:${treeId}:tasks`;
}

function kvKeyTreeTimeline(treeId: number) {
  return `tree:${treeId}:timeline`;
}

function kvKeyProjectCustodians(projectId: number) {
  return `project:${projectId}:custodians`;
}

function kvKeyProjectAllocations(projectId: number) {
  return `project:${projectId}:allocations`;
}

function kvKeyTreeIdMap(tempTreeId: number) {
  return `tree-id-map:${tempTreeId}`;
}

const encodeScopePart = (value: unknown) => encodeURIComponent(String(value ?? "").trim() || "-");

export function buildGreenOfflineScopeKey(input: {
  userId?: number | null;
  organizationId?: number | null;
  roleKey?: string | null;
  authMode?: string | null;
  appMode?: string | null;
  allowGreen?: boolean;
  allowWork?: boolean;
}): string {
  return [
    "green",
    "user", encodeScopePart(input.userId ?? 0),
    "org", encodeScopePart(input.organizationId ?? "none"),
    "role", encodeScopePart(input.roleKey || "unknown"),
    "auth", encodeScopePart(input.authMode || "unknown"),
    "app", encodeScopePart(input.appMode || "unknown"),
    "permissions", encodeScopePart(`${input.allowGreen !== false ? "green" : ""},${input.allowWork ? "work" : ""}`),
  ].join(":");
}

export function getCurrentGreenOfflineScope(): GreenOfflineScope | null {
  if (typeof window === "undefined") return null;
  const pathname = String(window.location.pathname || "").toLowerCase();
  const workSession = getWorkAuthSession();
  const greenSession = getGreenAuthSession();
  const session = pathname.startsWith("/green-work") ? workSession || greenSession : greenSession || workSession;
  if (!session?.user || !Number.isFinite(Number(session.user.id))) return null;
  const user = session.user as any;
  const authMode = String((session as any).auth_mode || "unknown");
  const appMode = String((session as any).appMode || (pathname.startsWith("/green-work") ? "green_work" : "green"));
  return {
    key: buildGreenOfflineScopeKey({
      userId: Number(user.id),
      organizationId: user.organization_id == null ? null : Number(user.organization_id),
      roleKey: user.role_key || user.role || null,
      authMode,
      appMode,
      allowGreen: Boolean(user.allow_green),
      allowWork: Boolean(user.allow_work),
    }),
    userId: Number(user.id),
    organizationId: user.organization_id == null ? null : Number(user.organization_id),
    roleKey: String(user.role_key || user.role || "unknown"),
    authMode,
    appMode,
  };
}

function resolveScope(scope?: GreenOfflineScope | null): GreenOfflineScope | null {
  return scope || getCurrentGreenOfflineScope();
}

function requireScope(scope?: GreenOfflineScope | null): GreenOfflineScope {
  const resolved = resolveScope(scope);
  if (!resolved) throw new Error("An authenticated Green or Work account is required for offline work.");
  return resolved;
}

function scopedKvKey(scope: GreenOfflineScope, key: string): string {
  return `green:${scope.key}:${key}`;
}

function createOfflineId(prefix: string): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`.slice(0, 128);
}

function normalizeAssignee(value: string | null | undefined) {
  return String(value || "").trim();
}

export function isLikelyNetworkError(error: any): boolean {
  if (!error) return false;
  // Axios wraps errors – if there's a response from the server, it's not a network error
  if (error.response) return false;
  const message = String(error.message || "");
  const code = String(error.code || "");
  return Boolean(
    code === "ERR_NETWORK" ||
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    error.name === "TypeError" ||
    /network\s*error|failed\s*to\s*fetch|load\s*failed|net::ERR_|networkerror|offline|abort/i.test(message) ||
    (!navigator.onLine),
  );
}

async function queueAdd(action: GreenQueueAction, scope?: GreenOfflineScope): Promise<number> {
  const offlineScope = requireScope(scope);
  return withStore(STORE_QUEUE, "readwrite", async (store) => {
    const payload: GreenQueueAction = {
      ...action,
      scopeKey: offlineScope.key,
      idempotencyKey: action.idempotencyKey || createOfflineId(`green-${action.type}`),
      createdAt: action.createdAt || new Date().toISOString(),
      retries: Number(action.retries || 0),
    };
    const result = await requestToPromise(store.add(payload));
    return Number(result);
  });
}

async function queueList(scopeKey?: string): Promise<GreenQueueAction[]> {
  return withStore(STORE_QUEUE, "readonly", async (store) => {
    const all = (await requestToPromise(store.getAll())) as GreenQueueAction[];
    return all
      .filter((row) => scopeKey === undefined || row.scopeKey === scopeKey)
      .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
  });
}

async function queuePut(action: GreenQueueAction, scope?: GreenOfflineScope): Promise<void> {
  if (!action.id) return;
  const offlineScope = requireScope(scope);
  if (action.scopeKey !== offlineScope.key) return;
  await withStore(STORE_QUEUE, "readwrite", async (store) => {
    await requestToPromise(store.put(action));
  });
}

async function queueDelete(id: number, scope?: GreenOfflineScope): Promise<void> {
  await withStore(STORE_QUEUE, "readwrite", async (store) => {
    if (scope) {
      const row = (await requestToPromise(store.get(id))) as GreenQueueAction | undefined;
      if (row?.scopeKey !== scope.key) return;
    }
    await requestToPromise(store.delete(id));
  });
}

async function queueCount(scopeKey?: string): Promise<number> {
  return withStore(STORE_QUEUE, "readonly", async (store) => {
    if (scopeKey === undefined) return Number(await requestToPromise(store.count()) || 0);
    const all = (await requestToPromise(store.getAll())) as GreenQueueAction[];
    return all.filter((row) => row.scopeKey === scopeKey).length;
  });
}

async function photoAdd(file: File | Blob, scope?: GreenOfflineScope): Promise<number> {
  const offlineScope = requireScope(scope);
  const blob = file instanceof Blob ? file : new Blob([file]);
  const fileName =
    (file as File)?.name && String((file as File).name).trim()
      ? String((file as File).name)
      : `green-photo-${Date.now()}.jpg`;
  const mimeType = String((file as any)?.type || blob.type || "application/octet-stream");
  return withStore(STORE_PHOTOS, "readwrite", async (store) => {
    const payload: GreenPhotoRecord = {
      file: blob,
      fileName,
      mimeType,
      scopeKey: offlineScope.key,
      createdAt: new Date().toISOString(),
    };
    const id = await requestToPromise(store.add(payload));
    return Number(id);
  });
}

async function photoGet(photoId: number, scope?: GreenOfflineScope): Promise<GreenPhotoRecord | null> {
  const offlineScope = requireScope(scope);
  return withStore(STORE_PHOTOS, "readonly", async (store) => {
    const row = (await requestToPromise(store.get(photoId))) as GreenPhotoRecord | undefined;
    return row?.scopeKey === offlineScope.key ? row : null;
  });
}

async function photoDelete(photoId: number, scope?: GreenOfflineScope): Promise<void> {
  const offlineScope = requireScope(scope);
  await withStore(STORE_PHOTOS, "readwrite", async (store) => {
    const row = (await requestToPromise(store.get(photoId))) as GreenPhotoRecord | undefined;
    if (row?.scopeKey === offlineScope.key) await requestToPromise(store.delete(photoId));
  });
}

async function pushConflict(record: GreenConflictRecord, scope: GreenOfflineScope): Promise<void> {
  const key = scopedKvKey(scope, KEY_CONFLICTS);
  const existing = (await kvGet<GreenConflictRecord[]>(key)) || [];
  const next = [...existing, record].slice(-100);
  await kvSet(key, next);
}

export async function getOfflineQueueCount(scope?: GreenOfflineScope | null): Promise<number> {
  const offlineScope = resolveScope(scope);
  return offlineScope ? queueCount(offlineScope.key) : 0;
}

export async function getOfflineLegacyQueueCount(): Promise<number> {
  return queueCount(LEGACY_SCOPE_KEY);
}

export async function getOfflineConflictCount(scope?: GreenOfflineScope | null): Promise<number> {
  const offlineScope = resolveScope(scope);
  if (!offlineScope) return 0;
  const conflicts = (await kvGet<GreenConflictRecord[]>(scopedKvKey(offlineScope, KEY_CONFLICTS))) || [];
  return conflicts.length;
}

export async function registerGreenBackgroundSync(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const regAny = registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    if (regAny.sync?.register) {
      await regAny.sync.register("green-sync-queue");
    }
  } catch {
    // Background Sync may be unavailable or blocked.
  }
}

export async function cacheProjectsOffline(projects: any[], scope?: GreenOfflineScope | null): Promise<void> {
  const offlineScope = resolveScope(scope);
  if (offlineScope) await kvSet(scopedKvKey(offlineScope, KEY_PROJECTS), Array.isArray(projects) ? projects : []);
}

export async function getCachedProjectsOffline(scope?: GreenOfflineScope | null): Promise<any[]> {
  const offlineScope = resolveScope(scope);
  return offlineScope ? (await kvGet<any[]>(scopedKvKey(offlineScope, KEY_PROJECTS))) || [] : [];
}

export async function cacheUsersOffline(users: any[], scope?: GreenOfflineScope | null): Promise<void> {
  const offlineScope = resolveScope(scope);
  if (offlineScope) await kvSet(scopedKvKey(offlineScope, KEY_USERS), Array.isArray(users) ? users : []);
}

export async function getCachedUsersOffline(scope?: GreenOfflineScope | null): Promise<any[]> {
  const offlineScope = resolveScope(scope);
  return offlineScope ? (await kvGet<any[]>(scopedKvKey(offlineScope, KEY_USERS))) || [] : [];
}

export async function cacheProjectDetailOffline(projectId: number, detail: any, scope?: GreenOfflineScope | null): Promise<void> {
  const offlineScope = resolveScope(scope);
  if (offlineScope) await kvSet(scopedKvKey(offlineScope, kvKeyProjectDetail(projectId)), detail || null);
}

export async function getCachedProjectDetailOffline(projectId: number, scope?: GreenOfflineScope | null): Promise<any | null> {
  const offlineScope = resolveScope(scope);
  return offlineScope ? kvGet<any>(scopedKvKey(offlineScope, kvKeyProjectDetail(projectId))) : null;
}

export async function cacheProjectTreesOffline(projectId: number, trees: any[], scope?: GreenOfflineScope | null): Promise<void> {
  const offlineScope = resolveScope(scope);
  if (!offlineScope) return;
  const normalized = Array.isArray(trees) ? trees : [];
  await kvSet(scopedKvKey(offlineScope, kvKeyProjectTrees(projectId)), normalized);
}

export async function getCachedProjectTreesOffline(projectId: number, scope?: GreenOfflineScope | null): Promise<any[]> {
  const offlineScope = resolveScope(scope);
  return offlineScope ? (await kvGet<any[]>(scopedKvKey(offlineScope, kvKeyProjectTrees(projectId)))) || [] : [];
}

export async function cacheTasksOffline(projectId: number, assigneeName: string, tasks: any[], scope?: GreenOfflineScope | null): Promise<void> {
  const offlineScope = resolveScope(scope);
  if (offlineScope) await kvSet(scopedKvKey(offlineScope, kvKeyTasks(projectId, normalizeAssignee(assigneeName))), Array.isArray(tasks) ? tasks : []);
}

export async function getCachedTasksOffline(projectId: number, assigneeName: string, scope?: GreenOfflineScope | null): Promise<any[]> {
  const offlineScope = resolveScope(scope);
  return offlineScope ? (await kvGet<any[]>(scopedKvKey(offlineScope, kvKeyTasks(projectId, normalizeAssignee(assigneeName))))) || [] : [];
}

export async function cacheWorkOrdersOffline(projectId: number, assigneeName: string, rows: any[], scope?: GreenOfflineScope | null): Promise<void> {
  const offlineScope = resolveScope(scope);
  if (offlineScope) await kvSet(scopedKvKey(offlineScope, kvKeyWorkOrders(projectId, normalizeAssignee(assigneeName))), Array.isArray(rows) ? rows : []);
}

export async function getCachedWorkOrdersOffline(projectId: number, assigneeName: string, scope?: GreenOfflineScope | null): Promise<any[]> {
  const offlineScope = resolveScope(scope);
  return offlineScope ? (await kvGet<any[]>(scopedKvKey(offlineScope, kvKeyWorkOrders(projectId, normalizeAssignee(assigneeName))))) || [] : [];
}

export async function cacheProjectCustodiansOffline(projectId: number, custodians: any[], scope?: GreenOfflineScope | null): Promise<void> {
  const offlineScope = resolveScope(scope);
  if (offlineScope) await kvSet(scopedKvKey(offlineScope, kvKeyProjectCustodians(projectId)), Array.isArray(custodians) ? custodians : []);
}

export async function getCachedProjectCustodiansOffline(projectId: number, scope?: GreenOfflineScope | null): Promise<any[]> {
  const offlineScope = resolveScope(scope);
  return offlineScope ? (await kvGet<any[]>(scopedKvKey(offlineScope, kvKeyProjectCustodians(projectId)))) || [] : [];
}

export async function cacheProjectAllocationsOffline(projectId: number, allocations: any[], scope?: GreenOfflineScope | null): Promise<void> {
  const offlineScope = resolveScope(scope);
  if (offlineScope) await kvSet(scopedKvKey(offlineScope, kvKeyProjectAllocations(projectId)), Array.isArray(allocations) ? allocations : []);
}

export async function getCachedProjectAllocationsOffline(projectId: number, scope?: GreenOfflineScope | null): Promise<any[]> {
  const offlineScope = resolveScope(scope);
  return offlineScope ? (await kvGet<any[]>(scopedKvKey(offlineScope, kvKeyProjectAllocations(projectId)))) || [] : [];
}

export async function cacheTreeTasksOffline(treeId: number, tasks: any[], scope?: GreenOfflineScope | null): Promise<void> {
  const offlineScope = resolveScope(scope);
  if (offlineScope) await kvSet(scopedKvKey(offlineScope, kvKeyTreeTasks(treeId)), Array.isArray(tasks) ? tasks : []);
}

export async function getCachedTreeTasksOffline(treeId: number, scope?: GreenOfflineScope | null): Promise<any[]> {
  const offlineScope = resolveScope(scope);
  return offlineScope ? (await kvGet<any[]>(scopedKvKey(offlineScope, kvKeyTreeTasks(treeId)))) || [] : [];
}

export async function cacheTreeTimelineOffline(treeId: number, timeline: any, scope?: GreenOfflineScope | null): Promise<void> {
  const offlineScope = resolveScope(scope);
  if (offlineScope) await kvSet(scopedKvKey(offlineScope, kvKeyTreeTimeline(treeId)), timeline || null);
}

export async function getCachedTreeTimelineOffline(treeId: number, scope?: GreenOfflineScope | null): Promise<any | null> {
  const offlineScope = resolveScope(scope);
  return offlineScope ? kvGet<any>(scopedKvKey(offlineScope, kvKeyTreeTimeline(treeId))) : null;
}

async function setTreeIdMap(tempTreeId: number, realTreeId: number, scope: GreenOfflineScope): Promise<void> {
  await kvSet(scopedKvKey(scope, kvKeyTreeIdMap(tempTreeId)), Number(realTreeId));
}

async function resolveTreeId(treeId: number, scope: GreenOfflineScope): Promise<number> {
  if (!Number.isFinite(treeId)) return treeId;
  if (Number(treeId) >= 0) return Number(treeId);
  const mapped = await kvGet<number>(scopedKvKey(scope, kvKeyTreeIdMap(Number(treeId))));
  return Number.isFinite(mapped || NaN) ? Number(mapped) : Number(treeId);
}

async function rewriteQueueTreeReferences(tempTreeId: number, realTreeId: number, scope: GreenOfflineScope): Promise<void> {
  const rows = await queueList(scope.key);
  for (const row of rows) {
    if (!row.id) continue;
    let changed = false;
    const payload = { ...(row.payload || {}) };
    if (Number(payload.treeId) === Number(tempTreeId)) {
      payload.treeId = Number(realTreeId);
      changed = true;
    }
    if (payload.link && Number(payload.link.treeId) === Number(tempTreeId)) {
      payload.link = { ...payload.link, treeId: Number(realTreeId) };
      changed = true;
    }
    if (changed) {
      await queuePut({
        ...row,
        payload,
      }, scope);
    }
  }
}

async function upsertTreeInCache(projectId: number, treeLike: any, scope?: GreenOfflineScope | null): Promise<void> {
  const rows = await getCachedProjectTreesOffline(projectId, scope);
  const id = Number(treeLike?.id || 0);
  const existingIndex = rows.findIndex((row) => Number(row?.id) === id);
  if (existingIndex >= 0) {
    rows[existingIndex] = { ...rows[existingIndex], ...treeLike };
  } else {
    rows.unshift(treeLike);
  }
  await cacheProjectTreesOffline(projectId, rows, scope);
}

async function replaceTempTreeInCache(projectId: number, tempTreeId: number, realTree: any, scope?: GreenOfflineScope | null): Promise<void> {
  const rows = await getCachedProjectTreesOffline(projectId, scope);
  const next = rows.map((row) => (Number(row?.id) === Number(tempTreeId) ? { ...row, ...realTree } : row));
  await cacheProjectTreesOffline(projectId, next, scope);
}

async function mutateCachedTasks(
  projectId: number,
  assigneeName: string,
  taskId: number,
  mutator: (task: any) => any,
  scope?: GreenOfflineScope | null,
): Promise<void> {
  const rows = await getCachedTasksOffline(projectId, assigneeName, scope);
  let touched = false;
  const next = rows.map((task) => {
    if (Number(task?.id) !== Number(taskId)) return task;
    touched = true;
    return mutator(task);
  });
  if (touched) {
    await cacheTasksOffline(projectId, assigneeName, next, scope);
  }
}

export async function getPendingTreeDraftsOffline(projectId: number, scope?: GreenOfflineScope | null): Promise<any[]> {
  const offlineScope = resolveScope(scope);
  if (!offlineScope) return [];
  const rows = await queueList(offlineScope.key);
  return rows
    .filter((row) => row.type === "create_tree" && Number(row.context?.projectId || 0) === Number(projectId))
    .map((row) => ({
      ...row.payload?.tree,
      id: Number(row.payload?.tempTreeId || 0),
      project_id: Number(projectId),
      photo_url: "",
    }))
    .filter((row) => Number.isFinite(row.id));
}

export async function queueCreateTreeOffline(
  treePayload: Record<string, any>,
  context: GreenQueueContext,
  photoFile?: File | null,
): Promise<{ tempTree: any; queuedPhoto: boolean }> {
  const offlineScope = requireScope();
  const tempTreeId = -1 * (Date.now() + Math.floor(Math.random() * 1000));
  let photoRefId: number | null = null;
  if (photoFile) {
    photoRefId = await photoAdd(photoFile, offlineScope);
  }
  const payload = {
    tree: { ...treePayload },
    tempTreeId,
    photoRefId,
  };
  await queueAdd({
    type: "create_tree",
    payload,
    context,
  }, offlineScope);
  await upsertTreeInCache(Number(context.projectId || 0), {
    ...treePayload,
    id: tempTreeId,
    project_id: Number(context.projectId || treePayload.project_id || 0),
    lng: Number(treePayload.lng),
    lat: Number(treePayload.lat),
  }, offlineScope);
  await registerGreenBackgroundSync();
  return {
    tempTree: {
      ...treePayload,
      id: tempTreeId,
      project_id: Number(context.projectId || treePayload.project_id || 0),
      lng: Number(treePayload.lng),
      lat: Number(treePayload.lat),
    },
    queuedPhoto: Boolean(photoRefId),
  };
}

export async function queueTaskUpdateOffline(
  taskId: number,
  edit: Record<string, any>,
  context: GreenQueueContext,
): Promise<void> {
  const offlineScope = requireScope();
  await queueAdd({
    type: "update_task",
    payload: { taskId, edit },
    context,
  }, offlineScope);
  const projectId = Number(context.projectId || 0);
  const assigneeName = normalizeAssignee(context.assigneeName);
  if (projectId > 0 && assigneeName) {
    await mutateCachedTasks(projectId, assigneeName, taskId, (task) => ({ ...task, ...edit }), offlineScope);
  }
  await registerGreenBackgroundSync();
}

export async function queueTaskSubmitOffline(
  taskId: number,
  payload: Record<string, any>,
  context: GreenQueueContext,
): Promise<void> {
  const offlineScope = requireScope();
  await queueAdd({
    type: "submit_task",
    payload: { taskId, body: payload },
    context,
  }, offlineScope);
  const projectId = Number(context.projectId || 0);
  const assigneeName = normalizeAssignee(context.assigneeName);
  if (projectId > 0 && assigneeName) {
    await mutateCachedTasks(projectId, assigneeName, taskId, (task) => ({
      ...task,
      status: "done",
      review_state: "submitted",
      notes: payload?.notes ?? task?.notes,
      photo_url: payload?.photo_url ?? task?.photo_url,
      reported_tree_status: payload?.tree_status ?? task?.reported_tree_status,
      activity_lng:
        payload?.activity_lng !== undefined && payload?.activity_lng !== null
          ? payload?.activity_lng
          : task?.activity_lng,
      activity_lat:
        payload?.activity_lat !== undefined && payload?.activity_lat !== null
          ? payload?.activity_lat
          : task?.activity_lat,
      activity_recorded_at: payload?.activity_recorded_at ?? task?.activity_recorded_at,
    }), offlineScope);
  }
  await registerGreenBackgroundSync();
}

export async function queueTreeStatusOffline(
  treeId: number,
  status: string,
  context: GreenQueueContext,
): Promise<void> {
  const offlineScope = requireScope();
  await queueAdd({
    type: "update_tree_status",
    payload: { treeId, status },
    context,
  }, offlineScope);
  const projectId = Number(context.projectId || 0);
  if (projectId > 0) {
    await upsertTreeInCache(projectId, { id: treeId, status }, offlineScope);
  }
  await registerGreenBackgroundSync();
}

export async function queuePhotoUploadOffline(
  file: File | Blob,
  folder: "trees" | "tasks",
  link: { treeId?: number; taskId?: number },
  context: GreenQueueContext,
): Promise<{ queueId: number; localPreviewUrl: string }> {
  const offlineScope = requireScope();
  const photoRefId = await photoAdd(file, offlineScope);
  const queueId = await queueAdd({
    type: "upload_photo",
    payload: { photoRefId, folder, link },
    context,
  }, offlineScope);
  await registerGreenBackgroundSync();
  const localPreviewUrl = URL.createObjectURL(file instanceof Blob ? file : new Blob([file]));
  return { queueId, localPreviewUrl };
}

async function refreshContextFromServer(api: AxiosInstance, context: GreenQueueContext | undefined, scope: GreenOfflineScope): Promise<void> {
  const projectId = Number(context?.projectId || 0);
  const assigneeName = normalizeAssignee(context?.assigneeName);
  if (projectId > 0) {
    try {
      const [projectRes, treesRes] = await Promise.all([
        api.get(`/green/projects/${projectId}`),
        api.get(`/green/projects/${projectId}/trees`),
      ]);
      await cacheProjectDetailOffline(projectId, projectRes.data, scope);
      const normalizedTrees = (Array.isArray(treesRes.data) ? treesRes.data : []).map((tree: any) => ({
        ...tree,
        lng: Number(tree.lng),
        lat: Number(tree.lat),
      }));
      await cacheProjectTreesOffline(projectId, normalizedTrees, scope);
    } catch {
      // Keep stale cache if refresh fails.
    }
  }
  if (projectId > 0 && assigneeName) {
    try {
      const stamp = Date.now();
      const [tasksRes, ordersRes] = await Promise.all([
        api.get(`/green/tasks?project_id=${projectId}&assignee_name=${encodeURIComponent(assigneeName)}&_ts=${stamp}`),
        api.get(`/green/work-orders?project_id=${projectId}&assignee_name=${encodeURIComponent(assigneeName)}&_ts=${stamp}`),
      ]);
      await cacheTasksOffline(projectId, assigneeName, Array.isArray(tasksRes.data) ? tasksRes.data : [], scope);
      await cacheWorkOrdersOffline(projectId, assigneeName, Array.isArray(ordersRes.data) ? ordersRes.data : [], scope);
    } catch {
      // Keep stale cache if refresh fails.
    }
  }
}

async function uploadPhotoWithApi(
  api: AxiosInstance,
  photoRefId: number,
  folder: "trees" | "tasks",
  link: { treeId?: number; taskId?: number } = {},
  scope: GreenOfflineScope,
  idempotencyKey: string,
): Promise<string> {
  const photo = await photoGet(photoRefId, scope);
  if (!photo) return "";
  const formData = new FormData();
  const ext = photo.fileName && photo.fileName.includes(".") ? "" : ".jpg";
  const fileName = `${photo.fileName || `green-offline-photo-${photoRefId}`}${ext}`;
  formData.append("file", photo.file, fileName);
  formData.append("folder", folder);
  if (link.treeId) formData.append("tree_id", String(link.treeId));
  if (link.taskId) formData.append("task_id", String(link.taskId));
  const res = await api.post("/green/uploads/photo", formData, {
    headers: { "Content-Type": "multipart/form-data", "X-Idempotency-Key": idempotencyKey },
  });
  await photoDelete(photoRefId, scope);
  return String(res.data?.url || "");
}

async function processQueueAction(api: AxiosInstance, action: GreenQueueAction, scope: GreenOfflineScope): Promise<void> {
  const payload = action.payload || {};
  const requestConfig = { headers: { "X-Idempotency-Key": String(action.idempotencyKey || "") } };
  switch (action.type) {
    case "create_tree": {
      const tempTreeId = Number(payload.tempTreeId || 0);
      const tree = { ...(payload.tree || {}) };
      const res = await api.post("/green/trees", tree, requestConfig);
      const realTreeId = Number(res.data?.id || 0);
      if (realTreeId > 0 && tempTreeId < 0) {
        await setTreeIdMap(tempTreeId, realTreeId, scope);
        await rewriteQueueTreeReferences(tempTreeId, realTreeId, scope);
        await replaceTempTreeInCache(Number(action.context?.projectId || tree.project_id || 0), tempTreeId, {
          ...tree,
          ...res.data,
          id: realTreeId,
        }, scope);
      }
      const photoRefId = Number(payload.photoRefId || 0);
      if (photoRefId > 0 && realTreeId > 0) {
        await uploadPhotoWithApi(api, photoRefId, "trees", { treeId: realTreeId }, scope, `${String(action.idempotencyKey || "green-tree")}-photo`);
      }
      return;
    }
    case "update_task": {
      const taskId = Number(payload.taskId || 0);
      const edit = payload.edit || {};
      await api.patch(`/green/tasks/${taskId}`, edit, requestConfig);
      return;
    }
    case "submit_task": {
      const taskId = Number(payload.taskId || 0);
      const body = payload.body || {};
      await api.post(`/green/tasks/${taskId}/submit`, body, requestConfig);
      return;
    }
    case "update_tree_status": {
      const rawTreeId = Number(payload.treeId || 0);
      const treeId = await resolveTreeId(rawTreeId, scope);
      await api.patch(`/green/trees/${treeId}`, { status: payload.status }, requestConfig);
      return;
    }
    case "upload_photo": {
      const photoRefId = Number(payload.photoRefId || 0);
      if (!photoRefId) return;
      const folder = payload.folder === "tasks" ? "tasks" : "trees";
      const link = { ...(payload.link || {}) };
      if (link.treeId) {
        link.treeId = await resolveTreeId(Number(link.treeId), scope);
      }
      const uploadedUrl = await uploadPhotoWithApi(api, photoRefId, folder, link, scope, String(action.idempotencyKey || createOfflineId("green-photo")));
      const projectId = Number(action.context?.projectId || 0);
      const assigneeName = normalizeAssignee(action.context?.assigneeName);
      if (uploadedUrl && projectId > 0 && folder === "trees" && link.treeId) {
        await upsertTreeInCache(projectId, { id: Number(link.treeId), photo_url: uploadedUrl }, scope);
      }
      if (uploadedUrl && projectId > 0 && folder === "tasks" && link.taskId && assigneeName) {
        await mutateCachedTasks(projectId, assigneeName, Number(link.taskId), (task) => ({
          ...task,
          photo_url: uploadedUrl,
        }), scope);
      }
      return;
    }
    default:
      return;
  }
}

async function claimSyncLease(scope: GreenOfflineScope): Promise<boolean> {
  const key = `${SYNC_LOCK_KEY_PREFIX}${scope.key}`;
  return withStore(STORE_SYNC_LOCKS, "readwrite", async (store) => {
    const now = Date.now();
    const existing = (await requestToPromise(store.get(key))) as { key: string; owner: string; expiresAt: number } | undefined;
    if (existing && existing.owner !== TAB_OWNER_ID && Number(existing.expiresAt || 0) > now) return false;
    await requestToPromise(store.put({ key, owner: TAB_OWNER_ID, expiresAt: now + SYNC_LEASE_MS }));
    return true;
  });
}

async function renewSyncLease(scope: GreenOfflineScope): Promise<void> {
  const key = `${SYNC_LOCK_KEY_PREFIX}${scope.key}`;
  await withStore(STORE_SYNC_LOCKS, "readwrite", async (store) => {
    const existing = (await requestToPromise(store.get(key))) as { key: string; owner: string; expiresAt: number } | undefined;
    if (existing?.owner === TAB_OWNER_ID) await requestToPromise(store.put({ ...existing, expiresAt: Date.now() + SYNC_LEASE_MS }));
  });
}

async function releaseSyncLease(scope: GreenOfflineScope): Promise<void> {
  const key = `${SYNC_LOCK_KEY_PREFIX}${scope.key}`;
  await withStore(STORE_SYNC_LOCKS, "readwrite", async (store) => {
    const existing = (await requestToPromise(store.get(key))) as { owner?: string } | undefined;
    if (existing?.owner === TAB_OWNER_ID) await requestToPromise(store.delete(key));
  });
}

export async function syncGreenQueueOffline(
  api: AxiosInstance,
  requestedScope?: GreenOfflineScope | null,
): Promise<{ synced: number; failed: number; conflicts: number; pending: number }> {
  const scope = resolveScope(requestedScope);
  if (!scope) return { synced: 0, failed: 0, conflicts: 0, pending: 0 };
  if (syncPromise) return syncPromise;
  if (!(await claimSyncLease(scope))) {
    return { synced: 0, failed: 0, conflicts: 0, pending: await queueCount(scope.key) };
  }
  syncPromise = (async () => {
    const actions = await queueList(scope.key);
    let synced = 0;
    let failed = 0;
    let conflicts = 0;
    const touchedContexts: GreenQueueContext[] = [];

    for (const action of actions) {
      if (!action.id) continue;
      try {
        await renewSyncLease(scope);
        await processQueueAction(api, action, scope);
        touchedContexts.push(action.context || {});
        await queueDelete(Number(action.id), scope);
        synced += 1;
      } catch (error: any) {
        if (isLikelyNetworkError(error)) {
          // Stop replay when network drops; keep remaining queue order.
          break;
        }

        const statusCode = Number(error?.response?.status || 0);
        const detailText = String(error?.response?.data?.detail || error?.message || "Request failed");
        const isConflict = statusCode === 409 || statusCode === 412;
        if (isConflict) {
          await pushConflict({
            id: Number(action.id),
            type: action.type,
            createdAt: new Date().toISOString(),
            detail: detailText,
            payload: action.payload || {},
          }, scope);
          await queueDelete(Number(action.id), scope);
          touchedContexts.push(action.context || {});
          conflicts += 1;
          continue;
        }

        const nextRetries = Number(action.retries || 0) + 1;
        const keepQueued = nextRetries < 5;
        if (keepQueued) {
          await queuePut({
            ...action,
            retries: nextRetries,
            lastError: detailText.slice(0, 500),
          }, scope);
        } else {
          await pushConflict({
            id: Number(action.id),
            type: action.type,
            createdAt: new Date().toISOString(),
            detail: `Failed after retries: ${detailText}`,
            payload: action.payload || {},
          }, scope);
          await queueDelete(Number(action.id), scope);
          conflicts += 1;
        }
        failed += 1;
      }
    }

    // Refresh local cache from server for touched contexts.
    for (const context of touchedContexts) {
      await refreshContextFromServer(api, context, scope);
    }

    const pending = await queueCount(scope.key);
    return { synced, failed, conflicts, pending };
  })().finally(() => {
    syncPromise = null;
    void releaseSyncLease(scope);
  });
  return syncPromise;
}

/* ── Map tile pre-caching ───────────────────────────────────────── */

const MAPBOX_TOKEN = (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_MAPBOX_TOKEN) || "";
const DEFAULT_MAP_TILE_ZOOMS = [12, 13, 14, 15, 16];

function clampLatitude(lat: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

async function getMapPrecacheTarget(): Promise<ServiceWorker | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
  try {
    const registration = await navigator.serviceWorker.ready;
    return registration.active || registration.waiting || registration.installing || null;
  } catch {
    return null;
  }
}

function buildMapPrecacheUrls(tileCoords: Array<{ z: number; x: number; y: number }>): string[] {
  if (!MAPBOX_TOKEN) return [];
  const urls: string[] = tileCoords.map(
    ({ z, x, y }) =>
      `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg90?access_token=${MAPBOX_TOKEN}`,
  );

  urls.push(
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12?access_token=${MAPBOX_TOKEN}`,
  );

  const spriteBase = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/sprite`;
  urls.push(`${spriteBase}?access_token=${MAPBOX_TOKEN}`);
  urls.push(`${spriteBase}.json?access_token=${MAPBOX_TOKEN}`);
  urls.push(`${spriteBase}@2x?access_token=${MAPBOX_TOKEN}`);
  urls.push(`${spriteBase}@2x.json?access_token=${MAPBOX_TOKEN}`);

  const fontBase = `https://api.mapbox.com/fonts/v1/mapbox`;
  const fontRanges = ["0-255", "256-511", "512-767", "768-1023"];
  const fontStacks = [
    "DIN+Pro+Regular,Arial+Unicode+MS+Regular",
    "DIN+Pro+Medium,Arial+Unicode+MS+Regular",
    "DIN+Pro+Bold,Arial+Unicode+MS+Bold",
    "Open+Sans+Regular,Arial+Unicode+MS+Regular",
    "Open+Sans+Semibold,Arial+Unicode+MS+Bold",
  ];
  for (const stack of fontStacks) {
    for (const range of fontRanges) {
      urls.push(`${fontBase}/${stack}/${range}.pbf?access_token=${MAPBOX_TOKEN}`);
    }
  }

  return Array.from(new Set(urls));
}

async function precacheMapUrls(
  urls: string[],
  onProgress?: (cached: number, total: number) => void,
): Promise<{ cached: number; total: number }> {
  const normalizedUrls = Array.from(new Set((urls || []).filter((url) => String(url || "").trim())));
  if (normalizedUrls.length === 0) return { cached: 0, total: 0 };
  const target = await getMapPrecacheTarget();
  if (!target) return { cached: 0, total: normalizedUrls.length };

  return new Promise((resolve) => {
    let settled = false;
    let latestCached = 0;
    const total = normalizedUrls.length;

    const cleanup = () => {
      navigator.serviceWorker.removeEventListener("message", handler);
    };
    const finish = (cached: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ cached, total });
    };

    const handler = (event: MessageEvent) => {
      const msg = event.data || {};
      if (msg.type === "PRECACHE_MAP_TILES_PROGRESS") {
        latestCached = Number(msg.cached || 0);
        onProgress?.(latestCached, Number(msg.total || total));
      }
      if (msg.type === "PRECACHE_MAP_TILES_DONE") {
        finish(Number(msg.cached || latestCached || 0));
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    target.postMessage({
      type: "PRECACHE_MAP_TILES",
      urls: normalizedUrls,
    });

    setTimeout(() => {
      finish(latestCached);
    }, 120000);
  });
}

/**
 * Generate Mapbox tile URLs for a bounding box at multiple zoom levels.
 * Uses satellite-streets raster tiles so the map renders offline.
 */
function tileCoordsForBounds(
  bounds: { west: number; south: number; east: number; north: number },
  zooms: number[],
): Array<{ z: number; x: number; y: number }> {
  const coords: Array<{ z: number; x: number; y: number }> = [];
  for (const z of zooms) {
    const n = Math.pow(2, z);
    const xMin = Math.max(0, Math.floor(((bounds.west + 180) / 360) * n));
    const xMax = Math.min(n - 1, Math.floor(((bounds.east + 180) / 360) * n));
    const yMin = Math.max(
      0,
      Math.floor(
        ((1 - Math.log(Math.tan((bounds.north * Math.PI) / 180) + 1 / Math.cos((bounds.north * Math.PI) / 180)) / Math.PI) / 2) * n,
      ),
    );
    const yMax = Math.min(
      n - 1,
      Math.floor(
        ((1 - Math.log(Math.tan((bounds.south * Math.PI) / 180) + 1 / Math.cos((bounds.south * Math.PI) / 180)) / Math.PI) / 2) * n,
      ),
    );
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        coords.push({ z, x, y });
      }
    }
  }
  return coords;
}

export async function precacheMapTilesForBounds(
  bounds: { west: number; south: number; east: number; north: number },
  onProgress?: (cached: number, total: number) => void,
  zooms: number[] = DEFAULT_MAP_TILE_ZOOMS,
): Promise<{ cached: number; total: number }> {
  if (!MAPBOX_TOKEN) return { cached: 0, total: 0 };
  const west = Number(bounds?.west);
  const south = clampLatitude(Number(bounds?.south));
  const east = Number(bounds?.east);
  const north = clampLatitude(Number(bounds?.north));
  if (![west, south, east, north].every((value) => Number.isFinite(value))) {
    return { cached: 0, total: 0 };
  }

  const tileCoords = tileCoordsForBounds(
    {
      west: Math.min(west, east),
      south: Math.min(south, north),
      east: Math.max(west, east),
      north: Math.max(south, north),
    },
    Array.from(new Set((zooms || []).map((value) => Math.max(0, Math.min(22, Math.round(Number(value) || 0)))))).filter(
      (value) => Number.isFinite(value),
    ),
  );

  const MAX_TILES = 650;
  const urls = buildMapPrecacheUrls(tileCoords.slice(0, MAX_TILES));
  return precacheMapUrls(urls, onProgress);
}

/**
 * Pre-cache map tiles for a project area so the map works fully offline.
 * Call this after loading a project's trees to seed the tile cache.
 *
 * @param trees - Array of objects with lng/lat
 * @param onProgress - Optional callback with (cached, total)
 * @returns Promise that resolves when done
 */
export async function precacheMapTilesForArea(
  trees: Array<{ lng: number; lat: number }>,
  onProgress?: (cached: number, total: number) => void,
): Promise<{ cached: number; total: number }> {
  if (!MAPBOX_TOKEN || trees.length === 0) return { cached: 0, total: 0 };

  // Calculate bounding box with padding
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const t of trees) {
    const lng = Number(t.lng);
    const lat = Number(t.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }

  if (!Number.isFinite(west)) return { cached: 0, total: 0 };

  // Add ~500m padding
  const pad = 0.005;
  return precacheMapTilesForBounds(
    {
      west: west - pad,
      south: south - pad,
      east: east + pad,
      north: north + pad,
    },
    onProgress,
    DEFAULT_MAP_TILE_ZOOMS,
  );
}
