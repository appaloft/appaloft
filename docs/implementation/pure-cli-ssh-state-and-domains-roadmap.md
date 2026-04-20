# Pure CLI SSH State And Domains Roadmap

## Goal

Make CLI and GitHub Actions deployments useful without a hosted Appaloft service by defaulting
SSH-targeted deploys to durable Appaloft state on the user's SSH server, while allowing
`appaloft.yml` to declare custom domains that are applied through the target's edge proxy.

This roadmap is intentionally coarse. It records the gap between the ADR/spec target and the
current implementation so later Test-First and Code Rounds can slice the work safely.

## Target Modes

| Mode | Purpose | State owner | Domain behavior |
| --- | --- | --- | --- |
| `ssh-pglite` | Default pure CLI/GitHub Actions deploy to an SSH target. | PGlite persisted on the selected SSH server. | `access.domains[]` becomes server-applied proxy route state on that server. |
| `local-pglite` | Explicit local-only, dry-run, no-SSH, and hermetic smoke tests. | Local filesystem for the CLI process or configured local state dir. | No production domain route mutation unless explicitly paired with a target. |
| `postgres` / `control-plane` | Hosted or self-hosted Appaloft service. | PostgreSQL/control-plane service. | Config domain intent may map to managed `domain-bindings.create` and certificate workflows. |

## Product Shape

For a simple GitHub Actions user:

```text
repo appaloft.yml
  -> action passes SSH host/user/key through GitHub secrets
  -> appaloft binary resolves SSH target
  -> appaloft ensures remote SSH PGlite state
  -> appaloft creates/reuses project/environment/server/resource identity from remote state
  -> appaloft applies env/secrets from trusted runner env
  -> appaloft deploys
  -> appaloft applies access.domains[] through the target edge proxy
```

`DATABASE_URL` is not part of this path. `APPALOFT_PROJECT_ID` and similar ids are optional
selection overrides, not required setup.

## Implementation Slices

### Phase 1: Remote State Foundation

1. State backend selection
   - Add an explicit state backend resolver for `ssh-pglite`, `local-pglite`, and
     `postgres/control-plane`.
   - Make `ssh-pglite` the default when a CLI/Action deploy has an SSH target and no control plane.
   - Keep existing local PGlite behavior behind an explicit local-only/smoke-test mode.

2. Remote SSH state lifecycle
   - Ensure the remote Appaloft data root, schema-version marker, lock directory, backup directory,
     and permissions.
   - Acquire an exclusive remote mutation lock with owner metadata, correlation id, start time, and
     stale-lock diagnostics.
   - Run migrations before command dispatch, with a pre-migration backup or journal and an
     integrity check after migration.
   - Record state backend origin in diagnostics without leaking paths or credentials.
   - Add recovery behavior for interrupted migrations, abandoned locks, failed backups, and partial
     state transfer.

3. Source identity and first-run reuse
   - Persist source fingerprint link state to project/resource/environment/server state in remote
     PGlite.
   - Reuse prior identity on repeated CI deploys without requiring `APPALOFT_PROJECT_ID`.
   - Add an explicit relink command/workflow before calling the remote state product production
     ready; do not let committed config retarget identity.

### Phase 2: Server-Applied Domains

4. Config domain schema
   - Add `access.domains[]` with `host`, optional `pathPrefix`, and `tlsMode`.
   - Add canonical redirect aliases with `redirectTo` and optional `redirectStatus`, requiring the
     target host to be a served entry in the same route set.
   - Reject schemes, ports, raw cert/key material, DNS provider credentials, provider account ids,
     server/destination ids, credential selectors, self-redirects, redirect loops,
     redirect-to-redirect chains, and missing redirect targets.
   - Require reverse-proxy-compatible resource network state.

5. Server-applied route realization
   - Persist desired route state in remote PGlite.
   - Ask the edge proxy provider to render/apply route and TLS configuration.
   - Ask the edge proxy provider to render redirect-only configuration for alias hosts without
     attaching those hosts to workload upstreams.
   - Record applied, stale, failed, and verification status in remote state/read models.
   - Delegate renewal to the resident proxy/provider where supported.

### Phase 3: CLI/Action UX And Release

6. CLI/Action UX and docs
   - Publish a stable `appaloft/deploy-action` wrapper around the released binary.
   - Download platform archives, verify them against `checksums.txt`, and run the same
     `appaloft deploy` config workflow as direct CLI usage.
   - Document required GitHub Secrets and a minimal `appaloft.yml`.
   - Document no-config behavior, config-without-domain behavior, and the difference between
     application `ci-env:` secrets and Appaloft state backend selection.
   - Explain that pure CLI mode has no always-on Appaloft cloud scheduler.

### Phase 4: Control-Plane Adoption

7. Control-plane adoption
   - Export/import or sync remote PGlite identity and route state.
   - Map `access.domains[]` to managed `domain-bindings.create` and certificate workflows when the
     user selects hosted/self-hosted control-plane mode.
   - Add GitHub App/webhook preview environment behavior as a separate product line.
   - Follow [ADR-025](../decisions/ADR-025-control-plane-modes-and-action-execution.md): GitHub
     Actions may remain execution owner after Cloud/self-hosted adoption, but the Action must switch
     to API/control-plane mode rather than directly mutating the adopted SSH PGlite state unless an
     explicit break-glass path coordinates ownership.

## Required Gap Classification

| Gap | Required for pure CLI v1 | Required before server-applied domains | Required for hosted/cloud | Notes |
| --- | --- | --- | --- | --- |
| SSH state backend resolver | Yes | Yes | No | Resolver coverage, CLI decision wiring, and shell startup mirror selection exist. |
| Remote state ensure | Yes | Yes | No | Adapter coverage, SSH command construction, shell mirror coverage, and secret-gated nightly/release SSH e2e wiring exist. |
| Remote state lock | Yes | Yes | No | Lock acquisition is held across remote PGlite download, local command execution, upload, and release in shell CLI mode. |
| Remote state migrate | Yes | Yes | No | Migration command construction exists before identity resolution; external SSH execution is wired through the secret-gated e2e workflow. |
| Remote state recovery | Yes | Yes | No | Includes stale lock handling, failed migration restore/journal, and `doctor` diagnostics. |
| Source fingerprint link state | Yes | Yes | Useful | Required for repeat deployments without committed ids. SSH file-backed mirror exists; PG/PGlite durable adapter is specified in the source-link persistence plan. |
| Explicit relink command/workflow | Yes | Yes | Useful | Required operator escape hatch for mistaken or intentional retargeting. |
| `access.domains[]` parser | No for first remote-state slice; yes for CLI product value | Yes | Useful | Domain support can follow remote state foundation but is part of the CLI product thesis. |
| Canonical redirect route intent | No for first remote-state slice; yes for CLI product value | Yes for www/apex parity | Useful | Needed for common www/non-www canonical host behavior. Requires parser, remote state shape, provider rendering, proxy config/read-model visibility, and e2e redirect assertion. |
| Server-applied route desired/applied state | No for first remote-state slice; yes for domain support | Yes | Useful | File-backed SSH route state exists for CLI mode. PG/PGlite durable persistence for selected hosted/self-hosted, embedded, and SSH-mirrored state backends is specified in the server-applied route persistence plan. |
| Edge proxy route realization for config domains | No for first remote-state slice; yes for domain support | Yes | No | Desired routes now enter provider-neutral route input, deployment-finished status writeback, mixed path/TLS route groups, and provider-local TLS diagnostics. |
| GitHub Action wrapper docs | Yes before public release | Yes before public release | No | Binary can be used manually first, but public UX needs `appaloft/deploy-action`, version selection, checksum verification, SSH secret mapping, and examples. |
| Appaloft always-on DNS observer | No | No | Yes for managed domains | Pure CLI delegates observation to deploy/doctor and resident proxy/provider. |
| Appaloft certificate retry scheduler | No | No | Yes for managed certificates | Pure CLI may delegate renewal to Caddy/Traefik or equivalent provider-owned storage. |
| PR preview cleanup | No | No | Yes for GitHub App previews | Requires webhook listener/control plane or future server agent. |
| Team auth, audit, fleet visibility | No | No | Yes | Hosted/control-plane product line. |

## Current Implementation Gaps

- Current headless config deploy no longer silently falls back to local PGlite for SSH-targeted
  config deploys. The CLI resolves `ssh-pglite` by default for trusted SSH targets and uses a
  remote-state lifecycle hook before identity queries or mutations.
- Explicit `local-pglite` remains available for local-only/smoke-test bootstrap.
- Adapter-level primitives now cover remote durable root ensure, mutation lock, schema
  migration/backup/journal, recovery marker, lock diagnostics, source link create/reuse, retarget
  rejection, and relink store semantics.
- Shell-built CLI programs now wire an SSH transport-backed remote-state lifecycle adapter that
  executes ensure/lock/migrate/release commands against the trusted target and uses identity-file
  SSH credentials without embedding private key material in command arguments.
- Shell startup now mirrors SSH-server PGlite state, source links, and server-applied route desired
  state into a target-scoped local data directory before composition opens PGlite, points
  `APPALOFT_PGLITE_DATA_DIR` at that mirror, and uploads those state directories back to the SSH
  server after the command shuts down. Download uses a staged local extraction so a failed archive
  does not erase the previous mirror, and upload uses remote backup/restore/recovery command
  sequencing around remote extraction.
- Config deploy now reads source fingerprint link state before identity resolution and writes a
  first-run link after project/server/environment/resource identity is resolved.
- PostgreSQL/PGlite source-link persistence for hosted/self-hosted and embedded state backends is
  implemented through the `source_links` migration and PG `SourceLinkStore`; shell command
  execution uses that adapter while SSH remote PGlite sync still moves the selected state backend.
- PostgreSQL/PGlite server-applied route persistence for hosted/self-hosted, embedded, and
  SSH-mirrored state backends is specified in
  [Server-Applied Route Durable Persistence Plan](./server-applied-route-durable-persistence-plan.md)
  but not implemented yet. The next Code Round must add the route-state table, PG adapter, shell
  wiring, exact/default lookup, applied/failed status writeback, and `server-applied-route`
  deletion blocker closure.
- The public CLI `source-links.relink` command now dispatches the application command, validates
  target context against Appaloft state, and uses the same SSH remote-state mirror/lock path when a
  trusted SSH target is supplied.
- Current parser accepts provider-neutral `access.domains[]` with `host`, `pathPrefix`, `tlsMode`,
  optional `redirectTo`, and optional `redirectStatus`, and rejects domain identity selectors, raw
  TLS/secret material, unsafe host/path shapes, invalid redirect targets, self-redirects,
  redirect-to-redirect chains, and redirect loops. SSH CLI config deploy persists server-applied
  route desired state before ids-only deployment admission when route-state storage is wired, and
  fails at `config-domain-resolution` when the selected runtime/backend cannot persist or map the
  route intent.
- Canonical redirect aliases now flow through parser validation, remote-state persistence,
  deployment route grouping, runtime/provider route inputs, Traefik/Caddy provider rendering, and
  proxy configuration visibility. Remaining follow-up is an opt-in SSH e2e assertion for
  `www -> apex` or `apex -> www`, plus public HTTPS validation of resident-provider TLS behavior.
- An opt-in external SSH e2e harness now covers two isolated GitHub Actions style CLI processes
  using different runner-local PGlite directories against the same SSH-server `ssh-pglite` state.
  `.github/workflows/ssh-remote-state-e2e.yml` runs it manually, from nightly smoke, and before
  release artifact publication when the SSH target secrets are configured. Repository code cannot
  provision the external SSH/Docker target or its GitHub secrets; that remains operational setup.
- Deployment planning now reads server-applied config domain desired state from SSH-server state
  and passes each `pathPrefix`/`tlsMode` route group into provider-neutral edge proxy route input
  without creating managed `DomainBinding` or `Certificate` aggregates. The SSH route state store
  reads exact destination-scoped route state first and falls back to the default-destination key used
  by first-run config bootstrap when no explicit destination id was selected yet.
- Deployment-finished handling now records server-applied route `applied` status for successful
  deployments and `failed` status for route realization, proxy reload, and public route
  verification failures.
- Resource access, health, and diagnostic summaries now expose the latest server-applied route URL
  and route status separately from generated access routes and managed durable domain bindings.
- Provider-local TLS diagnostics for pure CLI `tlsMode = auto` routes are exposed through proxy
  configuration and resource diagnostic summaries without creating managed `Certificate` state.
- Public GitHub Action wrapper install UX is not implemented yet. The main repository release
  workflow publishes CLI archives, the static Docker self-host installer, `checksums.txt`,
  `release-manifest.json`, and release notes; a separate `appaloft/deploy-action` repository still
  needs action metadata, SSH secret to temp-key handling, wrapper tests, and public README
  examples.
- Pure CLI mode has no always-on DNS observer, Appaloft certificate scheduler, or automatic cleanup
  loop after the process exits.
- Hosted/cloud adoption, GitHub App webhook previews, team auth, audit, and fleet visibility are
  future control-plane work, not blockers for the pure CLI remote-state foundation.

## Test Matrix Anchors

The next Test-First Round should start from:

- `CONFIG-FILE-STATE-001` through `CONFIG-FILE-STATE-013`
- `CONFIG-FILE-DOMAIN-001` through `CONFIG-FILE-DOMAIN-009`
- `SOURCE-LINK-STATE-001` through `SOURCE-LINK-STATE-014`
- `CONFIG-FILE-ENTRY-008`
- `QUICK-DEPLOY-WF-052` through `QUICK-DEPLOY-WF-055`
- `ROUTE-TLS-BOUNDARY-005` through `ROUTE-TLS-BOUNDARY-006`
- `EDGE-PROXY-ROUTE-005` through `EDGE-PROXY-ROUTE-008`
- `EDGE-PROXY-QRY-007`
- `SERVER-APPLIED-ROUTE-STATE-001` through `SERVER-APPLIED-ROUTE-STATE-005`
- `CONFIG-FILE-ENTRY-009` through `CONFIG-FILE-ENTRY-013`
- `QUICK-DEPLOY-ENTRY-011`
