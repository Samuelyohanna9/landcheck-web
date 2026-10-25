/* eslint-disable @typescript-eslint/no-explicit-any -- Survey endpoints still share payloads with the imperative workspace. */
import { useQuery, type QueryFunctionContext, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../api/client";
import { getSurveyLocalScope } from "../offline/surveyLocalScope";
import { estateQueryClient } from "./estateQueryClient";

export type SurveyQueryScope = {
  localScope: string;
  userId: number | null;
  organizationId: number | null;
  roleKey: string;
  permissions: string;
  authMode: "authenticated" | "anonymous";
};

type SurveySessionLike = {
  user?: {
    id?: number | null;
    organization_id?: number | null;
    role?: string | null;
    role_key?: string | null;
    permissions?: unknown;
  } | null;
} | null;

type SurveyQueryConfig = {
  key: readonly unknown[];
  path: string;
  params?: Record<string, string | number | boolean | null | undefined>;
  staleTime?: number;
  enabled?: boolean;
};

let surveyQueryEpoch = 0;

export const surveyQueryClient = estateQueryClient;

export const SURVEY_QUERY_STALE_TIMES = {
  workspace: 2 * 60 * 1000,
  features: 2 * 60 * 1000,
  georeferenceSession: 30 * 1000,
  subdivisionBatches: 30 * 1000,
  subdivisionBatch: 60 * 1000,
  report: 60 * 1000,
  exportJob: 0,
} as const;

export function getSurveyQueryEpoch(): number {
  return surveyQueryEpoch;
}

export function assertSurveyQueryEpoch(epoch: number): void {
  if (epoch !== surveyQueryEpoch) {
    const error = new Error("The Survey session changed while the request was in flight.");
    error.name = "AbortError";
    throw error;
  }
}

export function clearSurveyQueryCache(): void {
  surveyQueryEpoch += 1;
  void surveyQueryClient.cancelQueries({ queryKey: surveyQueryKeys.all }).catch(() => undefined);
  surveyQueryClient.removeQueries({ queryKey: surveyQueryKeys.all });
}

export function getSurveyQueryScope(session: SurveySessionLike | null): SurveyQueryScope {
  const permissions = Array.isArray(session?.user?.permissions)
    ? session.user.permissions.map(String).sort().join(",")
    : "";
  const userId = Number(session?.user?.id || 0);
  const organizationId = Number(session?.user?.organization_id || 0);
  return {
    localScope: getSurveyLocalScope(),
    userId: Number.isFinite(userId) && userId > 0 ? userId : null,
    organizationId: Number.isFinite(organizationId) && organizationId > 0 ? organizationId : null,
    roleKey: String(session?.user?.role_key || session?.user?.role || "").trim().toLowerCase(),
    permissions,
    authMode: session?.user ? "authenticated" : "anonymous",
  };
}

const scopeKey = (scope: SurveyQueryScope) => [
  "landcheck",
  "survey",
  "scope",
  scope.authMode,
  scope.localScope,
  scope.userId ?? "none",
  scope.organizationId ?? "none",
  scope.roleKey || "none",
  scope.permissions || "none",
] as const;

export const surveyQueryKeys = {
  all: ["landcheck", "survey"] as const,
  scope: (scope: SurveyQueryScope) => scopeKey(scope),
  plot: (scope: SurveyQueryScope, plotId: string | number, resource: string) => [
    ...scopeKey(scope),
    "plot",
    String(plotId),
    resource,
  ] as const,
  georeference: (scope: SurveyQueryScope, sessionId: string, resource = "session") => [
    ...scopeKey(scope),
    "georeference",
    String(sessionId),
    resource,
  ] as const,
  exportJob: (scope: SurveyQueryScope, jobId: string) => [
    ...scopeKey(scope),
    "export-job",
    String(jobId),
  ] as const,
};

function surveyQueryOptions(refetchInterval: number | false = false) {
  return {
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    networkMode: "online" as const,
  };
}

async function requestSurveyJson<T>(
  path: string,
  params: Record<string, string | number | boolean | null | undefined> | undefined,
  signal: AbortSignal | undefined,
): Promise<T> {
  const requestEpoch = getSurveyQueryEpoch();
  const response = await api.get<T>(path, { params, signal });
  assertSurveyQueryEpoch(requestEpoch);
  return response.data;
}

export async function fetchSurveyJsonQuery<T>({
  key,
  path,
  params,
  staleTime = 30 * 1000,
  signal,
  force = false,
}: SurveyQueryConfig & { signal?: AbortSignal; force?: boolean }): Promise<T> {
  const requestEpoch = getSurveyQueryEpoch();
  return surveyQueryClient.fetchQuery<T>({
    queryKey: key,
    staleTime: force ? 0 : staleTime,
    networkMode: "online",
    retry: false,
    queryFn: ({ signal: querySignal }) =>
      requestSurveyJson<T>(path, params, signal || querySignal).then((data) => {
        assertSurveyQueryEpoch(requestEpoch);
        return data;
      }),
  });
}

function useSurveyJsonQuery<T>({
  key,
  path,
  params,
  staleTime = 30 * 1000,
  enabled = true,
}: SurveyQueryConfig): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: key,
    queryFn: ({ signal }: QueryFunctionContext) => requestSurveyJson<T>(path, params, signal),
    staleTime,
    enabled,
    ...surveyQueryOptions(),
    retry: false,
  });
}

export function useSurveyWorkspaceQuery(
  scope: SurveyQueryScope,
  plotId?: string | number | null,
  enabled = true,
): UseQueryResult<any> {
  const id = String(plotId || "none");
  return useSurveyJsonQuery({
    key: surveyQueryKeys.plot(scope, id, "workspace"),
    path: `/plots/${id}/workspace`,
    enabled: enabled && Boolean(plotId),
    staleTime: SURVEY_QUERY_STALE_TIMES.workspace,
  });
}

export async function invalidateSurveyQueries(
  scope: SurveyQueryScope,
  plotId: string | number,
  resources: readonly string[],
): Promise<void> {
  await Promise.all(
    resources.map((resource) =>
      surveyQueryClient.invalidateQueries({ queryKey: surveyQueryKeys.plot(scope, plotId, resource) }),
    ),
  );
}

export async function invalidateSurveyGeoreferenceQuery(
  scope: SurveyQueryScope,
  sessionId: string,
): Promise<void> {
  await surveyQueryClient.invalidateQueries({
    queryKey: surveyQueryKeys.georeference(scope, sessionId),
  });
}

export async function waitForSurveyReadiness(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  while (document.visibilityState !== "visible" || navigator.onLine === false) {
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
}

export function useSurveyVisibilityAwarePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled = true,
): void {
  const callbackRef = useRef(callback);
  const runningRef = useRef(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return undefined;
    let disposed = false;
    const run = () => {
      if (disposed || document.visibilityState !== "visible" || !navigator.onLine || runningRef.current) return;
      runningRef.current = true;
      Promise.resolve(callbackRef.current())
        .catch(() => undefined)
        .finally(() => {
          runningRef.current = false;
        });
    };
    const resume = () => run();
    const timer = window.setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    run();
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [enabled, intervalMs]);
}
