import { useLayoutEffect, useState, type RefObject } from "react";

export type FloatingPopoverPosition = { top: number; left: number; triggerWidth: number };

// Ribbon-hosted dropdowns (North Arrow, Beacon Style, Building Hatch) used to position their
// popover with plain `position: absolute`, which only escapes the nearest positioned ancestor -
// it doesn't escape that ancestor's own overflow clipping. The ribbon bar has `overflow-x: auto`
// for horizontal scrolling on narrow screens, and per the CSS spec, giving one axis a non-visible
// overflow value forces the other axis to become non-visible too, so the ribbon was silently
// clipping every popover that opened below it - it rendered, but behind/outside the visible
// ribbon strip. Positioning as `position: fixed` from real viewport coordinates (meant to be
// combined with rendering through a portal into document.body) sidesteps that entirely.
export function useFloatingPopoverPosition(
  triggerRef: RefObject<HTMLElement | null>,
  popoverRef: RefObject<HTMLElement | null>,
  open: boolean,
): FloatingPopoverPosition | null {
  const [position, setPosition] = useState<FloatingPopoverPosition | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const popoverWidth = popoverRef.current?.offsetWidth ?? rect.width;
      const maxLeft = window.innerWidth - popoverWidth - 8;
      const left = Math.max(8, Math.min(rect.left, maxLeft));
      const top = rect.bottom + 6;
      setPosition({ top, left, triggerWidth: rect.width });
    };

    updatePosition();
    // Re-run once the popover has actually painted, so clamping uses its real rendered width
    // instead of falling back to the trigger button's (usually narrower) width.
    const raf = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, triggerRef, popoverRef]);

  return position;
}
