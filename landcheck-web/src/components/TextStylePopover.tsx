import { useEffect, useRef, useState } from "react";

type TextStylePopoverProps = {
  titleFont: string;
  titleSize: string;
  onTitleFontChange: (value: string) => void;
  onTitleSizeChange: (value: string) => void;
  gridFont: string;
  gridSize: string;
  onGridFontChange: (value: string) => void;
  onGridSizeChange: (value: string) => void;
  stationFont: string;
  stationSize: string;
  onStationFontChange: (value: string) => void;
  onStationSizeChange: (value: string) => void;
  bearingFont: string;
  bearingSize: string;
  onBearingFontChange: (value: string) => void;
  onBearingSizeChange: (value: string) => void;
  areaFont: string;
  areaSize: string;
  onAreaFontChange: (value: string) => void;
  onAreaSizeChange: (value: string) => void;
};

const FONT_OPTIONS = [
  { value: "", label: "Default" },
  { value: "DejaVu Sans", label: "Sans-serif" },
  { value: "DejaVu Serif", label: "Serif" },
  { value: "DejaVu Sans Mono", label: "Monospace" },
];

const SIZE_OPTIONS = ["", "6", "7", "8", "9", "10", "11", "12", "14", "16", "18", "20", "24"];

function SizeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select className="ribbon-select text-style-size-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {SIZE_OPTIONS.map((size) => (
        <option key={size || "auto"} value={size}>
          {size || "Auto"}
        </option>
      ))}
    </select>
  );
}

function FontSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select className="ribbon-select text-style-font-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {FONT_OPTIONS.map((font) => (
        <option key={font.value || "default"} value={font.value}>
          {font.label}
        </option>
      ))}
    </select>
  );
}

function TextStylePopover(props: TextStylePopoverProps) {
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

  const rows: Array<{
    label: string;
    font: string;
    size: string;
    onFontChange: (value: string) => void;
    onSizeChange: (value: string) => void;
  }> = [
    { label: "Title", font: props.titleFont, size: props.titleSize, onFontChange: props.onTitleFontChange, onSizeChange: props.onTitleSizeChange },
    { label: "Grid", font: props.gridFont, size: props.gridSize, onFontChange: props.onGridFontChange, onSizeChange: props.onGridSizeChange },
    { label: "Station Name", font: props.stationFont, size: props.stationSize, onFontChange: props.onStationFontChange, onSizeChange: props.onStationSizeChange },
    { label: "Bearing/Distance", font: props.bearingFont, size: props.bearingSize, onFontChange: props.onBearingFontChange, onSizeChange: props.onBearingSizeChange },
    { label: "Area", font: props.areaFont, size: props.areaSize, onFontChange: props.onAreaFontChange, onSizeChange: props.onAreaSizeChange },
  ];

  return (
    <div className="text-style-popover-container" ref={containerRef}>
      <button type="button" className="ribbon-text-style-btn" onClick={() => setOpen((prev) => !prev)}>
        Text Styles
      </button>
      {open ? (
        <div className="text-style-popover">
          <div className="text-style-popover-header">
            <span>Category</span>
            <span>Style</span>
            <span>Size</span>
          </div>
          {rows.map((row) => (
            <div className="text-style-popover-row" key={row.label}>
              <span className="text-style-popover-row-label">{row.label}</span>
              <FontSelect value={row.font} onChange={row.onFontChange} />
              <SizeSelect value={row.size} onChange={row.onSizeChange} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default TextStylePopover;
