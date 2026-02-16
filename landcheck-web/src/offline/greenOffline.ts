import type { AxiosInstance } from "axios";

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

type GreenQueueAction = {
  id?: number;
  type: GreenQueueActionType;
  payload: Record<string, any>;
  context?: GreenQueueContext;
  createdAt?: string;
  retries?: number;
  lastError?: string;
};

type GreenPhotoRecord = {
  id?: number;
  file: Blob;
  fileName: string;
  mimeType: string;
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
const DB_VERSION = 1;
const STORE_KV = "kv";
const STORE_QUEUE = "queue";
const STORE_PHOTOS = "photos";

const KEY_PROJECTS = "green:projects";
const KEY_USERS = "green:users";
const KEY_CONFLICTS = "green:conflicts";

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
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => reject(new Error("IndexedDB open blocked by another tab."));
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });
  return dbPromise;
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const txDone = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
  try {
    const result = await handler(store);
    await txDone;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // Ignore abort errors when transaction already completed.
    }
    await txDone.catch(() => {});
    throw error;
  }
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
  return `green:project:${projectId}:detail`;
}

function kvKeyProjectTrees(projectId: number) {
  return `green:project:${projectId}:trees`;
}

function kvKeyTasks(projectId: number, assigneeName: string) {
  return `green:project:${projectId}:tasks:${assigneeName}`;
}

function kvKeyWorkOrders(projectId: number, assigneeName: string) {
  return `green:project:${projectId}:workorders:${assigneeName}`;
}

function kvKeyTreeTasks(treeId: number) {
  return `green:tree:${treeId}:tasks`;
}

function kvKeyTreeTimeline(treeId: number) {
  return `green:tree:${treeId}:timeline`;
}

function kvKeyTreeIdMap(tempTreeId: number) {
  return `green:tree-id-map:${tempTreeId}`;
}

function normalizeAssignee(value: string | null | undefined) {
  return String(value || "").trim();
}

export function isLikelyNetworkError(error: any): boolean {
  const message = String(error?.message || "");
  return Boolean(
    !error?.response &&
      (error?.code === "ERR_NETWORK" ||
        error?.code === "ECONNABORTED" ||
        /network error|failed to fetch|load failed/i.test(message)),
  );
}

async function queueAdd(action: GreenQueueAction): Promise<number> {
  return withStore(STORE_QUEUE, "readwrite", async (store) => {
    const payload: GreenQueueAction = {
      ...action,
      createdAt: action.createdAt || new Date().toISOString(),
      retries: Number(action.retries || 0),
    };
    const result = await requestToPromise(store.add(payload));
    return Number(result);
  });
}

async function queueList(): Promise<GreenQueueAction[]> {
  return withStore(STORE_QUEUE, "readonly", async (store) => {
    const all = (await requestToPromise(store.getAll())) as GreenQueueAction[];
    return all.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
  });
}

async function queuePut(action: GreenQueueAction): Promise<void> {
  if (!action.id) return;
  await withStore(STORE_QUEUE, "readwrite", async (store) => {
    await requestToPromise(store.put(action));
  });
}

async function queueDelete(id: number): Promise<void> {
  await withStore(STORE_QUEUE, "readwrite", async (store) => {
    await requestToPromise(store.delete(id));
  });
}

async function queueCount(): Promise<number> {
  return withStore(STORE_QUEUE, "readonly", async (store) => {
    const count = await requestToPromise(store.count());
    return Number(count || 0);
  });
}

async function photoAdd(file: File | Blob): Promise<number> {
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
      createdAt: new Date().toISOString(),
    };
    const id = await requestToPromise(store.add(payload));
    return Number(id);
  });
}

async function photoGet(photoId: number): Promise<GreenPhotoRecord | null> {
  return withStore(STORE_PHOTOS, "readonly", async (store) => {
    const row = (await requestToPromise(store.get(photoId))) as GreenPhotoRecord | undefined;
    return row || null;
  });
}

async function photoDelete(photoId: number): Promise<void> {
  await withStore(STORE_PHOTOS, "readwrite", async (store) => {
    await requestToPromise(store.delete(photoId));
  });
}

async function pushConflict(record: GreenConflictRecord): Promise<void> {
  const existing = (await kvGet<GreenConflictRecord[]>(KEY_CONFLICTS)) || [];
  const next = [...existing, record].slice(-100);
  await kvSet(KEY_CONFLICTS, next);
}

export async function getOfflineQueueCount(): Promise<number> {
  return queueCount();
}

export async function getOfflineConflictCount(): Promise<number> {
  const conflicts = (await kvGet<GreenConflictRecord[]>(KEY_CONFLICTS)) || [];
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

export async function cacheProjectsOffline(projects: any[]): Promise<void> {
  await kvSet(KEY_PROJECTS, Array.isArray(projects) ? projects : []);
}

export async function getCachedProjectsOffline(): Promise<any[]> {
  return (await kvGet<any[]>(KEY_PROJECTS)) || [];
}

export async function cacheUsersOffline(users: any[]): Promise<void> {
  await kvSet(KEY_USERS, Array.isArray(users) ? users : []);
}

export async function getCachedUsersOffline(): Promise<any[]> {
  return (await kvGet<any[]>(KEY_USERS)) || [];
}

export async function cacheProjectDetailOffline(projectId: number, detail: any): Promise<void> {
  await kvSet(kvKeyProjectDetail(projectId), detail || null);
}

export async function getCachedProjectDetailOffline(projectId: number): Promise<any | null> {
  return kvGet<any>(kvKeyProjectDetail(projectId));
}

export async function cacheProjectTreesOffline(projectId: number, trees: any[]): Promise<void> {
  const normalized = Array.isArray(trees) ? trees : [];
  await kvSet(kvKeyProjectTrees(projectId), normalized);
}

export async function getCachedProjectTreesOffline(projectId: number): Promise<any[]> {
  return (await kvGet<any[]>(kvKeyProjectTrees(projectId))) || [];
}

export async function cacheTasksOffline(projectId: number, assigneeName: string, tasks: any[]): Promise<void> {
  await kvSet(kvKeyTasks(projectId, normalizeAssignee(assigneeName)), Array.isArray(tasks) ? tasks : []);
}

export async function getCachedTasksOffline(projectId: number, assigneeName: string): Promise<any[]> {
  return (await kvGet<any[]>(kvKeyTasks(projectId, normalizeAssignee(assigneeName)))) || [];
}

export async function cacheWorkOrdersOffline(projectId: number, assigneeName: string, rows: any[]): Promise<void> {
  await kvSet(kvKeyWorkOrders(projectId, normalizeAssignee(assigneeName)), Array.isArray(rows) ? rows : []);
}

export async function getCachedWorkOrdersOffline(projectId: number, assigneeName: string): Promise<any[]> {
  return (await kvGet<any[]>(kvKeyWorkOrders(projectId, normalizeAssignee(assigneeName)))) || [];
}

export async function cacheTreeTasksOffline(treeId: number, tasks: any[]): Promise<void> {
  await kvSet(kvKeyTreeTasks(treeId), Array.isArray(tasks) ? tasks : []);
}

export async function getCachedTreeTasksOffline(treeId: number): Promise<any[]> {
  return (await kvGet<any[]>(kvKeyTreeTasks(treeId))) || [];
}

export async function cacheTreeTimelineOffline(treeId: number, timeline: any): Promise<void> {
  await kvSet(kvKeyTreeTimeline(treeId), timeline || null);
}

export async function getCachedTreeTimelineOffline(treeId: number): Promise<any | null> {
  return kvGet<any>(kvKeyTreeTimeline(treeId));
}

async function setTreeIdMap(tempTreeId: number, realTreeId: number): Promise<void> {
  await kvSet(kvKeyTreeIdMap(tempTreeId), Number(realTreeId));
}

async function resolveTreeId(treeId: number): Promise<number> {
  if (!Number.isFinite(treeId)) return treeId;
  if (Number(treeId) >= 0) return Number(treeId);
  const mapped = await kvGet<number>(kvKeyTreeIdMap(Number(treeId)));
  return Number.isFinite(mapped || NaN) ? Number(mapped) : Number(treeId);
}

async function rewriteQueueTreeReferences(tempTreeId: number, realTreeId: number): Promise<void> {
  const rows = await queueList();
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
      });
    }
  }
}

async function upsertTreeInCache(projectId: number, treeLike: any): Promise<void> {
  const rows = await getCachedProjectTreesOffline(projectId);
  const id = Number(treeLike?.id || 0);
  const existingIndex = rows.findIndex((row) => Number(row?.id) === id);
  if (existingIndex >= 0) {
    rows[existingIndex] = { ...rows[existingIndex], ...treeLike };
  } else {
    rows.unshift(treeLike);
  }
  await cacheProjectTreesOffline(projectId, rows);
}

async function replaceTempTreeInCache(projectId: number, tempTreeId: number, realTree: any): Promise<void> {
  const rows = await getCachedProjectTreesOffline(projectId);
  const next = rows.map((row) => (Number(row?.id) === Number(tempTreeId) ? { ...row, ...realTree } : row));
  await cacheProjectTreesOffline(projectId, next);
}

async function mutateCachedTasks(
  projectId: number,
  assigneeName: string,
  taskId: number,
  mutator: (task: any) => any,
): Promise<void> {
  const rows = await getCachedTasksOffline(projectId, assigneeName);
  let touched = false;
  const next = rows.map((task) => {
    if (Number(task?.id) !== Number(taskId)) return task;
    touched = true;
    return mutator(task);
  });
  if (touched) {
    await cacheTasksOffline(projectId, assigneeName, next);
  }
}

export async function getPendingTreeDraftsOffline(projectId: number): Promise<any[]> {
  const rows = await queueList();
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
  const tempTreeId = -1 * (Date.now() + Math.floor(Math.random() * 1000));
  let photoRefId: number | null = null;
  if (photoFile) {
    photoRefId = await photoAdd(photoFile);
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
  });
  await upsertTreeInCache(Number(context.projectId || 0), {
    ...treePayload,
    id: tempTreeId,
    project_id: Number(context.projectId || treePayload.project_id || 0),
    lng: Number(treePayload.lng),
    lat: Number(treePayload.lat),
  });
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
  await queueAdd({
    type: "update_task",
    payload: { taskId, edit },
    context,
  });
  const projectId = Number(context.projectId || 0);
  const assigneeName = normalizeAssignee(context.assigneeName);
  if (projectId > 0 && assigneeName) {
    await mutateCachedTasks(projectId, assigneeName, taskId, (task) => ({ ...task, ...edit }));
  }
  await registerGreenBackgroundSync();
}

export async function queueTaskSubmitOffline(
  taskId: number,
  payload: Record<string, any>,
  context: GreenQueueContext,
): Promise<void> {
  await queueAdd({
    type: "submit_task",
    payload: { taskId, body: payload },
    context,
  });
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
    }));
  }
  await registerGreenBackgroundSync();
}

export async function queueTreeStatusOffline(
  treeId: number,
  status: string,
  context: GreenQueueContext,
): Promise<void> {
  await queueAdd({
    type: "update_tree_status",
    payload: { treeId, status },
    context,
  });
  const projectId = Number(context.projectId || 0);
  if (projectId > 0) {
    await upsertTreeInCache(projectId, { id: treeId, status });
  }
  await registerGreenBackgroundSync();
}

export async function queuePhotoUploadOffline(
  file: File | Blob,
  folder: "trees" | "tasks",
  link: { treeId?: number; taskId?: number },
  context: GreenQueueContext,
): Promise<{ queueId: number; localPreviewUrl: string }> {
  const photoRefId = await photoAdd(file);
  const queueId = await queueAdd({
    type: "upload_photo",
    payload: { photoRefId, folder, link },
    context,
  });
  await registerGreenBackgroundSync();
  const localPreviewUrl = URL.createObjectURL(file instanceof Blob ? file : new Blob([file]));
  return { queueId, localPreviewUrl };
}

async function refreshContextFromServer(api: AxiosInstance, context?: GreenQueueContext): Promise<void> {
  const projectId = Number(context?.projectId || 0);
  const assigneeName = normalizeAssignee(context?.assigneeName);
  if (projectId > 0) {
    try {
      const [projectRes, treesRes] = await Promise.all([
        api.get(`/green/projects/${projectId}`),
        api.get(`/green/projects/${projectId}/trees`),
      ]);
      await cacheProjectDetailOffline(projectId, projectRes.data);
      const normalizedTrees = (Array.isArray(treesRes.data) ? treesRes.data : []).map((tree: any) => ({
        ...tree,
        lng: Number(tree.lng),
        lat: Number(tree.lat),
      }));
      await cacheProjectTreesOffline(projectId, normalizedTrees);
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
      await cacheTasksOffline(projectId, assigneeName, Array.isArray(tasksRes.data) ? tasksRes.data : []);
      await cacheWorkOrdersOffline(projectId, assigneeName, Array.isArray(ordersRes.data) ? ordersRes.data : []);
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
): Promise<string> {
  const photo = await photoGet(photoRefId);
  if (!photo) return "";
  const formData = new FormData();
  const ext = photo.fileName && photo.fileName.includes(".") ? "" : ".jpg";
  const fileName = `${photo.fileName || `green-offline-photo-${photoRefId}`}${ext}`;
  formData.append("file", photo.file, fileName);
  formData.append("folder", folder);
  if (link.treeId) formData.append("tree_id", String(link.treeId));
  if (link.taskId) formData.append("task_id", String(link.taskId));
  const res = await api.post("/green/uploads/photo", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  await photoDelete(photoRefId);
  return String(res.data?.url || "");
}

async function processQueueAction(api: AxiosInstance, action: GreenQueueAction): Promise<void> {
  const payload = action.payload || {};
  switch (action.type) {
    case "create_tree": {
      const tempTreeId = Number(payload.tempTreeId || 0);
      const tree = { ...(payload.tree || {}) };
      const res = await api.post("/green/trees", tree);
      const realTreeId = Number(res.data?.id || 0);
      if (realTreeId > 0 && tempTreeId < 0) {
        await setTreeIdMap(tempTreeId, realTreeId);
        await rewriteQueueTreeReferences(tempTreeId, realTreeId);
        await replaceTempTreeInCache(Number(action.context?.projectId || tree.project_id || 0), tempTreeId, {
          ...tree,
          ...res.data,
          id: realTreeId,
        });
      }
      const photoRefId = Number(payload.photoRefId || 0);
      if (photoRefId > 0 && realTreeId > 0) {
        await uploadPhotoWithApi(api, photoRefId, "trees", { treeId: realTreeId });
      }
      return;
    }
    case "update_task": {
      const taskId = Number(payload.taskId || 0);
      const edit = payload.edit || {};
      await api.patch(`/green/tasks/${taskId}`, edit);
      return;
    }
    case "submit_task": {
      const taskId = Number(payload.taskId || 0);
      const body = payload.body || {};
      await api.post(`/green/tasks/${taskId}/submit`, body);
      return;
    }
    case "update_tree_status": {
      const rawTreeId = Number(payload.treeId || 0);
      const treeId = await resolveTreeId(rawTreeId);
      await api.patch(`/green/trees/${treeId}`, { status: payload.status });
      return;
    }
    case "upload_photo": {
      const photoRefId = Number(payload.photoRefId || 0);
      if (!photoRefId) return;
      const folder = payload.folder === "tasks" ? "tasks" : "trees";
      const link = { ...(payload.link || {}) };
      if (link.treeId) {
        link.treeId = await resolveTreeId(Number(link.treeId));
      }
      const uploadedUrl = await uploadPhotoWithApi(api, photoRefId, folder, link);
      const projectId = Number(action.context?.projectId || 0);
      const assigneeName = normalizeAssignee(action.context?.assigneeName);
      if (uploadedUrl && projectId > 0 && folder === "trees" && link.treeId) {
        await upsertTreeInCache(projectId, { id: Number(link.treeId), photo_url: uploadedUrl });
      }
      if (uploadedUrl && projectId > 0 && folder === "tasks" && link.taskId && assigneeName) {
        await mutateCachedTasks(projectId, assigneeName, Number(link.taskId), (task) => ({
          ...task,
          photo_url: uploadedUrl,
        }));
      }
      return;
    }
    default:
      return;
  }
}

export async function syncGreenQueueOffline(
  api: AxiosInstance,
): Promise<{ synced: number; failed: number; conflicts: number; pending: number }> {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const actions = await queueList();
    let synced = 0;
    let failed = 0;
    let conflicts = 0;
    const touchedContexts: GreenQueueContext[] = [];

    for (const action of actions) {
      if (!action.id) continue;
      try {
        await processQueueAction(api, action);
        touchedContexts.push(action.context || {});
        await queueDelete(Number(action.id));
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
          });
          await queueDelete(Number(action.id));
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
          });
        } else {
          await pushConflict({
            id: Number(action.id),
            type: action.type,
            createdAt: new Date().toISOString(),
            detail: `Failed after retries: ${detailText}`,
            payload: action.payload || {},
          });
          await queueDelete(Number(action.id));
          conflicts += 1;
        }
        failed += 1;
      }
    }

    // Refresh local cache from server for touched contexts.
    for (const context of touchedContexts) {
      await refreshContextFromServer(api, context);
    }

    const pending = await queueCount();
    return { synced, failed, conflicts, pending };
  })().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}
