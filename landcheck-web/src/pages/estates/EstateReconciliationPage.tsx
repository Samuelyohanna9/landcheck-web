import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import EstateModal from "../../components/estates/EstateModal";

type InboxItem = { id: number; amount: string; payment_date: string; payer_name?: string | null; payer_reference?: string | null; source: string };
type Allocation = { id: number; estate_id: number; estate_name: string; plot_number: string; customer_name: string; outstanding: string };
type EstateOption = { id: number; name: string };
const money = (value: string) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value || 0));

function localDateTimeValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function EstateReconciliationPage() {
  const [estateId, setEstateId] = useState("");
  const [estateName, setEstateName] = useState("Estate");
  const [estates, setEstates] = useState<EstateOption[]>([]);
  const [rows, setRows] = useState<InboxItem[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [recordBusy, setRecordBusy] = useState(false);
  const [incomingAmount, setIncomingAmount] = useState("");
  const [incomingDate, setIncomingDate] = useState(localDateTimeValue);
  const [incomingPayer, setIncomingPayer] = useState("");
  const [incomingReference, setIncomingReference] = useState("");
  const [incomingSource, setIncomingSource] = useState("bank_transfer");

  const load = async () => {
    try {
      const [estateResponse, inbox, selectors] = await Promise.all([api.get("/estates"), api.get("/estates/payment-inbox"), api.get("/estates/selectors")]);
      const estateOptions = Array.isArray(estateResponse.data) ? estateResponse.data : [];
      setEstates(estateOptions);
      setEstateId(String(estateOptions[0]?.id || "")); setEstateName(estateOptions[0]?.name || "Estate"); setRows(inbox.data || []); setAllocations(selectors.data?.allocations || []);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Payment reconciliation could not be loaded.")); }
  };
  useEffect(() => { void load(); }, []);

  const match = async (row: InboxItem) => {
    const allocationId = selected[row.id];
    if (!allocationId) { toast.error("Choose the buyer and plot first."); return; }
    setBusy(row.id);
    try { await api.post(`/estates/payment-inbox/${row.id}/match`, { allocation_id: Number(allocationId), payment_method: "bank_transfer" }); toast.success("Payment matched and recorded for confirmation."); await load(); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Payment could not be matched.")); }
    finally { setBusy(null); }
  };
  const ignore = async (row: InboxItem) => { setBusy(row.id); try { await api.post(`/estates/payment-inbox/${row.id}/ignore`); await load(); } catch (error) { toast.error(await extractApiErrorMessage(error, "Payment could not be dismissed.")); } finally { setBusy(null); } };

  const recordIncomingPayment = async () => {
    if (!estateId || !incomingAmount || Number(incomingAmount) <= 0 || !incomingDate) {
      toast.error("Choose an Estate and enter the payment amount and date.");
      return;
    }
    setRecordBusy(true);
    try {
      await api.post("/estates/payment-inbox", {
        estate_id: Number(estateId),
        amount: Number(incomingAmount),
        payment_date: new Date(incomingDate).toISOString(),
        payer_name: incomingPayer.trim() || null,
        payer_reference: incomingReference.trim() || null,
        source: incomingSource,
      });
      toast.success("Payment notice added to reconciliation.");
      setShowRecordPayment(false); setIncomingAmount(""); setIncomingPayer(""); setIncomingReference(""); setIncomingDate(localDateTimeValue());
      await load();
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Payment notice could not be added.")); }
    finally { setRecordBusy(false); }
  };

  return (
    <EstateShell estateId={estateId || "0"} estateName={estateName} activeKey="reconciliation">
      <div className="edash-page-head"><div><span className="edash-section-kicker">Finance control</span><h1>Payment reconciliation</h1><p>Record incoming payment notices, match them to the correct buyer and plot, and keep one auditable payment record.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" className="edash-btn-primary" disabled={!estates.length} onClick={() => setShowRecordPayment(true)}><EstateIcon name="payments" /> Record payment notice</button><button type="button" className="edash-btn-outline" onClick={() => void load()}><EstateIcon name="activity" /> Refresh</button></div></div>
      <div className="edash-card"><div className="edash-card-inner"><div className="edash-card-head"><div><h2 className="edash-card-title">Unmatched payments ({rows.length})</h2><p className="edash-ops-card-subtitle">Each match creates a normal pending-confirmation payment and keeps an audit trail.</p></div></div>
        {rows.length ? <div className="edash-reconciliation-list">{rows.map((row) => <div className="edash-reconciliation-row" key={row.id}><div><strong>{money(row.amount)}</strong><small>{new Date(row.payment_date).toLocaleDateString()} - {row.payer_name || "Payer not supplied"} - {row.source}</small><small>Reference: {row.payer_reference || "None"}</small></div><select value={selected[row.id] || ""} onChange={(event) => setSelected((current) => ({ ...current, [row.id]: event.target.value }))}><option value="">Select buyer / plot</option>{allocations.filter((allocation) => Number(allocation.outstanding || 0) >= Number(row.amount)).map((allocation) => <option value={allocation.id} key={allocation.id}>{allocation.customer_name} - {allocation.estate_name} / {allocation.plot_number}</option>)}</select><div><button type="button" className="edash-btn-primary" disabled={busy === row.id} onClick={() => void match(row)}>Match</button><button type="button" className="edash-btn-outline" disabled={busy === row.id} onClick={() => void ignore(row)}>Ignore</button></div></div>)}</div> : <div className="edash-ops-empty"><EstateIcon name="check-circle" /><strong>No unmatched payments</strong><span>This queue is empty because no bank or online payment notice is waiting to be matched. Record a transfer here, then select the buyer and plot to create the proper payment and receipt.</span><button type="button" className="edash-btn-primary" disabled={!estates.length} onClick={() => setShowRecordPayment(true)}>Record a payment notice</button></div>}
      </div></div>
      {showRecordPayment && <EstateModal title="Record incoming payment" subtitle="Add a bank or online payment notice before matching it to a buyer and plot." onClose={() => setShowRecordPayment(false)}>
        <label className="edash-field" style={{ marginBottom: 12 }}><span>Estate</span><select value={estateId} onChange={(event) => { const value = event.target.value; setEstateId(value); setEstateName(estates.find((estate) => String(estate.id) === value)?.name || "Estate"); }}><option value="">Select Estate</option>{estates.map((estate) => <option key={estate.id} value={estate.id}>{estate.name}</option>)}</select></label>
        <label className="edash-field" style={{ marginBottom: 12 }}><span>Amount (NGN)</span><input type="number" min="0.01" step="0.01" value={incomingAmount} onChange={(event) => setIncomingAmount(event.target.value)} autoFocus placeholder="Amount received" /></label>
        <label className="edash-field" style={{ marginBottom: 12 }}><span>Payment date and time</span><input type="datetime-local" value={incomingDate} onChange={(event) => setIncomingDate(event.target.value)} /></label>
        <label className="edash-field" style={{ marginBottom: 12 }}><span>Payer name (optional)</span><input value={incomingPayer} onChange={(event) => setIncomingPayer(event.target.value)} placeholder="Name on transfer" /></label>
        <label className="edash-field" style={{ marginBottom: 12 }}><span>Bank / payment reference (optional)</span><input value={incomingReference} onChange={(event) => setIncomingReference(event.target.value)} placeholder="Transaction reference" /></label>
        <label className="edash-field" style={{ marginBottom: 14 }}><span>Source</span><select value={incomingSource} onChange={(event) => setIncomingSource(event.target.value)}><option value="bank_transfer">Bank transfer</option><option value="online_payment">Online payment</option><option value="cash">Cash</option><option value="other">Other</option></select></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" className="edash-btn-primary" disabled={recordBusy} onClick={() => void recordIncomingPayment()}>{recordBusy ? "Adding..." : "Add to reconciliation"}</button><button type="button" className="edash-btn-outline" onClick={() => setShowRecordPayment(false)}>Cancel</button></div>
      </EstateModal>}
    </EstateShell>
  );
}
