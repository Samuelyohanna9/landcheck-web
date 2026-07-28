import { Suspense, lazy } from "react";

const TreeMap = lazy(() => import("../TreeMap"));

type GreenWorkRemoteMonitoringPanelProps = {
  [key: string]: any;
};

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
    remoteMonitoringActionTreeId,
    treeById,
    getPlotCommodityLabel,
    treeStatusLabel,
    openForm,
    openCustodianSupervisionAssign,
    openAssignTaskForTree,
    formatDateLabel,
    formatNdviBandLabel,
  } = props;

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

        <div className="green-work-card green-work-remote-report-card">
          <div className="green-work-remote-report-head">
            <div className="green-work-remote-report-copy">
              <p className="green-work-remote-kicker">{activeWorkflowProfile === "agric" ? "Farm Health Summary" : "Vegetation Summary"}</p>
              <h3>{remoteMonitoringAnalysisLabel}</h3>
              <p className="green-work-remote-subtitle">
                {activeWorkflowProfile === "agric"
                  ? "Satellite NDVI, vegetation cover, stressed farm areas, drought-watch cues, and crop-vigor trend for the selected farm block."
                  : "Satellite vegetation signal for the current polygon, normalized by stored tree count and broken down by tree buffer."}
              </p>
            </div>
            {remoteMonitoringReport?.summary?.signal && (
              <span className={`green-work-remote-signal is-${normalizeName(remoteMonitoringReport.summary.signal)}`}>
                {formatMonitoringSignalLabel(remoteMonitoringReport.summary.signal)}
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
              {activeWorkflowProfile === "agric" && remoteMonitoringAgricInsights.length ? (
                <div className="green-work-remote-insight-grid">
                  {remoteMonitoringAgricInsights.map((item: any) => (
                    <div key={`remote-insight-${item.title}`} className={`green-work-remote-insight-card is-${item.tone}`}>
                      <span>{item.title}</span>
                      <strong>{item.value}</strong>
                      <small>{item.note}</small>
                    </div>
                  ))}
                </div>
              ) : null}
              {remoteMonitoringHealthCounts.length ? (
                <div className="green-work-remote-health-counts">
                  {remoteMonitoringHealthCounts.map((item: any) => (
                    <div key={`remote-health-count-${item.key}`} className={`green-work-remote-health-chip is-${normalizeName(item.key)}`}>
                      <strong>{item.count}</strong>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {remoteMonitoringTopRiskTrees.length ? (
                <div className="green-work-remote-risk-strip">
                  <strong>{activeWorkflowProfile === "agric" ? "Farms needing attention" : "Priority trees"}</strong>
                  {activeWorkflowProfile === "agric" && (
                    <small style={{ display: "block", marginBottom: 8, color: "var(--gw-muted, #888)", fontSize: 12 }}>
                      These plots show stress signals. Tap to locate on map, then assign a support visit.
                    </small>
                  )}
                  <div className="green-work-remote-risk-list">
                    {remoteMonitoringTopRiskTrees.map((tree: any) => (
                      <button
                        key={`remote-risk-${tree.tree_id}`}
                        type="button"
                        className={`green-work-remote-risk-card is-${normalizeName(tree.satellite_health || "")}`}
                        onClick={() => focusRemoteMonitoringTree(tree)}
                      >
                        <span>{tree.tree_label || formatProjectTreeLabelById(tree.tree_id)}</span>
                        <strong>{tree.satellite_health_label || "No data"}</strong>
                        {activeWorkflowProfile !== "agric" && (
                          <small>{typeof tree.local_mean_ndvi === "number" ? `NDVI ${tree.local_mean_ndvi.toFixed(3)}` : "No NDVI"}</small>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="green-work-remote-tree-detail-wrap">
                <div className="green-work-remote-tree-table-head">
                  <strong>{activeWorkflowProfile === "agric" ? "Farm health detail" : "Tree vegetation detail"}</strong>
                  <span>{remoteMonitoringSortedTrees.length || 0} {activeWorkflowProfile === "agric" ? "plot row(s)" : "tree row(s)"}</span>
                </div>
                {remoteMonitoringSortedTrees.length ? (
                  <div className="green-work-remote-tree-detail-list">
                    {remoteMonitoringSortedTrees.map((tree: any) => {
                      const treeId = Number(tree.tree_id || 0);
                      const isFocused = Number(remoteMonitoringFocusedTreeId || 0) === treeId;
                      const actionsOpen = Number(remoteMonitoringActionTreeId || 0) === treeId;
                      return (
                        <div
                          key={`remote-tree-${tree.tree_id}`}
                          className={`green-work-remote-tree-card ${isFocused ? "is-focused" : ""}`}
                        >
                          <div className="green-work-remote-tree-card-head">
                            <button
                              type="button"
                              className="green-work-remote-tree-link"
                              onClick={() => focusRemoteMonitoringTree(tree)}
                            >
                              {tree.tree_label || formatProjectTreeLabelById(tree.tree_id)}
                            </button>
                            <span className={`green-work-remote-tree-health is-${normalizeName(tree.satellite_health || "")}`}>
                              {tree.satellite_health_label || "No data"}
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
                          <div className="green-work-remote-tree-card-metrics">
                            {activeWorkflowProfile === "agric" ? (
                              <div>
                                <span>Vegetation Signal</span>
                                <strong>
                                  {typeof tree.local_mean_ndvi === "number"
                                    ? tree.local_mean_ndvi >= 0.5 ? "Strong" : tree.local_mean_ndvi >= 0.35 ? "Moderate" : tree.local_mean_ndvi >= 0.2 ? "Weak" : "Very Low"
                                    : "-"}
                                </strong>
                              </div>
                            ) : (
                              <div>
                                <span>NDVI</span>
                                <strong>{typeof tree.local_mean_ndvi === "number" ? tree.local_mean_ndvi.toFixed(3) : "-"}</strong>
                              </div>
                            )}
                          </div>
                          <div className="green-work-remote-tree-actions-menu">
                            <button
                              type="button"
                              className="green-work-remote-tree-actions-toggle"
                              onClick={() =>
                                setRemoteMonitoringActionTreeId((prev: any) => (Number(prev || 0) === treeId ? null : treeId))
                              }
                            >
                              {actionsOpen ? "Hide Actions" : activeWorkflowProfile === "agric" ? "Farm Actions" : "Tree Actions"}
                            </button>
                            {actionsOpen ? (
                              <div className="green-work-context-menu green-work-remote-inline-menu">
                                <button type="button" onClick={() => focusRemoteMonitoringTree(tree)}>
                                  View On Map
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRemoteMonitoringActionTreeId(null);
                                    if (activeWorkflowProfile === "agric") {
                                      openForm("support_visit_assign");
                                      openCustodianSupervisionAssign(Number(treeById.get(treeId)?.custodian_id || 0), "support_visit");
                                      return;
                                    }
                                    openAssignTaskForTree(treeId, "inspection");
                                  }}
                                >
                                  {activeWorkflowProfile === "agric" ? "Assign Support Visit" : "Assign Maintenance"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="green-work-remote-empty-state">
                    <strong>{activeWorkflowProfile === "agric" ? "No mapped plots inside this block" : "No stored trees inside this polygon"}</strong>
                    <p>{activeWorkflowProfile === "agric" ? "Choose another polygon or adjust the block so mapped farm anchors fall inside it." : "Choose another polygon or adjust the block so LandCheck trees fall inside it."}</p>
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
                            <strong>{band.label}</strong>
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
                            <strong>{band.label}</strong>
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
