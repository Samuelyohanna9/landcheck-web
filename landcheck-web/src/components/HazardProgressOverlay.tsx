type Props = {
  visible: boolean;
  progressPct: number;
  stageText: string;
  hazardType: "flood" | "erosion";
};

const MILESTONES = [
  { label: "Connecting to data sources", threshold: 0 },
  { label: "Downloading satellite data", threshold: 20 },
  { label: "Analyzing terrain & conditions", threshold: 45 },
  { label: "Locating nearby buildings", threshold: 65 },
  { label: "Rendering hazard map", threshold: 85 },
];

export default function HazardProgressOverlay({ visible, progressPct, stageText, hazardType }: Props) {
  if (!visible) return null;

  const pct = Math.max(0, Math.min(100, Math.round(progressPct)));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  const activeIndex = MILESTONES.reduce(
    (acc, m, i) => (pct >= m.threshold ? i : acc),
    0,
  );

  return (
    <div className="hazard-progress-overlay" role="status" aria-live="polite">
      <div className="hazard-progress-card">
        <div className="hazard-progress-brand">
          <span className="hazard-progress-brand-mark">LC</span>
          <span className="hazard-progress-brand-name">LandCheck</span>
        </div>

        <div className="hazard-progress-ring-wrap">
          <svg className="hazard-progress-ring" viewBox="0 0 120 120">
            <defs>
              <linearGradient id="hazard-progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0ea5e9" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>
            <circle className="hazard-progress-ring-track" cx="60" cy="60" r={radius} />
            <circle
              className="hazard-progress-ring-fill"
              cx="60"
              cy="60"
              r={radius}
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: offset,
              }}
            />
          </svg>
          <div className="hazard-progress-ring-label">
            <span className="hazard-progress-pct">{pct}%</span>
            <span className="hazard-progress-type">{hazardType === "flood" ? "Flood" : "Erosion"}</span>
          </div>
        </div>

        <p className="hazard-progress-stage">{stageText || "Working..."}</p>

        <ul className="hazard-progress-steps">
          {MILESTONES.map((m, i) => {
            const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
            return (
              <li key={m.label} className={`hazard-progress-step hazard-progress-step--${state}`}>
                <span className="hazard-progress-step-dot" aria-hidden="true">
                  {state === "done" ? "✓" : ""}
                </span>
                <span className="hazard-progress-step-label">
                  {state === "active" && stageText ? stageText : m.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
