import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { estateQueryClient } from "./estateQueryClient";

export default function EstateQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={estateQueryClient}>{children}</QueryClientProvider>;
}
