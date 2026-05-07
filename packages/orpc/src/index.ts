import {
  type AppLogger,
  ArchiveEnvironmentCommand,
  ArchiveProjectCommand,
  ArchiveResourceCommand,
  AttachResourceStorageCommand,
  archiveEnvironmentCommandInputSchema,
  archiveProjectCommandInputSchema,
  archiveResourceCommandInputSchema,
  attachResourceStorageCommandInputSchema,
  BindResourceDependencyCommand,
  BootstrapServerProxyCommand,
  bindResourceDependencyCommandInputSchema,
  bootstrapServerProxyCommandInputSchema,
  CheckDomainBindingDeleteSafetyQuery,
  CheckServerDeleteSafetyQuery,
  CleanupPreviewCommand,
  CloneEnvironmentCommand,
  type Command,
  type CommandBus,
  ConfigureDefaultAccessDomainPolicyCommand,
  ConfigureDomainBindingRouteCommand,
  ConfigurePreviewPolicyCommand,
  ConfigureResourceAccessCommand,
  ConfigureResourceAutoDeployCommand,
  ConfigureResourceHealthCommand,
  ConfigureResourceNetworkCommand,
  ConfigureResourceRuntimeCommand,
  ConfigureResourceSourceCommand,
  ConfigureScheduledTaskCommand,
  ConfigureServerCredentialCommand,
  ConfigureServerEdgeProxyCommand,
  ConfirmDomainBindingOwnershipCommand,
  CreateDependencyResourceBackupCommand,
  CreateDeploymentCommand,
  type CreateDeploymentCommandInput,
  CreateDomainBindingCommand,
  CreateEnvironmentCommand,
  CreateProjectCommand,
  CreateResourceCommand,
  CreateScheduledTaskCommand,
  CreateSshCredentialCommand,
  CreateStorageVolumeCommand,
  checkDomainBindingDeleteSafetyQueryInputSchema,
  checkServerDeleteSafetyQueryInputSchema,
  cleanupPreviewCommandInputSchema,
  cloneEnvironmentCommandInputSchema,
  configureDefaultAccessDomainPolicyCommandInputSchema,
  configureDomainBindingRouteCommandInputSchema,
  configurePreviewPolicyCommandInputSchema,
  configureResourceAccessCommandInputSchema,
  configureResourceAutoDeployCommandInputSchema,
  configureResourceHealthCommandInputSchema,
  configureResourceNetworkCommandInputSchema,
  configureResourceRuntimeCommandInputSchema,
  configureResourceSourceCommandInputSchema,
  configureScheduledTaskCommandInputSchema,
  configureServerCredentialCommandInputSchema,
  configureServerEdgeProxyCommandInputSchema,
  confirmDomainBindingOwnershipCommandInputSchema,
  createDependencyResourceBackupCommandInputSchema,
  createDeploymentCommandInputSchema,
  createDomainBindingCommandInputSchema,
  createEnvironmentCommandInputSchema,
  createProjectCommandInputSchema,
  createResourceCommandInputSchema,
  createScheduledTaskCommandInputSchema,
  createSshCredentialCommandInputSchema,
  createStorageVolumeCommandInputSchema,
  DeactivateServerCommand,
  DeleteCertificateCommand,
  DeleteDependencyResourceCommand,
  DeleteDomainBindingCommand,
  DeletePreviewEnvironmentCommand,
  DeleteResourceCommand,
  DeleteScheduledTaskCommand,
  DeleteServerCommand,
  DeleteSshCredentialCommand,
  DeleteStorageVolumeCommand,
  type DeploymentEventStreamEnvelope,
  DeploymentLogsQuery,
  DeploymentPlanQuery,
  type DeploymentProgressEvent,
  type DeploymentProgressObserver,
  DeploymentRecoveryReadinessQuery,
  DetachResourceStorageCommand,
  DiffEnvironmentsQuery,
  deactivateServerCommandInputSchema,
  deleteCertificateCommandInputSchema,
  deleteDependencyResourceCommandInputSchema,
  deleteDomainBindingCommandInputSchema,
  deletePreviewEnvironmentCommandInputSchema,
  deleteResourceCommandInputSchema,
  deleteScheduledTaskCommandInputSchema,
  deleteServerCommandInputSchema,
  deleteSshCredentialCommandInputSchema,
  deleteStorageVolumeCommandInputSchema,
  deploymentLogsQueryInputSchema,
  deploymentPlanQueryInputSchema,
  deploymentRecoveryReadinessQueryInputSchema,
  detachResourceStorageCommandInputSchema,
  diffEnvironmentsQueryInputSchema,
  EnvironmentEffectivePrecedenceQuery,
  type ExecutionContext,
  type ExecutionContextFactory,
  environmentEffectivePrecedenceQueryInputSchema,
  type GitHubPreviewPullRequestWebhookVerifier,
  type GitHubSourceEventWebhookVerifier,
  ImportCertificateCommand,
  ImportPostgresDependencyResourceCommand,
  ImportRedisDependencyResourceCommand,
  ImportResourceVariablesCommand,
  IngestPreviewPullRequestEventCommand,
  IngestSourceEventCommand,
  IssueOrRenewCertificateCommand,
  importCertificateCommandInputSchema,
  importPostgresDependencyResourceCommandInputSchema,
  importRedisDependencyResourceCommandInputSchema,
  importResourceVariablesCommandInputSchema,
  issueOrRenewCertificateCommandInputSchema,
  ListCertificatesQuery,
  ListDefaultAccessDomainPoliciesQuery,
  ListDependencyResourceBackupsQuery,
  ListDependencyResourcesQuery,
  ListDeploymentsQuery,
  ListDomainBindingsQuery,
  ListEnvironmentsQuery,
  ListGitHubRepositoriesQuery,
  ListOperatorWorkQuery,
  ListPluginsQuery,
  ListPreviewEnvironmentsQuery,
  ListProjectsQuery,
  ListProvidersQuery,
  ListResourceDependencyBindingsQuery,
  ListResourcesQuery,
  ListScheduledTaskRunsQuery,
  ListScheduledTasksQuery,
  ListServersQuery,
  ListSourceEventsQuery,
  ListSshCredentialsQuery,
  ListStorageVolumesQuery,
  LockEnvironmentCommand,
  listCertificatesQueryInputSchema,
  listDefaultAccessDomainPoliciesQueryInputSchema,
  listDependencyResourceBackupsQueryInputSchema,
  listDependencyResourcesQueryInputSchema,
  listDeploymentsQueryInputSchema,
  listDomainBindingsQueryInputSchema,
  listEnvironmentsQueryInputSchema,
  listGitHubRepositoriesQueryInputSchema,
  listOperatorWorkQueryInputSchema,
  listPreviewEnvironmentsQueryInputSchema,
  listResourceDependencyBindingsQueryInputSchema,
  listResourcesQueryInputSchema,
  listScheduledTaskRunsQueryInputSchema,
  listScheduledTasksQueryInputSchema,
  listSourceEventsQueryInputSchema,
  listSshCredentialsQueryInputSchema,
  listStorageVolumesQueryInputSchema,
  lockEnvironmentCommandInputSchema,
  OpenTerminalSessionCommand,
  openTerminalSessionCommandInputSchema,
  PromoteEnvironmentCommand,
  ProvisionPostgresDependencyResourceCommand,
  ProvisionRedisDependencyResourceCommand,
  promoteEnvironmentCommandInputSchema,
  provisionPostgresDependencyResourceCommandInputSchema,
  provisionRedisDependencyResourceCommandInputSchema,
  type Query,
  type QueryBus,
  RedeployDeploymentCommand,
  RegisterServerCommand,
  RelinkSourceLinkCommand,
  RenameDependencyResourceCommand,
  RenameEnvironmentCommand,
  RenameProjectCommand,
  RenameServerCommand,
  RenameStorageVolumeCommand,
  ResourceAccessFailureEvidenceLookupQuery,
  ResourceDiagnosticSummaryQuery,
  ResourceEffectiveConfigQuery,
  ResourceHealthQuery,
  ResourceProxyConfigurationPreviewQuery,
  type ResourceRepository,
  type ResourceRuntimeLogEvent,
  ResourceRuntimeLogsQuery,
  type ResourceRuntimeLogsQueryInput,
  type ResourceRuntimeLogsResult,
  RestartResourceRuntimeCommand,
  RestoreDependencyResourceBackupCommand,
  RetryCertificateCommand,
  RetryDeploymentCommand,
  RetryDomainBindingVerificationCommand,
  RevokeCertificateCommand,
  RollbackDeploymentCommand,
  RotateResourceDependencyBindingSecretCommand,
  RotateSshCredentialCommand,
  RunScheduledTaskNowCommand,
  redeployDeploymentCommandInputSchema,
  registerServerCommandInputSchema,
  relinkSourceLinkCommandInputSchema,
  renameDependencyResourceCommandInputSchema,
  renameEnvironmentCommandInputSchema,
  renameProjectCommandInputSchema,
  renameServerCommandInputSchema,
  renameStorageVolumeCommandInputSchema,
  resourceAccessFailureEvidenceLookupQueryInputSchema,
  resourceDiagnosticSummaryQueryInputSchema,
  resourceEffectiveConfigQueryInputSchema,
  resourceHealthQueryInputSchema,
  resourceProxyConfigurationPreviewQueryInputSchema,
  resourceRuntimeLogsQueryInputSchema,
  restartResourceRuntimeCommandInputSchema,
  restoreDependencyResourceBackupCommandInputSchema,
  retryCertificateCommandInputSchema,
  retryDeploymentCommandInputSchema,
  retryDomainBindingVerificationCommandInputSchema,
  revokeCertificateCommandInputSchema,
  rollbackDeploymentCommandInputSchema,
  rotateResourceDependencyBindingSecretCommandInputSchema,
  rotateSshCredentialCommandInputSchema,
  runScheduledTaskNowCommandInputSchema,
  ScheduledTaskRunLogsQuery,
  SetEnvironmentVariableCommand,
  SetResourceVariableCommand,
  ShowCertificateQuery,
  ShowDefaultAccessDomainPolicyQuery,
  ShowDependencyResourceBackupQuery,
  ShowDependencyResourceQuery,
  ShowDeploymentQuery,
  ShowDomainBindingQuery,
  ShowEnvironmentQuery,
  ShowOperatorWorkQuery,
  ShowPreviewEnvironmentQuery,
  ShowPreviewPolicyQuery,
  ShowProjectQuery,
  ShowResourceDependencyBindingQuery,
  ShowResourceQuery,
  ShowScheduledTaskQuery,
  ShowScheduledTaskRunQuery,
  ShowServerQuery,
  ShowSourceEventQuery,
  ShowSshCredentialQuery,
  ShowStorageVolumeQuery,
  type SourceEventPolicyReader,
  type SourceEventVerificationPort,
  SourceLinkBySourceFingerprintSpec,
  type SourceLinkRecord,
  type SourceLinkRepository,
  StartResourceRuntimeCommand,
  StopResourceRuntimeCommand,
  StreamDeploymentEventsQuery,
  type StreamDeploymentEventsQueryInput,
  type StreamDeploymentEventsResult,
  scheduledTaskRunLogsQueryInputSchema,
  setEnvironmentVariableCommandInputSchema,
  setResourceVariableCommandInputSchema,
  showCertificateQueryInputSchema,
  showDefaultAccessDomainPolicyQueryInputSchema,
  showDependencyResourceBackupQueryInputSchema,
  showDependencyResourceQueryInputSchema,
  showDeploymentQueryInputSchema,
  showDomainBindingQueryInputSchema,
  showEnvironmentQueryInputSchema,
  showOperatorWorkQueryInputSchema,
  showPreviewEnvironmentQueryInputSchema,
  showPreviewPolicyQueryInputSchema,
  showProjectQueryInputSchema,
  showResourceDependencyBindingQueryInputSchema,
  showResourceQueryInputSchema,
  showScheduledTaskQueryInputSchema,
  showScheduledTaskRunQueryInputSchema,
  showServerQueryInputSchema,
  showSourceEventQueryInputSchema,
  showSshCredentialQueryInputSchema,
  showStorageVolumeQueryInputSchema,
  startResourceRuntimeCommandInputSchema,
  stopResourceRuntimeCommandInputSchema,
  streamDeploymentEventsQueryInputSchema,
  TestServerConnectivityCommand,
  testDraftServerConnectivityCommandInputSchema,
  testRegisteredServerConnectivityCommandInputSchema,
  toRepositoryContext,
  UnbindResourceDependencyCommand,
  UnlockEnvironmentCommand,
  UnsetEnvironmentVariableCommand,
  UnsetResourceVariableCommand,
  UpsertSourceLinkSpec,
  unbindResourceDependencyCommandInputSchema,
  unlockEnvironmentCommandInputSchema,
  unsetEnvironmentVariableCommandInputSchema,
  unsetResourceVariableCommandInputSchema,
} from "@appaloft/application";
import {
  archiveEnvironmentResponseSchema,
  archiveProjectResponseSchema,
  archiveResourceResponseSchema,
  attachResourceStorageResponseSchema,
  bindResourceDependencyResponseSchema,
  bootstrapServerProxyResponseSchema,
  checkDomainBindingDeleteSafetyResponseSchema,
  checkServerDeleteSafetyResponseSchema,
  cleanupPreviewResponseSchema,
  cloneEnvironmentResponseSchema,
  configureDefaultAccessDomainPolicyResponseSchema,
  configureDomainBindingRouteResponseSchema,
  configurePreviewPolicyResponseSchema,
  configureResourceAccessResponseSchema,
  configureResourceAutoDeployResponseSchema,
  configureResourceHealthResponseSchema,
  configureResourceNetworkResponseSchema,
  configureResourceRuntimeResponseSchema,
  configureResourceSourceResponseSchema,
  configureServerEdgeProxyResponseSchema,
  confirmDomainBindingOwnershipResponseSchema,
  createDeploymentResponseSchema,
  createDomainBindingResponseSchema,
  createEnvironmentResponseSchema,
  createProjectResponseSchema,
  createResourceResponseSchema,
  createSshCredentialResponseSchema,
  createStorageVolumeResponseSchema,
  deactivateServerResponseSchema,
  deleteCertificateResponseSchema,
  deleteDomainBindingResponseSchema,
  deletePreviewEnvironmentResponseSchema,
  deleteResourceResponseSchema,
  deleteScheduledTaskResponseSchema,
  deleteServerResponseSchema,
  deleteSshCredentialResponseSchema,
  deleteStorageVolumeResponseSchema,
  dependencyResourceResponseSchema,
  deploymentEventStreamEnvelopeSchema,
  deploymentEventStreamResponseSchema,
  deploymentEventStreamStreamResponseSchema,
  deploymentLogsResponseSchema,
  deploymentPlanResponseSchema,
  deploymentProgressEventSchema,
  deploymentRecoveryReadinessResponseSchema,
  detachResourceStorageResponseSchema,
  diffEnvironmentResponseSchema,
  environmentEffectivePrecedenceResponseSchema,
  environmentSummarySchema,
  importCertificateResponseSchema,
  importResourceVariablesResponseSchema,
  issueOrRenewCertificateResponseSchema,
  listCertificatesResponseSchema,
  listDefaultAccessDomainPoliciesResponseSchema,
  listDependencyResourceBackupsResponseSchema,
  listDependencyResourcesResponseSchema,
  listDeploymentsResponseSchema,
  listDomainBindingsResponseSchema,
  listEnvironmentsResponseSchema,
  listGitHubRepositoriesResponseSchema,
  listOperatorWorkResponseSchema,
  listPluginsResponseSchema,
  listPreviewEnvironmentsResponseSchema,
  listProjectsResponseSchema,
  listProvidersResponseSchema,
  listResourceDependencyBindingsResponseSchema,
  listResourcesResponseSchema,
  listScheduledTaskRunsResponseSchema,
  listScheduledTasksResponseSchema,
  listServersResponseSchema,
  listSourceEventsResponseSchema,
  listSshCredentialsResponseSchema,
  listStorageVolumesResponseSchema,
  lockEnvironmentResponseSchema,
  promoteEnvironmentResponseSchema,
  proxyConfigurationViewSchema,
  redeployDeploymentResponseSchema,
  registerServerResponseSchema,
  renameEnvironmentResponseSchema,
  renameProjectResponseSchema,
  renameServerResponseSchema,
  renameStorageVolumeResponseSchema,
  resourceAccessFailureEvidenceLookupSchema,
  resourceDetailSchema,
  resourceDiagnosticSummarySchema,
  resourceEffectiveConfigResponseSchema,
  resourceHealthSummarySchema,
  resourceRuntimeLogEventSchema,
  resourceRuntimeLogsResponseSchema,
  resourceRuntimeLogsStreamResponseSchema,
  restartResourceRuntimeResponseSchema,
  retryCertificateResponseSchema,
  retryDeploymentResponseSchema,
  retryDomainBindingVerificationResponseSchema,
  revokeCertificateResponseSchema,
  rollbackDeploymentResponseSchema,
  rotateResourceDependencyBindingSecretResponseSchema,
  rotateSshCredentialResponseSchema,
  runScheduledTaskNowResponseSchema,
  scheduledTaskCommandResponseSchema,
  scheduledTaskRunLogsResponseSchema,
  setResourceVariableResponseSchema,
  showCertificateResponseSchema,
  showDefaultAccessDomainPolicyResponseSchema,
  showDependencyResourceBackupResponseSchema,
  showDependencyResourceResponseSchema,
  showDeploymentResponseSchema,
  showDomainBindingResponseSchema,
  showOperatorWorkResponseSchema,
  showPreviewEnvironmentResponseSchema,
  showPreviewPolicyResponseSchema,
  showProjectResponseSchema,
  showResourceDependencyBindingResponseSchema,
  showScheduledTaskResponseSchema,
  showScheduledTaskRunResponseSchema,
  showServerResponseSchema,
  showSourceEventResponseSchema,
  showSshCredentialResponseSchema,
  showStorageVolumeResponseSchema,
  startResourceRuntimeResponseSchema,
  stopResourceRuntimeResponseSchema,
  terminalSessionDescriptorSchema,
  testServerConnectivityResponseSchema,
  unbindResourceDependencyResponseSchema,
  unlockEnvironmentResponseSchema,
  unsetResourceVariableResponseSchema,
} from "@appaloft/contracts";
import {
  type DomainError,
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
} from "@appaloft/core";
import { resolvePublicDocsHelpHref } from "@appaloft/docs-registry";
import { resolveAppaloftLocaleFromHeaders, translateDomainError } from "@appaloft/i18n";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { eventIterator, ORPCError, os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { type Elysia } from "elysia";
import { z } from "zod";

export interface AppaloftOrpcContext {
  commandBus: CommandBus;
  executionContextFactory: ExecutionContextFactory;
  queryBus: QueryBus;
  logger: AppLogger;
  deploymentProgressObserver?: DeploymentProgressObserver;
  resourceRepository?: ResourceRepository;
  sourceLinkRepository?: SourceLinkRepository;
  sourceEventVerificationPort?: SourceEventVerificationPort;
  githubSourceEventWebhookVerifier?: GitHubSourceEventWebhookVerifier;
  githubPreviewPullRequestWebhookVerifier?: GitHubPreviewPullRequestWebhookVerifier;
  sourceEventPolicyReader?: SourceEventPolicyReader;
  githubWebhookSecret?: string;
}

interface AppaloftOrpcRequestContext extends AppaloftOrpcContext {
  executionContext: ExecutionContext;
}

type DeploymentProgressStreamEvent = DeploymentProgressEvent & {
  step: NonNullable<DeploymentProgressEvent["step"]>;
};

export interface RequestContextRunner {
  runWithRequest<T>(
    request: Request,
    context: ExecutionContext,
    callback: () => Promise<T>,
  ): Promise<T>;
}

const genericSignedSourceEventBodySchema = z
  .object({
    eventKind: z.enum(["push", "tag"]),
    sourceIdentity: z
      .object({
        locator: z.string().trim().min(1),
        providerRepositoryId: z.string().trim().min(1).optional(),
        repositoryFullName: z.string().trim().min(1).optional(),
      })
      .strict(),
    ref: z.string().trim().min(1),
    revision: z.string().trim().min(1),
    deliveryId: z.string().trim().min(1).optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
    receivedAt: z.string().trim().min(1).optional(),
  })
  .strict();

const actionSourceLinkDeploymentBodySchema = z
  .object({
    sourceFingerprint: z.string().trim().min(1),
    projectId: z.string().trim().min(1).optional(),
    environmentId: z.string().trim().min(1).optional(),
    resourceId: z.string().trim().min(1).optional(),
    serverId: z.string().trim().min(1).optional(),
    destinationId: z.string().trim().min(1).optional(),
  })
  .strict();

const relinkSourceLinkResponseSchema = z.object({
  sourceFingerprint: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  resourceId: z.string(),
  serverId: z.string().optional(),
  destinationId: z.string().optional(),
});

const base = os.$context<AppaloftOrpcRequestContext>();
const emptyResponseSchema = z.null();
export const createDeploymentDocsHref = resolvePublicDocsHelpHref("deployment.source");

function routeDescription(
  summary: string,
  topicId: Parameters<typeof resolvePublicDocsHelpHref>[0],
): string {
  return `${summary} Public docs: ${resolvePublicDocsHelpHref(topicId)}`;
}

export const apiDocsHrefs = {
  createDeployment: createDeploymentDocsHref,
  deploymentPlan: resolvePublicDocsHelpHref("deployment.plan-preview"),
  deploymentRecoveryReadiness: resolvePublicDocsHelpHref("deployment.recovery-readiness"),
  serverCredential: resolvePublicDocsHelpHref("server.ssh-credential"),
  serverConnectivity: resolvePublicDocsHelpHref("server.connectivity-test"),
  serverDeploymentTarget: resolvePublicDocsHelpHref("server.deployment-target"),
  serverDockerSwarmTarget: resolvePublicDocsHelpHref("server.docker-swarm-target"),
  serverProxyReadiness: resolvePublicDocsHelpHref("server.proxy-readiness"),
  environmentVariablePrecedence: resolvePublicDocsHelpHref("environment.variable-precedence"),
  environmentDiffPromote: resolvePublicDocsHelpHref("environment.diff-promote"),
  environmentLifecycle: resolvePublicDocsHelpHref("environment.lifecycle"),
  defaultAccessRoute: resolvePublicDocsHelpHref("domain.generated-access-route"),
  defaultAccessPolicy: resolvePublicDocsHelpHref("default-access.policy"),
  resourceSourceProfile: resolvePublicDocsHelpHref("resource.source-profile"),
  resourceRuntimeProfile: resolvePublicDocsHelpHref("resource.runtime-profile"),
  resourceProfileDrift: resolvePublicDocsHelpHref("resource.profile-drift"),
  resourceHealthProfile: resolvePublicDocsHelpHref("resource.health-profile"),
  resourceNetworkProfile: resolvePublicDocsHelpHref("resource.network-profile"),
  resourceAccessProfile: resolvePublicDocsHelpHref("resource.access-profile"),
  domainCustomBinding: resolvePublicDocsHelpHref("domain.custom-domain-binding"),
  domainOwnershipCheck: resolvePublicDocsHelpHref("domain.ownership-check"),
  certificateReadiness: resolvePublicDocsHelpHref("certificate.readiness"),
  runtimeLogs: resolvePublicDocsHelpHref("observability.runtime-logs"),
  healthSummary: resolvePublicDocsHelpHref("observability.health-summary"),
  diagnosticSummary: resolvePublicDocsHelpHref("diagnostics.safe-support-payload"),
  accessFailureEvidenceLookup: resolvePublicDocsHelpHref("diagnostics.access-failure-request-id"),
  operatorWorkLedger: resolvePublicDocsHelpHref("operator.work-ledger"),
  terminalSession: resolvePublicDocsHelpHref("server.terminal-session"),
  projectLifecycle: resolvePublicDocsHelpHref("project.lifecycle"),
  storageVolumeLifecycle: resolvePublicDocsHelpHref("storage.volume-lifecycle"),
  dependencyResourceLifecycle: resolvePublicDocsHelpHref("dependency.resource-lifecycle"),
  dependencyRuntimeInjection: resolvePublicDocsHelpHref("dependency.runtime-injection"),
  sourceAutoDeploySetup: resolvePublicDocsHelpHref("source.auto-deploy-setup"),
  sourceAutoDeploySignatures: resolvePublicDocsHelpHref("source.auto-deploy-signatures"),
  sourceAutoDeployDedupe: resolvePublicDocsHelpHref("source.auto-deploy-dedupe"),
  sourceAutoDeployIgnoredEvents: resolvePublicDocsHelpHref("source.auto-deploy-ignored-events"),
  sourceAutoDeployRecovery: resolvePublicDocsHelpHref("source.auto-deploy-recovery"),
  scheduledTaskLifecycle: resolvePublicDocsHelpHref("scheduled-task.resource-lifecycle"),
  productGradePreviews: resolvePublicDocsHelpHref("deployment.product-grade-previews"),
} as const;

export const apiRouteDescriptions = {
  createDeployment: routeDescription(
    "Creates a deployment from an explicit project, server, environment, and resource context.",
    "deployment.source",
  ),
  cleanupPreview: routeDescription(
    "Cleans preview-scoped runtime, route, and source-link state by source fingerprint.",
    "deployment.preview-cleanup",
  ),
  deploymentPlan: routeDescription(
    "Previews detected deployment evidence and the execution plan without creating or running a deployment.",
    "deployment.plan-preview",
  ),
  deploymentRecoveryReadiness: routeDescription(
    "Reads retry, redeploy, rollback, and rollback candidate readiness for one deployment.",
    "deployment.recovery-readiness",
  ),
  projectLifecycle: routeDescription("Read, rename, and archive projects.", "project.lifecycle"),
  registerServer: routeDescription(
    "Registers a deployment target. Docker Swarm targets are accepted when the runtime backend is available.",
    "server.docker-swarm-target",
  ),
  showServer: routeDescription(
    "Reads one deployment target with proxy status and usage rollups.",
    "server.deployment-target",
  ),
  renameServer: routeDescription(
    "Renames the display label for one deployment target without changing its identity.",
    "server.deployment-target",
  ),
  configureServerEdgeProxy: routeDescription(
    "Configures the desired edge proxy kind for future server access routing.",
    "server.proxy-readiness",
  ),
  deactivateServer: routeDescription(
    "Marks one deployment target inactive so it cannot receive new work.",
    "server.deployment-target",
  ),
  checkServerDeleteSafety: routeDescription(
    "Previews whether a deployment target can be safely deleted.",
    "server.deployment-target",
  ),
  deleteServer: routeDescription(
    "Deletes an inactive deployment target only after delete-safety blockers are clear.",
    "server.deployment-target",
  ),
  configureServerCredential: routeDescription(
    "Configures the SSH credential Appaloft uses for server connectivity and deployment.",
    "server.ssh-credential",
  ),
  createSshCredential: routeDescription(
    "Creates a reusable SSH credential from a private key input.",
    "server.ssh-credential",
  ),
  showSshCredential: routeDescription(
    "Reads one reusable SSH credential with masked detail and server usage visibility.",
    "server.ssh-credential",
  ),
  deleteSshCredential: routeDescription(
    "Deletes one reusable SSH credential only when no visible active or inactive server uses it.",
    "server.ssh-credential",
  ),
  rotateSshCredential: routeDescription(
    "Rotates one reusable SSH credential in place after usage visibility and acknowledgement checks.",
    "server.ssh-credential",
  ),
  testServerConnectivity: routeDescription(
    "Tests whether Appaloft can reach and inspect a server.",
    "server.connectivity-test",
  ),
  bootstrapServerProxy: routeDescription(
    "Repairs or bootstraps provider-owned edge proxy infrastructure.",
    "server.proxy-readiness",
  ),
  configureDefaultAccessDomainPolicy: routeDescription(
    "Configures generated access routes for deployed resources.",
    "default-access.policy",
  ),
  listDefaultAccessDomainPolicies: routeDescription(
    "Lists persisted default access policy records.",
    "default-access.policy",
  ),
  showDefaultAccessDomainPolicy: routeDescription(
    "Reads one persisted default access policy scope.",
    "default-access.policy",
  ),
  showResource: routeDescription(
    "Reads one resource profile with optional diagnostics for profile drift.",
    "resource.profile-drift",
  ),
  configureResourceSource: routeDescription(
    "Configures the source profile used by later deployment detect and plan stages.",
    "resource.source-profile",
  ),
  configureResourceRuntime: routeDescription(
    "Configures runtime settings such as strategy, commands, and publish directory.",
    "resource.runtime-profile",
  ),
  resourceRuntimeControl: routeDescription(
    "Stops, starts, or restarts the current resource runtime without creating a deployment attempt.",
    "resource.runtime-controls",
  ),
  configureResourceHealth: routeDescription(
    "Configures readiness and health checks used during verification.",
    "resource.health-profile",
  ),
  configureResourceNetwork: routeDescription(
    "Configures ports, protocols, and exposure behavior for resource access.",
    "resource.network-profile",
  ),
  configureResourceAccess: routeDescription(
    "Configures resource participation in generated default access route planning.",
    "resource.access-profile",
  ),
  configureResourceAutoDeploy: routeDescription(
    "Configures a Resource-owned auto-deploy policy for trusted source events.",
    "source.auto-deploy-setup",
  ),
  attachResourceStorage: routeDescription(
    "Attaches an existing storage volume to a resource at a validated destination path.",
    "storage.volume-lifecycle",
  ),
  detachResourceStorage: routeDescription(
    "Detaches storage from a resource without deleting the underlying volume.",
    "storage.volume-lifecycle",
  ),
  createStorageVolume: routeDescription(
    "Creates provider-neutral durable storage metadata for a named volume or bind mount.",
    "storage.volume-lifecycle",
  ),
  listStorageVolumes: routeDescription(
    "Lists storage volumes with safe resource attachment summaries.",
    "storage.volume-lifecycle",
  ),
  showStorageVolume: routeDescription(
    "Reads one storage volume with safe resource attachment summaries.",
    "storage.volume-lifecycle",
  ),
  renameStorageVolume: routeDescription(
    "Renames one storage volume without changing resource attachments or runtime state.",
    "storage.volume-lifecycle",
  ),
  deleteStorageVolume: routeDescription(
    "Deletes only unattached storage volumes that are not blocked by backup retention metadata.",
    "storage.volume-lifecycle",
  ),
  provisionPostgresDependencyResource: routeDescription(
    "Records provider-neutral Appaloft-managed Postgres dependency resource intent without creating provider-native database infrastructure.",
    "dependency.resource-lifecycle",
  ),
  importPostgresDependencyResource: routeDescription(
    "Imports external Postgres dependency metadata while keeping raw connection secrets outside list and show responses.",
    "dependency.resource-lifecycle",
  ),
  provisionRedisDependencyResource: routeDescription(
    "Records provider-neutral Appaloft-managed Redis dependency resource intent without creating provider-native Redis infrastructure.",
    "dependency.resource-lifecycle",
  ),
  importRedisDependencyResource: routeDescription(
    "Imports external Redis dependency metadata while keeping raw connection secrets outside list and show responses.",
    "dependency.resource-lifecycle",
  ),
  listDependencyResources: routeDescription(
    "Lists dependency resources with ownership, masked connection, binding readiness, and backup relationship summaries.",
    "dependency.resource-lifecycle",
  ),
  showDependencyResource: routeDescription(
    "Reads one dependency resource with masked connection and delete-safety metadata.",
    "dependency.resource-lifecycle",
  ),
  renameDependencyResource: routeDescription(
    "Renames one dependency resource without changing provider ownership, bindings, or connection secret boundaries.",
    "dependency.resource-lifecycle",
  ),
  deleteDependencyResource: routeDescription(
    "Deletes only dependency resources that are not blocked by bindings, backup relationships, provider-managed unsafe state, or snapshot references.",
    "dependency.resource-lifecycle",
  ),
  createDependencyResourceBackup: routeDescription(
    "Creates a dependency resource backup through the selected provider while recording safe artifact metadata.",
    "dependency.resource-lifecycle",
  ),
  listDependencyResourceBackups: routeDescription(
    "Lists dependency resource backups without exposing provider-native artifact secrets.",
    "dependency.resource-lifecycle",
  ),
  showDependencyResourceBackup: routeDescription(
    "Reads one dependency resource backup with latest restore attempt metadata.",
    "dependency.resource-lifecycle",
  ),
  restoreDependencyResourceBackup: routeDescription(
    "Restores a ready dependency resource backup after explicit data-overwrite acknowledgements.",
    "dependency.resource-lifecycle",
  ),
  bindResourceDependency: routeDescription(
    "Binds a ready Postgres dependency resource to a resource using safe control-plane metadata only.",
    "dependency.resource-lifecycle",
  ),
  unbindResourceDependency: routeDescription(
    "Removes a resource dependency binding without deleting the dependency resource or external database.",
    "dependency.resource-lifecycle",
  ),
  rotateResourceDependencyBindingSecret: routeDescription(
    "Rotates the safe secret reference used by a resource dependency binding for future deployments.",
    "dependency.resource-lifecycle",
  ),
  listResourceDependencyBindings: routeDescription(
    "Lists safe dependency binding summaries for one resource without exposing raw connection secrets.",
    "dependency.resource-lifecycle",
  ),
  showResourceDependencyBinding: routeDescription(
    "Reads one safe dependency binding summary for a resource without exposing raw connection secrets.",
    "dependency.resource-lifecycle",
  ),
  listScheduledTasks: routeDescription(
    "Lists Resource-owned scheduled task definitions by project, environment, resource, status, cursor, and limit.",
    "scheduled-task.resource-lifecycle",
  ),
  showScheduledTask: routeDescription(
    "Reads one Resource-owned scheduled task definition with latest run summary.",
    "scheduled-task.resource-lifecycle",
  ),
  createScheduledTask: routeDescription(
    "Creates a Resource-owned scheduled task definition without creating a deployment attempt.",
    "scheduled-task.resource-lifecycle",
  ),
  configureScheduledTask: routeDescription(
    "Configures schedule, command, timeout, retry, or enabled state for one scheduled task.",
    "scheduled-task.resource-lifecycle",
  ),
  deleteScheduledTask: routeDescription(
    "Deletes one scheduled task definition without deleting the Resource or deployment history.",
    "scheduled-task.resource-lifecycle",
  ),
  runScheduledTaskNow: routeDescription(
    "Accepts one immediate scheduled task run and returns before task execution completes.",
    "scheduled-task.resource-lifecycle",
  ),
  listScheduledTaskRuns: routeDescription(
    "Lists scheduled task run attempts by task, resource, status, trigger kind, cursor, and limit.",
    "scheduled-task.resource-lifecycle",
  ),
  showScheduledTaskRun: routeDescription(
    "Reads one scheduled task run attempt with safe status and terminal details.",
    "scheduled-task.resource-lifecycle",
  ),
  scheduledTaskRunLogs: routeDescription(
    "Reads run-scoped scheduled task logs without mixing them into deployment or resource runtime logs.",
    "scheduled-task.resource-lifecycle",
  ),
  setResourceVariable: routeDescription(
    "Sets one resource-scoped variable or secret override.",
    "environment.variable-precedence",
  ),
  importResourceVariables: routeDescription(
    "Imports pasted .env content into resource-scoped variables and secrets.",
    "environment.variable-precedence",
  ),
  unsetResourceVariable: routeDescription(
    "Removes one resource-scoped variable override.",
    "environment.variable-precedence",
  ),
  resourceEffectiveConfig: routeDescription(
    "Reads the masked effective configuration for one resource.",
    "environment.variable-precedence",
  ),
  environmentEffectivePrecedence: routeDescription(
    "Reads masked environment variables after environment precedence resolution.",
    "environment.variable-precedence",
  ),
  createDomainBinding: routeDescription(
    "Creates a custom domain binding for a resource.",
    "domain.custom-domain-binding",
  ),
  showDomainBinding: routeDescription(
    "Reads custom domain binding ownership, route readiness, proxy readiness, diagnostics, and certificate readiness.",
    "domain.custom-domain-binding",
  ),
  configureDomainBindingRoute: routeDescription(
    "Configures whether a custom domain binding serves traffic or redirects to a canonical binding.",
    "domain.custom-domain-binding",
  ),
  confirmDomainBindingOwnership: routeDescription(
    "Confirms that a user controls the custom domain.",
    "domain.ownership-check",
  ),
  checkDomainBindingDeleteSafety: routeDescription(
    "Checks whether a custom domain binding can be deleted without revoking certificates or erasing history.",
    "domain.custom-domain-binding",
  ),
  deleteDomainBinding: routeDescription(
    "Deletes custom domain binding route intent while preserving generated access, deployment snapshots, and server-applied route audit.",
    "domain.custom-domain-binding",
  ),
  retryDomainBindingVerification: routeDescription(
    "Starts a new domain ownership verification attempt without retrying certificate issuance.",
    "domain.ownership-check",
  ),
  issueOrRenewCertificate: routeDescription(
    "Requests certificate issuance or renewal for a domain binding.",
    "certificate.readiness",
  ),
  importCertificate: routeDescription(
    "Imports a manual certificate for a domain binding.",
    "certificate.readiness",
  ),
  showCertificate: routeDescription(
    "Reads safe certificate metadata and attempt history.",
    "certificate.readiness",
  ),
  retryCertificate: routeDescription(
    "Creates a new retry attempt for a retryable provider-issued certificate failure.",
    "certificate.readiness",
  ),
  revokeCertificate: routeDescription(
    "Stops Appaloft from using a certificate for managed TLS.",
    "certificate.readiness",
  ),
  deleteCertificate: routeDescription(
    "Removes a non-active certificate from visible active lifecycle while retaining audit history.",
    "certificate.readiness",
  ),
  setEnvironmentVariable: routeDescription(
    "Sets an environment variable with explicit kind, exposure, scope, and secret handling.",
    "environment.variable-precedence",
  ),
  unsetEnvironmentVariable: routeDescription(
    "Removes an environment variable in a specific exposure and optional scope.",
    "environment.variable-precedence",
  ),
  promoteEnvironment: routeDescription(
    "Promotes one environment configuration set into another.",
    "environment.diff-promote",
  ),
  renameEnvironment: routeDescription(
    "Renames one active environment without changing configuration or deployments.",
    "environment.lifecycle",
  ),
  cloneEnvironment: routeDescription(
    "Clones one active environment into a new environment in the same project.",
    "environment.lifecycle",
  ),
  archiveEnvironment: routeDescription(
    "Archives one environment while keeping deployment history readable.",
    "environment.lifecycle",
  ),
  lockEnvironment: routeDescription(
    "Locks one environment to block mutable work while keeping it readable.",
    "environment.lifecycle",
  ),
  unlockEnvironment: routeDescription(
    "Unlocks one environment so mutable work can resume.",
    "environment.lifecycle",
  ),
  diffEnvironments: routeDescription(
    "Compares two environment configuration sets.",
    "environment.diff-promote",
  ),
  deploymentLogs: routeDescription("Reads deployment logs.", "observability.runtime-logs"),
  resourceRuntimeLogs: routeDescription(
    "Reads resource runtime logs.",
    "observability.runtime-logs",
  ),
  resourceDiagnosticSummary: routeDescription(
    "Returns a support-safe diagnostic summary.",
    "diagnostics.safe-support-payload",
  ),
  resourceAccessFailureEvidenceLookup: routeDescription(
    "Looks up short-retention, support-safe access failure evidence by request id.",
    "diagnostics.access-failure-request-id",
  ),
  resourceHealth: routeDescription(
    "Reads current resource health.",
    "observability.health-summary",
  ),
  resourceProxyConfigurationPreview: routeDescription(
    "Previews generated proxy configuration for a resource.",
    "resource.network-profile",
  ),
  operatorWorkLedger: routeDescription(
    "Reads background work, failed attempts, and diagnostic next actions without recovery mutation.",
    "operator.work-ledger",
  ),
  openTerminalSession: routeDescription(
    "Opens a controlled terminal session for server or resource troubleshooting.",
    "server.terminal-session",
  ),
  listSourceEvents: routeDescription(
    "Lists safe source event deliveries for a project or resource.",
    "source.auto-deploy-dedupe",
  ),
  showSourceEvent: routeDescription(
    "Reads one safe source event delivery with dedupe, policy, and dispatch details.",
    "source.auto-deploy-ignored-events",
  ),
  relinkSourceLink: routeDescription(
    "Moves a source fingerprint link to an explicit project, environment, resource, and optional deployment target.",
    "deployment.source",
  ),
  configurePreviewPolicy: routeDescription(
    "Configures product-grade preview policy for a project or resource scope.",
    "deployment.product-grade-previews",
  ),
  showPreviewPolicy: routeDescription(
    "Reads effective product-grade preview policy for a project or resource scope.",
    "deployment.product-grade-previews",
  ),
  listPreviewEnvironments: routeDescription(
    "Lists durable preview environments with source, ownership, status, and expiry summaries.",
    "deployment.product-grade-previews",
  ),
  showPreviewEnvironment: routeDescription(
    "Reads one durable preview environment with safe source, ownership, status, and expiry detail.",
    "deployment.product-grade-previews",
  ),
  deletePreviewEnvironment: routeDescription(
    "Requests cleanup for one preview environment while preserving deployment history and audit.",
    "deployment.product-grade-previews",
  ),
} as const;
export const createDeploymentRouteDescription = apiRouteDescriptions.createDeployment;

function readObjectProperty(input: unknown, key: string): unknown {
  return input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

function serializeValidationIssues(input: unknown): unknown[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  return input.map((issue) => {
    if (!issue || typeof issue !== "object") {
      return {
        message: String(issue),
      };
    }

    const record = issue as Record<string, unknown>;
    return {
      ...(typeof record.code === "string" ? { code: record.code } : {}),
      ...(typeof record.message === "string" ? { message: record.message } : {}),
      ...(Array.isArray(record.path) ? { path: record.path } : {}),
      ...(typeof record.expected === "string" ? { expected: record.expected } : {}),
      ...(typeof record.received === "string" ? { received: record.received } : {}),
    };
  });
}

function extractErrorPayloadDetails(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const details: Record<string, unknown> = {};
  const issues = serializeValidationIssues(
    readObjectProperty(readObjectProperty(payload, "data"), "issues"),
  );

  if (typeof record.code === "string") {
    details.code = record.code;
  }

  if (typeof record.message === "string") {
    details.message = record.message;
  }

  if (typeof record.status === "number") {
    details.status = record.status;
  }

  if (issues && issues.length > 0) {
    details.validationIssues = issues;
  }

  return details;
}

function buildUnexpectedErrorContext(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
    };
  }

  const details: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };

  if (error instanceof ORPCError) {
    details.code = error.code;
    details.status = error.status;

    const payloadDetails = extractErrorPayloadDetails({
      code: error.code,
      status: error.status,
      message: error.message,
      data: error.data,
    });

    if (payloadDetails.validationIssues) {
      details.validationIssues = payloadDetails.validationIssues;
    }
  }

  const cause = error.cause;
  if (cause instanceof Error) {
    details.cause = {
      name: cause.name,
      message: cause.message,
      ...(() => {
        const causeIssues = serializeValidationIssues(readObjectProperty(cause, "issues"));
        return causeIssues && causeIssues.length > 0
          ? {
              validationIssues: causeIssues,
            }
          : {};
      })(),
    };
  }

  return details;
}

async function logOrpcErrorResponse(
  logger: AppLogger,
  eventName: string,
  request: Request,
  response: Response,
): Promise<void> {
  if (response.status < 400) {
    return;
  }

  const bodyText = await response
    .clone()
    .text()
    .catch(() => "");

  let parsedBody: unknown;
  try {
    parsedBody = bodyText.length > 0 ? JSON.parse(bodyText) : undefined;
  } catch {
    parsedBody = undefined;
  }

  const payload =
    parsedBody && typeof parsedBody === "object" && "json" in parsedBody
      ? (parsedBody as Record<string, unknown>).json
      : parsedBody;

  logger.error(eventName, {
    method: request.method,
    url: request.url,
    httpStatus: response.status,
    ...extractErrorPayloadDetails(payload),
    ...(bodyText.length > 0
      ? {
          responseBody: bodyText.slice(0, 1000),
        }
      : {}),
  });
}

function toOrpcError(error: DomainError, context: ExecutionContext) {
  const message = translateDomainError(error, context.t);

  switch (error.code) {
    case "not_found":
    case "source_event_not_found":
      return new ORPCError("NOT_FOUND", {
        message,
        status: 404,
        data: {
          domainCode: error.code,
          locale: context.locale,
        },
      });
    case "conflict":
    case "certificate_attempt_conflict":
    case "project_archived":
    case "environment_archived":
    case "environment_locked":
    case "resource_slug_conflict":
    case "resource_archived":
    case "resource_delete_blocked":
    case "dependency_resource_delete_blocked":
    case "server_delete_blocked":
    case "server_inactive":
    case "deployment_not_redeployable":
    case "credential_in_use":
    case "credential_rotation_requires_usage_acknowledgement":
      return new ORPCError("CONFLICT", {
        message,
        status: 409,
        data: {
          domainCode: error.code,
          locale: context.locale,
        },
      });
    case "domain_binding_proxy_required":
    case "domain_binding_context_mismatch":
    case "certificate_not_allowed":
    case "resource_context_mismatch":
    case "terminal_session_context_mismatch":
    case "terminal_session_workspace_unavailable":
    case "terminal_session_policy_denied":
    case "terminal_session_not_found":
    case "source_link_context_mismatch":
    case "source_event_scope_required":
    case "resource_auto_deploy_secret_unavailable":
    case "source_event_signature_invalid":
    case "source_event_unsupported_kind":
      return new ORPCError("BAD_REQUEST", {
        message,
        status: 400,
        data: {
          domainCode: error.code,
          locale: context.locale,
        },
      });
    case "source_event_provider_webhook_not_configured":
      return new ORPCError("SERVICE_UNAVAILABLE", {
        message,
        status: 503,
        data: {
          domainCode: error.code,
          locale: context.locale,
        },
      });
    case "validation_error":
    case "invariant_violation":
      return new ORPCError("BAD_REQUEST", {
        message,
        status: 400,
        data: {
          domainCode: error.code,
          locale: context.locale,
        },
      });
    default:
      if (error.category === "provider") {
        return new ORPCError("BAD_GATEWAY", {
          message,
          status: 502,
          data: {
            domainCode: error.code,
            locale: context.locale,
          },
        });
      }

      if (error.category === "retryable") {
        return new ORPCError("SERVICE_UNAVAILABLE", {
          message,
          status: 503,
          data: {
            domainCode: error.code,
            locale: context.locale,
          },
        });
      }

      if (error.category === "timeout") {
        return new ORPCError("GATEWAY_TIMEOUT", {
          message,
          status: 504,
          data: {
            domainCode: error.code,
            locale: context.locale,
          },
        });
      }

      return new ORPCError("INTERNAL_SERVER_ERROR", {
        message,
        status: 500,
        data: {
          domainCode: error.code,
          locale: context.locale,
        },
      });
  }
}

function unwrapResult<T>(context: ExecutionContext, result: Result<T>): T {
  return result.match(
    (value) => value,
    (error) => {
      throw toOrpcError(error, context);
    },
  );
}

async function executeCommand<TMessage extends Command<TResult>, TResult>(
  context: AppaloftOrpcRequestContext,
  message: Result<TMessage>,
): Promise<TResult> {
  return unwrapResult(
    context.executionContext,
    await context.commandBus.execute(
      context.executionContext,
      unwrapResult(context.executionContext, message),
    ),
  );
}

async function executeQuery<TMessage extends Query<TResult>, TResult>(
  context: AppaloftOrpcRequestContext,
  message: Result<TMessage>,
): Promise<TResult> {
  return unwrapResult(
    context.executionContext,
    await context.queryBus.execute(
      context.executionContext,
      unwrapResult(context.executionContext, message),
    ),
  );
}

function createDeploymentStream(
  context: AppaloftOrpcRequestContext,
  input: CreateDeploymentCommandInput,
): AsyncGenerator<DeploymentProgressStreamEvent, { id: string }, void> {
  if (!context.deploymentProgressObserver) {
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "Deployment progress streaming is not available",
      status: 503,
    });
  }

  const deploymentProgressObserver = context.deploymentProgressObserver;

  return (async function* streamDeploymentProgress() {
    const events: DeploymentProgressStreamEvent[] = [];
    let wake: (() => void) | undefined;
    let commandResult: { id: string } | undefined;
    let commandError: unknown;
    let commandDone = false;

    const notify = () => {
      const currentWake = wake;
      wake = undefined;
      currentWake?.();
    };
    const unsubscribe = deploymentProgressObserver.subscribe((eventContext, event) => {
      if (eventContext.requestId !== context.executionContext.requestId) {
        return;
      }

      events.push(toDeploymentProgressStreamEvent(event));
      notify();
    });
    const command = executeCommand<CreateDeploymentCommand, { id: string }>(
      context,
      CreateDeploymentCommand.create(input),
    )
      .then((result) => {
        commandResult = result;
      })
      .catch((error: unknown) => {
        commandError = error;
      })
      .finally(() => {
        commandDone = true;
        notify();
      });

    try {
      while (!commandDone || events.length > 0) {
        const event = events.shift();

        if (event) {
          yield event;
          continue;
        }

        await new Promise<void>((resolve) => {
          wake = resolve;
          if (commandDone || events.length > 0) {
            notify();
          }
        });
      }

      await command;

      if (commandError) {
        throw commandError;
      }

      if (!commandResult) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Deployment stream finished without a deployment result",
          status: 500,
        });
      }

      return commandResult;
    } finally {
      unsubscribe();
    }
  })();
}

function createResourceRuntimeLogStream(
  context: AppaloftOrpcRequestContext,
  input: ResourceRuntimeLogsQueryInput,
): AsyncGenerator<ResourceRuntimeLogEvent, { resourceId: string; deploymentId?: string }, void> {
  const streamResult = (result: ResourceRuntimeLogsResult) => ({
    resourceId: result.resourceId,
    ...(result.deploymentId ? { deploymentId: result.deploymentId } : {}),
  });

  return (async function* streamResourceRuntimeLogs() {
    const result: ResourceRuntimeLogsResult = await executeQuery(
      context,
      ResourceRuntimeLogsQuery.create({
        ...input,
        follow: true,
      }),
    );

    if (result.mode === "bounded") {
      for (const line of result.logs) {
        yield {
          kind: "line",
          line,
        };
      }

      return streamResult(result);
    }

    try {
      for await (const event of result.stream) {
        yield event;

        if (event.kind === "closed" || event.kind === "error") {
          break;
        }
      }

      return streamResult(result);
    } finally {
      await result.stream.close();
    }
  })();
}

function createDeploymentEventStream(
  context: AppaloftOrpcRequestContext,
  input: StreamDeploymentEventsQueryInput,
): AsyncGenerator<DeploymentEventStreamEnvelope, { deploymentId: string }, void> {
  return (async function* streamDeploymentEvents() {
    const result: StreamDeploymentEventsResult = await executeQuery(
      context,
      StreamDeploymentEventsQuery.create({
        ...input,
        follow: true,
      }),
    );

    if (result.mode === "bounded") {
      for (const envelope of result.envelopes) {
        yield envelope;
      }

      return {
        deploymentId: result.deploymentId,
      };
    }

    try {
      for await (const envelope of result.stream) {
        yield envelope;

        if (envelope.kind === "closed" || envelope.kind === "error") {
          break;
        }
      }

      return {
        deploymentId: result.deploymentId,
      };
    } finally {
      await result.stream.close();
    }
  })();
}

function toDeploymentProgressStreamEvent(
  event: DeploymentProgressEvent,
): DeploymentProgressStreamEvent {
  return {
    ...event,
    step: event.step ?? {
      current: 1,
      total: 1,
      label: event.phase,
    },
  };
}

function createRequestExecutionContext(
  executionContextFactory: ExecutionContextFactory,
  entrypoint: "http" | "rpc",
  request: Request,
): ReturnType<ExecutionContextFactory["create"]> {
  const requestId = request.headers.get("x-request-id");

  return executionContextFactory.create({
    entrypoint,
    locale: resolveAppaloftLocaleFromHeaders(request.headers),
    ...(requestId ? { requestId } : {}),
  });
}

export const listProjectsProcedure = base
  .route({
    method: "GET",
    path: "/projects",
    successStatus: 200,
  })
  .output(listProjectsResponseSchema)
  .handler(async ({ context }) => executeQuery(context, ListProjectsQuery.create()));

export const createProjectProcedure = base
  .route({
    method: "POST",
    path: "/projects",
    successStatus: 201,
  })
  .input(createProjectCommandInputSchema)
  .output(createProjectResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateProjectCommand.create(input)),
  );

export const showProjectProcedure = base
  .route({
    method: "GET",
    path: "/projects/{projectId}",
    description: apiRouteDescriptions.projectLifecycle,
    successStatus: 200,
  })
  .input(showProjectQueryInputSchema)
  .output(showProjectResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, ShowProjectQuery.create(input)));

export const renameProjectProcedure = base
  .route({
    method: "POST",
    path: "/projects/{projectId}/rename",
    description: apiRouteDescriptions.projectLifecycle,
    successStatus: 200,
  })
  .input(renameProjectCommandInputSchema)
  .output(renameProjectResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RenameProjectCommand.create(input)),
  );

export const archiveProjectProcedure = base
  .route({
    method: "POST",
    path: "/projects/{projectId}/archive",
    description: apiRouteDescriptions.projectLifecycle,
    successStatus: 200,
  })
  .input(archiveProjectCommandInputSchema)
  .output(archiveProjectResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ArchiveProjectCommand.create(input)),
  );

export const listServersProcedure = base
  .route({
    method: "GET",
    path: "/servers",
    successStatus: 200,
  })
  .output(listServersResponseSchema)
  .handler(async ({ context }) => executeQuery(context, ListServersQuery.create()));

export const showServerProcedure = base
  .route({
    method: "GET",
    path: "/servers/{serverId}",
    description: apiRouteDescriptions.showServer,
    successStatus: 200,
  })
  .input(showServerQueryInputSchema)
  .output(showServerResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, ShowServerQuery.create(input)));

export const renameServerProcedure = base
  .route({
    method: "POST",
    path: "/servers/{serverId}/rename",
    description: apiRouteDescriptions.renameServer,
    successStatus: 200,
  })
  .input(renameServerCommandInputSchema)
  .output(renameServerResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RenameServerCommand.create(input)),
  );

export const configureServerEdgeProxyProcedure = base
  .route({
    method: "POST",
    path: "/servers/{serverId}/edge-proxy/configuration",
    description: apiRouteDescriptions.configureServerEdgeProxy,
    successStatus: 200,
  })
  .input(configureServerEdgeProxyCommandInputSchema)
  .output(configureServerEdgeProxyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureServerEdgeProxyCommand.create(input)),
  );

export const deactivateServerProcedure = base
  .route({
    method: "POST",
    path: "/servers/{serverId}/deactivate",
    description: apiRouteDescriptions.deactivateServer,
    successStatus: 200,
  })
  .input(deactivateServerCommandInputSchema)
  .output(deactivateServerResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DeactivateServerCommand.create(input)),
  );

export const checkServerDeleteSafetyProcedure = base
  .route({
    method: "GET",
    path: "/servers/{serverId}/delete-check",
    description: apiRouteDescriptions.checkServerDeleteSafety,
    successStatus: 200,
  })
  .input(checkServerDeleteSafetyQueryInputSchema)
  .output(checkServerDeleteSafetyResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, CheckServerDeleteSafetyQuery.create(input)),
  );

export const deleteServerProcedure = base
  .route({
    method: "DELETE",
    path: "/servers/{serverId}",
    description: apiRouteDescriptions.deleteServer,
    successStatus: 200,
  })
  .input(deleteServerCommandInputSchema)
  .output(deleteServerResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DeleteServerCommand.create(input)),
  );

export const registerServerProcedure = base
  .route({
    method: "POST",
    path: "/servers",
    description: apiRouteDescriptions.registerServer,
    successStatus: 201,
  })
  .input(registerServerCommandInputSchema)
  .output(registerServerResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RegisterServerCommand.create(input)),
  );

export const configureServerCredentialProcedure = base
  .route({
    method: "POST",
    path: "/servers/{serverId}/credentials",
    description: apiRouteDescriptions.configureServerCredential,
    successStatus: 200,
  })
  .input(configureServerCredentialCommandInputSchema)
  .output(emptyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureServerCredentialCommand.create(input)),
  );

export const listSshCredentialsProcedure = base
  .route({
    method: "GET",
    path: "/credentials/ssh",
    successStatus: 200,
  })
  .input(listSshCredentialsQueryInputSchema)
  .output(listSshCredentialsResponseSchema)
  .handler(async ({ context }) => executeQuery(context, ListSshCredentialsQuery.create()));

export const showSshCredentialProcedure = base
  .route({
    method: "GET",
    path: "/credentials/ssh/{credentialId}",
    description: apiRouteDescriptions.showSshCredential,
    successStatus: 200,
  })
  .input(showSshCredentialQueryInputSchema)
  .output(showSshCredentialResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ShowSshCredentialQuery.create(input)),
  );

export const deleteSshCredentialProcedure = base
  .route({
    method: "DELETE",
    path: "/credentials/ssh/{credentialId}",
    description: apiRouteDescriptions.deleteSshCredential,
    successStatus: 200,
  })
  .input(deleteSshCredentialCommandInputSchema)
  .output(deleteSshCredentialResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DeleteSshCredentialCommand.create(input)),
  );

export const rotateSshCredentialProcedure = base
  .route({
    method: "POST",
    path: "/credentials/ssh/{credentialId}/rotate",
    description: apiRouteDescriptions.rotateSshCredential,
    successStatus: 200,
  })
  .input(rotateSshCredentialCommandInputSchema)
  .output(rotateSshCredentialResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RotateSshCredentialCommand.create(input)),
  );

export const createSshCredentialProcedure = base
  .route({
    method: "POST",
    path: "/credentials/ssh",
    description: apiRouteDescriptions.createSshCredential,
    successStatus: 201,
  })
  .input(createSshCredentialCommandInputSchema)
  .output(createSshCredentialResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateSshCredentialCommand.create(input)),
  );

export const testServerConnectivityProcedure = base
  .route({
    method: "POST",
    path: "/servers/{serverId}/connectivity-tests",
    description: apiRouteDescriptions.testServerConnectivity,
    successStatus: 200,
  })
  .input(testRegisteredServerConnectivityCommandInputSchema)
  .output(testServerConnectivityResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, TestServerConnectivityCommand.create(input)),
  );

export const testDraftServerConnectivityProcedure = base
  .route({
    method: "POST",
    path: "/servers/connectivity-tests",
    description: apiRouteDescriptions.testServerConnectivity,
    successStatus: 200,
  })
  .input(testDraftServerConnectivityCommandInputSchema)
  .output(testServerConnectivityResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, TestServerConnectivityCommand.create(input)),
  );

export const bootstrapServerProxyProcedure = base
  .route({
    method: "POST",
    path: "/servers/{serverId}/edge-proxy/bootstrap",
    description: apiRouteDescriptions.bootstrapServerProxy,
    successStatus: 200,
  })
  .input(bootstrapServerProxyCommandInputSchema)
  .output(bootstrapServerProxyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, BootstrapServerProxyCommand.create(input)),
  );

export const listEnvironmentsProcedure = base
  .route({
    method: "GET",
    path: "/environments",
    successStatus: 200,
  })
  .input(listEnvironmentsQueryInputSchema)
  .output(listEnvironmentsResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListEnvironmentsQuery.create(input)),
  );

export const createEnvironmentProcedure = base
  .route({
    method: "POST",
    path: "/environments",
    successStatus: 201,
  })
  .input(createEnvironmentCommandInputSchema)
  .output(createEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateEnvironmentCommand.create(input)),
  );

export const configureDefaultAccessDomainPolicyProcedure = base
  .route({
    method: "POST",
    path: "/default-access-domain-policies",
    description: apiRouteDescriptions.configureDefaultAccessDomainPolicy,
    successStatus: 200,
  })
  .input(configureDefaultAccessDomainPolicyCommandInputSchema)
  .output(configureDefaultAccessDomainPolicyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureDefaultAccessDomainPolicyCommand.create(input)),
  );

export const listDefaultAccessDomainPoliciesProcedure = base
  .route({
    method: "GET",
    path: "/default-access-domain-policies",
    description: apiRouteDescriptions.listDefaultAccessDomainPolicies,
    successStatus: 200,
  })
  .input(listDefaultAccessDomainPoliciesQueryInputSchema)
  .output(listDefaultAccessDomainPoliciesResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListDefaultAccessDomainPoliciesQuery.create(input)),
  );

export const showDefaultAccessDomainPolicyProcedure = base
  .route({
    method: "GET",
    path: "/default-access-domain-policies/show",
    description: apiRouteDescriptions.showDefaultAccessDomainPolicy,
    successStatus: 200,
  })
  .input(showDefaultAccessDomainPolicyQueryInputSchema)
  .output(showDefaultAccessDomainPolicyResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ShowDefaultAccessDomainPolicyQuery.create(input)),
  );

export const listResourcesProcedure = base
  .route({
    method: "GET",
    path: "/resources",
    successStatus: 200,
  })
  .input(listResourcesQueryInputSchema)
  .output(listResourcesResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, ListResourcesQuery.create(input)));

export const showResourceProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}",
    description: apiRouteDescriptions.showResource,
    successStatus: 200,
  })
  .input(showResourceQueryInputSchema)
  .output(resourceDetailSchema)
  .handler(async ({ input, context }) => executeQuery(context, ShowResourceQuery.create(input)));

export const createResourceProcedure = base
  .route({
    method: "POST",
    path: "/resources",
    successStatus: 201,
  })
  .input(createResourceCommandInputSchema)
  .output(createResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateResourceCommand.create(input)),
  );

export const archiveResourceProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/archive",
    successStatus: 200,
  })
  .input(archiveResourceCommandInputSchema)
  .output(archiveResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ArchiveResourceCommand.create(input)),
  );

export const deleteResourceProcedure = base
  .route({
    method: "DELETE",
    path: "/resources/{resourceId}",
    successStatus: 200,
  })
  .input(deleteResourceCommandInputSchema)
  .output(deleteResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DeleteResourceCommand.create(input)),
  );

export const configureResourceHealthProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/health-policy",
    description: apiRouteDescriptions.configureResourceHealth,
    successStatus: 200,
  })
  .input(configureResourceHealthCommandInputSchema)
  .output(configureResourceHealthResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureResourceHealthCommand.create(input)),
  );

export const configureResourceNetworkProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/network-profile",
    description: apiRouteDescriptions.configureResourceNetwork,
    successStatus: 200,
  })
  .input(configureResourceNetworkCommandInputSchema)
  .output(configureResourceNetworkResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureResourceNetworkCommand.create(input)),
  );

export const configureResourceAccessProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/access-profile",
    description: apiRouteDescriptions.configureResourceAccess,
    successStatus: 200,
  })
  .input(configureResourceAccessCommandInputSchema)
  .output(configureResourceAccessResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureResourceAccessCommand.create(input)),
  );

export const configureResourceAutoDeployProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/auto-deploy",
    description: apiRouteDescriptions.configureResourceAutoDeploy,
    successStatus: 200,
  })
  .input(configureResourceAutoDeployCommandInputSchema)
  .output(configureResourceAutoDeployResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureResourceAutoDeployCommand.create(input)),
  );

export const attachResourceStorageProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/storage-attachments",
    description: apiRouteDescriptions.attachResourceStorage,
    successStatus: 200,
  })
  .input(attachResourceStorageCommandInputSchema)
  .output(attachResourceStorageResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, AttachResourceStorageCommand.create(input)),
  );

export const detachResourceStorageProcedure = base
  .route({
    method: "DELETE",
    path: "/resources/{resourceId}/storage-attachments/{attachmentId}",
    description: apiRouteDescriptions.detachResourceStorage,
    successStatus: 200,
  })
  .input(detachResourceStorageCommandInputSchema)
  .output(detachResourceStorageResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DetachResourceStorageCommand.create(input)),
  );

export const configureResourceRuntimeProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/runtime-profile",
    description: apiRouteDescriptions.configureResourceRuntime,
    successStatus: 200,
  })
  .input(configureResourceRuntimeCommandInputSchema)
  .output(configureResourceRuntimeResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureResourceRuntimeCommand.create(input)),
  );

export const configureResourceSourceProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/source",
    description: apiRouteDescriptions.configureResourceSource,
    successStatus: 200,
  })
  .input(configureResourceSourceCommandInputSchema)
  .output(configureResourceSourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureResourceSourceCommand.create(input)),
  );

export const relinkSourceLinkProcedure = base
  .route({
    method: "POST",
    path: "/source-links/relink",
    description: apiRouteDescriptions.relinkSourceLink,
    successStatus: 200,
  })
  .input(relinkSourceLinkCommandInputSchema)
  .output(relinkSourceLinkResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RelinkSourceLinkCommand.create(input)),
  );

export const setResourceVariableProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/variables",
    description: apiRouteDescriptions.setResourceVariable,
    successStatus: 200,
  })
  .input(setResourceVariableCommandInputSchema)
  .output(setResourceVariableResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, SetResourceVariableCommand.create(input)),
  );

export const importResourceVariablesProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/variables/import",
    description: apiRouteDescriptions.importResourceVariables,
    successStatus: 200,
  })
  .input(importResourceVariablesCommandInputSchema)
  .output(importResourceVariablesResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ImportResourceVariablesCommand.create(input)),
  );

export const unsetResourceVariableProcedure = base
  .route({
    method: "DELETE",
    path: "/resources/{resourceId}/variables/{key}",
    description: apiRouteDescriptions.unsetResourceVariable,
    successStatus: 200,
  })
  .input(unsetResourceVariableCommandInputSchema)
  .output(unsetResourceVariableResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, UnsetResourceVariableCommand.create(input)),
  );

export const resourceEffectiveConfigProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/effective-config",
    description: apiRouteDescriptions.resourceEffectiveConfig,
    successStatus: 200,
  })
  .input(resourceEffectiveConfigQueryInputSchema)
  .output(resourceEffectiveConfigResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ResourceEffectiveConfigQuery.create(input)),
  );

export const createDomainBindingProcedure = base
  .route({
    method: "POST",
    path: "/domain-bindings",
    description: apiRouteDescriptions.createDomainBinding,
    successStatus: 201,
  })
  .input(createDomainBindingCommandInputSchema)
  .output(createDomainBindingResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateDomainBindingCommand.create(input)),
  );

export const showDomainBindingProcedure = base
  .route({
    method: "GET",
    path: "/domain-bindings/{domainBindingId}",
    description: apiRouteDescriptions.showDomainBinding,
    successStatus: 200,
  })
  .input(showDomainBindingQueryInputSchema)
  .output(showDomainBindingResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ShowDomainBindingQuery.create(input)),
  );

export const configureDomainBindingRouteProcedure = base
  .route({
    method: "POST",
    path: "/domain-bindings/{domainBindingId}/route",
    description: apiRouteDescriptions.configureDomainBindingRoute,
    successStatus: 200,
  })
  .input(configureDomainBindingRouteCommandInputSchema)
  .output(configureDomainBindingRouteResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureDomainBindingRouteCommand.create(input)),
  );

export const confirmDomainBindingOwnershipProcedure = base
  .route({
    method: "POST",
    path: "/domain-bindings/{domainBindingId}/ownership-confirmations",
    description: apiRouteDescriptions.confirmDomainBindingOwnership,
    successStatus: 200,
  })
  .input(confirmDomainBindingOwnershipCommandInputSchema)
  .output(confirmDomainBindingOwnershipResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfirmDomainBindingOwnershipCommand.create(input)),
  );

export const checkDomainBindingDeleteSafetyProcedure = base
  .route({
    method: "GET",
    path: "/domain-bindings/{domainBindingId}/delete-check",
    description: apiRouteDescriptions.checkDomainBindingDeleteSafety,
    successStatus: 200,
  })
  .input(checkDomainBindingDeleteSafetyQueryInputSchema)
  .output(checkDomainBindingDeleteSafetyResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, CheckDomainBindingDeleteSafetyQuery.create(input)),
  );

export const deleteDomainBindingProcedure = base
  .route({
    method: "DELETE",
    path: "/domain-bindings/{domainBindingId}",
    description: apiRouteDescriptions.deleteDomainBinding,
    successStatus: 200,
  })
  .input(deleteDomainBindingCommandInputSchema)
  .output(deleteDomainBindingResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DeleteDomainBindingCommand.create(input)),
  );

export const retryDomainBindingVerificationProcedure = base
  .route({
    method: "POST",
    path: "/domain-bindings/{domainBindingId}/verification-retries",
    description: apiRouteDescriptions.retryDomainBindingVerification,
    successStatus: 202,
  })
  .input(retryDomainBindingVerificationCommandInputSchema)
  .output(retryDomainBindingVerificationResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RetryDomainBindingVerificationCommand.create(input)),
  );

export const listDomainBindingsProcedure = base
  .route({
    method: "GET",
    path: "/domain-bindings",
    successStatus: 200,
  })
  .input(listDomainBindingsQueryInputSchema)
  .output(listDomainBindingsResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListDomainBindingsQuery.create(input)),
  );

export const issueOrRenewCertificateProcedure = base
  .route({
    method: "POST",
    path: "/certificates/issue-or-renew",
    description: apiRouteDescriptions.issueOrRenewCertificate,
    successStatus: 202,
  })
  .input(issueOrRenewCertificateCommandInputSchema)
  .output(issueOrRenewCertificateResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, IssueOrRenewCertificateCommand.create(input)),
  );

export const importCertificateProcedure = base
  .route({
    method: "POST",
    path: "/certificates/import",
    description: apiRouteDescriptions.importCertificate,
    successStatus: 200,
  })
  .input(importCertificateCommandInputSchema)
  .output(importCertificateResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ImportCertificateCommand.create(input)),
  );

export const listCertificatesProcedure = base
  .route({
    method: "GET",
    path: "/certificates",
    successStatus: 200,
  })
  .input(listCertificatesQueryInputSchema)
  .output(listCertificatesResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListCertificatesQuery.create(input)),
  );

export const showCertificateProcedure = base
  .route({
    method: "GET",
    path: "/certificates/{certificateId}",
    description: apiRouteDescriptions.showCertificate,
    successStatus: 200,
  })
  .input(showCertificateQueryInputSchema)
  .output(showCertificateResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, ShowCertificateQuery.create(input)));

export const retryCertificateProcedure = base
  .route({
    method: "POST",
    path: "/certificates/{certificateId}/retries",
    description: apiRouteDescriptions.retryCertificate,
    successStatus: 202,
  })
  .input(retryCertificateCommandInputSchema)
  .output(retryCertificateResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RetryCertificateCommand.create(input)),
  );

export const revokeCertificateProcedure = base
  .route({
    method: "POST",
    path: "/certificates/{certificateId}/revoke",
    description: apiRouteDescriptions.revokeCertificate,
    successStatus: 200,
  })
  .input(revokeCertificateCommandInputSchema)
  .output(revokeCertificateResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RevokeCertificateCommand.create(input)),
  );

export const deleteCertificateProcedure = base
  .route({
    method: "DELETE",
    path: "/certificates/{certificateId}",
    description: apiRouteDescriptions.deleteCertificate,
    successStatus: 200,
  })
  .input(deleteCertificateCommandInputSchema)
  .output(deleteCertificateResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DeleteCertificateCommand.create(input)),
  );

export const showEnvironmentProcedure = base
  .route({
    method: "GET",
    path: "/environments/{environmentId}",
    successStatus: 200,
  })
  .input(showEnvironmentQueryInputSchema)
  .output(environmentSummarySchema)
  .handler(async ({ input, context }) => executeQuery(context, ShowEnvironmentQuery.create(input)));

export const archiveEnvironmentProcedure = base
  .route({
    method: "POST",
    path: "/environments/{environmentId}/archive",
    description: apiRouteDescriptions.archiveEnvironment,
    successStatus: 200,
  })
  .input(archiveEnvironmentCommandInputSchema)
  .output(archiveEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ArchiveEnvironmentCommand.create(input)),
  );

export const cloneEnvironmentProcedure = base
  .route({
    method: "POST",
    path: "/environments/{environmentId}/clone",
    description: apiRouteDescriptions.cloneEnvironment,
    successStatus: 200,
  })
  .input(cloneEnvironmentCommandInputSchema)
  .output(cloneEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CloneEnvironmentCommand.create(input)),
  );

export const renameEnvironmentProcedure = base
  .route({
    method: "POST",
    path: "/environments/{environmentId}/rename",
    description: apiRouteDescriptions.renameEnvironment,
    successStatus: 200,
  })
  .input(renameEnvironmentCommandInputSchema)
  .output(renameEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RenameEnvironmentCommand.create(input)),
  );

export const lockEnvironmentProcedure = base
  .route({
    method: "POST",
    path: "/environments/{environmentId}/lock",
    description: apiRouteDescriptions.lockEnvironment,
    successStatus: 200,
  })
  .input(lockEnvironmentCommandInputSchema)
  .output(lockEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, LockEnvironmentCommand.create(input)),
  );

export const unlockEnvironmentProcedure = base
  .route({
    method: "POST",
    path: "/environments/{environmentId}/unlock",
    description: apiRouteDescriptions.unlockEnvironment,
    successStatus: 200,
  })
  .input(unlockEnvironmentCommandInputSchema)
  .output(unlockEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, UnlockEnvironmentCommand.create(input)),
  );

export const setEnvironmentVariableProcedure = base
  .route({
    method: "POST",
    path: "/environments/{environmentId}/variables",
    description: apiRouteDescriptions.setEnvironmentVariable,
    successStatus: 204,
  })
  .input(setEnvironmentVariableCommandInputSchema)
  .output(emptyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, SetEnvironmentVariableCommand.create(input)),
  );

export const unsetEnvironmentVariableProcedure = base
  .route({
    method: "DELETE",
    path: "/environments/{environmentId}/variables/{key}",
    description: apiRouteDescriptions.unsetEnvironmentVariable,
    successStatus: 204,
  })
  .input(unsetEnvironmentVariableCommandInputSchema)
  .output(emptyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, UnsetEnvironmentVariableCommand.create(input)),
  );

export const promoteEnvironmentProcedure = base
  .route({
    method: "POST",
    path: "/environments/{environmentId}/promote",
    description: apiRouteDescriptions.promoteEnvironment,
    successStatus: 200,
  })
  .input(promoteEnvironmentCommandInputSchema)
  .output(promoteEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, PromoteEnvironmentCommand.create(input)),
  );

export const diffEnvironmentsProcedure = base
  .route({
    method: "GET",
    path: "/environments/{environmentId}/diff/{otherEnvironmentId}",
    description: apiRouteDescriptions.diffEnvironments,
    successStatus: 200,
  })
  .input(diffEnvironmentsQueryInputSchema)
  .output(diffEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, DiffEnvironmentsQuery.create(input)),
  );

export const environmentEffectivePrecedenceProcedure = base
  .route({
    method: "GET",
    path: "/environments/{environmentId}/effective-precedence",
    description: apiRouteDescriptions.environmentEffectivePrecedence,
    successStatus: 200,
  })
  .input(environmentEffectivePrecedenceQueryInputSchema)
  .output(environmentEffectivePrecedenceResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, EnvironmentEffectivePrecedenceQuery.create(input)),
  );

export const listDeploymentsProcedure = base
  .route({
    method: "GET",
    path: "/deployments",
    successStatus: 200,
  })
  .input(listDeploymentsQueryInputSchema)
  .output(listDeploymentsResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, ListDeploymentsQuery.create(input)));

export const listOperatorWorkProcedure = base
  .route({
    method: "GET",
    path: "/operator-work",
    description: apiRouteDescriptions.operatorWorkLedger,
    successStatus: 200,
  })
  .input(listOperatorWorkQueryInputSchema)
  .output(listOperatorWorkResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListOperatorWorkQuery.create(input)),
  );

export const showOperatorWorkProcedure = base
  .route({
    method: "GET",
    path: "/operator-work/{workId}",
    description: apiRouteDescriptions.operatorWorkLedger,
    successStatus: 200,
  })
  .input(showOperatorWorkQueryInputSchema)
  .output(showOperatorWorkResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ShowOperatorWorkQuery.create(input)),
  );

export const listSourceEventsProcedure = base
  .route({
    method: "GET",
    path: "/source-events",
    description: apiRouteDescriptions.listSourceEvents,
    successStatus: 200,
  })
  .input(listSourceEventsQueryInputSchema)
  .output(listSourceEventsResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListSourceEventsQuery.create(input)),
  );

export const showSourceEventProcedure = base
  .route({
    method: "GET",
    path: "/source-events/{sourceEventId}",
    description: apiRouteDescriptions.showSourceEvent,
    successStatus: 200,
  })
  .input(showSourceEventQueryInputSchema)
  .output(showSourceEventResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, ShowSourceEventQuery.create(input)));

export const configurePreviewPolicyProcedure = base
  .route({
    method: "POST",
    path: "/preview-policies",
    description: apiRouteDescriptions.configurePreviewPolicy,
    successStatus: 200,
  })
  .input(configurePreviewPolicyCommandInputSchema)
  .output(configurePreviewPolicyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigurePreviewPolicyCommand.create(input)),
  );

export const showPreviewPolicyProcedure = base
  .route({
    method: "POST",
    path: "/preview-policies/show",
    description: apiRouteDescriptions.showPreviewPolicy,
    successStatus: 200,
  })
  .input(showPreviewPolicyQueryInputSchema)
  .output(showPreviewPolicyResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ShowPreviewPolicyQuery.create(input)),
  );

export const listPreviewEnvironmentsProcedure = base
  .route({
    method: "GET",
    path: "/preview-environments",
    description: apiRouteDescriptions.listPreviewEnvironments,
    successStatus: 200,
  })
  .input(listPreviewEnvironmentsQueryInputSchema)
  .output(listPreviewEnvironmentsResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListPreviewEnvironmentsQuery.create(input)),
  );

export const showPreviewEnvironmentProcedure = base
  .route({
    method: "GET",
    path: "/preview-environments/{previewEnvironmentId}",
    description: apiRouteDescriptions.showPreviewEnvironment,
    successStatus: 200,
  })
  .input(showPreviewEnvironmentQueryInputSchema)
  .output(showPreviewEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ShowPreviewEnvironmentQuery.create(input)),
  );

export const deletePreviewEnvironmentProcedure = base
  .route({
    method: "DELETE",
    path: "/resources/{resourceId}/preview-environments/{previewEnvironmentId}",
    description: apiRouteDescriptions.deletePreviewEnvironment,
    successStatus: 202,
  })
  .input(deletePreviewEnvironmentCommandInputSchema)
  .output(deletePreviewEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DeletePreviewEnvironmentCommand.create(input)),
  );

export const createDeploymentProcedure = base
  .route({
    method: "POST",
    path: "/deployments",
    summary: "Create deployment",
    description: createDeploymentRouteDescription,
    successStatus: 201,
  })
  .input(createDeploymentCommandInputSchema)
  .output(createDeploymentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateDeploymentCommand.create(input)),
  );

export const cleanupPreviewProcedure = base
  .route({
    method: "POST",
    path: "/deployments/cleanup-preview",
    summary: "Cleanup preview deployment",
    description: apiRouteDescriptions.cleanupPreview,
    successStatus: 202,
  })
  .input(cleanupPreviewCommandInputSchema)
  .output(cleanupPreviewResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CleanupPreviewCommand.create(input)),
  );

export const retryDeploymentProcedure = base
  .route({
    method: "POST",
    path: "/deployments/{deploymentId}/retry",
    summary: "Retry deployment",
    description: apiRouteDescriptions.deploymentRecoveryReadiness,
    successStatus: 201,
  })
  .input(retryDeploymentCommandInputSchema)
  .output(retryDeploymentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RetryDeploymentCommand.create(input)),
  );

export const redeployDeploymentProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/redeploy",
    summary: "Redeploy resource",
    description: apiRouteDescriptions.deploymentRecoveryReadiness,
    successStatus: 201,
  })
  .input(redeployDeploymentCommandInputSchema)
  .output(redeployDeploymentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RedeployDeploymentCommand.create(input)),
  );

export const rollbackDeploymentProcedure = base
  .route({
    method: "POST",
    path: "/deployments/{deploymentId}/rollback",
    summary: "Roll back deployment",
    description: apiRouteDescriptions.deploymentRecoveryReadiness,
    successStatus: 201,
  })
  .input(rollbackDeploymentCommandInputSchema)
  .output(rollbackDeploymentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RollbackDeploymentCommand.create(input)),
  );

export const showDeploymentProcedure = base
  .route({
    method: "GET",
    path: "/deployments/{deploymentId}",
    successStatus: 200,
  })
  .input(showDeploymentQueryInputSchema)
  .output(showDeploymentResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, ShowDeploymentQuery.create(input)));

export const deploymentPlanProcedure = base
  .route({
    method: "GET",
    path: "/deployments/plan",
    description: apiRouteDescriptions.deploymentPlan,
    successStatus: 200,
  })
  .input(deploymentPlanQueryInputSchema)
  .output(deploymentPlanResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, DeploymentPlanQuery.create(input)));

export const deploymentRecoveryReadinessProcedure = base
  .route({
    method: "GET",
    path: "/deployments/{deploymentId}/recovery-readiness",
    description: apiRouteDescriptions.deploymentRecoveryReadiness,
    successStatus: 200,
  })
  .input(deploymentRecoveryReadinessQueryInputSchema)
  .output(deploymentRecoveryReadinessResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, DeploymentRecoveryReadinessQuery.create(input)),
  );

export const createDeploymentStreamProcedure = base
  .route({
    method: "POST",
    path: "/deployments/stream",
    successStatus: 200,
  })
  .input(createDeploymentCommandInputSchema)
  .output(eventIterator(deploymentProgressEventSchema, createDeploymentResponseSchema))
  .handler(({ input, context }) => createDeploymentStream(context, input));

export const deploymentLogsProcedure = base
  .route({
    method: "GET",
    path: "/deployments/{deploymentId}/logs",
    description: apiRouteDescriptions.deploymentLogs,
    successStatus: 200,
  })
  .input(deploymentLogsQueryInputSchema)
  .output(deploymentLogsResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, DeploymentLogsQuery.create(input)));

export const deploymentEventReplayProcedure = base
  .route({
    method: "GET",
    path: "/deployments/{deploymentId}/events",
    successStatus: 200,
  })
  .input(streamDeploymentEventsQueryInputSchema)
  .output(deploymentEventStreamResponseSchema)
  .handler(async ({ input, context }) => {
    const result: StreamDeploymentEventsResult = await executeQuery(
      context,
      StreamDeploymentEventsQuery.create({
        ...input,
        follow: false,
      }),
    );

    if (result.mode !== "bounded") {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Deployment event query returned a stream for a bounded request",
        status: 500,
      });
    }

    return {
      deploymentId: result.deploymentId,
      envelopes: result.envelopes,
    };
  });

export const deploymentEventStreamProcedure = base
  .route({
    method: "GET",
    path: "/deployments/{deploymentId}/events/stream",
    successStatus: 200,
  })
  .input(streamDeploymentEventsQueryInputSchema)
  .output(
    eventIterator(deploymentEventStreamEnvelopeSchema, deploymentEventStreamStreamResponseSchema),
  )
  .handler(({ input, context }) => createDeploymentEventStream(context, input));

export const resourceRuntimeLogsProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/runtime-logs",
    description: apiRouteDescriptions.resourceRuntimeLogs,
    successStatus: 200,
  })
  .input(resourceRuntimeLogsQueryInputSchema)
  .output(resourceRuntimeLogsResponseSchema)
  .handler(async ({ input, context }) => {
    const result: ResourceRuntimeLogsResult = await executeQuery(
      context,
      ResourceRuntimeLogsQuery.create({
        ...input,
        follow: false,
      }),
    );

    if (result.mode !== "bounded") {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Runtime log query returned a stream for a bounded request",
        status: 500,
      });
    }

    return {
      resourceId: result.resourceId,
      deploymentId: result.deploymentId,
      logs: result.logs,
    };
  });

export const resourceRuntimeLogsStreamProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/runtime-logs/stream",
    description: apiRouteDescriptions.resourceRuntimeLogs,
    successStatus: 200,
  })
  .input(resourceRuntimeLogsQueryInputSchema)
  .output(eventIterator(resourceRuntimeLogEventSchema, resourceRuntimeLogsStreamResponseSchema))
  .handler(({ input, context }) => createResourceRuntimeLogStream(context, input));

export const stopResourceRuntimeProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/runtime/stop",
    description: apiRouteDescriptions.resourceRuntimeControl,
    successStatus: 202,
  })
  .input(stopResourceRuntimeCommandInputSchema)
  .output(stopResourceRuntimeResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, StopResourceRuntimeCommand.create(input)),
  );

export const startResourceRuntimeProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/runtime/start",
    description: apiRouteDescriptions.resourceRuntimeControl,
    successStatus: 202,
  })
  .input(startResourceRuntimeCommandInputSchema)
  .output(startResourceRuntimeResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, StartResourceRuntimeCommand.create(input)),
  );

export const restartResourceRuntimeProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/runtime/restart",
    description: apiRouteDescriptions.resourceRuntimeControl,
    successStatus: 202,
  })
  .input(restartResourceRuntimeCommandInputSchema)
  .output(restartResourceRuntimeResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RestartResourceRuntimeCommand.create(input)),
  );

export const resourceDiagnosticSummaryProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/diagnostic-summary",
    description: apiRouteDescriptions.resourceDiagnosticSummary,
    successStatus: 200,
  })
  .input(resourceDiagnosticSummaryQueryInputSchema)
  .output(resourceDiagnosticSummarySchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ResourceDiagnosticSummaryQuery.create(input)),
  );

export const resourceAccessFailureEvidenceLookupProcedure = base
  .route({
    method: "GET",
    path: "/resource-access-failures/{requestId}",
    description: apiRouteDescriptions.resourceAccessFailureEvidenceLookup,
    successStatus: 200,
  })
  .input(resourceAccessFailureEvidenceLookupQueryInputSchema)
  .output(resourceAccessFailureEvidenceLookupSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ResourceAccessFailureEvidenceLookupQuery.create(input)),
  );

export const resourceHealthProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/health",
    description: apiRouteDescriptions.resourceHealth,
    successStatus: 200,
  })
  .input(resourceHealthQueryInputSchema)
  .output(resourceHealthSummarySchema)
  .handler(async ({ input, context }) => executeQuery(context, ResourceHealthQuery.create(input)));

export const resourceProxyConfigurationPreviewProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/proxy-configuration",
    description: apiRouteDescriptions.resourceProxyConfigurationPreview,
    successStatus: 200,
  })
  .input(resourceProxyConfigurationPreviewQueryInputSchema)
  .output(proxyConfigurationViewSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ResourceProxyConfigurationPreviewQuery.create(input)),
  );

export const listScheduledTasksProcedure = base
  .route({
    method: "GET",
    path: "/scheduled-tasks",
    description: apiRouteDescriptions.listScheduledTasks,
    successStatus: 200,
  })
  .input(listScheduledTasksQueryInputSchema)
  .output(listScheduledTasksResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListScheduledTasksQuery.create(input)),
  );

export const showScheduledTaskProcedure = base
  .route({
    method: "GET",
    path: "/scheduled-tasks/{taskId}",
    description: apiRouteDescriptions.showScheduledTask,
    successStatus: 200,
  })
  .input(showScheduledTaskQueryInputSchema)
  .output(showScheduledTaskResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ShowScheduledTaskQuery.create(input)),
  );

export const createScheduledTaskProcedure = base
  .route({
    method: "POST",
    path: "/scheduled-tasks",
    description: apiRouteDescriptions.createScheduledTask,
    successStatus: 201,
  })
  .input(createScheduledTaskCommandInputSchema)
  .output(scheduledTaskCommandResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateScheduledTaskCommand.create(input)),
  );

export const configureScheduledTaskProcedure = base
  .route({
    method: "POST",
    path: "/scheduled-tasks/{taskId}",
    description: apiRouteDescriptions.configureScheduledTask,
    successStatus: 200,
  })
  .input(configureScheduledTaskCommandInputSchema)
  .output(scheduledTaskCommandResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureScheduledTaskCommand.create(input)),
  );

export const deleteScheduledTaskProcedure = base
  .route({
    method: "DELETE",
    path: "/scheduled-tasks/{taskId}",
    description: apiRouteDescriptions.deleteScheduledTask,
    successStatus: 200,
  })
  .input(deleteScheduledTaskCommandInputSchema)
  .output(deleteScheduledTaskResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DeleteScheduledTaskCommand.create(input)),
  );

export const runScheduledTaskNowProcedure = base
  .route({
    method: "POST",
    path: "/scheduled-tasks/{taskId}/runs",
    description: apiRouteDescriptions.runScheduledTaskNow,
    successStatus: 202,
  })
  .input(runScheduledTaskNowCommandInputSchema)
  .output(runScheduledTaskNowResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RunScheduledTaskNowCommand.create(input)),
  );

export const listScheduledTaskRunsProcedure = base
  .route({
    method: "GET",
    path: "/scheduled-task-runs",
    description: apiRouteDescriptions.listScheduledTaskRuns,
    successStatus: 200,
  })
  .input(listScheduledTaskRunsQueryInputSchema)
  .output(listScheduledTaskRunsResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListScheduledTaskRunsQuery.create(input)),
  );

export const showScheduledTaskRunProcedure = base
  .route({
    method: "GET",
    path: "/scheduled-task-runs/{runId}",
    description: apiRouteDescriptions.showScheduledTaskRun,
    successStatus: 200,
  })
  .input(showScheduledTaskRunQueryInputSchema)
  .output(showScheduledTaskRunResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ShowScheduledTaskRunQuery.create(input)),
  );

export const scheduledTaskRunLogsProcedure = base
  .route({
    method: "GET",
    path: "/scheduled-task-runs/{runId}/logs",
    description: apiRouteDescriptions.scheduledTaskRunLogs,
    successStatus: 200,
  })
  .input(scheduledTaskRunLogsQueryInputSchema)
  .output(scheduledTaskRunLogsResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ScheduledTaskRunLogsQuery.create(input)),
  );

export const createStorageVolumeProcedure = base
  .route({
    method: "POST",
    path: "/storage-volumes",
    description: apiRouteDescriptions.createStorageVolume,
    successStatus: 201,
  })
  .input(createStorageVolumeCommandInputSchema)
  .output(createStorageVolumeResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateStorageVolumeCommand.create(input)),
  );

export const listStorageVolumesProcedure = base
  .route({
    method: "GET",
    path: "/storage-volumes",
    description: apiRouteDescriptions.listStorageVolumes,
    successStatus: 200,
  })
  .input(listStorageVolumesQueryInputSchema)
  .output(listStorageVolumesResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListStorageVolumesQuery.create(input)),
  );

export const showStorageVolumeProcedure = base
  .route({
    method: "GET",
    path: "/storage-volumes/{storageVolumeId}",
    description: apiRouteDescriptions.showStorageVolume,
    successStatus: 200,
  })
  .input(showStorageVolumeQueryInputSchema)
  .output(showStorageVolumeResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ShowStorageVolumeQuery.create(input)),
  );

export const renameStorageVolumeProcedure = base
  .route({
    method: "POST",
    path: "/storage-volumes/{storageVolumeId}/rename",
    description: apiRouteDescriptions.renameStorageVolume,
    successStatus: 200,
  })
  .input(renameStorageVolumeCommandInputSchema)
  .output(renameStorageVolumeResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RenameStorageVolumeCommand.create(input)),
  );

export const deleteStorageVolumeProcedure = base
  .route({
    method: "DELETE",
    path: "/storage-volumes/{storageVolumeId}",
    description: apiRouteDescriptions.deleteStorageVolume,
    successStatus: 200,
  })
  .input(deleteStorageVolumeCommandInputSchema)
  .output(deleteStorageVolumeResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DeleteStorageVolumeCommand.create(input)),
  );

export const provisionPostgresDependencyResourceProcedure = base
  .route({
    method: "POST",
    path: "/dependency-resources/postgres/provision",
    description: apiRouteDescriptions.provisionPostgresDependencyResource,
    successStatus: 201,
  })
  .input(provisionPostgresDependencyResourceCommandInputSchema)
  .output(dependencyResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ProvisionPostgresDependencyResourceCommand.create(input)),
  );

export const importPostgresDependencyResourceProcedure = base
  .route({
    method: "POST",
    path: "/dependency-resources/postgres/import",
    description: apiRouteDescriptions.importPostgresDependencyResource,
    successStatus: 201,
  })
  .input(importPostgresDependencyResourceCommandInputSchema)
  .output(dependencyResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ImportPostgresDependencyResourceCommand.create(input)),
  );

export const provisionRedisDependencyResourceProcedure = base
  .route({
    method: "POST",
    path: "/dependency-resources/redis/provision",
    description: apiRouteDescriptions.provisionRedisDependencyResource,
    successStatus: 201,
  })
  .input(provisionRedisDependencyResourceCommandInputSchema)
  .output(dependencyResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ProvisionRedisDependencyResourceCommand.create(input)),
  );

export const importRedisDependencyResourceProcedure = base
  .route({
    method: "POST",
    path: "/dependency-resources/redis/import",
    description: apiRouteDescriptions.importRedisDependencyResource,
    successStatus: 201,
  })
  .input(importRedisDependencyResourceCommandInputSchema)
  .output(dependencyResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ImportRedisDependencyResourceCommand.create(input)),
  );

export const listDependencyResourcesProcedure = base
  .route({
    method: "GET",
    path: "/dependency-resources",
    description: apiRouteDescriptions.listDependencyResources,
    successStatus: 200,
  })
  .input(listDependencyResourcesQueryInputSchema)
  .output(listDependencyResourcesResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListDependencyResourcesQuery.create(input)),
  );

export const showDependencyResourceProcedure = base
  .route({
    method: "GET",
    path: "/dependency-resources/{dependencyResourceId}",
    description: apiRouteDescriptions.showDependencyResource,
    successStatus: 200,
  })
  .input(showDependencyResourceQueryInputSchema)
  .output(showDependencyResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ShowDependencyResourceQuery.create(input)),
  );

export const renameDependencyResourceProcedure = base
  .route({
    method: "POST",
    path: "/dependency-resources/{dependencyResourceId}/rename",
    description: apiRouteDescriptions.renameDependencyResource,
    successStatus: 200,
  })
  .input(renameDependencyResourceCommandInputSchema)
  .output(dependencyResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RenameDependencyResourceCommand.create(input)),
  );

export const deleteDependencyResourceProcedure = base
  .route({
    method: "DELETE",
    path: "/dependency-resources/{dependencyResourceId}",
    description: apiRouteDescriptions.deleteDependencyResource,
    successStatus: 200,
  })
  .input(deleteDependencyResourceCommandInputSchema)
  .output(dependencyResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DeleteDependencyResourceCommand.create(input)),
  );

export const createDependencyResourceBackupProcedure = base
  .route({
    method: "POST",
    path: "/dependency-resources/{dependencyResourceId}/backups",
    description: apiRouteDescriptions.createDependencyResourceBackup,
    successStatus: 201,
  })
  .input(createDependencyResourceBackupCommandInputSchema)
  .output(dependencyResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateDependencyResourceBackupCommand.create(input)),
  );

export const listDependencyResourceBackupsProcedure = base
  .route({
    method: "GET",
    path: "/dependency-resources/{dependencyResourceId}/backups",
    description: apiRouteDescriptions.listDependencyResourceBackups,
    successStatus: 200,
  })
  .input(listDependencyResourceBackupsQueryInputSchema)
  .output(listDependencyResourceBackupsResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListDependencyResourceBackupsQuery.create(input)),
  );

export const showDependencyResourceBackupProcedure = base
  .route({
    method: "GET",
    path: "/dependency-resources/backups/{backupId}",
    description: apiRouteDescriptions.showDependencyResourceBackup,
    successStatus: 200,
  })
  .input(showDependencyResourceBackupQueryInputSchema)
  .output(showDependencyResourceBackupResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ShowDependencyResourceBackupQuery.create(input)),
  );

export const restoreDependencyResourceBackupProcedure = base
  .route({
    method: "POST",
    path: "/dependency-resources/backups/{backupId}/restore",
    description: apiRouteDescriptions.restoreDependencyResourceBackup,
    successStatus: 202,
  })
  .input(restoreDependencyResourceBackupCommandInputSchema)
  .output(dependencyResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RestoreDependencyResourceBackupCommand.create(input)),
  );

export const bindResourceDependencyProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/dependency-bindings",
    description: apiRouteDescriptions.bindResourceDependency,
    successStatus: 201,
  })
  .input(bindResourceDependencyCommandInputSchema)
  .output(bindResourceDependencyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, BindResourceDependencyCommand.create(input)),
  );

export const unbindResourceDependencyProcedure = base
  .route({
    method: "DELETE",
    path: "/resources/{resourceId}/dependency-bindings/{bindingId}",
    description: apiRouteDescriptions.unbindResourceDependency,
    successStatus: 200,
  })
  .input(unbindResourceDependencyCommandInputSchema)
  .output(unbindResourceDependencyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, UnbindResourceDependencyCommand.create(input)),
  );

export const rotateResourceDependencyBindingSecretProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/dependency-bindings/{bindingId}/secret-rotations",
    description: apiRouteDescriptions.rotateResourceDependencyBindingSecret,
    successStatus: 200,
  })
  .input(rotateResourceDependencyBindingSecretCommandInputSchema)
  .output(rotateResourceDependencyBindingSecretResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RotateResourceDependencyBindingSecretCommand.create(input)),
  );

export const listResourceDependencyBindingsProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/dependency-bindings",
    description: apiRouteDescriptions.listResourceDependencyBindings,
    successStatus: 200,
  })
  .input(listResourceDependencyBindingsQueryInputSchema)
  .output(listResourceDependencyBindingsResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListResourceDependencyBindingsQuery.create(input)),
  );

export const showResourceDependencyBindingProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/dependency-bindings/{bindingId}",
    description: apiRouteDescriptions.showResourceDependencyBinding,
    successStatus: 200,
  })
  .input(showResourceDependencyBindingQueryInputSchema)
  .output(showResourceDependencyBindingResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ShowResourceDependencyBindingQuery.create(input)),
  );

export const openTerminalSessionProcedure = base
  .route({
    method: "POST",
    path: "/terminal-sessions",
    description: apiRouteDescriptions.openTerminalSession,
    successStatus: 201,
  })
  .input(openTerminalSessionCommandInputSchema)
  .output(terminalSessionDescriptorSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, OpenTerminalSessionCommand.create(input)),
  );

export const listProvidersProcedure = base
  .route({
    method: "GET",
    path: "/providers",
    successStatus: 200,
  })
  .output(listProvidersResponseSchema)
  .handler(async ({ context }) => executeQuery(context, ListProvidersQuery.create()));

export const listPluginsProcedure = base
  .route({
    method: "GET",
    path: "/plugins",
    successStatus: 200,
  })
  .output(listPluginsResponseSchema)
  .handler(async ({ context }) => executeQuery(context, ListPluginsQuery.create()));

export const listGitHubRepositoriesProcedure = base
  .route({
    method: "GET",
    path: "/integrations/github/repositories",
    successStatus: 200,
  })
  .input(listGitHubRepositoriesQueryInputSchema)
  .output(listGitHubRepositoriesResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListGitHubRepositoriesQuery.create(input)),
  );

export const appaloftOrpcRouter = {
  projects: {
    list: listProjectsProcedure,
    create: createProjectProcedure,
    show: showProjectProcedure,
    rename: renameProjectProcedure,
    archive: archiveProjectProcedure,
  },
  servers: {
    list: listServersProcedure,
    show: showServerProcedure,
    rename: renameServerProcedure,
    configureEdgeProxy: configureServerEdgeProxyProcedure,
    deactivate: deactivateServerProcedure,
    deleteCheck: checkServerDeleteSafetyProcedure,
    delete: deleteServerProcedure,
    create: registerServerProcedure,
    configureCredential: configureServerCredentialProcedure,
    testConnectivity: testServerConnectivityProcedure,
    testDraftConnectivity: testDraftServerConnectivityProcedure,
    bootstrapProxy: bootstrapServerProxyProcedure,
  },
  credentials: {
    ssh: {
      list: listSshCredentialsProcedure,
      show: showSshCredentialProcedure,
      create: createSshCredentialProcedure,
      delete: deleteSshCredentialProcedure,
      rotate: rotateSshCredentialProcedure,
    },
  },
  environments: {
    list: listEnvironmentsProcedure,
    create: createEnvironmentProcedure,
    show: showEnvironmentProcedure,
    lock: lockEnvironmentProcedure,
    unlock: unlockEnvironmentProcedure,
    archive: archiveEnvironmentProcedure,
    clone: cloneEnvironmentProcedure,
    rename: renameEnvironmentProcedure,
    setVariable: setEnvironmentVariableProcedure,
    unsetVariable: unsetEnvironmentVariableProcedure,
    effectivePrecedence: environmentEffectivePrecedenceProcedure,
    promote: promoteEnvironmentProcedure,
    diff: diffEnvironmentsProcedure,
  },
  defaultAccessDomainPolicies: {
    configure: configureDefaultAccessDomainPolicyProcedure,
    list: listDefaultAccessDomainPoliciesProcedure,
    show: showDefaultAccessDomainPolicyProcedure,
  },
  resources: {
    list: listResourcesProcedure,
    show: showResourceProcedure,
    create: createResourceProcedure,
    archive: archiveResourceProcedure,
    delete: deleteResourceProcedure,
    configureHealth: configureResourceHealthProcedure,
    configureNetwork: configureResourceNetworkProcedure,
    configureAccess: configureResourceAccessProcedure,
    configureAutoDeploy: configureResourceAutoDeployProcedure,
    attachStorage: attachResourceStorageProcedure,
    detachStorage: detachResourceStorageProcedure,
    configureRuntime: configureResourceRuntimeProcedure,
    configureSource: configureResourceSourceProcedure,
    setVariable: setResourceVariableProcedure,
    importVariables: importResourceVariablesProcedure,
    unsetVariable: unsetResourceVariableProcedure,
    effectiveConfig: resourceEffectiveConfigProcedure,
    diagnosticSummary: resourceDiagnosticSummaryProcedure,
    accessFailureEvidence: resourceAccessFailureEvidenceLookupProcedure,
    health: resourceHealthProcedure,
    proxyConfiguration: resourceProxyConfigurationPreviewProcedure,
    logs: resourceRuntimeLogsProcedure,
    logsStream: resourceRuntimeLogsStreamProcedure,
    runtime: {
      stop: stopResourceRuntimeProcedure,
      start: startResourceRuntimeProcedure,
      restart: restartResourceRuntimeProcedure,
    },
    dependencyBindings: {
      bind: bindResourceDependencyProcedure,
      unbind: unbindResourceDependencyProcedure,
      rotateSecret: rotateResourceDependencyBindingSecretProcedure,
      list: listResourceDependencyBindingsProcedure,
      show: showResourceDependencyBindingProcedure,
    },
  },
  storageVolumes: {
    create: createStorageVolumeProcedure,
    list: listStorageVolumesProcedure,
    show: showStorageVolumeProcedure,
    rename: renameStorageVolumeProcedure,
    delete: deleteStorageVolumeProcedure,
  },
  scheduledTasks: {
    list: listScheduledTasksProcedure,
    show: showScheduledTaskProcedure,
    create: createScheduledTaskProcedure,
    configure: configureScheduledTaskProcedure,
    delete: deleteScheduledTaskProcedure,
    runNow: runScheduledTaskNowProcedure,
    runs: {
      list: listScheduledTaskRunsProcedure,
      show: showScheduledTaskRunProcedure,
      logs: scheduledTaskRunLogsProcedure,
    },
  },
  dependencyResources: {
    provisionPostgres: provisionPostgresDependencyResourceProcedure,
    importPostgres: importPostgresDependencyResourceProcedure,
    provisionRedis: provisionRedisDependencyResourceProcedure,
    importRedis: importRedisDependencyResourceProcedure,
    list: listDependencyResourcesProcedure,
    show: showDependencyResourceProcedure,
    rename: renameDependencyResourceProcedure,
    delete: deleteDependencyResourceProcedure,
    createBackup: createDependencyResourceBackupProcedure,
    listBackups: listDependencyResourceBackupsProcedure,
    showBackup: showDependencyResourceBackupProcedure,
    restoreBackup: restoreDependencyResourceBackupProcedure,
  },
  terminalSessions: {
    open: openTerminalSessionProcedure,
  },
  domainBindings: {
    list: listDomainBindingsProcedure,
    show: showDomainBindingProcedure,
    create: createDomainBindingProcedure,
    configureRoute: configureDomainBindingRouteProcedure,
    confirmOwnership: confirmDomainBindingOwnershipProcedure,
    deleteCheck: checkDomainBindingDeleteSafetyProcedure,
    delete: deleteDomainBindingProcedure,
    retryVerification: retryDomainBindingVerificationProcedure,
  },
  certificates: {
    import: importCertificateProcedure,
    list: listCertificatesProcedure,
    show: showCertificateProcedure,
    issueOrRenew: issueOrRenewCertificateProcedure,
    retry: retryCertificateProcedure,
    revoke: revokeCertificateProcedure,
    delete: deleteCertificateProcedure,
  },
  deployments: {
    list: listDeploymentsProcedure,
    create: createDeploymentProcedure,
    cleanupPreview: cleanupPreviewProcedure,
    retry: retryDeploymentProcedure,
    redeploy: redeployDeploymentProcedure,
    rollback: rollbackDeploymentProcedure,
    plan: deploymentPlanProcedure,
    show: showDeploymentProcedure,
    recoveryReadiness: deploymentRecoveryReadinessProcedure,
    createStream: createDeploymentStreamProcedure,
    logs: deploymentLogsProcedure,
    events: deploymentEventReplayProcedure,
    eventsStream: deploymentEventStreamProcedure,
  },
  operatorWork: {
    list: listOperatorWorkProcedure,
    show: showOperatorWorkProcedure,
  },
  sourceEvents: {
    list: listSourceEventsProcedure,
    show: showSourceEventProcedure,
  },
  sourceLinks: {
    relink: relinkSourceLinkProcedure,
  },
  previewPolicies: {
    configure: configurePreviewPolicyProcedure,
    show: showPreviewPolicyProcedure,
  },
  previewEnvironments: {
    list: listPreviewEnvironmentsProcedure,
    show: showPreviewEnvironmentProcedure,
    delete: deletePreviewEnvironmentProcedure,
  },
  providers: {
    list: listProvidersProcedure,
  },
  plugins: {
    list: listPluginsProcedure,
  },
  integrations: {
    github: {
      repositories: {
        list: listGitHubRepositoriesProcedure,
      },
    },
  },
} as const;

export type AppaloftOrpcRouter = typeof appaloftOrpcRouter;

export function createAppaloftOpenApiHandler() {
  return new OpenAPIHandler(appaloftOrpcRouter);
}

export function createAppaloftRpcHandler() {
  return new RPCHandler(appaloftOrpcRouter);
}

function createRequestRunner(
  request: Request,
  executionContext: ExecutionContext,
  requestContextRunner?: RequestContextRunner,
): <T>(callback: () => Promise<T>) => Promise<T> {
  if (requestContextRunner) {
    return <T>(callback: () => Promise<T>) =>
      requestContextRunner.runWithRequest(request, executionContext, callback);
  }

  return <T>(callback: () => Promise<T>) => callback();
}

function domainErrorHttpResponse(error: DomainError, context: ExecutionContext): Response {
  const mapped = toOrpcError(error, context);
  return Response.json(
    {
      error: {
        code: error.code,
        category: error.category,
        message: mapped.message,
        retryable: error.retryable,
      },
    },
    {
      status: mapped.status,
    },
  );
}

function sourceEventRouteUnavailableResponse(): Response {
  return Response.json(
    {
      error: {
        code: "source_event_ingestion_unavailable",
        category: "infra",
        message: "Source event ingestion is not available",
        retryable: true,
      },
    },
    {
      status: 503,
    },
  );
}

function requiredPreviewContextHeader(
  request: Request,
  headerName: string,
  label: string,
): Result<string> {
  const value = request.headers.get(headerName)?.trim();
  if (value) {
    return ok(value);
  }

  return err(
    domainError.validation(`${label} header is required for preview pull request ingestion`, {
      phase: "preview-event-ingestion",
      header: headerName,
    }),
  );
}

function previewSourceEventIdFromDelivery(deliveryId: string): string {
  const normalized = deliveryId.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  return `sevt_preview_${normalized.slice(0, 96) || "delivery"}`;
}

interface PreviewPullRequestContextSelection {
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  sourceBindingFingerprint: string;
}

const previewContextHeaderNames = [
  "x-appaloft-project-id",
  "x-appaloft-environment-id",
  "x-appaloft-resource-id",
  "x-appaloft-server-id",
  "x-appaloft-destination-id",
  "x-appaloft-source-binding-fingerprint",
] as const;

function hasTrustedPreviewContextHeader(request: Request): boolean {
  return previewContextHeaderNames.some((headerName) => request.headers.has(headerName));
}

function trustedPreviewContextFromHeaders(
  request: Request,
): Result<PreviewPullRequestContextSelection> {
  const projectId = requiredPreviewContextHeader(request, "x-appaloft-project-id", "Project id");
  const environmentId = requiredPreviewContextHeader(
    request,
    "x-appaloft-environment-id",
    "Environment id",
  );
  const resourceId = requiredPreviewContextHeader(request, "x-appaloft-resource-id", "Resource id");
  const serverId = requiredPreviewContextHeader(request, "x-appaloft-server-id", "Server id");
  const destinationId = requiredPreviewContextHeader(
    request,
    "x-appaloft-destination-id",
    "Destination id",
  );
  const sourceBindingFingerprint = requiredPreviewContextHeader(
    request,
    "x-appaloft-source-binding-fingerprint",
    "Source binding fingerprint",
  );
  if (projectId.isErr()) return err(projectId.error);
  if (environmentId.isErr()) return err(environmentId.error);
  if (resourceId.isErr()) return err(resourceId.error);
  if (serverId.isErr()) return err(serverId.error);
  if (destinationId.isErr()) return err(destinationId.error);
  if (sourceBindingFingerprint.isErr()) return err(sourceBindingFingerprint.error);

  return ok({
    projectId: projectId.value,
    environmentId: environmentId.value,
    resourceId: resourceId.value,
    serverId: serverId.value,
    destinationId: destinationId.value,
    sourceBindingFingerprint: sourceBindingFingerprint.value,
  });
}

function githubRepositoryLocator(repositoryFullName: string): string {
  return `https://github.com/${repositoryFullName}.git`;
}

function previewRefMatches(candidateRef: string, baseRef: string): boolean {
  return candidateRef === baseRef || candidateRef === `refs/heads/${baseRef}`;
}

async function mappedPreviewContextFromSourcePolicy(input: {
  context: AppaloftOrpcContext;
  executionContext: ExecutionContext;
  event: {
    repositoryFullName: string;
    providerRepositoryId?: string;
    installationId?: string;
    baseRef: string;
  };
}): Promise<Result<PreviewPullRequestContextSelection>> {
  const policyReader = input.context.sourceEventPolicyReader;
  if (!policyReader) {
    return err(
      domainError.validation("Preview pull request context headers are required", {
        phase: "preview-event-ingestion",
      }),
    );
  }

  const candidates = await policyReader.listCandidates(
    toRepositoryContext(input.executionContext),
    {
      sourceKind: "github",
      sourceIdentity: {
        locator: githubRepositoryLocator(input.event.repositoryFullName),
        repositoryFullName: input.event.repositoryFullName,
        ...(input.event.providerRepositoryId
          ? { providerRepositoryId: input.event.providerRepositoryId }
          : {}),
      },
    },
  );
  const eligibleCandidates = candidates.filter(
    (candidate) =>
      candidate.status === "enabled" &&
      Boolean(candidate.serverId) &&
      Boolean(candidate.destinationId) &&
      Boolean(candidate.sourceBindingFingerprint) &&
      candidate.refs.some((ref) => previewRefMatches(ref, input.event.baseRef)),
  );

  if (eligibleCandidates.length === 0) {
    return err(
      domainError.validation("No preview context matched the GitHub pull request repository", {
        phase: "preview-event-ingestion",
        provider: "github",
        repositoryFullName: input.event.repositoryFullName,
        baseRef: input.event.baseRef,
        ...(input.event.installationId ? { installationId: input.event.installationId } : {}),
      }),
    );
  }

  if (eligibleCandidates.length > 1) {
    return err(
      domainError.conflict("GitHub pull request preview context is ambiguous", {
        phase: "preview-event-ingestion",
        provider: "github",
        repositoryFullName: input.event.repositoryFullName,
        baseRef: input.event.baseRef,
        matchCount: eligibleCandidates.length,
        ...(input.event.installationId ? { installationId: input.event.installationId } : {}),
      }),
    );
  }

  const candidate = eligibleCandidates[0];
  if (!candidate?.serverId || !candidate.destinationId || !candidate.sourceBindingFingerprint) {
    return err(
      domainError.validation("GitHub pull request preview context is incomplete", {
        phase: "preview-event-ingestion",
        provider: "github",
        repositoryFullName: input.event.repositoryFullName,
      }),
    );
  }

  return ok({
    projectId: candidate.projectId,
    environmentId: candidate.environmentId,
    resourceId: candidate.resourceId,
    serverId: candidate.serverId,
    destinationId: candidate.destinationId,
    sourceBindingFingerprint: candidate.sourceBindingFingerprint,
  });
}

async function resolvePreviewPullRequestContext(input: {
  context: AppaloftOrpcContext;
  executionContext: ExecutionContext;
  request: Request;
  event: {
    repositoryFullName: string;
    providerRepositoryId?: string;
    installationId?: string;
    baseRef: string;
  };
}): Promise<Result<PreviewPullRequestContextSelection>> {
  const trustedHeaders = trustedPreviewContextFromHeaders(input.request);
  if (trustedHeaders.isOk()) {
    return trustedHeaders;
  }

  if (hasTrustedPreviewContextHeader(input.request)) {
    return err(trustedHeaders.error);
  }

  if (!input.context.sourceEventPolicyReader) {
    return err(trustedHeaders.error);
  }

  return mappedPreviewContextFromSourcePolicy(input);
}

function parseGenericSignedSourceEventBody(
  rawBody: string,
  executionContext: ExecutionContext,
): Result<z.output<typeof genericSignedSourceEventBodySchema>> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return err(
      domainError.validation("Generic signed source event body must be valid JSON", {
        phase: "source-event-normalization",
      }),
    );
  }

  const parsed = genericSignedSourceEventBodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return err(
      domainError.validation("Generic signed source event body is invalid", {
        phase: "source-event-normalization",
        issueCount: parsed.error.issues.length,
        locale: executionContext.locale ?? null,
      }),
    );
  }

  return ok(parsed.data);
}

async function resolveGenericSignedSecretValue(
  context: ExecutionContext,
  resourceRepository: ResourceRepository,
  resourceIdValue: string,
): Promise<Result<string>> {
  const resourceId = ResourceId.create(resourceIdValue);
  if (resourceId.isErr()) {
    return err(resourceId.error);
  }

  const resource = await resourceRepository.findOne(
    toRepositoryContext(context),
    ResourceByIdSpec.create(resourceId.value),
  );
  if (!resource) {
    return err(domainError.notFound("resource", resourceId.value.value));
  }

  const state = resource.toState();
  const secretRef = state.autoDeployPolicy?.genericWebhookSecretRef;
  if (
    !state.autoDeployPolicy ||
    state.autoDeployPolicy.triggerKind.value !== "generic-signed-webhook" ||
    !secretRef
  ) {
    return err(
      domainError.resourceAutoDeploySecretUnavailable(
        "Generic signed webhook secret is unavailable",
        {
          phase: "source-event-verification",
          resourceId: resourceId.value.value,
          refFamily: "resource-secret",
        },
      ),
    );
  }

  const secretKey = secretRef.resourceVariableKey();
  const variable = state.variables
    .toState()
    .find(
      (candidate) =>
        candidate.key.equals(secretKey) &&
        candidate.scope.value === "resource" &&
        candidate.exposure.value === "runtime" &&
        (candidate.isSecret || candidate.kind.value === "secret"),
    );

  if (!variable) {
    return err(
      domainError.resourceAutoDeploySecretUnavailable(
        "Generic signed webhook secret is unavailable",
        {
          phase: "source-event-verification",
          resourceId: resourceId.value.value,
          refFamily: "resource-secret",
        },
      ),
    );
  }

  return ok(variable.value.value);
}

async function handleGenericSignedSourceEventRoute(input: {
  context: AppaloftOrpcContext;
  executionContext: ExecutionContext;
  request: Request;
  resourceId: string;
}): Promise<Response> {
  const { context, executionContext, request, resourceId } = input;
  if (!context.resourceRepository || !context.sourceEventVerificationPort) {
    return sourceEventRouteUnavailableResponse();
  }

  const signature = request.headers.get("x-appaloft-signature") ?? "";
  const rawBody = await request.text();
  const body = parseGenericSignedSourceEventBody(rawBody, executionContext);
  if (body.isErr()) {
    return domainErrorHttpResponse(body.error, executionContext);
  }

  const secretValue = await resolveGenericSignedSecretValue(
    executionContext,
    context.resourceRepository,
    resourceId,
  );
  if (secretValue.isErr()) {
    return domainErrorHttpResponse(secretValue.error, executionContext);
  }

  const sourceIdentity = {
    locator: body.value.sourceIdentity.locator,
    ...(body.value.sourceIdentity.providerRepositoryId
      ? { providerRepositoryId: body.value.sourceIdentity.providerRepositoryId }
      : {}),
    ...(body.value.sourceIdentity.repositoryFullName
      ? { repositoryFullName: body.value.sourceIdentity.repositoryFullName }
      : {}),
  };
  const verified = await context.sourceEventVerificationPort.verify(executionContext, {
    sourceKind: "generic-signed",
    eventKind: body.value.eventKind,
    sourceIdentity,
    ref: body.value.ref,
    revision: body.value.revision,
    rawBody,
    signature,
    secretValue: secretValue.value,
    method: "generic-hmac",
    ...(body.value.deliveryId ? { deliveryId: body.value.deliveryId } : {}),
    ...(body.value.idempotencyKey ? { idempotencyKey: body.value.idempotencyKey } : {}),
    ...(body.value.receivedAt ? { receivedAt: body.value.receivedAt } : {}),
  });
  if (verified.isErr()) {
    return domainErrorHttpResponse(verified.error, executionContext);
  }

  const command = IngestSourceEventCommand.create({
    ...verified.value,
    scopeResourceId: resourceId,
  });
  if (command.isErr()) {
    return domainErrorHttpResponse(command.error, executionContext);
  }

  const result = await context.commandBus.execute(executionContext, command.value);
  if (result.isErr()) {
    return domainErrorHttpResponse(result.error, executionContext);
  }

  return Response.json(result.value);
}

async function handleGitHubSourceEventRoute(input: {
  context: AppaloftOrpcContext;
  executionContext: ExecutionContext;
  request: Request;
}): Promise<Response> {
  const { context, executionContext, request } = input;
  if (
    !context.githubSourceEventWebhookVerifier &&
    !context.githubPreviewPullRequestWebhookVerifier
  ) {
    return sourceEventRouteUnavailableResponse();
  }

  const secretValue = context.githubWebhookSecret?.trim();
  if (!secretValue) {
    return domainErrorHttpResponse(
      domainError.sourceEventProviderWebhookNotConfigured(
        "GitHub source event webhook secret is not configured",
        {
          phase: "source-event-verification",
          sourceKind: "github",
        },
      ),
      executionContext,
    );
  }

  const eventName = request.headers.get("x-github-event")?.trim() ?? "";
  const deliveryId = request.headers.get("x-github-delivery")?.trim();
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const rawBody = await request.text();

  if (eventName === "pull_request") {
    return handleGitHubPreviewPullRequestRoute({
      context,
      executionContext,
      request,
      eventName,
      signature,
      rawBody,
      secretValue,
      ...(deliveryId ? { deliveryId } : {}),
    });
  }

  if (!context.githubSourceEventWebhookVerifier) {
    return sourceEventRouteUnavailableResponse();
  }

  const verified = await context.githubSourceEventWebhookVerifier.verify(executionContext, {
    eventName,
    rawBody,
    signature,
    secretValue,
    ...(deliveryId ? { deliveryId } : {}),
  });
  if (verified.isErr()) {
    return domainErrorHttpResponse(verified.error, executionContext);
  }

  if (verified.value.outcome === "noop") {
    return new Response(null, { status: 204 });
  }

  const command = IngestSourceEventCommand.create(verified.value.sourceEvent);
  if (command.isErr()) {
    return domainErrorHttpResponse(command.error, executionContext);
  }

  const result = await context.commandBus.execute(executionContext, command.value);
  if (result.isErr()) {
    return domainErrorHttpResponse(result.error, executionContext);
  }

  return Response.json(result.value);
}

async function handleActionSourceLinkDeploymentRoute(input: {
  context: AppaloftOrpcContext;
  executionContext: ExecutionContext;
  request: Request;
}): Promise<Response> {
  const { context, executionContext, request } = input;
  if (!context.sourceLinkRepository) {
    return domainErrorHttpResponse(
      domainError.validation("Source link repository is unavailable", {
        phase: "action-source-link-deployment",
      }),
      executionContext,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await request.text());
  } catch {
    return domainErrorHttpResponse(
      domainError.validation("Action deployment body must be valid JSON", {
        phase: "action-source-link-deployment",
      }),
      executionContext,
    );
  }

  const body = actionSourceLinkDeploymentBodySchema.safeParse(parsedJson);
  if (!body.success) {
    return domainErrorHttpResponse(
      domainError.validation("Action deployment body is invalid", {
        phase: "action-source-link-deployment",
        issueCount: body.error.issues.length,
      }),
      executionContext,
    );
  }

  const link = await context.sourceLinkRepository.findOne(
    SourceLinkBySourceFingerprintSpec.create(body.data.sourceFingerprint),
  );
  if (link.isErr()) {
    return domainErrorHttpResponse(link.error, executionContext);
  }

  const hasExplicitContext = Boolean(
    body.data.projectId ||
      body.data.environmentId ||
      body.data.resourceId ||
      body.data.serverId ||
      body.data.destinationId,
  );
  if (
    hasExplicitContext &&
    (!body.data.projectId ||
      !body.data.environmentId ||
      !body.data.resourceId ||
      !body.data.serverId)
  ) {
    return domainErrorHttpResponse(
      domainError.validation(
        "Action deployment source-link bootstrap requires project, environment, resource, and server ids",
        {
          phase: "action-source-link-deployment",
          sourceFingerprint: body.data.sourceFingerprint,
        },
      ),
      executionContext,
    );
  }

  if (!link.value && !hasExplicitContext) {
    return domainErrorHttpResponse(
      domainError.notFound("Source link", body.data.sourceFingerprint),
      executionContext,
    );
  }

  if (link.value && hasExplicitContext) {
    const conflict =
      link.value.projectId !== body.data.projectId ||
      link.value.environmentId !== body.data.environmentId ||
      link.value.resourceId !== body.data.resourceId ||
      link.value.serverId !== body.data.serverId ||
      Boolean(body.data.destinationId && link.value.destinationId !== body.data.destinationId);
    if (conflict) {
      return domainErrorHttpResponse(
        domainError.validation(
          "Action deployment explicit context conflicts with existing source link; relink the source before deploying",
          {
            phase: "action-source-link-deployment",
            sourceFingerprint: body.data.sourceFingerprint,
          },
        ),
        executionContext,
      );
    }
  }

  const target = link.value ?? {
    sourceFingerprint: body.data.sourceFingerprint,
    projectId: body.data.projectId ?? "",
    environmentId: body.data.environmentId ?? "",
    resourceId: body.data.resourceId ?? "",
    serverId: body.data.serverId,
    ...(body.data.destinationId ? { destinationId: body.data.destinationId } : {}),
    updatedAt: new Date().toISOString(),
    reason: "github-action-source-link-bootstrap",
  };

  if (!target.serverId) {
    return domainErrorHttpResponse(
      domainError.validation("Source link does not include a deployment target", {
        phase: "action-source-link-deployment",
        sourceFingerprint: body.data.sourceFingerprint,
      }),
      executionContext,
    );
  }

  const command = CreateDeploymentCommand.create({
    projectId: target.projectId,
    environmentId: target.environmentId,
    resourceId: target.resourceId,
    serverId: target.serverId,
    ...(target.destinationId ? { destinationId: target.destinationId } : {}),
  });
  if (command.isErr()) {
    return domainErrorHttpResponse(command.error, executionContext);
  }

  const result = await context.commandBus.execute(executionContext, command.value);
  if (result.isErr()) {
    return domainErrorHttpResponse(result.error, executionContext);
  }

  if (!link.value) {
    const record = {
      sourceFingerprint: target.sourceFingerprint,
      projectId: target.projectId,
      environmentId: target.environmentId,
      resourceId: target.resourceId,
      updatedAt: target.updatedAt,
      reason: "github-action-source-link-bootstrap",
      ...(target.serverId ? { serverId: target.serverId } : {}),
      ...(target.destinationId ? { destinationId: target.destinationId } : {}),
    } satisfies SourceLinkRecord;
    const persisted = await context.sourceLinkRepository.upsert(
      record,
      UpsertSourceLinkSpec.fromRecord(record),
    );
    if (persisted.isErr()) {
      return domainErrorHttpResponse(persisted.error, executionContext);
    }
  }

  return Response.json(result.value, { status: 202 });
}

async function handleGitHubPreviewPullRequestRoute(input: {
  context: AppaloftOrpcContext;
  executionContext: ExecutionContext;
  request: Request;
  eventName: string;
  deliveryId?: string;
  signature: string;
  rawBody: string;
  secretValue: string;
}): Promise<Response> {
  const {
    context,
    executionContext,
    request,
    eventName,
    deliveryId,
    signature,
    rawBody,
    secretValue,
  } = input;
  if (!context.githubPreviewPullRequestWebhookVerifier) {
    return sourceEventRouteUnavailableResponse();
  }

  if (!deliveryId) {
    return domainErrorHttpResponse(
      domainError.validation("GitHub delivery id is required for preview pull request ingestion", {
        phase: "preview-webhook-verification",
        sourceKind: "github",
        eventKind: eventName,
      }),
      executionContext,
    );
  }

  const verified = await context.githubPreviewPullRequestWebhookVerifier.verify(executionContext, {
    eventName,
    rawBody,
    signature,
    secretValue,
    deliveryId,
  });
  if (verified.isErr()) {
    return domainErrorHttpResponse(verified.error, executionContext);
  }

  if (verified.value.outcome === "noop") {
    return new Response(null, { status: 204 });
  }

  const previewContext = await resolvePreviewPullRequestContext({
    context,
    executionContext,
    request,
    event: verified.value.previewEvent,
  });
  if (previewContext.isErr()) {
    return domainErrorHttpResponse(previewContext.error, executionContext);
  }

  const command = IngestPreviewPullRequestEventCommand.create({
    sourceEventId: previewSourceEventIdFromDelivery(deliveryId),
    event: verified.value.previewEvent,
    projectId: previewContext.value.projectId,
    environmentId: previewContext.value.environmentId,
    resourceId: previewContext.value.resourceId,
    serverId: previewContext.value.serverId,
    destinationId: previewContext.value.destinationId,
    sourceBindingFingerprint: previewContext.value.sourceBindingFingerprint,
  });
  if (command.isErr()) {
    return domainErrorHttpResponse(command.error, executionContext);
  }

  const result = await context.commandBus.execute(executionContext, command.value);
  if (result.isErr()) {
    return domainErrorHttpResponse(result.error, executionContext);
  }

  return Response.json(result.value);
}

export function mountAppaloftOrpcRoutes(
  app: Elysia,
  context: AppaloftOrpcContext & {
    requestContextRunner?: RequestContextRunner;
  },
): Elysia {
  const openApiHandler = createAppaloftOpenApiHandler();
  const rpcHandler = createAppaloftRpcHandler();

  const openApiRouteHandler = async ({ request }: { request: Request }) => {
    const executionContext = createRequestExecutionContext(
      context.executionContextFactory,
      "http",
      request,
    );
    const run = createRequestRunner(request, executionContext, context.requestContextRunner);
    try {
      const { matched, response } = await run(() =>
        openApiHandler.handle(request, {
          prefix: "/api",
          context: {
            ...context,
            executionContext,
          },
        }),
      );

      if (!matched) {
        return new Response("Not Found", {
          status: 404,
        });
      }

      await logOrpcErrorResponse(context.logger, "orpc_http_handler_error", request, response);
      return response;
    } catch (error) {
      context.logger.error("orpc_http_handler_unhandled_error", {
        method: request.method,
        url: request.url,
        ...buildUnexpectedErrorContext(error),
      });
      throw error;
    }
  };

  const rpcRouteHandler = async ({ request }: { request: Request }) => {
    const executionContext = createRequestExecutionContext(
      context.executionContextFactory,
      "rpc",
      request,
    );
    const run = createRequestRunner(request, executionContext, context.requestContextRunner);
    try {
      const { matched, response } = await run(() =>
        rpcHandler.handle(request, {
          prefix: "/api/rpc",
          context: {
            ...context,
            executionContext,
          },
        }),
      );

      if (!matched) {
        return new Response("Not Found", {
          status: 404,
        });
      }

      await logOrpcErrorResponse(context.logger, "orpc_rpc_handler_error", request, response);
      return response;
    } catch (error) {
      context.logger.error("orpc_rpc_handler_unhandled_error", {
        method: request.method,
        url: request.url,
        ...buildUnexpectedErrorContext(error),
      });
      throw error;
    }
  };

  const genericSignedSourceEventRouteHandler = async ({
    request,
    params,
  }: {
    request: Request;
    params: { resourceId: string };
  }) => {
    const executionContext = createRequestExecutionContext(
      context.executionContextFactory,
      "http",
      request,
    );
    const run = createRequestRunner(request, executionContext, context.requestContextRunner);

    try {
      return await run(() =>
        handleGenericSignedSourceEventRoute({
          context,
          executionContext,
          request,
          resourceId: params.resourceId,
        }),
      );
    } catch (error) {
      context.logger.error("generic_signed_source_event_route_unhandled_error", {
        method: request.method,
        url: request.url,
        ...buildUnexpectedErrorContext(error),
      });
      throw error;
    }
  };

  const githubSourceEventRouteHandler = async ({ request }: { request: Request }) => {
    const executionContext = createRequestExecutionContext(
      context.executionContextFactory,
      "http",
      request,
    );
    const run = createRequestRunner(request, executionContext, context.requestContextRunner);

    try {
      return await run(() =>
        handleGitHubSourceEventRoute({
          context,
          executionContext,
          request,
        }),
      );
    } catch (error) {
      context.logger.error("github_source_event_route_unhandled_error", {
        method: request.method,
        url: request.url,
        ...buildUnexpectedErrorContext(error),
      });
      throw error;
    }
  };

  const actionSourceLinkDeploymentRouteHandler = async ({ request }: { request: Request }) => {
    const executionContext = createRequestExecutionContext(
      context.executionContextFactory,
      "http",
      request,
    );
    const run = createRequestRunner(request, executionContext, context.requestContextRunner);

    try {
      return await run(() =>
        handleActionSourceLinkDeploymentRoute({
          context,
          executionContext,
          request,
        }),
      );
    } catch (error) {
      context.logger.error("action_source_link_deployment_route_unhandled_error", {
        method: request.method,
        url: request.url,
        ...buildUnexpectedErrorContext(error),
      });
      throw error;
    }
  };

  const routes = [
    "/api/projects",
    "/api/projects/:projectId",
    "/api/projects/:projectId/rename",
    "/api/projects/:projectId/archive",
    "/api/credentials/ssh",
    "/api/credentials/ssh/:credentialId",
    "/api/credentials/ssh/:credentialId/rotate",
    "/api/servers",
    "/api/servers/:serverId",
    "/api/servers/:serverId/rename",
    "/api/servers/:serverId/edge-proxy/configuration",
    "/api/servers/:serverId/deactivate",
    "/api/servers/:serverId/delete-check",
    "/api/servers/connectivity-tests",
    "/api/servers/:serverId/credentials",
    "/api/servers/:serverId/connectivity-tests",
    "/api/servers/:serverId/edge-proxy/bootstrap",
    "/api/environments",
    "/api/default-access-domain-policies",
    "/api/default-access-domain-policies/show",
    "/api/environments/:environmentId",
    "/api/environments/:environmentId/lock",
    "/api/environments/:environmentId/unlock",
    "/api/environments/:environmentId/archive",
    "/api/environments/:environmentId/clone",
    "/api/environments/:environmentId/rename",
    "/api/environments/:environmentId/variables",
    "/api/environments/:environmentId/variables/:key",
    "/api/environments/:environmentId/effective-precedence",
    "/api/environments/:environmentId/promote",
    "/api/environments/:environmentId/diff/:otherEnvironmentId",
    "/api/resources",
    "/api/resources/:resourceId",
    "/api/resources/:resourceId/archive",
    "/api/resources/:resourceId/redeploy",
    "/api/resources/:resourceId/source",
    "/api/resources/:resourceId/health",
    "/api/resources/:resourceId/health-policy",
    "/api/resources/:resourceId/network-profile",
    "/api/resources/:resourceId/access-profile",
    "/api/resources/:resourceId/runtime-profile",
    "/api/resources/:resourceId/diagnostic-summary",
    "/api/resources/:resourceId/proxy-configuration",
    "/api/resources/:resourceId/runtime-logs",
    "/api/resources/:resourceId/runtime-logs/stream",
    "/api/resources/:resourceId/runtime/stop",
    "/api/resources/:resourceId/runtime/start",
    "/api/resources/:resourceId/runtime/restart",
    "/api/resources/:resourceId/preview-environments/:previewEnvironmentId",
    "/api/resources/:resourceId/dependency-bindings",
    "/api/resources/:resourceId/dependency-bindings/:bindingId",
    "/api/resources/:resourceId/dependency-bindings/:bindingId/secret-rotations",
    "/api/scheduled-tasks",
    "/api/scheduled-tasks/:taskId",
    "/api/scheduled-tasks/:taskId/runs",
    "/api/scheduled-task-runs",
    "/api/scheduled-task-runs/:runId",
    "/api/scheduled-task-runs/:runId/logs",
    "/api/resource-access-failures/:requestId",
    "/api/terminal-sessions",
    "/api/domain-bindings",
    "/api/domain-bindings/:domainBindingId",
    "/api/domain-bindings/:domainBindingId/route",
    "/api/domain-bindings/:domainBindingId/ownership-confirmations",
    "/api/domain-bindings/:domainBindingId/delete-check",
    "/api/domain-bindings/:domainBindingId/verification-retries",
    "/api/certificates",
    "/api/certificates/:certificateId",
    "/api/certificates/import",
    "/api/certificates/issue-or-renew",
    "/api/certificates/:certificateId/retries",
    "/api/certificates/:certificateId/revoke",
    "/api/deployments",
    "/api/deployments/cleanup-preview",
    "/api/deployments/:deploymentId/retry",
    "/api/deployments/:deploymentId/rollback",
    "/api/deployments/plan",
    "/api/deployments/:deploymentId",
    "/api/deployments/:deploymentId/recovery-readiness",
    "/api/deployments/stream",
    "/api/deployments/:deploymentId/logs",
    "/api/deployments/:deploymentId/events",
    "/api/deployments/:deploymentId/events/stream",
    "/api/source-links/relink",
    "/api/dependency-resources",
    "/api/dependency-resources/postgres/provision",
    "/api/dependency-resources/postgres/import",
    "/api/dependency-resources/redis/provision",
    "/api/dependency-resources/redis/import",
    "/api/dependency-resources/backups/:backupId",
    "/api/dependency-resources/backups/:backupId/restore",
    "/api/dependency-resources/:dependencyResourceId",
    "/api/dependency-resources/:dependencyResourceId/backups",
    "/api/dependency-resources/:dependencyResourceId/rename",
    "/api/operator-work",
    "/api/operator-work/:workId",
    "/api/preview-policies",
    "/api/preview-policies/show",
    "/api/preview-environments",
    "/api/preview-environments/:previewEnvironmentId",
    "/api/providers",
    "/api/plugins",
    "/api/integrations/github/repositories",
  ] as const;

  let mounted = app;

  mounted = mounted.post(
    "/api/action/deployments/from-source-link",
    actionSourceLinkDeploymentRouteHandler,
    {
      parse: "none",
    },
  ) as unknown as Elysia;

  mounted = mounted.post("/api/integrations/github/source-events", githubSourceEventRouteHandler, {
    parse: "none",
  }) as unknown as Elysia;

  mounted = mounted.post(
    "/api/resources/:resourceId/source-events/generic-signed",
    genericSignedSourceEventRouteHandler,
    {
      parse: "none",
    },
  ) as unknown as Elysia;

  mounted = mounted.all("/api/rpc", rpcRouteHandler, {
    parse: "none",
  }) as unknown as Elysia;
  mounted = mounted.all("/api/rpc/*", rpcRouteHandler, {
    parse: "none",
  }) as unknown as Elysia;

  for (const route of routes) {
    mounted = mounted.all(route, openApiRouteHandler, {
      parse: "none",
    }) as unknown as Elysia;
  }

  return mounted;
}
