# Pre-RC Closure And Hardening

## Status

- Round: Evidence Audit -> Test-First/Code if needed -> Post-Implementation Sync.
- Artifact state: active coordination artifact for pre-`1.0.0-rc` closure.
- Release target: `1.0.0-rc` readiness gate only. This artifact does not release `1.0.0-rc`.
- Compatibility impact: `pre-1.0-policy`; this round may harden or synchronize existing public
  operations, including support-readiness maintenance categories, but it must not add new product
  workflow scope to the release-candidate phase.
- Current evidence state: final local verification passed for the active governed operation set
  listed in `tasks.md`; B1 through B7 are closed by executable evidence. Final PR closure still
  requires commit, push, and PR.

## Business Outcome

Appaloft can enter the `1.0.0-rc` gate only when the remaining horizontal release blockers are
closed by executable evidence or by code plus tests plus source-of-truth synchronization. This round
collects the closure evidence for the two broad workflows, the seven pre-RC blockers, and the eight
RC verification gates so the release candidate is hardening work rather than hidden feature work.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Pre-RC closure | Hardening and evidence collection before selecting `1.0.0-rc`. | Roadmap/release readiness | release-candidate gate |
| Generated access | Provider-neutral default route from resource/server/default-access policy. | Access/domain/TLS | default access route |
| Durable domain route | Resource-scoped managed `DomainBinding` route intent and readiness. | Routing/domain/TLS | custom domain |
| Server-applied route | SSH/PGlite target-local route desired/applied state from repository config. | Pure CLI/SSH | config domain |
| Operator work | Read/repair surface over durable process attempts and selected compatibility read models. | Operator/internal state | work ledger |
| Durable process delivery | Process-attempt based outbox/inbox-equivalent baseline for accepted work. | Async lifecycle | outbox/inbox equivalent |
| Standalone deployment event stream | `deployments.stream-events` read/query observation boundary. | Deployment observation | reconnect/follow stream |

## Governing Sources

- [Product Roadmap](../../PRODUCT_ROADMAP.md)
- [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../../CORE_OPERATIONS.md)
- [Domain Model](../../DOMAIN_MODEL.md)
- [Error Model](../../errors/model.md)
- [neverthrow Conventions](../../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)
- [Adapter Command/Query Boundary](../../architecture/adapter-command-query-boundary.md)
- [Public Documentation Structure](../../documentation/public-docs-structure.md)
- [Public Documentation Test Matrix](../../testing/public-documentation-test-matrix.md)
- [ADR-002: Routing, Domain, And TLS Boundary](../../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-029: Deployment Event Stream And Recovery Boundary](../../decisions/ADR-029-deployment-event-stream-and-recovery-boundary.md)
- [ADR-035: Certificate Lifecycle Closure](../../decisions/ADR-035-certificate-lifecycle-closure.md)
- [ADR-046: TypeScript SDK Interface Parity](../../decisions/ADR-046-typescript-sdk-interface-parity.md)
- [ADR-054: Durable Process Delivery Baseline](../../decisions/ADR-054-durable-process-delivery-baseline.md)

## Workflow Closure Scope

| Workflow | Required closure evidence | Governing specs/matrices | Status |
| --- | --- | --- | --- |
| Access/domain/TLS closure | Domain binding show/configure-route/delete/delete-check/retry-verification; certificate import/show/retry/revoke/delete; generated access, proxy preview, server-applied route, durable route projection and diagnostics; CLI, HTTP/oRPC, Web, public docs/help, future tool decisions. | `docs/specs/021-domain-binding-lifecycle`, `docs/specs/023-certificate-lifecycle-closure`, `docs/testing/routing-domain-and-tls-test-matrix.md`, `docs/testing/default-access-domain-and-proxy-routing-test-matrix.md`, `docs/testing/edge-proxy-provider-and-route-configuration-test-matrix.md`, `docs/testing/resource-access-failure-diagnostics-test-matrix.md`, `docs/testing/certificates.import-test-matrix.md` | Active governed operation evidence passed; see `tasks.md`. Full HTTPS/ACME/force-HTTPS/redirect lifecycle remains outside the proven active set unless maintainer approves it as non-GA-blocking or expands this round. |
| Operator state closure | Operator-work list/show/retry/cancel/dead-letter/prune/mark-recovered; remote SSH state diagnostics/recovery/migration evidence; explicit old remote-state marker cleanup through `servers.capacity.prune`; runtime capacity diagnostics/prune; audit/event/provider/deployment/runtime log retention, dependency backup/restore process visibility, and scheduled retention; CLI, HTTP/oRPC, Web/public docs/help, future tool decisions. | `docs/specs/010-operator-work-ledger`, `docs/specs/055-runtime-artifact-workspace-prune`, `docs/specs/056-audit-event-retention-policy` through `docs/specs/067-scheduled-history-retention-automation`, `docs/testing/operator-work-ledger-test-matrix.md`, `docs/testing/runtime-target-capacity-test-matrix.md`, `docs/testing/audit-event-read-surface-test-matrix.md`, `docs/testing/domain-event-stream-retention-test-matrix.md`, `docs/testing/provider-job-log-retention-test-matrix.md`, `docs/testing/deployment-log-retention-test-matrix.md`, `docs/testing/durable-process-delivery-test-matrix.md` | Active governed operation evidence passed; see `tasks.md`. |

## Evidence Audit

| Blocker | Governing docs/spec/matrix ids | Existing executable evidence found | Operation/catalog/docs state | Surface state | Required action before close |
| --- | --- | --- | --- | --- | --- |
| B1 Top-level resource CRUD/lifecycle unevenness | Roadmap Definition of Done; Business Operation Map; Core Operations; lifecycle matrices for projects, environments, servers, credentials, resources, deployments, domain bindings, certificates, dependency resources, storage, scheduled tasks, terminal sessions, preview environments, operator work; `SOURCE-LINK-STATE-021` through `SOURCE-LINK-STATE-023`; `PROJ-LIFE-DESC-001` through `PROJ-LIFE-DESC-004`; `PROJ-LIFE-RESTORE-001` through `PROJ-LIFE-RESTORE-003`; `PROJ-LIFE-DELETE-CHECK-001` through `PROJ-LIFE-DELETE-CHECK-002`; `PROJ-LIFE-DELETE-001` through `PROJ-LIFE-DELETE-003`; `PROJ-LIFE-ENTRY-008-WEB`; `PROJ-LIFE-EVT-005`; `RES-HEALTH-CFG-007` through `RES-HEALTH-CFG-009`; `RES-HEALTH-HIST-001` through `RES-HEALTH-HIST-003`; `RES-SECRET-CRUD-001` through `RES-SECRET-CRUD-010`; `DEP-CANCEL-001` through `DEP-CANCEL-004`; `DEP-CANCEL-ENTRY-001` through `DEP-CANCEL-ENTRY-003`; `DEP-ARCHIVE-001` through `DEP-ARCHIVE-002`; `DEP-PRUNE-001` through `DEP-PRUNE-002`; `DEP-ARCHIVE-ENTRY-001` through `DEP-ARCHIVE-ENTRY-003`; `DEP-PRUNE-ENTRY-001` through `DEP-PRUNE-ENTRY-003`. | Existing tests are distributed across application, CLI, oRPC, Web, persistence, docs-registry, OpenAPI, SDK, and release packaging. This round added application/CLI/HTTP-oRPC/Web executable evidence for source-link list/show/delete, project description editing, project restore, project delete-check/delete, health policy reset/delete, Resource-owned secret reference create/rotate/delete/list/show, retained resource health-history readback, pre-RC rebuilt deployment cancel, and terminal deployment archive plus dry-run-first guarded prune. | Listed operations are active in `operation-catalog.ts`; this round added `source-links.list`, `source-links.show`, `source-links.delete`, `projects.set-description`, `projects.restore`, `projects.delete-check`, `projects.delete`, `resources.reset-health`, `resources.health-history`, `resources.secrets.create/rotate/delete/list/show`, `deployments.cancel`, `deployments.archive`, and `deployments.prune`; remaining not-current product gaps stay in owning roadmap phase, not RC scope. | CLI/HTTP/oRPC/Web/docs/future tool decisions are per-operation. Source-link list/show/delete, project set-description/restore/delete-check/delete, resource reset-health, resource health-history, Resource secret references, deployment cancel, deployment archive, and deployment prune now have CLI, HTTP-oRPC, public docs coverage, SDK/OpenAPI metadata, and AI-facing CLI entrypoint coverage where CLI is active. | Closed by re-run operation-catalog/docs-registry and representative lifecycle tests recorded in `tasks.md`. Source-link archive remains not implemented because source links are mappings, not lifecycle aggregates. |
| B2 Remaining non-resource lifecycle gaps | Resource profile drift, source links, runtime logs, health policy, health observation history, webhook/auto-deploy, secrets, retention/monitoring specs; `SRC-AUTO-*`; `SRC-AUTO-REPLAY-*`; `SRC-AUTO-PRUNE-*`; `RES-HEALTH-CFG-*`; `RES-HEALTH-QRY-*`; `RES-HEALTH-HIST-*`; `RES-PROFILE-CONFIG-*`; `RES-SECRET-CRUD-*`. | Evidence exists for resource profile drift visibility, Resource-vs-latest-snapshot configuration drift redaction, config deploy blocking for entry config keys shadowed by resource-scoped effective config overrides, source relink, source-link list/show/delete, runtime logs/archive, runtime controls, source event baseline/replay/prune, scheduled tasks, retention categories, health policy configure/reset/observe, retained health observation history, resource config/secret masking/build-runtime validation, and explicit Resource secret reference create/rotate/delete/list/show. This round re-ran auto-deploy/webhook policy/ingest/read/Web evidence, source-event replay evidence, source-event prune application/PGlite/CLI/HTTP-oRPC/catalog/docs/OpenAPI/SDK evidence, health-policy configure/reset/observe/history evidence, resource config/secret baseline evidence, and secret-reference lifecycle evidence. | Current accepted operations are cataloged, including `resources.configure-auto-deploy`, `source-events.ingest`, `source-events.list`, `source-events.show`, `source-events.replay`, `source-events.prune`, `resources.configure-health`, `resources.reset-health`, `resources.health`, `resources.health-history`, `resources.set-variable`, `resources.secrets.create`, `resources.secrets.rotate`, `resources.secrets.delete`, `resources.secrets.list`, `resources.secrets.show`, `resources.unset-variable`, `resources.import-variables`, and `resources.effective-config`; unimplemented future provider-specific webhook control planes remain owning-phase work, not hidden RC scope. | Public docs/help coverage is catalog-driven. Auto-deploy/webhook, source-event replay/prune, health policy/history, resource config/secret active surfaces, and explicit Resource secret-reference lifecycle have CLI/HTTP-oRPC/Web/public docs coverage where applicable. | Closed by executable evidence. Provider-specific webhook control planes beyond active GitHub and generic-signed routes remain future provider scope, not a pre-RC blocker. |
| B3 `deployments.create` progress stream vs standalone `deployments.stream-events` observation | ADR-029; `docs/specs/071-deployment-observation-and-recovery`; `docs/queries/deployments.stream-events.md`; `docs/testing/deployments.stream-events-test-matrix.md`. | `packages/application/test/stream-deployment-events.test.ts`; `packages/orpc/test/deployment-event-stream.http.test.ts`; OpenAPI/SDK generator tests. | `deployments.stream-events` is active in Business Operation Map, Core Operations, and operation catalog. | HTTP/oRPC and SDK metadata exist; Web deployment detail uses show/stream/log split per specs. | Re-run stream-events application/oRPC/OpenAPI/SDK tests and record results. |
| B4 Provider-route projection/retention and route intent update/delete/reconcile | ADR-002, ADR-017, ADR-019, ADR-024; `docs/specs/020-route-intent-status-and-access-diagnostics`; `docs/specs/021-domain-binding-lifecycle`; edge-proxy/default-access matrices. | Resource access summary, proxy preview, domain binding lifecycle, server-applied route status, cleanup, provider proxy tests. | `domain-bindings.configure-route`, `delete-check`, `delete`, `retry-verification`, default-access policies, and route readbacks are cataloged. No generic route CRUD operation exists. | CLI/HTTP/oRPC for domain binding route mutations; Web has resource-scoped domain create/import and access readback; public docs route to access/domain/TLS anchors. | Re-run domain binding, proxy preview, server-applied route, and docs registry tests. |
| B5 Generated access / proxy preview / server-applied domains / durable domain routes API-Web-CLI regression coverage | ADR-017, ADR-019, ADR-024; `docs/testing/default-access-domain-and-proxy-routing-test-matrix.md`, route/access diagnostics matrices. | CLI default-access tests, oRPC default-access tests, WebView generated/server-applied access tests, application route projection tests, provider proxy tests, shell e2e route workflow tests. | Default access policy operations and route diagnostics are cataloged; server-applied route state remains internal SSH/PGlite route state, not a public operation. | CLI/HTTP/Web read/mutation coverage exists for policy and resource access; future MCP/tool descriptors are catalog-derived where public operations exist. | Re-run access regression tests and record any opt-in real Docker/Traefik suite that cannot run locally. |
| B6 Framework coverage narrower than target product catalog | Workload framework workflow; `docs/testing/workload-framework-detection-and-planning-test-matrix.md`; zero-to-SSH catalog harness; release hardening matrix. | Contract tests, runtime/filesystem framework fixture tests, shell smoke coverage tests, optional real Docker/SSH workflows. This round added Ruby, PHP, Go, .NET, Rust, and Elixir detector/planner fixtures and re-ran the fixture contract. | Framework planning remains internal workflow; no new public operation. Unsupported frameworks have explicit fallback/blocked preview semantics. | CLI/Web/repository-config draft parity is covered through resource/deployment plan surfaces; SDK/MCP metadata follows cataloged deployment plan operations. | Closed for broad framework catalog evidence by `bun test packages/adapters/filesystem/test/framework-fixtures.test.ts packages/adapters/runtime/test/framework-fixtures.test.ts` with 129 pass, 0 fail. Real buildpack execution remains a separate unchecked buildpack row, not this blocker. |
| B7 Durable outbox/inbox/job/process/remote-state/audit operator surface incompleteness | ADR-054; operator-work ledger matrix; durable-process delivery matrix; runtime capacity, audit/event, provider job log, deployment log, runtime log archive, retention defaults, scheduled history retention matrices; ADR-047 through ADR-061. | Operator work application/CLI/oRPC tests; durable process journal claim/retry/generation tests; remote state diagnostics, migration lifecycle, sync recovery, and marker read tests; runtime capacity tests including `RT-CAP-PRUNE-010`; dependency backup/restore process-attempt tests; audit/event/provider/deployment/runtime log retention tests; scheduled retention tests; docs-registry help tests. | `operator-work.*`, `servers.capacity.*`, audit/event/log/retention operations are cataloged; ADR-054 maps outbox/inbox-equivalent delivery to the process attempt journal instead of a separate public outbox store. | CLI/HTTP/oRPC active; Web capacity/audit/diagnostic surfaces where present; public docs/help and future tool decisions through docs registry. | Closed by re-run evidence. Real local/SSH destructive prune smokes remain opt-in CI/secret-gated verification, not unchecked product behavior. |

## Close Criteria

| Item | Close criteria |
| --- | --- |
| Access/domain/TLS workflow | Relevant command/query/workflow/error/testing docs align with Business Operation Map, Core Operations, and operation catalog; CLI and HTTP/oRPC dispatch through command/query buses and schemas; Web/public docs/help decisions exist; targeted tests pass or an opt-in external smoke is recorded as CI/secret-gated evidence. |
| Operator state workflow | Operator-work and retention/capacity/readback operations are cataloged and tested; remote SSH diagnostics are read-only; process attempts are visible and repairable; separate outbox/inbox retention remains not-applicable only under ADR-054; targeted tests pass. |
| Each blocker | One of: existing executable evidence is re-run and passes; or this round adds code/tests/docs sync and the new tests pass; or a human-approved non-GA-blocking gap is recorded. |
| Each RC gate | The gate has command-level evidence in `tasks.md` and roadmap/spec/public docs/release-note state is synchronized only after tests pass. |

## RC Verification Gates

| Gate | Evidence required | Status |
| --- | --- | --- |
| RC-001 `0.12.0` complete/deferred and no unchecked pre-RC blocker remains | Roadmap and closure audit show no unverified current blocker. | Closed by final evidence re-run. |
| RC-002 Feature gaps return to owning phase or `0.12.x` patch | Roadmap differentiates RC hardening from future feature gaps. | Closed by final roadmap/spec sync. |
| RC-003 Full 1.0.0 Definition Of Done re-run | Artifact records DoD evidence against implementation/specs/catalog/docs/migration gaps/release artifacts. | Closed by final verification evidence in `tasks.md`. |
| RC-004 Installer/upgrade/static console/docs packaging/CLI/HTTP-oRPC/Web/SDK/MCP semantics verified | Release packaging, static assets, docs registry, OpenAPI/SDK, operation catalog, CLI/oRPC/Web evidence pass. | Closed by final packaging/static/docs/catalog/OpenAPI/SDK evidence. |
| RC-005 GA-blocking smoke suites pass or approved release-note gaps exist | Local/CI smoke descriptors and available local smoke tests pass; unavailable external gates recorded exactly. | Local targeted suites passed; opt-in SSH/Docker smokes remain CI/secret/explicit gates. |
| RC-006 RC scope frozen to hardening/compatibility/packaging/docs/migration/support-readiness | No new product behavior added by this round unless required to close a blocker. | This round added a support-readiness maintenance category on existing `servers.capacity.prune` and rebuilt `deployments.cancel` only because cancel was an explicit pre-RC blocker item; no unrelated RC release behavior is claimed. |
| RC-007 RC can promote to `1.0.0` without new product behavior | Remaining work is not hidden product scope. | Closed by final scope sync. |
| RC-008 Remaining gaps closed or explicitly approved non-GA-blocking | No unchecked current blocker is closed by docs-only assertion. | Closed by executable evidence; no accepted non-GA-blocking gap was recorded. |

## Current Pending Items

- Final local verification has passed for the active governed operation set listed in `tasks.md`.
- Roadmap checkboxes for B1 through B7 are evidence-backed; final closure still requires PR creation.
- Any gap that would require a new accepted non-GA-blocking status needs maintainer approval before
  this artifact or roadmap may mark it closed.
