import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { api, BACKEND_URL } from "../api/client";
import TreeMap, { type TreeInspectData } from "../components/TreeMap";
import "../styles/green-work.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";

type Project = {
  id: number;
  name: string;
  location_text: string;
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
};

type Tree = {
  id: number;
  lng: number;
  lat: number;
  created_by: string | null;
  status: string;
  species?: string | null;
  planting_date?: string | null;
  notes?: string | null;
  photo_url?: string | null;
};

type WorkTask = {
  id: number;
  tree_id: number;
  task_type: string;
  assignee_name: string;
  status: string;
  review_state?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
  reported_tree_status?: string | null;
  due_date: string | null;
  priority?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
};

type ReviewQueueTask = WorkTask & {
  tree_status?: string | null;
};

type WorkForm =
  | "project_focus"
  | "create_project"
  | "add_user"
  | "users"
  | "assign_work"
  | "assign_task"
  | "review_queue"
  | "overview"
  | "live_table"
  | "verra_reports";
type StaffMenuState = { user: GreenUser; x: number; y: number } | null;
type DrawerFrame = { top: number; left: number; width: number; height: number };
type KpiTrendItem = {
  snapshot_at: string;
  metrics: {
    survival_rate?: number;
    evidence_complete_rate?: number;
    [key: string]: any;
  };
};
type VerraExportHistoryItem = {
  id: number;
  season_mode: string;
  assignee_name: string | null;
  output_format: string;
  monitoring_start: string | null;
  monitoring_end: string | null;
  methodology_id: string | null;
  verifier_notes: string | null;
  generated_by: string | null;
  file_name: string | null;
  payload_summary?: {
    tree_inventory_count?: number;
    task_timeline_count?: number;
    live_maintenance_count?: number;
    co2_current_tonnes?: number;
    co2_projected_lifetime_tonnes?: number;
  } | null;
  created_at: string;
};
type VerraExportFormat = "zip" | "json" | "docx";

const normalizeName = (value: string | null | undefined) => (value || "").trim().toLowerCase();
const normalizeVerraExportFormat = (value: string | null | undefined): VerraExportFormat => {
  const normalized = normalizeName(value);
  if (normalized === "json" || normalized === "docx") return normalized;
  return "zip";
};
const normalizeTreeStatus = (value: string | null | undefined) => {
  const raw = (value || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (raw === "deseas" || raw === "diseased") return "disease";
  if (raw === "needreplacement" || raw === "needsreplacement") return "need_replacement";
  if (raw === "needs_replacement") return "need_replacement";
  return raw || "healthy";
};
const REPLACEMENT_TRIGGER_STATUSES = new Set(["dead", "damaged", "removed", "need_replacement"]);
const HEALTHY_TREE_STATUSES = new Set(["alive", "healthy"]);
const isReplacementTriggerStatus = (value: string | null | undefined) =>
  REPLACEMENT_TRIGGER_STATUSES.has(normalizeTreeStatus(value));
const treeStatusLabel = (value: string | null | undefined) =>
  normalizeTreeStatus(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Unknown";
const formatRoleLabel = (role: string) =>
  role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
const isCompleteStatus = (status: string | null | undefined, reviewState?: string | null | undefined) => {
  const normalized = normalizeName(status);
  const done = normalized === "done" || normalized === "completed" || normalized === "closed";
  if (!done) return false;
  if (reviewState === undefined) return true;
  const review = normalizeName(reviewState || "none");
  return review === "approved" || review === "none";
};
const isOverdueTask = (task: WorkTask) => {
  if (isCompleteStatus(task.status, task.review_state) || !task.due_date) return false;
  const dueDate = new Date(task.due_date);
  if (Number.isNaN(dueDate.getTime())) return false;
  dueDate.setHours(23, 59, 59, 999);
  return dueDate.getTime() < Date.now();
};
const formatDateLabel = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
};
const formatTaskTypeLabel = (value: string | null | undefined) =>
  (value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Task";
const taskSortStamp = (task: WorkTask) => {
  const raw = task.completed_at || task.due_date || task.created_at || "";
  const stamp = raw ? new Date(raw).getTime() : 0;
  return Number.isNaN(stamp) ? 0 : stamp;
};
const parseDateValue = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.length <= 10 ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};
const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
const addDays = (date: Date, days: number) => {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
};
const dayDiff = (target: Date, reference: Date) =>
  Math.round((startOfDay(target).getTime() - startOfDay(reference).getTime()) / 86400000);
const toDateInput = (value: Date | null) => {
  if (!value) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const MAINTENANCE_ACTIVITY_ORDER = ["watering", "weeding", "protection", "inspection", "replacement"] as const;
type MaintenanceActivity = (typeof MAINTENANCE_ACTIVITY_ORDER)[number];
type SeasonMode = "rainy" | "dry";
type TaskDueMode = "model_rainy" | "model_dry" | "manual";
type LiveStatusTone = "danger" | "warning" | "ok" | "info";
type MaintenanceModel = {
  label: string;
  rationale: string;
};

const MAINTENANCE_MODEL: Record<MaintenanceActivity, MaintenanceModel> = {
  watering: {
    label: "Watering",
    rationale: "Early establishment needs frequent moisture checks; interval increases as trees establish.",
  },
  weeding: {
    label: "Weeding",
    rationale: "Heavy control in years 1-2, then reduced cycle once canopy suppression improves.",
  },
  protection: {
    label: "Protection",
    rationale: "Protection checks should be continuous, with tighter monitoring in dry-season risk windows.",
  },
  inspection: {
    label: "Inspection",
    rationale: "Early fortnight check, then monthly in establishment period, then quarterly supervision.",
  },
  replacement: {
    label: "Replacement",
    rationale: "Initial refill around week 6-8 with later mortality checks in follow-up cycles.",
  },
};

const SEASON_LABEL: Record<SeasonMode, string> = {
  rainy: "Rainy Season",
  dry: "Dry Season",
};

const asMaintenanceActivity = (value: string | null | undefined): MaintenanceActivity | null => {
  const key = normalizeName(value) as MaintenanceActivity;
  return MAINTENANCE_ACTIVITY_ORDER.includes(key) ? key : null;
};

const getMaintenanceIntervals = (
  activity: MaintenanceActivity,
  treeAgeDays: number,
  season: SeasonMode,
): { firstDays: number; repeatDays: number } => {
  switch (activity) {
    case "watering":
      return season === "rainy"
        ? { firstDays: 0, repeatDays: treeAgeDays < 90 ? 14 : 21 }
        : { firstDays: 0, repeatDays: treeAgeDays < 90 ? 5 : 7 };
    case "weeding":
      if (season === "rainy") {
        if (treeAgeDays < 365) return { firstDays: 21, repeatDays: 45 };
        if (treeAgeDays < 730) return { firstDays: 30, repeatDays: 90 };
        return { firstDays: 30, repeatDays: 150 };
      }
      if (treeAgeDays < 365) return { firstDays: 35, repeatDays: 90 };
      if (treeAgeDays < 730) return { firstDays: 45, repeatDays: 150 };
      return { firstDays: 45, repeatDays: 210 };
    case "protection":
      return season === "rainy"
        ? { firstDays: 0, repeatDays: 45 }
        : { firstDays: 0, repeatDays: 21 };
    case "inspection":
      return season === "rainy"
        ? { firstDays: 14, repeatDays: treeAgeDays < 180 ? 30 : 90 }
        : { firstDays: 7, repeatDays: treeAgeDays < 180 ? 21 : 60 };
    case "replacement":
      return season === "rainy"
        ? { firstDays: 42, repeatDays: 180 }
        : { firstDays: 56, repeatDays: 210 };
    default:
      return { firstDays: 30, repeatDays: 90 };
  }
};

const dueModeToSeason = (mode: TaskDueMode): SeasonMode | null => {
  if (mode === "model_rainy") return "rainy";
  if (mode === "model_dry") return "dry";
  return null;
};

const getSpeciesMaturityYears = (
  species: string | null | undefined,
  speciesMaturityMap: Record<string, number>,
) => {
  const normalized = normalizeName(species);
  if (!normalized) return null;
  const years = speciesMaturityMap[normalized];
  return Number.isFinite(years) && years > 0 ? years : null;
};

const getLifecycleStartDate = (
  plantingDateObj: Date | null,
  replacementDoneDateObj: Date | null,
) => {
  if (plantingDateObj && replacementDoneDateObj) {
    return replacementDoneDateObj.getTime() > plantingDateObj.getTime() ? replacementDoneDateObj : plantingDateObj;
  }
  return replacementDoneDateObj || plantingDateObj;
};

const LIVE_TABLE_SOURCES = [
  {
    label: "FAO - Forest restoration monitoring and maintenance sequence",
    url: "https://www.fao.org/sustainable-forest-management-toolbox/modules/forest-restoration/en",
  },
  {
    label: "FAO - Post-planting operations (watering, protection, replacement)",
    url: "https://www.fao.org/4/u2247e/u2247e0a.htm",
  },
  {
    label: "FAO - Savanna plantation field maintenance practices (Nigeria-relevant context)",
    url: "https://www.fao.org/4/93269e/93269e03.htm",
  },
  {
    label: "NiMet seasonal outlook context for local onset/dry-period planning",
    url: "https://www.nimet.gov.ng/news?id=94",
  },
];

type LiveMaintenanceRow = {
  key: string;
  treeId: number;
  assignee: string;
  activity: MaintenanceActivity;
  activityLabel: string;
  plantingDate: string | null;
  treeAgeDays: number | null;
  lastDoneAt: string | null;
  modelDueDate: string | null;
  assignedDueDate: string | null;
  effectiveDueDate: string | null;
  countdownDays: number | null;
  tone: LiveStatusTone;
  indicator: string;
  statusText: string;
  doneCount: number;
  pendingCount: number;
  overdueCount: number;
  openTaskId: number | null;
  modelRationale: string;
};

type LiveTreeMenuState = { treeId: number; x: number; y: number; taskType?: string } | null;

const liveToneRank = (tone: LiveStatusTone) => {
  if (tone === "danger") return 0;
  if (tone === "warning") return 1;
  if (tone === "info") return 2;
  return 3;
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

const renderActionIcon = (form: WorkForm) => {
  switch (form) {
    case "overview":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 19h16M7 16V9M12 16V5M17 16v-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "live_table":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M4 6h16v12H4zM4 10h16M9 10v8M15 10v8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="8" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="16.5" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M3.5 19c1-2.6 3.3-4 6.5-4s5.5 1.4 6.5 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "add_user":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="10" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M4 19c1-2.5 3-4 6-4s5 1.5 6 4M18 8v6M15 11h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "assign_work":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 19h16M6 16l3-6 3 3 4-7 2 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "assign_task":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 4h12v16H6zM9 8h6M9 12h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 17l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "review_queue":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 4h12v16H6zM9 9h6M9 13h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 17l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "verra_reports":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 3h9l3 3v15H6zM15 3v3h3M9 10h6M9 14h6M9 18h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
};

const TrendMiniChart = ({
  title,
  color,
  context,
  points,
}: {
  title: string;
  color: string;
  context: string;
  points: Array<{ label: string; value: number }>;
}) => {
  const safePoints = points.length >= 2 ? points : [{ label: "start", value: 0 }, { label: "now", value: 0 }];
  const maxY = Math.max(100, ...safePoints.map((point) => Number(point.value || 0)));
  const minY = 0;
  const width = 420;
  const height = 168;
  const left = 40;
  const right = 14;
  const top = 22;
  const bottom = 36;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const yTicks = [0, 25, 50, 75, 100];
  const xStep = safePoints.length > 1 ? chartWidth / (safePoints.length - 1) : chartWidth;
  const toY = (value: number) => top + (1 - (value - minY) / Math.max(maxY - minY, 1)) * chartHeight;
  const pathData = safePoints
    .map((point, index) => {
      const x = left + xStep * index;
      const y = toY(Number(point.value || 0));
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  const firstLabel = safePoints[0]?.label || "";
  const lastLabel = safePoints[safePoints.length - 1]?.label || "";

  return (
    <div className="green-work-trend-card">
      <div className="green-work-overview-bar-head">
        <h5>{title}</h5>
        <span>{(safePoints[safePoints.length - 1]?.value ?? 0).toFixed(1)}%</span>
      </div>
      <svg className="green-work-trend-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={title}>
        {yTicks.map((tick) => {
          const y = toY(tick);
          return (
            <g key={`${title}-${tick}`}>
              <line x1={left} y1={y} x2={left + chartWidth} y2={y} stroke="#d6e2db" strokeWidth="1" />
              <text x={left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#5f7c70">
                {tick}
              </text>
            </g>
          );
        })}
        <path d={pathData} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {safePoints.map((point, index) => {
          const x = left + xStep * index;
          const y = toY(Number(point.value || 0));
          return <circle key={`${title}-dot-${index}`} cx={x} cy={y} r="3" fill={color} />;
        })}
        <text x={left} y={height - 12} fontSize="10" fill="#5f7c70">
          {firstLabel}
        </text>
        <text x={left + chartWidth} y={height - 12} textAnchor="end" fontSize="10" fill="#5f7c70">
          {lastLabel}
        </text>
      </svg>
      <p className="green-work-chart-context">{context}</p>
    </div>
  );
};

type SpeciesSurvivalPoint = {
  day: number;
  label: string;
  value: number | null;
  eligible: number;
  survived: number;
  provisional: boolean;
  source: string;
};

type SpeciesSurvivalSeries = {
  species: string;
  trees: number;
  color: string;
  points: SpeciesSurvivalPoint[];
};

const SpeciesAgeSurvivalChart = ({
  title,
  context,
  series,
  emptyMessage,
}: {
  title: string;
  context: string;
  series: SpeciesSurvivalSeries[];
  emptyMessage?: string;
}) => {
  const [hovered, setHovered] = useState<{
    species: string;
    trees: number;
    point: SpeciesSurvivalPoint;
    color: string;
  } | null>(null);
  const width = 520;
  const height = 210;
  const left = 46;
  const right = 14;
  const top = 18;
  const bottom = 46;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const yTicks = [0, 20, 40, 60, 80, 100];
  const checkpoints = [30, 90, 180];
  const xForDay = (day: number) => {
    const idx = checkpoints.indexOf(day);
    const pos = idx >= 0 ? idx : 0;
    return left + (pos / Math.max(checkpoints.length - 1, 1)) * chartWidth;
  };
  const yForValue = (value: number) => top + (1 - value / 100) * chartHeight;

  return (
    <div className="green-work-trend-card green-work-species-chart-card">
      <div className="green-work-overview-bar-head">
        <h5>{title}</h5>
        <span>{series.length} species</span>
      </div>
      {series.length === 0 ? (
        <p className="green-work-note">{emptyMessage || "No species with planting dates yet."}</p>
      ) : (
        <>
          <svg
            className="green-work-species-svg"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={title}
          >
            {yTicks.map((tick) => {
              const y = yForValue(tick);
              return (
                <g key={`species-y-${tick}`}>
                  <line x1={left} y1={y} x2={left + chartWidth} y2={y} stroke="#d6e2db" strokeWidth="1" />
                  <text x={left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#5f7c70">
                    {tick}
                  </text>
                </g>
              );
            })}
            {checkpoints.map((day) => {
              const x = xForDay(day);
              return (
                <g key={`species-x-${day}`}>
                  <line x1={x} y1={top} x2={x} y2={top + chartHeight} stroke="#e4ede8" strokeWidth="1" />
                  <text x={x} y={height - 16} textAnchor="middle" fontSize="10" fill="#5f7c70">
                    {day}d
                  </text>
                </g>
              );
            })}
            {series.map((item) => {
              const visible = item.points.filter((point) => point.value !== null && Number.isFinite(point.value));
              const path = visible
                .map((point, idx) => {
                  const x = xForDay(point.day);
                  const y = yForValue(Number(point.value || 0));
                  return `${idx === 0 ? "M" : "L"}${x},${y}`;
                })
                .join(" ");
              return (
                <g key={`species-line-${item.species}`}>
                  {visible.length >= 2 && (
                    <path
                      d={path}
                      fill="none"
                      stroke={item.color}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.9}
                    />
                  )}
                  {visible.map((point) => {
                    const x = xForDay(point.day);
                    const y = yForValue(Number(point.value || 0));
                    return (
                      <circle
                        key={`species-dot-${item.species}-${point.day}`}
                        cx={x}
                        cy={y}
                        r="3.4"
                        fill={point.provisional ? "#ffffff" : item.color}
                        stroke={item.color}
                        strokeWidth={point.provisional ? "1.8" : "1.1"}
                        onMouseEnter={() =>
                          setHovered({
                            species: item.species,
                            trees: item.trees,
                            point,
                            color: item.color,
                          })
                        }
                        onMouseLeave={() => setHovered(null)}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>
          <div className="green-work-species-legend">
            {series.map((item) => (
              <span key={`species-chip-${item.species}`} className="green-work-species-chip">
                <span className="green-work-species-chip-dot" style={{ backgroundColor: item.color }} />
                {item.species} ({item.trees})
              </span>
            ))}
          </div>
          <div className="green-work-species-hover">
            {hovered ? (
              <span>
                <strong style={{ color: hovered.color }}>{hovered.species}</strong> | {hovered.point.label}:{" "}
                {hovered.point.value !== null ? `${hovered.point.value.toFixed(1)}%` : "n/a"} | Cohort{" "}
                {hovered.point.survived}/{hovered.point.eligible} | Trees {hovered.trees} |{" "}
                {hovered.point.provisional ? `Provisional (${hovered.point.source})` : "Checkpoint"}
              </span>
            ) : (
              <span>Hover a point to view species checkpoint details.</span>
            )}
          </div>
        </>
      )}
      <p className="green-work-chart-context">{context}</p>
    </div>
  );
};

export default function GreenWork() {
  const storedProjectIdRaw = typeof window !== "undefined" ? localStorage.getItem("landcheck_work_active_project_id") || "" : "";
  const storedProjectId = Number(storedProjectIdRaw || "0");
  const storedFormRaw = typeof window !== "undefined" ? localStorage.getItem("landcheck_work_active_form") || "" : "";
  const storedAssigneeFilter = typeof window !== "undefined" ? localStorage.getItem("landcheck_work_assignee_filter") || "all" : "all";
  const storedSeason = typeof window !== "undefined" ? localStorage.getItem("landcheck_work_season_mode") || "rainy" : "rainy";
  const allowedForms: WorkForm[] = [
    "project_focus",
    "create_project",
    "add_user",
    "users",
    "assign_work",
    "assign_task",
    "review_queue",
    "overview",
    "live_table",
    "verra_reports",
  ];

  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mapCardRef = useRef<HTMLDivElement | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<GreenUser[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(
    Number.isFinite(storedProjectId) && storedProjectId > 0 ? storedProjectId : null
  );
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(storedAssigneeFilter || "all");
  const [newOrder, setNewOrder] = useState({
    assignee_name: "",
    work_type: "planting",
    target_trees: 0,
    due_date: "",
  });
  const [newUser, setNewUser] = useState({ full_name: "", role: "field_officer" });
  const [newProject, setNewProject] = useState({ name: "", location_text: "", sponsor: "" });
  const [seasonMode, setSeasonMode] = useState<SeasonMode>(storedSeason === "dry" ? "dry" : "rainy");
  const [newTask, setNewTask] = useState<{
    tree_id: string;
    task_type: string;
    assignee_name: string;
    due_mode: TaskDueMode;
    due_date: string;
    priority: string;
    notes: string;
  }>({
    tree_id: "",
    task_type: "watering",
    assignee_name: "",
    due_mode: "model_rainy",
    due_date: "",
    priority: "normal",
    notes: "",
  });
  const [mapView, setMapView] = useState<{ lng: number; lat: number; zoom: number; bearing: number; pitch: number } | null>(null);
  const [inspectedTree, setInspectedTree] = useState<TreeInspectData | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeForm, setActiveForm] = useState<WorkForm | null>(
    allowedForms.includes(storedFormRaw as WorkForm) ? (storedFormRaw as WorkForm) : null
  );
  const [staffMenu, setStaffMenu] = useState<StaffMenuState>(null);
  const [liveTreeMenu, setLiveTreeMenu] = useState<LiveTreeMenuState>(null);
  const [carbonSummary, setCarbonSummary] = useState<{
    current_co2_tonnes: number;
    annual_co2_tonnes: number;
    projected_lifetime_co2_tonnes: number;
    co2_per_tree_avg_kg: number;
    trees_missing_age_data: number;
    trees_with_fallback_age: number;
    trees_pending_review: number;
    top_species: { species: string; model_species?: string; count: number; co2_kg: number }[];
  } | null>(null);
  const [speciesMaturityByProject, setSpeciesMaturityByProject] = useState<Record<string, Record<string, number>>>({});
  const [selectedMaturitySpecies, setSelectedMaturitySpecies] = useState("");
  const [selectedMaturityYears, setSelectedMaturityYears] = useState("3");
  const [treePhotoUploading, setTreePhotoUploading] = useState(false);
  const [drawerFrame, setDrawerFrame] = useState<DrawerFrame | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueTask[]>([]);
  const [alertsSummary, setAlertsSummary] = useState<{ total: number; danger: number; warning: number; info: number }>({
    total: 0,
    danger: 0,
    warning: 0,
    info: 0,
  });
  const [alertsList, setAlertsList] = useState<any[]>([]);
  const [serverLiveRows, setServerLiveRows] = useState<LiveMaintenanceRow[]>([]);
  const [serverLiveSummary, setServerLiveSummary] = useState<{ total: number; danger: number; warning: number; ok: number; info: number; dueSoon: number }>({
    total: 0,
    danger: 0,
    warning: 0,
    ok: 0,
    info: 0,
    dueSoon: 0,
  });
  const [serverLiveSources, setServerLiveSources] = useState<{ label: string; url: string }[]>(LIVE_TABLE_SOURCES);
  const [reviewNoteByTaskId, setReviewNoteByTaskId] = useState<Record<number, string>>({});
  const [kpiTrend, setKpiTrend] = useState<KpiTrendItem[]>([]);
  const [kpiCurrent, setKpiCurrent] = useState<Record<string, any> | null>(null);
  const [verraFilters, setVerraFilters] = useState<{
    monitoring_start: string;
    monitoring_end: string;
    methodology_id: string;
    verifier_notes: string;
    generated_by: string;
    season_mode: SeasonMode;
    assignee_name: string;
  }>({
    monitoring_start: "",
    monitoring_end: "",
    methodology_id: "",
    verifier_notes: "",
    generated_by: "supervisor",
    season_mode: storedSeason === "dry" ? "dry" : "rainy",
    assignee_name: "all",
  });
  const [verraHistory, setVerraHistory] = useState<VerraExportHistoryItem[]>([]);

  const loadProjects = async () => {
    const res = await api.get("/green/projects");
    setProjects(res.data);
  };

  const loadUsers = async () => {
    const res = await api.get("/green/users");
    setUsers(res.data);
  };

  const loadProjectData = async (projectId: number) => {
    const stamp = Date.now();
    const [ordersRes, treesRes, tasksRes, speciesMaturityRes] = await Promise.all([
      api.get(`/green/work-orders?project_id=${projectId}&_ts=${stamp}`),
      api.get(`/green/projects/${projectId}/trees?_ts=${stamp}`),
      api.get(`/green/tasks?project_id=${projectId}&_ts=${stamp}`),
      api.get(`/green/projects/${projectId}/species-maturity?_ts=${stamp}`),
    ]);
    setOrders(ordersRes.data);
    const normalizedTrees = (treesRes.data || [])
      .map((tree: any) => ({
        ...tree,
        lng: Number(tree.lng),
        lat: Number(tree.lat),
      }))
      .filter((tree: any) => Number.isFinite(tree.lng) && Number.isFinite(tree.lat));
    setTrees(normalizedTrees);
    setTasks(Array.isArray(tasksRes.data) ? tasksRes.data : []);
    const serverMapRaw = speciesMaturityRes.data?.map || {};
    const serverMap = Object.entries(serverMapRaw).reduce(
      (acc, [key, value]) => {
        const normalizedKey = normalizeName(key);
        const years = Number(value);
        if (normalizedKey && Number.isFinite(years) && years > 0) {
          acc[normalizedKey] = Math.round(years);
        }
        return acc;
      },
      {} as Record<string, number>,
    );
    setSpeciesMaturityByProject((prev) => ({
      ...prev,
      [String(projectId)]: serverMap,
    }));

    const [reviewQueueRes, alertsRes, carbonRes, kpiRes] = await Promise.allSettled([
      api.get(`/green/tasks/review-queue?project_id=${projectId}&_ts=${stamp}`),
      api.get(`/green/projects/${projectId}/alerts?refresh=true&status=open&_ts=${stamp}`),
      api.get(`/green/projects/${projectId}/carbon-summary?_ts=${stamp}`),
      api.get(`/green/reports/kpi?project_id=${projectId}&days=180&snapshot=true&_ts=${stamp}`),
    ]);

    if (reviewQueueRes.status === "fulfilled") {
      setReviewQueue(Array.isArray(reviewQueueRes.value.data) ? reviewQueueRes.value.data : []);
    } else {
      setReviewQueue([]);
    }

    if (alertsRes.status === "fulfilled") {
      setAlertsList(Array.isArray(alertsRes.value.data?.items) ? alertsRes.value.data.items : []);
      setAlertsSummary({
        total: Number(alertsRes.value.data?.summary?.total || 0),
        danger: Number(alertsRes.value.data?.summary?.danger || 0),
        warning: Number(alertsRes.value.data?.summary?.warning || 0),
        info: Number(alertsRes.value.data?.summary?.info || 0),
      });
    } else {
      setAlertsList([]);
      setAlertsSummary({ total: 0, danger: 0, warning: 0, info: 0 });
    }

    if (carbonRes.status === "fulfilled" && carbonRes.value.data) {
      setCarbonSummary({
        current_co2_tonnes: Number(carbonRes.value.data.current_co2_tonnes || 0),
        annual_co2_tonnes: Number(carbonRes.value.data.annual_co2_tonnes || 0),
        projected_lifetime_co2_tonnes: Number(carbonRes.value.data.projected_lifetime_co2_tonnes || 0),
        co2_per_tree_avg_kg: Number(carbonRes.value.data.co2_per_tree_avg_kg || 0),
        trees_missing_age_data: Number(carbonRes.value.data.trees_missing_age_data || 0),
        trees_with_fallback_age: Number(carbonRes.value.data.trees_with_fallback_age || 0),
        trees_pending_review: Number(carbonRes.value.data.trees_pending_review || 0),
        top_species: Array.isArray(carbonRes.value.data.top_species) ? carbonRes.value.data.top_species : [],
      });
    } else {
      setCarbonSummary(null);
    }

    if (kpiRes.status === "fulfilled" && kpiRes.value.data) {
      const trendRows = Array.isArray(kpiRes.value.data.trend) ? kpiRes.value.data.trend : [];
      setKpiTrend(trendRows);
      setKpiCurrent(kpiRes.value.data.current || null);
    } else {
      setKpiTrend([]);
      setKpiCurrent(null);
    }
  };

  const loadVerraHistory = useCallback(async (projectId: number) => {
    const res = await api.get(`/green/projects/${projectId}/verra/exports?limit=100`);
    setVerraHistory(Array.isArray(res.data) ? res.data : []);
  }, []);

  const loadServerLiveMaintenance = useCallback(
    async (projectId: number, season: SeasonMode, assignee: string) => {
      const query = new URLSearchParams();
      query.set("season_mode", season);
      if (assignee !== "all") {
        query.set("assignee_name", assignee);
      }
      const res = await api.get(`/green/projects/${projectId}/live-maintenance?${query.toString()}`);
      setServerLiveRows(Array.isArray(res.data?.rows) ? res.data.rows : []);
      setServerLiveSummary({
        total: Number(res.data?.summary?.total || 0),
        danger: Number(res.data?.summary?.danger || 0),
        warning: Number(res.data?.summary?.warning || 0),
        ok: Number(res.data?.summary?.ok || 0),
        info: Number(res.data?.summary?.info || 0),
        dueSoon: Number(res.data?.summary?.dueSoon || 0),
      });
      setServerLiveSources(Array.isArray(res.data?.sources) && res.data.sources.length ? res.data.sources : LIVE_TABLE_SOURCES);
    },
    [],
  );

  useEffect(() => {
    loadProjects().catch(() => toast.error("Failed to load projects"));
    loadUsers().catch(() => toast.error("Failed to load users"));
  }, []);

  useEffect(() => {
    if (!projects.length || !activeProjectId) return;
    const exists = projects.some((project) => Number(project.id) === Number(activeProjectId));
    if (!exists) {
      setActiveProjectId(null);
      return;
    }
    void loadProjectData(activeProjectId).catch(() => toast.error("Failed to load project data"));
  }, [projects, activeProjectId]);

  useEffect(() => {
    localStorage.setItem("landcheck_work_active_project_id", activeProjectId ? String(activeProjectId) : "");
  }, [activeProjectId]);

  useEffect(() => {
    localStorage.setItem("landcheck_work_active_form", activeForm || "");
  }, [activeForm]);

  useEffect(() => {
    localStorage.setItem("landcheck_work_assignee_filter", assigneeFilter || "all");
  }, [assigneeFilter]);

  useEffect(() => {
    localStorage.setItem("landcheck_work_season_mode", seasonMode);
  }, [seasonMode]);

  useEffect(() => {
    if (!staffMenu && !liveTreeMenu) return;
    const closeMenu = () => {
      setStaffMenu(null);
      setLiveTreeMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [staffMenu, liveTreeMenu]);

  useEffect(() => {
    if (!activeProjectId || activeForm !== "live_table") return;
    void loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter).catch(() => {});
    const timer = window.setInterval(() => {
      void Promise.all([
        loadProjectData(activeProjectId),
        loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter),
      ]).catch(() => {});
    }, 20000);
    return () => window.clearInterval(timer);
  }, [activeProjectId, activeForm, seasonMode, assigneeFilter, loadServerLiveMaintenance]);

  useEffect(() => {
    if (!activeProjectId || activeForm !== "review_queue") return;
    const timer = window.setInterval(() => {
      void loadProjectData(activeProjectId).catch(() => {});
    }, 12000);
    return () => window.clearInterval(timer);
  }, [activeProjectId, activeForm]);

  useEffect(() => {
    if (!activeProjectId || activeForm !== "verra_reports") return;
    void loadVerraHistory(activeProjectId).catch(() => {});
  }, [activeProjectId, activeForm, loadVerraHistory]);

  const onSelectProject = async (id: number) => {
    setActiveProjectId(id);
    setAssigneeFilter("all");
    setInspectedTree(null);
    await loadProjectData(id);
  };

  const createProject = async () => {
    if (!newProject.name.trim()) {
      toast.error("Project name required");
      return;
    }
    const res = await api.post("/green/projects", newProject);
    setProjects((prev) => [res.data, ...prev]);
    setNewProject({ name: "", location_text: "", sponsor: "" });
    toast.success("Project created");
  };

  const createWorkOrder = async () => {
    if (!activeProjectId) return;
    if (!newOrder.assignee_name.trim()) {
      toast.error("Assignee name required");
      return;
    }
    if (Number(newOrder.target_trees || 0) <= 0) {
      toast.error("Target trees must be greater than 0");
      return;
    }
    try {
      await api.post("/green/work-orders", {
        project_id: activeProjectId,
        ...newOrder,
        work_type: "planting",
      });
      setNewOrder({
        assignee_name: "",
        work_type: "planting",
        target_trees: 0,
        due_date: "",
      });
      await loadProjectData(activeProjectId);
      toast.success("Planting order assigned");
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to assign planting order");
    }
  };

  const createUser = async () => {
    if (!newUser.full_name.trim()) {
      toast.error("Full name required");
      return;
    }
    await api.post("/green/users", newUser);
    setNewUser({ full_name: "", role: "field_officer" });
    await loadUsers();
    toast.success("User added");
  };

  const getModelDueForTreeActivity = (
    treeId: number,
    activity: MaintenanceActivity,
    season: SeasonMode,
    speciesMaturityMap: Record<string, number>,
  ): { dueDate: Date | null; detail: string; blocked: boolean } => {
    const tree = trees.find((item) => Number(item.id) === Number(treeId));
    const plantingDateObj = parseDateValue(tree?.planting_date || null);
    const treeStatus = normalizeTreeStatus(tree?.status || "healthy");
    const replacementRequired = isReplacementTriggerStatus(treeStatus);
    const today = startOfDay(new Date());
    const replacementDoneTasks = tasks
      .filter((task) => Number(task.tree_id) === Number(treeId))
      .filter((task) => asMaintenanceActivity(task.task_type) === "replacement")
      .filter((task) => isCompleteStatus(task.status, task.review_state))
      .sort((a, b) => taskSortStamp(b) - taskSortStamp(a));
    const latestReplacementDoneDate = parseDateValue(
      replacementDoneTasks[0]?.completed_at || replacementDoneTasks[0]?.due_date || replacementDoneTasks[0]?.created_at || null,
    );
    const lifecycleStartDate = getLifecycleStartDate(plantingDateObj, latestReplacementDoneDate);
    const treeAgeDays = lifecycleStartDate ? Math.max(dayDiff(today, lifecycleStartDate), 0) : 0;
    const maturityYears = getSpeciesMaturityYears(tree?.species || null, speciesMaturityMap);
    const maturityReached = HEALTHY_TREE_STATUSES.has(treeStatus) && maturityYears !== null && treeAgeDays >= maturityYears * 365;

    if (replacementRequired && activity !== "replacement") {
      return {
        dueDate: null,
        detail: `Tree status is '${treeStatusLabel(treeStatus)}'. Assign replacement first, then continue maintenance after replanting.`,
        blocked: true,
      };
    }

    if (replacementRequired && activity === "replacement") {
      return {
        dueDate: today,
        detail: `Tree status is '${treeStatusLabel(treeStatus)}'. Replacement is due immediately (today).`,
        blocked: false,
      };
    }

    if (!replacementRequired && activity === "replacement") {
      return {
        dueDate: null,
        detail: `Replacement is condition-triggered only. Current tree status is '${treeStatusLabel(treeStatus)}'.`,
        blocked: true,
      };
    }

    if (maturityReached) {
      return {
        dueDate: null,
        detail: `Tree reached self-sustaining stage (~${maturityYears || "-"} years). Model schedule is closed unless you use custom intervention.`,
        blocked: true,
      };
    }

    const intervals = getMaintenanceIntervals(activity, treeAgeDays, season);
    const doneTasks = tasks
      .filter((task) => Number(task.tree_id) === Number(treeId))
      .filter((task) => asMaintenanceActivity(task.task_type) === activity)
      .filter((task) => isCompleteStatus(task.status, task.review_state))
      .sort((a, b) => taskSortStamp(b) - taskSortStamp(a));

    const latestDone = doneTasks[0] || null;
    const latestDoneDate = parseDateValue(
      latestDone?.completed_at || latestDone?.due_date || latestDone?.created_at || null,
    );

    const dueDate = latestDoneDate
      ? addDays(latestDoneDate, intervals.repeatDays)
      : lifecycleStartDate
        ? addDays(lifecycleStartDate, intervals.firstDays)
        : null;

    const detail = latestDoneDate
      ? `${formatTaskTypeLabel(activity)} model from last completed cycle (+${intervals.repeatDays} days, ${SEASON_LABEL[season]}).`
      : lifecycleStartDate
        ? `${formatTaskTypeLabel(activity)} model from lifecycle start (+${intervals.firstDays} days, ${SEASON_LABEL[season]}).`
        : `No planting date found; choose custom date or set planting date.`;

    return { dueDate, detail, blocked: false };
  };

  const assignTask = async () => {
    if (!activeProjectId) return;
    if (!newTask.tree_id) {
      toast.error("Select a tree");
      return;
    }
    if (!newTask.assignee_name) {
      toast.error("Assign a user");
      return;
    }
    const activity = asMaintenanceActivity(newTask.task_type);
    if (!activity) {
      toast.error("Select a valid maintenance type");
      return;
    }

    let dueDateToSubmit: string | null = null;
    if (newTask.due_mode === "model_rainy" || newTask.due_mode === "model_dry") {
      if (assignTaskModelPreview.blocked) {
        toast.error(assignTaskModelPreview.detail);
        return;
      }
      if (assignTaskModelPreview.isPastDue) {
        toast.error("Model date has passed. Choose Other Date (Custom).");
        return;
      }
      if (!assignTaskModelPreview.dueDateInput) {
        toast.error("Model due date unavailable. Choose custom date or set planting date.");
        return;
      }
      dueDateToSubmit = assignTaskModelPreview.dueDateInput;
    } else {
      if (!newTask.due_date) {
        toast.error("Select custom due date");
        return;
      }
      dueDateToSubmit = newTask.due_date;
    }

    const modelSeason =
      newTask.due_mode === "model_dry"
        ? "dry"
        : newTask.due_mode === "model_rainy"
          ? "rainy"
          : seasonMode;

    await api.post(`/green/trees/${newTask.tree_id}/tasks`, {
      task_type: activity,
      assignee_name: newTask.assignee_name,
      due_date: dueDateToSubmit,
      priority: newTask.priority,
      notes: newTask.notes,
      model_season: modelSeason,
    });
    setNewTask({
      tree_id: "",
      task_type: "watering",
      assignee_name: "",
      due_mode: "model_rainy",
      due_date: "",
      priority: "normal",
      notes: "",
    });
    await loadProjectData(activeProjectId);
    toast.success("Task assigned");
  };

  const reviewSubmittedTask = async (taskId: number, decision: "approve" | "reject") => {
    if (!activeProjectId) return;
    const reviewNote = (reviewNoteByTaskId[taskId] || "").trim();
    if (decision === "reject" && !reviewNote) {
      toast.error("Write a rejection note before rejecting.");
      return;
    }
    const loadingId = toast.loading(decision === "approve" ? "Approving task..." : "Rejecting task...");
    try {
      await api.post(`/green/tasks/${taskId}/review`, {
        decision,
        reviewer_name: "supervisor",
        review_notes: reviewNote || (decision === "approve" ? "Approved by supervisor." : "Rejected. Update evidence and resubmit."),
        season_mode: seasonMode,
      });
      await Promise.all([
        loadProjectData(activeProjectId),
        loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter),
      ]);
      setReviewNoteByTaskId((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      toast.success(decision === "approve" ? "Task approved" : "Task rejected", { id: loadingId });
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to review task", { id: loadingId });
    }
  };

  const reopenApprovedTask = async (taskId: number) => {
    if (!activeProjectId) return;
    const loadingId = toast.loading("Reopening task...");
    try {
      await api.post(`/green/tasks/${taskId}/reopen`, {
        reviewer_name: "supervisor",
        reason: "Reopened for correction.",
      });
      await Promise.all([
        loadProjectData(activeProjectId),
        loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter),
      ]);
      toast.success("Task reopened", { id: loadingId });
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to reopen task", { id: loadingId });
    }
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

  const onInspectedTreePhotoPicked = async (file: File | null) => {
    if (!file || !inspectedTree) return;
    const treeId = inspectedTree.id;
    setTreePhotoUploading(true);
    const loadingId = toast.loading("Uploading tree photo...");
    try {
      const photoUrl = await uploadGreenPhoto(file, "trees", { treeId });
      setInspectedTree((prev) => (prev && prev.id === treeId ? { ...prev, photo_url: photoUrl } : prev));
      if (activeProjectId) {
        await loadProjectData(activeProjectId);
      }
      toast.success("Tree photo updated", { id: loadingId });
    } catch {
      toast.error("Failed to upload tree photo", { id: loadingId });
    } finally {
      setTreePhotoUploading(false);
    }
  };

  const exportWorkCsv = () => {
    if (!activeProjectId) return;
    window.open(`${BACKEND_URL}/green/donor/export/csv?project_id=${activeProjectId}`, "_blank");
  };

  const exportWorkPdf = () => {
    if (!activeProjectId) return;
    const params = new URLSearchParams({
      project_id: String(activeProjectId),
    });
    if (assigneeFilter !== "all") {
      params.set("assignee_name", assigneeFilter);
    }
    if (mapView) {
      params.set("lng", String(mapView.lng));
      params.set("lat", String(mapView.lat));
      params.set("zoom", String(mapView.zoom));
      params.set("bearing", String(mapView.bearing));
      params.set("pitch", String(mapView.pitch));
    }
    window.open(`${BACKEND_URL}/green/work-report/pdf?${params.toString()}`, "_blank");
  };

  const exportWorkVerra = () => {
    if (!activeProjectId) return;
    const quickSeason = verraFilters.season_mode || seasonMode;
    const quickAssignee = verraFilters.assignee_name && verraFilters.assignee_name !== "all"
      ? verraFilters.assignee_name
      : assigneeFilter !== "all"
        ? assigneeFilter
        : "";
    const params = new URLSearchParams({
      project_id: String(activeProjectId),
      season_mode: quickSeason,
      format: "zip",
    });
    if (quickAssignee) {
      params.set("assignee_name", quickAssignee);
    }
    window.open(`${BACKEND_URL}/green/donor/export/verra-vcs?${params.toString()}`, "_blank");
    window.setTimeout(() => {
      void loadVerraHistory(activeProjectId).catch(() => {});
    }, 900);
  };

  const exportVerraPackage = (
    format: VerraExportFormat,
    overrides?: Partial<typeof verraFilters>,
  ) => {
    if (!activeProjectId) return;
    const merged = {
      ...verraFilters,
      ...(overrides || {}),
    };
    const params = new URLSearchParams({
      project_id: String(activeProjectId),
      season_mode: merged.season_mode || "rainy",
      format,
    });
    if (merged.assignee_name && merged.assignee_name !== "all") {
      params.set("assignee_name", merged.assignee_name);
    }
    if (merged.monitoring_start) {
      params.set("monitoring_start", merged.monitoring_start);
    }
    if (merged.monitoring_end) {
      params.set("monitoring_end", merged.monitoring_end);
    }
    if (merged.methodology_id.trim()) {
      params.set("methodology_id", merged.methodology_id.trim());
    }
    if (merged.verifier_notes.trim()) {
      params.set("verifier_notes", merged.verifier_notes.trim());
    }
    if (merged.generated_by.trim()) {
      params.set("generated_by", merged.generated_by.trim());
    }
    window.open(`${BACKEND_URL}/green/donor/export/verra-vcs?${params.toString()}`, "_blank");
    window.setTimeout(() => {
      void loadVerraHistory(activeProjectId).catch(() => {});
    }, 1200);
  };

  const assignees = useMemo(() => {
    const namesByKey = new Map<string, string>();
    const addName = (name: string | null | undefined) => {
      const cleanName = (name || "").trim();
      if (!cleanName) return;
      const key = normalizeName(cleanName);
      if (!namesByKey.has(key)) namesByKey.set(key, cleanName);
    };
    orders.forEach((o) => addName(o.assignee_name));
    trees.forEach((t) => addName(t.created_by));
    tasks.forEach((t) => addName(t.assignee_name));
    users.forEach((u) => addName(u.full_name));
    const sortedNames = Array.from(namesByKey.values()).sort((a, b) => a.localeCompare(b));
    return ["all", ...sortedNames];
  }, [orders, trees, tasks, users]);

  useEffect(() => {
    setVerraFilters((prev) => {
      const assigneeExists = prev.assignee_name === "all" || assignees.includes(prev.assignee_name);
      return {
        ...prev,
        season_mode: prev.season_mode || seasonMode,
        assignee_name: assigneeExists ? prev.assignee_name : "all",
      };
    });
  }, [assignees, seasonMode]);

  const projectSpeciesOptions = useMemo(() => {
    const map = new Map<string, string>();
    trees.forEach((tree) => {
      const raw = String(tree.species || "").trim();
      if (!raw) return;
      const key = normalizeName(raw);
      if (!map.has(key)) map.set(key, raw);
    });
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [trees]);

  const activeProjectMaturityMap = useMemo(() => {
    if (!activeProjectId) return {};
    return speciesMaturityByProject[String(activeProjectId)] || {};
  }, [activeProjectId, speciesMaturityByProject]);

  const speciesMaturityRows = useMemo(
    () =>
      projectSpeciesOptions.map((item) => ({
        ...item,
        years: activeProjectMaturityMap[item.key] ?? null,
      })),
    [projectSpeciesOptions, activeProjectMaturityMap],
  );

  useEffect(() => {
    if (!projectSpeciesOptions.length) {
      setSelectedMaturitySpecies("");
      return;
    }
    const exists = projectSpeciesOptions.some((item) => item.key === selectedMaturitySpecies);
    if (!selectedMaturitySpecies || !exists) {
      const first = projectSpeciesOptions[0];
      setSelectedMaturitySpecies(first.key);
      const currentYears = activeProjectMaturityMap[first.key];
      setSelectedMaturityYears(currentYears ? String(currentYears) : "3");
    }
  }, [projectSpeciesOptions, selectedMaturitySpecies, activeProjectMaturityMap]);

  useEffect(() => {
    if (!selectedMaturitySpecies) {
      setSelectedMaturityYears("3");
      return;
    }
    const currentYears = activeProjectMaturityMap[selectedMaturitySpecies];
    setSelectedMaturityYears(currentYears ? String(currentYears) : "3");
  }, [selectedMaturitySpecies, activeProjectMaturityMap]);

  const saveSpeciesMaturityYears = async () => {
    if (!activeProjectId) return;
    if (!selectedMaturitySpecies) {
      toast.error("Select species");
      return;
    }
    const years = Number(selectedMaturityYears);
    if (!Number.isFinite(years) || years < 1 || years > 15) {
      toast.error("Select years between 1 and 15");
      return;
    }
    const speciesLabel = projectSpeciesOptions.find((item) => item.key === selectedMaturitySpecies)?.label || selectedMaturitySpecies;
    const payload = {
      species_key: selectedMaturitySpecies,
      species_label: speciesLabel,
      maturity_years: Math.round(years),
    };
    try {
      const res = await api.put(`/green/projects/${activeProjectId}/species-maturity`, payload);
      const savedKey = normalizeName(res.data?.species_key || selectedMaturitySpecies);
      const savedYears = Number(res.data?.maturity_years || Math.round(years));
      setSpeciesMaturityByProject((prev) => {
        const projectKey = String(activeProjectId);
        return {
          ...prev,
          [projectKey]: {
            ...(prev[projectKey] || {}),
            [savedKey]: Math.round(savedYears),
          },
        };
      });
      toast.success(`${speciesLabel}: pegged at ${Math.round(savedYears)} years`);
    } catch {
      toast.error("Failed to save species peg years");
    }
  };

  const assignTaskModelPreview = useMemo(() => {
    const activity = asMaintenanceActivity(newTask.task_type);
    const treeId = Number(newTask.tree_id || 0);
    const modelSeason = dueModeToSeason(newTask.due_mode);
    if (!activity || !treeId || !Number.isFinite(treeId)) {
      return {
        dueDate: null as Date | null,
        dueDateInput: "",
        detail: "Select tree and maintenance type.",
        isPastDue: false,
        daysPastDue: 0,
        blocked: false,
      };
    }
    if (!modelSeason) {
      return {
        dueDate: null as Date | null,
        dueDateInput: "",
        detail: "Custom date selected. Choose any due date.",
        isPastDue: false,
        daysPastDue: 0,
        blocked: false,
      };
    }
    const model = getModelDueForTreeActivity(treeId, activity, modelSeason, activeProjectMaturityMap);
    const today = startOfDay(new Date());
    const countdown = model.dueDate ? dayDiff(model.dueDate, today) : null;
    const isPastDue = countdown !== null && countdown < 0;
    return {
      dueDate: model.dueDate,
      dueDateInput: toDateInput(model.dueDate),
      detail: model.detail,
      isPastDue,
      daysPastDue: isPastDue ? Math.abs(countdown || 0) : 0,
      blocked: model.blocked,
    };
  }, [newTask.task_type, newTask.tree_id, newTask.due_mode, tasks, trees, activeProjectMaturityMap]);

  const filteredTrees = useMemo(() => {
    if (assigneeFilter === "all") return trees;
    const key = normalizeName(assigneeFilter);
    return trees.filter((t) => normalizeName(t.created_by) === key);
  }, [trees, assigneeFilter]);

  const fitPoints = useMemo(() => {
    const points = (assigneeFilter === "all"
      ? trees
      : trees.filter((t) => normalizeName(t.created_by) === normalizeName(assigneeFilter))
    ).map((t) => ({ lng: t.lng, lat: t.lat }));
    return points.length ? points : null;
  }, [assigneeFilter, trees]);

  const overviewStaffSummary = useMemo(() => {
    const userByKey = new Map(users.map((user) => [normalizeName(user.full_name), user]));
    const staffNames = assignees.filter((name) => name !== "all");

    return staffNames
      .map((name) => {
        const key = normalizeName(name);
        const linkedUser = userByKey.get(key);
        const userOrders = orders.filter((order) => normalizeName(order.assignee_name) === key);
        const userTasks = tasks.filter((task) => normalizeName(task.assignee_name) === key);
        const plantedTrees = trees.filter((tree) => normalizeName(tree.created_by) === key).length;

        const targetTrees = userOrders.reduce((sum, order) => sum + Number(order.target_trees || 0), 0);
        const pendingOrders = userOrders.filter((order) => !isCompleteStatus(order.status)).length;
        const doneTasks = userTasks.filter((task) => isCompleteStatus(task.status, task.review_state)).length;
        const overdueTasks = userTasks.filter((task) => isOverdueTask(task)).length;
        const pendingTasks = Math.max(userTasks.length - doneTasks - overdueTasks, 0);
        const lastMaintenanceTask = [...userTasks]
          .sort((a, b) => taskSortStamp(b) - taskSortStamp(a))[0];

        const typeStats = new Map<
          string,
          { type: string; total: number; done: number; pending: number; overdue: number; lastDate: string | null }
        >();
        userTasks.forEach((task) => {
          const taskType = task.task_type || "task";
          const typeKey = normalizeName(taskType);
          const current = typeStats.get(typeKey) || {
            type: taskType,
            total: 0,
            done: 0,
            pending: 0,
            overdue: 0,
            lastDate: null,
          };
          current.total += 1;
          if (isCompleteStatus(task.status, task.review_state)) current.done += 1;
          else if (isOverdueTask(task)) current.overdue += 1;
          else current.pending += 1;

          const taskDate = task.completed_at || task.due_date || task.created_at || null;
          if (taskDate) {
            const nextStamp = new Date(taskDate).getTime();
            const currentStamp = current.lastDate ? new Date(current.lastDate).getTime() : 0;
            if (!Number.isNaN(nextStamp) && nextStamp >= currentStamp) {
              current.lastDate = taskDate;
            }
          }
          typeStats.set(typeKey, current);
        });
        const taskTypeBreakdown = Array.from(typeStats.values())
          .sort((a, b) => b.total - a.total)
          .slice(0, 4);

        const recentMaintenance = [...userTasks]
          .sort((a, b) => taskSortStamp(b) - taskSortStamp(a))
          .slice(0, 3)
          .map((task) => ({
            treeId: task.tree_id,
            type: formatTaskTypeLabel(task.task_type),
            status: task.status || "-",
            date: task.completed_at || task.due_date || task.created_at || null,
          }));

        let statusLabel = "No Active Work";
        let statusTone: "danger" | "busy" | "normal" | "idle" = "idle";
        if (overdueTasks > 0) {
          statusLabel = "Needs Attention";
          statusTone = "danger";
        } else if (pendingOrders > 0 || pendingTasks > 0) {
          statusLabel = "In Progress";
          statusTone = "busy";
        } else if (userOrders.length > 0 || userTasks.length > 0 || plantedTrees > 0) {
          statusLabel = "Up To Date";
          statusTone = "normal";
        }

        return {
          name,
          position: linkedUser ? formatRoleLabel(linkedUser.role) : "Position not set",
          orderCount: userOrders.length,
          targetTrees,
          plantedTrees,
          taskTotal: userTasks.length,
          taskDone: doneTasks,
          taskPending: pendingTasks,
          taskOverdue: overdueTasks,
          taskTypeBreakdown,
          recentMaintenance,
          lastMaintenanceType: formatTaskTypeLabel(lastMaintenanceTask?.task_type),
          lastMaintenanceDate: lastMaintenanceTask?.completed_at || lastMaintenanceTask?.due_date || lastMaintenanceTask?.created_at || null,
          statusLabel,
          statusTone,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assignees, users, orders, tasks, trees]);

  const filteredOverviewTasks = useMemo(() => {
    if (assigneeFilter === "all") return tasks;
    const key = normalizeName(assigneeFilter);
    return tasks.filter((task) => normalizeName(task.assignee_name) === key);
  }, [assigneeFilter, tasks]);

  const maintenanceTypeOverview = useMemo(() => {
    const typeStats = new Map<
      string,
      { type: string; total: number; done: number; pending: number; overdue: number; lastDate: string | null }
    >();
    filteredOverviewTasks.forEach((task) => {
      const taskType = task.task_type || "task";
      const key = normalizeName(taskType);
      const current = typeStats.get(key) || {
        type: taskType,
        total: 0,
        done: 0,
        pending: 0,
        overdue: 0,
        lastDate: null,
      };
      current.total += 1;
      if (isCompleteStatus(task.status, task.review_state)) current.done += 1;
      else if (isOverdueTask(task)) current.overdue += 1;
      else current.pending += 1;
      const taskDate = task.completed_at || task.due_date || task.created_at || null;
      if (taskDate) {
        const nextStamp = new Date(taskDate).getTime();
        const currentStamp = current.lastDate ? new Date(current.lastDate).getTime() : 0;
        if (!Number.isNaN(nextStamp) && nextStamp >= currentStamp) {
          current.lastDate = taskDate;
        }
      }
      typeStats.set(key, current);
    });
    return Array.from(typeStats.values()).sort((a, b) => b.total - a.total);
  }, [filteredOverviewTasks]);

  const filteredOverviewSummary = useMemo(() => {
    if (assigneeFilter === "all") return overviewStaffSummary;
    const key = normalizeName(assigneeFilter);
    return overviewStaffSummary.filter((item) => normalizeName(item.name) === key);
  }, [assigneeFilter, overviewStaffSummary]);

  const filteredOverviewTotals = useMemo(() => {
    return filteredOverviewSummary.reduce(
      (acc, item) => {
        acc.orderCount += item.orderCount;
        acc.targetTrees += item.targetTrees;
        acc.plantedTrees += item.plantedTrees;
        acc.taskTotal += item.taskTotal;
        acc.taskDone += item.taskDone;
        acc.taskPending += item.taskPending;
        acc.taskOverdue += item.taskOverdue;
        return acc;
      },
      {
        orderCount: 0,
        targetTrees: 0,
        plantedTrees: 0,
        taskTotal: 0,
        taskDone: 0,
        taskPending: 0,
        taskOverdue: 0,
      },
    );
  }, [filteredOverviewSummary]);

  const liveMaintenanceRows = useMemo<LiveMaintenanceRow[]>(() => {
    const today = startOfDay(new Date());
    const assigneeKey = assigneeFilter === "all" ? "" : normalizeName(assigneeFilter);
    const relevantTasks = assigneeKey
      ? tasks.filter((task) => normalizeName(task.assignee_name) === assigneeKey)
      : tasks;

    const taskBuckets = new Map<string, WorkTask[]>();
    relevantTasks.forEach((task) => {
      const typeKey = asMaintenanceActivity(task.task_type);
      if (!typeKey) return;
      const key = `${task.tree_id}:${typeKey}`;
      const bucket = taskBuckets.get(key);
      if (bucket) bucket.push(task);
      else taskBuckets.set(key, [task]);
    });

    const scopedTrees =
      assigneeFilter === "all"
        ? trees
        : trees.filter((tree) => {
            const ownerMatch = normalizeName(tree.created_by) === assigneeKey;
            if (ownerMatch) return true;
            return MAINTENANCE_ACTIVITY_ORDER.some((activity) =>
              taskBuckets.has(`${tree.id}:${activity}`)
            );
          });

    const rows: LiveMaintenanceRow[] = [];
    scopedTrees.forEach((tree) => {
      const treeStatus = normalizeTreeStatus(tree.status || "healthy");
      if (treeStatus === "pending_planting") {
        return;
      }
      const replacementRequired = isReplacementTriggerStatus(treeStatus);
      const plantingDateObj = parseDateValue(tree.planting_date);
      const replacementTaskBucket = [...(taskBuckets.get(`${tree.id}:replacement`) || [])];
      const replacementDoneTasks = replacementTaskBucket
        .filter((task) => isCompleteStatus(task.status, task.review_state))
        .sort((a, b) => taskSortStamp(b) - taskSortStamp(a));
      const latestReplacementDoneDate = parseDateValue(
        replacementDoneTasks[0]?.completed_at || replacementDoneTasks[0]?.due_date || replacementDoneTasks[0]?.created_at || null,
      );
      const lifecycleStartDate = getLifecycleStartDate(plantingDateObj, latestReplacementDoneDate);
      const treeAgeDays = lifecycleStartDate ? Math.max(dayDiff(today, lifecycleStartDate), 0) : null;
      const assignee = tree.created_by || "-";
      const maturityYears = getSpeciesMaturityYears(tree.species || null, activeProjectMaturityMap);
      const maturityReached =
        HEALTHY_TREE_STATUSES.has(treeStatus) &&
        treeAgeDays !== null &&
        maturityYears !== null &&
        treeAgeDays >= maturityYears * 365;

      MAINTENANCE_ACTIVITY_ORDER.forEach((activity) => {
        if (activity === "replacement" && !replacementRequired) {
          return;
        }
        const model = MAINTENANCE_MODEL[activity];
        const bucket = [...(taskBuckets.get(`${tree.id}:${activity}`) || [])];
        const doneTasks = bucket.filter((task) => isCompleteStatus(task.status, task.review_state));
        const notDoneTasks = bucket.filter((task) => !isCompleteStatus(task.status, task.review_state));
        const overdueTasks = notDoneTasks.filter((task) => isOverdueTask(task));

        const latestDone = doneTasks.sort((a, b) => taskSortStamp(b) - taskSortStamp(a))[0] || null;
        const activeTask =
          notDoneTasks
            .slice()
            .sort((a, b) => {
              const aDate = parseDateValue(a.due_date || a.created_at || null);
              const bDate = parseDateValue(b.due_date || b.created_at || null);
              const aStamp = aDate ? aDate.getTime() : Number.MAX_SAFE_INTEGER;
              const bStamp = bDate ? bDate.getTime() : Number.MAX_SAFE_INTEGER;
              return aStamp - bStamp;
            })[0] || null;

        const latestDoneDate = parseDateValue(latestDone?.completed_at || latestDone?.due_date || latestDone?.created_at || null);
        const intervals = getMaintenanceIntervals(activity, Math.max(treeAgeDays || 0, 0), seasonMode);
        let modelDue = latestDoneDate
          ? addDays(latestDoneDate, intervals.repeatDays)
          : lifecycleStartDate
            ? addDays(lifecycleStartDate, intervals.firstDays)
            : null;
        if (replacementRequired) {
          modelDue = activity === "replacement" ? today : null;
        } else if (treeStatus === "need_watering" && activity === "watering") {
          modelDue = today;
        } else if (treeStatus === "need_protection" && activity === "protection") {
          modelDue = today;
        }
        if (maturityReached && activity !== "replacement") {
          modelDue = null;
        }
        const assignedDue = parseDateValue(activeTask?.due_date || null);

        let effectiveDue: Date | null = null;
        if (modelDue && assignedDue) {
          effectiveDue = modelDue.getTime() <= assignedDue.getTime() ? modelDue : assignedDue;
        } else {
          effectiveDue = modelDue || assignedDue;
        }

        const countdownDays = effectiveDue ? dayDiff(effectiveDue, today) : null;

        let tone: LiveStatusTone = "ok";
        let indicator = "On schedule";
        let statusText = "No open task";

        if (replacementRequired && activity !== "replacement") {
          tone = "danger";
          indicator = `Tree status '${treeStatusLabel(treeStatus)}' requires replacement`;
          statusText = activeTask ? `Task #${activeTask.id} paused until replacement` : "Paused until replacement/replant";
        } else if (replacementRequired && activity === "replacement") {
          statusText = activeTask ? `Task #${activeTask.id} ${activeTask.status || "pending"}` : "Assign replacement now";
          if (activeTask) {
            if (countdownDays !== null && countdownDays < 0) {
              tone = "danger";
              indicator = `Replacement overdue by ${Math.abs(countdownDays)} day${Math.abs(countdownDays) === 1 ? "" : "s"}`;
            } else if (countdownDays !== null && countdownDays <= 3) {
              tone = "warning";
              indicator = `Replacement due in ${countdownDays} day${countdownDays === 1 ? "" : "s"}`;
            } else {
              tone = "warning";
              indicator = "Replacement assigned";
            }
          } else {
            tone = "danger";
            indicator = "Replacement required immediately";
          }
        } else if (treeStatus === "need_watering" && activity === "watering") {
          tone = activeTask ? "warning" : "danger";
          indicator = "Inspection flagged need watering";
          statusText = activeTask ? `Task #${activeTask.id} ${activeTask.status || "pending"}` : "Action required";
        } else if (treeStatus === "need_protection" && activity === "protection") {
          tone = activeTask ? "warning" : "danger";
          indicator = "Inspection flagged need protection";
          statusText = activeTask ? `Task #${activeTask.id} ${activeTask.status || "pending"}` : "Action required";
        } else if (maturityReached) {
          statusText = "Self-sustaining stage reached";
          if (notDoneTasks.length > 0) {
            tone = "warning";
            indicator = `Lifecycle complete (~${maturityYears || "-"} years), close pending tasks`;
          } else {
            tone = "ok";
            indicator = `Lifecycle complete (~${maturityYears || "-"} years)`;
          }
        } else if (!lifecycleStartDate && !activeTask) {
          tone = "info";
          indicator = "Lifecycle start date missing";
          statusText = "Set planting date or replacement completion date";
        } else if (activeTask) {
          statusText = `Task #${activeTask.id} ${activeTask.status || "pending"}`;
          if (countdownDays !== null && countdownDays < 0) {
            tone = "danger";
            indicator = `Overdue by ${Math.abs(countdownDays)} day${Math.abs(countdownDays) === 1 ? "" : "s"}`;
          } else if (countdownDays !== null && countdownDays <= 3) {
            tone = "warning";
            indicator = `Due in ${countdownDays} day${countdownDays === 1 ? "" : "s"}`;
          } else {
            tone = "warning";
            indicator = "Assigned and in progress";
          }
        } else if (countdownDays !== null && countdownDays < 0) {
          tone = "danger";
          indicator = `Not done, overdue by ${Math.abs(countdownDays)} day${Math.abs(countdownDays) === 1 ? "" : "s"}`;
          statusText = "No open task assigned";
        } else if (countdownDays !== null && countdownDays <= 7) {
          tone = "warning";
          indicator = `Due in ${countdownDays} day${countdownDays === 1 ? "" : "s"}`;
          statusText = "Upcoming window";
        } else if (doneTasks.length > 0) {
          tone = "ok";
          indicator = "Cycle completed";
          statusText = "Waiting for next cycle";
        }

        rows.push({
          key: `${tree.id}-${activity}`,
          treeId: tree.id,
          assignee,
          activity,
          activityLabel: model.label,
          plantingDate: tree.planting_date || null,
          treeAgeDays,
          lastDoneAt: latestDone?.completed_at || latestDone?.due_date || latestDone?.created_at || null,
          modelDueDate: modelDue ? modelDue.toISOString() : null,
          assignedDueDate: assignedDue ? assignedDue.toISOString() : null,
          effectiveDueDate: effectiveDue ? effectiveDue.toISOString() : null,
          countdownDays,
          tone,
          indicator,
          statusText,
          doneCount: doneTasks.length,
          pendingCount: notDoneTasks.length,
          overdueCount: overdueTasks.length,
          openTaskId: activeTask?.id || null,
          modelRationale:
            activity === "replacement"
              ? "Replacement is condition-triggered (dead/damaged/removed/needs replacement), not a routine cyclical task."
              : `${model.rationale} ${SEASON_LABEL[seasonMode]}: first ${intervals.firstDays}d, repeat ${intervals.repeatDays}d.${
                  latestReplacementDoneDate ? " Lifecycle reset from latest replacement completion." : ""
                }`,
        });
      });
    });

    return rows.sort((a, b) => {
      const toneDiff = liveToneRank(a.tone) - liveToneRank(b.tone);
      if (toneDiff !== 0) return toneDiff;
      const aCountdown = a.countdownDays ?? Number.MAX_SAFE_INTEGER;
      const bCountdown = b.countdownDays ?? Number.MAX_SAFE_INTEGER;
      if (aCountdown !== bCountdown) return aCountdown - bCountdown;
      if (a.treeId !== b.treeId) return a.treeId - b.treeId;
      return a.activityLabel.localeCompare(b.activityLabel);
    });
  }, [assigneeFilter, tasks, trees, seasonMode, activeProjectMaturityMap]);

  const liveMaintenanceSummary = useMemo(() => {
    return liveMaintenanceRows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.tone === "danger") acc.danger += 1;
        if (row.tone === "warning") acc.warning += 1;
        if (row.tone === "ok") acc.ok += 1;
        if (row.tone === "info") acc.info += 1;
        if (row.countdownDays !== null && row.countdownDays <= 7 && row.countdownDays >= 0) acc.dueSoon += 1;
        return acc;
      },
      { total: 0, danger: 0, warning: 0, ok: 0, info: 0, dueSoon: 0 },
    );
  }, [liveMaintenanceRows]);

  const effectiveLiveRows = useMemo(
    () => (serverLiveRows.length ? serverLiveRows : liveMaintenanceRows),
    [serverLiveRows, liveMaintenanceRows],
  );
  const effectiveLiveSummary = useMemo(
    () => (serverLiveRows.length ? serverLiveSummary : liveMaintenanceSummary),
    [serverLiveRows.length, serverLiveSummary, liveMaintenanceSummary],
  );

  const activeProjectActions: Array<{ form: WorkForm; title: string; note: string }> = [
    { form: "overview", title: "Overview", note: "Progress + map summary" },
    { form: "live_table", title: "Live Maintenance", note: "Cycle due table + alerts" },
    { form: "verra_reports", title: "Verra Reports", note: "VCS package + history" },
    { form: "review_queue", title: "Review Queue", note: "Approve or reject submissions" },
    { form: "users", title: "Users Board", note: "All staff status and roles" },
    { form: "add_user", title: "Add Staff", note: "Create new user profile" },
    { form: "assign_work", title: "Planting Orders", note: "Assign tree planting targets" },
    { form: "assign_task", title: "Maintenance", note: "Assign maintenance tasks" },
  ];

  const userWorkSummary = useMemo(() => {
    return users
      .map((user) => {
        const userKey = normalizeName(user.full_name);
        const userOrders = orders.filter((order) => normalizeName(order.assignee_name) === userKey);
        const userTasks = tasks.filter((task) => normalizeName(task.assignee_name) === userKey);
        const plantedTrees = trees.filter((tree) => normalizeName(tree.created_by) === userKey).length;

        const targetTrees = userOrders.reduce((sum, order) => sum + Number(order.target_trees || 0), 0);
        const pendingOrders = userOrders.filter((order) => !isCompleteStatus(order.status)).length;
        const doneTasks = userTasks.filter((task) => isCompleteStatus(task.status, task.review_state)).length;
        const pendingTasks = userTasks.filter((task) => !isCompleteStatus(task.status, task.review_state)).length;

        let statusLabel = "No Active Work";
        let statusTone: "busy" | "normal" | "idle" = "idle";
        if (pendingOrders > 0 || pendingTasks > 0) {
          statusLabel = "In Progress";
          statusTone = "busy";
        } else if (userOrders.length > 0 || userTasks.length > 0) {
          statusLabel = "Up To Date";
          statusTone = "normal";
        }

        return {
          user,
          position: formatRoleLabel(user.role),
          orderCount: userOrders.length,
          targetTrees,
          plantedTrees,
          totalTasks: userTasks.length,
          doneTasks,
          pendingTasks,
          statusLabel,
          statusTone,
        };
      })
      .sort((a, b) => a.user.full_name.localeCompare(b.user.full_name));
  }, [users, orders, tasks, trees]);

  const calcProgress = (value: number, target: number) => {
    if (!target || target <= 0) return 0;
    return Math.min((value / target) * 100, 100);
  };
  const plantingCompletionPct = calcProgress(filteredOverviewTotals.plantedTrees, filteredOverviewTotals.targetTrees);
  const taskDonePct = calcProgress(filteredOverviewTotals.taskDone, filteredOverviewTotals.taskTotal);
  const taskPendingPct = calcProgress(filteredOverviewTotals.taskPending, filteredOverviewTotals.taskTotal);
  const taskOverduePct = calcProgress(filteredOverviewTotals.taskOverdue, filteredOverviewTotals.taskTotal);

  const trendPoints = useMemo(() => {
    const toLabel = (iso: string) => {
      if (!iso) return "";
      const parsed = new Date(iso);
      if (Number.isNaN(parsed.getTime())) return iso.slice(0, 10);
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      return `${month}/${day}`;
    };
    const healthyNow = trees.filter((tree) => HEALTHY_TREE_STATUSES.has(normalizeTreeStatus(tree.status))).length;
    const fallbackSurvival =
      Number(kpiCurrent?.survival_rate || 0) ||
      (trees.length > 0 ? Math.round((healthyNow / trees.length) * 1000) / 10 : 0);
    const fallbackEvidence = Number(kpiCurrent?.evidence_complete_rate || 0) || 0;

    const source = Array.isArray(kpiTrend) ? kpiTrend : [];
    const compact = source.length > 18
      ? source.filter((_, index) => {
          const step = Math.max(Math.ceil((source.length - 1) / 17), 1);
          return index % step === 0 || index === source.length - 1;
        })
      : source;
    const survival = compact
      .map((item) => ({
        label: toLabel(String(item.snapshot_at || "")),
        value: Number(item.metrics?.survival_rate || 0),
      }))
      .filter((item) => Number.isFinite(item.value));
    const evidence = compact
      .map((item) => ({
        label: toLabel(String(item.snapshot_at || "")),
        value: Number(item.metrics?.evidence_complete_rate || 0),
      }))
      .filter((item) => Number.isFinite(item.value));

    return {
      survival:
        survival.length >= 2
          ? survival
          : [
              { label: "start", value: fallbackSurvival },
              { label: "now", value: fallbackSurvival },
            ],
      evidence:
        evidence.length >= 2
          ? evidence
          : [
              { label: "start", value: fallbackEvidence },
              { label: "now", value: fallbackEvidence },
            ],
    };
  }, [kpiTrend, kpiCurrent, trees]);

  const ageSurvivalCheckpoints = useMemo(() => {
    const age = (kpiCurrent?.age_survival || {}) as any;
    return [30, 90, 180].map((day) => {
      const bucket = age?.[`day_${day}`] || {};
      return {
        day,
        survivalRate: Number(bucket?.survival_rate || 0),
        survivedTrees: Number(bucket?.survived_trees || 0),
        eligibleTrees: Number(bucket?.eligible_trees || 0),
      };
    });
  }, [kpiCurrent]);
  const ageSurvivalMissingPlantingDate = useMemo(() => {
    const age = (kpiCurrent?.age_survival || {}) as any;
    return Number(age?.trees_missing_planting_date || 0);
  }, [kpiCurrent]);
  const speciesMissingPlantingFromTrees = useMemo(
    () => trees.reduce((sum, tree) => (parseDateValue(tree?.planting_date || null) ? sum : sum + 1), 0),
    [trees],
  );
  const speciesAgeSurvivalSeries = useMemo(() => {
    const age = (kpiCurrent?.age_survival || {}) as any;
    const checkpoints = [30, 90, 180];
    const rawRows = Array.isArray(age?.species_breakdown) ? age.species_breakdown : [];

    const toSeriesRows = (rows: any[], source: "server" | "client_fallback") =>
      rows
        .map((row: any) => {
          const species = String(row?.species_label || row?.species_key || "Unknown Species");
          const treesRaw = Number(row?.trees_with_planting_date ?? row?.current_total_trees ?? 0);
          const trees = Number.isFinite(treesRaw) ? treesRaw : 0;
          const checkpointSource =
            source === "server"
              ? "measured at checkpoint"
              : "estimated from current status (fallback when KPI snapshot is unavailable)";
          const provisionalSource =
            source === "server"
              ? "carried from earlier checkpoint/live"
              : "estimated carry-forward from current status (fallback)";
          const liveRateRaw = Number(row?.current_survival_rate);
          const liveRate = Number.isFinite(liveRateRaw) ? liveRateRaw : 0;
          let carryRate = liveRate;
          const points = checkpoints.map((day) => {
            const bucket = row?.[`day_${day}`] || {};
            const eligible = Number(bucket?.eligible_trees || 0);
            const survived = Number(bucket?.survived_trees || 0);
            const rawRate = Number(bucket?.survival_rate);
            if (eligible > 0 && Number.isFinite(rawRate)) {
              carryRate = rawRate;
              return {
                day,
                label: `${day}d`,
                value: rawRate,
                eligible,
                survived,
                provisional: source !== "server",
                source: checkpointSource,
              };
            }
            return {
              day,
              label: `${day}d`,
              value: carryRate,
              eligible,
              survived,
              provisional: true,
              source: day === 30 ? "live current status (before first checkpoint)" : provisionalSource,
            };
          });
          return {
            species,
            trees,
            points,
          };
        })
        .filter((row: any) => row.trees > 0)
        .sort((a: any, b: any) => {
          if (b.trees !== a.trees) return b.trees - a.trees;
          return String(a.species).localeCompare(String(b.species));
        });

    const fallbackRows = (() => {
      const speciesMap = new Map<string, any>();
      const today = startOfDay(new Date());
      for (const tree of trees) {
        const plantingDateObj = parseDateValue(tree?.planting_date || null);
        if (!plantingDateObj) continue;
        const speciesRaw = String(tree?.species || "").trim();
        const speciesLabel = speciesRaw || "Unknown Species";
        const speciesKey = normalizeName(speciesLabel) || "__unknown__";
        const statusValue = normalizeTreeStatus(tree?.status || "healthy");
        const isHealthy = HEALTHY_TREE_STATUSES.has(statusValue);
        const ageDays = Math.max(dayDiff(today, plantingDateObj), 0);
        if (!speciesMap.has(speciesKey)) {
          speciesMap.set(speciesKey, {
            species_key: speciesKey,
            species_label: speciesLabel,
            trees_with_planting_date: 0,
            current_total_trees: 0,
            current_healthy_trees: 0,
            current_survival_rate: 0,
            day_30: { eligible_trees: 0, survived_trees: 0, survival_rate: 0 },
            day_90: { eligible_trees: 0, survived_trees: 0, survival_rate: 0 },
            day_180: { eligible_trees: 0, survived_trees: 0, survival_rate: 0 },
          });
        }
        const row = speciesMap.get(speciesKey);
        row.trees_with_planting_date += 1;
        row.current_total_trees += 1;
        if (isHealthy) row.current_healthy_trees += 1;
        for (const checkpointDay of checkpoints) {
          if (ageDays < checkpointDay) continue;
          const bucket = row[`day_${checkpointDay}`];
          bucket.eligible_trees += 1;
          if (isHealthy) bucket.survived_trees += 1;
        }
      }
      const computedRows = Array.from(speciesMap.values());
      for (const row of computedRows) {
        for (const checkpointDay of checkpoints) {
          const bucket = row[`day_${checkpointDay}`];
          const eligible = Number(bucket?.eligible_trees || 0);
          const survived = Number(bucket?.survived_trees || 0);
          bucket.survival_rate = eligible > 0 ? Math.round((survived / eligible) * 1000) / 10 : 0;
        }
        const total = Number(row.current_total_trees || 0);
        const healthy = Number(row.current_healthy_trees || 0);
        row.current_survival_rate = total > 0 ? Math.round((healthy / total) * 1000) / 10 : 0;
      }
      return computedRows;
    })();

    const serverRows = toSeriesRows(rawRows, "server");
    const baseRows = serverRows.length > 0 ? serverRows : toSeriesRows(fallbackRows, "client_fallback");

    const palette = [
      "#16a34a",
      "#0ea5e9",
      "#f97316",
      "#8b5cf6",
      "#dc2626",
      "#0891b2",
      "#7c3aed",
      "#15803d",
      "#b45309",
      "#334155",
      "#0f766e",
      "#4338ca",
      "#a21caf",
      "#ea580c",
      "#65a30d",
      "#0284c7",
    ];
    return baseRows.map((row: any, idx: number) => ({
      ...row,
      color: palette[idx % palette.length],
    }));
  }, [kpiCurrent, trees]);
  const speciesAgeSurvivalEmptyMessage = useMemo(() => {
    if (speciesAgeSurvivalSeries.length > 0) return "";
    if (trees.length === 0) return "No trees in this project yet.";
    const missingCount = ageSurvivalMissingPlantingDate > 0 ? ageSurvivalMissingPlantingDate : speciesMissingPlantingFromTrees;
    if (missingCount > 0) {
      return `No species lines yet: ${missingCount} tree(s) are missing planting date.`;
    }
    return "Species lines are not available yet. Refresh project data to load KPI checkpoints.";
  }, [speciesAgeSurvivalSeries, trees, ageSurvivalMissingPlantingDate, speciesMissingPlantingFromTrees]);

  const activeProjectName = useMemo(() => {
    if (!activeProjectId) return "";
    return projects.find((p) => p.id === activeProjectId)?.name || "";
  }, [activeProjectId, projects]);
  const showSidebar =
    activeForm !== null &&
    activeForm !== "overview" &&
    activeForm !== "live_table" &&
    activeForm !== "verra_reports";
  const overviewMode = Boolean(activeProjectId && activeForm === "overview");
  const liveTableMode = Boolean(activeProjectId && activeForm === "live_table");
  const verraMode = Boolean(activeProjectId && activeForm === "verra_reports");
  const activeTreeId = inspectedTree?.id || 0;

  const recalcDrawerFrame = useCallback(() => {
    const menuButton = menuButtonRef.current;
    const mapCard = mapCardRef.current;
    if (!menuButton || !mapCard) return;

    const menuRect = menuButton.getBoundingClientRect();
    const mapRect = mapCard.getBoundingClientRect();
    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 720;

    const top = Math.round(Math.max(8, menuRect.bottom + 8));
    const width = Math.round(Math.min(340, Math.max(260, viewportWidth - 16)));
    const left = Math.round(Math.max(8, Math.min(menuRect.left, viewportWidth - width - 8)));
    const bottom = Math.round(Math.min(viewportHeight - 8, mapRect.bottom));
    const height = Math.max(260, bottom - top);

    const next: DrawerFrame = { top, left, width, height };
    setDrawerFrame((prev) => {
      if (
        prev &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.height === next.height
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(recalcDrawerFrame);
    return () => window.cancelAnimationFrame(frame);
  }, [recalcDrawerFrame, activeProjectId, activeForm, overviewMode, menuOpen, activeTreeId, showSidebar]);

  useEffect(() => {
    const onViewportChange = () => {
      window.requestAnimationFrame(recalcDrawerFrame);
    };
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [recalcDrawerFrame]);

  const drawerStyle = drawerFrame
    ? {
        top: `${drawerFrame.top}px`,
        left: `${drawerFrame.left}px`,
        width: `${drawerFrame.width}px`,
        height: `${drawerFrame.height}px`,
      }
    : undefined;

  const openForm = (form: WorkForm) => {
    setActiveForm(form);
    setMenuOpen(false);
    setStaffMenu(null);
    setLiveTreeMenu(null);
  };

  const openAssignWorkForUser = (userName: string) => {
    if (!activeProjectId) {
      toast("Select an active project first.");
      setStaffMenu(null);
      setLiveTreeMenu(null);
      return;
    }
    setNewOrder((prev) => ({ ...prev, assignee_name: userName }));
    setActiveForm("assign_work");
    setMenuOpen(false);
    setStaffMenu(null);
    setLiveTreeMenu(null);
  };

  const openAssignTaskForUser = (userName: string) => {
    if (!activeProjectId) {
      toast("Select an active project first.");
      setStaffMenu(null);
      setLiveTreeMenu(null);
      return;
    }
    setNewTask((prev) => ({ ...prev, assignee_name: userName }));
    setActiveForm("assign_task");
    setMenuOpen(false);
    setStaffMenu(null);
    setLiveTreeMenu(null);
  };

  const openAssignTaskForTree = (treeId: number, preferredTaskType?: string) => {
    if (!activeProjectId) {
      toast("Select an active project first.");
      setLiveTreeMenu(null);
      return;
    }
    const tree = trees.find((entry) => Number(entry.id) === Number(treeId));
    const owner = tree?.created_by || "";
    const ownerExists = owner
      ? users.some((u) => normalizeName(u.full_name) === normalizeName(owner))
      : false;
    const treeStatus = normalizeTreeStatus(tree?.status || "healthy");
    const replacementRequired = isReplacementTriggerStatus(treeStatus);
    setNewTask((prev) => ({
      ...prev,
      tree_id: String(treeId),
      assignee_name: ownerExists ? owner : prev.assignee_name,
      task_type: replacementRequired ? "replacement" : (preferredTaskType || prev.task_type),
    }));
    setActiveForm("assign_task");
    setMenuOpen(false);
    setLiveTreeMenu(null);
    const pickedType = replacementRequired ? "replacement" : (preferredTaskType || "maintenance");
    toast.success(`Tree #${treeId} ready. ${formatTaskTypeLabel(pickedType)} prefilled.`);
  };

  return (
    <div className="green-work-container">
      <Toaster position="top-right" />
      <header className="green-work-header">
        <div className="green-work-header-inner">
          <div className="green-work-brand">
            <img src={GREEN_LOGO_SRC} alt="LandCheck Green" />
          </div>
          <div className="green-work-title">
            <h1>LandCheck Work</h1>
            <span>Assignments & Progress</span>
          </div>
        </div>
      </header>

      <div className="green-work-toolbar-wrap">
        <div className="green-work-toolbar">
          <button
            className="green-work-menu-btn"
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Open forms menu"
            ref={menuButtonRef}
          >
            <span />
            <span />
            <span />
          </button>
          <span className="green-work-toolbar-label">Menu</span>
          {activeProjectName && <span className="green-work-project-chip">{activeProjectName}</span>}
        </div>
      </div>

      {activeProjectId && (
        <div className="green-work-active-hub-wrap">
          <div className="green-work-active-hub">
            <div className="green-work-active-hub-head">
              <span className="green-work-active-hub-kicker">Active Project</span>
              <strong>{activeProjectName}</strong>
              <p>Select an action to continue.</p>
            </div>
            <div className="green-work-action-grid">
              {activeProjectActions.map((action) => (
                <button
                  key={action.form}
                  type="button"
                  className={`green-work-action-card ${activeForm === action.form ? "active" : ""}`}
                  onClick={() => openForm(action.form)}
                >
                  <span className="green-work-action-icon" aria-hidden="true">
                    {renderActionIcon(action.form)}
                  </span>
                  <span className="green-work-action-copy">
                    <span className="green-work-action-title-row">
                      <span>{action.title}</span>
                      {action.form === "live_table" && (
                        <span className="green-work-live-badge" aria-label="Live monitoring active">
                          <span className="green-work-live-badge-dot" aria-hidden="true" />
                          Live
                        </span>
                      )}
                    </span>
                    <small>{action.note}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {menuOpen && (
        <button
          type="button"
          className="green-work-menu-overlay"
          onClick={() => setMenuOpen(false)}
          aria-label="Close forms menu"
        />
      )}

      <aside className={`green-work-menu-drawer ${menuOpen ? "open" : ""}`} style={drawerStyle}>
        <div className="green-work-menu-head">
          <strong>Forms Menu</strong>
          <button className="green-work-menu-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            X
          </button>
        </div>
        <button
          className={`green-work-menu-item ${activeForm === "project_focus" ? "active" : ""}`}
          type="button"
          onClick={() => openForm("project_focus")}
        >
          Project Focus
        </button>
        <button
          className={`green-work-menu-item ${activeForm === "create_project" ? "active" : ""}`}
          type="button"
          onClick={() => openForm("create_project")}
        >
          Create Project
        </button>
        {activeProjectId ? (
          <div className="green-work-menu-group">
            <p className="green-work-menu-subhead">Active Project Actions</p>
            <p className="green-work-menu-subproject">{activeProjectName}</p>
            <button
              className={`green-work-menu-item ${activeForm === "overview" ? "active" : ""}`}
              type="button"
              onClick={() => openForm("overview")}
            >
              Overview
            </button>
            <button
              className={`green-work-menu-item ${activeForm === "live_table" ? "active" : ""}`}
              type="button"
              onClick={() => openForm("live_table")}
            >
              Live Maintenance Table
            </button>
            <button
              className={`green-work-menu-item ${activeForm === "verra_reports" ? "active" : ""}`}
              type="button"
              onClick={() => openForm("verra_reports")}
            >
              Verra Reports
            </button>
            <button
              className={`green-work-menu-item ${activeForm === "review_queue" ? "active" : ""}`}
              type="button"
              onClick={() => openForm("review_queue")}
            >
              Review Queue ({reviewQueue.length})
            </button>
            <button
              className={`green-work-menu-item ${activeForm === "users" ? "active" : ""}`}
              type="button"
              onClick={() => openForm("users")}
            >
              Users
            </button>
            <button
              className={`green-work-menu-item ${activeForm === "add_user" ? "active" : ""}`}
              type="button"
              onClick={() => openForm("add_user")}
            >
              Add User
            </button>
            <button
              className={`green-work-menu-item ${activeForm === "assign_work" ? "active" : ""}`}
              type="button"
              onClick={() => openForm("assign_work")}
            >
              Assign Tree Planting
            </button>
            <button
              className={`green-work-menu-item ${activeForm === "assign_task" ? "active" : ""}`}
              type="button"
              onClick={() => openForm("assign_task")}
            >
              Assign Maintenance Task
            </button>
          </div>
        ) : (
          <p className="green-work-menu-note">Select active project in Project Focus to enable assignment actions.</p>
        )}
      </aside>

      <div className={`green-work-content ${showSidebar ? "with-sidebar" : "no-sidebar"}`}>
        <aside className="green-work-sidebar">
          {activeForm === "project_focus" && (
            <div className="green-work-card">
              <h3>Project Focus</h3>
              <select
                onChange={async (e) => {
                  const value = e.target.value;
                  if (!value) {
                    setActiveProjectId(null);
                    setOrders([]);
                    setTrees([]);
                    setTasks([]);
                    setAssigneeFilter("all");
                    setInspectedTree(null);
                    return;
                  }
                  await onSelectProject(Number(value));
                }}
                value={activeProjectId || ""}
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {!activeProjectId && <p className="green-work-note">Select a project to load dashboard data.</p>}
            </div>
          )}

          {activeForm === "create_project" && (
            <div className="green-work-card">
              <h3>Create Project</h3>
              <input
                placeholder="Project name"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              />
              <input
                placeholder="Location"
                value={newProject.location_text}
                onChange={(e) => setNewProject({ ...newProject, location_text: e.target.value })}
              />
              <input
                placeholder="Sponsor"
                value={newProject.sponsor}
                onChange={(e) => setNewProject({ ...newProject, sponsor: e.target.value })}
              />
              <button className="btn-primary" onClick={createProject}>
                Create Project
              </button>
            </div>
          )}

          {activeForm === "add_user" && (
            <div className="green-work-card">
              <h3>Add User</h3>
              <input
                placeholder="Full name"
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
              />
              <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="admin">Admin</option>
                <option value="field_officer">Field Officer</option>
                <option value="volunteer">Volunteer</option>
                <option value="viewer">Viewer</option>
              </select>
              <button className="btn-primary" onClick={createUser}>
                Add User
              </button>
            </div>
          )}

          {activeForm === "users" && (
            <div className="green-work-card">
              <h3>Users & Staff</h3>
              {!activeProjectId && <p className="green-work-note">Select project focus to load full assignment status.</p>}
              <p className="green-work-note">Right-click a staff row to assign tree planting or maintenance.</p>
              {userWorkSummary.length === 0 && <p className="green-work-note">No users found.</p>}
              <div className="staff-list">
                {userWorkSummary.map((item) => (
                  <button
                    key={item.user.id}
                    type="button"
                    className="staff-row"
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (!activeProjectId) {
                        toast("Select an active project first.");
                        return;
                      }
                      setLiveTreeMenu(null);
                      setStaffMenu({ user: item.user, x: event.clientX, y: event.clientY });
                    }}
                  >
                    <div className="staff-row-head">
                      <strong>{item.user.full_name}</strong>
                      <span>{item.position}</span>
                    </div>
                    <div className="staff-row-meta">
                      Planting: {item.orderCount} orders | Target: {item.targetTrees} | Planted: {item.plantedTrees}
                    </div>
                    <div className="staff-row-meta">
                      Maintenance: {item.totalTasks} tasks | Done: {item.doneTasks} | Pending: {item.pendingTasks}
                    </div>
                    <div className={`staff-row-status ${item.statusTone}`}>{item.statusLabel}</div>
                    <div className="progress-bar">
                      <span style={{ width: `${calcProgress(item.plantedTrees, item.targetTrees)}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeForm === "assign_work" && (
            <div className="green-work-card">
              <h3>Assign Tree Planting</h3>
              {!activeProjectId && <p className="green-work-note">Select project first from Project Focus.</p>}
              <select
                value={newOrder.assignee_name}
                onChange={(e) => setNewOrder({ ...newOrder, assignee_name: e.target.value })}
                disabled={!activeProjectId}
              >
                <option value="">Select assignee</option>
                {users.map((u) => (
                  <option key={u.id} value={u.full_name}>
                    {u.full_name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Target trees"
                value={newOrder.target_trees}
                onChange={(e) => setNewOrder({ ...newOrder, target_trees: Number(e.target.value) })}
                disabled={!activeProjectId}
              />
              <input
                type="date"
                value={newOrder.due_date}
                onChange={(e) => setNewOrder({ ...newOrder, due_date: e.target.value })}
                disabled={!activeProjectId}
              />
              <button className="btn-primary" onClick={createWorkOrder} disabled={!activeProjectId}>
                Assign Work
              </button>
            </div>
          )}

          {activeForm === "assign_task" && (
            <div className="green-work-card">
              <h3>Assign Maintenance Task</h3>
              {!activeProjectId && <p className="green-work-note">Select project first from Project Focus.</p>}
              <select
                value={newTask.tree_id}
                onChange={(e) => setNewTask({ ...newTask, tree_id: e.target.value })}
                disabled={!activeProjectId}
              >
                <option value="">Select tree</option>
                {trees.map((t) => (
                  <option key={t.id} value={t.id}>
                    Tree #{t.id}
                  </option>
                ))}
              </select>
              <select
                value={newTask.task_type}
                onChange={(e) => setNewTask({ ...newTask, task_type: e.target.value })}
                disabled={!activeProjectId}
              >
                <option value="watering">Watering</option>
                <option value="weeding">Weeding</option>
                <option value="protection">Protection</option>
                <option value="inspection">Inspection</option>
                <option value="replacement">Replacement</option>
              </select>
              <select
                value={newTask.assignee_name}
                onChange={(e) => setNewTask({ ...newTask, assignee_name: e.target.value })}
                disabled={!activeProjectId}
              >
                <option value="">Assign to</option>
                {users.map((u) => (
                  <option key={u.id} value={u.full_name}>
                    {u.full_name}
                  </option>
                ))}
              </select>
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                disabled={!activeProjectId}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
              <select
                value={newTask.due_mode}
                onChange={(e) => setNewTask({ ...newTask, due_mode: e.target.value as TaskDueMode })}
                disabled={!activeProjectId}
              >
                <option value="model_rainy">Date Based On Model (Rainy Season)</option>
                <option value="model_dry">Date Based On Model (Dry Season)</option>
                <option value="manual">Other Date (Custom)</option>
              </select>
              {newTask.due_mode !== "manual" ? (
                <>
                  <input type="date" value={assignTaskModelPreview.dueDateInput} readOnly disabled />
                  <p className="green-work-note">{assignTaskModelPreview.detail}</p>
                  {assignTaskModelPreview.blocked && (
                    <p className="green-work-note danger">Model cannot auto-schedule this case. Choose Other Date (Custom).</p>
                  )}
                  {assignTaskModelPreview.isPastDue && (
                    <p className="green-work-note danger">
                      Model date passed by {assignTaskModelPreview.daysPastDue} day
                      {assignTaskModelPreview.daysPastDue === 1 ? "" : "s"}. Select Other Date (Custom).
                    </p>
                  )}
                  <p className="green-work-note">Model is computed from selected maintenance type and season.</p>
                </>
              ) : (
                <input
                  type="date"
                  value={newTask.due_date}
                  onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                  disabled={!activeProjectId}
                />
              )}
              <textarea
                placeholder="Notes"
                value={newTask.notes}
                onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
                disabled={!activeProjectId}
              />
              <button className="btn-primary" onClick={assignTask} disabled={!activeProjectId}>
                Assign Task
              </button>
            </div>
          )}

          {activeForm === "review_queue" && (
            <div className="green-work-card">
              <div className="green-work-row">
                <h3>Supervisor Review Queue</h3>
                {activeProjectId && (
                  <div className="work-actions">
                    <button type="button" onClick={() => void loadProjectData(activeProjectId)}>
                      Refresh
                    </button>
                  </div>
                )}
              </div>
              {!activeProjectId && <p className="green-work-note">Select project first from Project Focus.</p>}
              {activeProjectId && reviewQueue.length === 0 && <p className="green-work-note">No submitted tasks awaiting review.</p>}
              <div className="staff-list">
                {reviewQueue.map((task) => (
                  <div key={task.id} className="staff-row">
                    <div className="staff-row-head">
                      <strong>
                        Task #{task.id} - {formatTaskTypeLabel(task.task_type)}
                      </strong>
                      <span>{task.assignee_name || "-"}</span>
                    </div>
                    <div className="staff-row-meta">
                      Tree #{task.tree_id} | Due: {formatDateLabel(task.due_date)} | Priority: {task.priority || "normal"}
                    </div>
                    <div className="staff-row-meta">
                      Review: {task.review_state || "none"} | Submitted: {formatDateLabel(task.submitted_at || task.created_at)}
                    </div>
                    {task.reported_tree_status && (
                      <div className="staff-row-meta">
                        Reported condition: {formatTaskTypeLabel(task.reported_tree_status)}
                      </div>
                    )}
                    {task.review_notes && (
                      <div className="staff-row-meta">Latest supervisor note: {task.review_notes}</div>
                    )}
                    <div className="staff-row-meta">
                      Evidence: {task.photo_url ? "photo" : "no-photo"} / {task.notes ? "notes" : "no-notes"}
                    </div>
                    {task.photo_url && (
                      <div className="green-work-review-photo">
                        <img src={toDisplayPhotoUrl(task.photo_url)} alt={`Task ${task.id} evidence`} />
                      </div>
                    )}
                    <textarea
                      placeholder="Supervisor note (required for reject)"
                      value={reviewNoteByTaskId[task.id] ?? task.review_notes ?? ""}
                      onChange={(e) =>
                        setReviewNoteByTaskId((prev) => ({
                          ...prev,
                          [task.id]: e.target.value,
                        }))
                      }
                    />
                    <div className="work-actions">
                      <button type="button" onClick={() => void reviewSubmittedTask(task.id, "approve")}>
                        Approve
                      </button>
                      <button type="button" onClick={() => void reviewSubmittedTask(task.id, "reject")}>
                        Reject
                      </button>
                      {normalizeName(task.review_state) === "approved" && (
                        <button type="button" onClick={() => void reopenApprovedTask(task.id)}>
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className={`green-work-main ${overviewMode || liveTableMode || verraMode ? "overview-mode" : "single-mode"}`}>
          {activeProjectId && activeForm === "overview" && (
            <div className="green-work-card green-work-overview-card">
              <div className="green-work-row">
                <h3>Project Overview</h3>
                <div className="work-actions">
                  <button onClick={exportWorkCsv}>Export CSV</button>
                  <button onClick={exportWorkPdf}>Export PDF</button>
                  <button onClick={exportWorkVerra}>Export Verra VCS</button>
                  <select
                    value={assigneeFilter}
                    onChange={(e) => setAssigneeFilter(e.target.value)}
                  >
                    {assignees.map((a) => (
                      <option key={a} value={a}>
                        {a === "all" ? "All staff" : a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="green-work-task-summary green-work-overview-summary">
                <h4>{assigneeFilter === "all" ? "All Staff Overview" : `${assigneeFilter} Overview`}</h4>
                <div className="green-work-task-summary-stats">
                  <span>Staff: {filteredOverviewSummary.length}</span>
                  <span>Orders: {filteredOverviewTotals.orderCount}</span>
                  <span>Target Trees: {filteredOverviewTotals.targetTrees}</span>
                  <span>Planted: {filteredOverviewTotals.plantedTrees}</span>
                  <span>Tasks: {filteredOverviewTotals.taskTotal}</span>
                  <span>Done: {filteredOverviewTotals.taskDone}</span>
                  <span>Pending: {filteredOverviewTotals.taskPending}</span>
                  <span>Overdue: {filteredOverviewTotals.taskOverdue}</span>
                </div>
                <div className="green-work-task-summary-stats">
                  <span>Open Alerts: {alertsSummary.total}</span>
                  <span>Danger: {alertsSummary.danger}</span>
                  <span>Warning: {alertsSummary.warning}</span>
                  <span>Info: {alertsSummary.info}</span>
                  <span>Awaiting Review: {reviewQueue.length}</span>
                </div>
              </div>
              {alertsList.length > 0 && (
                <div className="green-work-card">
                  <h4>Live Alerts</h4>
                  <div className="green-work-note">
                    {alertsList.slice(0, 5).map((alert: any) => (
                      <p key={alert.id}>
                        [{String(alert.severity || "warning").toUpperCase()}] {alert.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <div className="green-work-overview-bars">
                <div className="green-work-overview-bar-card">
                  <div className="green-work-overview-bar-head">
                    <h5>Planting Completion</h5>
                    <span>{Math.round(plantingCompletionPct)}%</span>
                  </div>
                  <div className="progress-bar">
                    <span style={{ width: `${plantingCompletionPct}%` }} />
                  </div>
                  <p>
                    {filteredOverviewTotals.plantedTrees} planted out of {filteredOverviewTotals.targetTrees} target trees.
                  </p>
                  <p className="green-work-chart-context">Context: shown for the current staff filter.</p>
                </div>
                <div className="green-work-overview-bar-card">
                  <div className="green-work-overview-bar-head">
                    <h5>Task Completion Mix</h5>
                    <span>{Math.round(taskDonePct)}% done</span>
                  </div>
                  <div className="progress-stack">
                    <span className="stack done" style={{ width: `${taskDonePct}%` }} />
                    <span className="stack pending" style={{ width: `${taskPendingPct}%` }} />
                    <span className="stack overdue" style={{ width: `${taskOverduePct}%` }} />
                  </div>
                  <div className="green-work-overview-legend">
                    <span className="done">Done</span>
                    <span className="pending">Pending</span>
                    <span className="overdue">Overdue</span>
                  </div>
                  <p className="green-work-chart-context">
                    Context: percentages use all tasks in scope (status + review state).
                  </p>
                </div>
                <div className="green-work-overview-bar-card">
                  <div className="green-work-overview-bar-head">
                    <h5>Maintenance Type Activity</h5>
                    <span>{maintenanceTypeOverview.length} types</span>
                  </div>
                  {maintenanceTypeOverview.length === 0 ? (
                    <p>No maintenance tasks recorded for this filter yet.</p>
                  ) : (
                    <div className="green-work-maint-type-list">
                      {maintenanceTypeOverview.slice(0, 5).map((item) => (
                        <div key={normalizeName(item.type)} className="green-work-maint-type-item">
                          <strong>{formatTaskTypeLabel(item.type)}</strong>
                          <span>Times: {item.total}</span>
                          <span>
                            Done/Pending/Overdue: {item.done}/{item.pending}/{item.overdue}
                          </span>
                          <span>Last date: {formatDateLabel(item.lastDate)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="green-work-overview-bar-card">
                  <div className="green-work-overview-bar-head">
                    <h5>Age-Based Survival</h5>
                    <span>30/90/180 days</span>
                  </div>
                  <div className="green-work-maint-type-list">
                    {ageSurvivalCheckpoints.map((item) => (
                      <div key={`age-survival-${item.day}`} className="green-work-maint-type-item">
                        <strong>Day {item.day}</strong>
                        <span>
                          Survival: {item.eligibleTrees > 0 ? `${item.survivalRate.toFixed(1)}%` : "n/a"}
                        </span>
                        <span>
                          Cohort: {item.survivedTrees}/{item.eligibleTrees} surviving
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="green-work-chart-context">
                    Context: trees eligible once planted for at least the checkpoint age.
                  </p>
                  {ageSurvivalMissingPlantingDate > 0 && (
                    <p className="green-work-chart-context">
                      {ageSurvivalMissingPlantingDate} tree(s) excluded because planting date is missing.
                    </p>
                  )}
                </div>
              </div>

              <div className="green-work-overview-trends">
                <TrendMiniChart
                  title="Survival Trend (Planting Cohorts)"
                  color="#16a34a"
                  points={trendPoints.survival}
                  context="Context: monthly cumulative healthy share from planting cohorts (planting date + current status basis)."
                />
                <TrendMiniChart
                  title="Evidence Trend (Task Activity)"
                  color="#9a5800"
                  points={trendPoints.evidence}
                  context="Context: monthly cumulative completion of required-proof task evidence."
                />
              </div>
              <SpeciesAgeSurvivalChart
                title="Species Survival Lines (30/90/180-day checkpoints)"
                series={speciesAgeSurvivalSeries}
                emptyMessage={speciesAgeSurvivalEmptyMessage}
                context="Context: each line is one species from planting date; before each checkpoint the value is provisional, then it pegs to the reached checkpoint rate. Trees older than 180 days are included in the 180-day checkpoint."
              />

              {carbonSummary && (
                <div className="green-work-carbon-panel">
                  <h4>Carbon Impact Summary</h4>
                  <p className="green-work-chart-context">
                    Context: current/annual are stock-flow estimates; projection is long-term modeled potential.
                  </p>
                  <div className="green-work-carbon-grid">
                    <div className="green-work-carbon-stat">
                      <span className="green-work-carbon-val">{carbonSummary.current_co2_tonnes.toFixed(1)}</span>
                      <span className="green-work-carbon-lbl">tonnes CO2 sequestered</span>
                    </div>
                    <div className="green-work-carbon-stat">
                      <span className="green-work-carbon-val">{carbonSummary.annual_co2_tonnes.toFixed(1)}</span>
                      <span className="green-work-carbon-lbl">tonnes CO2 / year</span>
                    </div>
                    <div className="green-work-carbon-stat accent">
                      <span className="green-work-carbon-val">{carbonSummary.projected_lifetime_co2_tonnes.toFixed(0)}</span>
                      <span className="green-work-carbon-lbl">tonnes projected (40yr)</span>
                    </div>
                    <div className="green-work-carbon-stat">
                      <span className="green-work-carbon-val">{carbonSummary.co2_per_tree_avg_kg.toFixed(1)}</span>
                      <span className="green-work-carbon-lbl">kg CO2 avg/tree</span>
                    </div>
                  </div>
                  {(carbonSummary.current_co2_tonnes <= 0 || carbonSummary.projected_lifetime_co2_tonnes <= 0) && (
                    <p className="green-work-carbon-warning">
                      CO2 is low/zero. Check tree planting dates and review status.
                      {carbonSummary.trees_missing_age_data > 0 &&
                        ` Missing age data: ${carbonSummary.trees_missing_age_data}.`}
                      {carbonSummary.trees_pending_review > 0 &&
                        ` Pending review: ${carbonSummary.trees_pending_review}.`}
                    </p>
                  )}
                  {carbonSummary.top_species.length > 0 && (
                    <div className="green-work-carbon-species">
                      <h5>Top Species by CO2 Contribution</h5>
                      {carbonSummary.top_species.slice(0, 5).map((sp) => (
                        <div key={sp.species} className="green-work-carbon-sp-row">
                          <span className="green-work-carbon-sp-name">
                            {sp.species}
                            {sp.model_species && normalizeName(sp.model_species) !== normalizeName(sp.species) && (
                              <small className="green-work-carbon-sp-model">model: {sp.model_species}</small>
                            )}
                          </span>
                          <span className="green-work-carbon-sp-count">{sp.count} trees</span>
                          <span className="green-work-carbon-sp-co2">{sp.co2_kg.toFixed(1)} kg CO2</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="green-work-carbon-method">Methodology: IPCC Tier 1 + Chave et al. (2014) pantropical allometric equation</p>
                </div>
              )}

              <div className="green-work-stats green-work-staff-overview">
                {filteredOverviewSummary.length === 0 && (
                  <p className="green-work-note">No staff overview data for the selected filter.</p>
                )}
                {filteredOverviewSummary.map((staff) => (
                  <div key={staff.name} className="stat-card staff-overview-card">
                    <div className="staff-overview-head">
                      <h4>{staff.name}</h4>
                      <span className={`staff-overview-status ${staff.statusTone}`}>{staff.statusLabel}</span>
                    </div>
                    <p className="staff-overview-position">{staff.position}</p>
                    <p>Planting Orders: {staff.orderCount}</p>
                    <p>Target Trees: {staff.targetTrees} | Planted: {staff.plantedTrees}</p>
                    <div className="progress-bar">
                      <span style={{ width: `${calcProgress(staff.plantedTrees, staff.targetTrees)}%` }} />
                    </div>
                    <p>Assigned Tasks: {staff.taskTotal}</p>
                    <p>Done: {staff.taskDone} | Pending: {staff.taskPending} | Overdue: {staff.taskOverdue}</p>
                    <p>
                      Last Maintenance: {staff.lastMaintenanceType} on {formatDateLabel(staff.lastMaintenanceDate)}
                    </p>
                    <div className="progress-stack">
                      <span className="stack done" style={{ width: `${calcProgress(staff.taskDone, staff.taskTotal)}%` }} />
                      <span
                        className="stack pending"
                        style={{ width: `${calcProgress(staff.taskPending, staff.taskTotal)}%` }}
                      />
                      <span
                        className="stack overdue"
                        style={{ width: `${calcProgress(staff.taskOverdue, staff.taskTotal)}%` }}
                      />
                    </div>
                    <div className="staff-overview-types">
                      {staff.taskTypeBreakdown.length === 0 ? (
                        <span className="staff-overview-type-chip">No maintenance types yet</span>
                      ) : (
                        staff.taskTypeBreakdown.map((typeItem: any) => (
                          <span key={`${staff.name}-${normalizeName(typeItem.type)}`} className="staff-overview-type-chip">
                            {formatTaskTypeLabel(typeItem.type)}: {typeItem.total}
                          </span>
                        ))
                      )}
                    </div>
                    {staff.recentMaintenance.length > 0 && (
                      <div className="staff-overview-recent">
                        <strong>Recent Maintenance</strong>
                        {staff.recentMaintenance.map((entry: any, idx: number) => (
                          <p key={`${staff.name}-${entry.treeId}-${idx}`}>
                            Tree #{entry.treeId} | {entry.type} | {entry.status} | {formatDateLabel(entry.date)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeProjectId && activeForm === "verra_reports" && (
            <div className="green-work-card green-work-verra-card">
              <div className="green-work-row">
                <h3>Verra Reports</h3>
                <div className="work-actions">
                  <button type="button" onClick={() => exportVerraPackage("zip")}>
                    Export Verra ZIP
                  </button>
                  <button type="button" onClick={() => exportVerraPackage("json")}>
                    Export Verra JSON
                  </button>
                  <button type="button" onClick={() => exportVerraPackage("docx")}>
                    Export Verra DOCX
                  </button>
                  <button type="button" onClick={() => void loadVerraHistory(activeProjectId)}>
                    Refresh History
                  </button>
                </div>
              </div>

              <p className="green-work-chart-context">
                Use monitoring-period and verifier metadata filters before export. Every export is logged under this project for one-click rerun.
              </p>

              <div className="green-work-verra-filters">
                <label>
                  Monitoring Start
                  <input
                    type="date"
                    value={verraFilters.monitoring_start}
                    onChange={(e) => setVerraFilters((prev) => ({ ...prev, monitoring_start: e.target.value }))}
                  />
                </label>
                <label>
                  Monitoring End
                  <input
                    type="date"
                    value={verraFilters.monitoring_end}
                    onChange={(e) => setVerraFilters((prev) => ({ ...prev, monitoring_end: e.target.value }))}
                  />
                </label>
                <label>
                  Season Model
                  <select
                    value={verraFilters.season_mode}
                    onChange={(e) =>
                      setVerraFilters((prev) => ({
                        ...prev,
                        season_mode: (e.target.value === "dry" ? "dry" : "rainy") as SeasonMode,
                      }))
                    }
                  >
                    <option value="rainy">Rainy Season</option>
                    <option value="dry">Dry Season</option>
                  </select>
                </label>
                <label>
                  Staff Scope
                  <select
                    value={verraFilters.assignee_name}
                    onChange={(e) => setVerraFilters((prev) => ({ ...prev, assignee_name: e.target.value }))}
                  >
                    {assignees.map((a) => (
                      <option key={`verra-assignee-${a}`} value={a}>
                        {a === "all" ? "All staff" : a}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Methodology ID
                  <input
                    type="text"
                    placeholder="e.g. VM0047"
                    value={verraFilters.methodology_id}
                    onChange={(e) => setVerraFilters((prev) => ({ ...prev, methodology_id: e.target.value }))}
                  />
                </label>
                <label>
                  Generated By
                  <input
                    type="text"
                    placeholder="Supervisor name"
                    value={verraFilters.generated_by}
                    onChange={(e) => setVerraFilters((prev) => ({ ...prev, generated_by: e.target.value }))}
                  />
                </label>
                <label className="is-wide">
                  Verifier-ready Notes
                  <textarea
                    rows={3}
                    placeholder="Notes for verifier package context..."
                    value={verraFilters.verifier_notes}
                    onChange={(e) => setVerraFilters((prev) => ({ ...prev, verifier_notes: e.target.value }))}
                  />
                </label>
              </div>

              <div className="green-work-verra-history">
                <h4>Project Export History</h4>
                {verraHistory.length === 0 ? (
                  <p className="green-work-note">No Verra export history yet for this project.</p>
                ) : (
                  <div className="green-work-live-table-wrap">
                    <table className="green-work-live-table green-work-verra-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Period</th>
                          <th>Methodology</th>
                          <th>Scope</th>
                          <th>Format</th>
                          <th>Summary</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verraHistory.map((item) => {
                          const periodText =
                            item.monitoring_start || item.monitoring_end
                              ? `${item.monitoring_start || "..."} to ${item.monitoring_end || "..."}`
                              : "Full project";
                          const summary = item.payload_summary || {};
                          return (
                            <tr key={`verra-history-${item.id}`}>
                              <td>{formatDateLabel(item.created_at)}</td>
                              <td>{periodText}</td>
                              <td>{item.methodology_id || "-"}</td>
                              <td>{item.assignee_name || "All staff"}</td>
                              <td>{String(item.output_format || "zip").toUpperCase()}</td>
                              <td>
                                Trees {Number(summary.tree_inventory_count || 0)} | Tasks {Number(summary.task_timeline_count || 0)}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="green-work-live-tree-link"
                                  onClick={() =>
                                    exportVerraPackage(
                                      normalizeVerraExportFormat(item.output_format),
                                      {
                                        monitoring_start: item.monitoring_start || "",
                                        monitoring_end: item.monitoring_end || "",
                                        methodology_id: item.methodology_id || "",
                                        verifier_notes: item.verifier_notes || "",
                                        generated_by: item.generated_by || "supervisor",
                                        season_mode: (String(item.season_mode || "rainy").toLowerCase() === "dry"
                                          ? "dry"
                                          : "rainy") as SeasonMode,
                                        assignee_name: item.assignee_name || "all",
                                      },
                                    )
                                  }
                                >
                                  Export again
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeProjectId && activeForm === "live_table" && (
            <div className="green-work-card green-work-live-card">
              <div className="green-work-row">
                <h3 className="green-work-live-title">
                  <span className="green-work-live-title-text">Live Maintenance Table</span>
                  <span className="green-work-live-title-indicator" aria-label="Live monitoring active">
                    <span className="green-work-live-title-dot" aria-hidden="true" />
                    <span className="green-work-live-title-wave" aria-hidden="true" />
                    Live Monitoring
                  </span>
                </h3>
                <div className="work-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void Promise.all([
                        loadProjectData(activeProjectId),
                        loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter),
                      ])
                    }
                  >
                    Refresh
                  </button>
                  <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                    {assignees.map((a) => (
                      <option key={a} value={a}>
                        {a === "all" ? "All staff" : a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="green-work-live-season-row">
                <label htmlFor="green-work-live-season-select">Season Model</label>
                <select
                  id="green-work-live-season-select"
                  value={seasonMode}
                  onChange={(e) => setSeasonMode(e.target.value as SeasonMode)}
                >
                  <option value="rainy">Rainy Season</option>
                  <option value="dry">Dry Season</option>
                </select>
              </div>
              <div className="green-work-live-maturity-row">
                <label htmlFor="green-work-live-species-select">Species</label>
                <select
                  id="green-work-live-species-select"
                  value={selectedMaturitySpecies}
                  onChange={(e) => {
                    const speciesKey = e.target.value;
                    setSelectedMaturitySpecies(speciesKey);
                    const currentYears = activeProjectMaturityMap[speciesKey];
                    setSelectedMaturityYears(currentYears ? String(currentYears) : "3");
                  }}
                >
                  {projectSpeciesOptions.length === 0 ? (
                    <option value="">No species in this project yet</option>
                  ) : (
                    projectSpeciesOptions.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))
                  )}
                </select>

                <label htmlFor="green-work-live-years-select">Peg Years</label>
                <select
                  id="green-work-live-years-select"
                  value={selectedMaturityYears}
                  onChange={(e) => setSelectedMaturityYears(e.target.value)}
                  disabled={!selectedMaturitySpecies}
                >
                  {Array.from({ length: 15 }, (_, index) => index + 1).map((years) => (
                    <option key={years} value={years}>
                      {years} {years === 1 ? "Year" : "Years"}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="green-work-live-years-btn"
                  onClick={saveSpeciesMaturityYears}
                  disabled={!selectedMaturitySpecies}
                >
                  Save Peg
                </button>
              </div>
              <div className="green-work-live-maturity-list">
                {speciesMaturityRows.length === 0 ? (
                  <span className="green-work-live-maturity-chip is-empty">Add trees with species to configure peg years.</span>
                ) : (
                  speciesMaturityRows.map((item) => (
                    <span
                      key={item.key}
                      className={`green-work-live-maturity-chip ${item.years ? "is-set" : "is-empty"}`}
                    >
                      {item.label}: {item.years ? `${item.years} years` : "Not set"}
                    </span>
                  ))
                )}
              </div>

              <div className="green-work-live-summary">
                <span className="green-work-live-pill neutral">Season: {SEASON_LABEL[seasonMode]}</span>
                <span className="green-work-live-pill danger">Danger: {effectiveLiveSummary.danger}</span>
                <span className="green-work-live-pill warning">In Progress / Due Soon: {effectiveLiveSummary.warning}</span>
                <span className="green-work-live-pill ok">On Track: {effectiveLiveSummary.ok}</span>
                <span className="green-work-live-pill info">Needs Planting Date: {effectiveLiveSummary.info}</span>
                <span className="green-work-live-pill neutral">Rows: {effectiveLiveSummary.total}</span>
              </div>

              <div className="green-work-live-table-wrap">
                <table className="green-work-live-table">
                  <thead>
                    <tr>
                      <th>Tree</th>
                      <th>Staff</th>
                      <th>Activity</th>
                      <th>Tree Age</th>
                      <th>Last Done</th>
                      <th>Model Due</th>
                      <th>Assigned Due</th>
                      <th>Countdown</th>
                      <th>Status</th>
                      <th>Indicator</th>
                      <th>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectiveLiveRows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="green-work-live-empty">
                          No tree maintenance rows available for this filter.
                        </td>
                      </tr>
                    ) : (
                      effectiveLiveRows.map((row) => (
                        <tr key={row.key} className={`tone-${row.tone}`}>
                          <td>
                            <button
                              type="button"
                              className="green-work-live-tree-link"
                              onClick={(event) => {
                                event.stopPropagation();
                                setStaffMenu(null);
                                setLiveTreeMenu({ treeId: row.treeId, x: event.clientX, y: event.clientY, taskType: row.activity });
                              }}
                            >
                              #{row.treeId}
                            </button>
                          </td>
                          <td>{row.assignee}</td>
                          <td>
                            <strong>{row.activityLabel}</strong>
                            <span className="green-work-live-hint">{row.modelRationale}</span>
                          </td>
                          <td>{row.treeAgeDays === null ? "-" : `${row.treeAgeDays}d`}</td>
                          <td>{formatDateLabel(row.lastDoneAt)}</td>
                          <td>{formatDateLabel(row.modelDueDate)}</td>
                          <td>{formatDateLabel(row.assignedDueDate)}</td>
                          <td
                            className={`green-work-live-countdown ${
                              row.countdownDays !== null && row.countdownDays < 0 ? "overdue" : ""
                            }`}
                          >
                            {row.countdownDays === null
                              ? "-"
                              : row.countdownDays < 0
                                ? `${Math.abs(row.countdownDays)}d late`
                                : row.countdownDays === 0
                                  ? "Due today"
                                  : `${row.countdownDays}d left`}
                          </td>
                          <td>{row.statusText}</td>
                          <td>
                            <span className={`green-work-live-indicator ${row.tone}`}>{row.indicator}</span>
                          </td>
                          <td>
                            Done {row.doneCount} | Open {row.pendingCount} | Overdue {row.overdueCount}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="green-work-live-sources">
                <h4>Schedule Sources</h4>
                <p>
                  Cadence is a Nigeria-adapted field model for live monitoring using {SEASON_LABEL[seasonMode]} assumptions.
                  Review intervals seasonally by state-level rainfall outlook.
                </p>
                <ul>
                  {serverLiveSources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div ref={mapCardRef} className={`green-work-card green-work-map-card ${overviewMode ? "overview-map" : ""}`}>
            <h3>Trees on Map</h3>
            {!activeProjectId && (
              <p className="green-work-note">Select an active project in Project Focus to load trees and assignments.</p>
            )}
            <div className="green-work-map-layout">
              <div className="green-work-map-canvas">
                <TreeMap
                  trees={filteredTrees}
                  onAddTree={() => {}}
                  enableDraw={false}
                  minHeight={overviewMode || liveTableMode ? 480 : 220}
                  onTreeInspect={(detail) => {
                    setInspectedTree(detail);
                    if (detail) setMenuOpen(false);
                  }}
                  onViewChange={(view) => setMapView(view)}
                  fitBounds={fitPoints}
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      {inspectedTree && (
        <>
          <button
            type="button"
            className="green-work-tree-overlay"
            onClick={() => setInspectedTree(null)}
            aria-label="Close tree details"
          />
          <aside className="green-work-tree-drawer green-work-tree-inspector" style={drawerStyle}>
            <div className="green-work-tree-drawer-head">
              <strong>Tree Details</strong>
              <button
                className="green-work-tree-drawer-close"
                type="button"
                onClick={() => setInspectedTree(null)}
                aria-label="Close tree details"
              >
                X
              </button>
            </div>
            <div className="green-work-tree-inspector-body">
              <div className="green-work-tree-inspector-photo-wrap">
                {inspectedTree.photo_url ? (
                  <img
                    className="green-work-tree-inspector-photo"
                    src={toDisplayPhotoUrl(inspectedTree.photo_url)}
                    alt={`Tree ${inspectedTree.id}`}
                  />
                ) : (
                  <div className="green-work-tree-inspector-photo empty">No tree photo</div>
                )}
              </div>
              <div className="green-work-tree-photo-upload-row">
                <label className={`green-work-tree-photo-upload-btn ${treePhotoUploading ? "is-loading" : ""}`}>
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
              <p className="green-work-tree-maintenance-count">
                Maintenance Records: {inspectedTree.maintenance.total}
              </p>
              <h4>Tree #{inspectedTree.id}</h4>
              {inspectedTree.loading && <p className="green-work-note">Loading latest records...</p>}
              <div className="green-work-tree-inspector-grid">
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
              </div>
              <p className="green-work-tree-inspector-notes">{inspectedTree.notes || "No notes."}</p>
              <div className="green-work-tree-maintenance-row">
                <span>Total: {inspectedTree.maintenance.total}</span>
                <span>Done: {inspectedTree.maintenance.done}</span>
                <span>Pending: {inspectedTree.maintenance.pending}</span>
                <span>Overdue: {inspectedTree.maintenance.overdue}</span>
              </div>
              <div className="green-work-tree-inspector-tasks">
                <h5>Recent Maintenance</h5>
                {inspectedTree.tasks.length === 0 ? (
                  <p>No maintenance records yet.</p>
                ) : (
                  inspectedTree.tasks.slice(0, 5).map((task: any) => (
                    <div key={task.id} className="green-work-tree-inspector-task">
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

      {staffMenu && (
        <>
          <button
            type="button"
            className="green-work-context-overlay"
            onClick={() => setStaffMenu(null)}
            aria-label="Close staff menu"
          />
          <div className="green-work-context-menu" style={{ left: staffMenu.x, top: staffMenu.y }}>
            <div className="green-work-context-title">{staffMenu.user.full_name}</div>
            <button type="button" onClick={() => openAssignWorkForUser(staffMenu.user.full_name)}>
              Assign Tree Planting
            </button>
            <button type="button" onClick={() => openAssignTaskForUser(staffMenu.user.full_name)}>
              Assign Maintenance
            </button>
          </div>
        </>
      )}

      {liveTreeMenu && (
        <>
          <button
            type="button"
            className="green-work-context-overlay"
            onClick={() => setLiveTreeMenu(null)}
            aria-label="Close tree menu"
          />
          <div className="green-work-context-menu" style={{ left: liveTreeMenu.x, top: liveTreeMenu.y }}>
            <div className="green-work-context-title">Tree #{liveTreeMenu.treeId}</div>
            <button type="button" onClick={() => openAssignTaskForTree(liveTreeMenu.treeId, liveTreeMenu.taskType)}>
              Assign Maintenance
            </button>
          </div>
        </>
      )}
    </div>
  );
}
