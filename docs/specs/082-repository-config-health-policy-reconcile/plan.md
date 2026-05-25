# Repository Config Health Policy Reconcile Plan

## Scope

Add repository config workflow support for applying declared HTTP health policy to existing
Resources through `resources.configure-health`.

## Source Of Truth

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-020: Resource Health Observation](../../decisions/ADR-020-resource-health-observation.md)
- [ADR-073: Repository Config Health Policy Reconcile](../../decisions/ADR-073-repository-config-health-policy-reconcile.md)
- [resources.configure-health Command Spec](../../commands/resources.configure-health.md)
- [Deployment Config File Bootstrap Workflow](../../workflows/deployment-config-file-bootstrap.md)
- [Deployment Config File Test Matrix](../../testing/deployment-config-file-test-matrix.md)

## Design

Repository config remains an entry workflow over accepted operations:

1. Parse `health`, `runtime.healthCheck`, or `runtime.healthCheckPath`.
2. Normalize to Resource HTTP health policy.
3. For a newly created Resource, include the policy in the Resource create runtime profile.
4. For an existing Resource, keep fail-first profile drift unless the operator selected explicit
   profile apply.
5. In explicit profile apply, compare Resource readback with desired policy.
6. Dispatch `resources.configure-health` only when the policy differs.
7. Return ids-only `deployments.create` input.

## Package Impact

| Package | Change |
| --- | --- |
| `packages/contracts` | Add `resources.configureHealth` as a shared Quick Deploy workflow step. |
| `packages/adapters/cli` | Normalize config health policy and execute `ConfigureResourceHealthCommand` through the command bus. |
| `docs/**` | ADR/spec/test matrix/workflow/public docs/skill sync. |

## Operation Catalog

No new operation key. This is a workflow/profile extension over the existing
`resources.configure-health` command and `resources.health` readback surface.

## Compatibility

Pre-1.0 additive behavior. Existing default config deploy remains fail-first for Resource profile
drift. Explicit profile apply becomes more complete by applying health policy instead of silently
leaving it stale.

## Test Strategy

- Contract workflow test for `resources.configureHealth` sequencing.
- CLI config deploy test for health policy command dispatch before ids-only deployment input.
- CLI config deploy idempotency test for matching policy.
- Existing parser/seed tests for health policy defaults.

## Deferred Gaps

- Environment and preview overlays.
- Command-style health checks.
- Target-specific live health probe execution during config deploy.
