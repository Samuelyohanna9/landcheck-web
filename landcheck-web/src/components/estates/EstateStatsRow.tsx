import * as stylex from "@stylexjs/stylex";
import EstateIcon, { type EstateIconName } from "./EstateIcon";

export type EstateStatCardTone = "neutral" | "allocated" | "available" | "reserved" | "survey" | "staking";

export type EstateStatCard = {
  label: string;
  value: number;
  sub: string;
  icon: EstateIconName;
  tone: EstateStatCardTone;
};

// Sits on the light estate-dashboard surface, so it reads off the same CSS custom properties
// (estate-dashboard.css :root) as every other card on the page rather than inventing a second
// palette - only the layout/typography/hover treatment is new.
const ink = {
  surface: "var(--edash-surface, #fff)",
  border: "var(--edash-border, #e4e8ec)",
  ink: "var(--edash-ink, #101827)",
  muted: "var(--edash-muted, #6b7685)",
  faint: "var(--edash-faint, #98a2b0)",
  radius: "var(--edash-radius-md, 12px)",
  shadow: "var(--edash-shadow-card, 0 1px 2px rgba(16,24,39,0.04), 0 8px 24px rgba(16,24,39,0.05))",
};

const styles = stylex.create({
  row: {
    display: "grid",
    // Always at most 2 rows for the 6 stat cards: 3-across below the desktop breakpoint, 6-across
    // (one row) above it. Never drops to 2 columns, which is what previously produced 3 rows.
    gridTemplateColumns: {
      default: "repeat(3, minmax(0, 1fr))",
      "@media (min-width: 980px)": "repeat(6, minmax(0, 1fr))",
    },
    gap: {
      default: 10,
      "@media (min-width: 640px)": 14,
    },
  },
  card: {
    display: "flex",
    alignItems: "center",
    gap: {
      default: 8,
      "@media (min-width: 640px)": 11,
    },
    padding: {
      default: "10px 10px",
      "@media (min-width: 640px)": "13px 15px",
    },
    borderRadius: ink.radius,
    border: `1px solid ${ink.border}`,
    background: ink.surface,
    boxShadow: ink.shadow,
    minWidth: 0,
    transitionProperty: "transform, box-shadow, border-color",
    transitionDuration: "0.15s",
    transitionTimingFunction: "ease",
    ":hover": {
      transform: "translateY(-1px)",
      boxShadow: "0 2px 4px rgba(16,24,39,0.07), 0 14px 28px rgba(16,24,39,0.08)",
    },
  },
  iconChip: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: {
      default: 30,
      "@media (min-width: 640px)": 34,
    },
    height: {
      default: 30,
      "@media (min-width: 640px)": 34,
    },
    borderRadius: 9,
    flexShrink: 0,
  },
  iconChipSvg: {
    width: 15,
    height: 15,
  },
  body: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  label: {
    margin: 0,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: ink.muted,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  valueRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 7,
    flexWrap: "wrap",
  },
  value: {
    margin: 0,
    fontSize: {
      default: 17,
      "@media (min-width: 640px)": 19,
    },
    fontWeight: 800,
    letterSpacing: "-0.02em",
    lineHeight: 1.1,
    color: ink.ink,
    fontVariantNumeric: "tabular-nums",
  },
  sub: {
    fontSize: 10.5,
    fontWeight: 700,
    color: ink.faint,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  subPositive: {
    color: "#1e8a4c",
  },
});

// Fixed per-tone icon-chip colors - the tone set is a closed list of six, and StyleX compiles
// style objects statically, so each tone gets its own named style rather than an interpolated one.
const toneStyles = stylex.create({
  neutral: { background: "#eef0f3", color: "#445066" },
  allocated: { background: "#eaf2fc", color: "#2a78d6" },
  available: { background: "#e6f6ec", color: "#1e8a4c" },
  reserved: { background: "#fbf1de", color: "#d69100" },
  survey: { background: "#fdece2", color: "#d9622a" },
  staking: { background: "#eee8fa", color: "#6046a8" },
});

export default function EstateStatsRow({ cards }: { cards: EstateStatCard[] }) {
  return (
    <div {...stylex.props(styles.row)}>
      {cards.map((card) => (
        <div key={card.label} {...stylex.props(styles.card)}>
          <span {...stylex.props(styles.iconChip, toneStyles[card.tone])}>
            <EstateIcon name={card.icon} className={stylex.props(styles.iconChipSvg).className} />
          </span>
          <div {...stylex.props(styles.body)}>
            <p {...stylex.props(styles.label)}>{card.label}</p>
            <div {...stylex.props(styles.valueRow)}>
              <p {...stylex.props(styles.value)}>{card.value.toLocaleString()}</p>
              <span {...stylex.props(styles.sub, card.tone !== "neutral" && styles.subPositive)}>{card.sub}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
