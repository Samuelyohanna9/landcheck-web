/* eslint-disable @typescript-eslint/no-explicit-any -- Estate API response shapes are still shared with the existing imperative pages. */
import { useQuery, type QueryFunctionContext, type UseQueryResult } from "@tanstack/react-query";
import { api } from "../api/client";
import type { EstateAuthSession } from "../auth/estateAuth";
import { assertEstateQueryEpoch, estateQueryClient, getEstateQueryEpoch } from "./estateQueryClient";

export type EstateQueryScope = {
  organizationId: number | null;
  userId: number | null;
  roleKey: string;
  permissions: string;
};

export const ESTATE_QUERY_POLLING_INTERVALS = {
  notifications: 60 * 1000,
  reservations: 30 * 1000,
  liveInspections: 20 * 1000,
} as const;

export function estatePollingQueryOptions(interval: number | false) {
  return {
    refetchInterval: interval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    networkMode: "online" as const,
  };
}

export function getEstateQueryScope(session: EstateAuthSession | null): EstateQueryScope {
  const permissions = [...(session?.user.permissions || [])].map(String).sort().join(",");
  return {
    organizationId: session?.user.organization_id ?? null,
    userId: session?.user.id ?? null,
    roleKey: String(session?.user.role_key || "").toLowerCase(),
    permissions,
  };
}

const scopeKey = (scope: EstateQueryScope) => [
  "landcheck",
  "estate",
  "scope",
  scope.organizationId ?? "none",
  scope.userId ?? "none",
  scope.roleKey || "none",
  scope.permissions || "none",
] as const;

export const estateQueryKeys = {
  all: ["landcheck", "estate"] as const,
  scope: (scope: EstateQueryScope) => scopeKey(scope),
  account: (scope: EstateQueryScope, resource: string) => [...scopeKey(scope), "account", resource] as const,
  estate: (scope: EstateQueryScope, estateId: string | number, resource: string) => [
    ...scopeKey(scope),
    "estate",
    String(estateId),
    resource,
  ] as const,
};

type QueryConfig = {
  key: readonly unknown[];
  path: string;
  params?: Record<string, string | number | boolean>;
  enabled: boolean;
  staleTime: number;
  refetchInterval?: number | false;
};

function useEstateJsonQuery<T>({ key, path, params, enabled, staleTime, refetchInterval = false }: QueryConfig): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: key,
    queryFn: async ({ signal }: QueryFunctionContext) => {
      const requestEpoch = getEstateQueryEpoch();
      const response = await api.get<T>(path, { params, signal });
      assertEstateQueryEpoch(requestEpoch);
      return response.data;
    },
    enabled,
    staleTime,
    ...estatePollingQueryOptions(refetchInterval),
    retry: false,
  });
}

export type EstateSharedQueries = {
  detail: UseQueryResult<any>;
  selectors: UseQueryResult<any>;
  surveyRequests: UseQueryResult<any[]>;
  stakingTasks: UseQueryResult<any[]>;
  plots: UseQueryResult<any>;
  layers: UseQueryResult<any>;
  importReviews: UseQueryResult<any[]>;
  layoutProposals: UseQueryResult<any[]>;
  hazards: UseQueryResult<any>;
  blocks: UseQueryResult<any[]>;
  activity: UseQueryResult<any[]>;
  dashboard: UseQueryResult<any>;
  payments: UseQueryResult<any>;
  documents: UseQueryResult<any>;
  publicSettings: UseQueryResult<any>;
  salesAgents: UseQueryResult<any[]>;
};

export function useEstateReservationRequestsQuery(scope: EstateQueryScope, estateId: string, page: number, enabled = true): UseQueryResult<any> {
  return useEstateJsonQuery({
    key: [...estateQueryKeys.estate(scope, estateId, "reservations"), "page", page, 8],
    path: `/estates/${estateId}/reservation-requests`,
    params: { page, page_size: 8 },
    enabled: enabled && Boolean(scope.organizationId && scope.userId),
    staleTime: 15 * 1000,
    refetchInterval: ESTATE_QUERY_POLLING_INTERVALS.reservations,
  });
}

export function useEstateSharedQueries(scope: EstateQueryScope, estateId?: string): EstateSharedQueries {
  const enabled = Boolean(estateId && scope.organizationId && scope.userId);
  const id = estateId || "none";
  return {
    detail: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "detail"), path: `/estates/${id}`, enabled, staleTime: 5 * 60 * 1000 }),
    selectors: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "selectors"), path: "/estates/selectors", params: { estate_id: id }, enabled, staleTime: 30 * 1000 }),
    surveyRequests: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "survey-requests"), path: "/estates/survey-requests", params: { estate_id: id }, enabled, staleTime: 30 * 1000 }),
    stakingTasks: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "staking-tasks"), path: "/estates/staking-tasks", params: { estate_id: id }, enabled, staleTime: 30 * 1000 }),
    plots: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "plots"), path: `/estates/${id}/plots.geojson`, enabled, staleTime: 2 * 60 * 1000 }),
    layers: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "layers"), path: `/estates/${id}/layers.geojson`, enabled, staleTime: 2 * 60 * 1000 }),
    importReviews: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "import-reviews"), path: `/estates/${id}/import-reviews`, enabled, staleTime: 60 * 1000 }),
    layoutProposals: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "layout-proposals"), path: `/estates/${id}/layout-proposals`, enabled, staleTime: 60 * 1000 }),
    hazards: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "hazards"), path: `/estates/${id}/hazards`, enabled, staleTime: 60 * 1000 }),
    blocks: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "blocks"), path: `/estates/${id}/blocks`, enabled, staleTime: 2 * 60 * 1000 }),
    activity: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "activity"), path: `/estates/${id}/activity`, enabled, staleTime: 30 * 1000 }),
    dashboard: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "dashboard"), path: `/estates/${id}/dashboard`, enabled, staleTime: 30 * 1000 }),
    payments: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "payments"), path: "/estates/payments", params: { estate_id: id, page_size: 100 }, enabled, staleTime: 30 * 1000 }),
    documents: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "documents"), path: "/estates/documents", params: { page_size: 100 }, enabled, staleTime: 60 * 1000 }),
    publicSettings: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "public-settings"), path: `/estates/${id}/public-settings`, enabled, staleTime: 5 * 60 * 1000 }),
    salesAgents: useEstateJsonQuery({ key: estateQueryKeys.account(scope, "sales-agents"), path: `/estates/organizations/${scope.organizationId ?? "none"}/sales-agents`, enabled, staleTime: 5 * 60 * 1000 }),
  };
}

export function useEstatePlotsQuery(scope: EstateQueryScope, estateId?: string): UseQueryResult<any> {
  const id = estateId || "none";
  return useEstateJsonQuery({
    key: estateQueryKeys.estate(scope, id, "plots"),
    path: `/estates/${id}/plots.geojson`,
    enabled: Boolean(estateId && scope.organizationId && scope.userId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useEstateDashboardQuery(scope: EstateQueryScope, estateId?: string): UseQueryResult<any> {
  const id = estateId || "none";
  return useEstateJsonQuery({
    key: estateQueryKeys.estate(scope, id, "dashboard"),
    path: `/estates/${id}/dashboard`,
    enabled: Boolean(estateId && scope.organizationId && scope.userId),
    staleTime: 30 * 1000,
  });
}

export function useEstateDetailQuery(scope: EstateQueryScope, estateId?: string): UseQueryResult<any> {
  const id = estateId || "none";
  return useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "detail"), path: `/estates/${id}`, enabled: Boolean(estateId && scope.organizationId && scope.userId), staleTime: 5 * 60 * 1000 });
}

export function useEstateBlocksQuery(scope: EstateQueryScope, estateId?: string): UseQueryResult<any[]> {
  const id = estateId || "none";
  return useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "blocks"), path: `/estates/${id}/blocks`, enabled: Boolean(estateId && scope.organizationId && scope.userId), staleTime: 2 * 60 * 1000 });
}

export function useEstateActivityQuery(scope: EstateQueryScope, estateId?: string): UseQueryResult<any[]> {
  const id = estateId || "none";
  return useEstateJsonQuery({ key: estateQueryKeys.estate(scope, id, "activity"), path: `/estates/${id}/activity`, enabled: Boolean(estateId && scope.organizationId && scope.userId), staleTime: 30 * 1000 });
}

export type EstateShellQueries = {
  notifications: UseQueryResult<any>;
  whatsappConversations: UseQueryResult<any>;
  reservationRequests: UseQueryResult<any>;
  liveInspections: UseQueryResult<any[]>;
  publicSettings: UseQueryResult<any>;
  billingStatus: UseQueryResult<any>;
};

export function useEstateShellQueries(scope: EstateQueryScope, estateId: string, skipBillingGate: boolean): EstateShellQueries {
  const enabled = Boolean(estateId && estateId !== "0" && scope.organizationId && scope.userId);
  return {
    notifications: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, estateId, "notifications"), path: `/estates/${estateId}/notifications`, params: { limit: 250 }, enabled, staleTime: 15 * 1000, refetchInterval: ESTATE_QUERY_POLLING_INTERVALS.notifications }),
    whatsappConversations: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, estateId, "whatsapp-conversations"), path: `/estates/${estateId}/marketing/social/whatsapp/conversations`, enabled, staleTime: 30 * 1000 }),
    reservationRequests: useEstateJsonQuery({ key: [...estateQueryKeys.estate(scope, estateId, "reservations"), "count"], path: `/estates/${estateId}/reservation-requests`, params: { status: "new", page: 1, page_size: 1 }, enabled, staleTime: 15 * 1000, refetchInterval: ESTATE_QUERY_POLLING_INTERVALS.reservations }),
    liveInspections: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, estateId, "live-inspections"), path: `/estates/${estateId}/marketing/live-inspections`, enabled, staleTime: 15 * 1000, refetchInterval: ESTATE_QUERY_POLLING_INTERVALS.liveInspections }),
    publicSettings: useEstateJsonQuery({ key: estateQueryKeys.estate(scope, estateId, "public-settings"), path: `/estates/${estateId}/public-settings`, enabled, staleTime: 5 * 60 * 1000 }),
    billingStatus: useEstateJsonQuery({ key: estateQueryKeys.account(scope, "billing-status"), path: "/estates/billing/status", params: { organization_id: scope.organizationId ?? "none" }, enabled: enabled && !skipBillingGate, staleTime: 60 * 1000 }),
  };
}

export type EstateMutationArea = "detail" | "selectors" | "plots" | "layers" | "blocks" | "dashboard" | "activity" | "public-settings" | "survey-requests" | "staking-tasks" | "payments" | "documents" | "reservations" | "notifications" | "live-inspections" | "import-reviews" | "layout-proposals" | "hazards";

export type EstateMutationKind = "plot" | "reservation" | "allocation" | "payment" | "customer" | "survey" | "staking" | "settings" | "layer" | "import" | "layout";

export const ESTATE_MUTATION_INVALIDATIONS: Record<EstateMutationKind, readonly EstateMutationArea[]> = {
  plot: ["selectors", "plots", "dashboard", "activity"],
  reservation: ["reservations", "selectors", "plots", "dashboard", "payments", "documents", "activity"],
  allocation: ["reservations", "selectors", "plots", "dashboard", "payments", "documents", "activity"],
  payment: ["selectors", "plots", "dashboard", "payments", "documents", "reservations", "activity"],
  customer: ["selectors", "dashboard", "activity"],
  survey: ["survey-requests", "staking-tasks", "dashboard", "activity"],
  staking: ["staking-tasks", "dashboard", "activity"],
  settings: ["detail", "public-settings", "activity"],
  layer: ["layers", "activity"],
  import: ["import-reviews", "detail", "selectors", "plots", "layers", "blocks", "dashboard", "payments", "documents", "reservations", "activity"],
  layout: ["layout-proposals", "selectors", "plots", "layers", "blocks", "dashboard", "activity"],
};

export async function invalidateEstateQueries(scope: EstateQueryScope, estateId: string | number, areas: readonly EstateMutationArea[]): Promise<void> {
  await Promise.all(areas.map((area) => estateQueryClient.invalidateQueries({ queryKey: estateQueryKeys.estate(scope, estateId, area) })));
}

export async function invalidateEstateResourcesAcrossEstates(scope: EstateQueryScope, areas: readonly EstateMutationArea[]): Promise<void> {
  await Promise.all(areas.map((area) => estateQueryClient.invalidateQueries({
    queryKey: [...estateQueryKeys.scope(scope), "estate"],
    predicate: (query) => query.queryKey.includes(area),
  })));
}

export async function invalidateEstateAccountQueries(scope: EstateQueryScope, resources: readonly string[]): Promise<void> {
  await Promise.all(resources.map((resource) => estateQueryClient.invalidateQueries({ queryKey: estateQueryKeys.account(scope, resource) })));
}

export function invalidateEstateMutation(scope: EstateQueryScope, estateId: string | number, kind: EstateMutationKind): Promise<void> {
  return invalidateEstateQueries(scope, estateId, ESTATE_MUTATION_INVALIDATIONS[kind]);
}
