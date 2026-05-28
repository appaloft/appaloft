# auth.bootstrap-first-admin Command Spec

## Purpose

`auth.bootstrap-first-admin` creates the first local administrator and initial organization owner for
a self-hosted Appaloft instance. It is a bootstrap command, not a general user-create operation.

## Status

- Accepted candidate under [ADR-044](../decisions/ADR-044-self-hosted-first-admin-bootstrap.md).
- Public HTTP/oRPC, CLI, installer, and Web bootstrap setup transports are active. Secret output
  remains one-time and trusted-output only.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `email` | Yes | First-admin login email. |
| `displayName` | Yes | First-admin display name. |
| `password` | No | Trusted installer-provided password. If absent, the application generates one-time output. |
| `organizationName` | No | Initial organization name. Defaults to self-hosted Appaloft organization vocabulary. |
| `organizationSlug` | No | Initial organization slug. Defaults from organization name when absent. |
| `idempotencyKey` | No | Entrypoint idempotency key for installer/bootstrap retries. |

## Public Transport

- HTTP/OpenAPI: `POST /api/bootstrap/auth/first-admin`
- oRPC: `auth.bootstrapFirstAdmin`
- CLI: `appaloft auth bootstrap-first-admin`

## Rules

1. The command may create a user and initial organization ownership only when bootstrap status says
   no first admin or organization owner exists.
2. The application layer delegates local user/password/session-provider work to an Appaloft-owned
   first-admin auth port.
3. The auth adapter must create or reuse the stable self-hosted organization tenant
   (`org_self_hosted`) so CLI/installer-created product data and HTTP product sessions share the
   same organization boundary.
4. Better Auth may implement that port, but command inputs/outputs must not expose Better Auth
   types.
5. A supplied or generated password is secret material. It is never logged, persisted in Appaloft
   read models, or returned after the initial successful bootstrap.
6. If password is omitted, generated password material is returned only once to trusted bootstrap
   output.
7. Re-running after bootstrap is complete returns a safe conflict/no-op outcome and does not create
   another user, organization, member, or password.

## Output

| Field | Meaning |
| --- | --- |
| `created` | Whether this command created the first admin in this invocation. |
| `bootstrapRequired` | `false` after successful creation. |
| `userId` | Safe product user id. |
| `email` | First-admin email. |
| `organizationId` | Initial organization id. |
| `organizationSlug` | Initial organization slug. |
| `loginUrl` | Console login URL when known. |
| `generatedPassword` | Present only when password was generated in this successful invocation. |
| `loginMethods` | Safe summary of local password and configured OAuth providers. |

## Errors

- `first_admin_bootstrap_disabled`, phase `first-admin-bootstrap`, bootstrap already complete.
- `first_admin_bootstrap_failed`, phase `first-admin-bootstrap`, auth adapter or persistence failed.
- `validation_error`, phase `first-admin-bootstrap`, invalid email/name/password input.

## Related Specs

- [ADR-044](../decisions/ADR-044-self-hosted-first-admin-bootstrap.md)
- [Self-Hosted First Admin Bootstrap](../specs/053-self-hosted-first-admin-bootstrap/spec.md)
- [Self-Hosted Product Auth Errors](../errors/self-hosted-product-auth.md)
