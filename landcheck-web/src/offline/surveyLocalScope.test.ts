import { describe, expect, it } from "vitest";
import { surveyLocalStorageKey } from "./surveyLocalScope";

describe("Survey local storage scope", () => {
  it("keeps the same logical key separate for different account scopes", () => {
    expect(surveyLocalStorageKey("landcheck_plots", "user:1:org:2:role:surveyor"))
      .not.toBe(surveyLocalStorageKey("landcheck_plots", "user:3:org:2:role:surveyor"));
  });

  it("preserves anonymous and authenticated namespaces as distinct", () => {
    expect(surveyLocalStorageKey("landcheck_georef_sessions", "anonymous:browser-a"))
      .not.toBe(surveyLocalStorageKey("landcheck_georef_sessions", "user:1:org:2:role:surveyor"));
  });
});
