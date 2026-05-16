# resources.secrets.list Query Spec

`resources.secrets.list` reads masked Resource-owned secret references.

## Operation

- Operation key: `resources.secrets.list`
- Query: `ListResourceSecretReferencesQuery`
- Input schema: `ListResourceSecretReferencesQueryInput`
- Test matrix: `RES-SECRET-CRUD-004`, `RES-SECRET-CRUD-007`, `RES-SECRET-CRUD-009`

## Output

The query returns `schemaVersion = "resources.secrets.list/v1"`, `resourceId`, `generatedAt`, and
`items[]`. Each item includes `resourceId`, `key`, `scope = "resource"`, `exposure`, `kind =
"secret"`, `isSecret = true`, `updatedAt`, and `value = "****"`.

The query must never return raw secret values.

## Entrypoints

| Surface | Contract |
| --- | --- |
| CLI | `appaloft resource secrets list <resourceId> [--exposure runtime]` |
| HTTP/oRPC | `GET /api/resources/{resourceId}/secrets` |
| Web | Uses the same query for masked secret-reference lists. |
| Future MCP tools | Expose the query with the same masked output. |

