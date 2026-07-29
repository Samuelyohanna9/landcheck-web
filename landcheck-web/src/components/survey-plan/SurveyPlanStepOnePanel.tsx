import { lazy, memo, Suspense, type ReactNode } from "react";
import CoordinateInput from "../CoordinateInput";
import { prefetchSurveyPlanDraftMapTools } from "../../utils/surveyPlanPrefetch";

const MapViewEnhanced = lazy(() => import("../MapViewEnhanced"));

type WorkflowMode = "survey" | "subdivision";

type ManualPoint = {
  station: string;
  lng: number;
  lat: number;
  height?: number;
};

type Props = {
  sidebar: ReactNode;
  manualPoints: ManualPoint[];
  onUpdatePoint: (index: number, field: "lng" | "lat" | "height" | "station", value: string | number) => void;
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
  onCoordinatesDrawn: (coords: ManualPoint[]) => void;
  isLowBandwidth: boolean;
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
  onCoordinatesDrawn,
  isLowBandwidth,
}: Props) {
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
        />
        <div className="action-bar">
          <button className="btn-primary" disabled={!hasValidCoords || loading} onClick={onContinue}>
            {loading ? (
              <>
                <span className="spinner" />
                Preparing Draft...
              </>
            ) : (
              <>
                {workflowMode === "subdivision" ? "Continue with Local Mother Parcel Draft" : "Continue with Local Draft"}
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
          <Suspense fallback={<div className="preview-card">Loading survey map...</div>}>
            <MapViewEnhanced
              coordinates={mapCoordinates}
              onCoordinatesDrawn={onCoordinatesDrawn}
              disabled={loading}
              lightweight={isLowBandwidth}
            />
          </Suspense>
        ) : (
          <div className="preview-card">
            <h3>Map preview ready</h3>
            <p>
              We are keeping the first step lighter for slower networks. Load the draft map only when you need to inspect
              or adjust the boundary visually.
            </p>
            <button
              className="btn-outline"
              type="button"
              onClick={onLoadMapNow}
              onMouseEnter={warmDraftMapTools}
              onFocus={warmDraftMapTools}
              onTouchStart={warmDraftMapTools}
            >
              Load Map Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(SurveyPlanStepOnePanel);
