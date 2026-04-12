import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type AppLogger,
  type CommandBus,
  DoctorQuery,
  type ExecutionContext,
  type ExecutionContextFactory,
  type QueryBus,
} from "@yundu/application";
import { type AppConfig } from "@yundu/config";
import { apiVersion } from "@yundu/contracts";
import { type Result } from "@yundu/core";
import { yunduDeploymentConfigJsonSchema } from "@yundu/deployment-config";
import { mountYunduOrpcRoutes } from "@yundu/orpc";
import {
  type SystemPluginHttpMiddleware,
  type SystemPluginHttpRoute,
  type SystemPluginHttpRouteResult,
  type SystemPluginWebExtension,
} from "@yundu/plugin-sdk";
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

  return "Unhandled adapter error";
}

function unwrapResult<T>(result: Result<T>): T {
  return result.match(
    (value) => value,
    (error) => {
      throw new Error(error.message);
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
  pluginRuntime?: SystemPluginRuntime;
  authRuntime?: AuthRuntime;
  requestContextRunner?: RequestContextRunner;
  embeddedStaticAssets?: EmbeddedStaticAssets;
}) {
  const pluginMiddlewares = input.pluginRuntime?.listHttpMiddlewares() ?? [];
  const pluginRoutes = input.pluginRuntime?.listHttpRoutes() ?? [];
  const staticDir = input.config.webStaticDir ? resolve(input.config.webStaticDir) : null;
  const embeddedStaticAssets = input.embeddedStaticAssets ?? {};
  const allowedOrigins = createAllowedOrigins(input.config.webOrigin);

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

  const baseApp = new Elysia()
    .onError(({ error, set }) => {
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
    .onAfterHandle(({ request, set }) => {
      const pathname = new URL(request.url).pathname;

      if (!isApiPath(pathname)) {
        return;
      }

      applyCorsHeaders(request, set.headers as MutableHeaders, allowedOrigins);
    })
    .get("/api/health", () => ({
      status: "ok" as const,
      service: input.config.appName,
      version: input.config.appVersion,
      timestamp: new Date().toISOString(),
    }))
    .get("/api/readiness", async ({ request }) => {
      const doctor = unwrapResult(DoctorQuery.create());
      const requestId = request.headers.get("x-request-id");
      const result = await input.queryBus.execute(
        input.executionContextFactory.create({
          entrypoint: "http",
          ...(requestId ? { requestId } : {}),
        }),
        doctor,
      );
      return unwrapResult(result).readiness;
    })
    .get("/api/version", () => ({
      name: input.config.appName,
      version: input.config.appVersion,
      apiVersion,
      mode: input.config.runtimeMode,
    }))
    .get("/api/schemas/yundu-config.json", () => yunduDeploymentConfigJsonSchema)
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
    }));

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

  app = mountYunduOrpcRoutes(app, {
    commandBus: input.commandBus,
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
    .get("/", () => staticResponse("/") ?? new Response("Yundu backend is running"))
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
