# organizations.delete Command Spec

## Purpose

`organizations.delete` deletes an organization identity record through an explicit organization
danger-zone flow.

## Status

- Active under [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md).
- HTTP/oRPC and Web transports are active behind owner-level product-session authorization.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `organizationId` | Yes | Organization being deleted. |
| `confirmation.organizationId` | Yes | Exact organization id required to confirm deletion. |
| `idempotencyKey` | No | Entrypoint idempotency key for retry-safe deletion. |

## Public Transport

- HTTP/OpenAPI: `DELETE /api/organizations/{organizationId}`
- oRPC: `organizations.delete`
- CLI: not exposed in this slice.

## Rules

1. The command requires a valid product session.
2. The actor must be an owner of the organization.
3. `confirmation.organizationId` must exactly match `organizationId`.
4. The auth adapter deletes organization identity/profile/membership/invitation state where
   supported.
5. Deletion does not cascade Appaloft projects, resources, deployments, deploy tokens, runtime
   state, audit state, or retained history.

## Output

| Field | Meaning |
| --- | --- |
| `organizationId` | Deleted organization id. |
| `deletedAt` | Timestamp when deletion completed. |

## Errors

- `product_auth_missing`, phase `organization-delete`, no valid product session.
- `product_auth_forbidden`, phase `organization-delete`, actor is not owner or confirmation
  mismatches.
- `product_auth_invalid`, phase `organization-delete`, adapter could not delete safely.

## Related Specs

- [organizations.profile.show](../queries/organizations.profile.show.md)
- [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md)
- [Account And Organization Settings](../specs/091-account-and-organization-settings/spec.md)
