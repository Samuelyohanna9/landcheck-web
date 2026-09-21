import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import EstateIcon from "../../components/estates/EstateIcon";
import EstateShell from "../../components/estates/EstateShell";
import { api, extractApiErrorMessage } from "../../api/client";

type DeliveryStatus = "all" | "sent" | "failed" | "skipped";
type NotificationRow = {
  id: number;
  event_key: string;
  recipient_email?: string | null;
  recipient_name?: string | null;
  subject?: string | null;
  status: Exclude<DeliveryStatus, "all">;
  error_message?: string | null;
  details?: Record<string, string>;
  sent_at?: string | null;
  created_at: string;
};

const eventLabels: Record<string, string> = {
  reserved: "Reservation confirmation",
  allocated: "Allocation confirmation",
  payment_recorded: "Payment update",
  payment_completed: "Fully-paid update",
  payment_reminder: "Payment reminder",
  reservation_expiring: "Reservation expiry reminder",
  survey_ready: "Survey plan ready",
  land_developed: "Development update",
  staked: "Staking update",
  customer_portal_issued: "Buyer portal link",
};

function eventLabel(value: string) {
  return eventLabels[value] || value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function EstateNotificationLogPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("Estate");
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [counts, setCounts] = useState({ sent: 0, failed: 0, skipped: 0 });
  const [filter, setFilter] = useState<DeliveryStatus>("all");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!estateId) return;
    setBusy(true);
    try {
      const [estateResponse, logResponse] = await Promise.all([
        api.get(`/estates/${estateId}`),
        api.get(`/estates/${estateId}/notifications`, { params: filter === "all" ? {} : { status: filter } }),
      ]);
      setEstateName(estateResponse.data?.name || "Estate");
      setRows(logResponse.data?.items || []);
      setCounts(logResponse.data?.counts || { sent: 0, failed: 0, skipped: 0 });
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Message delivery history could not be loaded."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load(); }, [estateId, filter]);

  if (!estateId) return null;
  const total = counts.sent + counts.failed + counts.skipped;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="notifications">
      <div className="edash-page-head">
        <div>
          <span className="edash-section-kicker">Customer communications</span>
          <h1>Message delivery</h1>
          <p>Confirmation that customer emails were sent, failed, or were skipped because no email address was available.</p>
        </div>
        <button type="button" className="edash-btn-outline" disabled={busy} onClick={() => void load()}><EstateIcon name="activity" /> Refresh</button>
      </div>

      <div className="edash-notification-log-summary">
        <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}><span>All messages</span><strong>{total}</strong></button>
        <button type="button" className={filter === "sent" ? "is-active is-good" : "is-good"} onClick={() => setFilter("sent")}><span>Sent</span><strong>{counts.sent}</strong></button>
        <button type="button" className={filter === "failed" ? "is-active is-danger" : "is-danger"} onClick={() => setFilter("failed")}><span>Failed</span><strong>{counts.failed}</strong></button>
        <button type="button" className={filter === "skipped" ? "is-active is-neutral" : "is-neutral"} onClick={() => setFilter("skipped")}><span>Skipped</span><strong>{counts.skipped}</strong></button>
      </div>

      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <div><h2 className="edash-card-title">Customer email history</h2><p className="edash-ops-card-subtitle">The newest delivery attempts appear first.</p></div>
          </div>
          {rows.length ? (
            <div className="edash-notification-log-list">
              {rows.map((row) => (
                <article className={`edash-notification-log-row status-${row.status}`} key={row.id}>
                  <span className="edash-notification-log-icon"><EstateIcon name={row.status === "sent" ? "check-circle" : row.status === "failed" ? "alert-triangle" : "mail"} /></span>
                  <div className="edash-notification-log-main">
                    <div className="edash-notification-log-head"><strong>{eventLabel(row.event_key)}</strong><span className={`edash-ops-badge tone-${row.status === "sent" ? "good" : row.status === "failed" ? "warn" : "neutral"}`}>{row.status}</span></div>
                    <p>{row.recipient_name || "Customer"} {row.recipient_email ? `· ${row.recipient_email}` : "· No email address"}</p>
                    <small>{row.subject || "Customer notification"} · {new Date(row.created_at).toLocaleString()}</small>
                    {row.error_message && <small className="edash-notification-log-error">Delivery error: {row.error_message}</small>}
                    {row.details?.due_at && <small>Scheduled due date: {new Date(row.details.due_at).toLocaleDateString()}</small>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="edash-ops-empty"><EstateIcon name="mail" /><strong>No messages in this view</strong><span>Customer reservation, payment and milestone emails will appear here after they are attempted.</span></div>
          )}
        </div>
      </div>
    </EstateShell>
  );
}
