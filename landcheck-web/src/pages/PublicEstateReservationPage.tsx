import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { API_URL, api, createIdempotencyKey, extractApiErrorMessage } from "../api/client";
import { formatArea } from "../utils/unitFormat";
import "../styles/estate-public.css";

type ReservationEstate = {
  name: string;
  slug: string;
  organization_name: string | null;
  organization_email: string | null;
  logo_url: string | null;
  location: string | null;
  contact_phone: string | null;
  payment_plan?: Array<{ label: string; percentage: string | number }>;
  plots: Array<{ id: number; plot_number: string; address: string | null; area_sqm: number | null; status: string; price: string | null }>;
};

function money(value: string | null) {
  if (!value) return "Price on request";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Price on request";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);
}

function paymentPlanItems(estate: ReservationEstate) {
  return estate.payment_plan || [];
}

export default function PublicEstateReservationPage() {
  const { slug, plotId } = useParams();
  const [searchParams] = useSearchParams();
  const source = searchParams.get("source") || "";
  const [estate, setEstate] = useState<ReservationEstate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", message: "" });
  const reservationRequestRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!slug) return;
    api.get(`/estates/public/${slug}`, { params: source ? { source } : undefined }).then((response) => setEstate(response.data as ReservationEstate)).catch(async (err) => setError(await extractApiErrorMessage(err, "This Estate page is not available."))).finally(() => setLoading(false));
  }, [slug, source]);

  const plot = estate?.plots.find((item) => String(item.id) === String(plotId)) || null;
  const companyName = estate?.organization_name || "Estate company";
  const updateForm = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const submitReservation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!estate || !plot || !slug) return;
    setBusy(true);
    setFormError("");
    const fingerprint = JSON.stringify({ slug, plotId: plot.id, source, form });
    if (!reservationRequestRef.current || reservationRequestRef.current.fingerprint !== fingerprint) {
      reservationRequestRef.current = { fingerprint, key: createIdempotencyKey("estate-public-reservation") };
    }
    const idempotencyKey = reservationRequestRef.current.key;
    try {
      await api.post(`/estates/public/${slug}/plots/${plot.id}/reservation`, { ...form, email: form.email || null, message: form.message || null, source: source || null }, { headers: { "X-Idempotency-Key": idempotencyKey } });
      reservationRequestRef.current = null;
      setSubmitted(true);
    } catch (err) {
      setFormError(await extractApiErrorMessage(err, "We could not send your reservation request. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <main className="estate-public-app"><div className="estate-public-loading">Loading reservation page...</div></main>;
  if (error || !estate || !plot) return <main className="estate-public-app"><div className="estate-public-message"><h1>Reservation unavailable</h1><p>{error || "This plot is not available for reservation."}</p>{slug && <Link className="estate-public-text-link" to={`/estates/public/${slug}`}>Return to Estate page</Link>}</div></main>;

  return <div className="estate-public-app estate-public-reservation-app">
    <header className="estate-public-header"><a className="estate-public-company" href={`/estates/public/${estate.slug}`} aria-label={`${companyName} home`}>{estate.logo_url ? <img src={`${API_URL}${estate.logo_url}`} alt={`${companyName} logo`} /> : <strong>{companyName}</strong>}</a><Link className="estate-public-back-link" to={`/estates/public/${estate.slug}`}>Back to plots</Link></header>
    <main>
      {submitted ? <section className="estate-public-success-page"><p className="estate-public-kicker">Request received</p><h1>We will be in touch about Plot {plot.plot_number}.</h1><p>The {companyName} team has received your details and will contact you about availability, documentation and next steps.</p>{estate.contact_phone && <a className="estate-public-text-link" href={`tel:${estate.contact_phone}`}>Call {estate.contact_phone}</a>}<Link className="estate-public-text-link" to={`/estates/public/${estate.slug}`}>Return to Estate page</Link></section> : <section className="estate-public-reservation-layout"><div className="estate-public-reservation-summary"><p className="estate-public-kicker">Reserve a plot</p><h1>Plot {plot.plot_number}</h1><p>Leave your details and the {companyName} team will contact you.</p><dl><div><dt>Address</dt><dd>{plot.address || "Address on request"}</dd></div><div><dt>Area</dt><dd>{plot.area_sqm ? formatArea(plot.area_sqm) : "On request"}</dd></div><div><dt>Price</dt><dd>{money(plot.price)}</dd></div></dl>{paymentPlanItems(estate).length > 0 && <div className="estate-public-payment-plan"><p className="estate-public-kicker">Payment plan</p>{paymentPlanItems(estate).map((item) => <div className="estate-public-payment-plan-row" key={item.label}><span>{item.label}</span><strong>{item.percentage}%</strong></div>)}</div>}{estate.location && <p className="estate-public-reservation-location">{estate.location}</p>}</div><form className="estate-public-form" onSubmit={submitReservation}>{formError && <p className="estate-public-form-error">{formError}</p>}<label>Full name<input required minLength={2} value={form.full_name} onChange={(event) => updateForm("full_name", event.target.value)} autoComplete="name" /></label><label>Phone number<input required minLength={5} value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} autoComplete="tel" /></label><label>Email <span>optional</span><input type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} autoComplete="email" /></label><label>Message <span>optional</span><textarea rows={4} value={form.message} onChange={(event) => updateForm("message", event.target.value)} placeholder="Tell the Estate team anything they should know" /></label><button type="submit" className="estate-public-primary" disabled={busy}>{busy ? "Sending..." : "Send reservation request"}</button><p className="estate-public-form-note">Your details go directly to the Estate company. No payment is taken on this page.</p></form></section>}
    </main>
    <footer className="estate-public-footer"><strong>{companyName}</strong><span>{estate.contact_phone || estate.organization_email || "Estate enquiries"}</span></footer>
  </div>;
}
