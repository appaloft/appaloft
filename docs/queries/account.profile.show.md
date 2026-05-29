# account.profile.show Query Spec

## Purpose

`account.profile.show` reads safe display metadata for the signed-in product account. It is an
Appaloft account settings query, not a Better Auth route or table contract.

## Status

- Active under [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md).
- HTTP/oRPC and Web transports are active behind product-session authorization.

## Input

No business input is required. The signed-in product account is resolved from execution context.

## Public Transport

- HTTP/OpenAPI: `GET /api/account/profile`
- oRPC: `account.showProfile`
- CLI: not exposed in this slice.

## Rules

1. The query requires a valid product session.
2. Missing sessions return `product_auth_missing`/`401`.
3. The query returns only safe account metadata.
4. It must not expose session tokens, cookies, OAuth account tokens, provider payloads, invite
   secrets, or Better Auth table shapes.

## Output

| Field | Meaning |
| --- | --- |
| `userId` | Signed-in product user id. |
| `email` | Account email address. |
| `displayName` | Optional display name. |
| `avatarUrl` | Optional avatar/image URL. |
| `emailVerified` | Optional email verification state. |
| `createdAt` / `updatedAt` | Optional safe timestamps. |

## Errors

- `product_auth_missing`, phase `account-profile-show`, no valid product session.
- `product_auth_invalid`, phase `account-profile-show`, session could not be read safely.

## Related Specs

- [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md)
- [Account And Organization Settings](../specs/091-account-and-organization-settings/spec.md)
- [Self-Hosted Product Auth Test Matrix](../testing/self-hosted-product-auth-test-matrix.md)
