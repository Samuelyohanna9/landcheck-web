type Props = {
  label?: string;
  size?: "small" | "medium" | "large";
  className?: string;
};

export default function GreenLoadingAnimation({ label, size = "medium", className }: Props) {
  return (
    <div className={`green-loading-animation green-loading-animation--${size}${className ? ` ${className}` : ""}`} role="status" aria-live="polite">
      <span className="green-loading-animation-ring" aria-hidden="true">
        <img src="/green-logo-cropped-760.png" alt="" className="green-loading-animation-logo" width="22" height="22" />
      </span>
      {label && <span className="green-loading-animation-label">{label}</span>}
    </div>
  );
}
