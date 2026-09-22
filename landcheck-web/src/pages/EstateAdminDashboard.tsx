import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extractApiErrorMessage } from "../api/client";
import { clearWorkAuthed, getWorkAuthSession } from "../auth/workAuth";
import GreenLoadingAnimation from "../components/GreenLoadingAnimation";
import "../styles/admin-dashboard.css";

type EstateAdminEstate = {
  id: number;
  name: string;
  location: string | null;
  status: string | null;
  public_enabled: boolean;
  plot_count: number;
  approved_plot_count: number;
  available_plot_count: number;
  reserved_plot_count: number;
  allocated_plot_count: number;
  area_sqm: number | string | null;
  reservation_count: number;
  updated_at: string | null;
};

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
  online_user_count: number;
  last_user_activity_at: string | null;
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
  estates: EstateAdminEstate[];
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
    online_users: number;
    online_organizations: number;
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
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadOverview(true);
    }, 30000);
    return () => window.clearInterval(refreshTimer);
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
              <div className="stat-card success"><div className="stat-content"><span className="stat-value">{formatCount(totals?.online_users)}</span><span className="stat-label">Users online now</span></div></div>
              <div className="stat-card warning"><div className="stat-content"><span className="stat-value">{formatCount(totals?.estates)}</span><span className="stat-label">Estates created</span></div></div>
              <div className="stat-card primary"><div className="stat-content"><span className="stat-value">{formatCount(totals?.plots)}</span><span className="stat-label">Plots registered</span></div></div>
              <div className="stat-card warning"><div className="stat-content"><span className="stat-value">{formatCount(totals?.open_reservations)}</span><span className="stat-label">Open enquiries</span></div></div>
            </div>
          </section>

          <section className="estate-admin-section">
            <div className="section-head">
              <div>
                <h2>Estate companies</h2>
                <p>Select a company to see live user activity, every estate, plot progress, public page, customers and billing dates.</p>
              </div>
            </div>
            {overview?.organizations?.length ? (
              <div className="estate-admin-table-wrap">
                <table className="estate-admin-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Users</th>
                      <th>Active status</th>
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
                      const onlineNow = organization.online_user_count > 0;
                      const lastActivity = organization.last_user_activity_at || organization.last_estate_activity_at || organization.updated_at;
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
                            <td><span className={statusClass(onlineNow ? "online" : "offline")}>{onlineNow ? "Online now" : "Offline"}</span><span className="estate-admin-muted">{onlineNow ? `${formatCount(organization.online_user_count)} user${organization.online_user_count === 1 ? "" : "s"} working` : "No active session"}</span></td>
                            <td><strong>{formatPlan(organization.plan_key)}</strong><span className="estate-admin-muted">{organization.billing_cycle ? formatLabel(organization.billing_cycle) : "Not subscribed"}</span></td>
                            <td><span className={statusClass(organization.subscription_status)}>{formatLabel(organization.subscription_status)}</span><span className="estate-admin-muted">{formatMoney(organization.amount, organization.currency)}</span></td>
                            <td><strong>{formatCount(organization.estate_count)}</strong><span className="estate-admin-muted">{formatCount(organization.public_estate_count)} public</span></td>
                            <td><strong>{formatCount(organization.plot_count)}</strong><span className="estate-admin-muted">{formatCount(organization.approved_plot_count)} approved</span></td>
                            <td><strong>{formatCount(organization.open_reservation_count)}</strong><span className="estate-admin-muted">{formatCount(organization.customer_count)} customers</span></td>
                            <td><span className="estate-admin-muted">{formatDateTime(lastActivity)}</span><span className="estate-admin-muted">{organization.last_user_activity_at ? "Last user activity" : "Last estate update"}</span></td>
                          </tr>
                          {isExpanded ? (
                            <tr className="estate-admin-detail-row">
                              <td colSpan={9}>
                                <div className="estate-admin-detail-grid">
                                  <div><span>Latest estate</span><strong>{organization.latest_estate_name || "No estate created"}</strong><small>{organization.latest_estate_location || "Location not set"}</small></div>
                                  <div><span>Plot progress</span><strong>{formatCount(organization.available_plot_count)} available</strong><small>{formatCount(organization.reserved_plot_count)} reserved · {formatCount(organization.allocated_plot_count)} allocated</small></div>
                                  <div><span>Area mapped</span><strong>{Number(organization.total_plot_area_sqm || 0).toLocaleString()} m²</strong><small>{formatCount(organization.approved_plot_count)} approved plots</small></div>
                                  <div><span>Public activity</span><strong>{formatCount(organization.reservation_count)} enquiries</strong><small>{formatCount(organization.customer_count)} customer records</small></div>
                                  <div><span>Live activity</span><strong>{onlineNow ? `${formatCount(organization.online_user_count)} online now` : "No one online"}</strong><small>{organization.last_user_activity_at ? `Last active ${formatDateTime(organization.last_user_activity_at)}` : "No user session yet"}</small></div>
                                  <div><span>Billing</span><strong>{organization.subscription_status === "trialing" ? "Trial ends" : "Next billing"}</strong><small>{formatDate(organization.subscription_status === "trialing" ? organization.trial_ends_at : organization.next_charge_at || organization.current_period_end)}</small></div>
                                  <div><span>Company status</span><strong>{formatLabel(organization.organization_status)}</strong><small>Joined {formatDate(organization.created_at)}</small></div>
                                </div>
                                <div className="estate-admin-estates">
                                  <div className="estate-admin-estates-head">
                                    <div><strong>Estate details</strong><small>All estates created by this company</small></div>
                                    <span>{formatCount(organization.estate_count)} total</span>
                                  </div>
                                  {organization.estates?.length ? (
                                    <div className="estate-admin-estate-list">
                                      {organization.estates.map((estate) => (
                                        <article className="estate-admin-estate-card" key={estate.id}>
                                          <div className="estate-admin-estate-card-head">
                                            <div><strong>{estate.name}</strong><small>{estate.location || "Location not set"}</small></div>
                                            <span className={statusClass(estate.status)}>{formatLabel(estate.status)}</span>
                                          </div>
                                          <div className="estate-admin-estate-meta">
                                            <span><strong>{formatCount(estate.plot_count)}</strong> plots</span>
                                            <span><strong>{formatCount(estate.approved_plot_count)}</strong> approved</span>
                                            <span><strong>{formatCount(estate.available_plot_count)}</strong> available</span>
                                            <span><strong>{formatCount(estate.reserved_plot_count)}</strong> reserved</span>
                                            <span><strong>{formatCount(estate.allocated_plot_count)}</strong> allocated</span>
                                            <span><strong>{Number(estate.area_sqm || 0).toLocaleString()} m2</strong> mapped</span>
                                          </div>
                                          <div className="estate-admin-estate-footer"><span className={estate.public_enabled ? "estate-admin-public is-public" : "estate-admin-public"}>{estate.public_enabled ? "Public page live" : "Public page off"}</span><span>{formatCount(estate.reservation_count)} enquiries - updated {formatDate(estate.updated_at)}</span></div>
                                        </article>
                                      ))}
                                    </div>
                                  ) : <p className="estate-admin-empty-estates">No estates created yet.</p>}
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
