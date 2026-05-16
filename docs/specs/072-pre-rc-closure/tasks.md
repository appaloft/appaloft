# Tasks: Pre-RC Closure Hardening

## Source Of Truth

- [x] Create coordination artifact at `docs/specs/072-pre-rc-closure/`.
- [x] Confirm this is pre-`1.0.0-rc` closure/hardening, not the RC release itself.
- [x] Read and align roadmap, operation map, core operations, domain model, decision records,
  global error/async/adapter contracts, and public docs governance.
- [x] Record no-ADR-needed rationale because existing accepted ADRs govern the active boundaries.

## Workflow Round Trace

- [x] Access/domain/TLS Spec Round evidence: ADR-002 through ADR-009, ADR-017, ADR-019, ADR-035,
  routing/domain/TLS workflow, route-intent diagnostics, domain-binding lifecycle, and certificate
  lifecycle specs are linked from `spec.md`.
- [x] Access/domain/TLS Test/Test-First evidence: routing/domain/TLS and certificate import matrices
  plus application/oRPC/CLI/docs-registry tests are linked and rerun.
- [x] Access/domain/TLS Code Round evidence: active `domain-bindings.*` and `certificates.*`
  operation slices, catalog entries, CLI/oRPC/Web/docs surfaces, and operator-work projections are
  present on latest `main`.
- [x] Access/domain/TLS Docs Round evidence: access/domain/TLS public docs and docs-registry
  operation/help-topic coverage are active.
- [x] Access/domain/TLS Final Sync evidence: roadmap, release-note rationale, and this artifact now
  distinguish closed RC behavior from accepted route-admin/force-HTTPS follow-ups.
- [x] Operator state Spec Round evidence: ADR-047 through ADR-064, ADR-054, operator-work,
  durable-process, runtime capacity/usage, audit/event/log retention, and scheduled retention specs
  are linked from `spec.md`.
- [x] Operator state Test/Test-First evidence: operator-work, durable-process, runtime capacity,
  runtime usage, audit event, provider job log, release hardening, docs-registry, SDK/MCP tests are
  linked and rerun.
- [x] Operator state Code Round evidence: active `operator-work.*`, capacity inspect/prune,
  runtime-usage, audit/event/provider retention, CLI/oRPC/Web/docs-registry/SDK/MCP slices are
  present on latest `main`.
- [x] Operator state Docs Round evidence: observe/diagnostics, operations docs, docs-registry
  coverage, and release-hardening evidence are active.
- [x] Operator state Final Sync evidence: roadmap, release-note rationale, and this artifact now
  distinguish closed RC behavior from accepted automatic-worker and remote-SSH repair/prune
  follow-ups.

## Blocker Closure

- [x] Close top-level resource CRUD/lifecycle blocker for active v1 surface and record accepted
  non-GA lifecycle gaps.
- [x] Close remaining non-resource lifecycle blocker for RC and record accepted future drift/history
  gaps.
- [x] Close deployment create progress vs standalone stream-events observation through
  `docs/specs/071-deployment-observation-and-recovery`.
- [x] Close provider-route projection/retention and route intent blocker for RC with accepted
  admin repair/prune follow-up.
- [x] Close generated/proxy/server-applied/durable route regression blocker through existing
  application/API/CLI/Web/docs coverage.
- [x] Close framework coverage blocker for active supported catalog and record non-GA future
  framework expansions.
- [x] Close durable outbox/inbox/job/process/remote-state/audit operator surface blocker for RC
  through durable process attempts and retention/diagnostic operations.

## RC Verification Gates

- [x] Verify `0.12.0` is complete/deferred and no unchecked pre-RC blocker remains.
- [x] Verify feature gaps return to owning roadmap phase or `0.12.x` patch.
- [x] Re-run the full `1.0.0 Definition Of Done` as a roadmap/spec/catalog/docs pass.
- [x] Verify installer/upgrade/static console/docs packaging/CLI/HTTP-oRPC/Web/SDK/MCP catalog
  semantics.
- [x] Verify GA-blocking smoke suites have pass evidence or explicit accepted gaps/fail-closed
  release gates.
- [x] Freeze RC scope to hardening, compatibility, packaging, documentation, migration, and
  support-readiness.
- [x] Confirm RC can promote to `1.0.0` without adding product behavior.
- [x] Confirm remaining gaps are closed or explicitly accepted as non-GA-blocking in roadmap, specs,
  public docs, and release notes.

## Source Sync

- [x] Update `docs/PRODUCT_ROADMAP.md` with closure state, accepted gaps, and Phase 11 gate
  evidence.
- [x] Update `docs/testing/release-hardening-test-matrix.md` with the pre-RC closure evidence row.
- [x] Keep `docs/CORE_OPERATIONS.md` and `packages/application/src/operation-catalog.ts` unchanged
  because active operations are already synchronized.
- [x] Keep public docs content unchanged because active operation anchors are already covered by the
  docs registry/public docs matrix; record exhaustive affordance crawling as a tooling gap.

## Verification Commands

- [x] `bun test packages/docs-registry/test/operation-coverage.test.ts`
- [x] `bun test packages/docs-registry/test/help-topics.test.ts`
- [x] `bun test packages/application/test/operation-catalog-boundary.test.ts`
- [x] `bun test packages/application/test/domain-binding-lifecycle.test.ts packages/application/test/create-domain-binding.test.ts packages/application/test/confirm-domain-binding-ownership.test.ts packages/application/test/import-certificate.test.ts packages/application/test/issue-or-renew-certificate.test.ts packages/orpc/test/certificate-lifecycle.http.test.ts packages/adapters/cli/test/certificate-command.test.ts`
- [x] `bun test packages/orpc/test/operator-work.http.test.ts packages/orpc/test/audit-events.http.test.ts packages/orpc/test/domain-events.http.test.ts packages/orpc/test/provider-job-logs.http.test.ts packages/orpc/test/runtime-usage.http.test.ts`
- [x] `bun test packages/adapters/cli/test/operator-work-command.test.ts packages/adapters/cli/test/runtime-usage-command.test.ts`
- [x] `bun test packages/adapters/filesystem/test/framework-fixtures.test.ts packages/adapters/runtime/test/framework-fixtures.test.ts`
- [x] `bun test packages/ai/mcp/test/tool-descriptors.test.ts packages/sdk/test/running-server-smoke.test.ts`
- [x] `bun test scripts/test/release-build-workflow.test.ts scripts/test/sdk-release-packaging.test.ts scripts/test/binary-bundle.test.ts packages/adapters/http-elysia/test/static-assets.test.ts`
- [x] `bun run lint` passed with existing Biome warnings in `apps/web/src/routes/layout.css` for
  `!important` styles.
- [x] `bun run typecheck` passed; Turbo reported one cache I/O warning while all typecheck tasks
  succeeded.
- [x] `git diff --check`

## Post-Implementation Sync

- [x] Mark verification commands with observed results.
- [x] Ensure the final PR description states this is pre-RC closure/hardening, not an RC release.
- [x] Commit each smallest completed unit independently.
