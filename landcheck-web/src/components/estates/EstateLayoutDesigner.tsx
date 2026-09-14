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
  messageTone?: "good" | "danger";
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

// Ready-made starting points reflecting common practice on Nigerian residential estates - the
// plot sizes, road widths and reserve allowances developers and surveyors typically work from for
// each tier. These are conveniences to speed up the first draft, not statutory standards: the
// backend schema and the copy below both say so, and every value stays editable in "Fine-tune".
type LayoutTemplateKey = "affordable" | "standard" | "premium" | "luxury" | "mixed_use" | "custom";

type LayoutTemplate = {
  key: LayoutTemplateKey;
  name: string;
  density: string;
  plotSizeLabel: string;
  description: string;
  criteria: Partial<LayoutCriteria>;
};

const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    key: "affordable",
    name: "Affordable / Mass Housing",
    density: "High density",
    plotSizeLabel: "300 m² plots (≈10 x 30m)",
    description: "Maximises plot yield for mass-housing and low-cost schemes, with narrower access roads and smaller reserves - similar to typical FHA-style estates.",
    criteria: { target_plot_area_sqm: 300, frontage_m: 10, road_width_m: 9, edge_reserve_m: 3, drainage_reserve_m: 1.5, open_space_percent: 10 },
  },
  {
    key: "standard",
    name: "Standard Residential",
    density: "Medium density",
    plotSizeLabel: "450 m² plots (≈15 x 30m)",
    description: "The most common private residential estate size in Nigeria - semi-detached and terrace duplexes on standard 12m internal roads.",
    criteria: { target_plot_area_sqm: 450, frontage_m: 15, road_width_m: 12, edge_reserve_m: 4.5, drainage_reserve_m: 2, open_space_percent: 12 },
  },
  {
    key: "premium",
    name: "Premium Residential",
    density: "Low density",
    plotSizeLabel: "650 m² plots (≈18 x 36m)",
    description: "Detached duplexes and bungalows with wider frontages, roomier roads and a larger open-space allowance.",
    criteria: { target_plot_area_sqm: 650, frontage_m: 18, road_width_m: 15, edge_reserve_m: 6, drainage_reserve_m: 2.5, open_space_percent: 15 },
  },
  {
    key: "luxury",
    name: "Luxury Estate",
    density: "Very low density",
    plotSizeLabel: "1,000 m² plots (≈25 x 40m)",
    description: "Large detached plots for high-end gated estates, with boulevard-style internal roads and a generous green-space reserve.",
    criteria: { target_plot_area_sqm: 1000, frontage_m: 25, road_width_m: 18, edge_reserve_m: 9, drainage_reserve_m: 3, open_space_percent: 18 },
  },
  {
    key: "mixed_use",
    name: "Mixed-Use / Commercial Frontage",
    density: "Medium density",
    plotSizeLabel: "600 m² plots, wide frontage",
    description: "Wider shop-frontage plots for residential-commercial use, with roads sized for higher traffic and on-street parking.",
    criteria: { target_plot_area_sqm: 600, frontage_m: 20, road_width_m: 18, edge_reserve_m: 3, drainage_reserve_m: 2, open_space_percent: 8 },
  },
  {
    key: "custom",
    name: "Custom",
    density: "You decide",
    plotSizeLabel: "Set every value yourself",
    description: "Start from the system defaults and set every measurement below by hand.",
    criteria: {},
  },
];

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

export default function EstateLayoutDesigner({ boundaryPresent, proposal, busy = false, message, messageTone = "good", onGenerate, onDecision }: Props) {
  const [templateKey, setTemplateKey] = useState<LayoutTemplateKey>("standard");
  const [criteria, setCriteria] = useState<LayoutCriteria>({ ...DEFAULT_CRITERIA, ...LAYOUT_TEMPLATES.find((item) => item.key === "standard")!.criteria });
  const [open, setOpen] = useState(false);
  const setNumber = (key: keyof LayoutCriteria, value: string) => setCriteria((current) => ({ ...current, [key]: Number(value) }));
  const selectedTemplate = LAYOUT_TEMPLATES.find((item) => item.key === templateKey) || LAYOUT_TEMPLATES[0];

  const applyTemplate = (key: LayoutTemplateKey) => {
    setTemplateKey(key);
    const template = LAYOUT_TEMPLATES.find((item) => item.key === key);
    if (template) setCriteria((current) => ({ ...current, ...template.criteria }));
  };

  return (
    <div className="edash-card">
      <div className="edash-card-inner">
        <div className="edash-card-head">
          <h3 className="edash-card-title">Design a layout automatically</h3>
          <span className="edash-step-badge">Nigerian estate presets</span>
        </div>
        <p className="edash-status-row-desc" style={{ marginBottom: 14 }}>Pick a starting layout template, then fine-tune it. LandCheck will draw a first layout with plots, access roads and shared open space for your planner to review.</p>

        {!boundaryPresent && <p className="edash-tab-empty">Add the Estate boundary first, then you can create a layout from it.</p>}

        {boundaryPresent && (
          <>
            <label className="edash-field" style={{ marginBottom: 10, maxWidth: 360 }}>
              <span>Layout template</span>
              <select value={templateKey} onChange={(event) => applyTemplate(event.target.value as LayoutTemplateKey)}>
                {LAYOUT_TEMPLATES.map((template) => <option key={template.key} value={template.key}>{template.name} - {template.plotSizeLabel}</option>)}
              </select>
            </label>

            <div className="edash-layout-template-summary">
              <span className="edash-status-pill tone-info">{selectedTemplate.density}</span>
              <p>{selectedTemplate.description}</p>
            </div>

            <details open={open || !proposal} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)} className="edash-onboard-advanced" style={{ marginTop: 12, marginBottom: 14 }}>
              <summary>Fine-tune the criteria</summary>
              <div className="edash-criteria-groups">
                <div className="edash-criteria-group">
                  <h4>Plot &amp; frontage</h4>
                  <div className="edash-form-row">
                    <label className="edash-field"><span>Target plot size (m²)</span><input type="number" min="100" value={criteria.target_plot_area_sqm} onChange={(event) => setNumber("target_plot_area_sqm", event.target.value)} /></label>
                    <label className="edash-field"><span>Frontage (m)</span><input type="number" min="5" value={criteria.frontage_m ?? ""} placeholder="Auto" onChange={(event) => setCriteria((current) => ({ ...current, frontage_m: event.target.value === "" ? null : Number(event.target.value) }))} /></label>
                  </div>
                </div>

                <div className="edash-criteria-group">
                  <div className="edash-criteria-group-head">
                    <h4>Roads &amp; access</h4>
                    <label className="edash-toggle"><input type="checkbox" checked={criteria.include_roads} onChange={(event) => setCriteria((current) => ({ ...current, include_roads: event.target.checked }))} /> Include roads</label>
                  </div>
                  <div className="edash-form-row">
                    <label className="edash-field"><span>Road width (m)</span><input type="number" min="4" disabled={!criteria.include_roads} value={criteria.road_width_m} onChange={(event) => setNumber("road_width_m", event.target.value)} /></label>
                    <label className="edash-field"><span>Orientation (°)</span><input type="number" min="-180" max="180" value={criteria.orientation_deg} onChange={(event) => setNumber("orientation_deg", event.target.value)} /></label>
                  </div>
                  <p className="edash-field-note">9-12m suits internal residential streets; 15-18m suits premium or commercial-frontage estates. Orientation favours north-south facades, the common preference for cross-ventilation in Nigeria's climate.</p>
                </div>

                <div className="edash-criteria-group">
                  <div className="edash-criteria-group-head">
                    <h4>Reserves</h4>
                    <label className="edash-toggle"><input type="checkbox" checked={criteria.include_drainage} onChange={(event) => setCriteria((current) => ({ ...current, include_drainage: event.target.checked }))} /> Include drainage</label>
                  </div>
                  <div className="edash-form-row">
                    <label className="edash-field"><span>Estate edge reserve (m)</span><input type="number" min="0" value={criteria.edge_reserve_m} onChange={(event) => setNumber("edge_reserve_m", event.target.value)} /></label>
                    <label className="edash-field"><span>Drainage reserve (m)</span><input type="number" min="0" disabled={!criteria.include_drainage} value={criteria.drainage_reserve_m} onChange={(event) => setNumber("drainage_reserve_m", event.target.value)} /></label>
                  </div>
                </div>

                <div className="edash-criteria-group">
                  <div className="edash-criteria-group-head">
                    <h4>Open space</h4>
                    <label className="edash-toggle"><input type="checkbox" checked={criteria.include_open_space} onChange={(event) => setCriteria((current) => ({ ...current, include_open_space: event.target.checked }))} /> Include open space</label>
                  </div>
                  <div className="edash-form-row">
                    <label className="edash-field"><span>Open space (%)</span><input type="number" min="0" max="40" disabled={!criteria.include_open_space} value={criteria.open_space_percent} onChange={(event) => setNumber("open_space_percent", event.target.value)} /></label>
                    <label className="edash-field"><span>Plot label prefix</span><input value={criteria.plot_prefix} onChange={(event) => setCriteria((current) => ({ ...current, plot_prefix: event.target.value }))} /></label>
                  </div>
                </div>

                <label className="edash-field" style={{ maxWidth: 220 }}><span>Maximum plots to generate</span><input type="number" min="2" max="5000" value={criteria.max_plots} onChange={(event) => setNumber("max_plots", event.target.value)} /></label>

                <p className="edash-field-note">These are starting assumptions, not planning approval. Your qualified planner and the relevant planning authority remain responsible for confirming roads, drainage, access and plot standards before publishing.</p>
                <button type="button" className="edash-btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => onGenerate(criteria)}>
                  <EstateIcon name="plots" /> {busy ? "Creating draft..." : "Create draft layout"}
                </button>
              </div>
            </details>
          </>
        )}

        {message && <p className={`edash-banner tone-${messageTone}`} style={{ margin: "4px 0 10px" }} role="status">{message}</p>}

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
