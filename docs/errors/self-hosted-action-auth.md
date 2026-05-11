# Self-Hosted Action Auth Error Spec

## Normative Contract

Self-hosted Action authentication and authorization failures are admission failures. They reject the
HTTP/oRPC request before downstream source-link, resource, route, preview, or deployment mutations.

Errors must not expose raw bearer tokens, token verifier values, GitHub secret names with values,
private repository secrets, source package raw payloads, or credential-bearing headers.

## Error Codes

| Code | Category | HTTP | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- | --- |
| `action_auth_missing` | `permission` | `401` | `action-authentication` | No | The Action mutation endpoint requires a bearer deploy token and none was supplied. |
| `action_auth_invalid` | `permission` | `401` | `action-authentication` | No | The supplied token is malformed, unknown, expired, revoked, or cannot be verified. |
| `action_auth_forbidden` | `permission` | `403` | `action-authorization` | No | The token is valid but its scopes do not authorize the requested endpoint, project, environment, resource, repository, preview workflow, or command. |
| `deploy_token_bootstrap_failed` | `infra` | `500` or `503` | `deploy-token-bootstrap` | Conditional | The installer or backend could not create or persist the initial deploy token verifier. |
| `deploy_token_rotation_blocked` | `conflict` | `409` | `deploy-token-rotation` | No | The requested token cannot be rotated because it is revoked, missing, or not visible to the actor. |
| `deploy_token_revoke_blocked` | `conflict` | `409` | `deploy-token-revocation` | No | The requested token cannot be revoked because it is already revoked, missing, or not visible to the actor. |

## Required Details

`action_auth_missing`:

- `endpoint`
- `requiredCredential = deploy-token`

`action_auth_invalid`:

- `endpoint`
- `reasonCode` from `malformed`, `unknown`, `expired`, `revoked`, `verifier-unavailable`

`action_auth_forbidden`:

- `endpoint`
- `tokenId` when known
- `organizationId` when known
- safe requested scope fields such as `projectId`, `environmentId`, `resourceId`,
  `repositoryFullName`, `previewKind`, or `workflowCommand`
- `missingScope` or `blockedReasonCode`

Token lifecycle errors:

- safe token id when known
- actor id or actor kind when known
- phase
- retry hint only when persistence or infrastructure failure is retriable

## Consumer Mapping

- HTTP/oRPC maps missing and invalid tokens to `401` and scope mismatch to `403`.
- CLI/deploy-action wrapper should present setup guidance for `401` and scope guidance for `403`
  without printing token values.
- Web should not display token management affordances until the current user/session authorization
  policy allows them.

## Tests

See [Self-Hosted Auth Test Matrix](../testing/self-hosted-auth-test-matrix.md).
