import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import toast from "react-hot-toast";
import * as pdfjsLib from "pdfjs-dist";
// Vite's `?url` import gives the worker its own bundled file URL - the standard, documented way to
// wire pdfjs-dist into a Vite app without a manual public/ copy step.
// eslint-disable-next-line import/no-unresolved
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { api, extractApiErrorMessage } from "../../api/client";
import "../../styles/tailwind.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// A full-page, premium work surface for live measurement and markup on a drawing - the same
// calibrate-then-measure pattern every real architecture/construction tool uses (Bluebeam Revu,
// PlanRadar SiteView): click two points of a KNOWN real-world length, enter that length, and every
// later click-to-click distance or traced-polygon area converts through that scale. Works on raster
// images directly and on PDF plan sets via pdf.js (each page rendered to a canvas at high
// resolution, then treated exactly like an uploaded image for the rest of the tool - one pipeline,
// not two). DWG/DXF stay upload/version/approval-only elsewhere; there's no in-browser CAD engine
// here to put a canvas over. Meant to be opened in its own browser tab (EstateDrawingMeasurePage),
// not embedded inline - the design below assumes it owns the full viewport. Styled with Tailwind
// utility classes (loaded only on this route via the tailwind.css import above), dark/AutoCAD-like.

const TOOL_BTN_BASE =
  "inline-flex items-center gap-1.5 h-[34px] px-3.5 rounded-lg border text-[13px] font-medium cursor-pointer transition-colors duration-150";
const TOOL_BTN_IDLE = "bg-transparent border-white/10 text-[#9aa3ad] hover:bg-[#1b2025] hover:text-[#eef1f4] hover:border-white/15";
const TOOL_BTN_ACTIVE = "bg-[#5b9cf6]/15 border-[#5b9cf6]/50 text-[#5b9cf6]";
const toolBtnClass = (active: boolean) => `${TOOL_BTN_BASE} ${active ? TOOL_BTN_ACTIVE : TOOL_BTN_IDLE}`;

const ZOOM_BTN_CLASS =
  "inline-flex items-center justify-center w-7 h-7 rounded-md border border-white/10 bg-transparent text-[#eef1f4] text-[15px] cursor-pointer";

const ANNOTATION_DELETE_CLASS =
  "flex items-center justify-center w-[22px] h-[22px] rounded-md border-0 bg-transparent text-[#6b7480] text-xs cursor-pointer shrink-0 transition-colors duration-150 hover:bg-[#f0665b]/15 hover:text-[#f0665b]";

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
    <div className="fixed inset-0 flex flex-col bg-[#0b0d10] text-[#eef1f4] overflow-hidden" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      <div className="flex items-center justify-between gap-4 px-[22px] py-[14px] border-b border-white/10 bg-[#14171b] shrink-0">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-[#eef1f4] overflow-hidden text-ellipsis whitespace-nowrap">{title}</h2>
          <small className="text-[12.5px] text-[#9aa3ad] [font-variant-numeric:tabular-nums]">{filename}{isPdf && pageCount > 1 ? ` · page ${pageNum} of ${pageCount}` : ""}</small>
        </div>
        <button
          type="button"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 bg-transparent text-[#9aa3ad] text-[15px] cursor-pointer shrink-0 transition-colors duration-150 hover:bg-[#f0665b]/10 hover:border-[#f0665b]/40 hover:text-[#f0665b]"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-2 px-[22px] py-[10px] border-b border-white/10 bg-[#14171b] flex-wrap shrink-0">
        <button type="button" className={toolBtnClass(mode === "calibrate")} onClick={() => { setMode("calibrate"); setPendingPoints([]); }} title="Click two points of a known real-world length, then enter that length">Calibrate</button>
        <button type="button" className={toolBtnClass(mode === "distance")} onClick={() => { setMode("distance"); setPendingPoints([]); }} title="Click two points to measure the distance between them">Measure distance</button>
        <button type="button" className={toolBtnClass(mode === "area")} onClick={() => { setMode("area"); setPendingPoints([]); }} title="Click each corner of an area, then click Finish area">Measure area</button>
        <button type="button" className={toolBtnClass(mode === "markup")} onClick={() => { setMode("markup"); setPendingPoints([]); }} title="Click a point to pin a note there">Add note</button>
        {mode === "area" && <button type="button" className={toolBtnClass(true)} onClick={finishArea}>Finish area ({pendingPoints.length} pts)</button>}
        {mode !== "view" && <button type="button" className={toolBtnClass(false)} onClick={() => { setMode("view"); setPendingPoints([]); }}>Cancel</button>}

        {isPdf && pageCount > 1 && (
          <>
            <span className="w-px h-[22px] bg-white/10 mx-1" />
            <span className="inline-flex items-center gap-2.5 text-[12.5px] text-[#9aa3ad] [font-variant-numeric:tabular-nums]">
              <button type="button" className="inline-flex items-center justify-center h-7 px-2.5 rounded-md border border-white/10 bg-transparent text-[#eef1f4] text-[12.5px] cursor-pointer disabled:opacity-35 disabled:cursor-default" disabled={pageNum <= 1} onClick={() => setPageNum((current) => Math.max(1, current - 1))}>‹ Prev</button>
              Page {pageNum} / {pageCount}
              <button type="button" className="inline-flex items-center justify-center h-7 px-2.5 rounded-md border border-white/10 bg-transparent text-[#eef1f4] text-[12.5px] cursor-pointer disabled:opacity-35 disabled:cursor-default" disabled={pageNum >= pageCount} onClick={() => setPageNum((current) => Math.min(pageCount, current + 1))}>Next ›</button>
            </span>
          </>
        )}

        <span className="inline-flex items-center gap-0.5 ml-auto">
          <button type="button" className={ZOOM_BTN_CLASS} onClick={() => setZoom((current) => Math.max(25, current - 25))}>−</button>
          <span className="min-w-[46px] text-center text-[12.5px] text-[#9aa3ad] [font-variant-numeric:tabular-nums]">{zoom}%</span>
          <button type="button" className={ZOOM_BTN_CLASS} onClick={() => setZoom((current) => Math.min(400, current + 25))}>+</button>
        </span>

        <span className={`inline-flex items-center gap-[7px] h-[30px] px-3 rounded-full text-xs font-semibold tracking-[0.01em] ml-2.5 border ${scale ? "bg-[#49c98b]/10 text-[#49c98b] border-[#49c98b]/30" : "bg-[#e0a13a]/10 text-[#e0a13a] border-[#e0a13a]/25"}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {scale ? `Calibrated · 1px = ${(scale * 1000).toFixed(1)}mm` : "Not calibrated"}
        </span>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex items-start justify-center overflow-auto p-7 [background:radial-gradient(circle_at_50%_0%,#15191e_0%,#0b0d10_70%)]">
          {imageUrl ? (
            <div className="shadow-[0_20px_60px_rgba(0,0,0,0.5)] rounded overflow-hidden leading-[0]">
              <img ref={imageRef} src={imageUrl} alt={title} style={{ display: "none" }} onLoad={redraw} />
              <canvas ref={canvasRef} onClick={handleCanvasClick} style={{ width: `${zoom}%`, display: "block", cursor: mode === "view" ? "default" : "crosshair" }} />
            </div>
          ) : loadError ? (
            <p className="text-[#f0665b] p-8 text-[13.5px]">{loadError}</p>
          ) : (
            <p className="text-[#9aa3ad] p-8 text-[13.5px]">{isPdf ? "Rendering PDF page..." : "Loading drawing..."}</p>
          )}
        </div>
        <div className="w-[300px] shrink-0 border-l border-white/10 bg-[#14171b] px-[18px] py-5 overflow-y-auto">
          <h4 className="m-0 mb-2.5 text-[11px] font-bold tracking-[0.08em] uppercase text-[#6b7480]">Measurements & notes</h4>
          {measurements.length ? (
            measurements.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2.5 px-2.5 py-[9px] rounded-lg mb-1 cursor-default transition-colors duration-150 hover:bg-[#1b2025]" onMouseEnter={() => setHighlightId(item.id)} onMouseLeave={() => setHighlightId(null)}>
                <span className="text-[13px] text-[#eef1f4] overflow-hidden text-ellipsis whitespace-nowrap [font-variant-numeric:tabular-nums]">{annotationSummary(item)}</span>
                <button type="button" className={ANNOTATION_DELETE_CLASS} onClick={() => void deleteAnnotation(item.id)} title="Delete">✕</button>
              </div>
            ))
          ) : <p className="text-[12.5px] text-[#6b7480] leading-[1.5] m-0">Nothing measured on this page yet.</p>}
          <h4 className="m-0 mb-2.5 mt-[22px] text-[11px] font-bold tracking-[0.08em] uppercase text-[#6b7480]">Calibration</h4>
          {calibrations.length ? (
            calibrations.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2.5 px-2.5 py-[9px] rounded-lg mb-1 cursor-default transition-colors duration-150 hover:bg-[#1b2025]" onMouseEnter={() => setHighlightId(item.id)} onMouseLeave={() => setHighlightId(null)}>
                <span className="text-[13px] text-[#eef1f4] overflow-hidden text-ellipsis whitespace-nowrap [font-variant-numeric:tabular-nums]">{item.label}</span>
                <button type="button" className={ANNOTATION_DELETE_CLASS} onClick={() => void deleteAnnotation(item.id)} title="Delete">✕</button>
              </div>
            ))
          ) : <p className="text-[12.5px] text-[#6b7480] leading-[1.5] m-0">No calibration set for this page - measurements show pixels only until you calibrate.</p>}
        </div>
      </div>
    </div>
  );
}
