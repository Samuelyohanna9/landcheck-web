import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import { getEstateAuthSession } from "../../auth/estateAuth";
import EstateShell from "../../components/estates/EstateShell";
import EstatePricingCards, { ESTATE_PLANS, type EstateBillingCycle, type EstatePlanKey } from "../../components/estates/EstatePricingCards";
import Spinner from "../../components/estates/EstateSpinner";

type BillingStatus = {
  status: "none" | "trialing" | "active" | "past_due" | "canceled" | "expired";
  plan_key: EstatePlanKey | null;
  plan_label?: string;
  billing_cycle?: EstateBillingCycle;
  amount?: string;
  payment_method?: "card" | "bank_transfer";
  hazard_analysis?: boolean;
  auto_posting?: boolean;
  max_estates?: number | null;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  card_last4?: string | null;
  card_brand?: string | null;
};

type Charge = { id: number; charge_type: string; amount: string; currency: string; status: string; failure_reason?: string | null; attempted_at: string };
type PlanChangeResponse = BillingStatus & { plan_change_status?: string; plan_change_amount?: string };

const STATUS_LABEL: Record<string, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment past due",
  canceled: "Cancelled",
  expired: "Expired",
  none: "No subscription",
};

const money = (value?: string) => (value ? `₦${Number(value).toLocaleString()}` : "");

export default function EstateBillingPage() {
  const navigate = useNavigate();
  const session = getEstateAuthSession();
  const organizationId = session?.user.organization_id;

  const [sidebarEstateId, setSidebarEstateId] = useState("");
  const [sidebarEstateName, setSidebarEstateName] = useState("");
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyPlan, setBusyPlan] = useState<EstatePlanKey | null>(null);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("payment_result");
    if (!result) return;
    if (result === "success") toast.success("Payment received. Your subscription and plan are up to date.");
    else if (result === "pending") toast("Payment authorization is still pending. We will update billing when it completes.");
    else toast.error("Payment was not completed. You can try again from Billing & plan.");
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  useEffect(() => {
    api.get("/estates").then((response) => {
      const first = (response.data || [])[0];
      if (first) { setSidebarEstateId(String(first.id)); setSidebarEstateName(first.name); }
    }).catch(() => undefined);
  }, []);

  const load = async () => {
    if (!organizationId) return;
    try {
      const [statusResponse, chargesResponse] = await Promise.all([
        api.get("/estates/billing/status", { params: { organization_id: organizationId } }),
        api.get("/estates/billing/charges", { params: { organization_id: organizationId } }),
      ]);
      setStatus(statusResponse.data);
      setCharges(chargesResponse.data || []);
    } catch (err) {
      toast.error(await extractApiErrorMessage(err, "Billing details could not be loaded."));
    }
  };

  useEffect(() => { void load(); }, [organizationId]);

  const upgrade = async (planKey: EstatePlanKey) => {
    if (!organizationId) return;
    setBusy(true);
    setBusyPlan(planKey);
    try {
      const response = await api.post<PlanChangeResponse>("/estates/billing/change-plan", { plan_key: planKey }, { params: { organization_id: organizationId } });
      const checkoutUrl = String((response.data as { checkout_url?: string })?.checkout_url || "");
      if (checkoutUrl) {
        toast(`Opening secure payment for the ${money(response.data.plan_change_amount)} upgrade...`);
        window.location.assign(checkoutUrl);
        return;
      }
      if (response.data?.plan_change_status === "pending") {
        toast("Upgrade payment is pending. Your plan will update after the payment is confirmed.");
      } else if (Number(response.data?.plan_change_amount || 0) > 0) {
        toast.success(`You're now on ${ESTATE_PLANS[planKey].label}. ${money(response.data.plan_change_amount)} was charged for the upgrade difference.`);
      } else {
        toast.success(`You're now on the ${ESTATE_PLANS[planKey].label} plan.`);
      }
      setShowUpgrade(false);
      await load();
    } catch (err) {
      toast.error(await extractApiErrorMessage(err, "Plan could not be changed."));
    } finally {
      setBusy(false);
      setBusyPlan(null);
    }
  };

  const cancel = async () => {
    if (!organizationId || !window.confirm("Cancel your subscription? You'll keep access until the end of your current billing period.")) return;
    setBusy(true);
    try {
      await api.post("/estates/billing/cancel", {}, { params: { organization_id: organizationId } });
      toast.success("Your subscription has been cancelled.");
      await load();
    } catch (err) {
      toast.error(await extractApiErrorMessage(err, "Subscription could not be cancelled."));
    } finally {
      setBusy(false);
    }
  };

  const recoverPayment = async () => {
    if (!organizationId) return;
    setBusy(true);
    try {
      const response = await api.post("/estates/billing/payment-checkout", {}, { params: { organization_id: organizationId } });
      const checkoutUrl = String(response.data?.checkout_url || "");
      if (!checkoutUrl) throw new Error("Payment checkout was not created.");
      window.location.assign(checkoutUrl);
    } catch (err) {
      toast.error(await extractApiErrorMessage(err, "Payment checkout could not be started."));
      setBusy(false);
    }
  };

  if (!organizationId) return null;

  return (
    <EstateShell estateId={sidebarEstateId} estateName={sidebarEstateName} activeKey="settings" pageTitle="Billing & plan" skipBillingGate>
      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Billing &amp; plan</h3></div>
          {!status ? (
            <p className="edash-tab-empty"><Spinner size={13} /> Loading...</p>
          ) : (
            <>
              {status.status === "past_due" && (
                <div className="edash-banner tone-danger" style={{ marginBottom: 16 }}>
                  Your free trial has ended and your last payment didn't go through. Subscribe below to keep using LandCheck Estates - your estates, plots, and records are safe and waiting.
                </div>
              )}
              {status.status === "canceled" && (
                <div className="edash-banner tone-danger" style={{ marginBottom: 16 }}>
                  Your subscription has been cancelled. Subscribe below to regain access - your estates, plots, and records are safe and waiting.
                </div>
              )}
              {status.status === "expired" && (
                <div className="edash-banner tone-danger" style={{ marginBottom: 16 }}>
                  Your subscription has expired. Subscribe below to regain access - your estates, plots, and records are safe and waiting.
                </div>
              )}
              <div className="edash-overview-grid edash-overview-grid--3" style={{ marginBottom: 16 }}>
                <div className="edash-overview-field"><span>Plan</span><strong>{status.plan_label || "-"}</strong></div>
                <div className="edash-overview-field"><span>Status</span><strong>{STATUS_LABEL[status.status] || status.status}</strong></div>
                <div className="edash-overview-field">
                  <span>{status.status === "trialing" ? "Trial ends" : "Renews"}</span>
                  <strong>{(status.status === "trialing" ? status.trial_ends_at : status.current_period_end) ? new Date((status.status === "trialing" ? status.trial_ends_at : status.current_period_end) as string).toLocaleDateString() : "-"}</strong>
                </div>
                <div className="edash-overview-field"><span>Amount</span><strong>{money(status.amount)} / {status.billing_cycle === "yearly" ? "year" : "month"}</strong></div>
                <div className="edash-overview-field"><span>Card on file</span><strong>{status.card_last4 ? `${status.card_brand || "Card"} ending ${status.card_last4}` : "None"}</strong></div>
                <div className="edash-overview-field"><span>Payment method</span><strong>{status.payment_method === "bank_transfer" ? "Bank transfer" : status.payment_method === "card" ? "Card" : "Not set"}</strong></div>
                {status.cancel_at_period_end && <div className="edash-overview-field"><span>Cancellation</span><strong>Ends at period end</strong></div>}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {status.plan_key !== "enterprise" && status.status !== "none" && !showUpgrade && (
                  <button type="button" className="edash-btn-primary" onClick={() => setShowUpgrade(true)}>{status.plan_key === "pro" ? "Upgrade to Enterprise" : "Upgrade plan"}</button>
                )}
                {["trialing", "active"].includes(status.status) && !status.cancel_at_period_end && (
                  <button type="button" className="edash-btn-outline" disabled={busy} onClick={() => void cancel()}>Cancel subscription</button>
                )}
                {["past_due", "canceled", "expired"].includes(status.status) && status.plan_key ? (
                  <button type="button" className="edash-btn-primary" disabled={busy} onClick={() => void recoverPayment()}>{busy ? "Opening payment..." : "Retry payment"}</button>
                ) : status.status === "none" ? (
                  <button type="button" className="edash-btn-primary" onClick={() => navigate("/estates/choose-plan")}>Choose a plan</button>
                ) : null}
              </div>
              {showUpgrade && (
                <div style={{ marginTop: 20 }}>
                  <p className="edash-field-note" style={{ marginBottom: 12 }}>
                    {status.status === "trialing"
                      ? "No charge is made during your trial. The new plan is charged when the trial converts."
                      : "Upgrading now charges only the price difference for this billing period. Your next renewal uses the full price of the new plan."}
                  </p>
                  <EstatePricingCards onSelectPlan={(planKey) => void upgrade(planKey)} busyPlan={busyPlan} currentPlan={status.plan_key} ctaLabel={(planKey) => (planKey === status.plan_key ? "Current plan" : "Switch to this plan")} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Billing history</h3></div>
          {charges.length ? (
            <table className="edash-mini-table">
              <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {charges.map((charge) => (
                  <tr key={charge.id}>
                    <td data-label="Date">{new Date(charge.attempted_at).toLocaleDateString()}</td>
                    <td data-label="Type" style={{ textTransform: "capitalize" }}>{charge.charge_type.replaceAll("_", " ")}</td>
                    <td data-label="Amount">{money(charge.amount)}</td>
                    <td data-label="Status">
                      <span className={`edash-status-pill tone-${charge.status === "success" ? "good" : charge.status === "pending" ? "neutral" : "danger"}`}>{charge.status}</span>
                      {charge.status === "failed" && charge.failure_reason && (
                        <div className="edash-field-note" style={{ marginTop: 4 }}>{charge.failure_reason}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="edash-tab-empty">No charges recorded yet.</p>}
        </div>
      </div>
    </EstateShell>
  );
}
