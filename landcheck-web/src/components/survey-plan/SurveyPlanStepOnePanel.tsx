import { lazy, memo, Suspense, useState, type ReactNode } from "react";
import CoordinateInput from "../CoordinateInput";
import { prefetchSurveyPlanDraftMapTools } from "../../utils/surveyPlanPrefetch";

const MapViewEnhanced = lazy(() => import("../MapViewEnhanced"));

type WorkflowMode = "survey" | "subdivision";
type MapViewMode = "boundary" | "spot_heights";

type ManualPoint = {
  station: string;
  lng: number;
  lat: number;
  height?: number;
  is_boundary?: boolean;
};

type Props = {
  sidebar: ReactNode;
  manualPoints: ManualPoint[];
  onUpdatePoint: (index: number, field: "lng" | "lat" | "height" | "station" | "is_boundary", value: string | number | boolean) => void;
  onRemovePoint: (index: number) => void;
  onAddPoint: () => void;
  onBulkUpload: (points: ManualPoint[]) => void;
  loading: boolean;
  coordinateSystem: string;
  onCoordinateSystemChange: (value: string) => void;
  hasValidCoords: boolean;
  onContinue: () => void;
  workflowMode: WorkflowMode;
  showDraftMap: boolean;
  onLoadMapNow: () => void;
  mapCoordinates: ManualPoint[];
  spotHeightMapCoordinates: ManualPoint[];
  onCoordinatesDrawn: (coords: ManualPoint[]) => void;
  isLowBandwidth: boolean;
  manualLowBandwidth: boolean;
  onManualLowBandwidthChange: (value: boolean) => void;
  onImportedMetadata?: (fields: Record<string, string>) => void;
};

function SurveyPlanStepOnePanel({
  sidebar,
  manualPoints,
  onUpdatePoint,
  onRemovePoint,
  onAddPoint,
  onBulkUpload,
  loading,
  coordinateSystem,
  onCoordinateSystemChange,
  hasValidCoords,
  onContinue,
  workflowMode,
  showDraftMap,
  onLoadMapNow,
  mapCoordinates,
  spotHeightMapCoordinates,
  onCoordinatesDrawn,
  isLowBandwidth,
  manualLowBandwidth,
  onManualLowBandwidthChange,
  onImportedMetadata,
}: Props) {
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>("boundary");
  const hasAnyHeightData = manualPoints.some(
    (p) => p.height !== undefined && p.height !== null && Number.isFinite(Number(p.height))
  );

  const warmDraftMapTools = () => {
    void prefetchSurveyPlanDraftMapTools();
  };

  return (
    <div className="step-panel">
      <div className="panel-left">
        {sidebar}
        <CoordinateInput
          points={manualPoints}
          onUpdatePoint={onUpdatePoint}
          onRemovePoint={onRemovePoint}
          onAddPoint={onAddPoint}
          onBulkUpload={onBulkUpload}
          disabled={loading}
          coordinateSystem={coordinateSystem}
          onCoordinateSystemChange={onCoordinateSystemChange}
          showPointRoles
          onImportedMetadata={onImportedMetadata}
        />
        <div className="action-bar">
          <button className="btn-primary" disabled={!hasValidCoords || loading} onClick={onContinue}>
            {loading ? (
              <>
                <span className="spinner" />
                  Plotting Draft...
              </>
            ) : (
              <>
                  {workflowMode === "subdivision" ? "Plot & Save Mother Parcel Draft" : "Plot & Save Local Draft"}
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
      <div className="panel-right">
        {showDraftMap ? (
          <div className="step-one-map-wrap">
            {hasAnyHeightData && (
              <div className="map-view-toggle">
                <button
                  type="button"
                  className={`map-view-toggle-btn ${mapViewMode === "boundary" ? "active" : ""}`}
                  onClick={() => setMapViewMode("boundary")}
                >
                  Boundary
                </button>
                <button
                  type="button"
                  className={`map-view-toggle-btn ${mapViewMode === "spot_heights" ? "active" : ""}`}
                  onClick={() => setMapViewMode("spot_heights")}
                >
                  Spot Heights
                </button>
              </div>
            )}
            <Suspense fallback={<div className="preview-card">Loading survey map...</div>}>
              <MapViewEnhanced
                coordinates={mapCoordinates}
                onCoordinatesDrawn={onCoordinatesDrawn}
                disabled={loading}
                lightweight={isLowBandwidth}
                coordinateSystem={coordinateSystem}
                viewMode={mapViewMode}
                spotHeightPoints={spotHeightMapCoordinates}
              />
            </Suspense>
          </div>
        ) : (
            <div className="preview-card">
              <h3>Draft map on demand</h3>
              <p>Keep this first step light on slower networks and open the map only when you need it.</p>
            <button
              className="btn-outline"
              type="button"
              onClick={onLoadMapNow}
              onMouseEnter={warmDraftMapTools}
              onFocus={warmDraftMapTools}
              onTouchStart={warmDraftMapTools}
            >
                Load Draft Map
            </button>
            <label className="low-bandwidth-toggle">
              <input
                type="checkbox"
                checked={manualLowBandwidth}
                onChange={(event) => onManualLowBandwidthChange(event.target.checked)}
              />
               Slow connection - keep the map off until I ask for it
              </label>
            </div>
        )}
      </div>
    </div>
  );
}

export default memo(SurveyPlanStepOnePanel);
