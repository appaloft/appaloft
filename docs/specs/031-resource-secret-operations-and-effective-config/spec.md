# Resource Secret Operations And Effective Config Baseline

## Status

- Round: Spec Round -> Test-First -> Code Round -> Post-Implementation Sync
- Artifact state: implemented baseline for Phase 7 / `0.9.0` beta; release remains open

## Business Outcome

Operators can manage resource-scoped configuration and secrets without SSHing into a server or
placing raw secret values in deployment commands. They can paste or import `.env` content into a
resource, rely on safe build/runtime exposure rules, and inspect a masked effective configuration
view that explains which scope wins.

This slice extends the existing resource configuration surface. It does not introduce a new secret
backend, dependency binding, storage, Postgres/Redis provisioning, redeploy, rollback, preview env,
webhook, or provider-native secret model.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Resource variable | One resource-scoped config entry identified by `key + exposure`. | Workload Delivery / Configuration | resource env |
| Resource secret | A resource variable whose value is write-side secret material and masked on every read surface. | Workload Delivery / Configuration | secret env |
| `.env` import | A command that parses pasted `.env` text into resource variables. | Resource profile lifecycle | paste env |
| Effective config | The masked future deployment snapshot view after environment and resource precedence resolve. | Resource query/read model | effective env |
| Override summary | Safe metadata showing the winning scope and overridden scopes for a `key + exposure` identity. | Resource query/read model | conflict info |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| RES-CONFIG-IMPORT-001 | Import mixed `.env` values | An active resource exists. | The operator submits `.env` content with runtime exposure. | Valid keys are stored as resource-scoped entries; secret-like keys are classified as secrets and masked in reads. |
| RES-CONFIG-IMPORT-002 | Reject invalid `.env` key | `.env` content contains an invalid key. | The import command runs. | The command returns `validation_error`, `phase = resource-env-import-parse`, and persists no entries. |
| RES-CONFIG-IMPORT-003 | Enforce build-time public prefix | `.env` content contains build-time key `API_URL`. | The import command runs with build-time exposure. | The command rejects with `validation_error` before persistence. |
| RES-CONFIG-IMPORT-004 | Reject build-time secret | `.env` content contains build-time secret-like key `PUBLIC_API_TOKEN`. | The import command runs. | The command rejects with `validation_error` and persists no secret. |
| RES-CONFIG-IMPORT-005 | Report duplicate and existing overrides | `.env` content repeats a key and the resource already has that identity. | The import command succeeds. | The last pasted occurrence wins, existing resource entry is replaced, and the response reports duplicate and override metadata without raw secret values. |
| RES-CONFIG-EFFECTIVE-001 | Explain effective override | Environment and resource define the same `key + exposure`. | `resources.effective-config` runs. | The response returns the masked winning value and an override summary with winning scope and overridden scopes. |

## Domain Ownership

- Bounded context: Workload Delivery with Configuration value objects.
- Aggregate/resource owner: `Resource` owns the resource override layer; `Environment` owns inherited environment entries.
- Upstream/downstream contexts: Deployment snapshot materialization consumes the resolved effective config but remains immutable after admission.

## Public Surfaces

- API/oRPC: add `resources.import-variables`; extend `resources.effective-config` with safe override summaries.
- CLI: add `appaloft resource import-variables <resourceId> --content <dotenv> --exposure <...>`.
- Web/UI: existing resource detail config helpers/read model can consume import/effective config; full Web paste UI is deferred.
- Config: `.env` import accepts pasted content only; repository config secret references remain governed by existing config-file specs.
- Events: import reuses existing `resource-variable-set` events per stored entry; no new event is required in this baseline.
- Public docs/help: add/update user docs anchor for resource variables and secrets.

## ADR Decision

- Decision state: no-ADR-needed.
- Rationale: ADR-012 already governs resource-scoped variable/secret overrides, precedence,
  build-time public prefix rules, secret masking, and deployment snapshot immutability. This slice
  adds an operation-local `.env` parser and a read-model override summary without changing
  precedence, durable ownership, deployment snapshot semantics, public provider contracts, or
  secret backend custody.

## Non-Goals

- Storage/volume lifecycle.
- Postgres/Redis provisioning or import.
- Dependency bind/unbind or secret rotation.
- Backup/restore.
- Redeploy, retry, rollback, or runtime restart.
- Source binding, webhook, auto-deploy, preview-scoped env, or GitHub Action deploy wrapper changes.
- Provider-native secret backends.

## Open Questions

- Full Web paste/import UI is deferred until a follow-up Web-focused Phase 7 slice.
