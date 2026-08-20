import { Suspense, lazy } from "react";
import GreenLoadingAnimation from "../GreenLoadingAnimation";

const TreeMap = lazy(() => import("../TreeMap"));

type GreenWorkRemoteMonitoringPanelProps = {
  [key: string]: any;
};

type RemoteMonitoringSparklinePoint = {
  x: number;
  y: number;
  label: string;
  value: number;
};

type RemoteMonitoringSparkline = {
  path: string;
  fillPath: string;
  points: RemoteMonitoringSparklinePoint[];
  min: number;
  max: number;
  delta: number | null;
  firstLabel: string;
  lastLabel: string;
};

function formatRemoteMetricNumber(value: unknown, maximumFractionDigits = 0): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return "-";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits > 0 ? maximumFractionDigits : 0,
  }).format(numericValue);
}

function formatRemoteWorkflowSignalLabel(
  signal: unknown,
  fallbackFormatter: (signal: string) => string,
  isAgricWorkflow: boolean,
): string {
  const key = String(signal || "").trim().toLowerCase();
  if (isAgricWorkflow) {
    if (key === "stable") return "Field stable";
    if (key === "improving") return "Vigor improving";
    if (key === "watch") return "Stress watch";
    if (key === "no_data") return "No farm data";
  } else {
    if (key === "stable") return "Canopy stable";
    if (key === "improving") return "Canopy improving";
    if (key === "watch") return "Attention watch";
    if (key === "no_data") return "No tree data";
  }
  return fallbackFormatter(String(signal || ""));
}

function formatRemoteHealthLabel(key: unknown, fallbackLabel: unknown, isAgricWorkflow: boolean): string {
  const normalizedKey = String(key || "").trim().toLowerCase();
  const fallback = String(fallbackLabel || "").trim();
  if (isAgricWorkflow) {
    if (normalizedKey === "critical") return "Drought risk";
    if (normalizedKey === "stressed") return "Stressed";
    if (normalizedKey === "fair") return "Watch";
    if (normalizedKey === "healthy") return "Healthy";
    if (normalizedKey === "vigorous") return "Vigorous";
    if (normalizedKey === "no_data") return "No data";
  } else {
    if (normalizedKey === "critical") return "Critical";
    if (normalizedKey === "stressed") return "Needs attention";
    if (normalizedKey === "fair") return "Fair";
    if (normalizedKey === "healthy") return "Healthy";
    if (normalizedKey === "vigorous") return "Strong canopy";
    if (normalizedKey === "no_data") return "No data";
  }
  return fallback || "No data";
}

function describeRemoteNdviStrength(value: unknown, isAgricWorkflow: boolean): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return "No signal";
  if (isAgricWorkflow) {
    if (numericValue >= 0.5) return "High vigor";
    if (numericValue >= 0.35) return "Moderate vigor";
    if (numericValue >= 0.2) return "Weak vigor";
    return "Very low vigor";
  }
  if (numericValue >= 0.5) return "Dense canopy";
  if (numericValue >= 0.35) return "Moderate canopy";
  if (numericValue >= 0.2) return "Thin canopy";
  return "Very low canopy";
}

function buildRemoteMonitoringSparkline(series: any[]): RemoteMonitoringSparkline | null {
  const rows = Array.isArray(series)
    ? series
        .map((row: any) => {
          const numericValue = typeof row?.mean_ndvi === "number" ? row.mean_ndvi : Number(row?.mean_ndvi);
          if (!Number.isFinite(numericValue)) return null;
          return {
            label: String(row?.label || ""),
            value: numericValue,
          };
        })
        .filter(Boolean) as Array<{ label: string; value: number }>
    : [];

  if (!rows.length) return null;

  const width = 420;
  const height = 172;
  const paddingX = 20;
  const paddingY = 18;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  const values = rows.map((row) => row.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 0.001;

  const points = rows.map((row, index) => {
    const x = paddingX + (rows.length === 1 ? usableWidth / 2 : (usableWidth * index) / (rows.length - 1));
    const normalized = (row.value - min) / spread;
    const y = paddingY + usableHeight - normalized * usableHeight;
    return { x, y, label: row.label, value: row.value };
  });

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const fillPath = `${path} L ${lastPoint.x} ${height - paddingY} L ${firstPoint.x} ${height - paddingY} Z`;

  return {
    path,
    fillPath,
    points,
    min,
    max,
    delta: rows.length > 1 ? rows[rows.length - 1].value - rows[0].value : null,
    firstLabel: rows[0].label,
    lastLabel: rows[rows.length - 1].label,
  };
}

export default function GreenWorkRemoteMonitoringPanel(props: GreenWorkRemoteMonitoringPanelProps) {
  const {
    activeWorkflowProfile,
    loadRemoteMonitoringAnalysis,
    normalizeMapAreaGeometry,
    remoteMonitoringDraftGeometry,
    remoteMonitoringLoading,
    remoteMonitoringDraft,
    applyMonitoringSourceArea,
    monitoringSourceAreas,
    setRemoteMonitoringDrawActive,
    remoteMonitoringDrawActive,
    setRemoteMonitoringDraftGeometry,
    setRemoteMonitoringDraft,
    setRemoteMonitoringFocusedTreeId,
    setRemoteMonitoringActionTreeId,
    setRemoteMonitoringReport,
    remoteMonitoringDraftTreeSummary,
    remoteMonitoringProgressPct,
    remoteMonitoringProgressStep,
    REMOTE_MONITORING_PROGRESS_STEPS,
    REMOTE_MONITORING_PROGRESS_STEPS_AGRIC,
    mapCardRef,
    visibleProjectTrees,
    setInspectedTree,
    remoteMonitoringFitPoints,
    remoteMonitoringMapAreas,
    setMenuOpen,
    remoteMonitoringReport,
    remoteMonitoringAnalysisLabel,
    normalizeName,
    formatMonitoringSignalLabel,
    remoteMonitoringAgricInsights,
    remoteMonitoringHealthCounts,
    remoteMonitoringTopRiskTrees,
    focusRemoteMonitoringTree,
    formatProjectTreeLabelById,
    remoteMonitoringSortedTrees,
    remoteMonitoringFocusedTreeId,
    treeById,
    getPlotCommodityLabel,
    treeStatusLabel,
    openForm,
    openCustodianSupervisionAssign,
    openAssignTaskForTree,
    formatDateLabel,
    formatNdviBandLabel,
  } = props;

  const isAgricWorkflow = activeWorkflowProfile === "agric";
  const remoteMonitoringModeClass = isAgricWorkflow ? "is-agric" : "is-green";
  const remoteMonitoringCopy = {
    reportKicker: isAgricWorkflow ? "Farm Health Summary" : "Canopy Monitoring Summary",
    reportSubtitle: isAgricWorkflow
      ? "Satellite NDVI, cover density, drought-watch cues, and plot-by-plot vigor scoring for the selected farm block."
      : "Satellite vegetation signal, canopy coverage, and per-tree buffer monitoring for the selected planting polygon.",
    trendTitle: isAgricWorkflow ? "Crop vigor trend" : "Canopy signal trend",
    trendSubtitle: isAgricWorkflow ? "Latest crop-vigor composite history for this farm block." : "Latest tree-canopy composite history for this planting area.",
    distributionTitle: isAgricWorkflow ? "Plot health distribution" : "Tree health distribution",
    distributionSubtitle: isAgricWorkflow ? "How the selected plots are spreading across risk bands." : "How the selected trees are spreading across signal bands.",
    priorityTitle: isAgricWorkflow ? "Field intervention queue" : "Maintenance priority queue",
    prioritySubtitle: isAgricWorkflow
      ? "Locate stressed plots quickly and dispatch support visits."
      : "Review weak canopy signals and dispatch maintenance checks.",
    recordTitle: isAgricWorkflow ? "Plot health detail" : "Tree canopy detail",
    recordCountLabel: isAgricWorkflow ? "plot row(s)" : "tree row(s)",
    metricLabel: isAgricWorkflow ? "Field vigor" : "Buffer NDVI",
    metricEmptyTitle: isAgricWorkflow ? "No mapped plots inside this block" : "No stored trees inside this polygon",
    metricEmptyText: isAgricWorkflow
      ? "Choose another polygon or adjust the block so mapped farm anchors fall inside it."
      : "Choose another polygon or adjust the block so LandCheck trees fall inside it.",
    assignActionLabel: isAgricWorkflow ? "Assign Visit" : "Assign Maintenance",
    locateActionLabel: isAgricWorkflow ? "Locate plot" : "Locate tree",
  };

  const remoteMonitoringSeries = Array.isArray(remoteMonitoringReport?.series) ? remoteMonitoringReport.series : [];
  const remoteMonitoringSparkline = buildRemoteMonitoringSparkline(remoteMonitoringSeries);
  const remoteMonitoringHealthDistribution = Array.isArray(remoteMonitoringHealthCounts)
    ? remoteMonitoringHealthCounts.map((item: any) => {
        const count = Number(item?.count || 0);
        return {
          ...item,
          count,
          displayLabel: formatRemoteHealthLabel(item?.key, item?.label, isAgricWorkflow),
        };
      })
    : [];
  const remoteMonitoringHealthTotal = remoteMonitoringHealthDistribution.reduce((sum: number, item: any) => sum + Number(item.count || 0), 0);
  const remoteMonitoringOverviewMetrics = remoteMonitoringReport
    ? [
        {
          label: isAgricWorkflow ? "Plots in block" : "Trees in polygon",
          value: formatRemoteMetricNumber(remoteMonitoringReport.area.tree_count || 0),
          note: `${formatRemoteMetricNumber(remoteMonitoringReport.area.tree_record_count || 0)} stored ${isAgricWorkflow ? "plot" : "tree"} rows`,
        },
        {
          label: isAgricWorkflow ? "Active vegetation area" : "Canopy signal area",
          value: `${formatRemoteMetricNumber(remoteMonitoringReport.summary.vegetation_area_sqm || 0, 2)} sqm`,
          note: `${formatRemoteMetricNumber(remoteMonitoringReport.summary.vegetation_coverage_pct || 0, 1)}% of ${isAgricWorkflow ? "farm block" : "planting polygon"}`,
        },
        {
          label: isAgricWorkflow ? "Crop vigor index" : "Mean NDVI",
          value: formatRemoteMetricNumber(remoteMonitoringReport.summary.mean_ndvi, 3),
          note: isAgricWorkflow ? "Latest agronomic satellite composite" : "Latest canopy satellite composite",
        },
        {
          label: "Latest satellite image",
          value: formatDateLabel(remoteMonitoringReport.summary.latest_image_date || null),
          note: `${formatRemoteMetricNumber(remoteMonitoringReport.summary.image_count || 0)} image(s) used`,
        },
        {
          label: isAgricWorkflow ? "Block composition" : "Inventory mix",
          value: isAgricWorkflow
            ? `${formatRemoteMetricNumber(remoteMonitoringReport.area.new_planting_tree_count || 0)} mapped`
            : `${formatRemoteMetricNumber(remoteMonitoringReport.area.new_planting_tree_count || 0)} planted`,
          note: isAgricWorkflow
            ? `${formatRemoteMetricNumber(remoteMonitoringReport.area.existing_inventory_tree_count || 0)} existing plot batches`
            : `${formatRemoteMetricNumber(remoteMonitoringReport.area.existing_inventory_tree_count || 0)} existing inventory`,
        },
      ]
    : [];

  const handleRemoteMonitoringFollowUp = (tree: any) => {
    const treeId = Number(tree?.tree_id || 0);
    setRemoteMonitoringActionTreeId(null);
    if (activeWorkflowProfile === "agric") {
      openForm("support_visit_assign");
      openCustodianSupervisionAssign(Number(treeById.get(treeId)?.custodian_id || 0), "support_visit");
      return;
    }
    openAssignTaskForTree(treeId, "inspection");
  };
  const remoteMonitoringTrendRangeLabel = remoteMonitoringSparkline
    ? `${formatRemoteMetricNumber(remoteMonitoringSparkline.min, 3)} - ${formatRemoteMetricNumber(remoteMonitoringSparkline.max, 3)}`
    : "-";
  const remoteMonitoringTrendDelta = remoteMonitoringSparkline?.delta;
  const hasRemoteMonitoringTrendDelta = typeof remoteMonitoringTrendDelta === "number";
  const remoteMonitoringSummarySignalLabel = formatRemoteWorkflowSignalLabel(
    remoteMonitoringReport?.summary?.signal,
    formatMonitoringSignalLabel,
    isAgricWorkflow,
  );

  return (
    <>
      <div className="green-work-remote-shell">
        <div className="green-work-remote-workspace">
          <div className="green-work-card green-work-remote-card">
            <div className="green-work-row">
              <h3>{activeWorkflowProfile === "agric" ? "Farm Health Monitoring" : "Remote Monitoring"}</h3>
              <div className="work-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void loadRemoteMonitoringAnalysis()}
                  disabled={!normalizeMapAreaGeometry(remoteMonitoringDraftGeometry) || remoteMonitoringLoading}
                >
                  {remoteMonitoringLoading ? "Analyzing..." : activeWorkflowProfile === "agric" ? "Analyze Farm Health" : "Analyze Vegetation"}
                </button>
              </div>
            </div>
            <p className="green-work-note">
              {activeWorkflowProfile === "agric"
                ? "Choose an existing mapped farm boundary or draw a farm block on the map. NDVI, vegetation cover, stressed areas, drought watch, and crop-vigor trend are generated from recent satellite imagery."
                : "Choose an existing planting polygon or draw one on the map. Tree count comes from LandCheck tree records inside the polygon. NDVI is only used as a satellite vegetation proxy."}
            </p>

            <div className="green-work-remote-layout">
              <div className="green-work-remote-builder">
                <label>
                  {activeWorkflowProfile === "agric" ? "Use mapped farm boundary" : "Use existing planting area"}
                  <select
                    value={remoteMonitoringDraft.source_order_id}
                    onChange={(e) => applyMonitoringSourceArea(e.target.value)}
                  >
                    <option value="">{activeWorkflowProfile === "agric" ? "Draw a new farm block instead" : "Draw a new polygon instead"}</option>
                    {monitoringSourceAreas.map((area: any) => (
                      <option key={`remote-source-${area.id}`} value={area.id}>
                        {activeWorkflowProfile === "agric"
                          ? area.label
                          : `${area.label} | ${area.assignee_name || "Unassigned"} | target ${area.target_trees}`}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="work-actions">
                  <button type="button" onClick={() => setRemoteMonitoringDrawActive((prev: boolean) => !prev)}>
                    {remoteMonitoringDrawActive ? "Stop Polygon Draw" : activeWorkflowProfile === "agric" ? "Draw Farm Block On Map" : "Draw Polygon On Map"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRemoteMonitoringDraftGeometry(null);
                      setRemoteMonitoringDraft((prev: any) => ({ ...prev, source_order_id: "" }));
                      setRemoteMonitoringDrawActive(false);
                      setRemoteMonitoringFocusedTreeId(null);
                      setRemoteMonitoringActionTreeId(null);
                      setRemoteMonitoringReport(null);
                    }}
                  >
                    Clear Polygon
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void loadRemoteMonitoringAnalysis()}
                    disabled={!normalizeMapAreaGeometry(remoteMonitoringDraftGeometry) || remoteMonitoringLoading}
                  >
                    {remoteMonitoringLoading ? "Analyzing..." : activeWorkflowProfile === "agric" ? "Analyze Farm Health" : "Analyze Vegetation"}
                  </button>
                </div>
                <div className="green-work-remote-draft-summary">
                  <span className="green-work-flow-pill">
                    {activeWorkflowProfile === "agric" ? "Plot rows" : "Tree rows"}: {remoteMonitoringDraftTreeSummary.tree_record_count}
                  </span>
                  <span className="green-work-flow-pill">
                    {activeWorkflowProfile === "agric" ? "Plots in area" : "Trees in polygon"}: {remoteMonitoringDraftTreeSummary.tree_count}
                  </span>
                  <span className="green-work-flow-pill">
                    {activeWorkflowProfile === "agric" ? "Mapped plots" : "New planting"}: {remoteMonitoringDraftTreeSummary.new_planting_tree_count}
                  </span>
                  <span className="green-work-flow-pill">
                    {activeWorkflowProfile === "agric" ? "Existing plot batches" : "Existing inventory"}: {remoteMonitoringDraftTreeSummary.existing_inventory_tree_count}
                  </span>
                </div>
              </div>
            </div>
            {remoteMonitoringLoading && (
              <div className="green-work-remote-progress-panel">
                <GreenLoadingAnimation size="small" />
                <div className="green-work-remote-progress-head">
                  <strong>{activeWorkflowProfile === "agric" ? "Farm-health calculation in progress" : "Vegetation calculation in progress"}</strong>
                  <span>{Math.max(8, Math.min(100, Math.round(remoteMonitoringProgressPct || 0)))}%</span>
                </div>
                <div className="green-work-remote-progress-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(8, Math.min(100, remoteMonitoringProgressPct || 0))}%` }} />
                </div>
                <div className="green-work-remote-progress-steps">
                  {(activeWorkflowProfile === "agric" ? REMOTE_MONITORING_PROGRESS_STEPS_AGRIC : REMOTE_MONITORING_PROGRESS_STEPS).map((label: string, index: number) => {
                    const isDone = index < remoteMonitoringProgressStep;
                    const isActive = index === remoteMonitoringProgressStep;
                    return (
                      <div
                        key={`remote-progress-step-${label}`}
                        className={`green-work-remote-progress-step ${isDone ? "is-done" : ""} ${isActive ? "is-active" : ""}`}
                      >
                        <span>{index + 1}</span>
                        <strong>{label}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div ref={mapCardRef} className="green-work-card green-work-map-card green-work-remote-map-card">
            <h3>
              {remoteMonitoringDrawActive
                ? activeWorkflowProfile === "agric"
                  ? "Farm Health Map (Polygon Draw Enabled)"
                  : "Remote Monitoring Map (Polygon Draw Enabled)"
                : activeWorkflowProfile === "agric"
                  ? "Farm Health Map"
                  : "Remote Monitoring Map"}
            </h3>
            <p className="green-work-note">
              {remoteMonitoringDrawActive
                ? activeWorkflowProfile === "agric"
                  ? "Draw one polygon for the farm block. When draw is off, you can inspect mapped farm boundaries on the map."
                  : "Draw one polygon for the monitoring block. When draw is off, you can inspect trees on the map."
                : activeWorkflowProfile === "agric"
                  ? "Inspect mapped farm boundaries, select a farm block, and run NDVI-based health analysis."
                  : "Inspect trees and planting polygons, then run satellite analysis for the selected polygon."}
            </p>
            <div className="green-work-map-layout">
              <div className="green-work-map-canvas">
                <Suspense fallback={<div className="green-work-empty-state">Loading monitoring map...</div>}>
                  <TreeMap
                    trees={visibleProjectTrees}
                    onAddTree={() => {}}
                    enableDraw={remoteMonitoringDrawActive}
                    drawMode="polygon"
                    drawActive={remoteMonitoringDrawActive}
                    onPolygonChange={remoteMonitoringDrawActive ? (geometry: any) => {
                      setRemoteMonitoringDraftGeometry(geometry);
                      setRemoteMonitoringFocusedTreeId(null);
                      setRemoteMonitoringActionTreeId(null);
                      setRemoteMonitoringReport(null);
                    } : undefined}
                    minHeight={560}
                    onTreeInspect={(detail: any) => {
                      setInspectedTree(detail);
                      setRemoteMonitoringFocusedTreeId(detail ? Number(detail.id || 0) : null);
                      setRemoteMonitoringActionTreeId(null);
                      if (detail) setMenuOpen(false);
                    }}
                    fitBounds={remoteMonitoringFitPoints}
                    assignmentAreas={remoteMonitoringMapAreas}
                    workflowMode={activeWorkflowProfile}
                  />
                </Suspense>
              </div>
            </div>
          </div>
        </div>

        <div className={`green-work-card green-work-remote-report-card ${remoteMonitoringModeClass}`}>
          <div className="green-work-remote-report-head">
            <div className="green-work-remote-report-copy">
              <p className="green-work-remote-kicker">{remoteMonitoringCopy.reportKicker}</p>
              <h3>{remoteMonitoringAnalysisLabel}</h3>
              <p className="green-work-remote-subtitle">{remoteMonitoringCopy.reportSubtitle}</p>
            </div>
            {remoteMonitoringReport?.summary?.signal && (
              <span className={`green-work-remote-signal is-${normalizeName(remoteMonitoringReport.summary.signal)}`}>
                {remoteMonitoringSummarySignalLabel}
              </span>
            )}
          </div>
          {!normalizeMapAreaGeometry(remoteMonitoringDraftGeometry) ? (
            <div className="green-work-remote-empty-state">
              <strong>No polygon selected yet</strong>
              <p>{activeWorkflowProfile === "agric" ? "Choose a mapped farm boundary or draw a farm block on the map, then run analysis." : "Choose an existing planting polygon or draw one on the map, then run analysis."}</p>
            </div>
          ) : remoteMonitoringLoading ? (
            <div className="green-work-remote-progress-panel is-report-panel">
              <GreenLoadingAnimation size="small" />
              <div className="green-work-remote-progress-head">
                <strong>{activeWorkflowProfile === "agric" ? "Calculating farm-health summary" : "Calculating vegetation summary"}</strong>
                <span>{Math.max(8, Math.min(100, Math.round(remoteMonitoringProgressPct || 0)))}%</span>
              </div>
              <div className="green-work-remote-progress-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(8, Math.min(100, remoteMonitoringProgressPct || 0))}%` }} />
              </div>
              <div className="green-work-remote-progress-steps">
                {(activeWorkflowProfile === "agric" ? REMOTE_MONITORING_PROGRESS_STEPS_AGRIC : REMOTE_MONITORING_PROGRESS_STEPS).map((label: string, index: number) => {
                  const isDone = index < remoteMonitoringProgressStep;
                  const isActive = index === remoteMonitoringProgressStep;
                  return (
                    <div
                      key={`remote-report-progress-step-${label}`}
                      className={`green-work-remote-progress-step ${isDone ? "is-done" : ""} ${isActive ? "is-active" : ""}`}
                    >
                      <span>{index + 1}</span>
                      <strong>{label}</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : !remoteMonitoringReport ? (
            <div className="green-work-remote-empty-state">
              <strong>{activeWorkflowProfile === "agric" ? "No farm-health result yet" : "No monitoring result yet"}</strong>
              <p>{activeWorkflowProfile === "agric" ? "Run farm-health analysis to load NDVI, vegetation cover, drought watch, and per-plot proxy values." : "Run vegetation analysis to load polygon metrics and per-tree satellite proxy values."}</p>
            </div>
          ) : (
            <>
              <p className="green-work-note green-work-remote-summary-note">
                {remoteMonitoringReport.summary.signal_message}
              </p>
              <div className="green-work-remote-overview-strip">
                {remoteMonitoringOverviewMetrics.map((metric: any) => (
                  <div key={`remote-overview-${metric.label}`} className="green-work-remote-overview-card">
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                    <small>{metric.note}</small>
                  </div>
                ))}
              </div>

              <div className="green-work-remote-dashboard-grid">
                <div className="green-work-remote-dashboard-column">
                  <section className="green-work-remote-dashboard-card">
                    <div className="green-work-remote-section-head">
                      <div>
                        <strong>{remoteMonitoringCopy.trendTitle}</strong>
                        <span>
                          {remoteMonitoringSparkline
                            ? `${remoteMonitoringSparkline.firstLabel} to ${remoteMonitoringSparkline.lastLabel}`
                            : remoteMonitoringCopy.trendSubtitle}
                        </span>
                      </div>
                      {hasRemoteMonitoringTrendDelta && (
                        <bdi
                          className={`green-work-remote-trend-badge ${remoteMonitoringTrendDelta >= 0 ? "is-positive" : "is-negative"}`}
                        >
                          {remoteMonitoringTrendDelta >= 0 ? "+" : ""}
                          {formatRemoteMetricNumber(remoteMonitoringTrendDelta, 3)}
                        </bdi>
                      )}
                    </div>
                    {remoteMonitoringSparkline ? (
                      <div className="green-work-remote-trend-chart">
                        <svg
                          className="green-work-remote-trend-svg"
                          viewBox="0 0 420 172"
                          role="img"
                          aria-label={remoteMonitoringCopy.trendTitle}
                        >
                          <defs>
                            <linearGradient id="remoteMonitoringTrendFill" x1="0%" x2="0%" y1="0%" y2="100%">
                              <stop offset="0%" stopColor="rgba(42, 168, 82, 0.38)" />
                              <stop offset="100%" stopColor="rgba(42, 168, 82, 0.02)" />
                            </linearGradient>
                          </defs>
                          <path className="green-work-remote-trend-fill" d={remoteMonitoringSparkline.fillPath} />
                          <path className="green-work-remote-trend-line" d={remoteMonitoringSparkline.path} />
                          {remoteMonitoringSparkline.points.map((point) => (
                            <circle
                              key={`remote-trend-point-${point.label}`}
                              className="green-work-remote-trend-dot"
                              cx={point.x}
                              cy={point.y}
                              r="4"
                            />
                          ))}
                        </svg>
                        <div className="green-work-remote-trend-axis">
                          <span>{remoteMonitoringSparkline.firstLabel}</span>
                          <span>{remoteMonitoringSparkline.lastLabel}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="green-work-remote-empty-state is-loading">
                        <strong>No series history yet</strong>
                        <p>The trend line appears once multiple monitoring periods are available for this area.</p>
                      </div>
                    )}
                      <div className="green-work-remote-trend-metrics">
                        <div className="green-work-remote-trend-metric">
                          <span>Current NDVI</span>
                        <strong>{formatRemoteMetricNumber(remoteMonitoringReport.summary.mean_ndvi, 3)}</strong>
                      </div>
                      <div className="green-work-remote-trend-metric">
                        <span>Observed range</span>
                        <strong>{remoteMonitoringTrendRangeLabel}</strong>
                      </div>
                      <div className="green-work-remote-trend-metric">
                        <span>Latest image</span>
                        <strong>{formatDateLabel(remoteMonitoringReport.summary.latest_image_date || null)}</strong>
                      </div>
                    </div>
                    {activeWorkflowProfile === "agric" && remoteMonitoringAgricInsights.length ? (
                      <div className="green-work-remote-insight-grid is-dashboard">
                        {remoteMonitoringAgricInsights.map((item: any) => (
                          <div key={`remote-insight-${item.title}`} className={`green-work-remote-insight-card is-${item.tone}`}>
                            <span>{item.title}</span>
                            <strong>{item.value}</strong>
                            <small>{item.note}</small>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </section>

                  <section className="green-work-remote-dashboard-card">
                    <div className="green-work-remote-section-head">
                      <div>
                        <strong>{remoteMonitoringCopy.distributionTitle}</strong>
                        <span>{remoteMonitoringCopy.distributionSubtitle}</span>
                      </div>
                    </div>
                    {remoteMonitoringHealthDistribution.length ? (
                      <div className="green-work-remote-distribution-list">
                        {remoteMonitoringHealthDistribution.map((item: any) => {
                          const sharePct = remoteMonitoringHealthTotal > 0 ? (Number(item.count || 0) / remoteMonitoringHealthTotal) * 100 : 0;
                          return (
                            <div key={`remote-health-distribution-${item.key}`} className="green-work-remote-distribution-row">
                              <div className="green-work-remote-distribution-top">
                                <span>{item.displayLabel}</span>
                                <strong>{formatRemoteMetricNumber(item.count)}</strong>
                              </div>
                              <div className="green-work-remote-distribution-bar" aria-hidden="true">
                                <span
                                  className={`is-${normalizeName(item.key)}`}
                                  style={{ width: `${Math.max(sharePct, sharePct > 0 ? 8 : 0)}%` }}
                                />
                              </div>
                              <small>{formatRemoteMetricNumber(sharePct, 1)}% of monitored rows</small>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="green-work-remote-empty-state is-loading">
                        <strong>No signal categories yet</strong>
                        <p>Run analysis to break the selected area into health bands and action categories.</p>
                      </div>
                    )}
                    <div className="green-work-remote-health-counts">
                      {remoteMonitoringHealthCounts.map((item: any) => (
                        <div key={`remote-health-count-${item.key}`} className={`green-work-remote-health-chip is-${normalizeName(item.key)}`}>
                          <strong>{item.count}</strong>
                          <span>{formatRemoteHealthLabel(item.key, item.label, isAgricWorkflow)}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <section className="green-work-remote-dashboard-card green-work-remote-priority-card">
                  <div className="green-work-remote-section-head">
                    <div>
                      <strong>{remoteMonitoringCopy.priorityTitle}</strong>
                      <span>{remoteMonitoringCopy.prioritySubtitle}</span>
                    </div>
                    <bdi className="green-work-remote-priority-total">
                      {formatRemoteMetricNumber(remoteMonitoringTopRiskTrees.length)} items
                    </bdi>
                  </div>
                  {remoteMonitoringTopRiskTrees.length ? (
                    <div className="green-work-remote-priority-list">
                      {remoteMonitoringTopRiskTrees.map((tree: any) => (
                        <article
                          key={`remote-risk-${tree.tree_id}`}
                          className={`green-work-remote-priority-item is-${normalizeName(tree.satellite_health || "no_data")}`}
                        >
                          <div className="green-work-remote-priority-top">
                            <button
                              type="button"
                              className="green-work-remote-tree-link"
                              onClick={() => focusRemoteMonitoringTree(tree)}
                            >
                              {tree.tree_label || formatProjectTreeLabelById(tree.tree_id)}
                            </button>
                            <span className={`green-work-remote-tree-health is-${normalizeName(tree.satellite_health || "no_data")}`}>
                              {formatRemoteHealthLabel(tree.satellite_health, tree.satellite_health_label, isAgricWorkflow)}
                            </span>
                          </div>
                          <div className="green-work-remote-tree-card-meta">
                            <span>{activeWorkflowProfile === "agric" ? getPlotCommodityLabel(treeById.get(Number(tree.tree_id || 0)) || { species: tree.species }) : tree.species || "-"}</span>
                            <span>{treeStatusLabel(tree.status)}</span>
                          </div>
                          <p className="green-work-remote-tree-card-note">
                            {tree.satellite_health_note || (activeWorkflowProfile === "agric"
                              ? "This plot needs field confirmation."
                              : "This tree needs a field check.")}
                          </p>
                          <div className="green-work-remote-priority-bottom">
                            <div className="green-work-remote-priority-metric">
                              <span>{activeWorkflowProfile === "agric" ? "Vegetation signal" : "NDVI"}</span>
                              <strong>
                                {typeof tree.local_mean_ndvi === "number"
                                  ? activeWorkflowProfile === "agric"
                                    ? describeRemoteNdviStrength(tree.local_mean_ndvi, isAgricWorkflow)
                                    : tree.local_mean_ndvi.toFixed(3)
                                  : "-"}
                              </strong>
                            </div>
                            <div className="green-work-remote-priority-actions">
                              <button type="button" onClick={() => focusRemoteMonitoringTree(tree)}>
                                {remoteMonitoringCopy.locateActionLabel}
                              </button>
                              <button type="button" className="is-primary" onClick={() => handleRemoteMonitoringFollowUp(tree)}>
                                {remoteMonitoringCopy.assignActionLabel}
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="green-work-remote-empty-state">
                      <strong>{activeWorkflowProfile === "agric" ? "No stressed plots in queue" : "No priority trees in queue"}</strong>
                      <p>{activeWorkflowProfile === "agric" ? "Once weaker farm-health signals are detected, the highest-risk plots will appear here first." : "Once lower vegetation signals are detected, the weakest trees will appear here first."}</p>
                    </div>
                  )}
                </section>
              </div>

              <div className="green-work-remote-record-board">
                <div className="green-work-remote-tree-table-head">
                  <strong>{remoteMonitoringCopy.recordTitle}</strong>
                  <span>{remoteMonitoringSortedTrees.length || 0} {remoteMonitoringCopy.recordCountLabel}</span>
                </div>
                {remoteMonitoringSortedTrees.length ? (
                  <div className="green-work-remote-record-grid">
                    {remoteMonitoringSortedTrees.map((tree: any) => {
                      const treeId = Number(tree.tree_id || 0);
                      const isFocused = Number(remoteMonitoringFocusedTreeId || 0) === treeId;
                      return (
                        <article
                          key={`remote-tree-${tree.tree_id}`}
                          className={`green-work-remote-record-row ${isFocused ? "is-focused" : ""}`}
                        >
                          <div className="green-work-remote-record-main">
                            <div className="green-work-remote-tree-card-head">
                              <button
                                type="button"
                                className="green-work-remote-tree-link"
                                onClick={() => focusRemoteMonitoringTree(tree)}
                              >
                                {tree.tree_label || formatProjectTreeLabelById(tree.tree_id)}
                              </button>
                              <span className={`green-work-remote-tree-health is-${normalizeName(tree.satellite_health || "no_data")}`}>
                                {formatRemoteHealthLabel(tree.satellite_health, tree.satellite_health_label, isAgricWorkflow)}
                              </span>
                            </div>
                            <div className="green-work-remote-tree-card-meta">
                              <span>{activeWorkflowProfile === "agric" ? getPlotCommodityLabel(treeById.get(Number(tree.tree_id || 0)) || { species: tree.species }) : tree.species || "-"}</span>
                              <span>{treeStatusLabel(tree.status)}</span>
                              {tree.inventory_tree_count && tree.inventory_tree_count > 1 ? (
                                <span>{tree.inventory_tree_count} {activeWorkflowProfile === "agric" ? "plots" : "trees"}</span>
                              ) : null}
                            </div>
                            <p className="green-work-remote-tree-card-note">
                              {tree.satellite_health_note || (activeWorkflowProfile === "agric"
                                ? "Satellite farm-health signal is not available for this plot yet."
                                : "Satellite vegetation proxy not available for this tree yet.")}
                            </p>
                          </div>
                          <div className="green-work-remote-record-side">
                            <div className="green-work-remote-record-metric">
                              <span>{remoteMonitoringCopy.metricLabel}</span>
                              <strong>
                                {typeof tree.local_mean_ndvi === "number"
                                  ? activeWorkflowProfile === "agric"
                                    ? describeRemoteNdviStrength(tree.local_mean_ndvi, isAgricWorkflow)
                                    : tree.local_mean_ndvi.toFixed(3)
                                  : "-"}
                              </strong>
                              <small>
                                {typeof tree.local_mean_ndvi === "number" ? `Score ${tree.local_mean_ndvi.toFixed(3)}` : "No score yet"}
                              </small>
                            </div>
                            <div className="green-work-remote-record-actions">
                              <button type="button" onClick={() => focusRemoteMonitoringTree(tree)}>
                                {remoteMonitoringCopy.locateActionLabel}
                              </button>
                              <button type="button" className="is-primary" onClick={() => handleRemoteMonitoringFollowUp(tree)}>
                                {remoteMonitoringCopy.assignActionLabel}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="green-work-remote-empty-state">
                    <strong>{remoteMonitoringCopy.metricEmptyTitle}</strong>
                    <p>{remoteMonitoringCopy.metricEmptyText}</p>
                  </div>
                )}
              </div>
              {activeWorkflowProfile === "agric" ? (
                <details className="green-work-remote-tech-details">
                  <summary>Technical details</summary>
                  <div className="green-work-remote-summary-grid">
                    <div className="green-work-remote-metric">
                      <span>Plots In Block</span>
                      <strong>{remoteMonitoringReport.area.tree_count || 0}</strong>
                      <small>{remoteMonitoringReport.area.tree_record_count || 0} plot rows stored</small>
                    </div>
                    <div className="green-work-remote-metric">
                      <span>Healthy Vegetation Area</span>
                      <strong>{remoteMonitoringReport.summary.vegetation_area_sqm?.toFixed?.(2) || remoteMonitoringReport.summary.vegetation_area_sqm || 0} sqm</strong>
                      <small>{remoteMonitoringReport.summary.vegetation_coverage_pct ?? 0}% of farm block</small>
                    </div>
                    <div className="green-work-remote-metric">
                      <span>Vegetation sqm / Plot</span>
                      <strong>{remoteMonitoringReport.summary.vegetation_area_per_tree_sqm?.toFixed?.(2) || remoteMonitoringReport.summary.vegetation_area_per_tree_sqm || 0} sqm</strong>
                      <small>Uses mapped plots in block as denominator</small>
                    </div>
                    <div className="green-work-remote-metric">
                      <span>Crop Vigor Index (NDVI)</span>
                      <strong>{remoteMonitoringReport.summary.mean_ndvi?.toFixed?.(3) || remoteMonitoringReport.summary.mean_ndvi || "-"}</strong>
                      <small>Latest composite window across the farm block</small>
                    </div>
                    <div className="green-work-remote-metric">
                      <span>Latest Satellite Image</span>
                      <strong>{formatDateLabel(remoteMonitoringReport.summary.latest_image_date || null)}</strong>
                      <small>{remoteMonitoringReport.summary.image_count || 0} image(s) used</small>
                    </div>
                    <div className="green-work-remote-metric">
                      <span>Block Mix</span>
                      <strong>{remoteMonitoringReport.area.new_planting_tree_count || 0} new plots</strong>
                      <small>{remoteMonitoringReport.area.existing_inventory_tree_count || 0} existing plot records</small>
                    </div>
                  </div>
                  {remoteMonitoringReport.health_scale?.bands?.length ? (
                    <div className="green-work-remote-health-scale">
                      <div className="green-work-remote-health-scale-head">
                        <strong>Farm-health signal bands</strong>
                        {remoteMonitoringReport.health_scale?.buffer_meters ? (
                          <span>{remoteMonitoringReport.health_scale.buffer_meters}m plot-anchor buffer</span>
                        ) : null}
                      </div>
                      <div className="green-work-remote-health-scale-list">
                        {remoteMonitoringReport.health_scale.bands.map((band: any) => (
                          <div key={`remote-health-band-${band.key}`} className={`green-work-remote-health-band is-${normalizeName(band.key)}`}>
                            <strong>{formatRemoteHealthLabel(band.key, band.label, isAgricWorkflow)}</strong>
                            <span>{formatNdviBandLabel(band)}</span>
                            <small>{band.description || ""}</small>
                          </div>
                        ))}
                      </div>
                      {remoteMonitoringReport.health_scale?.note ? (
                        <p className="green-work-note green-work-remote-summary-note">{remoteMonitoringReport.health_scale.note}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="green-work-remote-series-table-wrap">
                    <table className="green-work-live-table green-work-remote-series-table">
                      <thead>
                        <tr>
                          <th>Period</th>
                          <th>Latest Image</th>
                          <th>NDVI</th>
                          <th>Healthy Area</th>
                          <th>Cover %</th>
                          <th>Vigor sqm / Plot</th>
                        </tr>
                      </thead>
                      <tbody>
                        {remoteMonitoringReport.series.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="green-work-live-empty">No monthly farm-health rows available yet.</td>
                          </tr>
                        ) : (
                          remoteMonitoringReport.series.map((row: any) => (
                            <tr key={`remote-series-${row.label}`}>
                              <td>{row.label}</td>
                              <td>{formatDateLabel(row.latest_image_date || null)}</td>
                              <td>{row.mean_ndvi?.toFixed?.(3) || row.mean_ndvi || "-"}</td>
                              <td>{row.vegetation_area_sqm?.toFixed?.(2) || row.vegetation_area_sqm || "-"}</td>
                              <td>{row.vegetation_coverage_pct?.toFixed?.(1) || row.vegetation_coverage_pct || "-"}</td>
                              <td>{row.vegetation_area_per_tree_sqm?.toFixed?.(2) || row.vegetation_area_per_tree_sqm || "-"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : (
                <>
                  <div className="green-work-remote-summary-grid">
                    <div className="green-work-remote-metric">
                      <span>Trees In Polygon</span>
                      <strong>{remoteMonitoringReport.area.tree_count || 0}</strong>
                      <small>{remoteMonitoringReport.area.tree_record_count || 0} tree rows stored</small>
                    </div>
                    <div className="green-work-remote-metric">
                      <span>Vegetation Signal Area</span>
                      <strong>{remoteMonitoringReport.summary.vegetation_area_sqm?.toFixed?.(2) || remoteMonitoringReport.summary.vegetation_area_sqm || 0} sqm</strong>
                      <small>{remoteMonitoringReport.summary.vegetation_coverage_pct ?? 0}% of polygon</small>
                    </div>
                    <div className="green-work-remote-metric">
                      <span>Signal Per Tree</span>
                      <strong>{remoteMonitoringReport.summary.vegetation_area_per_tree_sqm?.toFixed?.(2) || remoteMonitoringReport.summary.vegetation_area_per_tree_sqm || 0} sqm</strong>
                      <small>Uses stored trees inside polygon as denominator</small>
                    </div>
                    <div className="green-work-remote-metric">
                      <span>Mean NDVI</span>
                      <strong>{remoteMonitoringReport.summary.mean_ndvi?.toFixed?.(3) || remoteMonitoringReport.summary.mean_ndvi || "-"}</strong>
                      <small>Latest composite window across the polygon</small>
                    </div>
                    <div className="green-work-remote-metric">
                      <span>Latest Image</span>
                      <strong>{formatDateLabel(remoteMonitoringReport.summary.latest_image_date || null)}</strong>
                      <small>{remoteMonitoringReport.summary.image_count || 0} image(s) used</small>
                    </div>
                    <div className="green-work-remote-metric">
                      <span>Inventory Mix</span>
                      <strong>{remoteMonitoringReport.area.new_planting_tree_count || 0} planted</strong>
                      <small>{remoteMonitoringReport.area.existing_inventory_tree_count || 0} existing inventory</small>
                    </div>
                  </div>
                  {remoteMonitoringReport.health_scale?.bands?.length ? (
                    <div className="green-work-remote-health-scale">
                      <div className="green-work-remote-health-scale-head">
                        <strong>Satellite health bands</strong>
                        {remoteMonitoringReport.health_scale?.buffer_meters ? (
                          <span>{remoteMonitoringReport.health_scale.buffer_meters}m tree buffer</span>
                        ) : null}
                      </div>
                      <div className="green-work-remote-health-scale-list">
                        {remoteMonitoringReport.health_scale.bands.map((band: any) => (
                          <div key={`remote-health-band-${band.key}`} className={`green-work-remote-health-band is-${normalizeName(band.key)}`}>
                            <strong>{formatRemoteHealthLabel(band.key, band.label, isAgricWorkflow)}</strong>
                            <span>{formatNdviBandLabel(band)}</span>
                            <small>{band.description || ""}</small>
                          </div>
                        ))}
                      </div>
                      {remoteMonitoringReport.health_scale?.note ? (
                        <p className="green-work-note green-work-remote-summary-note">{remoteMonitoringReport.health_scale.note}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="green-work-remote-series-table-wrap">
                    <table className="green-work-live-table green-work-remote-series-table">
                      <thead>
                        <tr>
                          <th>Period</th>
                          <th>Latest Image</th>
                          <th>Mean NDVI</th>
                          <th>Signal Area</th>
                          <th>Cover %</th>
                          <th>Signal sqm / Tree</th>
                        </tr>
                      </thead>
                      <tbody>
                        {remoteMonitoringReport.series.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="green-work-live-empty">No monthly monitoring rows available yet.</td>
                          </tr>
                        ) : (
                          remoteMonitoringReport.series.map((row: any) => (
                            <tr key={`remote-series-${row.label}`}>
                              <td>{row.label}</td>
                              <td>{formatDateLabel(row.latest_image_date || null)}</td>
                              <td>{row.mean_ndvi?.toFixed?.(3) || row.mean_ndvi || "-"}</td>
                              <td>{row.vegetation_area_sqm?.toFixed?.(2) || row.vegetation_area_sqm || "-"}</td>
                              <td>{row.vegetation_coverage_pct?.toFixed?.(1) || row.vegetation_coverage_pct || "-"}</td>
                              <td>{row.vegetation_area_per_tree_sqm?.toFixed?.(2) || row.vegetation_area_per_tree_sqm || "-"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
