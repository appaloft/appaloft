# account.sessions.list Query Spec

## Purpose

`account.sessions.list` reads safe active session metadata for the signed-in account.

## Status

- Active under [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md).
- HTTP/oRPC and Web transports are active behind product-session authorization.

## Input

No business input is required. The signed-in product account is resolved from execution context.

## Public Transport

- HTTP/OpenAPI: `GET /api/account/sessions`
- oRPC: `account.listSessions`
- CLI: not exposed in this slice.

## Rules

1. The query requires a valid product session.
2. The query returns only sessions owned by the signed-in user.
3. Current session may be marked when the adapter can identify it.
4. Session tokens, cookies, provider account tokens, and raw auth payloads must never be returned.

## Output

Each item includes `sessionId`, `userId`, `createdAt`, `expiresAt`, optional `ipAddress`,
`userAgent`, `current`, and `lastActiveAt`.

## Errors

- `product_auth_missing`, phase `account-sessions-list`, no valid product session.
- `product_auth_invalid`, phase `account-sessions-list`, adapter could not list sessions safely.

## Related Specs

- [account.sessions.revoke](../commands/account.sessions.revoke.md)
- [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md)
- [Account And Organization Settings](../specs/091-account-and-organization-settings/spec.md)
