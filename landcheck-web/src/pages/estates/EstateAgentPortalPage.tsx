import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";

type Workspace = {
  estate: { id: number; name: string };
  agent: { name?: string | null; role: string };
  summary: { lead_count: number; sale_count: number; outstanding: string; commission_earned: string; commission_paid: string; commission_due: string };
  leads: Array<{ id: number; name: string; phone: string; email?: string | null; status: string; plot?: string | null; source_code?: string | null; source_channel?: string | null; created_at: string }>;
  sales: Array<{ allocation_id: number; customer?: string | null; plot?: string | null; status: string; agreed_price: string; confirmed_paid: string; outstanding: string; commission_due: string }>;
  campaigns: Array<{ id: number; name: string; code: string; channel: string; scan_count: number; public_url: string }>;
};

const money = (value: string | number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value || 0));

async function download(path: string, filename: string) {
  const response = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

export default function EstateAgentPortalPage() {
  const { estateId = "" } = useParams();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [estateName, setEstateName] = useState("Estate");
  const [campaignName, setCampaignName] = useState("");
  const [campaignChannel, setCampaignChannel] = useState("agent");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!estateId) return;
    try {
      const [estate, data] = await Promise.all([api.get(`/estates/${estateId}`), api.get("/estates/agent/workspace", { params: { estate_id: estateId } })]);
      setEstateName(estate.data?.name || "Estate"); setWorkspace(data.data);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Agent workspace could not be loaded.")); }
  };
  useEffect(() => { void load(); }, [estateId]);

  const createCampaign = async () => {
    if (!campaignName.trim()) return;
    setBusy(true);
    try {
      await api.post(`/estates/${estateId}/qr-campaigns`, { name: campaignName.trim(), channel: campaignChannel });
      setCampaignName(""); toast.success("QR campaign created."); await load();
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Campaign could not be created.")); } finally { setBusy(false); }
  };

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="agent">
      <div className="edash-page-head"><div><span className="edash-section-kicker">Sales workspace</span><h1>Agent portal</h1><p>Track your leads, buyer payment progress, QR campaigns, and commission due.</p></div><button type="button" className="edash-btn-outline" onClick={() => void load()}><EstateIcon name="activity" /> Refresh</button></div>
      {!workspace ? <div className="edash-card"><div className="edash-card-inner"><p className="edash-tab-empty">Loading agent workspace...</p></div></div> : <>
        <div className="edash-ops-metrics">
          <div className="edash-ops-metric"><span className="edash-ops-metric-icon tone-info"><EstateIcon name="customers" /></span><div><span className="edash-ops-eyebrow">Leads</span><strong>{workspace.summary.lead_count}</strong><small>Public enquiries assigned to you</small></div></div>
          <div className="edash-ops-metric"><span className="edash-ops-metric-icon tone-good"><EstateIcon name="plots" /></span><div><span className="edash-ops-eyebrow">Sales</span><strong>{workspace.summary.sale_count}</strong><small>Reserved or allocated plots</small></div></div>
          <div className="edash-ops-metric"><span className="edash-ops-metric-icon tone-warn"><EstateIcon name="payments" /></span><div><span className="edash-ops-eyebrow">Buyer balance</span><strong>{money(workspace.summary.outstanding)}</strong><small>Outstanding on your sales</small></div></div>
          <div className="edash-ops-metric"><span className="edash-ops-metric-icon tone-good"><EstateIcon name="wallet" /></span><div><span className="edash-ops-eyebrow">Commission due</span><strong>{money(workspace.summary.commission_due)}</strong><small>Earned minus paid out</small></div></div>
        </div>
        <div className="edash-ops-grid">
          <section className="edash-card"><div className="edash-card-inner"><div className="edash-card-head"><div><h2 className="edash-card-title">My leads</h2><p className="edash-ops-card-subtitle">Every enquiry keeps its QR source.</p></div><EstateIcon name="customers" /></div>{workspace.leads.length ? <div className="edash-agent-list">{workspace.leads.map((lead) => <div className="edash-agent-row" key={lead.id}><div><strong>{lead.name}</strong><small>{lead.phone}{lead.email ? ` · ${lead.email}` : ""}</small></div><div><span className="edash-ops-badge tone-info">{lead.status}</span><small>{lead.plot ? `Plot ${lead.plot}` : "Plot enquiry"}{lead.source_code ? ` · ${lead.source_code}` : ""}</small></div></div>)}</div> : <p className="edash-tab-empty">No leads assigned yet.</p>}</div></section>
          <section className="edash-card"><div className="edash-card-inner"><div className="edash-card-head"><div><h2 className="edash-card-title">My sales</h2><p className="edash-ops-card-subtitle">Payment progress before commission payout.</p></div><EstateIcon name="payments" /></div>{workspace.sales.length ? <div className="edash-agent-list">{workspace.sales.map((sale) => <div className="edash-agent-row" key={sale.allocation_id}><div><strong>{sale.customer || "Buyer"}</strong><small>Plot {sale.plot || "-"} · {sale.status}</small></div><div><strong>{money(sale.outstanding)}</strong><small>Balance · {money(sale.commission_due)} commission due</small></div></div>)}</div> : <p className="edash-tab-empty">No tagged sales yet.</p>}</div></section>
        </div>
        <section className="edash-card"><div className="edash-card-inner"><div className="edash-card-head"><div><h2 className="edash-card-title">QR campaigns</h2><p className="edash-ops-card-subtitle">Create separate tags for signs, brochures, WhatsApp, or your own outreach.</p></div><EstateIcon name="map" /></div><div className="edash-agent-campaign-form"><input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Campaign name, e.g. Samu WhatsApp" /><select value={campaignChannel} onChange={(event) => setCampaignChannel(event.target.value)}><option value="agent">Agent</option><option value="entrance_sign">Entrance sign</option><option value="brochure">Brochure</option><option value="whatsapp">WhatsApp</option></select><button type="button" className="edash-btn-primary" disabled={busy || !campaignName.trim()} onClick={() => void createCampaign()}>Create campaign</button></div>{workspace.campaigns.length ? <div className="edash-agent-campaigns">{workspace.campaigns.map((campaign) => <div className="edash-agent-campaign" key={campaign.id}><div><strong>{campaign.name}</strong><small>{campaign.channel} · {campaign.scan_count} scans</small></div><div><button type="button" className="edash-btn-outline" onClick={() => void navigator.clipboard?.writeText(campaign.public_url).then(() => toast.success("Campaign link copied."))}>Copy link</button><button type="button" className="edash-btn-outline" onClick={() => void download(`/estates/qr-campaigns/${campaign.id}/print.pdf`, `${campaign.code}-qr.pdf`)}>Print QR</button></div></div>)}</div> : <p className="edash-tab-empty">Create a campaign to attribute future enquiries.</p>}</div></section>
      </>}
    </EstateShell>
  );
}
