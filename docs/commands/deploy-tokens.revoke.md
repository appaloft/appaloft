# deploy-tokens.revoke Command Spec

## Normative Contract

`deploy-tokens.revoke` marks a deploy token revoked so future Action requests using that token fail
authentication before mutation.

The command is active through the admin-protected HTTP/oRPC route
`POST /api/deploy-tokens/{tokenId}/revoke`. CLI, Web, and future MCP management surfaces remain
later Phase 8 work and must reuse this command schema.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `tokenId` | Required | Deploy token id. |
| `organizationId` | Required | Owning organization boundary. |
| `confirmation.tokenId` | Required | Explicit confirmation of the token being revoked. |
| `reason` | Optional | Safe operator-visible reason. |
| `idempotencyKey` | Optional | Idempotency key for retried revoke requests. |

## Output

Success returns:

```ts
{
  tokenId: string;
  revokedAt: string;
}
```

## Admission Rules

1. The actor must be allowed to manage deploy tokens for the organization.
2. The token must exist and be visible.
3. Revocation is idempotent when the token is already revoked for the same organization and actor
   visibility.
4. Revocation must make future Action authentication fail with `action_auth_invalid`.

## Errors

- `not_found`, phase `deploy-token-revocation`, token is absent or not visible.
- `validation_error`, phase `deploy-token-revocation`, confirmation is missing or mismatched.
- `deploy_token_revoke_blocked`, phase `deploy-token-revocation`, token cannot be revoked.
- `infra_error`, phase `deploy-token-revocation`, persistence failed.

## References

- [ADR-043](../decisions/ADR-043-self-hosted-action-deploy-token-authorization.md)
- [Self-Hosted Action Deploy Token Auth](../specs/052-self-hosted-action-deploy-token-auth/spec.md)
- [Self-Hosted Auth Test Matrix](../testing/self-hosted-auth-test-matrix.md)
