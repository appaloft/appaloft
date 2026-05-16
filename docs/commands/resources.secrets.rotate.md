# resources.secrets.rotate Command Spec

`resources.secrets.rotate` rotates the value of an existing Resource-owned secret reference.

## Operation

- Operation key: `resources.secrets.rotate`
- Command: `RotateResourceSecretReferenceCommand`
- Input schema: `RotateResourceSecretReferenceCommandInput`
- Test matrix: `RES-SECRET-CRUD-002`, `RES-SECRET-CRUD-006`, `RES-SECRET-CRUD-008`

## Behavior

The command loads the active Resource, finds the Resource-owned entry by `key` and `exposure`, and
requires that the existing entry is already `kind = "secret"` and `isSecret = true`. It replaces
the secret value, preserves Resource scope, returns only `{ resourceId, key, exposure }`, and
publishes `resource-secret-reference-rotated` without raw secret material.

## Entrypoints

| Surface | Contract |
| --- | --- |
| CLI | `appaloft resource secrets rotate <resourceId> <key> <value> [--exposure runtime]` |
| HTTP/oRPC | `POST /api/resources/{resourceId}/secrets/{key}` |
| Web | Uses the same operation for explicit secret rotation. |
| Future MCP tools | Expose the command with the same schema and masked result. |

