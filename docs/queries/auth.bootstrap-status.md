# auth.bootstrap-status Query Spec

## Purpose

`auth.bootstrap-status` reads safe self-hosted product-auth bootstrap status for installers, Web
onboarding, CLI, and HTTP clients.

## Status

- Accepted candidate under [ADR-044](../decisions/ADR-044-self-hosted-first-admin-bootstrap.md).
- Public HTTP/oRPC, CLI, installer, and Web bootstrap status transports are active.

## Input

No business input is required. Entrypoints may include locale/request metadata through execution
context.

## Public Transport

- HTTP/OpenAPI: `GET /api/bootstrap/auth/status`
- oRPC: `auth.bootstrapStatus`
- CLI: `appaloft auth bootstrap-status`

## Rules

1. The query is explicitly public because a new installer/Web onboarding flow must know whether
   first-admin setup is required.
2. The query returns only safe status and login method metadata.
3. It must not expose password material, session tokens, OAuth client secrets, account tokens, or
   deploy-token raw values.
4. OAuth providers may be reported as disabled/configured/connected only through safe booleans and
   setup hints.

## Output

| Field | Meaning |
| --- | --- |
| `bootstrapRequired` | Whether first-admin setup is still needed. |
| `firstAdminConfigured` | Whether a local first-admin/organization owner exists. |
| `organizationConfigured` | Whether the initial organization exists. |
| `loginUrl` | Console login URL when known. |
| `loginMethods` | Safe summary of local password and configured OAuth providers. |
| `nextSteps` | Safe operator guidance keys or short machine-readable hints. |

## Errors

- `first_admin_bootstrap_failed`, phase `first-admin-bootstrap-status`, status cannot be read.

## Related Specs

- [ADR-044](../decisions/ADR-044-self-hosted-first-admin-bootstrap.md)
- [Self-Hosted First Admin Bootstrap](../specs/053-self-hosted-first-admin-bootstrap/spec.md)
- [Self-Hosted Product Auth Errors](../errors/self-hosted-product-auth.md)
