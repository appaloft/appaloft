# organizations.transfer-owner Command Spec

## Purpose

`organizations.transfer-owner` transfers organization ownership from one owner member to another
active organization member. It is the only Appaloft command for changing the owner role.

## Status

- Accepted candidate under
  [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md).
- HTTP/oRPC, CLI, and Web transports are active behind product-session authorization.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `organizationId` | Yes | Organization that owns both members. |
| `fromMemberId` | Yes | Current owner member transferring ownership. |
| `toMemberId` | Yes | Active member that becomes the new owner. |
| `idempotencyKey` | No | Entrypoint idempotency key for retry-safe ownership transfer. |

## Public Transport

- HTTP/OpenAPI: `POST /api/organizations/{organizationId}/owner-transfer`
- oRPC: `organizations.transferOwner`
- CLI: `appaloft organization owner transfer <fromMemberId> <toMemberId>`
- Web: `/organization/members` owner row transfer control

## Rules

1. The actor must be allowed to transfer organization ownership.
2. Missing sessions return `product_auth_missing`/`401`.
3. Non-members or insufficient roles return `product_auth_forbidden`/`403`.
4. `fromMemberId` and `toMemberId` must both belong to the organization.
5. `fromMemberId` must currently be an owner.
6. `toMemberId` must be a different active member.
7. On success, `toMemberId` becomes owner and `fromMemberId` becomes admin.
8. Generic role update and member removal commands must not be used to change or remove owners.

## Output

| Field | Meaning |
| --- | --- |
| `fromMember` | Previous owner after transfer, expected role `admin`. |
| `toMember` | New owner after transfer, expected role `owner`. |
| `transferredAt` | Transfer timestamp. |

## Errors

- `product_auth_missing`, phase `organization-transfer-owner`, no valid product session.
- `product_auth_forbidden`, phase `organization-transfer-owner`, actor cannot transfer ownership.
- `not_found`, phase `organization-transfer-owner`, source or target member is absent or not visible.
- `validation_error`, phase `organization-transfer-owner`, source and target are the same member.
- `invariant`, phase `organization-transfer-owner`, source member is not an owner.

## Related Specs

- [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md)
- [Self-Hosted Organization Team Operations](../specs/054-self-hosted-organization-team-operations/spec.md)
- [Self-Hosted Product Auth Errors](../errors/self-hosted-product-auth.md)
