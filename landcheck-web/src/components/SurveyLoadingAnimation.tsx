type Props = {
  label?: string;
  size?: "small" | "medium" | "large";
  className?: string;
};

// Renders public/LandCheck_Survey_Loading_Animation.svg - a self-contained CSS-animated SVG
// (parcel trace, pulsing survey points, scanning beam, progress rail), so a plain <img> is enough
// to get the animation running; no JS/Lottie runtime needed. Used everywhere a survey route waits
// on something (a render, an upload, a solve) instead of a plain spinner.
export default function SurveyLoadingAnimation({ label, size = "medium", className }: Props) {
  const width = size === "small" ? 200 : size === "large" ? 440 : 320;
  const height = Math.round((width * 220) / 520);

  return (
    <div className={`survey-loading-animation survey-loading-animation--${size}${className ? ` ${className}` : ""}`}>
      {label && <span className="survey-loading-animation-label">{label}</span>}
      <img
        src="/LandCheck_Survey_Loading_Animation.svg"
        alt="Loading"
        width={width}
        height={height}
        className="survey-loading-animation-img"
      />
    </div>
  );
}
