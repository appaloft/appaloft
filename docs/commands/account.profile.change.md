# account.profile.change Command Spec

## Purpose

`account.profile.change` changes the signed-in account's display metadata. It is intentionally
narrow: email and password changes remain account-security behavior.

## Status

- Active under [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md).
- HTTP/oRPC and Web transports are active behind product-session authorization.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `displayName` | No | New display name. Empty input clears to provider-supported empty state. |
| `avatarUrl` | No | New avatar URL; `null` clears the stored image when supported. |
| `idempotencyKey` | No | Entrypoint idempotency key for retry-safe updates. |

At least one mutable profile field must be supplied.

## Public Transport

- HTTP/OpenAPI: `POST /api/account/profile`
- oRPC: `account.changeProfile`
- CLI: not exposed in this slice.

## Rules

1. The command requires a valid product session.
2. The command updates only display name and avatar URL for the signed-in user.
3. It must not update email, password, sessions, organizations, provider accounts, or security
   policy.
4. It returns the same safe read model as `account.profile.show`.
5. Better Auth-specific update APIs may be used only inside the auth adapter.

## Output

Safe `AccountProfileResponse`.

## Errors

- `product_auth_missing`, phase `account-profile-change`, no valid product session.
- `validation_error`, phase `account-profile-change`, invalid avatar URL or empty update payload.
- `product_auth_invalid`, phase `account-profile-change`, adapter could not change profile safely.

## Related Specs

- [account.profile.show](../queries/account.profile.show.md)
- [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md)
- [Account And Organization Settings](../specs/091-account-and-organization-settings/spec.md)
