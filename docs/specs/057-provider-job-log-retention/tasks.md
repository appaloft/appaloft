# Tasks: Provider Job Log Retention

## Test-First

- [x] PROV-JOB-LOG-PRUNE-001: add application dry-run/default test.
- [x] PROV-JOB-LOG-PRUNE-002: add application destructive prune test.
- [x] PROV-JOB-LOG-PRUNE-003: add PGlite cutoff/scope retention test.
- [x] PROV-JOB-LOG-PRUNE-004: add CLI and oRPC dispatch tests.

## Source Of Truth

- [x] Add ADR-049 and decision index entry.
- [x] Add `docs/commands/provider-job-logs.prune.md`.
- [x] Add provider job log retention feature spec, plan, and tasks.
- [x] Add provider job log retention test matrix.
- [x] Update operation map, core operations, roadmap, docs registry.

## Implementation

- [x] Add application command, handler, use case, port types, tokens, exports, and operation catalog
  entry.
- [x] Add PG retention store for `provider_job_logs`.
- [x] Add contracts/oRPC/CLI entrypoints.

## Entrypoints And Docs

- [x] Wire CLI help to `operator.provider-job-logs`.
- [x] Add oRPC route `POST /api/provider-job-logs/prune`.
- [x] Keep Web as future surface.

## Verification

- [x] Run focused application, persistence, CLI, oRPC, and docs-registry tests.
- [x] Run typecheck for touched packages.
- [x] Run lint for touched packages.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, durable docs, tests, and code.
