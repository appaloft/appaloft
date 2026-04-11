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
