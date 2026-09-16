import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import { getEstateAuthSession } from "../../auth/estateAuth";

type ReservationRequest = {
  id: number;
  estate_name: string | null;
  plot_number: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  message: string | null;
  status: "new" | "contacted" | "converted" | "declined";
  created_at: string;
};

const statusLabels: Record<ReservationRequest["status"], string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
  declined: "Declined",
};

function relativeDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function EstateReservationRequests({ estateId }: { estateId: string }) {
  const [requests, setRequests] = useState<ReservationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const role = getEstateAuthSession()?.user.role_key;
  const canUpdate = role === "owner" || role === "manager" || role === "sales";

  const load = () => {
    api.get(`/estates/${estateId}/reservation-requests`)
      .then((response) => setRequests(response.data || []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [estateId]);

  const updateStatus = async (requestId: number, status: ReservationRequest["status"]) => {
    setUpdatingId(requestId);
    try {
      const response = await api.patch(`/estates/reservation-requests/${requestId}`, { status });
      setRequests((current) => current.map((item) => item.id === requestId ? response.data : item));
      toast.success("Reservation request updated.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The reservation request could not be updated."));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="edash-card edash-public-leads">
      <div className="edash-card-inner">
        <div className="edash-card-head">
          <div>
            <h3 className="edash-card-title">Public reservation requests</h3>
            <p className="edash-public-leads-subtitle">People who asked about a plot on your public Estate page.</p>
          </div>
          <span className="edash-public-leads-count">{requests.filter((item) => item.status === "new").length} new</span>
        </div>
        {loading ? <p className="edash-tab-empty">Loading requests...</p> : requests.length === 0 ? <p className="edash-tab-empty">No public requests yet. Publish your Estate page to start receiving enquiries.</p> : (
          <div className="edash-public-lead-list">
            {requests.slice(0, 8).map((item) => (
              <article className="edash-public-lead" key={item.id}>
                <div className="edash-public-lead-main">
                  <div className="edash-public-lead-title"><strong>{item.full_name}</strong><span>Plot {item.plot_number || "-"}</span></div>
                  <div className="edash-public-lead-contact"><a href={`tel:${item.phone}`}>{item.phone}</a>{item.email && <a href={`mailto:${item.email}`}>{item.email}</a>}</div>
                  {item.message && <p>{item.message}</p>}
                  <small>{relativeDate(item.created_at)}</small>
                </div>
                <div className="edash-public-lead-actions">
                  <span className={`edash-public-lead-status is-${item.status}`}>{statusLabels[item.status]}</span>
                  {canUpdate && <select aria-label={`Update request from ${item.full_name}`} disabled={updatingId === item.id} value={item.status} onChange={(event) => void updateStatus(item.id, event.target.value as ReservationRequest["status"])}><option value="new">New</option><option value="contacted">Contacted</option><option value="converted">Converted</option><option value="declined">Declined</option></select>}
                </div>
              </article>
            ))}
          </div>
        )}
        {requests.length > 8 && <p className="edash-public-leads-more">Showing the latest 8 requests.</p>}
      </div>
    </section>
  );
}
