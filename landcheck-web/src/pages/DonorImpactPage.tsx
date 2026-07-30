import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  buildOrgImpactPdfUrl,
  buildOrgImpactShareUrl,
  fetchOrgImpact,
  fetchOrgImpactComments,
  postOrgImpactComment,
  type DonorImpactActivity,
  type DonorImpactAgricSummary,
  type DonorImpactComment,
  type DonorImpactData,
  type DonorImpactFarmerEntry,
  type DonorImpactPhoto,
  type DonorImpactProject,
} from "../api/donorImpact";
import { BACKEND_URL } from "../api/client";
import { useInViewport } from "../hooks/useInViewport";
import "../styles/green-impact.css";

const ProjectMap = lazy(() =>
  import("../components/ProjectMap").then((module) => ({ default: module.ProjectMap }))
);

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";

const resolveAssetUrl = (url: string | null | undefined): string => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return `${BACKEND_URL}${raw}`;
  return raw;
};

const titleCase = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const TASK_LABELS: Record<string, string> = {
  watering: "Watering",
  weeding: "Weeding",
  protection: "Protection",
  inspection: "Inspection",
  replacement: "Replacement",
  supervision: "Supervision",
  field_capture: "Field Capture",
  planting: "Planting",
  maintenance: "Maintenance",
  assessment: "Assessment",
  distribution: "Distribution",
  follow_up: "Follow Up",
};

const humanizeTask = (taskType: string) => TASK_LABELS[taskType.toLowerCase()] ?? titleCase(taskType);

const taskShortCode = (taskType: string) =>
  humanizeTask(taskType)
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();

const formatWebsiteUrl = (url?: string | null) =>
  String(url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

const formatDate = (iso?: string | null) => {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
};

const formatDateShort = (iso?: string | null) => {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
};

const animateCount = (element: HTMLElement | null, target: number, duration = 900) => {
  if (!element) return;
  const startedAt = performance.now();
  const step = (now: number) => {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(target * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

function AnimatedCount({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    animateCount(ref.current, value);
  }, [value]);

  return (
    <>
      <span ref={ref}>0</span>
      {suffix}
    </>
  );
}

const clampPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

type ActivityCadenceBucket = {
  key: string;
  label: string;
  count: number;
  timestamp: number;
};

const buildActivityCadence = (activities: DonorImpactActivity[]): ActivityCadenceBucket[] => {
  const grouped = new Map<string, ActivityCadenceBucket>();
  activities.forEach((activity) => {
    const date = new Date(activity.reviewed_at);
    if (Number.isNaN(date.getTime())) return;
    const key = date.toISOString().slice(0, 10);
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    grouped.set(key, {
      key,
      label: date.toLocaleDateString("en-NG", { day: "numeric", month: "short" }),
      count: 1,
      timestamp: date.getTime(),
    });
  });
  return Array.from(grouped.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-6);
};

function CircularMeter({
  value,
  overline,
  label,
  note,
  toneClass = "",
}: {
  value: number;
  overline: string;
  label: string;
  note?: string;
  toneClass?: string;
}) {
  const safeValue = clampPercent(value);
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (safeValue / 100) * circumference;

  return (
    <div className={`gi-meter-card-shell ${toneClass}`.trim()}>
      <div className="gi-meter-overline">{overline}</div>
      <div className="gi-meter-visual">
        <svg className="gi-meter-svg" viewBox="0 0 140 140" aria-hidden="true">
          <circle className="gi-meter-track" cx="70" cy="70" r={radius} />
          <circle
            className="gi-meter-progress"
            cx="70"
            cy="70"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="gi-meter-center">
          <div className="gi-meter-value">{safeValue.toFixed(0)}%</div>
          <div className="gi-meter-value-label">{label}</div>
        </div>
      </div>
      {note ? <div className="gi-meter-note">{note}</div> : null}
    </div>
  );
}

function ActivityCadenceCard({
  activities,
  title = "Activity cadence",
  subtitle = "Approved review cadence from the latest verified field events.",
}: {
  activities: DonorImpactActivity[];
  title?: string;
  subtitle?: string;
}) {
  const cadence = buildActivityCadence(activities);
  const maxCount = cadence.reduce((max, item) => Math.max(max, item.count), 0) || 1;

  return (
    <section className="gi-board-card gi-board-card-analytics">
      <div className="gi-board-card-header">
        <div>
          <div className="gi-board-card-title">{title}</div>
          <div className="gi-board-card-subtitle">{subtitle}</div>
        </div>
      </div>
      {cadence.length === 0 ? (
        <div className="gi-empty-section gi-empty-section-compact">No approved activity trend is visible yet.</div>
      ) : (
        <div className="gi-cadence-chart">
          {cadence.map((bucket) => (
            <div key={bucket.key} className="gi-cadence-bar-col">
              <div className="gi-cadence-bar-count">{bucket.count}</div>
              <div className="gi-cadence-bar-track">
                <div
                  className="gi-cadence-bar-fill"
                  style={{ height: `${Math.max((bucket.count / maxCount) * 100, 12)}%` }}
                />
              </div>
              <div className="gi-cadence-bar-label">{bucket.label}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PortfolioMixCard({ projects }: { projects: DonorImpactProject[] }) {
  const mix = [
    {
      key: "green",
      label: "Green delivery",
      helper: "Trees, maintenance, survival",
      count: projects.filter((project) => project.workflow_profile === "green").length,
    },
    {
      key: "agric",
      label: "Agric programme",
      helper: "Farmers, plots, support",
      count: projects.filter((project) => project.workflow_profile === "agric").length,
    },
    {
      key: "relief",
      label: "Relief / recovery",
      helper: "Sites, response, follow-up",
      count: projects.filter((project) => project.workflow_profile === "relief_recovery").length,
    },
  ].filter((item) => item.count > 0);

  const total = mix.reduce((sum, item) => sum + item.count, 0) || 1;

  return (
    <div className="gi-hero-mix">
      <div className="gi-hero-panel-title">Portfolio mix</div>
      <div className="gi-hero-panel-copy">Published programmes grouped by delivery model.</div>
      <div className="gi-hero-mix-list">
        {mix.map((item) => (
          <div key={item.key} className="gi-hero-mix-row">
            <div className="gi-hero-mix-copy">
              <div className="gi-hero-mix-label">{item.label}</div>
              <div className="gi-hero-mix-helper">{item.helper}</div>
            </div>
            <div className="gi-hero-mix-meter">
              <div className="gi-hero-mix-fill" style={{ width: `${(item.count / total) * 100}%` }} />
            </div>
            <div className="gi-hero-mix-count">{item.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EndorsementSection({
  orgSlug,
  projectName,
}: {
  orgSlug: string;
  projectName?: string | null;
}) {
  const [comments, setComments] = useState<DonorImpactComment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [form, setForm] = useState({
    commenter_name: "",
    commenter_rank: "",
    commenter_org: "",
    project_name: projectName || "",
    comment_body: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchOrgImpactComments(orgSlug)
      .then(setComments)
      .catch(() => {})
      .finally(() => setCommentsLoaded(true));
  }, [orgSlug]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    if (!form.commenter_name.trim()) {
      setSubmitError("Your name is required.");
      return;
    }
    if (!form.comment_body.trim()) {
      setSubmitError("Message is required.");
      return;
    }

    setSubmitting(true);
    try {
      const comment = await postOrgImpactComment(orgSlug, form);
      setComments((current) => [comment, ...current]);
      setForm({
        commenter_name: "",
        commenter_rank: "",
        commenter_org: "",
        project_name: projectName || "",
        comment_body: "",
      });
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
        <div className="gi-section-heading">
          <div className="gi-section-heading-bar" />
          <div className="gi-section-heading-text">Programme Endorsements</div>
        </div>
        <p className="gi-endorsements-intro">
          Reviewing this programme? Leave a professional comment or endorsement.
          Published notes remain visible on this public report.
        </p>

        <form className="gi-endorsement-form" onSubmit={handleSubmit}>
          <div className="gi-endorsement-form-row">
            <div className="gi-form-group">
              <label className="gi-form-label">
                Full Name <span className="gi-text-danger">*</span>
              </label>
              <input
                className="gi-form-input"
                type="text"
                placeholder="e.g. Dr. Amina Yusuf"
                value={form.commenter_name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, commenter_name: event.target.value }))
                }
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
                onChange={(event) =>
                  setForm((current) => ({ ...current, commenter_rank: event.target.value }))
                }
                maxLength={120}
              />
            </div>
            <div className="gi-form-group">
              <label className="gi-form-label">Organisation</label>
              <input
                className="gi-form-input"
                type="text"
                placeholder="e.g. Environmental Care Foundation"
                value={form.commenter_org}
                onChange={(event) =>
                  setForm((current) => ({ ...current, commenter_org: event.target.value }))
                }
                maxLength={180}
              />
            </div>
          </div>

          <div className="gi-form-group gi-form-group-spaced">
            <label className="gi-form-label">Project (optional)</label>
            <input
              className="gi-form-input"
              type="text"
              placeholder="Which project are you commenting on?"
              value={form.project_name}
              onChange={(event) =>
                setForm((current) => ({ ...current, project_name: event.target.value }))
              }
              maxLength={200}
            />
          </div>

          <div className="gi-form-group gi-form-group-spaced">
            <label className="gi-form-label">
              Message <span className="gi-text-danger">*</span>
            </label>
            <textarea
              className="gi-form-textarea"
              placeholder="Share your professional assessment or public endorsement of this programme."
              value={form.comment_body}
              onChange={(event) =>
                setForm((current) => ({ ...current, comment_body: event.target.value }))
              }
              rows={4}
              maxLength={1200}
            />
          </div>

          {submitError && <div className="gi-form-error">{submitError}</div>}
          {submitted && <div className="gi-form-success">Your endorsement has been submitted.</div>}

          <button
            type="submit"
            className="gi-btn gi-btn-primary"
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Submit Endorsement"}
          </button>
        </form>

        {commentsLoaded && comments.length > 0 && (
          <div className="gi-comments-list">
            {comments.map((comment) => (
              <div key={comment.id} className="gi-comment-card">
                <div className="gi-comment-meta">
                  <div className="gi-comment-avatar">
                    {comment.commenter_name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="gi-comment-meta-copy">
                    <div className="gi-comment-name">{comment.commenter_name}</div>
                    {(comment.commenter_rank || comment.commenter_org) && (
                      <div className="gi-comment-role">
                        {[comment.commenter_rank, comment.commenter_org]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                  </div>
                  <div className="gi-comment-date">{formatDate(comment.created_at)}</div>
                </div>

                {comment.project_name && (
                  <div className="gi-comment-project-pill">{comment.project_name}</div>
                )}

                <div className="gi-comment-body">{comment.comment_body}</div>
              </div>
            ))}
          </div>
        )}

        {commentsLoaded && comments.length === 0 && (
          <div className="gi-empty-section gi-endorsements-empty">
            No endorsements yet. Be the first to leave a comment.
          </div>
        )}
      </div>
    </section>
  );
}

function PhotoGallery({ photos }: { photos: DonorImpactPhoto[] }) {
  const [lightbox, setLightbox] = useState<DonorImpactPhoto | null>(null);

  if (photos.length === 0) {
    return <div className="gi-empty-section">No approved evidence photos yet for this project.</div>;
  }

  return (
    <>
      <div className="gi-photos-grid">
        {photos.map((photo, index) => (
          <button
            key={`${photo.url}-${index}`}
            type="button"
            className="gi-photo-item"
            onClick={() => setLightbox(photo)}
          >
            <img
              src={resolveAssetUrl(photo.url)}
              alt={photo.entity_label || "Field evidence"}
              className="gi-photo-img"
              loading="lazy"
            />
            <div className="gi-photo-caption">
              <div className="gi-photo-caption-text">
                {photo.entity_label && <div>{photo.entity_label}</div>}
                {photo.created_by && <div>Recorded by {photo.created_by}</div>}
                {photo.captured_at && <div>{formatDateShort(photo.captured_at)}</div>}
              </div>
            </div>
          </button>
        ))}
      </div>

      {lightbox && (
        <div className="gi-lightbox-backdrop" onClick={() => setLightbox(null)}>
          <div className="gi-lightbox-inner" onClick={(event) => event.stopPropagation()}>
            <img
              src={resolveAssetUrl(lightbox.url)}
              alt={lightbox.entity_label || "Evidence"}
              className="gi-lightbox-img"
              loading="lazy"
              decoding="async"
            />
            <button
              type="button"
              className="gi-lightbox-close"
              onClick={() => setLightbox(null)}
            >
              ×
            </button>
            <div className="gi-lightbox-caption">
              {lightbox.entity_label && <span>{lightbox.entity_label}</span>}
              {lightbox.created_by && <span> · Recorded by {lightbox.created_by}</span>}
              {lightbox.captured_at && <span> · {formatDate(lightbox.captured_at)}</span>}
              <span> · Supervisor approved</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const TENURE_LABELS: Record<string, string> = {
  owned: "Owned",
  family_owned: "Family owned",
  leased: "Leased",
  communal: "Communal",
};

const ACCESS_LABELS: Record<string, string> = {
  yes: "Full access",
  seasonal: "Seasonal access",
  no: "No access",
};

const humanizeCategory = (value: string, dictionary: Record<string, string>) =>
  dictionary[value.toLowerCase()] ?? titleCase(value);

function AgricRegistrySnapshot({ summary }: { summary: DonorImpactAgricSummary }) {
  const verifiedRate = summary.total_farmers > 0 ? (summary.verified_farmers / summary.total_farmers) * 100 : 0;
  const groupRate = summary.total_farmers > 0 ? (summary.group_member_farmers / summary.total_farmers) * 100 : 0;
  const supportedRate = summary.total_farmers > 0 ? (summary.supported_farmers / summary.total_farmers) * 100 : 0;
  const avgHouseholdSize =
    summary.household_known_count > 0 ? summary.household_reach_total / summary.household_known_count : 0;
  const fieldCoverageRate =
    summary.field_capture_assigned > 0
      ? (summary.field_capture_done / summary.field_capture_assigned) * 100
      : summary.total_farmers > 0
        ? (summary.field_capture_done / summary.total_farmers) * 100
        : 0;

  const registryCards = [
    { kicker: "Registry", value: summary.total_farmers.toLocaleString(), label: "Farmers registered" },
    {
      kicker: "Verified",
      value: `${summary.verified_farmers.toLocaleString()} (${verifiedRate.toFixed(0)}%)`,
      label: "Field-verified farmers",
    },
    {
      kicker: "Field Capture",
      value: `${summary.field_capture_done.toLocaleString()}/${summary.field_capture_assigned.toLocaleString()}`,
      label: "Farm plots captured",
    },
    {
      kicker: "Support",
      value: summary.allocated_units.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      label: `Units allocated · ${summary.supported_farmers.toLocaleString()} farmers`,
    },
    {
      kicker: "Household Reach",
      value: summary.household_reach_total.toLocaleString(),
      label: avgHouseholdSize > 0 ? `People · avg ${avgHouseholdSize.toFixed(1)}/household` : "Estimated people reached",
    },
    {
      kicker: "Cooperative",
      value: `${summary.group_member_farmers.toLocaleString()} (${groupRate.toFixed(0)}%)`,
      label: "Farmers in a group",
    },
  ];

  const maxTenure = summary.tenure_breakdown[0]?.count || 1;
  const maxIrrigation = summary.irrigation_breakdown[0]?.count || 1;

  return (
    <section className="gi-dashboard-section">
      <div className="gi-section-heading">
        <div className="gi-section-heading-bar" />
        <div className="gi-section-heading-text">Farmer Registry Snapshot</div>
      </div>

      <div className="gi-dashboard-shell">
        <section className="gi-board-card gi-board-card-span-2">
          <div className="gi-board-card-header">
            <div>
              <div className="gi-board-card-title">Registry overview</div>
              <div className="gi-board-card-subtitle">
                Executive summary of farmer onboarding, verification, support, and mapped field evidence.
              </div>
            </div>
          </div>
          <div className="gi-metrics-grid">
            {registryCards.map((card) => (
              <div key={`${card.kicker}-${card.label}`} className="gi-metric-tile">
                <div className="gi-metric-kicker">{card.kicker}</div>
                <div className="gi-metric-val">{card.value}</div>
                <div className="gi-metric-label">{card.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="gi-board-card">
          <div className="gi-board-card-header">
            <div>
              <div className="gi-board-card-title">Implementation confidence</div>
              <div className="gi-board-card-subtitle">
                Verification, capture, and support coverage from the published registry.
              </div>
            </div>
          </div>
          <div className="gi-readiness-grid">
            <div className="gi-readiness-tile gi-chart-tone-emerald">
              <div className="gi-readiness-kicker">Verification coverage</div>
              <div className="gi-readiness-value">{verifiedRate.toFixed(0)}%</div>
              <div className="gi-readiness-note">
                {summary.verified_farmers.toLocaleString()} of {summary.total_farmers.toLocaleString()} farmer records verified
              </div>
            </div>
            <div className="gi-readiness-tile gi-chart-tone-sky">
              <div className="gi-readiness-kicker">Field data coverage</div>
              <div className="gi-readiness-value">{fieldCoverageRate.toFixed(0)}%</div>
              <div className="gi-readiness-note">
                {summary.field_capture_assigned > 0
                  ? `${summary.field_capture_done.toLocaleString()} of ${summary.field_capture_assigned.toLocaleString()} assigned captures completed`
                  : "Mapped plots are not yet visible in this public view"}
              </div>
            </div>
            <div className="gi-readiness-tile gi-chart-tone-amber">
              <div className="gi-readiness-kicker">Support reach</div>
              <div className="gi-readiness-value">{supportedRate.toFixed(0)}%</div>
              <div className="gi-readiness-note">
                {summary.supported_farmers.toLocaleString()} farmers reached with {summary.allocated_units.toLocaleString(undefined, { maximumFractionDigits: 0 })} support units
              </div>
            </div>
          </div>
          <div className="gi-readiness-progress">
            <div className="gi-readiness-progress-head">
              <span>Capture progress</span>
              <strong>{fieldCoverageRate.toFixed(0)}%</strong>
            </div>
            <div className="gi-rate-bar-track">
              <div className="gi-rate-bar-fill" style={{ width: `${clampPercent(fieldCoverageRate)}%` }} />
            </div>
          </div>
        </section>
      </div>

      <div className="gi-dashboard-shell gi-dashboard-shell-secondary">
        <section className="gi-board-card gi-board-card-analytics">
          <div className="gi-board-card-header">
            <div>
              <div className="gi-board-card-title">Farmer access indicators</div>
              <div className="gi-board-card-subtitle">
                Portfolio-level access signals that support programme planning and targeting.
              </div>
            </div>
          </div>
          <div className="gi-rate-bar-wrap gi-chart-tone-amber">
            <div className="gi-rate-bar-label">
              <span>Access to Finance</span>
              <span className="gi-rate-bar-pct">{summary.finance_access_rate.toFixed(1)}%</span>
            </div>
            <div className="gi-rate-bar-track">
              <div className="gi-rate-bar-fill" style={{ width: `${clampPercent(summary.finance_access_rate)}%` }} />
            </div>
          </div>
          <div className="gi-rate-bar-wrap gi-chart-tone-sky">
            <div className="gi-rate-bar-label">
              <span>Access to Insurance</span>
              <span className="gi-rate-bar-pct">{summary.insurance_access_rate.toFixed(1)}%</span>
            </div>
            <div className="gi-rate-bar-track">
              <div className="gi-rate-bar-fill" style={{ width: `${clampPercent(summary.insurance_access_rate)}%` }} />
            </div>
          </div>
          <div className="gi-insight-kpis">
            <div className="gi-insight-kpi">
              <span>Supported farmers</span>
              <strong>{summary.supported_farmers.toLocaleString()}</strong>
            </div>
            <div className="gi-insight-kpi">
              <span>Household reach</span>
              <strong>{summary.household_reach_total.toLocaleString()}</strong>
            </div>
          </div>
        </section>

        {summary.tenure_breakdown.length > 0 && (
          <section className="gi-board-card gi-board-card-analytics">
            <div className="gi-board-card-header">
              <div>
                <div className="gi-board-card-title">Land tenure mix</div>
                <div className="gi-board-card-subtitle">
                  Distribution of current beneficiary plots by reported tenure arrangement.
                </div>
              </div>
            </div>
            <div className="gi-breakdown-list gi-breakdown-list-spaced gi-chart-tone-plum">
              {summary.tenure_breakdown.map((row) => (
                <div key={row.label} className="gi-breakdown-row">
                  <div className="gi-breakdown-label" title={row.label}>
                    {humanizeCategory(row.label, TENURE_LABELS)}
                  </div>
                  <div className="gi-breakdown-bar-track">
                    <div className="gi-breakdown-bar-fill" style={{ width: `${(row.count / maxTenure) * 100}%` }} />
                  </div>
                  <div className="gi-breakdown-count">{row.count.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {summary.irrigation_breakdown.length > 0 && (
          <section className="gi-board-card gi-board-card-analytics">
            <div className="gi-board-card-header">
              <div>
                <div className="gi-board-card-title">Irrigation access</div>
                <div className="gi-board-card-subtitle">
                  Reported irrigation readiness across the current farmer registry.
                </div>
              </div>
            </div>
            <div className="gi-breakdown-list gi-breakdown-list-spaced gi-chart-tone-teal">
              {summary.irrigation_breakdown.map((row) => (
                <div key={row.label} className="gi-breakdown-row">
                  <div className="gi-breakdown-label" title={row.label}>
                    {humanizeCategory(row.label, ACCESS_LABELS)}
                  </div>
                  <div className="gi-breakdown-bar-track">
                    <div className="gi-breakdown-bar-fill" style={{ width: `${(row.count / maxIrrigation) * 100}%` }} />
                  </div>
                  <div className="gi-breakdown-count">{row.count.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {summary.farmer_directory.length > 0 && <FarmerDirectory farmers={summary.farmer_directory} />}
    </section>
  );
}

function FarmerDirectory({ farmers }: { farmers: DonorImpactFarmerEntry[] }) {
  const [query, setQuery] = useState("");
  const cleanQuery = query.trim().toLowerCase();
  const filtered = cleanQuery
    ? farmers.filter((farmer) => farmer.name.toLowerCase().includes(cleanQuery))
    : farmers;

  return (
    <div className="gi-farmer-directory">
      <div className="gi-farmer-directory-head">
        <div className="gi-breakdown-subheading">Registered Farmers ({farmers.length.toLocaleString()})</div>
        <input
          type="text"
          className="gi-farmer-search"
          placeholder="Search by name..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <p className="gi-farmer-directory-note">
        Names and general programme details only - contact information is kept private.
      </p>
      {filtered.length === 0 ? (
        <div className="gi-empty-section">No farmers match "{query}".</div>
      ) : (
        <div className="gi-farmer-list">
          {filtered.map((farmer, index) => (
            <div key={`${farmer.name}-${index}`} className="gi-farmer-row">
              <div className="gi-farmer-row-main">
                <span className="gi-farmer-name">{farmer.name}</span>
                {farmer.verified && <span className="gi-farmer-verified-badge">Verified</span>}
              </div>
              <div className="gi-farmer-row-meta">
                {farmer.crop && <span>{farmer.crop}</span>}
                {farmer.farmer_group && <span>{farmer.farmer_group}</span>}
                {farmer.location && <span>{farmer.location}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectSection({ project }: { project: DonorImpactProject }) {
  const { stats, labels, workflow_profile: mode } = project;
  const mapViewport = useInViewport<HTMLDivElement>({ rootMargin: "320px 0px" });
  const entityPlural = labels.entity_plural;
  const ownerPlural = labels.owner_plural;
  const modeLabel = labels.mode_label;
  // stats.survival_rate is active-records / total-records - i.e. how many registered records are
  // NOT marked dead/replaced. Calling that "Activity Rate" for agric read as directly contradicting
  // the "Approved activities" tile right above it (e.g. 100% "Activity Rate" next to 0 approved
  // activities), since it has nothing to do with task/activity completion.
  const rateLabel =
    mode === "green" ? "Survival Rate" : mode === "agric" ? "Active Plot Rate" : "Activity Rate";
  const rateValue = stats.survival_rate ?? 0;
  const isAgricSnapshot = mode === "agric" && Boolean(project.agric_summary);
  const activityCadence = buildActivityCadence(project.recent_activities);
  const rateNote =
    mode === "green"
      ? "Share of mapped records still alive or active."
      : mode === "relief_recovery"
        ? "Share of visible site records still marked active."
        : "Share of visible mapped plots still active.";

  const programmeFacts = [
    (project.agric_config?.program_type || project.relief_config?.program_type) && {
      label: "Programme",
      value: titleCase(project.agric_config?.program_type || project.relief_config?.program_type || ""),
    },
    project.agric_config?.focus_commodities && {
      label: "Focus",
      value: project.agric_config.focus_commodities,
    },
    project.relief_config?.intervention_focus && {
      label: "Focus",
      value: project.relief_config.intervention_focus,
    },
    project.agric_config?.season_label && {
      label: "Season",
      value: project.agric_config.season_label,
    },
    project.relief_config?.target_zone && {
      label: "Target Zone",
      value: project.relief_config.target_zone,
    },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  // For agric projects, the Farmer Registry Snapshot below already reports the true farmer count
  // (from the full green_custodians registry). stats.total_custodians only counts farmers who
  // already have a mapped plot, which under-counts the registry and, shown as "Owners" right above
  // a much larger "Farmers registered" figure, reads as contradictory data rather than a different
  // metric. Drop it here for agric so there's one authoritative farmer count on the page.
  const showOwnersTile = !isAgricSnapshot;

  const metricCards = [
    {
      kicker: "Records",
      value: <AnimatedCount value={stats.total_records} />,
      label: `Total ${entityPlural}`,
    },
    {
      kicker: "Status",
      value: <AnimatedCount value={stats.active_records} />,
      label: "Active records",
    },
    ...(showOwnersTile
      ? [
          {
            kicker: "Owners",
            value: <AnimatedCount value={stats.total_custodians} />,
            label: ownerPlural,
          },
        ]
      : []),
    {
      kicker: "Review",
      value: <AnimatedCount value={stats.approved_tasks} />,
      label: "Approved activities",
    },
    {
      kicker: "Team",
      value: <AnimatedCount value={stats.total_field_officers} />,
      label: "Field officers",
    },
    ...(stats.last_activity_at
      ? [
          {
            kicker: "Updated",
            value: formatDate(stats.last_activity_at),
            label: "Last recorded activity",
          },
        ]
      : []),
  ];

  return (
    <article className="gi-project-card">
      <div className="gi-project-header">
        <div className="gi-project-header-top">
          <div className="gi-project-header-copy">
            <div className="gi-project-mode-chip">{modeLabel}</div>
            <div className="gi-project-name">
              {project.name}
              {project.sponsor ? <span className="gi-project-sponsor"> / {project.sponsor}</span> : null}
            </div>
            {project.location_text && <div className="gi-project-meta">{project.location_text}</div>}
          </div>
          <div className="gi-project-lead">
            <span>Approved Workflow</span>
            <strong>
              {stats.approved_tasks.toLocaleString()} {stats.approved_tasks === 1 ? "activity" : "activities"}
            </strong>
          </div>
        </div>
      </div>

      <div className="gi-project-body">
        {programmeFacts.length > 0 && (
          <div className="gi-prog-chips">
            {programmeFacts.map((fact) => (
              <div key={`${fact.label}-${fact.value}`} className="gi-prog-chip">
                <span className="gi-prog-chip-label">{fact.label}</span>
                <span className="gi-prog-chip-value">{fact.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* For agric projects, the farmer registry (150+ people) is the headline number donors care
            about. The generic Key Metrics grid (and its plot-based rate bar) is built from the
            `trees` table, which for agric represents individual mapped plots, not farmers, and
            lags far behind registration (e.g. 5 plots mapped out of 150 registered farmers) - it
            reads as noise next to the real farmer snapshot, so it's dropped entirely for agric. */}
        {isAgricSnapshot ? (
          <AgricRegistrySnapshot summary={project.agric_summary!} />
        ) : (
          <>
            <div className="gi-dashboard-shell">
              <section className="gi-board-card gi-board-card-span-2">
                <div className="gi-board-card-header">
                  <div>
                    <div className="gi-board-card-title">Executive metrics</div>
                    <div className="gi-board-card-subtitle">
                      Board-level summary of approved records, field delivery, and verified coverage.
                    </div>
                  </div>
                </div>
                <div className="gi-metrics-grid">
                  {metricCards.map((metric) => (
                    <div key={`${metric.kicker}-${metric.label}`} className="gi-metric-tile">
                      <div className="gi-metric-kicker">{metric.kicker}</div>
                      <div className="gi-metric-val">{metric.value}</div>
                      <div className="gi-metric-label">{metric.label}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="gi-board-card">
                <div className="gi-board-card-header">
                  <div>
                    <div className="gi-board-card-title">{rateLabel}</div>
                    <div className="gi-board-card-subtitle">{rateNote}</div>
                  </div>
                </div>
                <div className="gi-meter-stack gi-meter-stack-single">
                  <CircularMeter
                    value={rateValue}
                    overline="Programme health"
                    label={`${stats.active_records.toLocaleString()} active`}
                    toneClass={mode === "relief_recovery" ? "gi-chart-tone-sky" : "gi-chart-tone-emerald"}
                    note={`${stats.dead_records.toLocaleString()} dead · ${stats.replaced_records.toLocaleString()} replaced`}
                  />
                </div>
                {rateValue > 0 && (
                  <section
                    className={`gi-rate-bar-wrap gi-rate-bar-wrap-board ${
                      mode === "relief_recovery" ? "gi-chart-tone-sky" : "gi-chart-tone-emerald"
                    }`}
                  >
                    <div className="gi-rate-bar-label">
                      <span>{rateLabel}</span>
                      <span className="gi-rate-bar-pct">{rateValue.toFixed(1)}%</span>
                    </div>
                    <div className="gi-rate-bar-track">
                      <div
                        className="gi-rate-bar-fill"
                        style={{ width: `${clampPercent(rateValue)}%` }}
                      />
                    </div>
                  </section>
                )}
              </section>

              <div className="gi-chart-tone-sky">
                <ActivityCadenceCard
                  activities={project.recent_activities}
                  title="Activity cadence"
                  subtitle={
                    activityCadence.length > 0
                      ? "Most recent supervisor-approved events grouped by review date."
                      : "No approved cadence is visible yet."
                  }
                />
              </div>
            </div>
          </>
        )}

        <div className="gi-dashboard-shell gi-dashboard-shell-secondary">
          {stats.species_breakdown.length > 0 && (
            <section className="gi-board-card gi-board-card-analytics gi-chart-tone-plum">
              <div className="gi-board-card-header">
                <div>
                  <div className="gi-board-card-title">
                    {mode === "agric"
                      ? "Crop / commodity mix"
                      : mode === "relief_recovery"
                        ? "Site type mix"
                        : "Species composition"}
                  </div>
                  <div className="gi-board-card-subtitle">
                    Distribution of the most visible verified records currently published.
                  </div>
                </div>
              </div>
              <div className="gi-breakdown-list gi-breakdown-list-contrast">
                {stats.species_breakdown.slice(0, 8).map((row) => {
                  const maxCount = stats.species_breakdown[0]?.count || 1;
                  const width = (row.count / maxCount) * 100;
                  return (
                    <div key={row.label} className="gi-breakdown-row">
                      <div className="gi-breakdown-label" title={row.label}>
                        {row.label}
                      </div>
                      <div className="gi-breakdown-bar-track">
                        <div className="gi-breakdown-bar-fill" style={{ width: `${width}%` }} />
                      </div>
                      <div className="gi-breakdown-count">{row.count.toLocaleString()}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

            <section className="gi-board-card gi-board-card-analytics gi-chart-tone-teal">
            <div className="gi-board-card-header">
              <div>
                <div className="gi-board-card-title">Programme brief</div>
                <div className="gi-board-card-subtitle">
                  Quick operational context for donor review and partner due diligence.
                </div>
              </div>
            </div>
            <div className="gi-insight-kpis gi-insight-kpis-brief">
              <div className="gi-insight-kpi">
                <span>Approved workflow</span>
                <strong>{stats.approved_tasks.toLocaleString()} activities</strong>
              </div>
              <div className="gi-insight-kpi">
                <span>Field team</span>
                <strong>{stats.total_field_officers.toLocaleString()} officers</strong>
              </div>
              {project.location_text && (
                <div className="gi-insight-kpi">
                  <span>Project area</span>
                  <strong>{project.location_text}</strong>
                </div>
              )}
              {stats.last_activity_at && (
                <div className="gi-insight-kpi">
                  <span>Latest activity</span>
                  <strong>{formatDate(stats.last_activity_at)}</strong>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="gi-proof-grid">
          {(project.map_points.length > 0 || (project.map_features || []).length > 0) && (
            <section ref={mapViewport.ref} className="gi-board-card gi-board-card-proof gi-chart-tone-sky">
              <div className="gi-board-card-header">
                <div>
                  <div className="gi-board-card-title">Field activity map</div>
                  <div className="gi-board-card-subtitle">
                    Verified public footprint of approved field evidence in this programme.
                  </div>
                </div>
              </div>
              {mapViewport.inView ? (
                <Suspense fallback={<div className="gi-empty-section">Loading field activity map...</div>}>
                  <ProjectMap
                    points={project.map_points}
                    features={project.map_features || []}
                    mode={mode}
                  />
                </Suspense>
              ) : (
                <div className="gi-empty-section">Map will load when this section enters view.</div>
              )}
            </section>
          )}

          <section className="gi-board-card gi-board-card-proof gi-chart-tone-amber">
            <div className="gi-board-card-header">
              <div>
                <div className="gi-board-card-title">Approved evidence gallery</div>
                <div className="gi-board-card-subtitle">
                  Supervisor-approved field photos linked to this public report.
                </div>
              </div>
            </div>
            <PhotoGallery photos={project.recent_photos} />
          </section>
        </div>

        <section className="gi-board-card gi-board-card-proof gi-chart-tone-emerald">
          <div className="gi-board-card-header">
            <div>
              <div className="gi-board-card-title">Recent approved activities</div>
              <div className="gi-board-card-subtitle">
                Latest supervisor-cleared actions contributing to this public impact view.
              </div>
            </div>
          </div>
          {project.recent_activities.length === 0 ? (
            <div className="gi-empty-section">No approved activities recorded yet.</div>
          ) : (
            <div className="gi-timeline">
              {project.recent_activities.map((activity, index) => {
                const who = activity.custodian_name || activity.assignee_name;
                return (
                  <div key={`${activity.task_type}-${activity.reviewed_at}-${index}`} className="gi-timeline-item">
                    <div className="gi-timeline-dot-col">
                      <div className="gi-timeline-dot">{taskShortCode(activity.task_type)}</div>
                      <div className="gi-timeline-line" />
                    </div>
                    <div className="gi-timeline-content">
                      <div className="gi-timeline-head">
                        <div className="gi-timeline-title">{humanizeTask(activity.task_type)}</div>
                        <div className="gi-timeline-date">{formatDateShort(activity.reviewed_at)}</div>
                      </div>
                      <div className="gi-timeline-meta">
                        {activity.entity_ref && <span>{activity.entity_ref}</span>}
                        {who && (
                          <>
                            <div className="gi-timeline-meta-dot" />
                            <span>{who}</span>
                          </>
                        )}
                        {activity.assignee_name && activity.assignee_name !== who && (
                          <>
                            <div className="gi-timeline-meta-dot" />
                            <span>Field officer: {activity.assignee_name}</span>
                          </>
                        )}
                      </div>
                      {activity.review_notes && (
                        <div className="gi-timeline-notes">{activity.review_notes}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

export default function DonorImpactPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [searchParams] = useSearchParams();
  const projectFilter = searchParams.get("project") || null;

  const [data, setData] = useState<DonorImpactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const totalRecordsRef = useRef<HTMLSpanElement>(null);
  const totalActivitiesRef = useRef<HTMLSpanElement>(null);
  const totalProjectsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!orgSlug) return;

    setLoading(true);
    setError(null);

    fetchOrgImpact(orgSlug)
      .then((response) => {
        setData(response);
        const filteredProjects = projectFilter
          ? response.projects.filter((project) => String(project.id) === projectFilter)
          : response.projects;

        setTimeout(() => {
          animateCount(totalRecordsRef.current, response.summary.total_records);
          animateCount(totalActivitiesRef.current, response.summary.total_approved_activities);
          animateCount(totalProjectsRef.current, filteredProjects.length);
        }, 120);
      })
      .catch(() =>
        setError(
          "This impact page could not be found. The link may be incorrect or the organisation is not yet active.",
        ),
      )
      .finally(() => setLoading(false));
  }, [orgSlug, projectFilter]);

  const handleCopyLink = useCallback(() => {
    const url = buildOrgImpactShareUrl(orgSlug || "");
    navigator.clipboard.writeText(url).catch(() => {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  }, [orgSlug]);

  const handleDownloadPdf = useCallback(() => {
    if (!orgSlug) return;
    window.open(buildOrgImpactPdfUrl(orgSlug), "_blank", "noopener,noreferrer");
  }, [orgSlug]);

  const dominantMode = data?.projects.find(Boolean)?.workflow_profile ?? "green";
  const modeClass =
    dominantMode === "agric" ? "gi-mode-agric" : dominantMode === "relief_recovery" ? "gi-mode-relief" : "";

  if (loading) {
    return (
      <div className={`gi-page ${modeClass}`}>
        <div className="gi-loading-wrap">
          <div className="gi-spinner" />
          <div className="gi-loading-text">Loading impact report...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`gi-page ${modeClass}`}>
        <div className="gi-error-wrap">
          <div className="gi-error-icon">Report unavailable</div>
          <div className="gi-error-title">Impact page not found</div>
          <div className="gi-error-text">
            {error || "Something went wrong loading this impact page."}
          </div>
          {orgSlug && (
            <div className="gi-error-text gi-error-text-soft">
              Looked up: <code>{orgSlug}</code>. Ask your LandCheck administrator to confirm the
              organisation impact slug.
            </div>
          )}
        </div>
        <footer className="gi-footer">
          <div className="gi-footer-inner">
            <a
              href="https://landcheck.online"
              className="gi-footer-brand"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src={GREEN_LOGO_SRC}
                alt="LandCheck"
                className="gi-footer-logo"
                width="80"
                height="24"
                loading="lazy"
              />
            </a>
            <div className="gi-footer-text">Powered by LandCheck Geospatial Technologies</div>
          </div>
        </footer>
      </div>
    );
  }

  const { org, projects: allProjects, summary } = data;
  const projects = projectFilter
    ? allProjects.filter((project) => String(project.id) === projectFilter)
    : allProjects;
  const singleProjectName = projectFilter && projects.length === 1 ? projects[0]?.name : null;
  const orgLocation = [org.city, org.state_region, org.country].filter(Boolean).join(", ");
  const lastUpdated = summary.last_updated_at ? formatDate(summary.last_updated_at) : null;
  const reportDescription = singleProjectName
    ? `Verified field records, mapped evidence, and approved activities for ${singleProjectName}.`
    : "Verified field records, mapped evidence, and approved activities across the published programme portfolio.";

  return (
    <div className={`gi-page ${modeClass}`}>
      <header className="gi-topbar">
        <a
          href="https://landcheck.online"
          className="gi-topbar-brand"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src={GREEN_LOGO_SRC} alt="LandCheck" className="gi-topbar-logo" width="90" height="28" />
          <span className="gi-topbar-name">LandCheck</span>
        </a>
        <div className="gi-topbar-actions">
          <button type="button" className="gi-btn gi-btn-ghost" onClick={handleCopyLink}>
            {copied ? "Copied" : "Copy report link"}
          </button>
          <button type="button" className="gi-btn gi-btn-primary" onClick={handleDownloadPdf}>
            Download PDF
          </button>
        </div>
      </header>

      <section className="gi-hero">
        <div className="gi-hero-inner">
          <div className="gi-hero-grid">
            <div className="gi-hero-copy">
              <div className="gi-hero-kicker">LandCheck public report</div>
              <div className="gi-hero-top">
                <div className="gi-hero-logo-wrap">
                  {org.logo_url ? (
                    <img
                      src={resolveAssetUrl(org.logo_url)}
                      alt={org.name}
                      className="gi-hero-logo"
                      onError={(event) => {
                        const image = event.currentTarget;
                        image.style.display = "none";
                        const placeholder = image.nextElementSibling as HTMLElement | null;
                        if (placeholder) placeholder.style.display = "flex";
                      }}
                    />
                  ) : null}
                  <div
                    className="gi-hero-logo-placeholder"
                    style={{ display: org.logo_url ? "none" : "flex" }}
                  >
                    {(org.short_name ? org.short_name.slice(0, 2) : org.name.slice(0, 2)).toUpperCase()}
                  </div>
                </div>

                <div className="gi-hero-title-block">
                  <div className="gi-hero-org-name">{org.name}</div>
                  <div className="gi-hero-org-sub">
                    {orgLocation && <span className="gi-hero-sub-item">{orgLocation}</span>}
                    {org.website_url && (
                      <a
                        href={org.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="gi-hero-sub-link"
                      >
                        {formatWebsiteUrl(org.website_url)}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <p className="gi-hero-description">{reportDescription}</p>
            </div>

            <div className="gi-hero-highlights">
              <div className="gi-hero-panel-title">
                <span className="gi-hero-verified-badge">Verified Data</span> Assurance overview
              </div>
              <div className="gi-hero-highlight-grid">
                <div className="gi-hero-highlight">
                  <span>Review basis</span>
                  <strong>Supervisor-approved records only</strong>
                </div>
                <div className="gi-hero-highlight">
                  <span>Coverage</span>
                  <strong>{projectFilter ? "Focused project view" : "Organisation-wide public view"}</strong>
                </div>
              </div>
              <PortfolioMixCard projects={projects} />
            </div>
          </div>
        </div>
      </section>

      <div className="gi-summary-strip">
        <div className="gi-summary-grid">
          <div className="gi-summary-cell">
            <div className="gi-summary-context">Registry</div>
            <div className="gi-summary-val"><span ref={totalRecordsRef}>0</span></div>
            <div className="gi-summary-label">Total records</div>
          </div>
          <div className="gi-summary-cell">
            <div className="gi-summary-context">Review</div>
            <div className="gi-summary-val"><span ref={totalActivitiesRef}>0</span></div>
            <div className="gi-summary-label">Approved activities</div>
          </div>
          <div className="gi-summary-cell">
            <div className="gi-summary-context">Scope</div>
            <div className="gi-summary-val"><span ref={totalProjectsRef}>0</span></div>
            <div className="gi-summary-label">{projectFilter ? "Showing project" : "Published projects"}</div>
          </div>
          <div className="gi-summary-cell">
            <div className="gi-summary-context">Freshness</div>
            <div className="gi-summary-val gi-summary-val-date">{lastUpdated || "-"}</div>
            <div className="gi-summary-label">Last updated</div>
          </div>
        </div>
      </div>

      <main className="gi-body">
        {projects.length === 0 ? (
          <div className="gi-empty-section gi-empty-section-large">
            No projects with approved records are available for this organisation yet.
          </div>
        ) : (
          projects.map((project) => <ProjectSection key={project.id} project={project} />)
        )}
      </main>

      <EndorsementSection orgSlug={orgSlug || ""} projectName={singleProjectName} />

      <footer className="gi-footer">
        <div className="gi-footer-inner">
          <a
            href="https://landcheck.online"
            className="gi-footer-brand"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src={GREEN_LOGO_SRC} alt="LandCheck" className="gi-footer-logo" />
          </a>
          <div className="gi-footer-divider" />
          <div className="gi-footer-text">Powered by LandCheck Geospatial Technologies</div>
          <div className="gi-footer-divider" />
          <div className="gi-footer-verified">Supervisor-verified public evidence only</div>
          <div className="gi-footer-divider" />
          <a
            href="https://landcheck.online/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="gi-footer-link"
          >
            Privacy Policy
          </a>
        </div>
      </footer>

      {copied && <div className="gi-copied-toast">Impact link copied to clipboard</div>}
    </div>
  );
}
