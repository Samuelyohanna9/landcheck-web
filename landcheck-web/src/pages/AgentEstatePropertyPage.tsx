/* eslint-disable @typescript-eslint/no-explicit-any -- Estate API response shapes are shared with the existing imperative pages. */
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../api/client";
import { clearEstateAuthSession, getEstateAuthSession } from "../auth/estateAuth";
import EstateIcon from "../components/estates/EstateIcon";
import { ProjectMap, type ProjectMapFeature } from "../components/ProjectMap";
import {
  getEstateQueryScope,
  useEstateDetailQuery,
  useEstatePlotsQuery,
  useEstateReservationRequestsQuery,
} from "../query/estateQueries";
import "../styles/estate-portal.css";
import "../styles/estate-agent-workspace.css";

type EstateSummary = {
  id: number;
  public_slug?: string | null;
};

const formatDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(value))
  : "Recently";

const money = (value: unknown) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0
    ? new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount)
    : "Price on request";
};

function featureStatus(feature: ProjectMapFeature) {
  return String(feature.properties?.commercial_status || feature.properties?.status || "").toLowerCase();
}

export default function AgentEstatePropertyPage() {
  const session = getEstateAuthSession();
  const navigate = useNavigate();
  const { estateId } = useParams();
  const scope = getEstateQueryScope(session);
  const detailQuery = useEstateDetailQuery(scope, estateId);
  const plotsQuery = useEstatePlotsQuery(scope, estateId);
  const reservationsQuery = useEstateReservationRequestsQuery(scope, estateId || "", 1, Boolean(estateId && /^\d+$/.test(estateId)));
  const [publicSlug, setPublicSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!estateId) return;
    const controller = new AbortController();
    api.get<EstateSummary[]>("/estates", { signal: controller.signal })
      .then((response) => {
        const property = (response.data || []).find((row) => row.id === Number(estateId));
        setPublicSlug(property?.public_slug || null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPublicSlug(null);
      });
    return () => controller.abort();
  }, [estateId]);

  const features = useMemo<ProjectMapFeature[]>(() => {
    const rows = Array.isArray(plotsQuery.data?.features) ? plotsQuery.data.features : [];
    return rows.filter((feature: any) => feature?.geometry).map((feature: any) => ({
      type: "Feature",
      geometry: feature.geometry,
      properties: feature.properties || {},
    }));
  }, [plotsQuery.data]);

  if (!session || session.user.workspace_type !== "agent") {
    return <Navigate to="/estates/workspace" replace />;
  }
  if (!estateId || !/^\d+$/.test(estateId)) {
    return <Navigate to="/agents" replace />;
  }

  const detail = detailQuery.data || {};
  const reservationPayload = reservationsQuery.data as any;
  const enquiries = Array.isArray(reservationPayload) ? reservationPayload : reservationPayload?.items || [];
  const newEnquiries = Number(reservationPayload?.new_count ?? enquiries.filter((row: any) => row.status === "new").length);
  const availablePlots = features.filter((feature) => ["available", "open", "for_sale"].includes(featureStatus(feature))).length;
  const reservedPlots = features.filter((feature) => featureStatus(feature) === "reserved").length;
  const askingPrice = features[0]?.properties?.asking_price;
  const publicUrl = publicSlug ? `${window.location.origin}/estates/public/${publicSlug}` : "";
  const loadError = detailQuery.isError || plotsQuery.isError || reservationsQuery.isError;

  const signOut = () => {
    clearEstateAuthSession();
    navigate("/agents/login", { replace: true });
  };

  const copyPublicUrl = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Buyer page link copied.");
    } catch {
      toast.error("Copy was not available on this device.");
    }
  };

  const retry = () => {
    void Promise.all([detailQuery.refetch(), plotsQuery.refetch(), reservationsQuery.refetch()]);
  };

  if (detailQuery.isLoading || plotsQuery.isLoading) {
    return <main className="estate-agent-loading"><div className="estate-agent-loading-card"><span className="edash-section-kicker">LandCheck Agents</span><h1>Opening your property workspace.</h1><p>Loading the property record and map.</p></div></main>;
  }

  if (loadError && !detailQuery.data) {
    return <main className="estate-agent-loading"><div className="estate-agent-loading-card"><span className="edash-section-kicker">Property unavailable</span><h1>We could not open this property.</h1><p>The property may have been removed or you may no longer have access to it.</p><button type="button" className="edash-btn-primary" onClick={retry}>Try again</button><Link className="edash-btn-outline agent-detail-back-button" to="/agents">Back to workspace</Link></div></main>;
  }

  return (
    <main className="estate-agent-workspace agent-property-page">
      <aside className="estate-agent-sidebar">
        <Link to="/agents" className="estate-agent-brand" aria-label="Back to LandCheck Agents"><span className="estate-agent-brand-mark"><img src="/logo-icon-192.png" alt="" /></span><span><strong>LandCheck</strong><small>AGENTS</small></span></Link>
        <div className="estate-agent-account"><span className="estate-agent-avatar">{session.user.full_name?.slice(0, 1).toUpperCase() || "A"}</span><div><strong>{session.user.full_name || "Property agent"}</strong><small>Independent workspace</small></div></div>
        <div className="agent-property-sidebar-context"><span className="edash-section-kicker">Current property</span><strong>{detail.name || "Property workspace"}</strong><small>{detail.location_text || detail.location || "Location not set"}</small></div>
        <nav className="estate-agent-nav" aria-label="Agent property workspace">
          <a className="is-active" href="#overview"><EstateIcon name="grid" />Overview</a>
          <a href="#map"><EstateIcon name="map" />Map and plot</a>
          <a href="#buyers"><EstateIcon name="customers" />Buyer enquiries{newEnquiries > 0 ? <b>{newEnquiries}</b> : null}</a>
          <a href="#tools"><EstateIcon name="calendar" />Sales tools</a>
        </nav>
        <div className="estate-agent-sidebar-bottom"><Link to="/agents"><EstateIcon name="chevron-left" />Back to properties</Link><button type="button" onClick={signOut}><EstateIcon name="close" />Sign out</button></div>
      </aside>

      <section className="estate-agent-main">
        <header className="estate-agent-topbar"><Link to="/agents" className="agent-detail-mobile-back" aria-label="Back to properties"><EstateIcon name="chevron-left" /></Link><div><span className="edash-section-kicker">Agent property workspace</span><h1>{detail.name || "Property details"}</h1></div><div className="estate-agent-top-actions"><Link className="agent-refresh" to="/agents"><EstateIcon name="chevron-left" /> Properties</Link>{publicUrl && <a className="edash-btn-primary" href={publicUrl} target="_blank" rel="noreferrer"><EstateIcon name="globe" /> Buyer page</a>}</div></header>

        <div className="estate-agent-content">
          <section id="overview" className="estate-agent-welcome agent-property-hero"><div><span className="edash-section-kicker">Property overview</span><h2>{detail.name || "Your property"}</h2><p>{detail.description || detail.location_text || "Keep the verified property record, buyer conversations and next steps in one focused workspace."}</p></div><div className="agent-property-hero-meta"><span className="agent-property-status"><EstateIcon name="shield" /> Agent workspace</span><small>{detail.location_text || detail.location || "Location not set"}</small></div></section>

          <section className="estate-agent-metrics agent-detail-metrics"><article><span className="estate-agent-metric-icon tone-info"><EstateIcon name="plots" /></span><small>Mapped plots</small><strong>{features.length}</strong><span>Property boundaries</span></article><article><span className="estate-agent-metric-icon tone-good"><EstateIcon name="check-circle" /></span><small>Available</small><strong>{availablePlots}</strong><span>Ready for buyer enquiries</span></article><article><span className="estate-agent-metric-icon tone-warn"><EstateIcon name="clock" /></span><small>Reserved</small><strong>{reservedPlots}</strong><span>Needs follow-up</span></article><article><span className="estate-agent-metric-icon tone-good"><EstateIcon name="customers" /></span><small>New enquiries</small><strong>{newEnquiries}</strong><span>Buyer requests to review</span></article></section>

          <section className="agent-detail-grid agent-workspace-section">
            <article id="map" className="agent-property-detail-card agent-detail-map-card"><div className="agent-section-heading"><div><span className="edash-section-kicker">Map and plot records</span><h2>Show buyers exactly what they are considering.</h2><p>Plot boundaries and availability come from your verified LandCheck record.</p></div><EstateIcon name="map" /></div>{features.length ? <ProjectMap points={[]} features={features} mode="estate" /> : <div className="agent-inline-empty">No mapped plots are available for this property yet.</div>}</article>
            <article className="agent-property-detail-card"><div className="agent-section-heading"><div><span className="edash-section-kicker">Property information</span><h2>Keep the facts clear.</h2></div><EstateIcon name="certificate" /></div><dl className="agent-property-facts"><div><dt>Location</dt><dd>{detail.location_text || detail.location || "Not set"}</dd></div><div><dt>Asking price</dt><dd>{money(askingPrice)}</dd></div><div><dt>Approximate size</dt><dd>{detail.approximate_area_sqm ? `${Number(detail.approximate_area_sqm).toLocaleString()} m2` : "Not set"}</dd></div><div><dt>Reference</dt><dd>{detail.project_reference || "LandCheck property record"}</dd></div><div><dt>Map status</dt><dd>{features.length ? "Mapped and ready to share" : "Boundary not available"}</dd></div></dl>{publicUrl ? <div className="agent-property-link-box"><small>Public buyer page</small><strong>{publicUrl}</strong><button type="button" className="agent-text-button" onClick={() => void copyPublicUrl()}><EstateIcon name="link" /> Copy link</button></div> : <div className="agent-inline-empty">Publish the property page from your agent workspace to share it with buyers.</div>}</article>
          </section>

          <section id="buyers" className="agent-property-detail-card agent-workspace-section"><div className="agent-section-heading"><div><span className="edash-section-kicker">Buyer enquiries</span><h2>Follow up with confidence.</h2><p>Requests from your public property page appear here with their contact details and selected plot.</p></div><span className="agent-count-badge">{enquiries.length}</span></div>{enquiries.length ? <div className="agent-enquiry-list">{enquiries.map((enquiry: any) => <article key={enquiry.id}><span className="agent-enquiry-avatar">{enquiry.full_name?.slice(0, 1).toUpperCase() || "B"}</span><div><strong>{enquiry.full_name || "Buyer"}</strong><small>{enquiry.phone || "Phone not provided"}{enquiry.email ? ` - ${enquiry.email}` : ""}</small><small>{enquiry.plot_number || enquiry.plot ? `Plot ${enquiry.plot_number || enquiry.plot} - ` : "Property enquiry - "}{formatDate(enquiry.created_at)}</small></div><span className={`agent-enquiry-status is-${enquiry.status || "new"}`}>{enquiry.status || "new"}</span></article>)}</div> : <div className="agent-inline-empty">No buyer enquiries yet. Share the public property page to start the conversation.</div>}</section>

          <section id="tools" className="agent-property-detail-card agent-workspace-section"><div className="agent-section-heading"><div><span className="edash-section-kicker">Selected agent tools</span><h2>Move the sale forward.</h2><p>Only the tools relevant to selling this property are shown here. Company administration stays out of the agent workspace.</p></div><EstateIcon name="megaphone" /></div><div className="agent-detail-action-grid">{publicUrl && <a href={publicUrl} target="_blank" rel="noreferrer"><EstateIcon name="globe" /><span><strong>Open buyer page</strong><small>See the public map and reservation path</small></span><EstateIcon name="chevron-right" /></a>}<Link to={`/estates/${estateId}/inspections?tab=site`}><EstateIcon name="calendar" /><span><strong>Schedule site inspection</strong><small>Manage visits and buyer bookings</small></span><EstateIcon name="chevron-right" /></Link><Link to={`/estates/${estateId}/inspections?tab=live`}><EstateIcon name="video" /><span><strong>Schedule live inspection</strong><small>Open remote walkthrough and GPS tools</small></span><EstateIcon name="chevron-right" /></Link><Link to={`/estates/${estateId}/sms`}><EstateIcon name="phone" /><span><strong>Send buyer SMS</strong><small>Follow up with interested buyers</small></span><EstateIcon name="chevron-right" /></Link></div></section>

          {loadError && <p className="agent-detail-stale-note"><EstateIcon name="alert-triangle" /> Some live details could not refresh. Showing the information that was available. <button type="button" className="agent-text-button" onClick={retry}>Retry</button></p>}
        </div>
      </section>
    </main>
  );
}
