import { useEffect, useState } from "react";
import { api, extractApiErrorMessage } from "../../api/client";
import { money } from "../../components/estates/FinancialComponents";
import EstateShell from "../../components/estates/EstateShell";
import Spinner from "../../components/estates/EstateSpinner";

export default function EstateCommissionsPage() {
  const [sidebarEstateId, setSidebarEstateId] = useState("");
  const [sidebarEstateName, setSidebarEstateName] = useState("");
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [commissionTiers, setCommissionTiers] = useState<any[]>([]);
  const [commissionTiersUsingDefaults, setCommissionTiersUsingDefaults] = useState(true);
  const [commissionReport, setCommissionReport] = useState<any[]>([]);
  const [commissionTiersBusy, setCommissionTiersBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [agents, setAgents] = useState<Array<{ id: number; subject_type: string; subject_id: string; role: string; is_active: boolean; display_name: string }>>([]);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRole, setNewAgentRole] = useState("sales");
  const [agentBusy, setAgentBusy] = useState(false);

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
      const nameByKey = new Map((namesResponse.data || []).map((item: any) => [`${item.subject_type}::${item.subject_id}`, item.display_name]));
      setAgents((membersResponse.data || []).map((member: any) => ({
        ...member,
        display_name: nameByKey.get(`${member.subject_type}::${member.subject_id}`) || member.subject_id,
      })));
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
      setNewAgentName("");
      await loadAgents(organizationId);
      setMessage(`${newAgentName.trim()} added.`);
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "Agent could not be added."));
    } finally {
      setAgentBusy(false);
    }
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

  return (
    <EstateShell estateId={sidebarEstateId} estateName={sidebarEstateName} activeKey="commissions">
      <p className="edash-status-row-desc" style={{ marginBottom: 16 }}>
        A single-level, volume-tiered commission ladder - the rate an agent earns steps up automatically once their cumulative Allocated (fully paid) sales cross a threshold, applied from the next sale onward. Past commissions never get recalculated when you edit the ladder.
      </p>
      {message && <p className="edash-tab-empty" style={{ padding: "0 0 12px" }}>{message}</p>}

      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Sales agents</h3></div>
          <p className="edash-field-note" style={{ marginBottom: 10 }}>Add anyone who should be selectable as a sales agent when reserving or allocating a plot - they don't need a LandCheck login, just a name to attribute sales and commission to.</p>
          <div className="edash-form-row" style={{ marginBottom: 12, alignItems: "flex-end" }}>
            <label className="edash-field" style={{ maxWidth: 240 }}>
              <span>Name</span>
              <input value={newAgentName} onChange={(event) => setNewAgentName(event.target.value)} placeholder="e.g. Chidinma Okafor" />
            </label>
            <label className="edash-field" style={{ maxWidth: 180 }}>
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
          </div>
          {agents.length ? (
            <div style={{ overflowX: "auto" }}>
              <table className="edash-mini-table">
                <thead><tr><th>Name</th><th>Role</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {agents.map((member) => (
                    <tr key={member.id}>
                      <td>{member.display_name}</td>
                      <td style={{ textTransform: "capitalize" }}>{member.role.replaceAll("_", " ")}</td>
                      <td><span className={`edash-status-pill tone-${member.is_active ? "good" : "neutral"}`}>{member.is_active ? "Active" : "Inactive"}</span></td>
                      <td><button type="button" className="edash-btn-outline" onClick={() => void toggleAgentActive(member)}>{member.is_active ? "Deactivate" : "Reactivate"}</button></td>
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
                <thead><tr><th>Agent</th><th>Sales</th><th>Total volume</th><th>Total commission</th><th>Current tier</th></tr></thead>
                <tbody>
                  {commissionReport.map((agent) => (
                    <tr key={`${agent.subject_type}::${agent.subject_id}`}>
                      <td>{agent.display_name}</td>
                      <td>{agent.sale_count}</td>
                      <td>{money(agent.total_volume)}</td>
                      <td>{money(agent.total_commission)}</td>
                      <td>{agent.current_tier || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="edash-tab-empty">No fully-paid sales tagged with a sales agent yet.</p>}
        </div>
      </div>
    </EstateShell>
  );
}
