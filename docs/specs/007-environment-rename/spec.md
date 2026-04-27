# Environment Rename

## Status

- Round: Spec -> Test-First -> Code -> Post-Implementation Sync
- Artifact state: active for `0.6.0` Phase 4

## Business Outcome

Operators can change an environment display name after creation without recreating the environment,
copying configuration, changing resources, or starting deployments.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Environment rename | Intention-revealing command that changes only an environment's display name. | Workspace | `env rename` in CLI |
| Environment name | Human-facing environment label unique inside one project. | Workspace | stage name |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ENV-LIFE-RENAME-001 | Active environment renamed | Active environment exists | `environments.rename` submits a new name | Environment name is persisted and `environment-renamed` is recorded. |
| ENV-LIFE-RENAME-002 | Same name rename | Active environment exists | Rename submits the current normalized name | Command returns `ok({ id })` without duplicate event. |
| ENV-LIFE-RENAME-003 | Duplicate name rejected | Another environment in the same project already owns the requested name | Rename submits that name | Command returns `conflict`, phase `environment-admission`, and no mutation. |
| ENV-LIFE-RENAME-004 | Locked environment guarded | Environment is locked | Rename is submitted | Command returns `environment_locked`, phase `environment-lifecycle-guard`, and no mutation. |
| ENV-LIFE-RENAME-005 | Archived environment guarded | Environment is archived | Rename is submitted | Command returns `environment_archived`, phase `environment-lifecycle-guard`, and no mutation. |

## Domain Ownership

- Bounded context: Workspace
- Aggregate/resource owner: `Environment`
- Upstream/downstream contexts: resources and deployments read environment identity but are not
  mutated by rename.

## Public Surfaces

- API: `POST /api/environments/{environmentId}/rename`
- CLI: `appaloft env rename <environmentId> --name <name>`
- Web/UI: project detail environment lifecycle row rename form for active environments
- Config: not applicable; repository config must not rename environments
- Events: `environment-renamed`
- Public docs/help: existing `environment.lifecycle` anchor

## Non-Goals

- Environment slug or id mutation.
- Resource, deployment, domain, certificate, variable, or runtime mutation.
- Generic `environments.update`.
- Rename for locked or archived environments.

## Open Questions

- None.
