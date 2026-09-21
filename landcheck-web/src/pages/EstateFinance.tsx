import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../api/client";
import { FinancialSummaryCards, PaymentStatusBadge, money, PAYMENT_METHODS, paymentMethodLabel } from "../components/estates/FinancialComponents";
import EstateShell from "../components/estates/EstateShell";
import EstateModal from "../components/estates/EstateModal";
import EstateIcon from "../components/estates/EstateIcon";

type Payment = { id: number; date: string; amount: string; currency: string; status: string; method: string; reference?: string; customer: { name: string }; estate: { name: string }; plot: { number: string }; can_confirm?: boolean };
type Allocation = { id: number; estate_id: number; plot_id: number; customer_id: number; estate_name: string; plot_number: string; customer_name: string };
type Customer = { id: number; name: string };
type Detail = { payment: Payment & { notes?: string }; customer: { name: string }; estate: { name: string }; plot: { number: string }; financial: { agreed_price: string; confirmed: string; pending: string; outstanding: string }; capabilities: { can_confirm: boolean; can_void: boolean }; evidence: { id: number; filename: string }[] };
type Statement = { organization: { name: string }; customer: { id: number; name: string; reference?: string }; statement_date: string; allocations: any[] };
type Plot = { id: number; plot_number: string; estate_id: number; estate_name: string; area_sqm: number };

const DOCUMENT_TYPES = [
  ["deed_of_assignment", "Deed of assignment"],
  ["sale_agreement", "Sale agreement"],
  ["reservation_agreement", "Reservation agreement"],
  ["allocation_letter", "Allocation letter"],
  ["survey_plan", "Survey plan"],
  ["title_document", "Title document"],
  ["certificate_of_occupancy", "Certificate of occupancy"],
  ["governors_consent", "Governor's consent"],
  ["power_of_attorney", "Power of attorney"],
  ["development_agreement", "Development agreement"],
  ["offer_letter", "Offer letter"],
  ["payment_plan", "Payment plan"],
  ["consent", "Consent"],
  ["tax_clearance", "Tax clearance"],
  ["building_plan", "Building plan"],
  ["site_plan", "Site plan"],
  ["handover_pack", "Handover pack"],
  ["proof_of_identity", "Proof of identity"],
  ["staking_evidence", "Staking evidence"],
  ["receipt", "Payment receipt"],
  ["other", "Other document"],
] as const;

const today = () => new Date().toISOString().slice(0, 10);

async function download(path: string, name: string) {
  const response = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function EstateFinance({ mode }: { mode: "payments" | "documents" }) {
  const [sidebarEstateId, setSidebarEstateId] = useState("");
  const [sidebarEstateName, setSidebarEstateName] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [recording, setRecording] = useState(false);
  const [allocationId, setAllocationId] = useState("");
  const [allocationDetail, setAllocationDetail] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentMethodOther, setPaymentMethodOther] = useState("");
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [customerDetail, setCustomerDetail] = useState<any>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [showStatement, setShowStatement] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [documentType, setDocumentType] = useState("");
  const [documentDescription, setDocumentDescription] = useState("");
  const [entityType, setEntityType] = useState("allocation");
  const [entityId, setEntityId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [recordDetail, setRecordDetail] = useState<any>(null);

  const fail = async (error: unknown, message: string) => toast.error(await extractApiErrorMessage(error, message));

  const setup = async () => {
    const [selectors, totals] = await Promise.all([api.get("/estates/selectors"), api.get("/estates/financial-summary")]);
    setAllocations(selectors.data.allocations || []);
    setPlots(selectors.data.plots || []);
    setCustomers(selectors.data.customers || []);
    setSummary((totals.data || []).reduce((acc: any, row: any) => ({
      agreed_price: String(Number(acc.agreed_price || 0) + Number(row.contracted_sales_value || 0)),
      confirmed_paid: String(Number(acc.confirmed_paid || 0) + Number(row.confirmed_collections || 0)),
      pending_paid: String(Number(acc.pending_paid || 0) + Number(row.pending_collections || 0)),
      outstanding: String(Number(acc.outstanding || 0) + Number(row.outstanding_balance || 0)),
    }), {}));
  };

  const load = async () => {
    try {
      await setup();
      if (mode === "payments") {
        const response = await api.get("/estates/payments", { params: { page, page_size: 20, search: search || undefined, status: status || undefined, method: method || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined } });
        setPayments(response.data.items || []);
        setTotal(response.data.total || 0);
      } else {
        const response = await api.get("/estates/documents", { params: { page, page_size: 20, document_type: documentType || undefined, entity_type: entityType || undefined, entity_id: entityId || undefined } });
        setDocuments(response.data.items || []);
        setTotal(response.data.total || 0);
      }
    } catch (error) {
      await fail(error, "Estate financial information could not be loaded.");
    }
  };
  useEffect(() => { void load(); }, [mode, page]);
  useEffect(() => {
    api.get("/estates").then((response) => {
      const first = (response.data || [])[0];
      if (first) { setSidebarEstateId(String(first.id)); setSidebarEstateName(first.name); }
    }).catch(() => undefined);
  }, []);

  const chooseCustomer = async (id: string) => {
    setCustomerId(id);
    setCustomerDetail(null);
    setStatement(null);
    if (!id) return;
    try {
      const [financial, statementResponse] = await Promise.all([api.get(`/estates/customers/${id}/financial-detail`), api.get(`/estates/customers/${id}/statement`)]);
      setCustomerDetail(financial.data);
      setStatement(statementResponse.data);
    } catch (error) {
      await fail(error, "Customer financial detail could not be loaded.");
    }
  };

  const chooseAllocation = async (id: string) => {
    setAllocationId(id);
    setAllocationDetail(null);
    if (!id) return;
    try { setAllocationDetail((await api.get(`/estates/allocations/${id}/financial-detail`)).data); }
    catch (error) { await fail(error, "Allocation financial detail could not be loaded."); }
  };

  const viewAllocation = async (id: number) => {
    try { setRecordDetail((await api.get(`/estates/allocations/${id}/record`)).data); }
    catch (error) { await fail(error, "Plot record could not be loaded."); }
  };

  const printAllocation = async (id: number) => {
    if (!customerId) return;
    try { await download(`/estates/customers/${customerId}/statement.pdf?allocation_id=${id}`, `plot-${id}-customer-record.pdf`); }
    catch (error) { await fail(error, "Plot record PDF could not be generated."); }
  };

  const openUpload = () => {
    setEntityType("allocation");
    setEntityId("");
    setDocumentType("");
    setDocumentDescription("");
    setFile(null);
    setShowUpload(true);
  };

  const record = async () => {
    if (!allocationId || !amount) { toast.error("Select an allocation and enter an amount."); return; }
    const resolvedMethod = paymentMethod === "other" ? paymentMethodOther.trim() : paymentMethod;
    if (!resolvedMethod) { toast.error("Enter the payment method."); return; }
    try {
      const made = await api.post(`/estates/allocations/${allocationId}/payments`, { amount, payment_date: paymentDate, payment_method: resolvedMethod, reference_no: reference || null });
      let noticeText = "Payment recorded and pending confirmation.";
      if (receipt) {
        const body = new FormData();
        body.append("file", receipt);
        try { await api.post(`/estates/payments/${made.data.id}/evidence`, body); noticeText = "Payment recorded and receipt attached."; }
        catch (error) { await fail(error, "Payment was recorded, but the receipt upload failed."); }
      }
      if (made.data.customer_notified) noticeText += " A confirmation email has been sent to the customer.";
      toast.success(noticeText);
      setRecording(false);
      await load();
    } catch (error) {
      await fail(error, "Payment could not be recorded.");
    }
  };

  const quickConfirm = async (id: number) => {
    try {
      const response = await api.post(`/estates/payments/${id}/confirm`);
      toast.success(`Payment confirmed.${response.data.customer_notified ? " A confirmation email has been sent to the customer." : ""}`);
      await load();
    } catch (error) {
      await fail(error, "Payment could not be confirmed.");
    }
  };

  const act = async (kind: "confirm" | "void") => {
    if (!detail) return;
    const reason = kind === "void" ? window.prompt("Reason for voiding this payment:") : "";
    if (kind === "void" && !reason) return;
    try {
      const response = await api.post(`/estates/payments/${detail.payment.id}/${kind}`, kind === "void" ? { reason } : undefined);
      setDetail(null);
      toast.success(`Payment ${kind}ed.${kind === "confirm" && response.data.customer_notified ? " A confirmation email has been sent to the customer." : ""}`);
      await load();
    } catch (error) {
      await fail(error, `Payment could not be ${kind}ed.`);
    }
  };

  const upload = async () => {
    if (!file || !documentType || !entityType || !entityId) { toast.error("Select a file and complete its linked record fields."); return; }
    try {
      const body = new FormData();
      body.append("file", file);
      await api.post("/estates/documents", body, { params: { entity_type: entityType, entity_id: entityId, document_type: documentType, description: documentDescription.trim() || undefined } });
      toast.success("Private document uploaded.");
      setFile(null);
      setDocumentDescription("");
      setShowUpload(false);
      await load();
    } catch (error) {
      await fail(error, "Document could not be uploaded.");
    }
  };

  if (!sidebarEstateId) return null;

  if (mode === "documents") {
    return (
      <EstateShell estateId={sidebarEstateId} estateName={sidebarEstateName} activeKey="documents">
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head">
              <h3 className="edash-card-title">Private documents ({total})</h3>
              <button type="button" className="edash-tool-btn" onClick={openUpload}>
                <EstateIcon name="plus" /> Add document
              </button>
            </div>
            {documents.length ? (
              <div style={{ overflowX: "auto" }}>
                <table className="edash-mini-table">
                  <thead><tr><th>File</th><th>Type</th><th>Record</th><th /></tr></thead>
                  <tbody>
                    {documents.map((row) => (
                      <tr key={row.id}>
                        <td data-label="File">{row.filename}</td>
                        <td data-label="Type">{DOCUMENT_TYPES.find(([code]) => code === row.type)?.[1] || row.type}</td>
                        <td data-label="Record">{row.entity_type} #{row.entity_id}</td>
                        <td><button type="button" className="edash-btn-outline" onClick={() => void download(`/estates/documents/${row.id}/download`, row.filename).catch((error) => fail(error, "Document could not be downloaded."))}>Download</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="edash-tab-empty">No documents yet. Use "Add document" to upload your first one.</p>}
            <Pager page={page} total={total} change={setPage} />
          </div>
        </div>

        {showUpload && (
          <EstateModal title="Add document" subtitle="Files are stored privately and linked to one estate record." onClose={() => setShowUpload(false)}>
            <label className="edash-field" style={{ marginBottom: 12 }}><span>File</span><input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
            <label className="edash-field" style={{ marginBottom: 12 }}><span>Document type</span><select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="">Choose a document type</option>{DOCUMENT_TYPES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
            <label className="edash-field" style={{ marginBottom: 12 }}>
              <span>Attach to</span>
              <select value={entityType} onChange={(event) => { setEntityType(event.target.value); setEntityId(""); }}>
                <option value="allocation">Buyer plot allocation</option>
                <option value="plot">Plot only</option>
                <option value="customer">Customer</option>
                <option value="estate">Estate</option>
                <option value="payment">Payment</option>
              </select>
            </label>
            {entityType === "allocation" ? <label className="edash-field" style={{ marginBottom: 12 }}><span>Buyer and plot</span><select value={entityId} onChange={(event) => setEntityId(event.target.value)}><option value="">Choose buyer and plot</option>{allocations.map((allocation) => <option key={allocation.id} value={allocation.id}>{allocation.estate_name} / Plot {allocation.plot_number} / {allocation.customer_name}</option>)}</select></label> : entityType === "plot" ? <label className="edash-field" style={{ marginBottom: 12 }}><span>Plot</span><select value={entityId} onChange={(event) => setEntityId(event.target.value)}><option value="">Choose plot</option>{plots.map((plot) => <option key={plot.id} value={plot.id}>{plot.estate_name} / Plot {plot.plot_number}</option>)}</select></label> : <label className="edash-field" style={{ marginBottom: 12 }}><span>Linked record ID</span><input value={entityId} onChange={(event) => setEntityId(event.target.value)} inputMode="numeric" /></label>}
            <label className="edash-field" style={{ marginBottom: 12 }}><span>Description (optional)</span><textarea value={documentDescription} onChange={(event) => setDocumentDescription(event.target.value)} placeholder="e.g. Signed copy received from buyer" rows={3} /></label>
            <button type="button" className="edash-btn-primary" onClick={() => void upload()}>Upload private document</button>
          </EstateModal>
        )}
      </EstateShell>
    );
  }

  return (
    <EstateShell estateId={sidebarEstateId} estateName={sidebarEstateName} activeKey="payments">
      <div className="edash-section-head" style={{ justifyContent: "space-between" }}>
        <p className="edash-status-row-desc" style={{ margin: 0 }}>Confirmed collections exclude pending and voided payments.</p>
        <button type="button" className="edash-btn-primary" onClick={() => setRecording(true)}>Record payment</button>
      </div>
      {summary && (
        <div className="edash-overview-grid edash-overview-grid--3" style={{ margin: "16px 0" }}>
          <div className="edash-overview-field"><span>Agreed price</span><strong>{money(summary.agreed_price)}</strong></div>
          <div className="edash-overview-field"><span>Confirmed</span><strong>{money(summary.confirmed_paid)}</strong></div>
          <div className="edash-overview-field"><span>Outstanding</span><strong>{money(summary.outstanding)}</strong></div>
        </div>
      )}

      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Customer financial view</h3></div>
          <select className="edash-map-select" style={{ width: "100%", marginBottom: 10 }} value={customerId} onChange={(event) => void chooseCustomer(event.target.value)}>
            <option value="">Select customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          {customerDetail && <CustomerAllocations detail={customerDetail} onView={viewAllocation} onPrint={printAllocation} />}
          {statement && <button type="button" className="edash-btn-outline" style={{ marginTop: 10 }} onClick={() => setShowStatement(true)}>View customer payment statement</button>}
        </div>
      </div>

      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Filters</h3></div>
          <div className="edash-form-row">
            <label className="edash-field"><span>Customer, plot or reference</span><input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label className="edash-field"><span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All statuses</option>
                <option value="pending_confirmation">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="voided">Voided</option>
              </select>
            </label>
            <label className="edash-field"><span>Payment method</span>
              <select value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="">All methods</option>
                {PAYMENT_METHODS.filter((item) => item.value !== "other").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="edash-field"><span>From</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
            <label className="edash-field"><span>To</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
            <button type="button" className="edash-btn-primary" style={{ alignSelf: "flex-end" }} onClick={() => { setPage(1); void load(); }}>Apply filters</button>
          </div>
        </div>
      </div>

      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Payments ({total})</h3></div>
          <PaymentTable rows={payments} open={async (id) => { try { setDetail((await api.get(`/estates/payments/${id}`)).data); } catch (error) { await fail(error, "Payment detail could not be loaded."); } }} onConfirm={quickConfirm} />
          <Pager page={page} total={total} change={setPage} />
        </div>
      </div>

      {recording && (
        <EstateModal title="Record payment" onClose={() => setRecording(false)}>
          <label className="edash-field" style={{ marginBottom: 12 }}>
            <span>Allocation</span>
            <select value={allocationId} onChange={(event) => void chooseAllocation(event.target.value)}>
              <option value="">Select allocation</option>
              {allocations.map((allocation) => <option key={allocation.id} value={allocation.id}>{allocation.estate_name} / {allocation.plot_number} / {allocation.customer_name}</option>)}
            </select>
          </label>
          {allocationDetail && <AllocationPanel detail={allocationDetail} />}
          <label className="edash-field" style={{ marginBottom: 12 }}><span>Amount</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <label className="edash-field" style={{ marginBottom: 12 }}><span>Date</span><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
          <label className="edash-field" style={{ marginBottom: 12 }}>
            <span>Method</span>
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              {PAYMENT_METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {paymentMethod === "other" && (
            <label className="edash-field" style={{ marginBottom: 12 }}><span>Specify method</span><input value={paymentMethodOther} onChange={(event) => setPaymentMethodOther(event.target.value)} placeholder="e.g. Crypto, Barter" /></label>
          )}
          <label className="edash-field" style={{ marginBottom: 12 }}><span>Reference</span><input value={reference} onChange={(event) => setReference(event.target.value)} /></label>
          <label className="edash-field" style={{ marginBottom: 12 }}><span>Receipt</span><input type="file" onChange={(event) => setReceipt(event.target.files?.[0] || null)} /></label>
          <button type="button" className="edash-btn-primary" onClick={() => void record()}>Record payment</button>
        </EstateModal>
      )}

      {detail && (
        <EstateModal title="Payment detail" subtitle={`${detail.customer.name} - ${detail.estate.name} / ${detail.plot.number}`} onClose={() => setDetail(null)}>
          <div className="edash-overview-grid edash-overview-grid--2" style={{ marginBottom: 12 }}>
            <div className="edash-overview-field"><span>Agreed</span><strong>{money(detail.financial.agreed_price)}</strong></div>
            <div className="edash-overview-field"><span>Confirmed</span><strong>{money(detail.financial.confirmed)}</strong></div>
            <div className="edash-overview-field"><span>Pending</span><strong>{money(detail.financial.pending)}</strong></div>
            <div className="edash-overview-field"><span>Outstanding</span><strong>{money(detail.financial.outstanding)}</strong></div>
          </div>
          {detail.evidence.length > 0 && (
            <div className="edash-chip-row" style={{ marginBottom: 12 }}>
              {detail.evidence.map((item) => (
                <button type="button" key={item.id} className="edash-chip" style={{ cursor: "pointer", border: "none" }} onClick={() => void download(`/estates/payments/${detail.payment.id}/evidence/${item.id}/download`, item.filename).catch((error) => fail(error, "Evidence could not be downloaded."))}>
                  {item.filename}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {detail.capabilities.can_confirm && <button type="button" className="edash-btn-primary" onClick={() => void act("confirm")}>Confirm</button>}
            {detail.capabilities.can_void && <button type="button" className="edash-btn-outline" style={{ color: "var(--edash-danger)", borderColor: "var(--edash-danger-tint)" }} onClick={() => void act("void")}>Void</button>}
          </div>
        </EstateModal>
      )}

      {showStatement && statement && (
        <EstateModal title="Customer payment statement" onClose={() => setShowStatement(false)}>
          <CustomerStatement statement={statement} />
        </EstateModal>
      )}

      {recordDetail && (
        <EstateModal title={`Plot ${recordDetail.plot?.number || "record"}`} subtitle={`${recordDetail.customer?.name || "Customer"} - ${recordDetail.estate?.name || "Estate"}`} onClose={() => setRecordDetail(null)}>
          <AllocationRecordView record={recordDetail} onPrint={() => void printAllocation(recordDetail.allocation.id)} />
        </EstateModal>
      )}
    </EstateShell>
  );
}

function AllocationPanel({ detail }: { detail: any }) {
  const financial = detail.financial;
  return (
    <div className="edash-info-card" style={{ flexDirection: "column", marginBottom: 12 }}>
      <p className="edash-info-card-name">{detail.customer.name} - {detail.estate.name} / {detail.plot.number}</p>
      <p className="edash-status-row-desc" style={{ marginBottom: 8 }}>Allocation: {detail.allocation.allocation_date ? new Date(detail.allocation.allocation_date).toLocaleDateString() : "-"} &middot; Payment plan: {detail.allocation.payment_plan || "Not specified"}</p>
      <div className="edash-overview-grid edash-overview-grid--2" style={{ marginBottom: 8 }}>
        <div className="edash-overview-field"><span>Agreed</span><strong>{money(financial.agreed_price)}</strong></div>
        <div className="edash-overview-field"><span>Confirmed</span><strong>{money(financial.confirmed_paid)}</strong></div>
        <div className="edash-overview-field"><span>Pending</span><strong>{money(financial.pending_paid)}</strong></div>
        <div className="edash-overview-field"><span>Outstanding</span><strong>{money(financial.outstanding)}</strong></div>
      </div>
      <p className="edash-status-row-desc">Payment progress: {financial.percentage}% {financial.fully_paid ? "(Fully paid)" : ""}</p>
    </div>
  );
}

function CustomerAllocations({ detail, onView, onPrint }: { detail: any; onView: (allocationId: number) => void; onPrint: (allocationId: number) => void }) {
  const totals = (detail.allocations || []).reduce((acc: any, allocation: any) => ({
    agreed_price: String(Number(acc.agreed_price || 0) + Number(allocation.agreed_price || 0)),
    confirmed_paid: String(Number(acc.confirmed_paid || 0) + Number(allocation.confirmed || 0)),
    pending_paid: String(Number(acc.pending_paid || 0) + Number(allocation.pending || 0)),
    outstanding: String(Number(acc.outstanding || 0) + Number(allocation.outstanding || 0)),
  }), {});
  return (
    <>
      <FinancialSummaryCards summary={totals} />
      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table className="edash-mini-table">
          <thead><tr><th>Estate</th><th>Plot</th><th>Agreed</th><th>Confirmed</th><th>Pending</th><th>Outstanding</th><th>Progress</th><th>Payments</th><th>Record</th></tr></thead>
          <tbody>
            {detail.allocations.map((allocation: any) => (
              <tr key={allocation.allocation_id}>
                <td data-label="Estate">{allocation.estate.name}</td>
                <td data-label="Plot">{allocation.plot.number}</td>
                <td data-label="Agreed">{money(allocation.agreed_price)}</td>
                <td data-label="Confirmed">{money(allocation.confirmed)}</td>
                <td data-label="Pending">{money(allocation.pending)}</td>
                <td data-label="Outstanding">{money(allocation.outstanding)}</td>
                <td data-label="Progress">{allocation.percentage}%</td>
                <td data-label="Payments">{allocation.payment_count}</td>
                <td data-label="Record"><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button type="button" className="edash-btn-outline" onClick={() => onView(allocation.allocation_id)}>View</button><button type="button" className="edash-btn-outline" onClick={() => onPrint(allocation.allocation_id)}>Download customer packet</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AllocationRecordView({ record, onPrint }: { record: any; onPrint: () => void }) {
  const downloadDocument = async (documentId: number, filename: string) => {
    try { await download(`/estates/documents/${documentId}/download`, filename); }
    catch { window.alert("Document could not be downloaded."); }
  };
  return (
    <div className="edash-allocation-record">
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}><button type="button" className="edash-btn-primary" onClick={onPrint}>Download customer packet</button></div>
      <div className="edash-overview-grid edash-overview-grid--2">
        <div className="edash-overview-field"><span>Customer</span><strong>{record.customer?.name || "-"}</strong><small>{record.customer?.phone || record.customer?.email || "No contact details"}</small></div>
        <div className="edash-overview-field"><span>Plot</span><strong>{record.plot?.number || "-"}</strong><small>{record.plot?.area_sqm ? `${Number(record.plot.area_sqm).toLocaleString()} m2` : "Area not recorded"}</small></div>
        <div className="edash-overview-field"><span>Allocation status</span><strong>{String(record.allocation.status || "").replaceAll("_", " ")}</strong><small>{record.allocation.allocation_date ? new Date(record.allocation.allocation_date).toLocaleDateString() : "Not allocated"}</small></div>
        <div className="edash-overview-field"><span>Outstanding</span><strong>{money(record.financial.outstanding)}</strong><small>{Number(record.financial.percentage || 0).toFixed(0)}% paid</small></div>
      </div>
      <div className="edash-allocation-record-section"><h4>Plot and workflow</h4><p className="edash-status-row-desc">{record.estate?.name || "Estate"} {record.plot?.public_address ? `- ${record.plot.public_address}` : ""} {record.plot?.land_use ? `- ${record.plot.land_use}` : ""}</p><p className="edash-status-row-desc">Survey: <strong>{record.survey?.status || "Not started"}</strong> - Staking: <strong>{record.staking?.status || "Not started"}</strong></p><p className="edash-status-row-desc">Payment plan: {record.allocation.payment_plan || "Not specified"}</p></div>
      <div className="edash-allocation-record-section"><h4>Documents</h4><div className="edash-chip-row">{record.documents?.length ? record.documents.map((document: any) => <button type="button" className="edash-chip" key={document.id} onClick={() => void downloadDocument(document.id, document.filename)}>{document.filename}</button>) : <span className="edash-status-row-desc">No documents uploaded.</span>}</div></div>
      <div className="edash-allocation-record-section"><h4>Payment receipts and transactions</h4>{record.payments?.length ? <div style={{ overflowX: "auto" }}><table className="edash-mini-table"><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Reference</th><th>Receipt</th></tr></thead><tbody>{record.payments.map((payment: any) => <tr key={payment.id}><td data-label="Date">{new Date(payment.date).toLocaleDateString()}</td><td data-label="Amount">{money(payment.amount)}</td><td data-label="Status"><PaymentStatusBadge status={payment.status} /></td><td data-label="Reference">{payment.reference || "-"}</td><td data-label="Receipt"><div>{payment.receipt_number || payment.evidence?.[0]?.filename || "Pending"}</div><button type="button" className="edash-card-link" onClick={() => void download(`/estates/payments/${payment.id}/receipt.pdf`, `payment-${payment.id}-receipt.pdf`)}>Receipt PDF</button></td></tr>)}</tbody></table></div> : <p className="edash-status-row-desc">No payments recorded.</p>}<p className="edash-status-row-desc" style={{ marginTop: 8 }}>Agreed: {money(record.financial.agreed_price)}. Confirmed: {money(record.financial.confirmed_paid)}. Pending: {money(record.financial.pending_paid)}. Outstanding: {money(record.financial.outstanding)}.</p></div>
    </div>
  );
}

function renderReceiptCell(transaction: { id: number; receipts?: { id: number; filename: string }[] }) {
  if (!transaction.receipts?.length) return <span style={{ color: "var(--edash-faint)" }}>-</span>;
  return (
    <div className="edash-chip-row">
      {transaction.receipts.map((item) => (
        <button
          type="button"
          key={item.id}
          className="edash-chip"
          style={{ cursor: "pointer", border: "none" }}
          onClick={() =>
            void download(`/estates/payments/${transaction.id}/evidence/${item.id}/download`, item.filename).catch(() => window.alert("Receipt could not be downloaded."))
          }
        >
          {item.filename}
        </button>
      ))}
    </div>
  );
}

function CustomerStatement({ statement }: { statement: Statement }) {
  const [busy, setBusy] = useState(false);
  const downloadPdf = async () => {
    setBusy(true);
    try {
      await download(`/estates/customers/${statement.customer.id}/statement.pdf`, `${statement.customer.name || "customer"}-payment-statement.pdf`);
    } catch {
      window.alert("The statement PDF could not be downloaded.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <button type="button" className="edash-btn-primary" style={{ marginBottom: 12 }} disabled={busy} onClick={() => void downloadPdf()}>
        {busy ? "Preparing..." : "Download statement (PDF)"}
      </button>
      <p className="edash-status-row-desc" style={{ marginBottom: 12 }}>
        {statement.organization.name}<br />
        {statement.customer.name} {statement.customer.reference ? `(${statement.customer.reference})` : ""}<br />
        {new Date(statement.statement_date).toLocaleString()}
      </p>
      {statement.allocations.map((allocation) => (
        <div key={allocation.allocation_id} style={{ marginBottom: 16 }}>
          <div className="edash-card-head"><h3 className="edash-card-title" style={{ fontSize: "0.86rem" }}>{allocation.estate} / {allocation.plot}</h3></div>
          <p className="edash-status-row-desc" style={{ marginBottom: 8 }}>
            Allocation date: {allocation.allocation_date ? new Date(allocation.allocation_date).toLocaleDateString() : "Not yet allocated"}. Agreed price: {money(allocation.agreed_price)}{allocation.payment_plan ? ` · Payment plan: ${allocation.payment_plan}` : ""}
          </p>
          {allocation.transactions.length ? (
            <div style={{ overflowX: "auto" }}>
              <table className="edash-mini-table">
                <thead><tr><th>Date</th><th>Reference</th><th>Method</th><th>Amount</th><th>Status</th><th>Receipt</th></tr></thead>
                <tbody>
                  {allocation.transactions.map((transaction: any, index: number) => (
                    <tr key={index}>
                      <td data-label="Date">{new Date(transaction.date).toLocaleDateString()}</td>
                      <td data-label="Reference">{transaction.reference || "-"}</td>
                      <td data-label="Method">{paymentMethodLabel(transaction.method)}</td>
                      <td data-label="Amount">{money(transaction.amount)}</td>
                      <td data-label="Status"><PaymentStatusBadge status={transaction.status} /></td>
                      <td data-label="Receipt">{transaction.receipt_number ? <span>{transaction.receipt_number}</span> : renderReceiptCell(transaction)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="edash-tab-empty" style={{ padding: "6px 0" }}>No payments recorded against this plot yet.</p>}
          <p className="edash-status-row-desc" style={{ marginTop: 8 }}>Confirmed total: {money(allocation.confirmed_paid)}. Pending total: {money(allocation.pending_paid)}. Outstanding balance: {money(allocation.outstanding)}.</p>
        </div>
      ))}
    </div>
  );
}

function PaymentTable({ rows, open, onConfirm }: { rows: Payment[]; open: (id: number) => void; onConfirm: (id: number) => void }) {
  if (!rows.length) return <p className="edash-tab-empty">No payments match this filter yet.</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="edash-mini-table">
        <thead><tr><th>Date</th><th>Customer</th><th>Estate / Plot</th><th>Amount</th><th>Status</th><th>Method</th><th>Reference</th><th /></tr></thead>
        <tbody>
          {rows.map((payment) => (
            <tr key={payment.id} style={{ cursor: "pointer" }} onClick={() => open(payment.id)}>
              <td data-label="Date">{new Date(payment.date).toLocaleDateString()}</td>
              <td data-label="Customer">{payment.customer.name}</td>
              <td data-label="Estate / Plot">{payment.estate.name} / {payment.plot.number}</td>
              <td data-label="Amount">{money(payment.amount, payment.currency)}</td>
              <td data-label="Status"><PaymentStatusBadge status={payment.status} /></td>
              <td data-label="Method">{paymentMethodLabel(payment.method)}</td>
              <td data-label="Reference">{payment.reference || "-"}</td>
              <td>
                {payment.can_confirm && (
                  <button
                    type="button"
                    className="edash-btn-primary"
                    onClick={(event) => { event.stopPropagation(); onConfirm(payment.id); }}
                  >
                    Confirm
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({ page, total, change }: { page: number; total: number; change: (page: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 12 }}>
      <button type="button" className="edash-btn-outline" disabled={page === 1} onClick={() => change(page - 1)}>Previous</button>
      <span className="edash-status-row-desc">Page {page} of {Math.max(1, Math.ceil(total / 20))}</span>
      <button type="button" className="edash-btn-outline" disabled={page * 20 >= total} onClick={() => change(page + 1)}>Next</button>
    </div>
  );
}
