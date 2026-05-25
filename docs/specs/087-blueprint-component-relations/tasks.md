# Tasks: Blueprint Component Relations

## Source Of Truth

- [x] Add ADR for neutral Blueprint component relation boundary.
- [x] Add feature spec with manifest shape, direction semantics, validation rules, plan contract,
  application bundle projection, and gap assessment.
- [x] Add implementation plan and test matrix bindings.
- [x] Update public Blueprint domain language docs after implementation proves the final type names.

## Test-First

- [x] BP-COMP-REL-SCHEMA-001: add valid endpoint relation schema test.
- [x] BP-COMP-REL-SCHEMA-002: add invalid missing component test.
- [x] BP-COMP-REL-SCHEMA-003: add invalid missing endpoint test.
- [x] BP-COMP-REL-SCHEMA-004: add invalid required lifecycle cycle test.
- [x] BP-COMP-REL-SCHEMA-005: add invalid effect output test.
- [x] BP-COMP-REL-SCHEMA-006: add invalid duplicate relation id test.
- [x] BP-COMP-REL-SCHEMA-007: add invalid dependency-resource target test.
- [x] BP-COMP-REL-LOADER-001: add YAML loader test for component relations.
- [x] BP-COMP-REL-PLAN-001: add install plan compiler test for endpoint relation and `inject-env`.
- [x] BP-COMP-REL-PLAN-002: add install plan compiler test for lifecycle relation.
- [x] BP-COMP-REL-BUNDLE-001: add application bundle projection test for component links.
- [x] BP-COMP-REL-SAMPLE-001: add PocketBase plus bundled Jaeger sample validation and dry-run plan.
- [x] BP-COMP-REL-SAMPLE-002: add OpenClaw-like multi-component sample validation and dry-run plan.
- [x] BP-COMP-REL-SAMPLE-003: add worker readiness sample validation and dry-run plan.
- [x] BP-COMP-REL-RUNTIME-001: add neutral runtime projection test for env, discovery, network,
  readiness, and telemetry effects.
- [x] BP-COMP-REL-RUNTIME-002 / SWARM-COMP-REL-RUNTIME-001: add Docker Swarm target test for
  consuming component runtime metadata.

## Implementation

- [x] Extend Blueprint manifest and variant schemas with `componentRelations`.
- [x] Add relation effect schemas and exported TypeScript types.
- [x] Validate relation id uniqueness, component references, endpoint references, dependency-resource
  non-targeting, required lifecycle cycles, and effect output compatibility.
- [x] Add `BlueprintComponentRelationGraph` with required lifecycle topology sort description,
  `topologicalSort()`, `describeTopologicalSort()`, and required/optional lifecycle edge helpers.
- [x] Preserve selected variant relation sets in `resolveBlueprintVariantManifest`.
- [x] Extend `BlueprintInstallOperation` with `configure-component-link`.
- [x] Compile relations into deterministic dry-run operations.
- [x] Extend `BlueprintApplicationBundleRelationship` with `component-links-component`.
- [x] Preserve component link relationships in application bundle plans.
- [x] Add `BlueprintComponentRuntimePlan` and runtime projection helpers for component relation
  effects.
- [x] Add runtime metadata serialization helpers for component runtime plans.
- [x] Extend Docker Swarm runtime intent/apply plan rendering to consume the neutral projection.
- [x] Extend upgrade plan diffs for added, removed, or changed relations.
- [x] Add neutral sample manifests.

## Verification

- [x] Run `bun test packages/blueprints/test/blueprint-manifest.test.ts`.
- [x] Run `bun test packages/blueprints/test/blueprint-install-plan.test.ts`.
- [x] Run `bun test packages/blueprints/test/blueprint-samples.test.ts`.
- [x] Run `bun --cwd packages/blueprints test`.
- [x] Run `bun run --cwd packages/blueprints typecheck`.
- [x] Run `bun run --cwd packages/blueprints lint`.
- [x] Run `bun --cwd packages/adapters/runtime test docker-swarm-runtime-intent.test.ts`.
- [x] Run `bun run --cwd packages/adapters/runtime typecheck`.
- [x] Run `bun run --cwd packages/adapters/runtime lint`.

## Post-Implementation Sync

- [x] Mark matrix rows passing with exact test names.
- [x] Reconcile spec and plan if implementation narrows effect names or output names.
- [x] Confirm public files remain portable, local-registry friendly, and free of product-state or
  installation-persistence semantics.
