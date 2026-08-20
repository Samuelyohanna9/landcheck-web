import type { ReactElement } from "react";

// Real vector flags, not Unicode flag emoji - Windows has no flag glyphs in its default fonts,
// so an emoji flag like 🇳🇬 silently falls back to showing the raw two-letter code ("NG") as
// plain text instead of a flag. These render identically on every OS/browser.
type CountryFlagProps = {
  country: string;
  size?: number;
  className?: string;
};

const ASPECT = 2 / 3; // height / width, standard-ish flag proportions

function NigeriaFlag() {
  return (
    <svg viewBox="0 0 3 2" width="100%" height="100%" role="img" aria-label="Nigeria flag">
      <rect width="1" height="2" fill="#008751" />
      <rect x="1" width="1" height="2" fill="#ffffff" />
      <rect x="2" width="1" height="2" fill="#008751" />
    </svg>
  );
}

function GhanaFlag() {
  return (
    <svg viewBox="0 0 3 2" width="100%" height="100%" role="img" aria-label="Ghana flag">
      <rect width="3" height="0.667" fill="#ce1126" />
      <rect y="0.667" width="3" height="0.667" fill="#fcd116" />
      <rect y="1.333" width="3" height="0.667" fill="#006b3f" />
      <polygon
        fill="#000000"
        points="1.5,0.72 1.565,0.911 1.766,0.913 1.605,1.034 1.665,1.227 1.5,1.11 1.335,1.227 1.395,1.034 1.234,0.913 1.435,0.911"
      />
    </svg>
  );
}

function UgandaFlag() {
  const bandH = 2 / 6;
  const colors = ["#000000", "#fcdc04", "#d90000", "#000000", "#fcdc04", "#d90000"];
  return (
    <svg viewBox="0 0 3 2" width="100%" height="100%" role="img" aria-label="Uganda flag">
      {colors.map((color, i) => (
        <rect key={i} y={i * bandH} width="3" height={bandH} fill={color} />
      ))}
      <circle cx="1.5" cy="1" r="0.36" fill="#ffffff" stroke="#d90000" strokeWidth="0.02" />
    </svg>
  );
}

function GlobalGlyph() {
  return (
    <svg viewBox="0 0 20 14" width="100%" height="100%" role="img" aria-label="Global">
      <rect width="20" height="14" rx="2" fill="#0f2438" />
      <g stroke="#7dd3fc" strokeWidth="0.9" fill="none">
        <circle cx="10" cy="7" r="5.4" />
        <ellipse cx="10" cy="7" rx="2.3" ry="5.4" />
        <line x1="4.6" y1="7" x2="15.4" y2="7" />
        <line x1="5.4" y1="3.9" x2="14.6" y2="3.9" />
        <line x1="5.4" y1="10.1" x2="14.6" y2="10.1" />
      </g>
    </svg>
  );
}

const FLAGS: Record<string, () => ReactElement> = {
  Nigeria: NigeriaFlag,
  Ghana: GhanaFlag,
  Uganda: UgandaFlag,
  Global: GlobalGlyph,
};

export default function CountryFlag({ country, size = 18, className }: CountryFlagProps) {
  const Flag = FLAGS[country];
  if (!Flag) return null;
  return (
    <span
      className={`country-flag${className ? ` ${className}` : ""}`}
      style={{ width: size, height: Math.round(size * ASPECT) }}
      aria-hidden="true"
    >
      <Flag />
    </span>
  );
}
