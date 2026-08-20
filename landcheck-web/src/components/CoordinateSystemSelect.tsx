import { useEffect, useRef, useState } from "react";
import { COORDINATE_SYSTEM_GROUPS } from "../utils/coordinateConverter";
import "../styles/coordinate-system-select.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
};

// Custom dropdown replacing a plain <select>/<optgroup> - the browser renders that popup itself
// (OS chrome, not CSS-able), which is why the country groups looked inconsistently grayed out
// rather than actually disabled. This one is fully styled and shared by every coordinate-system
// picker (Survey Plan's coordinate input, its georeference setup step, Hazard Analysis).
export default function CoordinateSystemSelect({ value, onChange, disabled, id }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selected = COORDINATE_SYSTEM_GROUPS.flatMap((group) => group.systems).find((sys) => sys.key === value);

  return (
    <div className={`cs-select${disabled ? " is-disabled" : ""}`} ref={rootRef}>
      <button
        type="button"
        id={id}
        className="cs-select-trigger"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="cs-select-trigger-text">{selected?.name || "Select coordinate system"}</span>
        <svg className={`cs-select-caret${open ? " is-open" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="cs-select-panel" role="listbox" aria-label="Coordinate system">
          {COORDINATE_SYSTEM_GROUPS.map((group) => (
            <div className="cs-select-group" key={group.country}>
              <div className="cs-select-group-label">
                <span>{group.country}</span>
                {group.flag ? <span className="cs-select-flag" aria-hidden="true">{group.flag}</span> : null}
              </div>
              {group.systems.map((sys) => (
                <button
                  type="button"
                  key={sys.key}
                  role="option"
                  aria-selected={sys.key === value}
                  className={`cs-select-option${sys.key === value ? " is-selected" : ""}`}
                  onClick={() => {
                    onChange(sys.key);
                    setOpen(false);
                  }}
                >
                  <span className="cs-select-option-name">{sys.name}</span>
                  <span className="cs-select-option-epsg">{sys.epsgLabel}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
