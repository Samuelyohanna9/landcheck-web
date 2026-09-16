import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, extractApiErrorMessage } from "../api/client";
import { MAPBOX_TOKEN } from "../utils/mapboxLoader";
import { formatArea, type UnitSystem } from "../utils/unitFormat";
import "../styles/estate-portal.css";

type PlotView = {
  customer_name: string | null;
  plot_number: string;
  area_sqm: number | null;
  unit_system?: UnitSystem;
  status: string;
  estate_name: string | null;
  organization_name: string | null;
  geometry: any;
  boundary: any | null;
};

function buildMapUrl(view: PlotView): string | null {
  if (!MAPBOX_TOKEN) return null;
  const features: any[] = [];
  if (view.boundary) {
    features.push({ type: "Feature", properties: { fill: "#d1332b", "fill-opacity": 0, stroke: "#d1332b", "stroke-width": 2 }, geometry: view.boundary });
  }
  features.push({ type: "Feature", properties: { fill: "#1a8f5a", "fill-opacity": 0.4, stroke: "#1a8f5a", "stroke-width": 3 }, geometry: view.geometry });
  const overlay = encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features }));
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/geojson(${overlay})/auto/1000x620@2x?padding=60&access_token=${MAPBOX_TOKEN}`;
}

export default function PublicPlotView() {
  const { token } = useParams();
  const [view, setView] = useState<PlotView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.get(`/estates/public/plots/${token}`)
      .then((response) => setView(response.data))
      .catch(async (err) => setError(await extractApiErrorMessage(err, "This link could not be found. It may have expired or the plot may no longer be active.")))
      .finally(() => setLoading(false));
  }, [token]);

  const mapUrl = view ? buildMapUrl(view) : null;

  return (
    <main className="estate-auth-page" style={{ minHeight: "100vh" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 60px" }}>
        <div style={{ textAlign: "center" }}>
          <Link to="/" className="estate-auth-brand" aria-label="LandCheck Estates home">
            <span className="estate-auth-brand-logo"><img src="/logo.svg" alt="LandCheck" width="520" height="140" /></span>
            <span className="estate-auth-brand-tag">Estates</span>
          </Link>
        </div>

        {loading && <p style={{ marginTop: 40, color: "var(--estate-slate)" }}>Loading your plot...</p>}

        {!loading && error && (
          <div className="estate-auth-card" style={{ marginTop: 30 }}>
            <p className="estate-kicker">Link unavailable</p>
            <h1 style={{ fontSize: "1.8rem" }}>We couldn't open this plot</h1>
            <p>{error}</p>
          </div>
        )}

        {!loading && view && (
          <div className="estate-auth-card" style={{ marginTop: 30 }}>
            <p className="estate-kicker">{view.organization_name || "LandCheck Estates"}{view.estate_name ? ` · ${view.estate_name}` : ""}</p>
            <h1 style={{ fontSize: "2.1rem" }}>Plot {view.plot_number}</h1>
            <p style={{ marginBottom: 4 }}>
              {view.customer_name ? <>Allocated to <strong style={{ color: "var(--estate-ink)" }}>{view.customer_name}</strong></> : "Your plot"}
              {view.area_sqm ? <> · {formatArea(view.area_sqm, view.unit_system === "ft" ? "ft" : "m")}</> : ""}
              {" · "}<span style={{ textTransform: "capitalize" }}>{view.status}</span>
            </p>

            {mapUrl ? (
              <img
                src={mapUrl}
                alt={`Satellite view of Plot ${view.plot_number}`}
                style={{ width: "100%", borderRadius: 4, marginTop: 18, border: "1px solid var(--estate-line)", display: "block" }}
              />
            ) : (
              <p style={{ marginTop: 18, color: "var(--estate-slate)" }}>A live satellite map isn't available right now.</p>
            )}

            <p className="estate-auth-trust" style={{ marginTop: 18 }}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.6" /></svg>
              This is a private link generated for you - it isn't linked from anywhere else on the site.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
