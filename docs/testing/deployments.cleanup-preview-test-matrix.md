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
| Application command/use case | Idempotent missing-link result, runtime cleanup, route-state delete, source-link unlink, and failure staging. |
| CLI | Preview fingerprint derivation, preview-id validation, config-path contribution, and remote-state prepare/release. |
| State adapters | Source-link unlink and route desired-state deletion. |
| Entry workflow | `pull_request.closed` preview cleanup remains a user-authored workflow over the same CLI command. |

## Command Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error |
| --- | --- | --- | --- | --- | --- |
| DEPLOYMENTS-CLEANUP-PREVIEW-001 | integration | Already clean when preview link is absent | No preview source link exists for the selected preview fingerprint | `ok` with `status = already-clean`; no runtime, route, or link cleanup side effects | None |
| DEPLOYMENTS-CLEANUP-PREVIEW-002 | integration | Cleanup runtime, route state, and source link | Preview link exists and latest deployment exists for the linked preview resource | `ok` with `status = cleaned`; runtime cleanup runs first, route desired state is deleted, and the preview source link is unlinked | None |
| DEPLOYMENTS-CLEANUP-PREVIEW-003 | integration | Runtime cleanup failure stops later cleanup | Preview link exists and runtime backend cleanup fails | Command returns error with `phase = preview-cleanup` and `cleanupStage = runtime-cleanup`; route state and source link remain unchanged | `infra_error` or provider-mapped preview-cleanup failure |

## CLI Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error |
| --- | --- | --- | --- | --- | --- |
| DEPLOYMENTS-CLEANUP-PREVIEW-CLI-001 | integration | CLI preview cleanup derives preview fingerprint and remote state | `appaloft preview cleanup [path-or-source] --config appaloft.preview.yml --preview pull-request --preview-id 14` with SSH target inputs | CLI dispatches `CleanupPreviewCommand` with preview-scoped fingerprint and runs the same SSH-state prepare/release flow as config deploy | None |

## Current Implementation Notes And Migration Gaps

`DEPLOYMENTS-CLEANUP-PREVIEW-001` through `DEPLOYMENTS-CLEANUP-PREVIEW-003` have application
coverage in `packages/application/test/cleanup-preview.test.ts`.

`DEPLOYMENTS-CLEANUP-PREVIEW-CLI-001` has CLI integration coverage in
`packages/adapters/cli/test/preview-command.test.ts`.

Source-link unlink and server-applied route desired-state delete coverage also live in
`packages/adapters/cli/test/deployment-remote-state.test.ts` and
`packages/persistence/pg/test/pglite.integration.test.ts` under the governing source-link and
server-applied-route matrices.
