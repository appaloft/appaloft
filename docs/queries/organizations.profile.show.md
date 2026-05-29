# organizations.profile.show Query Spec

## Purpose

`organizations.profile.show` reads safe profile metadata for one organization visible to the
signed-in product user.

## Status

- Active under [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md).
- HTTP/oRPC and Web transports are active behind product-session authorization.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `organizationId` | Yes | Organization whose profile is read. |

## Public Transport

- HTTP/OpenAPI: `GET /api/organizations/{organizationId}/profile`
- oRPC: `organizations.showProfile`
- CLI: not exposed in this slice.

## Rules

1. The query requires a valid product session.
2. The user must be a visible member of the organization.
3. It returns only safe organization profile, role, permission, and timestamp metadata.
4. It must not expose provider payloads, invite secrets, session tokens, or Better Auth table
   shapes.

## Output

Safe `OrganizationProfileResponse`: `organizationId`, `name`, `slug`, `role`, optional
`permissions`, `logoUrl`, `createdAt`, and `updatedAt`.

## Errors

- `product_auth_missing`, phase `organization-profile-show`, no valid product session.
- `product_auth_forbidden`, phase `organization-profile-show`, organization is not visible to the
  signed-in user.

## Related Specs

- [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md)
- [Account And Organization Settings](../specs/091-account-and-organization-settings/spec.md)
- [Self-Hosted Product Auth Test Matrix](../testing/self-hosted-product-auth-test-matrix.md)
