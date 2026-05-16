# Pre-RC Closure Hardening

## Status

- Round: Post-Implementation Sync Round.
- Artifact state: completed coordination artifact for pre-`1.0.0-rc` closure/hardening.
- Roadmap target: Phase 11 `1.0.0-rc` selection gate.
- Compatibility impact: `pre-1.0-policy`; this artifact does not publish the RC and does not add
  new feature scope.
- Release classification: closure and hardening before `1.0.0-rc`, not the `1.0.0-rc` release
  itself.

## Business Outcome

Appaloft can enter release-candidate selection with the pre-RC blockers either closed by executable
operation/spec/test evidence or explicitly accepted as non-GA-blocking migration gaps. The RC scope
is frozen to hardening, compatibility, packaging, documentation, migration, and support-readiness
work; product gaps return to their owning roadmap phase or a `0.12.x` patch instead of hiding inside
the RC.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Pre-RC closure | Final roadmap/spec/test/docs synchronization before selecting `1.0.0-rc`. | Release gating | RC readiness hardening |
| GA blocker | A missing capability that prevents the current roadmap from selecting `1.0.0-rc` or `1.0.0`. | Roadmap | release blocker |
| Accepted non-GA-blocking gap | A documented future item with a reason, owner phase, and release-note rationale that does not block RC selection. | Roadmap/release notes | accepted gap |
| Access/domain/TLS closure | Domain binding, route readiness, and certificate lifecycle surfaces needed for v1 domain/TLS operations. | Runtime topology | custom domain closure |
| Operator state closure | Durable process, remote state, audit/event/log retention, capacity, prune, and recovery visibility. | Operator work | outbox/inbox-equivalent closure |

## Governing Source Alignment

This Sync Round read and reconciled:

- [Product Roadmap To 1.0.0](../../PRODUCT_ROADMAP.md)
- [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../../CORE_OPERATIONS.md)
- [Domain Model](../../DOMAIN_MODEL.md)
- [Decision Records](../../decisions/README.md)
- [Error Model](../../errors/model.md)
- [neverthrow Conventions](../../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)
- [Adapter Command/Query Boundary](../../architecture/adapter-command-query-boundary.md)
- [ADR-030: Public Documentation Round And Platform](../../decisions/ADR-030-public-documentation-round-and-platform.md)
- [Public Documentation Structure](../../documentation/public-docs-structure.md)
- [Public Documentation Test Matrix](../../testing/public-documentation-test-matrix.md)

No new ADR is required in this artifact because the command boundaries, lifecycle semantics,
readiness rules, persistence shape, public contracts, and operation catalog entries are already
governed by accepted ADRs and local specs linked from the operation map.

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| PRE-RC-CLOSE-001 | Access/domain/TLS closure is synchronized | Domain binding and certificate lifecycle operations are active | RC gate is reviewed | `domain-bindings.show/configure-route/delete-check/delete/retry-verification` and `certificates.import/show/retry/revoke/delete` have specs, catalog entries, CLI/API docs, public docs anchors, and tests. |
| PRE-RC-CLOSE-002 | Operator state closure is synchronized | Durable process and retention operations are active | RC gate is reviewed | `operator-work.*`, capacity inspect/prune, remote SSH diagnostics, audit/event/provider/log retention, and scheduled retention surfaces have source-of-truth and automated coverage. |
| PRE-RC-CLOSE-003 | Seven blocker decisions are explicit | Roadmap still contains historic blocker language | Sync Round completes | Each blocker is closed or recorded as accepted non-GA-blocking with rationale and owner. |
| PRE-RC-CLOSE-004 | Eight RC verification gates are explicit | Phase 11 still has unchecked release-candidate gates | Sync Round completes | Each gate has evidence and a clear not-a-release classification. |
| PRE-RC-CLOSE-005 | RC scope does not absorb product gaps | Future framework, secret, webhook, source-link, and optional repair items remain | RC gate is reviewed | They stay in owning roadmap sections as accepted non-GA-blocking gaps and do not expand `1.0.0-rc` scope. |

## Blocker Closure Matrix

| Blocker | Outcome | Evidence |
| --- | --- | --- |
| Top-level resource CRUD/lifecycle unevenness | Closed for the active v1 surface with accepted non-GA gaps for optional future project description/delete-restore, source-link day-two management, health policy reset/history, secret-reference management, webhook replay/rotation, and broader provider/plugin diagnostics. | `CORE_OPERATIONS.md`, `operation-catalog.ts`, resource/internal-state ledger, operation coverage tests. |
| Remaining non-resource lifecycle gaps | Closed for RC by active resource profile drift visibility, configuration/readiness diagnostics, recovery operations, and accepted non-GA gaps for deeper config-drift redaction and optional lifecycle histories. | Resource profile, deployment recovery, diagnostics, and public docs specs. |
| `deployments.create` progress stream vs `deployments.stream-events` observation | Closed by `docs/specs/071-deployment-observation-and-recovery`, which keeps create-time progress separate from standalone replay/follow observation. | `deployments.stream-events` tests, CLI/API/Web boundaries, roadmap entry. |
| Provider-route projection/retention and route intent update/delete/reconcile | Closed for RC through route precedence/read-model projection plus active domain binding route configure/delete/retry surfaces; admin repair/prune diagnostics beyond current safe route state remain accepted non-GA follow-up. | `docs/specs/020-route-intent-status-and-access-diagnostics`, `docs/specs/021-domain-binding-lifecycle`, operation catalog. |
| Generated/proxy/server-applied/durable route regression coverage | Closed for RC by API/CLI/Web coverage around generated access, proxy preview, server-applied domains, durable domain routes, route summaries, and diagnostics. | Resource access docs, Web E2E, docs registry, oRPC/CLI/application tests. |
| Framework coverage narrower than target catalog | Closed for RC for the active supported catalog: static/frontend, Node APIs, Python, JVM/Spring/Quarkus, Dockerfile/Compose/prebuilt image, and real Docker/SSH smoke gates. Ruby, PHP, Go, .NET, Rust, Elixir, Micronaut, and buildpack execution stay accepted non-GA future catalog expansions. | Framework support checklist, framework fixture tests and smoke workflows. |
| Durable outbox/inbox/job/process/remote-state/audit operator surface incompleteness | Closed for RC by ADR-054 durable process attempts as the outbox/inbox-equivalent baseline, `operator-work.*`, remote SSH diagnostics, capacity inspect/prune, audit/event/log retention, and scheduled retention. Automatic provider/runtime retry workers and remote SSH repair/prune are accepted non-GA follow-ups. | ADR-054, specs 055-067, operator work tests, release hardening matrix. |

## RC Verification Gate Matrix

| Gate | Outcome | Evidence |
| --- | --- | --- |
| Select `1.0.0-rc` only after `0.12.0` complete/deferred and no unchecked pre-RC blocker | Passed for closure/hardening readiness; this PR does not publish the RC. | Roadmap Phase 10 checked, this artifact, blocker matrix. |
| Feature gaps return to owning phase or `0.12.x` patch | Passed. | Accepted gap list in roadmap and this artifact. |
| Re-run full `1.0.0 Definition Of Done` | Passed as a roadmap/spec/catalog/docs verification pass with accepted non-GA gaps. | Updated DoD checklist in `docs/PRODUCT_ROADMAP.md`. |
| Verify installer/upgrade/static console/docs packaging/CLI/HTTP-oRPC/Web/SDK/MCP catalog semantics | Passed by release-hardening, docs-registry, SDK, generated MCP descriptor, and operation-catalog evidence. | `docs/testing/release-hardening-test-matrix.md`, `packages/docs-registry`, `packages/sdk`, `packages/ai/mcp`. |
| Verify GA-blocking smoke suites pass or have accepted gaps | Passed as first-class script/workflow verification; environment-gated real SSH/provider smokes fail closed when required. | `package.json` smoke scripts and release workflow matrix. |
| Freeze RC scope to hardening/compatibility/packaging/docs/migration/support-readiness | Passed. | Phase 11 roadmap text and this artifact. |
| Confirm RC can promote to `1.0.0` without new product behavior | Passed for active catalog semantics. | Closed blocker matrix; remaining gaps are non-GA-blocking. |
| Confirm remaining gaps are closed or accepted as non-GA-blocking in roadmap/specs/public docs/release notes | Passed. | Roadmap, public docs matrix, release-hardening notes, and accepted gap section below. |

## Accepted Non-GA-Blocking Gaps

- Future optional resource/profile lifecycle expansions: project description, project hard
  delete/restore, source-link list/show/delete, resource health reset/history, secret-reference
  CRUD, webhook delivery replay/rotation, and provider/plugin advanced diagnostics.
- Route/admin maintenance beyond current route state: admin route repair/prune diagnostics and
  future full HTTPS/ACME force-HTTPS policy controls.
- Framework catalog expansion beyond the active supported set: Ruby, PHP, Go, .NET, Rust, Elixir,
  Micronaut, and real buildpack execution.
- Automatic provider/runtime retry workers beyond the current durable process attempt visibility and
  operation-specific retry commands.
- Remote SSH PGlite repair/prune operations beyond current safe diagnostics.
- Complete product-help affordance checking for every possible UI/CLI/API/MCP link; current
  registered help topic coverage remains enforced, while exhaustive affordance crawling is a public
  docs tooling follow-up.

These gaps are accepted because the active v1 minimum loop remains executable and observable without
claiming the future behavior. They must be mentioned as known limitations if an RC release note is
generated from this state.

## Public Surfaces

| Surface | Outcome |
| --- | --- |
| API/oRPC | Active operations reuse application command/query schemas through the catalog. No new RC-only operation is added. |
| CLI | Active operations remain aligned with catalog keys and public docs anchors. |
| Web/UI | Existing Web surfaces consume typed client helpers and docs registry topics; no hidden business behavior is added in components. |
| Config | Repository config remains an entry workflow/profile input, not a new RC feature surface. |
| Events | Durable process/event retention semantics remain governed by ADR-054 and ADR-059. |
| Public docs/help | Existing docs registry and public docs matrix cover active operations; exhaustive help-affordance crawling remains a tooling gap. |
| Future MCP/tool | Generated descriptors consume operation catalog semantics; concrete gateway behavior remains post-`1.0.0`. |

## Non-Goals

- Do not publish `1.0.0-rc` from this artifact.
- Do not add new product behavior to make the RC look complete.
- Do not turn accepted non-GA gaps into hidden compatibility aliases or undocumented behavior.
- Do not mark future roadmap items complete without executable evidence or explicit accepted gap
  rationale.
