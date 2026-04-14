import { z } from "zod";

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
  createdAt: z.string(),
});

export const createProjectInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const createProjectResponseSchema = z.object({
  id: z.string(),
});

export const listProjectsResponseSchema = z.object({
  items: z.array(projectSummarySchema),
});

export const serverSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  providerKey: z.string(),
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

export const listSshCredentialsResponseSchema = z.object({
  items: z.array(sshCredentialSummarySchema),
});

export const registerServerResponseSchema = z.object({
  id: z.string(),
});

export const listServersResponseSchema = z.object({
  items: z.array(serverSummarySchema),
});

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

export const deploymentHealthCheckSchema = z.object({
  name: z.string(),
  status: z.enum(["passed", "failed", "skipped"]),
  message: z.string(),
  durationMs: z.number(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const checkDeploymentHealthResponseSchema = z.object({
  deploymentId: z.string(),
  checkedAt: z.string(),
  status: z.enum(["healthy", "degraded", "unreachable"]),
  checks: z.array(deploymentHealthCheckSchema),
});

export const environmentVariableSchema = z.object({
  key: z.string(),
  value: z.string(),
  scope: z.string(),
  exposure: z.enum(["build-time", "runtime"]),
  isSecret: z.boolean(),
  kind: z.string(),
});

export const environmentSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  kind: z.enum(["local", "development", "test", "staging", "production", "preview", "custom"]),
  parentEnvironmentId: z.string().optional(),
  createdAt: z.string(),
  maskedVariables: z.array(environmentVariableSchema),
});

export const resourceServiceSummarySchema = z.object({
  name: z.string(),
  kind: z.enum(["web", "api", "worker", "database", "cache", "service"]),
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
  deploymentCount: z.number(),
  lastDeploymentId: z.string().optional(),
  lastDeploymentStatus: z
    .enum([
      "created",
      "planning",
      "planned",
      "running",
      "succeeded",
      "failed",
      "canceled",
      "rolled-back",
    ])
    .optional(),
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
  source: z
    .object({
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
      metadata: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  runtimeProfile: z
    .object({
      strategy: z
        .enum(["auto", "dockerfile", "docker-compose", "prebuilt-image", "workspace-commands"])
        .default("auto"),
      installCommand: z.string().min(1).optional(),
      buildCommand: z.string().min(1).optional(),
      startCommand: z.string().min(1).optional(),
      port: z.number().int().positive().optional(),
      healthCheckPath: z.string().min(1).optional(),
    })
    .optional(),
});

export const createResourceResponseSchema = z.object({
  id: z.string(),
});

export const listResourcesResponseSchema = z.object({
  items: z.array(resourceSummarySchema),
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
  certificatePolicy: z.enum(["auto", "manual", "disabled"]).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export const createDomainBindingResponseSchema = z.object({
  id: z.string(),
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
  verificationAttemptCount: z.number(),
  createdAt: z.string(),
});

export const listDomainBindingsResponseSchema = z.object({
  items: z.array(domainBindingSummarySchema),
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
  source: z.enum(["yundu", "application"]),
  phase: z.enum(["detect", "plan", "package", "deploy", "verify", "rollback"]),
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string(),
  masked: z.boolean().optional(),
});

export const deploymentProgressEventSchema = z.object({
  timestamp: z.string(),
  source: z.enum(["yundu", "application"]),
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
  execution: z.object({
    kind: z.enum(["docker-container", "docker-compose-stack", "host-process"]),
    workingDirectory: z.string().optional(),
    installCommand: z.string().optional(),
    buildCommand: z.string().optional(),
    startCommand: z.string().optional(),
    healthCheckPath: z.string().optional(),
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
    "succeeded",
    "failed",
    "canceled",
    "rolled-back",
  ]),
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

export const cancelDeploymentInputSchema = z.object({
  deploymentId: z.string().min(1),
  reason: z.string().min(1).optional(),
});

export const cancelDeploymentResponseSchema = z.object({
  id: z.string(),
  status: z.literal("canceled"),
});

export const redeployResourceInputSchema = z.object({
  resourceId: z.string().min(1),
  force: z.boolean().optional(),
});

export const redeployResourceResponseSchema = z.object({
  id: z.string(),
});

export const reattachDeploymentInputSchema = z.object({
  deploymentId: z.string().min(1),
});

export const reattachDeploymentResponseSchema = z.object({
  id: z.string(),
  status: z.enum([
    "created",
    "planning",
    "planned",
    "running",
    "succeeded",
    "failed",
    "canceled",
    "rolled-back",
  ]),
  logs: z.array(deploymentLogEntrySchema),
});

export const rollbackDeploymentResponseSchema = z.object({
  id: z.string(),
});

export const listDeploymentsResponseSchema = z.object({
  items: z.array(deploymentSummarySchema),
});

export const deploymentLogsResponseSchema = z.object({
  deploymentId: z.string(),
  logs: z.array(deploymentLogEntrySchema),
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
export type CreateProjectResponse = z.infer<typeof createProjectResponseSchema>;
export type ListProjectsResponse = z.infer<typeof listProjectsResponseSchema>;
export type ServerSummary = z.infer<typeof serverSummarySchema>;
export type SshCredentialSummary = z.infer<typeof sshCredentialSummarySchema>;
export type RegisterServerInput = z.infer<typeof registerServerInputSchema>;
export type ConfigureServerCredentialInput = z.infer<typeof configureServerCredentialInputSchema>;
export type CreateSshCredentialInput = z.infer<typeof createSshCredentialInputSchema>;
export type RegisterServerResponse = z.infer<typeof registerServerResponseSchema>;
export type ListServersResponse = z.infer<typeof listServersResponseSchema>;
export type CreateSshCredentialResponse = z.infer<typeof createSshCredentialResponseSchema>;
export type ListSshCredentialsResponse = z.infer<typeof listSshCredentialsResponseSchema>;
export type ServerConnectivityCheck = z.infer<typeof serverConnectivityCheckSchema>;
export type TestServerConnectivityResponse = z.infer<typeof testServerConnectivityResponseSchema>;
export type CheckDeploymentHealthResponse = z.infer<typeof checkDeploymentHealthResponseSchema>;
export type EnvironmentSummary = z.infer<typeof environmentSummarySchema>;
export type ResourceSummary = z.infer<typeof resourceSummarySchema>;
export type CreateResourceInput = z.infer<typeof createResourceInputSchema>;
export type CreateResourceResponse = z.infer<typeof createResourceResponseSchema>;
export type CreateEnvironmentInput = z.infer<typeof createEnvironmentInputSchema>;
export type CreateEnvironmentResponse = z.infer<typeof createEnvironmentResponseSchema>;
export type ListEnvironmentsResponse = z.infer<typeof listEnvironmentsResponseSchema>;
export type ListResourcesResponse = z.infer<typeof listResourcesResponseSchema>;
export type DomainBindingSummary = z.infer<typeof domainBindingSummarySchema>;
export type CreateDomainBindingInput = z.infer<typeof createDomainBindingInputSchema>;
export type CreateDomainBindingResponse = z.infer<typeof createDomainBindingResponseSchema>;
export type ListDomainBindingsResponse = z.infer<typeof listDomainBindingsResponseSchema>;
export type SetEnvironmentVariableInput = z.infer<typeof setEnvironmentVariableInputSchema>;
export type PromoteEnvironmentInput = z.infer<typeof promoteEnvironmentInputSchema>;
export type PromoteEnvironmentResponse = z.infer<typeof promoteEnvironmentResponseSchema>;
export type DiffEnvironmentResponse = z.infer<typeof diffEnvironmentResponseSchema>;
export type DeploymentSummary = z.infer<typeof deploymentSummarySchema>;
export type DeploymentProgressEvent = z.infer<typeof deploymentProgressEventSchema>;
export type DeploymentResourceInput = z.infer<typeof deploymentResourceInputSchema>;
export type CreateDeploymentInput = z.infer<typeof createDeploymentInputSchema>;
export type CreateDeploymentResponse = z.infer<typeof createDeploymentResponseSchema>;
export type CancelDeploymentInput = z.infer<typeof cancelDeploymentInputSchema>;
export type CancelDeploymentResponse = z.infer<typeof cancelDeploymentResponseSchema>;
export type RedeployResourceInput = z.infer<typeof redeployResourceInputSchema>;
export type RedeployResourceResponse = z.infer<typeof redeployResourceResponseSchema>;
export type ReattachDeploymentInput = z.infer<typeof reattachDeploymentInputSchema>;
export type ReattachDeploymentResponse = z.infer<typeof reattachDeploymentResponseSchema>;
export type RollbackDeploymentResponse = z.infer<typeof rollbackDeploymentResponseSchema>;
export type ListDeploymentsResponse = z.infer<typeof listDeploymentsResponseSchema>;
export type DeploymentLogsResponse = z.infer<typeof deploymentLogsResponseSchema>;
export type ListProvidersResponse = z.infer<typeof listProvidersResponseSchema>;
export type ListPluginsResponse = z.infer<typeof listPluginsResponseSchema>;
export type ListGitHubRepositoriesInput = z.infer<typeof listGitHubRepositoriesInputSchema>;
export type ListGitHubRepositoriesResponse = z.infer<typeof listGitHubRepositoriesResponseSchema>;
