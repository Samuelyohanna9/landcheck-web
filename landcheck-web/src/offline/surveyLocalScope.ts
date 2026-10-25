const SURVEY_AUTH_STORAGE_KEY = "landcheck_survey_auth";
const ANONYMOUS_SCOPE_STORAGE_KEY = "landcheck_survey_anonymous_scope";

type SurveyStoredSession = {
  authed?: boolean;
  user?: {
    id?: number | null;
    organization_id?: number | null;
    role_key?: string | null;
    role?: string | null;
  } | null;
};

const encodePart = (value: unknown) => encodeURIComponent(String(value ?? "").trim() || "-");

function readAuthenticatedScope(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(SURVEY_AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SurveyStoredSession;
    const userId = Number(parsed?.user?.id || 0);
    if (!parsed?.authed || !Number.isFinite(userId) || userId <= 0) return null;
    return [
      "user",
      encodePart(userId),
      "org",
      encodePart(parsed.user?.organization_id ?? "none"),
      "role",
      encodePart(parsed.user?.role_key || parsed.user?.role || "unknown"),
    ].join(":");
  } catch {
    return null;
  }
}

function getAnonymousScopeId(): string {
  if (typeof window === "undefined") return "server";
  const existing = String(window.localStorage.getItem(ANONYMOUS_SCOPE_STORAGE_KEY) || "").trim();
  if (existing) return existing;
  const generated = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(ANONYMOUS_SCOPE_STORAGE_KEY, generated);
  return generated;
}

export const getSurveyLocalScope = (): string => readAuthenticatedScope() || `anonymous:${getAnonymousScopeId()}`;

export const getAnonymousSurveyLocalScope = (): string => `anonymous:${getAnonymousScopeId()}`;

export const surveyLocalStorageKey = (baseKey: string, scope = getSurveyLocalScope()): string =>
  `${baseKey}::${scope}`;

export const surveyLocalScopeKey = (baseKey: string, anonymous = false): string =>
  surveyLocalStorageKey(baseKey, anonymous ? getAnonymousSurveyLocalScope() : getSurveyLocalScope());
