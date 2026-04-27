# resources.configure-source Command Spec

## Normative Contract

`resources.configure-source` is the source-of-truth command for changing the durable source binding
owned by one resource.

Command success means the new `ResourceSourceBinding` was durably stored on the resource. It does
not create a deployment, pull source, retarget source links, run detection, rebuild artifacts,
restart runtime, update environment variables, bind domains, or apply proxy routes.

```ts
type ConfigureResourceSourceResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id })`;
- accepted success persists the `Resource` aggregate with updated source binding;
- accepted success publishes or records `resource-source-configured`;
- future `deployments.create` attempts use the new source profile;
- historical deployment snapshots remain unchanged.

## Global References

This command inherits:

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [resources.create Command Spec](./resources.create.md)
- [resources.show Query Spec](../queries/resources.show.md)
- [resource-source-configured Event Spec](../events/resource-source-configured.md)
- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Replace source identity for an existing deployable resource when the operator wants future
deployments to use a different repository, branch/ref, base directory, local folder, prebuilt image,
artifact, or compose source.

It is not:

- a generic resource update command;
- a runtime profile command;
- a network profile command;
- a health policy command;
- a source-link relink command;
- a deployment, redeploy, or restart command;
- a source inspection or workload detection query.

## Input Model

```ts
type ConfigureResourceSourceCommandInput = {
  resourceId: string;
  source: ResourceSourceBindingInput;
  idempotencyKey?: string;
};
```

`ResourceSourceBindingInput` reuses the canonical source variant fields from
[resources.create](./resources.create.md). It must not be redefined by Web, CLI, HTTP, or future
MCP entrypoints.

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Resource whose source binding is being changed. |
| `source.kind` | Required | Source kind such as Git, local folder, Docker image, compose, inline, or artifact. |
| `source.locator` | Required | Canonical, display-safe source locator. |
| `source.gitRef` | Conditional | Explicit Git branch, tag, or ref when the source kind is Git. |
| `source.baseDirectory` | Optional | Source-root-relative path inside the repository, local folder, or artifact. |
| `source.imageTag` / `source.imageDigest` | Conditional | Docker image identity for prebuilt image sources. |
| `idempotencyKey` | Optional | Deduplicates retries for the same intended source change. |

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `resourceId`.
3. Reject missing or invisible resource with `not_found`.
4. Reject archived resources with `resource_archived`.
5. Normalize and validate the submitted source through source value objects.
6. Reject ambiguous Git ref/base-directory splits unless the entrypoint supplied explicit fields.
7. Reject source credentials, tokens, deploy keys, secret values, or raw SSH keys in source fields.
8. Preserve runtime profile, network profile, health policy, access summary, deployments, domain
   bindings, source links, and lifecycle state.
9. Persist the updated `Resource` aggregate.
10. Publish or record `resource-source-configured`.
11. Return `ok({ id })`.

## Resource-Specific Rules

Changing source affects only future deployment admission. A currently running deployment/runtime
instance remains based on its immutable deployment snapshot until a later explicit deployment
operation creates a new attempt.

The command must not retarget `source-links.relink` mappings. A repeated CLI/GitHub Actions source
fingerprint change requires the dedicated `source-links.relink` command where that behavior is
supported.

The command may store safe provider repository identity such as repository id, repository full
name, default branch, and original locator. It must not store provider tokens, GitHub installation
tokens, deploy keys, SSH private keys, registry passwords, or filesystem absolute paths as source
profile data.

If the new source kind is incompatible with the current runtime profile, the command may still
store the source when the incompatibility is only knowable during future planning. It should include
safe diagnostics in `resources.show`. Pure source validation failures must return
`validation_error` with `phase = resource-source-resolution`.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail source settings dispatch this command, refetch `resources.show`, and identify the save as durable future-only profile state rather than redeploy or runtime restart. | Active |
| CLI | `appaloft resource configure-source <resourceId> ...`. | Required in Code Round |
| oRPC / HTTP | `POST /api/resources/{resourceId}/source` using the command schema. | Required in Code Round |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Events

Canonical event spec:

- [resource-source-configured](../events/resource-source-configured.md): source binding persisted
  for future deployment admission.

## Current Implementation Notes And Migration Gaps

`resources.configure-source` is active for core aggregate mutation, application command handling,
operation catalog exposure, CLI, HTTP/oRPC, and the Web resource detail source profile form.
The Web form states that source profile edits affect future deployments and do not rewrite
historical deployment snapshots or restart current runtime.

Current covered behavior includes valid Git source changes, ambiguous GitHub tree rejection,
Docker image tag/digest conflict rejection, secret-like source field rejection, and
`resource-source-configured` publication.

Archived-resource blocking remains a migration gap until `resources.archive` introduces explicit
resource lifecycle state. Idempotent event-consumer projection remains future read-model work.

## Open Questions

- None for the resource source profile command name. Access/domain profile changes remain separate
  future operations.
