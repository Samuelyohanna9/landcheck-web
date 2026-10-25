import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  assertGreenQueryEpoch,
  clearGreenQueryCache,
  getGreenQueryEpoch,
  getGreenQueryScope,
  greenPollingQueryOptions,
  greenQueryClient,
  greenQueryKeys,
  invalidateGreenProjectQueries,
  shouldRunGreenPoll,
  useGreenVisibilityAwarePolling,
} from "./greenQueries";

const workSession = {
  auth_mode: "partner_user",
  user: {
    id: 10,
    organization_id: 4,
    role_key: "admin",
    permissions: ["projects.read", "trees.write"],
  },
};

describe("Green query scope and caching", () => {
  it("deduplicates concurrent reads with the same authorization and project key", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const scope = getGreenQueryScope(workSession, "work");
    const key = greenQueryKeys.project(scope, 8, "trees");
    let calls = 0;
    const queryFn = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return [{ id: 1 }];
    };

    await Promise.all([
      client.fetchQuery({ queryKey: key, queryFn }),
      client.fetchQuery({ queryKey: key, queryFn }),
    ]);

    expect(calls).toBe(1);
    client.clear();
  });

  it("isolates product, organization, user, role, and permission scopes", () => {
    const workScope = getGreenQueryScope(workSession, "work");
    const fieldScope = getGreenQueryScope(workSession, "green");
    const otherOrganizationScope = getGreenQueryScope({
      ...workSession,
      user: { ...workSession.user, organization_id: 5 },
    }, "work");
    const otherUserScope = getGreenQueryScope({
      ...workSession,
      user: { ...workSession.user, id: 11 },
    }, "work");
    const otherRoleScope = getGreenQueryScope({
      ...workSession,
      user: { ...workSession.user, role_key: "field_officer" },
    }, "work");
    const otherPermissionScope = getGreenQueryScope({
      ...workSession,
      user: { ...workSession.user, permissions: ["projects.read"] },
    }, "work");

    const key = (scope: typeof workScope) => greenQueryKeys.project(scope, 8, "trees");
    expect(key(workScope)).not.toEqual(key(fieldScope));
    expect(key(workScope)).not.toEqual(key(otherOrganizationScope));
    expect(key(workScope)).not.toEqual(key(otherUserScope));
    expect(key(workScope)).not.toEqual(key(otherRoleScope));
    expect(key(workScope)).not.toEqual(key(otherPermissionScope));
  });

  it("invalidates only the selected project's dependent resources", async () => {
    const scope = getGreenQueryScope(workSession, "work");
    const treesKey = greenQueryKeys.project(scope, 8, "trees");
    const otherProjectKey = greenQueryKeys.project(scope, 9, "trees");
    const otherScopeKey = greenQueryKeys.project(getGreenQueryScope({
      ...workSession,
      user: { ...workSession.user, organization_id: 5 },
    }, "work"), 8, "trees");
    greenQueryClient.setQueryData(treesKey, [{ id: 1 }]);
    greenQueryClient.setQueryData(otherProjectKey, [{ id: 2 }]);
    greenQueryClient.setQueryData(otherScopeKey, [{ id: 3 }]);

    await invalidateGreenProjectQueries(scope, 8, ["trees"]);

    expect(greenQueryClient.getQueryState(treesKey)?.isInvalidated).toBe(true);
    expect(greenQueryClient.getQueryState(otherProjectKey)?.isInvalidated).toBe(false);
    expect(greenQueryClient.getQueryState(otherScopeKey)?.isInvalidated).toBe(false);
    clearGreenQueryCache();
  });

  it("rejects a late response after the Green session cache is cleared", async () => {
    const scope = getGreenQueryScope(workSession, "work");
    const key = greenQueryKeys.project(scope, 8, "dashboard");
    let releaseRequest!: () => void;
    const requestFinished = new Promise<void>((resolve) => { releaseRequest = resolve; });
    const epoch = getGreenQueryEpoch();
    const request = greenQueryClient.fetchQuery({
      queryKey: key,
      queryFn: async () => {
        await requestFinished;
        assertGreenQueryEpoch(epoch);
        return { total: 99 };
      },
    });

    clearGreenQueryCache();
    releaseRequest();

    await expect(request).rejects.toBeTruthy();
    expect(() => assertGreenQueryEpoch(epoch)).toThrow("Green session changed");
    expect(greenQueryClient.getQueryData(key)).toBeUndefined();
  });

  it("uses hidden-tab and reconnect-safe polling settings", () => {
    expect(greenPollingQueryOptions(45000)).toMatchObject({
      refetchInterval: 45000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      networkMode: "online",
    });
    expect(shouldRunGreenPoll("hidden", true, false)).toBe(false);
    expect(shouldRunGreenPoll("visible", false, false)).toBe(false);
    expect(shouldRunGreenPoll("visible", true, true)).toBe(false);
    expect(shouldRunGreenPoll("visible", true, false)).toBe(true);
    expect(typeof useGreenVisibilityAwarePolling).toBe("function");
  });
});
