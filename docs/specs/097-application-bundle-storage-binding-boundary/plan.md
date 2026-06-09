# Plan: Application Bundle Storage Binding Boundary

## Governing Sources

- [ADR-083: Storage Volume, Dependency Resource, And Backup Boundary](../../decisions/ADR-083-storage-volume-dependency-resource-and-backup-boundary.md)
- [Blueprint Component Relations](../087-blueprint-component-relations/spec.md)
- [Storage Volume Lifecycle And Resource Attachment](../032-storage-volume-lifecycle-and-resource-attachment/spec.md)
- [Dependency Resource Binding Baseline](../034-dependency-resource-binding-baseline/spec.md)
- Blueprint package tests under `packages/blueprints/test/**`

## Architecture Approach

- Inspect the current `BlueprintApplicationBundlePlan` contract before changing code.
- Keep component service dependency bindings and component storage mounts/bindings as separate
  fields and relationships.
- Add a top-level `storageBindings` readback to `@appaloft/blueprints` so downstream installers can
  persist storage without scanning dependency readback.
- Keep existing `storageMounts.requirementId` and runtime `dependencyRequirementId` as deprecated
  compatibility aliases while adding canonical `storageRequirementId`.
- `volume` remains a manifest `ResourceRequirement` compatibility kind, but install planning must
  skip `bind-dependency` and dependency readiness work for `volume`.
- Keep downstream installed-application persistence out of public Appaloft except for neutral
  compatibility guidance.

## Public Contract Impact

- Package contract addition to `BlueprintApplicationBundlePlan`.
- No new command/query/API/CLI/Web operation by default.
- Blueprint docs and tests must keep `volume` out of DependencyResource language.

## Test Strategy

| ID | Automation | Binding |
| --- | --- | --- |
| APP-BUNDLE-STORAGE-PLAN-001 | unit | `packages/blueprints/test/blueprint-install-plan.test.ts` |
| APP-BUNDLE-STORAGE-PLAN-002 | unit | `packages/blueprints/test/blueprint-install-plan.test.ts` |
| APP-BUNDLE-STORAGE-PLAN-003 | unit | `packages/blueprints/test/blueprint-install-plan.test.ts` |
| APP-BUNDLE-STORAGE-RUNTIME-001 | unit | `packages/blueprints/test/blueprint-install-plan.test.ts` |
| APP-BUNDLE-STORAGE-SNAPSHOT-001 | contract/downstream planned | downstream installer compatibility tests |
| APP-BUNDLE-STORAGE-UPGRADE-001 | unit | upgrade planning tests when storage binding comparison is implemented |

## Risks And Migration Gaps

- Public bundle plan already exposes component `storageMounts` and `component-attaches-storage`
  relationships, but downstream persistence needs a top-level storage binding list to avoid
  volume-as-dependency joins.
- Downstream Cloud/Enterprise installed-application snapshots may still have legacy volume
  dependency readback. Those migrations belong in the downstream repository after the public
  contract is clear.
