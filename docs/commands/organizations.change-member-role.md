# organizations.change-member-role Command Spec

## Purpose

`organizations.change-member-role` changes an existing non-owner organization member's non-owner
role. Ownership changes are not role updates; they use `organizations.transfer-owner`.

## Status

- Accepted candidate under
  [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md).
- HTTP/oRPC and CLI transports are active behind product-session authorization. Web and
  task-oriented public docs remain Phase 8 follow-up work.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `organizationId` | Yes | Organization that owns the member. |
| `memberId` | Yes | Member whose role changes. |
| `role` | Yes | New organization role. |
| `idempotencyKey` | No | Entrypoint idempotency key for retry-safe role updates. |

## Public Transport

- HTTP/OpenAPI: `POST /api/organizations/{organizationId}/members/{memberId}/role`
- oRPC: `organizations.updateMemberRole`
- CLI: `appaloft organization member role <memberId>`

## Rules

1. The actor must be allowed to manage roles in the organization.
2. Missing sessions return `product_auth_missing`/`401`.
3. Non-members or insufficient roles return `product_auth_forbidden`/`403`.
4. The target member must belong to the organization.
5. The new role must be a valid non-owner Appaloft organization role.
6. The target member must not be an owner; owner role changes use ownership transfer.
7. Better Auth or another auth runtime may persist the role change behind an Appaloft-owned port,
   but application semantics stay Appaloft-owned.

## Output

| Field | Meaning |
| --- | --- |
| `memberId` | Changed member id. |
| `organizationId` | Owning organization id. |
| `role` | New role. |
| `updatedAt` | Role change timestamp. |

## Errors

- `product_auth_missing`, phase `organization-change-member-role`, no valid product session.
- `product_auth_forbidden`, phase `organization-change-member-role`, actor cannot change roles.
- `not_found`, phase `organization-change-member-role`, target member is absent or not visible.
- `validation_error`, phase `organization-change-member-role`, invalid role or attempted owner
  assignment.
- `invariant`, phase `organization-change-member-role`, target is an owner and must use ownership
  transfer.

## Related Specs

- [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md)
- [Self-Hosted Organization Team Operations](../specs/054-self-hosted-organization-team-operations/spec.md)
- [Identity Governance Test Matrix](../testing/identity-governance-test-matrix.md)
