/// <reference types="bun-types" />
import "../../../../packages/application/node_modules/reflect-metadata/Reflect.js";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  CreateProjectCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListProjectSummariesQuery,
  type ProductSessionAuthorizationPort,
  ProjectEnvironmentOverviewQuery,
  type Query,
  type QueryBus,
  ResourceOverviewQuery,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { mountAppaloftOrpcRoutes } from "@appaloft/orpc";
import { Elysia } from "elysia";

const previewPort = 43_000 + (process.pid % 10_000);
const previewUrl = `http://127.0.0.1:${previewPort}`;
const evidenceDirectory = "/private/tmp/appaloft-dashboard-evidence";

let previewProcess: ReturnType<typeof Bun.spawn> | undefined;
let apiFixtureServer: ReturnType<typeof Bun.serve> | undefined;
const apiFixtureRequests: string[] = [];
const apiFixtureCommands: string[] = [];
let extensionFixtureEnabled = false;

async function installDashboardApiFixtures(): Promise<void> {
  const buildRoot = new URL("../../build/", import.meta.url).pathname;
  const fixtures = new Map<string, unknown>([
    [
      "api/projects/summaries",
      {
        items: [
          {
            id: "atlas-api",
            name: "Atlas API",
            slug: "atlas-api",
            description: "Public API and background workers",
            resourceCount: 2,
            attentionCount: 0,
            attentionStatus: "healthy",
            defaultEnvironment: {
              id: "production",
              name: "Production",
              kind: "production",
            },
            latestActivityAt: "2026-08-24T08:00:00.000Z",
          },
          {
            id: "events",
            name: "Events",
            slug: "events",
            description: "Event processing workloads",
            resourceCount: 3,
            attentionCount: 1,
            attentionStatus: "attention",
            defaultEnvironment: {
              id: "production",
              name: "Production",
              kind: "production",
            },
            latestActivityAt: "2026-08-24T07:30:00.000Z",
          },
          {
            id: "portal",
            name: "Portal",
            slug: "portal",
            description: "Customer portal",
            resourceCount: 1,
            attentionCount: 0,
            attentionStatus: "healthy",
            defaultEnvironment: {
              id: "production",
              name: "Production",
              kind: "production",
            },
            latestActivityAt: "2026-08-24T07:00:00.000Z",
          },
        ],
      },
    ],
    [
      "api/projects/atlas-api/environments/production/overview",
      {
        schemaVersion: "project-environments.overview/v1",
        project: { id: "atlas-api", name: "Atlas API", slug: "atlas-api" },
        environment: {
          id: "production",
          name: "Production",
          kind: "production",
          lifecycleStatus: "active",
        },
        environmentChoices: [
          {
            id: "production",
            name: "Production",
            kind: "production",
            lifecycleStatus: "active",
          },
        ],
        resources: [
          {
            id: "api-gateway",
            name: "api-gateway",
            slug: "api-gateway",
            kind: "application",
            health: { status: "healthy", observedAt: "2026-08-24T08:00:00.000Z" },
            access: { status: "ready", url: "https://api.example.test" },
            latestDeployment: {
              id: "dep_atlas",
              status: "succeeded",
              createdAt: "2026-08-24T08:00:00.000Z",
            },
            attentionStatus: "healthy",
          },
        ],
        attention: { total: 1, healthy: 1, attention: 0, unknown: 0 },
        generatedAt: "2026-08-24T08:00:00.000Z",
      },
    ],
    [
      "api/projects/atlas-api/environments/production/resources/api-gateway/overview",
      {
        schemaVersion: "resources.overview/v1",
        resource: {
          id: "api-gateway",
          projectId: "atlas-api",
          environmentId: "production",
          name: "api-gateway",
          slug: "api-gateway",
          kind: "application",
          lifecycleStatus: "active",
        },
        health: { status: "healthy", observedAt: "2026-08-24T08:00:00.000Z" },
        access: { status: "ready", url: "https://api.example.test" },
        configuration: {
          sourceConfigured: true,
          runtimeConfigured: true,
          networkConfigured: true,
          accessConfigured: true,
          status: "ready",
        },
        network: { internalPort: 3000, protocol: "http", exposureMode: "reverse-proxy" },
        capabilities: {
          deploy: true,
          configure: true,
          logs: true,
          metrics: true,
          networking: true,
        },
        latestDeployments: [
          {
            id: "dep_atlas",
            status: "succeeded",
            createdAt: "2026-08-24T08:00:00.000Z",
            finishedAt: "2026-08-24T08:01:00.000Z",
          },
          {
            id: "dep_atlas_previous",
            status: "failed",
            createdAt: "2026-08-23T08:00:00.000Z",
            finishedAt: "2026-08-23T08:01:00.000Z",
          },
        ],
        generatedAt: "2026-08-24T08:00:00.000Z",
      },
    ],
  ]);

  for (const [path, payload] of fixtures) {
    const output = `${buildRoot}${path}`;
    await mkdir(output.slice(0, output.lastIndexOf("/")), { recursive: true });
    await Bun.write(output, JSON.stringify(payload));
  }
}

async function waitForPreview(): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${previewUrl}/projects`);
      if (response.ok) return;
    } catch {
      // Preview startup is eventually consistent.
    }
    await Bun.sleep(100);
  }

  throw new Error(`Dashboard preview did not become ready at ${previewUrl}`);
}

function createView(width: number, height: number): Bun.WebView {
  return new Bun.WebView({
    width,
    height,
    ...(process.platform === "darwin" ? {} : { backend: "chrome" as const }),
  });
}

async function waitFor<T>(read: () => Promise<T>, matches: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 10_000;
  let value = await read();

  while (!matches(value) && Date.now() < deadline) {
    await Bun.sleep(50);
    value = await read();
  }

  if (!matches(value))
    throw new Error(`Dashboard WebView did not reach the expected state: ${String(value)}`);
  return value;
}

async function navigateWithTheme(
  view: Bun.WebView,
  path: string,
  theme: "dark" | "light",
): Promise<void> {
  await view.navigate(`${previewUrl}${path}`);
  await waitFor(
    () => view.evaluate<string | undefined>(`document.documentElement.dataset.consolePreset`),
    (preset) => preset === "dashboard-v2",
  );
  await view.evaluate(`(() => {
    localStorage.setItem('appaloft.dashboard.theme', '${theme}');
    document.cookie = 'better-auth.session_token=dashboard-test; path=/';
    return true;
  })()`);
  await view.navigate(`${previewUrl}${path}`);
  await waitFor(
    () => view.evaluate<string | undefined>(`document.documentElement.dataset.theme`),
    (value) => value === theme,
  );
  await Bun.sleep(300);
}

async function capture(view: Bun.WebView, name: string): Promise<string> {
  await mkdir(evidenceDirectory, { recursive: true });
  const output = `${evidenceDirectory}/${name}.png`;
  await Bun.write(output, await view.screenshot());
  return output;
}

beforeAll(async () => {
  await installDashboardApiFixtures();
  const buildRoot = new URL("../../build/", import.meta.url).pathname;
  const commandBus = {
    execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
      apiFixtureCommands.push(command.constructor.name);
      if (command instanceof CreateProjectCommand) {
        return ok({ id: "created-project" } as T);
      }
      return ok({} as T);
    },
  } as CommandBus;
  const queryBus = {
    execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
      const fixturePath =
        query instanceof ListProjectSummariesQuery
          ? "api/projects/summaries"
          : query instanceof ProjectEnvironmentOverviewQuery
            ? "api/projects/atlas-api/environments/production/overview"
            : query instanceof ResourceOverviewQuery
              ? "api/projects/atlas-api/environments/production/resources/api-gateway/overview"
              : undefined;
      if (!fixturePath) throw new Error(`Unexpected Dashboard query: ${query.constructor.name}`);
      return ok((await Bun.file(`${buildRoot}${fixturePath}`).json()) as T);
    },
  } as QueryBus;
  const logger: AppLogger = { debug() {}, info() {}, warn() {}, error() {} };
  const executionContextFactory: ExecutionContextFactory = {
    create(input) {
      return createExecutionContext({
        ...input,
        requestId: input.requestId ?? "req_dashboard_e2e",
      });
    },
  };
  const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
    authorizeProductSession: async (_context, input) =>
      ok({
        actor: { kind: "user", id: "usr_dashboard", label: "dashboard@example.test" },
        email: "dashboard@example.test",
        organizationId: "org_dashboard",
        role: input.requiredRole,
        userId: "usr_dashboard",
      }),
  };
  const fixtureApp = mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus,
    executionContextFactory,
    logger,
    productSessionAuthorizationPort,
    queryBus,
  });
  const firstApiFixturePort = 53_000 + (process.pid % 5_000);
  for (let offset = 0; offset < 100 && !apiFixtureServer; offset += 1) {
    try {
      apiFixtureServer = Bun.serve({
        hostname: "127.0.0.1",
        port: firstApiFixturePort + offset,
        async fetch(request) {
          const url = new URL(request.url);
          const pathname = url.pathname;
          apiFixtureRequests.push(pathname);
          if (pathname === "/api/system-plugins/web-extensions") {
            return Response.json({
              items: extensionFixtureEnabled
                ? [
                    {
                      key: "resource-audit",
                      pluginName: "audit-log",
                      pluginDisplayName: "Audit log",
                      title: "Audit log",
                      path: "/audit-log",
                      placement: "route",
                      target: "console-route",
                      requiresAuth: true,
                      metadata: {
                        renderer: "console-page",
                        pageEndpoint: "/api/dashboard-extension-page?resourceId={resourceId}",
                        scopedNavigation: {
                          scope: "resource",
                          destination: "overview",
                          presentation: "section",
                          key: "resource-audit",
                          labelKey: "extensions.auditLog",
                          iconKey: "activity",
                          order: 20,
                          routeTemplate:
                            "/projects/{projectId}/resources/{resourceId}/overview?environment={environmentId}",
                          visibilityEndpoint:
                            "/api/dashboard-extension-visibility?resourceId={resourceId}",
                        },
                      },
                    },
                  ]
                : [],
            });
          }
          if (pathname === "/api/dashboard-extension-visibility") {
            return Response.json({ visible: true });
          }
          if (pathname === "/api/dashboard-extension-page") {
            return Response.json({
              schemaVersion: "appaloft.console.extension-page/v1",
              title: "Resource audit",
              description: "Owner-scoped extension evidence",
              sections: [
                {
                  kind: "table",
                  columns: [{ key: "action", label: "Action" }],
                  rows: [{ key: "evt_1", cells: { action: "deployment.succeeded" } }],
                },
              ],
            });
          }
          return fixtureApp.handle(request);
        },
      });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "EADDRINUSE") throw error;
    }
  }
  if (!apiFixtureServer) throw new Error("No Dashboard API fixture port was available");
  previewProcess = Bun.spawn({
    cmd: [
      "bun",
      "run",
      "preview",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(previewPort),
      "--strictPort",
    ],
    cwd: new URL("../..", import.meta.url).pathname,
    env: {
      ...process.env,
      APPALOFT_DASHBOARD_DEV_PROXY_TARGET: `http://127.0.0.1:${apiFixtureServer.port}`,
    },
    stdout: "ignore",
    stderr: "ignore",
  });
  await waitForPreview();
});

afterAll(async () => {
  previewProcess?.kill();
  await previewProcess?.exited.catch(() => undefined);
  apiFixtureServer?.stop(true);
  Bun.WebView.closeAll();
});

describe("Dashboard foundation WebView", () => {
  test("[DASH-OWN-009] dispatches the shared Project command from the create path", async () => {
    await using view = createView(1_440, 1_000);
    await navigateWithTheme(view, "/projects", "light");
    apiFixtureCommands.length = 0;
    await view.evaluate(`document.querySelector('[data-create-project-trigger]')?.click()`);
    await waitFor(
      () => view.evaluate<boolean>(`Boolean(document.querySelector('[data-create-project-form]'))`),
      Boolean,
    );
    await view.evaluate(`(() => {
      const form = document.querySelector('[data-create-project-form]');
      const name = form?.querySelector('input[name="name"]');
      const description = form?.querySelector('textarea[name="description"]');
      if (!(form instanceof HTMLFormElement) || !(name instanceof HTMLInputElement) || !(description instanceof HTMLTextAreaElement)) return false;
      name.value = 'Edge API';
      name.dispatchEvent(new Event('input', { bubbles: true }));
      description.value = 'Created through the Dashboard';
      description.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
      return true;
    })()`);
    await waitFor(async () => apiFixtureCommands.includes("CreateProjectCommand"), Boolean);
    expect(apiFixtureCommands).toEqual(["CreateProjectCommand"]);
  });

  test("[DASH-EXT-001][DASH-EXT-002][DASH-EXT-004] renders one active scoped v1 extension without global visibility fan-out", async () => {
    await using view = createView(1_440, 1_000);
    extensionFixtureEnabled = false;
    await navigateWithTheme(view, "/projects", "light");
    extensionFixtureEnabled = true;
    apiFixtureRequests.length = 0;
    await view.navigate(
      `${previewUrl}/projects/atlas-api/resources/api-gateway/overview?environment=production&view=list`,
    );
    await waitFor(
      () => view.evaluate<string>(`document.body.textContent ?? ''`),
      (content) => content.includes("Resource audit") && content.includes("deployment.succeeded"),
    );
    expect(
      await view.evaluate<string | null>(
        `document.querySelector('[data-extension-document]')?.getAttribute('data-extension-document') ?? null`,
      ),
    ).toBe("appaloft.console.extension-page/v1");
    expect(
      apiFixtureRequests.filter((path) => path === "/api/dashboard-extension-visibility"),
    ).toHaveLength(1);
    expect(
      apiFixtureRequests.filter((path) => path === "/api/dashboard-extension-page"),
    ).toHaveLength(1);
    extensionFixtureEnabled = false;
  });

  test("[DASH-DATA-005][DASH-DATA-006][DASH-PERF-001][DASH-PERF-002][DASH-PERF-003] keeps owner reads bounded without row fan-out", async () => {
    await using view = createView(1_440, 1_000);
    await navigateWithTheme(view, "/projects", "light");

    apiFixtureRequests.length = 0;
    await view.navigate(`${previewUrl}/projects`);
    await waitFor(
      () => view.evaluate<number>(`document.querySelectorAll('[data-project-card]').length`),
      (count) => count === 3,
    );
    expect(apiFixtureRequests.filter((path) => path.startsWith("/api/"))).toHaveLength(2);
    expect(
      apiFixtureRequests.filter((path) => path === "/api/rpc/projects/listSummaries"),
    ).toHaveLength(1);
    expect(
      apiFixtureRequests.some(
        (path) => path.includes("/resources/") || path.includes("/deployments"),
      ),
    ).toBe(false);

    apiFixtureRequests.length = 0;
    await view.navigate(
      `${previewUrl}/projects/atlas-api/overview?environment=production&view=list`,
    );
    await waitFor(
      () => view.evaluate<string>(`document.body.textContent ?? ''`),
      (content) => content.includes("api-gateway"),
    );
    expect(apiFixtureRequests.filter((path) => path.startsWith("/api/"))).toHaveLength(2);
    expect(
      apiFixtureRequests.filter((path) => path === "/api/rpc/projects/environmentOverview"),
    ).toHaveLength(1);
    expect(apiFixtureRequests.some((path) => path.includes("health-history"))).toBe(false);

    apiFixtureRequests.length = 0;
    await view.navigate(
      `${previewUrl}/projects/atlas-api/resources/api-gateway/overview?environment=production&view=list`,
    );
    await waitFor(
      () => view.evaluate<string>(`document.body.textContent ?? ''`),
      (content) => content.includes("dep_atlas"),
    );
    expect(apiFixtureRequests.filter((path) => path.startsWith("/api/"))).toHaveLength(3);
    expect(
      apiFixtureRequests.filter((path) => path === "/api/rpc/resources/overview"),
    ).toHaveLength(1);
    expect(
      apiFixtureRequests.some((path) => path.includes("logs") || path.includes("metrics")),
    ).toBe(false);
  });

  test("[DASH-VIS-003][DASH-A11Y-007] captures labeled desktop Light and Dark fixtures", async () => {
    await using view = createView(1_440, 1_000);
    await navigateWithTheme(view, "/projects", "light");

    const light = await view.evaluate<{
      ambientBackground: string;
      iconSurfaceCount: number;
      navLabels: string[];
      preset: string | undefined;
      theme: string | undefined;
      unlabeledControls: number;
    }>(`(() => ({
      ambientBackground: getComputedStyle(document.querySelector('.dashboard-shell')).backgroundImage,
      iconSurfaceCount: document.querySelectorAll('[data-icon-surface]').length,
      navLabels: Array.from(document.querySelectorAll('nav[aria-label="Workspace"] a')).filter((item) => item.getClientRects().length > 0).map((item) => item.textContent?.trim() ?? ''),
      preset: document.documentElement.dataset.consolePreset,
      theme: document.documentElement.dataset.theme,
      unlabeledControls: Array.from(document.querySelectorAll('button, a')).filter((item) => !(item.getAttribute('aria-label') || item.textContent?.trim())).length,
    }))()`);

    expect(light.preset).toBe("dashboard-v2");
    expect(apiFixtureRequests).toContain("/api/rpc/projects/listSummaries");
    expect(light.theme).toBe("light");
    expect(light.ambientBackground).toContain("radial-gradient");
    expect(light.iconSurfaceCount).toBeGreaterThanOrEqual(3);
    expect(light.navLabels).toHaveLength(5);
    expect(light.unlabeledControls).toBe(0);
    expect(
      (await Bun.file(await capture(view, "projects-desktop-light")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);

    await navigateWithTheme(
      view,
      "/projects/atlas-api/overview?environment=production&view=list",
      "light",
    );
    expect(
      (await Bun.file(await capture(view, "project-desktop-light")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);

    await navigateWithTheme(
      view,
      "/projects/atlas-api/resources/api-gateway/overview?environment=production&view=list",
      "dark",
    );
    expect(
      (await Bun.file(await capture(view, "resource-desktop-dark")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);

    await navigateWithTheme(view, "/patterns", "dark");
    expect(await view.evaluate<string | undefined>(`document.documentElement.dataset.theme`)).toBe(
      "dark",
    );
    expect(
      (await Bun.file(await capture(view, "patterns-desktop-dark")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);
  });

  test("[DASH-VIS-004][DASH-A11Y-006][DASH-A11Y-008] keeps mobile navigation labeled and Resource content on-canvas", async () => {
    await using view = createView(390, 844);
    await navigateWithTheme(view, "/projects", "dark");

    const workspace = await view.evaluate<{
      bottomLabels: string[];
      cardBackground: string;
      cardSurfaceToken: string;
      clientWidth: number;
      rootClass: string;
      scrollWidth: number;
      surfaceToken: string;
    }>(`(() => ({
      bottomLabels: Array.from(document.querySelectorAll('nav[aria-label="Workspace"] a')).filter((item) => item.getClientRects().length > 0).map((item) => item.textContent?.trim() ?? ''),
      cardBackground: getComputedStyle(document.querySelector('[data-project-card]')).backgroundColor,
      cardSurfaceToken: getComputedStyle(document.querySelector('[data-project-card]')).getPropertyValue('--surface').trim(),
      clientWidth: document.documentElement.clientWidth,
      rootClass: document.documentElement.className,
      scrollWidth: document.documentElement.scrollWidth,
      surfaceToken: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
    }))()`);

    expect(workspace.bottomLabels).toHaveLength(5);
    expect(workspace.bottomLabels.every(Boolean)).toBe(true);
    expect(workspace.rootClass.split(/\s+/)).toContain("dark");
    expect(workspace.surfaceToken).toBe("#282a37");
    expect(workspace.cardSurfaceToken).toBe("#282a37");
    expect(workspace.cardBackground).toBe("rgb(40, 42, 55)");
    expect(workspace.scrollWidth).toBeLessThanOrEqual(workspace.clientWidth);
    expect(
      (await Bun.file(await capture(view, "projects-mobile-dark")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);

    await navigateWithTheme(
      view,
      "/projects/atlas-api/resources/api-gateway/deployments?environment=production&view=logs",
      "dark",
    );
    const resource = await view.evaluate<{
      backgroundDisplay: string;
      clientWidth: number;
      closeLabel: string | null;
      deploymentVisible: boolean;
      scrollWidth: number;
    }>(`(() => ({
      backgroundDisplay: getComputedStyle(document.querySelector('.dashboard-resource-background')).display,
      clientWidth: document.documentElement.clientWidth,
      closeLabel: document.querySelector('aside button[aria-label]')?.getAttribute('aria-label') ?? null,
      deploymentVisible: (document.body.textContent ?? '').includes('dep_atlas_previous'),
      scrollWidth: document.documentElement.scrollWidth,
    }))()`);

    expect(resource.backgroundDisplay).toBe("none");
    expect(resource.closeLabel).toBeTruthy();
    expect(resource.deploymentVisible).toBe(true);
    expect(resource.scrollWidth).toBeLessThanOrEqual(resource.clientWidth);
    expect(
      (await Bun.file(await capture(view, "resource-mobile-dark")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);
  });

  test("[DASH-A11Y-005][DASH-A11Y-006] exposes a bounded keyboard-operable desktop panel resize control", async () => {
    await using view = createView(1_440, 1_000);
    await navigateWithTheme(
      view,
      "/projects/atlas-api/resources/api-gateway/overview?environment=production&view=list",
      "light",
    );

    const separator = await view.evaluate<{
      label: string | null;
      maximum: string | null;
      minimum: string | null;
      type: string | null;
    }>(`(() => {
      const item = document.querySelector('[data-resource-panel-resize]');
      return {
        label: item?.getAttribute('aria-label') ?? null,
        maximum: item?.getAttribute('max') ?? null,
        minimum: item?.getAttribute('min') ?? null,
        type: item?.getAttribute('type') ?? null,
      };
    })()`);

    expect(separator.type).toBe("range");
    expect(separator.label).toBeTruthy();
    expect(Number(separator.minimum)).toBe(480);
    expect(Number(separator.maximum)).toBeGreaterThan(Number(separator.minimum));

    const resized = await view.evaluate<{ after: number; before: number }>(`(() => {
      const item = document.querySelector('[data-resource-panel-resize]');
      const before = Number(item?.value);
      item?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      return { before, after: Number(localStorage.getItem('appaloft.dashboard.resource-panel-width')) };
    })()`);
    expect(resized.after).toBe(resized.before + 16);
  });
});
