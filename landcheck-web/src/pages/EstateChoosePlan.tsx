import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, extractApiErrorMessage } from "../api/client";
import { getEstateAuthSession } from "../auth/estateAuth";
import EstatePricingCards, { type EstateBillingCycle, type EstatePlanKey } from "../components/estates/EstatePricingCards";
import "../styles/estate-portal.css";

export default function EstateChoosePlan() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const session = getEstateAuthSession();
  const organizationId = session?.user.organization_id;

  const [checking, setChecking] = useState(true);
  const [busyPlan, setBusyPlan] = useState<EstatePlanKey | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (searchParams.get("result") === "failed") setError("We couldn't confirm that payment. Please try again, or use a different card.");
  }, [searchParams]);

  useEffect(() => {
    if (!organizationId) { navigate("/estates/login", { replace: true }); return; }
    api.get(`/estates/billing/status`, { params: { organization_id: organizationId } })
      .then((response) => {
        if (["trialing", "active"].includes(response.data?.status)) {
          navigate("/estates/workspace", { replace: true });
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [organizationId, navigate]);

  const selectPlan = async (planKey: EstatePlanKey, billingCycle: EstateBillingCycle) => {
    if (!organizationId) return;
    setError("");
    setBusyPlan(planKey);
    try {
      const response = await api.post(
        "/estates/billing/checkout",
        { plan_key: planKey, billing_cycle: billingCycle },
        { params: { organization_id: organizationId } },
      );
      const checkoutUrl = response.data?.checkout_url;
      if (!checkoutUrl) throw new Error("No checkout link was returned.");
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(await extractApiErrorMessage(err, "Could not start checkout. Please try again."));
      setBusyPlan(null);
    }
  };

  if (checking) return null;

  return (
    <main className="estate-auth-page" style={{ minHeight: "100vh" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 24px 80px", textAlign: "center" }}>
        <Link to="/estates" className="estate-auth-brand" aria-label="LandCheck Estates home" style={{ margin: "0 auto 30px" }}>
          <span className="estate-auth-brand-logo"><img src="/logo.svg" alt="LandCheck" width="520" height="140" /></span>
          <span className="estate-auth-brand-tag">Estates</span>
        </Link>
        <p className="estate-kicker">Company workspace</p>
        <h1 style={{ margin: "10px 0 0", fontFamily: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif", fontWeight: 500, fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>Choose a plan to get started</h1>
        <p style={{ maxWidth: 480, margin: "12px auto 40px", color: "var(--estate-slate)" }}>
          Every plan includes a 3-day free trial. A refundable NGN 50 payment verifies your payment method. Card renewals are automatic; bank-transfer renewals use scheduled email reminders and a secure payment link.
        </p>
        {error && <div className="estate-auth-error" role="alert" style={{ maxWidth: 480, margin: "0 auto 24px", textAlign: "left" }}>{error}</div>}
        <EstatePricingCards onSelectPlan={selectPlan} busyPlan={busyPlan} />
      </div>
    </main>
  );
}
