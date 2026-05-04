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

export interface ResourceAccessFailureHtmlRenderOptions {
  mode?: "backend" | "static";
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function publicMessage(diagnostic: ResourceAccessFailureDiagnostic): string {
  switch (diagnostic.ownerHint) {
    case "resource":
      return "The request reached Appaloft, but the application did not respond successfully.";
    case "operator-config":
      return "The request reached Appaloft, but the route configuration could not serve traffic.";
    case "platform":
      return "The request reached Appaloft, but the edge route is not available.";
    case "unknown":
      return "The request reached Appaloft, but the route failed before a response was available.";
  }
}

function diagnosticRows(diagnostic: ResourceAccessFailureDiagnostic): [string, string][] {
  const rows: [string, string][] = [
    ["Request ID", diagnostic.requestId],
    ["Code", diagnostic.code],
    ["Category", diagnostic.category],
    ["Phase", diagnostic.phase],
    ["Retriable", String(diagnostic.retriable)],
    ["Next action", diagnostic.nextAction],
    ["Generated at", diagnostic.generatedAt],
  ];
  if (diagnostic.affected?.url) {
    rows.push(["Affected URL", diagnostic.affected.url]);
  }
  if (diagnostic.affected?.hostname) {
    rows.push(["Affected host", diagnostic.affected.hostname]);
  }
  if (diagnostic.affected?.path) {
    rows.push(["Affected path", diagnostic.affected.path]);
  }
  if (diagnostic.affected?.method) {
    rows.push(["Affected method", diagnostic.affected.method]);
  }
  return rows;
}

function routeRows(diagnostic: ResourceAccessFailureDiagnostic): [string, string][] {
  const route = diagnostic.route;
  if (!route) {
    return [];
  }

  const rows: [string, string][] = [];
  if (route.diagnosticId) {
    rows.push(["Diagnostic ID", route.diagnosticId]);
  }
  if (route.host) {
    rows.push(["Route host", route.host]);
  }
  if (route.pathPrefix) {
    rows.push(["Path prefix", route.pathPrefix]);
  }
  if (route.resourceId) {
    rows.push(["Resource ID", route.resourceId]);
  }
  if (route.deploymentId) {
    rows.push(["Deployment ID", route.deploymentId]);
  }
  if (route.domainBindingId) {
    rows.push(["Domain binding ID", route.domainBindingId]);
  }
  if (route.serverId) {
    rows.push(["Server ID", route.serverId]);
  }
  if (route.destinationId) {
    rows.push(["Destination ID", route.destinationId]);
  }
  if (route.routeId) {
    rows.push(["Route ID", route.routeId]);
  }
  if (route.routeSource) {
    rows.push(["Route source", route.routeSource]);
  }
  if (route.routeStatus) {
    rows.push(["Route status", route.routeStatus]);
  }
  if (route.providerKey) {
    rows.push(["Provider", route.providerKey]);
  }
  return rows;
}

function renderRows(rows: readonly [string, string][]): string {
  return rows
    .map(
      ([label, value]) =>
        `<div class="row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join("");
}

export function renderResourceAccessFailureDiagnosticHtml(
  diagnostic: ResourceAccessFailureDiagnostic,
  options: ResourceAccessFailureHtmlRenderOptions = {},
): string {
  const code = escapeHtml(diagnostic.code);
  const message = escapeHtml(publicMessage(diagnostic));
  const nextAction = escapeHtml(diagnostic.nextAction);
  const edgeStatus = diagnostic.ownerHint === "platform" ? "Error" : "Working";
  const resourceStatus = diagnostic.ownerHint === "platform" ? "Unknown" : "Error";
  const routeDetails = routeRows(diagnostic);
  const mode = options.mode ?? "backend";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Appaloft access error</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #172026;
        background: #f7f9fb;
      }
      body { margin: 0; }
      main { max-width: 860px; margin: 0 auto; padding: 56px 24px; }
      h1 { margin: 0 0 8px; font-size: 36px; line-height: 1.1; font-weight: 650; }
      p { margin: 0; color: #4b5a62; }
      .code {
        display: inline-flex;
        margin-left: 8px;
        padding: 3px 8px;
        border-radius: 6px;
        background: #e8edf2;
        color: #38464e;
        font-size: 12px;
        vertical-align: middle;
      }
      .timeline { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 40px 0 32px; }
      .step { border: 1px solid #d8e0e6; border-radius: 8px; background: #fff; padding: 18px; }
      .label { color: #667985; font-size: 13px; }
      .status { margin-top: 8px; font-size: 18px; font-weight: 650; }
      .ok { color: #217a42; }
      .bad { color: #b42318; }
      .details { margin-top: 28px; padding-top: 18px; border-top: 1px solid #d8e0e6; }
      .details h2 { margin: 0 0 12px; font-size: 15px; }
      .row { display: grid; grid-template-columns: minmax(130px, 220px) 1fr; gap: 12px; padding: 6px 0; font-size: 13px; }
      dt { color: #667985; }
      dd { margin: 0; color: #172026; overflow-wrap: anywhere; }
      @media (max-width: 680px) {
        main { padding: 36px 18px; }
        h1 { font-size: 30px; }
        .timeline, .row { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body data-appaloft-renderer="${escapeHtml(mode)}">
    <main>
      <h1>Application unavailable <span class="code">${code}</span></h1>
      <p>${message}</p>
      <section class="timeline" aria-label="Request path">
        <div class="step">
          <div class="label">Browser</div>
          <div class="status ok">Working</div>
        </div>
        <div class="step">
          <div class="label">Appaloft Edge</div>
          <div class="status ${edgeStatus === "Working" ? "ok" : "bad"}">${edgeStatus}</div>
        </div>
        <div class="step">
          <div class="label">Application</div>
          <div class="status ${resourceStatus === "Error" ? "bad" : ""}">${resourceStatus}</div>
        </div>
      </section>
      <p>Try again shortly. If you own this app, use the request id below in resource health or diagnostics.</p>
      <section class="details" aria-label="Diagnostic details">
        <h2>Diagnostic</h2>
        <dl>${renderRows(diagnosticRows(diagnostic))}</dl>
      </section>
      ${
        routeDetails.length > 0
          ? `<section class="details" aria-label="Route context"><h2>Route context</h2><dl>${renderRows(routeDetails)}</dl></section>`
          : ""
      }
      <p class="details">Next action: ${nextAction}</p>
    </main>
  </body>
</html>`;
}

export function resourceAccessFailureProblemDetails(
  diagnostic: ResourceAccessFailureDiagnostic,
): Record<string, unknown> {
  return {
    type: "https://appaloft.dev/problems/resource-access-failure",
    title: "Resource access failed",
    status: diagnostic.httpStatus,
    code: diagnostic.code,
    category: diagnostic.category,
    phase: diagnostic.phase,
    requestId: diagnostic.requestId,
    generatedAt: diagnostic.generatedAt,
    retriable: diagnostic.retriable,
    ownerHint: diagnostic.ownerHint,
    nextAction: diagnostic.nextAction,
    ...(diagnostic.affected ? { affected: diagnostic.affected } : {}),
    ...(diagnostic.route ? { route: diagnostic.route } : {}),
    ...(diagnostic.causeCode ? { causeCode: diagnostic.causeCode } : {}),
  };
}

export function renderResourceAccessFailureStaticRendererAsset(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Appaloft access error</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172026; background: #f7f9fb; }
      body { margin: 0; }
      main { max-width: 860px; margin: 0 auto; padding: 56px 24px; }
      h1 { margin: 0 0 8px; font-size: 36px; line-height: 1.1; font-weight: 650; }
      p { margin: 0; color: #4b5a62; }
      .code { display: inline-flex; margin-left: 8px; padding: 3px 8px; border-radius: 6px; background: #e8edf2; color: #38464e; font-size: 12px; vertical-align: middle; }
      .timeline { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 40px 0 32px; }
      .step { border: 1px solid #d8e0e6; border-radius: 8px; background: #fff; padding: 18px; }
      .label { color: #667985; font-size: 13px; }
      .status { margin-top: 8px; font-size: 18px; font-weight: 650; }
      .ok { color: #217a42; }
      .bad { color: #b42318; }
      .details { margin-top: 28px; padding-top: 18px; border-top: 1px solid #d8e0e6; }
      .details h2 { margin: 0 0 12px; font-size: 15px; }
      .row { display: grid; grid-template-columns: minmax(130px, 220px) 1fr; gap: 12px; padding: 6px 0; font-size: 13px; }
      dt { color: #667985; }
      dd { margin: 0; color: #172026; overflow-wrap: anywhere; }
      @media (max-width: 680px) { main { padding: 36px 18px; } h1 { font-size: 30px; } .timeline, .row { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <h1>Application unavailable <span class="code" data-field="code">resource_access_unknown</span></h1>
      <p data-field="message">The request reached Appaloft, but the route failed before a response was available.</p>
      <section class="timeline" aria-label="Request path">
        <div class="step"><div class="label">Browser</div><div class="status ok">Working</div></div>
        <div class="step"><div class="label">Appaloft Edge</div><div class="status bad" data-field="edgeStatus">Error</div></div>
        <div class="step"><div class="label">Application</div><div class="status" data-field="resourceStatus">Unknown</div></div>
      </section>
      <p>Try again shortly. If you own this app, use the request id below in resource health or diagnostics.</p>
      <section class="details" aria-label="Diagnostic details"><h2>Diagnostic</h2><dl data-section="diagnostic"></dl></section>
      <section class="details" aria-label="Route context" data-route-section hidden><h2>Route context</h2><dl data-section="route"></dl></section>
    </main>
    <script>
      (() => {
        const params = new URLSearchParams(window.location.search);
        const token = (value, fallback = "") => {
          const normalized = (value || "").trim().replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 160);
          return normalized || fallback;
        };
        const routeToken = (value) => {
          const normalized = (value || "").trim().replace(/[^A-Za-z0-9._:/-]/g, "_").slice(0, 220);
          return normalized || "";
        };
        const path = (value) => {
          const safe = (value || "").split("?")[0].split("#")[0].trim();
          return safe ? (safe.startsWith("/") ? safe : "/" + safe) : "";
        };
        const url = (value) => {
          try {
            const parsed = new URL(value || "");
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
            parsed.search = "";
            parsed.hash = "";
            return parsed.toString().replace(/\\/$/, parsed.pathname === "/" ? "/" : "");
          } catch {
            return "";
          }
        };
        const method = (value) => {
          const normalized = (value || "").trim().toUpperCase();
          return /^[A-Z]{1,16}$/.test(normalized) ? normalized : "";
        };
        const codeFromStatus = (status) => {
          if (status === "404") return "resource_access_route_not_found";
          if (status === "502") return "resource_access_upstream_connect_failed";
          if (status === "503") return "resource_access_proxy_unavailable";
          if (status === "504") return "resource_access_upstream_timeout";
          return "resource_access_unknown";
        };
        const defaults = {
          resource_access_route_not_found: ["not-found", "edge-request-routing", "false", "platform", "inspect-proxy-preview"],
          resource_access_proxy_unavailable: ["infra", "proxy-route-observation", "true", "platform", "inspect-proxy-preview"],
          resource_access_route_unavailable: ["infra", "proxy-route-observation", "true", "operator-config", "inspect-proxy-preview"],
          resource_access_upstream_unavailable: ["infra", "upstream-connection", "true", "resource", "check-health"],
          resource_access_upstream_connect_failed: ["infra", "upstream-connection", "true", "resource", "check-health"],
          resource_access_upstream_timeout: ["timeout", "upstream-connection", "true", "resource", "check-health"],
          resource_access_upstream_reset: ["infra", "upstream-response", "true", "resource", "inspect-runtime-logs"],
          resource_access_upstream_tls_failed: ["integration", "upstream-connection", "true", "operator-config", "inspect-proxy-preview"],
          resource_access_edge_error: ["infra", "diagnostic-page-render", "true", "platform", "diagnostic-summary"],
          resource_access_unknown: ["infra", "diagnostic-page-render", "true", "unknown", "diagnostic-summary"],
        };
        const requestedCode = token(params.get("code"));
        const code = defaults[requestedCode] ? requestedCode : codeFromStatus(token(params.get("status")));
        const [category, phase, retriable, ownerHint, nextAction] = defaults[code];
        const requestId = token(params.get("requestId"), "req_unavailable");
        const generatedAt = token(params.get("generatedAt"), new Date().toISOString());
        const diagnosticId = routeToken(params.get("diagnosticId"));
        const rows = [
          ["Request ID", requestId],
          ["Code", code],
          ["Category", category],
          ["Phase", phase],
          ["Retriable", retriable],
          ["Next action", nextAction],
          ["Generated at", generatedAt],
          ["Affected URL", url(params.get("affectedUrl"))],
          ["Affected host", token(params.get("host"))],
          ["Affected path", path(params.get("path"))],
          ["Affected method", method(params.get("method"))],
        ].filter((row) => row[1]);
        const routeRows = [
          ["Diagnostic ID", diagnosticId],
          ["Route host", token(params.get("routeHost") || params.get("host"))],
          ["Path prefix", path(params.get("pathPrefix"))],
          ["Resource ID", token(params.get("resourceId"))],
          ["Deployment ID", token(params.get("deploymentId"))],
          ["Domain binding ID", token(params.get("domainBindingId"))],
          ["Server ID", token(params.get("serverId"))],
          ["Destination ID", token(params.get("destinationId"))],
          ["Route ID", routeToken(params.get("routeId"))],
          ["Route source", token(params.get("routeSource"))],
          ["Route status", token(params.get("routeStatus"))],
          ["Provider", token(params.get("providerKey"))],
        ].filter((row) => row[1]);
        const addRows = (selector, values) => {
          const target = document.querySelector(selector);
          if (!target) return;
          for (const [label, value] of values) {
            const wrapper = document.createElement("div");
            wrapper.className = "row";
            const dt = document.createElement("dt");
            dt.textContent = label;
            const dd = document.createElement("dd");
            dd.textContent = value;
            wrapper.append(dt, dd);
            target.append(wrapper);
          }
        };
        document.querySelector('[data-field="code"]').textContent = code;
        document.querySelector('[data-section="diagnostic"]').setAttribute("data-schema", "resource-access-failure/v1");
        addRows('[data-section="diagnostic"]', rows);
        if (routeRows.length > 0) {
          document.querySelector("[data-route-section]").hidden = false;
          addRows('[data-section="route"]', routeRows);
        }
      })();
    </script>
  </body>
</html>`;
}
