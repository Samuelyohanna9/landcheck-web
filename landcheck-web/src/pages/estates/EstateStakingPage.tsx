import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";

export default function EstateStakingPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [actionBusy, setActionBusy] = useState("");

  const load = () => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data.name)).catch(() => undefined);
    api.get("/estates/staking-tasks").then((response) => setTasks((response.data || []).filter((item: any) => item.estate_id === Number(estateId)))).catch(() => setTasks([]));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };
  useEffect(load, [estateId]);

  const run = async (label: string, action: () => Promise<unknown>) => {
    if (actionBusy) return;
    setActionBusy(label);
    try { await action(); toast.success(`${label} completed.`); load(); }
    catch (error) { toast.error(await extractApiErrorMessage(error, `${label} could not be completed.`)); }
    finally { setActionBusy(""); }
  };

  const downloadDgps = async (taskId: number) => {
    try {
      const response = await api.get(`/estates/staking-tasks/${taskId}/exports/dgps.csv`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url; link.download = `staking-task-${taskId}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "DGPS CSV could not be downloaded.")); }
  };

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="staking" recentActivity={activity}>
      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Staking tasks ({tasks.length})</h3></div>
          {tasks.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {tasks.map((task) => (
                <div key={task.id} className="edash-info-card" style={{ margin: 0 }}>
                  <span className="edash-info-card-icon"><EstateIcon name="staking" /></span>
                  <div className="edash-info-card-body">
                    <div className="edash-info-card-head">
                      <span className="edash-status-row-title">Task #{task.id}</span>
                      <span className="edash-status-pill tone-info">{task.status.replaceAll("_", " ")}</span>
                    </div>
                    <p className="edash-status-row-desc">{task.assigned_subject_id ? `Handled by ${task.assigned_subject_id}` : "Not yet assigned."}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button type="button" className="edash-btn-outline" onClick={() => void downloadDgps(task.id)}><EstateIcon name="download" /> DGPS CSV</button>
                    {task.status === "pending" && <button type="button" className="edash-btn-primary" disabled={Boolean(actionBusy)} onClick={() => void run("Staking start", () => api.post(`/estates/staking-tasks/${task.id}/start`))}>{actionBusy === "Staking start" ? "Starting..." : "Start"}</button>}
                    {task.status === "in_progress" && <button type="button" className="edash-btn-primary" disabled={Boolean(actionBusy)} onClick={() => void run("Staking completion", () => api.post(`/estates/staking-tasks/${task.id}/complete`))}>{actionBusy === "Staking completion" ? "Completing..." : "Complete"}</button>}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="edash-tab-empty">No staking tasks yet. Prepare one from a completed Survey on the Map &amp; Plots page.</p>}
        </div>
      </div>
    </EstateShell>
  );
}
