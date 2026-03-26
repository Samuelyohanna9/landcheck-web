import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { api, BACKEND_URL } from "../api/client";
import { clearGreenAuthed, getGreenAuthSession } from "../auth/greenAuth";
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
  cacheProjectCustodiansOffline,
  cacheProjectAllocationsOffline,
  getCachedProjectDetailOffline,
  getCachedProjectTreesOffline,
  getCachedProjectsOffline,
  getCachedTasksOffline,
  getCachedTreeTasksOffline,
  getCachedTreeTimelineOffline,
  getCachedUsersOffline,
  getCachedWorkOrdersOffline,
  getCachedProjectCustodiansOffline,
  getCachedProjectAllocationsOffline,
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
  precacheMapTilesForArea,
} from "../offline/greenOffline";
import { usePrivacyConsentGate } from "../privacy/usePrivacyConsentGate";
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
  organization_id?: number | null;
  organization_name?: string | null;
  organization_slug?: string | null;
  organization_status?: string | null;
  organization_logo_url?: string | null;
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
  project_tree_no?: number | null;
  lng: number;
  lat: number;
  species: string | null;
  planting_date: string | null;
  status: string;
  notes: string | null;
  photo_url: string | null;
  photo_urls?: string[] | null;
  created_by?: string | null;
  tree_height_m?: number | null;
  tree_age_months?: number | null;
  inventory_tree_count?: number | null;
  existing_area_geojson?: any;
  existing_area_sqm?: number | null;
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
  user_uid?: string | null;
  full_name: string;
  role: string;
  allow_green?: boolean;
  allow_work?: boolean;
  organization_id?: number | null;
  organization_name?: string | null;
  organization_logo_url?: string | null;
};

type WorkOrder = {
  id: number;
  project_id: number;
  assignee_name: string;
  work_type: string;
  target_trees: number;
  species_allocations?: Array<{ species: string; count: number }>;
  auto_assign_first_cycle_maintenance?: boolean;
  allow_existing_tree_area_reuse?: boolean;
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

type DistributionAllocation = {
  id: number;
  event_id: number;
  project_id: number;
  custodian_id: number;
  custodian_name?: string | null;
  quantity_allocated: number;
  supervision_target?: number;
  supervision_assigned?: number;
  supervision_done?: number;
  supervision_live?: number;
  supervision_remaining?: number;
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
  photo_urls: string[];
  tree_status: string;
  activity_lng: number | null;
  activity_lat: number | null;
  activity_recorded_at: string;
};
type TaskTreeMetaEdit = {
  species: string;
  planting_date: string;
  tree_height_m: string;
  tree_age_months: string;
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
const parseTreeAgeMonthsInput = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 2400) return null;
  return Number(parsed.toFixed(1));
};
const parseInventoryTreeCountInput = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 1 || rounded > 1000000) return null;
  return rounded;
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
const normalizeName = (value: string | null | undefined) => String(value || "").trim().toLowerCase();
const normalizeTaskState = (value: string | null | undefined) => (value || "").trim().toLowerCase();
const normalizeTreeStatus = (value: string | null | undefined) => {
  const raw = (value || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (raw === "deseas" || raw === "diseased") return "disease";
  if (raw === "needreplacement" || raw === "needsreplacement") return "need_replacement";
  if (raw === "needs_replacement") return "need_replacement";
  return raw || "healthy";
};
const normalizeSpeciesKey = (value: string | null | undefined) => String(value || "").trim().toLowerCase();
const canUseBrowserNotifications = () =>
  typeof window !== "undefined" && "Notification" in window && typeof Notification !== "undefined";
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
const isTaskMetadataEditRequested = (task: any) => normalizeTaskState(task?.review_state) === "metadata_edit";
const isTaskRejected = (task: any) => normalizeTaskState(task?.review_state) === "rejected";
const isTaskLockedForField = (task: any) => isTaskApproved(task) || isTaskSubmitted(task);
const isTaskDoneForSummary = (task: any) => {
  return isTaskApproved(task);
};
const normalizePhotoList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const rows: string[] = [];
  value.forEach((item) => {
    const raw = String(item || "").trim();
    if (!raw || seen.has(raw)) return;
    seen.add(raw);
    rows.push(raw);
  });
  return rows;
};
const getTaskPhotoUrls = (task: any, edit?: { photo_url?: string; photo_urls?: string[] }) => {
  const merged = normalizePhotoList(edit?.photo_urls ?? task?.photo_urls);
  const fallback = String(edit?.photo_url ?? task?.photo_url ?? "").trim();
  if (fallback && !merged.includes(fallback)) merged.push(fallback);
  return merged;
};
const hasTaskEvidence = (task: any, edit?: { notes?: string; photo_url?: string; photo_urls?: string[] }) => {
  const notes = (edit?.notes ?? task?.notes ?? "").trim();
  const photos = getTaskPhotoUrls(task, edit);
  return Boolean(notes && photos.length > 0);
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
  const normalizedPhotoUrls = normalizePhotoList(edit.photo_urls).filter((url) => !isLocalBlobUrl(url));
  if (normalizedPhotoUrls.length) {
    payload.photo_urls = normalizedPhotoUrls;
    payload.photo_url = normalizedPhotoUrls[normalizedPhotoUrls.length - 1];
  }
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
  const mergedPhotoUrls = getTaskPhotoUrls(task, {
    photo_url: overrides?.photo_url,
    photo_urls: hasOwn(overrides, "photo_urls") ? overrides?.photo_urls : undefined,
  });
  return {
    status: overrides?.status ?? task?.status ?? "pending",
    notes: overrides?.notes ?? task?.notes ?? "",
    photo_url: mergedPhotoUrls[mergedPhotoUrls.length - 1] || "",
    photo_urls: mergedPhotoUrls,
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
const normalizeSpeciesAllocations = (
  value: unknown,
): Array<{ species: string; count: number }> => {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, { species: string; count: number }>();
  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const row = entry as Record<string, any>;
    const species = String(row.species || "").trim();
    const count = Number(row.count || 0);
    if (!species || !Number.isFinite(count) || count <= 0) return;
    const key = species.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.count += Math.round(count);
      return;
    }
    merged.set(key, {
      species,
      count: Math.round(count),
    });
  });
  return Array.from(merged.values());
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
const computeAreaCentroid = (geometry: { type: "Polygon" | "MultiPolygon"; coordinates: any } | null) => {
  const points = extractAreaPoints(geometry);
  if (!points.length) return null;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  points.forEach((point) => {
    if (point.lng < minLng) minLng = point.lng;
    if (point.lng > maxLng) maxLng = point.lng;
    if (point.lat < minLat) minLat = point.lat;
    if (point.lat > maxLat) maxLat = point.lat;
  });
  return {
    lng: Number(((minLng + maxLng) / 2).toFixed(6)),
    lat: Number(((minLat + maxLat) / 2).toFixed(6)),
  };
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

const readGreenIntroSeen = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem("landcheck_green_intro_seen") === "1";
  } catch {
    return false;
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
  const navigate = useNavigate();
  const greenAuthSession = useMemo(() => getGreenAuthSession(), []);
  const greenAuthUser = greenAuthSession?.user || null;
  const normalizeOrgLifecycleStatus = (value: unknown) => String(value || "").trim().toLowerCase();
  const greenScopedOrganizationId =
    greenAuthSession?.auth_mode === "partner_user" && Number.isFinite(Number(greenAuthUser?.organization_id))
      ? Number(greenAuthUser?.organization_id)
      : null;
  const lockedGreenActorName =
    greenAuthSession?.auth_mode === "partner_user" ? String(greenAuthUser?.full_name || "").trim() : "";
  const storedActiveUserRaw = typeof window !== "undefined" ? localStorage.getItem("landcheck_green_active_user") || "" : "";
  const storedActiveUser = lockedGreenActorName || storedActiveUserRaw;
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
  const [taskTreeMetaEdits, setTaskTreeMetaEdits] = useState<Record<number, TaskTreeMetaEdit>>({});
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [taskGpsLoadingId, setTaskGpsLoadingId] = useState<number | null>(null);
  const [loadingTrees, setLoadingTrees] = useState(false);
  const [newTree, setNewTree] = useState({
    lng: 0,
    lat: 0,
    species: "",
    planting_date: "",
    tree_height_m: "",
    tree_age_months: "",
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
  const [projectAllocations, setProjectAllocations] = useState<DistributionAllocation[]>([]);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [pendingTreePhoto, setPendingTreePhoto] = useState<File | null>(null);
  const [pendingTreePhotos, setPendingTreePhotos] = useState<File[]>([]);
  const [treePhotoPreviews, setTreePhotoPreviews] = useState<string[]>([]);
  const [existingTreeBatchMode, setExistingTreeBatchMode] = useState(false);
  const [existingTreeBatchAreaGeojson, setExistingTreeBatchAreaGeojson] = useState<any | null>(null);
  const [existingTreeBatchCount, setExistingTreeBatchCount] = useState<string>("");
  const [useAssignedExistingTreeArea, setUseAssignedExistingTreeArea] = useState(false);
  const [selectedExistingTreeAreaOrderId, setSelectedExistingTreeAreaOrderId] = useState<string>("");
  const [addingTree, setAddingTree] = useState(false);
  const [mapDrawMode, setMapDrawMode] = useState(true);
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
  const [treeAgeMonthsDraftById, setTreeAgeMonthsDraftById] = useState<Record<number, string>>({});
  const [savingTreeAgeMonthsId, setSavingTreeAgeMonthsId] = useState<number | null>(null);
  const [includePhotosInReport, setIncludePhotosInReport] = useState(false);
  const [introGateOpen, setIntroGateOpen] = useState<boolean>(() => !readGreenIntroSeen());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (!canUseBrowserNotifications()) return "unsupported";
    try {
      return Notification.permission;
    } catch {
      return "default";
    }
  });
  const [greenPasswordModalOpen, setGreenPasswordModalOpen] = useState(false);
  const [greenPasswordModalSaving, setGreenPasswordModalSaving] = useState(false);
  const [greenPasswordModalShow, setGreenPasswordModalShow] = useState(false);
  const [greenPasswordForm, setGreenPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const isPartnerGreenSession = greenAuthSession?.auth_mode === "partner_user";
  const greenSessionPartnerOrgId =
    isPartnerGreenSession && Number.isFinite(Number(greenAuthUser?.organization_id))
      ? Number(greenAuthUser?.organization_id)
      : null;
  const greenSessionPartnerLogo = isPartnerGreenSession ? greenAuthUser?.organization_logo_url || null : null;
  const greenSessionPartnerName = isPartnerGreenSession ? greenAuthUser?.organization_name || null : null;
  const activeProjectOrgId =
    activeProject && Number.isFinite(Number(activeProject.organization_id)) ? Number(activeProject.organization_id) : null;
  const activeProjectMatchesGreenSessionOrg =
    Boolean(isPartnerGreenSession && greenSessionPartnerOrgId && activeProjectOrgId === greenSessionPartnerOrgId);
  const { ensureConsent: ensureGreenPrivacyConsent, privacyConsentModal } = usePrivacyConsentGate("green");
  const ensureGreenFieldPrivacyConsent = useCallback(
    async (action: string, metadata: Record<string, unknown> = {}) => {
      const accepted = await ensureGreenPrivacyConsent("green_field_data_capture", {
        title: "Consent required before field capture",
        detail:
          "LandCheck Green records GPS location, photos, notes, tree metadata, task evidence, and review history for project monitoring and reporting. Continue only if you are authorized to capture and submit this field data.",
        actionLabel: "I Consent and Continue",
        metadata: {
          action,
          project_id: activeProject?.id ?? null,
          actor_name: activeUser || greenAuthUser?.full_name || "",
          ...metadata,
        },
      });
      if (!accepted) {
        toast.error("Consent is required before capturing or submitting field data.");
        return false;
      }
      return true;
    },
    [activeProject?.id, activeUser, ensureGreenPrivacyConsent, greenAuthUser?.full_name],
  );
  const greenHeaderPartnerLogo =
    isPartnerGreenSession
      ? ((activeProjectMatchesGreenSessionOrg ? activeProject?.organization_logo_url || null : null) || greenSessionPartnerLogo)
      : null;
  const greenHeaderPartnerName =
    isPartnerGreenSession
      ? ((activeProjectMatchesGreenSessionOrg ? activeProject?.organization_name || null : null) || greenSessionPartnerName)
      : null;
  const greenSessionOrgStatus = normalizeOrgLifecycleStatus(greenAuthUser?.organization_status);
  const greenRuntimeOrgStatus = normalizeOrgLifecycleStatus(activeProject?.organization_status || projects[0]?.organization_status || "");
  const greenEffectiveOrgStatus = isPartnerGreenSession ? (greenRuntimeOrgStatus || greenSessionOrgStatus) : "";
  const greenPartnerOrgInactive = Boolean(isPartnerGreenSession && greenAuthUser?.organization_is_active === false);
  const greenPartnerOrgSuspended = Boolean(
    isPartnerGreenSession && (greenPartnerOrgInactive || greenEffectiveOrgStatus === "suspended")
  );
  const greenPartnerOrgPaused = Boolean(
    isPartnerGreenSession && !greenPartnerOrgSuspended && greenEffectiveOrgStatus === "paused"
  );
  const isLockedGreenUserSession = Boolean(lockedGreenActorName);
  const seenTaskIdsRef = useRef<Set<number>>(new Set());
  const seenOrderIdsRef = useRef<Set<number>>(new Set());
  const taskNotifyPrimedRef = useRef(false);
  const orderNotifyPrimedRef = useRef(false);
  const greenPauseNoticeShownRef = useRef(false);
  const greenSuspendNoticeShownRef = useRef(false);

  const logoutGreen = () => {
    clearGreenAuthed();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("landcheck_green_active_user");
      window.localStorage.removeItem("landcheck_green_active_section");
      window.localStorage.removeItem("landcheck_green_active_project_id");
    }
    navigate("/green/login", { replace: true });
  };

  const closeGreenPasswordModal = (force = false) => {
    if (greenPasswordModalSaving && !force) return;
    setGreenPasswordModalOpen(false);
    setGreenPasswordModalShow(false);
    setGreenPasswordForm({
      current_password: "",
      new_password: "",
      confirm_password: "",
    });
  };

  const openGreenPasswordModal = () => {
    if (!greenAuthUser?.id || greenAuthUser.id <= 0) {
      toast.error("Password change is not available for this account.");
      return;
    }
    setGreenPasswordModalOpen(true);
  };

  const ensureGreenWritesAllowed = () => {
    if (!greenPartnerOrgPaused) return true;
    toast.error("Organization is paused. Read-only mode is enabled (view and export only).");
    return false;
  };

  useEffect(() => {
    if (!greenPartnerOrgSuspended) return;
    if (greenSuspendNoticeShownRef.current) return;
    greenSuspendNoticeShownRef.current = true;
    toast.error("Your organization is suspended. Access is blocked.");
    clearGreenAuthed();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("landcheck_green_active_user");
      window.localStorage.removeItem("landcheck_green_active_section");
      window.localStorage.removeItem("landcheck_green_active_project_id");
    }
    navigate("/green/login", { replace: true });
  }, [greenPartnerOrgSuspended, navigate]);

  useEffect(() => {
    if (!greenPartnerOrgPaused) {
      greenPauseNoticeShownRef.current = false;
      return;
    }
    if (greenPauseNoticeShownRef.current) return;
    greenPauseNoticeShownRef.current = true;
    toast("Organization is paused. Read-only mode is enabled (view and export only).", { icon: "!" });
  }, [greenPartnerOrgPaused]);

  useEffect(() => {
    if (!greenPartnerOrgPaused) return;
    const interceptorId = api.interceptors.request.use((config) => {
      const method = String(config?.method || "get").trim().toLowerCase();
      const url = String(config?.url || "");
      const isReadMethod = method === "get" || method === "head" || method === "options";
      const isPasswordChange = method === "post" && url.includes("/green/auth/change-password");
      if (isReadMethod || isPasswordChange) {
        return config;
      }
      return Promise.reject({
        response: {
          data: {
            detail: "Organization is paused. Read-only mode is enabled. Viewing and exports only.",
          },
        },
      });
    });
    return () => {
      api.interceptors.request.eject(interceptorId);
    };
  }, [greenPartnerOrgPaused]);

  const submitGreenPasswordChange = async () => {
    if (!greenAuthUser?.id || greenAuthUser.id <= 0) {
      toast.error("Password change is not available for this account.");
      return;
    }
    const currentPassword = String(greenPasswordForm.current_password || "");
    const newPassword = String(greenPasswordForm.new_password || "");
    const confirmPassword = String(greenPasswordForm.confirm_password || "");
    if (!currentPassword) {
      toast.error("Current password is required.");
      return;
    }
    if (!newPassword) {
      toast.error("New password is required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password confirmation does not match.");
      return;
    }
    if (String(newPassword).length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    setGreenPasswordModalSaving(true);
    try {
      await api.post("/green/auth/change-password", {
        user_id: greenAuthUser.id,
        current_password: currentPassword,
        new_password: newPassword,
        app: "green",
      });
      toast.success("Password updated successfully.");
      closeGreenPasswordModal(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to change password");
    } finally {
      setGreenPasswordModalSaving(false);
    }
  };

  const requestGreenNotificationPermission = async () => {
    if (!canUseBrowserNotifications()) return;
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      if (result === "granted") {
        toast.success("Notifications enabled");
      }
    } catch {
      toast.error("Unable to enable notifications on this device/browser.");
    }
  };

  const pushFieldNotification = (title: string, body: string) => {
    toast.success(body);
    if (!canUseBrowserNotifications()) return;
    try {
      if (Notification.permission !== "granted") return;
      const note = new Notification(title, {
        body,
        icon: GREEN_LOGO_SRC,
        tag: `green-${title.toLowerCase().replace(/\s+/g, "-")}`,
      });
      setTimeout(() => note.close(), 6000);
    } catch {
      // Ignore browser notification failures; toast already shown.
    }
  };

  const treePoints = useMemo(() => {
    if (!activeUser) return [];
    return trees
      .filter((t: any) => (t as any).created_by === activeUser)
      .map((t) => ({
        id: t.id,
        project_tree_no:
          Number.isFinite(Number((t as any).project_tree_no)) && Number((t as any).project_tree_no) > 0
            ? Number((t as any).project_tree_no)
            : null,
        lng: Number(t.lng),
        lat: Number(t.lat),
        status: t.status,
        species: t.species,
        planting_date: t.planting_date,
        notes: t.notes,
        photo_url: t.photo_url,
        created_by: t.created_by || "",
        tree_height_m: t.tree_height_m ?? null,
        tree_age_months:
          Number.isFinite(Number((t as any).tree_age_months)) && Number((t as any).tree_age_months) >= 0
            ? Number((t as any).tree_age_months)
            : null,
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
  const activeUserIsCustodian = useMemo(
    () => Boolean(activeUserDetail && String(activeUserDetail.role || "").startsWith("custodian_")),
    [activeUserDetail],
  );

  const userTrees = useMemo(() => {
    if (!activeUser) return [];
    if (activeUserIsCustodian) {
      const custodianId = Number(activeUserDetail?.id || 0);
      return trees.filter((t: any) => {
        const byCustodian = custodianId > 0 && Number((t as any).custodian_id || 0) === custodianId;
        const byCreator = (t as any).created_by === activeUser;
        return byCustodian || byCreator;
      });
    }
    return trees.filter((t: any) => (t as any).created_by === activeUser);
  }, [activeUser, activeUserDetail, activeUserIsCustodian, trees]);
  const userTreeById = useMemo(() => {
    const map = new Map<number, Tree>();
    userTrees.forEach((tree) => {
      const id = Number(tree.id || 0);
      if (id > 0) map.set(id, tree);
    });
    return map;
  }, [userTrees]);
  const existingTreeAreaOverlaysForUser = useMemo(() => {
    return userTrees
      .map((tree: any) => {
        const geometry = normalizeOrderAreaGeometry((tree as any).existing_area_geojson);
        if (!geometry) return null;
        const count = Number((tree as any).inventory_tree_count || 1);
        const labelCount = Number.isFinite(count) && count > 1 ? Math.round(count) : 1;
        const localNo = Number((tree as any).project_tree_no || 0);
        const treeLabel = `Tree #${localNo > 0 ? localNo : Number(tree.id || 0)}`;
        return {
          id: `existing-area-${tree.id}`,
          label:
            labelCount > 1
              ? `${treeLabel} - ${labelCount} trees`
              : `${treeLabel} - Existing area`,
          geojson: geometry,
        };
      })
      .filter((item): item is { id: string; label: string; geojson: any } => Boolean(item));
  }, [userTrees]);
  const greenMapOverlayAreas = useMemo(
    () => [...assignedPlantingAreas, ...existingTreeAreaOverlaysForUser],
    [assignedPlantingAreas, existingTreeAreaOverlaysForUser],
  );
  const existingTreeBatchCaptureActive = newTree.tree_origin === "existing_inventory" && existingTreeBatchMode;
  const userPlantingTrees = useMemo(
    () => userTrees.filter((tree) => String(tree.tree_origin || "new_planting").toLowerCase() === "new_planting"),
    [userTrees],
  );
  const activePlantingOrders = useMemo(
    () =>
      plantingOrders
        .filter((order) => order.work_type === "planting")
        .filter((order) => !isClosedWorkOrder(order.status)),
    [plantingOrders],
  );
  const reusableExistingTreeAreaOrders = useMemo(
    () =>
      activePlantingOrders.filter(
        (order) => Boolean(order.area_enabled) && Boolean(order.area_geojson) && Boolean(order.allow_existing_tree_area_reuse),
      ),
    [activePlantingOrders],
  );
  const selectedExistingTreeAreaOrder = useMemo(() => {
    const selectedId = Number(selectedExistingTreeAreaOrderId || 0);
    if (selectedId > 0) {
      return reusableExistingTreeAreaOrders.find((order) => Number(order.id) === selectedId) || null;
    }
    return reusableExistingTreeAreaOrders[0] || null;
  }, [reusableExistingTreeAreaOrders, selectedExistingTreeAreaOrderId]);
  const activeOrderSpeciesAllocations = useMemo(() => {
    const merged = new Map<string, { species: string; count: number }>();
    activePlantingOrders.forEach((order) => {
      const rows = normalizeSpeciesAllocations(order.species_allocations);
      rows.forEach((row) => {
        const key = normalizeSpeciesKey(row.species);
        if (!key) return;
        const existing = merged.get(key);
        if (existing) {
          existing.count += Number(row.count || 0);
          return;
        }
        merged.set(key, {
          species: row.species,
          count: Number(row.count || 0),
        });
      });
    });
    return Array.from(merged.values()).sort((a, b) => a.species.localeCompare(b.species));
  }, [activePlantingOrders]);

  useEffect(() => {
    if (!existingTreeBatchCaptureActive || useAssignedExistingTreeArea) return;
    if (!mapDrawMode) {
      setMapDrawMode(true);
    }
  }, [existingTreeBatchCaptureActive, useAssignedExistingTreeArea, mapDrawMode]);
  useEffect(() => {
    if (!existingTreeBatchCaptureActive || !useAssignedExistingTreeArea) return;
    if (mapDrawMode) {
      setMapDrawMode(false);
    }
  }, [existingTreeBatchCaptureActive, useAssignedExistingTreeArea, mapDrawMode]);
  useEffect(() => {
    if (!existingTreeBatchCaptureActive) {
      setUseAssignedExistingTreeArea(false);
      setSelectedExistingTreeAreaOrderId("");
      return;
    }
    if (reusableExistingTreeAreaOrders.length === 0) {
      setUseAssignedExistingTreeArea(false);
      setSelectedExistingTreeAreaOrderId("");
      return;
    }
    if (!useAssignedExistingTreeArea) return;
    const selectedId = Number(selectedExistingTreeAreaOrderId || 0);
    if (!selectedId || !reusableExistingTreeAreaOrders.some((order) => Number(order.id) === selectedId)) {
      setSelectedExistingTreeAreaOrderId(String(reusableExistingTreeAreaOrders[0].id));
    }
  }, [
    existingTreeBatchCaptureActive,
    reusableExistingTreeAreaOrders,
    useAssignedExistingTreeArea,
    selectedExistingTreeAreaOrderId,
  ]);
  const hasSpeciesBasedPlantingAllocation = activeOrderSpeciesAllocations.length > 0;
  const plantedSpeciesCounts = useMemo(() => {
    const counts = new Map<string, number>();
    userPlantingTrees.forEach((tree) => {
      const key = normalizeSpeciesKey(tree.species);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [userPlantingTrees]);
  const speciesAllocationOptions = useMemo(
    () =>
      activeOrderSpeciesAllocations.map((allocation) => {
        const key = normalizeSpeciesKey(allocation.species);
        const planted = plantedSpeciesCounts.get(key) || 0;
        const remaining = Math.max(Number(allocation.count || 0) - planted, 0);
        return {
          species: allocation.species,
          total: Number(allocation.count || 0),
          planted,
          remaining,
        };
      }),
    [activeOrderSpeciesAllocations, plantedSpeciesCounts],
  );
  const plantedBySpeciesSummary = useMemo(() => {
    const map = new Map<string, { species: string; count: number }>();
    userPlantingTrees.forEach((tree) => {
      const label = String(tree.species || "").trim() || "Unspecified";
      const key = normalizeSpeciesKey(label);
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        return;
      }
      map.set(key, { species: label, count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.species.localeCompare(b.species));
  }, [userPlantingTrees]);

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
  const activeActorOptions = useMemo<ActiveActorOption[]>(() => {
    const byKey = new Map<string, ActiveActorOption>();
    users.forEach((user) => {
      if (user.allow_green === false) return;
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
  useEffect(() => {
    if (!lockedGreenActorName) return;
    if (activeUser === lockedGreenActorName) return;
    setActiveUser(lockedGreenActorName);
  }, [activeUser, lockedGreenActorName]);
  useEffect(() => {
    if (!activeUser) return;
    if (lockedGreenActorName && activeUser === lockedGreenActorName) return;
    if (activeActorOptions.some((option) => option.value === activeUser)) return;
    setActiveUser("");
  }, [activeUser, activeActorOptions, lockedGreenActorName]);

  const pendingPlanting = useMemo(() => {
    if (activeUserIsCustodian) {
      const custodianId = Number(activeUserDetail?.id || 0);
      if (!custodianId) return 0;
      const allocatedByDistribution = projectAllocations
        .filter((row) => Number(row.custodian_id || 0) === custodianId)
        .reduce((sum, row) => sum + Number(row.quantity_allocated || 0), 0);
      const allocatedByWorkOrders = plantingOrders
        .filter((row) => row.work_type === "planting")
        .reduce((sum, row) => sum + Number(row.target_trees || 0), 0);
      const allocated = Math.max(allocatedByDistribution, allocatedByWorkOrders);
      const planted = trees.filter((tree) => {
        const origin = String(tree.tree_origin || "new_planting").toLowerCase();
        if (origin !== "new_planting") return false;
        const linkedCustodian = Number(tree.custodian_id || 0) === custodianId;
        const plantedByCustodian = normalizeName(tree.created_by) === normalizeName(activeUser);
        return linkedCustodian || plantedByCustodian;
      }).length;
      return Math.max(allocated - planted, 0);
    }
    const orders = plantingOrders.filter((o) => o.work_type === "planting");
    const totalTarget = orders.reduce((sum: number, o: any) => sum + (o.target_trees || 0), 0);
    const planted = userPlantingTrees.length;
    return Math.max(totalTarget - planted, 0);
  }, [activeUser, activeUserDetail, activeUserIsCustodian, plantingOrders, projectAllocations, trees, userPlantingTrees]);

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
      const res = await api.get(
        greenScopedOrganizationId ? `/green/projects?organization_id=${greenScopedOrganizationId}` : "/green/projects"
      );
      const list = Array.isArray(res.data) ? res.data : [];
      setProjects(list);
      await cacheProjectsOffline(list).catch(() => {});
    } catch (error) {
      const cached = await getCachedProjectsOffline().catch(() => []);
      const scopedCached = greenScopedOrganizationId
        ? cached.filter((row: any) => Number(row?.organization_id || 0) === Number(greenScopedOrganizationId))
        : cached;
      if (scopedCached.length > 0) {
        setProjects(scopedCached);
        return;
      }
      throw error;
    }
  };

  const loadUsers = async () => {
    try {
      const res = await api.get(
        greenScopedOrganizationId ? `/green/users?organization_id=${greenScopedOrganizationId}` : "/green/users"
      );
      const list = Array.isArray(res.data) ? res.data : [];
      setUsers(list);
      await cacheUsersOffline(list).catch(() => {});
    } catch (error) {
      const cached = await getCachedUsersOffline().catch(() => []);
      const scopedCached = greenScopedOrganizationId
        ? cached.filter((row: any) => Number(row?.organization_id || 0) === Number(greenScopedOrganizationId))
        : cached;
      if (scopedCached.length > 0) {
        setUsers(scopedCached);
        return;
      }
      throw error;
    }
  };

  const loadProjectDetail = async (id: number) => {
    try {
      const [projectRes, treesRes, custodiansRes, allocationsRes] = await Promise.allSettled([
        api.get(`/green/projects/${id}`),
        api.get(`/green/projects/${id}/trees`),
        api.get(`/green/projects/${id}/custodians`),
        api.get(`/green/projects/${id}/distribution-allocations`),
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
      const allocations =
        allocationsRes.status === "fulfilled" && Array.isArray(allocationsRes.value.data)
          ? allocationsRes.value.data
          : [];
      setProjectCustodians(custodians);
      setProjectAllocations(allocations);
      setTrees(normalized);
      await Promise.all([
        cacheProjectDetailOffline(id, projectRes.value.data).catch(() => {}),
        cacheProjectTreesOffline(id, normalized).catch(() => {}),
        cacheProjectCustodiansOffline(id, custodians).catch(() => {}),
        cacheProjectAllocationsOffline(id, allocations).catch(() => {}),
      ]);
      // Pre-cache map tiles for the project area so the map remains usable offline.
      if (navigator.onLine) {
        const projectMapSeedPoints = normalized.flatMap((tree: any) => {
          const areaPoints = extractAreaPoints(normalizeOrderAreaGeometry(tree?.existing_area_geojson));
          if (areaPoints.length > 0) return areaPoints;
          const lng = Number(tree?.lng);
          const lat = Number(tree?.lat);
          return Number.isFinite(lng) && Number.isFinite(lat) ? [{ lng, lat }] : [];
        });
        if (projectMapSeedPoints.length > 0) {
          precacheMapTilesForArea(projectMapSeedPoints).catch(() => {});
        }
      }
    } catch (error) {
      const [cachedProject, cachedTrees, pendingDrafts, cachedCustodians, cachedAllocations] = await Promise.all([
        getCachedProjectDetailOffline(id).catch(() => null),
        getCachedProjectTreesOffline(id).catch(() => []),
        getPendingTreeDraftsOffline(id).catch(() => []),
        getCachedProjectCustodiansOffline(id).catch(() => []),
        getCachedProjectAllocationsOffline(id).catch(() => []),
      ]);
      const mergedTrees = mergeTreesById([...(cachedTrees || []), ...(pendingDrafts || [])]);
      if (cachedProject) {
        setActiveProject(cachedProject);
      }
      if (mergedTrees.length > 0) {
        setTrees(mergedTrees);
      }
      if (cachedProject || mergedTrees.length > 0) {
        setProjectCustodians(cachedCustodians || []);
        setProjectAllocations(cachedAllocations || []);
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
          allow_existing_tree_area_reuse: Boolean(row?.allow_existing_tree_area_reuse),
          species_allocations: normalizeSpeciesAllocations(row?.species_allocations),
        } as WorkOrder;
      });
      const nextOrderIds = new Set<number>(rows.map((row: any) => Number(row?.id || 0)).filter((id) => id > 0));
      if (orderNotifyPrimedRef.current) {
        const newOrders = rows.filter((row: any) => {
          const id = Number(row?.id || 0);
          return id > 0 && !seenOrderIdsRef.current.has(id);
        });
        if (newOrders.length > 0) {
          const newPlantingCount = newOrders.filter((row: any) => String(row?.work_type || "").toLowerCase() === "planting").length;
          const newMaintenanceOrderCount = Math.max(newOrders.length - newPlantingCount, 0);
          if (newPlantingCount > 0) {
            pushFieldNotification(
              "New Planting Order",
              `${newPlantingCount} new planting order${newPlantingCount === 1 ? "" : "s"} assigned to you.`,
            );
          }
          if (newMaintenanceOrderCount > 0) {
            pushFieldNotification(
              "New Work Order",
              `${newMaintenanceOrderCount} new work order${newMaintenanceOrderCount === 1 ? "" : "s"} assigned to you.`,
            );
          }
        }
      }
      seenOrderIdsRef.current = nextOrderIds;
      orderNotifyPrimedRef.current = true;
      setPlantingOrders(rows);
      await cacheWorkOrdersOffline(projectId, assigneeName, rows).catch(() => {});
      if (navigator.onLine) {
        const orderAreaPoints = rows.flatMap((row: any) => extractAreaPoints(normalizeOrderAreaGeometry(row?.area_geojson)));
        if (orderAreaPoints.length > 0) {
          precacheMapTilesForArea(orderAreaPoints).catch(() => {});
        }
      }
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
            allow_existing_tree_area_reuse: Boolean(row?.allow_existing_tree_area_reuse),
            species_allocations: normalizeSpeciesAllocations(row?.species_allocations),
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
    seenTaskIdsRef.current = new Set();
    seenOrderIdsRef.current = new Set();
    taskNotifyPrimedRef.current = false;
    orderNotifyPrimedRef.current = false;
  }, [activeProject?.id, activeUser]);

  useEffect(() => {
    if (!activeProject || !activeUser) return;
    const timer = window.setInterval(() => {
      if (!navigator.onLine) return;
      loadMyTasks().catch(() => {});
      loadWorkOrders(activeProject.id, activeUser).catch(() => {});
    }, 45000);
    return () => window.clearInterval(timer);
  }, [activeProject?.id, activeUser]);

  useEffect(() => {
    if (newTree.tree_origin === "existing_inventory") return;
    if (!hasSpeciesBasedPlantingAllocation || speciesAllocationOptions.length === 0) return;
    const allowedKeys = new Set(speciesAllocationOptions.map((item) => normalizeSpeciesKey(item.species)));
    const currentKey = normalizeSpeciesKey(newTree.species);
    if (currentKey && allowedKeys.has(currentKey)) return;
    setNewTree((prev) => {
      if (prev.tree_origin === "existing_inventory") return prev;
      const firstSpecies = speciesAllocationOptions[0]?.species || "";
      if (!firstSpecies || normalizeSpeciesKey(prev.species) === normalizeSpeciesKey(firstSpecies)) return prev;
      return { ...prev, species: firstSpecies };
    });
  }, [
    newTree.tree_origin,
    newTree.species,
    hasSpeciesBasedPlantingAllocation,
    speciesAllocationOptions,
  ]);

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
      setProjectAllocations([]);
    }
  }, [activeProject?.id, activeUser]);

  useEffect(() => {
    if (activeUserIsCustodian && activeSection === "tasks") {
      setActiveSection("map");
    }
  }, [activeUserIsCustodian, activeSection]);

  useEffect(() => {
    if (!activeUserIsCustodian) return;
    const custodianId = Number(activeUserDetail?.id || 0);
    if (!custodianId) return;
    setNewTree((prev) =>
      String(prev.custodian_id || "") === String(custodianId)
        ? prev
        : {
            ...prev,
            custodian_id: String(custodianId),
          },
    );
  }, [activeUserIsCustodian, activeUserDetail?.id]);

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
      tree_age_months: "",
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
    setExistingTreeBatchMode(false);
    setExistingTreeBatchAreaGeojson(null);
    setExistingTreeBatchCount("");
    setUseAssignedExistingTreeArea(false);
    setSelectedExistingTreeAreaOrderId("");
    setMapDrawMode(true);
    setPendingTreePhoto(null);
    setPendingTreePhotos([]);
    setPhotoPreview("");
    setTreePhotoPreviews([]);
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
    if (!ensureGreenWritesAllowed()) return;
    if (!activeProject) return;
    if (addingTree) return;
    if (!activeUser) {
      toast.error("Select a staff or custodian first");
      return;
    }
    const isExistingBatchCapture = newTree.tree_origin === "existing_inventory" && existingTreeBatchMode;
    const batchTreeCountValue = isExistingBatchCapture ? parseInventoryTreeCountInput(existingTreeBatchCount) : null;
    const assignedExistingTreeAreaGeometry =
      isExistingBatchCapture && useAssignedExistingTreeArea
        ? normalizeOrderAreaGeometry(selectedExistingTreeAreaOrder?.area_geojson)
        : null;
    const batchAreaGeometry = isExistingBatchCapture
      ? assignedExistingTreeAreaGeometry || normalizeOrderAreaGeometry(existingTreeBatchAreaGeojson)
      : null;
    const batchAreaCentroid = isExistingBatchCapture ? computeAreaCentroid(batchAreaGeometry) : null;
    if (isExistingBatchCapture) {
      if (batchTreeCountValue === null || batchTreeCountValue <= 1) {
        toast.error("Enter the number of existing trees in this area (must be more than 1).");
        return;
      }
      if (!batchAreaGeometry || !batchAreaCentroid) {
        toast.error(
          useAssignedExistingTreeArea
            ? "Select a reusable supervisor polygon for this existing-tree batch."
            : "Draw the polygon area for the existing trees on the map.",
        );
        return;
      }
      if (!isOnline) {
        toast.error("Batch existing-tree area capture currently requires internet (for polygon + multi-photo sync).");
        return;
      }
    } else if (!newTree.lng || !newTree.lat) {
      toast.error("Pick a point on the map");
      return;
    }
    const speciesValue = String(newTree.species || "").trim();
    if (newTree.tree_origin !== "existing_inventory" && hasSpeciesBasedPlantingAllocation) {
      const allowedKeys = new Set(speciesAllocationOptions.map((item) => normalizeSpeciesKey(item.species)));
      if (!speciesValue) {
        toast.error("Select one of your assigned species before adding this tree.");
        return;
      }
      if (!allowedKeys.has(normalizeSpeciesKey(speciesValue))) {
        toast.error("Selected species is outside your assigned planting species list.");
        return;
      }
    }
    const treeHeightValue = parseTreeHeightInput(newTree.tree_height_m);
    if (newTree.tree_height_m && treeHeightValue === null) {
      toast.error("Tree height must be a number between 0 and 120.");
      return;
    }
    const treeAgeMonthsValue = parseTreeAgeMonthsInput(newTree.tree_age_months);
    if (newTree.tree_age_months && treeAgeMonthsValue === null) {
      toast.error("Tree age (months) must be a number between 0 and 2400.");
      return;
    }
    if (newTree.tree_origin === "existing_inventory" && !newTree.planting_date && treeAgeMonthsValue === null) {
      toast.error("For Existing Tree, provide a reference date or estimated age (months) for accurate CO2.");
      return;
    }
    const pendingFilesForTree = isExistingBatchCapture
      ? pendingTreePhotos
      : pendingTreePhoto
        ? [pendingTreePhoto]
        : [];
    if (pendingFilesForTree.length === 0) {
      toast.error(
        isExistingBatchCapture
          ? "Add at least one tree photo before saving this existing-tree area."
          : "Take or choose a tree photo before adding this tree.",
      );
      return;
    }
    if (
      !(await ensureGreenFieldPrivacyConsent("tree_create", {
        tree_origin: newTree.tree_origin,
        existing_tree_batch_mode: isExistingBatchCapture,
        has_photo: true,
        has_manual_point: !isExistingBatchCapture,
      }))
    ) {
      return;
    }
    const treePayload = {
      project_id: activeProject.id,
      lng: Number((batchAreaCentroid?.lng ?? newTree.lng) || 0),
      lat: Number((batchAreaCentroid?.lat ?? newTree.lat) || 0),
      species: speciesValue,
      planting_date: newTree.planting_date || null,
      status: newTree.status,
      tree_origin: newTree.tree_origin,
      attribution_scope: newTree.attribution_scope,
      count_in_planting_kpis: newTree.tree_origin === "existing_inventory" ? newTree.count_in_planting_kpis : true,
      count_in_carbon_scope: newTree.count_in_carbon_scope,
      custodian_id: newTree.custodian_id ? Number(newTree.custodian_id) : null,
      tree_height_m: treeHeightValue,
      tree_age_months: newTree.tree_origin === "existing_inventory" ? treeAgeMonthsValue : null,
      inventory_tree_count: isExistingBatchCapture ? batchTreeCountValue : 1,
      existing_area_geojson: isExistingBatchCapture ? batchAreaGeometry : null,
      notes: newTree.notes,
      photo_url: "",
      photo_urls: [],
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
      if (pendingFilesForTree.length > 0 && Number.isFinite(createdTreeId) && createdTreeId > 0) {
        try {
          for (const file of pendingFilesForTree) {
            if (Number.isFinite(reviewTaskId) && reviewTaskId > 0) {
              await uploadGreenPhoto(file, "tasks", { taskId: reviewTaskId });
            } else {
              await uploadGreenPhoto(file, "trees", { treeId: createdTreeId });
            }
          }
        } catch (uploadError) {
          photoLinked = false;
          if (isLikelyNetworkError(uploadError) && activeProject) {
            const link = Number.isFinite(reviewTaskId) && reviewTaskId > 0 ? { taskId: reviewTaskId } : { treeId: createdTreeId };
            for (const file of pendingFilesForTree.slice(0, isExistingBatchCapture ? 0 : pendingFilesForTree.length)) {
              await queuePhotoUploadOffline(file, Number.isFinite(reviewTaskId) && reviewTaskId > 0 ? "tasks" : "trees", link, {
                projectId: activeProject.id,
                assigneeName: activeUser || "",
              }).catch(() => {});
            }
          }
        }
      }

      resetNewTreeForm();
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
            ? Number.isFinite(reviewTaskId) && reviewTaskId > 0
              ? "Existing tree submitted for supervisor review."
              : "Existing tree saved."
            : Number.isFinite(reviewTaskId) && reviewTaskId > 0
            ? "Tree submitted for supervisor review."
            : "Tree successfully planted!"
        );
      } else {
        setPlantingFlowMessage(
          treePayload.tree_origin === "existing_inventory"
            ? Number.isFinite(reviewTaskId) && reviewTaskId > 0
              ? "Existing tree submitted for supervisor review. Photo upload failed."
              : "Existing tree saved. Photo upload failed."
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
            isExistingBatchCapture ? null : pendingTreePhoto
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
    if (!ensureGreenWritesAllowed()) return;
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

  const updateTreeAgeMonths = async (treeId: number, rawAgeMonths: string) => {
    if (!ensureGreenWritesAllowed()) return;
    const parsed = parseTreeAgeMonthsInput(rawAgeMonths);
    if (String(rawAgeMonths || "").trim() && parsed === null) {
      toast.error("Estimated tree age must be a number between 0 and 2400 months.");
      return;
    }
    setSavingTreeAgeMonthsId(treeId);
    try {
      await api.patch(`/green/trees/${treeId}`, {
        tree_age_months: parsed,
      });
      setTrees((prev) => prev.map((tree) => (tree.id === treeId ? { ...tree, tree_age_months: parsed } : tree)));
      setInspectedTree((prev) =>
        prev && Number(prev.id) === Number(treeId)
          ? ({
              ...prev,
              tree_age_months: parsed,
            } as any)
          : prev
      );
      setTreeAgeMonthsDraftById((prev) => ({ ...prev, [treeId]: parsed === null ? "" : String(parsed) }));
      toast.success("Tree age updated");
    } catch {
      toast.error("Failed to update tree age");
    } finally {
      setSavingTreeAgeMonthsId(null);
    }
  };

  const loadTreeDetails = async (treeId: number) => {
    const allowedTree = userTrees.find((tree: any) => Number(tree.id) === Number(treeId));
    if (!allowedTree) {
      setSelectedTreeId(null);
      setTreeTasks([]);
      setTreeTimeline(null);
      toast.error("You can only view records for your own trees.");
      return;
    }
    setSelectedTreeId(treeId);
    const scopeTimelineForActiveUser = (timeline: any) => {
      if (!timeline) return null;
      if (!activeUser) return timeline;
      const scopedVisits = Array.isArray(timeline?.visits)
        ? timeline.visits.filter((visit: any) => String(visit?.created_by || "") === String(activeUser))
        : [];
      return {
        ...timeline,
        visits: scopedVisits,
      };
    };
    try {
      const [tasksRes, timelineRes] = await Promise.all([
        api.get(`/green/trees/${treeId}/tasks`),
        api.get(`/green/trees/${treeId}/timeline`),
      ]);
      const tasks = Array.isArray(tasksRes.data) ? tasksRes.data : [];
      const scopedTasks = tasks.filter((task: any) => !activeUser || task.assignee_name === activeUser);
      const scopedTimeline = scopeTimelineForActiveUser(timelineRes.data);
      setTreeTasks(scopedTasks);
      setTreeTimeline(scopedTimeline);
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
      const scopedTimeline = scopeTimelineForActiveUser(cachedTimeline);
      if (scopedTasks.length > 0 || cachedTimeline) {
        setTreeTasks(scopedTasks);
        setTreeTimeline(scopedTimeline);
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
    const nextTaskIds = new Set<number>(rows.map((row: any) => Number(row?.id || 0)).filter((id) => id > 0));
    if (taskNotifyPrimedRef.current) {
      const newTasks = rows.filter((row: any) => {
        const id = Number(row?.id || 0);
        if (!(id > 0) || seenTaskIdsRef.current.has(id)) return false;
        const reviewState = String(row?.review_state || "").toLowerCase();
        return reviewState !== "approved";
      });
      if (newTasks.length > 0) {
        pushFieldNotification(
          "New Maintenance Task",
          `${newTasks.length} new task${newTasks.length === 1 ? "" : "s"} assigned to you.`,
        );
      }
    }
    seenTaskIdsRef.current = nextTaskIds;
    taskNotifyPrimedRef.current = true;
    setMyTasks(rows);
    const edits: Record<number, TaskEdit> = {};
    rows.forEach((t: any) => {
      edits[t.id] = buildTaskEdit(t);
    });
    setTaskEdits(edits);
    setTaskTreeMetaEdits((prev) => {
      const next = { ...prev };
      let changed = false;
      rows.forEach((task: any) => {
        const taskId = Number(task?.id || 0);
        if (!taskId || next[taskId]) return;
        next[taskId] = {
          species: String(task?.tree_species || ""),
          planting_date: String(task?.tree_planting_date || ""),
          tree_height_m: "",
          tree_age_months: "",
        };
        changed = true;
      });
      return changed ? next : prev;
    });
    setEditingTaskId(null);
    setTaskGpsLoadingId(null);
  };

  const isPlantingMetadataTask = (task: any) => {
    const taskType = normalizeTaskState(task?.task_type);
    return taskType === "planting" || taskType === "existing_inventory_intake";
  };

  const getTaskTreeMetaDraft = (task: any): TaskTreeMetaEdit => {
    const taskId = Number(task?.id || 0);
    const treeId = Number(task?.tree_id || 0);
    const tree = userTreeById.get(treeId);
    const seeded = taskTreeMetaEdits[taskId];
    return {
      species: seeded?.species ?? String(tree?.species || task?.tree_species || ""),
      planting_date: seeded?.planting_date ?? String(tree?.planting_date || task?.tree_planting_date || ""),
      tree_height_m:
        seeded?.tree_height_m ??
        (tree?.tree_height_m === null || tree?.tree_height_m === undefined ? "" : String(tree.tree_height_m)),
      tree_age_months:
        seeded?.tree_age_months ??
        (tree?.tree_age_months === null || tree?.tree_age_months === undefined ? "" : String(tree.tree_age_months)),
    };
  };

  const saveTaskTreeMetadata = async (task: any) => {
    if (!isPlantingMetadataTask(task)) return;
    const treeId = Number(task?.tree_id || 0);
    if (!treeId) return;
    const tree = userTreeById.get(treeId);
    if (!tree) return;
    const draft = getTaskTreeMetaDraft(task);
    const species = String(draft.species || "").trim();
    const plantingDate = String(draft.planting_date || "").trim();
    const treeHeight = parseTreeHeightInput(draft.tree_height_m);
    const treeAgeMonths = parseTreeAgeMonthsInput(draft.tree_age_months);
    if (!species) {
      throw new Error("Species is required for this submission.");
    }
    if (!plantingDate) {
      throw new Error(
        normalizeTaskState(tree.tree_origin) === "existing_inventory"
          ? "Reference date is required for existing tree metadata."
          : "Planting date is required for this submission.",
      );
    }
    if (String(draft.tree_height_m || "").trim() && treeHeight === null) {
      throw new Error("Tree height must be a number between 0 and 120.");
    }
    if (String(draft.tree_age_months || "").trim() && treeAgeMonths === null) {
      throw new Error("Estimated tree age must be a number between 0 and 2400 months.");
    }
    await api.patch(`/green/trees/${treeId}`, {
      species,
      planting_date: plantingDate,
      tree_height_m: treeHeight,
      tree_age_months: normalizeTaskState(tree.tree_origin) === "existing_inventory" ? treeAgeMonths : null,
    });
    setTrees((prev) =>
      prev.map((row) =>
        Number(row.id) === treeId
          ? {
              ...row,
              species,
              planting_date: plantingDate,
              tree_height_m: treeHeight,
              tree_age_months: normalizeTaskState(row.tree_origin) === "existing_inventory" ? treeAgeMonths : null,
            }
          : row,
      ),
    );
    setInspectedTree((prev) =>
      prev && Number(prev.id) === treeId
        ? ({
            ...prev,
            species,
            planting_date: plantingDate,
            tree_height_m: treeHeight,
            tree_age_months: normalizeTaskState(tree.tree_origin) === "existing_inventory" ? treeAgeMonths : null,
          } as any)
        : prev,
    );
  };

  const saveTaskUpdate = async (taskId: number) => {
    if (!ensureGreenWritesAllowed()) return;
    const task = myTasks.find((entry: any) => entry.id === taskId);
    const edit = buildTaskEdit(task, taskEdits[taskId]);
    if (isTaskLockedForField(task)) {
      toast.error("Task is locked for review");
      return;
    }
    const payload = sanitizeTaskEditForApi(edit);
    if (!(await ensureGreenFieldPrivacyConsent("task_update", { task_id: taskId, task_type: task?.task_type || "" }))) {
      return;
    }
    try {
      await saveTaskTreeMetadata(task);
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
      toast.error((error as any)?.message || "Failed to update task");
    }
  };

  const submitTaskForReview = async (taskId: number) => {
    if (!ensureGreenWritesAllowed()) return;
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
    const submitPhotoUrls = normalizePhotoList(edit.photo_urls).filter((url) => !isLocalBlobUrl(url));
    if (submitPhotoUrls.length) {
      submitPayload.photo_urls = submitPhotoUrls;
      submitPayload.photo_url = submitPhotoUrls[submitPhotoUrls.length - 1];
    } else if (edit.photo_url && !isLocalBlobUrl(edit.photo_url)) {
      submitPayload.photo_url = edit.photo_url;
    }
    const optimisticPhotoUrls = normalizePhotoList(edit.photo_urls);
    const optimisticPhotoUrl =
      optimisticPhotoUrls[optimisticPhotoUrls.length - 1] || edit.photo_url || String(task.photo_url || "");
    if (edit.activity_lng !== null && edit.activity_lat !== null) {
      submitPayload.activity_lng = Number(edit.activity_lng.toFixed(6));
      submitPayload.activity_lat = Number(edit.activity_lat.toFixed(6));
      submitPayload.activity_recorded_at = (edit.activity_recorded_at || "").trim() || new Date().toISOString();
    }
    if (
      !(await ensureGreenFieldPrivacyConsent("task_submit_for_review", {
        task_id: taskId,
        task_type: task?.task_type || "",
        has_photo: optimisticPhotoUrls.length > 0 || Boolean(edit.photo_url),
        has_gps: edit.activity_lng !== null && edit.activity_lat !== null,
      }))
    ) {
      toast.dismiss(loadingId);
      return;
    }
    try {
      await saveTaskTreeMetadata(task);
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
                photo_urls: optimisticPhotoUrls,
                photo_url: optimisticPhotoUrl,
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
                    photo_urls: optimisticPhotoUrls,
                    photo_url: optimisticPhotoUrl,
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
      toast.error(error?.response?.data?.detail || error?.message || "Failed to submit task", { id: loadingId });
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
    if (!ensureGreenWritesAllowed()) {
      throw {
        response: {
          data: {
            detail: "Organization is paused. Read-only mode is enabled. Viewing and exports only.",
          },
        },
      };
    }
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

  const onTaskPhotoPicked = async (taskId: number, files: FileList | File[] | null) => {
    if (!ensureGreenWritesAllowed()) return;
    const pickedFiles = files ? Array.from(files).filter(Boolean) : [];
    if (!pickedFiles.length) return;
    const task = myTasks.find((entry: any) => entry.id === taskId);
    if (isTaskLockedForField(task)) {
      toast.error("Task is locked for review");
      return;
    }
    const loadingId = toast.loading(
      pickedFiles.length === 1 ? "Uploading task photo..." : `Uploading ${pickedFiles.length} task photos...`,
    );
    const initialTask = myTasks.find((entry: any) => entry.id === taskId) || task;
    let mergedUrls = getTaskPhotoUrls(initialTask, taskEdits[taskId]);
    let uploadedCount = 0;
    let queuedCount = 0;
    let failedCount = 0;
    try {
      for (const file of pickedFiles) {
        try {
          const photoUrl = await uploadGreenPhoto(file, "tasks", { taskId });
          uploadedCount += 1;
          if (photoUrl && !mergedUrls.includes(photoUrl)) {
            mergedUrls = [...mergedUrls, photoUrl];
          }
        } catch (error) {
          if (isLikelyNetworkError(error) && activeProject && activeUser) {
            try {
              const queued = await queuePhotoUploadOffline(file, "tasks", { taskId }, {
                projectId: activeProject.id,
                assigneeName: activeUser,
              });
              queuedCount += 1;
              if (queued.localPreviewUrl && !mergedUrls.includes(queued.localPreviewUrl)) {
                mergedUrls = [...mergedUrls, queued.localPreviewUrl];
              }
              continue;
            } catch {
              failedCount += 1;
              continue;
            }
          }
          failedCount += 1;
          continue;
        }
      }
      const latestPhoto = mergedUrls[mergedUrls.length - 1] || "";
      const linkedTask = myTasks.find((entry: any) => entry.id === taskId) || task;
      setTaskEdits((prev) => ({
        ...prev,
        [taskId]: buildTaskEdit(linkedTask || task, {
          ...prev[taskId],
          photo_url: latestPhoto,
          photo_urls: mergedUrls,
        }),
      }));
      setMyTasks((prev) =>
        prev.map((row: any) =>
          row.id === taskId
            ? {
                ...row,
                photo_url: latestPhoto,
                photo_urls: mergedUrls,
              }
            : row,
        ),
      );
      if (linkedTask && inspectedTree && Number(linkedTask.tree_id) === inspectedTree.id) {
        setInspectedTree((prev) => (prev ? { ...prev, photo_url: latestPhoto } : prev));
      }
      if (uploadedCount > 0 && activeProject) {
        await loadProjectDetail(activeProject.id);
      }
      if (uploadedCount > 0 && queuedCount > 0) {
        toast.success(`Uploaded ${uploadedCount}, queued ${queuedCount} offline`, { id: loadingId });
      } else if (uploadedCount > 0) {
        toast.success(
          uploadedCount === 1 ? "Task photo uploaded" : `${uploadedCount} task photos uploaded`,
          { id: loadingId },
        );
      } else if (queuedCount > 0) {
        toast.success(
          queuedCount === 1 ? "Task photo queued offline" : `${queuedCount} task photos queued offline`,
          { id: loadingId },
        );
        await showOfflineQueuedToast("Task photos saved offline.");
      } else {
        toast.error("No photos were processed", { id: loadingId });
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} photo upload${failedCount === 1 ? "" : "s"} failed`);
      }
    } catch {
      toast.error("Failed to upload task photo", { id: loadingId });
    }
  };

  const updateTreeStatus = async (treeId: number, status: string) => {
    if (!ensureGreenWritesAllowed()) return;
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

  const useGps = async () => {
    if (!(await ensureGreenFieldPrivacyConsent("tree_gps_capture"))) {
      return;
    }
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
      (err) => {
        toast.error(err.code === 1 ? "GPS permission denied" : "Unable to get GPS location. Ensure location services are on.");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
    );
  };

  const captureTaskGps = async (taskId: number) => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported on this device");
      return;
    }
    const task = myTasks.find((entry: any) => entry.id === taskId);
    if (!task || isTaskLockedForField(task)) {
      toast.error("Task is locked for review");
      return;
    }
    if (!(await ensureGreenFieldPrivacyConsent("task_gps_capture", { task_id: taskId, task_type: task?.task_type || "" }))) {
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
      (err) => {
        toast.error(err.code === 1 ? "GPS permission denied" : "Unable to get GPS location. Ensure location services are on.");
        setTaskGpsLoadingId(null);
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
    );
  };

  const onPhotoPicked = async (file: File | null) => {
    if (!file) {
      setPendingTreePhoto(null);
      setPhotoPreview("");
      return;
    }
    if (!(await ensureGreenFieldPrivacyConsent("tree_photo_capture", { file_count: 1 }))) {
      return;
    }
    setPendingTreePhotos([]);
    setTreePhotoPreviews([]);
    setPendingTreePhoto(file);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setPhotoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
    setNewTree((prev) => ({ ...prev, photo_url: "" }));
  };

  const onTreePhotosPicked = async (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files || []).filter(Boolean) as File[];
    if (list.length === 0) {
      setPendingTreePhotos([]);
      setTreePhotoPreviews([]);
      return;
    }
    if (!(await ensureGreenFieldPrivacyConsent("existing_tree_batch_photo_capture", { file_count: list.length }))) {
      return;
    }
    setPendingTreePhoto(null);
    setPhotoPreview("");
    setPendingTreePhotos(list);
    setTreePhotoPreviews(
      list.slice(0, 8).map((file) => {
        try {
          return URL.createObjectURL(file);
        } catch {
          return "";
        }
      }).filter(Boolean)
    );
    setNewTree((prev) => ({ ...prev, photo_url: "" }));
  };

  const onInspectedTreePhotoPicked = async (file: File | null) => {
    if (!ensureGreenWritesAllowed()) return;
    if (!file || !inspectedTree) return;
    if (!(await ensureGreenFieldPrivacyConsent("tree_photo_upload", { tree_id: inspectedTree.id }))) {
      return;
    }
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
    if (section === "map") {
      setMapDrawMode(true);
    }
  };

  const goHome = () => {
    setActiveSection(null);
    setEditingTaskId(null);
    setSelectedTreeId(null);
    setInspectedTree(null);
  };
  const continueFromIntro = () => {
    setIntroGateOpen(false);
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem("landcheck_green_intro_seen", "1");
    } catch {
      // ignore storage errors
    }
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
      {privacyConsentModal}
      <header className="green-header">
        <div className="green-header-inner">
            <div className="green-header-brand">
              <div className="green-brand-logo" aria-hidden="true">
                <img src={GREEN_LOGO_SRC} alt="LandCheck Green" />
              </div>
              {greenHeaderPartnerLogo ? (
                <div className="green-brand-logo green-brand-logo-partner" aria-hidden="true">
                  <img
                    src={greenHeaderPartnerLogo || ""}
                    alt={`${greenHeaderPartnerName || "Partner"} logo`}
                  />
                </div>
              ) : null}
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
            {notificationPermission === "default" && (
              <button className="green-ghost-btn" onClick={requestGreenNotificationPermission} type="button">
                Enable Alerts
              </button>
            )}
            {greenAuthUser?.full_name && (
              <span className="green-profile-chip" title={greenAuthUser.organization_name || undefined}>
                {greenAuthUser.full_name}
              </span>
            )}
            {greenAuthUser?.id && greenAuthUser.id > 0 && (
              <button className="green-ghost-btn" onClick={openGreenPasswordModal} type="button">
                Change Password
              </button>
            )}
            <button className="green-ghost-btn" onClick={logoutGreen} type="button">
              Logout
            </button>
          </div>
        </div>
      </header>

      {greenPartnerOrgPaused && (
        <div
          role="status"
          aria-live="polite"
          style={{
            margin: "8px 12px 0",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #d8c169",
            background: "#fff7d6",
            color: "#5f4b00",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Organization is paused. You can view project data and export reports only. Tree planting, maintenance updates, and edits are disabled.
        </div>
      )}

      <main className="green-shell">
        {activeSection === null && introGateOpen && (
          <section className="green-intro-card" id="green-intro">
            <span className="green-intro-kicker">LandCheck Green</span>
            <h2>Field Workflow At A Glance</h2>
            <p>
              Select your project and profile, then continue to capture tree planting, maintenance evidence, GPS proof,
              and offline-safe updates from the field.
            </p>
            <div className="green-intro-pills">
              <span>Live map + tree tracking</span>
              <span>Offline queue + sync</span>
              <span>Supervisor-ready evidence</span>
            </div>
            <button className="green-btn-primary green-intro-continue" type="button" onClick={continueFromIntro}>
              Continue
            </button>
          </section>
        )}
        {(activeSection !== null || !introGateOpen) && (
          <>
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

              {!isLockedGreenUserSession && (
                <select
                  value={activeUser}
                  onChange={(e) => setActiveUser(e.target.value)}
                >
                  <option value="">Select staff or custodian</option>
                  {activeActorOptions.map((option) => (
                    <option key={`${option.actorType}-${option.id}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
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
            </div>
          )}
        </section>

        <section className="green-tiles">
          <button
            className={`green-tile ${activeSection === "tasks" ? "active" : ""} ${activeUserIsCustodian ? "is-disabled" : ""}`}
            onClick={() => {
              if (activeUserIsCustodian) return;
              openSection("tasks");
            }}
            type="button"
            disabled={activeUserIsCustodian}
            title={activeUserIsCustodian ? "Maintenance tasks are disabled for custodian users." : undefined}
          >
            <span className="green-tile-icon" aria-hidden="true">
              <TaskTileIcon />
            </span>
            <span className="green-tile-label">Maintenance Tasks</span>
            <span className="green-tile-meta">
              <span className="green-tile-meta-item is-review">Submitted {myTaskCounts.submitted}</span>
              <span className="green-tile-meta-item is-approved">Approved {myTaskCounts.done}</span>
            </span>
            <span className={`green-tile-badge ${myTaskCounts.undone > 0 ? "green-tile-badge-assigned" : ""}`}>
              {activeUserIsCustodian ? "-" : myTaskCounts.undone}
            </span>
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
            ) : activeUserIsCustodian ? (
              <p className="green-empty">
                Maintenance tasks are disabled for custodians. Use Map & Add Trees to record custodian planting.
              </p>
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
                  const taskTree = userTreeById.get(Number(t.tree_id || 0));
                  const taskTreeMetaDraft = getTaskTreeMetaDraft(t);
                  const evidencePhotos = getTaskPhotoUrls(t, taskEdit);
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
                        {isTaskMetadataEditRequested(t) ? " | Metadata edit requested" : ""}
                      </span>
                    </div>
                    {(isTaskRejected(t) || isTaskMetadataEditRequested(t)) && t.review_notes && (
                      <div className="tree-row">
                        <span className="task-cell green-task-review-note" data-label="Supervisor note">
                          Supervisor note: {t.review_notes}
                        </span>
                      </div>
                    )}
                    {normalizeTaskState(t.task_type) === "supervision" && (
                      <div className="tree-row">
                        <span className="task-cell" data-label="Supervision">
                          Custodian: {t.custodian_name || "-"} | Community: {t.custodian_community_name || "-"} | Contact:{" "}
                          {t.custodian_phone || t.custodian_email || t.custodian_contact_person || "-"} | Visit{" "}
                          {Number(t.supervision_visit_no || 0) || "-"} / {Number(t.supervision_total_visits || 0) || "-"}
                        </span>
                      </div>
                    )}

                    {editingTaskId === t.id && !isTaskLockedForField(t) && (
                      <div className="tree-row task-edit-inline-row">
                        <div className="task-edit-inline-card">
                          {isPlantingMetadataTask(t) && (
                            <>
                              <div className="tree-form-row full">
                                <label>Species</label>
                                <input
                                  value={taskTreeMetaDraft.species}
                                  onChange={(e) =>
                                    setTaskTreeMetaEdits((prev) => ({
                                      ...prev,
                                      [t.id]: {
                                        ...(prev[t.id] || taskTreeMetaDraft),
                                        species: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                              <div className="tree-form-row full">
                                <label>
                                  {normalizeTaskState(taskTree?.tree_origin) === "existing_inventory"
                                    ? "Reference Date"
                                    : "Planting Date"}
                                </label>
                                <input
                                  type="date"
                                  value={taskTreeMetaDraft.planting_date}
                                  onChange={(e) =>
                                    setTaskTreeMetaEdits((prev) => ({
                                      ...prev,
                                      [t.id]: {
                                        ...(prev[t.id] || taskTreeMetaDraft),
                                        planting_date: e.target.value,
                                      },
                                    }))
                                  }
                                />
                                <small className="tree-form-help">
                                  This date is saved as the planting date on the tree record and is what supervisors will see in Work review.
                                </small>
                              </div>
                              <div className="tree-form-row full">
                                <label>Tree Height (m)</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={120}
                                  step="0.01"
                                  value={taskTreeMetaDraft.tree_height_m}
                                  onChange={(e) =>
                                    setTaskTreeMetaEdits((prev) => ({
                                      ...prev,
                                      [t.id]: {
                                        ...(prev[t.id] || taskTreeMetaDraft),
                                        tree_height_m: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                              {normalizeTaskState(taskTree?.tree_origin) === "existing_inventory" && (
                                <div className="tree-form-row full">
                                  <label>Estimated Age (months)</label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={2400}
                                    step="1"
                                    value={taskTreeMetaDraft.tree_age_months}
                                    onChange={(e) =>
                                      setTaskTreeMetaEdits((prev) => ({
                                        ...prev,
                                        [t.id]: {
                                          ...(prev[t.id] || taskTreeMetaDraft),
                                          tree_age_months: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </div>
                              )}
                              {isTaskMetadataEditRequested(t) && (
                                <div className="tree-row">
                                  <span className="task-cell green-task-review-note" data-label="Metadata edit">
                                    Supervisor asked for metadata correction only. Update the fields above, then resubmit.
                                  </span>
                                </div>
                              )}
                            </>
                          )}
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
                              multiple
                              onChange={(e) => {
                                void onTaskPhotoPicked(t.id, e.target.files);
                                e.currentTarget.value = "";
                              }}
                            />
                            <small className="green-species-allocation-hint">
                              {evidencePhotos.length} photo{evidencePhotos.length === 1 ? "" : "s"} attached
                            </small>
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
                                onClick={() => void captureTaskGps(t.id)}
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
                            <button className="green-btn-primary" type="button" onClick={() => void saveTaskUpdate(t.id)}>
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
                {existingTreeBatchCaptureActive && (
                  <div className="green-map-area-banner">
                    <strong>Existing trees batch capture</strong>
                    <span>
                      {useAssignedExistingTreeArea && selectedExistingTreeAreaOrder
                        ? `Using supervisor polygon: ${(selectedExistingTreeAreaOrder.area_label || "").trim() || `Assigned area #${selectedExistingTreeAreaOrder.id}`}.`
                        : "Zoom to the area and draw one polygon, then enter the number of trees below."}
                    </span>
                  </div>
                )}
                <TreeMap
                  trees={treePoints}
                  draftPoint={
                    existingTreeBatchCaptureActive
                      ? null
                      : newTree.lng && newTree.lat
                        ? { lng: newTree.lng, lat: newTree.lat }
                        : null
                  }
                  onDraftMove={
                    existingTreeBatchCaptureActive
                      ? undefined
                      : (lng, lat) => setNewTree((prev) => ({ ...prev, lng, lat }))
                  }
                  onAddTree={(lng, lat) => {
                    if (existingTreeBatchCaptureActive) return;
                    setNewTree((prev) => ({ ...prev, lng, lat }));
                  }}
                  drawActive={existingTreeBatchCaptureActive && useAssignedExistingTreeArea ? false : mapDrawMode}
                  drawMode={existingTreeBatchCaptureActive ? "polygon" : "point"}
                  onPolygonChange={existingTreeBatchCaptureActive ? (geometry) => setExistingTreeBatchAreaGeojson(geometry) : undefined}
                  onSelectTree={(id) => loadTreeDetails(id)}
                  onTreeInspect={(detail) => setInspectedTree(detail)}
                  onViewChange={(view) => setMapView(view)}
                  fitBounds={mapFitPoints}
                  assignmentAreas={greenMapOverlayAreas}
                />
              </div>
            </div>

            <div className="tree-form">
              {!existingTreeBatchCaptureActive && (
                <>
                  <div className="tree-form-row">
                    <label>GPS</label>
                    <button className="green-btn-outline" type="button" onClick={() => void useGps()} disabled={gpsLoading}>
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
                </>
              )}
              <div className="tree-form-row">
                <label>Species</label>
                {newTree.tree_origin !== "existing_inventory" && hasSpeciesBasedPlantingAllocation ? (
                  <>
                    <select
                      value={newTree.species}
                      onChange={(e) => setNewTree({ ...newTree, species: e.target.value })}
                    >
                      <option value="">Select assigned species</option>
                      {speciesAllocationOptions.map((item) => (
                        <option key={`assigned-species-${item.species}`} value={item.species}>
                          {item.species}
                        </option>
                      ))}
                    </select>
                    <small className="green-species-allocation-hint">
                      Assigned:{" "}
                      {speciesAllocationOptions
                        .map((item) => `${item.species} (${item.remaining} remaining)`)
                        .join(", ")}
                    </small>
                  </>
                ) : (
                  <input
                    value={newTree.species}
                    onChange={(e) => setNewTree({ ...newTree, species: e.target.value })}
                  />
                )}
              </div>
              <div className="tree-form-row">
                <label>Tree Entry Type</label>
                <select
                  value={newTree.tree_origin}
                  onChange={(e) => {
                    const nextOrigin = e.target.value === "existing_inventory" ? "existing_inventory" : "new_planting";
                    if (nextOrigin !== "existing_inventory") {
                      setExistingTreeBatchMode(false);
                      setExistingTreeBatchAreaGeojson(null);
                      setExistingTreeBatchCount("");
                      setUseAssignedExistingTreeArea(false);
                      setSelectedExistingTreeAreaOrderId("");
                      setPendingTreePhotos([]);
                      setTreePhotoPreviews([]);
                    }
                    setMapDrawMode(true);
                    setNewTree((prev) => ({
                      ...prev,
                      tree_origin: nextOrigin,
                      status: nextOrigin === "existing_inventory" ? "healthy" : "alive",
                      attribution_scope: nextOrigin === "existing_inventory" ? "monitor_only" : "full",
                      count_in_planting_kpis: nextOrigin === "existing_inventory" ? false : true,
                      count_in_carbon_scope: true,
                      tree_age_months: nextOrigin === "existing_inventory" ? prev.tree_age_months : "",
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
                {newTree.tree_origin === "existing_inventory" && (
                  <small className="tree-form-help">
                    Saved as the tree planting date/reference date and shown to supervisors in Work review.
                  </small>
                )}
              </div>
              {newTree.tree_origin === "existing_inventory" && (
                <div className="tree-form-row">
                  <label>Estimated Age (months)</label>
                  <input
                    type="number"
                    min={0}
                    max={2400}
                    step="1"
                    placeholder="Optional if exact planting date is unknown"
                    value={newTree.tree_age_months}
                    onChange={(e) => setNewTree({ ...newTree, tree_age_months: e.target.value })}
                  />
                  <small className="tree-form-help">
                    Optional. Used for CO2 estimation when planting date is not available for an existing tree.
                  </small>
                </div>
              )}
              {newTree.tree_origin === "existing_inventory" && (
                <>
                  <div className="tree-form-row full">
                    <label className="green-checkbox-row">
                      <input
                        type="checkbox"
                        checked={existingTreeBatchMode}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setExistingTreeBatchMode(checked);
                          if (checked) {
                            setMapDrawMode(true);
                            setNewTree((prev) => ({ ...prev, lng: 0, lat: 0 }));
                          }
                          setExistingTreeBatchAreaGeojson(null);
                          setExistingTreeBatchCount(checked ? (existingTreeBatchCount || "2") : "");
                          setUseAssignedExistingTreeArea(false);
                          setSelectedExistingTreeAreaOrderId("");
                          setPendingTreePhoto(null);
                          setPhotoPreview("");
                          setPendingTreePhotos([]);
                          setTreePhotoPreviews([]);
                        }}
                      />
                      <span>Capture multiple existing trees in one mapped area (polygon)</span>
                    </label>
                    <small className="tree-form-help">
                      Use this when recording an existing-tree inventory area. Draw the polygon on the map and enter the number of trees.
                    </small>
                  </div>
                  {existingTreeBatchMode && (
                    <>
                      {reusableExistingTreeAreaOrders.length > 0 && (
                        <div className="tree-form-row full">
                          <label className="green-checkbox-row">
                            <input
                              type="checkbox"
                              checked={useAssignedExistingTreeArea}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setUseAssignedExistingTreeArea(checked);
                                if (checked) {
                                  setSelectedExistingTreeAreaOrderId(
                                    String(selectedExistingTreeAreaOrder?.id || reusableExistingTreeAreaOrders[0]?.id || ""),
                                  );
                                  setExistingTreeBatchAreaGeojson(null);
                                  setMapDrawMode(false);
                                } else {
                                  setMapDrawMode(true);
                                }
                              }}
                            />
                            <span>Use supervisor-assigned polygon instead of drawing a new one</span>
                          </label>
                          <small className="tree-form-help">
                            Supervisors enabled reuse on {reusableExistingTreeAreaOrders.length} assigned planting area
                            {reusableExistingTreeAreaOrders.length === 1 ? "" : "s"}.
                          </small>
                        </div>
                      )}
                      {useAssignedExistingTreeArea && reusableExistingTreeAreaOrders.length > 1 && (
                        <div className="tree-form-row full">
                          <label>Supervisor Polygon</label>
                          <select
                            value={selectedExistingTreeAreaOrderId || String(selectedExistingTreeAreaOrder?.id || "")}
                            onChange={(e) => setSelectedExistingTreeAreaOrderId(e.target.value)}
                          >
                            {reusableExistingTreeAreaOrders.map((order) => (
                              <option key={`existing-area-order-${order.id}`} value={String(order.id)}>
                                {(order.area_label || "").trim() || `Assigned area #${order.id}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="tree-form-row">
                        <label>Number of Trees in Area</label>
                        <input
                          type="number"
                          min={2}
                          max={1000000}
                          step="1"
                          placeholder="e.g. 24"
                          value={existingTreeBatchCount}
                          onChange={(e) => setExistingTreeBatchCount(e.target.value)}
                        />
                      </div>
                      <div className="tree-form-row full">
                        <label>Area Polygon</label>
                        <input
                          value={
                            useAssignedExistingTreeArea
                              ? selectedExistingTreeAreaOrder
                                ? `Using supervisor polygon: ${(selectedExistingTreeAreaOrder.area_label || "").trim() || `Assigned area #${selectedExistingTreeAreaOrder.id}`}`
                                : "No reusable supervisor polygon selected"
                              : existingTreeBatchAreaGeojson
                                ? "Polygon captured on map"
                                : "No polygon drawn yet"
                          }
                          readOnly
                        />
                        <small className="tree-form-help">
                          {useAssignedExistingTreeArea
                            ? "The selected supervisor polygon will be stored for this existing-tree batch record."
                            : "Switch map mode to Add Tree, then draw a polygon. One polygon is stored for this existing-tree batch record."}
                        </small>
                      </div>
                    </>
                  )}
                </>
              )}
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
                <select
                  value={activeUser}
                  onChange={(e) => setActiveUser(e.target.value)}
                  disabled={isLockedGreenUserSession}
                  title={isLockedGreenUserSession ? "Logged in user is fixed for this session." : undefined}
                >
                  <option value="">Select staff or custodian</option>
                  {activeActorOptions.map((option) => (
                    <option key={`map-${option.actorType}-${option.id}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="tree-form-row full">
                <label>Notes</label>
                <textarea value={newTree.notes} onChange={(e) => setNewTree({ ...newTree, notes: e.target.value })} />
              </div>
              <div className="tree-form-row full">
                <label>{existingTreeBatchMode && newTree.tree_origin === "existing_inventory" ? "Tree Photos (Multiple) *" : "Tree Photo *"}</label>
                {existingTreeBatchMode && newTree.tree_origin === "existing_inventory" ? (
                  <>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={(e) => void onTreePhotosPicked(e.target.files)}
                    />
                    <small className="tree-photo-hint">Upload one or more photos for this existing-tree area record. At least one photo is required.</small>
                    {treePhotoPreviews.length > 0 && (
                      <div className="green-photo-preview-grid">
                        {treePhotoPreviews.map((src, index) => (
                          <img key={`tree-preview-${index}`} className="tree-photo-preview" src={src} alt={`Tree preview ${index + 1}`} />
                        ))}
                      </div>
                    )}
                    {pendingTreePhotos.length > 0 && (
                      <small className="tree-form-help">{pendingTreePhotos.length} photo(s) selected.</small>
                    )}
                  </>
                ) : (
                  <>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => void onPhotoPicked(e.target.files?.[0] || null)}
                    />
                    <small className="tree-photo-hint">Take or choose one tree photo. A photo is required before you can add this tree.</small>
                    {photoPreview && <img className="tree-photo-preview" src={photoPreview} alt="Tree preview" />}
                  </>
                )}
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
                <div className="green-profile-species">
                  <h4>Trees Planted By Species</h4>
                  {plantedBySpeciesSummary.length === 0 ? (
                    <p className="green-empty">No planted trees recorded yet for this user.</p>
                  ) : (
                    <div className="green-profile-species-list">
                      {plantedBySpeciesSummary.map((item) => (
                        <div key={`profile-species-${item.species}`} className="green-profile-species-row">
                          <span>{item.species}</span>
                          <strong>{item.count}</strong>
                        </div>
                      ))}
                    </div>
                  )}
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
          </>
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
              <h4>Tree #{(inspectedTree as any).project_tree_no || inspectedTree.id}</h4>
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
                  <span>Age (months)</span>
                  <strong>
                    {Number.isFinite(Number((inspectedTree as any).tree_age_months))
                      ? String(Math.round(Number((inspectedTree as any).tree_age_months)))
                      : "-"}
                  </strong>
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
              {(inspectedTree.tree_origin || "new_planting") !== "new_planting" && (
                <div className="green-tree-height-inline">
                  <label>Update Estimated Age (months)</label>
                  <input
                    type="number"
                    min={0}
                    max={2400}
                    step="1"
                    value={
                      treeAgeMonthsDraftById[inspectedTree.id] !== undefined
                        ? treeAgeMonthsDraftById[inspectedTree.id]
                        : (inspectedTree as any).tree_age_months === null ||
                            (inspectedTree as any).tree_age_months === undefined
                          ? ""
                          : String((inspectedTree as any).tree_age_months)
                    }
                    onChange={(e) =>
                      setTreeAgeMonthsDraftById((prev) => ({
                        ...prev,
                        [inspectedTree.id]: e.target.value,
                      }))
                    }
                    placeholder="Estimated age in months (optional)"
                  />
                  <button
                    className="green-btn-outline"
                    type="button"
                    disabled={savingTreeAgeMonthsId === inspectedTree.id}
                    onClick={() => {
                      const value =
                        treeAgeMonthsDraftById[inspectedTree.id] !== undefined
                          ? treeAgeMonthsDraftById[inspectedTree.id]
                          : (inspectedTree as any).tree_age_months === null ||
                              (inspectedTree as any).tree_age_months === undefined
                            ? ""
                            : String((inspectedTree as any).tree_age_months);
                      void updateTreeAgeMonths(inspectedTree.id, value);
                    }}
                  >
                    {savingTreeAgeMonthsId === inspectedTree.id ? "Saving..." : "Save Age"}
                  </button>
                </div>
              )}
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

      {greenPasswordModalOpen && (
        <div className="green-password-overlay" role="dialog" aria-modal="true" aria-labelledby="green-password-modal-title">
          <div className="green-password-modal">
            <div className="green-password-modal-head">
              <strong id="green-password-modal-title">Change Password</strong>
              <button
                type="button"
                className="green-password-close"
                onClick={() => closeGreenPasswordModal()}
                disabled={greenPasswordModalSaving}
                aria-label="Close password dialog"
              >
                X
              </button>
            </div>
            <p className="green-password-note">
              Update your login password for LandCheck Green and LandCheck Work.
            </p>
            <div className="green-password-fields">
              <label>
                Current Password
                <input
                  type={greenPasswordModalShow ? "text" : "password"}
                  value={greenPasswordForm.current_password}
                  onChange={(e) =>
                    setGreenPasswordForm((prev) => ({ ...prev, current_password: e.target.value }))
                  }
                  autoFocus
                  disabled={greenPasswordModalSaving}
                  autoComplete="current-password"
                />
              </label>
              <label>
                New Password
                <input
                  type={greenPasswordModalShow ? "text" : "password"}
                  value={greenPasswordForm.new_password}
                  onChange={(e) => setGreenPasswordForm((prev) => ({ ...prev, new_password: e.target.value }))}
                  disabled={greenPasswordModalSaving}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Confirm New Password
                <input
                  type={greenPasswordModalShow ? "text" : "password"}
                  value={greenPasswordForm.confirm_password}
                  onChange={(e) =>
                    setGreenPasswordForm((prev) => ({ ...prev, confirm_password: e.target.value }))
                  }
                  disabled={greenPasswordModalSaving}
                  autoComplete="new-password"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void submitGreenPasswordChange();
                    }
                  }}
                />
              </label>
            </div>
            <div className="green-password-actions">
              <button
                type="button"
                className="green-btn-outline"
                onClick={() => setGreenPasswordModalShow((prev) => !prev)}
                disabled={greenPasswordModalSaving}
              >
                {greenPasswordModalShow ? "Hide Passwords" : "Show Passwords"}
              </button>
              <div className="green-password-actions-right">
                <button
                  type="button"
                  className="green-btn-outline"
                  onClick={() => closeGreenPasswordModal()}
                  disabled={greenPasswordModalSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="green-btn-primary"
                  onClick={() => void submitGreenPasswordChange()}
                  disabled={greenPasswordModalSaving}
                >
                  {greenPasswordModalSaving ? "Saving..." : "Save Password"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
