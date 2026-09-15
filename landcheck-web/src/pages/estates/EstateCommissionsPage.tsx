import { Fragment, useEffect, useState } from "react";
import { api, extractApiErrorMessage } from "../../api/client";
import { money, PAYMENT_METHODS } from "../../components/estates/FinancialComponents";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import EstateModal from "../../components/estates/EstateModal";
import Spinner from "../../components/estates/EstateSpinner";

async function download(path: string, name: string) {
  const response = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10);

export default function EstateCommissionsPage() {
  const [sidebarEstateId, setSidebarEstateId] = useState("");
  const [sidebarEstateName, setSidebarEstateName] = useState("");
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [commissionTiers, setCommissionTiers] = useState<any[]>([]);
  const [commissionTiersUsingDefaults, setCommissionTiersUsingDefaults] = useState(true);
  const [commissionReport, setCommissionReport] = useState<any[]>([]);
  const [commissionTiersBusy, setCommissionTiersBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [agents, setAgents] = useState<any[]>([]);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRole, setNewAgentRole] = useState("sales");
  const [agentBusy, setAgentBusy] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [agentDetail, setAgentDetail] = useState<any>(null);
  const [agentDetailLoading, setAgentDetailLoading] = useState(false);
  const [agentDetailError, setAgentDetailError] = useState("");
  const [payoutAllocationId, setPayoutAllocationId] = useState<number | null>(null);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutDate, setPayoutDate] = useState(today());
  const [payoutMethod, setPayoutMethod] = useState("bank_transfer");
  const [payoutReference, setPayoutReference] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [payoutReceipt, setPayoutReceipt] = useState<File | null>(null);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutError, setPayoutError] = useState("");

  const loadCommissionData = async (orgId: number) => {
    try {
      const [tiersResponse, reportResponse] = await Promise.all([
        api.get(`/estates/organizations/${orgId}/commission-tiers`),
        api.get(`/estates/organizations/${orgId}/commissions`),
      ]);
      setCommissionTiers((tiersResponse.data.tiers || []).map((tier: any) => ({ label: tier.label, min_cumulative_sales: tier.min_cumulative_sales, rate_percent: tier.rate_percent })));
      setCommissionTiersUsingDefaults(Boolean(tiersResponse.data.using_defaults));
      setCommissionReport(reportResponse.data.agents || []);
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "Commission data could not be loaded."));
    }
  };

  const loadAgents = async (orgId: number) => {
    try {
      const [membersResponse, namesResponse] = await Promise.all([
        api.get(`/estates/organizations/${orgId}/members`),
        api.get(`/estates/organizations/${orgId}/sales-agents`),
      ]);
      const infoByKey = new Map<string, any>((namesResponse.data || []).map((item: any) => [`${item.subject_type}::${item.subject_id}`, item]));
      setAgents((membersResponse.data || []).map((member: any) => {
        const info = infoByKey.get(`${member.subject_type}::${member.subject_id}`);
        return { ...member, display_name: info?.display_name || member.subject_id, current_tier_label: info?.current_tier_label, current_tier_rate_percent: info?.current_tier_rate_percent };
      }));
    } catch {
      setAgents([]);
    }
  };

  useEffect(() => {
    api.get("/estates").then((response) => {
      const first = (response.data || [])[0];
      if (first) {
        setSidebarEstateId(String(first.id));
        setSidebarEstateName(first.name);
        if (first.organization_id) {
          setOrganizationId(first.organization_id);
          void loadCommissionData(first.organization_id);
          void loadAgents(first.organization_id);
        }
      }
    }).catch(() => undefined);
  }, []);

  const addAgent = async () => {
    if (!organizationId || !newAgentName.trim()) return;
    setAgentBusy(true);
    try {
      await api.post(`/estates/organizations/${organizationId}/members`, { subject_type: "manual_agent", subject_id: newAgentName.trim(), role_key: newAgentRole });
      setMessage(`${newAgentName.trim()} added.`);
      setNewAgentName("");
      setShowAddAgent(false);
      await loadAgents(organizationId);
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "Agent could not be added."));
    } finally {
      setAgentBusy(false);
    }
  };

  const openAgentDetail = async (subjectType: string, subjectId: string) => {
    if (!organizationId) return;
    setAgentDetail({ subject_type: subjectType, subject_id: subjectId });
    setAgentDetailLoading(true);
    setAgentDetailError("");
    try {
      const response = await api.get(`/estates/organizations/${organizationId}/sales-agents/detail`, { params: { subject_type: subjectType, subject_id: subjectId } });
      setAgentDetail(response.data);
    } catch (error) {
      setAgentDetailError(await extractApiErrorMessage(error, "Agent details could not be loaded."));
    } finally {
      setAgentDetailLoading(false);
    }
  };

  const refreshAfterPayout = async () => {
    if (agentDetail?.subject_type && organizationId) await openAgentDetail(agentDetail.subject_type, agentDetail.subject_id);
    if (organizationId) { await loadCommissionData(organizationId); await loadAgents(organizationId); }
  };

  const toggleAgentActive = async (member: { id: number; is_active: boolean }) => {
    if (!organizationId) return;
    try {
      await api.patch(`/estates/organizations/${organizationId}/members/${member.id}`, { is_active: !member.is_active });
      await loadAgents(organizationId);
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "Agent could not be updated."));
    }
  };

  const saveCommissionTiers = async () => {
    if (!organizationId) return;
    setCommissionTiersBusy(true);
    try {
      const response = await api.put(`/estates/organizations/${organizationId}/commission-tiers`, {
        tiers: commissionTiers.map((tier) => ({ label: tier.label, min_cumulative_sales: Number(tier.min_cumulative_sales) || 0, rate_percent: Number(tier.rate_percent) || 0 })),
      });
      setCommissionTiers((response.data.tiers || []).map((tier: any) => ({ label: tier.label, min_cumulative_sales: tier.min_cumulative_sales, rate_percent: tier.rate_percent })));
      setCommissionTiersUsingDefaults(false);
      setMessage("Commission tiers saved.");
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "Commission tiers could not be saved."));
    } finally {
      setCommissionTiersBusy(false);
    }
  };

  const openPayoutForm = (plot: any) => {
    setPayoutAllocationId(plot.allocation_id);
    setPayoutAmount(plot.commission_outstanding || "0");
    setPayoutDate(today());
    setPayoutMethod("bank_transfer");
    setPayoutReference("");
    setPayoutNotes("");
    setPayoutReceipt(null);
    setPayoutError("");
  };

  const submitPayout = async () => {
    if (!payoutAllocationId) return;
    setPayoutBusy(true);
    setPayoutError("");
    try {
      const response = await api.post(`/estates/allocations/${payoutAllocationId}/commission-payout`, {
        amount: payoutAmount ? Number(payoutAmount) : null,
        payment_date: new Date(payoutDate).toISOString(),
        payment_method: payoutMethod,
        reference_no: payoutReference.trim() || null,
        notes: payoutNotes.trim() || null,
      });
      if (payoutReceipt) {
        const form = new FormData();
        form.append("file", payoutReceipt);
        try { await api.post("/estates/documents", form, { params: { entity_type: "commission_payout", entity_id: response.data.id, document_type: "receipt" } }); }
        catch { /* the payout itself already succeeded - a failed receipt upload shouldn't undo it */ }
      }
      setPayoutAllocationId(null);
      setMessage("Commission payout recorded.");
      await refreshAfterPayout();
    } catch (error) {
      setPayoutError(await extractApiErrorMessage(error, "Payout could not be recorded."));
    } finally {
      setPayoutBusy(false);
    }
  };

  return (
    <EstateShell estateId={sidebarEstateId} estateName={sidebarEstateName} activeKey="commissions">
      <p className="edash-status-row-desc" style={{ marginBottom: 16 }}>
        A single-level, volume-tiered commission ladder - the rate an agent earns steps up automatically once their cumulative Allocated (fully paid) sales cross a threshold, applied from the next sale onward. Past commissions never get recalculated when you edit the ladder. Commission itself becomes payable the moment a sale is fully paid (Allocated) - matching standard Nigerian agency practice, where commission is earned on introduction of a buyer who completes, payable on completion, regardless of how the buyer's own payment plan is structured. Actually paying an agent is a separate step below, tracked with its own record and receipt.
      </p>
      {message && <p className="edash-tab-empty" style={{ padding: "0 0 12px" }}>{message}</p>}

      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <h3 className="edash-card-title">Sales agents</h3>
            <button type="button" className="edash-tool-btn" onClick={() => setShowAddAgent(true)}>
              <EstateIcon name="plus" /> Add agent
            </button>
          </div>
          <p className="edash-field-note" style={{ marginBottom: 10 }}>Add anyone who should be selectable as a sales agent when reserving or allocating a plot - they don't need a LandCheck login, just a name to attribute sales and commission to.</p>
          {agents.length ? (
            <div style={{ overflowX: "auto" }}>
              <table className="edash-mini-table">
                <thead><tr><th>Name</th><th>Role</th><th>Current tier</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {agents.map((member) => (
                    <tr key={member.id}>
                      <td data-label="Name" style={{ cursor: "pointer" }} onClick={() => void openAgentDetail(member.subject_type, member.subject_id)}>{member.display_name}</td>
                      <td data-label="Role" style={{ textTransform: "capitalize" }}>{member.role.replaceAll("_", " ")}</td>
                      <td data-label="Current tier">{member.current_tier_label ? `${member.current_tier_label} (${Number(member.current_tier_rate_percent).toFixed(1)}%)` : "-"}</td>
                      <td data-label="Status"><span className={`edash-status-pill tone-${member.is_active ? "good" : "neutral"}`}>{member.is_active ? "Active" : "Inactive"}</span></td>
                      <td style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="edash-btn-outline" onClick={() => void openAgentDetail(member.subject_type, member.subject_id)}>View</button>
                        <button type="button" className="edash-btn-outline" onClick={() => void toggleAgentActive(member)}>{member.is_active ? "Deactivate" : "Reactivate"}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="edash-tab-empty">No agents or team members added yet.</p>}
        </div>
      </div>

      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Commission ladder</h3></div>
          {commissionTiersUsingDefaults && <p className="edash-field-note" style={{ marginBottom: 8 }}>Showing starter defaults - save to make these this organization's actual ladder.</p>}
          {commissionTiers.map((tier, index) => (
            <div key={index} className="edash-form-row" style={{ marginBottom: 8, alignItems: "flex-end" }}>
              <label className="edash-field" style={{ maxWidth: 160 }}>
                <span>Label</span>
                <input value={tier.label} onChange={(event) => setCommissionTiers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
              </label>
              <label className="edash-field" style={{ maxWidth: 200 }}>
                <span>From cumulative sales (NGN)</span>
                <input type="number" min="0" value={tier.min_cumulative_sales} onChange={(event) => setCommissionTiers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, min_cumulative_sales: event.target.value } : item))} />
              </label>
              <label className="edash-field" style={{ maxWidth: 120 }}>
                <span>Rate (%)</span>
                <input type="number" min="0" max="100" step="0.1" value={tier.rate_percent} onChange={(event) => setCommissionTiers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, rate_percent: event.target.value } : item))} />
              </label>
              <button type="button" className="edash-btn-outline" onClick={() => setCommissionTiers((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="edash-btn-outline" onClick={() => setCommissionTiers((current) => [...current, { label: `Tier ${current.length + 1}`, min_cumulative_sales: "0", rate_percent: "5" }])}>Add tier</button>
            <button type="button" className="edash-btn-primary" disabled={commissionTiersBusy || commissionTiers.length === 0} onClick={() => void saveCommissionTiers()}>
              {commissionTiersBusy ? <><Spinner size={13} /> Saving...</> : "Save tiers"}
            </button>
          </div>
        </div>
      </div>

      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Agent commissions</h3></div>
          {commissionReport.length ? (
            <div style={{ overflowX: "auto" }}>
              <table className="edash-mini-table">
                <thead><tr><th>Agent</th><th>Sales</th><th>Total volume</th><th>Earned</th><th>Paid out</th><th>Outstanding</th><th>Current tier</th></tr></thead>
                <tbody>
                  {commissionReport.map((agent) => (
                    <tr key={`${agent.subject_type}::${agent.subject_id}`} style={{ cursor: "pointer" }} onClick={() => void openAgentDetail(agent.subject_type, agent.subject_id)}>
                      <td data-label="Agent">{agent.display_name}</td>
                      <td data-label="Sales">{agent.sale_count}</td>
                      <td data-label="Total volume">{money(agent.total_volume)}</td>
                      <td data-label="Earned">{money(agent.total_commission)}</td>
                      <td data-label="Paid out">{money(agent.total_paid_out)}</td>
                      <td data-label="Outstanding">{Number(agent.total_outstanding) > 0 ? <strong style={{ color: "var(--edash-warn, #b5790a)" }}>{money(agent.total_outstanding)}</strong> : money(0)}</td>
                      <td data-label="Current tier">{agent.current_tier || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="edash-tab-empty">No fully-paid sales tagged with a sales agent yet.</p>}
        </div>
      </div>

      {showAddAgent && (
        <EstateModal title="Add agent" subtitle="They don't need a LandCheck login - just a name to attribute sales and commission to." onClose={() => setShowAddAgent(false)}>
          <label className="edash-field" style={{ marginBottom: 12 }}>
            <span>Name</span>
            <input value={newAgentName} onChange={(event) => setNewAgentName(event.target.value)} placeholder="e.g. Chidinma Okafor" autoFocus />
          </label>
          <label className="edash-field" style={{ marginBottom: 12 }}>
            <span>Role</span>
            <select value={newAgentRole} onChange={(event) => setNewAgentRole(event.target.value)}>
              <option value="sales">Sales agent</option>
              <option value="manager">Manager</option>
              <option value="accounts">Accounts</option>
              <option value="field_officer">Field officer</option>
              <option value="surveyor">Surveyor</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <button type="button" className="edash-btn-primary" disabled={agentBusy || !newAgentName.trim()} onClick={() => void addAgent()}>
            {agentBusy ? <><Spinner size={13} /> Adding...</> : "Add agent"}
          </button>
        </EstateModal>
      )}

      {agentDetail && (
        <EstateModal
          title={agentDetail.display_name || agentDetail.subject_id}
          subtitle={agentDetail.role ? agentDetail.role.replaceAll("_", " ") : undefined}
          onClose={() => { setAgentDetail(null); setPayoutAllocationId(null); }}
        >
          {agentDetailLoading ? (
            <p className="edash-tab-empty" style={{ padding: "10px 0" }}><Spinner size={13} /> Loading...</p>
          ) : agentDetailError ? (
            <p className="edash-tab-empty" style={{ padding: "10px 0" }}>{agentDetailError}</p>
          ) : (
            <>
              <div className="edash-overview-grid" style={{ marginBottom: 16 }}>
                <div className="edash-overview-field"><span>Plots</span><strong>{agentDetail.summary?.plot_count ?? 0}</strong></div>
                <div className="edash-overview-field"><span>Total volume</span><strong>{money(agentDetail.summary?.total_volume || 0)}</strong></div>
                <div className="edash-overview-field"><span>Earned</span><strong>{money(agentDetail.summary?.total_commission_earned || 0)}</strong></div>
                <div className="edash-overview-field"><span>Paid out</span><strong>{money(agentDetail.summary?.total_commission_paid_out || 0)}</strong></div>
                <div className="edash-overview-field"><span>Outstanding</span><strong>{money(agentDetail.summary?.total_commission_outstanding || 0)}</strong></div>
                <div className="edash-overview-field"><span>Next-sale tier</span><strong>{agentDetail.summary?.current_tier || "-"}{agentDetail.summary?.current_tier_rate_percent ? ` (${Number(agentDetail.summary.current_tier_rate_percent).toFixed(1)}%)` : ""}</strong></div>
              </div>
              {agentDetail.plots?.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table className="edash-mini-table">
                    <thead>
                      <tr>
                        <th>Plot</th><th>Estate</th><th>Customer</th><th>Status</th>
                        <th>Agreed</th><th>Confirmed</th><th>Commission</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {agentDetail.plots.map((plot: any) => (
                        <Fragment key={plot.allocation_id}>
                          <tr>
                            <td data-label="Plot">{plot.plot_number}</td>
                            <td data-label="Estate">{plot.estate_name}</td>
                            <td data-label="Customer">{plot.customer_name}</td>
                            <td data-label="Status"><span className={`edash-status-pill tone-${plot.status === "allocated" ? "good" : "warn"}`}>{plot.status}</span></td>
                            <td data-label="Agreed">{money(plot.agreed_price)}</td>
                            <td data-label="Confirmed">{money(plot.confirmed_paid)}</td>
                            <td data-label="Commission">
                              {plot.status === "allocated" ? (
                                <>
                                  <div>{money(plot.commission_amount)}{plot.commission_tier_label ? <span className="edash-field-note"> ({plot.commission_tier_label})</span> : null}</div>
                                  <div className="edash-field-note">
                                    Paid {money(plot.commission_paid_out)}
                                    {Number(plot.commission_outstanding) > 0 && <> &middot; <strong style={{ color: "var(--edash-warn, #b5790a)" }}>{money(plot.commission_outstanding)} due</strong></>}
                                  </div>
                                </>
                              ) : "Pending allocation"}
                            </td>
                            <td>
                              {plot.status === "allocated" && Number(plot.commission_outstanding) > 0 && (
                                <button type="button" className="edash-btn-outline" onClick={() => openPayoutForm(plot)}>Pay</button>
                              )}
                            </td>
                          </tr>
                          {plot.payouts?.length > 0 && (
                            <tr>
                              <td colSpan={8} style={{ paddingTop: 0 }}>
                                <div className="edash-field-note">
                                  {plot.payouts.map((payout: any) => (
                                    <div key={payout.id} style={{ marginBottom: 2 }}>
                                      Paid {money(payout.amount)} on {new Date(payout.payment_date).toLocaleDateString()} via {String(payout.payment_method).replaceAll("_", " ")}
                                      {payout.reference_no ? ` (ref ${payout.reference_no})` : ""}
                                      {payout.receipt_document_id && (
                                        <>
                                          {" "}
                                          <button type="button" className="edash-card-link" style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => void download(`/estates/documents/${payout.receipt_document_id}/download`, payout.receipt_filename || "receipt")}>
                                            View receipt
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                          {payoutAllocationId === plot.allocation_id && (
                            <tr>
                              <td colSpan={8}>
                                <div className="edash-info-card" style={{ flexDirection: "column", margin: "6px 0" }}>
                                  <div className="edash-info-card-head"><span className="edash-status-row-title">Pay {plot.plot_number}'s commission</span></div>
                                  <div className="edash-form-row" style={{ marginBottom: 8, alignItems: "flex-end" }}>
                                    <label className="edash-field" style={{ maxWidth: 150 }}>
                                      <span>Amount (NGN)</span>
                                      <input type="number" min="0" step="0.01" value={payoutAmount} onChange={(event) => setPayoutAmount(event.target.value)} />
                                    </label>
                                    <label className="edash-field" style={{ maxWidth: 150 }}>
                                      <span>Date</span>
                                      <input type="date" value={payoutDate} onChange={(event) => setPayoutDate(event.target.value)} />
                                    </label>
                                    <label className="edash-field" style={{ maxWidth: 170 }}>
                                      <span>Method</span>
                                      <select value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value)}>
                                        {PAYMENT_METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                      </select>
                                    </label>
                                    <label className="edash-field" style={{ maxWidth: 150 }}>
                                      <span>Reference (optional)</span>
                                      <input value={payoutReference} onChange={(event) => setPayoutReference(event.target.value)} />
                                    </label>
                                  </div>
                                  <label className="edash-field" style={{ marginBottom: 8 }}>
                                    <span>Receipt / proof of payment (optional)</span>
                                    <input type="file" accept="image/*,.pdf" onChange={(event) => setPayoutReceipt(event.target.files?.[0] || null)} />
                                  </label>
                                  {payoutError && <p className="edash-tab-empty" style={{ padding: "0 0 8px", textAlign: "left" }}>{payoutError}</p>}
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button type="button" className="edash-btn-primary" disabled={payoutBusy || !payoutAmount} onClick={() => void submitPayout()}>
                                      {payoutBusy ? <><Spinner size={13} /> Recording...</> : "Record payment"}
                                    </button>
                                    <button type="button" className="edash-btn-outline" onClick={() => setPayoutAllocationId(null)}>Cancel</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="edash-tab-empty">No plots tagged to this agent yet.</p>}
            </>
          )}
        </EstateModal>
      )}
    </EstateShell>
  );
}
