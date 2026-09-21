import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import { getEstateAuthSession } from "../../auth/estateAuth";
import { PAYMENT_METHODS } from "./FinancialComponents";

type ReservationRequest = {
  id: number;
  estate_name: string | null;
  plot_number: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  message: string | null;
  status: "new" | "contacted" | "converted" | "declined";
  customer_id: number | null;
  allocation_id: number | null;
  attribution?: { type: string; label: string; agent_name?: string | null; campaign_name?: string | null; source_code?: string | null; source_channel?: string | null };
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

function addCalendarMonths(value: string, months: number) {
  const date = new Date(`${value}T12:00:00`);
  if (!value || !Number.isFinite(date.getTime()) || !Number.isInteger(months) || months < 1) return null;
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDay));
  return date;
}

function schedulePreview(nextDueDate: string, intervalMonths: string) {
  const interval = Number(intervalMonths);
  const first = new Date(`${nextDueDate}T12:00:00`);
  if (!nextDueDate || !Number.isFinite(first.getTime()) || !Number.isInteger(interval) || interval < 1) return null;
  const dates = [first, addCalendarMonths(nextDueDate, interval), addCalendarMonths(nextDueDate, interval * 2)].filter(Boolean) as Date[];
  return dates.map((date) => date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }));
}

function tomorrowDateInputValue() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function attributionLabel(item: ReservationRequest) {
  if (item.attribution?.type === "agent") return `Agent: ${item.attribution.agent_name || "Assigned agent"}`;
  if (item.attribution?.type === "company_qr") return `Company QR: ${item.attribution.campaign_name || item.attribution.source_code || "Company campaign"}`;
  return item.attribution?.label || "Direct public page";
}

export default function EstateReservationRequests({ estateId }: { estateId: string }) {
  const [requests, setRequests] = useState<ReservationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [migratingId, setMigratingId] = useState<number | null>(null);
  const [paymentRequestId, setPaymentRequestId] = useState<number | null>(null);
  const [initialPaymentAmount, setInitialPaymentAmount] = useState("");
  const [initialPaymentMethod, setInitialPaymentMethod] = useState("bank_transfer");
  const [paymentScheduleEnabled, setPaymentScheduleEnabled] = useState(false);
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [installmentIntervalMonths, setInstallmentIntervalMonths] = useState("3");
  const [nextPaymentDueDate, setNextPaymentDueDate] = useState("");
  const role = getEstateAuthSession()?.user.role_key;
  const canUpdate = role === "owner" || role === "manager" || role === "sales" || role === "marketer";

  const resetConversionPaymentForm = () => {
    setPaymentRequestId(null);
    setInitialPaymentAmount("");
    setInitialPaymentMethod("bank_transfer");
    setPaymentScheduleEnabled(false);
    setInstallmentAmount("");
    setInstallmentIntervalMonths("3");
    setNextPaymentDueDate("");
  };

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

  const migrateToCustomer = async (requestId: number) => {
    if (!initialPaymentAmount || Number(initialPaymentAmount) <= 0) {
      toast.error("Enter the customer's first payment before creating the reservation.");
      return;
    }
    if (paymentScheduleEnabled && (!installmentAmount || Number(installmentAmount) <= 0 || !nextPaymentDueDate || !Number.isInteger(Number(installmentIntervalMonths)) || Number(installmentIntervalMonths) < 1)) {
      toast.error("Enter the instalment amount, repeat interval in months, and next payment due date.");
      return;
    }
    setMigratingId(requestId);
    try {
      const response = await api.post(`/estates/reservation-requests/${requestId}/convert`, {
        initial_payment_amount: Number(initialPaymentAmount),
        initial_payment_method: initialPaymentMethod,
        payment_schedule: paymentScheduleEnabled ? {
          installment_amount: Number(installmentAmount),
          interval_months: Number(installmentIntervalMonths),
          next_due_at: `${nextPaymentDueDate}T00:00:00Z`,
        } : null,
      });
      setRequests((current) => current.map((item) => item.id === requestId ? response.data : item));
      toast.success("Customer created and plot reserved.");
      resetConversionPaymentForm();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The request could not be added to customers."));
    } finally {
      setMigratingId(null);
    }
  };

  return (
    <section id="public-reservations" className="edash-card edash-public-leads">
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
                  <small className="edash-public-lead-attribution">{attributionLabel(item)}{item.attribution?.source_channel ? ` · ${item.attribution.source_channel}` : ""}</small>
                  {item.message && <p>{item.message}</p>}
                  <small>{relativeDate(item.created_at)}</small>
                </div>
                <div className="edash-public-lead-actions">
                  <span className={`edash-public-lead-status is-${item.status}`}>{statusLabels[item.status]}</span>
                  {canUpdate && item.status !== "converted" && <>
                    <select aria-label={`Update request from ${item.full_name}`} disabled={updatingId === item.id || migratingId === item.id} value={item.status} onChange={(event) => void updateStatus(item.id, event.target.value as ReservationRequest["status"])}><option value="new">New</option><option value="contacted">Contacted</option><option value="declined">Declined</option></select>
                    {paymentRequestId === item.id ? (
                      <div className="edash-public-lead-payment">
                        <label><span>First payment received now (NGN)</span><input type="number" min="0.01" step="0.01" value={initialPaymentAmount} onChange={(event) => setInitialPaymentAmount(event.target.value)} placeholder="Amount received now" /></label>
                        <label><span>Payment method</span><select value={initialPaymentMethod} onChange={(event) => setInitialPaymentMethod(event.target.value)}>{PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
                        <small>The payment is required before this enquiry becomes a proper reservation.</small>
                        <label className="edash-public-lead-schedule-toggle"><span>Payment schedule</span><select value={paymentScheduleEnabled ? "scheduled" : "none"} onChange={(event) => setPaymentScheduleEnabled(event.target.value === "scheduled")}><option value="none">No scheduled instalments</option><option value="scheduled">Schedule instalment reminders</option></select></label>
                        {paymentScheduleEnabled && <div className="edash-payment-schedule-fields edash-public-lead-schedule">
                          <label><span>Next instalment amount (NGN)</span><input type="number" min="0.01" step="0.01" value={installmentAmount} onChange={(event) => setInstallmentAmount(event.target.value)} placeholder="Amount due next" /></label>
                          <label><span>Repeat every (months)</span><div className="edash-payment-interval-input"><input type="number" min="1" max="60" step="1" value={installmentIntervalMonths} onChange={(event) => setInstallmentIntervalMonths(event.target.value)} /><span>months</span></div><small>3 means once every 3 months, not monthly.</small></label>
                          <label><span>Next payment due</span><input type="date" min={tomorrowDateInputValue()} value={nextPaymentDueDate} onChange={(event) => setNextPaymentDueDate(event.target.value)} /></label>
                          <p>The first payment above is recorded today. We will email the buyer up to 7 days before each next due date.</p>
                          {schedulePreview(nextPaymentDueDate, installmentIntervalMonths) && <p className="edash-payment-schedule-preview">Example schedule: {schedulePreview(nextPaymentDueDate, installmentIntervalMonths)?.join(" -> ")}</p>}
                        </div>}
                        <div><button type="button" className="edash-btn-primary edash-public-lead-convert" disabled={migratingId === item.id} onClick={() => void migrateToCustomer(item.id)}>{migratingId === item.id ? "Adding..." : "Confirm reservation"}</button><button type="button" className="edash-btn-outline" onClick={resetConversionPaymentForm}>Cancel</button></div>
                      </div>
                    ) : <button type="button" className="edash-btn-primary edash-public-lead-convert" onClick={() => { resetConversionPaymentForm(); setPaymentRequestId(item.id); }}>{"Add payment & reserve"}</button>}
                  </>}
                  {item.status === "converted" && <small className="edash-public-lead-converted">Customer and reservation created</small>}
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
