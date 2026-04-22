# ADR-025: Control-Plane Modes And Action Execution

Status: Accepted

Date: 2026-04-19

## Context

Appaloft now supports a useful pure CLI and GitHub Actions deployment path to an SSH server. That
path is governed by ADR-024: the SSH server owns Appaloft state through `ssh-pglite`, the CI runner
is ephemeral, and repository config can express server-applied domain intent without a hosted
service.

The product also needs a path to hosted Appaloft Cloud and self-hosted Appaloft control planes.
Those control planes add durable project/team state, managed domain and certificate workflows,
preview environment orchestration, audit, fleet visibility, GitHub App webhooks, and UI operation
surfaces.

These needs must not collapse into one product shape. A GitHub Action can remain the execution
mechanism even when Cloud or a self-hosted control plane owns state. Conversely, a control plane can
eventually execute deployments itself through a GitHub App, webhook runner, or server agent. The
system needs a stable distinction between:

- who starts and runs deployment execution; and
- who owns Appaloft state, locks, identity, policy, and control-plane workflows.

## Decision

Appaloft models deployment execution owner and control-plane/state owner as separate dimensions.

Execution owner may be:

- `github-action`: GitHub Actions installs or runs the Appaloft CLI and performs the deploy steps.
- `cli`: a human or automation invokes the Appaloft CLI locally.
- `control-plane-runner`: Appaloft Cloud or a self-hosted Appaloft server owns scheduling and
  execution through a runner, webhook, or server agent.
- `local-web-agent`: a local or desktop workflow executes CLI-equivalent steps for a Web surface.
- `future-mcp-tool`: an MCP/tool caller drives the same entry workflow through application
  commands.

Control-plane/state owner may be:

- `none`: no hosted or self-hosted control plane is selected. SSH-targeted deploys use the target
  server's `ssh-pglite` state by default. This is the long-term pure CLI/GitHub Actions product
  line, not a temporary fallback.
- `cloud`: Appaloft Cloud owns project, environment, resource, domain, audit, lock, policy, and
  workflow state. The execution owner may still be GitHub Actions.
- `self-hosted`: a user-operated Appaloft server owns state and exposes the same API/control-plane
  contract. Standard production self-hosting uses PostgreSQL.
- `external-postgres`: an advanced state backend where the caller points Appaloft at PostgreSQL
  without a full control-plane API. This is not the default user-facing Cloud/self-host product.

The default for repository config deploys remains `none` unless a trusted control-plane selection is
explicitly supplied. Appaloft must not silently connect to Cloud or move state into a control plane
because a new CLI release or action wrapper is used.

Repository config may select control-plane connection policy, but it must not select durable
Appaloft identity:

```yaml
controlPlane:
  mode: none
```

Allowed mode values are:

| Mode | Meaning |
| --- | --- |
| `none` | Do not use Appaloft Cloud or a self-hosted control plane. SSH deploys use `ssh-pglite` unless an explicit local-only backend is selected. |
| `auto` | Use a trusted control plane only when the entrypoint supplies a trusted URL/token or the SSH server exposes a compatible adoption marker; otherwise fall back to `none`. The chosen mode must be reported in diagnostics. |
| `cloud` | Use Appaloft Cloud as state/control-plane owner. Requires trusted authentication from environment, action input, local login, OIDC, or another accepted credential source. |
| `self-hosted` | Use a user-operated Appaloft control plane. Requires a trusted URL and authentication or an explicitly anonymous self-host policy. |

`controlPlane.url` may be present for `self-hosted` or future private Cloud endpoints because it is
connection metadata, not project identity. Raw tokens, SSH keys, database URLs, project ids,
resource ids, server ids, credential ids, and secret values remain rejected from committed
repository config.

Control-plane identity selection comes from trusted sources outside committed config:

- the authenticated Cloud/self-hosted token or OIDC claims;
- GitHub App installation, repository id, repository full name, branch, pull request, and source
  fingerprint;
- existing source link state in the selected control plane;
- explicit trusted entrypoint overrides such as action inputs, CLI flags, local login state, or
  future MCP tool parameters;
- explicit `source-links.relink` or a future control-plane source-link command.

Changing `appaloft.yml` must not be sufficient to move a deployment to another Appaloft project,
resource, server, destination, credential, tenant, or organization.

## Control-Plane Mode Contract

### `none`

`none` is the zero-resident control-plane mode.

For SSH targets:

```text
GitHub Action or CLI
  -> trusted SSH target and credential from action inputs/CLI/env
  -> ensure, state-root coordinate, migrate, and sync SSH-server `ssh-pglite`
  -> resolve source link and identity from SSH-server state
  -> dispatch explicit Appaloft operations locally
  -> execute deployment over SSH
  -> persist deployment/source/route state back to the SSH server
```

No `DATABASE_URL`, `APPALOFT_PROJECT_ID`, Cloud token, or resident Appaloft server is required.

Limitations are explicit:

- no always-on Appaloft DNS observer;
- no Appaloft-owned certificate retry scheduler after the process exits;
- no team auth, central audit, or fleet visibility;
- no preview cleanup retry/scheduler unless another runner or control plane is configured;
- route and TLS repair happens on deploy, verify, doctor, or another explicit CLI/Action run.

Pure Action/CLI may still run explicit preview cleanup from a user-authored close-event workflow
through `deployments.cleanup-preview`.

### `cloud`

`cloud` makes Appaloft Cloud the state/control-plane owner. It does not require Cloud to execute the
deployment in the first product phase.

The first Cloud phase is Cloud-assisted Action:

```text
GitHub Action
  -> install verified Appaloft CLI
  -> authenticate to Appaloft Cloud with trusted token/OIDC
  -> Cloud resolves project/resource/environment/server identity and policy
  -> Action performs deployment using credentials supplied by GitHub Secrets or Cloud policy
  -> Action reports attempt, logs, route status, and diagnostics back to Cloud
```

Credential custody is selectable:

- Action-custodied credentials: SSH key and application secrets remain in GitHub Secrets; Cloud
  stores state, policy, audit, and summaries.
- Control-plane-custodied credentials: Cloud stores or brokers credentials under an accepted secret
  management contract; the Action receives only scoped temporary execution material or calls a
  Cloud-runner API.

The second Cloud phase may add GitHub App/webhook execution. In that phase Cloud may be both state
owner and execution owner. That is a separate implementation milestone and must not be required for
Cloud-assisted Action.

### `self-hosted`

`self-hosted` makes a user-operated Appaloft server the state/control-plane owner.

The recommended production self-hosted stack is:

- Appaloft API/backend plus static Web console;
- PostgreSQL as the standard state backend;
- edge proxy integration for the control-plane app itself and managed resources;
- optional worker/queue/scheduler components when async lifecycle, preview cleanup, DNS
  observation, and certificate retries require them.

Embedded PGlite may be used for portable single-process or development self-hosted installs. It
must not be the default for multi-process production self-hosted control planes.

When a self-hosted control plane adopts a server that already has SSH-server PGlite state, direct
Action mutation of that PGlite state must stop after adoption. GitHub Actions should switch to
control-plane API mode, or the control plane must coordinate exclusive access. A long-running
Appaloft server and an Action process must not both open and replace the same PGlite state
directory independently.

### `external-postgres`

`external-postgres` is an advanced backend selection, not the primary product story.

It may be useful for internal automation, migration, or power users, but it bypasses parts of the
control-plane API surface if used directly from an Action. It must therefore preserve the same
application command, lock, migration, version, audit, and error semantics before it can be
recommended publicly.

## Selection Precedence

Control-plane selection uses this precedence:

```text
built-in default `none`
  < repository config `controlPlane.mode` and non-secret URL metadata
  < environment variables such as APPALOFT_CONTROL_PLANE_MODE and APPALOFT_CONTROL_PLANE_URL
  < CLI flags / GitHub Action inputs / local login state / future MCP tool parameters
  < explicit trusted operation input for a future backend workflow API
```

Secret values always come from trusted entrypoint secret stores or local login state, not committed
config.

If `mode = auto`, the resolver may use a trusted endpoint supplied by the entrypoint, a local login
profile, or a server adoption marker. It must not scan arbitrary networks, contact Appaloft Cloud
without a configured trust source, or upload SSH/server state without an explicit compatible
control-plane handshake.

The resolver must report the final chosen control-plane mode, state backend, execution owner,
control-plane URL origin, and identity source in sanitized diagnostics.

## Entrypoint Surface Contract

Every user-visible implementation slice must decide all first-class surfaces together.

| Surface | Required contract |
| --- | --- |
| Repository config | Accept `controlPlane.mode` and optional non-secret `controlPlane.url`. Reject raw tokens, database URLs, project/resource/server/destination/credential ids, and secret material. |
| CLI | Offer flags or environment variables for `control-plane-mode`, `control-plane-url`, token/login selection, and state backend override. CLI flags win over config. |
| GitHub Action | Offer wrapper inputs for control-plane mode, URL, token/OIDC behavior, and execution mode while preserving pure SSH defaults. New CLI releases must not require wrapper releases unless wrapper behavior changes. |
| Web | Show the active control-plane/state owner and offer a select/radio choice only in flows that can actually run the selected mode. A Web surface must not present Cloud/self-host selection as implemented until authentication and API behavior exist. |
| HTTP/oRPC | Keep strict business commands ids-only. A future config-aware workflow endpoint requires its own ADR or command/workflow contract; it must not overload `deployments.create`. |
| MCP/tools | Use the same command/query and config workflow contracts as CLI/API; do not invent separate deployment semantics. |

## Version And Compatibility Handshake

Any control-plane mode other than `none` requires a compatibility handshake before mutation.

The handshake must compare:

- CLI/action client version;
- control-plane API version;
- minimum supported client version;
- feature flags such as managed domain mapping, source links, preview scope, and credential custody;
- state schema version and migration policy;
- deployment execution mode supported by the selected target;
- control-plane identity scope and source fingerprint policy.

If the client and control plane are incompatible, the entry workflow must fail before project,
resource, route, or deployment mutation with a structured error in phase
`control-plane-handshake`. The error must identify the incompatible versions or feature flags
without exposing secrets.

## Adoption And Migration Contract

Moving from `none` to `cloud` or `self-hosted` is an adoption workflow, not a silent deploy side
effect.

Adoption from SSH-server `ssh-pglite` must:

- acquire backend state-root coordination for export/import safety;
- export or stream project/environment/resource/server/source-link/deployment/server-applied-route
  state;
- import or map that state into the control plane under an authenticated owner;
- record a controller/adoption marker on the SSH server;
- record controller id, controller URL, schema version, compatible client range, and last writer
  metadata;
- decide whether future GitHub Actions use API mode, direct SSH mode, or an explicit controlled
  bridge mode;
- provide a recovery path if import succeeds but marker write fails, or marker write succeeds but
  client configuration is not updated.

After adoption, default GitHub Action behavior should be API mode when the marker and handshake are
compatible. Falling back to direct `ssh-pglite` mutation after adoption is allowed only when the
operator explicitly selects break-glass behavior and the control plane is not concurrently using
the same PGlite state.

## Roadmap

### Phase 0: Pure Action And CLI Foundation

Current product line.

- GitHub Action and CLI are execution owners.
- State owner is `none`, backed by SSH-server `ssh-pglite` for SSH targets.
- Repository config can express resource profile, env references, and server-applied domain intent.
- No Cloud/self-hosted server is required.

### Phase 1: Control-Plane Selection Contract

Spec and parser phase.

- Add `controlPlane.mode` and non-secret URL metadata to config schema.
- Add CLI and deploy-action inputs/env names for control-plane selection.
- Keep the default as `none`.
- Add diagnostics and test matrix coverage for mode resolution.
- Do not implement Cloud/self-hosted API behavior yet unless the handshake contract exists.

### Phase 2: Cloud-Assisted Action

Cloud owns state; GitHub Action still executes.

- Add Cloud API authentication, source link lookup, policy lookup, locks, and deployment result
  reporting.
- Keep SSH credentials either in GitHub Secrets or in an explicitly accepted Cloud credential
  custody model.
- Map `access.domains[]` to managed domain intent only after trusted context exists.
- Add compatibility handshake and fail-fast version gating.

### Phase 3: Self-Hosted Control Plane

User-operated Appaloft owns state.

- Provide installer or `appaloft install` path for an Appaloft server.
- Use PostgreSQL as the standard production self-hosted state backend.
- Support adoption from existing SSH-server PGlite state.
- Switch deploy-action/CLI to API mode after compatible adoption.
- Add UI surfaces for project/resource/domain/deploy history maintenance.

### Phase 4: Control-Plane-Owned Execution

Cloud or self-hosted Appaloft may execute.

- Add GitHub App/webhook triggers, preview environment creation, cleanup, and scheduler-owned
  retries.
- Add runner/agent model and credential custody rules.
- Keep GitHub Action execution as a supported option for users that do not want Appaloft to own
  execution.

### Phase 5: Advanced Backends And Enterprise Controls

Optional later product depth.

- External PostgreSQL direct mode with explicit lock/audit/version gates.
- Organization policy, tenant isolation, SSO, audit exports, and managed fleet controls.
- Server agents for ongoing reconcile, DNS/certificate observation, and cleanup without GitHub
  Actions.

## Consequences

- Pure GitHub Actions remains valuable even after Appaloft Cloud exists.
- Cloud is not a required deployment runtime. It is an optional control plane first.
- Self-hosted Appaloft and Cloud share the same control-plane contract where possible.
- `appaloft.yml` may choose connection policy but must not become an identity or secret store.
- `APPALOFT_PROJECT_ID` and similar ids remain optional trusted overrides, not mandatory one-shot
  Action setup.
- Once a control plane owns state, direct SSH PGlite mutation must stop unless an explicit
  break-glass or bridge mode coordinates ownership.

## Required Spec Updates

This decision governs:

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Control-Plane Mode Selection And Adoption](../workflows/control-plane-mode-selection-and-adoption.md)
- [Quick Deploy Workflow](../workflows/quick-deploy.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Control-Plane Modes Test Matrix](../testing/control-plane-modes-test-matrix.md)
- [GitHub Action Deploy Wrapper Plan](../implementation/github-action-deploy-action-plan.md)
- [Control-Plane Modes Roadmap](../implementation/control-plane-modes-roadmap.md)

## Current Implementation Notes And Migration Gaps

Current implementation has a state backend resolver that treats `APPALOFT_CONTROL_PLANE_URL` or
`APPALOFT_DATABASE_URL` as a `postgres-control-plane` backend and skips SSH remote PGlite sync.
That is a partial state-backend implementation, not the full control-plane mode contract described
here.

The config parser does not yet accept `controlPlane.mode` or `controlPlane.url`.

The deploy-action wrapper can install a selected CLI version and run pure SSH deployments, but it
does not yet expose control-plane mode inputs, OIDC/token handling, or Cloud/self-hosted API
handshake behavior.

No Cloud-assisted Action API, self-hosted adoption marker, source-link import, managed config
domain mapping, or control-plane-owned execution runner is implemented yet.

## Open Questions

- What is the first public authentication shape for Cloud-assisted Action: static token, GitHub OIDC
  exchange, GitHub App installation, or more than one option?
- Should `controlPlane.url` be allowed in committed config for `cloud`, or should public Cloud use a
  fixed default URL with only private/self-hosted URLs in config?
- What is the exact server adoption marker path and recovery command for imported SSH-server PGlite
  state?
- Which credential custody modes are available in the first Cloud-assisted Action release?
