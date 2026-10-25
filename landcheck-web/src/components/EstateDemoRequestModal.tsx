import { useEffect, useRef, useState, type FormEvent } from "react";
import { submitEstateDemoRequest } from "../api/commercial";
import { createIdempotencyKey } from "../api/client";
import { trackConversion } from "../analytics/conversionEvents";
import "../styles/estate-demo-request.css";

type FormValues = {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  message: string;
  website: string;
};

const initialValues: FormValues = {
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  message: "",
  website: "",
};

export default function EstateDemoRequestModal({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const idempotencyKeyRef = useRef<string>(createIdempotencyKey("estate-demo"));

  useEffect(() => {
    firstInputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  const update = (key: keyof FormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (error) setError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await submitEstateDemoRequest(
        {
          company_name: values.company_name,
          contact_name: values.contact_name,
          email: values.email,
          phone: values.phone,
          message: values.message || undefined,
          website: values.website || undefined,
          source_path: typeof window === "undefined" ? "/estates/" : window.location.pathname,
        },
        idempotencyKeyRef.current,
      );
      setSubmitted(true);
      trackConversion("estate_demo_request", { submission: "completed" }, result.request_id || idempotencyKeyRef.current);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "We couldn't send your request. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="estate-demo-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="estate-demo-dialog" role="dialog" aria-modal="true" aria-labelledby="estate-demo-title" aria-describedby="estate-demo-description">
        <div className="estate-demo-header">
          <div>
            <p className="estate-kicker">LandCheck Estates</p>
            <h2 id="estate-demo-title">See it on your estate.</h2>
          </div>
          <button type="button" className="estate-demo-close" onClick={onClose} disabled={busy} aria-label="Close demo request">&times;</button>
        </div>

        {submitted ? (
          <div className="estate-demo-success" role="status">
            <span className="estate-demo-success-mark" aria-hidden="true">OK</span>
            <h3>Request received.</h3>
            <p id="estate-demo-description">Thank you. The LandCheck team will contact you to arrange a practical demonstration for your company.</p>
            <button type="button" className="estate-button" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form className="estate-demo-form" onSubmit={submit}>
            <p id="estate-demo-description" className="estate-demo-intro">Tell us a little about your operation and we will show you how plots, buyers, payments and allocations can work together.</p>
            {error && <p className="estate-demo-error" role="alert">{error}</p>}
            <div className="estate-demo-grid">
              <label><span>Company name</span><input ref={firstInputRef} required minLength={2} maxLength={255} value={values.company_name} onChange={(event) => update("company_name", event.target.value)} autoComplete="organization" /></label>
              <label><span>Your name</span><input required minLength={2} maxLength={255} value={values.contact_name} onChange={(event) => update("contact_name", event.target.value)} autoComplete="name" /></label>
              <label><span>Business email</span><input required type="email" maxLength={255} value={values.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" /></label>
              <label><span>Phone / WhatsApp</span><input required minLength={7} maxLength={64} value={values.phone} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" inputMode="tel" /></label>
            </div>
            <label><span>What would you like to see? <em>Optional</em></span><textarea rows={4} maxLength={2000} value={values.message} onChange={(event) => update("message", event.target.value)} placeholder="For example: plot sales, payment tracking or multiple estates." /></label>
            <label className="estate-demo-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={values.website} onChange={(event) => update("website", event.target.value)} /></label>
            <p className="estate-demo-privacy">By submitting, you agree that LandCheck may use these details to arrange the demo and respond to your enquiry. See our <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</p>
            <div className="estate-demo-actions">
              <button type="button" className="estate-button estate-button--outline" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="estate-button" disabled={busy}>{busy ? "Sending request..." : "Request a demo"}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
