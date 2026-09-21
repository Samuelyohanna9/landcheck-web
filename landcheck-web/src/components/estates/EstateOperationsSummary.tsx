import { useState } from "react";
import { Link } from "react-router-dom";
import { useEffect } from "react";
import { api } from "../../api/client";
import EstateIcon, { type EstateIconName } from "./EstateIcon";

type PlotRecord = {
  id: number | string;
  plot_number?: string | null;
  area_sqm?: number | string | null;
  commercial_status?: string | null;
};

type AllocationRecord = {
  id: number | string;
  plot_id: number | string;
  customer_name?: string | null;
  agreed_price?: number | string | null;
  outstanding?: number | string | null;
};

type SurveyRecord = {
  status?: string | null;
  plot_id?: number | string | null;
  plot?: { id?: number | string | null } | null;
  survey_reference?: string | null;
};

type StakingRecord = { status?: string | null; plot_id?: number | string | null };
type PaymentRecord = { status?: string | null; amount?: number | string | null; allocation_id?: number | string | null };
type DocumentRecord = { entity_type?: string | null; entity_id?: number | string | null };
type CustomerRecord = { id: number | string };
type DashboardRecord = {
  total_plots?: number;
  geometry_issues?: number;
  survey_completed?: number;
  statuses?: { allocated?: number; reserved?: number };
  financial?: { contracted_sales_value?: number | string | null; outstanding_balance?: number | string | null };
};
type PublicSettingsRecord = { public_enabled?: boolean };

type OperationsSummaryProps = {
  estateId: string;
  dashboard: DashboardRecord | null;
  plots: PlotRecord[];
  allocations: AllocationRecord[];
  customers: CustomerRecord[];
  surveyRequests: SurveyRecord[];
  stakingTasks: StakingRecord[];
  payments: PaymentRecord[];
  documents: DocumentRecord[];
  publicSettings: PublicSettingsRecord | null;
};

type ActionItem = {
  key: string;
  title: string;
  detail: string;
  count: number;
  tone: "warn" | "danger" | "info" | "good";
  icon: EstateIconName;
  href: string;
};

const moneyFormatter = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

function formatMoney(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? moneyFormatter.format(amount) : "NGN 0";
}

function humanize(value: unknown) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isCompleted(value: unknown) {
  return ["approved", "completed", "complete", "done", "converted", "confirmed"].includes(String(value || "").toLowerCase());
}

function passportStatus(value: boolean, pending = false) {
  if (value) return { label: "Ready", tone: "good" };
  if (pending) return { label: "In progress", tone: "info" };
  return { label: "Needs action", tone: "warn" };
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`edash-ops-badge tone-${tone}`}>{label}</span>;
}

function Metric({ label, value, detail, tone = "neutral" }: { label: string; value: string | number; detail: string; tone?: string }) {
  return (
    <div className="edash-ops-metric">
      <span className={`edash-ops-metric-icon tone-${tone}`}><EstateIcon name={tone === "warn" ? "alert-triangle" : tone === "good" ? "check-circle" : "activity"} /></span>
      <div>
        <span className="edash-ops-eyebrow">{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

export default function EstateOperationsSummary({
  estateId,
  dashboard,
  plots,
  allocations,
  customers,
  surveyRequests,
  stakingTasks,
  payments,
  documents,
  publicSettings,
}: OperationsSummaryProps) {
  const [passportPlotId, setPassportPlotId] = useState<string>("");
  const [qrCampaigns, setQrCampaigns] = useState<any[]>([]);
  const [qrCampaignName, setQrCampaignName] = useState("");
  const [qrChannel, setQrChannel] = useState("entrance_sign");
  const [qrBusy, setQrBusy] = useState(false);
  const [operationsSummary, setOperationsSummary] = useState<{ total_exceptions: number; actions: Array<{ key: string; label: string; count: number; href: string; tone: string }> } | null>(null);
  useEffect(() => {
    let mounted = true;
    api.get(`/estates/${estateId}/operations-summary`).then((response) => { if (mounted) setOperationsSummary(response.data); }).catch(() => { if (mounted) setOperationsSummary(null); });
    return () => { mounted = false; };
  }, [estateId]);
  useEffect(() => {
    let mounted = true;
    api.get(`/estates/${estateId}/qr-campaigns`).then((response) => { if (mounted) setQrCampaigns(response.data || []); }).catch(() => { if (mounted) setQrCampaigns([]); });
    return () => { mounted = false; };
  }, [estateId]);
  const allocatedCount = Number(dashboard?.statuses?.allocated || 0);
  const reservedCount = Number(dashboard?.statuses?.reserved || 0);
  const pendingPayments = payments.filter((item) => ["recorded", "pending_confirmation"].includes(String(item.status || "")));
  const pendingSurveys = surveyRequests.filter((item) => !isCompleted(item.status) && String(item.status || "") !== "cancelled");
  const pendingStaking = stakingTasks.filter((item) => !isCompleted(item.status) && String(item.status || "") !== "cancelled");
  const estatePlotIds = new Set(plots.map((plot) => String(plot.id)));
  const estateAllocationIds = new Set(allocations.map((allocation) => String(allocation.id)));
  const estateCustomerIds = new Set(customers.map((customer) => String(customer.id)));
  const estateDocuments = documents.filter((item) => {
    if (item.entity_type === "estate") return String(item.entity_id) === String(estateId);
    if (item.entity_type === "plot") return estatePlotIds.has(String(item.entity_id));
    if (item.entity_type === "allocation") return estateAllocationIds.has(String(item.entity_id));
    if (item.entity_type === "customer") return estateCustomerIds.has(String(item.entity_id));
    return false;
  });
  const allocationsWithoutDocuments = allocations.filter((allocation) => !estateDocuments.some((item) => item.entity_type === "allocation" && String(item.entity_id) === String(allocation.id)));
  const passportPlots = (() => {
    const rows = [...plots].sort((a, b) => String(a.plot_number || "").localeCompare(String(b.plot_number || ""), undefined, { numeric: true }));
    return rows;
  })();
  const activePassportPlotId = passportPlotId || String(passportPlots[0]?.id || "");
  const passportPlot = passportPlots.find((plot) => String(plot.id) === activePassportPlotId);
  const passportAllocation = allocations.find((allocation) => String(allocation.plot_id) === activePassportPlotId);
  const passportSurvey = surveyRequests.find((item) => String(item.plot?.id || item.plot_id) === activePassportPlotId);
  const passportStaking = stakingTasks.find((item) => String(item.plot_id) === activePassportPlotId);
  const passportDocuments = estateDocuments.filter((item) => (
    (item.entity_type === "plot" && String(item.entity_id) === activePassportPlotId)
    || (passportAllocation && item.entity_type === "allocation" && String(item.entity_id) === String(passportAllocation.id))
  ));
  const passportPayments = payments.filter((item) => passportAllocation && String(item.allocation_id) === String(passportAllocation.id));
  const passportConfirmedPaid = passportPayments.filter((item) => item.status === "confirmed").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const passportAgreedPrice = Number(passportAllocation?.agreed_price || 0);
  const passportPaymentReady = passportAllocation ? (passportAgreedPrice > 0 && passportConfirmedPaid >= passportAgreedPrice) : false;
  const passportSurveyReady = Boolean(passportSurvey && isCompleted(passportSurvey.status));
  const passportStakingReady = Boolean(passportStaking && isCompleted(passportStaking.status));
  const passportDocumentReady = passportDocuments.length > 0;

  const serverActionItems: ActionItem[] = (operationsSummary?.actions || []).map((item) => {
    const icon: EstateIconName = item.key.includes("payment") || item.key.includes("commission") ? "payments" : item.key.includes("document") ? "documents" : item.key.includes("survey") ? "survey" : item.key.includes("stak") ? "staking" : item.key.includes("reservation") ? "customers" : "map";
    return { key: item.key, title: item.label, detail: "Exception detected in the Estate operations workflow.", count: item.count, tone: item.tone as ActionItem["tone"], icon, href: item.href };
  });
  const actionItems: ActionItem[] = (() => {
    const items: ActionItem[] = [];
    if (Number(dashboard?.geometry_issues || 0) > 0) items.push({ key: "geometry", title: "Resolve map quality issues", detail: "Some plot boundaries need review before publishing.", count: Number(dashboard?.geometry_issues || 0), tone: "danger", icon: "map", href: `/estates/${estateId}/map` });
    if (pendingPayments.length) items.push({ key: "payments", title: "Confirm incoming payments", detail: "Recorded payments are waiting for finance review.", count: pendingPayments.length, tone: "warn", icon: "payments", href: `/estates/payments?estate_id=${estateId}` });
    if (pendingSurveys.length) items.push({ key: "survey", title: "Move survey requests forward", detail: "Allocated plots still need survey preparation or completion.", count: pendingSurveys.length, tone: "info", icon: "survey", href: `/estates/${estateId}/survey` });
    if (pendingStaking.length) items.push({ key: "staking", title: "Complete staking work", detail: "Survey-ready plots still need field staking evidence.", count: pendingStaking.length, tone: "info", icon: "staking", href: `/estates/${estateId}/staking` });
    if (allocationsWithoutDocuments.length) items.push({ key: "documents", title: "Complete buyer document packs", detail: "Reserved or allocated buyers have no linked document yet.", count: allocationsWithoutDocuments.length, tone: "warn", icon: "documents", href: "/estates/documents" });
    if (!publicSettings?.public_enabled) items.push({ key: "public", title: "Publish the public plot page", detail: "Give buyers a trusted map and enquiry entry point.", count: 1, tone: "good", icon: "map", href: `/estates/${estateId}/settings` });
    if (operationsSummary) {
      const localContext = items.filter((item) => item.key === "geometry" || item.key === "public");
      return [...serverActionItems, ...localContext.filter((item) => !serverActionItems.some((serverItem) => serverItem.key === item.key))].slice(0, 8);
    }
    return items.slice(0, 6);
  })();

  const createQrCampaign = async () => {
    if (!qrCampaignName.trim()) return;
    setQrBusy(true);
    try {
      const response = await api.post(`/estates/${estateId}/qr-campaigns`, { name: qrCampaignName.trim(), channel: qrChannel });
      setQrCampaigns((current) => [response.data, ...current]);
      setQrCampaignName("");
    } finally {
      setQrBusy(false);
    }
  };

  const downloadQr = async (campaign: any) => {
    const response = await api.get(`/estates/qr-campaigns/${campaign.id}/print.pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data as Blob);
    const link = document.createElement("a"); link.href = url; link.download = `${campaign.code}-qr.pdf`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <section className="edash-ops" aria-labelledby="estate-operations-title">
      <div className="edash-ops-heading">
        <div>
          <span className="edash-section-kicker">Estate operations</span>
          <h2 id="estate-operations-title">Control room</h2>
          <p>See what needs attention, prove what is ready, and move each plot from enquiry to verified handover.</p>
        </div>
        <div className="edash-ops-heading-actions">
          <Link className="edash-btn-outline" to={`/estates/${estateId}/reports`}><EstateIcon name="reports" /> Reports</Link>
          <Link className="edash-btn-primary" to={`/estates/${estateId}/map`}><EstateIcon name="map" /> Open map</Link>
        </div>
      </div>

      <div className="edash-ops-metrics">
        <Metric label="Open actions" value={operationsSummary?.total_exceptions ?? actionItems.length} detail="Across this Estate" tone={actionItems.length ? "warn" : "good"} />
        <Metric label="Sales pipeline" value={formatMoney(dashboard?.financial?.contracted_sales_value)} detail={`${allocatedCount + reservedCount} reserved or allocated`} tone="info" />
        <Metric label="Outstanding" value={formatMoney(dashboard?.financial?.outstanding_balance)} detail="Customer balances to follow up" tone="warn" />
        <Metric label="Buyer records" value={customers.length} detail={`${estateDocuments.length} linked documents`} tone="good" />
      </div>

      <article className="edash-card edash-dashboard-qr-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><div><h3 className="edash-card-title">Company QR campaigns</h3><p className="edash-ops-card-subtitle">Create tracked company links for signs, brochures, WhatsApp, or general enquiries.</p></div><EstateIcon name="qr" /></div>
          <div className="edash-dashboard-qr-form"><input value={qrCampaignName} onChange={(event) => setQrCampaignName(event.target.value)} placeholder="Campaign name, e.g. Main entrance" /><select value={qrChannel} onChange={(event) => setQrChannel(event.target.value)}><option value="entrance_sign">Entrance sign</option><option value="brochure">Brochure</option><option value="whatsapp">WhatsApp</option><option value="company">Company page</option></select><button type="button" className="edash-btn-primary" disabled={qrBusy || !qrCampaignName.trim()} onClick={() => void createQrCampaign()}>{qrBusy ? "Creating..." : "Create QR"}</button></div>
          {qrCampaigns.length ? <div className="edash-dashboard-qr-list">{qrCampaigns.slice(0, 4).map((campaign) => <div className="edash-dashboard-qr-row" key={campaign.id}><div><strong>{campaign.name}</strong><small>{campaign.channel} · {campaign.scan_count} scans</small></div><div><button type="button" className="edash-btn-outline" onClick={() => void navigator.clipboard?.writeText(campaign.public_url)}>Copy link</button><button type="button" className="edash-btn-outline" onClick={() => void downloadQr(campaign)}>Print QR</button></div></div>)}</div> : <p className="edash-tab-empty">No QR campaigns yet.</p>}
        </div>
      </article>

      <div className="edash-ops-grid">
        <article className="edash-card edash-ops-actions-card">
          <div className="edash-card-inner">
            <div className="edash-card-head">
              <div><h3 className="edash-card-title">What needs attention</h3><p className="edash-ops-card-subtitle">Prioritised work for the Estate team.</p></div>
              <span className={`edash-ops-count${actionItems.length ? " is-active" : ""}`}>{actionItems.length}</span>
            </div>
            {actionItems.length ? (
              <div className="edash-ops-action-list">
                {actionItems.map((item) => (
                  <Link to={item.href} className="edash-ops-action" key={item.key}>
                    <span className={`edash-ops-action-icon tone-${item.tone}`}><EstateIcon name={item.icon} /></span>
                    <span className="edash-ops-action-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                    <span className={`edash-ops-action-number tone-${item.tone}`}>{item.count}</span>
                  </Link>
                ))}
              </div>
            ) : <div className="edash-ops-empty"><EstateIcon name="check-circle" /><strong>Everything is on track</strong><span>No open operational exceptions were found.</span></div>}
          </div>
        </article>

        <article className="edash-card edash-ops-readiness-card">
          <div className="edash-card-inner">
            <div className="edash-card-head"><div><h3 className="edash-card-title">Sales and trust readiness</h3><p className="edash-ops-card-subtitle">The signals that make a buyer confident.</p></div><EstateIcon name="shield" /></div>
            <div className="edash-ops-readiness-row"><span><strong>{pendingPayments.length}</strong> payments to confirm</span><Link to={`/estates/payments?estate_id=${estateId}`}>Review</Link></div>
            <div className="edash-ops-readiness-row"><span><strong>{allocationsWithoutDocuments.length}</strong> buyer packs incomplete</span><Link to="/estates/documents">Open vault</Link></div>
            <div className="edash-ops-readiness-row"><span><strong>{publicSettings?.public_enabled ? "Live" : "Off"}</strong> public plot page</span><Link to={`/estates/${estateId}/settings`}>{publicSettings?.public_enabled ? "Manage" : "Publish"}</Link></div>
            <div className="edash-ops-readiness-row"><span><strong>{Number(dashboard?.survey_completed || 0)}</strong> surveys completed</span><Link to={`/estates/${estateId}/survey`}>View queue</Link></div>
            <div className="edash-ops-trust-note"><EstateIcon name="shield" /><span>Use the plot passport below when a buyer asks, "What exactly is ready for my plot?"</span></div>
          </div>
        </article>
      </div>

      <article className="edash-card edash-passport-card">
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <div><span className="edash-section-kicker">Buyer and staff handover</span><h3 className="edash-card-title">Plot transaction passport</h3><p className="edash-ops-card-subtitle">One operational record for identity, money, documents, survey, staking, and audit readiness.</p></div>
            <Link className="edash-card-link" to={`/estates/${estateId}/plots`}>View all plots</Link>
          </div>
          {passportPlots.length ? (
            <>
              <div className="edash-passport-toolbar">
                <label className="edash-field"><span>Choose a plot</span><select value={activePassportPlotId} onChange={(event) => setPassportPlotId(event.target.value)}>{passportPlots.map((plot) => <option key={plot.id} value={plot.id}>{plot.plot_number}</option>)}</select></label>
                <div className="edash-passport-identity"><span>Current status</span><strong>{humanize(passportPlot?.commercial_status || "available")}</strong><small>{passportPlot?.area_sqm ? `${Number(passportPlot.area_sqm).toLocaleString()} m2 mapped` : "Boundary area not set"}</small></div>
                <Link className="edash-btn-outline" to={`/estates/${estateId}/map?plot=${activePassportPlotId}`}>Open plot</Link>
              </div>
              <div className="edash-passport-grid">
                <div className="edash-passport-step"><span className="edash-passport-step-icon"><EstateIcon name="customers" /></span><div><span>Customer</span><strong>{passportAllocation?.customer_name || "Not allocated"}</strong><small>{passportAllocation ? "Linked to allocation" : "Available for sale"}</small></div><StatusBadge label={passportAllocation ? "Linked" : "Open"} tone={passportAllocation ? "good" : "neutral"} /></div>
                <div className="edash-passport-step"><span className="edash-passport-step-icon"><EstateIcon name="payments" /></span><div><span>Payment</span><strong>{passportAllocation ? formatMoney(passportAllocation.outstanding) : "No sale yet"}</strong><small>{passportAllocation ? `${formatMoney(passportConfirmedPaid)} confirmed` : "No balance"}</small></div><StatusBadge label={passportPaymentReady ? "Paid" : passportAllocation ? "Follow up" : "Not started"} tone={passportPaymentReady ? "good" : passportAllocation ? "warn" : "neutral"} /></div>
                <div className="edash-passport-step"><span className="edash-passport-step-icon"><EstateIcon name="survey" /></span><div><span>Survey</span><strong>{passportSurvey ? humanize(passportSurvey.status) : "Not prepared"}</strong><small>{passportSurvey?.survey_reference || "Official survey workflow"}</small></div><StatusBadge {...passportStatus(passportSurveyReady, Boolean(passportSurvey))} /></div>
                <div className="edash-passport-step"><span className="edash-passport-step-icon"><EstateIcon name="staking" /></span><div><span>Staking</span><strong>{passportStaking ? humanize(passportStaking.status) : "Not started"}</strong><small>{passportStaking ? "Field task linked" : "Set out after survey"}</small></div><StatusBadge {...passportStatus(passportStakingReady, Boolean(passportStaking))} /></div>
                <div className="edash-passport-step"><span className="edash-passport-step-icon"><EstateIcon name="documents" /></span><div><span>Documents</span><strong>{passportDocuments.length ? `${passportDocuments.length} linked` : "No linked pack"}</strong><small>Evidence and handover records</small></div><StatusBadge {...passportStatus(passportDocumentReady)} /></div>
                <div className="edash-passport-step"><span className="edash-passport-step-icon"><EstateIcon name="audit" /></span><div><span>Audit trail</span><strong>Recorded in timeline</strong><small>Every change is traceable</small></div><Link className="edash-card-link" to={`/estates/${estateId}/timeline`}>Open</Link></div>
              </div>
            </>
          ) : <div className="edash-ops-empty"><EstateIcon name="plots" /><strong>Add plots to create transaction passports</strong><span>Once plots exist, staff can track the full buyer journey from this dashboard.</span></div>}
        </div>
      </article>

      <div className="edash-ops-links">
        <Link to={`/estates/${estateId}/customers`}><EstateIcon name="customers" /><span><strong>Customer workspace</strong><small>Statements, contacts, and buyer history</small></span><b>&rsaquo;</b></Link>
        <Link to={`/estates/${estateId}/development`}><EstateIcon name="development" /><span><strong>Development milestones</strong><small>Track site-cleared to developed</small></span><b>&rsaquo;</b></Link>
        <Link to={`/estates/${estateId}/hazards`}><EstateIcon name="hazard" /><span><strong>Risk and site screening</strong><small>Flood, erosion, and geometry checks</small></span><b>&rsaquo;</b></Link>
        <Link to={`/estates/${estateId}/timeline`}><EstateIcon name="audit" /><span><strong>Accountability timeline</strong><small>Who changed what and when</small></span><b>&rsaquo;</b></Link>
      </div>
    </section>
  );
}
