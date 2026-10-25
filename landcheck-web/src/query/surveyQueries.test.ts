import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import {
  assertSurveyQueryEpoch,
  clearSurveyQueryCache,
  fetchSurveyJsonQuery,
  getSurveyQueryEpoch,
  getSurveyQueryScope,
  invalidateSurveyQueries,
  surveyQueryClient,
  surveyQueryKeys,
} from "./surveyQueries";

const surveySession = {
  user: {
    id: 7,
    organization_id: 3,
    role_key: "surveyor",
    permissions: ["plot.read", "export.create"],
  },
};

describe("Survey query scope and caching", () => {
  it("deduplicates concurrent network reads through the shared query client", async () => {
    clearSurveyQueryCache();
    const scope = getSurveyQueryScope(surveySession);
    const key = surveyQueryKeys.plot(scope, 21, "workspace");
    let calls = 0;
    const request = vi.spyOn(api, "get").mockImplementation(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { data: { plot_id: 21 } } as never;
    });

    await Promise.all([
      fetchSurveyJsonQuery({ key, path: "/plots/21/workspace" }),
      fetchSurveyJsonQuery({ key, path: "/plots/21/workspace" }),
    ]);

    expect(calls).toBe(1);
    request.mockRestore();
    clearSurveyQueryCache();
  });

  it("deduplicates concurrent reads with the same scope and plot key", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const scope = getSurveyQueryScope(surveySession);
    const key = surveyQueryKeys.plot(scope, 18, "features");
    let calls = 0;
    const queryFn = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { features: [] };
    };

    await Promise.all([
      client.fetchQuery({ queryKey: key, queryFn }),
      client.fetchQuery({ queryKey: key, queryFn }),
    ]);

    expect(calls).toBe(1);
    client.clear();
  });

  it("isolates anonymous, user, organization, role, and permission scopes", () => {
    const base = getSurveyQueryScope(surveySession);
    const anonymous = getSurveyQueryScope(null);
    const otherUser = getSurveyQueryScope({ ...surveySession, user: { ...surveySession.user, id: 8 } });
    const otherOrg = getSurveyQueryScope({ ...surveySession, user: { ...surveySession.user, organization_id: 4 } });
    const otherRole = getSurveyQueryScope({ ...surveySession, user: { ...surveySession.user, role_key: "viewer" } });
    const otherPermissions = getSurveyQueryScope({
      ...surveySession,
      user: { ...surveySession.user, permissions: ["plot.read"] },
    });
    const key = (scope: typeof base) => surveyQueryKeys.plot(scope, 18, "features");

    expect(key(base)).not.toEqual(key(anonymous));
    expect(key(base)).not.toEqual(key(otherUser));
    expect(key(base)).not.toEqual(key(otherOrg));
    expect(key(base)).not.toEqual(key(otherRole));
    expect(key(base)).not.toEqual(key(otherPermissions));
  });

  it("invalidates only the selected plot resources", async () => {
    const scope = getSurveyQueryScope(surveySession);
    const featuresKey = surveyQueryKeys.plot(scope, 18, "features");
    const otherPlotKey = surveyQueryKeys.plot(scope, 19, "features");
    surveyQueryClient.setQueryData(featuresKey, { features: [] });
    surveyQueryClient.setQueryData(otherPlotKey, { features: [] });

    await invalidateSurveyQueries(scope, 18, ["features"]);

    expect(surveyQueryClient.getQueryState(featuresKey)?.isInvalidated).toBe(true);
    expect(surveyQueryClient.getQueryState(otherPlotKey)?.isInvalidated).toBe(false);
    clearSurveyQueryCache();
  });

  it("rejects late responses after a Survey session cache clear", async () => {
    const scope = getSurveyQueryScope(surveySession);
    const key = surveyQueryKeys.plot(scope, 18, "workspace");
    let releaseRequest!: () => void;
    const requestFinished = new Promise<void>((resolve) => { releaseRequest = resolve; });
    const epoch = getSurveyQueryEpoch();
    const request = surveyQueryClient.fetchQuery({
      queryKey: key,
      queryFn: async () => {
        await requestFinished;
        assertSurveyQueryEpoch(epoch);
        return { plot_id: 18 };
      },
    });

    clearSurveyQueryCache();
    releaseRequest();

    await expect(request).rejects.toBeTruthy();
    expect(() => assertSurveyQueryEpoch(epoch)).toThrow("Survey session changed");
    expect(surveyQueryClient.getQueryData(key)).toBeUndefined();
  });
});
