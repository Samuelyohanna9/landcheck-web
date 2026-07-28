type GreenWorkSponsorPayoutsPanelProps = {
  publicSponsorshipProject: any;
  sponsorAgentPayoutLoading: boolean;
  activeProjectId: number | null | undefined;
  loadSponsorAgentPayoutBoard: (projectId: number, options?: { forceSync?: boolean }) => void | Promise<void>;
  openForm: (form: any) => void;
  sponsorAgentPayoutSummary: any;
  sponsorAgentPayoutError: string | null;
  formatCurrencyAmount: (amount: number | null | undefined, currency?: string | null) => string;
  sponsorAgentPayoutAgents: any[];
  canReviewSponsorPayoutClearance: boolean;
  manuallyClearingSponsorAgentUserId: number | null;
  manuallyClearSponsorAgentExtraApprovedTree: (userId: number, userName?: string) => void | Promise<void>;
  reconcilingSponsorAgentUserId: number | null;
  autoReconcileSponsorAgentPayouts: (userId: number, userName?: string) => void | Promise<void>;
  reviewingSponsorAgentClearanceUnitId: number | null;
  reviewSponsorAgentPayoutClearance: (unitId: number, action: "clear" | "revoke", label?: string | null) => void | Promise<void>;
  formatDateLabel: (value: string | null | undefined) => string;
  formatTaskTypeLabel: (value: string | null | undefined) => string;
  sponsorAgentPayoutRequestBuckets: {
    awaiting: any[];
    paid: any[];
    issue: any[];
  };
  reviewingSponsorAgentPayoutId: number | null;
  reviewSponsorAgentPayoutRequest: (
    id: number,
    action: "approve" | "approve_and_pay" | "mark_paid" | "reject" | "cancel" | "retry_transfer",
    options?: { autoTransfer?: boolean },
  ) => void | Promise<void>;
};

const normalizeValue = (value: string | null | undefined) => (value || "").trim().toLowerCase();

export default function GreenWorkSponsorPayoutsPanel({
  publicSponsorshipProject,
  sponsorAgentPayoutLoading,
  activeProjectId,
  loadSponsorAgentPayoutBoard,
  openForm,
  sponsorAgentPayoutSummary,
  sponsorAgentPayoutError,
  formatCurrencyAmount,
  sponsorAgentPayoutAgents,
  canReviewSponsorPayoutClearance,
  manuallyClearingSponsorAgentUserId,
  manuallyClearSponsorAgentExtraApprovedTree,
  reconcilingSponsorAgentUserId,
  autoReconcileSponsorAgentPayouts,
  reviewingSponsorAgentClearanceUnitId,
  reviewSponsorAgentPayoutClearance,
  formatDateLabel,
  formatTaskTypeLabel,
  sponsorAgentPayoutRequestBuckets,
  reviewingSponsorAgentPayoutId,
  reviewSponsorAgentPayoutRequest,
}: GreenWorkSponsorPayoutsPanelProps) {
  const requestSections = [
    {
      key: "awaiting",
      title: "Awaiting Review / Transfer",
      tone: "warning" as const,
      rows: sponsorAgentPayoutRequestBuckets.awaiting,
    },
    {
      key: "paid",
      title: "Paid Requests",
      tone: "ok" as const,
      rows: sponsorAgentPayoutRequestBuckets.paid,
    },
    {
      key: "issue",
      title: "Flagged / Cancelled",
      tone: "danger" as const,
      rows: sponsorAgentPayoutRequestBuckets.issue,
    },
  ].filter((section) => section.rows.length > 0);

  return (
    <div className="green-work-card">
      <h3>Public Sponsor Payouts</h3>
      {!publicSponsorshipProject ? (
        <p className="green-work-note">Switch this project to the Public Sponsorship access route first.</p>
      ) : sponsorAgentPayoutLoading ? (
        <p className="green-work-note">Loading sponsor-agent earnings and payout requests...</p>
      ) : (
        <>
          <div className="work-actions" style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => {
                if (activeProjectId) void loadSponsorAgentPayoutBoard(activeProjectId, { forceSync: true });
              }}
            >
              Refresh Payouts
            </button>
            <button type="button" onClick={() => openForm("users")}>
              Manage Sponsor Agents
            </button>
          </div>
          <p className="green-work-note">
            This is the live sponsor-agent wallet board. It rolls up what each selected public sponsor agent has earned from paid
            sponsor trees, which requests are pending, and whether bank details are ready for payout.
          </p>
          <div className="work-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
            <span className="green-work-live-pill neutral">Agents: {sponsorAgentPayoutSummary.agentCount}</span>
            <span className="green-work-live-pill warning">Pending requests: {sponsorAgentPayoutSummary.pendingRequestCount}</span>
            <span className="green-work-live-pill ok">
              Minimum payout: {formatCurrencyAmount(sponsorAgentPayoutSummary.minimumAmount, sponsorAgentPayoutSummary.currency)}
            </span>
            <span className={`green-work-live-pill ${sponsorAgentPayoutSummary.autoPayoutAvailable ? "info" : "neutral"}`}>
              Auto payout: {sponsorAgentPayoutSummary.autoPayoutAvailable ? "available" : "manual only"}
            </span>
          </div>
          {sponsorAgentPayoutSummary.reconciliation ? (
            <div className="work-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
              <span className="green-work-live-pill neutral">
                Assigned: {Number(sponsorAgentPayoutSummary.reconciliation.assigned_target_trees || 0)}
              </span>
              <span className="green-work-live-pill neutral">Saved: {Number(sponsorAgentPayoutSummary.reconciliation.saved_count || 0)}</span>
              <span className="green-work-live-pill info">
                Approved: {Number(sponsorAgentPayoutSummary.reconciliation.approved_count || 0)}
              </span>
              <span className="green-work-live-pill ok">
                Sponsor-linked: {Number(sponsorAgentPayoutSummary.reconciliation.sponsor_linked_count || 0)}
              </span>
              <span className="green-work-live-pill ok">
                Payable: {Number(sponsorAgentPayoutSummary.reconciliation.payable_count || 0)}
              </span>
              <span
                className={`green-work-live-pill ${
                  Number(sponsorAgentPayoutSummary.reconciliation.unlinked_approved_count || 0) > 0 ? "danger" : "neutral"
                }`}
              >
                Approval gap: {Number(sponsorAgentPayoutSummary.reconciliation.unlinked_approved_count || 0)}
              </span>
            </div>
          ) : null}
          {sponsorAgentPayoutError ? <p className="green-work-note danger">{sponsorAgentPayoutError}</p> : null}

          <div className="green-work-payout-shell">
            <div className="green-work-payout-primary">
              <div className="work-actions" style={{ marginBottom: 10, flexWrap: "wrap" }}>
                <span className="green-work-live-pill ok">
                  Available: {formatCurrencyAmount(sponsorAgentPayoutSummary.availableAmount, sponsorAgentPayoutSummary.currency)}
                </span>
                <span className="green-work-live-pill warning">
                  Requested: {formatCurrencyAmount(sponsorAgentPayoutSummary.requestedAmount, sponsorAgentPayoutSummary.currency)}
                </span>
                <span className="green-work-live-pill info">
                  Paid: {formatCurrencyAmount(sponsorAgentPayoutSummary.paidAmount, sponsorAgentPayoutSummary.currency)}
                </span>
              </div>

              {sponsorAgentPayoutAgents.length === 0 ? (
                <p className="green-work-note">No public sponsor agents are selected for this sponsor project yet.</p>
              ) : (
                <div className="staff-list">
                  {sponsorAgentPayoutAgents.map((agent) => {
                    const agentSummary = agent.summary || {};
                    const bank = agent.bank_account;
                    const recentEarnings = (agent.earnings || []).slice(0, 3);
                    const reconciliation = agent.reconciliation || null;
                    const clearanceBlockers = agent.payout_clearance_blockers || [];
                    const projectApprovalGap = Number(reconciliation?.unlinked_approved_count || 0);
                    const projectUnpaidGap = Number(reconciliation?.unpaid_linked_count || 0);
                    const assignmentOverrun = Number(reconciliation?.approved_beyond_assignment_count || 0);
                    const manualPayoutExceptionCount = Number(reconciliation?.manual_payout_exception_count || 0);
                    const showPayoutClearanceReview =
                      clearanceBlockers.length > 0 ||
                      (canReviewSponsorPayoutClearance && (projectUnpaidGap > 0 || projectApprovalGap > 0 || assignmentOverrun > 0));

                    return (
                      <div key={`sponsor-agent-wallet-${agent.user?.id || agent.user?.user_uid || "agent"}`} className="staff-row">
                        <div className="staff-row-head">
                          <strong>{agent.user?.full_name || "Sponsor Agent"}</strong>
                          <span>{agent.user?.user_uid || "-"}</span>
                        </div>
                        <div className="work-actions" style={{ margin: "8px 0 6px", flexWrap: "wrap" }}>
                          <span className="green-work-live-pill ok">
                            Available:{" "}
                            {formatCurrencyAmount(Number(agentSummary.available_amount || 0), agent.currency || sponsorAgentPayoutSummary.currency)}
                          </span>
                          <span className="green-work-live-pill warning">
                            Requested:{" "}
                            {formatCurrencyAmount(Number(agentSummary.requested_amount || 0), agent.currency || sponsorAgentPayoutSummary.currency)}
                          </span>
                          <span className="green-work-live-pill info">
                            Paid: {formatCurrencyAmount(Number(agentSummary.paid_amount || 0), agent.currency || sponsorAgentPayoutSummary.currency)}
                          </span>
                          <span className={`green-work-live-pill ${agentSummary.bank_verified ? "ok" : "danger"}`}>
                            {agentSummary.bank_verified ? "Bank verified" : "Bank setup needed"}
                          </span>
                        </div>
                        <div className="staff-row-meta">
                          Planting: {Number(agentSummary.planting_count || 0)} | Maintenance: {Number(agentSummary.maintenance_count || 0)} |
                          Total earned:{" "}
                          {formatCurrencyAmount(Number(agentSummary.total_earnings_amount || 0), agent.currency || sponsorAgentPayoutSummary.currency)}
                        </div>

                        {reconciliation ? (
                          <>
                            <div className="work-actions" style={{ margin: "8px 0 6px", flexWrap: "wrap" }}>
                              <span className="green-work-live-pill neutral">
                                Project assigned: {Number(reconciliation.assigned_target_trees || 0)}
                              </span>
                              <span className="green-work-live-pill neutral">Saved: {Number(reconciliation.saved_count || 0)}</span>
                              <span className="green-work-live-pill info">Approved: {Number(reconciliation.approved_count || 0)}</span>
                              <span className="green-work-live-pill ok">Linked: {Number(reconciliation.sponsor_linked_count || 0)}</span>
                              <span className="green-work-live-pill ok">Payable: {Number(reconciliation.payable_count || 0)}</span>
                              <span className="green-work-live-pill neutral">Manual cleared: {manualPayoutExceptionCount}</span>
                              <span className="green-work-live-pill warning">Remaining: {Number(reconciliation.remaining_target_trees || 0)}</span>
                            </div>
                            {projectApprovalGap > 0 || projectUnpaidGap > 0 || assignmentOverrun > 0 ? (
                              <div className="green-work-note danger" style={{ marginTop: 4 }}>
                                Project reconciliation issue:
                                {projectApprovalGap > 0 ? ` ${projectApprovalGap} approved tree(s) are not yet sponsor-linked.` : ""}
                                {projectUnpaidGap > 0 ? ` ${projectUnpaidGap} linked tree(s) are not yet payable.` : ""}
                                {assignmentOverrun > 0 ? ` ${assignmentOverrun} approved tree(s) sit above the assigned target.` : ""}
                              </div>
                            ) : (
                              <div className="staff-row-meta" style={{ marginTop: 4 }}>
                                Project reconciliation is clean: approved sponsor trees are linked and payable.
                              </div>
                            )}
                          </>
                        ) : null}

                        {showPayoutClearanceReview ? (
                          <div className="staff-list" style={{ marginTop: 12 }}>
                            <div className="staff-row" style={{ margin: 0 }}>
                              <div className="staff-row-head">
                                <strong>Payout clearance review</strong>
                                <span>{clearanceBlockers.length > 0 ? clearanceBlockers.length : projectUnpaidGap}</span>
                              </div>
                              <div className="staff-row-meta">
                                These linked sponsor trees are not yet entering the payout wallet automatically. Review the reason below and
                                clear only if you have confirmed the sponsor payment is valid. Extra approved trees above the assigned target
                                can also be manually cleared here.
                              </div>
                              {canReviewSponsorPayoutClearance && (projectApprovalGap > 0 || assignmentOverrun > 0) ? (
                                <div className="work-actions" style={{ marginTop: 10 }}>
                                  <button
                                    type="button"
                                    className="btn-primary"
                                    disabled={manuallyClearingSponsorAgentUserId === Number(agent.user?.id || 0) || !Number(agent.user?.id || 0)}
                                    onClick={() =>
                                      Number(agent.user?.id || 0)
                                        ? void manuallyClearSponsorAgentExtraApprovedTree(
                                            Number(agent.user?.id || 0),
                                            agent.user?.full_name || undefined,
                                          )
                                        : undefined
                                    }
                                  >
                                    {manuallyClearingSponsorAgentUserId === Number(agent.user?.id || 0)
                                      ? "Clearing..."
                                      : "Manual Clear Extra Approved Tree"}
                                  </button>
                                </div>
                              ) : null}
                              {canReviewSponsorPayoutClearance && clearanceBlockers.length === 0 ? (
                                <div className="work-actions" style={{ marginTop: 10 }}>
                                  <button
                                    type="button"
                                    className="btn-primary"
                                    disabled={reconcilingSponsorAgentUserId === Number(agent.user?.id || 0) || !Number(agent.user?.id || 0)}
                                    onClick={() =>
                                      Number(agent.user?.id || 0)
                                        ? void autoReconcileSponsorAgentPayouts(Number(agent.user?.id || 0), agent.user?.full_name || undefined)
                                        : undefined
                                    }
                                  >
                                    {reconcilingSponsorAgentUserId === Number(agent.user?.id || 0)
                                      ? "Reconciling..."
                                      : "Auto Match Approved Trees"}
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            {clearanceBlockers.length > 0 ? (
                              clearanceBlockers.map((blocker: any) => (
                                <div key={`sponsor-agent-clearance-${blocker.unit_id}`} className="staff-row" style={{ margin: 0 }}>
                                  <div className="staff-row-head">
                                    <strong>{blocker.tree_label || `Tree #${blocker.tree_id || blocker.unit_id}`}</strong>
                                    <span>{blocker.order_uid || blocker.unit_uid || `Unit #${blocker.unit_id}`}</span>
                                  </div>
                                  <div className="staff-row-meta">
                                    {blocker.sponsor_name ? `Sponsor: ${blocker.sponsor_name}` : "Sponsor: -"}
                                    {blocker.species ? ` | Species: ${blocker.species}` : ""}
                                    {blocker.linked_at ? ` | Linked: ${formatDateLabel(blocker.linked_at)}` : ""}
                                  </div>
                                  <div className="staff-row-meta">
                                    Payment: {formatTaskTypeLabel(blocker.payment_status || "pending")} | Order:{" "}
                                    {formatTaskTypeLabel(blocker.order_status || "pending_payment")}
                                  </div>
                                  <div className="green-work-note danger" style={{ marginTop: 6 }}>
                                    {blocker.blocker_reason || "Manual payout clearance review required."}
                                  </div>
                                  {canReviewSponsorPayoutClearance ? (
                                    <div className="work-actions" style={{ marginTop: 10 }}>
                                      <button
                                        type="button"
                                        className="btn-primary"
                                        disabled={reviewingSponsorAgentClearanceUnitId === blocker.unit_id}
                                        onClick={() =>
                                          void reviewSponsorAgentPayoutClearance(blocker.unit_id, "clear", blocker.tree_label || undefined)
                                        }
                                      >
                                        {reviewingSponsorAgentClearanceUnitId === blocker.unit_id ? "Clearing..." : "Clear For Payment"}
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ))
                            ) : (
                              <div className="staff-row" style={{ margin: 0 }}>
                                <div className="green-work-note danger" style={{ marginTop: 0 }}>
                                  {projectUnpaidGap > 0
                                    ? `${projectUnpaidGap} linked sponsor tree(s) are still marked as not payable, but the itemized clearance rows did not load in this response yet.`
                                    : `${Math.max(projectApprovalGap, assignmentOverrun)} approved tree(s) still need manual payout review because they are not sponsor-linked or sit above the assigned target.`}
                                </div>
                                <div className="staff-row-meta" style={{ marginTop: 6 }}>
                                  {projectUnpaidGap > 0 ? (
                                    <>
                                      This usually means paid sponsor units are linked to the wrong planted tree, or duplicate links are
                                      collapsing the payable count. Use <strong>Auto Match Approved Trees</strong> first, then refresh the
                                      payout board again.
                                    </>
                                  ) : (
                                    <>
                                      Use <strong>Manual Clear Extra Approved Tree</strong> only after confirming the tree was genuinely
                                      planted and approved, even though it sits outside the assigned sponsor target.
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null}

                        <div className="staff-row-meta">
                          Pending requests: {Number(agentSummary.pending_request_count || 0)} | Paid requests:{" "}
                          {Number(agentSummary.paid_request_count || 0)} | Projects: {Array.isArray(agent.projects) ? agent.projects.length : 0}
                        </div>
                        {Number(agent.repaired_missing_links || 0) > 0 ? (
                          <div className="staff-row-meta">
                            Recovery: {Number(agent.repaired_missing_links || 0)} older sponsor tree link(s) were repaired automatically on
                            refresh.
                          </div>
                        ) : null}
                        <div className="staff-row-meta">
                          Bank: {bank?.bank_name || "-"} | Code: {bank?.bank_code || "-"} | Account:{" "}
                          {bank?.account_number_masked || bank?.account_number || "-"}
                        </div>
                        <div className="staff-row-meta">
                          Account name: {bank?.account_name || "-"} | Verified: {bank?.verified_at ? formatDateLabel(bank.verified_at) : "Not yet"}
                        </div>
                        {Array.isArray(agent.projects) && agent.projects.length > 0 ? (
                          <div className="staff-row-meta">
                            Rates:{" "}
                            {agent.projects
                              .map(
                                (project: any) =>
                                  `${project.project_name || `Project #${project.project_id}`} (${formatCurrencyAmount(
                                    Number(project.planting_fee || 0),
                                    project.currency || sponsorAgentPayoutSummary.currency,
                                  )} planting, ${formatCurrencyAmount(
                                    Number(project.maintenance_fee || 0),
                                    project.currency || sponsorAgentPayoutSummary.currency,
                                  )} maintenance)`,
                              )
                              .join(" | ")}
                          </div>
                        ) : null}
                        {Array.isArray(agent.project_summaries) && agent.project_summaries.length > 0 ? (
                          <div className="staff-row-meta" style={{ marginTop: 4 }}>
                            Earnings:{" "}
                            {agent.project_summaries
                              .map(
                                (projectSummary: any) =>
                                  `${projectSummary.project_name || `Project #${projectSummary.project_id}`}: ${formatCurrencyAmount(
                                    Number(projectSummary.available_amount || 0),
                                    projectSummary.currency || sponsorAgentPayoutSummary.currency,
                                  )} available (Paid: ${formatCurrencyAmount(
                                    Number(projectSummary.paid_amount || 0),
                                    projectSummary.currency || sponsorAgentPayoutSummary.currency,
                                  )})`,
                              )
                              .join(" | ")}
                          </div>
                        ) : null}
                        {recentEarnings.length > 0 ? (
                          <div className="staff-list" style={{ marginTop: 12 }}>
                            {recentEarnings.map((earning: any) => (
                              <div key={earning.earning_key} className="staff-row" style={{ margin: 0 }}>
                                <div className="staff-row-head">
                                  <strong>{earning.task_label || formatTaskTypeLabel(earning.work_type || "planting")}</strong>
                                  <span>{formatCurrencyAmount(Number(earning.amount || 0), earning.currency || sponsorAgentPayoutSummary.currency)}</span>
                                </div>
                                <div className="staff-row-meta">
                                  {earning.tree_label || "Tree record"}
                                  {earning.sponsor_name ? ` | Sponsor: ${earning.sponsor_name}` : ""}
                                  {earning.earned_at ? ` | ${formatDateLabel(earning.earned_at)}` : ""}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="staff-row-meta" style={{ marginTop: 8 }}>
                            No verified sponsor-funded earnings recorded for this agent yet.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="green-work-card green-work-payout-side">
              <h3>Accounting</h3>
              <p className="green-work-note">
                This board refreshes automatically from the live sponsor-agent payout feed. Standard flow: verified bank details, agent
                payout request, approve only or approve and auto pay, then retry auto payout or complete a manual settlement with an
                external reference if the gateway payout needs intervention.
              </p>
              <div className="work-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                <span className="green-work-live-pill neutral">Requests: {sponsorAgentPayoutSummary.requestCount}</span>
                <span className="green-work-live-pill warning">Awaiting: {sponsorAgentPayoutRequestBuckets.awaiting.length}</span>
                <span className="green-work-live-pill ok">Paid: {sponsorAgentPayoutRequestBuckets.paid.length}</span>
                <span className="green-work-live-pill danger">Issues: {sponsorAgentPayoutRequestBuckets.issue.length}</span>
                <span className="green-work-live-pill neutral">Manual fallback: always available</span>
              </div>
              <div className="staff-list">
                <div className="staff-row">
                  <div className="staff-row-head">
                    <strong>Available Liability</strong>
                    <span>{formatCurrencyAmount(sponsorAgentPayoutSummary.availableAmount, sponsorAgentPayoutSummary.currency)}</span>
                  </div>
                  <div className="staff-row-meta">Earnings ready for agents to request.</div>
                </div>
                <div className="staff-row">
                  <div className="staff-row-head">
                    <strong>Requested Liability</strong>
                    <span>{formatCurrencyAmount(sponsorAgentPayoutSummary.requestedAmount, sponsorAgentPayoutSummary.currency)}</span>
                  </div>
                  <div className="staff-row-meta">Already requested and waiting for review or transfer.</div>
                </div>
                <div className="staff-row">
                  <div className="staff-row-head">
                    <strong>Paid Out</strong>
                    <span>{formatCurrencyAmount(sponsorAgentPayoutSummary.paidAmount, sponsorAgentPayoutSummary.currency)}</span>
                  </div>
                  <div className="staff-row-meta">Completed sponsor-agent payouts.</div>
                </div>
              </div>

              {requestSections.map((section) => (
                <div key={`sponsor-payout-section-${section.key}`} style={{ marginTop: 18 }}>
                  <div className="work-actions" style={{ marginBottom: 10, flexWrap: "wrap" }}>
                    <span className={`green-work-live-pill ${section.tone}`}>{section.title}</span>
                    <span className="green-work-live-pill neutral">
                      {section.rows.length} request{section.rows.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="staff-list">
                    {section.rows.map((request: any) => {
                      const status = normalizeValue(request.status);
                      const terminal = ["paid", "rejected", "cancelled"].includes(status);
                      const failedTransfer = status === "failed";
                      const processingTransfer = status === "processing";

                      return (
                        <div key={`sponsor-payout-request-${section.key}-${request.id}`} className="staff-row">
                          <div className="staff-row-head">
                            <strong>{request.user_name || `Agent #${request.user_id}`}</strong>
                            <span>{request.request_uid || `Request #${request.id}`}</span>
                          </div>
                          <div className="work-actions" style={{ margin: "8px 0 6px", flexWrap: "wrap" }}>
                            <span className={`green-work-live-pill ${section.tone}`}>{formatTaskTypeLabel(request.status || "requested")}</span>
                            <span className="green-work-live-pill neutral">
                              {formatCurrencyAmount(request.amount_total, request.currency || sponsorAgentPayoutSummary.currency)}
                            </span>
                            {request.transfer_status ? (
                              <span className="green-work-live-pill info">Transfer: {formatTaskTypeLabel(request.transfer_status)}</span>
                            ) : null}
                          </div>
                          <div className="staff-row-meta">
                            Bank: {request.bank_name || "-"} | Code: {request.bank_code || "-"} | Account:{" "}
                            {request.account_number_masked || request.account_number || "-"} | {request.account_name || "-"}
                          </div>
                          <div className="staff-row-meta">
                            Created: {request.created_at ? formatDateLabel(request.created_at) : "-"}
                            {request.paid_at ? ` | Paid: ${formatDateLabel(request.paid_at)}` : ""}
                          </div>
                          <div className="staff-row-meta">
                            Settlement: {request.settlement_channel ? formatTaskTypeLabel(request.settlement_channel) : "Pending"}
                            {request.settlement_reference ? ` | Ref: ${request.settlement_reference}` : ""}
                          </div>
                          {request.transfer_reference || request.transfer_id || request.transfer_status ? (
                            <div className="staff-row-meta">
                              Transfer ref: {request.transfer_reference || "-"}
                              {request.transfer_id ? ` | Transfer ID: ${request.transfer_id}` : ""}
                              {request.transfer_status ? ` | Gateway: ${formatTaskTypeLabel(request.transfer_status)}` : ""}
                            </div>
                          ) : null}
                          <div className="staff-row-meta">
                            Review: {request.reviewed_by || "-"}
                            {request.reviewed_at ? ` | ${formatDateLabel(request.reviewed_at)}` : ""}
                          </div>
                          {request.review_notes ? <div className="staff-row-meta">Note: {request.review_notes}</div> : null}
                          {failedTransfer ? (
                            <div className="green-work-note danger">
                              Automatic payout failed. Retry the gateway payout or complete a manual settlement with an external bank
                              reference.
                            </div>
                          ) : null}
                          {!terminal ? (
                            <div className="work-actions">
                              {sponsorAgentPayoutSummary.autoPayoutAvailable ? (
                                <button
                                  type="button"
                                  className="btn-primary"
                                  disabled={reviewingSponsorAgentPayoutId === request.id || processingTransfer}
                                  onClick={() =>
                                    void reviewSponsorAgentPayoutRequest(
                                      request.id,
                                      failedTransfer ? "retry_transfer" : "approve_and_pay",
                                      { autoTransfer: true },
                                    )
                                  }
                                >
                                  {reviewingSponsorAgentPayoutId === request.id
                                    ? "Processing..."
                                    : failedTransfer
                                      ? "Retry Auto Payout"
                                      : "Approve & Auto Pay"}
                                </button>
                              ) : null}
                              {!processingTransfer ? (
                                <button
                                  type="button"
                                  disabled={reviewingSponsorAgentPayoutId === request.id}
                                  onClick={() => void reviewSponsorAgentPayoutRequest(request.id, "approve")}
                                >
                                  Approve Only
                                </button>
                              ) : null}
                              <button
                                type="button"
                                disabled={reviewingSponsorAgentPayoutId === request.id || processingTransfer}
                                onClick={() => void reviewSponsorAgentPayoutRequest(request.id, "mark_paid")}
                              >
                                Manual Settlement Complete
                              </button>
                              <button
                                type="button"
                                disabled={reviewingSponsorAgentPayoutId === request.id}
                                onClick={() => void reviewSponsorAgentPayoutRequest(request.id, processingTransfer ? "cancel" : "reject")}
                              >
                                {processingTransfer ? "Cancel" : "Reject"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
