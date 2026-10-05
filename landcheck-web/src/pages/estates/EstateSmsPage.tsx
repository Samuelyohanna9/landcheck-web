import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import EstatePagination from "../../components/estates/EstatePagination";
import { formatLagos } from "../../utils/estateMarketing";
import "../../styles/estate-marketing.css";

const SMS_MAX_CHARS = 320;
const SMS_MAX_RECIPIENTS = 50;
const PAGE_SIZE = 25;
const GSM_CHARS = /^[\x20-\x7E\n\r€^{}\\[~\]|]*$/;

type Customer = { id: number; name: string; reference?: string | null };
type HistoryRow = { id: number; recipient_name?: string | null; subject?: string | null; status: string; created_at: string; details?: Record<string, any> };

function segmentLabel(text: string): string {
  if (!text) return "1 SMS";
  const unicode = !GSM_CHARS.test(text);
  const length = text.length;
  const segments = length <= (unicode ? 70 : 160) ? 1 : Math.ceil(length / (unicode ? 67 : 153));
  return `${segments} SMS${segments === 1 ? "" : " segments"}${unicode ? " · special characters (naira sign etc.) use shorter segments" : ""}`;
}

export default function EstateSmsPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("");
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => {
      setEstateName(response.data?.name || "");
      setOrganizationId(response.data?.organization_id ?? null);
    }).catch(() => undefined);
  }, [estateId]);

  const loadCustomers = useCallback(async () => {
    if (!organizationId) return;
    setLoadingCustomers(true);
    try {
      const response = await api.get(`/estates/organizations/${organizationId}/customers`, { params: { page, page_size: PAGE_SIZE, search: search.trim() || undefined } });
      setCustomers(response.data?.items || []);
      setTotal(Number(response.data?.total || 0));
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Customers could not be loaded."));
    } finally {
      setLoadingCustomers(false);
    }
  }, [organizationId, page, search]);

  const loadHistory = useCallback(async () => {
    if (!estateId) return;
    try {
      const response = await api.get(`/estates/${estateId}/notifications`, { params: { group: "sms", limit: 100 } });
      setHistory((response.data?.items || []).filter((row: HistoryRow & { event_key?: string }) => row.event_key === "manual_sms"));
    } catch {
      setHistory([]);
    }
  }, [estateId]);

  useEffect(() => { void loadCustomers(); }, [loadCustomers]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const toggle = (id: number, on: boolean) => setSelected((current) => (on ? [...current.filter((x) => x !== id), id] : current.filter((x) => x !== id)));
  const pageAllSelected = customers.length > 0 && customers.every((customer) => selected.includes(customer.id));

  const send = async () => {
    if (!estateId || !text.trim() || !selected.length) return;
    setSending(true);
    try {
      const response = await api.post<{ sent: number; failed: number; skipped_no_phone: number }>(`/estates/${estateId}/customers/sms`, { customer_ids: selected, message: text.trim() });
      const { sent, failed, skipped_no_phone: skipped } = response.data;
      const parts = [`${sent} sent`];
      if (failed) parts.push(`${failed} failed`);
      if (skipped) parts.push(`${skipped} skipped (no phone number)`);
      toast.success(parts.join(" · "));
      setText("");
      setSelected([]);
      void loadHistory();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The SMS could not be sent."));
    } finally {
      setSending(false);
    }
  };

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="sms">
      <div className="edash-page-head">
        <div>
          <span className="edash-section-kicker">Customers</span>
          <h1>SMS to customers</h1>
          <p>Send a text message to one or many of your customers. Phone numbers come from each customer's record. SMS is available on the Pro and Enterprise plans.</p>
        </div>
      </div>

      <div className="edash-sms-layout">
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head">
              <h3 className="edash-card-title">1. Choose customers</h3>
              <span className="edash-field-note">{selected.length} selected</span>
            </div>
            <input className="edash-sms-search" value={search} placeholder="Search customers..." onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
            <label className="edash-sms-select-all">
              <input type="checkbox" checked={pageAllSelected} onChange={(event) => setSelected((current) => (event.target.checked ? [...new Set([...current, ...customers.map((c) => c.id)])] : current.filter((id) => !customers.some((c) => c.id === id))))} />
              <span>Select all on this page</span>
            </label>
            {loadingCustomers ? <p className="edash-tab-empty">Loading customers...</p> : customers.length === 0 ? (
              <p className="edash-tab-empty">No customers found.</p>
            ) : (
              <div className="edash-sms-list">
                {customers.map((customer) => (
                  <label key={customer.id} className="edash-sms-row">
                    <input type="checkbox" checked={selected.includes(customer.id)} onChange={(event) => toggle(customer.id, event.target.checked)} />
                    <span className="edash-sms-row-name">{customer.name}</span>
                    {customer.reference && <small>{customer.reference}</small>}
                  </label>
                ))}
              </div>
            )}
            <EstatePagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
          </div>
        </div>

        <div className="edash-sms-side">
          <div className="edash-card">
            <div className="edash-card-inner">
              <div className="edash-card-head">
                <h3 className="edash-card-title">2. Write your SMS</h3>
                {selected.length > 0 && <button type="button" className="edash-card-link" onClick={() => setSelected([])}>Clear selection</button>}
              </div>
              <p className="edash-field-note" style={{ margin: "0 0 8px" }}>
                {selected.length ? `Sending to ${selected.length} customer${selected.length === 1 ? "" : "s"}.` : "Select at least one customer to enable sending."}
              </p>
              <textarea className="edash-sms-text" rows={6} value={text} maxLength={SMS_MAX_CHARS} placeholder="Write your message..." onChange={(event) => setText(event.target.value)} />
              <div className="edash-sms-foot">
                <small>{text.length}/{SMS_MAX_CHARS} characters · {segmentLabel(text)}</small>
                <button type="button" className="edash-btn-primary" disabled={sending || !text.trim() || !selected.length || selected.length > SMS_MAX_RECIPIENTS} onClick={() => void send()}>
                  {sending ? "Sending..." : `Send SMS${selected.length ? ` to ${selected.length}` : ""}`}
                </button>
              </div>
              {selected.length > SMS_MAX_RECIPIENTS && <p className="edash-field-note" style={{ color: "var(--edash-danger)" }}>Send to at most {SMS_MAX_RECIPIENTS} customers at a time.</p>}
            </div>
          </div>

          <div className="edash-card">
            <div className="edash-card-inner">
              <div className="edash-card-head"><h3 className="edash-card-title">Recent SMS</h3></div>
              {history.length === 0 ? (
                <div className="edash-ops-empty"><EstateIcon name="mail" /><strong>No SMS sent yet</strong><span>Messages you send from here appear in this list.</span></div>
              ) : (
                <div className="edash-sms-history">
                  {history.slice(0, 20).map((row) => (
                    <div key={row.id} className="edash-sms-history-row">
                      <div><strong>{row.recipient_name || "Customer"}</strong><small>{row.subject}</small></div>
                      <span className={`edash-ops-badge tone-${row.status === "sent" ? "good" : "warn"}`}>{row.status === "sent" ? "Sent" : "Failed"}</span>
                      <small>{formatLagos(row.created_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </EstateShell>
  );
}
