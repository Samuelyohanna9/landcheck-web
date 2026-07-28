type GreenWorkExistingTreeIntakePanelProps = {
  activeProjectId: number;
  title: string;
  exportCsvLabel: string;
  exportPdfLabel: string;
  workPartnerOrgPaused: boolean;
  exportExistingTreesCsv: () => void | Promise<void>;
  exportExistingTreesPdf: () => void | Promise<void>;
  includePhotosInExistingTreesPdf: boolean;
  setIncludePhotosInExistingTreesPdf: (value: boolean) => void;
  loadProjectData: (projectId: number) => void | Promise<void>;
  loadExistingTreeMetrics: (projectId: number) => void | Promise<void>;
  contextCopy: string;
  existingTreeIntakeRows: any[];
  fieldWorkflowMode: boolean;
  agricWorkflowMode: boolean;
  reliefWorkflowMode: boolean;
  existingTreeIntakeAgricSummary: {
    totalAreaHectares: number;
    totalEstimatedYieldKg: number;
  };
  existingTreeMetricsLoading: boolean;
  existingTreeMetricsById: Record<number, any>;
  formatPlotRecordLabel: (tree: any) => string;
  getPlotCommodityLabel: (tree: any) => string;
  formatPlotAreaLabel: (tree: any, metric?: any) => string;
  formatPlotSeasonLabel: (tree: any) => string;
  formatTaskTypeLabel: (value: string | null | undefined) => string;
  formatBoundaryCaptureMethodLabel: (value: any) => string;
  formatDateLabel: (value: string | null | undefined) => string;
  formatReliefSiteLabel: (tree: any) => string;
  formatReliefDamageLevelLabel: (value: any) => string;
  formatProjectTreeLabelById: (treeId: any) => string;
  formatExistingTreeCountLabel: (tree: any, metric?: any) => string;
  formatExistingTreeAreaLabel: (tree: any, metric?: any) => string;
  formatTreeOriginLabel: (value: string | null | undefined) => string;
  formatAttributionScopeLabel: (value: string | null | undefined) => string;
  formatExistingTreeAgeLabel: (tree: any, metric?: any) => string;
  formatTreeHeight: (value: any) => string;
  formatExistingTreeCo2Label: (metric?: any) => string;
  backendUrl: string;
};

export default function GreenWorkExistingTreeIntakePanel({
  activeProjectId,
  title,
  exportCsvLabel,
  exportPdfLabel,
  workPartnerOrgPaused,
  exportExistingTreesCsv,
  exportExistingTreesPdf,
  includePhotosInExistingTreesPdf,
  setIncludePhotosInExistingTreesPdf,
  loadProjectData,
  loadExistingTreeMetrics,
  contextCopy,
  existingTreeIntakeRows,
  fieldWorkflowMode,
  agricWorkflowMode,
  reliefWorkflowMode,
  existingTreeIntakeAgricSummary,
  existingTreeMetricsLoading,
  existingTreeMetricsById,
  formatPlotRecordLabel,
  getPlotCommodityLabel,
  formatPlotAreaLabel,
  formatPlotSeasonLabel,
  formatTaskTypeLabel,
  formatBoundaryCaptureMethodLabel,
  formatDateLabel,
  formatReliefSiteLabel,
  formatReliefDamageLevelLabel,
  formatProjectTreeLabelById,
  formatExistingTreeCountLabel,
  formatExistingTreeAreaLabel,
  formatTreeOriginLabel,
  formatAttributionScopeLabel,
  formatExistingTreeAgeLabel,
  formatTreeHeight,
  formatExistingTreeCo2Label,
  backendUrl,
}: GreenWorkExistingTreeIntakePanelProps) {
  return (
    <div className="green-work-card">
      <div className="green-work-row">
        <h3>{title}</h3>
        <div className="work-actions">
          <button
            type="button"
            onClick={() => void exportExistingTreesCsv()}
            disabled={workPartnerOrgPaused}
            title={workPartnerOrgPaused ? "Paused organizations can export PDF only" : undefined}
          >
            {exportCsvLabel}
          </button>
          <button type="button" onClick={() => void exportExistingTreesPdf()}>
            {exportPdfLabel}
          </button>
          <label className="green-work-export-photo-toggle">
            <input
              type="checkbox"
              checked={includePhotosInExistingTreesPdf}
              onChange={(e) => setIncludePhotosInExistingTreesPdf(e.target.checked)}
            />
            <span>Include photos (appendix)</span>
          </label>
          <button
            type="button"
            onClick={() =>
              void Promise.all([
                loadProjectData(activeProjectId),
                loadExistingTreeMetrics(activeProjectId),
              ])
            }
          >
            Refresh
          </button>
        </div>
      </div>
      <p className="green-work-chart-context">{contextCopy}</p>
      <div className="green-work-live-summary">
        <span className="green-work-live-pill neutral">Rows: {existingTreeIntakeRows.length}</span>
        {fieldWorkflowMode ? (
          <>
            <span className="green-work-live-pill ok">
              Mapped Area: {existingTreeIntakeAgricSummary.totalAreaHectares.toFixed(2)} ha
            </span>
            {agricWorkflowMode ? (
              <span className="green-work-live-pill neutral">
                Est. Yield: {existingTreeIntakeAgricSummary.totalEstimatedYieldKg.toFixed(0)} kg
              </span>
            ) : null}
          </>
        ) : (
          <span className={`green-work-live-pill ${existingTreeMetricsLoading ? "warning" : "ok"}`}>
            CO2 Metrics: {existingTreeMetricsLoading ? "Loading..." : `${Object.keys(existingTreeMetricsById).length} rows`}
          </span>
        )}
      </div>
      <div className="green-work-live-table-wrap">
        <table className="green-work-live-table">
          <thead>
            {agricWorkflowMode ? (
              <tr>
                <th>Plot</th>
                <th>Farmer</th>
                <th>Crop</th>
                <th>Area</th>
                <th>Season</th>
                <th>Irrigation</th>
                <th>Stage</th>
                <th>Est. Yield</th>
                <th>Status</th>
                <th>Boundary</th>
                <th>Observed</th>
                <th>Captured By</th>
              </tr>
            ) : reliefWorkflowMode ? (
              <tr>
                <th>Site</th>
                <th>Beneficiary</th>
                <th>Asset Type</th>
                <th>Damage</th>
                <th>Area</th>
                <th>Response Path</th>
                <th>Occupancy</th>
                <th>Population Served</th>
                <th>Status</th>
                <th>Observed</th>
                <th>Captured By</th>
              </tr>
            ) : (
              <tr>
                <th>Tree</th>
                <th>Trees</th>
                <th>Area</th>
                <th>Species</th>
                <th>Date</th>
                <th>Origin</th>
                <th>Attribution</th>
                <th>Status</th>
                <th>Age</th>
                <th>Height</th>
                <th>CO2</th>
                <th>Custodian</th>
                <th>Tag</th>
                <th>Created By</th>
              </tr>
            )}
          </thead>
          <tbody>
            {existingTreeIntakeRows.length === 0 ? (
              <tr>
                <td colSpan={agricWorkflowMode ? 12 : reliefWorkflowMode ? 11 : 14} className="green-work-live-empty">
                  {agricWorkflowMode
                    ? "No plot records found in this project yet."
                    : reliefWorkflowMode
                      ? "No site records found in this project yet."
                      : "No Existing Tree records found in this project yet."}
                </td>
              </tr>
            ) : (
              existingTreeIntakeRows.slice(0, 500).map((tree) => {
                const metric = existingTreeMetricsById[Number(tree.id)];
                return agricWorkflowMode ? (
                  <tr key={`existing-main-${tree.id}`}>
                    <td>{formatPlotRecordLabel(tree)}</td>
                    <td>{tree.custodian_name || "-"}</td>
                    <td>{getPlotCommodityLabel(tree)}</td>
                    <td>{formatPlotAreaLabel(tree, metric)}</td>
                    <td>{formatPlotSeasonLabel(tree)}</td>
                    <td>{tree.record_profile_data?.irrigation_type ? formatTaskTypeLabel(tree.record_profile_data.irrigation_type) : "-"}</td>
                    <td>{tree.record_profile_data?.production_stage ? formatTaskTypeLabel(tree.record_profile_data.production_stage) : "-"}</td>
                    <td>
                      {Number.isFinite(Number(tree.record_profile_data?.estimated_yield_kg))
                        ? Number(tree.record_profile_data?.estimated_yield_kg).toFixed(0)
                        : "-"}
                    </td>
                    <td>{formatTaskTypeLabel(tree.status)}</td>
                    <td>{formatBoundaryCaptureMethodLabel(tree.record_profile_data?.boundary_capture_method)}</td>
                    <td>{formatDateLabel(tree.planting_date)}</td>
                    <td>{tree.created_by || "-"}</td>
                  </tr>
                ) : reliefWorkflowMode ? (
                  <tr key={`existing-main-${tree.id}`}>
                    <td>{formatReliefSiteLabel(tree)}</td>
                    <td>{tree.custodian_name || "-"}</td>
                    <td>{tree.record_profile_data?.asset_type ? formatTaskTypeLabel(tree.record_profile_data.asset_type) : "-"}</td>
                    <td>{formatReliefDamageLevelLabel(tree.record_profile_data?.damage_level)}</td>
                    <td>{formatPlotAreaLabel(tree, metric)}</td>
                    <td>{tree.record_profile_data?.response_pathway ? formatTaskTypeLabel(tree.record_profile_data.response_pathway) : "-"}</td>
                    <td>{tree.record_profile_data?.occupancy_status ? formatTaskTypeLabel(tree.record_profile_data.occupancy_status) : "-"}</td>
                    <td>{Number.isFinite(Number(tree.record_profile_data?.population_served)) ? Number(tree.record_profile_data?.population_served) : "-"}</td>
                    <td>{formatTaskTypeLabel(tree.status)}</td>
                    <td>{formatDateLabel(tree.planting_date)}</td>
                    <td>{tree.created_by || "-"}</td>
                  </tr>
                ) : (
                  <tr key={`existing-main-${tree.id}`}>
                    <td>{formatProjectTreeLabelById(tree.id).replace("Tree ", "")}</td>
                    <td>{formatExistingTreeCountLabel(tree, metric)}</td>
                    <td>{formatExistingTreeAreaLabel(tree, metric)}</td>
                    <td>{tree.species || "-"}</td>
                    <td>{formatDateLabel(tree.planting_date)}</td>
                    <td>{formatTreeOriginLabel(tree.tree_origin)}</td>
                    <td>{formatAttributionScopeLabel(tree.attribution_scope)}</td>
                    <td>{formatTaskTypeLabel(tree.status)}</td>
                    <td>{formatExistingTreeAgeLabel(tree, metric)}</td>
                    <td>{formatTreeHeight(tree.tree_height_m)}</td>
                    <td>{formatExistingTreeCo2Label(metric)}</td>
                    <td>{tree.custodian_name || "-"}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => window.open(`${backendUrl}/green/trees/${tree.id}/qr-tag/pdf`, "_blank")}
                        style={{ padding: "2px 6px", fontSize: "11px", background: "#083e20", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      >
                        Print
                      </button>
                    </td>
                    <td>{tree.created_by || "-"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
