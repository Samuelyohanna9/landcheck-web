import { api } from "../api/client";

export const SURVEY_AUTH_STORAGE_KEY = "landcheck_survey_auth";

export type SurveyAuthUser = {
  id: number;
  email: string;
  full_name?: string | null;
};

export type SurveyAuthSession = {
  authed: true;
  logged_in_at: string;
  access_token: string;
  session_uid?: string | null;
  expires_at?: string | null;
  user: SurveyAuthUser;
};

type SurveySessionResponse = {
  access_token?: string | null;
  session_uid?: string | null;
  expires_at?: string | null;
  user?: SurveyAuthUser;
};

const parseIsoDate = (value: unknown) => {
  const clean = String(value || "").trim();
  if (!clean) return null;
  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isSessionExpired = (session: Partial<SurveyAuthSession> | null | undefined) => {
  const expiry = parseIsoDate(session?.expires_at);
  return Boolean(expiry && expiry.getTime() <= Date.now());
};

const normalizeSurveySession = (payload: SurveySessionResponse): SurveyAuthSession => {
  const accessToken = String(payload?.access_token || "").trim();
  if (!accessToken || !payload.user) {
    throw new Error("Sign-in did not return a valid session.");
  }
  return {
    authed: true,
    logged_in_at: new Date().toISOString(),
    access_token: accessToken,
    session_uid: String(payload?.session_uid || "").trim() || null,
    expires_at: String(payload?.expires_at || "").trim() || null,
    user: payload.user,
  };
};

export const getSurveyAuthSession = (): SurveyAuthSession | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SURVEY_AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SurveyAuthSession;
    if (parsed?.authed && parsed.user && parsed.access_token) {
      if (isSessionExpired(parsed)) {
        window.localStorage.removeItem(SURVEY_AUTH_STORAGE_KEY);
        return null;
      }
      return parsed;
    }
  } catch {
    window.localStorage.removeItem(SURVEY_AUTH_STORAGE_KEY);
    return null;
  }
  return null;
};

export const isSurveyAuthed = () => Boolean(getSurveyAuthSession());

export const setSurveyAuthSession = (session: SurveyAuthSession) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SURVEY_AUTH_STORAGE_KEY, JSON.stringify(session));
};

export const clearSurveyAuthSession = () => {
  if (typeof window === "undefined") return;
  const existing = getSurveyAuthSession();
  const accessToken = existing?.access_token;
  window.localStorage.removeItem(SURVEY_AUTH_STORAGE_KEY);
  if (accessToken) {
    void api
      .post("/survey/auth/logout", {}, { headers: { Authorization: `Bearer ${accessToken}` } })
      .catch(() => undefined);
  }
};

export const requestSurveyMagicLink = async (email: string) => {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) throw new Error("Email is required");
  await api.post("/survey/auth/magic-link/request", { email: cleanEmail });
};

export const verifySurveyMagicLink = async (token: string) => {
  const res = await api.post<SurveySessionResponse>("/survey/auth/magic-link/verify", { token });
  const session = normalizeSurveySession(res.data || {});
  setSurveyAuthSession(session);
  return session;
};

export const verifySurveyOtp = async (email: string, code: string) => {
  const res = await api.post<SurveySessionResponse>("/survey/auth/otp/verify", {
    email: email.trim().toLowerCase(),
    code: code.trim(),
  });
  const session = normalizeSurveySession(res.data || {});
  setSurveyAuthSession(session);
  return session;
};

export const exchangeSurveyGoogleCode = async (code: string) => {
  const res = await api.post<SurveySessionResponse>("/survey/auth/google/exchange", { code });
  const session = normalizeSurveySession(res.data || {});
  setSurveyAuthSession(session);
  return session;
};

export const startSurveyGoogleSignIn = () => {
  if (typeof window === "undefined") return;
  const baseURL = String(api.defaults.baseURL || "").replace(/\/+$/, "");
  window.location.href = `${baseURL}/survey/auth/google/start`;
};

const PENDING_ACTION_KEY = "landcheck_survey_pending_action";
const PENDING_ACTION_MAX_AGE_MS = 30 * 60 * 1000;

// A JSON-serializable description of exactly which download/export was in flight when the
// signup gate interrupted it - not just a marker that *something* was pending. Each variant
// carries the same arguments its handler function takes, so the resume step in SurveyPlan.tsx
// can call the real handler with the real arguments instead of asking the user to repeat
// themselves.
export type PendingSurveyDownload =
  | { type: "georeference-csv" }
  | {
      type: "download-json";
      url: string;
      filename: string;
      loadingKey: string;
      useTopoMap?: boolean;
      customTitle?: string;
    }
  | { type: "download-get"; url: string; filename: string; loadingKey: string }
  | { type: "technical-report"; fields: Record<string, unknown> }
  | { type: "subdivision-batch"; batchId: number }
  | { type: "subdivision-clean-copy" };

// Both the magic-link and Google flows navigate away from the page that triggered the gate (an
// email link often opens in a new tab entirely), so this can't live in JS state - it has to
// survive in localStorage (shared across tabs, unlike sessionStorage).
export const setPendingSurveyDownload = (action: PendingSurveyDownload) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PENDING_ACTION_KEY, JSON.stringify({ action, createdAt: Date.now() }));
};

// Non-destructive check used by the auth verify/callback pages to decide where to redirect,
// without consuming the entry - only SurveyPlan.tsx (which can actually replay the download)
// should consume it.
export const hasPendingSurveyDownload = (): boolean => {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(PENDING_ACTION_KEY));
};

export const consumePendingSurveyDownload = (): PendingSurveyDownload | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PENDING_ACTION_KEY);
  window.localStorage.removeItem(PENDING_ACTION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { action?: PendingSurveyDownload; createdAt?: number };
    if (!parsed?.action || !parsed?.createdAt) return null;
    if (Date.now() - parsed.createdAt > PENDING_ACTION_MAX_AGE_MS) return null;
    return parsed.action;
  } catch {
    return null;
  }
};

// Every plot id created anonymously by this browser (from the `landcheck_plots` draft) - claimed
// automatically right after a successful sign-in so nothing the user already built is lost.
export const claimSurveyPlots = async (plotIds: number[]) => {
  if (!plotIds.length) return [] as number[];
  const session = getSurveyAuthSession();
  if (!session) return [] as number[];
  try {
    const res = await api.post<{ claimed: number[] }>(
      "/plots/claim",
      { plot_ids: plotIds },
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    );
    return res.data?.claimed || [];
  } catch {
    return [] as number[];
  }
};

const PLOTS_DRAFT_STORAGE_KEY = "landcheck_plots";

const readDraftPlotIds = (): number[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PLOTS_DRAFT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { id?: number }[];
    return parsed.map((p) => Number(p.id)).filter((id) => Number.isFinite(id));
  } catch {
    return [];
  }
};

// Every georeference session id created anonymously by this browser (from the
// `landcheck_georef_sessions` draft) - claimed the same way and at the same points as plot ids.
export const claimSurveyGeorefSessions = async (sessionIds: string[]) => {
  if (!sessionIds.length) return [] as string[];
  const session = getSurveyAuthSession();
  if (!session) return [] as string[];
  try {
    const res = await api.post<{ claimed: string[] }>(
      "/survey-georeference/sessions/claim",
      { session_ids: sessionIds },
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    );
    return res.data?.claimed || [];
  } catch {
    return [] as string[];
  }
};

const GEOREF_DRAFT_STORAGE_KEY = "landcheck_georef_sessions";

const readDraftGeorefSessionIds = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GEOREF_DRAFT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { id?: string }[];
    return parsed.map((s) => String(s.id || "")).filter(Boolean);
  } catch {
    return [];
  }
};

// Convenience wrapper used by every sign-in completion path (magic-link verify, OTP verify,
// Google callback) - claims whatever's in this browser's local draft.
export const claimDraftSurveyPlots = async () => {
  const [plots] = await Promise.all([
    claimSurveyPlots(readDraftPlotIds()),
    claimSurveyGeorefSessions(readDraftGeorefSessionIds()),
  ]);
  return plots;
};
