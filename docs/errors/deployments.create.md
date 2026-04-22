# deployments.create Error Spec

## Normative Contract

`deployments.create` uses the shared platform error model and neverthrow conventions. This file defines only the deployment-specific error profile for command admission and post-acceptance deployment progression.

Command result:

```ts
type CreateDeploymentResult = Result<{ id: string }, DomainError>;
```

Command success means request accepted. Runtime failure after acceptance persists `Deployment.status = failed`, publishes `deployment-failed`, and preserves `ok({ id })` for the original command.

## Global References

This spec inherits:

- [ADR-001: deployments.create HTTP API Required Fields](../decisions/ADR-001-deploy-api-required-fields.md)
- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

The shared documents define error shape, categories, consumer mapping, exception boundaries, retry semantics, and post-acceptance failure semantics.

## Deployment Error Details

Deployment-specific error details must identify the command, phase, relevant deployment context, and safe cause metadata:

```ts
type DeploymentCreateErrorDetails = {
  commandName: "deployments.create";
  phase:
    | "command-validation"
    | "config-bootstrap"
    | "config-discovery"
    | "config-parse"
    | "config-schema"
    | "config-identity"
    | "config-secret-validation"
    | "config-profile-resolution"
    | "config-capability-resolution"
    | "context-resolution"
    | "operation-coordination"
    | "redeploy-guard"
    | "admission-conflict"
    | "resource-source-resolution"
    | "resource-network-resolution"
    | "default-access-policy-resolution"
    | "default-access-domain-generation"
    | "proxy-readiness"
    | "route-snapshot-resolution"
    | "source-detection"
    | "runtime-plan-resolution"
    | "runtime-artifact-resolution"
    | "supersede-previous-deployment"
    | "deployment-write-fence"
    | "runtime-target-resolution"
    | "runtime-target-render"
    | "runtime-target-apply"
    | "runtime-target-observation"
    | "image-build"
    | "image-pull"
    | "deployment-creation"
    | "proxy-route-realization"
    | "public-route-verification"
    | "planning-transition"
    | "execution-start-transition"
    | "runtime-execution"
    | "rollback"
    | "finalization"
    | "event-publication";
  step?: string;
  deploymentId?: string;
  supersedesDeploymentId?: string;
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  serverId?: string;
  destinationId?: string;
  resourceSourceKind?: string;
  runtimePlanStrategy?: string;
  runtimeFamily?: string;
  framework?: string;
  packageManager?: string;
  buildTool?: string;
  projectName?: string;
  plannerKey?: string;
  baseImage?: string;
  detectedFiles?: string;
  detectedScripts?: string;
  publishDirectory?: string;
  internalPort?: number;
  hostPort?: number;
  publishedHostPort?: number;
  exposureMode?: "none" | "reverse-proxy" | "direct-port";
  upstreamProtocol?: "http" | "tcp";
  targetServiceName?: string;
  accessRouteSource?: "generated-default" | "domain-binding" | "none";
  accessRouteProviderKey?: string;
  runtimeArtifactKind?: "image" | "compose-project";
  targetKind?: string;
  targetProviderKey?: string;
  targetBackendKey?: string;
  targetCapability?: string;
  coordinationScopeKind?: string;
  coordinationScope?: string;
  coordinationMode?: string;
  waitedSeconds?: number;
  retryAfterSeconds?: number;
  imageName?: string;
  imageTag?: string;
  imageDigest?: string;
  containerId?: string;
  composeProjectName?: string;
  relatedState?: string;
  causeCode?: string;
  correlationId?: string;
  causationId?: string;
};
```

Secrets and raw environment values must not appear in details.

## Admission Errors

Admission errors reject the command and return `err(DomainError)`.

| Error code | Phase | Retriable | Required deployment details |
| --- | --- | --- | --- |
| `validation_error` | `command-validation`, `config-bootstrap`, `context-resolution`, `resource-source-resolution`, `resource-network-resolution`, `source-detection`, `runtime-plan-resolution`, `runtime-artifact-resolution` | No | Field/path when available, `commandName`, safe command context. Framework/planner failures include safe detection evidence such as `runtimeFamily`, `framework`, `packageManager`, `projectName`, `plannerKey`, `baseImage`, and detected file/script identifiers when available. Static strategy failures include `publishDirectory` when the value is missing or unsafe. |
| `validation_error` | `config-discovery`, `config-parse`, `config-schema`, `config-identity`, `config-secret-validation`, `config-profile-resolution` | No | Repository config file could not be safely used by the entry workflow. Details may include config path, format, safe schema issue paths, or rejected field names, but must not include secret values. |
| `unsupported_config_field` | `config-capability-resolution` | No | Repository config requested a known future capability that Appaloft cannot enforce yet, such as CPU, memory, replicas, restart policy, rollout overlap, or rollout drain. |
| `not_found` | `context-resolution` | No | Entity type, entity id, `commandName`, `phase`. |
| `coordination_timeout` | `operation-coordination` | Yes | Bounded waiting for the logical `resource-runtime` coordination scope elapsed before admission could proceed. Details should include `coordinationScopeKind`, safe `coordinationScope`, `coordinationMode`, `waitedSeconds`, and retry hint fields when available. |
| `deployment_not_redeployable` | `redeploy-guard` | No | Existing or concurrently-admitted deployment id when available, resource id, current deployment status, and safe cause metadata when a concurrent submit lost the atomic active-attempt race or another request won the supersede race first. |
| `conflict` | `supersede-previous-deployment` | No | The later request could not safely cancel the previous active deployment before taking ownership. |
| `conflict` | `admission-conflict` | No | Conflict subject and related state. |
| `invariant_violation` | `planning-transition`, `execution-start-transition`, `finalization` | No | Current deployment state and attempted transition. |
| `infra_error` | `deployment-creation`, `event-publication` | Conditional | Adapter/operation and sanitized cause. |
| `provider_error` | `runtime-plan-resolution`, `runtime-artifact-resolution`, `image-build`, `image-pull` | Conditional | Provider key, operation, sanitized image/artifact cause. |
| `runtime_target_unsupported` | `runtime-target-resolution` | No | Target kind, provider key, missing capability, and safe selected target/destination context. |
| `provider_error` | `runtime-target-resolution`, `runtime-target-render`, `runtime-target-apply`, `runtime-target-observation` | Conditional | Runtime target backend key, provider key, operation, missing capability, and sanitized cause. |
| `default_access_route_unavailable` | `default-access-policy-resolution`, `default-access-domain-generation`, `proxy-readiness`, `route-snapshot-resolution` | Conditional | Generated default access route is required but cannot be resolved before safe acceptance. |

If the selected target has no edge proxy intent, or explicitly disables the proxy, generated default access is optional and the deployment may proceed without `default_access_route_unavailable`. That path must not create a direct host-port fallback.

For direct-port resources, an effective host-port collision that is safely detectable before
acceptance may return `conflict` in phase `admission-conflict` with `hostPort`, `resourceId`,
`serverId`, and `destinationId`. If the collision is discovered by the runtime after acceptance,
the deployment must be marked failed with phase `runtime-execution` or `public-route-verification`
and safe details including `internalPort`, `hostPort`, and the conflicting runtime reason when
available.

For reverse-proxy resources, another resource using the same `internalPort` is not an admission
conflict and must not be reported as a host-port conflict.

`deployment_not_redeployable` also covers the concurrent-submit branch where a pre-read found no
active deployment, but durable state creation lost the race to another accepted non-terminal
deployment for the same resource. In that branch the command still returns `err`, phase
`redeploy-guard`, and should include the concurrently active deployment id/status when they can be
read safely.

If a superseded execution path later tries to persist state, the repository may raise an internal
`deployment-write-fence` conflict with `causeCode = deployment_superseded`. That branch is part of
execution fencing, not a separate public command.

For static strategy resources, missing or unsafe `runtimeProfile.publishDirectory` is an admission
failure when it can be detected before acceptance. Static package/build failures discovered after
acceptance must be represented as failed deployment state with phase `image-build` or
`runtime-artifact-resolution`, not as a changed command result.

For framework/runtime planner selection, a detected framework with no supported planner and no
explicit custom command fallback is an admission failure in phase `runtime-plan-resolution`. The
error must report safe planner evidence without leaking package manager auth tokens, registry
credentials, environment values, or raw provider responses.

## Post-Acceptance Deployment Failures

Source materialization, build, runtime target rendering/apply/observation, proxy route realization,
public route verification, health check, cleanup, or release finalization failures after acceptance are not
command admission errors.

They must:

1. record failed deployment/process state;
2. include `deploymentId`, `phase`, `step`, `code`, `retriable`, and safe cause details;
3. publish `deployment-failed` after failure state is durable;
4. keep the original command response as `ok({ id })`;
5. require a new deployment attempt for retry.

Docker/OCI-specific failure details must be sanitized. It is valid to include image name, tag,
digest, container id, Compose project name, container state, exit code, and bounded log excerpts
when they do not contain secrets. It is not valid to include registry credentials, private key
material, raw secret environment values, or full unbounded command output.

Git source materialization failures may record `remote_git_clone_failed` or
`remote_git_commit_resolution_failed` on the failed deployment attempt. Safe failure metadata may
include source kind, repository locator, selected Git ref, source directory, remote workdir, and the
package phase, but must not include access tokens, private keys, or credential-bearing clone URLs.

## Consumer Requirements

UI, CLI, HTTP API, background workers, and event consumers must use the shared mappings in [Error Model](./model.md). Deployment-specific consumers additionally must:

- display the deployment id when present;
- distinguish admission failure from accepted deployment failure;
- expose latest deployment terminal state and retry eligibility from durable state/read models;
- avoid using progress stream messages as the error contract.

## Test Assertions

Deployment tests must assert:

- `result.isOk()` or `result.isErr()`;
- deployment-specific `error.code`;
- deployment-specific `phase`;
- `deploymentId`, `resourceId`, or related context when relevant;
- `internalPort`, `hostPort`, or `publishedHostPort` when a runtime port mapping or direct-port
  conflict is the relevant failure context;
- `runtimePlanStrategy` and `publishDirectory` when a static artifact planning or packaging failure
  is relevant;
- `runtimeFamily`, `framework`, `packageManager`, `projectName`, `plannerKey`, and `baseImage`
  when framework detection or planner selection is relevant;
- `deployment-failed` plus failed state for post-acceptance failure;
- a new deployment id for retry.

The shared neverthrow assertion style is defined in [neverthrow Conventions](./neverthrow-conventions.md).

## Current Implementation Notes And Migration Gaps

Current core `DomainError` has `code`, `category`, `message`, `retryable`, and optional `details`.

Current implementation already uses neverthrow `Result` for command construction and `Promise<Result<{ id }, DomainError>>` for the use case.

Migration gaps:

- phase/step details are not yet uniformly included;
- `coordination_timeout`, `coordinationScopeKind`, and related ADR-028 details are not yet
  uniformly emitted by current implementations;
- SSH `ssh-pglite` finalization may now surface `remote_state_revision_conflict` before a merge
  retry and `remote_state_merge_conflict` when refreshed remote state changed the same
  authoritative PG/PGlite row incompatibly; non-overlapping row changes are retried instead of
  failing immediately;
- concurrent-submit races are now governed by the atomic active-attempt invariant, but adapters and
  tests still need full coverage for the write-side branch that loses the race after a successful
  pre-read;
- runtime execution is currently awaited inside `deployments.create`;
- backend failures can currently appear either as returned `err(DomainError)` or as failed deployment execution result depending on adapter behavior;
- Web QuickDeploy still has hardcoded local validation text;
- no durable process-manager/outbox failure handling was confirmed for this flow.
- resource listener port is represented as `networkProfile.internalPort`; `runtimeProfile.port` is not part of the command or resource contract.
- generated default access and proxy route realization errors are not yet uniformly represented with ADR-017 phases.
- runtime target backend registry lookup now returns `runtime_target_unsupported` with
  `runtime-target-resolution` details; `deployments.create` admission does not yet consult that
  registry before accepting the command.
- repository config file errors are target entry-workflow errors; current implementation does not
  yet populate these phases uniformly and still carries a legacy config-bootstrap shape.

## Open Questions

- None. Cross-operation error field placement is governed by [Error Model](./model.md).
