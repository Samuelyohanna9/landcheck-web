import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import { getEstateAuthSession } from "../../auth/estateAuth";
import { money, formatPaymentPlan, PaymentPlanEditor, PaymentStatusBadge } from "../../components/estates/FinancialComponents";
import EstateShell from "../../components/estates/EstateShell";
import EstateModal from "../../components/estates/EstateModal";
import EstatePagination from "../../components/estates/EstatePagination";
import EstateRibbon, { type EstateRibbonTab } from "../../components/estates/EstateRibbon";
import Spinner from "../../components/estates/EstateSpinner";
import { findDuplicateCustomers, DuplicateCustomerModal, type DuplicateCustomerMatch } from "../../components/estates/CustomerDuplicateCheck";
import { getEstateQueryScope, invalidateEstateMutation } from "../../query/estateQueries";

type CustomerRow = { id: number; name: string; reference?: string | null; phone?: string | null; email?: string | null; plot_count?: number; agreed_price?: string; outstanding?: string };
type TimelineEvent = {
  id: string;
  kind: "audit" | "chat" | "notification";
  created_at: string;
  action?: string;
  entity_type?: string;
  actor?: string;
  details?: unknown;
  direction?: "in" | "out";
  body?: string;
  status?: string;
  message_type?: string;
  channel?: string;
  event_key?: string;
  subject?: string;
  error_message?: string | null;
};

export default function EstateCustomersPage() {
  const { estateId } = useParams();
  const navigate = useNavigate();
  const estateQueryScope = getEstateQueryScope(getEstateAuthSession());
  const [estateName, setEstateName] = useState("");
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customerPage, setCustomerPage] = useState(1);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [plotFilter, setPlotFilter] = useState<"all" | "multiple_plots" | "no_plots">("all");
  const [activity, setActivity] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [statement, setStatement] = useState<any>(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [message, setMessage] = useState("");
  const [portalLink, setPortalLink] = useState("");
  const [packetBusy, setPacketBusy] = useState(false);
  const [waPresets, setWaPresets] = useState<Array<{ key: string; label: string; sample?: string }>>([]);
  const [waPreset, setWaPreset] = useState("");
  const [waDetail, setWaDetail] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [waChannel, setWaChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [waResult, setWaResult] = useState<{ ok: boolean; message: string; at: string } | null>(null);
  const [planEditorAllocationId, setPlanEditorAllocationId] = useState<number | null>(null);
  const [expandedAllocationId, setExpandedAllocationId] = useState<number | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateCustomerMatch[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<TimelineEvent[] | null>(null);

  const load = () => {
    if (!estateId) return;
    setCustomersLoading(true);
    api.get(`/estates/${estateId}`).then((response) => {
      setEstateName(response.data.name);
      setOrganizationId(response.data.organization_id);
      return api.get(`/estates/organizations/${response.data.organization_id}/customers`, { params: { page: customerPage, page_size: 25, search: search.trim() || undefined, plot_filter: plotFilter !== "all" ? plotFilter : undefined } });
    }).then((response) => {
      setCustomers(response.data.items || []);
      setCustomerTotal(Number(response.data.total || 0));
    }).catch(() => { setCustomers([]); setCustomerTotal(0); }).finally(() => setCustomersLoading(false));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };
  useEffect(load, [estateId, customerPage, search, plotFilter]);
  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}/marketing/social/optins`).then((response) => {
      const presets = (response.data?.presets || []) as Array<{ key: string; label: string; sample?: string }>;
      setWaPresets(presets);
      if (presets[0]) setWaPreset((current) => current || presets[0].key);
    }).catch(() => setWaPresets([]));
  }, [estateId]);

  const selectedCustomer = customers.find((customer) => String(customer.id) === selectedId);

  // Mirrors the server's own params order (name, estate, detail, link) so what staff see here is
  // what actually gets sent - catches a badly-worded detail or the wrong preset before it reaches
  // Meta, rather than after a failed send.
  const waPreview = (() => {
    const spec = waPresets.find((preset) => preset.key === waPreset);
    if (!spec?.sample || !selectedCustomer) return null;
    const firstName = selectedCustomer.name?.split(" ")[0] || "there";
    return spec.sample
      .replaceAll("{{1}}", firstName)
      .replaceAll("{{2}}", estateName || "your estate")
      .replaceAll("{{3}}", waDetail.trim() || "an update on your plot")
      .replaceAll("{{4}}", "[link to your estate page]");
  })();

  const chooseCustomer = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setStatement(null);
    setPortalLink("");
    setPlanEditorAllocationId(null);
    setExpandedAllocationId(null);
    setWaResult(null);
    setShowHistory(false);
    setHistoryEvents(null);
    if (!id) return;
    try {
      const [financial, statementResponse] = await Promise.all([
        api.get(`/estates/customers/${id}/financial-detail`),
        api.get(`/estates/customers/${id}/statement`),
      ]);
      setDetail(financial.data);
      setStatement(statementResponse.data);
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "Customer financial detail could not be loaded."));
    }
  };

  const createPortalLink = async () => {
    if (!selectedCustomer) return;
    try {
      const response = await api.post(`/estates/customers/${selectedCustomer.id}/portal-token`, { expires_in_days: 90 });
      setPortalLink(response.data?.url || "");
      if (response.data?.url && navigator.clipboard) await navigator.clipboard.writeText(response.data.url);
      toast.success("Buyer portal link created and copied.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Buyer portal link could not be created."));
    }
  };

  const openHistory = async () => {
    if (!selectedCustomer) return;
    setShowHistory(true);
    setHistoryEvents(null);
    try {
      const response = await api.get<{ events: TimelineEvent[] }>(`/estates/customers/${selectedCustomer.id}/timeline`);
      setHistoryEvents(response.data.events || []);
    } catch {
      setHistoryEvents([]);
    }
  };

  const sendWhatsappMessage = async () => {
    if (!selectedCustomer || !waPreset) return;
    setWaSending(true);
    setWaResult(null);
    try {
      await api.post(`/estates/customers/${selectedCustomer.id}/whatsapp-message`, { preset: waPreset, detail: waDetail.trim() || undefined, channel: waChannel });
      const okMessage = waChannel === "sms" ? "SMS sent." : "Message sent.";
      toast.success(okMessage);
      setWaResult({ ok: true, message: okMessage, at: new Date().toLocaleTimeString() });
      setWaDetail("");
    } catch (error) {
      const failMessage = await extractApiErrorMessage(error, waChannel === "sms" ? "The SMS could not be sent." : "The message could not be sent.");
      toast.error(failMessage);
      setWaResult({ ok: false, message: failMessage, at: new Date().toLocaleTimeString() });
    } finally {
      setWaSending(false);
    }
  };

  const downloadCustomerPacket = async () => {
    if (!selectedCustomer) return;
    setPacketBusy(true);
    try {
      const response = await api.get(`/estates/customers/${selectedCustomer.id}/statement.pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selectedCustomer.name || "customer"}-customer-packet.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The customer packet could not be downloaded."));
    } finally {
      setPacketBusy(false);
    }
  };

  const actuallyCreateCustomer = async () => {
    if (!organizationId || !newName.trim()) { toast.error("Enter the customer name."); return; }
    try {
      const response = await api.post(`/estates/organizations/${organizationId}/customers`, { full_name: newName.trim(), phone: newPhone.trim() || null, email: newEmail.trim() || null });
      if (estateId) await invalidateEstateMutation(estateQueryScope, estateId, "customer");
      setNewName(""); setNewPhone(""); setNewEmail(""); setShowAddCustomer(false); setDuplicateMatches(null);
      toast.success("Customer added.");
      load();
      void chooseCustomer(String(response.data.id));
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Customer could not be created."));
    }
  };

  const createCustomer = async () => {
    if (!organizationId || !newName.trim()) { toast.error("Enter the customer name."); return; }
    const matches = await findDuplicateCustomers(organizationId, { full_name: newName.trim(), phone: newPhone.trim() || undefined, email: newEmail.trim() || undefined });
    if (matches.length) { setDuplicateMatches(matches); return; }
    await actuallyCreateCustomer();
  };

  const useExistingCustomer = (match: DuplicateCustomerMatch) => {
    setDuplicateMatches(null);
    setShowAddCustomer(false);
    setNewName(""); setNewPhone(""); setNewEmail("");
    setCustomers((prev) => (prev.some((customer) => customer.id === match.id) ? prev : [{ id: match.id, name: match.name }, ...prev]));
    void chooseCustomer(String(match.id));
    toast.success(`Using existing customer ${match.name}.`);
  };

  if (!estateId) return null;

  const ribbonTabs: EstateRibbonTab[] = [
    {
      key: "home",
      label: "Home",
      groups: [
        {
          key: "create",
          label: "Create",
          buttons: [{ key: "add-customer", label: "Add Customer", icon: "plus", onClick: () => setShowAddCustomer(true) }],
        },
        {
          key: "data",
          label: "Data",
          buttons: [{ key: "refresh", label: "Refresh", icon: "refresh", onClick: load }],
        },
      ],
    },
  ];

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="customers" search={search} onSearchChange={(value) => { setSearch(value); setCustomerPage(1); }} searchPlaceholder="Search customers..." recentActivity={activity}>
      <EstateRibbon tabs={ribbonTabs} />
      <div className="edash-content-row">
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head">
              <h3 className="edash-card-title">Customers ({customerTotal})</h3>
              <select className="edash-map-select" value={plotFilter} onChange={(event) => { setPlotFilter(event.target.value as typeof plotFilter); setCustomerPage(1); }}>
                <option value="all">All customers</option>
                <option value="multiple_plots">Multiple plots</option>
                <option value="no_plots">No active plot</option>
              </select>
            </div>
            {customersLoading ? <p className="edash-tab-empty">Loading customers...</p> : customers.length ? (
              <div style={{ overflowX: "auto" }}>
                <table className="edash-mini-table">
                  <thead><tr><th>Name</th><th>Phone</th><th>Plots</th><th>Agreed</th><th>Outstanding</th><th /></tr></thead>
                  <tbody>
                    {customers.map((customer) => (
                      <tr
                        key={customer.id}
                        style={{ cursor: "pointer", background: selectedId === String(customer.id) ? "var(--edash-brand-tint)" : undefined }}
                        onClick={() => void chooseCustomer(String(customer.id))}
                      >
                        <td data-label="Name"><strong>{customer.name}</strong></td>
                        <td data-label="Phone">{customer.phone || customer.email || "-"}</td>
                        <td data-label="Plots">
                          {(customer.plot_count ?? 0) > 1 ? (
                            <span className="edash-status-pill tone-info">{customer.plot_count} plots</span>
                          ) : (
                            customer.plot_count ?? 0
                          )}
                        </td>
                        <td data-label="Agreed">{customer.agreed_price !== undefined ? money(customer.agreed_price) : "-"}</td>
                        <td data-label="Outstanding">{customer.outstanding !== undefined ? money(customer.outstanding) : "-"}</td>
                        <td><button type="button" className="edash-btn-outline" onClick={(event) => { event.stopPropagation(); void chooseCustomer(String(customer.id)); }}>View</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="edash-tab-empty">No customers match this filter yet{plotFilter === "all" && !search ? ". Use \"Add customer\" to create your first one." : "."}</p>
            )}
            <EstatePagination page={customerPage} pageSize={25} total={customerTotal} onChange={setCustomerPage} />
          </div>
        </div>

        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Financial detail</h3></div>
            {!selectedCustomer ? (
              <p className="edash-tab-empty">Select a customer to see their financial summary and statement.</p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <p className="edash-info-card-name" style={{ margin: 0 }}>{selectedCustomer.name}</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="edash-btn-outline" onClick={() => void openHistory()}>View history</button>
                    <button type="button" className="edash-btn-outline" onClick={() => void createPortalLink()}>Buyer portal link</button>
                    <button type="button" className="edash-btn-outline" onClick={() => navigate(`/estates/${estateId}/inspections?tab=live`)}>Schedule live inspection</button>
                  </div>
                </div>
                {portalLink && <p className="edash-field-note" style={{ overflowWrap: "anywhere" }}>Copied link: {portalLink}</p>}
                {detail ? (
                  <>
                    <div className="edash-overview-grid edash-overview-grid--2">
                      <div className="edash-overview-field"><span>Agreed</span><strong>{money(detail.totals?.agreed_price ?? detail.financial?.agreed_price ?? 0)}</strong></div>
                      <div className="edash-overview-field"><span>Outstanding</span><strong>{money(detail.totals?.outstanding ?? detail.financial?.outstanding ?? 0)}</strong></div>
                    </div>
                    {statement && (
                      <button type="button" className="edash-btn-outline" style={{ marginTop: 12, marginBottom: 14 }} disabled={packetBusy} onClick={() => void downloadCustomerPacket()}>{packetBusy ? "Preparing..." : "Download customer packet"}</button>
                    )}
                    {detail.allocations?.length > 0 && (
                      <div>
                        <p className="edash-field-note" style={{ margin: "0 0 8px", fontWeight: 700 }}>Plots &amp; payment plans</p>
                        {detail.allocations.map((row: any) => {
                          const transactions = statement?.allocations?.find((a: any) => a.allocation_id === row.allocation_id)?.transactions || [];
                          const isActive = row.status === "reserved" || row.status === "allocated";
                          return (
                            <div key={row.allocation_id} className="edash-info-card" style={{ marginBottom: 8, flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                                <strong>{row.estate?.name} - Plot {row.plot?.number}</strong>
                                {row.is_overdue && <span className="edash-status-pill tone-danger">Payment overdue</span>}
                              </div>
                              <p className="edash-field-note" style={{ margin: 0 }}>
                                Agreed {money(row.agreed_price)} &middot; Paid {money(row.confirmed)} &middot; Outstanding {money(row.outstanding)} ({row.percentage}%)
                              </p>
                              <p className="edash-field-note" style={{ margin: 0 }}>{formatPaymentPlan(row.payment_plan)}</p>
                              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                {isActive && (
                                  <button type="button" className="edash-card-link" onClick={() => setPlanEditorAllocationId(planEditorAllocationId === row.allocation_id ? null : row.allocation_id)}>
                                    {row.payment_plan ? "Edit payment plan" : "Set up payment plan"}
                                  </button>
                                )}
                                {transactions.length > 0 && (
                                  <button type="button" className="edash-card-link" onClick={() => setExpandedAllocationId(expandedAllocationId === row.allocation_id ? null : row.allocation_id)}>
                                    {expandedAllocationId === row.allocation_id ? "Hide payments" : `View payments (${transactions.length})`}
                                  </button>
                                )}
                              </div>
                              {planEditorAllocationId === row.allocation_id && (
                                <PaymentPlanEditor allocationId={row.allocation_id} currentPlan={row.payment_plan} onSaved={() => { setPlanEditorAllocationId(null); void invalidateEstateMutation(estateQueryScope, estateId, "payment"); void chooseCustomer(selectedId); }} />
                              )}
                              {expandedAllocationId === row.allocation_id && (
                                <div style={{ overflowX: "auto", marginTop: 6 }}>
                                  <table className="edash-mini-table">
                                    <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Status</th><th>Reference</th></tr></thead>
                                    <tbody>
                                      {transactions.map((payment: any) => (
                                        <tr key={payment.id}>
                                          <td data-label="Date">{new Date(payment.date).toLocaleDateString()}</td>
                                          <td data-label="Amount">{money(payment.amount)}</td>
                                          <td data-label="Method">{payment.method}</td>
                                          <td data-label="Status"><PaymentStatusBadge status={payment.status} /></td>
                                          <td data-label="Reference">{payment.reference || "-"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : <p className="edash-tab-empty">Loading...</p>}
                {waPresets.length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--edash-border-soft)" }}>
                    <p className="edash-field-note" style={{ margin: "0 0 8px" }}>Message this customer</p>
                    <div className="edash-mk-form-grid">
                      <label className="edash-field"><span>Send via</span>
                        <select value={waChannel} onChange={(event) => setWaChannel(event.target.value as "whatsapp" | "sms")}>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="sms">SMS</option>
                        </select>
                      </label>
                      <label className="edash-field"><span>Message</span>
                        <select value={waPreset} onChange={(event) => setWaPreset(event.target.value)}>{waPresets.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}</select>
                      </label>
                      <label className="edash-field is-wide"><span>Detail (optional)</span><input value={waDetail} maxLength={200} onChange={(event) => { setWaDetail(event.target.value); setWaResult(null); }} placeholder="e.g. your next payment is due Friday" /></label>
                    </div>
                    {waPreview && (
                      <div className="edash-wa-preview">
                        <span className="edash-wa-preview-label">Preview - exactly what will be sent</span>
                        <p>{waPreview}</p>
                      </div>
                    )}
                    <button type="button" className="edash-btn-primary" style={{ marginTop: 8 }} disabled={waSending} onClick={() => void sendWhatsappMessage()}>{waSending ? "Sending..." : waChannel === "sms" ? "Send SMS" : "Send WhatsApp message"}</button>
                    {waResult && (
                      <p className={`edash-wa-result ${waResult.ok ? "is-ok" : "is-error"}`}>
                        <strong>{waResult.ok ? "Sent" : "Failed"}</strong> at {waResult.at}: {waResult.message}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            {message && <p className="edash-tab-empty" style={{ padding: "8px 0" }}>{message}</p>}
          </div>
        </div>
      </div>

      {showAddCustomer && (
        <EstateModal title="Add customer" subtitle="Create a customer record before reserving or allocating a plot to them." onClose={() => setShowAddCustomer(false)}>
          <label className="edash-field" style={{ marginBottom: 12 }}><span>Full name</span><input value={newName} onChange={(event) => setNewName(event.target.value)} autoFocus /></label>
          <label className="edash-field" style={{ marginBottom: 12 }}><span>Phone (optional)</span><input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} /></label>
          <label className="edash-field" style={{ marginBottom: 12 }}><span>Email (optional)</span><input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="Lifecycle updates are sent here" /></label>
          <button type="button" className="edash-btn-primary" onClick={() => void createCustomer()}>Add customer</button>
        </EstateModal>
      )}

      {duplicateMatches && (
        <DuplicateCustomerModal
          matches={duplicateMatches}
          onUseExisting={useExistingCustomer}
          onCreateNew={() => { setDuplicateMatches(null); void actuallyCreateCustomer(); }}
          onClose={() => setDuplicateMatches(null)}
        />
      )}

      {showHistory && selectedCustomer && (
        <EstateModal title={`${selectedCustomer.name} - full history`} subtitle="Every record change, payment, and message - WhatsApp, SMS and email - for this customer, newest first." onClose={() => setShowHistory(false)}>
          {historyEvents === null ? (
            <p className="edash-tab-empty"><Spinner size={13} /> Loading...</p>
          ) : historyEvents.length === 0 ? (
            <p className="edash-tab-empty">No recorded history for this customer yet.</p>
          ) : (
            <div className="edash-timeline-list">
              {historyEvents.map((event) => (
                <div key={event.id} className="edash-timeline-item">
                  <span className={`edash-timeline-dot ${event.kind === "chat" ? (event.status === "failed" ? "is-danger" : "is-good") : event.kind === "notification" && event.status === "failed" ? "is-danger" : ""}`} />
                  <div>
                    {event.kind === "audit" && (
                      <>
                        <strong>{String(event.action || "").replaceAll("_", " ")}</strong>
                        <small>{event.entity_type ? `${event.entity_type.replace("estate_", "")} · ` : ""}{new Date(event.created_at).toLocaleString()}</small>
                      </>
                    )}
                    {event.kind === "chat" && (
                      <>
                        <strong>{event.direction === "in" ? "Customer replied" : "Sent to customer"} ({event.message_type || "text"}){event.status === "failed" ? " - failed" : ""}</strong>
                        {event.body && <p className="edash-field-note" style={{ margin: "2px 0 0" }}>{event.body}</p>}
                        <small>{new Date(event.created_at).toLocaleString()}</small>
                      </>
                    )}
                    {event.kind === "notification" && (
                      <>
                        <strong>{(event.channel || "").toUpperCase()}: {String(event.event_key || "").replaceAll("_", " ")}{event.status === "failed" ? " - failed" : ""}</strong>
                        {event.subject && <p className="edash-field-note" style={{ margin: "2px 0 0" }}>{event.subject}</p>}
                        {event.status === "failed" && event.error_message && <p className="edash-field-note" style={{ margin: "2px 0 0", color: "var(--edash-danger, #b3261e)" }}>{event.error_message}</p>}
                        <small>{new Date(event.created_at).toLocaleString()}</small>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </EstateModal>
      )}
    </EstateShell>
  );
}
