import { useCallback, useEffect, useState, type RefObject } from "react";

// Shared by the georeference Control Points and Digitize canvases (and anywhere else a single
// panel benefits from a maximize toggle) - the raster/tracing surface is small by default inside
// the 3-column workspace grid, and panning/zooming precisely in that little space is difficult.
// Native Fullscreen API rather than a CSS-only "cover the viewport" trick: the browser handles
// Esc-to-exit, the fullscreen UA styles, and multi-monitor placement for free.
export function useFullscreenToggle(targetRef: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(document.fullscreenElement === targetRef.current);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, [targetRef]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    targetRef.current?.requestFullscreen?.().catch(() => {
      // Some browsers/contexts (e.g. an embedding iframe without allow="fullscreen") refuse the
      // request - fail silently rather than surface a console error for a non-critical toggle.
    });
  }, [targetRef]);

  return { isFullscreen, toggleFullscreen };
}
