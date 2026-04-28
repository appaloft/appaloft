import { z } from "zod";

export * from "./quick-deploy-workflow";

export const apiVersion = "v1";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  timestamp: z.string(),
});

export const readinessResponseSchema = z.object({
  status: z.enum(["ready", "degraded"]),
  checks: z.object({
    database: z.boolean(),
    migrations: z.boolean(),
  }),
  details: z.record(z.string(), z.string()).optional(),
});

export const versionResponseSchema = z.object({
  name: z.string(),
  version: z.string(),
  apiVersion: z.string(),
  mode: z.enum(["hosted-control-plane", "self-hosted"]),
});

export const authProviderStatusSchema = z.object({
  key: z.literal("github"),
  title: z.string(),
  configured: z.boolean(),
  connected: z.boolean(),
  requiresSignIn: z.boolean(),
  deferred: z.boolean(),
  connectPath: z.string().optional(),
  reason: z.string().optional(),
});

export const authSessionResponseSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["none", "better-auth"]),
  loginRequired: z.boolean(),
  deferredAuth: z.boolean(),
  session: z.unknown().nullable(),
  providers: z.array(authProviderStatusSchema),
});

export const pluginSummarySchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  version: z.string(),
  kind: z.enum(["user-extension", "system-extension"]),
  capabilities: z.array(z.string()),
  compatible: z.boolean(),
});

export const systemPluginWebExtensionSchema = z.object({
  key: z.string(),
  pluginName: z.string(),
  pluginDisplayName: z.string(),
  title: z.string(),
  description: z.string().optional(),
  path: z.string(),
  placement: z.enum(["auth", "navigation", "settings"]),
  target: z.enum(["server-page", "external-page"]),
  requiresAuth: z.boolean(),
});

export const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  lifecycleStatus: z.enum(["active", "archived"]),
  archivedAt: z.string().optional(),
  archiveReason: z.string().optional(),
  createdAt: z.string(),
});

export const createProjectInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const showProjectInputSchema = z.object({
  projectId: z.string().min(1),
});

export const renameProjectInputSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
});

export const archiveProjectInputSchema = z.object({
  projectId: z.string().min(1),
  reason: z.string().min(1).max(280).optional(),
});

export const createProjectResponseSchema = z.object({
  id: z.string(),
});

export const listProjectsResponseSchema = z.object({
  items: z.array(projectSummarySchema),
});

export const showProjectResponseSchema = projectSummarySchema;

export const renameProjectResponseSchema = z.object({
  id: z.string(),
});

export const archiveProjectResponseSchema = z.object({
  id: z.string(),
});

export const serverSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  providerKey: z.string(),
  lifecycleStatus: z.enum(["active", "inactive"]),
  deactivatedAt: z.string().optional(),
  deactivationReason: z.string().optional(),
  edgeProxy: z
    .object({
      kind: z.enum(["none", "traefik", "caddy"]),
      status: z.enum(["pending", "starting", "ready", "failed", "disabled"]),
      lastAttemptAt: z.string().optional(),
      lastSucceededAt: z.string().optional(),
      lastErrorCode: z.string().optional(),
      lastErrorMessage: z.string().optional(),
    })
    .optional(),
  credential: z
    .object({
      kind: z.enum(["local-ssh-agent", "ssh-private-key"]),
      credentialId: z.string().optional(),
      credentialName: z.string().optional(),
      username: z.string().optional(),
      publicKeyConfigured: z.boolean(),
      privateKeyConfigured: z.boolean(),
    })
    .optional(),
  createdAt: z.string(),
});

export const registerServerInputSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().positive().optional(),
  providerKey: z.string().min(1),
  proxyKind: z.enum(["none", "traefik", "caddy"]).default("traefik"),
});

export const showServerInputSchema = z.object({
  serverId: z.string().min(1),
  includeRollups: z
    .union([
      z.boolean(),
      z.literal("true").transform(() => true),
      z.literal("false").transform(() => false),
    ])
    .default(true),
});

export const renameServerInputSchema = z.object({
  serverId: z.string().min(1),
  name: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
});

export const renameServerResponseSchema = z.object({
  id: z.string(),
});

export const configureServerEdgeProxyInputSchema = z.object({
  serverId: z.string().min(1),
  proxyKind: z.enum(["none", "traefik", "caddy"]),
  idempotencyKey: z.string().min(1).optional(),
});

export const configureServerEdgeProxyResponseSchema = z.object({
  id: z.string(),
  edgeProxy: z.object({
    kind: z.enum(["none", "traefik", "caddy"]),
    status: z.enum(["pending", "starting", "ready", "failed", "disabled"]),
  }),
});

export const deactivateServerInputSchema = z.object({
  serverId: z.string().min(1),
  reason: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export const deactivateServerResponseSchema = z.object({
  id: z.string(),
});

export const deleteServerInputSchema = z.object({
  serverId: z.string().min(1),
  confirmation: z.object({
    serverId: z.string().min(1),
  }),
  idempotencyKey: z.string().min(1).optional(),
});

export const deleteServerResponseSchema = z.object({
  id: z.string(),
});

export const checkServerDeleteSafetyInputSchema = z.object({
  serverId: z.string().min(1),
});

export const serverDeleteBlockerKindSchema = z.enum([
  "active-server",
  "deployment-history",
  "active-deployment",
  "resource-placement",
  "domain-binding",
  "certificate",
  "credential",
  "source-link",
  "server-applied-route",
  "default-access-policy",
  "terminal-session",
  "runtime-task",
  "runtime-log-retention",
  "audit-retention",
]);

export const serverDeleteBlockerSchema = z.object({
  kind: serverDeleteBlockerKindSchema,
  relatedEntityId: z.string().optional(),
  relatedEntityType: z.string().optional(),
  count: z.number().optional(),
});

export const serverDeleteSafetySchema = z.object({
  schemaVersion: z.literal("servers.delete-check/v1"),
  serverId: z.string(),
  lifecycleStatus: z.enum(["active", "inactive"]),
  eligible: z.boolean(),
  blockers: z.array(serverDeleteBlockerSchema),
  checkedAt: z.string(),
});

export const checkServerDeleteSafetyResponseSchema = serverDeleteSafetySchema;

export const configureServerCredentialInputSchema = z.object({
  serverId: z.string().min(1),
  credential: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("local-ssh-agent"),
      username: z.string().min(1).optional(),
    }),
    z.object({
      kind: z.literal("ssh-private-key"),
      username: z.string().min(1).optional(),
      publicKey: z.string().min(1).optional(),
      privateKey: z.string().min(1),
    }),
    z.object({
      kind: z.literal("stored-ssh-private-key"),
      credentialId: z.string().min(1),
      username: z.string().min(1).optional(),
    }),
  ]),
});

export const sshCredentialSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.literal("ssh-private-key"),
  username: z.string().optional(),
  publicKeyConfigured: z.boolean(),
  privateKeyConfigured: z.boolean(),
  createdAt: z.string(),
  rotatedAt: z.string().optional(),
});

export const sshCredentialUsageServerSchema = z.object({
  serverId: z.string(),
  serverName: z.string(),
  lifecycleStatus: z.enum(["active", "inactive"]),
  providerKey: z.string(),
  host: z.string(),
  username: z.string().optional(),
});

export const sshCredentialUsageSummarySchema = z.object({
  totalServers: z.number(),
  activeServers: z.number(),
  inactiveServers: z.number(),
  servers: z.array(sshCredentialUsageServerSchema),
});

export const sshCredentialDetailSchema = z.object({
  schemaVersion: z.literal("credentials.show/v1"),
  credential: sshCredentialSummarySchema,
  usage: sshCredentialUsageSummarySchema.optional(),
  generatedAt: z.string(),
});

export const createSshCredentialInputSchema = z.object({
  name: z.string().min(1),
  kind: z.literal("ssh-private-key"),
  username: z.string().min(1).optional(),
  publicKey: z.string().min(1).optional(),
  privateKey: z.string().min(1),
});

export const createSshCredentialResponseSchema = z.object({
  id: z.string(),
});

export const deleteSshCredentialInputSchema = z.object({
  credentialId: z.string().min(1),
  confirmation: z.object({
    credentialId: z.string().min(1),
  }),
  idempotencyKey: z.string().min(1).optional(),
});

export const deleteSshCredentialResponseSchema = z.object({
  id: z.string(),
});

export const rotateSshCredentialInputSchema = z.object({
  credentialId: z.string().min(1),
  privateKey: z.string().min(1),
  publicKey: z.string().min(1).nullable().optional(),
  username: z.string().min(1).nullable().optional(),
  confirmation: z.object({
    credentialId: z.string().min(1),
    acknowledgeServerUsage: z.boolean().optional(),
  }),
  idempotencyKey: z.string().min(1).optional(),
});

export const rotateSshCredentialResponseSchema = z.object({
  schemaVersion: z.literal("credentials.rotate-ssh/v1"),
  credential: z.object({
    id: z.string(),
    kind: z.literal("ssh-private-key"),
    usernameConfigured: z.boolean(),
    publicKeyConfigured: z.boolean(),
    privateKeyConfigured: z.boolean(),
    rotatedAt: z.string(),
  }),
  affectedUsage: sshCredentialUsageSummarySchema,
});

export const listSshCredentialsResponseSchema = z.object({
  items: z.array(sshCredentialSummarySchema),
});

export const showSshCredentialResponseSchema = sshCredentialDetailSchema;

export const registerServerResponseSchema = z.object({
  id: z.string(),
});

export const listServersResponseSchema = z.object({
  items: z.array(serverSummarySchema),
});

const serverDeploymentStatusSchema = z.enum([
  "created",
  "planning",
  "planned",
  "running",
  "cancel-requested",
  "succeeded",
  "failed",
  "canceled",
  "rolled-back",
]);

const serverDomainBindingStatusSchema = z.enum([
  "requested",
  "pending_verification",
  "bound",
  "certificate_pending",
  "ready",
  "not_ready",
  "failed",
]);

const serverDeploymentStatusCountSchema = z.object({
  status: serverDeploymentStatusSchema,
  count: z.number(),
});

const serverDomainStatusCountSchema = z.object({
  status: serverDomainBindingStatusSchema,
  count: z.number(),
});

export const serverDetailSchema = z.object({
  schemaVersion: z.literal("servers.show/v1"),
  server: serverSummarySchema,
  rollups: z
    .object({
      resources: z.object({
        total: z.number(),
        deployedResourceIds: z.array(z.string()),
      }),
      deployments: z.object({
        total: z.number(),
        statusCounts: z.array(serverDeploymentStatusCountSchema),
        latestDeploymentId: z.string().optional(),
        latestDeploymentStatus: serverDeploymentStatusSchema.optional(),
      }),
      domains: z.object({
        total: z.number(),
        statusCounts: z.array(serverDomainStatusCountSchema),
        latestDomainBindingId: z.string().optional(),
        latestDomainBindingStatus: serverDomainBindingStatusSchema.optional(),
      }),
    })
    .optional(),
  generatedAt: z.string(),
});

export const showServerResponseSchema = serverDetailSchema;

export const serverConnectivityCheckSchema = z.object({
  name: z.string(),
  status: z.enum(["passed", "failed", "skipped"]),
  message: z.string(),
  durationMs: z.number(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const testServerConnectivityResponseSchema = z.object({
  serverId: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  providerKey: z.string(),
  checkedAt: z.string(),
  status: z.enum(["healthy", "degraded", "unreachable"]),
  checks: z.array(serverConnectivityCheckSchema),
});

export const bootstrapServerProxyResponseSchema = z.object({
  serverId: z.string().min(1),
  attemptId: z.string().min(1),
});

export const environmentVariableSchema = z.object({
  key: z.string(),
  value: z.string(),
  scope: z.string(),
  exposure: z.enum(["build-time", "runtime"]),
  isSecret: z.boolean(),
  kind: z.string(),
});

export const resourceConfigEntrySchema = environmentVariableSchema.extend({
  updatedAt: z.string().optional(),
});

export const environmentSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  kind: z.enum(["local", "development", "test", "staging", "production", "preview", "custom"]),
  parentEnvironmentId: z.string().optional(),
  lifecycleStatus: z.enum(["active", "locked", "archived"]),
  lockedAt: z.string().optional(),
  lockReason: z.string().optional(),
  archivedAt: z.string().optional(),
  archiveReason: z.string().optional(),
  createdAt: z.string(),
  maskedVariables: z.array(environmentVariableSchema),
});

export const resourceServiceSummarySchema = z.object({
  name: z.string(),
  kind: z.enum(["web", "api", "worker", "database", "cache", "service"]),
});

export const resourceNetworkProfileSchema = z
  .object({
    internalPort: z.number().int().positive(),
    upstreamProtocol: z.enum(["http", "tcp"]).default("http"),
    exposureMode: z.enum(["none", "reverse-proxy", "direct-port"]).default("reverse-proxy"),
    targetServiceName: z.string().min(1).optional(),
    hostPort: z.number().int().positive().optional(),
  })
  .superRefine((value, context) => {
    if (value.hostPort && value.exposureMode !== "direct-port") {
      context.addIssue({
        code: "custom",
        path: ["hostPort"],
        message: "hostPort is valid only when exposureMode is direct-port",
      });
    }
  });

export const resourceAccessProfileSchema = z.object({
  generatedAccessMode: z.enum(["inherit", "disabled"]).default("inherit"),
  pathPrefix: z.string().min(1).default("/"),
});

export const resourceAccessRouteSummarySchema = z.object({
  url: z.string(),
  hostname: z.string(),
  scheme: z.enum(["http", "https"]),
  providerKey: z.string().optional(),
  deploymentId: z.string(),
  deploymentStatus: z.enum([
    "created",
    "planning",
    "planned",
    "running",
    "cancel-requested",
    "succeeded",
    "failed",
    "canceled",
    "rolled-back",
  ]),
  pathPrefix: z.string(),
  proxyKind: z.enum(["none", "traefik", "caddy"]),
  targetPort: z.number().int().positive().optional(),
  updatedAt: z.string(),
});

export const plannedResourceAccessRouteSummarySchema = z.object({
  url: z.string(),
  hostname: z.string(),
  scheme: z.enum(["http", "https"]),
  providerKey: z.string().optional(),
  pathPrefix: z.string(),
  proxyKind: z.enum(["none", "traefik", "caddy"]),
  targetPort: z.number().int().positive(),
});

export const resourceAccessSummarySchema = z.object({
  plannedGeneratedAccessRoute: plannedResourceAccessRouteSummarySchema.optional(),
  latestGeneratedAccessRoute: resourceAccessRouteSummarySchema.optional(),
  latestDurableDomainRoute: resourceAccessRouteSummarySchema.optional(),
  latestServerAppliedDomainRoute: resourceAccessRouteSummarySchema.optional(),
  proxyRouteStatus: z.enum(["unknown", "ready", "not-ready", "failed"]).optional(),
  lastRouteRealizationDeploymentId: z.string().optional(),
});

export const resourceHealthOverallSchema = z.enum([
  "healthy",
  "degraded",
  "unhealthy",
  "starting",
  "stopped",
  "not-deployed",
  "unknown",
]);

export const resourceHealthSourceErrorSchema = z.object({
  source: z.enum([
    "deployment",
    "runtime",
    "health-policy",
    "health-check",
    "proxy",
    "public-access",
    "domain-binding",
  ]),
  code: z.string(),
  category: z.string(),
  phase: z.string(),
  retriable: z.boolean(),
  relatedEntityId: z.string().optional(),
  relatedState: z.string().optional(),
  message: z.string().optional(),
});

export const resourceHealthCheckSchema = z.object({
  name: z.string(),
  target: z.enum(["runtime", "container", "command", "public-access", "proxy-route"]),
  status: z.enum(["passed", "failed", "skipped", "unknown"]),
  observedAt: z.string(),
  durationMs: z.number().optional(),
  statusCode: z.number().optional(),
  exitCode: z.number().optional(),
  message: z.string().optional(),
  reasonCode: z.string().optional(),
  phase: z.string().optional(),
  retriable: z.boolean().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const resourceHealthDeploymentContextSchema = z.object({
  id: z.string(),
  status: z.enum([
    "created",
    "planning",
    "planned",
    "running",
    "cancel-requested",
    "succeeded",
    "failed",
    "canceled",
    "rolled-back",
  ]),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  serverId: z.string(),
  destinationId: z.string(),
  lastError: z
    .object({
      timestamp: z.string(),
      phase: z.enum(["detect", "plan", "package", "deploy", "verify", "rollback"]),
      message: z.string(),
    })
    .optional(),
});

export const resourceHealthSummarySchema = z.object({
  schemaVersion: z.literal("resources.health/v1"),
  resourceId: z.string(),
  generatedAt: z.string(),
  observedAt: z.string().optional(),
  overall: resourceHealthOverallSchema,
  latestDeployment: resourceHealthDeploymentContextSchema.optional(),
  runtime: z.object({
    lifecycle: z.enum([
      "not-deployed",
      "starting",
      "running",
      "restarting",
      "degraded",
      "stopped",
      "exited",
      "unknown",
    ]),
    health: z.enum(["healthy", "unhealthy", "unknown", "not-configured"]),
    observedAt: z.string().optional(),
    runtimeKind: z.enum(["docker-container", "docker-compose-stack", "host-process"]).optional(),
    reasonCode: z.string().optional(),
    message: z.string().optional(),
  }),
  healthPolicy: z.object({
    status: z.enum(["configured", "not-configured", "unsupported"]),
    enabled: z.boolean(),
    type: z.enum(["http", "command"]).optional(),
    path: z.string().optional(),
    port: z.number().optional(),
    expectedStatusCode: z.number().optional(),
    intervalSeconds: z.number().optional(),
    timeoutSeconds: z.number().optional(),
    retries: z.number().optional(),
    startPeriodSeconds: z.number().optional(),
    reasonCode: z.string().optional(),
  }),
  publicAccess: z.object({
    status: z.enum(["ready", "not-ready", "failed", "unknown", "not-configured"]),
    url: z.string().optional(),
    kind: z
      .enum(["durable-domain", "server-applied-domain", "generated-latest", "generated-planned"])
      .optional(),
    reasonCode: z.string().optional(),
    phase: z.string().optional(),
  }),
  proxy: z.object({
    status: z.enum(["ready", "not-ready", "failed", "unknown", "not-configured"]),
    providerKey: z.string().optional(),
    lastRouteRealizationDeploymentId: z.string().optional(),
    reasonCode: z.string().optional(),
  }),
  checks: z.array(resourceHealthCheckSchema),
  sourceErrors: z.array(resourceHealthSourceErrorSchema),
});

export const resourceSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  destinationId: z.string().optional(),
  name: z.string(),
  slug: z.string(),
  kind: z.enum([
    "application",
    "service",
    "database",
    "cache",
    "compose-stack",
    "worker",
    "static-site",
    "external",
  ]),
  description: z.string().optional(),
  createdAt: z.string(),
  services: z.array(resourceServiceSummarySchema),
  networkProfile: resourceNetworkProfileSchema.optional(),
  accessProfile: resourceAccessProfileSchema.optional(),
  deploymentCount: z.number(),
  lastDeploymentId: z.string().optional(),
  lastDeploymentStatus: z
    .enum([
      "created",
      "planning",
      "planned",
      "running",
      "cancel-requested",
      "succeeded",
      "failed",
      "canceled",
      "rolled-back",
    ])
    .optional(),
  accessSummary: resourceAccessSummarySchema.optional(),
});

export const deploymentResourceInputSchema = z.object({
  name: z.string().min(1),
  kind: z
    .enum([
      "application",
      "service",
      "database",
      "cache",
      "compose-stack",
      "worker",
      "static-site",
      "external",
    ])
    .optional(),
  description: z.string().min(1).optional(),
  services: z
    .array(
      z.object({
        name: z.string().min(1),
        kind: z.enum(["web", "api", "worker", "database", "cache", "service"]),
      }),
    )
    .optional(),
});

export const resourceHealthCheckPolicySchema = z
  .object({
    enabled: z.boolean().default(true),
    type: z.literal("http").default("http"),
    intervalSeconds: z.number().int().positive().default(5),
    timeoutSeconds: z.number().int().positive().default(5),
    retries: z.number().int().positive().default(10),
    startPeriodSeconds: z.number().int().nonnegative().default(5),
    http: z
      .object({
        method: z.enum(["GET", "HEAD", "POST", "OPTIONS"]).default("GET"),
        scheme: z.enum(["http", "https"]).default("http"),
        host: z.string().min(1).default("localhost"),
        port: z.number().int().positive().max(65535).optional(),
        path: z.string().min(1).default("/"),
        expectedStatusCode: z.number().int().min(100).max(599).default(200),
        expectedResponseText: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.enabled && value.type === "http" && !value.http) {
      context.addIssue({
        code: "custom",
        path: ["http"],
        message: "HTTP health checks require http configuration",
      });
    }
  });

export const requestedDeploymentHealthCheckSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(["http", "command"]),
  intervalSeconds: z.number().int().positive(),
  timeoutSeconds: z.number().int().positive(),
  retries: z.number().int().positive(),
  startPeriodSeconds: z.number().int().nonnegative(),
  http: z
    .object({
      method: z.enum(["GET", "HEAD", "POST", "OPTIONS"]),
      scheme: z.enum(["http", "https"]),
      host: z.string(),
      port: z.number().int().positive().max(65535).optional(),
      path: z.string(),
      expectedStatusCode: z.number().int().min(100).max(599),
      expectedResponseText: z.string().optional(),
    })
    .optional(),
});

export const showResourceInputSchema = z.object({
  resourceId: z.string().min(1),
  includeLatestDeployment: z.boolean().default(true),
  includeAccessSummary: z.boolean().default(true),
  includeProfileDiagnostics: z.boolean().default(false),
});

export const resourceDetailIdentitySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  destinationId: z.string().optional(),
  name: z.string(),
  slug: z.string(),
  kind: z.enum([
    "application",
    "service",
    "database",
    "cache",
    "compose-stack",
    "worker",
    "static-site",
    "external",
  ]),
  description: z.string().optional(),
  createdAt: z.string(),
  services: z.array(resourceServiceSummarySchema),
  deploymentCount: z.number(),
  lastDeploymentId: z.string().optional(),
  lastDeploymentStatus: z
    .enum([
      "created",
      "planning",
      "planned",
      "running",
      "cancel-requested",
      "succeeded",
      "failed",
      "canceled",
      "rolled-back",
    ])
    .optional(),
});

export const resourceDetailSourceProfileSchema = z.object({
  kind: z.enum([
    "local-folder",
    "local-git",
    "remote-git",
    "git-public",
    "git-github-app",
    "git-deploy-key",
    "zip-artifact",
    "dockerfile-inline",
    "docker-compose-inline",
    "docker-image",
    "compose",
  ]),
  locator: z.string(),
  displayName: z.string(),
  gitRef: z.string().optional(),
  commitSha: z.string().optional(),
  baseDirectory: z.string().optional(),
  originalLocator: z.string().optional(),
  repositoryId: z.string().optional(),
  repositoryFullName: z.string().optional(),
  defaultBranch: z.string().optional(),
  imageName: z.string().optional(),
  imageTag: z.string().optional(),
  imageDigest: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const resourceSourceBindingInputSchema = z.object({
  kind: z.enum([
    "local-folder",
    "local-git",
    "remote-git",
    "git-public",
    "git-github-app",
    "git-deploy-key",
    "zip-artifact",
    "dockerfile-inline",
    "docker-compose-inline",
    "docker-image",
    "compose",
  ]),
  locator: z.string().min(1),
  displayName: z.string().min(1).optional(),
  gitRef: z.string().min(1).optional(),
  commitSha: z.string().min(1).optional(),
  baseDirectory: z.string().min(1).optional(),
  originalLocator: z.string().min(1).optional(),
  repositoryId: z.string().min(1).optional(),
  repositoryFullName: z.string().min(1).optional(),
  defaultBranch: z.string().min(1).optional(),
  imageName: z.string().min(1).optional(),
  imageTag: z.string().min(1).optional(),
  imageDigest: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const resourceRuntimeProfileInputSchema = z
  .object({
    strategy: z
      .enum([
        "auto",
        "dockerfile",
        "docker-compose",
        "prebuilt-image",
        "workspace-commands",
        "static",
      ])
      .default("auto"),
    installCommand: z.string().min(1).optional(),
    buildCommand: z.string().min(1).optional(),
    startCommand: z.string().min(1).optional(),
    runtimeName: z.string().min(1).optional(),
    publishDirectory: z.string().min(1).optional(),
    dockerfilePath: z.string().min(1).optional(),
    dockerComposeFilePath: z.string().min(1).optional(),
    buildTarget: z.string().min(1).optional(),
    healthCheckPath: z.string().min(1).optional(),
    healthCheck: resourceHealthCheckPolicySchema.optional(),
  })
  .strict();

export const resourceDetailRuntimeProfileSchema = z.object({
  strategy: z.enum([
    "auto",
    "dockerfile",
    "docker-compose",
    "prebuilt-image",
    "workspace-commands",
    "static",
  ]),
  installCommand: z.string().optional(),
  buildCommand: z.string().optional(),
  startCommand: z.string().optional(),
  runtimeName: z.string().optional(),
  publishDirectory: z.string().optional(),
  dockerfilePath: z.string().optional(),
  dockerComposeFilePath: z.string().optional(),
  buildTarget: z.string().optional(),
  healthCheckPath: z.string().optional(),
  healthCheck: requestedDeploymentHealthCheckSchema.optional(),
});

export const resourceDetailDeploymentContextSchema = resourceHealthDeploymentContextSchema.omit({
  lastError: true,
});

export const resourceDetailProfileDiagnosticSchema = z.object({
  code: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string(),
  path: z.string().optional(),
});

export const resourceDetailSchema = z.object({
  schemaVersion: z.literal("resources.show/v1"),
  resource: resourceDetailIdentitySchema,
  source: resourceDetailSourceProfileSchema.optional(),
  runtimeProfile: resourceDetailRuntimeProfileSchema.optional(),
  networkProfile: resourceNetworkProfileSchema.optional(),
  accessProfile: resourceAccessProfileSchema.optional(),
  healthPolicy: requestedDeploymentHealthCheckSchema.optional(),
  accessSummary: resourceAccessSummarySchema.optional(),
  latestDeployment: resourceDetailDeploymentContextSchema.optional(),
  lifecycle: z.object({
    status: z.enum(["active", "archived", "deleted"]),
    archivedAt: z.string().optional(),
    deletedAt: z.string().optional(),
  }),
  diagnostics: z.array(resourceDetailProfileDiagnosticSchema),
  generatedAt: z.string(),
});

export const showResourceResponseSchema = resourceDetailSchema;

export const setResourceVariableInputSchema = z.object({
  resourceId: z.string().min(1),
  key: z.string().min(1),
  value: z.string(),
  kind: z
    .enum(["plain-config", "secret", "provider-specific", "deployment-strategy"])
    .default("plain-config"),
  exposure: z.enum(["build-time", "runtime"]),
  isSecret: z.boolean().optional(),
});

export const unsetResourceVariableInputSchema = z.object({
  resourceId: z.string().min(1),
  key: z.string().min(1),
  exposure: z.enum(["build-time", "runtime"]),
});

export const resourceEffectiveConfigSchema = z.object({
  schemaVersion: z.literal("resources.effective-config/v1"),
  resourceId: z.string(),
  environmentId: z.string(),
  ownedEntries: z.array(resourceConfigEntrySchema),
  effectiveEntries: z.array(resourceConfigEntrySchema),
  precedence: z.array(z.string()),
  generatedAt: z.string(),
});

export const environmentEffectivePrecedenceSchema = z.object({
  schemaVersion: z.literal("environments.effective-precedence/v1"),
  environmentId: z.string(),
  projectId: z.string(),
  ownedEntries: z.array(resourceConfigEntrySchema),
  effectiveEntries: z.array(resourceConfigEntrySchema),
  precedence: z.array(z.string()),
  generatedAt: z.string(),
});

export const setResourceVariableResponseSchema = z.null();
export const unsetResourceVariableResponseSchema = z.null();
export const resourceEffectiveConfigResponseSchema = resourceEffectiveConfigSchema;

export const createResourceInputSchema = z.object({
  projectId: z.string().min(1),
  environmentId: z.string().min(1),
  destinationId: z.string().min(1).optional(),
  name: z.string().min(1),
  kind: z
    .enum([
      "application",
      "service",
      "database",
      "cache",
      "compose-stack",
      "worker",
      "static-site",
      "external",
    ])
    .default("application"),
  description: z.string().min(1).optional(),
  services: z
    .array(
      z.object({
        name: z.string().min(1),
        kind: z.enum(["web", "api", "worker", "database", "cache", "service"]),
      }),
    )
    .optional(),
  source: resourceSourceBindingInputSchema.optional(),
  runtimeProfile: resourceRuntimeProfileInputSchema.optional(),
  networkProfile: resourceNetworkProfileSchema.optional(),
});

export const createResourceResponseSchema = z.object({
  id: z.string(),
});

export const archiveResourceInputSchema = z.object({
  resourceId: z.string().min(1),
  reason: z.string().min(1).max(280).optional(),
});

export const archiveResourceResponseSchema = z.object({
  id: z.string(),
});

export const deleteResourceInputSchema = z.object({
  resourceId: z.string().min(1),
  confirmation: z.object({
    resourceSlug: z.string().min(1),
  }),
});

export const deleteResourceResponseSchema = z.object({
  id: z.string(),
});

export const configureResourceHealthInputSchema = z.object({
  resourceId: z.string().min(1),
  healthCheck: resourceHealthCheckPolicySchema,
});

export const configureResourceHealthResponseSchema = z.object({
  id: z.string(),
});

export const configureResourceNetworkInputSchema = z.object({
  resourceId: z.string().min(1),
  networkProfile: resourceNetworkProfileSchema,
});

export const configureResourceNetworkResponseSchema = z.object({
  id: z.string(),
});

export const configureResourceAccessInputSchema = z.object({
  resourceId: z.string().min(1),
  accessProfile: resourceAccessProfileSchema,
});

export const configureResourceAccessResponseSchema = z.object({
  id: z.string(),
});

export const configureResourceRuntimeInputSchema = z.object({
  resourceId: z.string().min(1),
  runtimeProfile: resourceRuntimeProfileInputSchema.omit({
    healthCheckPath: true,
    healthCheck: true,
  }),
  idempotencyKey: z.string().min(1).optional(),
});

export const configureResourceRuntimeResponseSchema = z.object({
  id: z.string(),
});

export const configureResourceSourceInputSchema = z.object({
  resourceId: z.string().min(1),
  source: resourceSourceBindingInputSchema,
  idempotencyKey: z.string().min(1).optional(),
});

export const configureResourceSourceResponseSchema = z.object({
  id: z.string(),
});

export const defaultAccessDomainPolicyScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("system"),
  }),
  z.object({
    kind: z.literal("deployment-target"),
    serverId: z.string().min(1),
  }),
]);

export const configureDefaultAccessDomainPolicyInputSchema = z
  .object({
    scope: defaultAccessDomainPolicyScopeSchema,
    mode: z.enum(["disabled", "provider", "custom-template"]),
    providerKey: z.string().min(1).optional(),
    templateRef: z.string().min(1).optional(),
    idempotencyKey: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.mode === "provider" && !value.providerKey) {
      context.addIssue({
        code: "custom",
        path: ["providerKey"],
        message: "Provider key is required for provider mode",
      });
    }

    if (value.mode === "custom-template") {
      if (!value.providerKey) {
        context.addIssue({
          code: "custom",
          path: ["providerKey"],
          message: "Provider key is required for custom-template mode",
        });
      }

      if (!value.templateRef) {
        context.addIssue({
          code: "custom",
          path: ["templateRef"],
          message: "Template ref is required for custom-template mode",
        });
      }
    }
  });

export const configureDefaultAccessDomainPolicyResponseSchema = z.object({
  id: z.string(),
});

export const defaultAccessDomainPolicyReadSchema = z.object({
  schemaVersion: z.literal("default-access-domain-policies.policy/v1"),
  id: z.string(),
  scope: defaultAccessDomainPolicyScopeSchema,
  mode: z.enum(["disabled", "provider", "custom-template"]),
  providerKey: z.string().optional(),
  templateRef: z.string().optional(),
  updatedAt: z.string(),
});

export const listDefaultAccessDomainPoliciesInputSchema = z.object({});

export const listDefaultAccessDomainPoliciesResponseSchema = z.object({
  schemaVersion: z.literal("default-access-domain-policies.list/v1"),
  items: z.array(defaultAccessDomainPolicyReadSchema),
});

export const showDefaultAccessDomainPolicyInputSchema = z
  .object({
    scopeKind: z.enum(["system", "deployment-target"]).default("system"),
    serverId: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.scopeKind === "deployment-target" && !value.serverId) {
      context.addIssue({
        code: "custom",
        path: ["serverId"],
        message: "Server id is required for deployment-target scope",
      });
    }

    if (value.scopeKind === "system" && value.serverId) {
      context.addIssue({
        code: "custom",
        path: ["serverId"],
        message: "Server id is only allowed for deployment-target scope",
      });
    }
  });

export const showDefaultAccessDomainPolicyResponseSchema = z.object({
  schemaVersion: z.literal("default-access-domain-policies.show/v1"),
  scope: defaultAccessDomainPolicyScopeSchema,
  policy: defaultAccessDomainPolicyReadSchema.nullable(),
});

export const listResourcesResponseSchema = z.object({
  items: z.array(resourceSummarySchema),
});

export const proxyConfigurationRouteViewSchema = z.object({
  hostname: z.string(),
  scheme: z.enum(["http", "https"]),
  url: z.string(),
  pathPrefix: z.string(),
  tlsMode: z.enum(["auto", "disabled"]),
  targetPort: z.number().int().positive().optional(),
  source: z.enum(["generated-default", "domain-binding", "deployment-snapshot", "server-applied"]),
  routeBehavior: z.enum(["serve", "redirect"]).optional(),
  redirectTo: z.string().optional(),
  redirectStatus: z
    .union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)])
    .optional(),
});

export const proxyConfigurationSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  format: z.enum(["docker-labels", "file", "command", "yaml", "json", "text"]),
  language: z.string().optional(),
  readonly: z.literal(true),
  redacted: z.boolean(),
  content: z.string(),
  source: z.enum(["provider-rendered", "snapshot", "diagnostic"]),
});

export const proxyConfigurationWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});

export const proxyConfigurationTlsDiagnosticSchema = z.object({
  hostname: z.string(),
  pathPrefix: z.string(),
  tlsMode: z.enum(["auto", "disabled"]),
  scheme: z.enum(["http", "https"]),
  automation: z.enum(["disabled", "provider-local"]),
  certificateSource: z.enum(["none", "provider-local"]),
  appaloftCertificateManaged: z.boolean(),
  message: z.string(),
  details: z.record(z.string(), z.string()).optional(),
});

export const proxyConfigurationDiagnosticsSchema = z.object({
  providerKey: z.string(),
  routeCount: z.number(),
  networkName: z.string().optional(),
  tlsRoutes: z.array(proxyConfigurationTlsDiagnosticSchema).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const proxyConfigurationViewSchema = z.object({
  resourceId: z.string(),
  deploymentId: z.string().optional(),
  providerKey: z.string(),
  routeScope: z.enum(["planned", "latest", "deployment-snapshot"]),
  status: z.enum(["not-configured", "planned", "applied", "stale", "failed"]),
  generatedAt: z.string(),
  lastAppliedDeploymentId: z.string().optional(),
  stale: z.boolean(),
  routes: z.array(proxyConfigurationRouteViewSchema),
  sections: z.array(proxyConfigurationSectionSchema),
  warnings: z.array(proxyConfigurationWarningSchema),
  diagnostics: proxyConfigurationDiagnosticsSchema.optional(),
});

export const createDomainBindingInputSchema = z.object({
  projectId: z.string().min(1),
  environmentId: z.string().min(1),
  resourceId: z.string().min(1),
  serverId: z.string().min(1),
  destinationId: z.string().min(1),
  domainName: z.string().min(1),
  pathPrefix: z.string().min(1).default("/"),
  proxyKind: z.enum(["none", "traefik", "caddy"]),
  tlsMode: z.enum(["auto", "disabled"]).default("auto"),
  redirectTo: z.string().min(1).optional(),
  redirectStatus: z
    .union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)])
    .optional(),
  certificatePolicy: z.enum(["auto", "manual", "disabled"]).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export const createDomainBindingResponseSchema = z.object({
  id: z.string(),
});

export const confirmDomainBindingOwnershipInputSchema = z.object({
  domainBindingId: z.string().min(1),
  verificationAttemptId: z.string().min(1).optional(),
  verificationMode: z.enum(["dns", "manual"]).optional(),
  confirmedBy: z.string().min(1).optional(),
  evidence: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export const confirmDomainBindingOwnershipResponseSchema = z.object({
  id: z.string(),
  verificationAttemptId: z.string(),
});

export const domainBindingSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  resourceId: z.string(),
  serverId: z.string(),
  destinationId: z.string(),
  domainName: z.string(),
  pathPrefix: z.string(),
  proxyKind: z.enum(["none", "traefik", "caddy"]),
  tlsMode: z.enum(["auto", "disabled"]),
  redirectTo: z.string().optional(),
  redirectStatus: z
    .union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)])
    .optional(),
  certificatePolicy: z.enum(["auto", "manual", "disabled"]),
  status: z.enum([
    "requested",
    "pending_verification",
    "bound",
    "certificate_pending",
    "ready",
    "not_ready",
    "failed",
  ]),
  dnsObservation: z
    .object({
      status: z.enum(["pending", "matched", "mismatch", "unresolved", "lookup_failed", "skipped"]),
      expectedTargets: z.array(z.string()),
      observedTargets: z.array(z.string()),
      checkedAt: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
  verificationAttemptCount: z.number(),
  createdAt: z.string(),
});

export const listDomainBindingsResponseSchema = z.object({
  items: z.array(domainBindingSummarySchema),
});

export const issueOrRenewCertificateInputSchema = z.object({
  domainBindingId: z.string().min(1),
  certificateId: z.string().min(1).optional(),
  reason: z.enum(["issue", "renew", "replace"]).default("issue"),
  providerKey: z.string().min(1).optional(),
  challengeType: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
  causationId: z.string().min(1).optional(),
});

export const issueOrRenewCertificateResponseSchema = z.object({
  certificateId: z.string(),
  attemptId: z.string(),
});

export const importCertificateInputSchema = z.object({
  domainBindingId: z.string().min(1),
  certificateChain: z.string().min(1),
  privateKey: z.string().min(1),
  passphrase: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
  causationId: z.string().min(1).optional(),
});

export const importCertificateResponseSchema = z.object({
  certificateId: z.string(),
  attemptId: z.string(),
});

export const certificateAttemptSummarySchema = z.object({
  id: z.string(),
  status: z.enum(["requested", "issuing", "issued", "failed", "retry_scheduled"]),
  reason: z.enum(["issue", "renew", "replace"]),
  providerKey: z.string(),
  challengeType: z.string(),
  requestedAt: z.string(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  failedAt: z.string().optional(),
  errorCode: z.string().optional(),
  failurePhase: z.string().optional(),
  failureMessage: z.string().optional(),
  retriable: z.boolean().optional(),
  retryAfter: z.string().optional(),
});

export const certificateSummarySchema = z.object({
  id: z.string(),
  domainBindingId: z.string(),
  domainName: z.string(),
  status: z.enum(["pending", "issuing", "active", "renewing", "failed", "expired", "disabled"]),
  source: z.enum(["managed", "imported"]),
  providerKey: z.string(),
  challengeType: z.string(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  fingerprint: z.string().optional(),
  notBefore: z.string().optional(),
  issuer: z.string().optional(),
  keyAlgorithm: z.string().optional(),
  subjectAlternativeNames: z.array(z.string()).optional(),
  latestAttempt: certificateAttemptSummarySchema.optional(),
  createdAt: z.string(),
});

export const listCertificatesResponseSchema = z.object({
  items: z.array(certificateSummarySchema),
});

export const createEnvironmentInputSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  kind: z.enum(["local", "development", "test", "staging", "production", "preview", "custom"]),
  parentEnvironmentId: z.string().optional(),
});

export const createEnvironmentResponseSchema = z.object({
  id: z.string(),
});

export const listEnvironmentsResponseSchema = z.object({
  items: z.array(environmentSummarySchema),
});

export const archiveEnvironmentInputSchema = z.object({
  environmentId: z.string().min(1),
  reason: z.string().min(1).max(280).optional(),
});

export const archiveEnvironmentResponseSchema = z.object({
  id: z.string(),
});

export const cloneEnvironmentInputSchema = z.object({
  environmentId: z.string().min(1),
  targetName: z.string().min(1),
  targetKind: z
    .enum(["local", "development", "test", "staging", "production", "preview", "custom"])
    .optional(),
});

export const cloneEnvironmentResponseSchema = z.object({
  id: z.string(),
});

export const renameEnvironmentInputSchema = z.object({
  environmentId: z.string().min(1),
  name: z.string().min(1),
});

export const renameEnvironmentResponseSchema = z.object({
  id: z.string(),
});

export const lockEnvironmentInputSchema = z.object({
  environmentId: z.string().min(1),
  reason: z.string().min(1).max(280).optional(),
});

export const lockEnvironmentResponseSchema = z.object({
  id: z.string(),
});

export const unlockEnvironmentInputSchema = z.object({
  environmentId: z.string().min(1),
});

export const unlockEnvironmentResponseSchema = z.object({
  id: z.string(),
});

export const setEnvironmentVariableInputSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  kind: z.enum(["plain-config", "secret", "provider-specific", "deployment-strategy"]),
  exposure: z.enum(["build-time", "runtime"]),
  scope: z
    .enum(["defaults", "system", "organization", "project", "environment", "deployment"])
    .optional(),
  isSecret: z.boolean().optional(),
});

export const promoteEnvironmentInputSchema = z.object({
  targetName: z.string().min(1),
  targetKind: z.enum([
    "local",
    "development",
    "test",
    "staging",
    "production",
    "preview",
    "custom",
  ]),
});

export const promoteEnvironmentResponseSchema = z.object({
  id: z.string(),
});

export const environmentEffectivePrecedenceResponseSchema = environmentEffectivePrecedenceSchema;

export const diffEnvironmentResponseSchema = z.array(
  z.object({
    key: z.string(),
    exposure: z.enum(["build-time", "runtime"]),
    left: environmentVariableSchema.optional(),
    right: environmentVariableSchema.optional(),
    change: z.enum(["added", "removed", "changed", "unchanged"]),
  }),
);

export const deploymentLogEntrySchema = z.object({
  timestamp: z.string(),
  source: z.enum(["appaloft", "application"]),
  phase: z.enum(["detect", "plan", "package", "deploy", "verify", "rollback"]),
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string(),
  masked: z.boolean().optional(),
});

export const deploymentProgressEventSchema = z.object({
  timestamp: z.string(),
  source: z.enum(["appaloft", "application"]),
  phase: z.enum(["detect", "plan", "package", "deploy", "verify", "rollback"]),
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string(),
  deploymentId: z.string().optional(),
  status: z.enum(["running", "succeeded", "failed"]).optional(),
  step: z.object({
    current: z.number(),
    total: z.number(),
    label: z.string(),
  }),
  stream: z.enum(["stdout", "stderr"]).optional(),
});

export const runtimePlanSchema = z.object({
  id: z.string(),
  source: z.object({
    kind: z.enum([
      "local-folder",
      "local-git",
      "remote-git",
      "git-public",
      "git-github-app",
      "git-deploy-key",
      "zip-artifact",
      "dockerfile-inline",
      "docker-compose-inline",
      "docker-image",
      "compose",
    ]),
    locator: z.string(),
    displayName: z.string(),
    integrationKey: z.string().optional(),
    inspection: z
      .object({
        runtimeFamily: z
          .enum([
            "custom",
            "dotnet",
            "elixir",
            "go",
            "java",
            "node",
            "php",
            "python",
            "ruby",
            "rust",
            "static",
          ])
          .optional(),
        framework: z
          .enum([
            "actix-web",
            "angular",
            "astro",
            "aspnet-core",
            "axum",
            "chi",
            "django",
            "echo",
            "express",
            "fastapi",
            "fastify",
            "fiber",
            "flask",
            "gin",
            "hono",
            "koa",
            "laravel",
            "micronaut",
            "nestjs",
            "nextjs",
            "nuxt",
            "phoenix",
            "quarkus",
            "rails",
            "remix",
            "rocket",
            "sinatra",
            "spring-boot",
            "sveltekit",
            "symfony",
            "vite",
          ])
          .optional(),
        packageManager: z
          .enum([
            "bun",
            "cargo",
            "composer",
            "dotnet",
            "go",
            "gradle",
            "maven",
            "mix",
            "npm",
            "pip",
            "pnpm",
            "poetry",
            "uv",
            "yarn",
          ])
          .optional(),
        applicationShape: z
          .enum([
            "static",
            "serverful-http",
            "ssr",
            "hybrid-static-server",
            "worker",
            "container-native",
          ])
          .optional(),
        runtimeVersion: z.string().optional(),
        projectName: z.string().optional(),
        detectedFiles: z
          .array(
            z.enum([
              "angular-json",
              "astro-config",
              "bun-lock",
              "cargo-toml",
              "composer-json",
              "compose-manifest",
              "csproj",
              "django-manage",
              "dockerfile",
              "git-directory",
              "go-mod",
              "gradle-build",
              "gradle-wrapper",
              "mix-exs",
              "maven-wrapper",
              "next-app-router",
              "next-config",
              "next-pages-router",
              "next-standalone-output",
              "next-static-output",
              "nuxt-config",
              "package-lock",
              "package-json",
              "pnpm-lock",
              "poetry-lock",
              "pom-xml",
              "pyproject-toml",
              "requirements-txt",
              "remix-config",
              "svelte-config",
              "uv-lock",
              "vite-config",
              "yarn-lock",
            ]),
          )
          .optional(),
        detectedScripts: z
          .array(
            z.enum([
              "build",
              "dev",
              "export",
              "generate",
              "preview",
              "serve",
              "start",
              "start-built",
            ]),
          )
          .optional(),
        dockerfilePath: z.string().optional(),
        composeFilePath: z.string().optional(),
        jarPath: z.string().optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  }),
  buildStrategy: z.enum([
    "dockerfile",
    "compose-deploy",
    "buildpack",
    "static-artifact",
    "prebuilt-image",
    "workspace-commands",
  ]),
  packagingMode: z.enum([
    "split-deploy",
    "all-in-one-docker",
    "compose-bundle",
    "host-process-runtime",
    "optional-future-binary",
  ]),
  runtimeArtifact: z
    .object({
      kind: z.enum(["image", "compose-project"]),
      intent: z.enum(["build-image", "prebuilt-image", "compose-project"]),
      image: z.string().optional(),
      composeFile: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  execution: z.object({
    kind: z.enum(["docker-container", "docker-compose-stack", "host-process"]),
    workingDirectory: z.string().optional(),
    installCommand: z.string().optional(),
    buildCommand: z.string().optional(),
    startCommand: z.string().optional(),
    healthCheckPath: z.string().optional(),
    healthCheck: requestedDeploymentHealthCheckSchema.optional(),
    port: z.number().int().positive().optional(),
    image: z.string().optional(),
    dockerfilePath: z.string().optional(),
    composeFile: z.string().optional(),
    accessRoutes: z
      .array(
        z.object({
          proxyKind: z.enum(["none", "traefik", "caddy"]),
          domains: z.array(z.string()),
          pathPrefix: z.string(),
          tlsMode: z.enum(["auto", "disabled"]),
          targetPort: z.number().int().positive().optional(),
        }),
      )
      .optional(),
    verificationSteps: z
      .array(
        z.object({
          kind: z.enum(["internal-http", "public-http"]),
          label: z.string(),
        }),
      )
      .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  }),
  target: z.object({
    kind: z.enum(["single-server", "future-multi-server", "future-k8s"]),
    providerKey: z.string(),
    serverIds: z.array(z.string()),
    metadata: z.record(z.string(), z.string()).optional(),
  }),
  detectSummary: z.string(),
  steps: z.array(z.string()),
  generatedAt: z.string(),
});

export const deploymentSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  resourceId: z.string(),
  serverId: z.string(),
  destinationId: z.string(),
  status: z.enum([
    "created",
    "planning",
    "planned",
    "running",
    "cancel-requested",
    "succeeded",
    "failed",
    "canceled",
    "rolled-back",
  ]),
  sourceCommitSha: z.string().optional(),
  runtimePlan: runtimePlanSchema,
  environmentSnapshot: z.object({
    id: z.string(),
    environmentId: z.string(),
    createdAt: z.string(),
    precedence: z.array(z.string()),
    variables: z.array(environmentVariableSchema),
  }),
  logs: z.array(deploymentLogEntrySchema),
  logCount: z.number(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  rollbackOfDeploymentId: z.string().optional(),
});

export const createDeploymentInputSchema = z
  .object({
    projectId: z.string().min(1),
    serverId: z.string().min(1),
    destinationId: z.string().optional(),
    environmentId: z.string().min(1),
    resourceId: z.string().min(1),
  })
  .strict();

export const createDeploymentResponseSchema = z.object({
  id: z.string(),
});

export const listDeploymentsResponseSchema = z.object({
  items: z.array(deploymentSummarySchema),
});

export const deploymentDetailSummarySchema = deploymentSummarySchema.omit({
  logs: true,
});

export const deploymentRelatedContextSchema = z.object({
  project: projectSummarySchema
    .pick({
      id: true,
      name: true,
      slug: true,
    })
    .partial({
      name: true,
      slug: true,
    }),
  environment: environmentSummarySchema
    .pick({
      id: true,
      name: true,
      kind: true,
    })
    .partial({
      name: true,
      kind: true,
    }),
  resource: resourceSummarySchema
    .pick({
      id: true,
      name: true,
      slug: true,
      kind: true,
    })
    .partial({
      name: true,
      slug: true,
      kind: true,
    }),
  server: serverSummarySchema
    .pick({
      id: true,
      name: true,
      host: true,
      port: true,
      providerKey: true,
    })
    .partial({
      name: true,
      host: true,
      port: true,
      providerKey: true,
    }),
  destination: z.object({
    id: z.string(),
  }),
});

export const deploymentDetailSectionErrorSchema = z.object({
  section: z.enum(["related-context", "timeline", "snapshot", "latest-failure"]),
  code: z.string(),
  category: z.string(),
  phase: z.string(),
  retriable: z.boolean(),
  relatedEntityId: z.string().optional(),
  relatedState: z.string().optional(),
});

export const deploymentAttemptStatusSummarySchema = z.object({
  current: deploymentSummarySchema.shape.status,
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  rollbackOfDeploymentId: z.string().optional(),
});

export const deploymentAttemptTimelineSchema = z.object({
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  logCount: z.number().int().nonnegative(),
});

export const deploymentAttemptSnapshotSchema = z.object({
  runtimePlan: runtimePlanSchema,
  environmentSnapshot: deploymentSummarySchema.shape.environmentSnapshot,
});

export const deploymentAttemptFailureSummarySchema = z.object({
  timestamp: z.string(),
  source: deploymentLogEntrySchema.shape.source,
  phase: deploymentLogEntrySchema.shape.phase,
  level: deploymentLogEntrySchema.shape.level,
  message: z.string(),
});

export const showDeploymentInputSchema = z.object({
  deploymentId: z.string().min(1),
  includeTimeline: z.boolean().optional(),
  includeSnapshot: z.boolean().optional(),
  includeRelatedContext: z.boolean().optional(),
  includeLatestFailure: z.boolean().optional(),
});

export const showDeploymentResponseSchema = z.object({
  schemaVersion: z.literal("deployments.show/v1"),
  deployment: deploymentDetailSummarySchema,
  status: deploymentAttemptStatusSummarySchema,
  relatedContext: deploymentRelatedContextSchema.optional(),
  snapshot: deploymentAttemptSnapshotSchema.optional(),
  timeline: deploymentAttemptTimelineSchema.optional(),
  latestFailure: deploymentAttemptFailureSummarySchema.optional(),
  nextActions: z.array(
    z.enum(["logs", "resource-detail", "resource-health", "diagnostic-summary"]),
  ),
  sectionErrors: z.array(deploymentDetailSectionErrorSchema),
  generatedAt: z.string(),
});

export const deploymentLogsResponseSchema = z.object({
  deploymentId: z.string(),
  logs: z.array(deploymentLogEntrySchema),
});

export const deploymentObservedEventSchema = z.object({
  deploymentId: z.string(),
  sequence: z.number().int().positive(),
  cursor: z.string(),
  emittedAt: z.string(),
  source: z.enum(["domain-event", "process-observation", "progress-projection"]),
  eventType: z.enum([
    "deployment-requested",
    "build-requested",
    "deployment-started",
    "deployment-succeeded",
    "deployment-failed",
    "deployment-progress",
  ]),
  phase: z.enum(["detect", "plan", "package", "deploy", "verify", "rollback"]).optional(),
  status: z.string().optional(),
  retriable: z.boolean().optional(),
  summary: z.string().optional(),
});

export const resourceRuntimeLogLineSchema = z.object({
  resourceId: z.string(),
  deploymentId: z.string().optional(),
  serviceName: z.string().optional(),
  runtimeKind: z.string().optional(),
  runtimeInstanceId: z.string().optional(),
  stream: z.enum(["stdout", "stderr", "unknown"]).optional(),
  timestamp: z.string().optional(),
  sequence: z.number().optional(),
  cursor: z.string().optional(),
  message: z.string(),
  masked: z.boolean(),
});

export const domainErrorDetailValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()).readonly(),
]);

export const domainErrorResponseSchema = z.object({
  code: z.string(),
  category: z.enum(["user", "infra", "provider", "retryable", "timeout"]),
  message: z.string(),
  retryable: z.boolean(),
  details: z.record(z.string(), domainErrorDetailValueSchema).optional(),
});

export const deploymentEventStreamGapSchema = z.object({
  code: z.string(),
  phase: z.enum(["event-replay", "live-follow"]),
  retriable: z.boolean(),
  cursor: z.string().optional(),
  lastSequence: z.number().int().positive().optional(),
  recommendedAction: z.enum(["restart-stream", "open-deployment-detail"]).optional(),
});

export const deploymentEventStreamEnvelopeSchema = z.discriminatedUnion("kind", [
  z.object({
    schemaVersion: z.literal("deployments.stream-events/v1"),
    kind: z.literal("event"),
    event: deploymentObservedEventSchema,
  }),
  z.object({
    schemaVersion: z.literal("deployments.stream-events/v1"),
    kind: z.literal("heartbeat"),
    at: z.string(),
    cursor: z.string().optional(),
  }),
  z.object({
    schemaVersion: z.literal("deployments.stream-events/v1"),
    kind: z.literal("gap"),
    gap: deploymentEventStreamGapSchema,
  }),
  z.object({
    schemaVersion: z.literal("deployments.stream-events/v1"),
    kind: z.literal("closed"),
    reason: z.enum(["completed", "cancelled", "source-ended", "idle-timeout"]),
    cursor: z.string().optional(),
  }),
  z.object({
    schemaVersion: z.literal("deployments.stream-events/v1"),
    kind: z.literal("error"),
    error: domainErrorResponseSchema,
  }),
]);

export const resourceRuntimeLogEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("line"),
    line: resourceRuntimeLogLineSchema,
  }),
  z.object({
    kind: z.literal("heartbeat"),
    at: z.string(),
  }),
  z.object({
    kind: z.literal("closed"),
    reason: z.enum(["completed", "cancelled", "source-ended"]),
  }),
  z.object({
    kind: z.literal("error"),
    error: domainErrorResponseSchema,
  }),
]);

export const resourceRuntimeLogsResponseSchema = z.object({
  resourceId: z.string(),
  deploymentId: z.string().optional(),
  logs: z.array(resourceRuntimeLogLineSchema),
});

export const deploymentEventStreamResponseSchema = z.object({
  deploymentId: z.string(),
  envelopes: z.array(deploymentEventStreamEnvelopeSchema),
});

export const deploymentEventStreamStreamResponseSchema = z.object({
  deploymentId: z.string(),
});

export const resourceRuntimeLogsStreamResponseSchema = z.object({
  resourceId: z.string(),
  deploymentId: z.string().optional(),
});

export const terminalSessionDescriptorSchema = z.object({
  sessionId: z.string(),
  scope: z.enum(["server", "resource"]),
  serverId: z.string(),
  resourceId: z.string().optional(),
  deploymentId: z.string().optional(),
  transport: z.object({
    kind: z.literal("websocket"),
    path: z.string(),
  }),
  providerKey: z.string(),
  workingDirectory: z.string().optional(),
  createdAt: z.string(),
});

export const terminalSessionFrameSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ready"),
    sessionId: z.string(),
    workingDirectory: z.string().optional(),
  }),
  z.object({
    kind: z.literal("output"),
    stream: z.enum(["stdout", "stderr"]),
    data: z.string(),
  }),
  z.object({
    kind: z.literal("closed"),
    reason: z.enum(["completed", "cancelled", "source-ended"]),
    exitCode: z.number().optional(),
  }),
  z.object({
    kind: z.literal("error"),
    error: domainErrorResponseSchema,
  }),
]);

export const resourceDiagnosticSectionStatusSchema = z.enum([
  "available",
  "empty",
  "not-configured",
  "not-requested",
  "unavailable",
  "failed",
  "unknown",
]);

export const resourceDiagnosticSourceErrorSchema = z.object({
  source: z.enum([
    "deployment",
    "access",
    "proxy",
    "deployment-logs",
    "runtime-logs",
    "system",
    "copy",
  ]),
  code: z.string(),
  category: z.string(),
  phase: z.string(),
  retryable: z.boolean(),
  relatedEntityId: z.string().optional(),
  relatedState: z.string().optional(),
  message: z.string().optional(),
});

export const resourceDiagnosticFocusSchema = z.object({
  resourceId: z.string(),
  requestedDeploymentId: z.string().optional(),
  deploymentId: z.string().optional(),
});

export const resourceDiagnosticContextSchema = z.object({
  projectId: z.string(),
  environmentId: z.string(),
  resourceName: z.string(),
  resourceSlug: z.string(),
  resourceKind: z.enum([
    "application",
    "service",
    "database",
    "cache",
    "compose-stack",
    "worker",
    "static-site",
    "external",
  ]),
  destinationId: z.string().optional(),
  serverId: z.string().optional(),
  runtimeStrategy: z.enum(["docker-container", "docker-compose-stack", "host-process"]).optional(),
  buildStrategy: z
    .enum([
      "dockerfile",
      "compose-deploy",
      "buildpack",
      "static-artifact",
      "prebuilt-image",
      "workspace-commands",
    ])
    .optional(),
  packagingMode: z
    .enum([
      "split-deploy",
      "all-in-one-docker",
      "compose-bundle",
      "host-process-runtime",
      "optional-future-binary",
    ])
    .optional(),
  targetKind: z.enum(["single-server", "future-multi-server", "future-k8s"]).optional(),
  targetProviderKey: z.string().optional(),
  services: z.array(resourceServiceSummarySchema),
  networkProfile: resourceNetworkProfileSchema.optional(),
});

export const resourceDiagnosticDeploymentSchema = z.object({
  id: z.string(),
  status: z.enum([
    "created",
    "planning",
    "planned",
    "running",
    "cancel-requested",
    "succeeded",
    "failed",
    "canceled",
    "rolled-back",
  ]),
  lifecyclePhase: z.enum([
    "created",
    "planning",
    "planned",
    "running",
    "cancel-requested",
    "succeeded",
    "failed",
    "canceled",
    "rolled-back",
  ]),
  runtimePlanId: z.string(),
  sourceKind: z.enum([
    "local-folder",
    "local-git",
    "remote-git",
    "git-public",
    "git-github-app",
    "git-deploy-key",
    "zip-artifact",
    "dockerfile-inline",
    "docker-compose-inline",
    "docker-image",
    "compose",
  ]),
  sourceDisplayName: z.string(),
  serverId: z.string(),
  destinationId: z.string(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  logCount: z.number(),
  lastError: z
    .object({
      timestamp: z.string(),
      phase: z.enum(["detect", "plan", "package", "deploy", "verify", "rollback"]),
      message: z.string(),
    })
    .optional(),
});

export const resourceDiagnosticAccessSchema = z.object({
  status: resourceDiagnosticSectionStatusSchema,
  generatedUrl: z.string().optional(),
  durableUrl: z.string().optional(),
  serverAppliedUrl: z.string().optional(),
  plannedUrl: z.string().optional(),
  proxyRouteStatus: z.enum(["unknown", "ready", "not-ready", "failed"]).optional(),
  lastRouteRealizationDeploymentId: z.string().optional(),
  reasonCode: z.string().optional(),
  phase: z.string().optional(),
});

export const resourceDiagnosticProxySchema = z.object({
  status: resourceDiagnosticSectionStatusSchema,
  providerKey: z.string().optional(),
  proxyRouteStatus: z.enum(["unknown", "ready", "not-ready", "failed"]).optional(),
  configurationIncluded: z.boolean(),
  configurationStatus: z
    .enum(["not-configured", "planned", "applied", "stale", "failed"])
    .optional(),
  configurationGeneratedAt: z.string().optional(),
  routeCount: z.number().optional(),
  sectionCount: z.number().optional(),
  sections: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        format: z.enum(["docker-labels", "file", "command", "yaml", "json", "text"]),
        redacted: z.boolean(),
        source: z.enum(["provider-rendered", "snapshot", "diagnostic"]),
      }),
    )
    .optional(),
  tlsRoutes: z
    .array(
      proxyConfigurationTlsDiagnosticSchema.omit({
        details: true,
      }),
    )
    .optional(),
  warnings: z.array(proxyConfigurationWarningSchema).optional(),
  reasonCode: z.string().optional(),
  phase: z.string().optional(),
});

export const resourceDiagnosticLogLineSchema = z.object({
  timestamp: z.string().optional(),
  source: z.enum(["appaloft", "application"]).optional(),
  phase: z.enum(["detect", "plan", "package", "deploy", "verify", "rollback"]).optional(),
  level: z.enum(["debug", "info", "warn", "error"]).optional(),
  stream: z.enum(["stdout", "stderr", "unknown"]).optional(),
  serviceName: z.string().optional(),
  message: z.string(),
  masked: z.boolean(),
});

export const resourceDiagnosticLogSectionSchema = z.object({
  status: resourceDiagnosticSectionStatusSchema,
  tailLimit: z.number(),
  lineCount: z.number(),
  lines: z.array(resourceDiagnosticLogLineSchema),
  reasonCode: z.string().optional(),
  phase: z.string().optional(),
});

export const resourceDiagnosticSystemSchema = z.object({
  entrypoint: z.enum(["cli", "http", "rpc", "system"]),
  requestId: z.string(),
  locale: z.string(),
  readinessStatus: z.enum(["ready", "degraded"]).optional(),
  databaseDriver: z.string().optional(),
  databaseMode: z.string().optional(),
});

export const resourceDiagnosticRedactionSchema = z.object({
  policy: z.literal("deployment-environment-secrets"),
  masked: z.boolean(),
  maskedValueCount: z.number(),
});

export const resourceDiagnosticCopyPayloadSchema = z.object({
  json: z.string(),
  markdown: z.string().optional(),
  plainText: z.string().optional(),
});

export const resourceDiagnosticSummarySchema = z.object({
  schemaVersion: z.literal("resources.diagnostic-summary/v1"),
  generatedAt: z.string(),
  focus: resourceDiagnosticFocusSchema,
  context: resourceDiagnosticContextSchema,
  deployment: resourceDiagnosticDeploymentSchema.optional(),
  access: resourceDiagnosticAccessSchema,
  proxy: resourceDiagnosticProxySchema,
  deploymentLogs: resourceDiagnosticLogSectionSchema,
  runtimeLogs: resourceDiagnosticLogSectionSchema,
  system: resourceDiagnosticSystemSchema,
  sourceErrors: z.array(resourceDiagnosticSourceErrorSchema),
  redaction: resourceDiagnosticRedactionSchema,
  copy: resourceDiagnosticCopyPayloadSchema,
});

export const providerDescriptorSchema = z.object({
  key: z.string(),
  title: z.string(),
  category: z.enum(["cloud-provider", "deploy-target", "infra-service"]),
  capabilities: z.array(z.string()),
});

export const listProvidersResponseSchema = z.object({
  items: z.array(providerDescriptorSchema),
});

export const listPluginsResponseSchema = z.object({
  items: z.array(pluginSummarySchema),
});

export const githubRepositorySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  fullName: z.string(),
  ownerLogin: z.string(),
  description: z.string().optional(),
  private: z.boolean(),
  defaultBranch: z.string(),
  htmlUrl: z.string(),
  cloneUrl: z.string(),
  updatedAt: z.string(),
});

export const listGitHubRepositoriesInputSchema = z.object({
  search: z.string().optional(),
});

export const listGitHubRepositoriesResponseSchema = z.object({
  items: z.array(githubRepositorySummarySchema),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
export type VersionResponse = z.infer<typeof versionResponseSchema>;
export type AuthProviderStatus = z.infer<typeof authProviderStatusSchema>;
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
export type GitHubRepositorySummary = z.infer<typeof githubRepositorySummarySchema>;
export type PluginSummary = z.infer<typeof pluginSummarySchema>;
export type SystemPluginWebExtension = z.infer<typeof systemPluginWebExtensionSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type ShowProjectInput = z.infer<typeof showProjectInputSchema>;
export type RenameProjectInput = z.infer<typeof renameProjectInputSchema>;
export type ArchiveProjectInput = z.infer<typeof archiveProjectInputSchema>;
export type CreateProjectResponse = z.infer<typeof createProjectResponseSchema>;
export type ListProjectsResponse = z.infer<typeof listProjectsResponseSchema>;
export type ShowProjectResponse = z.infer<typeof showProjectResponseSchema>;
export type RenameProjectResponse = z.infer<typeof renameProjectResponseSchema>;
export type ArchiveProjectResponse = z.infer<typeof archiveProjectResponseSchema>;
export type ServerSummary = z.infer<typeof serverSummarySchema>;
export type SshCredentialSummary = z.infer<typeof sshCredentialSummarySchema>;
export type SshCredentialUsageServer = z.infer<typeof sshCredentialUsageServerSchema>;
export type SshCredentialUsageSummary = z.infer<typeof sshCredentialUsageSummarySchema>;
export type SshCredentialDetail = z.infer<typeof sshCredentialDetailSchema>;
export type RegisterServerInput = z.infer<typeof registerServerInputSchema>;
export type ShowServerInput = z.infer<typeof showServerInputSchema>;
export type RenameServerInput = z.infer<typeof renameServerInputSchema>;
export type ConfigureServerEdgeProxyInput = z.infer<typeof configureServerEdgeProxyInputSchema>;
export type DeactivateServerInput = z.infer<typeof deactivateServerInputSchema>;
export type DeleteServerInput = z.infer<typeof deleteServerInputSchema>;
export type CheckServerDeleteSafetyInput = z.infer<typeof checkServerDeleteSafetyInputSchema>;
export type ConfigureServerCredentialInput = z.infer<typeof configureServerCredentialInputSchema>;
export type CreateSshCredentialInput = z.infer<typeof createSshCredentialInputSchema>;
export type DeleteSshCredentialInput = z.infer<typeof deleteSshCredentialInputSchema>;
export type RotateSshCredentialInput = z.infer<typeof rotateSshCredentialInputSchema>;
export type RegisterServerResponse = z.infer<typeof registerServerResponseSchema>;
export type ListServersResponse = z.infer<typeof listServersResponseSchema>;
export type ServerDetail = z.infer<typeof serverDetailSchema>;
export type ShowServerResponse = z.infer<typeof showServerResponseSchema>;
export type RenameServerResponse = z.infer<typeof renameServerResponseSchema>;
export type ConfigureServerEdgeProxyResponse = z.infer<
  typeof configureServerEdgeProxyResponseSchema
>;
export type DeactivateServerResponse = z.infer<typeof deactivateServerResponseSchema>;
export type DeleteServerResponse = z.infer<typeof deleteServerResponseSchema>;
export type ServerDeleteBlocker = z.infer<typeof serverDeleteBlockerSchema>;
export type ServerDeleteSafety = z.infer<typeof serverDeleteSafetySchema>;
export type CheckServerDeleteSafetyResponse = z.infer<typeof checkServerDeleteSafetyResponseSchema>;
export type CreateSshCredentialResponse = z.infer<typeof createSshCredentialResponseSchema>;
export type DeleteSshCredentialResponse = z.infer<typeof deleteSshCredentialResponseSchema>;
export type RotateSshCredentialResponse = z.infer<typeof rotateSshCredentialResponseSchema>;
export type ListSshCredentialsResponse = z.infer<typeof listSshCredentialsResponseSchema>;
export type ShowSshCredentialResponse = z.infer<typeof showSshCredentialResponseSchema>;
export type ServerConnectivityCheck = z.infer<typeof serverConnectivityCheckSchema>;
export type TestServerConnectivityResponse = z.infer<typeof testServerConnectivityResponseSchema>;
export type BootstrapServerProxyResponse = z.infer<typeof bootstrapServerProxyResponseSchema>;
export type EnvironmentSummary = z.infer<typeof environmentSummarySchema>;
export type EnvironmentEffectivePrecedence = z.infer<typeof environmentEffectivePrecedenceSchema>;
export type ResourceAccessRouteSummary = z.infer<typeof resourceAccessRouteSummarySchema>;
export type PlannedResourceAccessRouteSummary = z.infer<
  typeof plannedResourceAccessRouteSummarySchema
>;
export type ResourceAccessSummary = z.infer<typeof resourceAccessSummarySchema>;
export type ResourceAccessProfile = z.infer<typeof resourceAccessProfileSchema>;
export type ResourceHealthOverall = z.infer<typeof resourceHealthOverallSchema>;
export type ResourceHealthSummary = z.infer<typeof resourceHealthSummarySchema>;
export type ResourceSummary = z.infer<typeof resourceSummarySchema>;
export type ResourceDetail = z.infer<typeof resourceDetailSchema>;
export type ResourceConfigEntry = z.infer<typeof resourceConfigEntrySchema>;
export type ResourceEffectiveConfig = z.infer<typeof resourceEffectiveConfigSchema>;
export type ShowResourceInput = z.infer<typeof showResourceInputSchema>;
export type ShowResourceResponse = z.infer<typeof showResourceResponseSchema>;
export type ResourceSourceBindingInput = z.infer<typeof resourceSourceBindingInputSchema>;
export type ResourceRuntimeProfileInput = z.infer<typeof resourceRuntimeProfileInputSchema>;
export type CreateResourceInput = z.infer<typeof createResourceInputSchema>;
export type CreateResourceResponse = z.infer<typeof createResourceResponseSchema>;
export type ArchiveResourceInput = z.infer<typeof archiveResourceInputSchema>;
export type ArchiveResourceResponse = z.infer<typeof archiveResourceResponseSchema>;
export type DeleteResourceInput = z.infer<typeof deleteResourceInputSchema>;
export type DeleteResourceResponse = z.infer<typeof deleteResourceResponseSchema>;
export type ConfigureResourceHealthInput = z.infer<typeof configureResourceHealthInputSchema>;
export type ConfigureResourceHealthResponse = z.infer<typeof configureResourceHealthResponseSchema>;
export type ConfigureResourceNetworkInput = z.infer<typeof configureResourceNetworkInputSchema>;
export type ConfigureResourceNetworkResponse = z.infer<
  typeof configureResourceNetworkResponseSchema
>;
export type ConfigureResourceAccessInput = z.infer<typeof configureResourceAccessInputSchema>;
export type ConfigureResourceAccessResponse = z.infer<typeof configureResourceAccessResponseSchema>;
export type ConfigureResourceRuntimeInput = z.infer<typeof configureResourceRuntimeInputSchema>;
export type ConfigureResourceRuntimeResponse = z.infer<
  typeof configureResourceRuntimeResponseSchema
>;
export type ConfigureResourceSourceInput = z.infer<typeof configureResourceSourceInputSchema>;
export type ConfigureResourceSourceResponse = z.infer<typeof configureResourceSourceResponseSchema>;
export type SetResourceVariableInput = z.infer<typeof setResourceVariableInputSchema>;
export type SetResourceVariableResponse = z.infer<typeof setResourceVariableResponseSchema>;
export type UnsetResourceVariableInput = z.infer<typeof unsetResourceVariableInputSchema>;
export type UnsetResourceVariableResponse = z.infer<typeof unsetResourceVariableResponseSchema>;
export type ResourceEffectiveConfigResponse = z.infer<typeof resourceEffectiveConfigResponseSchema>;
export type ConfigureDefaultAccessDomainPolicyInput = z.infer<
  typeof configureDefaultAccessDomainPolicyInputSchema
>;
export type ConfigureDefaultAccessDomainPolicyResponse = z.infer<
  typeof configureDefaultAccessDomainPolicyResponseSchema
>;
export type DefaultAccessDomainPolicyRead = z.infer<typeof defaultAccessDomainPolicyReadSchema>;
export type ListDefaultAccessDomainPoliciesInput = z.infer<
  typeof listDefaultAccessDomainPoliciesInputSchema
>;
export type ListDefaultAccessDomainPoliciesResponse = z.infer<
  typeof listDefaultAccessDomainPoliciesResponseSchema
>;
export type ShowDefaultAccessDomainPolicyInput = z.infer<
  typeof showDefaultAccessDomainPolicyInputSchema
>;
export type ShowDefaultAccessDomainPolicyResponse = z.infer<
  typeof showDefaultAccessDomainPolicyResponseSchema
>;
export type CreateEnvironmentInput = z.infer<typeof createEnvironmentInputSchema>;
export type CreateEnvironmentResponse = z.infer<typeof createEnvironmentResponseSchema>;
export type ListEnvironmentsResponse = z.infer<typeof listEnvironmentsResponseSchema>;
export type ArchiveEnvironmentInput = z.infer<typeof archiveEnvironmentInputSchema>;
export type ArchiveEnvironmentResponse = z.infer<typeof archiveEnvironmentResponseSchema>;
export type CloneEnvironmentInput = z.infer<typeof cloneEnvironmentInputSchema>;
export type CloneEnvironmentResponse = z.infer<typeof cloneEnvironmentResponseSchema>;
export type RenameEnvironmentInput = z.infer<typeof renameEnvironmentInputSchema>;
export type RenameEnvironmentResponse = z.infer<typeof renameEnvironmentResponseSchema>;
export type LockEnvironmentInput = z.infer<typeof lockEnvironmentInputSchema>;
export type LockEnvironmentResponse = z.infer<typeof lockEnvironmentResponseSchema>;
export type UnlockEnvironmentInput = z.infer<typeof unlockEnvironmentInputSchema>;
export type UnlockEnvironmentResponse = z.infer<typeof unlockEnvironmentResponseSchema>;
export type ListResourcesResponse = z.infer<typeof listResourcesResponseSchema>;
export type DomainBindingSummary = z.infer<typeof domainBindingSummarySchema>;
export type CreateDomainBindingInput = z.infer<typeof createDomainBindingInputSchema>;
export type CreateDomainBindingResponse = z.infer<typeof createDomainBindingResponseSchema>;
export type ConfirmDomainBindingOwnershipInput = z.infer<
  typeof confirmDomainBindingOwnershipInputSchema
>;
export type ConfirmDomainBindingOwnershipResponse = z.infer<
  typeof confirmDomainBindingOwnershipResponseSchema
>;
export type ListDomainBindingsResponse = z.infer<typeof listDomainBindingsResponseSchema>;
export type IssueOrRenewCertificateInput = z.infer<typeof issueOrRenewCertificateInputSchema>;
export type IssueOrRenewCertificateResponse = z.infer<typeof issueOrRenewCertificateResponseSchema>;
export type ImportCertificateInput = z.infer<typeof importCertificateInputSchema>;
export type ImportCertificateResponse = z.infer<typeof importCertificateResponseSchema>;
export type CertificateAttemptSummary = z.infer<typeof certificateAttemptSummarySchema>;
export type CertificateSummary = z.infer<typeof certificateSummarySchema>;
export type ListCertificatesResponse = z.infer<typeof listCertificatesResponseSchema>;
export type SetEnvironmentVariableInput = z.infer<typeof setEnvironmentVariableInputSchema>;
export type PromoteEnvironmentInput = z.infer<typeof promoteEnvironmentInputSchema>;
export type PromoteEnvironmentResponse = z.infer<typeof promoteEnvironmentResponseSchema>;
export type EnvironmentEffectivePrecedenceResponse = z.infer<
  typeof environmentEffectivePrecedenceResponseSchema
>;
export type DiffEnvironmentResponse = z.infer<typeof diffEnvironmentResponseSchema>;
export type DeploymentSummary = z.infer<typeof deploymentSummarySchema>;
export type DeploymentProgressEvent = z.infer<typeof deploymentProgressEventSchema>;
export type DeploymentResourceInput = z.infer<typeof deploymentResourceInputSchema>;
export type CreateDeploymentInput = z.infer<typeof createDeploymentInputSchema>;
export type CreateDeploymentResponse = z.infer<typeof createDeploymentResponseSchema>;
export type ListDeploymentsResponse = z.infer<typeof listDeploymentsResponseSchema>;
export type DeploymentDetailSummary = z.infer<typeof deploymentDetailSummarySchema>;
export type DeploymentRelatedContext = z.infer<typeof deploymentRelatedContextSchema>;
export type DeploymentDetailSectionError = z.infer<typeof deploymentDetailSectionErrorSchema>;
export type DeploymentAttemptStatusSummary = z.infer<typeof deploymentAttemptStatusSummarySchema>;
export type DeploymentAttemptTimeline = z.infer<typeof deploymentAttemptTimelineSchema>;
export type DeploymentAttemptSnapshot = z.infer<typeof deploymentAttemptSnapshotSchema>;
export type DeploymentAttemptFailureSummary = z.infer<typeof deploymentAttemptFailureSummarySchema>;
export type ShowDeploymentInput = z.infer<typeof showDeploymentInputSchema>;
export type ShowDeploymentResponse = z.infer<typeof showDeploymentResponseSchema>;
export type DeploymentLogsResponse = z.infer<typeof deploymentLogsResponseSchema>;
export type DeploymentObservedEvent = z.infer<typeof deploymentObservedEventSchema>;
export type DeploymentEventStreamGap = z.infer<typeof deploymentEventStreamGapSchema>;
export type DeploymentEventStreamEnvelope = z.infer<typeof deploymentEventStreamEnvelopeSchema>;
export type DeploymentEventStreamResponse = z.infer<typeof deploymentEventStreamResponseSchema>;
export type DeploymentEventStreamStreamResponse = z.infer<
  typeof deploymentEventStreamStreamResponseSchema
>;
export type ResourceRuntimeLogLine = z.infer<typeof resourceRuntimeLogLineSchema>;
export type ResourceRuntimeLogEvent = z.infer<typeof resourceRuntimeLogEventSchema>;
export type ResourceRuntimeLogsResponse = z.infer<typeof resourceRuntimeLogsResponseSchema>;
export type ResourceRuntimeLogsStreamResponse = z.infer<
  typeof resourceRuntimeLogsStreamResponseSchema
>;
export type TerminalSessionDescriptor = z.infer<typeof terminalSessionDescriptorSchema>;
export type TerminalSessionFrame = z.infer<typeof terminalSessionFrameSchema>;
export type ResourceDiagnosticSummary = z.infer<typeof resourceDiagnosticSummarySchema>;
export type ProxyConfigurationView = z.infer<typeof proxyConfigurationViewSchema>;
export type ListProvidersResponse = z.infer<typeof listProvidersResponseSchema>;
export type ListPluginsResponse = z.infer<typeof listPluginsResponseSchema>;
export type ListGitHubRepositoriesInput = z.infer<typeof listGitHubRepositoriesInputSchema>;
export type ListGitHubRepositoriesResponse = z.infer<typeof listGitHubRepositoriesResponseSchema>;

export const deploymentSourceCommitShaMetadataKey = "source.commitSha";

type DeploymentCommitMetadataInput = {
  sourceCommitSha?: string;
  runtimePlan: {
    source: {
      metadata?: Record<string, string>;
    };
    execution: {
      metadata?: Record<string, string>;
    };
  };
};

export function sourceCommitShaForDeployment(
  deployment: DeploymentCommitMetadataInput,
): string | undefined {
  const executionMetadata = deployment.runtimePlan.execution.metadata ?? {};
  const sourceMetadata = deployment.runtimePlan.source.metadata ?? {};

  return (
    deployment.sourceCommitSha ??
    executionMetadata[deploymentSourceCommitShaMetadataKey] ??
    executionMetadata.commitSha ??
    sourceMetadata[deploymentSourceCommitShaMetadataKey] ??
    sourceMetadata.commitSha
  );
}

export function shortDeploymentSourceCommitSha(commitSha: string): string {
  return commitSha.slice(0, 12);
}
