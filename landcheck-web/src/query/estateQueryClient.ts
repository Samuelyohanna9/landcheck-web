import { QueryClient } from "@tanstack/react-query";

// The client intentionally lives in memory only. Estate queries can contain customer,
// allocation, and financial data, so this phase does not persist or service-worker cache them.
export const estateQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      networkMode: "online",
      gcTime: 10 * 60 * 1000,
    },
    mutations: {
      retry: false,
      networkMode: "online",
    },
  },
});

let estateQueryEpoch = 0;

export function getEstateQueryEpoch(): number {
  return estateQueryEpoch;
}

export function assertEstateQueryEpoch(epoch: number): void {
  if (epoch !== estateQueryEpoch) {
    const error = new Error("The Estate session changed while the request was in flight.");
    error.name = "AbortError";
    throw error;
  }
}

export function clearEstateQueryCache(): void {
  estateQueryEpoch += 1;
  void estateQueryClient.cancelQueries().catch(() => undefined);
  estateQueryClient.clear();
}
