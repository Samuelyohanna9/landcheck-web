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
  organization_logo_url?: string | null;
};

export type WorkAuthSession = {
  authed: true;
  auth_mode: "env_admin" | "partner_user";
  logged_in_at: string;
  user: WorkAuthUser;
};

export const getWorkCredentials = () => {
  const username = String(import.meta.env.VITE_WORK_USERNAME || "admin").trim();
  const password = String(import.meta.env.VITE_WORK_PASSWORD || "landcheckwork").trim();
  return { username, password };
};

export const getWorkAuthSession = (): WorkAuthSession | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(WORK_AUTH_STORAGE_KEY);
  if (!raw) return null;
  if (raw === "1") {
    // Legacy flag-only sessions are no longer accepted because they bypass org-scoped login.
    window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!(parsed && parsed.authed && parsed.user)) {
      window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
      return null;
    }
    const session = parsed as WorkAuthSession;
    if (session.auth_mode === "partner_user" && !Number.isFinite(Number(session.user?.organization_id))) {
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
  if (!session || !session.user) {
    window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
    return;
  }
  const normalized: WorkAuthSession = {
    authed: true,
    auth_mode: (session.auth_mode as "env_admin" | "partner_user") || "env_admin",
    logged_in_at: session.logged_in_at || new Date().toISOString(),
    user: session.user as WorkAuthUser,
  };
  window.localStorage.setItem(WORK_AUTH_STORAGE_KEY, JSON.stringify(normalized));
};

export const clearWorkAuthed = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(WORK_AUTH_STORAGE_KEY);
};

export const validateWorkLogin = (username: string, password: string) => {
  const expected = getWorkCredentials();
  return username.trim() === expected.username && password === expected.password;
};

export const loginWork = async (params: { username: string; password: string; organization_id?: number | null }) => {
  const username = params.username.trim();
  const password = params.password;
  if (!username || !password) {
    throw new Error("Username and password are required");
  }
  const res = await api.post("/green/work-auth/login", {
    username,
    password,
    organization_id: params.organization_id ?? null,
  });
  const payload = res.data || {};
  const session: WorkAuthSession = {
    authed: true,
    auth_mode: payload?.auth_mode === "partner_user" ? "partner_user" : "env_admin",
    logged_in_at: new Date().toISOString(),
    user: payload?.user || {
      id: 0,
      full_name: "System Admin",
      role: "super_admin",
      role_key: "super_admin",
      role_name: "Super Admin",
      allow_work: true,
      allow_green: true,
    },
  };
  setWorkAuthed(session);
  return session;
};
