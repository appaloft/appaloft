# Deployment Config File Implementation Plan

## Goal

Align repository deployment config file support with
[Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md) and
[Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md).

The target behavior is a local entry workflow that reads a source-adjacent config profile, rejects
unsafe identity/secret/unsupported fields, applies profile values through explicit operations, and
dispatches ids-only `deployments.create`.

## Scope

Implement in ordered slices:

1. Config schema reset
   - Remove or gate committed `project`, `resource` identity, `targets`, `servers`, raw domain/TLS,
     raw credential, and raw secret fields from the repository config schema.
   - Keep profile fields that can map to `ResourceSourceBinding`, `ResourceRuntimeProfile`,
     `ResourceNetworkProfile`, health policy, non-secret environment variables, and required secret
     references.
   - Keep schema strict so unsupported CPU/memory/replica/restart/rollout fields fail until their
     own ADR/spec/runtime enforcement exists.

2. Discovery and parser
   - Resolve explicit config path first.
   - Discover from Git root for Git sources and selected root for non-Git folders.
   - Add YAML parsing for the supported target names.
   - Reject ambiguous multiple config files in one root.

3. Identity resolver
   - Resolve project/resource/server/destination/credential identity from explicit entrypoint ids,
     trusted Appaloft link/source state, safe source fingerprint, first-run auto-creation, or
     interactive prompt.
   - Do not select identity from committed repository config content.
   - Define the future link/relink command before making source-to-project/resource link state
     user-facing.

4. Profile mapper
   - Map config source/runtime/network/health profile fields into `resources.create` for first
     deploy.
   - When profile update commands exist, sequence them before deployment for existing resources.
   - Until update commands exist, detect profile drift and fail before `deployments.create`.

5. Secret handling
   - Reject raw secret material before mutation.
   - Allow only required secret declarations and references to stored Appaloft/external secrets or
     reusable SSH credentials.
   - Ensure errors, logs, diagnostics, and progress events never include raw values.

6. Entrypoints
   - Add CLI `appaloft deploy --config <path>` and implicit source-root discovery.
   - Keep HTTP `POST /api/deployments` strict and ids-only.
   - Keep `/api/schemas/appaloft-config.json` aligned with the parser schema.
   - Rebuild `appaloft init` so generated config contains profile fields only and does not write
     project/server/resource identity.

7. Tests
   - Implement executable tests named with the matrix ids in
     [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md).
   - Add CLI e2e/contract coverage for explicit and implicit config.
   - Add HTTP contract coverage proving deployment admission rejects config-file fields.
   - Add parser/schema tests for discovery, YAML, ambiguity, identity rejection, secret rejection,
     and unsupported sizing rejection.

## Out Of Scope Until Separate Specs Exist

- CPU/memory/replica/restart/rollout enforcement.
- Kubernetes, Swarm, Helm, namespace, manifest, ingress class, pull-secret, or node selector config
  fields.
- A public relink command for intentionally moving a source repository to another project/resource.
- A hidden backend convenience endpoint that reads repository config and performs multiple writes.

## Current Implementation Notes And Migration Gaps

Implemented slices:

- `@appaloft/deployment-config` now owns a strict profile-only schema for JSON/YAML config files.
  It accepts source/runtime/network/health profile fields, non-secret `env` values, and secret
  references, while rejecting committed identity selectors, raw secret material, unknown fields, and
  unsupported CPU/memory/replica/restart/rollout fields.
- `FileSystemDeploymentConfigReader` supports explicit config paths, Git-root discovery for nested
  local sources, YAML parsing, ambiguous-file rejection, and profile snapshot mapping.
- CLI `appaloft init` writes a profile-only config and no longer writes project/resource/server
  identity or target bootstrap data.
- CLI `appaloft deploy --config <path>` and implicit source-root discovery read the same config
  parser, map profile fields into the quick-deploy resource draft, let explicit flags override the
  file, and still dispatch ids-only `deployments.create`.
- `/api/schemas/appaloft-config.json` is regenerated from the current parser schema, while
  `POST /api/deployments` remains strict ids-only.

Remaining gaps:

- Existing-resource profile drift detection and explicit profile update command sequencing are not
  implemented yet.
- Config-file Dockerfile/Compose path selectors are rejected until resource profile fields and
  runtime planner mapping own those paths explicitly.
- Required secret references and non-secret `env` declarations are parsed but not yet applied
  through environment/secret commands.
- Durable source-to-project/resource link state and relink behavior are still open.
- `DeploymentContextBootstrapService` still contains legacy config/default bootstrap helpers, but
  active `deployments.create` remains ids-only.
- Current coverage is targeted parser/filesystem/CLI/application coverage; broader CLI e2e,
  HTTP-schema contract, link-state, drift, and environment/secret command coverage remains follow-up.
