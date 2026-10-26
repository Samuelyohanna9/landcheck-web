import { useState } from "react";

// Mirrors app/services/estates/billing_plans.py exactly - if the price ever changes, update both
// (the backend is the source of truth for what's actually charged; this is display copy only).
export const ESTATE_PLANS = {
  basic: { label: "Basic", monthly: 19500, yearly: 220000, hazardAnalysis: false, autoPosting: false, soilAnalysis: false, smsNotifications: false, liveInspections: false, maxEstates: 1 },
  plus: { label: "Plus", monthly: 24500, yearly: 285000, hazardAnalysis: true, autoPosting: false, soilAnalysis: false, smsNotifications: false, liveInspections: false, maxEstates: 3 },
  pro: { label: "Pro", monthly: 48500, yearly: 533500, hazardAnalysis: true, autoPosting: true, soilAnalysis: true, smsNotifications: true, liveInspections: false, maxEstates: 6 },
  enterprise: { label: "Enterprise", monthly: 145000, yearly: 1595000, hazardAnalysis: true, autoPosting: true, soilAnalysis: true, smsNotifications: true, liveInspections: true, maxEstates: null },
} as const;

// Display copy mirrors the backend billing_plans.py source of truth.
export const ESTATE_TRIAL_DAYS = 14;

export type EstatePlanKey = keyof typeof ESTATE_PLANS;
export type EstateBillingCycle = "monthly" | "yearly";
export type EstatePaymentProvider = "flutterwave" | "paystack";

const naira = (value: number) => `₦${value.toLocaleString()}`;

const PLAN_BADGE: Partial<Record<EstatePlanKey, string>> = { plus: "Adds hazard analysis", pro: "Most popular", enterprise: "Everything, unlimited" };

const PLAN_FEATURES: Record<EstatePlanKey, string[]> = {
  basic: [
    "1 estate",
    "Estate, plot and block management",
    "Automatic layout design",
    "Scanned plan georeferencing and AI-assisted digitising",
    "Customer website with live map, reservations and availability updates",
    "Customers, reservations and allocations",
    "Payments, receipts and customer statements",
    "Sales-agent commission ladder and payouts",
    "Survey plan production, staking and DGPS export",
    "Documents and audit timeline",
  ],
  plus: [
    "Manage up to 3 estates",
    "Everything in Basic",
    "Flood and erosion hazard analysis",
    "Whole-layout hazard screening",
  ],
  pro: [
    "Manage up to 6 estates",
    "Everything in Plus",
    "WhatsApp chat with customers, right in the dashboard",
    "Facebook & Instagram posting - write, schedule and publish, then reply to comments and likes from the dashboard",
    "Auto-written posting plans, scheduled for you",
    "Five premium flyer, poster and ad designs",
    "Soil analysis - indicative bearing capacity, water table and drainage",
    "SMS to customers - automatic payment and milestone alerts, plus bulk messages you send",
  ],
  enterprise: [
    "Unlimited estates",
    "Everything in Pro",
    "Live video inspections - a site agent walks a remote buyer through the plot by video call, GPS-verified in real time so they can see it's the real plot - built for diaspora and out-of-town buyers",
    "Built for large developers and multi-estate portfolios",
    "Priority onboarding and support",
  ],
};

export default function EstatePricingCards({
  billingCycle: controlledCycle,
  onCycleChange,
  onSelectPlan,
  ctaLabel = () => "Start free trial",
  busyPlan,
  currentPlan,
  availableProviders,
  provider: controlledProvider,
  onProviderChange,
}: {
  billingCycle?: EstateBillingCycle;
  onCycleChange?: (cycle: EstateBillingCycle) => void;
  onSelectPlan: (plan: EstatePlanKey, cycle: EstateBillingCycle, provider: EstatePaymentProvider) => void;
  ctaLabel?: (plan: EstatePlanKey) => string;
  busyPlan?: EstatePlanKey | null;
  currentPlan?: EstatePlanKey | null;
  /** Which gateways this server has configured - only offer a choice once more than one is
   * live; defaults to Flutterwave-only (today's only gateway) when not supplied. */
  availableProviders?: Partial<Record<EstatePaymentProvider, boolean>>;
  provider?: EstatePaymentProvider;
  onProviderChange?: (provider: EstatePaymentProvider) => void;
}) {
  const [internalCycle, setInternalCycle] = useState<EstateBillingCycle>("monthly");
  const billingCycle = controlledCycle ?? internalCycle;
  const setBillingCycle = onCycleChange ?? setInternalCycle;
  const [internalProvider, setInternalProvider] = useState<EstatePaymentProvider>("flutterwave");
  const provider = controlledProvider ?? internalProvider;
  const setProvider = onProviderChange ?? setInternalProvider;
  const offerProviderChoice = Boolean(availableProviders?.flutterwave && availableProviders?.paystack);

  return (
    <div className="estate-pricing">
      <div className="estate-pricing-toggle" role="group" aria-label="Billing cycle">
        <button type="button" className={billingCycle === "monthly" ? "active" : ""} onClick={() => setBillingCycle("monthly")}>Monthly</button>
        <button type="button" className={billingCycle === "yearly" ? "active" : ""} onClick={() => setBillingCycle("yearly")}>Yearly</button>
      </div>
      {offerProviderChoice && (
        <div className="estate-pricing-toggle" role="group" aria-label="Payment provider">
          <button type="button" className={provider === "flutterwave" ? "active" : ""} onClick={() => setProvider("flutterwave")}>Pay with Flutterwave</button>
          <button type="button" className={provider === "paystack" ? "active" : ""} onClick={() => setProvider("paystack")}>Pay with Paystack</button>
        </div>
      )}
      <div className="estate-pricing-grid">
        {(Object.keys(ESTATE_PLANS) as EstatePlanKey[]).map((key) => {
          const plan = ESTATE_PLANS[key];
          const price = billingCycle === "monthly" ? plan.monthly : plan.yearly;
          return (
            <div key={key} className={`estate-pricing-card${key === "pro" ? " estate-pricing-card--featured" : ""}`}>
              {PLAN_BADGE[key] && <span className="estate-pricing-badge">{PLAN_BADGE[key]}</span>}
              <h3>{plan.label}</h3>
              <p className="estate-pricing-price">{naira(price)}<span>/{billingCycle === "monthly" ? "month" : "year"}</span></p>
              <p className="estate-pricing-trial">{ESTATE_TRIAL_DAYS}-day trial &middot; card or bank transfer verification &middot; NGN50 refundable verification &middot; cancel anytime</p>
              <ul className="estate-pricing-features">
                {PLAN_FEATURES[key].map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <button
                type="button"
                className={`estate-button${key === "pro" ? "" : " estate-button--outline"}`}
                style={{ width: "100%", justifyContent: "center" }}
                disabled={busyPlan === key || currentPlan === key}
                onClick={() => onSelectPlan(key, billingCycle, provider)}
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
