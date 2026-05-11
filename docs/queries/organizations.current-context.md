# organizations.current-context Query Spec

## Purpose

`organizations.current-context` reads the safe current user and current organization context for a
signed-in product session. It is the canonical read model for Web console chrome, CLI login
diagnostics, HTTP/oRPC clients, and future MCP tools that need to know which organization role is
active before dispatching business operations.

## Status

- Accepted candidate under
  [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md).
- HTTP/oRPC and CLI transports are active behind product-session authorization. Web and
  task-oriented public docs remain Phase 8 follow-up work.

## Input

No business input is required. The current product session comes from execution context. Entrypoints
may pass an optional preferred organization id through session/request context, not through
repository config or deployment input.

## Public Transport

- HTTP/OpenAPI: `GET /api/organizations/current-context`
- oRPC: `organizations.currentContext`
- CLI: `appaloft organization context`

## Rules

1. The query requires a valid product session.
2. Missing sessions return `product_auth_missing`/`401`.
3. A signed-in user with no visible organization returns `product_auth_forbidden`/`403` or a safe
   no-organization state only if the governing Code Round explicitly records that behavior.
4. The query returns safe user, organization, role, and login-method metadata only.
5. It must not expose session tokens, cookies, OAuth account tokens, invitation secrets, provider
   payloads, deploy-token raw values, or Better Auth table shapes.

## Output

| Field | Meaning |
| --- | --- |
| `user` | Safe current user id, email, display name, and avatar URL when available. |
| `currentOrganization` | Safe organization id, name, slug, and current role. |
| `organizations` | Safe selectable organizations visible to the user. |
| `loginMethods` | Safe summary of local password and configured OAuth providers. |
| `permissions` | Optional coarse capability flags for UI affordances, derived from Appaloft role policy. |

## Errors

- `product_auth_missing`, phase `organization-current-context`, no valid product session.
- `product_auth_forbidden`, phase `organization-current-context`, no visible organization or role.

## Related Specs

- [ADR-045](../decisions/ADR-045-self-hosted-organization-team-operations.md)
- [Self-Hosted Organization Team Operations](../specs/054-self-hosted-organization-team-operations/spec.md)
- [Self-Hosted Product Auth Errors](../errors/self-hosted-product-auth.md)
