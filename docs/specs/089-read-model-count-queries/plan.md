# Read Model Count Queries Plan

## Code Round

1. Add `CountResponse` contract and slice-specific count query messages, handlers, and query
   services.
2. Add `count` to the relevant read model ports.
3. Implement SQL aggregate count methods in PG/PGlite read-model adapters.
4. Register count query services in server and shell composition roots.
5. Expose count operations through the operation catalog and oRPC client/router.
6. Update the home dashboard to use count calls for numeric summaries.
7. Add regression tests that prove count queries do not call list and that the home page does not
   use list for pure totals.

## Verification

- `bun run --cwd apps/web check`
- `bun test packages/application/test/read-model-count-query.test.ts packages/orpc/test/project-lifecycle.http.test.ts apps/web/src/routes/home-count-query.test.ts packages/application/test/operation-catalog-boundary.test.ts`
