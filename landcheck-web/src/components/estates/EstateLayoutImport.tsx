import { useMemo, useState } from "react";

export type EstateLayoutMethod = "csv" | "geojson" | "dxf" | "scanned-layout";

type ImportReview = {
  id: number;
  source_type: string;
  status: string;
  candidate_count: number;
  candidates?: Array<{ plot_number?: string; valid?: boolean; geometry?: { type?: string; coordinates?: number[][][] } }>;
  created_at?: string;
};

type Props = {
  reviews: ImportReview[];
  files: Record<EstateLayoutMethod, File | null>;
  onFileChange: (method: EstateLayoutMethod, file: File | null) => void;
  onUpload: (method: EstateLayoutMethod) => void;
  onDecision: (reviewId: number, status: "approved" | "rejected") => void;
  message?: string;
  busy?: boolean;
};

const METHODS: Array<{ key: EstateLayoutMethod; title: string; description: string; accept: string }> = [
  { key: "csv", title: "Spreadsheet", description: "CSV or Excel-style coordinate rows", accept: ".csv,text/csv" },
  { key: "geojson", title: "GIS file", description: "Digital layout from your mapping software", accept: ".json,.geojson,application/geo+json" },
  { key: "dxf", title: "CAD drawing", description: "Digital drawing from your surveyor or designer", accept: ".dxf,application/dxf" },
  { key: "scanned-layout", title: "Scanned plan", description: "PDF or image of a paper layout", accept: ".pdf,image/jpeg,image/png" },
];

function LayoutPreview({ review }: { review: ImportReview }) {
  const polygons = useMemo(() => (review.candidates || []).filter((candidate) => candidate.valid !== false).flatMap((candidate) => {
    const ring = candidate.geometry?.type === "Polygon" ? candidate.geometry.coordinates?.[0] : undefined;
    return ring && ring.length >= 3 ? [{ ring, label: candidate.plot_number || "Plot" }] : [];
  }), [review.candidates]);
  const bounds = useMemo(() => {
    const all = polygons.flatMap(({ ring }) => ring);
    if (!all.length) return null;
    return {
      minX: Math.min(...all.map(([x]) => x)),
      maxX: Math.max(...all.map(([x]) => x)),
      minY: Math.min(...all.map(([, y]) => y)),
      maxY: Math.max(...all.map(([, y]) => y)),
    };
  }, [polygons]);
  if (!polygons.length || !bounds) {
    return <div className="estate-layout-preview-empty">We found no plot shapes to preview yet. Review the file and try another layout if needed.</div>;
  }
  const width = Math.max(bounds.maxX - bounds.minX, 0.000001);
  const height = Math.max(bounds.maxY - bounds.minY, 0.000001);
  const toSvg = ([x, y]: number[]) => [((x - bounds.minX) / width) * 92 + 4, 92 - ((y - bounds.minY) / height) * 84] as const;
  return (
    <div className="estate-layout-preview" aria-label="Layout preview">
      <svg viewBox="0 0 100 100" role="img" aria-label={`${polygons.length} plot layout preview`}>
        {polygons.map(({ ring, label }, index) => {
          const center = ring.reduce(([x, y], [pointX, pointY]) => [x + pointX / ring.length, y + pointY / ring.length], [0, 0]);
          return (
            <g key={`${label}-${index}`}>
              <polygon points={ring.map((point) => toSvg(point).join(",")).join(" ")} />
              <text x={toSvg(center)[0]} y={toSvg(center)[1]}>{label}</text>
            </g>
          );
        })}
      </svg>
      <span>{polygons.length} plot{polygons.length === 1 ? "" : "s"} ready to review</span>
    </div>
  );
}

export default function EstateLayoutImport({ reviews, files, onFileChange, onUpload, onDecision, message, busy = false }: Props) {
  const [method, setMethod] = useState<EstateLayoutMethod>("csv");
  const latest = reviews[0];
  const usableCount = latest?.candidates?.filter((candidate) => candidate.valid !== false && candidate.geometry?.type === "Polygon").length || 0;
  const selectedMethod = METHODS.find((item) => item.key === method) || METHODS[0];
  const file = files[method];

  return (
    <section className="estate-layout-import">
      <div className="estate-layout-import-heading">
        <div>
          <p className="workflow-eyebrow">Bring in your layout</p>
          <h2>Upload your Estate plan</h2>
          <p>Choose the format you already have. We will show you a preview before adding plots to your Estate.</p>
        </div>
        <span className="estate-step-badge">1 of 2</span>
      </div>
      <div className="estate-layout-methods" role="tablist" aria-label="Layout source">
        {METHODS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={method === item.key} className={method === item.key ? "is-selected" : ""} onClick={() => setMethod(item.key)}>
            <strong>{item.title}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </div>
      <div className="estate-layout-upload">
        <label>
          <span>{selectedMethod.title}</span>
          <input type="file" accept={selectedMethod.accept} onChange={(event) => onFileChange(method, event.target.files?.[0] || null)} />
        </label>
        <div>
          <p>{file ? <><strong>{file.name}</strong> is ready.</> : "Select your file to continue."}</p>
          <button type="button" disabled={!file || busy} onClick={() => onUpload(method)}>{busy ? "Preparing preview..." : "Upload and preview"}</button>
        </div>
      </div>
      {message && <p className="estate-layout-message" role="status">{message}</p>}
      {latest && (
        <div className="estate-layout-review">
          <div className="estate-layout-review-copy">
            <p className="workflow-eyebrow">Step 2 · Review your layout</p>
            <h3>{latest.status === "review_required" ? "Your layout is ready to check" : `Layout ${latest.status}`}</h3>
            <p>{usableCount ? `${usableCount} plot${usableCount === 1 ? "" : "s"} found. Check the preview, then add them to your Estate.` : "No usable plots were found in this file."}</p>
            {latest.status === "review_required" && <div className="estate-layout-review-actions"><button type="button" disabled={busy || usableCount === 0} onClick={() => onDecision(latest.id, "approved")}>Approve and add plots</button><button type="button" className="is-secondary" disabled={busy} onClick={() => onDecision(latest.id, "rejected")}>Discard</button></div>}
          </div>
          {latest.status === "review_required" && <LayoutPreview review={latest} />}
        </div>
      )}
    </section>
  );
}
