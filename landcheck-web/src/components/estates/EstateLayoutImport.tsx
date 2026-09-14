import { useMemo } from "react";
import EstateIcon from "./EstateIcon";

export type EstateLayoutMethod = "csv" | "geojson" | "dxf" | "scanned-layout";

type ImportReview = {
  id: number;
  source_type: string;
  status: string;
  session_id?: string | null;
  candidate_count: number;
  candidates?: Array<{ row?: number; plot_number?: string; valid?: boolean; issues?: string[]; geometry?: { type?: string; coordinates?: number[][][] } }>;
  created_at?: string;
};

type Props = {
  method: EstateLayoutMethod;
  reviews: ImportReview[];
  files: Record<EstateLayoutMethod, File | null>;
  onFileChange: (method: EstateLayoutMethod, file: File | null) => void;
  onUpload: (method: EstateLayoutMethod) => void;
  onDecision: (reviewId: number, status: "approved" | "rejected") => void;
  onStartGeoreference: (file: File) => void;
  onOpenGeoreference: (sessionId: string) => void;
  onImportFromGeoreference: (reviewId: number) => void;
  message?: string;
  busy?: boolean;
};

export const LAYOUT_IMPORT_METHODS: Array<{ key: EstateLayoutMethod; icon: import("./EstateIcon").EstateIconName; title: string; description: string; accept: string }> = [
  { key: "csv", icon: "documents", title: "Spreadsheet", description: "CSV or Excel-style coordinate rows", accept: ".csv,text/csv" },
  { key: "geojson", icon: "map", title: "GIS file", description: "Digital layout from your mapping software", accept: ".json,.geojson,application/geo+json" },
  { key: "dxf", icon: "development", title: "CAD drawing", description: "Digital drawing from your surveyor or designer", accept: ".dxf,application/dxf" },
  { key: "scanned-layout", icon: "image", title: "Scanned plan", description: "PDF or image of a paper layout", accept: ".pdf,image/jpeg,image/png" },
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
  if (!polygons.length || !bounds) return null;
  const width = Math.max(bounds.maxX - bounds.minX, 0.000001);
  const height = Math.max(bounds.maxY - bounds.minY, 0.000001);
  const toSvg = ([x, y]: number[]) => [((x - bounds.minX) / width) * 92 + 4, 92 - ((y - bounds.minY) / height) * 84] as const;
  return (
    <div className="edash-layout-preview" aria-label="Layout preview">
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

function InvalidRowsList({ review }: { review: ImportReview }) {
  const invalid = (review.candidates || []).filter((candidate) => candidate.valid === false);
  if (!invalid.length) return null;
  return (
    <div className="edash-issue-list">
      <strong>{invalid.length} row{invalid.length === 1 ? "" : "s"} could not be used:</strong>
      <ul>
        {invalid.slice(0, 6).map((candidate, index) => (
          <li key={index}>Row {candidate.row ?? index + 1}{candidate.plot_number ? ` (${candidate.plot_number})` : ""}: {candidate.issues?.[0] || "Invalid geometry"}</li>
        ))}
      </ul>
      {invalid.length > 6 && <span>+{invalid.length - 6} more</span>}
    </div>
  );
}

export default function EstateLayoutImport({ method, reviews, files, onFileChange, onUpload, onDecision, onStartGeoreference, onOpenGeoreference, onImportFromGeoreference, message, busy = false }: Props) {
  const latest = reviews[0];
  const usableCount = latest?.candidates?.filter((candidate) => candidate.valid !== false && candidate.geometry?.type === "Polygon").length || 0;
  const selectedMethod = LAYOUT_IMPORT_METHODS.find((item) => item.key === method) || LAYOUT_IMPORT_METHODS[0];
  const file = files[method];
  const isGeoreferenceMethod = method === "scanned-layout";
  const georeferenceReview = reviews.find((review) => review.source_type === "raster" && review.session_id);

  return (
    <div>
        {isGeoreferenceMethod ? (
          georeferenceReview ? (
            <div className="edash-info-card" style={{ flexDirection: "column", marginTop: 4 }}>
              <div className="edash-info-card-head"><span className="edash-status-row-title">Georeferencing in progress</span></div>
              <p className="edash-status-row-desc" style={{ marginBottom: 10 }}>
                Place ground control points and trace each plot boundary in the georeference tool, then come back here to pull the finished plots into this Estate.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="edash-btn-primary" onClick={() => onOpenGeoreference(georeferenceReview.session_id!)}>
                  <EstateIcon name="map" /> Open georeference tool
                </button>
                <button type="button" className="edash-btn-outline" disabled={busy} onClick={() => onImportFromGeoreference(georeferenceReview.id)}>
                  {busy ? "Importing..." : "Import digitized plots"}
                </button>
              </div>
            </div>
          ) : (
            <div className="edash-upload-dropzone">
              <label className="edash-upload-dropzone-input">
                <EstateIcon name="upload" />
                <span>{file ? file.name : "Choose a scanned plan (PDF, JPG or PNG)"}</span>
                <input type="file" accept={selectedMethod.accept} onChange={(event) => onFileChange(method, event.target.files?.[0] || null)} />
              </label>
              <p className="edash-status-row-desc">This opens the same georeferencing and digitizing tool Survey uses - place a few ground control points, trace each plot, then return here to import them.</p>
              <button type="button" className="edash-btn-primary" disabled={!file || busy} onClick={() => file && onStartGeoreference(file)}>
                {busy ? "Starting..." : "Start georeferencing"}
              </button>
            </div>
          )
        ) : (
          <div className="edash-upload-dropzone">
            <label className="edash-upload-dropzone-input">
              <EstateIcon name="upload" />
              <span>{file ? file.name : `Choose your ${selectedMethod.title.toLowerCase()} file`}</span>
              <input type="file" accept={selectedMethod.accept} onChange={(event) => onFileChange(method, event.target.files?.[0] || null)} />
            </label>
            <button type="button" className="edash-btn-primary" disabled={!file || busy} onClick={() => onUpload(method)}>
              {busy ? "Preparing preview..." : "Upload and preview"}
            </button>
          </div>
        )}

        {message && <p className="edash-tab-empty" style={{ padding: "8px 0", textAlign: "left" }}>{message}</p>}

        {latest && !isGeoreferenceMethod && (
          <div className="edash-info-card" style={{ flexDirection: "column", marginTop: 14 }}>
            <div className="edash-info-card-head">
              <span className="edash-status-row-title">{latest.status === "review_required" ? "Review your layout" : `Layout ${latest.status}`}</span>
              <span className={`edash-status-pill tone-${usableCount ? "good" : "warn"}`}>{usableCount} usable</span>
            </div>
            <p className="edash-status-row-desc" style={{ marginBottom: 10 }}>
              {usableCount ? `${usableCount} plot${usableCount === 1 ? "" : "s"} found. Check the preview, then add them to your Estate.` : "No usable plots were found in this file - see the details below."}
            </p>
            <LayoutPreview review={latest} />
            <InvalidRowsList review={latest} />
            {latest.status === "review_required" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" className="edash-btn-primary" disabled={busy || usableCount === 0} onClick={() => onDecision(latest.id, "approved")}>Approve and add plots</button>
                <button type="button" className="edash-btn-outline" disabled={busy} onClick={() => onDecision(latest.id, "rejected")}>Discard</button>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
