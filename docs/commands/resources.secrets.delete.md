# resources.secrets.delete Command Spec

`resources.secrets.delete` removes one existing Resource-owned secret reference.

## Operation

- Operation key: `resources.secrets.delete`
- Command: `DeleteResourceSecretReferenceCommand`
- Input schema: `DeleteResourceSecretReferenceCommandInput`
- Test matrix: `RES-SECRET-CRUD-003`, `RES-SECRET-CRUD-006`, `RES-SECRET-CRUD-008`

## Behavior

The command loads the active Resource, requires an existing Resource-owned secret entry for
`key` and `exposure`, deletes only that entry, returns `{ resourceId, key, exposure }`, and
publishes `resource-secret-reference-deleted`. It does not delete environment-level secrets,
dependency binding secrets, certificate material, deployment snapshots, or provider-native secret
stores.

## Entrypoints

| Surface | Contract |
| --- | --- |
| CLI | `appaloft resource secrets delete <resourceId> <key> [--exposure runtime]` |
| HTTP/oRPC | `DELETE /api/resources/{resourceId}/secrets/{key}` |
| Web | Uses the same operation for explicit secret removal. |
| Future MCP tools | Expose the command with the same schema and masked result. |

