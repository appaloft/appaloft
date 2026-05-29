# account.sessions.revoke Command Spec

## Purpose

`account.sessions.revoke` revokes one session that belongs to the signed-in account.

## Status

- Active under [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md).
- HTTP/oRPC and Web transports are active behind product-session authorization.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `sessionId` | Yes | Safe session id from `account.sessions.list`. |
| `idempotencyKey` | No | Entrypoint idempotency key for retry-safe revoke. |

## Public Transport

- HTTP/OpenAPI: `POST /api/account/sessions/{sessionId}/revoke`
- oRPC: `account.revokeSession`
- CLI: not exposed in this slice.

## Rules

1. The command requires a valid product session.
2. The target session must belong to the signed-in user.
3. Revocation is executed through the auth adapter.
4. The result returns only `sessionId` and `revokedAt`; it must not return session token material.

## Output

| Field | Meaning |
| --- | --- |
| `sessionId` | Revoked safe session id. |
| `revokedAt` | Timestamp when the revoke command completed. |

## Errors

- `product_auth_missing`, phase `account-session-revoke`, no valid product session.
- `product_auth_forbidden`, phase `account-session-revoke`, target session is absent or not owned
  by the signed-in user.
- `product_auth_invalid`, phase `account-session-revoke`, adapter could not revoke the session.

## Related Specs

- [account.sessions.list](../queries/account.sessions.list.md)
- [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md)
- [Account And Organization Settings](../specs/091-account-and-organization-settings/spec.md)
