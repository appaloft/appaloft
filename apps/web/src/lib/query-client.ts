import { QueryClient } from "@tanstack/svelte-query";

function readHttpStatus(error: unknown, seen = new Set<unknown>()): number | undefined {
  if (!error || typeof error !== "object" || seen.has(error)) {
    return undefined;
  }

  seen.add(error);

  const record = error as Record<string, unknown>;
  for (const key of ["status", "httpStatus", "statusCode"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }
  }

  for (const key of ["response", "data", "json", "error", "cause"]) {
    const status = readHttpStatus(record[key], seen);
    if (status !== undefined) {
      return status;
    }
  }

  return undefined;
}

export function shouldRetryQueryError(failureCount: number, error: unknown): boolean {
  const status = readHttpStatus(error);

  return failureCount < 1 && status !== undefined && status >= 500;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: shouldRetryQueryError,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
