import { useEffect, useRef, useState } from "react";
import EstateIcon from "./EstateIcon";

/** A small "i" symbol that reveals a plain-language explanation on click - for a field whose
 * behaviour isn't obvious from its label alone. Closes on an outside click, Escape, or a second click. */
export default function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false); };
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => { document.removeEventListener("mousedown", onOutside); document.removeEventListener("keydown", onEscape); };
  }, [open]);

  return (
    <span className="edash-infotip" ref={boxRef}>
      <button type="button" className="edash-infotip-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <EstateIcon name="help" />
      </button>
      {open && <div className="edash-infotip-pop" role="dialog" aria-label={label}>{children}</div>}
    </span>
  );
}
