import { useEffect, useMemo, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { api, BACKEND_URL } from "../api/client";
import TreeMap, { type TreeInspectData } from "../components/TreeMap";
import {
  cacheProjectDetailOffline,
  cacheProjectTreesOffline,
  cacheProjectsOffline,
  cacheTasksOffline,
  cacheTreeTasksOffline,
  cacheTreeTimelineOffline,
  cacheUsersOffline,
  cacheWorkOrdersOffline,
  getCachedProjectDetailOffline,
  getCachedProjectTreesOffline,
  getCachedProjectsOffline,
  getCachedTasksOffline,
  getCachedTreeTasksOffline,
  getCachedTreeTimelineOffline,
  getCachedUsersOffline,
  getCachedWorkOrdersOffline,
  getOfflineConflictCount,
  getOfflineQueueCount,
  getPendingTreeDraftsOffline,
  isLikelyNetworkError,
  queueCreateTreeOffline,
  queuePhotoUploadOffline,
  queueTaskSubmitOffline,
  queueTaskUpdateOffline,
  queueTreeStatusOffline,
  registerGreenBackgroundSync,
  syncGreenQueueOffline,
} from "../offline/greenOffline";
import "../styles/green.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";

type CarbonData = {
  current_co2_kg: number;
  current_co2_tonnes: number;
  annual_co2_kg: number;
  annual_co2_tonnes: number;
  projected_lifetime_co2_tonnes: number;
  co2_per_tree_avg_kg: number;
  trees_missing_age_data?: number;
  trees_with_fallback_age?: number;
  trees_pending_review?: number;
};

type Project = {
  id: number;
  name: string;
  location_text: string;
  sponsor: string;
  created_at: string;
  stats?: {
    total: number;
    alive: number;
    dead: number;
    needs_attention: number;
    survival_rate: number;
  };
  carbon?: CarbonData;
};

type Tree = {
  id: number;
  project_id: number;
  lng: number;
  lat: number;
  species: string | null;
  planting_date: string | null;
  status: string;
  notes: string | null;
  photo_url: string | null;
  created_by?: string | null;
  tree_height_m?: number | null;
  tree_origin?: "new_planting" | "existing_inventory" | "natural_regeneration";
  attribution_scope?: "full" | "monitor_only";
  count_in_planting_kpis?: boolean;
  count_in_carbon_scope?: boolean;
  source_project_id?: number | null;
  custodian_id?: number | null;
  custodian_name?: string | null;
};

type GreenUser = {
  id: number;
  full_name: string;
  role: string;
};

type WorkOrder = {
  id: number;
  project_id: number;
  assignee_name: string;
  work_type: string;
  target_trees: number;
  due_date: string | null;
  status: string;
  planted_count: number;
  area_enabled?: boolean;
  area_label?: string | null;
  area_geojson?: any;
};

type Custodian = {
  id: number;
  project_id: number;
  custodian_type: "household" | "school" | "community_group";
  name: string;
  verification_status?: string | null;
};

type ActiveActorOption = {
  value: string;
  label: string;
  role: string;
  actorType: "staff" | "custodian";
  id: number;
};

type Section = "tasks" | "map" | "records" | "profile";
type TaskEdit = {
  status: string;
  notes: string;
  photo_url: string;
  tree_status: string;
  activity_lng: number | null;
  activity_lat: number | null;
  activity_recorded_at: string;
};
type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const formatDateLabel = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
};
const parseTreeHeightInput = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 120) return null;
  return Number(parsed.toFixed(2));
};
const formatTreeHeight = (value: number | null | undefined) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return "-";
  return `${numeric.toFixed(2)} m`;
};
const formatTonnesOrKg = (tonnes: number, kg: number, tonneDigits = 2, kgDigits = 1) => {
  const t = Number(tonnes || 0);
  const k = Number(kg || 0);
  if (Math.abs(t) >= 0.01) return `${t.toFixed(tonneDigits)} t`;
  return `${k.toFixed(kgDigits)} kg`;
};
const normalizeTaskState = (value: string | null | undefined) => (value || "").trim().toLowerCase();
const normalizeTreeStatus = (value: string | null | undefined) => {
  const raw = (value || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (raw === "deseas" || raw === "diseased") return "disease";
  if (raw === "needreplacement" || raw === "needsreplacement") return "need_replacement";
  if (raw === "needs_replacement") return "need_replacement";
  return raw || "healthy";
};
const formatTreeConditionLabel = (value: string | null | undefined) =>
  normalizeTreeStatus(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Healthy";
const HEALTHY_TREE_STATUSES = new Set(["alive", "healthy"]);
const DEAD_TREE_STATUSES = new Set(["dead", "removed"]);
const ATTENTION_TREE_STATUSES = new Set([
  "needs_attention",
  "pest",
  "disease",
  "need_replacement",
  "damaged",
  "need_watering",
  "need_protection",
]);
const INSPECTION_STATUS_OPTIONS = [
  { value: "healthy", label: "Healthy" },
  { value: "pest", label: "Pest" },
  { value: "disease", label: "Disease" },
  { value: "damaged", label: "Damaged" },
  { value: "removed", label: "Removed" },
  { value: "need_watering", label: "Need watering" },
  { value: "need_protection", label: "Need protection" },
];
const isLegacyDoneWithoutReview = (task: any) => {
  const status = normalizeTaskState(task?.status);
  const review = normalizeTaskState(task?.review_state || "none");
  return (status === "done" || status === "completed" || status === "closed") && review === "none";
};
const isTaskApproved = (task: any) => normalizeTaskState(task?.review_state) === "approved" || isLegacyDoneWithoutReview(task);
const isTaskSubmitted = (task: any) => normalizeTaskState(task?.review_state) === "submitted";
const isTaskRejected = (task: any) => normalizeTaskState(task?.review_state) === "rejected";
const isTaskLockedForField = (task: any) => isTaskApproved(task) || isTaskSubmitted(task);
const isTaskDoneForSummary = (task: any) => {
  return isTaskApproved(task);
};
const hasTaskEvidence = (task: any, edit?: { notes?: string; photo_url?: string }) => {
  const notes = (edit?.notes ?? task?.notes ?? "").trim();
  const photo = (edit?.photo_url ?? task?.photo_url ?? "").trim();
  return Boolean(notes && photo);
};
const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const hasOwn = (value: unknown, key: string) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
const hasTaskGpsCapture = (task: any, edit?: { activity_lng?: number | null; activity_lat?: number | null }) => {
  const lngSource = hasOwn(edit, "activity_lng") ? edit?.activity_lng : task?.activity_lng;
  const latSource = hasOwn(edit, "activity_lat") ? edit?.activity_lat : task?.activity_lat;
  return toFiniteNumber(lngSource) !== null && toFiniteNumber(latSource) !== null;
};
const formatDateTimeLabel = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleString();
};
const isLocalBlobUrl = (value: string | null | undefined) => String(value || "").trim().startsWith("blob:");
const sanitizeTaskEditForApi = (edit: TaskEdit) => {
  const payload: Record<string, any> = {
    status: edit.status,
    notes: edit.notes,
    tree_status: edit.tree_status,
  };
  if (edit.photo_url && !isLocalBlobUrl(edit.photo_url)) {
    payload.photo_url = edit.photo_url;
  }
  const activityLng = toFiniteNumber(edit.activity_lng);
  const activityLat = toFiniteNumber(edit.activity_lat);
  if (activityLng !== null && activityLat !== null) {
    payload.activity_lng = Number(activityLng.toFixed(6));
    payload.activity_lat = Number(activityLat.toFixed(6));
    payload.activity_recorded_at = (edit.activity_recorded_at || "").trim() || new Date().toISOString();
  }
  return payload;
};
const buildTaskEdit = (task: any, overrides?: Partial<TaskEdit>): TaskEdit => {
  const gpsLngRaw = hasOwn(overrides, "activity_lng") ? overrides?.activity_lng : task?.activity_lng;
  const gpsLatRaw = hasOwn(overrides, "activity_lat") ? overrides?.activity_lat : task?.activity_lat;
  const gpsRecordedAtRaw = hasOwn(overrides, "activity_recorded_at")
    ? overrides?.activity_recorded_at
    : task?.activity_recorded_at;
  const treeStatusSource = overrides?.tree_status ?? task?.reported_tree_status ?? task?.tree_status ?? "healthy";
  return {
    status: overrides?.status ?? task?.status ?? "pending",
    notes: overrides?.notes ?? task?.notes ?? "",
    photo_url: overrides?.photo_url ?? task?.photo_url ?? "",
    tree_status: normalizeTreeStatus(treeStatusSource),
    activity_lng: toFiniteNumber(gpsLngRaw),
    activity_lat: toFiniteNumber(gpsLatRaw),
    activity_recorded_at: String(gpsRecordedAtRaw || "").trim(),
  };
};
const mergeTreesById = (rows: any[]) => {
  const seen = new Map<number, any>();
  rows.forEach((row) => {
    const id = Number(row?.id);
    if (!Number.isFinite(id)) return;
    seen.set(id, { ...row, id, lng: Number(row.lng), lat: Number(row.lat) });
  });
  return Array.from(seen.values());
};
const normalizeOrderAreaGeometry = (value: any): { type: "Polygon" | "MultiPolygon"; coordinates: any } | null => {
  if (!value) return null;
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const geometry = raw?.type === "Feature" ? raw.geometry : raw;
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return null;
  if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) return null;
  return { type: geometry.type, coordinates: geometry.coordinates };
};
const extractAreaPoints = (geometry: { type: "Polygon" | "MultiPolygon"; coordinates: any } | null) => {
  if (!geometry) return [] as { lng: number; lat: number }[];
  const points: { lng: number; lat: number }[] = [];
  if (geometry.type === "Polygon") {
    (geometry.coordinates || []).forEach((ring: any) => {
      if (!Array.isArray(ring)) return;
      ring.forEach((point: any) => {
        const lng = Number(point?.[0]);
        const lat = Number(point?.[1]);
        if (Number.isFinite(lng) && Number.isFinite(lat)) points.push({ lng, lat });
      });
    });
  } else {
    (geometry.coordinates || []).forEach((polygon: any) => {
      if (!Array.isArray(polygon)) return;
      polygon.forEach((ring: any) => {
        if (!Array.isArray(ring)) return;
        ring.forEach((point: any) => {
          const lng = Number(point?.[0]);
          const lat = Number(point?.[1]);
          if (Number.isFinite(lng) && Number.isFinite(lat)) points.push({ lng, lat });
        });
      });
    });
  }
  return points;
};
const isClosedWorkOrder = (value: string | null | undefined) => {
  const status = normalizeTaskState(value);
  return status === "done" || status === "completed" || status === "closed" || status === "cancelled";
};

const R2_BUCKET_HINT = "photosgreen";

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeObjectKey = (value: string) => {
  let key = String(value || "").trim().replace(/^\/+/, "");
  if (!key) return "";

  for (let i = 0; i < 3; i += 1) {
    const decoded = safeDecode(key);
    if (decoded === key) break;
    key = decoded;
  }

  if (key.startsWith(`${R2_BUCKET_HINT}/`)) {
    key = key.slice(R2_BUCKET_HINT.length + 1);
  }
  return key;
};

const encodeObjectKeyForProxy = (value: string) =>
  normalizeObjectKey(value)
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(safeDecode(part)))
    .join("/");

const toDisplayPhotoUrl = (url: string | null | undefined) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.includes("/green/uploads/object/")) return raw;

  const toProxy = (key: string) => {
    const encoded = encodeObjectKeyForProxy(key);
    return encoded ? `${BACKEND_URL}/green/uploads/object/${encoded}` : "";
  };

  if (!/^https?:\/\//i.test(raw)) {
    return toProxy(raw) || raw;
  }

  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!parts.length) return raw;
    const maybeBucket = parts[0]?.toLowerCase() === R2_BUCKET_HINT;
    const key = (maybeBucket ? parts.slice(1) : parts).join("/");
    return toProxy(key) || raw;
  } catch {
    return raw;
  }
};

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 11.5L12 4l9 7.5V20H3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M4 20c1.4-3.1 4.3-5 8-5s6.6 1.9 8 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function TaskTileIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="16" y="10" width="32" height="44" rx="4" fill="#ffffff" stroke="#1b3b32" strokeWidth="3" />
      <rect x="24" y="6" width="16" height="8" rx="3" fill="#8fc9cc" stroke="#1b3b32" strokeWidth="2" />
      <path d="M22 22h20M22 30h20M22 38h14" stroke="#82a3ad" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M40 42l10-10c1-1 2-1 3 0l2 2c1 1 1 2 0 3L45 47l-7 2z"
        fill="#f8bb4b"
        stroke="#944f16"
        strokeWidth="2"
      />
    </svg>
  );
}

function MapTileIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M11 14l13-3 15 4 14-4v39l-14 3-15-4-13 4z" fill="#def4dd" stroke="#2b5548" strokeWidth="3" />
      <path d="M24 11v38M39 15v38" stroke="#2b5548" strokeWidth="2" />
      <circle cx="32" cy="28" r="8" fill="#6bc14f" stroke="#2b5548" strokeWidth="2" />
      <path d="M32 20v16M24 28h16" stroke="#eaffea" strokeWidth="2" />
    </svg>
  );
}

function TreeTileIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <ellipse cx="32" cy="52" rx="18" ry="4" fill="#9ac6a4" />
      <rect x="28" y="32" width="8" height="18" fill="#7b4f2b" />
      <circle cx="23" cy="30" r="10" fill="#3f8f2f" />
      <circle cx="41" cy="30" r="10" fill="#3d8a2d" />
      <circle cx="32" cy="22" r="12" fill="#67b13c" />
      <circle cx="18" cy="38" r="8" fill="#2f7b23" />
      <circle cx="46" cy="38" r="8" fill="#2f7b23" />
    </svg>
  );
}

export default function Green() {
  const storedActiveUser = typeof window !== "undefined" ? localStorage.getItem("landcheck_green_active_user") || "" : "";
  const storedSectionRaw = typeof window !== "undefined" ? localStorage.getItem("landcheck_green_active_section") || "" : "";
  const storedProjectIdRaw = typeof window !== "undefined" ? localStorage.getItem("landcheck_green_active_project_id") || "" : "";
  const storedProjectId = Number(storedProjectIdRaw || "0");
  const storedSection = (["tasks", "map", "records", "profile"] as Section[]).includes(storedSectionRaw as Section)
    ? (storedSectionRaw as Section)
    : null;

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [pendingRestoreProjectId, setPendingRestoreProjectId] = useState<number | null>(
    Number.isFinite(storedProjectId) && storedProjectId > 0 ? storedProjectId : null
  );
  const [trees, setTrees] = useState<Tree[]>([]);
  const [selectedTreeId, setSelectedTreeId] = useState<number | null>(null);
  const [inspectedTree, setInspectedTree] = useState<TreeInspectData | null>(null);
  const [treeTasks, setTreeTasks] = useState<any[]>([]);
  const [treeTimeline, setTreeTimeline] = useState<any | null>(null);
  const [users, setUsers] = useState<GreenUser[]>([]);
  const [activeUser, setActiveUser] = useState<string>(storedActiveUser);
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [taskEdits, setTaskEdits] = useState<Record<number, TaskEdit>>({});
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [taskGpsLoadingId, setTaskGpsLoadingId] = useState<number | null>(null);
  const [loadingTrees, setLoadingTrees] = useState(false);
  const [newTree, setNewTree] = useState({
    lng: 0,
    lat: 0,
    species: "",
    planting_date: "",
    tree_height_m: "",
    status: "alive",
    tree_origin: "new_planting" as "new_planting" | "existing_inventory",
    attribution_scope: "full" as "full" | "monitor_only",
    count_in_planting_kpis: true,
    count_in_carbon_scope: true,
    custodian_id: "",
    notes: "",
    photo_url: "",
    created_by: "",
  });
  const [projectCustodians, setProjectCustodians] = useState<Custodian[]>([]);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [pendingTreePhoto, setPendingTreePhoto] = useState<File | null>(null);
  const [addingTree, setAddingTree] = useState(false);
  const [mapDrawMode, setMapDrawMode] = useState(false);
  const [, setMapView] = useState<{
    lng: number;
    lat: number;
    zoom: number;
    bearing: number;
    pitch: number;
  } | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ lng: number; lat: number }[] | null>(null);
  const [plantingOrders, setPlantingOrders] = useState<WorkOrder[]>([]);
  const [activeSection, setActiveSection] = useState<Section | null>(storedSection);
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [treePhotoUploading, setTreePhotoUploading] = useState(false);
  const [plantingFlowState, setPlantingFlowState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [plantingFlowMessage, setPlantingFlowMessage] = useState("");
  const [syncPendingCount, setSyncPendingCount] = useState(0);
  const [syncConflictCount, setSyncConflictCount] = useState(0);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const [treeHeightDraftById, setTreeHeightDraftById] = useState<Record<number, string>>({});
  const [savingTreeHeightId, setSavingTreeHeightId] = useState<number | null>(null);
  const [includePhotosInReport, setIncludePhotosInReport] = useState(false);

  const treePoints = useMemo(() => {
    if (!activeUser) return [];
    return trees
      .filter((t: any) => (t as any).created_by === activeUser)
      .map((t) => ({
        id: t.id,
        lng: Number(t.lng),
        lat: Number(t.lat),
        status: t.status,
        species: t.species,
        planting_date: t.planting_date,
        notes: t.notes,
        photo_url: t.photo_url,
        created_by: t.created_by || "",
        tree_height_m: t.tree_height_m ?? null,
        tree_origin: t.tree_origin || "new_planting",
        attribution_scope: t.attribution_scope || "full",
        count_in_planting_kpis: t.count_in_planting_kpis !== false,
        count_in_carbon_scope: t.count_in_carbon_scope !== false,
        custodian_name: t.custodian_name || "",
      }))
      .filter((t) => Number.isFinite(t.lng) && Number.isFinite(t.lat));
  }, [trees, activeUser]);

  const activeUserPoints = useMemo(() => {
    if (!activeUser) return null;
    const points = treePoints.map((t) => ({ lng: t.lng, lat: t.lat }));
    return points.length ? points : null;
  }, [activeUser, treePoints]);
  const assignedPlantingAreas = useMemo(() => {
    if (!activeUser) return [] as Array<{ id: number; label: string; geojson: any }>;
    return plantingOrders
      .filter((order) => order.work_type === "planting")
      .filter((order) => !isClosedWorkOrder(order.status))
      .filter((order) => Boolean(order.area_enabled) && Boolean(order.area_geojson))
      .map((order) => ({
        id: order.id,
        label: (order.area_label || "").trim() || `Assigned area #${order.id}`,
        geojson: order.area_geojson,
      }));
  }, [activeUser, plantingOrders]);
  const assignedPlantingAreaPoints = useMemo(() => {
    const points = assignedPlantingAreas.flatMap((area) => extractAreaPoints(normalizeOrderAreaGeometry(area.geojson)));
    return points.length ? points : null;
  }, [assignedPlantingAreas]);
  const mapFitPoints = useMemo(() => {
    if (focusPoint && focusPoint.length) return focusPoint;
    if (assignedPlantingAreaPoints && assignedPlantingAreaPoints.length) return assignedPlantingAreaPoints;
    return activeUserPoints;
  }, [focusPoint, assignedPlantingAreaPoints, activeUserPoints]);

  const userTrees = useMemo(() => {
    if (!activeUser) return [];
    return trees.filter((t: any) => (t as any).created_by === activeUser);
  }, [activeUser, trees]);
  const userPlantingTrees = useMemo(
    () => userTrees.filter((tree) => String(tree.tree_origin || "new_planting").toLowerCase() === "new_planting"),
    [userTrees],
  );

  const myTaskCounts = useMemo(() => {
    const total = myTasks.length;
    const undone = myTasks.filter((t) => !isTaskApproved(t)).length;
    const pending = myTasks.filter((t) => !isTaskDoneForSummary(t) && !isTaskSubmitted(t) && !isTaskRejected(t)).length;
    const done = myTasks.filter((t) => isTaskDoneForSummary(t)).length;
    const submitted = myTasks.filter((t) => isTaskSubmitted(t)).length;
    const rejected = myTasks.filter((t) => isTaskRejected(t)).length;
    return { total, undone, pending, done, submitted, rejected };
  }, [myTasks]);

  const myTreeSummary = useMemo(() => {
    const total = userTrees.length;
    const healthy = userTrees.filter((t) => HEALTHY_TREE_STATUSES.has(normalizeTreeStatus(t.status))).length;
    const dead = userTrees.filter((t) => DEAD_TREE_STATUSES.has(normalizeTreeStatus(t.status))).length;
    const needs = userTrees.filter((t) => ATTENTION_TREE_STATUSES.has(normalizeTreeStatus(t.status))).length;
    return { total, healthy, dead, needs };
  }, [userTrees]);

  const activeUserDetail = useMemo(() => {
    if (!activeUser) return null;
    const staff = users.find((u) => u.full_name === activeUser);
    if (staff) return staff;
    const custodian = projectCustodians.find((c) => c.name === activeUser);
    if (!custodian) return null;
    return {
      id: custodian.id,
      full_name: custodian.name,
      role: `custodian_${custodian.custodian_type}`,
    } as GreenUser;
  }, [activeUser, users, projectCustodians]);
  const activeActorOptions = useMemo<ActiveActorOption[]>(() => {
    const byKey = new Map<string, ActiveActorOption>();
    users.forEach((user) => {
      const value = String(user.full_name || "").trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (byKey.has(key)) return;
      byKey.set(key, {
        value,
        label: `${user.full_name} (${user.role})`,
        role: user.role,
        actorType: "staff",
        id: user.id,
      });
    });
    projectCustodians.forEach((custodian) => {
      const value = String(custodian.name || "").trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (byKey.has(key)) return;
      byKey.set(key, {
        value,
        label: `${custodian.name} (custodian: ${custodian.custodian_type})`,
        role: `custodian_${custodian.custodian_type}`,
        actorType: "custodian",
        id: custodian.id,
      });
    });
    return Array.from(byKey.values()).sort((a, b) => {
      if (a.actorType !== b.actorType) return a.actorType === "staff" ? -1 : 1;
      return a.value.localeCompare(b.value);
    });
  }, [users, projectCustodians]);

  const pendingPlanting = useMemo(() => {
    const orders = plantingOrders.filter((o) => o.work_type === "planting");
    const totalTarget = orders.reduce((sum: number, o: any) => sum + (o.target_trees || 0), 0);
    const planted = userPlantingTrees.length;
    return Math.max(totalTarget - planted, 0);
  }, [plantingOrders, userPlantingTrees]);

  const plantingReviewCounts = useMemo(() => {
    const submitted = userPlantingTrees.filter((t) => normalizeTreeStatus(t.status) === "pending_planting").length;
    const approved = Math.max(userPlantingTrees.length - submitted, 0);
    return { submitted, approved };
  }, [userPlantingTrees]);

  const refreshSyncStatus = async () => {
    let pending = 0;
    let conflicts = 0;
    try {
      [pending, conflicts] = await Promise.all([getOfflineQueueCount(), getOfflineConflictCount()]);
    } catch {
      pending = 0;
      conflicts = 0;
    }
    setSyncPendingCount(pending);
    setSyncConflictCount(conflicts);
    if (typeof navigator !== "undefined") {
      setIsOnline(navigator.onLine);
    }
    return { pending, conflicts };
  };

  const showOfflineQueuedToast = async (message: string) => {
    const { pending } = await refreshSyncStatus();
    toast.success(`${message} (${pending} pending sync)`);
  };

  const loadProjects = async () => {
    try {
      const res = await api.get("/green/projects");
      const list = Array.isArray(res.data) ? res.data : [];
      setProjects(list);
      await cacheProjectsOffline(list).catch(() => {});
    } catch (error) {
      const cached = await getCachedProjectsOffline().catch(() => []);
      if (cached.length > 0) {
        setProjects(cached);
        return;
      }
      throw error;
    }
  };

  const loadUsers = async () => {
    try {
      const res = await api.get("/green/users");
      const list = Array.isArray(res.data) ? res.data : [];
      setUsers(list);
      await cacheUsersOffline(list).catch(() => {});
    } catch (error) {
      const cached = await getCachedUsersOffline().catch(() => []);
      if (cached.length > 0) {
        setUsers(cached);
        return;
      }
      throw error;
    }
  };

  const loadProjectDetail = async (id: number) => {
    try {
      const [projectRes, treesRes, custodiansRes] = await Promise.allSettled([
        api.get(`/green/projects/${id}`),
        api.get(`/green/projects/${id}/trees`),
        api.get(`/green/projects/${id}/custodians`),
      ]);

      if (projectRes.status !== "fulfilled" || treesRes.status !== "fulfilled") {
        throw new Error("Failed to load required project data");
      }

      setActiveProject(projectRes.value.data);
      const normalized = mergeTreesById(Array.isArray(treesRes.value.data) ? treesRes.value.data : []);
      const custodians =
        custodiansRes.status === "fulfilled" && Array.isArray(custodiansRes.value.data)
          ? custodiansRes.value.data
          : [];
      setProjectCustodians(custodians);
      setTrees(normalized);
      await Promise.all([
        cacheProjectDetailOffline(id, projectRes.value.data).catch(() => {}),
        cacheProjectTreesOffline(id, normalized).catch(() => {}),
      ]);
    } catch (error) {
      const [cachedProject, cachedTrees, pendingDrafts] = await Promise.all([
        getCachedProjectDetailOffline(id).catch(() => null),
        getCachedProjectTreesOffline(id).catch(() => []),
        getPendingTreeDraftsOffline(id).catch(() => []),
      ]);
      const mergedTrees = mergeTreesById([...(cachedTrees || []), ...(pendingDrafts || [])]);
      if (cachedProject) {
        setActiveProject(cachedProject);
      }
      if (mergedTrees.length > 0) {
        setTrees(mergedTrees);
      }
      if (cachedProject || mergedTrees.length > 0) {
        setProjectCustodians([]);
        return;
      }
      throw error;
    }
  };

  const loadWorkOrders = async (projectId: number, assigneeName: string) => {
    try {
      const stamp = Date.now();
      const res = await api.get(
        `/green/work-orders?project_id=${projectId}&assignee_name=${encodeURIComponent(assigneeName)}&_ts=${stamp}`
      );
      const rows = (Array.isArray(res.data) ? res.data : []).map((row: any) => {
        const areaGeometry = normalizeOrderAreaGeometry(row?.area_geojson);
        return {
          ...row,
          area_enabled: Boolean(row?.area_enabled) && Boolean(areaGeometry),
          area_geojson: areaGeometry,
          area_label: typeof row?.area_label === "string" ? row.area_label : null,
        } as WorkOrder;
      });
      setPlantingOrders(rows);
      await cacheWorkOrdersOffline(projectId, assigneeName, rows).catch(() => {});
    } catch (error) {
      const cached = await getCachedWorkOrdersOffline(projectId, assigneeName).catch(() => []);
      if (cached.length > 0) {
        const normalized = cached.map((row: any) => {
          const areaGeometry = normalizeOrderAreaGeometry(row?.area_geojson);
          return {
            ...row,
            area_enabled: Boolean(row?.area_enabled) && Boolean(areaGeometry),
            area_geojson: areaGeometry,
            area_label: typeof row?.area_label === "string" ? row.area_label : null,
          } as WorkOrder;
        });
        setPlantingOrders(normalized);
        return;
      }
      throw error;
    }
  };

  useEffect(() => {
    loadProjects().catch(() => toast.error("Failed to load projects"));
    loadUsers().catch(() => toast.error("Failed to load users"));
  }, []);

  useEffect(() => {
    if (!projects.length || !pendingRestoreProjectId || activeProject) return;
    const project = projects.find((item) => Number(item.id) === Number(pendingRestoreProjectId));
    if (project) {
      void selectProject(project);
    }
    setPendingRestoreProjectId(null);
  }, [projects, pendingRestoreProjectId, activeProject]);

  useEffect(() => {
    localStorage.setItem("landcheck_green_active_user", activeUser || "");
  }, [activeUser]);

  useEffect(() => {
    localStorage.setItem("landcheck_green_active_section", activeSection || "");
  }, [activeSection]);

  useEffect(() => {
    localStorage.setItem("landcheck_green_active_project_id", activeProject ? String(activeProject.id) : "");
  }, [activeProject?.id, activeProject]);

  useEffect(() => {
    if (activeProject && activeUser) {
      loadMyTasks().catch(() => toast.error("Failed to load tasks"));
    }
  }, [activeProject?.id, activeUser]);

  useEffect(() => {
    if (!activeProject || !activeUser) return;
    loadWorkOrders(activeProject.id, activeUser).catch(() => setPlantingOrders([]));
  }, [activeProject?.id, activeUser]);

  useEffect(() => {
    let cancelled = false;
    const syncQueued = async (showToastOnSuccess = false) => {
      if (!navigator.onLine) {
        if (!cancelled) {
          setIsOnline(false);
          await refreshSyncStatus();
        }
        return;
      }
      if (!cancelled) {
        setIsOnline(true);
        setSyncInProgress(true);
      }
      try {
        let result: { synced: number; failed: number; conflicts: number; pending: number } = {
          synced: 0,
          failed: 0,
          conflicts: 0,
          pending: 0,
        };
        try {
          result = await syncGreenQueueOffline(api);
        } catch {
          // If IndexedDB/background sync is unavailable, keep UI running live-only.
          result = { synced: 0, failed: 0, conflicts: 0, pending: 0 };
        }
        if (cancelled) return;
        if (result.synced > 0 || result.conflicts > 0) {
          if (activeProject) {
            await loadProjectDetail(activeProject.id).catch(() => {});
          }
          if (activeProject && activeUser) {
            await loadMyTasks().catch(() => {});
            await loadWorkOrders(activeProject.id, activeUser).catch(() => {});
          }
        }
        if (showToastOnSuccess && result.synced > 0) {
          toast.success(`Synced ${result.synced} offline update${result.synced === 1 ? "" : "s"}.`);
        }
        if (result.conflicts > 0) {
          toast.error(`${result.conflicts} offline update${result.conflicts === 1 ? "" : "s"} needs review.`);
        }
      } finally {
        if (!cancelled) {
          setSyncInProgress(false);
          await refreshSyncStatus();
        }
      }
    };

    void registerGreenBackgroundSync();
    void refreshSyncStatus();
    void syncQueued(false);

    const handleOnline = () => {
      setIsOnline(true);
      void syncQueued(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
      void refreshSyncStatus();
    };
    const handleWorkerMessage = (event: MessageEvent) => {
      if (event?.data?.type === "GREEN_SYNC_QUEUE") {
        void syncQueued(true);
      }
    };

    // When app returns from background on mobile, re-check online status and sync
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setIsOnline(navigator.onLine);
        if (navigator.onLine) {
          void syncQueued(true);
        } else {
          void refreshSyncStatus();
        }
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleWorkerMessage);
    }
    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleWorkerMessage);
      }
    };
  }, [activeProject?.id, activeUser]);

  useEffect(() => {
    if (activeProject && activeUser) return;
    setMyTasks([]);
    setTaskEdits({});
    setTaskGpsLoadingId(null);
    setPlantingOrders([]);
    setSelectedTreeId(null);
    setInspectedTree(null);
    setTreeTasks([]);
    setTreeTimeline(null);
    if (!activeProject) {
      setProjectCustodians([]);
    }
  }, [activeProject?.id, activeUser]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredInstallPrompt);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const selectProject = async (project: Project) => {
    setInspectedTree(null);
    setLoadingTrees(true);
    try {
      await loadProjectDetail(project.id);
    } catch {
      toast.error("Failed to load project");
    } finally {
      setLoadingTrees(false);
    }
  };

  const resetNewTreeForm = () => {
    setNewTree({
      lng: 0,
      lat: 0,
      species: "",
      planting_date: "",
      tree_height_m: "",
      status: "alive",
      tree_origin: "new_planting",
      attribution_scope: "full",
      count_in_planting_kpis: true,
      count_in_carbon_scope: true,
      custodian_id: "",
      notes: "",
      photo_url: "",
      created_by: "",
    });
  };

  const primeWorkExistingTreeView = (projectId: number, treeId?: number | null) => {
    if (typeof window === "undefined" || !projectId) return;
    localStorage.setItem("landcheck_work_active_project_id", String(projectId));
    localStorage.setItem("landcheck_work_active_form", "existing_tree_intake");
    localStorage.setItem("landcheck_work_existing_tree_refresh_at", String(Date.now()));
    const normalizedTreeId = Number(treeId || 0);
    if (Number.isFinite(normalizedTreeId) && normalizedTreeId > 0) {
      localStorage.setItem("landcheck_work_existing_tree_focus_id", String(normalizedTreeId));
    }
  };

  const addTree = async () => {
    if (!activeProject) return;
    if (addingTree) return;
    if (!activeUser) {
      toast.error("Select a staff or custodian first");
      return;
    }
    if (!newTree.lng || !newTree.lat) {
      toast.error("Pick a point on the map");
      return;
    }
    const treeHeightValue = parseTreeHeightInput(newTree.tree_height_m);
    if (newTree.tree_height_m && treeHeightValue === null) {
      toast.error("Tree height must be a number between 0 and 120.");
      return;
    }
    const treePayload = {
      project_id: activeProject.id,
      lng: Number(newTree.lng),
      lat: Number(newTree.lat),
      species: (newTree.species || "").trim(),
      planting_date: newTree.planting_date || null,
      status: newTree.status,
      tree_origin: newTree.tree_origin,
      attribution_scope: newTree.attribution_scope,
      count_in_planting_kpis: newTree.tree_origin === "existing_inventory" ? newTree.count_in_planting_kpis : true,
      count_in_carbon_scope: newTree.count_in_carbon_scope,
      custodian_id: newTree.custodian_id ? Number(newTree.custodian_id) : null,
      tree_height_m: treeHeightValue,
      notes: newTree.notes,
      photo_url: "",
      created_by: activeUser,
    };
    setAddingTree(true);
    setPlantingFlowMessage(newTree.tree_origin === "existing_inventory" ? "Saving existing tree..." : "Planting tree...");
    setPlantingFlowState("loading");
    try {
      const createRes = await api.post("/green/trees", treePayload);
      const createdTreeId = Number(createRes.data?.id || 0);
      const reviewTaskId = Number(createRes.data?.review_task_id || 0);
      let photoLinked = true;

      if (pendingTreePhoto && Number.isFinite(createdTreeId) && createdTreeId > 0) {
        try {
          if (Number.isFinite(reviewTaskId) && reviewTaskId > 0) {
            await uploadGreenPhoto(pendingTreePhoto, "tasks", { taskId: reviewTaskId });
          } else {
            await uploadGreenPhoto(pendingTreePhoto, "trees", { treeId: createdTreeId });
          }
        } catch (uploadError) {
          photoLinked = false;
          if (isLikelyNetworkError(uploadError) && activeProject) {
            const link = Number.isFinite(reviewTaskId) && reviewTaskId > 0 ? { taskId: reviewTaskId } : { treeId: createdTreeId };
            await queuePhotoUploadOffline(pendingTreePhoto, Number.isFinite(reviewTaskId) && reviewTaskId > 0 ? "tasks" : "trees", link, {
              projectId: activeProject.id,
              assigneeName: activeUser || "",
            }).catch(() => {});
          }
        }
      }

      resetNewTreeForm();
      setPhotoPreview("");
      setPendingTreePhoto(null);
      await loadProjectDetail(activeProject.id);
      if (treePayload.tree_origin === "existing_inventory") {
        primeWorkExistingTreeView(activeProject.id, createdTreeId);
      }
      if (activeProject && activeUser) {
        await loadWorkOrders(activeProject.id, activeUser).catch(() => setPlantingOrders([]));
      }
      if (photoLinked) {
        setPlantingFlowMessage(
          treePayload.tree_origin === "existing_inventory"
            ? "Existing tree saved."
            : Number.isFinite(reviewTaskId) && reviewTaskId > 0
            ? "Tree submitted for supervisor review."
            : "Tree successfully planted!"
        );
      } else {
        setPlantingFlowMessage(
          treePayload.tree_origin === "existing_inventory"
            ? "Existing tree saved. Photo upload failed."
            : "Tree successfully planted! Photo upload failed."
        );
      }
      setPlantingFlowState("success");
    } catch (error: any) {
      if (isLikelyNetworkError(error)) {
        try {
          const queued = await queueCreateTreeOffline(
            treePayload,
            { projectId: activeProject.id, assigneeName: activeUser },
            pendingTreePhoto
          );
          setTrees((prev) =>
            mergeTreesById([
              queued.tempTree,
              ...prev,
            ]) as Tree[]
          );
          resetNewTreeForm();
          setPhotoPreview("");
          setPendingTreePhoto(null);
          if (treePayload.tree_origin === "existing_inventory") {
            primeWorkExistingTreeView(activeProject.id, queued.tempTree?.id || null);
          }
          setPlantingFlowMessage(
            treePayload.tree_origin === "existing_inventory"
              ? "Existing tree saved offline and will sync automatically."
              : "Saved offline. Tree will sync automatically when online."
          );
          setPlantingFlowState("success");
          await showOfflineQueuedToast("Tree saved offline.");
        } catch {
          setPlantingFlowMessage("Failed to store tree offline.");
          setPlantingFlowState("error");
        }
      } else {
        setPlantingFlowMessage(
          treePayload.tree_origin === "existing_inventory"
            ? "Failed to save existing tree. Please try again."
            : "Failed to plant tree. Please try again."
        );
        setPlantingFlowState("error");
      }
    } finally {
      setAddingTree(false);
    }
  };

  const updateTreeHeight = async (treeId: number, rawHeight: string) => {
    if (!activeProject) return;
    const parsed = parseTreeHeightInput(rawHeight);
    if (String(rawHeight || "").trim() && parsed === null) {
      toast.error("Tree height must be a number between 0 and 120.");
      return;
    }
    setSavingTreeHeightId(treeId);
    try {
      await api.patch(`/green/trees/${treeId}`, {
        tree_height_m: parsed,
      });
      setTrees((prev) => prev.map((tree) => (tree.id === treeId ? { ...tree, tree_height_m: parsed } : tree)));
      setInspectedTree((prev) =>
        prev && Number(prev.id) === Number(treeId)
          ? {
              ...prev,
              tree_height_m: parsed,
            }
          : prev
      );
      setTreeHeightDraftById((prev) => ({ ...prev, [treeId]: parsed === null ? "" : String(parsed) }));
      toast.success("Tree height updated");
    } catch {
      toast.error("Failed to update tree height");
    } finally {
      setSavingTreeHeightId(null);
    }
  };

  const loadTreeDetails = async (treeId: number) => {
    setSelectedTreeId(treeId);
    try {
      const [tasksRes, timelineRes] = await Promise.all([
        api.get(`/green/trees/${treeId}/tasks`),
        api.get(`/green/trees/${treeId}/timeline`),
      ]);
      const tasks = Array.isArray(tasksRes.data) ? tasksRes.data : [];
      const scopedTasks = tasks.filter((task: any) => !activeUser || task.assignee_name === activeUser);
      setTreeTasks(scopedTasks);
      setTreeTimeline(timelineRes.data);
      await Promise.all([
        cacheTreeTasksOffline(treeId, tasks).catch(() => {}),
        cacheTreeTimelineOffline(treeId, timelineRes.data).catch(() => {}),
      ]);
    } catch (error) {
      const [cachedTasks, cachedTimeline] = await Promise.all([
        getCachedTreeTasksOffline(treeId).catch(() => []),
        getCachedTreeTimelineOffline(treeId).catch(() => null),
      ]);
      const scopedTasks = (cachedTasks || []).filter((task: any) => !activeUser || task.assignee_name === activeUser);
      if (scopedTasks.length > 0 || cachedTimeline) {
        setTreeTasks(scopedTasks);
        setTreeTimeline(cachedTimeline);
        return;
      }
      setTreeTasks([]);
      setTreeTimeline(null);
      toast.error("Failed to load tree details");
    }
  };

  const loadMyTasks = async () => {
    if (!activeProject || !activeUser) return;
    let rows: any[] = [];
    try {
      const stamp = Date.now();
      const res = await api.get(
        `/green/tasks?project_id=${activeProject.id}&assignee_name=${encodeURIComponent(activeUser)}&_ts=${stamp}`
      );
      rows = Array.isArray(res.data) ? res.data : [];
      await cacheTasksOffline(activeProject.id, activeUser, rows).catch(() => {});
    } catch (error) {
      rows = await getCachedTasksOffline(activeProject.id, activeUser).catch(() => []);
      if (rows.length === 0) {
        setMyTasks([]);
        setTaskEdits({});
        setEditingTaskId(null);
        setTaskGpsLoadingId(null);
        if (!isLikelyNetworkError(error)) {
          toast.error("Failed to load tasks");
        }
        return;
      }
    }
    setMyTasks(rows);
    const edits: Record<number, TaskEdit> = {};
    rows.forEach((t: any) => {
      edits[t.id] = buildTaskEdit(t);
    });
    setTaskEdits(edits);
    setEditingTaskId(null);
    setTaskGpsLoadingId(null);
  };

  const saveTaskUpdate = async (taskId: number) => {
    const task = myTasks.find((entry: any) => entry.id === taskId);
    const edit = buildTaskEdit(task, taskEdits[taskId]);
    if (isTaskLockedForField(task)) {
      toast.error("Task is locked for review");
      return;
    }
    const payload = sanitizeTaskEditForApi(edit);
    try {
      await api.patch(`/green/tasks/${taskId}`, payload);
      await loadMyTasks();
      toast.success("Task updated");
    } catch (error) {
      if (isLikelyNetworkError(error) && activeProject && activeUser) {
        try {
          await queueTaskUpdateOffline(taskId, payload, {
            projectId: activeProject.id,
            assigneeName: activeUser,
          });
          setMyTasks((prev) => prev.map((row: any) => (row.id === taskId ? { ...row, ...edit } : row)));
          await showOfflineQueuedToast("Task update saved offline.");
          return;
        } catch {
          toast.error("Failed to queue task update offline");
          return;
        }
      }
      toast.error("Failed to update task");
    }
  };

  const submitTaskForReview = async (taskId: number) => {
    const task = myTasks.find((entry: any) => entry.id === taskId);
    if (!task) return;
    if (isTaskLockedForField(task)) {
      toast.error("Task is locked for review");
      return;
    }
    const edit = buildTaskEdit(task, taskEdits[taskId]);
    if (!hasTaskEvidence(task, edit)) {
      toast.error("Add notes and photo proof before submission.");
      return;
    }
    const loadingId = toast.loading("Submitting task for supervisor review...");
    const submitPayload: Record<string, any> = {
      notes: edit.notes,
      tree_status: edit.tree_status,
      actor_name: activeUser || "",
    };
    if (edit.photo_url && !isLocalBlobUrl(edit.photo_url)) {
      submitPayload.photo_url = edit.photo_url;
    }
    if (edit.activity_lng !== null && edit.activity_lat !== null) {
      submitPayload.activity_lng = Number(edit.activity_lng.toFixed(6));
      submitPayload.activity_lat = Number(edit.activity_lat.toFixed(6));
      submitPayload.activity_recorded_at = (edit.activity_recorded_at || "").trim() || new Date().toISOString();
    }
    try {
      await api.post(`/green/tasks/${taskId}/submit`, submitPayload);
      setMyTasks((prev) =>
        prev.map((task: any) =>
          task.id === taskId
            ? {
                ...task,
                status: "done",
                review_state: "submitted",
                reported_tree_status: edit.tree_status || task.reported_tree_status || task.tree_status,
                review_notes: null,
                activity_lng: edit.activity_lng ?? task.activity_lng,
                activity_lat: edit.activity_lat ?? task.activity_lat,
                activity_recorded_at: edit.activity_recorded_at || task.activity_recorded_at,
              }
            : task
        )
      );
      await loadMyTasks();
      if (activeProject) {
        await loadProjectDetail(activeProject.id);
      }
      toast.success("Task submitted for review", { id: loadingId });
      setEditingTaskId(null);
    } catch (error: any) {
      if (isLikelyNetworkError(error) && activeProject && activeUser) {
        try {
          await queueTaskSubmitOffline(taskId, submitPayload, {
            projectId: activeProject.id,
            assigneeName: activeUser,
          });
          setMyTasks((prev) =>
            prev.map((task: any) =>
              task.id === taskId
                ? {
                    ...task,
                    status: "done",
                    review_state: "submitted",
                    reported_tree_status: edit.tree_status || task.reported_tree_status || task.tree_status,
                    review_notes: null,
                    activity_lng: edit.activity_lng ?? task.activity_lng,
                    activity_lat: edit.activity_lat ?? task.activity_lat,
                    activity_recorded_at: edit.activity_recorded_at || task.activity_recorded_at,
                  }
                : task
            )
          );
          toast.success("Task submission queued offline", { id: loadingId });
          setEditingTaskId(null);
          await showOfflineQueuedToast("Task submission saved offline.");
          return;
        } catch {
          toast.error("Failed to queue task submission offline", { id: loadingId });
          return;
        }
      }
      toast.error(error?.response?.data?.detail || "Failed to submit task", { id: loadingId });
    }
  };

  const openDirections = (lng: number, lat: number) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, "_blank");
  };

  const uploadGreenPhoto = async (
    file: File,
    folder: "trees" | "tasks",
    link?: { treeId?: number; taskId?: number }
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);
    if (link?.treeId) formData.append("tree_id", String(link.treeId));
    if (link?.taskId) formData.append("task_id", String(link.taskId));
    const res = await api.post("/green/uploads/photo", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const url = String(res.data?.url || "");
    if (!url) throw new Error("Upload URL missing");
    return url;
  };

  const onTaskPhotoPicked = async (taskId: number, file: File | null) => {
    if (!file) return;
    const task = myTasks.find((entry: any) => entry.id === taskId);
    if (isTaskLockedForField(task)) {
      toast.error("Task is locked for review");
      return;
    }
    const loadingId = toast.loading("Uploading task photo...");
    try {
      const photoUrl = await uploadGreenPhoto(file, "tasks", { taskId });
      const linkedTask = myTasks.find((task: any) => task.id === taskId);
      setTaskEdits((prev) => ({
        ...prev,
        [taskId]: buildTaskEdit(linkedTask || task, {
          ...prev[taskId],
          photo_url: photoUrl,
        }),
      }));
      setMyTasks((prev) => prev.map((task: any) => (task.id === taskId ? { ...task, photo_url: photoUrl } : task)));
      if (linkedTask && inspectedTree && Number(linkedTask.tree_id) === inspectedTree.id) {
        setInspectedTree((prev) => (prev ? { ...prev, photo_url: photoUrl } : prev));
      }
      if (activeProject) {
        await loadProjectDetail(activeProject.id);
      }
      toast.success("Task photo uploaded", { id: loadingId });
    } catch (error) {
      if (isLikelyNetworkError(error) && activeProject && activeUser) {
        try {
          const queued = await queuePhotoUploadOffline(file, "tasks", { taskId }, {
            projectId: activeProject.id,
            assigneeName: activeUser,
          });
          setTaskEdits((prev) => ({
            ...prev,
            [taskId]: buildTaskEdit(task, {
              ...prev[taskId],
              photo_url: queued.localPreviewUrl,
            }),
          }));
          setMyTasks((prev) =>
            prev.map((row: any) => (row.id === taskId ? { ...row, photo_url: queued.localPreviewUrl } : row))
          );
          if (task && inspectedTree && Number(task.tree_id) === inspectedTree.id) {
            setInspectedTree((prev) => (prev ? { ...prev, photo_url: queued.localPreviewUrl } : prev));
          }
          toast.success("Task photo queued offline", { id: loadingId });
          await showOfflineQueuedToast("Task photo saved offline.");
          return;
        } catch {
          toast.error("Failed to queue task photo offline", { id: loadingId });
          return;
        }
      }
      toast.error("Failed to upload task photo", { id: loadingId });
    }
  };

  const updateTreeStatus = async (treeId: number, status: string) => {
    try {
      await api.patch(`/green/trees/${treeId}`, { status });
      if (activeProject) {
        await loadProjectDetail(activeProject.id);
      }
    } catch (error) {
      if (isLikelyNetworkError(error) && activeProject) {
        try {
          await queueTreeStatusOffline(treeId, status, {
            projectId: activeProject.id,
            assigneeName: activeUser || "",
          });
          setTrees((prev) => prev.map((tree) => (tree.id === treeId ? { ...tree, status } : tree)));
          setInspectedTree((prev) =>
            prev && Number(prev.id) === Number(treeId)
              ? { ...prev, status, status_label: formatTreeConditionLabel(status) }
              : prev
          );
          await showOfflineQueuedToast("Tree status saved offline.");
          return;
        } catch {
          toast.error("Failed to queue tree status offline");
          return;
        }
      }
      toast.error("Failed to update tree status");
    }
  };

  const exportPdf = async () => {
    if (!activeProject || !activeUser) {
      toast.error("Select a project and staff/custodian first.");
      return;
    }
    if (!navigator.onLine) {
      toast.error("Offline now. Reconnect to export PDF.");
      return;
    }
    const params = new URLSearchParams({
      assignee_name: activeUser,
      _ts: String(Date.now()),
    });
    if (includePhotosInReport) {
      params.set("include_photos", "true");
    }
    window.open(`${BACKEND_URL}/green/projects/${activeProject.id}/donor-report/pdf?${params.toString()}`, "_blank");
  };

  const useGps = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported on this device");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lng = Number(pos.coords.longitude.toFixed(6));
        const lat = Number(pos.coords.latitude.toFixed(6));
        setNewTree((prev) => ({
          ...prev,
          lng,
          lat,
        }));
        setFocusPoint([{ lng, lat }]);
        setGpsLoading(false);
      },
      () => {
        toast.error("Unable to get GPS location");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const captureTaskGps = (taskId: number) => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported on this device");
      return;
    }
    const task = myTasks.find((entry: any) => entry.id === taskId);
    if (!task || isTaskLockedForField(task)) {
      toast.error("Task is locked for review");
      return;
    }
    setTaskGpsLoadingId(taskId);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lng = Number(pos.coords.longitude.toFixed(6));
        const lat = Number(pos.coords.latitude.toFixed(6));
        const recordedAt = new Date().toISOString();
        setTaskEdits((prev) => ({
          ...prev,
          [taskId]: buildTaskEdit(task, {
            ...prev[taskId],
            activity_lng: lng,
            activity_lat: lat,
            activity_recorded_at: recordedAt,
          }),
        }));
        setMyTasks((prev) =>
          prev.map((row: any) =>
            row.id === taskId
              ? {
                  ...row,
                  activity_lng: lng,
                  activity_lat: lat,
                  activity_recorded_at: recordedAt,
                }
              : row
          )
        );
        setFocusPoint([{ lng, lat }]);
        toast.success("Maintenance GPS captured");
        setTaskGpsLoadingId(null);
      },
      () => {
        toast.error("Unable to get GPS location");
        setTaskGpsLoadingId(null);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onPhotoPicked = (file: File | null) => {
    if (!file) {
      setPendingTreePhoto(null);
      setPhotoPreview("");
      return;
    }
    setPendingTreePhoto(file);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setPhotoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
    setNewTree((prev) => ({ ...prev, photo_url: "" }));
  };

  const onInspectedTreePhotoPicked = async (file: File | null) => {
    if (!file || !inspectedTree) return;
    const treeId = inspectedTree.id;
    setTreePhotoUploading(true);
    const loadingId = toast.loading("Uploading tree photo...");
    try {
      const photoUrl = await uploadGreenPhoto(file, "trees", { treeId });
      setInspectedTree((prev) => (prev && prev.id === treeId ? { ...prev, photo_url: photoUrl } : prev));
      if (activeProject) {
        await loadProjectDetail(activeProject.id);
      }
      toast.success("Tree photo updated", { id: loadingId });
    } catch (error) {
      if (isLikelyNetworkError(error) && activeProject) {
        try {
          const queued = await queuePhotoUploadOffline(file, "trees", { treeId }, {
            projectId: activeProject.id,
            assigneeName: activeUser || "",
          });
          setInspectedTree((prev) => (prev && prev.id === treeId ? { ...prev, photo_url: queued.localPreviewUrl } : prev));
          setTrees((prev) => prev.map((tree) => (tree.id === treeId ? { ...tree, photo_url: queued.localPreviewUrl } : tree)));
          toast.success("Tree photo queued offline", { id: loadingId });
          await showOfflineQueuedToast("Tree photo saved offline.");
          return;
        } catch {
          toast.error("Failed to queue tree photo offline", { id: loadingId });
          return;
        }
      }
      toast.error("Failed to upload tree photo", { id: loadingId });
    } finally {
      setTreePhotoUploading(false);
    }
  };

  const installGreenApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const openSection = (section: Section) => {
    setActiveSection(section);
    setEditingTaskId(null);
  };

  const goHome = () => {
    setActiveSection(null);
    setEditingTaskId(null);
    setSelectedTreeId(null);
    setInspectedTree(null);
  };

  const onPlantingFlowOk = () => {
    const shouldGoHome = plantingFlowState === "success";
    setPlantingFlowState("idle");
    setPlantingFlowMessage("");
    if (shouldGoHome) {
      goHome();
    }
  };

  const totalTrees = activeUser ? myTreeSummary.total : 0;
  const healthyTrees = activeUser ? myTreeSummary.healthy : 0;
  const deadTrees = activeUser ? myTreeSummary.dead : 0;
  const needsAttentionTrees = activeUser ? myTreeSummary.needs : 0;
  const survivalRate = totalTrees > 0 ? Math.round((healthyTrees / totalTrees) * 100) : 0;
  const carbonCurrentValue = activeProject?.carbon
    ? formatTonnesOrKg(activeProject.carbon.current_co2_tonnes, activeProject.carbon.current_co2_kg, 2, 1)
    : "0 kg";
  const carbonAnnualValue = activeProject?.carbon
    ? formatTonnesOrKg(activeProject.carbon.annual_co2_tonnes, activeProject.carbon.annual_co2_kg, 2, 1)
    : "0 kg";
  const carbonProjectedValue = activeProject?.carbon
    ? `${Number(activeProject.carbon.projected_lifetime_co2_tonnes || 0).toFixed(2)} t`
    : "0.00 t";
  const projectAliveTreeCount = Number(activeProject?.stats?.alive || 0);
  const carbonPerTreeValue = activeProject?.carbon
    ? `${Number(activeProject.carbon.co2_per_tree_avg_kg || 0).toFixed(1)} kg`
    : "0.0 kg";
  const carbonAnnualPerTreeValue = activeProject?.carbon
    ? `${(projectAliveTreeCount > 0 ? Number(activeProject.carbon.annual_co2_kg || 0) / projectAliveTreeCount : 0).toFixed(2)} kg/yr`
    : "0.00 kg/yr";
  const syncPrimaryText = syncInProgress ? "Syncing" : isOnline ? "Online" : "Offline";
  const syncSecondaryText =
    syncPendingCount > 0 ? `${syncPendingCount} pending` : isOnline ? "All synced" : "Waiting for connection";
  const syncClassName = [
    "green-sync-badge",
    isOnline ? "is-online" : "is-offline",
    syncInProgress ? "is-syncing" : "",
    syncPendingCount > 0 ? "has-pending" : "",
    syncConflictCount > 0 ? "has-conflicts" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`green-container ${activeSection === null ? "green-home-mode" : "green-detail-mode"}`}>
      <Toaster position="top-right" />
      <header className="green-header">
        <div className="green-header-inner">
          <div className="green-header-brand">
            <div className="green-brand-logo" aria-hidden="true">
              <img src={GREEN_LOGO_SRC} alt="LandCheck Green" />
            </div>
            <div className="green-header-title">
              <h1>
                LandCheck <span>Green</span>
              </h1>
              <p>Field dashboard for tree monitoring</p>
            </div>
          </div>
          <div className="green-header-actions">
            <div className={syncClassName} aria-live="polite">
              <strong>{syncPrimaryText}</strong>
              <span>{syncSecondaryText}</span>
              {syncConflictCount > 0 && (
                <small>
                  {syncConflictCount} conflict{syncConflictCount === 1 ? "" : "s"}
                </small>
              )}
            </div>
            {installPrompt && (
              <button className="green-ghost-btn" onClick={installGreenApp} type="button">
                Install App
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="green-shell">
        {activeSection === null && (
          <>
        <section className="green-setup-card" id="project">
          <h2>Project & Field Setup</h2>

          <div className="green-form-field">
            <label>Project Project</label>
            <div className="green-select-row">
              <select
                value={activeProject?.id || ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const project = projects.find((p) => p.id === id);
                  if (project) {
                    selectProject(project);
                  }
                }}
              >
                <option value="">Choose a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.location_text ? `- ${p.location_text}` : ""}
                  </option>
                ))}
              </select>

              <select value={activeUser} onChange={(e) => setActiveUser(e.target.value)}>
                <option value="">Select staff or custodian</option>
                {activeActorOptions.map((option) => (
                  <option key={`${option.actorType}-${option.id}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={`green-project-status ${activeProject ? "selected" : "empty"}`}>
            {activeProject ? (
              <>
                <strong>{activeProject.name}</strong>
                <span>{activeProject.location_text || "Project selected"}</span>
              </>
            ) : (
              <>
                <strong>No project selected.</strong>
                <span>Please select a project to begin.</span>
              </>
            )}
          </div>
          {activeProject && !activeUser && (
            <p className="green-empty">Select a staff member or custodian to load only their trees and tasks.</p>
          )}

          <div className="green-stats-top">
            <div className="green-stat-item">
              <span>Total Trees</span>
              <strong className="green-stat-total">{totalTrees}</strong>
            </div>
            <div className="green-stat-item">
              <span>Healthy</span>
              <strong className="green-stat-alive">{healthyTrees}</strong>
            </div>
            <div className="green-stat-item">
              <span>Dead</span>
              <strong className="green-stat-dead">{deadTrees}</strong>
            </div>
            <div className="green-stat-item">
              <span>Needs Attention</span>
              <strong className="green-stat-needs">{needsAttentionTrees}</strong>
            </div>
          </div>

          <div className="green-stats-bottom">
            <span>Survival Rate</span>
            <strong>{survivalRate}%</strong>
          </div>

          {activeProject?.carbon && (
            <div className="green-carbon-panel">
              <h3 className="green-carbon-title">Carbon Impact</h3>
              <div className="green-carbon-grid">
                <div className="green-carbon-card">
                  <span className="green-carbon-value">{carbonCurrentValue}</span>
                  <span className="green-carbon-label">CO2 sequestered (current)</span>
                </div>
                <div className="green-carbon-card">
                  <span className="green-carbon-value">{carbonAnnualValue}</span>
                  <span className="green-carbon-label">estimated CO2 / year now</span>
                </div>
                <div className="green-carbon-card green-carbon-card-accent">
                  <span className="green-carbon-value">{carbonProjectedValue}</span>
                  <span className="green-carbon-label">projected stock by year 40</span>
                </div>
                <div className="green-carbon-card">
                  <span className="green-carbon-value">{carbonPerTreeValue}</span>
                  <span className="green-carbon-label">average current per tree</span>
                  <span className="green-carbon-subvalue">{carbonAnnualPerTreeValue} average annual per tree</span>
                </div>
              </div>
              {(activeProject.carbon.current_co2_tonnes <= 0 || activeProject.carbon.projected_lifetime_co2_tonnes <= 0) && (
                <p className="green-carbon-warning">
                  CO2 is low/zero. Check tree planting dates and review status.
                  {(activeProject.carbon.trees_missing_age_data || 0) > 0 &&
                    ` Missing age data: ${activeProject.carbon.trees_missing_age_data}.`}
                  {(activeProject.carbon.trees_pending_review || 0) > 0 &&
                    ` Pending review: ${activeProject.carbon.trees_pending_review}.`}
                </p>
              )}
              <p className="green-carbon-explain">
                Annual is based on trees&apos; current ages; 40-year value is cumulative modeled stock by year 40.
              </p>
              <p className="green-carbon-method">IPCC Tier 1 + Chave et al. (2014)</p>
            </div>
          )}
        </section>

        <section className="green-tiles">
          <button
            className={`green-tile ${activeSection === "tasks" ? "active" : ""}`}
            onClick={() => openSection("tasks")}
            type="button"
          >
            <span className="green-tile-icon" aria-hidden="true">
              <TaskTileIcon />
            </span>
            <span className="green-tile-label">Maintenance Tasks</span>
            <span className="green-tile-meta">
              <span className="green-tile-meta-item is-review">Submitted {myTaskCounts.submitted}</span>
              <span className="green-tile-meta-item is-approved">Approved {myTaskCounts.done}</span>
            </span>
            <span className={`green-tile-badge ${myTaskCounts.undone > 0 ? "green-tile-badge-assigned" : ""}`}>{myTaskCounts.undone}</span>
            {myTaskCounts.rejected > 0 && <span className="green-tile-badge green-tile-badge-rejected">{myTaskCounts.rejected}</span>}
          </button>

          <button
            className={`green-tile ${activeSection === "map" ? "active" : ""}`}
            onClick={() => openSection("map")}
            type="button"
          >
            <span className="green-tile-icon" aria-hidden="true">
              <MapTileIcon />
            </span>
            <span className="green-tile-label">Map & Add Trees</span>
            <span className="green-tile-meta">
              <span className="green-tile-meta-item is-review">Submitted {plantingReviewCounts.submitted}</span>
              <span className="green-tile-meta-item is-approved">Approved {plantingReviewCounts.approved}</span>
            </span>
            <span className={`green-tile-badge ${pendingPlanting > 0 ? "green-tile-badge-assigned" : ""}`}>{pendingPlanting}</span>
          </button>

          <button
            className={`green-tile green-tile-wide ${activeSection === "records" ? "active" : ""}`}
            onClick={() => openSection("records")}
            type="button"
          >
            <span className="green-tile-icon" aria-hidden="true">
              <TreeTileIcon />
            </span>
            <span className="green-tile-label">Tree Records</span>
            <span className="green-tile-badge">{myTreeSummary.total}</span>
          </button>
        </section>
          </>
        )}

        {activeSection !== null && (
          <div className="green-view-toolbar">
            <button className="green-back-home" type="button" onClick={goHome}>
              Back To Home
            </button>
          </div>
        )}

        {activeSection !== null && activeSection !== "profile" && !activeProject && (
          <section className="green-detail-card">
            <h3>Select a project to begin</h3>
            <p>Projects are created in LandCheck Work.</p>
          </section>
        )}

        {activeProject && activeSection === "tasks" && (
          <section className="green-detail-card" id="green-section-tasks">
            <div className="green-detail-header">
              <h3>Maintenance Tasks</h3>
              <button className="green-btn-outline" onClick={loadMyTasks} type="button">
                Refresh
              </button>
            </div>
            {!activeUser ? (
              <p className="green-empty">Select a staff member or custodian to view assigned tasks.</p>
            ) : myTasks.length === 0 ? (
              <p className="green-empty">No tasks assigned.</p>
            ) : userTrees.length === 0 ? (
              <p className="green-empty">No trees recorded yet for this selected user.</p>
            ) : (
              <div className="tree-table">
                <div className="tree-row tree-header">
                  <span>Task</span>
                  <span>Tree</span>
                  <span>Status</span>
                  <span>Due</span>
                  <span>Action</span>
                </div>
                {myTasks.map((t) => {
                  const taskEdit = taskEdits[t.id];
                  const activityLng = toFiniteNumber(hasOwn(taskEdit, "activity_lng") ? taskEdit?.activity_lng : t.activity_lng);
                  const activityLat = toFiniteNumber(hasOwn(taskEdit, "activity_lat") ? taskEdit?.activity_lat : t.activity_lat);
                  const hasActivityGps = activityLng !== null && activityLat !== null;
                  const activityRecordedAt = String(
                    hasOwn(taskEdit, "activity_recorded_at")
                      ? taskEdit?.activity_recorded_at || ""
                      : t.activity_recorded_at || ""
                  ).trim();
                  return (
                  <div key={t.id} className={`green-task-entry ${isTaskLockedForField(t) ? "is-done" : ""}`}>
                    <div
                      className={`tree-row task-row ${isTaskLockedForField(t) ? "task-row-locked" : ""}`}
                      onClick={() => {
                        if (!isTaskLockedForField(t) && Number.isFinite(t.lng) && Number.isFinite(t.lat)) {
                          setFocusPoint([{ lng: Number(t.lng), lat: Number(t.lat) }]);
                        }
                      }}
                    >
                      <span className="task-cell" data-label="Task">
                        {t.task_type}
                      </span>
                      <span className="task-cell" data-label="Tree">
                        #{t.tree_id}
                      </span>
                      <span className="task-cell" data-label="Status">
                        {isTaskApproved(t) ? (
                          <span className="green-task-status-badge is-done">
                            <span className="green-task-status-check" aria-hidden="true">
                              ✓
                            </span>
                            {`Approved / ${formatTreeConditionLabel(t.reported_tree_status || t.tree_status || "healthy")}`}
                          </span>
                        ) : isTaskSubmitted(t) ? (
                          <span className="green-task-status-badge is-submitted">
                            Submitted
                          </span>
                        ) : isTaskRejected(t) ? (
                          <span className="green-task-status-badge is-rejected">
                            Rejected
                          </span>
                        ) : (
                          <select
                            value={taskEdits[t.id]?.status || t.status}
                            onChange={(e) =>
                              setTaskEdits((prev) => ({
                                ...prev,
                                [t.id]: buildTaskEdit(t, {
                                  ...prev[t.id],
                                  status: e.target.value,
                                }),
                              }))
                            }
                          >
                            <option value="pending">Pending</option>
                            <option value="done">Done</option>
                            <option value="overdue">Overdue</option>
                          </select>
                        )}
                      </span>
                      <span className="task-cell" data-label="Due">
                        {t.due_date || "-"}
                      </span>
                      <span className="task-cell task-actions" data-label="Action">
                        {isTaskLockedForField(t) ? (
                          <span className="green-task-locked-pill">
                            <span aria-hidden="true">✓</span> {isTaskSubmitted(t) ? "Submitted" : "Approved"}
                          </span>
                        ) : (
                          <>
                            <button
                              className="green-row-btn"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTaskId((prev) => (prev === t.id ? null : t.id));
                              }}
                            >
                              {editingTaskId === t.id ? "Close" : "Edit"}
                            </button>
                            <button
                              className="green-row-btn"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void submitTaskForReview(t.id);
                              }}
                              disabled={isTaskSubmitted(t)}
                            >
                              {isTaskSubmitted(t) ? "Awaiting Review" : "Submit"}
                            </button>
                            {Number.isFinite(t.lng) && Number.isFinite(t.lat) && (
                              <button
                                className="green-row-btn"
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFocusPoint([{ lng: Number(t.lng), lat: Number(t.lat) }]);
                                  openDirections(Number(t.lng), Number(t.lat));
                                }}
                              >
                                Directions
                              </button>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="tree-row">
                      <span className="task-cell" data-label="Verification">
                        Review: {t.review_state || "none"} | Evidence: {hasTaskEvidence(t, taskEdits[t.id]) ? "complete" : "missing"} | GPS:{" "}
                        {hasTaskGpsCapture(t, taskEdits[t.id]) ? "captured" : "missing"}
                      </span>
                    </div>
                    {isTaskRejected(t) && t.review_notes && (
                      <div className="tree-row">
                        <span className="task-cell green-task-review-note" data-label="Supervisor note">
                          Supervisor note: {t.review_notes}
                        </span>
                      </div>
                    )}

                    {editingTaskId === t.id && !isTaskLockedForField(t) && (
                      <div className="tree-row task-edit-inline-row">
                        <div className="task-edit-inline-card">
                          <div className="tree-form-row full">
                            <label>Notes</label>
                            <textarea
                              value={taskEdits[t.id]?.notes || ""}
                              onChange={(e) =>
                                setTaskEdits((prev) => ({
                                  ...prev,
                                  [t.id]: buildTaskEdit(t, {
                                    ...prev[t.id],
                                    notes: e.target.value,
                                  }),
                                }))
                              }
                            />
                          </div>
                          <div className="tree-form-row full">
                            <label>Photo Proof</label>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => onTaskPhotoPicked(t.id, e.target.files?.[0] || null)}
                            />
                          </div>
                          <div className="tree-form-row full">
                            <label>Tree Condition</label>
                            <select
                              value={
                                taskEdits[t.id]?.tree_status ||
                                normalizeTreeStatus(t.reported_tree_status || t.tree_status || "healthy")
                              }
                              onChange={(e) =>
                                setTaskEdits((prev) => ({
                                  ...prev,
                                  [t.id]: buildTaskEdit(t, {
                                    ...prev[t.id],
                                    tree_status: e.target.value,
                                  }),
                                }))
                              }
                            >
                              {INSPECTION_STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="tree-form-row full">
                            <label>Maintenance GPS</label>
                            <div className="green-task-gps-actions">
                              <button
                                className="green-btn-outline"
                                type="button"
                                onClick={() => captureTaskGps(t.id)}
                                disabled={taskGpsLoadingId === t.id}
                              >
                                {taskGpsLoadingId === t.id ? "Locating..." : "Use Current GPS"}
                              </button>
                              {hasActivityGps && (
                                <button
                                  className="green-row-btn"
                                  type="button"
                                  onClick={() => {
                                    setFocusPoint([{ lng: Number(activityLng), lat: Number(activityLat) }]);
                                    openDirections(Number(activityLng), Number(activityLat));
                                  }}
                                >
                                  Open GPS Point
                                </button>
                              )}
                            </div>
                            <p className="green-task-gps-meta">
                              {hasActivityGps
                                ? `Captured at ${Number(activityLat).toFixed(6)}, ${Number(activityLng).toFixed(6)}${
                                    activityRecordedAt ? ` on ${formatDateTimeLabel(activityRecordedAt)}` : ""
                                  }`
                                : "No maintenance GPS captured yet."}
                            </p>
                          </div>
                          <div className="task-edit-inline-actions">
                            <button className="green-btn-primary" type="button" onClick={() => saveTaskUpdate(t.id)}>
                              Save Task Update
                            </button>
                            <button
                              className="green-btn-outline"
                              type="button"
                              onClick={() => setEditingTaskId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )})}
              </div>
            )}
          </section>
        )}

        {activeProject && activeSection === "map" && (
          <section className="green-detail-card" id="green-section-map">
            <div className="green-detail-header">
              <h3>Map & Add Trees</h3>
              <span className="green-map-hint">Tap a task to zoom to its tree</span>
            </div>
            <div className="green-map-planting-summary">
              <span className="green-task-status-badge is-review">Submitted: {plantingReviewCounts.submitted}</span>
              <span className="green-task-status-badge is-done">Approved: {plantingReviewCounts.approved}</span>
              <span className={`green-task-status-badge ${pendingPlanting > 0 ? "is-submitted" : "is-done"}`}>
                Remaining: {pendingPlanting}
              </span>
            </div>
            {!activeUser && <p className="green-empty">Select a staff member or custodian to view only their trees.</p>}
            <div className="green-map-mode-toggle">
              <button
                type="button"
                className={`green-map-mode-btn ${!mapDrawMode ? "active" : ""}`}
                onClick={() => setMapDrawMode(false)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l2-2m0 0l7-7 7 7M5 9v10a2 2 0 002 2h10a2 2 0 002-2V9" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                Navigate
              </button>
              <button
                type="button"
                className={`green-map-mode-btn ${mapDrawMode ? "active" : ""}`}
                onClick={() => setMapDrawMode(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m-10-10h4m12 0h4" /></svg>
                Add Tree
              </button>
            </div>
            <div className="green-map-layout">
              <div className="green-map-canvas">
                {assignedPlantingAreas.length > 0 && (
                  <div className="green-map-area-banner">
                    <strong>Assigned planting area enabled</strong>
                    <span>
                      {assignedPlantingAreas.length} plot{assignedPlantingAreas.length === 1 ? "" : "s"} visible on map for this user.
                    </span>
                  </div>
                )}
                <TreeMap
                  trees={treePoints}
                  draftPoint={newTree.lng && newTree.lat ? { lng: newTree.lng, lat: newTree.lat } : null}
                  onDraftMove={(lng, lat) => setNewTree((prev) => ({ ...prev, lng, lat }))}
                  onAddTree={(lng, lat) => setNewTree((prev) => ({ ...prev, lng, lat }))}
                  drawActive={mapDrawMode}
                  onSelectTree={(id) => loadTreeDetails(id)}
                  onTreeInspect={(detail) => setInspectedTree(detail)}
                  onViewChange={(view) => setMapView(view)}
                  fitBounds={mapFitPoints}
                  assignmentAreas={assignedPlantingAreas}
                />
              </div>
            </div>

            <div className="tree-form">
              <div className="tree-form-row">
                <label>GPS</label>
                <button className="green-btn-outline" type="button" onClick={useGps} disabled={gpsLoading}>
                  {gpsLoading ? "Locating..." : "Use GPS Location"}
                </button>
              </div>
              <div className="tree-form-row">
                <label>Lng</label>
                <input value={newTree.lng || ""} readOnly />
              </div>
              <div className="tree-form-row">
                <label>Lat</label>
                <input value={newTree.lat || ""} readOnly />
              </div>
              <div className="tree-form-row">
                <label>Species</label>
                <input value={newTree.species} onChange={(e) => setNewTree({ ...newTree, species: e.target.value })} />
              </div>
              <div className="tree-form-row">
                <label>Tree Entry Type</label>
                <select
                  value={newTree.tree_origin}
                  onChange={(e) => {
                    const nextOrigin = e.target.value === "existing_inventory" ? "existing_inventory" : "new_planting";
                    setNewTree((prev) => ({
                      ...prev,
                      tree_origin: nextOrigin,
                      status: nextOrigin === "existing_inventory" ? "healthy" : "alive",
                      attribution_scope: nextOrigin === "existing_inventory" ? "monitor_only" : "full",
                      count_in_planting_kpis: nextOrigin === "existing_inventory" ? false : true,
                      count_in_carbon_scope: true,
                    }));
                  }}
                >
                  <option value="new_planting">New Planting</option>
                  <option value="existing_inventory">Existing Tree</option>
                </select>
              </div>
              <div className="tree-form-row">
                <label>{newTree.tree_origin === "existing_inventory" ? "Reference Date" : "Planting Date"}</label>
                <input
                  type="date"
                  value={newTree.planting_date}
                  onChange={(e) => setNewTree({ ...newTree, planting_date: e.target.value })}
                />
              </div>
              <div className="tree-form-row">
                <label>Tree Height (m)</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  step="0.01"
                  placeholder="Optional"
                  value={newTree.tree_height_m}
                  onChange={(e) => setNewTree({ ...newTree, tree_height_m: e.target.value })}
                />
              </div>
              <div className="tree-form-row">
                <label>Status</label>
                <select value={newTree.status} onChange={(e) => setNewTree({ ...newTree, status: e.target.value })}>
                  {newTree.tree_origin === "existing_inventory" ? (
                    <>
                      <option value="healthy">Healthy</option>
                      <option value="alive">Alive</option>
                      <option value="needs_attention">Needs attention</option>
                      <option value="damaged">Damaged</option>
                      <option value="removed">Removed</option>
                      <option value="need_watering">Need watering</option>
                      <option value="need_protection">Need protection</option>
                    </>
                  ) : (
                    <>
                      <option value="alive">Alive</option>
                      <option value="pending_planting">Pending planting</option>
                    </>
                  )}
                </select>
              </div>
              {newTree.tree_origin === "existing_inventory" && (
                <div className="tree-form-row">
                  <label>Custodian</label>
                  <select
                    value={newTree.custodian_id}
                    onChange={(e) => setNewTree({ ...newTree, custodian_id: e.target.value })}
                  >
                    <option value="">No custodian</option>
                    {projectCustodians.map((custodian) => (
                      <option key={custodian.id} value={String(custodian.id)}>
                        {custodian.name} ({custodian.custodian_type})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="tree-form-row">
                <label>Added by</label>
                <select value={activeUser} onChange={(e) => setActiveUser(e.target.value)}>
                  <option value="">Select staff or custodian</option>
                  {activeActorOptions.map((option) => (
                    <option key={`map-${option.actorType}-${option.id}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {newTree.tree_origin === "existing_inventory" && (
                <>
                  <div className="tree-form-row">
                    <label>Attribution Scope</label>
                    <select
                      value={newTree.attribution_scope}
                      onChange={(e) =>
                        setNewTree({
                          ...newTree,
                          attribution_scope: e.target.value === "full" ? "full" : "monitor_only",
                        })
                      }
                    >
                      <option value="monitor_only">Monitor only</option>
                      <option value="full">Full attribution</option>
                    </select>
                  </div>
                  <div className="tree-form-row tree-form-checkbox">
                    <label>
                      <input
                        type="checkbox"
                        checked={newTree.count_in_planting_kpis}
                        onChange={(e) =>
                          setNewTree({
                            ...newTree,
                            count_in_planting_kpis: e.target.checked,
                          })
                        }
                      />
                      <span>Count in planting KPIs</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={newTree.count_in_carbon_scope}
                        onChange={(e) =>
                          setNewTree({
                            ...newTree,
                            count_in_carbon_scope: e.target.checked,
                          })
                        }
                      />
                      <span>Count in carbon scope</span>
                    </label>
                  </div>
                </>
              )}
              <div className="tree-form-row full">
                <label>Notes</label>
                <textarea value={newTree.notes} onChange={(e) => setNewTree({ ...newTree, notes: e.target.value })} />
              </div>
              <div className="tree-form-row full">
                <label>Tree Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => onPhotoPicked(e.target.files?.[0] || null)}
                />
                <small className="tree-photo-hint">Snapped photo uploads automatically when you tap Add Tree.</small>
                {photoPreview && <img className="tree-photo-preview" src={photoPreview} alt="Tree preview" />}
              </div>
              <button className="green-btn-primary" type="button" onClick={addTree} disabled={addingTree}>
                {addingTree ? "Saving..." : newTree.tree_origin === "existing_inventory" ? "Save Existing Tree" : "Add Tree"}
              </button>
            </div>
          </section>
        )}

        {activeSection === "profile" && (
          <section className="green-detail-card" id="green-section-profile">
            <h3>User Details</h3>
            {!activeUserDetail ? (
              <p className="green-empty">Select a staff member or custodian from setup to view profile details.</p>
            ) : (
              <>
                <div className="green-profile-grid">
                  <div>
                    <span>Name</span>
                    <strong>{activeUserDetail.full_name}</strong>
                  </div>
                  <div>
                    <span>Position</span>
                    <strong>{activeUserDetail.role.replaceAll("_", " ")}</strong>
                  </div>
                  <div>
                    <span>User ID</span>
                    <strong>#{activeUserDetail.id}</strong>
                  </div>
                  <div>
                    <span>Active Project</span>
                    <strong>{activeProject?.name || "Not selected"}</strong>
                  </div>
                </div>

                <div className="green-user-summary">
                  <div>
                    <span>My Trees</span>
                    <strong>{myTreeSummary.total}</strong>
                  </div>
                  <div>
                    <span>Healthy</span>
                    <strong>{myTreeSummary.healthy}</strong>
                  </div>
                  <div>
                    <span>Dead</span>
                    <strong>{myTreeSummary.dead}</strong>
                  </div>
                  <div>
                    <span>Needs Attention</span>
                    <strong>{myTreeSummary.needs}</strong>
                  </div>
                  <div>
                    <span>Pending Tasks</span>
                    <strong>{myTaskCounts.pending}</strong>
                  </div>
                  <div>
                    <span>Done Tasks</span>
                    <strong>{myTaskCounts.done}</strong>
                  </div>
                  <div>
                    <span>Submitted</span>
                    <strong>{myTaskCounts.submitted}</strong>
                  </div>
                  <div>
                    <span>Task Total</span>
                    <strong>{myTaskCounts.total}</strong>
                  </div>
                  <div>
                    <span>Pending Planting</span>
                    <strong>{pendingPlanting}</strong>
                  </div>
                </div>
                <div className="green-profile-export">
                  <h4>My Report Export</h4>
                  <p>Export PDF includes only this selected user&apos;s work in the selected project.</p>
                  <label className="green-profile-export-toggle">
                    <input
                      type="checkbox"
                      checked={includePhotosInReport}
                      onChange={(e) => setIncludePhotosInReport(e.target.checked)}
                    />
                    <span>Include tree photos in appendix (6 per page)</span>
                  </label>
                  <button
                    className="green-btn-primary"
                    type="button"
                    onClick={exportPdf}
                    disabled={!activeProject || !activeUser || syncInProgress}
                  >
                    Export My Work (PDF)
                  </button>
                  {!activeProject && <small>Select a project to enable export.</small>}
                  {activeProject && !isOnline && <small>Offline now. Reconnect to generate the PDF report.</small>}
                  {activeProject && activeUser && isOnline && (
                    <small>
                      Filter: {activeUser} ({activeProject.name})
                    </small>
                  )}
                  {includePhotosInReport && <small>Photo pages are appended after analytics and record pages.</small>}
                </div>
              </>
            )}
          </section>
        )}

        {activeProject && activeSection === "records" && (
          <section className="green-detail-card" id="green-section-records">
            <h3>Tree Records</h3>
            {activeUser && (
              <div className="green-user-summary">
                <div>
                  <span>My Trees</span>
                  <strong>{myTreeSummary.total}</strong>
                </div>
                <div>
                  <span>Healthy</span>
                  <strong>{myTreeSummary.healthy}</strong>
                </div>
                <div>
                  <span>Dead</span>
                  <strong>{myTreeSummary.dead}</strong>
                </div>
                <div>
                  <span>Needs Attention</span>
                  <strong>{myTreeSummary.needs}</strong>
                </div>
                <div>
                  <span>Tasks Done</span>
                  <strong>{myTaskCounts.done}</strong>
                </div>
              </div>
            )}

            {!activeUser ? (
              <p className="green-empty">Select a staff member or custodian to view their tree records.</p>
            ) : loadingTrees ? (
              <p className="green-empty">Loading trees...</p>
            ) : (
              <div className="tree-table">
                <div className="tree-row tree-header">
                  <span>ID</span>
                  <span>Species</span>
                  <span>Height</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {userTrees.map((t) => (
                  <div key={t.id} className="tree-row record-row">
                    <span>#{t.id}</span>
                    <span>{t.species || "-"}</span>
                    <span>
                      <div className="green-tree-height-edit">
                        <input
                          type="number"
                          min={0}
                          max={120}
                          step="0.01"
                          value={
                            treeHeightDraftById[t.id] !== undefined
                              ? treeHeightDraftById[t.id]
                              : t.tree_height_m === null || t.tree_height_m === undefined
                              ? ""
                              : String(t.tree_height_m)
                          }
                          onChange={(e) =>
                            setTreeHeightDraftById((prev) => ({
                              ...prev,
                              [t.id]: e.target.value,
                            }))
                          }
                          placeholder="m"
                        />
                        <button
                          className="green-row-btn"
                          type="button"
                          disabled={savingTreeHeightId === t.id}
                          onClick={() => {
                            const value =
                              treeHeightDraftById[t.id] !== undefined
                                ? treeHeightDraftById[t.id]
                                : t.tree_height_m === null || t.tree_height_m === undefined
                                ? ""
                                : String(t.tree_height_m);
                            void updateTreeHeight(t.id, value);
                          }}
                        >
                          {savingTreeHeightId === t.id ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </span>
                    <span>{t.status}</span>
                    <div className="tree-actions">
                      <button className="green-row-btn" type="button" onClick={() => updateTreeStatus(t.id, "healthy")}>
                        Healthy
                      </button>
                      <button
                        className="green-row-btn"
                        type="button"
                        onClick={() => updateTreeStatus(t.id, "pest")}
                      >
                        Pest
                      </button>
                      <button className="green-row-btn" type="button" onClick={() => updateTreeStatus(t.id, "disease")}>
                        Disease
                      </button>
                      <button className="green-row-btn" type="button" onClick={() => updateTreeStatus(t.id, "need_replacement")}>
                        Need replacement
                      </button>
                      <button className="green-row-btn" type="button" onClick={() => updateTreeStatus(t.id, "damaged")}>
                        Damaged
                      </button>
                      <button className="green-row-btn" type="button" onClick={() => updateTreeStatus(t.id, "removed")}>
                        Removed
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeProject && activeUser && activeSection === "records" && selectedTreeId && (
          <section className="green-detail-card" id="green-section-timeline">
            <h3>Tree Tasks & Timeline</h3>
            <div className="tree-table">
              <div className="tree-row tree-header">
                <span>Task</span>
                <span>Assignee</span>
                <span>Priority</span>
                <span>Status</span>
                <span>Due</span>
              </div>
              {treeTasks.map((t) => (
                <div key={t.id} className="tree-row timeline-row">
                  <span>{t.task_type}</span>
                  <span>{t.assignee_name}</span>
                  <span>{t.priority || "-"}</span>
                  <span>{t.status}</span>
                  <span>{t.due_date || "-"}</span>
                </div>
              ))}
            </div>

            {treeTimeline && (
              <div className="timeline">
                <h4>Timeline</h4>
                <p>Planted: {treeTimeline.tree?.planting_date || "-"}</p>
                <p>Status: {treeTimeline.tree?.status || "-"}</p>
                <p>Height: {formatTreeHeight(treeTimeline.tree?.tree_height_m)}</p>
                {treeTimeline.visits?.map((v: any, i: number) => (
                  <p key={i}>
                    Visit {v.visit_date}: {v.status}
                  </p>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {inspectedTree && (
        <>
          <button
            type="button"
            className="green-tree-drawer-overlay"
            onClick={() => setInspectedTree(null)}
            aria-label="Close tree details"
          />
          <aside className="green-tree-drawer green-tree-inspector">
            <div className="green-tree-drawer-head">
              <strong>Tree Details</strong>
              <button className="green-tree-drawer-close" type="button" onClick={() => setInspectedTree(null)} aria-label="Close tree details">
                X
              </button>
            </div>
            <div className="green-tree-inspector-body">
              <div className="green-tree-inspector-photo-wrap">
                {inspectedTree.photo_url ? (
                  <img
                    className="green-tree-inspector-photo"
                    src={toDisplayPhotoUrl(inspectedTree.photo_url)}
                    alt={`Tree ${inspectedTree.id}`}
                  />
                ) : (
                  <div className="green-tree-inspector-photo empty">No tree photo</div>
                )}
              </div>
              <div className="green-tree-photo-upload-row">
                <label className={`green-tree-photo-upload-btn ${treePhotoUploading ? "is-loading" : ""}`}>
                  {treePhotoUploading ? "Uploading..." : "Upload Tree Photo"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={treePhotoUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      void onInspectedTreePhotoPicked(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <p className="green-tree-maintenance-count">Maintenance Records: {inspectedTree.maintenance.total}</p>
              <h4>Tree #{inspectedTree.id}</h4>
              {inspectedTree.loading && <p className="green-tree-inspector-loading">Loading latest records...</p>}
              <div className="green-tree-inspector-grid">
                <div>
                  <span>Status</span>
                  <strong>{inspectedTree.status_label}</strong>
                </div>
                <div>
                  <span>Species</span>
                  <strong>{inspectedTree.species}</strong>
                </div>
                <div>
                  <span>Planted By</span>
                  <strong>{inspectedTree.created_by}</strong>
                </div>
                <div>
                  <span>Planting Date</span>
                  <strong>{formatDateLabel(inspectedTree.planting_date)}</strong>
                </div>
                <div>
                  <span>Tree Height</span>
                  <strong>{formatTreeHeight(inspectedTree.tree_height_m)}</strong>
                </div>
                <div>
                  <span>Origin</span>
                  <strong>{formatTreeConditionLabel(inspectedTree.tree_origin || "new_planting")}</strong>
                </div>
              </div>
              <div className="green-tree-height-inline">
                <label>Update Height (m)</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  step="0.01"
                  value={
                    treeHeightDraftById[inspectedTree.id] !== undefined
                      ? treeHeightDraftById[inspectedTree.id]
                      : inspectedTree.tree_height_m === null || inspectedTree.tree_height_m === undefined
                      ? ""
                      : String(inspectedTree.tree_height_m)
                  }
                  onChange={(e) =>
                    setTreeHeightDraftById((prev) => ({
                      ...prev,
                      [inspectedTree.id]: e.target.value,
                    }))
                  }
                  placeholder="Tree height in meters"
                />
                <button
                  className="green-btn-outline"
                  type="button"
                  disabled={savingTreeHeightId === inspectedTree.id}
                  onClick={() => {
                    const value =
                      treeHeightDraftById[inspectedTree.id] !== undefined
                        ? treeHeightDraftById[inspectedTree.id]
                        : inspectedTree.tree_height_m === null || inspectedTree.tree_height_m === undefined
                        ? ""
                        : String(inspectedTree.tree_height_m);
                    void updateTreeHeight(inspectedTree.id, value);
                  }}
                >
                  {savingTreeHeightId === inspectedTree.id ? "Saving..." : "Save Height"}
                </button>
              </div>
              <p className="green-tree-inspector-notes">{inspectedTree.notes || "No notes."}</p>
              <div className="green-tree-maintenance-row">
                <span>Total: {inspectedTree.maintenance.total}</span>
                <span>Done: {inspectedTree.maintenance.done}</span>
                <span>Pending: {inspectedTree.maintenance.pending}</span>
                <span>Overdue: {inspectedTree.maintenance.overdue}</span>
              </div>
              <div className="green-tree-inspector-tasks">
                <h5>Recent Maintenance</h5>
                {inspectedTree.tasks.length === 0 ? (
                  <p>No maintenance records yet.</p>
                ) : (
                  inspectedTree.tasks.slice(0, 4).map((task: any) => (
                    <div key={task.id} className="green-tree-inspector-task">
                      <strong>{task.task_type || "Task"}</strong>
                      <span>{task.assignee_name || "-"}</span>
                      <span>{task.status || "-"}</span>
                      <span>{formatDateLabel(task.due_date)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </>
      )}

      <nav className="green-bottom-nav">
        <button
          className={`green-nav-item ${activeSection === null ? "active" : ""}`}
          type="button"
          onClick={goHome}
          aria-label="Home"
        >
          <HomeIcon />
        </button>

        <button className="green-nav-add" type="button" onClick={() => openSection("map")} aria-label="Add Tree">
          <PlusIcon />
        </button>

        <button
          className={`green-nav-item ${activeSection === "profile" ? "active" : ""}`}
          type="button"
          onClick={() => openSection("profile")}
          aria-label="Profile"
        >
          <UserIcon />
        </button>
      </nav>

      {plantingFlowState !== "idle" && (
        <div className="green-planting-overlay" role="dialog" aria-modal="true">
          <div className="green-planting-modal">
            {plantingFlowState === "loading" ? (
              <>
                <div className="green-planting-spinner" aria-hidden="true" />
                <p>Planting tree...</p>
              </>
            ) : (
              <>
                <p>{plantingFlowMessage}</p>
                <button className="green-btn-primary" type="button" onClick={onPlantingFlowOk}>
                  OK
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
