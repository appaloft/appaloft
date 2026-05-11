# deploy-tokens.create Command Spec

## Normative Contract

`deploy-tokens.create` creates an organization-owned deploy token for self-hosted Action/API
automation and returns the raw token value only once.

The command is active through the admin-protected HTTP/oRPC route `POST /api/deploy-tokens`.
CLI, Web, and future MCP management surfaces remain later Phase 8 work and must reuse this command
schema instead of redefining token-management input.

Docker self-host installer bootstrap may also dispatch this command internally after first querying for
an existing active `org_self_hosted` token. That install-time handoff is not a public token
management transport; it prints the raw token once and leaves later rotation/revocation to the
authorized lifecycle surfaces.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `organizationId` | Required after first-admin bootstrap; installer bootstrap may derive it | Organization that owns the token. |
| `displayName` | Required | Operator-facing token label. |
| `scope.projectIds` | Optional | Projects this token may mutate. Empty means no project-specific grant unless the token has broader organization scope. |
| `scope.environmentIds` | Optional | Environments this token may mutate. |
| `scope.resourceIds` | Optional | Resources this token may mutate. |
| `scope.repositoryFullNames` | Optional | Source repositories this token may authenticate. |
| `scope.workflowCommands` | Required non-empty | Allowed Action workflow commands such as `source-link-deploy`, `server-config-deploy`, or `preview-cleanup`. |
| `expiresAt` | Optional | Expiration timestamp. |
| `idempotencyKey` | Optional | Idempotency key for retried create requests. |

## Output

Success returns:

```ts
{
  tokenId: string;
  token: string;
  displayName: string;
  scopes: DeployTokenScopeSummary;
  createdAt: string;
  expiresAt?: string;
}
```

`token` is the only raw token output and must not be stored in read models, logs, errors, or events.

## Admission Rules

1. The actor must be allowed to manage deploy tokens for the organization.
2. `displayName` must be non-empty and safe for display.
3. Scope fields must refer only to entities visible to the actor and inside the organization.
4. `workflowCommands` must include at least one accepted Action command.
5. The command generates raw token material, stores only a verifier/hash plus safe metadata, and
   returns the raw token once.

## Errors

- `validation_error`, phase `deploy-token-create`, invalid name, empty command scope, malformed
  expiration, or invalid scope shape.
- `action_auth_forbidden` or future product-auth equivalent, phase `deploy-token-create`, actor
  cannot manage tokens in the organization.
- `not_found`, phase `deploy-token-create`, referenced scoped entity is not visible.
- `deploy_token_bootstrap_failed`, phase `deploy-token-bootstrap`, installer/backend cannot persist
  the verifier.

## References

- [ADR-043](../decisions/ADR-043-self-hosted-action-deploy-token-authorization.md)
- [Self-Hosted Action Deploy Token Auth](../specs/052-self-hosted-action-deploy-token-auth/spec.md)
- [Self-Hosted Action API Authentication](../workflows/self-hosted-action-api-authentication.md)
- [Self-Hosted Auth Test Matrix](../testing/self-hosted-auth-test-matrix.md)
