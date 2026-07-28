type GreenWorkVerraReportsPanelProps = {
  activeProjectId: number;
  csrProjectMode: boolean;
  exportExistingTreesCsv: () => void | Promise<void>;
  workPartnerOrgPaused: boolean;
  exportExistingTreesPdf: () => void | Promise<void>;
  includePhotosInExistingTreesPdf: boolean;
  setIncludePhotosInExistingTreesPdf: (value: boolean) => void;
  loadProjectData: (projectId: number) => void | Promise<void>;
  loadExistingTreeMetrics: (projectId: number) => void | Promise<void>;
  existingTreeIntakeRows: any[];
  visibleProjectTrees: any[];
  formatCsrProgramTypeLabel: (value: string | null | undefined) => string;
  activeProjectRecord: any;
  projectSettingsDraft: any;
  exportVerraPackage: (format: any, overrideFilters?: any) => void | Promise<void>;
  loadVerraHistory: (projectId: number) => void | Promise<void>;
  verraFilters: any;
  setVerraFilters: (value: any) => void;
  assignees: string[];
  verraHistory: any[];
  formatDateLabel: (value: string | null | undefined) => string;
  normalizeVerraExportFormat: (value: any) => any;
};

export default function GreenWorkVerraReportsPanel({
  activeProjectId,
  csrProjectMode,
  exportExistingTreesCsv,
  workPartnerOrgPaused,
  exportExistingTreesPdf,
  includePhotosInExistingTreesPdf,
  setIncludePhotosInExistingTreesPdf,
  loadProjectData,
  loadExistingTreeMetrics,
  existingTreeIntakeRows,
  visibleProjectTrees,
  formatCsrProgramTypeLabel,
  activeProjectRecord,
  projectSettingsDraft,
  exportVerraPackage,
  loadVerraHistory,
  verraFilters,
  setVerraFilters,
  assignees,
  verraHistory,
  formatDateLabel,
  normalizeVerraExportFormat,
}: GreenWorkVerraReportsPanelProps) {
  return (
    <div className="green-work-card green-work-verra-card">
      {csrProjectMode ? (
        <>
          <div className="green-work-row">
            <h3>Programme Reports</h3>
            <div className="work-actions">
              <button
                type="button"
                onClick={exportExistingTreesCsv}
                disabled={workPartnerOrgPaused}
                title={workPartnerOrgPaused ? "Paused organizations can export PDF only" : undefined}
              >
                Export Programme CSV
              </button>
              <button type="button" onClick={exportExistingTreesPdf}>
                Export Programme PDF
              </button>
              <label className="green-work-export-photo-toggle">
                <input
                  type="checkbox"
                  checked={includePhotosInExistingTreesPdf}
                  onChange={(event) => setIncludePhotosInExistingTreesPdf(event.target.checked)}
                />
                <span>Include photos (appendix)</span>
              </label>
              <button
                type="button"
                onClick={() => void Promise.all([loadProjectData(activeProjectId), loadExistingTreeMetrics(activeProjectId)])}
              >
                Refresh
              </button>
            </div>
          </div>

          <p className="green-work-chart-context">
            Client-ready CSR report download. The PDF now packages executive summary, programme scope,
            implementation footprint, field evidence coverage, field-team readiness, carbon impact, and the
            detailed implementation register.
          </p>

          <div className="green-work-live-summary">
            <span className="green-work-live-pill neutral">Implementation records: {existingTreeIntakeRows.length}</span>
            <span className="green-work-live-pill ok">Visible trees: {visibleProjectTrees.length}</span>
            <span className="green-work-live-pill neutral">
              Programme: {formatCsrProgramTypeLabel(activeProjectRecord?.settings?.csr_config?.program_type || projectSettingsDraft.csr_program_type)}
            </span>
            <span className="green-work-live-pill warning">
              Reporting: {String(activeProjectRecord?.settings?.csr_config?.reporting_cycle || projectSettingsDraft.csr_reporting_cycle || "current cycle")}
            </span>
          </div>

          <div className="green-work-verra-filters">
            <label>
              CSR Client
              <input
                type="text"
                value={String(activeProjectRecord?.settings?.csr_config?.client_name || projectSettingsDraft.csr_client_name || "")}
                readOnly
              />
            </label>
            <label className="is-wide">
              Implementation Scope
              <textarea
                rows={3}
                value={String(activeProjectRecord?.settings?.csr_config?.implementation_scope || projectSettingsDraft.csr_implementation_scope || "")}
                readOnly
              />
            </label>
            <label className="is-wide">
              Target Outcomes
              <textarea
                rows={3}
                value={String(activeProjectRecord?.settings?.csr_config?.target_outcomes || projectSettingsDraft.csr_target_outcomes || "")}
                readOnly
              />
            </label>
          </div>
        </>
      ) : (
        <>
          <div className="green-work-row">
            <h3>Verra Reports</h3>
            <div className="work-actions">
              <button
                type="button"
                onClick={() => exportVerraPackage("zip")}
                disabled={workPartnerOrgPaused}
                title={workPartnerOrgPaused ? "Paused organizations can export PDF only" : undefined}
              >
                Export Verra ZIP
              </button>
              <button
                type="button"
                onClick={() => exportVerraPackage("json")}
                disabled={workPartnerOrgPaused}
                title={workPartnerOrgPaused ? "Paused organizations can export PDF only" : undefined}
              >
                Export Verra JSON
              </button>
              <button
                type="button"
                onClick={() => exportVerraPackage("docx")}
                disabled={workPartnerOrgPaused}
                title={workPartnerOrgPaused ? "Paused organizations can export PDF only" : undefined}
              >
                Export Verra DOCX
              </button>
              <button type="button" onClick={() => void loadVerraHistory(activeProjectId)}>
                Refresh History
              </button>
            </div>
          </div>

          <p className="green-work-chart-context">
            Use monitoring-period and verifier metadata filters before export. Every export is logged under this project for one-click rerun.
          </p>

          <div className="green-work-verra-filters">
            <label>
              Monitoring Start
              <input
                type="date"
                value={verraFilters.monitoring_start}
                onChange={(event) => setVerraFilters((prev: any) => ({ ...prev, monitoring_start: event.target.value }))}
              />
            </label>
            <label>
              Monitoring End
              <input
                type="date"
                value={verraFilters.monitoring_end}
                onChange={(event) => setVerraFilters((prev: any) => ({ ...prev, monitoring_end: event.target.value }))}
              />
            </label>
            <label>
              Season Model
              <select
                value={verraFilters.season_mode}
                onChange={(event) =>
                  setVerraFilters((prev: any) => ({
                    ...prev,
                    season_mode: event.target.value === "dry" ? "dry" : "rainy",
                  }))
                }
              >
                <option value="rainy">Rainy Season</option>
                <option value="dry">Dry Season</option>
              </select>
            </label>
            <label>
              Staff Scope
              <select
                value={verraFilters.assignee_name}
                onChange={(event) => setVerraFilters((prev: any) => ({ ...prev, assignee_name: event.target.value }))}
              >
                {assignees.map((assignee) => (
                  <option key={`verra-assignee-${assignee}`} value={assignee}>
                    {assignee === "all" ? "All staff" : assignee}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Methodology ID
              <input
                type="text"
                placeholder="e.g. VM0047"
                value={verraFilters.methodology_id}
                onChange={(event) => setVerraFilters((prev: any) => ({ ...prev, methodology_id: event.target.value }))}
              />
            </label>
            <label>
              Generated By
              <input
                type="text"
                placeholder="Supervisor name"
                value={verraFilters.generated_by}
                onChange={(event) => setVerraFilters((prev: any) => ({ ...prev, generated_by: event.target.value }))}
              />
            </label>
            <label className="is-wide">
              Verifier-ready Notes
              <textarea
                rows={3}
                placeholder="Notes for verifier package context..."
                value={verraFilters.verifier_notes}
                onChange={(event) => setVerraFilters((prev: any) => ({ ...prev, verifier_notes: event.target.value }))}
              />
            </label>
          </div>

          <div className="green-work-verra-history">
            <h4>Project Export History</h4>
            {verraHistory.length === 0 ? (
              <p className="green-work-note">No Verra export history yet for this project.</p>
            ) : (
              <div className="green-work-live-table-wrap">
                <table className="green-work-live-table green-work-verra-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Period</th>
                      <th>Methodology</th>
                      <th>Scope</th>
                      <th>Format</th>
                      <th>Summary</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verraHistory.map((item) => {
                      const periodText =
                        item.monitoring_start || item.monitoring_end
                          ? `${item.monitoring_start || "..."} to ${item.monitoring_end || "..."}`
                          : "Full project";
                      const summary = item.payload_summary || {};
                      return (
                        <tr key={`verra-history-${item.id}`}>
                          <td>{formatDateLabel(item.created_at)}</td>
                          <td>{periodText}</td>
                          <td>{item.methodology_id || "-"}</td>
                          <td>{item.assignee_name || "All staff"}</td>
                          <td>{String(item.output_format || "zip").toUpperCase()}</td>
                          <td>
                            Trees {Number(summary.tree_inventory_count || 0)} | Tasks {Number(summary.task_timeline_count || 0)}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="green-work-live-tree-link"
                              onClick={() =>
                                exportVerraPackage(normalizeVerraExportFormat(item.output_format), {
                                  monitoring_start: item.monitoring_start || "",
                                  monitoring_end: item.monitoring_end || "",
                                  methodology_id: item.methodology_id || "",
                                  verifier_notes: item.verifier_notes || "",
                                  generated_by: item.generated_by || "supervisor",
                                  season_mode: String(item.season_mode || "rainy").toLowerCase() === "dry" ? "dry" : "rainy",
                                  assignee_name: item.assignee_name || "all",
                                })
                              }
                            >
                              Export again
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
