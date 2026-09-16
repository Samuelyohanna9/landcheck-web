import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

export type HazardSheetSnap = "peek" | "half" | "full";

type Props = {
  headline: ReactNode;
  subline?: ReactNode;
  children: ReactNode;
  snap: HazardSheetSnap;
  onSnapChange: (snap: HazardSheetSnap) => void;
};

const PEEK_PX = 116;
const HALF_VH = 55;
const FULL_VH = 92;
const FLING_VELOCITY_PX_MS = 0.5;

// Offset (px, measured down from the sheet's own top edge at its FULL_VH height) for each snap
// state - "peek" only reveals PEEK_PX of the sheet, "half"/"full" are simple fractions of the
// viewport. Recomputed on demand (not memoized) since it only runs on drag end/resize, and
// window.innerHeight can change (mobile browser chrome show/hide) between drags.
function snapOffsetPx(snap: HazardSheetSnap): number {
  const fullPx = (FULL_VH / 100) * window.innerHeight;
  const halfPx = (HALF_VH / 100) * window.innerHeight;
  if (snap === "full") return 0;
  if (snap === "half") return fullPx - halfPx;
  return fullPx - PEEK_PX;
}

// A hand-rolled drag-to-snap sheet (pointer events only, no gesture library - matches this
// codebase's existing preference for small hand-built controls, e.g. CoordinateSystemSelect)
// for the mobile Hazard Analysis layout: the map stays full-bleed behind it at every snap state,
// and dragging the handle/header (not the scrollable body, so a drag never fights a scroll)
// moves it between peek/half/full.
export default function HazardBottomSheet({ headline, subline, children, snap, onSnapChange }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragPx, setDragPx] = useState<number | null>(null);
  const dragState = useRef<{ startY: number; startOffset: number; lastY: number; lastT: number; velocity: number } | null>(null);

  const currentOffset = dragPx ?? snapOffsetPx(snap);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    const startOffset = snapOffsetPx(snap);
    dragState.current = { startY: event.clientY, startOffset, lastY: event.clientY, lastT: performance.now(), velocity: 0 };
    setDragPx(startOffset);
  }, [snap]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag) return;
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) drag.velocity = (event.clientY - drag.lastY) / dt;
    drag.lastY = event.clientY;
    drag.lastT = now;
    const raw = drag.startOffset + (event.clientY - drag.startY);
    const minOffset = snapOffsetPx("full");
    const maxOffset = snapOffsetPx("peek");
    setDragPx(Math.min(maxOffset, Math.max(minOffset, raw)));
  }, []);

  const finishDrag = useCallback(() => {
    const drag = dragState.current;
    dragState.current = null;
    if (dragPx == null) return;
    const snaps: HazardSheetSnap[] = ["full", "half", "peek"];
    let next: HazardSheetSnap;
    if (drag && Math.abs(drag.velocity) > FLING_VELOCITY_PX_MS) {
      // A fast flick jumps one step in that direction rather than requiring the drag to travel
      // all the way there - the standard bottom-sheet feel ("swipe down to maximize the map").
      const currentIndex = snaps.reduce((best, s, i) => (Math.abs(snapOffsetPx(s) - dragPx) < Math.abs(snapOffsetPx(snaps[best]) - dragPx) ? i : best), 0);
      const direction = drag.velocity > 0 ? 1 : -1; // positive velocity = moving down = toward peek
      next = snaps[Math.min(snaps.length - 1, Math.max(0, currentIndex + direction))];
    } else {
      next = snaps.reduce((best, s) => (Math.abs(snapOffsetPx(s) - dragPx) < Math.abs(snapOffsetPx(best) - dragPx) ? s : best), "half" as HazardSheetSnap);
    }
    setDragPx(null);
    onSnapChange(next);
  }, [dragPx, onSnapChange]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    finishDrag();
  }, [finishDrag]);

  // If the browser chrome resizes (address bar show/hide) mid-session while not dragging, re-snap
  // to the same named state so it doesn't visually drift to an in-between offset.
  useEffect(() => {
    const onResize = () => { if (!dragState.current) setDragPx(null); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div
      ref={sheetRef}
      className={`hazard-sheet${dragPx != null ? " is-dragging" : ""}`}
      style={{ transform: `translateY(${currentOffset}px)` }}
    >
      <div
        className="hazard-sheet-drag-region"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="hazard-sheet-handle" />
        <div className="hazard-sheet-headline">
          <div>
            <div className="hazard-sheet-headline-title">{headline}</div>
            {subline && <div className="hazard-sheet-headline-sub">{subline}</div>}
          </div>
          <button
            type="button"
            className="hazard-sheet-snap-btn"
            onClick={() => onSnapChange(snap === "full" ? "peek" : snap === "peek" ? "half" : "full")}
            aria-label={snap === "full" ? "Collapse to show more map" : "Expand for more detail"}
          >
            {snap === "full" ? "▾" : "▴"}
          </button>
        </div>
      </div>
      <div className="hazard-sheet-body">{children}</div>
    </div>
  );
}
