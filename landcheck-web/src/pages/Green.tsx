import { useEffect, useMemo, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { api, BACKEND_URL } from "../api/client";
import TreeMap from "../components/TreeMap";
import "../styles/green.css";

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

export default function Green() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [selectedTreeId, setSelectedTreeId] = useState<number | null>(null);
  const [treeTasks, setTreeTasks] = useState<any[]>([]);
  const [treeTimeline, setTreeTimeline] = useState<any | null>(null);
  const [users, setUsers] = useState<GreenUser[]>([]);
  const [activeUser, setActiveUser] = useState<string>("");
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [taskEdits, setTaskEdits] = useState<Record<number, { status: string; notes: string; photo_url: string }>>(
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
  const [mapView, setMapView] = useState<{ lng: number; lat: number; zoom: number; bearing: number; pitch: number } | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ lng: number; lat: number }[] | null>(null);
  const [plantingOrders, setPlantingOrders] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<"tasks" | "map" | "records">("tasks");

  const treePoints = useMemo(
    () =>
      trees
        .map((t) => ({
          id: t.id,
          lng: Number(t.lng),
          lat: Number(t.lat),
          status: t.status,
        }))
        .filter((t) => Number.isFinite(t.lng) && Number.isFinite(t.lat)),
    [trees]
  );

  const activeUserPoints = useMemo(() => {
    if (!activeUser) return null;
    const points = trees
      .filter((t: any) => (t as any).created_by === activeUser)
      .map((t) => ({ lng: Number(t.lng), lat: Number(t.lat) }))
      .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
    return points.length ? points : null;
  }, [activeUser, trees]);

  const allTreePoints = useMemo(() => {
    if (!trees.length) return null;
    const points = trees
      .map((t) => ({ lng: Number(t.lng), lat: Number(t.lat) }))
      .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
    return points.length ? points : null;
  }, [trees]);

  const userTrees = useMemo(() => {
    if (!activeUser) return [];
    return trees.filter((t: any) => (t as any).created_by === activeUser);
  }, [activeUser, trees]);

  const myTaskCounts = useMemo(() => {
    const total = myTasks.length;
    const pending = myTasks.filter((t) => t.status === "pending").length;
    const done = myTasks.filter((t) => t.status === "done").length;
    return { total, pending, done };
  }, [myTasks]);

  const myTreeSummary = useMemo(() => {
    const total = userTrees.length;
    const alive = userTrees.filter((t) => t.status === "alive").length;
    const dead = userTrees.filter((t) => t.status === "dead").length;
    const needs = userTrees.filter((t) => t.status === "needs_attention").length;
    return { total, alive, dead, needs };
  }, [userTrees]);

  const pendingPlanting = useMemo(() => {
    const orders = plantingOrders.filter((o) => o.work_type === "planting");
    return orders.reduce((sum: number, o: any) => {
      const remaining = Math.max((o.target_trees || 0) - (o.planted_count || 0), 0);
      return sum + remaining;
    }, 0);
  }, [plantingOrders]);

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
    // PWA setup for /green only
    if (!window.location.pathname.startsWith("/green")) return;
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/green/manifest.webmanifest";
    document.head.appendChild(link);

    const theme = document.createElement("meta");
    theme.name = "theme-color";
    theme.content = "#0b1f16";
    document.head.appendChild(theme);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/green/sw.js", { scope: "/green/" }).catch(() => {});
    }

    return () => {
      document.head.removeChild(link);
      document.head.removeChild(theme);
    };
  }, []);

  useEffect(() => {
    if (activeProject && activeUser) {
      loadMyTasks().catch(() => toast.error("Failed to load tasks"));
    }
  }, [activeProject?.id, activeUser]);

  useEffect(() => {
    if (!activeProject || !activeUser) return;
    api
      .get(
        `/green/work-orders?project_id=${activeProject.id}&assignee_name=${encodeURIComponent(activeUser)}`
      )
      .then((res) => setPlantingOrders(res.data || []))
      .catch(() => setPlantingOrders([]));
  }, [activeProject?.id, activeUser]);

  useEffect(() => {
    if (!focusPoint) return;
    const timer = window.setTimeout(() => setFocusPoint(null), 800);
    return () => window.clearTimeout(timer);
  }, [focusPoint]);

  const selectProject = async (project: Project) => {
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
    if (!activeUser) {
      toast.error("Select a field officer first");
      return;
    }
    if (!newTree.lng || !newTree.lat) {
      toast.error("Pick a point on the map");
      return;
    }
    await api.post("/green/trees", {
      project_id: activeProject.id,
      ...newTree,
      created_by: activeUser,
    });
    toast.success("Tree added");
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
    await loadProjectDetail(activeProject.id);
  };

  const loadTreeDetails = async (treeId: number) => {
    setSelectedTreeId(treeId);
    const [tasksRes, timelineRes] = await Promise.all([
      api.get(`/green/trees/${treeId}/tasks`),
      api.get(`/green/trees/${treeId}/timeline`),
    ]);
    setTreeTasks(tasksRes.data);
    setTreeTimeline(timelineRes.data);
  };

  const loadMyTasks = async () => {
    if (!activeProject || !activeUser) return;
    const res = await api.get(
      `/green/tasks?project_id=${activeProject.id}&assignee_name=${encodeURIComponent(activeUser)}`
    );
    setMyTasks(res.data);
    const edits: Record<number, { status: string; notes: string; photo_url: string }> = {};
    res.data.forEach((t: any) => {
      edits[t.id] = {
        status: t.status,
        notes: t.notes || "",
        photo_url: t.photo_url || "",
      };
    });
    setTaskEdits(edits);
    setEditingTaskId(null);
  };

  const saveTaskUpdate = async (taskId: number) => {
    const edit = taskEdits[taskId];
    if (!edit) return;
    await api.patch(`/green/tasks/${taskId}`, edit);
    await loadMyTasks();
    toast.success("Task updated");
  };

  const openDirections = (lng: number, lat: number) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, "_blank");
  };

  const onTaskPhotoPicked = (taskId: number, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setTaskEdits((prev) => ({
        ...prev,
        [taskId]: {
          status: prev[taskId]?.status || "pending",
          notes: prev[taskId]?.notes || "",
          photo_url: dataUrl,
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  const updateTreeStatus = async (treeId: number, status: string) => {
    await api.patch(`/green/trees/${treeId}`, { status });
    if (activeProject) {
      await loadProjectDetail(activeProject.id);
    }
  };

  const exportCsv = async () => {
    if (!activeProject) return;
    window.open(`${BACKEND_URL}/green/projects/${activeProject.id}/export/csv`, "_blank");
  };

  const exportPdf = async () => {
    if (!activeProject) return;
    const view = mapView
      ? `?lng=${mapView.lng}&lat=${mapView.lat}&zoom=${mapView.zoom}&bearing=${mapView.bearing}&pitch=${mapView.pitch}`
      : "";
    window.open(`${BACKEND_URL}/green/projects/${activeProject.id}/export/pdf${view}`, "_blank");
  };

  const useGps = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported on this device");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewTree((prev) => ({
          ...prev,
          lng: Number(pos.coords.longitude.toFixed(6)),
          lat: Number(pos.coords.latitude.toFixed(6)),
        }));
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
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setPhotoPreview(dataUrl);
      setNewTree((prev) => ({ ...prev, photo_url: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="green-container">
      <Toaster position="top-right" />
      <header className="green-header">
        <div className="green-brand">
          <img className="green-brand-logo" src="/logo.svg" alt="LandCheck" />
          <div>
            <h1>LandCheck Green</h1>
            <p>Field dashboard for tree monitoring</p>
          </div>
        </div>
      </header>

      <main className="green-shell">
        <section className="green-hero-card" id="project">
          <div className="hero-header">
            <h2>Project & Field Setup</h2>
            <div className="hero-actions">
              <button className="btn-outline" onClick={exportCsv}>
                Export CSV
              </button>
              <button className="btn-outline" onClick={exportPdf}>
                Export PDF
              </button>
            </div>
          </div>
          <div className="hero-grid">
            <div className="hero-block">
              <label>Project</label>
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
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.location_text ? `- ${p.location_text}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="hero-block">
              <label>Field Officer</label>
              <select value={activeUser} onChange={(e) => setActiveUser(e.target.value)}>
                <option value="">Select staff</option>
                {users.map((u) => (
                  <option key={u.id} value={u.full_name}>
                    {u.full_name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
            <div className="hero-block">
              <label>Active Project</label>
              <div className="hero-pill">
                {activeProject ? activeProject.name : "No project selected"}
              </div>
              <span className="hero-sub">
                {activeProject?.location_text || "Select a project to begin"}
              </span>
            </div>
          </div>
          <div className="stats-grid">
            <div>
              <span>Total</span>
              <strong>{activeProject?.stats?.total ?? 0}</strong>
            </div>
            <div>
              <span>Alive</span>
              <strong>{activeProject?.stats?.alive ?? 0}</strong>
            </div>
            <div>
              <span>Dead</span>
              <strong>{activeProject?.stats?.dead ?? 0}</strong>
            </div>
            <div>
              <span>Needs Attention</span>
              <strong>{activeProject?.stats?.needs_attention ?? 0}</strong>
            </div>
            <div>
              <span>Survival</span>
              <strong>{activeProject?.stats?.survival_rate ?? 0}%</strong>
            </div>
          </div>
        </section>

        <section className="green-tiles">
          <button
            className={`green-tile ${activeSection === "tasks" ? "active" : ""}`}
            onClick={() => setActiveSection("tasks")}
            type="button"
          >
            <span className="tile-icon">📝</span>
            <span>Maintenance Tasks</span>
            <span className="tile-badge">{myTaskCounts.pending}</span>
          </button>
          <button
            className={`green-tile ${activeSection === "map" ? "active" : ""}`}
            onClick={() => setActiveSection("map")}
            type="button"
          >
            <span className="tile-icon">🗺️</span>
            <span>Map & Add Trees</span>
            {pendingPlanting > 0 && <span className="tile-badge">{pendingPlanting}</span>}
          </button>
          <button
            className={`green-tile ${activeSection === "records" ? "active" : ""}`}
            onClick={() => setActiveSection("records")}
            type="button"
          >
            <span className="tile-icon">🌳</span>
            <span>Tree Records</span>
            <span className="tile-badge">{myTreeSummary.total}</span>
          </button>
        </section>

        {activeProject ? (
          <>
            {activeUser && activeSection === "tasks" && (
              <section className="green-card" id="tasks">
                <div className="green-card-header">
                  <h3>Maintenance Tasks</h3>
                  <button className="btn-outline" onClick={loadMyTasks}>
                    Refresh
                  </button>
                </div>
                {myTasks.length === 0 ? (
                  <p>No tasks assigned.</p>
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
                      <div
                        key={t.id}
                        className="tree-row task-row"
                        onClick={() => {
                          if (Number.isFinite(t.lng) && Number.isFinite(t.lat)) {
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
                          <select
                            value={taskEdits[t.id]?.status || t.status}
                            onChange={(e) =>
                              setTaskEdits((prev) => ({
                                ...prev,
                                [t.id]: {
                                  status: e.target.value,
                                  notes: prev[t.id]?.notes || "",
                                  photo_url: prev[t.id]?.photo_url || "",
                                },
                              }))
                            }
                          >
                            <option value="pending">Pending</option>
                            <option value="done">Done</option>
                            <option value="overdue">Overdue</option>
                          </select>
                        </span>
                        <span className="task-cell" data-label="Due">
                          {t.due_date || "-"}
                        </span>
                        <span className="task-cell task-actions" data-label="Action">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTaskId(t.id);
                            }}
                          >
                            Edit
                          </button>
                          {Number.isFinite(t.lng) && Number.isFinite(t.lat) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFocusPoint([{ lng: Number(t.lng), lat: Number(t.lat) }]);
                              }}
                            >
                              Locate
                            </button>
                          )}
                          {Number.isFinite(t.lng) && Number.isFinite(t.lat) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFocusPoint([{ lng: Number(t.lng), lat: Number(t.lat) }]);
                                openDirections(Number(t.lng), Number(t.lat));
                              }}
                            >
                              Directions
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {editingTaskId && (
                  <div className="tree-form">
                    <div className="tree-form-row full">
                      <label>Notes</label>
                      <textarea
                        value={taskEdits[editingTaskId]?.notes || ""}
                        onChange={(e) =>
                          setTaskEdits((prev) => ({
                            ...prev,
                            [editingTaskId]: {
                              status: prev[editingTaskId]?.status || "pending",
                              notes: e.target.value,
                              photo_url: prev[editingTaskId]?.photo_url || "",
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
                        onChange={(e) => onTaskPhotoPicked(editingTaskId, e.target.files?.[0] || null)}
                      />
                    </div>
                    <button className="btn-primary" onClick={() => saveTaskUpdate(editingTaskId)}>
                      Save Task Update
                    </button>
                  </div>
                )}
              </section>
            )}

            {activeSection === "map" && (
            <section className="green-card" id="map">
              <div className="green-card-header">
                <h3>Map & Add Trees</h3>
                <span className="map-hint">Tap a task to zoom to its tree</span>
              </div>
              <TreeMap
                trees={treePoints}
                draftPoint={
                  newTree.lng && newTree.lat ? { lng: newTree.lng, lat: newTree.lat } : null
                }
                onDraftMove={(lng, lat) => setNewTree((prev) => ({ ...prev, lng, lat }))}
                onAddTree={(lng, lat) => setNewTree((prev) => ({ ...prev, lng, lat }))}
                onSelectTree={(id) => loadTreeDetails(id)}
                onViewChange={(view) => setMapView(view)}
                fitBounds={focusPoint || activeUserPoints || allTreePoints}
              />
                <div className="tree-form">
                  <div className="tree-form-row">
                    <label>GPS</label>
                    <button className="btn-outline" type="button" onClick={useGps} disabled={gpsLoading}>
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
                    <input
                      value={newTree.species}
                      onChange={(e) => setNewTree({ ...newTree, species: e.target.value })}
                    />
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
                    <select
                      value={newTree.status}
                      onChange={(e) => setNewTree({ ...newTree, status: e.target.value })}
                    >
                      <option value="alive">Alive</option>
                      <option value="dead">Dead</option>
                      <option value="needs_attention">Needs attention</option>
                      <option value="pending_planting">Pending planting</option>
                    </select>
                  </div>
                  <div className="tree-form-row">
                    <label>Added by</label>
                    <select
                      value={activeUser}
                      onChange={(e) => setActiveUser(e.target.value)}
                    >
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
                    <textarea
                      value={newTree.notes}
                      onChange={(e) => setNewTree({ ...newTree, notes: e.target.value })}
                    />
                  </div>
                  <div className="tree-form-row full">
                    <label>Tree Photo</label>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => onPhotoPicked(e.target.files?.[0] || null)}
                    />
                    {photoPreview && (
                      <img className="tree-photo-preview" src={photoPreview} alt="Tree preview" />
                    )}
                  </div>
                  <button className="btn-primary" onClick={addTree}>
                    Add Tree
                  </button>
                </div>
            </section>
            )}

            {activeSection === "records" && (
            <section className="green-card" id="records">
              <h3>Tree Records</h3>
              {activeUser && (
                <div className="stats-grid">
                  <div>
                    <span>My Trees</span>
                    <strong>{myTreeSummary.total}</strong>
                  </div>
                  <div>
                    <span>Alive</span>
                    <strong>{myTreeSummary.alive}</strong>
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
              {loadingTrees ? (
                <p>Loading trees...</p>
              ) : (
                <div className="tree-table">
                  <div className="tree-row tree-header">
                    <span>ID</span>
                    <span>Species</span>
                    <span>Status</span>
                    <span>Actions</span>
                  </div>
                  {trees.map((t) => (
                    <div key={t.id} className="tree-row">
                      <span>#{t.id}</span>
                      <span>{t.species || "-"}</span>
                      <span>{t.status}</span>
                      <div className="tree-actions">
                        <button onClick={() => updateTreeStatus(t.id, "alive")}>Alive</button>
                        <button onClick={() => updateTreeStatus(t.id, "needs_attention")}>
                          Needs attention
                        </button>
                        <button onClick={() => updateTreeStatus(t.id, "dead")}>Dead</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            )}

            {activeSection === "records" && selectedTreeId && (
              <section className="green-card" id="timeline">
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
                    <div key={t.id} className="tree-row">
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
          </>
        ) : (
          <section className="green-card">
            <h3>Select a project to begin</h3>
            <p>Projects are created in LandCheck Work.</p>
          </section>
        )}
      </main>
    </div>
  );
}
