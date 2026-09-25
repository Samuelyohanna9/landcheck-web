import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, extractApiErrorMessage } from "../../api/client";
import { formatDateTime } from "../../utils/estateMarketing";
import "../../styles/estate-public.css";

type Booking = {
  estate_name: string | null; estate_slug: string | null; full_name: string; party_size: number; plot_number: string | null;
  status: "booked" | "cancelled" | "attended" | "no_show"; starts_at: string | null; duration_minutes: number | null; slot_status: string | null;
  meeting_point: { label?: string | null; note?: string | null } | null; directions_url: string | null; calendar_url: string | null; can_cancel: boolean;
};

const STATUS_TEXT: Record<Booking["status"], string> = { booked: "Booked", cancelled: "Cancelled", attended: "Attended", no_show: "Marked as missed" };

export default function PublicInspectionBookingPage() {
  const { token } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!token) return;
    api.get<Booking>(`/estates/public/inspection-bookings/${token}`).then((response) => setBooking(response.data))
      .catch(async (requestError) => setError(await extractApiErrorMessage(requestError, "This booking link is not valid.")));
  };
  useEffect(load, [token]);

  const cancel = async () => {
    if (!token || !window.confirm("Cancel this inspection booking?")) return;
    setBusy(true);
    try {
      await api.post(`/estates/public/inspection-bookings/${token}/cancel`);
      load();
    } catch (requestError) {
      setError(await extractApiErrorMessage(requestError, "The booking could not be cancelled."));
    } finally {
      setBusy(false);
    }
  };

  if (error && !booking) return <main className="estate-public-app"><div className="estate-public-message"><h1>Booking unavailable</h1><p>{error}</p></div></main>;
  if (!booking) return <main className="estate-public-app"><div className="estate-public-loading">Loading your booking...</div></main>;

  return (
    <main className="estate-public-app">
      <div className="estate-public-inspect-page">
        <p className="estate-public-kicker">Site inspection</p>
        <h1>{booking.estate_name}</h1>
        <div className={`estate-public-inspect-status is-${booking.status}`}>{STATUS_TEXT[booking.status]}</div>
        <dl>
          <div><dt>Name</dt><dd>{booking.full_name}{booking.party_size > 1 ? ` (+${booking.party_size - 1})` : ""}</dd></div>
          <div><dt>When</dt><dd>{formatDateTime(booking.starts_at)}{booking.duration_minutes ? ` · about ${booking.duration_minutes} minutes` : ""}</dd></div>
          {booking.plot_number && <div><dt>Plot</dt><dd>Plot {booking.plot_number}</dd></div>}
          {booking.meeting_point?.label && <div><dt>Meeting point</dt><dd>{booking.meeting_point.label}{booking.meeting_point.note ? ` — ${booking.meeting_point.note}` : ""}</dd></div>}
        </dl>
        {booking.slot_status === "cancelled" && <p className="estate-public-guide-error">The estate team cancelled this inspection time. Please choose another one.</p>}
        {error && <p className="estate-public-guide-error">{error}</p>}
        <div className="estate-public-guide-actions">
          {booking.status === "booked" && booking.calendar_url && <a className="estate-public-primary" href={booking.calendar_url} target="_blank" rel="noreferrer">Add to calendar</a>}
          {booking.status === "booked" && booking.directions_url && <a className="estate-public-ghost" href={booking.directions_url} target="_blank" rel="noreferrer">Directions</a>}
          {booking.can_cancel && <button type="button" className="estate-public-ghost" disabled={busy} onClick={() => void cancel()}>{busy ? "Cancelling..." : "Cancel booking"}</button>}
          {booking.estate_slug && <Link className="estate-public-ghost" to={`/estates/public/${booking.estate_slug}#inspections`}>{booking.status === "cancelled" ? "Book another time" : "View the estate"}</Link>}
        </div>
      </div>
    </main>
  );
}
