import { useEffect, useLayoutEffect, useRef, useState } from "react";
import EstateIcon from "./EstateIcon";

const VIEWPORT_MARGIN = 12;

/** A small "i" symbol that reveals a plain-language explanation on click - for a field whose
 * behaviour isn't obvious from its label alone.
 *
 * The popover is fixed-positioned and placed from the trigger's actual screen position, rather
 * than being an absolutely-positioned child of it - `.edash-card` clips overflow for its rounded
 * corners, which silently cut the popover off on shorter (mobile) layouts when it was a normal
 * child. Closes on an outside click, Escape, scrolling, or resizing (e.g. a phone rotating). */
export default function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - VIEWPORT_MARGIN * 2);
    const left = Math.min(Math.max(rect.left, VIEWPORT_MARGIN), window.innerWidth - VIEWPORT_MARGIN - width);
    setPos({ top: rect.bottom + 8, left, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (btnRef.current?.contains(target) || popRef.current?.contains(target)) return;
      close();
    };
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <span className="edash-infotip">
      <button ref={btnRef} type="button" className="edash-infotip-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <EstateIcon name="help" />
      </button>
      {open && pos && (
        <div ref={popRef} className="edash-infotip-pop" role="dialog" aria-label={label} style={{ top: pos.top, left: pos.left, width: pos.width }}>
          {children}
        </div>
      )}
    </span>
  );
}
