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

export type ResourceAccessFailureNextAction =
  | "check-health"
  | "inspect-runtime-logs"
  | "inspect-deployment-logs"
  | "inspect-proxy-preview"
  | "diagnostic-summary"
  | "verify-domain"
  | "fix-dns"
  | "repair-proxy"
  | "manual-review";

export type ResourceAccessRouteSource =
  | "generated-default"
  | "durable-domain"
  | "server-applied"
  | "deployment-snapshot";

export interface ResourceAccessFailureAffectedRequest {
  url?: string;
  hostname?: string;
  path?: string;
  method?: string;
}

export interface ResourceAccessFailureRouteContext {
  host?: string;
  pathPrefix?: string;
  resourceId?: string;
  deploymentId?: string;
  domainBindingId?: string;
  serverId?: string;
  destinationId?: string;
  providerKey?: string;
  routeId?: string;
  diagnosticId?: string;
  routeSource?: ResourceAccessRouteSource;
  routeStatus?: string;
}

export interface AppliedRouteContextMetadata {
  schemaVersion: "applied-route-context/v1";
  resourceId: string;
  deploymentId?: string;
  domainBindingId?: string;
  serverId?: string;
  destinationId?: string;
  routeId: string;
  diagnosticId: string;
  routeSource: ResourceAccessRouteSource;
  hostname: string;
  pathPrefix: string;
  proxyKind: "none" | "traefik" | "caddy";
  providerKey?: string;
  appliedAt?: string;
  observedAt?: string;
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
  nextAction: ResourceAccessFailureNextAction;
  affected?: ResourceAccessFailureAffectedRequest;
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
  affected?: ResourceAccessFailureAffectedRequest;
  route?: ResourceAccessFailureRouteContext;
  causeCode?: string;
  correlationId?: string;
  causationId?: string;
}

const defaultGeneratedAt = "1970-01-01T00:00:00.000Z";
const safeTokenPattern = /[^A-Za-z0-9._:-]/g;
const safeRouteIdentifierPattern = /[^A-Za-z0-9._:/-]/g;

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

const nextActionByCode: Record<ResourceAccessFailureCode, ResourceAccessFailureNextAction> = {
  resource_access_route_not_found: "inspect-proxy-preview",
  resource_access_proxy_unavailable: "inspect-proxy-preview",
  resource_access_route_unavailable: "inspect-proxy-preview",
  resource_access_upstream_unavailable: "check-health",
  resource_access_upstream_connect_failed: "check-health",
  resource_access_upstream_timeout: "check-health",
  resource_access_upstream_reset: "inspect-runtime-logs",
  resource_access_upstream_tls_failed: "inspect-proxy-preview",
  resource_access_edge_error: "diagnostic-summary",
  resource_access_unknown: "diagnostic-summary",
};

function safeToken(input: string | undefined): string | undefined {
  const normalized = input?.trim().replaceAll(safeTokenPattern, "_");
  return normalized ? normalized.slice(0, 160) : undefined;
}

function safeRouteIdentifier(input: string | undefined): string | undefined {
  const normalized = input?.trim().replaceAll(safeRouteIdentifierPattern, "_");
  return normalized ? normalized.slice(0, 220) : undefined;
}

function safePath(input: string | undefined): string | undefined {
  if (!input) {
    return undefined;
  }

  const withoutQuery = input.split("?")[0]?.split("#")[0]?.trim();
  if (!withoutQuery) {
    return undefined;
  }

  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
}

function safeRouteSource(input: unknown): ResourceAccessRouteSource | undefined {
  switch (input) {
    case "generated-default":
    case "durable-domain":
    case "server-applied":
    case "deployment-snapshot":
      return input;
    default:
      return undefined;
  }
}

function safeProxyKind(input: unknown): AppliedRouteContextMetadata["proxyKind"] | undefined {
  switch (input) {
    case "none":
    case "traefik":
    case "caddy":
      return input;
    default:
      return undefined;
  }
}

function safeMethod(input: string | undefined): string | undefined {
  const method = input?.trim().toUpperCase();
  return method && /^[A-Z]{1,16}$/.test(method) ? method : undefined;
}

function safeUrl(input: string | undefined): string | undefined {
  if (!input) {
    return undefined;
  }

  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }

    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return undefined;
  }
}

function sanitizeAffectedRequest(
  affected: ResourceAccessFailureAffectedRequest | undefined,
): ResourceAccessFailureAffectedRequest | undefined {
  if (!affected) {
    return undefined;
  }

  const url = safeUrl(affected.url);
  const hostname = safeToken(affected.hostname);
  const path = safePath(affected.path);
  const method = safeMethod(affected.method);
  const sanitized = {
    ...(url ? { url } : {}),
    ...(hostname ? { hostname } : {}),
    ...(path ? { path } : {}),
    ...(method ? { method } : {}),
  };

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeRouteContext(
  route: ResourceAccessFailureRouteContext | undefined,
): ResourceAccessFailureRouteContext | undefined {
  if (!route) {
    return undefined;
  }

  const host = safeToken(route.host);
  const pathPrefix = safePath(route.pathPrefix);
  const resourceId = safeToken(route.resourceId);
  const deploymentId = safeToken(route.deploymentId);
  const domainBindingId = safeToken(route.domainBindingId);
  const serverId = safeToken(route.serverId);
  const destinationId = safeToken(route.destinationId);
  const providerKey = safeToken(route.providerKey);
  const routeId = safeRouteIdentifier(route.routeId);
  const diagnosticId = safeRouteIdentifier(route.diagnosticId);
  const routeStatus = safeToken(route.routeStatus);
  const sanitized: ResourceAccessFailureRouteContext = {
    ...(host ? { host } : {}),
    ...(pathPrefix ? { pathPrefix } : {}),
    ...(resourceId ? { resourceId } : {}),
    ...(deploymentId ? { deploymentId } : {}),
    ...(domainBindingId ? { domainBindingId } : {}),
    ...(serverId ? { serverId } : {}),
    ...(destinationId ? { destinationId } : {}),
    ...(providerKey ? { providerKey } : {}),
    ...(routeId ? { routeId } : {}),
    ...(diagnosticId ? { diagnosticId } : {}),
    ...(route.routeSource ? { routeSource: route.routeSource } : {}),
    ...(routeStatus ? { routeStatus } : {}),
  };

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function sanitizeAppliedRouteContextMetadata(
  input: unknown,
): AppliedRouteContextMetadata | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  if (record.schemaVersion !== "applied-route-context/v1") {
    return undefined;
  }

  const resourceId = safeToken(
    typeof record.resourceId === "string" ? record.resourceId : undefined,
  );
  const routeId = safeRouteIdentifier(
    typeof record.routeId === "string" ? record.routeId : undefined,
  );
  const diagnosticId = safeRouteIdentifier(
    typeof record.diagnosticId === "string" ? record.diagnosticId : undefined,
  );
  const routeSource = safeRouteSource(record.routeSource);
  const hostname = safeToken(typeof record.hostname === "string" ? record.hostname : undefined);
  const pathPrefix = safePath(
    typeof record.pathPrefix === "string" ? record.pathPrefix : undefined,
  );
  const proxyKind = safeProxyKind(record.proxyKind);

  if (
    !resourceId ||
    !routeId ||
    !diagnosticId ||
    !routeSource ||
    !hostname ||
    !pathPrefix ||
    !proxyKind
  ) {
    return undefined;
  }

  const deploymentId = safeToken(
    typeof record.deploymentId === "string" ? record.deploymentId : undefined,
  );
  const domainBindingId = safeToken(
    typeof record.domainBindingId === "string" ? record.domainBindingId : undefined,
  );
  const serverId = safeToken(typeof record.serverId === "string" ? record.serverId : undefined);
  const destinationId = safeToken(
    typeof record.destinationId === "string" ? record.destinationId : undefined,
  );
  const providerKey = safeToken(
    typeof record.providerKey === "string" ? record.providerKey : undefined,
  );
  const appliedAt = safeToken(typeof record.appliedAt === "string" ? record.appliedAt : undefined);
  const observedAt = safeToken(
    typeof record.observedAt === "string" ? record.observedAt : undefined,
  );

  return {
    schemaVersion: "applied-route-context/v1",
    resourceId,
    ...(deploymentId ? { deploymentId } : {}),
    ...(domainBindingId ? { domainBindingId } : {}),
    ...(serverId ? { serverId } : {}),
    ...(destinationId ? { destinationId } : {}),
    routeId,
    diagnosticId,
    routeSource,
    hostname,
    pathPrefix,
    proxyKind,
    ...(providerKey ? { providerKey } : {}),
    ...(appliedAt ? { appliedAt } : {}),
    ...(observedAt ? { observedAt } : {}),
  };
}

export function appliedRouteContextToDiagnosticRoute(
  metadata: AppliedRouteContextMetadata,
): ResourceAccessFailureRouteContext {
  return {
    host: metadata.hostname,
    pathPrefix: metadata.pathPrefix,
    resourceId: metadata.resourceId,
    ...(metadata.deploymentId ? { deploymentId: metadata.deploymentId } : {}),
    ...(metadata.domainBindingId ? { domainBindingId: metadata.domainBindingId } : {}),
    ...(metadata.serverId ? { serverId: metadata.serverId } : {}),
    ...(metadata.destinationId ? { destinationId: metadata.destinationId } : {}),
    ...(metadata.providerKey ? { providerKey: metadata.providerKey } : {}),
    routeId: metadata.routeId,
    diagnosticId: metadata.diagnosticId,
    routeSource: metadata.routeSource,
    routeStatus: "applied",
  };
}

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
  const affected = sanitizeAffectedRequest(input.affected);
  const route = sanitizeRouteContext(input.route);
  const causeCode = safeToken(input.causeCode);
  const correlationId = safeToken(input.correlationId);
  const causationId = safeToken(input.causationId);

  return {
    schemaVersion: "resource-access-failure/v1",
    requestId: safeToken(input.requestId) ?? "req_unknown",
    generatedAt: input.generatedAt ?? defaultGeneratedAt,
    code,
    category: defaults.category,
    phase: defaults.phase,
    httpStatus: defaults.httpStatus,
    retriable: defaults.retriable,
    ownerHint: defaults.ownerHint,
    nextAction: nextActionByCode[code],
    ...(affected ? { affected } : {}),
    ...(route ? { route } : {}),
    ...(causeCode ? { causeCode } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(causationId ? { causationId } : {}),
  };
}
