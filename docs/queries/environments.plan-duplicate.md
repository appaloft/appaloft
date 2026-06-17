# environments.plan-duplicate

## Purpose

Build a read-only Environment Profile Duplication plan for a source environment and a proposed
target environment name. The query does not create an environment, provision dependencies, copy
secrets, bind resources, or deploy workloads.

## Input

- `environmentId`: source environment id.
- `targetName`: proposed target environment name.
- `targetProjectId`: optional target project id. Defaults to the source environment project.
- `targetEnvironmentId`: optional existing target environment id when planning sync-style work.

## Output

- `sourceEnvironment`: masked source environment summary.
- `target`: proposed target identity plus name-conflict readback.
- `variableCandidates`: masked source variables with default `copy` hints.
- `resourceCandidates`: resources to recreate or explicitly remap.
- `dependencyCandidates`: dependency resources with default decision hints:
  - `create-new-managed` for provider-managed Appaloft dependencies.
  - `bind-existing` for imported external dependencies.
  - `reuse-source` for unmanaged Appaloft dependency records.
  - `defer` is reserved for policy layers or unsupported cases.
- `dependencyBindingCandidates`: active resource dependency bindings to rebind after dependency
  decisions are reviewed.
- `domainRouteCandidates`: source custom domain bindings that must be regenerated, rebound, or
  deferred for the target environment. Production domains are not copied by default.
- `storageDecisionCandidates`: source storage volume attachments whose data requires an explicit
  empty, restore, import, or defer decision. Volume data is not copied by default.
- `warnings`: non-fatal planning warnings such as a target-name conflict.

## Boundary

This is a query. It only reads existing project/environment/resource/dependency summaries and
returns masked values. Apply work belongs to a later explicit command that dispatches existing
environment/resource/dependency commands with reviewed decisions.
