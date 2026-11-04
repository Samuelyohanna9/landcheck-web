import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import toast from "react-hot-toast";
import * as stylex from "@stylexjs/stylex";
import * as pdfjsLib from "pdfjs-dist";
// Vite's `?url` import gives the worker its own bundled file URL - the standard, documented way to
// wire pdfjs-dist into a Vite app without a manual public/ copy step.
// eslint-disable-next-line import/no-unresolved
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { api, extractApiErrorMessage } from "../../api/client";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// A full-page, premium work surface for live measurement and markup on a drawing - the same
// calibrate-then-measure pattern every real architecture/construction tool uses (Bluebeam Revu,
// PlanRadar SiteView): click two points of a KNOWN real-world length, enter that length, and every
// later click-to-click distance or traced-polygon area converts through that scale. Works on raster
// images directly and on PDF plan sets via pdf.js (each page rendered to a canvas at high
// resolution, then treated exactly like an uploaded image for the rest of the tool - one pipeline,
// not two). DWG/DXF stay upload/version/approval-only elsewhere; there's no in-browser CAD engine
// here to put a canvas over. Meant to be opened in its own browser tab (EstateDrawingMeasurePage),
// not embedded inline - the design below assumes it owns the full viewport.

const ink = {
  canvas: "#0b0d10",
  surface: "#14171b",
  surfaceRaised: "#1b2025",
  line: "rgba(255,255,255,0.08)",
  lineStrong: "rgba(255,255,255,0.14)",
  text: "#eef1f4",
  textMuted: "#9aa3ad",
  textFaint: "#6b7480",
  accent: "#5b9cf6",
  accentDim: "rgba(91,156,246,0.14)",
  good: "#49c98b",
  warn: "#e0a13a",
  danger: "#f0665b",
} as const;

const styles = stylex.create({
  page: {
    position: "fixed",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    background: ink.canvas,
    color: ink.text,
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    overflow: "hidden",
  },
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "14px 22px",
    borderBottom: `1px solid ${ink.line}`,
    background: ink.surface,
    flexShrink: 0,
  },
  headTitleBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  },
  headTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    color: ink.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headMeta: {
    fontSize: 12.5,
    color: ink.textMuted,
    fontVariantNumeric: "tabular-nums",
  },
  closeBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 8,
    border: `1px solid ${ink.line}`,
    background: "transparent",
    color: ink.textMuted,
    fontSize: 15,
    cursor: "pointer",
    flexShrink: 0,
    transition: "background 0.12s ease, color 0.12s ease, border-color 0.12s ease",
    ":hover": {
      background: "rgba(240,102,91,0.12)",
      borderColor: "rgba(240,102,91,0.4)",
      color: ink.danger,
    },
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 22px",
    borderBottom: `1px solid ${ink.line}`,
    background: ink.surface,
    flexWrap: "wrap",
    flexShrink: 0,
  },
  toolBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 34,
    padding: "0 14px",
    borderRadius: 8,
    border: `1px solid ${ink.line}`,
    background: "transparent",
    color: ink.textMuted,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 0.12s ease, color 0.12s ease, border-color 0.12s ease",
    ":hover": {
      background: ink.surfaceRaised,
      color: ink.text,
      borderColor: ink.lineStrong,
    },
  },
  toolBtnActive: {
    background: ink.accentDim,
    borderColor: "rgba(91,156,246,0.5)",
    color: ink.accent,
  },
  divider: {
    width: 1,
    height: 22,
    background: ink.line,
    margin: "0 4px",
  },
  pageNav: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12.5,
    color: ink.textMuted,
    fontVariantNumeric: "tabular-nums",
  },
  pageNavBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 28,
    padding: "0 10px",
    borderRadius: 6,
    border: `1px solid ${ink.line}`,
    background: "transparent",
    color: ink.text,
    fontSize: 12.5,
    cursor: "pointer",
    ":disabled": {
      opacity: 0.35,
      cursor: "default",
    },
  },
  zoom: {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    marginLeft: "auto",
  },
  zoomBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 6,
    border: `1px solid ${ink.line}`,
    background: "transparent",
    color: ink.text,
    fontSize: 15,
    cursor: "pointer",
  },
  zoomValue: {
    minWidth: 46,
    textAlign: "center",
    fontSize: 12.5,
    color: ink.textMuted,
    fontVariantNumeric: "tabular-nums",
  },
  scaleBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    height: 30,
    padding: "0 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.01em",
    marginLeft: 10,
  },
  scaleBadgeOn: {
    background: "rgba(73,201,139,0.12)",
    color: ink.good,
    border: "1px solid rgba(73,201,139,0.3)",
  },
  scaleBadgeOff: {
    background: "rgba(224,161,58,0.1)",
    color: ink.warn,
    border: "1px solid rgba(224,161,58,0.28)",
  },
  scaleDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    background: "currentColor",
  },
  body: {
    flex: 1,
    display: "flex",
    minHeight: 0,
  },
  canvasArea: {
    flex: 1,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    overflow: "auto",
    padding: 28,
    background: `radial-gradient(circle at 50% 0%, #15191e 0%, ${ink.canvas} 70%)`,
  },
  canvasFrame: {
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
    borderRadius: 4,
    overflow: "hidden",
    lineHeight: 0,
  },
  statusText: {
    color: ink.textMuted,
    padding: 32,
    fontSize: 13.5,
  },
  statusTextError: {
    color: ink.danger,
    padding: 32,
    fontSize: 13.5,
  },
  sidePanel: {
    width: 300,
    flexShrink: 0,
    borderLeft: `1px solid ${ink.line}`,
    background: ink.surface,
    padding: "20px 18px",
    overflowY: "auto",
  },
  sidePanelHeading: {
    margin: "0 0 10px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: ink.textFaint,
  },
  sidePanelHeadingSpaced: {
    marginTop: 22,
  },
  annotationRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "9px 10px",
    borderRadius: 8,
    marginBottom: 4,
    cursor: "default",
    transition: "background 0.12s ease",
    ":hover": {
      background: ink.surfaceRaised,
    },
  },
  annotationLabel: {
    fontSize: 13,
    color: ink.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  },
  annotationDelete: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: ink.textFaint,
    fontSize: 12,
    cursor: "pointer",
    flexShrink: 0,
    transition: "background 0.12s ease, color 0.12s ease",
    ":hover": {
      background: "rgba(240,102,91,0.14)",
      color: ink.danger,
    },
  },
  emptyHint: {
    fontSize: 12.5,
    color: ink.textFaint,
    lineHeight: 1.5,
    margin: 0,
  },
});

type Point = { x: number; y: number };
type Annotation = { id: number; document_id: number; kind: "calibration" | "measurement" | "markup"; data: any; label: string | null; created_at: string };
type Mode = "view" | "calibrate" | "distance" | "area" | "markup";

function distancePx(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
function polygonAreaPx(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export default function DrawingMeasureTool({ documentId, filename, title, onClose }: { documentId: number; filename: string; title: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [mode, setMode] = useState<Mode>("view");
  const [pendingPoints, setPendingPoints] = useState<Point[]>([]);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const isPdf = /\.pdf$/i.test(filename);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(1);

  // Only this page's annotations - a multi-page PDF keeps each page's measurements separate.
  const pageAnnotations = useMemo(() => annotations.filter((item) => (item.data?.page || 1) === pageNum), [annotations, pageNum]);

  const scale = (() => {
    const calibrations = pageAnnotations.filter((item) => item.kind === "calibration");
    const latest = calibrations[calibrations.length - 1];
    if (!latest) return null;
    const [a, b] = latest.data.pixel_points as [Point, Point];
    const pixelLength = distancePx(a, b);
    return pixelLength > 0 ? Number(latest.data.real_length_m) / pixelLength : null;
  })();

  // ── Load the drawing: a raster image loads directly; a PDF renders its current page to a
  // high-res canvas and that becomes the "image" the rest of the tool already knows how to draw on.
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setLoadError(null);

    if (isPdf) {
      (async () => {
        try {
          const response = await api.get(`/estates/documents/${documentId}/download`, { responseType: "arraybuffer" });
          if (cancelled) return;
          const doc = await pdfjsLib.getDocument({ data: response.data }).promise;
          if (cancelled) return;
          setPdfDoc(doc);
          setPageCount(doc.numPages);
        } catch (error) {
          if (!cancelled) setLoadError(await extractApiErrorMessage(error, "Could not load this PDF."));
        }
      })();
    } else {
      api.get(`/estates/documents/${documentId}/download`, { responseType: "blob" }).then((response) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(response.data as Blob);
        setImageUrl(createdUrl);
      }).catch(async (error) => { if (!cancelled) setLoadError(await extractApiErrorMessage(error, "Could not load this drawing.")); });
    }
    return () => { cancelled = true; if (createdUrl) URL.revokeObjectURL(createdUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, isPdf]);

  // Render the current PDF page to a data URL at a crisp resolution - this becomes `imageUrl`,
  // reusing the exact same <img>/<canvas> draw pipeline as a raster upload.
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.2 });
        const offscreen = document.createElement("canvas");
        offscreen.width = viewport.width; offscreen.height = viewport.height;
        const ctx = offscreen.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setImageUrl(offscreen.toDataURL("image/png"));
      } catch (error) {
        if (!cancelled) toast.error("Could not render this PDF page.");
      }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]);

  const loadAnnotations = () => { api.get(`/estates/documents/${documentId}/annotations`).then((response) => setAnnotations(response.data || [])).catch(() => undefined); };
  useEffect(loadAnnotations, [documentId]);

  const redraw = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !image.complete || !image.naturalWidth) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);

    const drawPolyline = (points: Point[], color: string, close: boolean, lineWidthMul = 1) => {
      if (points.length < 1) return;
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(2, canvas.width / 380) * lineWidthMul;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      if (close && points.length > 2) ctx.closePath();
      ctx.stroke();
      points.forEach((point) => { ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(3, canvas.width / 260), 0, Math.PI * 2); ctx.fill(); });
    };

    for (const annotation of pageAnnotations) {
      const emphasised = annotation.id === highlightId;
      if (annotation.kind === "calibration") {
        drawPolyline(annotation.data.pixel_points, "#2a78d6", false, emphasised ? 2 : 1);
      } else if (annotation.kind === "measurement") {
        const points: Point[] = annotation.data.pixel_points;
        drawPolyline(points, annotation.data.kind === "area" ? "#1e8a4c" : "#d69100", annotation.data.kind === "area", emphasised ? 2 : 1);
        const mid = points[Math.floor(points.length / 2)];
        if (mid && annotation.label) { ctx.fillStyle = "#101827"; ctx.font = `${Math.max(15, canvas.width / 55)}px sans-serif`; ctx.fillText(annotation.label, mid.x + 6, mid.y - 6); }
      } else if (annotation.kind === "markup") {
        const { x, y } = annotation.data as Point;
        ctx.fillStyle = "#d9622a";
        ctx.beginPath(); ctx.arc(x, y, Math.max(5, canvas.width / 190) * (emphasised ? 1.4 : 1), 0, Math.PI * 2); ctx.fill();
        if (annotation.label) { ctx.fillStyle = "#101827"; ctx.font = `${Math.max(15, canvas.width / 55)}px sans-serif`; ctx.fillText(annotation.label, x + 8, y - 8); }
      }
    }
    if (pendingPoints.length) drawPolyline(pendingPoints, "#b3261e", mode === "area");
  };

  useEffect(redraw, [pageAnnotations, pendingPoints, imageUrl, mode, highlightId]);

  const saveAnnotation = async (kind: Annotation["kind"], data: any, label?: string | null) => {
    setBusy(true);
    try {
      await api.post(`/estates/documents/${documentId}/annotations`, { kind, data: { ...data, page: pageNum }, label: label || null });
      loadAnnotations();
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Could not save this.")); } finally { setBusy(false); }
  };
  const deleteAnnotation = async (id: number) => {
    try { await api.delete(`/estates/annotations/${id}`); loadAnnotations(); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Could not remove this.")); }
  };

  const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (mode === "view" || busy) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const point: Point = { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };

    if (mode === "markup") {
      const note = window.prompt("Note for this point:");
      if (note && note.trim()) void saveAnnotation("markup", point, note.trim());
      setMode("view");
      return;
    }
    const next = [...pendingPoints, point];
    if (mode === "calibrate" && next.length === 2) {
      const lengthInput = window.prompt("Real-world length of the line you just drew, in meters:");
      const length = Number(lengthInput);
      if (lengthInput && length > 0) void saveAnnotation("calibration", { pixel_points: next }, `${length}m reference`);
      setPendingPoints([]); setMode("view");
      return;
    }
    if (mode === "distance" && next.length === 2) {
      const pixelLength = distancePx(next[0], next[1]);
      const label = scale ? `${(pixelLength * scale).toFixed(2)}m` : `${pixelLength.toFixed(0)}px (calibrate first)`;
      void saveAnnotation("measurement", { pixel_points: next, kind: "distance", value_m: scale ? pixelLength * scale : null }, label);
      setPendingPoints([]); setMode("view");
      return;
    }
    setPendingPoints(next);
  };

  const finishArea = () => {
    if (pendingPoints.length < 3) { toast.error("Click at least 3 points to trace an area."); return; }
    const areaPx = polygonAreaPx(pendingPoints);
    const label = scale ? `${(areaPx * scale * scale).toFixed(2)}sqm` : `${areaPx.toFixed(0)}px² (calibrate first)`;
    void saveAnnotation("measurement", { pixel_points: pendingPoints, kind: "area", value_sqm: scale ? areaPx * scale * scale : null }, label);
    setPendingPoints([]); setMode("view");
  };

  const annotationSummary = (item: Annotation) => {
    if (item.kind === "calibration") return `Calibration - ${item.label}`;
    if (item.kind === "markup") return `Note - ${item.label}`;
    return item.label || "Measurement";
  };

  const measurements = pageAnnotations.filter((item) => item.kind !== "calibration");
  const calibrations = pageAnnotations.filter((item) => item.kind === "calibration");

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.head)}>
        <div {...stylex.props(styles.headTitleBlock)}>
          <h2 {...stylex.props(styles.headTitle)}>{title}</h2>
          <small {...stylex.props(styles.headMeta)}>{filename}{isPdf && pageCount > 1 ? ` · page ${pageNum} of ${pageCount}` : ""}</small>
        </div>
        <button type="button" {...stylex.props(styles.closeBtn)} onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div {...stylex.props(styles.toolbar)}>
        <button type="button" {...stylex.props(styles.toolBtn, mode === "calibrate" && styles.toolBtnActive)} onClick={() => { setMode("calibrate"); setPendingPoints([]); }} title="Click two points of a known real-world length, then enter that length">Calibrate</button>
        <button type="button" {...stylex.props(styles.toolBtn, mode === "distance" && styles.toolBtnActive)} onClick={() => { setMode("distance"); setPendingPoints([]); }} title="Click two points to measure the distance between them">Measure distance</button>
        <button type="button" {...stylex.props(styles.toolBtn, mode === "area" && styles.toolBtnActive)} onClick={() => { setMode("area"); setPendingPoints([]); }} title="Click each corner of an area, then click Finish area">Measure area</button>
        <button type="button" {...stylex.props(styles.toolBtn, mode === "markup" && styles.toolBtnActive)} onClick={() => { setMode("markup"); setPendingPoints([]); }} title="Click a point to pin a note there">Add note</button>
        {mode === "area" && <button type="button" {...stylex.props(styles.toolBtn, styles.toolBtnActive)} onClick={finishArea}>Finish area ({pendingPoints.length} pts)</button>}
        {mode !== "view" && <button type="button" {...stylex.props(styles.toolBtn)} onClick={() => { setMode("view"); setPendingPoints([]); }}>Cancel</button>}

        {isPdf && pageCount > 1 && (
          <>
            <span {...stylex.props(styles.divider)} />
            <span {...stylex.props(styles.pageNav)}>
              <button type="button" {...stylex.props(styles.pageNavBtn)} disabled={pageNum <= 1} onClick={() => setPageNum((current) => Math.max(1, current - 1))}>‹ Prev</button>
              Page {pageNum} / {pageCount}
              <button type="button" {...stylex.props(styles.pageNavBtn)} disabled={pageNum >= pageCount} onClick={() => setPageNum((current) => Math.min(pageCount, current + 1))}>Next ›</button>
            </span>
          </>
        )}

        <span {...stylex.props(styles.zoom)}>
          <button type="button" {...stylex.props(styles.zoomBtn)} onClick={() => setZoom((current) => Math.max(25, current - 25))}>−</button>
          <span {...stylex.props(styles.zoomValue)}>{zoom}%</span>
          <button type="button" {...stylex.props(styles.zoomBtn)} onClick={() => setZoom((current) => Math.min(400, current + 25))}>+</button>
        </span>

        <span {...stylex.props(styles.scaleBadge, scale ? styles.scaleBadgeOn : styles.scaleBadgeOff)}>
          <span {...stylex.props(styles.scaleDot)} />
          {scale ? `Calibrated · 1px = ${(scale * 1000).toFixed(1)}mm` : "Not calibrated"}
        </span>
      </div>

      <div {...stylex.props(styles.body)}>
        <div {...stylex.props(styles.canvasArea)}>
          {imageUrl ? (
            <div {...stylex.props(styles.canvasFrame)}>
              <img ref={imageRef} src={imageUrl} alt={title} style={{ display: "none" }} onLoad={redraw} />
              <canvas ref={canvasRef} onClick={handleCanvasClick} style={{ width: `${zoom}%`, display: "block", cursor: mode === "view" ? "default" : "crosshair" }} />
            </div>
          ) : loadError ? (
            <p {...stylex.props(styles.statusTextError)}>{loadError}</p>
          ) : (
            <p {...stylex.props(styles.statusText)}>{isPdf ? "Rendering PDF page..." : "Loading drawing..."}</p>
          )}
        </div>
        <div {...stylex.props(styles.sidePanel)}>
          <h4 {...stylex.props(styles.sidePanelHeading)}>Measurements & notes</h4>
          {measurements.length ? (
            measurements.map((item) => (
              <div key={item.id} {...stylex.props(styles.annotationRow)} onMouseEnter={() => setHighlightId(item.id)} onMouseLeave={() => setHighlightId(null)}>
                <span {...stylex.props(styles.annotationLabel)}>{annotationSummary(item)}</span>
                <button type="button" {...stylex.props(styles.annotationDelete)} onClick={() => void deleteAnnotation(item.id)} title="Delete">✕</button>
              </div>
            ))
          ) : <p {...stylex.props(styles.emptyHint)}>Nothing measured on this page yet.</p>}
          <h4 {...stylex.props(styles.sidePanelHeading, styles.sidePanelHeadingSpaced)}>Calibration</h4>
          {calibrations.length ? (
            calibrations.map((item) => (
              <div key={item.id} {...stylex.props(styles.annotationRow)} onMouseEnter={() => setHighlightId(item.id)} onMouseLeave={() => setHighlightId(null)}>
                <span {...stylex.props(styles.annotationLabel)}>{item.label}</span>
                <button type="button" {...stylex.props(styles.annotationDelete)} onClick={() => void deleteAnnotation(item.id)} title="Delete">✕</button>
              </div>
            ))
          ) : <p {...stylex.props(styles.emptyHint)}>No calibration set for this page - measurements show pixels only until you calibrate.</p>}
        </div>
      </div>
    </div>
  );
}
