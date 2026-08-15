/* Decorative "control-point network" graphic - a constellation of survey control points joined by
   traverse lines, echoing both the app's own beacon markers and a classic connected-network motif.
   Purely decorative: aria-hidden, no pointer events, safe to drop into any solid-color panel. */
function SurveyNetworkMotif({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`survey-network-motif ${className}`.trim()}
      viewBox="0 0 480 420"
      fill="none"
      aria-hidden="true"
    >
      {/* faint globe-curvature arcs */}
      <path d="M-40 300 Q 200 140 520 220" stroke="var(--survey-forest-400, #3ca368)" strokeWidth="1" opacity="0.35" />
      <path d="M-40 380 Q 220 240 520 300" stroke="var(--survey-copper-400, #e0a868)" strokeWidth="1" opacity="0.3" />

      {/* traverse lines */}
      <g stroke="var(--survey-copper-400, #e0a868)" strokeWidth="1.1" opacity="0.55">
        <line x1="60" y1="330" x2="150" y2="250" />
        <line x1="150" y1="250" x2="120" y2="160" />
        <line x1="150" y1="250" x2="240" y2="270" />
        <line x1="240" y1="270" x2="300" y2="190" />
        <line x1="300" y1="190" x2="260" y2="100" />
        <line x1="300" y1="190" x2="380" y2="150" />
        <line x1="380" y1="150" x2="440" y2="70" />
        <line x1="380" y1="150" x2="430" y2="210" />
        <line x1="120" y1="160" x2="200" y2="90" />
        <line x1="200" y1="90" x2="260" y2="100" />
        <line x1="240" y1="270" x2="210" y2="350" />
      </g>

      {/* control points */}
      <g fill="var(--survey-copper-300, #f0c48f)">
        <circle cx="60" cy="330" r="8" opacity="0.9" />
        <circle cx="150" cy="250" r="4.5" opacity="0.85" />
        <circle cx="120" cy="160" r="3.5" opacity="0.7" />
        <circle cx="240" cy="270" r="4" opacity="0.75" />
        <circle cx="300" cy="190" r="5" opacity="0.85" />
        <circle cx="260" cy="100" r="3.5" opacity="0.65" />
        <circle cx="380" cy="150" r="4.5" opacity="0.8" />
        <circle cx="440" cy="70" r="3" opacity="0.55" />
        <circle cx="430" cy="210" r="3" opacity="0.55" />
        <circle cx="200" cy="90" r="3" opacity="0.55" />
        <circle cx="210" cy="350" r="3" opacity="0.5" />
      </g>
    </svg>
  );
}

export default SurveyNetworkMotif;
