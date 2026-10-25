import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_CONSENT_VERSION,
  COOKIE_POLICY_STORAGE_KEY,
} from "../privacy/cookieConsent";
import { trackConversion } from "./conversionEvents";

type MemoryStorage = Storage & { values: Map<string, string> };

const makeStorage = (): MemoryStorage => {
  const values = new Map<string, string>();
  return {
    values,
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } as MemoryStorage;
};

describe("conversion tracking", () => {
  let localStorage: MemoryStorage;
  let sessionStorage: MemoryStorage;
  let dispatchEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage = makeStorage();
    sessionStorage = makeStorage();
    dispatchEvent = vi.fn();
    vi.stubGlobal("window", { localStorage, sessionStorage, dispatchEvent });
    vi.stubGlobal("CustomEvent", class {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  const grantMeasurementConsent = (measurement: boolean) => {
    localStorage.setItem(
      COOKIE_POLICY_STORAGE_KEY,
      JSON.stringify({
        version: COOKIE_CONSENT_VERSION,
        updatedAt: "2026-10-25T00:00:00.000Z",
        method: "custom",
        preferences: { essential: true, experience: false, measurement },
      }),
    );
  };

  it("does not emit an event before measurement consent", () => {
    expect(trackConversion("estate_demo_request", { submission: "completed" }, "request-1")).toBe(false);
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(sessionStorage.values.size).toBe(0);
  });

  it("emits one sanitized event per dedupe key after consent", () => {
    grantMeasurementConsent(true);
    const gtag = vi.fn();
    (window as Window & { gtag?: (...args: unknown[]) => void }).gtag = gtag;

    expect(trackConversion("survey_export_completed", { format: "pdf", empty: "", omitted: undefined }, "export-1")).toBe(true);
    expect(trackConversion("survey_export_completed", { format: "pdf" }, "export-1")).toBe(false);
    expect(gtag).toHaveBeenCalledOnce();
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      name: "survey_export_completed",
      parameters: { format: "pdf" },
    });
  });

  it("keeps analytics disabled when the saved consent record is invalid", () => {
    localStorage.setItem(COOKIE_POLICY_STORAGE_KEY, JSON.stringify({ version: "old-version" }));
    expect(trackConversion("survey_workspace_open", { source: "survey_landing" }, "workspace-1")).toBe(false);
  });

  it("still deduplicates when session storage is unavailable", () => {
    grantMeasurementConsent(true);
    sessionStorage.getItem = () => { throw new Error("storage unavailable"); };
    sessionStorage.setItem = () => { throw new Error("storage unavailable"); };
    expect(trackConversion("survey_workspace_open", { source: "survey_landing" }, "memory-1")).toBe(true);
    expect(trackConversion("survey_workspace_open", { source: "survey_landing" }, "memory-1")).toBe(false);
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });
});
