# Plan: Domain Model Behavior Hardening

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Repository rules: `AGENTS.md`
- Decisions/ADRs:
  - `docs/decisions/ADR-026-aggregate-mutation-command-boundary.md`
  - Existing context-specific ADRs for each slice
- Local specs:
  - `docs/commands/deployments.create.md`
  - `docs/queries/deployments.plan.md`
  - `docs/workflows/resource-profile-lifecycle.md`
  - `docs/workflows/routing-domain-and-tls.md`
  - `docs/workflows/deployment-target-lifecycle.md`
  - `docs/workflows/workload-framework-detection-and-planning.md`
- Test matrices:
  - `docs/testing/deployments.create-test-matrix.md`
  - `docs/testing/deployment-plan-preview-test-matrix.md`
  - `docs/testing/resource-profile-lifecycle-test-matrix.md`
  - `docs/testing/routing-domain-and-tls-test-matrix.md`
  - `docs/testing/deployment-target-lifecycle-test-matrix.md`
  - `docs/testing/workload-framework-detection-and-planning-test-matrix.md`
  - `docs/testing/identity-governance-test-matrix.md`

## Architecture Approach

- Add intention-revealing behavior to the owning value object, entity, or aggregate root before
  touching application callers.
- Keep `toState()` as a boundary method for persistence, read models, contracts, adapter rendering,
  fixtures, and assertions.
- Avoid broad helpers that use primitive state to answer one object's own domain question.
- Let application services load domain objects, coordinate repositories/ports, and call domain
  behavior.
- Keep provider and runtime adapters focused on external translation and execution details.

## Slice Order

| Slice | Owner | Goal | Main callers |
| --- | --- | --- | --- |
| 0 | DDD skill and source-of-truth docs | Lock in behavior-placement rules and no-ADR-needed rationale. | n/a |
| 1 | `Resource`, `ResourceSourceBinding`, resource profile values | Move source descriptor, detector eligibility, internal-port requirement, and deployment request profile questions into Workload Delivery domain behavior. | `deployments.create`, `deployments.plan` |
| 2 | `DeploymentTarget` edge proxy values | Move generated-route and bootstrap eligibility to Runtime Topology domain behavior. | default access resolver, server bootstrap, deployment plan/create |
| 3 | `DomainBinding` and owned status/attempt values | Move readiness/certificate/route transition predicates and pending attempt selection into the aggregate. | domain binding commands and event handlers |
| 4 | `EnvironmentConfigSet` and configuration entry/snapshot values | Move identity, precedence, and diff comparisons into configuration values. | environment/resource config and effective config |
| 5 | `Deployment` and `DeploymentStatusValue` | Move execution-continuation and supersede status questions into Release Orchestration. | execution guard, deployment create, runtime adapters |
| 6 | `Workload` and `RuntimeSpec` | Move workload/runtime compatibility questions into Workload Delivery model. | workload declaration |
| 7 | Boundary audit | Confirm remaining `toState()` usage belongs to allowed serialization/read-model/persistence/adapter/test boundaries. | repository/read-model/adapter code |
| 8 | `Environment`, `Resource`, and `Destination` context ownership | Move project/environment/server/destination consistency questions into owning aggregates. | deployment context resolver, source-link relink |
| 9 | `DomainBinding` canonical redirect target behavior | Move served redirect target eligibility into the binding aggregate. | domain binding create and route configuration |
| 10 | `Certificate` and owned attempt status values | Move certificate-requested worker attempt selection, terminal skip, and issue-context preparation into the certificate aggregate. | `certificate-requested` event handler |
| 11 | `Organization`, `OrganizationMember`, and `OrganizationPlan` | Move duplicate membership and seat-capacity calculations into identity-governance domain behavior. | core organization aggregate |
| Continuous A | `DomainBinding` verification attempts | Move ownership-confirmation attempt selection, idempotent already-bound checks, and DNS verification context preparation into the binding aggregate. | `domain-bindings.confirm-ownership` |
| Continuous B | `Resource` and `ResourceKindValue` service cardinality | Move resource-kind multi-service admission out of create-resource use case and into resource domain behavior. | `resources.create` |
| Continuous C | `ResourceKindValue` and `ResourceServiceKindValue` internal-port predicates | Move inbound listener requirement literals out of the aggregate method and into owned value objects. | `Resource.requiresInternalPort()` |
| Continuous D | `DomainBindingStatusValue` lifecycle gates | Move ready, route-failure, and verification-retry status sets into the status value object. | `DomainBinding` lifecycle methods |

## Roadmap And Compatibility

- Roadmap target: no public roadmap phase change; internal model-hardening work that supports the current pre-1.0 line.
- Version target: not release-defining by itself.
- Compatibility impact: none. Public behavior, API schema, CLI schema, AI tool manifest, event payloads, read models, and database schema remain unchanged.

## Testing Strategy

- Add or extend core domain unit tests before refactoring callers in each slice.
- Reuse existing matrix ids for public behavior and add domain-hardening sub-rows only when the
  matrix lacks low-level coverage for the refactor target.
- Slice 1 test bindings:
  - `DMBH-RES-001` in `packages/core/test/resource.test.ts`
  - Existing behavioral rows: `DEP-CREATE-ADM-003`, `DEP-CREATE-ADM-013`,
    `RES-PROFILE-NETWORK-003`, `RES-PROFILE-CONFIG-012`, `DPP-QUERY-001`
- Related application tests after slice 1:
  - `packages/application/test/create-deployment.test.ts`
  - `packages/application/test/deployment-plan-preview.test.ts`
- Slice 2 test bindings:
  - `DMBH-TARGET-001` in `packages/core/test/deployment-target.test.ts`
  - Existing behavioral rows: `SERVER-BOOT-CMD-010`, `SERVER-BOOT-CMD-013`,
    `DEF-ACCESS-ROUTE-001`, `DEF-ACCESS-ROUTE-008`
- Related application tests after slice 2:
  - `packages/application/test/bootstrap-server-proxy.test.ts`
  - `packages/application/test/server-edge-proxy-bootstrap.test.ts`
  - `packages/application/test/create-deployment.test.ts`
  - `packages/contracts/test/deployment-plan-preview-contract.test.ts`
- Slice 3 test bindings:
  - `DMBH-DOMAIN-001` in `packages/core/test/domain-binding.test.ts`
  - Existing behavioral rows: `ROUTE-TLS-CMD-011`, `ROUTE-TLS-CMD-014`,
    `ROUTE-TLS-EVT-004`, `ROUTE-TLS-EVT-008`, `ROUTE-TLS-EVT-009`,
    `ROUTE-TLS-EVT-014`
- Related application tests after slice 3:
  - `packages/application/test/confirm-domain-binding-ownership.test.ts`
  - `packages/application/test/issue-or-renew-certificate.test.ts`
- Slice 4 test bindings:
  - `DMBH-CONFIG-001` in `packages/core/test/environment-config-set.test.ts`
  - Existing behavioral rows: `ENV-PRECEDENCE-QRY-001`, `ENV-PRECEDENCE-QRY-002`,
    `RES-PROFILE-CONFIG-009`, `RES-PROFILE-CONFIG-012`
- Related application tests after slice 4:
  - `packages/application/test/environment-effective-precedence.test.ts`
  - `packages/application/test/resource-config.test.ts`
- Slice 5 test bindings:
  - `DMBH-DEPLOY-001` in `packages/core/test/deployment.test.ts`
  - Existing behavioral rows: `DEP-CREATE-ADM-023`, `DEP-CREATE-ADM-023B`,
    `DEP-CREATE-ASYNC-012A`
- Related application tests after slice 5:
  - `packages/application/test/create-deployment.test.ts`
- Slice 6 test bindings:
  - `DMBH-WORKLOAD-001` in `packages/core/test/workload.test.ts`
  - Existing behavioral rows: `WF-PLAN-DET-007`, `WF-PLAN-FAIL-008`
- Related application tests after slice 6:
  - none; `Workload` is not yet persisted or exposed through application commands.
- Slice 7 test bindings:
  - no new public behavior row; boundary audit updates this plan and the affected matrix notes.
  - `packages/core/test/deployment.test.ts` extends `DMBH-DEPLOY-001` to prove the low-risk
    `Deployment`/`RuntimePlan` boundary cleanup keeps runtime-plan validation and execution
    metadata merging unchanged.
- Related application tests after slice 7:
  - none for the audit itself. Existing slice-specific application tests remain the behavior guard
    for previously migrated callers.
- Slice 8 test bindings:
  - `DMBH-CONTEXT-001` in `packages/core/test/context-ownership.test.ts`
  - Existing behavioral rows: `DEP-CREATE-ADM-022`, `SOURCE-LINK-STATE-011`
- Related application tests after slice 8:
  - `packages/application/test/create-deployment.test.ts`
  - `packages/application/test/relink-source-link.test.ts`
- Slice 9 test bindings:
  - `DMBH-DOMAIN-002` in `packages/core/test/domain-binding.test.ts`
  - Existing behavioral rows: `ROUTE-TLS-CMD-021`, `ROUTE-TLS-ENTRY-016`,
    `ROUTE-TLS-ENTRY-017`, `ROUTE-TLS-ENTRY-022`
- Related application tests after slice 9:
  - `packages/application/test/domain-binding-lifecycle.test.ts`
  - `packages/application/test/create-domain-binding.test.ts`
- Slice 10 test bindings:
  - `DMBH-CERT-001` in `packages/core/test/certificate.test.ts`
  - Existing behavioral rows: `ROUTE-TLS-EVT-005`, `ROUTE-TLS-EVT-006`,
    `ROUTE-TLS-EVT-007`, `ROUTE-TLS-EVT-010`, `ROUTE-TLS-SCHED-003`
- Related application tests after slice 10:
  - `packages/application/test/issue-or-renew-certificate.test.ts`
- Slice 11 test bindings:
  - `DMBH-IDENTITY-001` in `packages/core/test/organization.test.ts`
  - Matrix row: `IDENTITY-DOMAIN-001` in `docs/testing/identity-governance-test-matrix.md`
  - No public command/query matrix row applies yet; the organization aggregate is foundational
    core-only model state in this release line.
- Related application tests after slice 11:
  - none; no application operation currently exposes organization membership or plan changes.
- Continuous A test bindings:
  - `DMBH-DOMAIN-003` in `packages/core/test/domain-binding.test.ts`
  - Matrix rows: `ROUTE-TLS-CMD-007`, `ROUTE-TLS-CMD-010`, `ROUTE-TLS-CMD-016`
- Related application tests after Continuous A:
  - `packages/application/test/confirm-domain-binding-ownership.test.ts`
- Continuous B test bindings:
  - Existing `Resource` tests in `packages/core/test/resource.test.ts`
  - Matrix row: `RES-CREATE-ADM-025` in `docs/testing/resources.create-test-matrix.md`
- Related application tests after Continuous B:
  - `packages/application/test/create-resource.test.ts`
- Continuous C test bindings:
  - `DMBH-RES-001` in `packages/core/test/resource.test.ts`
- Related application tests after Continuous C:
  - none; this is a core-internal predicate refactor covered by existing resource behavior tests.
- Continuous D test bindings:
  - `DMBH-DOMAIN-001` and route failure/retry rows in `packages/core/test/domain-binding.test.ts`
  - Matrix rows: `ROUTE-TLS-EVT-012`, `ROUTE-TLS-EVT-014`, `ROUTE-TLS-CMD-023`
- Related application tests after Continuous D:
  - `packages/application/test/confirm-domain-binding-ownership.test.ts`
  - `packages/application/test/domain-binding-lifecycle.test.ts`

## Risks And Migration Gaps

- Some `toState()` usage is intentional boundary serialization. Do not remove it mechanically.
- Some application query services build read DTOs and may keep boundary state reads.
- Runtime adapters may serialize deployment state for provider execution; those are adapter boundaries, not domain-policy owners.
- Boundary audit classification:
  - `packages/persistence/pg/**`, repository mutation specs, read-model/query mapping, runtime
    adapters, contract/transport rendering, fixtures, and assertions may keep `toState()`.
  - `packages/application/src/operations/deployments/deployment-config-bootstrap.service.ts`,
    `deployment.factory.ts`, `deployment-plan.query-service.ts`, and related read-side builders use
    state reads to build command/query DTOs, context metadata, or repository specs; those are
    allowed application orchestration/read-model boundaries unless they branch on aggregate policy.
  - Slice 8 migrated context ownership checks in `deployment-context.resolver.ts` and
    `source-links/relink-source-link.use-case.ts` behind `Environment`, `Resource`, and
    `Destination` behavior.
  - Slice 9 migrated route redirect-target checks in `create-domain-binding.use-case.ts` and
    `configure-domain-binding-route.use-case.ts` behind `DomainBinding` behavior.
  - Slice 10 migrates certificate attempt selection in
    `issue-certificate-on-certificate-requested.handler.ts` behind `Certificate` behavior.
  - Slice 11 migrates identity-governance membership/seat calculations in
    `packages/core/src/identity-governance/organization.ts` behind `Organization`,
    `OrganizationMember`, and `OrganizationPlan` behavior.
  - Continuous A migrates domain-binding ownership-confirmation attempt selection in
    `confirm-domain-binding-ownership.use-case.ts` behind `DomainBinding` behavior.
  - Continuous B migrates resource service cardinality admission in `create-resource.use-case.ts`
    behind `Resource` and `ResourceKindValue` behavior.
  - Continuous C migrates internal-port requirement literals behind `ResourceKindValue` and
    `ResourceServiceKindValue`.
  - Continuous D migrates domain-binding lifecycle gate status sets behind
    `DomainBindingStatusValue`.
  - Core value objects may compare their own primitive state internally. Those reads are not
    boundary leaks.
- A `.codex/skills/domain-driven-develop/SKILL.md` project copy is absent; the current local skill lives under `.agents/skills/domain-driven-develop/SKILL.md`.
