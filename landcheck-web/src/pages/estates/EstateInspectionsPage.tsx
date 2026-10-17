import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import { getEstateAuthSession } from "../../auth/estateAuth";
import EstateShell from "../../components/estates/EstateShell";
import EstateModal from "../../components/estates/EstateModal";
import EstateRibbon, { type EstateRibbonTab } from "../../components/estates/EstateRibbon";
import MarketingInspectionsTab from "../../components/estates/marketing/MarketingInspectionsTab";

type TabKey = "site" | "live";

type Session = {
  id: string;
  status: "requested" | "scheduled" | "live" | "ended" | "cancelled";
  estate_name: string;
  plot_number: string;
  buyer_name: string;
  buyer_phone: string | null;
  agent_member_id: number | null;
  scheduled_at: string | null;
  proposed_times: string[] | null;
  reschedule_requested_at: string | null;
  live: { verification: string | null; distance_m: number | null; updated_at: string | null } | null;
  started_at: string | null;
  ended_at: string | null;
};

function formatScheduledTime(value: string | null): string {
  if (!value) return "No time set";
  return new Date(value).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// datetime-local gives "2026-10-20T14:30" in the browser's own local time, with no timezone -
// the backend (Pydantic datetime) needs an explicit offset or it's ambiguous, so stamp the
// browser's own offset on before sending.
function datetimeLocalToIso(value: string): string {
  if (!value) return "";
  return new Date(value).toISOString();
}

type Plot = { id: number; plot_number: string };
type Customer = { id: number; name: string };
type Member = { id: number; role: string; subject_id: string };

const STATUS_LABEL: Record<Session["status"], string> = { requested: "Requested", scheduled: "Scheduled", live: "Live now", ended: "Ended", cancelled: "Cancelled" };
const STATUS_TONE: Record<Session["status"], string> = { requested: "warn", scheduled: "info", live: "live", ended: "neutral", cancelled: "danger" };

export default function EstateInspectionsPage() {
  const { estateId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab") as TabKey | null;
  const tab: TabKey = requested === "live" ? "live" : "site";
  const selectTab = (key: TabKey) => setSearchParams(key === "site" ? {} : { tab: key }, { replace: true });

  const session = getEstateAuthSession();
  const role = String(session?.user.role_key || "").toLowerCase();
  const canManage = role === "owner" || role === "manager";

  const [estateName, setEstateName] = useState("");
  const [published, setPublished] = useState(false);
  const [hasMeetingPoint, setHasMeetingPoint] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [agents, setAgents] = useState<Member[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
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
  const [requestAgent, setRequestAgent] = useState<Record<string, string>>({});

  const load = () => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => {
      setEstateName(response.data.name);
      void api.get(`/estates/organizations/${response.data.organization_id}/customers`, { params: { page: 1, page_size: 100 } })
        .then((customersResponse) => setCustomers((customersResponse.data?.items || []).map((row: any) => ({ id: row.id, name: row.name }))))
        .catch(() => setCustomers([]));
      void api.get(`/estates/organizations/${response.data.organization_id}/members`, { params: { page: 1, page_size: 100 } })
        .then((membersResponse) => setAgents((membersResponse.data?.items || []).filter((row: any) => row.role === "sales" || row.role === "marketer")))
        .catch(() => setAgents([]));
    }).catch(() => undefined);
    api.get(`/estates/${estateId}/public-settings`).then((response) => {
      setPublished(Boolean(response.data.public_enabled && response.data.public_slug));
      setHasMeetingPoint(Boolean(response.data.public_meeting_point));
    }).catch(() => undefined);
    api.get(`/estates/${estateId}/plots.geojson`).then((response) => setPlots((response.data?.features || []).map((feature: any) => ({ id: feature.properties.id, plot_number: feature.properties.plot_number })))).catch(() => setPlots([]));
    api.get(`/estates/${estateId}/marketing/live-inspections`).then((response) => setSessions(response.data || [])).catch(() => setSessions([]));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };
  useEffect(load, [estateId]);

  const openSchedule = () => {
    setPlotId(""); setCustomerId(""); setBuyerName(""); setBuyerPhone(""); setBuyerEmail(""); setAgentMemberId(""); setScheduledAt("");
    setShowSchedule(true);
  };

  const approveTime = async (session: Session, isoTime: string, agentIdOverride?: string) => {
    if (!estateId) return;
    const agentChoice = agentIdOverride ?? requestAgent[session.id];
    if (session.status === "requested" && !agentChoice) { toast.error("Choose an agent for this plot visit first."); return; }
    setApprovingKey(`${session.id}-${isoTime}`);
    try {
      const response = await api.post(`/estates/${estateId}/marketing/live-inspections/${session.id}/approve-time`, {
        scheduled_at: isoTime,
        agent_member_id: agentChoice ? Number(agentChoice) : undefined,
      });
      const customerNote = response.data.customer_notified ? "the buyer was emailed the confirmed time" : "the buyer has no email on file, so wasn't notified directly";
      const agentNote = response.data.agent_notified ? " and the agent was emailed what to do" : "";
      toast.success(`Time confirmed - ${customerNote}${agentNote}.`);
      load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The time could not be confirmed."));
    } finally {
      setApprovingKey(null);
    }
  };

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const cancelSession = async (session: Session) => {
    const verb = session.status === "live" ? "End" : "Cancel";
    if (!estateId || !window.confirm(`${verb} the live inspection for Plot ${session.plot_number}?`)) return;
    setCancellingId(session.id);
    try {
      await api.post(`/estates/${estateId}/marketing/live-inspections/${session.id}/cancel`);
      toast.success(`${verb === "End" ? "Ended" : "Cancelled"}.`);
      load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, `The live inspection could not be ${verb === "End" ? "ended" : "cancelled"}.`));
    } finally {
      setCancellingId(null);
    }
  };

  const schedule = async () => {
    if (!estateId || !plotId) { toast.error("Choose a plot."); return; }
    if (!customerId && !buyerName.trim()) { toast.error("Pick an existing customer, or enter the buyer's name."); return; }
    if (!scheduledAt) { toast.error("Choose a date and time."); return; }
    setScheduling(true);
    try {
      const response = await api.post(`/estates/${estateId}/marketing/live-inspections`, {
        plot_id: Number(plotId),
        customer_id: customerId ? Number(customerId) : null,
        buyer_name: customerId ? customers.find((c) => String(c.id) === customerId)?.name || buyerName.trim() : buyerName.trim(),
        buyer_phone: buyerPhone.trim() || null,
        buyer_email: buyerEmail.trim() || null,
        agent_member_id: agentMemberId ? Number(agentMemberId) : null,
        scheduled_at: datetimeLocalToIso(scheduledAt),
      });
      if (response.data.buyer_link && navigator.clipboard) await navigator.clipboard.writeText(response.data.buyer_link);
      const buyerNote = response.data.invite_email_sent ? "the buyer's link was emailed and copied" : "the buyer's link was copied (no email on file to send it to)";
      const agentNote = agentMemberId ? (response.data.agent_notified ? " and the agent was emailed what to do next" : " (the agent has no email on file, so they weren't notified - share the plot and buyer details with them directly)") : "";
      toast.success(`Live inspection scheduled - ${buyerNote}${agentNote}.`);
      setShowSchedule(false);
      load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The live inspection could not be scheduled."));
    } finally {
      setScheduling(false);
    }
  };

  if (!estateId) return null;

  const ribbonTabs: EstateRibbonTab[] = [
    {
      key: "home",
      label: "Home",
      groups: [
        { key: "create", label: "Create", buttons: tab === "live" ? [{ key: "schedule", label: "Schedule Live Inspection", icon: "video", onClick: openSchedule }] : [] },
        { key: "data", label: "Data", buttons: [{ key: "refresh", label: "Refresh", icon: "refresh", onClick: load }] },
      ],
    },
  ];

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="inspections" recentActivity={activity}>
      <EstateRibbon tabs={ribbonTabs} />
      <div className="edash-mk-tabs" role="tablist" aria-label="Inspection types" style={{ marginBottom: 16 }}>
        <button type="button" role="tab" aria-selected={tab === "site"} className={`edash-mk-tab${tab === "site" ? " is-active" : ""}`} onClick={() => selectTab("site")}>Site visits</button>
        <button type="button" role="tab" aria-selected={tab === "live"} className={`edash-mk-tab${tab === "live" ? " is-active" : ""}`} onClick={() => selectTab("live")}>
          Live video{sessions.some((s) => s.status === "requested") && <span className="edash-mk-count">{sessions.filter((s) => s.status === "requested").length}</span>}
        </button>
      </div>

      {tab === "site" && <MarketingInspectionsTab estateId={estateId} canManage={canManage} hasMeetingPoint={hasMeetingPoint} published={published} />}

      {tab === "live" && (
        <>
          <p className="edash-status-row-desc" style={{ marginBottom: 16 }}>
            An agent visits the plot in person and opens a live video call. While live, their GPS position is checked against the
            plot's real boundary every few seconds, so a remote buyer can see - live - whether the agent is actually standing on
            the land being sold. Buyers can also request one themselves from the public page when they can't visit in person.
          </p>
          <div className="edash-card">
            <div className="edash-card-inner">
              <div className="edash-card-head"><h3 className="edash-card-title">Live inspections ({sessions.length})</h3></div>
              {sessions.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sessions.map((liveSession) => (
                    <div key={liveSession.id}>
                      <div className="edash-info-card" style={{ margin: 0 }}>
                        <div className="edash-info-card-body">
                          <div className="edash-info-card-head">
                            <span className="edash-status-row-title">Plot {liveSession.plot_number} - {liveSession.buyer_name}</span>
                            <span className={`edash-status-pill tone-${STATUS_TONE[liveSession.status]}`}>{STATUS_LABEL[liveSession.status]}</span>
                          </div>
                          <p className="edash-status-row-desc">{formatScheduledTime(liveSession.scheduled_at)}{liveSession.buyer_phone ? ` · ${liveSession.buyer_phone}` : ""}</p>
                          {liveSession.status === "live" && liveSession.live?.verification && (
                            <p className="edash-status-row-desc">
                              {liveSession.live.verification === "on_plot" ? "Agent is on the plot" : liveSession.live.verification === "on_estate" ? "Agent is on the estate" : liveSession.live.verification === "near_estate" ? "Agent is near the estate" : "Agent is away from the plot"}
                              {liveSession.live.distance_m != null && liveSession.live.verification !== "on_plot" ? ` - ${Math.round(liveSession.live.distance_m)} m` : ""}
                            </p>
                          )}
                          {liveSession.status === "scheduled" && <p className="edash-status-row-desc">Waiting for the agent to go live from their workspace.</p>}
                          {liveSession.status === "requested" && <p className="edash-status-row-desc">The buyer requested this themselves - assign an agent and confirm one of their times below.</p>}
                        </div>
                        {(liveSession.status === "scheduled" || liveSession.status === "live") && (
                          <button
                            type="button"
                            className="edash-btn-outline"
                            style={{ flexShrink: 0 }}
                            disabled={cancellingId === liveSession.id}
                            onClick={() => void cancelSession(liveSession)}
                          >
                            {cancellingId === liveSession.id ? "..." : liveSession.status === "live" ? "End" : "Cancel"}
                          </button>
                        )}
                      </div>
                      {liveSession.proposed_times && liveSession.proposed_times.length > 0 && (
                        <div className={`edash-banner tone-warn`} style={{ margin: "6px 0 0" }}>
                          <strong>{liveSession.status === "requested" ? `${liveSession.buyer_name} can do these times:` : `${liveSession.buyer_name} asked for a different time:`}</strong>
                          {liveSession.status === "requested" && !liveSession.agent_member_id && (
                            <label className="edash-field" style={{ marginTop: 8, maxWidth: 240 }}>
                              <span>Assign agent</span>
                              <select value={requestAgent[liveSession.id] || ""} onChange={(event) => setRequestAgent((current) => ({ ...current, [liveSession.id]: event.target.value }))}>
                                <option value="">Choose an agent</option>
                                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.subject_id}</option>)}
                              </select>
                            </label>
                          )}
                          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                            {liveSession.proposed_times.map((time) => (
                              <button
                                key={time}
                                type="button"
                                className="edash-btn-outline"
                                disabled={approvingKey === `${liveSession.id}-${time}` || (liveSession.status === "requested" && !liveSession.agent_member_id && !requestAgent[liveSession.id])}
                                onClick={() => void approveTime(liveSession, time)}
                              >
                                {approvingKey === `${liveSession.id}-${time}` ? "..." : `Confirm ${formatScheduledTime(time)}`}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : <p className="edash-tab-empty">No live inspections yet. Use "Schedule Live Inspection" above, or a buyer can request one from the public page.</p>}
            </div>
          </div>
        </>
      )}

      {showSchedule && (
        <EstateModal title="Schedule a live inspection" subtitle="The buyer gets a link by email that lights up automatically once the agent goes live on site." onClose={() => setShowSchedule(false)}>
          <label className="edash-field" style={{ marginBottom: 12 }}>
            <span>Plot</span>
            <select value={plotId} onChange={(event) => setPlotId(event.target.value)}>
              <option value="">Choose plot</option>
              {plots.map((plot) => <option key={plot.id} value={plot.id}>{plot.plot_number}</option>)}
            </select>
          </label>
          <label className="edash-field" style={{ marginBottom: 12 }}>
            <span>Date and time</span>
            <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
          </label>
          <label className="edash-field" style={{ marginBottom: 12 }}>
            <span>Existing customer (optional)</span>
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Not an existing customer</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          {!customerId && (
            <>
              <label className="edash-field" style={{ marginBottom: 12 }}><span>Buyer's full name</span><input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} /></label>
              <label className="edash-field" style={{ marginBottom: 12 }}><span>Buyer's phone (optional)</span><input value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} /></label>
              <label className="edash-field" style={{ marginBottom: 12 }}><span>Buyer's email</span><input type="email" value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} placeholder="Their live inspection link is sent here" /></label>
            </>
          )}
          <label className="edash-field" style={{ marginBottom: 12 }}>
            <span>Assign an agent (optional)</span>
            <select value={agentMemberId} onChange={(event) => setAgentMemberId(event.target.value)}>
              <option value="">Assign later</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.subject_id}</option>)}
            </select>
          </label>
          <button type="button" className="edash-btn-primary" disabled={scheduling} onClick={() => void schedule()}>
            {scheduling ? "Scheduling..." : "Schedule live inspection"}
          </button>
        </EstateModal>
      )}
    </EstateShell>
  );
}
