# organizations.list-members Query Spec

## Purpose

`organizations.list-members` reads safe organization member metadata for operators who can manage or
inspect the current organization team.

## Status

- Accepted candidate under
  [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md).
- HTTP/oRPC and CLI transports are active behind product-session authorization. Web and
  task-oriented public docs remain Phase 8 follow-up work.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `organizationId` | Yes | Organization whose members are listed. |
| `limit` | No | Bounded page size. |
| `cursor` | No | Pagination cursor. |

## Public Transport

- HTTP/OpenAPI: `GET /api/organizations/{organizationId}/members`
- oRPC: `organizations.listMembers`
- CLI: `appaloft organization members list`

## Rules

1. The actor must be a member of the organization with a role allowed to inspect members.
2. Missing sessions return `product_auth_missing`/`401`.
3. Non-members or insufficient roles return `product_auth_forbidden`/`403`.
4. The query returns safe member metadata only and must not expose auth-provider payloads.

## Output

Each item includes:

- `memberId`;
- `userId`;
- email and display name when safe to show;
- organization role;
- joined timestamp;
- status when the adapter distinguishes active and deactivated membership.

## Related Specs

- [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md)
- [Self-Hosted Organization Team Operations](../specs/054-self-hosted-organization-team-operations/spec.md)
- [Self-Hosted Product Auth Test Matrix](../testing/self-hosted-product-auth-test-matrix.md)
