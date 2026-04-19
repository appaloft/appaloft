# Repository Deployment Config File Bootstrap Workflow Spec

## Normative Contract

A repository deployment config file is a versioned deployment profile for the source tree and the
non-interactive expression of a Quick Deploy resource-profile draft. It is an entry-workflow input,
not a business command, not a resource identity record, and not a `deployments.create` input shape.

Every entrypoint that claims support for repository deployment config files must prove the complete
file flow in the test matrix:

```text
source selection
  -> discover and parse repository config profile
  -> resolve state backend; for SSH deploys, ensure, lock, and migrate remote `ssh-pglite`
  -> resolve trusted Appaloft project/environment/resource/server identity outside the file
  -> create or update resource-owned profile through explicit operations when needed
  -> apply non-secret env values and resolved secret references through environment commands
  -> deployments.create(projectId, environmentId, resourceId, serverId, destinationId?)
  -> apply server-applied proxy routes from trusted config domain intent when supported by the
     selected state/backend mode
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
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Quick Deploy Workflow Spec](./quick-deploy.md)
- [Control-Plane Mode Selection And Adoption](./control-plane-mode-selection-and-adoption.md)
- [Resource Create And First Deploy Workflow Spec](./resources.create-and-first-deploy.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Deployment Config File Implementation Plan](../implementation/deployment-config-file-plan.md)
- [GitHub Action Deploy Wrapper Implementation Plan](../implementation/github-action-deploy-action-plan.md)
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
- provider-neutral server-applied domain intent for SSH CLI mode, using trusted context outside the
  file for identity and credentials;
- non-secret control-plane connection policy for selecting no control plane, trusted auto
  detection, Appaloft Cloud, or a self-hosted Appaloft control plane;
- future provider-neutral resource sizing and rollout policy after their own ADR/spec coverage.

The file does not exist to choose durable Appaloft control-plane identity.

## Control-Plane Mode Policy

Repository config may declare control-plane connection policy, not Appaloft identity:

```yaml
controlPlane:
  mode: none
```

Accepted future shape:

```yaml
controlPlane:
  mode: self-hosted
  url: https://appaloft.internal.example.com
```

Rules:

- `mode` may be `none`, `auto`, `cloud`, or `self-hosted`.
- Omitting `controlPlane` is equivalent to `mode: none`.
- `url` is non-secret connection metadata and is allowed only for self-hosted or future accepted
  private control-plane endpoints.
- Tokens, API keys, database URLs, SSH keys, certificate material, project ids, resource ids, server
  ids, destination ids, credential ids, organization ids, tenant ids, and Cloud project selectors
  are rejected.
- Config `controlPlane` cannot retarget source link identity. Identity comes from trusted
  entrypoint input, authenticated control-plane scope, GitHub repository identity, source link
  state, adoption markers, or explicit relink/adoption operations.
- `mode: auto` may use only trusted endpoint/login/adoption-marker sources. Without one, it falls
  back to `none` and records the fallback in diagnostics.
- `mode: cloud` and `mode: self-hosted` require a control-plane compatibility handshake before any
  project, resource, route, domain, environment, or deployment mutation.

Config control-plane mode selection happens before state backend resolution. A GitHub Action may
remain the execution owner in every mode; Cloud/self-hosted ownership only says where Appaloft
state, locks, source links, policy, and managed workflows live.

## Relationship To Quick Deploy

Config-file bootstrap is the headless/non-interactive form of Quick Deploy draft normalization. A
Web/local-agent file picker, CLI `appaloft deploy --config`, GitHub Actions binary run, and future
MCP tool must all normalize config profile fields into the same project/server/environment/resource
operation sequence that interactive Quick Deploy uses.

The config file is not a separate deploy API and does not introduce a hidden workflow command. A
headless executor may skip prompts by using trusted action inputs, CLI flags, link state, or
source-derived defaults, but it must still dispatch explicit operations and keep the final
deployment admission ids-only.

When the entrypoint targets an SSH server without a selected control plane, the config workflow must
resolve the SSH-server `ssh-pglite` state backend before identity resolution. Repository config
does not become the state store; it is a versioned desired profile that is reconciled into
server-local Appaloft state and route/proxy state.

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

When a headless entrypoint targets an SSH server, the default state backend is `ssh-pglite`: PGlite
files persisted under the configured Appaloft data root on that SSH server. The runner-local
filesystem is not the default source of truth. Runner-local PGlite is allowed only when the
entrypoint explicitly selects a local-only, dry-run, smoke-test, or no-SSH state mode.

`DATABASE_URL` is not required for `ssh-pglite`. A database URL is required only when the caller
explicitly selects PostgreSQL, or when the entrypoint is talking to a remote Appaloft control plane
that owns persistence.

The default headless GitHub Actions flow is durable on the SSH server. It must ensure the remote
state root, acquire an exclusive remote state lock, run state migrations, resolve or create
project/environment/server/resource records from trusted CLI/action inputs and source fingerprints,
then dispatch the final ids-only deployment command. `projectId`, `environmentId`, `resourceId`,
`serverId`, and `destinationId` are optional trusted selection overrides for hosted/self-hosted
control planes or explicit operator selection. They are not required for the pure SSH CLI flow.

Remote state lifecycle is mandatory for production pure CLI mode:

```text
trusted SSH target and credential
  -> resolve remote Appaloft data root
  -> ensure data root, schema-version marker, lock area, backup/journal area, and permissions
  -> acquire exclusive mutation lock with owner/correlation metadata
  -> create pre-migration backup or journal when schema version differs
  -> run migrations
  -> verify state integrity and migration marker
  -> resolve source link and workflow identity
  -> run explicit Appaloft operations
  -> persist source link, route desired/applied state, and safe diagnostics
  -> release lock
```

Recovery requirements:

- abandoned locks must be visible through diagnostics and recoverable by a deliberate operator
  action or safe stale-lock policy;
- failed migrations must leave either the previous state readable or an explicit recovery marker
  with the backup/journal location;
- deploy commands must not continue after a failed ensure, lock, migration, or integrity check;
- `system.doctor` or equivalent CLI diagnostics must expose state backend origin, schema version,
  lock status, migration status, and last safe backup marker without leaking credentials.

CI-provided secrets are resolver inputs, not committed config values. For GitHub Actions, the
workflow maps GitHub secrets into runner environment variables, and the Appaloft config references
them with `ci-env:<NAME>`. Other CI systems may provide equivalent environment variables without
changing the repository config contract.

## GitHub Action Wrapper Install UX

The public GitHub Actions install surface is a thin wrapper around the released Appaloft CLI
binary. It is not a hosted control plane, not a GitHub App webhook listener, and not a new Appaloft
business command.

The wrapper is expected to live in `appaloft/deploy-action` so Marketplace metadata, wrapper
versioning, and install scripts can evolve independently from the main Appaloft repository. The
main repository remains the source of truth for CLI release assets, checksums, release manifest,
and behavior specs.

The wrapper must perform only entrypoint work:

```text
action.yml inputs and GitHub Secrets
  -> select Appaloft CLI version and platform release asset
  -> download CLI archive, checksums.txt, and optional release-manifest.json
  -> verify archive SHA-256 before extraction
  -> write SSH private key input to a temporary 0600 file when supplied
  -> invoke appaloft deploy <source> --config <path> with trusted SSH/state flags
  -> remove temporary key material when possible
```

The wrapper must not rebuild Appaloft from source, parse human CLI output as a durable business
contract, or resolve GitHub Secrets implicitly. GitHub Secrets become action inputs or workflow
environment variables only when the workflow author maps them explicitly.

The minimal supported action inputs are:

- `version`, defaulting to `latest` for quickstarts but recommended as an exact tag for production;
- `config`, defaulting to `appaloft.yml` when present;
- `source`, defaulting to `.`;
- `ssh-host`, `ssh-user`, `ssh-port`, and either `ssh-private-key` or `ssh-private-key-file`;
- `server-proxy-kind` and `state-backend` as optional trusted entrypoint overrides;
- `args` as a last-resort pass-through for CLI flags not modeled as action inputs yet.

`ssh-private-key` is a secret value and must be written to a runner temp file before invocation.
Only the file path may be passed to `appaloft deploy --server-ssh-private-key-file`. The raw key
must never appear in command arguments, logs, release metadata, config-origin metadata, diagnostic
payloads, or read models.

The action's primary invocation remains config-driven. If no config file is supplied or discovered,
the action may still run `appaloft deploy`, but only with enough trusted input or CLI detection to
satisfy the non-interactive Quick Deploy contract. Missing non-interactive context must fail before
mutation. If no config domain intent is supplied, no custom server-applied domain route is created;
the deployment may still use generated/default access according to the selected server policy.

Publishing a new Appaloft CLI release must not normally require a new action wrapper release. A
pinned `version: vX.Y.Z` downloads that exact CLI release, and `version: latest` resolves the
latest stable main-repo release at runtime. The deploy-action repository should release only when
wrapper inputs, download verification, docs, or security behavior change.

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

## Source Fingerprint Link State And Relink

Pure CLI/SSH mode must persist source fingerprint link state in the selected `ssh-pglite` backend.
This link state is the durable non-versioned mapping that lets repeated GitHub Actions runs deploy
the same app without committed Appaloft ids.

The source fingerprint must be stable and secret-free:

- for Git sources, prefer provider repository id/full name when available, normalized clone locator,
  source base directory, and config file identity;
- for local-folder sources, use a normalized selected root identity only for local-state or
  operator-controlled workflows, not cross-run CI identity unless a stable remote source is also
  known;
- for Docker image sources, use image repository/name plus tag or digest according to the source
  binding rules;
- do not include runner temp paths, raw credentials, access tokens, or every commit SHA for normal
  branch deployments;
- future preview environment links may include PR or branch identity explicitly.

The source link maps a fingerprint and selected environment/source scope to:

- project id;
- environment id or environment key;
- resource id;
- server id and destination id when the entrypoint owns default target selection;
- last safe source metadata and config origin metadata for diagnostics.

First-run deploy may create the link after the project/environment/server/resource context is
created by explicit operations. Later deploys must reuse it. If a link exists but the operator wants
another project/resource/server context, the workflow must stop and require explicit relink. A
committed config change must never retarget an existing link.

The active relink boundary is `source-links.relink`. It is a public CLI command/workflow, not a
hidden deploy side effect. Relink may update link state only; it must not mutate resource
source/runtime/network profile fields, deployment history, environment variables, or server
credentials.

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
| `access.domains[]` | Server-applied route state in SSH CLI mode; managed `DomainBinding` or managed route intent in control-plane mode | Accepted values describe provider-neutral host/path/TLS route intent and optional canonical redirect aliases. They never enter `deployments.create`, never select identity or credentials, and never contain raw certificate material. |
| `controlPlane.mode` / `controlPlane.url` | Entry workflow mode resolver | Selects connection policy and non-secret endpoint metadata only. It never enters `deployments.create`, never selects durable identity, and never stores tokens or database URLs. |
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

## Server-Applied Domains And Managed Domain Bindings

The target repository config schema may accept provider-neutral domain intent under
`access.domains[]`.

Each domain entry must stay within this shape:

```yaml
access:
  domains:
    - host: example.com
      pathPrefix: /
      tlsMode: auto
    - host: www.example.com
      redirectTo: example.com
      redirectStatus: 308
```

Rules:

- `host` is a domain name only; schemes, ports, and path fragments are rejected.
- `pathPrefix` defaults to `/` when omitted.
- `tlsMode` is provider-neutral and initially allows `auto` or `disabled`.
- `redirectTo`, when present, is a domain name only and must point to another non-redirect domain
  entry in the same normalized route set for the same trusted resource/server/destination context.
- `redirectStatus` defaults to `308` and may be `301`, `302`, `307`, or `308`.
- Redirect entries preserve the request path and query by default. If `pathPrefix` is set on the
  redirect source, only that prefix is redirected and the suffix is preserved under the target
  host.
- Redirect entries must not create loops, self-redirect, redirect to missing hosts, redirect to
  another redirect entry, or redirect across resource, server, destination, project, environment,
  credential, or organization boundaries.
- Raw certificate material, private keys, DNS provider credentials, certificate provider account
  ids, server ids, destination ids, and credential selectors are rejected.
- A domain entry requires a reverse-proxy-capable resource network profile and selected SSH/control
  plane target context.

When the entrypoint uses `ssh-pglite`, config domain intent becomes server-applied proxy route
state:

```text
access.domains[]
  -> trusted resource/server/destination context
  -> remote SSH PGlite route desired state
  -> edge proxy provider route/certificate rendering
  -> runtime adapter applies provider-owned config on the SSH server
  -> remote state records applied route and verification status
```

This mode does not create a managed `DomainBinding` aggregate. TLS renewal is delegated to the
resident edge proxy/provider when the provider supports it. One-shot CLI/Action executions observe,
repair, or reapply on deploy, verify, or doctor; they do not imply an always-running Appaloft DNS or
certificate scheduler.

Canonical redirects in SSH mode are applied by the same provider route realization path. The target
host must have a served route entry; the redirecting host must still resolve to the selected edge
address. When `tlsMode = auto`, the resident provider must be able to obtain or serve certificate
coverage for both the canonical host and redirect source host. Appaloft records redirect desired,
applied, or failed status in server-applied route state and exposes it through access/proxy
diagnostics, but does not create `DomainBinding` or `Certificate` aggregates.

When the entrypoint uses a hosted or self-hosted control plane, the same config intent may map to
managed `domain-bindings.create`, DNS observation, certificate, and read-model workflows after
trusted resource/server/destination context exists. Domain/TLS failure must be reported through the
appropriate route/domain read models and errors; it must not mutate an already accepted deployment
request or imply rollback of created project/resource/environment records.

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
When invoked from deploy-action, install and verify the released Appaloft binary
  -> user selects source or passes source path
  -> entrypoint resolves config file path
  -> parse and validate strict config schema
  -> reject identity/secret/unsupported fields
  -> resolve control-plane mode and execution owner from config, env, flags/action inputs, or local login
  -> run control-plane handshake before mutation when Cloud/self-hosted is selected
  -> resolve non-secret env declarations and supported secret references
  -> resolve state backend; for SSH deploys, ensure, lock, and migrate remote `ssh-pglite`
  -> resolve source fingerprint link state and trusted Appaloft identity outside file
  -> create project/resource on first run when no trusted identity exists
  -> persist source fingerprint link state after first-run identity is created
  -> apply profile fields through resources.create or explicit resource/environment config commands
  -> dispatch environments.set-variable for config env and resolved CI secrets
  -> resolve config `access.domains[]` into server-applied route intent or managed domain intent
  -> dispatch deployments.create with ids only
  -> apply/observe server-applied route state in SSH mode, or dispatch managed domain follow-up
     commands in control-plane mode
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
| `validation_error` | `control-plane-config` | No | Config declares an invalid mode, unsafe URL, identity selector, or secret-bearing control-plane field. |
| `validation_error` | `control-plane-resolution` | No | Selected mode cannot resolve the required URL, credential, trusted source, or login context before mutation. |
| `control_plane_handshake_failed` | `control-plane-handshake` | Conditional | Selected Cloud/self-hosted control plane is reachable but client/API/schema/feature/auth compatibility failed. |
| `control_plane_unsupported` | `control-plane-capability` | No | Selected control-plane behavior is not implemented or the endpoint lacks the requested capability. |
| `control_plane_adoption_required` | `control-plane-resolution` | No | A server adoption marker indicates control-plane ownership, but the entrypoint attempted uncoordinated direct SSH state mutation. |
| `validation_error` | `config-profile-resolution` | No | Profile field cannot map safely to resource/environment commands. |
| `validation_error` | `remote-state-resolution` | Conditional | SSH-targeted entrypoint could not resolve or initialize the remote Appaloft state backend. |
| `infra_error` | `remote-state-lock` | Yes | Remote state mutation lock could not be acquired or was interrupted. |
| `infra_error` | `remote-state-migration` | Conditional | Remote state migration failed before workflow commands were dispatched. |
| `validation_error` | `source-link-resolution` | No | Source fingerprint is ambiguous, missing required stable identity, or points at another context without explicit relink. |
| `validation_error` | `config-domain-resolution` | No | Config domain intent cannot map safely to server-applied or managed domain workflow state, including invalid host/path/TLS shape, missing redirect target, self-redirect, redirect loop, redirect-to-redirect, or unsupported redirect policy. |
| `unsupported_config_field` | `config-capability-resolution` | No | Known future field such as CPU/memory/replicas or rollout policy is not enforceable by current workflow/resource/runtime target specs. |
| `resource_profile_drift` | `resource-profile-resolution` | No | Existing resource differs from config and no explicit update operation is available. |
| `infra_error` | `proxy-domain-realization` | Conditional | Server-applied proxy domain route could not be rendered, applied, reloaded, or verified on the target. |

## Current Implementation Notes And Migration Gaps

Current code has a deployment-config package and JSON schema for the supported JSON/YAML target
names listed above.

Current config parsing does not accept `controlPlane.mode` or `controlPlane.url` yet. The CLI
state backend resolver can observe `APPALOFT_CONTROL_PLANE_URL` and `APPALOFT_DATABASE_URL` as a
partial backend selection hint, but Cloud/self-hosted mode parsing, compatibility handshake,
adoption markers, and API-mode deploy execution are future Phase 1+ work under ADR-025.

Current CLI `init` writes only profile fields under `runtime` and `network`; it does not write
project/resource/server identity or target bootstrap data.

Current CLI deploy supports explicit `--config` and implicit source-root discovery. The CLI maps
config source/runtime/network/health profile fields into quick-deploy resource creation input,
supports trusted target flags such as `--server-host` and `--server-ssh-private-key-file`, resolves
plain `env` declarations and `ci-env:` secret references into environment variable commands,
bootstraps project/server/environment/resource records in explicit local PGlite mode when ids are
not provided, then dispatches ids-only `deployments.create`. For config-driven SSH targets, the CLI
now resolves `ssh-pglite` as the default state backend, carries a trusted SSH target into the state
decision, and shell-built CLI programs run an SSH transport-backed remote-state lifecycle adapter
before identity queries or mutations. The shell CLI also mirrors the selected SSH server's PGlite
state into a target-scoped local data directory before composition opens the database, and uploads
that PGlite directory back to the SSH server after the command shuts down. A custom CLI runtime
without that adapter fails with `validation_error`, phase `remote-state-resolution`, rather than
falling back to runner-local PGlite.

Current `DeploymentContextBootstrapService` contains legacy config/default bootstrap helpers, but
the active `deployments.create` input schema is ids-only and the service currently only fills the
default destination seam.

Current file parsing supports JSON and YAML. Ambiguous multi-file detection is implemented in the
CLI/filesystem entry paths.

Current executable tests prove parser safety, Git-root filesystem discovery, CLI init shape,
profile-to-quick-deploy seed mapping, headless local PGlite defaulting, no-id non-TTY context
bootstrap, `ci-env:` secret resolution, environment command sequencing, and ids-only
`deployments.create`. After ADR-024, local PGlite bootstrap is narrowed to explicit local-only mode.

CLI resolver-level tests now cover state backend selection for `ssh-pglite`, `local-pglite`, and
`postgres/control-plane`, plus source fingerprint normalization. CLI config workflow tests also
cover the remote-state lifecycle hook ordering, release after config bootstrap mutations, and the
safe failure path when no remote lifecycle adapter is wired. CLI adapter-level tests cover
filesystem remote state ensure, mutation lock, migration, recovery marker, lock diagnostics, source
link create/reuse, retarget rejection, relink store semantics, and SSH transport command
construction/error mapping. Shell tests cover pre-composition remote PGlite mirror planning and
tar-over-SSH download/upload command sequencing, including staged local download extraction and
remote upload backup/restore/recovery command sequencing. CLI config workflow tests cover first-run
source link creation and repeated config deploy reuse through the source fingerprint link hook.
Application and CLI tests cover `source-links.relink` command dispatch, context validation,
optimistic guard conflicts, and SSH remote-state mirror planning for relink.

An opt-in shell e2e harness in
`apps/shell/test/e2e/github-action-ssh-state.workflow.e2e.ts` covers the GitHub Actions style
process boundary for SSH-server `ssh-pglite`: two separate CLI processes with different local
PGlite directories deploy the same repository/config to the same trusted SSH target and the second
process reuses the remote source link/resource identity.
`.github/workflows/ssh-remote-state-e2e.yml` wires that harness into manual runs, nightly smoke,
and release gating when the repository has the SSH target secrets configured.

Current config parsing accepts `access.domains[]` declarations with provider-neutral `host`,
`pathPrefix`, and `tlsMode` fields, and rejects domain identity selectors, raw TLS/secret material,
and unsafe host/path shapes before mutation. SSH CLI config deploy now persists valid
`access.domains[]` as server-applied route desired state in the selected SSH-server state backend
before ids-only deployment admission. First-run bootstrap may store the desired state at the
project/environment/resource/server default-destination key when no explicit destination id has been
selected yet; deployment planning falls back to that key after checking the resolved destination
key. A custom runtime without route-state storage fails at `config-domain-resolution` instead of
silently ignoring the declaration. Deployment planning now reads that desired state back from
SSH-server state, groups entries by `pathPrefix` and `tlsMode`, and forwards each group to
provider-neutral edge proxy route input without creating managed `DomainBinding` rows.
Deployment-finished handling records applied/failed route status back into
the same server-applied route state. The opt-in SSH e2e harness verifies Traefik-backed
server-applied route reachability for `CONFIG-FILE-DOMAIN-005`. Broader CLI e2e, HTTP-schema
contract coverage, existing-resource profile drift handling, stored/external secret adapters beyond
`ci-env:`, Dockerfile/Compose path mapping, operational provisioning of the external SSH e2e
secrets/target, real HTTP/HTTPS public validation for canonical redirects, provider-owned ACME
history, and managed domain control-plane mapping remain follow-up work.

## Open Questions

- What exact operation names should update source/runtime/network profile fields on an existing
  resource when a config file changes after first deploy?
- Which resource sizing fields should be admitted first for the single-server Docker/Compose
  backend, and how should unsupported target backends report capability mismatch?
