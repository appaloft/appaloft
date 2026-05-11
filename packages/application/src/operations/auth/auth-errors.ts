import { type DomainError } from "@appaloft/core";

export function firstAdminBootstrapDisabled(details?: { organizationId?: string }): DomainError {
  return {
    code: "first_admin_bootstrap_disabled",
    category: "user",
    message: "First admin bootstrap is already complete",
    retryable: false,
    details: {
      phase: "first-admin-bootstrap",
      ...(details?.organizationId ? { organizationId: details.organizationId } : {}),
    },
  };
}

export function firstAdminBootstrapFailed(message: string): DomainError {
  return {
    code: "first_admin_bootstrap_failed",
    category: "infra",
    message,
    retryable: true,
    details: {
      phase: "first-admin-bootstrap",
    },
  };
}
