# ADR-024: Pure CLI SSH State And Server-Applied Domains

Status: Accepted

Date: 2026-04-18

## Context

Appaloft supports CLI, HTTP/API, Web, and future MCP entrypoints. Repository deployment config files
and GitHub Actions binary invocations are non-interactive Quick Deploy entry workflows, not a
separate deployment command.

The first headless GitHub Actions implementation treated embedded PGlite as runner-local state for
a single binary invocation. That makes the deploy command easy to run, but it makes repeated CLI or
Action deployments effectively stateless unless the user provides explicit Appaloft ids or a
separate database/control plane.

Pure CLI and GitHub Actions also need practical custom domain support. If a user can deploy to an
SSH server but cannot persist Appaloft route state or apply domain routes from `appaloft.yml`, the
CLI-only product has limited value. At the same time, durable domain ownership, public DNS
observation, certificate lifecycle, and renewal scheduling remain richer control-plane concerns
governed by the routing/domain/TLS ADRs.

## Decision

For pure CLI and GitHub Actions deployments that target an SSH server, the default Appaloft state
backend is SSH-server persisted PGlite.

Runner-local embedded PGlite is no longer the default for SSH-targeted deploys. It is allowed only
for explicit local-only, dry-run, smoke-test, or no-SSH modes.

The remote SSH PGlite state stores Appaloft metadata and workflow state such as projects,
environments, resources, deployment targets, destinations, deployments, environment configuration,
source link state, and server-applied proxy route desired/applied state. It does not store user
application data.

`DATABASE_URL` is not required for pure CLI or GitHub Actions deployments that use the SSH PGlite
backend. `DATABASE_URL` or an equivalent control-plane endpoint is required only when the caller
selects PostgreSQL or a hosted/self-hosted Appaloft control plane.

Repository config may declare provider-neutral server-applied domain intent for SSH CLI mode. The
same user intent is separate from durable managed `DomainBinding` lifecycle state:

- in SSH PGlite mode, config domain intent is applied to the selected SSH server's edge proxy as
  server-applied route desired/applied state;
- in hosted or self-hosted control-plane mode, the same intent may be mapped to managed
  `domain-bindings.create`, DNS observation, certificate, and read-model workflows;
- in all modes, domain/proxy/path/TLS fields must not be added to `deployments.create`.

The config file must not choose Appaloft project, resource, server, destination, credential,
organization, certificate provider account, or secret identity. Those identities still come from
trusted entrypoint flags, trusted link/source state, server-local state, control-plane state, or
interactive selection.

## State Backend Contract

Pure CLI and GitHub Actions support these state backend modes:

| Mode | Default when | Source of truth | `DATABASE_URL` |
| --- | --- | --- | --- |
| `ssh-pglite` | A deploy targets an SSH server and no control plane is selected. | PGlite files under the configured Appaloft data root on the SSH server. | Not required. |
| `local-pglite` | Explicit local-only, dry-run, smoke-test, or no-SSH mode is selected. | Local filesystem for that CLI process or configured local state dir. | Not required. |
| `postgres` / `control-plane` | A hosted/self-hosted Appaloft service or PostgreSQL database is selected. | The selected service/database. | Required unless the control-plane endpoint abstracts it. |

An SSH-targeted entry workflow must resolve and open the remote state backend before it resolves or
creates project/environment/server/resource identity. The backend must provide:

- remote state ensure: create or verify the Appaloft data root, permissions, schema-version marker,
  lock location, backup location, and diagnostics metadata before any business command runs;
- state-root coordination for remote ensure, schema migration, mirror/sync, and other backend
  maintenance, with owner metadata, correlation id, start time, heartbeat/last-seen metadata,
  stale-lock detection, owner-aware release, and safe operator-visible recovery;
- command-level mutation coordination remains a separate concern governed by
  [ADR-028: Command Coordination Scope And Mutation Admission](./ADR-028-command-coordination-scope-and-mutation-admission.md);
- schema migration before command dispatch, including a pre-migration backup or journal and a
  post-migration integrity check;
- crash-safe persistence and safe migration backups, journals, or equivalent recovery behavior;
- stable source identity matching so a repository can be deployed repeatedly without requiring
  `APPALOFT_PROJECT_ID` or `APPALOFT_RESOURCE_ID`;
- explicit source relink behavior so an operator can intentionally move a source fingerprint to a
  different project/resource/server context without editing committed config;
- safe export/import or sync points so a future control plane can adopt the server-local state.

The implementation may satisfy the remote state contract by running a remote helper on the SSH
server, by transactional pull/mutate/push under a remote maintenance lease, or by another adapter
strategy that keeps the SSH server as the durable source of truth. The contract is the storage and
state-root coordination semantics, not a specific file path or helper shape.

## Source Link Contract

Pure CLI mode must persist source fingerprint link state in the selected Appaloft state backend.
This is required for repeatable CI and is not optional production polish.

The source fingerprint is a normalized, secret-free identity for the selected source. For Git
sources it should include provider/repository identity when available, normalized clone locator,
source base directory, and config file identity. It should not include transient runner paths or
secret-bearing clone URLs. A regular branch deployment should not include every commit SHA in the
matching key, because new commits of the same app should reuse the same resource. Future preview
environment keys may include PR or branch identity explicitly.

The link record maps that fingerprint and selected environment/source scope to trusted Appaloft
identity:

- project id;
- environment id or environment key;
- resource id;
- server id and destination id when the entrypoint owns default target selection;
- last observed source metadata for diagnostics;
- config origin metadata with no secret values.

First deploy may create this link from source-derived defaults and trusted entrypoint target
selection. Later deploys reuse the link. A committed config change must not retarget the link.

Moving a source fingerprint to another project/resource/server context requires an explicit relink
operation. Relink must be idempotent when the requested target already matches the current link,
must reject ambiguous source fingerprints, and must not mutate resource source/runtime/network
profile fields or deployment history as a side effect.

## Server-Applied Domain Contract

Repository config domain intent is provider-neutral and must normalize to route intent similar to:

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

The exact parser schema belongs to the deployment-config package, but accepted fields must stay in
this boundary:

- `host` is a domain name without scheme, port, or path;
- `pathPrefix` defaults to `/` when omitted;
- `tlsMode` is provider-neutral, initially `auto` or `disabled`;
- `redirectTo`, when present, is a domain name in the same resolved route set and means this host is
  an alias that redirects to the target host instead of proxying to the workload;
- `redirectStatus`, when present, must be one of `301`, `302`, `307`, or `308`, and defaults to
  `308` for canonical host redirects;
- redirect entries must not point to themselves, to another redirect entry, to a host outside the
  same trusted project/environment/resource/server/destination route context, or form loops;
- raw certificate material, private keys, provider account ids, DNS provider credentials, server
  ids, destination ids, and credential selectors are rejected.

In SSH PGlite mode, this intent drives server-applied proxy configuration:

```text
repository config access.domains[]
  -> trusted project/resource/server/destination context
  -> remote SSH PGlite route desired state
  -> edge proxy provider renders route/certificate plan
  -> runtime adapter applies provider-owned config on the SSH server
  -> remote state records applied route and verification status
  -> resource access/proxy read models expose the current server-applied route
```

This does not create a managed `DomainBinding` aggregate. It is a server-local route desired/applied
state owned by the selected SSH target and edge proxy provider. TLS renewal in pure CLI mode is
delegated to the resident edge proxy/provider when possible, for example Caddy or Traefik with
provider-owned ACME storage. One-shot CLI deploys observe and repair on deploy, verify, or doctor;
they must not pretend to run a hidden always-on Appaloft scheduler after the process exits.

Canonical redirect support is part of the same server-applied route state, not a separate
deployment command. The target host still needs a normal served route entry so the workload remains
reachable. Redirect source hosts still require DNS to point at the selected edge address, and
HTTPS redirects require the resident provider to obtain or serve valid certificate coverage for the
redirect source host before a browser can follow the redirect without a certificate warning. The
provider owns the concrete redirect implementation, such as Traefik redirect middleware or Caddy
`redir` rules; application, CLI, Web, and HTTP code must only carry provider-neutral redirect
intent.

When first-run config bootstrap has resolved the project, environment, resource, and server but the
entrypoint has not selected an explicit destination id, the SSH state backend may persist route
desired state at the server/resource default-destination scope. Deployment planning must first read
an exact destination-scoped route state and then fall back to that default-destination state for the
same project/environment/resource/server. An exact destination-scoped route state takes precedence
over the default-destination state.

In hosted or self-hosted control-plane mode, the same config intent may be mapped to managed
`domain-bindings.create` and certificate workflows after the trusted resource/server/destination
context exists. That mapping is the migration path from pure CLI to cloud.

## Consequences

- `APPALOFT_PROJECT_ID`, `APPALOFT_RESOURCE_ID`, and similar ids are optional selection overrides,
  not required inputs for pure CLI deploys to an SSH server.
- GitHub Actions examples should pass SSH connection and credential material through GitHub Secrets
  into trusted environment variables/action inputs, then let Appaloft persist identity and route
  state on the SSH server.
- Repository config can make a repeated GitHub Actions deployment stable without a hosted service.
- Pure CLI mode has limited background behavior: no always-on Appaloft DNS observer, no Appaloft
  certificate retry scheduler, and no cleanup retry loop or scheduler after the process exits.
  Action/CLI preview cleanup may still run through the explicit `deployments.cleanup-preview`
  command from a user-authored close-event workflow.
- Hosted/cloud mode remains valuable for GitHub App webhooks, preview environment orchestration,
  continuous DNS/certificate lifecycle, fleet visibility, team auth, audit, cleanup, and managed
  integrations.

## Required Spec Updates

This decision governs:

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [source-links.relink Command Spec](../commands/source-links.relink.md)
- [Quick Deploy Workflow](../workflows/quick-deploy.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Edge Proxy Provider And Route Realization](../workflows/edge-proxy-provider-and-route-realization.md)
- [Routing, Domain Binding, And TLS Workflow](../workflows/routing-domain-and-tls.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Source Link State Test Matrix](../testing/source-link-state-test-matrix.md)
- [Quick Deploy Test Matrix](../testing/quick-deploy-test-matrix.md)
- [Routing, Domain Binding, And TLS Test Matrix](../testing/routing-domain-and-tls-test-matrix.md)
- [Edge Proxy Provider And Route Configuration Test Matrix](../testing/edge-proxy-provider-and-route-configuration-test-matrix.md)

## Migration Notes

Current implementation still has parser and CLI paths that treat headless PGlite as local process
state and reject config domain/TLS fields. Those are implementation gaps after this ADR.

The first implementation slice should make `ssh-pglite` the default for SSH-targeted CLI/Action
deploys, while preserving explicit `local-pglite` for hermetic smoke tests.

The second implementation slice should accept `access.domains[]` for SSH CLI mode and route it
through edge proxy provider realization without creating managed `DomainBinding` records.

The hosted/cloud control-plane migration can follow later by importing/syncing remote PGlite state
and mapping the same config domain intent to managed domain binding and certificate workflows.
