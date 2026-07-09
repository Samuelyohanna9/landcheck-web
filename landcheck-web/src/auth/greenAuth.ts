import { api } from "../api/client";

export const GREEN_AUTH_STORAGE_KEY = "landcheck_green_auth";
export type GreenAppMode = "green" | "green_sponsor";
export type GreenAuthMode = "env_admin" | "partner_user" | "sponsor_user";
export type GreenSponsorAccountType = "individual" | "organization";

export type GreenAuthUser = {
  id: number;
  user_uid?: string | null;
  full_name: string;
  role?: string | null;
  role_key?: string | null;
  role_name?: string | null;
  allow_work?: boolean;
  allow_green?: boolean;
  organization_id?: number | null;
  organization_name?: string | null;
  organization_slug?: string | null;
  organization_status?: string | null;
  organization_is_active?: boolean;
  organization_logo_url?: string | null;
  email?: string | null;
  phone?: string | null;
  account_type?: GreenSponsorAccountType | string | null;
  sponsor_uid?: string | null;
  entity_category?: string | null;
  leaderboard_visibility?: string | null;
};

export type GreenAuthSession = {
  authed: true;
  appMode: GreenAppMode;
  auth_mode: GreenAuthMode;
  logged_in_at: string;
  user: GreenAuthUser;
};

type LoginResponse = {
  auth_mode?: GreenAuthMode;
  user?: GreenAuthUser;
};

type SponsorSignupInput = {
  full_name: string;
  account_type: GreenSponsorAccountType;
  organization_name?: string | null;
  email: string;
  phone?: string | null;
  password: string;
  referred_by_code?: string | null;
};

const normalizeAuthMode = (value: unknown): GreenAuthMode => {
  if (value === "partner_user") return "partner_user";
  if (value === "sponsor_user") return "sponsor_user";
  return "env_admin";
};

const normalizeAppMode = (value: unknown, authMode: GreenAuthMode): GreenAppMode => {
  if (value === "green_sponsor" || authMode === "sponsor_user") return "green_sponsor";
  return "green";
};

const normalizeGreenSession = (payload: LoginResponse, appMode: GreenAppMode): GreenAuthSession => {
  const authMode = normalizeAuthMode(payload?.auth_mode);
  return {
    authed: true,
    appMode: normalizeAppMode(appMode, authMode),
    auth_mode: authMode,
    logged_in_at: new Date().toISOString(),
    user: payload?.user || {
      id: 0,
      user_uid: "SYS-ADMIN",
      full_name: "System Admin",
      role: "super_admin",
      role_key: "super_admin",
      role_name: "Super Admin",
      allow_work: true,
      allow_green: true,
      organization_status: null,
      organization_is_active: true,
    },
  };
};

export const getGreenAuthSession = (): GreenAuthSession | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(GREEN_AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.authed && parsed.user) {
      const authMode = normalizeAuthMode(parsed?.auth_mode);
      const session: GreenAuthSession = {
        ...(parsed as GreenAuthSession),
        auth_mode: authMode,
        appMode: normalizeAppMode(parsed?.appMode, authMode),
      };
      if (
        session.auth_mode === "partner_user" &&
        (session.user?.organization_is_active === false ||
          String(session.user?.organization_status || "").trim().toLowerCase() === "suspended")
      ) {
        window.localStorage.removeItem(GREEN_AUTH_STORAGE_KEY);
        return null;
      }
      return session;
    }
  } catch {
    return null;
  }
  return null;
};

export const isGreenAuthed = () => Boolean(getGreenAuthSession());
export const isSponsorGreenSession = (session = getGreenAuthSession()) =>
  Boolean(session && (session.appMode === "green_sponsor" || session.auth_mode === "sponsor_user"));

export const setGreenAuthed = (session: GreenAuthSession) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GREEN_AUTH_STORAGE_KEY, JSON.stringify(session));
};

export const clearGreenAuthed = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GREEN_AUTH_STORAGE_KEY);
};

export const loginGreen = async (params: { username: string; password: string; organization_id?: number | null }) => {
  const username = params.username.trim();
  const password = params.password;
  if (!username || !password) {
    throw new Error("Username and password are required");
  }
  const res = await api.post("/green/green-auth/login", {
    username,
    password,
    organization_id: params.organization_id ?? null,
  });
  const session = normalizeGreenSession(res.data || {}, "green");
  setGreenAuthed(session);
  return session;
};

export const loginGreenSponsor = async (params: { email: string; password: string }) => {
  const email = params.email.trim().toLowerCase();
  const password = params.password;
  if (!email || !password) {
    throw new Error("Email and password are required");
  }
  const res = await api.post("/green/sponsor-auth/login", {
    email,
    password,
  });
  const session = normalizeGreenSession(res.data || {}, "green_sponsor");
  setGreenAuthed(session);
  return session;
};

export const signUpGreenSponsor = async (input: SponsorSignupInput) => {
  const payload = {
    full_name: input.full_name.trim(),
    account_type: input.account_type,
    organization_name: input.organization_name?.trim() || null,
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    password: input.password,
    referred_by_code: input.referred_by_code?.trim() || null,
  };
  if (!payload.full_name || !payload.email || !payload.password) {
    throw new Error("Full name, email, and password are required");
  }
  const res = await api.post("/green/sponsor-auth/signup", payload);
  const session = normalizeGreenSession(res.data || {}, "green_sponsor");
  setGreenAuthed(session);
  return session;
};

export const claimGreenSponsorGuestAccount = async (params: { sponsorId: number; email: string; password: string }) => {
  const email = params.email.trim().toLowerCase();
  if (!params.sponsorId || !email || !params.password) {
    throw new Error("Email and password are required");
  }
  const res = await api.post("/green/sponsor/guest/claim", {
    sponsor_id: params.sponsorId,
    email,
    password: params.password,
  });
  const session = normalizeGreenSession(res.data || {}, "green_sponsor");
  setGreenAuthed(session);
  return session;
};

export const requestGreenSponsorPasswordReset = async (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Email is required");
  }
  const res = await api.post<{ ok?: boolean; message?: string }>("/green/sponsor-auth/forgot-password", {
    email: normalizedEmail,
  });
  return String(res.data?.message || "If that sponsor email exists, a reset link has been sent.");
};
