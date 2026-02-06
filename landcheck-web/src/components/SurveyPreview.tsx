import { useState, useRef, useEffect } from "react";
import "../styles/survey-preview.css";

type PreviewType = "survey" | "orthophoto" | "topomap";
type TopoSource = "opentopomap" | "userdata";

type Props = {
  previewType: PreviewType;
  onPreviewTypeChange: (type: PreviewType) => void;
  topoSource: TopoSource;
  onTopoSourceChange: (source: TopoSource) => void;
  northArrowStyle: string;
  northArrowColor: string;
  beaconStyle: string;
  roadWidth: string;
  onNorthArrowStyleChange: (value: string) => void;
  onNorthArrowColorChange: (value: string) => void;
  onBeaconStyleChange: (value: string) => void;
  onRoadWidthChange: (value: string) => void;
  paperSize: string;
  surveyPreviewUrl: string | null;
  orthophotoPreviewUrl: string | null;
  topoMapPreviewUrl: string | null;
  loading: boolean;
  orthophotoLoading: boolean;
  topoMapLoading: boolean;
  hasHeightData?: boolean;
};

export default function SurveyPreview({
  previewType,
  onPreviewTypeChange,
  topoSource,
  onTopoSourceChange,
  northArrowStyle,
  northArrowColor,
  beaconStyle,
  roadWidth,
  onNorthArrowStyleChange,
  onNorthArrowColorChange,
  onBeaconStyleChange,
  onRoadWidthChange,
  paperSize,
  surveyPreviewUrl,
  orthophotoPreviewUrl,
  topoMapPreviewUrl,
  loading,
  orthophotoLoading,
  topoMapLoading,
  hasHeightData = false,
}: Props) {
  const [zoom, setZoom] = useState(100);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomScale = zoom / 100;
  const displayZoom = Math.round(zoomScale * 100);
  const canPan = zoomScale > 1.001;

  const getCurrentUrl = () => {
    switch (previewType) {
      case "survey":
        return surveyPreviewUrl;
      case "orthophoto":
        return orthophotoPreviewUrl;
      case "topomap":
        return topoMapPreviewUrl;
      default:
        return null;
    }
  };

  const getCurrentLoading = () => {
    switch (previewType) {
      case "survey":
        return loading;
      case "orthophoto":
        return orthophotoLoading;
      case "topomap":
        return topoMapLoading;
      default:
        return false;
    }
  };

  const currentUrl = getCurrentUrl();
  const isLoading = getCurrentLoading();

  // Reset position when changing preview type or paper size
  useEffect(() => {
    setPosition({ x: 0, y: 0 });
    setZoom(100);
  }, [previewType, paperSize]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 25, 300));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 25, 50));
  };

  const handleResetZoom = () => {
    setZoom(100);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (canPan) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((prev) => Math.min(prev + 10, 300));
    } else {
      setZoom((prev) => Math.max(prev - 10, 50));
    }
  };

  const getPreviewLabel = () => {
    switch (previewType) {
      case "survey":
        return "survey plan";
      case "orthophoto":
        return "orthophoto";
      case "topomap":
        return "topo map";
      default:
        return "preview";
    }
  };

  const handleTopoSourceChange = (source: TopoSource) => {
    onTopoSourceChange(source);
  };

  return (
    <div className="survey-preview-container">
      <div className="preview-ribbon">
        <div className="ribbon-group">
          <span className="ribbon-label">North Arrow</span>
          <select
            className="ribbon-select"
            value={northArrowStyle}
            onChange={(e) => onNorthArrowStyleChange(e.target.value)}
          >
            <option value="classic">Classic</option>
            <option value="triangle">Triangle</option>
            <option value="compass">Compass</option>
            <option value="chevron">Chevron</option>
            <option value="orienteering">Orienteering</option>
            <option value="star">Star</option>
          </select>
          <select
            className="ribbon-select"
            value={northArrowColor}
            onChange={(e) => onNorthArrowColorChange(e.target.value)}
          >
            <option value="black">Black</option>
            <option value="blue">Blue</option>
          </select>
        </div>
        <div className="ribbon-group">
          <span className="ribbon-label">Beacon Style</span>
          <select
            className="ribbon-select"
            value={beaconStyle}
            onChange={(e) => onBeaconStyleChange(e.target.value)}
            disabled={previewType !== "survey"}
            title={previewType !== "survey" ? "Beacon style applies to Survey Plan only" : undefined}
          >
            <option value="circle">Circle</option>
            <option value="square">Square</option>
            <option value="triangle">Triangle</option>
            <option value="diamond">Diamond</option>
            <option value="cross">Cross</option>
          </select>
        </div>
        <div className="ribbon-group">
          <span className="ribbon-label">Road Width (m)</span>
          <select
            className="ribbon-select"
            value={roadWidth}
            onChange={(e) => onRoadWidthChange(e.target.value)}
            disabled={previewType !== "survey"}
            title={previewType !== "survey" ? "Road width applies to Survey Plan only" : undefined}
          >
            <option value="4">4</option>
            <option value="6">6</option>
            <option value="8">8</option>
            <option value="10">10</option>
            <option value="12">12</option>
            <option value="15">15</option>
            <option value="20">20</option>
            <option value="30">30</option>
          </select>
        </div>
      </div>
      <div className="preview-header">
        {/* Preview Type Toggle - 3 Tabs */}
        <div className="preview-toggle three-tabs">
          <button
            className={`toggle-btn ${previewType === "survey" ? "active" : ""}`}
            onClick={() => onPreviewTypeChange("survey")}
          >
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
            </svg>
            Survey Plan
          </button>
          <button
            className={`toggle-btn ${previewType === "orthophoto" ? "active" : ""}`}
            onClick={() => onPreviewTypeChange("orthophoto")}
          >
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
            Orthophoto
          </button>
          <button
            className={`toggle-btn ${previewType === "topomap" ? "active" : ""}`}
            onClick={() => onPreviewTypeChange("topomap")}
          >
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            Topo Map
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={handleZoomOut} title="Zoom Out">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </button>
          <span className="zoom-level">{displayZoom}%</span>
          <button className="zoom-btn" onClick={handleZoomIn} title="Zoom In">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          </button>
          <button className="zoom-btn reset" onClick={handleResetZoom} title="Reset">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Topo Source Toggle - only show on Topo Map tab */}
      {previewType === "topomap" && (
        <div className="topo-source-bar">
          <span className="topo-source-label">Data Source:</span>
          <div className="topo-source-toggle">
            <button
              className={`topo-source-btn ${topoSource === "opentopomap" ? "active" : ""}`}
              onClick={() => handleTopoSourceChange("opentopomap")}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 14, height: 14 }}>
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
              </svg>
              OpenTopoMap
            </button>
            <button
              className={`topo-source-btn ${topoSource === "userdata" ? "active" : ""}`}
              onClick={() => handleTopoSourceChange("userdata")}
              disabled={!hasHeightData}
              title={!hasHeightData ? "Upload CSV with height/elevation data to enable" : "Use your uploaded elevation data"}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 14, height: 14 }}>
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              Your Data
              {!hasHeightData && <span className="no-data-badge">No Data</span>}
            </button>
          </div>
          <span className="topo-source-hint">
            {topoSource === "opentopomap"
              ? "Terrain contours from OpenTopoMap"
              : hasHeightData
              ? "Elevation overlay from your uploaded data"
              : "Upload CSV with height column to use your data"
            }
          </span>
        </div>
      )}

      <div
        ref={containerRef}
        className={`preview-paper ${isDragging ? "dragging" : ""} ${canPan ? "zoomable" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {isLoading && (
          <div className="preview-loading">
            <div className="loading-spinner" />
            <span>Generating {getPreviewLabel()} preview...</span>
          </div>
        )}

        {!isLoading && !currentUrl && (
          <div className="preview-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>Preview will appear here</p>
          </div>
        )}

        {!isLoading && currentUrl && (
          <div
            className="preview-image-wrapper"
            style={{
              transform: `translate(${position.x}px, ${position.y}px)`,
            }}
          >
            <img
              src={currentUrl}
              alt={`${getPreviewLabel()} Preview`}
              className="preview-image"
              style={{
                transform: `scale(${zoomScale})`,
              }}
              draggable={false}
            />
          </div>
        )}
      </div>

      <div className="preview-footer">
        <span className="preview-tip">
          {canPan ? "Drag to pan • " : ""}Scroll to zoom • Click tabs to switch preview type
        </span>
      </div>
    </div>
  );
}
