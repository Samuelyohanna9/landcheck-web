import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { getGreenAuthSession, clearGreenAuthed } from "../auth/greenAuth";
import { ProjectMap } from "../components/ProjectMap";

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

const StatTile = ({ label, value }: { label: string; value: string | number }) => (
  <div style={styles.statTile}>
    <div style={styles.statValue}>{value}</div>
    <div style={styles.statLabel}>{label}</div>
  </div>
);

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
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>LandCheck Green — Merchant</div>
          <h1 style={styles.title}>{data?.merchant?.organization_name || "Your Sponsorship Program"}</h1>
        </div>
        <button type="button" style={styles.logoutButton} onClick={handleLogout}>
          Log out
        </button>
      </header>

      <main style={styles.main}>
        {error ? <p style={styles.error}>{error}</p> : null}
        {loading ? (
          <p style={styles.note}>Loading your dashboard...</p>
        ) : data ? (
          <>
            <section style={styles.statGrid}>
              <StatTile label="Orders" value={data.summary.total_orders} />
              <StatTile label="Trees Sponsored" value={data.summary.total_trees} />
              <StatTile label="Trees Planted" value={data.summary.planted_trees} />
              <StatTile label="Survival Rate" value={`${data.summary.survival_rate}%`} />
            </section>

            {data.map_points && data.map_points.length > 0 ? (
              <section style={{ ...styles.card, padding: 0, overflow: "hidden", marginBottom: 20 }}>
                <ProjectMap points={data.map_points} mode="green" />
              </section>
            ) : null}

            <div style={styles.actionsRow}>
              <a
                href={`${api.defaults.baseURL || ""}/green/merchant-auth/report.pdf?merchant_id=${merchantId}`}
                target="_blank"
                rel="noreferrer"
                style={styles.reportButton}
              >
                Download Impact Report
              </a>
            </div>

            <section style={styles.card}>
              <h2 style={styles.cardTitle}>Recent Orders</h2>
              {data.orders.length === 0 ? (
                <p style={styles.note}>No orders yet — once your integration sends its first order, it'll show up here.</p>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Order</th>
                        <th style={styles.th}>Your Order Ref</th>
                        <th style={styles.th}>Trees</th>
                        <th style={styles.th}>Planted</th>
                        <th style={styles.th}>Amount</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((order) => (
                        <tr key={order.id}>
                          <td style={styles.td}>{order.order_uid || "-"}</td>
                          <td style={styles.td}>{order.external_order_id || "-"}</td>
                          <td style={styles.td}>{order.quantity}</td>
                          <td style={styles.td}>
                            {order.linked_count ?? 0}/{order.quantity}
                          </td>
                          <td style={styles.td}>{formatAmount(order.amount_total, order.currency)}</td>
                          <td style={styles.td}>{order.order_status || "-"}</td>
                          <td style={styles.td}>{formatDate(order.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f4f8f5", fontFamily: "'Segoe UI', system-ui, sans-serif" },
  header: {
    background: "linear-gradient(135deg, #0d2818, #155e2f)",
    color: "#fff",
    padding: "24px 28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: { fontSize: 12, letterSpacing: 1, opacity: 0.75, textTransform: "uppercase" },
  title: { margin: "4px 0 0", fontSize: 24 },
  logoutButton: {
    background: "rgba(255,255,255,0.12)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: 8,
    padding: "8px 16px",
    cursor: "pointer",
  },
  main: { maxWidth: 960, margin: "0 auto", padding: "28px 20px 60px" },
  error: { color: "#b91c1c", background: "#fef2f2", padding: 12, borderRadius: 8 },
  note: { color: "#6b7280" },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 },
  statTile: {
    background: "#eef6f0",
    border: "1px solid #cfe6d5",
    borderRadius: 10,
    padding: "18px 10px",
    textAlign: "center",
  },
  statValue: { fontSize: 26, fontWeight: 800, color: "#0d2818" },
  statLabel: { fontSize: 12, color: "#3f5847", marginTop: 4 },
  actionsRow: { marginBottom: 20 },
  reportButton: {
    display: "inline-block",
    background: "#155e2f",
    color: "#fff",
    padding: "10px 18px",
    borderRadius: 8,
    textDecoration: "none",
    fontWeight: 600,
  },
  card: { background: "#fff", border: "1px solid #e2e8e4", borderRadius: 12, padding: 20 },
  cardTitle: { margin: "0 0 12px", fontSize: 16, color: "#0d2818" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e2e8e4", color: "#3f5847" },
  td: { padding: "8px 10px", borderBottom: "1px solid #eef2ef", color: "#1f2937" },
};
