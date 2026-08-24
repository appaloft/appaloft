import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { createDashboardDevProxy, resolveDashboardDevServer } from "../src/lib/dev-server";

const dashboardRoot = new URL("..", import.meta.url);

async function sourceFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);

      if (entry.isDirectory()) {
        return sourceFiles(child);
      }

      return [child];
    }),
  );

  return files.flat();
}

describe("Dashboard foundation", () => {
  test("[DASH-FOUND-001] is an independently buildable static SvelteKit workspace", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("package.json", dashboardRoot), "utf8"),
    ) as {
      name?: string;
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const svelteConfig = await readFile(new URL("svelte.config.js", dashboardRoot), "utf8");
    const routeLayout = await readFile(new URL("src/routes/+layout.ts", dashboardRoot), "utf8");
    const appHtml = await readFile(new URL("src/app.html", dashboardRoot), "utf8");

    expect(packageJson.name).toBe("@appaloft/dashboard");
    expect(packageJson.scripts?.build).toBeTruthy();
    expect(packageJson.devDependencies?.["@appaloft/design"]).toBe("workspace:*");
    expect(packageJson.devDependencies?.["@appaloft/ui"]).toBe("workspace:*");
    expect(packageJson.devDependencies?.["@appaloft/i18n"]).toBe("workspace:*");
    expect(svelteConfig).toContain("@sveltejs/adapter-static");
    expect(svelteConfig).toContain('fallback: "200.html"');
    expect(routeLayout).toContain("export const ssr = false");
    expect(appHtml).toContain('name="application-name" content="Appaloft"');
  });

  test("[DASH-FOUND-001] never imports legacy apps/web source", async () => {
    const files = await sourceFiles(new URL("src/", dashboardRoot));
    const source = (
      await Promise.all(
        files
          .filter((file) => /\.(svelte|ts|css|html)$/.test(file.pathname))
          .map((file) => readFile(file, "utf8")),
      )
    ).join("\n");

    expect(source).not.toMatch(/apps\/web|@appaloft\/web/);
    expect(source).toContain("@appaloft/design");
    expect(source).toContain("@appaloft/ui");
  });

  test("[DASH-EXT-004] composes the Cloud API and private extension routes in local dev", () => {
    const server = resolveDashboardDevServer({
      APPALOFT_WEB_DEV_HOST: "127.0.0.1",
      APPALOFT_WEB_DEV_PORT: "4317",
      APPALOFT_WEB_DEV_PROXY_TARGET: "http://127.0.0.1:4316",
      APPALOFT_WEB_DEV_EXTENSION_PROXY_PREFIXES: "/cloud,/audit-log/console-page,/cloud",
    });

    expect(server).toEqual({
      host: "127.0.0.1",
      port: 4317,
      proxyTarget: "http://127.0.0.1:4316",
      extensionProxyPrefixes: ["/cloud", "/audit-log/console-page"],
    });
    expect(createDashboardDevProxy(server)).toEqual({
      "/api": { target: "http://127.0.0.1:4316", changeOrigin: true },
      "/cloud": { target: "http://127.0.0.1:4316", changeOrigin: true },
      "/audit-log/console-page": {
        target: "http://127.0.0.1:4316",
        changeOrigin: true,
      },
    });
  });
});
