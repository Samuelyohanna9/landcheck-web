import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../../api/client";
import { getEstateAuthSession } from "../../../auth/estateAuth";
import EstateIcon from "../EstateIcon";
import EstatePagination from "../EstatePagination";
import { getEstateQueryScope, invalidateEstateMutation } from "../../../query/estateQueries";

export default function StakingTab({ estateId }: { estateId: string }) {
  const estateQueryScope = getEstateQueryScope(getEstateAuthSession());
  const [tasks, setTasks] = useState<any[]>([]);
  const [actionBusy, setActionBusy] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = () => {
    api.get("/estates/staking-tasks", { params: { estate_id: estateId, page, page_size: 20 } }).then((response) => { setTasks(response.data?.items || []); setTotal(Number(response.data?.total || 0)); }).catch(() => { setTasks([]); setTotal(0); });
  };
  useEffect(load, [estateId, page]);

  const run = async (label: string, action: () => Promise<unknown>) => {
    if (actionBusy) return;
    setActionBusy(label);
    try { await action(); await invalidateEstateMutation(estateQueryScope, estateId, "staking"); toast.success(`${label} completed.`); load(); }
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

  return (
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
        <EstatePagination page={page} pageSize={20} total={total} onChange={setPage} />
      </div>
    </div>
  );
}
