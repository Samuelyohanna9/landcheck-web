/* eslint-disable @typescript-eslint/no-explicit-any -- Estate inspection responses share the existing API shapes. */
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../api/client";
import { clearEstateAuthSession, getEstateAuthSession } from "../auth/estateAuth";
import EstateIcon from "../components/estates/EstateIcon";
import EstateModal from "../components/estates/EstateModal";
import MarketingInspectionsTab from "../components/estates/marketing/MarketingInspectionsTab";
import { getEstateQueryScope, invalidateEstateQueries, useEstatePlotsQuery } from "../query/estateQueries";
import "../styles/estate-portal.css";
import "../styles/estate-marketing.css";
import "../styles/estate-agent-workspace.css";

type TabKey = "site" | "live";
type SessionStatus = "requested" | "scheduled" | "live" | "ended" | "cancelled";
type InspectionSession = {
  id: string;
  status: SessionStatus;
  plot_number: string;
  buyer_name: string;
  buyer_phone: string | null;
  agent_member_id: number | null;
  scheduled_at: string | null;
  proposed_times: string[] | null;
  live: { verification: string | null; distance_m: number | null } | null;
};
type Plot = { id: number; plot_number: string };
type Customer = { id: number; name: string };
type Member = { id: number; role: string; subject_id: string };

const STATUS_LABEL: Record<SessionStatus, string> = { requested: "Requested", scheduled: "Scheduled", live: "Live now", ended: "Ended", cancelled: "Cancelled" };
const STATUS_TONE: Record<SessionStatus, string> = { requested: "warn", scheduled: "info", live: "live", ended: "neutral", cancelled: "danger" };

function formatScheduledTime(value: string | null) {
  if (!value) return "No time set";
  return new Date(value).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function datetimeLocalToIso(value: string) {
  return value ? new Date(value).toISOString() : "";
}

export default function AgentEstateInspectionsPage() {
  const session = getEstateAuthSession();
  const navigate = useNavigate();
  const { estateId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") as TabKey | null;
  const tab: TabKey = requestedTab === "live" ? "live" : "site";
  const scope = getEstateQueryScope(session);
  const plotsQuery = useEstatePlotsQuery(scope, estateId);
  const [estateName, setEstateName] = useState("");
  const [published, setPublished] = useState(false);
  const [hasMeetingPoint, setHasMeetingPoint] = useState(false);
  const [liveInspectionsEnabled, setLiveInspectionsEnabled] = useState(true);
  const [sessions, setSessions] = useState<InspectionSession[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [agents, setAgents] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSchedule, setShowSchedule] = useState(false);
  const [plotId, setPlotId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [agentMemberId, setAgentMemberId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [approvingKey, setApprovingKey] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [requestAgent, setRequestAgent] = useState<Record<string, string>>({});

  useEffect(() => {
    const rows = plotsQuery.data?.features || [];
    setPlots(rows.map((feature: any) => ({ id: Number(feature.properties?.id), plot_number: String(feature.properties?.plot_number || "Plot") })));
  }, [plotsQuery.data]);

  const load = useCallback(async () => {
    if (!estateId) return;
    setLoading(true);
    try {
      const detailResponse = await api.get(`/estates/${estateId}`);
      const detail = detailResponse.data || {};
      setEstateName(detail.name || "Property");
      setLiveInspectionsEnabled(Boolean(detail.live_inspections_enabled));
      const [publicResponse, sessionResponse] = await Promise.all([
        api.get(`/estates/${estateId}/public-settings`),
        api.get(`/estates/${estateId}/marketing/live-inspections`),
      ]);
      setPublished(Boolean(publicResponse.data?.public_enabled && publicResponse.data?.public_slug));
      setHasMeetingPoint(Boolean(publicResponse.data?.public_meeting_point));
      setSessions(sessionResponse.data || []);
      if (detail.organization_id) {
        const [customersResponse, membersResponse] = await Promise.all([
          api.get(`/estates/organizations/${detail.organization_id}/customers`, { params: { page: 1, page_size: 100 } }),
          api.get(`/estates/organizations/${detail.organization_id}/members`, { params: { page: 1, page_size: 100 } }),
        ]);
        setCustomers((customersResponse.data?.items || []).map((row: any) => ({ id: row.id, name: row.name })));
        setAgents((membersResponse.data?.items || []).filter((row: any) => row.role === "sales" || row.role === "marketer"));
      }
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Inspection tools could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [estateId]);

  useEffect(() => { void load(); }, [load]);

  if (!session || session.user.workspace_type !== "agent") return <Navigate to="/estates/workspace" replace />;
  if (!estateId || !/^\d+$/.test(estateId)) return <Navigate to="/agents" replace />;

  const canManage = ["owner", "manager"].includes(String(session.user.role_key || "").toLowerCase());
  const selectTab = (next: TabKey) => setSearchParams(next === "site" ? {} : { tab: next }, { replace: true });
  const openSchedule = () => {
    setPlotId(""); setCustomerId(""); setBuyerName(""); setBuyerPhone(""); setBuyerEmail(""); setAgentMemberId(""); setScheduledAt("");
    setShowSchedule(true);
  };

  const schedule = async () => {
    if (!plotId) { toast.error("Choose a plot."); return; }
    if (!customerId && !buyerName.trim()) { toast.error("Pick an existing customer, or enter the buyer's name."); return; }
    if (!scheduledAt) { toast.error("Choose a date and time."); return; }
    setScheduling(true);
    try {
      const response = await api.post(`/estates/${estateId}/marketing/live-inspections`, {
        plot_id: Number(plotId), customer_id: customerId ? Number(customerId) : null,
        buyer_name: customerId ? customers.find((customer) => String(customer.id) === customerId)?.name || buyerName.trim() : buyerName.trim(),
        buyer_phone: buyerPhone.trim() || null, buyer_email: buyerEmail.trim() || null,
        agent_member_id: agentMemberId ? Number(agentMemberId) : null, scheduled_at: datetimeLocalToIso(scheduledAt),
      });
      if (response.data?.buyer_link && navigator.clipboard) await navigator.clipboard.writeText(response.data.buyer_link);
      toast.success(response.data?.invite_email_sent ? "Live inspection scheduled. Buyer link emailed and copied." : "Live inspection scheduled. Buyer link copied.");
      await invalidateEstateQueries(scope, estateId, ["live-inspections", "activity"]);
      setShowSchedule(false);
      await load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The live inspection could not be scheduled."));
    } finally {
      setScheduling(false);
    }
  };

  const approveTime = async (inspection: InspectionSession, isoTime: string) => {
    const assignedAgent = inspection.agent_member_id ? String(inspection.agent_member_id) : requestAgent[inspection.id];
    if (inspection.status === "requested" && !assignedAgent) { toast.error("Choose an agent for this inspection first."); return; }
    setApprovingKey(`${inspection.id}-${isoTime}`);
    try {
      const response = await api.post(`/estates/${estateId}/marketing/live-inspections/${inspection.id}/approve-time`, { scheduled_at: isoTime, agent_member_id: assignedAgent ? Number(assignedAgent) : undefined });
      toast.success(response.data?.customer_notified ? "Time confirmed and buyer notified." : "Time confirmed. Buyer has no email on file.");
      await invalidateEstateQueries(scope, estateId, ["live-inspections", "activity"]);
      await load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The time could not be confirmed."));
    } finally {
      setApprovingKey(null);
    }
  };

  const cancelSession = async (inspection: InspectionSession) => {
    const verb = inspection.status === "live" ? "End" : "Cancel";
    if (!window.confirm(`${verb} the live inspection for Plot ${inspection.plot_number}?`)) return;
    setCancellingId(inspection.id);
    try {
      await api.post(`/estates/${estateId}/marketing/live-inspections/${inspection.id}/cancel`);
      toast.success(`${verb === "End" ? "Live inspection ended" : "Live inspection cancelled"}.`);
      await invalidateEstateQueries(scope, estateId, ["live-inspections", "activity"]);
      await load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The live inspection could not be updated."));
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <main className="estate-agent-workspace agent-property-page agent-inspections-page">
      <aside className="estate-agent-sidebar">
        <Link to={`/agents/properties/${estateId}`} className="estate-agent-brand" aria-label="Back to property workspace"><span className="estate-agent-brand-mark"><img src="/logo-icon-192.png" alt="" /></span><span><strong>LandCheck</strong><small>AGENTS</small></span></Link>
        <div className="estate-agent-account"><span className="estate-agent-avatar">{session.user.full_name?.slice(0, 1).toUpperCase() || "A"}</span><div><strong>{session.user.full_name || "Property agent"}</strong><small>Independent workspace</small></div></div>
        <div className="agent-property-sidebar-context"><span className="edash-section-kicker">Current property</span><strong>{estateName || "Property"}</strong><small>Inspection tools</small></div>
        <nav className="estate-agent-nav" aria-label="Agent inspection workspace"><Link to={`/agents/properties/${estateId}`}><EstateIcon name="grid" />Property overview</Link><a className={tab === "site" ? "is-active" : ""} href="#site-inspections" onClick={() => selectTab("site")}><EstateIcon name="calendar" />Site inspections</a><a className={tab === "live" ? "is-active" : ""} href="#live-inspections" onClick={() => selectTab("live")}><EstateIcon name="video" />Live inspections</a></nav>
        <div className="estate-agent-sidebar-bottom"><Link to={`/agents/properties/${estateId}`}><EstateIcon name="chevron-left" />Back to property</Link><button type="button" onClick={() => { clearEstateAuthSession(); navigate("/agents/login", { replace: true }); }}><EstateIcon name="close" />Sign out</button></div>
      </aside>

      <section className="estate-agent-main">
        <header className="estate-agent-topbar"><Link to={`/agents/properties/${estateId}`} className="agent-detail-mobile-back" aria-label="Back to property"><EstateIcon name="chevron-left" /></Link><div><span className="edash-section-kicker">Agent inspection workspace</span><h1>{estateName || "Property inspections"}</h1></div><div className="estate-agent-top-actions"><button type="button" className="agent-refresh" onClick={() => void load()}><EstateIcon name="refresh" /> Refresh</button>{tab === "live" && liveInspectionsEnabled && <button type="button" className="edash-btn-primary" onClick={openSchedule}><EstateIcon name="plus" /> Schedule live inspection</button>}</div></header>
        <div className="estate-agent-content">
          <section className="estate-agent-welcome agent-property-hero"><div><span className="edash-section-kicker">Show the property with confidence</span><h2>Inspection tools for your buyers.</h2><p>Schedule site visits or guide a remote buyer through a live GPS-verified inspection without leaving the agent workspace.</p></div><div className="agent-property-hero-meta"><span className="agent-property-status"><EstateIcon name="shield" /> Agent workspace</span><small>{loading ? "Refreshing inspection activity..." : `${sessions.length} live inspection record${sessions.length === 1 ? "" : "s"}`}</small></div></section>
          <div className="edash-mk-tabs agent-inspection-tabs" role="tablist" aria-label="Inspection types"><button type="button" role="tab" aria-selected={tab === "site"} className={`edash-mk-tab${tab === "site" ? " is-active" : ""}`} onClick={() => selectTab("site")}>Site visits</button><button type="button" role="tab" aria-selected={tab === "live"} className={`edash-mk-tab${tab === "live" ? " is-active" : ""}`} onClick={() => selectTab("live")}>Live video{sessions.some((inspection) => inspection.status === "requested") && <span className="edash-mk-count">{sessions.filter((inspection) => inspection.status === "requested").length}</span>}</button></div>

          {tab === "site" && <section id="site-inspections" className="agent-property-detail-card"><div className="agent-section-heading"><div><span className="edash-section-kicker">Site inspections</span><h2>Let buyers choose a clear time to visit.</h2><p>Create bookable inspection slots and manage confirmed visitors from this agent workspace.</p></div><EstateIcon name="calendar" /></div><MarketingInspectionsTab estateId={estateId} canManage={canManage} hasMeetingPoint={hasMeetingPoint} published={published} agentMode /></section>}

          {tab === "live" && <section id="live-inspections" className="agent-property-detail-card"><div className="agent-section-heading"><div><span className="edash-section-kicker">Live video inspections</span><h2>Walk a remote buyer through the land.</h2><p>GPS verification helps the buyer see that the agent is on the selected plot while the inspection is live.</p></div><EstateIcon name="video" /></div>{!liveInspectionsEnabled ? <div className="agent-inline-empty">Live inspection access is not available for this workspace yet. Contact LandCheck support if this status looks incorrect.</div> : sessions.length ? <div className="agent-live-session-list">{sessions.map((inspection) => <div className="agent-live-session" key={inspection.id}><div className="agent-live-session-main"><div className="agent-live-session-head"><strong>Plot {inspection.plot_number} - {inspection.buyer_name}</strong><span className={`edash-status-pill tone-${STATUS_TONE[inspection.status]}`}>{STATUS_LABEL[inspection.status]}</span></div><small>{formatScheduledTime(inspection.scheduled_at)}{inspection.buyer_phone ? ` - ${inspection.buyer_phone}` : ""}</small>{inspection.status === "live" && inspection.live?.verification && <small>{inspection.live.verification === "on_plot" ? "Agent is on the plot" : inspection.live.verification === "on_estate" ? "Agent is on the estate" : inspection.live.verification === "near_estate" ? "Agent is near the estate" : "Agent is away from the plot"}{inspection.live.distance_m != null && inspection.live.verification !== "on_plot" ? ` - ${Math.round(inspection.live.distance_m)} m` : ""}</small>}{inspection.status === "scheduled" && <small>Waiting for the agent to go live from their workspace.</small>}{inspection.status === "requested" && <small>The buyer requested this inspection. Confirm one of their proposed times below.</small>}</div>{(inspection.status === "scheduled" || inspection.status === "live") && <button type="button" className="edash-btn-outline" disabled={cancellingId === inspection.id} onClick={() => void cancelSession(inspection)}>{cancellingId === inspection.id ? "..." : inspection.status === "live" ? "End" : "Cancel"}</button>}{inspection.proposed_times?.length ? <div className="agent-live-proposals"><strong>{inspection.status === "requested" ? `${inspection.buyer_name} can do these times:` : "Requested a different time:"}</strong>{inspection.status === "requested" && !inspection.agent_member_id && <label className="edash-field"><span>Assign agent</span><select value={requestAgent[inspection.id] || ""} onChange={(event) => setRequestAgent((current) => ({ ...current, [inspection.id]: event.target.value }))}><option value="">Choose an agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.subject_id}</option>)}</select></label>}<div className="agent-live-proposal-buttons">{inspection.proposed_times.map((time) => <button key={time} type="button" className="edash-btn-outline" disabled={approvingKey === `${inspection.id}-${time}` || (inspection.status === "requested" && !inspection.agent_member_id && !requestAgent[inspection.id])} onClick={() => void approveTime(inspection, time)}>{approvingKey === `${inspection.id}-${time}` ? "..." : `Confirm ${formatScheduledTime(time)}`}</button>)}</div></div> : null}</div>)}</div> : <div className="agent-inline-empty">No live inspections yet. Schedule one here, or let a buyer request one from the public property page.</div>}</section>}
        </div>
      </section>

      {showSchedule && <EstateModal title="Schedule a live inspection" subtitle="The buyer gets a link by email that lights up when the agent goes live on site." onClose={() => setShowSchedule(false)}><label className="edash-field" style={{ marginBottom: 12 }}><span>Plot</span><select value={plotId} onChange={(event) => setPlotId(event.target.value)}><option value="">Choose plot</option>{plots.map((plot) => <option key={plot.id} value={plot.id}>{plot.plot_number}</option>)}</select></label><label className="edash-field" style={{ marginBottom: 12 }}><span>Date and time</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label><label className="edash-field" style={{ marginBottom: 12 }}><span>Existing customer (optional)</span><select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Not an existing customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>{!customerId && <><label className="edash-field" style={{ marginBottom: 12 }}><span>Buyer's full name</span><input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} /></label><label className="edash-field" style={{ marginBottom: 12 }}><span>Buyer's phone (optional)</span><input value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} /></label><label className="edash-field" style={{ marginBottom: 12 }}><span>Buyer's email</span><input type="email" value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} placeholder="Their live inspection link is sent here" /></label></>}<label className="edash-field" style={{ marginBottom: 12 }}><span>Assign an agent (optional)</span><select value={agentMemberId} onChange={(event) => setAgentMemberId(event.target.value)}><option value="">Assign later</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.subject_id}</option>)}</select></label><button type="button" className="edash-btn-primary" disabled={scheduling} onClick={() => void schedule()}>{scheduling ? "Scheduling..." : "Schedule live inspection"}</button></EstateModal>}
    </main>
  );
}
