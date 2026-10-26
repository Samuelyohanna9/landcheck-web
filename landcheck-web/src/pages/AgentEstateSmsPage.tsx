import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../api/client";
import { clearEstateAuthSession, getEstateAuthSession } from "../auth/estateAuth";
import EstateIcon from "../components/estates/EstateIcon";
import EstatePagination from "../components/estates/EstatePagination";
import { formatLagos } from "../utils/estateMarketing";
import "../styles/estate-portal.css";
import "../styles/estate-marketing.css";
import "../styles/estate-agent-workspace.css";

const SMS_MAX_CHARS = 320;
const SMS_MAX_RECIPIENTS = 50;
const PAGE_SIZE = 25;
const GSM_CHARS = /^[\x20-\x7E\n\r\u20AC^{}\\[~\]|]*$/;

type Customer = { id: number; name: string; reference?: string | null };
type HistoryRow = { id: number; recipient_name?: string | null; subject?: string | null; status: string; created_at: string };

function segmentLabel(text: string) {
  if (!text) return "1 SMS";
  const unicode = !GSM_CHARS.test(text);
  const length = text.length;
  const segments = length <= (unicode ? 70 : 160) ? 1 : Math.ceil(length / (unicode ? 67 : 153));
  return `${segments} SMS${segments === 1 ? "" : " segments"}${unicode ? " - special characters use shorter segments" : ""}`;
}

export default function AgentEstateSmsPage() {
  const session = getEstateAuthSession();
  const navigate = useNavigate();
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
      setEstateName(response.data?.name || "Property");
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

  if (!session) return <Navigate to="/agents/login" replace />;
  if (session.user.workspace_type !== "agent") return <Navigate to="/agents" replace />;
  if (!estateId || !/^\d+$/.test(estateId)) return <Navigate to="/agents" replace />;

  const toggle = (id: number, selectedNow: boolean) => setSelected((current) => selectedNow ? [...current.filter((value) => value !== id), id] : current.filter((value) => value !== id));
  const pageAllSelected = customers.length > 0 && customers.every((customer) => selected.includes(customer.id));
  const send = async () => {
    if (!text.trim() || !selected.length) return;
    setSending(true);
    try {
      const response = await api.post<{ sent: number; failed: number; skipped_no_phone: number }>(`/estates/${estateId}/customers/sms`, { customer_ids: selected, message: text.trim() });
      const parts = [`${response.data.sent} sent`];
      if (response.data.failed) parts.push(`${response.data.failed} failed`);
      if (response.data.skipped_no_phone) parts.push(`${response.data.skipped_no_phone} skipped (no phone number)`);
      toast.success(parts.join(" - "));
      setText("");
      setSelected([]);
      void loadHistory();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The SMS could not be sent."));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="estate-agent-workspace agent-property-page agent-sms-page">
      <aside className="estate-agent-sidebar">
        <Link to={`/agents/properties/${estateId}`} className="estate-agent-brand" aria-label="Back to property workspace"><span className="estate-agent-brand-mark"><img src="/logo-icon-192.png" alt="" /></span><span><strong>LandCheck</strong><small>AGENTS</small></span></Link>
        <div className="estate-agent-account"><span className="estate-agent-avatar">{session.user.full_name?.slice(0, 1).toUpperCase() || "A"}</span><div><strong>{session.user.full_name || "Property agent"}</strong><small>Independent workspace</small></div></div>
        <div className="agent-property-sidebar-context"><span className="edash-section-kicker">Current property</span><strong>{estateName || "Property"}</strong><small>Buyer follow-up</small></div>
        <nav className="estate-agent-nav" aria-label="Agent messaging workspace"><Link to={`/agents/properties/${estateId}`}><EstateIcon name="grid" />Property overview</Link><Link to={`/agents/properties/${estateId}/inspections?tab=site`}><EstateIcon name="calendar" />Inspections</Link><a className="is-active" href="#message"><EstateIcon name="phone" />Buyer SMS</a></nav>
        <div className="estate-agent-sidebar-bottom"><Link to={`/agents/properties/${estateId}`}><EstateIcon name="chevron-left" />Back to property</Link><button type="button" onClick={() => { clearEstateAuthSession(); navigate("/agents/login", { replace: true }); }}><EstateIcon name="close" />Sign out</button></div>
      </aside>

      <section className="estate-agent-main">
        <header className="estate-agent-topbar"><Link to={`/agents/properties/${estateId}`} className="agent-detail-mobile-back" aria-label="Back to property"><EstateIcon name="chevron-left" /></Link><div><span className="edash-section-kicker">Agent messaging workspace</span><h1>{estateName || "Buyer SMS"}</h1></div><div className="estate-agent-top-actions"><button type="button" className="agent-refresh" onClick={() => { void loadCustomers(); void loadHistory(); }}><EstateIcon name="refresh" /> Refresh</button></div></header>
        <div className="estate-agent-content">
          <section className="estate-agent-welcome agent-property-hero"><div><span className="edash-section-kicker">Buyer follow-up</span><h2>Keep interested buyers moving.</h2><p>Send a clear update to one or more buyers from this property workspace. Company administration stays out of the agent view.</p></div><div className="agent-property-hero-meta"><span className="agent-property-status"><EstateIcon name="phone" /> Agent workspace</span><small>{selected.length} recipient{selected.length === 1 ? "" : "s"} selected</small></div></section>
          <div id="message" className="edash-sms-layout agent-workspace-section"><div className="edash-card"><div className="edash-card-inner"><div className="edash-card-head"><h3 className="edash-card-title">1. Choose buyers</h3><span className="edash-field-note">{selected.length} selected</span></div><input className="edash-sms-search" value={search} placeholder="Search customers..." onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><label className="edash-sms-select-all"><input type="checkbox" checked={pageAllSelected} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, ...customers.map((customer) => customer.id)])] : current.filter((id) => !customers.some((customer) => customer.id === id)))} /><span>Select all on this page</span></label>{loadingCustomers ? <p className="edash-tab-empty">Loading customers...</p> : customers.length === 0 ? <p className="edash-tab-empty">No customers found.</p> : <div className="edash-sms-list">{customers.map((customer) => <label key={customer.id} className="edash-sms-row"><input type="checkbox" checked={selected.includes(customer.id)} onChange={(event) => toggle(customer.id, event.target.checked)} /><span className="edash-sms-row-name">{customer.name}</span>{customer.reference && <small>{customer.reference}</small>}</label>)}</div>}<EstatePagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} /></div></div><div className="edash-sms-side"><div className="edash-card"><div className="edash-card-inner"><div className="edash-card-head"><h3 className="edash-card-title">2. Write your SMS</h3>{selected.length > 0 && <button type="button" className="edash-card-link" onClick={() => setSelected([])}>Clear selection</button>}</div><p className="edash-field-note" style={{ margin: "0 0 8px" }}>{selected.length ? `Sending to ${selected.length} customer${selected.length === 1 ? "" : "s"}.` : "Select at least one customer to enable sending."}</p><textarea className="edash-sms-text" rows={6} value={text} maxLength={SMS_MAX_CHARS} placeholder="Write your message..." onChange={(event) => setText(event.target.value)} /><div className="edash-sms-foot"><small>{text.length}/{SMS_MAX_CHARS} characters - {segmentLabel(text)}</small><button type="button" className="edash-btn-primary" disabled={sending || !text.trim() || !selected.length || selected.length > SMS_MAX_RECIPIENTS} onClick={() => void send()}>{sending ? "Sending..." : `Send SMS${selected.length ? ` to ${selected.length}` : ""}`}</button></div>{selected.length > SMS_MAX_RECIPIENTS && <p className="edash-field-note" style={{ color: "var(--edash-danger)" }}>Send to at most {SMS_MAX_RECIPIENTS} customers at a time.</p>}</div></div><div className="edash-card"><div className="edash-card-inner"><div className="edash-card-head"><h3 className="edash-card-title">Recent SMS</h3></div>{history.length === 0 ? <div className="edash-ops-empty"><EstateIcon name="mail" /><strong>No SMS sent yet</strong><span>Messages you send from here appear in this list.</span></div> : <div className="edash-sms-history">{history.slice(0, 20).map((row) => <div key={row.id} className="edash-sms-history-row"><div><strong>{row.recipient_name || "Customer"}</strong><small>{row.subject}</small></div><span className={`edash-ops-badge tone-${row.status === "sent" ? "good" : "warn"}`}>{row.status === "sent" ? "Sent" : "Failed"}</span><small>{formatLagos(row.created_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</small></div>)}</div>}</div></div></div></div>
        </div>
      </section>
    </main>
  );
}
