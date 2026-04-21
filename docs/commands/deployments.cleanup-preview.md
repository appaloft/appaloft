# deployments.cleanup-preview Command Spec

## Metadata

- Operation key: `deployments.cleanup-preview`
- Command class: `CleanupPreviewCommand`
- Input schema: `CleanupPreviewCommandInput`
- Handler: `CleanupPreviewCommandHandler`
- Use case: `CleanupPreviewUseCase`
- Domain / bounded context: Release orchestration / preview lifecycle
- Current status: active command
- Source classification: normative contract for preview cleanup implementation

## Normative Contract

`deployments.cleanup-preview` is the source-of-truth command for removing preview-scoped runtime
and route/link state after a preview environment is no longer needed.

Command success means the selected preview source fingerprint no longer owns preview runtime state,
including stale preview deployments still discoverable for the same linked preview scope,
server-applied preview route desired state, or the preview source link, or that no such preview
state remained to clean. It does not mean the command deleted project, environment, resource,
deployment history, logs, domains, certificates, or audit records.

```ts
type CleanupPreviewResult = Result<
  {
    sourceFingerprint: string;
    status: "cleaned" | "already-clean";
    cleanedRuntime: boolean;
    removedServerAppliedRoute: boolean;
    removedSourceLink: boolean;
    projectId?: string;
    environmentId?: string;
    resourceId?: string;
    serverId?: string;
    destinationId?: string;
    deploymentId?: string;
  },
  DomainError
>;
```

The command contract is:

- validation failure returns `err(DomainError)`;
- when no preview source link exists, the command returns `ok({ status: "already-clean", ... })`;
- when preview state exists, the command stops the latest runtime for the linked resource and also
  stops any additional preview deployments in the same linked preview scope that still carry the
  selected preview source fingerprint, removes preview route desired state for the linked target
  and any matching preview-fingerprint route rows, unlinks the preview source fingerprint, and
  returns `ok({ status: "cleaned", ... })`;
- runtime cleanup failure is terminal for the command and must stop later cleanup stages so route
  state and source-link identity are not removed ahead of runtime cleanup.

## Global References

This command inherits:

- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [GitHub Action PR Preview Deploy Workflow](../workflows/github-action-pr-preview-deploy.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Source Link State Test Matrix](../testing/source-link-state-test-matrix.md)
- [Edge Proxy Provider And Route Configuration Test Matrix](../testing/edge-proxy-provider-and-route-configuration-test-matrix.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [deployments.cleanup-preview Test Matrix](../testing/deployments.cleanup-preview-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Clean up a preview environment selected by a preview-scoped source fingerprint.

This command exists because Action/CLI preview deploy needs a narrow, explicit cleanup boundary that
is smaller than deleting resources and safer than overloading deploy admission or implicit runtime
replacement.

It is not:

- a generic deployment cancel command;
- a resource delete command;
- a rollback command;
- a domain/certificate cleanup command;
- a source-link relink command;
- a cascading preview-history delete.

## Input Model

```ts
type CleanupPreviewCommandInput = {
  sourceFingerprint: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `sourceFingerprint` | Required | Stable preview-scoped source identity that resolves the preview environment/resource/server context. |

The command input is intentionally minimal. Pull request number, preview mode, config path,
repository identity, and source root are entry-workflow concerns that must be normalized into a
canonical preview source fingerprint before dispatch.

## Cleanup Boundary

The cleanup boundary is intentionally narrow:

1. Resolve the preview source link from the selected Appaloft state backend.
2. Return `already-clean` when no link exists.
3. Load the latest deployment for the linked preview resource when one exists.
4. Discover additional preview deployments in the same linked project/environment scope whose
   runtime metadata still carries the selected preview source fingerprint.
5. Invoke runtime cleanup against the linked latest deployment first and then any additional stale
   preview deployments discovered for the same preview fingerprint.
6. Delete server-applied preview route desired state for the linked project/environment/resource/
   server/destination target when the preview link owns a server target, and also delete any
   additional server-applied route rows that still carry the selected preview source fingerprint.
7. Unlink the preview source fingerprint.
8. Return safe ids describing what was cleaned.

The command must not:

- delete the `Resource` aggregate;
- delete `Deployment` attempts or logs;
- archive or delete the preview environment/project;
- delete managed `DomainBinding` or `Certificate` aggregates;
- retarget the preview source link to another resource;
- remove unrelated route state for another resource or another preview;
- sweep historical preview deployments that do not belong to the selected preview fingerprint.

## Rules

- Cleanup is preview-scoped. Callers must derive a preview fingerprint that includes the preview
  scope so regular deploy identity is not accidentally cleaned.
- Cleanup is idempotent when the preview source link no longer exists or the linked target no
  longer has route desired state.
- Runtime cleanup happens before route/link deletion. If any runtime cleanup step fails during the
  preview sweep, later cleanup stages must not run.
- Route cleanup deletes provider-neutral desired state keyed by the linked
  project/environment/resource/server/destination context and may additionally delete stale
  preview-fingerprint route rows left behind by earlier preview retargets. It must not delete
  another preview's route row or any managed domain workflow state.
- Source-link cleanup removes only the selected preview fingerprint. It must not relink or delete
  regular non-preview source identity.
- The command may use low-level runtime backend cancel/remove support internally, but this does not
  reintroduce public `deployments.cancel`.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft preview cleanup [path-or-source] --preview pull-request --preview-id pr-123` derives the preview fingerprint from trusted source/config/preview context, resolves the selected state backend, and dispatches this command. |
| GitHub Actions | A user-authored `pull_request.closed` workflow may run the same CLI path directly or through a thin wrapper that maps trusted preview inputs to the same CLI command. |
| API/oRPC | Future control-plane endpoint may expose the same command schema after preview lifecycle read/write contracts are accepted. |
| Web | Future preview management UI may call the same command after showing the selected preview state and cleanup impact. |

## Error Contract

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Source fingerprint is missing or malformed. |
| `infra_error` | `preview-cleanup` | Conditional | State backend read/write, route-state deletion, source-link unlink, or runtime cleanup failed. |
| `provider_error` | `preview-cleanup` | Conditional | Runtime backend/provider rejected preview runtime cleanup. |

`preview-cleanup` failures must include `cleanupStage` in safe details when available, for example
`source-link-read`, `runtime-cleanup`, `server-applied-route-delete`, or `source-link-delete`.

## Tests

The governing matrix is
[deployments.cleanup-preview Test Matrix](../testing/deployments.cleanup-preview-test-matrix.md).
At minimum, Test-First and Code Round coverage must prove:

- idempotent already-clean behavior when the preview link is missing;
- runtime, route desired state, and source-link cleanup for a linked preview;
- runtime cleanup failure stops later cleanup stages;
- CLI preview cleanup derives the preview fingerprint from trusted preview context and resolves the
  same remote-state lifecycle path as preview deploy.

## Current Implementation Notes And Migration Gaps

`deployments.cleanup-preview` is active in the application operation catalog and CLI surface. The
CLI derives the preview-scoped source fingerprint from the same source/config/preview context used
by preview deploy, resolves remote state when SSH-targeted state is selected, and dispatches the
command through the application command bus.

Current implementation cleans preview runtime state through the injected execution backend, sweeps
additional stale preview deployments in the same linked project/environment scope when their runtime
metadata still carries the selected preview source fingerprint, deletes PG/PGlite or
filesystem-backed server-applied preview route desired state both for the linked target and for
additional matching preview-fingerprint route rows, and unlinks the preview source fingerprint from
the selected state backend. HTTP/oRPC and Web preview cleanup entrypoints remain future work.
