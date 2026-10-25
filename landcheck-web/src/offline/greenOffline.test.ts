import { describe, expect, it } from "vitest";
import { buildGreenOfflineScopeKey } from "./greenOffline";

const baseScope = {
  userId: 42,
  organizationId: 7,
  roleKey: "field_agent",
  authMode: "green",
  appMode: "green_work",
  allowGreen: true,
  allowWork: true,
};

describe("Green offline authorization scope", () => {
  it("is deterministic for the same authenticated context", () => {
    expect(buildGreenOfflineScopeKey(baseScope)).toBe(buildGreenOfflineScopeKey({ ...baseScope }));
  });

  it("separates users, organizations, roles, and permission context", () => {
    const original = buildGreenOfflineScopeKey(baseScope);
    expect(buildGreenOfflineScopeKey({ ...baseScope, userId: 43 })).not.toBe(original);
    expect(buildGreenOfflineScopeKey({ ...baseScope, organizationId: 8 })).not.toBe(original);
    expect(buildGreenOfflineScopeKey({ ...baseScope, roleKey: "sponsor" })).not.toBe(original);
    expect(buildGreenOfflineScopeKey({ ...baseScope, allowWork: false })).not.toBe(original);
  });
});
