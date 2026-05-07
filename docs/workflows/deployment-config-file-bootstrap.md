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
  -> create resource-owned profile or configure source/runtime/network profile through explicit operations when needed
     or stop with structured profile drift guidance before deployment admission
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
- [GitHub Action PR Preview Deploy](./github-action-pr-preview-deploy.md)
- [Resource Create And First Deploy Workflow Spec](./resources.create-and-first-deploy.md)
- [Resource Profile Drift Visibility](../specs/011-resource-profile-drift-visibility/spec.md)
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
state root, acquire backend state-root coordination, run state migrations, resolve or create
project/environment/server/resource records from trusted CLI/action inputs and source fingerprints,
then dispatch the final ids-only deployment command. `projectId`, `environmentId`, `resourceId`,
`serverId`, and `destinationId` are optional trusted selection overrides for hosted/self-hosted
control planes or explicit operator selection. They are not required for the pure SSH CLI flow.

When shell execution opens a PGlite backend from the SSH mirror, the shell must treat PG/PGlite
tables as the authoritative state store and adopt any adjacent legacy file-backed `source-links/`
and `server-applied-routes/` records into durable PG/PGlite rows before identity resolution. Once a
legacy record is adopted or superseded by an existing PG/PGlite row, the shell must prune the
legacy file so later uploads do not reintroduce conflicting source-link or route-state truth.

Remote state lifecycle is mandatory for production pure CLI mode:

```text
trusted SSH target and credential
  -> resolve remote Appaloft data root
  -> ensure data root, schema-version marker, lock area, backup/journal area, and permissions
  -> acquire brief state-root coordination with owner/correlation/heartbeat metadata
  -> create pre-migration backup or journal when schema version differs
  -> run migrations
  -> verify state integrity and migration marker
  -> release state-root coordination
  -> resolve source link and workflow identity
  -> run explicit Appaloft operations with command-level coordination by logical mutation scope
  -> persist source link, route desired/applied state, and safe diagnostics
```

Recovery requirements:

- active state-root coordination leases must keep heartbeat/last-seen metadata fresh while backend
  maintenance owns the state root;
- entrypoint adapters may wait for a bounded retry window before returning a retriable
  `remote-state-lock` error for an active lock;
- abandoned locks must be visible through diagnostics and recoverable by a deliberate operator
  action or a safe stale-lock policy that records the recovered lock metadata before continuing;
- state-root maintenance locks protect short ensure/download/upload work, so current clients may
  cap older recorded stale windows to their configured maintenance stale window before stale-only
  recovery when heartbeat metadata is no longer fresh;
- incomplete state-root lock directories that never wrote owner/heartbeat metadata are not valid
  active leases and may use a shorter incomplete-lock stale window before stale-only recovery;
- out-of-band remote-state diagnostics and stale recovery must run without acquiring the same
  state-root mutation lock they are diagnosing;
- repository-owned docs production/preview maintenance uses the `Remote State Maintenance`
  workflow, which shares the docs remote-state concurrency group, runs `inspect` or stale-only
  `recover-stale`, and reports safe lock metadata in the GitHub step summary;
- repository-owned docs production/preview deploys may run a narrow SSH runtime-capacity preflight
  before state-root locking to remove stale attempt-scoped `ssh-deployments/dep_*` staging
  directories when previous failed uploads exhausted the remote runtime filesystem;
- releasing a lock must be owner-aware so an older workflow cannot delete a newer lock after
  recovery or superseding takeover;
- failed migrations must leave either the previous state readable or an explicit recovery marker
  with the backup/journal location;
- deploy commands must not continue after a failed ensure, lock, migration, or integrity check;
- command-level mutation waiting belongs to the explicit operation scope, for example
  `resource-runtime`, `preview-lifecycle`, or `source-link`, and must not be modeled only as a
  whole-server lock;
- `system.doctor` or equivalent CLI diagnostics must expose state backend origin, schema version,
  lock status, migration status, and last safe backup marker without leaking credentials.

CI-provided secrets are resolver inputs, not committed config values. For GitHub Actions, the
workflow maps GitHub secrets into runner environment variables, and the Appaloft config references
them with `ci-env:<NAME>`. Other CI systems may provide equivalent environment variables without
changing the repository config contract.

## Current Implementation Notes And Migration Gaps

Current SSH `ssh-pglite` execution still relies on coarse backend locking for more than brief
state-root maintenance. The normative target after ADR-028 is shorter backend maintenance
coordination plus scope-based command coordination for explicit operations such as
`deployments.create`, `deployments.cleanup-preview`, and `source-links.relink`.

## GitHub Action Wrapper Install UX

The public GitHub Actions install surface is a thin wrapper around the released Appaloft CLI
binary. It is not a hosted control plane, not a GitHub App webhook listener, and not a new Appaloft
business command.

The wrapper is expected to live in `appaloft/deploy-action` so Marketplace metadata, wrapper
versioning, and install scripts can evolve independently from the main Appaloft repository. The
main repository remains the source of truth for CLI release assets, checksums, release manifest,
the static Docker self-host install script, and behavior specs.

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
- runtime/profile flags that mirror repository config fields: deployment strategy, install/build/
  start commands, publish directory, network profile, health path, non-secret env values, and
  `ci-env:` secret references;
- `ssh-host`, `ssh-user`, `ssh-port`, and either `ssh-private-key` or `ssh-private-key-file`;
- `server-proxy-kind` and `state-backend` as optional trusted entrypoint overrides;
- `args` as a last-resort pass-through for CLI flags not modeled as action inputs yet.

`ssh-private-key` is a secret value and must be written to a runner temp file before invocation.
Only the file path may be passed to `appaloft deploy --server-ssh-private-key-file`. The raw key
must never appear in command arguments, logs, release metadata, config-origin metadata, diagnostic
payloads, or read models.

The action's primary invocation is profile-driven. A repository config file is one profile source;
trusted action inputs, workflow environment, CLI flags, and future tool parameters are another
profile source over the same Quick Deploy bootstrap path. Flags must use the same canonical field
semantics as config and must win over selected config values. If no config file is supplied or
discovered, the action may still run `appaloft deploy` with enough trusted profile input or CLI
detection to satisfy the non-interactive Quick Deploy contract. Missing non-interactive context
must fail before mutation. If no config domain intent or preview route flag is supplied, no custom
server-applied domain route is created; the deployment may still use generated/default access
according to the selected server policy.

## GitHub Action PR Preview Mode

PR preview mode is a specialized action invocation of this same config workflow. It does not add a
new deployment command.

A repository owner must write a GitHub Actions workflow with `on.pull_request` before GitHub will
attempt previews. The action wrapper cannot deploy on PR open by itself. The recommended first
trigger set is:

```yaml
on:
  pull_request:
    types: [opened, reopened, synchronize]
```

The action may expose preview inputs such as:

| Input | Rule |
| --- | --- |
| `preview` | Accepted value `pull-request` selects PR preview identity behavior. |
| `preview-id` | Trusted preview scope such as `pr-${{ github.event.pull_request.number }}`. |
| `preview-domain-template` | Optional trusted host template such as `pr-${{ github.event.pull_request.number }}.preview.example.com`; requires user-owned wildcard DNS in Action-only mode. |
| `preview-tls-mode` | Optional TLS policy for the custom preview host. `auto` requires provider-owned certificate automation; `disabled` emits and verifies an HTTP preview URL. |
| `require-preview-url` | Optional boolean. When true, missing generated/custom access fails before or during route resolution instead of reporting a deploy without public URL. |

Preview profile selection is explicit. If the repository root `appaloft.yml` contains production
runtime choices, production environment values, or production custom domains, the workflow should
either pass a preview-specific path such as:

```yaml
with:
  config: appaloft.preview.yml
  preview: pull-request
  preview-id: pr-${{ github.event.pull_request.number }}
```

or omit config and pass the preview runtime/network/env/secret profile through trusted action
inputs or CLI flags. The action must not edit `appaloft.yml`, generate a temporary config file as
the primary contract, or infer that root config is preview-safe. When `config` is omitted, normal
config discovery may find the root file, but preview examples should describe that as an
intentional environment-neutral config, not the default for repositories whose root config is
production-oriented.

Preview identity comes from trusted GitHub event metadata and action inputs, not committed config.
The source fingerprint must include the PR scope so preview deploys do not reuse the normal branch
resource link. Repeated pushes to the same PR should update the same preview environment/resource
unless the operator explicitly changes preview scope or relinks state.

Preview examples must skip fork pull requests by default:

```yaml
if: github.event.pull_request.head.repo.full_name == github.repository
```

Repositories that deliberately enable fork previews must use reduced preview credentials and must
not expose production secrets or production deployment targets to untrusted code.

Access behavior:

- When no custom preview domain is configured, the workflow relies on generated/default access. A
  configured `sslip` provider can work without user DNS records when the selected server has a
  usable public IPv4 address and proxy ingress is reachable.
- Custom hostnames such as `pr-123.preview.example.com` require the user to configure wildcard DNS
  to the selected server. Appaloft stores and realizes only provider-neutral route intent in
  Action-only mode; it does not update DNS.
- Production `access.domains[]` from a root config must not be reinterpreted as PR preview domain
  intent. Preview route intent should come from generated/default access, trusted
  `preview-domain-template`, an explicitly selected preview config file, or a future selected
  preview overlay.
- A public preview URL requires reverse-proxy exposure and edge proxy readiness. The workflow must
  not publish direct host ports as a fallback.
- If no generated or custom route is available and `require-preview-url` is false, deployment may
  still succeed and the action output omits `preview-url` while diagnostics explain why access is
  unavailable.

PR close cleanup is a separate explicit workflow over `deployments.cleanup-preview`. A repository
that wants cleanup on `pull_request.closed` must add a close-event workflow that runs
`appaloft preview cleanup [path-or-source] --preview pull-request --preview-id pr-123` with the
same trusted SSH/state inputs used for preview deploy. Pure Action mode still has no scheduler or
retry loop after the process exits, so docs must not imply guaranteed cleanup if the close-event
workflow never runs or fails before completion.

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

Hosted/self-hosted and explicit PostgreSQL/PGlite state backends use the same application
`SourceLinkStore` contract. The durable PG slice must persist link state in a `source_links` table
owned by the selected Appaloft state backend, not in repository config and not in the `Resource`
aggregate.

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

The same rule applies to PR preview environments. A future preview overlay may adjust profile fields
for the already selected `preview-pr-123` environment, but it must not create the preview identity,
select a different durable environment, or retarget project/resource/server/destination state.

## Profile Mapping

Accepted config profile fields map to resource-owned or environment-owned contracts before
deployment admission.

| Config concern | Canonical owner | Rule |
| --- | --- | --- |
| Source root/base directory | `ResourceSourceBinding` | Normalize as source-root-relative path; reject `..`, URLs, shell metacharacters, and host absolute paths. |
| Git ref or commit pin | `ResourceSourceBinding` | May refine selected source identity; branch/tag ambiguity must be resolved before persistence. |
| Runtime strategy | `ResourceRuntimeProfile` | Use `RuntimePlanStrategy`, not `deploymentMethod`, after entry normalization. |
| `runtime.name` | `ResourceRuntimeProfile.runtimeName` | Optional provider-neutral runtime naming intent. It is validated as a safe normalized identifier and later rendered to effective Docker container or Compose project names with deployment/preview uniqueness. |
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
either dispatch explicit resource configuration operations accepted by the operation catalog as named
workflow steps, or fail with a structured profile-drift error before deployment admission. It must
not silently mutate resource state through `deployments.create`.

The drift comparison uses the same Resource Profile Drift Visibility vocabulary as `resources.show`:

| Drift section | Config concern examples | Required command when the workflow applies the change |
| --- | --- | --- |
| `source` | source kind, locator, Git ref, base directory, Docker image tag/digest | `resources.configure-source` |
| `runtime` | runtime strategy, install/build/start commands, runtime name, Dockerfile/Compose path, publish directory, build target | `resources.configure-runtime` |
| `network` | internal port, upstream protocol, exposure mode, target service, host port | `resources.configure-network` |
| `access` | generated access mode and generated route path prefix from trusted entry inputs when supported | `resources.configure-access` |
| `health` | HTTP health policy fields | `resources.configure-health` |
| `configuration` | resource-scoped variable override differences when repository config or trusted flags target resource scope | `resources.set-variable` or `resources.unset-variable` |

Default CLI config deploy behavior for existing-resource drift is fail-first: if the normalized
profile differs from the current Resource profile and the entrypoint is not explicitly applying the
matching command step, the workflow returns `resource_profile_drift`, phase
`resource-profile-resolution`, and does not dispatch `deployments.create`. The error details must
include safe `resourceId`, drift `section`, `fieldPath`, optional config pointer, and suggested
operation key or CLI command. Current Resource profile versus latest deployment snapshot drift is
informational and must not block a config deploy when the normalized profile already matches the
current Resource profile.

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

Server-applied route desired/applied state must be persisted through the selected Appaloft state
backend. For SSH remote PGlite this may cross the process boundary through the SSH mirror lifecycle,
but command execution still reads and writes the selected state backend. PostgreSQL/PGlite hosted,
self-hosted, embedded, and SSH-mirrored backends must store route state in the dedicated
`server_applied_route_states` table rather than in `Resource`, `DomainBinding`, `Certificate`, or
deployment command state. Existing rows referencing a resource are deletion blockers until an
explicit future cleanup or unlink behavior removes the route state.

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
| `infra_error` | `remote-state-resolution` | Conditional | SSH-targeted entrypoint could not resolve or initialize the remote Appaloft state backend; safe details should include target host/port, exit code, and remote stderr when available. |
| `infra_error` | `remote-state-lock` | Yes | Remote state mutation lock could not be acquired or was interrupted. |
| `infra_error` | `remote-state-migration` | Conditional | Remote state migration failed before workflow commands were dispatched. |
| `coordination_timeout` | `operation-coordination` | Yes | A dispatched command could not acquire its logical mutation scope within the bounded wait window. |
| `validation_error` | `source-link-resolution` | No | Source fingerprint is ambiguous, missing required stable identity, or points at another context without explicit relink. |
| `validation_error` | `config-domain-resolution` | No | Config domain intent cannot map safely to server-applied or managed domain workflow state, including invalid host/path/TLS shape, missing redirect target, self-redirect, redirect loop, redirect-to-redirect, or unsupported redirect policy. |
| `unsupported_config_field` | `config-capability-resolution` | No | Known future field such as CPU/memory/replicas or rollout policy is not enforceable by current workflow/resource/runtime target specs. |
| `resource_profile_drift` | `resource-profile-resolution` | No | Existing resource differs from the normalized config/entry profile and the workflow did not explicitly dispatch the required resource configuration command before deployment. Details include resource id, section, field path, config pointer when known, and suggested command. |
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
that PGlite directory back to the SSH server after the command shuts down. Shell startup now adopts
legacy file-backed `source-links/` and `server-applied-routes/` slices into durable PG/PGlite rows
before command dispatch and prunes superseded legacy files so later uploads cannot resurrect stale
resource ownership. A custom CLI runtime without that adapter fails with `validation_error`, phase
`remote-state-resolution`, rather than falling back to runner-local PGlite.

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

PG/PGlite source-link persistence is implemented through
[Source Link Durable Persistence Implementation Plan](../implementation/source-link-durable-persistence-plan.md).
The PG `resources.delete` blocker reader reports `source-link` blockers from durable PG state.

PG/PGlite server-applied route persistence is specified in
[Server-Applied Route Durable Persistence Plan](../implementation/server-applied-route-durable-persistence-plan.md)
and is implemented through the selected PostgreSQL/PGlite backend. `resources.delete` reports
`server-applied-route` blockers from durable route-state rows.

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

- Config-file changes to an existing resource must sequence the accepted candidate commands
  `resources.configure-source`, `resources.configure-runtime`, and `resources.configure-network`
  when those profile fields drift after first deploy.
- Which resource sizing fields should be admitted first for the single-server Docker/Compose
  backend, and how should unsupported target backends report capability mismatch?
