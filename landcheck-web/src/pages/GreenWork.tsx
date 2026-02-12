import { useEffect, useMemo, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { api, BACKEND_URL } from "../api/client";
import TreeMap from "../components/TreeMap";
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
};

type WorkForm = "project_focus" | "create_project" | "add_user" | "users" | "assign_work" | "assign_task";
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

export default function GreenWork() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<GreenUser[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [taskStats, setTaskStats] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
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
    const [ordersRes, treesRes, statsRes, tasksRes] = await Promise.all([
      api.get(`/green/work-orders?project_id=${projectId}`),
      api.get(`/green/projects/${projectId}/trees`),
      api.get(`/green/work-stats?project_id=${projectId}`),
      api.get(`/green/tasks?project_id=${projectId}`),
    ]);
    setOrders(ordersRes.data);
    setTrees(treesRes.data);
    setStats(statsRes.data);
    setTasks(tasksRes.data);
    const taskRes = await api.get(`/green/projects/${projectId}/task-stats`);
    setTaskStats(taskRes.data);
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

  const exportTasksCsv = () => {
    if (!activeProjectId) return;
    window.open(`${BACKEND_URL}/green/projects/${activeProjectId}/tasks/export/csv`, "_blank");
  };

  const exportTasksPdf = () => {
    if (!activeProjectId) return;
    window.open(`${BACKEND_URL}/green/projects/${activeProjectId}/tasks/export/pdf`, "_blank");
  };

  const assignees = useMemo(() => {
    const names = new Set<string>();
    orders.forEach((o) => names.add(o.assignee_name));
    trees.forEach((t) => t.created_by && names.add(t.created_by));
    users.forEach((u) => names.add(u.full_name));
    return ["all", ...Array.from(names)];
  }, [orders, trees, users]);

  const filteredTrees = useMemo(() => {
    if (assigneeFilter === "all") return trees;
    return trees.filter((t) => t.created_by === assigneeFilter);
  }, [trees, assigneeFilter]);

  const fitPoints = useMemo(() => {
    if (assigneeFilter === "all") return null;
    const points = trees
      .filter((t) => t.created_by === assigneeFilter)
      .map((t) => ({ lng: t.lng, lat: t.lat }));
    return points.length ? points : null;
  }, [assigneeFilter, trees]);

  const taskTotals = useMemo(() => {
    if (!taskStats) return { total: 0, pending: 0, done: 0, overdue: 0 };
    return {
      total: taskStats.total || 0,
      pending: taskStats.pending || 0,
      done: taskStats.done || 0,
      overdue: taskStats.overdue || 0,
    };
  }, [taskStats]);

  const staffOrderSummary = useMemo(() => {
    const plantedByAssignee = new Map<string, number>();
    trees.forEach((tree) => {
      if (!tree.created_by) return;
      const key = tree.created_by.trim();
      plantedByAssignee.set(key, (plantedByAssignee.get(key) || 0) + 1);
    });

    const grouped = new Map<
      string,
      { assignee_name: string; target_trees: number; planted_count: number; order_count: number }
    >();

    orders.forEach((order) => {
      const assignee = (order.assignee_name || "").trim() || "Unassigned";
      const current = grouped.get(assignee);
      const targetTrees = Number(order.target_trees || 0);
      const plantedCount = Number(order.planted_count || 0);

      if (current) {
        current.target_trees += targetTrees;
        current.order_count += 1;
        return;
      }

      grouped.set(assignee, {
        assignee_name: assignee,
        target_trees: targetTrees,
        planted_count: plantedCount,
        order_count: 1,
      });
    });

    grouped.forEach((value, key) => {
      value.planted_count = plantedByAssignee.get(key) || 0;
    });

    return Array.from(grouped.values()).sort((a, b) => a.assignee_name.localeCompare(b.assignee_name));
  }, [orders, trees]);

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

  const activeProjectName = useMemo(() => {
    if (!activeProjectId) return "";
    return projects.find((p) => p.id === activeProjectId)?.name || "";
  }, [activeProjectId, projects]);
  const showInitialSinglePage = !activeProjectId && !activeForm;

  const openForm = (form: WorkForm) => {
    setActiveForm(form);
    setMenuOpen(false);
    setStaffMenu(null);
  };

  const openAssignWorkForUser = (userName: string) => {
    setNewOrder((prev) => ({ ...prev, assignee_name: userName }));
    setActiveForm("assign_work");
    setMenuOpen(false);
    setStaffMenu(null);
    if (!activeProjectId) {
      toast("Select a project in Project Focus before submitting assignment.");
    }
  };

  const openAssignTaskForUser = (userName: string) => {
    setNewTask((prev) => ({ ...prev, assignee_name: userName }));
    setActiveForm("assign_task");
    setMenuOpen(false);
    setStaffMenu(null);
    if (!activeProjectId) {
      toast("Select a project in Project Focus before submitting assignment.");
    }
  };

  return (
    <div className={`green-work-container ${showInitialSinglePage ? "pre-project-view" : ""}`}>
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
        <button
          className={`green-work-menu-item ${activeForm === "add_user" ? "active" : ""}`}
          type="button"
          onClick={() => openForm("add_user")}
        >
          Add User
        </button>
        <button
          className={`green-work-menu-item ${activeForm === "users" ? "active" : ""}`}
          type="button"
          onClick={() => openForm("users")}
        >
          Users
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
      </aside>

      <div className={`green-work-content ${activeForm ? "with-sidebar" : "no-sidebar"}`}>
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
                    setStats(null);
                    setTaskStats(null);
                    setTasks([]);
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

        <section className="green-work-main">
          {!activeProjectId ? (
            <div className="green-work-card green-work-start-card">
              <h3>Welcome to LandCheck Work</h3>
              <p className="green-work-note">
                Select an active project to unlock Progress Dashboard, Tree Map, Orders, and Assigned Tasks.
              </p>
              <p className="green-work-note">Use the menu or start from here.</p>
              <div className="green-work-start-actions">
                <button className="btn-primary" type="button" onClick={() => openForm("project_focus")}>
                  Select Project
                </button>
                <button className="btn-primary" type="button" onClick={() => openForm("create_project")}>
                  Create Project
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="green-work-card">
                <div className="green-work-row">
                  <h3>Progress Dashboard</h3>
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

                {stats && (
                  <div className="green-work-stats">
                    {assigneeFilter === "all" && (
                      <div className="stat-card">
                        <h4>All Staff</h4>
                        <p>
                          Orders:{" "}
                          {stats.orders.reduce((sum: number, o: any) => sum + (o.orders || 0), 0)}
                        </p>
                        <p>
                          Target Trees:{" "}
                          {stats.orders.reduce((sum: number, o: any) => sum + (o.target_trees || 0), 0)}
                        </p>
                        <p>
                          Planted:{" "}
                          {stats.orders.reduce((sum: number, o: any) => sum + (o.planted_count || 0), 0)}
                        </p>
                      </div>
                    )}
                    {stats.orders.map((o: any) => (
                      <div key={o.assignee_name} className="stat-card">
                        <h4>{o.assignee_name}</h4>
                        <p>Orders: {o.orders || 0}</p>
                        <p>Target Trees: {o.target_trees || 0}</p>
                        <p>Planted: {o.planted_count || 0}</p>
                        <div className="progress-bar">
                          <span
                            style={{ width: `${calcProgress(o.planted_count || 0, o.target_trees || 0)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {taskStats && (
                  <div className="green-work-stats">
                    <div className="stat-card">
                      <h4>Task Summary</h4>
                      <p>Total: {taskTotals.total}</p>
                      <p>Done: {taskTotals.done}</p>
                      <p>Pending: {taskTotals.pending}</p>
                      <p>Overdue: {taskTotals.overdue}</p>
                      <div className="progress-stack">
                        <span
                          className="stack done"
                          style={{ width: `${calcProgress(taskTotals.done, taskTotals.total)}%` }}
                        />
                        <span
                          className="stack pending"
                          style={{ width: `${calcProgress(taskTotals.pending, taskTotals.total)}%` }}
                        />
                        <span
                          className="stack overdue"
                          style={{ width: `${calcProgress(taskTotals.overdue, taskTotals.total)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="green-work-card">
                <h3>Tree Map by Assignee</h3>
                <TreeMap
                  trees={filteredTrees}
                  onAddTree={() => {}}
                  enableDraw={false}
                  onViewChange={(view) => setMapView(view)}
                  fitBounds={fitPoints}
                />
              </div>

              <div className="green-work-card">
                <h3>Tree Planting Orders</h3>
                {staffOrderSummary.length === 0 && <p>No work orders yet.</p>}
                {staffOrderSummary.map((o) => (
                  <div key={o.assignee_name} className="work-order-row">
                    <div>
                      <strong>{o.assignee_name}</strong>
                      <div>Assigned: {o.target_trees} | Planted: {o.planted_count}</div>
                      <div>Orders: {o.order_count}</div>
                      <div className="progress-bar">
                        <span
                          style={{ width: `${calcProgress(o.planted_count || 0, o.target_trees || 0)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="work-actions">
                  <button onClick={exportTasksCsv}>Export Tasks CSV</button>
                  <button onClick={exportTasksPdf}>Export Tasks PDF</button>
                </div>
              </div>

              <div className="green-work-card">
                <h3>Assigned Tasks</h3>
                {tasks.length === 0 && <p>No tasks assigned yet.</p>}
                {tasks.map((t) => (
                  <div key={t.id} className="work-order-row">
                    <div>
                      <strong>{t.task_type}</strong> - Tree #{t.tree_id}
                      <div>Assignee: {t.assignee_name} | Priority: {t.priority || "normal"}</div>
                      <div>Status: {t.status} | Due: {t.due_date || "-"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

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

