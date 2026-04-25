# deployments.cleanup-preview Test Matrix

## Normative Contract

`deployments.cleanup-preview` tests must prove that preview cleanup is an explicit command over
preview-scoped runtime and state cleanup, not a hidden side effect of deploy admission or resource
deletion.

Tests must prove:

- preview cleanup is keyed by a preview-scoped source fingerprint;
- missing preview link returns idempotent `already-clean`;
- runtime cleanup, server-applied route desired-state cleanup, and source-link unlink happen in the
  required order;
- cleanup sweeps stale preview deployments and preview-fingerprint route rows that remain after
  preview retargets;
- cleanup removes preview-owned inert runtime artifacts and materialized workspaces when ownership
  can be proven without touching active runtime, rollback candidates, volumes, or remote state;
- runtime cleanup failure stops later cleanup stages;
- CLI preview cleanup derives the same fingerprint/state-backend context as preview deploy.

## Global References

This matrix inherits:

- [deployments.cleanup-preview Command Spec](../commands/deployments.cleanup-preview.md)
- [GitHub Action PR Preview Deploy Workflow](../workflows/github-action-pr-preview-deploy.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Deployment Config File Test Matrix](./deployment-config-file-test-matrix.md)
- [Source Link State Test Matrix](./source-link-state-test-matrix.md)
- [Edge Proxy Provider And Route Configuration Test Matrix](./edge-proxy-provider-and-route-configuration-test-matrix.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Test Layers

| Layer | Required focus |
| --- | --- |
| Application command/use case | Idempotent missing-link result, latest plus stale preview runtime cleanup, artifact/workspace cleanup decision, route-state delete, source-link unlink, and failure staging. |
| CLI | Preview fingerprint derivation, preview-id validation, config-path contribution, and remote-state prepare/release. |
| State adapters | Source-link unlink and route desired-state deletion by target and by preview source fingerprint. |
| Entry workflow | `pull_request.closed` preview cleanup remains a user-authored workflow over the same CLI command and may also delete GitHub preview deployment/environment metadata. |

## Command Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error |
| --- | --- | --- | --- | --- | --- |
| DEPLOYMENTS-CLEANUP-PREVIEW-001 | integration | Already clean when preview link is absent | No preview source link exists for the selected preview fingerprint | `ok` with `status = already-clean`; no runtime, route, or link cleanup side effects | None |
| DEPLOYMENTS-CLEANUP-PREVIEW-002 | integration | Cleanup runtime, route state, and source link | Preview link exists and latest deployment exists for the linked preview resource | `ok` with `status = cleaned`; runtime cleanup runs first, route desired state is deleted, and the preview source link is unlinked | None |
| DEPLOYMENTS-CLEANUP-PREVIEW-003 | integration | Runtime cleanup failure stops later cleanup | Preview link exists and runtime backend cleanup fails | Command returns error with `phase = preview-cleanup` and `cleanupStage = runtime-cleanup`; route state and source link remain unchanged | `infra_error` or provider-mapped preview-cleanup failure |
| DEPLOYMENTS-CLEANUP-PREVIEW-004 | integration | Cleanup sweeps stale preview state after retarget | Preview link points at the current preview resource while older preview deployments and route rows still carry the same preview source fingerprint | `ok` with `status = cleaned`; latest and stale preview runtimes are cleaned before linked-target and preview-fingerprint route rows are removed, then the preview source link is unlinked | None |
| DEPLOYMENTS-CLEANUP-PREVIEW-005 | integration | Preview cleanup waits only on same preview scope | Another command currently owns mutation for the same preview fingerprint while a different preview fingerprint exists on the same server/state backend | Cleanup waits only for the same logical preview-lifecycle scope; unrelated preview scopes must not be blocked by whole-server coordination | `coordination_timeout`, phase `operation-coordination` only when the bounded wait for the same preview scope expires |
| DEPLOYMENTS-CLEANUP-PREVIEW-006 | integration | SSH final upload merges disjoint preview cleanup state changes | `ssh-pglite` preview cleanup runs against a local mirror and another command advances the remote revision for a different logical scope with disjoint authoritative rows | Cleanup still completes after final upload retries against the fresher remote snapshot | None |
| DEPLOYMENTS-CLEANUP-PREVIEW-007 | integration | Preview artifact/workspace cleanup is ownership-scoped | Preview link exists, runtime cleanup succeeds, and target has preview-owned source workspaces, stopped preview containers, unused preview images, and unrelated volumes/state | Cleanup removes or marks cleaned the preview-owned inert artifacts/workspaces, preserves Docker volumes, remote Appaloft state, active runtime, and retained rollback candidates, then proceeds to route/link deletion | None, or `runtime_target_resource_exhausted` with `cleanupStage = artifact-cleanup` when target capacity prevents safe inspection/removal |

## CLI Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error |
| --- | --- | --- | --- | --- | --- |
| DEPLOYMENTS-CLEANUP-PREVIEW-CLI-001 | integration | CLI preview cleanup derives preview fingerprint and remote state | `appaloft preview cleanup [path-or-source] --config appaloft.preview.yml --preview pull-request --preview-id 14` with SSH target inputs | CLI dispatches `CleanupPreviewCommand` with preview-scoped fingerprint and runs the same SSH-state prepare/release flow as config deploy | None |

## Current Implementation Notes And Migration Gaps

`DEPLOYMENTS-CLEANUP-PREVIEW-001` through `DEPLOYMENTS-CLEANUP-PREVIEW-004` have application
coverage in `packages/application/test/cleanup-preview.test.ts`.

`DEPLOYMENTS-CLEANUP-PREVIEW-CLI-001` has CLI integration coverage in
`packages/adapters/cli/test/preview-command.test.ts`.

`DEPLOYMENTS-CLEANUP-PREVIEW-006` currently relies on the shared shell-level SSH mirror coverage in
`apps/shell/test/remote-pglite-state-sync.test.ts`; a cleanup-specific overlapping fixture is still
follow-up work.

`DEPLOYMENTS-CLEANUP-PREVIEW-007` is not implemented yet. Current cleanup coverage proves runtime,
route, and source-link cleanup, but not ownership-scoped Docker image/build-cache/source-workspace
pruning.

Source-link unlink and server-applied route desired-state delete-by-target and
delete-by-source-fingerprint coverage also live in
`packages/adapters/cli/test/deployment-remote-state.test.ts` and
`packages/persistence/pg/test/pglite.integration.test.ts` under the governing source-link and
server-applied-route matrices.
