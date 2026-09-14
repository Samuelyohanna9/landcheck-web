import { useState } from "react";
import EstateIcon from "./EstateIcon";

type LayoutCriteria = {
  target_plot_area_sqm: number;
  road_width_m: number;
  edge_reserve_m: number;
  drainage_reserve_m: number;
  open_space_percent: number;
  frontage_m?: number | null;
  orientation_deg: number;
  plot_prefix: string;
  max_plots: number;
  include_open_space: boolean;
  include_drainage: boolean;
  include_roads: boolean;
};

type Props = {
  boundaryPresent: boolean;
  proposal: any | null;
  busy?: boolean;
  message?: string;
  onGenerate: (criteria: LayoutCriteria) => void;
  onDecision: (proposalId: number, status: "approved" | "rejected") => void;
};

const DEFAULT_CRITERIA: LayoutCriteria = {
  target_plot_area_sqm: 500,
  road_width_m: 10,
  edge_reserve_m: 5,
  drainage_reserve_m: 3,
  open_space_percent: 10,
  frontage_m: null,
  orientation_deg: 0,
  plot_prefix: "P",
  max_plots: 500,
  include_open_space: true,
  include_drainage: true,
  include_roads: true,
};

const coordinatePairs = (value: any): number[][] => {
  if (!Array.isArray(value)) return [];
  if (value.length >= 2 && value.every((item) => typeof item === "number")) return [value as number[]];
  return value.flatMap(coordinatePairs);
};

function LayoutPreview({ proposal }: { proposal: any }) {
  const geometries = [
    ...(proposal?.candidates || []).map((candidate: any) => ({ geometry: candidate.geometry, kind: "plot", label: candidate.plot_number })),
    ...(proposal?.features || []).map((feature: any) => ({ geometry: feature.geometry, kind: feature.feature_type, label: feature.name })),
  ];
  const coordinates = geometries.flatMap((item) => coordinatePairs(item.geometry?.coordinates));
  if (!coordinates.length) return <p className="edash-tab-empty">Your preview will appear here.</p>;
  const lngs = coordinates.map((coordinate) => coordinate[0]);
  const lats = coordinates.map((coordinate) => coordinate[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const project = (coordinate: number[]) => `${8 + ((coordinate[0] - minLng) / Math.max(maxLng - minLng, 0.000001)) * 84},${92 - ((coordinate[1] - minLat) / Math.max(maxLat - minLat, 0.000001)) * 84}`;
  const firstRing = (geometry: any): number[][] => {
    if (!geometry) return [];
    if (geometry.type === "Polygon") return geometry.coordinates?.[0] || [];
    if (geometry.type === "MultiPolygon") return geometry.coordinates?.[0]?.[0] || [];
    return [];
  };
  const linePoints = (geometry: any): string => coordinatePairs(geometry?.coordinates).map(project).join(" ");

  return (
    <div className="edash-layout-preview" aria-label="Generated layout preview">
      <svg viewBox="0 0 100 100" role="img" aria-label={`${proposal.candidates?.length || 0} generated plots`} style={{ height: 220 }}>
        {geometries.filter((item) => item.kind === "road").map((item, index) => <polyline key={`road-${index}`} fill="none" stroke="#445066" strokeWidth="0.8" points={linePoints(item.geometry)} />)}
        {geometries.filter((item) => item.kind === "drainage").map((item, index) => <polygon key={`drainage-${index}`} fill="rgba(42,120,214,0.18)" stroke="#2a78d6" strokeWidth="0.4" points={firstRing(item.geometry).map(project).join(" ")} />)}
        {geometries.filter((item) => item.kind === "open_space").map((item, index) => <polygon key={`space-${index}`} fill="rgba(30,138,76,0.14)" stroke="#1e8a4c" strokeWidth="0.4" points={firstRing(item.geometry).map(project).join(" ")} />)}
        {geometries.filter((item) => item.kind === "plot").map((item, index) => <g key={`plot-${index}`}><polygon points={firstRing(item.geometry).map(project).join(" ")} /><text x={firstRing(item.geometry).length ? firstRing(item.geometry).map(project).map((value) => Number(value.split(",")[0])).reduce((sum, value) => sum + value, 0) / firstRing(item.geometry).length : 50} y={firstRing(item.geometry).length ? firstRing(item.geometry).map(project).map((value) => Number(value.split(",")[1])).reduce((sum, value) => sum + value, 0) / firstRing(item.geometry).length : 50}>{item.label}</text></g>)}
      </svg>
      <span>{proposal.candidates?.length || 0} plots in this draft</span>
    </div>
  );
}

export default function EstateLayoutDesigner({ boundaryPresent, proposal, busy = false, message, onGenerate, onDecision }: Props) {
  const [criteria, setCriteria] = useState<LayoutCriteria>(DEFAULT_CRITERIA);
  const [open, setOpen] = useState(false);
  const setNumber = (key: keyof LayoutCriteria, value: string) => setCriteria((current) => ({ ...current, [key]: Number(value) }));

  return (
    <div className="edash-card">
      <div className="edash-card-inner">
        <div className="edash-card-head">
          <h3 className="edash-card-title">Design a layout automatically</h3>
          <span className="edash-step-badge">Next step</span>
        </div>
        <p className="edash-status-row-desc" style={{ marginBottom: 14 }}>Set a few simple preferences. LandCheck will draw a first layout with plots, access roads and shared open space for your planner to review.</p>

        {!boundaryPresent && <p className="edash-tab-empty">Add the Estate boundary first, then you can create a layout from it.</p>}

        {boundaryPresent && (
          <details open={open || !proposal} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)} className="edash-onboard-advanced" style={{ marginBottom: 14 }}>
            <summary>Create an automatic layout</summary>
            <div className="edash-form-grid" style={{ marginTop: 10 }}>
              <div className="edash-form-row">
                <label className="edash-field"><span>Target plot size (m²)</span><input type="number" min="100" value={criteria.target_plot_area_sqm} onChange={(event) => setNumber("target_plot_area_sqm", event.target.value)} /></label>
                <label className="edash-field"><span>Road width (m)</span><input type="number" min="4" value={criteria.road_width_m} onChange={(event) => setNumber("road_width_m", event.target.value)} /></label>
                <label className="edash-field"><span>Open space (%)</span><input type="number" min="0" max="40" value={criteria.open_space_percent} onChange={(event) => setNumber("open_space_percent", event.target.value)} /></label>
              </div>
              <div className="edash-form-row">
                <label className="edash-field"><span>Edge reserve (m)</span><input type="number" min="0" value={criteria.edge_reserve_m} onChange={(event) => setNumber("edge_reserve_m", event.target.value)} /></label>
                <label className="edash-field"><span>Drainage reserve (m)</span><input type="number" min="0" value={criteria.drainage_reserve_m} onChange={(event) => setNumber("drainage_reserve_m", event.target.value)} /></label>
                <label className="edash-field"><span>Plot label prefix</span><input value={criteria.plot_prefix} onChange={(event) => setCriteria((current) => ({ ...current, plot_prefix: event.target.value }))} /></label>
              </div>
              <p className="edash-field-note">These are starting assumptions, not planning approval. Your qualified planner should confirm roads, drainage, access and plot standards before publishing.</p>
              <button type="button" className="edash-btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => onGenerate(criteria)}>
                <EstateIcon name="plots" /> {busy ? "Creating draft..." : "Create draft layout"}
              </button>
            </div>
          </details>
        )}

        {message && <p className="edash-tab-empty" style={{ textAlign: "left", padding: "4px 0" }}>{message}</p>}

        {proposal && (
          <div className="edash-info-card" style={{ flexDirection: "column" }}>
            <div className="edash-info-card-head">
              <span className="edash-status-row-title">{proposal.status === "review_required" ? "Your draft layout is ready" : `Layout ${proposal.status}`}</span>
            </div>
            <p className="edash-status-row-desc">{proposal.diagnostics?.estimated_plot_count || proposal.candidates?.length || 0} plots, about {Math.round(Number(proposal.diagnostics?.total_plot_area_sqm || 0)).toLocaleString()} m² of plot area.</p>
            <p className="edash-status-row-desc" style={{ marginBottom: 10 }}>{proposal.diagnostics?.road_count || 0} access roads and {Number(proposal.diagnostics?.open_space_percent || 0).toFixed(1)}% open-space reserve.</p>
            <LayoutPreview proposal={proposal} />
            {proposal.status === "review_required" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" className="edash-btn-primary" disabled={busy} onClick={() => onDecision(proposal.id, "approved")}>Approve and add plots</button>
                <button type="button" className="edash-btn-outline" disabled={busy} onClick={() => onDecision(proposal.id, "rejected")}>Discard</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
