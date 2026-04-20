export type ResourceAccessFailureCode =
  | "resource_access_route_not_found"
  | "resource_access_proxy_unavailable"
  | "resource_access_route_unavailable"
  | "resource_access_upstream_unavailable"
  | "resource_access_upstream_connect_failed"
  | "resource_access_upstream_timeout"
  | "resource_access_upstream_reset"
  | "resource_access_upstream_tls_failed"
  | "resource_access_edge_error"
  | "resource_access_unknown";

export type ResourceAccessFailureSignal =
  | "route-not-found"
  | "proxy-unavailable"
  | "route-unavailable"
  | "upstream-unavailable"
  | "upstream-connect-failed"
  | "upstream-timeout"
  | "upstream-reset"
  | "upstream-tls-failed"
  | "edge-error"
  | "unknown";

export type ResourceAccessFailureCategory =
  | "infra"
  | "integration"
  | "timeout"
  | "not-found"
  | "async-processing";

export type ResourceAccessFailurePhase =
  | "edge-request-routing"
  | "proxy-route-observation"
  | "upstream-connection"
  | "upstream-response"
  | "proxy-route-realization"
  | "public-route-verification"
  | "diagnostic-page-render";

export type ResourceAccessFailureHttpStatus = 404 | 502 | 503 | 504;

export type ResourceAccessFailureOwnerHint =
  | "platform"
  | "resource"
  | "operator-config"
  | "unknown";

export type ResourceAccessRouteSource =
  | "generated-default"
  | "durable-domain"
  | "server-applied"
  | "deployment-snapshot";

export interface ResourceAccessFailureRouteContext {
  host?: string;
  pathPrefix?: string;
  resourceId?: string;
  deploymentId?: string;
  serverId?: string;
  destinationId?: string;
  providerKey?: string;
  routeId?: string;
  routeSource?: ResourceAccessRouteSource;
  routeStatus?: string;
}

export interface ResourceAccessFailureDiagnostic {
  schemaVersion: "resource-access-failure/v1";
  requestId: string;
  generatedAt: string;
  code: ResourceAccessFailureCode;
  category: ResourceAccessFailureCategory;
  phase: ResourceAccessFailurePhase;
  httpStatus: ResourceAccessFailureHttpStatus;
  retriable: boolean;
  ownerHint: ResourceAccessFailureOwnerHint;
  route?: ResourceAccessFailureRouteContext;
  causeCode?: string;
  correlationId?: string;
  causationId?: string;
}

interface ResourceAccessFailureDefaults {
  category: ResourceAccessFailureCategory;
  phase: ResourceAccessFailurePhase;
  httpStatus: ResourceAccessFailureHttpStatus;
  ownerHint: ResourceAccessFailureOwnerHint;
  retriable: boolean;
}

export interface ClassifyResourceAccessFailureInput {
  code?: ResourceAccessFailureCode;
  signal?: ResourceAccessFailureSignal;
  requestId: string;
  generatedAt?: string;
  route?: ResourceAccessFailureRouteContext;
  causeCode?: string;
  correlationId?: string;
  causationId?: string;
}

const defaultGeneratedAt = "1970-01-01T00:00:00.000Z";

const codeDefaults: Record<ResourceAccessFailureCode, ResourceAccessFailureDefaults> = {
  resource_access_route_not_found: {
    category: "not-found",
    phase: "edge-request-routing",
    httpStatus: 404,
    ownerHint: "platform",
    retriable: false,
  },
  resource_access_proxy_unavailable: {
    category: "infra",
    phase: "proxy-route-observation",
    httpStatus: 503,
    ownerHint: "platform",
    retriable: true,
  },
  resource_access_route_unavailable: {
    category: "infra",
    phase: "proxy-route-observation",
    httpStatus: 503,
    ownerHint: "operator-config",
    retriable: true,
  },
  resource_access_upstream_unavailable: {
    category: "infra",
    phase: "upstream-connection",
    httpStatus: 503,
    ownerHint: "resource",
    retriable: true,
  },
  resource_access_upstream_connect_failed: {
    category: "infra",
    phase: "upstream-connection",
    httpStatus: 502,
    ownerHint: "resource",
    retriable: true,
  },
  resource_access_upstream_timeout: {
    category: "timeout",
    phase: "upstream-connection",
    httpStatus: 504,
    ownerHint: "resource",
    retriable: true,
  },
  resource_access_upstream_reset: {
    category: "infra",
    phase: "upstream-response",
    httpStatus: 502,
    ownerHint: "resource",
    retriable: true,
  },
  resource_access_upstream_tls_failed: {
    category: "integration",
    phase: "upstream-connection",
    httpStatus: 502,
    ownerHint: "operator-config",
    retriable: true,
  },
  resource_access_edge_error: {
    category: "infra",
    phase: "diagnostic-page-render",
    httpStatus: 503,
    ownerHint: "platform",
    retriable: true,
  },
  resource_access_unknown: {
    category: "infra",
    phase: "diagnostic-page-render",
    httpStatus: 503,
    ownerHint: "unknown",
    retriable: true,
  },
};

export function parseResourceAccessFailureCode(
  input: string | null | undefined,
): ResourceAccessFailureCode | null {
  switch (input) {
    case "resource_access_route_not_found":
    case "resource_access_proxy_unavailable":
    case "resource_access_route_unavailable":
    case "resource_access_upstream_unavailable":
    case "resource_access_upstream_connect_failed":
    case "resource_access_upstream_timeout":
    case "resource_access_upstream_reset":
    case "resource_access_upstream_tls_failed":
    case "resource_access_edge_error":
    case "resource_access_unknown":
      return input;
    default:
      return null;
  }
}

export function parseResourceAccessFailureSignal(
  input: string | null | undefined,
): ResourceAccessFailureSignal | null {
  switch (input) {
    case "route-not-found":
    case "proxy-unavailable":
    case "route-unavailable":
    case "upstream-unavailable":
    case "upstream-connect-failed":
    case "upstream-timeout":
    case "upstream-reset":
    case "upstream-tls-failed":
    case "edge-error":
    case "unknown":
      return input;
    default:
      return null;
  }
}

export function resourceAccessFailureCodeFromSignal(
  signal: ResourceAccessFailureSignal,
): ResourceAccessFailureCode {
  switch (signal) {
    case "route-not-found":
      return "resource_access_route_not_found";
    case "proxy-unavailable":
      return "resource_access_proxy_unavailable";
    case "route-unavailable":
      return "resource_access_route_unavailable";
    case "upstream-unavailable":
      return "resource_access_upstream_unavailable";
    case "upstream-connect-failed":
      return "resource_access_upstream_connect_failed";
    case "upstream-timeout":
      return "resource_access_upstream_timeout";
    case "upstream-reset":
      return "resource_access_upstream_reset";
    case "upstream-tls-failed":
      return "resource_access_upstream_tls_failed";
    case "edge-error":
      return "resource_access_edge_error";
    case "unknown":
      return "resource_access_unknown";
  }
}

export function resourceAccessFailureCodeFromHttpStatus(
  status: number | null | undefined,
): ResourceAccessFailureCode {
  switch (status) {
    case 404:
      return "resource_access_route_not_found";
    case 502:
      return "resource_access_upstream_connect_failed";
    case 503:
      return "resource_access_proxy_unavailable";
    case 504:
      return "resource_access_upstream_timeout";
    default:
      return "resource_access_unknown";
  }
}

export function classifyResourceAccessFailure(
  input: ClassifyResourceAccessFailureInput,
): ResourceAccessFailureDiagnostic {
  const code = input.code ?? resourceAccessFailureCodeFromSignal(input.signal ?? "unknown");
  const defaults = codeDefaults[code];

  return {
    schemaVersion: "resource-access-failure/v1",
    requestId: input.requestId,
    generatedAt: input.generatedAt ?? defaultGeneratedAt,
    code,
    category: defaults.category,
    phase: defaults.phase,
    httpStatus: defaults.httpStatus,
    retriable: defaults.retriable,
    ownerHint: defaults.ownerHint,
    ...(input.route ? { route: input.route } : {}),
    ...(input.causeCode ? { causeCode: input.causeCode } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.causationId ? { causationId: input.causationId } : {}),
  };
}
