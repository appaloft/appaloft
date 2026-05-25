# Plan: Blueprint Component Relations

## Governing Sources

- [ADR-065: Blueprint Format And Local Registry Boundary](../../decisions/ADR-065-blueprint-format-and-local-registry-boundary.md)
- [ADR-078: Blueprint Component Relation Boundary](../../decisions/ADR-078-blueprint-component-relation-boundary.md)
- [Blueprint Component Relations Spec](./spec.md)
- [Dependency Resource Binding Baseline](../034-dependency-resource-binding-baseline/spec.md)
- [Dependency Binding Runtime Injection](../047-dependency-binding-runtime-injection/spec.md)
- [Deployment Plan Preview](../013-deployment-plan-preview/spec.md)
- [Blueprint Component Relation Test Matrix](../../testing/blueprint-component-relation-test-matrix.md)

## Architecture Approach

- Keep the implementation inside `@appaloft/blueprints` as a neutral package capability.
- Add `componentRelations` to root manifests and variant overrides.
- Reuse existing slug and environment-key validation conventions.
- Keep relation validation in the existing topology reference validation path so selected variants
  validate against their selected components and resources.
- Add `BlueprintComponentRelationGraph` as the neutral class that describes required lifecycle
  topology, exposes the topological sort rule, and returns sorted component ids or cycle details.
- Extend `resolveBlueprintVariantManifest` to preserve the selected relation set.
- Extend `createBlueprintInstallPlan` to emit `configure-component-link` operations.
- Extend `createBlueprintApplicationBundlePlan` to project `component-links-component`
  relationships from install-plan operations.
- Extend dry-run upgrade planning to classify added, removed, or changed required relations as
  `potentially-breaking`.
- Add `createBlueprintComponentRuntimeProjection()` as the neutral bridge from bundle relationships
  to per-component runtime env, discovery, network, readiness, and telemetry instructions.
- Allow runtime plans to carry a serialized component runtime plan through metadata so runtime
  targets can consume the same public contract.
- Extend the Docker Swarm runtime target as the first target-specific consumer of the neutral
  projection.
- Add neutral sample manifests under `packages/blueprints/samples/`.

## Public Contract Impact

- Manifest schema adds `componentRelations?: BlueprintComponentRelation[]`.
- Variant schema adds `componentRelations?: BlueprintComponentRelation[]`.
- JSON Schema output must include relation and effect shapes.
- Install plan schema adds `configure-component-link`.
- Application bundle relationships add `component-links-component`.
- Runtime projection adds `BlueprintComponentRuntimePlan` plus metadata helpers.
- No public command, query, API, CLI, Web, or MCP operation is added in this slice.

## Runtime And Provider Impact

Runtime targets consume component relation effects through `BlueprintComponentRuntimePlan`, not by
re-parsing manifests or inventing private relation semantics. The projection remains neutral and
serializable; runtime targets decide how to express env variables, service discovery, network
attachment, readiness checks, and telemetry endpoint configuration.

Docker Swarm now consumes the projection from runtime metadata and renders relation env vars,
private network attachments, readiness wait steps, telemetry env vars, and relation labels.
Additional targets can adopt the same projection later without changing the Blueprint manifest.

## Test Strategy

| ID | Automation | Binding |
| --- | --- | --- |
| BP-COMP-REL-SCHEMA-001 | unit | `packages/blueprints/test/blueprint-manifest.test.ts` |
| BP-COMP-REL-SCHEMA-002 | unit | `packages/blueprints/test/blueprint-manifest.test.ts` |
| BP-COMP-REL-SCHEMA-003 | unit | `packages/blueprints/test/blueprint-manifest.test.ts` |
| BP-COMP-REL-SCHEMA-004 | unit | `packages/blueprints/test/blueprint-manifest.test.ts` |
| BP-COMP-REL-SCHEMA-005 | unit | `packages/blueprints/test/blueprint-manifest.test.ts` |
| BP-COMP-REL-SCHEMA-006 | unit | `packages/blueprints/test/blueprint-manifest.test.ts` |
| BP-COMP-REL-SCHEMA-007 | unit | `packages/blueprints/test/blueprint-manifest.test.ts` |
| BP-COMP-REL-LOADER-001 | unit | `packages/blueprints/test/blueprint-manifest.test.ts` |
| BP-COMP-REL-PLAN-001 | unit | `packages/blueprints/test/blueprint-install-plan.test.ts` |
| BP-COMP-REL-PLAN-002 | unit | `packages/blueprints/test/blueprint-install-plan.test.ts` |
| BP-COMP-REL-BUNDLE-001 | unit | `packages/blueprints/test/blueprint-install-plan.test.ts` |
| BP-COMP-REL-SAMPLE-001 | unit | `packages/blueprints/test/blueprint-samples.test.ts` |
| BP-COMP-REL-SAMPLE-002 | unit | `packages/blueprints/test/blueprint-samples.test.ts` |
| BP-COMP-REL-SAMPLE-003 | unit | `packages/blueprints/test/blueprint-samples.test.ts` |
| BP-COMP-REL-RUNTIME-001 | unit | `packages/blueprints/test/blueprint-component-runtime.test.ts` |
| BP-COMP-REL-RUNTIME-002 | unit | `packages/adapters/runtime/test/docker-swarm-runtime-intent.test.ts` |
| SWARM-COMP-REL-RUNTIME-001 | unit | `packages/adapters/runtime/test/docker-swarm-runtime-intent.test.ts` |

## Risks And Migration Gaps

- Runtime target adoption is incremental. Docker Swarm consumes the projection in this round; other
  targets can remain unchanged until they add target-specific lowering.
- Existing manifests without relations must stay valid.
- Relation ids should be stable because downstream bundle projections may use them for display,
  audit, or upgrade comparison.
- Required lifecycle ordering is modeled through `BlueprintComponentRelationGraph.topologicalSort()`
  and reflected in dry-run deployment operation order. Runtime projections also expose readiness
  gates so targets can render concrete platform behavior.
- Duplicate runtime variable conflicts can be detected at validation or plan time. The first
  implementation should reject duplicate relation-injected env names for the same component when
  the conflict is visible in the manifest.
