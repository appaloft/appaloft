import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type AppLogger,
  type CertificateHttpChallengeTokenStore,
  type CommandBus,
  type DeploymentProgressObserver,
  DoctorQuery,
  type ExecutionContext,
  type ExecutionContextFactory,
  type QueryBus,
  type TerminalSession,
  type TerminalSessionGateway,
} from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";
import { apiVersion } from "@appaloft/contracts";
import { type Result } from "@appaloft/core";
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
import { mountAppaloftOrpcRoutes } from "@appaloft/orpc";
import {
  type SystemPluginHttpMiddleware,
  type SystemPluginHttpRoute,
  type SystemPluginHttpRouteResult,
  type SystemPluginWebExtension,
} from "@appaloft/plugin-sdk";
import { Elysia } from "elysia";

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

interface AuthRuntime {
  getSessionStatus(request: Request): Promise<{
    enabled: boolean;
    provider: "none" | "better-auth";
    loginRequired: boolean;
    deferredAuth: boolean;
    session: unknown | null;
    providers: Array<{
      key: "github";
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

function normalizePluginRouteResult(
  result: SystemPluginHttpRouteResult,
): Response | Record<string, unknown> | string | null {
  return result;
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "").toLowerCase();
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

function createAllowedOrigins(webOrigin: string): Set<string> {
  const origins = new Set<string>();
  const normalizedWebOrigin = normalizeOrigin(webOrigin);
  origins.add(normalizedWebOrigin);

  try {
    const parsed = new URL(webOrigin);

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

  return origins;
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isBackendLogPath(pathname: string): boolean {
  return isApiPath(pathname) || pathname.startsWith("/.well-known/acme-challenge/");
}

function readRequestPathname(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "/";
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

function registerPluginRoute(app: Elysia, route: SystemPluginHttpRoute): Elysia {
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

  switch (route.method) {
    case "GET":
      return app.get(route.path, handler);
    case "POST":
      return app.post(route.path, handler);
    case "PUT":
      return app.put(route.path, handler);
    case "PATCH":
      return app.patch(route.path, handler);
    case "DELETE":
      return app.delete(route.path, handler);
  }
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
  embeddedStaticAssets?: EmbeddedStaticAssets;
  certificateHttpChallengeTokenStore?: CertificateHttpChallengeTokenStore;
}) {
  const pluginMiddlewares = input.pluginRuntime?.listHttpMiddlewares() ?? [];
  const pluginRoutes = input.pluginRuntime?.listHttpRoutes() ?? [];
  const staticDir = input.config.webStaticDir ? resolve(input.config.webStaticDir) : null;
  const embeddedStaticAssets = input.embeddedStaticAssets ?? {};
  const allowedOrigins = createAllowedOrigins(input.config.webOrigin);
  const terminalSessionsBySocket = new WeakMap<object, TerminalSession>();
  const terminalSessionsBySessionId = new Map<string, TerminalSession>();
  const requestStartTimes = new WeakMap<Request, number>();

  function staticResponse(pathname: string): Response | null {
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const embeddedPath = `/${relativePath}`;

    if (staticDir) {
      const candidate = resolve(staticDir, relativePath);

      if (!candidate.startsWith(staticDir)) {
        return null;
      }

      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return new Response(Bun.file(candidate));
      }

      const indexFile = join(staticDir, "index.html");
      return existsSync(indexFile) ? new Response(Bun.file(indexFile)) : null;
    }

    const embeddedAsset = embeddedStaticAssets[embeddedPath];
    if (embeddedAsset) {
      return new Response(embeddedAsset);
    }

    const embeddedIndex = embeddedStaticAssets["/index.html"];
    return embeddedIndex ? new Response(embeddedIndex) : null;
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

    const requestId = request.headers.get("x-request-id");
    const context = input.executionContextFactory.create({
      entrypoint: "http",
      locale: resolveAppaloftLocaleFromHeaders(request.headers),
      ...(requestId ? { requestId } : {}),
    });
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

      if (isApiPath(pathname)) {
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

      if (!isApiPath(pathname)) {
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
      const requestId = request.headers.get("x-request-id");
      const context = input.executionContextFactory.create({
        entrypoint: "http",
        locale: resolveAppaloftLocaleFromHeaders(request.headers),
        ...(requestId ? { requestId } : {}),
      });
      const doctor = unwrapResult(context, DoctorQuery.create());
      const result = await input.queryBus.execute(context, doctor);
      return unwrapResult(context, result).readiness;
    })
    .get("/api/version", () => ({
      name: input.config.appName,
      version: input.config.appVersion,
      apiVersion,
      mode: input.config.runtimeMode,
    }))
    .get("/.well-known/acme-challenge/:token", ({ request, params }) =>
      serveHttpChallenge(request, params.token),
    )
    .get("/api/schemas/appaloft-config.json", () => appaloftDeploymentConfigJsonSchema)
    .get("/api/deployment-progress/:requestId", ({ request, params }) =>
      deploymentProgressStream(request, params.requestId),
    )
    .get("/api/auth/session", async ({ request }) => {
      if (!input.authRuntime) {
        return {
          enabled: false,
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
    app = registerPluginRoute(app, route);
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
    ...(input.requestContextRunner
      ? {
          requestContextRunner: input.requestContextRunner,
        }
      : {}),
  });

  return app
    .get("/", () => staticResponse("/") ?? new Response("Appaloft backend is running"))
    .get(
      "/_app/*",
      ({ request }) =>
        staticResponse(new URL(request.url).pathname) ?? new Response("Not found", { status: 404 }),
    )
    .get(
      "/*",
      ({ request }) =>
        staticResponse(new URL(request.url).pathname) ?? new Response("Not found", { status: 404 }),
    );
}
