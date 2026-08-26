/// <reference types="bun-types" />
import "../../../../packages/application/node_modules/reflect-metadata/Reflect.js";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AppLogger,
  BootstrapFirstAdminCommand,
  CheckResourceDeleteSafetyQuery,
  CheckProjectDeleteSafetyQuery,
  type Command,
  type CommandBus,
  CreateResourceCommand,
  CreateProjectCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  GetCurrentOrganizationContextQuery,
  GetAuthBootstrapStatusQuery,
  ListBlueprintsQuery,
  ListDependencyResourcesQuery,
  ListDeploymentsQuery,
  ListEnvironmentsQuery,
  ListOperatorWorkQuery,
  ListProjectSummariesQuery,
  ListServersQuery,
  ListOrganizationMembersQuery,
  type ProductSessionAuthorizationPort,
  ProjectEnvironmentOverviewQuery,
  type Query,
  type QueryBus,
  ResourceOverviewQuery,
  ResourceRuntimeLogsQuery,
  RuntimeMonitoringRollupQuery,
  ShowOrganizationProfileQuery,
  ShowProjectQuery,
  ShowResourceQuery,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { mountAppaloftOrpcRoutes } from "@appaloft/orpc";
import { Elysia } from "elysia";

let previewUrl = "";
const evidenceDirectory =
  process.env.APPALOFT_DASHBOARD_EVIDENCE_DIR?.trim() ||
  join(tmpdir(), "appaloft-dashboard-evidence");

let previewServer: ReturnType<typeof Bun.serve> | undefined;
let apiFixtureServer: ReturnType<typeof Bun.serve> | undefined;
const apiFixtureRequests: string[] = [];
const dashboardInfrastructureRequests = new Set([
  "/api/auth/public-config.js",
  "/api/auth/session",
  "/api/rpc/organizations/currentContext",
]);

function businessApiRequests(): string[] {
  return apiFixtureRequests.filter(
    (path) => path.startsWith("/api/") && !dashboardInfrastructureRequests.has(path),
  );
}
const apiFixtureCommands: string[] = [];
const apiFixtureQueries: string[] = [];
function destinationQueries(): string[] {
  return apiFixtureQueries.filter((name) => name !== "GetCurrentOrganizationContextQuery");
}
let extensionFixtureEnabled = false;
let bootstrapFixtureRequired = false;

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
          ...Array.from({ length: 10 }, (_, index) => {
            const sequence = index + 4;
            const suffix = String(sequence).padStart(2, "0");
            return {
              id: `project-${suffix}`,
              name: `Project ${suffix}`,
              slug: `project-${suffix}`,
              description: `Bounded project fixture ${suffix}`,
              resourceCount: sequence,
              attentionCount: sequence % 4 === 0 ? 1 : 0,
              attentionStatus: sequence % 4 === 0 ? "attention" : "healthy",
              defaultEnvironment: {
                id: "production",
                name: "Production",
                kind: "production",
              },
              latestActivityAt: `2026-08-${String(24 - index).padStart(2, "0")}T06:00:00.000Z`,
            };
          }),
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
          ...Array.from({ length: 49 }, (_, index) => {
            const sequence = index + 2;
            const suffix = String(sequence).padStart(3, "0");
            const attention = sequence % 5 === 0;
            return {
              id: `resource-${suffix}`,
              name: `service-${suffix}`,
              slug: `service-${suffix}`,
              kind: sequence % 4 === 0 ? "worker" : "application",
              health: {
                status: attention ? "degraded" : "healthy",
                observedAt: "2026-08-24T08:00:00.000Z",
              },
              access: attention
                ? { status: "not-ready" }
                : { status: "ready", url: `https://service-${suffix}.example.test` },
              latestDeployment: {
                id: `dep_${suffix}`,
                status: attention ? "failed" : "succeeded",
                createdAt: "2026-08-24T08:00:00.000Z",
              },
              attentionStatus: attention ? "attention" : "healthy",
            };
          }),
        ],
        attention: { total: 100, healthy: 80, attention: 20, unknown: 0 },
        nextCursor: "resource-cursor-50",
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
    [
      "fixtures/resource-detail.json",
      {
        schemaVersion: "resources.show/v1",
        resource: {
          id: "api-gateway",
          projectId: "atlas-api",
          environmentId: "production",
          name: "api-gateway",
          slug: "api-gateway",
          kind: "application",
          createdAt: "2026-08-20T08:00:00.000Z",
          services: [],
          deploymentCount: 2,
          lastDeploymentId: "dep_atlas",
          lastDeploymentStatus: "succeeded",
        },
        source: {
          kind: "remote-git",
          locator: "https://github.com/appaloft/api-gateway.git",
          displayName: "appaloft/api-gateway",
          sourceBindingFingerprint: "source_fixture",
          gitRef: "main",
        },
        runtimeProfile: {
          strategy: "workspace-commands",
          installCommand: "bun install --frozen-lockfile",
          buildCommand: "bun run build",
          startCommand: "bun run start",
          replicas: 1,
        },
        networkProfile: {
          internalPort: 3000,
          upstreamProtocol: "http",
          exposureMode: "reverse-proxy",
        },
        accessProfile: { generatedAccessMode: "inherit", pathPrefix: "/" },
        accessSummary: {
          plannedGeneratedAccessRoute: {
            url: "https://api.example.test",
            hostname: "api.example.test",
            scheme: "https",
            pathPrefix: "/",
            proxyKind: "caddy",
            targetPort: 3000,
          },
        },
        lifecycle: { status: "active" },
        diagnostics: [],
        generatedAt: "2026-08-24T08:00:00.000Z",
      },
    ],
    [
      "fixtures/resource-logs.json",
      {
        mode: "bounded",
        resourceId: "api-gateway",
        deploymentId: "dep_atlas",
        logs: [
          {
            resourceId: "api-gateway",
            deploymentId: "dep_atlas",
            stream: "stdout",
            timestamp: "2026-08-24T08:00:00.000Z",
            sequence: 1,
            message: "server ready on :3000",
            masked: true,
          },
        ],
      },
    ],
    [
      "fixtures/resource-rollup.json",
      {
        schemaVersion: "runtime-monitoring.rollup/v1",
        scope: { kind: "resource", resourceId: "api-gateway" },
        from: "2026-08-24T02:00:00.000Z",
        to: "2026-08-24T08:00:00.000Z",
        bucket: "five-minute",
        generatedAt: "2026-08-24T08:00:00.000Z",
        freshness: "recent-sample",
        partial: false,
        retention: { rawRetentionHours: 24 },
        series: [],
        totals: {
          cpu: { containerCpuPercent: 12.4 },
          memory: { containerUsedBytes: 134217728 },
        },
        topContributors: [],
        deploymentMarkers: [],
        warnings: [],
        sourceErrors: [],
      },
    ],
    [
      "fixtures/resource-delete-check.json",
      {
        schemaVersion: "resources.delete-check/v1",
        resourceId: "api-gateway",
        lifecycleStatus: "active",
        eligible: true,
        blockers: [],
        checkedAt: "2026-08-24T08:00:00.000Z",
      },
    ],
    [
      "fixtures/resource-deployments.json",
      {
        items: [
          {
            id: "dep_atlas",
            projectId: "atlas-api",
            environmentId: "production",
            resourceId: "api-gateway",
            serverId: "server-production",
            destinationId: "api-gateway",
            target: {
              kind: "server-backed",
              serverId: "server-production",
              destinationId: "api-gateway",
            },
            status: "succeeded",
            triggerKind: "force-redeploy",
            sourceCommitSha: "481e9c05b4f9a2d1",
            runtimePlan: {
              id: "plan_atlas",
              source: {
                kind: "git-public",
                locator: "https://github.com/appaloft/api-gateway.git",
                displayName: "appaloft/api-gateway",
              },
              buildStrategy: "workspace-commands",
              packagingMode: "host-process-runtime",
              execution: { kind: "host-process", port: 3000 },
              target: {
                kind: "single-server",
                providerKey: "local-shell",
                serverIds: ["server-production"],
              },
              detectSummary: "detected Bun workspace",
              generatedAt: "2026-08-24T07:59:00.000Z",
              steps: ["detect", "build", "deploy", "verify"],
            },
            environmentSnapshot: {
              id: "snapshot_atlas",
              environmentId: "production",
              createdAt: "2026-08-24T07:59:00.000Z",
              precedence: ["resource", "environment"],
              variables: [],
            },
            timeline: [],
            timelineCount: 0,
            createdAt: "2026-08-24T08:00:00.000Z",
            startedAt: "2026-08-24T08:00:10.000Z",
            finishedAt: "2026-08-24T08:01:00.000Z",
          },
          {
            id: "dep_atlas_previous",
            projectId: "atlas-api",
            environmentId: "production",
            resourceId: "api-gateway",
            serverId: "server-production",
            destinationId: "api-gateway",
            target: {
              kind: "server-backed",
              serverId: "server-production",
              destinationId: "api-gateway",
            },
            status: "failed",
            triggerKind: "create",
            runtimePlan: {
              id: "plan_atlas_previous",
              source: {
                kind: "git-public",
                locator: "https://github.com/appaloft/api-gateway.git",
                displayName: "appaloft/api-gateway",
              },
              buildStrategy: "workspace-commands",
              packagingMode: "host-process-runtime",
              execution: { kind: "host-process", port: 3000 },
              target: {
                kind: "single-server",
                providerKey: "local-shell",
                serverIds: ["server-production"],
              },
              detectSummary: "detected Bun workspace",
              generatedAt: "2026-08-23T07:59:00.000Z",
              steps: ["detect", "build", "deploy", "verify"],
            },
            environmentSnapshot: {
              id: "snapshot_atlas_previous",
              environmentId: "production",
              createdAt: "2026-08-23T07:59:00.000Z",
              precedence: ["resource", "environment"],
              variables: [],
            },
            timeline: [],
            timelineCount: 0,
            createdAt: "2026-08-23T08:00:00.000Z",
            startedAt: "2026-08-23T08:00:10.000Z",
            finishedAt: "2026-08-23T08:01:00.000Z",
          },
        ],
      },
    ],
    [
      "fixtures/workspace-servers.json",
      {
        items: [
          {
            id: "server-production",
            name: "Production edge",
            host: "edge.example.test",
            port: 22,
            providerKey: "ssh",
            targetKind: "single-server",
            workloadRoles: ["deployment-runtime", "artifact-builder"],
            lifecycleStatus: "active",
            runtimeAvailability: { status: "available", reasonCodes: [] },
            edgeProxy: { kind: "caddy", status: "ready" },
            createdAt: "2026-08-20T08:00:00.000Z",
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      },
    ],
    [
      "fixtures/workspace-activity.json",
      {
        schemaVersion: "operator-work.list/v1",
        items: [
          {
            id: "work_deploy_atlas",
            kind: "deployment",
            status: "succeeded",
            operationKey: "deployments.create",
            projectId: "atlas-api",
            resourceId: "api-gateway",
            deploymentId: "dep_atlas",
            updatedAt: "2026-08-24T08:01:00.000Z",
            finishedAt: "2026-08-24T08:01:00.000Z",
            nextActions: ["no-action"],
          },
        ],
        generatedAt: "2026-08-24T08:01:00.000Z",
      },
    ],
    [
      "fixtures/workspace-dependencies.json",
      {
        schemaVersion: "dependency-resources.list/v1",
        items: [],
        generatedAt: "2026-08-24T08:01:00.000Z",
      },
    ],
    [
      "fixtures/workspace-blueprints.json",
      {
        items: [
          {
            id: "bun-web-service",
            name: "Bun Web Service",
            version: "1.0.0",
            summary: "Production-ready Bun service",
            tags: ["bun", "web"],
            variants: [],
            category: "Application",
          },
        ],
      },
    ],
    [
      "fixtures/workspace-context.json",
      {
        user: {
          userId: "usr_dashboard",
          email: "dashboard@example.test",
          displayName: "Dashboard Operator",
        },
        currentOrganization: {
          organizationId: "org_dashboard",
          name: "Appaloft",
          slug: "appaloft",
          role: "owner",
        },
        organizations: [
          { organizationId: "org_dashboard", name: "Appaloft", slug: "appaloft", role: "owner" },
        ],
        loginMethods: [{ key: "github", configured: true, enabled: true }],
        permissions: {
          canInviteMembers: true,
          canListMembers: true,
          canManageDeployTokens: true,
          canRemoveMembers: true,
          canTransferOwnership: true,
          canUpdateMemberRoles: true,
        },
      },
    ],
    [
      "fixtures/workspace-profile.json",
      {
        organizationId: "org_dashboard",
        name: "Appaloft",
        slug: "appaloft",
        role: "owner",
        createdAt: "2026-08-20T08:00:00.000Z",
      },
    ],
    [
      "fixtures/workspace-members.json",
      {
        items: [
          {
            memberId: "member_owner",
            userId: "usr_dashboard",
            role: "owner",
            joinedAt: "2026-08-20T08:00:00.000Z",
            displayName: "Dashboard Operator",
            email: "dashboard@example.test",
            status: "active",
          },
        ],
      },
    ],
    [
      "fixtures/project-detail.json",
      {
        id: "atlas-api",
        organizationId: "org_dashboard",
        name: "Atlas API",
        slug: "atlas-api",
        description: "Public API and background workers",
        lifecycleStatus: "active",
        createdAt: "2026-08-20T08:00:00.000Z",
      },
    ],
    [
      "fixtures/project-environments.json",
      {
        items: [
          {
            id: "production",
            projectId: "atlas-api",
            name: "Production",
            kind: "production",
            lifecycleStatus: "active",
            createdAt: "2026-08-20T08:00:00.000Z",
            maskedVariables: [],
          },
        ],
      },
    ],
    [
      "fixtures/project-delete-check.json",
      {
        schemaVersion: "projects.delete-check/v1",
        projectId: "atlas-api",
        lifecycleStatus: "active",
        eligible: false,
        blockers: [{ kind: "resource", count: 50 }],
        checkedAt: "2026-08-24T08:00:00.000Z",
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
  const output = join(evidenceDirectory, `${name}.png`);
  await Bun.write(output, await view.screenshot());
  return output;
}

async function clickResourceDestination(
  view: Bun.WebView,
  hrefFragment: string,
  destinationSelector: string,
): Promise<number> {
  return view.evaluate<number>(`new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const observer = new MutationObserver(() => {
      if (!document.querySelector('${destinationSelector}')) return;
      observer.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - startedAt)));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const link = document.querySelector('nav[aria-label="Resource"] a[href*="${hrefFragment}"]');
    if (!(link instanceof HTMLAnchorElement)) {
      observer.disconnect();
      reject(new Error('Resource destination link was not found'));
      return;
    }
    link.click();
    setTimeout(() => {
      observer.disconnect();
      reject(new Error('Resource destination did not render'));
    }, 2000);
  })`);
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
      if (command instanceof CreateResourceCommand) {
        return ok({ id: "created-resource" } as T);
      }
      if (command instanceof BootstrapFirstAdminCommand) {
        return ok({
          bootstrapRequired: false,
          created: true,
          email: command.email,
          loginMethods: [{ key: "local-password", configured: true, enabled: true }],
          organizationId: "org_dashboard",
          organizationSlug: "appaloft",
          userId: "usr_dashboard",
          loginUrl: "/login",
        } as T);
      }
      return ok({ id: "api-gateway" } as T);
    },
  } as CommandBus;
  const queryBus = {
    execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
      apiFixtureQueries.push(query.constructor.name);
      if (query instanceof GetAuthBootstrapStatusQuery) {
        return ok({
          bootstrapRequired: bootstrapFixtureRequired,
          firstAdminConfigured: !bootstrapFixtureRequired,
          organizationConfigured: !bootstrapFixtureRequired,
          loginMethods: [{ key: "local-password", configured: true, enabled: true }],
          loginUrl: "/login",
        } as T);
      }
      const fixturePath =
        query instanceof ListProjectSummariesQuery
          ? "api/projects/summaries"
          : query instanceof ProjectEnvironmentOverviewQuery
            ? "api/projects/atlas-api/environments/production/overview"
            : query instanceof ListServersQuery
              ? "fixtures/workspace-servers.json"
              : query instanceof ListDependencyResourcesQuery
                ? "fixtures/workspace-dependencies.json"
                : query instanceof ListOperatorWorkQuery
                  ? "fixtures/workspace-activity.json"
                  : query instanceof ListBlueprintsQuery
                    ? "fixtures/workspace-blueprints.json"
                    : query instanceof ListEnvironmentsQuery
                      ? "fixtures/project-environments.json"
                      : query instanceof GetCurrentOrganizationContextQuery
                        ? "fixtures/workspace-context.json"
                        : query instanceof ShowOrganizationProfileQuery
                          ? "fixtures/workspace-profile.json"
                          : query instanceof ListOrganizationMembersQuery
                            ? "fixtures/workspace-members.json"
                            : query instanceof ShowProjectQuery
                              ? "fixtures/project-detail.json"
                              : query instanceof CheckProjectDeleteSafetyQuery
                                ? "fixtures/project-delete-check.json"
                                : query instanceof ResourceOverviewQuery
                                  ? "api/projects/atlas-api/environments/production/resources/api-gateway/overview"
                                  : query instanceof ShowResourceQuery
                                    ? "fixtures/resource-detail.json"
                                    : query instanceof ResourceRuntimeLogsQuery
                                      ? "fixtures/resource-logs.json"
                                      : query instanceof RuntimeMonitoringRollupQuery
                                        ? "fixtures/resource-rollup.json"
                                        : query instanceof CheckResourceDeleteSafetyQuery
                                          ? "fixtures/resource-delete-check.json"
                                          : query instanceof ListDeploymentsQuery
                                            ? "fixtures/resource-deployments.json"
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
          if (pathname === "/api/auth/public-config.js") {
            return new Response(
              'window.__APPALOFT_PUBLIC_CONFIG__={auth:{schemaVersion:"appaloft.auth.public-config/v1",enabled:true,provider:"better-auth",providers:[]}};',
              { headers: { "content-type": "application/javascript; charset=utf-8" } },
            );
          }
          if (pathname === "/api/auth/session") {
            return Response.json({
              accountSecurity: { enabled: true, passwordState: "set" },
              accountRecovery: { enabled: true },
              enabled: true,
              emailVerification: { enabled: false, otpEnabled: false, required: false },
              provider: "better-auth",
              loginRequired: true,
              deferredAuth: false,
              session: { user: { id: "usr_dashboard" } },
              providers: [],
            });
          }
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
  const apiFixturePort = apiFixtureServer.port;
  previewServer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const requestUrl = new URL(request.url);
      const pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname.startsWith("/api/")) {
        return fetch(
          new Request(
            `http://127.0.0.1:${apiFixturePort}${requestUrl.pathname}${requestUrl.search}`,
            request,
          ),
        );
      }
      const requestedFile = Bun.file(join(buildRoot, pathname === "/" ? "index.html" : pathname));
      if (await requestedFile.exists()) return new Response(requestedFile);
      return new Response(Bun.file(join(buildRoot, "200.html")));
    },
  });
  previewUrl = `http://127.0.0.1:${previewServer.port}`;
  await waitForPreview();
});

afterAll(async () => {
  previewServer?.stop(true);
  apiFixtureServer?.stop(true);
  Bun.WebView.closeAll();
});

describe("Dashboard foundation WebView", () => {
  test("[DASH-AUTH-001][DASH-AUTH-002] keeps sign-in and first-admin recovery usable", async () => {
    await using desktop = createView(1_440, 1_000);

    bootstrapFixtureRequired = false;
    await desktop.navigate(`${previewUrl}/login?next=%2Fprojects%2Fatlas-api%2Foverview`);
    await waitFor(
      () =>
        desktop.evaluate<boolean>(
          `Boolean(document.querySelector('[data-dashboard-auth="login"] form'))`,
        ),
      Boolean,
    ).catch(async (error) => {
      const diagnostics = await desktop.evaluate(
        `({ url: location.href, body: document.body.textContent ?? '', html: document.body.innerHTML.slice(0, 1200) })`,
      );
      throw new Error(`${String(error)}\n${JSON.stringify({ diagnostics, apiFixtureRequests })}`);
    });
    expect(
      await desktop.evaluate<number>(`document.querySelectorAll('.dashboard-shell').length`),
    ).toBe(0);
    expect(
      await desktop.evaluate<number>(
        `document.querySelectorAll('[data-dashboard-auth="login"] input').length`,
      ),
    ).toBe(2);
    expect(
      (await Bun.file(await capture(desktop, "auth-login-desktop-light")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);

    bootstrapFixtureRequired = true;
    apiFixtureCommands.length = 0;
    await desktop.navigate(`${previewUrl}/bootstrap/auth/first-admin`);
    await waitFor(
      () =>
        desktop.evaluate<boolean>(
          `Boolean(document.querySelector('[data-dashboard-auth="first-admin"] form'))`,
        ),
      Boolean,
    ).catch(async (error) => {
      const diagnostics = await desktop.evaluate(
        `({ url: location.href, body: document.body.textContent ?? '', html: document.body.innerHTML.slice(0, 1200) })`,
      );
      throw new Error(
        `${String(error)}\n${JSON.stringify({ diagnostics, apiFixtureQueries, apiFixtureRequests })}`,
      );
    });
    await desktop.evaluate(`(() => {
      const form = document.querySelector('[data-dashboard-auth="first-admin"] form');
      const inputs = form?.querySelectorAll('input');
      if (!(form instanceof HTMLFormElement) || !inputs || inputs.length < 2) return false;
      inputs[0].value = 'owner@example.test';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].value = 'Owner';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
      return true;
    })()`);
    await waitFor(async () => apiFixtureCommands.includes("BootstrapFirstAdminCommand"), Boolean);
    await waitFor(
      () => desktop.evaluate<string>(`document.body.textContent ?? ''`),
      (content) => content.includes("Your control plane is ready"),
    );
    expect(
      (await Bun.file(await capture(desktop, "auth-first-admin-desktop-light")).arrayBuffer())
        .byteLength,
    ).toBeGreaterThan(10_000);

    await using mobile = createView(390, 844);
    bootstrapFixtureRequired = false;
    await mobile.navigate(`${previewUrl}/login`);
    await waitFor(
      () => mobile.evaluate<boolean>(`Boolean(document.querySelector('[data-dashboard-auth]'))`),
      Boolean,
    );
    const dimensions = await mobile.evaluate<{ clientWidth: number; scrollWidth: number }>(
      `({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })`,
    );
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    expect(
      (await Bun.file(await capture(mobile, "auth-login-mobile-light")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);
  }, 20_000);

  test("[DASH-ROUTE-004][DASH-ROUTE-005][DASH-OWN-008] makes every Workspace and Project destination usable", async () => {
    await using view = createView(1_440, 1_000);

    for (const fixture of [
      {
        name: "workspace-infrastructure-desktop-light",
        path: "/infrastructure",
        selector: "[data-workspace-infrastructure]",
        operation: "/api/rpc/servers/list",
      },
      {
        name: "workspace-activity-desktop-light",
        path: "/activity",
        selector: "[data-workspace-activity]",
        operation: "/api/rpc/operatorWork/list",
      },
      {
        name: "workspace-marketplace-desktop-light",
        path: "/marketplace",
        selector: "[data-workspace-marketplace]",
        operation: "/api/rpc/blueprints/list",
      },
      {
        name: "workspace-settings-desktop-light",
        path: "/settings",
        selector: "[data-workspace-settings]",
        operation: "/api/rpc/organizations/showProfile",
      },
      {
        name: "project-deployments-desktop-light",
        path: "/projects/atlas-api/deployments?environment=production",
        selector: "[data-project-deployments]",
        operation: "/api/rpc/deployments/list",
      },
      {
        name: "project-observability-desktop-light",
        path: "/projects/atlas-api/observability?environment=production",
        selector: "[data-project-observability]",
        operation: "/api/rpc/runtimeMonitoring/rollup",
      },
      {
        name: "project-settings-desktop-light",
        path: "/projects/atlas-api/settings?environment=production",
        selector: "[data-project-settings]",
        operation: "/api/rpc/projects/show",
      },
    ] as const) {
      apiFixtureRequests.length = 0;
      await navigateWithTheme(view, fixture.path, "light");
      await waitFor(
        () => view.evaluate<boolean>(`Boolean(document.querySelector('${fixture.selector}'))`),
        Boolean,
      );
      expect(apiFixtureRequests).toContain(fixture.operation);
      expect(
        await view.evaluate<number>(
          `Array.from(document.querySelectorAll('nav[aria-label="Workspace"] a')).filter((item) => item.getClientRects().length > 0).length`,
        ),
      ).toBeLessThanOrEqual(5);
      expect(await view.evaluate<string>(`document.body.textContent ?? ''`)).not.toContain(
        "Coming soon",
      );
      const dimensions = await view.evaluate<{ clientWidth: number; scrollWidth: number }>(
        `({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })`,
      );
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      expect(
        (await Bun.file(await capture(view, fixture.name)).arrayBuffer()).byteLength,
      ).toBeGreaterThan(10_000);
    }
  }, 20_000);

  test("[DASH-OWN-008][DASH-OWN-009] dispatches accepted Workspace, Project, and Resource commands", async () => {
    await using view = createView(1_440, 1_000);

    await navigateWithTheme(view, "/infrastructure", "light");
    apiFixtureCommands.length = 0;
    await view.evaluate(
      `document.querySelector('[data-workspace-infrastructure] button')?.click()`,
    );
    await waitFor(
      () => view.evaluate<boolean>(`Boolean(document.querySelector('[data-create-server-form]'))`),
      Boolean,
    );
    await view.evaluate(
      `(() => { const form = document.querySelector('[data-create-server-form]'); const inputs = form?.querySelectorAll('input'); if (!(form instanceof HTMLFormElement) || !inputs || inputs.length < 2) return false; inputs[0].value = 'Staging edge'; inputs[0].dispatchEvent(new Event('input', { bubbles: true })); inputs[1].value = 'staging.example.test'; inputs[1].dispatchEvent(new Event('input', { bubbles: true })); form.requestSubmit(); return true; })()`,
    );
    await waitFor(async () => apiFixtureCommands.includes("RegisterServerCommand"), Boolean);

    await navigateWithTheme(view, "/projects/atlas-api/overview?environment=production", "light");
    apiFixtureCommands.length = 0;
    await view.evaluate(`document.querySelector('[data-add-resource]')?.click()`);
    await waitFor(
      () =>
        view.evaluate<boolean>(`Boolean(document.querySelector('[data-create-resource-form]'))`),
      Boolean,
    );
    await view.evaluate(
      `(() => { const form = document.querySelector('[data-create-resource-form]'); const input = form?.querySelector('input[name="name"]'); if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) return false; input.value = 'billing-worker'; input.dispatchEvent(new Event('input', { bubbles: true })); form.requestSubmit(); return true; })()`,
    );
    await waitFor(async () => apiFixtureCommands.includes("CreateResourceCommand"), Boolean);
    expect(apiFixtureCommands).toEqual(["CreateResourceCommand"]);
  }, 15_000);

  test("[DASH-OWN-010] keeps Agent contextual without owning its execution lifecycle", async () => {
    await using view = createView(1_440, 1_000);
    await navigateWithTheme(
      view,
      "/projects/atlas-api/observability?environment=production",
      "light",
    );
    await view.evaluate(
      `Array.from(document.querySelectorAll('header button')).find((item) => item.textContent?.includes('Agent'))?.click()`,
    );
    await waitFor(
      () => view.evaluate<boolean>(`Boolean(document.querySelector('[data-contextual-agent]'))`),
      Boolean,
    );
    await view.evaluate(
      `Array.from(document.querySelectorAll('[data-contextual-agent] button')).find((item) => item.textContent?.includes('Summarize deployment health'))?.click()`,
    );

    const agent = await view.evaluate<{
      disabledActionCount: number;
      linkCount: number;
      prompt: string;
    }>(`(() => ({
      disabledActionCount: Array.from(document.querySelectorAll('[data-contextual-agent] button')).filter((item) => item.hasAttribute('disabled')).length,
      linkCount: document.querySelectorAll('[data-contextual-agent] a').length,
      prompt: document.querySelector('#dashboard-agent-prompt')?.value ?? '',
    }))()`);

    expect(agent.disabledActionCount).toBe(0);
    expect(agent.linkCount).toBe(0);
    expect(agent.prompt).toBe("Summarize deployment health");
    expect(
      (await Bun.file(await capture(view, "project-agent-desktop-light")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);
  });

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
      (count) => count === 13,
    );
    expect(businessApiRequests()).toHaveLength(2);
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
    expect(
      await view.evaluate<number>(`document.querySelectorAll('a[href*="/resources/"]').length`),
    ).toBeLessThanOrEqual(50);
    expect(await view.evaluate<string>(`document.body.textContent ?? ''`)).toContain("service-050");
    expect(businessApiRequests()).toHaveLength(2);
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
    expect(businessApiRequests()).toHaveLength(3);
    expect(
      apiFixtureRequests.filter((path) => path === "/api/rpc/resources/overview"),
    ).toHaveLength(1);
    expect(
      apiFixtureRequests.some((path) => path.includes("logs") || path.includes("metrics")),
    ).toBe(false);
  });

  test("[DASH-PERF-001][DASH-PERF-002][DASH-PERF-003] records bounded route performance evidence", async () => {
    const scenarios = [
      {
        key: "projects",
        path: "/projects",
        ready: (view: Bun.WebView) =>
          waitFor(
            () => view.evaluate<number>(`document.querySelectorAll('[data-project-card]').length`),
            (count) => count === 13,
          ),
      },
      {
        key: "project-overview",
        path: "/projects/atlas-api/overview?environment=production&view=list",
        ready: (view: Bun.WebView) =>
          waitFor(
            () => view.evaluate<string>(`document.body.textContent ?? ''`),
            (content) => content.includes("service-050"),
          ),
      },
      {
        key: "resource-overview",
        path: "/projects/atlas-api/resources/api-gateway/overview?environment=production&view=list",
        ready: (view: Bun.WebView) =>
          waitFor(
            () => view.evaluate<string>(`document.body.textContent ?? ''`),
            (content) => content.includes("dep_atlas"),
          ),
      },
    ] as const;
    const evidence: Record<
      string,
      {
        samplesMs: number[];
        p95Ms: number;
        productDataRequestPaths: string[];
        requestCount: number;
      }
    > = {};

    await using view = createView(1_440, 1_000);
    for (const scenario of scenarios) {
      const samplesMs: number[] = [];
      let productDataRequestPaths: string[] = [];
      for (let index = 0; index < 20; index += 1) {
        if (scenario.key === "resource-overview") {
          await view.navigate(
            `${previewUrl}/projects/atlas-api/overview?environment=production&view=list`,
          );
          await waitFor(
            () => view.evaluate<string>(`document.body.textContent ?? ''`),
            (content) => content.includes("api-gateway"),
          );
        }
        apiFixtureRequests.length = 0;
        const startedAt = performance.now();
        if (scenario.key === "resource-overview") {
          await view.evaluate(`(() => {
            const link = document.querySelector('a[href*="/resources/api-gateway/overview"]');
            if (!(link instanceof HTMLAnchorElement)) throw new Error('Warm Resource link was not found');
            link.click();
          })()`);
        } else {
          await view.navigate(`${previewUrl}${scenario.path}`);
        }
        await scenario.ready(view);
        samplesMs.push(Number((performance.now() - startedAt).toFixed(2)));
        await Bun.sleep(100);
        productDataRequestPaths = [
          ...new Set(apiFixtureRequests.filter((pathname) => pathname.startsWith("/api/rpc/"))),
        ].toSorted();
      }
      const sorted = samplesMs.toSorted((left, right) => left - right);
      evidence[scenario.key] = {
        samplesMs,
        p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY,
        productDataRequestPaths,
        requestCount: productDataRequestPaths.length,
      };
    }

    await mkdir(evidenceDirectory, { recursive: true });
    await Bun.write(
      join(evidenceDirectory, "dashboard-route-performance.json"),
      JSON.stringify(
        {
          schemaVersion: "appaloft.dashboard-route-performance/v1",
          capturedAt: new Date().toISOString(),
          viewport: "1440x1000",
          sampleCountPerRoute: 20,
          scenarios: evidence,
        },
        undefined,
        2,
      ),
    );

    expect(evidence.projects?.requestCount).toBeLessThanOrEqual(4);
    expect(evidence.projects?.p95Ms).toBeLessThanOrEqual(1_500);
    expect(evidence["project-overview"]?.requestCount).toBeLessThanOrEqual(5);
    expect(evidence["project-overview"]?.p95Ms).toBeLessThanOrEqual(1_800);
    expect(evidence["resource-overview"]?.requestCount).toBeLessThanOrEqual(2);
    expect(evidence["resource-overview"]?.p95Ms).toBeLessThanOrEqual(1_000);
  }, 60_000);

  test("[DASH-DATA-007][DASH-PERF-003][DASH-PERF-004][DASH-PERF-006] loads only the active Resource destination", async () => {
    await using view = createView(1_440, 1_000);

    apiFixtureRequests.length = 0;
    await navigateWithTheme(
      view,
      "/projects/atlas-api/resources/api-gateway/configuration?environment=production&view=list",
      "light",
    );
    await waitFor(
      () =>
        view.evaluate<boolean>(`Boolean(document.querySelector('[data-resource-configuration]'))`),
      Boolean,
    );
    await waitFor(async () => apiFixtureRequests.includes("/api/rpc/resources/show"), Boolean);
    expect(apiFixtureRequests).toContain("/api/rpc/resources/show");
    expect(apiFixtureRequests).not.toContain("/api/rpc/resources/overview");
    expect(
      apiFixtureRequests.some(
        (path) => path.includes("runtime-logs") || path.includes("runtimeMonitoring"),
      ),
    ).toBe(false);

    apiFixtureRequests.length = 0;
    apiFixtureQueries.length = 0;
    await view.navigate(
      `${previewUrl}/projects/atlas-api/resources/api-gateway/logs-metrics?environment=production&view=list`,
    );
    await waitFor(
      async () => destinationQueries().length,
      (count) => count >= 3,
    );
    expect(destinationQueries()).toHaveLength(3);
    expect(destinationQueries()).toEqual(
      expect.arrayContaining([
        "ProjectEnvironmentOverviewQuery",
        "ResourceRuntimeLogsQuery",
        "RuntimeMonitoringRollupQuery",
      ]),
    );
    await waitFor(
      () => view.evaluate<string>(`document.body.textContent ?? ''`),
      (content) => content.includes("server ready on :3000"),
    );
    expect(apiFixtureRequests).toContain("/api/rpc/resources/logs");
    expect(apiFixtureRequests).toContain("/api/rpc/runtimeMonitoring/rollup");
    expect(apiFixtureRequests).not.toContain("/api/rpc/resources/show");
    expect(apiFixtureRequests).not.toContain("/api/rpc/resources/deleteCheck");

    apiFixtureRequests.length = 0;
    await view.navigate(
      `${previewUrl}/projects/atlas-api/resources/api-gateway/networking?environment=production&view=list`,
    );
    await waitFor(
      () => view.evaluate<boolean>(`Boolean(document.querySelector('[data-resource-networking]'))`),
      Boolean,
    );
    expect(apiFixtureRequests).toContain("/api/rpc/resources/show");
    expect(apiFixtureRequests).not.toContain("/api/rpc/resources/overview");
    expect(apiFixtureRequests.some((path) => path.includes("runtime-logs"))).toBe(false);

    apiFixtureRequests.length = 0;
    await view.navigate(
      `${previewUrl}/projects/atlas-api/resources/api-gateway/settings?environment=production&view=list`,
    );
    await waitFor(
      () => view.evaluate<boolean>(`Boolean(document.querySelector('[data-resource-settings]'))`),
      Boolean,
    );
    expect(apiFixtureRequests).toContain("/api/rpc/resources/show");
    expect(apiFixtureRequests).toContain("/api/rpc/resources/deleteCheck");
    expect(apiFixtureRequests).not.toContain("/api/rpc/resources/overview");
    expect(apiFixtureRequests.some((path) => path.includes("runtimeMonitoring"))).toBe(false);

    apiFixtureRequests.length = 0;
    apiFixtureQueries.length = 0;
    await view.navigate(
      `${previewUrl}/projects/atlas-api/resources/api-gateway/deployments?environment=production&view=list`,
    );
    await waitFor(
      () =>
        view.evaluate<boolean>(`Boolean(document.querySelector('[data-resource-deployments]'))`),
      Boolean,
    );
    expect(apiFixtureQueries).toEqual(
      expect.arrayContaining(["ProjectEnvironmentOverviewQuery", "ListDeploymentsQuery"]),
    );
    expect(apiFixtureRequests).toContain("/api/rpc/deployments/list");
    expect(apiFixtureRequests).not.toContain("/api/rpc/resources/overview");
    expect(
      await view.evaluate<string>(
        `document.querySelector('[data-resource-deployments]')?.textContent ?? ''`,
      ),
    ).toContain("dep_atlas_previous");
  }, 15_000);

  test("[DASH-OWN-009] dispatches accepted Resource configuration and lifecycle commands", async () => {
    await using view = createView(1_440, 1_000);

    await navigateWithTheme(
      view,
      "/projects/atlas-api/resources/api-gateway/configuration?environment=production&view=list",
      "light",
    );
    await waitFor(
      () =>
        view.evaluate<boolean>(`Boolean(document.querySelector('[data-resource-configuration]'))`),
      Boolean,
    );
    apiFixtureCommands.length = 0;
    await view.evaluate(`document.querySelector('[data-resource-configuration]')?.requestSubmit()`);
    await waitFor(
      async () => apiFixtureCommands.includes("ConfigureResourceRuntimeCommand"),
      Boolean,
    );
    expect(apiFixtureCommands).toEqual(["ConfigureResourceRuntimeCommand"]);

    await view.navigate(
      `${previewUrl}/projects/atlas-api/resources/api-gateway/networking?environment=production&view=list`,
    );
    await waitFor(
      () => view.evaluate<boolean>(`Boolean(document.querySelector('[data-resource-networking]'))`),
      Boolean,
    );
    apiFixtureCommands.length = 0;
    await view.evaluate(`document.querySelector('[data-resource-networking]')?.requestSubmit()`);
    await waitFor(
      async () => apiFixtureCommands.length,
      (count) => count === 2,
    );
    expect(apiFixtureCommands).toEqual([
      "ConfigureResourceNetworkCommand",
      "ConfigureResourceAccessCommand",
    ]);

    await view.navigate(
      `${previewUrl}/projects/atlas-api/resources/api-gateway/settings?environment=production&view=list`,
    );
    await waitFor(
      () =>
        view.evaluate<boolean>(
          `Boolean(document.querySelector('[data-resource-lifecycle-action]'))`,
        ),
      Boolean,
    );
    apiFixtureCommands.length = 0;
    await view.evaluate(`document.querySelector('[data-resource-lifecycle-action]')?.click()`);
    await waitFor(async () => apiFixtureCommands.includes("ArchiveResourceCommand"), Boolean);
    expect(apiFixtureCommands).toEqual(["ArchiveResourceCommand"]);
  }, 15_000);

  test("[DASH-DATA-007][DASH-PERF-004] keeps cached tab switches fast and leaves no inactive requests", async () => {
    await using view = createView(1_440, 1_000);
    await navigateWithTheme(
      view,
      "/projects/atlas-api/resources/api-gateway/configuration?environment=production&view=list",
      "light",
    );
    await waitFor(
      () =>
        view.evaluate<boolean>(`Boolean(document.querySelector('[data-resource-configuration]'))`),
      Boolean,
    );

    await clickResourceDestination(view, "/networking", "[data-resource-networking]");
    await clickResourceDestination(view, "/configuration", "[data-resource-configuration]");

    const samples: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      samples.push(
        await clickResourceDestination(view, "/networking", "[data-resource-networking]"),
      );
      samples.push(
        await clickResourceDestination(view, "/configuration", "[data-resource-configuration]"),
      );
    }
    const sortedSamples = samples.toSorted((left, right) => left - right);
    const p95 =
      sortedSamples[Math.ceil(sortedSamples.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    await mkdir(evidenceDirectory, { recursive: true });
    await Bun.write(
      join(evidenceDirectory, "resource-tab-performance.json"),
      JSON.stringify(
        {
          schemaVersion: "appaloft.dashboard-resource-tab-performance/v1",
          capturedAt: new Date().toISOString(),
          viewport: "1440x1000",
          sampleCount: samples.length,
          samplesMs: samples.map((sample) => Number(sample.toFixed(2))),
          p95Ms: Number(p95.toFixed(2)),
          blockingBudgetMs: 200,
        },
        undefined,
        2,
      ),
    );
    expect(p95).toBeLessThanOrEqual(200);

    await clickResourceDestination(view, "/logs-metrics", "[data-resource-observability]");
    const inactiveRequestCount = apiFixtureRequests.length;
    await clickResourceDestination(view, "/configuration", "[data-resource-configuration]");
    const settledRequestCount = apiFixtureRequests.length;
    expect(settledRequestCount).toBeGreaterThan(inactiveRequestCount);
    await Bun.sleep(500);
    expect(apiFixtureRequests).toHaveLength(settledRequestCount);
    expect(apiFixtureRequests.some((path) => path.includes("logsStream"))).toBe(false);
  }, 20_000);
  test("[DASH-DATA-008] keeps the background Project overview idle across Resource destination switches", async () => {
    await using view = createView(1_440, 1_000);
    await navigateWithTheme(
      view,
      "/projects/atlas-api/resources/api-gateway/deployments?environment=production&view=list",
      "light",
    );
    await waitFor(
      () =>
        view.evaluate<boolean>(`Boolean(document.querySelector('[data-resource-deployments]'))`),
      Boolean,
    );
    await waitFor(
      () => view.evaluate<boolean>(`!document.querySelector('[aria-label="Loading project"]')`),
      Boolean,
    );

    apiFixtureQueries.length = 0;
    apiFixtureRequests.length = 0;
    await clickResourceDestination(view, "/configuration", "[data-resource-configuration]");
    await clickResourceDestination(view, "/deployments", "[data-resource-deployments]");
    await waitFor(async () => apiFixtureQueries.includes("ListDeploymentsQuery"), Boolean);
    expect(apiFixtureQueries).not.toContain("ProjectEnvironmentOverviewQuery");
    expect(apiFixtureRequests).not.toContain("/api/rpc/projects/environmentOverview");
    expect(
      await view.evaluate<boolean>(
        `Boolean(document.querySelector('[aria-label="Loading project"]'))`,
      ),
    ).toBe(false);
  }, 15_000);

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

    for (const fixture of [
      {
        destination: "configuration",
        theme: "light",
        name: "resource-configuration-desktop-light",
      },
      { destination: "logs-metrics", theme: "dark", name: "resource-observability-desktop-dark" },
      { destination: "networking", theme: "light", name: "resource-networking-desktop-light" },
      { destination: "settings", theme: "dark", name: "resource-settings-desktop-dark" },
    ] as const) {
      await navigateWithTheme(
        view,
        `/projects/atlas-api/resources/api-gateway/${fixture.destination}?environment=production&view=list`,
        fixture.theme,
      );
      expect(
        (await Bun.file(await capture(view, fixture.name)).arrayBuffer()).byteLength,
      ).toBeGreaterThan(10_000);
    }

    await navigateWithTheme(view, "/patterns", "dark");
    expect(await view.evaluate<string | undefined>(`document.documentElement.dataset.theme`)).toBe(
      "dark",
    );
    expect(
      (await Bun.file(await capture(view, "patterns-desktop-dark")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);
  }, 15_000);

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

    for (const fixture of [
      {
        path: "/marketplace",
        selector: "[data-workspace-marketplace]",
        name: "workspace-marketplace-mobile-dark",
      },
      {
        path: "/settings",
        selector: "[data-workspace-settings]",
        name: "workspace-settings-mobile-dark",
      },
      {
        path: "/projects/atlas-api/observability?environment=production",
        selector: "[data-project-observability]",
        name: "project-observability-mobile-dark",
      },
      {
        path: "/projects/atlas-api/settings?environment=production",
        selector: "[data-project-settings]",
        name: "project-settings-mobile-dark",
      },
    ] as const) {
      await navigateWithTheme(view, fixture.path, "dark");
      await waitFor(
        () => view.evaluate<boolean>(`Boolean(document.querySelector('${fixture.selector}'))`),
        Boolean,
      );
      const dimensions = await view.evaluate<{ clientWidth: number; scrollWidth: number }>(
        `({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })`,
      );
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      expect(
        (await Bun.file(await capture(view, fixture.name)).arrayBuffer()).byteLength,
      ).toBeGreaterThan(10_000);
    }

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

    for (const fixture of [
      { destination: "configuration", selector: "[data-resource-configuration]" },
      { destination: "logs-metrics", selector: "[data-resource-observability]" },
      { destination: "networking", selector: "[data-resource-networking]" },
      { destination: "settings", selector: "[data-resource-settings]" },
    ] as const) {
      await navigateWithTheme(
        view,
        `/projects/atlas-api/resources/api-gateway/${fixture.destination}?environment=production&view=list`,
        "dark",
      );
      await waitFor(
        () => view.evaluate<string>(`document.body.textContent ?? ''`),
        (content) => content.includes("api-gateway"),
      );
      const dimensions = await view.evaluate<{
        clientWidth: number;
        destinationVisible: boolean;
        panelWidth: number;
        scrollWidth: number;
      }>(`({
        clientWidth: document.documentElement.clientWidth,
        destinationVisible: Boolean(document.querySelector('${fixture.selector}')),
        panelWidth: document.querySelector('[data-resource-panel-resize]')?.closest('aside')?.getBoundingClientRect().width ?? 0,
        scrollWidth: document.documentElement.scrollWidth,
      })`);
      expect(dimensions.destinationVisible).toBe(true);
      expect(dimensions.panelWidth).toBe(dimensions.clientWidth);
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    }
    expect(
      (await Bun.file(await capture(view, "resource-settings-mobile-dark")).arrayBuffer())
        .byteLength,
    ).toBeGreaterThan(10_000);
  }, 30_000);

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
