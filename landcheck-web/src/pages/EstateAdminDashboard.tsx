import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extractApiErrorMessage } from "../api/client";
import { clearWorkAuthed, getWorkAuthSession } from "../auth/workAuth";
import GreenLoadingAnimation from "../components/GreenLoadingAnimation";
import "../styles/admin-dashboard.css";

type EstateAdminOrganization = {
  organization_id: number;
  company_name: string | null;
  slug: string | null;
  organization_status: string | null;
  contact_email: string | null;
  created_at: string | null;
  updated_at: string | null;
  plan_key: string | null;
  subscription_status: string | null;
  billing_cycle: string | null;
  amount: number | string | null;
  currency: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  next_charge_at: string | null;
  user_count: number;
  active_user_count: number;
  estate_count: number;
  public_estate_count: number;
  plot_count: number;
  approved_plot_count: number;
  available_plot_count: number;
  reserved_plot_count: number;
  allocated_plot_count: number;
  reservation_count: number;
  open_reservation_count: number;
  customer_count: number;
  total_plot_area_sqm: number | string | null;
  latest_estate_name: string | null;
  latest_estate_location: string | null;
  last_estate_activity_at: string | null;
};

type EstateAdminOverview = {
  generated_at: string;
  totals: {
    organizations: number;
    active_organizations: number;
    users: number;
    active_users: number;
    estates: number;
    plots: number;
    approved_plots: number;
    available_plots: number;
    reserved_plots: number;
    allocated_plots: number;
    open_reservations: number;
    customers: number;
    subscribed_organizations: number;
    past_due_subscriptions: number;
  };
  organizations: EstateAdminOrganization[];
};

const hasSuperAdminAccess = () => {
  const session = getWorkAuthSession();
  const role = String(session?.user?.role_key || session?.user?.role || "").trim().toLowerCase();
  return Boolean(session && (session.auth_mode === "env_admin" || role === "super_admin"));
};

const formatCount = (value: unknown) => Number(value || 0).toLocaleString();

const formatDateTime = (value?: string | null) => {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const formatDate = (value?: string | null) => {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const formatLabel = (value?: string | null) => {
  const clean = String(value || "not started").replace(/[_-]+/g, " ").trim();
  return clean ? clean.replace(/\b\w/g, (character) => character.toUpperCase()) : "Not started";
};

const formatPlan = (value?: string | null) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "No plan";
};

const formatMoney = (amount: number | string | null, currency?: string | null) => {
  const numericAmount = Number(amount || 0);
  if (!amount || !Number.isFinite(numericAmount)) return "Not set";
  return `${String(currency || "NGN").toUpperCase()} ${numericAmount.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
};

const statusClass = (value?: string | null) => {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
  return `estate-admin-status estate-admin-status--${normalized || "unknown"}`;
};

export default function EstateAdminDashboard() {
  const navigate = useNavigate();
  const [isAuthed, setIsAuthed] = useState(hasSuperAdminAccess);
  const [overview, setOverview] = useState<EstateAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [expandedOrganizationId, setExpandedOrganizationId] = useState<number | null>(null);
  const [reconcileOrganizationId, setReconcileOrganizationId] = useState<number | null>(null);
  const [reconcilePlan, setReconcilePlan] = useState<"basic" | "plus">("basic");
  const [reconcileCycle, setReconcileCycle] = useState<"monthly" | "yearly">("monthly");
  const [transferReference, setTransferReference] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState("");

  const loadOverview = async (silent = false) => {
    if (!hasSuperAdminAccess()) {
      setIsAuthed(false);
      setLoading(false);
      return;
    }
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await api.get<EstateAdminOverview>("/green/admin/estate-overview");
      setOverview(response.data || null);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || "Estate monitoring data could not be loaded.");
      setOverview(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      return;
    }
    void loadOverview();
  }, [isAuthed]);

  const handleLogout = () => {
    clearWorkAuthed();
    setIsAuthed(false);
    setOverview(null);
    navigate("/green-work/login", { replace: true });
  };

  const reconcileSubscription = async (organizationId: number) => {
    const reference = transferReference.trim();
    if (!reference) {
      setReconcileMessage("Enter the verified bank-transfer reference before reconciling.");
      return;
    }
    setReconciling(true);
    setReconcileMessage("");
    try {
      await api.post(`/green/admin/estate-overview/${organizationId}/reconcile`, {
        plan_key: reconcilePlan,
        billing_cycle: reconcileCycle,
        transfer_reference: reference,
        amount: "50",
      });
      setTransferReference("");
      setReconcileOrganizationId(null);
      setReconcileMessage("Subscription reconciled. Access is active and the onboarding email has been sent.");
      await loadOverview(true);
    } catch (requestError) {
      setReconcileMessage(await extractApiErrorMessage(requestError, "The transfer could not be reconciled."));
    } finally {
      setReconciling(false);
    }
  };

  if (!isAuthed) {
    return (
      <div className="admin-login">
        <div className="admin-login-card">
          <h1>Super Admin access required</h1>
          <p>Sign in through LandCheck Work with a Super Admin account to monitor Estate companies and subscriptions.</p>
          <button type="button" onClick={() => navigate("/green-work/login")}>Open LandCheck Work Login</button>
        </div>
      </div>
    );
  }

  const totals = overview?.totals;

  return (
    <div className="admin-container estate-admin-container">
      <header className="admin-header">
        <div className="header-left">
          <button className="back-btn" type="button" onClick={() => navigate("/green-work")} aria-label="Back to LandCheck Work">
            ←
          </button>
          <div>
            <h1>Estate Admin</h1>
            <span className="last-updated">Estate companies, users and subscriptions</span>
          </div>
        </div>
        <div className="header-right">
          <span className="last-updated">{overview?.generated_at ? `Updated: ${formatDateTime(overview.generated_at)}` : ""}</span>
          <button className="logout-btn" type="button" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {loading ? (
        <div className="loading-state">
          <GreenLoadingAnimation label="Loading Estate monitoring..." size="small" className="estate-loading-animation" />
        </div>
      ) : (
        <main className="admin-content estate-admin-content">
          {error ? <div className="estate-admin-error" role="alert">{error}</div> : null}
          {reconcileMessage ? <div className="estate-admin-reconcile-message" role="status">{reconcileMessage}</div> : null}

          <section className="stats-section">
            <div className="section-head">
              <div>
                <h2>Estate platform overview</h2>
                <p>See which companies are using LandCheck Estates, what they have built, and where attention is needed.</p>
              </div>
              <button className="estate-admin-refresh" type="button" onClick={() => void loadOverview(true)} disabled={refreshing}>
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            <div className="stats-grid">
              <div className="stat-card primary"><div className="stat-content"><span className="stat-value">{formatCount(totals?.organizations)}</span><span className="stat-label">Estate companies</span></div></div>
              <div className="stat-card success"><div className="stat-content"><span className="stat-value">{formatCount(totals?.subscribed_organizations)}</span><span className="stat-label">Active or trial plans</span></div></div>
              <div className="stat-card info"><div className="stat-content"><span className="stat-value">{formatCount(totals?.users)}</span><span className="stat-label">Estate users</span></div></div>
              <div className="stat-card warning"><div className="stat-content"><span className="stat-value">{formatCount(totals?.estates)}</span><span className="stat-label">Estates created</span></div></div>
              <div className="stat-card primary"><div className="stat-content"><span className="stat-value">{formatCount(totals?.plots)}</span><span className="stat-label">Plots registered</span></div></div>
              <div className="stat-card warning"><div className="stat-content"><span className="stat-value">{formatCount(totals?.open_reservations)}</span><span className="stat-label">Open enquiries</span></div></div>
            </div>
          </section>

          <section className="estate-admin-section">
            <div className="section-head">
              <div>
                <h2>Estate companies</h2>
                <p>Select a company to see its latest estate, plot progress, public page, customers and billing dates.</p>
              </div>
            </div>
            {overview?.organizations?.length ? (
              <div className="estate-admin-table-wrap">
                <table className="estate-admin-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Users</th>
                      <th>Plan</th>
                      <th>Subscription</th>
                      <th>Estates</th>
                      <th>Plots</th>
                      <th>Enquiries</th>
                      <th>Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.organizations.map((organization) => {
                      const isExpanded = expandedOrganizationId === organization.organization_id;
                      return (
                        <Fragment key={organization.organization_id}>
                          <tr
                            className={`estate-admin-row${isExpanded ? " is-expanded" : ""}`}
                            onClick={() => setExpandedOrganizationId((current) => current === organization.organization_id ? null : organization.organization_id)}
                          >
                            <td>
                              <strong>{organization.company_name || "Unnamed company"}</strong>
                              <span className="estate-admin-muted">{organization.slug || "No public address"}</span>
                              <span className="estate-admin-muted">{organization.contact_email || "No contact email"}</span>
                            </td>
                            <td><strong>{formatCount(organization.active_user_count)}</strong><span className="estate-admin-muted">of {formatCount(organization.user_count)} active</span></td>
                            <td><strong>{formatPlan(organization.plan_key)}</strong><span className="estate-admin-muted">{organization.billing_cycle ? formatLabel(organization.billing_cycle) : "Not subscribed"}</span></td>
                            <td><span className={statusClass(organization.subscription_status)}>{formatLabel(organization.subscription_status)}</span><span className="estate-admin-muted">{formatMoney(organization.amount, organization.currency)}</span></td>
                            <td><strong>{formatCount(organization.estate_count)}</strong><span className="estate-admin-muted">{formatCount(organization.public_estate_count)} public</span></td>
                            <td><strong>{formatCount(organization.plot_count)}</strong><span className="estate-admin-muted">{formatCount(organization.approved_plot_count)} approved</span></td>
                            <td><strong>{formatCount(organization.open_reservation_count)}</strong><span className="estate-admin-muted">{formatCount(organization.customer_count)} customers</span></td>
                            <td><span className="estate-admin-muted">{formatDateTime(organization.last_estate_activity_at || organization.updated_at)}</span></td>
                          </tr>
                          {isExpanded ? (
                            <tr className="estate-admin-detail-row">
                              <td colSpan={8}>
                                <div className="estate-admin-detail-grid">
                                  <div><span>Latest estate</span><strong>{organization.latest_estate_name || "No estate created"}</strong><small>{organization.latest_estate_location || "Location not set"}</small></div>
                                  <div><span>Plot progress</span><strong>{formatCount(organization.available_plot_count)} available</strong><small>{formatCount(organization.reserved_plot_count)} reserved · {formatCount(organization.allocated_plot_count)} allocated</small></div>
                                  <div><span>Area mapped</span><strong>{Number(organization.total_plot_area_sqm || 0).toLocaleString()} m²</strong><small>{formatCount(organization.approved_plot_count)} approved plots</small></div>
                                  <div><span>Public activity</span><strong>{formatCount(organization.reservation_count)} enquiries</strong><small>{formatCount(organization.customer_count)} customer records</small></div>
                                  <div><span>Billing</span><strong>{organization.subscription_status === "trialing" ? "Trial ends" : "Next billing"}</strong><small>{formatDate(organization.subscription_status === "trialing" ? organization.trial_ends_at : organization.next_charge_at || organization.current_period_end)}</small></div>
                                  <div><span>Company status</span><strong>{formatLabel(organization.organization_status)}</strong><small>Joined {formatDate(organization.created_at)}</small></div>
                                </div>
                                {!organization.plan_key && (
                                  <div className="estate-admin-reconcile">
                                    {reconcileOrganizationId !== organization.organization_id ? (
                                      <>
                                        <div>
                                          <strong>Direct bank transfer?</strong>
                                          <small>Use this only after confirming the NGN 50 trial transfer.</small>
                                        </div>
                                        <button
                                          type="button"
                                          className="estate-admin-reconcile-button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setReconcileOrganizationId(organization.organization_id);
                                            setReconcileMessage("");
                                          }}
                                        >
                                          Reconcile transfer
                                        </button>
                                      </>
                                    ) : (
                                      <div className="estate-admin-reconcile-form" onClick={(event) => event.stopPropagation()}>
                                        <div>
                                          <strong>Reconcile verified bank transfer</strong>
                                          <small>Choose the plan agreed with the company. This grants the 3-day trial immediately.</small>
                                        </div>
                                        <label>Plan<select value={reconcilePlan} onChange={(event) => setReconcilePlan(event.target.value as "basic" | "plus")}><option value="basic">Basic</option><option value="plus">Plus</option></select></label>
                                        <label>Billing<select value={reconcileCycle} onChange={(event) => setReconcileCycle(event.target.value as "monthly" | "yearly")}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
                                        <label>Transfer reference<input value={transferReference} onChange={(event) => setTransferReference(event.target.value)} placeholder="Bank reference" /></label>
                                        <label>Verified amount<input value="NGN 50" readOnly /></label>
                                        <div className="estate-admin-reconcile-actions">
                                          <button type="button" className="estate-admin-reconcile-button" disabled={reconciling} onClick={() => void reconcileSubscription(organization.organization_id)}>{reconciling ? "Reconciling..." : "Confirm and activate"}</button>
                                          <button type="button" className="estate-admin-reconcile-cancel" disabled={reconciling} onClick={() => setReconcileOrganizationId(null)}>Cancel</button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="no-feedback"><p>No Estate companies have been registered yet.</p></div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
