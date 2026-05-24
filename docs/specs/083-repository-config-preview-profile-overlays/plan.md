# Repository Config Preview Profile Overlays Plan

## Scope

Add repository config support for `preview.pullRequest.profile` as a selected PR-preview overlay
over existing config workflow declarations.

## Source Of Truth

- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-025: Control-Plane Modes And Action Execution](../../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [ADR-066: Repository Config Dependency Graph](../../decisions/ADR-066-repository-config-dependency-graph.md)
- [ADR-067: Repository Config Storage Graph](../../decisions/ADR-067-repository-config-storage-graph.md)
- [ADR-068: Repository Config Scheduled Task Graph](../../decisions/ADR-068-repository-config-scheduled-task-graph.md)
- [ADR-071: Repository Config Generated Access Profile](../../decisions/ADR-071-repository-config-generated-access-profile.md)
- [ADR-072: Repository Config Runtime Monitoring Thresholds](../../decisions/ADR-072-repository-config-runtime-monitoring-thresholds.md)
- [ADR-073: Repository Config Health Policy Reconcile](../../decisions/ADR-073-repository-config-health-policy-reconcile.md)
- [ADR-074: Repository Config Preview Profile Overlays](../../decisions/ADR-074-repository-config-preview-profile-overlays.md)
- [Deployment Config File Bootstrap Workflow](../../workflows/deployment-config-file-bootstrap.md)
- [Deployment Config File Test Matrix](../../testing/deployment-config-file-test-matrix.md)

## Design

Repository config remains an entry workflow over accepted operations:

1. Parse root config and strict preview overlay.
2. Reject identity, raw secret, provider handle, and unsupported fields before mutation.
3. When trusted PR preview context is absent, keep root config unchanged.
4. When trusted PR preview context is present, merge `preview.pullRequest.profile` into root config
   before seed and env normalization.
5. Apply trusted CLI/Action flags after effective config so flags retain override precedence.
6. Dispatch the same existing operations as ordinary config deploy.
7. Keep final `deployments.create` ids-only.

## Package Impact

| Package | Change |
| --- | --- |
| `packages/deployment-config` | Add preview overlay schema and effective-config merge helper; update JSON schema. |
| `packages/adapters/cli` | Select the preview overlay only when trusted PR preview context exists. |
| `docs/**` | ADR/spec/test matrix/workflow/public docs/skill sync. |

## Operation Catalog

No new operation key. This is a repository config workflow/profile extension over existing
operations.

## Compatibility

Pre-1.0 additive config field. Existing configs without `preview.pullRequest.profile` are
unchanged. Existing ordinary deploys ignore preview overlays unless preview mode is selected from
trusted entrypoint context.

## Test Strategy

- Parser/schema tests for accepted overlay and strict rejection of unknown/unsafe fields.
- CLI config deploy test proving non-preview deploy ignores overlay.
- CLI PR preview test proving overlay values feed existing operations before ids-only deployment.
- Existing preview flag parity test covers flags overriding selected config profile.

## Deferred Gaps

- General named profile overlays are handled by ADR-075 and
  `docs/specs/084-repository-config-named-profile-overlays`.
- Preview-specific domains inside the overlay.
- Dependency/storage/scheduled-task overlay deltas.
- Resource sizing, rollout, restart, autoscaling, quota, cleanup, and alert routing fields.
