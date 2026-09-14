export default function Spinner({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg className="edash-spinner" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={style}>
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.18" strokeWidth="3" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function LoadingPanel({ label = "Working..." }: { label?: string }) {
  return (
    <div className="edash-loading-panel">
      <Spinner size={28} />
      <span>{label}</span>
    </div>
  );
}
