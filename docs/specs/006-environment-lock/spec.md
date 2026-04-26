# Environment Lock

## Status

- Round: Code Round
- Artifact state: ready for implementation
- Behavior state: target active behavior
- Feature path: `docs/specs/006-environment-lock/`

## Business Outcome

Operators can freeze an environment before risky work, keep it readable for status/history/diff
inspection, then unlock it when change control allows new configuration or deployment work again.

This is a Phase 4 environment lifecycle slice. Lock and unlock are named lifecycle commands, not a
generic environment update command.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Environment lock | Reversible lifecycle transition that freezes new environment mutations and deployment admission while preserving reads/history. | Workspace / Environment lifecycle | freeze environment |
| Locked environment | Environment that stays readable but rejects new configuration writes, promotion, resource creation, and deployment admission. | Workspace | frozen environment |
| Environment unlock | Reversible lifecycle transition that returns a locked environment to active. | Workspace / Environment lifecycle | unfreeze environment |
| Environment lifecycle guard | Aggregate rule that rejects mutations against locked or archived environments with structured lifecycle errors. | Domain/application | lock guard |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ENV-LIFE-LOCK-001 | Lock active environment | An active environment exists. | The operator dispatches `environments.lock`. | The environment is persisted with `lifecycleStatus = "locked"`, `lockedAt`, optional reason, and `environment-locked` is published. |
| ENV-LIFE-LOCK-002 | Retry locked environment | An environment is already locked. | The operator dispatches `environments.lock` again. | The command returns `ok({ id })`, preserves original lock metadata, and publishes no duplicate event. |
| ENV-LIFE-UNLOCK-001 | Unlock locked environment | A locked environment exists. | The operator dispatches `environments.unlock`. | The environment is persisted with `lifecycleStatus = "active"`, lock metadata is cleared, and `environment-unlocked` is published. |
| ENV-LIFE-UNLOCK-002 | Retry active environment | An environment is already active. | The operator dispatches `environments.unlock`. | The command returns `ok({ id })` and publishes no event. |
| ENV-LIFE-READ-002 | Read locked environment | An environment is locked. | The operator lists or shows environments. | The read model returns lifecycle status, lock metadata, created time, and masked variables. |
| ENV-LIFE-GUARD-006 | Block locked config writes | An environment is locked. | The operator sets or unsets an environment variable. | The command returns `environment_locked`, `phase = environment-lifecycle-guard`, with no mutation/event. |
| ENV-LIFE-GUARD-007 | Block locked promotion | An environment is locked. | The operator promotes it into a new environment. | The command returns `environment_locked`, with no promoted environment. |
| ENV-LIFE-GUARD-008 | Block locked resource creation | An environment is locked. | The operator creates a resource in it. | `resources.create` returns `environment_locked` before resource persistence. |
| ENV-LIFE-GUARD-009 | Block locked deployment admission | An environment is locked. | The operator creates a deployment selecting it or defaulting into it. | `deployments.create` returns `environment_locked` before deployment/resource bootstrap side effects. |
| ENV-LIFE-ARCHIVE-004 | Archive locked environment | A locked environment exists. | The operator dispatches `environments.archive`. | The environment transitions to archived, lock metadata is cleared, and `environment-archived` is published. |
| ENV-LIFE-ENTRY-006 | Entry surface parity | The operations are active. | Web, CLI, or HTTP/oRPC dispatches lock or unlock. | Each surface uses shared command schemas and the `environments.lock` / `environments.unlock` catalog entries. |

## Domain Ownership

- Bounded context: Workspace / Environment lifecycle
- Aggregate owner: `Environment`
- Upstream workflows: Quick Deploy and repository config select/create environments
- Downstream workflows: resource creation, deployment admission, environment snapshots, and
  configuration reads

Lock/unlock are `Environment` aggregate lifecycle mutations. Resource, deployment, domain,
certificate, source-link, runtime, log, and audit records remain owned by their existing
aggregates/read models.

## Public Surfaces

- API: `POST /api/environments/{environmentId}/lock` and
  `POST /api/environments/{environmentId}/unlock`
- CLI: `appaloft env lock <environmentId> [--reason ...]` and
  `appaloft env unlock <environmentId>`
- Web/UI: project detail environment list can lock active environments, unlock locked environments,
  and archive active or locked environments.
- Config: not applicable. Repository config can select an existing environment, but lock/unlock are
  not declared in repository config.
- Events: `environment-locked`, `environment-unlocked`
- Public docs/help: `/docs/environments/model/#environment-lifecycle`
- Future MCP/tools: generated from operation catalog metadata using the same command schemas.

## Non-Goals

- Environment clone, rename, delete, restore, or generic update.
- Cascading mutation of resources, deployments, domains, certificates, source links, runtime state,
  logs, or audit records.
- Runtime stop, proxy cleanup, certificate revocation, or deployment cancellation.
- Repository config fields that lock or unlock environments.
- Plaintext secret exposure in reads, events, errors, or docs.

## Open Questions

- None blocking this slice.
