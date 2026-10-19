import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, extractApiErrorMessage } from "../api/client";
import EstateIcon from "../components/estates/EstateIcon";
// Buyers open this page directly from an SMS/WhatsApp/email link - never via in-app navigation
// from the staff dashboard - so estate-dashboard.css (home of every .estate-buyer-* rule below)
// must be imported here explicitly. It was previously only ever loaded as a side effect of
// EstateShell.tsx/Estates.tsx, which meant a genuinely fresh page load rendered completely
// unstyled for real buyers.
import "../styles/estate-dashboard.css";

type PortalDocument = { id: number; filename: string; type: string };
type PortalAllocation = {
  allocation_id: number;
  status: string;
  estate?: { name: string } | null;
  plot?: { number: string; area_sqm: number };
  financial: { agreed_price: string; confirmed_paid: string; outstanding: string; percentage: string };
  payment_plan?: string | null;
  next_payment_due_at?: string | null;
  online_payments_enabled: boolean;
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
  // Refs, not state: a double-click fires both click handlers before React re-renders the
  // `disabled` prop from state, so the guard against sending two requests has to be checked and
  // set synchronously. The idempotency key is kept per-allocation across retries of the SAME
  // click (e.g. the request is still in flight) and only cleared once that attempt resolves, so
  // a genuine resubmission of an in-flight payment reuses the same server-side key instead of
  // opening a second checkout.
  const payInFlightRef = useRef<Set<number>>(new Set());
  const payIdempotencyKeysRef = useRef<Record<number, string>>({});

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
    const allocationId = allocation.allocation_id;
    if (payInFlightRef.current.has(allocationId)) return; // synchronous double-click guard
    const outstanding = Number(allocation.financial.outstanding);
    const raw = payAmounts[allocationId];
    const amount = raw ? Number(raw) : outstanding;
    if (!amount || amount <= 0) {
      setPayErrors((prev) => ({ ...prev, [allocationId]: "Enter a valid amount." }));
      return;
    }
    if (amount > outstanding + 0.01) {
      setPayErrors((prev) => ({ ...prev, [allocationId]: "Amount cannot exceed the outstanding balance." }));
      return;
    }
    setPayErrors((prev) => ({ ...prev, [allocationId]: "" }));
    payInFlightRef.current.add(allocationId);
    if (!payIdempotencyKeysRef.current[allocationId]) {
      payIdempotencyKeysRef.current[allocationId] = crypto.randomUUID();
    }
    const idempotencyKey = payIdempotencyKeysRef.current[allocationId];
    setPayingId(allocationId);
    api.post(`/estates/buyer/${token}/allocations/${allocationId}/pay`, raw ? { amount } : {}, { headers: { "X-Idempotency-Key": idempotencyKey } })
      .then((response) => { window.location.href = response.data.checkout_url; })
      .catch(async (reason) => {
        const message = await extractApiErrorMessage(reason, "Could not start checkout. Please try again.");
        setPayErrors((prev) => ({ ...prev, [allocationId]: message }));
        // The attempt behind this key is now resolved (failed) server-side too - a retry click
        // should open a genuinely new attempt, not resubmit a key the server already rejected.
        delete payIdempotencyKeysRef.current[allocationId];
        payInFlightRef.current.delete(allocationId);
        setPayingId(null);
      });
  };

  if (error) return (
    <main className="estate-buyer-portal estate-buyer-portal--centered">
      <section className="estate-buyer-panel estate-buyer-state-card">
        <span className="estate-buyer-state-icon is-danger"><EstateIcon name="alert-triangle" /></span>
        <h1>Buyer portal unavailable</h1>
        <p>{error}</p>
      </section>
    </main>
  );
  if (!portal) return (
    <main className="estate-buyer-portal estate-buyer-portal--centered">
      <section className="estate-buyer-panel estate-buyer-state-card">
        <span className="estate-buyer-spinner" aria-hidden="true" />
        <p>Loading your LandCheck buyer portal...</p>
      </section>
    </main>
  );

  return <main className="estate-buyer-portal">
    <header className="estate-buyer-header">
      <div className="estate-buyer-header-text">
        <span className="estate-buyer-kicker">LandCheck Estates</span>
        <h1>Welcome, {portal.customer?.name || "buyer"}</h1>
        <p>Your plot, payments, documents, and next steps in one place.</p>
      </div>
      <span className="estate-buyer-secure"><EstateIcon name="lock" /> Private access</span>
    </header>
    {paymentResult === "success" && <div className="estate-buyer-payment-banner is-success"><EstateIcon name="check-circle" /><span>Payment received - thank you. Your balance below has been updated.</span></div>}
    {paymentResult === "failed" && <div className="estate-buyer-payment-banner is-failed"><EstateIcon name="alert-triangle" /><span>That payment did not go through. You can try again below.</span></div>}
    {paymentResult === "pending" && <div className="estate-buyer-payment-banner is-pending"><EstateIcon name="clock" /><span>Your payment is still being confirmed. This usually updates within a few minutes.</span></div>}
    <div className="estate-buyer-grid">
      {portal.allocations.map((allocation) => <section className="estate-buyer-panel" key={allocation.allocation_id}>
        <div className="estate-buyer-panel-head">
          <div>
            <span className="estate-buyer-kicker">{allocation.estate?.name || "Estate"}</span>
            <h2>Plot {allocation.plot?.number || "-"}</h2>
            <p>{allocation.plot?.area_sqm ? `${allocation.plot.area_sqm.toLocaleString()} m2` : "Area pending"} <span className="estate-buyer-status-dot" aria-hidden="true" />{allocation.status.replaceAll("_", " ")}</p>
          </div>
          <button type="button" className="estate-buyer-ghost-btn" onClick={() => void download(`/estates/buyer/${token}/packet/${allocation.allocation_id}.pdf`, `plot-${allocation.plot?.number || allocation.allocation_id}-buyer-packet.pdf`)}>
            <EstateIcon name="download" /> Buyer packet
          </button>
        </div>

        <div className="estate-buyer-progress">
          <div className="estate-buyer-progress-head"><span>Payment progress</span><strong>{Number(allocation.financial.percentage).toFixed(0)}%</strong></div>
          <div className="estate-buyer-progress-track"><span style={{ width: `${Math.min(100, Math.max(0, Number(allocation.financial.percentage)))}%` }} /></div>
          <div className="estate-buyer-money">
            <div><span>Confirmed</span><strong>{money(allocation.financial.confirmed_paid)}</strong></div>
            <div><span>Outstanding</span><strong className={Number(allocation.financial.outstanding) > 0 ? "is-outstanding" : undefined}>{money(allocation.financial.outstanding)}</strong></div>
          </div>
          {allocation.online_payments_enabled && Number(allocation.financial.outstanding) > 0 && <div className="estate-buyer-pay-row">
            <input
              type="number"
              min={1}
              placeholder={`Full balance (${money(allocation.financial.outstanding)})`}
              value={payAmounts[allocation.allocation_id] || ""}
              onChange={(event) => setPayAmounts((prev) => ({ ...prev, [allocation.allocation_id]: event.target.value }))}
            />
            <button
              type="button"
              className="estate-buyer-pay-btn"
              disabled={payingId === allocation.allocation_id}
              onClick={() => payOutstanding(allocation)}
            >{payingId === allocation.allocation_id ? "Opening checkout..." : "Pay online"}</button>
          </div>}
          {payErrors[allocation.allocation_id] && <p className="estate-buyer-pay-error">{payErrors[allocation.allocation_id]}</p>}
        </div>

        <div className="estate-buyer-status-grid">
          <div className="estate-buyer-stat-tile">
            <EstateIcon name="survey" />
            <div><span>Survey</span><strong>{allocation.survey_status.replaceAll("_", " ")}</strong></div>
          </div>
          <div className="estate-buyer-stat-tile">
            <EstateIcon name="documents" />
            <div><span>Documents</span><strong>{allocation.document_readiness.complete ? "Ready" : "In progress"}</strong></div>
          </div>
          {allocation.reservation_expires_at && <div className="estate-buyer-stat-tile">
            <EstateIcon name="clock" />
            <div><span>Reservation deadline</span><strong>{new Date(allocation.reservation_expires_at).toLocaleDateString()}</strong></div>
          </div>}
          {allocation.next_payment_due_at && <div className="estate-buyer-stat-tile">
            <EstateIcon name="clock" />
            <div><span>Next payment due</span><strong>{new Date(allocation.next_payment_due_at).toLocaleDateString()}</strong></div>
          </div>}
          {paymentScheduleLabel(allocation.payment_plan) && <div className="estate-buyer-stat-tile estate-buyer-stat-tile--wide">
            <EstateIcon name="payments" />
            <div><span>Instalment schedule</span><strong>{paymentScheduleLabel(allocation.payment_plan)}</strong><small>One reminder is sent up to 7 days before each next due date.</small></div>
          </div>}
        </div>

        <h3>Document readiness</h3>
        <div className="estate-buyer-checklist">
          {allocation.document_readiness.stages.map((item) => <span className={item.status === "ready" ? "is-ready" : ""} key={item.label}><EstateIcon name="check-circle" />{item.label}</span>)}
        </div>

        {allocation.documents.length > 0 && <>
          <h3>Available documents</h3>
          <div className="estate-buyer-documents">
            {allocation.documents.map((document) => <button type="button" key={document.id} onClick={() => void download(`/estates/buyer/${token}/documents/${document.id}/download`, document.filename)}><EstateIcon name="download" />{document.filename}</button>)}
          </div>
        </>}

        <h3>Payment receipts</h3>
        {allocation.payments.length ? (
          <div className="estate-buyer-payments">
            {allocation.payments.map((payment, index) => (
              <div key={`${payment.date}-${index}`}>
                <div className="estate-buyer-payments-date">{new Date(payment.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</div>
                <div className="estate-buyer-payments-amount">{money(payment.amount)}</div>
                <div className={`estate-buyer-payments-status status-${payment.status}`}>{payment.status.replaceAll("_", " ")}</div>
                <div className="estate-buyer-payments-receipt">{payment.receipt_number || "Receipt pending"}</div>
              </div>
            ))}
          </div>
        ) : <p className="estate-buyer-empty-note">No payment has been recorded yet.</p>}
      </section>)}
    </div>
    {!portal.allocations.length && <section className="estate-buyer-panel estate-buyer-state-card"><h2>No active plot record yet</h2><p>Your Estate team has not linked an active reservation or allocation to this portal.</p></section>}
    <footer>For account questions, contact the Estate company that issued this link. This link expires {new Date(portal.expires_at).toLocaleDateString()}.</footer>
  </main>;
}
