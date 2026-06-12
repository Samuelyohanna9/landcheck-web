import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  buildSponsorCertificateUrl,
  buildSponsorPrivacyUrl,
  buildSponsorPublicCertificateUrl,
  buildSponsorPublicTreeStoryUrl,
  buildSponsorTermsUrl,
  createSponsorOrder,
  fetchPublicLeaderboard,
  fetchPublicSponsorshipProjects,
  fetchSponsorAchievements,
  fetchSponsorOrderPaymentStatus,
  fetchSponsorOrders,
  fetchSponsorPoints,
  fetchSponsorTreeDetail,
  fetchSponsorTrees,
  postSponsorGameAction,
  redeemReferralCode,
  submitSchoolNomination,
  type SponsorAchievements,
  type SponsorLeaderboardData,
  type SponsorOrder,
  type SponsorPointsInfo,
  type SponsorProject,
  type SponsorTreeDetail,
  type SponsorTreeSummary,
  SPONSOR_TERMS_VERSION,
  updateSponsorProfileSettings,
} from "../api/greenSponsor";
import { BACKEND_URL } from "../api/client";
import {
  clearGreenAuthed,
  getGreenAuthSession,
  isSponsorGreenSession,
  setGreenAuthed,
  type GreenAuthSession,
} from "../auth/greenAuth";
import "../styles/green-sponsor.css";

// ─── Tab & form types ─────────────────────────────────────────────────────────
type SponsorTabKey = "projects" | "trees" | "leaderboard" | "grove" | "profile";

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  date: string | null;
};

type ProfileFormState = {
  entity_category: string;
  leaderboard_visibility: string;
};

type OrderDraftState = {
  quantity: string;
  dedicationType: string;
  dedicationName: string;
  dedicationMessage: string;
  purchaserNote: string;
  acceptedTerms: boolean;
  acceptedPolicy: boolean;
};

type SchoolNomState = {
  name: string;
  location: string;
  contact: string;
  reason: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";
const SPONSOR_BACKGROUND = "/background-sponsor.png";
const TAB_STORAGE_KEY = "landcheck_green_sponsor_tab";

const DEDICATION_OPTIONS = [
  { value: "self", label: "Self" },
  { value: "birthday", label: "Birthday" },
  { value: "memorial", label: "Memorial" },
  { value: "anniversary", label: "Anniversary" },
  { value: "wedding", label: "Wedding" },
  { value: "honour", label: "In Honour Of" },
  { value: "celebration", label: "Celebration" },
  { value: "gratitude", label: "Gratitude" },
] as const;

const ENTITY_CATEGORY_OPTIONS = [
  { value: "individual", label: "Individual" },
  { value: "school", label: "School" },
  { value: "community", label: "Community" },
  { value: "company", label: "Company" },
  { value: "ngo", label: "NGO" },
] as const;

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Visible on leaderboard" },
  { value: "private", label: "Keep my profile private" },
] as const;

const R2_BUCKET_HINT = "photosgreen";

// ─── Game constants ───────────────────────────────────────────────────────────
const SPIN_SEGS = [
  { gp: 10,  emoji: "🌱", color: "#16a34a", dark: "#14532d" },
  { gp: 50,  emoji: "🌿", color: "#d97706", dark: "#78350f" },
  { gp: 25,  emoji: "💧", color: "#2563eb", dark: "#1e3a8a" },
  { gp: 200, emoji: "⭐", color: "#7c3aed", dark: "#4c1d95" },
  { gp: 15,  emoji: "🍃", color: "#15803d", dark: "#052e16" },
  { gp: 100, emoji: "🦋", color: "#db2777", dark: "#831843" },
  { gp: 5,   emoji: "🌰", color: "#b45309", dark: "#451a03" },
  { gp: 30,  emoji: "🌸", color: "#4f46e5", dark: "#312e81" },
] as const;

const FRUIT_EMOJIS = ["🥭","🍎","🍊","🍇","🍌","🍑","🍓","🫐"];

const CARE_ACTIONS = [
  { key: "water",    emoji: "💧", label: "Water",     gp: 5,  cooldownMs: 4  * 3600000, color: "#2563eb" },
  { key: "fertilize",emoji: "🌱", label: "Fertilize", gp: 10, cooldownMs: 12 * 3600000, color: "#16a34a" },
  { key: "protect",  emoji: "🛡️", label: "Protect",  gp: 15, cooldownMs: 24 * 3600000, color: "#7c3aed" },
];

const TREE_STAGES = [
  { emoji: "🌱", label: "Seedling",    min: 0  },
  { emoji: "🌿", label: "Sprout",      min: 3  },
  { emoji: "🪴", label: "Young Tree",  min: 8  },
  { emoji: "🌳", label: "Mature Tree", min: 18 },
  { emoji: "🌲", label: "Ancient Tree",min: 35 },
];

const QUESTS = [
  { key: "sponsor_tree",      emoji: "🌳", title: "Sponsor a Tree",       desc: "Sponsor at least 1 tree this week",     gp: 100 },
  { key: "share_story",       emoji: "📤", title: "Share Your Tree Story", desc: "Share a tree story with friends",       gp: 50  },
  { key: "view_leaderboard",  emoji: "🏆", title: "Check the Leaderboard", desc: "Visit the leaderboard tab this week",   gp: 25  },
  { key: "spin_three",        emoji: "🎡", title: "Spin 3 Times",          desc: "Use the daily spin 3 days in a row",    gp: 75  },
  { key: "complete_profile",  emoji: "👤", title: "Complete Your Profile", desc: "Set entity category and visibility",    gp: 50  },
  { key: "plant_extra",       emoji: "🌲", title: "Go the Extra Mile",     desc: "Sponsor 3+ trees in a single order",    gp: 200 },
];

const WILDLIFE = [
  { id: "sunbird",    emoji: "🐦",  name: "Sunbird",          rarity: "common",    gp: 50   },
  { id: "butterfly",  emoji: "🦋",  name: "Morpho Butterfly", rarity: "common",    gp: 60   },
  { id: "squirrel",   emoji: "🐿️", name: "Red Squirrel",     rarity: "common",    gp: 70   },
  { id: "rabbit",     emoji: "🐇",  name: "Forest Rabbit",    rarity: "uncommon",  gp: 100  },
  { id: "deer",       emoji: "🦌",  name: "Bushbuck Deer",    rarity: "uncommon",  gp: 120  },
  { id: "fox",        emoji: "🦊",  name: "Fennec Fox",       rarity: "rare",      gp: 200  },
  { id: "monkey",     emoji: "🐒",  name: "Colobus Monkey",   rarity: "rare",      gp: 220  },
  { id: "elephant",   emoji: "🐘",  name: "Forest Elephant",  rarity: "epic",      gp: 400  },
  { id: "leopard",    emoji: "🐆",  name: "Leopard",          rarity: "epic",      gp: 450  },
  { id: "eagle",      emoji: "🦅",  name: "Fish Eagle",       rarity: "legendary", gp: 800  },
  { id: "panda",      emoji: "🐼",  name: "Giant Panda",      rarity: "legendary", gp: 1000 },
  { id: "whale",      emoji: "🐋",  name: "Blue Whale",       rarity: "legendary", gp: 800  },
];

const RARITY_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  common:    { bg: "#dcfce7", border: "#16a34a", text: "#15803d" },
  uncommon:  { bg: "#dbeafe", border: "#2563eb", text: "#1d4ed8" },
  rare:      { bg: "#ede9fe", border: "#7c3aed", text: "#6d28d9" },
  epic:      { bg: "#fce7f3", border: "#db2777", text: "#be185d" },
  legendary: { bg: "#fef3c7", border: "#d97706", text: "#b45309" },
};

const MERCH = [
  { emoji: "👜", name: "Eco Tote Bag",    gp: 800,  desc: "Organic cotton, LandCheck Green branded" },
  { emoji: "🧢", name: "Forest Cap",      gp: 1000, desc: "Premium embroidered logo cap" },
  { emoji: "👕", name: "Grove Hoodie",    gp: 1500, desc: "100% organic cotton hoodie" },
];

// ─── Helper functions ─────────────────────────────────────────────────────────
function getWeekKey() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}_w${week}`;
}

const formatDateLabel = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

const formatDateTimeLabel = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const formatCurrencyAmount = (amount: number | null | undefined, currency = "NGN") => {
  const numeric = Number(amount || 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(numeric);
};

const humanizeLabel = (value: string | null | undefined, fallback = "Not available") => {
  const raw = String(value || "").trim().replace(/_/g, " ");
  if (!raw) return fallback;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const safeDecode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

const normalizeObjectKey = (value: string) => {
  let key = String(value || "").trim().replace(/^\/+/, "");
  if (!key) return "";
  for (let i = 0; i < 3; i += 1) { const d = safeDecode(key); if (d === key) break; key = d; }
  if (key.startsWith(`${R2_BUCKET_HINT}/`)) key = key.slice(R2_BUCKET_HINT.length + 1);
  return key;
};

const encodeObjectKeyForProxy = (value: string) =>
  normalizeObjectKey(value).split("/").filter(Boolean).map((p) => encodeURIComponent(safeDecode(p))).join("/");

const toDisplayPhotoUrl = (url: string | null | undefined) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.includes("/green/uploads/object/"))
    return /^https?:\/\//i.test(raw) ? raw : `${BACKEND_URL}${raw.startsWith("/") ? raw : `/${raw}`}`;
  const toProxy = (key: string) => { const e = encodeObjectKeyForProxy(key); return e ? `${BACKEND_URL}/green/uploads/object/${e}` : ""; };
  if (!/^https?:\/\//i.test(raw)) return toProxy(raw) || raw;
  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!parts.length) return raw;
    const maybeBucket = parts[0]?.toLowerCase() === R2_BUCKET_HINT;
    const key = (maybeBucket ? parts.slice(1) : parts).join("/");
    return toProxy(key) || raw;
  } catch { return raw; }
};

const getSponsorGreeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const getSponsorGreetingIcon = () => { const h = new Date().getHours(); return h < 12 ? "sun" : h < 18 ? "cloud" : "moon"; };
const getSponsorFirstName = (v?: string | null) => { const t = String(v || "").trim(); if (!t) return "there"; return t.split(/\s+/)[0] || t; };

const buildDirectionsUrl = (lat?: number | null, lng?: number | null) => {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return "";
  return `https://www.google.com/maps/dir/?api=1&destination=${Number(lat)},${Number(lng)}`;
};

const buildMapEmbedUrl = (lat?: number | null, lng?: number | null) => {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return "";
  const ml = Number(lat), mn = Number(lng), d = 0.02;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${(mn-d).toFixed(6)}%2C${(ml-d).toFixed(6)}%2C${(mn+d).toFixed(6)}%2C${(ml+d).toFixed(6)}&layer=mapnik&marker=${ml}%2C${mn}`;
};

const toneClassForStatus = (value: string | null | undefined) => {
  const key = String(value || "").trim().toLowerCase();
  if (["paid","allocated","linked","active","alive","completed"].includes(key)) return "ok";
  if (["awaiting_payment","pending_payment","awaiting_tree","payment_review"].includes(key)) return "warning";
  if (["cancelled","rejected","dead","failed"].includes(key)) return "danger";
  return "neutral";
};

const collectPhotoUrls = (detail: SponsorTreeDetail | null) => {
  if (!detail) return [];
  const seen = new Set<string>(); const output: string[] = [];
  const add = (c: string | null | undefined) => { const r = toDisplayPhotoUrl(c); if (!r || seen.has(r)) return; seen.add(r); output.push(r); };
  add(detail.photo_url);
  (detail.photo_urls || []).forEach(add);
  detail.timeline.forEach((item) => { add(item.photo_url); (item.photo_urls || []).forEach(add); });
  return output;
};

const buildActivityFeed = (orders: SponsorOrder[], trees: SponsorTreeSummary[]) => {
  const items: ActivityItem[] = [];
  orders.forEach((order) => {
    items.push({ id: `order-created-${order.id}`, title: `${order.quantity} tree${order.quantity === 1 ? "" : "s"} reserved`, detail: `Order created for ${order.project_name || "your selected project"}.`, date: order.created_at || null });
    if (String(order.payment_status || "").trim()) items.push({ id: `order-payment-${order.id}`, title: `Payment ${humanizeLabel(order.payment_status, "updated")}`, detail: `${order.project_name || "Project"} | ${formatCurrencyAmount(order.amount_total, order.currency || "NGN")}`, date: order.payment_verified_at || order.updated_at || order.created_at || null });
  });
  trees.forEach((tree) => items.push({ id: `tree-linked-${tree.unit_id}`, title: tree.project_tree_no ? `Tree ${tree.project_tree_no} linked` : "Sponsored tree linked", detail: `${tree.project_name || "LandCheck Green project"} | ${humanizeLabel(tree.tree_status, "Awaiting planting")}`, date: tree.linked_at || tree.tree_created_at || tree.order_created_at || null }));
  return items.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 6);
};

// ─── SVG Glyphs ───────────────────────────────────────────────────────────────
function GreenGlyph({ name, className = "" }: { name: string; className?: string }) {
  switch (name) {
    case "leaf": return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 5C12 5 7 9 5 15c2.5 1.5 5.6 1.8 8.3.6 2.8-1.2 4.9-3.8 5.7-7.2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M8 16c2-3 5-5.3 9-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "compass": return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" /><path d="M9.5 14.5 11 11l3.5-1.5L13 13l-3.5 1.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
    case "sun": return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" /><path d="M12 2.8v2.2M12 19v2.2M21.2 12H19M5 12H2.8M18.3 5.7l-1.6 1.6M7.3 16.7l-1.6 1.6M18.3 18.3l-1.6-1.6M7.3 7.3 5.7 5.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "cloud": return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.2 18h8.4a4.4 4.4 0 0 0 .3-8.8 5.6 5.6 0 0 0-10.7 1.6A3.7 3.7 0 0 0 8.2 18Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "moon": return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18.2 14.2A7.4 7.4 0 0 1 9.8 5.8a8.1 8.1 0 1 0 8.4 8.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "branch": return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 18c2.8 0 5-2.2 5-5V6m0 7h5m-5-3h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="7" cy="18" r="2.4" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.8" /><circle cx="17" cy="13" r="2.4" stroke="currentColor" strokeWidth="1.8" /></svg>;
    case "trophy": return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 4h8v2a4 4 0 0 1-8 0V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 16h6M10 20h4M6 6H4a2 2 0 0 0 2 2M18 6h2a2 2 0 0 1-2 2M12 10v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "spark": return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
    case "person": return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.8" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "map": return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="1.8" /></svg>;
    default: return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" /></svg>;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GAME MODALS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Daily Spin ───────────────────────────────────────────────────────────────
function DailySpinModal({
  session, onClose, onEarn,
}: { session: GreenAuthSession; onClose: () => void; onEarn: (gp: number) => void }) {
  const SPIN_TODAY_KEY = `lc_spin_${new Date().toDateString()}`;
  const [state, setState] = useState<"idle" | "spinning" | "done">(() =>
    localStorage.getItem(SPIN_TODAY_KEY) ? "done" : "idle"
  );
  const [rotation, setRotation] = useState(0);
  const [prize, setPrize] = useState<number | null>(() => {
    const saved = localStorage.getItem(SPIN_TODAY_KEY);
    return saved ? parseInt(saved, 10) : null;
  });
  const [err, setErr] = useState("");

  const doSpin = async () => {
    if (state !== "idle") return;
    setErr("");
    const idx = Math.floor(Math.random() * SPIN_SEGS.length);
    const seg = SPIN_SEGS[idx];
    const segAngle = 360 / SPIN_SEGS.length;
    const spinDelta = (360 - (idx * segAngle + segAngle / 2) + 360) % 360;
    const newRotation = rotation + 5 * 360 + spinDelta;
    setRotation(newRotation);
    setState("spinning");
    await new Promise((r) => setTimeout(r, 3700));
    try {
      await postSponsorGameAction(session, { game_id: "daily_spin", action: "spin", amount: seg.gp });
      onEarn(seg.gp);
      localStorage.setItem(SPIN_TODAY_KEY, String(seg.gp));
    } catch (e: any) {
      const m = e?.response?.data?.detail || "";
      if (m.toLowerCase().includes("already") || m.toLowerCase().includes("daily")) {
        setErr("Daily spin already claimed — come back tomorrow!");
      } else {
        setErr("Spin recorded locally (offline or limit reached).");
      }
    }
    setPrize(seg.gp);
    setState("done");
  };

  const cx = 150, cy = 150, r = 128;
  const n = SPIN_SEGS.length;
  const segAngle = 360 / n;

  return (
    <div className="gs-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gs-modal gs-modal-spin">
        <button className="gs-modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="gs-modal-header">
          <span className="gs-modal-emoji">🎡</span>
          <h2>Daily Spin</h2>
          <p>Spin once per day to earn Green Points. Up to 200 GP!</p>
        </div>

        <div className="gs-wheel-wrapper">
          <div className="gs-wheel-pointer" aria-hidden="true">▼</div>
          <div
            className="gs-wheel-rotor"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: state === "spinning" ? "transform 3.6s cubic-bezier(0.17,0.67,0.12,0.99)" : "none",
            }}
          >
            <svg viewBox="0 0 300 300" width="290" height="290">
              {SPIN_SEGS.map((seg, i) => {
                const startDeg = -90 + i * segAngle;
                const endDeg = startDeg + segAngle;
                const s = (startDeg * Math.PI) / 180;
                const e = (endDeg * Math.PI) / 180;
                const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
                const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
                const mid = (startDeg + segAngle / 2) * (Math.PI / 180);
                const tr = r * 0.64;
                const tx = cx + tr * Math.cos(mid), ty = cy + tr * Math.sin(mid);
                const textRot = startDeg + segAngle / 2 + 90;
                return (
                  <g key={i}>
                    <path
                      d={`M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`}
                      fill={i % 2 === 0 ? seg.color : seg.dark}
                      stroke="rgba(255,255,255,0.18)"
                      strokeWidth="1.5"
                    />
                    <text x={tx.toFixed(2)} y={ty.toFixed(2)} textAnchor="middle" dominantBaseline="middle"
                      fill="white" fontSize="15" fontWeight="900"
                      transform={`rotate(${textRot}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`}>
                      {seg.gp}
                    </text>
                    <text x={tx.toFixed(2)} y={(ty + 14).toFixed(2)} textAnchor="middle" dominantBaseline="middle"
                      fill="rgba(255,255,255,0.8)" fontSize="9" fontWeight="700"
                      transform={`rotate(${textRot}, ${tx.toFixed(2)}, ${(ty + 14).toFixed(2)})`}>
                      GP
                    </text>
                  </g>
                );
              })}
              <circle cx={cx} cy={cy} r="18" fill="white" />
              <circle cx={cx} cy={cy} r="12" fill="#16a34a" />
              <circle cx={cx} cy={cy} r="5" fill="white" />
            </svg>
          </div>
        </div>

        {prize !== null && (
          <div className="gs-spin-result">
            <div className="gs-spin-prize">+{prize} GP</div>
            <div>Added to your Green Points balance!</div>
          </div>
        )}
        {err && <div className="gs-game-error">{err}</div>}

        <button className={`gs-game-btn ${state !== "idle" ? "muted" : "primary"}`} onClick={doSpin} disabled={state !== "idle"}>
          {state === "spinning" ? "🌀 Spinning..." : state === "done" ? "✅ Come back tomorrow!" : "🎡 Spin Now!"}
        </button>
      </div>
    </div>
  );
}

// ─── Fruit Harvest ────────────────────────────────────────────────────────────
type FruitItem = { id: number; emoji: string; x: number; y: number };

function FruitHarvestModal({
  session, onClose, onEarn,
}: { session: GreenAuthSession; onClose: () => void; onEarn: (gp: number) => void }) {
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [fruits, setFruits] = useState<FruitItem[]>([]);
  const [caught, setCaught] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [claimed, setClaimed] = useState(false);
  const counterRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const spawnRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const start = () => {
    setFruits([]); setCaught(0); setTimeLeft(30); setClaimed(false);
    setPhase("playing");
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timerRef.current!); clearInterval(spawnRef.current!); setPhase("done"); return 0; }
        return t - 1;
      });
    }, 1000);
    spawnRef.current = setInterval(() => {
      const id = ++counterRef.current;
      setFruits((prev) => [
        ...prev.slice(-18),
        { id, emoji: FRUIT_EMOJIS[Math.floor(Math.random() * FRUIT_EMOJIS.length)], x: 4 + Math.random() * 78, y: 5 + Math.random() * 72 },
      ]);
      setTimeout(() => setFruits((prev) => prev.filter((f) => f.id !== id)), 2200);
    }, 650);
  };

  const catchFruit = (id: number) => {
    setFruits((prev) => prev.filter((f) => f.id !== id));
    setCaught((c) => c + 1);
  };

  const handleClaim = async () => {
    if (claimed) return;
    setClaimed(true);
    const gp = Math.min(caught * 2, 25);
    try {
      await postSponsorGameAction(session, { game_id: "fruit_harvest", action: "play", amount: gp });
      onEarn(gp);
    } catch { onEarn(Math.min(caught * 2, 25)); }
  };

  useEffect(() => () => { clearInterval(timerRef.current!); clearInterval(spawnRef.current!); }, []);

  const gp = Math.min(caught * 2, 25);

  return (
    <div className="gs-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gs-modal gs-modal-harvest">
        <button className="gs-modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="gs-modal-header">
          <span className="gs-modal-emoji">🍎</span>
          <h2>Fruit Harvest</h2>
          <p>Tap fruits before they vanish! Earn up to <strong>25 GP</strong></p>
        </div>

        {phase === "idle" && (
          <div className="gs-game-idle">
            <p>Fruits appear randomly for 2 seconds each. Tap fast to harvest them! Each catch = 2 GP.</p>
            <button className="gs-game-btn primary" onClick={start}>🌿 Start Harvesting!</button>
          </div>
        )}

        {phase === "playing" && (
          <>
            <div className="gs-harvest-hud">
              <div className="gs-harvest-score">🍎 {caught} caught</div>
              <div className="gs-harvest-timer" style={{ color: timeLeft <= 5 ? "#ef4444" : undefined }}>⏱ {timeLeft}s</div>
              <div className="gs-harvest-gp">+{gp} GP</div>
            </div>
            <div className="gs-harvest-area">
              {fruits.map((f) => (
                <button key={f.id} className="gs-harvest-fruit" style={{ left: `${f.x}%`, top: `${f.y}%` }} onClick={() => catchFruit(f.id)} aria-label={`Catch ${f.emoji}`}>
                  {f.emoji}
                </button>
              ))}
            </div>
          </>
        )}

        {phase === "done" && (
          <div className="gs-game-result">
            <div className="gs-result-emoji">🎉</div>
            <h3>Time's up!</h3>
            <p>You caught <strong>{caught}</strong> fruits</p>
            <div className="gs-result-gp">+{gp} GP earned</div>
            <button className="gs-game-btn primary" onClick={handleClaim} disabled={claimed}>
              {claimed ? "✅ Reward claimed!" : "Claim Reward!"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Grow My Tree ─────────────────────────────────────────────────────────────
function GrowTreeModal({
  session, onClose, onEarn,
}: { session: GreenAuthSession; onClose: () => void; onEarn: (gp: number) => void }) {
  const [careCount, setCareCount] = useState(() => parseInt(localStorage.getItem("lc_tree_care") || "0", 10));
  const [cooldowns, setCooldowns] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem("lc_tree_cooldowns") || "{}"); } catch { return {}; }
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const now = Date.now();

  const stage = [...TREE_STAGES].reverse().find((s) => careCount >= s.min) || TREE_STAGES[0];
  const nextStage = TREE_STAGES.find((s) => s.min > careCount);

  const doAction = async (action: typeof CARE_ACTIONS[0]) => {
    if (now < (cooldowns[action.key] || 0) || busy) return;
    setBusy(action.key);
    try {
      await postSponsorGameAction(session, { game_id: "grow_tree", action: action.key, amount: action.gp });
      onEarn(action.gp);
      const nc = careCount + 1;
      const nd = { ...cooldowns, [action.key]: now + action.cooldownMs };
      setCareCount(nc); setCooldowns(nd);
      localStorage.setItem("lc_tree_care", String(nc));
      localStorage.setItem("lc_tree_cooldowns", JSON.stringify(nd));
      setMessage(`+${action.gp} GP! ${action.emoji} Your tree loves it!`);
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || "Action failed — try again.");
    }
    setBusy("");
    setTimeout(() => setMessage(""), 2500);
  };

  return (
    <div className="gs-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gs-modal gs-modal-tree">
        <button className="gs-modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="gs-modal-header">
          <span className="gs-modal-emoji">🌱</span>
          <h2>Grow My Tree</h2>
          <p>Care for your virtual tree and earn GP daily</p>
        </div>

        <div className="gs-tree-display">
          <div className="gs-tree-big-emoji">{stage.emoji}</div>
          <div className="gs-tree-stage-label">{stage.label}</div>
          <div className="gs-tree-care-count">{careCount} total care actions</div>
          {nextStage && (
            <div className="gs-tree-next">Next: {nextStage.emoji} {nextStage.label} in {nextStage.min - careCount} more care{nextStage.min - careCount !== 1 ? "s" : ""}</div>
          )}
        </div>

        <div className="gs-care-grid">
          {CARE_ACTIONS.map((action) => {
            const ready = now >= (cooldowns[action.key] || 0);
            const msLeft = ready ? 0 : (cooldowns[action.key] || 0) - now;
            const hrsLeft = Math.ceil(msLeft / 3600000);
            return (
              <button
                key={action.key}
                className={`gs-care-btn ${ready ? "ready" : "cooldown"}`}
                style={{ "--care-color": action.color } as React.CSSProperties}
                onClick={() => doAction(action)}
                disabled={!ready || !!busy}
              >
                <span className="gs-care-emoji">{action.emoji}</span>
                <span className="gs-care-label">{action.label}</span>
                <span className="gs-care-reward">
                  {ready ? `+${action.gp} GP` : `${hrsLeft}h left`}
                </span>
              </button>
            );
          })}
        </div>

        {message && <div className={`gs-game-message ${message.includes("failed") || message.includes("Error") ? "error" : "success"}`}>{message}</div>}
      </div>
    </div>
  );
}

// ─── Forest Quest ─────────────────────────────────────────────────────────────
function ForestQuestModal({
  session, onClose, onEarn,
}: { session: GreenAuthSession; onClose: () => void; onEarn: (gp: number) => void }) {
  const WEEK_KEY = `lc_quest_${getWeekKey()}`;
  const [completed, setCompleted] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(WEEK_KEY) || "[]")); } catch { return new Set(); }
  });
  const [claiming, setClaiming] = useState<string | null>(null);

  const total = QUESTS.reduce((s, q) => s + q.gp, 0);
  const earned = QUESTS.filter((q) => completed.has(q.key)).reduce((s, q) => s + q.gp, 0);
  const pct = total > 0 ? (earned / total) * 100 : 0;

  const claimQuest = async (quest: typeof QUESTS[0]) => {
    if (completed.has(quest.key) || claiming) return;
    setClaiming(quest.key);
    try {
      await postSponsorGameAction(session, { game_id: "forest_quest", action: quest.key, amount: quest.gp });
      onEarn(quest.gp);
      const next = new Set([...completed, quest.key]);
      setCompleted(next);
      localStorage.setItem(WEEK_KEY, JSON.stringify([...next]));
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Quest claim failed — try again.");
    }
    setClaiming(null);
  };

  return (
    <div className="gs-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gs-modal gs-modal-wide gs-modal-quest">
        <button className="gs-modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="gs-modal-header">
          <span className="gs-modal-emoji">🗺️</span>
          <h2>Forest Quest</h2>
          <p>Weekly missions — earn up to <strong>{total} GP</strong> this week</p>
        </div>

        <div className="gs-quest-progress-wrap">
          <div className="gs-quest-progress-bar">
            <div className="gs-quest-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="gs-quest-progress-label">{earned} / {total} GP this week</div>
        </div>

        <div className="gs-quest-list">
          {QUESTS.map((quest) => {
            const done = completed.has(quest.key);
            return (
              <div key={quest.key} className={`gs-quest-row ${done ? "done" : ""}`}>
                <div className="gs-quest-emoji">{quest.emoji}</div>
                <div className="gs-quest-body">
                  <div className="gs-quest-title">{quest.title}</div>
                  <div className="gs-quest-desc">{quest.desc}</div>
                </div>
                <div className="gs-quest-gp">+{quest.gp} GP</div>
                <button
                  className={`gs-game-btn sm ${done ? "muted" : "primary"}`}
                  onClick={() => claimQuest(quest)}
                  disabled={done || !!claiming}
                >
                  {done ? "✅" : claiming === quest.key ? "…" : "Claim"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Wildlife Collector ───────────────────────────────────────────────────────
function WildlifeModal({
  session, gpBalance, onClose, onSpend,
}: { session: GreenAuthSession; gpBalance: number; onClose: () => void; onSpend: (gp: number) => void }) {
  const OWN_KEY = "lc_wildlife_owned";
  const [owned, setOwned] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(OWN_KEY) || "[]")); } catch { return new Set(); }
  });
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [flip, setFlip] = useState<string | null>(null);

  const unlock = async (animal: typeof WILDLIFE[0]) => {
    if (owned.has(animal.id) || unlocking || gpBalance < animal.gp) return;
    setUnlocking(animal.id);
    try {
      await postSponsorGameAction(session, { game_id: "wildlife_collector", action: "unlock", amount: animal.gp, meta: { animal_id: animal.id } });
      onSpend(animal.gp);
      const next = new Set([...owned, animal.id]);
      setOwned(next);
      localStorage.setItem(OWN_KEY, JSON.stringify([...next]));
      setFlip(animal.id);
      setTimeout(() => setFlip(null), 800);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Unlock failed.");
    }
    setUnlocking(null);
  };

  return (
    <div className="gs-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gs-modal gs-modal-wide gs-modal-wildlife">
        <button className="gs-modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="gs-modal-header">
          <span className="gs-modal-emoji">🦁</span>
          <h2>Wildlife Collector</h2>
          <p>Discover and unlock rare forest animals · {owned.size} / {WILDLIFE.length} collected</p>
        </div>

        <div className="gs-wildlife-grid">
          {WILDLIFE.map((animal) => {
            const isOwned = owned.has(animal.id);
            const rc = RARITY_COLOR[animal.rarity];
            const affordable = gpBalance >= animal.gp;
            return (
              <div
                key={animal.id}
                className={`gs-animal-card ${isOwned ? "owned" : ""} ${flip === animal.id ? "flip" : ""}`}
                style={{ "--rc-bg": rc.bg, "--rc-border": rc.border, "--rc-text": rc.text } as React.CSSProperties}
              >
                <div className="gs-animal-emoji">{isOwned ? animal.emoji : "🔒"}</div>
                <div className="gs-animal-name">{isOwned ? animal.name : "???"}</div>
                <div className="gs-animal-rarity" style={{ color: rc.text }}>{animal.rarity}</div>
                {!isOwned && (
                  <button
                    className={`gs-animal-unlock-btn ${!affordable ? "broke" : ""}`}
                    onClick={() => unlock(animal)}
                    disabled={!!unlocking || !affordable}
                  >
                    {unlocking === animal.id ? "…" : `${animal.gp} GP`}
                  </button>
                )}
                {isOwned && <div className="gs-animal-owned-badge">✅ Collected</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function GreenSponsor() {
  const navigate = useNavigate();
  const [session, setSession] = useState<GreenAuthSession | null>(() => getGreenAuthSession());
  const [projects, setProjects] = useState<SponsorProject[]>([]);
  const [orders, setOrders] = useState<SponsorOrder[]>([]);
  const [trees, setTrees] = useState<SponsorTreeSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<SponsorLeaderboardData | null>(null);
  const [achievements, setAchievements] = useState<SponsorAchievements | null>(null);
  const [pointsInfo, setPointsInfo] = useState<SponsorPointsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [treeDetailLoading, setTreeDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<SponsorTabKey>(() => {
    if (typeof window === "undefined") return "projects";
    const s = window.sessionStorage.getItem(TAB_STORAGE_KEY);
    return (["projects","trees","leaderboard","grove","profile"] as SponsorTabKey[]).includes(s as SponsorTabKey) ? (s as SponsorTabKey) : "projects";
  });
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedTreeDetail, setSelectedTreeDetail] = useState<SponsorTreeDetail | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    entity_category: String(session?.user.entity_category || "individual"),
    leaderboard_visibility: String(session?.user.leaderboard_visibility || "public"),
  });
  const [orderDraft, setOrderDraft] = useState<OrderDraftState>({
    quantity: "1", dedicationType: "self", dedicationName: "", dedicationMessage: "", purchaserNote: "", acceptedTerms: false, acceptedPolicy: false,
  });

  // Grove / games state
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [schoolNomOpen, setSchoolNomOpen] = useState(false);
  const [schoolNom, setSchoolNom] = useState<SchoolNomState>({ name: "", location: "", contact: "", reason: "" });
  const [schoolNomBusy, setSchoolNomBusy] = useState(false);
  const [referralInput, setReferralInput] = useState("");
  const [referralBusy, setReferralBusy] = useState(false);

  useEffect(() => {
    if (!session || !isSponsorGreenSession(session)) navigate("/green/login/sponsor", { replace: true });
  }, [navigate, session]);

  useEffect(() => {
    if (typeof window !== "undefined") window.sessionStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  // Mark leaderboard quest when tab visited
  useEffect(() => {
    if (activeTab === "leaderboard") {
      const WEEK_KEY = `lc_quest_${getWeekKey()}`;
      try {
        const done = JSON.parse(localStorage.getItem(WEEK_KEY) || "[]");
        if (!done.includes("view_leaderboard")) {
          localStorage.setItem(WEEK_KEY, JSON.stringify([...done, "view_leaderboard"]));
        }
      } catch {}
    }
  }, [activeTab]);

  const loadOverview = useCallback(async (withSpinner = true) => {
    if (!session) return;
    if (withSpinner) setLoading(true); else setRefreshing(true);
    setError("");
    try {
      const [projectRows, orderRows, treeRows, achievementsRow, pointsRow] = await Promise.all([
        fetchPublicSponsorshipProjects(), fetchSponsorOrders(session), fetchSponsorTrees(session),
        fetchSponsorAchievements(session), fetchSponsorPoints(session),
      ]);
      setProjects(projectRows); setOrders(orderRows); setTrees(treeRows);
      setAchievements(achievementsRow); setPointsInfo(pointsRow);
      setSelectedProjectId((c) => c || projectRows.find((p) => p.sponsor_checkout_ready)?.id || projectRows[0]?.id || null);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Failed to load sponsor dashboard.";
      setError(msg); toast.error(msg);
    } finally { setLoading(false); setRefreshing(false); }
  }, [session]);

  const loadLeaderboard = useCallback(async () => {
    if (leaderboardLoading) return;
    setLeaderboardLoading(true);
    try { setLeaderboard(await fetchPublicLeaderboard()); }
    catch (err: any) { toast.error(err?.response?.data?.detail || err?.message || "Failed to load leaderboard."); }
    finally { setLeaderboardLoading(false); }
  }, [leaderboardLoading]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => { if (activeTab === "leaderboard" && !leaderboard && !leaderboardLoading) void loadLeaderboard(); }, [activeTab, leaderboard, leaderboardLoading, loadLeaderboard]);

  const featuredProject = useMemo(() => projects.find((p) => p.sponsor_checkout_ready) || projects[0] || null, [projects]);
  const selectedProject = useMemo(() => projects.find((p) => p.id === selectedProjectId) || featuredProject, [featuredProject, projects, selectedProjectId]);
  const totalSponsoredTrees = useMemo(() => {
    const a = Number(achievements?.total_trees || 0), b = Number(pointsInfo?.personal_trees_sponsored || 0);
    const c = orders.reduce((s, o) => s + Number(o.total_units || o.quantity || 0), 0);
    return Math.max(a, b, c, trees.length);
  }, [achievements, pointsInfo, orders, trees]);
  const supportedProjectCount = useMemo(() => { const ids = new Set<number>(); [...projects,...trees.map(t=>({id:t.project_id})),...orders.map(o=>({id:o.project_id}))].forEach(x => { if (x.id > 0) ids.add(x.id); }); return ids.size; }, [orders, projects, trees]);
  const annualCarbonKg = useMemo(() => { const f = trees.reduce((s, t) => s + Number(t.carbon?.annual_co2_kg || 0), 0); return f > 0 ? f : totalSponsoredTrees * 21; }, [totalSponsoredTrees, trees]);
  const recentActivity = useMemo(() => buildActivityFeed(orders, trees), [orders, trees]);
  const treePhotoUrls = useMemo(() => collectPhotoUrls(selectedTreeDetail), [selectedTreeDetail]);
  const gpBalance = Number(pointsInfo?.green_points || 0);

  const handleLogout = () => { clearGreenAuthed(); navigate("/green/login", { replace: true }); };

  const handleGameEarn = async (gp: number) => {
    setPointsInfo((prev) => prev ? { ...prev, green_points: prev.green_points + gp } : prev);
    toast.success(`🎉 +${gp} Green Points earned!`);
    try { setPointsInfo(await fetchSponsorPoints(session!)); } catch {}
  };

  const handleGameSpend = async (gp: number) => {
    setPointsInfo((prev) => prev ? { ...prev, green_points: Math.max(0, prev.green_points - gp) } : prev);
    try { setPointsInfo(await fetchSponsorPoints(session!)); } catch {}
  };

  const handleCopyReferral = async () => {
    const code = pointsInfo?.referral_code || "";
    if (!code) return;
    try { await navigator.clipboard.writeText(code); toast.success("Referral code copied!"); }
    catch { toast.success(`Your code: ${code}`); }
  };

  const handleShareReferral = async () => {
    const code = pointsInfo?.referral_code || "";
    const text = `Join me on LandCheck Green and help sponsor trees! 🌳 Use my referral code ${code} to get started. #LandCheckGreen #ClimateAction`;
    try {
      if (navigator.share) await navigator.share({ title: "LandCheck Green", text, url: "https://landcheck.online/green" });
      else { await navigator.clipboard.writeText(text); toast.success("Share text copied!"); }
    } catch {}
  };

  const handleRedeemReferral = async () => {
    const code = referralInput.trim();
    if (!code || !session) return;
    setReferralBusy(true);
    try {
      await redeemReferralCode(session, code);
      toast.success("Referral code redeemed! Points added.");
      setReferralInput("");
      try { setPointsInfo(await fetchSponsorPoints(session)); } catch {}
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || "Could not redeem referral code.");
    }
    setReferralBusy(false);
  };

  const handleSchoolNomSubmit = async () => {
    if (!session || !schoolNom.name.trim() || !schoolNom.location.trim()) { toast.error("School name and location are required."); return; }
    setSchoolNomBusy(true);
    try {
      await submitSchoolNomination(session, { school_name: schoolNom.name, school_location: schoolNom.location, contact_name: schoolNom.contact || undefined, reason: schoolNom.reason || undefined });
      toast.success("School nomination submitted! The LandCheck Green team will review it.");
      setSchoolNom({ name: "", location: "", contact: "", reason: "" });
      setSchoolNomOpen(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || "Nomination failed — try again.");
    }
    setSchoolNomBusy(false);
  };

  const handleCreateOrder = async () => {
    if (!session || !selectedProject) return;
    const quantity = Math.max(1, Number(orderDraft.quantity || 0));
    const maxPerOrder = Number(selectedProject.sponsor_max_per_order || 0);
    const slotsAvailable = Number(selectedProject.slots_available ?? selectedProject.sponsor_capacity ?? 0);
    if (!selectedProject.sponsor_checkout_ready) { toast.error("This project is not open for online sponsorship yet."); return; }
    if (!Number.isFinite(quantity) || quantity <= 0) { toast.error("Enter a valid number of trees."); return; }
    if (maxPerOrder > 0 && quantity > maxPerOrder) { toast.error(`Max ${maxPerOrder} trees per order.`); return; }
    if (slotsAvailable > 0 && quantity > slotsAvailable) { toast.error(`Only ${slotsAvailable} slots available.`); return; }
    if (!orderDraft.acceptedTerms || !orderDraft.acceptedPolicy) { toast.error("Accept the sponsor terms and privacy policy to continue."); return; }
    setCreatingOrder(true);
    try {
      const result = await createSponsorOrder(session, { project_id: selectedProject.id, quantity, dedication_type: orderDraft.dedicationType || null, dedication_name: orderDraft.dedicationName.trim() || null, dedication_message: orderDraft.dedicationMessage.trim() || null, purchaser_note: orderDraft.purchaserNote.trim() || null, payment_method: selectedProject.flutterwave_available ? "flutterwave" : "manual", accepted_terms: orderDraft.acceptedTerms, accepted_policy: orderDraft.acceptedPolicy, consent_version: SPONSOR_TERMS_VERSION });
      toast.success("Sponsor order created.");
      await loadOverview(false);
      if (result.payment_link) { window.location.href = result.payment_link; return; }
      setOrderDraft((c) => ({ ...c, quantity: "1", dedicationName: "", dedicationMessage: "", purchaserNote: "", acceptedTerms: false, acceptedPolicy: false }));
    } catch (err: any) { toast.error(err?.response?.data?.detail || err?.message || "Unable to create order."); }
    finally { setCreatingOrder(false); }
  };

  const handleRefreshPayment = async (order: SponsorOrder) => {
    if (!session || !order.order_uid) return;
    try { const r = await fetchSponsorOrderPaymentStatus(session, order.order_uid, true); setOrders((c) => c.map((o) => o.id === r.id ? r : o)); toast.success("Payment status refreshed."); }
    catch (err: any) { toast.error(err?.response?.data?.detail || err?.message || "Unable to refresh."); }
  };

  const handleOpenTreeDetail = async (tree: SponsorTreeSummary) => {
    if (!session) return;
    setActiveTab("trees"); setTreeDetailLoading(true);
    try { const d = await fetchSponsorTreeDetail(session, tree.unit_id); setSelectedTreeDetail(d); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (err: any) { toast.error(err?.response?.data?.detail || err?.message || "Unable to load tree record."); }
    finally { setTreeDetailLoading(false); }
  };

  const handleShareTree = async () => {
    if (!selectedTreeDetail) return;
    const url = buildSponsorPublicTreeStoryUrl(selectedTreeDetail.unit_uid);
    const text = [`I'm supporting a verified tree on LandCheck Green.`, `${selectedTreeDetail.project_name || "Project"} | ${selectedTreeDetail.species || "Tree"} | ${humanizeLabel(selectedTreeDetail.tree_status, "Awaiting planting")}.`, url ? `Live record: ${url}` : "", "#LandCheckGreen #ClimateAction #TreeSponsorship"].filter(Boolean).join(" ");
    try {
      if (navigator.share) await navigator.share({ title: "My LandCheck Green tree", text, url: url || undefined });
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); toast.success("Tree story copied to clipboard."); }
      else toast.success("Sharing not available on this browser.");
    } catch {}
  };

  const handleSaveProfile = async () => {
    if (!session) return;
    setSavingProfile(true);
    try {
      await updateSponsorProfileSettings(session, { entity_category: profileForm.entity_category, leaderboard_visibility: profileForm.leaderboard_visibility });
      const ns: GreenAuthSession = { ...session, user: { ...session.user, entity_category: profileForm.entity_category, leaderboard_visibility: profileForm.leaderboard_visibility } };
      setGreenAuthed(ns); setSession(ns); toast.success("Profile settings updated.");
    } catch (err: any) { toast.error(err?.response?.data?.detail || err?.message || "Unable to save profile."); }
    finally { setSavingProfile(false); }
  };

  if (!session || !isSponsorGreenSession(session)) return null;


  return (
    <div className="green-sponsor-page">
      <Toaster position="top-right" />

      {/* ─── Header ─── */}
      <header className="green-sponsor-header-card">
        <div className="green-sponsor-header-brand">
          <div className="green-sponsor-logo-tile">
            <img src={GREEN_LOGO_SRC} alt="LandCheck Green" />
          </div>
          <div className="green-sponsor-header-copy">
            <div className="green-sponsor-badge">Climate Contributor</div>
            <h1>{getSponsorGreeting()}, {getSponsorFirstName(session.user.full_name)}</h1>
            <p>See where your trees are planted, how they grow, and the impact they create.</p>
          </div>
        </div>
        <div className="green-sponsor-weather-orb">
          <GreenGlyph name={getSponsorGreetingIcon()} className="green-sponsor-weather-icon" />
        </div>
      </header>

      {/* ─── Hero Banner ─── */}
      <section className="green-sponsor-hero" style={{ backgroundImage: `linear-gradient(135deg, rgba(8,62,32,0.96), rgba(24,124,58,0.88)), url(${SPONSOR_BACKGROUND})` }}>
        <div className="green-sponsor-hero-copy">
          <div className="green-sponsor-hero-chip">
            <GreenGlyph name="leaf" className="green-sponsor-inline-icon" />
            <span>Impact Verified</span>
          </div>
          <h2>Your climate legacy starts here</h2>
          <p>Every tree you sponsor is planted, monitored, and verified with map proof, photos, and live updates.</p>
          <div className="green-sponsor-hero-stats">
            <div><span className="green-sponsor-stat-label">Trees sponsored</span><strong>{totalSponsoredTrees}</strong></div>
            <div><span className="green-sponsor-stat-label">Green Points</span><strong>{gpBalance} GP</strong></div>
          </div>
          <div className="green-sponsor-hero-actions">
            <button type="button" className="green-sponsor-primary-btn" onClick={() => setActiveTab("trees")}>View My Trees</button>
            <button type="button" className="green-sponsor-secondary-btn" onClick={() => setActiveTab("grove")}>🎮 Play Games</button>
          </div>
        </div>
        <div className="green-sponsor-hero-side">
          <div className="green-sponsor-difference-card">
            <span className="green-sponsor-difference-icon">❤</span>
            <span>You're making a real difference.</span>
          </div>
        </div>
      </section>

      {/* ─── Summary grid ─── */}
      <section className="green-sponsor-summary-grid">
        <article className="green-sponsor-panel">
          <div className="green-sponsor-panel-heading">
            <GreenGlyph name="leaf" className="green-sponsor-heading-icon" />
            <div><h3>Your Impact Journey</h3><p>Track your growth from your first tree to a verified climate footprint.</p></div>
          </div>
          {achievements && (
            <div className="gs-achievement-bar-wrap">
              <div className="gs-achievement-level-row">
                <span>{achievements.badge_emoji} {achievements.level}</span>
                {achievements.next_level && <span className="gs-achievement-next">→ {achievements.next_level}</span>}
              </div>
              <div className="gs-achievement-track"><div className="gs-achievement-fill" style={{ width: `${achievements.progress_percentage}%` }} /></div>
              {achievements.next_level_threshold && <span className="gs-achievement-hint">{totalSponsoredTrees} / {achievements.next_level_threshold} trees</span>}
            </div>
          )}
          <div className="green-sponsor-metric-list">
            <div className="green-sponsor-metric-card"><span>Trees Sponsored</span><strong>{totalSponsoredTrees}</strong></div>
            <div className="green-sponsor-metric-card"><span>Water Retained</span><strong>{totalSponsoredTrees * 120} L</strong></div>
            <div className="green-sponsor-metric-card"><span>CO₂ / year</span><strong>{annualCarbonKg.toFixed(0)} kg</strong></div>
            <div className="green-sponsor-metric-card"><span>Projects</span><strong>{supportedProjectCount}</strong></div>
          </div>
        </article>
        <article className="green-sponsor-panel">
          <div className="green-sponsor-panel-heading">
            <GreenGlyph name="spark" className="green-sponsor-heading-icon" />
            <div><h3>Recent Activity</h3><p>Latest sponsor actions, payment milestones, and tree updates.</p></div>
          </div>
          <div className="green-sponsor-activity-list">
            {recentActivity.length === 0 ? <div className="green-sponsor-empty">No activity yet — your updates will appear after your first sponsorship.</div>
              : recentActivity.map((item) => (
                <div key={item.id} className="green-sponsor-activity-item">
                  <div className="green-sponsor-activity-dot" />
                  <div><strong>{item.title}</strong><p>{item.detail}</p><span>{formatDateLabel(item.date)}</span></div>
                </div>
              ))}
          </div>
        </article>
      </section>

      {/* ─── Toolbar ─── */}
      <div className="green-sponsor-toolbar">
        <div><span className="green-sponsor-toolbar-label">Level</span><strong>{achievements?.level || "Climate Contributor"}</strong></div>
        <div><span className="green-sponsor-toolbar-label">Green Points</span><strong>{gpBalance} GP</strong></div>
        <div><span className="green-sponsor-toolbar-label">Lifetime</span><strong>{Number(pointsInfo?.lifetime_points || 0)} GP</strong></div>
        <button type="button" className="green-sponsor-secondary-btn small" onClick={() => void loadOverview(false)}>{refreshing ? "Refreshing…" : "Refresh"}</button>
      </div>

      {error && <div className="green-sponsor-banner danger">{error}</div>}
      {loading && <div className="green-sponsor-loading">Loading sponsor dashboard…</div>}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: PROJECTS
      ════════════════════════════════════════════════════════════════════════ */}
      {!loading && activeTab === "projects" && (
        <>
          <div className="green-sponsor-content-grid">
            <section className="green-sponsor-panel">
              <div className="green-sponsor-panel-heading">
                <GreenGlyph name="map" className="green-sponsor-heading-icon" />
                <div><h3>Available Projects</h3><p>Choose a project and reserve trees with secure online payment.</p></div>
              </div>
              <div className="green-sponsor-project-grid">
                {projects.length === 0 ? <div className="green-sponsor-empty">No public projects available yet.</div>
                  : projects.map((project) => {
                    const active = selectedProject?.id === project.id;
                    return (
                      <button type="button" key={`project-${project.id}`} className={`green-sponsor-project-card${active ? " active" : ""}`} onClick={() => setSelectedProjectId(project.id)}>
                        <div className="green-sponsor-project-head">
                          <h4>{project.public_sponsor_title || project.name}</h4>
                          <span className={`green-sponsor-chip ${project.sponsor_checkout_ready ? "ok" : "warning"}`}>{project.sponsor_checkout_ready ? `${Number(project.slots_available ?? 0)} open` : "Preparing"}</span>
                        </div>
                        <p>{project.public_sponsor_description || project.public_description || project.location_text || "Verified tree project"}</p>
                        <div className="green-sponsor-project-meta">
                          <span>{formatCurrencyAmount(project.sponsor_price_per_tree || 0, project.sponsor_currency || "NGN")} / tree</span>
                          <span>{project.location_text || "Location shared after planting"}</span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </section>

            <aside className="green-sponsor-panel green-sponsor-checkout-panel">
              <div className="green-sponsor-panel-heading">
                <GreenGlyph name="leaf" className="green-sponsor-heading-icon" />
                <div><h3>Secure Checkout</h3><p>Create an order then continue to the configured payment provider.</p></div>
              </div>
              {selectedProject ? (
                <>
                  <div className="green-sponsor-checkout-hero">
                    <strong>{selectedProject.public_sponsor_title || selectedProject.name}</strong>
                    <span>{selectedProject.location_text || "LandCheck Green project"}</span>
                    <div className="green-sponsor-inline-chips">
                      <span className="green-sponsor-chip ok">{formatCurrencyAmount(selectedProject.sponsor_price_per_tree || 0, selectedProject.sponsor_currency || "NGN")} / tree</span>
                      <span className={`green-sponsor-chip ${selectedProject.sponsor_checkout_ready ? "ok" : "warning"}`}>{selectedProject.sponsor_checkout_ready ? "Ready" : "Preparing"}</span>
                    </div>
                  </div>
                  <label className="green-sponsor-field"><span>Trees</span><input type="number" min="1" value={orderDraft.quantity} onChange={(e) => setOrderDraft((c) => ({ ...c, quantity: e.target.value }))} /></label>
                  <label className="green-sponsor-field"><span>Dedication type</span><select value={orderDraft.dedicationType} onChange={(e) => setOrderDraft((c) => ({ ...c, dedicationType: e.target.value }))}>{DEDICATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                  <label className="green-sponsor-field"><span>Dedication name (optional)</span><input type="text" value={orderDraft.dedicationName} onChange={(e) => setOrderDraft((c) => ({ ...c, dedicationName: e.target.value }))} placeholder="Who this sponsorship is for" /></label>
                  <label className="green-sponsor-field"><span>Dedication message (optional)</span><textarea rows={2} value={orderDraft.dedicationMessage} onChange={(e) => setOrderDraft((c) => ({ ...c, dedicationMessage: e.target.value }))} placeholder="Short dedication message" /></label>
                  <label className="green-sponsor-field"><span>Purchase note (optional)</span><textarea rows={2} value={orderDraft.purchaserNote} onChange={(e) => setOrderDraft((c) => ({ ...c, purchaserNote: e.target.value }))} placeholder="Note for the LandCheck Green team" /></label>
                  <label className="green-sponsor-check"><input type="checkbox" checked={orderDraft.acceptedTerms} onChange={(e) => setOrderDraft((c) => ({ ...c, acceptedTerms: e.target.checked }))} /><span>I agree to the <a href={buildSponsorTermsUrl()} target="_blank" rel="noreferrer">sponsor terms</a>.</span></label>
                  <label className="green-sponsor-check"><input type="checkbox" checked={orderDraft.acceptedPolicy} onChange={(e) => setOrderDraft((c) => ({ ...c, acceptedPolicy: e.target.checked }))} /><span>I agree to the <a href={buildSponsorPrivacyUrl()} target="_blank" rel="noreferrer">privacy policy</a>.</span></label>
                  <button type="button" className="green-sponsor-primary-btn full" onClick={handleCreateOrder} disabled={creatingOrder}>{creatingOrder ? "Preparing secure payment…" : "Secure Payment"}</button>
                </>
              ) : <div className="green-sponsor-empty">Select a project to open checkout.</div>}
            </aside>
          </div>

          {/* Recent Orders */}
          <section className="green-sponsor-panel">
            <div className="green-sponsor-panel-heading">
              <GreenGlyph name="spark" className="green-sponsor-heading-icon" />
              <div><h3>Recent Orders</h3><p>Payment review, status, and linked tree progress.</p></div>
            </div>
            <div className="green-sponsor-order-list">
              {orders.length === 0 ? <div className="green-sponsor-empty">No sponsor orders yet.</div>
                : orders.map((order) => (
                  <div key={`order-${order.id}`} className="green-sponsor-order-card">
                    <div className="green-sponsor-order-head">
                      <div><strong>{order.project_name || `Order #${order.order_uid || order.id}`}</strong><p>{order.quantity} tree{order.quantity === 1 ? "" : "s"} | {formatCurrencyAmount(order.amount_total, order.currency || "NGN")}</p></div>
                      <span className={`green-sponsor-chip ${toneClassForStatus(order.order_status || order.payment_status)}`}>{humanizeLabel(order.order_status || order.payment_status, "Pending")}</span>
                    </div>
                    <div className="green-sponsor-order-meta">
                      <span>Payment: {humanizeLabel(order.payment_status, "Pending")}</span>
                      <span>Linked: {Number(order.linked_units || 0)}</span>
                      <span>Awaiting: {Number(order.awaiting_tree_units || 0)}</span>
                      <span>{formatDateLabel(order.payment_verified_at || order.updated_at || order.created_at)}</span>
                    </div>
                    <div className="green-sponsor-inline-actions">
                      {order.order_uid && <button type="button" className="green-sponsor-secondary-btn small" onClick={() => void handleRefreshPayment(order)}>Refresh payment</button>}
                      {order.payment_link && <button type="button" className="green-sponsor-secondary-btn small" onClick={() => window.open(order.payment_link || "", "_blank", "noopener,noreferrer")}>Open payment link</button>}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: MY TREES
      ════════════════════════════════════════════════════════════════════════ */}
      {!loading && activeTab === "trees" && (
        <section className="green-sponsor-panel">
          <div className="green-sponsor-panel-heading">
            <GreenGlyph name="branch" className="green-sponsor-heading-icon" />
            <div><h3>My Trees</h3><p>Every sponsor-linked tree with field photos, care history, and live location.</p></div>
          </div>

          {selectedTreeDetail && (
            <div className="green-sponsor-tree-detail">
              <div className="green-sponsor-tree-banner" style={{ backgroundImage: `linear-gradient(135deg, rgba(8,62,32,0.96), rgba(24,124,58,0.82)), url(${SPONSOR_BACKGROUND})` }}>
                <div>
                  <span className={`green-sponsor-chip ${toneClassForStatus(selectedTreeDetail.sponsorship_status)}`}>{humanizeLabel(selectedTreeDetail.sponsorship_status, "Linked")}</span>
                  <h3>{selectedTreeDetail.project_tree_no ? `Your tree ${selectedTreeDetail.project_tree_no}` : "Your sponsored tree"}</h3>
                  <p>{selectedTreeDetail.project_name || "LandCheck Green project"} | {selectedTreeDetail.species || "Tree"} | {humanizeLabel(selectedTreeDetail.tree_status, "Awaiting planting")}</p>
                </div>
                <div className="green-sponsor-tree-banner-actions">
                  <button type="button" className="green-sponsor-secondary-btn" onClick={handleShareTree}>Share Story</button>
                  <button type="button" className="green-sponsor-secondary-btn" onClick={() => setSelectedTreeDetail(null)}>Back to list</button>
                </div>
              </div>

              <div className="green-sponsor-tree-detail-grid">
                <div className="green-sponsor-panel muted">
                  <h4>Climate impact</h4>
                  <div className="green-sponsor-metric-list compact">
                    <div className="green-sponsor-metric-card"><span>Current CO₂</span><strong>{Number(selectedTreeDetail.carbon?.current_co2_kg || 0).toFixed(2)} kg</strong></div>
                    <div className="green-sponsor-metric-card"><span>Annual CO₂</span><strong>{Number(selectedTreeDetail.carbon?.annual_co2_kg || 0).toFixed(2)} kg</strong></div>
                    <div className="green-sponsor-metric-card"><span>Lifetime CO₂</span><strong>{Number(selectedTreeDetail.carbon?.lifetime_co2_kg || 0).toFixed(2)} kg</strong></div>
                    <div className="green-sponsor-metric-card"><span>Height</span><strong>{selectedTreeDetail.tree_height_m ? `${selectedTreeDetail.tree_height_m} m` : "-"}</strong></div>
                  </div>
                </div>
                <div className="green-sponsor-panel muted">
                  <h4>Digital certificate</h4>
                  <p>Keep a formal record of your support with the verified certificate.</p>
                  <div className="green-sponsor-inline-actions">
                    <button type="button" className="green-sponsor-primary-btn" onClick={() => window.open(buildSponsorPublicCertificateUrl(selectedTreeDetail.unit_uid) || buildSponsorCertificateUrl(session, selectedTreeDetail.unit_id), "_blank", "noopener,noreferrer")}>Open certificate</button>
                    <button type="button" className="green-sponsor-secondary-btn" onClick={() => { const u = buildDirectionsUrl(selectedTreeDetail.lat, selectedTreeDetail.lng); if (u) window.open(u, "_blank", "noopener,noreferrer"); }}>Find My Tree</button>
                  </div>
                </div>
              </div>

              {selectedTreeDetail.lat !== null && selectedTreeDetail.lng !== null && (
                <div className="green-sponsor-panel">
                  <h4>Verified map location</h4>
                  <div className="green-sponsor-map-frame"><iframe title="Tree map" src={buildMapEmbedUrl(selectedTreeDetail.lat, selectedTreeDetail.lng)} loading="lazy" /></div>
                  <div className="green-sponsor-tree-meta-grid">
                    <div><span>Latitude</span><strong>{Number(selectedTreeDetail.lat).toFixed(6)}</strong></div>
                    <div><span>Longitude</span><strong>{Number(selectedTreeDetail.lng).toFixed(6)}</strong></div>
                  </div>
                </div>
              )}

              <div className="green-sponsor-panel">
                <h4>Photo evidence</h4>
                {treePhotoUrls.length === 0 ? <div className="green-sponsor-empty">No approved photos yet.</div>
                  : <div className="green-sponsor-photo-grid">{treePhotoUrls.map((u) => <img key={u} src={u} alt="Tree evidence" />)}</div>}
              </div>

              <div className="green-sponsor-panel">
                <h4>Care timeline</h4>
                {selectedTreeDetail.timeline.length === 0 ? <div className="green-sponsor-empty">Care history will appear after planting or maintenance updates are approved.</div>
                  : <div className="green-sponsor-timeline-list">{selectedTreeDetail.timeline.map((item) => (
                    <div key={`tl-${item.id}`} className="green-sponsor-timeline-item">
                      <div className="green-sponsor-timeline-dot" />
                      <div><strong>{humanizeLabel(item.task_type, "Field update")}</strong><p>{item.notes || item.review_notes || "Verified activity recorded."}</p><span>{humanizeLabel(item.status || item.review_state, "Recorded")} | {formatDateTimeLabel(item.reviewed_at || item.completed_at || item.submitted_at)}</span></div>
                    </div>
                  ))}</div>}
              </div>
            </div>
          )}

          {treeDetailLoading && <div className="green-sponsor-loading">Loading tree record…</div>}

          <div className="green-sponsor-tree-grid">
            {trees.length === 0 ? <div className="green-sponsor-empty">No sponsored trees linked yet.</div>
              : trees.map((tree) => (
                <button type="button" key={`tree-${tree.unit_id}`} className="green-sponsor-tree-card" onClick={() => void handleOpenTreeDetail(tree)}>
                  <div className="green-sponsor-tree-card-head">
                    <div>
                      <span className={`green-sponsor-chip ${toneClassForStatus(tree.sponsorship_status)}`}>{humanizeLabel(tree.sponsorship_status, "Linked")}</span>
                      <h4>{tree.project_tree_no ? `Tree ${tree.project_tree_no}` : tree.unit_uid || "Sponsored tree"}</h4>
                      <p>{tree.project_name || "LandCheck Green project"}</p>
                    </div>
                    <div className="green-sponsor-tree-mini-icon"><GreenGlyph name="leaf" className="green-sponsor-inline-icon" /></div>
                  </div>
                  <div className="green-sponsor-tree-card-meta">
                    <span>{tree.species || "Species pending"}</span>
                    <span>{humanizeLabel(tree.tree_status, "Awaiting planting")}</span>
                    <span>{formatDateLabel(tree.planting_date || tree.linked_at || tree.tree_created_at)}</span>
                  </div>
                </button>
              ))}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: LEADERBOARD
      ════════════════════════════════════════════════════════════════════════ */}
      {!loading && activeTab === "leaderboard" && (
        <section className="green-sponsor-panel">
          <div className="green-sponsor-panel-heading">
            <GreenGlyph name="trophy" className="green-sponsor-heading-icon" />
            <div><h3>Public Leaderboard</h3><p>Top climate contributors across the LandCheck Green community.</p></div>
          </div>
          {leaderboardLoading && <div className="green-sponsor-loading">Loading leaderboard…</div>}
          {!leaderboardLoading && leaderboard && (
            <div className="green-sponsor-leaderboard-grid">
              {[
                { key: "top_overall", label: "🏆 Top Overall" },
                { key: "top_schools", label: "🏫 Top Schools" },
                { key: "top_communities", label: "🏘️ Top Communities" },
                { key: "top_companies", label: "🏢 Top Companies" },
              ].map((section) => {
                const rows = leaderboard[section.key as keyof SponsorLeaderboardData] || [];
                return (
                  <article key={section.key} className="green-sponsor-panel muted">
                    <h4>{section.label}</h4>
                    {Array.isArray(rows) && rows.length > 0 ? rows.slice(0, 8).map((item) => (
                      <div key={`${section.key}-${item.sponsor_id}-${item.rank}`} className="green-sponsor-ranking-row">
                        <div>
                          <strong>{item.rank}. {item.display_name}</strong>
                          <span>{humanizeLabel(item.entity_category, "Supporter")} | {item.achievement_level}</span>
                        </div>
                        <div className="green-sponsor-ranking-total">{item.all_time_trees} 🌳</div>
                      </div>
                    )) : <div className="green-sponsor-empty">No entries yet.</div>}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: GROVE (GAMES + REWARDS)
      ════════════════════════════════════════════════════════════════════════ */}
      {!loading && activeTab === "grove" && (
        <div className="gs-grove-page">

          {/* GP Hero */}
          <div className="gs-gp-hero">
            <div className="gs-gp-hero-left">
              <div className="gs-gp-orb">🟢</div>
              <div>
                <div className="gs-gp-big">{gpBalance.toLocaleString()} GP</div>
                <div className="gs-gp-sub">Green Points Balance</div>
              </div>
            </div>
            <div className="gs-gp-hero-right">
              <div className="gs-gp-lifetime">{Number(pointsInfo?.lifetime_points || 0).toLocaleString()} GP lifetime</div>
              {pointsInfo?.point_booster_multiplier && Number(pointsInfo.point_booster_multiplier) > 1 && (
                <div className="gs-booster-badge">🚀 ×{pointsInfo.point_booster_multiplier} Booster · {pointsInfo.point_booster_remaining_uses} uses</div>
              )}
            </div>
          </div>

          {/* Achievement Progress */}
          {achievements && (
            <div className="gs-achievement-card">
              <div className="gs-achievement-row">
                <span className="gs-achievement-badge">{achievements.badge_emoji}</span>
                <div className="gs-achievement-info">
                  <div className="gs-achievement-name">{achievements.level}</div>
                  {achievements.next_level && <div className="gs-achievement-next-label">→ {achievements.next_level}</div>}
                </div>
                <div className="gs-achievement-pct">{Math.round(achievements.progress_percentage)}%</div>
              </div>
              <div className="gs-achievement-track-outer">
                <div className="gs-achievement-track-inner" style={{ width: `${achievements.progress_percentage}%` }} />
              </div>
              {achievements.next_level_threshold && (
                <div className="gs-achievement-count">{totalSponsoredTrees} of {achievements.next_level_threshold} trees to reach {achievements.next_level}</div>
              )}
            </div>
          )}

          {/* Referral Card */}
          <div className="gs-referral-card">
            <div className="gs-referral-left">
              <div className="gs-referral-label">🔗 Your Referral Code</div>
              <div className="gs-referral-code">{pointsInfo?.referral_code || "---"}</div>
              <div className="gs-referral-hint">Share this code. When friends join and sponsor a tree, you both earn bonus GP.</div>
            </div>
            <div className="gs-referral-actions">
              <button className="gs-referral-btn" onClick={handleCopyReferral}>Copy</button>
              <button className="gs-referral-btn primary" onClick={handleShareReferral}>Share</button>
            </div>
          </div>

          {/* Redeem a referral code */}
          <div className="gs-redeem-row">
            <input className="gs-redeem-input" type="text" placeholder="Enter a friend's referral code…" value={referralInput} onChange={(e) => setReferralInput(e.target.value)} />
            <button className="gs-redeem-btn" onClick={handleRedeemReferral} disabled={referralBusy || !referralInput.trim()}>{referralBusy ? "…" : "Redeem"}</button>
          </div>

          {/* Games Grid */}
          <h3 className="gs-section-title">🎮 Mini Games</h3>
          <div className="gs-games-grid">
            {[
              { key: "daily_spin",    emoji: "🎡", title: "Daily Spin",         desc: "Spin once per day · up to 200 GP",   web: true  },
              { key: "fruit_harvest", emoji: "🍎", title: "Fruit Harvest",      desc: "Tap fruits before they fall · 25 GP", web: true  },
              { key: "grow_tree",     emoji: "🌱", title: "Grow My Tree",        desc: "Care for your virtual tree · earn GP",web: true  },
              { key: "forest_quest",  emoji: "🗺️", title: "Forest Quest",       desc: "Weekly missions · up to 500 GP",      web: true  },
              { key: "wildlife",      emoji: "🦁", title: "Wildlife Collector",  desc: "Discover 12 rare forest animals",      web: true  },
              { key: "eco_match",     emoji: "🎮", title: "Eco-Match",           desc: "Match-3 puzzle · Android exclusive",   web: false },
              { key: "rainmaker",     emoji: "🌧️", title: "Rainmaker",          desc: "Slide clouds · Android exclusive",     web: false },
              { key: "climate",       emoji: "🌍", title: "Climate Defender",    desc: "CO₂ quiz · Android exclusive",        web: false },
            ].map((game) => (
              <button
                key={game.key}
                className={`gs-game-card ${!game.web ? "locked" : ""}`}
                onClick={() => { if (game.web) setActiveGame(game.key); }}
                disabled={!game.web}
              >
                <div className="gs-game-card-emoji">{game.emoji}</div>
                <div className="gs-game-card-title">{game.title}</div>
                <div className="gs-game-card-desc">{game.desc}</div>
                {!game.web && <div className="gs-game-android-badge">📱 Android</div>}
              </button>
            ))}
          </div>

          {/* Unlocks */}
          <h3 className="gs-section-title">🏆 Unlocked Rewards</h3>
          <div className="gs-unlocks-section">
            <div className="gs-unlock-group">
              <div className="gs-unlock-group-label">Species</div>
              <div className="gs-tag-cloud">
                {(pointsInfo?.unlocked_species || []).length === 0
                  ? <span className="gs-unlock-empty">None unlocked yet</span>
                  : (pointsInfo?.unlocked_species || []).map((s) => <span key={s} className="gs-unlock-tag green">{s}</span>)}
              </div>
            </div>
            <div className="gs-unlock-group">
              <div className="gs-unlock-group-label">Avatars</div>
              <div className="gs-tag-cloud">
                {(pointsInfo?.unlocked_avatars || []).length === 0
                  ? <span className="gs-unlock-empty">None unlocked yet</span>
                  : (pointsInfo?.unlocked_avatars || []).map((s) => <span key={s} className="gs-unlock-tag blue">{s}</span>)}
              </div>
            </div>
            <div className="gs-unlock-group">
              <div className="gs-unlock-group-label">Map Icons</div>
              <div className="gs-tag-cloud">
                {(pointsInfo?.unlocked_map_icons || []).length === 0
                  ? <span className="gs-unlock-empty">None unlocked yet</span>
                  : (pointsInfo?.unlocked_map_icons || []).map((s) => <span key={s} className="gs-unlock-tag muted">{s}</span>)}
              </div>
            </div>
          </div>

          {/* Merch */}
          <h3 className="gs-section-title">🛍️ Merch Redemption</h3>
          <div className="gs-merch-grid">
            {MERCH.map((item) => {
              const canRedeem = gpBalance >= item.gp;
              return (
                <div key={item.name} className="gs-merch-card">
                  <div className="gs-merch-emoji">{item.emoji}</div>
                  <div className="gs-merch-name">{item.name}</div>
                  <div className="gs-merch-desc">{item.desc}</div>
                  <div className="gs-merch-cost">{item.gp.toLocaleString()} GP</div>
                  <button
                    className={`gs-game-btn sm ${canRedeem ? "primary" : "muted"}`}
                    disabled={!canRedeem}
                    onClick={() => toast.success(`Merch redemption coming soon! You need ${item.gp} GP. You have ${gpBalance} GP.`)}
                  >
                    {canRedeem ? "Redeem" : `Need ${(item.gp - gpBalance).toLocaleString()} more GP`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: PROFILE
      ════════════════════════════════════════════════════════════════════════ */}
      {!loading && activeTab === "profile" && (
        <div className="green-sponsor-content-grid">
          <article className="green-sponsor-panel">
            <div className="green-sponsor-panel-heading">
              <GreenGlyph name="person" className="green-sponsor-heading-icon" />
              <div><h3>Sponsor Profile</h3><p>Your identity and account details.</p></div>
            </div>
            {/* Profile photo placeholder */}
            <div className="gs-profile-avatar">
              {pointsInfo?.profile_photo_url
                ? <img src={toDisplayPhotoUrl(pointsInfo.profile_photo_url)} alt="Profile" />
                : <div className="gs-profile-avatar-placeholder">{getSponsorFirstName(session.user.full_name).charAt(0).toUpperCase()}</div>}
            </div>
            <div className="green-sponsor-profile-grid">
              <div className="green-sponsor-profile-item"><span>Full name</span><strong>{session.user.full_name}</strong></div>
              <div className="green-sponsor-profile-item"><span>Email</span><strong>{session.user.email || "-"}</strong></div>
              <div className="green-sponsor-profile-item"><span>Phone</span><strong>{session.user.phone || "-"}</strong></div>
              <div className="green-sponsor-profile-item"><span>Account type</span><strong>{humanizeLabel(session.user.account_type, "Sponsor")}</strong></div>
              <div className="green-sponsor-profile-item"><span>Sponsor ID</span><strong>{session.user.sponsor_uid || session.user.user_uid || "-"}</strong></div>
              <div className="green-sponsor-profile-item"><span>Achievement level</span><strong>{achievements?.badge_emoji} {achievements?.level || "Climate Contributor"}</strong></div>
            </div>

            {/* Milestone quick view */}
            <div className="gs-milestone-chips">
              <span className={`green-sponsor-chip ${pointsInfo?.personal_sponsor_met ? "ok" : "neutral"}`}>Personal sponsor goal {pointsInfo?.personal_sponsor_met ? "✓" : ""}</span>
              <span className={`green-sponsor-chip ${pointsInfo?.referral_rules_met ? "ok" : "neutral"}`}>Referral rule {pointsInfo?.referral_rules_met ? "✓" : ""}</span>
              <span className={`green-sponsor-chip ${pointsInfo?.conversion_rate_met ? "ok" : "neutral"}`}>Conversion rate {pointsInfo?.conversion_rate_met ? "✓" : ""}</span>
            </div>
          </article>

          <article className="green-sponsor-panel">
            <div className="green-sponsor-panel-heading">
              <GreenGlyph name="spark" className="green-sponsor-heading-icon" />
              <div><h3>Public Identity Settings</h3><p>Control how you appear on the leaderboard and in the app.</p></div>
            </div>

            <label className="green-sponsor-field"><span>Entity category</span>
              <select value={profileForm.entity_category} onChange={(e) => setProfileForm((c) => ({ ...c, entity_category: e.target.value }))}>
                {ENTITY_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="green-sponsor-field"><span>Leaderboard visibility</span>
              <select value={profileForm.leaderboard_visibility} onChange={(e) => setProfileForm((c) => ({ ...c, leaderboard_visibility: e.target.value }))}>
                {VISIBILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>

            <div className="green-sponsor-inline-actions">
              <button type="button" className="green-sponsor-primary-btn" onClick={handleSaveProfile} disabled={savingProfile}>{savingProfile ? "Saving…" : "Save Settings"}</button>
              <button type="button" className="green-sponsor-secondary-btn" onClick={handleLogout}>Log out</button>
            </div>

            {/* School nomination */}
            <div className="gs-profile-section-divider" />
            <div className="gs-school-nom-header">
              <div>
                <strong>🏫 Nominate a School</strong>
                <p>Recommend a school for LandCheck Green's tree sponsorship programme.</p>
              </div>
              <button className="gs-game-btn sm primary" onClick={() => setSchoolNomOpen((o) => !o)}>{schoolNomOpen ? "Cancel" : "Nominate"}</button>
            </div>

            {schoolNomOpen && (
              <div className="gs-school-nom-form">
                <label className="green-sponsor-field"><span>School name *</span><input type="text" placeholder="e.g. Greenfield Academy" value={schoolNom.name} onChange={(e) => setSchoolNom((c) => ({ ...c, name: e.target.value }))} /></label>
                <label className="green-sponsor-field"><span>Location *</span><input type="text" placeholder="City, State" value={schoolNom.location} onChange={(e) => setSchoolNom((c) => ({ ...c, location: e.target.value }))} /></label>
                <label className="green-sponsor-field"><span>Contact person (optional)</span><input type="text" placeholder="Teacher or principal name" value={schoolNom.contact} onChange={(e) => setSchoolNom((c) => ({ ...c, contact: e.target.value }))} /></label>
                <label className="green-sponsor-field"><span>Reason (optional)</span><textarea rows={2} placeholder="Why should this school join?" value={schoolNom.reason} onChange={(e) => setSchoolNom((c) => ({ ...c, reason: e.target.value }))} /></label>
                <button className="gs-game-btn primary" onClick={handleSchoolNomSubmit} disabled={schoolNomBusy}>{schoolNomBusy ? "Submitting…" : "Submit Nomination"}</button>
              </div>
            )}
          </article>
        </div>
      )}

      {/* ─── Bottom navigation ─── */}
      <nav className="green-sponsor-bottom-nav">
        {[
          { key: "projects",    label: "Projects",    icon: "leaf"   },
          { key: "trees",       label: "My Trees",    icon: "branch" },
          { key: "leaderboard", label: "Leaders",     icon: "trophy" },
          { key: "grove",       label: "Grove 🎮",    icon: "spark"  },
          { key: "profile",     label: "Profile",     icon: "person" },
        ].map((tab) => (
          <button key={tab.key} type="button" className={`green-sponsor-bottom-tab${activeTab === tab.key ? " active" : ""}`} onClick={() => setActiveTab(tab.key as SponsorTabKey)}>
            <GreenGlyph name={tab.icon} className="green-sponsor-bottom-tab-icon" />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════════
          GAME MODALS
      ════════════════════════════════════════════════════════════════════════ */}
      {activeGame === "daily_spin" && session && (
        <DailySpinModal session={session} onClose={() => setActiveGame(null)} onEarn={handleGameEarn} />
      )}
      {activeGame === "fruit_harvest" && session && (
        <FruitHarvestModal session={session} onClose={() => setActiveGame(null)} onEarn={handleGameEarn} />
      )}
      {activeGame === "grow_tree" && session && (
        <GrowTreeModal session={session} onClose={() => setActiveGame(null)} onEarn={handleGameEarn} />
      )}
      {activeGame === "forest_quest" && session && (
        <ForestQuestModal session={session} onClose={() => setActiveGame(null)} onEarn={handleGameEarn} />
      )}
      {activeGame === "wildlife" && session && (
        <WildlifeModal session={session} gpBalance={gpBalance} onClose={() => setActiveGame(null)} onSpend={handleGameSpend} />
      )}
    </div>
  );
}

