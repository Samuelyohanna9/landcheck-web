import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadSurveyPlanDraft,
  migrateAnonymousSurveyPlanDraft,
  saveSurveyPlanDraft,
} from "./surveyPlanDraft";
import { getAnonymousSurveyLocalScope } from "./surveyLocalScope";

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

describe("Survey draft authentication handoff", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("copies the pending anonymous draft into the authenticated scope without deleting it", async () => {
    const localStorage = makeStorage();
    const sessionStorage = makeStorage();
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("sessionStorage", sessionStorage);
    vi.stubGlobal("window", { localStorage, sessionStorage });

    const anonymousScope = getAnonymousSurveyLocalScope();
    const state = {
      manualPoints: [
        { station: "A", lng: 7.1, lat: 9.2 },
        { station: "B", lng: 7.2, lat: 9.2 },
        { station: "C", lng: 7.2, lat: 9.3 },
      ],
      meta: { scale_text: "1 : 2500", paper_size: "A3" },
    };
    await saveSurveyPlanDraft("active", state, anonymousScope);

    sessionStorage.setItem(
      "landcheck_survey_auth",
      JSON.stringify({ authed: true, user: { id: 42, organization_id: 9, role_key: "surveyor" } }),
    );

    await expect(migrateAnonymousSurveyPlanDraft()).resolves.toBe(true);
    const migrated = await loadSurveyPlanDraft("active");
    expect(migrated?.state).toEqual(state);
    const anonymousDraft = await loadSurveyPlanDraft("active", anonymousScope);
    expect(anonymousDraft?.state).toEqual(state);
  });
});
