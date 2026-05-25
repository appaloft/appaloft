# Repository Config Auto-Deploy Policy

## Status

- Round: Post-Implementation Sync
- Artifact state: MVP implemented for git-push Resource auto-deploy policy declarations in repository
  config and CLI/Action config deploy orchestration
- Roadmap target: `0.12.x` repository config hardening
- Compatibility impact: `pre-1.0-policy`, additive repository config fields
- Decision state: governed by
  [ADR-069](../../decisions/ADR-069-repository-config-auto-deploy-policy.md)

## Business Outcome

Users can commit an `appaloft.yaml` that says the Resource should auto-deploy when selected git refs
receive source events. Config deploy reconciles that policy through existing Resource
auto-deploy operations before deployment admission. The deployment command itself still contains
only Appaloft ids.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| RepositoryAutoDeployPolicy | User-facing `appaloft.yaml` declaration for Resource auto-deploy source-event matching. | Repository config |
| GitPushAutoDeployDeclaration | A config entry that enables auto-deploy for git push/tag events on selected refs. | Config deploy |
| AutoDeployProfileReconcile | The config deploy step that reads current Resource auto-deploy policy and dispatches `resources.configure-auto-deploy` only when needed. | Resource profile workflow |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| CONFIG-AUTO-DEPLOY-001 | Parse git-push policy | `appaloft.yaml` declares `autoDeploy.enabled = true`, `trigger = git-push`, refs, and events | The config parser runs | The config is accepted, optional dedupe defaults remain absent, JSON schema exposes the field, and unknown policy fields remain rejected. |
| CONFIG-AUTO-DEPLOY-002 | Reject unsafe auto-deploy material | Config includes provider account, tenant, webhook secret value, token, source-event id, or deployment target identity under `autoDeploy` | The config parser runs | Parsing fails before mutation with strict schema, identity, unsupported, or raw-secret validation. |
| CONFIG-AUTO-DEPLOY-003 | Configure missing policy | Selected Resource has no matching auto-deploy policy | CLI/Action config deploy resolves identity | The workflow dispatches `resources.configure-auto-deploy` before `deployments.create`, and deployment admission remains ids-only. |
| CONFIG-AUTO-DEPLOY-004 | Idempotent no-op for matching policy | Selected Resource already has the same enabled git-push policy | Config deploy runs | No configure command is dispatched; deployment proceeds normally. |
| CONFIG-AUTO-DEPLOY-005 | Replace drifted or blocked policy | Selected Resource policy differs or is blocked by source-binding change | Config deploy runs | The workflow dispatches `resources.configure-auto-deploy` with the YAML policy. |
| CONFIG-AUTO-DEPLOY-006 | Disable existing policy | YAML declares `autoDeploy.enabled = false` and the Resource has an auto-deploy policy | Config deploy runs | The workflow dispatches `resources.configure-auto-deploy` with disable mode before deployment. |

## Config Contract

MVP repository config fields:

```yaml
autoDeploy:
  enabled: true
  trigger: git-push
  refs:
    - main
  events:
    - push
  dedupeWindowSeconds: 300
```

Rules:

- `enabled` defaults to `true` when `autoDeploy` is present.
- `trigger` supports `git-push`.
- `refs` is required when enabled and uses the existing safe git-ref grammar.
- `events` defaults to `["push"]` and supports `push` and `tag`.
- `dedupeWindowSeconds` is optional and must be a positive integer.
- `enabled: false` disables any existing Resource auto-deploy policy and does not require refs.
- Repository config must not declare provider accounts, webhook secret values, source-event ids,
  webhook delivery ids, tenant/org identity, deployment ids, target ids, or raw credentials.

## Workflow Contract

Config auto-deploy reconcile must run after Resource identity is known and before deployment
admission:

```text
resolve project/environment/resource/server identity
  -> resources.show(resourceId)
  -> resources.configure-auto-deploy(enable/disable when needed)
  -> deployments.create(ids only)
```

The workflow must use command/query buses only. It must not call Resource repositories or
application services from the CLI/HTTP adapter.

## Non-Goals

- No auto-deploy fields on `deployments.create`.
- No generic signed webhook secret setup in repository config for this MVP.
- No source-event ingestion, replay, pruning, or webhook endpoint creation during config deploy.
- No provider-native webhook payload, delivery id, or provider account configuration in YAML.

## Current Implementation Notes And Migration Gaps

This slice is a repository config workflow/profile extension over existing
`resources.configure-auto-deploy`. No new operation-catalog key is introduced. Generic signed
webhook declarations remain deferred until repository config has an accepted secret-reference and
endpoint setup contract for that trigger kind.
