import { useMemo } from "react";
import EstateIcon from "./EstateIcon";
import Spinner from "./EstateSpinner";

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
  onDecision: (reviewId: number, status: "approved" | "rejected", asBoundary?: boolean) => void;
  onStartGeoreference: (file: File) => void;
  onOpenGeoreference: (sessionId: string, reviewId: number) => void;
  message?: string;
  messageTone?: "good" | "danger";
  busy?: boolean;
  asBoundary?: boolean;
  onAsBoundaryChange?: (value: boolean) => void;
};

export const LAYOUT_IMPORT_METHODS: Array<{ key: EstateLayoutMethod; icon: import("./EstateIcon").EstateIconName; title: string; description: string; accept: string }> = [
  { key: "csv", icon: "documents", title: "Spreadsheet", description: "CSV or Excel-style coordinate rows", accept: ".csv,text/csv" },
  { key: "geojson", icon: "map", title: "GIS file", description: "Digital layout from your mapping software", accept: ".json,.geojson,application/geo+json" },
  { key: "dxf", icon: "development", title: "CAD drawing", description: "Digital drawing from your surveyor or designer", accept: ".dxf,application/dxf" },
  { key: "scanned-layout", icon: "image", title: "Scanned plan", description: "Image of a paper layout", accept: ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" },
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

export default function EstateLayoutImport({ method, reviews, files, onFileChange, onUpload, onDecision, onStartGeoreference, onOpenGeoreference, message, messageTone = "good", busy = false, asBoundary = false, onAsBoundaryChange }: Props) {
  const latest = reviews[0];
  const usableCount = latest?.candidates?.filter((candidate) => candidate.valid !== false && candidate.geometry?.type === "Polygon").length || 0;
  const selectedMethod = LAYOUT_IMPORT_METHODS.find((item) => item.key === method) || LAYOUT_IMPORT_METHODS[0];
  const file = files[method];
  const isGeoreferenceMethod = method === "scanned-layout";
  // Only a still-open session should replace the upload option - once one is approved (its plots
  // already added) it must fall through to the upload dropzone below, the same way CSV/GIS/CAD
  // reviews never hide their own upload option. Without the status check here, uploading a second
  // scanned plan after the first was ever completed was permanently impossible.
  const georeferenceReview = reviews.find((review) => Boolean(review.session_id) && review.status === "review_required");

  return (
    <div>
        {isGeoreferenceMethod ? (
          georeferenceReview ? (
            <div style={{ boxSizing: "border-box", display: "block", width: "100%", marginTop: 4, padding: 13, border: "1px solid var(--edash-border-soft)", borderRadius: "var(--edash-radius-md)", background: "#fff" }}>
              <div style={{ display: "block", width: "100%" }}>
                <span className="edash-status-row-title" style={{ display: "block", width: "100%" }}>Georeferencing in progress</span>
              </div>
              <p className="edash-status-row-desc" style={{ display: "block", width: "100%", marginTop: 3, marginBottom: 10, whiteSpace: "normal" }}>
                Place control points and trace the plot boundaries. When you finish, LandCheck will add the plots to this Estate and bring you back here.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="edash-btn-primary" style={{ display: "inline-flex", width: "auto" }} disabled={busy} onClick={() => onOpenGeoreference(georeferenceReview.session_id!, georeferenceReview.id)}>
                  {busy ? <><Spinner size={13} /> Opening...</> : <><EstateIcon name="map" /> Continue georeferencing</>}
                </button>
                <button
                  type="button"
                  className="edash-btn-outline"
                  style={{ display: "inline-flex", width: "auto" }}
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm("Discard this in-progress scan and start afresh? Anything already placed on it will be lost.")) return;
                    onDecision(georeferenceReview.id, "rejected");
                    onFileChange(method, null);
                  }}
                >
                  Discard and start afresh
                </button>
              </div>
            </div>
          ) : (
            <div className="edash-upload-dropzone">
              <label className="edash-upload-dropzone-input">
                <EstateIcon name="upload" />
                <span>{file ? file.name : "Choose a scanned plan image (JPG, PNG or WEBP)"}</span>
                <input type="file" accept={selectedMethod.accept} onChange={(event) => onFileChange(method, event.target.files?.[0] || null)} />
              </label>
              <p className="edash-status-row-desc">Set the plan's position, trace its plot boundaries, and finish to add them to this Estate.</p>
              <button type="button" className="edash-btn-primary" disabled={!file || busy} onClick={() => file && onStartGeoreference(file)}>
                {busy ? <><Spinner size={13} /> Starting...</> : "Start georeferencing"}
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
            {onAsBoundaryChange && (
              <label className="edash-toggle" style={{ marginTop: 2 }}>
                <input type="checkbox" checked={asBoundary} onChange={(event) => onAsBoundaryChange(event.target.checked)} />
                This file contains only the Estate boundary (one outline, not individual plots)
              </label>
            )}
            <button type="button" className="edash-btn-primary" disabled={!file || busy} onClick={() => onUpload(method)}>
              {busy ? <><Spinner size={13} /> Preparing preview...</> : "Upload and preview"}
            </button>
          </div>
        )}

        {message && <p className={`edash-banner tone-${messageTone}`} style={{ margin: "10px 0" }} role="status">{message}</p>}

        {latest && !isGeoreferenceMethod && (
          <div className="edash-info-card" style={{ flexDirection: "column", marginTop: 14 }}>
            <div className="edash-info-card-head">
              <span className="edash-status-row-title">{latest.status === "review_required" ? "Review your layout" : `Layout ${latest.status}`}</span>
              <span className={`edash-status-pill tone-${usableCount ? "good" : "warn"}`}>{usableCount} usable</span>
            </div>
            <p className="edash-status-row-desc" style={{ marginBottom: 10 }}>
              {asBoundary
                ? (usableCount === 1 ? "1 shape found - it will become your Estate boundary." : usableCount > 1 ? `${usableCount} shapes found, but a boundary import needs exactly one outline. Uncheck the boundary option to add these as separate plots instead.` : "No usable shape was found in this file - see the details below.")
                : (usableCount ? `${usableCount} plot${usableCount === 1 ? "" : "s"} found. Check the preview, then add them to your Estate.` : "No usable plots were found in this file - see the details below.")}
            </p>
            <LayoutPreview review={latest} />
            <InvalidRowsList review={latest} />
            {latest.status === "review_required" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" className="edash-btn-primary" disabled={busy || (asBoundary ? usableCount !== 1 : usableCount === 0)} onClick={() => onDecision(latest.id, "approved", asBoundary)}>{asBoundary ? "Set as Estate boundary" : "Approve and add plots"}</button>
                <button type="button" className="edash-btn-outline" disabled={busy} onClick={() => onDecision(latest.id, "rejected", asBoundary)}>Discard</button>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
