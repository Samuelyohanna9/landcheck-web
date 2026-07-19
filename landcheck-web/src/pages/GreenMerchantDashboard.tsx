import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { getGreenAuthSession, clearGreenAuthed } from "../auth/greenAuth";
import { GreenGlyph } from "../components/GreenGlyph";
import { ProjectMap } from "../components/ProjectMap";
import "../styles/green-merchant.css";

type MerchantOrder = {
  id: number;
  order_uid?: string | null;
  external_order_id?: string | null;
  source?: string | null;
  quantity: number;
  amount_total?: number | null;
  currency?: string | null;
  order_status?: string | null;
  created_at?: string | null;
  linked_count?: number;
};

type MerchantDashboardData = {
  merchant: {
    organization_name?: string | null;
    contact_name?: string | null;
    contact_email?: string | null;
  };
  summary: {
    total_orders: number;
    total_trees: number;
    planted_trees: number;
    awaiting_tree: number;
    survival_rate: number;
  };
  orders: MerchantOrder[];
  map_points?: { lat: number; lng: number }[];
};

const formatDate = (iso?: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
};

const formatAmount = (amount?: number | null, currency?: string | null) => {
  if (amount === null || amount === undefined) return "-";
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency || "NGN"} ${amount.toLocaleString()}`;
  }
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Pending",
  payment_review: "In Review",
  paid: "Confirmed",
  allocated: "Assigned",
  completed: "Completed",
  cancelled: "Cancelled",
};

const toneForStatus = (status?: string | null): "ok" | "warn" | "neutral" | "info" => {
  const key = String(status || "").toLowerCase();
  if (key === "completed") return "ok";
  if (key === "allocated" || key === "payment_review") return "warn";
  if (key === "cancelled") return "neutral";
  return "info";
};

const SOURCE_LABELS: Record<string, string> = {
  api: "Direct API",
  webhook_shopify: "Shopify",
  admin: "Manual",
};

export default function GreenMerchantDashboard() {
  const navigate = useNavigate();
  const session = getGreenAuthSession();
  const merchantId = session?.user?.id || 0;
  const [data, setData] = useState<MerchantDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!merchantId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get(`/green/merchant-auth/dashboard`, { params: { merchant_id: merchantId, _ts: Date.now() } })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.detail || "Failed to load your dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [merchantId]);

  const handleLogout = () => {
    clearGreenAuthed();
    navigate("/green/login", { replace: true });
  };

  if (!merchantId) {
    navigate("/green/login", { replace: true });
    return null;
  }

  return (
    <div className="gm-page">
      <header className="gm-header">
        <div className="gm-header-left">
          <div className="gm-header-icon">
            <GreenGlyph name="briefcase" />
          </div>
          <div>
            <div className="gm-eyebrow">LandCheck Green &middot; Merchant Partner</div>
            <h1 className="gm-title">{data?.merchant?.organization_name || "Your Sponsorship Program"}</h1>
          </div>
        </div>
        <div className="gm-header-right">
          {data?.merchant?.contact_email ? <span className="gm-contact-pill">{data.merchant.contact_email}</span> : null}
          <button type="button" className="gm-logout-btn" onClick={handleLogout}>
            <GreenGlyph name="logout" />
            Log out
          </button>
        </div>
      </header>

      <main className="gm-main">
        {error ? <p className="gm-error">{error}</p> : null}

        {loading ? (
          <p className="gm-loading">Loading your dashboard&hellip;</p>
        ) : data ? (
          <>
            <section className="gm-stat-grid">
              <div className="gm-stat-card">
                <div className="gm-stat-icon">
                  <GreenGlyph name="receipt" />
                </div>
                <div className="gm-stat-value">{data.summary.total_orders}</div>
                <div className="gm-stat-label">Orders</div>
              </div>
              <div className="gm-stat-card">
                <div className="gm-stat-icon">
                  <GreenGlyph name="leaf" />
                </div>
                <div className="gm-stat-value">{data.summary.total_trees}</div>
                <div className="gm-stat-label">Trees Sponsored</div>
              </div>
              <div className="gm-stat-card">
                <div className="gm-stat-icon">
                  <GreenGlyph name="check-circle" />
                </div>
                <div className="gm-stat-value">{data.summary.planted_trees}</div>
                <div className="gm-stat-label">Trees Planted</div>
              </div>
              <div className="gm-stat-card">
                <div className="gm-stat-icon warn">
                  <GreenGlyph name="pulse" />
                </div>
                <div className="gm-stat-value">{data.summary.survival_rate}%</div>
                <div className="gm-stat-label">Survival Rate</div>
              </div>
            </section>

            {data.map_points && data.map_points.length > 0 ? (
              <section className="gm-card gm-map-card">
                <div className="gm-card-body">
                  <div className="gm-card-heading">
                    <div className="gm-card-heading-icon">
                      <GreenGlyph name="map" />
                    </div>
                    <div>
                      <div className="gm-card-title">Where Your Trees Are Growing</div>
                      <div className="gm-card-subtitle">Verified GPS locations of your customers' sponsored trees.</div>
                    </div>
                  </div>
                  <ProjectMap points={data.map_points} mode="green" />
                </div>
              </section>
            ) : null}

            <section className="gm-card gm-report-card">
              <div className="gm-card-body">
                <div className="gm-report-copy">
                  <div className="gm-report-icon">
                    <GreenGlyph name="chart" />
                  </div>
                  <div>
                    <div className="gm-card-title">Impact Report</div>
                    <div className="gm-card-subtitle">A downloadable summary of every tree sponsored through your integration.</div>
                  </div>
                </div>
                <a
                  href={`${api.defaults.baseURL || ""}/green/merchant-auth/report.pdf?merchant_id=${merchantId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="gm-report-btn"
                >
                  <GreenGlyph name="download" />
                  Download Report
                </a>
              </div>
            </section>

            <section className="gm-card">
              <div className="gm-card-body">
                <div className="gm-card-heading">
                  <div className="gm-card-heading-icon">
                    <GreenGlyph name="branch" />
                  </div>
                  <div>
                    <div className="gm-card-title">Recent Orders</div>
                    <div className="gm-card-subtitle">Every sponsorship created automatically through your integration.</div>
                  </div>
                </div>

                {data.orders.length === 0 ? (
                  <p className="gm-empty">No orders yet — once your integration sends its first order, it'll show up here.</p>
                ) : (
                  <div className="gm-table-wrap">
                    <table className="gm-table">
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Your Reference</th>
                          <th>Source</th>
                          <th>Trees Planted</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.orders.map((order) => {
                          const planted = order.linked_count ?? 0;
                          const pct = order.quantity > 0 ? Math.round((planted / order.quantity) * 100) : 0;
                          return (
                            <tr key={order.id}>
                              <td className="gm-mono">{order.order_uid || "-"}</td>
                              <td className="gm-mono">{order.external_order_id || "-"}</td>
                              <td>
                                <span className="gm-pill neutral">{SOURCE_LABELS[order.source || ""] || order.source || "-"}</span>
                              </td>
                              <td>
                                <div className="gm-progress-cell">
                                  <div className="gm-progress-track">
                                    <div className="gm-progress-fill" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span>
                                    {planted}/{order.quantity}
                                  </span>
                                </div>
                              </td>
                              <td>{formatAmount(order.amount_total, order.currency)}</td>
                              <td>
                                <span className={`gm-pill ${toneForStatus(order.order_status)}`}>
                                  {STATUS_LABELS[order.order_status || ""] || order.order_status || "-"}
                                </span>
                              </td>
                              <td>{formatDate(order.created_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
