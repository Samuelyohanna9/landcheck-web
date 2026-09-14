import { useState } from "react";

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
  if (!coordinates.length) return <div className="estate-layout-preview-empty">Your preview will appear here.</div>;
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
    <div className="estate-layout-preview" aria-label="Generated layout preview">
      <svg viewBox="0 0 100 100" role="img" aria-label={`${proposal.candidates?.length || 0} generated plots`}>
        {geometries.filter((item) => item.kind === "road").map((item, index) => <polyline key={`road-${index}`} className="estate-layout-road" points={linePoints(item.geometry)} />)}
        {geometries.filter((item) => item.kind === "drainage").map((item, index) => <polygon key={`drainage-${index}`} className="estate-layout-drainage" points={firstRing(item.geometry).map(project).join(" ")} />)}
        {geometries.filter((item) => item.kind === "open_space").map((item, index) => <polygon key={`space-${index}`} className="estate-layout-open-space" points={firstRing(item.geometry).map(project).join(" ")} />)}
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
    <section className="estate-layout-designer">
      <div className="estate-layout-designer-heading">
        <div>
          <p className="workflow-eyebrow">Create your layout</p>
          <h2>Turn the Estate boundary into a draft layout</h2>
          <p>Set a few simple preferences. LandCheck will draw a first layout with plots, access roads and shared open space for your planner to review.</p>
        </div>
        <span className="estate-step-badge">Next step</span>
      </div>
      {!boundaryPresent && <p className="estate-layout-message">Add the Estate boundary first, then you can create a layout from it.</p>}
      {boundaryPresent && <details open={open || !proposal} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)} className="estate-layout-settings">
        <summary>Create an automatic layout</summary>
        <div className="estate-layout-criteria">
          <label>Target plot size (sqm)<input type="number" min="100" value={criteria.target_plot_area_sqm} onChange={(event) => setNumber("target_plot_area_sqm", event.target.value)} /></label>
          <label>Road width (m)<input type="number" min="4" value={criteria.road_width_m} onChange={(event) => setNumber("road_width_m", event.target.value)} /></label>
          <label>Open space (%)<input type="number" min="0" max="40" value={criteria.open_space_percent} onChange={(event) => setNumber("open_space_percent", event.target.value)} /></label>
          <label>Edge reserve (m)<input type="number" min="0" value={criteria.edge_reserve_m} onChange={(event) => setNumber("edge_reserve_m", event.target.value)} /></label>
          <label>Drainage reserve (m)<input type="number" min="0" value={criteria.drainage_reserve_m} onChange={(event) => setNumber("drainage_reserve_m", event.target.value)} /></label>
          <label>Plot label prefix<input value={criteria.plot_prefix} onChange={(event) => setCriteria((current) => ({ ...current, plot_prefix: event.target.value }))} /></label>
        </div>
        <p className="estate-layout-helper">These are starting assumptions, not planning approval. Your qualified planner should confirm roads, drainage, access and plot standards before publishing.</p>
        <button type="button" disabled={busy} onClick={() => onGenerate(criteria)}>{busy ? "Creating draft..." : "Create draft layout"}</button>
      </details>}
      {message && <p className="estate-layout-message" role="status">{message}</p>}
      {proposal && <div className="estate-layout-designer-review">
        <div className="estate-layout-review-copy">
          <p className="workflow-eyebrow">Review before adding plots</p>
          <h3>{proposal.status === "review_required" ? "Your draft layout is ready" : `Layout ${proposal.status}`}</h3>
          <p>{proposal.diagnostics?.estimated_plot_count || proposal.candidates?.length || 0} plots, about {Math.round(Number(proposal.diagnostics?.total_plot_area_sqm || 0)).toLocaleString()} sqm of plot area.</p>
          <p>{proposal.diagnostics?.road_count || 0} access roads and {Number(proposal.diagnostics?.open_space_percent || 0).toFixed(1)}% open-space reserve.</p>
          {proposal.status === "review_required" && <div className="estate-layout-review-actions"><button type="button" disabled={busy} onClick={() => onDecision(proposal.id, "approved")}>Approve and add plots</button><button type="button" className="is-secondary" disabled={busy} onClick={() => onDecision(proposal.id, "rejected")}>Discard</button></div>}
        </div>
        <LayoutPreview proposal={proposal} />
      </div>}
    </section>
  );
}
