import type { CSSProperties } from "react";

// The one canonical plot/allocation status color map for the whole Estate product - originally
// just the Map & Plots page's own paint expression, now the single source every other status pill
// (Plot History, Plot register, Sales & Payments, the public site map) reads from, so "Reserved"
// (or any other status) never renders a different color in one place than another.
export const PLOT_STATUS_COLORS = {
  available: "#1e8a4c",
  allocated: "#2a78d6",
  reserved: "#d69100",
  under_survey: "#d9622a",
  under_staking: "#6046a8",
  developed: "#0f8b8d",
  on_hold: "#667085",
} as const;

export const PLOT_STATUS_LABELS: Record<string, string> = {
  available: "Available",
  allocated: "Allocated",
  reserved: "Reserved",
  under_survey: "Under survey",
  under_staking: "Under staking",
  developed: "Developed",
  on_hold: "On hold",
};

export const PLOT_STATUS_LEGEND_ITEMS = [
  { key: "available", label: PLOT_STATUS_LABELS.available, color: PLOT_STATUS_COLORS.available },
  { key: "allocated", label: PLOT_STATUS_LABELS.allocated, color: PLOT_STATUS_COLORS.allocated },
  { key: "reserved", label: PLOT_STATUS_LABELS.reserved, color: PLOT_STATUS_COLORS.reserved },
  { key: "under_survey", label: PLOT_STATUS_LABELS.under_survey, color: PLOT_STATUS_COLORS.under_survey },
  { key: "under_staking", label: PLOT_STATUS_LABELS.under_staking, color: PLOT_STATUS_COLORS.under_staking },
  { key: "developed", label: PLOT_STATUS_LABELS.developed, color: PLOT_STATUS_COLORS.developed },
  { key: "on_hold", label: PLOT_STATUS_LABELS.on_hold, color: PLOT_STATUS_COLORS.on_hold },
];

export function plotStatusColor(status: string | null | undefined): string {
  return (PLOT_STATUS_COLORS as Record<string, string>)[String(status || "")] || PLOT_STATUS_COLORS.on_hold;
}

export function plotStatusLabel(status: string | null | undefined): string {
  const key = String(status || "");
  return PLOT_STATUS_LABELS[key] || key.replaceAll("_", " ") || "Unknown";
}

// A colored pill in the plot/allocation's own canonical color (not the generic good/warn/danger
// "tone" system, which only has a handful of buckets and already caused Reserved to render green
// in at least one place - see Plot History's old hardcoded tone-good).
export function PlotStatusBadge({ status, style }: { status: string | null | undefined; style?: CSSProperties }) {
  const color = plotStatusColor(status);
  return (
    <span className="edash-plot-status-pill" style={{ color, background: `${color}1f`, borderColor: `${color}55`, ...style }}>
      {plotStatusLabel(status)}
    </span>
  );
}
