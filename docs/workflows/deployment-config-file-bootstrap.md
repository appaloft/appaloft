# Repository Deployment Config File Bootstrap Workflow Spec

## Normative Contract

A repository deployment config file is a versioned deployment profile for the source tree. It is an
entry-workflow input, not a business command, not a resource identity record, and not a
`deployments.create` input shape.

Every entrypoint that claims support for repository deployment config files must prove the complete
file flow in the test matrix:

```text
source selection
  -> discover and parse repository config profile
  -> resolve trusted Appaloft project/environment/resource/server identity outside the file
  -> create or update resource-owned profile through explicit operations when needed
  -> apply non-secret env values and resolved secret references through environment commands
  -> deployments.create(projectId, environmentId, resourceId, serverId, destinationId?)
```

Changing a committed config file must not silently redirect deployments to a different Appaloft
project, resource, server, destination, credential, organization, or secret store.

## Global References

This workflow inherits:

- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Quick Deploy Workflow Spec](./quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](./resources.create-and-first-deploy.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Deployment Config File Implementation Plan](../implementation/deployment-config-file-plan.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

The file exists to make source-adjacent deployment profile choices reproducible:

- source root and monorepo app selection;
- runtime plan strategy;
- install, build, start, Dockerfile, Compose, static publish, and artifact planning fields;
- resource network profile such as `internalPort`, upstream protocol, exposure mode, and compose
  target service;
- reusable health-check defaults;
- non-secret environment variable declarations and required secret references;
- future provider-neutral resource sizing and rollout policy after their own ADR/spec coverage.

The file does not exist to choose durable Appaloft control-plane identity.

## Discovery And Format

Config discovery must start from the selected source. For a Git worktree, discovery uses the Git
root for the selected source. For a non-Git local folder, discovery uses that folder as the root.
Discovery must not scan arbitrary parents outside the source root.

Supported target discovery names are:

- `appaloft.json`;
- `appaloft.config.json`;
- `.appaloft.json`;
- `appaloft.yaml`;
- `appaloft.yml`;
- `appaloft.config.yaml`;
- `appaloft.config.yml`;
- `.appaloft.yaml`;
- `.appaloft.yml`.

When an entrypoint supplies an explicit config path, that path wins and missing-file failure is a
structured validation error. When no explicit path is supplied and more than one supported config
file exists in the same discovery root, the entrypoint must fail with an ambiguous-config error
instead of choosing by accident.

Schema validation is strict. Unknown fields, deprecated identity fields, unsupported future fields,
and malformed profile fields must fail before any write command is dispatched unless the entrypoint
is running an explicit migration command.

The HTTP adapter may serve the config schema for tooling, but strict `POST /api/deployments` remains
ids-only. Reading a local repository config file is a CLI, local Web agent, automation, or future MCP
entry workflow responsibility unless a future HTTP workflow command is accepted by ADR.

## Headless CI Runtime State

GitHub Actions and other headless CI entrypoints may use only the Appaloft binary plus a repository
config file. That mode is a local entry workflow over the same commands, not a separate hosted
control-plane requirement.

Embedded PGlite is the default persistence backend for a single headless binary invocation. A
`DATABASE_URL` is not required when the selected driver is PGlite. A database URL is required only
when the caller explicitly selects the PostgreSQL driver, or when the entrypoint is talking to a
remote Appaloft control plane that owns persistence.

The default headless GitHub Actions flow is ephemeral. It may create or reuse local PGlite project,
environment, server, and resource records from trusted CLI/action inputs before dispatching the
final ids-only deployment command. `projectId`, `environmentId`, `resourceId`, `serverId`, and
`destinationId` are optional stateful inputs for a hosted control plane, self-hosted Appaloft
service, or intentionally durable local state. They are not required for the one-shot binary flow.

CI-provided secrets are resolver inputs, not committed config values. For GitHub Actions, the
workflow maps GitHub secrets into runner environment variables, and the Appaloft config references
them with `ci-env:<NAME>`. Other CI systems may provide equivalent environment variables without
changing the repository config contract.

## Identity Resolution

The repository config file must not contain or drive these identity selectors:

- `project`, `projectId`, organization, workspace, or tenant selection;
- `environmentId` or a default environment selector that automatically changes the target
  environment;
- `resourceId`, resource name as durable selector, or resource slug as durable selector;
- `serverId`, target host, destination id, destination name, provider account, region, or concrete
  runtime target selection;
- credential id, credential material, SSH private key, password, token, deploy key, or certificate
  material as raw values.

Identity resolution order is:

1. Explicit trusted ids or selections passed by the entrypoint, such as CLI flags, Web state, API
   input, or future MCP tool parameters.
2. Trusted Appaloft link state or source binding state maintained outside the committed repository
   config file.
3. Existing Appaloft records matched by a safe source identity fingerprint, such as provider
   repository identity plus base directory.
4. First-run auto-creation through explicit operations using source-derived defaults.
5. Interactive prompt, when the entrypoint is interactive.

First-run auto-creation may create a project and resource, but it must use source/provider metadata
or operator input as the seed, not a mutable committed `project` section. Subsequent deployments
must reuse the existing trusted Appaloft identity unless the operator explicitly relinks or selects
a different identity outside the config file.

Environment-specific config overlays are allowed only as overlays for an environment selected by
the entrypoint or trusted link state. A committed config file must not be the only reason a
deployment moves from `staging` to `production`.

## Profile Mapping

Accepted config profile fields map to resource-owned or environment-owned contracts before
deployment admission.

| Config concern | Canonical owner | Rule |
| --- | --- | --- |
| Source root/base directory | `ResourceSourceBinding` | Normalize as source-root-relative path; reject `..`, URLs, shell metacharacters, and host absolute paths. |
| Git ref or commit pin | `ResourceSourceBinding` | May refine selected source identity; branch/tag ambiguity must be resolved before persistence. |
| Runtime strategy | `ResourceRuntimeProfile` | Use `RuntimePlanStrategy`, not `deploymentMethod`, after entry normalization. |
| Dockerfile, Compose file, build target, static publish directory | `ResourceRuntimeProfile` | Strategy-specific paths are relative to source base directory and must be safe. |
| Install/build/start commands | `ResourceRuntimeProfile` | User-authored shell leaves; adapters render typed runtime commands at execution. |
| `internalPort`, upstream protocol, exposure mode, target service | `ResourceNetworkProfile` | Must become resource network state; never a deployment command field. |
| Health policy | `ResourceRuntimeProfile` / health policy command | Must be reusable resource configuration. |
| Plain environment values | `Environment` variable commands | Only for non-secret values; `PUBLIC_` and `VITE_` keys map to build-time `plain-config`, other keys map to runtime `plain-config`, all at `environment` scope unless a future schema adds explicit kind/exposure/scope fields. |
| Required secret names | Secret/credential commands or adapters | Declare requirements or references, not raw values. Headless CI supports `ci-env:<NAME>` as an environment-variable resolver reference. |
| Domains/TLS | `domain-bindings.create` and certificate commands | Must be explicit follow-up operations, not deployment admission fields. |
| CPU, memory, replicas, restart policy, rollout overlap/drain | Future resource/runtime-target profile specs | Must be rejected until an ADR/spec and runtime enforcement exist; no silent ignore. |

If a resource already exists and the file changes reusable profile fields, the entry workflow must
either dispatch explicit resource configuration operations accepted by the operation catalog, or
fail with a structured profile-drift error. It must not silently mutate resource state through
`deployments.create`.

## Secret And Credential Rules

Committed config files must not store raw secret material. This includes SSH private keys, deploy
keys, access tokens, API keys, passwords, database URLs with credentials, certificate private keys,
and raw secret environment values.

Allowed secret-related declarations are:

- required secret keys without values;
- `ci-env:<NAME>` references that are resolved from the trusted CI runner environment at entry time;
- references to secrets already stored in Appaloft or a configured external secret adapter;
- references to reusable SSH credentials created through credential commands;
- `local-ssh-agent` style credential use when the runtime target supports it;
- generated-secret requests only after a secret-generation operation is specified.

If a file contains raw secret material, admission must fail with `validation_error` in phase
`config-secret-validation` before any write command is dispatched. Error details, logs, progress
events, diagnostics, and read models must not include the secret value.

If a required `ci-env:<NAME>` reference cannot be resolved from the entrypoint environment,
admission must fail with `validation_error` in phase `config-secret-resolution` before any write
command is dispatched. Optional unresolved references are skipped without creating an environment
variable.

SSH server credentials are target credential state. The config file may declare that a deployment
requires an SSH-capable target, but it must not register a server with an inline key or password.

## Precedence

Profile precedence is:

```text
built-in defaults
  < source/framework detection
  < repository config base profile
  < repository config environment overlay for the already-selected environment
  < explicit entrypoint flags, prompts, API input, or future MCP parameters
```

Identity selection does not follow this precedence because repository config files are not trusted
identity selectors.

Every applied config field should retain safe origin metadata for diagnostics and future read
models, such as config path and JSON/YAML pointer. Origin metadata must not include secret values.

## Entry Workflow Sequence

```text
User selects source or passes source path
  -> entrypoint resolves config file path
  -> parse and validate strict config schema
  -> reject identity/secret/unsupported fields
  -> resolve non-secret env declarations and supported secret references
  -> resolve trusted Appaloft project/environment/resource/server/destination identity outside file
  -> create project/resource on first run when no trusted identity exists
  -> apply profile fields through resources.create or explicit resource/environment config commands
  -> dispatch environments.set-variable for config env and resolved CI secrets
  -> dispatch deployments.create with ids only
  -> observe progress/read models/diagnostics
```

## Error Codes And Phases

Config-file errors use stable codes and phases:

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `config-discovery` | No | Explicit path missing, ambiguous discovery, or unsupported extension. |
| `validation_error` | `config-parse` | No | JSON/YAML parse failed. |
| `validation_error` | `config-schema` | No | Unknown field or invalid field shape. |
| `validation_error` | `config-identity` | No | File attempted to select project/resource/server/destination/credential identity. |
| `validation_error` | `config-secret-validation` | No | File contained raw secret material. |
| `validation_error` | `config-secret-resolution` | No | Required secret reference could not be resolved from the configured entrypoint resolver. |
| `validation_error` | `config-profile-resolution` | No | Profile field cannot map safely to resource/environment commands. |
| `unsupported_config_field` | `config-capability-resolution` | No | Known future field such as CPU/memory/replicas is not enforceable by current resource/runtime target specs. |
| `resource_profile_drift` | `resource-profile-resolution` | No | Existing resource differs from config and no explicit update operation is available. |

## Current Implementation Notes And Migration Gaps

Current code has a deployment-config package and JSON schema for the supported JSON/YAML target
names listed above.

Current CLI `init` writes only profile fields under `runtime` and `network`; it does not write
project/resource/server identity or target bootstrap data.

Current CLI deploy supports explicit `--config` and implicit source-root discovery. The CLI maps
config source/runtime/network/health profile fields into quick-deploy resource creation input,
supports trusted target flags such as `--server-host` and `--server-ssh-private-key-file`, resolves
plain `env` declarations and `ci-env:` secret references into environment variable commands,
bootstraps project/server/environment/resource records in non-TTY PGlite mode when ids are not
provided, then dispatches ids-only `deployments.create`.

Current `DeploymentContextBootstrapService` contains legacy config/default bootstrap helpers, but
the active `deployments.create` input schema is ids-only and the service currently only fills the
default destination seam.

Current file parsing supports JSON and YAML. Ambiguous multi-file detection is implemented in the
CLI/filesystem entry paths.

Current executable tests prove parser safety, Git-root filesystem discovery, CLI init shape,
profile-to-quick-deploy seed mapping, headless PGlite defaulting, no-id non-TTY context bootstrap,
`ci-env:` secret resolution, environment command sequencing, and ids-only `deployments.create`.
Broader CLI e2e, HTTP-schema contract coverage, existing-resource profile drift handling,
stored/external secret adapters beyond `ci-env:`, Dockerfile/Compose path mapping, and durable
source link/relink behavior remain follow-up work.

## Open Questions

- What command should own local link/relink behavior when a source repository must be intentionally
  moved to another Appaloft project or resource?
- What exact operation names should update source/runtime/network profile fields on an existing
  resource when a config file changes after first deploy?
- Which resource sizing fields should be admitted first for the single-server Docker/Compose
  backend, and how should unsupported target backends report capability mismatch?
