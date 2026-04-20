# Deployment Config File Implementation Plan

## Goal

Align repository deployment config file support with
[Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md) and
[Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md).

The target behavior is a local or headless Quick Deploy entry workflow that reads a source-adjacent
config profile, rejects unsafe identity/secret/unsupported fields, defaults SSH-targeted CLI/Action
runs to SSH-server PGlite state, applies profile values through explicit operations, applies
provider-neutral `access.domains[]` as server-applied proxy routes in pure CLI mode, and dispatches
ids-only `deployments.create`. The public GitHub Actions install UX is a thin deploy-action wrapper
that downloads and verifies the released binary before invoking this same CLI workflow.

## Scope

Implement in ordered slices:

1. Config schema reset
   - Remove or gate committed `project`, `resource` identity, `targets`, `servers`, raw managed
     domain/TLS identity, raw credential, and raw secret fields from the repository config schema.
   - Keep profile fields that can map to `ResourceSourceBinding`, `ResourceRuntimeProfile`,
     `ResourceNetworkProfile`, health policy, non-secret environment variables, and required secret
     references.
   - Add provider-neutral `access.domains[]` for host/path/TLS route intent while rejecting raw
     certificate material, provider account ids, DNS credentials, server ids, destination ids, and
     credential selectors.
   - Add provider-neutral canonical redirect fields on domain entries (`redirectTo` and optional
     `redirectStatus`) while rejecting self-redirects, redirect loops, redirect-to-redirect chains,
     missing targets, and cross-context redirect targets.
   - Add non-secret `controlPlane.mode` and optional `controlPlane.url` after ADR-025. Reject
     project/resource/server/destination/credential/org/tenant identity, tokens, database URLs, SSH
     keys, and raw credential material under `controlPlane`.
   - Keep schema strict so unsupported CPU/memory/replica/restart/rollout fields fail until their
     own ADR/spec/runtime enforcement exists.

2. Discovery and parser
   - Resolve explicit config path first.
   - Discover from Git root for Git sources and selected root for non-Git folders.
   - Add YAML parsing for the supported target names.
   - Reject ambiguous multiple config files in one root.

3. Identity resolver
   - For SSH-targeted CLI/Action deployments, resolve `ssh-pglite` as the default state backend,
     ensure the remote state root, acquire a remote mutation lock, run migrations, and use remote
     state as the source of truth before resolving identity.
   - Include remote state recovery behavior: stale lock diagnostics, migration backup/journal,
     integrity check, and safe failure before command dispatch.
   - Keep explicit `local-pglite` available only for local-only, dry-run, smoke-test, or no-SSH
     modes.
   - Resolve project/resource/server/destination/credential identity from explicit entrypoint ids,
     trusted Appaloft link/source state, safe source fingerprint, first-run auto-creation, or
     interactive prompt.
   - Do not select identity from committed repository config content.
   - Persist source fingerprint link state for first-run SSH deploys and require explicit
     `source-links.relink` for intentional retargeting before treating pure CLI as production
     ready.

4. Profile mapper
   - Map config source/runtime/network/health profile fields into `resources.create` for first
     deploy.
   - When `resources.configure-source`, `resources.configure-runtime`, and
     `resources.configure-network` are active, sequence the relevant commands before deployment for
     existing resources.
   - Until those profile configuration commands are active, detect profile drift and fail before
     `deployments.create`.

5. Secret handling
   - Reject raw secret material before mutation.
   - Allow only required secret declarations and references to stored Appaloft/external secrets or
     reusable SSH credentials.
   - Resolve `ci-env:<NAME>` references from the trusted CI runner environment for headless binary
     entrypoints, apply them as secret runtime environment variables, and fail required missing or
     unsupported references before mutation.
   - Apply plain `env` declarations as non-secret `plain-config` environment variables at
     environment scope before `deployments.create`; `PUBLIC_` and `VITE_` keys are build-time,
     other keys are runtime.
   - Ensure errors, logs, diagnostics, and progress events never include raw values.

6. Entrypoints
   - Add CLI `appaloft deploy --config <path>` and implicit source-root discovery.
   - Keep HTTP `POST /api/deployments` strict and ids-only.
   - Keep `/api/schemas/appaloft-config.json` aligned with the parser schema.
   - Rebuild `appaloft init` so generated config contains profile fields only and does not write
     project/server/resource identity.
   - Treat GitHub Actions and other binary-only CI usage as non-interactive Quick Deploy executors:
     default to SSH-server `ssh-pglite` when an SSH target is selected, require no `DATABASE_URL`
     for that mode, resolve `ci-env:` through runner environment variables, and use the same
     explicit operation sequence as interactive Quick Deploy.
   - Resolve `controlPlane.mode` before state backend and identity resolution. Keep pure SSH
     `none` as the default, let trusted CLI/action/env inputs override config, and fail before
     mutation when Cloud/self-hosted is selected before the compatibility handshake exists.

7. GitHub Action wrapper
   - Create a separate `appaloft/deploy-action` repository for action metadata, install scripts,
     wrapper tests, and Marketplace-facing README.
   - Download platform CLI archives, `checksums.txt`, and optional `release-manifest.json` from
     the main Appaloft release.
   - Verify SHA-256 before extraction, install into a runner temp/tool directory, and add the CLI
     to `PATH` only for the job.
   - Map trusted inputs to CLI flags: `config`, `source`, `ssh-host`, `ssh-user`, `ssh-port`,
     `ssh-private-key` or `ssh-private-key-file`, `server-proxy-kind`, and `state-backend`.
   - Write `ssh-private-key` to a temporary `0600` file and pass only the file path to
     `--server-ssh-private-key-file`.
   - Treat `version: latest` as quickstart convenience and exact release tags as the recommended
     production path.
   - Keep action wrapper releases independent from CLI releases; new CLI versions should be
     consumable through the `version` input without action-repo code changes.

8. Server-applied domains
   - Parse and validate `access.domains[]`.
   - Persist provider-neutral route desired state in SSH-server Appaloft state for pure CLI mode.
   - Persist route desired/applied state through the selected PostgreSQL/PGlite state backend when
     command execution uses hosted/self-hosted, embedded, or SSH-mirrored state.
   - Realize route state through the edge proxy provider and runtime adapter, including provider
     owned TLS automation when `tlsMode = auto`.
   - Render canonical redirect aliases through the selected edge proxy provider so alias hosts
     redirect to served target hosts without proxying the alias host to the workload.
   - Keep managed `DomainBinding` creation out of pure CLI mode; map the same intent to managed
     domain commands only when a hosted/self-hosted control plane is selected.

9. Tests
   - Implement executable tests named with the matrix ids in
     [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md).
   - Add CLI e2e/contract coverage for explicit and implicit config.
   - Add HTTP contract coverage proving deployment admission rejects config-file fields.
   - Add parser/schema tests for discovery, YAML, ambiguity, identity rejection, secret rejection,
     and unsupported sizing rejection.
   - Add deploy-action wrapper tests for version resolution, checksum verification, SSH secret to
     temp-key mapping, command construction, no-config behavior, and config-without-domain behavior.

## Out Of Scope Until Separate Specs Exist

- CPU/memory/replica/restart/rollout enforcement.
- Kubernetes, Swarm, Helm, namespace, manifest, ingress class, pull-secret, or node selector config
  fields.
- Managed `DomainBinding` lifecycle from pure CLI mode. Server-applied config domains are
  target-local proxy routes; cloud/self-hosted control-plane adoption is a later slice.
- Cloud-assisted Action, self-hosted API mode, SSH PGlite adoption, and control-plane-owned
  execution are governed by
  [Control-Plane Modes Roadmap](./control-plane-modes-roadmap.md).
- Always-on DNS observation, Appaloft-owned certificate renewal scheduling, and automatic preview
  cleanup without a server agent or hosted/self-hosted control plane.
- A hidden backend convenience endpoint that reads repository config and performs multiple writes.

## Current Implementation Notes And Migration Gaps

Implemented slices:

- `@appaloft/deployment-config` now owns a strict profile-only schema for JSON/YAML config files.
  It accepts source/runtime/network/health profile fields, non-secret `env` values, and secret
  references, while rejecting committed identity selectors, raw secret material, unknown fields, and
  unsupported CPU/memory/replica/restart/rollout fields.
- `controlPlane.mode` and `controlPlane.url` are not implemented in the parser yet. Current
  control-plane behavior is limited to environment/backend hints in the CLI state resolver.
- `FileSystemDeploymentConfigReader` supports explicit config paths, Git-root discovery for nested
  local sources, YAML parsing, ambiguous-file rejection, and profile snapshot mapping.
- CLI `appaloft init` writes a profile-only config and no longer writes project/resource/server
  identity or target bootstrap data.
- CLI `appaloft deploy --config <path>` and implicit source-root discovery read the same config
  parser, map profile fields into the quick-deploy resource draft, let explicit flags override the
  file, and still dispatch ids-only `deployments.create`.
- CLI config deploy maps non-secret `env` values to `plain-config` environment variables
  (`PUBLIC_`/`VITE_` as build-time, other keys as runtime) and resolves required
  `ci-env:<NAME>` references from the process environment into runtime secret variables before
  deployment admission.
- CLI config deploy supports non-TTY GitHub Actions style bootstrap. SSH-targeted runs default to
  remote `ssh-pglite`; explicit `local-pglite` remains available for local-only, dry-run, no-SSH,
  and smoke-test modes.
- `/api/schemas/appaloft-config.json` is regenerated from the current parser schema, while
  `POST /api/deployments` remains strict ids-only.
- Repository config deploy is aligned as the current non-interactive Quick Deploy profile path for
  GitHub Actions style binary invocations.

Remaining gaps:

- Existing-resource profile drift detection and explicit `resources.configure-source`,
  `resources.configure-runtime`, and `resources.configure-network` command sequencing are not
  implemented yet.
- Config-file `access.domains[]` parser support is implemented for provider-neutral `host`,
  `pathPrefix`, `tlsMode`, optional `redirectTo`, and optional `redirectStatus` intent. SSH CLI
  config deploy persists server-applied route desired state before ids-only deployment admission
  when route-state storage is wired. Deployment planning consumes that desired state as serve and
  redirect route groups, and deployment-finished handling records applied/failed status for route
  realization outcomes. Resource access, health, and diagnostic summaries expose the latest
  server-applied route URL/status. Provider-local TLS diagnostics for `tlsMode = auto` routes are
  visible through proxy configuration and resource diagnostics. Control-plane managed domain mapping
  is not implemented yet.
- PG/PGlite durable server-applied route persistence is specified in
  [Server-Applied Route Durable Persistence Plan](./server-applied-route-durable-persistence-plan.md)
  and implemented through the selected PostgreSQL/PGlite state backend. File-backed route-state
  storage remains available for adapter-level mechanics and explicit legacy wiring; shell command
  execution uses the PG/PGlite route-state store and `resources.delete` detects
  `server-applied-route` blockers from durable rows.
- Config-file Dockerfile/Compose path selectors are rejected until resource profile fields and
  runtime planner mapping own those paths explicitly.
- Stored Appaloft/external secret adapters beyond the headless `ci-env:` resolver are not wired into
  the config-file entry workflow yet.
- Public GitHub Action wrapper install UX is not implemented yet. The main repository publishes
  CLI release archives, the static Docker self-host installer, checksums, release manifest, and release notes,
  but `appaloft/deploy-action` still needs its own repository, action metadata, README examples,
  and wrapper-level tests.
- CLI config deploy now resolves state backend selection, defaults trusted SSH-targeted config
  deploys to `ssh-pglite`, invokes a remote-state lifecycle hook before identity queries/mutations,
  and uses SSH remote-state lifecycle and mirror sync in shell-built CLI programs.
- Adapter-level remote-state primitives cover durable root ensure, lock, migration, recovery marker,
  source link storage, server-applied route desired-state storage, retarget rejection, and relink
  store semantics. Config deploy can create and reuse source links, persist SSH server-applied route
  desired state, and `source-links.relink` is active as a CLI/application command.
- `DeploymentContextBootstrapService` still contains legacy config/default bootstrap helpers, but
  active `deployments.create` remains ids-only.
- Current coverage is targeted parser/filesystem/CLI/application coverage; deploy-action wrapper
  coverage, broader CLI e2e, HTTP-schema contract, link-state, drift, and stored/external secret
  adapter coverage remains follow-up.
