import { useState, useRef, useEffect } from "react";
import "../styles/survey-preview.css";

type PreviewType = "survey" | "orthophoto" | "topomap";

type Props = {
  surveyPreviewUrl: string | null;
  orthophotoPreviewUrl: string | null;
  topoMapPreviewUrl: string | null;
  loading: boolean;
  onRequestOrthophoto: () => void;
  onRequestTopoMap: () => void;
  orthophotoLoading: boolean;
  topoMapLoading: boolean;
  hasHeightData?: boolean;
  useHeightData?: boolean;
  onToggleHeightData?: (useHeight: boolean) => void;
};

export default function SurveyPreview({
  surveyPreviewUrl,
  orthophotoPreviewUrl,
  topoMapPreviewUrl,
  loading,
  onRequestOrthophoto,
  onRequestTopoMap,
  orthophotoLoading,
  topoMapLoading,
  hasHeightData = false,
  useHeightData = false,
  onToggleHeightData,
}: Props) {
  const [previewType, setPreviewType] = useState<PreviewType>("survey");
  const [zoom, setZoom] = useState(100);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Request orthophoto when switching to it if not yet loaded
  useEffect(() => {
    if (previewType === "orthophoto" && !orthophotoPreviewUrl && !orthophotoLoading) {
      onRequestOrthophoto();
    }
  }, [previewType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Request topo map when switching to it if not yet loaded
  useEffect(() => {
    if (previewType === "topomap" && !topoMapPreviewUrl && !topoMapLoading) {
      onRequestTopoMap();
    }
  }, [previewType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset position when changing preview type
  useEffect(() => {
    setPosition({ x: 0, y: 0 });
    setZoom(100);
  }, [previewType]);

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
    if (zoom > 100) {
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

  return (
    <div className="survey-preview-container">
      <div className="preview-header">
        {/* Preview Type Toggle - 3 Tabs */}
        <div className="preview-toggle three-tabs">
          <button
            className={`toggle-btn ${previewType === "survey" ? "active" : ""}`}
            onClick={() => setPreviewType("survey")}
          >
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
            </svg>
            Survey Plan
          </button>
          <button
            className={`toggle-btn ${previewType === "orthophoto" ? "active" : ""}`}
            onClick={() => setPreviewType("orthophoto")}
          >
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
            Orthophoto
          </button>
          <button
            className={`toggle-btn ${previewType === "topomap" ? "active" : ""}`}
            onClick={() => setPreviewType("topomap")}
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
          <span className="zoom-level">{zoom}%</span>
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

      {/* Height Data Toggle - only show on Topo Map tab if height data available */}
      {previewType === "topomap" && hasHeightData && onToggleHeightData && (
        <div className="height-toggle-bar">
          <label className="height-toggle">
            <input
              type="checkbox"
              checked={useHeightData}
              onChange={(e) => onToggleHeightData(e.target.checked)}
            />
            <span className="height-toggle-slider"></span>
            <span className="height-toggle-label">
              📊 Use uploaded elevation data
            </span>
          </label>
          <span className="height-toggle-hint">
            {useHeightData
              ? "Showing your elevation data overlay"
              : "Showing OpenTopoMap terrain contours"
            }
          </span>
        </div>
      )}

      <div
        ref={containerRef}
        className={`preview-paper ${isDragging ? "dragging" : ""} ${zoom > 100 ? "zoomable" : ""}`}
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
                transform: `scale(${zoom / 100})`,
              }}
              draggable={false}
            />
          </div>
        )}
      </div>

      <div className="preview-footer">
        <span className="preview-tip">
          {zoom > 100 ? "Drag to pan • " : ""}Scroll to zoom • Click tabs to switch preview type
        </span>
      </div>
    </div>
  );
}
