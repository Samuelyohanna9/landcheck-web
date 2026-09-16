import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import EstateModal from "../../components/estates/EstateModal";

export default function EstateSettingsPage() {
  const { estateId } = useParams();
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
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [publicSlug, setPublicSlug] = useState("");
  const [publicDescription, setPublicDescription] = useState("");
  const [publicPhone, setPublicPhone] = useState("");
  const [publicShowPrices, setPublicShowPrices] = useState(true);
  const [publicCanPublish, setPublicCanPublish] = useState(false);
  const [publicUrlPath, setPublicUrlPath] = useState<string | null>(null);

  const load = () => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then(async (response) => {
      setEstateDetail(response.data);
      setName(response.data.name || "");
      setLocation(response.data.location_text || "");
      setUnitSystem(response.data.unit_system === "ft" ? "ft" : "m");
      try {
        const rule = (await api.get(`/estates/organizations/${response.data.organization_id}/survey-eligibility`)).data;
        setRuleEnabled(Boolean(rule.is_enabled));
        setRulePercentage(String(rule.percentage || "0"));
      } catch { /* eligibility rule is optional */ }
      try {
        const publicPage = (await api.get(`/estates/${estateId}/public-settings`)).data;
        setPublicEnabled(Boolean(publicPage.public_enabled));
        setPublicSlug(publicPage.public_slug || "");
        setPublicDescription(publicPage.public_description || "");
        setPublicPhone(publicPage.public_contact_phone || "");
        setPublicShowPrices(publicPage.public_show_prices !== false);
        setPublicCanPublish(Boolean(publicPage.can_publish));
        setPublicUrlPath(publicPage.public_url_path || null);
      } catch { /* public showcase is optional until its migration is deployed */ }
    }).catch(() => setEstateDetail(null));
    api.get(`/estates/${estateId}/blocks`).then((response) => setBlocks(response.data || [])).catch(() => setBlocks([]));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };
  useEffect(load, [estateId]);

  const saveEstate = async () => {
    try {
      await api.patch(`/estates/${estateId}`, { name: name.trim(), location_text: location.trim() || null, unit_system: unitSystem });
      toast.success("Estate details saved.");
      load();
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

  const savePublicPage = async () => {
    try {
      const response = await api.patch(`/estates/${estateId}/public-settings`, {
        public_enabled: publicEnabled,
        public_slug: publicSlug.trim().toLowerCase() || null,
        public_description: publicDescription.trim() || null,
        public_contact_phone: publicPhone.trim() || null,
        public_show_prices: publicShowPrices,
      });
      setPublicSlug(response.data.public_slug || "");
      setPublicUrlPath(response.data.public_url_path || null);
      toast.success(publicEnabled ? "Public Estate page published." : "Public Estate page saved.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The public Estate page could not be saved."));
    }
  };

  const addBlock = async () => {
    if (!blockLabel.trim()) return;
    try {
      const response = await api.post(`/estates/${estateId}/blocks`, { label: blockLabel.trim(), name: blockName.trim() || null });
      setBlocks((current) => [...current, response.data]);
      setBlockLabel(""); setBlockName(""); setShowAddBlock(false);
      toast.success("Block added.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Block could not be saved."));
    }
  };

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateDetail?.name} activeKey="settings" recentActivity={activity}>
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
            <div><h3 className="edash-card-title">Public Estate page</h3><p className="edash-status-row-desc" style={{ marginTop: 4 }}>Share a live map of your approved plots so buyers can view availability and request a reservation.</p></div>
            {publicUrlPath && publicEnabled && <a className="edash-card-link" href={publicUrlPath} target="_blank" rel="noreferrer">Open public page</a>}
          </div>
          <label className="edash-toggle" style={{ marginBottom: 12 }}><input type="checkbox" checked={publicEnabled} onChange={(event) => setPublicEnabled(event.target.checked)} /> Publish this Estate page</label>
          {!publicCanPublish && <p className="edash-field-note" style={{ marginBottom: 12 }}>Approve at least one plot on the Estate map before publishing.</p>}
          <div className="edash-public-settings-grid">
            <label className="edash-field"><span>Public web address</span><input value={publicSlug} onChange={(event) => setPublicSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="greenview-estate" /></label>
            <label className="edash-field"><span>Contact phone</span><input value={publicPhone} onChange={(event) => setPublicPhone(event.target.value)} placeholder="Phone for enquiries" /></label>
          </div>
          <label className="edash-field" style={{ margin: "10px 0" }}><span>Short introduction</span><textarea rows={3} value={publicDescription} onChange={(event) => setPublicDescription(event.target.value)} placeholder="A short description buyers should know about this Estate" /></label>
          <label className="edash-toggle" style={{ marginBottom: 14 }}><input type="checkbox" checked={publicShowPrices} onChange={(event) => setPublicShowPrices(event.target.checked)} /> Show plot prices publicly</label>
          <button type="button" className="edash-btn-primary" disabled={publicEnabled && !publicCanPublish} onClick={() => void savePublicPage()}>Save public page</button>
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
            <button type="button" className="edash-tool-btn" onClick={() => setShowAddBlock(true)}>
              <EstateIcon name="plus" /> Add block
            </button>
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
