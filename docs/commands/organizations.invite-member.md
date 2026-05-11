# organizations.invite-member Command Spec

## Purpose

`organizations.invite-member` creates a safe organization invitation for an email address and target
role. It is an Appaloft organization/team command, not a Better Auth route contract.

## Status

- Accepted candidate under
  [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md).
- HTTP/oRPC and CLI transports are active behind product-session authorization. Web and
  task-oriented public docs remain Phase 8 follow-up work.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `organizationId` | Yes | Organization that owns the invitation. |
| `email` | Yes | Email address to invite. |
| `role` | Yes | Organization role to grant after acceptance. |
| `idempotencyKey` | No | Entrypoint idempotency key for retry-safe invite creation. |

## Public Transport

- HTTP/OpenAPI: `POST /api/organizations/{organizationId}/invitations`
- oRPC: `organizations.inviteMember`
- CLI: `appaloft organization member invite`

## Rules

1. The actor must be allowed to invite members into the organization.
2. Missing sessions return `product_auth_missing`/`401`.
3. Non-members or insufficient roles return `product_auth_forbidden`/`403`.
4. The target email must not already be an active member of the organization.
5. The target role must be a valid Appaloft organization role and must not exceed the actor's
   management permissions.
6. The application delegates provider-specific invitation mechanics to an Appaloft-owned
   organization/team port.
7. Raw invite tokens or provider-specific invite secrets are not returned by ordinary API/CLI/Web
   read models.

## Output

| Field | Meaning |
| --- | --- |
| `invitationId` | Safe invitation id. |
| `organizationId` | Owning organization id. |
| `email` | Invited email address. |
| `role` | Intended organization role. |
| `status` | Safe invitation lifecycle status. |
| `expiresAt` | Expiration timestamp when known. |

## Errors

- `product_auth_missing`, phase `organization-invite-member`, no valid product session.
- `product_auth_forbidden`, phase `organization-invite-member`, actor cannot invite members.
- `validation_error`, phase `organization-invite-member`, invalid email or role.
- `conflict`, phase `organization-invite-member`, active member or active duplicate invitation
  already exists.

## Related Specs

- [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md)
- [Self-Hosted Organization Team Operations](../specs/054-self-hosted-organization-team-operations/spec.md)
- [Self-Hosted Product Auth Errors](../errors/self-hosted-product-auth.md)
