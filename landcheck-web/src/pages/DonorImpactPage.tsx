import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import {
  fetchOrgImpact,
  buildOrgImpactPdfUrl,
  buildOrgImpactShareUrl,
  type DonorImpactData,
  type DonorImpactProject,
  type DonorImpactPhoto,
} from "../api/donorImpact";
import "../styles/green-impact.css";

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
function ProjectMap({ points, mode }: { points: { lng: number; lat: number }[]; mode: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const accentColor =
    mode === "agric" ? "#b45309" : mode === "relief_recovery" ? "#1d4ed8" : "#16a34a";

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN || points.length === 0) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [points[0].lng, points[0].lat],
      zoom: 12,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    mapRef.current = map;

    map.on("load", () => {
      if (!mapRef.current) return;
      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: points.map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          properties: {},
        })),
      };
      map.addSource("impact-points", { type: "geojson", data: geojson, cluster: true, clusterMaxZoom: 14, clusterRadius: 40 });

      // Cluster circles
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
      // Unclustered dots
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

      // Fit bounds
      if (points.length > 1) {
        const bounds = new mapboxgl.LngLatBounds();
        points.forEach((p) => bounds.extend([p.lng, p.lat]));
        map.fitBounds(bounds, { padding: 44, maxZoom: 16, duration: 800 });
      }
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [points, accentColor]);

  if (points.length === 0) return null;

  return (
    <div className="gi-map-wrap">
      <div ref={containerRef} className="gi-map-canvas" />
      <div className="gi-map-badge">
        {points.length.toLocaleString()} verified GPS {points.length === 1 ? "location" : "locations"}
      </div>
    </div>
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
              src={ph.url}
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
            <img src={lightbox.url} alt={lightbox.entity_label || "Evidence"} className="gi-lightbox-img" />
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
        {project.map_points.length > 0 && (
          <div>
            <div className="gi-section-heading">
              <div className="gi-section-heading-bar" />
              <div className="gi-section-heading-text">Field Activity Map</div>
            </div>
            <ProjectMap points={project.map_points} mode={mode} />
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
          animateCount(totalRecRef.current, res.summary.total_records);
          animateCount(totalActRef.current, res.summary.total_approved_activities);
          animateCount(totalProjRef.current, res.projects.length);
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

  const { org, projects, summary } = data;
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
                <img src={org.logo_url} alt={org.name} className="gi-hero-logo" />
              ) : (
                <div className="gi-hero-logo-placeholder">
                  {org.short_name ? org.short_name.slice(0, 2).toUpperCase() : org.name.slice(0, 2).toUpperCase()}
                </div>
              )}
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
            <div className="gi-hero-badge">
              {projects.length} {projects.length === 1 ? "project" : "projects"}
            </div>
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
            <div className="gi-summary-label">Projects</div>
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
