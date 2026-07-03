import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import {
  fetchOrgImpact,
  fetchOrgImpactComments,
  postOrgImpactComment,
  buildOrgImpactPdfUrl,
  buildOrgImpactShareUrl,
  type DonorImpactData,
  type DonorImpactProject,
  type DonorImpactPhoto,
  type DonorImpactMapFeature,
  type DonorImpactComment,
} from "../api/donorImpact";
import { BACKEND_URL } from "../api/client";
import "../styles/green-impact.css";

const resolveAssetUrl = (url: string | null | undefined): string => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return `${BACKEND_URL}${raw}`;
  return raw;
};

const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN || "").trim();
mapboxgl.accessToken = MAPBOX_TOKEN;

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";

const TASK_ICONS: Record<string, string> = {
  watering: "💧",
  weeding: "🌿",
  protection: "🛡️",
  inspection: "🔍",
  replacement: "🔄",
  supervision: "👁️",
  field_capture: "📍",
  planting: "🌱",
  maintenance: "🔧",
  assessment: "📋",
  distribution: "📦",
  follow_up: "🔁",
};

const humanizeTask = (t: string) =>
  (TASK_ICONS[t.toLowerCase()] ? TASK_ICONS[t.toLowerCase()] + " " : "") +
  t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const formatDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
};

const formatDateShort = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
};

const animateCount = (el: HTMLElement | null, target: number, duration = 900) => {
  if (!el) return;
  const start = performance.now();
  const from = 0;
  const step = (now: number) => {
    const pct = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - pct, 3);
    el.textContent = Math.round(from + (target - from) * ease).toLocaleString();
    if (pct < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

// ── Project map component ────────────────────────────────────────────────────
function ProjectMap({
  points,
  features = [],
  mode,
}: {
  points: { lng: number; lat: number }[];
  features?: DonorImpactMapFeature[];
  mode: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const accentColor =
    mode === "agric" ? "#b45309" : mode === "relief_recovery" ? "#1d4ed8" : "#16a34a";

  const hasPolygons = features.length > 0;
  const totalLocations = hasPolygons ? features.length : points.length;

  useEffect(() => {
    const hasPoints = points.length > 0;
    const hasFeats = features.length > 0;
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN || (!hasPoints && !hasFeats)) return;

    const center: [number, number] = hasPoints
      ? [points[0].lng, points[0].lat]
      : (() => {
          const geom = features[0]?.geometry as { coordinates?: unknown } | undefined;
          const coords = geom?.coordinates;
          const flat = Array.isArray(coords) ? coords.flat(Infinity) as number[] : [];
          return flat.length >= 2 ? [flat[0], flat[1]] as [number, number] : [0, 0] as [number, number];
        })();

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center,
      zoom: 12,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    mapRef.current = map;

    map.on("load", () => {
      if (!mapRef.current) return;

      // ── Centroid cluster source (always) ──
      if (hasPoints) {
        const pointGeoJson: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: points.map((p) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
            properties: {},
          })),
        };
        map.addSource("impact-points", { type: "geojson", data: pointGeoJson, cluster: true, clusterMaxZoom: 14, clusterRadius: 40 });

        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "impact-points",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": accentColor,
            "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 50, 30],
            "circle-opacity": 0.88,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "impact-points",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 12,
          },
          paint: { "text-color": "#fff" },
        });

        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "impact-points",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": accentColor,
            "circle-radius": 6,
            "circle-opacity": 0.9,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#fff",
          },
        });
      }

      // ── Polygon layers (agric/relief plot boundaries) ──
      if (hasFeats) {
        const polyGeoJson: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: features as unknown as GeoJSON.Feature[],
        };
        map.addSource("impact-polygons", { type: "geojson", data: polyGeoJson });
        map.addLayer({
          id: "polygon-fill",
          type: "fill",
          source: "impact-polygons",
          paint: { "fill-color": accentColor, "fill-opacity": 0.25 },
        });
        map.addLayer({
          id: "polygon-outline",
          type: "line",
          source: "impact-polygons",
          paint: { "line-color": accentColor, "line-width": 2.5, "line-opacity": 0.95 },
        });

        // Always-visible text labels centred on each polygon
        map.addLayer({
          id: "polygon-labels",
          type: "symbol",
          source: "impact-polygons",
          layout: {
            "text-field": ["concat",
              ["coalesce", ["get", "custodian_name"], ""],
              "\n",
              ["coalesce", ["get", "commodity"], ""],
              ["case",
                ["!=", ["get", "area_ha"], null],
                ["concat", "  ·  ", ["to-string", ["get", "area_ha"]], " ha"],
                "",
              ],
            ],
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 11,
            "text-anchor": "center",
            "text-max-width": 12,
            "text-allow-overlap": false,
            "text-ignore-placement": false,
            "symbol-placement": "point",
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": accentColor,
            "text-halo-width": 1.8,
            "text-halo-blur": 0.4,
          },
        });

        map.on("mouseenter", "polygon-fill", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "polygon-fill", () => { map.getCanvas().style.cursor = ""; });
      }

      // ── Fit bounds ──
      if (points.length > 1) {
        const bounds = new mapboxgl.LngLatBounds();
        points.forEach((p) => bounds.extend([p.lng, p.lat]));
        map.fitBounds(bounds, { padding: 44, maxZoom: 17, duration: 800 });
      }
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (points.length === 0 && features.length === 0) return null;

  return (
    <div className="gi-map-wrap">
      <div ref={containerRef} className="gi-map-canvas" />
      <div className="gi-map-badge">
        {totalLocations.toLocaleString()} verified GPS {totalLocations === 1 ? "location" : "locations"}
        {hasPolygons ? " · click plot for details" : ""}
      </div>
    </div>
  );
}

// ── Public endorsements section ──────────────────────────────────────────────
function EndorsementSection({ orgSlug, projectName }: { orgSlug: string; projectName?: string | null }) {
  const [comments, setComments] = useState<DonorImpactComment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [form, setForm] = useState({ commenter_name: "", commenter_rank: "", commenter_org: "", project_name: projectName || "", comment_body: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchOrgImpactComments(orgSlug)
      .then(setComments)
      .catch(() => {})
      .finally(() => setCommentsLoaded(true));
  }, [orgSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!form.commenter_name.trim()) { setSubmitError("Your name is required."); return; }
    if (!form.comment_body.trim()) { setSubmitError("Message is required."); return; }
    setSubmitting(true);
    try {
      const newComment = await postOrgImpactComment(orgSlug, form);
      setComments((prev) => [newComment, ...prev]);
      setForm({ commenter_name: "", commenter_rank: "", commenter_org: "", project_name: projectName || "", comment_body: "" });
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 4000);
    } catch {
      setSubmitError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="gi-endorsements">
      <div className="gi-endorsements-inner">
        <div className="gi-section-heading" style={{ marginBottom: 20 }}>
          <div className="gi-section-heading-bar" />
          <div className="gi-section-heading-text">Endorsements & Comments</div>
        </div>
        <p className="gi-endorsements-intro">
          Reviewing this programme? Leave a professional endorsement or public comment below.
          Your name, position, and message will be visible on this page.
        </p>

        <form className="gi-endorsement-form" onSubmit={handleSubmit}>
          <div className="gi-endorsement-form-row">
            <div className="gi-form-group">
              <label className="gi-form-label">Full Name <span style={{ color: "#e53e3e" }}>*</span></label>
              <input
                className="gi-form-input"
                type="text"
                placeholder="e.g. Dr. Amina Yusuf"
                value={form.commenter_name}
                onChange={(e) => setForm((f) => ({ ...f, commenter_name: e.target.value }))}
                maxLength={120}
              />
            </div>
            <div className="gi-form-group">
              <label className="gi-form-label">Role / Position</label>
              <input
                className="gi-form-input"
                type="text"
                placeholder="e.g. Director of Programmes"
                value={form.commenter_rank}
                onChange={(e) => setForm((f) => ({ ...f, commenter_rank: e.target.value }))}
                maxLength={120}
              />
            </div>
            <div className="gi-form-group">
              <label className="gi-form-label">Organisation</label>
              <input
                className="gi-form-input"
                type="text"
                placeholder="e.g. Federal Ministry of Agriculture"
                value={form.commenter_org}
                onChange={(e) => setForm((f) => ({ ...f, commenter_org: e.target.value }))}
                maxLength={180}
              />
            </div>
          </div>
          <div className="gi-form-group" style={{ marginTop: 12 }}>
            <label className="gi-form-label">Project (optional)</label>
            <input
              className="gi-form-input"
              type="text"
              placeholder="Which project are you commenting on?"
              value={form.project_name}
              onChange={(e) => setForm((f) => ({ ...f, project_name: e.target.value }))}
              maxLength={200}
            />
          </div>
          <div className="gi-form-group" style={{ marginTop: 14 }}>
            <label className="gi-form-label">Message <span style={{ color: "#e53e3e" }}>*</span></label>
            <textarea
              className="gi-form-textarea"
              placeholder="Share your professional assessment or endorsement of this programme…"
              value={form.comment_body}
              onChange={(e) => setForm((f) => ({ ...f, comment_body: e.target.value }))}
              rows={4}
              maxLength={1200}
            />
          </div>
          {submitError && <div className="gi-form-error">{submitError}</div>}
          {submitted && <div className="gi-form-success">✓ Your endorsement has been submitted. Thank you.</div>}
          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 14,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: submitting ? "#6b9e7a" : "linear-gradient(135deg,#1a5c2a,#2aa852)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              border: "none",
              borderRadius: 10,
              padding: "10px 22px",
              cursor: submitting ? "not-allowed" : "pointer",
              transition: "background 0.18s",
            }}
          >
            {submitting ? "Submitting…" : "Submit Endorsement"}
          </button>
        </form>

        {commentsLoaded && comments.length > 0 && (
          <div className="gi-comments-list">
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--gi-text)", marginBottom: 4 }}>
              {comments.length} {comments.length === 1 ? "Endorsement" : "Endorsements"}
            </div>
            {comments.map((c) => (
              <div key={c.id} className="gi-comment-card">
                <div className="gi-comment-meta">
                  <div className="gi-comment-avatar">{c.commenter_name.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <div className="gi-comment-name">{c.commenter_name}</div>
                    {(c.commenter_rank || c.commenter_org) && (
                      <div className="gi-comment-role">
                        {[c.commenter_rank, c.commenter_org].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <div className="gi-comment-date">{formatDate(c.created_at)}</div>
                </div>
                {c.project_name && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(22,163,74,0.1)", border: "1px solid rgba(22,163,74,0.25)", borderRadius: 6, padding: "2px 10px", fontSize: 12, color: "var(--gi-accent)", fontWeight: 600, marginBottom: 8 }}>
                    📂 {c.project_name}
                  </div>
                )}
                <div className="gi-comment-body">{c.comment_body}</div>
              </div>
            ))}
          </div>
        )}

        {commentsLoaded && comments.length === 0 && (
          <div className="gi-empty-section" style={{ marginTop: 24 }}>
            No endorsements yet. Be the first to leave a comment.
          </div>
        )}
      </div>
    </section>
  );
}

// ── Animated metric value ────────────────────────────────────────────────────
function AnimatedCount({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    animateCount(ref.current, value);
  }, [value]);
  return <><span ref={ref}>0</span>{suffix}</>;
}

// ── Photo gallery ────────────────────────────────────────────────────────────
function PhotoGallery({ photos }: { photos: DonorImpactPhoto[] }) {
  const [lightbox, setLightbox] = useState<DonorImpactPhoto | null>(null);

  if (photos.length === 0) {
    return <div className="gi-empty-section">No approved evidence photos yet for this project.</div>;
  }

  return (
    <>
      <div className="gi-photos-grid">
        {photos.map((ph, i) => (
          <div key={i} className="gi-photo-item" onClick={() => setLightbox(ph)}>
            <img
              src={resolveAssetUrl(ph.url)}
              alt={ph.entity_label || "Field evidence"}
              className="gi-photo-img"
              loading="lazy"
              onLoad={(e) => (e.currentTarget as HTMLImageElement).classList.remove("loading")}
            />
            <div className="gi-photo-caption">
              <div className="gi-photo-caption-text">
                {ph.entity_label && <div>{ph.entity_label}</div>}
                {ph.created_by && <div style={{ opacity: 0.8 }}>by {ph.created_by}</div>}
                {ph.captured_at && <div style={{ opacity: 0.7 }}>{formatDateShort(ph.captured_at)}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {lightbox && (
        <div className="gi-lightbox-backdrop" onClick={() => setLightbox(null)}>
          <div className="gi-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={resolveAssetUrl(lightbox.url)} alt={lightbox.entity_label || "Evidence"} className="gi-lightbox-img" />
            <button className="gi-lightbox-close" onClick={() => setLightbox(null)}>✕</button>
            <div className="gi-lightbox-caption">
              {lightbox.entity_label && <span>{lightbox.entity_label}</span>}
              {lightbox.created_by && <span> · by {lightbox.created_by}</span>}
              {lightbox.captured_at && <span> · {formatDate(lightbox.captured_at)}</span>}
              <span> · Supervisor approved</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Project section ──────────────────────────────────────────────────────────
function ProjectSection({ project }: { project: DonorImpactProject }) {
  const { stats, labels, workflow_profile: mode } = project;
  const entityPl = labels.entity_plural;
  const ownerPl = labels.owner_plural;
  const modeLabel = labels.mode_label;

  const modeIcon = mode === "agric" ? "🌾" : mode === "relief_recovery" ? "🏠" : "🌱";
  const rateLabel = mode === "agric" ? "Activity Rate" : mode === "relief_recovery" ? "Activity Rate" : "Survival Rate";
  const rateValue = stats.survival_rate ?? 0;

  const agricConfig = project.agric_config;
  const reliefConfig = project.relief_config;

  return (
    <div className="gi-project-card">
      <div className="gi-project-header">
        <div className="gi-project-header-top">
          <div>
            <div className="gi-project-name">{project.name}</div>
            <div className="gi-project-meta">
              {project.location_text && <span>📍 {project.location_text}</span>}
            </div>
          </div>
          <div className="gi-project-mode-chip">{modeIcon} {modeLabel}</div>
        </div>
      </div>

      <div className="gi-project-body">
        {/* Programme info chips */}
        {(agricConfig?.focus_commodities || agricConfig?.program_type || reliefConfig?.intervention_focus || reliefConfig?.program_type) && (
          <div className="gi-prog-chips">
            {(agricConfig?.program_type || reliefConfig?.program_type) && (
              <span className="gi-prog-chip">
                🏷️ {(agricConfig?.program_type || reliefConfig?.program_type || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </span>
            )}
            {agricConfig?.focus_commodities && (
              <span className="gi-prog-chip">🌾 {agricConfig.focus_commodities}</span>
            )}
            {reliefConfig?.intervention_focus && (
              <span className="gi-prog-chip">🎯 {reliefConfig.intervention_focus}</span>
            )}
            {agricConfig?.season_label && (
              <span className="gi-prog-chip">📅 {agricConfig.season_label}</span>
            )}
            {reliefConfig?.target_zone && (
              <span className="gi-prog-chip">📍 {reliefConfig.target_zone}</span>
            )}
          </div>
        )}

        {/* Metric tiles */}
        <div>
          <div className="gi-section-heading">
            <div className="gi-section-heading-bar" />
            <div className="gi-section-heading-text">Key Metrics</div>
          </div>
          <div className="gi-metrics-grid">
            <div className="gi-metric-tile">
              <div className="gi-metric-icon">{mode === "agric" ? "🌾" : mode === "relief_recovery" ? "🏠" : "🌳"}</div>
              <div className="gi-metric-val"><AnimatedCount value={stats.total_records} /></div>
              <div className="gi-metric-label">Total {entityPl}</div>
            </div>
            <div className="gi-metric-tile">
              <div className="gi-metric-icon">✅</div>
              <div className="gi-metric-val"><AnimatedCount value={stats.active_records} /></div>
              <div className="gi-metric-label">Active</div>
            </div>
            <div className="gi-metric-tile">
              <div className="gi-metric-icon">{mode === "agric" ? "👨‍🌾" : mode === "relief_recovery" ? "👤" : "🤝"}</div>
              <div className="gi-metric-val"><AnimatedCount value={stats.total_custodians} /></div>
              <div className="gi-metric-label">{ownerPl}</div>
            </div>
            <div className="gi-metric-tile">
              <div className="gi-metric-icon">📋</div>
              <div className="gi-metric-val"><AnimatedCount value={stats.approved_tasks} /></div>
              <div className="gi-metric-label">Approved Activities</div>
            </div>
            <div className="gi-metric-tile">
              <div className="gi-metric-icon">👷</div>
              <div className="gi-metric-val"><AnimatedCount value={stats.total_field_officers} /></div>
              <div className="gi-metric-label">Field Officers</div>
            </div>
            {stats.last_activity_at && (
              <div className="gi-metric-tile">
                <div className="gi-metric-icon">🕐</div>
                <div className="gi-metric-val" style={{ fontSize: "15px" }}>{formatDate(stats.last_activity_at)}</div>
                <div className="gi-metric-label">Last Activity</div>
              </div>
            )}
          </div>
        </div>

        {/* Rate bar */}
        {rateValue > 0 && (
          <div className="gi-rate-bar-wrap">
            <div className="gi-rate-bar-label">
              <span>{rateLabel}</span>
              <span className="gi-rate-bar-pct">{rateValue.toFixed(1)}%</span>
            </div>
            <div className="gi-rate-bar-track">
              <div
                className="gi-rate-bar-fill"
                style={{ width: `${Math.min(rateValue, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Breakdown bars */}
        {stats.species_breakdown.length > 0 && (
          <div>
            <div className="gi-section-heading">
              <div className="gi-section-heading-bar" />
              <div className="gi-section-heading-text">
                {mode === "agric" ? "Crop / Commodity Breakdown" : mode === "relief_recovery" ? "Site Type Breakdown" : "Species Breakdown"}
              </div>
            </div>
            <div className="gi-breakdown-list">
              {stats.species_breakdown.slice(0, 8).map((row, i) => {
                const maxCount = stats.species_breakdown[0]?.count || 1;
                const pct = (row.count / maxCount) * 100;
                return (
                  <div key={i} className="gi-breakdown-row">
                    <div className="gi-breakdown-label" title={row.label}>{row.label}</div>
                    <div className="gi-breakdown-bar-track">
                      <div className="gi-breakdown-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="gi-breakdown-count">{row.count.toLocaleString()}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Map */}
        {(project.map_points.length > 0 || (project.map_features || []).length > 0) && (
          <div>
            <div className="gi-section-heading">
              <div className="gi-section-heading-bar" />
              <div className="gi-section-heading-text">Field Activity Map</div>
            </div>
            <ProjectMap points={project.map_points} features={project.map_features || []} mode={mode} />
          </div>
        )}

        {/* Photo gallery */}
        <div>
          <div className="gi-section-heading">
            <div className="gi-section-heading-bar" />
            <div className="gi-section-heading-text">Evidence Photos (Approved)</div>
          </div>
          <PhotoGallery photos={project.recent_photos} />
        </div>

        {/* Activity timeline */}
        <div>
          <div className="gi-section-heading">
            <div className="gi-section-heading-bar" />
            <div className="gi-section-heading-text">Recent Approved Activities</div>
          </div>
          {project.recent_activities.length === 0 ? (
            <div className="gi-empty-section">No approved activities recorded yet.</div>
          ) : (
            <div className="gi-timeline">
              {project.recent_activities.map((act, i) => {
                const taskLabel = humanizeTask(act.task_type);
                const who = act.custodian_name || act.assignee_name;
                return (
                  <div key={i} className="gi-timeline-item">
                    <div className="gi-timeline-dot-col">
                      <div className="gi-timeline-dot">{TASK_ICONS[act.task_type.toLowerCase()] || "📌"}</div>
                      <div className="gi-timeline-line" />
                    </div>
                    <div className="gi-timeline-content">
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <div className="gi-timeline-title">{taskLabel.replace(/^[^ ]+ /, "")}</div>
                        <div className="gi-timeline-date">{formatDateShort(act.reviewed_at)}</div>
                      </div>
                      <div className="gi-timeline-meta">
                        {act.entity_ref && <span>{act.entity_ref}</span>}
                        {who && <><div className="gi-timeline-meta-dot" /><span>by {who}</span></>}
                        {act.assignee_name && act.assignee_name !== who && (
                          <><div className="gi-timeline-meta-dot" /><span>field: {act.assignee_name}</span></>
                        )}
                      </div>
                      {act.review_notes && (
                        <div className="gi-timeline-notes">"{act.review_notes}"</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function DonorImpactPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [searchParams] = useSearchParams();
  const projectFilter = searchParams.get("project") || null;
  const [data, setData] = useState<DonorImpactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const totalRecRef = useRef<HTMLSpanElement>(null);
  const totalActRef = useRef<HTMLSpanElement>(null);
  const totalProjRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!orgSlug) return;
    setLoading(true);
    setError(null);
    fetchOrgImpact(orgSlug)
      .then((res) => {
        setData(res);
        setTimeout(() => {
          const filtered = projectFilter ? res.projects.filter((p) => String(p.id) === projectFilter) : res.projects;
          animateCount(totalRecRef.current, res.summary.total_records);
          animateCount(totalActRef.current, res.summary.total_approved_activities);
          animateCount(totalProjRef.current, filtered.length);
        }, 120);
      })
      .catch(() => setError("This impact page could not be found. The link may be incorrect or the organisation is not yet active."))
      .finally(() => setLoading(false));
  }, [orgSlug]);

  const handleCopyLink = useCallback(() => {
    const url = buildOrgImpactShareUrl(orgSlug || "");
    navigator.clipboard.writeText(url).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  }, [orgSlug]);

  const handleDownloadPdf = useCallback(() => {
    if (!orgSlug) return;
    window.open(buildOrgImpactPdfUrl(orgSlug), "_blank");
  }, [orgSlug]);

  // Determine dominant mode for page accent colour
  const dominantMode = data?.projects.find(Boolean)?.workflow_profile ?? "green";
  const modeClass = dominantMode === "agric" ? "gi-mode-agric" : dominantMode === "relief_recovery" ? "gi-mode-relief" : "";

  if (loading) {
    return (
      <div className={`gi-page ${modeClass}`}>
        <div className="gi-loading-wrap">
          <div className="gi-spinner" />
          <div className="gi-loading-text">Loading impact report…</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`gi-page ${modeClass}`}>
        <div className="gi-error-wrap">
          <div className="gi-error-icon">📊</div>
          <div className="gi-error-title">Impact page not found</div>
          <div className="gi-error-text">{error || "Something went wrong loading this impact page."}</div>
          {orgSlug && (
            <div className="gi-error-text" style={{ marginTop: 8, fontSize: "0.8em", opacity: 0.65 }}>
              Looked up: <code style={{ background: "rgba(0,0,0,0.08)", padding: "2px 6px", borderRadius: 4 }}>{orgSlug}</code>
              {" — "} Ask your LandCheck administrator to confirm the organisation has a slug set.
            </div>
          )}
        </div>
        <footer className="gi-footer">
          <div className="gi-footer-inner">
            <a href="https://landcheck.online" className="gi-footer-brand" target="_blank" rel="noopener noreferrer">
              <img src={GREEN_LOGO_SRC} alt="LandCheck" className="gi-footer-logo" />
            </a>
            <div className="gi-footer-text">Powered by LandCheck Geospatial Technologies</div>
          </div>
        </footer>
      </div>
    );
  }

  const { org, projects: allProjects, summary } = data;
  const projects = projectFilter
    ? allProjects.filter((p) => String(p.id) === projectFilter)
    : allProjects;
  const singleProjectName = projects.length === 1 && projectFilter ? projects[0]?.name : null;
  const orgLocation = [org.city, org.state_region, org.country].filter(Boolean).join(", ");
  const lastUpdated = summary.last_updated_at ? formatDate(summary.last_updated_at) : null;

  return (
    <div className={`gi-page ${modeClass}`}>
      {/* Top nav */}
      <header className="gi-topbar">
        <a href="https://landcheck.online" className="gi-topbar-brand" target="_blank" rel="noopener noreferrer">
          <img src={GREEN_LOGO_SRC} alt="LandCheck" className="gi-topbar-logo" />
          <span className="gi-topbar-name">LandCheck</span>
        </a>
        <div className="gi-topbar-actions">
          <button className="gi-btn gi-btn-ghost" onClick={handleCopyLink}>
            <span className="gi-btn-icon">🔗</span>
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button className="gi-btn gi-btn-primary" onClick={handleDownloadPdf}>
            <span className="gi-btn-icon">⬇</span>
            PDF Report
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="gi-hero">
        <div className="gi-hero-inner">
          <div className="gi-hero-top">
            <div className="gi-hero-logo-wrap">
              {org.logo_url ? (
                <img
                  src={resolveAssetUrl(org.logo_url)}
                  alt={org.name}
                  className="gi-hero-logo"
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement;
                    el.style.display = "none";
                    const placeholder = el.nextElementSibling as HTMLElement | null;
                    if (placeholder) placeholder.style.display = "flex";
                  }}
                />
              ) : null}
              <div
                className="gi-hero-logo-placeholder"
                style={{ display: org.logo_url ? "none" : "flex" }}
              >
                {org.short_name ? org.short_name.slice(0, 2).toUpperCase() : org.name.slice(0, 2).toUpperCase()}
              </div>
            </div>
            <div>
              <div className="gi-hero-org-name">{org.name}</div>
              <div className="gi-hero-org-sub">
                {orgLocation && <span>📍 {orgLocation}</span>}
                {org.website_url && (
                  <a
                    href={org.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "rgba(255,255,255,0.75)", textDecoration: "underline", textUnderlineOffset: 2 }}
                  >
                    {org.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                )}
              </div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <div className="gi-hero-verified-badge">✓ VERIFIED DATA</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="gi-hero-badge">
              <div className="gi-hero-badge-dot" />
              Programme Impact Report
            </div>
            {lastUpdated && (
              <div className="gi-hero-badge">Last updated: {lastUpdated}</div>
            )}
            {singleProjectName ? (
              <div className="gi-hero-badge">{singleProjectName}</div>
            ) : (
              <div className="gi-hero-badge">
                {projects.length} {projects.length === 1 ? "project" : "projects"}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Summary strip */}
      <div className="gi-summary-strip">
        <div className="gi-summary-grid">
          <div className="gi-summary-cell">
            <div className="gi-summary-val"><span ref={totalRecRef}>0</span></div>
            <div className="gi-summary-label">Total Records</div>
          </div>
          <div className="gi-summary-cell">
            <div className="gi-summary-val"><span ref={totalActRef}>0</span></div>
            <div className="gi-summary-label">Approved Activities</div>
          </div>
          <div className="gi-summary-cell">
            <div className="gi-summary-val"><span ref={totalProjRef}>0</span></div>
            <div className="gi-summary-label">{projectFilter ? "Showing Project" : "Projects"}</div>
          </div>
          <div className="gi-summary-cell">
            <div className="gi-summary-val" style={{ fontSize: "clamp(15px,2vw,20px)" }}>
              {lastUpdated || "—"}
            </div>
            <div className="gi-summary-label">Last Updated</div>
          </div>
        </div>
      </div>

      {/* Project sections */}
      <main className="gi-body">
        {projects.length === 0 ? (
          <div className="gi-empty-section" style={{ padding: "48px 24px" }}>
            No projects with approved records are available for this organisation yet.
          </div>
        ) : (
          projects.map((proj) => <ProjectSection key={proj.id} project={proj} />)
        )}
      </main>

      {/* Endorsements */}
      {orgSlug && <EndorsementSection orgSlug={orgSlug} projectName={singleProjectName} />}

      {/* Footer */}
      <footer className="gi-footer">
        <div className="gi-footer-inner">
          <a href="https://landcheck.online" className="gi-footer-brand" target="_blank" rel="noopener noreferrer">
            <img src={GREEN_LOGO_SRC} alt="LandCheck" className="gi-footer-logo" />
          </a>
          <div className="gi-footer-divider" />
          <div className="gi-footer-text">Powered by LandCheck Geospatial Technologies</div>
          <div className="gi-footer-divider" />
          <div className="gi-footer-verified">✓ SUPERVISOR-VERIFIED DATA ONLY</div>
          <div className="gi-footer-divider" />
          <a
            href="https://landcheck.online/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, textDecoration: "none" }}
          >
            Privacy Policy
          </a>
        </div>
      </footer>

      {/* Copied toast */}
      {copied && <div className="gi-copied-toast">🔗 Impact link copied to clipboard</div>}
    </div>
  );
}
