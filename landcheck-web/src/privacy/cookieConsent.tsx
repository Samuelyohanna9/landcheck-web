import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const COOKIE_CONSENT_VERSION = "2026-07-21-v1";
export const COOKIE_POLICY_STORAGE_KEY = `landcheck_cookie_preferences:${COOKIE_CONSENT_VERSION}`;
const COOKIE_CONSENT_EVENT = "landcheck:cookie-consent-change";

export type CookiePreferences = {
  essential: true;
  experience: boolean;
  measurement: boolean;
};

export type CookieConsentMethod = "accept_all" | "essential_only" | "custom";

export type CookieConsentRecord = {
  version: string;
  updatedAt: string;
  method: CookieConsentMethod;
  preferences: CookiePreferences;
};

export const defaultCookiePreferences: CookiePreferences = {
  essential: true,
  experience: false,
  measurement: false,
};

const normalizePreferences = (
  input?: Partial<CookiePreferences> | null,
): CookiePreferences => ({
  essential: true,
  experience: Boolean(input?.experience),
  measurement: Boolean(input?.measurement),
});

const normalizeRecord = (input: unknown): CookieConsentRecord | null => {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<CookieConsentRecord>;
  if (String(raw.version || "") !== COOKIE_CONSENT_VERSION) return null;
  return {
    version: COOKIE_CONSENT_VERSION,
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
    method:
      raw.method === "accept_all" || raw.method === "essential_only" || raw.method === "custom"
        ? raw.method
        : "custom",
    preferences: normalizePreferences(raw.preferences),
  };
};

export const readCookieConsentRecord = (): CookieConsentRecord | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_POLICY_STORAGE_KEY);
    if (!raw) return null;
    return normalizeRecord(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const writeCookieConsentRecord = (record: CookieConsentRecord) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COOKIE_POLICY_STORAGE_KEY, JSON.stringify(record));
    window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: record }));
  } catch {
    // Ignore storage failures and keep the UI usable.
  }
};

type CookieConsentContextValue = {
  ready: boolean;
  hasDecision: boolean;
  record: CookieConsentRecord | null;
  preferences: CookiePreferences;
  saveConsent: (preferences: Partial<CookiePreferences>, method: CookieConsentMethod) => void;
  acceptAll: () => void;
  acceptEssentialOnly: () => void;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<CookieConsentRecord | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setRecord(readCookieConsentRecord());
    setReady(true);

    const syncFromStorage = (event?: StorageEvent | Event) => {
      if (event instanceof StorageEvent && event.key && event.key !== COOKIE_POLICY_STORAGE_KEY) return;
      setRecord(readCookieConsentRecord());
    };

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(COOKIE_CONSENT_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(COOKIE_CONSENT_EVENT, syncFromStorage);
    };
  }, []);

  const saveConsent = useCallback((preferences: Partial<CookiePreferences>, method: CookieConsentMethod) => {
    const next: CookieConsentRecord = {
      version: COOKIE_CONSENT_VERSION,
      updatedAt: new Date().toISOString(),
      method,
      preferences: normalizePreferences(preferences),
    };
    setRecord(next);
    writeCookieConsentRecord(next);
  }, []);

  const acceptAll = useCallback(() => {
    saveConsent({ experience: true, measurement: true }, "accept_all");
  }, [saveConsent]);

  const acceptEssentialOnly = useCallback(() => {
    saveConsent({ experience: false, measurement: false }, "essential_only");
  }, [saveConsent]);

  const value = useMemo<CookieConsentContextValue>(
    () => ({
      ready,
      hasDecision: Boolean(record),
      record,
      preferences: record?.preferences || defaultCookiePreferences,
      saveConsent,
      acceptAll,
      acceptEssentialOnly,
    }),
    [acceptAll, acceptEssentialOnly, ready, record, saveConsent],
  );

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>;
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext);
  if (!context) {
    throw new Error("useCookieConsent must be used within CookieConsentProvider");
  }
  return context;
}
