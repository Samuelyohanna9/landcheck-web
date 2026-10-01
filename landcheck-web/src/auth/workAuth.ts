import { api } from "../api/client";

export const WORK_AUTH_STORAGE_KEY = "landcheck_work_auth";

export type WorkAuthUser = {
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
};

export type WorkAuthSession = {
  authed: true;
  auth_mode: "env_admin" | "partner_user";
  logged_in_at: string;
  access_token: string;
  session_uid?: string | null;
  expires_at?: string | null;
  idle_timeout_at?: string | null;
  mfa_enabled?: boolean;
  mfa_verified?: boolean;
  user: WorkAuthUser;
};

type WorkLoginResponse = {
  auth_mode?: "env_admin" | "partner_user";
  access_token?: string | null;
  session_uid?: string | null;
  expires_at?: string | null;
  idle_timeout_at?: string | null;
  mfa_enabled?: boolean;
  mfa_verified?: boolean;
  user?: WorkAuthUser;
  verification_required?: boolean;
  email?: string;
  message?: string;
};

export type WorkRegistrationResult = WorkAuthSession | {
  verification_required: true;
  email: string;
  message: string;
};

const parseIsoDate = (value: unknown) => {
  const clean = String(value || "").trim();
  if (!clean) return null;
  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isWorkSessionExpired = (session: Partial<WorkAuthSession> | null | undefined) => {
  const hardExpiry = parseIsoDate(session?.expires_at);
  if (hardExpiry && hardExpiry.getTime() <= Date.now()) return true;
  return false;
};

const revokeStoredWorkSession = () => {
  void api.post("/green/auth/logout", {}).catch(() => undefined);
};

export const getWorkAuthSession = (): WorkAuthSession | null => {
  if (typeof window === "undefined") return null;
  window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
  const raw = window.sessionStorage.getItem(WORK_AUTH_STORAGE_KEY);
  if (!raw) return null;
  if (raw === "1") {
    window.sessionStorage.removeItem(WORK_AUTH_STORAGE_KEY);
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!(parsed && parsed.authed && parsed.user)) {
      window.sessionStorage.removeItem(WORK_AUTH_STORAGE_KEY);
      return null;
    }
    const session = {
      ...(parsed as WorkAuthSession),
      auth_mode: parsed?.auth_mode === "partner_user" ? "partner_user" : "env_admin",
      access_token: "",
    } as WorkAuthSession;
    if (isWorkSessionExpired(session)) {
      window.sessionStorage.removeItem(WORK_AUTH_STORAGE_KEY);
      return null;
    }
    if (session.auth_mode === "partner_user" && !Number.isFinite(Number(session.user?.organization_id))) {
      window.sessionStorage.removeItem(WORK_AUTH_STORAGE_KEY);
      return null;
    }
    if (
      session.auth_mode === "partner_user" &&
      (session.user?.organization_is_active === false ||
        String(session.user?.organization_status || "").trim().toLowerCase() === "suspended")
    ) {
      window.sessionStorage.removeItem(WORK_AUTH_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    window.sessionStorage.removeItem(WORK_AUTH_STORAGE_KEY);
    return null;
  }
};

export const isWorkAuthed = () => Boolean(getWorkAuthSession());

export const setWorkAuthed = (session?: Partial<WorkAuthSession>) => {
  if (typeof window === "undefined") return;
  if (!session || !session.user) {
    window.sessionStorage.removeItem(WORK_AUTH_STORAGE_KEY);
    return;
  }
  const normalized: WorkAuthSession = {
    authed: true,
    auth_mode: (session.auth_mode as "env_admin" | "partner_user") || "env_admin",
    logged_in_at: session.logged_in_at || new Date().toISOString(),
    access_token: "",
    session_uid: String(session.session_uid || "").trim() || null,
    expires_at: String(session.expires_at || "").trim() || null,
    idle_timeout_at: String(session.idle_timeout_at || "").trim() || null,
    mfa_enabled: Boolean(session.mfa_enabled),
    mfa_verified: Boolean(session.mfa_verified),
    user: session.user as WorkAuthUser,
  };
  window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
  window.sessionStorage.setItem(WORK_AUTH_STORAGE_KEY, JSON.stringify(normalized));
};

export const clearWorkAuthed = () => {
  if (typeof window === "undefined") return;
  revokeStoredWorkSession();
  window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(WORK_AUTH_STORAGE_KEY);
};

export const loginWork = async (params: { username: string; password: string; organization_id?: number | null }) => {
  const username = params.username.trim();
  const password = params.password;
  if (!username || !password) {
    throw new Error("Username and password are required");
  }
  const res = await api.post<WorkLoginResponse>("/green/work-auth/login", {
    username,
    password,
    organization_id: params.organization_id ?? null,
  });
  const payload = res.data || {};
  const session: WorkAuthSession = {
    authed: true,
    auth_mode: payload?.auth_mode === "partner_user" ? "partner_user" : "env_admin",
    logged_in_at: new Date().toISOString(),
    access_token: "",
    session_uid: String(payload?.session_uid || "").trim() || null,
    expires_at: String(payload?.expires_at || "").trim() || null,
    idle_timeout_at: String(payload?.idle_timeout_at || "").trim() || null,
    mfa_enabled: Boolean(payload?.mfa_enabled),
    mfa_verified: Boolean(payload?.mfa_verified),
    user: payload?.user || {
      id: 0,
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
  setWorkAuthed(session);
  return session;
};

export const registerWork = async (params: {
  organization_name: string;
  full_name: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<WorkRegistrationResult> => {
  const organization_name = params.organization_name.trim();
  const full_name = params.full_name.trim();
  const email = params.email.trim();
  if (!organization_name || !full_name || !email || !params.password) {
    throw new Error("Organization name, your name, email and password are required.");
  }
  const res = await api.post<WorkLoginResponse>("/green/work-auth/register", {
    organization_name,
    full_name,
    email,
    password: params.password,
    phone: params.phone?.trim() || undefined,
  });
  const payload = res.data || {};
  if (payload.verification_required) {
    return {
      verification_required: true,
      email: payload.email || email,
      message: payload.message || "Check your email to verify your address before signing in.",
    };
  }
  if (!payload.user) {
    throw new Error("Registration did not return a valid session.");
  }
  const session: WorkAuthSession = {
    authed: true,
    auth_mode: payload?.auth_mode === "partner_user" ? "partner_user" : "env_admin",
    logged_in_at: new Date().toISOString(),
    access_token: "",
    session_uid: String(payload?.session_uid || "").trim() || null,
    expires_at: String(payload?.expires_at || "").trim() || null,
    idle_timeout_at: String(payload?.idle_timeout_at || "").trim() || null,
    mfa_enabled: Boolean(payload?.mfa_enabled),
    mfa_verified: Boolean(payload?.mfa_verified),
    user: payload.user,
  };
  setWorkAuthed(session);
  return session;
};
