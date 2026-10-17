import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, extractApiErrorMessage } from "../../api/client";
import "../../styles/estate-public.css";

let nextRowId = 0;

export default function PublicLiveInspectionReschedulePage() {
  const { token } = useParams();
  const [rows, setRows] = useState<Array<{ id: number; value: string }>>([{ id: nextRowId++, value: "" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const addRow = () => setRows((current) => (current.length >= 5 ? current : [...current, { id: nextRowId++, value: "" }]));
  const removeRow = (id: number) => setRows((current) => current.filter((row) => row.id !== id));
  const updateRow = (id: number, value: string) => setRows((current) => current.map((row) => (row.id === id ? { ...row, value } : row)));

  const submit = async () => {
    if (!token) return;
    const times = rows.map((row) => row.value).filter(Boolean);
    if (!times.length) { setError("Choose at least one date and time."); return; }
    setBusy(true);
    setError("");
    try {
      await api.post(`/estates/public/live-inspections/${token}/reschedule`, {
        proposed_times: times.map((value) => new Date(value).toISOString()),
      });
      setSubmitted(true);
    } catch (requestError) {
      setError(await extractApiErrorMessage(requestError, "Your request could not be sent."));
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <main className="estate-public-app">
        <div className="estate-public-inspect-page">
          <p className="estate-public-kicker">Live site inspection</p>
          <h1>Request sent</h1>
          <p className="estate-public-guide-note">
            We've sent your requested time{rows.filter((row) => row.value).length > 1 ? "s" : ""} to the team. We'll email you once one is confirmed.
          </p>
          <div className="estate-public-guide-actions">
            {token && <Link className="estate-public-ghost" to={`/estates/live-inspection/${token}`}>Back to your live inspection</Link>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="estate-public-app">
      <div className="estate-public-inspect-page">
        <p className="estate-public-kicker">Live site inspection</p>
        <h1>Suggest a different time</h1>
        <p className="estate-public-guide-note">
          Add one time that works for you, or a few options - the team will confirm whichever one works for them, and you'll get an email once it's approved.
        </p>
        <div style={{ display: "grid", gap: 10, margin: "18px 0" }}>
          {rows.map((row, index) => (
            <div key={row.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="datetime-local"
                value={row.value}
                onChange={(event) => updateRow(row.id, event.target.value)}
                style={{ flex: 1, minHeight: 43, padding: "0 12px", border: "1px solid var(--estate-public-border)", borderRadius: 8 }}
              />
              {rows.length > 1 && (
                <button type="button" className="estate-public-ghost" onClick={() => removeRow(row.id)} aria-label={`Remove time ${index + 1}`}>Remove</button>
              )}
            </div>
          ))}
        </div>
        {rows.length < 5 && (
          <button type="button" className="estate-public-ghost" onClick={addRow} style={{ marginBottom: 18 }}>+ Add another time</button>
        )}
        {error && <p className="estate-public-guide-error">{error}</p>}
        <div className="estate-public-guide-actions">
          <button type="button" className="estate-public-primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "Sending..." : "Submit"}
          </button>
          {token && <Link className="estate-public-ghost" to={`/estates/live-inspection/${token}`}>Cancel</Link>}
        </div>
      </div>
    </main>
  );
}
