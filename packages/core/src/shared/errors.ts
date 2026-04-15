export type ErrorCategory = "user" | "infra" | "provider" | "retryable";

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
};
