import { useEffect, useMemo, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { api, BACKEND_URL } from "../api/client";
import TreeMap, { type TreeInspectData } from "../components/TreeMap";
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
};

type GreenUser = {
  id: number;
  full_name: string;
  role: string;
};

type Section = "tasks" | "map" | "records" | "profile";
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
  const [taskEdits, setTaskEdits] = useState<Record<number, { status: string; notes: string; photo_url: string; tree_status: string }>>(
    {}
  );
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [loadingTrees, setLoadingTrees] = useState(false);
  const [newTree, setNewTree] = useState({
    lng: 0,
    lat: 0,
    species: "",
    planting_date: "",
    status: "alive",
    notes: "",
    photo_url: "",
    created_by: "",
  });
  const [gpsLoading, setGpsLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [pendingTreePhoto, setPendingTreePhoto] = useState<File | null>(null);
  const [addingTree, setAddingTree] = useState(false);
  const [, setMapView] = useState<{
    lng: number;
    lat: number;
    zoom: number;
    bearing: number;
    pitch: number;
  } | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ lng: number; lat: number }[] | null>(null);
  const [plantingOrders, setPlantingOrders] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<Section | null>(storedSection);
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [treePhotoUploading, setTreePhotoUploading] = useState(false);
  const [plantingFlowState, setPlantingFlowState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [plantingFlowMessage, setPlantingFlowMessage] = useState("");

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
      }))
      .filter((t) => Number.isFinite(t.lng) && Number.isFinite(t.lat));
  }, [trees, activeUser]);

  const activeUserPoints = useMemo(() => {
    if (!activeUser) return null;
    const points = treePoints.map((t) => ({ lng: t.lng, lat: t.lat }));
    return points.length ? points : null;
  }, [activeUser, treePoints]);

  const userTrees = useMemo(() => {
    if (!activeUser) return [];
    return trees.filter((t: any) => (t as any).created_by === activeUser);
  }, [activeUser, trees]);

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
    return users.find((u) => u.full_name === activeUser) || null;
  }, [activeUser, users]);

  const pendingPlanting = useMemo(() => {
    const orders = plantingOrders.filter((o) => o.work_type === "planting");
    const totalTarget = orders.reduce((sum: number, o: any) => sum + (o.target_trees || 0), 0);
    const planted = userTrees.length;
    return Math.max(totalTarget - planted, 0);
  }, [plantingOrders, userTrees]);

  const plantingReviewCounts = useMemo(() => {
    const submitted = userTrees.filter((t) => normalizeTreeStatus(t.status) === "pending_planting").length;
    const approved = Math.max(userTrees.length - submitted, 0);
    return { submitted, approved };
  }, [userTrees]);

  const loadProjects = async () => {
    const res = await api.get("/green/projects");
    setProjects(res.data);
  };

  const loadUsers = async () => {
    const res = await api.get("/green/users");
    setUsers(res.data);
  };

  const loadProjectDetail = async (id: number) => {
    const [projectRes, treesRes] = await Promise.all([
      api.get(`/green/projects/${id}`),
      api.get(`/green/projects/${id}/trees`),
    ]);
    setActiveProject(projectRes.data);
    const normalized = (treesRes.data || []).map((t: any) => ({
      ...t,
      lng: Number(t.lng),
      lat: Number(t.lat),
    }));
    setTrees(normalized);
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
    const stamp = Date.now();
    api
      .get(`/green/work-orders?project_id=${activeProject.id}&assignee_name=${encodeURIComponent(activeUser)}&_ts=${stamp}`)
      .then((res) => setPlantingOrders(res.data || []))
      .catch(() => setPlantingOrders([]));
  }, [activeProject?.id, activeUser]);

  useEffect(() => {
    if (activeProject && activeUser) return;
    setMyTasks([]);
    setTaskEdits({});
    setPlantingOrders([]);
    setSelectedTreeId(null);
    setInspectedTree(null);
    setTreeTasks([]);
    setTreeTimeline(null);
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

  const addTree = async () => {
    if (!activeProject) return;
    if (addingTree) return;
    if (!activeUser) {
      toast.error("Select a field officer first");
      return;
    }
    if (!newTree.lng || !newTree.lat) {
      toast.error("Pick a point on the map");
      return;
    }
    setAddingTree(true);
    setPlantingFlowMessage("Planting tree...");
    setPlantingFlowState("loading");
    try {
      const createRes = await api.post("/green/trees", {
        project_id: activeProject.id,
        ...newTree,
        photo_url: "",
        created_by: activeUser,
      });
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
        } catch {
          photoLinked = false;
        }
      }

      setNewTree({
        lng: 0,
        lat: 0,
        species: "",
        planting_date: "",
        status: "alive",
        notes: "",
        photo_url: "",
        created_by: "",
      });
      setPhotoPreview("");
      setPendingTreePhoto(null);
      await loadProjectDetail(activeProject.id);
      if (activeProject && activeUser) {
        const stamp = Date.now();
        api
          .get(`/green/work-orders?project_id=${activeProject.id}&assignee_name=${encodeURIComponent(activeUser)}&_ts=${stamp}`)
          .then((res) => setPlantingOrders(res.data || []))
          .catch(() => setPlantingOrders([]));
      }
      if (photoLinked) {
        setPlantingFlowMessage(
          Number.isFinite(reviewTaskId) && reviewTaskId > 0
            ? "Tree submitted for supervisor review."
            : "Tree successfully planted!"
        );
      } else {
        setPlantingFlowMessage("Tree successfully planted! Photo upload failed.");
      }
      setPlantingFlowState("success");
    } catch {
      setPlantingFlowMessage("Failed to plant tree. Please try again.");
      setPlantingFlowState("error");
    } finally {
      setAddingTree(false);
    }
  };

  const loadTreeDetails = async (treeId: number) => {
    setSelectedTreeId(treeId);
    const [tasksRes, timelineRes] = await Promise.all([
      api.get(`/green/trees/${treeId}/tasks`),
      api.get(`/green/trees/${treeId}/timeline`),
    ]);
    const scopedTasks = (tasksRes.data || []).filter((task: any) => !activeUser || task.assignee_name === activeUser);
    setTreeTasks(scopedTasks);
    setTreeTimeline(timelineRes.data);
  };

  const loadMyTasks = async () => {
    if (!activeProject || !activeUser) return;
    const stamp = Date.now();
    const res = await api.get(
      `/green/tasks?project_id=${activeProject.id}&assignee_name=${encodeURIComponent(activeUser)}&_ts=${stamp}`
    );
    setMyTasks(res.data);
    const edits: Record<number, { status: string; notes: string; photo_url: string; tree_status: string }> = {};
    res.data.forEach((t: any) => {
      edits[t.id] = {
        status: t.status,
        notes: t.notes || "",
        photo_url: t.photo_url || "",
        tree_status: normalizeTreeStatus(t.reported_tree_status || t.tree_status || "healthy"),
      };
    });
    setTaskEdits(edits);
    setEditingTaskId(null);
  };

  const saveTaskUpdate = async (taskId: number) => {
    const edit = taskEdits[taskId];
    if (!edit) return;
    const task = myTasks.find((entry: any) => entry.id === taskId);
    if (isTaskLockedForField(task)) {
      toast.error("Task is locked for review");
      return;
    }
    await api.patch(`/green/tasks/${taskId}`, edit);
    await loadMyTasks();
    toast.success("Task updated");
  };

  const submitTaskForReview = async (taskId: number) => {
    const task = myTasks.find((entry: any) => entry.id === taskId);
    if (!task) return;
    if (isTaskLockedForField(task)) {
      toast.error("Task is locked for review");
      return;
    }
    const edit = taskEdits[taskId] || {
      status: task.status || "pending",
      notes: task.notes || "",
      photo_url: task.photo_url || "",
      tree_status: normalizeTreeStatus(task.reported_tree_status || task.tree_status || "healthy"),
    };
    if (!hasTaskEvidence(task, edit)) {
      toast.error("Add notes and photo proof before submission.");
      return;
    }
    const loadingId = toast.loading("Submitting task for supervisor review...");
    try {
      await api.post(`/green/tasks/${taskId}/submit`, {
        notes: edit.notes,
        photo_url: edit.photo_url,
        tree_status: edit.tree_status,
        actor_name: activeUser || "",
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
        [taskId]: {
          status: prev[taskId]?.status || "pending",
          notes: prev[taskId]?.notes || "",
          photo_url: photoUrl,
          tree_status:
            prev[taskId]?.tree_status ||
            normalizeTreeStatus(linkedTask?.reported_tree_status || linkedTask?.tree_status || "healthy"),
        },
      }));
      setMyTasks((prev) => prev.map((task: any) => (task.id === taskId ? { ...task, photo_url: photoUrl } : task)));
      if (linkedTask && inspectedTree && Number(linkedTask.tree_id) === inspectedTree.id) {
        setInspectedTree((prev) => (prev ? { ...prev, photo_url: photoUrl } : prev));
      }
      if (activeProject) {
        await loadProjectDetail(activeProject.id);
      }
      toast.success("Task photo uploaded", { id: loadingId });
    } catch {
      toast.error("Failed to upload task photo", { id: loadingId });
    }
  };

  const updateTreeStatus = async (treeId: number, status: string) => {
    await api.patch(`/green/trees/${treeId}`, { status });
    if (activeProject) {
      await loadProjectDetail(activeProject.id);
    }
  };

  const exportCsv = async () => {
    if (!activeProject) return;
    window.open(`${BACKEND_URL}/green/projects/${activeProject.id}/donor-report/csv`, "_blank");
  };

  const exportPdf = async () => {
    if (!activeProject) return;
    window.open(`${BACKEND_URL}/green/projects/${activeProject.id}/donor-report/pdf`, "_blank");
  };

  const exportVerra = async () => {
    if (!activeProject) return;
    const params = new URLSearchParams({
      season_mode: "rainy",
      format: "zip",
    });
    if (activeUser) {
      params.set("assignee_name", activeUser);
    }
    window.open(`${BACKEND_URL}/green/projects/${activeProject.id}/export/verra-vcs?${params.toString()}`, "_blank");
  };

  const exportVerraDocx = async () => {
    if (!activeProject) return;
    const params = new URLSearchParams({
      season_mode: "rainy",
      format: "docx",
    });
    if (activeUser) {
      params.set("assignee_name", activeUser);
    }
    window.open(`${BACKEND_URL}/green/projects/${activeProject.id}/export/verra-vcs?${params.toString()}`, "_blank");
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
    } catch {
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
            {installPrompt && (
              <button className="green-ghost-btn" onClick={installGreenApp} type="button">
                Install App
              </button>
            )}
            <button className="green-ghost-btn" onClick={exportCsv} disabled={!activeProject} type="button">
              Export CSV
            </button>
            <button className="green-ghost-btn" onClick={exportPdf} disabled={!activeProject} type="button">
              Export PDF
            </button>
            <button className="green-ghost-btn" onClick={exportVerra} disabled={!activeProject} type="button">
              Export Verra VCS
            </button>
            <button className="green-ghost-btn" onClick={exportVerraDocx} disabled={!activeProject} type="button">
              Export Verra DOCX
            </button>
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
                <option value="">Select field officer</option>
                {users.map((u) => (
                  <option key={u.id} value={u.full_name}>
                    {u.full_name} ({u.role})
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
            <p className="green-empty">Select a field officer to load only their trees and tasks.</p>
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
                  <span className="green-carbon-value">{activeProject.carbon.current_co2_tonnes.toFixed(1)}</span>
                  <span className="green-carbon-label">tonnes CO2 sequestered</span>
                </div>
                <div className="green-carbon-card">
                  <span className="green-carbon-value">{activeProject.carbon.annual_co2_tonnes.toFixed(1)}</span>
                  <span className="green-carbon-label">tonnes CO2 / year</span>
                </div>
                <div className="green-carbon-card green-carbon-card-accent">
                  <span className="green-carbon-value">{activeProject.carbon.projected_lifetime_co2_tonnes.toFixed(0)}</span>
                  <span className="green-carbon-label">tonnes projected (40yr)</span>
                </div>
                <div className="green-carbon-card">
                  <span className="green-carbon-value">{activeProject.carbon.co2_per_tree_avg_kg.toFixed(1)}</span>
                  <span className="green-carbon-label">kg CO2 avg/tree</span>
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
              <p className="green-empty">Select a field officer to view assigned tasks.</p>
            ) : myTasks.length === 0 ? (
              <p className="green-empty">No tasks assigned.</p>
            ) : userTrees.length === 0 ? (
              <p className="green-empty">No trees recorded yet for this field officer.</p>
            ) : (
              <div className="tree-table">
                <div className="tree-row tree-header">
                  <span>Task</span>
                  <span>Tree</span>
                  <span>Status</span>
                  <span>Due</span>
                  <span>Action</span>
                </div>
                {myTasks.map((t) => (
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
                                [t.id]: {
                                  status: e.target.value,
                                  notes: prev[t.id]?.notes || "",
                                  photo_url: prev[t.id]?.photo_url || "",
                                  tree_status:
                                    prev[t.id]?.tree_status ||
                                    normalizeTreeStatus(t.reported_tree_status || t.tree_status || "healthy"),
                                },
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
                        Review: {t.review_state || "none"} | Evidence: {hasTaskEvidence(t, taskEdits[t.id]) ? "complete" : "missing"}
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
                                [t.id]: {
                                  status: prev[t.id]?.status || "pending",
                                  notes: e.target.value,
                                  photo_url: prev[t.id]?.photo_url || "",
                                  tree_status:
                                    prev[t.id]?.tree_status ||
                                    normalizeTreeStatus(t.reported_tree_status || t.tree_status || "healthy"),
                                },
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
                                  [t.id]: {
                                    status: prev[t.id]?.status || "pending",
                                    notes: prev[t.id]?.notes || "",
                                    photo_url: prev[t.id]?.photo_url || "",
                                    tree_status: e.target.value,
                                  },
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
                ))}
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
            {!activeUser && <p className="green-empty">Select a field officer to view only their trees.</p>}
            <div className="green-map-layout">
              <div className="green-map-canvas">
                <TreeMap
                  trees={treePoints}
                  draftPoint={newTree.lng && newTree.lat ? { lng: newTree.lng, lat: newTree.lat } : null}
                  onDraftMove={(lng, lat) => setNewTree((prev) => ({ ...prev, lng, lat }))}
                  onAddTree={(lng, lat) => setNewTree((prev) => ({ ...prev, lng, lat }))}
                  onSelectTree={(id) => loadTreeDetails(id)}
                  onTreeInspect={(detail) => setInspectedTree(detail)}
                  onViewChange={(view) => setMapView(view)}
                  fitBounds={focusPoint || activeUserPoints}
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
                <label>Planting Date</label>
                <input
                  type="date"
                  value={newTree.planting_date}
                  onChange={(e) => setNewTree({ ...newTree, planting_date: e.target.value })}
                />
              </div>
              <div className="tree-form-row">
                <label>Status</label>
                <select value={newTree.status} onChange={(e) => setNewTree({ ...newTree, status: e.target.value })}>
                  <option value="alive">Alive</option>
                  <option value="pending_planting">Pending planting</option>
                </select>
              </div>
              <div className="tree-form-row">
                <label>Added by</label>
                <select value={activeUser} onChange={(e) => setActiveUser(e.target.value)}>
                  <option value="">Select field officer</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.full_name}>
                      {u.full_name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
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
                {addingTree ? "Saving..." : "Add Tree"}
              </button>
            </div>
          </section>
        )}

        {activeSection === "profile" && (
          <section className="green-detail-card" id="green-section-profile">
            <h3>Field Officer Details</h3>
            {!activeUserDetail ? (
              <p className="green-empty">Select a field officer from setup to view profile details.</p>
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
              <p className="green-empty">Select a field officer to view their tree records.</p>
            ) : loadingTrees ? (
              <p className="green-empty">Loading trees...</p>
            ) : (
              <div className="tree-table">
                <div className="tree-row tree-header">
                  <span>ID</span>
                  <span>Species</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {userTrees.map((t) => (
                  <div key={t.id} className="tree-row record-row">
                    <span>#{t.id}</span>
                    <span>{t.species || "-"}</span>
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
