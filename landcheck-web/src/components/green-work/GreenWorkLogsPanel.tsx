import type { CSSProperties, Dispatch, SetStateAction } from "react";

type ComplianceDraftValue = {
  owner_name: string;
  evidence_location: string;
  notes: string;
};

type GreenWorkLogsPanelProps = {
  refreshLogsAndReports: () => void;
  logsLoading: boolean;
  complianceLoading: boolean;
  runSecurityMaintenance: () => void;
  securityMaintenanceRunning: boolean;
  ensureComplianceChecklist: () => void;
  complianceEnsuring: boolean;
  resetActivityLogs: () => void;
  logsError: string | null;
  complianceError: string | null;
  complianceDashboard: any;
  compliancePostureEntries: Array<{ label: string; value: string | number }>;
  complianceDrafts: Record<number, ComplianceDraftValue>;
  setComplianceDrafts: Dispatch<SetStateAction<Record<number, ComplianceDraftValue>>>;
  complianceSavingId: number | null;
  getComplianceStatusStyle: (status: string | null | undefined) => CSSProperties;
  updateComplianceChecklistItem: (item: any, status: "completed" | "pending") => void | Promise<void>;
  qrPrintsReport: any[];
  activityLogs: any[];
  hasActivityLogDetails: (details: unknown) => boolean;
  summarizeActivityLogDetails: (details: unknown) => string;
  resolveActivityLogActor: (log: any) => string;
  selectedActivityLog: any | null;
  setSelectedActivityLog: (log: any | null) => void;
  selectedActivityLogDetailsText: string;
};

export default function GreenWorkLogsPanel({
  refreshLogsAndReports,
  logsLoading,
  complianceLoading,
  runSecurityMaintenance,
  securityMaintenanceRunning,
  ensureComplianceChecklist,
  complianceEnsuring,
  resetActivityLogs,
  logsError,
  complianceError,
  complianceDashboard,
  compliancePostureEntries,
  complianceDrafts,
  setComplianceDrafts,
  complianceSavingId,
  getComplianceStatusStyle,
  updateComplianceChecklistItem,
  qrPrintsReport,
  activityLogs,
  hasActivityLogDetails,
  summarizeActivityLogDetails,
  resolveActivityLogActor,
  selectedActivityLog,
  setSelectedActivityLog,
  selectedActivityLogDetailsText,
}: GreenWorkLogsPanelProps) {
  return (
    <>
      <div className="green-work-card">
        <h3>System Logs & Reports</h3>
        <p className="green-work-note">
          Monitor live API activity across Survey Plan, Flood, LandCheck Work, sponsor, and field capture surfaces, plus tree tag QR
          printing statistics.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <button type="button" onClick={refreshLogsAndReports} disabled={logsLoading || complianceLoading}>
            {logsLoading || complianceLoading ? "Refreshing..." : "Refresh Logs & Reports"}
          </button>
          <button type="button" onClick={runSecurityMaintenance} disabled={securityMaintenanceRunning}>
            {securityMaintenanceRunning ? "Running maintenance..." : "Run Security Maintenance"}
          </button>
          <button type="button" onClick={ensureComplianceChecklist} disabled={complianceEnsuring}>
            {complianceEnsuring ? "Preparing checklist..." : "Prepare Monthly Checklist"}
          </button>
          <button
            type="button"
            onClick={resetActivityLogs}
            style={{ backgroundColor: "#e74c3c", color: "white", border: "none" }}
          >
            Reset Activity Logs
          </button>
        </div>

        {logsError ? <p className="green-work-error" style={{ color: "red", marginBottom: 12 }}>{logsError}</p> : null}
        {complianceError ? <p className="green-work-error" style={{ color: "red", marginBottom: 12 }}>{complianceError}</p> : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              border: "1px solid #d9e9dd",
              borderRadius: 20,
              padding: 20,
              background: "linear-gradient(180deg, #fbfffc 0%, #f3fbf5 100%)",
              boxShadow: "0 18px 45px rgba(24, 72, 51, 0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: 16,
                marginBottom: 18,
              }}
            >
              <div style={{ minWidth: 260 }}>
                <h4 style={{ margin: 0, fontSize: 22 }}>Security & Compliance Operations</h4>
                <p className="green-work-note" style={{ margin: "8px 0 0", marginLeft: 0, maxWidth: 760 }}>
                  This is the super-admin operating board for monthly security evidence, privileged-review signoff, backup verification,
                  audit review, and live security posture checks.
                </p>
              </div>
              {complianceDashboard ? (
                <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                  <span className="green-work-live-pill success">{complianceDashboard.period.label} checklist</span>
                  <span className="green-work-live-pill neutral">
                    Due {new Date(complianceDashboard.period.due_date || "").toLocaleDateString()}
                  </span>
                </div>
              ) : null}
            </div>

            {complianceLoading && !complianceDashboard ? (
              <p className="green-work-note" style={{ marginLeft: 0 }}>Loading compliance dashboard...</p>
            ) : complianceDashboard ? (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
                  <span className="green-work-live-pill success">Completed: {complianceDashboard.summary.completed}</span>
                  <span className="green-work-live-pill neutral">Pending: {complianceDashboard.summary.pending}</span>
                  <span className="green-work-live-pill neutral">Skipped: {complianceDashboard.summary.skipped}</span>
                  <span className="green-work-live-pill success">
                    Completion rate: {Number(complianceDashboard.summary.completion_rate || 0).toFixed(1)}%
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                    gap: 12,
                    marginBottom: 18,
                  }}
                >
                  {compliancePostureEntries.map((entry) => (
                    <div
                      key={`posture-${entry.label}`}
                      style={{
                        border: "1px solid #d8e8da",
                        borderRadius: 16,
                        padding: "14px 16px",
                        background: "#ffffff",
                        minHeight: 86,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "#6a8572" }}>
                        {entry.label}
                      </div>
                      <div style={{ marginTop: 10, fontSize: 24, fontWeight: 800, color: "#103b28", lineHeight: 1.15 }}>
                        {entry.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    border: "1px solid #dce7de",
                    borderRadius: 16,
                    padding: 14,
                    background: "#ffffff",
                    marginBottom: 18,
                  }}
                >
                  <strong style={{ display: "block", marginBottom: 6 }}>Website-operated controls</strong>
                  <span style={{ color: "#51685a", fontSize: 13 }}>
                    LandCheck can track completion, evidence links, and ownership here. Backup restore, management review, vendor review,
                    and access review still require real human confirmation before you mark them complete.
                  </span>
                </div>

                <div style={{ display: "grid", gap: 14 }}>
                  {complianceDashboard.items.map((item: any) => {
                    const draft = complianceDrafts[item.id] || { owner_name: "", evidence_location: "", notes: "" };
                    const normalizedStatus = String(item.status || "pending").trim().toLowerCase();
                    const statusStyle = getComplianceStatusStyle(normalizedStatus);
                    const isSaving = complianceSavingId === item.id;
                    return (
                      <div
                        key={`compliance-item-${item.id}`}
                        style={{
                          border: "1px solid #dbe7dc",
                          borderRadius: 18,
                          padding: 18,
                          background: "#ffffff",
                          display: "grid",
                          gap: 14,
                        }}
                      >
                        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ minWidth: 260, flex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, color: "#5a7b67" }}>
                              {item.category}
                            </div>
                            <h5 style={{ margin: "6px 0 8px", fontSize: 20, color: "#123523" }}>{item.title}</h5>
                            <p className="green-work-note" style={{ margin: 0, marginLeft: 0, maxWidth: 880 }}>
                              {item.description}
                            </p>
                          </div>
                          <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                            <span
                              style={{
                                ...statusStyle,
                                borderRadius: 999,
                                padding: "7px 12px",
                                fontSize: 12,
                                fontWeight: 800,
                                textTransform: "capitalize",
                              }}
                            >
                              {normalizedStatus}
                            </span>
                            <span className="green-work-live-pill neutral">
                              {item.automation_level === "automated" ? "Automation-backed" : "Human signoff"}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                          <span className="green-work-live-pill neutral">Due: {new Date(item.due_date || "").toLocaleDateString()}</span>
                          <span className="green-work-live-pill neutral">Owner: {item.owner_name || "Not set"}</span>
                          {item.completed_at ? (
                            <span className="green-work-live-pill success">
                              Completed by {item.completed_by || "-"} on {new Date(item.completed_at).toLocaleString()}
                            </span>
                          ) : (
                            <span className="green-work-live-pill neutral">Awaiting completion</span>
                          )}
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: 12,
                          }}
                        >
                          <label style={{ display: "grid", gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#587665" }}>Owner</span>
                            <input
                              value={draft.owner_name}
                              onChange={(event) =>
                                setComplianceDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    owner_name: event.target.value,
                                    evidence_location: prev[item.id]?.evidence_location ?? draft.evidence_location,
                                    notes: prev[item.id]?.notes ?? draft.notes,
                                  },
                                }))
                              }
                              placeholder="Super admin or control owner"
                              disabled={isSaving}
                            />
                          </label>
                          <label style={{ display: "grid", gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#587665" }}>
                              Evidence link / path
                            </span>
                            <input
                              value={draft.evidence_location}
                              onChange={(event) =>
                                setComplianceDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    owner_name: prev[item.id]?.owner_name ?? draft.owner_name,
                                    evidence_location: event.target.value,
                                    notes: prev[item.id]?.notes ?? draft.notes,
                                  },
                                }))
                              }
                              placeholder="Ticket, document path, export name, or storage URL"
                              disabled={isSaving}
                            />
                          </label>
                        </div>

                        <label style={{ display: "grid", gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#587665" }}>Review notes</span>
                          <textarea
                            value={draft.notes}
                            onChange={(event) =>
                              setComplianceDrafts((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  owner_name: prev[item.id]?.owner_name ?? draft.owner_name,
                                  evidence_location: prev[item.id]?.evidence_location ?? draft.evidence_location,
                                  notes: event.target.value,
                                },
                              }))
                            }
                            placeholder="Record what was reviewed, what changed, and any follow-up actions."
                            rows={3}
                            disabled={isSaving}
                          />
                        </label>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => {
                              void updateComplianceChecklistItem(item, "completed");
                            }}
                            disabled={isSaving || normalizedStatus === "completed"}
                          >
                            {isSaving && normalizedStatus !== "completed" ? "Saving..." : "Mark Complete"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void updateComplianceChecklistItem(item, "pending");
                            }}
                            disabled={isSaving || normalizedStatus === "pending"}
                            style={{ background: "#f4f9f5", color: "#184a33", border: "1px solid #cfe2d3" }}
                          >
                            Reopen
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="green-work-note" style={{ marginLeft: 0 }}>
                Compliance dashboard is not available yet. Use "Prepare Monthly Checklist" to seed the current month.
              </p>
            )}
          </div>

          <div>
            <h4>QR Tag Print Status Report</h4>
            {qrPrintsReport.length === 0 ? (
              <p className="green-work-note" style={{ marginLeft: 0 }}>No QR tag print logs recorded yet.</p>
            ) : (
              <table className="green-work-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Tree #</th>
                    <th>Species</th>
                    <th>Tree ID</th>
                    <th>Print Count</th>
                    <th>Last Printed At</th>
                  </tr>
                </thead>
                <tbody>
                  {qrPrintsReport.map((printRow: any) => (
                    <tr key={`qrprint-${printRow.tree_id}`}>
                      <td>{printRow.project_name}</td>
                      <td>#{printRow.project_tree_no}</td>
                      <td>{printRow.species}</td>
                      <td>{printRow.tree_id}</td>
                      <td style={{ fontWeight: "bold" }}>{printRow.print_count} times</td>
                      <td>{new Date(printRow.last_printed_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <h4>System Activity Logs (Capped at 10,000)</h4>
            {activityLogs.length === 0 ? (
              <p className="green-work-note" style={{ marginLeft: 0 }}>No system activity logs recorded yet.</p>
            ) : (
              <div
                style={{
                  maxHeight: 500,
                  overflow: "auto",
                  border: "1px solid #dcdfdc",
                  borderRadius: 4,
                  padding: 12,
                  backgroundColor: "#fcfcfc",
                }}
              >
                <table className="green-work-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Source</th>
                      <th>Event</th>
                      <th>Actor</th>
                      <th>Message</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLogs.map((log) => {
                      const hasDetails = hasActivityLogDetails(log.details);
                      const detailsSummary = summarizeActivityLogDetails(log.details);
                      return (
                        <tr key={`log-${log.id}`} style={{ fontSize: 12 }}>
                          <td style={{ whiteSpace: "nowrap" }}>{new Date(log.created_at || "").toLocaleString()}</td>
                          <td style={{ textTransform: "capitalize" }}>{log.source}</td>
                          <td><span className="green-work-live-pill neutral">{log.event_type}</span></td>
                          <td>{resolveActivityLogActor(log)}</td>
                          <td style={{ minWidth: 220 }}>{log.message}</td>
                          <td className="green-work-log-details-cell">
                            {hasDetails ? (
                              <button
                                type="button"
                                className="green-work-log-details-trigger"
                                onClick={() => setSelectedActivityLog(log)}
                              >
                                <span className="green-work-log-details-trigger-label">View details</span>
                                <span className="green-work-log-details-trigger-meta">{detailsSummary}</span>
                              </button>
                            ) : (
                              <span className="green-work-log-details-empty">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedActivityLog ? (
        <>
          <button
            type="button"
            className="green-work-log-detail-overlay"
            onClick={() => setSelectedActivityLog(null)}
            aria-label="Close activity log details"
          />
          <section
            className="green-work-log-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="green-work-log-detail-title"
          >
            <div className="green-work-log-detail-head">
              <div>
                <p className="green-work-log-detail-kicker">Activity log details</p>
                <h3 id="green-work-log-detail-title">Log Entry #{selectedActivityLog.id}</h3>
              </div>
              <button
                type="button"
                className="green-work-log-detail-close"
                onClick={() => setSelectedActivityLog(null)}
                aria-label="Close activity log details"
              >
                X
              </button>
            </div>

            <div className="green-work-log-detail-grid">
              <div>
                <span>Time</span>
                <strong>{new Date(selectedActivityLog.created_at || "").toLocaleString()}</strong>
              </div>
              <div>
                <span>Source</span>
                <strong>{selectedActivityLog.source || "-"}</strong>
              </div>
              <div>
                <span>Event</span>
                <strong>{selectedActivityLog.event_type || "-"}</strong>
              </div>
              <div>
                <span>Actor</span>
                <strong>{resolveActivityLogActor(selectedActivityLog)}</strong>
              </div>
              <div className="green-work-log-detail-grid-wide">
                <span>Message</span>
                <strong>{selectedActivityLog.message || "-"}</strong>
              </div>
              <div className="green-work-log-detail-grid-wide">
                <span>Details summary</span>
                <strong>{summarizeActivityLogDetails(selectedActivityLog.details)}</strong>
              </div>
            </div>

            <div className="green-work-log-detail-body">
              <p className="green-work-note" style={{ marginLeft: 0, marginBottom: 0 }}>
                Full request or event payload for this activity log entry.
              </p>
              <pre className="green-work-log-detail-json">{selectedActivityLogDetailsText}</pre>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
