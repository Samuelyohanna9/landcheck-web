import { Suspense, useMemo, useState } from "react";
import { lazyWithChunkRecovery } from "../../utils/lazyWithChunkRecovery";

const TreeMap = lazyWithChunkRecovery(() => import("../TreeMap"));

const normalizeMapFilterValue = (value: unknown) =>
  String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "unknown";

const getMapTreeBlock = (tree: any) =>
  String(
    tree?.block_label ||
      tree?.block_name ||
      tree?.block ||
      tree?.farm_block ||
      tree?.record_profile_data?.block_label ||
      tree?.record_profile_data?.plot_block ||
      "",
  ).trim();

const getMapTreeStatus = (tree: any) => String(tree?.status_label || tree?.status || "Unknown").trim() || "Unknown";

const formatMapFilterLabel = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

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
    onAssignmentAreaInspect,
    setMenuOpen,
    mapFitPoints,
    assignmentAreas,
    fullscreenTargetRef,
  } = props;
  const [blockFilter, setBlockFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const treeRows = Array.isArray(mapTrees) ? mapTrees : [];
  const blockOptions = useMemo(() => {
    return Array.from(
      new Set(treeRows.map((tree: any) => getMapTreeBlock(tree)).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
  }, [treeRows]);
  const statusOptions = useMemo(() => {
    const labels = new Map<string, string>();
    treeRows.forEach((tree: any) => {
      const label = getMapTreeStatus(tree);
      const key = normalizeMapFilterValue(tree?.status || label);
      if (!labels.has(key)) labels.set(key, label);
    });
    return Array.from(labels.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [treeRows]);
  const filteredMapTrees = useMemo(() => {
    return treeRows.filter((tree: any) => {
      const matchesBlock = blockFilter === "all" || normalizeMapFilterValue(getMapTreeBlock(tree)) === blockFilter;
      const matchesStatus = statusFilter === "all" || normalizeMapFilterValue(tree?.status || getMapTreeStatus(tree)) === statusFilter;
      return matchesBlock && matchesStatus;
    });
  }, [blockFilter, statusFilter, treeRows]);
  const filteredMapFitPoints = useMemo(() => {
    const points = filteredMapTrees
      .map((tree: any) => ({ lng: Number(tree?.lng), lat: Number(tree?.lat) }))
      .filter((point: { lng: number; lat: number }) => Number.isFinite(point.lng) && Number.isFinite(point.lat));
    return points.length > 0 ? points : mapFitPoints || [];
  }, [filteredMapTrees, mapFitPoints]);

  return (
    <div ref={mapCardRef} className="green-work-card green-work-map-card">
      {(assignWorkAreaMode || mapAreaDrawMode || maintenanceMapFocusActive) && (
        <p className="green-work-note">
          {assignWorkAreaMode
            ? "Draw one polygon for this planting order in this tab, then click Assign Work."
            : mapAreaDrawMode
              ? "Planting-area draw is enabled from Assign Tree Planting. Draw polygon here, then return to assign work."
              : `Showing ${maintenanceFocusedTreeIds.length} selected maintenance tree${maintenanceFocusedTreeIds.length === 1 ? "" : "s"} from the queue. Clear focus to return to the full project map.`}
        </p>
      )}
      <div className="green-work-map-toolbar" aria-label="Map filters">
        <select
          aria-label="Filter by block"
          value={blockFilter}
          onChange={(event) => setBlockFilter(event.target.value)}
        >
          <option value="all">All Blocks</option>
          {blockOptions.map((block) => (
            <option key={block} value={normalizeMapFilterValue(block)}>{block}</option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All Status</option>
          {statusOptions.map(([value, label]) => (
            <option key={value} value={value}>{formatMapFilterLabel(label)}</option>
          ))}
        </select>
        <span className="green-work-map-toolbar-spacer" />
        <button
          type="button"
          className="green-work-map-filter-btn"
          title="Reset map filters"
          aria-label="Reset map filters"
          onClick={() => {
            setBlockFilter("all");
            setStatusFilter("all");
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 5h16l-6 7.5v5.5l-4 2v-7.5L4 5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
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
              trees={filteredMapTrees}
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
              minHeight={mapAreaDrawMode ? 520 : 320}
              onTreeInspect={(detail: any) => {
                onAssignmentAreaInspect?.(null);
                setInspectedTree(detail);
                if (detail) setMenuOpen(false);
              }}
              onAssignmentAreaInspect={(area: any) => {
                onAssignmentAreaInspect?.(area || null);
                if (area) {
                  setInspectedTree(null);
                  setTreePositionDraft(null);
                  setMenuOpen(false);
                }
              }}
              fitBounds={filteredMapFitPoints}
              assignmentAreas={assignmentAreas}
              workflowMode={activeWorkflowProfile}
              showMapControls
              fullscreenTargetRef={fullscreenTargetRef}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
