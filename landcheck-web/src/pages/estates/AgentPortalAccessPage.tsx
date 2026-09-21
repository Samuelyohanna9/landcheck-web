import { useEffect, useMemo, useState } from "react";
import { api, extractApiErrorMessage } from "../../api/client";
import { ProjectMap, type ProjectMapFeature } from "../../components/ProjectMap";
import EstateIcon from "../../components/estates/EstateIcon";
import "../../styles/estate-agent-portal.css";

type EstateMapRecord = {
  id: number;
  name: string;
  public_url?: string | null;
  plots: Array<{ id: number; plot_number: string; status: string; agent_record: boolean; agent_lead?: boolean; agent_sale?: boolean; geometry: Record<string, unknown> | null }>;
  leads: Array<any>;
  sales: Array<any>;
  campaigns: Array<any>;
};

type Workspace = {
  organization: { name: string };
  agent: { name: string; role: string; email?: string | null; phone?: string | null };
  summary: { lead_count: number; sale_count: number; paid_sale_count: number; outstanding: string; commission_due: string };
  leads: Array<any>;
  sales: Array<any>;
  estates: EstateMapRecord[];
};

const money = (value: string | number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value || 0));

async function download(path: string, filename: string) {
  const response = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AgentPortalAccessPage() {
  const { pathname } = window.location;
  const token = pathname.split("/estates/agent-portal/")[1]?.split("/")[0] || "";
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selectedEstateId, setSelectedEstateId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignChannel, setCampaignChannel] = useState("agent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    if (!token) return;
    try {
      setError("");
      const response = await api.get(`/estates/agent-portal/${token}`);
      setWorkspace(response.data);
      setSelectedEstateId((current) => current || response.data.estates?.[0]?.id || null);
    } catch (requestError) {
      setError(await extractApiErrorMessage(requestError, "This workspace link is invalid or expired."));
    }
  };

  useEffect(() => { void load(); }, [token]);

  const selectedEstate = workspace?.estates.find((estate) => estate.id === selectedEstateId) || workspace?.estates[0];
  const mapFeatures = useMemo<ProjectMapFeature[]>(() => (selectedEstate?.plots || []).filter((plot) => plot.geometry).map((plot) => ({
    type: "Feature",
    geometry: plot.geometry as Record<string, unknown>,
    properties: { plot_number: plot.plot_number, commercial_status: plot.status, agent_record: plot.agent_record, agent_lead: plot.agent_lead, agent_sale: plot.agent_sale },
  })), [selectedEstate]);

  const createCampaign = async () => {
    if (!campaignName.trim() || !selectedEstate) return;
    setBusy(true);
    try {
      await api.post(`/estates/agent-portal/${token}/qr-campaigns`, { name: campaignName.trim(), channel: campaignChannel }, { params: { estate_id: selectedEstate.id } });
      setCampaignName("");
      await load();
    } catch (requestError) {
      setError(await extractApiErrorMessage(requestError, "QR campaign could not be created."));
    } finally { setBusy(false); }
  };

  if (error) return <main className="agent-public agent-public-error"><div className="agent-public-error-card"><strong>Workspace unavailable</strong><p>{error}</p></div></main>;
  if (!workspace) return <main className="agent-public agent-public-loading"><div className="agent-public-loading-card">Loading workspace...</div></main>;

  return (
    <main className={`agent-public${menuOpen ? " is-menu-open" : ""}`}>
      <div className="agent-public-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      <aside className="agent-public-sidebar">
        <div className="agent-public-brand"><span className="agent-public-logo"><img src="/logo.svg" alt="LandCheck" /></span><span>Estates</span></div>
        <div className="agent-public-profile"><span className="agent-public-avatar">{workspace.agent.name.slice(0, 1).toUpperCase()}</span><div><strong>{workspace.agent.name}</strong><small>{workspace.agent.role.replaceAll("_", " ")}</small></div></div>
        <nav className="agent-public-nav" aria-label="Agent workspace">
          <a href="#overview" onClick={() => setMenuOpen(false)}><EstateIcon name="grid" />Overview</a>
          <a href="#map" onClick={() => setMenuOpen(false)}><EstateIcon name="map" />Estate map</a>
          <a href="#leads" onClick={() => setMenuOpen(false)}><EstateIcon name="customers" />My leads</a>
          <a href="#sales" onClick={() => setMenuOpen(false)}><EstateIcon name="payments" />Paid records</a>
          <a href="#qr" onClick={() => setMenuOpen(false)}><EstateIcon name="qr" />QR campaigns</a>
        </nav>
      </aside>

      <section className="agent-public-main">
        <header className="agent-public-topbar">
          <button type="button" className="agent-public-menu" onClick={() => setMenuOpen((current) => !current)} aria-label="Toggle menu"><EstateIcon name="menu" /></button>
          <div><span className="agent-public-kicker">{workspace.organization.name}</span><h1>Agent workspace</h1></div>
          <button type="button" className="agent-public-refresh" onClick={() => void load()}><EstateIcon name="activity" />Refresh</button>
        </header>

        <div className="agent-public-content">
          <section id="overview" className="agent-public-heading"><div><span className="agent-public-kicker">Your performance</span><h2>Welcome, {workspace.agent.name}</h2><p>Track your QR enquiries, buyers, payment progress, and commission from one place.</p></div><span className="agent-public-role">{workspace.agent.role.replaceAll("_", " ")}</span></section>

          <section className="agent-public-metrics">
            <article><span className="agent-public-metric-icon tone-info"><EstateIcon name="customers" /></span><small>QR leads</small><strong>{workspace.summary.lead_count}</strong><span>Assigned enquiries</span></article>
            <article><span className="agent-public-metric-icon tone-good"><EstateIcon name="plots" /></span><small>My sales</small><strong>{workspace.summary.sale_count}</strong><span>{workspace.summary.paid_sale_count} fully paid</span></article>
            <article><span className="agent-public-metric-icon tone-warn"><EstateIcon name="payments" /></span><small>Buyer balance</small><strong>{money(workspace.summary.outstanding)}</strong><span>Outstanding</span></article>
            <article><span className="agent-public-metric-icon tone-good"><EstateIcon name="wallet" /></span><small>Commission due</small><strong>{money(workspace.summary.commission_due)}</strong><span>Earned minus paid</span></article>
          </section>

          <section id="map" className="agent-public-card agent-public-map-card"><div className="agent-public-card-head"><div><span className="agent-public-kicker">Estate portfolio</span><h2>Map and plot records</h2><p>Open plots, reservations, and allocations remain visible. Plots chosen by your leads use the highlighted lead colour.</p></div><select value={selectedEstate?.id || ""} onChange={(event) => setSelectedEstateId(Number(event.target.value))}>{workspace.estates.map((estate) => <option key={estate.id} value={estate.id}>{estate.name}</option>)}</select></div>{selectedEstate && mapFeatures.length ? <><ProjectMap points={[]} features={mapFeatures} mode="estate" /><div className="agent-public-map-legend"><span><i className="is-available" />Open / available</span><span><i className="is-reserved" />Reserved</span><span><i className="is-allocated" />Allocated</span><span><i className="is-lead" />My lead</span><span><i className="is-sale" />My sale</span></div></> : <div className="agent-public-empty">No mapped plots are available for this estate yet.</div>}</section>

          <div className="agent-public-columns">
            <section id="leads" className="agent-public-card"><div className="agent-public-card-head"><div><h2>My leads</h2><p>Reservations from your QR codes are assigned automatically.</p></div><span className="agent-public-count">{workspace.leads.length}</span></div>{workspace.leads.length ? <div className="agent-public-list">{workspace.leads.map((lead) => <div className="agent-public-row" key={lead.id}><div><strong>{lead.name}</strong><small>{lead.phone}{lead.email ? ` · ${lead.email}` : ""}</small></div><div><b>{lead.status}</b><small>{lead.estate_name} · {lead.plot ? `Plot ${lead.plot}` : "Plot enquiry"}</small></div></div>)}</div> : <div className="agent-public-empty">No leads assigned yet.</div>}</section>
            <section id="sales" className="agent-public-card"><div className="agent-public-card-head"><div><h2>Buyer payment records</h2><p>Paid records are clearly marked and receipts stay attached to each payment.</p></div><span className="agent-public-count">{workspace.sales.length}</span></div>{workspace.sales.length ? <div className="agent-public-list">{workspace.sales.map((sale) => <div className={`agent-public-row${sale.paid ? " is-paid" : ""}`} key={sale.allocation_id}><div><strong>{sale.customer || "Buyer"}</strong><small>{sale.estate_name} · Plot {sale.plot || "-"}</small></div><div><b>{sale.paid ? "Paid" : money(sale.outstanding)}</b><small>{sale.payments?.length || 0} payment record(s) · {money(sale.commission_due)} commission due</small></div></div>)}</div> : <div className="agent-public-empty">No tagged sales yet.</div>}</section>
          </div>

          <section id="qr" className="agent-public-card"><div className="agent-public-card-head"><div><h2>Create your QR campaigns</h2><p>Use a different QR for WhatsApp, brochures, signs, or each outreach channel so every lead is attributed to you.</p></div><EstateIcon name="qr" /></div><div className="agent-public-campaign-form"><input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="e.g. Samu WhatsApp" /><select value={campaignChannel} onChange={(event) => setCampaignChannel(event.target.value)}><option value="agent">Agent outreach</option><option value="whatsapp">WhatsApp</option><option value="brochure">Brochure</option><option value="entrance_sign">Entrance sign</option></select><button type="button" className="agent-public-primary" disabled={busy || !campaignName.trim() || !selectedEstate} onClick={() => void createCampaign()}>{busy ? "Creating..." : "Create QR campaign"}</button></div>{selectedEstate?.campaigns.length ? <div className="agent-public-list">{selectedEstate.campaigns.map((campaign) => <div className="agent-public-row" key={campaign.id}><div><strong>{campaign.name}</strong><small>{campaign.channel} · {campaign.scan_count} scans</small></div><div className="agent-public-row-actions"><button type="button" onClick={() => void navigator.clipboard?.writeText(campaign.public_url)}>Copy link</button><button type="button" onClick={() => void download(`/estates/agent-portal/${token}/qr-campaigns/${campaign.id}/print.pdf`, `${campaign.code}-qr.pdf`)}>Print QR</button></div></div>)}</div> : <div className="agent-public-empty">Create a campaign for the selected estate.</div>}</section>
        </div>
      </section>
    </main>
  );
}
