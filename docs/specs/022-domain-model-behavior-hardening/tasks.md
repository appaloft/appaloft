# Tasks: Domain Model Behavior Hardening

## Source Of Truth

- [x] Update local `domain-driven-develop` skill with tactical behavior placement rules.
- [x] Create this feature artifact directory.
- [x] Update `docs/DOMAIN_MODEL.md` with model-hardening and `toState()` boundary rules.
- [x] Update affected test matrices with domain-hardening rows and bindings.

## Slice 1: Resource Deployment Admission Behavior

- [x] `DMBH-RES-001`: add Resource behavior tests at `packages/core/test/resource.test.ts`.
- [x] Add `Resource` or owned value-object methods for source descriptor, detector enrichment,
  internal-port requirement, and requested deployment profile questions.
- [x] Refactor `packages/application/src/operations/deployments/create-deployment.use-case.ts` to call those methods.
- [x] Refactor `packages/application/src/operations/deployments/deployment-plan.query-service.ts` to call those methods.
- [x] Run `bun test packages/core/test/resource.test.ts`.
- [x] Run `bun test packages/application/test/create-deployment.test.ts`.
- [x] Run `bun test packages/contracts/test/deployment-plan-preview-contract.test.ts`.

## Slice 2: Deployment Target Edge Proxy Behavior

- [x] `DMBH-TARGET-001`: add DeploymentTarget behavior tests at
  `packages/core/test/deployment-target.test.ts`.
- [x] Add `DeploymentTarget` or owned edge-proxy value behavior for generated-route and bootstrap
  proxy eligibility.
- [x] Refactor deployment create/plan generated-route callers to ask `DeploymentTarget` for route
  proxy selection.
- [x] Refactor default access route resolution to ask `DeploymentTarget` for proxy route eligibility.
- [x] Refactor proxy bootstrap use case and registration handler to ask `DeploymentTarget` for
  bootstrap eligibility.
- [x] Run `bun test packages/core/test/deployment-target.test.ts`.
- [x] Run `bun test packages/application/test/bootstrap-server-proxy.test.ts`.
- [x] Run `bun test packages/application/test/server-edge-proxy-bootstrap.test.ts`.
- [x] Run `bun test packages/application/test/create-deployment.test.ts`.
- [x] Run `bun test packages/contracts/test/deployment-plan-preview-contract.test.ts`.

## Slice 3: Domain Binding Certificate And Ready Behavior

- [x] `DMBH-DOMAIN-001`: add DomainBinding behavior tests at
  `packages/core/test/domain-binding.test.ts`.
- [x] Add `DomainBinding` or owned value behavior for certificate admission and certificate
  requirement.
- [x] Add `DomainBinding` behavior for domain-bound, certificate-issued/imported, and route
  realization ready gates.
- [x] Refactor certificate issue/import use cases to ask `DomainBinding` for certificate
  admission/context.
- [x] Refactor domain-ready event handlers to ask `DomainBinding` for readiness gates.
- [x] Run `bun test packages/core/test/domain-binding.test.ts`.
- [x] Run `bun test packages/application/test/confirm-domain-binding-ownership.test.ts`.
- [x] Run `bun test packages/application/test/issue-or-renew-certificate.test.ts`.

## Slice 4: Configuration Identity And Precedence Behavior

- [x] `DMBH-CONFIG-001`: add EnvironmentConfigSet behavior tests at
  `packages/core/test/environment-config-set.test.ts`.
- [x] Add configuration entry/snapshot-entry behavior for variable identity, scope matching,
  precedence ordering, and snapshot equality.
- [x] Refactor `EnvironmentConfigSet` set/unset/snapshot/diff internals to call intention methods
  instead of peeling entry state for domain decisions.
- [x] Run `bun test packages/core/test/environment-config-set.test.ts`.
- [x] Run `bun test packages/application/test/environment-effective-precedence.test.ts`.
- [x] Run `bun test packages/application/test/resource-config.test.ts`.

## Slice 5: Deployment Execution Continuation And Supersede Behavior

- [x] `DMBH-DEPLOY-001`: add Deployment behavior tests at
  `packages/core/test/deployment.test.ts`.
- [x] Add `Deployment` or `DeploymentStatusValue` behavior for execution-continuation and
  supersede cancellation questions.
- [x] Refactor deployment execution guard to call deployment behavior instead of branching on raw
  status values.
- [x] Refactor deployment create supersede flow to ask the active deployment whether runtime
  cancellation is required.
- [x] Run `bun test packages/core/test/deployment.test.ts`.
- [x] Run `bun test packages/application/test/create-deployment.test.ts`.

## Slice 6: Workload Runtime Compatibility Behavior

- [x] `DMBH-WORKLOAD-001`: add Workload behavior tests at
  `packages/core/test/workload.test.ts`.
- [x] Add `Workload`, `WorkloadKindValue`, and `RuntimeSpec` behavior for workload/runtime
  compatibility and web-server port requirements.
- [x] Refactor workload declaration to call intention methods instead of branching on raw kind and
  runtime state.
- [x] Run `bun test packages/core/test/workload.test.ts`.

## Later Slices

- [ ] Slice 7: audit remaining `toState()` usage and classify boundary allowances.

## Verification

- [x] Run affected core tests for each slice.
- [x] Run affected application command/query tests for each slice.
- [x] Run affected contract/API/CLI tests when a public surface is touched by implementation.
- [x] Run `bun run --cwd packages/core typecheck`.
- [x] Run `bun run --cwd packages/application typecheck`.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Keep this task list current after every slice.
- [x] Update matrix notes with automated test bindings.
- [x] Update remaining migration gaps after every slice.
