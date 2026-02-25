import { api } from "../api/client";

export const GREEN_AUTH_STORAGE_KEY = "landcheck_green_auth";

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
};

export type GreenAuthSession = {
  authed: true;
  auth_mode: "env_admin" | "partner_user";
  logged_in_at: string;
  user: GreenAuthUser;
};

export const getGreenAuthSession = (): GreenAuthSession | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(GREEN_AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.authed && parsed.user) {
      const session = parsed as GreenAuthSession;
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
  const payload = res.data || {};
  const session: GreenAuthSession = {
    authed: true,
    auth_mode: payload?.auth_mode === "partner_user" ? "partner_user" : "env_admin",
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
  setGreenAuthed(session);
  return session;
};
