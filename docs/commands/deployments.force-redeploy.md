# deployments.force-redeploy Command Spec

## Status

Active command. This is a neutral deployment recovery operation for operators who need the current
Resource profile to be deployed again while forcing runtime artifact refresh.

## Governing Sources

- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-034: Deployment Recovery Readiness](../decisions/ADR-034-deployment-recovery-readiness.md)
- [Deployment Retry And Redeploy](../specs/040-deployment-retry-redeploy/spec.md)
- [deployments.redeploy Command Spec](./deployments.redeploy.md)

## Intent

`deployments.force-redeploy` requests a new deployment attempt from the current Resource profile,
effective configuration, runtime target, and destination at admission time, then asks the runtime
adapter to refresh runtime artifacts instead of relying on local build cache or already-present image
tags.

It does not:

- mutate Resource profile fields;
- deploy after variable writes automatically;
- retry a failed phase;
- restore a historical artifact;
- bypass Resource profile, lifecycle, target, destination, or coordination validation.

## Input

```ts
type ForceRedeployDeploymentInput = {
  resourceId: string;
  environmentId?: string;
  projectId?: string;
  serverId?: string;
  destinationId?: string;
  sourceDeploymentId?: string;
  readinessGeneratedAt?: string;
};
```

`sourceDeploymentId` is optional context for UX and auditability. It does not become the source of
runtime truth.

## Admission

- Resolve the current Resource profile and effective environment context exactly as
  `deployments.redeploy` does.
- Reject invalid or incomplete current profile state with `deployment_not_redeployable` or the
  existing profile/admission error code that owns the failing branch.
- Coordinate on `resource-runtime` so force redeploy cannot race with create/retry/redeploy/rollback.

## Runtime Artifact Refresh

- Docker image build operations are rendered with `--pull --no-cache`.
- Docker Compose operations run an explicit `docker compose build --pull --no-cache` before
  `docker compose up --build`.
- Prebuilt image deployments perform an explicit image pull before runtime start when the adapter
  would otherwise reuse a local tag.

## Accepted Result

The command returns accepted async work with a new deployment attempt id. Completion or failure is
observed through `deployments.show`, `deployments.timeline`, and future readiness reads.

## Events

The new attempt emits the normal deployment lifecycle events and may include:

- `triggerKind: "force-redeploy"`;
- `sourceDeploymentId` when the user initiated force redeploy from an existing deployment detail.
