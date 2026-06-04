# Source Version Value Object

## Status

- Round: Spec + Code Round
- Artifact state: MVP implementation in public core, application port, repository config, Blueprint
  schema, CLI source profile entrypoint, and targeted tests
- Compatibility impact: `pre-1.0-policy`; additive source profile fields and runtime plan snapshot
  value object
- Decision state: governed by
  [ADR-081](../../decisions/ADR-081-source-version-value-object-boundary.md)

## Business Outcome

Operators can deploy a selected version of an application source, image, Blueprint component, or
static artifact without Appaloft confusing a floating reference with an immutable deployed version.

New deployments record the fixed version when detection can resolve it. Existing or unresolved
deployments read back as `unknown`.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| VersionReference | A typed user or entrypoint reference such as branch, tag, image tag, image digest, commit SHA, release, literal, or content digest. | Resource source profile / entry workflows |
| Version | The deployment-facing version value. It is fixed when it has an immutable identifier, otherwise `unknown`. | Runtime plan / deployment snapshot |
| Fixed identifier | Immutable identity for one deployment attempt: Git commit SHA, Docker image digest, or content digest. | Runtime plan |
| Alias | Another reference known to point at the same fixed version. | Version readback |
| Floating reference | A reference that can point at different immutable versions over time, such as Git branch, Docker tag, Git tag, release, or `latest`. | Entry workflows |

## Core Contract

- Version value objects live in public `packages/core`.
- Source-specific version behavior is polymorphic:
  - Git source version accepts branch, tag, release, or commit SHA.
  - Docker image source version accepts image tag or image digest.
  - Static artifact source version accepts content digest.
  - Generic source version accepts only explicitly supported public reference kinds.
- `ResourceSourceBinding` may carry an optional `versionReference`.
- `SourceDescriptor` may carry an optional resolved `version`.
- `RuntimePlan` must reject floating source versions. It may accept fixed versions or `unknown`.
- `unknown` is the legacy/unresolved readback value and must not pretend to be a fixed version.
- Aliases must be preserved when detection knows multiple references point at the same fixed version.

## Detection Contract

`SourceVersionDetector` is an application port used by deployment planning and future preview or
entry workflows. The port returns public core `Version` values only.

Adapters may resolve:

- Git branch/tag/release to commit SHA;
- Docker image tag to image digest;
- static artifact manifest to content digest;
- future dependency or Blueprint package references after their public source rules exist.

If detection cannot safely resolve an immutable identifier, it returns `unknown` rather than
persisting a floating reference as deployment truth.

## Entrypoint Contract

Entrypoints may expose a friendly `version` field, plus an optional `versionKind` disambiguation
hint when a source has ambiguous references such as Git branches, tags, releases, and commit SHAs.
When `versionKind` is omitted, public core infers it through the source-specific version object.
When `versionKind` is supplied, public core validates that it belongs to that source kind before
core profile state is created.

Current accepted entrypoints:

- `resources.create` and `resources.configure-source` source profile input;
- `appaloft resource configure-source --version --version-kind`;
- repository config `source.version` and `source.versionKind`;
- Blueprint component runtime `version` and `versionKind`.

`deployments.create` remains ids-only and does not accept version fields.

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| SRC-VERSION-001 | Git branch resolves to commit | Resource source profile selects Git branch `main` and detection resolves commit SHA | Deployment is planned | Runtime plan source version references `main`, has fixed identifier commit SHA, and may list the branch as an alias. |
| SRC-VERSION-002 | Docker tag resolves to digest | Resource source profile selects image tag `latest` or `1.7.3` and detection resolves an image digest | Deployment is planned | Runtime plan source version references the tag, has fixed identifier image digest, and may list tag/digest aliases. |
| SRC-VERSION-003 | Static artifact uses content digest | Static artifact source has manifest/content digest evidence | Deployment is planned | Runtime plan source version is fixed by content digest and is not operator-settable. |
| SRC-VERSION-004 | Floating reference remains unresolved | Detector cannot resolve a branch, release, tag, or `latest` to an immutable identity | Deployment is planned | Runtime plan source version is `unknown`; floating reference is not persisted as fixed deployment truth. |
| SRC-VERSION-005 | Source/version mismatch | Git source receives Docker image version reference, or image source receives Git branch reference | Source profile or version detection runs | Core returns validation error before deployment planning accepts the version. |
| SRC-VERSION-006 | Legacy readback | Existing deployment/runtime plan has no version field | Deployment is read or rehydrated | Version is treated as `unknown`. |

## Non-Goals

- No Cloud-only source version model.
- No registry probing in config parsing.
- No provider credential, pull secret, release browser, or UI branch/tag picker in this slice.
- No mutation of historical deployments when a tag, branch, release, or digest alias changes later.
