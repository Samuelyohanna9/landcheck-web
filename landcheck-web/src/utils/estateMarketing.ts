import { api } from "../api/client";

export function normalizePhone(raw?: string | null): string | null {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = `234${digits.slice(1)}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function whatsappHref(phone?: string | null, text?: string): string | null {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function whatsappShareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function downloadFile(path: string, filename: string, params?: Record<string, unknown>) {
  const response = await api.get(path, { responseType: "blob", params });
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function fetchBlobUrl(path: string, params?: Record<string, unknown>): Promise<string> {
  const response = await api.get(path, { responseType: "blob", params });
  return URL.createObjectURL(response.data as Blob);
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export function ageLabel(hours: number): string {
  if (hours < 1) return "under an hour ago";
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export const naira = (value?: string | number | null) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount) : "-";
};

export function mapsDirectionsHref(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function wazeHref(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

export type FollowUpItem = {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  status: "new" | "contacted";
  estate_name: string;
  plot: string | null;
  age_hours: number;
  agent: string | null;
  whatsapp_url: string | null;
};

export type ShareLinks = {
  page_url: string;
  share_url: string;
  whatsapp_text: string;
  sender: string;
  plots: Array<{ id: number; plot_number: string; area_sqm: number | null; price: string | null; page_url: string; share_url: string }>;
};

export type AdFormat = "status" | "post" | "landscape" | "poster";
export type AdStyle = "promo" | "luxury" | "heritage" | "bold" | "blueprint";

export const AD_STYLES: Array<{ key: AdStyle; label: string; hint: string }> = [
  { key: "promo", label: "Bright promo", hint: "Poster style with a price ribbon" },
  { key: "luxury", label: "Classic dark", hint: "Dark, premium look" },
  { key: "heritage", label: "Heritage", hint: "Ivory paper, serif type, framed satellite photo" },
  { key: "bold", label: "Bold", hint: "Your logo colour, huge price, sticker badge" },
  { key: "blueprint", label: "Blueprint", hint: "Navy survey drawing with coordinates and spec table" },
];

export const adStyleLabel = (key: string) => AD_STYLES.find((item) => item.key === key)?.label || "Bright promo";
export const asAdStyle = (key: string | null | undefined): AdStyle => (AD_STYLES.some((item) => item.key === key) ? (key as AdStyle) : "promo");

const ALL_FORMATS: Array<{ key: AdFormat; label: string; hint: string; short: string }> = [
  { key: "status", label: "WhatsApp Status / Story", hint: "1080 x 1920", short: "Status" },
  { key: "post", label: "Instagram & Facebook post", hint: "1080 x 1350", short: "Post" },
  { key: "poster", label: "Print poster (A4)", hint: "1240 x 1754, print-ready", short: "Poster" },
  { key: "landscape", label: "Wide banner", hint: "1200 x 630", short: "Banner" },
];

/** The print poster exists in every style except the classic dark one. */
export const adFormatsFor = (style: AdStyle) => ALL_FORMATS.filter((format) => style !== "luxury" || format.key !== "poster");
export const AD_FORMATS = ALL_FORMATS;

/** Nigeria has no daylight saving: Lagos is always UTC+1. Post times are shown and edited in Lagos time. */
export const LAGOS_TZ = "Africa/Lagos";
export function formatLagos(value?: string | null, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-NG", { timeZone: LAGOS_TZ, ...options });
}
export function lagosDayKey(value: string): string {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: LAGOS_TZ });
}
export function toLagosInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(new Date(value).getTime() + 3600 * 1000);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}
export function fromLagosInput(value: string): string {
  return `${value}:00+01:00`;
}
