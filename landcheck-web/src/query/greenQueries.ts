/* eslint-disable @typescript-eslint/no-explicit-any -- Green API payloads are shared with the existing imperative pages. */
import { useQuery, type QueryFunctionContext, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../api/client";
import { estateQueryClient } from "./estateQueryClient";

export type GreenQueryScope = {
  organizationId: number | null;
  userId: number | null;
  authMode: string;
  appMode: string;
  roleKey: string;
  permissions: string;
};

type GreenSessionLike = {
  auth_mode?: string | null;
  appMode?: string | null;
  user?: {
    id?: number | null;
    organization_id?: number | null;
    role?: string | null;
    role_key?: string | null;
    permissions?: unknown;
  } | null;
} | null;

type GreenQueryConfig = {
  key: readonly unknown[];
  path: string;
  params?: Record<string, string | number | boolean | null | undefined>;
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number | false;
};

export const GREEN_QUERY_POLLING_INTERVALS = {
  fieldTasks: 45 * 1000,
  workOrders: 45 * 1000,
  liveMaintenance: 20 * 1000,
  reviewQueue: 12 * 1000,
  sponsorship: 15 * 1000,
} as const;

let greenQueryEpoch = 0;

export const greenQueryClient = estateQueryClient;

export function getGreenQueryEpoch(): number {
  return greenQueryEpoch;
}

export function assertGreenQueryEpoch(epoch: number): void {
  if (epoch !== greenQueryEpoch) {
    const error = new Error("The Green session changed while the request was in flight.");
    error.name = "AbortError";
    throw error;
  }
}

export function clearGreenQueryCache(): void {
  greenQueryEpoch += 1;
  void greenQueryClient.cancelQueries({ queryKey: greenQueryKeys.all }).catch(() => undefined);
  greenQueryClient.removeQueries({ queryKey: greenQueryKeys.all });
}

export function getGreenQueryScope(session: GreenSessionLike | null, product: "green" | "work"): GreenQueryScope {
  const permissions = Array.isArray(session?.user?.permissions)
    ? session.user.permissions.map(String).sort().join(",")
    : "";
  return {
    organizationId: session?.user?.organization_id ?? null,
    userId: session?.user?.id ?? null,
    authMode: String(session?.auth_mode || "none").toLowerCase(),
    appMode: product,
    roleKey: String(session?.user?.role_key || session?.user?.role || "").toLowerCase(),
    permissions,
  };
}

const scopeKey = (scope: GreenQueryScope) => [
  "landcheck",
  "green",
  "scope",
  scope.appMode || "none",
  scope.organizationId ?? "none",
  scope.userId ?? "none",
  scope.authMode || "none",
  scope.roleKey || "none",
  scope.permissions || "none",
] as const;

const filterKey = (value: string | number | null | undefined) => String(value ?? "").trim();

export const greenQueryKeys = {
  all: ["landcheck", "green"] as const,
  scope: (scope: GreenQueryScope) => scopeKey(scope),
  account: (scope: GreenQueryScope, resource: string) => [...scopeKey(scope), "account", resource] as const,
  projects: (scope: GreenQueryScope, assigneeName?: string | null) => [
    ...scopeKey(scope),
    "projects",
    filterKey(assigneeName),
  ] as const,
  project: (scope: GreenQueryScope, projectId: string | number, resource: string, filter?: string | number | null) => [
    ...scopeKey(scope),
    "project",
    String(projectId),
    resource,
    filterKey(filter),
  ] as const,
};

function greenQueryOptions(interval: number | false) {
  return {
    refetchInterval: interval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    networkMode: "online" as const,
  };
}

function useGreenJsonQuery<T>({
  key,
  path,
  params,
  enabled = true,
  staleTime = 30 * 1000,
  refetchInterval = false,
}: GreenQueryConfig): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: key,
    queryFn: ({ signal }: QueryFunctionContext) => requestGreenJson<T>(path, params, signal),
    enabled,
    staleTime,
    ...greenQueryOptions(refetchInterval),
    retry: false,
  });
}

async function requestGreenJson<T>(
  path: string,
  params: Record<string, string | number | boolean | null | undefined> | undefined,
  signal: AbortSignal | undefined,
): Promise<T> {
  const requestEpoch = getGreenQueryEpoch();
  const response = await api.get<T>(path, { params, signal });
  assertGreenQueryEpoch(requestEpoch);
  return response.data;
}

export async function fetchGreenJsonQuery<T>({
  key,
  path,
  params,
  staleTime = 30 * 1000,
  signal,
  force = false,
}: GreenQueryConfig & { signal?: AbortSignal; force?: boolean }): Promise<T> {
  const requestEpoch = getGreenQueryEpoch();
  return greenQueryClient.fetchQuery<T>({
    queryKey: key,
    staleTime: force ? 0 : staleTime,
    queryFn: ({ signal: querySignal }) =>
      requestGreenJson<T>(path, params, signal || querySignal).then((data) => {
        assertGreenQueryEpoch(requestEpoch);
        return data;
      }),
  });
}

export type GreenProjectQueries = {
  detail: UseQueryResult<any>;
  trees: UseQueryResult<any[]>;
  workOrders: UseQueryResult<any[]>;
  tasks: UseQueryResult<any[]>;
  speciesMaturity: UseQueryResult<any>;
};

export function useGreenProjectQueries(
  scope: GreenQueryScope,
  projectId?: string | number | null,
  assigneeName?: string | null,
  enabled = true,
): GreenProjectQueries {
  const id = String(projectId || "none");
  const assignee = filterKey(assigneeName) || null;
  const queryEnabled = enabled && Boolean(projectId && scope.userId);
  const assigneeParams = assignee ? { assignee_name: assignee } : undefined;
  return {
    detail: useGreenJsonQuery({
      key: greenQueryKeys.project(scope, id, "detail", assignee),
      path: `/green/projects/${id}`,
      params: assigneeParams,
      enabled: queryEnabled,
      staleTime: 30 * 1000,
    }),
    trees: useGreenJsonQuery({
      key: greenQueryKeys.project(scope, id, "trees", assignee),
      path: `/green/projects/${id}/trees`,
      params: assigneeParams,
      enabled: queryEnabled,
      staleTime: 60 * 1000,
    }),
    workOrders: useGreenJsonQuery({
      key: greenQueryKeys.project(scope, id, "work-orders", assignee),
      path: "/green/work-orders",
      params: { project_id: id, ...(assigneeParams || {}) },
      enabled: queryEnabled,
      staleTime: 15 * 1000,
      refetchInterval: false,
    }),
    tasks: useGreenJsonQuery({
      key: greenQueryKeys.project(scope, id, "tasks", assignee),
      path: "/green/tasks",
      params: { project_id: id, ...(assigneeParams || {}) },
      enabled: queryEnabled,
      staleTime: 15 * 1000,
      refetchInterval: false,
    }),
    speciesMaturity: useGreenJsonQuery({
      key: greenQueryKeys.project(scope, id, "species-maturity"),
      path: `/green/projects/${id}/species-maturity`,
      enabled: queryEnabled,
      staleTime: 10 * 60 * 1000,
    }),
  };
}

export function useGreenProjectsQuery(
  scope: GreenQueryScope,
  assigneeName?: string | null,
  enabled = true,
): UseQueryResult<any[]> {
  const assignee = filterKey(assigneeName) || null;
  return useGreenJsonQuery({
    key: greenQueryKeys.projects(scope, assignee),
    path: "/green/projects",
    params: {
      organization_id: scope.organizationId,
      assignee_name: assignee,
    },
    enabled: enabled && Boolean(scope.userId),
    staleTime: 60 * 1000,
  });
}

export function useGreenProjectSummaryQueries(
  scope: GreenQueryScope,
  projectId?: string | number | null,
  enabled = true,
  pollReviewQueue = false,
) {
  const id = String(projectId || "none");
  const queryEnabled = enabled && Boolean(projectId && scope.userId);
  return {
    reviewQueue: useGreenJsonQuery<any[]>({
      key: greenQueryKeys.project(scope, id, "review-queue"),
      path: "/green/tasks/review-queue",
      params: { project_id: id },
      enabled: queryEnabled,
      staleTime: 10 * 1000,
      refetchInterval: pollReviewQueue ? GREEN_QUERY_POLLING_INTERVALS.reviewQueue : false,
    }),
    alerts: useGreenJsonQuery<any>({
      key: greenQueryKeys.project(scope, id, "alerts"),
      path: `/green/projects/${id}/alerts`,
      params: { refresh: true, status: "open" },
      enabled: queryEnabled,
      staleTime: 10 * 1000,
      refetchInterval: pollReviewQueue ? GREEN_QUERY_POLLING_INTERVALS.reviewQueue : false,
    }),
    carbon: useGreenJsonQuery<any>({
      key: greenQueryKeys.project(scope, id, "carbon-summary"),
      path: `/green/projects/${id}/carbon-summary`,
      enabled: queryEnabled,
      staleTime: 60 * 1000,
    }),
    kpi: useGreenJsonQuery<any>({
      key: greenQueryKeys.project(scope, id, "kpi"),
      path: "/green/reports/kpi",
      params: { project_id: id, days: 180, snapshot: true },
      enabled: queryEnabled,
      staleTime: 60 * 1000,
    }),
  };
}

export function greenPollingQueryOptions(interval: number | false) {
  return greenQueryOptions(interval);
}

export function shouldRunGreenPoll(visibilityState: string, online: boolean, inFlight: boolean): boolean {
  return visibilityState === "visible" && online && !inFlight;
}

export async function invalidateGreenProjectQueries(
  scope: GreenQueryScope,
  projectId: string | number,
  resources: readonly string[],
): Promise<void> {
  await Promise.all(
    resources.map((resource) =>
      greenQueryClient.invalidateQueries({ queryKey: greenQueryKeys.project(scope, projectId, resource) }),
    ),
  );
}

export function useGreenVisibilityAwarePolling(
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
      if (disposed || !shouldRunGreenPoll(document.visibilityState, navigator.onLine, runningRef.current)) return;
      runningRef.current = true;
      Promise.resolve(callbackRef.current())
        .catch(() => undefined)
        .finally(() => {
          runningRef.current = false;
        });
    };
    const resume = () => run();
    run();
    const timer = window.setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [enabled, intervalMs]);
}
