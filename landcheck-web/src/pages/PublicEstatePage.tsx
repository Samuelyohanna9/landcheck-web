import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { API_URL, api, extractApiErrorMessage } from "../api/client";
import { MAPBOX_TOKEN, loadMapboxGl, loadMapboxGlCss } from "../utils/mapboxLoader";
import { formatArea } from "../utils/unitFormat";
import "../styles/estate-public.css";

type PublicPlot = {
  id: number;
  plot_number: string;
  block: string | null;
  address: string | null;
  area_sqm: number | null;
  status: string;
  price: string | null;
  geometry: any;
};

type PublicEstate = {
  id: number;
  name: string;
  slug: string;
  organization_name: string | null;
  organization_email: string | null;
  logo_url: string | null;
  tagline: string | null;
  description: string | null;
  location: string | null;
  contact_phone: string | null;
  show_prices: boolean;
  payment_plan?: Array<{ label: string; percentage: string | number }>;
  boundary: any | null;
  plots: PublicPlot[];
  counts: Record<string, number>;
  development_forecast?: any | null;
};

const statusLabels: Record<string, string> = {
  available: "Available",
  reserved: "Reserved",
  allocated: "Allocated",
  on_hold: "On hold",
  under_survey: "Under survey",
  under_staking: "Under staking",
  developed: "Developed",
};

const statusColors: Record<string, string> = {
  available: "#16865b",
  reserved: "#c58900",
  allocated: "#2c73c9",
  on_hold: "#687383",
  under_survey: "#d05d2b",
  under_staking: "#6144a3",
  developed: "#0f8580",
};

function money(value: string | null) {
  if (!value) return "Price on request";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Price on request";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);
}

function labelForStatus(status: string) {
  return statusLabels[status] || status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function assetUrl(path: string | null) {
  return path ? `${API_URL}${path}` : "";
}

function paymentPlanItems(estate: PublicEstate) {
  return estate.payment_plan || [];
}

function coordinatesOf(value: any, output: number[][] = []) {
  if (Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number") {
    output.push([value[0], value[1]]);
  } else if (Array.isArray(value)) {
    value.forEach((item) => coordinatesOf(item, output));
  }
  return output;
}

function featureCollection(estate: PublicEstate) {
  return {
    type: "FeatureCollection",
    features: estate.plots.map((plot) => ({
      type: "Feature",
      id: plot.id,
      properties: {
        status: plot.status,
        plot_number: plot.plot_number,
        plot_label: [
          plot.plot_number,
          plot.area_sqm ? formatArea(plot.area_sqm) : null,
          estate.show_prices && plot.price ? money(plot.price) : null,
        ].filter(Boolean).join("\n"),
      },
      geometry: plot.geometry,
    })),
  };
}

function developmentForecastFeatures(estate: PublicEstate) {
  const forecast = estate.development_forecast;
  if (!forecast) return { type: "FeatureCollection", features: [] };
  const footprints = (forecast.built_up_footprints || []).map((item: any) => ({
    type: "Feature",
    properties: { kind: "footprint", year: item.year },
    geometry: item.geometry,
  }));
  const direction = forecast.direction_line ? [{ ...forecast.direction_line, properties: { ...(forecast.direction_line.properties || {}), kind: "direction" } }] : [];
  return { type: "FeatureCollection", features: [...footprints, ...direction] };
}

function PublicEstateMap({ estate, selectedPlotId, onSelect, onReserve }: { estate: PublicEstate; selectedPlotId: number | null; onSelect: (plotId: number | null) => void; onReserve: (plotId: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedPlot = estate.plots.find((plot) => plot.id === selectedPlotId) || null;

  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return undefined;
    let disposed = false;
    void Promise.all([loadMapboxGl(), loadMapboxGlCss()]).then(([mapboxgl]) => {
      if (disposed || !containerRef.current) return;
      const map = new mapboxgl.Map({ container: containerRef.current, style: "mapbox://styles/mapbox/satellite-streets-v12", center: [8.5, 9], zoom: 5, attributionControl: true });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        map.addSource("public-estate-plots", { type: "geojson", data: featureCollection(estate) });
        map.addLayer({ id: "public-estate-plot-fill", type: "fill", source: "public-estate-plots", paint: { "fill-color": ["match", ["get", "status"], "available", statusColors.available, "reserved", statusColors.reserved, "allocated", statusColors.allocated, "on_hold", statusColors.on_hold, "under_survey", statusColors.under_survey, "under_staking", statusColors.under_staking, "developed", statusColors.developed, statusColors.on_hold], "fill-opacity": 0.66 } });
        map.addLayer({ id: "public-estate-plot-line", type: "line", source: "public-estate-plots", paint: { "line-color": "#ffffff", "line-width": 1.5, "line-opacity": 0.9 } });
        map.addLayer({ id: "public-estate-plot-label", type: "symbol", source: "public-estate-plots", layout: { "text-field": ["get", "plot_label"], "text-size": 10, "text-line-height": 1.1, "text-max-width": 9, "text-allow-overlap": false }, paint: { "text-color": "#ffffff", "text-halo-color": "#102033", "text-halo-width": 1.2 } });
        map.addLayer({ id: "public-estate-plot-selected", type: "line", source: "public-estate-plots", paint: { "line-color": "#ffffff", "line-width": 4, "line-opacity": 1 }, filter: ["==", ["id"], -1] });
        const forecastFeatures = developmentForecastFeatures(estate);
        if (forecastFeatures.features.length) {
          map.addSource("public-development-forecast", { type: "geojson", data: forecastFeatures as any });
          map.addLayer({ id: "public-development-footprint", type: "fill", source: "public-development-forecast", filter: ["==", ["get", "kind"], "footprint"], paint: { "fill-color": "#f2c14e", "fill-opacity": 0.18 } });
          map.addLayer({ id: "public-development-footprint-line", type: "line", source: "public-development-forecast", filter: ["==", ["get", "kind"], "footprint"], paint: { "line-color": "#f2c14e", "line-width": 1.2, "line-opacity": 0.7 } });
          map.addLayer({ id: "public-development-direction", type: "line", source: "public-development-forecast", filter: ["==", ["get", "kind"], "direction"], paint: { "line-color": "#7de0a6", "line-width": 4, "line-dasharray": [1.4, 1.2], "line-opacity": 0.95 } });
        }
        map.on("click", "public-estate-plot-fill", (event: any) => {
          const id = Number(event.features?.[0]?.id);
          if (Number.isFinite(id)) onSelectRef.current(id);
        });
        map.on("click", (event: any) => {
          const features = map.queryRenderedFeatures(event.point, { layers: ["public-estate-plot-fill"] });
          if (!features.length) onSelectRef.current(null);
        });
        map.on("mouseenter", "public-estate-plot-fill", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "public-estate-plot-fill", () => { map.getCanvas().style.cursor = ""; });
        const points = [...coordinatesOf(estate.boundary?.coordinates), ...estate.plots.flatMap((plot) => coordinatesOf(plot.geometry?.coordinates)), ...coordinatesOf(estate.development_forecast?.direction_line?.geometry?.coordinates)];
        if (points.length) {
          const bounds = points.reduce((current, point) => current.extend(point), new mapboxgl.LngLatBounds(points[0], points[0]));
          map.fitBounds(bounds, { padding: 50, maxZoom: 17, duration: 0 });
        }
      });
    }).catch(() => undefined);
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [estate]);

  useEffect(() => {
    const source = mapRef.current?.getSource("public-estate-plots");
    if (source) source.setData(featureCollection(estate));
    const forecastSource = mapRef.current?.getSource("public-development-forecast");
    if (forecastSource) forecastSource.setData(developmentForecastFeatures(estate) as any);
    if (mapRef.current?.getLayer("public-estate-plot-selected")) mapRef.current.setFilter("public-estate-plot-selected", ["==", ["id"], selectedPlotId ?? -1]);
  }, [estate, selectedPlotId]);

  if (!MAPBOX_TOKEN) return <div className="estate-public-map-fallback">The live layout map is not available right now. Browse the plot register below to see the available land.</div>;
  return <div className="estate-public-map-shell"><div ref={containerRef} className="estate-public-map" aria-label={`Satellite map of ${estate.name}`} />{selectedPlot && <div className="estate-public-map-selection"><div><strong>Plot {selectedPlot.plot_number}</strong><span>{selectedPlot.address || (selectedPlot.area_sqm ? formatArea(selectedPlot.area_sqm) : "Area on request")}</span></div>{selectedPlot.status === "available" ? <button type="button" onClick={() => onReserve(selectedPlot.id)}>Reserve plot</button> : <span className="estate-public-selection-status" style={{ color: statusColors[selectedPlot.status] || statusColors.on_hold }}>{labelForStatus(selectedPlot.status)}</span>}</div>}</div>;
}

function DevelopmentForecastPanel({ forecast }: { forecast: any }) {
  if (!forecast?.data_available) return null;
  const growth = forecast.growth || {};
  const confidence = forecast.confidence?.level || "low";
  const bearing = Number(growth.direction_bearing_deg ?? 90);
  const projections = forecast.projections || [];
  return <section id="outlook" className="estate-public-forecast" aria-labelledby="estate-public-forecast-title">
    <div className="estate-public-forecast-heading"><div><p className="estate-public-kicker">LandCheck outlook</p><h2 id="estate-public-forecast-title">How the area may grow</h2><p>{forecast.reach_estimate?.headline || "The available evidence shows a possible direction of nearby development, but not a guaranteed outcome."}</p></div><span className="estate-public-forecast-badge">{confidence} confidence</span></div>
    <div className="estate-public-forecast-grid">
      <div className="estate-public-forecast-map"><div className="estate-public-forecast-compass"><span className="estate-public-forecast-arrow" style={{ transform: `rotate(${bearing}deg)` }} /><span className="estate-public-forecast-estate-dot" /><span className="estate-public-forecast-label estate-public-forecast-label--estate">Estate</span><span className="estate-public-forecast-label estate-public-forecast-label--growth">{growth.direction || "Growth direction"}</span></div><small>Directional view of the observed built-up change. Open the satellite map below to see the historical footprint overlays.</small></div>
      <div className="estate-public-forecast-facts"><div><strong>{growth.annual_area_rate_ha ?? 0} ha</strong><span>Average built-up change per year</span></div><div><strong>{growth.frontier_distance_m == null ? "Not available" : `${Math.round(growth.frontier_distance_m)} m`}</strong><span>Nearest observed built-up frontier</span></div><div><strong>{growth.annual_percent_rate == null ? "Not available" : `${growth.annual_percent_rate}%`}</strong><span>Annual area growth rate</span></div><div><strong>{forecast.analysis?.historical_start_year}–{forecast.analysis?.historical_end_year}</strong><span>Historical land-cover record</span></div></div>
    </div>
    <div className="estate-public-forecast-projections"><h3>Possible growth around the Estate</h3><div>{projections.map((row: any) => <div className="estate-public-forecast-projection" key={row.horizon_years}><strong>{row.horizon_years} years</strong><span>{row.conservative_area_ha}–{row.accelerated_area_ha} ha</span><small>observed trend: {row.observed_trend_area_ha} ha</small></div>)}</div></div>
    <div className="estate-public-forecast-support"><h3>What supports the outlook</h3><ul>{(forecast.factors?.supporting || []).map((item: string) => <li key={item}>{item}</li>)}</ul></div>
    <p className="estate-public-forecast-disclaimer">{forecast.public_disclaimer}</p><p className="estate-public-forecast-method">Method: {forecast.analysis?.method || "Historical built-up land-cover change around the Estate."} Source: annual Esri 10 m land-cover classification, combined with LandCheck flood and erosion screening.</p>
  </section>;
}

export default function PublicEstatePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const source = searchParams.get("source") || "";
  const [estate, setEstate] = useState<PublicEstate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPlotId, setSelectedPlotId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api.get(`/estates/public/${slug}`, { params: source ? { source } : undefined }).then((response) => {
      const value = response.data as PublicEstate;
      setEstate(value);
      setSelectedPlotId(null);
    }).catch(async (err) => setError(await extractApiErrorMessage(err, "This Estate page is not available."))).finally(() => setLoading(false));
  }, [slug, source]);

  const filteredPlots = useMemo(() => {
    if (!estate) return [];
    const query = search.trim().toLowerCase();
    return estate.plots.filter((plot) => {
      const searchable = `${plot.plot_number} ${plot.block || ""} ${plot.address || ""}`.toLowerCase();
      return (!query || searchable.includes(query)) && (statusFilter === "all" || plot.status === statusFilter);
    });
  }, [estate, search, statusFilter]);
  const selectedPlot = estate?.plots.find((plot) => plot.id === selectedPlotId) || null;
  const companyName = estate?.organization_name || "Estate company";
  const reservePlot = (plotId: number) => { if (estate) navigate(`/estates/public/${estate.slug}/reserve/${plotId}${source ? `?source=${encodeURIComponent(source)}` : ""}`); };

  if (loading) return <main className="estate-public-app"><div className="estate-public-loading">Loading estate page...</div></main>;
  if (error || !estate) return <main className="estate-public-app"><div className="estate-public-message"><h1>Estate page unavailable</h1><p>{error || "This page is not available."}</p></div></main>;

  return <div className="estate-public-app">
    <header className="estate-public-header"><a className="estate-public-company" href="#overview" aria-label={`${companyName} home`}>{estate.logo_url ? <img src={assetUrl(estate.logo_url)} alt={`${companyName} logo`} /> : <strong>{companyName}</strong>}</a><button type="button" className="estate-public-menu-button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="estate-public-navigation" onClick={() => setMenuOpen((open) => !open)}><span /><span /><span /></button><nav id="estate-public-navigation" className={`estate-public-navigation${menuOpen ? " is-open" : ""}`}><a href="#layout" onClick={() => setMenuOpen(false)}>Plots</a>{estate.development_forecast && <a href="#outlook" onClick={() => setMenuOpen(false)}>Outlook</a>}<a href="#about" onClick={() => setMenuOpen(false)}>About</a><a href="#contact" onClick={() => setMenuOpen(false)}>Contact</a>{(estate.contact_phone || estate.organization_email) && <div className="estate-public-menu-contact">{estate.contact_phone && <a href={`tel:${estate.contact_phone}`}>{estate.contact_phone}</a>}{estate.organization_email && <a href={`mailto:${estate.organization_email}`}>{estate.organization_email}</a>}</div>}</nav></header>
    <main>
      <section id="overview" className="estate-public-intro"><p className="estate-public-kicker">{companyName}</p><h1>{estate.name}</h1>{estate.tagline && <p className="estate-public-tagline">{estate.tagline}</p>}{estate.location && <p className="estate-public-location">{estate.location}</p>}{estate.description && <p className="estate-public-description">{estate.description}</p>}{paymentPlanItems(estate).length > 0 && <p className="estate-public-payment-plan-summary">Payment options: {paymentPlanItems(estate).map((item) => item.label + " " + item.percentage + "%").join(" / ")}</p>}<a className="estate-public-text-link estate-public-intro-link" href="#layout">Explore available plots</a></section>
      <section className="estate-public-metrics" aria-label="Estate availability summary"><div><strong>{estate.plots.length}</strong><span>Total plots</span></div><div><strong>{estate.counts.available || 0}</strong><span>Available</span></div><div><strong>{estate.counts.reserved || 0}</strong><span>Reserved</span></div><div><strong>{estate.counts.allocated || 0}</strong><span>Allocated</span></div></section>
      <DevelopmentForecastPanel forecast={estate.development_forecast} />
      <section id="layout" className="estate-public-workspace"><div className="estate-public-map-column"><div className="estate-public-section-head"><div><p className="estate-public-kicker">Estate layout</p><h2>Choose a plot on the map.</h2></div><span className="estate-public-map-note">Satellite view</span></div><PublicEstateMap estate={estate} selectedPlotId={selectedPlotId} onSelect={setSelectedPlotId} onReserve={reservePlot} /><div className="estate-public-legend">{["available", "reserved", "allocated", "on_hold"].map((status) => <span key={status}><i style={{ background: statusColors[status] }} />{labelForStatus(status)}</span>)}</div></div>
        <aside className="estate-public-inventory" aria-label="Plot register"><div className="estate-public-section-head"><div><p className="estate-public-kicker">Plot register</p><h2>Find your plot.</h2></div><strong>{filteredPlots.length}</strong></div><div className="estate-public-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search plot, block or address" aria-label="Search plot, block or address" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter plots by status"><option value="all">All plots</option><option value="available">Available</option><option value="reserved">Reserved</option><option value="allocated">Allocated</option></select></div><div className="estate-public-plot-list">{filteredPlots.length ? filteredPlots.map((plot) => <button key={plot.id} type="button" className={`estate-public-plot-row${plot.id === selectedPlotId ? " is-selected" : ""}`} onClick={() => setSelectedPlotId(plot.id)}><span><strong>Plot {plot.plot_number}</strong><small>{plot.address || `${plot.block ? `Block ${plot.block} | ` : ""}${plot.area_sqm ? formatArea(plot.area_sqm) : "Area on request"}`}</small>{estate.show_prices && <small className="estate-public-plot-price">{money(plot.price)}</small>}</span><span className="estate-public-status" style={{ color: statusColors[plot.status] || statusColors.on_hold }}>{labelForStatus(plot.status)}</span></button>) : <p className="estate-public-empty">No plots match your search.</p>}</div>{selectedPlot && <div className="estate-public-plot-detail"><div className="estate-public-detail-top"><div><p className="estate-public-kicker">Selected plot</p><h3>Plot {selectedPlot.plot_number}</h3></div><span className="estate-public-status-pill" style={{ background: `${statusColors[selectedPlot.status] || statusColors.on_hold}18`, color: statusColors[selectedPlot.status] || statusColors.on_hold }}>{labelForStatus(selectedPlot.status)}</span></div><dl><div><dt>Address</dt><dd>{selectedPlot.address || "Address on request"}</dd></div><div><dt>Area</dt><dd>{selectedPlot.area_sqm ? formatArea(selectedPlot.area_sqm) : "On request"}</dd></div>{estate.show_prices && <div><dt>Price</dt><dd>{money(selectedPlot.price)}</dd></div>}</dl>{selectedPlot.status === "available" ? <button type="button" className="estate-public-primary" onClick={() => reservePlot(selectedPlot.id)}>Reserve this plot</button> : <p className="estate-public-unavailable">This plot is not currently available for reservation.</p>}</div>}</aside>
      </section>
      <section id="about" className="estate-public-information"><div><p className="estate-public-kicker">About the Estate</p><h2>Land presented by {companyName}.</h2></div><div><p>{estate.description || "Explore the published Estate layout and choose a plot that suits your plans."}</p>{estate.location && <p className="estate-public-information-line"><strong>Location</strong>{estate.location}</p>}</div></section>
      <section id="contact" className="estate-public-contact"><div><p className="estate-public-kicker">Enquiries</p><h2>Speak with the Estate team.</h2></div><div className="estate-public-contact-details">{estate.contact_phone && <a href={`tel:${estate.contact_phone}`}>{estate.contact_phone}</a>}{estate.organization_email && <a href={`mailto:${estate.organization_email}`}>{estate.organization_email}</a>}<p>Ask about availability, documentation and the reservation process.</p></div></section>
    </main>
    <footer className="estate-public-footer"><strong>{companyName}</strong><span>{estate.contact_phone ? `Enquiries: ${estate.contact_phone}` : "Private Estate sales and enquiries"}</span></footer>
  </div>;
}
