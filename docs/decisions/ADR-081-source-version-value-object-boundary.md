# ADR-081: Source Version Value Object Boundary

Status: Accepted

Date: 2026-06-03

## Decision

Appaloft models source version as a neutral public core concept.

`Version`, `VersionReference`, and source-specific version resolvers belong in public
`packages/core`. Cloud, Enterprise, providers, CLI, Web, repository config, Blueprint tooling, and
runtime adapters may supply version inputs or detection evidence, but they must not define private
domain versions.

The core vocabulary is:

- `VersionReference`: an operator or entrypoint reference such as Git branch, Git tag, Git SHA,
  Docker image tag, Docker image digest, release name, or content digest.
- `Version`: the deployment-facing version result. A deployment must carry a fixed version when it
  can be resolved. Legacy or unresolved deployments carry `unknown`.
- `fixedIdentifier`: the immutable identity that fixes the version for one deployment, such as Git
  commit SHA, Docker image digest, or content digest.
- `aliases`: other references known to point at the same fixed version, such as a Docker tag plus
  digest or Git tag plus commit SHA.

Source-specific version rules are polymorphic core behavior:

- Git sources accept only Git version references such as branch, tag, release, or commit SHA.
- Docker image sources accept only image tag or image digest.
- Static artifact sources accept content digest as the fixed identity.
- Generic future sources must define their accepted reference kinds in public core before use.

Entrypoints may expose a friendly `version` input, but core state must store typed
`VersionReference` and `Version` value objects. `latest`, Git branches, Docker tags, Git tags, and
release names are references, not fixed versions by themselves. They become fixed only after
detection resolves them to an immutable identifier for the deployment attempt.

## Consequences

- `deployments.create` remains ids-only and consumes Resource source/runtime profile state.
- Resource source profile commands and entry workflows may accept an optional version reference.
- Runtime plan snapshots must contain a fixed version or `unknown`; floating references must not be
  persisted as fixed deployment facts.
- Version detection is an application port, but source-specific rules and validation live in core
  value objects.
- Cloud or provider adapters may implement detection for Git providers, registries, static artifact
  stores, or dependency providers by returning public core values only.

## Non-Goals

- No Cloud-only `cloud-core` version model.
- No registry vulnerability scan, Git provider branch browser, release resolver, or provider-native
  credential model in this ADR.
- No compatibility alias for newly modeled version fields before first formal release.
