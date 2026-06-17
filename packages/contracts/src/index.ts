import { z } from "zod";

export * from "./quick-deploy-workflow";

export const apiVersion = "v1";

export const dependencyResourceKinds = [
  "postgres",
  "redis",
  "mysql",
  "clickhouse",
  "object-storage",
  "opensearch",
] as const;

export const dependencyResourceKindSchema = z.enum(dependencyResourceKinds);

export const versionReferenceKinds = [
  "branch",
  "tag",
  "commit-sha",
  "image-tag",
  "image-digest",
  "content-digest",
  "release",
  "literal",
  "unknown",
] as const;

export const versionReferenceSchema = z.object({
  sourceKind: z.enum([
    "git",
    "docker-image",
    "static-artifact",
    "blueprint",
    "dependency-resource",
    "generic",
    "unknown",
  ]),
  referenceKind: z.enum(versionReferenceKinds),
  value: z.string(),
});

export const sourceVersionSchema = z.object({
  reference: versionReferenceSchema,
  fixedIdentifier: versionReferenceSchema.optional(),
  aliases: z.array(versionReferenceSchema).optional(),
  detected: z.boolean().optional(),
});

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
  features: z
    .object({
      actionDeployTokenAuth: z.boolean().optional(),
      actionServerConfigDeploy: z.boolean().optional(),
      sourcePackages: z.boolean().optional(),
      serverSideConfigBootstrap: z.boolean().optional(),
    })
    .optional(),
});

export const instanceUpgradeCheckStatusSchema = z.enum(["available", "current", "unknown"]);

export const instanceUpgradeCheckResponseSchema = z.object({
  schemaVersion: z.literal("system.instance-upgrade.check/v1"),
  currentVersion: z.string(),
  currentCommitSha: z.string().optional(),
  targetVersion: z.string(),
  latestVersion: z.string().nullable(),
  updateAvailable: z.boolean(),
  checkedAt: z.string(),
  checkStatus: instanceUpgradeCheckStatusSchema,
  releaseNotesUrl: z.string().optional(),
  upgradeCommand: z.string(),
  applySupported: z.boolean(),
  applyUnsupportedReason: z.string().optional(),
});

export const applyInstanceUpgradeInputSchema = z.object({
  targetVersion: z.string().optional(),
  confirm: z.literal(true),
});

export const instanceUpgradeApplyResponseSchema = z.object({
  schemaVersion: z.literal("system.instance-upgrade.apply/v1"),
  targetVersion: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  exitCode: z.number(),
  command: z.array(z.string()),
  stdoutTail: z.string(),
  stderrTail: z.string(),
});

export const authProviderStatusSchema = z.object({
  key: z.enum(["github", "google", "oidc"]),
  title: z.string(),
  configured: z.boolean(),
  connected: z.boolean(),
  requiresSignIn: z.boolean(),
  deferred: z.boolean(),
  connectPath: z.string().optional(),
  reason: z.string().optional(),
});

export const authPublicProviderStatusSchema = z.object({
  key: z.enum(["github", "google", "oidc"]),
  title: z.string(),
  configured: z.boolean(),
  deferred: z.boolean(),
  connectPath: z.string().optional(),
  reason: z.string().optional(),
});

export const authPublicConfigSchema = z.object({
  schemaVersion: z.literal("appaloft.auth.public-config/v1"),
  enabled: z.boolean(),
  provider: z.enum(["none", "better-auth"]),
  providers: z.array(authPublicProviderStatusSchema),
});

export const authEmailVerificationStatusSchema = z.object({
  changeEmail: z
    .object({
      cooldownSeconds: z.number().int().positive().optional(),
      enabled: z.boolean(),
      requestPath: z.string().optional(),
      verifyCurrentEmail: z.boolean().optional(),
      verifyPath: z.string().optional(),
    })
    .optional(),
  cooldownSeconds: z.number().int().positive().optional(),
  enabled: z.boolean(),
  otpLength: z.number().int().positive().optional(),
  otpEnabled: z.boolean(),
  required: z.boolean(),
  sendOtpPath: z.string().optional(),
  verifyOtpPath: z.string().optional(),
  verifyPagePath: z.string().optional(),
});

export const authAccountRecoveryStatusSchema = z.object({
  cooldownSeconds: z.number().int().positive().optional(),
  enabled: z.boolean(),
  forgotPasswordPagePath: z.string().optional(),
  requestPath: z.string().optional(),
  resetPagePath: z.string().optional(),
  resetPath: z.string().optional(),
});

export const authAccountSecurityStatusSchema = z.object({
  changePasswordPath: z.string().optional(),
  enabled: z.boolean(),
  pagePath: z.string().optional(),
  passwordState: z.enum(["not-set", "set", "unknown"]),
  setPasswordPath: z.string().optional(),
});

export const authSessionResponseSchema = z.object({
  accountSecurity: authAccountSecurityStatusSchema,
  accountRecovery: authAccountRecoveryStatusSchema,
  enabled: z.boolean(),
  emailVerification: authEmailVerificationStatusSchema,
  provider: z.enum(["none", "better-auth"]),
  loginRequired: z.boolean(),
  deferredAuth: z.boolean(),
  session: z.unknown().nullable(),
  providers: z.array(authProviderStatusSchema),
});

export const accountProfileResponseSchema = z.object({
  userId: z.string(),
  email: z.string(),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
  emailVerified: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const accountSessionSummarySchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  clientKind: z.enum(["web", "cli", "unknown"]).optional(),
  displayName: z.string().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  current: z.boolean().optional(),
  lastActiveAt: z.string().optional(),
});

export const listAccountSessionsResponseSchema = z.object({
  items: z.array(accountSessionSummarySchema),
  nextCursor: z.string().optional(),
});

export const revokeAccountSessionResponseSchema = z.object({
  sessionId: z.string(),
  revokedAt: z.string(),
});

export const deleteAccountResponseSchema = z.object({
  userId: z.string(),
  deletedAt: z.string(),
});

export const deployTokenScopeSummarySchema = z.object({
  deploymentTargetIds: z.array(z.string()),
  environmentIds: z.array(z.string()),
  projectIds: z.array(z.string()),
  repositoryFullNames: z.array(z.string()),
  resourceIds: z.array(z.string()),
  workflowCommands: z.array(
    z.enum(["source-link-deploy", "server-config-deploy", "preview-cleanup"]),
  ),
});

export const deployTokenSummarySchema = z.object({
  tokenId: z.string(),
  organizationId: z.string(),
  displayName: z.string(),
  status: z.enum(["active", "revoked"]),
  secretSuffix: z.string(),
  scope: deployTokenScopeSummarySchema,
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  lastUsedAt: z.string().optional(),
  rotatedAt: z.string().optional(),
  revokedAt: z.string().optional(),
});

export const createDeployTokenResponseSchema = z.object({
  tokenId: z.string(),
  token: z.string(),
  organizationId: z.string(),
  displayName: z.string(),
  secretSuffix: z.string(),
  scopes: deployTokenScopeSummarySchema,
  createdAt: z.string(),
  expiresAt: z.string().optional(),
});

export const listDeployTokensResponseSchema = z.object({
  items: z.array(deployTokenSummarySchema),
});

export const showDeployTokenResponseSchema = deployTokenSummarySchema;

export const rotateDeployTokenResponseSchema = z.object({
  tokenId: z.string(),
  token: z.string(),
  rotatedAt: z.string(),
  scopes: deployTokenScopeSummarySchema,
});

export const revokeDeployTokenResponseSchema = z.object({
  tokenId: z.string(),
  revokedAt: z.string(),
});

export const organizationTeamRoleSchema = z.enum([
  "admin",
  "billing",
  "developer",
  "owner",
  "viewer",
]);

export const organizationInvitationStatusSchema = z.enum([
  "accepted",
  "expired",
  "pending",
  "revoked",
]);

export const organizationCurrentUserSummarySchema = z.object({
  userId: z.string(),
  email: z.string(),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
});

export const organizationContextOrganizationSummarySchema = z.object({
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  role: organizationTeamRoleSchema,
});

export const organizationContextPermissionsSchema = z.object({
  canInviteMembers: z.boolean(),
  canListMembers: z.boolean(),
  canManageDeployTokens: z.boolean(),
  canRemoveMembers: z.boolean(),
  canTransferOwnership: z.boolean().optional(),
  canUpdateMemberRoles: z.boolean(),
});

export const productLoginMethodStatusSchema = z.object({
  key: z.enum(["local-password", "github", "google", "oidc"]),
  configured: z.boolean(),
  enabled: z.boolean(),
  reason: z.string().optional(),
});

export const currentOrganizationContextResponseSchema = z.object({
  user: organizationCurrentUserSummarySchema,
  currentOrganization: organizationContextOrganizationSummarySchema,
  organizations: z.array(organizationContextOrganizationSummarySchema),
  loginMethods: z.array(productLoginMethodStatusSchema),
  permissions: organizationContextPermissionsSchema.optional(),
});

export const organizationProfileResponseSchema = z.object({
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  role: organizationTeamRoleSchema,
  permissions: organizationContextPermissionsSchema.optional(),
  logoUrl: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const organizationMemberSummarySchema = z.object({
  memberId: z.string(),
  userId: z.string(),
  role: organizationTeamRoleSchema,
  joinedAt: z.string(),
  avatarUrl: z.string().optional(),
  displayName: z.string().optional(),
  email: z.string().optional(),
  status: z.enum(["active", "deactivated"]).optional(),
});

export const organizationInvitationSummarySchema = z.object({
  invitationId: z.string(),
  organizationId: z.string(),
  email: z.string(),
  role: organizationTeamRoleSchema,
  status: organizationInvitationStatusSchema,
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  inviter: z
    .object({
      userId: z.string(),
      displayName: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
});

export const listOrganizationMembersResponseSchema = z.object({
  items: z.array(organizationMemberSummarySchema),
  nextCursor: z.string().optional(),
});

export const listOrganizationInvitationsResponseSchema = z.object({
  items: z.array(organizationInvitationSummarySchema),
  nextCursor: z.string().optional(),
});

export const inviteOrganizationMemberResponseSchema = organizationInvitationSummarySchema;
export const changeOrganizationMemberRoleResponseSchema = organizationMemberSummarySchema;
export const reactivateOrganizationMemberResponseSchema = organizationMemberSummarySchema;

export const removeOrganizationMemberResponseSchema = z.object({
  memberId: z.string(),
  organizationId: z.string(),
  removedAt: z.string(),
});

export const transferOrganizationOwnerResponseSchema = z.object({
  fromMember: organizationMemberSummarySchema,
  toMember: organizationMemberSummarySchema,
  transferredAt: z.string(),
});

export const deleteOrganizationResponseSchema = z.object({
  organizationId: z.string(),
  deletedAt: z.string(),
});

export const systemCapabilityDetailSchema = z.object({
  key: z.string(),
  title: z.string(),
  enabled: z.boolean(),
  description: z.string().optional(),
});

export const systemConfigurationDiagnosticSchema = z.object({
  code: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string(),
  documentationHref: z.string().optional(),
});

export const systemConfigurationSummarySchema = z.object({
  status: z.enum(["configured", "not-configured", "partial", "unknown"]),
  diagnostics: z.array(systemConfigurationDiagnosticSchema),
});

export const pluginSummarySchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  version: z.string(),
  kind: z.enum(["user-extension", "system-extension"]),
  capabilities: z.array(z.string()),
  capabilityDetails: z.array(systemCapabilityDetailSchema).optional(),
  compatible: z.boolean(),
  configuration: systemConfigurationSummarySchema.optional(),
});

export const systemPluginWebExtensionSchema = z.object({
  key: z.string(),
  pluginName: z.string(),
  pluginDisplayName: z.string(),
  title: z.string(),
  description: z.string().optional(),
  path: z.string(),
  placement: z.enum([
    "auth",
    "navigation",
    "settings",
    "quick-deploy-source",
    "project-environment-panel",
    "resource-detail-panel",
  ]),
  target: z.enum(["server-page", "external-page", "console-route"]),
  requiresAuth: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const projectSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string().optional(),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  lifecycleStatus: z.enum(["active", "archived"]),
  archivedAt: z.string().optional(),
  archiveReason: z.string().optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  createdAt: z.string(),
});

export const createProjectInputSchema = z.object({
  name: z.string().min(1),
  organizationId: z.string().min(1).optional(),
  description: z.string().optional(),
});

export const showProjectInputSchema = z.object({
  projectId: z.string().min(1),
});

export const renameProjectInputSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
});

export const reorderProjectsInputSchema = z.object({
  projectIds: z.array(z.string().min(1)).min(1).max(500),
  startOffset: z.number().int().nonnegative().optional(),
});

export const setProjectDescriptionInputSchema = z.object({
  projectId: z.string().min(1),
  description: z.string().optional(),
});

export const archiveProjectInputSchema = z.object({
  projectId: z.string().min(1),
  reason: z.string().min(1).max(280).optional(),
});

export const restoreProjectInputSchema = z.object({
  projectId: z.string().min(1),
});

export const checkProjectDeleteSafetyInputSchema = z.object({
  projectId: z.string().min(1),
});

export const deleteProjectInputSchema = z.object({
  projectId: z.string().min(1),
  confirmation: z.object({
    projectId: z.string().min(1),
  }),
  idempotencyKey: z.string().min(1).optional(),
});

export const projectDeleteBlockerKindSchema = z.enum([
  "active-project",
  "environment",
  "resource",
  "deployment-history",
  "domain-binding",
  "certificate",
  "source-link",
  "source-event",
  "dependency-resource",
  "storage-volume",
  "scheduled-task",
  "preview-environment",
  "runtime-monitoring",
  "runtime-log-retention",
  "provider-job-log",
  "domain-event-retention",
  "audit-retention",
]);

export const projectDeleteBlockerSchema = z.object({
  kind: projectDeleteBlockerKindSchema,
  relatedEntityId: z.string().optional(),
  relatedEntityType: z.string().optional(),
  count: z.number().int().nonnegative().optional(),
});

export const checkProjectDeleteSafetyResponseSchema = z.object({
  schemaVersion: z.literal("projects.delete-check/v1"),
  projectId: z.string(),
  lifecycleStatus: z.enum(["active", "archived"]),
  eligible: z.boolean(),
  blockers: z.array(projectDeleteBlockerSchema),
  checkedAt: z.string(),
});

export const createProjectResponseSchema = z.object({
  id: z.string(),
});

export const countResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});

export const listProjectsResponseSchema = z.object({
  items: z.array(projectSummarySchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export const showProjectResponseSchema = projectSummarySchema;

export const renameProjectResponseSchema = z.object({
  id: z.string(),
});

export const reorderProjectsResponseSchema = z.object({
  reorderedProjectIds: z.array(z.string()),
});

export const setProjectDescriptionResponseSchema = z.object({
  id: z.string(),
});

export const archiveProjectResponseSchema = z.object({
  id: z.string(),
});

export const restoreProjectResponseSchema = z.object({
  id: z.string(),
});

export const deleteProjectResponseSchema = z.object({
  id: z.string(),
});

export const serverSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  providerKey: z.string(),
  targetKind: z.enum(["single-server", "orchestrator-cluster"]),
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
  runtimeAvailability: z
    .object({
      status: z.enum(["available", "unavailable"]),
      reasonCodes: z.array(z.string()),
      message: z.string().optional(),
    })
    .optional(),
  displayOrder: z.number().int().nonnegative().optional(),
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
  targetKind: z.enum(["single-server", "orchestrator-cluster"]).optional().default("single-server"),
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

export const reorderServersInputSchema = z.object({
  serverIds: z.array(z.string().min(1)).min(1).max(500),
  startOffset: z.number().int().nonnegative().optional(),
});

export const reorderServersResponseSchema = z.object({
  reorderedServerIds: z.array(z.string()),
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
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
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
  "deleted",
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

export const inspectServerCapacityInputSchema = z.object({
  serverId: z.string().min(1),
});

export const runtimeTargetCapacityWarningSchema = z.object({
  code: z.enum([
    "full-disk",
    "high-disk-usage",
    "high-inode-usage",
    "docker-unavailable",
    "timeout",
    "partial-diagnostic",
    "unsupported-provider",
    "audit-record-failed",
  ]),
  message: z.string(),
  path: z.string().optional(),
  mount: z.string().optional(),
  resource: z.enum(["disk", "inode", "docker", "memory", "cpu", "appaloft-runtime"]).optional(),
});

export const runtimeTargetDiskCapacitySchema = z.object({
  path: z.string(),
  mount: z.string(),
  size: z.number(),
  used: z.number(),
  available: z.number(),
  usePercent: z.number(),
});

export const runtimeTargetInodeCapacitySchema = z.object({
  path: z.string(),
  mount: z.string(),
  used: z.number(),
  free: z.number(),
  usePercent: z.number(),
});

export const runtimeTargetDockerCapacitySchema = z.object({
  imagesSize: z.number(),
  reclaimableImagesSize: z.number(),
  buildCacheSize: z.number(),
  reclaimableBuildCacheSize: z.number(),
  containersSize: z.number(),
  volumesSize: z.number(),
});

export const runtimeTargetMemoryCapacitySchema = z.object({
  total: z.number().nullable(),
  available: z.number().nullable(),
  used: z.number().nullable(),
  usePercent: z.number().nullable(),
});

export const runtimeTargetCpuCapacitySchema = z.object({
  logicalCores: z.number().nullable(),
  loadAverage1m: z.number().nullable(),
  loadAverage5m: z.number().nullable(),
  loadAverage15m: z.number().nullable(),
});

export const runtimeTargetAppaloftCapacitySchema = z.object({
  runtimeRoot: z.object({
    path: z.string(),
    size: z.number().nullable(),
    detectable: z.boolean(),
  }),
  stateRoot: z.object({
    path: z.string(),
    size: z.number().nullable(),
    detectable: z.boolean(),
  }),
  sourceWorkspace: z.object({
    path: z.string(),
    size: z.number().nullable(),
    detectable: z.boolean(),
  }),
});

export const runtimeTargetAppaloftContainerCapacitySchema = z.object({
  id: z.string(),
  name: z.string(),
  running: z.boolean(),
  status: z.string(),
  writableBytes: z.number().nullable(),
  deploymentId: z.string().optional(),
  projectId: z.string().optional(),
  environmentId: z.string().optional(),
  resourceId: z.string().optional(),
  serverId: z.string().optional(),
  destinationId: z.string().optional(),
  artifactKind: z.string().optional(),
});

export const runtimeTargetAppaloftWorkspaceCapacitySchema = z.object({
  deploymentId: z.string(),
  path: z.string(),
  bytes: z.number().nullable(),
  activeMarker: z.boolean(),
  rollbackCandidateMarker: z.boolean(),
});

export const runtimeTargetSafeReclaimableEstimateSchema = z.object({
  stoppedContainersSize: z.number(),
  danglingImagesSize: z.number(),
  oldBuildCacheSize: z.number(),
  oldPreviewWorkspaceCandidatesSize: z.number(),
  total: z.number(),
});

export const inspectServerCapacityResponseSchema = z.object({
  schemaVersion: z.literal("servers.capacity.inspect/v1"),
  server: z.object({
    id: z.string(),
    name: z.string(),
    host: z.string(),
    port: z.number(),
    providerKey: z.string(),
    targetKind: z.string(),
  }),
  inspectedAt: z.string(),
  disk: z.array(runtimeTargetDiskCapacitySchema),
  inodes: z.array(runtimeTargetInodeCapacitySchema),
  docker: runtimeTargetDockerCapacitySchema,
  memory: runtimeTargetMemoryCapacitySchema,
  cpu: runtimeTargetCpuCapacitySchema,
  appaloftRuntime: runtimeTargetAppaloftCapacitySchema,
  appaloftContainers: z.array(runtimeTargetAppaloftContainerCapacitySchema),
  appaloftWorkspaces: z.array(runtimeTargetAppaloftWorkspaceCapacitySchema),
  safeReclaimableEstimate: runtimeTargetSafeReclaimableEstimateSchema,
  warnings: z.array(runtimeTargetCapacityWarningSchema),
  partial: z.boolean(),
});

export const runtimeUsageScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("server"),
    serverId: z.string(),
  }),
  z.object({
    kind: z.literal("project"),
    projectId: z.string(),
  }),
  z.object({
    kind: z.literal("environment"),
    environmentId: z.string(),
  }),
  z.object({
    kind: z.literal("resource"),
    resourceId: z.string(),
  }),
  z.object({
    kind: z.literal("deployment"),
    deploymentId: z.string(),
  }),
]);

export const runtimeUsageFreshnessSchema = z.enum(["live", "recent-sample", "stale", "unknown"]);

export const runtimeCpuUsageSchema = z.object({
  logicalCores: z.number().optional(),
  loadAverage1m: z.number().optional(),
  loadAverage5m: z.number().optional(),
  loadAverage15m: z.number().optional(),
  containerCpuPercent: z.number().optional(),
});

export const runtimeMemoryUsageSchema = z.object({
  totalBytes: z.number().optional(),
  usedBytes: z.number().optional(),
  availableBytes: z.number().optional(),
  containerUsedBytes: z.number().optional(),
});

export const runtimeDiskUsageSchema = z.object({
  totalBytes: z.number().optional(),
  usedBytes: z.number().optional(),
  availableBytes: z.number().optional(),
  attributedBytes: z.number().optional(),
});

export const runtimeInodeUsageSchema = z.object({
  total: z.number().optional(),
  used: z.number().optional(),
  available: z.number().optional(),
});

export const runtimeDockerUsageSchema = z.object({
  imageBytes: z.number().optional(),
  buildCacheBytes: z.number().optional(),
  containerWritableBytes: z.number().optional(),
});

export const runtimeNetworkUsageSchema = z.object({
  rxBytes: z.number().optional(),
  txBytes: z.number().optional(),
});

export const runtimeUsageTotalsSchema = z.object({
  cpu: runtimeCpuUsageSchema.optional(),
  memory: runtimeMemoryUsageSchema.optional(),
  disk: runtimeDiskUsageSchema.optional(),
  inode: runtimeInodeUsageSchema.optional(),
  docker: runtimeDockerUsageSchema.optional(),
  network: runtimeNetworkUsageSchema.optional(),
});

export const runtimeUsageOwnershipSchema = z.enum([
  "attributed",
  "partially-attributed",
  "unattributed",
  "unknown",
]);

export const runtimeUsageWarningSchema = z.object({
  code: z.enum([
    "partial-diagnostic",
    "unsupported-provider",
    "docker-unavailable",
    "timeout",
    "ownership-unproven",
    "missing-metric-source",
    "stale-observation",
  ]),
  message: z.string(),
  scope: runtimeUsageScopeSchema.optional(),
  resource: z.enum(["cpu", "memory", "disk", "inode", "docker", "network", "ownership"]).optional(),
});

export const runtimeUsageSourceErrorSchema = z.object({
  source: z.enum(["runtime-target", "docker", "read-model", "capacity", "workspace", "unknown"]),
  code: z.string(),
  message: z.string(),
  retriable: z.boolean(),
});

export const runtimeUsageRollupSchema = z.object({
  scope: runtimeUsageScopeSchema,
  ownership: runtimeUsageOwnershipSchema,
  totals: runtimeUsageTotalsSchema,
  currentDeploymentId: z.string().optional(),
  currentRuntimeId: z.string().optional(),
  artifactCount: z.number().optional(),
  warnings: z.array(runtimeUsageWarningSchema),
});

export const runtimeUsageEvidenceSchema = z.object({
  source: z.enum([
    "label",
    "deployment-snapshot",
    "runtime-identity",
    "workspace-metadata",
    "read-model",
  ]),
  key: z.string(),
});

export const runtimeUsageArtifactKindSchema = z.enum([
  "active-runtime",
  "rollback-candidate",
  "source-workspace",
  "docker-image",
  "docker-build-cache",
  "appaloft-state-root",
  "volume",
  "unknown",
]);

export const runtimeArtifactUsageSchema = z.object({
  kind: runtimeUsageArtifactKindSchema,
  ownership: runtimeUsageOwnershipSchema,
  serverId: z.string().optional(),
  projectId: z.string().optional(),
  environmentId: z.string().optional(),
  resourceId: z.string().optional(),
  deploymentId: z.string().optional(),
  destinationId: z.string().optional(),
  runtimeId: z.string().optional(),
  bytes: z.number().optional(),
  inodeCount: z.number().optional(),
  observedAt: z.string().optional(),
  evidence: z.array(runtimeUsageEvidenceSchema),
  reclaimable: z.enum(["yes", "no", "unknown"]),
  reclaimBlockedReason: z.string().optional(),
  warnings: z.array(runtimeUsageWarningSchema),
});

export const inspectRuntimeUsageResponseSchema = z.object({
  schemaVersion: z.literal("runtime-usage.inspect/v1"),
  scope: runtimeUsageScopeSchema,
  generatedAt: z.string(),
  observedAt: z.string().optional(),
  freshness: runtimeUsageFreshnessSchema,
  partial: z.boolean(),
  totals: runtimeUsageTotalsSchema,
  byProject: z.array(runtimeUsageRollupSchema),
  byEnvironment: z.array(runtimeUsageRollupSchema),
  byResource: z.array(runtimeUsageRollupSchema),
  byDeployment: z.array(runtimeUsageRollupSchema),
  artifacts: z.array(runtimeArtifactUsageSchema),
  warnings: z.array(runtimeUsageWarningSchema),
  sourceErrors: z.array(runtimeUsageSourceErrorSchema),
});

export const runtimeMonitoringSignalSchema = z.enum([
  "cpu",
  "memory",
  "disk",
  "inode",
  "docker",
  "network",
]);

export const runtimeMonitoringBucketSchema = z.enum(["minute", "five-minute", "hour"]);

export const runtimeMonitoringThresholdMetricSchema = z.enum([
  "containerCpuPercent",
  "loadAverage1m",
  "containerUsedBytes",
  "usedBytes",
  "attributedBytes",
  "used",
  "imageBytes",
  "buildCacheBytes",
  "containerWritableBytes",
  "rxBytes",
  "txBytes",
]);

export const runtimeMonitoringRetentionSummarySchema = z.object({
  rawRetentionHours: z.number(),
  retainedFrom: z.string().optional(),
  retainedTo: z.string().optional(),
});

export const runtimeMonitoringSafeLabelsSchema = z.object({
  providerKey: z.string().optional(),
  artifactKind: runtimeUsageArtifactKindSchema.optional(),
  runtimeId: z.string().optional(),
});

export const runtimeMonitoringScopeEvidenceSchema = z.object({
  scope: runtimeUsageScopeSchema,
  serverId: z.string().optional(),
  projectId: z.string().optional(),
  environmentId: z.string().optional(),
  resourceId: z.string().optional(),
  deploymentId: z.string().optional(),
});

export const runtimeMonitoringWarningSchema = z.object({
  code: z.enum([
    "missing-samples",
    "partial-window",
    "stale-samples",
    "missing-metric-source",
    "outside-retention",
  ]),
  message: z.string(),
  signal: runtimeMonitoringSignalSchema.optional(),
  scope: runtimeUsageScopeSchema.optional(),
});

export const runtimeMonitoringSourceErrorSchema = z.object({
  source: z.enum(["monitoring-store", "collector", "read-model", "unknown"]),
  code: z.string(),
  message: z.string(),
  retriable: z.boolean(),
});

export const runtimeMonitoringSampleSchema = z.object({
  sampleId: z.string(),
  observedAt: z.string(),
  collectedAt: z.string(),
  scopeEvidence: runtimeMonitoringScopeEvidenceSchema,
  totals: runtimeUsageTotalsSchema,
  freshness: runtimeUsageFreshnessSchema,
  partial: z.boolean(),
  labels: runtimeMonitoringSafeLabelsSchema,
  warnings: z.array(runtimeMonitoringWarningSchema),
  sourceErrors: z.array(runtimeMonitoringSourceErrorSchema),
});

export const runtimeMonitoringSamplesResponseSchema = z.object({
  schemaVersion: z.literal("runtime-monitoring.samples.list/v1"),
  scope: runtimeUsageScopeSchema,
  from: z.string(),
  to: z.string(),
  generatedAt: z.string(),
  freshness: runtimeUsageFreshnessSchema,
  partial: z.boolean(),
  retention: runtimeMonitoringRetentionSummarySchema,
  samples: z.array(runtimeMonitoringSampleSchema),
  warnings: z.array(runtimeMonitoringWarningSchema),
  sourceErrors: z.array(runtimeMonitoringSourceErrorSchema),
});

export const runtimeMonitoringSeriesPointSchema = z.object({
  from: z.string(),
  to: z.string(),
  sampleCount: z.number(),
  totals: runtimeUsageTotalsSchema,
});

export const runtimeMonitoringSeriesSchema = z.object({
  signal: runtimeMonitoringSignalSchema,
  points: z.array(runtimeMonitoringSeriesPointSchema),
});

export const runtimeMonitoringContributorSchema = z.object({
  scope: runtimeUsageScopeSchema,
  totals: runtimeUsageTotalsSchema,
  sampleCount: z.number(),
});

export const runtimeMonitoringDeploymentMarkerSchema = z.object({
  deploymentId: z.string(),
  resourceId: z.string().optional(),
  environmentId: z.string().optional(),
  observedAt: z.string(),
  status: z.string(),
  label: z.string(),
  correlation: z.literal("time"),
});

export const runtimeMonitoringRollupResponseSchema = z.object({
  schemaVersion: z.literal("runtime-monitoring.rollup/v1"),
  scope: runtimeUsageScopeSchema,
  from: z.string(),
  to: z.string(),
  bucket: runtimeMonitoringBucketSchema,
  generatedAt: z.string(),
  freshness: runtimeUsageFreshnessSchema,
  partial: z.boolean(),
  retention: runtimeMonitoringRetentionSummarySchema,
  series: z.array(runtimeMonitoringSeriesSchema),
  totals: runtimeUsageTotalsSchema,
  topContributors: z.array(runtimeMonitoringContributorSchema),
  deploymentMarkers: z.array(runtimeMonitoringDeploymentMarkerSchema),
  warnings: z.array(runtimeMonitoringWarningSchema),
  sourceErrors: z.array(runtimeMonitoringSourceErrorSchema),
});

export const runtimeMonitoringThresholdRuleSchema = z.object({
  ruleId: z.string(),
  signal: runtimeMonitoringSignalSchema,
  metric: runtimeMonitoringThresholdMetricSchema,
  warning: z.number().optional(),
  critical: z.number().optional(),
  comparator: z.literal("greater-than-or-equal"),
});

export const runtimeMonitoringThresholdPolicyReadSchema = z.object({
  schemaVersion: z.literal("runtime-monitoring-thresholds.policy/v1"),
  policyId: z.string(),
  scope: runtimeUsageScopeSchema,
  rules: z.array(runtimeMonitoringThresholdRuleSchema),
  enabled: z.boolean(),
  updatedAt: z.string(),
  updatedByActorId: z.string().optional(),
  updatedByActorKind: z.enum(["deploy-token", "system", "user"]).optional(),
});

export const runtimeMonitoringThresholdCrossingSchema = z.object({
  ruleId: z.string(),
  signal: runtimeMonitoringSignalSchema,
  metric: runtimeMonitoringThresholdMetricSchema,
  severity: z.enum(["warning", "critical"]),
  observedValue: z.number(),
  boundary: z.number(),
});

export const runtimeMonitoringThresholdNextActionSchema = z.enum([
  "inspect-runtime-usage",
  "open-runtime-monitoring",
  "inspect-capacity",
  "review-runtime-logs",
  "review-deployment-events",
  "configure-thresholds",
]);

export const runtimeMonitoringThresholdEvaluationSchema = z.object({
  state: z.enum(["ok", "warning", "critical", "stale", "unknown"]),
  evaluatedAt: z.string().optional(),
  sourceSampleId: z.string().optional(),
  crossed: z.array(runtimeMonitoringThresholdCrossingSchema),
  nextActions: z.array(runtimeMonitoringThresholdNextActionSchema),
  sourceErrors: z.array(runtimeMonitoringSourceErrorSchema),
});

export const configureRuntimeMonitoringThresholdsResponseSchema = z.object({
  policy: runtimeMonitoringThresholdPolicyReadSchema,
});

export const runtimeMonitoringThresholdsResponseSchema = z.object({
  schemaVersion: z.literal("runtime-monitoring-thresholds.show/v1"),
  scope: runtimeUsageScopeSchema,
  generatedAt: z.string(),
  policy: runtimeMonitoringThresholdPolicyReadSchema.nullable(),
  evaluation: runtimeMonitoringThresholdEvaluationSchema,
});

export const runtimeTargetPruneCategorySchema = z.enum([
  "stopped-containers",
  "preview-workspaces",
  "source-workspaces",
  "docker-build-cache",
  "unused-images",
  "remote-state-markers",
]);

export const runtimeTargetCapacityPruneCandidateSchema = z.object({
  id: z.string(),
  category: runtimeTargetPruneCategorySchema,
  target: z.string(),
  updatedAt: z.string().nullable(),
  size: z.number().nullable(),
  action: z.enum(["matched", "pruned", "skipped", "excluded"]),
  skippedReason: z
    .enum([
      "active-runtime",
      "rollback-candidate",
      "cutoff-not-reached",
      "ownership-unproven",
      "unsupported-category",
      "volume-excluded",
      "state-root-excluded",
      "remote-state-excluded",
      "safety-evidence-missing",
    ])
    .optional(),
});

export const runtimeTargetCapacityPruneSummarySchema = z.object({
  inspectedCount: z.number(),
  matchedCount: z.number(),
  prunedCount: z.number(),
  skippedCount: z.number(),
  excludedCount: z.number(),
  reclaimedBytes: z.number(),
  reportedCandidateCount: z.number().optional(),
  omittedCandidateCount: z.number().optional(),
  outputLimit: z.number().optional(),
});

export const pruneServerCapacityResponseSchema = z.object({
  schemaVersion: z.literal("servers.capacity.prune/v1"),
  server: z.object({
    id: z.string(),
    name: z.string(),
    host: z.string(),
    port: z.number(),
    providerKey: z.string(),
    targetKind: z.string(),
  }),
  before: z.string(),
  categories: z.array(runtimeTargetPruneCategorySchema),
  dryRun: z.boolean(),
  prunedAt: z.string(),
  summary: runtimeTargetCapacityPruneSummarySchema,
  candidates: z.array(runtimeTargetCapacityPruneCandidateSchema),
  warnings: z.array(runtimeTargetCapacityWarningSchema),
});

export const scheduledRuntimePrunePolicyScopeSchema = z.enum([
  "defaults",
  "system",
  "organization",
  "project",
  "environment",
  "deployment-snapshot",
]);

export const scheduledRuntimePrunePolicyReadSchema = z.object({
  schemaVersion: z.literal("scheduled-runtime-prune-policies.policy/v1"),
  id: z.string(),
  version: z.string(),
  scope: scheduledRuntimePrunePolicyScopeSchema,
  serverId: z.string(),
  retentionDays: z.number(),
  destructive: z.boolean(),
  categories: z.array(runtimeTargetPruneCategorySchema),
  categoryCount: z.number(),
  retryOnFailure: z.boolean(),
  enabled: z.boolean(),
  updatedAt: z.string(),
});

export const configureScheduledRuntimePrunePolicyResponseSchema = z.object({
  id: z.string(),
});

export const listScheduledRuntimePrunePoliciesResponseSchema = z.object({
  schemaVersion: z.literal("scheduled-runtime-prune-policies.list/v1"),
  items: z.array(scheduledRuntimePrunePolicyReadSchema),
});

export const showScheduledRuntimePrunePolicyResponseSchema = z.object({
  schemaVersion: z.literal("scheduled-runtime-prune-policies.show/v1"),
  policy: scheduledRuntimePrunePolicyReadSchema.nullable(),
});

export const dependencyResourceBackupPolicyReadSchema = z.object({
  schemaVersion: z.literal("dependency-resource-backup-policies.policy/v1"),
  id: z.string(),
  version: z.string(),
  dependencyResourceId: z.string(),
  retentionDays: z.number(),
  scheduleIntervalHours: z.number(),
  providerKey: z.string().nullable(),
  retryOnFailure: z.boolean(),
  enabled: z.boolean(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string(),
  updatedAt: z.string(),
});

export const configureDependencyResourceBackupPolicyResponseSchema = z.object({
  id: z.string(),
});

export const listDependencyResourceBackupPoliciesResponseSchema = z.object({
  schemaVersion: z.literal("dependency-resource-backup-policies.list/v1"),
  items: z.array(dependencyResourceBackupPolicyReadSchema),
});

export const showDependencyResourceBackupPolicyResponseSchema = z.object({
  schemaVersion: z.literal("dependency-resource-backup-policies.show/v1"),
  policy: dependencyResourceBackupPolicyReadSchema.nullable(),
});

export const retentionDefaultScopeSchema = z.enum(["organization", "system"]);

export const retentionDefaultCategorySchema = z.enum([
  "audit-rows",
  "domain-event-streams",
  "process-attempts",
  "provider-job-logs",
  "resource-runtime-log-archives",
  "runtime-monitoring-samples",
]);

export const retentionDefaultReadSchema = z.object({
  schemaVersion: z.literal("retention-defaults.policy/v1"),
  id: z.string(),
  scope: retentionDefaultScopeSchema,
  organizationId: z.string().optional(),
  category: retentionDefaultCategorySchema,
  retentionDays: z.number(),
  dryRunSchedulingEnabled: z.boolean(),
  destructiveSchedulingEnabled: z.boolean(),
  enabled: z.boolean(),
  updatedAt: z.string(),
  updatedByActorId: z.string().optional(),
  updatedByActorKind: z.enum(["deploy-token", "system", "user"]).optional(),
});

export const configureRetentionDefaultsResponseSchema = z.object({
  id: z.string(),
});

export const listRetentionDefaultsResponseSchema = z.object({
  schemaVersion: z.literal("retention-defaults.list/v1"),
  items: z.array(retentionDefaultReadSchema),
});

export const showRetentionDefaultResponseSchema = z.object({
  schemaVersion: z.literal("retention-defaults.show/v1"),
  policy: retentionDefaultReadSchema.nullable(),
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

export const bootstrapServerProxyResponseSchema = z.object({
  serverId: z.string().min(1),
  attemptId: z.string().min(1),
});

export const serverRuntimePrepareStepSchema = z.object({
  phase: z.enum(["connectivity-before", "docker", "edge-proxy", "connectivity-after"]),
  status: z.enum(["succeeded", "failed", "skipped"]),
  message: z.string(),
  durationMs: z.number(),
  metadata: z.record(z.string(), z.string()).optional(),
  checks: z.array(serverConnectivityCheckSchema).optional(),
});

export const prepareServerRuntimeResponseSchema = z.object({
  serverId: z.string().min(1),
  status: z.enum(["ready", "failed"]),
  preparedAt: z.string(),
  steps: z.array(serverRuntimePrepareStepSchema),
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

export const resourceConfigOverrideSummarySchema = z.object({
  key: z.string(),
  exposure: z.enum(["build-time", "runtime"]),
  selectedScope: z.string(),
  overriddenScopes: z.array(z.string()),
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

export const resourceStaticArtifactAccessRouteSummarySchema = z.object({
  url: z.string(),
  hostname: z.string(),
  scheme: z.enum(["http", "https"]),
  providerKey: z.string().optional(),
  targetPort: z.number().optional(),
  publicationId: z.string(),
  artifactId: z.string(),
  pathPrefix: z.string(),
  fileCount: z.number().int().nonnegative().optional(),
  totalBytes: z.number().int().nonnegative().optional(),
  updatedAt: z.string().optional(),
});

export const resourceAccessFailureDiagnosticSchema = z.object({
  schemaVersion: z.literal("resource-access-failure/v1"),
  requestId: z.string(),
  generatedAt: z.string(),
  code: z.enum([
    "resource_access_route_not_found",
    "resource_access_proxy_unavailable",
    "resource_access_route_unavailable",
    "resource_access_upstream_unavailable",
    "resource_access_upstream_connect_failed",
    "resource_access_upstream_timeout",
    "resource_access_upstream_reset",
    "resource_access_upstream_tls_failed",
    "resource_access_edge_error",
    "resource_access_unknown",
  ]),
  category: z.enum(["infra", "integration", "timeout", "not-found", "async-processing"]),
  phase: z.enum([
    "edge-request-routing",
    "proxy-route-observation",
    "upstream-connection",
    "upstream-response",
    "proxy-route-realization",
    "public-route-verification",
    "diagnostic-page-render",
  ]),
  httpStatus: z.union([z.literal(404), z.literal(502), z.literal(503), z.literal(504)]),
  retriable: z.boolean(),
  ownerHint: z.enum(["platform", "resource", "operator-config", "unknown"]),
  nextAction: z.enum([
    "check-health",
    "inspect-runtime-logs",
    "inspect-deployment-timeline",
    "inspect-proxy-preview",
    "diagnostic-summary",
    "verify-domain",
    "fix-dns",
    "repair-proxy",
    "manual-review",
  ]),
  affected: z
    .object({
      url: z.string().optional(),
      hostname: z.string().optional(),
      path: z.string().optional(),
      method: z.string().optional(),
    })
    .optional(),
  route: z
    .object({
      host: z.string().optional(),
      pathPrefix: z.string().optional(),
      resourceId: z.string().optional(),
      deploymentId: z.string().optional(),
      domainBindingId: z.string().optional(),
      serverId: z.string().optional(),
      destinationId: z.string().optional(),
      providerKey: z.string().optional(),
      routeId: z.string().optional(),
      diagnosticId: z.string().optional(),
      routeSource: z
        .enum(["generated-default", "durable-domain", "server-applied", "deployment-snapshot"])
        .optional(),
      routeStatus: z.string().optional(),
    })
    .optional(),
  causeCode: z.string().optional(),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
});

export const appliedRouteContextMetadataSchema = z.object({
  schemaVersion: z.literal("applied-route-context/v1"),
  resourceId: z.string(),
  deploymentId: z.string().optional(),
  domainBindingId: z.string().optional(),
  serverId: z.string().optional(),
  destinationId: z.string().optional(),
  routeId: z.string(),
  diagnosticId: z.string(),
  routeSource: z.enum([
    "generated-default",
    "durable-domain",
    "server-applied",
    "deployment-snapshot",
  ]),
  hostname: z.string(),
  pathPrefix: z.string(),
  proxyKind: z.enum(["none", "traefik", "caddy"]),
  providerKey: z.string().optional(),
  appliedAt: z.string().optional(),
  observedAt: z.string().optional(),
});

export const resourceAccessSummarySchema = z.object({
  plannedGeneratedAccessRoute: plannedResourceAccessRouteSummarySchema.optional(),
  latestGeneratedAccessRoute: resourceAccessRouteSummarySchema.optional(),
  latestDurableDomainRoute: resourceAccessRouteSummarySchema.optional(),
  latestServerAppliedDomainRoute: resourceAccessRouteSummarySchema.optional(),
  latestStaticArtifactRoute: resourceStaticArtifactAccessRouteSummarySchema.optional(),
  proxyRouteStatus: z.enum(["unknown", "ready", "not-ready", "failed"]).optional(),
  lastRouteRealizationDeploymentId: z.string().optional(),
  latestAccessFailureDiagnostic: resourceAccessFailureDiagnosticSchema.optional(),
});

export const resourceAccessFailureEvidenceLookupFiltersSchema = z.object({
  resourceId: z.string().optional(),
  hostname: z.string().optional(),
  path: z.string().optional(),
});

export const resourceAccessFailureEvidenceRelatedIdsSchema = z.object({
  resourceId: z.string().optional(),
  deploymentId: z.string().optional(),
  domainBindingId: z.string().optional(),
  serverId: z.string().optional(),
  destinationId: z.string().optional(),
  routeId: z.string().optional(),
});

const resourceAccessFailureEvidenceLookupBaseSchema = z.object({
  schemaVersion: z.literal("resources.access-failure-evidence.lookup/v1"),
  requestId: z.string(),
  generatedAt: z.string(),
  filters: resourceAccessFailureEvidenceLookupFiltersSchema.optional(),
});

export const resourceAccessFailureEvidenceLookupSchema = z.discriminatedUnion("status", [
  resourceAccessFailureEvidenceLookupBaseSchema.extend({
    status: z.literal("found"),
    matchedSource: z.literal("short-retention-evidence-read-model"),
    evidence: resourceAccessFailureDiagnosticSchema,
    relatedIds: resourceAccessFailureEvidenceRelatedIdsSchema.optional(),
    nextAction: resourceAccessFailureDiagnosticSchema.shape.nextAction,
    capturedAt: z.string(),
    expiresAt: z.string(),
  }),
  resourceAccessFailureEvidenceLookupBaseSchema.extend({
    status: z.literal("not-found"),
    nextAction: z.literal("diagnostic-summary"),
    notFound: z.object({
      code: z.literal("resource_access_failure_evidence_not_found"),
      phase: z.literal("evidence-lookup"),
      message: z.string(),
    }),
  }),
]);

export const resourceHealthOverallSchema = z.enum([
  "healthy",
  "degraded",
  "unhealthy",
  "starting",
  "stopped",
  "not-deployed",
  "unknown",
]);

export const routeAccessBlockingReasonSchema = z.enum([
  "runtime_not_ready",
  "health_check_failing",
  "proxy_route_missing",
  "proxy_route_stale",
  "domain_not_verified",
  "certificate_missing",
  "certificate_expired_or_not_active",
  "dns_points_elsewhere",
  "server_applied_route_unavailable",
  "observation_unavailable",
]);

export const routeIntentStatusDescriptorSchema = z.object({
  schemaVersion: z.literal("route-intent-status/v1"),
  routeId: z.string(),
  diagnosticId: z.string(),
  source: z.enum([
    "generated-default-access",
    "durable-domain-binding",
    "server-applied-route",
    "deployment-snapshot-route",
  ]),
  intent: z.object({
    host: z.string(),
    pathPrefix: z.string(),
    protocol: z.enum(["http", "https"]),
    routeBehavior: z.enum(["serve", "redirect"]),
    redirectTo: z.string().optional(),
    redirectStatus: z
      .union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)])
      .optional(),
  }),
  context: z.object({
    resourceId: z.string(),
    deploymentId: z.string().optional(),
    serverId: z.string().optional(),
    destinationId: z.string().optional(),
    runtimeTargetKind: z.string().optional(),
  }),
  proxy: z.object({
    intent: z.enum(["not-required", "required", "unknown"]),
    applied: z.enum([
      "not-configured",
      "planned",
      "applied",
      "ready",
      "not-ready",
      "stale",
      "failed",
      "unknown",
    ]),
    providerKey: z.string().optional(),
  }),
  domainVerification: z.enum(["not-applicable", "pending", "verified", "failed", "unknown"]),
  tls: z.enum([
    "not-applicable",
    "disabled",
    "pending",
    "active",
    "missing",
    "expired",
    "failed",
    "unknown",
  ]),
  runtimeHealth: resourceHealthOverallSchema,
  latestObservation: z
    .object({
      source: z.enum([
        "resource-access-summary",
        "proxy-preview",
        "resource-health",
        "runtime-logs",
        "access-failure-diagnostic",
        "deployment-snapshot",
      ]),
      observedAt: z.string().optional(),
      requestId: z.string().optional(),
      deploymentId: z.string().optional(),
    })
    .optional(),
  blockingReason: routeAccessBlockingReasonSchema.optional(),
  recommendedAction: z.enum([
    "none",
    "wait",
    "check-health",
    "inspect-logs",
    "inspect-proxy-preview",
    "diagnostic-summary",
    "verify-domain",
    "fix-dns",
    "provide-certificate",
    "repair-proxy",
    "manual-review",
  ]),
  copySafeSummary: z.object({
    status: z.enum(["available", "unavailable", "not-ready", "failed", "stale", "unknown"]),
    code: z.string().optional(),
    phase: z.string().optional(),
    message: z.string(),
  }),
});

export const resourceHealthSourceErrorSchema = z.object({
  source: z.enum([
    "deployment",
    "runtime",
    "health-policy",
    "health-check",
    "proxy",
    "public-access",
    "domain-binding",
    "runtime-control",
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
  serverId: z.string().optional(),
  destinationId: z.string().optional(),
  lastError: z
    .object({
      timestamp: z.string(),
      phase: z.enum(["detect", "plan", "package", "deploy", "verify", "rollback"]),
      message: z.string(),
    })
    .optional(),
});

export const resourceRuntimeControlSummarySchema = z.object({
  runtimeControlAttemptId: z.string(),
  operation: z.enum(["stop", "start", "restart"]),
  status: z.enum(["accepted", "running", "succeeded", "failed", "blocked"]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  runtimeState: z.enum(["starting", "running", "restarting", "stopping", "stopped", "unknown"]),
  blockedReason: z
    .enum([
      "resource-archived",
      "resource-deleted",
      "runtime-not-found",
      "runtime-metadata-stale",
      "runtime-already-running",
      "runtime-already-stopped",
      "runtime-control-in-progress",
      "deployment-in-progress",
      "profile-acknowledgement-required",
      "adapter-unsupported",
      "runtime-control-target-unsupported",
    ])
    .optional(),
  errorCode: z.string().optional(),
  phases: z
    .array(
      z.object({
        phase: z.enum(["stop", "start"]),
        status: z.enum(["pending", "running", "succeeded", "failed", "skipped"]),
        errorCode: z.string().optional(),
      }),
    )
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
  latestRuntimeControl: resourceRuntimeControlSummarySchema.optional(),
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
      .enum([
        "durable-domain",
        "static-artifact",
        "server-applied-domain",
        "generated-latest",
        "generated-planned",
      ])
      .optional(),
    reasonCode: z.string().optional(),
    phase: z.string().optional(),
    routeIntentStatus: routeIntentStatusDescriptorSchema.optional(),
    latestAccessFailure: resourceAccessFailureDiagnosticSchema.optional(),
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

export const resourceHealthHistoryInputSchema = z.object({
  resourceId: z.string().min(1),
  window: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  limit: z.number().int().min(1).max(720).default(200),
});

export const resourceHealthHistoryObservationSchema = z.object({
  observationId: z.string(),
  observedAt: z.string(),
  overall: resourceHealthOverallSchema,
  runtimeLifecycle: z.enum([
    "not-deployed",
    "starting",
    "running",
    "restarting",
    "degraded",
    "stopped",
    "exited",
    "unknown",
  ]),
  runtimeHealth: z.enum(["healthy", "unhealthy", "unknown", "not-configured"]),
  publicAccessStatus: z.enum(["ready", "not-ready", "failed", "unknown", "not-configured"]),
  proxyStatus: z.enum(["ready", "not-ready", "failed", "unknown", "not-configured"]),
  healthPolicyStatus: z.enum(["configured", "not-configured", "unsupported"]),
  latestDeploymentId: z.string().optional(),
  summary: resourceHealthSummarySchema,
});

export const resourceHealthHistorySchema = z.object({
  schemaVersion: z.literal("resources.health-history/v1"),
  resourceId: z.string(),
  from: z.string(),
  to: z.string(),
  generatedAt: z.string(),
  observations: z.array(resourceHealthHistoryObservationSchema),
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
  latestRuntimeControl: resourceRuntimeControlSummarySchema.optional(),
  accessSummary: resourceAccessSummarySchema.optional(),
});

export const storageMountModeSchema = z.enum(["read-write", "read-only"]);
export const storageBackupDataFormatSchema = z.enum([
  "sqlite",
  "json-files",
  "filesystem",
  "application-export",
  "unknown",
]);

export const resourceStorageAttachmentSummarySchema = z.object({
  id: z.string(),
  storageVolumeId: z.string(),
  storageVolumeName: z.string().optional(),
  storageVolumeKind: z.enum(["named-volume", "bind-mount"]).optional(),
  destinationPath: z.string(),
  mountMode: storageMountModeSchema,
  dataFormat: storageBackupDataFormatSchema.optional(),
  applicationDataLabel: z.string().optional(),
  attachedAt: z.string(),
});

export const storageVolumeAttachmentSummarySchema = z.object({
  attachmentId: z.string(),
  resourceId: z.string(),
  resourceName: z.string().optional(),
  resourceSlug: z.string().optional(),
  destinationPath: z.string(),
  mountMode: storageMountModeSchema,
  dataFormat: storageBackupDataFormatSchema.optional(),
  applicationDataLabel: z.string().optional(),
  attachedAt: z.string(),
});

export const storageBackupRelationshipSchema = z.object({
  retentionRequired: z.boolean(),
  reason: z.string().optional(),
});

export const storageVolumeSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  name: z.string(),
  slug: z.string(),
  kind: z.enum(["named-volume", "bind-mount"]),
  sourcePath: z.string().optional(),
  description: z.string().optional(),
  lifecycleStatus: z.enum(["active", "deleted"]),
  backupRelationship: storageBackupRelationshipSchema.optional(),
  attachmentCount: z.number(),
  attachments: z.array(storageVolumeAttachmentSummarySchema),
  createdAt: z.string(),
  deletedAt: z.string().optional(),
});

export const dependencyResourceConnectionSummarySchema = z.object({
  host: z.string(),
  port: z.number().optional(),
  databaseName: z.string().optional(),
  maskedConnection: z.string(),
  secretRef: z.string().optional(),
});

export const dependencyResourceProviderRealizationSummarySchema = z.object({
  status: z.enum(["pending", "ready", "failed", "delete-pending", "deleted"]),
  attemptId: z.string(),
  attemptedAt: z.string(),
  providerResourceHandle: z.string().optional(),
  realizedAt: z.string().optional(),
  failedAt: z.string().optional(),
  failureCode: z.string().optional(),
  failureMessage: z.string().optional(),
});

export const dependencyResourceBindingReadinessSummarySchema = z.object({
  status: z.enum(["ready", "blocked", "not-implemented"]),
  reason: z.string().optional(),
});

export const dependencyResourceBackupRelationshipSchema = z.object({
  retentionRequired: z.boolean(),
  reason: z.string().optional(),
});

export const dependencyResourceDeleteBlockerSchema = z.object({
  kind: z.enum([
    "resource-binding",
    "backup-relationship",
    "dependency-resource-backup",
    "provider-managed-unsafe",
    "deployment-snapshot-reference",
  ]),
  relatedEntityId: z.string().optional(),
  relatedEntityType: z.string().optional(),
  count: z.number().optional(),
});

export const dependencyResourceCapabilityRequirementSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("postgres-extension"),
    name: z.string(),
    required: z.boolean(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("redis-module"),
    name: z.string(),
    required: z.boolean(),
    description: z.string().optional(),
  }),
]);

export const dependencyResourceCapabilityReadbackSchema = z.object({
  type: z.enum(["postgres-extension", "redis-module"]),
  name: z.string(),
  required: z.boolean(),
  status: z.enum(["satisfied", "unsupported", "failed"]),
  evidence: z.array(z.string()),
  version: z.string().optional(),
  checkedAt: z.string().optional(),
});

export type DependencyResourceCapabilityRequirement = z.output<
  typeof dependencyResourceCapabilityRequirementSchema
>;

export type DependencyResourceCapabilityReadback = z.output<
  typeof dependencyResourceCapabilityReadbackSchema
>;

export const dependencyResourceSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  name: z.string(),
  slug: z.string(),
  kind: dependencyResourceKindSchema,
  sourceMode: z.enum(["appaloft-managed", "imported-external"]),
  providerKey: z.string(),
  providerManaged: z.boolean(),
  description: z.string().optional(),
  lifecycleStatus: z.enum(["provisioning", "ready", "degraded", "deleted"]),
  connection: dependencyResourceConnectionSummarySchema.optional(),
  providerRealization: dependencyResourceProviderRealizationSummarySchema.optional(),
  desiredCapabilities: z.array(dependencyResourceCapabilityRequirementSchema),
  capabilityReadbacks: z.array(dependencyResourceCapabilityReadbackSchema),
  bindingReadiness: dependencyResourceBindingReadinessSummarySchema,
  backupRelationship: dependencyResourceBackupRelationshipSchema.optional(),
  deleteSafety: z
    .object({
      blockers: z.array(dependencyResourceDeleteBlockerSchema),
    })
    .optional(),
  createdAt: z.string(),
  deletedAt: z.string().optional(),
});

export const resourceDependencyBindingSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  resourceId: z.string(),
  dependencyResourceId: z.string(),
  dependencyResourceName: z.string().optional(),
  dependencyResourceSlug: z.string().optional(),
  kind: dependencyResourceKindSchema,
  sourceMode: z.enum(["appaloft-managed", "imported-external"]),
  providerKey: z.string(),
  providerManaged: z.boolean(),
  lifecycleStatus: z.enum(["provisioning", "ready", "degraded", "deleted"]),
  target: z.object({
    targetName: z.string(),
    scope: z.enum(["environment", "release", "build-only", "runtime-only"]),
    injectionMode: z.enum(["env", "file", "reference"]),
    secretRef: z.string().optional(),
  }),
  secretRotation: z
    .object({
      secretRef: z.string().optional(),
      secretVersion: z.string(),
      rotatedAt: z.string(),
      previousSecretVersion: z.string().optional(),
    })
    .optional(),
  connection: dependencyResourceConnectionSummarySchema.optional(),
  bindingReadiness: dependencyResourceBindingReadinessSummarySchema,
  snapshotReadiness: z.object({
    status: z.enum(["deferred", "ready", "blocked"]),
    reason: z.string().optional(),
  }),
  status: z.enum(["active", "removed"]),
  createdAt: z.string(),
  removedAt: z.string().optional(),
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
  sourceBindingFingerprint: z.string(),
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
  version: z.string().optional(),
  versionKind: z.enum(versionReferenceKinds).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const resourceAutoDeployPolicySummarySchema = z.object({
  status: z.enum(["enabled", "disabled", "blocked"]),
  triggerKind: z.enum(["git-push", "generic-signed-webhook"]),
  refs: z.array(z.string()),
  eventKinds: z.array(z.enum(["push", "tag"])),
  sourceBindingFingerprint: z.string(),
  blockedReason: z.enum(["source-binding-changed"]).optional(),
  genericWebhookSecretRef: z.string().optional(),
  dedupeWindowSeconds: z.number().int().positive().optional(),
  updatedAt: z.string(),
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
  version: z.string().min(1).optional(),
  versionKind: z.enum(versionReferenceKinds).optional(),
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
    replicas: z.number().int().positive().optional(),
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
  replicas: z.number().int().positive().optional(),
  healthCheckPath: z.string().optional(),
  healthCheck: requestedDeploymentHealthCheckSchema.optional(),
});

export const resourceDetailDeploymentContextSchema = resourceHealthDeploymentContextSchema.omit({
  lastError: true,
});

export const resourceProfileDiagnosticValueSchema = z.object({
  state: z.enum(["present", "missing", "masked", "redacted", "unknown"]),
  displayValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  valueHash: z.string().optional(),
});

export const resourceDetailProfileDiagnosticSchema = z.object({
  code: z.string(),
  severity: z.enum(["info", "warning", "blocking"]),
  message: z.string(),
  path: z.string().optional(),
  section: z.enum(["source", "runtime", "network", "access", "health", "configuration"]).optional(),
  fieldPath: z.string().optional(),
  configKey: z.string().optional(),
  configExposure: z.enum(["build-time", "runtime"]).optional(),
  configKind: z
    .enum(["deployment-strategy", "plain-config", "provider-specific", "secret"])
    .optional(),
  configScope: z
    .enum([
      "defaults",
      "system",
      "organization",
      "project",
      "environment",
      "deployment",
      "resource",
    ])
    .optional(),
  configSource: z.enum(["resource", "entry-profile", "deployment-snapshot"]).optional(),
  comparison: z
    .enum([
      "resource-vs-entry-profile",
      "resource-vs-latest-snapshot",
      "entry-profile-vs-latest-snapshot",
    ])
    .optional(),
  resourceValue: resourceProfileDiagnosticValueSchema.optional(),
  entryProfileValue: resourceProfileDiagnosticValueSchema.optional(),
  deploymentSnapshotValue: resourceProfileDiagnosticValueSchema.optional(),
  latestDeploymentId: z.string().optional(),
  configPointer: z.string().optional(),
  blocksDeploymentAdmission: z.boolean().optional(),
  suggestedCommand: z
    .enum([
      "resources.configure-source",
      "resources.configure-runtime",
      "resources.configure-network",
      "resources.configure-access",
      "resources.configure-health",
      "resources.set-variable",
      "resources.unset-variable",
    ])
    .optional(),
});

export const resourceDetailSchema = z.object({
  schemaVersion: z.literal("resources.show/v1"),
  resource: resourceDetailIdentitySchema,
  source: resourceDetailSourceProfileSchema.optional(),
  autoDeployPolicy: resourceAutoDeployPolicySummarySchema.optional(),
  runtimeProfile: resourceDetailRuntimeProfileSchema.optional(),
  networkProfile: resourceNetworkProfileSchema.optional(),
  accessProfile: resourceAccessProfileSchema.optional(),
  healthPolicy: requestedDeploymentHealthCheckSchema.optional(),
  storageAttachments: z.array(resourceStorageAttachmentSummarySchema).optional(),
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

export const createResourceSecretReferenceInputSchema = z.object({
  resourceId: z.string().min(1),
  key: z.string().min(1),
  value: z.string().min(1),
  exposure: z.enum(["build-time", "runtime"]).default("runtime"),
});

export const rotateResourceSecretReferenceInputSchema = z.object({
  resourceId: z.string().min(1),
  key: z.string().min(1),
  value: z.string().min(1),
  exposure: z.enum(["build-time", "runtime"]).default("runtime"),
});

export const deleteResourceSecretReferenceInputSchema = z.object({
  resourceId: z.string().min(1),
  key: z.string().min(1),
  exposure: z.enum(["build-time", "runtime"]).default("runtime"),
});

export const listResourceSecretReferencesInputSchema = z.object({
  resourceId: z.string().min(1),
  exposure: z.enum(["build-time", "runtime"]).optional(),
});

export const showResourceSecretReferenceInputSchema = z.object({
  resourceId: z.string().min(1),
  key: z.string().min(1),
  exposure: z.enum(["build-time", "runtime"]).default("runtime"),
});

export const importResourceVariablesInputSchema = z.object({
  resourceId: z.string().min(1),
  content: z.string().min(1),
  exposure: z.enum(["build-time", "runtime"]),
  secretKeys: z.array(z.string().min(1)).default([]),
  plainKeys: z.array(z.string().min(1)).default([]),
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
  overrides: z.array(resourceConfigOverrideSummarySchema).default([]),
  precedence: z.array(z.string()),
  generatedAt: z.string(),
});

export const resourceSecretReferenceSummarySchema = z.object({
  resourceId: z.string(),
  key: z.string(),
  value: z.literal("****"),
  scope: z.literal("resource"),
  exposure: z.enum(["build-time", "runtime"]),
  isSecret: z.literal(true),
  kind: z.literal("secret"),
  updatedAt: z.string(),
});

export const listResourceSecretReferencesResponseSchema = z.object({
  schemaVersion: z.literal("resources.secrets.list/v1"),
  resourceId: z.string(),
  items: z.array(resourceSecretReferenceSummarySchema),
  generatedAt: z.string(),
});

export const showResourceSecretReferenceResponseSchema = z.object({
  schemaVersion: z.literal("resources.secrets.show/v1"),
  secret: resourceSecretReferenceSummarySchema,
  generatedAt: z.string(),
});

export const resourceSecretReferenceMutationResponseSchema = z.object({
  resourceId: z.string(),
  key: z.string(),
  exposure: z.enum(["build-time", "runtime"]),
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
export const createResourceSecretReferenceResponseSchema =
  resourceSecretReferenceMutationResponseSchema;
export const rotateResourceSecretReferenceResponseSchema =
  resourceSecretReferenceMutationResponseSchema;
export const deleteResourceSecretReferenceResponseSchema =
  resourceSecretReferenceMutationResponseSchema;
export const importedResourceVariableEntrySchema = z.object({
  key: z.string(),
  value: z.string(),
  exposure: z.enum(["build-time", "runtime"]),
  kind: z.enum(["plain-config", "secret"]),
  isSecret: z.boolean(),
  action: z.enum(["created", "replaced"]),
  sourceLine: z.number().int().positive(),
});

export const resourceVariableDuplicateOverrideSchema = z.object({
  key: z.string(),
  exposure: z.enum(["build-time", "runtime"]),
  firstLine: z.number().int().positive(),
  lastLine: z.number().int().positive(),
  rule: z.literal("last-wins"),
});

export const resourceVariableExistingOverrideSchema = z.object({
  key: z.string(),
  exposure: z.enum(["build-time", "runtime"]),
  previousScope: z.literal("resource"),
  rule: z.literal("resource-entry-replaced"),
});

export const importResourceVariablesResponseSchema = z.object({
  resourceId: z.string(),
  importedEntries: z.array(importedResourceVariableEntrySchema),
  duplicateOverrides: z.array(resourceVariableDuplicateOverrideSchema),
  existingOverrides: z.array(resourceVariableExistingOverrideSchema),
});

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

export const staticArtifactFileDigestResponseSchema = z.object({
  pathDigest: z.string(),
  contentDigest: z.string(),
  sizeBytes: z.number(),
  mimeType: z.string(),
});

export const publishStaticArtifactResponseSchema = z.object({
  schemaVersion: z.literal("static-artifacts.publish/v1"),
  publicationId: z.string(),
  projectId: z.string(),
  resourceId: z.string(),
  artifactId: z.string(),
  manifestDigest: z.string(),
  fileCount: z.number(),
  totalBytes: z.number(),
  files: z.array(staticArtifactFileDigestResponseSchema),
  storageRef: z.string(),
  storageProviderKey: z.string(),
  routeUrl: z.string().optional(),
  routeProviderKey: z.string().optional(),
});

export const staticArtifactPublicationSummaryResponseSchema = z.object({
  publicationId: z.string(),
  projectId: z.string(),
  resourceId: z.string(),
  artifactId: z.string(),
  manifestDigest: z.string(),
  fileCount: z.number(),
  totalBytes: z.number(),
  storageRef: z.string(),
  storageProviderKey: z.string(),
  routeUrl: z.string().optional(),
  routeProviderKey: z.string().optional(),
  publishedAt: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const listStaticArtifactPublicationsResponseSchema = z.object({
  schemaVersion: z.literal("static-artifacts.publications.list/v1"),
  items: z.array(staticArtifactPublicationSummaryResponseSchema),
});

export const archiveResourceInputSchema = z.object({
  resourceId: z.string().min(1),
  reason: z.string().min(1).max(280).optional(),
});

export const archiveResourceResponseSchema = z.object({
  id: z.string(),
});

export const restoreResourceInputSchema = z.object({
  resourceId: z.string().min(1),
});

export const restoreResourceResponseSchema = z.object({
  id: z.string(),
});

export const checkResourceDeleteSafetyInputSchema = z.object({
  resourceId: z.string().min(1),
});

export const resourceDeleteBlockerKindSchema = z.enum([
  "active-resource",
  "runtime-instance",
  "domain-binding",
  "certificate",
  "source-link",
  "dependency-binding",
  "terminal-session",
  "runtime-log-retention",
  "audit-retention",
  "generated-access-route",
  "server-applied-route",
  "proxy-route",
]);

export const resourceDeleteBlockerSchema = z.object({
  kind: resourceDeleteBlockerKindSchema,
  relatedEntityId: z.string().optional(),
  relatedEntityType: z.string().optional(),
  count: z.number().int().nonnegative().optional(),
});

export const resourceDeleteSafetySchema = z.object({
  schemaVersion: z.literal("resources.delete-check/v1"),
  resourceId: z.string(),
  lifecycleStatus: z.enum(["active", "archived"]),
  eligible: z.boolean(),
  blockers: z.array(resourceDeleteBlockerSchema),
  checkedAt: z.string(),
});

export const checkResourceDeleteSafetyResponseSchema = resourceDeleteSafetySchema;

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

export const resetResourceHealthInputSchema = z.object({
  resourceId: z.string().min(1),
});

export const resetResourceHealthResponseSchema = z.object({
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

export const configureResourceAutoDeployInputSchema = z.object({
  resourceId: z.string().min(1),
  mode: z.enum(["enable", "disable", "replace", "acknowledge-source-binding"]),
  sourceBindingFingerprint: z.string().min(1).optional(),
  policy: z
    .object({
      triggerKind: z.enum(["git-push", "generic-signed-webhook"]),
      refs: z.array(z.string().min(1)).min(1),
      eventKinds: z.array(z.enum(["push", "tag"])).min(1),
      genericWebhookSecretRef: z.string().min(1).optional(),
      dedupeWindowSeconds: z.number().int().positive().optional(),
    })
    .optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export const configureResourceAutoDeployResponseSchema = z.object({
  resourceId: z.string(),
  status: z.enum(["enabled", "disabled", "blocked"]),
  triggerKind: z.enum(["git-push", "generic-signed-webhook"]).optional(),
  refs: z.array(z.string()).optional(),
  eventKinds: z.array(z.enum(["push", "tag"])).optional(),
  sourceBindingFingerprint: z.string().optional(),
  blockedReason: z.enum(["source-binding-changed"]).optional(),
});

export const sourceEventSourceKindSchema = z.enum(["github", "gitlab", "generic-signed"]);
export const sourceEventKindSchema = z.enum(["push", "tag"]);
export const sourceEventStatusSchema = z.enum([
  "accepted",
  "deduped",
  "ignored",
  "blocked",
  "dispatched",
  "failed",
]);
export const sourceEventDedupeStatusSchema = z.enum(["new", "duplicate"]);
export const sourceEventIgnoredReasonSchema = z.enum([
  "no-matching-policy",
  "ref-not-matched",
  "policy-disabled",
  "policy-blocked",
]);
export const sourceEventPolicyResultStatusSchema = z.enum([
  "matched",
  "ignored",
  "blocked",
  "dispatch-failed",
  "dispatched",
]);
export const sourceEventPolicyResultReasonSchema = z.enum([
  "ref-not-matched",
  "policy-disabled",
  "policy-blocked",
  "dispatch-failed",
]);

export const listSourceEventsInputSchema = z.object({
  projectId: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  status: sourceEventStatusSchema.optional(),
  sourceKind: sourceEventSourceKindSchema.optional(),
  limit: z.number().int().positive().max(100).optional(),
  cursor: z.string().min(1).optional(),
});

export const showSourceEventInputSchema = z.object({
  sourceEventId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
});

export const replaySourceEventInputSchema = z.object({
  sourceEventId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export const pruneSourceEventsInputSchema = z.object({
  before: z.string().datetime(),
  projectId: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  status: sourceEventStatusSchema.optional(),
  sourceKind: sourceEventSourceKindSchema.optional(),
  dryRun: z.boolean().default(true),
});

export const sourceEventListItemSchema = z.object({
  sourceEventId: z.string(),
  projectId: z.string().optional(),
  resourceIds: z.array(z.string()),
  sourceKind: sourceEventSourceKindSchema,
  eventKind: sourceEventKindSchema,
  ref: z.string(),
  revision: z.string(),
  status: sourceEventStatusSchema,
  dedupeStatus: sourceEventDedupeStatusSchema,
  ignoredReasons: z.array(sourceEventIgnoredReasonSchema),
  createdDeploymentIds: z.array(z.string()),
  receivedAt: z.string(),
});

export const listSourceEventsResponseSchema = z.object({
  items: z.array(sourceEventListItemSchema),
  nextCursor: z.string().optional(),
  generatedAt: z.string(),
});

export const sourceEventIdentitySchema = z.object({
  locator: z.string(),
  providerRepositoryId: z.string().optional(),
  repositoryFullName: z.string().optional(),
});

export const sourceEventVerificationSummarySchema = z.object({
  status: z.enum(["verified", "rejected"]),
  method: z.enum(["provider-signature", "generic-hmac"]).optional(),
  keyVersion: z.string().optional(),
});

export const sourceEventPolicyResultSchema = z.object({
  resourceId: z.string(),
  status: sourceEventPolicyResultStatusSchema,
  reason: sourceEventPolicyResultReasonSchema.optional(),
  deploymentId: z.string().optional(),
  errorCode: z.string().optional(),
});

export const showSourceEventResponseSchema = z.object({
  sourceEventId: z.string(),
  projectId: z.string().optional(),
  matchedResourceIds: z.array(z.string()),
  sourceKind: sourceEventSourceKindSchema,
  eventKind: sourceEventKindSchema,
  sourceIdentity: sourceEventIdentitySchema,
  ref: z.string(),
  revision: z.string(),
  verification: sourceEventVerificationSummarySchema,
  status: sourceEventStatusSchema,
  dedupeOfSourceEventId: z.string().optional(),
  policyResults: z.array(sourceEventPolicyResultSchema),
  createdDeploymentIds: z.array(z.string()),
  receivedAt: z.string(),
});

export const replaySourceEventResponseSchema = z.object({
  schemaVersion: z.literal("source-events.replay/v1"),
  sourceEventId: z.string(),
  status: sourceEventStatusSchema,
  matchedResourceIds: z.array(z.string()),
  createdDeploymentIds: z.array(z.string()),
  ignoredReasons: z.array(sourceEventIgnoredReasonSchema),
  replayedAt: z.string(),
});

export const pruneSourceEventsResponseSchema = z.object({
  schemaVersion: z.literal("source-events.prune/v1"),
  before: z.string(),
  projectId: z.string().optional(),
  resourceId: z.string().optional(),
  status: sourceEventStatusSchema.optional(),
  sourceKind: sourceEventSourceKindSchema.optional(),
  dryRun: z.boolean(),
  matchedCount: z.number().int().nonnegative(),
  prunedCount: z.number().int().nonnegative(),
  countsByStatus: z.record(z.string(), z.number().int().nonnegative()),
  countsBySourceKind: z.record(z.string(), z.number().int().nonnegative()),
  prunedAt: z.string(),
});

const auditEventPayloadValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()).readonly(),
]);

export const listAuditEventsInputSchema = z.object({
  aggregateId: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  limit: z.number().int().positive().max(100).optional(),
  cursor: z.string().min(1).optional(),
});

export const showAuditEventInputSchema = z.object({
  auditEventId: z.string().min(1),
  aggregateId: z.string().min(1).optional(),
});

export const exportAuditEventsInputSchema = z.object({
  aggregateId: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export const exportGlobalAuditEventsInputSchema = z.object({
  aggregateId: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  from: z.string(),
  to: z.string(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export const pruneAuditEventsInputSchema = z.object({
  before: z.string(),
  aggregateId: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  dryRun: z.boolean().default(true),
});

export const createAuditEventArchiveInputSchema = z.object({
  reason: z.string().min(1),
  aggregateId: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
  retainSourceRows: z.boolean().default(false),
});

export const listAuditEventArchivesInputSchema = z.object({
  aggregateId: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().min(1).optional(),
});

export const showAuditEventArchiveInputSchema = z.object({
  archiveId: z.string().min(1),
});

export const pruneAuditEventArchivesInputSchema = z.object({
  before: z.string(),
  aggregateId: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  dryRun: z.boolean().default(true),
});

export const auditEventLegalHoldStatusSchema = z.enum(["active", "released"]);

export const configureAuditEventLegalHoldInputSchema = z.object({
  reason: z.string().min(1),
  aggregateId: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  requestedBy: z.string().min(1).optional(),
});

export const releaseAuditEventLegalHoldInputSchema = z.object({
  holdId: z.string().min(1),
  releaseReason: z.string().min(1),
  releasedBy: z.string().min(1).optional(),
});

export const listAuditEventLegalHoldsInputSchema = z.object({
  status: auditEventLegalHoldStatusSchema.optional(),
  aggregateId: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().min(1).optional(),
});

export const showAuditEventLegalHoldInputSchema = z.object({
  holdId: z.string().min(1),
});

export const pruneProviderJobLogsInputSchema = z.object({
  before: z.string(),
  deploymentId: z.string().min(1).optional(),
  providerKey: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  serverId: z.string().min(1).optional(),
  dryRun: z.boolean().default(true),
});

export const auditEventSummarySchema = z.object({
  auditEventId: z.string(),
  aggregateId: z.string(),
  eventType: z.string(),
  createdAt: z.string(),
});

export const auditEventDetailSchema = auditEventSummarySchema.extend({
  payload: z.record(z.string(), auditEventPayloadValueSchema),
  redactedFields: z.array(z.string()),
});

export const listAuditEventsResponseSchema = z.object({
  schemaVersion: z.literal("audit-events.list/v1"),
  items: z.array(auditEventSummarySchema),
  nextCursor: z.string().optional(),
  generatedAt: z.string(),
});

export const showAuditEventResponseSchema = z.object({
  schemaVersion: z.literal("audit-events.show/v1"),
  event: auditEventDetailSchema,
});

export const exportAuditEventsResponseSchema = z.object({
  schemaVersion: z.literal("audit-events.export/v1"),
  aggregateId: z.string(),
  filters: z.object({
    eventType: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.number(),
  }),
  items: z.array(auditEventDetailSchema),
  itemCount: z.number(),
  truncated: z.boolean(),
  generatedAt: z.string(),
});

export const exportGlobalAuditEventsResponseSchema = z.object({
  schemaVersion: z.literal("audit-events.export-global/v1"),
  filters: z.object({
    aggregateId: z.string().optional(),
    eventType: z.string().optional(),
    from: z.string(),
    to: z.string(),
    limit: z.number(),
  }),
  items: z.array(auditEventDetailSchema),
  itemCount: z.number(),
  truncated: z.boolean(),
  generatedAt: z.string(),
});

export const pruneAuditEventsResponseSchema = z.object({
  schemaVersion: z.literal("audit-events.prune/v1"),
  before: z.string(),
  aggregateId: z.string().optional(),
  eventType: z.string().optional(),
  dryRun: z.boolean(),
  matchedCount: z.number(),
  prunedCount: z.number(),
  heldCount: z.number(),
  archiveRetainedCount: z.number(),
  countsByEventType: z.record(z.string(), z.number()),
  heldCountsByEventType: z.record(z.string(), z.number()),
  archiveRetainedCountsByEventType: z.record(z.string(), z.number()),
  activeHoldIds: z.array(z.string()),
  activeArchiveIds: z.array(z.string()),
  prunedAt: z.string(),
});

export const auditEventArchiveSourceSchema = z.union([
  z.object({
    kind: z.literal("aggregate"),
    aggregateId: z.string(),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
  z.object({
    kind: z.literal("global-window"),
    from: z.string(),
    to: z.string(),
    aggregateId: z.string().optional(),
  }),
]);

export const auditEventArchiveSchema = z.object({
  archiveId: z.string(),
  archiveSchemaVersion: z.literal("audit-events.archive/v1"),
  source: auditEventArchiveSourceSchema,
  eventType: z.string().optional(),
  reason: z.string(),
  itemCount: z.number(),
  truncated: z.boolean(),
  contentDigest: z.string(),
  retainSourceRows: z.boolean(),
  createdAt: z.string(),
});

export const auditEventArchiveResponseSchema = z.object({
  schemaVersion: z.literal("audit-events.archives.archive/v1"),
  archive: auditEventArchiveSchema,
});

export const listAuditEventArchivesResponseSchema = z.object({
  schemaVersion: z.literal("audit-events.archives.list/v1"),
  items: z.array(auditEventArchiveSchema),
  nextCursor: z.string().optional(),
  generatedAt: z.string(),
});

export const showAuditEventArchiveResponseSchema = z.object({
  schemaVersion: z.literal("audit-events.archives.show/v1"),
  archive: auditEventArchiveSchema.extend({
    items: z.array(auditEventDetailSchema),
  }),
  generatedAt: z.string(),
});

export const pruneAuditEventArchivesResponseSchema = z.object({
  schemaVersion: z.literal("audit-events.archives.prune/v1"),
  before: z.string(),
  aggregateId: z.string().optional(),
  eventType: z.string().optional(),
  dryRun: z.boolean(),
  matchedCount: z.number(),
  prunedCount: z.number(),
  countsBySourceKind: z.record(z.string(), z.number()),
  countsByEventType: z.record(z.string(), z.number()),
  prunedAt: z.string(),
});

export const auditEventLegalHoldScopeSchema = z.union([
  z.object({
    kind: z.literal("aggregate"),
    aggregateId: z.string(),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
  z.object({
    kind: z.literal("global-window"),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
]);

export const auditEventLegalHoldSchema = z.object({
  holdId: z.string(),
  status: auditEventLegalHoldStatusSchema,
  scope: auditEventLegalHoldScopeSchema,
  eventType: z.string().optional(),
  reason: z.string(),
  requestedBy: z.string().optional(),
  createdAt: z.string(),
  releasedAt: z.string().optional(),
  releaseReason: z.string().optional(),
  releasedBy: z.string().optional(),
});

export const auditEventLegalHoldResponseSchema = z.object({
  schemaVersion: z.literal("audit-events.legal-holds.hold/v1"),
  hold: auditEventLegalHoldSchema,
});

export const listAuditEventLegalHoldsResponseSchema = z.object({
  schemaVersion: z.literal("audit-events.legal-holds.list/v1"),
  items: z.array(auditEventLegalHoldSchema),
  nextCursor: z.string().optional(),
  generatedAt: z.string(),
});

export const showAuditEventLegalHoldResponseSchema = z.object({
  schemaVersion: z.literal("audit-events.legal-holds.show/v1"),
  hold: auditEventLegalHoldSchema,
  generatedAt: z.string(),
});

export const pruneProviderJobLogsResponseSchema = z.object({
  schemaVersion: z.literal("provider-job-logs.prune/v1"),
  before: z.string(),
  deploymentId: z.string().optional(),
  providerKey: z.string().optional(),
  resourceId: z.string().optional(),
  serverId: z.string().optional(),
  dryRun: z.boolean(),
  matchedCount: z.number(),
  prunedCount: z.number(),
  countsByProviderKey: z.record(z.string(), z.number()),
  prunedAt: z.string(),
});

export const pruneDomainEventsResponseSchema = z.object({
  schemaVersion: z.literal("domain-events.prune/v1"),
  before: z.string(),
  eventType: z.string().optional(),
  aggregateId: z.string().optional(),
  aggregateType: z.string().optional(),
  deploymentId: z.string().optional(),
  limit: z.number().optional(),
  dryRun: z.boolean(),
  inspectedCount: z.number(),
  candidateCount: z.number(),
  prunedCount: z.number(),
  skippedCount: z.number(),
  countsByEventType: z.record(z.string(), z.number()),
  skippedCountsByReason: z.record(z.string(), z.number()),
  prunedAt: z.string(),
});

export const previewEnvironmentStatusSchema = z.enum(["active", "cleanup-requested"]);

export const previewEnvironmentSourceSummarySchema = z.object({
  provider: z.literal("github"),
  repositoryFullName: z.string(),
  headRepositoryFullName: z.string(),
  pullRequestNumber: z.number().int().positive(),
  baseRef: z.string(),
  headSha: z.string(),
  sourceBindingFingerprint: z.string(),
});

export const previewEnvironmentSummarySchema = z.object({
  previewEnvironmentId: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  resourceId: z.string(),
  serverId: z.string().optional(),
  destinationId: z.string().optional(),
  source: previewEnvironmentSourceSummarySchema,
  status: previewEnvironmentStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string().optional(),
});

export const listPreviewEnvironmentsResponseSchema = z.object({
  schemaVersion: z.literal("preview-environments.list/v1"),
  items: z.array(previewEnvironmentSummarySchema),
  nextCursor: z.string().optional(),
  generatedAt: z.string(),
});

export const showPreviewEnvironmentResponseSchema = z.object({
  schemaVersion: z.literal("preview-environments.show/v1"),
  previewEnvironment: previewEnvironmentSummarySchema,
  generatedAt: z.string(),
});

export const deletePreviewEnvironmentResponseSchema = z.object({
  status: z.enum(["cleaned", "already-clean", "retry-scheduled", "failed"]),
  attemptId: z.string(),
  previewEnvironmentId: z.string(),
  resourceId: z.string(),
  sourceBindingFingerprint: z.string(),
  previewEnvironmentStatus: z.literal("cleanup-requested"),
  cleanedRuntime: z.boolean(),
  removedRoute: z.boolean(),
  removedSourceLink: z.boolean(),
  removedProviderMetadata: z.boolean(),
  updatedFeedback: z.boolean(),
  errorCode: z.string().optional(),
  retryable: z.boolean().optional(),
  failurePhase: z.string().optional(),
  nextRetryAt: z.string().optional(),
});

export const previewPolicyScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("project"),
    projectId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("resource"),
    projectId: z.string().min(1),
    resourceId: z.string().min(1),
  }),
]);

export const previewPolicySettingsSchema = z.object({
  sameRepositoryPreviews: z.boolean(),
  forkPreviews: z.enum(["disabled", "without-secrets", "with-secrets"]),
  secretBackedPreviews: z.boolean(),
  maxActivePreviews: z.number().int().positive().optional(),
  previewTtlHours: z.number().int().positive().optional(),
  environmentProfileBaseEnvironmentId: z.string().min(1).optional(),
});

export const previewPolicySummarySchema = z.object({
  id: z.string().optional(),
  scope: previewPolicyScopeSchema,
  settings: previewPolicySettingsSchema,
  source: z.enum(["default", "configured"]),
  updatedAt: z.string().optional(),
});

export const configurePreviewPolicyResponseSchema = z.object({
  id: z.string(),
});

export const showPreviewPolicyResponseSchema = z.object({
  schemaVersion: z.literal("preview-policies.show/v1"),
  policy: previewPolicySummarySchema,
  generatedAt: z.string(),
});

export const attachResourceStorageInputSchema = z.object({
  resourceId: z.string().min(1),
  storageVolumeId: z.string().min(1),
  destinationPath: z.string().min(1),
  mountMode: storageMountModeSchema.default("read-write"),
  dataFormat: storageBackupDataFormatSchema.optional(),
  applicationDataLabel: z.string().min(1).optional(),
});

export const attachResourceStorageResponseSchema = z.object({
  id: z.string(),
});

export const detachResourceStorageInputSchema = z.object({
  resourceId: z.string().min(1),
  attachmentId: z.string().min(1),
});

export const detachResourceStorageResponseSchema = z.object({
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

export const createStorageVolumeInputSchema = z
  .object({
    projectId: z.string().min(1),
    environmentId: z.string().min(1),
    name: z.string().min(1),
    kind: z.enum(["named-volume", "bind-mount"]),
    description: z.string().min(1).optional(),
    sourcePath: z.string().min(1).optional(),
    backupRelationship: storageBackupRelationshipSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === "bind-mount" && !value.sourcePath) {
      context.addIssue({
        code: "custom",
        path: ["sourcePath"],
        message: "Bind mount storage volumes require sourcePath",
      });
    }
    if (value.kind === "named-volume" && value.sourcePath) {
      context.addIssue({
        code: "custom",
        path: ["sourcePath"],
        message: "Named storage volumes must not include sourcePath",
      });
    }
  });

export const createStorageVolumeResponseSchema = z.object({
  id: z.string(),
});

export const listStorageVolumesInputSchema = z.object({
  projectId: z.string().min(1).optional(),
  environmentId: z.string().min(1).optional(),
});

export const listStorageVolumesResponseSchema = z.object({
  schemaVersion: z.literal("storage-volumes.list/v1"),
  items: z.array(storageVolumeSummarySchema),
  generatedAt: z.string(),
});

export const showStorageVolumeInputSchema = z.object({
  storageVolumeId: z.string().min(1),
});

export const showStorageVolumeResponseSchema = z.object({
  schemaVersion: z.literal("storage-volumes.show/v1"),
  storageVolume: storageVolumeSummarySchema,
  generatedAt: z.string(),
});

export const storageBackupPlanBlockerSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const storageBackupRetentionPolicySchema = z.object({
  maxCount: z.number().int(),
  maxAgeDays: z.number().int().positive().optional(),
  maxBytes: z.number().int().positive().optional(),
  minFreeBytes: z.number().int().positive().optional(),
});

export const storageVolumeBackupPlanResponseSchema = z.object({
  schemaVersion: z.literal("storage-volumes.backup-plan/v1"),
  storageVolumeId: z.string(),
  sourceAdapterKey: z.string(),
  targetProviderKey: z.enum([
    "local-filesystem",
    "s3-compatible",
    "webdav",
    "restic-repository",
    "provider-volume-snapshot",
  ]),
  consistency: z.enum([
    "crash-consistent",
    "quiesced",
    "application-consistent",
    "provider-snapshot-consistent",
  ]),
  localOnly: z.boolean(),
  retention: storageBackupRetentionPolicySchema,
  blockers: z.array(storageBackupPlanBlockerSchema),
});

export const createStorageVolumeBackupResponseSchema = z.object({
  id: z.string(),
});

export const storageVolumeBackupRestoreAttemptSummarySchema = z.object({
  attemptId: z.string(),
  status: z.enum(["pending", "completed", "failed"]),
  requestedAt: z.string(),
  target: z.object({
    storageVolumeId: z.string(),
    restoredVolumeId: z.string().optional(),
    destructiveInPlace: z.boolean(),
  }),
  completedAt: z.string().optional(),
  failedAt: z.string().optional(),
  failureCode: z.string().optional(),
  failureMessage: z.string().optional(),
});

export const storageVolumeBackupSummarySchema = z.object({
  id: z.string(),
  storageVolumeId: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  resourceId: z.string().optional(),
  storageVolumeKind: z.enum(["named-volume", "bind-mount"]),
  sourceAdapterKey: z.string(),
  targetProviderKey: z.enum([
    "local-filesystem",
    "s3-compatible",
    "webdav",
    "restic-repository",
    "provider-volume-snapshot",
  ]),
  targetRef: z.string(),
  consistency: z.string(),
  status: z.enum(["pending", "ready", "failed", "pruned"]),
  attemptId: z.string(),
  requestedAt: z.string(),
  retentionStatus: z.enum(["retained", "none", "pruned"]),
  localOnly: z.boolean(),
  artifactHandle: z.string().optional(),
  sizeBytes: z.number().optional(),
  checksum: z.string().optional(),
  completedAt: z.string().optional(),
  failedAt: z.string().optional(),
  failureCode: z.string().optional(),
  failureMessage: z.string().optional(),
  latestRestoreAttempt: storageVolumeBackupRestoreAttemptSummarySchema.optional(),
  createdAt: z.string(),
});

export const listStorageVolumeBackupsResponseSchema = z.object({
  schemaVersion: z.literal("storage-volumes.backups.list/v1"),
  items: z.array(storageVolumeBackupSummarySchema),
  generatedAt: z.string(),
});

export const showStorageVolumeBackupResponseSchema = z.object({
  schemaVersion: z.literal("storage-volumes.backups.show/v1"),
  backup: storageVolumeBackupSummarySchema,
  generatedAt: z.string(),
});

export const storageVolumeRestorePlanResponseSchema = z.object({
  schemaVersion: z.literal("storage-volumes.restore-plan/v1"),
  backupId: z.string(),
  sourceStorageVolumeId: z.string(),
  targetMode: z.enum(["new-volume", "in-place"]),
  destructive: z.boolean(),
  targetStorageVolumeId: z.string().optional(),
  defaultRestoredVolumeName: z.string().optional(),
  blockers: z.array(storageBackupPlanBlockerSchema),
});

export const restoreStorageVolumeBackupResponseSchema = z.object({
  id: z.string(),
  restoredStorageVolumeId: z.string().optional(),
});

export const pruneStorageVolumeBackupResponseSchema = z.object({
  id: z.string(),
  prunedAt: z.string(),
});

export const renameStorageVolumeInputSchema = z.object({
  storageVolumeId: z.string().min(1),
  name: z.string().min(1),
});

export const renameStorageVolumeResponseSchema = z.object({
  id: z.string(),
});

export const deleteStorageVolumeInputSchema = z.object({
  storageVolumeId: z.string().min(1),
});

export const deleteStorageVolumeResponseSchema = z.object({
  id: z.string(),
});

export const cleanupStorageVolumeRuntimeInputSchema = z.object({
  storageVolumeId: z.string().min(1),
  serverId: z.string().min(1),
  before: z.string().datetime({ offset: true }),
  dryRun: z.boolean().default(true),
});

export const storageRuntimeCleanupCandidateSchema = z.object({
  id: z.string(),
  kind: z.enum(["named-volume", "bind-mount"]),
  target: z.string(),
  updatedAt: z.string().nullable(),
  action: z.enum(["matched", "cleaned", "skipped", "blocked"]),
  blockedReason: z
    .enum([
      "active-attachment",
      "active-runtime",
      "retained-snapshot",
      "rollback-candidate",
      "backup-restore-in-flight",
      "backup-retention",
      "bind-mount-unsupported",
      "provider-blocked",
      "cutoff-not-reached",
      "ownership-unproven",
      "safety-evidence-missing",
    ])
    .optional(),
});

export const cleanupStorageVolumeRuntimeResponseSchema = z.object({
  schemaVersion: z.literal("storage-volumes.cleanup-runtime/v1"),
  storageVolume: z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(["named-volume", "bind-mount"]),
  }),
  server: z.object({
    id: z.string(),
    name: z.string(),
    host: z.string(),
    port: z.number(),
    providerKey: z.string(),
    targetKind: z.string(),
  }),
  before: z.string(),
  dryRun: z.boolean(),
  cleanedAt: z.string(),
  summary: z.object({
    inspectedCount: z.number(),
    matchedCount: z.number(),
    cleanedCount: z.number(),
    skippedCount: z.number(),
    blockedCount: z.number(),
  }),
  candidates: z.array(storageRuntimeCleanupCandidateSchema),
  warnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      target: z.string().optional(),
    }),
  ),
});

export const dependencyResourceResponseSchema = z.object({
  id: z.string(),
});

export const dependencyResourceProvisioningPlanStatusSchema = z.enum([
  "planned",
  "accepted",
  "realized",
  "failed",
]);

export const dependencyResourceProvisioningPlanSchema = z.object({
  id: z.string(),
  mode: z.enum(["create", "reuse"]),
  status: dependencyResourceProvisioningPlanStatusSchema,
  kind: dependencyResourceKindSchema,
  projectId: z.string(),
  environmentId: z.string(),
  name: z.string(),
  providerKey: z.string().optional(),
  serverId: z.string().optional(),
  endpoint: z.string().optional(),
  capabilities: z.array(dependencyResourceCapabilityRequirementSchema),
  requiresAcceptance: z.boolean(),
  requestedAt: z.string(),
  acceptedAt: z.string().optional(),
  completedAt: z.string().optional(),
  dependencyResourceId: z.string().optional(),
  failureCode: z.string().optional(),
  failureMessage: z.string().optional(),
  summary: z.array(z.string()),
});

export const dependencyResourceProvisioningPlanResponseSchema = z.object({
  schemaVersion: z.literal("dependency-resource-provisioning.plan/v1"),
  plan: dependencyResourceProvisioningPlanSchema,
  generatedAt: z.string(),
});

export const listDependencyResourcesResponseSchema = z.object({
  schemaVersion: z.literal("dependency-resources.list/v1"),
  items: z.array(dependencyResourceSummarySchema),
  generatedAt: z.string(),
});

export const showDependencyResourceResponseSchema = z.object({
  schemaVersion: z.literal("dependency-resources.show/v1"),
  dependencyResource: dependencyResourceSummarySchema,
  generatedAt: z.string(),
});

export const dependencyResourceRestoreAttemptSummarySchema = z.object({
  attemptId: z.string(),
  status: z.enum(["pending", "completed", "failed"]),
  requestedAt: z.string(),
  completedAt: z.string().optional(),
  failedAt: z.string().optional(),
  failureCode: z.string().optional(),
  failureMessage: z.string().optional(),
});

export const dependencyResourceBackupSummarySchema = z.object({
  id: z.string(),
  dependencyResourceId: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  dependencyKind: dependencyResourceKindSchema,
  providerKey: z.string(),
  status: z.enum(["pending", "ready", "failed"]),
  attemptId: z.string(),
  requestedAt: z.string(),
  retentionStatus: z.enum(["retained", "none"]),
  providerArtifactHandle: z.string().optional(),
  completedAt: z.string().optional(),
  failedAt: z.string().optional(),
  failureCode: z.string().optional(),
  failureMessage: z.string().optional(),
  latestRestoreAttempt: dependencyResourceRestoreAttemptSummarySchema.optional(),
  createdAt: z.string(),
});

export const listDependencyResourceBackupsResponseSchema = z.object({
  schemaVersion: z.literal("dependency-resources.backups.list/v1"),
  items: z.array(dependencyResourceBackupSummarySchema),
  generatedAt: z.string(),
});

export const showDependencyResourceBackupResponseSchema = z.object({
  schemaVersion: z.literal("dependency-resources.backups.show/v1"),
  backup: dependencyResourceBackupSummarySchema,
  generatedAt: z.string(),
});

export const bindResourceDependencyResponseSchema = z.object({
  id: z.string(),
});

export const unbindResourceDependencyResponseSchema = z.object({
  id: z.string(),
});

export const rotateResourceDependencyBindingSecretResponseSchema = z.object({
  id: z.string(),
  rotatedAt: z.string(),
  secretVersion: z.string(),
});

export const listResourceDependencyBindingsResponseSchema = z.object({
  schemaVersion: z.literal("resources.dependency-bindings.list/v1"),
  items: z.array(resourceDependencyBindingSummarySchema),
  generatedAt: z.string(),
});

export const showResourceDependencyBindingResponseSchema = z.object({
  schemaVersion: z.literal("resources.dependency-bindings.show/v1"),
  binding: resourceDependencyBindingSummarySchema,
  generatedAt: z.string(),
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
  appliedRouteContext: appliedRouteContextMetadataSchema.optional(),
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
  appliedRouteContexts: z.array(appliedRouteContextMetadataSchema).optional(),
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

export const createDomainBindingInputSchema = z
  .object({
    projectId: z.string().min(1),
    environmentId: z.string().min(1),
    resourceId: z.string().min(1),
    serverId: z.string().min(1).optional(),
    destinationId: z.string().min(1).optional(),
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
  })
  .superRefine((value, context) => {
    if ((value.serverId && !value.destinationId) || (!value.serverId && value.destinationId)) {
      context.addIssue({
        code: "custom",
        path: value.serverId ? ["destinationId"] : ["serverId"],
        message: "Domain binding server target requires both serverId and destinationId",
      });
    }
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
  serverId: z.string().optional(),
  destinationId: z.string().optional(),
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
    "deleted",
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

export const showDomainBindingInputSchema = z.object({
  domainBindingId: z.string().min(1),
});

export const domainBindingDeleteBlockerSchema = z.object({
  kind: z.enum(["active-certificate", "certificate-history"]),
  severity: z.enum(["blocking", "warning"]),
  message: z.string(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  count: z.number().optional(),
});

export const domainBindingDeleteSafetySchema = z.object({
  domainBindingId: z.string(),
  safeToDelete: z.boolean(),
  blockers: z.array(domainBindingDeleteBlockerSchema),
  warnings: z.array(domainBindingDeleteBlockerSchema),
  preservesGeneratedAccess: z.literal(true),
  preservesDeploymentSnapshots: z.literal(true),
  preservesServerAppliedRouteAudit: z.literal(true),
});

export const domainBindingDetailSchema = z.object({
  binding: domainBindingSummarySchema,
  routeReadiness: z.object({
    status: z.enum(["ready", "not-ready", "pending", "failed", "deleted"]),
    routeBehavior: z.enum(["serve", "redirect"]),
    selectedRoute: routeIntentStatusDescriptorSchema.optional(),
    contextRoutes: z.array(routeIntentStatusDescriptorSchema),
  }),
  generatedAccessFallback: z
    .union([resourceAccessRouteSummarySchema, plannedResourceAccessRouteSummarySchema])
    .optional(),
  proxyReadiness: z.enum(["unknown", "ready", "not-ready", "failed"]).optional(),
  certificates: z.array(z.lazy(() => certificateSummarySchema)),
  deleteSafety: domainBindingDeleteSafetySchema,
});

export const showDomainBindingResponseSchema = domainBindingDetailSchema;

export const configureDomainBindingRouteInputSchema = z.object({
  domainBindingId: z.string().min(1),
  redirectTo: z.string().min(1).optional(),
  redirectStatus: z
    .union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)])
    .optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export const configureDomainBindingRouteResponseSchema = z.object({
  id: z.string(),
});

export const checkDomainBindingDeleteSafetyInputSchema = z.object({
  domainBindingId: z.string().min(1),
});

export const checkDomainBindingDeleteSafetyResponseSchema = domainBindingDeleteSafetySchema;

export const deleteDomainBindingInputSchema = z.object({
  domainBindingId: z.string().min(1),
  confirmation: z.object({
    domainBindingId: z.string().min(1),
  }),
  idempotencyKey: z.string().min(1).optional(),
});

export const deleteDomainBindingResponseSchema = z.object({
  id: z.string(),
});

export const retryDomainBindingVerificationInputSchema = z.object({
  domainBindingId: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
});

export const retryDomainBindingVerificationResponseSchema = z.object({
  id: z.string(),
  verificationAttemptId: z.string(),
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
  status: z.enum([
    "pending",
    "issuing",
    "active",
    "renewing",
    "failed",
    "expired",
    "disabled",
    "revoked",
    "deleted",
  ]),
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
  attempts: z.array(certificateAttemptSummarySchema).optional(),
  createdAt: z.string(),
});

export const listCertificatesResponseSchema = z.object({
  items: z.array(certificateSummarySchema),
});

export const showCertificateResponseSchema = certificateSummarySchema;

export const retryCertificateResponseSchema = z.object({
  certificateId: z.string(),
  attemptId: z.string(),
});

export const revokeCertificateResponseSchema = z.object({
  certificateId: z.string(),
});

export const deleteCertificateResponseSchema = z.object({
  certificateId: z.string(),
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

export const deploymentTimelineJournalEntrySchema = z.object({
  timestamp: z.string(),
  source: z.enum([
    "appaloft",
    "ssh",
    "docker",
    "application",
    "provider",
    "health",
    "domain-event",
  ]),
  phase: z.enum(["detect", "plan", "package", "deploy", "verify", "rollback"]),
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string(),
  masked: z.boolean().optional(),
});

export const deploymentProgressEventSchema = z.object({
  timestamp: z.string(),
  source: deploymentTimelineJournalEntrySchema.shape.source,
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

export const deploymentTimelineEntrySchema = z.object({
  deploymentId: z.string(),
  sequence: z.number().int().positive(),
  cursor: z.string(),
  occurredAt: z.string(),
  source: z.enum([
    "appaloft",
    "ssh",
    "docker",
    "application",
    "provider",
    "health",
    "domain-event",
  ]),
  kind: z.enum([
    "lifecycle",
    "step",
    "command",
    "output",
    "container-log",
    "health-check",
    "status",
    "diagnostic",
    "gap",
  ]),
  phase: z.enum(["detect", "plan", "package", "deploy", "verify", "rollback"]).optional(),
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string(),
  status: z.enum(["running", "succeeded", "failed", "canceled", "rolled-back"]).optional(),
  stream: z.enum(["stdout", "stderr"]).optional(),
  step: z
    .object({
      current: z.number(),
      total: z.number(),
      label: z.string(),
    })
    .optional(),
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
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
            "react",
            "remix",
            "rocket",
            "sinatra",
            "spring-boot",
            "solid",
            "svelte",
            "sveltekit",
            "symfony",
            "vite",
            "vue",
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
              "gradle-kotlin-build",
              "gradle-wrapper",
              "jvm-runnable-jar",
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
              "spring-boot-actuator",
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
    version: sourceVersionSchema.optional(),
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
    kind: z.enum(["single-server", "orchestrator-cluster"]),
    providerKey: z.string(),
    serverIds: z.array(z.string()),
    metadata: z.record(z.string(), z.string()).optional(),
  }),
  detectSummary: z.string(),
  steps: z.array(z.string()),
  generatedAt: z.string(),
});

export const deploymentSummaryTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("server-backed"),
    serverId: z.string(),
    destinationId: z.string(),
  }),
  z.object({
    kind: z.literal("serverless-static-artifact"),
    publicationId: z.string(),
    artifactId: z.string(),
    routeUrl: z.string(),
  }),
]);

export const deploymentSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  resourceId: z.string(),
  target: deploymentSummaryTargetSchema,
  serverId: z.string().optional(),
  destinationId: z.string().optional(),
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
  triggerKind: z.enum(["create", "retry", "redeploy", "rollback"]).optional(),
  sourceDeploymentId: z.string().optional(),
  rollbackCandidateDeploymentId: z.string().optional(),
  sourceCommitSha: z.string().optional(),
  runtimePlan: runtimePlanSchema,
  environmentSnapshot: z.object({
    id: z.string(),
    environmentId: z.string(),
    createdAt: z.string(),
    precedence: z.array(z.string()),
    variables: z.array(environmentVariableSchema),
  }),
  dependencyBindingReferences: z
    .array(
      z.object({
        bindingId: z.string(),
        dependencyResourceId: z.string(),
        kind: dependencyResourceKindSchema,
        targetName: z.string(),
        scope: z.enum(["environment", "release", "build-only", "runtime-only"]),
        injectionMode: z.enum(["env", "file", "reference"]),
        snapshotReadiness: z.object({
          status: z.enum(["ready", "blocked"]),
          reason: z.string().optional(),
        }),
      }),
    )
    .optional(),
  timeline: z.array(deploymentTimelineJournalEntrySchema),
  timelineCount: z.number(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  archivedAt: z.string().optional(),
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

export const cleanupPreviewResponseSchema = z.object({
  sourceFingerprint: z.string(),
  status: z.enum(["cleaned", "already-clean"]),
  cleanedRuntime: z.boolean(),
  cleanedArtifacts: z.boolean().optional(),
  removedServerAppliedRoute: z.boolean(),
  removedSourceLink: z.boolean(),
  removedDependencyBindings: z.number().int().nonnegative().optional(),
  deletedDependencyResources: z.number().int().nonnegative().optional(),
  projectId: z.string().optional(),
  environmentId: z.string().optional(),
  resourceId: z.string().optional(),
  serverId: z.string().optional(),
  destinationId: z.string().optional(),
  deploymentId: z.string().optional(),
});

export const retryDeploymentInputSchema = z.object({
  deploymentId: z.string().min(1),
  resourceId: z.string().min(1).optional(),
  readinessGeneratedAt: z.string().optional(),
});

export const redeployDeploymentInputSchema = z.object({
  resourceId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  environmentId: z.string().min(1).optional(),
  serverId: z.string().min(1).optional(),
  destinationId: z.string().min(1).optional(),
  sourceDeploymentId: z.string().min(1).optional(),
  readinessGeneratedAt: z.string().optional(),
});

export const rollbackDeploymentInputSchema = z.object({
  deploymentId: z.string().min(1),
  rollbackCandidateDeploymentId: z.string().min(1),
  resourceId: z.string().min(1).optional(),
  readinessGeneratedAt: z.string().optional(),
});

export const cancelDeploymentInputSchema = z.object({
  deploymentId: z.string().min(1),
  confirm: z.string().min(1),
  resourceId: z.string().min(1).optional(),
});

export const archiveDeploymentInputSchema = z.object({
  deploymentId: z.string().min(1),
  confirm: z.string().min(1),
  resourceId: z.string().min(1).optional(),
});

export const pruneDeploymentsInputSchema = z.object({
  before: z.string(),
  deploymentId: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  serverId: z.string().min(1).optional(),
  dryRun: z.boolean().default(true),
});

export const retryDeploymentResponseSchema = createDeploymentResponseSchema;
export const redeployDeploymentResponseSchema = createDeploymentResponseSchema;
export const rollbackDeploymentResponseSchema = createDeploymentResponseSchema;
export const cancelDeploymentResponseSchema = z.object({
  id: z.string(),
  status: z.literal("canceled"),
  canceledAt: z.string(),
});
export const archiveDeploymentResponseSchema = z.object({
  id: z.string(),
  archivedAt: z.string(),
});
export const pruneDeploymentsResponseSchema = z.object({
  schemaVersion: z.literal("deployments.prune/v1"),
  before: z.string(),
  deploymentId: z.string().optional(),
  resourceId: z.string().optional(),
  serverId: z.string().optional(),
  dryRun: z.boolean(),
  matchedCount: z.number(),
  prunedCount: z.number(),
  guardedCount: z.number(),
  affectedDeploymentIds: z.array(z.string()),
  guardedDeploymentIds: z.array(z.string()),
  prunedAt: z.string(),
});

export const stopResourceRuntimeInputSchema = z.object({
  resourceId: z.string().min(1),
  deploymentId: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export const startResourceRuntimeInputSchema = stopResourceRuntimeInputSchema.extend({
  acknowledgeRetainedRuntimeMetadata: z.boolean().optional(),
});

export const restartResourceRuntimeInputSchema = stopResourceRuntimeInputSchema.extend({
  acknowledgeRetainedRuntimeMetadata: z.boolean().optional(),
});

export const resourceRuntimeControlResponseSchema = resourceRuntimeControlSummarySchema;
export const stopResourceRuntimeResponseSchema = resourceRuntimeControlResponseSchema;
export const startResourceRuntimeResponseSchema = resourceRuntimeControlResponseSchema;
export const restartResourceRuntimeResponseSchema = resourceRuntimeControlResponseSchema;

export const listDeploymentsResponseSchema = z.object({
  items: z.array(deploymentSummarySchema),
});

export const operatorWorkKindSchema = z.enum([
  "deployment",
  "quick-deploy",
  "blueprint-install",
  "proxy-bootstrap",
  "certificate",
  "remote-state",
  "route-realization",
  "runtime-maintenance",
  "system",
]);

export const operatorWorkStatusSchema = z.enum([
  "pending",
  "running",
  "retry-scheduled",
  "succeeded",
  "failed",
  "canceled",
  "dead-lettered",
  "unknown",
]);

export const operatorWorkNextActionSchema = z.enum([
  "diagnostic",
  "retry",
  "manual-review",
  "no-action",
]);

const operatorWorkSafeDetailValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const operatorWorkItemSchema = z.object({
  id: z.string(),
  kind: operatorWorkKindSchema,
  status: operatorWorkStatusSchema,
  operationKey: z.string(),
  phase: z.string().optional(),
  step: z.string().optional(),
  projectId: z.string().optional(),
  resourceId: z.string().optional(),
  deploymentId: z.string().optional(),
  serverId: z.string().optional(),
  domainBindingId: z.string().optional(),
  certificateId: z.string().optional(),
  startedAt: z.string().optional(),
  updatedAt: z.string(),
  finishedAt: z.string().optional(),
  errorCode: z.string().optional(),
  errorCategory: z.string().optional(),
  retriable: z.boolean().optional(),
  nextActions: z.array(operatorWorkNextActionSchema),
  safeDetails: z.record(z.string(), operatorWorkSafeDetailValueSchema).optional(),
});

export const operatorWorkEventSchema = z.object({
  id: z.string(),
  sequence: z.number().int().positive(),
  kind: z.string(),
  status: operatorWorkStatusSchema.optional(),
  phase: z.string().optional(),
  step: z.string().optional(),
  message: z.string().optional(),
  workerId: z.string().optional(),
  workerGroup: z.string().optional(),
  occurredAt: z.string(),
  safeDetails: z.record(z.string(), operatorWorkSafeDetailValueSchema).optional(),
});

export const operatorWorkEventStreamStatusKindSchema = z.enum([
  "accepted",
  "running",
  "progress",
  "retry-scheduled",
  "succeeded",
  "failed",
  "canceled",
  "dead-lettered",
]);

export const operatorWorkObservedEventSchema = z.object({
  workId: z.string(),
  sequence: z.number().int().positive(),
  cursor: z.string(),
  emittedAt: z.string(),
  kind: operatorWorkEventStreamStatusKindSchema,
  status: operatorWorkStatusSchema,
  operationKey: z.string(),
  workKind: operatorWorkKindSchema,
  phase: z.string().optional(),
  step: z.string().optional(),
  message: z.string().optional(),
  projectId: z.string().optional(),
  resourceId: z.string().optional(),
  deploymentId: z.string().optional(),
  serverId: z.string().optional(),
  workerId: z.string().optional(),
  workerGroup: z.string().optional(),
  errorCode: z.string().optional(),
  errorCategory: z.string().optional(),
  retriable: z.boolean().optional(),
  safeDetails: z.record(z.string(), operatorWorkSafeDetailValueSchema).optional(),
});

export const operatorWorkEventStreamGapSchema = z.object({
  code: z.string(),
  phase: z.enum(["event-replay", "live-follow"]),
  retriable: z.boolean(),
  cursor: z.string().optional(),
  lastSequence: z.number().int().positive().optional(),
  recommendedAction: z.enum(["restart-stream", "open-work-detail"]).optional(),
});

export const listOperatorWorkResponseSchema = z.object({
  schemaVersion: z.literal("operator-work.list/v1"),
  items: z.array(operatorWorkItemSchema),
  generatedAt: z.string(),
});

export const showOperatorWorkResponseSchema = z.object({
  schemaVersion: z.literal("operator-work.show/v1"),
  item: operatorWorkItemSchema,
  events: z.array(operatorWorkEventSchema).optional(),
  generatedAt: z.string(),
});

export const markOperatorWorkRecoveredResponseSchema = z.object({
  workId: z.string(),
  status: z.literal("succeeded"),
  recoveredAt: z.string(),
});

export const deadLetterOperatorWorkResponseSchema = z.object({
  workId: z.string(),
  status: z.literal("dead-lettered"),
  deadLetteredAt: z.string(),
});

export const cancelOperatorWorkResponseSchema = z.object({
  workId: z.string(),
  status: z.literal("canceled"),
  canceledAt: z.string(),
});

export const retryOperatorWorkResponseSchema = z.object({
  workId: z.string(),
  status: z.literal("pending"),
  retryOfWorkId: z.string(),
  retriedAt: z.string(),
});

export const pruneOperatorWorkResponseSchema = z.object({
  prunedCount: z.number(),
  matchedCount: z.number(),
  dryRun: z.boolean(),
  before: z.string(),
  statuses: z.array(z.enum(["succeeded", "failed", "canceled", "dead-lettered"])),
  countsByStatus: z.object({
    succeeded: z.number().optional(),
    failed: z.number().optional(),
    canceled: z.number().optional(),
    "dead-lettered": z.number().optional(),
  }),
  prunedAt: z.string(),
});

export const deploymentDetailSummarySchema = deploymentSummarySchema.omit({
  timeline: true,
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
    })
    .optional(),
  destination: z
    .object({
      id: z.string(),
    })
    .optional(),
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
  timelineCount: z.number().int().nonnegative(),
});

export const deploymentAttemptSnapshotSchema = z.object({
  runtimePlan: runtimePlanSchema,
  environmentSnapshot: deploymentSummarySchema.shape.environmentSnapshot,
  dependencyBindings: z
    .object({
      status: z.enum(["ready", "blocked", "not-applicable"]),
      references: deploymentSummarySchema.shape.dependencyBindingReferences.unwrap(),
      runtimeInjection: z.object({
        status: z.enum(["ready", "blocked", "not-applicable"]),
        reason: z.string().optional(),
      }),
    })
    .optional(),
});

export const deploymentAttemptFailureSummarySchema = z.object({
  timestamp: z.string(),
  source: deploymentTimelineJournalEntrySchema.shape.source,
  phase: deploymentTimelineJournalEntrySchema.shape.phase,
  level: deploymentTimelineJournalEntrySchema.shape.level,
  message: z.string(),
});

export const showDeploymentInputSchema = z.object({
  deploymentId: z.string().min(1),
  includeTimeline: z.boolean().optional(),
  includeSnapshot: z.boolean().optional(),
  includeRelatedContext: z.boolean().optional(),
  includeLatestFailure: z.boolean().optional(),
  includeRecoverySummary: z.boolean().optional(),
});

export const deploymentPlanInputSchema = z.object({
  projectId: z.string().min(1),
  environmentId: z.string().min(1),
  resourceId: z.string().min(1),
  serverId: z.string().min(1),
  destinationId: z.string().min(1).optional(),
  includeAccessPlan: z.boolean().optional(),
  includeCommandSpecs: z.boolean().optional(),
});

export const deploymentPlanReasonCodeSchema = z.enum([
  "resource-source-missing",
  "resource-source-unnormalized",
  "runtime-profile-missing",
  "network-profile-missing",
  "internal-port-missing",
  "missing-internal-port",
  "static-publish-directory-missing",
  "compose-target-service-missing",
  "unsupported-framework",
  "unsupported-runtime-family",
  "ambiguous-framework",
  "ambiguous-framework-evidence",
  "ambiguous-build-tool",
  "ambiguous-jvm-build-tool",
  "ambiguous-python-app-target",
  "missing-asgi-app",
  "missing-build-tool",
  "missing-jvm-build-tool",
  "missing-runnable-jar",
  "missing-wsgi-app",
  "missing-python-app-target",
  "missing-start-intent",
  "missing-build-intent",
  "missing-production-start-command",
  "missing-static-output",
  "missing-source-root",
  "missing-artifact-output",
  "incompatible-source-strategy",
  "runtime-target-unsupported",
  "unsupported-runtime-target",
  "unsupported-container-native-profile",
  "access-plan-unavailable",
  "buildpack-disabled",
  "buildpack-target-unavailable",
  "unsupported-buildpack-builder",
  "unsupported-buildpack-lifecycle-feature",
  "ambiguous-buildpack-evidence",
  "missing-buildpack-evidence",
  "buildpack-start-intent-missing",
  "buildpack-preview-limited",
  "dependency-runtime-injection-blocked",
  "environment-profile-decision-pending",
]);

const deploymentPlanReasonPathSchema = z.object({
  kind: z.enum(["query", "command", "workflow-action", "docs"]),
  targetOperation: z.string().optional(),
  label: z.string(),
  profileField: z.string().optional(),
  docsAnchor: z.string().optional(),
  safeByDefault: z.boolean().optional(),
});

export const deploymentPlanReasonSchema = z.object({
  code: deploymentPlanReasonCodeSchema,
  reasonCode: deploymentPlanReasonCodeSchema.optional(),
  category: z.enum(["blocked", "warning", "info"]),
  phase: z.string(),
  message: z.string(),
  recommendation: z.string().optional(),
  evidence: z
    .array(
      z.object({
        kind: z.string(),
        label: z.string(),
        value: z.string().optional(),
        source: z.string().optional(),
      }),
    )
    .optional(),
  fixPath: z.array(deploymentPlanReasonPathSchema).optional(),
  overridePath: z.array(deploymentPlanReasonPathSchema).optional(),
  affectedProfileField: z.string().optional(),
  relatedEntityId: z.string().optional(),
  relatedEntityType: z.string().optional(),
});

export const deploymentPlanResponseSchema = z.object({
  schemaVersion: z.literal("deployments.plan/v1"),
  context: z.object({
    projectId: z.string(),
    environmentId: z.string(),
    resourceId: z.string(),
    serverId: z.string(),
    destinationId: z.string(),
    projectName: z.string().optional(),
    environmentName: z.string().optional(),
    resourceName: z.string().optional(),
    serverName: z.string().optional(),
  }),
  readiness: z.object({
    status: z.enum(["ready", "blocked", "warning"]),
    ready: z.boolean(),
    reasonCodes: z.array(deploymentPlanReasonCodeSchema),
  }),
  source: z.object({
    kind: runtimePlanSchema.shape.source.shape.kind,
    displayName: z.string(),
    locator: z.string(),
    runtimeFamily: z.string().optional(),
    framework: z.string().optional(),
    packageManager: z.string().optional(),
    applicationShape: z.string().optional(),
    runtimeVersion: z.string().optional(),
    projectName: z.string().optional(),
    detectedFiles: z.array(z.string()),
    detectedScripts: z.array(z.string()),
    dockerfilePath: z.string().optional(),
    composeFilePath: z.string().optional(),
    jarPath: z.string().optional(),
    reasoning: z.array(z.string()),
  }),
  planner: z.object({
    plannerKey: z.string(),
    supportTier: z.enum([
      "first-class",
      "generic",
      "custom",
      "explicit-custom",
      "container-native",
      "buildpack-accelerated",
      "unsupported",
      "ambiguous",
      "requires-override",
    ]),
    buildStrategy: runtimePlanSchema.shape.buildStrategy,
    packagingMode: runtimePlanSchema.shape.packagingMode,
    targetKind: z.enum(["single-server", "orchestrator-cluster"]),
    targetProviderKey: z.string(),
  }),
  buildpack: z
    .object({
      status: z.enum(["selected", "non-winning", "blocked", "disabled", "unavailable"]),
      supportTier: z.enum([
        "buildpack-accelerated",
        "unsupported",
        "ambiguous",
        "requires-override",
      ]),
      evidence: z.object({
        platformFiles: z.array(z.string()),
        languageFamilies: z.array(z.string()),
        frameworkHints: z.array(z.string()),
        builderEvidence: z.array(z.string()),
        detectedBuildpacks: z.array(
          z.object({
            id: z.string(),
            version: z.string().optional(),
          }),
        ),
      }),
      builderPolicy: z.object({
        defaultBuilder: z.string().optional(),
        requestedBuilder: z.string().optional(),
        override: z.enum(["none", "allowed", "blocked"]),
        blockedBuilders: z.array(z.string()),
      }),
      artifactIntent: z.enum(["build-image", "prebuilt-image", "compose-project"]).optional(),
      limitations: z.array(
        z.object({
          code: z.string(),
          message: z.string(),
          fixPath: z.string().optional(),
        }),
      ),
    })
    .optional(),
  artifact: z.object({
    kind: z.enum([
      "dockerfile-image",
      "static-server-image",
      "compose-project",
      "prebuilt-image",
      "custom-command-image",
      "workspace-image",
    ]),
    runtimeArtifactKind: z.enum(["image", "compose-project"]).optional(),
    runtimeArtifactIntent: z.enum(["build-image", "prebuilt-image", "compose-project"]).optional(),
    image: z.string().optional(),
    composeFile: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  }),
  commands: z.array(
    z.object({
      kind: z.enum(["install", "build", "package", "start"]),
      command: z.string(),
      source: z.enum(["resource-runtime-profile", "planner"]),
    }),
  ),
  network: z.object({
    internalPort: z.number().int().positive().optional(),
    upstreamProtocol: z.enum(["http", "https", "tcp"]).optional(),
    exposureMode: z.enum(["none", "direct-port", "reverse-proxy"]).optional(),
    hostPort: z.number().int().positive().optional(),
    targetServiceName: z.string().optional(),
  }),
  health: z.object({
    enabled: z.boolean(),
    kind: z.enum(["http", "command", "none"]),
    path: z.string().optional(),
    port: z.number().int().positive().optional(),
  }),
  access: z
    .object({
      routeSource: z.string().optional(),
      hostname: z.string().optional(),
      scheme: z.enum(["http", "https"]).optional(),
      routeCount: z.number().int().nonnegative().optional(),
      routeGroupCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
  dependencyBindings: z
    .object({
      status: z.enum(["ready", "blocked", "not-applicable"]),
      references: deploymentSummarySchema.shape.dependencyBindingReferences.unwrap(),
      runtimeInjection: z.object({
        status: z.enum(["ready", "blocked", "not-applicable"]),
        reason: z.string().optional(),
      }),
    })
    .optional(),
  warnings: z.array(deploymentPlanReasonSchema),
  unsupportedReasons: z.array(deploymentPlanReasonSchema),
  nextActions: z.array(
    z.object({
      kind: z.enum(["query", "command", "workflow-action"]),
      targetOperation: z.string(),
      label: z.string(),
      safeByDefault: z.boolean(),
      blockedReasonCode: deploymentPlanReasonCodeSchema.optional(),
    }),
  ),
  generatedAt: z.string(),
});

export const deploymentRecoveryReasonCodeSchema = z.enum([
  "attempt-not-terminal",
  "attempt-status-not-recoverable",
  "snapshot-missing",
  "environment-snapshot-missing",
  "runtime-target-missing",
  "runtime-artifact-missing",
  "rollback-candidate-not-successful",
  "rollback-candidate-expired",
  "rollback-candidate-target-mismatch",
  "resource-profile-invalid",
  "resource-runtime-busy",
  "stateful-data-rollback-unsupported",
  "recovery-command-not-active",
]);

export const deploymentRecoveryReadinessReasonSchema = z.object({
  code: deploymentRecoveryReasonCodeSchema,
  category: z.enum(["allowed", "blocked", "warning", "info"]),
  phase: z.string(),
  relatedDeploymentId: z.string().optional(),
  relatedEntityId: z.string().optional(),
  relatedEntityType: z.string().optional(),
  retriable: z.boolean(),
  recommendation: z.string().optional(),
});

export const deploymentRecoveryActionReadinessSchema = z.object({
  allowed: z.boolean(),
  commandActive: z.boolean(),
  reasons: z.array(deploymentRecoveryReadinessReasonSchema),
  targetOperation: z.enum(["deployments.retry", "deployments.redeploy", "deployments.rollback"]),
});

export const rollbackCandidateReadinessSchema = z.object({
  deploymentId: z.string(),
  finishedAt: z.string(),
  status: z.literal("succeeded"),
  sourceSummary: z.string().optional(),
  artifactSummary: z.string().optional(),
  environmentSnapshotId: z.string().optional(),
  runtimeTargetSummary: z.string().optional(),
  rollbackReady: z.boolean(),
  reasons: z.array(deploymentRecoveryReadinessReasonSchema),
});

export const deploymentRecoveryRecommendedActionSchema = z.object({
  kind: z.enum(["query", "command", "workflow-action"]),
  targetOperation: z.enum([
    "deployments.show",
    "deployments.timeline",
    "deployments.timeline.stream",
    "resources.health",
    "resources.diagnostic-summary",
    "deployments.retry",
    "deployments.redeploy",
    "deployments.rollback",
  ]),
  label: z.string(),
  safeByDefault: z.boolean(),
  blockedReasonCode: deploymentRecoveryReasonCodeSchema.optional(),
  commandActive: z.boolean().optional(),
});

export const deploymentRecoveryReadinessInputSchema = z.object({
  deploymentId: z.string().min(1),
  resourceId: z.string().min(1).optional(),
  includeCandidates: z.boolean().optional(),
  maxCandidates: z.number().int().positive().optional(),
});

export const deploymentRecoveryReadinessResponseSchema = z.object({
  schemaVersion: z.literal("deployments.recovery-readiness/v1"),
  deploymentId: z.string(),
  resourceId: z.string(),
  generatedAt: z.string(),
  stateVersion: z.string(),
  recoverable: z.boolean(),
  retryable: z.boolean(),
  redeployable: z.boolean(),
  rollbackReady: z.boolean(),
  rollbackCandidateCount: z.number().int().nonnegative(),
  retry: deploymentRecoveryActionReadinessSchema,
  redeploy: deploymentRecoveryActionReadinessSchema,
  rollback: z.object({
    allowed: z.boolean(),
    commandActive: z.boolean(),
    reasons: z.array(deploymentRecoveryReadinessReasonSchema),
    candidates: z.array(rollbackCandidateReadinessSchema),
    recommendedCandidateId: z.string().optional(),
  }),
  recommendedActions: z.array(deploymentRecoveryRecommendedActionSchema),
});

export const deploymentAttemptRecoverySummarySchema = z.object({
  source: z.literal("deployments.recovery-readiness"),
  retryable: z.boolean(),
  redeployable: z.boolean(),
  rollbackReady: z.boolean(),
  rollbackCandidateCount: z.number().int().nonnegative(),
  blockedReasonCodes: z.array(z.string()),
});

export const showDeploymentResponseSchema = z.object({
  schemaVersion: z.literal("deployments.show/v1"),
  deployment: deploymentDetailSummarySchema,
  status: deploymentAttemptStatusSummarySchema,
  relatedContext: deploymentRelatedContextSchema.optional(),
  snapshot: deploymentAttemptSnapshotSchema.optional(),
  timeline: deploymentAttemptTimelineSchema.optional(),
  latestFailure: deploymentAttemptFailureSummarySchema.optional(),
  recoverySummary: deploymentAttemptRecoverySummarySchema.optional(),
  nextActions: z.array(
    z.enum(["timeline", "resource-detail", "resource-health", "diagnostic-summary"]),
  ),
  sectionErrors: z.array(deploymentDetailSectionErrorSchema),
  generatedAt: z.string(),
});

export const deploymentTimelineResponseSchema = z.object({
  schemaVersion: z.literal("deployments.timeline/v1"),
  deploymentId: z.string(),
  entries: z.array(deploymentTimelineEntrySchema),
  nextCursor: z.string().optional(),
  hasMore: z.boolean(),
});

export const scheduledTaskRunStatusSchema = z.enum([
  "accepted",
  "running",
  "succeeded",
  "failed",
  "skipped",
]);

export const scheduledTaskRunTriggerKindSchema = z.enum(["manual", "scheduled"]);

export const scheduledTaskRunSummarySchema = z.object({
  runId: z.string(),
  taskId: z.string(),
  resourceId: z.string(),
  triggerKind: scheduledTaskRunTriggerKindSchema,
  status: scheduledTaskRunStatusSchema,
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  exitCode: z.number().optional(),
  failureSummary: z.string().optional(),
  skippedReason: z.enum(["concurrency-forbidden", "resource-archived", "task-disabled"]).optional(),
});

export const scheduledTaskDefinitionSummarySchema = z.object({
  taskId: z.string(),
  resourceId: z.string(),
  schedule: z.string(),
  timezone: z.string(),
  commandIntent: z.string(),
  timeoutSeconds: z.number(),
  retryLimit: z.number(),
  concurrencyPolicy: z.enum(["forbid"]),
  status: z.enum(["enabled", "disabled"]),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  latestRun: scheduledTaskRunSummarySchema.optional(),
});

export const scheduledTaskCommandResponseSchema = z.object({
  schemaVersion: z.literal("scheduled-tasks.command/v1"),
  task: scheduledTaskDefinitionSummarySchema,
});

export const deleteScheduledTaskResponseSchema = z.object({
  schemaVersion: z.literal("scheduled-tasks.delete/v1"),
  taskId: z.string(),
  resourceId: z.string(),
  status: z.literal("deleted"),
  deletedAt: z.string(),
});

export const runScheduledTaskNowResponseSchema = z.object({
  schemaVersion: z.literal("scheduled-tasks.run-now/v1"),
  run: scheduledTaskRunSummarySchema,
});

export const listScheduledTasksResponseSchema = z.object({
  schemaVersion: z.literal("scheduled-tasks.list/v1"),
  items: z.array(scheduledTaskDefinitionSummarySchema),
  nextCursor: z.string().optional(),
  generatedAt: z.string(),
});

export const showScheduledTaskResponseSchema = z.object({
  schemaVersion: z.literal("scheduled-tasks.show/v1"),
  task: scheduledTaskDefinitionSummarySchema,
  generatedAt: z.string(),
});

export const listScheduledTaskRunsResponseSchema = z.object({
  schemaVersion: z.literal("scheduled-task-runs.list/v1"),
  items: z.array(scheduledTaskRunSummarySchema),
  nextCursor: z.string().optional(),
  generatedAt: z.string(),
});

export const showScheduledTaskRunResponseSchema = z.object({
  schemaVersion: z.literal("scheduled-task-runs.show/v1"),
  run: scheduledTaskRunSummarySchema,
  generatedAt: z.string(),
});

export const scheduledTaskRunLogEntrySchema = z.object({
  timestamp: z.string(),
  stream: z.enum(["stdout", "stderr", "system"]),
  message: z.string(),
});

export const scheduledTaskRunLogsResponseSchema = z.object({
  schemaVersion: z.literal("scheduled-task-runs.logs/v1"),
  runId: z.string(),
  taskId: z.string(),
  resourceId: z.string(),
  entries: z.array(scheduledTaskRunLogEntrySchema),
  nextCursor: z.string().optional(),
  generatedAt: z.string(),
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

const operatorWorkEventStreamBaseSchema = z.object({
  schemaVersion: z.literal("operator-work.stream-events/v1"),
  event: operatorWorkObservedEventSchema,
});

export const operatorWorkEventStreamEnvelopeSchema = z.discriminatedUnion("kind", [
  operatorWorkEventStreamBaseSchema.extend({ kind: z.literal("accepted") }),
  operatorWorkEventStreamBaseSchema.extend({ kind: z.literal("running") }),
  operatorWorkEventStreamBaseSchema.extend({ kind: z.literal("progress") }),
  operatorWorkEventStreamBaseSchema.extend({ kind: z.literal("retry-scheduled") }),
  operatorWorkEventStreamBaseSchema.extend({ kind: z.literal("succeeded") }),
  operatorWorkEventStreamBaseSchema.extend({ kind: z.literal("failed") }),
  operatorWorkEventStreamBaseSchema.extend({ kind: z.literal("canceled") }),
  operatorWorkEventStreamBaseSchema.extend({ kind: z.literal("dead-lettered") }),
  z.object({
    schemaVersion: z.literal("operator-work.stream-events/v1"),
    kind: z.literal("heartbeat"),
    at: z.string(),
    cursor: z.string().optional(),
  }),
  z.object({
    schemaVersion: z.literal("operator-work.stream-events/v1"),
    kind: z.literal("gap"),
    gap: operatorWorkEventStreamGapSchema,
  }),
  z.object({
    schemaVersion: z.literal("operator-work.stream-events/v1"),
    kind: z.literal("closed"),
    reason: z.enum(["completed", "cancelled", "source-ended", "idle-timeout"]),
    cursor: z.string().optional(),
  }),
  z.object({
    schemaVersion: z.literal("operator-work.stream-events/v1"),
    kind: z.literal("error"),
    error: domainErrorResponseSchema,
  }),
]);

export const operatorWorkEventStreamResponseSchema = z.object({
  workId: z.string(),
  envelopes: z.array(operatorWorkEventStreamEnvelopeSchema),
});

export const operatorWorkEventStreamStreamResponseSchema = z.object({
  workId: z.string(),
});

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

export const resourceRuntimeLogArchiveSummarySchema = z.object({
  archiveId: z.string(),
  resourceId: z.string(),
  deploymentId: z.string().optional(),
  serverId: z.string().optional(),
  serviceName: z.string().optional(),
  runtimeKind: z.string().optional(),
  capturedAt: z.string(),
  lineCount: z.number(),
  retentionStatus: z.literal("retained"),
  reason: z.string().optional(),
});

export const resourceRuntimeLogArchiveDetailSchema = resourceRuntimeLogArchiveSummarySchema.extend({
  lines: z.array(resourceRuntimeLogLineSchema),
});

export const archiveResourceRuntimeLogsResponseSchema = z.object({
  schemaVersion: z.literal("resources.runtime-logs.archive/v1"),
  archive: resourceRuntimeLogArchiveDetailSchema,
});

export const listResourceRuntimeLogArchivesResponseSchema = z.object({
  schemaVersion: z.literal("resources.runtime-log-archives.list/v1"),
  items: z.array(resourceRuntimeLogArchiveSummarySchema),
  nextCursor: z.string().optional(),
  generatedAt: z.string(),
});

export const showResourceRuntimeLogArchiveResponseSchema = z.object({
  schemaVersion: z.literal("resources.runtime-log-archives.show/v1"),
  archive: resourceRuntimeLogArchiveDetailSchema,
});

export const pruneResourceRuntimeLogArchivesResponseSchema = z.object({
  schemaVersion: z.literal("resources.runtime-log-archives.prune/v1"),
  before: z.string(),
  resourceId: z.string().optional(),
  deploymentId: z.string().optional(),
  serverId: z.string().optional(),
  serviceName: z.string().optional(),
  dryRun: z.boolean(),
  matchedCount: z.number(),
  prunedCount: z.number(),
  affectedResourceCount: z.number(),
  prunedAt: z.string(),
});

export const pruneResourceRuntimeControlAttemptsResponseSchema = z.object({
  schemaVersion: z.literal("resources.runtime-control-attempts.prune/v1"),
  before: z.string(),
  deploymentId: z.string().optional(),
  resourceId: z.string().optional(),
  serverId: z.string().optional(),
  dryRun: z.boolean(),
  matchedCount: z.number(),
  prunedCount: z.number(),
  affectedResourceCount: z.number(),
  affectedDeploymentCount: z.number(),
  prunedAt: z.string(),
});

export const deploymentTimelineEnvelopeSchema = z.discriminatedUnion("kind", [
  z.object({
    schemaVersion: z.literal("deployments.timeline/v1"),
    kind: z.literal("entry"),
    entry: deploymentTimelineEntrySchema,
  }),
  z.object({
    schemaVersion: z.literal("deployments.timeline/v1"),
    kind: z.literal("heartbeat"),
    at: z.string(),
    cursor: z.string().optional(),
  }),
  z.object({
    schemaVersion: z.literal("deployments.timeline/v1"),
    kind: z.literal("gap"),
    entry: deploymentTimelineEntrySchema,
  }),
  z.object({
    schemaVersion: z.literal("deployments.timeline/v1"),
    kind: z.literal("closed"),
    reason: z.enum(["completed", "cancelled", "source-ended", "idle-timeout"]),
    cursor: z.string().optional(),
  }),
  z.object({
    schemaVersion: z.literal("deployments.timeline/v1"),
    kind: z.literal("error"),
    error: domainErrorResponseSchema,
  }),
]);

export const deploymentTimelineStreamResponseSchema = z.object({
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

export const terminalSessionSummarySchema = terminalSessionDescriptorSchema.extend({
  status: z.enum(["active", "closing"]),
});

export const listTerminalSessionsResponseSchema = z.object({
  schemaVersion: z.literal("terminal-sessions.list/v1"),
  items: z.array(terminalSessionSummarySchema),
});

export const showTerminalSessionResponseSchema = z.object({
  schemaVersion: z.literal("terminal-sessions.show/v1"),
  item: terminalSessionSummarySchema,
});

export const closeTerminalSessionResponseSchema = z.object({
  sessionId: z.string(),
  closed: z.boolean(),
  status: z.literal("closed"),
});

export const expireTerminalSessionsResponseSchema = z.object({
  expiredCount: z.number().int().nonnegative(),
  sessionIds: z.array(z.string()),
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
    "deployment-timeline",
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
  targetKind: z.enum(["single-server", "orchestrator-cluster"]).optional(),
  targetProviderKey: z.string().optional(),
  services: z.array(resourceServiceSummarySchema),
  networkProfile: resourceNetworkProfileSchema.optional(),
  observationWindow: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .optional(),
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
  serverId: z.string().optional(),
  destinationId: z.string().optional(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  timelineCount: z.number(),
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
  latestAccessFailure: resourceAccessFailureDiagnosticSchema.optional(),
  selectedRoute: routeIntentStatusDescriptorSchema.optional(),
  routeIntentStatuses: z.array(routeIntentStatusDescriptorSchema).optional(),
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
  source: deploymentTimelineJournalEntrySchema.shape.source.optional(),
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
  entrypoint: z.enum(["cli", "http", "mcp", "rpc", "system"]),
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
  deploymentTimeline: resourceDiagnosticLogSectionSchema,
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
  capabilityDetails: z.array(systemCapabilityDetailSchema).optional(),
  configuration: systemConfigurationSummarySchema.optional(),
});

export const integrationConnectionModeSchema = z.object({
  key: z.enum(["user-oauth", "hosted-provider-app", "operator-managed-app"]),
  title: z.string(),
  audience: z.enum(["end-user", "instance-admin", "operator"]),
  externalSetup: z.enum(["none", "provider-installation", "manual-provider-app"]),
  createsExternalResources: z.boolean(),
  secretMaterialRequired: z.boolean(),
  description: z.string().optional(),
});

export const integrationDescriptorSchema = z.object({
  key: z.string(),
  title: z.string(),
  capabilities: z.array(z.string()),
  defaultConnectionModeKey: z.string().optional(),
  connectionModes: z.array(integrationConnectionModeSchema).optional(),
  setup: z
    .object({
      providerApp: z
        .object({
          installUrl: z.string().optional(),
          callbackUrl: z.string().optional(),
          webhookUrl: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  configuration: systemConfigurationSummarySchema.optional(),
});

export const connectionCategorySchema = z.object({
  key: z.enum([
    "source",
    "dns",
    "infrastructure",
    "notification",
    "billing",
    "identity",
    "observability",
    "storage",
  ]),
  title: z.string(),
  description: z.string(),
});

export const credentialGrantKindSchema = z.enum([
  "temporary-domain-connect",
  "limited-oauth-grant",
  "persistent-provider-credential",
  "provider-app-installation",
  "manual-secret-reference",
]);

export const connectorCapabilitySchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string().optional(),
  implemented: z.boolean(),
});

export const credentialGrantSchema = z.object({
  kind: credentialGrantKindSchema,
  title: z.string(),
  storesLongLivedSecret: z.boolean(),
  description: z.string().optional(),
});

export const connectorAvailabilitySchema = z.object({
  status: z.enum(["available", "setup-required", "unavailable", "deferred"]),
  diagnostics: z.array(systemConfigurationDiagnosticSchema),
});

export const connectorDescriptorSchema = z.object({
  key: z.string(),
  title: z.string(),
  category: connectionCategorySchema.shape.key,
  providerKey: z.string(),
  capabilities: z.array(connectorCapabilitySchema),
  grantKinds: z.array(credentialGrantSchema),
  availability: connectorAvailabilitySchema,
  visibility: z.enum(["catalog", "hidden-when-unavailable", "internal"]),
  setup: z
    .object({
      connectHref: z.string().optional(),
      documentationHref: z.string().optional(),
    })
    .optional(),
});

export const connectionOwnerSchema = z.object({
  scope: z.enum(["account", "organization", "project", "environment", "resource", "operator"]),
  id: z.string(),
});

export const connectionCredentialGrantSchema = z.object({
  kind: credentialGrantKindSchema,
  storage: z.enum(["none", "secret-ref", "provider-app", "ephemeral"]),
  redacted: z.literal(true),
  secretRef: z.string().optional(),
  externalAccountId: z.string().optional(),
  externalInstallationId: z.string().optional(),
  expiresAt: z.string().optional(),
});

export const connectionDiagnosticSchema = z.object({
  code: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string(),
});

export const connectionSchema = z.object({
  id: z.string(),
  connectorKey: z.string(),
  providerKey: z.string(),
  category: connectionCategorySchema.shape.key,
  owner: connectionOwnerSchema,
  displayName: z.string(),
  status: z.enum(["pending", "connected", "failed", "revoked"]),
  capabilities: z.array(z.string()),
  credentialGrant: connectionCredentialGrantSchema,
  diagnostics: z.array(connectionDiagnosticSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  revokedAt: z.string().optional(),
});

export const dnsRecordRequirementSchema = z.object({
  name: z.string(),
  type: z.enum(["A", "AAAA", "CNAME", "TXT"]),
  value: z.string(),
  ttl: z.number().int().positive().optional(),
  proxied: z.boolean().optional(),
  purpose: z.enum(["domain-routing", "domain-verification", "certificate-validation", "manual"]),
});

export const dnsRecordConflictSchema = z.object({
  name: z.string(),
  requestedType: dnsRecordRequirementSchema.shape.type,
  existingType: dnsRecordRequirementSchema.shape.type,
  reason: z.enum(["cname-exclusive", "different-value"]),
  existingValue: z.string(),
  requestedValue: z.string(),
});

export const dnsRecordPlanSchema = z.object({
  zoneName: z.string().optional(),
  records: z.array(dnsRecordRequirementSchema),
  conflicts: z.array(dnsRecordConflictSchema),
});

export const domainConnectSetupSchema = z.object({
  providerKey: z.string(),
  zoneName: z.string(),
  hostname: z.string(),
  serviceId: z.string(),
  templateId: z.string(),
  redirectUrl: z.string(),
  state: z.string(),
  records: z.array(dnsRecordRequirementSchema),
});

export const sourceRepositorySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  fullName: z.string(),
  ownerLogin: z.string(),
  private: z.boolean(),
  defaultBranch: z.string(),
  htmlUrl: z.string().optional(),
});

export const providerAppTokenLeaseSchema = z.object({
  providerKey: z.string(),
  installationId: z.string(),
  expiresAt: z.string(),
  redacted: z.literal(true),
  expired: z.boolean(),
  permissions: z.array(z.string()),
  repositoryFullNames: z.array(z.string()).optional(),
});

export const sourceRepositoryAccessSchema = z.object({
  providerKey: z.string(),
  installationId: z.string(),
  accountLogin: z.string().optional(),
  repositoriesSelection: z.enum(["all", "selected"]),
  repositories: z.array(sourceRepositorySummarySchema),
  tokenLease: providerAppTokenLeaseSchema,
});

export const infrastructureServerProposalSchema = z.object({
  providerKey: z.string(),
  region: z.string(),
  size: z.string(),
  image: z.string(),
  recommendedServerName: z.string(),
  osUser: z.string(),
  sshPort: z.number().int().positive(),
  sshPublicKeyRef: z.string().optional(),
  estimatedMonthlyCostUsd: z.number().nonnegative().optional(),
  costRiskLevel: z.enum(["low", "medium", "high"]),
  cleanupSupported: z.boolean(),
  notes: z.array(z.string()),
  tags: z.array(z.string()),
});

export const notificationMessageSchema = z.object({
  providerKey: z.string(),
  channelRef: z.string(),
  subject: z.string(),
  bodyPreview: z.string(),
  payloadSensitivity: z.enum(["normal", "sensitive"]),
  redactedFields: z.array(z.string()),
  metadata: z.record(z.string(), z.string()),
});

export const notificationMessageDeliverySchema = notificationMessageSchema.extend({
  providerMessageId: z.string(),
  status: z.enum(["sent", "skipped"]),
});

export const dnsRecordApplySchema = z.object({
  zoneName: z.string().optional(),
  status: z.enum(["applied", "verified", "cleaned-up", "conflict", "skipped"]),
  records: z.array(dnsRecordRequirementSchema),
  conflicts: z.array(dnsRecordConflictSchema),
  missingRecords: z.array(dnsRecordRequirementSchema),
  effects: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      description: z.string().optional(),
      providerRecordId: z.string().optional(),
      managed: z.boolean().optional(),
    }),
  ),
});

export const domainConnectApplySchema = domainConnectSetupSchema.extend({
  status: z.enum(["applied", "verified", "skipped"]),
  dnsRecords: dnsRecordApplySchema,
});

export const connectorCapabilityPlanPreviewSchema = z.object({
  planId: z.string(),
  connectorKey: z.string(),
  capabilityKey: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
  requiresExplicitAcceptance: z.boolean(),
  summary: z.string(),
  effects: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      description: z.string().optional(),
    }),
  ),
  cleanup: z
    .object({
      supported: z.boolean(),
      description: z.string().optional(),
    })
    .optional(),
  providerPlan: z
    .object({
      kind: z.string(),
      dnsRecords: dnsRecordPlanSchema.optional(),
      domainConnectSetup: domainConnectSetupSchema.optional(),
      infrastructureServerProposal: infrastructureServerProposalSchema.optional(),
      notificationMessage: notificationMessageSchema.optional(),
      sourceRepositoryAccess: sourceRepositoryAccessSchema.optional(),
    })
    .optional(),
});

export const acceptedConnectorCapabilityPlanSchema = z.object({
  acceptedPlanId: z.string(),
  planId: z.string(),
  connectorKey: z.string(),
  capabilityKey: z.string(),
  ownerRef: connectionOwnerSchema.optional(),
  acceptedBy: z.string(),
  acceptedAt: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
  summary: z.string(),
  effects: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      description: z.string().optional(),
    }),
  ),
  cleanup: z
    .object({
      supported: z.boolean(),
      description: z.string().optional(),
    })
    .optional(),
});

export const connectorCapabilityApplyResultSchema = z.object({
  operationId: z.string(),
  connectorKey: z.string(),
  capabilityKey: z.string(),
  status: z.enum(["applied", "verified", "cleaned-up", "conflict", "skipped"]),
  summary: z.string(),
  effects: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      description: z.string().optional(),
      providerRecordId: z.string().optional(),
      managed: z.boolean().optional(),
    }),
  ),
  providerResult: z
    .object({
      kind: z.string(),
      dnsRecords: dnsRecordApplySchema.optional(),
      domainConnectApply: domainConnectApplySchema.optional(),
      notificationDelivery: notificationMessageDeliverySchema.optional(),
    })
    .optional(),
});

export const listConnectorCategoriesResponseSchema = z.object({
  items: z.array(connectionCategorySchema),
});

export const listConnectorsResponseSchema = z.object({
  items: z.array(connectorDescriptorSchema),
});

export const listConnectionsResponseSchema = z.object({
  items: z.array(connectionSchema),
});

export const showConnectionResponseSchema = connectionSchema;

export const startConnectionResponseSchema = z.object({
  connection: connectionSchema,
  authorizationUrl: z.string().optional(),
  nextAction: z.enum([
    "already-connected",
    "authorize-in-browser",
    "provider-callback",
    "ready",
    "manual-secret-required",
  ]),
});

export const completeConnectionCallbackResponseSchema = z.object({
  connection: connectionSchema,
});

export const revokeConnectionResponseSchema = z.object({
  connection: connectionSchema,
});

export const connectorCapabilityPlanResponseSchema = connectorCapabilityPlanPreviewSchema;
export const acceptConnectorCapabilityPlanResponseSchema = acceptedConnectorCapabilityPlanSchema;
export const connectorCapabilityApplyResponseSchema = connectorCapabilityApplyResultSchema;

export const listProvidersResponseSchema = z.object({
  items: z.array(providerDescriptorSchema),
});

export const listIntegrationsResponseSchema = z.object({
  items: z.array(integrationDescriptorSchema),
});

export const listPluginsResponseSchema = z.object({
  items: z.array(pluginSummarySchema),
});

export const maintenanceWorkerActivationSchema = z.enum([
  "disabled-by-config",
  "starts-with-backend-service",
  "starts-as-standalone-process",
]);

export const maintenanceWorkerSafetyModeSchema = z.enum([
  "certificate-retry",
  "durable-process-delivery",
  "preview-expiry-cleanup",
  "preview-cleanup-retry",
  "runtime-execution",
  "policy-gated-prune",
  "policy-gated-retention",
  "read-only-collection",
]);

export const maintenanceWorkerRuntimeTopologySchema = z.object({
  mode: z.enum(["embedded", "standalone", "disabled"]),
  queueBackend: z.enum(["database", "external"]),
  workerCount: z.number().int().nonnegative(),
  workerGroup: z.string(),
  workerIds: z.array(z.string()),
  coordinationRole: z.enum(["coordinator", "worker", "disabled"]),
  slotAssignment: z.enum(["all-local", "explicit", "leased", "none"]).optional(),
  localWorkerIds: z.array(z.string()).optional(),
  workerSlot: z.number().int().positive().optional(),
  externalBackendKind: z.enum(["kafka", "temporal", "custom"]).optional(),
  heartbeat: z
    .object({
      staleAfterSeconds: z.number().int().positive(),
      onlineWorkerCount: z.number().int().nonnegative(),
      staleWorkerCount: z.number().int().nonnegative(),
      lastSeenAt: z.string().optional(),
      workers: z.array(
        z.object({
          workerId: z.string(),
          workerGroup: z.string(),
          slot: z.number().int().nonnegative(),
          status: z.enum(["online", "stopping"]),
          online: z.boolean(),
          lastSeenAt: z.string(),
        }),
      ),
    })
    .optional(),
});

export const maintenanceWorkerObservedRuntimeHeartbeatSchema = z.object({
  workerGroup: z.string(),
  workerCount: z.number().int().nonnegative(),
  workerIds: z.array(z.string()),
  heartbeat: maintenanceWorkerRuntimeTopologySchema.shape.heartbeat,
});

export const maintenanceWorkerStatusSchema = z.object({
  key: z.enum([
    "certificate-retry-scheduler",
    "durable-worker-runtime",
    "preview-expiry-cleanup-scheduler",
    "preview-cleanup-retry-scheduler",
    "scheduled-task-runner",
    "scheduled-runtime-prune-runner",
    "scheduled-history-retention-runner",
    "runtime-monitoring-collector-runner",
  ]),
  label: z.string(),
  enabled: z.boolean(),
  activation: maintenanceWorkerActivationSchema,
  safetyMode: maintenanceWorkerSafetyModeSchema,
  intervalSeconds: z.number().int().nonnegative(),
  batchSize: z.number().int().positive().optional(),
  defaultRetryDelaySeconds: z.number().int().positive().optional(),
  rawRetentionHours: z.number().int().positive().optional(),
  runtimeTopology: maintenanceWorkerRuntimeTopologySchema.optional(),
  observedRuntimeHeartbeats: z.array(maintenanceWorkerObservedRuntimeHeartbeatSchema).optional(),
  configurationKeys: z.array(z.string()),
  operationKeys: z.array(z.string()),
});

export const doctorResponseSchema = z.object({
  readiness: readinessResponseSchema,
  providers: z.array(providerDescriptorSchema),
  plugins: z.array(pluginSummarySchema),
  maintenanceWorkers: z.array(maintenanceWorkerStatusSchema),
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

export const githubAppConnectionResponseSchema = z.object({
  accountLogin: z.string().optional(),
  accountType: z.string().optional(),
  callbackUrl: z.string().optional(),
  configurationStatus: z.enum(["configured", "not-configured", "partial", "unknown"]),
  connected: z.boolean(),
  installUrl: z.string().optional(),
  installationId: z.string().optional(),
  repositoryCount: z.number().int().nonnegative().optional(),
  repositoriesSelection: z.enum(["all", "selected"]).optional(),
  suspendedAt: z.string().optional(),
  tenantId: z.string(),
  updatedAt: z.string().optional(),
  webhookUrl: z.string().optional(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
export type VersionResponse = z.infer<typeof versionResponseSchema>;
export type InstanceUpgradeCheckStatus = z.infer<typeof instanceUpgradeCheckStatusSchema>;
export type InstanceUpgradeCheckResponse = z.infer<typeof instanceUpgradeCheckResponseSchema>;
export type ApplyInstanceUpgradeInput = z.infer<typeof applyInstanceUpgradeInputSchema>;
export type InstanceUpgradeApplyResponse = z.infer<typeof instanceUpgradeApplyResponseSchema>;
export type AuthProviderStatus = z.infer<typeof authProviderStatusSchema>;
export type AuthPublicProviderStatus = z.infer<typeof authPublicProviderStatusSchema>;
export type AuthPublicConfig = z.infer<typeof authPublicConfigSchema>;
export type AuthAccountRecoveryStatus = z.infer<typeof authAccountRecoveryStatusSchema>;
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
export type AccountProfileResponse = z.infer<typeof accountProfileResponseSchema>;
export type AccountSessionSummary = z.infer<typeof accountSessionSummarySchema>;
export type ListAccountSessionsResponse = z.infer<typeof listAccountSessionsResponseSchema>;
export type RevokeAccountSessionResponse = z.infer<typeof revokeAccountSessionResponseSchema>;
export type DeleteAccountResponse = z.infer<typeof deleteAccountResponseSchema>;
export type GitHubRepositorySummary = z.infer<typeof githubRepositorySummarySchema>;
export type GitHubAppConnectionResponse = z.infer<typeof githubAppConnectionResponseSchema>;
export type IntegrationDescriptor = z.infer<typeof integrationDescriptorSchema>;
export type ConnectionCategory = z.infer<typeof connectionCategorySchema>;
export type CredentialGrantKind = z.infer<typeof credentialGrantKindSchema>;
export type ConnectorDescriptor = z.infer<typeof connectorDescriptorSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type ConnectionOwner = z.infer<typeof connectionOwnerSchema>;
export type ConnectionCredentialGrant = z.infer<typeof connectionCredentialGrantSchema>;
export type ListConnectionsResponse = z.infer<typeof listConnectionsResponseSchema>;
export type ShowConnectionResponse = z.infer<typeof showConnectionResponseSchema>;
export type StartConnectionResponse = z.infer<typeof startConnectionResponseSchema>;
export type CompleteConnectionCallbackResponse = z.infer<
  typeof completeConnectionCallbackResponseSchema
>;
export type RevokeConnectionResponse = z.infer<typeof revokeConnectionResponseSchema>;
export type DnsRecordRequirement = z.infer<typeof dnsRecordRequirementSchema>;
export type DnsRecordConflict = z.infer<typeof dnsRecordConflictSchema>;
export type DnsRecordPlan = z.infer<typeof dnsRecordPlanSchema>;
export type DnsRecordApply = z.infer<typeof dnsRecordApplySchema>;
export type DomainConnectSetup = z.infer<typeof domainConnectSetupSchema>;
export type DomainConnectApply = z.infer<typeof domainConnectApplySchema>;
export type SourceRepositorySummary = z.infer<typeof sourceRepositorySummarySchema>;
export type ProviderAppTokenLease = z.infer<typeof providerAppTokenLeaseSchema>;
export type SourceRepositoryAccess = z.infer<typeof sourceRepositoryAccessSchema>;
export type InfrastructureServerProposal = z.infer<typeof infrastructureServerProposalSchema>;
export type NotificationMessage = z.infer<typeof notificationMessageSchema>;
export type NotificationMessageDelivery = z.infer<typeof notificationMessageDeliverySchema>;
export type ConnectorCapabilityPlanPreview = z.infer<typeof connectorCapabilityPlanPreviewSchema>;
export type AcceptedConnectorCapabilityPlan = z.infer<typeof acceptedConnectorCapabilityPlanSchema>;
export type ConnectorCapabilityApplyResult = z.infer<typeof connectorCapabilityApplyResultSchema>;
export type PluginSummary = z.infer<typeof pluginSummarySchema>;
export type SystemPluginWebExtension = z.infer<typeof systemPluginWebExtensionSchema>;
export type MaintenanceWorkerActivation = z.infer<typeof maintenanceWorkerActivationSchema>;
export type MaintenanceWorkerSafetyMode = z.infer<typeof maintenanceWorkerSafetyModeSchema>;
export type MaintenanceWorkerStatus = z.infer<typeof maintenanceWorkerStatusSchema>;
export type DoctorResponse = z.infer<typeof doctorResponseSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type ShowProjectInput = z.infer<typeof showProjectInputSchema>;
export type RenameProjectInput = z.infer<typeof renameProjectInputSchema>;
export type ReorderProjectsInput = z.infer<typeof reorderProjectsInputSchema>;
export type SetProjectDescriptionInput = z.infer<typeof setProjectDescriptionInputSchema>;
export type ArchiveProjectInput = z.infer<typeof archiveProjectInputSchema>;
export type RestoreProjectInput = z.infer<typeof restoreProjectInputSchema>;
export type CheckProjectDeleteSafetyInput = z.infer<typeof checkProjectDeleteSafetyInputSchema>;
export type DeleteProjectInput = z.infer<typeof deleteProjectInputSchema>;
export type CreateProjectResponse = z.infer<typeof createProjectResponseSchema>;
export type CountResponse = z.infer<typeof countResponseSchema>;
export type ListProjectsResponse = z.infer<typeof listProjectsResponseSchema>;
export type ShowProjectResponse = z.infer<typeof showProjectResponseSchema>;
export type RenameProjectResponse = z.infer<typeof renameProjectResponseSchema>;
export type ReorderProjectsResponse = z.infer<typeof reorderProjectsResponseSchema>;
export type SetProjectDescriptionResponse = z.infer<typeof setProjectDescriptionResponseSchema>;
export type ArchiveProjectResponse = z.infer<typeof archiveProjectResponseSchema>;
export type RestoreProjectResponse = z.infer<typeof restoreProjectResponseSchema>;
export type CheckProjectDeleteSafetyResponse = z.infer<
  typeof checkProjectDeleteSafetyResponseSchema
>;
export type DeleteProjectResponse = z.infer<typeof deleteProjectResponseSchema>;
export type ServerSummary = z.infer<typeof serverSummarySchema>;
export type SshCredentialSummary = z.infer<typeof sshCredentialSummarySchema>;
export type SshCredentialUsageServer = z.infer<typeof sshCredentialUsageServerSchema>;
export type SshCredentialUsageSummary = z.infer<typeof sshCredentialUsageSummarySchema>;
export type SshCredentialDetail = z.infer<typeof sshCredentialDetailSchema>;
export type RegisterServerInput = z.infer<typeof registerServerInputSchema>;
export type ShowServerInput = z.infer<typeof showServerInputSchema>;
export type RenameServerInput = z.infer<typeof renameServerInputSchema>;
export type ReorderServersInput = z.infer<typeof reorderServersInputSchema>;
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
export type ReorderServersResponse = z.infer<typeof reorderServersResponseSchema>;
export type ServerDetail = z.infer<typeof serverDetailSchema>;
export type ShowServerResponse = z.infer<typeof showServerResponseSchema>;
export type InspectServerCapacityResponse = z.infer<typeof inspectServerCapacityResponseSchema>;
export type RuntimeUsageScope = z.infer<typeof runtimeUsageScopeSchema>;
export type RuntimeUsageFreshness = z.infer<typeof runtimeUsageFreshnessSchema>;
export type RuntimeUsageTotals = z.infer<typeof runtimeUsageTotalsSchema>;
export type RuntimeUsageOwnership = z.infer<typeof runtimeUsageOwnershipSchema>;
export type RuntimeUsageWarning = z.infer<typeof runtimeUsageWarningSchema>;
export type RuntimeUsageSourceError = z.infer<typeof runtimeUsageSourceErrorSchema>;
export type RuntimeUsageRollup = z.infer<typeof runtimeUsageRollupSchema>;
export type RuntimeUsageEvidence = z.infer<typeof runtimeUsageEvidenceSchema>;
export type RuntimeUsageArtifactKind = z.infer<typeof runtimeUsageArtifactKindSchema>;
export type RuntimeArtifactUsage = z.infer<typeof runtimeArtifactUsageSchema>;
export type InspectRuntimeUsageResponse = z.infer<typeof inspectRuntimeUsageResponseSchema>;
export type RuntimeMonitoringSignal = z.infer<typeof runtimeMonitoringSignalSchema>;
export type RuntimeMonitoringBucket = z.infer<typeof runtimeMonitoringBucketSchema>;
export type RuntimeMonitoringThresholdMetric = z.infer<
  typeof runtimeMonitoringThresholdMetricSchema
>;
export type RuntimeMonitoringRetentionSummary = z.infer<
  typeof runtimeMonitoringRetentionSummarySchema
>;
export type RuntimeMonitoringSafeLabels = z.infer<typeof runtimeMonitoringSafeLabelsSchema>;
export type RuntimeMonitoringScopeEvidence = z.infer<typeof runtimeMonitoringScopeEvidenceSchema>;
export type RuntimeMonitoringWarning = z.infer<typeof runtimeMonitoringWarningSchema>;
export type RuntimeMonitoringSourceError = z.infer<typeof runtimeMonitoringSourceErrorSchema>;
export type RuntimeMonitoringSample = z.infer<typeof runtimeMonitoringSampleSchema>;
export type RuntimeMonitoringSamplesResponse = z.infer<
  typeof runtimeMonitoringSamplesResponseSchema
>;
export type RuntimeMonitoringSeriesPoint = z.infer<typeof runtimeMonitoringSeriesPointSchema>;
export type RuntimeMonitoringSeries = z.infer<typeof runtimeMonitoringSeriesSchema>;
export type RuntimeMonitoringContributor = z.infer<typeof runtimeMonitoringContributorSchema>;
export type RuntimeMonitoringDeploymentMarker = z.infer<
  typeof runtimeMonitoringDeploymentMarkerSchema
>;
export type RuntimeMonitoringRollupResponse = z.infer<typeof runtimeMonitoringRollupResponseSchema>;
export type RuntimeMonitoringThresholdRule = z.infer<typeof runtimeMonitoringThresholdRuleSchema>;
export type RuntimeMonitoringThresholdPolicyRead = z.infer<
  typeof runtimeMonitoringThresholdPolicyReadSchema
>;
export type RuntimeMonitoringThresholdCrossing = z.infer<
  typeof runtimeMonitoringThresholdCrossingSchema
>;
export type RuntimeMonitoringThresholdEvaluation = z.infer<
  typeof runtimeMonitoringThresholdEvaluationSchema
>;
export type ConfigureRuntimeMonitoringThresholdsResponse = z.infer<
  typeof configureRuntimeMonitoringThresholdsResponseSchema
>;
export type RuntimeMonitoringThresholdsResponse = z.infer<
  typeof runtimeMonitoringThresholdsResponseSchema
>;
export type PruneServerCapacityResponse = z.infer<typeof pruneServerCapacityResponseSchema>;
export type ScheduledRuntimePrunePolicyScope = z.infer<
  typeof scheduledRuntimePrunePolicyScopeSchema
>;
export type ScheduledRuntimePrunePolicyRead = z.infer<typeof scheduledRuntimePrunePolicyReadSchema>;
export type ConfigureScheduledRuntimePrunePolicyResponse = z.infer<
  typeof configureScheduledRuntimePrunePolicyResponseSchema
>;
export type ListScheduledRuntimePrunePoliciesResponse = z.infer<
  typeof listScheduledRuntimePrunePoliciesResponseSchema
>;
export type ShowScheduledRuntimePrunePolicyResponse = z.infer<
  typeof showScheduledRuntimePrunePolicyResponseSchema
>;
export type DependencyResourceBackupPolicyRead = z.infer<
  typeof dependencyResourceBackupPolicyReadSchema
>;
export type ConfigureDependencyResourceBackupPolicyResponse = z.infer<
  typeof configureDependencyResourceBackupPolicyResponseSchema
>;
export type ListDependencyResourceBackupPoliciesResponse = z.infer<
  typeof listDependencyResourceBackupPoliciesResponseSchema
>;
export type ShowDependencyResourceBackupPolicyResponse = z.infer<
  typeof showDependencyResourceBackupPolicyResponseSchema
>;
export type RetentionDefaultScope = z.infer<typeof retentionDefaultScopeSchema>;
export type RetentionDefaultCategory = z.infer<typeof retentionDefaultCategorySchema>;
export type RetentionDefaultRead = z.infer<typeof retentionDefaultReadSchema>;
export type ConfigureRetentionDefaultsResponse = z.infer<
  typeof configureRetentionDefaultsResponseSchema
>;
export type ListRetentionDefaultsResponse = z.infer<typeof listRetentionDefaultsResponseSchema>;
export type ShowRetentionDefaultResponse = z.infer<typeof showRetentionDefaultResponseSchema>;
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
export type PrepareServerRuntimeResponse = z.infer<typeof prepareServerRuntimeResponseSchema>;
export type EnvironmentSummary = z.infer<typeof environmentSummarySchema>;
export type EnvironmentEffectivePrecedence = z.infer<typeof environmentEffectivePrecedenceSchema>;
export type ResourceAccessRouteSummary = z.infer<typeof resourceAccessRouteSummarySchema>;
export type PlannedResourceAccessRouteSummary = z.infer<
  typeof plannedResourceAccessRouteSummarySchema
>;
export type ResourceStaticArtifactAccessRouteSummary = z.infer<
  typeof resourceStaticArtifactAccessRouteSummarySchema
>;
export type ResourceAccessFailureDiagnostic = z.infer<typeof resourceAccessFailureDiagnosticSchema>;
export type AppliedRouteContextMetadata = z.infer<typeof appliedRouteContextMetadataSchema>;
export type ResourceAccessFailureEvidenceLookup = z.infer<
  typeof resourceAccessFailureEvidenceLookupSchema
>;
export type ResourceAccessSummary = z.infer<typeof resourceAccessSummarySchema>;
export type ResourceAccessProfile = z.infer<typeof resourceAccessProfileSchema>;
export type ResourceHealthOverall = z.infer<typeof resourceHealthOverallSchema>;
export type RouteAccessBlockingReason = z.infer<typeof routeAccessBlockingReasonSchema>;
export type RouteIntentStatusDescriptor = z.infer<typeof routeIntentStatusDescriptorSchema>;
export type ResourceHealthSummary = z.infer<typeof resourceHealthSummarySchema>;
export type ResourceHealthHistoryInput = z.infer<typeof resourceHealthHistoryInputSchema>;
export type ResourceHealthHistoryObservation = z.infer<
  typeof resourceHealthHistoryObservationSchema
>;
export type ResourceHealthHistory = z.infer<typeof resourceHealthHistorySchema>;
export type ResourceSummary = z.infer<typeof resourceSummarySchema>;
export type ResourceDetail = z.infer<typeof resourceDetailSchema>;
export type ResourceStorageAttachmentSummary = z.infer<
  typeof resourceStorageAttachmentSummarySchema
>;
export type StorageVolumeSummary = z.infer<typeof storageVolumeSummarySchema>;
export type DependencyResourceConnectionSummary = z.infer<
  typeof dependencyResourceConnectionSummarySchema
>;
export type DependencyResourceBindingReadinessSummary = z.infer<
  typeof dependencyResourceBindingReadinessSummarySchema
>;
export type DependencyResourceBackupRelationship = z.infer<
  typeof dependencyResourceBackupRelationshipSchema
>;
export type DependencyResourceDeleteBlocker = z.infer<typeof dependencyResourceDeleteBlockerSchema>;
export type DependencyResourceSummary = z.infer<typeof dependencyResourceSummarySchema>;
export type DependencyResourceRestoreAttemptSummary = z.infer<
  typeof dependencyResourceRestoreAttemptSummarySchema
>;
export type DependencyResourceBackupSummary = z.infer<typeof dependencyResourceBackupSummarySchema>;
export type DependencyResourceProvisioningPlan = z.infer<
  typeof dependencyResourceProvisioningPlanSchema
>;
export type ResourceDependencyBindingSummary = z.infer<
  typeof resourceDependencyBindingSummarySchema
>;
export type ResourceConfigEntry = z.infer<typeof resourceConfigEntrySchema>;
export type ResourceConfigOverrideSummary = z.infer<typeof resourceConfigOverrideSummarySchema>;
export type ResourceEffectiveConfig = z.infer<typeof resourceEffectiveConfigSchema>;
export type ResourceSecretReferenceSummary = z.infer<typeof resourceSecretReferenceSummarySchema>;
export type ShowResourceInput = z.infer<typeof showResourceInputSchema>;
export type ShowResourceResponse = z.infer<typeof showResourceResponseSchema>;
export type ResourceSourceBindingInput = z.infer<typeof resourceSourceBindingInputSchema>;
export type ResourceRuntimeProfileInput = z.infer<typeof resourceRuntimeProfileInputSchema>;
export type CreateResourceInput = z.infer<typeof createResourceInputSchema>;
export type CreateResourceResponse = z.infer<typeof createResourceResponseSchema>;
export type PublishStaticArtifactResponse = z.infer<typeof publishStaticArtifactResponseSchema>;
export type ListStaticArtifactPublicationsResponse = z.infer<
  typeof listStaticArtifactPublicationsResponseSchema
>;
export type ArchiveResourceInput = z.infer<typeof archiveResourceInputSchema>;
export type ArchiveResourceResponse = z.infer<typeof archiveResourceResponseSchema>;
export type RestoreResourceInput = z.infer<typeof restoreResourceInputSchema>;
export type RestoreResourceResponse = z.infer<typeof restoreResourceResponseSchema>;
export type CheckResourceDeleteSafetyInput = z.infer<typeof checkResourceDeleteSafetyInputSchema>;
export type ResourceDeleteBlocker = z.infer<typeof resourceDeleteBlockerSchema>;
export type ResourceDeleteSafety = z.infer<typeof resourceDeleteSafetySchema>;
export type CheckResourceDeleteSafetyResponse = z.infer<
  typeof checkResourceDeleteSafetyResponseSchema
>;
export type DeleteResourceInput = z.infer<typeof deleteResourceInputSchema>;
export type DeleteResourceResponse = z.infer<typeof deleteResourceResponseSchema>;
export type ConfigureResourceHealthInput = z.infer<typeof configureResourceHealthInputSchema>;
export type ConfigureResourceHealthResponse = z.infer<typeof configureResourceHealthResponseSchema>;
export type ResetResourceHealthInput = z.infer<typeof resetResourceHealthInputSchema>;
export type ResetResourceHealthResponse = z.infer<typeof resetResourceHealthResponseSchema>;
export type ConfigureResourceNetworkInput = z.infer<typeof configureResourceNetworkInputSchema>;
export type ConfigureResourceNetworkResponse = z.infer<
  typeof configureResourceNetworkResponseSchema
>;
export type ConfigureResourceAccessInput = z.infer<typeof configureResourceAccessInputSchema>;
export type ConfigureResourceAccessResponse = z.infer<typeof configureResourceAccessResponseSchema>;
export type ConfigureResourceAutoDeployInput = z.infer<
  typeof configureResourceAutoDeployInputSchema
>;
export type ConfigureResourceAutoDeployResponse = z.infer<
  typeof configureResourceAutoDeployResponseSchema
>;
export type SourceEventListItem = z.infer<typeof sourceEventListItemSchema>;
export type ListSourceEventsInput = z.infer<typeof listSourceEventsInputSchema>;
export type ListSourceEventsResponse = z.infer<typeof listSourceEventsResponseSchema>;
export type SourceEventIdentity = z.infer<typeof sourceEventIdentitySchema>;
export type SourceEventVerificationSummary = z.infer<typeof sourceEventVerificationSummarySchema>;
export type SourceEventPolicyResult = z.infer<typeof sourceEventPolicyResultSchema>;
export type ShowSourceEventInput = z.infer<typeof showSourceEventInputSchema>;
export type ShowSourceEventResponse = z.infer<typeof showSourceEventResponseSchema>;
export type ReplaySourceEventInput = z.infer<typeof replaySourceEventInputSchema>;
export type ReplaySourceEventResponse = z.infer<typeof replaySourceEventResponseSchema>;
export type PruneSourceEventsInput = z.infer<typeof pruneSourceEventsInputSchema>;
export type PruneSourceEventsResponse = z.infer<typeof pruneSourceEventsResponseSchema>;
export type PreviewEnvironmentStatus = z.infer<typeof previewEnvironmentStatusSchema>;
export type PreviewEnvironmentSourceSummary = z.infer<typeof previewEnvironmentSourceSummarySchema>;
export type PreviewEnvironmentSummary = z.infer<typeof previewEnvironmentSummarySchema>;
export type ListPreviewEnvironmentsResponse = z.infer<typeof listPreviewEnvironmentsResponseSchema>;
export type ShowPreviewEnvironmentResponse = z.infer<typeof showPreviewEnvironmentResponseSchema>;
export type DeletePreviewEnvironmentResponse = z.infer<
  typeof deletePreviewEnvironmentResponseSchema
>;
export type PreviewPolicyScope = z.infer<typeof previewPolicyScopeSchema>;
export type PreviewPolicySettings = z.infer<typeof previewPolicySettingsSchema>;
export type PreviewPolicySummary = z.infer<typeof previewPolicySummarySchema>;
export type ConfigurePreviewPolicyResponse = z.infer<typeof configurePreviewPolicyResponseSchema>;
export type ShowPreviewPolicyResponse = z.infer<typeof showPreviewPolicyResponseSchema>;
export type AttachResourceStorageInput = z.infer<typeof attachResourceStorageInputSchema>;
export type AttachResourceStorageResponse = z.infer<typeof attachResourceStorageResponseSchema>;
export type DetachResourceStorageInput = z.infer<typeof detachResourceStorageInputSchema>;
export type DetachResourceStorageResponse = z.infer<typeof detachResourceStorageResponseSchema>;
export type ConfigureResourceRuntimeInput = z.infer<typeof configureResourceRuntimeInputSchema>;
export type ConfigureResourceRuntimeResponse = z.infer<
  typeof configureResourceRuntimeResponseSchema
>;
export type ConfigureResourceSourceInput = z.infer<typeof configureResourceSourceInputSchema>;
export type ConfigureResourceSourceResponse = z.infer<typeof configureResourceSourceResponseSchema>;
export type SetResourceVariableInput = z.infer<typeof setResourceVariableInputSchema>;
export type SetResourceVariableResponse = z.infer<typeof setResourceVariableResponseSchema>;
export type CreateResourceSecretReferenceInput = z.infer<
  typeof createResourceSecretReferenceInputSchema
>;
export type CreateResourceSecretReferenceResponse = z.infer<
  typeof createResourceSecretReferenceResponseSchema
>;
export type RotateResourceSecretReferenceInput = z.infer<
  typeof rotateResourceSecretReferenceInputSchema
>;
export type RotateResourceSecretReferenceResponse = z.infer<
  typeof rotateResourceSecretReferenceResponseSchema
>;
export type DeleteResourceSecretReferenceInput = z.infer<
  typeof deleteResourceSecretReferenceInputSchema
>;
export type DeleteResourceSecretReferenceResponse = z.infer<
  typeof deleteResourceSecretReferenceResponseSchema
>;
export type ListResourceSecretReferencesInput = z.infer<
  typeof listResourceSecretReferencesInputSchema
>;
export type ListResourceSecretReferencesResponse = z.infer<
  typeof listResourceSecretReferencesResponseSchema
>;
export type ShowResourceSecretReferenceInput = z.infer<
  typeof showResourceSecretReferenceInputSchema
>;
export type ShowResourceSecretReferenceResponse = z.infer<
  typeof showResourceSecretReferenceResponseSchema
>;
export type ImportResourceVariablesInput = z.infer<typeof importResourceVariablesInputSchema>;
export type ImportResourceVariablesResponse = z.infer<typeof importResourceVariablesResponseSchema>;
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
export type CreateStorageVolumeInput = z.infer<typeof createStorageVolumeInputSchema>;
export type CreateStorageVolumeResponse = z.infer<typeof createStorageVolumeResponseSchema>;
export type ListStorageVolumesInput = z.infer<typeof listStorageVolumesInputSchema>;
export type ListStorageVolumesResponse = z.infer<typeof listStorageVolumesResponseSchema>;
export type ShowStorageVolumeInput = z.infer<typeof showStorageVolumeInputSchema>;
export type ShowStorageVolumeResponse = z.infer<typeof showStorageVolumeResponseSchema>;
export type StorageVolumeBackupPlanResponse = z.infer<typeof storageVolumeBackupPlanResponseSchema>;
export type CreateStorageVolumeBackupResponse = z.infer<
  typeof createStorageVolumeBackupResponseSchema
>;
export type StorageVolumeBackupSummary = z.infer<typeof storageVolumeBackupSummarySchema>;
export type ListStorageVolumeBackupsResponse = z.infer<
  typeof listStorageVolumeBackupsResponseSchema
>;
export type ShowStorageVolumeBackupResponse = z.infer<typeof showStorageVolumeBackupResponseSchema>;
export type StorageVolumeRestorePlanResponse = z.infer<
  typeof storageVolumeRestorePlanResponseSchema
>;
export type RestoreStorageVolumeBackupResponse = z.infer<
  typeof restoreStorageVolumeBackupResponseSchema
>;
export type PruneStorageVolumeBackupResponse = z.infer<
  typeof pruneStorageVolumeBackupResponseSchema
>;
export type RenameStorageVolumeInput = z.infer<typeof renameStorageVolumeInputSchema>;
export type RenameStorageVolumeResponse = z.infer<typeof renameStorageVolumeResponseSchema>;
export type DeleteStorageVolumeInput = z.infer<typeof deleteStorageVolumeInputSchema>;
export type DeleteStorageVolumeResponse = z.infer<typeof deleteStorageVolumeResponseSchema>;
export type CleanupStorageVolumeRuntimeInput = z.infer<
  typeof cleanupStorageVolumeRuntimeInputSchema
>;
export type CleanupStorageVolumeRuntimeResponse = z.infer<
  typeof cleanupStorageVolumeRuntimeResponseSchema
>;
export type DependencyResourceResponse = z.infer<typeof dependencyResourceResponseSchema>;
export type DependencyResourceProvisioningPlanResponse = z.infer<
  typeof dependencyResourceProvisioningPlanResponseSchema
>;
export type ListDependencyResourcesResponse = z.infer<typeof listDependencyResourcesResponseSchema>;
export type ShowDependencyResourceResponse = z.infer<typeof showDependencyResourceResponseSchema>;
export type ListDependencyResourceBackupsResponse = z.infer<
  typeof listDependencyResourceBackupsResponseSchema
>;
export type ShowDependencyResourceBackupResponse = z.infer<
  typeof showDependencyResourceBackupResponseSchema
>;
export type BindResourceDependencyResponse = z.infer<typeof bindResourceDependencyResponseSchema>;
export type UnbindResourceDependencyResponse = z.infer<
  typeof unbindResourceDependencyResponseSchema
>;
export type RotateResourceDependencyBindingSecretResponse = z.infer<
  typeof rotateResourceDependencyBindingSecretResponseSchema
>;
export type ListResourceDependencyBindingsResponse = z.infer<
  typeof listResourceDependencyBindingsResponseSchema
>;
export type ShowResourceDependencyBindingResponse = z.infer<
  typeof showResourceDependencyBindingResponseSchema
>;
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
export type ShowDomainBindingInput = z.infer<typeof showDomainBindingInputSchema>;
export type ShowDomainBindingResponse = z.infer<typeof showDomainBindingResponseSchema>;
export type DomainBindingDeleteBlocker = z.infer<typeof domainBindingDeleteBlockerSchema>;
export type DomainBindingDeleteSafety = z.infer<typeof domainBindingDeleteSafetySchema>;
export type DeployTokenScopeSummary = z.infer<typeof deployTokenScopeSummarySchema>;
export type DeployTokenSummary = z.infer<typeof deployTokenSummarySchema>;
export type CreateDeployTokenResponse = z.infer<typeof createDeployTokenResponseSchema>;
export type ListDeployTokensResponse = z.infer<typeof listDeployTokensResponseSchema>;
export type ShowDeployTokenResponse = z.infer<typeof showDeployTokenResponseSchema>;
export type RotateDeployTokenResponse = z.infer<typeof rotateDeployTokenResponseSchema>;
export type RevokeDeployTokenResponse = z.infer<typeof revokeDeployTokenResponseSchema>;
export type OrganizationTeamRole = z.infer<typeof organizationTeamRoleSchema>;
export type OrganizationInvitationStatus = z.infer<typeof organizationInvitationStatusSchema>;
export type ProductLoginMethodStatus = z.infer<typeof productLoginMethodStatusSchema>;
export type OrganizationCurrentUserSummary = z.infer<typeof organizationCurrentUserSummarySchema>;
export type OrganizationContextOrganizationSummary = z.infer<
  typeof organizationContextOrganizationSummarySchema
>;
export type OrganizationContextPermissions = z.infer<typeof organizationContextPermissionsSchema>;
export type CurrentOrganizationContextResponse = z.infer<
  typeof currentOrganizationContextResponseSchema
>;
export type OrganizationProfileResponse = z.infer<typeof organizationProfileResponseSchema>;
export type OrganizationMemberSummary = z.infer<typeof organizationMemberSummarySchema>;
export type OrganizationInvitationSummary = z.infer<typeof organizationInvitationSummarySchema>;
export type ListOrganizationMembersResponse = z.infer<typeof listOrganizationMembersResponseSchema>;
export type ListOrganizationInvitationsResponse = z.infer<
  typeof listOrganizationInvitationsResponseSchema
>;
export type InviteOrganizationMemberResponse = z.infer<
  typeof inviteOrganizationMemberResponseSchema
>;
export type ChangeOrganizationMemberRoleResponse = z.infer<
  typeof changeOrganizationMemberRoleResponseSchema
>;
export type RemoveOrganizationMemberResponse = z.infer<
  typeof removeOrganizationMemberResponseSchema
>;
export type ReactivateOrganizationMemberResponse = z.infer<
  typeof reactivateOrganizationMemberResponseSchema
>;
export type TransferOrganizationOwnerResponse = z.infer<
  typeof transferOrganizationOwnerResponseSchema
>;
export type DeleteOrganizationResponse = z.infer<typeof deleteOrganizationResponseSchema>;
export type ConfigureDomainBindingRouteInput = z.infer<
  typeof configureDomainBindingRouteInputSchema
>;
export type ConfigureDomainBindingRouteResponse = z.infer<
  typeof configureDomainBindingRouteResponseSchema
>;
export type CheckDomainBindingDeleteSafetyInput = z.infer<
  typeof checkDomainBindingDeleteSafetyInputSchema
>;
export type CheckDomainBindingDeleteSafetyResponse = z.infer<
  typeof checkDomainBindingDeleteSafetyResponseSchema
>;
export type DeleteDomainBindingInput = z.infer<typeof deleteDomainBindingInputSchema>;
export type DeleteDomainBindingResponse = z.infer<typeof deleteDomainBindingResponseSchema>;
export type RetryDomainBindingVerificationInput = z.infer<
  typeof retryDomainBindingVerificationInputSchema
>;
export type RetryDomainBindingVerificationResponse = z.infer<
  typeof retryDomainBindingVerificationResponseSchema
>;
export type IssueOrRenewCertificateInput = z.infer<typeof issueOrRenewCertificateInputSchema>;
export type IssueOrRenewCertificateResponse = z.infer<typeof issueOrRenewCertificateResponseSchema>;
export type ImportCertificateInput = z.infer<typeof importCertificateInputSchema>;
export type ImportCertificateResponse = z.infer<typeof importCertificateResponseSchema>;
export type CertificateAttemptSummary = z.infer<typeof certificateAttemptSummarySchema>;
export type CertificateSummary = z.infer<typeof certificateSummarySchema>;
export type ListCertificatesResponse = z.infer<typeof listCertificatesResponseSchema>;
export type ShowCertificateResponse = z.infer<typeof showCertificateResponseSchema>;
export type RetryCertificateResponse = z.infer<typeof retryCertificateResponseSchema>;
export type RevokeCertificateResponse = z.infer<typeof revokeCertificateResponseSchema>;
export type DeleteCertificateResponse = z.infer<typeof deleteCertificateResponseSchema>;
export type SetEnvironmentVariableInput = z.infer<typeof setEnvironmentVariableInputSchema>;
export type PromoteEnvironmentInput = z.infer<typeof promoteEnvironmentInputSchema>;
export type PromoteEnvironmentResponse = z.infer<typeof promoteEnvironmentResponseSchema>;
export type EnvironmentEffectivePrecedenceResponse = z.infer<
  typeof environmentEffectivePrecedenceResponseSchema
>;
export type DiffEnvironmentResponse = z.infer<typeof diffEnvironmentResponseSchema>;
export type DeploymentSummary = z.infer<typeof deploymentSummarySchema>;
export type SourceVersion = z.infer<typeof sourceVersionSchema>;
export type DeploymentProgressEvent = z.infer<typeof deploymentProgressEventSchema>;
export type DeploymentResourceInput = z.infer<typeof deploymentResourceInputSchema>;
export type CreateDeploymentInput = z.infer<typeof createDeploymentInputSchema>;
export type CreateDeploymentResponse = z.infer<typeof createDeploymentResponseSchema>;
export type CleanupPreviewResponse = z.infer<typeof cleanupPreviewResponseSchema>;
export type RetryDeploymentInput = z.infer<typeof retryDeploymentInputSchema>;
export type RetryDeploymentResponse = z.infer<typeof retryDeploymentResponseSchema>;
export type RedeployDeploymentInput = z.infer<typeof redeployDeploymentInputSchema>;
export type RedeployDeploymentResponse = z.infer<typeof redeployDeploymentResponseSchema>;
export type RollbackDeploymentInput = z.infer<typeof rollbackDeploymentInputSchema>;
export type RollbackDeploymentResponse = z.infer<typeof rollbackDeploymentResponseSchema>;
export type CancelDeploymentInput = z.infer<typeof cancelDeploymentInputSchema>;
export type CancelDeploymentResponse = z.infer<typeof cancelDeploymentResponseSchema>;
export type ArchiveDeploymentInput = z.infer<typeof archiveDeploymentInputSchema>;
export type ArchiveDeploymentResponse = z.infer<typeof archiveDeploymentResponseSchema>;
export type PruneDeploymentsInput = z.infer<typeof pruneDeploymentsInputSchema>;
export type PruneDeploymentsResponse = z.infer<typeof pruneDeploymentsResponseSchema>;
export type StopResourceRuntimeInput = z.infer<typeof stopResourceRuntimeInputSchema>;
export type StopResourceRuntimeResponse = z.infer<typeof stopResourceRuntimeResponseSchema>;
export type StartResourceRuntimeInput = z.infer<typeof startResourceRuntimeInputSchema>;
export type StartResourceRuntimeResponse = z.infer<typeof startResourceRuntimeResponseSchema>;
export type RestartResourceRuntimeInput = z.infer<typeof restartResourceRuntimeInputSchema>;
export type RestartResourceRuntimeResponse = z.infer<typeof restartResourceRuntimeResponseSchema>;
export type ListDeploymentsResponse = z.infer<typeof listDeploymentsResponseSchema>;
export type OperatorWorkKind = z.infer<typeof operatorWorkKindSchema>;
export type OperatorWorkStatus = z.infer<typeof operatorWorkStatusSchema>;
export type OperatorWorkNextAction = z.infer<typeof operatorWorkNextActionSchema>;
export type OperatorWorkItem = z.infer<typeof operatorWorkItemSchema>;
export type OperatorWorkEvent = z.infer<typeof operatorWorkEventSchema>;
export type OperatorWorkEventStreamStatusKind = z.infer<
  typeof operatorWorkEventStreamStatusKindSchema
>;
export type OperatorWorkObservedEvent = z.infer<typeof operatorWorkObservedEventSchema>;
export type OperatorWorkEventStreamGap = z.infer<typeof operatorWorkEventStreamGapSchema>;
export type OperatorWorkEventStreamEnvelope = z.infer<typeof operatorWorkEventStreamEnvelopeSchema>;
export type OperatorWorkEventStreamResponse = z.infer<typeof operatorWorkEventStreamResponseSchema>;
export type OperatorWorkEventStreamStreamResponse = z.infer<
  typeof operatorWorkEventStreamStreamResponseSchema
>;
export type ListOperatorWorkResponse = z.infer<typeof listOperatorWorkResponseSchema>;
export type ShowOperatorWorkResponse = z.infer<typeof showOperatorWorkResponseSchema>;
export type RetryOperatorWorkResponse = z.infer<typeof retryOperatorWorkResponseSchema>;
export type PruneOperatorWorkResponse = z.infer<typeof pruneOperatorWorkResponseSchema>;
export type ExportAuditEventsResponse = z.infer<typeof exportAuditEventsResponseSchema>;
export type ExportGlobalAuditEventsResponse = z.infer<typeof exportGlobalAuditEventsResponseSchema>;
export type PruneAuditEventsResponse = z.infer<typeof pruneAuditEventsResponseSchema>;
export type AuditEventArchive = z.infer<typeof auditEventArchiveSchema>;
export type AuditEventArchiveResponse = z.infer<typeof auditEventArchiveResponseSchema>;
export type ListAuditEventArchivesResponse = z.infer<typeof listAuditEventArchivesResponseSchema>;
export type ShowAuditEventArchiveResponse = z.infer<typeof showAuditEventArchiveResponseSchema>;
export type PruneAuditEventArchivesResponse = z.infer<typeof pruneAuditEventArchivesResponseSchema>;
export type AuditEventLegalHold = z.infer<typeof auditEventLegalHoldSchema>;
export type AuditEventLegalHoldResponse = z.infer<typeof auditEventLegalHoldResponseSchema>;
export type ListAuditEventLegalHoldsResponse = z.infer<
  typeof listAuditEventLegalHoldsResponseSchema
>;
export type ShowAuditEventLegalHoldResponse = z.infer<typeof showAuditEventLegalHoldResponseSchema>;
export type PruneProviderJobLogsResponse = z.infer<typeof pruneProviderJobLogsResponseSchema>;
export type PruneDomainEventsResponse = z.infer<typeof pruneDomainEventsResponseSchema>;
export type DeploymentDetailSummary = z.infer<typeof deploymentDetailSummarySchema>;
export type DeploymentRelatedContext = z.infer<typeof deploymentRelatedContextSchema>;
export type DeploymentDetailSectionError = z.infer<typeof deploymentDetailSectionErrorSchema>;
export type DeploymentAttemptStatusSummary = z.infer<typeof deploymentAttemptStatusSummarySchema>;
export type DeploymentAttemptTimeline = z.infer<typeof deploymentAttemptTimelineSchema>;
export type DeploymentAttemptSnapshot = z.infer<typeof deploymentAttemptSnapshotSchema>;
export type DeploymentAttemptFailureSummary = z.infer<typeof deploymentAttemptFailureSummarySchema>;
export type DeploymentRecoveryReasonCode = z.infer<typeof deploymentRecoveryReasonCodeSchema>;
export type DeploymentRecoveryReadinessReason = z.infer<
  typeof deploymentRecoveryReadinessReasonSchema
>;
export type DeploymentRecoveryActionReadiness = z.infer<
  typeof deploymentRecoveryActionReadinessSchema
>;
export type RollbackCandidateReadiness = z.infer<typeof rollbackCandidateReadinessSchema>;
export type DeploymentRecoveryRecommendedAction = z.infer<
  typeof deploymentRecoveryRecommendedActionSchema
>;
export type DeploymentRecoveryReadinessInput = z.infer<
  typeof deploymentRecoveryReadinessInputSchema
>;
export type DeploymentRecoveryReadinessResponse = z.infer<
  typeof deploymentRecoveryReadinessResponseSchema
>;
export type DeploymentPlanInput = z.infer<typeof deploymentPlanInputSchema>;
export type DeploymentPlanReasonCode = z.infer<typeof deploymentPlanReasonCodeSchema>;
export type DeploymentPlanReason = z.infer<typeof deploymentPlanReasonSchema>;
export type DeploymentPlanResponse = z.infer<typeof deploymentPlanResponseSchema>;
export type DeploymentAttemptRecoverySummary = z.infer<
  typeof deploymentAttemptRecoverySummarySchema
>;
export type ShowDeploymentInput = z.infer<typeof showDeploymentInputSchema>;
export type ShowDeploymentResponse = z.infer<typeof showDeploymentResponseSchema>;
export type DeploymentTimelineEntry = z.infer<typeof deploymentTimelineEntrySchema>;
export type DeploymentTimelineEnvelope = z.infer<typeof deploymentTimelineEnvelopeSchema>;
export type DeploymentTimelineResponse = z.infer<typeof deploymentTimelineResponseSchema>;
export type DeploymentTimelineStreamResponse = z.infer<
  typeof deploymentTimelineStreamResponseSchema
>;
export type ScheduledTaskRunStatus = z.infer<typeof scheduledTaskRunStatusSchema>;
export type ScheduledTaskRunTriggerKind = z.infer<typeof scheduledTaskRunTriggerKindSchema>;
export type ScheduledTaskRunSummary = z.infer<typeof scheduledTaskRunSummarySchema>;
export type ScheduledTaskDefinitionSummary = z.infer<typeof scheduledTaskDefinitionSummarySchema>;
export type ScheduledTaskCommandResponse = z.infer<typeof scheduledTaskCommandResponseSchema>;
export type DeleteScheduledTaskResponse = z.infer<typeof deleteScheduledTaskResponseSchema>;
export type RunScheduledTaskNowResponse = z.infer<typeof runScheduledTaskNowResponseSchema>;
export type ListScheduledTasksResponse = z.infer<typeof listScheduledTasksResponseSchema>;
export type ShowScheduledTaskResponse = z.infer<typeof showScheduledTaskResponseSchema>;
export type ListScheduledTaskRunsResponse = z.infer<typeof listScheduledTaskRunsResponseSchema>;
export type ShowScheduledTaskRunResponse = z.infer<typeof showScheduledTaskRunResponseSchema>;
export type ScheduledTaskRunLogEntry = z.infer<typeof scheduledTaskRunLogEntrySchema>;
export type ScheduledTaskRunLogsResponse = z.infer<typeof scheduledTaskRunLogsResponseSchema>;
export type DomainErrorResponse = z.infer<typeof domainErrorResponseSchema>;
export type ResourceRuntimeLogLine = z.infer<typeof resourceRuntimeLogLineSchema>;
export type ResourceRuntimeLogEvent = z.infer<typeof resourceRuntimeLogEventSchema>;
export type ResourceRuntimeLogsResponse = z.infer<typeof resourceRuntimeLogsResponseSchema>;
export type ResourceRuntimeLogsStreamResponse = z.infer<
  typeof resourceRuntimeLogsStreamResponseSchema
>;
export type ResourceRuntimeLogArchiveSummary = z.infer<
  typeof resourceRuntimeLogArchiveSummarySchema
>;
export type ResourceRuntimeLogArchiveDetail = z.infer<typeof resourceRuntimeLogArchiveDetailSchema>;
export type ArchiveResourceRuntimeLogsResponse = z.infer<
  typeof archiveResourceRuntimeLogsResponseSchema
>;
export type ListResourceRuntimeLogArchivesResponse = z.infer<
  typeof listResourceRuntimeLogArchivesResponseSchema
>;
export type ShowResourceRuntimeLogArchiveResponse = z.infer<
  typeof showResourceRuntimeLogArchiveResponseSchema
>;
export type PruneResourceRuntimeLogArchivesResponse = z.infer<
  typeof pruneResourceRuntimeLogArchivesResponseSchema
>;
export type PruneResourceRuntimeControlAttemptsResponse = z.infer<
  typeof pruneResourceRuntimeControlAttemptsResponseSchema
>;
export type TerminalSessionDescriptor = z.infer<typeof terminalSessionDescriptorSchema>;
export type TerminalSessionSummary = z.infer<typeof terminalSessionSummarySchema>;
export type ListTerminalSessionsResponse = z.infer<typeof listTerminalSessionsResponseSchema>;
export type ShowTerminalSessionResponse = z.infer<typeof showTerminalSessionResponseSchema>;
export type CloseTerminalSessionResponse = z.infer<typeof closeTerminalSessionResponseSchema>;
export type ExpireTerminalSessionsResponse = z.infer<typeof expireTerminalSessionsResponseSchema>;
export type TerminalSessionFrame = z.infer<typeof terminalSessionFrameSchema>;
export type ResourceDiagnosticSummary = z.infer<typeof resourceDiagnosticSummarySchema>;
export type ProxyConfigurationView = z.infer<typeof proxyConfigurationViewSchema>;
export type ListConnectorCategoriesResponse = z.infer<typeof listConnectorCategoriesResponseSchema>;
export type ListConnectorsResponse = z.infer<typeof listConnectorsResponseSchema>;
export type ConnectorCapabilityPlanResponse = z.infer<typeof connectorCapabilityPlanResponseSchema>;
export type AcceptConnectorCapabilityPlanResponse = z.infer<
  typeof acceptConnectorCapabilityPlanResponseSchema
>;
export type ConnectorCapabilityApplyResponse = z.infer<
  typeof connectorCapabilityApplyResponseSchema
>;
export type ListProvidersResponse = z.infer<typeof listProvidersResponseSchema>;
export type ListIntegrationsResponse = z.infer<typeof listIntegrationsResponseSchema>;
export type ListPluginsResponse = z.infer<typeof listPluginsResponseSchema>;
export type ListGitHubRepositoriesInput = z.infer<typeof listGitHubRepositoriesInputSchema>;
export type ListGitHubRepositoriesResponse = z.infer<typeof listGitHubRepositoriesResponseSchema>;

export const deploymentSourceCommitShaMetadataKey = "source.commitSha";

type DeploymentCommitMetadataInput = {
  sourceCommitSha?: string;
  runtimePlan: {
    source: {
      version?: SourceVersion;
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

export type DeploymentSourceVersionDisplay = {
  label: "Commit" | "Image digest" | "Source version";
  value: string;
  shortValue: string;
  requested?: string;
  fixed: boolean;
};

export function sourceVersionForDeployment(
  deployment: DeploymentCommitMetadataInput,
): DeploymentSourceVersionDisplay | undefined {
  const version = deployment.runtimePlan.source.version;
  const executionMetadata = deployment.runtimePlan.execution.metadata ?? {};
  const sourceMetadata = deployment.runtimePlan.source.metadata ?? {};
  const fixedIdentifier = version?.fixedIdentifier;
  if (fixedIdentifier) {
    return {
      label:
        fixedIdentifier.referenceKind === "commit-sha"
          ? "Commit"
          : fixedIdentifier.referenceKind === "image-digest"
            ? "Image digest"
            : "Source version",
      value: fixedIdentifier.value,
      shortValue: shortDeploymentSourceVersion(fixedIdentifier.value),
      ...(version.reference.value !== fixedIdentifier.value
        ? { requested: version.reference.value }
        : {}),
      fixed: true,
    };
  }

  const sourceCommitSha = sourceCommitShaForDeployment(deployment);
  if (sourceCommitSha) {
    return {
      label: "Commit",
      value: sourceCommitSha,
      shortValue: shortDeploymentSourceVersion(sourceCommitSha),
      fixed: true,
    };
  }

  const imageDigest =
    executionMetadata.imageDigest ??
    executionMetadata["source.imageDigest"] ??
    (executionMetadata.sourceVersionKind === "image-digest"
      ? executionMetadata.sourceVersion
      : undefined) ??
    sourceMetadata.imageDigest ??
    sourceMetadata["source.imageDigest"];
  if (imageDigest) {
    const requested =
      version?.reference.value ??
      sourceMetadata.imageTag ??
      executionMetadata["source.imageTag"] ??
      sourceMetadata["source.imageTag"];

    return {
      label: "Image digest",
      value: imageDigest,
      shortValue: shortDeploymentSourceVersion(imageDigest),
      ...(requested && requested !== imageDigest ? { requested } : {}),
      fixed: true,
    };
  }

  if (version?.reference.value && version.reference.referenceKind !== "unknown") {
    return {
      label: "Source version",
      value: version.reference.value,
      shortValue: shortDeploymentSourceVersion(version.reference.value),
      fixed: false,
    };
  }

  return undefined;
}

export function shortDeploymentSourceVersion(value: string): string {
  return value.length > 19 ? value.slice(0, 19) : value;
}
