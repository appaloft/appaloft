import { type PublicDocsHelpTopicId, resolvePublicDocsHelpHref } from "@appaloft/docs-registry";

function withDocs(summary: string, topicId: PublicDocsHelpTopicId): string {
  return `${summary}. Docs: ${resolvePublicDocsHelpHref(topicId)}`;
}

export const cliDocsHrefs = {
  deploymentSource: resolvePublicDocsHelpHref("deployment.source"),
  deploymentPlanPreview: resolvePublicDocsHelpHref("deployment.plan-preview"),
  deploymentPreviewCleanup: resolvePublicDocsHelpHref("deployment.preview-cleanup"),
  productGradePreviews: resolvePublicDocsHelpHref("deployment.product-grade-previews"),
  deploymentSourceRelink: resolvePublicDocsHelpHref("deployment.source-relink"),
  deploymentRecoveryReadiness: resolvePublicDocsHelpHref("deployment.recovery-readiness"),
  projectLifecycle: resolvePublicDocsHelpHref("project.lifecycle"),
  serverDeploymentTarget: resolvePublicDocsHelpHref("server.deployment-target"),
  serverDockerSwarmTarget: resolvePublicDocsHelpHref("server.docker-swarm-target"),
  serverSshCredential: resolvePublicDocsHelpHref("server.ssh-credential"),
  serverConnectivityTest: resolvePublicDocsHelpHref("server.connectivity-test"),
  serverProxyReadiness: resolvePublicDocsHelpHref("server.proxy-readiness"),
  serverTerminalSession: resolvePublicDocsHelpHref("server.terminal-session"),
  resourceConcept: resolvePublicDocsHelpHref("resource.concept"),
  resourceSourceProfile: resolvePublicDocsHelpHref("resource.source-profile"),
  resourceRuntimeProfile: resolvePublicDocsHelpHref("resource.runtime-profile"),
  resourceProfileDrift: resolvePublicDocsHelpHref("resource.profile-drift"),
  resourceHealthProfile: resolvePublicDocsHelpHref("resource.health-profile"),
  resourceNetworkProfile: resolvePublicDocsHelpHref("resource.network-profile"),
  resourceAccessProfile: resolvePublicDocsHelpHref("resource.access-profile"),
  storageVolumeLifecycle: resolvePublicDocsHelpHref("storage.volume-lifecycle"),
  dependencyResourceLifecycle: resolvePublicDocsHelpHref("dependency.resource-lifecycle"),
  dependencyRuntimeInjection: resolvePublicDocsHelpHref("dependency.runtime-injection"),
  environmentConcept: resolvePublicDocsHelpHref("environment.concept"),
  environmentLifecycle: resolvePublicDocsHelpHref("environment.lifecycle"),
  environmentVariablePrecedence: resolvePublicDocsHelpHref("environment.variable-precedence"),
  environmentDiffPromote: resolvePublicDocsHelpHref("environment.diff-promote"),
  domainGeneratedAccessRoute: resolvePublicDocsHelpHref("domain.generated-access-route"),
  domainCustomBinding: resolvePublicDocsHelpHref("domain.custom-domain-binding"),
  domainOwnershipCheck: resolvePublicDocsHelpHref("domain.ownership-check"),
  certificateReadiness: resolvePublicDocsHelpHref("certificate.readiness"),
  observabilityRuntimeLogs: resolvePublicDocsHelpHref("observability.runtime-logs"),
  observabilityHealthSummary: resolvePublicDocsHelpHref("observability.health-summary"),
  diagnosticsSafeSupportPayload: resolvePublicDocsHelpHref("diagnostics.safe-support-payload"),
  diagnosticsAccessFailureRequestId: resolvePublicDocsHelpHref(
    "diagnostics.access-failure-request-id",
  ),
  diagnosticsRuntimeTargetCapacity: resolvePublicDocsHelpHref(
    "diagnostics.runtime-target-capacity",
  ),
  diagnosticsScheduledRuntimePrunePolicy: resolvePublicDocsHelpHref(
    "diagnostics.scheduled-runtime-prune-policy",
  ),
  operatorWorkLedger: resolvePublicDocsHelpHref("operator.work-ledger"),
  operatorAuditEvents: resolvePublicDocsHelpHref("operator.audit-events"),
  operatorDomainEvents: resolvePublicDocsHelpHref("operator.domain-events"),
  operatorProviderJobLogs: resolvePublicDocsHelpHref("operator.provider-job-logs"),
  cliRemoteControlPlaneLogin: resolvePublicDocsHelpHref("cli.remote-control-plane-login"),
  cliRemoteControlPlaneDispatch: resolvePublicDocsHelpHref("cli.remote-control-plane-dispatch"),
  remoteStateLock: resolvePublicDocsHelpHref("errors.remote-state-lock"),
  sourceAutoDeploySetup: resolvePublicDocsHelpHref("source.auto-deploy-setup"),
  sourceAutoDeploySignatures: resolvePublicDocsHelpHref("source.auto-deploy-signatures"),
  sourceAutoDeployDedupe: resolvePublicDocsHelpHref("source.auto-deploy-dedupe"),
  sourceAutoDeployIgnoredEvents: resolvePublicDocsHelpHref("source.auto-deploy-ignored-events"),
  sourceAutoDeployRecovery: resolvePublicDocsHelpHref("source.auto-deploy-recovery"),
  sourceAutoDeployRetention: resolvePublicDocsHelpHref("source.auto-deploy-retention"),
  scheduledTaskLifecycle: resolvePublicDocsHelpHref("scheduled-task.resource-lifecycle"),
  selfHostedActionDeployToken: resolvePublicDocsHelpHref("self-hosting.action-deploy-token-auth"),
  selfHostedFirstAdmin: resolvePublicDocsHelpHref("self-hosting.first-admin-bootstrap"),
  selfHostedOrganizationTeam: resolvePublicDocsHelpHref(
    "self-hosting.organization-team-management",
  ),
  agentDeploySkill: resolvePublicDocsHelpHref("agent.deploy-skill"),
} as const;

export const cliCommandDescriptions = {
  deploy: withDocs("Create a deployment", "deployment.source"),
  deploymentPlan: withDocs("Preview deployment plan without execution", "deployment.plan-preview"),
  controlPlaneLogin: withDocs(
    "Login to an Appaloft control plane",
    "cli.remote-control-plane-login",
  ),
  controlPlaneStatus: withDocs(
    "Show local Appaloft control-plane profile status",
    "cli.remote-control-plane-login",
  ),
  controlPlaneLogout: withDocs(
    "Logout from an Appaloft control-plane profile",
    "cli.remote-control-plane-login",
  ),
  controlPlaneContext: withDocs(
    "Manage local Appaloft control-plane profiles",
    "cli.remote-control-plane-login",
  ),
  controlPlaneContextList: withDocs(
    "List local Appaloft control-plane profiles",
    "cli.remote-control-plane-login",
  ),
  controlPlaneContextShow: withDocs(
    "Show the active Appaloft control-plane profile",
    "cli.remote-control-plane-login",
  ),
  controlPlaneContextUse: withDocs(
    "Select the active Appaloft control-plane profile",
    "cli.remote-control-plane-login",
  ),
  deploymentLogs: withDocs("Show deployment logs", "observability.runtime-logs"),
  deploymentLogsPrune: withDocs(
    "Dry-run or prune old embedded deployment log entries",
    "observability.runtime-logs",
  ),
  deploymentList: withDocs("List deployments", "deployment.lifecycle"),
  deploymentShow: withDocs("Show deployment detail", "deployment.lifecycle"),
  deploymentRecoveryReadiness: withDocs(
    "Show retry, redeploy, cancel, and rollback readiness for a deployment",
    "deployment.recovery-readiness",
  ),
  deploymentRetry: withDocs(
    "Retry a failed or canceled deployment attempt",
    "deployment.recovery-readiness",
  ),
  deploymentRedeploy: withDocs(
    "Redeploy the current resource profile",
    "deployment.recovery-readiness",
  ),
  deploymentRollback: withDocs(
    "Roll back to a retained successful deployment candidate",
    "deployment.recovery-readiness",
  ),
  deploymentCancel: withDocs(
    "Cancel an active deployment attempt",
    "deployment.recovery-readiness",
  ),
  deploymentArchive: withDocs(
    "Archive a terminal deployment attempt",
    "deployment.recovery-readiness",
  ),
  deploymentPrune: withDocs(
    "Dry-run or prune archived deployment attempts",
    "deployment.recovery-readiness",
  ),
  deploymentEvents: withDocs(
    "Replay or follow deployment lifecycle events",
    "deployment.lifecycle",
  ),
  deployments: withDocs("Deployment queries", "deployment.lifecycle"),
  preview: withDocs("Preview deployment commands", "deployment.preview-cleanup"),
  previewCleanup: withDocs("Clean up a preview deployment context", "deployment.preview-cleanup"),
  previewPolicy: withDocs(
    "Product-grade preview policy commands",
    "deployment.product-grade-previews",
  ),
  previewPolicyConfigure: withDocs(
    "Configure product-grade preview policy for a project or resource",
    "deployment.product-grade-previews",
  ),
  previewPolicyShow: withDocs(
    "Show effective product-grade preview policy for a project or resource",
    "deployment.product-grade-previews",
  ),
  previewEnvironment: withDocs(
    "Product-grade preview environment commands",
    "deployment.product-grade-previews",
  ),
  previewEnvironmentList: withDocs(
    "List product-grade preview environments",
    "deployment.product-grade-previews",
  ),
  previewEnvironmentShow: withDocs(
    "Show one product-grade preview environment",
    "deployment.product-grade-previews",
  ),
  previewEnvironmentDelete: withDocs(
    "Request cleanup for one product-grade preview environment",
    "deployment.product-grade-previews",
  ),
  sourceLinks: withDocs("Source fingerprint link operations", "deployment.source-relink"),
  sourceLinkList: withDocs("List source fingerprint links", "deployment.source-relink"),
  sourceLinkShow: withDocs("Show one source fingerprint link", "deployment.source-relink"),
  sourceLinkRelink: withDocs(
    "Relink a source fingerprint to an explicit resource",
    "deployment.source-relink",
  ),
  sourceLinkDelete: withDocs("Delete one source fingerprint link", "deployment.source-relink"),
  staticArtifact: "Static artifact publishing operations",
  staticArtifactPublish:
    "Publish a prebuilt static directory or zip archive through configured artifact adapters",
  sourceEvent: withDocs("Source event diagnostics", "source.auto-deploy-setup"),
  sourceEventList: withDocs(
    "List source event deliveries for a project or resource",
    "source.auto-deploy-dedupe",
  ),
  sourceEventShow: withDocs("Show one source event delivery", "source.auto-deploy-ignored-events"),
  sourceEventReplay: withDocs("Replay one source event delivery", "source.auto-deploy-recovery"),
  sourceEventPrune: withDocs(
    "Dry-run or prune retained source event deliveries",
    "source.auto-deploy-retention",
  ),
  remoteState: withDocs("Remote state diagnostics", "errors.remote-state-lock"),
  remoteStateLock: withDocs("SSH remote-state lock diagnostics", "errors.remote-state-lock"),
  remoteStateLockInspect: withDocs(
    "Inspect the SSH remote-state mutation lock",
    "errors.remote-state-lock",
  ),
  remoteStateLockRecoverStale: withDocs(
    "Archive a stale SSH remote-state mutation lock",
    "errors.remote-state-lock",
  ),
  operatorWork: withDocs("Background work visibility", "operator.work-ledger"),
  operatorWorkList: withDocs(
    "List background work and latest failure state without recovery mutation",
    "operator.work-ledger",
  ),
  operatorWorkShow: withDocs(
    "Show one background work item without retrying or cleaning it up",
    "operator.work-ledger",
  ),
  operatorWorkMarkRecovered: withDocs(
    "Mark one durable background work item as manually recovered",
    "operator.work-ledger",
  ),
  operatorWorkDeadLetter: withDocs(
    "Dead-letter one durable background work item after manual review",
    "operator.work-ledger",
  ),
  operatorWorkCancel: withDocs(
    "Cancel one pending or retry-scheduled durable background work item",
    "operator.work-ledger",
  ),
  operatorWorkRetry: withDocs(
    "Create a new pending retry attempt for one retriable background work item",
    "operator.work-ledger",
  ),
  operatorWorkPrune: withDocs(
    "Dry-run or prune old terminal durable background work journal rows",
    "operator.work-ledger",
  ),
  auditEvent: withDocs("Audit event visibility", "operator.audit-events"),
  auditEventList: withDocs("List safe audit events for one aggregate", "operator.audit-events"),
  auditEventShow: withDocs("Show one redacted audit event", "operator.audit-events"),
  auditEventExport: withDocs(
    "Export bounded redacted audit events for one aggregate",
    "operator.audit-events",
  ),
  auditEventExportGlobal: withDocs(
    "Export bounded redacted audit events across aggregates",
    "operator.audit-events",
  ),
  auditEventPrune: withDocs(
    "Dry-run or prune old retained audit rows while preserving active legal holds and archives",
    "operator.audit-events",
  ),
  auditEventArchive: withDocs("Audit event archive management", "operator.audit-events"),
  auditEventArchiveCreate: withDocs(
    "Create an immutable redacted audit event archive",
    "operator.audit-events",
  ),
  auditEventArchiveList: withDocs("List audit event archives", "operator.audit-events"),
  auditEventArchiveShow: withDocs("Show one audit event archive", "operator.audit-events"),
  auditEventArchivePrune: withDocs(
    "Dry-run or prune old retained audit event archives",
    "operator.audit-events",
  ),
  auditEventLegalHold: withDocs("Audit event legal hold management", "operator.audit-events"),
  auditEventLegalHoldConfigure: withDocs(
    "Configure an audit event legal hold",
    "operator.audit-events",
  ),
  auditEventLegalHoldList: withDocs("List audit event legal holds", "operator.audit-events"),
  auditEventLegalHoldShow: withDocs("Show one audit event legal hold", "operator.audit-events"),
  auditEventLegalHoldRelease: withDocs(
    "Release an audit event legal hold",
    "operator.audit-events",
  ),
  providerJobLog: withDocs("Provider job log retention", "operator.provider-job-logs"),
  providerJobLogPrune: withDocs(
    "Dry-run or prune old retained provider job log rows",
    "operator.provider-job-logs",
  ),
  retentionDefault: withDocs("Organization retention defaults", "operator.retention-defaults"),
  retentionDefaultConfigure: withDocs(
    "Configure non-executing retention defaults",
    "operator.retention-defaults",
  ),
  retentionDefaultList: withDocs("List retention defaults", "operator.retention-defaults"),
  retentionDefaultShow: withDocs("Show retention default", "operator.retention-defaults"),
  domainEvent: withDocs("Domain event stream retention", "operator.domain-events"),
  domainEventPrune: withDocs(
    "Dry-run or prune old retained domain event stream rows",
    "operator.domain-events",
  ),
  terminalSession: withDocs("Terminal session lifecycle operations", "server.terminal-session"),
  terminalSessionList: withDocs(
    "List active terminal sessions without terminal output",
    "server.terminal-session",
  ),
  terminalSessionShow: withDocs(
    "Show one active terminal session without attaching to it",
    "server.terminal-session",
  ),
  terminalSessionClose: withDocs("Close one active terminal session", "server.terminal-session"),
  terminalSessionExpire: withDocs(
    "Expire active terminal sessions older than a cutoff",
    "server.terminal-session",
  ),
  project: withDocs("Project operations", "project.lifecycle"),
  projectCreate: withDocs("Create a project", "project.concept"),
  projectList: withDocs("List projects", "project.concept"),
  projectShow: withDocs("Show project identity and lifecycle", "project.lifecycle"),
  projectRename: withDocs("Rename a project", "project.lifecycle"),
  projectSetDescription: withDocs("Set or clear a project description", "project.lifecycle"),
  projectArchive: withDocs("Archive a project", "project.lifecycle"),
  projectRestore: withDocs("Restore an archived project", "project.lifecycle"),
  projectDeleteCheck: withDocs("Preview project delete safety", "project.lifecycle"),
  projectDelete: withDocs(
    "Delete an archived project after blockers are clear",
    "project.lifecycle",
  ),
  server: withDocs("Server operations", "server.deployment-target"),
  serverRegister: withDocs(
    "Register a single-server or Docker Swarm deployment target",
    "server.docker-swarm-target",
  ),
  serverList: withDocs("List servers", "server.deployment-target"),
  serverShow: withDocs("Show server detail", "server.deployment-target"),
  serverRename: withDocs("Rename a server deployment target", "server.deployment-target"),
  serverDeactivate: withDocs("Deactivate a server deployment target", "server.deployment-target"),
  serverDeleteCheck: withDocs(
    "Check whether a server can be safely deleted",
    "server.deployment-target",
  ),
  serverDelete: withDocs(
    "Delete a deactivated server after delete-safety blockers are clear",
    "server.deployment-target",
  ),
  serverCredential: withDocs("Configure server SSH credential", "server.ssh-credential"),
  serverCredentialCreate: withDocs(
    "Create a reusable SSH credential from a private key file",
    "server.ssh-credential",
  ),
  serverCredentialList: withDocs("List reusable SSH credentials", "server.ssh-credential"),
  serverCredentialShow: withDocs(
    "Show reusable SSH credential detail and usage",
    "server.ssh-credential",
  ),
  serverCredentialDelete: withDocs(
    "Delete an unused reusable SSH credential after typed confirmation",
    "server.ssh-credential",
  ),
  serverCredentialRotate: withDocs(
    "Rotate a reusable SSH credential after typed confirmation and usage acknowledgement",
    "server.ssh-credential",
  ),
  serverTest: withDocs("Test server connectivity", "server.connectivity-test"),
  serverDoctor: withDocs("Diagnose server SSH and Docker readiness", "server.connectivity-test"),
  serverCapacity: withDocs("Server capacity diagnostics", "diagnostics.runtime-target-capacity"),
  serverCapacityInspect: withDocs(
    "Inspect disk, inode, Docker, and Appaloft runtime capacity without cleanup",
    "diagnostics.runtime-target-capacity",
  ),
  serverCapacityPrune: withDocs(
    "Dry-run or prune safe stopped containers and Appaloft runtime workspaces",
    "diagnostics.runtime-target-capacity",
  ),
  serverCapacityPolicy: withDocs(
    "Scheduled runtime prune policy operations",
    "diagnostics.scheduled-runtime-prune-policy",
  ),
  serverCapacityPolicyConfigure: withDocs(
    "Configure scheduled runtime prune policy",
    "diagnostics.scheduled-runtime-prune-policy",
  ),
  serverCapacityPolicyList: withDocs(
    "List scheduled runtime prune policies",
    "diagnostics.scheduled-runtime-prune-policy",
  ),
  serverCapacityPolicyShow: withDocs(
    "Show scheduled runtime prune policy",
    "diagnostics.scheduled-runtime-prune-policy",
  ),
  runtimeUsage: withDocs("Runtime usage attribution diagnostics", "diagnostics.runtime-usage"),
  runtimeUsageInspect: withDocs(
    "Inspect runtime usage attribution for a scope without cleanup",
    "diagnostics.runtime-usage",
  ),
  runtimeMonitoring: withDocs(
    "Runtime monitoring sample and rollup diagnostics",
    "diagnostics.runtime-monitoring",
  ),
  runtimeMonitoringSamples: withDocs(
    "List retained runtime monitoring samples for a scope",
    "diagnostics.runtime-monitoring",
  ),
  runtimeMonitoringRollup: withDocs(
    "Read retained runtime monitoring rollups for a scope",
    "diagnostics.runtime-monitoring",
  ),
  runtimeMonitoringThresholds: withDocs(
    "Runtime monitoring threshold policy operations",
    "diagnostics.runtime-monitoring",
  ),
  runtimeMonitoringThresholdConfigure: withDocs(
    "Configure non-enforcing runtime monitoring thresholds",
    "diagnostics.runtime-monitoring",
  ),
  runtimeMonitoringThresholdShow: withDocs(
    "Show non-enforcing runtime monitoring threshold state",
    "diagnostics.runtime-monitoring",
  ),
  serverProxy: withDocs("Server edge proxy operations", "server.proxy-readiness"),
  serverProxyRepair: withDocs(
    "Repair provider-owned edge proxy infrastructure",
    "server.proxy-readiness",
  ),
  serverProxyConfigure: withDocs(
    "Configure desired edge proxy kind for future routes",
    "server.proxy-readiness",
  ),
  serverTerminal: withDocs("Open a server terminal session", "server.terminal-session"),
  resource: withDocs("Resource operations", "resource.concept"),
  resourceCreate: withDocs("Create a resource", "resource.concept"),
  resourceList: withDocs("List resources", "resource.concept"),
  resourceShow: withDocs("Show resource profile and diagnostics", "resource.profile-drift"),
  resourceArchive: withDocs("Archive a resource", "resource.concept"),
  resourceDelete: withDocs("Delete an archived resource", "resource.concept"),
  resourceTerminal: withDocs("Open a resource terminal session", "server.terminal-session"),
  resourceLogs: withDocs("Show resource runtime logs", "observability.runtime-logs"),
  resourceLogsArchive: withDocs(
    "Capture a redacted resource runtime log archive snapshot",
    "observability.runtime-logs",
  ),
  resourceLogArchives: withDocs(
    "Resource runtime log archive retention",
    "observability.runtime-logs",
  ),
  resourceLogArchivesList: withDocs(
    "List retained resource runtime log archive snapshots",
    "observability.runtime-logs",
  ),
  resourceLogArchivesShow: withDocs(
    "Show one retained resource runtime log archive snapshot",
    "observability.runtime-logs",
  ),
  resourceLogArchivesPrune: withDocs(
    "Dry-run or prune retained resource runtime log archive snapshots",
    "observability.runtime-logs",
  ),
  resourceRuntime: withDocs("Resource runtime control operations", "resource.runtime-controls"),
  resourceRuntimeStop: withDocs("Stop the current resource runtime", "resource.runtime-controls"),
  resourceRuntimeStart: withDocs(
    "Start the last stopped resource runtime",
    "resource.runtime-controls",
  ),
  resourceRuntimeRestart: withDocs(
    "Restart the current resource runtime without redeploying",
    "resource.runtime-controls",
  ),
  resourceHealth: withDocs("Show current resource health", "observability.health-summary"),
  resourceHealthHistory: withDocs(
    "List retained resource health observations",
    "observability.health-summary",
  ),
  resourceConfigureSource: withDocs("Configure resource source profile", "resource.source-profile"),
  resourceConfigureRuntime: withDocs(
    "Configure resource runtime profile",
    "resource.runtime-profile",
  ),
  resourceConfigureHealth: withDocs("Configure resource health policy", "resource.health-profile"),
  resourceResetHealth: withDocs("Reset resource health policy", "resource.health-profile"),
  resourceConfigureNetwork: withDocs(
    "Configure resource network profile",
    "resource.network-profile",
  ),
  resourceConfigureAccess: withDocs(
    "Configure resource generated access profile",
    "resource.access-profile",
  ),
  resourceConfigureAutoDeploy: withDocs(
    "Configure resource auto-deploy policy",
    "source.auto-deploy-setup",
  ),
  resourceStorage: withDocs("Resource storage attachment operations", "storage.volume-lifecycle"),
  resourceAttachStorage: withDocs(
    "Attach storage to a resource at a destination path",
    "storage.volume-lifecycle",
  ),
  resourceDetachStorage: withDocs(
    "Detach storage from a resource without deleting the volume",
    "storage.volume-lifecycle",
  ),
  resourceDependency: withDocs(
    "Resource dependency binding operations",
    "dependency.resource-lifecycle",
  ),
  resourceDependencyBind: withDocs(
    "Bind a dependency resource to a resource",
    "dependency.resource-lifecycle",
  ),
  resourceDependencyUnbind: withDocs(
    "Unbind a dependency resource without deleting it",
    "dependency.resource-lifecycle",
  ),
  resourceDependencyRotateSecret: withDocs(
    "Rotate a resource dependency binding secret reference",
    "dependency.resource-lifecycle",
  ),
  resourceDependencyList: withDocs(
    "List resource dependency bindings",
    "dependency.resource-lifecycle",
  ),
  resourceDependencyShow: withDocs(
    "Show one resource dependency binding",
    "dependency.resource-lifecycle",
  ),
  scheduledTask: withDocs("Scheduled task operations", "scheduled-task.resource-lifecycle"),
  scheduledTaskCreate: withDocs(
    "Create a Resource-owned scheduled task",
    "scheduled-task.resource-lifecycle",
  ),
  scheduledTaskList: withDocs("List scheduled tasks", "scheduled-task.resource-lifecycle"),
  scheduledTaskShow: withDocs("Show scheduled task detail", "scheduled-task.resource-lifecycle"),
  scheduledTaskConfigure: withDocs(
    "Configure a scheduled task",
    "scheduled-task.resource-lifecycle",
  ),
  scheduledTaskDelete: withDocs("Delete a scheduled task", "scheduled-task.resource-lifecycle"),
  scheduledTaskRun: withDocs(
    "Accept an immediate scheduled task run",
    "scheduled-task.resource-lifecycle",
  ),
  scheduledTaskRuns: withDocs("Scheduled task run history", "scheduled-task.resource-lifecycle"),
  scheduledTaskRunsList: withDocs("List scheduled task runs", "scheduled-task.resource-lifecycle"),
  scheduledTaskRunsShow: withDocs(
    "Show scheduled task run detail",
    "scheduled-task.resource-lifecycle",
  ),
  scheduledTaskRunsLogs: withDocs(
    "Read scheduled task run logs",
    "scheduled-task.resource-lifecycle",
  ),
  storage: withDocs("Storage operations", "storage.volume-lifecycle"),
  storageVolume: withDocs("Storage volume operations", "storage.volume-lifecycle"),
  storageVolumeCreate: withDocs(
    "Create a named volume or bind mount metadata record",
    "storage.volume-lifecycle",
  ),
  storageVolumeList: withDocs("List storage volumes", "storage.volume-lifecycle"),
  storageVolumeShow: withDocs("Show storage volume detail", "storage.volume-lifecycle"),
  storageVolumeRename: withDocs("Rename a storage volume", "storage.volume-lifecycle"),
  storageVolumeDelete: withDocs("Delete an unattached storage volume", "storage.volume-lifecycle"),
  storageVolumeCleanupRuntime: withDocs(
    "Dry-run or explicitly remove safe runtime volume realizations",
    "storage.volume-lifecycle",
  ),
  deployToken: withDocs(
    "Self-hosted Action deploy-token management",
    "self-hosting.action-deploy-token-auth",
  ),
  deployTokenCreate: withDocs(
    "Create a self-hosted Action deploy token and print the raw value once",
    "self-hosting.action-deploy-token-auth",
  ),
  deployTokenList: withDocs(
    "List safe self-hosted Action deploy-token metadata",
    "self-hosting.action-deploy-token-auth",
  ),
  deployTokenShow: withDocs(
    "Show one self-hosted Action deploy token without raw secret material",
    "self-hosting.action-deploy-token-auth",
  ),
  deployTokenRotate: withDocs(
    "Rotate a self-hosted Action deploy token and print the new raw value once",
    "self-hosting.action-deploy-token-auth",
  ),
  deployTokenRevoke: withDocs(
    "Revoke a self-hosted Action deploy token",
    "self-hosting.action-deploy-token-auth",
  ),
  auth: withDocs(
    "Self-hosted product auth bootstrap operations",
    "self-hosting.first-admin-bootstrap",
  ),
  authBootstrapStatus: withDocs(
    "Show safe first-admin bootstrap status",
    "self-hosting.first-admin-bootstrap",
  ),
  authBootstrapFirstAdmin: withDocs(
    "Create the first local admin when bootstrap is required",
    "self-hosting.first-admin-bootstrap",
  ),
  organization: withDocs(
    "Organization and team operations",
    "self-hosting.organization-team-management",
  ),
  organizationContext: withDocs(
    "Show the signed-in user and current organization context",
    "self-hosting.organization-team-management",
  ),
  organizationSwitch: withDocs(
    "Switch the current organization for the signed-in product session",
    "self-hosting.organization-team-management",
  ),
  organizationMembers: withDocs(
    "Organization member operations",
    "self-hosting.organization-team-management",
  ),
  organizationMembersList: withDocs(
    "List organization members",
    "self-hosting.organization-team-management",
  ),
  organizationInvitations: withDocs(
    "Organization invitation operations",
    "self-hosting.organization-team-management",
  ),
  organizationInvitationsList: withDocs(
    "List organization invitations",
    "self-hosting.organization-team-management",
  ),
  organizationMember: withDocs(
    "Organization member mutation commands",
    "self-hosting.organization-team-management",
  ),
  organizationMemberInvite: withDocs(
    "Invite an operator to an organization",
    "self-hosting.organization-team-management",
  ),
  organizationMemberRole: withDocs(
    "Update an organization member role",
    "self-hosting.organization-team-management",
  ),
  organizationMemberRemove: withDocs(
    "Remove an organization member",
    "self-hosting.organization-team-management",
  ),
  organizationOwner: withDocs(
    "Organization owner operations",
    "self-hosting.organization-team-management",
  ),
  organizationOwnerTransfer: withDocs(
    "Transfer organization ownership to another member",
    "self-hosting.organization-team-management",
  ),
  dependency: withDocs("Dependency resource operations", "dependency.resource-lifecycle"),
  dependencyPlan: withDocs(
    "Prepare a dependency resource create or reuse plan without mutating providers",
    "dependency.resource-lifecycle",
  ),
  dependencyAccept: withDocs(
    "Accept a dependency resource provisioning plan and execute the planned mutation",
    "dependency.resource-lifecycle",
  ),
  dependencyStatus: withDocs(
    "Show dependency resource provisioning plan status",
    "dependency.resource-lifecycle",
  ),
  dependencyProvision: withDocs(
    "Create an Appaloft-managed dependency resource by kind; pass --server for Docker-backed single-server realization",
    "dependency.resource-lifecycle",
  ),
  dependencyPostgresProvision: withDocs(
    "Create an Appaloft-managed Postgres dependency resource",
    "dependency.resource-lifecycle",
  ),
  dependencyImport: withDocs(
    "Import an external dependency resource by kind",
    "dependency.resource-lifecycle",
  ),
  dependencyRedisImport: withDocs(
    "Import an external Redis dependency resource",
    "dependency.resource-lifecycle",
  ),
  dependencyList: withDocs("List dependency resources", "dependency.resource-lifecycle"),
  dependencyShow: withDocs("Show dependency resource detail", "dependency.resource-lifecycle"),
  dependencyRename: withDocs("Rename a dependency resource", "dependency.resource-lifecycle"),
  dependencyDelete: withDocs(
    "Delete a dependency resource after safety checks",
    "dependency.resource-lifecycle",
  ),
  dependencyBackup: withDocs("Dependency resource backup operations", "dependency.backup-restore"),
  dependencyBackupCreate: withDocs(
    "Create a backup restore point for a dependency resource",
    "dependency.backup-restore",
  ),
  dependencyBackupList: withDocs("List dependency resource backups", "dependency.backup-restore"),
  dependencyBackupShow: withDocs(
    "Show dependency resource backup detail",
    "dependency.backup-restore",
  ),
  dependencyBackupRestore: withDocs(
    "Restore a dependency resource backup in place",
    "dependency.backup-restore",
  ),
  dependencyBackupPolicy: withDocs(
    "Scheduled dependency backup policy operations",
    "dependency.resource-lifecycle",
  ),
  dependencyBackupPolicyConfigure: withDocs(
    "Configure a scheduled dependency backup policy",
    "dependency.resource-lifecycle",
  ),
  dependencyBackupPolicyList: withDocs(
    "List scheduled dependency backup policies",
    "dependency.resource-lifecycle",
  ),
  dependencyBackupPolicyShow: withDocs(
    "Show scheduled dependency backup policy detail",
    "dependency.resource-lifecycle",
  ),
  resourceSetVariable: withDocs(
    "Set a resource-scoped variable override",
    "environment.variable-precedence",
  ),
  resourceSecrets: withDocs(
    "Manage resource-owned secret references",
    "environment.variable-precedence",
  ),
  resourceSecretsCreate: withDocs(
    "Create a resource-owned secret reference",
    "environment.variable-precedence",
  ),
  resourceSecretsRotate: withDocs(
    "Rotate a resource-owned secret reference",
    "environment.variable-precedence",
  ),
  resourceSecretsDelete: withDocs(
    "Delete a resource-owned secret reference",
    "environment.variable-precedence",
  ),
  resourceSecretsList: withDocs(
    "List masked resource-owned secret references",
    "environment.variable-precedence",
  ),
  resourceSecretsShow: withDocs(
    "Show one masked resource-owned secret reference",
    "environment.variable-precedence",
  ),
  resourceImportVariables: withDocs(
    "Import pasted .env variables into one resource",
    "environment.variable-precedence",
  ),
  resourceUnsetVariable: withDocs(
    "Unset a resource-scoped variable override",
    "environment.variable-precedence",
  ),
  resourceEffectiveConfig: withDocs(
    "Show masked effective resource configuration",
    "environment.variable-precedence",
  ),
  resourceProxyConfig: withDocs("Show resource proxy configuration", "resource.network-profile"),
  resourceDiagnose: withDocs(
    "Print resource diagnostic summary context as JSON or a concise summary",
    "diagnostics.safe-support-payload",
  ),
  resourceAccessFailure: withDocs(
    "Look up safe access failure evidence by request id",
    "diagnostics.access-failure-request-id",
  ),
  environment: withDocs("Environment operations", "environment.concept"),
  environmentCreate: withDocs("Create an environment", "environment.concept"),
  environmentList: withDocs("List environments", "environment.concept"),
  environmentShow: withDocs("Show an environment", "environment.concept"),
  environmentRename: withDocs("Rename an environment", "environment.lifecycle"),
  environmentArchive: withDocs("Archive an environment", "environment.lifecycle"),
  environmentClone: withDocs("Clone an environment", "environment.lifecycle"),
  environmentLock: withDocs("Lock an environment", "environment.lifecycle"),
  environmentUnlock: withDocs("Unlock an environment", "environment.lifecycle"),
  environmentSet: withDocs("Set an environment variable", "environment.variable-precedence"),
  environmentUnset: withDocs("Unset an environment variable", "environment.variable-precedence"),
  environmentEffectivePrecedence: withDocs(
    "Show masked effective environment precedence",
    "environment.variable-precedence",
  ),
  environmentDiff: withDocs("Diff two environments", "environment.diff-promote"),
  environmentPromote: withDocs("Promote an environment", "environment.diff-promote"),
  defaultAccess: withDocs(
    "Configure generated default access domain policy",
    "domain.generated-access-route",
  ),
  defaultAccessConfigure: withDocs(
    "Configure default access domain policy",
    "domain.generated-access-route",
  ),
  defaultAccessList: withDocs(
    "List default access domain policies",
    "domain.generated-access-route",
  ),
  defaultAccessShow: withDocs("Show default access domain policy", "domain.generated-access-route"),
  domainBinding: withDocs("Domain binding operations", "domain.custom-domain-binding"),
  domainBindingCreate: withDocs("Create a durable domain binding", "domain.custom-domain-binding"),
  domainBindingShow: withDocs("Show domain binding readiness", "domain.custom-domain-binding"),
  domainBindingConfigureRoute: withDocs(
    "Configure domain binding route behavior",
    "domain.custom-domain-binding",
  ),
  domainBindingConfirmOwnership: withDocs(
    "Confirm domain binding ownership",
    "domain.ownership-check",
  ),
  domainBindingDeleteCheck: withDocs(
    "Check whether a domain binding can be deleted safely",
    "domain.custom-domain-binding",
  ),
  domainBindingDelete: withDocs("Delete a domain binding safely", "domain.custom-domain-binding"),
  domainBindingRetryVerification: withDocs(
    "Retry domain binding ownership verification",
    "domain.ownership-check",
  ),
  domainBindingList: withDocs("List domain bindings", "domain.custom-domain-binding"),
  certificate: withDocs("Certificate operations", "certificate.readiness"),
  certificateIssueOrRenew: withDocs(
    "Request certificate issuance or renewal",
    "certificate.readiness",
  ),
  certificateImport: withDocs(
    "Import a manual certificate for a bound domain",
    "certificate.readiness",
  ),
  certificateList: withDocs("List certificate lifecycle state", "certificate.readiness"),
  certificateShow: withDocs("Show certificate lifecycle state", "certificate.readiness"),
  certificateRetry: withDocs("Retry provider certificate issuance", "certificate.readiness"),
  certificateRevoke: withDocs("Revoke an active certificate", "certificate.readiness"),
  certificateDelete: withDocs("Delete certificate active lifecycle state", "certificate.readiness"),
} as const;
