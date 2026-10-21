import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../api/client";
import { getWorkAuthSession } from "../auth/workAuth";
import { money } from "../components/estates/FinancialComponents";
import Spinner from "../components/estates/EstateSpinner";
import "../styles/estate-dashboard.css";

type PaymentRow = {
  id: number;
  organization: { id: number; name: string } | null;
  estate: { id: number; name: string } | null;
  plot_number: string | null;
  customer_name: string | null;
  amount: string;
  currency: string;
  tx_ref: string;
  captured_at: string | null;
  settlement_status: "pending" | "settled";
  settlement_channel: string | null;
  settled_at: string | null;
  manual_transfer_status: string | null;
  manual_transfer_error: string | null;
  payout_account_ready: boolean;
  payout_account: { bank_name: string | null; account_name: string; account_number: string } | null;
};

type SettlementRequestRow = {
  id: number;
  organization: { id: number; name: string } | null;
  charge_attempt_id: number | null;
  amount: string | null;
  note: string | null;
  status: "requested" | "in_review" | "settled" | "declined";
  created_at: string;
  settled_at: string | null;
};

// LandCheck-internal only - every Estates organization's captured Flutterwave payments and
// developer-filed settlement requests, platform-wide (not scoped to one org/estate the way the
// rest of the Estates dashboard is). Gated by the same Super Admin session Green's own admin
// payout tooling already uses - see require_super_admin_request on the backend.
export default function EstateAdminAccountingPage() {
  const session = getWorkAuthSession();
  const isSuperAdmin = String(session?.user?.role_key || session?.user?.role || "").trim().toLowerCase() === "super_admin";

  const [view, setView] = useState<"payments" | "requests">("payments");
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [requests, setRequests] = useState<SettlementRequestRow[] | null>(null);
  const [settlingId, setSettlingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "settled">("pending");

  const loadPayments = () => {
    setPayments(null);
    api.get<{ rows: PaymentRow[] }>("/estate-admin/accounting/payments", { params: { settlement_status: statusFilter === "all" ? undefined : statusFilter } })
      .then((response) => setPayments(response.data.rows || []))
      .catch(() => setPayments([]));
  };

  const loadRequests = () => {
    setRequests(null);
    api.get<{ rows: SettlementRequestRow[] }>("/estate-admin/accounting/settlement-requests")
      .then((response) => setRequests(response.data.rows || []))
      .catch(() => setRequests([]));
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (view === "payments") loadPayments();
    else loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, view, statusFilter]);

  const settlePayment = async (row: PaymentRow) => {
    if (!window.confirm(`Transfer ${money(row.amount)} to ${row.payout_account?.account_name || "this organization's"} verified account now?`)) return;
    setSettlingId(row.id);
    try {
      await api.post(`/estate-admin/accounting/charge-attempts/${row.id}/settle`);
      toast.success("Transfer initiated - status updated to settled.");
      loadPayments();
      loadRequests();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The transfer could not be initiated."));
    } finally {
      setSettlingId(null);
    }
  };

  const reviewRequest = async (id: number, status: "in_review" | "declined") => {
    try {
      await api.patch(`/estate-admin/accounting/settlement-requests/${id}`, { status });
      toast.success("Updated.");
      loadRequests();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Could not update this request."));
    }
  };

  if (!session) {
    return (
      <div className="edash-onboard">
        <div className="edash-onboard-body">
          <div className="edash-onboard-head"><h1>Sign in required</h1><p>This page is for LandCheck staff only.</p></div>
          <Link className="edash-btn-primary" to="/green-work/login">Go to sign in</Link>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="edash-onboard">
        <div className="edash-onboard-body">
          <div className="edash-onboard-head"><h1>Super Admin access required</h1><p>Your account doesn't have access to Estates accounting.</p></div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px" }}>
      <h1 style={{ fontSize: "1.3rem", marginBottom: 4 }}>Estates accounting</h1>
      <p className="edash-field-note" style={{ marginBottom: 18 }}>Every organization's captured Flutterwave payments and settlement requests, platform-wide.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" className={view === "payments" ? "edash-btn-primary" : "edash-btn-outline"} onClick={() => setView("payments")}>Payments</button>
        <button type="button" className={view === "requests" ? "edash-btn-primary" : "edash-btn-outline"} onClick={() => setView("requests")}>Settlement requests</button>
      </div>

      {view === "payments" ? (
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head" style={{ justifyContent: "space-between" }}>
              <h3 className="edash-card-title">Captured payments ({payments?.length ?? 0})</h3>
              <select className="edash-map-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option value="pending">Awaiting settlement</option>
                <option value="settled">Settled</option>
                <option value="all">All</option>
              </select>
            </div>
            {payments === null ? (
              <p className="edash-tab-empty"><Spinner size={13} /> Loading...</p>
            ) : payments.length ? (
              <div style={{ overflowX: "auto" }}>
                <table className="edash-mini-table">
                  <thead><tr><th>Date</th><th>Organization</th><th>Estate / Plot</th><th>Customer</th><th>Amount</th><th>Payout account</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {payments.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Date">{row.captured_at ? new Date(row.captured_at).toLocaleDateString() : "-"}</td>
                        <td data-label="Organization">{row.organization?.name || "-"}</td>
                        <td data-label="Estate / Plot">{row.estate?.name || "-"} / {row.plot_number || "-"}</td>
                        <td data-label="Customer">{row.customer_name || "-"}</td>
                        <td data-label="Amount">{money(row.amount, row.currency)}</td>
                        <td data-label="Payout account">
                          {row.payout_account ? (
                            <span>{row.payout_account.account_name} <span className="edash-field-note">({row.payout_account.bank_name} - {row.payout_account.account_number})</span></span>
                          ) : <span className="edash-status-pill tone-danger">Not set up</span>}
                        </td>
                        <td data-label="Status">
                          {row.settlement_status === "settled" ? (
                            <span className="edash-status-pill tone-good">Settled{row.settlement_channel === "manual_transfer" ? " (manual)" : ""}</span>
                          ) : (
                            <span className="edash-status-pill tone-neutral">Awaiting settlement</span>
                          )}
                          {row.manual_transfer_error && <div className="edash-field-note" style={{ color: "var(--edash-danger, #b3261e)" }}>{row.manual_transfer_error}</div>}
                        </td>
                        <td>
                          {row.settlement_status !== "settled" && (
                            <button type="button" className="edash-btn-outline" disabled={!row.payout_account_ready || settlingId === row.id} onClick={() => void settlePayment(row)}>
                              {settlingId === row.id ? "Settling..." : "Settle"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="edash-tab-empty">No payments in this view.</p>}
          </div>
        </div>
      ) : (
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Settlement requests ({requests?.length ?? 0})</h3></div>
            {requests === null ? (
              <p className="edash-tab-empty"><Spinner size={13} /> Loading...</p>
            ) : requests.length ? (
              <div style={{ overflowX: "auto" }}>
                <table className="edash-mini-table">
                  <thead><tr><th>Date</th><th>Organization</th><th>Amount</th><th>Note</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {requests.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Date">{new Date(row.created_at).toLocaleDateString()}</td>
                        <td data-label="Organization">{row.organization?.name || "-"}</td>
                        <td data-label="Amount">{row.amount ? money(row.amount) : "-"}</td>
                        <td data-label="Note">{row.note || "-"}</td>
                        <td data-label="Status"><span className={`edash-status-pill tone-${row.status === "settled" ? "good" : row.status === "declined" ? "danger" : "neutral"}`}>{row.status.replaceAll("_", " ")}</span></td>
                        <td>
                          {row.status === "requested" && (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button type="button" className="edash-btn-outline" onClick={() => void reviewRequest(row.id, "in_review")}>Mark in review</button>
                              <button type="button" className="edash-btn-outline" onClick={() => void reviewRequest(row.id, "declined")}>Decline</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="edash-tab-empty">No settlement requests yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
