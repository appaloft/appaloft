# Plan: Pre-RC Closure Hardening

## Governing Sources

- Roadmap: [Product Roadmap To 1.0.0](../../PRODUCT_ROADMAP.md)
- Operation map: [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- Operation catalog docs: [Core Operations](../../CORE_OPERATIONS.md)
- Domain model: [Domain Model](../../DOMAIN_MODEL.md)
- Decisions/ADRs: [Decision Records](../../decisions/README.md), especially ADR-030, ADR-035,
  ADR-047 through ADR-064, and ADR-054.
- Global contracts:
  - [Error Model](../../errors/model.md)
  - [neverthrow Conventions](../../errors/neverthrow-conventions.md)
  - [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)
  - [Adapter Command/Query Boundary](../../architecture/adapter-command-query-boundary.md)
- Public docs governance:
  - [Public Documentation Structure](../../documentation/public-docs-structure.md)
  - [Public Documentation Test Matrix](../../testing/public-documentation-test-matrix.md)
- Release hardening evidence: [Release Hardening Test Matrix](../../testing/release-hardening-test-matrix.md)

## Architecture Approach

- Domain/application placement: no new aggregate or command boundary is introduced. This round
  verifies and synchronizes already governed business operations. The requested access/domain/TLS
  and operator-state code rounds are represented by prior merged slices; this branch audits those
  slices and performs the final Sync Round, rather than inventing a second implementation path.
- Repository/specification/visitor impact: none. Active persistence/read-model behavior remains
  owned by the relevant prior specs.
- Event/CQRS/read-model impact: keep read-only observations in queries and write-side mutations in
  commands; retain durable process attempts as the current outbox/inbox-equivalent baseline.
- Entrypoint impact: CLI, HTTP/oRPC, Web, SDK metadata, generated MCP/tool descriptors, and public
  docs must continue to derive from `operation-catalog.ts` and shared command/query schemas.
- Persistence/migration impact: no migration in this closure artifact. Accepted future persistence
  work remains in owning roadmap gaps.

## Workflow Round Plan

| Workflow | Required round state | Plan outcome |
| --- | --- | --- |
| Access/domain/TLS closure | Spec, Test/Test-First, Code, Docs, and Sync must all be traceable before RC. | Use the existing accepted routing/domain/TLS, domain-binding, certificate, route diagnostic, and public docs specs as the Spec/Docs source; verify application, CLI, oRPC, operation catalog, docs-registry, SDK/MCP, and Web/read-model evidence; sync roadmap and release notes only after tests pass. |
| Operator state closure | Spec, Test/Test-First, Code, Docs, and Sync must all be traceable before RC. | Use ADR-054 and the operator-work/runtime/audit/event/log retention specs as the Spec source; verify operator-work, capacity, runtime usage, audit/event/provider retention, docs-registry, SDK/MCP, and release hardening evidence; sync accepted future worker/remote-repair gaps explicitly. |

If any required operation, test matrix, adapter, public docs outcome, or catalog entry is missing,
the closure must return to the owning Spec/Test/Code round instead of checking the Phase 11 gate.

## Roadmap And Compatibility

- Roadmap target: Phase 11 `1.0.0-rc` gate.
- Version target: pre-RC closure/hardening only; not the RC release.
- Compatibility impact: `pre-1.0-policy`; no hidden aliases or silent fallbacks.
- Release-note requirement: RC release notes generated from this state must say the RC scope is
  hardening/compatibility/packaging/docs/migration/support-readiness and must list the accepted
  non-GA gaps from `spec.md`.
- Migration requirement: no user migration is introduced by this Sync Round.

## Testing Strategy

Focused local verification should cover:

- operation catalog and docs registry parity;
- access/domain/TLS operation tests across application, CLI, oRPC, and public docs;
- operator-work, audit/event/log retention, runtime usage, capacity prune, and release hardening
  tests;
- framework fixture contract tests for the active supported catalog;
- generated SDK and MCP descriptor tests;
- final `bun run lint`, `bun run typecheck`, and `git diff --check`.

Environment-gated real Docker/SSH/provider smokes remain first-class release gates. Local pre-RC
closure may record them as not run when credentials or Docker/SSH targets are unavailable, but
release-readiness workflows fail closed when their `require_*` inputs are set.

## Sync Strategy

1. Re-audit source-of-truth documents before editing roadmap state.
2. Verify active workflow evidence with focused automated tests.
3. Update the coordination artifact with round trace and accepted gaps.
4. Update `docs/PRODUCT_ROADMAP.md` only after the evidence exists.
5. Update release-hardening and release-note rationale so future RC notes cannot silently omit
   accepted non-GA gaps.
6. Re-run lint, typecheck, and diff checks before finalizing the PR.

## Risks And Migration Gaps

- The main risk is overstating RC readiness by marking future catalog expansion as complete. This
  plan keeps those items accepted and non-GA-blocking rather than checking them as active behavior.
- Exhaustive UI help-affordance crawling is still broader than registered docs-topic contract tests.
  Public docs coverage remains good enough for RC only because active operation topics are covered
  by `@appaloft/docs-registry` and public docs matrix notes.
- Automatic runtime/provider retry workers and remote SSH repair/prune remain future governed
  operation slices; current operator visibility and explicit retry surfaces are sufficient for RC.
