# Application Bundle Storage Binding Boundary

## Status

- Behavior id: `097-application-bundle-storage-binding-boundary`
- Round: Code + Sync
- Artifact state: implemented second slice for the storage/dependency boundary correction
- Roadmap target: public Blueprint/Application Bundle install plan correctness
- Compatibility impact: compatible read-model addition and naming correction
- Decision state: governed by ADR-083

## Business Outcome

A public application bundle plan must describe service dependencies and mounted storage separately.
A volume-backed application such as PocketBase should plan one deployable component, zero service
DependencyResource bindings for the volume, and one storage binding to `/pb_data`.

Downstream installers, including hosted or private distributions, can then persist their own
installation readback without inventing a Cloud-only model that treats a volume as a dependency
resource.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Application bundle | Neutral plan/readback for an application installed from a Blueprint. | `@appaloft/blueprints` | bundle plan |
| DependencyBinding | Component relationship to a service DependencyResource. | Application bundle / installer readback | service dependency binding |
| StorageBinding | Component relationship to StorageVolume plus ResourceStorageAttachment intent/readback. | Application bundle / installer readback | storage mount binding |
| Component storage mount | Component-owned storage requirement with workload destination path and mount mode. | Blueprint component plan | `storageMounts` |
| Legacy volume-as-dependency readback | Older compatibility shape where a volume appears under dependencies. | Migration only | `dependencyResourceId` for volume |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| APP-BUNDLE-STORAGE-SOT-001 | Source of truth records bundle split | Storage visibility work exists | This phase starts | Spec/plan/tasks define dependency bindings and storage bindings separately with compatibility migration. |
| APP-BUNDLE-STORAGE-PLAN-001 | Application bundle plan separates storage | A Blueprint component has a `volume` requirement and a storage mount | `createBlueprintApplicationBundlePlan` runs | The component exposes storage mount/binding readback separately from service dependency bindings. |
| APP-BUNDLE-STORAGE-PLAN-002 | Service dependencies remain dependencies | A Blueprint component uses Postgres and Redis requirements | The bundle plan is generated | Service requirements stay in dependency binding readback and do not become StorageBindings. |
| APP-BUNDLE-STORAGE-PLAN-003 | Volume requirements do not create dependency bindings | A Blueprint component lists a `volume` under `usesResources` and mounts it | The install plan and bundle plan are generated | No `bind-dependency`, dependency bundle entry, dependency readiness wait, or runtime dependency env is generated for that `volume`; storage readback carries the storage requirement id. |
| APP-BUNDLE-STORAGE-RUNTIME-001 | Runtime projection uses storage language | A bundle contains storage mounts | Component runtime projection is created | Runtime storage mounts expose `storageRequirementId` and a storage binding reference while retaining deprecated dependency aliases only for compatibility. |
| APP-BUNDLE-STORAGE-SNAPSHOT-001 | Downstream installer can persist separate bindings | An installer accepts a bundle plan with dependencies and storage | It records installation snapshot/readback | Snapshot can store dependency bindings and storage bindings separately while legacy readers can transform old volume dependency shapes during a compatibility window. |
| APP-BUNDLE-STORAGE-UPGRADE-001 | Upgrade dry-run preserves storage bindings | A user previews an upgrade for a volume-backed application | Upgrade planning compares current and target bundle state | Storage preservation/review is reported separately from service dependency changes. |

## Domain Ownership

- Bounded context: public Blueprint / Application Bundle planning.
- Related owners:
  - `@appaloft/blueprints` owns neutral manifest, install-plan, application-bundle, and upgrade
    planning contracts.
  - `StorageVolume` and `ResourceStorageAttachment` remain owned by Workload Delivery / Storage
    Volume Lifecycle.
  - `ResourceInstance` and `ResourceBinding` remain owned by Dependency Resources.
- Downstream contexts:
  - Hosted, self-hosted, or private installers consume the public application-bundle plan and may
    persist distribution-specific installation readback.

## Public Surfaces

- Package/API: `BlueprintApplicationBundlePlan` must preserve storage binding information as
  storage, not as dependency resource readback. The canonical readback is `storageBindings` plus
  component `storageMounts.storageRequirementId`; legacy `requirementId` aliases are compatibility
  only.
- CLI/HTTP/Web: no public installer command is introduced in this slice unless an existing surface
  already exposes bundle planning.
- Config: Blueprint `volume` requirements and component `storageMounts` remain the input shape.
- Events: not applicable in this public planning slice.
- Public docs/help: Blueprint docs must distinguish storage requirements from service dependency
  resources.

## Non-Goals

- No storage backup/restore execution.
- No provider-specific volume provisioning.
- No downstream distribution persistence migration inside public Appaloft.
- No Cloud-only patch if the public bundle contract is insufficient.

## Open Questions

- How long downstream compatibility readers should preserve legacy volume-as-dependency shapes.
