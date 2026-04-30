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

## Slice 7: Boundary Audit

- [x] Audit remaining `toState()` and primitive `.value` decision reads across core, application,
  persistence, adapter, provider, integration, plugin, shell, and web packages.
- [x] Classify persistence/read-model/adapter/DTO/test `toState()` usage as allowed boundary reads.
- [x] Record remaining non-boundary hotspots as future slices instead of rewriting the whole
  repository mechanically.
- [x] Harden the low-risk `Deployment`/`RuntimePlan` state-read cleanup found during the audit.
- [x] Run `bun test packages/core/test/deployment.test.ts`.

## Slice 8: Context Ownership Behavior

- [x] `DMBH-CONTEXT-001`: add context ownership behavior tests at
  `packages/core/test/context-ownership.test.ts`.
- [x] Add `Environment`, `Resource`, and `Destination` behavior for project/environment/server
  membership and destination placement compatibility.
- [x] Refactor `DeploymentContextResolver` to call context ownership methods instead of peeling
  aggregate ids from state for domain decisions.
- [x] Refactor `RelinkSourceLinkUseCase` to call context ownership methods instead of peeling
  aggregate ids from state for domain decisions.
- [x] Run `bun test packages/core/test/context-ownership.test.ts`.
- [x] Run `bun test packages/application/test/create-deployment.test.ts`.
- [x] Run `bun test packages/application/test/relink-source-link.test.ts`.

## Slice 9: Domain Binding Redirect Target Behavior

- [x] `DMBH-DOMAIN-002`: add DomainBinding canonical redirect target behavior tests at
  `packages/core/test/domain-binding.test.ts`.
- [x] Add `DomainBinding` behavior for served canonical redirect target eligibility.
- [x] Refactor domain binding create and route configuration use cases to ask `DomainBinding`
  whether a found target can serve redirects instead of peeling target state.
- [x] Run `bun test packages/core/test/domain-binding.test.ts`.
- [x] Run `bun test packages/application/test/domain-binding-lifecycle.test.ts`.
- [x] Run `bun test packages/application/test/create-domain-binding.test.ts`.

## Slice 10: Certificate Attempt Worker Selection Behavior

- [x] `DMBH-CERT-001`: add Certificate attempt worker-selection behavior tests at
  `packages/core/test/certificate.test.ts`.
- [x] Add `Certificate` and owned attempt-status behavior for requested/issuing worker claim,
  terminal attempt skips, missing attempt lookup, and issue-context preparation.
- [x] Refactor `issue-certificate-on-certificate-requested.handler.ts` to ask `Certificate`
  whether an attempt can be processed instead of peeling attempt status primitives.
- [x] Run `bun test packages/core/test/certificate.test.ts`.
- [x] Run `bun test packages/application/test/issue-or-renew-certificate.test.ts`.

## Slice 11: Identity Governance Membership And Seat Behavior

- [x] `DMBH-IDENTITY-001`: add Organization membership/seat behavior tests at
  `packages/core/test/organization.test.ts`.
- [x] Add `OrganizationMember`, `OrganizationPlan`, and `Organization` behavior for matching a
  user, testing member capacity, and validating plan changes against current member count.
- [x] Refactor `Organization.addMember` and `Organization.changePlan` to call intention methods
  instead of peeling child state through `toState()` for domain decisions.
- [x] Run `bun test packages/core/test/organization.test.ts`.

## Continuous A: Domain Binding Ownership Confirmation Behavior

- [x] `DMBH-DOMAIN-003`: add DomainBinding ownership-confirmation selection behavior tests at
  `packages/core/test/domain-binding.test.ts`.
- [x] Add `DomainBinding` and owned verification-attempt behavior for explicit/latest pending
  manual attempt selection, already-bound idempotency, and DNS verification context preparation.
- [x] Refactor `confirm-domain-binding-ownership.use-case.ts` to ask `DomainBinding` for
  confirmation intent instead of peeling verification attempt status/method primitives.
- [x] Run `bun test packages/core/test/domain-binding.test.ts`.
- [x] Run `bun test packages/application/test/confirm-domain-binding-ownership.test.ts`.

## Continuous B: Resource Service Cardinality Behavior

- [x] Extend Resource service cardinality behavior tests at `packages/core/test/resource.test.ts`.
- [x] Add `ResourceKindValue` behavior for whether a resource kind can declare multiple services.
- [x] Refactor `Resource.create` to own the multi-service admission error with current
  `resources.create` error details.
- [x] Refactor `create-resource.use-case.ts` to remove duplicated resource-kind/service-count
  branching.
- [x] Run `bun test packages/core/test/resource.test.ts`.
- [x] Run `bun test packages/application/test/create-resource.test.ts`.

## Continuous C: Resource Internal-Port Requirement Behavior

- [x] Extend `DMBH-RES-001` Resource behavior tests at `packages/core/test/resource.test.ts`.
- [x] Add `ResourceKindValue` and `ResourceServiceKindValue` behavior for inbound listener port
  requirements.
- [x] Refactor `Resource.requiresInternalPort()` to compose VO methods instead of branching on raw
  kind literals.
- [x] Run `bun test packages/core/test/resource.test.ts`.

## Continuous D: Domain Binding Lifecycle Gate Behavior

- [x] Extend DomainBinding lifecycle gate behavior tests at `packages/core/test/domain-binding.test.ts`.
- [x] Add `DomainBindingStatusValue` behavior for ready marking, route failure recording,
  not-ready duplicate checks, and verification retry eligibility.
- [x] Refactor `DomainBinding` lifecycle methods to call status value methods instead of repeating
  raw status literal sets.
- [x] Run `bun test packages/core/test/domain-binding.test.ts`.
- [x] Run `bun test packages/application/test/confirm-domain-binding-ownership.test.ts`.
- [x] Run `bun test packages/application/test/domain-binding-lifecycle.test.ts`.

## Continuous E: Domain Binding Context Ownership Behavior

- [x] Reuse `DMBH-CONTEXT-001` ownership behavior tests at
  `packages/core/test/context-ownership.test.ts`.
- [x] Extend `create-domain-binding` application tests for context mismatch coverage.
- [x] Refactor `create-domain-binding.use-case.ts` to call `Environment`, `Resource`, and
  `Destination` ownership behavior instead of peeling aggregate ids from state for context
  decisions.
- [x] Run `bun test packages/core/test/context-ownership.test.ts`.
- [x] Run `bun test packages/application/test/create-domain-binding.test.ts`.

## Continuous F: Runtime Plan Value Predicate Behavior

- [x] Extend runtime plan behavior tests at `packages/core/test/runtime-plan.test.ts`.
- [x] Add `RuntimeArtifactKindValue` and `RuntimeArtifactIntentValue` predicates for artifact
  prerequisites.
- [x] Refactor `AccessRoute.create` and `RuntimeArtifactSnapshot.create` to compose owned VO
  predicates instead of branching on raw primitive values.
- [x] Run `bun test packages/core/test/runtime-plan.test.ts`.

## Continuous G: Resource Binding Scope/Injection Behavior

- [x] Add resource binding behavior tests at `packages/core/test/resource-binding.test.ts`.
- [x] Add single-VO predicates for binding scope and injection mode.
- [x] Refactor `ResourceBinding.create` to ask aggregate-owned behavior for scope/injection
  coherence.
- [x] Run `bun test packages/core/test/resource-binding.test.ts`.

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
