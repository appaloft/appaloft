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
type ProjectFixture = {
  id: string;
  name: string;
  slug: string;
  description: string;
  lifecycleStatus: "active";
  createdAt: string;
};
type ServerFixture = {
  id: string;
  name: string;
  host: string;
  port: number;
  providerKey: string;
  targetKind: "single-server";
  lifecycleStatus: "active";
  createdAt: string;
};
type DependencyResourceFixtureKind = "postgres" | "redis";
type DependencyProvisioningPlanFixtureInput = {
  id: string;
  mode: "create" | "reuse";
  kind: DependencyResourceFixtureKind;
  projectId: string;
  environmentId: string;
  name: string;
  providerKey?: string;
  serverId?: string;
  endpoint?: string;
  dependencyResourceId?: string;
  status?: "planned" | "accepted" | "realized" | "failed";
  requestedAt?: string;
  acceptedAt?: string;
  completedAt?: string;
};

const fixedDockerImageDigest =
  "sha256:8b1a9953c4611296a827abf8c47804d7f6f4e6a6d7f4aaf8f6f5c6e6d7c8b9a0";

const dependencyResourceFixtureKinds: Record<
  DependencyResourceFixtureKind,
  {
    port: number;
    databaseName?: string;
  }
> = {
  postgres: {
    port: 5432,
    databaseName: "appaloft",
  },
  redis: {
    port: 6379,
  },
};

type RuntimeUsageScopeFixture =
  | { kind: "server"; serverId: string }
  | { kind: "project"; projectId: string }
  | { kind: "environment"; environmentId: string }
  | { kind: "resource"; resourceId: string }
  | { kind: "deployment"; deploymentId: string };

const selfHostedAuthE2eGeneratedPassword = "generated-local-admin-password";
let selfHostedAuthE2eAdminCreated = true;
let selfHostedAuthE2eSignedIn = true;

function resetSelfHostedAuthE2eState(input: { bootstrapRequired?: boolean } = {}): void {
  const bootstrapRequired = input.bootstrapRequired ?? false;
  selfHostedAuthE2eAdminCreated = !bootstrapRequired;
  selfHostedAuthE2eSignedIn = !bootstrapRequired;
}

function selfHostedAuthE2eLoginMethods() {
  return [
    {
      key: "local-password",
      configured: true,
      enabled: true,
    },
    {
      key: "github",
      configured: false,
      enabled: false,
      reason: "Configure GitHub OAuth to enable import.",
    },
  ];
}

function selfHostedAuthE2eBootstrapStatus() {
  return {
    bootstrapRequired: !selfHostedAuthE2eAdminCreated,
    firstAdminConfigured: selfHostedAuthE2eAdminCreated,
    organizationConfigured: selfHostedAuthE2eAdminCreated,
    loginMethods: selfHostedAuthE2eLoginMethods(),
    ...(selfHostedAuthE2eAdminCreated
      ? {
          firstAdminEmail: "admin@example.com",
          organizationId: "org_self_hosted",
          organizationSlug: "self-hosted-appaloft",
        }
      : {}),
    loginUrl: "/login",
  };
}

function deploymentDetailFixture(input: {
  deploymentId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  sourceDisplayName: string;
  sourceLocator: string;
  sourceVersion?: {
    reference: {
      sourceKind: "docker-image";
      referenceKind: "image-tag";
      value: string;
    };
    fixedIdentifier: {
      sourceKind: "docker-image";
      referenceKind: "image-digest";
      value: string;
    };
  };
  sourceMetadata?: Record<string, string>;
  executionMetadata?: Record<string, string>;
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
          ...(input.sourceMetadata ? { metadata: input.sourceMetadata } : {}),
          ...(input.sourceVersion ? { version: input.sourceVersion } : {}),
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
            ...(input.executionMetadata ?? {}),
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
          ...(input.sourceVersion ? { version: input.sourceVersion } : {}),
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

function projectFixture(index: number): ProjectFixture {
  const padded = String(index).padStart(2, "0");
  return {
    id: `prj_grid_${padded}`,
    name: `Grid Project ${padded}`,
    slug: `grid-project-${padded}`,
    description: `Grid project ${padded} description`,
    lifecycleStatus: "active",
    createdAt: `2026-01-${padded}T00:00:00.000Z`,
  };
}

function demoProjectFixture() {
  return {
    id: "prj_demo",
    name: "Demo",
    slug: "demo",
    description: "Demo project",
    lifecycleStatus: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function serverFixture(index: number): ServerFixture {
  const padded = String(index).padStart(2, "0");
  return {
    id: index === 1 ? "srv_demo" : `srv_grid_${padded}`,
    name: index === 1 ? "edge" : `Grid Server ${padded}`,
    host: `203.0.113.${index}`,
    port: 22,
    providerKey: "generic-ssh",
    targetKind: "single-server",
    lifecycleStatus: "active",
    createdAt: `2026-01-${padded}T00:00:00.000Z`,
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

function deploymentRecoveryReadinessFixture(deploymentId: string) {
  return {
    schemaVersion: "deployments.recovery-readiness/v1",
    deploymentId,
    resourceId: "res_demo",
    generatedAt: "2026-01-01T00:00:04.000Z",
    stateVersion: "2026-01-01T00:00:04.000Z",
    recoverable: false,
    retryable: false,
    redeployable: false,
    rollbackReady: false,
    rollbackCandidateCount: 0,
    retry: {
      allowed: false,
      commandActive: true,
      reasons: [
        {
          code: "attempt-status-not-recoverable",
          category: "blocked",
          phase: "readiness",
          retriable: false,
        },
      ],
      targetOperation: "deployments.retry",
    },
    redeploy: {
      allowed: false,
      commandActive: true,
      reasons: [
        {
          code: "attempt-status-not-recoverable",
          category: "blocked",
          phase: "readiness",
          retriable: false,
        },
      ],
      targetOperation: "deployments.redeploy",
    },
    rollback: {
      allowed: false,
      commandActive: true,
      reasons: [
        {
          code: "rollback-candidate-not-successful",
          category: "blocked",
          phase: "readiness",
          retriable: false,
        },
      ],
      candidates: [],
    },
    recommendedActions: [
      {
        kind: "query",
        targetOperation: "deployments.show",
        label: "Inspect deployment",
        safeByDefault: true,
        commandActive: true,
      },
    ],
  };
}

function runtimeUsageScopeFixture(value: unknown): RuntimeUsageScopeFixture {
  if (!isRecord(value)) {
    return { kind: "resource", resourceId: "res_demo" };
  }

  switch (value.kind) {
    case "server":
      return { kind: "server", serverId: String(value.serverId ?? "srv_demo") };
    case "project":
      return { kind: "project", projectId: String(value.projectId ?? "prj_demo") };
    case "environment":
      return { kind: "environment", environmentId: String(value.environmentId ?? "env_demo") };
    case "deployment":
      return { kind: "deployment", deploymentId: String(value.deploymentId ?? "dep_demo") };
    default:
      return { kind: "resource", resourceId: String(value.resourceId ?? "res_demo") };
  }
}

function runtimeUsageScopeEvidence(scope: RuntimeUsageScopeFixture) {
  return {
    scope,
    ...(scope.kind === "server" ? { serverId: scope.serverId } : {}),
    ...(scope.kind === "project" ? { projectId: scope.projectId } : {}),
    ...(scope.kind === "environment" ? { environmentId: scope.environmentId } : {}),
    ...(scope.kind === "resource" ? { resourceId: scope.resourceId } : {}),
    ...(scope.kind === "deployment" ? { deploymentId: scope.deploymentId } : {}),
  };
}

function runtimeUsageInspectFixture(scope: RuntimeUsageScopeFixture) {
  return {
    schemaVersion: "runtime-usage.inspect/v1",
    scope,
    generatedAt: "2026-05-13T01:00:00.000Z",
    observedAt: "2026-05-13T01:00:00.000Z",
    freshness: "live",
    partial: false,
    totals: {
      cpu: { containerCpuPercent: 42, loadAverage1m: 1.2, logicalCores: 4 },
      memory: { usedBytes: 536_870_912, totalBytes: 1_073_741_824 },
      disk: { usedBytes: 268_435_456, totalBytes: 1_073_741_824 },
    },
    byProject: [
      {
        scope: { kind: "project", projectId: "prj_demo" },
        ownership: "attributed",
        totals: {
          cpu: { containerCpuPercent: 30 },
          memory: { usedBytes: 402_653_184, totalBytes: 1_073_741_824 },
          disk: { usedBytes: 201_326_592, totalBytes: 1_073_741_824 },
        },
        warnings: [],
      },
    ],
    byEnvironment: [
      {
        scope: { kind: "environment", environmentId: "env_demo" },
        ownership: "attributed",
        totals: {
          cpu: { containerCpuPercent: 28 },
          memory: { usedBytes: 335_544_320, totalBytes: 1_073_741_824 },
          disk: { usedBytes: 167_772_160, totalBytes: 1_073_741_824 },
        },
        warnings: [],
      },
    ],
    byResource: [
      {
        scope: { kind: "resource", resourceId: "res_demo" },
        ownership: "attributed",
        totals: {
          cpu: { containerCpuPercent: 24 },
          memory: { usedBytes: 268_435_456, totalBytes: 1_073_741_824 },
          disk: { usedBytes: 134_217_728, totalBytes: 1_073_741_824 },
        },
        currentDeploymentId: "dep_demo",
        currentRuntimeId: "runtime_dep_demo",
        warnings: [],
      },
    ],
    byDeployment: [
      {
        scope: { kind: "deployment", deploymentId: "dep_demo" },
        ownership: "attributed",
        totals: {
          cpu: { containerCpuPercent: 18 },
          memory: { usedBytes: 134_217_728, totalBytes: 1_073_741_824 },
          disk: { usedBytes: 67_108_864, totalBytes: 1_073_741_824 },
        },
        currentRuntimeId: "runtime_dep_demo",
        warnings: [],
      },
    ],
    artifacts: [],
    warnings: [],
    sourceErrors: [],
  };
}

function runtimeMonitoringSamplesFixture(scope: RuntimeUsageScopeFixture) {
  return {
    schemaVersion: "runtime-monitoring.samples.list/v1",
    scope,
    from: "2026-05-13T00:00:00.000Z",
    to: "2026-05-13T01:00:00.000Z",
    generatedAt: "2026-05-13T01:00:00.000Z",
    freshness: "recent-sample",
    partial: false,
    retention: {
      rawRetentionHours: 24,
      retainedFrom: "2026-05-13T00:00:00.000Z",
      retainedTo: "2026-05-13T01:00:00.000Z",
    },
    samples: [
      {
        sampleId: `rms_${scope.kind}`,
        observedAt: "2026-05-13T00:45:00.000Z",
        collectedAt: "2026-05-13T00:45:01.000Z",
        scopeEvidence: runtimeUsageScopeEvidence(scope),
        totals: {
          cpu: { containerCpuPercent: 44, logicalCores: 4 },
          memory: { usedBytes: 536_870_912, totalBytes: 1_073_741_824 },
          disk: { usedBytes: 268_435_456, totalBytes: 1_073_741_824 },
        },
        freshness: "recent-sample",
        partial: false,
        labels: {
          providerKey: "generic-ssh",
          runtimeId: "runtime_dep_demo",
        },
        warnings: [],
        sourceErrors: [],
      },
    ],
    warnings: [],
    sourceErrors: [],
  };
}

function runtimeMonitoringRollupFixture(scope: RuntimeUsageScopeFixture) {
  return {
    schemaVersion: "runtime-monitoring.rollup/v1",
    scope,
    from: "2026-05-13T00:00:00.000Z",
    to: "2026-05-13T01:00:00.000Z",
    bucket: "minute",
    generatedAt: "2026-05-13T01:00:00.000Z",
    freshness: "recent-sample",
    partial: false,
    retention: {
      rawRetentionHours: 24,
      retainedFrom: "2026-05-13T00:00:00.000Z",
      retainedTo: "2026-05-13T01:00:00.000Z",
    },
    series: [
      {
        signal: "cpu",
        points: [
          {
            from: "2026-05-13T00:44:00.000Z",
            to: "2026-05-13T00:45:00.000Z",
            sampleCount: 1,
            totals: { cpu: { containerCpuPercent: 32 } },
          },
          {
            from: "2026-05-13T00:45:00.000Z",
            to: "2026-05-13T00:46:00.000Z",
            sampleCount: 1,
            totals: { cpu: { containerCpuPercent: 44 } },
          },
        ],
      },
      {
        signal: "memory",
        points: [
          {
            from: "2026-05-13T00:45:00.000Z",
            to: "2026-05-13T00:46:00.000Z",
            sampleCount: 1,
            totals: { memory: { usedBytes: 536_870_912, totalBytes: 1_073_741_824 } },
          },
        ],
      },
      {
        signal: "disk",
        points: [
          {
            from: "2026-05-13T00:45:00.000Z",
            to: "2026-05-13T00:46:00.000Z",
            sampleCount: 1,
            totals: { disk: { usedBytes: 268_435_456, totalBytes: 1_073_741_824 } },
          },
        ],
      },
    ],
    totals: {
      cpu: { containerCpuPercent: 38 },
      memory: { usedBytes: 536_870_912, totalBytes: 1_073_741_824 },
      disk: { usedBytes: 268_435_456, totalBytes: 1_073_741_824 },
    },
    topContributors: [
      {
        scope: { kind: "resource", resourceId: "res_demo" },
        totals: {
          cpu: { containerCpuPercent: 38 },
          memory: { usedBytes: 536_870_912, totalBytes: 1_073_741_824 },
          disk: { usedBytes: 268_435_456, totalBytes: 1_073_741_824 },
        },
        sampleCount: 2,
      },
      {
        scope: { kind: "deployment", deploymentId: "dep_demo" },
        totals: {
          cpu: { containerCpuPercent: 18 },
          memory: { usedBytes: 134_217_728, totalBytes: 1_073_741_824 },
          disk: { usedBytes: 67_108_864, totalBytes: 1_073_741_824 },
        },
        sampleCount: 1,
      },
    ],
    deploymentMarkers: [
      {
        deploymentId: "dep_demo",
        resourceId: "res_demo",
        environmentId: "env_demo",
        observedAt: "2026-05-13T00:45:00.000Z",
        status: "succeeded",
        label: "Deployment dep_demo succeeded",
        correlation: "time",
      },
    ],
    warnings: [],
    sourceErrors: [],
  };
}

function runtimeMonitoringThresholdsFixture(scope: RuntimeUsageScopeFixture) {
  return {
    schemaVersion: "runtime-monitoring-thresholds.show/v1",
    scope,
    generatedAt: "2026-05-13T01:00:00.000Z",
    policy: {
      schemaVersion: "runtime-monitoring-thresholds.policy/v1",
      policyId: `rmtp_${scope.kind}`,
      scope,
      rules: [
        {
          ruleId: "rmtr_cpu",
          signal: "cpu",
          metric: "containerCpuPercent",
          warning: 40,
          critical: 80,
          comparator: "greater-than-or-equal",
        },
        {
          ruleId: "rmtr_memory",
          signal: "memory",
          metric: "usedBytes",
          warning: 400_000_000,
          critical: 900_000_000,
          comparator: "greater-than-or-equal",
        },
        {
          ruleId: "rmtr_disk",
          signal: "disk",
          metric: "usedBytes",
          warning: 200_000_000,
          critical: 900_000_000,
          comparator: "greater-than-or-equal",
        },
      ],
      enabled: true,
      updatedAt: "2026-05-13T00:00:00.000Z",
    },
    evaluation: {
      state: "warning",
      crossed: [
        {
          ruleId: "rmtr_cpu",
          signal: "cpu",
          metric: "containerCpuPercent",
          severity: "warning",
          observedValue: 44,
          boundary: 40,
        },
      ],
      nextActions: ["open-runtime-monitoring", "inspect-runtime-usage"],
      sourceErrors: [],
    },
  };
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
    lifecycleStatus?: "active" | "inactive";
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
      targetKind: "single-server",
      lifecycleStatus: input.lifecycleStatus ?? "active",
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

function dependencyResourceFixture(input: {
  id: string;
  name: string;
  kind: DependencyResourceFixtureKind;
  maskedConnection: string;
  host: string;
  providerResourceHandle: string;
}) {
  const kindDefinition = dependencyResourceFixtureKinds[input.kind];
  return {
    id: input.id,
    projectId: "prj_demo",
    environmentId: "env_demo",
    name: input.name,
    slug: input.name,
    kind: input.kind,
    sourceMode: "appaloft-managed",
    providerKey: `appaloft-managed-${input.kind}`,
    providerManaged: true,
    lifecycleStatus: "ready",
    connection: {
      host: input.host,
      port: kindDefinition.port,
      ...(kindDefinition.databaseName ? { databaseName: kindDefinition.databaseName } : {}),
      maskedConnection: input.maskedConnection,
      secretRef: `secret://dependency-resources/${input.id}/connection`,
    },
    providerRealization: {
      status: "ready",
      attemptId: `attempt_${input.id}`,
      attemptedAt: "2026-01-01T00:00:00.000Z",
      providerResourceHandle: input.providerResourceHandle,
      realizedAt: "2026-01-01T00:00:02.000Z",
    },
    bindingReadiness: {
      status: "ready",
    },
    backupRelationship: {
      retentionRequired: true,
      reason: "required before restore drills",
    },
    deleteSafety: {
      blockers: [],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function dependencyResourceBackupFixture(input: {
  id: string;
  dependencyResourceId: string;
  dependencyKind: DependencyResourceFixtureKind;
}) {
  return {
    id: input.id,
    dependencyResourceId: input.dependencyResourceId,
    projectId: "prj_demo",
    environmentId: "env_demo",
    dependencyKind: input.dependencyKind,
    providerKey: `appaloft-managed-${input.dependencyKind}`,
    status: "ready",
    attemptId: `attempt_${input.id}`,
    requestedAt: "2026-01-01T00:00:03.000Z",
    completedAt: "2026-01-01T00:00:04.000Z",
    retentionStatus: "retained",
    providerArtifactHandle: `backup://${input.id}`,
    createdAt: "2026-01-01T00:00:03.000Z",
  };
}

function dependencyResourceProvisioningPlanFixture(input: DependencyProvisioningPlanFixtureInput) {
  return {
    schemaVersion: "dependency-resource-provisioning.plan/v1",
    plan: {
      id: input.id,
      mode: input.mode,
      status: input.status ?? "planned",
      kind: input.kind,
      projectId: input.projectId,
      environmentId: input.environmentId,
      name: input.name,
      providerKey: input.providerKey ?? `appaloft-managed-${input.kind}`,
      ...(input.serverId ? { serverId: input.serverId } : {}),
      ...(input.endpoint ? { endpoint: input.endpoint } : {}),
      requiresAcceptance: true,
      requestedAt: input.requestedAt ?? "2026-01-01T00:00:10.000Z",
      ...(input.acceptedAt ? { acceptedAt: input.acceptedAt } : {}),
      ...(input.completedAt ? { completedAt: input.completedAt } : {}),
      ...(input.dependencyResourceId ? { dependencyResourceId: input.dependencyResourceId } : {}),
      summary: [
        `Create managed ${input.kind} dependency resource`,
        `Provider target ${input.providerKey ?? `appaloft-managed-${input.kind}`}`,
        "No resource or provider mutation is performed until the plan is accepted",
      ],
    },
    generatedAt: "2026-01-01T00:00:10.000Z",
  };
}

const baserowBlueprintListing = {
  slug: "baserow",
  title: "Baserow",
  subtitle: "Open source no-code database",
  categoryKey: "data",
  category: "Data",
  featured: true,
  websiteUrl: "https://baserow.io",
  documentationUrl: "https://baserow.io/docs",
  icon: {
    label: "Ba",
    tone: "#0f766e",
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230f766e'/%3E%3Cpath d='M9 8h10a5 5 0 0 1 0 10H9z' fill='white'/%3E%3Cpath d='M9 16h12a5 5 0 0 1 0 10H9z' fill='%23d1fae5'/%3E%3C/svg%3E",
    alt: "Baserow icon",
  },
  publisher: {
    name: "Appaloft",
    verified: true,
  },
  blueprint: {
    id: "baserow",
    version: "1.0.0",
    summary: "Deploy Baserow with managed dependencies.",
    tags: ["database", "nocode"],
  },
  overview: {
    highlights: ["Managed Postgres dependency", "Container image runtime"],
    useCases: ["Internal no-code database"],
  },
  defaultVariant: "standard",
  variants: [
    {
      id: "standard",
      label: "Standard",
      summary: "Default Baserow deployment.",
    },
  ],
};

const teableNeutralBlueprintEntry = {
  id: "teable",
  name: "Teable",
  version: "1.0.0",
  summary: "Official Teable Blueprint.",
  tags: ["data-app", "collaboration", "postgres", "official"],
  defaultVariant: "community",
  variants: [
    {
      id: "community",
      label: "Community",
      summary: "AGPL community image for open-source self-hosted Teable.",
    },
  ],
};

const teableNeutralBlueprintManifest = {
  schemaVersion: "appaloft.blueprint/v1",
  id: "cloud-teable",
  name: "Teable",
  version: "1.0.0",
  summary: "Official Teable Blueprint.",
  tags: ["data-app", "collaboration", "postgres", "official"],
  parameters: [
    {
      key: "APP_NAME",
      label: "App name",
      type: "string",
      required: true,
      default: "teable",
    },
  ],
  secrets: [
    {
      key: "SECRET_KEY",
      label: "Secret key",
      required: true,
    },
  ],
  resources: [
    {
      id: "postgres",
      kind: "postgres",
      label: "Teable Postgres",
      optional: false,
      capabilities: [],
    },
    {
      id: "redis",
      kind: "redis",
      label: "Teable Redis",
      optional: false,
      capabilities: [],
    },
    {
      id: "assets",
      kind: "volume",
      label: "Teable assets",
      optional: false,
      capabilities: [],
    },
  ],
  components: [
    {
      id: "teable",
      name: "Teable",
      kind: "service",
      runtime: {
        strategy: "container-image",
        image: "ghcr.io/teableio/teable-community:latest",
      },
      ports: [{ name: "http", containerPort: 3003, protocol: "http", public: true }],
      routes: [{ port: "http", pathPrefix: "/" }],
      variables: [{ key: "BACKEND_CACHE_PROVIDER", value: "redis" }],
      usesSecrets: ["SECRET_KEY"],
      usesResources: ["postgres", "redis", "assets"],
    },
  ],
  profiles: {
    production: {
      label: "Production",
    },
  },
  defaultVariant: "community",
  variants: {
    community: {
      label: "Community",
      summary: "AGPL community image for open-source self-hosted Teable.",
      defaultProfile: "production",
    },
  },
};

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
    "/api/system-plugins/web-extensions": {
      items: [
        {
          key: "blueprint-catalog",
          title: "应用市场",
          description: "官方蓝图应用市场。",
          path: "/marketplace",
          placement: "navigation",
          target: "console-route",
          requiresAuth: false,
          pluginName: "server-configured-extensions",
          pluginDisplayName: "Server Configured Extensions",
          metadata: {
            renderer: "blueprint-catalog",
            listEndpoint: "/api/blueprint-catalog/blueprints",
            detailEndpointTemplate: "/api/blueprint-catalog/blueprints/{slug}",
            remoteDetailEndpoint: "/api/blueprint-catalog/remote",
            remoteInstallEndpoint: "/api/blueprint-catalog/remote/install",
          },
        },
        {
          key: "blueprint-catalog.quick-deploy-source",
          title: "蓝图市场",
          description: "为快速部署选择官方应用蓝图。",
          path: "/marketplace?surface=quick-deploy",
          placement: "quick-deploy-source",
          target: "console-route",
          requiresAuth: false,
          pluginName: "server-configured-extensions",
          pluginDisplayName: "Server Configured Extensions",
          metadata: {
            renderer: "blueprint-catalog",
            listEndpoint: "/api/blueprint-catalog/blueprints",
            detailEndpointTemplate: "/api/blueprint-catalog/blueprints/{slug}",
            remoteDetailEndpoint: "/api/blueprint-catalog/remote",
            remoteInstallEndpoint: "/api/blueprint-catalog/remote/install",
          },
        },
        {
          key: "public-blueprints.quick-deploy-source",
          title: "Public Blueprints",
          description: "Public neutral Blueprint catalog.",
          path: "/marketplace?surface=quick-deploy",
          placement: "quick-deploy-source",
          target: "console-route",
          requiresAuth: false,
          pluginName: "server-configured-extensions",
          pluginDisplayName: "Server Configured Extensions",
          metadata: {
            renderer: "blueprint-catalog",
            listEndpoint: "/api/blueprints",
            detailEndpointTemplate: "/api/blueprints/{slug}",
          },
        },
      ],
    },
    "/api/blueprint-catalog/blueprints": {
      categories: [
        {
          key: "data",
          label: "Data",
          description: "Data applications",
          count: 1,
        },
      ],
      items: [baserowBlueprintListing],
    },
    "/api/blueprint-catalog/blueprints/baserow": {
      listing: baserowBlueprintListing,
      manifest: {
        summary: "Baserow application",
        description: "Open source no-code database.",
        parameters: [],
        secrets: [],
        resources: [
          {
            id: "postgres",
            kind: "postgres",
            label: "Postgres database",
            capabilities: [{ key: "postgres.database", required: true }],
          },
        ],
        components: [
          {
            id: "web",
            name: "Baserow",
            kind: "application",
            runtime: {
              strategy: "container-image",
              image: "baserow/baserow:latest",
            },
            ports: [{ name: "http", containerPort: 80, protocol: "http", public: true }],
            routes: [{ port: "http", pathPrefix: "/" }],
            variables: [
              {
                key: "DATABASE_URL",
                value: "postgres://dependency/postgres",
                description: "Postgres connection string",
              },
              {
                key: "SECRET_KEY",
                value: "change-me",
                description: "Baserow application secret",
              },
            ],
            usesSecrets: [],
            usesResources: ["postgres"],
          },
        ],
        defaultVariant: "standard",
        variants: {
          standard: {
            label: "Standard",
            summary: "Default Baserow deployment.",
          },
        },
      },
      install: {
        profiles: ["default"],
        defaultProfile: "default",
        parameters: [],
        secrets: [],
        defaultVariant: "standard",
        variants: [
          {
            id: "standard",
            label: "Standard",
            summary: "Default Baserow deployment.",
          },
        ],
      },
    },
    "/api/blueprint-catalog/remote": {
      manifest: {
        schemaVersion: "appaloft.blueprint/v1",
        id: "remote-docker-demo",
        name: "One-Click Docker Demo",
        version: "0.1.0",
        summary: "Remote Dockerfile Blueprint loaded from a one-click URL.",
        description: "A remote Blueprint fixture.",
        tags: ["demo"],
        parameters: [],
        secrets: [],
        resources: [],
        components: [
          {
            id: "web",
            name: "One-Click Docker Demo",
            kind: "service",
            runtime: {
              strategy: "dockerfile",
              dockerfilePath: "Dockerfile",
            },
            ports: [{ name: "http", containerPort: 3000, protocol: "http", public: true }],
            routes: [{ port: "http", pathPrefix: "/" }],
            variables: [],
            usesSecrets: [],
            usesResources: [],
          },
        ],
        componentRelations: [],
        profiles: {
          production: { label: "Production" },
        },
        variants: {},
      },
      install: {
        profiles: ["production"],
        defaultProfile: "production",
        parameters: [],
        secrets: [],
        variants: [],
      },
    },
    "/api/blueprints": {
      items: [teableNeutralBlueprintEntry],
    },
    "/api/blueprints/teable": {
      entry: teableNeutralBlueprintEntry,
      manifest: teableNeutralBlueprintManifest,
    },
    "/api/rpc/blueprints/install": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { slug?: string } | null;
      return {
        json: {
          executionStatus: "ready",
          installedApplication: {
            applicationId: "cia_teable_web",
            blueprintSlug: input?.slug ?? "teable",
            status: "ready",
            components: [
              {
                componentId: "teable",
                resource: { resourceId: "res_teable_web" },
                deployment: { deploymentId: "dep_teable_web" },
                endpoints: [{ url: "http://teable.example.test" }],
              },
            ],
          },
        },
      };
    },
    "/api/instance-upgrade/check": {
      schemaVersion: "system.instance-upgrade.check/v1",
      currentVersion: "0.1.0-test",
      currentCommitSha: "57ea0764b8f0a491fd1d30bedc5cbe281744b36c",
      targetVersion: "0.1.0-test",
      latestVersion: "0.1.0-test",
      updateAvailable: false,
      checkedAt: "2026-01-01T00:00:00.000Z",
      checkStatus: "current",
      upgradeCommand: "curl -fsSL https://appaloft.com/install.sh | sudo sh",
      applySupported: false,
      applyUnsupportedReason: "Host-side upgrade execution is disabled in the test fixture.",
    },
    "/api/auth/session": () => ({
      enabled: true,
      emailVerification: {
        enabled: false,
        otpEnabled: false,
        required: false,
      },
      provider: "better-auth",
      loginRequired: false,
      deferredAuth: true,
      session: selfHostedAuthE2eSignedIn
        ? {
            user: {
              name: "Admin User",
              email: "admin@example.com",
            },
          }
        : null,
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
    }),
    "/api/rpc/auth/bootstrapStatus": () => ({
      json: selfHostedAuthE2eBootstrapStatus(),
    }),
    "/api/bootstrap/auth/status": () => selfHostedAuthE2eBootstrapStatus(),
    "/api/rpc/auth/bootstrapFirstAdmin": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as {
        displayName?: string;
        email?: string;
        organizationName?: string;
        organizationSlug?: string;
      } | null;
      selfHostedAuthE2eAdminCreated = true;

      return {
        json: {
          bootstrapRequired: false,
          created: true,
          email: input?.email ?? "admin@example.com",
          generatedPassword: selfHostedAuthE2eGeneratedPassword,
          loginMethods: selfHostedAuthE2eLoginMethods(),
          loginUrl: "/login",
          organizationId: "org_self_hosted",
          organizationSlug: input?.organizationSlug ?? "self-hosted-appaloft",
          userId: "usr_admin",
        },
      };
    },
    "/api/auth/sign-in/email": (_request: Request, body: unknown) => {
      const input = isRecord(body) ? body : {};
      if (
        selfHostedAuthE2eAdminCreated &&
        input.email === "admin@example.com" &&
        input.password === selfHostedAuthE2eGeneratedPassword
      ) {
        selfHostedAuthE2eSignedIn = true;
        return respondJson(
          {
            user: {
              email: "admin@example.com",
              name: "Admin User",
            },
          },
          {
            headers: {
              "set-cookie": "better-auth.session_token=test-admin-session; Path=/; HttpOnly",
            },
          },
        );
      }

      return respondJson(
        {
          code: "invalid_credentials",
          message: "Invalid email or password",
        },
        { status: 401 },
      );
    },
    "/api/auth/sign-out": () => {
      selfHostedAuthE2eSignedIn = false;
      return {
        success: true,
      };
    },
    "/api/rpc/system/doctor": {
      json: {
        readiness: {
          status: "ready",
          checks: {
            database: true,
            migrations: true,
          },
          details: {
            databaseDriver: "pglite",
          },
        },
        providers: [],
        plugins: [],
        maintenanceWorkers: [
          {
            key: "certificate-retry-scheduler",
            label: "Certificate retry scheduler",
            enabled: false,
            activation: "disabled-by-config",
            safetyMode: "certificate-retry",
            intervalSeconds: 60,
            batchSize: 25,
            configurationKeys: [
              "APPALOFT_CERTIFICATE_RETRY_SCHEDULER_ENABLED",
              "APPALOFT_CERTIFICATE_RETRY_SCHEDULER_INTERVAL_SECONDS",
              "APPALOFT_CERTIFICATE_RETRY_DEFAULT_DELAY_SECONDS",
              "APPALOFT_CERTIFICATE_RETRY_SCHEDULER_BATCH_SIZE",
            ],
            operationKeys: ["certificates.issue-or-renew"],
          },
          {
            key: "preview-expiry-cleanup-scheduler",
            label: "Preview expiry cleanup scheduler",
            enabled: false,
            activation: "disabled-by-config",
            safetyMode: "preview-expiry-cleanup",
            intervalSeconds: 300,
            batchSize: 25,
            configurationKeys: [
              "APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_ENABLED",
              "APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_INTERVAL_SECONDS",
              "APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_BATCH_SIZE",
            ],
            operationKeys: ["preview-environments.delete", "deployments.cleanup-preview"],
          },
          {
            key: "preview-cleanup-retry-scheduler",
            label: "Preview cleanup retry scheduler",
            enabled: false,
            activation: "disabled-by-config",
            safetyMode: "preview-cleanup-retry",
            intervalSeconds: 300,
            batchSize: 25,
            configurationKeys: [
              "APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_ENABLED",
              "APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_INTERVAL_SECONDS",
              "APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_BATCH_SIZE",
            ],
            operationKeys: ["deployments.cleanup-preview"],
          },
          {
            key: "scheduled-task-runner",
            label: "Scheduled task runner",
            enabled: true,
            activation: "starts-with-backend-service",
            safetyMode: "runtime-execution",
            intervalSeconds: 30,
            batchSize: 10,
            configurationKeys: [
              "APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED",
              "APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS",
              "APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE",
            ],
            operationKeys: ["scheduled-tasks.run-now", "scheduled-task-runs.run-due"],
          },
          {
            key: "scheduled-runtime-prune-runner",
            label: "Scheduled runtime prune runner",
            enabled: false,
            activation: "disabled-by-config",
            safetyMode: "policy-gated-prune",
            intervalSeconds: 3600,
            batchSize: 25,
            configurationKeys: [
              "APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_ENABLED",
              "APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_INTERVAL_SECONDS",
              "APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_BATCH_SIZE",
            ],
            operationKeys: ["servers.capacity.prune"],
          },
          {
            key: "scheduled-history-retention-runner",
            label: "Scheduled history retention runner",
            enabled: false,
            activation: "disabled-by-config",
            safetyMode: "policy-gated-retention",
            intervalSeconds: 3600,
            batchSize: 25,
            configurationKeys: [
              "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_ENABLED",
              "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_INTERVAL_SECONDS",
              "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_BATCH_SIZE",
            ],
            operationKeys: ["audit-events.prune"],
          },
          {
            key: "runtime-monitoring-collector-runner",
            label: "Runtime monitoring collector",
            enabled: false,
            activation: "disabled-by-config",
            safetyMode: "read-only-collection",
            intervalSeconds: 60,
            batchSize: 25,
            rawRetentionHours: 24,
            configurationKeys: [
              "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED",
              "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_INTERVAL_SECONDS",
              "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_BATCH_SIZE",
              "APPALOFT_RUNTIME_MONITORING_RAW_RETENTION_HOURS",
            ],
            operationKeys: ["runtime-monitoring.collect"],
          },
        ],
      },
    },
    "/api/rpc/terminalSessions/list": {
      json: {
        schemaVersion: "terminal-sessions.list/v1",
        items: [],
      },
    },
    "/api/rpc/projects/list": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { limit?: number; offset?: number } | null;
      if (input?.limit !== 12 || input.offset === undefined) {
        return {
          json: {
            items: [demoProjectFixture()],
          },
        };
      }

      const projectCount = 13;
      const projects = Array.from({ length: projectCount }, (_, index) =>
        projectFixture(index + 1),
      );
      const offset = input?.offset ?? 0;
      const limit = input?.limit ?? projects.length;
      const items = projects.slice(offset, offset + limit);

      return {
        json: {
          items,
          total: projectCount,
          limit,
          offset,
        },
      };
    },
    "/api/rpc/capabilities/query": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as {
        queries?: Array<{ operationKey?: string }>;
      } | null;
      return {
        json: {
          capabilities: (input?.queries ?? []).map((query) => ({
            operationKey: query.operationKey ?? "unknown",
            allowed: true,
            mode: "unrestricted",
            hint: "enabled",
            reason: "webview-capability-allowed",
          })),
        },
      };
    },
    "/api/rpc/projects/show": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { projectId?: string } | null;
      return {
        json: {
          id: input?.projectId ?? "prj_demo",
          name: "Demo",
          slug: "demo",
          description: "Demo project",
          lifecycleStatus: "active",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      };
    },
    "/api/rpc/projects/rename": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { projectId?: string } | null;
      return {
        json: {
          id: input?.projectId ?? "prj_demo",
        },
      };
    },
    "/api/rpc/projects/reorder": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { projectIds?: string[] } | null;
      return {
        json: {
          reorderedProjectIds: input?.projectIds ?? [],
        },
      };
    },
    "/api/rpc/projects/archive": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { projectId?: string } | null;
      return {
        json: {
          id: input?.projectId ?? "prj_demo",
        },
      };
    },
    "/api/rpc/projects/restore": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { projectId?: string } | null;
      return {
        json: {
          id: input?.projectId ?? "prj_demo",
        },
      };
    },
    "/api/rpc/projects/deleteCheck": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { projectId?: string } | null;
      return {
        json: {
          schemaVersion: "projects.delete-check/v1",
          projectId: input?.projectId ?? "prj_demo",
          lifecycleStatus: "archived",
          eligible: true,
          blockers: [],
          checkedAt: "2026-01-01T00:00:00.000Z",
        },
      };
    },
    "/api/rpc/projects/delete": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { projectId?: string } | null;
      return {
        json: {
          id: input?.projectId ?? "prj_demo",
        },
      };
    },
    "/api/rpc/servers/list": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { limit?: number; offset?: number } | null;
      const serverCount = 13;
      const servers = Array.from({ length: serverCount }, (_, index) => serverFixture(index + 1));
      const offset = input?.offset ?? 0;
      const limit = input?.limit ?? serverCount;
      return {
        json: {
          items: servers.slice(offset, offset + limit),
          total: serverCount,
          limit,
          offset,
        },
      };
    },
    "/api/rpc/servers/reorder": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverIds?: string[] } | null;
      return {
        json: {
          reorderedServerIds: input?.serverIds ?? [],
        },
      };
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
    "/api/rpc/servers/deactivate": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverId?: string } | null;
      return {
        json: {
          id: input?.serverId ?? "srv_demo",
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
    "/api/rpc/servers/capacity/inspect": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverId?: string } | null;
      return {
        json: {
          schemaVersion: "servers.capacity.inspect/v1",
          server: {
            id: input?.serverId ?? "srv_demo",
            name: "edge",
            host: "127.0.0.1",
            port: 22,
            providerKey: "generic-ssh",
            targetKind: "ssh-docker",
          },
          inspectedAt: "2026-05-13T01:00:00.000Z",
          disk: [
            {
              path: "/",
              mount: "/",
              size: 100_000_000,
              used: 70_000_000,
              available: 30_000_000,
              usePercent: 70,
            },
          ],
          inodes: [],
          docker: {
            imagesSize: 40_000_000,
            reclaimableImagesSize: 10_000_000,
            buildCacheSize: 12_000_000,
            reclaimableBuildCacheSize: 6_000_000,
            containersSize: 3_000_000,
            volumesSize: 0,
          },
          memory: {
            total: 8_000_000_000,
            available: 4_000_000_000,
            used: 4_000_000_000,
            usePercent: 50,
          },
          cpu: {
            logicalCores: 4,
            loadAverage1m: 0.5,
            loadAverage5m: 0.4,
            loadAverage15m: 0.3,
          },
          appaloftRuntime: {
            runtimeRoot: {
              path: "/var/lib/appaloft/runtime",
              size: 20_000_000,
              detectable: true,
            },
            stateRoot: {
              path: "/var/lib/appaloft/state",
              size: 10_000_000,
              detectable: true,
            },
            sourceWorkspace: {
              path: "/var/lib/appaloft/sources",
              size: 8_000_000,
              detectable: true,
            },
          },
          appaloftContainers: [
            {
              id: "ctr_old",
              name: "appaloft-old",
              running: false,
              status: "exited",
              writableBytes: 3_000_000,
              resourceId: "res_demo",
              serverId: input?.serverId ?? "srv_demo",
            },
          ],
          appaloftWorkspaces: [
            {
              deploymentId: "dep_old",
              path: "/var/lib/appaloft/runtime/local-deployments/dep_old",
              bytes: 4_000_000,
              activeMarker: false,
              rollbackCandidateMarker: false,
            },
          ],
          safeReclaimableEstimate: {
            stoppedContainersSize: 3_000_000,
            danglingImagesSize: 10_000_000,
            oldBuildCacheSize: 6_000_000,
            oldPreviewWorkspaceCandidatesSize: 4_000_000,
            total: 23_000_000,
          },
          warnings: [],
          partial: false,
        },
      };
    },
    "/api/rpc/servers/capacity/prune": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as {
        before?: string;
        categories?: string[];
        dryRun?: boolean;
        serverId?: string;
      } | null;
      return {
        json: {
          schemaVersion: "servers.capacity.prune/v1",
          server: {
            id: input?.serverId ?? "srv_demo",
            name: "edge",
            host: "127.0.0.1",
            port: 22,
            providerKey: "generic-ssh",
            targetKind: "ssh-docker",
          },
          before: input?.before ?? "2026-05-13T01:00:00.000Z",
          categories: input?.categories ?? [
            "stopped-containers",
            "preview-workspaces",
            "source-workspaces",
          ],
          dryRun: input?.dryRun ?? true,
          prunedAt: "2026-05-13T01:05:00.000Z",
          summary: {
            inspectedCount: 2,
            matchedCount: 2,
            prunedCount: input?.dryRun === false ? 2 : 0,
            skippedCount: 0,
            excludedCount: 0,
            reclaimedBytes: input?.dryRun === false ? 7_000_000 : 0,
          },
          candidates: [
            {
              id: "candidate_ctr_old",
              category: "stopped-containers",
              target: "appaloft-old",
              updatedAt: "2026-05-12T00:00:00.000Z",
              size: 3_000_000,
              action: input?.dryRun === false ? "pruned" : "matched",
            },
            {
              id: "candidate_workspace_old",
              category: "preview-workspaces",
              target: "/var/lib/appaloft/runtime/local-deployments/dep_old",
              updatedAt: "2026-05-12T00:00:00.000Z",
              size: 4_000_000,
              action: input?.dryRun === false ? "pruned" : "matched",
            },
          ],
          warnings: [],
        },
      };
    },
    "/api/rpc/defaultAccessDomainPolicies/show": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as {
        scopeKind?: "system" | "deployment-target";
        serverId?: string;
      } | null;

      if (input?.scopeKind === "deployment-target") {
        return {
          json: {
            schemaVersion: "default-access-domain-policies.show/v1",
            scope: { kind: "deployment-target", serverId: input.serverId ?? "srv_demo" },
            policy: {
              schemaVersion: "default-access-domain-policies.policy/v1",
              id: "dap_server",
              scope: { kind: "deployment-target", serverId: input.serverId ?? "srv_demo" },
              mode: "custom-template",
              providerKey: "internal-dns",
              templateRef: "apps/{{resourceSlug}}",
              updatedAt: "2026-01-01T00:00:11.000Z",
            },
          },
        };
      }

      return {
        json: {
          schemaVersion: "default-access-domain-policies.show/v1",
          scope: { kind: "system" },
          policy: {
            schemaVersion: "default-access-domain-policies.policy/v1",
            id: "dap_system",
            scope: { kind: "system" },
            mode: "provider",
            providerKey: "sslip",
            updatedAt: "2026-01-01T00:00:10.000Z",
          },
        },
      };
    },
    "/api/rpc/defaultAccessDomainPolicies/configure": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { scope?: { serverId?: string } } | null;
      return {
        json: {
          id: input?.scope?.serverId ? "dap_server" : "dap_system",
        },
      };
    },
    "/api/rpc/runtimeUsage/inspect": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { scope?: unknown } | null;
      return {
        json: runtimeUsageInspectFixture(runtimeUsageScopeFixture(input?.scope)),
      };
    },
    "/api/rpc/runtimeMonitoring/samples": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { scope?: unknown } | null;
      return {
        json: runtimeMonitoringSamplesFixture(runtimeUsageScopeFixture(input?.scope)),
      };
    },
    "/api/rpc/runtimeMonitoring/rollup": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { scope?: unknown } | null;
      return {
        json: runtimeMonitoringRollupFixture(runtimeUsageScopeFixture(input?.scope)),
      };
    },
    "/api/rpc/runtimeMonitoring/thresholdShow": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { scope?: unknown } | null;
      return {
        json: runtimeMonitoringThresholdsFixture(runtimeUsageScopeFixture(input?.scope)),
      };
    },
    "/api/rpc/runtimeMonitoring/thresholdConfigure": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as {
        policyId?: string;
        scope?: unknown;
        rules?: unknown[];
        enabled?: boolean;
      } | null;
      const scope = runtimeUsageScopeFixture(input?.scope);
      return {
        json: {
          schemaVersion: "runtime-monitoring-thresholds.policy/v1",
          policy: {
            schemaVersion: "runtime-monitoring-thresholds.policy/v1",
            policyId: input?.policyId ?? `rmtp_${scope.kind}`,
            scope,
            rules: input?.rules ?? runtimeMonitoringThresholdsFixture(scope).policy.rules,
            enabled: input?.enabled ?? true,
            updatedAt: "2026-05-13T01:05:00.000Z",
          },
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
            accessProfile: {
              generatedAccessMode: "inherit",
              pathPrefix: "/",
            },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
    "/api/rpc/dependencyResources/list": {
      json: {
        schemaVersion: "dependency-resources.list/v1",
        items: [
          dependencyResourceFixture({
            id: "dres_pg",
            name: "primary-postgres",
            kind: "postgres",
            host: "primary-postgres",
            maskedConnection: "postgresql://appaloft:****@primary-postgres:5432/appaloft",
            providerResourceHandle: "appaloft-postgres-dres_pg",
          }),
          dependencyResourceFixture({
            id: "dres_redis",
            name: "cache-redis",
            kind: "redis",
            host: "cache-redis",
            maskedConnection: "redis://:****@cache-redis:6379/0",
            providerResourceHandle: "appaloft-redis-dres_redis",
          }),
        ],
        generatedAt: "2026-01-01T00:00:05.000Z",
      },
    },
    "/api/rpc/dependencyResources/provision": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { kind?: string; name?: string } | null;
      return {
        json: {
          id: `dres_${input?.name ?? input?.kind ?? "dependency"}`,
        },
      };
    },
    "/api/rpc/dependencyResources/provisioning/plan": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as {
        mode?: "create" | "reuse";
        create?: {
          kind?: DependencyResourceFixtureKind;
          projectId?: string;
          environmentId?: string;
          serverId?: string;
          name?: string;
          providerKey?: string;
        };
        reuse?: {
          kind?: DependencyResourceFixtureKind;
          projectId?: string;
          environmentId?: string;
          name?: string;
          connectionUrl?: string;
        };
      } | null;
      const create = input?.create;
      const reuse = input?.reuse;
      const mode = input?.mode ?? "create";
      const kind = create?.kind ?? reuse?.kind ?? "postgres";
      const name = create?.name ?? reuse?.name ?? "dependency";
      return {
        json: dependencyResourceProvisioningPlanFixture({
          id: "drp_reporting_db",
          mode,
          kind,
          projectId: create?.projectId ?? reuse?.projectId ?? "prj_demo",
          environmentId: create?.environmentId ?? reuse?.environmentId ?? "env_demo",
          name,
          ...(create?.providerKey ? { providerKey: create.providerKey } : {}),
          ...(create?.serverId ? { serverId: create.serverId } : {}),
          ...(reuse?.connectionUrl ? { endpoint: reuse.connectionUrl } : {}),
        }),
      };
    },
    "/api/rpc/dependencyResources/provisioning/accept": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { planId?: string } | null;
      return {
        json: dependencyResourceProvisioningPlanFixture({
          id: input?.planId ?? "drp_reporting_db",
          mode: "create",
          status: "realized",
          kind: "postgres",
          projectId: "prj_demo",
          environmentId: "env_demo",
          serverId: "srv_demo",
          name: "reporting-db",
          dependencyResourceId: "dres_reporting-db",
          acceptedAt: "2026-01-01T00:00:11.000Z",
          completedAt: "2026-01-01T00:00:12.000Z",
        }),
      };
    },
    "/api/rpc/dependencyResources/createBackup": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { dependencyResourceId?: string } | null;
      return {
        json: {
          id: `bak_${input?.dependencyResourceId ?? "dependency"}`,
        },
      };
    },
    "/api/rpc/dependencyResources/listBackups": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { dependencyResourceId?: string } | null;
      const dependencyResourceId = input?.dependencyResourceId ?? "dres_pg";
      const dependencyKind = dependencyResourceId === "dres_redis" ? "redis" : "postgres";
      return {
        json: {
          schemaVersion: "dependency-resources.backups.list/v1",
          items: [
            dependencyResourceBackupFixture({
              id: `bak_${dependencyResourceId}`,
              dependencyResourceId,
              dependencyKind,
            }),
          ],
          generatedAt: "2026-01-01T00:00:06.000Z",
        },
      };
    },
    "/api/rpc/dependencyResources/restoreBackup": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { backupId?: string } | null;
      return {
        json: {
          id: input?.backupId ?? "bak_dres_pg",
        },
      };
    },
    "/api/rpc/dependencyResources/delete": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { dependencyResourceId?: string } | null;
      return {
        json: {
          id: input?.dependencyResourceId ?? "dres_pg",
        },
      };
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
        accessProfile: {
          generatedAccessMode: "inherit",
          pathPrefix: "/",
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
    "/api/rpc/resources/configureAccess": {
      json: {
        id: "res_demo",
      },
    },
    "/api/rpc/resources/configureHealth": {
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
    "/api/rpc/resources/importVariables": {
      json: {
        resourceId: "res_demo",
        importedEntries: [],
        duplicateOverrides: [],
        existingOverrides: [],
      },
    },
    "/api/rpc/resources/unsetVariable": {
      json: null,
    },
    "/api/rpc/terminalSessions/open": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as {
        scope?: { kind?: string; resourceId?: string; deploymentId?: string; serverId?: string };
      } | null;
      return {
        json: {
          sessionId: "term_webview",
          scope: input?.scope?.kind ?? "resource",
          serverId: input?.scope?.serverId ?? "srv_demo",
          ...(input?.scope?.resourceId ? { resourceId: input.scope.resourceId } : {}),
          ...(input?.scope?.deploymentId ? { deploymentId: input.scope.deploymentId } : {}),
          transport: {
            kind: "websocket",
            path: "/api/terminal-sessions/term_webview/attach",
          },
          providerKey: "local-shell",
          workingDirectory: "/var/lib/appaloft/runtime/local-deployments/dep_demo/source",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "active",
        },
      };
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
    "/api/rpc/environments/lock": {
      json: {
        id: "env_demo",
      },
    },
    "/api/rpc/environments/unlock": {
      json: {
        id: "env_demo",
      },
    },
    "/api/rpc/environments/clone": {
      json: {
        id: "env_clone",
      },
    },
    "/api/rpc/resources/delete": {
      json: {
        id: "res_demo",
      },
    },
    "/api/rpc/scheduledTasks/list": {
      json: {
        schemaVersion: "scheduled-tasks.list/v1",
        items: [
          {
            taskId: "tsk_demo_migrate",
            resourceId: "res_demo",
            schedule: "0 2 * * *",
            timezone: "UTC",
            commandIntent: "bun run db:migrate",
            timeoutSeconds: 300,
            retryLimit: 1,
            concurrencyPolicy: "forbid",
            status: "enabled",
            createdAt: "2026-01-01T00:00:00.000Z",
            latestRun: {
              runId: "str_demo_latest",
              taskId: "tsk_demo_migrate",
              resourceId: "res_demo",
              triggerKind: "scheduled",
              status: "succeeded",
              createdAt: "2026-01-01T02:00:00.000Z",
              startedAt: "2026-01-01T02:00:01.000Z",
              finishedAt: "2026-01-01T02:00:03.000Z",
              exitCode: 0,
            },
          },
        ],
        generatedAt: "2026-01-01T02:00:04.000Z",
      },
    },
    "/api/rpc/scheduledTasks/create": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as {
        resourceId?: string;
        commandIntent?: string;
      } | null;
      return {
        json: {
          schemaVersion: "scheduled-tasks.command/v1",
          task: {
            taskId: "tsk_created",
            resourceId: input?.resourceId ?? "res_demo",
            schedule: "*/5 * * * *",
            timezone: "UTC",
            commandIntent: input?.commandIntent ?? "bun run db:migrate",
            timeoutSeconds: 300,
            retryLimit: 0,
            concurrencyPolicy: "forbid",
            status: "enabled",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        },
      };
    },
    "/api/rpc/scheduledTasks/configure": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as {
        taskId?: string;
        resourceId?: string;
        status?: "enabled" | "disabled";
      } | null;
      return {
        json: {
          schemaVersion: "scheduled-tasks.command/v1",
          task: {
            taskId: input?.taskId ?? "tsk_demo_migrate",
            resourceId: input?.resourceId ?? "res_demo",
            schedule: "0 2 * * *",
            timezone: "UTC",
            commandIntent: "bun run db:migrate",
            timeoutSeconds: 300,
            retryLimit: 1,
            concurrencyPolicy: "forbid",
            status: input?.status ?? "disabled",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:05:00.000Z",
          },
        },
      };
    },
    "/api/rpc/scheduledTasks/delete": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { taskId?: string; resourceId?: string } | null;
      return {
        json: {
          schemaVersion: "scheduled-tasks.delete/v1",
          taskId: input?.taskId ?? "tsk_demo_migrate",
          resourceId: input?.resourceId ?? "res_demo",
          status: "deleted",
          deletedAt: "2026-01-01T00:06:00.000Z",
        },
      };
    },
    "/api/rpc/scheduledTasks/runNow": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { taskId?: string; resourceId?: string } | null;
      return {
        json: {
          schemaVersion: "scheduled-tasks.run-now/v1",
          run: {
            runId: "str_manual_now",
            taskId: input?.taskId ?? "tsk_demo_migrate",
            resourceId: input?.resourceId ?? "res_demo",
            triggerKind: "manual",
            status: "accepted",
            createdAt: "2026-01-01T00:10:00.000Z",
          },
        },
      };
    },
    "/api/rpc/scheduledTasks/runs/list": {
      json: {
        schemaVersion: "scheduled-task-runs.list/v1",
        items: [
          {
            runId: "str_demo_latest",
            taskId: "tsk_demo_migrate",
            resourceId: "res_demo",
            triggerKind: "scheduled",
            status: "succeeded",
            createdAt: "2026-01-01T02:00:00.000Z",
            startedAt: "2026-01-01T02:00:01.000Z",
            finishedAt: "2026-01-01T02:00:03.000Z",
            exitCode: 0,
          },
        ],
        generatedAt: "2026-01-01T02:00:04.000Z",
      },
    },
    "/api/rpc/scheduledTasks/runs/logs": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as {
        runId?: string;
        taskId?: string;
        resourceId?: string;
      } | null;
      return {
        json: {
          schemaVersion: "scheduled-task-runs.logs/v1",
          runId: input?.runId ?? "str_demo_latest",
          taskId: input?.taskId ?? "tsk_demo_migrate",
          resourceId: input?.resourceId ?? "res_demo",
          entries: [
            {
              timestamp: "2026-01-01T02:00:02.000Z",
              stream: "stdout",
              message: "migration complete",
            },
          ],
          generatedAt: "2026-01-01T02:00:04.000Z",
        },
      };
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
                sourceMetadata: {
                  imageTag: "latest",
                  imageName: "ghcr.io/muchobien/pocketbase",
                },
                executionMetadata: {
                  imageDigest: fixedDockerImageDigest,
                  sourceVersion: fixedDockerImageDigest,
                  sourceVersionKind: "image-digest",
                },
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
    "/api/rpc/deployments/recoveryReadiness": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { deploymentId?: string } | null;
      return {
        json: deploymentRecoveryReadinessFixture(input?.deploymentId ?? "dep_demo"),
      };
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
    "/api/rpc/integrations/list": {
      json: {
        items: [
          {
            key: "github",
            title: "GitHub",
            capabilities: ["repository-import"],
            defaultConnectionModeKey: "user-oauth",
            connectionModes: [
              {
                key: "user-oauth",
                title: "GitHub OAuth",
                audience: "end-user",
                externalSetup: "none",
                createsExternalResources: false,
                secretMaterialRequired: true,
              },
            ],
            configuration: {
              status: "configured",
              diagnostics: [],
            },
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
      emailVerification: {
        enabled: false,
        otpEnabled: false,
        required: false,
      },
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
      emailVerification: {
        enabled: false,
        otpEnabled: false,
        required: false,
      },
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
            targetKind: "single-server",
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
    "/api/rpc/resources/diagnosticSummary": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as {
        resourceId?: string;
        deploymentId?: string;
      } | null;
      const resourceId = input?.resourceId ?? "res_static";
      const deploymentId = input?.deploymentId ?? "dep_static";
      const copyPayload = JSON.stringify({
        schemaVersion: "resources.diagnostic-summary.copy/v1",
        resourceId,
        deploymentId,
        sectionErrors: [
          {
            code: "default_access_route_unavailable",
            phase: "access-observation",
          },
        ],
      });

      return {
        json: {
          schemaVersion: "resources.diagnostic-summary/v1",
          generatedAt: "2026-01-01T00:00:10.000Z",
          focus: {
            resourceId,
            deploymentId,
          },
          context: {
            projectId: "prj_static",
            environmentId: "env_static",
            resourceName: "docs-site",
            resourceSlug: "docs-site",
            resourceKind: "static-site",
            destinationId: "dst_static",
            serverId: "srv_static",
            services: [],
          },
          access: {
            status: "unavailable",
            reasonCode: "default_access_route_unavailable",
            phase: "access-observation",
          },
          proxy: {
            status: "not-requested",
            configurationIncluded: false,
            routeCount: 0,
            sectionCount: 0,
          },
          deploymentLogs: {
            status: "not-requested",
            tailLimit: 20,
            lineCount: 0,
            lines: [],
          },
          runtimeLogs: {
            status: "unavailable",
            tailLimit: 20,
            lineCount: 0,
            lines: [],
          },
          system: {
            entrypoint: "web",
          },
          sourceErrors: [
            {
              source: "access-route",
              code: "default_access_route_unavailable",
              category: "runtime_observation",
              phase: "access-observation",
              retryable: true,
              relatedEntityId: resourceId,
            },
          ],
          redaction: {
            policy: "deployment-environment-secrets",
            masked: false,
            maskedValueCount: 0,
          },
          copy: {
            json: copyPayload,
          },
        },
      };
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
    "/api/rpc/deployments/recoveryReadiness": (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { deploymentId?: string } | null;
      return {
        json: deploymentRecoveryReadinessFixture(input?.deploymentId ?? "dep_static"),
      };
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

function startTestServer(
  fetch: (request: Request) => Response | Promise<Response>,
): ReturnType<typeof Bun.serve> {
  const basePort = 30_000 + Math.floor(Math.random() * 20_000);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return Bun.serve({
        port: basePort + attempt,
        fetch,
      });
    } catch (error) {
      const errorCode =
        typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorCode !== "EADDRINUSE" && !errorMessage.includes("EADDRINUSE")) {
        throw error;
      }
    }
  }

  throw new Error("Could not start a test server on an available local port.");
}

function reservePort(): number {
  const server = startTestServer(() => new Response("reserved"));
  const { port } = server;
  server.stop(true);

  if (port === undefined) {
    throw new Error("Could not reserve a free preview port.");
  }

  return port;
}

async function setupWebApp(): Promise<void> {
  apiServer = startTestServer(async (request) => {
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

function createWebView(options: { width?: number; height?: number } = {}): Bun.WebView {
  return new Bun.WebView({
    width: options.width ?? 1280,
    height: options.height ?? 900,
    ...(process.platform === "darwin" ? {} : { backend: "chrome" as const }),
    console: (type, ...args) => {
      if (type === "error") {
        previewLogs += `\n[page console.error] ${args.map(formatConsoleArgument).join(" ")}`;
      }
    },
  });
}

function formatConsoleArgument(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function waitFor<T>(
  read: () => Promise<T>,
  matches: (value: T) => boolean,
  failureMessage: string,
  timeoutMs = 7_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
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

function includesRenderedText(content: string, text: string): boolean {
  return content.toLocaleLowerCase().includes(text.toLocaleLowerCase());
}

async function expectText(view: Bun.WebView, text: string, timeoutMs = 7_000): Promise<void> {
  await waitFor(
    () => pageText(view),
    (content) => includesRenderedText(content, text),
    `Expected page to contain text: ${text}`,
    timeoutMs,
  );
}

async function expectAnyText(
  view: Bun.WebView,
  texts: [string, ...string[]],
  timeoutMs?: number,
): Promise<void> {
  await waitFor(
    () => pageText(view),
    (content) => texts.some((text) => includesRenderedText(content, text)),
    `Expected page to contain one of: ${texts.join(" | ")}`,
    timeoutMs,
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
          if (
            (element instanceof HTMLButtonElement && element.disabled) ||
            element.getAttribute("aria-disabled") === "true"
          ) {
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
          if (
            (element instanceof HTMLButtonElement && element.disabled) ||
            element.getAttribute("aria-disabled") === "true"
          ) {
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

async function clickDialogButtonByAnyText(
  view: Bun.WebView,
  texts: [string, ...string[]],
): Promise<void> {
  const found = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const texts = ${JSON.stringify(texts)};
          const dialog = document.querySelector('[role="dialog"]');
          const elements = Array.from(dialog?.querySelectorAll("button, a") ?? []);
          const element = elements.find((candidate) =>
            texts.some((text) => candidate.textContent?.includes(text))
          );
          if (!element) {
            return false;
          }
          if (
            (element instanceof HTMLButtonElement && element.disabled) ||
            element.getAttribute("aria-disabled") === "true"
          ) {
            return false;
          }
          element.click();
          return true;
        })()`,
      ),
    Boolean,
    `Expected a dialog button or link with one of: ${texts.join(" | ")}`,
  );

  expect(found).toBe(true);
}

async function clickStorageVolumeCardButton(
  view: Bun.WebView,
  volumeId: string,
  texts: [string, ...string[]],
): Promise<void> {
  const found = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const volumeId = ${JSON.stringify(volumeId)};
          const texts = ${JSON.stringify(texts)};
          const card = document.querySelector(\`[data-storage-volume-card="\${volumeId}"]\`);
          const elements = Array.from(card?.querySelectorAll("button, a") ?? []);
          const element = elements.find((candidate) =>
            texts.some((text) => candidate.textContent?.includes(text))
          );
          if (!element) {
            return false;
          }
          if (
            (element instanceof HTMLButtonElement && element.disabled) ||
            element.getAttribute("aria-disabled") === "true"
          ) {
            return false;
          }
          element.click();
          return true;
        })()`,
      ),
    Boolean,
    `Expected storage volume ${volumeId} button or link with one of: ${texts.join(" | ")}`,
  );

  expect(found).toBe(true);
}

async function acceptConsoleConfirm(view: Bun.WebView): Promise<void> {
  const accepted = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const dialog = document.querySelector('[role="alertdialog"]');
          if (!(dialog instanceof HTMLElement)) {
            return false;
          }

          const button = Array.from(dialog.querySelectorAll("button")).find((candidate) =>
            candidate.textContent?.includes("Confirm") ||
            candidate.textContent?.includes("确认")
          );
          if (!(button instanceof HTMLButtonElement) || button.disabled) {
            return false;
          }

          button.click();
          return true;
        })()`,
      ),
    Boolean,
    "Expected shared confirm dialog action",
  );

  expect(accepted).toBe(true);
}

async function submitConsolePrompt(view: Bun.WebView, value: string): Promise<void> {
  const submitted = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const dialog = document.querySelector('[role="dialog"]');
          if (!(dialog instanceof HTMLElement)) {
            return false;
          }

          const input = dialog.querySelector("input, textarea");
          if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
            return false;
          }

          input.value = ${JSON.stringify(value)};
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));

          const button = Array.from(dialog.querySelectorAll("button")).find((candidate) =>
            candidate.textContent?.includes("Confirm") ||
            candidate.textContent?.includes("确认")
          );
          if (!(button instanceof HTMLButtonElement) || button.disabled) {
            return false;
          }

          button.click();
          return true;
        })()`,
      ),
    Boolean,
    "Expected shared prompt dialog action",
  );

  expect(submitted).toBe(true);
}

async function clickElementBySelector(view: Bun.WebView, selector: string): Promise<void> {
  const found = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const element = document.querySelector(${JSON.stringify(selector)});
          if (!(element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement)) {
            return false;
          }
          if (element instanceof HTMLButtonElement && element.disabled) {
            return false;
          }
          element.click();
          return true;
        })()`,
      ),
    Boolean,
    `Expected clickable element: ${selector}`,
  );

  expect(found).toBe(true);
}

async function _pressElementBySelector(view: Bun.WebView, selector: string): Promise<void> {
  const found = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const element = document.querySelector(${JSON.stringify(selector)});
          if (!(element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement)) {
            return false;
          }
          if (element instanceof HTMLButtonElement && element.disabled) {
            return false;
          }

          element.focus();
          element.dispatchEvent(new PointerEvent("pointerdown", {
            bubbles: true,
            button: 0,
            buttons: 1,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          }));
          element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
          element.dispatchEvent(new PointerEvent("pointerup", {
            bubbles: true,
            button: 0,
            buttons: 0,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          }));
          element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
          element.click();
          element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter" }));
          element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter" }));
          return true;
        })()`,
      ),
    Boolean,
    `Expected pressable element: ${selector}`,
  );

  expect(found).toBe(true);
}

async function _clickAnyElementBySelector(view: Bun.WebView, selector: string): Promise<void> {
  const found = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const element = document.querySelector(${JSON.stringify(selector)});
          if (!(element instanceof HTMLElement)) {
            return false;
          }

          element.click();
          return true;
        })()`,
      ),
    Boolean,
    `Expected clickable element: ${selector}`,
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

async function selectOptionByText(
  view: Bun.WebView,
  triggerSelector: string,
  optionText: string,
): Promise<void> {
  const opened = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const trigger = document.querySelector(${JSON.stringify(triggerSelector)});
          if (!(trigger instanceof HTMLElement)) {
            return false;
          }
          trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          trigger.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          trigger.click();
          return true;
        })()`,
      ),
    Boolean,
    `Expected select trigger: ${triggerSelector}`,
  );
  expect(opened).toBe(true);

  const selected = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const option = Array.from(
            document.querySelectorAll('[data-slot="select-item"], [role="option"]')
          ).find((candidate) => candidate.textContent?.includes(${JSON.stringify(optionText)}));
          if (!(option instanceof HTMLElement)) {
            return false;
          }
          option.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          option.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          option.click();
          return true;
        })()`,
      ),
    Boolean,
    `Expected select option containing text: ${optionText}`,
  );
  expect(selected).toBe(true);
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

async function setCheckboxChecked(
  view: Bun.WebView,
  selector: string,
  checked: boolean,
): Promise<void> {
  const found = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const input = document.querySelector(${JSON.stringify(selector)});
          if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") {
            return false;
          }
          input.checked = ${JSON.stringify(checked)};
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        })()`,
      ),
    Boolean,
    `Expected checkbox: ${selector}`,
  );

  expect(found).toBe(true);
}

async function expectInputValue(view: Bun.WebView, selector: string, value: string): Promise<void> {
  await waitFor(
    () =>
      view.evaluate<string | null>(
        `(() => {
          const input = document.querySelector(${JSON.stringify(selector)});
          if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
            return null;
          }

          return input.value;
        })()`,
      ),
    (current) => current === value,
    `Expected input ${selector} to equal ${value}`,
  );
}

async function clickFormSubmit(view: Bun.WebView, selector: string): Promise<void> {
  const found = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const form = document.querySelector(${JSON.stringify(selector)});
          const button = form?.querySelector("button[type='submit']");
          if (!(button instanceof HTMLButtonElement) || button.disabled) {
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

async function expectLinkWithoutHrefByText(
  view: Bun.WebView,
  texts: [string, ...string[]],
): Promise<void> {
  await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const texts = ${JSON.stringify(texts)};
          const element = Array.from(document.querySelectorAll("a")).find((candidate) =>
            texts.some((text) => candidate.textContent?.includes(text))
          );
          return element instanceof HTMLAnchorElement && !element.hasAttribute("href");
        })()`,
      ),
    Boolean,
    `Expected link without href containing one of: ${texts.join(" | ")}`,
  );
}

async function expectNoEnabledLinkByText(
  view: Bun.WebView,
  texts: [string, ...string[]],
): Promise<void> {
  await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const texts = ${JSON.stringify(texts)};
          return Array.from(document.querySelectorAll("a")).every((candidate) => {
            const matches = texts.some((text) => candidate.textContent?.includes(text));
            return !matches || !candidate.hasAttribute("href") || candidate.getAttribute("aria-disabled") === "true";
          });
        })()`,
      ),
    Boolean,
    `Expected no enabled link containing one of: ${texts.join(" | ")}`,
  );
}

async function installMockTerminalWebSocket(view: Bun.WebView): Promise<void> {
  await view.evaluate<void>(`(() => {
    window.__appaloftTerminalSocketUrls = [];
    window.__appaloftTerminalSocketMessages = [];
    class MockTerminalWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      constructor(url) {
        this.url = String(url);
        this.readyState = MockTerminalWebSocket.CONNECTING;
        window.__appaloftTerminalSocketUrls.push(this.url);
        setTimeout(() => {
          this.readyState = MockTerminalWebSocket.OPEN;
          this.onopen?.(new Event("open"));
          this.onmessage?.({
            data: JSON.stringify({
              kind: "ready",
              sessionId: "term_webview",
              workingDirectory: "/var/lib/appaloft/runtime/local-deployments/dep_demo/source",
            }),
          });
        }, 0);
      }
      send(data) {
        try {
          window.__appaloftTerminalSocketMessages.push(JSON.parse(String(data)));
        } catch {
          window.__appaloftTerminalSocketMessages.push(String(data));
        }
      }
      close() {
        this.readyState = MockTerminalWebSocket.CLOSED;
        this.onclose?.(new Event("close"));
      }
    }
    window.WebSocket = MockTerminalWebSocket;
  })()`);
}

async function terminalSocketMessages(view: Bun.WebView): Promise<unknown[]> {
  return view.evaluate<unknown[]>("window.__appaloftTerminalSocketMessages ?? []");
}

function isTerminalResizeFrame(message: unknown): boolean {
  return (
    isRecord(message) &&
    message.kind === "resize" &&
    typeof message.rows === "number" &&
    message.rows > 0 &&
    typeof message.cols === "number" &&
    message.cols > 0
  );
}

beforeAll(async () => {
  await setupWebApp();
}, 20_000);

afterAll(async () => {
  await teardownWebApp();
}, 20_000);

describe.serial("console e2e with Bun.WebView", () => {
  test("renders the console dashboard with mocked control-plane data", async () => {
    activeScenario = "dashboard";

    await using view = createWebView();
    await view.navigate(`${previewUrl}/`);

    await expectAnyText(view, ["Projects", "项目"]);
    await expectAnyText(view, ["Quick deploy", "快速部署"]);
    await expectAnyText(view, ["Workspace", "工作区"]);
    await expectText(view, "Demo");
    await expectText(view, "workspace");
    await expectAnyText(view, ["Access", "访问地址"]);
    await expectAnyText(view, ["succeeded", "SUCCEEDED", "UNKNOWN"]);
    await expectAnyText(view, ["Recent deployments", "最近部署"]);
    const homeProjectLayout = JSON.parse(
      await view.evaluate<string>(`(() => {
        const cards = Array.from(document.querySelectorAll('[data-home-project-row]'));
        const firstCard = cards[0];
        const secondCard = cards[1];
        const metrics = firstCard?.querySelector('.nothing-project-metrics');
        const accessRow = firstCard?.querySelector('.nothing-project-access-row');
        const firstRect = firstCard?.getBoundingClientRect();
        const secondRect = secondCard?.getBoundingClientRect();
        const metricsRect = metrics?.getBoundingClientRect();
        const accessRect = accessRow?.getBoundingClientRect();
        return JSON.stringify({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          cardCount: cards.length,
          firstCardHasHeader: Boolean(firstCard?.querySelector('.nothing-project-card-header')),
          firstCardHasMetrics: Boolean(metrics),
          firstCardHasAccessRow: Boolean(accessRow),
          projectGap: firstRect && secondRect ? secondRect.top - firstRect.bottom : null,
          metricsTouchesCardEdges:
            Boolean(firstRect && metricsRect) &&
            Math.abs(metricsRect.left - firstRect.left) <= 1 &&
            Math.abs(metricsRect.right - firstRect.right) <= 1,
          accessTouchesCardEdges:
            Boolean(firstRect && accessRect) &&
            Math.abs(accessRect.left - firstRect.left) <= 1 &&
            Math.abs(accessRect.right - firstRect.right) <= 1,
        });
      })()`),
    ) as {
      clientWidth: number;
      scrollWidth: number;
      cardCount: number;
      firstCardHasHeader: boolean;
      firstCardHasMetrics: boolean;
      firstCardHasAccessRow: boolean;
      projectGap: number | null;
      metricsTouchesCardEdges: boolean;
      accessTouchesCardEdges: boolean;
    };
    expect(homeProjectLayout.cardCount).toBeGreaterThan(0);
    expect(homeProjectLayout.firstCardHasHeader).toBe(true);
    expect(homeProjectLayout.firstCardHasMetrics).toBe(true);
    expect(homeProjectLayout.firstCardHasAccessRow).toBe(true);
    if (homeProjectLayout.projectGap !== null) {
      expect(homeProjectLayout.projectGap).toBeGreaterThanOrEqual(12);
    }
    expect(homeProjectLayout.metricsTouchesCardEdges).toBe(true);
    expect(homeProjectLayout.accessTouchesCardEdges).toBe(true);
    expect(homeProjectLayout.scrollWidth).toBeLessThanOrEqual(homeProjectLayout.clientWidth);

    await view.navigate(`${previewUrl}/projects`);
    await expectAnyText(view, ["Projects", "项目"]);
    await expectText(view, "Grid Project 01");
    await expectAnyText(view, ["Resources", "资源"]);

    await view.navigate(`${previewUrl}/deployments`);
    await expectText(view, "workspace");
    await expectText(view, "Demo");
    await expectText(view, "production");
    await expectAnyText(view, ["succeeded", "SUCCEEDED"]);

    await clickButtonByAnyText(view, ["Quick deploy", "快速部署"]);
    await expectAnyText(view, ["GitHub repository", "GitHub 仓库"]);
    await clickButtonByAnyText(view, ["GitHub repository", "GitHub 仓库"]);
    await expectAnyText(view, ["Public Git URL", "公开 GitHub 仓库"]);
    await clickButtonByAnyText(view, ["GitHub App", "GitHub App"]);
    await expectAnyText(view, ["GitHub URL", "GitHub URL"]);
  }, 45_000);

  test("[PROJ-LIFE-REORDER-005] renders paginated draggable project cards", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView({ width: 1536, height: 900 });
    await view.navigate(`${previewUrl}/projects`);
    await expectText(view, "Grid Project 01");
    await expectText(view, "Grid Project 12");
    await waitFor(
      () =>
        view.evaluate<string>(
          `document.querySelector('[data-project-pagination]')?.textContent ?? ''`,
        ),
      (text) => text.includes("1-12") && text.includes("13"),
      "Expected project pagination to show the current range and total",
    );

    const desktopLayout = JSON.parse(
      await view.evaluate<string>(`(() => {
        const cards = Array.from(document.querySelectorAll('[data-project-card]'));
        const firstRowTop = cards[0]?.getBoundingClientRect().top ?? 0;
        const firstRowCards = cards.filter((card) =>
          Math.abs(card.getBoundingClientRect().top - firstRowTop) <= 2
        );
        return JSON.stringify({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          cardCount: cards.length,
          firstRowCount: firstRowCards.length,
          hasGrid: Boolean(document.querySelector('[data-project-grid]')),
          handleCount: document.querySelectorAll('[data-project-reorder-handle]').length,
          hasPagination: Boolean(document.querySelector('[data-project-pagination]')),
        });
      })()`),
    ) as {
      clientWidth: number;
      scrollWidth: number;
      cardCount: number;
      firstRowCount: number;
      hasGrid: boolean;
      handleCount: number;
      hasPagination: boolean;
    };
    expect(desktopLayout.hasGrid).toBe(true);
    expect(desktopLayout.hasPagination).toBe(true);
    expect(desktopLayout.cardCount).toBe(12);
    expect(desktopLayout.handleCount).toBe(12);
    expect(desktopLayout.firstRowCount).toBeGreaterThanOrEqual(3);
    expect(desktopLayout.firstRowCount).toBeLessThanOrEqual(4);
    expect(desktopLayout.scrollWidth).toBeLessThanOrEqual(desktopLayout.clientWidth);

    const dragged = await view.evaluate<boolean>(`(() => {
      const cards = Array.from(document.querySelectorAll('[data-project-card]'));
      const source = cards[0];
      const target = cards[2];
      if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
        return false;
      }

      const dragStart = new DragEvent('dragstart', {
        bubbles: true,
        dataTransfer: new DataTransfer(),
      });
      source.dispatchEvent(dragStart);
      target.dispatchEvent(new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dragStart.dataTransfer,
      }));
      target.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dragStart.dataTransfer,
      }));
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
      return true;
    })()`);
    expect(dragged).toBe(true);

    const reorderRequest = await waitForRecordedRequest("/api/rpc/projects/reorder");
    const reorderInput = readOrpcJsonPayload(reorderRequest.body) as {
      projectIds?: string[];
      startOffset?: number;
    };
    expect(reorderInput.startOffset).toBe(0);
    expect(reorderInput.projectIds?.slice(0, 3)).toEqual([
      "prj_grid_02",
      "prj_grid_03",
      "prj_grid_01",
    ]);

    await using mobileView = createWebView({ width: 390, height: 844 });
    await mobileView.navigate(`${previewUrl}/projects`);
    await expectText(mobileView, "Grid Project 01");
    const mobileLayout = JSON.parse(
      await mobileView.evaluate<string>(`(() => {
        const cards = Array.from(document.querySelectorAll('[data-project-card]'));
        const firstRowTop = cards[0]?.getBoundingClientRect().top ?? 0;
        const firstRowCards = cards.filter((card) =>
          Math.abs(card.getBoundingClientRect().top - firstRowTop) <= 2
        );
        return JSON.stringify({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          cardCount: cards.length,
          firstRowCount: firstRowCards.length,
        });
      })()`),
    ) as {
      clientWidth: number;
      scrollWidth: number;
      cardCount: number;
      firstRowCount: number;
    };
    expect(mobileLayout.cardCount).toBe(12);
    expect(mobileLayout.firstRowCount).toBe(1);
    expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(mobileLayout.clientWidth);
  }, 45_000);

  test("[SRV-LIFE-REORDER-003] renders paginated draggable server cards", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView({ width: 1536, height: 900 });
    await view.navigate(`${previewUrl}/servers`);
    await expectText(view, "edge");
    await expectText(view, "Grid Server 12");
    await waitFor(
      () =>
        view.evaluate<string>(
          `document.querySelector('[data-server-pagination]')?.textContent ?? ''`,
        ),
      (text) => text.includes("1-12") && text.includes("13"),
      "Expected server pagination to show the current range and total",
    );

    const desktopLayout = JSON.parse(
      await view.evaluate<string>(`(() => {
        const cards = Array.from(document.querySelectorAll('[data-server-card]'));
        const firstRowTop = cards[0]?.getBoundingClientRect().top ?? 0;
        const firstRowCards = cards.filter((card) =>
          Math.abs(card.getBoundingClientRect().top - firstRowTop) <= 2
        );
        return JSON.stringify({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          cardCount: cards.length,
          firstRowCount: firstRowCards.length,
          hasGrid: Boolean(document.querySelector('[data-server-grid]')),
          handleCount: document.querySelectorAll('[data-server-reorder-handle]').length,
          hasPagination: Boolean(document.querySelector('[data-server-pagination]')),
        });
      })()`),
    ) as {
      clientWidth: number;
      scrollWidth: number;
      cardCount: number;
      firstRowCount: number;
      hasGrid: boolean;
      handleCount: number;
      hasPagination: boolean;
    };
    expect(desktopLayout.hasGrid).toBe(true);
    expect(desktopLayout.hasPagination).toBe(true);
    expect(desktopLayout.cardCount).toBe(12);
    expect(desktopLayout.handleCount).toBe(12);
    expect(desktopLayout.firstRowCount).toBeGreaterThanOrEqual(3);
    expect(desktopLayout.firstRowCount).toBeLessThanOrEqual(4);
    expect(desktopLayout.scrollWidth).toBeLessThanOrEqual(desktopLayout.clientWidth);

    const dragged = await view.evaluate<boolean>(`(() => {
      const cards = Array.from(document.querySelectorAll('[data-server-card]'));
      const source = cards[0];
      const target = cards[2];
      if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
        return false;
      }

      const dragStart = new DragEvent('dragstart', {
        bubbles: true,
        dataTransfer: new DataTransfer(),
      });
      source.dispatchEvent(dragStart);
      target.dispatchEvent(new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dragStart.dataTransfer,
      }));
      target.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dragStart.dataTransfer,
      }));
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
      return true;
    })()`);
    expect(dragged).toBe(true);

    const reorderRequest = await waitForRecordedRequest("/api/rpc/servers/reorder");
    const reorderInput = readOrpcJsonPayload(reorderRequest.body) as {
      serverIds?: string[];
      startOffset?: number;
    };
    expect(reorderInput.startOffset).toBe(0);
    expect(reorderInput.serverIds?.slice(0, 3)).toEqual(["srv_grid_02", "srv_grid_03", "srv_demo"]);

    await using mobileView = createWebView({ width: 390, height: 844 });
    await mobileView.navigate(`${previewUrl}/servers`);
    await expectText(mobileView, "edge");
    const mobileLayout = JSON.parse(
      await mobileView.evaluate<string>(`(() => {
        const cards = Array.from(document.querySelectorAll('[data-server-card]'));
        const firstRowTop = cards[0]?.getBoundingClientRect().top ?? 0;
        const firstRowCards = cards.filter((card) =>
          Math.abs(card.getBoundingClientRect().top - firstRowTop) <= 2
        );
        return JSON.stringify({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          cardCount: cards.length,
          firstRowCount: firstRowCards.length,
        });
      })()`),
    ) as {
      clientWidth: number;
      scrollWidth: number;
      cardCount: number;
      firstRowCount: number;
    };
    expect(mobileLayout.cardCount).toBe(12);
    expect(mobileLayout.firstRowCount).toBe(1);
    expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(mobileLayout.clientWidth);
  }, 45_000);

  test("[QUICK-DEPLOY-UX-004][QUICK-DEPLOY-UX-005] locks selected Blueprint source and renders its icon", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(
      `${previewUrl}/deploy?source=blueprint&sourceExtension=blueprint-catalog.quick-deploy-source&blueprintSlug=baserow&blueprintTitle=Baserow&step=project&projectMode=new&projectName=Baserow&serverMode=new`,
    );

    await expectText(view, "Baserow");
    await expectText(view, "已从蓝图市场选择应用");

    const renderedStateJson = await waitFor(
      () =>
        view.evaluate<string>(`JSON.stringify({
        sourcePickerCount: document.querySelectorAll('[data-quick-deploy-source-picker]').length,
        blueprintCatalogSourceVisible: document.body.innerText.includes('蓝图目录来源'),
        blueprintSourceAddressVisible: document.body.innerText.includes('/marketplace?surface=quick-deploy'),
        sourceExtensionDisplayNameVisible: document.body.innerText.includes('Server Configured Extensions'),
        blueprintVariableKeys: Array.from(document.querySelectorAll('[data-blueprint-variable-key]'))
          .map((input) => input.getAttribute('data-blueprint-variable-key')),
        serverDraftValues: {
          name: document.querySelector('#server-name')?.value ?? null,
          host: document.querySelector('#server-host')?.value ?? null,
          port: document.querySelector('#server-port')?.value ?? null,
        },
        baserowIconImages: Array.from(document.querySelectorAll('img'))
          .filter((img) => img.alt.includes('Baserow'))
          .map((img) => ({ alt: img.alt, width: img.naturalWidth, height: img.naturalHeight })),
        summaryBaserowIconImages: Array.from(document.querySelectorAll('[data-blueprint-summary-icon] img'))
          .filter((img) => img.alt.includes('Baserow'))
          .map((img) => ({ alt: img.alt, width: img.naturalWidth, height: img.naturalHeight })),
        bodyText: document.body.innerText,
      })`),
      (stateJson) => {
        const state = JSON.parse(stateJson) as {
          baserowIconImages: Array<{ width: number; height: number }>;
          summaryBaserowIconImages: Array<{ width: number; height: number }>;
        };
        return (
          state.baserowIconImages.some((image) => image.width > 0 && image.height > 0) &&
          state.summaryBaserowIconImages.some((image) => image.width > 0 && image.height > 0)
        );
      },
      "Expected selected Blueprint icon to render",
    );
    const renderedState = JSON.parse(renderedStateJson) as {
      sourcePickerCount: number;
      blueprintCatalogSourceVisible: boolean;
      blueprintSourceAddressVisible: boolean;
      sourceExtensionDisplayNameVisible: boolean;
      blueprintVariableKeys: string[];
      serverDraftValues: { name: string | null; host: string | null; port: string | null };
      baserowIconImages: Array<{ alt: string; width: number; height: number }>;
      summaryBaserowIconImages: Array<{ alt: string; width: number; height: number }>;
    };

    expect(renderedState.sourcePickerCount).toBe(0);
    expect(renderedState.blueprintCatalogSourceVisible).toBe(false);
    expect(renderedState.blueprintSourceAddressVisible).toBe(false);
    expect(renderedState.sourceExtensionDisplayNameVisible).toBe(false);
    expect(renderedState.blueprintVariableKeys).toEqual(["DATABASE_URL", "SECRET_KEY"]);
    expect(renderedState.serverDraftValues).toEqual({ name: "", host: "", port: "" });
    expect(renderedState.baserowIconImages.length).toBeGreaterThanOrEqual(2);
    expect(renderedState.summaryBaserowIconImages).toEqual([
      expect.objectContaining({
        alt: "Baserow icon",
        width: expect.any(Number),
        height: expect.any(Number),
      }),
    ]);
    expect(renderedState.baserowIconImages[0]?.width).toBeGreaterThan(0);
    expect(renderedState.baserowIconImages[0]?.height).toBeGreaterThan(0);
    expect(renderedState.summaryBaserowIconImages[0]?.width).toBeGreaterThan(0);
    expect(renderedState.summaryBaserowIconImages[0]?.height).toBeGreaterThan(0);
  }, 45_000);

  test("[QUICK-DEPLOY-UX-004] locks remote Blueprint URL entries without showing Marketplace selection", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const blueprintUrl =
      "https://raw.githubusercontent.com/appaloft/one-click-deploy-docker-demo/main/appaloft.blueprint.yaml";

    await using view = createWebView();
    await view.navigate(
      `${previewUrl}/deploy?source=blueprint&blueprintUrl=${encodeURIComponent(blueprintUrl)}&blueprintTitle=One-Click%20Docker%20Demo&blueprintProfile=production&step=project&projectMode=new&projectName=One-Click%20Docker%20Demo&serverMode=new`,
    );

    await expectText(view, "One-Click Docker Demo");
    await expectText(view, "自定义 Blueprint URL");

    const renderedStateJson = await waitFor(
      () =>
        view.evaluate<string>(`JSON.stringify({
        sourcePickerCount: document.querySelectorAll('[data-quick-deploy-source-picker]').length,
        normalizedBodyText: document.body.innerText.replace(/\\s+/g, ' '),
        blueprintUrl: new URL(window.location.href).searchParams.get('blueprintUrl'),
        sourceExtension: new URL(window.location.href).searchParams.get('sourceExtension'),
      })`),
      (stateJson) => {
        const state = JSON.parse(stateJson) as {
          sourcePickerCount: number;
          normalizedBodyText: string;
          blueprintUrl: string | null;
        };
        return (
          state.sourcePickerCount === 0 &&
          state.normalizedBodyText.includes("已从自定义 Blueprint URL 进入") &&
          state.normalizedBodyText.includes("自定义 Blueprint URL") &&
          state.blueprintUrl === blueprintUrl
        );
      },
      "Expected remote Blueprint entry to stay locked and preserve blueprintUrl",
    );
    const renderedState = JSON.parse(renderedStateJson) as {
      sourcePickerCount: number;
      normalizedBodyText: string;
      blueprintUrl: string | null;
      sourceExtension: string | null;
    };

    expect(renderedState.sourcePickerCount).toBe(0);
    expect(renderedState.normalizedBodyText).toContain("已从自定义 Blueprint URL 进入");
    expect(renderedState.normalizedBodyText).not.toContain("尚未选择蓝图");
    expect(renderedState.normalizedBodyText).not.toContain("访问方式 蓝图市场");
    expect(renderedState.normalizedBodyText).not.toContain("Access 蓝图市场");
    expect(renderedState.normalizedBodyText).toContain("自定义 Blueprint URL");
    expect(renderedState.blueprintUrl).toBe(blueprintUrl);
    expect(renderedState.sourceExtension).toBe(null);
  }, 45_000);

  test("[QUICK-DEPLOY-UX-004] keeps source choices visible when a Blueprint is selected inside quick deploy", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/deploy?source=blueprint&step=source`);

    await expectAnyText(view, ["No Blueprint selected", "尚未选择蓝图"]);
    await clickButtonByAnyText(view, ["Choose Blueprint", "选择蓝图"]);
    await expectText(view, "Baserow");
    await clickButtonByAnyText(view, ["Select Blueprint", "选择蓝图"]);
    await expectText(view, "Baserow");

    const renderedStateJson = await waitFor(
      () =>
        view.evaluate<string>(`JSON.stringify({
        sourcePickerCount: document.querySelectorAll('[data-quick-deploy-source-picker]').length,
        lockedIntroVisible: document.body.innerText.includes('已从蓝图市场选择应用'),
        blueprintCatalogSourceVisible: document.body.innerText.includes('蓝图目录来源'),
        sourceExtensionDisplayNameVisible: document.body.innerText.includes('Server Configured Extensions'),
      })`),
      (stateJson) => {
        const state = JSON.parse(stateJson) as {
          sourcePickerCount: number;
          blueprintCatalogSourceVisible: boolean;
        };
        return state.sourcePickerCount === 1 && state.blueprintCatalogSourceVisible;
      },
      "Expected quick deploy source picker to remain visible after selecting a Blueprint in the source step",
    );
    const renderedState = JSON.parse(renderedStateJson) as {
      sourcePickerCount: number;
      lockedIntroVisible: boolean;
      blueprintCatalogSourceVisible: boolean;
      sourceExtensionDisplayNameVisible: boolean;
    };

    expect(renderedState.sourcePickerCount).toBe(1);
    expect(renderedState.lockedIntroVisible).toBe(false);
    expect(renderedState.blueprintCatalogSourceVisible).toBe(true);
    expect(renderedState.sourceExtensionDisplayNameVisible).toBe(false);
  }, 45_000);

  test("[QUICK-DEPLOY-UX-005] keeps focus while typing a new project name", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(
      `${previewUrl}/deploy?source=blueprint&sourceExtension=public-blueprints.quick-deploy-source&blueprintSlug=teable&blueprintTitle=Teable&blueprintVariant=community&projectMode=new&serverId=srv_demo`,
    );

    await waitFor(
      () =>
        view.evaluate<boolean>(
          "document.querySelector('#project-name') instanceof HTMLInputElement",
        ),
      Boolean,
      "Expected project name input to render",
    );

    const focusStateJson = await waitFor(
      () =>
        view.evaluate<string>(`new Promise((resolve) => {
          const input = document.querySelector("#project-name");
          if (!(input instanceof HTMLInputElement)) {
            resolve(JSON.stringify({ ready: false }));
            return;
          }

          input.focus();
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true }));
          input.value = "t";
          input.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            data: "t",
            inputType: "insertText",
          }));
          input.dispatchEvent(new KeyboardEvent("keyup", { key: "t", bubbles: true }));

          setTimeout(() => {
            const active = document.activeElement;
            const projectDetails = input.closest("details");
            resolve(JSON.stringify({
              ready: true,
              activeId: active instanceof HTMLElement ? active.id : "",
              inputValue: input.value,
              projectDetailsOpen: projectDetails instanceof HTMLDetailsElement ? projectDetails.open : false,
              urlProjectName: new URL(window.location.href).searchParams.get("projectName"),
            }));
          }, 0);
        })`),
      (stateJson) => {
        const state = JSON.parse(stateJson) as {
          activeId?: string;
          inputValue?: string;
          projectDetailsOpen?: boolean;
          urlProjectName?: string | null;
        };
        return (
          state.activeId === "project-name" &&
          state.inputValue === "t" &&
          state.projectDetailsOpen === true &&
          state.urlProjectName === "t"
        );
      },
      "Expected project name input to keep focus after typing",
    );
    const focusState = JSON.parse(focusStateJson) as {
      activeId: string;
      inputValue: string;
      projectDetailsOpen: boolean;
      urlProjectName: string | null;
    };

    expect(focusState.activeId).toBe("project-name");
    expect(focusState.inputValue).toBe("t");
    expect(focusState.projectDetailsOpen).toBe(true);
    expect(focusState.urlProjectName).toBe("t");
  }, 45_000);

  test("[BLUEPRINT-WEB-001] hydrates Quick Deploy from public neutral Blueprint detail", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(
      `${previewUrl}/deploy?source=blueprint&sourceExtension=public-blueprints.quick-deploy-source&blueprintSlug=teable&blueprintTitle=Teable&blueprintVariant=community&step=source`,
    );

    const renderedStateJson = await waitFor(
      () =>
        view.evaluate<string>(`JSON.stringify({
          bodyText: document.body.innerText,
          dependencyKinds: Array.from(document.querySelectorAll('[data-blueprint-dependency-kind]'))
            .map((node) => node.textContent),
          secretKeys: Array.from(document.querySelectorAll('[data-blueprint-secret-key]'))
            .map((input) => input.getAttribute('data-blueprint-secret-key')),
          variableKeys: Array.from(document.querySelectorAll('[data-blueprint-variable-key]'))
            .map((input) => input.getAttribute('data-blueprint-variable-key')),
        })`),
      (stateJson) => {
        const state = JSON.parse(stateJson) as {
          bodyText: string;
          secretKeys: string[];
        };
        return (
          state.bodyText.includes("Teable Postgres") &&
          state.bodyText.includes("Teable Redis") &&
          state.secretKeys.includes("SECRET_KEY")
        );
      },
      "Expected public neutral Blueprint detail to hydrate Quick Deploy dependencies",
    );
    const renderedState = JSON.parse(renderedStateJson) as {
      bodyText: string;
      dependencyKinds: string[];
      secretKeys: string[];
      variableKeys: string[];
    };

    expect(renderedState.bodyText).toContain("Teable");
    expect(renderedState.bodyText).toContain("Postgres");
    expect(renderedState.bodyText).toContain("Redis");
    expect(renderedState.bodyText).toContain("Teable assets");
    expect(renderedState.secretKeys).toEqual(["SECRET_KEY"]);
    expect(renderedState.variableKeys).toEqual(["BACKEND_CACHE_PROVIDER"]);
  }, 45_000);

  test("[BLUEPRINT-WEB-003] renders Marketplace detail from public neutral Blueprint detail", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(
      `${previewUrl}/marketplace/teable?returnTo=${encodeURIComponent("/deploy?sourceExtension=public-blueprints.quick-deploy-source")}`,
    );

    const renderedStateJson = await waitFor(
      () =>
        view.evaluate<string>(`JSON.stringify({
          bodyText: document.body.innerText,
          heading: document.querySelector('h1')?.textContent ?? '',
          unavailableVisible: document.body.innerText.includes('蓝图暂不可用'),
          upgradeDryRunVisible: document.body.innerText.includes('升级 dry-run'),
          installedApplicationInputVisible: Boolean(document.querySelector('[data-blueprint-upgrade-from-installed-application]')),
        })`),
      (stateJson) => {
        const state = JSON.parse(stateJson) as {
          bodyText: string;
          unavailableVisible: boolean;
        };
        return (
          state.bodyText.includes("Teable") &&
          state.bodyText.includes("Teable Postgres") &&
          !state.unavailableVisible
        );
      },
      "Expected public neutral Blueprint detail to render the Marketplace detail page",
    );
    const renderedState = JSON.parse(renderedStateJson) as {
      bodyText: string;
      heading: string;
      unavailableVisible: boolean;
      upgradeDryRunVisible: boolean;
      installedApplicationInputVisible: boolean;
    };

    expect(renderedState.heading).toContain("Teable");
    expect(renderedState.bodyText).toContain("Postgres");
    expect(renderedState.bodyText).toContain("Redis");
    expect(renderedState.unavailableVisible).toBe(false);
    expect(renderedState.upgradeDryRunVisible).toBe(false);
    expect(renderedState.installedApplicationInputVisible).toBe(false);
  }, 45_000);

  test("[BLUEPRINT-WEB-002] submits Quick Deploy Blueprint source through the neutral install operation", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(
      `${previewUrl}/deploy?source=blueprint&sourceExtension=public-blueprints.quick-deploy-source&blueprintSlug=teable&blueprintTitle=Teable&blueprintVariant=community&projectId=prj_demo&serverId=srv_demo&step=source`,
    );

    await setInputValue(
      view,
      "[data-blueprint-secret-value='SECRET_KEY']",
      "teable-web-secret-not-production",
    );
    await clickElementBySelector(view, "[data-quick-deploy-action-panel] button");

    const installRequest = await waitForRecordedRequest("/api/rpc/blueprints/install");
    const installInput = readOrpcJsonPayload(installRequest.body) as {
      slug?: string;
      profile?: string;
      variant?: string;
      dependencyProvisioning?: Array<{
        requirementId?: string;
        kind?: string;
        providerKey?: string;
        capabilities?: unknown;
        target?: { serverId?: string };
      }>;
      target?: {
        projectId?: string;
        projectName?: string;
        environmentId?: string;
        environmentName?: string;
        serverId?: string;
      };
      secretValues?: Array<{ key?: string; value?: string }>;
      acknowledgements?: string[];
    };

    expect(installRequest.method).toBe("POST");
    expect(installInput.slug).toBe("teable");
    expect(installInput.variant).toBe("community");
    expect(installInput.profile).toBe("production");
    expect(installInput.target).toMatchObject({
      projectId: "prj_demo",
      projectName: "Demo",
      environmentId: "env_demo",
      environmentName: "production",
      serverId: "srv_demo",
    });
    expect(installInput.dependencyProvisioning?.map((item) => item.requirementId)).toEqual([
      "postgres",
      "redis",
      "assets",
    ]);
    expect(
      installInput.dependencyProvisioning?.every((item) => item.target?.serverId === "srv_demo"),
    ).toBe(true);
    expect(installInput.dependencyProvisioning?.every((item) => !("capabilities" in item))).toBe(
      true,
    );
    expect(installInput.secretValues).toEqual([
      { key: "SECRET_KEY", value: "teable-web-secret-not-production" },
    ]);
    expect(installInput.acknowledgements).toContain("accepts-blueprint-application-bundle");
    expect(recordedApiRequests.some((request) => request.pathname === "/api/deployments")).toBe(
      false,
    );
    expect(
      recordedApiRequests.some((request) => request.pathname.includes("dependencyResources")),
    ).toBe(false);
    expect(recordedApiRequests.some((request) => request.pathname.startsWith("/cloud/"))).toBe(
      false,
    );
    await expectText(view, "http://teable.example.test");
  }, 45_000);

  test("[DEP-RES-WEB-001] manages Docker-backed dependency resources from the console", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/dependency-resources`);

    await expectAnyText(view, ["Dependency resources", "依赖资源"]);
    await expectText(view, "primary-postgres");
    await expectText(view, "cache-redis");
    await expectText(view, "appaloft-postgres-dres_pg");
    await expectText(view, "postgresql://appaloft:****@primary-postgres:5432/appaloft");

    await clickButtonByAnyText(view, ["Create dependency resource", "创建依赖资源"]);
    await setInputValue(view, "#dependency-resource-name-input", "reporting-db");
    await clickFormSubmit(view, "#dependency-resource-create-form");

    const planRequest = await waitForRecordedRequest(
      "/api/rpc/dependencyResources/provisioning/plan",
    );
    expect(readOrpcJsonPayload(planRequest.body)).toEqual({
      mode: "create",
      create: {
        environmentId: "env_demo",
        kind: "postgres",
        name: "reporting-db",
        projectId: "prj_demo",
        serverId: "srv_demo",
      },
    });
    await expectText(view, "drp_reporting_db");
    await setCheckboxChecked(view, "#dependency-resource-provisioning-accept-input", true);
    await clickButtonByAnyText(view, ["Accept plan", "接受计划"]);

    const acceptRequest = await waitForRecordedRequest(
      "/api/rpc/dependencyResources/provisioning/accept",
    );
    expect(readOrpcJsonPayload(acceptRequest.body)).toEqual({
      acknowledgeMutation: true,
      planId: "drp_reporting_db",
    });
    await expectText(view, "dres_reporting-db");

    await clickElementBySelector(view, "#dependency-resource-backup-action-dres_pg");
    const backupRequest = await waitForRecordedRequest("/api/rpc/dependencyResources/createBackup");
    expect(readOrpcJsonPayload(backupRequest.body)).toEqual({
      dependencyResourceId: "dres_pg",
    });

    await expectText(view, "bak_dres_pg");
    await setCheckboxChecked(view, "#dependency-resource-restore-data-ack-input", true);
    await setCheckboxChecked(view, "#dependency-resource-restore-runtime-ack-input", true);
    await clickButtonByAnyText(view, ["Restore backup", "恢复备份"]);

    const restoreRequest = await waitForRecordedRequest(
      "/api/rpc/dependencyResources/restoreBackup",
    );
    expect(readOrpcJsonPayload(restoreRequest.body)).toEqual({
      acknowledgeDataOverwrite: true,
      acknowledgeRuntimeNotRestarted: true,
      backupId: "bak_dres_pg",
    });

    await clickElementBySelector(view, "#dependency-resource-delete-action-dres_pg");
    const deleteRequest = await waitForRecordedRequest("/api/rpc/dependencyResources/delete");
    expect(readOrpcJsonPayload(deleteRequest.body)).toEqual({
      dependencyResourceId: "dres_pg",
    });
  }, 45_000);

  test("[SELF-HOSTED-AUTH-E2E-001] bootstraps first admin, signs in locally, and deploys from console", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();
    resetSelfHostedAuthE2eState({ bootstrapRequired: true });

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/`);

      await expectLocation(view, "/bootstrap/auth/first-admin");
      await expectAnyText(view, ["First admin setup", "首次管理员设置"]);
      await setInputValue(view, "input[type='email']", "admin@example.com");
      await setInputValue(view, "input[autocomplete='name']", "Admin User");
      await clickFormSubmit(view, "form");

      await expectText(view, selfHostedAuthE2eGeneratedPassword);
      const bootstrapRequest = await waitForRecordedRequest("/api/rpc/auth/bootstrapFirstAdmin");
      expect(readOrpcJsonPayload(bootstrapRequest.body)).toEqual({
        displayName: "Admin User",
        email: "admin@example.com",
      });

      await clickButtonByAnyText(view, ["Go to login", "前往登录"]);
      await expectLocation(view, "/login");
      await setInputValue(view, "input[type='email']", "admin@example.com");
      await setInputValue(view, "input[type='password']", selfHostedAuthE2eGeneratedPassword);
      await clickFormSubmit(view, "form");
      await expectLocation(view, "/");

      const loginRequest = await waitForRecordedRequest("/api/auth/sign-in/email");
      expect(loginRequest.body).toEqual({
        callbackURL: "/",
        email: "admin@example.com",
        password: selfHostedAuthE2eGeneratedPassword,
      });

      await view.navigate(
        `${previewUrl}/projects/prj_demo/environments/env_demo/resources/res_demo/deployments/new`,
      );
      await expectAnyText(view, ["Quick deploy", "快速部署"]);
      await clickButtonByAnyText(view, ["Create deployment", "创建部署"]);

      const deploymentRequest = await waitForRecordedRequest("/api/deployments");
      expect(deploymentRequest.body).toEqual(
        expect.objectContaining({
          environmentId: "env_demo",
          projectId: "prj_demo",
          resourceId: "res_demo",
          serverId: "srv_demo",
        }),
      );
    } finally {
      resetSelfHostedAuthE2eState();
    }
  }, 45_000);

  test("[SELF-HOSTED-AUTH-WEB-001] signs out from the console shell", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();
    resetSelfHostedAuthE2eState();

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/`);

      await waitFor(
        () =>
          view.evaluate<boolean>(
            `Boolean(document.querySelector("[data-console-user-menu-trigger]"))`,
          ),
        Boolean,
        "Expected console user menu trigger",
      );
      await view.evaluate<void>(`(async () => {
        await fetch("/api/auth/sign-out", { method: "POST" });
        window.location.href = "/login";
      })()`);
      await expectLocation(view, "/login");

      const signOutRequest = await waitForRecordedRequest("/api/auth/sign-out");
      expect(signOutRequest.method).toBe("POST");
      expect(signOutRequest.body).toBeNull();
    } finally {
      resetSelfHostedAuthE2eState();
    }
  }, 45_000);

  test("[SYSTEM-DIAG-004] renders configured maintenance worker activation from system doctor", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();
    resetSelfHostedAuthE2eState();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/instance?section=maintenance`);

    await expectAnyText(view, ["Scheduled maintenance workers", "定时维护 workers"]);
    await expectAnyText(view, ["This panel does not start workers", "这个面板不会启动 worker"]);
    await expectAnyText(view, ["1/7 enabled", "1/7 ENABLED", "1/7 已启用"]);
    await expectAnyText(view, ["Scheduled task runner", "Scheduled task runner"]);
    await expectAnyText(view, ["Scheduled runtime prune runner", "Scheduled runtime prune runner"]);
    await expectAnyText(view, ["Runtime monitoring collector", "Runtime monitoring collector"]);
    await expectText(view, "runtime-monitoring.collect");
    await expectAnyText(view, ["Starts with backend service", "随后端服务启动"]);
    await expectAnyText(view, ["Policy-gated prune only", "仅按 policy 执行 prune"]);
    await expectAnyText(view, ["Read-only monitoring collection", "只读 monitoring 采集"]);
    await expectText(view, "APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED");
    await expectText(view, "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED");

    await waitForRecordedRequest("/api/rpc/system/doctor");
    expect(recordedApiRequests.some((request) => request.pathname.includes("prune"))).toBe(false);
    expect(recordedApiRequests.some((request) => request.pathname.includes("cleanup"))).toBe(false);
    expect(
      recordedApiRequests.some((request) => request.pathname === "/api/rpc/scheduledTasks/runNow"),
    ).toBe(false);

    await clickButtonByAnyText(view, ["Refresh doctor", "刷新 doctor"]);
    await waitFor(
      async () =>
        recordedApiRequests.filter((request) => request.pathname === "/api/rpc/system/doctor")
          .length,
      (count) => count >= 2,
      "Expected refreshing the maintenance worker panel to call system doctor again",
    );
  }, 45_000);

  test("[TERM-SESSION-WEB-001] manages active terminal sessions from Instance management", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();
    resetSelfHostedAuthE2eState();

    const previousListRoute = apiResponses.dashboard["/api/rpc/terminalSessions/list"];
    const previousCloseRoute = apiResponses.dashboard["/api/rpc/terminalSessions/close"];
    const previousExpireRoute = apiResponses.dashboard["/api/rpc/terminalSessions/expire"];
    let terminalSessions = [
      {
        sessionId: "term_active",
        scope: "resource",
        serverId: "srv_demo",
        resourceId: "res_demo",
        deploymentId: "dep_demo",
        transport: {
          kind: "websocket",
          path: "/api/terminal-sessions/term_active/attach",
        },
        providerKey: "generic-ssh",
        workingDirectory: "/var/lib/appaloft/runtime/ssh-deployments/dep_demo/source",
        createdAt: "2026-01-01T00:00:00.000Z",
        status: "active",
        lastOutput: "SECRET_TOKEN=do-not-render",
      },
      {
        sessionId: "term_old",
        scope: "server",
        serverId: "srv_demo",
        transport: {
          kind: "websocket",
          path: "/api/terminal-sessions/term_old/attach",
        },
        providerKey: "generic-ssh",
        createdAt: "2025-12-31T22:00:00.000Z",
        status: "active",
      },
    ];

    apiResponses.dashboard["/api/rpc/terminalSessions/list"] = () => ({
      json: {
        schemaVersion: "terminal-sessions.list/v1",
        items: terminalSessions,
      },
    });
    apiResponses.dashboard["/api/rpc/terminalSessions/expire"] = () => {
      terminalSessions = terminalSessions.filter((session) => session.sessionId !== "term_old");
      return {
        json: {
          expiredCount: 1,
          sessionIds: ["term_old"],
        },
      };
    };
    apiResponses.dashboard["/api/rpc/terminalSessions/close"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as { sessionId?: string } | null;
      terminalSessions = terminalSessions.filter(
        (session) => session.sessionId !== (input?.sessionId ?? "term_active"),
      );
      return {
        json: {
          sessionId: input?.sessionId ?? "term_active",
          closed: true,
          status: "closed",
        },
      };
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/instance?section=sessions`);

      await expectAnyText(view, ["Active terminal sessions", "活跃终端会话"]);
      await expectText(view, "term_active");
      await expectText(view, "term_old");
      await expectText(view, "/var/lib/appaloft/runtime/ssh-deployments/dep_demo/source");
      expect(await pageText(view)).not.toContain("SECRET_TOKEN=do-not-render");

      await clickButtonByAnyText(view, ["Expire old sessions", "过期旧会话"]);
      await acceptConsoleConfirm(view);
      const expireRequest = await waitForRecordedRequest("/api/rpc/terminalSessions/expire");
      const expireInput = readOrpcJsonPayload(expireRequest.body);
      expect(expireInput).toEqual({
        olderThan: expect.any(String),
        limit: 50,
      });
      await expectAnyText(view, ["Old terminal sessions expired", "旧终端会话已过期"]);
      await waitFor(
        () => pageText(view),
        (content) => content.includes("term_active") && !content.includes("term_old"),
        "Expected old terminal session to disappear after expiry",
      );

      await clickButtonByAnyText(view, ["Close terminal", "关闭终端"]);
      await acceptConsoleConfirm(view);
      const closeRequest = await waitForRecordedRequest("/api/rpc/terminalSessions/close");
      expect(readOrpcJsonPayload(closeRequest.body)).toEqual({
        sessionId: "term_active",
      });
      await expectAnyText(view, ["Terminal session closed", "终端会话已关闭"]);
      await waitFor(
        () => pageText(view),
        (content) =>
          content.includes("No active terminal sessions") || content.includes("当前没有可见"),
        "Expected active terminal sessions to be empty after close",
      );
    } finally {
      apiResponses.dashboard["/api/rpc/terminalSessions/list"] = previousListRoute;
      if (previousCloseRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/terminalSessions/close"];
      } else {
        apiResponses.dashboard["/api/rpc/terminalSessions/close"] = previousCloseRoute;
      }
      if (previousExpireRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/terminalSessions/expire"];
      } else {
        apiResponses.dashboard["/api/rpc/terminalSessions/expire"] = previousExpireRoute;
      }
    }
  }, 45_000);

  test("[PROJ-LIFE-ENTRY-005][PROJ-LIFE-ENTRY-006] manages project settings through named operations", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/projects/prj_demo?tab=settings`);
    await expectAnyText(view, ["Project settings", "项目设置"]);
    await expectAnyText(view, ["They do not create deployments", "不会创建 deployment"]);

    const showRequest = await waitForRecordedRequest("/api/rpc/projects/show");
    expect(readOrpcJsonPayload(showRequest.body)).toEqual({
      projectId: "prj_demo",
    });

    await setInputValue(view, "#project-name", "Customer API");
    await clickFormSubmit(view, "#project-rename-form");

    const renameRequest = await waitForRecordedRequest("/api/rpc/projects/rename");
    expect(readOrpcJsonPayload(renameRequest.body)).toEqual({
      projectId: "prj_demo",
      name: "Customer API",
    });

    const archiveClicked = await waitFor(
      () =>
        view.evaluate<boolean>(
          `(() => {
            const button = document.querySelector("#project-archive-button");
            if (!(button instanceof HTMLButtonElement)) {
              return false;
            }
            button.click();
            return true;
          })()`,
        ),
      Boolean,
      "Expected project archive button",
    );
    expect(archiveClicked).toBe(true);
    await acceptConsoleConfirm(view);

    const archiveRequest = await waitForRecordedRequest("/api/rpc/projects/archive");
    expect(readOrpcJsonPayload(archiveRequest.body)).toEqual({
      projectId: "prj_demo",
    });

    expect(recordedApiRequests.some((request) => request.pathname === "/api/deployments")).toBe(
      false,
    );
    expect(
      recordedApiRequests.some((request) => request.pathname === "/api/rpc/resources/create"),
    ).toBe(false);
    expect(
      recordedApiRequests.some((request) => request.pathname === "/api/rpc/environments/create"),
    ).toBe(false);
  }, 45_000);

  test("[PROJ-LIFE-ENTRY-007] disables project-scoped creation affordances for archived projects", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();
    const previousListRoute = apiResponses.dashboard["/api/rpc/projects/list"];
    const previousShowRoute = apiResponses.dashboard["/api/rpc/projects/show"];
    const archivedProject = {
      id: "prj_demo",
      name: "Demo",
      slug: "demo",
      description: "Demo project",
      lifecycleStatus: "archived",
      archivedAt: "2026-01-01T00:00:05.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    apiResponses.dashboard["/api/rpc/projects/list"] = {
      json: {
        items: [archivedProject],
      },
    };
    apiResponses.dashboard["/api/rpc/projects/show"] = {
      json: archivedProject,
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/projects/prj_demo?tab=settings`);
      await expectAnyText(view, ["Archived", "已归档"]);
      await expectAnyText(view, ["new mutations are blocked", "新的变更会被阻止"]);

      await expectNoEnabledLinkByText(view, ["Create resource", "创建资源"]);

      const renameDisabledRestoreAvailable = await waitFor(
        () =>
          view.evaluate<boolean>(
            `(() => {
              const input = document.querySelector("#project-name");
              const restoreButton = document.querySelector("#project-restore-button");
              return input instanceof HTMLInputElement &&
                restoreButton instanceof HTMLButtonElement &&
                input.disabled &&
                !restoreButton.disabled;
            })()`,
          ),
        Boolean,
        "Expected archived project rename to be disabled and restore to be available",
      );
      expect(renameDisabledRestoreAvailable).toBe(true);

      const restoreClicked = await waitFor(
        () =>
          view.evaluate<boolean>(
            `(() => {
              const button = document.querySelector("#project-restore-button");
              if (!(button instanceof HTMLButtonElement)) {
                return false;
              }
              button.click();
              return true;
            })()`,
          ),
        Boolean,
        "Expected project restore button",
      );
      expect(restoreClicked).toBe(true);
      await acceptConsoleConfirm(view);

      const restoreRequest = await waitForRecordedRequest("/api/rpc/projects/restore");
      expect(readOrpcJsonPayload(restoreRequest.body)).toEqual({
        projectId: "prj_demo",
      });
    } finally {
      apiResponses.dashboard["/api/rpc/projects/list"] = previousListRoute;
      apiResponses.dashboard["/api/rpc/projects/show"] = previousShowRoute;
    }
  }, 15_000);

  test("[PROJ-LIFE-ENTRY-008-WEB] deletes an archived project through delete-check gated action", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();
    const previousListRoute = apiResponses.dashboard["/api/rpc/projects/list"];
    const previousShowRoute = apiResponses.dashboard["/api/rpc/projects/show"];
    const archivedProject = {
      id: "prj_demo",
      name: "Demo",
      slug: "demo",
      description: "Demo project",
      lifecycleStatus: "archived",
      archivedAt: "2026-01-01T00:00:05.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    apiResponses.dashboard["/api/rpc/projects/list"] = {
      json: {
        items: [archivedProject],
      },
    };
    apiResponses.dashboard["/api/rpc/projects/show"] = {
      json: archivedProject,
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/projects/prj_demo`);

      const deleteReady = await waitFor(
        () =>
          view.evaluate<boolean>(
            `(() => {
              const button = document.querySelector("#project-delete-button");
              return button instanceof HTMLButtonElement && !button.disabled;
            })()`,
          ),
        Boolean,
        "Expected delete button to be enabled by project delete-check",
      );
      expect(deleteReady).toBe(true);

      const deleteClicked = await waitFor(
        () =>
          view.evaluate<boolean>(
            `(() => {
              const button = document.querySelector("#project-delete-button");
              if (!(button instanceof HTMLButtonElement)) {
                return false;
              }
              button.click();
              return true;
            })()`,
          ),
        Boolean,
        "Expected project delete button",
      );
      expect(deleteClicked).toBe(true);
      await submitConsolePrompt(view, "prj_demo");

      const deleteCheckRequest = await waitForRecordedRequest("/api/rpc/projects/deleteCheck");
      expect(readOrpcJsonPayload(deleteCheckRequest.body)).toEqual({
        projectId: "prj_demo",
      });
      const deleteRequest = await waitForRecordedRequest("/api/rpc/projects/delete");
      expect(readOrpcJsonPayload(deleteRequest.body)).toEqual({
        projectId: "prj_demo",
        confirmation: { projectId: "prj_demo" },
      });
    } finally {
      apiResponses.dashboard["/api/rpc/projects/list"] = previousListRoute;
      apiResponses.dashboard["/api/rpc/projects/show"] = previousShowRoute;
    }
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

  test("[RES-DETAIL-IA-001] redirects removed resource settings URLs to their owning tabs", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo`);
    await expectAnyText(view, ["Network profile", "网络配置"]);
    const resourceNavigationState = JSON.parse(
      await view.evaluate<string>(`JSON.stringify((() => {
        const resourceLinks = Array.from(document.querySelectorAll("a"))
          .map((anchor) => new URL(anchor.href).pathname + new URL(anchor.href).search)
          .filter((href) => href.startsWith("/resources/res_demo"));
        const overviewRail = document.querySelector("aside");
        const overviewRailLinks = Array.from(overviewRail?.querySelectorAll("a") ?? [])
          .map((anchor) => new URL(anchor.href).pathname + new URL(anchor.href).search);

        return {
          hasRemovedSettingsLink: resourceLinks.some((href) => href.includes("tab=settings")),
          hasDependenciesTab: resourceLinks.includes("/resources/res_demo?tab=dependencies"),
          hasEnvironmentTab: resourceLinks.includes("/resources/res_demo?tab=environment"),
          hasPromotedSectionLink: overviewRailLinks.some((href) =>
            href.includes("section=configuration") ||
            href.includes("section=dependencies") ||
            href.includes("section=domains") ||
            href.includes("section=usage"),
          ),
          overviewRailClass: overviewRail?.getAttribute("class") ?? "",
          overviewGridClass: overviewRail?.parentElement?.getAttribute("class") ?? "",
          overviewContentClass: overviewRail?.nextElementSibling?.getAttribute("class") ?? "",
        };
      })())`),
    ) as {
      hasRemovedSettingsLink: boolean;
      hasDependenciesTab: boolean;
      hasEnvironmentTab: boolean;
      hasPromotedSectionLink: boolean;
      overviewRailClass: string;
      overviewGridClass: string;
      overviewContentClass: string;
    };
    expect(resourceNavigationState).toMatchObject({
      hasRemovedSettingsLink: false,
      hasDependenciesTab: true,
      hasEnvironmentTab: true,
      hasPromotedSectionLink: false,
    });
    expect(resourceNavigationState.overviewRailClass).toContain("lg:border-r");
    expect(resourceNavigationState.overviewGridClass).toContain("grid");
    expect(resourceNavigationState.overviewGridClass).toContain("min-w-0");
    expect(resourceNavigationState.overviewGridClass).toContain("border-b");
    expect(resourceNavigationState.overviewContentClass).toContain("p-5");

    await using mobileView = createWebView({ width: 390, height: 900 });
    await mobileView.navigate(`${previewUrl}/resources/res_demo`);
    await expectAnyText(mobileView, ["Network profile", "网络配置"]);
    const mobileNavigationState = JSON.parse(
      await mobileView.evaluate<string>(`JSON.stringify((() => {
        const resourceLinks = Array.from(document.querySelectorAll("a"))
          .map((anchor) => new URL(anchor.href).pathname + new URL(anchor.href).search)
          .filter((href) => href.startsWith("/resources/res_demo"));
        const overviewRail = document.querySelector("aside");
        return {
          bodyOverflows: document.documentElement.scrollWidth > window.innerWidth + 1,
          hasRemovedSettingsLink: resourceLinks.some((href) => href.includes("tab=settings")),
          hasDependenciesTab: resourceLinks.includes("/resources/res_demo?tab=dependencies"),
          hasEnvironmentTab: resourceLinks.includes("/resources/res_demo?tab=environment"),
          overviewRailClass: overviewRail?.getAttribute("class") ?? "",
          overviewContentClass: overviewRail?.nextElementSibling?.getAttribute("class") ?? "",
        };
      })())`),
    ) as {
      bodyOverflows: boolean;
      hasRemovedSettingsLink: boolean;
      hasDependenciesTab: boolean;
      hasEnvironmentTab: boolean;
      overviewRailClass: string;
      overviewContentClass: string;
    };
    expect(mobileNavigationState).toMatchObject({
      bodyOverflows: false,
      hasRemovedSettingsLink: false,
      hasDependenciesTab: true,
      hasEnvironmentTab: true,
    });
    expect(mobileNavigationState.overviewRailClass).toContain("border-b");
    expect(mobileNavigationState.overviewContentClass).toContain("p-5");

    await view.navigate(`${previewUrl}/resources/res_demo?tab=settings&section=dependencies`);

    await expectAnyText(view, ["Dependencies", "依赖资源"]);
    await waitFor(
      () => view.evaluate<string>("window.location.search"),
      (search) => search === "?tab=dependencies",
      "Expected legacy dependency settings URL to be replaced by the top-level dependencies tab",
    );

    await view.navigate(`${previewUrl}/resources/res_demo?tab=settings&section=configuration`);
    await expectAnyText(view, ["Configuration", "配置变量"]);
    await waitFor(
      () => view.evaluate<string>("window.location.search"),
      (search) => search === "?tab=environment",
      "Expected legacy configuration settings URL to be replaced by the environment tab",
    );
  }, 15_000);

  test("[RES-DIAG-ENTRY-001] copies resource diagnostic JSON from resource detail", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousDiagnosticRoute = apiResponses.dashboard["/api/rpc/resources/diagnosticSummary"];
    const copyPayload = JSON.stringify({
      schemaVersion: "resources.diagnostic-summary.copy/v1",
      resourceId: "res_demo",
      deploymentId: "dep_demo",
      sectionErrors: [
        {
          code: "resource_runtime_logs_unavailable",
          phase: "runtime-log-observation",
        },
      ],
    });

    apiResponses.dashboard["/api/rpc/resources/diagnosticSummary"] = {
      json: {
        schemaVersion: "resources.diagnostic-summary/v1",
        generatedAt: "2026-01-01T00:00:10.000Z",
        focus: {
          resourceId: "res_demo",
          deploymentId: "dep_demo",
        },
        context: {
          projectId: "prj_demo",
          environmentId: "env_demo",
          resourceName: "workspace",
          resourceSlug: "workspace",
          resourceKind: "application",
          destinationId: "dst_demo",
          serverId: "srv_demo",
          services: [],
        },
        access: {
          status: "failed",
          proxyRouteStatus: "ready",
          reasonCode: "default_access_route_unavailable",
          phase: "access-observation",
        },
        proxy: {
          status: "available",
          providerKey: "traefik",
          configurationIncluded: true,
          routeCount: 1,
          sectionCount: 0,
        },
        deploymentLogs: {
          status: "not-requested",
          tailLimit: 20,
          lineCount: 0,
          lines: [],
        },
        runtimeLogs: {
          status: "unavailable",
          tailLimit: 20,
          lineCount: 0,
          lines: [],
        },
        system: {
          entrypoint: "web",
        },
        sourceErrors: [
          {
            source: "runtime-logs",
            code: "resource_runtime_logs_unavailable",
            category: "runtime_observation",
            phase: "runtime-log-observation",
            retryable: true,
            relatedEntityId: "res_demo",
          },
        ],
        redaction: {
          policy: "deployment-environment-secrets",
          masked: false,
          maskedValueCount: 0,
        },
        copy: {
          json: copyPayload,
        },
      },
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/resources/res_demo?section=diagnostics`);
      await view.evaluate<void>(`(() => {
        window.__appaloftCopiedText = "";
        window.appaloftDesktop = {
          copyText: async (text) => {
            window.__appaloftCopiedText = text;
          },
        };
      })()`);

      await expectAnyText(view, ["Diagnostics", "诊断"]);
      await clickButtonByAnyText(view, ["Copy diagnostic JSON", "复制诊断 JSON"]);

      const diagnosticRequest = await waitForRecordedRequest(
        "/api/rpc/resources/diagnosticSummary",
      );
      expect(readOrpcJsonPayload(diagnosticRequest.body)).toEqual({
        resourceId: "res_demo",
        deploymentId: "dep_demo",
        includeDeploymentLogTail: true,
        includeRuntimeLogTail: true,
        includeProxyConfiguration: true,
        tailLines: 20,
      });

      await waitFor(
        () => view.evaluate<string>("window.__appaloftCopiedText ?? ''"),
        (copied) => copied === copyPayload,
        "Expected diagnostic copy payload to be written through the desktop bridge",
      );
      expect(JSON.parse(copyPayload)).toMatchObject({
        resourceId: "res_demo",
        deploymentId: "dep_demo",
      });
    } finally {
      if (previousDiagnosticRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/resources/diagnosticSummary"];
      } else {
        apiResponses.dashboard["/api/rpc/resources/diagnosticSummary"] = previousDiagnosticRoute;
      }
    }
  }, 15_000);

  test("[TERM-SESSION-ENTRY-001] opens and attaches a resource terminal from Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo`);
    await expectText(view, "workspace");
    await installMockTerminalWebSocket(view);

    await clickButtonByAnyText(view, ["Terminal", "终端"]);
    const openRequest = await waitForRecordedRequest("/api/rpc/terminalSessions/open");
    expect(readOrpcJsonPayload(openRequest.body)).toMatchObject({
      scope: {
        kind: "resource",
        resourceId: "res_demo",
        deploymentId: "dep_demo",
      },
      initialRows: 24,
      initialCols: 80,
    });

    await waitFor(
      () => terminalSocketMessages(view),
      (messages) => messages.some(isTerminalResizeFrame),
      "Expected terminal WebSocket resize frame after attach",
    );
    await expectText(view, ".../local-deployments/dep_demo/source");
  }, 15_000);

  test("[TERM-SESSION-ENTRY-002] opens and attaches a server terminal from Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/servers/srv_demo`);
    await expectText(view, "edge");
    await installMockTerminalWebSocket(view);

    await clickButtonByAnyText(view, ["Terminal", "终端"]);
    const openRequest = await waitForRecordedRequest("/api/rpc/terminalSessions/open");
    expect(readOrpcJsonPayload(openRequest.body)).toMatchObject({
      scope: {
        kind: "server",
        serverId: "srv_demo",
      },
      initialRows: 24,
      initialCols: 80,
    });

    await waitFor(
      () => terminalSocketMessages(view),
      (messages) => messages.some(isTerminalResizeFrame),
      "Expected server terminal WebSocket resize frame after attach",
    );
  }, 15_000);

  test("[TERM-SESSION-ENTRY-003] closes an attached Web terminal when navigating away", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo`);
    await expectText(view, "workspace");
    await installMockTerminalWebSocket(view);

    await clickButtonByAnyText(view, ["Terminal", "终端"]);
    await waitFor(
      () => terminalSocketMessages(view),
      (messages) => messages.some((message) => isRecord(message) && message.kind === "resize"),
      "Expected terminal resize frame before navigation cleanup",
    );

    await clickLinkByHref(view, "/projects");
    await waitFor(
      () => terminalSocketMessages(view),
      (messages) => messages.some((message) => isRecord(message) && message.kind === "close"),
      "Expected terminal close frame after navigation",
    );
  }, 15_000);

  test("[TERM-SESSION-ENTRY-010] closes an attached Web terminal from the panel action", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo`);
    await expectText(view, "workspace");
    await installMockTerminalWebSocket(view);

    await clickButtonByAnyText(view, ["Terminal", "终端"]);
    await waitFor(
      () => terminalSocketMessages(view),
      (messages) => messages.some((message) => isRecord(message) && message.kind === "resize"),
      "Expected terminal resize frame before explicit close",
    );

    await clickButtonByAnyText(view, ["Close terminal", "关闭终端"]);
    await waitFor(
      () => terminalSocketMessages(view),
      (messages) => messages.some((message) => isRecord(message) && message.kind === "close"),
      "Expected terminal close frame after explicit close action",
    );
  }, 15_000);

  test("[SCHED-TASK-ENTRY-001] resource detail exposes scheduled task Web controls", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo?tab=scheduled-tasks`);

    await expectAnyText(view, ["Scheduled tasks", "定时任务"]);
    await expectText(view, "bun run db:migrate");

    const listRequest = await waitForRecordedRequest("/api/rpc/scheduledTasks/list");
    expect(readOrpcJsonPayload(listRequest.body)).toEqual({
      resourceId: "res_demo",
      limit: 25,
    });

    await setInputValue(view, "#scheduled-task-command-intent", "bun run cache:warm");
    await clickButtonByAnyText(view, ["Create task", "创建任务"]);

    const createRequest = await waitForRecordedRequest("/api/rpc/scheduledTasks/create");
    expect(readOrpcJsonPayload(createRequest.body)).toEqual({
      resourceId: "res_demo",
      schedule: "*/5 * * * *",
      timezone: "UTC",
      commandIntent: "bun run cache:warm",
      timeoutSeconds: 300,
      retryLimit: 0,
      concurrencyPolicy: "forbid",
      status: "enabled",
    });

    await clickButtonByAnyText(view, ["Run now", "立即运行"]);

    const runRequest = await waitForRecordedRequest("/api/rpc/scheduledTasks/runNow");
    expect(readOrpcJsonPayload(runRequest.body)).toEqual({
      taskId: "tsk_demo_migrate",
      resourceId: "res_demo",
    });

    await waitFor(
      () =>
        view.evaluate<boolean>(
          `(() => {
            const button = document.querySelector("#scheduled-task-run-logs-str_demo_latest");
            if (!(button instanceof HTMLButtonElement)) {
              return false;
            }
            button.click();
            return true;
          })()`,
        ),
      Boolean,
      "Expected scheduled task run logs button",
    );

    const logsRequest = await waitForRecordedRequest("/api/rpc/scheduledTasks/runs/logs");
    expect(readOrpcJsonPayload(logsRequest.body)).toEqual({
      runId: "str_demo_latest",
      taskId: "tsk_demo_migrate",
      resourceId: "res_demo",
      limit: 100,
    });
    await expectText(view, "migration complete", 12_000);
  }, 25_000);

  test("[DEP-RES-WEB-001][DEP-RES-BACKUP-011] manages dependency backup and bindings from Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousDependencyListRoute = apiResponses.dashboard["/api/rpc/dependencyResources/list"];
    const previousBackupListRoute =
      apiResponses.dashboard["/api/rpc/dependencyResources/listBackups"];
    const previousCreateBackupRoute =
      apiResponses.dashboard["/api/rpc/dependencyResources/createBackup"];
    const previousRestoreBackupRoute =
      apiResponses.dashboard["/api/rpc/dependencyResources/restoreBackup"];
    const previousBindingListRoute =
      apiResponses.dashboard["/api/rpc/resources/dependencyBindings/list"];
    const previousBindRoute = apiResponses.dashboard["/api/rpc/resources/dependencyBindings/bind"];
    const previousRotateRoute =
      apiResponses.dashboard["/api/rpc/resources/dependencyBindings/rotateSecret"];
    const previousUnbindRoute =
      apiResponses.dashboard["/api/rpc/resources/dependencyBindings/unbind"];
    const dependencyResources: Array<Record<string, unknown>> = [
      {
        id: "rsi_pg_web",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Managed DB",
        slug: "managed-db",
        kind: "postgres",
        sourceMode: "appaloft-managed",
        providerKey: "appaloft-managed-postgres",
        providerManaged: true,
        lifecycleStatus: "ready",
        connection: {
          host: "managed-db.postgres.internal",
          port: 5432,
          databaseName: "managed_db",
          maskedConnection: "postgres://app:********@managed-db.postgres.internal:5432/managed_db",
          secretRef: "secret://dependency/postgres/rsi_pg_web",
        },
        providerRealization: {
          status: "ready",
          attemptId: "dpr_web",
          attemptedAt: "2026-01-01T00:00:00.000Z",
          providerResourceHandle: "pg/rsi_pg_web",
          realizedAt: "2026-01-01T00:00:00.000Z",
        },
        bindingReadiness: { status: "ready" },
        deleteSafety: { safeToDelete: true, blockers: [] },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const dependencyBackups: Array<Record<string, unknown>> = [
      {
        id: "drb_web_ready",
        dependencyResourceId: "rsi_pg_web",
        projectId: "prj_demo",
        environmentId: "env_demo",
        dependencyKind: "postgres",
        providerKey: "appaloft-managed-postgres",
        status: "ready",
        attemptId: "dba_web_ready",
        requestedAt: "2026-01-01T00:00:00.000Z",
        retentionStatus: "retained",
        providerArtifactHandle: "backup/rsi_pg_web/drb_web_ready",
        completedAt: "2026-01-01T00:00:01.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    let dependencyBindings: Array<Record<string, unknown>> = [];

    apiResponses.dashboard["/api/rpc/dependencyResources/list"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as {
        environmentId?: string;
        projectId?: string;
      } | null;
      return {
        json: {
          schemaVersion: "dependency-resources.list/v1",
          items:
            input?.projectId === "prj_demo" && input.environmentId === "env_demo"
              ? dependencyResources
              : [],
          generatedAt: "2026-01-01T00:00:01.000Z",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/dependencyResources/listBackups"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as { dependencyResourceId?: string } | null;
      return {
        json: {
          schemaVersion: "dependency-resources.backups.list/v1",
          items: dependencyBackups.filter(
            (backup) => backup.dependencyResourceId === input?.dependencyResourceId,
          ),
          generatedAt: "2026-01-01T00:00:02.000Z",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/dependencyResources/createBackup"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as {
        dependencyResourceId?: string;
      } | null;
      dependencyBackups.push({
        id: "drb_web_created",
        dependencyResourceId: input?.dependencyResourceId ?? "rsi_pg_web",
        projectId: "prj_demo",
        environmentId: "env_demo",
        dependencyKind: "postgres",
        providerKey: "appaloft-managed-postgres",
        status: "ready",
        attemptId: "dba_web_created",
        requestedAt: "2026-01-01T00:10:00.000Z",
        retentionStatus: "retained",
        providerArtifactHandle: "backup/rsi_pg_web/drb_web_created",
        completedAt: "2026-01-01T00:10:01.000Z",
        createdAt: "2026-01-01T00:10:00.000Z",
      });
      return {
        json: {
          id: "drb_web_created",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/dependencyResources/restoreBackup"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as { backupId?: string } | null;
      dependencyBackups[0] = {
        ...dependencyBackups[0],
        latestRestoreAttempt: {
          attemptId: "dra_web_restore",
          status: "completed",
          requestedAt: "2026-01-01T00:11:00.000Z",
          completedAt: "2026-01-01T00:11:01.000Z",
        },
      };
      return {
        json: {
          id: input?.backupId === "drb_web_ready" ? "dra_web_restore" : "dra_web_created",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/resources/dependencyBindings/list"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as { resourceId?: string } | null;
      return {
        json: {
          schemaVersion: "resources.dependency-bindings.list/v1",
          items: input?.resourceId === "res_demo" ? dependencyBindings : [],
          generatedAt: "2026-01-01T00:00:03.000Z",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/resources/dependencyBindings/bind"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as {
        dependencyResourceId?: string;
        resourceId?: string;
        targetName?: string;
      } | null;
      dependencyBindings = [
        {
          id: "rbd_web_pg",
          projectId: "prj_demo",
          environmentId: "env_demo",
          resourceId: input?.resourceId ?? "res_demo",
          dependencyResourceId: input?.dependencyResourceId ?? "rsi_pg_web",
          dependencyResourceName: "Managed DB",
          dependencyResourceSlug: "managed-db",
          kind: "postgres",
          sourceMode: "appaloft-managed",
          providerKey: "appaloft-managed-postgres",
          providerManaged: true,
          lifecycleStatus: "ready",
          target: {
            targetName: input?.targetName ?? "DATABASE_URL",
            scope: "runtime-only",
            injectionMode: "env",
            secretRef: "secret://dependency-binding/rbd_web_pg/current",
          },
          bindingReadiness: { status: "ready" },
          snapshotReadiness: { status: "ready" },
          status: "active",
          createdAt: "2026-01-01T00:12:00.000Z",
        },
      ];
      return {
        json: {
          id: "rbd_web_pg",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/resources/dependencyBindings/rotateSecret"] = () => {
      dependencyBindings = dependencyBindings.map((binding) => ({
        ...binding,
        secretRotation: {
          secretRef: "secret://dependency-binding/rbd_web_pg/v2",
          secretVersion: "rbsv_web_2",
          rotatedAt: "2026-01-01T00:13:00.000Z",
        },
      }));
      return {
        json: {
          id: "rbd_web_pg",
          rotatedAt: "2026-01-01T00:13:00.000Z",
          secretVersion: "rbsv_web_2",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/resources/dependencyBindings/unbind"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as { bindingId?: string } | null;
      dependencyBindings = dependencyBindings.filter(
        (binding) => binding.id !== (input?.bindingId ?? "rbd_web_pg"),
      );
      return {
        json: {
          id: input?.bindingId ?? "rbd_web_pg",
        },
      };
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/resources/res_demo?tab=dependencies`);

      await expectAnyText(view, ["Dependencies", "依赖资源"]);
      await expectText(view, "Managed DB");
      await expectText(
        view,
        "postgres://app:********@managed-db.postgres.internal:5432/managed_db",
      );

      const listRequest = await waitForRecordedRequest("/api/rpc/dependencyResources/list");
      expect(readOrpcJsonPayload(listRequest.body)).toEqual({
        projectId: "prj_demo",
        environmentId: "env_demo",
      });

      const backupsRequest = await waitForRecordedRequest(
        "/api/rpc/dependencyResources/listBackups",
      );
      expect(readOrpcJsonPayload(backupsRequest.body)).toEqual({
        dependencyResourceId: "rsi_pg_web",
      });
      await expectText(view, "backup/rsi_pg_web/drb_web_ready");

      await setInputValue(view, "#resource-dependency-backup-description", "before release");
      await clickButtonByAnyText(view, ["Create backup", "创建备份"]);
      const createBackupRequest = await waitForRecordedRequest(
        "/api/rpc/dependencyResources/createBackup",
      );
      expect(readOrpcJsonPayload(createBackupRequest.body)).toEqual({
        dependencyResourceId: "rsi_pg_web",
        description: "before release",
      });
      await expectAnyText(view, ["Dependency backup requested", "Dependency backup 已请求"]);

      await setInputValue(view, "#dependency-restore-label-drb_web_ready", "restore before deploy");
      await view.evaluate<void>(`(() => {
        for (const selector of [
          "#resource-dependency-restore-overwrite",
          "#resource-dependency-restore-runtime"
        ]) {
          const input = document.querySelector(selector);
          if (input instanceof HTMLInputElement) {
            input.checked = true;
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      })()`);
      await clickButtonByAnyText(view, ["Restore in place", "原地 restore"]);
      const restoreRequest = await waitForRecordedRequest(
        "/api/rpc/dependencyResources/restoreBackup",
      );
      expect(readOrpcJsonPayload(restoreRequest.body)).toEqual({
        backupId: "drb_web_ready",
        acknowledgeDataOverwrite: true,
        acknowledgeRuntimeNotRestarted: true,
        restoreLabel: "restore before deploy",
      });
      await expectAnyText(view, ["Dependency restore requested", "Dependency restore 已请求"]);

      await setInputValue(view, "#resource-dependency-target", "DATABASE_URL");
      await clickButtonByAnyText(view, ["Bind dependency", "绑定依赖"]);
      const bindRequest = await waitForRecordedRequest(
        "/api/rpc/resources/dependencyBindings/bind",
      );
      expect(readOrpcJsonPayload(bindRequest.body)).toEqual({
        resourceId: "res_demo",
        dependencyResourceId: "rsi_pg_web",
        targetName: "DATABASE_URL",
        scope: "runtime-only",
        injectionMode: "env",
      });
      await expectAnyText(view, ["Dependency bound", "依赖已绑定"]);

      await setInputValue(
        view,
        "#dependency-binding-secret-ref-rbd_web_pg",
        "secret://dependency-binding/rbd_web_pg/v2",
      );
      await view.evaluate<void>(`(() => {
        const input = document.querySelector("#dependency-binding-secret-ack-rbd_web_pg");
        if (input instanceof HTMLInputElement) {
          input.checked = true;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      })()`);
      await clickButtonByAnyText(view, ["Rotate secret", "轮换 secret"]);
      const rotateRequest = await waitForRecordedRequest(
        "/api/rpc/resources/dependencyBindings/rotateSecret",
      );
      expect(readOrpcJsonPayload(rotateRequest.body)).toEqual({
        resourceId: "res_demo",
        bindingId: "rbd_web_pg",
        secretRef: "secret://dependency-binding/rbd_web_pg/v2",
        confirmHistoricalSnapshotsRemainUnchanged: true,
      });
      await expectAnyText(view, [
        "Dependency binding secret rotated",
        "Dependency binding secret 已轮换",
      ]);

      await clickButtonByAnyText(view, ["Unbind", "Unbind"]);
      await acceptConsoleConfirm(view);
      const unbindRequest = await waitForRecordedRequest(
        "/api/rpc/resources/dependencyBindings/unbind",
      );
      expect(readOrpcJsonPayload(unbindRequest.body)).toEqual({
        resourceId: "res_demo",
        bindingId: "rbd_web_pg",
      });
      await expectAnyText(view, ["Dependency binding removed", "依赖绑定已移除"]);

      expect(recordedApiRequests.some((request) => request.pathname === "/api/deployments")).toBe(
        false,
      );
      expect(JSON.stringify(recordedApiRequests)).not.toContain("super-secret");
    } finally {
      if (previousDependencyListRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/dependencyResources/list"];
      } else {
        apiResponses.dashboard["/api/rpc/dependencyResources/list"] = previousDependencyListRoute;
      }
      if (previousBackupListRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/dependencyResources/listBackups"];
      } else {
        apiResponses.dashboard["/api/rpc/dependencyResources/listBackups"] =
          previousBackupListRoute;
      }
      if (previousCreateBackupRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/dependencyResources/createBackup"];
      } else {
        apiResponses.dashboard["/api/rpc/dependencyResources/createBackup"] =
          previousCreateBackupRoute;
      }
      if (previousRestoreBackupRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/dependencyResources/restoreBackup"];
      } else {
        apiResponses.dashboard["/api/rpc/dependencyResources/restoreBackup"] =
          previousRestoreBackupRoute;
      }
      if (previousBindingListRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/resources/dependencyBindings/list"];
      } else {
        apiResponses.dashboard["/api/rpc/resources/dependencyBindings/list"] =
          previousBindingListRoute;
      }
      if (previousBindRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/resources/dependencyBindings/bind"];
      } else {
        apiResponses.dashboard["/api/rpc/resources/dependencyBindings/bind"] = previousBindRoute;
      }
      if (previousRotateRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/resources/dependencyBindings/rotateSecret"];
      } else {
        apiResponses.dashboard["/api/rpc/resources/dependencyBindings/rotateSecret"] =
          previousRotateRoute;
      }
      if (previousUnbindRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/resources/dependencyBindings/unbind"];
      } else {
        apiResponses.dashboard["/api/rpc/resources/dependencyBindings/unbind"] =
          previousUnbindRoute;
      }
    }
  }, 20_000);

  test("[STOR-WEB-001][STOR-WEB-002][STOR-WEB-003] manages resource storage from Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousShowRoute = apiResponses.dashboard["/api/rpc/resources/show"];
    const previousStorageListRoute = apiResponses.dashboard["/api/rpc/storageVolumes/list"];
    const previousStorageCreateRoute = apiResponses.dashboard["/api/rpc/storageVolumes/create"];
    const previousStorageCleanupRoute =
      apiResponses.dashboard["/api/rpc/storageVolumes/cleanupRuntime"];
    const previousStorageBackupPlanRoute =
      apiResponses.dashboard["/api/rpc/storageVolumes/backups/plan"];
    const previousStorageBackupCreateRoute =
      apiResponses.dashboard["/api/rpc/storageVolumes/backups/create"];
    const previousStorageBackupListRoute =
      apiResponses.dashboard["/api/rpc/storageVolumes/backups/list"];
    const previousStorageBackupRestoreRoute =
      apiResponses.dashboard["/api/rpc/storageVolumes/backups/restore"];
    const previousStorageBackupPruneRoute =
      apiResponses.dashboard["/api/rpc/storageVolumes/backups/prune"];
    const previousAttachRoute = apiResponses.dashboard["/api/rpc/resources/attachStorage"];
    const previousDetachRoute = apiResponses.dashboard["/api/rpc/resources/detachStorage"];
    let storageBackups = [
      {
        id: "svb_uploads",
        storageVolumeId: "stv_uploads",
        projectId: "prj_demo",
        environmentId: "env_demo",
        storageVolumeKind: "named-volume",
        sourceAdapterKey: "tar-volume",
        targetProviderKey: "local-filesystem",
        targetRef: "/var/lib/appaloft/backups",
        consistency: "quiesced",
        status: "ready",
        attemptId: "sba_uploads",
        requestedAt: "2026-01-01T00:04:00.000Z",
        retentionStatus: "retained",
        localOnly: true,
        artifactHandle: "local://backups/svb_uploads.tar.zst",
        createdAt: "2026-01-01T00:04:00.000Z",
      },
    ];
    const storageVolumes = [
      {
        id: "stv_uploads",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "pocketbase-data",
        slug: "pocketbase-data",
        kind: "named-volume",
        lifecycleStatus: "active",
        attachmentCount: 1,
        attachments: [
          {
            attachmentId: "att_existing",
            resourceId: "res_demo",
            resourceName: "PocketBase",
            resourceSlug: "pocketbase",
            destinationPath: "/pb_data",
            mountMode: "read-write",
            dataFormat: "sqlite",
            applicationDataLabel: "PocketBase data",
            attachedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    let storageAttachments: Array<{
      id: string;
      storageVolumeId: string;
      storageVolumeName: string;
      storageVolumeKind: string;
      destinationPath: string;
      mountMode: string;
      dataFormat?: string;
      applicationDataLabel?: string;
      attachedAt: string;
    }> = [
      {
        id: "att_existing",
        storageVolumeId: "stv_uploads",
        storageVolumeName: "pocketbase-data",
        storageVolumeKind: "named-volume",
        destinationPath: "/pb_data",
        mountMode: "read-write",
        dataFormat: "sqlite",
        applicationDataLabel: "PocketBase data",
        attachedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    apiResponses.dashboard["/api/rpc/resources/show"] = () => {
      if (!isRecord(previousShowRoute) || !isRecord(previousShowRoute.json)) {
        throw new Error("Expected dashboard resources.show fixture object");
      }

      return {
        json: {
          ...previousShowRoute.json,
          storageAttachments,
        },
      };
    };
    apiResponses.dashboard["/api/rpc/storageVolumes/list"] = () => ({
      json: {
        schemaVersion: "storage-volumes.list/v1",
        items: storageVolumes,
        generatedAt: "2026-01-01T00:00:01.000Z",
      },
    });
    apiResponses.dashboard["/api/rpc/storageVolumes/create"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as {
        environmentId?: string;
        kind?: "named-volume" | "bind-mount";
        name?: string;
        projectId?: string;
      } | null;
      storageVolumes.push({
        id: "stv_cache",
        projectId: input?.projectId ?? "prj_demo",
        environmentId: input?.environmentId ?? "env_demo",
        name: input?.name ?? "cache",
        slug: "cache",
        kind: input?.kind ?? "named-volume",
        lifecycleStatus: "active",
        attachmentCount: 0,
        attachments: [],
        createdAt: "2026-01-01T00:01:00.000Z",
      });
      return {
        json: {
          id: "stv_cache",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/storageVolumes/cleanupRuntime"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as {
        before?: string;
        dryRun?: boolean;
        serverId?: string;
        storageVolumeId?: string;
      } | null;
      const dryRun = input?.dryRun ?? true;
      return {
        json: {
          schemaVersion: "storage-volumes.cleanup-runtime/v1",
          storageVolume: {
            id: input?.storageVolumeId ?? "stv_uploads",
            name: "uploads",
            kind: "named-volume",
          },
          server: {
            id: input?.serverId ?? "srv_demo",
            name: "edge",
            host: "127.0.0.1",
            port: 22,
            providerKey: "generic-ssh",
            targetKind: "single-server",
          },
          before: input?.before ?? "2026-01-01T00:00:00.000Z",
          dryRun,
          cleanedAt: "2026-01-01T00:02:00.000Z",
          summary: {
            inspectedCount: 1,
            matchedCount: 1,
            cleanedCount: dryRun ? 0 : 1,
            skippedCount: 0,
            blockedCount: 0,
          },
          candidates: [
            {
              id: "stvc_uploads",
              kind: "named-volume",
              target: "appaloft_res_demo_uploads",
              updatedAt: "2025-12-31T00:00:00.000Z",
              action: dryRun ? "matched" : "cleaned",
            },
          ],
          warnings: [],
        },
      };
    };
    apiResponses.dashboard["/api/rpc/storageVolumes/backups/plan"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as {
        requestedConsistency?: string;
        source?: { storageVolumeId?: string };
        target?: { providerKey?: string; targetRef?: string };
        retention?: { maxCount?: number; minFreeBytes?: number };
      } | null;
      return {
        json: {
          schemaVersion: "storage-volumes.backup-plan/v1",
          storageVolumeId: input?.source?.storageVolumeId ?? "stv_uploads",
          sourceAdapterKey: "tar-volume",
          targetProviderKey: input?.target?.providerKey ?? "local-filesystem",
          consistency: input?.requestedConsistency ?? "application-consistent",
          localOnly: true,
          retention: {
            maxCount: input?.retention?.maxCount ?? 3,
            minFreeBytes: input?.retention?.minFreeBytes ?? 1073741824,
          },
          blockers: [],
          warnings: [],
        },
      };
    };
    apiResponses.dashboard["/api/rpc/storageVolumes/backups/create"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as {
        planRequest?: {
          requestedConsistency?: string;
          source?: { storageVolumeId?: string };
          target?: { providerKey?: string; targetRef?: string };
        };
      } | null;
      storageBackups = [
        ...storageBackups,
        {
          id: "svb_created",
          storageVolumeId: input?.planRequest?.source?.storageVolumeId ?? "stv_uploads",
          projectId: "prj_demo",
          environmentId: "env_demo",
          storageVolumeKind: "named-volume",
          sourceAdapterKey: "tar-volume",
          targetProviderKey: input?.planRequest?.target?.providerKey ?? "local-filesystem",
          targetRef: input?.planRequest?.target?.targetRef ?? "/var/lib/appaloft/backups",
          consistency: input?.planRequest?.requestedConsistency ?? "application-consistent",
          status: "ready",
          attemptId: "sba_created",
          requestedAt: "2026-01-01T00:05:00.000Z",
          retentionStatus: "retained",
          localOnly: true,
          artifactHandle: "local://backups/svb_created.tar.zst",
          createdAt: "2026-01-01T00:05:00.000Z",
        },
      ];
      return {
        json: {
          id: "svb_created",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/storageVolumes/backups/list"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as { storageVolumeId?: string } | null;
      return {
        json: {
          schemaVersion: "storage-volumes.backups.list/v1",
          items: storageBackups.filter(
            (backup) => backup.storageVolumeId === (input?.storageVolumeId ?? "stv_uploads"),
          ),
          generatedAt: "2026-01-01T00:05:30.000Z",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/storageVolumes/backups/restore"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as { backupId?: string } | null;
      return {
        json: {
          id: input?.backupId ?? "svb_uploads",
          restoredStorageVolumeId: "stv_restored",
          restoreAttemptId: "sra_restored",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/storageVolumes/backups/prune"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as { backupId?: string } | null;
      storageBackups = storageBackups.map((backup) =>
        backup.id === (input?.backupId ?? "svb_uploads")
          ? { ...backup, status: "pruned", retentionStatus: "pruned" }
          : backup,
      );
      return {
        json: {
          id: input?.backupId ?? "svb_uploads",
          prunedAt: "2026-01-01T00:06:00.000Z",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/resources/attachStorage"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as {
        destinationPath?: string;
        mountMode?: "read-write" | "read-only";
        storageVolumeId?: string;
      } | null;
      storageAttachments = [
        ...storageAttachments,
        {
          id: "att_created",
          storageVolumeId: input?.storageVolumeId ?? "stv_uploads",
          storageVolumeName: "uploads",
          storageVolumeKind: "named-volume",
          destinationPath: input?.destinationPath ?? "/var/lib/app/uploads",
          mountMode: input?.mountMode ?? "read-write",
          attachedAt: "2026-01-01T00:03:00.000Z",
        },
      ];
      return {
        json: {
          id: "att_created",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/resources/detachStorage"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as { attachmentId?: string } | null;
      storageAttachments = storageAttachments.filter(
        (attachment) => attachment.id !== (input?.attachmentId ?? "att_existing"),
      );
      return {
        json: {
          id: input?.attachmentId ?? "att_existing",
        },
      };
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/resources/res_demo`);

      await expectAnyText(view, ["Storage", "Mounted storage", "挂载存储"]);
      await expectText(view, "PocketBase data");
      await expectText(view, "/pb_data");
      await expectAnyText(view, [
        "Plan and manage backups from Storage settings; unsupported providers return blockers.",
        "在 Storage 设置里预览和管理备份；不支持的 provider 会返回 blocker。",
      ]);
      const overviewLayout = JSON.parse(
        await view.evaluate<string>(`(() => {
          const section = document.querySelector('#resource-mounted-storage-overview');
          const backupText = section?.textContent ?? '';
          const desktop = {
            innerWidth: window.innerWidth,
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            sectionVisible: Boolean(section),
            backupTextVisible:
              backupText.includes('Plan and manage backups from Storage settings') ||
              backupText.includes('在 Storage 设置里预览和管理备份'),
          };
          window.resizeTo(390, 820);
          return new Promise((resolve) => {
            requestAnimationFrame(() => {
              const mobileSection = document.querySelector('#resource-mounted-storage-overview');
              const mobileText = mobileSection?.textContent ?? '';
              resolve(JSON.stringify({
                desktop,
                mobile: {
                  innerWidth: window.innerWidth,
                  clientWidth: document.documentElement.clientWidth,
                  scrollWidth: document.documentElement.scrollWidth,
                  sectionVisible: Boolean(mobileSection),
                  backupTextVisible:
                    mobileText.includes('Plan and manage backups from Storage settings') ||
                    mobileText.includes('在 Storage 设置里预览和管理备份'),
                },
              }));
            });
          });
        })()`),
      ) as {
        desktop: {
          innerWidth: number;
          clientWidth: number;
          scrollWidth: number;
          sectionVisible: boolean;
          backupTextVisible: boolean;
        };
        mobile: {
          innerWidth: number;
          clientWidth: number;
          scrollWidth: number;
          sectionVisible: boolean;
          backupTextVisible: boolean;
        };
      };
      expect(overviewLayout.desktop.sectionVisible).toBe(true);
      expect(overviewLayout.desktop.backupTextVisible).toBe(true);
      expect(overviewLayout.desktop.scrollWidth).toBeLessThanOrEqual(
        overviewLayout.desktop.clientWidth,
      );
      expect(overviewLayout.mobile.sectionVisible).toBe(true);
      expect(overviewLayout.mobile.backupTextVisible).toBe(true);
      expect(overviewLayout.mobile.scrollWidth).toBeLessThanOrEqual(
        overviewLayout.mobile.clientWidth,
      );

      await view.navigate(`${previewUrl}/resources/res_demo?section=storage`);

      await expectAnyText(view, ["Storage volumes", "存储卷"]);
      await expectText(view, "PocketBase data");
      await expectText(view, "/pb_data");
      await expectText(view, "sqlite");
      await expectAnyText(view, ["Backup restore points", "备份点"]);
      await expectText(view, "local://backups/svb_uploads.tar.zst");
      const storagePageDefaultState = JSON.parse(
        await view.evaluate<string>(`JSON.stringify({
          attachFormVisible: Boolean(document.querySelector("#resource-storage-attachment-form")),
          backupFieldVisible: Boolean(document.querySelector("#resource-storage-backup-path")),
          cards: document.querySelectorAll("[data-storage-volume-card]").length,
          cleanupFieldVisible: Boolean(document.querySelector("#resource-storage-runtime-cleanup-before")),
          createFormVisible: Boolean(document.querySelector("#resource-storage-volume-form")),
        })`),
      ) as {
        attachFormVisible: boolean;
        backupFieldVisible: boolean;
        cards: number;
        cleanupFieldVisible: boolean;
        createFormVisible: boolean;
      };
      expect(storagePageDefaultState).toEqual({
        attachFormVisible: false,
        backupFieldVisible: false,
        cards: 1,
        cleanupFieldVisible: false,
        createFormVisible: false,
      });

      const listRequest = await waitForRecordedRequest("/api/rpc/storageVolumes/list");
      expect(readOrpcJsonPayload(listRequest.body)).toEqual({
        projectId: "prj_demo",
        environmentId: "env_demo",
      });

      await clickButtonByAnyText(view, ["Create volume", "创建 volume"]);
      await setInputValue(view, "#resource-storage-volume-name", "cache");
      await clickDialogButtonByAnyText(view, ["Create volume", "创建 volume"]);
      const createRequest = await waitForRecordedRequest("/api/rpc/storageVolumes/create");
      expect(readOrpcJsonPayload(createRequest.body)).toEqual({
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "cache",
        kind: "named-volume",
      });
      await expectAnyText(view, ["Storage volume created", "Storage volume 已创建"]);

      await clickStorageVolumeCardButton(view, "stv_uploads", [
        "Runtime cleanup",
        "Runtime cleanup",
      ]);
      await selectOptionByText(
        view,
        "#resource-storage-runtime-cleanup-volume-trigger",
        "pocketbase-data",
      );
      await selectOptionByText(view, "#resource-storage-runtime-cleanup-server-trigger", "edge");
      await setInputValue(
        view,
        "#resource-storage-runtime-cleanup-before",
        "2026-01-01T00:00:00.000Z",
      );
      await clickButtonByAnyText(view, ["Preview cleanup", "预览清理"]);
      const previewRequest = await waitForRecordedRequest("/api/rpc/storageVolumes/cleanupRuntime");
      expect(readOrpcJsonPayload(previewRequest.body)).toEqual({
        storageVolumeId: "stv_uploads",
        serverId: "srv_demo",
        before: "2026-01-01T00:00:00.000Z",
        dryRun: true,
      });
      await expectAnyText(view, ["Runtime cleanup preview ready", "Runtime cleanup 预览已就绪"]);
      await expectText(view, "pocketbase-data");
      await expectAnyText(view, ["Inspected 1", "Inspected 1"]);

      await clickButtonByAnyText(view, ["Apply cleanup", "执行清理"]);
      await acceptConsoleConfirm(view);
      await waitFor(
        async () => {
          const cleanupRequests = recordedApiRequests.filter(
            (request) => request.pathname === "/api/rpc/storageVolumes/cleanupRuntime",
          );
          return cleanupRequests.map((request) => readOrpcJsonPayload(request.body));
        },
        (inputs) => inputs.some((input) => isRecord(input) && input.dryRun === false),
        "Expected destructive storage runtime cleanup to require explicit confirmation and dryRun=false",
      );
      await expectAnyText(view, ["Runtime cleanup applied", "Runtime cleanup 已执行"]);

      await clickDialogButtonByAnyText(view, ["Close", "关闭"]);
      await clickStorageVolumeCardButton(view, "stv_uploads", ["Volume backups", "Volume 备份"]);
      await selectOptionByText(view, "#resource-storage-backup-volume-trigger", "PocketBase data");
      await setInputValue(view, "#resource-storage-backup-path", "/pb_data");
      await setInputValue(view, "#resource-storage-backup-target-ref", "/var/lib/appaloft/backups");
      await setInputValue(view, "#resource-storage-backup-retention-count", "3");
      await setInputValue(view, "#resource-storage-backup-min-free", "1073741824");
      await clickButtonByAnyText(view, ["Plan backup", "预览备份"]);
      const backupPlanRequest = await waitForRecordedRequest(
        "/api/rpc/storageVolumes/backups/plan",
      );
      expect(readOrpcJsonPayload(backupPlanRequest.body)).toEqual({
        storageVolumeId: "stv_uploads",
        source: {
          storageVolumeId: "stv_uploads",
          resourceId: "res_demo",
          serverId: "srv_demo",
          destinationPath: "/pb_data",
          dataFormat: "sqlite",
          liveWrites: true,
        },
        requestedConsistency: "application-consistent",
        target: {
          providerKey: "local-filesystem",
          targetRef: "/var/lib/appaloft/backups",
        },
        retention: {
          maxCount: 3,
          minFreeBytes: 1073741824,
        },
      });
      await expectAnyText(view, ["Backup plan ready", "备份预览已就绪"]);
      await clickDialogButtonByAnyText(view, ["Create backup", "创建备份"]);
      const backupCreateRequest = await waitForRecordedRequest(
        "/api/rpc/storageVolumes/backups/create",
      );
      expect(readOrpcJsonPayload(backupCreateRequest.body)).toEqual({
        storageVolumeId: "stv_uploads",
        planRequest: {
          storageVolumeId: "stv_uploads",
          source: {
            storageVolumeId: "stv_uploads",
            resourceId: "res_demo",
            serverId: "srv_demo",
            destinationPath: "/pb_data",
            dataFormat: "sqlite",
            liveWrites: true,
          },
          requestedConsistency: "application-consistent",
          target: {
            providerKey: "local-filesystem",
            targetRef: "/var/lib/appaloft/backups",
          },
          retention: {
            maxCount: 3,
            minFreeBytes: 1073741824,
          },
        },
      });
      await expectAnyText(view, ["Storage backup requested", "Storage backup 已请求"]);
      const backupListRequest = await waitForRecordedRequest(
        "/api/rpc/storageVolumes/backups/list",
      );
      expect(readOrpcJsonPayload(backupListRequest.body)).toEqual({
        storageVolumeId: "stv_uploads",
      });
      await setInputValue(view, "#storage-backup-restore-name-svb_uploads", "uploads-restored");
      await clickDialogButtonByAnyText(view, ["Restore to new volume", "恢复到新 volume"]);
      const backupRestoreRequest = await waitForRecordedRequest(
        "/api/rpc/storageVolumes/backups/restore",
      );
      expect(readOrpcJsonPayload(backupRestoreRequest.body)).toEqual({
        backupId: "svb_uploads",
        targetMode: "new-volume",
        restoredVolumeName: "uploads-restored",
      });
      await expectAnyText(view, ["Storage backup restored", "Storage backup 已恢复"]);
      await clickDialogButtonByAnyText(view, ["Prune", "清理"]);
      const backupPruneRequest = await waitForRecordedRequest(
        "/api/rpc/storageVolumes/backups/prune",
      );
      expect(readOrpcJsonPayload(backupPruneRequest.body)).toEqual({
        backupId: "svb_uploads",
      });
      await expectAnyText(view, ["Storage backup pruned", "Storage backup 已清理"]);

      await clickDialogButtonByAnyText(view, ["Close", "关闭"]);
      await clickStorageVolumeCardButton(view, "stv_uploads", ["Attach storage", "挂载存储"]);
      await selectOptionByText(
        view,
        "#resource-storage-attachment-volume-trigger",
        "pocketbase-data",
      );
      await setInputValue(view, "#resource-storage-destination", "/var/lib/app/uploads");
      await clickFormSubmit(view, "#resource-storage-attachment-form");
      const attachRequest = await waitForRecordedRequest("/api/rpc/resources/attachStorage");
      expect(readOrpcJsonPayload(attachRequest.body)).toEqual({
        resourceId: "res_demo",
        storageVolumeId: "stv_uploads",
        destinationPath: "/var/lib/app/uploads",
        mountMode: "read-write",
      });
      await expectAnyText(view, ["Storage attached", "存储已挂载"]);

      await clickButtonByAnyText(view, ["Detach", "Detach"]);
      await acceptConsoleConfirm(view);
      const detachRequest = await waitForRecordedRequest("/api/rpc/resources/detachStorage");
      expect(readOrpcJsonPayload(detachRequest.body)).toEqual({
        resourceId: "res_demo",
        attachmentId: "att_existing",
      });
      await expectAnyText(view, ["Storage detached", "存储已 detach"]);
      expect(recordedApiRequests.some((request) => request.pathname === "/api/deployments")).toBe(
        false,
      );
      expect(recordedApiRequests.some((request) => request.pathname.includes("capacity"))).toBe(
        false,
      );
    } finally {
      apiResponses.dashboard["/api/rpc/resources/show"] = previousShowRoute;
      if (previousStorageListRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/storageVolumes/list"];
      } else {
        apiResponses.dashboard["/api/rpc/storageVolumes/list"] = previousStorageListRoute;
      }
      if (previousStorageCreateRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/storageVolumes/create"];
      } else {
        apiResponses.dashboard["/api/rpc/storageVolumes/create"] = previousStorageCreateRoute;
      }
      if (previousStorageCleanupRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/storageVolumes/cleanupRuntime"];
      } else {
        apiResponses.dashboard["/api/rpc/storageVolumes/cleanupRuntime"] =
          previousStorageCleanupRoute;
      }
      if (previousStorageBackupPlanRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/storageVolumes/backups/plan"];
      } else {
        apiResponses.dashboard["/api/rpc/storageVolumes/backups/plan"] =
          previousStorageBackupPlanRoute;
      }
      if (previousStorageBackupCreateRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/storageVolumes/backups/create"];
      } else {
        apiResponses.dashboard["/api/rpc/storageVolumes/backups/create"] =
          previousStorageBackupCreateRoute;
      }
      if (previousStorageBackupListRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/storageVolumes/backups/list"];
      } else {
        apiResponses.dashboard["/api/rpc/storageVolumes/backups/list"] =
          previousStorageBackupListRoute;
      }
      if (previousStorageBackupRestoreRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/storageVolumes/backups/restore"];
      } else {
        apiResponses.dashboard["/api/rpc/storageVolumes/backups/restore"] =
          previousStorageBackupRestoreRoute;
      }
      if (previousStorageBackupPruneRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/storageVolumes/backups/prune"];
      } else {
        apiResponses.dashboard["/api/rpc/storageVolumes/backups/prune"] =
          previousStorageBackupPruneRoute;
      }
      if (previousAttachRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/resources/attachStorage"];
      } else {
        apiResponses.dashboard["/api/rpc/resources/attachStorage"] = previousAttachRoute;
      }
      if (previousDetachRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/resources/detachStorage"];
      } else {
        apiResponses.dashboard["/api/rpc/resources/detachStorage"] = previousDetachRoute;
      }
    }
  }, 20_000);

  test("[PG-PREVIEW-SURFACE-001][PG-PREVIEW-CLEANUP-001] requests preview cleanup from the resource Web tab", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousPreviewListRoute = apiResponses.dashboard["/api/rpc/previewEnvironments/list"];
    const previousPreviewDeleteRoute =
      apiResponses.dashboard["/api/rpc/previewEnvironments/delete"];
    const previewSourceFingerprint = "source-fingerprint:v1:preview%3Apr%3A14";
    let previewEnvironmentStatus: "active" | "cleanup-requested" = "active";

    apiResponses.dashboard["/api/rpc/previewEnvironments/list"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as { resourceId?: string } | null;
      return {
        json: {
          schemaVersion: "preview-environments.list/v1",
          items:
            input?.resourceId && input.resourceId !== "res_demo"
              ? []
              : [
                  {
                    previewEnvironmentId: "prenv_demo_14",
                    projectId: "prj_demo",
                    environmentId: "env_demo",
                    resourceId: "res_demo",
                    serverId: "srv_demo",
                    destinationId: "dst_demo",
                    source: {
                      provider: "github",
                      repositoryFullName: "acme/platform",
                      headRepositoryFullName: "acme/platform",
                      pullRequestNumber: 14,
                      baseRef: "main",
                      headSha: "abc1234",
                      sourceBindingFingerprint: previewSourceFingerprint,
                    },
                    status: previewEnvironmentStatus,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:05:00.000Z",
                    expiresAt: "2026-01-08T00:00:00.000Z",
                  },
                ],
          generatedAt: "2026-01-01T00:05:01.000Z",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/previewEnvironments/delete"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as {
        previewEnvironmentId?: string;
        resourceId?: string;
      } | null;
      previewEnvironmentStatus = "cleanup-requested";
      return {
        json: {
          status: "cleaned",
          attemptId: "pcln_webview_resource",
          previewEnvironmentId: input?.previewEnvironmentId ?? "prenv_demo_14",
          resourceId: input?.resourceId ?? "res_demo",
          sourceBindingFingerprint: previewSourceFingerprint,
          previewEnvironmentStatus,
          cleanedRuntime: true,
          removedRoute: true,
          removedSourceLink: true,
          removedProviderMetadata: true,
          updatedFeedback: true,
        },
      };
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/resources/res_demo?tab=previews`);

      await expectAnyText(view, ["Derived preview environments", "派生预览环境"]);
      await expectText(view, "prenv_demo_14");
      await expectText(view, "acme/platform #14");
      await expectText(view, previewSourceFingerprint);

      const previewListInputs = await waitFor(
        async () =>
          recordedApiRequests
            .filter((request) => request.pathname === "/api/rpc/previewEnvironments/list")
            .map((request) => readOrpcJsonPayload(request.body)),
        (inputs) =>
          inputs.some(
            (input) => isRecord(input) && input.resourceId === "res_demo" && input.limit === 50,
          ),
        "Expected Resource-scoped preview environment list request",
      );
      expect(previewListInputs).toContainEqual({
        resourceId: "res_demo",
        limit: 50,
      });

      await clickButtonByAnyText(view, ["Request cleanup", "请求清理"]);
      await acceptConsoleConfirm(view);
      const deleteRequest = await waitForRecordedRequest("/api/rpc/previewEnvironments/delete");
      expect(readOrpcJsonPayload(deleteRequest.body)).toEqual({
        previewEnvironmentId: "prenv_demo_14",
        resourceId: "res_demo",
      });
      await expectAnyText(view, ["Preview cleanup requested", "已请求预览清理"]);
      await expectText(view, "pcln_webview_resource");

      expect(
        recordedApiRequests.some(
          (request) => request.pathname === "/api/rpc/deployments/cleanupPreview",
        ),
      ).toBe(false);
    } finally {
      if (previousPreviewListRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/previewEnvironments/list"];
      } else {
        apiResponses.dashboard["/api/rpc/previewEnvironments/list"] = previousPreviewListRoute;
      }

      if (previousPreviewDeleteRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/previewEnvironments/delete"];
      } else {
        apiResponses.dashboard["/api/rpc/previewEnvironments/delete"] = previousPreviewDeleteRoute;
      }
    }
  }, 20_000);

  test("[PG-PREVIEW-SURFACE-002] shows project-scoped preview environments and preview resources", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousPreviewListRoute = apiResponses.dashboard["/api/rpc/previewEnvironments/list"];
    const previousEnvironmentListRoute = apiResponses.dashboard["/api/rpc/environments/list"];
    const previousResourceListRoute = apiResponses.dashboard["/api/rpc/resources/list"];
    const previewSourceFingerprint = "source-fingerprint:v1:preview%3Apr%3A41";

    apiResponses.dashboard["/api/rpc/environments/list"] = {
      json: {
        items: [
          {
            id: "env_demo",
            projectId: "prj_demo",
            name: "production",
            kind: "production",
            lifecycleStatus: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
            maskedVariables: [],
          },
          {
            id: "env_preview_project",
            projectId: "prj_demo",
            name: "Preview",
            kind: "preview",
            lifecycleStatus: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
            maskedVariables: [],
          },
        ],
      },
    };
    apiResponses.dashboard["/api/rpc/resources/list"] = (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as {
        includePreviewResources?: boolean;
        projectId?: string;
      } | null;
      const previewResource = {
        id: "res_preview_project_web",
        projectId: "prj_demo",
        environmentId: "env_preview_project",
        destinationId: "dst_demo",
        name: "preview-web",
        slug: "preview-web",
        kind: "static-site",
        services: [{ name: "web", kind: "web" }],
        deploymentCount: 0,
        networkProfile: {
          internalPort: 3000,
          upstreamProtocol: "http",
          exposureMode: "reverse-proxy",
        },
        accessProfile: {
          generatedAccessMode: "inherit",
          pathPrefix: "/",
        },
        createdAt: "2026-01-01T00:02:00.000Z",
      };

      return {
        json: {
          items:
            input?.projectId === "prj_demo" && input.includePreviewResources
              ? [previewResource]
              : [],
        },
      };
    };
    apiResponses.dashboard["/api/rpc/previewEnvironments/list"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as { projectId?: string } | null;
      return {
        json: {
          schemaVersion: "preview-environments.list/v1",
          items:
            input?.projectId === "prj_demo"
              ? [
                  {
                    previewEnvironmentId: "prenv_project_41",
                    projectId: "prj_demo",
                    environmentId: "env_preview_project",
                    resourceId: "res_preview_project_web",
                    serverId: "srv_demo",
                    destinationId: "dst_demo",
                    source: {
                      provider: "github",
                      repositoryFullName: "acme/platform",
                      headRepositoryFullName: "acme/platform",
                      pullRequestNumber: 41,
                      baseRef: "main",
                      headSha: "abc4141",
                      sourceBindingFingerprint: previewSourceFingerprint,
                    },
                    status: "active",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:05:00.000Z",
                    expiresAt: "2026-01-08T00:00:00.000Z",
                  },
                ]
              : [],
          generatedAt: "2026-01-01T00:05:01.000Z",
        },
      };
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/projects/prj_demo?tab=preview`);

      await expectText(view, "Preview");
      await expectText(view, "prenv_project_41");
      await expectText(view, "preview-web");
      await expectText(view, "acme/platform");
      await expectText(view, previewSourceFingerprint);

      const previewListInputs = await waitFor(
        async () =>
          recordedApiRequests
            .filter((request) => request.pathname === "/api/rpc/previewEnvironments/list")
            .map((request) => readOrpcJsonPayload(request.body)),
        (inputs) =>
          inputs.some(
            (input) => isRecord(input) && input.projectId === "prj_demo" && input.limit === 50,
          ),
        "Expected Project-scoped preview environment list request",
      );
      expect(previewListInputs).toContainEqual({
        projectId: "prj_demo",
        limit: 50,
      });

      const resourceListInputs = await waitFor(
        async () =>
          recordedApiRequests
            .filter((request) => request.pathname === "/api/rpc/resources/list")
            .map((request) => readOrpcJsonPayload(request.body)),
        (inputs) =>
          inputs.some(
            (input) =>
              isRecord(input) &&
              input.projectId === "prj_demo" &&
              input.includePreviewResources === true &&
              input.limit === 100,
          ),
        "Expected Project-scoped preview resource list request",
      );
      expect(resourceListInputs).toContainEqual({
        projectId: "prj_demo",
        includePreviewResources: true,
        limit: 100,
      });
    } finally {
      if (previousPreviewListRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/previewEnvironments/list"];
      } else {
        apiResponses.dashboard["/api/rpc/previewEnvironments/list"] = previousPreviewListRoute;
      }
      if (previousEnvironmentListRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/environments/list"];
      } else {
        apiResponses.dashboard["/api/rpc/environments/list"] = previousEnvironmentListRoute;
      }
      if (previousResourceListRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/resources/list"];
      } else {
        apiResponses.dashboard["/api/rpc/resources/list"] = previousResourceListRoute;
      }
    }
  }, 20_000);

  test("[PG-PREVIEW-SURFACE-001][PG-PREVIEW-CLEANUP-001] manages preview environments from the global Web view", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousPreviewListRoute = apiResponses.dashboard["/api/rpc/previewEnvironments/list"];
    const previousPreviewShowRoute = apiResponses.dashboard["/api/rpc/previewEnvironments/show"];
    const previousPreviewDeleteRoute =
      apiResponses.dashboard["/api/rpc/previewEnvironments/delete"];
    const previewSourceFingerprint = "source-fingerprint:v1:preview%3Apr%3A27";
    let previewEnvironmentStatus: "active" | "cleanup-requested" = "active";
    const previewEnvironment = () => ({
      previewEnvironmentId: "prenv_global_27",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      source: {
        provider: "github",
        repositoryFullName: "acme/platform",
        headRepositoryFullName: "acme/platform",
        pullRequestNumber: 27,
        baseRef: "main",
        headSha: "def5678",
        sourceBindingFingerprint: previewSourceFingerprint,
      },
      status: previewEnvironmentStatus,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
      expiresAt: "2026-01-08T00:00:00.000Z",
    });

    apiResponses.dashboard["/api/rpc/previewEnvironments/list"] = () => ({
      json: {
        schemaVersion: "preview-environments.list/v1",
        items: [previewEnvironment()],
        generatedAt: "2026-01-01T00:05:01.000Z",
      },
    });
    apiResponses.dashboard["/api/rpc/previewEnvironments/show"] = () => ({
      json: {
        schemaVersion: "preview-environments.show/v1",
        previewEnvironment: previewEnvironment(),
        generatedAt: "2026-01-01T00:05:02.000Z",
      },
    });
    apiResponses.dashboard["/api/rpc/previewEnvironments/delete"] = (
      _request: Request,
      body: unknown,
    ) => {
      const input = readOrpcJsonPayload(body) as {
        previewEnvironmentId?: string;
        resourceId?: string;
      } | null;
      previewEnvironmentStatus = "cleanup-requested";
      return {
        json: {
          status: "cleaned",
          attemptId: "pcln_webview_global",
          previewEnvironmentId: input?.previewEnvironmentId ?? "prenv_global_27",
          resourceId: input?.resourceId ?? "res_demo",
          sourceBindingFingerprint: previewSourceFingerprint,
          previewEnvironmentStatus,
          cleanedRuntime: true,
          removedRoute: true,
          removedSourceLink: true,
          removedProviderMetadata: true,
          updatedFeedback: true,
        },
      };
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/preview-environments`);

      await expectAnyText(view, ["Preview environments", "预览环境"]);
      await expectText(view, "acme/platform");
      await expectText(view, previewSourceFingerprint);

      const listRequest = await waitForRecordedRequest("/api/rpc/previewEnvironments/list");
      expect(readOrpcJsonPayload(listRequest.body)).toEqual({ limit: 100 });

      await clickLinkByHref(view, "prenv_global_27");
      const showRequest = await waitForRecordedRequest("/api/rpc/previewEnvironments/show");
      expect(readOrpcJsonPayload(showRequest.body)).toEqual({
        previewEnvironmentId: "prenv_global_27",
      });
      await expectText(view, "prenv_global_27");
      await expectText(view, "def5678");

      await clickButtonByAnyText(view, ["Request cleanup", "请求清理"]);
      await acceptConsoleConfirm(view);
      const deleteRequest = await waitForRecordedRequest("/api/rpc/previewEnvironments/delete");
      expect(readOrpcJsonPayload(deleteRequest.body)).toEqual({
        previewEnvironmentId: "prenv_global_27",
        resourceId: "res_demo",
      });
      await expectText(view, "pcln_webview_global");
    } finally {
      if (previousPreviewListRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/previewEnvironments/list"];
      } else {
        apiResponses.dashboard["/api/rpc/previewEnvironments/list"] = previousPreviewListRoute;
      }
      if (previousPreviewShowRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/previewEnvironments/show"];
      } else {
        apiResponses.dashboard["/api/rpc/previewEnvironments/show"] = previousPreviewShowRoute;
      }
      if (previousPreviewDeleteRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/previewEnvironments/delete"];
      } else {
        apiResponses.dashboard["/api/rpc/previewEnvironments/delete"] = previousPreviewDeleteRoute;
      }
    }
  }, 15_000);

  test("[ROUTE-TLS-ENTRY-002][ROUTE-TLS-ENTRY-007] creates and confirms a resource-scoped domain binding from Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousDomainBindingsRoute = apiResponses.dashboard["/api/rpc/domainBindings/list"];
    const previousCreateRoute = apiResponses.dashboard["/api/rpc/domainBindings/create"];
    const previousConfirmRoute = apiResponses.dashboard["/api/rpc/domainBindings/confirmOwnership"];
    let bindingStatus: "absent" | "pending_verification" | "bound" = "absent";

    apiResponses.dashboard["/api/rpc/domainBindings/list"] = () => ({
      json: {
        items:
          bindingStatus === "absent"
            ? []
            : [
                {
                  id: "dbn_resource_web",
                  projectId: "prj_demo",
                  environmentId: "env_demo",
                  resourceId: "res_demo",
                  serverId: "srv_demo",
                  destinationId: "dst_demo",
                  domainName: "resource-web.example.test",
                  pathPrefix: "/",
                  proxyKind: "traefik",
                  tlsMode: "auto",
                  certificatePolicy: "auto",
                  status: bindingStatus,
                  verificationAttemptCount: bindingStatus === "bound" ? 1 : 0,
                  createdAt: "2026-01-01T00:00:00.000Z",
                },
              ],
      },
    });
    apiResponses.dashboard["/api/rpc/domainBindings/create"] = () => {
      bindingStatus = "pending_verification";
      return {
        json: {
          id: "dbn_resource_web",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/domainBindings/confirmOwnership"] = () => {
      bindingStatus = "bound";
      return {
        json: {
          id: "dbn_resource_web",
          verificationAttemptId: "dva_resource_web",
        },
      };
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/resources/res_demo?tab=domains`);

      await clickButtonByAnyText(view, ["Custom domains", "自定义域名"]);
      await setInputValue(
        view,
        "#resource-domain-binding-domain-name",
        "resource-web.example.test",
      );
      await clickFormSubmit(view, "#resource-domain-binding-create-form");

      const createRequest = await waitForRecordedRequest("/api/rpc/domainBindings/create");
      expect(readOrpcJsonPayload(createRequest.body)).toEqual({
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        destinationId: "dst_demo",
        domainName: "resource-web.example.test",
        pathPrefix: "/",
        proxyKind: "traefik",
        tlsMode: "auto",
        certificatePolicy: "auto",
      });

      await expectText(view, "resource-web.example.test");
      await clickButtonByAnyText(view, ["Confirm ownership", "确认所有权"]);

      const confirmRequest = await waitForRecordedRequest(
        "/api/rpc/domainBindings/confirmOwnership",
      );
      expect(readOrpcJsonPayload(confirmRequest.body)).toEqual({
        domainBindingId: "dbn_resource_web",
      });
      await expectAnyText(view, ["Bound", "BOUND", "已绑定"]);
    } finally {
      if (previousCreateRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/domainBindings/create"];
      } else {
        apiResponses.dashboard["/api/rpc/domainBindings/create"] = previousCreateRoute;
      }
      if (previousConfirmRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/domainBindings/confirmOwnership"];
      } else {
        apiResponses.dashboard["/api/rpc/domainBindings/confirmOwnership"] = previousConfirmRoute;
      }
      apiResponses.dashboard["/api/rpc/domainBindings/list"] = previousDomainBindingsRoute;
    }
  }, 15_000);

  test("[RES-PROFILE-ENTRY-012] explains resource detail profile edits are durable and future-only", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo?section=health`);

    await expectAnyText(view, ["Durable profile edit", "持久资源配置编辑"]);
    await expectAnyText(view, [
      "Future deployments use these saved profiles.",
      "后续部署会使用这些已保存的资源配置。",
    ]);
    await expectAnyText(view, [
      "Historical deployment snapshots stay unchanged.",
      "历史部署快照保持不变。",
    ]);
    await expectAnyText(view, ["Current runtime is not restarted.", "当前运行时不会被立即重启。"]);
    await expectAnyText(view, ["do not bind domains", "不会绑定域名"]);
  }, 15_000);

  test("[DEF-ACCESS-ENTRY-008] resource detail selects server-applied access before generated access", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousShowRoute = apiResponses.dashboard["/api/rpc/resources/show"];
    const showFixture = (previousShowRoute as { json: Record<string, unknown> }).json;

    apiResponses.dashboard["/api/rpc/resources/show"] = {
      json: {
        ...showFixture,
        accessSummary: {
          latestGeneratedAccessRoute: {
            url: "https://generated.example.test",
            hostname: "generated.example.test",
            scheme: "https",
            deploymentId: "dep_generated",
            deploymentStatus: "succeeded",
            pathPrefix: "/",
            proxyKind: "traefik",
            targetPort: 3000,
            updatedAt: "2026-01-01T00:01:00.000Z",
          },
          latestServerAppliedDomainRoute: {
            url: "https://server-applied.example.test",
            hostname: "server-applied.example.test",
            scheme: "https",
            deploymentId: "dep_server_applied",
            deploymentStatus: "succeeded",
            pathPrefix: "/",
            proxyKind: "traefik",
            targetPort: 3000,
            updatedAt: "2026-01-01T00:02:00.000Z",
          },
          proxyRouteStatus: "ready",
          lastRouteRealizationDeploymentId: "dep_server_applied",
        },
      },
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/resources/res_demo`);

      await expectText(view, "https://server-applied.example.test");
      await expectAnyText(view, [
        "Server-applied domain access",
        "SERVER-APPLIED DOMAIN ACCESS",
        "服务器应用域名访问",
      ]);

      const content = await pageText(view);
      expect(content).not.toContain("https://generated.example.test");
    } finally {
      apiResponses.dashboard["/api/rpc/resources/show"] = previousShowRoute;
    }
  }, 15_000);

  test("[WEB-CLI-API-ACCESS-007] renders latest access failure route metadata on resource detail", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousShowRoute = apiResponses.dashboard["/api/rpc/resources/show"];
    const showFixture = (previousShowRoute as { json: Record<string, unknown> }).json;

    apiResponses.dashboard["/api/rpc/resources/show"] = {
      json: {
        ...showFixture,
        accessSummary: {
          proxyRouteStatus: "failed",
          lastRouteRealizationDeploymentId: "dep_demo",
          latestAccessFailureDiagnostic: {
            schemaVersion: "resource-access-failure/v1",
            requestId: "req_access_web_route_meta",
            generatedAt: "2026-01-01T00:02:00.000Z",
            code: "resource_access_upstream_unavailable",
            category: "infra",
            phase: "upstream-connection",
            httpStatus: 502,
            retriable: true,
            ownerHint: "resource",
            nextAction: "inspect-runtime-logs",
            affected: {
              hostname: "server-applied.example.test",
              path: "/health",
              method: "GET",
            },
            route: {
              host: "server-applied.example.test",
              pathPrefix: "/",
              resourceId: "res_demo",
              deploymentId: "dep_demo",
              serverId: "srv_demo",
              destinationId: "dst_demo",
              providerKey: "traefik",
              routeId: "server_applied_route:server-applied.example.test:/:dep_demo",
              diagnosticId: "diag_server_applied_route",
              routeSource: "server-applied",
              routeStatus: "not-ready",
            },
            causeCode: "connect_econnrefused",
            correlationId: "cor_access_web_route_meta",
          },
        },
      },
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/resources/res_demo`);

      await expectAnyText(view, ["Latest access failure", "最近访问失败"]);
      await expectText(view, "req_access_web_route_meta");
      await expectText(view, "server-applied.example.test /health");
      await expectText(view, "inspect-runtime-logs");
      await expectText(view, "server-applied");
      await expectText(view, "server_applied_route:server-applied.example.test:/:dep_demo");
    } finally {
      apiResponses.dashboard["/api/rpc/resources/show"] = previousShowRoute;
    }
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

  test("[RES-PROFILE-ENTRY-011] submits resource access profile changes through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo`);

    await expectAnyText(view, ["Access profile", "访问配置"]);
    await setInputValue(view, "#resource-access-path-prefix", "/internal");
    await clickFormSubmit(view, "#resource-access-profile-form");

    const configureAccessRequest = await waitForRecordedRequest(
      "/api/rpc/resources/configureAccess",
    );
    const configureAccessInput = readOrpcJsonPayload(configureAccessRequest.body);

    expect(configureAccessInput).toEqual({
      resourceId: "res_demo",
      accessProfile: {
        generatedAccessMode: "inherit",
        pathPrefix: "/internal",
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
    await view.navigate(`${previewUrl}/resources/res_demo?tab=environment`);

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

  test("[RES-PROFILE-CONFIG-013] imports pasted dotenv variables through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousImportRoute = apiResponses.dashboard["/api/rpc/resources/importVariables"];
    apiResponses.dashboard["/api/rpc/resources/importVariables"] = {
      json: {
        resourceId: "res_demo",
        importedEntries: [
          {
            key: "PUBLIC_API_BASE_URL",
            value: "https://api.example.test",
            exposure: "runtime",
            kind: "plain-config",
            isSecret: false,
            action: "created",
            sourceLine: 1,
          },
          {
            key: "DATABASE_URL",
            value: "****",
            exposure: "runtime",
            kind: "secret",
            isSecret: true,
            action: "replaced",
            sourceLine: 2,
          },
        ],
        duplicateOverrides: [],
        existingOverrides: [
          {
            key: "DATABASE_URL",
            exposure: "runtime",
            previousScope: "resource",
            rule: "resource-entry-replaced",
          },
        ],
      },
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/resources/res_demo?tab=environment`);

      await expectAnyText(view, ["Import .env variables", "导入 .env 变量"]);
      await setInputValue(view, "#resource-config-import-secret-keys", "DATABASE_URL, API_TOKEN");
      await setInputValue(view, "#resource-config-import-plain-keys", "PUBLIC_API_BASE_URL");
      await setInputValue(
        view,
        "#resource-config-import-content",
        "PUBLIC_API_BASE_URL=https://api.example.test\nDATABASE_URL=postgres://resource",
      );
      await clickFormSubmit(view, "#resource-configuration-import-form");

      const importVariablesRequest = await waitForRecordedRequest(
        "/api/rpc/resources/importVariables",
      );
      expect(readOrpcJsonPayload(importVariablesRequest.body)).toEqual({
        resourceId: "res_demo",
        content: "PUBLIC_API_BASE_URL=https://api.example.test\nDATABASE_URL=postgres://resource",
        exposure: "runtime",
        secretKeys: ["DATABASE_URL", "API_TOKEN"],
        plainKeys: ["PUBLIC_API_BASE_URL"],
      });
      await expectAnyText(view, ["2 entries imported", "已导入 2 个条目"]);
    } finally {
      apiResponses.dashboard["/api/rpc/resources/importVariables"] = previousImportRoute;
    }
  }, 15_000);

  test("[RES-PROFILE-ENTRY-013] submits resource health policy changes through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo?section=health`);

    await expectAnyText(view, ["Health policy", "健康策略"]);
    await setInputValue(view, "#resource-health-path", "/ready");
    await setInputValue(view, "#resource-health-expected-status", "204");
    await setInputValue(view, "#resource-health-interval-seconds", "7");
    await setInputValue(view, "#resource-health-timeout-seconds", "3");
    await setInputValue(view, "#resource-health-retries", "4");
    await setInputValue(view, "#resource-health-start-period-seconds", "2");
    await clickFormSubmit(view, "#resource-health-policy-form");

    const configureHealthRequest = await waitForRecordedRequest(
      "/api/rpc/resources/configureHealth",
    );
    const configureHealthInput = readOrpcJsonPayload(configureHealthRequest.body);

    expect(configureHealthInput).toEqual({
      resourceId: "res_demo",
      healthCheck: {
        enabled: true,
        type: "http",
        intervalSeconds: 7,
        timeoutSeconds: 3,
        retries: 4,
        startPeriodSeconds: 2,
        http: {
          method: "GET",
          scheme: "http",
          host: "localhost",
          path: "/ready",
          expectedStatusCode: 204,
        },
      },
    });
  }, 15_000);

  test("[RES-PROFILE-ENTRY-014] removes resource variable overrides through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo?tab=environment`);

    await expectAnyText(view, ["Resource-owned entries", "资源自有条目"]);
    await clickButtonByAnyText(view, ["Unset", "移除"]);

    const unsetVariableRequest = await waitForRecordedRequest("/api/rpc/resources/unsetVariable");
    const unsetVariableInput = readOrpcJsonPayload(unsetVariableRequest.body);

    expect(unsetVariableInput).toEqual({
      resourceId: "res_demo",
      key: "DATABASE_URL",
      exposure: "runtime",
    });
  }, 15_000);

  test("[DEP-SHOW-ENTRY-001] loads deployment detail through deployments.show and deployments.logs", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousDiagnosticRoute = apiResponses.dashboard["/api/rpc/resources/diagnosticSummary"];
    const copyPayload = JSON.stringify({
      schemaVersion: "resources.diagnostic-summary.copy/v1",
      resourceId: "res_demo",
      deploymentId: "dep_demo",
      sectionErrors: [
        {
          code: "resource_runtime_logs_unavailable",
          phase: "runtime-log-observation",
        },
      ],
    });

    apiResponses.dashboard["/api/rpc/resources/diagnosticSummary"] = {
      json: {
        schemaVersion: "resources.diagnostic-summary/v1",
        generatedAt: "2026-01-01T00:00:10.000Z",
        focus: {
          resourceId: "res_demo",
          deploymentId: "dep_demo",
        },
        context: {
          projectId: "prj_demo",
          environmentId: "env_demo",
          resourceName: "workspace",
          resourceSlug: "workspace",
          resourceKind: "application",
          destinationId: "dst_demo",
          serverId: "srv_demo",
          services: [],
        },
        access: {
          status: "unavailable",
          reasonCode: "default_access_route_unavailable",
          phase: "access-observation",
        },
        proxy: {
          status: "not-requested",
          configurationIncluded: false,
          routeCount: 0,
          sectionCount: 0,
        },
        deploymentLogs: {
          status: "not-requested",
          tailLimit: 20,
          lineCount: 0,
          lines: [],
        },
        runtimeLogs: {
          status: "unavailable",
          tailLimit: 20,
          lineCount: 0,
          lines: [],
        },
        system: {
          entrypoint: "web",
        },
        sourceErrors: [
          {
            source: "runtime-logs",
            code: "resource_runtime_logs_unavailable",
            category: "runtime_observation",
            phase: "runtime-log-observation",
            retryable: true,
            relatedEntityId: "res_demo",
          },
        ],
        redaction: {
          policy: "deployment-environment-secrets",
          masked: false,
          maskedValueCount: 0,
        },
        copy: {
          json: copyPayload,
        },
      },
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/deployments/dep_demo`);
      await view.evaluate<void>(`(() => {
        window.__appaloftCopiedText = "";
        window.appaloftDesktop = {
          copyText: async (text) => {
            window.__appaloftCopiedText = text;
          },
        };
      })()`);

      await expectText(view, "workspace");
      await expectText(view, "Image digest", 15_000);
      await expectText(view, "latest -> sha256:8b1a9953c461");
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

      await clickButtonByAnyText(view, ["Copy diagnostic JSON", "复制诊断 JSON"]);
      const diagnosticRequest = await waitForRecordedRequest(
        "/api/rpc/resources/diagnosticSummary",
      );
      expect(readOrpcJsonPayload(diagnosticRequest.body)).toEqual({
        resourceId: "res_demo",
        deploymentId: "dep_demo",
        includeDeploymentLogTail: true,
        includeRuntimeLogTail: true,
        includeProxyConfiguration: true,
        tailLines: 20,
      });
      await waitFor(
        () => view.evaluate<string>("window.__appaloftCopiedText ?? ''"),
        (copied) => copied === copyPayload,
        "Expected deployment detail diagnostic copy payload to be written through the desktop bridge",
      );
      await expectAnyText(view, ["Diagnostic JSON copied", "诊断 JSON 已复制"]);

      await view.navigate(`${previewUrl}/deployments/dep_demo?tab=logs`);
      await expectText(view, "Application is ready for dep_demo");
    } finally {
      if (previousDiagnosticRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/resources/diagnosticSummary"];
      } else {
        apiResponses.dashboard["/api/rpc/resources/diagnosticSummary"] = previousDiagnosticRoute;
      }
    }
  }, 15_000);

  test("[DEF-ACCESS-ENTRY-007] server list hides persisted system default access policy", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/servers`);

    await expectAnyText(view, ["Server targets", "服务器目标"]);
    const content = await pageText(view);
    const hasSystemPolicyInput = await view.evaluate<boolean>(
      'Boolean(document.querySelector("#servers-default-access-provider-key-input"))',
    );

    expect(content).not.toContain("System default access policy");
    expect(content).not.toContain("系统默认访问策略");
    expect(hasSystemPolicyInput).toBe(false);
    expect(
      recordedApiRequests.some(
        (request) => request.pathname === "/api/rpc/defaultAccessDomainPolicies/show",
      ),
    ).toBe(false);

    await view.evaluate<void>(
      `(() => {
        const link = document.querySelector("[data-server-card][data-server-id='srv_demo'] a[href='/servers/srv_demo']");
        if (!(link instanceof HTMLElement)) {
          throw new Error("Expected demo server detail link to be clickable");
        }
        link.click();
      })()`,
    );
    await expectLocation(view, "/servers/srv_demo");
  }, 15_000);

  test("[SRV-LIFE-ENTRY-004] loads server detail through servers.show", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/servers/srv_demo`);

    await expectText(view, "edge");
    await expectText(view, "traefik");
    await view.navigate(`${previewUrl}/servers/srv_demo?tab=deployments`);
    await expectAnyText(view, ["Related deployments", "RELATED DEPLOYMENTS", "关联部署"]);

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

  test("[RT-CAP-INSPECT-001][RT-CAP-PRUNE-001] previews server capacity prune from Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/servers/srv_demo?tab=monitor`);

    await expectAnyText(view, ["Runtime monitor", "运行时监控"]);
    await expectText(view, "Deployment dep_demo succeeded");
    await waitFor(
      () =>
        view.evaluate<boolean>(
          `(() => {
            const link = Array.from(document.querySelectorAll("a")).find((candidate) =>
              candidate.getAttribute("href")?.includes("tab=capacity") &&
              candidate.getAttribute("href")?.includes("runtimeMonitoringFrom=")
            );
            if (!link) {
              return false;
            }
            link.click();
            return true;
          })()`,
        ),
      Boolean,
      "Expected Monitor cleanup handoff link",
    );

    await expectAnyText(view, ["Runtime capacity", "运行时容量"]);
    await expectAnyText(view, ["Safe reclaimable", "安全可回收"]);
    await expectAnyText(view, ["Runtime prune", "Runtime prune"]);
    await clickButtonByAnyText(view, ["Preview prune", "预览 prune"]);
    await expectAnyText(view, [
      "Runtime capacity prune completed",
      "Runtime capacity prune 已完成",
    ]);
    await expectText(view, "appaloft-old");

    const inspectRequest = await waitForRecordedRequest("/api/rpc/servers/capacity/inspect");
    expect(readOrpcJsonPayload(inspectRequest.body)).toEqual({
      serverId: "srv_demo",
    });

    const pruneRequest = await waitForRecordedRequest("/api/rpc/servers/capacity/prune");
    expect(readOrpcJsonPayload(pruneRequest.body)).toEqual({
      serverId: "srv_demo",
      before: "2026-05-13T01:00:00.000Z",
      categories: ["stopped-containers", "preview-workspaces", "source-workspaces"],
      dryRun: true,
    });
  }, 15_000);

  test("[RT-MON-004][RT-MON-007][RT-MON-008][RT-MON-009] renders Observe monitoring surfaces in WebView", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/resources/res_demo?tab=monitor`);

    await expectText(view, "workspace");
    await expectAnyText(view, ["Runtime monitor", "运行时监控"]);
    await expectAnyText(view, ["Rollup window", "Rollup 窗口"]);
    await expectText(view, "Deployment dep_demo succeeded");
    await expectAnyText(view, ["Top contributors", "TOP CONTRIBUTORS", "主要贡献来源"]);
    await expectAnyText(view, ["Threshold state", "Threshold 状态"]);
    await expectAnyText(view, ["Warning", "警告"]);
    await expectAnyText(view, ["Logs", "日志"]);
    await expectAnyText(view, ["Events", "事件"]);
    await expectAnyText(view, ["Diagnostics", "诊断"]);
    await expectAnyText(view, ["Cleanup", "清理"]);

    await clickButtonByAnyText(view, ["Cleanup", "清理"]);
    await expectAnyText(view, ["Runtime cleanup", "Runtime cleanup"]);
    await waitFor(
      () =>
        view.evaluate<string | null>(
          'document.querySelector("#resource-storage-runtime-cleanup-before")?.value ?? null',
        ),
      (value) => value === "2026-05-13T01:00:00.000Z",
      "Expected storage cleanup dry-run cutoff to inherit the Monitor observation window",
    );

    await view.navigate(`${previewUrl}/servers/srv_demo?tab=monitor`);
    await expectText(view, "edge");
    await expectAnyText(view, ["Runtime monitor", "运行时监控"]);
    await expectText(view, "Deployment dep_demo succeeded");
    await expectAnyText(view, ["Top contributors", "TOP CONTRIBUTORS", "主要贡献来源"]);

    await view.navigate(`${previewUrl}/projects/prj_demo`);
    await expectText(view, "Demo");
    await expectAnyText(view, ["Runtime monitor", "运行时监控"]);
    await expectAnyText(view, ["Project · Demo", "项目 · Demo"]);
    await expectAnyText(view, ["Environment · production", "环境 · production"]);

    await waitFor(
      async () =>
        recordedApiRequests.some((request) => {
          if (request.pathname !== "/api/rpc/runtimeMonitoring/rollup") {
            return false;
          }
          const input = readOrpcJsonPayload(request.body);
          return (
            isRecord(input) &&
            isRecord(input.scope) &&
            input.scope.kind === "project" &&
            input.scope.projectId === "prj_demo"
          );
        }),
      Boolean,
      "Expected project rollup monitoring request",
    );
    await waitFor(
      async () =>
        recordedApiRequests.some((request) => {
          if (request.pathname !== "/api/rpc/runtimeMonitoring/rollup") {
            return false;
          }
          const input = readOrpcJsonPayload(request.body);
          return (
            isRecord(input) &&
            isRecord(input.scope) &&
            input.scope.kind === "environment" &&
            input.scope.environmentId === "env_demo"
          );
        }),
      Boolean,
      "Expected environment rollup monitoring request",
    );
  }, 20_000);

  test("[DEF-ACCESS-ENTRY-007] server detail hides deployment-target default access override", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/servers/srv_demo?tab=proxy-access`);

    await expectText(view, "traefik");
    const content = await pageText(view);
    const hasOverrideForm = await view.evaluate<boolean>(
      'Boolean(document.querySelector("#server-default-access-override-form"))',
    );

    expect(content).not.toContain("Server default access override");
    expect(content).not.toContain("服务器默认访问覆盖策略");
    expect(hasOverrideForm).toBe(false);
    expect(
      recordedApiRequests.some(
        (request) => request.pathname === "/api/rpc/defaultAccessDomainPolicies/show",
      ),
    ).toBe(false);
    expect(
      recordedApiRequests.some(
        (request) => request.pathname === "/api/rpc/defaultAccessDomainPolicies/configure",
      ),
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
      await view.navigate(`${previewUrl}/servers/srv_zero_usage?tab=credentials`);

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
      await view.navigate(`${previewUrl}/servers/srv_usage_unavailable?tab=credentials`);

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

  test("[SRV-LIFE-ENTRY-012-WEB] deletes an eligible server from server detail", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousShowRoute = apiResponses.dashboard["/api/rpc/servers/show"];
    const previousDeleteCheckRoute = apiResponses.dashboard["/api/rpc/servers/deleteCheck"];
    const previousDeleteRoute = apiResponses.dashboard["/api/rpc/servers/delete"];

    apiResponses.dashboard["/api/rpc/servers/show"] = (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverId?: string } | null;
      return {
        json: serverDetailFixture(input?.serverId ?? "srv_demo", {
          lifecycleStatus: "inactive",
        }),
      };
    };
    apiResponses.dashboard["/api/rpc/servers/deleteCheck"] = (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverId?: string } | null;
      return {
        json: {
          schemaVersion: "servers.delete-check/v1",
          serverId: input?.serverId ?? "srv_demo",
          lifecycleStatus: "inactive",
          eligible: true,
          blockers: [],
          checkedAt: "2026-01-01T00:00:10.000Z",
        },
      };
    };
    apiResponses.dashboard["/api/rpc/servers/delete"] = (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverId?: string } | null;
      return {
        json: {
          id: input?.serverId ?? "srv_demo",
        },
      };
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/servers/srv_demo?tab=danger`);

      await expectAnyText(view, ["Delete safety", "DELETE SAFETY", "删除安全检查"]);
      await expectAnyText(view, ["Eligible", "ELIGIBLE", "可删除"]);
      await clickButtonByAnyText(view, ["Delete server", "删除服务器"]);
      await setInputValue(view, "#server-delete-confirmation-input", "srv_demo");
      await clickFormSubmit(view, "#server-delete-form");

      const deleteRequest = await waitForRecordedRequest("/api/rpc/servers/delete");
      expect(deleteRequest.method).toBe("POST");
      expect(readOrpcJsonPayload(deleteRequest.body)).toEqual({
        serverId: "srv_demo",
        confirmation: {
          serverId: "srv_demo",
        },
      });
    } finally {
      apiResponses.dashboard["/api/rpc/servers/show"] = previousShowRoute;
      apiResponses.dashboard["/api/rpc/servers/deleteCheck"] = previousDeleteCheckRoute;
      if (previousDeleteRoute === undefined) {
        delete apiResponses.dashboard["/api/rpc/servers/delete"];
      } else {
        apiResponses.dashboard["/api/rpc/servers/delete"] = previousDeleteRoute;
      }
    }
  }, 15_000);

  test("[SRV-LIFE-ENTRY-006-WEB] deactivates a server from server detail", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousShowRoute = apiResponses.dashboard["/api/rpc/servers/show"];
    const previousDeactivateRoute = apiResponses.dashboard["/api/rpc/servers/deactivate"];
    let lifecycleStatus: "active" | "inactive" = "active";

    apiResponses.dashboard["/api/rpc/servers/show"] = (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverId?: string } | null;
      return {
        json: serverDetailFixture(input?.serverId ?? "srv_demo", {
          lifecycleStatus,
        }),
      };
    };
    apiResponses.dashboard["/api/rpc/servers/deactivate"] = (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverId?: string } | null;
      lifecycleStatus = "inactive";

      return {
        json: {
          id: input?.serverId ?? "srv_demo",
        },
      };
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/servers/srv_demo?tab=danger`);

      await expectAnyText(view, ["Deactivate server", "停用服务器"]);
      await clickButtonByAnyText(view, ["Deactivate server", "停用服务器"]);
      await setInputValue(view, "#server-deactivate-confirmation-input", "srv_demo");
      await clickFormSubmit(view, "#server-deactivate-form");

      const deactivateRequest = await waitForRecordedRequest("/api/rpc/servers/deactivate");
      expect(deactivateRequest.method).toBe("POST");
      expect(readOrpcJsonPayload(deactivateRequest.body)).toEqual({
        serverId: "srv_demo",
      });
      await expectAnyText(view, ["Server deactivated", "服务器已停用"]);
    } finally {
      apiResponses.dashboard["/api/rpc/servers/show"] = previousShowRoute;
      apiResponses.dashboard["/api/rpc/servers/deactivate"] = previousDeactivateRoute;
    }
  }, 15_000);

  test("[SRV-LIFE-ENTRY-020] hides edge proxy intent configuration from server detail", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    const previousShowRoute = apiResponses.dashboard["/api/rpc/servers/show"];
    const currentProxyKind: "none" | "traefik" | "caddy" = "traefik";
    const currentProxyStatus: "pending" | "starting" | "ready" | "failed" | "disabled" = "ready";

    apiResponses.dashboard["/api/rpc/servers/show"] = (_request: Request, body: unknown) => {
      const input = readOrpcJsonPayload(body) as { serverId?: string } | null;
      return {
        json: serverDetailFixture(input?.serverId ?? "srv_demo", {
          edgeProxyKind: currentProxyKind,
          edgeProxyStatus: currentProxyStatus,
        }),
      };
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/servers/srv_demo?tab=proxy-access`);

      await expectText(view, "traefik");
      const content = await pageText(view);
      const hasEdgeProxyForm = await view.evaluate<boolean>(
        'Boolean(document.querySelector("#server-edge-proxy-form"))',
      );

      expect(content).not.toContain("代理与访问");
      expect(content).not.toContain("Proxy & access");
      expect(hasEdgeProxyForm).toBe(false);
      expect(
        recordedApiRequests.some(
          (request) => request.pathname === "/api/rpc/servers/configureEdgeProxy",
        ),
      ).toBe(false);
    } finally {
      apiResponses.dashboard["/api/rpc/servers/show"] = previousShowRoute;
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

      await expectAnyText(view, ["Timeline", "时间线"], 15_000);
      await expectText(view, "Deployment requested", 15_000);
      await expectText(view, "Build requested", 15_000);

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
    await clickButtonByAnyText(view, ["Archive", "归档"]);
    await acceptConsoleConfirm(view);

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
    await acceptConsoleConfirm(view);

    const archiveRequest = await waitForRecordedRequest("/api/rpc/environments/archive");
    const archiveInput = readOrpcJsonPayload(archiveRequest.body);

    expect(archiveInput).toEqual({
      environmentId: "env_demo",
    });
  }, 15_000);

  test("[ENV-LIFE-CLONE-ENTRY-003] submits environment clone through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/projects/prj_demo`);
    await expectAnyText(view, ["Environments", "环境"]);
    await setInputValue(view, "#environment-clone-name-env_demo", "production-copy");
    await clickFormSubmit(view, "#environment-clone-form-env_demo");

    const cloneRequest = await waitForRecordedRequest("/api/rpc/environments/clone");
    const cloneInput = readOrpcJsonPayload(cloneRequest.body);

    expect(cloneInput).toEqual({
      environmentId: "env_demo",
      targetName: "production-copy",
    });
  }, 15_000);

  test("[ENV-LIFE-RENAME-ENTRY-003] submits environment rename through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/projects/prj_demo`);
    await expectAnyText(view, ["Environments", "环境"]);
    await setInputValue(view, "#environment-rename-name-env_demo", "customer-production");
    await clickFormSubmit(view, "#environment-rename-form-env_demo");

    const renameRequest = await waitForRecordedRequest("/api/rpc/environments/rename");
    const renameInput = readOrpcJsonPayload(renameRequest.body);

    expect(renameInput).toEqual({
      environmentId: "env_demo",
      name: "customer-production",
    });
  }, 15_000);

  test("[ENV-LIFE-ENTRY-006] submits environment lock through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();

    await using view = createWebView();
    await view.navigate(`${previewUrl}/projects/prj_demo`);
    await expectAnyText(view, ["Environments", "环境"]);
    const clicked = await waitFor(
      () =>
        view.evaluate<boolean>(
          `(() => {
            const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
              candidate.getAttribute("title") === "Lock" ||
              candidate.getAttribute("title") === "锁定"
            );
            if (!(button instanceof HTMLButtonElement)) {
              return false;
            }
            button.click();
            return true;
          })()`,
        ),
      Boolean,
      "Expected environment lock button",
    );
    expect(clicked).toBe(true);
    await acceptConsoleConfirm(view);

    const lockRequest = await waitForRecordedRequest("/api/rpc/environments/lock");
    const lockInput = readOrpcJsonPayload(lockRequest.body);

    expect(lockInput).toEqual({
      environmentId: "env_demo",
    });
  }, 15_000);

  test("[ENV-LIFE-ENTRY-006] submits environment unlock through Web", async () => {
    activeScenario = "dashboard";
    resetRecordedApiRequests();
    const listResponse = apiResponses.dashboard["/api/rpc/environments/list"] as {
      json: {
        items: Array<{
          lifecycleStatus: string;
          lockedAt?: string;
          lockReason?: string;
        }>;
      };
    };
    const previousEnvironment = { ...listResponse.json.items[0] };
    listResponse.json.items[0] = {
      ...previousEnvironment,
      lifecycleStatus: "locked",
      lockedAt: "2026-01-01T00:00:10.000Z",
      lockReason: "Change freeze",
    };

    try {
      await using view = createWebView();
      await view.navigate(`${previewUrl}/projects/prj_demo?tab=environments`);
      await expectAnyText(view, ["Locked", "已锁定"]);
      const clicked = await waitFor(
        () =>
          view.evaluate<boolean>(
            `(() => {
              const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
                candidate.getAttribute("title") === "Unlock" ||
                candidate.getAttribute("title") === "解锁"
              );
              if (!(button instanceof HTMLButtonElement)) {
                return false;
              }
              button.click();
              return true;
            })()`,
          ),
        Boolean,
        "Expected environment unlock button",
      );
      expect(clicked).toBe(true);

      const unlockRequest = await waitForRecordedRequest("/api/rpc/environments/unlock");
      const unlockInput = readOrpcJsonPayload(unlockRequest.body);

      expect(unlockInput).toEqual({
        environmentId: "env_demo",
      });
    } finally {
      listResponse.json.items[0] = previousEnvironment;
    }
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
      await submitConsolePrompt(view, "workspace");

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
      await expectAnyText(view, ["Ready", "READY", "已就绪", "就绪"]);
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
    await expectAnyText(view, ["Project", "项目"]);
    await expectText(view, "acme/platform");
    await expectAnyText(view, ["Server", "服务器"]);
    expect(
      await view.evaluate<string>(
        `JSON.stringify({
          name: document.querySelector('#server-name')?.value ?? null,
          host: document.querySelector('#server-host')?.value ?? null,
          port: document.querySelector('#server-port')?.value ?? null,
        })`,
      ),
    ).toBe(JSON.stringify({ name: "", host: "", port: "" }));
  }, 15_000);

  test("[QUICK-DEPLOY-ENTRY-008] maps Web static site draft fields through resources.create", async () => {
    activeScenario = "static-quick-deploy";
    resetRecordedApiRequests();

    const deployState = new URL(`${previewUrl}/deploy`);
    deployState.searchParams.set("step", "review");
    deployState.searchParams.set("source", "remote-git");
    deployState.searchParams.set("sourceLocator", "https://github.com/acme/docs-site.git");
    deployState.searchParams.set("editResource", "true");
    deployState.searchParams.set("resourceMode", "new");
    deployState.searchParams.set("resourceKind", "static-site");
    deployState.searchParams.set("staticPublishDirectory", "/dist");
    deployState.searchParams.set("staticInstallCommand", "pnpm install");
    deployState.searchParams.set("staticBuildCommand", "pnpm build");
    deployState.searchParams.set("resourceRuntimeName", "preview-456");
    deployState.searchParams.set("projectId", "prj_static");
    deployState.searchParams.set("serverId", "srv_static");

    await using view = createWebView();
    await view.navigate(deployState.toString());
    await view.evaluate<void>(`(() => {
      window.__appaloftCopiedText = "";
      window.appaloftDesktop = {
        copyText: async (text) => {
          window.__appaloftCopiedText = text;
        },
      };
    })()`);

    await expectAnyText(view, ["Static site", "静态站点"]);
    await expectText(view, "https://github.com/acme/docs-site.git");
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
    await expectLocation(view, "/deployments/dep_static");
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

  test("[QUICK-DEPLOY-ENTRY-013][WF-PLAN-ENTRY-005] maps Web framework runtime draft fields through resources.create", async () => {
    activeScenario = "static-quick-deploy";
    resetRecordedApiRequests();

    const deployState = new URL(`${previewUrl}/deploy`);
    deployState.searchParams.set("step", "review");
    deployState.searchParams.set("source", "local-folder");
    deployState.searchParams.set("sourceLocator", "/workspace");
    deployState.searchParams.set(
      "sourceBaseDirectory",
      "packages/adapters/filesystem/test/fixtures/frameworks/fastapi-uv",
    );
    deployState.searchParams.set("resourceInstallCommand", "uv sync --frozen");
    deployState.searchParams.set("resourceBuildCommand", "bun run build");
    deployState.searchParams.set(
      "resourceStartCommand",
      "uv run fastapi run app/main.py --host 0.0.0.0",
    );
    deployState.searchParams.set("resourceDockerfilePath", "deploy/Dockerfile");
    deployState.searchParams.set("resourceBuildTarget", "runner");
    deployState.searchParams.set("resourceInternalPort", "8000");
    deployState.searchParams.set("projectId", "prj_static");
    deployState.searchParams.set("serverId", "srv_static");

    await using view = createWebView();
    await view.navigate(deployState.toString());

    await expectInputValue(
      view,
      "#source-base-directory",
      "packages/adapters/filesystem/test/fixtures/frameworks/fastapi-uv",
    );
    await expectInputValue(view, "#runtime-dockerfile-path", "deploy/Dockerfile");
    await expectInputValue(view, "#runtime-build-target", "runner");
    await clickButtonByAnyText(view, ["Create and deploy", "创建并部署"]);

    const resourcesCreateRequest = await waitForRecordedRequest("/api/rpc/resources/create");
    const resourceInput = readOrpcJsonPayload(resourcesCreateRequest.body);

    expect(resourceInput).toEqual(
      expect.objectContaining({
        projectId: "prj_static",
        environmentId: "env_static",
        kind: "application",
        source: expect.objectContaining({
          kind: "local-folder",
          locator: "/workspace",
          baseDirectory: "packages/adapters/filesystem/test/fixtures/frameworks/fastapi-uv",
        }),
        runtimeProfile: expect.objectContaining({
          strategy: "dockerfile",
          installCommand: "uv sync --frozen",
          buildCommand: "bun run build",
          startCommand: "uv run fastapi run app/main.py --host 0.0.0.0",
          dockerfilePath: "deploy/Dockerfile",
          buildTarget: "runner",
        }),
        networkProfile: expect.objectContaining({
          internalPort: 8000,
          upstreamProtocol: "http",
          exposureMode: "reverse-proxy",
        }),
      }),
    );

    const resourceRecord = resourceInput as Record<string, unknown>;
    expect(resourceRecord.deploymentMethod).toBeUndefined();
    expect(resourceRecord.port).toBeUndefined();

    const deploymentRequest = await waitForRecordedRequest("/api/deployments");
    expect(deploymentRequest.body).toEqual({
      projectId: "prj_static",
      serverId: "srv_static",
      environmentId: "env_static",
      resourceId: "res_static",
    });
  }, 15_000);
});
