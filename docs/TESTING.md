# Testing

## Pyramid

### Unit

Fast feedback for `core` and `application`.

Current examples:

- `packages/core/test/environment.test.ts`
- `packages/application/test/create-deployment.test.ts`

Allowed doubles:

- fake repositories
- fake clock/id generator
- fake event bus
- hermetic execution backend

### Integration

Real Postgres-compatible storage + Kysely.

Current example:

- `packages/persistence/pg/test/repositories.integration.test.ts`
- `packages/persistence/pg/test/pglite.integration.test.ts`

Scope:

- migrations
- schema compatibility
- repository persistence
- masked read models
- deployment snapshot persistence

### Contract

Adapter and manifest boundaries.

Current examples:

- `packages/plugins/sdk/test/manifest.test.ts`
- `packages/providers/core/test/registry.test.ts`
- `packages/integrations/github/test/github.test.ts`

### End-To-End

Real backend process + real CLI + real database backend.

Current examples:

- `apps/shell/test/e2e/cli-http.test.ts`
- `apps/shell/test/e2e/pglite-cli-http.test.ts`
- `apps/web/test/e2e/home.e2e.ts`

The shell E2E covers:

- `db migrate`
- `doctor`
- project/server/environment creation
- variable set/show
- diff/promote
- deploy
- log retrieval
- rollback
- provider/plugin listing
- HTTP API listing

## Fake Execution Backend

The fake runtime is stateful on purpose:

- emits logs by phase
- can succeed, fail, or rollback
- persists deployment state transitions
- reads deployment input and snapshot state

This is intentionally stronger than a stub that only returns `"success"`.

## Why Over-Mocking Is Not Acceptable

Deployment products are about state transitions, logs, rollback, and environment snapshots.
If tests bypass the runtime or write directly to the database to simulate success, they stop testing the actual product risk.

## GitHub Actions Mapping

- `ci.yml`
  - lint, typecheck, unit, integration, build, packaging, docker smoke
- `e2e.yml`
  - real PostgreSQL, started backend, CLI/API/deployment E2E, Playwright smoke
- `nightly.yml`
  - higher-cost compose smoke

## Local Commands

```bash
bun run test:unit
YUNDU_DATABASE_URL=postgres://postgres:postgres@localhost:5432/yundu bun run test:integration
YUNDU_DATABASE_URL=postgres://postgres:postgres@localhost:5432/yundu YUNDU_HTTP_PORT=3101 bun run --cwd apps/shell test:e2e
YUNDU_DATABASE_DRIVER=pglite YUNDU_PGLITE_DATA_DIR=.yundu/test-data/pglite bun run --cwd apps/shell test:e2e
```
