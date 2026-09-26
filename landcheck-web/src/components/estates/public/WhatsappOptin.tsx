import { useEffect, useState, type FormEvent } from "react";
import { api, extractApiErrorMessage } from "../../../api/client";

/** "Get updates on WhatsApp" - shown only when the company can send WhatsApp messages. Consent is an
 * explicit, unticked-by-default box whose exact wording is stored with the sign-up. */
export default function WhatsappOptin({ slug, source }: { slug: string; source?: string | null }) {
  const [info, setInfo] = useState<{ enabled: boolean; consent_text: string } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.get(`/estates/marketing/public/${encodeURIComponent(slug)}/optin-info`).then((response) => { if (!cancelled) setInfo(response.data); }).catch(() => { if (!cancelled) setInfo(null); });
    return () => { cancelled = true; };
  }, [slug]);

  if (!info?.enabled) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await api.post(`/estates/marketing/public/${encodeURIComponent(slug)}/optin`, { full_name: name.trim() || null, phone: phone.trim(), consent, source: source || null });
      setDone(response.data?.message || "You are subscribed.");
    } catch (err) {
      setError(await extractApiErrorMessage(err, "We could not sign you up. Please check your number and try again."));
    } finally { setBusy(false); }
  };

  return (
    <section id="updates" className="estate-public-optin" aria-labelledby="estate-public-optin-title">
      <div><p className="estate-public-kicker">Stay informed</p><h2 id="estate-public-optin-title">Get updates on WhatsApp.</h2><p>New plots, price changes and site visits - only when there is something worth knowing.</p></div>
      {done ? <p className="estate-public-optin-done" role="status">{done}</p> : (
        <form onSubmit={submit} className="estate-public-optin-form">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" maxLength={120} aria-label="Your name" />
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="WhatsApp number, e.g. 0803 123 4567" autoComplete="tel" inputMode="tel" required aria-label="WhatsApp number" />
          <label className="estate-public-optin-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{info.consent_text}</span></label>
          {error && <p className="estate-public-optin-error" role="alert">{error}</p>}
          <button type="submit" className="estate-public-primary" disabled={busy || !consent || !phone.trim()}>{busy ? "Signing you up..." : "Send me updates"}</button>
        </form>
      )}
    </section>
  );
}
