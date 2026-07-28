type GreenWorkSponsorFeedbackPanelProps = {
  publicSponsorshipProject: any;
  feedbackLoading: boolean;
  socialFollowClaims: any[];
  complaints: any[];
  schoolNominations: any[];
  communityProjects: any[];
  redemptions: any[];
  assistantEscalations: any[];
  loadSponsorFeedback: () => void | Promise<void>;
  feedbackError: string | null;
  canAccessSuperAdmin: boolean;
  assistantEscalationReplies: Record<number, string>;
  setAssistantEscalationReplies: (value: any) => void;
  assistantEscalationNotes: Record<number, string>;
  setAssistantEscalationNotes: (value: any) => void;
  resolvingAssistantEscalationId: number | null;
  handleResolveAssistantEscalation: (id: number, note?: string, reply?: string) => void | Promise<void>;
  toDisplayPhotoUrl: (url: string, options?: any) => string;
  followClaimNotes: Record<number, string>;
  setFollowClaimNotes: (value: any) => void;
  handleReviewSocialFollowClaim: (id: number, status: "approved" | "rejected", note?: string) => void | Promise<void>;
  complaintNotes: Record<number, string>;
  setComplaintNotes: (value: any) => void;
  handleResolveComplaint: (id: number, note?: string) => void | Promise<void>;
  nominationNotes: Record<number, string>;
  setNominationNotes: (value: any) => void;
  handleReviewSchoolNomination: (id: number, status: "approved" | "rejected", note?: string) => void | Promise<void>;
  projectNotes: Record<number, string>;
  setProjectNotes: (value: any) => void;
  handleUpdateCommunityProjectStatus: (id: number, status: "approved" | "rejected", note?: string) => void | Promise<void>;
  redemptionNotes: Record<number, string>;
  setRedemptionNotes: (value: any) => void;
  handleReviewPointRedemption: (id: number, status: "approved" | "rejected", note?: string) => void | Promise<void>;
};

export default function GreenWorkSponsorFeedbackPanel({
  publicSponsorshipProject,
  feedbackLoading,
  socialFollowClaims,
  complaints,
  schoolNominations,
  communityProjects,
  redemptions,
  assistantEscalations,
  loadSponsorFeedback,
  feedbackError,
  canAccessSuperAdmin,
  assistantEscalationReplies,
  setAssistantEscalationReplies,
  assistantEscalationNotes,
  setAssistantEscalationNotes,
  resolvingAssistantEscalationId,
  handleResolveAssistantEscalation,
  toDisplayPhotoUrl,
  followClaimNotes,
  setFollowClaimNotes,
  handleReviewSocialFollowClaim,
  complaintNotes,
  setComplaintNotes,
  handleResolveComplaint,
  nominationNotes,
  setNominationNotes,
  handleReviewSchoolNomination,
  projectNotes,
  setProjectNotes,
  handleUpdateCommunityProjectStatus,
  redemptionNotes,
  setRedemptionNotes,
  handleReviewPointRedemption,
}: GreenWorkSponsorFeedbackPanelProps) {
  return (
    <div className="green-work-card">
      <h3>Sponsor Feedback & Nominations</h3>
      {!publicSponsorshipProject ? (
        <p className="green-work-note">Switch this project to the Public Sponsorship access route first.</p>
      ) : feedbackLoading &&
        socialFollowClaims.length === 0 &&
        complaints.length === 0 &&
        schoolNominations.length === 0 &&
        communityProjects.length === 0 &&
        redemptions.length === 0 &&
        assistantEscalations.length === 0 ? (
        <p className="green-work-note">Loading sponsor feedback data...</p>
      ) : (
        <>
          <div className="work-actions" style={{ marginBottom: 16 }}>
            <button type="button" onClick={() => void loadSponsorFeedback()}>
              Refresh Data
            </button>
          </div>

          {feedbackError && (
            <p className="green-work-error" style={{ color: "red", marginBottom: 12 }}>
              {feedbackError}
            </p>
          )}

          <div style={{ marginBottom: 24 }}>
            <h4>Assistant Questions ({assistantEscalations.filter((entry: any) => entry.status !== "resolved").length} open)</h4>
            <p className="green-work-note" style={{ marginLeft: 0 }}>
              Questions Planty (the sponsor page chat assistant) could not confidently answer, escalated here for a human reply.
            </p>
            {assistantEscalations.length === 0 ? (
              <p className="green-work-note" style={{ marginLeft: 0 }}>
                No escalated questions yet.
              </p>
            ) : (
              <table className="green-work-table">
                <thead>
                  <tr>
                    <th>Visitor</th>
                    <th>Question</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Reply / Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assistantEscalations.map((entry: any) => {
                    const isResolved = entry.status === "resolved";
                    return (
                      <tr key={`assistant-escalation-${entry.id}`}>
                        <td>
                          <strong>{entry.visitor_name || "Anonymous visitor"}</strong>
                          <div style={{ fontSize: 11, color: "#666" }}>{entry.visitor_email}</div>
                        </td>
                        <td style={{ maxWidth: 260 }}>{entry.question}</td>
                        <td>
                          <span className={`green-work-live-pill ${isResolved ? "ok" : "warning"}`}>
                            {isResolved ? "Replied" : "Needs reply"}
                          </span>
                          {entry.admin_reply && (
                            <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                              <strong>Reply sent:</strong> {entry.admin_reply}
                            </div>
                          )}
                        </td>
                        <td>{new Date(entry.created_at).toLocaleString()}</td>
                        <td>
                          {!isResolved ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
                              <textarea
                                placeholder="Write the reply to email the visitor..."
                                value={assistantEscalationReplies[entry.id] || ""}
                                onChange={(event) =>
                                  setAssistantEscalationReplies({
                                    ...assistantEscalationReplies,
                                    [entry.id]: event.target.value,
                                  })
                                }
                                style={{ width: "100%", padding: 4, fontSize: 11 }}
                                rows={2}
                              />
                              <textarea
                                placeholder="Internal note (optional, not emailed)"
                                value={assistantEscalationNotes[entry.id] || ""}
                                onChange={(event) =>
                                  setAssistantEscalationNotes({
                                    ...assistantEscalationNotes,
                                    [entry.id]: event.target.value,
                                  })
                                }
                                style={{ width: "100%", padding: 4, fontSize: 11 }}
                                rows={1}
                              />
                              <button
                                type="button"
                                disabled={resolvingAssistantEscalationId === entry.id}
                                onClick={() =>
                                  handleResolveAssistantEscalation(
                                    entry.id,
                                    assistantEscalationNotes[entry.id],
                                    assistantEscalationReplies[entry.id],
                                  )
                                }
                                style={{ padding: "4px 8px", fontSize: 11 }}
                              >
                                {resolvingAssistantEscalationId === entry.id ? "Sending..." : "Send Reply & Resolve"}
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: "#27ae60", fontWeight: "bold" }}>Resolved</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {canAccessSuperAdmin ? (
            <div style={{ marginBottom: 24 }}>
              <h4>Social Follow Proofs ({socialFollowClaims.length})</h4>
              <p className="green-work-note" style={{ marginLeft: 0 }}>
                Sponsors submit Facebook and Instagram follow screenshots here. Only super admin can approve the proof and award the 20 GP follow bonus.
              </p>
              {socialFollowClaims.length === 0 ? (
                <p className="green-work-note" style={{ marginLeft: 0 }}>
                  No follow-proof submissions yet.
                </p>
              ) : (
                <table className="green-work-table">
                  <thead>
                    <tr>
                      <th>Sponsor</th>
                      <th>Proof</th>
                      <th>Opened</th>
                      <th>Status / Notes</th>
                      <th>Submitted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {socialFollowClaims.map((claim: any) => {
                      const submittedAt = claim.submitted_at || claim.updated_at || claim.created_at;
                      const isPending = String(claim.status || "").toLowerCase() === "pending";
                      const statusTone =
                        claim.status === "approved" ? "ok" : claim.status === "rejected" ? "error" : "warning";
                      return (
                        <tr key={`follow-claim-${claim.id}`}>
                          <td>
                            <strong>{claim.sponsor_name || `Sponsor #${claim.sponsor_id}`}</strong>
                            <div style={{ fontSize: 11, color: "#666" }}>{claim.sponsor_email || "-"}</div>
                          </td>
                          <td style={{ minWidth: 240 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(88px, 1fr))", gap: 8 }}>
                              {(["facebook", "instagram"] as const).map((platform) => {
                                const label = platform === "facebook" ? "Facebook" : "Instagram";
                                const rawUrl =
                                  platform === "facebook"
                                    ? String(claim.facebook_screenshot_url || "").trim()
                                    : String(claim.instagram_screenshot_url || "").trim();
                                return rawUrl ? (
                                  <button
                                    key={`${claim.id}-${platform}`}
                                    type="button"
                                    onClick={() => window.open(toDisplayPhotoUrl(rawUrl), "_blank")}
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 6,
                                      alignItems: "stretch",
                                      padding: 6,
                                      borderRadius: 12,
                                      border: "1px solid #dbe9dd",
                                      background: "#f8fcf9",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <img
                                      src={toDisplayPhotoUrl(rawUrl)}
                                      alt={`${label} proof`}
                                      style={{
                                        width: "100%",
                                        height: 120,
                                        objectFit: "cover",
                                        borderRadius: 8,
                                        background: "#edf6ef",
                                      }}
                                    />
                                    <span style={{ fontSize: 11, fontWeight: 700, color: "#16532d" }}>
                                      Open {label} proof
                                    </span>
                                  </button>
                                ) : (
                                  <div
                                    key={`${claim.id}-${platform}`}
                                    style={{
                                      minHeight: 120,
                                      borderRadius: 12,
                                      border: "1px dashed #dbe9dd",
                                      background: "#fbfdfb",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      padding: 10,
                                      fontSize: 11,
                                      color: "#708676",
                                      textAlign: "center",
                                    }}
                                  >
                                    No {label.toLowerCase()} proof uploaded
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td style={{ minWidth: 140 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <span className={`green-work-live-pill ${claim.facebook_opened ? "ok" : "warning"}`}>
                                Facebook: {claim.facebook_opened ? "opened" : "not opened"}
                              </span>
                              <span className={`green-work-live-pill ${claim.instagram_opened ? "ok" : "warning"}`}>
                                Instagram: {claim.instagram_opened ? "opened" : "not opened"}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`green-work-live-pill ${statusTone}`}>{claim.status}</span>
                            <div style={{ fontSize: 11, color: "#2f4f3a", marginTop: 6 }}>
                              GP awarded: {claim.points_awarded ? "Yes" : "No"}
                            </div>
                            {claim.supervisor_note ? (
                              <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                                <strong>Supervisor note:</strong> {claim.supervisor_note}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            {submittedAt ? new Date(submittedAt).toLocaleString() : "-"}
                            {claim.reviewed_at ? (
                              <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                                Reviewed: {new Date(claim.reviewed_at).toLocaleString()}
                              </div>
                            ) : null}
                          </td>
                          <td style={{ minWidth: 210 }}>
                            {isPending ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <textarea
                                  placeholder="Optional note to the sponsor..."
                                  value={followClaimNotes[claim.id] || ""}
                                  onChange={(event) =>
                                    setFollowClaimNotes({
                                      ...followClaimNotes,
                                      [claim.id]: event.target.value,
                                    })
                                  }
                                  style={{ width: "100%", padding: 6, fontSize: 11 }}
                                  rows={2}
                                />
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  <button
                                    type="button"
                                    onClick={() => handleReviewSocialFollowClaim(claim.id, "approved", followClaimNotes[claim.id])}
                                    style={{ padding: "4px 8px", fontSize: 11, backgroundColor: "#2ecc71", color: "white", border: "none" }}
                                  >
                                    Approve + award GP
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReviewSocialFollowClaim(claim.id, "rejected", followClaimNotes[claim.id])}
                                    style={{ padding: "4px 8px", fontSize: 11, backgroundColor: "#e74c3c", color: "white", border: "none" }}
                                  >
                                    Reject proof
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, textTransform: "capitalize", fontWeight: "bold" }}>{claim.status}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}

          <div style={{ marginBottom: 24 }}>
            <h4>Sponsor Complaints ({complaints.length})</h4>
            {complaints.length === 0 ? (
              <p className="green-work-note" style={{ marginLeft: 0 }}>
                No complaints submitted yet.
              </p>
            ) : (
              <table className="green-work-table">
                <thead>
                  <tr>
                    <th>Sponsor</th>
                    <th>Type</th>
                    <th>Tree ID</th>
                    <th>Message</th>
                    <th>Status / Notes</th>
                    <th>Submitted At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {complaints.map((complaint: any) => (
                    <tr key={`complaint-${complaint.id}`}>
                      <td>
                        <strong>{complaint.sponsor_name}</strong>
                        <div style={{ fontSize: 11, color: "#666" }}>{complaint.sponsor_email}</div>
                      </td>
                      <td style={{ textTransform: "capitalize" }}>{complaint.complaint_type}</td>
                      <td>{complaint.tree_id || "-"}</td>
                      <td>{complaint.message}</td>
                      <td>
                        <span className={`green-work-live-pill ${complaint.status === "resolved" ? "ok" : "warning"}`}>
                          {complaint.status}
                        </span>
                        {complaint.supervisor_note && (
                          <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                            <strong>Supervisor note:</strong> {complaint.supervisor_note}
                          </div>
                        )}
                      </td>
                      <td>{new Date(complaint.created_at).toLocaleString()}</td>
                      <td>
                        {complaint.status !== "resolved" ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <textarea
                              placeholder="Add supervisor note to sponsor..."
                              value={complaintNotes[complaint.id] || ""}
                              onChange={(event) =>
                                setComplaintNotes({
                                  ...complaintNotes,
                                  [complaint.id]: event.target.value,
                                })
                              }
                              style={{ width: "100%", padding: 4, fontSize: 11 }}
                              rows={2}
                            />
                            <button
                              type="button"
                              onClick={() => handleResolveComplaint(complaint.id, complaintNotes[complaint.id])}
                              style={{ padding: "4px 8px", fontSize: 11 }}
                            >
                              Mark Resolved
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: "#27ae60", fontWeight: "bold" }}>Resolved</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ marginBottom: 24 }}>
            <h4>School Nominations ({schoolNominations.length})</h4>
            {schoolNominations.length === 0 ? (
              <p className="green-work-note" style={{ marginLeft: 0 }}>
                No nominations submitted yet.
              </p>
            ) : (
              <table className="green-work-table">
                <thead>
                  <tr>
                    <th>School Details</th>
                    <th>Nominator</th>
                    <th>Reason</th>
                    <th>Status / Notes</th>
                    <th>Points Spent</th>
                    <th>Submitted At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schoolNominations.map((nomination: any) => (
                    <tr key={`nomination-${nomination.id}`}>
                      <td>
                        <strong>{nomination.school_name}</strong>
                        <div style={{ fontSize: 11, color: "#666" }}>{nomination.school_address}</div>
                        <div style={{ fontSize: 11, color: "#666" }}>
                          Contact: {nomination.contact_person || "-"} ({nomination.contact_phone || "-"})
                        </div>
                      </td>
                      <td>
                        <strong>{nomination.sponsor_name}</strong>
                        <div style={{ fontSize: 11, color: "#666" }}>{nomination.sponsor_email}</div>
                      </td>
                      <td>{nomination.reason}</td>
                      <td>
                        <span
                          className={`green-work-live-pill ${
                            nomination.status === "approved" ? "ok" : nomination.status === "rejected" ? "error" : "warning"
                          }`}
                        >
                          {nomination.status}
                        </span>
                        {nomination.supervisor_note && (
                          <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                            <strong>Supervisor note:</strong> {nomination.supervisor_note}
                          </div>
                        )}
                      </td>
                      <td>{nomination.points_spent} GP</td>
                      <td>{new Date(nomination.created_at).toLocaleString()}</td>
                      <td>
                        {nomination.status === "pending" ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <textarea
                              placeholder="Add supervisor note to sponsor..."
                              value={nominationNotes[nomination.id] || ""}
                              onChange={(event) =>
                                setNominationNotes({
                                  ...nominationNotes,
                                  [nomination.id]: event.target.value,
                                })
                              }
                              style={{ width: "100%", padding: 4, fontSize: 11 }}
                              rows={2}
                            />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => handleReviewSchoolNomination(nomination.id, "approved", nominationNotes[nomination.id])}
                                style={{ padding: "4px 8px", fontSize: 11, backgroundColor: "#2ecc71", color: "white", border: "none" }}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReviewSchoolNomination(nomination.id, "rejected", nominationNotes[nomination.id])}
                                style={{ padding: "4px 8px", fontSize: 11, backgroundColor: "#e74c3c", color: "white", border: "none" }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, textTransform: "capitalize", fontWeight: "bold" }}>{nomination.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ marginBottom: 24 }}>
            <h4>Proposed Community Forests ({communityProjects.length})</h4>
            {communityProjects.length === 0 ? (
              <p className="green-work-note" style={{ marginLeft: 0 }}>
                No community projects proposed yet.
              </p>
            ) : (
              <table className="green-work-table">
                <thead>
                  <tr>
                    <th>Project Details</th>
                    <th>Proposer</th>
                    <th>Description</th>
                    <th>Points Contributed</th>
                    <th>Status / Notes</th>
                    <th>Submitted At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {communityProjects.map((project: any) => (
                    <tr key={`project-${project.id}`}>
                      <td>
                        <strong>{project.project_name}</strong>
                        <div style={{ fontSize: 11, color: "#666" }}>Location: {project.proposed_location}</div>
                      </td>
                      <td>
                        <strong>{project.sponsor_name}</strong>
                        <div style={{ fontSize: 11, color: "#666" }}>{project.sponsor_email}</div>
                      </td>
                      <td>{project.description || "-"}</td>
                      <td>{project.points_contributed} GP</td>
                      <td>
                        <span
                          className={`green-work-live-pill ${
                            project.status === "approved" ? "ok" : project.status === "rejected" ? "error" : "warning"
                          }`}
                        >
                          {project.status || "pending"}
                        </span>
                        {project.supervisor_note && (
                          <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                            <strong>Supervisor note:</strong> {project.supervisor_note}
                          </div>
                        )}
                      </td>
                      <td>{new Date(project.created_at).toLocaleString()}</td>
                      <td>
                        {!project.status || project.status === "pending" ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <textarea
                              placeholder="Add supervisor note to sponsor..."
                              value={projectNotes[project.id] || ""}
                              onChange={(event) =>
                                setProjectNotes({
                                  ...projectNotes,
                                  [project.id]: event.target.value,
                                })
                              }
                              style={{ width: "100%", padding: 4, fontSize: 11 }}
                              rows={2}
                            />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => handleUpdateCommunityProjectStatus(project.id, "approved", projectNotes[project.id])}
                                style={{ padding: "4px 8px", fontSize: 11, backgroundColor: "#2ecc71", color: "white", border: "none" }}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateCommunityProjectStatus(project.id, "rejected", projectNotes[project.id])}
                                style={{ padding: "4px 8px", fontSize: 11, backgroundColor: "#e74c3c", color: "white", border: "none" }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, textTransform: "capitalize", fontWeight: "bold" }}>{project.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ marginBottom: 24 }}>
            <h4>Reward Redemptions ({redemptions.length})</h4>
            {redemptions.length === 0 ? (
              <p className="green-work-note" style={{ marginLeft: 0 }}>
                No reward redemptions yet.
              </p>
            ) : (
              <table className="green-work-table">
                <thead>
                  <tr>
                    <th>Sponsor</th>
                    <th>Reward</th>
                    <th>Points Spent</th>
                    <th>Shipping Details</th>
                    <th>Status / Notes</th>
                    <th>Submitted At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((redemption: any) => (
                    <tr key={`redemption-${redemption.id}`}>
                      <td>
                        <strong>{redemption.sponsor_name}</strong>
                        <div style={{ fontSize: 11, color: "#666" }}>{redemption.sponsor_email}</div>
                      </td>
                      <td style={{ textTransform: "capitalize" }}>
                        {String(redemption.reward_type || "").replace("merch_", "").replace("_", " ")}
                      </td>
                      <td>{redemption.points_spent} GP</td>
                      <td style={{ fontSize: 11, maxWidth: 250, whiteSpace: "normal", wordBreak: "break-word" }}>
                        {(() => {
                          const details = redemption.shipping_details;
                          if (!details || typeof details !== "object") return "No delivery details";
                          const method = details.delivery_method || "";
                          const phone = details.phone || "";
                          if (method === "home_delivery") {
                            return `Home Delivery - Phone: ${phone} - Address: ${details.address || ""}, ${details.state || ""}, ${details.lga || ""}`;
                          }
                          if (method === "office_pickup") {
                            return `Hub Pickup - Phone: ${phone} - Hub: ${details.hub || ""}`;
                          }
                          if (method === "transport_terminal") {
                            return `Transport Park - Phone: ${phone} - Company: ${details.transport_company || ""}, Destination Park: ${details.destination_terminal || ""}`;
                          }
                          return JSON.stringify(details);
                        })()}
                      </td>
                      <td>
                        <span
                          className={`green-work-live-pill ${
                            redemption.status === "approved" ? "ok" : redemption.status === "rejected" ? "error" : "warning"
                          }`}
                        >
                          {redemption.status}
                        </span>
                        {redemption.supervisor_note && (
                          <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                            <strong>Supervisor note:</strong> {redemption.supervisor_note}
                          </div>
                        )}
                      </td>
                      <td>{new Date(redemption.created_at).toLocaleString()}</td>
                      <td>
                        {redemption.status === "pending" ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <textarea
                              placeholder="Add supervisor note to sponsor..."
                              value={redemptionNotes[redemption.id] || ""}
                              onChange={(event) =>
                                setRedemptionNotes({
                                  ...redemptionNotes,
                                  [redemption.id]: event.target.value,
                                })
                              }
                              style={{ width: "100%", padding: 4, fontSize: 11 }}
                              rows={2}
                            />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => handleReviewPointRedemption(redemption.id, "approved", redemptionNotes[redemption.id])}
                                style={{ padding: "4px 8px", fontSize: 11, backgroundColor: "#2ecc71", color: "white", border: "none" }}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReviewPointRedemption(redemption.id, "rejected", redemptionNotes[redemption.id])}
                                style={{ padding: "4px 8px", fontSize: 11, backgroundColor: "#e74c3c", color: "white", border: "none" }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, textTransform: "capitalize", fontWeight: "bold" }}>{redemption.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
