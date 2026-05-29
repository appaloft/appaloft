# account.delete Command Spec

## Purpose

`account.delete` deletes the signed-in account through an explicit account danger-zone flow.

## Status

- Active under [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md).
- HTTP/oRPC and Web transports are active behind product-session authorization.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `confirmation.userId` | Yes | Exact signed-in user id required to confirm deletion. |
| `idempotencyKey` | No | Entrypoint idempotency key for retry-safe deletion. |

## Public Transport

- HTTP/OpenAPI: `DELETE /api/account`
- oRPC: `account.delete`
- CLI: not exposed in this slice.

## Rules

1. The command requires a valid product session.
2. `confirmation.userId` must exactly match the signed-in user id.
3. The auth adapter deletes the signed-in account.
4. Account deletion does not cascade organizations, projects, resources, deployments, deploy tokens,
   audit state, runtime state, or retained history.
5. The command returns only safe deletion metadata.

## Output

| Field | Meaning |
| --- | --- |
| `userId` | Deleted user id. |
| `deletedAt` | Timestamp when deletion completed. |

## Errors

- `product_auth_missing`, phase `account-delete`, no valid product session.
- `product_auth_forbidden`, phase `account-delete`, confirmation does not match signed-in user id.
- `product_auth_invalid`, phase `account-delete`, adapter could not delete the account safely.

## Related Specs

- [account.profile.show](../queries/account.profile.show.md)
- [ADR-081](../decisions/ADR-081-account-and-organization-settings-boundary.md)
- [Account And Organization Settings](../specs/091-account-and-organization-settings/spec.md)
