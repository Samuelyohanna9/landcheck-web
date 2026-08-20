type Props = {
  src: string;
  label?: string;
  size?: "small" | "medium" | "large";
  className?: string;
};

// Shared shell for the product-specific branded loading SVGs (public/LandCheck_*_Loading_Animation.svg)
// - each is a self-contained, CSS-animated SVG, so a plain <img> is enough to run the animation;
// no JS/Lottie runtime needed. See SurveyLoadingAnimation / HazardLoadingAnimation for the
// per-product wrappers that point this at the right file.
export default function BrandedLoadingAnimation({ src, label, size = "medium", className }: Props) {
  const width = size === "small" ? 200 : size === "large" ? 440 : 320;
  const height = Math.round((width * 220) / 520);

  return (
    <div className={`branded-loading-animation branded-loading-animation--${size}${className ? ` ${className}` : ""}`}>
      {label && <span className="branded-loading-animation-label">{label}</span>}
      <img
        src={src}
        alt="Loading"
        width={width}
        height={height}
        className="branded-loading-animation-img"
      />
    </div>
  );
}
