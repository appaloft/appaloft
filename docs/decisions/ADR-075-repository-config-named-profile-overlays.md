# ADR-075: Repository Config Named Profile Overlays

## Status

Accepted

## Date

2026-05-25

## Context

Repository config already declares the common application deployment profile and several lifecycle
graphs. Teams still need reviewable differences such as staging commands, generated access, runtime
environment values, or monitoring thresholds without committing Appaloft identity into
`appaloft.yaml`.

Using `environments.<name>` as the top-level syntax would make committed config look like it can
select or create Appaloft Environment identity. That conflicts with the repository config boundary:
project, environment, resource, server, destination, provider account, tenant, and credential
identity must come from trusted entrypoints, source-link state, deploy-token scope, or explicit
operator input.

## Decision

Repository config may declare named overlays under top-level `profiles.<key>`. A named profile is a
reviewable config overlay, not an Appaloft Environment selector.

Entrypoints may select one named profile through trusted input such as CLI `--config-profile` or
GitHub Action `config-profile`. When selected, Appaloft merges the overlay into the root config
after strict parsing and before profile/env/access/monitoring commands are derived. If no profile is
selected, `profiles.*` is ignored.

The MVP named overlay may contain only:

- `runtime`
- `network`
- `health`
- `access`
- `monitoring`
- `env`
- `secrets`

It must not contain source identity, project/environment/resource/server/destination identity,
provider accounts, tenant/org fields, raw secret values, dependency/storage/scheduled-task graph
deltas, auto-deploy policies, control-plane policy, retention policy, or unsupported sizing/rollout
fields.

If a trusted entrypoint selects a missing profile, config deploy fails before mutation with a stable
config-profile-resolution error. CLI and Action flags remain higher precedence than the selected
profile.

## Consequences

- The general environment-overlay open question is resolved by choosing named config profiles
  rather than environment-keyed identity syntax.
- This is a workflow/profile extension over existing operations. No new business operation key is
  introduced.
- `deployments.create` remains ids-only. Selected profile fields must be reconciled through
  existing Resource profile, environment variable, access, health, and runtime monitoring operations
  before deployment admission.
- Lifecycle graph deltas under named profiles remain deferred until a later ADR defines ownership,
  idempotency, cleanup, and conflict behavior for per-profile dependency/storage/task graphs.
- Resource sizing and rollout fields remain rejected until their own ADR/spec and runtime target
  enforcement exist.
