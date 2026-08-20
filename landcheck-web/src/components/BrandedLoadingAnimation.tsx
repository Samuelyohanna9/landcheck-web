type Props = {
  src: string;
  label?: string;
  size?: "small" | "medium" | "large";
  /** width / height of the source SVG - the survey/hazard animations are wide (520x220 = 2.36),
   * the Green one is square (420x420 = 1). Only affects the width/height attributes used to
   * reserve layout space before the image loads; the image itself always renders at its own
   * intrinsic ratio (height: auto in CSS), this just avoids a layout shift once it does. */
  aspectRatio?: number;
  className?: string;
};

// Shared shell for the product-specific branded loading SVGs (public/LandCheck_*_Loading_Animation.svg)
// - each is a self-contained, CSS-animated SVG, so a plain <img> is enough to run the animation;
// no JS/Lottie runtime needed. See SurveyLoadingAnimation / HazardLoadingAnimation / GreenLoadingAnimation
// for the per-product wrappers that point this at the right file.
export default function BrandedLoadingAnimation({ src, label, size = "medium", aspectRatio = 520 / 220, className }: Props) {
  const width = size === "small" ? 200 : size === "large" ? 440 : 320;
  const height = Math.round(width / aspectRatio);

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
