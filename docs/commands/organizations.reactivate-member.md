# organizations.reactivate-member Command Spec

## Purpose

`organizations.reactivate-member` restores a previously deactivated organization member to active
membership without creating a replacement member row.

## Status

- Accepted candidate under
  [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md).
- HTTP/oRPC and CLI transports are active behind product-session authorization.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `organizationId` | Yes | Organization that owns the member. |
| `memberId` | Yes | Deactivated member to restore. |
| `idempotencyKey` | No | Entrypoint idempotency key for retry-safe restoration. |

## Public Transport

- HTTP/OpenAPI: `POST /api/organizations/{organizationId}/members/{memberId}/reactivate`
- oRPC: `organizations.reactivateMember`
- CLI: `appaloft organization member restore <memberId>`

## Rules

1. The actor must be allowed to manage members in the organization.
2. Missing sessions return `product_auth_missing`/`401`.
3. Non-members or insufficient roles return `product_auth_forbidden`/`403`.
4. The target member must belong to the organization.
5. The target member must be deactivated; active members are not restored again.
6. Restoration changes membership status only and must not create a duplicate member row.

## Output

Returns the restored organization member summary, including `memberId`, `userId`, `role`,
`joinedAt`, and `status: "active"` when the backing auth store exposes membership lifecycle state.

## Errors

- `product_auth_missing`, phase `organization-reactivate-member`, no valid product session.
- `product_auth_forbidden`, phase `organization-reactivate-member`, actor cannot manage members.
- `not_found`, phase `organization-reactivate-member`, target member is absent or not visible.
- `invariant`, phase `organization-reactivate-member`, target member is already active.

## Related Specs

- [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md)
- [Self-Hosted Organization Team Operations](../specs/054-self-hosted-organization-team-operations/spec.md)
- [Identity Governance Test Matrix](../testing/identity-governance-test-matrix.md)
