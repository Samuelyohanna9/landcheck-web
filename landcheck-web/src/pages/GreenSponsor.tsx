import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
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
  formatCurrencyAmount,
  getPreferredSponsorPriceEntry,
  getSponsorPriceEntries,
  formatSponsorPriceChoices,
  postSponsorGameAction,
  redeemReferralCode,
  submitSchoolNomination,
  submitTreeComplaint,
  type SponsorAchievements,
  type SponsorLeaderboardData,
  type SponsorOrder,
  type SponsorPointsInfo,
  type SponsorProject,
  type SponsorTreeDetail,
  type SponsorTreeSummary,
  SPONSOR_TERMS_VERSION,
  updateSponsorProfileSettings,
  uploadSponsorProfilePhoto,
} from "../api/greenSponsor";
import { BACKEND_URL } from "../api/client";
import {
  clearGreenAuthed,
  getGreenAuthSession,
  isSponsorGreenSession,
  setGreenAuthed,
  type GreenAuthSession,
} from "../auth/greenAuth";
import { GreenGlyph } from "../components/GreenGlyph";
import "../styles/green-sponsor.css";

// ─── Tab & form types ─────────────────────────────────────────────────────────
type SponsorTabKey = "projects" | "trees" | "leaderboard" | "grove" | "profile";

type ProfileFormState = {
  entity_category: string;
  leaderboard_visibility: string;
};

type OrderDraftState = {
  quantity: string;
  checkoutCurrency: string;
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
const BUILT_IN_BORDERS = ["Golden Canopy Border", "Emerald Glow", "3D Pine Frame"];

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

const getAvatarBorderClass = (border: string | null | undefined): string => {
  const b = String(border || "").toLowerCase();
  if (!b) return "";
  if (b.includes("golden") || b.includes("gold") || b.includes("canopy")) return "gs-avatar--golden";
  if (b.includes("emerald")) return "gs-avatar--emerald";
  if (b.includes("pine") || b.includes("3d")) return "gs-avatar--pine3d";
  return "";
};

const getSponsorGreeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
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

// ─── SVG Glyphs ───────────────────────────────────────────────────────────────
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
    quantity: "1", checkoutCurrency: "NGN", dedicationType: "self", dedicationName: "", dedicationMessage: "", purchaserNote: "", acceptedTerms: false, acceptedPolicy: false,
  });

  const [checkoutSheetOpen, setCheckoutSheetOpen] = useState(false);

  // Grove / games state
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [schoolNomOpen, setSchoolNomOpen] = useState(false);
  const [schoolNom, setSchoolNom] = useState<SchoolNomState>({ name: "", location: "", contact: "", reason: "" });
  const [schoolNomBusy, setSchoolNomBusy] = useState(false);
  const [leaderboardCategory, setLeaderboardCategory] = useState<"top_overall" | "top_schools" | "top_communities" | "top_companies">("top_overall");
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaintType, setComplaintType] = useState("general");
  const [complaintTreeId, setComplaintTreeId] = useState("");
  const [complaintMessage, setComplaintMessage] = useState("");
  const [complaintBusy, setComplaintBusy] = useState(false);
  const [referralInput, setReferralInput] = useState("");
  const [referralBusy, setReferralBusy] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoUploadRef = useRef<HTMLInputElement>(null);
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem(`lc_sphoto_${session?.user?.id || ""}`);
    return stored || "";
  });
  const [localBorder, setLocalBorder] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(`lc_sborder_${session?.user?.id || ""}`) || null;
  });

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
  useEffect(() => {
    const preferredPrice = getPreferredSponsorPriceEntry(selectedProject, orderDraft.checkoutCurrency);
    if (preferredPrice && preferredPrice.currency !== orderDraft.checkoutCurrency) {
      setOrderDraft((current) =>
        current.checkoutCurrency === preferredPrice.currency
          ? current
          : { ...current, checkoutCurrency: preferredPrice.currency },
      );
    }
  }, [orderDraft.checkoutCurrency, selectedProject]);
  const totalSponsoredTrees = useMemo(() => {
    const a = Number(achievements?.total_trees || 0), b = Number(pointsInfo?.personal_trees_sponsored || 0);
    const c = orders.reduce((s, o) => s + Number(o.total_units || o.quantity || 0), 0);
    return Math.max(a, b, c, trees.length);
  }, [achievements, pointsInfo, orders, trees]);
  const supportedProjectCount = useMemo(() => { const ids = new Set<number>(); [...projects,...trees.map(t=>({id:t.project_id})),...orders.map(o=>({id:o.project_id}))].forEach(x => { if (x.id > 0) ids.add(x.id); }); return ids.size; }, [orders, projects, trees]);
  const annualCarbonKg = useMemo(() => { const f = trees.reduce((s, t) => s + Number(t.carbon?.annual_co2_kg || 0), 0); return f > 0 ? f : totalSponsoredTrees * 21; }, [totalSponsoredTrees, trees]);
  const selectedProjectPriceEntry = useMemo(
    () => getPreferredSponsorPriceEntry(selectedProject, orderDraft.checkoutCurrency),
    [orderDraft.checkoutCurrency, selectedProject],
  );
  const selectedProjectCheckoutTotal = useMemo(
    () => Math.max(1, Number(orderDraft.quantity || 1)) * Number(selectedProjectPriceEntry?.amount || 0),
    [orderDraft.quantity, selectedProjectPriceEntry],
  );
  const treePhotoUrls = useMemo(() => collectPhotoUrls(selectedTreeDetail), [selectedTreeDetail]);
  const gpBalance = Number(pointsInfo?.green_points || 0);
  const displayPhotoUrl = localPhotoUrl || (pointsInfo?.profile_photo_url ? toDisplayPhotoUrl(pointsInfo.profile_photo_url) : "");
  const displayBorder = localBorder ?? pointsInfo?.current_avatar_border ?? null;
  const allBorders = [...new Set([...BUILT_IN_BORDERS, ...(pointsInfo?.unlocked_avatars || [])])];

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

  const handleComplaintSubmit = async () => {
    if (!session || !complaintMessage.trim()) { toast.error("Please describe the issue before submitting."); return; }
    setComplaintBusy(true);
    try {
      await submitTreeComplaint(session, {
        complaint_type: complaintType,
        description: complaintMessage.trim(),
        tree_unit_id: complaintTreeId.trim() ? Number(complaintTreeId.trim()) : undefined,
      });
      toast.success("Report submitted. The LandCheck Green team will follow up.");
      setComplaintType("general"); setComplaintTreeId(""); setComplaintMessage(""); setComplaintOpen(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || "Could not submit report — try again.");
    }
    setComplaintBusy(false);
  };

  const handleCreateOrder = async () => {
    if (!session || !selectedProject) return;
    const quantity = Math.max(1, Number(orderDraft.quantity || 0));
    const maxPerOrder = Number(selectedProject.sponsor_max_per_order || 0);
    const slotsAvailable = Number(selectedProject.slots_available ?? selectedProject.sponsor_capacity ?? 0);
    const checkoutCurrency = selectedProjectPriceEntry?.currency || orderDraft.checkoutCurrency || "NGN";
    if (!selectedProject.sponsor_checkout_ready) { toast.error("This project is not open for online sponsorship yet."); return; }
    if (!Number.isFinite(quantity) || quantity <= 0) { toast.error("Enter a valid number of trees."); return; }
    if (maxPerOrder > 0 && quantity > maxPerOrder) { toast.error(`Max ${maxPerOrder} trees per order.`); return; }
    if (slotsAvailable > 0 && quantity > slotsAvailable) { toast.error(`Only ${slotsAvailable} slots available.`); return; }
    if (!orderDraft.acceptedTerms || !orderDraft.acceptedPolicy) { toast.error("Accept the sponsor terms and privacy policy to continue."); return; }
    setCreatingOrder(true);
    try {
      const result = await createSponsorOrder(session, { project_id: selectedProject.id, quantity, checkout_currency: checkoutCurrency, dedication_type: orderDraft.dedicationType || null, dedication_name: orderDraft.dedicationName.trim() || null, dedication_message: orderDraft.dedicationMessage.trim() || null, purchaser_note: orderDraft.purchaserNote.trim() || null, payment_method: selectedProject.flutterwave_available ? "flutterwave" : "manual", accepted_terms: orderDraft.acceptedTerms, accepted_policy: orderDraft.acceptedPolicy, consent_version: SPONSOR_TERMS_VERSION });
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

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Photo must be under 5 MB."); return; }
    setUploadingPhoto(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("File read failed"));
        reader.readAsDataURL(file);
      });
      setLocalPhotoUrl(dataUrl);
      localStorage.setItem(`lc_sphoto_${session.user.id}`, dataUrl);
      toast.success("Profile photo updated!");
      // Try backend non-blocking — ignore failure
      uploadSponsorProfilePhoto(session, file)
        .then((r) => setPointsInfo((prev) => prev ? { ...prev, profile_photo_url: r.profile_photo_url } : prev))
        .catch(() => {});
    } catch {
      toast.error("Could not read photo file.");
    } finally {
      setUploadingPhoto(false);
      if (photoUploadRef.current) photoUploadRef.current.value = "";
    }
  };

  const handleEquipBorder = (borderName: string | null) => {
    if (!session) return;
    setLocalBorder(borderName);
    if (borderName) {
      localStorage.setItem(`lc_sborder_${session.user.id}`, borderName);
    } else {
      localStorage.removeItem(`lc_sborder_${session.user.id}`);
    }
    setPointsInfo((prev) => prev ? { ...prev, current_avatar_border: borderName } : prev);
    toast.success(borderName ? `${borderName} equipped!` : "Border removed.");
    // Try backend non-blocking — ignore failure
    updateSponsorProfileSettings(session, { current_avatar_border: borderName }).catch(() => {});
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
    <div className={`green-sponsor-page${activeTab === "grove" ? " gs-grove-active" : ""}`}>
      <Toaster position="top-right" />

      {/* ─── Per-tab header (mirrors Android: each tab has its own header treatment) ─── */}
      {activeTab === "leaderboard" ? (
        <header className="green-sponsor-header-card gs-header-flat">
          <div className="gs-leaderboard-header-top">
            <span className="gs-leaderboard-badge"><GreenGlyph name="trophy" className="green-sponsor-inline-icon" />Monthly Leaderboard</span>
            {displayPhotoUrl ? (
              <div className={`gs-header-avatar sm ${getAvatarBorderClass(displayBorder)}`}>
                <img src={displayPhotoUrl} alt={getSponsorFirstName(session.user.full_name)} width="36" height="36" />
              </div>
            ) : (
              <div className="green-sponsor-logo-tile sm"><img src={GREEN_LOGO_SRC} alt="LandCheck Green" width="36" height="36" /></div>
            )}
            <button type="button" className="gs-header-refresh-btn" onClick={handleLogout} title="Log out" aria-label="Log out">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16"><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <h1>Top Sponsors</h1>
          <p>See who's leading the climate action movement this month, and where you rank.</p>
        </header>
      ) : activeTab === "grove" ? (
        <header className="gs-grove-header">
          <div className="gs-grove-header-copy">
            <h1>🌿 Grove</h1>
            <p>Play. Earn. Grow your impact.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="gs-grove-gp-pill">🌿 {gpBalance.toLocaleString()} <span>GP</span></div>
            <button type="button" className="gs-header-refresh-btn" onClick={handleLogout} title="Log out" aria-label="Log out">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16"><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </header>
      ) : (
        <header className="green-sponsor-header-card" style={{ backgroundImage: `linear-gradient(90deg, #f9fcf9 0%, rgba(249,252,249,0.88) 55%, rgba(249,252,249,0) 100%), url(${SPONSOR_BACKGROUND})` }}>
          <div className="green-sponsor-header-brand">
            {activeTab === "projects" && (
              displayPhotoUrl ? (
                <div className={`gs-header-avatar ${getAvatarBorderClass(displayBorder)}`}>
                  <img src={displayPhotoUrl} alt={getSponsorFirstName(session.user.full_name)} width="46" height="46" />
                </div>
              ) : (
                <div className="green-sponsor-logo-tile">
                  <img src={GREEN_LOGO_SRC} alt="LandCheck Green" width="46" height="46" />
                </div>
              )
            )}
            <div className="green-sponsor-header-copy">
              <div className="green-sponsor-badge">{achievements?.badge_emoji || "🌱"} {achievements?.level || "Climate Contributor"}</div>
              <h1>{getSponsorGreeting()}, {getSponsorFirstName(session.user.full_name)}</h1>
              <p>
                {activeTab === "trees"
                  ? "Trace every sponsored tree from reservation to verified planting, care, certificate, and public impact sharing."
                  : activeTab === "profile"
                    ? "Your sponsor account keeps every verified tree, payment, certificate, and impact record together."
                    : "See where your trees are planted, how they grow, and the impact they create."}
              </p>
            </div>
          </div>
          <div className="green-sponsor-header-right">
            <div className="green-sponsor-stat-pill"><GreenGlyph name="leaf" className="green-sponsor-inline-icon" />{totalSponsoredTrees} tree{totalSponsoredTrees === 1 ? "" : "s"} sponsored</div>
            <div className="green-sponsor-stat-pill"><GreenGlyph name="branch" className="green-sponsor-inline-icon" />{trees.length} live tree{trees.length === 1 ? "" : "s"}</div>
            <button
              type="button"
              className="gs-header-refresh-btn"
              onClick={() => void loadOverview(false)}
              disabled={refreshing}
              title="Refresh"
              aria-label="Refresh"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16" className={refreshing ? "gs-spin" : ""}><path d="M4 4v5h5M20 20v-5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M4.6 15a8 8 0 0 0 14.5 2.5M19.4 9a8 8 0 0 0-14.5-2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button
              type="button"
              className="gs-header-refresh-btn"
              onClick={handleLogout}
              title="Log out"
              aria-label="Log out"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16"><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </header>
      )}

      {error && <div className="green-sponsor-banner danger">{error}</div>}
      {loading && <div className="green-sponsor-loading">Loading sponsor dashboard…</div>}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: PROJECTS
      ════════════════════════════════════════════════════════════════════════ */}
      {!loading && activeTab === "projects" && (
        <>
          {/* Verified Evidence Program strip */}
          <section className="green-sponsor-panel gs-evidence-strip">
            <div className="gs-evidence-item"><GreenGlyph name="map" className="green-sponsor-heading-icon" /><span>Map proof</span></div>
            <div className="gs-evidence-item"><GreenGlyph name="camera" className="green-sponsor-heading-icon" /><span>Photo evidence</span></div>
            <div className="gs-evidence-item"><GreenGlyph name="pulse" className="green-sponsor-heading-icon" /><span>Tracked growth</span></div>
            <div className="gs-evidence-item"><GreenGlyph name="spark" className="green-sponsor-heading-icon" /><span>Live updates</span></div>
          </section>

          {/* 2 stat cards */}
          <div className="green-sponsor-metric-list" style={{ marginBottom: 4 }}>
            <div className="green-sponsor-metric-card"><span>Live Trees</span><strong>{trees.length}</strong></div>
            <div className="green-sponsor-metric-card"><span>Current Status</span><strong>{humanizeLabel(trees[0]?.sponsorship_status, "No trees yet")}</strong></div>
          </div>

          {/* Action buttons */}
          <div className="green-sponsor-hero-actions" style={{ marginBottom: 4 }}>
            <button type="button" className="green-sponsor-secondary-btn" onClick={() => setActiveTab("trees")}>
              <GreenGlyph name="branch" className="green-sponsor-inline-icon" /> View My Trees
            </button>
            <button
              type="button"
              className="green-sponsor-secondary-btn"
              disabled={!featuredProject}
              onClick={() => { if (!featuredProject) return; setSelectedProjectId(featuredProject.id); setCheckoutSheetOpen(true); }}
            >
              <GreenGlyph name="leaf" className="green-sponsor-inline-icon" /> {featuredProject ? "Sponsor More" : "Loading…"}
            </button>
          </div>

          {/* Green Points & Rewards hub */}
          <section className="green-sponsor-panel gs-points-hub">
            <div className="green-sponsor-panel-heading">
              <span className="gs-points-hub-emoji">🎁</span>
              <div><h3>Green Points &amp; Rewards</h3><p>Earn Green Points and unlock rewards as you sponsor more trees.</p></div>
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

            <div className="gs-referral-card">
              <div className="gs-referral-left">
                <div className="gs-referral-label">👥 Refer a Friend &amp; Get 25 GP</div>
                <div className="gs-referral-code">{pointsInfo?.referral_code || "---"}</div>
                <div className="gs-referral-hint">Share this code. When friends join and sponsor a tree, you both earn bonus GP.</div>
              </div>
              <div className="gs-referral-actions">
                <button className="gs-referral-btn" onClick={handleCopyReferral}>Copy</button>
                <button className="gs-referral-btn primary" onClick={handleShareReferral}>Share Link</button>
              </div>
            </div>

            <div className="gs-redeem-row">
              <input className="gs-redeem-input" type="text" placeholder="Enter a friend's referral code…" value={referralInput} onChange={(e) => setReferralInput(e.target.value)} />
              <button className="gs-redeem-btn" onClick={handleRedeemReferral} disabled={referralBusy || !referralInput.trim()}>{referralBusy ? "…" : "Apply"}</button>
            </div>

            <div className="gs-unlocks-section">
              <div className="gs-unlock-group">
                <div className="gs-unlock-group-label">Rare Tree Species (500 GP)</div>
                <div className="gs-tag-cloud">
                  {(pointsInfo?.unlocked_species || []).length === 0
                    ? <span className="gs-unlock-empty">None unlocked yet</span>
                    : (pointsInfo?.unlocked_species || []).map((s) => <span key={s} className="gs-unlock-tag green">{s}</span>)}
                </div>
              </div>
              <div className="gs-unlock-group">
                <div className="gs-unlock-group-label">Custom Avatars (200 GP)</div>
                <div className="gs-asset-list">
                  {allBorders.map((border) => {
                    const isEquipped = displayBorder === border;
                    const cls = getAvatarBorderClass(border);
                    return (
                      <div key={border} className={`gs-asset-item${isEquipped ? " equipped" : ""}`}>
                        <div className={`gs-asset-avatar-preview${cls ? ` ${cls}` : ""}`}>
                          {getSponsorFirstName(session.user.full_name).charAt(0).toUpperCase()}
                        </div>
                        <span className="gs-asset-name">{border}</span>
                        <button type="button" className={`gs-asset-equip-btn${isEquipped ? " active" : ""}`} onClick={() => handleEquipBorder(isEquipped ? null : border)}>
                          {isEquipped ? "Equipped ✓" : "Equip"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="gs-unlock-group">
                <div className="gs-unlock-group-label">Custom 3D Map Icons (150 GP)</div>
                <div className="gs-tag-cloud">
                  {(pointsInfo?.unlocked_map_icons || []).length === 0
                    ? <span className="gs-unlock-empty">None unlocked yet</span>
                    : (pointsInfo?.unlocked_map_icons || []).map((s) => <span key={s} className="gs-unlock-tag muted">{s}</span>)}
                </div>
              </div>
            </div>

            <h4 className="gs-section-title">🛍️ Merch Redemption</h4>
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
          </section>

          {/* Impact Summary */}
          <section className="green-sponsor-panel">
            <div className="green-sponsor-panel-heading">
              <GreenGlyph name="leaf" className="green-sponsor-heading-icon" />
              <div><h3>Impact Summary</h3><p>Track your growth from your first tree to a verified climate footprint.</p></div>
            </div>
            <div className="green-sponsor-metric-list">
              <div className="green-sponsor-metric-card"><span>Trees Sponsored</span><strong>{totalSponsoredTrees}</strong></div>
              <div className="green-sponsor-metric-card"><span>Live Trees</span><strong>{trees.length}</strong></div>
              <div className="green-sponsor-metric-card"><span>Water Retained</span><strong>{totalSponsoredTrees * 120} L</strong></div>
              <div className="green-sponsor-metric-card"><span>CO₂ / year</span><strong>{annualCarbonKg.toFixed(0)} kg</strong></div>
              <div className="green-sponsor-metric-card"><span>Projects</span><strong>{supportedProjectCount}</strong></div>
            </div>
          </section>

          <div className="green-sponsor-content-grid">
            <section className="green-sponsor-panel">
              <div className="green-sponsor-panel-heading">
                <GreenGlyph name="map" className="green-sponsor-heading-icon" />
                <div><h3>Sponsor Projects</h3><p>Choose a project and reserve trees with secure online payment.</p></div>
              </div>
              <div className="green-sponsor-project-grid">
                {projects.length === 0 ? <div className="green-sponsor-empty">No public projects available yet.</div>
                  : projects.map((project) => {
                    const active = selectedProject?.id === project.id;
                    return (
                      <button type="button" key={`project-${project.id}`} className={`green-sponsor-project-card${active ? " active" : ""}`} onClick={() => { setSelectedProjectId(project.id); setCheckoutSheetOpen(true); }}>
                        <div className="green-sponsor-project-head">
                          <h4>{project.public_sponsor_title || project.name}</h4>
                          <span className={`green-sponsor-chip ${project.sponsor_checkout_ready ? "ok" : "warning"}`}>{project.sponsor_checkout_ready ? `${Number(project.slots_available ?? 0)} open` : "Preparing"}</span>
                        </div>
                        <p>{project.public_sponsor_description || project.public_description || project.location_text || "Verified tree project"}</p>
                        <div className="green-sponsor-project-meta">
                          <span>{formatSponsorPriceChoices(project)}</span>
                          <span>{project.location_text || "Location shared after planting"}</span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </section>

            <aside className="green-sponsor-panel green-sponsor-checkout-panel green-sponsor-checkout-panel--desktop"
              aria-label="Checkout panel"
            >
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
                      <span className="green-sponsor-chip ok">{formatSponsorPriceChoices(selectedProject)}</span>
                      <span className={`green-sponsor-chip ${selectedProject.sponsor_checkout_ready ? "ok" : "warning"}`}>{selectedProject.sponsor_checkout_ready ? "Ready" : "Preparing"}</span>
                    </div>
                  </div>
                  <label className="green-sponsor-field"><span>Trees</span><input type="number" min="1" value={orderDraft.quantity} onChange={(e) => setOrderDraft((c) => ({ ...c, quantity: e.target.value }))} /></label>
                  {getSponsorPriceEntries(selectedProject).length > 1 ? (
                    <label className="green-sponsor-field">
                      <span>Pay in</span>
                      <select value={orderDraft.checkoutCurrency} onChange={(e) => setOrderDraft((c) => ({ ...c, checkoutCurrency: e.target.value }))}>
                        {getSponsorPriceEntries(selectedProject).map((entry) => (
                          <option key={entry.currency} value={entry.currency}>
                            {entry.currency} - {formatCurrencyAmount(entry.amount, entry.currency)} / tree
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <p className="gs-checkout-note">
                    {selectedProject.sponsor_max_per_order ? `Max ${selectedProject.sponsor_max_per_order} trees per order · ` : ""}
                    Total: {formatCurrencyAmount(selectedProjectCheckoutTotal, selectedProjectPriceEntry?.currency || orderDraft.checkoutCurrency || "NGN")}
                  </p>
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
                      <span className={`green-sponsor-chip ${toneClassForStatus(order.order_status || (order.linked_units ? "linked" : "neutral"))}`}>{humanizeLabel(order.order_status, order.linked_units ? "Active" : "In progress")}</span>
                    </div>
                    <div className="green-sponsor-order-meta">
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

          {/* Support / Complaint card */}
          <section className="green-sponsor-panel gs-support-card">
            <GreenGlyph name="help" className="green-sponsor-heading-icon" />
            <div className="gs-support-copy">
              <strong>Need Help or Have a Complaint?</strong>
              <p>Report an issue with a sponsored tree, allocation, or Green Points balance.</p>
            </div>
            <button type="button" className="green-sponsor-primary-btn" onClick={() => setComplaintOpen(true)}>
              Submit Report / Complaint
            </button>
          </section>
        </>
      )}

      {/* Complaint modal */}
      {complaintOpen && (
        <div className="gs-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setComplaintOpen(false); }}>
          <div className="gs-modal">
            <button className="gs-modal-close" onClick={() => setComplaintOpen(false)} aria-label="Close">✕</button>
            <div className="gs-modal-header">
              <span className="gs-modal-emoji">🛟</span>
              <h2>Submit a Report</h2>
              <p>Tell us what's wrong — the LandCheck Green team will review it.</p>
            </div>
            <label className="green-sponsor-field">
              <span>Type</span>
              <select value={complaintType} onChange={(e) => setComplaintType(e.target.value)}>
                <option value="general">General</option>
                <option value="allocation">Allocation issue</option>
                <option value="points">Green Points issue</option>
              </select>
            </label>
            {complaintType === "allocation" && (
              <label className="green-sponsor-field"><span>Tree ID (optional)</span><input type="text" value={complaintTreeId} onChange={(e) => setComplaintTreeId(e.target.value)} placeholder="e.g. 1024" /></label>
            )}
            <label className="green-sponsor-field"><span>Message</span><textarea rows={3} value={complaintMessage} onChange={(e) => setComplaintMessage(e.target.value)} placeholder="Describe the issue" /></label>
            <div className="green-sponsor-inline-actions">
              <button type="button" className="green-sponsor-secondary-btn" onClick={() => setComplaintOpen(false)}>Cancel</button>
              <button type="button" className="green-sponsor-primary-btn" onClick={handleComplaintSubmit} disabled={complaintBusy}>{complaintBusy ? "Submitting…" : "Submit"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: MY TREES
      ════════════════════════════════════════════════════════════════════════ */}
      {!loading && activeTab === "trees" && (
        <section className="green-sponsor-panel">
          {!selectedTreeDetail && (
            <div className="gs-story-banner" style={{ backgroundImage: `linear-gradient(0deg, rgba(255,255,255,0.92), rgba(255,255,255,0.92)), url(${SPONSOR_BACKGROUND})` }}>
              <span className="gs-story-banner-eyebrow">Your live tree portfolio</span>
              <h3>Every verified tree now has a richer story you can follow and share.</h3>
              <p>Track GPS location, photo evidence, and share-ready certificates for every tree you've sponsored.</p>
              <div className="gs-story-chip-row">
                <span className="gs-story-chip"><GreenGlyph name="camera" className="green-sponsor-inline-icon" />Evidence photos</span>
                <span className="gs-story-chip"><GreenGlyph name="map" className="green-sponsor-inline-icon" />Map direction</span>
                <span className="gs-story-chip"><GreenGlyph name="spark" className="green-sponsor-inline-icon" />Share-ready link</span>
              </div>
              <div className="green-sponsor-metric-list" style={{ marginTop: 12 }}>
                <div className="green-sponsor-metric-card"><span>Live CO₂</span><strong>{annualCarbonKg.toFixed(0)} kg</strong></div>
                <div className="green-sponsor-metric-card"><span>Verified Trees</span><strong>{trees.length}</strong></div>
              </div>
            </div>
          )}

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
                  : <div className="green-sponsor-photo-grid">{treePhotoUrls.map((u) => <img key={u} src={u} alt="Tree evidence" loading="lazy" decoding="async" />)}</div>}
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
          {/* User rank banner */}
          {leaderboard?.top_overall?.some((r) => r.sponsor_id === Number(session.user.id)) && (
            <div className="gs-rank-banner">
              {(() => {
                const mine = leaderboard.top_overall.find((r) => r.sponsor_id === Number(session.user.id))!;
                return (
                  <>
                    <div className="gs-header-avatar sm"><span className="gs-profile-avatar-placeholder" style={{ width: 36, height: 36, fontSize: 16 }}>{getSponsorFirstName(session.user.full_name).charAt(0).toUpperCase()}</span></div>
                    <div><strong>You are ranked #{mine.rank} overall!</strong><span>{mine.monthly_trees} trees this month</span></div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Segmented category tabs */}
          <div className="gs-leaderboard-tabs">
            {[
              { key: "top_overall" as const, label: "Overall" },
              { key: "top_schools" as const, label: "Schools" },
              { key: "top_communities" as const, label: "Communities" },
              { key: "top_companies" as const, label: "Companies" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`gs-leaderboard-tab${leaderboardCategory === tab.key ? " active" : ""}`}
                onClick={() => setLeaderboardCategory(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="green-sponsor-panel-heading">
            <GreenGlyph name="trophy" className="green-sponsor-heading-icon" />
            <div><h3>{humanizeLabel(leaderboardCategory.replace("top_", ""))} Rankings</h3><p>Top climate contributors across the LandCheck Green community.</p></div>
          </div>
          {leaderboardLoading && <div className="green-sponsor-loading">Loading leaderboard…</div>}
          {!leaderboardLoading && leaderboard && (() => {
            const rows = leaderboard[leaderboardCategory] || [];
            if (!Array.isArray(rows) || rows.length === 0) return <div className="green-sponsor-empty">No entries yet.</div>;
            return (
              <div className="gs-rank-list">
                {rows.slice(0, 20).map((item) => {
                  const isMe = item.sponsor_id === Number(session.user.id);
                  const rankIcon = item.rank === 1 ? "🥇" : item.rank === 2 ? "🥈" : item.rank === 3 ? "🥉" : null;
                  return (
                    <div key={`${leaderboardCategory}-${item.sponsor_id}-${item.rank}`} className={`gs-rank-row${isMe ? " me" : ""}`}>
                      <div className="gs-rank-num">{rankIcon || `#${item.rank}`}</div>
                      <div className="gs-rank-body">
                        <strong>{item.display_name}</strong>
                        <span>{humanizeLabel(item.entity_category, "Supporter")} · All-time: {item.all_time_trees} trees</span>
                      </div>
                      <div className="gs-rank-trees"><strong>{item.monthly_trees}</strong><span>Trees</span></div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: GROVE (GAMES + REWARDS)
      ════════════════════════════════════════════════════════════════════════ */}
      {!loading && activeTab === "grove" && (
        <div className="gs-grove-page">
          {/* Today's highlight — Daily Spin featured card, matching Android exactly */}
          <h3 className="gs-section-title gs-section-title--dark">TODAY'S HIGHLIGHT</h3>
          <button type="button" className="gs-featured-game-card" onClick={() => setActiveGame("daily_spin")}>
            <span className="gs-featured-game-tag">FREE DAILY</span>
            <div className="gs-featured-game-emoji">🎰</div>
            <div className="gs-featured-game-title">Daily Spin</div>
            <div className="gs-featured-game-desc">Spin once per day for up to 200 GP</div>
            <div className="gs-featured-game-cta">Play Now <span aria-hidden="true">→</span></div>
          </button>

          {/* All games — Android's exact roster/order/gradients; unimplemented slots are locked, matching mobile's own locked/"coming soon" affordance */}
          <h3 className="gs-section-title gs-section-title--dark">ALL GAMES</h3>
          <div className="gs-games-grid">
            {[
              { key: "follow_us",       emoji: "📲", title: "Follow Us",          tag: "20 GP",      gradient: ["#2563eb", "#166534"], web: false },
              { key: "grow_tree",       emoji: "🌱", title: "Grow My Tree",       tag: "FAVOURITE",  gradient: ["#2aa852", "#166534"], web: true  },
              { key: "save_forest",     emoji: "🛡️", title: "Save the Forest",    tag: "EARN GP",    gradient: ["#ef4444", "#b91c1c"], web: false },
              { key: "forest_builder",  emoji: "🌳", title: "Forest Builder",     tag: "SPEND GP",   gradient: ["#0ea5e9", "#0369a1"], web: false },
              { key: "wildlife",        emoji: "🦋", title: "Wildlife Collector", tag: "12 ANIMALS", gradient: ["#ec4899", "#9d174d"], web: true  },
              { key: "climate",         emoji: "🌍", title: "Climate Defender",   tag: "EARN GP",    gradient: ["#10b981", "#065f46"], web: false },
              { key: "fruit_harvest",   emoji: "🥭", title: "Fruit Harvest",      tag: "EARN GP",    gradient: ["#f97316", "#c2410c"], web: true  },
              { key: "school_challenge",emoji: "🏫", title: "School Challenge",   tag: "COMPETE",    gradient: ["#6366f1", "#3730a3"], web: false },
            ].map((game) => (
              <button
                key={game.key}
                className={`gs-game-card ${!game.web ? "locked" : ""}`}
                style={{ background: `linear-gradient(135deg, ${game.gradient[0]}, ${game.gradient[1]})` }}
                onClick={() => { if (game.web) setActiveGame(game.key); }}
                disabled={!game.web}
              >
                <span className="gs-game-card-tag">{game.tag}</span>
                <div className="gs-game-card-emoji">{game.emoji}</div>
                <div className="gs-game-card-title">{game.title}</div>
                {!game.web && <div className="gs-game-android-badge">📱 Android</div>}
              </button>
            ))}
          </div>

          {/* Bonus web game (no Android equivalent) — kept as an extra, not interleaved with the Android-matching grid above */}
          <h3 className="gs-section-title gs-section-title--dark">BONUS (WEB-ONLY)</h3>
          <div className="gs-games-grid">
            <button type="button" className="gs-game-card" style={{ background: "linear-gradient(135deg, #7c3aed, #4c1d95)" }} onClick={() => setActiveGame("forest_quest")}>
              <span className="gs-game-card-tag">WEEKLY MISSIONS</span>
              <div className="gs-game-card-emoji">🗺️</div>
              <div className="gs-game-card-title">Forest Quest</div>
            </button>
          </div>

          <div className="gs-grove-info-banner">
            <GreenGlyph name="help" className="green-sponsor-inline-icon" />
            <span>Sponsor real trees to earn GP · Use GP in games to grow your virtual world</span>
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
              <button
                type="button"
                className="green-sponsor-secondary-btn"
                style={{ marginLeft: "auto", flexShrink: 0 }}
                onClick={handleLogout}
              >
                Log out
              </button>
            </div>
            {/* Profile photo */}
            <div className="gs-profile-avatar">
              <div className={`gs-profile-avatar-inner ${getAvatarBorderClass(displayBorder)}`}>
                {displayPhotoUrl
                  ? <img src={displayPhotoUrl} alt="Profile" width="80" height="80" loading="lazy" />
                  : <div className="gs-profile-avatar-placeholder">{getSponsorFirstName(session.user.full_name).charAt(0).toUpperCase()}</div>}
              </div>
              <input ref={photoUploadRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} disabled={uploadingPhoto} />
              <button type="button" className="gs-photo-upload-btn" onClick={() => photoUploadRef.current?.click()} disabled={uploadingPhoto}>
                {uploadingPhoto ? "Uploading…" : (displayPhotoUrl ? "📷 Change photo" : "📷 Add profile photo")}
              </button>
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
              <GreenGlyph name="leaf" className="green-sponsor-heading-icon" />
              <div><h3>Impact Summary</h3><p>Your contribution, orders, and verified climate footprint.</p></div>
            </div>
            <div className="green-sponsor-metric-list">
              <div className="green-sponsor-metric-card"><span>Orders</span><strong>{orders.length}</strong></div>
              <div className="green-sponsor-metric-card"><span>Live Trees</span><strong>{trees.length}</strong></div>
              <div className="green-sponsor-metric-card"><span>Current CO₂</span><strong>{annualCarbonKg.toFixed(0)} kg</strong></div>
            </div>
          </article>

          <article className="green-sponsor-panel">
            <div className="green-sponsor-panel-heading">
              <GreenGlyph name="branch" className="green-sponsor-heading-icon" />
              <div><h3>Verification Updates</h3><p>Recent order and payment status changes.</p></div>
            </div>
            <div className="green-sponsor-order-list">
              {orders.length === 0 ? <div className="green-sponsor-empty">No sponsor updates yet.</div>
                : orders.slice(0, 5).map((order) => (
                  <div key={`profile-order-${order.id}`} className="green-sponsor-order-card">
                    <div className="green-sponsor-order-head">
                      <div><strong>{order.project_name || `Order #${order.order_uid || order.id}`}</strong><p>{order.quantity} tree{order.quantity === 1 ? "" : "s"} | {formatCurrencyAmount(order.amount_total, order.currency || "NGN")}</p></div>
                      <span className={`green-sponsor-chip ${toneClassForStatus(order.order_status || (order.linked_units ? "linked" : "neutral"))}`}>{humanizeLabel(order.order_status, order.linked_units ? "Active" : "In progress")}</span>
                    </div>
                    <div className="green-sponsor-order-meta"><span>{formatDateLabel(order.payment_verified_at || order.updated_at || order.created_at)}</span></div>
                  </div>
                ))}
            </div>
          </article>

          <article className="green-sponsor-panel gs-support-card">
            <GreenGlyph name="leaf" className="green-sponsor-heading-icon" />
            <div className="gs-support-copy">
              <strong>Take Climate Action</strong>
              <p>Sponsor more trees to grow your impact and Green Points balance.</p>
            </div>
            <button type="button" className="green-sponsor-primary-btn" onClick={() => setActiveTab("projects")}>Sponsor More Trees</button>
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

      {/* ─── Mobile checkout bottom sheet ─── */}
      {checkoutSheetOpen && (
        <div className="gs-checkout-backdrop" onClick={() => setCheckoutSheetOpen(false)} aria-hidden="true" />
      )}
      <div className={`gs-checkout-sheet${checkoutSheetOpen && selectedProject ? " open" : ""}`} role="dialog" aria-modal="true" aria-label="Sponsor checkout">
        <div className="gs-checkout-sheet-drag" onClick={() => setCheckoutSheetOpen(false)} />
        <div className="gs-checkout-sheet-inner">
          <div className="gs-checkout-sheet-topbar">
            <div className="gs-checkout-sheet-topbar-info">
              <strong>{selectedProject?.public_sponsor_title || selectedProject?.name || "Select a project"}</strong>
              <span>{selectedProject?.location_text || "LandCheck Green project"}</span>
            </div>
            <button type="button" className="gs-checkout-sheet-close" onClick={() => setCheckoutSheetOpen(false)} aria-label="Close">✕</button>
          </div>

          {selectedProject ? (
            <div className="gs-checkout-sheet-body">
              {/* Intro banner */}
              <div className="gs-checkout-intro-banner">
                <p className="gs-checkout-intro-eyebrow">Secure sponsorship checkout</p>
                <h3 className="gs-checkout-intro-title">Pay online, then follow real planting evidence as your trees move into the field.</h3>
                <div className="gs-checkout-intro-chips">
                  <span className="green-sponsor-chip ok">{formatSponsorPriceChoices(selectedProject)}</span>
                  <span className={`green-sponsor-chip ${selectedProject.sponsor_checkout_ready ? "ok" : "warning"}`}>{selectedProject.sponsor_checkout_ready ? "Ready" : "Preparing"}</span>
                  {selectedProject.slots_available !== null && selectedProject.slots_available !== undefined && (
                    <span className="green-sponsor-chip neutral">{selectedProject.slots_available} available</span>
                  )}
                </div>
                {selectedProject.public_sponsor_description || selectedProject.public_description ? (
                  <p className="gs-checkout-intro-desc">{selectedProject.public_sponsor_description || selectedProject.public_description}</p>
                ) : null}
              </div>

              <label className="green-sponsor-field"><span>Trees</span><input type="number" min="1" value={orderDraft.quantity} onChange={(e) => setOrderDraft((c) => ({ ...c, quantity: e.target.value }))} /></label>
              {getSponsorPriceEntries(selectedProject).length > 1 ? (
                <label className="green-sponsor-field">
                  <span>Pay in</span>
                  <select value={orderDraft.checkoutCurrency} onChange={(e) => setOrderDraft((c) => ({ ...c, checkoutCurrency: e.target.value }))}>
                    {getSponsorPriceEntries(selectedProject).map((entry) => (
                      <option key={entry.currency} value={entry.currency}>
                        {entry.currency} - {formatCurrencyAmount(entry.amount, entry.currency)} / tree
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {selectedProject.sponsor_max_per_order ? (
                <p className="gs-checkout-note">Max {selectedProject.sponsor_max_per_order} trees per order · Total: {formatCurrencyAmount(selectedProjectCheckoutTotal, selectedProjectPriceEntry?.currency || orderDraft.checkoutCurrency || "NGN")}</p>
              ) : (
                <p className="gs-checkout-note">Total: {formatCurrencyAmount(selectedProjectCheckoutTotal, selectedProjectPriceEntry?.currency || orderDraft.checkoutCurrency || "NGN")}</p>
              )}
              <label className="green-sponsor-field"><span>Dedication type</span><select value={orderDraft.dedicationType} onChange={(e) => setOrderDraft((c) => ({ ...c, dedicationType: e.target.value }))}>{DEDICATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
              <label className="green-sponsor-field"><span>Dedicated to (optional)</span><input type="text" value={orderDraft.dedicationName} onChange={(e) => setOrderDraft((c) => ({ ...c, dedicationName: e.target.value }))} placeholder="Name, family, or occasion" /></label>
              <label className="green-sponsor-field"><span>Dedication message (optional)</span><textarea rows={2} value={orderDraft.dedicationMessage} onChange={(e) => setOrderDraft((c) => ({ ...c, dedicationMessage: e.target.value }))} placeholder="Short dedication message" /></label>
              <label className="green-sponsor-field"><span>Note for team (optional)</span><textarea rows={2} value={orderDraft.purchaserNote} onChange={(e) => setOrderDraft((c) => ({ ...c, purchaserNote: e.target.value }))} placeholder="Message to the LandCheck Green team" /></label>

              <div className="gs-checkout-consent">
                <label className="green-sponsor-check"><input type="checkbox" checked={orderDraft.acceptedTerms} onChange={(e) => setOrderDraft((c) => ({ ...c, acceptedTerms: e.target.checked }))} /><span>I accept the <a href={buildSponsorTermsUrl()} target="_blank" rel="noreferrer">sponsor terms</a></span></label>
                <label className="green-sponsor-check"><input type="checkbox" checked={orderDraft.acceptedPolicy} onChange={(e) => setOrderDraft((c) => ({ ...c, acceptedPolicy: e.target.checked }))} /><span>I accept the <a href={buildSponsorPrivacyUrl()} target="_blank" rel="noreferrer">privacy policy</a></span></label>
              </div>

              <button type="button" className="green-sponsor-primary-btn full gs-checkout-pay-btn" onClick={handleCreateOrder} disabled={creatingOrder}>{creatingOrder ? "Preparing secure payment…" : "Continue to Secure Payment →"}</button>
            </div>
          ) : (
            <div className="green-sponsor-empty">Select a project above to start checkout.</div>
          )}
        </div>
      </div>

      {/* ─── Bottom navigation ─── */}
      <nav className="green-sponsor-bottom-nav">
        {[
          { key: "projects",    label: "Projects",    icon: "leaf"   },
          { key: "trees",       label: "My Trees",    icon: "branch" },
          { key: "leaderboard", label: "Leaderboard", icon: "trophy" },
          { key: "grove",       label: "Grove",       icon: "game-controller" },
          { key: "profile",     label: "Profile",     icon: "person" },
        ].map((tab) => (
          <button key={tab.key} type="button" className={`green-sponsor-bottom-tab${activeTab === tab.key ? " active" : ""}`} onClick={() => setActiveTab(tab.key as SponsorTabKey)}>
            <span className="green-sponsor-bottom-tab-icon-wrap" aria-hidden="true">
              <GreenGlyph name={tab.icon} className="green-sponsor-bottom-tab-icon" />
            </span>
            <span className="green-sponsor-bottom-tab-label">{tab.label}</span>
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
