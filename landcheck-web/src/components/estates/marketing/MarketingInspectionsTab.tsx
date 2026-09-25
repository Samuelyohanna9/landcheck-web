import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../../api/client";
import { formatDateTime } from "../../../utils/estateMarketing";
import EstateIcon from "../EstateIcon";

type Slot = { id: number; starts_at: string; duration_minutes: number; capacity: number; remaining: number; note: string | null; status: "open" | "closed" | "cancelled" };
type Booking = {
  id: number; slot_id: number; starts_at: string; full_name: string; phone: string; email: string | null; party_size: number; plot_number: string | null;
  note: string | null; status: "booked" | "cancelled" | "attended" | "no_show"; staff_notes: string | null; agent: string | null; whatsapp_url: string | null;
};

const BOOKING_TONE: Record<Booking["status"], string> = { booked: "info", attended: "good", no_show: "danger", cancelled: "neutral" };
const BOOKING_LABEL: Record<Booking["status"], string> = { booked: "Booked", attended: "Attended", no_show: "No-show", cancelled: "Cancelled" };

function defaultStart() {
  const date = new Date();
  date.setDate(date.getDate() + ((6 - date.getDay() + 7) % 7 || 7));
  date.setHours(11, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function MarketingInspectionsTab({ estateId, canManage, hasMeetingPoint, published }: { estateId: string; canManage: boolean; hasMeetingPoint: boolean; published: boolean }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [duration, setDuration] = useState("120");
  const [capacity, setCapacity] = useState("20");
  const [repeat, setRepeat] = useState("0");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [slotResponse, bookingResponse] = await Promise.all([
        api.get<Slot[]>(`/estates/${estateId}/marketing/inspection-slots`),
        api.get<Booking[]>(`/estates/${estateId}/marketing/inspection-bookings`),
      ]);
      setSlots(slotResponse.data || []);
      setBookings(bookingResponse.data || []);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Inspections could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [estateId]);

  useEffect(() => { void load(); }, [load]);

  const createSlots = async () => {
    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime())) { toast.error("Choose a date and time."); return; }
    setSaving(true);
    try {
      await api.post(`/estates/${estateId}/marketing/inspection-slots`, {
        starts_at: start.toISOString(), duration_minutes: Number(duration), capacity: Number(capacity), repeat_weekly: Number(repeat), note: note.trim() || null,
      });
      toast.success(Number(repeat) > 0 ? `${Number(repeat) + 1} inspection times added.` : "Inspection time added.");
      setNote("");
      await load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The inspection time could not be added."));
    } finally {
      setSaving(false);
    }
  };

  const updateSlot = async (slot: Slot, status: Slot["status"]) => {
    if (status === "cancelled" && !window.confirm("Cancel this inspection? Everyone booked on it will be emailed.")) return;
    setBusyId(`slot-${slot.id}`);
    try {
      await api.patch(`/estates/marketing/inspection-slots/${slot.id}`, { status });
      await load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The inspection time could not be updated."));
    } finally {
      setBusyId(null);
    }
  };

  const updateBooking = async (booking: Booking, status: Booking["status"]) => {
    setBusyId(`booking-${booking.id}`);
    try {
      await api.patch(`/estates/marketing/inspection-bookings/${booking.id}`, { status });
      await load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The booking could not be updated."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="edash-mk-stack">
      {!hasMeetingPoint && (
        <div className="edash-mk-banner">
          <div><strong>Add a meeting point so visitors can find you</strong>Set the gate or landmark in Settings. It is included in booking emails with a directions link.</div>
          <Link to={`/estates/${estateId}/settings`}>Open settings</Link>
        </div>
      )}
      {!published && <div className="edash-mk-banner"><div><strong>Your public page is not published</strong>Visitors book inspection times from the public Estate page.</div><Link to={`/estates/${estateId}/settings`}>Publish it</Link></div>}

      <div className="edash-mk-grid-2">
        <div className="edash-mk-stack">
          {canManage && (
            <div className="edash-card"><div className="edash-card-inner">
              <div className="edash-card-head"><h3 className="edash-card-title">Add inspection times</h3></div>
              <div className="edash-mk-form-grid">
                <label className="edash-field is-wide"><span>Date and time</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
                <label className="edash-field"><span>Duration</span>
                  <select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option><option value="180">3 hours</option><option value="240">4 hours</option></select>
                </label>
                <label className="edash-field"><span>Places</span><input type="number" min={1} max={500} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
                <label className="edash-field"><span>Repeat weekly</span>
                  <select value={repeat} onChange={(event) => setRepeat(event.target.value)}><option value="0">Just once</option><option value="3">For 4 weeks</option><option value="7">For 8 weeks</option><option value="11">For 12 weeks</option></select>
                </label>
                <label className="edash-field is-wide"><span>Note for visitors</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Wear covered shoes. Free transport from Gate 1." maxLength={300} /></label>
                <div style={{ display: "flex", justifyContent: "flex-end" }}><button type="button" className="edash-btn-primary" disabled={saving} onClick={() => void createSlots()}>{saving ? "Adding..." : "Add"}</button></div>
              </div>
              <p className="edash-mk-hint">Group visits work best: one guide, one time, many buyers. Bookings close one hour before the start, and visitors get reminders the day before and two hours before.</p>
            </div></div>
          )}

          <div className="edash-card"><div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Upcoming inspection times</h3></div>
            {loading ? <p className="edash-mk-empty">Loading...</p> : slots.length === 0 ? <p className="edash-mk-empty">No inspection times yet. Add one and it appears on your public page immediately.</p> : (
              <div className="edash-mk-slot-list">
                {slots.map((slot) => {
                  const taken = slot.capacity - slot.remaining;
                  return (
                    <div className="edash-mk-slot" key={slot.id}>
                      <div>
                        <strong>{formatDateTime(slot.starts_at)}</strong>
                        <small>{slot.duration_minutes} min · {taken} of {slot.capacity} places booked{slot.note ? ` · ${slot.note}` : ""}</small>
                        <div className="edash-mk-fill"><i style={{ width: `${Math.min(100, (taken / slot.capacity) * 100)}%` }} /></div>
                      </div>
                      <div className="edash-mk-actions">
                        <span className={`edash-status-pill tone-${slot.status === "open" ? "good" : slot.status === "closed" ? "warn" : "neutral"}`}>{slot.status}</span>
                        {canManage && slot.status === "open" && <button type="button" className="edash-mk-chip-btn" disabled={busyId === `slot-${slot.id}`} onClick={() => void updateSlot(slot, "closed")}>Close</button>}
                        {canManage && slot.status === "closed" && <button type="button" className="edash-mk-chip-btn" disabled={busyId === `slot-${slot.id}`} onClick={() => void updateSlot(slot, "open")}>Reopen</button>}
                        {canManage && slot.status !== "cancelled" && <button type="button" className="edash-mk-chip-btn is-danger" disabled={busyId === `slot-${slot.id}`} onClick={() => void updateSlot(slot, "cancelled")}>Cancel</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div></div>
        </div>

        <div className="edash-card"><div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Bookings</h3><span className="edash-field-note">{bookings.filter((b) => b.status === "booked").length} upcoming</span></div>
          {loading ? <p className="edash-mk-empty">Loading...</p> : bookings.length === 0 ? <p className="edash-mk-empty">No bookings yet.</p> : (
            <div className="edash-mk-followups">
              {bookings.map((booking) => (
                <div className="edash-mk-followup" key={booking.id}>
                  <div>
                    <strong>{booking.full_name} <span style={{ color: "var(--edash-muted)", fontWeight: 600 }}>x{booking.party_size}</span></strong>
                    <small>{formatDateTime(booking.starts_at)}{booking.plot_number ? ` · Plot ${booking.plot_number}` : ""}{booking.agent ? ` · ${booking.agent}` : ""}</small>
                    <small>{booking.phone}{booking.note ? ` · "${booking.note}"` : ""}</small>
                  </div>
                  <div className="edash-mk-actions">
                    <span className={`edash-status-pill tone-${BOOKING_TONE[booking.status]}`}>{BOOKING_LABEL[booking.status]}</span>
                    <a className="edash-mk-chip-btn" href={`tel:${booking.phone}`}><EstateIcon name="phone" /></a>
                    {booking.whatsapp_url && <a className="edash-mk-chip-btn is-wa" href={booking.whatsapp_url} target="_blank" rel="noreferrer"><EstateIcon name="whatsapp" /></a>}
                    {booking.status === "booked" && <>
                      <button type="button" className="edash-mk-chip-btn" disabled={busyId === `booking-${booking.id}`} onClick={() => void updateBooking(booking, "attended")}>Attended</button>
                      <button type="button" className="edash-mk-chip-btn is-danger" disabled={busyId === `booking-${booking.id}`} onClick={() => void updateBooking(booking, "no_show")}>No-show</button>
                    </>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div></div>
      </div>
    </div>
  );
}
