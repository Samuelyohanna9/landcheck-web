import { useState } from "react";

// Mirrors app/services/estates/billing_plans.py exactly - if the price ever changes, update both
// (the backend is the source of truth for what's actually charged; this is display copy only).
export const ESTATE_PLANS = {
  basic: { label: "Basic", monthly: 19500, yearly: 220000, hazardAnalysis: false },
  plus: { label: "Plus", monthly: 24500, yearly: 285000, hazardAnalysis: true },
} as const;

export type EstatePlanKey = keyof typeof ESTATE_PLANS;
export type EstateBillingCycle = "monthly" | "yearly";

const naira = (value: number) => `₦${value.toLocaleString()}`;

const PLAN_FEATURES: Record<EstatePlanKey, string[]> = {
  basic: [
    "Estate, plot and block management",
    "Customers, reservations and allocations",
    "Payments, receipts and customer statements",
    "Sales-agent commission ladder and payouts",
    "Survey plan production, staking and DGPS export",
    "Documents and audit timeline",
  ],
  plus: [
    "Everything in Basic",
    "Flood and erosion hazard analysis",
    "Whole-layout hazard screening",
  ],
};

export default function EstatePricingCards({
  billingCycle: controlledCycle,
  onCycleChange,
  onSelectPlan,
  ctaLabel = () => "Start free trial",
  busyPlan,
}: {
  billingCycle?: EstateBillingCycle;
  onCycleChange?: (cycle: EstateBillingCycle) => void;
  onSelectPlan: (plan: EstatePlanKey, cycle: EstateBillingCycle) => void;
  ctaLabel?: (plan: EstatePlanKey) => string;
  busyPlan?: EstatePlanKey | null;
}) {
  const [internalCycle, setInternalCycle] = useState<EstateBillingCycle>("monthly");
  const billingCycle = controlledCycle ?? internalCycle;
  const setBillingCycle = onCycleChange ?? setInternalCycle;

  return (
    <div className="estate-pricing">
      <div className="estate-pricing-toggle" role="group" aria-label="Billing cycle">
        <button type="button" className={billingCycle === "monthly" ? "active" : ""} onClick={() => setBillingCycle("monthly")}>Monthly</button>
        <button type="button" className={billingCycle === "yearly" ? "active" : ""} onClick={() => setBillingCycle("yearly")}>Yearly</button>
      </div>
      <div className="estate-pricing-grid">
        {(Object.keys(ESTATE_PLANS) as EstatePlanKey[]).map((key) => {
          const plan = ESTATE_PLANS[key];
          const price = billingCycle === "monthly" ? plan.monthly : plan.yearly;
          return (
            <div key={key} className={`estate-pricing-card${key === "plus" ? " estate-pricing-card--featured" : ""}`}>
              {key === "plus" && <span className="estate-pricing-badge">Includes hazard analysis</span>}
              <h3>{plan.label}</h3>
              <p className="estate-pricing-price">{naira(price)}<span>/{billingCycle === "monthly" ? "month" : "year"}</span></p>
              <p className="estate-pricing-trial">3-day free trial &middot; cancel anytime</p>
              <ul className="estate-pricing-features">
                {PLAN_FEATURES[key].map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <button
                type="button"
                className={`estate-button${key === "plus" ? "" : " estate-button--outline"}`}
                style={{ width: "100%", justifyContent: "center" }}
                disabled={busyPlan === key}
                onClick={() => onSelectPlan(key, billingCycle)}
              >
                {busyPlan === key ? "Starting..." : ctaLabel(key)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
