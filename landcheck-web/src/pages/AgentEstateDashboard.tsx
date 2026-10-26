import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../api/client";
import { clearEstateAuthSession, getEstateAuthSession } from "../auth/estateAuth";
import EstateIcon from "../components/estates/EstateIcon";
import MapView from "../components/MapView";
import "../styles/estate-portal.css";
import "../styles/estate-agent-workspace.css";

type Property = {
  id: number;
  name: string;
  status: string;
  location?: string | null;
  public_enabled?: boolean;
  public_slug?: string | null;
};

type PropertyDetail = Property & {
  description?: string | null;
  plots?: Array<{ id: number; plot_number: string; area_sqm?: number; price?: string | null; status?: string }>;
};

type PropertyForm = {
  name: string;
  location: string;
  size: string;
  price: string;
  phone: string;
  whatsapp: string;
  tagline: string;
  description: string;
};

type Point = { station: string; lng: string; lat: string };

type Insight = {
  new_reservations?: number;
  upcoming_inspections?: number;
  delivery_timestamps?: string[];
};

type Enquiry = {
  id: number;
  full_name?: string;
  phone?: string;
  email?: string | null;
  status?: string;
  plot_number?: string | null;
  created_at?: string;
};

const emptyForm: PropertyForm = {
  name: "",
  location: "",
  size: "",
  price: "",
  phone: "",
  whatsapp: "",
  tagline: "Verified property. Clear next steps.",
  description: "",
};

const defaultPoints: Point[] = [
  { station: "A", lng: "7.3776", lat: "9.0765" },
  { station: "B", lng: "7.3800", lat: "9.0765" },
  { station: "C", lng: "7.3800", lat: "9.0785" },
  { station: "D", lng: "7.3776", lat: "9.0785" },
];

const money = (value: string | number | null | undefined) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount)
    : "Price on request";
};

const formatDate = (value?: string) => value ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(value)) : "Recently";

const closedCoordinates = (points: Point[]) => {
  const parsed = points
    .map((point) => [Number(point.lng), Number(point.lat)])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (parsed.length < 3) return null;
  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? parsed : [...parsed, first];
};

async function downloadAsset(path: string, filename: string) {
  const response = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function PropertyFormPanel({
  form,
  setForm,
  points,
  setPoints,
  onFile,
  photos,
  onSave,
  onCancel,
  busy,
}: {
  form: PropertyForm;
  setForm: Dispatch<SetStateAction<PropertyForm>>;
  points: Point[];
  setPoints: Dispatch<SetStateAction<Point[]>>;
  onFile: (files: File[]) => void;
  photos: File[];
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [resetKey, setResetKey] = useState(0);
  const onPolygonCreated = useCallback((coordinates: number[][] | null) => {
    if (!coordinates || coordinates.length < 3) return;
    setPoints(coordinates.map((coordinate, index) => ({
      station: String.fromCharCode(65 + index),
      lng: String(coordinate[0]),
      lat: String(coordinate[1]),
    })));
  }, [setPoints]);

  const updatePoint = (index: number, key: "lng" | "lat", value: string) => {
    setPoints((current) => current.map((point, pointIndex) => pointIndex === index ? { ...point, [key]: value } : point));
  };

  const updateForm = (key: keyof PropertyForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <section id="add-property" className="agent-workspace-card agent-property-builder">
      <div className="agent-card-heading">
        <div>
          <span className="edash-section-kicker">Add your property</span>
          <h2>Put the property on the map.</h2>
          <p>Upload the essentials, draw the boundary or enter each coordinate, then publish a buyer-ready page.</p>
        </div>
        <button type="button" className="agent-icon-button" onClick={onCancel} aria-label="Close property form"><EstateIcon name="close" /></button>
      </div>

      <div className="agent-builder-grid">
        <div className="agent-builder-form">
          <div className="agent-form-grid">
            <label className="agent-field agent-field-wide"><span>Property name</span><input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="e.g. Wuse II corner plot" maxLength={255} /></label>
            <label className="agent-field agent-field-wide"><span>Location</span><input value={form.location} onChange={(event) => updateForm("location", event.target.value)} placeholder="Area, city and state" maxLength={255} /></label>
            <label className="agent-field"><span>Size (m2)</span><input type="number" min="1" value={form.size} onChange={(event) => updateForm("size", event.target.value)} placeholder="500" /></label>
            <label className="agent-field"><span>Asking price (NGN)</span><input type="number" min="1" value={form.price} onChange={(event) => updateForm("price", event.target.value)} placeholder="25000000" /></label>
            <label className="agent-field"><span>Phone for enquiries</span><input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="080..." autoComplete="tel" /></label>
            <label className="agent-field"><span>WhatsApp number</span><input value={form.whatsapp} onChange={(event) => updateForm("whatsapp", event.target.value)} placeholder="234..." inputMode="tel" /></label>
            <label className="agent-field agent-field-wide"><span>Short trust line</span><input value={form.tagline} onChange={(event) => updateForm("tagline", event.target.value)} maxLength={255} /></label>
            <label className="agent-field agent-field-wide"><span>Property description</span><textarea rows={4} value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="What should a buyer know before they book an inspection?" maxLength={4000} /></label>
            <label className="agent-field agent-field-wide"><span>Property photos</span><input type="file" accept="image/png,image/jpeg" multiple onChange={(event) => onFile(event.target.files ? Array.from(event.target.files) : [])} /><small>{photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"} selected. The first becomes the hero image.` : "Add a hero image and optional site photos."}</small></label>
          </div>
        </div>

        <div className="agent-map-builder">
          <div className="agent-map-builder-head"><div><strong>Draw the plot boundary</strong><span>Use the polygon tool, or edit the coordinates below.</span></div><button type="button" className="agent-text-button" onClick={() => { setPoints(defaultPoints); setResetKey((key) => key + 1); }}>Use example</button></div>
          <div className="agent-map-canvas"><MapView onPolygonCreated={onPolygonCreated} resetKey={resetKey} /></div>
          <div className="agent-coordinates">
            <div className="agent-coordinates-head"><span>Individual coordinates</span><button type="button" className="agent-text-button" onClick={() => setPoints((current) => [...current, { station: String.fromCharCode(65 + current.length), lng: "", lat: "" }])}>+ Add point</button></div>
            {points.map((point, index) => <div className="agent-coordinate-row" key={`${point.station}-${index}`}><b>{point.station}</b><input aria-label={`${point.station} longitude`} value={point.lng} onChange={(event) => updatePoint(index, "lng", event.target.value)} placeholder="Longitude" inputMode="decimal" /><input aria-label={`${point.station} latitude`} value={point.lat} onChange={(event) => updatePoint(index, "lat", event.target.value)} placeholder="Latitude" inputMode="decimal" /><button type="button" className="agent-remove-point" aria-label={`Remove point ${point.station}`} onClick={() => setPoints((current) => current.filter((_, pointIndex) => pointIndex !== index))}><EstateIcon name="trash" /></button></div>)}
            <small>Coordinates are saved as WGS84 longitude / latitude. At least three valid points are required.</small>
          </div>
        </div>
      </div>

      <div className="agent-builder-actions"><button type="button" className="edash-btn-outline" onClick={onCancel} disabled={busy}>Cancel</button><button type="button" className="edash-btn-primary" onClick={onSave} disabled={busy}>{busy ? "Publishing property..." : "Save and publish property"}</button></div>
    </section>
  );
}

export default function AgentEstateDashboard() {
  const session = getEstateAuthSession();
  const navigate = useNavigate();
  const organizationId = session?.user.organization_id;
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PropertyDetail | null>(null);
  const [insight, setInsight] = useState<Insight>({});
  const [attention, setAttention] = useState<Record<string, Insight>>({});
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [form, setForm] = useState<PropertyForm>(emptyForm);
  const [points, setPoints] = useState<Point[]>(defaultPoints);
  const [photos, setPhotos] = useState<File[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [section, setSection] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = properties.find((property) => property.id === selectedId) || properties[0] || null;
  const publicUrl = selected?.public_slug ? `${window.location.origin}/estates/public/${selected.public_slug}` : "";

  const loadProperties = useCallback(async () => {
    setLoading(true);
    try {
      const [propertyResponse, attentionResponse] = await Promise.all([api.get<Property[]>("/estates"), api.get<{ estates: Record<string, Insight> }>("/estates/attention")]);
      const rows = propertyResponse.data || [];
      setProperties(rows);
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id || null);
      const nextAttention = attentionResponse.data?.estates || {};
      setAttention(nextAttention);
      const firstInsight = rows[0] ? nextAttention[String(rows[0].id)] : undefined;
      setInsight(firstInsight || {});
      setError("");
    } catch (requestError) {
      setError(await extractApiErrorMessage(requestError, "Your agent workspace could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSelected = useCallback(async (estateId: number, signal?: AbortSignal) => {
    const responses = await Promise.allSettled([
      api.get<PropertyDetail>(`/estates/${estateId}`, { signal }),
      api.get(`/estates/${estateId}/reservation-requests?page=1&page_size=25`, { signal }),
    ]);
    const [detailResponse, enquiriesResponse] = responses;
    if (detailResponse.status === "fulfilled") setDetail(detailResponse.value.data);
    if (enquiriesResponse.status === "fulfilled") setEnquiries(enquiriesResponse.value.data?.items || enquiriesResponse.value.data || []);
  }, []);

  useEffect(() => { void loadProperties(); }, [loadProperties]);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void loadSelected(selectedId, controller.signal);
    return () => controller.abort();
  }, [loadSelected, selectedId]);
  useEffect(() => { setInsight(selectedId ? attention[String(selectedId)] || {} : {}); }, [attention, selectedId]);

  const navigateSection = (nextSection: string) => {
    setSection(nextSection);
    setMenuOpen(false);
    document.getElementById(`agent-${nextSection}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const signOut = () => {
    clearEstateAuthSession();
    navigate("/agents/login", { replace: true });
  };

  const saveProperty = async () => {
    if (!organizationId) return;
    const geometry = closedCoordinates(points);
    const size = Number(form.size);
    const price = Number(form.price);
    if (!form.name.trim() || !form.location.trim() || !Number.isFinite(size) || size <= 0 || !Number.isFinite(price) || price <= 0) {
      toast.error("Add a name, location, valid size and asking price.");
      return;
    }
    if (!geometry) {
      toast.error("Draw the property boundary or enter at least three valid coordinates.");
      return;
    }
    setBusy(true);
    try {
      const estateResponse = await api.post(`/estates/organizations/${organizationId}`, {
        name: form.name.trim(),
        location_text: form.location.trim(),
        description: form.description.trim() || null,
        approximate_area_sqm: size,
        crs: "EPSG:4326",
        boundary: null,
      });
      const estateId = Number(estateResponse.data.id);
      await api.post(`/estates/${estateId}/plots`, {
        plot_number: "PROPERTY",
        geometry: { type: "Polygon", coordinates: [geometry] },
        geometry_status: "approved",
        public_address: form.location.trim(),
        asking_price: price,
      });
      await api.post(`/estates/${estateId}/approve-map`);
      await api.patch(`/estates/${estateId}/public-settings`, {
        public_enabled: true,
        public_description: form.description.trim() || null,
        public_tagline: form.tagline.trim() || null,
        public_contact_phone: form.phone.trim() || null,
        public_whatsapp_number: form.whatsapp.trim() || form.phone.trim() || null,
        public_show_prices: true,
        payment_plan: null,
        public_meeting_point: null,
      });
      if (photos[0]) {
        const formData = new FormData();
        formData.append("file", photos[0]);
        await api.post(`/estates/${estateId}/public-cover`, formData);
      }
      if (photos.length > 1) {
        await Promise.all(photos.slice(1).map((image, index) => {
          const formData = new FormData();
          formData.append("title", `${form.name.trim()} photo ${index + 2}`);
          formData.append("kind", "photo");
          formData.append("is_published", "true");
          formData.append("file", image);
          return api.post(`/estates/${estateId}/marketing/progress`, formData);
        }));
      }
      setForm(emptyForm);
      setPoints(defaultPoints);
      setPhotos([]);
      setShowBuilder(false);
      setSelectedId(estateId);
      await loadProperties();
      toast.success("Property published. Your buyer page is ready to share.");
      setSection("properties");
    } catch (requestError) {
      toast.error(await extractApiErrorMessage(requestError, "The property could not be published."));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string, message = "Copied to clipboard.") => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); toast.success(message); } catch { toast.error("Copy was not available on this device."); }
  };

  const share = async (channel: "whatsapp" | "facebook" | "instagram" | "native") => {
    if (!publicUrl) return;
    const text = `${selected?.name || "Property"} - ${selected?.location || "View the property"}\n${publicUrl}`;
    if (channel === "native" && navigator.share) {
      await navigator.share({ title: selected?.name || "Property", text, url: publicUrl });
      return;
    }
    if (channel === "instagram") {
      await copy(`${text}\n\n#property #landforsale #LandCheck`, "Instagram caption copied.");
      window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
      return;
    }
    const url = channel === "whatsapp"
      ? `https://wa.me/?text=${encodeURIComponent(text)}`
      : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const onPhotos = (files: File[]) => setPhotos(files);

  if (loading && !properties.length) return <main className="estate-agent-loading"><div className="estate-agent-loading-card"><span className="edash-section-kicker">LandCheck Agents</span><h1>Preparing your sales workspace.</h1><p>Loading your properties and buyer activity.</p></div></main>;
  if (error && !properties.length) return <main className="estate-agent-loading"><div className="estate-agent-loading-card"><span className="edash-section-kicker">Workspace unavailable</span><h1>We could not load your properties.</h1><p>{error}</p><button type="button" className="edash-btn-primary" onClick={() => void loadProperties()}>Try again</button></div></main>;

  const navItems = [
    ["overview", "Overview", "grid"],
    ["properties", "My properties", "house"],
    ["marketing", "Marketing kit", "megaphone"],
    ["buyers", "Buyer enquiries", "customers"],
    ["inspections", "Inspections", "video"],
  ] as const;

  return (
    <main className="estate-agent-workspace">
      <div className={`estate-agent-backdrop${menuOpen ? " is-open" : ""}`} onClick={() => setMenuOpen(false)} aria-hidden="true" />
      <aside className={`estate-agent-sidebar${menuOpen ? " is-open" : ""}`}>
        <Link to="/agents" className="estate-agent-brand" aria-label="LandCheck Agents home"><span className="estate-agent-brand-mark"><img src="/logo-icon-192.png" alt="" /></span><span><strong>LandCheck</strong><small>AGENTS</small></span></Link>
        <div className="estate-agent-account"><span className="estate-agent-avatar">{session?.user.full_name?.slice(0, 1).toUpperCase() || "A"}</span><div><strong>{session?.user.full_name || "Property agent"}</strong><small>{session?.user.organization_name || "Independent workspace"}</small></div></div>
        <nav className="estate-agent-nav" aria-label="Agent workspace">
          {navItems.map(([key, label, icon]) => <button type="button" className={section === key ? "is-active" : ""} key={key} onClick={() => navigateSection(key)}><EstateIcon name={icon} />{label}{key === "buyers" && insight.new_reservations ? <b>{insight.new_reservations}</b> : null}</button>)}
        </nav>
        <div className="estate-agent-sidebar-bottom"><Link to="/estates/workspace"><EstateIcon name="globe" />Open Estates</Link><button type="button" onClick={signOut}><EstateIcon name="close" />Sign out</button></div>
      </aside>

      <section className="estate-agent-main">
        <header className="estate-agent-topbar"><button type="button" className="estate-agent-menu" onClick={() => setMenuOpen((open) => !open)} aria-label="Open agent menu" aria-expanded={menuOpen}><EstateIcon name="menu" /></button><div><span className="edash-section-kicker">{session?.user.organization_name || "Independent property workspace"}</span><h1>Agent workspace</h1></div><div className="estate-agent-top-actions"><button type="button" className="agent-refresh" onClick={() => void loadProperties()}><EstateIcon name="refresh" /> Refresh</button><button type="button" className="edash-btn-primary agent-add-button" onClick={() => { setShowBuilder(true); setSection("properties"); }}> <EstateIcon name="plus" /> Add property</button></div></header>

        <div className="estate-agent-content">
          <section id="agent-overview" className="estate-agent-welcome"><div><span className="edash-section-kicker">Sell with proof</span><h2>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {session?.user.full_name?.split(" ")[0] || "agent"}.</h2><p>Publish a clean property page, share it anywhere, and keep every buyer conversation moving.</p></div><div className="estate-agent-welcome-note"><EstateIcon name="shield" /><span>LandCheck public pages show the map, location and reservation path clearly.</span></div></section>

          <section className="estate-agent-metrics"><article><span className="estate-agent-metric-icon tone-info"><EstateIcon name="house" /></span><small>Published properties</small><strong>{properties.filter((property) => property.public_enabled).length}</strong><span>{properties.length} total in workspace</span></article><article><span className="estate-agent-metric-icon tone-good"><EstateIcon name="customers" /></span><small>New enquiries</small><strong>{insight.new_reservations || 0}</strong><span>Buyer reservations to follow up</span></article><article><span className="estate-agent-metric-icon tone-warn"><EstateIcon name="calendar" /></span><small>Upcoming inspections</small><strong>{insight.upcoming_inspections || 0}</strong><span>Next 48 hours</span></article><article><span className="estate-agent-metric-icon tone-good"><EstateIcon name="share" /></span><small>Ready to share</small><strong>{properties.filter((property) => property.public_slug).length}</strong><span>Public pages with maps</span></article></section>

          <section id="agent-properties" className="agent-workspace-section"><div className="agent-section-heading"><div><span className="edash-section-kicker">Your portfolio</span><h2>Properties you are selling.</h2><p>One property or several, each with its own map, buyer page and marketing tools.</p></div><button type="button" className="edash-btn-outline" onClick={() => setShowBuilder((open) => !open)}><EstateIcon name="plus" /> {showBuilder ? "Close form" : "Add property"}</button></div>{showBuilder && <PropertyFormPanel form={form} setForm={setForm} points={points} setPoints={setPoints} onFile={onPhotos} photos={photos} onSave={() => void saveProperty()} onCancel={() => setShowBuilder(false)} busy={busy} />}
            {properties.length ? <div className="agent-property-grid">{properties.map((property) => <button type="button" className={`agent-property-card${selected?.id === property.id ? " is-selected" : ""}`} key={property.id} onClick={() => setSelectedId(property.id)}><span className="agent-property-card-icon"><EstateIcon name="house" /></span><span className="agent-property-card-copy"><strong>{property.name}</strong><small>{property.location || "Location to be added"}</small><em className={property.public_enabled ? "is-live" : "is-draft"}>{property.public_enabled ? "Published" : "Draft"}</em></span><EstateIcon name="chevron-right" /></button>)}</div> : <div className="agent-empty-state"><span className="agent-empty-icon"><EstateIcon name="map" /></span><h3>Your first property starts here.</h3><p>Add photos, price, location and a boundary. LandCheck will prepare the buyer page and share tools.</p><button type="button" className="edash-btn-primary" onClick={() => setShowBuilder(true)}>Add your property</button></div>}
          </section>

          {selected && <>
            <section className="agent-property-summary"><div><span className="edash-section-kicker">Selected property</span><h2>{selected.name}</h2><p>{selected.location || "Location not set"}</p><small>{detail?.plots?.[0]?.area_sqm ? `${detail.plots[0].area_sqm.toLocaleString()} m2` : "Mapped property"} - {money(detail?.plots?.[0]?.price)}</small></div><div className="agent-property-summary-actions">{publicUrl && <a className="edash-btn-outline" href={publicUrl} target="_blank" rel="noreferrer"><EstateIcon name="globe" /> View buyer page</a>}<Link className="edash-btn-primary" to={`/estates/${selected.id}/settings`}><EstateIcon name="edit" /> Open details</Link></div></section>

            <section id="agent-marketing" className="agent-workspace-section"><div className="agent-section-heading"><div><span className="edash-section-kicker">Generate your marketing materials</span><h2>Everything buyers need to take the next step.</h2><p>LandCheck prepares the property page, map, flyer and share-ready advert from the same verified record.</p></div></div><div className="agent-tools-grid"><button type="button" className="agent-tool-card" onClick={() => publicUrl && void copy(publicUrl, "Property page link copied.")}><EstateIcon name="link" /><strong>Property webpage</strong><span>Copy your public page</span></button><button type="button" className="agent-tool-card" onClick={() => void downloadAsset(`/estates/${selected.id}/marketing/materials/flyer.pdf`, `${selected.name}-flyer.pdf`)}><EstateIcon name="download" /><strong>Download flyer</strong><span>Print-ready property flyer</span></button><button type="button" className="agent-tool-card" onClick={() => void downloadAsset(`/estates/${selected.id}/marketing/materials/ad.png`, `${selected.name}-advert.png`)}><EstateIcon name="image" /><strong>Download advert</strong><span>Shareable social image</span></button><button type="button" className="agent-tool-card" onClick={() => void downloadAsset(`/estates/${selected.id}/marketing/materials/brochure.pdf`, `${selected.name}-brochure.pdf`)}><EstateIcon name="certificate" /><strong>Property brochure</strong><span>Detailed buyer handout</span></button></div><div className="agent-share-row"><span>Share everywhere</span><button type="button" onClick={() => void share("whatsapp")}><EstateIcon name="whatsapp" /> WhatsApp</button><button type="button" onClick={() => void share("facebook")}><EstateIcon name="share" /> Facebook</button><button type="button" onClick={() => void share("instagram")}><EstateIcon name="camera" /> Instagram</button><button type="button" onClick={() => void share("native")} disabled={!navigator.share}><EstateIcon name="send" /> More</button></div></section>

            <div className="agent-two-column"><section id="agent-buyers" className="agent-workspace-section agent-list-section"><div className="agent-section-heading"><div><span className="edash-section-kicker">Buyer enquiries</span><h2>Keep the conversation moving.</h2></div><span className="agent-count-badge">{enquiries.length}</span></div>{enquiries.length ? <div className="agent-enquiry-list">{enquiries.map((enquiry) => <article key={enquiry.id}><span className="agent-enquiry-avatar">{enquiry.full_name?.slice(0, 1).toUpperCase() || "B"}</span><div><strong>{enquiry.full_name || "Buyer"}</strong><small>{enquiry.phone}{enquiry.email ? ` - ${enquiry.email}` : ""}</small><small>{enquiry.plot_number ? `Plot ${enquiry.plot_number} - ` : "Property enquiry - "}{formatDate(enquiry.created_at)}</small></div><span className={`agent-enquiry-status is-${enquiry.status || "new"}`}>{enquiry.status || "new"}</span></article>)}</div> : <div className="agent-inline-empty">No buyer enquiries yet. Share your public property page to start the conversation.</div>}</section>
              <section id="agent-inspections" className="agent-workspace-section agent-action-section"><div className="agent-section-heading"><div><span className="edash-section-kicker">Inspection and follow-up</span><h2>Show the land, even from far away.</h2><p>Use the existing booking, SMS and live GPS video tools when a buyer is ready to visit or needs a remote walkthrough.</p></div><EstateIcon name="video" /></div><div className="agent-action-links"><Link to={`/estates/${selected.id}/inspections`}><EstateIcon name="calendar" /><span><strong>Manage site inspections</strong><small>Slots, bookings and visitor details</small></span><EstateIcon name="chevron-right" /></Link><Link to={`/estates/${selected.id}/marketing`}><EstateIcon name="video" /><span><strong>Open live inspection tools</strong><small>Remote video walkthrough and GPS checks</small></span><EstateIcon name="chevron-right" /></Link><Link to={`/estates/${selected.id}/sms`}><EstateIcon name="phone" /><span><strong>Send SMS follow-ups</strong><small>Reach buyers who asked to be contacted</small></span><EstateIcon name="chevron-right" /></Link></div></section></div>
          </>}
        </div>
      </section>
    </main>
  );
}
