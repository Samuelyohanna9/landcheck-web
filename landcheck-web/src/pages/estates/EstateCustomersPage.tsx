import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import { money } from "../../components/estates/FinancialComponents";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import EstateModal from "../../components/estates/EstateModal";
import EstatePagination from "../../components/estates/EstatePagination";

const SMS_MAX_CHARS = 320;
const SMS_MAX_RECIPIENTS = 50;
const GSM_CHARS = /^[\x20-\x7E\n\r€^{}\\[~\]|]*$/;

function smsSegmentLabel(text: string): string {
  if (!text) return "1 SMS";
  const unicode = !GSM_CHARS.test(text);
  const length = text.length;
  const segments = length <= (unicode ? 70 : 160) ? 1 : Math.ceil(length / (unicode ? 67 : 153));
  return `${segments} SMS${segments === 1 ? "" : " segments"}${unicode ? " (special characters)" : ""}`;
}

export default function EstateCustomersPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("");
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Array<{ id: number; name: string }>>([]);
  const [customerPage, setCustomerPage] = useState(1);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [customersLoading, setCustomersLoading] = useState(false);
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
  const [waPresets, setWaPresets] = useState<Array<{ key: string; label: string }>>([]);
  const [waPreset, setWaPreset] = useState("");
  const [waDetail, setWaDetail] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [smsSelected, setSmsSelected] = useState<number[]>([]);
  const [smsText, setSmsText] = useState("");
  const [smsSending, setSmsSending] = useState(false);

  const load = () => {
    if (!estateId) return;
    setCustomersLoading(true);
    api.get(`/estates/${estateId}`).then((response) => {
      setEstateName(response.data.name);
      setOrganizationId(response.data.organization_id);
      return api.get(`/estates/organizations/${response.data.organization_id}/customers`, { params: { page: customerPage, page_size: 25, search: search.trim() || undefined } });
    }).then((response) => {
      setCustomers(response.data.items || []);
      setCustomerTotal(Number(response.data.total || 0));
    }).catch(() => { setCustomers([]); setCustomerTotal(0); }).finally(() => setCustomersLoading(false));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };
  useEffect(load, [estateId, customerPage, search]);
  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}/marketing/social/optins`).then((response) => {
      const presets = (response.data?.presets || []) as Array<{ key: string; label: string }>;
      setWaPresets(presets);
      if (presets[0]) setWaPreset((current) => current || presets[0].key);
    }).catch(() => setWaPresets([]));
  }, [estateId]);

  const selectedCustomer = customers.find((customer) => String(customer.id) === selectedId);

  const chooseCustomer = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setStatement(null);
    setPortalLink("");
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

  const sendBulkSms = async () => {
    if (!estateId || !smsText.trim() || !smsSelected.length) return;
    setSmsSending(true);
    try {
      const response = await api.post<{ sent: number; failed: number; skipped_no_phone: number }>(`/estates/${estateId}/customers/sms`, { customer_ids: smsSelected, message: smsText.trim() });
      const { sent, failed, skipped_no_phone: skipped } = response.data;
      const parts = [`${sent} sent`];
      if (failed) parts.push(`${failed} failed`);
      if (skipped) parts.push(`${skipped} skipped (no phone number)`);
      toast.success(parts.join(" · "));
      setSmsText("");
      setSmsSelected([]);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The SMS could not be sent."));
    } finally {
      setSmsSending(false);
    }
  };

  const sendWhatsappMessage = async () => {
    if (!selectedCustomer || !waPreset) return;
    setWaSending(true);
    try {
      await api.post(`/estates/customers/${selectedCustomer.id}/whatsapp-message`, { preset: waPreset, detail: waDetail.trim() || undefined });
      toast.success("Message sent.");
      setWaDetail("");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The message could not be sent."));
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

  const createCustomer = async () => {
    if (!organizationId || !newName.trim()) { toast.error("Enter the customer name."); return; }
    try {
      await api.post(`/estates/organizations/${organizationId}/customers`, { full_name: newName.trim(), phone: newPhone.trim() || null, email: newEmail.trim() || null });
      setNewName(""); setNewPhone(""); setNewEmail(""); setShowAddCustomer(false);
      toast.success("Customer added.");
      load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Customer could not be created."));
    }
  };

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="customers" search={search} onSearchChange={(value) => { setSearch(value); setCustomerPage(1); }} searchPlaceholder="Search customers..." recentActivity={activity}>
      <div className="edash-content-row">
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head">
              <h3 className="edash-card-title">Customers ({customerTotal})</h3>
              <button type="button" className="edash-tool-btn" onClick={() => setShowAddCustomer(true)}>
                <EstateIcon name="plus" /> Add customer
              </button>
            </div>
            {customersLoading ? <p className="edash-tab-empty">Loading customers...</p> : customers.length ? (
              <>
                <label className="edash-sms-select-all">
                  <input type="checkbox" checked={customers.length > 0 && customers.every((customer) => smsSelected.includes(customer.id))} onChange={(event) => setSmsSelected(event.target.checked ? customers.map((customer) => customer.id) : [])} />
                  <span>Select all on this page</span>
                </label>
                <div className="edash-activity-list">
                  {customers.map((customer) => (
                    <div
                      key={customer.id}
                      className="edash-info-card"
                      style={{ cursor: "pointer", margin: 0, marginBottom: 8, borderColor: selectedId === String(customer.id) ? "var(--edash-brand)" : undefined }}
                      onClick={() => void chooseCustomer(String(customer.id))}
                    >
                      <label className="edash-sms-check" onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" checked={smsSelected.includes(customer.id)} onChange={(event) => setSmsSelected((current) => (event.target.checked ? [...current, customer.id] : current.filter((id) => id !== customer.id)))} aria-label={`Select ${customer.name} for SMS`} />
                      </label>
                      <span className="edash-info-card-icon"><EstateIcon name="customers" /></span>
                      <div className="edash-info-card-body"><p className="edash-info-card-name">{customer.name}</p></div>
                      <button type="button" className="edash-btn-outline edash-info-card-action">View</button>
                    </div>
                  ))}
                </div>
                {smsSelected.length > 0 && (
                  <div className="edash-sms-compose">
                    <div className="edash-sms-compose-head">
                      <strong>SMS to {smsSelected.length} customer{smsSelected.length === 1 ? "" : "s"}</strong>
                      <button type="button" className="edash-card-link" onClick={() => setSmsSelected([])}>Clear selection</button>
                    </div>
                    <textarea rows={3} value={smsText} maxLength={SMS_MAX_CHARS} placeholder="Write your message..." onChange={(event) => setSmsText(event.target.value)} />
                    <div className="edash-sms-compose-foot">
                      <small>{smsText.length}/{SMS_MAX_CHARS} characters · {smsSegmentLabel(smsText)}{smsSelected.length > SMS_MAX_RECIPIENTS ? ` · max ${SMS_MAX_RECIPIENTS} per send` : ""}</small>
                      <button type="button" className="edash-btn-primary" disabled={smsSending || !smsText.trim() || smsSelected.length > SMS_MAX_RECIPIENTS} onClick={() => void sendBulkSms()}>{smsSending ? "Sending..." : "Send SMS"}</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="edash-tab-empty">No customers yet. Use "Add customer" to create your first one.</p>
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}><p className="edash-info-card-name" style={{ margin: 0 }}>{selectedCustomer.name}</p><button type="button" className="edash-btn-outline" onClick={() => void createPortalLink()}>Buyer portal link</button></div>
                {portalLink && <p className="edash-field-note" style={{ overflowWrap: "anywhere" }}>Copied link: {portalLink}</p>}
                {detail ? (
                  <div className="edash-overview-grid edash-overview-grid--2">
                    <div className="edash-overview-field"><span>Agreed</span><strong>{money(detail.totals?.agreed_price ?? detail.financial?.agreed_price ?? 0)}</strong></div>
                    <div className="edash-overview-field"><span>Outstanding</span><strong>{money(detail.totals?.outstanding ?? detail.financial?.outstanding ?? 0)}</strong></div>
                  </div>
                ) : <p className="edash-tab-empty">Loading...</p>}
                {statement && (
                  <button type="button" className="edash-btn-outline" style={{ marginTop: 12 }} disabled={packetBusy} onClick={() => void downloadCustomerPacket()}>{packetBusy ? "Preparing..." : "Download customer packet"}</button>
                )}
                {waPresets.length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--edash-border-soft)" }}>
                    <p className="edash-field-note" style={{ margin: "0 0 8px" }}>Message this customer on WhatsApp</p>
                    <div className="edash-mk-form-grid">
                      <label className="edash-field"><span>Message</span>
                        <select value={waPreset} onChange={(event) => setWaPreset(event.target.value)}>{waPresets.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}</select>
                      </label>
                      <label className="edash-field is-wide"><span>Detail (optional)</span><input value={waDetail} maxLength={200} onChange={(event) => setWaDetail(event.target.value)} placeholder="e.g. your next payment is due Friday" /></label>
                    </div>
                    <button type="button" className="edash-btn-primary" style={{ marginTop: 8 }} disabled={waSending} onClick={() => void sendWhatsappMessage()}>{waSending ? "Sending..." : "Send WhatsApp message"}</button>
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
    </EstateShell>
  );
}
