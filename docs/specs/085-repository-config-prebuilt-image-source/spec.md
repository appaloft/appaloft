# Repository Config Prebuilt Image Source

## Status

- Round: Post-Implementation Sync
- Artifact state: MVP implemented for prebuilt image source declarations in repository config and
  CLI/Action config deploy orchestration
- Roadmap target: `0.12.x` repository config hardening
- Compatibility impact: `pre-1.0-policy`, additive repository config source shape
- Decision state: governed by
  [ADR-076](../../decisions/ADR-076-repository-config-prebuilt-image-source.md)

## Business Outcome

Users can commit an `appaloft.yaml` that says the application should run a prebuilt Docker/OCI
image instead of building from repository source. Config deploy stores the image reference as the
Resource source profile, stores `prebuilt-image` as the runtime strategy, and then creates a
deployment from ids only.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| RepositoryImageSource | User-facing `appaloft.yaml` source declaration for a prebuilt Docker/OCI image. | Repository config |
| PrebuiltImageProfile | Resource source/runtime profile pair: source kind `docker-image` plus runtime strategy `prebuilt-image`. | Workload delivery |
| ImageSourceReconcile | Config deploy step that creates or configures the Resource source/runtime profile before deployment admission. | Resource profile workflow |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| CONFIG-IMAGE-SOURCE-001 | Parse image source | `appaloft.yaml` declares `source.type = image` and an image reference | The config parser runs | The config is accepted, JSON schema exposes the field, and `runtime.strategy` may be omitted or set to `prebuilt-image`. |
| CONFIG-IMAGE-SOURCE-002 | Reject unsafe image source material | Config includes registry credentials, provider account, tenant, artifact handle, pull secret, raw token, or Git-only source fields under image source | The config parser runs | Parsing fails before mutation with strict schema, identity, unsupported, source-resolution, or raw-secret validation. |
| CONFIG-IMAGE-SOURCE-003 | Configure image source before deployment | No matching Resource source/runtime profile exists | CLI/Action config deploy resolves identity | The workflow maps the source to `docker-image`, maps runtime to `prebuilt-image`, configures profile state when needed, and dispatches `deployments.create` with ids only. |
| CONFIG-IMAGE-SOURCE-004 | Existing image profile is idempotent | Selected Resource already has the same image source and `prebuilt-image` runtime profile | Config deploy runs | No duplicate source/runtime configure command is dispatched. |
| CONFIG-IMAGE-SOURCE-005 | Incompatible runtime strategy is rejected | Config declares `source.type = image` and a non-`prebuilt-image` runtime strategy | The config parser runs | Parsing fails before mutation with a stable source-resolution validation error. |

## Config Contract

MVP repository config fields:

```yaml
source:
  type: image
  image: ghcr.io/acme/api:1.7.3

runtime:
  strategy: prebuilt-image
```

Rules:

- `source.type` supports `git` and `image`; omitted `type` remains the existing Git-compatible
  behavior when `source.repository` is present.
- `source.image` is required when `source.type = image`.
- `runtime.strategy` defaults to `prebuilt-image` when `source.type = image`.
- If `runtime.strategy` is supplied with image source, it must be `prebuilt-image`.
- Image source config must not declare Git-only fields: `repository`, `gitRef`, `commitSha`, or
  `baseDirectory`.
- Image references must not include URL credentials, query strings, raw tokens, registry pull
  secrets, provider-native handles, provider account ids, or deployment target identity.

## Workflow Contract

Config image source deploy must run before deployment admission:

```text
resolve project/environment/resource/server identity
  -> resources.create or resources.show
  -> resources.configure-source(kind=docker-image) when needed
  -> resources.configure-runtime(strategy=prebuilt-image) when needed
  -> deployments.create(ids only)
```

The workflow must use command/query buses only. It must not call Resource repositories or
application services from the CLI/HTTP adapter.

## Non-Goals

- No image fields on `deployments.create`.
- No registry credential, pull-secret, provider account, or token declarations in repository
  config.
- No registry probing, image pull validation, or image vulnerability scanning during config parse.
- No source-package, zip-artifact, local-folder, or hosted artifact storage expansion in this slice.
- No CPU, memory, replica, restart, rollout, or autoscaling sizing policy in repository config.

## Current Implementation Notes And Migration Gaps

This slice is a repository config workflow/profile extension over existing Resource
source/runtime profile operations. No new operation-catalog key is introduced. Registry pull-secret
custody remains deferred until repository config has a separate accepted secret-reference contract.
