import { type ServerSummary } from "../../ports";

export type ServerRuntimeAvailabilityFilter = "available" | "unavailable" | "all";

export function serverRuntimeAvailability(
  server: ServerSummary,
): NonNullable<ServerSummary["runtimeAvailability"]> {
  if (server.lifecycleStatus !== "active") {
    return {
      status: "unavailable",
      reasonCodes: ["server-inactive"],
      message: server.deactivationReason ?? "Server is not active.",
    };
  }

  const edgeProxy = server.edgeProxy;
  if (!edgeProxy || edgeProxy.kind === "none" || edgeProxy.status === "disabled") {
    return {
      status: "available",
      reasonCodes: [],
    };
  }

  if (edgeProxy.status === "ready") {
    return {
      status: "available",
      reasonCodes: [],
    };
  }

  return {
    status: "unavailable",
    reasonCodes: [`edge-proxy-${edgeProxy.status}`],
    message:
      edgeProxy.lastErrorMessage ??
      "Server runtime initialization has not completed for this deployment target.",
  };
}

export function withServerRuntimeAvailability(server: ServerSummary): ServerSummary {
  return {
    ...server,
    runtimeAvailability: server.runtimeAvailability ?? serverRuntimeAvailability(server),
  };
}

export function serverMatchesRuntimeAvailabilityFilter(
  server: ServerSummary,
  filter: ServerRuntimeAvailabilityFilter,
): boolean {
  if (filter === "all") {
    return true;
  }

  return serverRuntimeAvailability(server).status === filter;
}
