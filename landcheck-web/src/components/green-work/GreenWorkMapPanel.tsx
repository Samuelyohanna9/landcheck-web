import { Suspense } from "react";
import { lazyWithChunkRecovery } from "../../utils/lazyWithChunkRecovery";

const TreeMap = lazyWithChunkRecovery(() => import("../TreeMap"));

type GreenWorkMapPanelProps = {
  [key: string]: any;
};

export default function GreenWorkMapPanel(props: GreenWorkMapPanelProps) {
  const {
    mapCardRef,
    assignWorkAreaMode,
    mapAreaDrawMode,
    maintenanceMapFocusActive,
    maintenanceFocusedTreeIds,
    setMaintenanceMapFocusEnabled,
    openForm,
    activeWorkflowProfile,
    mapTrees,
    treePositionDraft,
    inspectedTree,
    setTreePositionDraft,
    setNewOrderAreaGeometry,
    setInspectedTree,
    setMenuOpen,
    mapFitPoints,
    existingTreeMapAreas,
  } = props;

  return (
    <div ref={mapCardRef} className="green-work-card green-work-map-card">
      <h3>
        {assignWorkAreaMode
          ? "Planting Area Map (Polygon Draw)"
          : mapAreaDrawMode
            ? "Map View (Polygon Draw Enabled)"
            : "Map View"}
      </h3>
      <p className="green-work-note">
        {assignWorkAreaMode
          ? "Draw one polygon for this planting order in this tab, then click Assign Work."
          : mapAreaDrawMode
            ? "Planting-area draw is enabled from Assign Tree Planting. Draw polygon here, then return to assign work."
            : maintenanceMapFocusActive
              ? `Showing ${maintenanceFocusedTreeIds.length} selected maintenance tree${maintenanceFocusedTreeIds.length === 1 ? "" : "s"} from the queue. Clear focus to return to the full project map.`
              : activeWorkflowProfile === "agric"
                ? "Project farm map view. Inspect mapped farm boundaries and open farmer-linked plot details."
                : "Project tree map view. Inspect trees and monitor field positions."}
      </p>
      {(maintenanceMapFocusActive || (mapAreaDrawMode && !assignWorkAreaMode)) && (
        <div className="work-actions">
          {maintenanceMapFocusActive && (
            <button type="button" onClick={() => setMaintenanceMapFocusEnabled(false)}>
              Clear Maintenance Focus
            </button>
          )}
          {mapAreaDrawMode && !assignWorkAreaMode && (
            <button type="button" onClick={() => openForm("assign_work")}>
              Back To Assign Tree Planting
            </button>
          )}
        </div>
      )}
      <div className="green-work-map-layout">
        <div className="green-work-map-canvas">
          <Suspense fallback={<div className="green-work-empty-state">Loading work map...</div>}>
            <TreeMap
              trees={mapTrees}
              draftPoint={
                treePositionDraft && inspectedTree && Number(treePositionDraft.treeId) === Number(inspectedTree.id)
                  ? { lng: treePositionDraft.lng, lat: treePositionDraft.lat }
                  : null
              }
              onDraftMove={
                treePositionDraft && inspectedTree && Number(treePositionDraft.treeId) === Number(inspectedTree.id)
                  ? (lng: number, lat: number) => setTreePositionDraft((prev: any) => (prev ? { ...prev, lng, lat } : prev))
                  : undefined
              }
              suspendFitBounds={Boolean(treePositionDraft && inspectedTree && Number(treePositionDraft.treeId) === Number(inspectedTree.id))}
              onAddTree={() => {}}
              enableDraw={mapAreaDrawMode}
              drawMode={mapAreaDrawMode ? "polygon" : "point"}
              drawActive={mapAreaDrawMode}
              onPolygonChange={mapAreaDrawMode ? (geometry: any) => setNewOrderAreaGeometry(geometry) : undefined}
              minHeight={mapAreaDrawMode ? 520 : 500}
              onTreeInspect={(detail: any) => {
                setInspectedTree(detail);
                if (detail) setMenuOpen(false);
              }}
              fitBounds={mapFitPoints}
              assignmentAreas={existingTreeMapAreas}
              workflowMode={activeWorkflowProfile}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
