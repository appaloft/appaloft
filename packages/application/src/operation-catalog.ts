import { type ZodTypeAny } from "zod";
import { configureAuditEventLegalHoldCommandInputSchema } from "./operations/audit-events/configure-audit-event-legal-hold.command";
import { createAuditEventArchiveCommandInputSchema } from "./operations/audit-events/create-audit-event-archive.command";
import { exportAuditEventsQueryInputSchema } from "./operations/audit-events/export-audit-events.query";
import { exportGlobalAuditEventsQueryInputSchema } from "./operations/audit-events/export-global-audit-events.query";
import { listAuditEventArchivesQueryInputSchema } from "./operations/audit-events/list-audit-event-archives.query";
import { listAuditEventLegalHoldsQueryInputSchema } from "./operations/audit-events/list-audit-event-legal-holds.query";
import { listAuditEventsQueryInputSchema } from "./operations/audit-events/list-audit-events.query";
import { pruneAuditEventArchivesCommandInputSchema } from "./operations/audit-events/prune-audit-event-archives.command";
import { pruneAuditEventsCommandInputSchema } from "./operations/audit-events/prune-audit-events.command";
import { releaseAuditEventLegalHoldCommandInputSchema } from "./operations/audit-events/release-audit-event-legal-hold.command";
import { showAuditEventQueryInputSchema } from "./operations/audit-events/show-audit-event.query";
import { showAuditEventArchiveQueryInputSchema } from "./operations/audit-events/show-audit-event-archive.query";
import { showAuditEventLegalHoldQueryInputSchema } from "./operations/audit-events/show-audit-event-legal-hold.query";
import { bootstrapFirstAdminCommandInputSchema } from "./operations/auth/bootstrap-first-admin.schema";
import { getAuthBootstrapStatusQueryInputSchema } from "./operations/auth/get-auth-bootstrap-status.query";
import { queryCapabilitiesInputSchema } from "./operations/capabilities/query-capabilities.schema";
import { deleteCertificateCommandInputSchema } from "./operations/certificates/delete-certificate.command";
import { importCertificateCommandInputSchema } from "./operations/certificates/import-certificate.command";
import { issueOrRenewCertificateCommandInputSchema } from "./operations/certificates/issue-or-renew-certificate.command";
import { listCertificatesQueryInputSchema } from "./operations/certificates/list-certificates.query";
import { retryCertificateCommandInputSchema } from "./operations/certificates/retry-certificate.command";
import { revokeCertificateCommandInputSchema } from "./operations/certificates/revoke-certificate.command";
import { showCertificateQueryInputSchema } from "./operations/certificates/show-certificate.query";
import { configureDefaultAccessDomainPolicyCommandInputSchema } from "./operations/default-access-domain-policies/configure-default-access-domain-policy.command";
import { listDefaultAccessDomainPoliciesQueryInputSchema } from "./operations/default-access-domain-policies/list-default-access-domain-policies.query";
import { showDefaultAccessDomainPolicyQueryInputSchema } from "./operations/default-access-domain-policies/show-default-access-domain-policy.query";
import { acceptDependencyResourceProvisioningPlanInputSchema } from "./operations/dependency-resources/accept-dependency-resource-provisioning-plan.command";
import { configureDependencyResourceBackupPolicyCommandInputSchema } from "./operations/dependency-resources/configure-dependency-resource-backup-policy.command";
import { createDependencyResourceBackupCommandInputSchema } from "./operations/dependency-resources/create-dependency-resource-backup.command";
import { createDependencyResourceProvisioningPlanInputSchema } from "./operations/dependency-resources/create-dependency-resource-provisioning-plan.command";
import { deleteDependencyResourceCommandInputSchema } from "./operations/dependency-resources/delete-dependency-resource.command";
import { importDependencyResourceCommandInputSchema } from "./operations/dependency-resources/import-dependency-resource.command";
import { listDependencyResourceBackupPoliciesQueryInputSchema } from "./operations/dependency-resources/list-dependency-resource-backup-policies.query";
import { listDependencyResourceBackupsQueryInputSchema } from "./operations/dependency-resources/list-dependency-resource-backups.query";
import { listDependencyResourcesQueryInputSchema } from "./operations/dependency-resources/list-dependency-resources.query";
import { provisionDependencyResourceCommandInputSchema } from "./operations/dependency-resources/provision-dependency-resource.command";
import { renameDependencyResourceCommandInputSchema } from "./operations/dependency-resources/rename-dependency-resource.command";
import { restoreDependencyResourceBackupCommandInputSchema } from "./operations/dependency-resources/restore-dependency-resource-backup.command";
import { showDependencyResourceQueryInputSchema } from "./operations/dependency-resources/show-dependency-resource.query";
import { showDependencyResourceBackupQueryInputSchema } from "./operations/dependency-resources/show-dependency-resource-backup.query";
import { showDependencyResourceBackupPolicyQueryInputSchema } from "./operations/dependency-resources/show-dependency-resource-backup-policy.query";
import { showDependencyResourceProvisioningPlanInputSchema } from "./operations/dependency-resources/show-dependency-resource-provisioning-plan.query";
import { createDeployTokenCommandInputSchema } from "./operations/deploy-tokens/create-deploy-token.schema";
import { listDeployTokensQueryInputSchema } from "./operations/deploy-tokens/list-deploy-tokens.schema";
import { revokeDeployTokenCommandInputSchema } from "./operations/deploy-tokens/revoke-deploy-token.schema";
import { rotateDeployTokenCommandInputSchema } from "./operations/deploy-tokens/rotate-deploy-token.schema";
import { showDeployTokenQueryInputSchema } from "./operations/deploy-tokens/show-deploy-token.schema";
import { archiveDeploymentCommandInputSchema } from "./operations/deployments/archive-deployment.command";
import { cancelDeploymentCommandInputSchema } from "./operations/deployments/cancel-deployment.command";
import { cleanupPreviewCommandInputSchema } from "./operations/deployments/cleanup-preview.command";
import { createDeploymentCommandInputSchema } from "./operations/deployments/create-deployment.command";
import { deploymentLogsQueryInputSchema } from "./operations/deployments/deployment-logs.query";
import { deploymentPlanQueryInputSchema } from "./operations/deployments/deployment-plan.query";
import { deploymentRecoveryReadinessQueryInputSchema } from "./operations/deployments/deployment-recovery-readiness.query";
import { listDeploymentsQueryInputSchema } from "./operations/deployments/list-deployments.query";
import { pruneDeploymentLogsCommandInputSchema } from "./operations/deployments/prune-deployment-logs.command";
import { pruneDeploymentsCommandInputSchema } from "./operations/deployments/prune-deployments.command";
import { redeployDeploymentCommandInputSchema } from "./operations/deployments/redeploy-deployment.command";
import { retryDeploymentCommandInputSchema } from "./operations/deployments/retry-deployment.command";
import { rollbackDeploymentCommandInputSchema } from "./operations/deployments/rollback-deployment.command";
import { showDeploymentQueryInputSchema } from "./operations/deployments/show-deployment.query";
import { streamDeploymentEventsQueryInputSchema } from "./operations/deployments/stream-deployment-events.query";
import { checkDomainBindingDeleteSafetyQueryInputSchema } from "./operations/domain-bindings/check-domain-binding-delete-safety.query";
import { configureDomainBindingRouteCommandInputSchema } from "./operations/domain-bindings/configure-domain-binding-route.command";
import { confirmDomainBindingOwnershipCommandInputSchema } from "./operations/domain-bindings/confirm-domain-binding-ownership.command";
import { createDomainBindingCommandInputSchema } from "./operations/domain-bindings/create-domain-binding.command";
import { deleteDomainBindingCommandInputSchema } from "./operations/domain-bindings/delete-domain-binding.command";
import { listDomainBindingsQueryInputSchema } from "./operations/domain-bindings/list-domain-bindings.query";
import { retryDomainBindingVerificationCommandInputSchema } from "./operations/domain-bindings/retry-domain-binding-verification.command";
import { showDomainBindingQueryInputSchema } from "./operations/domain-bindings/show-domain-binding.query";
import { pruneDomainEventsCommandInputSchema } from "./operations/domain-events/prune-domain-events.command";
import { queryEntitlementsInputSchema } from "./operations/entitlements/query-entitlements.schema";
import { archiveEnvironmentCommandInputSchema } from "./operations/environments/archive-environment.command";
import { cloneEnvironmentCommandInputSchema } from "./operations/environments/clone-environment.command";
import { createEnvironmentCommandInputSchema } from "./operations/environments/create-environment.command";
import { diffEnvironmentsQueryInputSchema } from "./operations/environments/diff-environments.query";
import { environmentEffectivePrecedenceQueryInputSchema } from "./operations/environments/environment-effective-precedence.query";
import { listEnvironmentsQueryInputSchema } from "./operations/environments/list-environments.query";
import { lockEnvironmentCommandInputSchema } from "./operations/environments/lock-environment.command";
import { promoteEnvironmentCommandInputSchema } from "./operations/environments/promote-environment.command";
import { renameEnvironmentCommandInputSchema } from "./operations/environments/rename-environment.command";
import { setEnvironmentVariableCommandInputSchema } from "./operations/environments/set-environment-variable.command";
import { showEnvironmentQueryInputSchema } from "./operations/environments/show-environment.query";
import { unlockEnvironmentCommandInputSchema } from "./operations/environments/unlock-environment.command";
import { unsetEnvironmentVariableCommandInputSchema } from "./operations/environments/unset-environment-variable.command";
import { cancelOperatorWorkCommandInputSchema } from "./operations/operator-work/cancel-operator-work.command";
import { deadLetterOperatorWorkCommandInputSchema } from "./operations/operator-work/dead-letter-operator-work.command";
import { listOperatorWorkQueryInputSchema } from "./operations/operator-work/list-operator-work.query";
import { markOperatorWorkRecoveredCommandInputSchema } from "./operations/operator-work/mark-operator-work-recovered.command";
import { pruneOperatorWorkCommandInputSchema } from "./operations/operator-work/prune-operator-work.command";
import { retryOperatorWorkCommandInputSchema } from "./operations/operator-work/retry-operator-work.command";
import { showOperatorWorkQueryInputSchema } from "./operations/operator-work/show-operator-work.query";
import { changeOrganizationMemberRoleCommandInputSchema } from "./operations/organizations/change-organization-member-role.command";
import { getCurrentOrganizationContextQueryInputSchema } from "./operations/organizations/get-current-organization-context.query";
import { inviteOrganizationMemberCommandInputSchema } from "./operations/organizations/invite-organization-member.command";
import { listOrganizationInvitationsQueryInputSchema } from "./operations/organizations/list-organization-invitations.query";
import { listOrganizationMembersQueryInputSchema } from "./operations/organizations/list-organization-members.query";
import { removeOrganizationMemberCommandInputSchema } from "./operations/organizations/remove-organization-member.command";
import { switchCurrentOrganizationCommandInputSchema } from "./operations/organizations/switch-current-organization.command";
import { configurePreviewPolicyCommandInputSchema } from "./operations/preview-deployments/configure-preview-policy.command";
import { deletePreviewEnvironmentCommandInputSchema } from "./operations/preview-deployments/delete-preview-environment.command";
import { listPreviewEnvironmentsQueryInputSchema } from "./operations/preview-deployments/list-preview-environments.query";
import { showPreviewEnvironmentQueryInputSchema } from "./operations/preview-deployments/show-preview-environment.query";
import { showPreviewPolicyQueryInputSchema } from "./operations/preview-deployments/show-preview-policy.query";
import { archiveProjectCommandInputSchema } from "./operations/projects/archive-project.command";
import { checkProjectDeleteSafetyQueryInputSchema } from "./operations/projects/check-project-delete-safety.query";
import { createProjectCommandInputSchema } from "./operations/projects/create-project.command";
import { deleteProjectCommandInputSchema } from "./operations/projects/delete-project.command";
import { listProjectsQueryInputSchema } from "./operations/projects/list-projects.query";
import { renameProjectCommandInputSchema } from "./operations/projects/rename-project.command";
import { restoreProjectCommandInputSchema } from "./operations/projects/restore-project.command";
import { setProjectDescriptionCommandInputSchema } from "./operations/projects/set-project-description.command";
import { showProjectQueryInputSchema } from "./operations/projects/show-project.query";
import { pruneProviderJobLogsCommandInputSchema } from "./operations/provider-job-logs/prune-provider-job-logs.command";
import { archiveResourceCommandInputSchema } from "./operations/resources/archive-resource.command";
import { attachResourceStorageCommandInputSchema } from "./operations/resources/attach-resource-storage.command";
import { bindResourceDependencyCommandInputSchema } from "./operations/resources/bind-resource-dependency.command";
import { configureResourceAccessCommandInputSchema } from "./operations/resources/configure-resource-access.command";
import { configureResourceAutoDeployCommandInputSchema } from "./operations/resources/configure-resource-auto-deploy.command";
import { configureResourceHealthCommandInputSchema } from "./operations/resources/configure-resource-health.command";
import { configureResourceNetworkCommandInputSchema } from "./operations/resources/configure-resource-network.command";
import { configureResourceRuntimeCommandInputSchema } from "./operations/resources/configure-resource-runtime.command";
import { configureResourceSourceCommandInputSchema } from "./operations/resources/configure-resource-source.command";
import { createResourceCommandInputSchema } from "./operations/resources/create-resource.command";
import { createResourceSecretReferenceCommandInputSchema } from "./operations/resources/create-resource-secret-reference.command";
import { deleteResourceCommandInputSchema } from "./operations/resources/delete-resource.command";
import { deleteResourceSecretReferenceCommandInputSchema } from "./operations/resources/delete-resource-secret-reference.command";
import { detachResourceStorageCommandInputSchema } from "./operations/resources/detach-resource-storage.command";
import { importResourceVariablesCommandInputSchema } from "./operations/resources/import-resource-variables.command";
import { listResourceDependencyBindingsQueryInputSchema } from "./operations/resources/list-resource-dependency-bindings.query";
import { listResourceSecretReferencesQueryInputSchema } from "./operations/resources/list-resource-secret-references.query";
import { listResourcesQueryInputSchema } from "./operations/resources/list-resources.query";
import { resetResourceHealthCommandInputSchema } from "./operations/resources/reset-resource-health.command";
import { resourceAccessFailureEvidenceLookupQueryInputSchema } from "./operations/resources/resource-access-failure-evidence-lookup.query";
import { resourceDiagnosticSummaryQueryInputSchema } from "./operations/resources/resource-diagnostic-summary.query";
import { resourceEffectiveConfigQueryInputSchema } from "./operations/resources/resource-effective-config.query";
import { resourceHealthQueryInputSchema } from "./operations/resources/resource-health.query";
import { resourceHealthHistoryQueryInputSchema } from "./operations/resources/resource-health-history.query";
import { resourceProxyConfigurationPreviewQueryInputSchema } from "./operations/resources/resource-proxy-configuration-preview.query";
import {
  restartResourceRuntimeCommandInputSchema,
  startResourceRuntimeCommandInputSchema,
  stopResourceRuntimeCommandInputSchema,
} from "./operations/resources/resource-runtime-control.schema";
import {
  archiveResourceRuntimeLogsCommandInputSchema,
  listResourceRuntimeLogArchivesQueryInputSchema,
  pruneResourceRuntimeLogArchivesCommandInputSchema,
  showResourceRuntimeLogArchiveQueryInputSchema,
} from "./operations/resources/resource-runtime-log-archives.schema";
import { resourceRuntimeLogsQueryInputSchema } from "./operations/resources/resource-runtime-logs.query";
import { rotateResourceDependencyBindingSecretCommandInputSchema } from "./operations/resources/rotate-resource-dependency-binding-secret.command";
import { rotateResourceSecretReferenceCommandInputSchema } from "./operations/resources/rotate-resource-secret-reference.command";
import { setResourceVariableCommandInputSchema } from "./operations/resources/set-resource-variable.command";
import { showResourceQueryInputSchema } from "./operations/resources/show-resource.query";
import { showResourceDependencyBindingQueryInputSchema } from "./operations/resources/show-resource-dependency-binding.query";
import { showResourceSecretReferenceQueryInputSchema } from "./operations/resources/show-resource-secret-reference.query";
import { unbindResourceDependencyCommandInputSchema } from "./operations/resources/unbind-resource-dependency.command";
import { unsetResourceVariableCommandInputSchema } from "./operations/resources/unset-resource-variable.command";
import { configureRetentionDefaultsCommandInputSchema } from "./operations/retention-defaults/configure-retention-defaults.command";
import { listRetentionDefaultsQueryInputSchema } from "./operations/retention-defaults/list-retention-defaults.query";
import { showRetentionDefaultQueryInputSchema } from "./operations/retention-defaults/show-retention-default.query";
import { configureRuntimeMonitoringThresholdsCommandInputSchema } from "./operations/runtime-monitoring/configure-runtime-monitoring-thresholds.command";
import { listRuntimeMonitoringSamplesQueryInputSchema } from "./operations/runtime-monitoring/list-runtime-monitoring-samples.query";
import { runtimeMonitoringRollupQueryInputSchema } from "./operations/runtime-monitoring/runtime-monitoring-rollup.query";
import { showRuntimeMonitoringThresholdsQueryInputSchema } from "./operations/runtime-monitoring/show-runtime-monitoring-thresholds.query";
import { inspectRuntimeUsageQueryInputSchema } from "./operations/runtime-usage/inspect-runtime-usage.query";
import { createScheduledTaskCommandInputSchema } from "./operations/scheduled-tasks/create-scheduled-task.command";
import { deleteScheduledTaskCommandInputSchema } from "./operations/scheduled-tasks/delete-scheduled-task.command";
import { listScheduledTaskRunsQueryInputSchema } from "./operations/scheduled-tasks/list-scheduled-task-runs.query";
import { listScheduledTasksQueryInputSchema } from "./operations/scheduled-tasks/list-scheduled-tasks.query";
import { runScheduledTaskNowCommandInputSchema } from "./operations/scheduled-tasks/run-scheduled-task-now.command";
import { scheduledTaskRunLogsQueryInputSchema } from "./operations/scheduled-tasks/scheduled-task-run-logs.query";
import { showScheduledTaskQueryInputSchema } from "./operations/scheduled-tasks/show-scheduled-task.query";
import { showScheduledTaskRunQueryInputSchema } from "./operations/scheduled-tasks/show-scheduled-task-run.query";
import { configureScheduledTaskCommandInputSchema } from "./operations/scheduled-tasks/update-scheduled-task.command";
import { bootstrapServerProxyCommandInputSchema } from "./operations/servers/bootstrap-server-proxy.command";
import { checkServerDeleteSafetyQueryInputSchema } from "./operations/servers/check-server-delete-safety.query";
import { configureScheduledRuntimePrunePolicyCommandInputSchema } from "./operations/servers/configure-scheduled-runtime-prune-policy.command";
import { configureServerCredentialCommandInputSchema } from "./operations/servers/configure-server-credential.command";
import { configureServerEdgeProxyCommandInputSchema } from "./operations/servers/configure-server-edge-proxy.command";
import { createSshCredentialCommandInputSchema } from "./operations/servers/create-ssh-credential.command";
import { deactivateServerCommandInputSchema } from "./operations/servers/deactivate-server.command";
import { deleteServerCommandInputSchema } from "./operations/servers/delete-server.command";
import { deleteSshCredentialCommandInputSchema } from "./operations/servers/delete-ssh-credential.command";
import { inspectServerCapacityQueryInputSchema } from "./operations/servers/inspect-server-capacity.query";
import { listScheduledRuntimePrunePoliciesQueryInputSchema } from "./operations/servers/list-scheduled-runtime-prune-policies.query";
import { listServersQueryInputSchema } from "./operations/servers/list-servers.query";
import { listSshCredentialsQueryInputSchema } from "./operations/servers/list-ssh-credentials.query";
import { pruneServerCapacityCommandInputSchema } from "./operations/servers/prune-server-capacity.command";
import { registerServerCommandInputSchema } from "./operations/servers/register-server.command";
import { renameServerCommandInputSchema } from "./operations/servers/rename-server.command";
import { rotateSshCredentialCommandInputSchema } from "./operations/servers/rotate-ssh-credential.command";
import { showScheduledRuntimePrunePolicyQueryInputSchema } from "./operations/servers/show-scheduled-runtime-prune-policy.query";
import { showServerQueryInputSchema } from "./operations/servers/show-server.query";
import { showSshCredentialQueryInputSchema } from "./operations/servers/show-ssh-credential.query";
import { testServerConnectivityCommandInputSchema } from "./operations/servers/test-server-connectivity.command";
import { ingestSourceEventCommandInputSchema } from "./operations/source-events/ingest-source-event.command";
import { listSourceEventsQueryInputSchema } from "./operations/source-events/list-source-events.query";
import { pruneSourceEventsCommandInputSchema } from "./operations/source-events/prune-source-events.command";
import { replaySourceEventCommandInputSchema } from "./operations/source-events/replay-source-event.command";
import { showSourceEventQueryInputSchema } from "./operations/source-events/show-source-event.query";
import { deleteSourceLinkCommandInputSchema } from "./operations/source-links/delete-source-link.command";
import { listSourceLinksQueryInputSchema } from "./operations/source-links/list-source-links.query";
import { relinkSourceLinkCommandInputSchema } from "./operations/source-links/relink-source-link.command";
import { showSourceLinkQueryInputSchema } from "./operations/source-links/show-source-link.query";
import { listStaticArtifactPublicationsQueryInputSchema } from "./operations/static-artifacts/list-static-artifact-publications.query";
import { publishStaticArtifactCommandInputSchema } from "./operations/static-artifacts/publish-static-artifact.command";
import { publishStaticArtifactArchiveCommandInputSchema } from "./operations/static-artifacts/publish-static-artifact-archive.command";
import { publishStaticArtifactPayloadCommandInputSchema } from "./operations/static-artifacts/publish-static-artifact-payload.command";
import { cleanupStorageVolumeRuntimeCommandInputSchema } from "./operations/storage-volumes/cleanup-storage-volume-runtime.command";
import { createStorageVolumeCommandInputSchema } from "./operations/storage-volumes/create-storage-volume.command";
import { deleteStorageVolumeCommandInputSchema } from "./operations/storage-volumes/delete-storage-volume.command";
import { listStorageVolumesQueryInputSchema } from "./operations/storage-volumes/list-storage-volumes.query";
import { renameStorageVolumeCommandInputSchema } from "./operations/storage-volumes/rename-storage-volume.command";
import { showStorageVolumeQueryInputSchema } from "./operations/storage-volumes/show-storage-volume.query";
import { applyInstanceUpgradeCommandInputSchema } from "./operations/system/apply-instance-upgrade.command";
import { checkInstanceUpgradeQueryInputSchema } from "./operations/system/check-instance-upgrade.query";
import { listGitHubRepositoriesQueryInputSchema } from "./operations/system/list-github-repositories.query";
import { closeTerminalSessionCommandInputSchema } from "./operations/terminal-sessions/close-terminal-session.command";
import { expireTerminalSessionsCommandInputSchema } from "./operations/terminal-sessions/expire-terminal-sessions.command";
import { listTerminalSessionsQueryInputSchema } from "./operations/terminal-sessions/list-terminal-sessions.query";
import { openTerminalSessionCommandInputSchema } from "./operations/terminal-sessions/open-terminal-session.command";
import { showTerminalSessionQueryInputSchema } from "./operations/terminal-sessions/show-terminal-session.query";
import { type ProductOrganizationRole } from "./ports";
import { tokens } from "./tokens";

type OperationKind = "command" | "query";
type OperationDomain =
  | "projects"
  | "servers"
  | "credentials"
  | "environments"
  | "resources"
  | "dependency-resources"
  | "scheduled-tasks"
  | "scheduled-task-runs"
  | "storage-volumes"
  | "deploy-tokens"
  | "auth"
  | "capabilities"
  | "entitlements"
  | "audit-events"
  | "domain-events"
  | "provider-job-logs"
  | "retention-defaults"
  | "runtime-usage"
  | "runtime-monitoring"
  | "organizations"
  | "deployments"
  | "operator-work"
  | "preview-policies"
  | "preview-environments"
  | "default-access-domain-policies"
  | "domain-bindings"
  | "certificates"
  | "source-events"
  | "source-links"
  | "static-artifacts"
  | "system"
  | "terminal-sessions";

export interface OperationCatalogEntry {
  key: string;
  kind: OperationKind;
  domain: OperationDomain;
  messageName: string;
  handlerName: string;
  serviceName: string;
  inputSchema?: ZodTypeAny;
  serviceToken: symbol;
  transportAccess?: {
    productSession?:
      | {
          minRole: ProductOrganizationRole;
        }
      | "public";
  };
  transports: {
    cli?: string;
    orpc?: {
      method: "GET" | "POST" | "DELETE";
      path: string;
    };
    orpcAdditional?: {
      method: "GET" | "POST" | "DELETE";
      path: string;
    }[];
    orpcStream?: {
      method: "GET" | "POST";
      path: string;
    };
  };
}

// Source of truth for business operations.
// CLI, oRPC, HTTP, and future MCP tools must dispatch these messages instead of bypassing application handlers.
export const operationCatalog = [
  {
    key: "auth.bootstrap-status",
    kind: "query",
    domain: "auth",
    messageName: "GetAuthBootstrapStatusQuery",
    handlerName: "GetAuthBootstrapStatusQueryHandler",
    serviceName: "GetAuthBootstrapStatusQueryService",
    inputSchema: getAuthBootstrapStatusQueryInputSchema,
    serviceToken: tokens.getAuthBootstrapStatusQueryService,
    transportAccess: {
      productSession: "public",
    },
    transports: {
      cli: "appaloft auth bootstrap-status",
      orpc: { method: "GET", path: "/api/bootstrap/auth/status" },
    },
  },
  {
    key: "auth.bootstrap-first-admin",
    kind: "command",
    domain: "auth",
    messageName: "BootstrapFirstAdminCommand",
    handlerName: "BootstrapFirstAdminCommandHandler",
    serviceName: "BootstrapFirstAdminUseCase",
    inputSchema: bootstrapFirstAdminCommandInputSchema,
    serviceToken: tokens.bootstrapFirstAdminUseCase,
    transportAccess: {
      productSession: "public",
    },
    transports: {
      cli: "appaloft auth bootstrap-first-admin",
      orpc: { method: "POST", path: "/api/bootstrap/auth/first-admin" },
    },
  },
  {
    key: "capabilities.query",
    kind: "query",
    domain: "capabilities",
    messageName: "QueryCapabilitiesQuery",
    handlerName: "QueryCapabilitiesQueryHandler",
    serviceName: "QueryCapabilitiesQueryService",
    inputSchema: queryCapabilitiesInputSchema,
    serviceToken: tokens.queryCapabilitiesQueryService,
    transportAccess: {
      productSession: {
        minRole: "member",
      },
    },
    transports: {
      orpc: { method: "POST", path: "/api/capabilities/query" },
    },
  },
  {
    key: "entitlements.query",
    kind: "query",
    domain: "entitlements",
    messageName: "QueryEntitlementsQuery",
    handlerName: "QueryEntitlementsQueryHandler",
    serviceName: "QueryEntitlementsQueryService",
    inputSchema: queryEntitlementsInputSchema,
    serviceToken: tokens.queryEntitlementsQueryService,
    transportAccess: {
      productSession: {
        minRole: "member",
      },
    },
    transports: {
      orpc: { method: "POST", path: "/api/entitlements/query" },
    },
  },
  {
    key: "organizations.current-context",
    kind: "query",
    domain: "organizations",
    messageName: "GetCurrentOrganizationContextQuery",
    handlerName: "GetCurrentOrganizationContextQueryHandler",
    serviceName: "GetCurrentOrganizationContextQueryService",
    inputSchema: getCurrentOrganizationContextQueryInputSchema,
    serviceToken: tokens.getCurrentOrganizationContextQueryService,
    transportAccess: {
      productSession: {
        minRole: "member",
      },
    },
    transports: {
      cli: "appaloft organization context",
      orpc: { method: "GET", path: "/api/organizations/current-context" },
    },
  },
  {
    key: "organizations.switch-current",
    kind: "command",
    domain: "organizations",
    messageName: "SwitchCurrentOrganizationCommand",
    handlerName: "SwitchCurrentOrganizationCommandHandler",
    serviceName: "SwitchCurrentOrganizationUseCase",
    inputSchema: switchCurrentOrganizationCommandInputSchema,
    serviceToken: tokens.switchCurrentOrganizationUseCase,
    transportAccess: {
      productSession: {
        minRole: "member",
      },
    },
    transports: {
      cli: "appaloft organization switch <organizationId>",
      orpc: { method: "POST", path: "/api/organizations/current-context/switch" },
    },
  },
  {
    key: "organizations.list-members",
    kind: "query",
    domain: "organizations",
    messageName: "ListOrganizationMembersQuery",
    handlerName: "ListOrganizationMembersQueryHandler",
    serviceName: "ListOrganizationMembersQueryService",
    inputSchema: listOrganizationMembersQueryInputSchema,
    serviceToken: tokens.listOrganizationMembersQueryService,
    transportAccess: {
      productSession: {
        minRole: "admin",
      },
    },
    transports: {
      cli: "appaloft organization members list",
      orpc: { method: "GET", path: "/api/organizations/{organizationId}/members" },
    },
  },
  {
    key: "organizations.list-invitations",
    kind: "query",
    domain: "organizations",
    messageName: "ListOrganizationInvitationsQuery",
    handlerName: "ListOrganizationInvitationsQueryHandler",
    serviceName: "ListOrganizationInvitationsQueryService",
    inputSchema: listOrganizationInvitationsQueryInputSchema,
    serviceToken: tokens.listOrganizationInvitationsQueryService,
    transportAccess: {
      productSession: {
        minRole: "admin",
      },
    },
    transports: {
      cli: "appaloft organization invitations list",
      orpc: { method: "GET", path: "/api/organizations/{organizationId}/invitations" },
    },
  },
  {
    key: "organizations.invite-member",
    kind: "command",
    domain: "organizations",
    messageName: "InviteOrganizationMemberCommand",
    handlerName: "InviteOrganizationMemberCommandHandler",
    serviceName: "InviteOrganizationMemberUseCase",
    inputSchema: inviteOrganizationMemberCommandInputSchema,
    serviceToken: tokens.inviteOrganizationMemberUseCase,
    transports: {
      cli: "appaloft organization member invite",
      orpc: { method: "POST", path: "/api/organizations/{organizationId}/invitations" },
    },
  },
  {
    key: "organizations.change-member-role",
    kind: "command",
    domain: "organizations",
    messageName: "ChangeOrganizationMemberRoleCommand",
    handlerName: "ChangeOrganizationMemberRoleCommandHandler",
    serviceName: "ChangeOrganizationMemberRoleUseCase",
    inputSchema: changeOrganizationMemberRoleCommandInputSchema,
    serviceToken: tokens.changeOrganizationMemberRoleUseCase,
    transports: {
      cli: "appaloft organization member role <memberId>",
      orpc: {
        method: "POST",
        path: "/api/organizations/{organizationId}/members/{memberId}/role",
      },
    },
  },
  {
    key: "organizations.remove-member",
    kind: "command",
    domain: "organizations",
    messageName: "RemoveOrganizationMemberCommand",
    handlerName: "RemoveOrganizationMemberCommandHandler",
    serviceName: "RemoveOrganizationMemberUseCase",
    inputSchema: removeOrganizationMemberCommandInputSchema,
    serviceToken: tokens.removeOrganizationMemberUseCase,
    transports: {
      cli: "appaloft organization member remove <memberId>",
      orpc: { method: "DELETE", path: "/api/organizations/{organizationId}/members/{memberId}" },
    },
  },
  {
    key: "deploy-tokens.create",
    kind: "command",
    domain: "deploy-tokens",
    messageName: "CreateDeployTokenCommand",
    handlerName: "CreateDeployTokenCommandHandler",
    serviceName: "CreateDeployTokenUseCase",
    inputSchema: createDeployTokenCommandInputSchema,
    serviceToken: tokens.createDeployTokenUseCase,
    transports: {
      cli: "appaloft deploy-token create",
      orpc: { method: "POST", path: "/api/deploy-tokens" },
    },
  },
  {
    key: "deploy-tokens.list",
    kind: "query",
    domain: "deploy-tokens",
    messageName: "ListDeployTokensQuery",
    handlerName: "ListDeployTokensQueryHandler",
    serviceName: "ListDeployTokensQueryService",
    inputSchema: listDeployTokensQueryInputSchema,
    serviceToken: tokens.listDeployTokensQueryService,
    transportAccess: {
      productSession: {
        minRole: "admin",
      },
    },
    transports: {
      cli: "appaloft deploy-token list",
      orpc: { method: "GET", path: "/api/deploy-tokens" },
    },
  },
  {
    key: "deploy-tokens.show",
    kind: "query",
    domain: "deploy-tokens",
    messageName: "ShowDeployTokenQuery",
    handlerName: "ShowDeployTokenQueryHandler",
    serviceName: "ShowDeployTokenQueryService",
    inputSchema: showDeployTokenQueryInputSchema,
    serviceToken: tokens.showDeployTokenQueryService,
    transportAccess: {
      productSession: {
        minRole: "admin",
      },
    },
    transports: {
      cli: "appaloft deploy-token show <tokenId>",
      orpc: { method: "GET", path: "/api/deploy-tokens/{tokenId}" },
    },
  },
  {
    key: "deploy-tokens.rotate",
    kind: "command",
    domain: "deploy-tokens",
    messageName: "RotateDeployTokenCommand",
    handlerName: "RotateDeployTokenCommandHandler",
    serviceName: "RotateDeployTokenUseCase",
    inputSchema: rotateDeployTokenCommandInputSchema,
    serviceToken: tokens.rotateDeployTokenUseCase,
    transports: {
      cli: "appaloft deploy-token rotate <tokenId> --confirm <tokenId>",
      orpc: { method: "POST", path: "/api/deploy-tokens/{tokenId}/rotate" },
    },
  },
  {
    key: "deploy-tokens.revoke",
    kind: "command",
    domain: "deploy-tokens",
    messageName: "RevokeDeployTokenCommand",
    handlerName: "RevokeDeployTokenCommandHandler",
    serviceName: "RevokeDeployTokenUseCase",
    inputSchema: revokeDeployTokenCommandInputSchema,
    serviceToken: tokens.revokeDeployTokenUseCase,
    transports: {
      cli: "appaloft deploy-token revoke <tokenId> --confirm <tokenId>",
      orpc: { method: "POST", path: "/api/deploy-tokens/{tokenId}/revoke" },
    },
  },
  {
    key: "preview-policies.configure",
    kind: "command",
    domain: "preview-policies",
    messageName: "ConfigurePreviewPolicyCommand",
    handlerName: "ConfigurePreviewPolicyCommandHandler",
    serviceName: "ConfigurePreviewPolicyUseCase",
    inputSchema: configurePreviewPolicyCommandInputSchema,
    serviceToken: tokens.configurePreviewPolicyUseCase,
    transports: {
      cli: "appaloft preview policy configure",
      orpc: { method: "POST", path: "/api/preview-policies" },
    },
  },
  {
    key: "preview-policies.show",
    kind: "query",
    domain: "preview-policies",
    messageName: "ShowPreviewPolicyQuery",
    handlerName: "ShowPreviewPolicyQueryHandler",
    serviceName: "ShowPreviewPolicyQueryService",
    inputSchema: showPreviewPolicyQueryInputSchema,
    serviceToken: tokens.showPreviewPolicyQueryService,
    transports: {
      cli: "appaloft preview policy show",
      orpc: { method: "POST", path: "/api/preview-policies/show" },
    },
  },
  {
    key: "preview-environments.list",
    kind: "query",
    domain: "preview-environments",
    messageName: "ListPreviewEnvironmentsQuery",
    handlerName: "ListPreviewEnvironmentsQueryHandler",
    serviceName: "ListPreviewEnvironmentsQueryService",
    inputSchema: listPreviewEnvironmentsQueryInputSchema,
    serviceToken: tokens.listPreviewEnvironmentsQueryService,
    transports: {
      cli: "appaloft preview environment list",
      orpc: { method: "GET", path: "/api/preview-environments" },
    },
  },
  {
    key: "preview-environments.show",
    kind: "query",
    domain: "preview-environments",
    messageName: "ShowPreviewEnvironmentQuery",
    handlerName: "ShowPreviewEnvironmentQueryHandler",
    serviceName: "ShowPreviewEnvironmentQueryService",
    inputSchema: showPreviewEnvironmentQueryInputSchema,
    serviceToken: tokens.showPreviewEnvironmentQueryService,
    transports: {
      cli: "appaloft preview environment show",
      orpc: { method: "GET", path: "/api/preview-environments/{previewEnvironmentId}" },
    },
  },
  {
    key: "preview-environments.delete",
    kind: "command",
    domain: "preview-environments",
    messageName: "DeletePreviewEnvironmentCommand",
    handlerName: "DeletePreviewEnvironmentCommandHandler",
    serviceName: "PreviewEnvironmentCleanupService",
    inputSchema: deletePreviewEnvironmentCommandInputSchema,
    serviceToken: tokens.previewEnvironmentCleanupService,
    transports: {
      cli: "appaloft preview environment delete",
      orpc: {
        method: "DELETE",
        path: "/api/resources/{resourceId}/preview-environments/{previewEnvironmentId}",
      },
    },
  },
  {
    key: "projects.create",
    kind: "command",
    domain: "projects",
    messageName: "CreateProjectCommand",
    handlerName: "CreateProjectCommandHandler",
    serviceName: "CreateProjectUseCase",
    inputSchema: createProjectCommandInputSchema,
    serviceToken: tokens.createProjectUseCase,
    transportAccess: {
      productSession: {
        minRole: "admin",
      },
    },
    transports: {
      cli: "appaloft project create",
      orpc: { method: "POST", path: "/api/projects" },
    },
  },
  {
    key: "projects.list",
    kind: "query",
    domain: "projects",
    messageName: "ListProjectsQuery",
    handlerName: "ListProjectsQueryHandler",
    serviceName: "ListProjectsQueryService",
    inputSchema: listProjectsQueryInputSchema,
    serviceToken: tokens.listProjectsQueryService,
    transportAccess: {
      productSession: {
        minRole: "member",
      },
    },
    transports: {
      cli: "appaloft project list",
      orpc: { method: "GET", path: "/api/projects" },
    },
  },
  {
    key: "projects.show",
    kind: "query",
    domain: "projects",
    messageName: "ShowProjectQuery",
    handlerName: "ShowProjectQueryHandler",
    serviceName: "ShowProjectQueryService",
    inputSchema: showProjectQueryInputSchema,
    serviceToken: tokens.showProjectQueryService,
    transportAccess: {
      productSession: {
        minRole: "member",
      },
    },
    transports: {
      cli: "appaloft project show <projectId>",
      orpc: { method: "GET", path: "/api/projects/{projectId}" },
    },
  },
  {
    key: "projects.rename",
    kind: "command",
    domain: "projects",
    messageName: "RenameProjectCommand",
    handlerName: "RenameProjectCommandHandler",
    serviceName: "RenameProjectUseCase",
    inputSchema: renameProjectCommandInputSchema,
    serviceToken: tokens.renameProjectUseCase,
    transportAccess: {
      productSession: {
        minRole: "admin",
      },
    },
    transports: {
      cli: "appaloft project rename <projectId> --name <name>",
      orpc: { method: "POST", path: "/api/projects/{projectId}/rename" },
    },
  },
  {
    key: "projects.set-description",
    kind: "command",
    domain: "projects",
    messageName: "SetProjectDescriptionCommand",
    handlerName: "SetProjectDescriptionCommandHandler",
    serviceName: "SetProjectDescriptionUseCase",
    inputSchema: setProjectDescriptionCommandInputSchema,
    serviceToken: tokens.setProjectDescriptionUseCase,
    transports: {
      cli: "appaloft project set-description <projectId>",
      orpc: { method: "POST", path: "/api/projects/{projectId}/description" },
    },
  },
  {
    key: "projects.archive",
    kind: "command",
    domain: "projects",
    messageName: "ArchiveProjectCommand",
    handlerName: "ArchiveProjectCommandHandler",
    serviceName: "ArchiveProjectUseCase",
    inputSchema: archiveProjectCommandInputSchema,
    serviceToken: tokens.archiveProjectUseCase,
    transportAccess: {
      productSession: {
        minRole: "admin",
      },
    },
    transports: {
      cli: "appaloft project archive <projectId>",
      orpc: { method: "POST", path: "/api/projects/{projectId}/archive" },
    },
  },
  {
    key: "projects.restore",
    kind: "command",
    domain: "projects",
    messageName: "RestoreProjectCommand",
    handlerName: "RestoreProjectCommandHandler",
    serviceName: "RestoreProjectUseCase",
    inputSchema: restoreProjectCommandInputSchema,
    serviceToken: tokens.restoreProjectUseCase,
    transports: {
      cli: "appaloft project restore <projectId>",
      orpc: { method: "POST", path: "/api/projects/{projectId}/restore" },
    },
  },
  {
    key: "projects.delete-check",
    kind: "query",
    domain: "projects",
    messageName: "CheckProjectDeleteSafetyQuery",
    handlerName: "CheckProjectDeleteSafetyQueryHandler",
    serviceName: "CheckProjectDeleteSafetyQueryService",
    inputSchema: checkProjectDeleteSafetyQueryInputSchema,
    serviceToken: tokens.checkProjectDeleteSafetyQueryService,
    transports: {
      cli: "appaloft project delete-check <projectId>",
      orpc: { method: "GET", path: "/api/projects/{projectId}/delete-check" },
    },
  },
  {
    key: "projects.delete",
    kind: "command",
    domain: "projects",
    messageName: "DeleteProjectCommand",
    handlerName: "DeleteProjectCommandHandler",
    serviceName: "DeleteProjectUseCase",
    inputSchema: deleteProjectCommandInputSchema,
    serviceToken: tokens.deleteProjectUseCase,
    transports: {
      cli: "appaloft project delete <projectId> --confirm <projectId>",
      orpc: { method: "DELETE", path: "/api/projects/{projectId}" },
    },
  },
  {
    key: "servers.register",
    kind: "command",
    domain: "servers",
    messageName: "RegisterServerCommand",
    handlerName: "RegisterServerCommandHandler",
    serviceName: "RegisterServerUseCase",
    inputSchema: registerServerCommandInputSchema,
    serviceToken: tokens.registerServerUseCase,
    transports: {
      cli: "appaloft server register",
      orpc: { method: "POST", path: "/api/servers" },
    },
  },
  {
    key: "servers.configure-credential",
    kind: "command",
    domain: "servers",
    messageName: "ConfigureServerCredentialCommand",
    handlerName: "ConfigureServerCredentialCommandHandler",
    serviceName: "ConfigureServerCredentialUseCase",
    inputSchema: configureServerCredentialCommandInputSchema,
    serviceToken: tokens.configureServerCredentialUseCase,
    transports: {
      cli: "appaloft server credential <serverId>",
      orpc: { method: "POST", path: "/api/servers/{serverId}/credentials" },
    },
  },
  {
    key: "credentials.create-ssh",
    kind: "command",
    domain: "credentials",
    messageName: "CreateSshCredentialCommand",
    handlerName: "CreateSshCredentialCommandHandler",
    serviceName: "CreateSshCredentialUseCase",
    inputSchema: createSshCredentialCommandInputSchema,
    serviceToken: tokens.createSshCredentialUseCase,
    transports: {
      cli: "appaloft server credential-create",
      orpc: { method: "POST", path: "/api/credentials/ssh" },
    },
  },
  {
    key: "credentials.list-ssh",
    kind: "query",
    domain: "credentials",
    messageName: "ListSshCredentialsQuery",
    handlerName: "ListSshCredentialsQueryHandler",
    serviceName: "ListSshCredentialsQueryService",
    inputSchema: listSshCredentialsQueryInputSchema,
    serviceToken: tokens.listSshCredentialsQueryService,
    transports: {
      cli: "appaloft server credential-list",
      orpc: { method: "GET", path: "/api/credentials/ssh" },
    },
  },
  {
    key: "credentials.show",
    kind: "query",
    domain: "credentials",
    messageName: "ShowSshCredentialQuery",
    handlerName: "ShowSshCredentialQueryHandler",
    serviceName: "ShowSshCredentialQueryService",
    inputSchema: showSshCredentialQueryInputSchema,
    serviceToken: tokens.showSshCredentialQueryService,
    transports: {
      cli: "appaloft server credential-show <credentialId>",
      orpc: { method: "GET", path: "/api/credentials/ssh/{credentialId}" },
    },
  },
  {
    key: "credentials.delete-ssh",
    kind: "command",
    domain: "credentials",
    messageName: "DeleteSshCredentialCommand",
    handlerName: "DeleteSshCredentialCommandHandler",
    serviceName: "DeleteSshCredentialUseCase",
    inputSchema: deleteSshCredentialCommandInputSchema,
    serviceToken: tokens.deleteSshCredentialUseCase,
    transports: {
      cli: "appaloft server credential-delete <credentialId> --confirm <credentialId>",
      orpc: { method: "DELETE", path: "/api/credentials/ssh/{credentialId}" },
    },
  },
  {
    key: "credentials.rotate-ssh",
    kind: "command",
    domain: "credentials",
    messageName: "RotateSshCredentialCommand",
    handlerName: "RotateSshCredentialCommandHandler",
    serviceName: "RotateSshCredentialUseCase",
    inputSchema: rotateSshCredentialCommandInputSchema,
    serviceToken: tokens.rotateSshCredentialUseCase,
    transports: {
      cli: "appaloft server credential-rotate <credentialId> --private-key-file <path> --confirm <credentialId>",
      orpc: { method: "POST", path: "/api/credentials/ssh/{credentialId}/rotate" },
    },
  },
  {
    key: "servers.list",
    kind: "query",
    domain: "servers",
    messageName: "ListServersQuery",
    handlerName: "ListServersQueryHandler",
    serviceName: "ListServersQueryService",
    inputSchema: listServersQueryInputSchema,
    serviceToken: tokens.listServersQueryService,
    transports: {
      cli: "appaloft server list",
      orpc: { method: "GET", path: "/api/servers" },
    },
  },
  {
    key: "servers.show",
    kind: "query",
    domain: "servers",
    messageName: "ShowServerQuery",
    handlerName: "ShowServerQueryHandler",
    serviceName: "ShowServerQueryService",
    inputSchema: showServerQueryInputSchema,
    serviceToken: tokens.showServerQueryService,
    transports: {
      cli: "appaloft server show <serverId>",
      orpc: { method: "GET", path: "/api/servers/{serverId}" },
    },
  },
  {
    key: "servers.capacity.inspect",
    kind: "query",
    domain: "servers",
    messageName: "InspectServerCapacityQuery",
    handlerName: "InspectServerCapacityQueryHandler",
    serviceName: "InspectServerCapacityQueryService",
    inputSchema: inspectServerCapacityQueryInputSchema,
    serviceToken: tokens.inspectServerCapacityQueryService,
    transports: {
      cli: "appaloft server capacity inspect <serverId>",
      orpc: { method: "GET", path: "/api/servers/{serverId}/capacity" },
    },
  },
  {
    key: "runtime-usage.inspect",
    kind: "query",
    domain: "runtime-usage",
    messageName: "InspectRuntimeUsageQuery",
    handlerName: "InspectRuntimeUsageQueryHandler",
    serviceName: "RuntimeUsageInspectionQueryService",
    inputSchema: inspectRuntimeUsageQueryInputSchema,
    serviceToken: tokens.runtimeUsageInspectionQueryService,
    transports: {
      cli: "appaloft runtime-usage inspect <scope>",
      orpc: { method: "GET", path: "/api/runtime-usage/inspect" },
    },
  },
  {
    key: "runtime-monitoring.samples.list",
    kind: "query",
    domain: "runtime-monitoring",
    messageName: "ListRuntimeMonitoringSamplesQuery",
    handlerName: "ListRuntimeMonitoringSamplesQueryHandler",
    serviceName: "RuntimeMonitoringSamplesQueryService",
    inputSchema: listRuntimeMonitoringSamplesQueryInputSchema,
    serviceToken: tokens.listRuntimeMonitoringSamplesQueryService,
    transports: {
      cli: "appaloft runtime-monitoring samples <scope> --from <iso> --to <iso>",
      orpc: { method: "GET", path: "/api/runtime-monitoring/samples" },
    },
  },
  {
    key: "runtime-monitoring.rollup",
    kind: "query",
    domain: "runtime-monitoring",
    messageName: "RuntimeMonitoringRollupQuery",
    handlerName: "RuntimeMonitoringRollupQueryHandler",
    serviceName: "RuntimeMonitoringRollupQueryService",
    inputSchema: runtimeMonitoringRollupQueryInputSchema,
    serviceToken: tokens.runtimeMonitoringRollupQueryService,
    transports: {
      cli: "appaloft runtime-monitoring rollup <scope> --from <iso> --to <iso> --bucket <bucket>",
      orpc: { method: "GET", path: "/api/runtime-monitoring/rollup" },
    },
  },
  {
    key: "runtime-monitoring.thresholds.configure",
    kind: "command",
    domain: "runtime-monitoring",
    messageName: "ConfigureRuntimeMonitoringThresholdsCommand",
    handlerName: "ConfigureRuntimeMonitoringThresholdsCommandHandler",
    serviceName: "ConfigureRuntimeMonitoringThresholdsUseCase",
    inputSchema: configureRuntimeMonitoringThresholdsCommandInputSchema,
    serviceToken: tokens.configureRuntimeMonitoringThresholdsUseCase,
    transports: {
      cli: "appaloft runtime-monitoring thresholds configure <scope> --rule <json>",
      orpc: { method: "POST", path: "/api/runtime-monitoring/thresholds" },
    },
  },
  {
    key: "runtime-monitoring.thresholds.show",
    kind: "query",
    domain: "runtime-monitoring",
    messageName: "ShowRuntimeMonitoringThresholdsQuery",
    handlerName: "ShowRuntimeMonitoringThresholdsQueryHandler",
    serviceName: "ShowRuntimeMonitoringThresholdsQueryService",
    inputSchema: showRuntimeMonitoringThresholdsQueryInputSchema,
    serviceToken: tokens.showRuntimeMonitoringThresholdsQueryService,
    transports: {
      cli: "appaloft runtime-monitoring thresholds show <scope>",
      orpc: { method: "GET", path: "/api/runtime-monitoring/thresholds" },
    },
  },
  {
    key: "servers.capacity.prune",
    kind: "command",
    domain: "servers",
    messageName: "PruneServerCapacityCommand",
    handlerName: "PruneServerCapacityCommandHandler",
    serviceName: "PruneServerCapacityUseCase",
    inputSchema: pruneServerCapacityCommandInputSchema,
    serviceToken: tokens.pruneServerCapacityUseCase,
    transports: {
      cli: "appaloft server capacity prune <serverId> --before <iso>",
      orpc: { method: "POST", path: "/api/servers/{serverId}/capacity/prune" },
    },
  },
  {
    key: "scheduled-runtime-prune-policies.configure",
    kind: "command",
    domain: "servers",
    messageName: "ConfigureScheduledRuntimePrunePolicyCommand",
    handlerName: "ConfigureScheduledRuntimePrunePolicyCommandHandler",
    serviceName: "ConfigureScheduledRuntimePrunePolicyUseCase",
    inputSchema: configureScheduledRuntimePrunePolicyCommandInputSchema,
    serviceToken: tokens.configureScheduledRuntimePrunePolicyUseCase,
    transports: {
      cli: "appaloft server capacity policy configure --scope <scope> --retention-days <days>",
      orpc: { method: "POST", path: "/api/servers/capacity/policies" },
    },
  },
  {
    key: "scheduled-runtime-prune-policies.list",
    kind: "query",
    domain: "servers",
    messageName: "ListScheduledRuntimePrunePoliciesQuery",
    handlerName: "ListScheduledRuntimePrunePoliciesQueryHandler",
    serviceName: "ListScheduledRuntimePrunePoliciesQueryService",
    inputSchema: listScheduledRuntimePrunePoliciesQueryInputSchema,
    serviceToken: tokens.listScheduledRuntimePrunePoliciesQueryService,
    transports: {
      cli: "appaloft server capacity policy list",
      orpc: { method: "GET", path: "/api/servers/capacity/policies" },
    },
  },
  {
    key: "scheduled-runtime-prune-policies.show",
    kind: "query",
    domain: "servers",
    messageName: "ShowScheduledRuntimePrunePolicyQuery",
    handlerName: "ShowScheduledRuntimePrunePolicyQueryHandler",
    serviceName: "ShowScheduledRuntimePrunePolicyQueryService",
    inputSchema: showScheduledRuntimePrunePolicyQueryInputSchema,
    serviceToken: tokens.showScheduledRuntimePrunePolicyQueryService,
    transports: {
      cli: "appaloft server capacity policy show <policyId>",
      orpc: { method: "GET", path: "/api/servers/capacity/policies/{policyId}" },
    },
  },
  {
    key: "servers.rename",
    kind: "command",
    domain: "servers",
    messageName: "RenameServerCommand",
    handlerName: "RenameServerCommandHandler",
    serviceName: "RenameServerUseCase",
    inputSchema: renameServerCommandInputSchema,
    serviceToken: tokens.renameServerUseCase,
    transports: {
      cli: "appaloft server rename <serverId> --name <name>",
      orpc: { method: "POST", path: "/api/servers/{serverId}/rename" },
    },
  },
  {
    key: "servers.configure-edge-proxy",
    kind: "command",
    domain: "servers",
    messageName: "ConfigureServerEdgeProxyCommand",
    handlerName: "ConfigureServerEdgeProxyCommandHandler",
    serviceName: "ConfigureServerEdgeProxyUseCase",
    inputSchema: configureServerEdgeProxyCommandInputSchema,
    serviceToken: tokens.configureServerEdgeProxyUseCase,
    transports: {
      cli: "appaloft server proxy configure <serverId> --kind none|traefik|caddy",
      orpc: { method: "POST", path: "/api/servers/{serverId}/edge-proxy/configuration" },
    },
  },
  {
    key: "servers.deactivate",
    kind: "command",
    domain: "servers",
    messageName: "DeactivateServerCommand",
    handlerName: "DeactivateServerCommandHandler",
    serviceName: "DeactivateServerUseCase",
    inputSchema: deactivateServerCommandInputSchema,
    serviceToken: tokens.deactivateServerUseCase,
    transports: {
      cli: "appaloft server deactivate <serverId>",
      orpc: { method: "POST", path: "/api/servers/{serverId}/deactivate" },
    },
  },
  {
    key: "servers.delete-check",
    kind: "query",
    domain: "servers",
    messageName: "CheckServerDeleteSafetyQuery",
    handlerName: "CheckServerDeleteSafetyQueryHandler",
    serviceName: "CheckServerDeleteSafetyQueryService",
    inputSchema: checkServerDeleteSafetyQueryInputSchema,
    serviceToken: tokens.checkServerDeleteSafetyQueryService,
    transports: {
      cli: "appaloft server delete-check <serverId>",
      orpc: { method: "GET", path: "/api/servers/{serverId}/delete-check" },
    },
  },
  {
    key: "servers.delete",
    kind: "command",
    domain: "servers",
    messageName: "DeleteServerCommand",
    handlerName: "DeleteServerCommandHandler",
    serviceName: "DeleteServerUseCase",
    inputSchema: deleteServerCommandInputSchema,
    serviceToken: tokens.deleteServerUseCase,
    transports: {
      cli: "appaloft server delete <serverId> --confirm <serverId>",
      orpc: { method: "DELETE", path: "/api/servers/{serverId}" },
    },
  },
  {
    key: "servers.test-connectivity",
    kind: "command",
    domain: "servers",
    messageName: "TestServerConnectivityCommand",
    handlerName: "TestServerConnectivityCommandHandler",
    serviceName: "TestServerConnectivityUseCase",
    inputSchema: testServerConnectivityCommandInputSchema,
    serviceToken: tokens.testServerConnectivityUseCase,
    transports: {
      cli: "appaloft server test <serverId>; appaloft server doctor <serverId>",
      orpc: { method: "POST", path: "/api/servers/{serverId}/connectivity-tests" },
    },
  },
  {
    key: "servers.test-draft-connectivity",
    kind: "command",
    domain: "servers",
    messageName: "TestServerConnectivityCommand",
    handlerName: "TestServerConnectivityCommandHandler",
    serviceName: "TestServerConnectivityUseCase",
    inputSchema: testServerConnectivityCommandInputSchema,
    serviceToken: tokens.testServerConnectivityUseCase,
    transports: {
      orpc: { method: "POST", path: "/api/servers/connectivity-tests" },
    },
  },
  {
    key: "servers.bootstrap-proxy",
    kind: "command",
    domain: "servers",
    messageName: "BootstrapServerProxyCommand",
    handlerName: "BootstrapServerProxyCommandHandler",
    serviceName: "BootstrapServerProxyUseCase",
    inputSchema: bootstrapServerProxyCommandInputSchema,
    serviceToken: tokens.bootstrapServerProxyUseCase,
    transports: {
      cli: "appaloft server proxy repair <serverId>",
      orpc: { method: "POST", path: "/api/servers/{serverId}/edge-proxy/bootstrap" },
    },
  },
  {
    key: "resources.list",
    kind: "query",
    domain: "resources",
    messageName: "ListResourcesQuery",
    handlerName: "ListResourcesQueryHandler",
    serviceName: "ListResourcesQueryService",
    inputSchema: listResourcesQueryInputSchema,
    serviceToken: tokens.listResourcesQueryService,
    transports: {
      cli: "appaloft resource list",
      orpc: { method: "GET", path: "/api/resources" },
    },
  },
  {
    key: "resources.show",
    kind: "query",
    domain: "resources",
    messageName: "ShowResourceQuery",
    handlerName: "ShowResourceQueryHandler",
    serviceName: "ShowResourceQueryService",
    inputSchema: showResourceQueryInputSchema,
    serviceToken: tokens.showResourceQueryService,
    transports: {
      cli: "appaloft resource show <resourceId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}" },
    },
  },
  {
    key: "resources.create",
    kind: "command",
    domain: "resources",
    messageName: "CreateResourceCommand",
    handlerName: "CreateResourceCommandHandler",
    serviceName: "CreateResourceUseCase",
    inputSchema: createResourceCommandInputSchema,
    serviceToken: tokens.createResourceUseCase,
    transports: {
      cli: "appaloft resource create",
      orpc: { method: "POST", path: "/api/resources" },
    },
  },
  {
    key: "resources.archive",
    kind: "command",
    domain: "resources",
    messageName: "ArchiveResourceCommand",
    handlerName: "ArchiveResourceCommandHandler",
    serviceName: "ArchiveResourceUseCase",
    inputSchema: archiveResourceCommandInputSchema,
    serviceToken: tokens.archiveResourceUseCase,
    transports: {
      cli: "appaloft resource archive <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/archive" },
    },
  },
  {
    key: "resources.delete",
    kind: "command",
    domain: "resources",
    messageName: "DeleteResourceCommand",
    handlerName: "DeleteResourceCommandHandler",
    serviceName: "DeleteResourceUseCase",
    inputSchema: deleteResourceCommandInputSchema,
    serviceToken: tokens.deleteResourceUseCase,
    transports: {
      cli: "appaloft resource delete <resourceId> --confirm-slug <slug>",
      orpc: { method: "DELETE", path: "/api/resources/{resourceId}" },
    },
  },
  {
    key: "resources.configure-health",
    kind: "command",
    domain: "resources",
    messageName: "ConfigureResourceHealthCommand",
    handlerName: "ConfigureResourceHealthCommandHandler",
    serviceName: "ConfigureResourceHealthUseCase",
    inputSchema: configureResourceHealthCommandInputSchema,
    serviceToken: tokens.configureResourceHealthUseCase,
    transports: {
      cli: "appaloft resource configure-health <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/health-policy" },
    },
  },
  {
    key: "resources.reset-health",
    kind: "command",
    domain: "resources",
    messageName: "ResetResourceHealthCommand",
    handlerName: "ResetResourceHealthCommandHandler",
    serviceName: "ResetResourceHealthUseCase",
    inputSchema: resetResourceHealthCommandInputSchema,
    serviceToken: tokens.resetResourceHealthUseCase,
    transports: {
      cli: "appaloft resource reset-health <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/health-policy/reset" },
    },
  },
  {
    key: "resources.configure-source",
    kind: "command",
    domain: "resources",
    messageName: "ConfigureResourceSourceCommand",
    handlerName: "ConfigureResourceSourceCommandHandler",
    serviceName: "ConfigureResourceSourceUseCase",
    inputSchema: configureResourceSourceCommandInputSchema,
    serviceToken: tokens.configureResourceSourceUseCase,
    transports: {
      cli: "appaloft resource configure-source <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/source" },
    },
  },
  {
    key: "resources.configure-runtime",
    kind: "command",
    domain: "resources",
    messageName: "ConfigureResourceRuntimeCommand",
    handlerName: "ConfigureResourceRuntimeCommandHandler",
    serviceName: "ConfigureResourceRuntimeUseCase",
    inputSchema: configureResourceRuntimeCommandInputSchema,
    serviceToken: tokens.configureResourceRuntimeUseCase,
    transports: {
      cli: "appaloft resource configure-runtime <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/runtime-profile" },
    },
  },
  {
    key: "resources.configure-network",
    kind: "command",
    domain: "resources",
    messageName: "ConfigureResourceNetworkCommand",
    handlerName: "ConfigureResourceNetworkCommandHandler",
    serviceName: "ConfigureResourceNetworkUseCase",
    inputSchema: configureResourceNetworkCommandInputSchema,
    serviceToken: tokens.configureResourceNetworkUseCase,
    transports: {
      cli: "appaloft resource configure-network <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/network-profile" },
    },
  },
  {
    key: "resources.configure-access",
    kind: "command",
    domain: "resources",
    messageName: "ConfigureResourceAccessCommand",
    handlerName: "ConfigureResourceAccessCommandHandler",
    serviceName: "ConfigureResourceAccessUseCase",
    inputSchema: configureResourceAccessCommandInputSchema,
    serviceToken: tokens.configureResourceAccessUseCase,
    transports: {
      cli: "appaloft resource configure-access <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/access-profile" },
    },
  },
  {
    key: "resources.configure-auto-deploy",
    kind: "command",
    domain: "resources",
    messageName: "ConfigureResourceAutoDeployCommand",
    handlerName: "ConfigureResourceAutoDeployCommandHandler",
    serviceName: "ConfigureResourceAutoDeployUseCase",
    inputSchema: configureResourceAutoDeployCommandInputSchema,
    serviceToken: tokens.configureResourceAutoDeployUseCase,
    transports: {
      cli: "appaloft resource auto-deploy <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/auto-deploy" },
    },
  },
  {
    key: "resources.attach-storage",
    kind: "command",
    domain: "resources",
    messageName: "AttachResourceStorageCommand",
    handlerName: "AttachResourceStorageCommandHandler",
    serviceName: "AttachResourceStorageUseCase",
    inputSchema: attachResourceStorageCommandInputSchema,
    serviceToken: tokens.attachResourceStorageUseCase,
    transports: {
      cli: "appaloft resource storage attach <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/storage-attachments" },
    },
  },
  {
    key: "resources.detach-storage",
    kind: "command",
    domain: "resources",
    messageName: "DetachResourceStorageCommand",
    handlerName: "DetachResourceStorageCommandHandler",
    serviceName: "DetachResourceStorageUseCase",
    inputSchema: detachResourceStorageCommandInputSchema,
    serviceToken: tokens.detachResourceStorageUseCase,
    transports: {
      cli: "appaloft resource storage detach <resourceId> <attachmentId>",
      orpc: {
        method: "DELETE",
        path: "/api/resources/{resourceId}/storage-attachments/{attachmentId}",
      },
    },
  },
  {
    key: "resources.set-variable",
    kind: "command",
    domain: "resources",
    messageName: "SetResourceVariableCommand",
    handlerName: "SetResourceVariableCommandHandler",
    serviceName: "SetResourceVariableUseCase",
    inputSchema: setResourceVariableCommandInputSchema,
    serviceToken: tokens.setResourceVariableUseCase,
    transports: {
      cli: "appaloft resource set-variable <resourceId> <key> <value>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/variables" },
    },
  },
  {
    key: "resources.secrets.create",
    kind: "command",
    domain: "resources",
    messageName: "CreateResourceSecretReferenceCommand",
    handlerName: "CreateResourceSecretReferenceCommandHandler",
    serviceName: "CreateResourceSecretReferenceUseCase",
    inputSchema: createResourceSecretReferenceCommandInputSchema,
    serviceToken: tokens.createResourceSecretReferenceUseCase,
    transports: {
      cli: "appaloft resource secrets create <resourceId> <key> <value>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/secrets" },
    },
  },
  {
    key: "resources.secrets.rotate",
    kind: "command",
    domain: "resources",
    messageName: "RotateResourceSecretReferenceCommand",
    handlerName: "RotateResourceSecretReferenceCommandHandler",
    serviceName: "RotateResourceSecretReferenceUseCase",
    inputSchema: rotateResourceSecretReferenceCommandInputSchema,
    serviceToken: tokens.rotateResourceSecretReferenceUseCase,
    transports: {
      cli: "appaloft resource secrets rotate <resourceId> <key> <value>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/secrets/{key}" },
    },
  },
  {
    key: "resources.secrets.delete",
    kind: "command",
    domain: "resources",
    messageName: "DeleteResourceSecretReferenceCommand",
    handlerName: "DeleteResourceSecretReferenceCommandHandler",
    serviceName: "DeleteResourceSecretReferenceUseCase",
    inputSchema: deleteResourceSecretReferenceCommandInputSchema,
    serviceToken: tokens.deleteResourceSecretReferenceUseCase,
    transports: {
      cli: "appaloft resource secrets delete <resourceId> <key>",
      orpc: { method: "DELETE", path: "/api/resources/{resourceId}/secrets/{key}" },
    },
  },
  {
    key: "resources.secrets.list",
    kind: "query",
    domain: "resources",
    messageName: "ListResourceSecretReferencesQuery",
    handlerName: "ListResourceSecretReferencesQueryHandler",
    serviceName: "ResourceSecretReferenceQueryService",
    inputSchema: listResourceSecretReferencesQueryInputSchema,
    serviceToken: tokens.resourceSecretReferenceQueryService,
    transports: {
      cli: "appaloft resource secrets list <resourceId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/secrets" },
    },
  },
  {
    key: "resources.secrets.show",
    kind: "query",
    domain: "resources",
    messageName: "ShowResourceSecretReferenceQuery",
    handlerName: "ShowResourceSecretReferenceQueryHandler",
    serviceName: "ResourceSecretReferenceQueryService",
    inputSchema: showResourceSecretReferenceQueryInputSchema,
    serviceToken: tokens.resourceSecretReferenceQueryService,
    transports: {
      cli: "appaloft resource secrets show <resourceId> <key>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/secrets/{key}" },
    },
  },
  {
    key: "resources.import-variables",
    kind: "command",
    domain: "resources",
    messageName: "ImportResourceVariablesCommand",
    handlerName: "ImportResourceVariablesCommandHandler",
    serviceName: "ImportResourceVariablesUseCase",
    inputSchema: importResourceVariablesCommandInputSchema,
    serviceToken: tokens.importResourceVariablesUseCase,
    transports: {
      cli: "appaloft resource import-variables <resourceId> --content <dotenv>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/variables/import" },
    },
  },
  {
    key: "resources.unset-variable",
    kind: "command",
    domain: "resources",
    messageName: "UnsetResourceVariableCommand",
    handlerName: "UnsetResourceVariableCommandHandler",
    serviceName: "UnsetResourceVariableUseCase",
    inputSchema: unsetResourceVariableCommandInputSchema,
    serviceToken: tokens.unsetResourceVariableUseCase,
    transports: {
      cli: "appaloft resource unset-variable <resourceId> <key>",
      orpc: { method: "DELETE", path: "/api/resources/{resourceId}/variables/{key}" },
    },
  },
  {
    key: "resources.effective-config",
    kind: "query",
    domain: "resources",
    messageName: "ResourceEffectiveConfigQuery",
    handlerName: "ResourceEffectiveConfigQueryHandler",
    serviceName: "ResourceEffectiveConfigQueryService",
    inputSchema: resourceEffectiveConfigQueryInputSchema,
    serviceToken: tokens.resourceEffectiveConfigQueryService,
    transports: {
      cli: "appaloft resource effective-config <resourceId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/effective-config" },
    },
  },
  {
    key: "resources.runtime-logs",
    kind: "query",
    domain: "resources",
    messageName: "ResourceRuntimeLogsQuery",
    handlerName: "ResourceRuntimeLogsQueryHandler",
    serviceName: "ResourceRuntimeLogsQueryService",
    inputSchema: resourceRuntimeLogsQueryInputSchema,
    serviceToken: tokens.resourceRuntimeLogsQueryService,
    transports: {
      cli: "appaloft resource logs <resourceId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/runtime-logs" },
      orpcStream: { method: "GET", path: "/api/resources/{resourceId}/runtime-logs/stream" },
    },
  },
  {
    key: "resources.runtime-logs.archive",
    kind: "command",
    domain: "resources",
    messageName: "ArchiveResourceRuntimeLogsCommand",
    handlerName: "ArchiveResourceRuntimeLogsCommandHandler",
    serviceName: "ArchiveResourceRuntimeLogsUseCase",
    inputSchema: archiveResourceRuntimeLogsCommandInputSchema,
    serviceToken: tokens.archiveResourceRuntimeLogsUseCase,
    transports: {
      cli: "appaloft resource log-archives archive <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/runtime-log-archives" },
    },
  },
  {
    key: "resources.runtime-log-archives.list",
    kind: "query",
    domain: "resources",
    messageName: "ListResourceRuntimeLogArchivesQuery",
    handlerName: "ListResourceRuntimeLogArchivesQueryHandler",
    serviceName: "ListResourceRuntimeLogArchivesQueryService",
    inputSchema: listResourceRuntimeLogArchivesQueryInputSchema,
    serviceToken: tokens.listResourceRuntimeLogArchivesQueryService,
    transports: {
      cli: "appaloft resource log-archives list",
      orpc: { method: "GET", path: "/api/resources/runtime-log-archives" },
    },
  },
  {
    key: "resources.runtime-log-archives.show",
    kind: "query",
    domain: "resources",
    messageName: "ShowResourceRuntimeLogArchiveQuery",
    handlerName: "ShowResourceRuntimeLogArchiveQueryHandler",
    serviceName: "ShowResourceRuntimeLogArchiveQueryService",
    inputSchema: showResourceRuntimeLogArchiveQueryInputSchema,
    serviceToken: tokens.showResourceRuntimeLogArchiveQueryService,
    transports: {
      cli: "appaloft resource log-archives show <archiveId>",
      orpc: { method: "GET", path: "/api/resources/runtime-log-archives/{archiveId}" },
    },
  },
  {
    key: "resources.runtime-log-archives.prune",
    kind: "command",
    domain: "resources",
    messageName: "PruneResourceRuntimeLogArchivesCommand",
    handlerName: "PruneResourceRuntimeLogArchivesCommandHandler",
    serviceName: "PruneResourceRuntimeLogArchivesUseCase",
    inputSchema: pruneResourceRuntimeLogArchivesCommandInputSchema,
    serviceToken: tokens.pruneResourceRuntimeLogArchivesUseCase,
    transports: {
      cli: "appaloft resource log-archives prune --before <iso>",
      orpc: { method: "POST", path: "/api/resources/runtime-log-archives/prune" },
    },
  },
  {
    key: "terminal-sessions.open",
    kind: "command",
    domain: "terminal-sessions",
    messageName: "OpenTerminalSessionCommand",
    handlerName: "OpenTerminalSessionCommandHandler",
    serviceName: "OpenTerminalSessionUseCase",
    inputSchema: openTerminalSessionCommandInputSchema,
    serviceToken: tokens.openTerminalSessionUseCase,
    transports: {
      cli: "appaloft server terminal <serverId>; appaloft resource terminal <resourceId>",
      orpc: { method: "POST", path: "/api/terminal-sessions" },
    },
  },
  {
    key: "terminal-sessions.list",
    kind: "query",
    domain: "terminal-sessions",
    messageName: "ListTerminalSessionsQuery",
    handlerName: "ListTerminalSessionsQueryHandler",
    serviceName: "TerminalSessionLifecycleService",
    inputSchema: listTerminalSessionsQueryInputSchema,
    serviceToken: tokens.terminalSessionLifecycleService,
    transports: {
      cli: "appaloft terminal-session list",
      orpc: { method: "GET", path: "/api/terminal-sessions" },
    },
  },
  {
    key: "terminal-sessions.show",
    kind: "query",
    domain: "terminal-sessions",
    messageName: "ShowTerminalSessionQuery",
    handlerName: "ShowTerminalSessionQueryHandler",
    serviceName: "TerminalSessionLifecycleService",
    inputSchema: showTerminalSessionQueryInputSchema,
    serviceToken: tokens.terminalSessionLifecycleService,
    transports: {
      cli: "appaloft terminal-session show <sessionId>",
      orpc: { method: "GET", path: "/api/terminal-sessions/{sessionId}" },
    },
  },
  {
    key: "terminal-sessions.close",
    kind: "command",
    domain: "terminal-sessions",
    messageName: "CloseTerminalSessionCommand",
    handlerName: "CloseTerminalSessionCommandHandler",
    serviceName: "TerminalSessionLifecycleService",
    inputSchema: closeTerminalSessionCommandInputSchema,
    serviceToken: tokens.terminalSessionLifecycleService,
    transports: {
      cli: "appaloft terminal-session close <sessionId>",
      orpc: { method: "POST", path: "/api/terminal-sessions/{sessionId}/close" },
    },
  },
  {
    key: "terminal-sessions.expire",
    kind: "command",
    domain: "terminal-sessions",
    messageName: "ExpireTerminalSessionsCommand",
    handlerName: "ExpireTerminalSessionsCommandHandler",
    serviceName: "TerminalSessionLifecycleService",
    inputSchema: expireTerminalSessionsCommandInputSchema,
    serviceToken: tokens.terminalSessionLifecycleService,
    transports: {
      cli: "appaloft terminal-session expire",
      orpc: { method: "POST", path: "/api/terminal-sessions/expire" },
    },
  },
  {
    key: "resources.diagnostic-summary",
    kind: "query",
    domain: "resources",
    messageName: "ResourceDiagnosticSummaryQuery",
    handlerName: "ResourceDiagnosticSummaryQueryHandler",
    serviceName: "ResourceDiagnosticSummaryQueryService",
    inputSchema: resourceDiagnosticSummaryQueryInputSchema,
    serviceToken: tokens.resourceDiagnosticSummaryQueryService,
    transports: {
      cli: "appaloft resource diagnose <resourceId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/diagnostic-summary" },
    },
  },
  {
    key: "resources.access-failure-evidence.lookup",
    kind: "query",
    domain: "resources",
    messageName: "ResourceAccessFailureEvidenceLookupQuery",
    handlerName: "ResourceAccessFailureEvidenceLookupQueryHandler",
    serviceName: "ResourceAccessFailureEvidenceLookupQueryService",
    inputSchema: resourceAccessFailureEvidenceLookupQueryInputSchema,
    serviceToken: tokens.resourceAccessFailureEvidenceLookupQueryService,
    transports: {
      cli: "appaloft resource access-failure <requestId>",
      orpc: { method: "GET", path: "/api/resource-access-failures/{requestId}" },
    },
  },
  {
    key: "resources.health",
    kind: "query",
    domain: "resources",
    messageName: "ResourceHealthQuery",
    handlerName: "ResourceHealthQueryHandler",
    serviceName: "ResourceHealthQueryService",
    inputSchema: resourceHealthQueryInputSchema,
    serviceToken: tokens.resourceHealthQueryService,
    transports: {
      cli: "appaloft resource health <resourceId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/health" },
    },
  },
  {
    key: "resources.health-history",
    kind: "query",
    domain: "resources",
    messageName: "ResourceHealthHistoryQuery",
    handlerName: "ResourceHealthHistoryQueryHandler",
    serviceName: "ResourceHealthHistoryQueryService",
    inputSchema: resourceHealthHistoryQueryInputSchema,
    serviceToken: tokens.resourceHealthHistoryQueryService,
    transports: {
      cli: "appaloft resource health-history <resourceId> --from <iso> --to <iso>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/health-history" },
    },
  },
  {
    key: "resources.proxy-configuration.preview",
    kind: "query",
    domain: "resources",
    messageName: "ResourceProxyConfigurationPreviewQuery",
    handlerName: "ResourceProxyConfigurationPreviewQueryHandler",
    serviceName: "ResourceProxyConfigurationPreviewQueryService",
    inputSchema: resourceProxyConfigurationPreviewQueryInputSchema,
    serviceToken: tokens.resourceProxyConfigurationPreviewQueryService,
    transports: {
      cli: "appaloft resource proxy-config <resourceId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/proxy-configuration" },
    },
  },
  {
    key: "dependency-resources.provisioning.plan",
    kind: "command",
    domain: "dependency-resources",
    messageName: "CreateDependencyResourceProvisioningPlanCommand",
    handlerName: "CreateDependencyResourceProvisioningPlanCommandHandler",
    serviceName: "CreateDependencyResourceProvisioningPlanUseCase",
    inputSchema: createDependencyResourceProvisioningPlanInputSchema,
    serviceToken: tokens.createDependencyResourceProvisioningPlanUseCase,
    transports: {
      cli: "appaloft dependency plan --mode <create|reuse>",
      orpc: { method: "POST", path: "/api/dependency-resources/provisioning/plan" },
    },
  },
  {
    key: "dependency-resources.provisioning.accept",
    kind: "command",
    domain: "dependency-resources",
    messageName: "AcceptDependencyResourceProvisioningPlanCommand",
    handlerName: "AcceptDependencyResourceProvisioningPlanCommandHandler",
    serviceName: "AcceptDependencyResourceProvisioningPlanUseCase",
    inputSchema: acceptDependencyResourceProvisioningPlanInputSchema,
    serviceToken: tokens.acceptDependencyResourceProvisioningPlanUseCase,
    transports: {
      cli: "appaloft dependency accept <planId> --acknowledge-mutation",
      orpc: { method: "POST", path: "/api/dependency-resources/provisioning/{planId}/accept" },
    },
  },
  {
    key: "dependency-resources.provisioning.status",
    kind: "query",
    domain: "dependency-resources",
    messageName: "ShowDependencyResourceProvisioningPlanQuery",
    handlerName: "ShowDependencyResourceProvisioningPlanQueryHandler",
    serviceName: "ShowDependencyResourceProvisioningPlanQueryService",
    inputSchema: showDependencyResourceProvisioningPlanInputSchema,
    serviceToken: tokens.showDependencyResourceProvisioningPlanQueryService,
    transports: {
      cli: "appaloft dependency status <planId>",
      orpc: { method: "GET", path: "/api/dependency-resources/provisioning/{planId}" },
    },
  },
  {
    key: "dependency-resources.provision",
    kind: "command",
    domain: "dependency-resources",
    messageName: "ProvisionDependencyResourceCommand",
    handlerName: "ProvisionDependencyResourceCommandHandler",
    serviceName: "ProvisionDependencyResourceUseCase",
    inputSchema: provisionDependencyResourceCommandInputSchema,
    serviceToken: tokens.provisionDependencyResourceUseCase,
    transports: {
      cli: "appaloft dependency provision --kind <kind>",
      orpc: { method: "POST", path: "/api/dependency-resources/provision" },
    },
  },
  {
    key: "dependency-resources.import",
    kind: "command",
    domain: "dependency-resources",
    messageName: "ImportDependencyResourceCommand",
    handlerName: "ImportDependencyResourceCommandHandler",
    serviceName: "ImportDependencyResourceUseCase",
    inputSchema: importDependencyResourceCommandInputSchema,
    serviceToken: tokens.importDependencyResourceUseCase,
    transports: {
      cli: "appaloft dependency import --kind <kind>",
      orpc: { method: "POST", path: "/api/dependency-resources/import" },
    },
  },
  {
    key: "dependency-resources.list",
    kind: "query",
    domain: "dependency-resources",
    messageName: "ListDependencyResourcesQuery",
    handlerName: "ListDependencyResourcesQueryHandler",
    serviceName: "ListDependencyResourcesQueryService",
    inputSchema: listDependencyResourcesQueryInputSchema,
    serviceToken: tokens.listDependencyResourcesQueryService,
    transports: {
      cli: "appaloft dependency list",
      orpc: { method: "GET", path: "/api/dependency-resources" },
    },
  },
  {
    key: "dependency-resources.show",
    kind: "query",
    domain: "dependency-resources",
    messageName: "ShowDependencyResourceQuery",
    handlerName: "ShowDependencyResourceQueryHandler",
    serviceName: "ShowDependencyResourceQueryService",
    inputSchema: showDependencyResourceQueryInputSchema,
    serviceToken: tokens.showDependencyResourceQueryService,
    transports: {
      cli: "appaloft dependency show <dependencyResourceId>",
      orpc: { method: "GET", path: "/api/dependency-resources/{dependencyResourceId}" },
    },
  },
  {
    key: "dependency-resources.rename",
    kind: "command",
    domain: "dependency-resources",
    messageName: "RenameDependencyResourceCommand",
    handlerName: "RenameDependencyResourceCommandHandler",
    serviceName: "RenameDependencyResourceUseCase",
    inputSchema: renameDependencyResourceCommandInputSchema,
    serviceToken: tokens.renameDependencyResourceUseCase,
    transports: {
      cli: "appaloft dependency rename <dependencyResourceId>",
      orpc: { method: "POST", path: "/api/dependency-resources/{dependencyResourceId}/rename" },
    },
  },
  {
    key: "dependency-resources.delete",
    kind: "command",
    domain: "dependency-resources",
    messageName: "DeleteDependencyResourceCommand",
    handlerName: "DeleteDependencyResourceCommandHandler",
    serviceName: "DeleteDependencyResourceUseCase",
    inputSchema: deleteDependencyResourceCommandInputSchema,
    serviceToken: tokens.deleteDependencyResourceUseCase,
    transports: {
      cli: "appaloft dependency delete <dependencyResourceId>",
      orpc: { method: "DELETE", path: "/api/dependency-resources/{dependencyResourceId}" },
    },
  },
  {
    key: "dependency-resources.create-backup",
    kind: "command",
    domain: "dependency-resources",
    messageName: "CreateDependencyResourceBackupCommand",
    handlerName: "CreateDependencyResourceBackupCommandHandler",
    serviceName: "CreateDependencyResourceBackupUseCase",
    inputSchema: createDependencyResourceBackupCommandInputSchema,
    serviceToken: tokens.createDependencyResourceBackupUseCase,
    transports: {
      cli: "appaloft dependency backup create <dependencyResourceId>",
      orpc: { method: "POST", path: "/api/dependency-resources/{dependencyResourceId}/backups" },
    },
  },
  {
    key: "dependency-resources.list-backups",
    kind: "query",
    domain: "dependency-resources",
    messageName: "ListDependencyResourceBackupsQuery",
    handlerName: "ListDependencyResourceBackupsQueryHandler",
    serviceName: "ListDependencyResourceBackupsQueryService",
    inputSchema: listDependencyResourceBackupsQueryInputSchema,
    serviceToken: tokens.listDependencyResourceBackupsQueryService,
    transports: {
      cli: "appaloft dependency backup list <dependencyResourceId>",
      orpc: { method: "GET", path: "/api/dependency-resources/{dependencyResourceId}/backups" },
    },
  },
  {
    key: "dependency-resources.show-backup",
    kind: "query",
    domain: "dependency-resources",
    messageName: "ShowDependencyResourceBackupQuery",
    handlerName: "ShowDependencyResourceBackupQueryHandler",
    serviceName: "ShowDependencyResourceBackupQueryService",
    inputSchema: showDependencyResourceBackupQueryInputSchema,
    serviceToken: tokens.showDependencyResourceBackupQueryService,
    transports: {
      cli: "appaloft dependency backup show <backupId>",
      orpc: { method: "GET", path: "/api/dependency-resources/backups/{backupId}" },
    },
  },
  {
    key: "dependency-resources.restore-backup",
    kind: "command",
    domain: "dependency-resources",
    messageName: "RestoreDependencyResourceBackupCommand",
    handlerName: "RestoreDependencyResourceBackupCommandHandler",
    serviceName: "RestoreDependencyResourceBackupUseCase",
    inputSchema: restoreDependencyResourceBackupCommandInputSchema,
    serviceToken: tokens.restoreDependencyResourceBackupUseCase,
    transports: {
      cli: "appaloft dependency backup restore <backupId>",
      orpc: { method: "POST", path: "/api/dependency-resources/backups/{backupId}/restore" },
    },
  },
  {
    key: "dependency-resources.backup-policies.configure",
    kind: "command",
    domain: "dependency-resources",
    messageName: "ConfigureDependencyResourceBackupPolicyCommand",
    handlerName: "ConfigureDependencyResourceBackupPolicyCommandHandler",
    serviceName: "ConfigureDependencyResourceBackupPolicyUseCase",
    inputSchema: configureDependencyResourceBackupPolicyCommandInputSchema,
    serviceToken: tokens.configureDependencyResourceBackupPolicyUseCase,
    transports: {
      cli: "appaloft dependency backup policy configure <dependencyResourceId>",
      orpc: { method: "POST", path: "/api/dependency-resources/backup-policies" },
    },
  },
  {
    key: "dependency-resources.backup-policies.list",
    kind: "query",
    domain: "dependency-resources",
    messageName: "ListDependencyResourceBackupPoliciesQuery",
    handlerName: "ListDependencyResourceBackupPoliciesQueryHandler",
    serviceName: "ListDependencyResourceBackupPoliciesQueryService",
    inputSchema: listDependencyResourceBackupPoliciesQueryInputSchema,
    serviceToken: tokens.listDependencyResourceBackupPoliciesQueryService,
    transports: {
      cli: "appaloft dependency backup policy list",
      orpc: { method: "GET", path: "/api/dependency-resources/backup-policies" },
    },
  },
  {
    key: "dependency-resources.backup-policies.show",
    kind: "query",
    domain: "dependency-resources",
    messageName: "ShowDependencyResourceBackupPolicyQuery",
    handlerName: "ShowDependencyResourceBackupPolicyQueryHandler",
    serviceName: "ShowDependencyResourceBackupPolicyQueryService",
    inputSchema: showDependencyResourceBackupPolicyQueryInputSchema,
    serviceToken: tokens.showDependencyResourceBackupPolicyQueryService,
    transports: {
      cli: "appaloft dependency backup policy show <policyId>",
      orpc: { method: "GET", path: "/api/dependency-resources/backup-policies/{policyId}" },
    },
  },
  {
    key: "resources.bind-dependency",
    kind: "command",
    domain: "resources",
    messageName: "BindResourceDependencyCommand",
    handlerName: "BindResourceDependencyCommandHandler",
    serviceName: "BindResourceDependencyUseCase",
    inputSchema: bindResourceDependencyCommandInputSchema,
    serviceToken: tokens.bindResourceDependencyUseCase,
    transports: {
      cli: "appaloft resource dependency bind <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/dependency-bindings" },
    },
  },
  {
    key: "resources.unbind-dependency",
    kind: "command",
    domain: "resources",
    messageName: "UnbindResourceDependencyCommand",
    handlerName: "UnbindResourceDependencyCommandHandler",
    serviceName: "UnbindResourceDependencyUseCase",
    inputSchema: unbindResourceDependencyCommandInputSchema,
    serviceToken: tokens.unbindResourceDependencyUseCase,
    transports: {
      cli: "appaloft resource dependency unbind <resourceId> <bindingId>",
      orpc: {
        method: "DELETE",
        path: "/api/resources/{resourceId}/dependency-bindings/{bindingId}",
      },
    },
  },
  {
    key: "resources.rotate-dependency-binding-secret",
    kind: "command",
    domain: "resources",
    messageName: "RotateResourceDependencyBindingSecretCommand",
    handlerName: "RotateResourceDependencyBindingSecretCommandHandler",
    serviceName: "RotateResourceDependencyBindingSecretUseCase",
    inputSchema: rotateResourceDependencyBindingSecretCommandInputSchema,
    serviceToken: tokens.rotateResourceDependencyBindingSecretUseCase,
    transports: {
      cli: "appaloft resource dependency rotate-secret <resourceId> <bindingId>",
      orpc: {
        method: "POST",
        path: "/api/resources/{resourceId}/dependency-bindings/{bindingId}/secret-rotations",
      },
    },
  },
  {
    key: "resources.list-dependency-bindings",
    kind: "query",
    domain: "resources",
    messageName: "ListResourceDependencyBindingsQuery",
    handlerName: "ListResourceDependencyBindingsQueryHandler",
    serviceName: "ListResourceDependencyBindingsQueryService",
    inputSchema: listResourceDependencyBindingsQueryInputSchema,
    serviceToken: tokens.listResourceDependencyBindingsQueryService,
    transports: {
      cli: "appaloft resource dependency list <resourceId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/dependency-bindings" },
    },
  },
  {
    key: "resources.show-dependency-binding",
    kind: "query",
    domain: "resources",
    messageName: "ShowResourceDependencyBindingQuery",
    handlerName: "ShowResourceDependencyBindingQueryHandler",
    serviceName: "ShowResourceDependencyBindingQueryService",
    inputSchema: showResourceDependencyBindingQueryInputSchema,
    serviceToken: tokens.showResourceDependencyBindingQueryService,
    transports: {
      cli: "appaloft resource dependency show <resourceId> <bindingId>",
      orpc: { method: "GET", path: "/api/resources/{resourceId}/dependency-bindings/{bindingId}" },
    },
  },
  {
    key: "scheduled-tasks.create",
    kind: "command",
    domain: "scheduled-tasks",
    messageName: "CreateScheduledTaskCommand",
    handlerName: "CreateScheduledTaskCommandHandler",
    serviceName: "CreateScheduledTaskUseCase",
    inputSchema: createScheduledTaskCommandInputSchema,
    serviceToken: tokens.createScheduledTaskUseCase,
    transports: {
      cli: "appaloft scheduled-task create <resourceId>",
      orpc: { method: "POST", path: "/api/scheduled-tasks" },
    },
  },
  {
    key: "scheduled-tasks.list",
    kind: "query",
    domain: "scheduled-tasks",
    messageName: "ListScheduledTasksQuery",
    handlerName: "ListScheduledTasksQueryHandler",
    serviceName: "ListScheduledTasksQueryService",
    inputSchema: listScheduledTasksQueryInputSchema,
    serviceToken: tokens.listScheduledTasksQueryService,
    transports: {
      cli: "appaloft scheduled-task list",
      orpc: { method: "GET", path: "/api/scheduled-tasks" },
    },
  },
  {
    key: "scheduled-tasks.show",
    kind: "query",
    domain: "scheduled-tasks",
    messageName: "ShowScheduledTaskQuery",
    handlerName: "ShowScheduledTaskQueryHandler",
    serviceName: "ShowScheduledTaskQueryService",
    inputSchema: showScheduledTaskQueryInputSchema,
    serviceToken: tokens.showScheduledTaskQueryService,
    transports: {
      cli: "appaloft scheduled-task show <taskId>",
      orpc: { method: "GET", path: "/api/scheduled-tasks/{taskId}" },
    },
  },
  {
    key: "scheduled-tasks.configure",
    kind: "command",
    domain: "scheduled-tasks",
    messageName: "ConfigureScheduledTaskCommand",
    handlerName: "ConfigureScheduledTaskCommandHandler",
    serviceName: "ConfigureScheduledTaskUseCase",
    inputSchema: configureScheduledTaskCommandInputSchema,
    serviceToken: tokens.configureScheduledTaskUseCase,
    transports: {
      cli: "appaloft scheduled-task configure <taskId>",
      orpc: { method: "POST", path: "/api/scheduled-tasks/{taskId}" },
    },
  },
  {
    key: "scheduled-tasks.delete",
    kind: "command",
    domain: "scheduled-tasks",
    messageName: "DeleteScheduledTaskCommand",
    handlerName: "DeleteScheduledTaskCommandHandler",
    serviceName: "DeleteScheduledTaskUseCase",
    inputSchema: deleteScheduledTaskCommandInputSchema,
    serviceToken: tokens.deleteScheduledTaskUseCase,
    transports: {
      cli: "appaloft scheduled-task delete <taskId>",
      orpc: { method: "DELETE", path: "/api/scheduled-tasks/{taskId}" },
    },
  },
  {
    key: "scheduled-tasks.run-now",
    kind: "command",
    domain: "scheduled-tasks",
    messageName: "RunScheduledTaskNowCommand",
    handlerName: "RunScheduledTaskNowCommandHandler",
    serviceName: "RunScheduledTaskNowUseCase",
    inputSchema: runScheduledTaskNowCommandInputSchema,
    serviceToken: tokens.runScheduledTaskNowUseCase,
    transports: {
      cli: "appaloft scheduled-task run <taskId>",
      orpc: { method: "POST", path: "/api/scheduled-tasks/{taskId}/runs" },
    },
  },
  {
    key: "scheduled-task-runs.list",
    kind: "query",
    domain: "scheduled-task-runs",
    messageName: "ListScheduledTaskRunsQuery",
    handlerName: "ListScheduledTaskRunsQueryHandler",
    serviceName: "ListScheduledTaskRunsQueryService",
    inputSchema: listScheduledTaskRunsQueryInputSchema,
    serviceToken: tokens.listScheduledTaskRunsQueryService,
    transports: {
      cli: "appaloft scheduled-task runs list",
      orpc: { method: "GET", path: "/api/scheduled-task-runs" },
    },
  },
  {
    key: "scheduled-task-runs.show",
    kind: "query",
    domain: "scheduled-task-runs",
    messageName: "ShowScheduledTaskRunQuery",
    handlerName: "ShowScheduledTaskRunQueryHandler",
    serviceName: "ShowScheduledTaskRunQueryService",
    inputSchema: showScheduledTaskRunQueryInputSchema,
    serviceToken: tokens.showScheduledTaskRunQueryService,
    transports: {
      cli: "appaloft scheduled-task runs show <runId>",
      orpc: { method: "GET", path: "/api/scheduled-task-runs/{runId}" },
    },
  },
  {
    key: "scheduled-task-runs.logs",
    kind: "query",
    domain: "scheduled-task-runs",
    messageName: "ScheduledTaskRunLogsQuery",
    handlerName: "ScheduledTaskRunLogsQueryHandler",
    serviceName: "ScheduledTaskRunLogsQueryService",
    inputSchema: scheduledTaskRunLogsQueryInputSchema,
    serviceToken: tokens.scheduledTaskRunLogsQueryService,
    transports: {
      cli: "appaloft scheduled-task runs logs <runId>",
      orpc: { method: "GET", path: "/api/scheduled-task-runs/{runId}/logs" },
    },
  },
  {
    key: "storage-volumes.create",
    kind: "command",
    domain: "storage-volumes",
    messageName: "CreateStorageVolumeCommand",
    handlerName: "CreateStorageVolumeCommandHandler",
    serviceName: "CreateStorageVolumeUseCase",
    inputSchema: createStorageVolumeCommandInputSchema,
    serviceToken: tokens.createStorageVolumeUseCase,
    transports: {
      cli: "appaloft storage volume create",
      orpc: { method: "POST", path: "/api/storage-volumes" },
    },
  },
  {
    key: "storage-volumes.list",
    kind: "query",
    domain: "storage-volumes",
    messageName: "ListStorageVolumesQuery",
    handlerName: "ListStorageVolumesQueryHandler",
    serviceName: "ListStorageVolumesQueryService",
    inputSchema: listStorageVolumesQueryInputSchema,
    serviceToken: tokens.listStorageVolumesQueryService,
    transports: {
      cli: "appaloft storage volume list",
      orpc: { method: "GET", path: "/api/storage-volumes" },
    },
  },
  {
    key: "storage-volumes.show",
    kind: "query",
    domain: "storage-volumes",
    messageName: "ShowStorageVolumeQuery",
    handlerName: "ShowStorageVolumeQueryHandler",
    serviceName: "ShowStorageVolumeQueryService",
    inputSchema: showStorageVolumeQueryInputSchema,
    serviceToken: tokens.showStorageVolumeQueryService,
    transports: {
      cli: "appaloft storage volume show <storageVolumeId>",
      orpc: { method: "GET", path: "/api/storage-volumes/{storageVolumeId}" },
    },
  },
  {
    key: "storage-volumes.rename",
    kind: "command",
    domain: "storage-volumes",
    messageName: "RenameStorageVolumeCommand",
    handlerName: "RenameStorageVolumeCommandHandler",
    serviceName: "RenameStorageVolumeUseCase",
    inputSchema: renameStorageVolumeCommandInputSchema,
    serviceToken: tokens.renameStorageVolumeUseCase,
    transports: {
      cli: "appaloft storage volume rename <storageVolumeId>",
      orpc: { method: "POST", path: "/api/storage-volumes/{storageVolumeId}/rename" },
    },
  },
  {
    key: "storage-volumes.delete",
    kind: "command",
    domain: "storage-volumes",
    messageName: "DeleteStorageVolumeCommand",
    handlerName: "DeleteStorageVolumeCommandHandler",
    serviceName: "DeleteStorageVolumeUseCase",
    inputSchema: deleteStorageVolumeCommandInputSchema,
    serviceToken: tokens.deleteStorageVolumeUseCase,
    transports: {
      cli: "appaloft storage volume delete <storageVolumeId>",
      orpc: { method: "DELETE", path: "/api/storage-volumes/{storageVolumeId}" },
    },
  },
  {
    key: "storage-volumes.cleanup-runtime",
    kind: "command",
    domain: "storage-volumes",
    messageName: "CleanupStorageVolumeRuntimeCommand",
    handlerName: "CleanupStorageVolumeRuntimeCommandHandler",
    serviceName: "CleanupStorageVolumeRuntimeUseCase",
    inputSchema: cleanupStorageVolumeRuntimeCommandInputSchema,
    serviceToken: tokens.cleanupStorageVolumeRuntimeUseCase,
    transports: {
      cli: "appaloft storage volume cleanup-runtime <storageVolumeId> --server <serverId> --before <iso> [--dry-run false]",
      orpc: { method: "POST", path: "/api/storage-volumes/{storageVolumeId}/runtime-cleanup" },
    },
  },
  {
    key: "environments.create",
    kind: "command",
    domain: "environments",
    messageName: "CreateEnvironmentCommand",
    handlerName: "CreateEnvironmentCommandHandler",
    serviceName: "CreateEnvironmentUseCase",
    inputSchema: createEnvironmentCommandInputSchema,
    serviceToken: tokens.createEnvironmentUseCase,
    transports: {
      cli: "appaloft env create",
      orpc: { method: "POST", path: "/api/environments" },
    },
  },
  {
    key: "environments.list",
    kind: "query",
    domain: "environments",
    messageName: "ListEnvironmentsQuery",
    handlerName: "ListEnvironmentsQueryHandler",
    serviceName: "ListEnvironmentsQueryService",
    inputSchema: listEnvironmentsQueryInputSchema,
    serviceToken: tokens.listEnvironmentsQueryService,
    transports: {
      cli: "appaloft env list",
      orpc: { method: "GET", path: "/api/environments" },
    },
  },
  {
    key: "environments.show",
    kind: "query",
    domain: "environments",
    messageName: "ShowEnvironmentQuery",
    handlerName: "ShowEnvironmentQueryHandler",
    serviceName: "ShowEnvironmentQueryService",
    inputSchema: showEnvironmentQueryInputSchema,
    serviceToken: tokens.showEnvironmentQueryService,
    transports: {
      cli: "appaloft env show <environmentId>",
      orpc: { method: "GET", path: "/api/environments/{environmentId}" },
    },
  },
  {
    key: "environments.rename",
    kind: "command",
    domain: "environments",
    messageName: "RenameEnvironmentCommand",
    handlerName: "RenameEnvironmentCommandHandler",
    serviceName: "RenameEnvironmentUseCase",
    inputSchema: renameEnvironmentCommandInputSchema,
    serviceToken: tokens.renameEnvironmentUseCase,
    transports: {
      cli: "appaloft env rename <environmentId> --name <name>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/rename" },
    },
  },
  {
    key: "environments.lock",
    kind: "command",
    domain: "environments",
    messageName: "LockEnvironmentCommand",
    handlerName: "LockEnvironmentCommandHandler",
    serviceName: "LockEnvironmentUseCase",
    inputSchema: lockEnvironmentCommandInputSchema,
    serviceToken: tokens.lockEnvironmentUseCase,
    transports: {
      cli: "appaloft env lock <environmentId>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/lock" },
    },
  },
  {
    key: "environments.unlock",
    kind: "command",
    domain: "environments",
    messageName: "UnlockEnvironmentCommand",
    handlerName: "UnlockEnvironmentCommandHandler",
    serviceName: "UnlockEnvironmentUseCase",
    inputSchema: unlockEnvironmentCommandInputSchema,
    serviceToken: tokens.unlockEnvironmentUseCase,
    transports: {
      cli: "appaloft env unlock <environmentId>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/unlock" },
    },
  },
  {
    key: "environments.archive",
    kind: "command",
    domain: "environments",
    messageName: "ArchiveEnvironmentCommand",
    handlerName: "ArchiveEnvironmentCommandHandler",
    serviceName: "ArchiveEnvironmentUseCase",
    inputSchema: archiveEnvironmentCommandInputSchema,
    serviceToken: tokens.archiveEnvironmentUseCase,
    transports: {
      cli: "appaloft env archive <environmentId>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/archive" },
    },
  },
  {
    key: "environments.clone",
    kind: "command",
    domain: "environments",
    messageName: "CloneEnvironmentCommand",
    handlerName: "CloneEnvironmentCommandHandler",
    serviceName: "CloneEnvironmentUseCase",
    inputSchema: cloneEnvironmentCommandInputSchema,
    serviceToken: tokens.cloneEnvironmentUseCase,
    transports: {
      cli: "appaloft env clone <environmentId> --name <targetName>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/clone" },
    },
  },
  {
    key: "environments.set-variable",
    kind: "command",
    domain: "environments",
    messageName: "SetEnvironmentVariableCommand",
    handlerName: "SetEnvironmentVariableCommandHandler",
    serviceName: "SetEnvironmentVariableUseCase",
    inputSchema: setEnvironmentVariableCommandInputSchema,
    serviceToken: tokens.setEnvironmentVariableUseCase,
    transports: {
      cli: "appaloft env set <environmentId> <key> <value>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/variables" },
    },
  },
  {
    key: "environments.unset-variable",
    kind: "command",
    domain: "environments",
    messageName: "UnsetEnvironmentVariableCommand",
    handlerName: "UnsetEnvironmentVariableCommandHandler",
    serviceName: "UnsetEnvironmentVariableUseCase",
    inputSchema: unsetEnvironmentVariableCommandInputSchema,
    serviceToken: tokens.unsetEnvironmentVariableUseCase,
    transports: {
      cli: "appaloft env unset <environmentId> <key>",
      orpc: { method: "DELETE", path: "/api/environments/{environmentId}/variables/{key}" },
    },
  },
  {
    key: "environments.effective-precedence",
    kind: "query",
    domain: "environments",
    messageName: "EnvironmentEffectivePrecedenceQuery",
    handlerName: "EnvironmentEffectivePrecedenceQueryHandler",
    serviceName: "EnvironmentEffectivePrecedenceQueryService",
    inputSchema: environmentEffectivePrecedenceQueryInputSchema,
    serviceToken: tokens.environmentEffectivePrecedenceQueryService,
    transports: {
      cli: "appaloft env effective-precedence <environmentId>",
      orpc: { method: "GET", path: "/api/environments/{environmentId}/effective-precedence" },
    },
  },
  {
    key: "environments.diff",
    kind: "query",
    domain: "environments",
    messageName: "DiffEnvironmentsQuery",
    handlerName: "DiffEnvironmentsQueryHandler",
    serviceName: "DiffEnvironmentsQueryService",
    inputSchema: diffEnvironmentsQueryInputSchema,
    serviceToken: tokens.diffEnvironmentsQueryService,
    transports: {
      cli: "appaloft env diff <environmentId> <otherEnvironmentId>",
      orpc: {
        method: "GET",
        path: "/api/environments/{environmentId}/diff/{otherEnvironmentId}",
      },
    },
  },
  {
    key: "environments.promote",
    kind: "command",
    domain: "environments",
    messageName: "PromoteEnvironmentCommand",
    handlerName: "PromoteEnvironmentCommandHandler",
    serviceName: "PromoteEnvironmentUseCase",
    inputSchema: promoteEnvironmentCommandInputSchema,
    serviceToken: tokens.promoteEnvironmentUseCase,
    transports: {
      cli: "appaloft env promote <environmentId> <targetName>",
      orpc: { method: "POST", path: "/api/environments/{environmentId}/promote" },
    },
  },
  {
    key: "deployments.cleanup-preview",
    kind: "command",
    domain: "deployments",
    messageName: "CleanupPreviewCommand",
    handlerName: "CleanupPreviewCommandHandler",
    serviceName: "CleanupPreviewUseCase",
    inputSchema: cleanupPreviewCommandInputSchema,
    serviceToken: tokens.cleanupPreviewUseCase,
    transports: {
      cli: "appaloft preview cleanup [path-or-source] --preview pull-request --preview-id pr-123",
      orpc: { method: "POST", path: "/api/deployments/cleanup-preview" },
    },
  },
  {
    key: "deployments.create",
    kind: "command",
    domain: "deployments",
    messageName: "CreateDeploymentCommand",
    handlerName: "CreateDeploymentCommandHandler",
    serviceName: "CreateDeploymentUseCase",
    inputSchema: createDeploymentCommandInputSchema,
    serviceToken: tokens.createDeploymentUseCase,
    transports: {
      cli: "appaloft deploy [path-or-source] [--config appaloft.yml] [--env KEY=VALUE] [--secret KEY=ci-env:NAME] [--preview pull-request]",
      orpc: { method: "POST", path: "/api/deployments" },
      orpcStream: { method: "POST", path: "/api/deployments/stream" },
    },
  },
  {
    key: "deployments.retry",
    kind: "command",
    domain: "deployments",
    messageName: "RetryDeploymentCommand",
    handlerName: "RetryDeploymentCommandHandler",
    serviceName: "RetryDeploymentUseCase",
    inputSchema: retryDeploymentCommandInputSchema,
    serviceToken: tokens.retryDeploymentUseCase,
    transports: {
      cli: "appaloft deployments retry <deploymentId>",
      orpc: { method: "POST", path: "/api/deployments/{deploymentId}/retry" },
    },
  },
  {
    key: "deployments.redeploy",
    kind: "command",
    domain: "deployments",
    messageName: "RedeployDeploymentCommand",
    handlerName: "RedeployDeploymentCommandHandler",
    serviceName: "RedeployDeploymentUseCase",
    inputSchema: redeployDeploymentCommandInputSchema,
    serviceToken: tokens.redeployDeploymentUseCase,
    transports: {
      cli: "appaloft deployments redeploy <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/redeploy" },
    },
  },
  {
    key: "deployments.rollback",
    kind: "command",
    domain: "deployments",
    messageName: "RollbackDeploymentCommand",
    handlerName: "RollbackDeploymentCommandHandler",
    serviceName: "RollbackDeploymentUseCase",
    inputSchema: rollbackDeploymentCommandInputSchema,
    serviceToken: tokens.rollbackDeploymentUseCase,
    transports: {
      cli: "appaloft deployments rollback <deploymentId> --candidate <rollbackCandidateDeploymentId>",
      orpc: { method: "POST", path: "/api/deployments/{deploymentId}/rollback" },
    },
  },
  {
    key: "deployments.cancel",
    kind: "command",
    domain: "deployments",
    messageName: "CancelDeploymentCommand",
    handlerName: "CancelDeploymentCommandHandler",
    serviceName: "CancelDeploymentUseCase",
    inputSchema: cancelDeploymentCommandInputSchema,
    serviceToken: tokens.cancelDeploymentUseCase,
    transports: {
      cli: "appaloft deployments cancel <deploymentId> --confirm <deploymentId>",
      orpc: { method: "POST", path: "/api/deployments/{deploymentId}/cancel" },
    },
  },
  {
    key: "deployments.archive",
    kind: "command",
    domain: "deployments",
    messageName: "ArchiveDeploymentCommand",
    handlerName: "ArchiveDeploymentCommandHandler",
    serviceName: "ArchiveDeploymentUseCase",
    inputSchema: archiveDeploymentCommandInputSchema,
    serviceToken: tokens.archiveDeploymentUseCase,
    transports: {
      cli: "appaloft deployments archive <deploymentId> --confirm <deploymentId>",
      orpc: { method: "POST", path: "/api/deployments/{deploymentId}/archive" },
    },
  },
  {
    key: "deployments.prune",
    kind: "command",
    domain: "deployments",
    messageName: "PruneDeploymentsCommand",
    handlerName: "PruneDeploymentsCommandHandler",
    serviceName: "PruneDeploymentsUseCase",
    inputSchema: pruneDeploymentsCommandInputSchema,
    serviceToken: tokens.pruneDeploymentsUseCase,
    transports: {
      cli: "appaloft deployments prune --before <iso>",
      orpc: { method: "POST", path: "/api/deployments/prune" },
    },
  },
  {
    key: "resources.runtime.stop",
    kind: "command",
    domain: "resources",
    messageName: "StopResourceRuntimeCommand",
    handlerName: "StopResourceRuntimeCommandHandler",
    serviceName: "ResourceRuntimeControlUseCase",
    inputSchema: stopResourceRuntimeCommandInputSchema,
    serviceToken: tokens.resourceRuntimeControlUseCase,
    transports: {
      cli: "appaloft resource runtime stop <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/runtime/stop" },
    },
  },
  {
    key: "resources.runtime.start",
    kind: "command",
    domain: "resources",
    messageName: "StartResourceRuntimeCommand",
    handlerName: "StartResourceRuntimeCommandHandler",
    serviceName: "ResourceRuntimeControlUseCase",
    inputSchema: startResourceRuntimeCommandInputSchema,
    serviceToken: tokens.resourceRuntimeControlUseCase,
    transports: {
      cli: "appaloft resource runtime start <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/runtime/start" },
    },
  },
  {
    key: "resources.runtime.restart",
    kind: "command",
    domain: "resources",
    messageName: "RestartResourceRuntimeCommand",
    handlerName: "RestartResourceRuntimeCommandHandler",
    serviceName: "ResourceRuntimeControlUseCase",
    inputSchema: restartResourceRuntimeCommandInputSchema,
    serviceToken: tokens.resourceRuntimeControlUseCase,
    transports: {
      cli: "appaloft resource runtime restart <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/runtime/restart" },
    },
  },
  {
    key: "deployments.list",
    kind: "query",
    domain: "deployments",
    messageName: "ListDeploymentsQuery",
    handlerName: "ListDeploymentsQueryHandler",
    serviceName: "ListDeploymentsQueryService",
    inputSchema: listDeploymentsQueryInputSchema,
    serviceToken: tokens.listDeploymentsQueryService,
    transports: {
      cli: "appaloft deployments list",
      orpc: { method: "GET", path: "/api/deployments" },
    },
  },
  {
    key: "deployments.show",
    kind: "query",
    domain: "deployments",
    messageName: "ShowDeploymentQuery",
    handlerName: "ShowDeploymentQueryHandler",
    serviceName: "ShowDeploymentQueryService",
    inputSchema: showDeploymentQueryInputSchema,
    serviceToken: tokens.showDeploymentQueryService,
    transports: {
      cli: "appaloft deployments show <deploymentId>",
      orpc: { method: "GET", path: "/api/deployments/{deploymentId}" },
    },
  },
  {
    key: "deployments.plan",
    kind: "query",
    domain: "deployments",
    messageName: "DeploymentPlanQuery",
    handlerName: "DeploymentPlanQueryHandler",
    serviceName: "DeploymentPlanQueryService",
    inputSchema: deploymentPlanQueryInputSchema,
    serviceToken: tokens.deploymentPlanQueryService,
    transports: {
      cli: "appaloft deployments plan --project <projectId> --environment <environmentId> --resource <resourceId> --server <serverId> [--destination <destinationId>]",
      orpc: { method: "GET", path: "/api/deployments/plan" },
    },
  },
  {
    key: "deployments.recovery-readiness",
    kind: "query",
    domain: "deployments",
    messageName: "DeploymentRecoveryReadinessQuery",
    handlerName: "DeploymentRecoveryReadinessQueryHandler",
    serviceName: "DeploymentRecoveryReadinessQueryService",
    inputSchema: deploymentRecoveryReadinessQueryInputSchema,
    serviceToken: tokens.deploymentRecoveryReadinessQueryService,
    transports: {
      cli: "appaloft deployments recovery-readiness <deploymentId>",
      orpc: { method: "GET", path: "/api/deployments/{deploymentId}/recovery-readiness" },
    },
  },
  {
    key: "deployments.logs",
    kind: "query",
    domain: "deployments",
    messageName: "DeploymentLogsQuery",
    handlerName: "DeploymentLogsQueryHandler",
    serviceName: "DeploymentLogsQueryService",
    inputSchema: deploymentLogsQueryInputSchema,
    serviceToken: tokens.logsQueryService,
    transports: {
      cli: "appaloft logs <deploymentId>",
      orpc: { method: "GET", path: "/api/deployments/{deploymentId}/logs" },
    },
  },
  {
    key: "deployments.logs.prune",
    kind: "command",
    domain: "deployments",
    messageName: "PruneDeploymentLogsCommand",
    handlerName: "PruneDeploymentLogsCommandHandler",
    serviceName: "PruneDeploymentLogsUseCase",
    inputSchema: pruneDeploymentLogsCommandInputSchema,
    serviceToken: tokens.pruneDeploymentLogsUseCase,
    transports: {
      cli: "appaloft deployments logs prune --before <iso>",
      orpc: { method: "POST", path: "/api/deployments/logs/prune" },
    },
  },
  {
    key: "deployments.stream-events",
    kind: "query",
    domain: "deployments",
    messageName: "StreamDeploymentEventsQuery",
    handlerName: "StreamDeploymentEventsQueryHandler",
    serviceName: "StreamDeploymentEventsQueryService",
    inputSchema: streamDeploymentEventsQueryInputSchema,
    serviceToken: tokens.streamDeploymentEventsQueryService,
    transports: {
      cli: "appaloft deployments events <deploymentId>",
      orpc: { method: "GET", path: "/api/deployments/{deploymentId}/events" },
      orpcStream: { method: "GET", path: "/api/deployments/{deploymentId}/events/stream" },
    },
  },
  {
    key: "operator-work.list",
    kind: "query",
    domain: "operator-work",
    messageName: "ListOperatorWorkQuery",
    handlerName: "ListOperatorWorkQueryHandler",
    serviceName: "OperatorWorkQueryService",
    inputSchema: listOperatorWorkQueryInputSchema,
    serviceToken: tokens.operatorWorkQueryService,
    transports: {
      cli: "appaloft work list",
      orpc: { method: "GET", path: "/api/operator-work" },
    },
  },
  {
    key: "operator-work.show",
    kind: "query",
    domain: "operator-work",
    messageName: "ShowOperatorWorkQuery",
    handlerName: "ShowOperatorWorkQueryHandler",
    serviceName: "OperatorWorkQueryService",
    inputSchema: showOperatorWorkQueryInputSchema,
    serviceToken: tokens.operatorWorkQueryService,
    transports: {
      cli: "appaloft work show <workId>",
      orpc: { method: "GET", path: "/api/operator-work/{workId}" },
    },
  },
  {
    key: "operator-work.mark-recovered",
    kind: "command",
    domain: "operator-work",
    messageName: "MarkOperatorWorkRecoveredCommand",
    handlerName: "MarkOperatorWorkRecoveredCommandHandler",
    serviceName: "MarkOperatorWorkRecoveredUseCase",
    inputSchema: markOperatorWorkRecoveredCommandInputSchema,
    serviceToken: tokens.markOperatorWorkRecoveredUseCase,
    transports: {
      cli: "appaloft work mark-recovered <workId>",
      orpc: { method: "POST", path: "/api/operator-work/{workId}/mark-recovered" },
    },
  },
  {
    key: "operator-work.dead-letter",
    kind: "command",
    domain: "operator-work",
    messageName: "DeadLetterOperatorWorkCommand",
    handlerName: "DeadLetterOperatorWorkCommandHandler",
    serviceName: "DeadLetterOperatorWorkUseCase",
    inputSchema: deadLetterOperatorWorkCommandInputSchema,
    serviceToken: tokens.deadLetterOperatorWorkUseCase,
    transports: {
      cli: "appaloft work dead-letter <workId>",
      orpc: { method: "POST", path: "/api/operator-work/{workId}/dead-letter" },
    },
  },
  {
    key: "operator-work.cancel",
    kind: "command",
    domain: "operator-work",
    messageName: "CancelOperatorWorkCommand",
    handlerName: "CancelOperatorWorkCommandHandler",
    serviceName: "CancelOperatorWorkUseCase",
    inputSchema: cancelOperatorWorkCommandInputSchema,
    serviceToken: tokens.cancelOperatorWorkUseCase,
    transports: {
      cli: "appaloft work cancel <workId>",
      orpc: { method: "POST", path: "/api/operator-work/{workId}/cancel" },
    },
  },
  {
    key: "operator-work.retry",
    kind: "command",
    domain: "operator-work",
    messageName: "RetryOperatorWorkCommand",
    handlerName: "RetryOperatorWorkCommandHandler",
    serviceName: "RetryOperatorWorkUseCase",
    inputSchema: retryOperatorWorkCommandInputSchema,
    serviceToken: tokens.retryOperatorWorkUseCase,
    transports: {
      cli: "appaloft work retry <workId>",
      orpc: { method: "POST", path: "/api/operator-work/{workId}/retry" },
    },
  },
  {
    key: "operator-work.prune",
    kind: "command",
    domain: "operator-work",
    messageName: "PruneOperatorWorkCommand",
    handlerName: "PruneOperatorWorkCommandHandler",
    serviceName: "PruneOperatorWorkUseCase",
    inputSchema: pruneOperatorWorkCommandInputSchema,
    serviceToken: tokens.pruneOperatorWorkUseCase,
    transports: {
      cli: "appaloft work prune --before <iso>",
      orpc: { method: "POST", path: "/api/operator-work/prune" },
    },
  },
  {
    key: "source-links.list",
    kind: "query",
    domain: "source-links",
    messageName: "ListSourceLinksQuery",
    handlerName: "ListSourceLinksQueryHandler",
    serviceName: "SourceLinkQueryService",
    inputSchema: listSourceLinksQueryInputSchema,
    serviceToken: tokens.sourceLinkQueryService,
    transports: {
      cli: "appaloft source-links list",
      orpc: { method: "GET", path: "/api/source-links" },
    },
  },
  {
    key: "source-links.show",
    kind: "query",
    domain: "source-links",
    messageName: "ShowSourceLinkQuery",
    handlerName: "ShowSourceLinkQueryHandler",
    serviceName: "SourceLinkQueryService",
    inputSchema: showSourceLinkQueryInputSchema,
    serviceToken: tokens.sourceLinkQueryService,
    transports: {
      cli: "appaloft source-links show <sourceFingerprint>",
      orpc: { method: "GET", path: "/api/source-links/{sourceFingerprint}" },
    },
  },
  {
    key: "source-links.relink",
    kind: "command",
    domain: "source-links",
    messageName: "RelinkSourceLinkCommand",
    handlerName: "RelinkSourceLinkCommandHandler",
    serviceName: "RelinkSourceLinkUseCase",
    inputSchema: relinkSourceLinkCommandInputSchema,
    serviceToken: tokens.relinkSourceLinkUseCase,
    transports: {
      cli: "appaloft source-links relink",
      orpc: { method: "POST", path: "/api/source-links/relink" },
    },
  },
  {
    key: "source-links.delete",
    kind: "command",
    domain: "source-links",
    messageName: "DeleteSourceLinkCommand",
    handlerName: "DeleteSourceLinkCommandHandler",
    serviceName: "DeleteSourceLinkUseCase",
    inputSchema: deleteSourceLinkCommandInputSchema,
    serviceToken: tokens.deleteSourceLinkUseCase,
    transports: {
      cli: "appaloft source-links delete <sourceFingerprint>",
      orpc: { method: "DELETE", path: "/api/source-links/{sourceFingerprint}" },
    },
  },
  {
    key: "static-artifacts.publish",
    kind: "command",
    domain: "static-artifacts",
    messageName: "PublishStaticArtifactCommand",
    handlerName: "PublishStaticArtifactCommandHandler",
    serviceName: "StaticArtifactPublisherPort",
    inputSchema: publishStaticArtifactCommandInputSchema,
    serviceToken: tokens.staticArtifactPublisherPort,
    transports: {
      orpc: { method: "POST", path: "/api/static-artifacts/publish" },
    },
  },
  {
    key: "static-artifacts.publish-payload",
    kind: "command",
    domain: "static-artifacts",
    messageName: "PublishStaticArtifactPayloadCommand",
    handlerName: "PublishStaticArtifactPayloadCommandHandler",
    serviceName: "StaticArtifactPublisherPort",
    inputSchema: publishStaticArtifactPayloadCommandInputSchema,
    serviceToken: tokens.staticArtifactPublisherPort,
    transports: {
      cli: "appaloft static-artifacts publish <dist-directory>",
      orpc: { method: "POST", path: "/api/static-artifacts/publish-payload" },
    },
  },
  {
    key: "static-artifacts.publish-archive",
    kind: "command",
    domain: "static-artifacts",
    messageName: "PublishStaticArtifactArchiveCommand",
    handlerName: "PublishStaticArtifactArchiveCommandHandler",
    serviceName: "StaticArtifactPublisherPort",
    inputSchema: publishStaticArtifactArchiveCommandInputSchema,
    serviceToken: tokens.staticArtifactPublisherPort,
    transports: {
      cli: "appaloft static-artifacts publish <dist.zip>",
      orpc: { method: "POST", path: "/api/static-artifacts/publish-archive" },
    },
  },
  {
    key: "static-artifacts.publications.list",
    kind: "query",
    domain: "static-artifacts",
    messageName: "ListStaticArtifactPublicationsQuery",
    handlerName: "ListStaticArtifactPublicationsQueryHandler",
    serviceName: "StaticArtifactPublicationReadModelPort",
    inputSchema: listStaticArtifactPublicationsQueryInputSchema,
    serviceToken: tokens.staticArtifactPublicationReadModelPort,
    transports: {
      orpc: { method: "GET", path: "/api/static-artifacts/publications" },
    },
  },
  {
    key: "audit-events.list",
    kind: "query",
    domain: "audit-events",
    messageName: "ListAuditEventsQuery",
    handlerName: "ListAuditEventsQueryHandler",
    serviceName: "ListAuditEventsQueryService",
    inputSchema: listAuditEventsQueryInputSchema,
    serviceToken: tokens.listAuditEventsQueryService,
    transports: {
      cli: "appaloft audit-event list --aggregate <aggregateId>",
      orpc: { method: "GET", path: "/api/audit-events" },
    },
  },
  {
    key: "audit-events.show",
    kind: "query",
    domain: "audit-events",
    messageName: "ShowAuditEventQuery",
    handlerName: "ShowAuditEventQueryHandler",
    serviceName: "ShowAuditEventQueryService",
    inputSchema: showAuditEventQueryInputSchema,
    serviceToken: tokens.showAuditEventQueryService,
    transports: {
      cli: "appaloft audit-event show <auditEventId> --aggregate <aggregateId>",
      orpc: { method: "GET", path: "/api/audit-events/{auditEventId}" },
    },
  },
  {
    key: "audit-events.prune",
    kind: "command",
    domain: "audit-events",
    messageName: "PruneAuditEventsCommand",
    handlerName: "PruneAuditEventsCommandHandler",
    serviceName: "PruneAuditEventsUseCase",
    inputSchema: pruneAuditEventsCommandInputSchema,
    serviceToken: tokens.pruneAuditEventsUseCase,
    transports: {
      cli: "appaloft audit-event prune --before <iso>",
      orpc: { method: "POST", path: "/api/audit-events/prune" },
    },
  },
  {
    key: "audit-events.export",
    kind: "query",
    domain: "audit-events",
    messageName: "ExportAuditEventsQuery",
    handlerName: "ExportAuditEventsQueryHandler",
    serviceName: "ExportAuditEventsQueryService",
    inputSchema: exportAuditEventsQueryInputSchema,
    serviceToken: tokens.exportAuditEventsQueryService,
    transports: {
      cli: "appaloft audit-event export --aggregate <aggregateId>",
      orpc: { method: "GET", path: "/api/audit-events/export" },
    },
  },
  {
    key: "audit-events.export-global",
    kind: "query",
    domain: "audit-events",
    messageName: "ExportGlobalAuditEventsQuery",
    handlerName: "ExportGlobalAuditEventsQueryHandler",
    serviceName: "ExportGlobalAuditEventsQueryService",
    inputSchema: exportGlobalAuditEventsQueryInputSchema,
    serviceToken: tokens.exportGlobalAuditEventsQueryService,
    transports: {
      cli: "appaloft audit-event export-global --from <iso> --to <iso>",
      orpc: { method: "GET", path: "/api/audit-events/export-global" },
    },
  },
  {
    key: "audit-events.archives.create",
    kind: "command",
    domain: "audit-events",
    messageName: "CreateAuditEventArchiveCommand",
    handlerName: "CreateAuditEventArchiveCommandHandler",
    serviceName: "CreateAuditEventArchiveUseCase",
    inputSchema: createAuditEventArchiveCommandInputSchema,
    serviceToken: tokens.createAuditEventArchiveUseCase,
    transports: {
      cli: "appaloft audit-event archive create",
      orpc: { method: "POST", path: "/api/audit-events/archives" },
    },
  },
  {
    key: "audit-events.archives.list",
    kind: "query",
    domain: "audit-events",
    messageName: "ListAuditEventArchivesQuery",
    handlerName: "ListAuditEventArchivesQueryHandler",
    serviceName: "ListAuditEventArchivesQueryService",
    inputSchema: listAuditEventArchivesQueryInputSchema,
    serviceToken: tokens.listAuditEventArchivesQueryService,
    transports: {
      cli: "appaloft audit-event archive list",
      orpc: { method: "GET", path: "/api/audit-events/archives" },
    },
  },
  {
    key: "audit-events.archives.show",
    kind: "query",
    domain: "audit-events",
    messageName: "ShowAuditEventArchiveQuery",
    handlerName: "ShowAuditEventArchiveQueryHandler",
    serviceName: "ShowAuditEventArchiveQueryService",
    inputSchema: showAuditEventArchiveQueryInputSchema,
    serviceToken: tokens.showAuditEventArchiveQueryService,
    transports: {
      cli: "appaloft audit-event archive show <archiveId>",
      orpc: { method: "GET", path: "/api/audit-events/archives/{archiveId}" },
    },
  },
  {
    key: "audit-events.archives.prune",
    kind: "command",
    domain: "audit-events",
    messageName: "PruneAuditEventArchivesCommand",
    handlerName: "PruneAuditEventArchivesCommandHandler",
    serviceName: "PruneAuditEventArchivesUseCase",
    inputSchema: pruneAuditEventArchivesCommandInputSchema,
    serviceToken: tokens.pruneAuditEventArchivesUseCase,
    transports: {
      cli: "appaloft audit-event archive prune --before <iso>",
      orpc: { method: "POST", path: "/api/audit-events/archives/prune" },
    },
  },
  {
    key: "audit-events.legal-holds.configure",
    kind: "command",
    domain: "audit-events",
    messageName: "ConfigureAuditEventLegalHoldCommand",
    handlerName: "ConfigureAuditEventLegalHoldCommandHandler",
    serviceName: "ConfigureAuditEventLegalHoldUseCase",
    inputSchema: configureAuditEventLegalHoldCommandInputSchema,
    serviceToken: tokens.configureAuditEventLegalHoldUseCase,
    transports: {
      cli: "appaloft audit-event legal-hold configure",
      orpc: { method: "POST", path: "/api/audit-events/legal-holds" },
    },
  },
  {
    key: "audit-events.legal-holds.list",
    kind: "query",
    domain: "audit-events",
    messageName: "ListAuditEventLegalHoldsQuery",
    handlerName: "ListAuditEventLegalHoldsQueryHandler",
    serviceName: "ListAuditEventLegalHoldsQueryService",
    inputSchema: listAuditEventLegalHoldsQueryInputSchema,
    serviceToken: tokens.listAuditEventLegalHoldsQueryService,
    transports: {
      cli: "appaloft audit-event legal-hold list",
      orpc: { method: "GET", path: "/api/audit-events/legal-holds" },
    },
  },
  {
    key: "audit-events.legal-holds.show",
    kind: "query",
    domain: "audit-events",
    messageName: "ShowAuditEventLegalHoldQuery",
    handlerName: "ShowAuditEventLegalHoldQueryHandler",
    serviceName: "ShowAuditEventLegalHoldQueryService",
    inputSchema: showAuditEventLegalHoldQueryInputSchema,
    serviceToken: tokens.showAuditEventLegalHoldQueryService,
    transports: {
      cli: "appaloft audit-event legal-hold show <holdId>",
      orpc: { method: "GET", path: "/api/audit-events/legal-holds/{holdId}" },
    },
  },
  {
    key: "audit-events.legal-holds.release",
    kind: "command",
    domain: "audit-events",
    messageName: "ReleaseAuditEventLegalHoldCommand",
    handlerName: "ReleaseAuditEventLegalHoldCommandHandler",
    serviceName: "ReleaseAuditEventLegalHoldUseCase",
    inputSchema: releaseAuditEventLegalHoldCommandInputSchema,
    serviceToken: tokens.releaseAuditEventLegalHoldUseCase,
    transports: {
      cli: "appaloft audit-event legal-hold release <holdId>",
      orpc: { method: "POST", path: "/api/audit-events/legal-holds/{holdId}/release" },
    },
  },
  {
    key: "retention-defaults.configure",
    kind: "command",
    domain: "retention-defaults",
    messageName: "ConfigureRetentionDefaultsCommand",
    handlerName: "ConfigureRetentionDefaultsCommandHandler",
    serviceName: "ConfigureRetentionDefaultsUseCase",
    inputSchema: configureRetentionDefaultsCommandInputSchema,
    serviceToken: tokens.configureRetentionDefaultsUseCase,
    transports: {
      cli: "appaloft retention-default configure --category <category> --retention-days <days>",
      orpc: { method: "POST", path: "/api/retention-defaults" },
    },
  },
  {
    key: "retention-defaults.list",
    kind: "query",
    domain: "retention-defaults",
    messageName: "ListRetentionDefaultsQuery",
    handlerName: "ListRetentionDefaultsQueryHandler",
    serviceName: "ListRetentionDefaultsQueryService",
    inputSchema: listRetentionDefaultsQueryInputSchema,
    serviceToken: tokens.listRetentionDefaultsQueryService,
    transports: {
      cli: "appaloft retention-default list",
      orpc: { method: "GET", path: "/api/retention-defaults" },
    },
  },
  {
    key: "retention-defaults.show",
    kind: "query",
    domain: "retention-defaults",
    messageName: "ShowRetentionDefaultQuery",
    handlerName: "ShowRetentionDefaultQueryHandler",
    serviceName: "ShowRetentionDefaultQueryService",
    inputSchema: showRetentionDefaultQueryInputSchema,
    serviceToken: tokens.showRetentionDefaultQueryService,
    transports: {
      cli: "appaloft retention-default show <category>",
      orpc: { method: "GET", path: "/api/retention-defaults/{category}" },
    },
  },
  {
    key: "domain-events.prune",
    kind: "command",
    domain: "domain-events",
    messageName: "PruneDomainEventsCommand",
    handlerName: "PruneDomainEventsCommandHandler",
    serviceName: "PruneDomainEventsUseCase",
    inputSchema: pruneDomainEventsCommandInputSchema,
    serviceToken: tokens.pruneDomainEventsUseCase,
    transports: {
      cli: "appaloft domain-event prune --before <iso>",
      orpc: { method: "POST", path: "/api/domain-events/prune" },
    },
  },
  {
    key: "provider-job-logs.prune",
    kind: "command",
    domain: "provider-job-logs",
    messageName: "PruneProviderJobLogsCommand",
    handlerName: "PruneProviderJobLogsCommandHandler",
    serviceName: "PruneProviderJobLogsUseCase",
    inputSchema: pruneProviderJobLogsCommandInputSchema,
    serviceToken: tokens.pruneProviderJobLogsUseCase,
    transports: {
      cli: "appaloft provider-job-log prune --before <iso>",
      orpc: { method: "POST", path: "/api/provider-job-logs/prune" },
    },
  },
  {
    key: "source-events.ingest",
    kind: "command",
    domain: "source-events",
    messageName: "IngestSourceEventCommand",
    handlerName: "IngestSourceEventCommandHandler",
    serviceName: "IngestSourceEventUseCase",
    inputSchema: ingestSourceEventCommandInputSchema,
    serviceToken: tokens.ingestSourceEventUseCase,
    transports: {
      orpc: {
        method: "POST",
        path: "/api/resources/{resourceId}/source-events/generic-signed",
      },
      orpcAdditional: [
        {
          method: "POST",
          path: "/api/integrations/github/source-events",
        },
      ],
    },
  },
  {
    key: "source-events.list",
    kind: "query",
    domain: "source-events",
    messageName: "ListSourceEventsQuery",
    handlerName: "ListSourceEventsQueryHandler",
    serviceName: "ListSourceEventsQueryService",
    inputSchema: listSourceEventsQueryInputSchema,
    serviceToken: tokens.listSourceEventsQueryService,
    transports: {
      cli: "appaloft source-event list --resource <resourceId> | --project <projectId>",
      orpc: { method: "GET", path: "/api/source-events" },
    },
  },
  {
    key: "source-events.show",
    kind: "query",
    domain: "source-events",
    messageName: "ShowSourceEventQuery",
    handlerName: "ShowSourceEventQueryHandler",
    serviceName: "ShowSourceEventQueryService",
    inputSchema: showSourceEventQueryInputSchema,
    serviceToken: tokens.showSourceEventQueryService,
    transports: {
      cli: "appaloft source-event show <sourceEventId> --resource <resourceId> | --project <projectId>",
      orpc: { method: "GET", path: "/api/source-events/{sourceEventId}" },
    },
  },
  {
    key: "source-events.replay",
    kind: "command",
    domain: "source-events",
    messageName: "ReplaySourceEventCommand",
    handlerName: "ReplaySourceEventCommandHandler",
    serviceName: "ReplaySourceEventUseCase",
    inputSchema: replaySourceEventCommandInputSchema,
    serviceToken: tokens.replaySourceEventUseCase,
    transports: {
      cli: "appaloft source-event replay <sourceEventId> --resource <resourceId> | --project <projectId>",
      orpc: { method: "POST", path: "/api/source-events/{sourceEventId}/replay" },
    },
  },
  {
    key: "source-events.prune",
    kind: "command",
    domain: "source-events",
    messageName: "PruneSourceEventsCommand",
    handlerName: "PruneSourceEventsCommandHandler",
    serviceName: "PruneSourceEventsUseCase",
    inputSchema: pruneSourceEventsCommandInputSchema,
    serviceToken: tokens.pruneSourceEventsUseCase,
    transports: {
      cli: "appaloft source-event prune --before <iso>",
      orpc: { method: "POST", path: "/api/source-events/prune" },
    },
  },
  {
    key: "default-access-domain-policies.configure",
    kind: "command",
    domain: "default-access-domain-policies",
    messageName: "ConfigureDefaultAccessDomainPolicyCommand",
    handlerName: "ConfigureDefaultAccessDomainPolicyCommandHandler",
    serviceName: "ConfigureDefaultAccessDomainPolicyUseCase",
    inputSchema: configureDefaultAccessDomainPolicyCommandInputSchema,
    serviceToken: tokens.configureDefaultAccessDomainPolicyUseCase,
    transports: {
      cli: "appaloft default-access configure",
      orpc: { method: "POST", path: "/api/default-access-domain-policies" },
    },
  },
  {
    key: "default-access-domain-policies.list",
    kind: "query",
    domain: "default-access-domain-policies",
    messageName: "ListDefaultAccessDomainPoliciesQuery",
    handlerName: "ListDefaultAccessDomainPoliciesQueryHandler",
    serviceName: "ListDefaultAccessDomainPoliciesQueryService",
    inputSchema: listDefaultAccessDomainPoliciesQueryInputSchema,
    serviceToken: tokens.listDefaultAccessDomainPoliciesQueryService,
    transports: {
      cli: "appaloft default-access list",
      orpc: { method: "GET", path: "/api/default-access-domain-policies" },
    },
  },
  {
    key: "default-access-domain-policies.show",
    kind: "query",
    domain: "default-access-domain-policies",
    messageName: "ShowDefaultAccessDomainPolicyQuery",
    handlerName: "ShowDefaultAccessDomainPolicyQueryHandler",
    serviceName: "ShowDefaultAccessDomainPolicyQueryService",
    inputSchema: showDefaultAccessDomainPolicyQueryInputSchema,
    serviceToken: tokens.showDefaultAccessDomainPolicyQueryService,
    transports: {
      cli: "appaloft default-access show --scope system|deployment-target [--server <serverId>]",
      orpc: { method: "GET", path: "/api/default-access-domain-policies/show" },
    },
  },
  {
    key: "domain-bindings.create",
    kind: "command",
    domain: "domain-bindings",
    messageName: "CreateDomainBindingCommand",
    handlerName: "CreateDomainBindingCommandHandler",
    serviceName: "CreateDomainBindingUseCase",
    inputSchema: createDomainBindingCommandInputSchema,
    serviceToken: tokens.createDomainBindingUseCase,
    transports: {
      cli: "appaloft domain-binding create",
      orpc: { method: "POST", path: "/api/domain-bindings" },
    },
  },
  {
    key: "domain-bindings.confirm-ownership",
    kind: "command",
    domain: "domain-bindings",
    messageName: "ConfirmDomainBindingOwnershipCommand",
    handlerName: "ConfirmDomainBindingOwnershipCommandHandler",
    serviceName: "ConfirmDomainBindingOwnershipUseCase",
    inputSchema: confirmDomainBindingOwnershipCommandInputSchema,
    serviceToken: tokens.confirmDomainBindingOwnershipUseCase,
    transports: {
      cli: "appaloft domain-binding confirm-ownership <domainBindingId> [--verification-mode dns|manual]",
      orpc: {
        method: "POST",
        path: "/api/domain-bindings/{domainBindingId}/ownership-confirmations",
      },
    },
  },
  {
    key: "domain-bindings.list",
    kind: "query",
    domain: "domain-bindings",
    messageName: "ListDomainBindingsQuery",
    handlerName: "ListDomainBindingsQueryHandler",
    serviceName: "ListDomainBindingsQueryService",
    inputSchema: listDomainBindingsQueryInputSchema,
    serviceToken: tokens.listDomainBindingsQueryService,
    transports: {
      cli: "appaloft domain-binding list",
      orpc: { method: "GET", path: "/api/domain-bindings" },
    },
  },
  {
    key: "domain-bindings.show",
    kind: "query",
    domain: "domain-bindings",
    messageName: "ShowDomainBindingQuery",
    handlerName: "ShowDomainBindingQueryHandler",
    serviceName: "ShowDomainBindingQueryService",
    inputSchema: showDomainBindingQueryInputSchema,
    serviceToken: tokens.showDomainBindingQueryService,
    transports: {
      cli: "appaloft domain-binding show <domainBindingId>",
      orpc: { method: "GET", path: "/api/domain-bindings/{domainBindingId}" },
    },
  },
  {
    key: "domain-bindings.configure-route",
    kind: "command",
    domain: "domain-bindings",
    messageName: "ConfigureDomainBindingRouteCommand",
    handlerName: "ConfigureDomainBindingRouteCommandHandler",
    serviceName: "ConfigureDomainBindingRouteUseCase",
    inputSchema: configureDomainBindingRouteCommandInputSchema,
    serviceToken: tokens.configureDomainBindingRouteUseCase,
    transports: {
      cli: "appaloft domain-binding configure-route <domainBindingId>",
      orpc: { method: "POST", path: "/api/domain-bindings/{domainBindingId}/route" },
    },
  },
  {
    key: "domain-bindings.delete-check",
    kind: "query",
    domain: "domain-bindings",
    messageName: "CheckDomainBindingDeleteSafetyQuery",
    handlerName: "CheckDomainBindingDeleteSafetyQueryHandler",
    serviceName: "CheckDomainBindingDeleteSafetyQueryService",
    inputSchema: checkDomainBindingDeleteSafetyQueryInputSchema,
    serviceToken: tokens.checkDomainBindingDeleteSafetyQueryService,
    transports: {
      cli: "appaloft domain-binding delete-check <domainBindingId>",
      orpc: { method: "GET", path: "/api/domain-bindings/{domainBindingId}/delete-check" },
    },
  },
  {
    key: "domain-bindings.delete",
    kind: "command",
    domain: "domain-bindings",
    messageName: "DeleteDomainBindingCommand",
    handlerName: "DeleteDomainBindingCommandHandler",
    serviceName: "DeleteDomainBindingUseCase",
    inputSchema: deleteDomainBindingCommandInputSchema,
    serviceToken: tokens.deleteDomainBindingUseCase,
    transports: {
      cli: "appaloft domain-binding delete <domainBindingId> --confirm <domainBindingId>",
      orpc: { method: "DELETE", path: "/api/domain-bindings/{domainBindingId}" },
    },
  },
  {
    key: "domain-bindings.retry-verification",
    kind: "command",
    domain: "domain-bindings",
    messageName: "RetryDomainBindingVerificationCommand",
    handlerName: "RetryDomainBindingVerificationCommandHandler",
    serviceName: "RetryDomainBindingVerificationUseCase",
    inputSchema: retryDomainBindingVerificationCommandInputSchema,
    serviceToken: tokens.retryDomainBindingVerificationUseCase,
    transports: {
      cli: "appaloft domain-binding retry-verification <domainBindingId>",
      orpc: { method: "POST", path: "/api/domain-bindings/{domainBindingId}/verification-retries" },
    },
  },
  {
    key: "certificates.import",
    kind: "command",
    domain: "certificates",
    messageName: "ImportCertificateCommand",
    handlerName: "ImportCertificateCommandHandler",
    serviceName: "ImportCertificateUseCase",
    inputSchema: importCertificateCommandInputSchema,
    serviceToken: tokens.importCertificateUseCase,
    transports: {
      cli: "appaloft certificate import <domainBindingId>",
      orpc: { method: "POST", path: "/api/certificates/import" },
    },
  },
  {
    key: "certificates.issue-or-renew",
    kind: "command",
    domain: "certificates",
    messageName: "IssueOrRenewCertificateCommand",
    handlerName: "IssueOrRenewCertificateCommandHandler",
    serviceName: "IssueOrRenewCertificateUseCase",
    inputSchema: issueOrRenewCertificateCommandInputSchema,
    serviceToken: tokens.issueOrRenewCertificateUseCase,
    transports: {
      cli: "appaloft certificate issue-or-renew <domainBindingId>",
      orpc: { method: "POST", path: "/api/certificates/issue-or-renew" },
    },
  },
  {
    key: "certificates.list",
    kind: "query",
    domain: "certificates",
    messageName: "ListCertificatesQuery",
    handlerName: "ListCertificatesQueryHandler",
    serviceName: "ListCertificatesQueryService",
    inputSchema: listCertificatesQueryInputSchema,
    serviceToken: tokens.listCertificatesQueryService,
    transports: {
      cli: "appaloft certificate list",
      orpc: { method: "GET", path: "/api/certificates" },
    },
  },
  {
    key: "certificates.show",
    kind: "query",
    domain: "certificates",
    messageName: "ShowCertificateQuery",
    handlerName: "ShowCertificateQueryHandler",
    serviceName: "ShowCertificateQueryService",
    inputSchema: showCertificateQueryInputSchema,
    serviceToken: tokens.showCertificateQueryService,
    transports: {
      cli: "appaloft certificate show <certificateId>",
      orpc: { method: "GET", path: "/api/certificates/{certificateId}" },
    },
  },
  {
    key: "certificates.retry",
    kind: "command",
    domain: "certificates",
    messageName: "RetryCertificateCommand",
    handlerName: "RetryCertificateCommandHandler",
    serviceName: "RetryCertificateUseCase",
    inputSchema: retryCertificateCommandInputSchema,
    serviceToken: tokens.retryCertificateUseCase,
    transports: {
      cli: "appaloft certificate retry <certificateId>",
      orpc: { method: "POST", path: "/api/certificates/{certificateId}/retries" },
    },
  },
  {
    key: "certificates.revoke",
    kind: "command",
    domain: "certificates",
    messageName: "RevokeCertificateCommand",
    handlerName: "RevokeCertificateCommandHandler",
    serviceName: "RevokeCertificateUseCase",
    inputSchema: revokeCertificateCommandInputSchema,
    serviceToken: tokens.revokeCertificateUseCase,
    transports: {
      cli: "appaloft certificate revoke <certificateId>",
      orpc: { method: "POST", path: "/api/certificates/{certificateId}/revoke" },
    },
  },
  {
    key: "certificates.delete",
    kind: "command",
    domain: "certificates",
    messageName: "DeleteCertificateCommand",
    handlerName: "DeleteCertificateCommandHandler",
    serviceName: "DeleteCertificateUseCase",
    inputSchema: deleteCertificateCommandInputSchema,
    serviceToken: tokens.deleteCertificateUseCase,
    transports: {
      cli: "appaloft certificate delete <certificateId> --confirm <certificateId>",
      orpc: { method: "DELETE", path: "/api/certificates/{certificateId}" },
    },
  },
  {
    key: "system.providers.list",
    kind: "query",
    domain: "system",
    messageName: "ListProvidersQuery",
    handlerName: "ListProvidersQueryHandler",
    serviceName: "ListProvidersQueryService",
    serviceToken: tokens.providersQueryService,
    transports: {
      cli: "appaloft providers list",
      orpc: { method: "GET", path: "/api/providers" },
    },
  },
  {
    key: "system.plugins.list",
    kind: "query",
    domain: "system",
    messageName: "ListPluginsQuery",
    handlerName: "ListPluginsQueryHandler",
    serviceName: "ListPluginsQueryService",
    serviceToken: tokens.pluginsQueryService,
    transports: {
      cli: "appaloft plugins list",
      orpc: { method: "GET", path: "/api/plugins" },
    },
  },
  {
    key: "system.integrations.list",
    kind: "query",
    domain: "system",
    messageName: "ListIntegrationsQuery",
    handlerName: "ListIntegrationsQueryHandler",
    serviceName: "ListIntegrationsQueryService",
    serviceToken: tokens.integrationsQueryService,
    transports: {
      orpc: { method: "GET", path: "/api/integrations" },
    },
  },
  {
    key: "system.github-repositories.list",
    kind: "query",
    domain: "system",
    messageName: "ListGitHubRepositoriesQuery",
    handlerName: "ListGitHubRepositoriesQueryHandler",
    serviceName: "ListGitHubRepositoriesQueryService",
    inputSchema: listGitHubRepositoriesQueryInputSchema,
    serviceToken: tokens.listGitHubRepositoriesQueryService,
    transports: {
      orpc: { method: "GET", path: "/api/integrations/github/repositories" },
    },
  },
  {
    key: "system.doctor",
    kind: "query",
    domain: "system",
    messageName: "DoctorQuery",
    handlerName: "DoctorQueryHandler",
    serviceName: "DoctorQueryService",
    serviceToken: tokens.doctorQueryService,
    transports: {
      cli: "appaloft doctor",
      orpc: { method: "GET", path: "/api/system/doctor" },
    },
  },
  {
    key: "system.instance-upgrade.check",
    kind: "query",
    domain: "system",
    messageName: "CheckInstanceUpgradeQuery",
    handlerName: "CheckInstanceUpgradeQueryHandler",
    serviceName: "CheckInstanceUpgradeQueryService",
    inputSchema: checkInstanceUpgradeQueryInputSchema,
    serviceToken: tokens.checkInstanceUpgradeQueryService,
    transports: {
      cli: "appaloft upgrade check",
      orpc: { method: "GET", path: "/api/instance-upgrade/check" },
    },
  },
  {
    key: "system.instance-upgrade.apply",
    kind: "command",
    domain: "system",
    messageName: "ApplyInstanceUpgradeCommand",
    handlerName: "ApplyInstanceUpgradeCommandHandler",
    serviceName: "ApplyInstanceUpgradeUseCase",
    inputSchema: applyInstanceUpgradeCommandInputSchema,
    serviceToken: tokens.applyInstanceUpgradeUseCase,
    transports: {
      cli: "appaloft upgrade apply",
      orpc: { method: "POST", path: "/api/instance-upgrade/apply" },
    },
  },
  {
    key: "system.db-status",
    kind: "query",
    domain: "system",
    messageName: "DbStatusQuery",
    handlerName: "DbStatusQueryHandler",
    serviceName: "DbStatusQueryService",
    serviceToken: tokens.dbStatusQueryService,
    transports: {
      cli: "appaloft db status",
    },
  },
  {
    key: "system.db-migrate",
    kind: "command",
    domain: "system",
    messageName: "DbMigrateCommand",
    handlerName: "DbMigrateCommandHandler",
    serviceName: "DbMigrateUseCase",
    serviceToken: tokens.dbMigrateUseCase,
    transports: {
      cli: "appaloft db migrate",
    },
  },
] as const satisfies readonly OperationCatalogEntry[];

export type OperationKey = (typeof operationCatalog)[number]["key"];

const operationCatalogByMessageName = new Map<string, OperationCatalogEntry>(
  operationCatalog.map((entry) => [entry.messageName, entry]),
);
const operationCatalogByKey = new Map<string, OperationCatalogEntry>(
  operationCatalog.map((entry) => [entry.key, entry]),
);

export function findOperationCatalogEntryByMessageName(
  messageName: string,
): OperationCatalogEntry | undefined {
  return operationCatalogByMessageName.get(messageName);
}

export function findOperationCatalogEntryByKey(
  operationKey: string,
): OperationCatalogEntry | undefined {
  return operationCatalogByKey.get(operationKey);
}

export type GenericAggregateMutationOperationViolation = {
  key: string;
  field:
    | "key"
    | "messageName"
    | "handlerName"
    | "serviceName"
    | "transports.cli"
    | "transports.orpc.path"
    | "transports.orpcStream.path";
  value: string;
};

type OperationCatalogGuardEntry = Pick<
  OperationCatalogEntry,
  "domain" | "handlerName" | "key" | "kind" | "messageName" | "serviceName" | "transports"
>;

const forbiddenGenericMutationTokens = new Set(["update", "patch", "save", "edit"]);
const forbiddenGenericMutationNamePattern = /^(Update|Patch|Save|Edit)[A-Z]/;

function includesForbiddenGenericMutationToken(value: string): boolean {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((token) => forbiddenGenericMutationTokens.has(token));
}

export function findGenericAggregateMutationOperations(
  entries: readonly OperationCatalogGuardEntry[] = operationCatalog,
): GenericAggregateMutationOperationViolation[] {
  const violations: GenericAggregateMutationOperationViolation[] = [];

  for (const entry of entries) {
    if (entry.kind !== "command" || entry.domain === "system") {
      continue;
    }

    if (includesForbiddenGenericMutationToken(entry.key)) {
      violations.push({ key: entry.key, field: "key", value: entry.key });
    }

    for (const [field, value] of [
      ["messageName", entry.messageName],
      ["handlerName", entry.handlerName],
      ["serviceName", entry.serviceName],
    ] as const) {
      if (forbiddenGenericMutationNamePattern.test(value)) {
        violations.push({ key: entry.key, field, value });
      }
    }

    if (entry.transports.cli && includesForbiddenGenericMutationToken(entry.transports.cli)) {
      violations.push({ key: entry.key, field: "transports.cli", value: entry.transports.cli });
    }

    if (
      entry.transports.orpc &&
      includesForbiddenGenericMutationToken(entry.transports.orpc.path)
    ) {
      violations.push({
        key: entry.key,
        field: "transports.orpc.path",
        value: entry.transports.orpc.path,
      });
    }

    if (
      entry.transports.orpcStream &&
      includesForbiddenGenericMutationToken(entry.transports.orpcStream.path)
    ) {
      violations.push({
        key: entry.key,
        field: "transports.orpcStream.path",
        value: entry.transports.orpcStream.path,
      });
    }
  }

  return violations;
}
