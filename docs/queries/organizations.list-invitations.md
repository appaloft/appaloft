# organizations.list-invitations Query Spec

## Purpose

`organizations.list-invitations` reads safe pending invitation metadata for an organization. It is
used by operators to audit outstanding invitations and retry or cancel them in later slices.

## Status

- Accepted candidate under
  [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md).
- HTTP/oRPC and CLI transports are active behind product-session authorization. Web and
  task-oriented public docs remain Phase 8 follow-up work.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `organizationId` | Yes | Organization whose invitations are listed. |
| `status` | No | Optional filter such as `pending`, `accepted`, `expired`, or `revoked` when supported. |
| `limit` | No | Bounded page size. |
| `cursor` | No | Pagination cursor. |

## Public Transport

- HTTP/OpenAPI: `GET /api/organizations/{organizationId}/invitations`
- oRPC: `organizations.listInvitations`
- CLI: `appaloft organization invitations list`

## Rules

1. The actor must be allowed to manage or inspect organization invitations.
2. Missing sessions return `product_auth_missing`/`401`.
3. Non-members or insufficient roles return `product_auth_forbidden`/`403`.
4. The query returns safe invitation metadata only.
5. Raw invite tokens, invite links with secrets, provider payloads, email verification tokens, and
   Better Auth table shapes must not be returned by ordinary read models.

## Output

Each item includes:

- `invitationId`;
- invited email address;
- intended role;
- safe lifecycle status;
- created timestamp;
- expires timestamp when known;
- inviter safe metadata when available.

## Related Specs

- [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md)
- [Self-Hosted Organization Team Operations](../specs/054-self-hosted-organization-team-operations/spec.md)
- [Self-Hosted Product Auth Test Matrix](../testing/self-hosted-product-auth-test-matrix.md)
