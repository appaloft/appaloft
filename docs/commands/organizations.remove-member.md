# organizations.remove-member Command Spec

## Purpose

`organizations.remove-member` removes or deactivates a member from an organization while preserving
at least one owner.

## Status

- Accepted candidate under
  [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md).
- HTTP/oRPC and CLI transports are active behind product-session authorization. Web and
  task-oriented public docs remain Phase 8 follow-up work.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `organizationId` | Yes | Organization that owns the member. |
| `memberId` | Yes | Member to remove or deactivate. |
| `idempotencyKey` | No | Entrypoint idempotency key for retry-safe removal. |

## Public Transport

- HTTP/OpenAPI: `DELETE /api/organizations/{organizationId}/members/{memberId}`
- oRPC: `organizations.removeMember`
- CLI: `appaloft organization member remove <memberId>`

## Rules

1. The actor must be allowed to remove members from the organization.
2. Missing sessions return `product_auth_missing`/`401`.
3. Non-members or insufficient roles return `product_auth_forbidden`/`403`.
4. The target member must belong to the organization.
5. Removing or deactivating the target member must not leave the organization without an owner.
6. Removing self is allowed only when another owner remains and the governing Code Round confirms
   the UX/recovery behavior.
7. The command must not delete historical deployment, token, or audit metadata owned by other
   contexts.

## Output

| Field | Meaning |
| --- | --- |
| `memberId` | Removed member id. |
| `organizationId` | Owning organization id. |
| `removedAt` | Removal timestamp. |

## Errors

- `product_auth_missing`, phase `organization-remove-member`, no valid product session.
- `product_auth_forbidden`, phase `organization-remove-member`, actor cannot remove members.
- `not_found`, phase `organization-remove-member`, target member is absent or not visible.
- `invariant`, phase `organization-remove-member`, removal would remove the last owner.

## Related Specs

- [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md)
- [Self-Hosted Organization Team Operations](../specs/054-self-hosted-organization-team-operations/spec.md)
- [Identity Governance Test Matrix](../testing/identity-governance-test-matrix.md)
