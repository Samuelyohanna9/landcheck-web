import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildSponsorPrivacyUrl,
  buildSponsorTermsUrl,
  createGuestSponsorOrder,
  fetchGuestSponsorOrderPaymentStatus,
  fetchPublicRecentSponsorships,
  fetchPublicSponsorshipProjects,
  formatCurrencyAmount,
  formatSponsorPriceChoices,
  getPreferredSponsorPriceEntry,
  getSponsorPriceEntries,
  lookupPublicSponsorOrders,
  SPONSOR_TERMS_VERSION,
  type LookedUpSponsorOrder,
  type RecentSponsorshipItem,
  type SponsorProject,
} from "../api/greenSponsor";
import { claimGreenSponsorGuestAccount } from "../auth/greenAuth";
import "../styles/green-public-sponsor.css";

const SPONSOR_BACKGROUND = "/background-sponsor.png";
const HERO_VIDEO_SRC = "/let_the_video_be_black_nigeria.mp4";
const HERO_VIDEO_CROSSFADE_MS = 900;
const HERO_VIDEO_CROSSFADE_SECONDS = 1.05;
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=online.landcheck.mobile";
const GUEST_CHECKOUT_STORAGE_KEY = "lc_guest_checkout_pending";

type NetworkInfoLike = { effectiveType?: string; saveData?: boolean; downlink?: number };

function canAffordHeroVideo(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  } catch {
    /* matchMedia unsupported — fall through to connection check */
  }
  const nav = navigator as Navigator & { connection?: NetworkInfoLike };
  const conn = nav.connection;
  if (!conn) return true; // Network Information API unavailable (e.g. iOS Safari) — default to allowing video.
  const effectiveType = String(conn.effectiveType || "").toLowerCase();
  const downlink = Number(conn.downlink || 0);
  // Nigeria field conditions: skip the video entirely on slow/metered connections, same threshold used elsewhere in this app.
  if (conn.saveData) return false;
  if (effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g") return false;
  if (downlink > 0 && downlink < 2.5) return false;
  return true;
}

function shouldRenderHeroVideo(): boolean {
  if (canAffordHeroVideo()) return true;
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  } catch {
    // Ignore browsers without matchMedia support and keep the poster fallback.
  }
  const nav = navigator as Navigator & { connection?: NetworkInfoLike };
  return !Boolean(nav.connection?.saveData);
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

const PROMO_MESSAGES = [
  { icon: "tree", text: "Every tree is GPS-tracked & verified — sponsor with confidence!" },
  { icon: "certificate", text: "Get your digital sponsorship certificate the moment you pay." },
  { icon: "tag", text: "Your name goes on a real QR tag, on a real tree, in the field." },
] as const;

function GpsIcon({ name, className = "" }: { name: string; className?: string }) {
  switch (name) {
    case "tree":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 6.5 11h3L5 19h6v3h2v-3h6l-4.5-8h3L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>;
    case "certificate":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="4" width="17" height="12.5" rx="1.6" stroke="currentColor" strokeWidth="1.6" /><path d="M7 8h10M7 11h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="9.5" cy="19.5" r="1.6" stroke="currentColor" strokeWidth="1.4" /><path d="m8.3 19.9-1.1 2.6 2.3-1 2.3 1-1.1-2.6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
    case "tag":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11.6 3.5H5a1.5 1.5 0 0 0-1.5 1.5v6.6c0 .4.16.78.44 1.06l8.9 8.9a1.5 1.5 0 0 0 2.12 0l6.6-6.6a1.5 1.5 0 0 0 0-2.12l-8.9-8.9a1.5 1.5 0 0 0-1.06-.44Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><circle cx="8.3" cy="8.3" r="1.4" stroke="currentColor" strokeWidth="1.4" /></svg>;
    case "lock":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" /><path d="M7.8 10.5V7.8a4.2 4.2 0 1 1 8.4 0v2.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="12" cy="15" r="1.5" fill="currentColor" /></svg>;
    case "pin":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s7-6.3 7-11.6A7 7 0 0 0 5 9.4C5 14.7 12 21 12 21Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><circle cx="12" cy="9.3" r="2.4" stroke="currentColor" strokeWidth="1.5" /></svg>;
    case "package":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3.5 7.5 8.5-4 8.5 4-8.5 4-8.5-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M3.5 7.5v9l8.5 4 8.5-4v-9M12 11.5V20.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>;
    case "check-circle":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="m8.3 12.3 2.4 2.4 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "hourglass":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 3.5h11M6.5 20.5h11M7.5 3.5c0 4 3 5.6 4.5 6.5-1.5.9-4.5 2.5-4.5 6.5M16.5 3.5c0 4-3 5.6-4.5 6.5 1.5.9 4.5 2.5 4.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "alert":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4 3 20h18L12 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 10.5v4M12 17.2v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
    case "sparkle":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 1.7 4.8L18.5 9l-4.8 1.7L12 15.5l-1.7-4.8L5.5 9l4.8-1.7L12 3ZM19 15l.9 2.5L22.5 18l-2.6.9L19 21.5l-.9-2.6-2.6-.9 2.6-.9L19 15Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
    case "search":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "user":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.8" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "leaf":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 5C12 5 7 9 5 15c2.5 1.5 5.6 1.8 8.3.6 2.8-1.2 4.9-3.8 5.7-7.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M8 16c2-3 5-5.3 9-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    default:
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" /></svg>;
  }
}

const PROJECT_THUMBNAIL_SRC = "/thumpnail_public.webp";

const GALLERY_IMAGES = [
  { src: "/info_web.webp", label: "How LandCheck Green works" },
  { src: "/verified_tree_map_evidence.webp", label: "Verified map & photo evidence" },
  { src: "/cert_sample.webp", label: "Your sponsorship certificate" },
  { src: "/tree_tag_sample.webp", label: "Physical tree tag on your tree" },
];

const DEDICATION_OPTIONS = [
  { value: "self", label: "Myself" },
  { value: "birthday", label: "Birthday" },
  { value: "memorial", label: "Memorial" },
  { value: "anniversary", label: "Anniversary" },
  { value: "wedding", label: "Wedding" },
  { value: "honour", label: "In Honour Of" },
  { value: "celebration", label: "Celebration" },
  { value: "gratitude", label: "Gratitude" },
] as const;

type GuestForm = {
  fullName: string;
  email: string;
  phone: string;
  quantity: string;
  checkoutCurrency: string;
  dedicationType: string;
  dedicationName: string;
  dedicationMessage: string;
  purchaserNote: string;
  acceptedTerms: boolean;
  acceptedPolicy: boolean;
};

type PendingGuestCheckout = {
  fullName: string;
  email: string;
  projectTitle: string;
  isGuest: boolean;
};

type ReturnState = {
  orderUid: string;
  sponsorId: number;
  status: string;
  message: string;
};

const emptyForm: GuestForm = {
  fullName: "",
  email: "",
  phone: "",
  quantity: "1",
  checkoutCurrency: "NGN",
  dedicationType: "self",
  dedicationName: "",
  dedicationMessage: "",
  purchaserNote: "",
  acceptedTerms: false,
  acceptedPolicy: false,
};

function readReturnStateFromUrl(): ReturnState | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const orderUid = params.get("order_uid");
  if (!orderUid) return null;
  return {
    orderUid,
    sponsorId: Number(params.get("sponsor_id") || 0),
    status: params.get("status") || "pending",
    message: params.get("message") || "",
  };
}

export default function GreenPublicSponsor() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<SponsorProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [form, setForm] = useState<GuestForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [returnState, setReturnState] = useState<ReturnState | null>(() => readReturnStateFromUrl());
  const [pendingCheckout, setPendingCheckout] = useState<PendingGuestCheckout | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(GUEST_CHECKOUT_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as PendingGuestCheckout) : null;
    } catch {
      return null;
    }
  });
  const [orderStatus, setOrderStatus] = useState<{ payment_status?: string | null } | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [claimPassword, setClaimPassword] = useState("");
  const [claimConfirm, setClaimConfirm] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [claimed, setClaimed] = useState(false);
  const [heroVideoEnabled] = useState(() => shouldRenderHeroVideo());
  const [heroVideoReady, setHeroVideoReady] = useState(false);
  const [visibleHeroVideoIndex, setVisibleHeroVideoIndex] = useState(0);
  const heroVideoRefs = useRef<Array<HTMLVideoElement | null>>([null, null]);
  const activeHeroVideoIndexRef = useRef(0);
  const visibleHeroVideoIndexRef = useRef(0);
  const heroVideoCrossfadeLockRef = useRef(false);
  const heroVideoRafRef = useRef<number | null>(null);
  const heroVideoSwapTimeoutRef = useRef<number | null>(null);
  const [recentSponsorships, setRecentSponsorships] = useState<RecentSponsorshipItem[]>([]);
  const [lookupOrderUid, setLookupOrderUid] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupResult, setLookupResult] = useState<{ sponsor_name: string | null; orders: LookedUpSponsorOrder[] } | null>(null);
  const [showOrderLookup, setShowOrderLookup] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [promoIndex, setPromoIndex] = useState(0);
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(() => new Set(["about", "approval"]));

  const toggleAccordion = (key: string) => {
    setOpenAccordions((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const [toastIndex, setToastIndex] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    fetchPublicRecentSponsorships(10)
      .then(setRecentSponsorships)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setPromoIndex((i) => (i + 1) % PROMO_MESSAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (recentSponsorships.length === 0) return undefined;
    let cancelled = false;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const showNext = () => {
      if (cancelled) return;
      setToastVisible(true);
      hideTimer = setTimeout(() => {
        if (cancelled) return;
        setToastVisible(false);
        showTimer = setTimeout(() => {
          if (cancelled) return;
          setToastIndex((i) => (i + 1) % recentSponsorships.length);
          showNext();
        }, 2200);
      }, 5500);
    };

    showTimer = setTimeout(showNext, 1800);
    return () => {
      cancelled = true;
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [recentSponsorships]);

  const handleSelectProject = (projectId: number) => {
    setSelectedProjectId(projectId);
    setGalleryIndex(0);
    setOpenAccordions(new Set(["about", "approval"]));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBackToProjects = () => {
    setSelectedProjectId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const bumpQuantity = (delta: number) => {
    setForm((c) => ({ ...c, quantity: String(Math.max(1, Math.round(Number(c.quantity || 1)) + delta)) }));
  };

  useEffect(() => {
    if (returnState) return;
    let cancelled = false;
    fetchPublicSponsorshipProjects()
      .then((rows) => {
        if (cancelled) return;
        setProjects(rows);
      })
      .catch(() => setError("Could not load public sponsorship projects."))
      .finally(() => { if (!cancelled) setLoadingProjects(false); });
    return () => { cancelled = true; };
  }, [returnState]);

  useEffect(() => {
    if (!returnState || !returnState.sponsorId) return;
    let cancelled = false;
    setCheckingPayment(true);
    fetchGuestSponsorOrderPaymentStatus(returnState.sponsorId, returnState.orderUid, true)
      .then((order) => { if (!cancelled) setOrderStatus(order); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCheckingPayment(false); });
    return () => { cancelled = true; };
  }, [returnState]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );
  const shouldShowHero = !selectedProject && !returnState;

  const priceEntry = useMemo(() => getPreferredSponsorPriceEntry(selectedProject, form.checkoutCurrency), [selectedProject, form.checkoutCurrency]);
  const priceEntries = useMemo(() => getSponsorPriceEntries(selectedProject), [selectedProject]);
  const total = useMemo(() => Math.max(1, Number(form.quantity || 1)) * Number(priceEntry?.amount || 0), [form.quantity, priceEntry]);

  useEffect(() => {
    if (!heroVideoEnabled || !shouldShowHero) {
      setHeroVideoReady(false);
      return undefined;
    }

    const videos = heroVideoRefs.current;
    if (videos.some((video) => !video)) return undefined;

    const playVideo = (video: HTMLVideoElement | null) => {
      if (!video) return;
      video.muted = true;
      video.defaultMuted = true;
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    };

    const resetVideo = (video: HTMLVideoElement | null) => {
      if (!video) return;
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        // Ignore browsers that block direct currentTime resets while buffering.
      }
    };

    const stopLoopWatch = () => {
      if (heroVideoRafRef.current !== null) {
        cancelAnimationFrame(heroVideoRafRef.current);
        heroVideoRafRef.current = null;
      }
      if (heroVideoSwapTimeoutRef.current !== null) {
        window.clearTimeout(heroVideoSwapTimeoutRef.current);
        heroVideoSwapTimeoutRef.current = null;
      }
      heroVideoCrossfadeLockRef.current = false;
    };

    const startLoopWatch = () => {
      stopLoopWatch();

      const tick = () => {
        const currentVideo = heroVideoRefs.current[activeHeroVideoIndexRef.current];
        if (!currentVideo) {
          heroVideoRafRef.current = requestAnimationFrame(tick);
          return;
        }

        const duration = Number(currentVideo.duration);
        if (!Number.isFinite(duration) || duration <= 0) {
          heroVideoRafRef.current = requestAnimationFrame(tick);
          return;
        }

        const remaining = duration - currentVideo.currentTime;
        if (!heroVideoCrossfadeLockRef.current && remaining <= HERO_VIDEO_CROSSFADE_SECONDS) {
          heroVideoCrossfadeLockRef.current = true;
          const nextIndex = activeHeroVideoIndexRef.current === 0 ? 1 : 0;
          const nextVideo = heroVideoRefs.current[nextIndex];

          if (nextVideo) {
            try {
              nextVideo.currentTime = 0;
            } catch {
              // Ignore currentTime reset failures during browser buffering.
            }
            visibleHeroVideoIndexRef.current = nextIndex;
            setVisibleHeroVideoIndex(nextIndex);
            playVideo(nextVideo);
            setHeroVideoReady(true);

            heroVideoSwapTimeoutRef.current = window.setTimeout(() => {
              resetVideo(heroVideoRefs.current[activeHeroVideoIndexRef.current]);
              activeHeroVideoIndexRef.current = nextIndex;
              heroVideoCrossfadeLockRef.current = false;
              heroVideoSwapTimeoutRef.current = null;
            }, HERO_VIDEO_CROSSFADE_MS);
          } else {
            heroVideoCrossfadeLockRef.current = false;
          }
        }

        heroVideoRafRef.current = requestAnimationFrame(tick);
      };

      heroVideoRafRef.current = requestAnimationFrame(tick);
    };

    heroVideoRefs.current.forEach((video, index) => {
      if (index !== visibleHeroVideoIndexRef.current) {
        resetVideo(video);
      }
    });

    playVideo(heroVideoRefs.current[visibleHeroVideoIndexRef.current]);
    startLoopWatch();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        playVideo(heroVideoRefs.current[visibleHeroVideoIndexRef.current]);
        startLoopWatch();
      } else {
        stopLoopWatch();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopLoopWatch();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [heroVideoEnabled, shouldShowHero]);

  useEffect(() => {
    if (priceEntry && priceEntry.currency !== form.checkoutCurrency) {
      setForm((c) => (c.checkoutCurrency === priceEntry.currency ? c : { ...c, checkoutCurrency: priceEntry.currency }));
    }
  }, [priceEntry, form.checkoutCurrency]);

  const handleSubmit = async () => {
    if (!selectedProject) return;
    setError("");
    const quantity = Math.max(1, Number(form.quantity || 0));
    if (!form.fullName.trim() || !form.email.trim()) { setError("Please enter your name and email."); return; }
    if (!form.acceptedTerms || !form.acceptedPolicy) { setError("Please accept the sponsor terms and privacy policy."); return; }
    if (!selectedProject.sponsor_checkout_ready) { setError("This project is not open for online sponsorship yet."); return; }
    setSubmitting(true);
    try {
      const returnUrl = `${window.location.origin}/sponsor`;
      const result = await createGuestSponsorOrder({
        guest_full_name: form.fullName.trim(),
        guest_email: form.email.trim(),
        guest_phone: form.phone.trim() || null,
        project_id: selectedProject.id,
        quantity,
        checkout_currency: priceEntry?.currency || form.checkoutCurrency,
        dedication_type: form.dedicationType || null,
        dedication_name: form.dedicationName.trim() || null,
        dedication_message: form.dedicationMessage.trim() || null,
        purchaser_note: form.purchaserNote.trim() || null,
        payment_method: selectedProject.flutterwave_available ? "flutterwave" : "manual",
        accepted_terms: form.acceptedTerms,
        accepted_policy: form.acceptedPolicy,
        consent_version: SPONSOR_TERMS_VERSION,
        payment_return_url: returnUrl,
      });
      const pending: PendingGuestCheckout = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        projectTitle: selectedProject.public_sponsor_title || selectedProject.name,
        isGuest: result.is_guest !== false,
      };
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(GUEST_CHECKOUT_STORAGE_KEY, JSON.stringify(pending));
      }
      if (result.payment_link) {
        window.location.href = result.payment_link;
        return;
      }
      // Manual payment path — no hosted checkout link, order awaits proof/review.
      setPendingCheckout(pending);
      setReturnState({ orderUid: result.order_uid, sponsorId: Number(result.sponsor_id || 0), status: "pending", message: "Your order was created. Our team will confirm your manual payment shortly." });
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Could not start checkout — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async () => {
    setClaimError("");
    if (!returnState?.sponsorId || !pendingCheckout?.email) { setClaimError("We couldn't find your order details in this browser session."); return; }
    if (claimPassword.length < 6) { setClaimError("Password must be at least 6 characters."); return; }
    if (claimPassword !== claimConfirm) { setClaimError("Passwords do not match."); return; }
    setClaiming(true);
    try {
      await claimGreenSponsorGuestAccount({ sponsorId: returnState.sponsorId, email: pendingCheckout.email, password: claimPassword });
      if (typeof window !== "undefined") window.sessionStorage.removeItem(GUEST_CHECKOUT_STORAGE_KEY);
      setClaimed(true);
      setTimeout(() => navigate("/green", { replace: true }), 900);
    } catch (err: any) {
      setClaimError(err?.response?.data?.detail || err?.message || "Could not set up your account — please try again.");
    } finally {
      setClaiming(false);
    }
  };

  const handleLookupOrders = async () => {
    setLookupError("");
    setLookupResult(null);
    if (!lookupOrderUid.trim() || !lookupEmail.trim()) { setLookupError("Enter both your order ID and the email you sponsored with."); return; }
    setLookupLoading(true);
    try {
      const result = await lookupPublicSponsorOrders(lookupOrderUid.trim(), lookupEmail.trim());
      setLookupResult(result);
    } catch (err: any) {
      setLookupError(err?.response?.data?.detail || err?.message || "We could not find any orders matching that order ID and email.");
    } finally {
      setLookupLoading(false);
    }
  };

  const paymentVerified = orderStatus?.payment_status === "verified" || returnState?.status === "verified";
  const paymentFailed = returnState?.status === "failed";

  return (
    <div className="gps-page">
      {/* ─── Shop-style top bar ─── */}
      <header className="gps-topbar">
        <a href="/" className="gps-topbar-brand">
          <img src="/logo.svg" alt="LandCheck" width="28" height="28" />
          <span>LandCheck <strong>Green</strong></span>
        </a>
        <nav className="gps-topbar-links" aria-label="Sponsor navigation">
          <button type="button" onClick={() => { setSelectedProjectId(null); document.getElementById("gps-projects")?.scrollIntoView({ behavior: "smooth" }); }}>Shop Projects</button>
          <button type="button" onClick={() => setShowOrderLookup(true)}>Track Order</button>
          <a href="/green-partners">For Organizations</a>
        </nav>
        <div className="gps-topbar-icons">
          <button type="button" className="gps-topbar-icon-btn" onClick={() => setShowOrderLookup(true)} aria-label="Track my order">
            <GpsIcon name="search" className="gps-icon" />
          </button>
          <a href="/green/login/sponsor" className="gps-topbar-icon-btn" aria-label="Sign in to my account">
            <GpsIcon name="user" className="gps-icon" />
          </a>
        </div>
      </header>

      {/* ─── Promo banner ─── */}
      <div className="gps-promo-banner">
        <button type="button" onClick={() => setPromoIndex((i) => (i - 1 + PROMO_MESSAGES.length) % PROMO_MESSAGES.length)} aria-label="Previous message">‹</button>
        <span className="gps-promo-message">
          <GpsIcon name={PROMO_MESSAGES[promoIndex].icon} className="gps-icon" />
          {PROMO_MESSAGES[promoIndex].text}
        </span>
        <button type="button" onClick={() => setPromoIndex((i) => (i + 1) % PROMO_MESSAGES.length)} aria-label="Next message">›</button>
      </div>

      {/* ─── Hero (browsing view only — hidden once a project/checkout or payment-return view is active) ─── */}
      {!selectedProject && !returnState && (
      <section className={`gps-hero${heroVideoReady ? " gps-hero--video-ready" : ""}`} style={{ backgroundImage: `url(${SPONSOR_BACKGROUND})` }}>
        {heroVideoEnabled && (
          <div className="gps-hero-video-wrap" aria-hidden="true">
            {[0, 1].map((index) => (
              <video
                key={index}
                ref={(node) => {
                  heroVideoRefs.current[index] = node;
                }}
                className={`gps-hero-video${visibleHeroVideoIndex === index ? " gps-hero-video--active" : " gps-hero-video--inactive"}`}
                poster={SPONSOR_BACKGROUND}
                autoPlay={index === 0}
                muted
                playsInline
                preload="auto"
                disablePictureInPicture
                disableRemotePlayback
                onPlaying={() => setHeroVideoReady(true)}
                onLoadedData={() => setHeroVideoReady(true)}
                onError={() => {
                  if (index === visibleHeroVideoIndexRef.current) {
                    setHeroVideoReady(false);
                  }
                }}
              >
                <source src={HERO_VIDEO_SRC} type="video/mp4" />
              </video>
            ))}
          </div>
        )}
        <div className="gps-hero-scrim" />
        <div className="gps-hero-inner">
          <span className="gps-hero-eyebrow">LandCheck Green · Public Sponsorship</span>
          <h1>Give Nigeria a Greener Future.<br />One Tree at a Time.</h1>
          <p>Sponsor a verified tree project in minutes, in NGN or USD, and watch it grow with GPS-tracked, photo-verified updates straight to your inbox.</p>

          <div className="gps-feature-row">
            <div className="gps-feature-card">
              <span className="gps-feature-icon"><GpsIcon name="tree" className="gps-icon" /></span>
              <strong>Reforestation in Nigeria</strong>
              <p>Verified, GPS-mapped tree projects with field officers on the ground.</p>
            </div>
            <div className="gps-feature-card">
              <span className="gps-feature-icon"><GpsIcon name="certificate" className="gps-icon" /></span>
              <strong>Certificate in 60 seconds</strong>
              <p>Instant digital certificate emailed the moment your payment is confirmed.</p>
            </div>
            <div className="gps-feature-card">
              <span className="gps-feature-icon"><GpsIcon name="lock" className="gps-icon" /></span>
              <strong>Track without an account</strong>
              <p>Your order ID and email are all you need to check on your tree, anytime.</p>
            </div>
          </div>

          <div className="gps-hero-ctas">
            <button type="button" className="gps-primary-btn" onClick={() => document.getElementById("gps-projects")?.scrollIntoView({ behavior: "smooth" })}>
              Plant Your Tree Now
            </button>
            <button type="button" className="gps-hero-secondary-btn" onClick={() => setShowOrderLookup(true)}>
              <GpsIcon name="package" className="gps-icon" /> Track My Order
            </button>
          </div>
        </div>
      </section>
      )}

      {/* ─── Recently sponsored — floating balloon notification ─── */}
      {!selectedProject && !returnState && recentSponsorships.length > 0 && (
        <div className={`gps-toast${toastVisible ? " gps-toast--visible" : ""}`} aria-live="polite">
          <span className="gps-toast-icon"><GpsIcon name="tree" className="gps-icon" /></span>
          <div className="gps-toast-body">
            <strong>{recentSponsorships[toastIndex]?.sponsor_first_name}</strong> just sponsored{" "}
            {recentSponsorships[toastIndex]?.quantity} tree{recentSponsorships[toastIndex]?.quantity === 1 ? "" : "s"}
            {recentSponsorships[toastIndex]?.project_name ? <> for <strong>{recentSponsorships[toastIndex]?.project_name}</strong></> : null}
            <span className="gps-toast-time">{formatRelativeTime(recentSponsorships[toastIndex]?.sponsored_at || null)}</span>
          </div>
        </div>
      )}

      {/* ─── Order lookup modal ─── */}
      {showOrderLookup && (
        <div className="gps-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowOrderLookup(false); }}>
          <div className="gps-lookup-modal">
            <button type="button" className="gps-modal-close" onClick={() => setShowOrderLookup(false)} aria-label="Close">✕</button>
            <h2>Track My Order</h2>
            <p className="gps-section-sub">Enter the order ID from your confirmation email and the email you sponsored with.</p>
            <label className="gps-field"><span>Order ID</span><input type="text" value={lookupOrderUid} onChange={(e) => setLookupOrderUid(e.target.value)} placeholder="e.g. ORD-A1B2C3D4" /></label>
            <label className="gps-field"><span>Email</span><input type="email" value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)} placeholder="you@example.com" /></label>
            {lookupError && <p className="gps-error">{lookupError}</p>}
            <button type="button" className="gps-primary-btn full" onClick={handleLookupOrders} disabled={lookupLoading}>
              {lookupLoading ? "Looking up your orders…" : "Find My Orders"}
            </button>

            {lookupResult && (
              <div className="gps-lookup-results">
                <h3>{lookupResult.sponsor_name ? `Hi ${lookupResult.sponsor_name.split(" ")[0]}, here's your history` : "Your orders"}</h3>
                {lookupResult.orders.length === 0 ? (
                  <p className="gps-section-sub">No orders found yet.</p>
                ) : (
                  lookupResult.orders.map((order) => (
                    <div key={order.id} className="gps-lookup-order-card">
                      <div className="gps-lookup-order-head">
                        <strong>{order.project_name || `Order ${order.order_uid}`}</strong>
                        <span className={`gps-chip ${order.payment_status === "verified" ? "ok" : "warning"}`}>{order.payment_status || "pending"}</span>
                      </div>
                      <span className="gps-lookup-order-meta">
                        {order.quantity} tree{order.quantity === 1 ? "" : "s"} · {formatCurrencyAmount(order.amount_total, order.currency || "NGN")} · Linked: {order.linked_units}/{order.total_units}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="gps-main">
        {returnState ? (
          <section className="gps-return-panel">
            {checkingPayment ? (
              <div className="gps-return-status pending">
                <div className="gps-spinner" />
                <h2>Confirming your payment…</h2>
                <p>This only takes a moment.</p>
              </div>
            ) : paymentVerified ? (
              claimed ? (
                <div className="gps-return-status success">
                  <div className="gps-return-icon"><GpsIcon name="sparkle" className="gps-icon" /></div>
                  <h2>You're all set!</h2>
                  <p>Taking you to your sponsor dashboard…</p>
                </div>
              ) : pendingCheckout && !pendingCheckout.isGuest ? (
                <div className="gps-return-status success">
                  <div className="gps-return-icon"><GpsIcon name="tree" className="gps-icon" /></div>
                  <h2>Payment received — thank you!</h2>
                  <p>
                    Your sponsorship for <strong>{pendingCheckout.projectTitle}</strong> is confirmed. Since{" "}
                    <strong>{pendingCheckout.email}</strong> already has a sponsor account, sign in to see it on your dashboard.
                  </p>
                  <a className="gps-primary-btn" href="/green/login/sponsor">Sign In to My Dashboard</a>
                </div>
              ) : (
                <div className="gps-claim-card">
                  <div className="gps-return-icon"><GpsIcon name="tree" className="gps-icon" /></div>
                  <h2>Payment received — thank you!</h2>
                  <p>
                    Your sponsorship for <strong>{pendingCheckout?.projectTitle || "your project"}</strong> is confirmed. We've emailed{" "}
                    <strong>{pendingCheckout?.email}</strong> your receipt and tracking link.
                  </p>
                  <div className="gps-claim-divider" />
                  <h3>Set a password to unlock your dashboard</h3>
                  <p className="gps-claim-sub">Track every tree on a map, see your leaderboard rank, earn Green Points, and play reward games.</p>
                  <label className="gps-field"><span>Email</span><input type="email" value={pendingCheckout?.email || ""} disabled /></label>
                  <label className="gps-field"><span>Create password</span><input type="password" value={claimPassword} onChange={(e) => setClaimPassword(e.target.value)} placeholder="At least 6 characters" /></label>
                  <label className="gps-field"><span>Confirm password</span><input type="password" value={claimConfirm} onChange={(e) => setClaimConfirm(e.target.value)} placeholder="Re-enter password" /></label>
                  {claimError && <p className="gps-error">{claimError}</p>}
                  <button type="button" className="gps-primary-btn full" onClick={handleClaim} disabled={claiming}>
                    {claiming ? "Setting up your account…" : "Set Password & See My Dashboard"}
                  </button>
                  <div className="gps-claim-skip">
                    <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer">Get the Android app</a>
                    <span>·</span>
                    <button type="button" onClick={() => navigate("/", { replace: true })}>Skip for now</button>
                  </div>
                </div>
              )
            ) : paymentFailed ? (
              <div className="gps-return-status failed">
                <div className="gps-return-icon"><GpsIcon name="alert" className="gps-icon" /></div>
                <h2>Payment incomplete</h2>
                <p>{returnState.message || "Your payment did not complete. You can try again below."}</p>
                <button type="button" className="gps-primary-btn" onClick={() => { setReturnState(null); setPendingCheckout(null); setOrderStatus(null); window.history.replaceState({}, "", "/sponsor"); }}>Sponsor Another Tree</button>
              </div>
            ) : (
              <div className="gps-return-status pending">
                <div className="gps-return-icon"><GpsIcon name="hourglass" className="gps-icon" /></div>
                <h2>Payment pending</h2>
                <p>{returnState.message || "We're still confirming your payment with our provider. This can take a minute."}</p>
                <div className="gps-return-actions">
                  <button
                    type="button"
                    className="gps-secondary-btn"
                    onClick={() => {
                      if (!returnState.sponsorId) return;
                      setCheckingPayment(true);
                      fetchGuestSponsorOrderPaymentStatus(returnState.sponsorId, returnState.orderUid, true)
                        .then((order) => setOrderStatus(order))
                        .finally(() => setCheckingPayment(false));
                    }}
                  >
                    Check Again
                  </button>
                  <button
                    type="button"
                    className="gps-primary-btn"
                    onClick={() => { setReturnState(null); setPendingCheckout(null); setOrderStatus(null); window.history.replaceState({}, "", "/sponsor"); }}
                  >
                    Sponsor Another Tree
                  </button>
                </div>
                <p className="gps-return-note">
                  This order will keep confirming in the background — check your email for a receipt once it clears.
                </p>
              </div>
            )}
          </section>
        ) : (
          <>
            {/* ─── Project grid ─── */}
            {!selectedProject && (
            <section className="gps-projects-section" id="gps-projects">
              <h2>Choose a Verified Project</h2>
              <p className="gps-section-sub">Every project is field-monitored with GPS mapping and photo evidence.</p>
              {error && !loadingProjects && projects.length === 0 && <p className="gps-error">{error}</p>}
              {loadingProjects ? (
                <div className="gps-loading">Loading projects…</div>
              ) : projects.length === 0 ? (
                <div className="gps-empty">No public projects are open for sponsorship right now — please check back soon.</div>
              ) : (
                <div className="gps-project-grid">
                  {projects.map((project) => {
                    const ready = project.sponsor_checkout_ready;
                    return (
                      <div className="gps-project-card" key={project.id}>
                        <div className="gps-project-card-photo-wrap">
                          <div
                            className="gps-project-card-photo"
                            style={{ backgroundImage: `url(${PROJECT_THUMBNAIL_SRC})` }}
                          />
                        </div>
                        <div className="gps-project-card-body">
                          <h3>{project.public_sponsor_title || project.name}</h3>
                          <p>{project.public_sponsor_description || project.public_description || project.location_text || "Verified tree project"}</p>
                          <div className="gps-project-card-price-row">
                            <span className="gps-project-card-price-label">from</span>
                            <span className="gps-project-card-price">{formatSponsorPriceChoices(project)}</span>
                          </div>
                          <div className="gps-project-card-tags">
                            <span className="gps-project-tag"><GpsIcon name="pin" className="gps-icon-inline" /> {project.location_text || "Nigeria"}</span>
                            <span className={`gps-project-tag ${ready ? "ok" : "warning"}`}>
                              {ready ? `${Number(project.slots_available ?? 0)} slots open` : "Preparing"}
                            </span>
                          </div>
                          <button type="button" className="gps-project-card-btn" onClick={() => handleSelectProject(project.id)}>
                            Select Trees
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            )}

            {/* ─── Checkout (product-detail-page style) ─── */}
            {selectedProject && (() => {
              const projectTitle = selectedProject.public_sponsor_title || selectedProject.name;
              const quantityNum = Math.max(1, Number(form.quantity || 1));
              const accordions = [
                {
                  key: "about",
                  title: "About this project",
                  body: selectedProject.public_sponsor_description || selectedProject.public_description || "A verified, GPS-mapped tree planting project in Nigeria, monitored by LandCheck field officers from planting through maturity.",
                },
                {
                  key: "certificate",
                  title: "How your certificate & tracking works",
                  body: "The moment your payment is confirmed, we email you a digital sponsorship certificate. As your tree is planted and cared for, you'll get GPS map location, photo evidence, and maintenance updates — no account required to check on it.",
                },
                {
                  key: "impact",
                  title: "Your climate impact",
                  body: `Each tree you sponsor absorbs roughly 21 kg of CO₂ per year and helps retain around 120 L of water. Sponsoring ${quantityNum} tree${quantityNum === 1 ? "" : "s"} adds up to real, measurable impact over time.`,
                },
                {
                  key: "approval",
                  title: "Approvals & field agents on the ground",
                  body: `${projectTitle} has full land-rights and planting approval on record, and LandCheck field agents are already on the ground ready to plant your trees.`,
                },
              ];

              return (
                <section className="gps-pdp" id="gps-checkout">
                  <button type="button" className="gps-back-link" onClick={handleBackToProjects}>
                    <span aria-hidden="true">←</span> Back to Projects
                  </button>

                  <div className="gps-pdp-grid">
                    {/* ─── Gallery ─── */}
                    <div className="gps-pdp-gallery">
                      <div
                        className="gps-pdp-main-photo"
                        style={{ backgroundImage: `url(${GALLERY_IMAGES[galleryIndex % GALLERY_IMAGES.length].src})` }}
                        role="img"
                        aria-label={GALLERY_IMAGES[galleryIndex % GALLERY_IMAGES.length].label}
                      />
                      <div className="gps-pdp-thumb-row">
                        {GALLERY_IMAGES.map((image, index) => (
                          <button
                            type="button"
                            key={image.src}
                            className={`gps-pdp-thumb${index === galleryIndex ? " active" : ""}`}
                            style={{ backgroundImage: `url(${image.src})` }}
                            onClick={() => setGalleryIndex(index)}
                            aria-label={image.label}
                          />
                        ))}
                      </div>
                    </div>

                    {/* ─── Info + form ─── */}
                    <div className="gps-pdp-info">
                      <span className="gps-checkout-eyebrow">Secure Checkout</span>
                      <h1>{projectTitle}</h1>
                      <span className="gps-checkout-location"><GpsIcon name="pin" className="gps-icon-inline" /> {selectedProject.location_text || "LandCheck Green project"}</span>
                      <div className="gps-pdp-price-row">
                        <span className="gps-pdp-price">{formatSponsorPriceChoices(selectedProject)}</span>
                        <span className={`gps-chip ${selectedProject.sponsor_checkout_ready ? "ok" : "warning"}`}>
                          {selectedProject.sponsor_checkout_ready ? `${Number(selectedProject.slots_available ?? 0)} slots open` : "Preparing"}
                        </span>
                      </div>

                      <div className="gps-accordion">
                        {accordions.map((item) => {
                          const open = openAccordions.has(item.key);
                          return (
                            <div key={item.key} className={`gps-accordion-item${open ? " open" : ""}`}>
                              <button type="button" className="gps-accordion-head" onClick={() => toggleAccordion(item.key)}>
                                <span>{item.title}</span>
                                <span className="gps-accordion-chevron" aria-hidden="true">›</span>
                              </button>
                              {open && <p className="gps-accordion-body">{item.body}</p>}
                            </div>
                          );
                        })}
                      </div>

                      <div className="gps-pdp-divider" />

                      <div className="gps-quantity-row">
                        <span className="gps-field-label">Trees <span className="gps-required">*</span></span>
                        <div className="gps-quantity-stepper">
                          <button type="button" onClick={() => bumpQuantity(-1)} aria-label="Decrease quantity">−</button>
                          <input type="number" min="1" value={form.quantity} onChange={(e) => setForm((c) => ({ ...c, quantity: e.target.value }))} />
                          <button type="button" onClick={() => bumpQuantity(1)} aria-label="Increase quantity">+</button>
                        </div>
                        {priceEntries.length > 1 && (
                          <select className="gps-quantity-currency" value={form.checkoutCurrency} onChange={(e) => setForm((c) => ({ ...c, checkoutCurrency: e.target.value }))}>
                            {priceEntries.map((entry) => (
                              <option key={entry.currency} value={entry.currency}>{entry.currency} — {formatCurrencyAmount(entry.amount, entry.currency)} / tree</option>
                            ))}
                          </select>
                        )}
                      </div>

                      <h2 className="gps-pdp-section-title">Your Details</h2>
                      <div className="gps-form-grid">
                        <label className="gps-field"><span>Full name <span className="gps-required">*</span></span><input type="text" value={form.fullName} onChange={(e) => setForm((c) => ({ ...c, fullName: e.target.value }))} placeholder="Your name" /></label>
                        <label className="gps-field"><span>Email <span className="gps-required">*</span></span><input type="email" value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} placeholder="you@example.com" /></label>
                        <label className="gps-field"><span>Phone (optional)</span><input type="tel" value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} placeholder="Phone number" /></label>
                        <label className="gps-field"><span>Dedication</span>
                          <select value={form.dedicationType} onChange={(e) => setForm((c) => ({ ...c, dedicationType: e.target.value }))}>
                            {DEDICATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </label>
                        {form.dedicationType !== "self" && (
                          <label className="gps-field"><span>Dedicated to (optional)</span><input type="text" value={form.dedicationName} onChange={(e) => setForm((c) => ({ ...c, dedicationName: e.target.value }))} placeholder="Name or occasion" /></label>
                        )}
                      </div>

                      <label className="gps-field"><span>Message (optional)</span><textarea rows={2} value={form.purchaserNote} onChange={(e) => setForm((c) => ({ ...c, purchaserNote: e.target.value }))} placeholder="Note for the LandCheck Green team" /></label>

                      <p className="gps-total-note">
                        {selectedProject.sponsor_max_per_order ? `Max ${selectedProject.sponsor_max_per_order} trees per order · ` : ""}
                        Total: <strong>{formatCurrencyAmount(total, priceEntry?.currency || form.checkoutCurrency)}</strong>
                      </p>

                      <label className="gps-check"><input type="checkbox" checked={form.acceptedTerms} onChange={(e) => setForm((c) => ({ ...c, acceptedTerms: e.target.checked }))} /><span>I accept the <a href={buildSponsorTermsUrl()} target="_blank" rel="noreferrer">sponsor terms</a></span></label>
                      <label className="gps-check"><input type="checkbox" checked={form.acceptedPolicy} onChange={(e) => setForm((c) => ({ ...c, acceptedPolicy: e.target.checked }))} /><span>I accept the <a href={buildSponsorPrivacyUrl()} target="_blank" rel="noreferrer">privacy policy</a></span></label>

                      {error && <p className="gps-error">{error}</p>}

                      <button type="button" className="gps-primary-btn full" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? "Preparing secure payment…" : `Pay ${formatCurrencyAmount(total, priceEntry?.currency || form.checkoutCurrency)} & Sponsor`}
                      </button>
                      <p className="gps-checkout-footnote">
                        Already have an account? <a href="/green/login/sponsor">Sign in</a>, or{" "}
                        <button type="button" onClick={() => setShowOrderLookup(true)}>track an order</button> without one.
                      </p>
                    </div>
                  </div>
                </section>
              );
            })()}
          </>
        )}
      </main>

      <footer className="gps-footer">
        <span>LandCheck Green Geospatial Technologies Limited</span>
        <a href="mailto:landchecktech@gmail.com">landchecktech@gmail.com</a>
      </footer>
    </div>
  );
}
