export type WorkspaceSkeletonVariant = "survey" | "estate" | "green" | "work" | "hazard";

type Props = {
  variant: WorkspaceSkeletonVariant;
};

const WORKSPACE_LABELS: Record<WorkspaceSkeletonVariant, string> = {
  survey: "Loading Survey Plan workspace",
  estate: "Loading Estates workspace",
  green: "Loading Green field workspace",
  work: "Loading Work workspace",
  hazard: "Loading Hazard workspace",
};

function Block({ className = "" }: { className?: string }) {
  return <span className={`workspace-skeleton-block${className ? ` ${className}` : ""}`} aria-hidden="true" />;
}

function Topbar({ variant }: Props) {
  return (
    <header className="workspace-skeleton-topbar">
      <div className="workspace-skeleton-brand">
        <Block className="workspace-skeleton-logo" />
        <div>
          <Block className="workspace-skeleton-brand-title" />
          <Block className="workspace-skeleton-brand-subtitle" />
        </div>
      </div>
      <div className="workspace-skeleton-topbar-actions">
        <Block className="workspace-skeleton-topbar-pill" />
        <Block className="workspace-skeleton-avatar" />
      </div>
      <span className="workspace-skeleton-sr-only">{WORKSPACE_LABELS[variant]}</span>
    </header>
  );
}

function Sidebar() {
  return (
    <aside className="workspace-skeleton-sidebar" aria-hidden="true">
      <Block className="workspace-skeleton-sidebar-heading" />
      {Array.from({ length: 7 }, (_, index) => (
        <Block key={index} className={`workspace-skeleton-nav-row${index === 0 ? " is-active" : ""}`} />
      ))}
      <Block className="workspace-skeleton-sidebar-footer" />
    </aside>
  );
}

function StatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="workspace-skeleton-stat-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="workspace-skeleton-stat-card" key={index}>
          <Block className="workspace-skeleton-stat-icon" />
          <div className="workspace-skeleton-stat-copy">
            <Block className="workspace-skeleton-stat-label" />
            <Block className="workspace-skeleton-stat-value" />
            <Block className="workspace-skeleton-stat-note" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ContentRows({ count = 5 }: { count?: number }) {
  return (
    <div className="workspace-skeleton-content-rows" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="workspace-skeleton-content-row" key={index}>
          <Block className="workspace-skeleton-row-dot" />
          <Block className="workspace-skeleton-row-main" />
          <Block className="workspace-skeleton-row-meta" />
        </div>
      ))}
    </div>
  );
}

function SurveySkeleton() {
  return (
    <div className="workspace-skeleton-page workspace-skeleton-page--survey">
      <Topbar variant="survey" />
      <div className="workspace-skeleton-stepper" aria-hidden="true">
        <Block className="workspace-skeleton-step is-complete" />
        <Block className="workspace-skeleton-step is-active" />
        <Block className="workspace-skeleton-step" />
      </div>
      <div className="workspace-skeleton-workspace workspace-skeleton-workspace--survey">
        <section className="workspace-skeleton-panel workspace-skeleton-panel--controls">
          <Block className="workspace-skeleton-heading" />
          <Block className="workspace-skeleton-copy" />
          <Block className="workspace-skeleton-field" />
          <Block className="workspace-skeleton-field" />
          <div className="workspace-skeleton-button-row"><Block /><Block /></div>
          <Block className="workspace-skeleton-field workspace-skeleton-field--tall" />
          <Block className="workspace-skeleton-field workspace-skeleton-field--tall" />
        </section>
        <section className="workspace-skeleton-panel workspace-skeleton-panel--preview">
          <div className="workspace-skeleton-preview-toolbar"><Block /><Block /><Block /></div>
          <Block className="workspace-skeleton-preview-sheet" />
        </section>
      </div>
    </div>
  );
}

function EstateSkeleton() {
  return (
    <div className="workspace-skeleton-page workspace-skeleton-page--estate">
      <Topbar variant="estate" />
      <div className="workspace-skeleton-workspace workspace-skeleton-workspace--estate">
        <Sidebar />
        <main className="workspace-skeleton-main">
          <div className="workspace-skeleton-page-heading"><Block className="workspace-skeleton-heading" /><Block className="workspace-skeleton-heading-short" /></div>
          <StatCards count={5} />
          <div className="workspace-skeleton-card-grid workspace-skeleton-card-grid--wide">
            <section className="workspace-skeleton-panel workspace-skeleton-panel--map"><Block className="workspace-skeleton-panel-title" /><Block className="workspace-skeleton-map" /></section>
            <section className="workspace-skeleton-panel"><Block className="workspace-skeleton-panel-title" /><ContentRows count={4} /></section>
          </div>
        </main>
      </div>
    </div>
  );
}

function GreenSkeleton({ variant }: { variant: "green" | "work" }) {
  const isWork = variant === "work";
  return (
    <div className={`workspace-skeleton-page workspace-skeleton-page--${variant}`}>
      <Topbar variant={variant} />
      <div className={`workspace-skeleton-workspace workspace-skeleton-workspace--${variant}`}>
        <main className="workspace-skeleton-main">
          <div className="workspace-skeleton-page-heading"><Block className="workspace-skeleton-heading" /><Block className="workspace-skeleton-heading-short" /></div>
          <StatCards count={isWork ? 4 : 3} />
          <div className="workspace-skeleton-action-row"><Block /><Block /><Block /><Block /></div>
          <div className="workspace-skeleton-card-grid">
            <section className="workspace-skeleton-panel workspace-skeleton-panel--map"><Block className="workspace-skeleton-panel-title" /><Block className="workspace-skeleton-map" /></section>
            <section className="workspace-skeleton-panel"><Block className="workspace-skeleton-panel-title" /><ContentRows count={isWork ? 6 : 4} /></section>
          </div>
        </main>
      </div>
    </div>
  );
}

function HazardSkeleton() {
  return (
    <div className="workspace-skeleton-page workspace-skeleton-page--hazard">
      <Topbar variant="hazard" />
      <div className="workspace-skeleton-workspace workspace-skeleton-workspace--hazard">
        <main className="workspace-skeleton-main">
          <div className="workspace-skeleton-page-heading"><Block className="workspace-skeleton-heading" /><Block className="workspace-skeleton-heading-short" /></div>
          <div className="workspace-skeleton-hazard-grid">
            <section className="workspace-skeleton-panel"><Block className="workspace-skeleton-panel-title" /><Block className="workspace-skeleton-field" /><Block className="workspace-skeleton-field" /><Block className="workspace-skeleton-field workspace-skeleton-field--tall" /><Block className="workspace-skeleton-button" /></section>
            <section className="workspace-skeleton-panel workspace-skeleton-panel--map"><Block className="workspace-skeleton-panel-title" /><Block className="workspace-skeleton-map" /></section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function WorkspaceLoadingSkeleton({ variant }: Props) {
  return (
    <div className="workspace-skeleton" role="status" aria-live="polite" aria-label={WORKSPACE_LABELS[variant]}>
      {variant === "survey" && <SurveySkeleton />}
      {variant === "estate" && <EstateSkeleton />}
      {(variant === "green" || variant === "work") && <GreenSkeleton variant={variant} />}
      {variant === "hazard" && <HazardSkeleton />}
    </div>
  );
}
