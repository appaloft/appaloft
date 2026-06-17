# ADR-085: Environment Profile Duplication Boundary

Status: Accepted

Date: 2026-06-17

## Context

Appaloft environments already own environment-scoped variables, lifecycle state, and deployment
snapshots. `environments.clone` copies only the source environment's environment-owned variables.
That is useful, but it does not model the product expectation behind staging, review, or developer
environments: users often want a new environment with the same application shape as another
environment, while replacing environment-specific values such as database bindings, secret
references, domains, source refs, and runtime scale.

The model must avoid two unsafe shortcuts:

- copying production values such as database URLs, provider tokens, custom domains, or secret
  material into a target environment;
- making `Environment` the owner of Resource, Deployment, Dependency Resource, Domain Binding,
  Storage Volume, or provider lifecycle mutations.

The existing owner rules still apply: Project is the resource collection boundary, Resource is the
deployable unit and configuration owner, Dependency Resource owns managed or imported dependency
state, Domain Binding owns access governance, and Deployment owns one execution attempt.

## Decision

Appaloft adds an Environment Profile Duplication boundary.

An `EnvironmentProfile` is a provider-neutral composition snapshot used for planning, diffing, and
syncing environment shape. It may include resource topology, resource source/runtime/network
profiles, variable requirements, dependency binding intents, route intents, storage requirements,
auto-deploy policy intent, and preview policy references. It is not a new aggregate owner and it
does not replace Resource or Dependency Resource commands.

Duplication is always plan-first:

1. `environments.plan-duplicate` reads the source environment and returns a
   `DuplicateEnvironmentPlan` with staged changes and required decisions.
2. `environments.duplicate-profile` accepts a previously reviewed plan plus explicit decisions and
   dispatches existing or new intention-revealing commands for environment, resource, dependency,
   variable, route, storage, and policy changes.
3. `environments.diff-profile` and `environments.sync-profile` compare and import environment
   shape without copying environment-specific values by default.

Dependency and secret-bearing bindings must be represented as decisions, not raw values. A managed
Postgres dependency used by the source environment, for example, may be handled with:

- `create-new-managed`: provision an isolated target dependency and bind the target resource to its
  generated secret reference;
- `bind-existing`: bind the target resource to an existing target dependency;
- `reuse-source`: bind to the same source dependency only after explicit acknowledgement and with
  the selected access mode recorded;
- `defer`: create the target shape but block deployment admission until the binding is resolved.

Route and domain values default to regeneration or deferment. Production custom domains are never
copied into a target environment by default. Storage requirements are copied as requirements, while
data copy, backup restore, import, or empty-volume selection must be explicit decisions.

`deployments.create` remains ids-only. Environment profile duplication may prepare Resource and
dependency state before deployment, but it must not add preview, branch, provider, or profile
payloads to deployment creation.

## Consequences

- Environment duplication becomes a workflow over explicit commands and queries, not a broad update
  or repository shortcut.
- Existing `environments.clone` remains a variable-only compatibility operation unless a later
  migration explicitly aliases it to a safer profile workflow.
- Read models must explain copy, regenerate, reuse, bind-existing, and defer decisions with masked
  secret values.
- Hosted and self-hosted distributions can provide different provider adapters and policies behind
  the same neutral plan decisions.
- UI, CLI, API, and future tool/MCP surfaces must show unresolved decisions before apply and must
  block deployment when required target bindings remain deferred.

## Governed Specs

- [Environment Profile Duplication](../specs/100-environment-profile-duplication/spec.md)
- [Environment Profile Duplication Test Matrix](../testing/environment-profile-duplication-test-matrix.md)
- [Core Operations](../CORE_OPERATIONS.md)
