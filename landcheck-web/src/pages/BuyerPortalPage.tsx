import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, extractApiErrorMessage } from "../api/client";

type PortalDocument = { id: number; filename: string; type: string };
type PortalAllocation = {
  allocation_id: number;
  status: string;
  estate?: { name: string } | null;
  plot?: { number: string; area_sqm: number };
  financial: { agreed_price: string; confirmed_paid: string; outstanding: string; percentage: string };
  payment_plan?: string | null;
  next_payment_due_at?: string | null;
  survey_status: string;
  reservation_expires_at?: string | null;
  document_readiness: { complete: boolean; stages: Array<{ label: string; status: string }> };
  documents: PortalDocument[];
  payments: Array<{ date: string; amount: string; status: string; receipt_number?: string | null }>;
};
type Portal = {
  customer?: { name: string; reference?: string | null };
  expires_at: string;
  allocations: PortalAllocation[];
};

const money = (value: string | number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value || 0));

function paymentScheduleLabel(plan?: string | null) {
  if (!plan) return null;
  try {
    const parsed = JSON.parse(plan);
    if (parsed?.installment_amount && parsed?.interval_months) {
      return `${money(parsed.installment_amount)} every ${parsed.interval_months} month${parsed.interval_months === 1 ? "" : "s"} after the first payment`;
    }
  } catch { /* legacy free-text plans remain hidden here rather than displayed as an unreliable schedule */ }
  return null;
}

async function download(path: string, filename: string) {
  const response = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BuyerPortalPage() {
  const { token = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [portal, setPortal] = useState<Portal | null>(null);
  const [error, setError] = useState("");
  const [payAmounts, setPayAmounts] = useState<Record<number, string>>({});
  const [payingId, setPayingId] = useState<number | null>(null);
  const [payErrors, setPayErrors] = useState<Record<number, string>>({});
  const paymentResult = searchParams.get("payment_result");

  const loadPortal = () => {
    if (!token) return;
    api.get(`/estates/buyer/${token}`)
      .then((response) => setPortal(response.data))
      .catch(async (reason) => setError(await extractApiErrorMessage(reason, "This buyer portal link is no longer available.")));
  };

  useEffect(() => { loadPortal(); }, [token]);

  useEffect(() => {
    if (!paymentResult) return;
    if (paymentResult === "success") loadPortal();
    const next = new URLSearchParams(searchParams);
    next.delete("payment_result");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payOutstanding = (allocation: PortalAllocation) => {
    const outstanding = Number(allocation.financial.outstanding);
    const raw = payAmounts[allocation.allocation_id];
    const amount = raw ? Number(raw) : outstanding;
    if (!amount || amount <= 0) {
      setPayErrors((prev) => ({ ...prev, [allocation.allocation_id]: "Enter a valid amount." }));
      return;
    }
    if (amount > outstanding + 0.01) {
      setPayErrors((prev) => ({ ...prev, [allocation.allocation_id]: "Amount cannot exceed the outstanding balance." }));
      return;
    }
    setPayErrors((prev) => ({ ...prev, [allocation.allocation_id]: "" }));
    setPayingId(allocation.allocation_id);
    api.post(`/estates/buyer/${token}/allocations/${allocation.allocation_id}/pay`, raw ? { amount } : {})
      .then((response) => { window.location.href = response.data.checkout_url; })
      .catch(async (reason) => {
        const message = await extractApiErrorMessage(reason, "Could not start checkout. Please try again.");
        setPayErrors((prev) => ({ ...prev, [allocation.allocation_id]: message }));
        setPayingId(null);
      });
  };

  if (error) return <main className="estate-buyer-portal"><section className="estate-buyer-panel"><h1>Buyer portal unavailable</h1><p>{error}</p></section></main>;
  if (!portal) return <main className="estate-buyer-portal"><section className="estate-buyer-panel"><p>Loading your LandCheck buyer portal...</p></section></main>;

  return <main className="estate-buyer-portal">
    <header className="estate-buyer-header">
      <div>
        <span className="estate-public-kicker">LandCheck Estates</span>
        <h1>Welcome, {portal.customer?.name || "buyer"}</h1>
        <p>Your plot, payments, documents, and next steps in one place.</p>
      </div>
      <span className="estate-buyer-secure">Private access</span>
    </header>
    {paymentResult === "success" && <div className="estate-buyer-payment-banner is-success">Payment received - thank you. Your balance below has been updated.</div>}
    {paymentResult === "failed" && <div className="estate-buyer-payment-banner is-failed">That payment did not go through. You can try again below.</div>}
    {paymentResult === "pending" && <div className="estate-buyer-payment-banner is-pending">Your payment is still being confirmed. This usually updates within a few minutes.</div>}
    <div className="estate-buyer-grid">
      {portal.allocations.map((allocation) => <section className="estate-buyer-panel" key={allocation.allocation_id}>
        <div className="estate-buyer-panel-head">
          <div>
            <span className="estate-public-kicker">{allocation.estate?.name || "Estate"}</span>
            <h2>Plot {allocation.plot?.number || "-"}</h2>
            <p>{allocation.plot?.area_sqm ? `${allocation.plot.area_sqm.toLocaleString()} m2` : "Area pending"} - {allocation.status}</p>
          </div>
          <button type="button" className="estate-public-primary" onClick={() => void download(`/estates/buyer/${token}/packet/${allocation.allocation_id}.pdf`, `plot-${allocation.plot?.number || allocation.allocation_id}-buyer-packet.pdf`)}>Download buyer packet</button>
        </div>
        <div className="estate-buyer-progress">
          <div><span>Payment progress</span><strong>{Number(allocation.financial.percentage).toFixed(0)}%</strong></div>
          <div className="estate-buyer-progress-track"><span style={{ width: `${Math.min(100, Math.max(0, Number(allocation.financial.percentage)))}%` }} /></div>
          <div className="estate-buyer-money"><span>Confirmed {money(allocation.financial.confirmed_paid)}</span><strong>Outstanding {money(allocation.financial.outstanding)}</strong></div>
          {Number(allocation.financial.outstanding) > 0 && <div className="estate-buyer-pay-row">
            <input
              type="number"
              min={1}
              placeholder={`Full balance (${money(allocation.financial.outstanding)})`}
              value={payAmounts[allocation.allocation_id] || ""}
              onChange={(event) => setPayAmounts((prev) => ({ ...prev, [allocation.allocation_id]: event.target.value }))}
            />
            <button
              type="button"
              className="estate-public-primary"
              disabled={payingId === allocation.allocation_id}
              onClick={() => payOutstanding(allocation)}
            >{payingId === allocation.allocation_id ? "Opening checkout..." : "Pay online"}</button>
          </div>}
          {payErrors[allocation.allocation_id] && <p className="estate-buyer-pay-error">{payErrors[allocation.allocation_id]}</p>}
        </div>
        <div className="estate-buyer-status-grid">
          <div><span>Survey</span><strong>{allocation.survey_status.replaceAll("_", " ")}</strong></div>
          <div><span>Documents</span><strong>{allocation.document_readiness.complete ? "Ready" : "In progress"}</strong></div>
          {allocation.reservation_expires_at && <div><span>Reservation deadline</span><strong>{new Date(allocation.reservation_expires_at).toLocaleDateString()}</strong></div>}
          {allocation.next_payment_due_at && <div><span>Next payment due</span><strong>{new Date(allocation.next_payment_due_at).toLocaleDateString()}</strong></div>}
          {paymentScheduleLabel(allocation.payment_plan) && <div><span>Instalment schedule</span><strong>{paymentScheduleLabel(allocation.payment_plan)}</strong><small>One reminder is sent up to 7 days before each next due date.</small></div>}
        </div>
        <h3>Document readiness</h3>
        <div className="estate-buyer-checklist">
          {allocation.document_readiness.stages.map((item) => <span className={item.status === "ready" ? "is-ready" : ""} key={item.label}>{item.status === "ready" ? "Ready" : "Missing"} - {item.label}</span>)}
        </div>
        {allocation.documents.length > 0 && <>
          <h3>Available documents</h3>
          <div className="estate-buyer-documents">
            {allocation.documents.map((document) => <button type="button" key={document.id} onClick={() => void download(`/estates/buyer/${token}/documents/${document.id}/download`, document.filename)}>{document.filename}</button>)}
          </div>
        </>}
        <h3>Payment receipts</h3>
        {allocation.payments.length ? <div className="estate-buyer-payments">{allocation.payments.map((payment, index) => <div key={`${payment.date}-${index}`}><span>{new Date(payment.date).toLocaleDateString()}</span><strong>{money(payment.amount)}</strong><small>{payment.status.replaceAll("_", " ")} - {payment.receipt_number || "Receipt pending"}</small></div>)}</div> : <p>No payment has been recorded yet.</p>}
      </section>)}
    </div>
    {!portal.allocations.length && <section className="estate-buyer-panel"><h2>No active plot record yet</h2><p>Your Estate team has not linked an active reservation or allocation to this portal.</p></section>}
    <footer>For account questions, contact the Estate company that issued this link. This link expires {new Date(portal.expires_at).toLocaleDateString()}.</footer>
  </main>;
}
