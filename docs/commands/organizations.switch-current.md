# organizations.switch-current Command Spec

## Purpose

`organizations.switch-current` selects an organization already visible to the signed-in product user
as the current organization for the active product session. It is the canonical mutation behind Web
organization switching, CLI context switching, HTTP/oRPC clients, and future MCP tools that need to
change product-session organization context.

The command is an Appaloft organization-context operation, not a Better Auth route contract. Better
Auth may provide the runtime active-organization write inside `@appaloft/auth-better`, but core,
application messages, transport contracts, Web, CLI, and docs must remain Appaloft-owned.

## Status

- Accepted candidate under
  [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md).
- Active through the application command/use case, operation catalog, HTTP/oRPC route, CLI command,
  Web `/organization` switch control, public docs, and `ORG-TEAM-SWITCH-001` automation.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `organizationId` | Yes | Organization to select as current for the signed-in product session. |
| `idempotencyKey` | No | Entrypoint idempotency key for retry-safe selection when a client retries. |

The product session comes from execution context. The organization id must not come from repository
config, deployment input, source packages, query strings for mutation, or deploy-token credentials.

## Public Transport

- HTTP/OpenAPI: `POST /api/organizations/current-context/switch`
- oRPC: `organizations.switchCurrent`
- CLI: `appaloft organization switch <organizationId>`

## Rules

1. The command requires a valid product session.
2. Missing sessions return `product_auth_missing`/`401`.
3. The target organization must be visible to the signed-in user through organization membership.
4. Non-visible organizations return `product_auth_forbidden`/`403` before any downstream business
   mutation can use the selected context.
5. Selecting the already-current organization is idempotent and returns refreshed current context.
6. The command may delegate the active-organization write to the auth adapter through an
   Appaloft-owned port.
7. The command returns safe current-context metadata only.
8. It must not expose session tokens, cookies, OAuth account tokens, invitation secrets, provider
   payloads, deploy-token raw values, or Better Auth table shapes.

## Output

The command returns the same safe shape as `organizations.current-context` after the switch:

| Field | Meaning |
| --- | --- |
| `user` | Safe current user id, email, display name, and avatar URL when available. |
| `currentOrganization` | Selected organization id, name, slug, and current role. |
| `organizations` | Safe selectable organizations visible to the user. |
| `loginMethods` | Safe summary of local password and configured OAuth providers. |
| `permissions` | Optional coarse capability flags for UI affordances, derived from Appaloft role policy. |

## Errors

- `product_auth_missing`, phase `organization-switch-current`, no valid product session.
- `product_auth_forbidden`, phase `organization-switch-current`, target organization is not
  visible to the signed-in user or the session cannot select it.
- `validation_error`, phase `organization-switch-current`, invalid organization id.

## Related Specs

- [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md)
- [organizations.current-context](../queries/organizations.current-context.md)
- [Self-Hosted Organization Team Operations](../specs/054-self-hosted-organization-team-operations/spec.md)
- [Self-Hosted Product Auth Errors](../errors/self-hosted-product-auth.md)
