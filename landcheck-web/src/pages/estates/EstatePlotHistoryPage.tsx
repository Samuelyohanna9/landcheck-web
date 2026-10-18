import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateRibbon, { type EstateRibbonTab } from "../../components/estates/EstateRibbon";
import PlotHistoryList from "../../components/estates/PlotHistoryList";
import type { PlotHistoryEvent } from "../../utils/plotHistory";

type PlotSummary = { id: number; plot_number: string; commercial_status: string; area_sqm: number; public_address: string | null };

const STATUS_LABEL: Record<string, string> = {
  available: "Available", reserved: "Reserved", allocated: "Allocated", on_hold: "On hold",
  under_survey: "Under survey", under_staking: "Under staking", developed: "Developed",
};

export default function EstatePlotHistoryPage() {
  const { estateId, plotId } = useParams();
  const [estateName, setEstateName] = useState("");
  const [plot, setPlot] = useState<PlotSummary | null>(null);
  const [events, setEvents] = useState<PlotHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<any[]>([]);

  const load = () => {
    if (!estateId || !plotId) return;
    setLoading(true);
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data.name)).catch(() => undefined);
    api.get(`/estates/${estateId}/plots.geojson`).then((response) => {
      const feature = (response.data?.features || []).find((item: any) => String(item.properties.id) === String(plotId));
      setPlot(feature ? feature.properties : null);
    }).catch(() => setPlot(null));
    api.get(`/estates/plots/${plotId}/timeline`).then((response) => setEvents(response.data || [])).catch(() => setEvents([])).finally(() => setLoading(false));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };
  useEffect(load, [estateId, plotId]);

  if (!estateId || !plotId) return null;

  const ribbonTabs: EstateRibbonTab[] = [
    {
      key: "home",
      label: "Home",
      groups: [{ key: "data", label: "Data", buttons: [{ key: "refresh", label: "Refresh", icon: "refresh", onClick: load }] }],
    },
  ];

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="plots" recentActivity={activity}>
      <EstateRibbon tabs={ribbonTabs} />
      <Link className="edash-card-link" to={`/estates/${estateId}/plots`} style={{ display: "inline-block", marginBottom: 12 }}>&larr; Back to Plot register</Link>
      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <div>
              <h3 className="edash-card-title">Plot History{plot ? ` - ${plot.plot_number}` : ""}</h3>
              <p className="edash-status-row-desc" style={{ marginTop: 4 }}>
                Everything recorded for this plot - allocation, payments, commission payouts, customer contact, documents, survey, staking, hazard/soil screening, site updates and approval progress - newest first.
              </p>
            </div>
            {plot && <span className="edash-status-pill tone-good">{STATUS_LABEL[plot.commercial_status] || plot.commercial_status}</span>}
          </div>
          {plot && (
            <p className="edash-status-row-desc" style={{ marginBottom: 4 }}>
              {Math.round(plot.area_sqm)} m&sup2;{plot.public_address ? ` · ${plot.public_address}` : ""}
            </p>
          )}
          {loading ? <p className="edash-tab-empty">Loading...</p> : <PlotHistoryList events={events} />}
        </div>
      </div>
    </EstateShell>
  );
}
