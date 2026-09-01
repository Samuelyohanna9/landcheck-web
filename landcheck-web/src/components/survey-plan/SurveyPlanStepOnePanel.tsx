import { memo, Suspense, useState, type ReactNode } from "react";
import CoordinateInput from "../CoordinateInput";
import CoordinateSystemSelect from "../CoordinateSystemSelect";
import { getCoordinateSystemEpsgLabel, getCoordinateSystemLabel } from "../../utils/coordinateConverter";
import { prefetchSurveyPlanDraftMapTools } from "../../utils/surveyPlanPrefetch";
import { lazyWithChunkRecovery } from "../../utils/lazyWithChunkRecovery";

const MapViewEnhanced = lazyWithChunkRecovery(() => import("../MapViewEnhanced"));

type WorkflowMode = "survey" | "subdivision";
type MapViewMode = "boundary" | "spot_heights";

type ManualPoint = {
  station: string;
  lng: number;
  lat: number;
  height?: number;
  is_boundary?: boolean;
  category?: string;
  feature_code?: string | null;
};

type Props = {
  sidebar: ReactNode;
  manualPoints: ManualPoint[];
  onUpdatePoint: (index: number, field: keyof ManualPoint, value: string | number | boolean) => void;
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
  onAiPlotParsed?: (points: ManualPoint[]) => void;
  aiPlotAwaitingConfirmation: boolean;
  onConfirmAiPlot: () => void;
  onRejectAiPlot: () => void;
  onClearAllPoints?: () => void;
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
  onAiPlotParsed,
  aiPlotAwaitingConfirmation,
  onConfirmAiPlot,
  onRejectAiPlot,
  onClearAllPoints,
}: Props) {
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>("boundary");
  const hasAnyHeightData = manualPoints.some(
    (p) => p.height !== undefined && p.height !== null && Number.isFinite(Number(p.height))
  );

  // Checked against mapCoordinates - the exact same already-converted-to-WGS84 array handed to
  // MapViewEnhanced - so this reads as "will the map actually be able to draw this", not just
  // "did the AI return some numbers". Surfaces a data problem (bad coordinate system, AI parsing
  // garbage) directly on the confirm card instead of leaving a surveyor staring at a map that
  // silently drew nothing with no way to tell why.
  const plottablePointCount = mapCoordinates.filter(
    (p) =>
      Number.isFinite(p.lng) &&
      Number.isFinite(p.lat) &&
      Math.abs(p.lng) <= 180 &&
      Math.abs(p.lat) <= 90 &&
      !(p.lng === 0 && p.lat === 0)
  ).length;

  const warmDraftMapTools = () => {
    void prefetchSurveyPlanDraftMapTools();
  };

  return (
    <div className="step-panel">
      <div className="panel-left">
        {aiPlotAwaitingConfirmation ? (
          <div className="ai-plot-confirm-card">
            <img src="/LandCheck_Survey_AI_Symbol.svg" alt="" className="ai-plot-confirm-icon" aria-hidden="true" />
            <h3>Confirm Boundary Location</h3>
            <p>
              AI plotted {manualPoints.filter((p) => p.is_boundary !== false).length} boundary point(s), shown in red on
              the map. Is this the right location and shape for your parcel?
            </p>
            <div className="ai-plot-confirm-coord-system">
              <div className="ai-plot-confirm-coord-system-label">
                <span>Detected coordinate system</span>
                <em>
                  {getCoordinateSystemLabel(coordinateSystem)} ({getCoordinateSystemEpsgLabel(coordinateSystem)})
                </em>
              </div>
              <CoordinateSystemSelect value={coordinateSystem} onChange={onCoordinateSystemChange} />
              <p className="ai-plot-confirm-coord-system-hint">
                If the shape looks wrong or is in the wrong place, this is usually the fix - pick the correct system
                and the map updates immediately.
              </p>
              <p
                className={`ai-plot-confirm-plottable-status${plottablePointCount === 0 ? " is-error" : ""}`}
              >
                {plottablePointCount === mapCoordinates.length
                  ? `All ${mapCoordinates.length} point(s) are plotting on the map.`
                  : plottablePointCount === 0
                    ? `None of the ${mapCoordinates.length} point(s) could be plotted with this coordinate system - try a different one above.`
                    : `${plottablePointCount} of ${mapCoordinates.length} point(s) are plotting - the rest look invalid for this coordinate system.`}
              </p>
            </div>
            <div className="ai-plot-confirm-actions">
              <button type="button" className="btn-primary" onClick={onConfirmAiPlot}>
                Yes, this is correct - Continue
              </button>
              <button type="button" className="btn-outline" onClick={onRejectAiPlot}>
                No, let me redo it
              </button>
            </div>
          </div>
        ) : (
          <>
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
              onAiPlotParsed={onAiPlotParsed}
              onClearAllPoints={onClearAllPoints}
            />
            <div className="action-bar">
              <button
                className="btn-primary"
                disabled={!hasValidCoords || loading}
                onClick={onContinue}
                title={!hasValidCoords && !loading ? "Add at least three valid boundary points." : undefined}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                      Plotting...
                  </>
                ) : (
                  <>
                      {workflowMode === "subdivision" ? "Plot mother parcel boundary" : "Plot boundary"}
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
              {!hasValidCoords && !loading && (
                <span className="action-bar-hint">Add at least three valid boundary points.</span>
              )}
            </div>
          </>
        )}
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
                showToolbar
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
