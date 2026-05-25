# ADR-076: Repository Config Prebuilt Image Source

Status: Accepted

Date: 2026-05-24

## Context

Appaloft already supports prebuilt image deployments through Resource source bindings with
`kind = docker-image` and runtime strategy `prebuilt-image`. CLI users can deploy an image source,
and the runtime planner resolves it as a Docker/OCI artifact without build work. Repository config,
however, can currently describe only Git source locators. That leaves a common application delivery
profile outside `appaloft.yaml`: "run this already-built image".

The config surface must stay provider-neutral and must not become a registry credential surface. It
may describe an image reference, but it must not contain registry pull secrets, provider accounts,
tokens, tenant/org identity, artifact handles, or deployment target identity.

## Decision

Repository config extends `source` with a prebuilt image shape:

```yaml
source:
  type: image
  image: ghcr.io/acme/api:1.7.3

runtime:
  strategy: prebuilt-image
```

When `source.type = image`, `runtime.strategy` defaults to `prebuilt-image` if not supplied. If a
runtime strategy is supplied, it must be `prebuilt-image`. Git-only source fields such as
`repository`, `gitRef`, `commitSha`, and `baseDirectory` are not valid for image source configs.

The CLI/Action repository-config workflow must continue to dispatch existing operations through the
command/query buses:

1. resolve project/environment/resource/server identity outside the committed file;
2. create or configure the selected Resource with source `kind = docker-image` and locator equal to
   the image reference;
3. create or configure the Resource runtime profile with strategy `prebuilt-image`;
4. run any other repository-config reconciliation steps;
5. call `deployments.create` with ids only.

## Consequences

- This is a workflow/profile extension over existing `resources.create`,
  `resources.configure-source`, `resources.configure-runtime`, and `deployments.create`.
- No new operation-catalog key is introduced.
- `deployments.create` remains ids-only and does not grow image/source fields.
- Registry credentials and pull-secret references remain outside repository config until a
  separate safe secret custody contract exists.
- The Appaloft deploy skill and YAML sync guidance must treat source kind changes, especially
  prebuilt image source support, as `appaloft.yaml` sync candidates.

## Governed Specs

- [Repository Config Prebuilt Image Source](../specs/085-repository-config-prebuilt-image-source/spec.md)
- [Repository Deployment Config File Bootstrap Workflow](../workflows/deployment-config-file-bootstrap.md)
- [GitHub Action PR Preview Deploy Workflow](../workflows/github-action-pr-preview-deploy.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Public Documentation Test Matrix](../testing/public-documentation-test-matrix.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](./ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](./ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-021: Docker/OCI Workload Substrate](./ADR-021-docker-oci-workload-substrate.md)
