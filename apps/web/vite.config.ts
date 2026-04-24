import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";

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

function createDocsRedirectPlugin(target: string): Plugin {
  const normalizedTarget = target.replace(/\/+$/g, "");
  const shouldRedirectDocsRequest = (requestUrl: string | undefined): requestUrl is string => {
    if (!requestUrl) {
      return false;
    }

    const pathname = new URL(requestUrl, "http://appaloft.local").pathname;
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
    plugins: [createDocsRedirectPlugin(docsRedirectTarget), tailwindcss(), sveltekit()],
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
