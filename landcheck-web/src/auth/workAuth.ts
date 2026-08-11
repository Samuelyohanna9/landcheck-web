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

const revokeStoredWorkSession = (session: Partial<WorkAuthSession> | null | undefined) => {
  const accessToken = String(session?.access_token || "").trim();
  if (!accessToken) return;
  void api.post(
    "/green/auth/logout",
    {},
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  ).catch(() => undefined);
};

export const getWorkCredentials = () => {
  const username = String(import.meta.env.VITE_WORK_USERNAME || "").trim();
  const password = String(import.meta.env.VITE_WORK_PASSWORD || "").trim();
  if (!username || !password) return null;
  return { username, password };
};

export const getWorkAuthSession = (): WorkAuthSession | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(WORK_AUTH_STORAGE_KEY);
  if (!raw) return null;
  if (raw === "1") {
    window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!(parsed && parsed.authed && parsed.user)) {
      window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
      return null;
    }
    const session = {
      ...(parsed as WorkAuthSession),
      auth_mode: parsed?.auth_mode === "partner_user" ? "partner_user" : "env_admin",
      access_token: String(parsed?.access_token || "").trim(),
    } as WorkAuthSession;
    if (!session.access_token || isWorkSessionExpired(session)) {
      window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
      return null;
    }
    if (session.auth_mode === "partner_user" && !Number.isFinite(Number(session.user?.organization_id))) {
      window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
      return null;
    }
    if (
      session.auth_mode === "partner_user" &&
      (session.user?.organization_is_active === false ||
        String(session.user?.organization_status || "").trim().toLowerCase() === "suspended")
    ) {
      window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
    return null;
  }
};

export const isWorkAuthed = () => Boolean(getWorkAuthSession());

export const setWorkAuthed = (session?: Partial<WorkAuthSession>) => {
  if (typeof window === "undefined") return;
  if (!session || !session.user || !String(session.access_token || "").trim()) {
    window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
    return;
  }
  const normalized: WorkAuthSession = {
    authed: true,
    auth_mode: (session.auth_mode as "env_admin" | "partner_user") || "env_admin",
    logged_in_at: session.logged_in_at || new Date().toISOString(),
    access_token: String(session.access_token || "").trim(),
    session_uid: String(session.session_uid || "").trim() || null,
    expires_at: String(session.expires_at || "").trim() || null,
    idle_timeout_at: String(session.idle_timeout_at || "").trim() || null,
    mfa_enabled: Boolean(session.mfa_enabled),
    mfa_verified: Boolean(session.mfa_verified),
    user: session.user as WorkAuthUser,
  };
  window.localStorage.setItem(WORK_AUTH_STORAGE_KEY, JSON.stringify(normalized));
};

export const clearWorkAuthed = () => {
  if (typeof window === "undefined") return;
  const existing = getWorkAuthSession();
  revokeStoredWorkSession(existing);
  window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
};

export const validateWorkLogin = (username: string, password: string) => {
  const expected = getWorkCredentials();
  if (!expected) return false;
  return username.trim() === expected.username && password === expected.password;
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
  const accessToken = String(payload?.access_token || "").trim();
  if (!accessToken) {
    throw new Error("Authenticated session token was not returned by the server.");
  }
  const session: WorkAuthSession = {
    authed: true,
    auth_mode: payload?.auth_mode === "partner_user" ? "partner_user" : "env_admin",
    logged_in_at: new Date().toISOString(),
    access_token: accessToken,
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
