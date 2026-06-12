import { useCallback, useEffect, useMemo, useState } from "react";
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
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatCurrencyAmount = (amount: number | null | undefined, currency = "NGN") => {
  const numeric = Number(amount || 0);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(numeric);
};

const humanizeLabel = (value: string | null | undefined, fallback = "Not available") => {
  const raw = String(value || "").trim().replace(/_/g, " ");
  if (!raw) return fallback;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeObjectKey = (value: string) => {
  let key = String(value || "").trim().replace(/^\/+/, "");
  if (!key) return "";
  for (let i = 0; i < 3; i += 1) {
    const decoded = safeDecode(key);
    if (decoded === key) break;
    key = decoded;
  }
  if (key.startsWith(`${R2_BUCKET_HINT}/`)) {
    key = key.slice(R2_BUCKET_HINT.length + 1);
  }
  return key;
};

const encodeObjectKeyForProxy = (value: string) =>
  normalizeObjectKey(value)
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(safeDecode(part)))
    .join("/");

const toDisplayPhotoUrl = (url: string | null | undefined) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.includes("/green/uploads/object/")) {
    return /^https?:\/\//i.test(raw) ? raw : `${BACKEND_URL}${raw.startsWith("/") ? raw : `/${raw}`}`;
  }

  const toProxy = (key: string) => {
    const encoded = encodeObjectKeyForProxy(key);
    return encoded ? `${BACKEND_URL}/green/uploads/object/${encoded}` : "";
  };

  if (!/^https?:\/\//i.test(raw)) {
    return toProxy(raw) || raw;
  }

  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!parts.length) return raw;
    const maybeBucket = parts[0]?.toLowerCase() === R2_BUCKET_HINT;
    const key = (maybeBucket ? parts.slice(1) : parts).join("/");
    return toProxy(key) || raw;
  } catch {
    return raw;
  }
};

const getSponsorGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const getSponsorGreetingIcon = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "sun";
  if (hour < 18) return "cloud";
  return "moon";
};

const getSponsorFirstName = (value?: string | null) => {
  const text = String(value || "").trim();
  if (!text) return "there";
  return text.split(/\s+/)[0] || text;
};

const buildDirectionsUrl = (lat?: number | null, lng?: number | null) => {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return "";
  return `https://www.google.com/maps/dir/?api=1&destination=${Number(lat)},${Number(lng)}`;
};

const buildMapEmbedUrl = (lat?: number | null, lng?: number | null) => {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return "";
  const mapLat = Number(lat);
  const mapLng = Number(lng);
  const delta = 0.02;
  const left = (mapLng - delta).toFixed(6);
  const right = (mapLng + delta).toFixed(6);
  const bottom = (mapLat - delta).toFixed(6);
  const top = (mapLat + delta).toFixed(6);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${mapLat}%2C${mapLng}`;
};

const toneClassForStatus = (value: string | null | undefined) => {
  const key = String(value || "").trim().toLowerCase();
  if (key === "paid" || key === "allocated" || key === "linked" || key === "active" || key === "alive" || key === "completed") {
    return "ok";
  }
  if (key === "awaiting_payment" || key === "pending_payment" || key === "awaiting_tree" || key === "payment_review") {
    return "warning";
  }
  if (key === "cancelled" || key === "rejected" || key === "dead" || key === "failed") {
    return "danger";
  }
  return "neutral";
};

const collectPhotoUrls = (detail: SponsorTreeDetail | null) => {
  if (!detail) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  const add = (candidate: string | null | undefined) => {
    const resolved = toDisplayPhotoUrl(candidate);
    if (!resolved || seen.has(resolved)) return;
    seen.add(resolved);
    output.push(resolved);
  };

  add(detail.photo_url);
  (detail.photo_urls || []).forEach(add);
  detail.timeline.forEach((item) => {
    add(item.photo_url);
    (item.photo_urls || []).forEach(add);
  });
  return output;
};

const buildActivityFeed = (orders: SponsorOrder[], trees: SponsorTreeSummary[]) => {
  const items: ActivityItem[] = [];
  orders.forEach((order) => {
    items.push({
      id: `order-created-${order.id}`,
      title: `${order.quantity} tree${order.quantity === 1 ? "" : "s"} reserved`,
      detail: `Order created for ${order.project_name || "your selected project"}.`,
      date: order.created_at || null,
    });
    if (String(order.payment_status || "").trim()) {
      items.push({
        id: `order-payment-${order.id}`,
        title: `Payment ${humanizeLabel(order.payment_status, "updated")}`,
        detail: `${order.project_name || "Project"} | ${formatCurrencyAmount(order.amount_total, order.currency || "NGN")}`,
        date: order.payment_verified_at || order.updated_at || order.created_at || null,
      });
    }
  });
  trees.forEach((tree) => {
    items.push({
      id: `tree-linked-${tree.unit_id}`,
      title: tree.project_tree_no ? `Tree ${tree.project_tree_no} linked` : "Sponsored tree linked",
      detail: `${tree.project_name || "LandCheck Green project"} | ${humanizeLabel(tree.tree_status, "Awaiting planting")}`,
      date: tree.linked_at || tree.tree_created_at || tree.order_created_at || null,
    });
  });
  return items
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 6);
};

function GreenGlyph({ name, className = "" }: { name: string; className?: string }) {
  switch (name) {
    case "leaf":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M19 5C12 5 7 9 5 15c2.5 1.5 5.6 1.8 8.3.6 2.8-1.2 4.9-3.8 5.7-7.2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 16c2-3 5-5.3 9-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "compass":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9.5 14.5 11 11l3.5-1.5L13 13l-3.5 1.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case "sun":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 2.8v2.2M12 19v2.2M21.2 12H19M5 12H2.8M18.3 5.7l-1.6 1.6M7.3 16.7l-1.6 1.6M18.3 18.3l-1.6-1.6M7.3 7.3 5.7 5.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "cloud":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8.2 18h8.4a4.4 4.4 0 0 0 .3-8.8 5.6 5.6 0 0 0-10.7 1.6A3.7 3.7 0 0 0 8.2 18Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "moon":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18.2 14.2A7.4 7.4 0 0 1 9.8 5.8a8.1 8.1 0 1 0 8.4 8.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "branch":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 18c2.8 0 5-2.2 5-5V6m0 7h5m-5-3h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="7" cy="18" r="2.4" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17" cy="13" r="2.4" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "trophy":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 4h8v2a4 4 0 0 1-8 0V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9 16h6M10 20h4M6 6H4a2 2 0 0 0 2 2M18 6h2a2 2 0 0 1-2 2M12 10v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "spark":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case "person":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "map":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
  }
}

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
    const stored = window.sessionStorage.getItem(TAB_STORAGE_KEY);
    return stored === "trees" || stored === "leaderboard" || stored === "grove" || stored === "profile" ? stored : "projects";
  });
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedTreeDetail, setSelectedTreeDetail] = useState<SponsorTreeDetail | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    entity_category: String(session?.user.entity_category || "individual"),
    leaderboard_visibility: String(session?.user.leaderboard_visibility || "public"),
  });
  const [orderDraft, setOrderDraft] = useState<OrderDraftState>({
    quantity: "1",
    dedicationType: "self",
    dedicationName: "",
    dedicationMessage: "",
    purchaserNote: "",
    acceptedTerms: false,
    acceptedPolicy: false,
  });

  useEffect(() => {
    if (!session || !isSponsorGreenSession(session)) {
      navigate("/green/login/sponsor", { replace: true });
    }
  }, [navigate, session]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  const loadOverview = useCallback(
    async (withSpinner = true) => {
      if (!session) return;
      if (withSpinner) setLoading(true);
      setRefreshing(!withSpinner);
      setError("");
      try {
        const [projectRows, orderRows, treeRows, achievementsRow, pointsRow] = await Promise.all([
          fetchPublicSponsorshipProjects(),
          fetchSponsorOrders(session),
          fetchSponsorTrees(session),
          fetchSponsorAchievements(session),
          fetchSponsorPoints(session),
        ]);
        setProjects(projectRows);
        setOrders(orderRows);
        setTrees(treeRows);
        setAchievements(achievementsRow);
        setPointsInfo(pointsRow);
        setSelectedProjectId((current) => current || projectRows.find((item) => item.sponsor_checkout_ready)?.id || projectRows[0]?.id || null);
      } catch (err: any) {
        const message = err?.response?.data?.detail || err?.message || "Failed to load sponsor dashboard.";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session],
  );

  const loadLeaderboard = useCallback(async () => {
    if (leaderboardLoading) return;
    setLeaderboardLoading(true);
    try {
      const rows = await fetchPublicLeaderboard();
      setLeaderboard(rows);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "Failed to load leaderboard.");
    } finally {
      setLeaderboardLoading(false);
    }
  }, [leaderboardLoading]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (activeTab === "leaderboard" && !leaderboard && !leaderboardLoading) {
      void loadLeaderboard();
    }
  }, [activeTab, leaderboard, leaderboardLoading, loadLeaderboard]);

  const featuredProject = useMemo(
    () => projects.find((item) => item.sponsor_checkout_ready) || projects[0] || null,
    [projects],
  );

  const selectedProject = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) || featuredProject,
    [featuredProject, projects, selectedProjectId],
  );

  const totalSponsoredTrees = useMemo(() => {
    const fromAchievements = Number(achievements?.total_trees || 0);
    const fromPoints = Number(pointsInfo?.personal_trees_sponsored || 0);
    const fromOrders = orders.reduce((sum, order) => sum + Number(order.total_units || order.quantity || 0), 0);
    const fromTrees = trees.length;
    return Math.max(fromAchievements, fromPoints, fromOrders, fromTrees);
  }, [achievements?.total_trees, orders, pointsInfo?.personal_trees_sponsored, trees.length]);

  const supportedProjectCount = useMemo(() => {
    const ids = new Set<number>();
    projects.forEach((item) => {
      if (item.id > 0) ids.add(item.id);
    });
    trees.forEach((item) => {
      if (item.project_id > 0) ids.add(item.project_id);
    });
    orders.forEach((item) => {
      if (item.project_id > 0) ids.add(item.project_id);
    });
    return ids.size;
  }, [orders, projects, trees]);

  const annualCarbonKg = useMemo(() => {
    const fromTrees = trees.reduce((sum, item) => sum + Number(item.carbon?.annual_co2_kg || 0), 0);
    return fromTrees > 0 ? fromTrees : totalSponsoredTrees * 21;
  }, [totalSponsoredTrees, trees]);

  const latestOrder = useMemo(() => {
    const rows = [...orders];
    rows.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
    return rows[0] || null;
  }, [orders]);

  const recentActivity = useMemo(() => buildActivityFeed(orders, trees), [orders, trees]);
  const treePhotoUrls = useMemo(() => collectPhotoUrls(selectedTreeDetail), [selectedTreeDetail]);

  const handleLogout = () => {
    clearGreenAuthed();
    navigate("/green/login", { replace: true });
  };

  const handleCreateOrder = async () => {
    if (!session || !selectedProject) return;
    const quantity = Math.max(1, Number(orderDraft.quantity || 0));
    const maxPerOrder = Number(selectedProject.sponsor_max_per_order || 0);
    const slotsAvailable = Number(selectedProject.slots_available ?? selectedProject.sponsor_capacity ?? 0);
    if (!selectedProject.sponsor_checkout_ready) {
      toast.error("This project is not open for online sponsorship yet.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Enter a valid number of trees to sponsor.");
      return;
    }
    if (maxPerOrder > 0 && quantity > maxPerOrder) {
      toast.error(`This project allows a maximum of ${maxPerOrder} trees per order.`);
      return;
    }
    if (slotsAvailable > 0 && quantity > slotsAvailable) {
      toast.error(`Only ${slotsAvailable} sponsor slots are currently available in this project.`);
      return;
    }
    if (!orderDraft.acceptedTerms || !orderDraft.acceptedPolicy) {
      toast.error("You must accept the sponsor terms and privacy policy before continuing.");
      return;
    }
    setCreatingOrder(true);
    try {
      const result = await createSponsorOrder(session, {
        project_id: selectedProject.id,
        quantity,
        dedication_type: orderDraft.dedicationType || null,
        dedication_name: orderDraft.dedicationName.trim() || null,
        dedication_message: orderDraft.dedicationMessage.trim() || null,
        purchaser_note: orderDraft.purchaserNote.trim() || null,
        payment_method: selectedProject.flutterwave_available ? "flutterwave" : "manual",
        accepted_terms: orderDraft.acceptedTerms,
        accepted_policy: orderDraft.acceptedPolicy,
        consent_version: SPONSOR_TERMS_VERSION,
      });
      toast.success("Sponsor order created.");
      await loadOverview(false);
      if (result.payment_link) {
        window.location.href = result.payment_link;
        return;
      }
      setOrderDraft((current) => ({
        ...current,
        quantity: "1",
        dedicationName: "",
        dedicationMessage: "",
        purchaserNote: "",
        acceptedTerms: false,
        acceptedPolicy: false,
      }));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "Unable to create sponsor order.");
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleRefreshPayment = async (order: SponsorOrder) => {
    if (!session || !order.order_uid) return;
    try {
      const refreshed = await fetchSponsorOrderPaymentStatus(session, order.order_uid, true);
      setOrders((current) => current.map((item) => (item.id === refreshed.id ? refreshed : item)));
      toast.success("Payment status refreshed.");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "Unable to refresh payment status.");
    }
  };

  const handleOpenTreeDetail = async (tree: SponsorTreeSummary) => {
    if (!session) return;
    setActiveTab("trees");
    setTreeDetailLoading(true);
    try {
      const detail = await fetchSponsorTreeDetail(session, tree.unit_id);
      setSelectedTreeDetail(detail);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "Unable to load tree record.");
    } finally {
      setTreeDetailLoading(false);
    }
  };

  const handleShareTree = async () => {
    if (!selectedTreeDetail) return;
    const publicStoryUrl = buildSponsorPublicTreeStoryUrl(selectedTreeDetail.unit_uid);
    const shareText = [
      `I am supporting a verified tree on LandCheck Green.`,
      `${selectedTreeDetail.project_name || "Project"} | ${selectedTreeDetail.species || "Tree"} | ${humanizeLabel(selectedTreeDetail.tree_status, "Awaiting planting")}.`,
      publicStoryUrl ? `Follow the live record here: ${publicStoryUrl}` : "",
      "#LandCheckGreen #ClimateAction #TreeSponsorship",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      if (navigator.share) {
        await navigator.share({
          title: "My LandCheck Green tree",
          text: shareText,
          url: publicStoryUrl || undefined,
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        toast.success("Tree story copied to your clipboard.");
      } else {
        toast.success("Sharing is not available on this browser yet.");
      }
    } catch {
      toast.error("Share cancelled.");
    }
  };

  const handleSaveProfile = async () => {
    if (!session) return;
    setSavingProfile(true);
    try {
      await updateSponsorProfileSettings(session, {
        entity_category: profileForm.entity_category,
        leaderboard_visibility: profileForm.leaderboard_visibility,
      });
      const nextSession: GreenAuthSession = {
        ...session,
        user: {
          ...session.user,
          entity_category: profileForm.entity_category,
          leaderboard_visibility: profileForm.leaderboard_visibility,
        },
      };
      setGreenAuthed(nextSession);
      setSession(nextSession);
      toast.success("Profile settings updated.");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "Unable to save sponsor profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  if (!session || !isSponsorGreenSession(session)) return null;

  return (
    <div className="green-sponsor-page">
      <Toaster position="top-right" />

      <header className="green-sponsor-header-card">
        <div className="green-sponsor-header-brand">
          <div className="green-sponsor-logo-tile">
            <img src={GREEN_LOGO_SRC} alt="LandCheck Green" />
          </div>
          <div className="green-sponsor-header-copy">
            <div className="green-sponsor-badge">Climate Contributor</div>
            <h1>
              {getSponsorGreeting()}, {getSponsorFirstName(session.user.full_name)}
            </h1>
            <p>See where your trees are planted, how they are growing, and the impact they create.</p>
          </div>
        </div>
        <div className="green-sponsor-weather-orb">
          <GreenGlyph name={getSponsorGreetingIcon()} className="green-sponsor-weather-icon" />
        </div>
      </header>

      <section className="green-sponsor-hero" style={{ backgroundImage: `linear-gradient(135deg, rgba(8,62,32,0.96), rgba(24,124,58,0.88)), url(${SPONSOR_BACKGROUND})` }}>
        <div className="green-sponsor-hero-copy">
          <div className="green-sponsor-hero-chip">
            <GreenGlyph name="leaf" className="green-sponsor-inline-icon" />
            <span>Impact Verified</span>
          </div>
          <h2>Your climate legacy starts here</h2>
          <p>Every tree you sponsor is planted, monitored, and verified by field teams with map proof, photos, and live updates.</p>
          <div className="green-sponsor-hero-stats">
            <div>
              <span className="green-sponsor-stat-label">Trees sponsored</span>
              <strong>{totalSponsoredTrees}</strong>
            </div>
            <div>
              <span className="green-sponsor-stat-label">Status</span>
              <strong>{latestOrder ? humanizeLabel(latestOrder.order_status || latestOrder.payment_status, "No orders yet") : "No orders yet"}</strong>
            </div>
          </div>
          <div className="green-sponsor-hero-actions">
            <button type="button" className="green-sponsor-primary-btn" onClick={() => setActiveTab("trees")}>
              View My Trees
            </button>
            <button type="button" className="green-sponsor-secondary-btn" onClick={() => setActiveTab("projects")}>
              Sponsor More Trees
            </button>
          </div>
        </div>
        <div className="green-sponsor-hero-side">
          <div className="green-sponsor-difference-card">
            <span className="green-sponsor-difference-icon">❤</span>
            <span>You're making a real difference.</span>
          </div>
        </div>
      </section>

      <section className="green-sponsor-summary-grid">
        <article className="green-sponsor-panel">
          <div className="green-sponsor-panel-heading">
            <GreenGlyph name="leaf" className="green-sponsor-heading-icon" />
            <div>
              <h3>Your Impact Journey</h3>
              <p>Track your growth from your first sponsored tree to a verified climate footprint.</p>
            </div>
          </div>
          <div className="green-sponsor-metric-list">
            <div className="green-sponsor-metric-card">
              <span>Trees Sponsored</span>
              <strong>{totalSponsoredTrees}</strong>
            </div>
            <div className="green-sponsor-metric-card">
              <span>Estimated Water Retained</span>
              <strong>{totalSponsoredTrees * 120} L</strong>
            </div>
            <div className="green-sponsor-metric-card">
              <span>CO2 Expected To Absorb</span>
              <strong>{annualCarbonKg.toFixed(0)} kg / year</strong>
            </div>
            <div className="green-sponsor-metric-card">
              <span>Projects Supported</span>
              <strong>{supportedProjectCount}</strong>
            </div>
          </div>
        </article>

        <article className="green-sponsor-panel">
          <div className="green-sponsor-panel-heading">
            <GreenGlyph name="spark" className="green-sponsor-heading-icon" />
            <div>
              <h3>Recent Activity</h3>
              <p>Your latest sponsor actions, payment milestones, and tree link updates.</p>
            </div>
          </div>
          <div className="green-sponsor-activity-list">
            {recentActivity.length === 0 ? (
              <div className="green-sponsor-empty">No sponsor activity yet. Your updates will appear here after your first sponsorship.</div>
            ) : (
              recentActivity.map((item) => (
                <div key={item.id} className="green-sponsor-activity-item">
                  <div className="green-sponsor-activity-dot" />
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                    <span>{formatDateLabel(item.date)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <div className="green-sponsor-toolbar">
        <div>
          <span className="green-sponsor-toolbar-label">Current level</span>
          <strong>{achievements?.level || "Level 0: Climate Contributor"}</strong>
        </div>
        <div>
          <span className="green-sponsor-toolbar-label">Green Points</span>
          <strong>{Number(pointsInfo?.green_points || 0)} GP</strong>
        </div>
        <div>
          <span className="green-sponsor-toolbar-label">Lifetime Points</span>
          <strong>{Number(pointsInfo?.lifetime_points || 0)} GP</strong>
        </div>
        <button type="button" className="green-sponsor-secondary-btn small" onClick={() => void loadOverview(false)}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? <div className="green-sponsor-banner danger">{error}</div> : null}
      {loading ? <div className="green-sponsor-loading">Loading sponsor dashboard...</div> : null}

      {!loading && activeTab === "projects" ? (
        <div className="green-sponsor-content-grid">
          <section className="green-sponsor-panel">
            <div className="green-sponsor-panel-heading">
              <GreenGlyph name="map" className="green-sponsor-heading-icon" />
              <div>
                <h3>Available Projects</h3>
                <p>Choose any public LandCheck Green project and reserve trees with secure online payment.</p>
              </div>
            </div>
            <div className="green-sponsor-project-grid">
              {projects.length === 0 ? (
                <div className="green-sponsor-empty">No public sponsor projects are available yet.</div>
              ) : (
                projects.map((project) => {
                  const active = selectedProject?.id === project.id;
                  return (
                    <button
                      type="button"
                      key={`public-project-${project.id}`}
                      className={`green-sponsor-project-card${active ? " active" : ""}`}
                      onClick={() => setSelectedProjectId(project.id)}
                    >
                      <div className="green-sponsor-project-head">
                        <h4>{project.public_sponsor_title || project.name}</h4>
                        <span className={`green-sponsor-chip ${project.sponsor_checkout_ready ? "ok" : "warning"}`}>
                          {project.sponsor_checkout_ready
                            ? `${Number(project.slots_available ?? 0)} trees open`
                            : "Preparing launch"}
                        </span>
                      </div>
                      <p>{project.public_sponsor_description || project.public_description || project.location_text || "Verified tree project"}</p>
                      <div className="green-sponsor-project-meta">
                        <span>{formatCurrencyAmount(project.sponsor_price_per_tree || 0, project.sponsor_currency || "NGN")} / tree</span>
                        <span>{project.location_text || "Location shared after planting"}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <aside className="green-sponsor-panel green-sponsor-checkout-panel">
            <div className="green-sponsor-panel-heading">
              <GreenGlyph name="leaf" className="green-sponsor-heading-icon" />
              <div>
                <h3>Secure Sponsor Checkout</h3>
                <p>Create an order first, then continue to Flutterwave or the configured project payment method.</p>
              </div>
            </div>

            {selectedProject ? (
              <>
                <div className="green-sponsor-checkout-hero">
                  <strong>{selectedProject.public_sponsor_title || selectedProject.name}</strong>
                  <span>{selectedProject.location_text || "LandCheck Green project"}</span>
                  <div className="green-sponsor-inline-chips">
                    <span className="green-sponsor-chip ok">
                      {formatCurrencyAmount(selectedProject.sponsor_price_per_tree || 0, selectedProject.sponsor_currency || "NGN")} / tree
                    </span>
                    <span className={`green-sponsor-chip ${selectedProject.sponsor_checkout_ready ? "ok" : "warning"}`}>
                      {selectedProject.sponsor_checkout_ready ? "Checkout ready" : "Preparing launch"}
                    </span>
                  </div>
                </div>

                <label className="green-sponsor-field">
                  <span>Number of trees</span>
                  <input
                    type="number"
                    min="1"
                    value={orderDraft.quantity}
                    onChange={(event) => setOrderDraft((current) => ({ ...current, quantity: event.target.value }))}
                  />
                </label>

                <label className="green-sponsor-field">
                  <span>Dedication type</span>
                  <select
                    value={orderDraft.dedicationType}
                    onChange={(event) => setOrderDraft((current) => ({ ...current, dedicationType: event.target.value }))}
                  >
                    {DEDICATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="green-sponsor-field">
                  <span>Dedication name (optional)</span>
                  <input
                    type="text"
                    value={orderDraft.dedicationName}
                    onChange={(event) => setOrderDraft((current) => ({ ...current, dedicationName: event.target.value }))}
                    placeholder="Who this sponsorship is for"
                  />
                </label>

                <label className="green-sponsor-field">
                  <span>Dedication message (optional)</span>
                  <textarea
                    rows={3}
                    value={orderDraft.dedicationMessage}
                    onChange={(event) => setOrderDraft((current) => ({ ...current, dedicationMessage: event.target.value }))}
                    placeholder="Add a short dedication message"
                  />
                </label>

                <label className="green-sponsor-field">
                  <span>Purchase note (optional)</span>
                  <textarea
                    rows={3}
                    value={orderDraft.purchaserNote}
                    onChange={(event) => setOrderDraft((current) => ({ ...current, purchaserNote: event.target.value }))}
                    placeholder="Any note for the LandCheck Green team"
                  />
                </label>

                <label className="green-sponsor-check">
                  <input
                    type="checkbox"
                    checked={orderDraft.acceptedTerms}
                    onChange={(event) => setOrderDraft((current) => ({ ...current, acceptedTerms: event.target.checked }))}
                  />
                  <span>
                    I agree to the <a href={buildSponsorTermsUrl()} target="_blank" rel="noreferrer">sponsor terms</a>.
                  </span>
                </label>

                <label className="green-sponsor-check">
                  <input
                    type="checkbox"
                    checked={orderDraft.acceptedPolicy}
                    onChange={(event) => setOrderDraft((current) => ({ ...current, acceptedPolicy: event.target.checked }))}
                  />
                  <span>
                    I agree to the <a href={buildSponsorPrivacyUrl()} target="_blank" rel="noreferrer">privacy policy</a>.
                  </span>
                </label>

                <button type="button" className="green-sponsor-primary-btn full" onClick={handleCreateOrder} disabled={creatingOrder}>
                  {creatingOrder ? "Preparing secure payment..." : "Secure Payment"}
                </button>
              </>
            ) : (
              <div className="green-sponsor-empty">Select a project to open sponsor checkout.</div>
            )}
          </aside>
        </div>
      ) : null}

      {!loading && activeTab === "trees" ? (
        <section className="green-sponsor-panel">
          <div className="green-sponsor-panel-heading">
            <GreenGlyph name="branch" className="green-sponsor-heading-icon" />
            <div>
              <h3>My Trees</h3>
              <p>See every sponsor-linked tree, approved field photos, verified care history, and live map location.</p>
            </div>
          </div>

          {selectedTreeDetail ? (
            <div className="green-sponsor-tree-detail">
              <div className="green-sponsor-tree-banner" style={{ backgroundImage: `linear-gradient(135deg, rgba(8,62,32,0.96), rgba(24,124,58,0.82)), url(${SPONSOR_BACKGROUND})` }}>
                <div>
                  <span className={`green-sponsor-chip ${toneClassForStatus(selectedTreeDetail.sponsorship_status)}`}>
                    {humanizeLabel(selectedTreeDetail.sponsorship_status, "Linked")}
                  </span>
                  <h3>{selectedTreeDetail.project_tree_no ? `Your tree ${selectedTreeDetail.project_tree_no}` : "Your sponsored tree"}</h3>
                  <p>
                    {selectedTreeDetail.project_name || "LandCheck Green project"} | {selectedTreeDetail.species || "Tree"} |{" "}
                    {humanizeLabel(selectedTreeDetail.tree_status, "Awaiting planting")}
                  </p>
                </div>
                <div className="green-sponsor-tree-banner-actions">
                  <button type="button" className="green-sponsor-secondary-btn" onClick={handleShareTree}>
                    Share Story
                  </button>
                  <button type="button" className="green-sponsor-secondary-btn" onClick={() => setSelectedTreeDetail(null)}>
                    Back to list
                  </button>
                </div>
              </div>

              <div className="green-sponsor-tree-detail-grid">
                <div className="green-sponsor-panel muted">
                  <h4>Climate impact</h4>
                  <div className="green-sponsor-metric-list compact">
                    <div className="green-sponsor-metric-card">
                      <span>Current CO2</span>
                      <strong>{Number(selectedTreeDetail.carbon?.current_co2_kg || 0).toFixed(2)} kg</strong>
                    </div>
                    <div className="green-sponsor-metric-card">
                      <span>Annual CO2</span>
                      <strong>{Number(selectedTreeDetail.carbon?.annual_co2_kg || 0).toFixed(2)} kg</strong>
                    </div>
                    <div className="green-sponsor-metric-card">
                      <span>Lifetime CO2</span>
                      <strong>{Number(selectedTreeDetail.carbon?.lifetime_co2_kg || 0).toFixed(2)} kg</strong>
                    </div>
                    <div className="green-sponsor-metric-card">
                      <span>Tree height</span>
                      <strong>{selectedTreeDetail.tree_height_m ? `${selectedTreeDetail.tree_height_m} m` : "-"}</strong>
                    </div>
                  </div>
                </div>

                <div className="green-sponsor-panel muted">
                  <h4>Digital certificate</h4>
                  <p>Keep a formal record of your support with the verified certificate and public story page for this tree.</p>
                  <div className="green-sponsor-inline-actions">
                    <button
                      type="button"
                      className="green-sponsor-primary-btn"
                      onClick={() =>
                        window.open(
                          buildSponsorPublicCertificateUrl(selectedTreeDetail.unit_uid) ||
                            buildSponsorCertificateUrl(session, selectedTreeDetail.unit_id),
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      Open certificate
                    </button>
                    <button
                      type="button"
                      className="green-sponsor-secondary-btn"
                      onClick={() => {
                        const directionsUrl = buildDirectionsUrl(selectedTreeDetail.lat, selectedTreeDetail.lng);
                        if (directionsUrl) window.open(directionsUrl, "_blank", "noopener,noreferrer");
                      }}
                    >
                      Find My Trees
                    </button>
                  </div>
                </div>
              </div>

              {selectedTreeDetail.lat !== null && selectedTreeDetail.lng !== null ? (
                <div className="green-sponsor-panel">
                  <h4>Verified map location</h4>
                  <p>This is the approved field location for the tree linked to your sponsorship.</p>
                  <div className="green-sponsor-map-frame">
                    <iframe
                      title="Verified tree map"
                      src={buildMapEmbedUrl(selectedTreeDetail.lat, selectedTreeDetail.lng)}
                      loading="lazy"
                    />
                  </div>
                  <div className="green-sponsor-tree-meta-grid">
                    <div>
                      <span>Latitude</span>
                      <strong>{Number(selectedTreeDetail.lat).toFixed(6)}</strong>
                    </div>
                    <div>
                      <span>Longitude</span>
                      <strong>{Number(selectedTreeDetail.lng).toFixed(6)}</strong>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="green-sponsor-panel">
                <h4>Photo evidence</h4>
                <p>Approved field photos for the tree you are supporting.</p>
                {treePhotoUrls.length === 0 ? (
                  <div className="green-sponsor-empty">No approved field photos are available yet for this tree.</div>
                ) : (
                  <div className="green-sponsor-photo-grid">
                    {treePhotoUrls.map((photoUrl) => (
                      <img key={photoUrl} src={photoUrl} alt="Tree field evidence" />
                    ))}
                  </div>
                )}
              </div>

              <div className="green-sponsor-panel">
                <h4>Care timeline</h4>
                {selectedTreeDetail.timeline.length === 0 ? (
                  <div className="green-sponsor-empty">Care history will appear here after planting or maintenance updates are approved.</div>
                ) : (
                  <div className="green-sponsor-timeline-list">
                    {selectedTreeDetail.timeline.map((item) => (
                      <div key={`tree-timeline-${item.id}`} className="green-sponsor-timeline-item">
                        <div className="green-sponsor-timeline-dot" />
                        <div>
                          <strong>{humanizeLabel(item.task_type, "Field update")}</strong>
                          <p>{item.notes || item.review_notes || "Verified activity recorded for this tree."}</p>
                          <span>
                            {humanizeLabel(item.status || item.review_state, "Recorded")} | {formatDateTimeLabel(item.reviewed_at || item.completed_at || item.submitted_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {treeDetailLoading ? <div className="green-sponsor-loading">Loading tree record...</div> : null}

          <div className="green-sponsor-tree-grid">
            {trees.length === 0 ? (
              <div className="green-sponsor-empty">No sponsored trees have been linked to your account yet.</div>
            ) : (
              trees.map((tree) => (
                <button
                  type="button"
                  key={`tree-card-${tree.unit_id}`}
                  className="green-sponsor-tree-card"
                  onClick={() => void handleOpenTreeDetail(tree)}
                >
                  <div className="green-sponsor-tree-card-head">
                    <div>
                      <span className={`green-sponsor-chip ${toneClassForStatus(tree.sponsorship_status)}`}>
                        {humanizeLabel(tree.sponsorship_status, "Linked")}
                      </span>
                      <h4>{tree.project_tree_no ? `Tree ${tree.project_tree_no}` : tree.unit_uid || "Sponsored tree"}</h4>
                      <p>{tree.project_name || "LandCheck Green project"}</p>
                    </div>
                    <div className="green-sponsor-tree-mini-icon">
                      <GreenGlyph name="leaf" className="green-sponsor-inline-icon" />
                    </div>
                  </div>
                  <div className="green-sponsor-tree-card-meta">
                    <span>{tree.species || "Tree species pending"}</span>
                    <span>{humanizeLabel(tree.tree_status, "Awaiting planting")}</span>
                    <span>{formatDateLabel(tree.planting_date || tree.linked_at || tree.tree_created_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      ) : null}

      {!loading && activeTab === "leaderboard" ? (
        <section className="green-sponsor-panel">
          <div className="green-sponsor-panel-heading">
            <GreenGlyph name="trophy" className="green-sponsor-heading-icon" />
            <div>
              <h3>Public Leaderboard</h3>
              <p>See the top climate contributors across the LandCheck Green sponsor community.</p>
            </div>
          </div>

          {leaderboardLoading ? <div className="green-sponsor-loading">Loading leaderboard...</div> : null}
          {!leaderboardLoading && leaderboard ? (
            <div className="green-sponsor-leaderboard-grid">
              {[
                { key: "top_overall", label: "Top Overall" },
                { key: "top_schools", label: "Top Schools" },
                { key: "top_communities", label: "Top Communities" },
                { key: "top_companies", label: "Top Companies" },
              ].map((section) => {
                const rows = leaderboard[section.key as keyof SponsorLeaderboardData] || [];
                return (
                  <article key={section.key} className="green-sponsor-panel muted">
                    <h4>{section.label}</h4>
                    {Array.isArray(rows) && rows.length > 0 ? (
                      rows.slice(0, 6).map((item) => (
                        <div key={`${section.key}-${item.sponsor_id}-${item.rank}`} className="green-sponsor-ranking-row">
                          <div>
                            <strong>{item.rank}. {item.display_name}</strong>
                            <span>{humanizeLabel(item.entity_category, "Supporter")} | {item.achievement_level}</span>
                          </div>
                          <div className="green-sponsor-ranking-total">{item.all_time_trees}</div>
                        </div>
                      ))
                    ) : (
                      <div className="green-sponsor-empty">No entries yet.</div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      {!loading && activeTab === "grove" ? (
        <section className="green-sponsor-content-grid">
          <article className="green-sponsor-panel">
            <div className="green-sponsor-panel-heading">
              <GreenGlyph name="spark" className="green-sponsor-heading-icon" />
              <div>
                <h3>Green Points & Rewards</h3>
                <p>Your sponsor route uses the same points engine as Android, including referral code and unlock progress.</p>
              </div>
            </div>
            <div className="green-sponsor-metric-list">
              <div className="green-sponsor-metric-card">
                <span>Green Points</span>
                <strong>{Number(pointsInfo?.green_points || 0)} GP</strong>
              </div>
              <div className="green-sponsor-metric-card">
                <span>Lifetime Points</span>
                <strong>{Number(pointsInfo?.lifetime_points || 0)} GP</strong>
              </div>
              <div className="green-sponsor-metric-card">
                <span>Referral code</span>
                <strong>{pointsInfo?.referral_code || "-"}</strong>
              </div>
              <div className="green-sponsor-metric-card">
                <span>Point booster</span>
                <strong>
                  x{Number(pointsInfo?.point_booster_multiplier || 1)} | {Number(pointsInfo?.point_booster_remaining_uses || 0)} uses
                </strong>
              </div>
            </div>
          </article>

          <article className="green-sponsor-panel">
            <div className="green-sponsor-panel-heading">
              <GreenGlyph name="leaf" className="green-sponsor-heading-icon" />
              <div>
                <h3>Unlock status</h3>
                <p>Track sponsor growth milestones already earned on your account.</p>
              </div>
            </div>
            <div className="green-sponsor-inline-chips wrap">
              <span className={`green-sponsor-chip ${pointsInfo?.personal_sponsor_met ? "ok" : "neutral"}`}>Personal sponsor goal</span>
              <span className={`green-sponsor-chip ${pointsInfo?.referral_rules_met ? "ok" : "neutral"}`}>Referral rule</span>
              <span className={`green-sponsor-chip ${pointsInfo?.conversion_rate_met ? "ok" : "neutral"}`}>Conversion rule</span>
            </div>
            <div className="green-sponsor-tag-cloud">
              {(pointsInfo?.unlocked_species || []).map((item) => (
                <span key={`species-${item}`} className="green-sponsor-tag">{item}</span>
              ))}
              {(pointsInfo?.unlocked_avatars || []).map((item) => (
                <span key={`avatar-${item}`} className="green-sponsor-tag soft">{item}</span>
              ))}
              {(pointsInfo?.unlocked_map_icons || []).map((item) => (
                <span key={`map-icon-${item}`} className="green-sponsor-tag muted">{item}</span>
              ))}
              {(!pointsInfo?.unlocked_species?.length && !pointsInfo?.unlocked_avatars?.length && !pointsInfo?.unlocked_map_icons?.length) ? (
                <div className="green-sponsor-empty">Unlocked rewards will appear here as your sponsor journey grows.</div>
              ) : null}
            </div>
          </article>
        </section>
      ) : null}

      {!loading && activeTab === "profile" ? (
        <section className="green-sponsor-content-grid">
          <article className="green-sponsor-panel">
            <div className="green-sponsor-panel-heading">
              <GreenGlyph name="person" className="green-sponsor-heading-icon" />
              <div>
                <h3>Sponsor Profile</h3>
                <p>Manage how your public sponsor identity appears across the PWA and leaderboard.</p>
              </div>
            </div>
            <div className="green-sponsor-profile-grid">
              <div className="green-sponsor-profile-item">
                <span>Full name</span>
                <strong>{session.user.full_name}</strong>
              </div>
              <div className="green-sponsor-profile-item">
                <span>Email</span>
                <strong>{session.user.email || "-"}</strong>
              </div>
              <div className="green-sponsor-profile-item">
                <span>Phone</span>
                <strong>{session.user.phone || "-"}</strong>
              </div>
              <div className="green-sponsor-profile-item">
                <span>Account type</span>
                <strong>{humanizeLabel(session.user.account_type, "Sponsor")}</strong>
              </div>
              <div className="green-sponsor-profile-item">
                <span>Sponsor ID</span>
                <strong>{session.user.sponsor_uid || session.user.user_uid || "-"}</strong>
              </div>
              <div className="green-sponsor-profile-item">
                <span>Achievement level</span>
                <strong>{achievements?.level || "Climate Contributor"}</strong>
              </div>
            </div>
          </article>

          <article className="green-sponsor-panel">
            <div className="green-sponsor-panel-heading">
              <GreenGlyph name="spark" className="green-sponsor-heading-icon" />
              <div>
                <h3>Public identity settings</h3>
                <p>These settings mirror the sponsor profile controls used in the Android app.</p>
              </div>
            </div>

            <label className="green-sponsor-field">
              <span>Entity category</span>
              <select
                value={profileForm.entity_category}
                onChange={(event) => setProfileForm((current) => ({ ...current, entity_category: event.target.value }))}
              >
                {ENTITY_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="green-sponsor-field">
              <span>Leaderboard visibility</span>
              <select
                value={profileForm.leaderboard_visibility}
                onChange={(event) => setProfileForm((current) => ({ ...current, leaderboard_visibility: event.target.value }))}
              >
                {VISIBILITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="green-sponsor-inline-actions">
              <button type="button" className="green-sponsor-primary-btn" onClick={handleSaveProfile} disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save Settings"}
              </button>
              <button type="button" className="green-sponsor-secondary-btn" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </article>
        </section>
      ) : null}

      {!loading && activeTab === "projects" ? (
        <section className="green-sponsor-panel">
          <div className="green-sponsor-panel-heading">
            <GreenGlyph name="spark" className="green-sponsor-heading-icon" />
            <div>
              <h3>Recent Orders</h3>
              <p>Payment review, verified status, and linked tree progress for your sponsor orders.</p>
            </div>
          </div>
          <div className="green-sponsor-order-list">
            {orders.length === 0 ? (
              <div className="green-sponsor-empty">No sponsor orders yet.</div>
            ) : (
              orders.map((order) => (
                <div key={`sponsor-order-${order.id}`} className="green-sponsor-order-card">
                  <div className="green-sponsor-order-head">
                    <div>
                      <strong>{order.project_name || `Order #${order.order_uid || order.id}`}</strong>
                      <p>
                        {order.quantity} tree{order.quantity === 1 ? "" : "s"} | {formatCurrencyAmount(order.amount_total, order.currency || "NGN")}
                      </p>
                    </div>
                    <span className={`green-sponsor-chip ${toneClassForStatus(order.order_status || order.payment_status)}`}>
                      {humanizeLabel(order.order_status || order.payment_status, "Pending")}
                    </span>
                  </div>
                  <div className="green-sponsor-order-meta">
                    <span>Payment: {humanizeLabel(order.payment_status, "Pending")}</span>
                    <span>Linked trees: {Number(order.linked_units || 0)}</span>
                    <span>Awaiting tree: {Number(order.awaiting_tree_units || 0)}</span>
                    <span>{formatDateLabel(order.payment_verified_at || order.updated_at || order.created_at)}</span>
                  </div>
                  <div className="green-sponsor-inline-actions">
                    {order.order_uid ? (
                      <button type="button" className="green-sponsor-secondary-btn small" onClick={() => void handleRefreshPayment(order)}>
                        Refresh payment
                      </button>
                    ) : null}
                    {order.payment_link ? (
                      <button
                        type="button"
                        className="green-sponsor-secondary-btn small"
                        onClick={() => window.open(order.payment_link || "", "_blank", "noopener,noreferrer")}
                      >
                        Open payment link
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      <nav className="green-sponsor-bottom-nav">
        {[
          { key: "projects", label: "Projects", icon: "leaf" },
          { key: "trees", label: "My Trees", icon: "branch" },
          { key: "leaderboard", label: "Leaderboard", icon: "trophy" },
          { key: "grove", label: "Grove", icon: "spark" },
          { key: "profile", label: "Profile", icon: "person" },
        ].map((tab) => (
          <button
            key={`sponsor-tab-${tab.key}`}
            type="button"
            className={`green-sponsor-bottom-tab${activeTab === tab.key ? " active" : ""}`}
            onClick={() => setActiveTab(tab.key as SponsorTabKey)}
          >
            <GreenGlyph name={tab.icon} className="green-sponsor-bottom-tab-icon" />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
