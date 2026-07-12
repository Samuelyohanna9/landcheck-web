// Stylized globe with forested landmasses — used on the sponsor hero,
// straddling the diagonal seam between the text panel and the video panel.
const TREE_POSITIONS: Array<[number, number]> = [
  [66, 62], [78, 54], [58, 76], [82, 82],
  [58, 122], [70, 132], [50, 138],
  [128, 60], [140, 50],
  [148, 108], [160, 118], [138, 128], [152, 138],
];

export default function EarthGlobe({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="gpsGlobeBase" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#f6f8ee" />
          <stop offset="100%" stopColor="#d7e2c4" />
        </radialGradient>
        <symbol id="gpsMiniTree" viewBox="0 0 10 14">
          <path d="M5 0 9 7H6.5L9.5 12H0.5L3.5 7H1Z" />
          <rect x="4.3" y="12" width="1.4" height="2" />
        </symbol>
      </defs>
      <circle cx="100" cy="100" r="94" fill="url(#gpsGlobeBase)" stroke="#ffffff" strokeWidth="5" />
      <g fill="#4f8a68" opacity="0.92">
        <ellipse cx="78" cy="72" rx="34" ry="27" transform="rotate(-16 78 72)" />
        <ellipse cx="66" cy="128" rx="22" ry="30" transform="rotate(8 66 128)" />
        <ellipse cx="145" cy="112" rx="27" ry="34" transform="rotate(-10 145 112)" />
        <ellipse cx="128" cy="52" rx="17" ry="13" transform="rotate(18 128 52)" />
      </g>
      <g fill="#1b3a2c" opacity="0.8">
        {TREE_POSITIONS.map(([x, y], i) => (
          <use key={i} href="#gpsMiniTree" x={x - 4} y={y - 5} width={8} height={11} />
        ))}
      </g>
      <circle cx="100" cy="100" r="94" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
    </svg>
  );
}
