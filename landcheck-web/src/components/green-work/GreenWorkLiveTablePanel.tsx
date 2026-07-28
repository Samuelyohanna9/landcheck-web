type GreenWorkLiveTablePanelProps = {
  activeProjectId: number;
  loadProjectData: (projectId: number) => void | Promise<void>;
  loadServerLiveMaintenance: (
    projectId: number,
    seasonMode: "rainy" | "dry",
    assigneeFilter: string,
    scope: "new_planting" | "existing_inventory",
  ) => void | Promise<void>;
  seasonMode: "rainy" | "dry";
  seasonLabel: string;
  setSeasonMode: (value: "rainy" | "dry") => void;
  assigneeFilter: string;
  setAssigneeFilter: (value: string) => void;
  assignees: string[];
  liveTableIsExistingScope: boolean;
  setLiveTreeScopeTab: (value: "new_planting" | "existing_inventory") => void;
  selectedMaturitySpecies: string;
  setSelectedMaturitySpecies: (value: string) => void;
  activeProjectMaturityMap: Record<string, number>;
  selectedMaturityYears: string;
  setSelectedMaturityYears: (value: string) => void;
  projectSpeciesOptions: Array<{ key: string; label: string }>;
  saveSpeciesMaturityYears: () => void | Promise<void>;
  speciesMaturityRows: Array<{ key: string; label: string; years?: number | null }>;
  displayedLiveSummary: {
    danger: number;
    warning: number;
    ok: number;
    info: number;
    total: number;
  };
  maintenanceAttentionFilter: string;
  setMaintenanceAttentionFilter: (value: string) => void;
  selectedMaintenanceRows: any[];
  hiddenMaintenanceSelectionCount: number;
  displayedMaintenanceSelectionCount: number;
  setSelectedMaintenanceRowKeys: (value: any) => void;
  displayedLiveRows: any[];
  setMaintenanceMapFocusEnabled: (value: boolean) => void;
  setActiveForm: (value: any) => void;
  setMenuOpen: (value: boolean) => void;
  setStaffMenu: (value: any) => void;
  setLiveTreeMenu: (value: any) => void;
  openAssignTaskForSelectedRows: (rows?: any[]) => void | Promise<void>;
  selectedMaintenanceRowKeys: string[];
  trees: any[];
  toggleMaintenanceRowSelection: (rowKey: string) => void;
  formatProjectTreeLabelById: (treeId: any) => string;
  treeStatusLabel: (value: any) => string;
  formatTreeOriginLabel: (value: string | null | undefined) => string;
  formatDateLabel: (value: string | null | undefined) => string;
  displayedLiveSources: Array<{ url: string; label: string }>;
};

export default function GreenWorkLiveTablePanel({
  activeProjectId,
  loadProjectData,
  loadServerLiveMaintenance,
  seasonMode,
  seasonLabel,
  setSeasonMode,
  assigneeFilter,
  setAssigneeFilter,
  assignees,
  liveTableIsExistingScope,
  setLiveTreeScopeTab,
  selectedMaturitySpecies,
  setSelectedMaturitySpecies,
  activeProjectMaturityMap,
  selectedMaturityYears,
  setSelectedMaturityYears,
  projectSpeciesOptions,
  saveSpeciesMaturityYears,
  speciesMaturityRows,
  displayedLiveSummary,
  maintenanceAttentionFilter,
  setMaintenanceAttentionFilter,
  selectedMaintenanceRows,
  hiddenMaintenanceSelectionCount,
  displayedMaintenanceSelectionCount,
  setSelectedMaintenanceRowKeys,
  displayedLiveRows,
  setMaintenanceMapFocusEnabled,
  setActiveForm,
  setMenuOpen,
  setStaffMenu,
  setLiveTreeMenu,
  openAssignTaskForSelectedRows,
  selectedMaintenanceRowKeys,
  trees,
  toggleMaintenanceRowSelection,
  formatProjectTreeLabelById,
  treeStatusLabel,
  formatTreeOriginLabel,
  formatDateLabel,
  displayedLiveSources,
}: GreenWorkLiveTablePanelProps) {
  return (
    <div className="green-work-card green-work-live-card">
      <div className="green-work-row">
        <h3 className="green-work-live-title">
          <span className="green-work-live-title-text">Live Maintenance Table</span>
          <span className="green-work-live-title-indicator" aria-label="Live monitoring active">
            <span className="green-work-live-title-dot" aria-hidden="true" />
            <span className="green-work-live-title-wave" aria-hidden="true" />
            Live Monitoring
          </span>
        </h3>
        <div className="work-actions">
          <button
            type="button"
            onClick={() =>
              void Promise.all([
                loadProjectData(activeProjectId),
                loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter, "new_planting"),
                loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter, "existing_inventory"),
              ])
            }
          >
            Refresh
          </button>
          <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a === "all" ? "All staff" : a}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="green-work-live-scope-tabs" role="tablist" aria-label="Maintenance scope">
        <button
          type="button"
          role="tab"
          aria-selected={!liveTableIsExistingScope}
          className={`green-work-live-scope-tab ${!liveTableIsExistingScope ? "active" : ""}`}
          onClick={() => setLiveTreeScopeTab("new_planting")}
        >
          New Planting
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={liveTableIsExistingScope}
          className={`green-work-live-scope-tab ${liveTableIsExistingScope ? "active" : ""}`}
          onClick={() => setLiveTreeScopeTab("existing_inventory")}
        >
          Existing Trees
        </button>
      </div>
      <p className="green-work-chart-context">
        {liveTableIsExistingScope
          ? "Context: existing-tree maintenance uses tree status, planting/reference date, captured age, replacement history, and approved maintenance completions for age-based scheduling."
          : "Context: live monitoring for newly planted trees from planting date through establishment cycles."}
      </p>
      <div className="green-work-live-season-row">
        <label htmlFor="green-work-live-season-select">Season Model</label>
        <select
          id="green-work-live-season-select"
          value={seasonMode}
          onChange={(e) => setSeasonMode((e.target.value === "dry" ? "dry" : "rainy"))}
        >
          <option value="rainy">Rainy Season</option>
          <option value="dry">Dry Season</option>
        </select>
      </div>
      {!liveTableIsExistingScope && (
        <>
          <div className="green-work-live-maturity-row">
            <label htmlFor="green-work-live-species-select">Species</label>
            <select
              id="green-work-live-species-select"
              value={selectedMaturitySpecies}
              onChange={(e) => {
                const speciesKey = e.target.value;
                setSelectedMaturitySpecies(speciesKey);
                const currentYears = activeProjectMaturityMap[speciesKey];
                setSelectedMaturityYears(currentYears ? String(currentYears) : "3");
              }}
            >
              {projectSpeciesOptions.length === 0 ? (
                <option value="">No species in this project yet</option>
              ) : (
                projectSpeciesOptions.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))
              )}
            </select>

            <label htmlFor="green-work-live-years-select">Peg Years</label>
            <select
              id="green-work-live-years-select"
              value={selectedMaturityYears}
              onChange={(e) => setSelectedMaturityYears(e.target.value)}
              disabled={!selectedMaturitySpecies}
            >
              {Array.from({ length: 15 }, (_, index) => index + 1).map((years) => (
                <option key={years} value={years}>
                  {years} {years === 1 ? "Year" : "Years"}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="green-work-live-years-btn"
              onClick={() => void saveSpeciesMaturityYears()}
              disabled={!selectedMaturitySpecies}
            >
              Save Peg
            </button>
          </div>
          <div className="green-work-live-maturity-list">
            {speciesMaturityRows.length === 0 ? (
              <span className="green-work-live-maturity-chip is-empty">Add trees with species to configure peg years.</span>
            ) : (
              speciesMaturityRows.map((item) => (
                <span
                  key={item.key}
                  className={`green-work-live-maturity-chip ${item.years ? "is-set" : "is-empty"}`}
                >
                  {item.label}: {item.years ? `${item.years} years` : "Not set"}
                </span>
              ))
            )}
          </div>
        </>
      )}

      <div className="green-work-live-summary">
        <span className="green-work-live-pill neutral">Season: {seasonLabel}</span>
        <span className="green-work-live-pill danger">Danger: {displayedLiveSummary.danger}</span>
        <span className="green-work-live-pill warning">In Progress / Due Soon: {displayedLiveSummary.warning}</span>
        <span className="green-work-live-pill ok">On Track: {displayedLiveSummary.ok}</span>
        <span className="green-work-live-pill info">
          {liveTableIsExistingScope ? "Needs Age Data" : "Needs Planting Date"}: {displayedLiveSummary.info}
        </span>
        <span className="green-work-live-pill neutral">Rows: {displayedLiveSummary.total}</span>
      </div>
      <div className="green-work-live-filter-row">
        <label htmlFor="green-work-live-attention-filter">Queue filter</label>
        <select
          id="green-work-live-attention-filter"
          value={maintenanceAttentionFilter}
          onChange={(e) => setMaintenanceAttentionFilter(e.target.value)}
        >
          <option value="all">All maintenance rows</option>
          <option value="needs_action">Needs attention now</option>
          <option value="no_open_task">No open task assigned</option>
          <option value="overdue">Overdue</option>
          <option value="due_soon">Due soon</option>
          <option value="replacement_required">Replacement required</option>
          <option value="inspection_flags">Inspection / condition flags</option>
        </select>
        <span>Filter the queue before selecting rows for dispatch.</span>
      </div>

      <div className="green-work-live-bulk-bar">
        <div className="green-work-live-bulk-copy">
          <strong>
            {selectedMaintenanceRows.length} selected
            {hiddenMaintenanceSelectionCount > 0
              ? ` (${displayedMaintenanceSelectionCount} visible in this queue)`
              : ""}
          </strong>
          <span>
            {hiddenMaintenanceSelectionCount > 0
              ? `${hiddenMaintenanceSelectionCount} selected row${hiddenMaintenanceSelectionCount === 1 ? "" : "s"} are hidden by the current scope or queue filter.`
              : "Select rows to assign one tree, many trees, or distribute work across staff."}
          </span>
        </div>
        <div className="work-actions">
          <button
            type="button"
            onClick={() => setSelectedMaintenanceRowKeys((prev: string[]) => Array.from(new Set([...prev, ...displayedLiveRows.map((row) => row.key)])))}
            disabled={!displayedLiveRows.length}
          >
            Select visible
          </button>
          <button type="button" onClick={() => setSelectedMaintenanceRowKeys([])} disabled={!selectedMaintenanceRows.length}>
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              setMaintenanceMapFocusEnabled(true);
              setActiveForm("map_view");
              setMenuOpen(false);
              setStaffMenu(null);
              setLiveTreeMenu(null);
            }}
            disabled={!selectedMaintenanceRows.length}
          >
            View selected on map
          </button>
          <button type="button" className="btn-primary" onClick={() => void openAssignTaskForSelectedRows()} disabled={!selectedMaintenanceRows.length}>
            Assign selected
          </button>
        </div>
      </div>

      <div className="green-work-live-table-wrap">
        <table className="green-work-live-table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Tree</th>
              <th>Staff</th>
              <th>Activity</th>
              <th>Tree Age</th>
              <th>Last Done</th>
              <th>Model Due</th>
              <th>Assigned Due</th>
              <th>Countdown</th>
              <th>Status</th>
              <th>Indicator</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {displayedLiveRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="green-work-live-empty">
                  {liveTableIsExistingScope
                    ? "No existing-tree maintenance rows available for this filter."
                    : "No tree maintenance rows available for this filter."}
                </td>
              </tr>
            ) : (
              displayedLiveRows.map((row) => {
                const rowTree = trees.find((tree) => Number(tree.id) === Number(row.treeId));
                const isSelected = selectedMaintenanceRowKeys.includes(row.key);
                return (
                  <tr key={row.key} className={`tone-${row.tone} ${isSelected ? "is-selected" : ""}`}>
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleMaintenanceRowSelection(row.key)}
                        aria-label={`Select ${formatProjectTreeLabelById(row.treeId)} ${row.activityLabel}`}
                      />
                    </td>
                    <td>
                      <div className="green-work-live-tree-cell">
                        <button
                          type="button"
                          className="green-work-live-tree-link"
                          onClick={(event) => {
                            event.stopPropagation();
                            setStaffMenu(null);
                            setLiveTreeMenu({ treeId: row.treeId, x: event.clientX, y: event.clientY, taskType: row.activity });
                          }}
                        >
                          {formatProjectTreeLabelById(row.treeId)}
                        </button>
                        <span className="green-work-live-hint">
                          {(rowTree?.species || "Species -")} | {treeStatusLabel(rowTree?.status)} | {formatTreeOriginLabel(row.treeOrigin)}
                        </span>
                        <button
                          type="button"
                          className="green-work-live-assign-link"
                          onClick={() => void openAssignTaskForSelectedRows([row])}
                        >
                          Assign this
                        </button>
                      </div>
                    </td>
                    <td>{row.assignee}</td>
                    <td>
                      <strong>{row.activityLabel}</strong>
                      <span className="green-work-live-hint">{row.modelRationale}</span>
                    </td>
                    <td>{row.treeAgeDays === null ? "-" : `${row.treeAgeDays}d`}</td>
                    <td>{formatDateLabel(row.lastDoneAt)}</td>
                    <td>{formatDateLabel(row.modelDueDate)}</td>
                    <td>{formatDateLabel(row.assignedDueDate)}</td>
                    <td
                      className={`green-work-live-countdown ${
                        row.countdownDays !== null && row.countdownDays < 0 ? "overdue" : ""
                      }`}
                    >
                      {row.countdownDays === null
                        ? "-"
                        : row.countdownDays < 0
                          ? `${Math.abs(row.countdownDays)}d late`
                          : row.countdownDays === 0
                            ? "Due today"
                            : `${row.countdownDays}d left`}
                    </td>
                    <td>{row.statusText}</td>
                    <td>
                      <span className={`green-work-live-indicator ${row.tone}`}>{row.indicator}</span>
                    </td>
                    <td>
                      Done {row.doneCount} | Open {row.pendingCount} | Overdue {row.overdueCount}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="green-work-live-sources">
        <h4>Schedule Sources</h4>
        <p>
          {liveTableIsExistingScope
            ? "Existing-tree maintenance follows the same Nigeria-adapted field cadence, but tree age can be derived from planting/reference date or captured age metadata. Routine watering and weeding are suppressed once the tree is clearly beyond establishment unless a live task or condition trigger exists."
            : `Cadence is a Nigeria-adapted field model for live monitoring using ${seasonLabel} assumptions. Review intervals seasonally by state-level rainfall outlook.`}
        </p>
        <ul>
          {displayedLiveSources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
