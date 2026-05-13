import { type IncomingMessage, type ServerResponse } from "node:http";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";

const firstAdminBootstrapPath = "/bootstrap/auth/first-admin";

function createApiProxyTarget(mode: string): string {
  const env = loadEnv(mode, process.cwd(), "");
  return env.APPALOFT_WEB_DEV_PROXY_TARGET || "http://127.0.0.1:3001";
}

function createDocsRedirectTarget(mode: string): string {
  const env = loadEnv(mode, process.cwd(), "");
  const docsHost = env.APPALOFT_DEV_DOCS_HOST || "127.0.0.1";
  const docsPort = env.APPALOFT_DEV_DOCS_PORT || "4322";
  return (
    env.APPALOFT_WEB_DEV_DOCS_TARGET ||
    env.APPALOFT_WEB_DEV_DOCS_PROXY_TARGET ||
    `http://${docsHost}:${docsPort}`
  );
}

function createWebDevPort(mode: string): number {
  const env = loadEnv(mode, process.cwd(), "");
  const parsed = Number(env.APPALOFT_WEB_DEV_PORT || "4173");

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 4173;
}

function readRequestPathname(requestUrl: string | undefined): string {
  if (!requestUrl) {
    return "/";
  }

  return new URL(requestUrl, "http://appaloft.local").pathname;
}

function isHtmlNavigationRequest(req: IncomingMessage): boolean {
  const secFetchMode = req.headers["sec-fetch-mode"];
  if (typeof secFetchMode === "string" && secFetchMode.toLowerCase() === "navigate") {
    return true;
  }

  const accept = req.headers.accept?.toLowerCase() ?? "";
  return accept.includes("text/html") || accept.includes("application/xhtml+xml");
}

function hasStaticAssetExtension(pathname: string): boolean {
  return (pathname.split("/").pop() ?? "").includes(".");
}

function isConsoleNavigationPath(pathname: string): boolean {
  if (
    pathname === firstAdminBootstrapPath ||
    pathname.startsWith(`${firstAdminBootstrapPath}/`) ||
    pathname === "/docs" ||
    pathname.startsWith("/docs/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_app/") ||
    pathname.startsWith("/.well-known/acme-challenge/") ||
    pathname === "/.appaloft/resource-access-failure" ||
    hasStaticAssetExtension(pathname)
  ) {
    return false;
  }

  return true;
}

function shouldGateFirstAdminBootstrapNavigation(req: IncomingMessage): boolean {
  return (
    (req.method === "GET" || req.method === "HEAD") &&
    isHtmlNavigationRequest(req) &&
    isConsoleNavigationPath(readRequestPathname(req.url))
  );
}

function redirectToFirstAdminBootstrap(res: ServerResponse): void {
  res.statusCode = 302;
  res.setHeader("location", firstAdminBootstrapPath);
  res.setHeader("cache-control", "no-store");
  res.setHeader("vary", "Accept, Sec-Fetch-Mode");
  res.end();
}

async function bootstrapRequired(proxyTarget: string, req: IncomingMessage): Promise<boolean> {
  const response = await fetch(new URL("/api/bootstrap/auth/status", proxyTarget), {
    headers: {
      accept: "application/json",
      ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
      ...(req.headers["accept-language"]
        ? { "accept-language": req.headers["accept-language"] }
        : {}),
      ...(req.headers["x-request-id"]
        ? { "x-request-id": String(req.headers["x-request-id"]) }
        : {}),
    },
  });

  if (!response.ok) {
    return false;
  }

  const body = (await response.json()) as { bootstrapRequired?: unknown };
  return body.bootstrapRequired === true;
}

function createFirstAdminBootstrapGatePlugin(proxyTarget: string): Plugin {
  const handle = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    if (!shouldGateFirstAdminBootstrapNavigation(req)) {
      next();
      return;
    }

    try {
      const required = await bootstrapRequired(proxyTarget, req);
      if (required) {
        redirectToFirstAdminBootstrap(res);
        return;
      }
    } catch {
      // Keep Vite usable when the backend is not running yet.
    }

    next();
  };

  return {
    name: "appaloft-first-admin-bootstrap-dev-gate",
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}

function createDocsRedirectPlugin(target: string): Plugin {
  const normalizedTarget = target.replace(/\/+$/g, "");
  const shouldRedirectDocsRequest = (requestUrl: string | undefined): requestUrl is string => {
    const pathname = readRequestPathname(requestUrl);
    return pathname === "/docs" || pathname.startsWith("/docs/");
  };

  return {
    name: "appaloft-docs-dev-redirect",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!shouldRedirectDocsRequest(req.url)) {
          next();
          return;
        }

        res.statusCode = 302;
        res.setHeader("location", `${normalizedTarget}${req.url}`);
        res.end();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!shouldRedirectDocsRequest(req.url)) {
          next();
          return;
        }

        res.statusCode = 302;
        res.setHeader("location", `${normalizedTarget}${req.url}`);
        res.end();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const proxyTarget = createApiProxyTarget(mode);
  const docsRedirectTarget = createDocsRedirectTarget(mode);
  const webDevPort = createWebDevPort(mode);

  return {
    plugins: [
      createDocsRedirectPlugin(docsRedirectTarget),
      createFirstAdminBootstrapGatePlugin(proxyTarget),
      tailwindcss(),
      sveltekit(),
    ],
    server: {
      port: webDevPort,
      strictPort: true,
      watch: {
        ignored: ["**/build/**", "**/.svelte-kit/output/**"],
      },
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: {
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    test: {
      expect: { requireAssertions: true },
      projects: [
        {
          extends: "./vite.config.ts",
          test: {
            name: "server",
            environment: "node",
            include: ["src/**/*.{test,spec}.{js,ts}"],
            exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"],
          },
        },
      ],
    },
  };
});
