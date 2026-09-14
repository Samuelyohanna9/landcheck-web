import { useEffect, useState } from "react";
import { api, extractApiErrorMessage } from "../api/client";
import { FinancialSummaryCards, PaymentStatusBadge, money } from "../components/estates/FinancialComponents";
import EstateShell from "../components/estates/EstateShell";
import EstateModal from "../components/estates/EstateModal";
import EstateIcon from "../components/estates/EstateIcon";

type Payment = { id: number; date: string; amount: string; currency: string; status: string; method: string; reference?: string; customer: { name: string }; estate: { name: string }; plot: { number: string } };
type Allocation = { id: number; estate_name: string; plot_number: string; customer_name: string };
type Customer = { id: number; name: string };
type Detail = { payment: Payment & { notes?: string }; customer: { name: string }; estate: { name: string }; plot: { number: string }; financial: { agreed_price: string; confirmed: string; pending: string; outstanding: string }; capabilities: { can_confirm: boolean; can_void: boolean }; evidence: { id: number; filename: string }[] };
type Statement = { organization: { name: string }; customer: { name: string; reference?: string }; statement_date: string; allocations: any[] };

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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [customerDetail, setCustomerDetail] = useState<any>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [showStatement, setShowStatement] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [documentType, setDocumentType] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const fail = async (error: unknown, message: string) => setError(await extractApiErrorMessage(error, message));

  const setup = async () => {
    const [selectors, totals] = await Promise.all([api.get("/estates/selectors"), api.get("/estates/financial-summary")]);
    setAllocations(selectors.data.allocations || []);
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

  const record = async () => {
    if (!allocationId || !amount) { setError("Select an allocation and enter an amount."); return; }
    try {
      const made = await api.post(`/estates/allocations/${allocationId}/payments`, { amount, payment_date: paymentDate, payment_method: paymentMethod, reference_no: reference || null });
      setNotice("Payment recorded and pending confirmation.");
      if (receipt) {
        const body = new FormData();
        body.append("file", receipt);
        try { await api.post(`/estates/payments/${made.data.id}/evidence`, body); setNotice("Payment recorded and receipt attached."); }
        catch (error) { await fail(error, "Payment was recorded, but the receipt upload failed."); }
      }
      setRecording(false);
      await load();
    } catch (error) {
      await fail(error, "Payment could not be recorded.");
    }
  };

  const act = async (kind: "confirm" | "void") => {
    if (!detail) return;
    const reason = kind === "void" ? window.prompt("Reason for voiding this payment:") : "";
    if (kind === "void" && !reason) return;
    try {
      await api.post(`/estates/payments/${detail.payment.id}/${kind}`, kind === "void" ? { reason } : undefined);
      setDetail(null);
      setNotice(`Payment ${kind}ed.`);
      await load();
    } catch (error) {
      await fail(error, `Payment could not be ${kind}ed.`);
    }
  };

  const upload = async () => {
    if (!file || !documentType || !entityType || !entityId) { setError("Select a file and complete its linked record fields."); return; }
    try {
      const body = new FormData();
      body.append("file", file);
      await api.post("/estates/documents", body, { params: { entity_type: entityType, entity_id: entityId, document_type: documentType } });
      setNotice("Private document uploaded.");
      setFile(null);
      setShowUpload(false);
      await load();
    } catch (error) {
      await fail(error, "Document could not be uploaded.");
    }
  };

  const messages = (
    <>
      {notice && <p className="edash-banner tone-good" style={{ marginBottom: 10 }}>{notice}</p>}
      {error && <p className="edash-banner tone-danger" style={{ marginBottom: 10 }}>{error}</p>}
    </>
  );

  if (!sidebarEstateId) return null;

  if (mode === "documents") {
    return (
      <EstateShell estateId={sidebarEstateId} estateName={sidebarEstateName} activeKey="documents">
        {messages}
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head">
              <h3 className="edash-card-title">Private documents ({total})</h3>
              <button type="button" className="edash-tool-btn" onClick={() => setShowUpload(true)}>
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
                        <td>{row.filename}</td>
                        <td>{row.type}</td>
                        <td>{row.entity_type} #{row.entity_id}</td>
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
            <label className="edash-field" style={{ marginBottom: 12 }}>
              <span>Linked record type</span>
              <select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
                <option value="">Choose a type</option>
                {["estate", "plot", "customer", "allocation", "payment"].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="edash-field" style={{ marginBottom: 12 }}><span>Linked record ID</span><input value={entityId} onChange={(event) => setEntityId(event.target.value)} /></label>
            <label className="edash-field" style={{ marginBottom: 12 }}><span>Document type</span><input value={documentType} onChange={(event) => setDocumentType(event.target.value)} placeholder="e.g. receipt, allocation_letter" /></label>
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
      {messages}

      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Customer financial view</h3></div>
          <select className="edash-map-select" style={{ width: "100%", marginBottom: 10 }} value={customerId} onChange={(event) => void chooseCustomer(event.target.value)}>
            <option value="">Select customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          {customerDetail && <CustomerAllocations detail={customerDetail} />}
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
            <label className="edash-field"><span>Payment method</span><input value={method} onChange={(event) => setMethod(event.target.value)} /></label>
            <label className="edash-field"><span>From</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
            <label className="edash-field"><span>To</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
            <button type="button" className="edash-btn-primary" style={{ alignSelf: "flex-end" }} onClick={() => { setPage(1); void load(); }}>Apply filters</button>
          </div>
        </div>
      </div>

      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Payments ({total})</h3></div>
          <PaymentTable rows={payments} open={async (id) => { try { setDetail((await api.get(`/estates/payments/${id}`)).data); } catch (error) { await fail(error, "Payment detail could not be loaded."); } }} />
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
          <label className="edash-field" style={{ marginBottom: 12 }}><span>Method</span><input value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} /></label>
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

function CustomerAllocations({ detail }: { detail: any }) {
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
          <thead><tr><th>Estate</th><th>Plot</th><th>Agreed</th><th>Confirmed</th><th>Pending</th><th>Outstanding</th><th>Progress</th><th>Payments</th></tr></thead>
          <tbody>
            {detail.allocations.map((allocation: any) => (
              <tr key={allocation.allocation_id}>
                <td>{allocation.estate.name}</td>
                <td>{allocation.plot.number}</td>
                <td>{money(allocation.agreed_price)}</td>
                <td>{money(allocation.confirmed)}</td>
                <td>{money(allocation.pending)}</td>
                <td>{money(allocation.outstanding)}</td>
                <td>{allocation.percentage}%</td>
                <td>{allocation.payment_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CustomerStatement({ statement }: { statement: Statement }) {
  return (
    <div>
      <button type="button" className="edash-btn-outline" style={{ marginBottom: 12 }} onClick={() => window.print()}>Print statement</button>
      <p className="edash-status-row-desc" style={{ marginBottom: 12 }}>
        {statement.organization.name}<br />
        {statement.customer.name} {statement.customer.reference ? `(${statement.customer.reference})` : ""}<br />
        {new Date(statement.statement_date).toLocaleString()}
      </p>
      {statement.allocations.map((allocation) => (
        <div key={allocation.allocation_id} style={{ marginBottom: 16 }}>
          <div className="edash-card-head"><h3 className="edash-card-title" style={{ fontSize: "0.86rem" }}>{allocation.estate} / {allocation.plot}</h3></div>
          <p className="edash-status-row-desc" style={{ marginBottom: 8 }}>Allocation date: {allocation.allocation_date || "-"}. Agreed price: {money(allocation.agreed_price)}{allocation.payment_plan ? ` · Payment plan: ${allocation.payment_plan}` : ""}</p>
          <div style={{ overflowX: "auto" }}>
            <table className="edash-mini-table">
              <thead><tr><th>Date</th><th>Reference</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {allocation.transactions.map((transaction: any, index: number) => (
                  <tr key={index}><td>{transaction.date}</td><td>{transaction.reference || "-"}</td><td>{transaction.method}</td><td>{money(transaction.amount)}</td><td>{transaction.status}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="edash-status-row-desc" style={{ marginTop: 8 }}>Confirmed total: {money(allocation.confirmed_paid)}. Pending total: {money(allocation.pending_paid)}. Outstanding balance: {money(allocation.outstanding)}.</p>
        </div>
      ))}
    </div>
  );
}

function PaymentTable({ rows, open }: { rows: Payment[]; open: (id: number) => void }) {
  if (!rows.length) return <p className="edash-tab-empty">No payments match this filter yet.</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="edash-mini-table">
        <thead><tr><th>Date</th><th>Customer</th><th>Estate / Plot</th><th>Amount</th><th>Status</th><th>Method</th><th>Reference</th></tr></thead>
        <tbody>
          {rows.map((payment) => (
            <tr key={payment.id} style={{ cursor: "pointer" }} onClick={() => open(payment.id)}>
              <td>{new Date(payment.date).toLocaleDateString()}</td>
              <td>{payment.customer.name}</td>
              <td>{payment.estate.name} / {payment.plot.number}</td>
              <td>{money(payment.amount, payment.currency)}</td>
              <td><PaymentStatusBadge status={payment.status} /></td>
              <td>{payment.method}</td>
              <td>{payment.reference || "-"}</td>
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
