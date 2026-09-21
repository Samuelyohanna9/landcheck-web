import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";

type InboxItem = { id: number; amount: string; payment_date: string; payer_name?: string | null; payer_reference?: string | null; source: string };
type Allocation = { id: number; estate_id: number; estate_name: string; plot_number: string; customer_name: string; outstanding: string };
const money = (value: string) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value || 0));

export default function EstateReconciliationPage() {
  const [estateId, setEstateId] = useState("");
  const [estateName, setEstateName] = useState("Estate");
  const [rows, setRows] = useState<InboxItem[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const load = async () => {
    try {
      const [estates, inbox, selectors] = await Promise.all([api.get("/estates"), api.get("/estates/payment-inbox"), api.get("/estates/selectors")]);
      setEstateId(String(estates.data?.[0]?.id || "")); setEstateName(estates.data?.[0]?.name || "Estate"); setRows(inbox.data || []); setAllocations(selectors.data?.allocations || []);
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

  return (
    <EstateShell estateId={estateId || "0"} estateName={estateName} activeKey="reconciliation">
      <div className="edash-page-head"><div><span className="edash-section-kicker">Finance control</span><h1>Payment reconciliation</h1><p>Match bank or online payment notifications to the correct buyer and plot without creating duplicate payments.</p></div><button type="button" className="edash-btn-outline" onClick={() => void load()}><EstateIcon name="activity" /> Refresh</button></div>
      <div className="edash-card"><div className="edash-card-inner"><div className="edash-card-head"><div><h2 className="edash-card-title">Unmatched payments ({rows.length})</h2><p className="edash-ops-card-subtitle">Each match creates a normal pending-confirmation payment and keeps an audit trail.</p></div></div>
        {rows.length ? <div className="edash-reconciliation-list">{rows.map((row) => <div className="edash-reconciliation-row" key={row.id}><div><strong>{money(row.amount)}</strong><small>{new Date(row.payment_date).toLocaleDateString()} · {row.payer_name || "Payer not supplied"} · {row.source}</small><small>Reference: {row.payer_reference || "None"}</small></div><select value={selected[row.id] || ""} onChange={(event) => setSelected((current) => ({ ...current, [row.id]: event.target.value }))}><option value="">Select buyer / plot</option>{allocations.filter((allocation) => Number(allocation.outstanding || 0) >= Number(row.amount)).map((allocation) => <option value={allocation.id} key={allocation.id}>{allocation.customer_name} · {allocation.estate_name} / {allocation.plot_number}</option>)}</select><div><button type="button" className="edash-btn-primary" disabled={busy === row.id} onClick={() => void match(row)}>Match</button><button type="button" className="edash-btn-outline" disabled={busy === row.id} onClick={() => void ignore(row)}>Ignore</button></div></div>)}</div> : <div className="edash-ops-empty"><EstateIcon name="check-circle" /><strong>No unmatched payments</strong><span>New imported payments will appear here until finance links them to a buyer and plot.</span></div>}
      </div></div>
    </EstateShell>
  );
}
