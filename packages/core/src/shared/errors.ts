import { type ErrorKnowledge } from "./error-knowledge";

export type ErrorCategory = "user" | "infra" | "provider" | "retryable" | "timeout";

export type DomainErrorDetailValue = string | number | boolean | null | readonly string[];

export type DomainErrorDetails = Record<string, DomainErrorDetailValue>;

export interface DomainError {
  code: string;
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  details?: DomainErrorDetails;
  knowledge?: ErrorKnowledge;
}

function createError(
  code: string,
  category: ErrorCategory,
  message: string,
  details?: DomainErrorDetails,
  retryable = false,
): DomainError {
  return {
    code,
    category,
    message,
    retryable,
    ...(details ? { details } : {}),
  };
}

export const domainError = {
  validation: (message: string, details?: DomainErrorDetails): DomainError =>
    createError("validation_error", "user", message, details),
  invariant: (message: string, details?: DomainErrorDetails): DomainError =>
    createError("invariant_violation", "user", message, details),
  notFound: (entity: string, id: string): DomainError =>
    createError("not_found", "user", `${entity} ${id} was not found`, {
      entity,
      id,
    }),
  conflict: (message: string, details?: DomainErrorDetails): DomainError =>
    createError("conflict", "user", message, details),
  resourceContextMismatch: (message: string, details?: DomainErrorDetails): DomainError =>
    createError("resource_context_mismatch", "user", message, details),
  resourceDependencyBindingContextMismatch: (
    message: string,
    details?: DomainErrorDetails,
  ): DomainError =>
    createError("resource_dependency_binding_context_mismatch", "user", message, details),
  resourceDependencyBindingRotationBlocked: (
    message: string,
    details?: DomainErrorDetails,
  ): DomainError =>
    createError("resource_dependency_binding_rotation_blocked", "user", message, details),
  resourceRuntimeLogsContextMismatch: (
    message: string,
    details?: DomainErrorDetails,
  ): DomainError => createError("resource_runtime_logs_context_mismatch", "user", message, details),
  resourceRuntimeLogsUnavailable: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("resource_runtime_logs_unavailable", "user", message, details),
  resourceRuntimeLogsNotConfigured: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError =>
    createError("resource_runtime_logs_not_configured", "provider", message, details, true),
  resourceRuntimeLogStreamFailed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError =>
    createError("resource_runtime_log_stream_failed", "retryable", message, details, true),
  resourceRuntimeLogCancelled: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("resource_runtime_log_cancelled", "user", message, details),
  terminalSessionContextMismatch: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("terminal_session_context_mismatch", "user", message, details),
  terminalSessionWorkspaceUnavailable: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("terminal_session_workspace_unavailable", "user", message, details),
  terminalSessionNotConfigured: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("terminal_session_not_configured", "provider", message, details),
  terminalSessionUnsupported: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("terminal_session_unsupported", "provider", message, details),
  terminalSessionPolicyDenied: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("terminal_session_policy_denied", "user", message, details),
  terminalSessionFailed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = false,
  ): DomainError => createError("terminal_session_failed", "infra", message, details, retryable),
  terminalSessionNotFound: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("terminal_session_not_found", "user", message, details),
  resourceDiagnosticContextMismatch: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("resource_diagnostic_context_mismatch", "user", message, details),
  resourceDiagnosticUnavailable: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = true,
  ): DomainError =>
    createError("resource_diagnostic_unavailable", "infra", message, details, retryable),
  resourceDiagnosticRedactionFailed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("resource_diagnostic_redaction_failed", "infra", message, details),
  resourceAccessFailureEvidenceUnavailable: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = true,
  ): DomainError =>
    createError(
      "resource_access_failure_evidence_unavailable",
      "infra",
      message,
      details,
      retryable,
    ),
  resourceHealthUnavailable: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = true,
  ): DomainError =>
    createError("resource_health_unavailable", "infra", message, details, retryable),
  resourceHealthAggregationFailed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = true,
  ): DomainError =>
    createError("resource_health_aggregation_failed", "infra", message, details, retryable),
  resourceSlugConflict: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("resource_slug_conflict", "user", message, details),
  resourceArchived: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("resource_archived", "user", message, details),
  resourceAutoDeploySourceMissing: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("resource_auto_deploy_source_missing", "user", message, details),
  resourceAutoDeploySecretRequired: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("resource_auto_deploy_secret_required", "user", message, details),
  serverInactive: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("server_inactive", "user", message, details),
  serverDeleteBlocked: (message: string, details?: DomainErrorDetails): DomainError =>
    createError("server_delete_blocked", "user", message, details),
  projectSlugConflict: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("project_slug_conflict", "user", message, details),
  projectArchived: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("project_archived", "user", message, details),
  environmentArchived: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("environment_archived", "user", message, details),
  environmentLocked: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("environment_locked", "user", message, details),
  resourceDeleteBlocked: (message: string, details?: DomainErrorDetails): DomainError =>
    createError("resource_delete_blocked", "user", message, details),
  dependencyResourceDeleteBlocked: (message: string, details?: DomainErrorDetails): DomainError =>
    createError("dependency_resource_delete_blocked", "user", message, details),
  dependencyResourceBackupBlocked: (message: string, details?: DomainErrorDetails): DomainError =>
    createError("dependency_resource_backup_blocked", "user", message, details),
  dependencyResourceRestoreBlocked: (message: string, details?: DomainErrorDetails): DomainError =>
    createError("dependency_resource_restore_blocked", "user", message, details),
  deploymentNotRedeployable: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("deployment_not_redeployable", "user", message, details),
  deploymentNotRetryable: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("deployment_not_retryable", "user", message, details),
  deploymentNotRollbackReady: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("deployment_not_rollback_ready", "user", message, details),
  deploymentRollbackCandidateNotFound: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError =>
    createError("deployment_rollback_candidate_not_found", "user", message, details),
  deploymentRecoveryStateStale: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("deployment_recovery_state_stale", "user", message, details),
  domainBindingProxyRequired: (
    details?: Record<string, string | number | boolean | null>,
  ): DomainError =>
    createError(
      "domain_binding_proxy_required",
      "user",
      "Durable domain bindings require an edge proxy",
      details,
    ),
  domainBindingContextMismatch: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("domain_binding_context_mismatch", "user", message, details),
  domainVerificationNotPending: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("domain_verification_not_pending", "user", message, details),
  domainOwnershipUnverified: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("domain_ownership_unverified", "user", message, details),
  dnsLookupFailed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = true,
  ): DomainError => createError("dns_lookup_failed", "retryable", message, details, retryable),
  certificateNotAllowed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("certificate_not_allowed", "user", message, details),
  certificateImportNotAllowed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("certificate_import_not_allowed", "user", message, details),
  certificateAttemptConflict: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("certificate_attempt_conflict", "user", message, details),
  certificateImportDomainMismatch: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("certificate_import_domain_mismatch", "user", message, details),
  certificateImportKeyMismatch: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("certificate_import_key_mismatch", "user", message, details),
  certificateImportExpired: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("certificate_import_expired", "user", message, details),
  certificateImportNotYetValid: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("certificate_import_not_yet_valid", "user", message, details),
  certificateImportUnsupportedAlgorithm: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError =>
    createError("certificate_import_unsupported_algorithm", "user", message, details),
  certificateImportMalformedChain: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("certificate_import_malformed_chain", "user", message, details),
  certificateProviderUnavailable: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = true,
  ): DomainError =>
    createError("certificate_provider_unavailable", "provider", message, details, retryable),
  defaultAccessProviderUnavailable: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = true,
  ): DomainError =>
    createError("default_access_provider_unavailable", "provider", message, details, retryable),
  defaultAccessPolicyConflict: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("default_access_policy_conflict", "user", message, details),
  certificateStorageFailed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = true,
  ): DomainError => createError("certificate_storage_failed", "infra", message, details, retryable),
  certificateImportStorageFailed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = true,
  ): DomainError =>
    createError("certificate_import_storage_failed", "infra", message, details, retryable),
  certificateRetryNotAllowed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("certificate_retry_not_allowed", "user", message, details),
  certificateRevokeNotAllowed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("certificate_revoke_not_allowed", "user", message, details),
  certificateRevokeFailed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = true,
  ): DomainError =>
    createError("certificate_revoke_failed", "provider", message, details, retryable),
  certificateDeleteNotAllowed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("certificate_delete_not_allowed", "user", message, details),
  proxyProviderUnavailable: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = true,
  ): DomainError =>
    createError("proxy_provider_unavailable", "provider", message, details, retryable),
  proxyConfigurationRenderFailed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = true,
  ): DomainError =>
    createError("proxy_configuration_render_failed", "provider", message, details, retryable),
  proxyRouteNotResolved: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = true,
  ): DomainError =>
    createError("proxy_route_not_resolved", "provider", message, details, retryable),
  runtimeTargetUnsupported: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("runtime_target_unsupported", "provider", message, details),
  resourceNetworkProfileMissing: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("resource_network_profile_missing", "user", message, details),
  infra: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("infra_error", "infra", message, details),
  provider: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = false,
  ): DomainError => createError("provider_error", "provider", message, details, retryable),
  providerCapabilityUnsupported: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("provider_capability_unsupported", "provider", message, details),
  dependencyResourceProviderDeleteFailed: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
    retryable = true,
  ): DomainError =>
    createError(
      "dependency_resource_provider_delete_failed",
      "provider",
      message,
      details,
      retryable,
    ),
  retryable: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("retryable_error", "retryable", message, details, true),
  timeout: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("timeout", "timeout", message, details, true),
};
