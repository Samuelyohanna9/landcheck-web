import { useEffect, useRef, useState } from "react";

type ColorSwatchPickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

// A curated AutoCAD-style index palette plus a "Custom" swatch that opens the
// browser's native color picker for anything outside this set.
const PRESET_COLORS = [
  "#000000", "#ffffff", "#9e9e9e", "#607d8b",
  "#ff0000", "#f97316", "#ffd700", "#00c853",
  "#00bcd4", "#0000ff", "#1f2f8a", "#7b1fa2",
  "#e91e63", "#795548", "#4caf50", "#d500f9",
];

function ColorSwatchPicker({ label, value, onChange, disabled }: ColorSwatchPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="color-swatch-picker" ref={containerRef}>
      <button
        type="button"
        className="ribbon-color-swatch-btn"
        title={`${label}: ${value}`}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`${label} color`}
      >
        <span className="ribbon-color-swatch" style={{ backgroundColor: value }} />
        <span className="ribbon-color-swatch-label">{label}</span>
      </button>
      {open ? (
        <div className="color-palette-popover">
          <span className="color-palette-popover-label">{label}</span>
          <div className="color-palette-grid">
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`color-palette-swatch${preset.toLowerCase() === value.toLowerCase() ? " active" : ""}`}
                style={{ backgroundColor: preset }}
                title={preset}
                onClick={() => {
                  onChange(preset);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <label className="color-palette-custom">
            Custom
            <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
          </label>
        </div>
      ) : null}
    </div>
  );
}

export default ColorSwatchPicker;
