export type EstateProgressStep = { label: string; match: string[] };

// Finds the furthest step whose `match` text appears in the backend's current stage string -
// matched by content rather than strict progress_pct ordering, since a couple of these jobs
// (e.g. the development forecast) report a stage whose pct briefly dips below an earlier one
// (built-up history loads at pct 10, after erosion screening's pct 25), which would otherwise
// make the stepper jump backward.
function activeStepIndex(steps: EstateProgressStep[], stage: string): number {
  const normalized = (stage || "").toLowerCase();
  let found = 0;
  steps.forEach((step, index) => {
    if (step.match.some((needle) => normalized.includes(needle.toLowerCase()))) found = index;
  });
  return found;
}

export default function EstateProgressSteps({ steps, stage, pct }: { steps: EstateProgressStep[]; stage: string; pct: number }) {
  const complete = pct >= 100 || (stage || "").trim().toLowerCase() === "complete";
  const activeIndex = complete ? steps.length : activeStepIndex(steps, stage);

  return (
    <ul className="edash-progress-steps">
      {steps.map((step, index) => {
        const state = complete || index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
        return (
          <li key={step.label} className={`edash-progress-step edash-progress-step--${state}`}>
            <span className="edash-progress-step-dot" aria-hidden="true">{state === "done" ? "✓" : ""}</span>
            <span className="edash-progress-step-label">{step.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
