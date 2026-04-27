# resources.configure-runtime Command Spec

## Normative Contract

`resources.configure-runtime` is the source-of-truth command for changing the durable runtime
planning profile owned by one resource.

Command success means the new runtime profile was durably stored on the resource. It does not
create a deployment, run detection, build images, restart runtime, mutate health policy, change
source, change network endpoint, bind domains, or apply proxy routes.

```ts
type ConfigureResourceRuntimeResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id })`;
- accepted success persists the `Resource` aggregate with updated runtime profile planning fields;
- accepted success publishes or records `resource-runtime-configured`;
- future `deployments.create` attempts use the new runtime profile;
- historical deployment snapshots remain unchanged.

## Global References

This command inherits:

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [resources.create Command Spec](./resources.create.md)
- [resources.configure-health Command Spec](./resources.configure-health.md)
- [resources.show Query Spec](../queries/resources.show.md)
- [resource-runtime-configured Event Spec](../events/resource-runtime-configured.md)
- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Replace reusable runtime planning defaults for an existing deployable resource.

It is not:

- a generic resource update command;
- a source binding command;
- a health policy command;
- a runtime target/orchestrator configuration command;
- a deployment, redeploy, restart, rollback, or scale command;
- a Docker/OCI build execution command.

## Input Model

```ts
type ConfigureResourceRuntimeCommandInput = {
  resourceId: string;
  runtimeProfile: ResourceRuntimeProfileInput;
  idempotencyKey?: string;
};
```

`ResourceRuntimeProfileInput` reuses the canonical runtime profile fields from
[resources.create](./resources.create.md), except health policy mutation belongs to
`resources.configure-health`.

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Resource whose runtime profile is being changed. |
| `runtimeProfile.strategy` | Required | `RuntimePlanStrategy` used by future deployment planning. |
| `runtimeProfile.installCommand` | Optional | Install command default for strategy families that accept commands. |
| `runtimeProfile.buildCommand` | Optional | Build command default for strategy families that accept commands. |
| `runtimeProfile.startCommand` | Optional | Start command default for image/container runtime planning. |
| `runtimeProfile.runtimeName` | Optional | Provider-neutral runtime naming intent used to derive effective Docker container or Compose project names for future deployments. |
| `runtimeProfile.dockerfilePath` | Conditional | Source-root-relative Dockerfile path for Dockerfile strategy. |
| `runtimeProfile.dockerComposeFilePath` | Conditional | Source-root-relative Compose file path for Compose strategy. |
| `runtimeProfile.publishDirectory` | Conditional | Source-root-relative static publish directory for static strategy. |
| `runtimeProfile.buildTarget` | Optional | Docker build target when the Dockerfile strategy accepts it. |
| `idempotencyKey` | Optional | Deduplicates retries for the same intended runtime profile change. |

The command must reject `runtimeProfile.healthCheck` or health-check path mutation when supplied as
a runtime-profile update field. Health policy changes dispatch `resources.configure-health`.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `resourceId`.
3. Reject missing or invisible resource with `not_found`.
4. Reject archived resources with `resource_archived`.
5. Normalize and validate runtime strategy and strategy-specific fields through value objects.
6. Reject unsupported runtime target/orchestrator fields such as Kubernetes namespace, Helm chart,
   Swarm stack, replica count, node selector, ingress class, or provider-native runtime options.
7. Preserve source binding, network profile, health policy, access summary, deployments, domains,
   and lifecycle state.
8. Persist the updated `Resource` aggregate.
9. Publish or record `resource-runtime-configured`.
10. Return `ok({ id })`.

## Resource-Specific Rules

For v1, every accepted `RuntimePlanStrategy` must produce, pull, or reference Docker/OCI-backed
runtime artifacts, or materialize a Docker Compose project whose runnable services are backed by
Docker/OCI images.

Runtime profile paths are relative to the source binding's selected root. They must not contain
`..`, shell metacharacters, URLs, or host absolute paths.

`runtimeProfile.runtimeName` is a reusable runtime naming intent, not an exact deployment-instance
reservation. The command must validate a safe normalized identifier shape, but it must not require
target-global uniqueness because collision handling depends on the selected runtime substrate and
deployment context. Deployment planning/runtime adapters derive an effective Docker container or
Compose project name from `runtimeName` plus deployment/resource/preview context when uniqueness is
required for safe replacement.

Preview entry workflows may derive a default runtime name such as `preview-123` from trusted PR
context before dispatching this command or `resources.create`. That derived preview default remains
resource-owned runtime profile state once persisted.

Changing runtime profile affects only future deployment admission. It does not mutate any current
runtime instance or deployment snapshot.

When the submitted runtime profile is incompatible with the current source binding, the command
should reject combinations that can be decided synchronously from the submitted values. Other
planner-time incompatibilities appear as future deployment admission failures or safe diagnostics in
`resources.show`.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail runtime settings dispatch this command, refetch `resources.show`, and identify the save as durable future-only profile state rather than redeploy or runtime restart. | Active |
| CLI | `appaloft resource configure-runtime <resourceId> ...`. | Required in Code Round |
| oRPC / HTTP | `POST /api/resources/{resourceId}/runtime-profile` using the command schema. | Required in Code Round |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Events

Canonical event spec:

- [resource-runtime-configured](../events/resource-runtime-configured.md): runtime planning profile
  persisted for future deployment admission.

## Current Implementation Notes And Migration Gaps

`resources.configure-runtime` is active in core, application command handling, operation catalog,
CLI, HTTP/oRPC, and the Web resource detail runtime profile form. Current implementation persists
runtime planning fields on the `Resource` aggregate, emits `resource-runtime-configured`, rejects
health policy mutation through this command, and rejects unsupported target/orchestrator fields.
The Web form states that runtime profile edits affect future deployments and do not rewrite
historical deployment snapshots or restart current runtime.

Archived-resource blocking remains a migration gap until `resources.archive` introduces explicit
resource lifecycle state.

## Open Questions

- None for the resource runtime profile command name. Runtime target sizing, scaling, restart
  policy, and orchestrator-specific fields remain future behavior slices.
