import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { createAppaloftMcpServer, handleAppaloftMcpHttpRequest } from "@appaloft/ai-mcp";
import {
  type ActionDeployTokenAuthorizationPort,
  type AppLogger,
  ApplyInstanceUpgradeCommand,
  type AutomaticRouteContextLookup,
  type CertificateHttpChallengeTokenStore,
  CheckInstanceUpgradeQuery,
  type CommandBus,
  type DeploymentProgressObserver,
  DoctorQuery,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ExecutionPrincipal,
  type ExecutionRequestSecurityContext,
  enrichResourceAccessFailureDiagnosticWithRouteContext,
  GetAuthBootstrapStatusQuery,
  type GitHubPreviewPullRequestWebhookVerifier,
  type GitHubSourceEventWebhookVerifier,
  type ProductSessionAuthorizationPort,
  type QueryBus,
  type ResourceAccessFailureEvidenceRecorder,
  type SourceEventVerificationPort,
  type TerminalSession,
  type TerminalSessionGateway,
  toRepositoryContext,
  UpsertGitHubAppInstallationCommand,
} from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";
import { type AuthPublicConfig, apiVersion, type ReadinessResponse } from "@appaloft/contracts";
import { err, ok, type Result } from "@appaloft/core";
import { appaloftDeploymentConfigJsonSchema } from "@appaloft/deployment-config";
import {
  createAppaloftTranslator,
  i18nKeys,
  resolveAppaloftLocaleFromHeaders,
  translateDomainError,
} from "@appaloft/i18n";
import {
  finishActiveHttpServerSpan,
  updateActiveHttpServerSpan,
  wrapHttpRequestHandlerWithSpan,
  writeActiveTraceResponseHeaders,
} from "@appaloft/observability";
import {
  type ActionSourcePackageConfigReader,
  type AppaloftOrpcRouterContribution,
  mountAppaloftOrpcRoutes,
  type RequestContextRunnerOptions,
} from "@appaloft/orpc";
import {
  isSystemPluginHtmlRouteResult,
  type SystemPluginHttpMiddleware,
  type SystemPluginHttpRoute,
  type SystemPluginHttpRouteResult,
  type SystemPluginWebExtension,
} from "@appaloft/plugin-sdk";
import { Elysia } from "elysia";
import { resourceAccessFailureDiagnosticResponse } from "./resource-access-failure-diagnostics";

interface SystemPluginRuntime {
  listWebExtensions(): Array<
    SystemPluginWebExtension & {
      pluginName: string;
      pluginDisplayName: string;
    }
  >;
  listHttpMiddlewares(): SystemPluginHttpMiddleware[];
  listHttpRoutes(): SystemPluginHttpRoute[];
}

interface AuthRuntime extends ProductSessionAuthorizationPort {
  getPublicConfig(): AuthPublicConfig;
  getSessionStatus(request: Request): Promise<{
    accountSecurity: {
      changePasswordPath?: string;
      enabled: boolean;
      pagePath?: string;
      passwordState: "not-set" | "set" | "unknown";
      setPasswordPath?: string;
    };
    accountRecovery: {
      cooldownSeconds?: number;
      enabled: boolean;
      forgotPasswordPagePath?: string;
      requestPath?: string;
      resetPagePath?: string;
      resetPath?: string;
    };
    enabled: boolean;
    emailVerification: {
      cooldownSeconds?: number;
      enabled: boolean;
      otpLength?: number;
      otpEnabled: boolean;
      required: boolean;
      sendOtpPath?: string;
      verifyOtpPath?: string;
      verifyPagePath?: string;
    };
    provider: "none" | "better-auth";
    loginRequired: boolean;
    deferredAuth: boolean;
    session: unknown | null;
    providers: Array<{
      key: "github" | "google" | "oidc";
      title: string;
      configured: boolean;
      connected: boolean;
      requiresSignIn: boolean;
      deferred: boolean;
      connectPath?: string;
      reason?: string;
    }>;
  }>;
  getProviderAccessToken(request: Request, providerKey: "github"): Promise<string | null>;
  handle(request: Request): Promise<Response>;
}

interface RequestContextRunner {
  runWithRequest<T>(
    request: Request,
    context: ExecutionContext,
    callback: () => Promise<T>,
    options?: RequestContextRunnerOptions,
  ): Promise<T>;
}

type TerminalClientMessage =
  | {
      kind: "input";
      data: string;
    }
  | {
      kind: "resize";
      rows: number;
      cols: number;
    }
  | {
      kind: "close";
    };

const requestSecurityHeaderMap = {
  edgeAction: "x-appaloft-edge-action",
  edgeProvider: "x-appaloft-edge-provider",
  edgeRayId: "x-appaloft-edge-ray-id",
  edgeRuleId: "x-appaloft-edge-rule-id",
  botScore: "x-appaloft-bot-score",
  fraudRiskScore: "x-appaloft-fraud-risk-score",
} as const;

interface TerminalWebSocket {
  data?: {
    params?: {
      sessionId?: string;
    };
  };
  send(message: string): void;
  close(code?: number, reason?: string): void;
}

type EmbeddedStaticAssets = Readonly<Record<string, Blob>>;

type MutableHeaders = Record<string, string>;

interface StaticAssetSource {
  embeddedAssets: EmbeddedStaticAssets;
  fallbackToRootIndex: boolean;
  staticDir: string | null;
}

interface PublicRuntimeConfig {
  auth: AuthPublicConfig;
  docs?: {
    basePath: string;
  };
}

const firstAdminBootstrapPath = "/bootstrap/auth/first-admin";
const forgotPasswordPath = "/forgot-password";
const loginPath = "/login";
const resetPasswordPath = "/reset-password";
const signUpPath = "/sign-up";
const verifyEmailPath = "/verify-email";
const githubAppQuickDeployReturnPath =
  "/?modal=quick-deploy&source=github&githubMode=browser&step=source";

const disabledAuthPublicConfig: AuthPublicConfig = {
  schemaVersion: "appaloft.auth.public-config/v1",
  enabled: false,
  provider: "none",
  providers: [],
};

function publicReadiness(readiness: ReadinessResponse): ReadinessResponse {
  const details: Record<string, string> = {};

  if (readiness.details?.databaseDriver) {
    details.databaseDriver = readiness.details.databaseDriver;
  }
  if (readiness.details?.databaseMode) {
    details.databaseMode = readiness.details.databaseMode;
  }

  return {
    status: readiness.status,
    checks: readiness.checks,
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function isSafeStaticArtifactSegment(value: string): boolean {
  return (
    Boolean(value) &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\")
  );
}

function readStaticArtifactAlias(
  aliasPath: string,
  projectId: string,
  resourceId: string,
): { artifactId: string; manifestDigest: string } | null {
  try {
    if (!existsSync(aliasPath) || !statSync(aliasPath).isFile()) {
      return null;
    }
    const parsed = JSON.parse(readFileSync(aliasPath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
      record.schemaVersion !== "appaloft-filesystem-static-artifact-alias/v1" ||
      record.projectId !== projectId ||
      record.resourceId !== resourceId ||
      typeof record.artifactId !== "string" ||
      typeof record.manifestDigest !== "string" ||
      !isSafeStaticArtifactSegment(record.artifactId) ||
      !isSafeStaticArtifactSegment(record.manifestDigest)
    ) {
      return null;
    }

    return {
      artifactId: record.artifactId,
      manifestDigest: record.manifestDigest,
    };
  } catch {
    return null;
  }
}

function readErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return createAppaloftTranslator()(i18nKeys.errors.backend.adapterUnhandled);
}

function unwrapResult<T>(context: ExecutionContext, result: Result<T>): T {
  return result.match(
    (value) => value,
    (error) => {
      throw new Error(translateDomainError(error, context.t));
    },
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalBoundedInteger(value: string | null): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : undefined;
}

function requestSecurityContextFromHeaders(
  headers: Headers,
): ExecutionRequestSecurityContext | undefined {
  const edgeAction = optionalString(headers.get(requestSecurityHeaderMap.edgeAction));
  const edgeProvider = optionalString(headers.get(requestSecurityHeaderMap.edgeProvider));
  const edgeRayId = optionalString(headers.get(requestSecurityHeaderMap.edgeRayId));
  const edgeRuleId = optionalString(headers.get(requestSecurityHeaderMap.edgeRuleId));
  const botScore = optionalBoundedInteger(headers.get(requestSecurityHeaderMap.botScore));
  const fraudRiskScore = optionalBoundedInteger(
    headers.get(requestSecurityHeaderMap.fraudRiskScore),
  );
  const requestSecurity = {
    ...(edgeAction ? { edgeAction } : {}),
    ...(edgeProvider ? { edgeProvider } : {}),
    ...(edgeRayId ? { edgeRayId } : {}),
    ...(edgeRuleId ? { edgeRuleId } : {}),
    ...(botScore !== undefined ? { botScore } : {}),
    ...(fraudRiskScore !== undefined ? { fraudRiskScore } : {}),
  };

  return Object.keys(requestSecurity).length > 0 ? requestSecurity : undefined;
}

function normalizePluginRouteResult(
  result: SystemPluginHttpRouteResult,
): Response | Record<string, unknown> | string | null {
  if (isSystemPluginHtmlRouteResult(result)) {
    const headers = new Headers(result.headers);
    if (!headers.has("content-type")) {
      headers.set("content-type", "text/html; charset=utf-8");
    }
    return new Response(result.body, {
      headers,
      status: result.status ?? 200,
    });
  }
  return result;
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "").toLowerCase();
}

function resolveWebRedirectUrl(input: {
  fallbackPath: string;
  state?: string | null;
  webOrigin: string;
}): string {
  const webOrigin = input.webOrigin.replace(/\/+$/, "");
  const fallback = new URL(input.fallbackPath, `${webOrigin}/`);
  const state = input.state?.trim();

  if (!state) {
    return fallback.toString();
  }

  try {
    const parsed = new URL(state, `${webOrigin}/`);
    if (normalizeOrigin(parsed.origin) !== normalizeOrigin(webOrigin)) {
      return fallback.toString();
    }

    return parsed.toString();
  } catch {
    return fallback.toString();
  }
}

function appendVaryHeader(headers: MutableHeaders, value: string): void {
  const current = headers.vary;

  if (!current) {
    headers.vary = value;
    return;
  }

  const values = current
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  if (!values.includes(value.toLowerCase())) {
    headers.vary = `${current}, ${value}`;
  }
}

function appendCsvHeader(headers: MutableHeaders, name: string, values: string[]): void {
  const existingKey = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  const current = existingKey ? headers[existingKey] : undefined;
  const currentValues = (current ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const normalized = new Set(currentValues.map((entry) => entry.toLowerCase()));

  for (const value of values) {
    if (!normalized.has(value.toLowerCase())) {
      currentValues.push(value);
      normalized.add(value.toLowerCase());
    }
  }

  headers[existingKey ?? name] = currentValues.join(", ");
}

function readHeader(headers: MutableHeaders, name: string): string | undefined {
  const normalizedName = name.toLowerCase();
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === normalizedName);

  return match?.[1];
}

function setTraceHeaders(headers: MutableHeaders, config: AppConfig): void {
  writeActiveTraceResponseHeaders(
    {
      getHeader(name) {
        return readHeader(headers, name);
      },
      setHeader(name, value) {
        const existingKey = Object.keys(headers).find(
          (key) => key.toLowerCase() === name.toLowerCase(),
        );
        headers[existingKey ?? name] = value;
      },
    },
    {
      ...(config.traceLinkBaseUrl ? { traceLinkBaseUrl: config.traceLinkBaseUrl } : {}),
      ...(config.traceLinkUrlTemplate ? { traceLinkUrlTemplate: config.traceLinkUrlTemplate } : {}),
    },
  );
}

function resolveStatusCode(status: unknown): number | undefined {
  if (typeof status === "number") {
    return status;
  }

  return undefined;
}

function createAllowedOrigins(input: {
  webOrigin: string;
  trustedOrigins?: readonly string[];
}): Set<string> {
  const origins = new Set<string>();
  const configuredOrigins = [input.webOrigin, ...(input.trustedOrigins ?? [])];

  for (const origin of configuredOrigins) {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) {
      continue;
    }

    origins.add(normalizedOrigin);

    try {
      const parsed = new URL(origin);

      if (parsed.hostname === "localhost") {
        parsed.hostname = "127.0.0.1";
        origins.add(normalizeOrigin(parsed.toString()));
      } else if (parsed.hostname === "127.0.0.1") {
        parsed.hostname = "localhost";
        origins.add(normalizeOrigin(parsed.toString()));
      }
    } catch {
      // Ignore invalid configured origins and fall back to the raw value.
    }
  }

  return origins;
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isMcpPath(pathname: string): boolean {
  return pathname === "/mcp" || pathname.startsWith("/mcp/");
}

function pluginRouteMatchesPath(routePath: string, pathname: string): boolean {
  if (routePath === pathname) {
    return true;
  }

  const wildcardIndex = routePath.indexOf("*");
  if (wildcardIndex >= 0) {
    return pathname.startsWith(routePath.slice(0, wildcardIndex));
  }

  const parameterIndex = routePath.indexOf(":");
  if (parameterIndex >= 0) {
    return pathname.startsWith(routePath.slice(0, parameterIndex));
  }

  return false;
}

function collectOrpcRoutePaths(contributions: readonly AppaloftOrpcRouterContribution[]): string[] {
  const paths = new Set<string>();
  const visited = new WeakSet<object>();

  function visit(value: unknown): void {
    if (!value || typeof value !== "object") {
      return;
    }

    if (visited.has(value)) {
      return;
    }
    visited.add(value);

    const record = value as Record<string, unknown>;
    const orpc = record["~orpc"];
    if (orpc && typeof orpc === "object") {
      const route = (orpc as Record<string, unknown>).route;
      if (route && typeof route === "object") {
        const path = (route as Record<string, unknown>).path;
        if (typeof path === "string" && path.length > 0) {
          paths.add(path);
        }
      }
    }

    for (const child of Object.values(record)) {
      visit(child);
    }
  }

  for (const contribution of contributions) {
    visit(contribution);
  }

  return Array.from(paths);
}

function isCorsPath(input: {
  pathname: string;
  pluginRoutes: readonly SystemPluginHttpRoute[];
  orpcRoutePaths: readonly string[];
}): boolean {
  return (
    isApiPath(input.pathname) ||
    isMcpPath(input.pathname) ||
    input.pluginRoutes.some((route) => pluginRouteMatchesPath(route.path, input.pathname)) ||
    input.orpcRoutePaths.some((routePath) => pluginRouteMatchesPath(routePath, input.pathname))
  );
}

function isDocsPath(pathname: string): boolean {
  return pathname === "/docs" || pathname.startsWith("/docs/");
}

function isBackendLogPath(pathname: string): boolean {
  return (
    isApiPath(pathname) ||
    isMcpPath(pathname) ||
    pathname.startsWith("/.well-known/acme-challenge/")
  );
}

function isFirstAdminBootstrapPath(pathname: string): boolean {
  return pathname === firstAdminBootstrapPath || pathname.startsWith(`${firstAdminBootstrapPath}/`);
}

function isLoginPath(pathname: string): boolean {
  return pathname === loginPath || pathname.startsWith(`${loginPath}/`);
}

function isForgotPasswordPath(pathname: string): boolean {
  return pathname === forgotPasswordPath || pathname.startsWith(`${forgotPasswordPath}/`);
}

function isResetPasswordPath(pathname: string): boolean {
  return pathname === resetPasswordPath || pathname.startsWith(`${resetPasswordPath}/`);
}

function isSignUpPath(pathname: string): boolean {
  return pathname === signUpPath || pathname.startsWith(`${signUpPath}/`);
}

function isVerifyEmailPath(pathname: string): boolean {
  return pathname === verifyEmailPath || pathname.startsWith(`${verifyEmailPath}/`);
}

function hasStaticAssetExtension(pathname: string): boolean {
  return (pathname.split("/").pop() ?? "").includes(".");
}

function isHtmlNavigationRequest(request: Request): boolean {
  const secFetchMode = request.headers.get("sec-fetch-mode")?.toLowerCase();
  if (secFetchMode === "navigate") {
    return true;
  }

  const accept = request.headers.get("accept")?.toLowerCase() ?? "";
  return accept.includes("text/html") || accept.includes("application/xhtml+xml");
}

function isConsoleNavigationPath(pathname: string): boolean {
  if (
    isApiPath(pathname) ||
    isMcpPath(pathname) ||
    isDocsPath(pathname) ||
    isFirstAdminBootstrapPath(pathname) ||
    isLoginPath(pathname) ||
    isForgotPasswordPath(pathname) ||
    isResetPasswordPath(pathname) ||
    isSignUpPath(pathname) ||
    isVerifyEmailPath(pathname) ||
    pathname.startsWith("/_app/") ||
    pathname.startsWith("/.well-known/acme-challenge/") ||
    pathname === "/.appaloft/resource-access-failure" ||
    hasStaticAssetExtension(pathname)
  ) {
    return false;
  }

  return true;
}

function shouldGateFirstAdminBootstrapNavigation(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  return isHtmlNavigationRequest(request) && isConsoleNavigationPath(readRequestPathname(request));
}

function shouldGateProductSessionNavigation(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  return isHtmlNavigationRequest(request) && isConsoleNavigationPath(readRequestPathname(request));
}

function readRequestPathname(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "/";
  }
}

function loginRedirectLocation(request: Request): string {
  try {
    const url = new URL(request.url);
    const next = `${url.pathname}${url.search}`;
    return `${loginPath}?next=${encodeURIComponent(next || "/")}`;
  } catch {
    return `${loginPath}?next=%2F`;
  }
}

function logHttpRequest(input: {
  durationMs?: number;
  logger: AppLogger;
  request: Request;
  requestId?: string;
  route?: string;
  statusCode: number;
}): void {
  const pathname = readRequestPathname(input.request);

  if (!isBackendLogPath(pathname)) {
    return;
  }

  const context = {
    method: input.request.method,
    path: pathname,
    statusCode: input.statusCode,
    ...(input.route ? { route: input.route } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
  };

  if (input.statusCode >= 500) {
    input.logger.error("http_request.completed", context);
    return;
  }

  if (input.statusCode >= 400) {
    input.logger.warn("http_request.completed", context);
    return;
  }

  input.logger.info("http_request.completed", context);
}

function resolveRequestHostname(request: Request): string | null {
  const host = request.headers.get("host")?.trim();

  if (!host) {
    return null;
  }

  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    const fallback = host.split(":")[0]?.trim().toLowerCase();
    return fallback && fallback.length > 0 ? fallback : null;
  }
}

function resolveCorsOrigin(request: Request, allowedOrigins: Set<string>): string | null {
  const origin = request.headers.get("origin");

  if (!origin) {
    return null;
  }

  return allowedOrigins.has(normalizeOrigin(origin)) ? origin : null;
}

function applyCorsHeaders(
  request: Request,
  headers: MutableHeaders,
  allowedOrigins: Set<string>,
): void {
  const allowedOrigin = resolveCorsOrigin(request, allowedOrigins);

  if (!allowedOrigin) {
    return;
  }

  headers["access-control-allow-origin"] = allowedOrigin;
  headers["access-control-allow-credentials"] = "true";
  headers["access-control-allow-methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
  headers["access-control-allow-headers"] =
    request.headers.get("access-control-request-headers") ?? "content-type, authorization";
  appendCsvHeader(headers, "access-control-expose-headers", ["traceparent", "Link"]);
  appendVaryHeader(headers, "Origin");
  appendVaryHeader(headers, "Access-Control-Request-Headers");
}

function encodeServerSentEvent(input: { event?: string; data: unknown }): string {
  const lines = input.event
    ? [`event: ${input.event}`, `data: ${JSON.stringify(input.data)}`]
    : [`data: ${JSON.stringify(input.data)}`];

  return `${lines.join("\n")}\n\n`;
}

function decodeTerminalClientMessage(message: unknown): TerminalClientMessage | null {
  let parsed: unknown;

  if (typeof message === "string") {
    try {
      parsed = JSON.parse(message);
    } catch {
      return null;
    }
  } else if (message instanceof ArrayBuffer) {
    try {
      parsed = JSON.parse(new TextDecoder().decode(message));
    } catch {
      return null;
    }
  } else if (message instanceof Uint8Array) {
    try {
      parsed = JSON.parse(new TextDecoder().decode(message));
    } catch {
      return null;
    }
  } else {
    parsed = message;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (record.kind === "input" && typeof record.data === "string") {
    return {
      kind: "input",
      data: record.data,
    };
  }

  if (
    record.kind === "resize" &&
    typeof record.rows === "number" &&
    typeof record.cols === "number"
  ) {
    return {
      kind: "resize",
      rows: record.rows,
      cols: record.cols,
    };
  }

  if (record.kind === "close") {
    return {
      kind: "close",
    };
  }

  return null;
}

function registerPluginRoute(
  app: Elysia,
  route: SystemPluginHttpRoute,
  allowedOrigins: Set<string>,
): Elysia {
  const handler = async ({
    request,
    params,
  }: {
    request: Request;
    params: Record<string, string>;
  }) =>
    normalizePluginRouteResult(
      await route.handle({
        request,
        params,
        query: new URL(request.url).searchParams,
        path: new URL(request.url).pathname,
        method: request.method,
        readJson: async () => {
          const contentType = request.headers.get("content-type") ?? "";
          if (!contentType.includes("application/json")) {
            return null;
          }

          return request.json();
        },
      }),
    );

  const appWithPreflight = registerCorsPreflightRoute(app, route.path, allowedOrigins);

  switch (route.method) {
    case "GET":
      return appWithPreflight.get(route.path, handler);
    case "POST":
      return appWithPreflight.post(route.path, handler);
    case "PUT":
      return appWithPreflight.put(route.path, handler);
    case "PATCH":
      return appWithPreflight.patch(route.path, handler);
    case "DELETE":
      return appWithPreflight.delete(route.path, handler);
  }
}

function registerCorsPreflightRoute(
  app: Elysia,
  routePath: string,
  allowedOrigins: Set<string>,
): Elysia {
  return app.options(routePath, ({ request, set }) => {
    applyCorsHeaders(request, set.headers as MutableHeaders, allowedOrigins);
    set.status = 204;
    return "";
  }) as unknown as Elysia;
}

export function createHttpApp(input: {
  config: AppConfig;
  commandBus: CommandBus;
  queryBus: QueryBus;
  logger: AppLogger;
  executionContextFactory: ExecutionContextFactory;
  deploymentProgressObserver?: DeploymentProgressObserver;
  terminalSessionGateway?: TerminalSessionGateway;
  pluginRuntime?: SystemPluginRuntime;
  authRuntime?: AuthRuntime;
  requestContextRunner?: RequestContextRunner;
  orpcRouterContributions?: readonly AppaloftOrpcRouterContribution[];
  embeddedStaticAssets?: EmbeddedStaticAssets;
  embeddedWebAssets?: EmbeddedStaticAssets;
  embeddedDocsAssets?: EmbeddedStaticAssets;
  certificateHttpChallengeTokenStore?: CertificateHttpChallengeTokenStore;
  resourceAccessFailureEvidenceRecorder?: ResourceAccessFailureEvidenceRecorder;
  resourceAccessRouteContextLookup?: AutomaticRouteContextLookup;
  sourceEventVerificationPort?: SourceEventVerificationPort;
  githubSourceEventWebhookVerifier?: GitHubSourceEventWebhookVerifier;
  githubPreviewPullRequestWebhookVerifier?: GitHubPreviewPullRequestWebhookVerifier;
  actionDeployTokenAuthorizationPort?: ActionDeployTokenAuthorizationPort;
  actionSourcePackageConfigReader?: ActionSourcePackageConfigReader;
}) {
  const pluginMiddlewares = input.pluginRuntime?.listHttpMiddlewares() ?? [];
  const pluginRoutes = input.pluginRuntime?.listHttpRoutes() ?? [];
  const orpcRoutePaths = collectOrpcRoutePaths(input.orpcRouterContributions ?? []);
  const webStaticDir = input.config.webStaticDir ? resolve(input.config.webStaticDir) : null;
  const docsStaticDir = input.config.docsStaticDir ? resolve(input.config.docsStaticDir) : null;
  const embeddedWebAssets = input.embeddedWebAssets ?? input.embeddedStaticAssets ?? {};
  const embeddedDocsAssets = input.embeddedDocsAssets ?? {};
  const allowedOrigins = createAllowedOrigins({
    webOrigin: input.config.webOrigin,
    ...(input.config.betterAuthTrustedOrigins
      ? { trustedOrigins: input.config.betterAuthTrustedOrigins }
      : {}),
  });
  const terminalSessionsBySocket = new WeakMap<object, TerminalSession>();
  const terminalSessionsBySessionId = new Map<string, TerminalSession>();
  const requestStartTimes = new WeakMap<Request, number>();
  let firstAdminBootstrapCompleted = false;

  function createHttpExecutionContext(request: Request): ExecutionContext {
    const requestId = request.headers.get("x-request-id");
    const requestSecurity = requestSecurityContextFromHeaders(request.headers);
    return input.executionContextFactory.create({
      entrypoint: "http",
      locale: resolveAppaloftLocaleFromHeaders(request.headers),
      ...(requestSecurity ? { requestSecurity } : {}),
      ...(requestId ? { requestId } : {}),
    });
  }

  function createMcpExecutionContext(request: Request): ExecutionContext {
    const requestId = request.headers.get("x-request-id");
    const requestSecurity = requestSecurityContextFromHeaders(request.headers);
    return input.executionContextFactory.create({
      entrypoint: "mcp",
      locale: resolveAppaloftLocaleFromHeaders(request.headers),
      actor: {
        kind: "system",
        id: "mcp",
        label: "appaloft-mcp",
      },
      ...(requestSecurity ? { requestSecurity } : {}),
      ...(requestId ? { requestId } : {}),
    });
  }

  async function authorizeAdminRequest(request: Request, context: ExecutionContext): Promise<void> {
    if (!input.authRuntime) {
      return;
    }

    const url = new URL(request.url);
    const authorization = request.headers.get("authorization");
    const cookie = request.headers.get("cookie");
    const result = await input.authRuntime.authorizeProductSession(context, {
      method: request.method,
      path: url.pathname,
      requiredRole: "admin",
      ...(authorization ? { authorizationHeader: authorization } : {}),
      ...(cookie ? { cookieHeader: cookie } : {}),
    });

    unwrapResult(context, result);
  }

  async function authorizedMemberContext(
    request: Request,
    context: ExecutionContext,
  ): Promise<ExecutionContext> {
    if (!input.authRuntime) {
      return context;
    }

    const url = new URL(request.url);
    const result = await input.authRuntime.authorizeProductSession(context, {
      method: request.method,
      path: url.pathname,
      requiredRole: "member",
      ...(request.headers.get("authorization")
        ? { authorizationHeader: request.headers.get("authorization") as string }
        : {}),
      ...(request.headers.get("cookie")
        ? { cookieHeader: request.headers.get("cookie") as string }
        : {}),
    });

    const authorized = unwrapResult(context, result);
    const principal: ExecutionPrincipal = {
      kind: authorized.actor.kind,
      actorId: authorized.actor.id,
      userId: authorized.userId,
      ...(authorized.email ? { email: authorized.email } : {}),
      activeOrganization: {
        organizationId: authorized.organizationId,
        role:
          authorized.organizationRole ??
          (authorized.role === "owner" || authorized.role === "admin"
            ? authorized.role
            : "developer"),
        productRole: authorized.role,
      },
    };

    return input.executionContextFactory.create({
      actor: authorized.actor,
      entrypoint: "http",
      locale: context.locale,
      principal,
      ...(context.requestSecurity ? { requestSecurity: context.requestSecurity } : {}),
      requestId: context.requestId,
    });
  }

  async function authorizedMcpContext(
    request: Request,
    context: ExecutionContext,
  ): Promise<Result<ExecutionContext>> {
    if (!input.authRuntime) {
      return ok(context);
    }

    const url = new URL(request.url);
    const result = await input.authRuntime.authorizeProductSession(context, {
      method: request.method,
      path: url.pathname,
      requiredRole: "member",
      ...(request.headers.get("authorization")
        ? { authorizationHeader: request.headers.get("authorization") as string }
        : {}),
      ...(request.headers.get("cookie")
        ? { cookieHeader: request.headers.get("cookie") as string }
        : {}),
    });

    if (result.isErr()) {
      return err(result.error);
    }

    const authorized = result.value;
    const principal: ExecutionPrincipal = {
      kind: authorized.actor.kind,
      actorId: authorized.actor.id,
      userId: authorized.userId,
      ...(authorized.email ? { email: authorized.email } : {}),
      activeOrganization: {
        organizationId: authorized.organizationId,
        role:
          authorized.organizationRole ??
          (authorized.role === "owner" || authorized.role === "admin"
            ? authorized.role
            : "developer"),
        productRole: authorized.role,
      },
    };

    return ok(
      input.executionContextFactory.create({
        actor: authorized.actor,
        entrypoint: "mcp",
        locale: context.locale,
        principal,
        ...(context.requestSecurity ? { requestSecurity: context.requestSecurity } : {}),
        requestId: context.requestId,
      }),
    );
  }

  function staticAssetResponse(pathname: string, source: StaticAssetSource): Response | null {
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const embeddedPath = `/${relativePath}`;
    const cleanUrlHtmlPath =
      relativePath &&
      !relativePath.endsWith("/") &&
      !(relativePath.split("/").pop() ?? "").includes(".")
        ? `${relativePath}.html`
        : null;

    if (source.staticDir) {
      const candidate = resolve(source.staticDir, relativePath);

      if (candidate !== source.staticDir && !candidate.startsWith(`${source.staticDir}${sep}`)) {
        return null;
      }

      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return staticFileResponse(candidate);
      }

      const routeIndexFile = join(candidate, "index.html");
      if (existsSync(routeIndexFile) && statSync(routeIndexFile).isFile()) {
        return staticFileResponse(routeIndexFile);
      }

      if (cleanUrlHtmlPath) {
        const cleanUrlHtmlFile = resolve(source.staticDir, cleanUrlHtmlPath);
        if (
          cleanUrlHtmlFile !== source.staticDir &&
          cleanUrlHtmlFile.startsWith(`${source.staticDir}${sep}`) &&
          existsSync(cleanUrlHtmlFile) &&
          statSync(cleanUrlHtmlFile).isFile()
        ) {
          return staticFileResponse(cleanUrlHtmlFile);
        }
      }

      if (source.fallbackToRootIndex) {
        const fallbackFile = join(source.staticDir, "200.html");
        if (existsSync(fallbackFile) && statSync(fallbackFile).isFile()) {
          return staticFileResponse(fallbackFile);
        }

        const indexFile = join(source.staticDir, "index.html");
        return existsSync(indexFile) && statSync(indexFile).isFile()
          ? staticFileResponse(indexFile)
          : null;
      }

      return null;
    }

    const embeddedAsset = source.embeddedAssets[embeddedPath];
    if (embeddedAsset) {
      return new Response(embeddedAsset);
    }

    const embeddedRouteIndex =
      source.embeddedAssets[
        relativePath.endsWith("/") ? `/${relativePath}index.html` : `/${relativePath}/index.html`
      ];
    if (embeddedRouteIndex) {
      return new Response(embeddedRouteIndex);
    }

    if (cleanUrlHtmlPath) {
      const embeddedCleanUrlHtml = source.embeddedAssets[`/${cleanUrlHtmlPath}`];
      if (embeddedCleanUrlHtml) {
        return new Response(embeddedCleanUrlHtml);
      }
    }

    if (!source.fallbackToRootIndex) {
      return null;
    }

    const embeddedIndex =
      source.embeddedAssets["/200.html"] ?? source.embeddedAssets["/index.html"];
    return embeddedIndex ? new Response(embeddedIndex) : null;
  }

  function staticFileResponse(path: string): Response {
    const file = Bun.file(path);
    return new Response(file, file.type ? { headers: { "content-type": file.type } } : undefined);
  }

  function webStaticResponse(pathname: string): Response | null {
    return staticAssetResponse(pathname, {
      staticDir: webStaticDir,
      embeddedAssets: embeddedWebAssets,
      fallbackToRootIndex: true,
    });
  }

  function docsStaticResponse(pathname: string): Response | null {
    if (!isDocsPath(pathname)) {
      return null;
    }

    const docsPathname =
      pathname === "/docs" || pathname === "/docs/" ? "/" : pathname.slice("/docs".length);

    return staticAssetResponse(docsPathname, {
      staticDir: docsStaticDir,
      embeddedAssets: embeddedDocsAssets,
      fallbackToRootIndex: false,
    });
  }

  function publicRuntimeConfig(): PublicRuntimeConfig {
    return {
      auth: input.authRuntime?.getPublicConfig() ?? disabledAuthPublicConfig,
      ...(input.config.publicDocsBasePath
        ? { docs: { basePath: input.config.publicDocsBasePath } }
        : {}),
    };
  }

  function publicRuntimeConfigScript(): string {
    return `window.__APPALOFT_PUBLIC_CONFIG__=${escapeScriptJson(publicRuntimeConfig())};\n`;
  }

  function staticArtifactResponse(pathname: string): Response | null {
    return staticArtifactImmutableResponse(pathname) ?? staticArtifactAliasResponse(pathname);
  }

  function staticArtifactImmutableResponse(pathname: string): Response | null {
    const prefix = "/static-artifacts/artifacts/";
    if (!pathname.startsWith(prefix)) {
      return null;
    }

    const segments = pathname
      .slice(prefix.length)
      .split("/")
      .filter((segment) => segment.length > 0);
    if (segments.length < 2) {
      return null;
    }

    const [encodedArtifactId, encodedManifestDigest, ...assetSegments] = segments;
    if (!encodedArtifactId || !encodedManifestDigest) {
      return null;
    }

    let artifactId: string;
    let manifestDigest: string;
    let assetPathname: string;
    try {
      artifactId = decodeURIComponent(encodedArtifactId);
      manifestDigest = decodeURIComponent(encodedManifestDigest);
      assetPathname =
        assetSegments.length === 0
          ? "/"
          : `/${assetSegments.map((segment) => decodeURIComponent(segment)).join("/")}`;
    } catch {
      return null;
    }

    if (!isSafeStaticArtifactSegment(artifactId) || !isSafeStaticArtifactSegment(manifestDigest)) {
      return null;
    }

    const dataRoot = resolve(input.config.dataDir, "static-artifacts");
    const filesRoot = resolve(dataRoot, artifactId, manifestDigest, "files");
    const filesRootRelativePath = relative(dataRoot, filesRoot);
    if (
      filesRoot === dataRoot ||
      filesRootRelativePath === "" ||
      filesRootRelativePath.startsWith("..")
    ) {
      return null;
    }

    return staticAssetResponse(assetPathname, {
      staticDir: filesRoot,
      embeddedAssets: {},
      fallbackToRootIndex: true,
    });
  }

  function staticArtifactAliasResponse(pathname: string): Response | null {
    const prefix = "/static-artifacts/projects/";
    if (!pathname.startsWith(prefix)) {
      return null;
    }

    const segments = pathname
      .slice(prefix.length)
      .split("/")
      .filter((segment) => segment.length > 0);
    if (segments.length < 4 || segments[1] !== "resources" || segments[3] !== "current") {
      return null;
    }

    const [encodedProjectId, , encodedResourceId, , ...assetSegments] = segments;
    if (!encodedProjectId || !encodedResourceId) {
      return null;
    }

    let projectId: string;
    let resourceId: string;
    let assetPathname: string;
    try {
      projectId = decodeURIComponent(encodedProjectId);
      resourceId = decodeURIComponent(encodedResourceId);
      assetPathname =
        assetSegments.length === 0
          ? "/"
          : `/${assetSegments.map((segment) => decodeURIComponent(segment)).join("/")}`;
    } catch {
      return null;
    }

    if (!isSafeStaticArtifactSegment(projectId) || !isSafeStaticArtifactSegment(resourceId)) {
      return null;
    }

    const dataRoot = resolve(input.config.dataDir, "static-artifacts");
    const aliasPath = resolve(
      dataRoot,
      "aliases",
      "projects",
      encodedProjectId,
      "resources",
      encodedResourceId,
      "current.json",
    );
    const aliasPathRelativePath = relative(dataRoot, aliasPath);
    if (
      aliasPath === dataRoot ||
      aliasPathRelativePath === "" ||
      aliasPathRelativePath.startsWith("..")
    ) {
      return null;
    }

    const alias = readStaticArtifactAlias(aliasPath, projectId, resourceId);
    if (!alias) {
      return null;
    }

    const filesRoot = resolve(dataRoot, alias.artifactId, alias.manifestDigest, "files");
    const filesRootRelativePath = relative(dataRoot, filesRoot);
    if (
      filesRoot === dataRoot ||
      filesRootRelativePath === "" ||
      filesRootRelativePath.startsWith("..")
    ) {
      return null;
    }

    return staticAssetResponse(assetPathname, {
      staticDir: filesRoot,
      embeddedAssets: {},
      fallbackToRootIndex: true,
    });
  }

  async function firstAdminBootstrapRedirectResponse(request: Request): Promise<Response | null> {
    if (!shouldGateFirstAdminBootstrapNavigation(request)) {
      return null;
    }

    if (firstAdminBootstrapCompleted) {
      return null;
    }

    const context = createHttpExecutionContext(request);
    const query = GetAuthBootstrapStatusQuery.create({});

    if (query.isErr()) {
      input.logger.warn("first_admin_bootstrap_navigation_gate_query_invalid", {
        requestId: context.requestId,
        errorCode: query.error.code,
        message: query.error.message,
      });
      return null;
    }

    const result = await input.queryBus.execute(context, query.value);

    return result.match(
      (status) => {
        if (!status.bootstrapRequired) {
          firstAdminBootstrapCompleted = true;
          return null;
        }

        return new Response(null, {
          status: 302,
          headers: {
            location: firstAdminBootstrapPath,
            "cache-control": "no-store",
            vary: "Accept, Sec-Fetch-Mode",
          },
        });
      },
      (error) => {
        input.logger.warn("first_admin_bootstrap_navigation_gate_failed", {
          requestId: context.requestId,
          errorCode: error.code,
          message: error.message,
        });
        return null;
      },
    );
  }

  async function productSessionRedirectResponse(request: Request): Promise<Response | null> {
    if (!input.authRuntime || !shouldGateProductSessionNavigation(request)) {
      return null;
    }

    try {
      const status = await input.authRuntime.getSessionStatus(request);

      if (!status.enabled || !status.loginRequired || status.session) {
        return null;
      }
    } catch (error) {
      input.logger.warn("product_session_navigation_gate_failed", {
        requestId: request.headers.get("x-request-id") ?? undefined,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return new Response(null, {
      status: 302,
      headers: {
        location: loginRedirectLocation(request),
        "cache-control": "no-store",
        vary: "Accept, Cookie, Sec-Fetch-Mode",
      },
    });
  }

  async function webConsoleResponse(request: Request, fallback: Response): Promise<Response> {
    const redirect = await firstAdminBootstrapRedirectResponse(request);
    if (redirect) {
      return redirect;
    }

    const authRedirect = await productSessionRedirectResponse(request);
    if (authRedirect) {
      return authRedirect;
    }

    return webStaticResponse(new URL(request.url).pathname) ?? fallback;
  }

  function deploymentProgressStream(request: Request, requestId: string): Response {
    if (!input.deploymentProgressObserver) {
      return new Response("Deployment progress streaming is not available", {
        status: 503,
      });
    }

    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | undefined;
    let heartbeat: Timer | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            encodeServerSentEvent({
              event: "ready",
              data: { requestId },
            }),
          ),
        );

        unsubscribe = input.deploymentProgressObserver?.subscribe((context, event) => {
          if (context.requestId !== requestId) {
            return;
          }

          controller.enqueue(
            encoder.encode(
              encodeServerSentEvent({
                event: "progress",
                data: event,
              }),
            ),
          );
        });

        heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }, 15_000);

        request.signal.addEventListener(
          "abort",
          () => {
            unsubscribe?.();
            if (heartbeat) {
              clearInterval(heartbeat);
            }
            controller.close();
          },
          { once: true },
        );
      },
      cancel() {
        unsubscribe?.();
        if (heartbeat) {
          clearInterval(heartbeat);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  }

  async function serveHttpChallenge(request: Request, token: string): Promise<Response> {
    const notFound = () =>
      new Response("Not found", {
        status: 404,
        headers: {
          "cache-control": "no-store",
          "content-type": "text/plain; charset=utf-8",
        },
      });
    const normalizedToken = token.trim();
    const domainName = resolveRequestHostname(request);

    if (!input.certificateHttpChallengeTokenStore || !normalizedToken || !domainName) {
      return notFound();
    }

    const context = createHttpExecutionContext(request);
    const result = await input.certificateHttpChallengeTokenStore.find(context, {
      token: normalizedToken,
      domainName,
    });

    return result.match(
      (challenge) => {
        if (!challenge) {
          return notFound();
        }

        return new Response(challenge.keyAuthorization, {
          status: 200,
          headers: {
            "cache-control": "no-store",
            "content-type": "text/plain; charset=utf-8",
          },
        });
      },
      (error) => {
        input.logger.warn("http_challenge_token_lookup_failed", {
          requestId: context.requestId,
          domainName,
          errorCode: error.code,
          message: error.message,
        });
        return notFound();
      },
    );
  }

  function attachTerminalSession(socket: TerminalWebSocket, socketKey: object): void {
    const sessionId = socket.data?.params?.sessionId;

    if (!input.terminalSessionGateway || !sessionId) {
      socket.close(1011, "Terminal session gateway is unavailable");
      return;
    }

    const result = input.terminalSessionGateway.attach(sessionId);
    result.match(
      (session) => {
        terminalSessionsBySocket.set(socketKey, session);
        terminalSessionsBySessionId.set(sessionId, session);
        void streamTerminalSession(socket, sessionId, session);
      },
      (error) => {
        socket.send(
          JSON.stringify({
            kind: "error",
            error,
          }),
        );
        socket.close(1011, error.message);
      },
    );
  }

  function terminalSessionForSocket(
    socket: TerminalWebSocket,
    socketKey: object,
  ): TerminalSession | null {
    const socketSession = terminalSessionsBySocket.get(socketKey);
    if (socketSession) {
      return socketSession;
    }

    const sessionId = socket.data?.params?.sessionId;
    if (!sessionId) {
      return null;
    }

    const session = terminalSessionsBySessionId.get(sessionId);
    if (!session) {
      return null;
    }

    terminalSessionsBySocket.set(socketKey, session);
    return session;
  }

  async function streamTerminalSession(
    socket: TerminalWebSocket,
    sessionId: string,
    session: TerminalSession,
  ): Promise<void> {
    try {
      for await (const frame of session) {
        socket.send(JSON.stringify(frame));

        if (frame.kind === "closed" || frame.kind === "error") {
          socket.close(1000, frame.kind === "closed" ? frame.reason : frame.error.message);
          break;
        }
      }
    } catch (error) {
      socket.send(
        JSON.stringify({
          kind: "error",
          error: {
            code: "terminal_session_stream_failed",
            category: "infra",
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          },
        }),
      );
      socket.close(1011, "Terminal session stream failed");
    } finally {
      terminalSessionsBySessionId.delete(sessionId);
    }
  }

  const mcpServer = createAppaloftMcpServer({
    commandBus: input.commandBus,
    queryBus: input.queryBus,
    executionContextFactory: input.executionContextFactory,
  });

  const baseApp = new Elysia()
    .wrap((handle, request) => {
      requestStartTimes.set(request, performance.now());
      const requestId = request.headers.get("x-request-id");

      return wrapHttpRequestHandlerWithSpan(
        {
          request,
          ...(requestId ? { requestId } : {}),
        },
        handle as (...args: unknown[]) => unknown,
      );
    })
    .onError(({ error, request, set, route }) => {
      const requestId = request.headers.get("x-request-id");
      updateActiveHttpServerSpan({
        error,
        request,
        route,
        statusCode: 500,
        ...(requestId ? { requestId } : {}),
      });
      setTraceHeaders(set.headers as MutableHeaders, input.config);
      input.logger.error("http_adapter_unhandled_error", {
        message: readErrorMessage(error),
      });
      set.status = 500;
      return {
        error: {
          code: "unhandled_error",
          category: "infra",
          message: readErrorMessage(error),
          retryable: false,
        },
      };
    })
    .onBeforeHandle(async ({ request, set }) => {
      const pathname = new URL(request.url).pathname;

      if (isCorsPath({ pathname, pluginRoutes, orpcRoutePaths })) {
        applyCorsHeaders(request, set.headers as MutableHeaders, allowedOrigins);

        if (request.method === "OPTIONS") {
          set.status = 204;
          return "";
        }
      }

      for (const middleware of pluginMiddlewares) {
        const result = await middleware.handle({
          request,
          path: pathname,
          method: request.method,
        });

        if (result?.headers) {
          for (const [key, value] of Object.entries(result.headers)) {
            set.headers[key] = value;
          }
        }

        if (result?.response) {
          return result.response;
        }
      }
    })
    .onAfterHandle(({ request, set, route }) => {
      const requestId = request.headers.get("x-request-id");
      updateActiveHttpServerSpan({
        request,
        route,
        statusCode: resolveStatusCode(set.status) ?? 200,
        ...(requestId ? { requestId } : {}),
      });
      setTraceHeaders(set.headers as MutableHeaders, input.config);

      const pathname = new URL(request.url).pathname;

      if (!isCorsPath({ pathname, pluginRoutes, orpcRoutePaths })) {
        return;
      }

      applyCorsHeaders(request, set.headers as MutableHeaders, allowedOrigins);
    })
    .onAfterResponse(({ request, set, route }) => {
      const requestId = request.headers.get("x-request-id");
      const statusCode = resolveStatusCode(set.status) ?? 200;
      finishActiveHttpServerSpan({
        request,
        route,
        statusCode,
        ...(requestId ? { requestId } : {}),
      });

      const startedAt = requestStartTimes.get(request);
      requestStartTimes.delete(request);
      logHttpRequest({
        logger: input.logger,
        request,
        route,
        statusCode,
        ...(requestId ? { requestId } : {}),
        ...(startedAt !== undefined
          ? { durationMs: Math.round(performance.now() - startedAt) }
          : {}),
      });
    })
    .get("/api/health", () => ({
      status: "ok" as const,
      service: input.config.appName,
      version: input.config.appVersion,
      timestamp: new Date().toISOString(),
    }))
    .get("/api/readiness", async ({ request }) => {
      const context = createHttpExecutionContext(request);
      const doctor = unwrapResult(context, DoctorQuery.create());
      const result = await input.queryBus.execute(context, doctor);
      return publicReadiness(unwrapResult(context, result).readiness);
    })
    .get("/api/version", () => ({
      name: input.config.appName,
      version: input.config.appVersion,
      apiVersion,
      mode: input.config.runtimeMode,
      features: {
        actionDeployTokenAuth: Boolean(input.actionDeployTokenAuthorizationPort),
        actionServerConfigDeploy: Boolean(input.actionSourcePackageConfigReader),
        sourcePackages: true,
        serverSideConfigBootstrap: Boolean(input.actionSourcePackageConfigReader),
      },
    }))
    .get("/mcp", async ({ request }) =>
      handleAppaloftMcpHttpRequest({
        server: mcpServer,
        request,
      }),
    )
    .post(
      "/mcp",
      async ({ request, set }) => {
        const context = createMcpExecutionContext(request);
        const executionContext = await authorizedMcpContext(request, context);
        if (executionContext.isErr()) {
          set.status = 401;
          return {
            error: {
              code: executionContext.error.code,
              category: executionContext.error.category,
              message: executionContext.error.message,
              retryable: executionContext.error.retryable,
            },
          };
        }

        return handleAppaloftMcpHttpRequest({
          server: mcpServer,
          request,
          context: executionContext.value,
        });
      },
      {
        parse: "none",
      },
    )
    .get("/api/instance-upgrade/check", async ({ request }) => {
      const context = createHttpExecutionContext(request);
      const url = new URL(request.url);
      const query = unwrapResult(
        context,
        CheckInstanceUpgradeQuery.create({
          ...(url.searchParams.get("version")
            ? { targetVersion: url.searchParams.get("version") as string }
            : {}),
        }),
      );
      const result = await input.queryBus.execute(context, query);
      return unwrapResult(context, result);
    })
    .post("/api/instance-upgrade/apply", async ({ request }) => {
      const context = createHttpExecutionContext(request);
      await authorizeAdminRequest(request, context);

      const body: unknown = await request.json().catch(() => ({}));
      const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      const command = unwrapResult(
        context,
        ApplyInstanceUpgradeCommand.create({
          confirm: record.confirm === true,
          ...(optionalString(record.targetVersion)
            ? { targetVersion: optionalString(record.targetVersion) }
            : {}),
        }),
      );
      const result = await input.commandBus.execute(context, command);
      return unwrapResult(context, result);
    })
    .get("/.well-known/acme-challenge/:token", ({ request, params }) =>
      serveHttpChallenge(request, params.token),
    )
    .get("/api/schemas/appaloft-config.json", () => appaloftDeploymentConfigJsonSchema)
    .get("/api/integrations/github/app/callback", async ({ request, set }) => {
      const context = createHttpExecutionContext(request);
      const executionContext = await authorizedMemberContext(request, context);
      const url = new URL(request.url);
      const installationId = url.searchParams.get("installation_id")?.trim();
      const setupAction = url.searchParams.get("setup_action")?.trim();
      const state = url.searchParams.get("state");
      if (!installationId) {
        set.status = 400;
        return {
          error: {
            code: "github_app_installation_missing",
            category: "user" as const,
            message: "GitHub App callback is missing installation_id",
            retryable: false,
          },
        };
      }

      const command = unwrapResult(
        executionContext,
        UpsertGitHubAppInstallationCommand.create({
          installationId,
          ...(setupAction === "install" || setupAction === "update" ? { setupAction } : {}),
        }),
      );
      const result = await input.commandBus.execute(executionContext, command);
      unwrapResult(executionContext, result);

      const redirectUrl = resolveWebRedirectUrl({
        fallbackPath: githubAppQuickDeployReturnPath,
        state,
        webOrigin: input.config.webOrigin,
      });
      return Response.redirect(redirectUrl, 303);
    })
    .get("/.appaloft/resource-access-failure", ({ request }) =>
      resourceAccessFailureDiagnosticResponse(request, {
        enrichEvidence: async (diagnostic, appliedRouteContext) => {
          if (!input.resourceAccessRouteContextLookup) {
            return diagnostic;
          }

          const requestSecurity = requestSecurityContextFromHeaders(request.headers);
          const context = input.executionContextFactory.create({
            entrypoint: "http",
            locale: resolveAppaloftLocaleFromHeaders(request.headers),
            ...(requestSecurity ? { requestSecurity } : {}),
            requestId: diagnostic.requestId,
          });

          return enrichResourceAccessFailureDiagnosticWithRouteContext(
            context,
            diagnostic,
            input.resourceAccessRouteContextLookup,
            appliedRouteContext,
          );
        },
        recordEvidence: async (diagnostic, capturedAt, expiresAt) => {
          if (!input.resourceAccessFailureEvidenceRecorder) {
            return;
          }

          const requestSecurity = requestSecurityContextFromHeaders(request.headers);
          const context = input.executionContextFactory.create({
            entrypoint: "http",
            locale: resolveAppaloftLocaleFromHeaders(request.headers),
            ...(requestSecurity ? { requestSecurity } : {}),
            requestId: diagnostic.requestId,
          });
          const result = await input.resourceAccessFailureEvidenceRecorder.record(
            toRepositoryContext(context),
            {
              diagnostic,
              capturedAt,
              expiresAt,
            },
          );

          if (result.isErr()) {
            input.logger.warn("resource_access_failure_evidence_record_failed", {
              requestId: diagnostic.requestId,
              code: result.error.code,
              category: result.error.category,
            });
          }
        },
      }),
    )
    .options("/api", ({ request, set }) => {
      applyCorsHeaders(request, set.headers as MutableHeaders, allowedOrigins);
      set.status = 204;
      return "";
    })
    .options("/api/*", ({ request, set }) => {
      applyCorsHeaders(request, set.headers as MutableHeaders, allowedOrigins);
      set.status = 204;
      return "";
    })
    .get("/api/deployment-progress/:requestId", ({ request, params }) =>
      deploymentProgressStream(request, params.requestId),
    )
    .get("/api/auth/public-config", ({ set }) => {
      set.headers["cache-control"] = "no-store";
      return publicRuntimeConfig().auth;
    })
    .get("/api/auth/public-config.js", ({ set }) => {
      set.headers["cache-control"] = "no-store";
      set.headers["content-type"] = "application/javascript; charset=utf-8";
      return publicRuntimeConfigScript();
    })
    .get("/api/auth/session", async ({ request }) => {
      if (!input.authRuntime) {
        return {
          accountSecurity: {
            enabled: false,
            passwordState: "unknown",
          },
          accountRecovery: {
            enabled: false,
          },
          enabled: false,
          emailVerification: {
            enabled: false,
            otpEnabled: false,
            required: false,
          },
          provider: "none" as const,
          loginRequired: false,
          deferredAuth: false,
          session: null,
          providers: [],
        };
      }

      return input.authRuntime.getSessionStatus(request);
    })
    .get("/api/system-plugins/web-extensions", async () => ({
      items: input.pluginRuntime?.listWebExtensions() ?? [],
    }))
    .ws("/api/terminal-sessions/:sessionId/attach", {
      open(ws) {
        attachTerminalSession(ws as unknown as TerminalWebSocket, ws as object);
      },
      async message(ws, message) {
        const session = terminalSessionForSocket(ws as unknown as TerminalWebSocket, ws as object);
        const parsed = decodeTerminalClientMessage(message);

        if (!session || !parsed) {
          return;
        }

        switch (parsed.kind) {
          case "input":
            await session.write(parsed.data);
            break;
          case "resize":
            await session.resize({
              rows: parsed.rows,
              cols: parsed.cols,
            });
            break;
          case "close":
            await session.close();
            break;
        }
      },
      close(ws) {
        const socket = ws as unknown as TerminalWebSocket;
        const session = terminalSessionForSocket(socket, ws as object);
        const sessionId = socket.data?.params?.sessionId;
        terminalSessionsBySocket.delete(ws as object);
        if (sessionId) {
          terminalSessionsBySessionId.delete(sessionId);
        }
        void session?.close();
      },
    });

  let app = baseApp as unknown as Elysia;

  for (const route of pluginRoutes) {
    app = registerPluginRoute(app, route, allowedOrigins);
  }

  for (const routePath of orpcRoutePaths) {
    if (!isApiPath(routePath)) {
      app = registerCorsPreflightRoute(app, routePath, allowedOrigins);
    }
  }

  if (input.authRuntime) {
    const authRuntime = input.authRuntime;
    const authRouteHandler = ({ request }: { request: Request }) => authRuntime.handle(request);

    for (const route of ["/api/auth", "/api/auth/*"] as const) {
      app = app.get(route, authRouteHandler, {
        parse: "none",
      }) as unknown as Elysia;
      app = app.post(route, authRouteHandler, {
        parse: "none",
      }) as unknown as Elysia;
      app = app.put(route, authRouteHandler, {
        parse: "none",
      }) as unknown as Elysia;
      app = app.patch(route, authRouteHandler, {
        parse: "none",
      }) as unknown as Elysia;
      app = app.delete(route, authRouteHandler, {
        parse: "none",
      }) as unknown as Elysia;
    }
  }

  app = mountAppaloftOrpcRoutes(app, {
    commandBus: input.commandBus,
    ...(input.deploymentProgressObserver
      ? {
          deploymentProgressObserver: input.deploymentProgressObserver,
        }
      : {}),
    executionContextFactory: input.executionContextFactory,
    queryBus: input.queryBus,
    logger: input.logger,
    ...(input.orpcRouterContributions
      ? {
          orpcRouterContributions: input.orpcRouterContributions,
        }
      : {}),
    ...(input.sourceEventVerificationPort
      ? {
          sourceEventVerificationPort: input.sourceEventVerificationPort,
        }
      : {}),
    ...(input.githubSourceEventWebhookVerifier
      ? {
          githubSourceEventWebhookVerifier: input.githubSourceEventWebhookVerifier,
        }
      : {}),
    ...(input.githubPreviewPullRequestWebhookVerifier
      ? {
          githubPreviewPullRequestWebhookVerifier: input.githubPreviewPullRequestWebhookVerifier,
        }
      : {}),
    ...(input.actionDeployTokenAuthorizationPort
      ? {
          actionDeployTokenAuthorizationPort: input.actionDeployTokenAuthorizationPort,
        }
      : {}),
    ...(input.actionSourcePackageConfigReader
      ? {
          actionSourcePackageConfigReader: input.actionSourcePackageConfigReader,
        }
      : {}),
    ...(input.authRuntime
      ? {
          productSessionAuthorizationPort: input.authRuntime,
        }
      : {}),
    ...(input.config.githubAppWebhookSecret || input.config.githubWebhookSecret
      ? {
          githubWebhookSecret:
            input.config.githubAppWebhookSecret ?? input.config.githubWebhookSecret,
        }
      : {}),
    ...(input.requestContextRunner
      ? {
          requestContextRunner: input.requestContextRunner,
        }
      : {}),
  });

  return app
    .get("/", ({ request }) =>
      webConsoleResponse(request, new Response("Appaloft backend is running")),
    )
    .get(
      "/docs",
      ({ request }) =>
        docsStaticResponse(new URL(request.url).pathname) ??
        new Response("Not found", { status: 404 }),
    )
    .get(
      "/docs/*",
      ({ request }) =>
        docsStaticResponse(new URL(request.url).pathname) ??
        new Response("Not found", { status: 404 }),
    )
    .get(
      "/_app/*",
      ({ request }) =>
        webStaticResponse(new URL(request.url).pathname) ??
        new Response("Not found", { status: 404 }),
    )
    .get(
      "/static-artifacts/artifacts/*",
      ({ request }) =>
        staticArtifactResponse(new URL(request.url).pathname) ??
        new Response("Not found", { status: 404 }),
    )
    .get(
      "/static-artifacts/projects/*",
      ({ request }) =>
        staticArtifactResponse(new URL(request.url).pathname) ??
        new Response("Not found", { status: 404 }),
    )
    .get("/*", ({ request }) =>
      webConsoleResponse(request, new Response("Not found", { status: 404 })),
    );
}
