import ColorSwatchPicker from "./ColorSwatchPicker";
import HatchPatternPicker from "./HatchPatternPicker";

type SurveyAppearancePanelProps = {
  open: boolean;
  onClose: () => void;
  restrictRoadColor?: boolean;
  boundaryColor: string;
  gridColor: string;
  textColor: string;
  roadColor: string;
  riverColor: string;
  buildingColor: string;
  buildingHatchType: string;
  onBoundaryColorChange: (value: string) => void;
  onGridColorChange: (value: string) => void;
  onTextColorChange: (value: string) => void;
  onRoadColorChange: (value: string) => void;
  onRiverColorChange: (value: string) => void;
  onBuildingColorChange: (value: string) => void;
  onBuildingHatchTypeChange: (value: string) => void;
  titleFont: string;
  titleSize: string;
  gridFont: string;
  gridSize: string;
  stationFont: string;
  stationSize: string;
  bearingFont: string;
  bearingSize: string;
  areaFont: string;
  areaSize: string;
  onTitleFontChange: (value: string) => void;
  onTitleSizeChange: (value: string) => void;
  onGridFontChange: (value: string) => void;
  onGridSizeChange: (value: string) => void;
  onStationFontChange: (value: string) => void;
  onStationSizeChange: (value: string) => void;
  onBearingFontChange: (value: string) => void;
  onBearingSizeChange: (value: string) => void;
  onAreaFontChange: (value: string) => void;
  onAreaSizeChange: (value: string) => void;
};

const FONT_OPTIONS = [
  { value: "", label: "Default" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "DejaVu Serif", label: "Serif" },
  { value: "DejaVu Sans", label: "Sans-serif" },
  { value: "DejaVu Sans Mono", label: "Monospace" },
];

const SIZE_OPTIONS = ["", "6", "7", "8", "9", "10", "11", "12", "14", "16", "18", "20", "24"];

function TextStyleRow({
  label,
  font,
  size,
  onFontChange,
  onSizeChange,
}: {
  label: string;
  font: string;
  size: string;
  onFontChange: (value: string) => void;
  onSizeChange: (value: string) => void;
}) {
  return (
    <div className="appearance-text-row">
      <span className="appearance-text-row-label">{label}</span>
      <select className="ribbon-select" value={font} onChange={(e) => onFontChange(e.target.value)}>
        {FONT_OPTIONS.map((opt) => (
          <option key={opt.value || "default"} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <select className="ribbon-select" value={size} onChange={(e) => onSizeChange(e.target.value)}>
        {SIZE_OPTIONS.map((opt) => (
          <option key={opt || "auto"} value={opt}>
            {opt || "Auto"}
          </option>
        ))}
      </select>
    </div>
  );
}

function SurveyAppearancePanel(props: SurveyAppearancePanelProps) {
  return (
    <>
      <div
        className={`appearance-panel-backdrop${props.open ? " open" : ""}`}
        onClick={props.onClose}
        aria-hidden={!props.open}
      />
      <aside className={`appearance-panel${props.open ? " open" : ""}`} aria-hidden={!props.open}>
        <div className="appearance-panel-header">
          <span>Appearance</span>
          <button type="button" className="appearance-panel-close" onClick={props.onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="appearance-panel-body">
          <section className="appearance-section">
            <h4>Colors</h4>
            <div className="appearance-color-grid">
              <ColorSwatchPicker label="Boundary" value={props.boundaryColor} onChange={props.onBoundaryColorChange} />
              <ColorSwatchPicker label="Grid" value={props.gridColor} onChange={props.onGridColorChange} />
              <ColorSwatchPicker label="Text" value={props.textColor} onChange={props.onTextColorChange} />
              <ColorSwatchPicker
                label="Roads"
                value={props.roadColor}
                onChange={props.onRoadColorChange}
                disabled={props.restrictRoadColor}
              />
              <ColorSwatchPicker label="Rivers" value={props.riverColor} onChange={props.onRiverColorChange} />
              <ColorSwatchPicker label="Building" value={props.buildingColor} onChange={props.onBuildingColorChange} />
            </div>
          </section>

          <section className="appearance-section">
            <h4>Building Hatch</h4>
            <HatchPatternPicker value={props.buildingHatchType} onChange={props.onBuildingHatchTypeChange} />
          </section>

          <section className="appearance-section">
            <h4>Text Styles</h4>
            <div className="appearance-text-header">
              <span />
              <span>Style</span>
              <span>Size</span>
            </div>
            <TextStyleRow label="Title" font={props.titleFont} size={props.titleSize} onFontChange={props.onTitleFontChange} onSizeChange={props.onTitleSizeChange} />
            <TextStyleRow label="Grid" font={props.gridFont} size={props.gridSize} onFontChange={props.onGridFontChange} onSizeChange={props.onGridSizeChange} />
            <TextStyleRow label="Station Name" font={props.stationFont} size={props.stationSize} onFontChange={props.onStationFontChange} onSizeChange={props.onStationSizeChange} />
            <TextStyleRow label="Bearing/Distance" font={props.bearingFont} size={props.bearingSize} onFontChange={props.onBearingFontChange} onSizeChange={props.onBearingSizeChange} />
            <TextStyleRow label="Area" font={props.areaFont} size={props.areaSize} onFontChange={props.onAreaFontChange} onSizeChange={props.onAreaSizeChange} />
          </section>
        </div>
      </aside>
    </>
  );
}

export default SurveyAppearancePanel;
