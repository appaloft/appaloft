# deploy-tokens.list Query Spec

## Normative Contract

`deploy-tokens.list` reads safe deploy-token metadata for an organization. It never returns raw token
values, verifier digests, bearer headers, or secret material.

The query is active through the admin-protected HTTP/oRPC route `GET /api/deploy-tokens`. CLI, Web,
and future MCP management surfaces remain later Phase 8 work and must reuse this query schema.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `organizationId` | Required | Organization whose tokens are listed. |
| `status` | Optional | Filter by `active` or `revoked`. Expired filtering remains a later computed-read enhancement. |
| `resourceId` | Optional | Filter tokens scoped to a resource. |
| `repositoryFullName` | Optional | Filter tokens scoped to a repository. |
| `limit` | Optional | Bounded page size. |

## Output

Each item includes:

- `tokenId`;
- `displayName`;
- lifecycle status;
- safe scope summary;
- `createdAt`;
- `lastUsedAt` when known;
- `rotatedAt` when known;
- `revokedAt` when known;
- `expiresAt` when set.

## Rules

- The actor must be allowed to inspect deploy tokens for the organization.
- Expired/revoked tokens remain visible as safe metadata for audit and cleanup.
- Raw token values and verifier material are never returned.

## References

- [ADR-043](../decisions/ADR-043-self-hosted-action-deploy-token-authorization.md)
- [Self-Hosted Auth Test Matrix](../testing/self-hosted-auth-test-matrix.md)
