# Blueprint Component Relation Test Matrix

## Normative Contract

Tests for Blueprint component relations must prove that a Blueprint can express directed
component-to-component links inside one installation while dependency resources remain separate and
dry-run planning remains neutral.

## Global References

- [Blueprint Component Relations Spec](../specs/087-blueprint-component-relations/spec.md)
- [ADR-078: Blueprint Component Relation Boundary](../decisions/ADR-078-blueprint-component-relation-boundary.md)
- [ADR-065: Blueprint Format And Local Registry Boundary](../decisions/ADR-065-blueprint-format-and-local-registry-boundary.md)

## Schema And Loader Matrix

| Test ID | Preferred automation | Case | Expected result | Test binding | Status |
| --- | --- | --- | --- | --- | --- |
| BP-COMP-REL-SCHEMA-001 | unit | Endpoint relation from worker to API | Manifest validates, defaults `required` to true, and preserves `inject-env`. | `packages/blueprints/test/blueprint-manifest.test.ts` `[BP-COMP-REL-SCHEMA-001] validates endpoint component relations` | passing |
| BP-COMP-REL-SCHEMA-002 | unit | Relation references missing component | Validation fails with a structured component relation issue. | `packages/blueprints/test/blueprint-manifest.test.ts` `[BP-COMP-REL-SCHEMA-002][BP-COMP-REL-SCHEMA-003][BP-COMP-REL-SCHEMA-005] rejects invalid component relations` | passing |
| BP-COMP-REL-SCHEMA-003 | unit | Relation references missing provider endpoint | Validation fails and does not resolve the endpoint through dependency resources. | `packages/blueprints/test/blueprint-manifest.test.ts` `[BP-COMP-REL-SCHEMA-002][BP-COMP-REL-SCHEMA-003][BP-COMP-REL-SCHEMA-005] rejects invalid component relations` | passing |
| BP-COMP-REL-SCHEMA-004 | unit | Required lifecycle cycle | Validation fails with a required lifecycle cycle issue. | `packages/blueprints/test/blueprint-manifest.test.ts` `[BP-COMP-REL-SCHEMA-004] rejects required lifecycle cycles and exposes topology sorting` | passing |
| BP-COMP-REL-SCHEMA-005 | unit | Effect references unavailable output | Validation fails when an effect uses output not provided by the relation. | `packages/blueprints/test/blueprint-manifest.test.ts` `[BP-COMP-REL-SCHEMA-002][BP-COMP-REL-SCHEMA-003][BP-COMP-REL-SCHEMA-005] rejects invalid component relations` | passing |
| BP-COMP-REL-SCHEMA-006 | unit | Duplicate relation id | Validation fails with a structured uniqueness issue. | `packages/blueprints/test/blueprint-manifest.test.ts` `[BP-COMP-REL-SCHEMA-006][BP-COMP-REL-SCHEMA-007] rejects duplicate relation ids and dependency resource targets` | passing |
| BP-COMP-REL-SCHEMA-007 | unit | Relation points to dependency resource | Validation fails and instructs authors to use component dependency binding for resources. | `packages/blueprints/test/blueprint-manifest.test.ts` `[BP-COMP-REL-SCHEMA-006][BP-COMP-REL-SCHEMA-007] rejects duplicate relation ids and dependency resource targets` | passing |
| BP-COMP-REL-LOADER-001 | unit | YAML relation authoring | YAML loader returns the same typed relation defaults as JSON validation. | `packages/blueprints/test/blueprint-manifest.test.ts` `[BP-COMP-REL-LOADER-001] loads YAML component relations` | passing |

## Plan And Bundle Matrix

| Test ID | Preferred automation | Case | Expected result | Test binding | Status |
| --- | --- | --- | --- | --- | --- |
| BP-COMP-REL-PLAN-001 | unit | Endpoint relation install plan | `createBlueprintInstallPlan` emits `configure-component-link` with an `inject-env` effect before dependent deployment intent. | `packages/blueprints/test/blueprint-install-plan.test.ts` `[BP-COMP-REL-PLAN-001] compiles endpoint component links into dry-run plan operations` | passing |
| BP-COMP-REL-PLAN-002 | unit | Lifecycle relation install plan | Required startup ordering is preserved as `order-after` or `readiness-gate` without required cycles. | `packages/blueprints/test/blueprint-install-plan.test.ts` `[BP-COMP-REL-PLAN-002] topologically orders required lifecycle component links` | passing |
| BP-COMP-REL-BUNDLE-001 | unit | Application bundle relation projection | `createBlueprintApplicationBundlePlan` emits `component-links-component` relationships and keeps application ownership separate. | `packages/blueprints/test/blueprint-install-plan.test.ts` `[BP-COMP-REL-BUNDLE-001] projects component links into application bundle relationships` | passing |

## Sample Matrix

| Test ID | Preferred automation | Case | Expected result | Test binding | Status |
| --- | --- | --- | --- | --- | --- |
| BP-COMP-REL-SAMPLE-001 | unit | PocketBase plus bundled Jaeger sample | Validation succeeds and dry-run plan includes telemetry relation from PocketBase to Jaeger. | `packages/blueprints/test/blueprint-samples.test.ts` `[BP-COMP-REL-SAMPLE-001] PocketBase plus bundled Jaeger validates and plans telemetry relation` | passing |
| BP-COMP-REL-SAMPLE-002 | unit | OpenClaw-like web/API/worker plus DB binding sample | Validation succeeds, DB remains a dependency resource, and web/worker link to API through component relations. | `packages/blueprints/test/blueprint-samples.test.ts` `[BP-COMP-REL-SAMPLE-002] multi-component sample keeps database as dependency resource` | passing |
| BP-COMP-REL-SAMPLE-003 | unit | Worker waits for API readiness sample | Validation succeeds and dry-run plan preserves a required lifecycle relation. | `packages/blueprints/test/blueprint-samples.test.ts` `[BP-COMP-REL-SAMPLE-003] worker readiness sample preserves lifecycle order` | passing |

## Runtime Matrix

| Test ID | Preferred automation | Case | Expected result | Test binding | Status |
| --- | --- | --- | --- | --- | --- |
| BP-COMP-REL-RUNTIME-001 | unit | Runtime projection from bundle relationships | Projection lowers endpoint, lifecycle, network, discovery, and telemetry effects into per-component runtime plans. | `packages/blueprints/test/blueprint-component-runtime.test.ts` `[BP-COMP-REL-RUNTIME-001] lowers relation effects into neutral component runtime plans` | passing |
| BP-COMP-REL-RUNTIME-002 | unit | Runtime metadata consumption | Docker Swarm target reads a component runtime plan from runtime metadata. | `packages/adapters/runtime/test/docker-swarm-runtime-intent.test.ts` `[BP-COMP-REL-RUNTIME-002][SWARM-COMP-REL-RUNTIME-001] renders Blueprint component relation runtime effects into Swarm intent` | passing |
| SWARM-COMP-REL-RUNTIME-001 | unit | Docker Swarm relation lowering | Swarm intent/apply plan renders env injection, private network attachment, readiness wait step, telemetry env, and relation labels. | `packages/adapters/runtime/test/docker-swarm-runtime-intent.test.ts` `[BP-COMP-REL-RUNTIME-002][SWARM-COMP-REL-RUNTIME-001] renders Blueprint component relation runtime effects into Swarm intent` | passing |

## Current Gaps

- Runtime target adoption beyond Docker Swarm remains incremental and should consume the same
  neutral component runtime projection.
- Relation-level UI or API presentation belongs to downstream projections, not the neutral public
  Blueprint package.
