import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import { money } from "../../components/estates/FinancialComponents";
import EstateShell from "../../components/estates/EstateShell";
import Spinner from "../../components/estates/EstateSpinner";

export default function EstateReportsPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("");
  const [dashboard, setDashboard] = useState<any>(null);
  const [quality, setQuality] = useState<any>(null);
  const [hazards, setHazards] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [reportBusy, setReportBusy] = useState(false);

  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data.name)).catch(() => undefined);
    api.get(`/estates/${estateId}/dashboard`).then((response) => setDashboard(response.data)).catch(() => setDashboard(null));
    api.get(`/estates/${estateId}/quality-check`).then((response) => setQuality(response.data)).catch(() => setQuality(null));
    api.get(`/estates/${estateId}/hazards`).then((response) => setHazards(response.data)).catch(() => setHazards(null));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  }, [estateId]);

  const downloadReport = async () => {
    if (!estateId) return;
    setReportBusy(true);
    try {
      const response = await api.get(`/estates/${estateId}/exports/report.pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url; link.download = `${estateName || "estate"}-performance-report.pdf`; link.click(); URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The report PDF could not be generated."));
    } finally {
      setReportBusy(false);
    }
  };

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="reports" recentActivity={activity}>
      <div className="edash-section-head">
        <button type="button" className="edash-btn-primary" disabled={reportBusy} onClick={() => void downloadReport()}>
          {reportBusy ? <><Spinner size={13} /> Generating...</> : "Download report (PDF)"}
        </button>
      </div>
      <div className="edash-bottom-row">
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Inventory</h3></div>
            {dashboard ? (
              <div className="edash-overview-grid edash-overview-grid--2">
                <div className="edash-overview-field"><span>Total plots</span><strong>{dashboard.total_plots}</strong></div>
                <div className="edash-overview-field"><span>Available</span><strong>{dashboard.statuses?.available || 0}</strong></div>
                <div className="edash-overview-field"><span>Allocated</span><strong>{dashboard.statuses?.allocated || 0}</strong></div>
                <div className="edash-overview-field"><span>Reserved</span><strong>{dashboard.statuses?.reserved || 0}</strong></div>
                <div className="edash-overview-field"><span>Mapped area</span><strong>{Number(dashboard.mapped_area_sqm || 0).toLocaleString()} m²</strong></div>
                <div className="edash-overview-field"><span>Geometry issues</span><strong>{dashboard.geometry_issues || 0}</strong></div>
              </div>
            ) : <p className="edash-tab-empty">Loading...</p>}
          </div>
        </div>
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Financial</h3></div>
            {dashboard ? (
              <div className="edash-overview-grid edash-overview-grid--2">
                <div className="edash-overview-field"><span>Contracted</span><strong>{money(dashboard.financial?.contracted_sales_value || 0)}</strong></div>
                <div className="edash-overview-field"><span>Confirmed</span><strong>{money(dashboard.financial?.confirmed_collections || 0)}</strong></div>
                <div className="edash-overview-field"><span>Pending</span><strong>{money(dashboard.financial?.pending_collections || 0)}</strong></div>
                <div className="edash-overview-field"><span>Outstanding</span><strong>{money(dashboard.financial?.outstanding_balance || 0)}</strong></div>
              </div>
            ) : <p className="edash-tab-empty">Loading...</p>}
          </div>
        </div>
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Geometry &amp; hazard</h3></div>
            <p className="edash-status-row-desc">{quality ? (quality.review_required ? `Review required: ${quality.issues.length} issue(s) across ${quality.plot_count} plots.` : `Geometry ready across ${quality.plot_count} plots.`) : "Loading..."}</p>
            <p className="edash-status-row-desc" style={{ marginTop: 8 }}>{hazards ? `${hazards.assessment_count || 0} hazard assessment(s) recorded.` : "No hazard data yet."}</p>
          </div>
        </div>
      </div>
      <p className="edash-tab-empty" style={{ textAlign: "left", padding: "6px 2px" }}>
        The figures below reflect what's currently on file for this Estate. "Download report" generates a full branded PDF - covering inventory, financials, a layout snapshot, geometry/hazard status and recent activity - suitable for sharing with investors, partners or your board.
      </p>
    </EstateShell>
  );
}
