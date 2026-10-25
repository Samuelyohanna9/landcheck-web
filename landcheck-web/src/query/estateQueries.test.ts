import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  ESTATE_MUTATION_INVALIDATIONS,
  ESTATE_QUERY_POLLING_INTERVALS,
  estatePollingQueryOptions,
  estateQueryKeys,
  getEstateQueryScope,
  invalidateEstateMutation,
  invalidateEstateResourcesAcrossEstates,
} from "./estateQueries";
import { assertEstateQueryEpoch, clearEstateQueryCache, estateQueryClient, getEstateQueryEpoch } from "./estateQueryClient";

const ownerSession = {
  authed: true as const,
  logged_in_at: "2026-01-01T00:00:00Z",
  access_token: "",
  session_uid: "session-a",
  expires_at: "2099-01-01T00:00:00Z",
  user: {
    id: 10,
    full_name: "Owner",
    email: "owner@example.com",
    organization_id: 4,
    role_key: "owner",
    permissions: ["plots.read", "plots.write"],
  },
};

describe("Estate query scope and cache behavior", () => {
  it("deduplicates concurrent reads with the same scoped key", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const scope = getEstateQueryScope(ownerSession);
    const key = estateQueryKeys.estate(scope, 8, "dashboard");
    let calls = 0;
    const queryFn = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { total_plots: 12 };
    };

    const [first, second] = await Promise.all([
      client.fetchQuery({ queryKey: key, queryFn }),
      client.fetchQuery({ queryKey: key, queryFn }),
    ]);

    expect(first).toEqual(second);
    expect(calls).toBe(1);
    client.clear();
  });

  it("keeps organization, user, role, and permission scopes isolated", () => {
    const ownerScope = getEstateQueryScope(ownerSession);
    const otherOrganizationScope = getEstateQueryScope({
      ...ownerSession,
      user: { ...ownerSession.user, organization_id: 5 },
    });
    const otherUserScope = getEstateQueryScope({
      ...ownerSession,
      user: { ...ownerSession.user, id: 11 },
    });
    const otherPermissionScope = getEstateQueryScope({
      ...ownerSession,
      user: { ...ownerSession.user, permissions: ["plots.read"] },
    });

    expect(estateQueryKeys.estate(ownerScope, 8, "plots")).not.toEqual(estateQueryKeys.estate(otherOrganizationScope, 8, "plots"));
    expect(estateQueryKeys.estate(ownerScope, 8, "plots")).not.toEqual(estateQueryKeys.estate(otherUserScope, 8, "plots"));
    expect(estateQueryKeys.estate(ownerScope, 8, "plots")).not.toEqual(estateQueryKeys.estate(otherPermissionScope, 8, "plots"));
  });

  it("does not deduplicate requests across authorization scopes", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ownerScope = getEstateQueryScope(ownerSession);
    const otherOrganizationScope = getEstateQueryScope({
      ...ownerSession,
      user: { ...ownerSession.user, organization_id: 5 },
    });
    const calls: string[] = [];
    const read = async (scopeName: string) => {
      calls.push(scopeName);
      return scopeName;
    };

    await Promise.all([
      client.fetchQuery({ queryKey: estateQueryKeys.estate(ownerScope, 8, "plots"), queryFn: () => read("owner") }),
      client.fetchQuery({ queryKey: estateQueryKeys.estate(otherOrganizationScope, 8, "plots"), queryFn: () => read("other-org") }),
    ]);

    expect(calls.sort()).toEqual(["other-org", "owner"]);
    client.clear();
  });

  it("changes the key when switching estates", () => {
    const scope = getEstateQueryScope(ownerSession);
    expect(estateQueryKeys.estate(scope, 8, "dashboard")).not.toEqual(estateQueryKeys.estate(scope, 9, "dashboard"));
  });

  it("invalidates only the targeted Estate resource", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const scope = getEstateQueryScope(ownerSession);
    const dashboardKey = estateQueryKeys.estate(scope, 8, "dashboard");
    const plotsKey = estateQueryKeys.estate(scope, 8, "plots");
    client.setQueryData(dashboardKey, { total_plots: 1 });
    client.setQueryData(plotsKey, { features: [] });

    await client.invalidateQueries({ queryKey: dashboardKey });

    expect(client.getQueryState(dashboardKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(plotsKey)?.isInvalidated).toBe(false);
    client.clear();
  });

  it("stops polling in hidden tabs and resumes on focus/reconnect", () => {
    expect(estatePollingQueryOptions(ESTATE_QUERY_POLLING_INTERVALS.liveInspections)).toMatchObject({
      refetchInterval: 20000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      networkMode: "online",
    });
  });

  it("clears sensitive Estate data on logout cache reset", () => {
    const scope = getEstateQueryScope(ownerSession);
    const key = estateQueryKeys.estate(scope, 8, "payments");
    estateQueryClient.setQueryData(key, { items: [{ id: 1, amount: 100 }] });
    clearEstateQueryCache();
    expect(estateQueryClient.getQueryData(key)).toBeUndefined();
  });

  it("rejects a response from the previous session after the cache is cleared", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const scope = getEstateQueryScope(ownerSession);
    const key = estateQueryKeys.estate(scope, 8, "dashboard");
    let releaseRequest!: () => void;
    const requestFinished = new Promise<void>((resolve) => { releaseRequest = resolve; });

    const request = client.fetchQuery({
      queryKey: key,
      queryFn: async () => {
        const requestEpoch = getEstateQueryEpoch();
        await requestFinished;
        assertEstateQueryEpoch(requestEpoch);
        return { total_plots: 99 };
      },
    });

    clearEstateQueryCache();
    client.clear();
    releaseRequest();

    await expect(request).rejects.toBeTruthy();
    expect(client.getQueryData(key)).toBeUndefined();
    expect(() => assertEstateQueryEpoch(getEstateQueryEpoch() - 1)).toThrow("session changed");
    client.clear();
  });

  it("invalidates all dependent resources for an allocation mutation", async () => {
    const scope = getEstateQueryScope(ownerSession);
    const dependentAreas = ESTATE_MUTATION_INVALIDATIONS.allocation;
    const cachedAreas = [...dependentAreas, "public-settings" as const];
    for (const area of cachedAreas) {
      estateQueryClient.setQueryData(estateQueryKeys.estate(scope, 8, area), { area });
    }

    await invalidateEstateMutation(scope, 8, "allocation");

    for (const area of dependentAreas) {
      expect(estateQueryClient.getQueryState(estateQueryKeys.estate(scope, 8, area))?.isInvalidated).toBe(true);
    }
    expect(estateQueryClient.getQueryState(estateQueryKeys.estate(scope, 8, "public-settings"))?.isInvalidated).toBe(false);
    clearEstateQueryCache();
  });

  it("invalidates matching resources across visited estates without crossing scope", async () => {
    const scope = getEstateQueryScope(ownerSession);
    const otherOrganizationScope = getEstateQueryScope({
      ...ownerSession,
      user: { ...ownerSession.user, organization_id: 5 },
    });
    const firstEstateKey = estateQueryKeys.estate(scope, 8, "payments");
    const secondEstateKey = estateQueryKeys.estate(scope, 9, "payments");
    const otherScopeKey = estateQueryKeys.estate(otherOrganizationScope, 8, "payments");
    estateQueryClient.setQueryData(firstEstateKey, { items: [] });
    estateQueryClient.setQueryData(secondEstateKey, { items: [] });
    estateQueryClient.setQueryData(otherScopeKey, { items: [] });

    await invalidateEstateResourcesAcrossEstates(scope, ["payments"]);

    expect(estateQueryClient.getQueryState(firstEstateKey)?.isInvalidated).toBe(true);
    expect(estateQueryClient.getQueryState(secondEstateKey)?.isInvalidated).toBe(true);
    expect(estateQueryClient.getQueryState(otherScopeKey)?.isInvalidated).toBe(false);
    clearEstateQueryCache();
  });

  it("does not automatically retry failed reads but allows an explicit retry", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ["estate", "temporary-failure"];
    let calls = 0;
    const queryFn = async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary API failure");
      return "recovered";
    };

    await expect(client.fetchQuery({ queryKey: key, queryFn })).rejects.toThrow("temporary API failure");
    expect(calls).toBe(1);
    await expect(client.fetchQuery({ queryKey: key, queryFn })).resolves.toBe("recovered");
    expect(calls).toBe(2);
    client.clear();
  });

  it("does not retry transactional mutations by default", () => {
    expect(estateQueryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });
});
