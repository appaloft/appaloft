# Environment Effective Precedence

## Status

- Round: Post-Implementation Sync
- Artifact state: implemented and verified in Code Round
- Behavior state: active
- Feature path: `docs/specs/002-environment-effective-precedence/`

## Business Outcome

Operators can inspect the effective configuration that one environment would contribute to a future
deployment before a resource-level override or deployment snapshot is applied.

This closes the Phase 4 environment effective-precedence query slice without adding a broad
environment update command. Users can confirm which environment value wins for each `key + exposure`
identity, see secret masking, and use the same query through CLI and HTTP/oRPC automation.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Environment effective precedence | The read-only resolved environment configuration view after Appaloft applies config-scope precedence to variables stored on the environment. | Workspace / Configuration | effective precedence, effective environment config |
| Owned entries | The masked variables stored directly on the environment before precedence resolution. | Environment query output | environment variables |
| Effective entries | The masked variables that win after resolving same `key + exposure` identities by config-scope precedence. | Environment query output | resolved variables |
| Precedence | The stable config scope order: defaults, system, organization, project, environment, resource, deployment. | Configuration | variable precedence |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ENV-PRECEDENCE-QRY-001 | Resolve same key by precedence | An environment stores the same runtime key at `defaults` and `environment` scopes. | The operator queries `environments.effective-precedence`. | The response includes both owned entries and one effective entry with `scope = "environment"`. |
| ENV-PRECEDENCE-QRY-002 | Mask secret values | An environment stores a runtime secret. | The operator queries effective precedence. | Owned and effective entries return the mask value and never return plaintext. |
| ENV-PRECEDENCE-QRY-003 | Missing environment | The environment id is not visible or does not exist. | The operator queries effective precedence. | The query returns `not_found` and does not mutate state. |
| ENV-PRECEDENCE-ENTRY-001 | CLI and HTTP share query schema | The operation is active. | CLI or HTTP/oRPC dispatches the query. | Both entrypoints construct `EnvironmentEffectivePrecedenceQuery` from the shared input schema. |

## Domain Ownership

- Bounded context: Workspace / Configuration
- Aggregate/resource owner: `Environment`
- Upstream contexts: Quick Deploy and repository config workflows set environment variables
- Downstream contexts: deployment snapshot materialization and `resources.effective-config`

The query is read-only. It does not create deployments, change variables, promote environments, or
materialize resource-owned overrides.

## Public Surfaces

- API: `GET /api/environments/{environmentId}/effective-precedence`
- CLI: `appaloft env effective-precedence <environmentId>`
- Web/UI: not a separate new page in this slice; existing environment variable help points users to
  the CLI/API read surface, and Web resource effective-config continues to show resource-level
  overrides.
- Config: not applicable. Repository config may supply variables through existing workflows but
  does not call this read query directly.
- Events: none. This query publishes no domain event.
- Public docs/help: existing variable precedence topic
  `/docs/environments/variables/precedence/#environment-variable-precedence`
- Future MCP/tools: generated from operation catalog metadata using the same query schema.

## Non-Goals

- Environment rename, clone, lock, archive, delete, history, or generic update.
- Resource effective configuration. That remains `resources.effective-config`.
- Deployment snapshot mutation or historical deployment rewrites.
- Project/system/organization variable write operations.
- Returning plaintext secrets.

## Open Questions

- None blocking this behavior. Environment lifecycle mutations remain separate Phase 4 behaviors.
