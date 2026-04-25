/// <reference types="bun-types" />

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

type ApiScenario = "dashboard" | "github-connected" | "static-quick-deploy";
type ApiRouteResponse = unknown | Response;
type ApiRouteHandler = (
  request: Request,
  body: unknown,
) => ApiRouteResponse | Promise<ApiRouteResponse>;
type ApiRoute = ApiRouteResponse | ApiRouteHandler;

type RecordedApiRequest = {
  method: string;
  pathname: string;
  body: unknown;
};

function deploymentDetailFixture(input: {
  deploymentId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  sourceDisplayName: string;
  sourceLocator: string;
  status?: "created" | "planning" | "planned" | "running" | "succeeded" | "failed";
  sectionErrors?: Array<{
    section: "related-context" | "timeline" | "snapshot" | "latest-failure";
    code: string;
    category: string;
    phase: string;
    retriable: boolean;
    relatedEntityId?: string;
  }>;
}) {
  const status = input.status ?? "succeeded";

  return {
    schemaVersion: "deployments.show/v1",
    deployment: {
      id: input.deploymentId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      resourceId: input.resourceId,
      serverId: input.serverId,
      destinationId: input.destinationId,
      status,
      runtimePlan: {
        id: `plan_${input.deploymentId}`,
        source: {
          kind: "git-public",
          locator: input.sourceLocator,
          displayName: input.sourceDisplayName,
        },
        buildStrategy: "workspace-commands",
        packagingMode: "host-process-runtime",
        execution: {
          kind: "host-process",
          port: 3000,
          accessRoutes: [
            {
              proxyKind: "traefik",
              domains: ["workspace-demo.example.test"],
              pathPrefix: "/",
              tlsMode: "auto",
              targetPort: 3000,
            },
          ],
          metadata: {
            publicUrl: "https://workspace-demo.example.test",
          },
        },
        target: {
          kind: "single-server",
          providerKey: "generic-ssh",
          serverIds: [input.serverId],
        },
        detectSummary: "mocked in bun webview",
        steps: ["detect", "plan", "deploy", "verify"],
        generatedAt: "2026-01-01T00:00:00.000Z",
      },
      environmentSnapshot: {
        id: `snap_${input.deploymentId}`,
        environmentId: input.environmentId,
        createdAt: "2026-01-01T00:00:00.000Z",
        precedence: ["defaults", "project", "environment", "deployment"],
        variables: [],
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      startedAt: "2026-01-01T00:00:01.000Z",
      finishedAt: "2026-01-01T00:00:03.000Z",
      logCount: 2,
    },
    status: {
      current: status,
      createdAt: "2026-01-01T00:00:00.000Z",
      startedAt: "2026-01-01T00:00:01.000Z",
      finishedAt: "2026-01-01T00:00:03.000Z",
    },
    relatedContext: {
      project: {
        id: input.projectId,
        name: input.projectId === "prj_static" ? "Static Project" : "Demo",
        slug: input.projectId === "prj_static" ? "static-project" : "demo",
      },
      environment: {
        id: input.environmentId,
        name: input.environmentId === "env_static" ? "preview" : "production",
        kind: input.environmentId === "env_static" ? "preview" : "production",
      },
      resource: {
        id: input.resourceId,
        name: input.resourceId === "res_static" ? "docs-site" : "workspace",
        slug: input.resourceId === "res_static" ? "docs-site" : "workspace",
        kind: input.resourceId === "res_static" ? "static-site" : "application",
      },
      server: {
        id: input.serverId,
        name: input.serverId === "srv_static" ? "static-edge" : "edge",
        host: "127.0.0.1",
        port: 22,
        providerKey: "generic-ssh",
        lifecycleStatus: "active",
      },
      destination: {
        id: input.destinationId,
      },
    },
    snapshot: {
      runtimePlan: {
        id: `plan_${input.deploymentId}`,
        source: {
          kind: "git-public",
          locator: input.sourceLocator,
          displayName: input.sourceDisplayName,
        },
        buildStrategy: "workspace-commands",
        packagingMode: "host-process-runtime",
        execution: {
          kind: "host-process",
          port: 3000,
        },
        target: {
          kind: "single-server",
          providerKey: "generic-ssh",
          serverIds: [input.serverId],
        },
        detectSummary: "mocked in bun webview",
        steps: ["detect", "plan", "deploy", "verify"],
        generatedAt: "2026-01-01T00:00:00.000Z",
      },
      environmentSnapshot: {
        id: `snap_${input.deploymentId}`,
        environmentId: input.environmentId,
        createdAt: "2026-01-01T00:00:00.000Z",
        precedence: ["defaults", "project", "environment", "deployment"],
        variables: [],
      },
    },
    timeline: {
      createdAt: "2026-01-01T00:00:00.000Z",
      startedAt: "2026-01-01T00:00:01.000Z",
      finishedAt: "2026-01-01T00:00:03.000Z",
      logCount: 2,
    },
    nextActions: ["logs", "resource-detail", "resource-health", "diagnostic-summary"],
    sectionErrors: input.sectionErrors ?? [],
    generatedAt: "2026-01-01T00:00:04.000Z",
  };
}

function deploymentLogsFixture(deploymentId: string) {
  return {
    deploymentId,
    logs: [
      {
        timestamp: "2026-01-01T00:00:01.000Z",
        source: "appaloft",
        level: "info",
        phase: "plan",
        message: `Planning deployment ${deploymentId}`,
      },
      {
        timestamp: "2026-01-01T00:00:03.000Z",
        source: "application",
        level: "info",
        phase: "verify",
        message: `Application is ready for ${deploymentId}`,
      },
    ],
  };
}

function deploymentEventReplayFixture(
  deploymentId: string,
  status: "running" | "succeeded" = "succeeded",
) {
  const envelopes = [
    {
      schemaVersion: "deployments.stream-events/v1",
      kind: "event" as const,
      event: {
        deploymentId,
        sequence: 1,
        cursor: `${deploymentId}:1`,
        emittedAt: "2026-01-01T00:00:01.000Z",
        source: "progress-projection" as const,
        eventType: "deployment-requested",
        phase: "detect" as const,
        summary: "Deployment requested",
      },
    },
    {
      schemaVersion: "deployments.stream-events/v1",
      kind: "event" as const,
      event: {
        deploymentId,
        sequence: 2,
        cursor: `${deploymentId}:2`,
        emittedAt: "2026-01-01T00:00:02.000Z",
        source: "progress-projection" as const,
        eventType: "build-requested",
        phase: "plan" as const,
        summary: "Build requested",
      },
    },
  ];

  if (status === "running") {
    return {
      deploymentId,
      envelopes,
    };
  }

  return {
    deploymentId,
    envelopes: [
      ...envelopes,
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "event" as const,
        event: {
          deploymentId,
          sequence: 3,
          cursor: `${deploymentId}:3`,
          emittedAt: "2026-01-01T00:00:03.000Z",
          source: "domain-event" as const,
          eventType: "deployment-succeeded",
          phase: "verify" as const,
          summary: "Deployment succeeded",
        },
      },
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "closed" as const,
        reason: "completed" as const,
        cursor: `${deploymentId}:3`,
      },
    ],
  };
}

function deploymentEventStreamFixture(deploymentId: string): Response {
  const envelopes = [
    {
      schemaVersion: "deployments.stream-events/v1",
      kind: "event",
      event: {
        deploymentId,
        sequence: 3,
        cursor: `${deploymentId}:3`,
        emittedAt: "2026-01-01T00:00:03.000Z",
        source: "domain-event",
        eventType: "deployment-succeeded",
        phase: "verify",
        summary: "Deployment succeeded",
      },
    },
    {
      schemaVersion: "deployments.stream-events/v1",
      kind: "closed",
      reason: "completed",
      cursor: `${deploymentId}:3`,
    },
  ];

  const body = [
    ": ",
    "",
    ...envelopes.flatMap((envelope) => ["event: message", `data: ${JSON.stringify(envelope)}`, ""]),
  ].join("\n");

  return new Response(body, {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "no-cache",
      "content-type": "text/event-stream",
    },
  });
}

type ServerCredentialFixture =
  | {
      kind: "local-ssh-agent";
      username?: string;
      publicKeyConfigured: boolean;
      privateKeyConfigured: boolean;
    }
  | {
      kind: "ssh-private-key";
      credentialId?: string;
      credentialName?: string;
      username?: string;
      publicKeyConfigured: boolean;
      privateKeyConfigured: boolean;
    };

type SshCredentialUsageServerFixture = {
  serverId: string;
  serverName: string;
  lifecycleStatus: "active" | "inactive";
  providerKey: string;
  host: string;
  username?: string;
};

function sshCredentialDetailFixture(input: {
  credentialId: string;
  name: string;
  username?: string;
  publicKeyConfigured?: boolean;
  privateKeyConfigured?: boolean;
  usageServers?: SshCredentialUsageServerFixture[];
}) {
  const servers = input.usageServers ?? [];

  return {
    schemaVersion: "credentials.show/v1",
    credential: {
      id: input.credentialId,
      name: input.name,
      kind: "ssh-private-key",
      ...(input.username ? { username: input.username } : {}),
      publicKeyConfigured: input.publicKeyConfigured ?? true,
      privateKeyConfigured: input.privateKeyConfigured ?? true,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    usage: {
      totalServers: servers.length,
      activeServers: servers.filter((server) => server.lifecycleStatus === "active").length,
      inactiveServers: servers.filter((server) => server.lifecycleStatus === "inactive").length,
      servers,
    },
    generatedAt: "2026-01-01T00:00:02.000Z",
  };
}

function serverDetailFixture(
  serverId = "srv_demo",
  input: {
    edgeProxyKind?: "none" | "traefik" | "caddy";
    edgeProxyStatus?: "pending" | "starting" | "ready" | "failed" | "disabled";
    credential?: ServerCredentialFixture;
    name?: string;
  } = {},
) {
  const isStaticServer = serverId === "srv_static";

  return {
    schemaVersion: "servers.show/v1",
    server: {
      id: serverId,
      name: input.name ?? (isStaticServer ? "static-edge" : "edge"),
      host: "127.0.0.1",
      port: 22,
      providerKey: "generic-ssh",
      lifecycleStatus: "active",
      edgeProxy: {
        kind: input.edgeProxyKind ?? "traefik",
        status: input.edgeProxyStatus ?? "ready",
        lastAttemptAt: "2026-01-01T00:00:00.000Z",
        lastSucceededAt: "2026-01-01T00:00:01.000Z",
      },
      credential: input.credential ?? {
        kind: "local-ssh-agent",
        username: "deployer",
        publicKeyConfigured: false,
        privateKeyConfigured: false,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    rollups: {
      resources: {
        total: isStaticServer ? 1 : 2,
        deployedResourceIds: isStaticServer ? ["res_static"] : ["res_demo", "res_api"],
      },
      deployments: {
        total: isStaticServer ? 1 : 3,
        statusCounts: [
          {
            status: "succeeded",
            count: isStaticServer ? 1 : 2,
          },
          ...(isStaticServer
            ? []
            : [
                {
                  status: "running",
                  count: 1,
                },
              ]),
        ],
        latestDeploymentId: isStaticServer ? "dep_static" : "dep_demo",
        latestDeploymentStatus: "succeeded",
      },
      domains: {
        total: isStaticServer ? 0 : 1,
        statusCounts: isStaticServer
          ? []
          : [
              {
                status: "ready",
                count: 1,
              },
            ],
        ...(isStaticServer
          ? {}
          : {
              latestDomainBindingId: "dbn_demo",
              latestDomainBindingStatus: "ready",
            }),
      },
    },
    generatedAt: "2026-01-01T00:00:02.000Z",
  };
}

const apiResponses: Record<ApiScenario, Record<string, ApiRoute>> = {
  dashboard: {
    "/api/health": {
      status: "ok",
      service: "appaloft",
      version: "0.1.0-test",
      timestamp: "2026-01-01T00:00:00.000Z",
    },
    "/api/readiness": {
      status: "ready",
      checks: {
        database: true,
        migrations: true,
      },
      details: {
        databaseDriver: "pglite",
      },
    },
    "/api/version": {
      name: "Appaloft",
      version: "0.1.0-test",
      apiVersion: "v1",
      mode: "self-hosted",
    },
    "/api/auth/session": {
      enabled: true,
      provider: "better-auth",
      loginRequired: false,
      deferredAuth: true,
      session: null,
      providers: [
        {
          key: "github",
          title: "GitHub",
          configured: false,
          connected: false,
          requiresSignIn: true,
          deferred: true,
          reason: "Configure GitHub OAuth to enable import.",
        },
      ],
    },
    "/api/rpc/projects/list": {
      json: {
        items: [
          {
            id: "prj_demo",
            name: "Demo",
            slug: "demo",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
    "/api/rpc/servers/list": {
      json: {
        items: [
          {
            id: "srv_demo",
            name: "edge",
            host: "127.0.0.1",
            port: 22,
            providerKey: "generic-ssh",
            lifecycleStatus: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
    "/api/rpc/servers/show": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverId?: string } | null;
      return {
        json: serverDetailFixture(input?.serverId ?? "srv_demo"),
      };
    },
    "/api/rpc/servers/rename": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverId?: string } | null;
      return {
        json: {
          id: input?.serverId ?? "srv_demo",
        },
      };
    },
    "/api/rpc/servers/configureEdgeProxy": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as {
        proxyKind?: "none" | "traefik" | "caddy";
        serverId?: string;
      } | null;
      return {
        json: {
          id: input?.serverId ?? "srv_demo",
          edgeProxy: {
            kind: input?.proxyKind ?? "traefik",
            status: input?.proxyKind === "none" ? "disabled" : "pending",
          },
        },
      };
    },
    "/api/rpc/servers/deleteCheck": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverId?: string } | null;
      return {
        json: {
          schemaVersion: "servers.delete-check/v1",
          serverId: input?.serverId ?? "srv_demo",
          lifecycleStatus: "active",
          eligible: false,
          blockers: [
            {
              kind: "active-server",
              relatedEntityId: input?.serverId ?? "srv_demo",
              relatedEntityType: "server",
              count: 1,
            },
          ],
          checkedAt: "2026-01-01T00:00:10.000Z",
        },
      };
    },
    "/api/rpc/environments/list": {
      json: {
        items: [
          {
            id: "env_demo",
            projectId: "prj_demo",
            name: "production",
            kind: "production",
            lifecycleStatus: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
            maskedVariables: [
              {
                key: "DATABASE_URL",
                value: "****",
                scope: "environment",
                exposure: "runtime",
                isSecret: true,
                kind: "secret",
              },
            ],
          },
        ],
      },
    },
    "/api/rpc/resources/list": {
      json: {
        items: [
          {
            id: "res_demo",
            projectId: "prj_demo",
            environmentId: "env_demo",
            destinationId: "dst_demo",
            name: "workspace",
            slug: "workspace",
            kind: "application",
            services: [
              {
                name: "web",
                kind: "web",
              },
            ],
            deploymentCount: 1,
            lastDeploymentId: "dep_demo",
            lastDeploymentStatus: "succeeded",
            networkProfile: {
              internalPort: 3000,
              upstreamProtocol: "http",
              exposureMode: "reverse-proxy",
            },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
    "/api/rpc/resources/show": {
      json: {
        schemaVersion: "resources.show/v1",
        resource: {
          id: "res_demo",
          projectId: "prj_demo",
          environmentId: "env_demo",
          destinationId: "dst_demo",
          name: "workspace",
          slug: "workspace",
          kind: "application",
          services: [
            {
              name: "web",
              kind: "web",
            },
          ],
          deploymentCount: 1,
          lastDeploymentId: "dep_demo",
          lastDeploymentStatus: "succeeded",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        source: {
          kind: "local-folder",
          locator: ".",
          displayName: "workspace",
        },
        runtimeProfile: {
          strategy: "workspace-commands",
          startCommand: "bun run start",
          healthCheckPath: "/health",
        },
        networkProfile: {
          internalPort: 3000,
          upstreamProtocol: "http",
          exposureMode: "reverse-proxy",
        },
        healthPolicy: {
          enabled: true,
          type: "http",
          intervalSeconds: 5,
          timeoutSeconds: 5,
          retries: 10,
          startPeriodSeconds: 5,
          http: {
            method: "GET",
            scheme: "http",
            host: "localhost",
            path: "/health",
            expectedStatusCode: 200,
          },
        },
        accessSummary: {
          proxyRouteStatus: "ready",
          lastRouteRealizationDeploymentId: "dep_demo",
        },
        latestDeployment: {
          id: "dep_demo",
          status: "succeeded",
          createdAt: "2026-01-01T00:00:00.000Z",
          serverId: "srv_demo",
          destinationId: "dst_demo",
        },
        lifecycle: {
          status: "active",
        },
        diagnostics: [],
        generatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
    "/api/rpc/resources/health": {
      json: {
        schemaVersion: "resources.health/v1",
        resourceId: "res_demo",
        generatedAt: "2026-01-01T00:00:00.000Z",
        observedAt: "2026-01-01T00:00:00.000Z",
        overall: "healthy",
        runtime: {
          lifecycle: "running",
          health: "healthy",
          observedAt: "2026-01-01T00:00:00.000Z",
          runtimeKind: "docker-container",
        },
        healthPolicy: {
          status: "configured",
          enabled: true,
          type: "http",
          path: "/health",
          expectedStatusCode: 200,
          intervalSeconds: 5,
          timeoutSeconds: 5,
          retries: 10,
          startPeriodSeconds: 5,
        },
        publicAccess: {
          status: "ready",
          url: "http://workspace-demo.example.test",
          kind: "generated-latest",
        },
        proxy: {
          status: "ready",
          providerKey: "traefik",
          lastRouteRealizationDeploymentId: "dep_demo",
        },
        checks: [],
        sourceErrors: [],
      },
    },
    "/api/rpc/resources/proxyConfiguration": {
      json: {
        resourceId: "res_demo",
        deploymentId: "dep_demo",
        providerKey: "traefik",
        routeScope: "latest",
        status: "planned",
        generatedAt: "2026-01-01T00:00:00.000Z",
        stale: false,
        routes: [],
        sections: [],
        warnings: [],
      },
    },
    "/api/rpc/resources/configureNetwork": {
      json: {
        id: "res_demo",
      },
    },
    "/api/rpc/resources/configureRuntime": {
      json: {
        id: "res_demo",
      },
    },
    "/api/rpc/resources/configureSource": {
      json: {
        id: "res_demo",
      },
    },
    "/api/rpc/resources/effectiveConfig": {
      json: {
        schemaVersion: "resources.effective-config/v1",
        resourceId: "res_demo",
        environmentId: "env_demo",
        ownedEntries: [
          {
            key: "DATABASE_URL",
            value: "****",
            scope: "resource",
            exposure: "runtime",
            isSecret: true,
            kind: "secret",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        effectiveEntries: [
          {
            key: "DATABASE_URL",
            value: "****",
            scope: "resource",
            exposure: "runtime",
            isSecret: true,
            kind: "secret",
          },
          {
            key: "PUBLIC_BASE_URL",
            value: "https://env.example.test",
            scope: "environment",
            exposure: "build-time",
            isSecret: false,
            kind: "plain-config",
          },
        ],
        precedence: [
          "defaults",
          "system",
          "organization",
          "project",
          "environment",
          "resource",
          "deployment",
        ],
        generatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
    "/api/rpc/resources/setVariable": {
      json: null,
    },
    "/api/rpc/resources/unsetVariable": {
      json: null,
    },
    "/api/rpc/resources/archive": {
      json: {
        id: "res_demo",
      },
    },
    "/api/rpc/environments/archive": {
      json: {
        id: "env_demo",
      },
    },
    "/api/rpc/resources/delete": {
      json: {
        id: "res_demo",
      },
    },
    "/api/rpc/domainBindings/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/certificates/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/deployments/list": {
      json: {
        items: [
          {
            id: "dep_demo",
            projectId: "prj_demo",
            environmentId: "env_demo",
            resourceId: "res_demo",
            serverId: "srv_demo",
            destinationId: "dst_demo",
            status: "succeeded",
            runtimePlan: {
              id: "plan_demo",
              source: {
                kind: "local-folder",
                locator: ".",
                displayName: "workspace",
              },
              buildStrategy: "dockerfile",
              packagingMode: "all-in-one-docker",
              execution: {
                kind: "docker-container",
                image: "demo:test",
                port: 3000,
              },
              target: {
                kind: "single-server",
                providerKey: "generic-ssh",
                serverIds: ["srv_demo"],
              },
              detectSummary: "mocked in bun webview",
              steps: ["package", "deploy", "verify"],
              generatedAt: "2026-01-01T00:00:00.000Z",
            },
            environmentSnapshot: {
              id: "snap_demo",
              environmentId: "env_demo",
              createdAt: "2026-01-01T00:00:00.000Z",
              precedence: [
                "defaults",
                "system",
                "organization",
                "project",
                "environment",
                "deployment",
              ],
              variables: [],
            },
            logs: [],
            logCount: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
    "/api/rpc/deployments/show": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { deploymentId?: string } | null;
      const deploymentId = input?.deploymentId ?? "dep_demo";

      return {
        json:
          deploymentId === "dep_new"
            ? deploymentDetailFixture({
                deploymentId: "dep_new",
                projectId: "prj_demo",
                environmentId: "env_demo",
                resourceId: "res_demo",
                serverId: "srv_demo",
                destinationId: "dst_demo",
                sourceDisplayName: "workspace",
                sourceLocator: "https://github.com/acme/platform.git",
              })
            : deploymentDetailFixture({
                deploymentId: "dep_demo",
                projectId: "prj_demo",
                environmentId: "env_demo",
                resourceId: "res_demo",
                serverId: "srv_demo",
                destinationId: "dst_demo",
                sourceDisplayName: "workspace",
                sourceLocator: "https://github.com/acme/platform.git",
              }),
      };
    },
    "/api/rpc/deployments/logs": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { deploymentId?: string } | null;
      return {
        json: deploymentLogsFixture(input?.deploymentId ?? "dep_demo"),
      };
    },
    "/api/rpc/deployments/events": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { deploymentId?: string } | null;
      return {
        json: deploymentEventReplayFixture(input?.deploymentId ?? "dep_demo"),
      };
    },
    "/api/rpc/deployments/eventsStream": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { deploymentId?: string } | null;
      return deploymentEventStreamFixture(input?.deploymentId ?? "dep_demo");
    },
    "/api/deployments": {
      id: "dep_new",
    },
    "/api/rpc/providers/list": {
      json: {
        items: [
          {
            key: "generic-ssh",
            title: "Generic SSH",
            category: "deploy-target",
            capabilities: ["ssh", "single-server"],
          },
        ],
      },
    },
    "/api/rpc/credentials/ssh/list": {
      json: {
        items: [],
      },
    },
  },
  "github-connected": {
    "/api/health": {
      status: "ok",
      service: "appaloft",
      version: "0.1.0-test",
      timestamp: "2026-01-01T00:00:00.000Z",
    },
    "/api/readiness": {
      status: "ready",
      checks: {
        database: true,
        migrations: true,
      },
      details: {
        databaseDriver: "pglite",
      },
    },
    "/api/version": {
      name: "Appaloft",
      version: "0.1.0-test",
      apiVersion: "v1",
      mode: "self-hosted",
    },
    "/api/auth/session": {
      enabled: true,
      provider: "better-auth",
      loginRequired: false,
      deferredAuth: true,
      session: {
        user: {
          name: "octocat",
          email: "octocat@example.com",
        },
      },
      providers: [
        {
          key: "github",
          title: "GitHub",
          configured: true,
          connected: true,
          requiresSignIn: true,
          deferred: true,
          connectPath: "/api/auth/sign-in/social",
        },
      ],
    },
    "/api/rpc/projects/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/servers/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/environments/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/deployments/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/resources/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/domainBindings/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/certificates/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/providers/list": {
      json: {
        items: [
          {
            key: "generic-ssh",
            title: "Generic SSH",
            category: "deploy-target",
            capabilities: ["ssh", "single-server"],
          },
        ],
      },
    },
    "/api/rpc/credentials/ssh/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/integrations/github/repositories/list": {
      json: {
        items: [
          {
            id: "repo_platform",
            name: "platform",
            fullName: "acme/platform",
            ownerLogin: "acme",
            description: "Primary deployment control plane",
            defaultBranch: "main",
            htmlUrl: "https://github.com/acme/platform",
            cloneUrl: "https://github.com/acme/platform.git",
            private: true,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
  },
  "static-quick-deploy": {
    "/api/health": {
      status: "ok",
      service: "appaloft",
      version: "0.1.0-test",
      timestamp: "2026-01-01T00:00:00.000Z",
    },
    "/api/readiness": {
      status: "ready",
      checks: {
        database: true,
        migrations: true,
      },
      details: {
        databaseDriver: "pglite",
      },
    },
    "/api/version": {
      name: "Appaloft",
      version: "0.1.0-test",
      apiVersion: "v1",
      mode: "self-hosted",
    },
    "/api/auth/session": {
      enabled: true,
      provider: "better-auth",
      loginRequired: false,
      deferredAuth: true,
      session: null,
      providers: [
        {
          key: "github",
          title: "GitHub",
          configured: false,
          connected: false,
          requiresSignIn: true,
          deferred: true,
          reason: "Configure GitHub OAuth to enable import.",
        },
      ],
    },
    "/api/rpc/projects/list": {
      json: {
        items: [
          {
            id: "prj_static",
            name: "Static Project",
            slug: "static-project",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
    "/api/rpc/servers/list": {
      json: {
        items: [
          {
            id: "srv_static",
            name: "static-edge",
            host: "127.0.0.1",
            port: 22,
            providerKey: "generic-ssh",
            lifecycleStatus: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
    "/api/rpc/environments/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/deployments/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/resources/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/domainBindings/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/certificates/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/providers/list": {
      json: {
        items: [
          {
            key: "generic-ssh",
            title: "Generic SSH",
            category: "deploy-target",
            capabilities: ["ssh", "single-server"],
          },
        ],
      },
    },
    "/api/rpc/credentials/ssh/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/environments/create": {
      json: {
        id: "env_static",
      },
    },
    "/api/rpc/resources/create": {
      json: {
        id: "res_static",
      },
    },
    "/api/deployments": {
      id: "dep_static",
    },
    "/api/rpc/deployments/show": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { deploymentId?: string } | null;
      return {
        json: deploymentDetailFixture({
          deploymentId: input?.deploymentId ?? "dep_static",
          projectId: "prj_static",
          environmentId: "env_static",
          resourceId: "res_static",
          serverId: "srv_static",
          destinationId: "dst_static",
          sourceDisplayName: "docs-site",
          sourceLocator: "https://github.com/acme/docs-site.git",
        }),
      };
    },
    "/api/rpc/deployments/logs": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { deploymentId?: string } | null;
      return {
        json: deploymentLogsFixture(input?.deploymentId ?? "dep_static"),
      };
    },
    "/api/rpc/deployments/events": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { deploymentId?: string } | null;
      return {
        json: deploymentEventReplayFixture(input?.deploymentId ?? "dep_static"),
      };
    },
    "/api/rpc/deployments/eventsStream": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { deploymentId?: string } | null;
      return deploymentEventStreamFixture(input?.deploymentId ?? "dep_static");
    },
  },
};

let activeScenario: ApiScenario = "dashboard";
const recordedApiRequests: RecordedApiRequest[] = [];
let apiServer: ReturnType<typeof Bun.serve> | null = null;
let previewProcess: ReturnType<typeof Bun.spawn> | null = null;
let previewUrl = "";
let previewLogs = "";

function respondJson(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      ...init?.headers,
    },
  });
}

async function readRequestBody(request: Request): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") {
    return null;
  }

  const text = await request.text().catch(() => "");
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function resetRecordedApiRequests(): void {
  recordedApiRequests.length = 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiRouteHandler(value: ApiRoute): value is ApiRouteHandler {
  return typeof value === "function";
}

function readOrpcJsonPayload(body: unknown): unknown {
  if (isRecord(body) && "json" in body) {
    return body.json;
  }

  return body;
}

async function readProcessStream(stream: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!stream) {
    return;
  }

  for await (const chunk of stream) {
    previewLogs += new TextDecoder().decode(chunk);
  }
}

function toReadableStream(stream: unknown): ReadableStream<Uint8Array> | null {
  if (stream instanceof ReadableStream) {
    return stream as ReadableStream<Uint8Array>;
  }

  return null;
}

async function waitForPreview(url: string): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await Bun.sleep(100);
    }
  }

  throw new Error(`Vite preview did not start at ${url}\n${previewLogs}`);
}

function reservePort(): number {
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("reserved"),
  });
  const { port } = server;
  server.stop(true);

  if (port === undefined) {
    throw new Error("Could not reserve a free preview port.");
  }

  return port;
}

async function setupWebApp(): Promise<void> {
  apiServer = Bun.serve({
    port: 0,
    async fetch(request) {
      if (request.method === "OPTIONS") {
        return respondJson(null);
      }

      const { pathname } = new URL(request.url);
      const requestBody = await readRequestBody(request);
      recordedApiRequests.push({
        method: request.method,
        pathname,
        body: requestBody,
      });

      if (pathname.startsWith("/api/deployment-progress/")) {
        return new Response("", {
          headers: {
            "access-control-allow-origin": "*",
            "content-type": "text/event-stream",
          },
        });
      }

      const configuredRoute = apiResponses[activeScenario][pathname];

      if (configuredRoute === undefined) {
        return respondJson({ error: `Unhandled test API route: ${pathname}` }, { status: 404 });
      }

      const response = isApiRouteHandler(configuredRoute)
        ? await configuredRoute(request, requestBody)
        : configuredRoute;

      if (response instanceof Response) {
        return response;
      }

      return respondJson(response);
    },
  });

  const previewPort = reservePort();
  previewUrl = `http://127.0.0.1:${previewPort}`;
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
    cwd: import.meta.dir.replace(/\/test\/e2e-webview$/, ""),
    env: {
      ...process.env,
      APPALOFT_WEB_DEV_PROXY_TARGET: `http://127.0.0.1:${apiServer.port}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  void readProcessStream(toReadableStream(previewProcess.stdout));
  void readProcessStream(toReadableStream(previewProcess.stderr));

  await waitForPreview(previewUrl);
}

async function teardownWebApp(): Promise<void> {
  previewProcess?.kill();
  await previewProcess?.exited.catch(() => {});
  previewProcess = null;

  apiServer?.stop(true);
  apiServer = null;

  Bun.WebView.closeAll();
}

function createWebView(): Bun.WebView {
  return new Bun.WebView({
    width: 1280,
    height: 900,
    ...(process.platform === "darwin" ? {} : { backend: "chrome" as const }),
    console: (type, ...args) => {
      if (type === "error") {
        previewLogs += `\n[page console.error] ${args.map(String).join(" ")}`;
      }
    },
  });
}

async function waitFor<T>(
  read: () => Promise<T>,
  matches: (value: T) => boolean,
  failureMessage: string,
): Promise<T> {
  const deadline = Date.now() + 7_000;
  let lastValue: T | undefined;

  while (Date.now() < deadline) {
    lastValue = await read();
    if (matches(lastValue)) {
      return lastValue;
    }
    await Bun.sleep(100);
  }

  throw new Error(`${failureMessage}\nLast value: ${String(lastValue)}\n${previewLogs}`);
}

async function pageText(view: Bun.WebView): Promise<string> {
  return view.evaluate<string>("document.body.innerText");
}

async function locationPath(view: Bun.WebView): Promise<string> {
  return view.evaluate<string>("window.location.pathname + window.location.search");
}

async function expectText(view: Bun.WebView, text: string): Promise<void> {
  await waitFor(
    () => pageText(view),
    (content) => content.includes(text),
    `Expected page to contain text: ${text}`,
  );
}

async function expectAnyText(view: Bun.WebView, texts: [string, ...string[]]): Promise<void> {
  await waitFor(
    () => pageText(view),
    (content) => texts.some((text) => content.includes(text)),
    `Expected page to contain one of: ${texts.join(" | ")}`,
  );
}

async function expectLocation(view: Bun.WebView, expected: string): Promise<void> {
  await waitFor(
    () => locationPath(view),
    (path) => path === expected,
    `Expected location to be ${expected}`,
  );
}

async function waitForRecordedRequest(pathname: string): Promise<RecordedApiRequest> {
  const request = await waitFor<RecordedApiRequest | null>(
    async () => recordedApiRequests.find((request) => request.pathname === pathname) ?? null,
    (request) => request !== null,
    `Expected API request: ${pathname}\nRecorded: ${recordedApiRequests
      .map((request) => `${request.method} ${request.pathname}`)
      .join(", ")}`,
  );

  if (!request) {
    throw new Error(`Expected API request: ${pathname}`);
  }

  return request;
}

async function clickButtonByText(view: Bun.WebView, text: string): Promise<void> {
  const found = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const elements = Array.from(document.querySelectorAll("button, a"));
          const element = elements.find((candidate) => candidate.textContent?.includes(${JSON.stringify(text)}));
          if (!element) {
            return false;
          }
          element.click();
          return true;
        })()`,
      ),
    Boolean,
    `Expected a button or link with text: ${text}`,
  );

  expect(found).toBe(true);
}

async function clickButtonByAnyText(
  view: Bun.WebView,
  texts: [string, ...string[]],
): Promise<void> {
  const found = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const texts = ${JSON.stringify(texts)};
          const elements = Array.from(document.querySelectorAll("button, a"));
          const element = elements.find((candidate) =>
            texts.some((text) => candidate.textContent?.includes(text))
          );
          if (!element) {
            return false;
          }
          element.click();
          return true;
        })()`,
      ),
    Boolean,
    `Expected a button or link with one of: ${texts.join(" | ")}`,
  );

  expect(found).toBe(true);
}

async function clickLinkByHref(view: Bun.WebView, hrefFragment: string): Promise<void> {
  const found = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const anchor = Array.from(document.querySelectorAll("a")).find((candidate) =>
            candidate.getAttribute("href")?.includes(${JSON.stringify(hrefFragment)})
          );
          if (!(anchor instanceof HTMLAnchorElement)) {
            return false;
          }
          anchor.click();
          return true;
        })()`,
      ),
    Boolean,
    `Expected a link containing href fragment: ${hrefFragment}`,
  );

  expect(found).toBe(true);
}

async function setInputValue(view: Bun.WebView, selector: string, value: string): Promise<void> {
  const found = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const input = document.querySelector(${JSON.stringify(selector)});
          if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
            return false;
          }
          input.value = ${JSON.stringify(value)};
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        })()`,
      ),
    Boolean,
    `Expected input: ${selector}`,
  );

  expect(found).toBe(true);
}

async function clickFormSubmit(view: Bun.WebView, selector: string): Promise<void> {
  const found = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const form = document.querySelector(${JSON.stringify(selector)});
          const button = form?.querySelector("button[type='submit']");
          if (!(button instanceof HTMLButtonElement)) {
            return false;
          }
          button.click();
          return true;
        })()`,
      ),
    Boolean,
    `Expected submit button in form: ${selector}`,
  );

  expect(found).toBe(true);
}

beforeAll(async () => {
  await setupWebApp();
}, 20_000);

afterAll(async () => {
  await teardownWebApp();
}, 20_000);

describe("console e2e with Bun.WebView", () => {
  test("renders the console dashboard with mocked control-plane data", async () => {
    activeScenario = "dashboard";

    await using view = createWebView();
    await view.navigate(`${previewUrl}/`);

    await expectAnyText(view, ["Latest deployment", "最近部署"]);
    await expectAnyText(view, ["New deployment", "新部署"]);
    await expectAnyText(view, ["View projects", "查看项目"]);
    await expectAnyText(view, ["View deployments", "查看部署"]);
    await expectText(view, "Demo");
    await expectText(view, "succeeded");
    await expectText(view, "v0.1.0-test");

    await view.navigate(`${previewUrl}/projects`);
    await expectAnyText(view, ["Projects", "项目"]);
    await expectText(view, "Demo");
    await expectAnyText(view, ["Resources", "资源"]);
    await expectText(view, "workspace");

    await view.navigate(`${previewUrl}/deployments`);
    await expectText(view, "workspace");
    await expectText(view, "Demo");
    await expectText(view, "production");
    await expectText(view, "succeeded");

    await clickButtonByAnyText(view, ["New deployment", "新部署"]);
    await expectAnyText(view, ["Local folder", "本地目录"]);
    await clickButtonByAnyText(view, ["GitHub repository", "GitHub 仓库"]);
    await clickButtonByAnyText(view, ["Choose from my GitHub", "从我的 GitHub 选择"]);
    await expectAnyText(view, [
      "GitHub OAuth is not configured on the backend.",
      "后端尚未配置 GitHub OAuth",
    ]);
  }, 15_000);

  test("[RES-PROFILE-ENTRY-001] loads resource detail through resources.show", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo`);

    await expectAnyText(view, ["Network profile", "网络配置"]);

    const showRequest = await waitForRecordedRequest("/api/rpc/resources/show");
    const showInput = readOrpcJsonPayload(showRequest.body);

    expect(showInput).toEqual({
      resourceId: "res_demo",
      includeLatestDeployment: true,
      includeAccessSummary: true,
      includeProfileDiagnostics: true,
    });
  }, 15_000);

  test("[RES-PROFILE-ENTRY-002] submits resource network profile changes through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo`);

    await expectAnyText(view, ["Network profile", "网络配置"]);
    await setInputValue(view, "#resource-network-internal-port", "8080");
    await clickFormSubmit(view, "#resource-network-profile-form");

    const configureNetworkRequest = await waitForRecordedRequest(
      "/api/rpc/resources/configureNetwork",
    );
    const configureNetworkInput = readOrpcJsonPayload(configureNetworkRequest.body);

    expect(configureNetworkInput).toEqual({
      resourceId: "res_demo",
      networkProfile: {
        internalPort: 8080,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });
  }, 15_000);

  test("[RES-PROFILE-ENTRY-002] submits resource source profile changes through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo`);

    await expectAnyText(view, ["Source profile", "来源配置"]);
    await setInputValue(view, "#resource-source-locator", "workspace-updated");
    await setInputValue(view, "#resource-source-display-name", "workspace updated");
    await clickFormSubmit(view, "#resource-source-profile-form");

    const configureSourceRequest = await waitForRecordedRequest(
      "/api/rpc/resources/configureSource",
    );
    const configureSourceInput = readOrpcJsonPayload(configureSourceRequest.body);

    expect(configureSourceInput).toEqual({
      resourceId: "res_demo",
      source: {
        kind: "local-folder",
        locator: "workspace-updated",
        displayName: "workspace updated",
      },
    });
  }, 15_000);

  test("[RES-PROFILE-ENTRY-002] submits resource runtime profile changes through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo`);

    await expectAnyText(view, ["Runtime profile", "运行时配置"]);
    await setInputValue(view, "#resource-runtime-start-command", "bun run preview");
    await setInputValue(view, "#resource-runtime-name", "preview-123");
    await clickFormSubmit(view, "#resource-runtime-profile-form");

    const configureRuntimeRequest = await waitForRecordedRequest(
      "/api/rpc/resources/configureRuntime",
    );
    const configureRuntimeInput = readOrpcJsonPayload(configureRuntimeRequest.body);

    expect(configureRuntimeInput).toEqual({
      resourceId: "res_demo",
      runtimeProfile: {
        strategy: "workspace-commands",
        startCommand: "bun run preview",
        runtimeName: "preview-123",
      },
    });
  }, 15_000);

  test("[RES-PROFILE-ENTRY-002] submits resource variable overrides through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo?section=configuration`);

    await expectAnyText(view, ["Configuration", "配置变量"]);

    const effectiveConfigRequest = await waitForRecordedRequest(
      "/api/rpc/resources/effectiveConfig",
    );
    const effectiveConfigInput = readOrpcJsonPayload(effectiveConfigRequest.body);
    expect(effectiveConfigInput).toEqual({
      resourceId: "res_demo",
    });

    await setInputValue(view, "#resource-config-key", "DATABASE_URL");
    await setInputValue(view, "#resource-config-value", "postgres://resource");
    await clickFormSubmit(view, "#resource-configuration-form");

    const setVariableRequest = await waitForRecordedRequest("/api/rpc/resources/setVariable");
    const setVariableInput = readOrpcJsonPayload(setVariableRequest.body);

    expect(setVariableInput).toEqual({
      resourceId: "res_demo",
      key: "DATABASE_URL",
      value: "postgres://resource",
      kind: "plain-config",
      exposure: "runtime",
    });
  }, 15_000);

  test("[DEP-SHOW-ENTRY-001] loads deployment detail through deployments.show and deployments.logs", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/deployments/dep_demo`);

    await expectText(view, "workspace");
    await expectAnyText(view, ["Overview", "基本信息"]);

    const showRequest = await waitForRecordedRequest("/api/rpc/deployments/show");
    const showInput = readOrpcJsonPayload(showRequest.body);
    expect(showInput).toEqual({
      deploymentId: "dep_demo",
      includeTimeline: true,
      includeSnapshot: true,
      includeRelatedContext: true,
      includeLatestFailure: true,
    });

    const logsRequest = await waitForRecordedRequest("/api/rpc/deployments/logs");
    const logsInput = readOrpcJsonPayload(logsRequest.body);
    expect(logsInput).toEqual({
      deploymentId: "dep_demo",
    });

    await view.navigate(`${previewUrl}/deployments/dep_demo?tab=logs`);
    await expectText(view, "Application is ready for dep_demo");
  }, 15_000);

  test("[SRV-LIFE-ENTRY-004] loads server detail through servers.show", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/servers/srv_demo`);

    await expectText(view, "edge");
    await expectText(view, "traefik");
    await expectAnyText(view, ["Related deployments", "关联部署"]);

    const showRequest = await waitForRecordedRequest("/api/rpc/servers/show");
    expect(showRequest.method).toBe("POST");
    expect(readOrpcJsonPayload(showRequest.body)).toEqual({
      serverId: "srv_demo",
      includeRollups: true,
    });
    expect(
      recordedApiRequests.some((request) => request.pathname === "/api/rpc/servers/list"),
    ).toBe(false);
  }, 15_000);

  test("[SSH-CRED-ENTRY-004] server detail reads credential usage and separates zero usage from unavailable usage", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousShowRoute = apiResponses.dashboard["/api/rpc/servers/show"];
    const previousCredentialShowRoute = apiResponses.dashboard["/api/rpc/credentials/ssh/show"];

    apiResponses.dashboard["/api/rpc/servers/show"] = (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverId?: string } | null;
      const serverId = input?.serverId ?? "srv_zero_usage";
      const credentialId =
        serverId === "srv_usage_unavailable" ? "cred_usage_unavailable" : "cred_zero_usage";

      return {
        json: serverDetailFixture(serverId, {
          name: serverId === "srv_usage_unavailable" ? "usage unavailable edge" : "zero usage edge",
          credential: {
            kind: "ssh-private-key",
            credentialId,
            credentialName:
              serverId === "srv_usage_unavailable" ? "Broken usage key" : "Unused deploy key",
            username: "deployer",
            publicKeyConfigured: true,
            privateKeyConfigured: true,
          },
        }),
      };
    };
    apiResponses.dashboard["/api/rpc/credentials/ssh/show"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as { credentialId?: string } | null;

      if (input?.credentialId === "cred_usage_unavailable") {
        return respondJson(
          {
            code: "infra_error",
            message: "usage read unavailable",
            phase: "credential-usage-read",
          },
          { status: 503 },
        );
      }

      return {
        json: sshCredentialDetailFixture({
          credentialId: input?.credentialId ?? "cred_zero_usage",
          name: "Unused deploy key",
          username: "deployer",
          usageServers: [],
        }),
      };
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/servers/srv_zero_usage`);

      await expectAnyText(view, ["SSH credential detail", "SSH 凭据详情"]);
      await expectText(view, "Unused deploy key");
      await expectAnyText(view, [
        "No servers currently use this credential",
        "当前没有服务器使用这个凭据",
      ]);

      const zeroUsageRequest = await waitForRecordedRequest("/api/rpc/credentials/ssh/show");
      expect(zeroUsageRequest.method).toBe("POST");
      expect(readOrpcJsonPayload(zeroUsageRequest.body)).toEqual({
        credentialId: "cred_zero_usage",
        includeUsage: true,
      });

      resetRecordedApiRequests();
      await view.navigate(`${previewUrl}/servers/srv_usage_unavailable`);

      await expectAnyText(view, ["Credential usage unavailable", "凭据使用情况暂不可用"]);

      const unavailableUsageRequest = await waitForRecordedRequest("/api/rpc/credentials/ssh/show");
      expect(unavailableUsageRequest.method).toBe("POST");
      expect(readOrpcJsonPayload(unavailableUsageRequest.body)).toEqual({
        credentialId: "cred_usage_unavailable",
        includeUsage: true,
      });
    } finally {
      apiResponses.dashboard["/api/rpc/servers/show"] = previousShowRoute;
      if (previousCredentialShowRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/credentials/ssh/show"];
      } else {
        apiResponses.dashboard["/api/rpc/credentials/ssh/show"] = previousCredentialShowRoute;
      }
    }
  }, 15_000);

  test("[SRV-LIFE-ENTRY-016] renames a server from server detail", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousShowRoute = apiResponses.dashboard["/api/rpc/servers/show"];
    const previousRenameRoute = apiResponses.dashboard["/api/rpc/servers/rename"];
    let currentServerName = "edge";

    apiResponses.dashboard["/api/rpc/servers/show"] = (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverId?: string } | null;
      return {
        json: serverDetailFixture(input?.serverId ?? "srv_demo", {
          name: currentServerName,
        }),
      };
    };
    apiResponses.dashboard["/api/rpc/servers/rename"] = (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { name?: string; serverId?: string } | null;
      currentServerName = input?.name ?? currentServerName;

      return {
        json: {
          id: input?.serverId ?? "srv_demo",
        },
      };
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/servers/srv_demo`);

      await expectText(view, "edge");
      await setInputValue(view, "#server-display-name-input", "Primary SSH server");
      await clickFormSubmit(view, "#server-rename-form");

      const renameRequest = await waitForRecordedRequest("/api/rpc/servers/rename");
      expect(renameRequest.method).toBe("POST");
      expect(readOrpcJsonPayload(renameRequest.body)).toEqual({
        serverId: "srv_demo",
        name: "Primary SSH server",
      });
      await expectText(view, "Primary SSH server");
    } finally {
      apiResponses.dashboard["/api/rpc/servers/show"] = previousShowRoute;
      apiResponses.dashboard["/api/rpc/servers/rename"] = previousRenameRoute;
    }
  }, 15_000);

  test("[SRV-LIFE-ENTRY-020] configures edge proxy intent from server detail", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousShowRoute = apiResponses.dashboard["/api/rpc/servers/show"];
    const previousConfigureRoute = apiResponses.dashboard["/api/rpc/servers/configureEdgeProxy"];
    let currentProxyKind: "none" | "traefik" | "caddy" = "traefik";
    let currentProxyStatus: "pending" | "starting" | "ready" | "failed" | "disabled" = "ready";

    apiResponses.dashboard["/api/rpc/servers/show"] = (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverId?: string } | null;
      return {
        json: serverDetailFixture(input?.serverId ?? "srv_demo", {
          edgeProxyKind: currentProxyKind,
          edgeProxyStatus: currentProxyStatus,
        }),
      };
    };
    apiResponses.dashboard["/api/rpc/servers/configureEdgeProxy"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as {
        proxyKind?: "none" | "traefik" | "caddy";
        serverId?: string;
      } | null;
      currentProxyKind = input?.proxyKind ?? currentProxyKind;
      currentProxyStatus = currentProxyKind === "none" ? "disabled" : "pending";

      return {
        json: {
          id: input?.serverId ?? "srv_demo",
          edgeProxy: {
            kind: currentProxyKind,
            status: currentProxyStatus,
          },
        },
      };
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/servers/srv_demo`);

      await expectText(view, "traefik");
      await clickButtonByText(view, "caddy");
      await clickFormSubmit(view, "#server-edge-proxy-form");

      const configureRequest = await waitForRecordedRequest("/api/rpc/servers/configureEdgeProxy");
      expect(configureRequest.method).toBe("POST");
      expect(readOrpcJsonPayload(configureRequest.body)).toEqual({
        serverId: "srv_demo",
        proxyKind: "caddy",
      });
      await expectText(view, "caddy");
    } finally {
      apiResponses.dashboard["/api/rpc/servers/show"] = previousShowRoute;
      apiResponses.dashboard["/api/rpc/servers/configureEdgeProxy"] = previousConfigureRoute;
    }
  }, 15_000);

  test("[DEP-SHOW-QRY-004] surfaces section errors as degraded deployment detail UI", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousShowRoute = apiResponses.dashboard["/api/rpc/deployments/show"];
    apiResponses.dashboard["/api/rpc/deployments/show"] = () => ({
      json: deploymentDetailFixture({
        deploymentId: "dep_demo",
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        destinationId: "dst_demo",
        sourceDisplayName: "workspace",
        sourceLocator: "https://github.com/acme/platform.git",
        sectionErrors: [
          {
            section: "related-context",
            code: "deployment_related_context_unavailable",
            category: "application",
            phase: "related-context-resolution",
            retriable: false,
            relatedEntityId: "res_demo",
          },
        ],
      }),
    });

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/deployments/dep_demo`);

      await expectAnyText(view, [
        "This deployment detail is partially available.",
        "当前部署详情为部分可用状态。",
      ]);
      await expectAnyText(view, [
        "Related project, environment, resource, or server context could not be fully resolved.",
        "关联的项目、环境、资源或服务器上下文未能完整解析。",
      ]);
    } finally {
      apiResponses.dashboard["/api/rpc/deployments/show"] = previousShowRoute;
    }
  }, 15_000);

  test("[DEP-SHOW-ENTRY-002] opens deployment detail from resource history", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo?tab=deployments`);

    await expectText(view, "workspace");
    await clickLinkByHref(view, "/deployments/dep_demo");
    await expectLocation(
      view,
      "/projects/prj_demo/environments/env_demo/resources/res_demo/deployments/dep_demo",
    );
    await expectText(view, "workspace");

    const showRequest = await waitForRecordedRequest("/api/rpc/deployments/show");
    const showInput = readOrpcJsonPayload(showRequest.body);
    expect(showInput).toEqual({
      deploymentId: "dep_demo",
      includeTimeline: true,
      includeSnapshot: true,
      includeRelatedContext: true,
      includeLatestFailure: true,
    });
  }, 15_000);

  test("[DEP-EVENTS-ENTRY-005] replays and follows deployment events on the detail timeline", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousShowRoute = apiResponses.dashboard["/api/rpc/deployments/show"];
    const previousReplayRoute = apiResponses.dashboard["/api/rpc/deployments/events"];
    const previousStreamRoute = apiResponses.dashboard["/api/rpc/deployments/eventsStream"];

    apiResponses.dashboard["/api/rpc/deployments/show"] = () => ({
      json: deploymentDetailFixture({
        deploymentId: "dep_demo",
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        destinationId: "dst_demo",
        sourceDisplayName: "workspace",
        sourceLocator: "https://github.com/acme/platform.git",
        status: "running",
      }),
    });
    apiResponses.dashboard["/api/rpc/deployments/events"] = () => ({
      json: deploymentEventReplayFixture("dep_demo", "running"),
    });
    apiResponses.dashboard["/api/rpc/deployments/eventsStream"] = () =>
      deploymentEventStreamFixture("dep_demo");

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/deployments/dep_demo?tab=timeline`);

      await expectAnyText(view, ["Timeline", "时间线"]);
      await expectText(view, "Deployment requested");
      await expectText(view, "Build requested");

      const replayRequest = await waitForRecordedRequest("/api/rpc/deployments/events");
      expect(replayRequest.method).toBe("POST");
      expect(readOrpcJsonPayload(replayRequest.body)).toEqual({
        deploymentId: "dep_demo",
        historyLimit: 100,
        includeHistory: true,
        follow: false,
        untilTerminal: true,
      });

      const streamRequest = await waitForRecordedRequest("/api/rpc/deployments/eventsStream");
      expect(streamRequest.method).toBe("POST");
      expect(readOrpcJsonPayload(streamRequest.body)).toEqual({
        deploymentId: "dep_demo",
        historyLimit: 0,
        includeHistory: false,
        follow: true,
        untilTerminal: true,
        cursor: "dep_demo:2",
      });

      const timelineText = await pageText(view);
      expect(timelineText).not.toContain("Not Found");
    } finally {
      apiResponses.dashboard["/api/rpc/deployments/show"] = previousShowRoute;
      apiResponses.dashboard["/api/rpc/deployments/events"] = previousReplayRoute;
      apiResponses.dashboard["/api/rpc/deployments/eventsStream"] = previousStreamRoute;
    }
  }, 15_000);

  test("[RES-PROFILE-ENTRY-002] submits resource archive through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo`);
    await expectAnyText(view, ["Runtime profile", "运行时配置"]);
    await view.evaluate("window.confirm = () => true");
    await clickButtonByAnyText(view, ["Archive", "归档"]);

    const archiveRequest = await waitForRecordedRequest("/api/rpc/resources/archive");
    const archiveInput = readOrpcJsonPayload(archiveRequest.body);

    expect(archiveInput).toEqual({
      resourceId: "res_demo",
    });
  }, 15_000);

  test("[ENV-LIFE-ENTRY-005] submits environment archive through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/projects/prj_demo`);
    await expectAnyText(view, ["Environments", "环境"]);
    await view.evaluate("window.confirm = () => true");
    const clicked = await waitFor(
      () =>
        view.evaluate<boolean>(
          `(() => {
            const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
              candidate.getAttribute("title") === "Archive" ||
              candidate.getAttribute("title") === "归档"
            );
            if (!(button instanceof HTMLButtonElement)) {
              return false;
            }
            button.click();
            return true;
          })()`,
        ),
      Boolean,
      "Expected environment archive button",
    );
    expect(clicked).toBe(true);

    const archiveRequest = await waitForRecordedRequest("/api/rpc/environments/archive");
    const archiveInput = readOrpcJsonPayload(archiveRequest.body);

    expect(archiveInput).toEqual({
      environmentId: "env_demo",
    });
  }, 15_000);

  test("[RES-PROFILE-ENTRY-008] submits archived resource delete through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();
    const showResponse = apiResponses.dashboard["/api/rpc/resources/show"] as {
      json: {
        lifecycle: {
          status: string;
          archivedAt?: string;
        };
      };
    };
    const previousLifecycle = { ...showResponse.json.lifecycle };
    showResponse.json.lifecycle = {
      status: "archived",
      archivedAt: "2026-01-01T00:00:00.000Z",
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/resources/res_demo`);
      await expectAnyText(view, ["Archived", "已归档"]);
      await view.evaluate("window.prompt = () => 'workspace'");
      const clicked = await waitFor(
        () =>
          view.evaluate<boolean>(
            `(() => {
              const button = document.querySelector("#resource-delete-action");
              if (!(button instanceof HTMLButtonElement)) {
                return false;
              }
              button.click();
              return true;
            })()`,
          ),
        Boolean,
        "Expected archived resource delete action",
      );
      expect(clicked).toBe(true);

      const deleteRequest = await waitForRecordedRequest("/api/rpc/resources/delete");
      const deleteInput = readOrpcJsonPayload(deleteRequest.body);

      expect(deleteInput).toEqual({
        resourceId: "res_demo",
        confirmation: {
          resourceSlug: "workspace",
        },
      });
    } finally {
      showResponse.json.lifecycle = previousLifecycle;
    }
  }, 15_000);

  test("[CERT-IMPORT-ENTRY-003] imports a manual certificate from the resource detail Web surface", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousDomainBindingsRoute = apiResponses.dashboard["/api/rpc/domainBindings/list"];
    const previousCertificatesRoute = apiResponses.dashboard["/api/rpc/certificates/list"];
    const previousImportRoute = apiResponses.dashboard["/api/rpc/certificates/import"];
    let imported = false;

    const manualBinding = {
      id: "dbn_manual",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "manual.example.test",
      pathPrefix: "/",
      proxyKind: "traefik" as const,
      tlsMode: "auto" as const,
      certificatePolicy: "manual" as const,
      verificationAttemptCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    apiResponses.dashboard["/api/rpc/domainBindings/list"] = () => ({
      json: {
        items: [
          {
            ...manualBinding,
            status: imported ? ("ready" as const) : ("bound" as const),
          },
        ],
      },
    });
    apiResponses.dashboard["/api/rpc/certificates/list"] = () => ({
      json: {
        items: imported
          ? [
              {
                id: "crt_manual",
                domainBindingId: "dbn_manual",
                domainName: "manual.example.test",
                status: "active",
                source: "imported",
                providerKey: "manual-import",
                challengeType: "manual-import",
                issuedAt: "2026-01-01T00:00:00.000Z",
                expiresAt: "2026-06-01T00:00:00.000Z",
                fingerprint: "sha256:manual-cert",
                notBefore: "2025-12-01T00:00:00.000Z",
                issuer: "CN=manual.example.test, O=Appaloft Test",
                keyAlgorithm: "rsa",
                subjectAlternativeNames: ["manual.example.test", "api.manual.example.test"],
                latestAttempt: {
                  id: "cat_manual",
                  status: "issued",
                  reason: "issue",
                  providerKey: "manual-import",
                  challengeType: "manual-import",
                  requestedAt: "2026-01-01T00:00:00.000Z",
                  issuedAt: "2026-01-01T00:00:00.000Z",
                  expiresAt: "2026-06-01T00:00:00.000Z",
                },
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            ]
          : [],
      },
    });
    apiResponses.dashboard["/api/rpc/certificates/import"] = () => {
      imported = true;
      return {
        json: {
          certificateId: "crt_manual",
          attemptId: "cat_manual",
        },
      };
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/resources/res_demo`);

      await clickButtonByAnyText(view, ["Custom domains", "自定义域名"]);
      await expectAnyText(view, ["Manual certificate", "手动证书"]);
      await clickButtonByAnyText(view, ["Import certificate", "导入证书"]);
      await setInputValue(
        view,
        "#resource-domain-binding-import-certificate-chain-dbn_manual",
        "-----BEGIN CERTIFICATE-----\nmanual\n-----END CERTIFICATE-----",
      );
      await setInputValue(
        view,
        "#resource-domain-binding-import-private-key-dbn_manual",
        "-----BEGIN PRIVATE KEY-----\nmanual\n-----END PRIVATE KEY-----",
      );
      await setInputValue(
        view,
        "#resource-domain-binding-import-passphrase-dbn_manual",
        "secret-passphrase",
      );
      await clickFormSubmit(view, "#resource-domain-binding-import-form-dbn_manual");

      const importRequest = await waitForRecordedRequest("/api/rpc/certificates/import");
      const importInput = readOrpcJsonPayload(importRequest.body);

      expect(importInput).toEqual({
        domainBindingId: "dbn_manual",
        certificateChain: "-----BEGIN CERTIFICATE-----\nmanual\n-----END CERTIFICATE-----",
        privateKey: "-----BEGIN PRIVATE KEY-----\nmanual\n-----END PRIVATE KEY-----",
        passphrase: "secret-passphrase",
      });

      await expectText(view, "crt_manual");
      await expectAnyText(view, ["Imported", "已导入"]);
      await expectAnyText(view, ["Ready", "已就绪", "就绪"]);
      await expectText(view, "api.manual.example.test");
    } finally {
      if (previousImportRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/certificates/import"];
      } else {
        apiResponses.dashboard["/api/rpc/certificates/import"] = previousImportRoute;
      }
      apiResponses.dashboard["/api/rpc/domainBindings/list"] = previousDomainBindingsRoute;
      apiResponses.dashboard["/api/rpc/certificates/list"] = previousCertificatesRoute;
    }
  }, 15_000);

  test("[CERT-IMPORT-ENTRY-004] does not offer manual import for an auto-policy binding", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousDomainBindingsRoute = apiResponses.dashboard["/api/rpc/domainBindings/list"];
    const previousCertificatesRoute = apiResponses.dashboard["/api/rpc/certificates/list"];
    apiResponses.dashboard["/api/rpc/domainBindings/list"] = {
      json: {
        items: [
          {
            id: "dbn_auto",
            projectId: "prj_demo",
            environmentId: "env_demo",
            resourceId: "res_demo",
            serverId: "srv_demo",
            destinationId: "dst_demo",
            domainName: "managed.example.test",
            pathPrefix: "/",
            proxyKind: "traefik",
            tlsMode: "auto",
            certificatePolicy: "auto",
            status: "bound",
            verificationAttemptCount: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    };
    apiResponses.dashboard["/api/rpc/certificates/list"] = {
      json: {
        items: [],
      },
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/resources/res_demo`);

      await clickButtonByAnyText(view, ["Custom domains", "自定义域名"]);
      await expectText(view, "managed.example.test");
      await expectAnyText(view, [
        "Managed issuance remains responsible for this binding.",
        "当前绑定仍由托管签发负责。",
      ]);

      const hasImportToggle = await view.evaluate<boolean>(
        "Boolean(document.querySelector('#resource-domain-binding-import-toggle-dbn_auto'))",
      );
      expect(hasImportToggle).toBe(false);
    } finally {
      apiResponses.dashboard["/api/rpc/domainBindings/list"] = previousDomainBindingsRoute;
      apiResponses.dashboard["/api/rpc/certificates/list"] = previousCertificatesRoute;
    }
  }, 15_000);

  test("shows the GitHub repository picker and fills the import wizard after auth", async () => {
    activeScenario = "github-connected";

    await using view = createWebView();
    await view.navigate(`${previewUrl}/deploy?source=github&githubMode=browser`);

    await expectAnyText(view, ["GitHub repository", "GitHub 仓库"]);
    await expectText(view, "acme/platform");
    await clickButtonByText(view, "acme/platform");

    await expectText(view, "https://github.com/acme/platform.git");
    await clickButtonByAnyText(view, ["Next", "下一步"]);
    await expectAnyText(view, ["Project", "项目"]);
    await expectText(view, "octocat");
  }, 15_000);

  test("[QUICK-DEPLOY-ENTRY-008] maps Web static site draft fields through resources.create", async () => {
    activeScenario = "static-quick-deploy";
    resetRecordedApiRequests();

    const deployState = new URL(`${previewUrl}/deploy`);
    deployState.searchParams.set("step", "review");
    deployState.searchParams.set("source", "static-site");
    deployState.searchParams.set("sourceLocator", "https://github.com/acme/docs-site.git");
    deployState.searchParams.set("staticPublishDirectory", "/dist");
    deployState.searchParams.set("staticInstallCommand", "pnpm install");
    deployState.searchParams.set("staticBuildCommand", "pnpm build");
    deployState.searchParams.set("resourceRuntimeName", "preview-456");
    deployState.searchParams.set("projectId", "prj_static");
    deployState.searchParams.set("serverId", "srv_static");

    await using view = createWebView();
    await view.navigate(deployState.toString());

    await expectAnyText(view, ["Static site", "静态站点"]);
    await expectText(view, "--method static");
    await expectText(view, "--runtime-name preview-456");
    await clickButtonByAnyText(view, ["Create and deploy", "创建并部署"]);

    const resourcesCreateRequest = await waitForRecordedRequest("/api/rpc/resources/create");
    const resourceInput = readOrpcJsonPayload(resourcesCreateRequest.body);

    expect(resourceInput).toEqual(
      expect.objectContaining({
        projectId: "prj_static",
        environmentId: "env_static",
        kind: "static-site",
        source: expect.objectContaining({
          kind: "git-public",
          locator: "https://github.com/acme/docs-site.git",
        }),
        runtimeProfile: expect.objectContaining({
          strategy: "static",
          installCommand: "pnpm install",
          buildCommand: "pnpm build",
          publishDirectory: "/dist",
          runtimeName: "preview-456",
        }),
        networkProfile: expect.objectContaining({
          internalPort: 80,
          upstreamProtocol: "http",
          exposureMode: "reverse-proxy",
        }),
      }),
    );

    const resourceRecord = resourceInput as Record<string, unknown>;
    const runtimeProfile = resourceRecord.runtimeProfile as Record<string, unknown>;
    expect(resourceRecord.deploymentMethod).toBeUndefined();
    expect(resourceRecord.port).toBeUndefined();
    expect(runtimeProfile.startCommand).toBeUndefined();

    const deploymentRequest = await waitForRecordedRequest("/api/deployments");
    expect(deploymentRequest.body).toEqual({
      projectId: "prj_static",
      serverId: "srv_static",
      environmentId: "env_static",
      resourceId: "res_static",
    });

    await clickButtonByAnyText(view, ["View deployment", "查看部署"]);
    await expectLocation(
      view,
      "/projects/prj_static/environments/env_static/resources/res_static/deployments/dep_static",
    );
    await expectText(view, "docs-site");

    const deploymentShowRequest = await waitForRecordedRequest("/api/rpc/deployments/show");
    const deploymentShowInput = readOrpcJsonPayload(deploymentShowRequest.body);
    expect(deploymentShowInput).toEqual({
      deploymentId: "dep_static",
      includeTimeline: true,
      includeSnapshot: true,
      includeRelatedContext: true,
      includeLatestFailure: true,
    });
  }, 15_000);
});
