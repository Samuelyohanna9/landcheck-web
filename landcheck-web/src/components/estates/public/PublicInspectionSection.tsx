import { useEffect, useMemo, useState } from "react";
import { api, createIdempotencyKey, extractApiErrorMessage } from "../../../api/client";
import { copyText, formatDateTime, mapsDirectionsHref } from "../../../utils/estateMarketing";

type Slot = { id: number; starts_at: string; duration_minutes: number; capacity: number; remaining: number; note: string | null };
type Meeting = { lat: number; lng: number; label?: string | null; note?: string | null } | null;
type Confirmation = { booking_id: string; manage_token: string; starts_at: string; calendar_url: string; directions_url: string | null; confirmation_email_sent: boolean };

function dayKey(value: string) {
  return new Date(value).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" });
}

export default function PublicInspectionSection({
  slug, source, plotOptions, selectedPlotId, agentName, onLoaded,
}: {
  slug: string;
  source: string;
  plotOptions: Array<{ id: number; plot_number: string }>;
  selectedPlotId: number | null;
  agentName?: string | null;
  onLoaded?: (count: number) => void;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [meeting, setMeeting] = useState<Meeting>(null);
  const [loading, setLoading] = useState(true);
  const [slotId, setSlotId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [guests, setGuests] = useState(1);
  const [plotId, setPlotId] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Confirmation | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get(`/estates/public/${slug}/inspection-slots`).then((response) => {
      if (cancelled) return;
      setSlots(response.data.slots || []);
      onLoaded?.((response.data.slots || []).length);
      setMeeting(response.data.meeting_point || null);
    }).catch(() => undefined).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => { setPlotId(selectedPlotId ? String(selectedPlotId) : ""); }, [selectedPlotId]);

  const grouped = useMemo(() => {
    const groups: Array<{ day: string; slots: Slot[] }> = [];
    slots.forEach((slot) => {
      const key = dayKey(slot.starts_at);
      const last = groups[groups.length - 1];
      if (last && last.day === key) last.slots.push(slot);
      else groups.push({ day: key, slots: [slot] });
    });
    return groups;
  }, [slots]);

  const chosen = slots.find((slot) => slot.id === slotId) || null;

  const submit = async () => {
    setError("");
    if (!chosen) { setError("Choose an inspection time first."); return; }
    if (name.trim().length < 2) { setError("Enter your full name."); return; }
    if (phone.replace(/\D/g, "").length < 8) { setError("Enter a phone number we can reach you on."); return; }
    setBusy(true);
    try {
      const response = await api.post<Confirmation>(`/estates/public/${slug}/inspection-bookings`, {
        slot_id: chosen.id, full_name: name.trim(), phone: phone.trim(), email: email.trim() || null, party_size: guests,
        plot_id: plotId ? Number(plotId) : null, note: note.trim() || null, source: source || null,
      }, { headers: { "X-Idempotency-Key": createIdempotencyKey("estate-inspection") } });
      setDone(response.data);
    } catch (requestError) {
      setError(await extractApiErrorMessage(requestError, "The booking could not be made. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;
  if (!slots.length && !done) return null;

  const manageUrl = done ? `${window.location.origin}/estates/inspection/${done.manage_token}` : "";

  return (
    <section id="inspections" className="estate-public-inspect" aria-labelledby="estate-public-inspect-title">
      <div className="estate-public-section-head"><div><p className="estate-public-kicker">See it in person</p><h2 id="estate-public-inspect-title">Book a site inspection</h2></div></div>
      {done ? (
        <div className="estate-public-inspect-done">
          <span className="estate-public-inspect-tick">&#10003;</span>
          <h3>You are booked</h3>
          <p>{formatDateTime(done.starts_at)}</p>
          <p className="estate-public-inspect-note">{done.confirmation_email_sent ? "We emailed you the details and will remind you the day before." : "Save this page or the link below - it is how you can change or cancel your booking."}</p>
          <div className="estate-public-guide-actions">
            <a className="estate-public-primary" href={done.calendar_url} target="_blank" rel="noreferrer">Add to calendar</a>
            {done.directions_url && <a className="estate-public-ghost" href={done.directions_url} target="_blank" rel="noreferrer">Directions to meeting point</a>}
            <button type="button" className="estate-public-ghost" onClick={async () => { if (await copyText(manageUrl)) { setCopied(true); window.setTimeout(() => setCopied(false), 2000); } }}>{copied ? "Link copied" : "Copy manage-booking link"}</button>
          </div>
        </div>
      ) : (
        <div className="estate-public-inspect-grid">
          <div>
            {meeting && (
              <div className="estate-public-inspect-meet">
                <strong>Meeting point{meeting.label ? `: ${meeting.label}` : ""}</strong>
                {meeting.note && <span>{meeting.note}</span>}
                <a href={mapsDirectionsHref(meeting.lat, meeting.lng)} target="_blank" rel="noreferrer">Get directions</a>
              </div>
            )}
            {agentName && <p className="estate-public-inspect-note">Your contact for this visit: <strong>{agentName}</strong></p>}
            {grouped.map((group) => (
              <div key={group.day} className="estate-public-inspect-day">
                <h4>{group.day}</h4>
                <div className="estate-public-inspect-slots">
                  {group.slots.map((slot) => {
                    const full = slot.remaining <= 0;
                    return (
                      <button key={slot.id} type="button" disabled={full} className={`estate-public-inspect-slot${slot.id === slotId ? " is-selected" : ""}`} onClick={() => setSlotId(slot.id)}>
                        <strong>{new Date(slot.starts_at).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}</strong>
                        <span>{full ? "Full" : `${slot.remaining} place${slot.remaining === 1 ? "" : "s"} left`}</span>
                        {slot.note && <em>{slot.note}</em>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <form className="estate-public-inspect-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <h3>{chosen ? formatDateTime(chosen.starts_at) : "Choose a time to continue"}</h3>
            <label><span>Full name</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>
            <label><span>Phone / WhatsApp</span><input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" required /></label>
            <label><span>Email (for your confirmation)</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
            <div className="estate-public-inspect-row">
              <label><span>Guests</span><select value={guests} onChange={(event) => setGuests(Number(event.target.value))}>{Array.from({ length: Math.min(10, chosen?.remaining || 10) }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label><span>Plot you are interested in</span><select value={plotId} onChange={(event) => setPlotId(event.target.value)}><option value="">Not sure yet</option>{plotOptions.map((plot) => <option key={plot.id} value={plot.id}>Plot {plot.plot_number}</option>)}</select></label>
            </div>
            <label><span>Anything we should know? (optional)</span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} /></label>
            {error && <p className="estate-public-guide-error">{error}</p>}
            <button type="submit" className="estate-public-primary" disabled={busy || !chosen}>{busy ? "Booking..." : "Book my place"}</button>
            <small>Free to attend. We will send a reminder the day before and two hours before.</small>
          </form>
        </div>
      )}
    </section>
  );
}
