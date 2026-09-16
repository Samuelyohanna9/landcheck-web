import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, extractApiErrorMessage } from "../api/client";
import { MAPBOX_TOKEN, loadMapboxGl, loadMapboxGlCss } from "../utils/mapboxLoader";
import { formatArea } from "../utils/unitFormat";
import "../styles/estate-public.css";

type PublicPlot = {
  id: number;
  plot_number: string;
  block: string | null;
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
  description: string | null;
  location: string | null;
  contact_phone: string | null;
  show_prices: boolean;
  boundary: any | null;
  plots: PublicPlot[];
  counts: Record<string, number>;
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
  available: "#1a8f5a",
  reserved: "#d69100",
  allocated: "#2a78d6",
  on_hold: "#667085",
  under_survey: "#d9622a",
  under_staking: "#6046a8",
  developed: "#0f8b8d",
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
      properties: { status: plot.status, plot_number: plot.plot_number },
      geometry: plot.geometry,
    })),
  };
}

function PublicEstateMap({ estate, selectedPlotId, onSelect }: { estate: PublicEstate; selectedPlotId: number | null; onSelect: (plotId: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return undefined;
    let disposed = false;
    void Promise.all([loadMapboxGl(), loadMapboxGlCss()]).then(([mapboxgl]) => {
      if (disposed || !containerRef.current) return;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [8.5, 9],
        zoom: 5,
        attributionControl: true,
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        map.addSource("public-estate-plots", { type: "geojson", data: featureCollection(estate) });
        map.addLayer({
          id: "public-estate-plot-fill",
          type: "fill",
          source: "public-estate-plots",
          paint: {
            "fill-color": ["match", ["get", "status"], "available", "#1a8f5a", "reserved", "#d69100", "allocated", "#2a78d6", "on_hold", "#667085", "under_survey", "#d9622a", "under_staking", "#6046a8", "developed", "#0f8b8d", "#667085"],
            "fill-opacity": 0.66,
          },
        });
        map.addLayer({
          id: "public-estate-plot-line",
          type: "line",
          source: "public-estate-plots",
          paint: { "line-color": "#ffffff", "line-width": 1.5, "line-opacity": 0.9 },
        });
        map.addLayer({
          id: "public-estate-plot-label",
          type: "symbol",
          source: "public-estate-plots",
          layout: { "text-field": ["get", "plot_number"], "text-size": 12, "text-allow-overlap": false },
          paint: { "text-color": "#ffffff", "text-halo-color": "#102033", "text-halo-width": 1.2 },
        });
        map.addLayer({
          id: "public-estate-plot-selected",
          type: "line",
          source: "public-estate-plots",
          paint: { "line-color": "#ffffff", "line-width": 4, "line-opacity": 1 },
          filter: ["==", ["id"], -1],
        });
        map.on("click", "public-estate-plot-fill", (event: any) => {
          const id = Number(event.features?.[0]?.id);
          if (Number.isFinite(id)) onSelectRef.current(id);
        });
        map.on("mouseenter", "public-estate-plot-fill", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "public-estate-plot-fill", () => { map.getCanvas().style.cursor = ""; });

        const points = [...coordinatesOf(estate.boundary?.coordinates), ...estate.plots.flatMap((plot) => coordinatesOf(plot.geometry?.coordinates))];
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
    if (mapRef.current?.getLayer("public-estate-plot-selected")) {
      mapRef.current.setFilter("public-estate-plot-selected", ["==", ["id"], selectedPlotId ?? -1]);
    }
  }, [estate, selectedPlotId]);

  if (!MAPBOX_TOKEN) {
    return <div className="estate-public-map-fallback">Add a Mapbox token to show the live estate map. The plot register remains available below.</div>;
  }
  return <div ref={containerRef} className="estate-public-map" aria-label={`Satellite map of ${estate.name}`} />;
}

export default function PublicEstatePage() {
  const { slug } = useParams();
  const [estate, setEstate] = useState<PublicEstate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPlotId, setSelectedPlotId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [receivedPlotIds, setReceivedPlotIds] = useState<number[]>([]);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", message: "" });

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api.get(`/estates/public/${slug}`)
      .then((response) => {
        const value = response.data as PublicEstate;
        setEstate(value);
        setSelectedPlotId(value.plots[0]?.id ?? null);
      })
      .catch(async (err) => setError(await extractApiErrorMessage(err, "This Estate page is not available.")))
      .finally(() => setLoading(false));
  }, [slug]);

  const filteredPlots = useMemo(() => {
    if (!estate) return [];
    const query = search.trim().toLowerCase();
    return estate.plots.filter((plot) => (!query || `${plot.plot_number} ${plot.block || ""}`.toLowerCase().includes(query)) && (statusFilter === "all" || plot.status === statusFilter));
  }, [estate, search, statusFilter]);
  const selectedPlot = estate?.plots.find((plot) => plot.id === selectedPlotId) || null;

  const updateForm = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const submitReservation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!estate || !selectedPlot) return;
    setFormBusy(true); setFormError("");
    try {
      await api.post(`/estates/public/${estate.slug}/plots/${selectedPlot.id}/reservation`, { ...form, email: form.email || null, message: form.message || null });
      setReceivedPlotIds((current) => [...current, selectedPlot.id]);
      setFormOpen(false);
      setForm({ full_name: "", phone: "", email: "", message: "" });
    } catch (err) {
      setFormError(await extractApiErrorMessage(err, "We could not send your request. Please try again."));
    } finally {
      setFormBusy(false);
    }
  };

  if (loading) return <main className="estate-public-app"><div className="estate-public-loading">Loading Estate page...</div></main>;
  if (error || !estate) return <main className="estate-public-app"><div className="estate-public-message"><Link to="/estates" className="estate-public-brand"><img src="/logo.svg" alt="LandCheck" /><span>Estates</span></Link><h1>Estate page unavailable</h1><p>{error || "This page is not available."}</p><Link to="/" className="estate-public-text-link">Return to LandCheck</Link></div></main>;

  return (
    <div className="estate-public-app">
      <header className="estate-public-header">
        <Link to="/" className="estate-public-brand" aria-label="LandCheck home"><img src="/logo.svg" alt="LandCheck" /><span>Estates</span></Link>
        <div className="estate-public-header-meta"><span>Published by {estate.organization_name || "the estate company"}</span><Link to="/estates/login">Company sign in</Link></div>
      </header>

      <main>
        <section className="estate-public-intro">
          <p className="estate-public-kicker">LandCheck Estates</p>
          <h1>{estate.name}</h1>
          {estate.location && <p className="estate-public-location">{estate.location}</p>}
          {estate.description && <p className="estate-public-description">{estate.description}</p>}
        </section>

        <section className="estate-public-metrics" aria-label="Estate availability summary">
          <div><strong>{estate.plots.length}</strong><span>Total plots</span></div>
          <div><strong>{estate.counts.available || 0}</strong><span>Available</span></div>
          <div><strong>{estate.counts.reserved || 0}</strong><span>Reserved</span></div>
          <div><strong>{estate.counts.allocated || 0}</strong><span>Allocated</span></div>
        </section>

        <section className="estate-public-workspace">
          <div className="estate-public-map-column">
            <div className="estate-public-section-head"><div><p className="estate-public-kicker">Explore the layout</p><h2>Choose a plot on the map.</h2></div><span className="estate-public-map-note">Satellite view</span></div>
            <PublicEstateMap estate={estate} selectedPlotId={selectedPlotId} onSelect={setSelectedPlotId} />
            <div className="estate-public-legend">{["available", "reserved", "allocated", "on_hold"].map((status) => <span key={status}><i style={{ background: statusColors[status] }} />{labelForStatus(status)}</span>)}</div>
          </div>

          <aside className="estate-public-inventory" aria-label="Plot register">
            <div className="estate-public-section-head"><div><p className="estate-public-kicker">Plot register</p><h2>Find your plot.</h2></div><strong>{filteredPlots.length}</strong></div>
            <div className="estate-public-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search plot or block" aria-label="Search plot or block" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter plots by status"><option value="all">All plots</option><option value="available">Available</option><option value="reserved">Reserved</option><option value="allocated">Allocated</option></select></div>
            <div className="estate-public-plot-list">
              {filteredPlots.length ? filteredPlots.map((plot) => <button key={plot.id} type="button" className={`estate-public-plot-row${plot.id === selectedPlotId ? " is-selected" : ""}`} onClick={() => setSelectedPlotId(plot.id)}><span><strong>Plot {plot.plot_number}</strong><small>{plot.block ? `Block ${plot.block} · ` : ""}{plot.area_sqm ? formatArea(plot.area_sqm) : "Area on request"}</small></span><span className="estate-public-status" style={{ color: statusColors[plot.status] || statusColors.on_hold }}>{labelForStatus(plot.status)}</span></button>) : <p className="estate-public-empty">No plots match your search.</p>}
            </div>

            {selectedPlot && <div className="estate-public-plot-detail"><div className="estate-public-detail-top"><div><p className="estate-public-kicker">Selected plot</p><h3>Plot {selectedPlot.plot_number}</h3></div><span className="estate-public-status-pill" style={{ background: `${statusColors[selectedPlot.status] || statusColors.on_hold}18`, color: statusColors[selectedPlot.status] || statusColors.on_hold }}>{labelForStatus(selectedPlot.status)}</span></div><dl><div><dt>Block</dt><dd>{selectedPlot.block || "-"}</dd></div><div><dt>Area</dt><dd>{selectedPlot.area_sqm ? formatArea(selectedPlot.area_sqm) : "-"}</dd></div>{estate.show_prices && <div><dt>Price</dt><dd>{money(selectedPlot.price)}</dd></div>}</dl>{selectedPlot.status === "available" ? receivedPlotIds.includes(selectedPlot.id) ? <p className="estate-public-success">Your reservation request has been sent. The estate team will contact you.</p> : <button type="button" className="estate-public-primary" onClick={() => { setFormError(""); setFormOpen(true); }}>Request this plot</button> : <p className="estate-public-unavailable">This plot is not currently available for reservation.</p>}</div>}
          </aside>
        </section>

        {formOpen && selectedPlot && <div className="estate-public-form-wrap"><div className="estate-public-form-head"><div><p className="estate-public-kicker">Plot {selectedPlot.plot_number}</p><h2>Request a reservation</h2><p>Leave your details and the estate team will contact you.</p></div><button type="button" className="estate-public-close" onClick={() => setFormOpen(false)} aria-label="Close reservation form">×</button></div><form className="estate-public-form" onSubmit={submitReservation}>{formError && <p className="estate-public-form-error">{formError}</p>}<label>Full name<input required minLength={2} value={form.full_name} onChange={(event) => updateForm("full_name", event.target.value)} autoComplete="name" /></label><label>Phone number<input required minLength={5} value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} autoComplete="tel" /></label><label>Email <span>optional</span><input type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} autoComplete="email" /></label><label>Message <span>optional</span><textarea rows={3} value={form.message} onChange={(event) => updateForm("message", event.target.value)} placeholder="Tell the team anything they should know" /></label><button type="submit" className="estate-public-primary" disabled={formBusy}>{formBusy ? "Sending..." : "Send reservation request"}</button><p className="estate-public-form-note">Your information is sent directly to the estate company for follow-up. No payment is taken on this page.</p></form></div>}
      </main>

      <footer className="estate-public-footer"><Link to="/" className="estate-public-brand"><img src="/logo.svg" alt="LandCheck" /><span>Estates</span></Link><span>Secure plot information, published by {estate.organization_name || "the estate company"}.</span></footer>
    </div>
  );
}
