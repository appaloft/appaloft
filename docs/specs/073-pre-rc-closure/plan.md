# Plan: Pre-RC Closure And Hardening

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-002, ADR-017, ADR-019, ADR-024, ADR-029, ADR-030, ADR-035, ADR-046, ADR-047,
  ADR-048 through ADR-061, ADR-054, ADR-062, ADR-063.
- Operation maps/catalogs: `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`,
  `packages/application/src/operation-catalog.ts`.
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`,
  `docs/architecture/adapter-command-query-boundary.md`.
- Public docs governance: `docs/documentation/public-docs-structure.md`,
  `docs/testing/public-documentation-test-matrix.md`.
- Local specs and matrices: listed in `spec.md` Evidence Audit.

## Architecture Approach

- Treat this as a closure and hardening round, not a new feature phase.
- Prefer existing operations and evidence over adding aliases. Generic update/delete/repair
  commands stay forbidden unless a named operation already exists in Business Operation Map and the
  operation catalog.
- Keep adapters thin: CLI/oRPC/Web verification must prove dispatch through command/query messages
  and shared schemas.
- Keep generated access, durable domain routes, server-applied routes, and deployment snapshot
  routes in the existing route/access descriptor vocabulary.
- Keep durable process delivery aligned with ADR-054: process attempts are the current
  outbox/inbox-equivalent baseline. A separate outbox/inbox retention command is not applicable
  unless a future ADR introduces a separate store.

## Evidence Strategy

| Area | Evidence commands |
| --- | --- |
| Access/domain/TLS | `bun test packages/application/test/domain-binding-lifecycle.test.ts packages/application/test/import-certificate.test.ts packages/application/test/issue-or-renew-certificate.test.ts packages/application/test/resource-access-summary.projector.test.ts packages/application/test/resource-proxy-configuration-preview.test.ts packages/application/test/resource-diagnostic-summary.test.ts packages/application/test/resource-health.test.ts packages/application/test/create-deployment.test.ts packages/orpc/test/certificate-lifecycle.http.test.ts packages/orpc/test/default-access-domain-policy.http.test.ts packages/adapters/cli/test/certificate-command.test.ts packages/adapters/cli/test/default-access-command.test.ts packages/contracts/test/route-intent-status-contract.test.ts` |
| Operator state | `bun test packages/application/test/operator-work-query.test.ts packages/application/test/operator-work-mark-recovered.test.ts packages/application/test/operator-work-dead-letter.test.ts packages/application/test/operator-work-cancel.test.ts packages/application/test/operator-work-retry.test.ts packages/application/test/operator-work-prune.test.ts packages/orpc/test/operator-work.http.test.ts packages/adapters/cli/test/operator-work-command.test.ts apps/shell/test/remote-state-work-read-model.test.ts packages/adapters/cli/test/remote-state-command.test.ts` |
| Runtime capacity and retention | `bun test packages/application/test/server-capacity-prune.test.ts packages/adapters/runtime/test/runtime-target-capacity.test.ts packages/adapters/runtime/test/runtime-target-capacity-prune.test.ts packages/application/test/audit-events.test.ts packages/application/test/domain-event-retention.test.ts packages/application/test/provider-job-log-retention.test.ts packages/application/test/retention-defaults.test.ts packages/application/test/scheduled-history-retention.test.ts packages/application/test/scheduled-runtime-prune.test.ts packages/orpc/test/audit-events.http.test.ts packages/orpc/test/domain-events.http.test.ts packages/orpc/test/provider-job-logs.http.test.ts` |
| Remote-state marker prune | `bun test packages/application/test/server-capacity-prune.test.ts packages/adapters/runtime/test/runtime-target-capacity-prune.test.ts packages/adapters/cli/test/server-command.test.ts packages/adapters/cli/test/remote-state-command.test.ts apps/web/src/lib/console/runtime-usage.test.ts packages/docs-registry/test/help-topics.test.ts packages/application/test/operation-catalog-boundary.test.ts` |
| Deployment observation | `bun test packages/application/test/stream-deployment-events.test.ts packages/orpc/test/deployment-event-stream.http.test.ts packages/openapi/test/openapi-reference.test.ts packages/sdk-generator/test/typescript-facade.test.ts packages/sdk/test/client-stream.test.ts` |
| Deployment cancel | `bun test packages/application/test/cancel-deployment.test.ts packages/adapters/cli/test/deployment-cancel-command.test.ts packages/orpc/test/deployment-create.http.test.ts packages/application/test/operation-catalog-boundary.test.ts -t "DEP-CANCEL|PHASE7-DAY2-MGMT-001"`; `bun run --cwd packages/sdk generate:operations`; `bun test packages/docs-registry/test/operation-coverage.test.ts packages/sdk/test/generated-operations.test.ts packages/openapi/test/openapi-reference.test.ts -t "DEP-CANCEL|TS-SDK-GEN|operation"` |
| Deployment archive/prune | `bun test packages/application/test/deployment-archive-prune.test.ts`; `bun test packages/persistence/pg/test/deployment-attempt-retention.pglite.test.ts`; `bun test packages/adapters/cli/test/deployment-cancel-command.test.ts`; `bun test packages/orpc/test/deployment-create.http.test.ts -t "DEP-ARCHIVE|DEP-PRUNE|DEP-CANCEL"`; `bun run --cwd packages/sdk generate:operations`; `bun test packages/application/test/operation-catalog-boundary.test.ts -t "PHASE7-DAY2-MGMT-001"`; `bun test packages/docs-registry/test/operation-coverage.test.ts packages/openapi/test/openapi-reference.test.ts packages/sdk/test/generated-operations.test.ts -t "DEP-ARCHIVE|DEP-PRUNE|operation"` |
| Framework/runtime catalog | `bun test packages/contracts/test/deployment-plan-preview-contract.test.ts packages/adapters/runtime/test/framework-fixtures.test.ts packages/adapters/filesystem/test/framework-fixtures.test.ts apps/shell/test/e2e/framework-smoke-coverage.test.ts` |
| Source-event replay and webhook secret rotation | `bun test packages/application/test/source-events.test.ts packages/application/test/operation-catalog-boundary.test.ts packages/adapters/cli/test/source-event-command.test.ts packages/orpc/test/source-events.http.test.ts packages/docs-registry/test/operation-coverage.test.ts packages/openapi/test/openapi-reference.test.ts packages/sdk/test/generated-operations.test.ts` |
| Docs/catalog/SDK/MCP/static/release packaging | `bun test packages/docs-registry/test/operation-coverage.test.ts packages/docs-registry/test/help-topics.test.ts packages/application/test/operation-catalog-boundary.test.ts packages/openapi/test/openapi-reference.test.ts packages/sdk/test/generated-operations.test.ts packages/sdk/test/import-boundary.test.ts scripts/test/release-build-workflow.test.ts scripts/test/binary-bundle.test.ts scripts/test/sdk-release-packaging.test.ts packages/adapters/http-elysia/test/static-assets.test.ts` |

External or secret-gated smoke commands such as `bun run smoke:framework:ssh`,
`bun run smoke:capacity-prune:ssh`, and `bun run smoke:ssh:evidence` are release gates, but local
closure can only record them as CI/secret-gated when required environment is unavailable.

## Roadmap And Compatibility

- Roadmap target: `1.0.0-rc` gate after `0.12.0`.
- Version target: pre-`1.0.0` release-candidate readiness only.
- Compatibility impact: `pre-1.0-policy`; this round may add support-readiness hardening on an
  existing operation and may rebuild explicit blocker operations such as `deployments.cancel`, but
  no unrelated product workflow should be introduced in RC scope.
- Release-note requirement: if a remaining gap is explicitly approved as non-GA-blocking, record
  the rationale in roadmap/spec/public docs/release-note input before treating the gate as closed.

## Sync Round Tasks

| Artifact | Sync rule |
| --- | --- |
| `docs/PRODUCT_ROADMAP.md` | Update only after executable evidence passes; do not convert future feature gaps into done. |
| `docs/BUSINESS_OPERATION_MAP.md` | Ensure every active closure operation maps to an existing catalog key or no-public-operation rationale. |
| `docs/CORE_OPERATIONS.md` | Ensure command/query tables and semantics match operation catalog. |
| `operation-catalog.ts` | Only change if an active operation is missing; otherwise use boundary tests as evidence. |
| Public docs/help | Ensure docs-registry coverage decisions exist; no docs-only closure without behavior tests. |
| This artifact | Record exact verification commands/results and final closed/pending state. |

## Risks And Migration Gaps

- Some roadmap ledger rows intentionally name future product work. Closing the RC blocker must not
  mark those future behaviors as implemented.
- Real SSH/Docker/Traefik smokes may be unavailable locally. If so, record the exact environment
  prerequisite and CI workflow instead of pretending local evidence exists.
- If any remaining B7 blocker lacks implementation evidence and cannot be fixed in this round without
  expanding product behavior, stop for maintainer approval before recording an accepted
  non-GA-blocking gap.
