import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";

export default function EstateSettingsPage() {
  const { estateId } = useParams();
  const [estateDetail, setEstateDetail] = useState<any>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [blocks, setBlocks] = useState<Array<{ id: number; label: string; name?: string }>>([]);
  const [blockLabel, setBlockLabel] = useState("");
  const [blockName, setBlockName] = useState("");
  const [ruleEnabled, setRuleEnabled] = useState(false);
  const [rulePercentage, setRulePercentage] = useState("0");
  const [activity, setActivity] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  const load = () => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then(async (response) => {
      setEstateDetail(response.data);
      setName(response.data.name || "");
      setLocation(response.data.location_text || "");
      try {
        const rule = (await api.get(`/estates/organizations/${response.data.organization_id}/survey-eligibility`)).data;
        setRuleEnabled(Boolean(rule.is_enabled));
        setRulePercentage(String(rule.percentage || "0"));
      } catch { /* eligibility rule is optional */ }
    }).catch(() => setEstateDetail(null));
    api.get(`/estates/${estateId}/blocks`).then((response) => setBlocks(response.data || [])).catch(() => setBlocks([]));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };
  useEffect(load, [estateId]);

  const saveEstate = async () => {
    try {
      await api.patch(`/estates/${estateId}`, { name: name.trim(), location_text: location.trim() || null });
      setMessage("Estate details saved.");
      load();
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "Estate details could not be saved."));
    }
  };

  const saveRule = async () => {
    if (!estateDetail) return;
    try {
      await api.put(`/estates/organizations/${estateDetail.organization_id}/survey-eligibility`, {
        is_enabled: ruleEnabled,
        percentage: Number(rulePercentage || 0),
        description: "Minimum confirmed payment percentage before Survey preparation",
      });
      setMessage("Survey eligibility rule saved.");
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "Survey eligibility could not be saved."));
    }
  };

  const addBlock = async () => {
    if (!blockLabel.trim()) return;
    try {
      const response = await api.post(`/estates/${estateId}/blocks`, { label: blockLabel.trim(), name: blockName.trim() || null });
      setBlocks((current) => [...current, response.data]);
      setBlockLabel(""); setBlockName("");
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "Block could not be saved."));
    }
  };

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateDetail?.name} activeKey="settings" recentActivity={activity}>
      {message && <p className="edash-tab-empty" style={{ textAlign: "left", padding: "4px 2px" }}>{message}</p>}
      <div className="edash-content-row edash-content-row--split">
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Estate details</h3></div>
            <label className="edash-overview-field" style={{ marginBottom: 8 }}><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)" }} /></label>
            <label className="edash-overview-field" style={{ marginBottom: 8 }}><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)" }} /></label>
            <div className="edash-overview-field" style={{ marginBottom: 8 }}><span>Coordinate system</span><strong>{estateDetail?.crs || "EPSG:4326"}</strong></div>
            <button type="button" className="edash-btn-primary" onClick={() => void saveEstate()}>Save estate details</button>
          </div>
        </div>

        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Survey eligibility</h3></div>
            <p className="edash-status-row-desc" style={{ marginBottom: 8 }}>Prepare Survey once the selected percentage of the agreed price has been confirmed. Set 0% to allow preparation immediately.</p>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <input type="checkbox" checked={ruleEnabled} onChange={(event) => setRuleEnabled(event.target.checked)} /> Enforce this rule
            </label>
            <label className="edash-overview-field" style={{ marginBottom: 8 }}>
              <span>Minimum confirmed payment (%)</span>
              <input type="number" min="0" max="100" step="1" value={rulePercentage} onChange={(event) => setRulePercentage(event.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)" }} />
            </label>
            <button type="button" className="edash-btn-primary" onClick={() => void saveRule()}>Save rule</button>
          </div>
        </div>
      </div>

      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Blocks</h3></div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} placeholder="Block label, e.g. B" style={{ padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)" }} />
            <input value={blockName} onChange={(event) => setBlockName(event.target.value)} placeholder="Block name (optional)" style={{ padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)" }} />
            <button type="button" className="edash-btn-outline" onClick={() => void addBlock()}>Add block</button>
          </div>
          <p className="edash-status-row-desc">{blocks.map((block) => `${block.label}${block.name ? ` - ${block.name}` : ""}`).join(" · ") || "No blocks yet."}</p>
        </div>
      </div>
    </EstateShell>
  );
}
