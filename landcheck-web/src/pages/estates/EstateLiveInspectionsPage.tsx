import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateModal from "../../components/estates/EstateModal";
import EstateRibbon, { type EstateRibbonTab } from "../../components/estates/EstateRibbon";

type Session = {
  id: string;
  status: "scheduled" | "live" | "ended" | "cancelled";
  estate_name: string;
  plot_number: string;
  buyer_name: string;
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

const STATUS_LABEL: Record<Session["status"], string> = { scheduled: "Scheduled", live: "Live now", ended: "Ended", cancelled: "Cancelled" };
const STATUS_TONE: Record<Session["status"], string> = { scheduled: "info", live: "live", ended: "neutral", cancelled: "danger" };

export default function EstateLiveInspectionsPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("");
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
  const [approvingId, setApprovingId] = useState<string | null>(null);

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
    api.get(`/estates/${estateId}/plots.geojson`).then((response) => setPlots((response.data?.features || []).map((feature: any) => ({ id: feature.properties.id, plot_number: feature.properties.plot_number })))).catch(() => setPlots([]));
    api.get(`/estates/${estateId}/marketing/live-inspections`).then((response) => setSessions(response.data || [])).catch(() => setSessions([]));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };
  useEffect(load, [estateId]);

  const openSchedule = () => {
    setPlotId(""); setCustomerId(""); setBuyerName(""); setBuyerPhone(""); setBuyerEmail(""); setAgentMemberId(""); setScheduledAt("");
    setShowSchedule(true);
  };

  const approveTime = async (session: Session, isoTime: string) => {
    if (!estateId) return;
    setApprovingId(session.id);
    try {
      const response = await api.post(`/estates/${estateId}/marketing/live-inspections/${session.id}/approve-time`, { scheduled_at: isoTime });
      const customerNote = response.data.customer_notified ? "the buyer was emailed the confirmed time" : "the buyer has no email on file, so wasn't notified directly";
      const agentNote = response.data.agent_notified ? " and the agent was emailed the change" : "";
      toast.success(`Time approved - ${customerNote}${agentNote}.`);
      load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The time could not be approved."));
    } finally {
      setApprovingId(null);
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
        { key: "create", label: "Create", buttons: [{ key: "schedule", label: "Schedule Live Inspection", icon: "video", onClick: openSchedule }] },
        { key: "data", label: "Data", buttons: [{ key: "refresh", label: "Refresh", icon: "refresh", onClick: load }] },
      ],
    },
  ];

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="live_inspections" recentActivity={activity}>
      <EstateRibbon tabs={ribbonTabs} />
      <p className="edash-status-row-desc" style={{ marginBottom: 16 }}>
        An agent visits the plot in person and opens a live video call. While live, their GPS position is checked against the
        plot's real boundary every few seconds, so a remote buyer can see - live - whether the agent is actually standing on
        the land being sold. Built for buyers who can't travel to inspect in person.
      </p>
      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Live inspections ({sessions.length})</h3></div>
          {sessions.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sessions.map((session) => (
                <div key={session.id}>
                  <div className="edash-info-card" style={{ margin: 0 }}>
                    <div className="edash-info-card-body">
                      <div className="edash-info-card-head">
                        <span className="edash-status-row-title">Plot {session.plot_number} - {session.buyer_name}</span>
                        <span className={`edash-status-pill tone-${STATUS_TONE[session.status]}`}>{STATUS_LABEL[session.status]}</span>
                      </div>
                      <p className="edash-status-row-desc">{formatScheduledTime(session.scheduled_at)}</p>
                      {session.status === "live" && session.live?.verification && (
                        <p className="edash-status-row-desc">
                          {session.live.verification === "on_plot" ? "Agent is on the plot" : session.live.verification === "on_estate" ? "Agent is on the estate" : session.live.verification === "near_estate" ? "Agent is near the estate" : "Agent is away from the plot"}
                          {session.live.distance_m != null && session.live.verification !== "on_plot" ? ` - ${Math.round(session.live.distance_m)} m` : ""}
                        </p>
                      )}
                      {session.status === "scheduled" && <p className="edash-status-row-desc">Waiting for the agent to go live from their workspace.</p>}
                    </div>
                    {(session.status === "scheduled" || session.status === "live") && (
                      <button
                        type="button"
                        className="edash-btn-outline"
                        style={{ flexShrink: 0 }}
                        disabled={cancellingId === session.id}
                        onClick={() => void cancelSession(session)}
                      >
                        {cancellingId === session.id ? "..." : session.status === "live" ? "End" : "Cancel"}
                      </button>
                    )}
                  </div>
                  {session.proposed_times && session.proposed_times.length > 0 && (
                    <div className="edash-banner tone-warn" style={{ margin: "6px 0 0" }}>
                      <strong>{session.buyer_name} asked for a different time:</strong>
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        {session.proposed_times.map((time) => (
                          <button
                            key={time}
                            type="button"
                            className="edash-btn-outline"
                            disabled={approvingId === session.id}
                            onClick={() => void approveTime(session, time)}
                          >
                            {approvingId === session.id ? "..." : `Approve ${formatScheduledTime(time)}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : <p className="edash-tab-empty">No live inspections scheduled yet. Use "Schedule Live Inspection" above.</p>}
        </div>
      </div>

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
