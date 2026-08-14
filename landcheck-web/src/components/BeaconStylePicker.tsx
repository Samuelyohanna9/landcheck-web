import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingPopoverPosition } from "../utils/useFloatingPopoverPosition";

type BeaconType = "circle" | "square" | "triangle" | "diamond" | "cross";

type BeaconStylePickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  title?: string;
};

const BEACON_OPTIONS: { value: BeaconType; label: string }[] = [
  { value: "circle", label: "Circle" },
  { value: "square", label: "Square" },
  { value: "triangle", label: "Triangle" },
  { value: "diamond", label: "Diamond" },
  { value: "cross", label: "Cross" },
];

// Matches map_renderer_layout.py's draw_beacon exactly (unfilled outline marker at each survey
// station, or a "+" tick for cross) - what a user picks here is the actual mark used on the plan.
function BeaconSwatch({ type }: { type: BeaconType }) {
  return (
    <svg className="beacon-swatch" viewBox="0 0 24 24" aria-hidden="true">
      {type === "circle" && <circle cx="12" cy="12" r="7" />}
      {type === "square" && <rect x="5" y="5" width="14" height="14" />}
      {type === "triangle" && <polygon points="12,4 4,19 20,19" />}
      {type === "diamond" && <polygon points="12,4 4,12 12,20 20,12" />}
      {type === "cross" && (
        <>
          <line x1="5" y1="12" x2="19" y2="12" />
          <line x1="12" y1="5" x2="12" y2="19" />
        </>
      )}
    </svg>
  );
}

function BeaconStylePicker({ value, onChange, disabled, title }: BeaconStylePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLUListElement>(null);
  const current = BEACON_OPTIONS.find((opt) => opt.value === value) ?? BEACON_OPTIONS[0];
  const position = useFloatingPopoverPosition(triggerRef, popoverRef, open);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className="beacon-style-picker" ref={containerRef} title={title}>
      <button
        type="button"
        ref={triggerRef}
        className="beacon-style-picker-btn"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <BeaconSwatch type={current.value} />
        <span className="beacon-style-picker-label">{current.label}</span>
        <span className={`beacon-style-picker-chevron${open ? " open" : ""}`} aria-hidden="true">
          &#9662;
        </span>
      </button>
      {open && position
        ? createPortal(
            <ul
              ref={popoverRef}
              className="beacon-style-popover"
              role="listbox"
              style={{ top: position.top, left: position.left }}
            >
              {BEACON_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={opt.value === value}
                    className={`beacon-style-option${opt.value === value ? " active" : ""}`}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <BeaconSwatch type={opt.value} />
                    <span>{opt.label}</span>
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}

export default BeaconStylePicker;
