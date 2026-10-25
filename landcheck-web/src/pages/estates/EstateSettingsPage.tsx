import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateModal from "../../components/estates/EstateModal";
import EstateRibbon, { type EstateRibbonTab } from "../../components/estates/EstateRibbon";
import { getEstateAuthSession } from "../../auth/estateAuth";
import { getEstateQueryScope, invalidateEstateQueries, useEstateActivityQuery, useEstateBlocksQuery, useEstateDetailQuery } from "../../query/estateQueries";

export default function EstateSettingsPage() {
  const { estateId } = useParams();
  const navigate = useNavigate();
  const estateQueryScope = getEstateQueryScope(getEstateAuthSession());
  const detailQuery = useEstateDetailQuery(estateQueryScope, estateId);
  const blocksQuery = useEstateBlocksQuery(estateQueryScope, estateId);
  const activityQuery = useEstateActivityQuery(estateQueryScope, estateId);
  const [estateDetail, setEstateDetail] = useState<any>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [unitSystem, setUnitSystem] = useState<"m" | "ft">("m");
  const [blocks, setBlocks] = useState<Array<{ id: number; label: string; name?: string }>>([]);
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [blockLabel, setBlockLabel] = useState("");
  const [blockName, setBlockName] = useState("");
  const [ruleEnabled, setRuleEnabled] = useState(false);
  const [rulePercentage, setRulePercentage] = useState("0");
  const [activity, setActivity] = useState<any[]>([]);

  useEffect(() => {
    const detail = detailQuery.data;
    if (detail) {
      setEstateDetail(detail);
      setName(detail.name || "");
      setLocation(detail.location_text || "");
      setUnitSystem(detail.unit_system === "ft" ? "ft" : "m");
    } else if (detailQuery.isError) {
      setEstateDetail(null);
    }
  }, [detailQuery.data, detailQuery.isError]);

  useEffect(() => {
    if (blocksQuery.data) setBlocks(blocksQuery.data || []);
    else if (blocksQuery.isError) setBlocks([]);
    if (activityQuery.data) setActivity(activityQuery.data || []);
    else if (activityQuery.isError) setActivity([]);
  }, [blocksQuery.data, blocksQuery.isError, activityQuery.data, activityQuery.isError]);

  useEffect(() => {
    const organizationId = detailQuery.data?.organization_id;
    if (!organizationId) return;
    api.get(`/estates/organizations/${organizationId}/survey-eligibility`)
      .then((response) => {
        setRuleEnabled(Boolean(response.data?.is_enabled));
        setRulePercentage(String(response.data?.percentage || "0"));
      })
      .catch(() => undefined);
  }, [detailQuery.data?.organization_id]);

  const saveEstate = async () => {
    if (!estateId) return;
    try {
      await api.patch(`/estates/${estateId}`, { name: name.trim(), location_text: location.trim() || null, unit_system: unitSystem });
      await invalidateEstateQueries(estateQueryScope, estateId, ["detail", "activity", "public-settings"]);
      toast.success("Estate details saved.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Estate details could not be saved."));
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
      toast.success("Survey eligibility rule saved.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Survey eligibility could not be saved."));
    }
  };

  const addBlock = async () => {
    if (!estateId || !blockLabel.trim()) return;
    try {
      const response = await api.post(`/estates/${estateId}/blocks`, { label: blockLabel.trim(), name: blockName.trim() || null });
      setBlocks((current) => [...current, response.data]);
      setBlockLabel(""); setBlockName(""); setShowAddBlock(false);
      await invalidateEstateQueries(estateQueryScope, estateId, ["blocks", "activity"]);
      toast.success("Block added.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Block could not be saved."));
    }
  };

  if (!estateId) return null;

  const ribbonTabs: EstateRibbonTab[] = [
    {
      key: "home",
      label: "Home",
      groups: [
        { key: "create", label: "Create", buttons: [{ key: "add-block", label: "Add Block", icon: "plus", onClick: () => setShowAddBlock(true) }] },
        {
          key: "navigate",
          label: "Navigate",
          buttons: [
            { key: "billing", label: "Billing", icon: "wallet", onClick: () => navigate("/estates/billing") },
            { key: "legal", label: "Legal", icon: "shield", onClick: () => navigate("/estates/legal") },
            { key: "public-site", label: "Public Website", icon: "globe", onClick: () => navigate(`/estates/${estateId}/public-site`) },
          ],
        },
      ],
    },
  ];

  return (
    <EstateShell
      estateId={estateId}
      estateName={estateDetail?.name}
      activeKey="settings"
      recentActivity={activity}
      onEstateNameChange={(value) => { setName(value); setEstateDetail((current: any) => current ? { ...current, name: value } : current); }}
    >
      <EstateRibbon tabs={ribbonTabs} />
      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <h3 className="edash-card-title">Billing &amp; plan</h3>
            <Link className="edash-card-link" to="/estates/billing">Manage billing</Link>
          </div>
          <p className="edash-status-row-desc">View your current plan, trial or renewal date, payment method and billing history, or upgrade to Plus for flood and erosion hazard analysis.</p>
        </div>
      </div>
      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <h3 className="edash-card-title">Legal &amp; compliance</h3>
            <Link className="edash-card-link" to="/estates/legal">Review the Data Processing Agreement</Link>
          </div>
          <p className="edash-status-row-desc">The agreement covering how LandCheck handles your customers' and staff's personal data. Company owners can review and accept it.</p>
        </div>
      </div>
      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <h3 className="edash-card-title">Public website</h3>
            <Link className="edash-card-link" to={`/estates/${estateId}/public-site`}>Open public website settings</Link>
          </div>
          <p className="edash-status-row-desc">The live map, branding, contact details, site inspection meeting point, payment plan, and development outlook buyers see on this Estate's public page - and the switch to publish it.</p>
        </div>
      </div>
      <div className="edash-content-row edash-content-row--split">
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Estate details</h3></div>
            <label className="edash-field" style={{ marginBottom: 10 }}><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="edash-field" style={{ marginBottom: 10 }}><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
            <div className="edash-field" style={{ marginBottom: 10 }}><span>Coordinate system</span><strong style={{ color: "var(--edash-ink)" }}>{estateDetail?.crs || "EPSG:4326"}</strong></div>
            <label className="edash-field" style={{ marginBottom: 12, maxWidth: 220 }}>
              <span>Measurement units</span>
              <select value={unitSystem} onChange={(event) => setUnitSystem(event.target.value === "ft" ? "ft" : "m")}>
                <option value="m">Meters (m, m²)</option>
                <option value="ft">Feet (ft, ft²)</option>
              </select>
            </label>
            <button type="button" className="edash-btn-primary" onClick={() => void saveEstate()}>Save estate details</button>
          </div>
        </div>

        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Survey eligibility</h3></div>
            <p className="edash-status-row-desc" style={{ marginBottom: 10 }}>Prepare Survey once the selected percentage of the agreed price has been confirmed. Set 0% to allow preparation immediately.</p>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <input type="checkbox" checked={ruleEnabled} onChange={(event) => setRuleEnabled(event.target.checked)} /> Enforce this rule
            </label>
            <label className="edash-field" style={{ marginBottom: 12, maxWidth: 220 }}>
              <span>Minimum confirmed payment (%)</span>
              <input type="number" min="0" max="100" step="1" value={rulePercentage} onChange={(event) => setRulePercentage(event.target.value)} />
            </label>
            <button type="button" className="edash-btn-primary" onClick={() => void saveRule()}>Save rule</button>
          </div>
        </div>
      </div>

      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <h3 className="edash-card-title">Blocks</h3>
          </div>
          <div className="edash-chip-row">
            {blocks.length ? blocks.map((block) => <span key={block.id} className="edash-chip">{block.label}{block.name ? ` - ${block.name}` : ""}</span>) : <p className="edash-tab-empty" style={{ padding: 0 }}>No blocks yet.</p>}
          </div>
        </div>
      </div>

      {showAddBlock && (
        <EstateModal title="Add block" subtitle="Define block labels before assigning imported or manually created plots." onClose={() => setShowAddBlock(false)}>
          <label className="edash-field" style={{ marginBottom: 12 }}><span>Block label</span><input value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} placeholder="e.g. B" autoFocus /></label>
          <label className="edash-field" style={{ marginBottom: 12 }}><span>Block name</span><input value={blockName} onChange={(event) => setBlockName(event.target.value)} placeholder="Optional" /></label>
          <button type="button" className="edash-btn-primary" onClick={() => void addBlock()}>Add block</button>
        </EstateModal>
      )}
    </EstateShell>
  );
}
