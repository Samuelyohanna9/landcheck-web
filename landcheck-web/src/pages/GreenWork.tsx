import { useEffect, useMemo, useState } from "react";
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
  due_date: string | null;
  priority?: string | null;
};

type WorkForm = "project_focus" | "create_project" | "add_user" | "users" | "assign_work" | "assign_task" | "overview";
type StaffMenuState = { user: GreenUser; x: number; y: number } | null;

const normalizeName = (value: string | null | undefined) => (value || "").trim().toLowerCase();
const formatRoleLabel = (role: string) =>
  role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
const isCompleteStatus = (status: string | null | undefined) => {
  const normalized = normalizeName(status);
  return normalized === "done" || normalized === "completed" || normalized === "closed";
};
const isOverdueTask = (task: WorkTask) => {
  if (isCompleteStatus(task.status) || !task.due_date) return false;
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

const toDisplayPhotoUrl = (url: string | null | undefined) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (!raw.includes(".r2.cloudflarestorage.com/")) return raw;
  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return raw;
    const key = parts.slice(1).map(encodeURIComponent).join("/");
    return `${BACKEND_URL}/green/uploads/object/${key}`;
  } catch {
    return raw;
  }
};

export default function GreenWork() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<GreenUser[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [newOrder, setNewOrder] = useState({
    assignee_name: "",
    work_type: "planting",
    target_trees: 0,
    due_date: "",
  });
  const [newUser, setNewUser] = useState({ full_name: "", role: "field_officer" });
  const [newProject, setNewProject] = useState({ name: "", location_text: "", sponsor: "" });
  const [newTask, setNewTask] = useState({
    tree_id: "",
    task_type: "watering",
    assignee_name: "",
    due_date: "",
    priority: "normal",
    notes: "",
  });
  const [mapView, setMapView] = useState<{ lng: number; lat: number; zoom: number; bearing: number; pitch: number } | null>(null);
  const [inspectedTree, setInspectedTree] = useState<TreeInspectData | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeForm, setActiveForm] = useState<WorkForm | null>(null);
  const [staffMenu, setStaffMenu] = useState<StaffMenuState>(null);

  const loadProjects = async () => {
    const res = await api.get("/green/projects");
    setProjects(res.data);
  };

  const loadUsers = async () => {
    const res = await api.get("/green/users");
    setUsers(res.data);
  };

  const loadProjectData = async (projectId: number) => {
    const [ordersRes, treesRes, tasksRes] = await Promise.all([
      api.get(`/green/work-orders?project_id=${projectId}`),
      api.get(`/green/projects/${projectId}/trees`),
      api.get(`/green/tasks?project_id=${projectId}`),
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
  };

  useEffect(() => {
    loadProjects().catch(() => toast.error("Failed to load projects"));
    loadUsers().catch(() => toast.error("Failed to load users"));
  }, []);

  useEffect(() => {
    if (!staffMenu) return;
    const closeMenu = () => setStaffMenu(null);
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
  }, [staffMenu]);

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
    await api.post(`/green/trees/${newTask.tree_id}/tasks`, {
      task_type: newTask.task_type,
      assignee_name: newTask.assignee_name,
      due_date: newTask.due_date || null,
      priority: newTask.priority,
      notes: newTask.notes,
    });
    setNewTask({
      tree_id: "",
      task_type: "watering",
      assignee_name: "",
      due_date: "",
      priority: "normal",
      notes: "",
    });
    await loadProjectData(activeProjectId);
    toast.success("Task assigned");
  };

  const exportWorkCsv = () => {
    if (!activeProjectId) return;
    window.open(`${BACKEND_URL}/green/work-stats/export/csv?project_id=${activeProjectId}`, "_blank");
  };

  const exportWorkPdf = () => {
    if (!activeProjectId) return;
    const assignee = assigneeFilter !== "all" ? `&assignee_name=${encodeURIComponent(assigneeFilter)}` : "";
    const view = mapView
      ? `&lng=${mapView.lng}&lat=${mapView.lat}&zoom=${mapView.zoom}&bearing=${mapView.bearing}&pitch=${mapView.pitch}`
      : "";
    window.open(`${BACKEND_URL}/green/work-report/pdf?project_id=${activeProjectId}${assignee}${view}`, "_blank");
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

  const filteredTrees = useMemo(() => {
    if (assigneeFilter === "all") return trees;
    const key = normalizeName(assigneeFilter);
    return trees.filter((t) => normalizeName(t.created_by) === key);
  }, [trees, assigneeFilter]);

  const fitPoints = useMemo(() => {
    if (assigneeFilter === "all") return null;
    const key = normalizeName(assigneeFilter);
    const points = trees
      .filter((t) => normalizeName(t.created_by) === key)
      .map((t) => ({ lng: t.lng, lat: t.lat }));
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
        const doneTasks = userTasks.filter((task) => isCompleteStatus(task.status)).length;
        const overdueTasks = userTasks.filter((task) => isOverdueTask(task)).length;
        const pendingTasks = Math.max(userTasks.length - doneTasks - overdueTasks, 0);

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
          statusLabel,
          statusTone,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assignees, users, orders, tasks, trees]);

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
  const activeProjectActions: Array<{ form: WorkForm; title: string; note: string }> = [
    { form: "overview", title: "Overview", note: "Progress + map summary" },
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
        const doneTasks = userTasks.filter((task) => isCompleteStatus(task.status)).length;
        const pendingTasks = userTasks.filter((task) => !isCompleteStatus(task.status)).length;

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

  const activeProjectName = useMemo(() => {
    if (!activeProjectId) return "";
    return projects.find((p) => p.id === activeProjectId)?.name || "";
  }, [activeProjectId, projects]);
  const showSidebar = activeForm !== null && activeForm !== "overview";
  const overviewMode = Boolean(activeProjectId && activeForm === "overview");

  const openForm = (form: WorkForm) => {
    setActiveForm(form);
    setMenuOpen(false);
    setStaffMenu(null);
  };

  const openAssignWorkForUser = (userName: string) => {
    if (!activeProjectId) {
      toast("Select an active project first.");
      setStaffMenu(null);
      return;
    }
    setNewOrder((prev) => ({ ...prev, assignee_name: userName }));
    setActiveForm("assign_work");
    setMenuOpen(false);
    setStaffMenu(null);
  };

  const openAssignTaskForUser = (userName: string) => {
    if (!activeProjectId) {
      toast("Select an active project first.");
      setStaffMenu(null);
      return;
    }
    setNewTask((prev) => ({ ...prev, assignee_name: userName }));
    setActiveForm("assign_task");
    setMenuOpen(false);
    setStaffMenu(null);
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
                  <span>{action.title}</span>
                  <small>{action.note}</small>
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

      <aside className={`green-work-menu-drawer ${menuOpen ? "open" : ""}`}>
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
              <input
                type="date"
                value={newTask.due_date}
                onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                disabled={!activeProjectId}
              />
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
        </aside>

        <section className={`green-work-main ${overviewMode ? "overview-mode" : "single-mode"}`}>
          {activeProjectId && activeForm === "overview" && (
            <div className="green-work-card green-work-overview-card">
              <div className="green-work-row">
                <h3>Project Overview</h3>
                <div className="work-actions">
                  <button onClick={exportWorkCsv}>Export CSV</button>
                  <button onClick={exportWorkPdf}>Export PDF</button>
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
              </div>
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
                </div>
              </div>

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
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`green-work-card green-work-map-card ${overviewMode ? "overview-map" : ""}`}>
            <h3>Tree Map by Assignee</h3>
            {!activeProjectId && (
              <p className="green-work-note">Select an active project in Project Focus to load trees and assignments.</p>
            )}
            <div className="green-work-map-layout">
              <div className="green-work-map-canvas">
                <TreeMap
                  trees={filteredTrees}
                  onAddTree={() => {}}
                  enableDraw={false}
                  minHeight={overviewMode ? 480 : 220}
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
          <aside className="green-work-tree-drawer green-work-tree-inspector">
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
    </div>
  );
}

