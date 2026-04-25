# Environment Archive

## Status

- Round: Code Round
- Artifact state: ready for implementation
- Behavior state: target active behavior
- Feature path: `docs/specs/003-environment-archive/`

## Business Outcome

Operators can retire an environment from new deployment work and configuration writes without
losing the environment's variables, resources, deployments, or support history.

This closes the first Phase 4 environment lifecycle slice after effective-precedence. Archive is a
named lifecycle command, not a generic environment update command.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Environment archive | Lifecycle transition that marks an environment unavailable for new mutations and deployment admission while retaining reads/history. | Workspace / Environment lifecycle | retire environment, archived environment |
| Active environment | Environment that can accept environment-owned config writes, promotion, new resources, and new deployments. | Workspace | live environment |
| Archived environment | Retained environment that stays readable but rejects new mutation/admission operations. | Workspace | retired environment |
| Environment lifecycle guard | The aggregate rule that rejects mutations against archived environments with `environment_archived`. | Domain/application | archive guard |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ENV-LIFE-ARCHIVE-001 | Archive active environment | An active environment exists. | The operator dispatches `environments.archive`. | The environment is persisted with `lifecycleStatus = "archived"`, `archivedAt`, optional reason, and `environment-archived` is published. |
| ENV-LIFE-ARCHIVE-002 | Retry archived environment | An environment is already archived. | The operator dispatches `environments.archive` again. | The command returns `ok({ id })`, preserves original archive metadata, and publishes no duplicate event. |
| ENV-LIFE-READ-001 | Read archived environment | An environment is archived. | The operator lists or shows environments. | The read model returns lifecycle metadata and masked variables. |
| ENV-LIFE-GUARD-001 | Block config writes | An environment is archived. | The operator sets or unsets an environment variable. | The command returns `environment_archived`, `phase = environment-lifecycle-guard`, with no mutation/event. |
| ENV-LIFE-GUARD-002 | Block promotion | An environment is archived. | The operator promotes it into a new environment. | The command returns `environment_archived`, with no promoted environment. |
| ENV-LIFE-GUARD-003 | Block new resource | An environment is archived. | The operator creates a resource in it. | `resources.create` returns `environment_archived` before resource persistence. |
| ENV-LIFE-GUARD-004 | Block new deployment | An environment is archived. | The operator creates a deployment selecting it or defaulting into it. | `deployments.create` returns `environment_archived` before deployment/resource bootstrap side effects. |
| ENV-LIFE-ENTRY-001 | Entry surface parity | The operation is active. | Web, CLI, or HTTP/oRPC dispatches archive. | Each surface uses the shared `ArchiveEnvironmentCommandInput` and `environments.archive` catalog entry. |

## Domain Ownership

- Bounded context: Workspace / Environment lifecycle
- Aggregate owner: `Environment`
- Upstream workflows: Quick Deploy and repository config select/create environments
- Downstream workflows: resource creation, deployment admission, environment snapshots, and
  configuration reads

Archive is an `Environment` aggregate lifecycle mutation. Resource, deployment, domain, certificate,
source-link, runtime, log, and audit records remain owned by their existing aggregates/read models.

## Public Surfaces

- API: `POST /api/environments/{environmentId}/archive`
- CLI: `appaloft env archive <environmentId> [--reason ...]`
- Web/UI: project detail environment list can archive an active environment after confirmation.
- Config: not applicable. Repository config can select an existing environment, but archive is not
  declared in repository config.
- Events: `environment-archived`
- Public docs/help: `/docs/environments/model/#environment-lifecycle`
- Future MCP/tools: generated from operation catalog metadata using the same command schema.

## Non-Goals

- Environment clone, lock, rename, delete, restore, or generic update.
- Cascading archive/delete of resources, deployments, domains, certificates, source links, runtime
  state, logs, or audit records.
- Runtime stop, proxy cleanup, certificate revocation, or deployment cancellation.
- Plaintext secret exposure in reads, events, errors, or docs.

## Open Questions

- None blocking this slice. Clone, lock, history, delete/restore, and any named edit semantics
  remain separate Phase 4+ behaviors.
