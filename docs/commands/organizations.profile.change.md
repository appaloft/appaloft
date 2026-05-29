# organizations.profile.change Command Spec

## Purpose

`organizations.profile.change` changes safe organization profile metadata.

## Status

- Active under [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md).
- HTTP/oRPC and Web transports are active behind admin-level product-session authorization.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `organizationId` | Yes | Organization being updated. |
| `name` | No | New organization display name. |
| `slug` | No | New organization slug. |
| `logoUrl` | No | New logo URL; `null` clears logo metadata when supported. |
| `idempotencyKey` | No | Entrypoint idempotency key for retry-safe updates. |

At least one mutable profile field must be supplied.

## Public Transport

- HTTP/OpenAPI: `POST /api/organizations/{organizationId}/profile`
- oRPC: `organizations.changeProfile`
- CLI: not exposed in this slice.

## Rules

1. The command requires a valid product session with admin/owner permission for the organization.
2. The command updates only name, slug, and logo URL.
3. It must not mutate members, invitations, deploy tokens, projects, resources, deployments,
   runtime state, audit state, or retained history.
4. Better Auth-specific APIs may be used only inside the auth adapter.

## Output

Safe `OrganizationProfileResponse`.

## Errors

- `product_auth_missing`, phase `organization-profile-change`, no valid product session.
- `product_auth_forbidden`, phase `organization-profile-change`, actor lacks permission.
- `validation_error`, phase `organization-profile-change`, invalid profile field.
- `product_auth_invalid`, phase `organization-profile-change`, adapter could not change safely.

## Related Specs

- [organizations.profile.show](../queries/organizations.profile.show.md)
- [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md)
- [Account And Organization Settings](../specs/091-account-and-organization-settings/spec.md)
