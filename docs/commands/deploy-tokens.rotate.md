# deploy-tokens.rotate Command Spec

## Normative Contract

`deploy-tokens.rotate` replaces the verifier for an existing deploy token and returns the new raw
token value only once. Rotation preserves the token's scopes unless a later explicit create or
configure operation changes token scope.

The command is active through the admin-protected HTTP/oRPC route
`POST /api/deploy-tokens/{tokenId}/rotate`. CLI, Web, and future MCP management surfaces remain
later Phase 8 work and must reuse this command schema.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `tokenId` | Required | Deploy token id. |
| `organizationId` | Required | Owning organization boundary. |
| `confirmation.tokenId` | Required | Explicit confirmation of the token being rotated. |
| `idempotencyKey` | Optional | Idempotency key for retried rotate requests. |

## Output

Success returns:

```ts
{
  tokenId: string;
  token: string;
  rotatedAt: string;
  scopes: DeployTokenScopeSummary;
}
```

`token` is the only raw token output and must not appear in read models, logs, errors, or events.

## Admission Rules

1. The actor must be allowed to manage deploy tokens for the organization.
2. The token must exist and be active or expired-but-rotatable under the accepted policy.
3. A revoked token cannot be rotated; create a new token instead.
4. The first Code Round uses immediate old-verifier invalidation unless ADR-043 is updated with an
   explicit grace policy.

## Errors

- `not_found`, phase `deploy-token-rotation`, token is absent or not visible.
- `validation_error`, phase `deploy-token-rotation`, confirmation is missing or mismatched.
- `deploy_token_rotation_blocked`, phase `deploy-token-rotation`, token is revoked or not rotatable.
- `infra_error`, phase `deploy-token-rotation`, verifier persistence failed.

## References

- [ADR-043](../decisions/ADR-043-self-hosted-action-deploy-token-authorization.md)
- [Self-Hosted Action Deploy Token Auth](../specs/052-self-hosted-action-deploy-token-auth/spec.md)
- [Self-Hosted Auth Test Matrix](../testing/self-hosted-auth-test-matrix.md)
