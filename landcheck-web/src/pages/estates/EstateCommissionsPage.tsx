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

  useEffect(() => {
    api.get("/estates").then((response) => {
      const first = (response.data || [])[0];
      if (first) {
        setSidebarEstateId(String(first.id));
        setSidebarEstateName(first.name);
        if (first.organization_id) {
          setOrganizationId(first.organization_id);
          void loadCommissionData(first.organization_id);
        }
      }
    }).catch(() => undefined);
  }, []);

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
