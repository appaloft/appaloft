# Tasks: Access Failure Evidence Lookup

## Test-First

- [x] `RES-ACCESS-DIAG-EVIDENCE-001`: add application query service lookup test.
- [x] `RES-ACCESS-DIAG-EVIDENCE-002`: add filter mismatch safe not-found test.
- [x] `RES-ACCESS-DIAG-EVIDENCE-003`: add PG/PGlite retention expiry test.
- [x] `RES-ACCESS-DIAG-EVIDENCE-004`: add contract/redaction and renderer capture tests.
- [x] Add HTTP/oRPC and CLI dispatch tests for the public read query.

## Source Of Truth

- [x] Update operation map, core operations, workflow/error specs, test matrix, domain model,
  roadmap, and public diagnostics docs.

## Implementation

- [x] Add application query, handler, service, output model, tokens, and operation catalog entry.
- [x] Add separate short-retention evidence recorder/read-model ports and PG/PGlite projection
  adapter.
- [x] Capture safe renderer envelopes through the recorder without blocking the response.
- [x] Add oRPC/HTTP and CLI entrypoints that reuse the query input schema.

## Entrypoints And Docs

- [x] Update contracts/oRPC client contract and OpenAPI route grouping.
- [x] Update CLI help text and public docs/help coverage.
- [x] Keep Web resource panels consuming existing shared read models; record full Web lookup form as
  deferred.

## Verification

- [x] Run related application, persistence, contracts, HTTP/oRPC, CLI, and Web/doc registry tests.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Mark matrix rows and tasks with passing automated bindings.
- [x] Update Phase 6 roadmap verification notes and remaining gaps.
