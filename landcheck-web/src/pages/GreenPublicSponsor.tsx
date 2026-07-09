import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildSponsorPrivacyUrl,
  buildSponsorTermsUrl,
  createGuestSponsorOrder,
  fetchGuestSponsorOrderPaymentStatus,
  fetchPublicSponsorshipProjects,
  formatCurrencyAmount,
  formatSponsorPriceChoices,
  getPreferredSponsorPriceEntry,
  getSponsorPriceEntries,
  SPONSOR_TERMS_VERSION,
  type SponsorProject,
} from "../api/greenSponsor";
import { claimGreenSponsorGuestAccount } from "../auth/greenAuth";
import NavBar from "../components/NavBar";
import "../styles/green-public-sponsor.css";

const SPONSOR_BACKGROUND = "/background-sponsor.png";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=online.landcheck.mobile";
const GUEST_CHECKOUT_STORAGE_KEY = "lc_guest_checkout_pending";

const DEDICATION_OPTIONS = [
  { value: "self", label: "Myself" },
  { value: "birthday", label: "Birthday" },
  { value: "memorial", label: "Memorial" },
  { value: "anniversary", label: "Anniversary" },
  { value: "wedding", label: "Wedding" },
  { value: "honour", label: "In Honour Of" },
  { value: "celebration", label: "Celebration" },
  { value: "gratitude", label: "Gratitude" },
] as const;

type GuestForm = {
  fullName: string;
  email: string;
  phone: string;
  quantity: string;
  checkoutCurrency: string;
  dedicationType: string;
  dedicationName: string;
  dedicationMessage: string;
  purchaserNote: string;
  acceptedTerms: boolean;
  acceptedPolicy: boolean;
};

type PendingGuestCheckout = {
  fullName: string;
  email: string;
  projectTitle: string;
  isGuest: boolean;
};

type ReturnState = {
  orderUid: string;
  sponsorId: number;
  status: string;
  message: string;
};

const emptyForm: GuestForm = {
  fullName: "",
  email: "",
  phone: "",
  quantity: "1",
  checkoutCurrency: "NGN",
  dedicationType: "self",
  dedicationName: "",
  dedicationMessage: "",
  purchaserNote: "",
  acceptedTerms: false,
  acceptedPolicy: false,
};

function readReturnStateFromUrl(): ReturnState | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const orderUid = params.get("order_uid");
  if (!orderUid) return null;
  return {
    orderUid,
    sponsorId: Number(params.get("sponsor_id") || 0),
    status: params.get("status") || "pending",
    message: params.get("message") || "",
  };
}

export default function GreenPublicSponsor() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<SponsorProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [form, setForm] = useState<GuestForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [returnState, setReturnState] = useState<ReturnState | null>(() => readReturnStateFromUrl());
  const [pendingCheckout, setPendingCheckout] = useState<PendingGuestCheckout | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(GUEST_CHECKOUT_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as PendingGuestCheckout) : null;
    } catch {
      return null;
    }
  });
  const [orderStatus, setOrderStatus] = useState<{ payment_status?: string | null } | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [claimPassword, setClaimPassword] = useState("");
  const [claimConfirm, setClaimConfirm] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    if (returnState) return;
    let cancelled = false;
    fetchPublicSponsorshipProjects()
      .then((rows) => {
        if (cancelled) return;
        setProjects(rows);
        setSelectedProjectId((current) => current || rows.find((p) => p.sponsor_checkout_ready)?.id || rows[0]?.id || null);
      })
      .catch(() => setError("Could not load public sponsorship projects."))
      .finally(() => { if (!cancelled) setLoadingProjects(false); });
    return () => { cancelled = true; };
  }, [returnState]);

  useEffect(() => {
    if (!returnState || !returnState.sponsorId) return;
    let cancelled = false;
    setCheckingPayment(true);
    fetchGuestSponsorOrderPaymentStatus(returnState.sponsorId, returnState.orderUid, true)
      .then((order) => { if (!cancelled) setOrderStatus(order); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCheckingPayment(false); });
    return () => { cancelled = true; };
  }, [returnState]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  const priceEntry = useMemo(() => getPreferredSponsorPriceEntry(selectedProject, form.checkoutCurrency), [selectedProject, form.checkoutCurrency]);
  const priceEntries = useMemo(() => getSponsorPriceEntries(selectedProject), [selectedProject]);
  const total = useMemo(() => Math.max(1, Number(form.quantity || 1)) * Number(priceEntry?.amount || 0), [form.quantity, priceEntry]);

  useEffect(() => {
    if (priceEntry && priceEntry.currency !== form.checkoutCurrency) {
      setForm((c) => (c.checkoutCurrency === priceEntry.currency ? c : { ...c, checkoutCurrency: priceEntry.currency }));
    }
  }, [priceEntry, form.checkoutCurrency]);

  const handleSubmit = async () => {
    if (!selectedProject) return;
    setError("");
    const quantity = Math.max(1, Number(form.quantity || 0));
    if (!form.fullName.trim() || !form.email.trim()) { setError("Please enter your name and email."); return; }
    if (!form.acceptedTerms || !form.acceptedPolicy) { setError("Please accept the sponsor terms and privacy policy."); return; }
    if (!selectedProject.sponsor_checkout_ready) { setError("This project is not open for online sponsorship yet."); return; }
    setSubmitting(true);
    try {
      const returnUrl = `${window.location.origin}/sponsor`;
      const result = await createGuestSponsorOrder({
        guest_full_name: form.fullName.trim(),
        guest_email: form.email.trim(),
        guest_phone: form.phone.trim() || null,
        project_id: selectedProject.id,
        quantity,
        checkout_currency: priceEntry?.currency || form.checkoutCurrency,
        dedication_type: form.dedicationType || null,
        dedication_name: form.dedicationName.trim() || null,
        dedication_message: form.dedicationMessage.trim() || null,
        purchaser_note: form.purchaserNote.trim() || null,
        payment_method: selectedProject.flutterwave_available ? "flutterwave" : "manual",
        accepted_terms: form.acceptedTerms,
        accepted_policy: form.acceptedPolicy,
        consent_version: SPONSOR_TERMS_VERSION,
        payment_return_url: returnUrl,
      });
      const pending: PendingGuestCheckout = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        projectTitle: selectedProject.public_sponsor_title || selectedProject.name,
        isGuest: result.is_guest !== false,
      };
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(GUEST_CHECKOUT_STORAGE_KEY, JSON.stringify(pending));
      }
      if (result.payment_link) {
        window.location.href = result.payment_link;
        return;
      }
      // Manual payment path — no hosted checkout link, order awaits proof/review.
      setPendingCheckout(pending);
      setReturnState({ orderUid: result.order_uid, sponsorId: Number(result.sponsor_id || 0), status: "pending", message: "Your order was created. Our team will confirm your manual payment shortly." });
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Could not start checkout — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async () => {
    setClaimError("");
    if (!returnState?.sponsorId || !pendingCheckout?.email) { setClaimError("We couldn't find your order details in this browser session."); return; }
    if (claimPassword.length < 6) { setClaimError("Password must be at least 6 characters."); return; }
    if (claimPassword !== claimConfirm) { setClaimError("Passwords do not match."); return; }
    setClaiming(true);
    try {
      await claimGreenSponsorGuestAccount({ sponsorId: returnState.sponsorId, email: pendingCheckout.email, password: claimPassword });
      if (typeof window !== "undefined") window.sessionStorage.removeItem(GUEST_CHECKOUT_STORAGE_KEY);
      setClaimed(true);
      setTimeout(() => navigate("/green", { replace: true }), 900);
    } catch (err: any) {
      setClaimError(err?.response?.data?.detail || err?.message || "Could not set up your account — please try again.");
    } finally {
      setClaiming(false);
    }
  };

  const paymentVerified = orderStatus?.payment_status === "verified" || returnState?.status === "verified";
  const paymentFailed = returnState?.status === "failed";

  return (
    <div className="gps-page">
      <NavBar fixed overlay />

      {/* ─── Hero ─── */}
      <section
        className="gps-hero"
        style={{ backgroundImage: `linear-gradient(90deg, #0a3d20 0%, rgba(10,61,32,0.86) 55%, rgba(10,61,32,0.55) 100%), url(${SPONSOR_BACKGROUND})` }}
      >
        <div className="gps-hero-inner">
          <span className="gps-hero-eyebrow">LandCheck Green · Public Sponsorship</span>
          <h1>Sponsor a Tree.<br />No Account Needed.</h1>
          <p>Pick a verified project, sponsor trees in NGN or USD, and get GPS-tracked, photo-verified updates straight to your email — no sign-up required.</p>
          <div className="gps-trust-row">
            <span>✓ No sign-up to sponsor</span>
            <span>✓ Secure online payment</span>
            <span>✓ Verified GPS &amp; photo evidence</span>
            <span>✓ Email updates on your tree</span>
          </div>
        </div>
      </section>

      <main className="gps-main">
        {returnState ? (
          <section className="gps-return-panel">
            {checkingPayment ? (
              <div className="gps-return-status pending">
                <div className="gps-spinner" />
                <h2>Confirming your payment…</h2>
                <p>This only takes a moment.</p>
              </div>
            ) : paymentVerified ? (
              claimed ? (
                <div className="gps-return-status success">
                  <div className="gps-return-icon">🎉</div>
                  <h2>You're all set!</h2>
                  <p>Taking you to your sponsor dashboard…</p>
                </div>
              ) : pendingCheckout && !pendingCheckout.isGuest ? (
                <div className="gps-return-status success">
                  <div className="gps-return-icon">🌳</div>
                  <h2>Payment received — thank you!</h2>
                  <p>
                    Your sponsorship for <strong>{pendingCheckout.projectTitle}</strong> is confirmed. Since{" "}
                    <strong>{pendingCheckout.email}</strong> already has a sponsor account, sign in to see it on your dashboard.
                  </p>
                  <a className="gps-primary-btn" href="/green/login/sponsor">Sign In to My Dashboard</a>
                </div>
              ) : (
                <div className="gps-claim-card">
                  <div className="gps-return-icon">🌳</div>
                  <h2>Payment received — thank you!</h2>
                  <p>
                    Your sponsorship for <strong>{pendingCheckout?.projectTitle || "your project"}</strong> is confirmed. We've emailed{" "}
                    <strong>{pendingCheckout?.email}</strong> your receipt and tracking link.
                  </p>
                  <div className="gps-claim-divider" />
                  <h3>Set a password to unlock your dashboard</h3>
                  <p className="gps-claim-sub">Track every tree on a map, see your leaderboard rank, earn Green Points, and play reward games.</p>
                  <label className="gps-field"><span>Email</span><input type="email" value={pendingCheckout?.email || ""} disabled /></label>
                  <label className="gps-field"><span>Create password</span><input type="password" value={claimPassword} onChange={(e) => setClaimPassword(e.target.value)} placeholder="At least 6 characters" /></label>
                  <label className="gps-field"><span>Confirm password</span><input type="password" value={claimConfirm} onChange={(e) => setClaimConfirm(e.target.value)} placeholder="Re-enter password" /></label>
                  {claimError && <p className="gps-error">{claimError}</p>}
                  <button type="button" className="gps-primary-btn full" onClick={handleClaim} disabled={claiming}>
                    {claiming ? "Setting up your account…" : "Set Password & See My Dashboard"}
                  </button>
                  <div className="gps-claim-skip">
                    <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer">Get the Android app</a>
                    <span>·</span>
                    <button type="button" onClick={() => navigate("/", { replace: true })}>Skip for now</button>
                  </div>
                </div>
              )
            ) : paymentFailed ? (
              <div className="gps-return-status failed">
                <div className="gps-return-icon">⚠️</div>
                <h2>Payment incomplete</h2>
                <p>{returnState.message || "Your payment did not complete. You can try again below."}</p>
                <button type="button" className="gps-primary-btn" onClick={() => { setReturnState(null); window.history.replaceState({}, "", "/sponsor"); }}>Back to Projects</button>
              </div>
            ) : (
              <div className="gps-return-status pending">
                <div className="gps-return-icon">⏳</div>
                <h2>Payment pending</h2>
                <p>{returnState.message || "We're still confirming your payment with our provider. This can take a minute."}</p>
                <button
                  type="button"
                  className="gps-secondary-btn"
                  onClick={() => {
                    if (!returnState.sponsorId) return;
                    setCheckingPayment(true);
                    fetchGuestSponsorOrderPaymentStatus(returnState.sponsorId, returnState.orderUid, true)
                      .then((order) => setOrderStatus(order))
                      .finally(() => setCheckingPayment(false));
                  }}
                >
                  Check Again
                </button>
              </div>
            )}
          </section>
        ) : (
          <>
            {/* ─── Project grid ─── */}
            <section className="gps-projects-section">
              <h2>Choose a Verified Project</h2>
              <p className="gps-section-sub">Every project is field-monitored with GPS mapping and photo evidence.</p>
              {error && !loadingProjects && projects.length === 0 && <p className="gps-error">{error}</p>}
              {loadingProjects ? (
                <div className="gps-loading">Loading projects…</div>
              ) : projects.length === 0 ? (
                <div className="gps-empty">No public projects are open for sponsorship right now — please check back soon.</div>
              ) : (
                <div className="gps-project-grid">
                  {projects.map((project) => {
                    const active = selectedProjectId === project.id;
                    return (
                      <button
                        type="button"
                        key={project.id}
                        className={`gps-project-card${active ? " active" : ""}`}
                        onClick={() => setSelectedProjectId(project.id)}
                      >
                        <div className="gps-project-card-head">
                          <h3>{project.public_sponsor_title || project.name}</h3>
                          <span className={`gps-chip ${project.sponsor_checkout_ready ? "ok" : "warning"}`}>
                            {project.sponsor_checkout_ready ? `${Number(project.slots_available ?? 0)} open` : "Preparing"}
                          </span>
                        </div>
                        <p>{project.public_sponsor_description || project.public_description || project.location_text || "Verified tree project"}</p>
                        <div className="gps-project-card-meta">
                          <span>{formatSponsorPriceChoices(project)}</span>
                          <span>{project.location_text || "Location shared after planting"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ─── Checkout ─── */}
            {selectedProject && (
              <section className="gps-checkout-section">
                <div className="gps-checkout-card">
                  <div className="gps-checkout-head">
                    <div>
                      <span className="gps-checkout-eyebrow">Secure Checkout</span>
                      <h2>{selectedProject.public_sponsor_title || selectedProject.name}</h2>
                      <span className="gps-checkout-location">{selectedProject.location_text || "LandCheck Green project"}</span>
                    </div>
                    <span className="gps-checkout-price">{formatSponsorPriceChoices(selectedProject)}</span>
                  </div>

                  <div className="gps-form-grid">
                    <label className="gps-field"><span>Full name</span><input type="text" value={form.fullName} onChange={(e) => setForm((c) => ({ ...c, fullName: e.target.value }))} placeholder="Your name" /></label>
                    <label className="gps-field"><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} placeholder="you@example.com" /></label>
                    <label className="gps-field"><span>Phone (optional)</span><input type="tel" value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} placeholder="Phone number" /></label>
                    <label className="gps-field"><span>Trees</span><input type="number" min="1" value={form.quantity} onChange={(e) => setForm((c) => ({ ...c, quantity: e.target.value }))} /></label>
                    {priceEntries.length > 1 && (
                      <label className="gps-field">
                        <span>Pay in</span>
                        <select value={form.checkoutCurrency} onChange={(e) => setForm((c) => ({ ...c, checkoutCurrency: e.target.value }))}>
                          {priceEntries.map((entry) => (
                            <option key={entry.currency} value={entry.currency}>{entry.currency} — {formatCurrencyAmount(entry.amount, entry.currency)} / tree</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="gps-field"><span>Dedication</span>
                      <select value={form.dedicationType} onChange={(e) => setForm((c) => ({ ...c, dedicationType: e.target.value }))}>
                        {DEDICATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                    {form.dedicationType !== "self" && (
                      <label className="gps-field"><span>Dedicated to (optional)</span><input type="text" value={form.dedicationName} onChange={(e) => setForm((c) => ({ ...c, dedicationName: e.target.value }))} placeholder="Name or occasion" /></label>
                    )}
                  </div>

                  <label className="gps-field"><span>Message (optional)</span><textarea rows={2} value={form.purchaserNote} onChange={(e) => setForm((c) => ({ ...c, purchaserNote: e.target.value }))} placeholder="Note for the LandCheck Green team" /></label>

                  <p className="gps-total-note">
                    {selectedProject.sponsor_max_per_order ? `Max ${selectedProject.sponsor_max_per_order} trees per order · ` : ""}
                    Total: <strong>{formatCurrencyAmount(total, priceEntry?.currency || form.checkoutCurrency)}</strong>
                  </p>

                  <label className="gps-check"><input type="checkbox" checked={form.acceptedTerms} onChange={(e) => setForm((c) => ({ ...c, acceptedTerms: e.target.checked }))} /><span>I accept the <a href={buildSponsorTermsUrl()} target="_blank" rel="noreferrer">sponsor terms</a></span></label>
                  <label className="gps-check"><input type="checkbox" checked={form.acceptedPolicy} onChange={(e) => setForm((c) => ({ ...c, acceptedPolicy: e.target.checked }))} /><span>I accept the <a href={buildSponsorPrivacyUrl()} target="_blank" rel="noreferrer">privacy policy</a></span></label>

                  {error && <p className="gps-error">{error}</p>}

                  <button type="button" className="gps-primary-btn full" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? "Preparing secure payment…" : `Pay ${formatCurrencyAmount(total, priceEntry?.currency || form.checkoutCurrency)} & Sponsor`}
                  </button>
                  <p className="gps-checkout-footnote">
                    Already have an account? <a href="/green/login/sponsor">Sign in</a> to track past sponsorships.
                  </p>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="gps-footer">
        <span>LandCheck Green Geospatial Technologies Limited</span>
        <a href="mailto:landchecktech@gmail.com">landchecktech@gmail.com</a>
      </footer>
    </div>
  );
}
