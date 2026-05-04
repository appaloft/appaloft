import {
  type AppliedRouteContextMetadata,
  appliedRouteContextToDiagnosticRoute,
  classifyResourceAccessFailure,
  parseResourceAccessFailureCode,
  parseResourceAccessFailureSignal,
  type ResourceAccessFailureDiagnostic,
  type ResourceAccessRouteSource,
  renderResourceAccessFailureDiagnosticHtml,
  resourceAccessFailureCodeFromHttpStatus,
  resourceAccessFailureProblemDetails,
  sanitizeAppliedRouteContextMetadata,
} from "@appaloft/application";

const routeFailureSignalHeader = "x-appaloft-resource-access-signal";

function firstQueryValue(searchParams: URLSearchParams, key: string): string | null {
  const value = searchParams.get(key)?.trim();
  return value && value.length > 0 ? value : null;
}

function parseStatus(input: string | null): number | null {
  if (!input) {
    return null;
  }

  const status = Number(input);
  return Number.isInteger(status) ? status : null;
}

function parseRouteSource(input: string | null): ResourceAccessRouteSource | null {
  switch (input) {
    case "generated-default":
    case "durable-domain":
    case "server-applied":
    case "deployment-snapshot":
      return input;
    default:
      return null;
  }
}

function parseAppliedRouteContext(input: string | null): AppliedRouteContextMetadata | undefined {
  if (!input) {
    return undefined;
  }

  try {
    return sanitizeAppliedRouteContextMetadata(JSON.parse(input));
  } catch {
    return undefined;
  }
}

function safeToken(input: string | null, fallback: string): string {
  if (!input) {
    return fallback;
  }

  const normalized = input.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 160);
  return normalized.length > 0 ? normalized : fallback;
}

function requestAcceptsHtml(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json") || accept.includes("application/problem+json")) {
    return false;
  }

  return accept.includes("text/html");
}

function resolveRequestId(request: Request, searchParams: URLSearchParams): string {
  return safeToken(
    firstQueryValue(searchParams, "requestId") ?? request.headers.get("x-request-id"),
    "req_unavailable",
  );
}

function buildDiagnostic(request: Request, now: () => string): ResourceAccessFailureDiagnostic {
  const url = new URL(request.url);
  const code = parseResourceAccessFailureCode(firstQueryValue(url.searchParams, "code"));
  const signal =
    parseResourceAccessFailureSignal(firstQueryValue(url.searchParams, "signal")) ??
    parseResourceAccessFailureSignal(request.headers.get(routeFailureSignalHeader));
  const status = parseStatus(firstQueryValue(url.searchParams, "status"));
  const statusCode = status === null ? null : resourceAccessFailureCodeFromHttpStatus(status);
  const selectedCode = code ?? (signal ? null : statusCode);
  const affectedUrl = firstQueryValue(url.searchParams, "affectedUrl");
  const affectedHostname = firstQueryValue(url.searchParams, "host");
  const affectedPath = firstQueryValue(url.searchParams, "path");
  const routeSource = parseRouteSource(firstQueryValue(url.searchParams, "routeSource"));
  const routeHost = firstQueryValue(url.searchParams, "routeHost");
  const pathPrefix = firstQueryValue(url.searchParams, "pathPrefix");
  const resourceId = firstQueryValue(url.searchParams, "resourceId");
  const deploymentId = firstQueryValue(url.searchParams, "deploymentId");
  const domainBindingId = firstQueryValue(url.searchParams, "domainBindingId");
  const serverId = firstQueryValue(url.searchParams, "serverId");
  const destinationId = firstQueryValue(url.searchParams, "destinationId");
  const providerKey = firstQueryValue(url.searchParams, "providerKey");
  const routeId = firstQueryValue(url.searchParams, "routeId");
  const routeStatus = firstQueryValue(url.searchParams, "routeStatus");
  const appliedRouteContext = parseAppliedRouteContext(
    firstQueryValue(url.searchParams, "appliedRouteContext"),
  );

  return classifyResourceAccessFailure({
    ...(selectedCode ? { code: selectedCode } : {}),
    ...(signal && !code ? { signal } : {}),
    requestId: resolveRequestId(request, url.searchParams),
    generatedAt: now(),
    affected: {
      ...(affectedUrl ? { url: affectedUrl } : {}),
      ...(affectedHostname ? { hostname: affectedHostname } : {}),
      ...(affectedPath ? { path: affectedPath } : {}),
      method: request.method,
    },
    route: appliedRouteContext
      ? appliedRouteContextToDiagnosticRoute(appliedRouteContext)
      : {
          ...(routeHost ? { host: routeHost } : {}),
          ...(pathPrefix ? { pathPrefix } : {}),
          ...(resourceId ? { resourceId } : {}),
          ...(deploymentId ? { deploymentId } : {}),
          ...(domainBindingId ? { domainBindingId } : {}),
          ...(serverId ? { serverId } : {}),
          ...(destinationId ? { destinationId } : {}),
          ...(providerKey ? { providerKey } : {}),
          ...(routeId ? { routeId } : {}),
          ...(routeSource ? { routeSource } : {}),
          ...(routeStatus ? { routeStatus } : {}),
        },
    ...(firstQueryValue(url.searchParams, "causeCode")
      ? { causeCode: safeToken(firstQueryValue(url.searchParams, "causeCode"), "") }
      : {}),
    ...(request.headers.get("x-request-id")
      ? { correlationId: safeToken(request.headers.get("x-request-id"), "req_unavailable") }
      : {}),
  });
}

export async function resourceAccessFailureDiagnosticResponse(
  request: Request,
  input?: {
    now?: () => string;
    retentionMs?: number;
    enrichEvidence?: (
      diagnostic: ResourceAccessFailureDiagnostic,
      appliedRouteContext?: AppliedRouteContextMetadata,
    ) => Promise<ResourceAccessFailureDiagnostic>;
    recordEvidence?: (
      diagnostic: ResourceAccessFailureDiagnostic,
      capturedAt: string,
      expiresAt: string,
    ) => Promise<void>;
  },
): Promise<Response> {
  const now = input?.now ?? (() => new Date().toISOString());
  const diagnostic = buildDiagnostic(request, now);
  const appliedRouteContext = parseAppliedRouteContext(
    firstQueryValue(new URL(request.url).searchParams, "appliedRouteContext"),
  );
  const capturedAt = diagnostic.generatedAt;
  const expiresAt = new Date(
    Date.parse(capturedAt) + (input?.retentionMs ?? 10 * 60 * 1000),
  ).toISOString();

  if (input?.recordEvidence) {
    try {
      const evidenceDiagnostic = input.enrichEvidence
        ? await input.enrichEvidence(diagnostic, appliedRouteContext)
        : diagnostic;
      await input.recordEvidence(evidenceDiagnostic, capturedAt, expiresAt);
    } catch {
      // The renderer must still explain the failed request if short-retention evidence is unavailable.
    }
  }

  if (requestAcceptsHtml(request)) {
    return new Response(renderResourceAccessFailureDiagnosticHtml(diagnostic), {
      status: diagnostic.httpStatus,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "x-appaloft-diagnostic-code": diagnostic.code,
        "x-request-id": diagnostic.requestId,
      },
    });
  }

  return Response.json(resourceAccessFailureProblemDetails(diagnostic), {
    status: diagnostic.httpStatus,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/problem+json",
      "x-appaloft-diagnostic-code": diagnostic.code,
      "x-request-id": diagnostic.requestId,
    },
  });
}
