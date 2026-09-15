import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  site_cleared: "Site cleared",
  foundation: "Foundation",
  under_construction: "Under construction",
  developed: "Developed",
};

export default function EstateDevelopmentPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("");
  const [plots, setPlots] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  const load = () => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data.name)).catch(() => undefined);
    api.get(`/estates/${estateId}/plots.geojson`).then((response) => setPlots((response.data?.features || []).map((feature: any) => feature.properties))).catch(() => setPlots([]));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };
  useEffect(load, [estateId]);

  const updateStatus = async (plotId: number, status: string) => {
    try {
      await api.patch(`/estates/plots/${plotId}/development-status`, { status });
      setPlots((current) => current.map((plot) => (plot.id === plotId ? { ...plot, development_status: status } : plot)));
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "Development status could not be saved."));
    }
  };

  const counts = plots.reduce((acc: Record<string, number>, plot) => {
    const key = plot.development_status || "not_started";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="development" recentActivity={activity}>
      <div className="edash-stats-row edash-stats-row--five">
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <div key={key} className="edash-stat-card">
            <div className="edash-stat-body">
              <p className="edash-stat-label">{label}</p>
              <p className="edash-stat-value">{counts[key] || 0}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Development status by plot</h3></div>
          {message && <p className="edash-tab-empty" style={{ padding: "4px 0" }}>{message}</p>}
          {plots.length ? (
            <div style={{ overflowX: "auto" }}>
              <table className="edash-mini-table">
                <thead><tr><th>Plot No.</th><th>Commercial status</th><th>Development status</th></tr></thead>
                <tbody>
                  {plots.map((plot) => (
                    <tr key={plot.id}>
                      <td data-label="Plot No.">{plot.plot_number}</td>
                      <td data-label="Commercial status" style={{ textTransform: "capitalize" }}>{plot.commercial_status.replaceAll("_", " ")}</td>
                      <td data-label="Development status">
                        <select className="edash-map-select" value={plot.development_status || "not_started"} onChange={(event) => void updateStatus(plot.id, event.target.value)}>
                          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="edash-tab-empty">No plots mapped yet.</p>}
        </div>
      </div>
    </EstateShell>
  );
}
