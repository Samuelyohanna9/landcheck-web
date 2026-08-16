import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingPopoverPosition } from "../utils/useFloatingPopoverPosition";

type HatchType = "horizontal" | "vertical" | "diagonal" | "cross" | "solid";

type HatchPatternPickerProps = {
  value: string;
  onChange: (value: string) => void;
};

const HATCH_OPTIONS: { value: HatchType; label: string }[] = [
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
  { value: "diagonal", label: "Diagonal" },
  { value: "cross", label: "Cross-hatch" },
  { value: "solid", label: "Solid Fill" },
];

// Small AutoCAD-style hatch pattern preview, drawn to match this app's actual building-hatch
// renderer (map_renderer_layout.py's draw_building_hatch: horizontal/vertical scan lines, 45
// degree diagonal lines, or both combined for cross-hatch) - so what a user picks here is what
// the rendered plan actually looks like, not a generic approximation.
function HatchSwatch({ type }: { type: HatchType }) {
  // The closed button and the open option list can both render a swatch for the same type at
  // once, so the clip id must be unique per rendered instance (not just per type) - otherwise
  // two <clipPath> elements share one id and SVG clip-path resolution becomes ambiguous.
  const clipId = useId();
  const showHorizontal = type === "horizontal" || type === "cross";
  const showVertical = type === "vertical" || type === "cross";
  const showDiagonal = type === "diagonal";
  const showSolid = type === "solid";

  return (
    <svg className="hatch-swatch" viewBox="0 0 28 20" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <rect x="0.5" y="0.5" width="27" height="19" />
        </clipPath>
      </defs>
      <rect className="hatch-swatch-bg" x="0.5" y="0.5" width="27" height="19" rx="2" />
      <g className="hatch-swatch-lines" clipPath={`url(#${clipId})`}>
        {showSolid && <rect className="hatch-swatch-solid" x="0.5" y="0.5" width="27" height="19" />}
        {showHorizontal &&
          [4, 9, 14, 19].map((y) => <line key={`h-${y}`} x1="0" y1={y} x2="28" y2={y} />)}
        {showVertical &&
          [5, 11, 17, 23].map((x) => <line key={`v-${x}`} x1={x} y1="0" x2={x} y2="20" />)}
        {showDiagonal &&
          [-14, -8, -2, 4, 10, 16, 22, 28].map((offset) => (
            <line key={`d-${offset}`} x1={offset} y1="20" x2={offset + 20} y2="0" />
          ))}
      </g>
      <rect className="hatch-swatch-border" x="0.5" y="0.5" width="27" height="19" rx="2" />
    </svg>
  );
}

function HatchPatternPicker({ value, onChange }: HatchPatternPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLUListElement>(null);
  const current = HATCH_OPTIONS.find((opt) => opt.value === value) ?? HATCH_OPTIONS[2];
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

  return (
    <div className="hatch-pattern-picker" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className="hatch-pattern-picker-btn"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <HatchSwatch type={current.value} />
        <span className="hatch-pattern-picker-label">{current.label}</span>
        <span className={`hatch-pattern-picker-chevron${open ? " open" : ""}`} aria-hidden="true">
          &#9662;
        </span>
      </button>
      {open && position
        ? createPortal(
            <ul
              ref={popoverRef}
              className="hatch-pattern-popover"
              role="listbox"
              style={{ top: position.top, left: position.left, width: position.triggerWidth }}
            >
              {HATCH_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={opt.value === value}
                    className={`hatch-pattern-option${opt.value === value ? " active" : ""}`}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <HatchSwatch type={opt.value} />
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

export default HatchPatternPicker;
