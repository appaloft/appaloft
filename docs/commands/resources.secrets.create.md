# resources.secrets.create Command Spec

`resources.secrets.create` creates one Resource-owned secret reference for runtime configuration.
It is an explicit secret lifecycle command, not a generic variable update.

## Operation

- Operation key: `resources.secrets.create`
- Command: `CreateResourceSecretReferenceCommand`
- Input schema: `CreateResourceSecretReferenceCommandInput`
- Test matrix: `RES-SECRET-CRUD-001`, `RES-SECRET-CRUD-006`, `RES-SECRET-CRUD-008`

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `resourceId` | Yes | Resource that owns the secret reference. |
| `key` | Yes | Secret reference key. |
| `value` | Yes | Secret material accepted only at the command boundary. |
| `exposure` | Optional | Defaults to `runtime`. Build-time secret exposure is rejected by Resource config policy. |

## Behavior

1. Load the Resource by `resourceId`.
2. Reject archived or deleted Resources.
3. Reject an existing Resource-owned config entry with the same `key` and `exposure`.
4. Store the entry as `kind = "secret"`, `isSecret = true`, `scope = "resource"`.
5. Return only `{ resourceId, key, exposure }`.
6. Publish `resource-secret-reference-created` without raw secret material.

## Entrypoints

| Surface | Contract |
| --- | --- |
| CLI | `appaloft resource secrets create <resourceId> <key> <value> [--exposure runtime]` |
| HTTP/oRPC | `POST /api/resources/{resourceId}/secrets` |
| Web | Uses the same operation when Resource config exposes explicit secret-reference controls. |
| Future MCP tools | Expose the command with the same schema and never return raw `value`. |

