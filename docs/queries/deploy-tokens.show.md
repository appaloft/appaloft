# deploy-tokens.show Query Spec

## Normative Contract

`deploy-tokens.show` reads one deploy token's safe metadata, lifecycle state, and scope details. It
does not reveal raw token material or verifier values.

The query is active through the admin-protected HTTP/oRPC route `GET /api/deploy-tokens/{tokenId}`.
CLI, Web, and future MCP management surfaces remain later Phase 8 work and must reuse this query
schema.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `tokenId` | Required | Deploy token id. |
| `organizationId` | Required | Owning organization boundary. |

## Output

The output includes:

- `tokenId`;
- `displayName`;
- lifecycle status;
- complete safe scope summary;
- `createdAt`;
- `lastUsedAt` when known;
- `rotatedAt` when known;
- `revokedAt` when known;
- `expiresAt` when set.

## Errors

- `not_found`, phase `deploy-token-read`, token is absent or not visible.
- `action_auth_forbidden` or future product-auth equivalent, phase `deploy-token-read`, actor cannot
  inspect tokens in the organization.

## References

- [ADR-043](../decisions/ADR-043-self-hosted-action-deploy-token-authorization.md)
- [Self-Hosted Auth Test Matrix](../testing/self-hosted-auth-test-matrix.md)
