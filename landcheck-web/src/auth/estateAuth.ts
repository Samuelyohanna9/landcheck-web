import { api } from "../api/client";

export const ESTATE_AUTH_STORAGE_KEY = "landcheck_estate_auth";

export type EstateAuthUser = {
  id: number;
  account_uid?: string;
  full_name: string;
  email: string;
  role_key?: string | null;
  permissions?: string[];
  must_change_password?: boolean;
  organization_id: number;
  organization_name?: string | null;
  organization_slug?: string | null;
};

export type EstateAuthSession = {
  authed: true;
  logged_in_at: string;
  access_token: string;
  session_uid: string;
  expires_at: string;
  user: EstateAuthUser;
};

type EstateAuthResponse = {
  access_token?: string | null;
  session_uid?: string | null;
  expires_at?: string | null;
  user?: EstateAuthUser;
  verification_required?: boolean;
  email?: string;
  message?: string;
};

export type EstateRegistrationResult = EstateAuthSession | {
  verification_required: true;
  email: string;
  message: string;
};

const isExpired = (value: string | null | undefined) => {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
};

const normalizeSession = (payload: EstateAuthResponse): EstateAuthSession => {
  if (!payload.user || !payload.session_uid || !payload.expires_at) {
    throw new Error("Estate sign-in did not return a valid session.");
  }
  return {
    authed: true,
    logged_in_at: new Date().toISOString(),
    access_token: "",
    session_uid: payload.session_uid,
    expires_at: payload.expires_at,
    user: payload.user,
  };
};

export const getEstateAuthSession = (): EstateAuthSession | null => {
  if (typeof window === "undefined") return null;
  window.localStorage.removeItem(ESTATE_AUTH_STORAGE_KEY);
  const raw = window.sessionStorage.getItem(ESTATE_AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as EstateAuthSession;
    if (!session?.authed || !session.user || isExpired(session.expires_at)) {
      window.sessionStorage.removeItem(ESTATE_AUTH_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    window.sessionStorage.removeItem(ESTATE_AUTH_STORAGE_KEY);
    return null;
  }
};

export const isEstateAuthed = () => Boolean(getEstateAuthSession());

export const setEstateAuthSession = (session: EstateAuthSession) => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ESTATE_AUTH_STORAGE_KEY);
    window.sessionStorage.setItem(ESTATE_AUTH_STORAGE_KEY, JSON.stringify({ ...session, access_token: "" }));
  }
};

export const clearEstateAuthSession = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ESTATE_AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(ESTATE_AUTH_STORAGE_KEY);
  void api.post("/estates/auth/logout", {}).catch(() => undefined);
};

export const loginEstate = async (email: string, password: string) => {
  const response = await api.post<EstateAuthResponse>("/estates/auth/login", { email: email.trim(), password });
  const session = normalizeSession(response.data || {});
  setEstateAuthSession(session);
  return session;
};

export const changeEstatePassword = async (currentPassword: string, newPassword: string) => {
  const session = getEstateAuthSession();
  if (!session) throw new Error("Sign in again to change your password.");
  await api.post(
    "/estates/auth/change-password",
    { current_password: currentPassword, new_password: newPassword },
  );
  setEstateAuthSession({ ...session, user: { ...session.user, must_change_password: false } });
};

export const registerEstate = async (params: { organization_name: string; organization_slug?: string; full_name: string; email: string; password: string; accept_dpa: boolean }): Promise<EstateRegistrationResult> => {
  const response = await api.post<EstateAuthResponse>("/estates/auth/register", {
    ...params,
    organization_name: params.organization_name.trim(),
    organization_slug: params.organization_slug?.trim() || undefined,
    full_name: params.full_name.trim(),
    email: params.email.trim(),
  });
  if (response.data?.verification_required) {
    return {
      verification_required: true,
      email: response.data.email || params.email,
      message: response.data.message || "Check your email to verify your address before signing in.",
    };
  }
  const session = normalizeSession(response.data || {});
  setEstateAuthSession(session);
  return session;
};
