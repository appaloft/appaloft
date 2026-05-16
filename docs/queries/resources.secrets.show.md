# resources.secrets.show Query Spec

`resources.secrets.show` reads one masked Resource-owned secret reference.

## Operation

- Operation key: `resources.secrets.show`
- Query: `ShowResourceSecretReferenceQuery`
- Input schema: `ShowResourceSecretReferenceQueryInput`
- Test matrix: `RES-SECRET-CRUD-005`, `RES-SECRET-CRUD-007`, `RES-SECRET-CRUD-009`

## Output

The query returns `schemaVersion = "resources.secrets.show/v1"`, `generatedAt`, and `secret`.
`secret.value` is always `"****"`. Raw secret material is not returned through CLI, HTTP/oRPC,
Web, public docs examples, or future MCP tools.

## Entrypoints

| Surface | Contract |
| --- | --- |
| CLI | `appaloft resource secrets show <resourceId> <key> [--exposure runtime]` |
| HTTP/oRPC | `GET /api/resources/{resourceId}/secrets/{key}` |
| Web | Uses the same query for masked detail. |
| Future MCP tools | Expose the query with the same masked output. |

