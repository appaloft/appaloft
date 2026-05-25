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
- cleanup removes only repository-config provenance-marked ephemeral dependency resources and
  preserves manual/shared dependencies;
- cleanup removes only repository-config provenance-marked ephemeral storage volumes and preserves
  manual/shared storage;
- cleanup does not treat standalone `ssh-pglite` as obsolete state and must preserve live PGlite,
  source-link, server-applied-route, lock, revision, and backend marker files;
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
- [ADR-066: Repository Config Dependency Graph](../decisions/ADR-066-repository-config-dependency-graph.md)
- [ADR-067: Repository Config Storage Graph](../decisions/ADR-067-repository-config-storage-graph.md)
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
| DEPLOYMENTS-CLEANUP-PREVIEW-008 | integration | Cleaned preview route is not current access | Preview resource remains as history/audit, but the preview source link has been removed by cleanup | Resource access summary does not project that historical preview route as current/ready; deployment history remains visible | None |
| DEPLOYMENTS-CLEANUP-PREVIEW-009 | integration | Closed preview cleanup does not stop a newer live deployment | A preview source link still points at a resource whose latest deployment no longer carries the preview fingerprint, while older preview deployments still carry the closed preview fingerprint | Cleanup skips the newer live deployment, cleans only deployments carrying the preview fingerprint, then removes preview route/source-link state idempotently | None |
| DEPLOYMENTS-CLEANUP-PREVIEW-010 | integration | Preview cleanup preserves standalone SSH live state | Cleanup runs for a closed preview on a server whose selected backend is `ssh-pglite` | Cleanup may remove preview-owned runtime, route, and selected source-link state, but it does not delete live `pglite`, locks, unrelated source links/routes, `sync-revision.txt`, or backend marker files | None |
| DEPLOYMENTS-CLEANUP-PREVIEW-011 | integration | Preview cleanup removes provenance-owned ephemeral dependencies | Preview source link includes repository-config provenance for an ephemeral managed dependency binding/resource | Cleanup unbinds the recorded binding, deletes the recorded dependency resource through existing delete safety, reports safe counts, then removes route/source-link state | None |
| DEPLOYMENTS-CLEANUP-PREVIEW-012 | integration | Preview cleanup preserves manual or shared dependencies | Preview resource has a dependency binding/resource but the source link lacks matching repository-config ephemeral provenance, or delete safety finds another blocker | Cleanup does not delete unproven dependencies; delete blockers stop before source-link deletion when provenance exists but safety blocks delete | None or `dependency_resource_delete_blocked`, phase `preview-cleanup` |
| DEPLOYMENTS-CLEANUP-PREVIEW-013 | integration | Preview cleanup removes provenance-owned ephemeral storage | Preview source link includes repository-config provenance for an ephemeral managed storage attachment/volume | Cleanup detaches the recorded attachment, deletes the recorded storage volume through existing delete safety, reports safe counts, then removes route/source-link state | None |
| DEPLOYMENTS-CLEANUP-PREVIEW-014 | integration | Preview cleanup preserves manual or shared storage | Preview resource has a storage attachment/volume but the source link lacks matching repository-config ephemeral provenance, or delete safety finds another blocker | Cleanup does not delete unproven storage; delete blockers stop before source-link deletion when provenance exists but safety blocks delete | None or `storage_volume_delete_blocked`, phase `preview-cleanup` |
| DEPLOYMENTS-CLEANUP-PREVIEW-015 | integration | Preview cleanup removes provenance-owned ephemeral scheduled tasks | Preview source link includes repository-config provenance for an ephemeral scheduled task | Cleanup deletes the recorded scheduled task, reports safe counts, then removes route/source-link state | None |
| DEPLOYMENTS-CLEANUP-PREVIEW-016 | integration | Preview cleanup preserves manual or shared scheduled tasks | Preview resource has scheduled tasks but the source link lacks matching repository-config ephemeral provenance | Cleanup does not delete unproven scheduled tasks and never guesses by command, schedule, key, or disabled state | None |
| DEPLOYMENTS-CLEANUP-PREVIEW-HTTP-001 | HTTP/oRPC | HTTP preview cleanup dispatches command | `POST /api/deployments/cleanup-preview` receives a preview-scoped source fingerprint | HTTP returns `202` with cleanup result and dispatches `CleanupPreviewCommand` with the same source fingerprint | Domain error mapped through standard HTTP/oRPC error contract |
| DEPLOYMENTS-CLEANUP-PREVIEW-HTTP-002 | HTTP/oRPC | Action preview cleanup carries trusted repository scope | `POST /api/deployments/cleanup-preview` is marked with `x-appaloft-action-command: preview-cleanup` and the deploy token is repository-scoped | HTTP passes `trustedContext.repositoryFullName` to deploy-token authorization before dispatch; missing or mismatched repository context is rejected before command dispatch | `action_auth_forbidden`, phase `action-authorization`, reason `scope_value_missing` or `scope_value_not_allowed` |

## CLI Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error |
| --- | --- | --- | --- | --- | --- |
| DEPLOYMENTS-CLEANUP-PREVIEW-CLI-001 | integration | CLI preview cleanup derives preview fingerprint and remote state | `appaloft preview cleanup [path-or-source] --config appaloft.preview.yml --preview pull-request --preview-id 14` with SSH target inputs | CLI dispatches `CleanupPreviewCommand` with preview-scoped fingerprint and runs the same SSH-state prepare/release flow as config deploy | None |

## Current Implementation Notes And Governed Follow-Ups

`DEPLOYMENTS-CLEANUP-PREVIEW-001` through `DEPLOYMENTS-CLEANUP-PREVIEW-004`,
`DEPLOYMENTS-CLEANUP-PREVIEW-009`, and `DEPLOYMENTS-CLEANUP-PREVIEW-011` through
`DEPLOYMENTS-CLEANUP-PREVIEW-014` have application
coverage in `packages/application/test/cleanup-preview.test.ts`.

`DEPLOYMENTS-CLEANUP-PREVIEW-008` has route/access read-model coverage in
`packages/application/test/resource-access-summary.projector.test.ts` and
`packages/persistence/pg/test/pglite.integration.test.ts`.

`DEPLOYMENTS-CLEANUP-PREVIEW-CLI-001` has CLI integration coverage in
`packages/adapters/cli/test/preview-command.test.ts`.

`DEPLOYMENTS-CLEANUP-PREVIEW-HTTP-001` and `DEPLOYMENTS-CLEANUP-PREVIEW-HTTP-002` have HTTP/oRPC coverage in
`packages/orpc/test/deployment-create.http.test.ts`.

`DEPLOYMENTS-CLEANUP-PREVIEW-006` currently relies on the shared shell-level SSH mirror coverage in
`apps/shell/test/remote-pglite-state-sync.test.ts`; a cleanup-specific overlapping fixture is still
follow-up work.

`DEPLOYMENTS-CLEANUP-PREVIEW-007` is implemented for ownership-scoped generated source-workspace,
stopped container, and generated-image cleanup through the runtime cleanup boundary. Current
coverage proves that preview cleanup preserves `artifact-cleanup` failure classification, removes
only generated preview workspaces under Appaloft-owned runtime roots, labels Docker build images
with preview ownership, skips local user workspaces and prebuilt images, and never invokes Docker
volume deletion. SSH preview source uploads also write a preview artifact marker so interrupted
deployments can be swept by the same source fingerprint on later cleanup. Build-cache pruning
remains governed by `servers.capacity.prune` opt-in categories rather than preview cleanup.
`DEPLOYMENTS-CLEANUP-PREVIEW-010` is covered at the shell/state-backend lifecycle by
`apps/shell/test/remote-pglite-state-sync.test.ts`, and remote-state marker preservation is covered
in `packages/adapters/runtime/test/runtime-target-capacity-prune.test.ts`. Preview cleanup itself
delegates live state ownership to the selected state backend.

Source-link unlink and server-applied route desired-state delete-by-target and
delete-by-source-fingerprint coverage also live in
`packages/adapters/cli/test/deployment-remote-state.test.ts` and
`packages/persistence/pg/test/pglite.integration.test.ts` under the governing source-link and
server-applied-route matrices.
