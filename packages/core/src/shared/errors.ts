export type ErrorCategory = "user" | "infra" | "provider" | "retryable" | "timeout";

export interface DomainError {
  code: string;
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  details?: Record<string, string | number | boolean | null>;
}

function createError(
  code: string,
  category: ErrorCategory,
  message: string,
  details?: Record<string, string | number | boolean | null>,
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
  validation: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("validation_error", "user", message, details),
  invariant: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("invariant_violation", "user", message, details),
  notFound: (entity: string, id: string): DomainError =>
    createError("not_found", "user", `${entity} ${id} was not found`, {
      entity,
      id,
    }),
  conflict: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("conflict", "user", message, details),
  resourceContextMismatch: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("resource_context_mismatch", "user", message, details),
  resourceRuntimeLogsContextMismatch: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
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
  deploymentNotRedeployable: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("deployment_not_redeployable", "user", message, details),
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
  retryable: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("retryable_error", "retryable", message, details, true),
  timeout: (
    message: string,
    details?: Record<string, string | number | boolean | null>,
  ): DomainError => createError("timeout", "timeout", message, details, true),
};
