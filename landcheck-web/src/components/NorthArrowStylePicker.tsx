import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingPopoverPosition } from "../utils/useFloatingPopoverPosition";

type ArrowType =
  | "one_side_stem"
  | "classic"
  | "triangle"
  | "compass"
  | "chevron"
  | "orienteering"
  | "star"
  | "un_marker"
  | "nn_arrow";

type NorthArrowStylePickerProps = {
  value: string;
  onChange: (value: string) => void;
};

const ARROW_OPTIONS: { value: ArrowType; label: string }[] = [
  { value: "one_side_stem", label: "One-Side Stem" },
  { value: "classic", label: "Classic" },
  { value: "triangle", label: "Triangle" },
  { value: "compass", label: "Compass" },
  { value: "chevron", label: "Chevron" },
  { value: "orienteering", label: "Orienteering" },
  { value: "star", label: "Star" },
  { value: "un_marker", label: "U.N. Marker" },
  { value: "nn_arrow", label: "N.N. Arrow" },
];

// Simplified glyphs matching the general silhouette each style actually draws in
// map_renderer_layout.py's add_north_arrow - close enough to recognize at a glance, not a
// pixel-exact replica (some of the real styles are drawn from a full SVG reference at full page
// size, which isn't meaningful to reproduce at icon scale).
function ArrowGlyph({ type }: { type: ArrowType }) {
  return (
    <svg className="north-arrow-swatch" viewBox="0 0 24 24" aria-hidden="true">
      {type === "one_side_stem" && (
        <g className="north-arrow-swatch-stroke">
          <line x1="13" y1="21" x2="13" y2="4" />
          <polyline points="13,4 8,9 13,9" />
        </g>
      )}
      {type === "classic" && (
        <polygon
          className="north-arrow-swatch-fill"
          points="12,2 6,12 9.5,12 9.5,21 14.5,21 14.5,12 18,12"
        />
      )}
      {type === "triangle" && <polygon className="north-arrow-swatch-fill" points="12,3 4,20 20,20" />}
      {type === "compass" && (
        <g>
          <circle className="north-arrow-swatch-stroke" cx="12" cy="13" r="8" />
          <polygon className="north-arrow-swatch-fill" points="12,5 9,13 15,13" />
          <polygon className="north-arrow-swatch-stroke" points="12,21 9,13 15,13" />
        </g>
      )}
      {type === "chevron" && (
        <g>
          <polygon className="north-arrow-swatch-stroke" points="12,3 4,20 20,20" />
          <polygon className="north-arrow-swatch-fill" points="12,8 8,18 16,18" />
        </g>
      )}
      {type === "orienteering" && (
        <g>
          <circle className="north-arrow-swatch-stroke" cx="12" cy="14" r="7.5" />
          <polygon className="north-arrow-swatch-stroke" points="12,4 8,16 16,16" />
          <polygon className="north-arrow-swatch-fill" points="12,7.5 10,15 14,15" />
        </g>
      )}
      {type === "star" && (
        <polygon
          className="north-arrow-swatch-stroke"
          points="12,3 14,9 20,9 15.2,12.8 17,19 12,15.3 7,19 8.8,12.8 4,9 10,9"
        />
      )}
      {type === "un_marker" && (
        <g className="north-arrow-swatch-stroke">
          <line x1="12" y1="21" x2="12" y2="3" />
          <polyline points="12,3 7,7 12,8" />
          <circle cx="9" cy="12" r="3" />
        </g>
      )}
      {type === "nn_arrow" && (
        <g>
          <polygon className="north-arrow-swatch-fill-alt" points="12,4 8,20 12,20" />
          <polygon className="north-arrow-swatch-fill" points="12,4 16,20 12,20" />
          <line className="north-arrow-swatch-stroke" x1="12" y1="20" x2="12" y2="22" />
        </g>
      )}
    </svg>
  );
}

function NorthArrowStylePicker({ value, onChange }: NorthArrowStylePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLUListElement>(null);
  const current = ARROW_OPTIONS.find((opt) => opt.value === value) ?? ARROW_OPTIONS[0];
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
    <div className="north-arrow-style-picker" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className="north-arrow-style-picker-btn"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ArrowGlyph type={current.value} />
        <span className="north-arrow-style-picker-label">{current.label}</span>
        <span className={`north-arrow-style-picker-chevron${open ? " open" : ""}`} aria-hidden="true">
          &#9662;
        </span>
      </button>
      {open && position
        ? createPortal(
            <ul
              ref={popoverRef}
              className="north-arrow-style-popover"
              role="listbox"
              style={{ top: position.top, left: position.left }}
            >
              {ARROW_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={opt.value === value}
                    className={`north-arrow-style-option${opt.value === value ? " active" : ""}`}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <ArrowGlyph type={opt.value} />
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

export default NorthArrowStylePicker;
