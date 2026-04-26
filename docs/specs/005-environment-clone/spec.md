# Environment Clone

## Status

- Round: Spec -> Test-First -> Code -> Post-Implementation Sync
- Artifact state: active for this behavior
- Behavior state: target active behavior
- Feature path: `docs/specs/005-environment-clone/`

## Business Outcome

Operators can copy an active environment's owned configuration into a new environment in the same
project without promoting releases or manually re-entering variables.

This closes the clone portion of the Phase 4 environment lifecycle work. Clone is a named
environment command, not a generic update or import path.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Environment clone | Named command that creates a new active environment from an active source environment's current owned configuration. | Workspace / Environment lifecycle | copy environment |
| Source environment | Existing active environment whose current environment-owned variables are copied at clone time. | Workspace | original environment |
| Cloned environment | New active environment in the same project with its own identity, name, kind, parent source id, and copied variables. | Workspace | target environment |
| Clone target name | New environment name that must be unique within the source project. | Workspace | copy name |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ENV-LIFE-CLONE-001 | Clone active environment | An active environment has environment-owned variables. | The operator dispatches `environments.clone` with a unique target name. | A new active environment is persisted in the same project, records `parentEnvironmentId = source id`, copies variable identities and masked/secret metadata, and returns `ok({ id })`. |
| ENV-LIFE-CLONE-002 | Reject archived source | The source environment is archived. | The operator dispatches `environments.clone`. | The command returns `environment_archived`, with no cloned environment. |
| ENV-LIFE-CLONE-003 | Reject duplicate target name | Another environment in the source project already uses the target name. | The operator dispatches `environments.clone`. | The command returns `conflict`, with no cloned environment. |
| ENV-LIFE-CLONE-004 | Reject archived source project | The source environment belongs to an archived project. | The operator dispatches `environments.clone`. | The command returns `project_archived`, with no cloned environment. |
| ENV-LIFE-CLONE-ENTRY-001 | Entry surface parity | The operation is active. | CLI, HTTP/oRPC, Web, or generated tools dispatch clone. | Each surface uses the shared `CloneEnvironmentCommandInput` and `environments.clone` catalog entry. |

## Domain Ownership

- Bounded context: Workspace / Environment lifecycle
- Aggregate owner: `Environment`
- Upstream workflows: project/environment setup, Quick Deploy environment selection, and support
  workflows that need a copyable configuration baseline
- Downstream workflows: environment reads, resource creation, deployment admission, and deployment
  snapshot materialization

Clone is an `Environment` aggregate creation from an existing `Environment`. It does not create,
mutate, archive, promote, deploy, or clean up resources, deployments, domains, certificates, source
links, runtime state, logs, or audit state.

## Public Surfaces

- API: `POST /api/environments/{environmentId}/clone`
- CLI: `appaloft env clone <environmentId> --name <targetName> [--kind <kind>]`
- Web/UI: project detail environment list can clone an active environment by entering the target
  name.
- Config: not applicable. Repository config can select/create environments, but clone is not
  declared in repository config.
- Events: none for this slice. A future environment-created event may cover create/clone/promotion
  together when that event family is specified.
- Public docs/help: `/docs/environments/model/#environment-lifecycle`
- Future MCP/tools: generated from operation catalog metadata using the same command schema.

## Non-Goals

- Environment lock, rename, delete, restore, or generic update.
- Cross-project environment cloning.
- Copying effective inherited values from resource/deployment scopes.
- Runtime stop/start, deployment creation, promotion, proxy cleanup, certificate work, or route
  mutation.
- Plaintext secret exposure in reads, errors, logs, docs, or UI feedback.

## Open Questions

- None.
