# Control-Plane Mode Selection And Adoption Workflow Spec

## Normative Contract

Control-plane mode selection is an entry-workflow concern that decides where Appaloft state,
identity, locks, policy, and control-plane workflows live before any project/resource/deployment
mutation occurs.

It is not a deployment command, not a `deployments.create` field, and not a repository identity
selector.

Every config-aware entrypoint must resolve the same two dimensions:

```text
execution owner
  = github-action | cli | local-web-agent | control-plane-runner | future-mcp-tool

control-plane/state owner
  = none | cloud | self-hosted | external-postgres
```

The resolver must choose these dimensions before:

- remote state ensure/lock/migration;
- source link lookup or creation;
- project/environment/resource/server identity resolution;
- environment variable application;
- `access.domains[]` mapping;
- `deployments.create`.

## Global References

This workflow inherits:

- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-001: deployments.create HTTP API Required Fields](../decisions/ADR-001-deploy-api-required-fields.md)
- [Repository Deployment Config File Bootstrap](./deployment-config-file-bootstrap.md)
- [Quick Deploy Workflow](./quick-deploy.md)
- [Control-Plane Modes Test Matrix](../testing/control-plane-modes-test-matrix.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Control-Plane Modes Roadmap](../implementation/control-plane-modes-roadmap.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Mode Semantics

### `none`

`none` means no Appaloft Cloud or self-hosted control plane is selected.

For SSH targets, the state owner is the SSH server. The entry workflow must use `ssh-pglite` by
default unless the operator explicitly selected local-only state.

```text
config/flags/env
  -> control-plane mode resolves to none
  -> SSH target present
  -> ensure, state-root coordinate, migrate, and sync SSH-server state
  -> source link and identity resolution
  -> explicit operations
  -> deploy and persist back to SSH state
```

No Cloud token, control-plane URL, `DATABASE_URL`, or Appaloft project id is required.

### `auto`

`auto` means the entrypoint may connect to a control plane only when a trusted control-plane source
is present.

Trusted sources include:

- explicit CLI/action input;
- environment variables such as `APPALOFT_CONTROL_PLANE_URL`;
- local login profile;
- a verified SSH-server adoption marker written by a prior adoption workflow;
- future GitHub App/OIDC context accepted by ADR.

If no trusted source exists, `auto` falls back to `none`. The final selected mode must appear in
sanitized diagnostics.

`auto` must not:

- contact Appaloft Cloud by default without a trusted token or endpoint selection;
- scan arbitrary network addresses;
- import or upload SSH-server state as a side effect of deploy;
- retarget project/resource/server identity from committed config outside the narrow self-hosted
  `controlPlane.deploymentContext` bootstrap/advanced override.

### `cloud`

`cloud` means Appaloft Cloud owns state and policy.

The first supported cloud shape is Cloud-assisted Action:

```text
GitHub Action remains execution owner
  -> Appaloft Cloud owns source link, locks, identity, policy, audit, and managed workflow state
  -> Action performs build/upload/SSH/runtime execution
  -> Action reports attempt/progress/result/diagnostics to Cloud
```

Cloud mode requires a compatibility handshake before mutation. Authentication must come from a
trusted secret/token/OIDC/login source outside committed config.

### `self-hosted`

`self-hosted` means a user-operated Appaloft control plane owns state and policy.

The first production self-hosted contract uses PostgreSQL. Embedded PGlite is allowed only for
single-process/dev/portable installs.

After a self-hosted control plane adopts a target with existing SSH-server PGlite state, GitHub
Actions and CLI should use the control-plane API. Direct SSH PGlite mutation after adoption is
allowed only as an explicit break-glass path that coordinates ownership.

### `external-postgres`

`external-postgres` is a backend selection for advanced automation, not the default product mode.
It must still use application commands, migrations, locks, version checks, and structured errors.

## Repository Config Shape

Repository config may declare control-plane connection policy:

```yaml
controlPlane:
  mode: none
```

Accepted self-hosted endpoint shape:

```yaml
controlPlane:
  mode: self-hosted
  url: https://appaloft.internal.example.com
```

Self-hosted console install workflows may add non-secret installer defaults:

```yaml
controlPlane:
  mode: self-hosted
  url: https://console.example.com
  install:
    database: pglite
    orchestrator: compose
    httpPort: 3001
```

Rules:

- `mode` may be `none`, `auto`, `cloud`, or `self-hosted`.
- `url` is allowed only as non-secret connection metadata for self-hosted or future private Cloud
  endpoints.
- Raw tokens, API keys, database URLs, SSH keys, certificate material, credential ids, organization
  ids, tenant ids, provider account ids, and secret values are rejected. Project/environment/
  resource/server/destination ids are accepted only inside the narrow self-hosted
  `controlPlane.deploymentContext` bootstrap/advanced override field governed by Action Server
  Config Deploy; broad committed identity selectors remain rejected.
- `controlPlane.install` is limited to non-secret console installer defaults. SSH host/key, API
  tokens, raw database credentials, and deployment identity remain trusted entrypoint inputs or
  server-owned state.
- A committed config file may not choose Cloud project/resource identity.
- If `controlPlane` is omitted, the default mode is `none`.

Trusted entrypoint overrides may still select project/resource/server identity outside config.
Those overrides must be marked as trusted input and included only as sanitized origin metadata.

## Selection Precedence

```text
built-in default `none`
  < repository config controlPlane.mode/url
  < APPALOFT_CONTROL_PLANE_MODE / APPALOFT_CONTROL_PLANE_URL
  < CLI flags / deploy-action inputs / local login profile
  < future API workflow input
```

Secrets are never read from repository config. Secret-bearing values come from CI secrets, local
login state, environment variables, external secret stores, or future accepted credential commands.

## Handshake Sequence

For `cloud` and `self-hosted`, the entry workflow must complete:

```text
resolve control-plane endpoint and credential
  -> call compatibility handshake
  -> verify client version, API version, feature flags, state schema, auth scope, and source policy
  -> resolve or create source link through the control plane
  -> resolve project/environment/resource/server/destination context through trusted state
  -> acquire control-plane coordination lease or workflow lease
  -> dispatch explicit operations or a future accepted workflow API
```

If the handshake fails, no project/resource/domain/deployment mutation may occur.

## Adoption Sequence

Adoption moves a target from `none` to `cloud` or `self-hosted`.

```text
operator selects control plane and target SSH state
  -> acquire SSH state-root coordination
  -> export SSH-server state and source links
  -> authenticate to control plane
  -> import or map state into control plane
  -> write adoption marker on SSH server
  -> verify marker and control-plane import agree
  -> switch CLI/Action to API mode by config/env/action input
```

Adoption is explicit and recoverable. A normal deploy must not silently adopt state.

The adoption marker should include:

- controller id;
- controller URL;
- controller mode;
- state schema version;
- compatible client range;
- adopted source link count or state checksum;
- last writer metadata;
- recovery marker when adoption was interrupted.

## Entrypoint Requirements

### CLI

CLI must expose mode selection through flags and environment variables before it claims the feature
is user-visible. Suggested names:

- `--control-plane-mode none|auto|cloud|self-hosted`
- `--control-plane-url <url>`
- `APPALOFT_CONTROL_PLANE_MODE`
- `APPALOFT_CONTROL_PLANE_URL`
- `APPALOFT_TOKEN` or a future provider-specific token source

CLI flags win over config. For interactive CLI use, a local login profile may also be a trusted
control-plane source, but explicit command flags and environment variables must remain able to
override the active profile for one invocation.

#### CLI Remote Control-Plane Client

The CLI remote control-plane client is a client-side entry workflow over this mode resolver. It is
governed by [CLI Remote Control-Plane Client](../specs/074-cli-remote-control-plane-client/spec.md).

Initial user-facing affordances:

- `appaloft login --url <cloud-or-self-hosted-url>` or the namespaced
  `appaloft auth login --url <cloud-or-self-hosted-url>`;
- `appaloft logout` or `appaloft auth logout`;
- `appaloft auth status`;
- `appaloft context list`;
- `appaloft context use <profile>`;
- `appaloft context show`.

Login creates or updates a local uncommitted CLI profile only after URL validation,
compatibility discovery, and accepted auth/session verification. Context selection switches the
active local profile/context and must not create projects, resources, source links, deployments, or
domain bindings.

Profile storage rules:

- profile and token/session material live outside the repository tree, for example under an
  Appaloft CLI home or OS config/keychain location;
- token, cookie, database URL, SSH key, credential id, tenant/org secret identity, provider account
  id, and raw secret values must not be written to committed `appaloft.yml`, logs, diagnostics, or
  machine-readable output;
- profile list/show/status output may include only safe endpoint, mode, profile name, token safe
  suffix/reference metadata, current organization/user display metadata, and last handshake summary;
- profile context must not bypass server-side authorization.

Remote operation dispatch rules:

- remote-capable CLI commands dispatch through the typed remote API client using the same operation
  key and schema-shaped input as HTTP/oRPC, Web, SDK, and future MCP/tool surfaces;
- the active bridge dispatches generated SDK non-streaming command/query operations generically
  after compatibility/auth handshake;
- selected remote mode plus an unsupported command fails before local mutation with a structured
  control-plane error;
- no active profile or trusted remote source preserves current pure CLI/local behavior;
- `auto` may use an active profile as a trusted source, but without a trusted source it falls back
  to `none`;
- `auto` must not contact public Cloud by default, scan arbitrary networks, upload SSH-server
  PGlite state, or adopt a server.

The CLI must resolve whether a command is local or remote before SSH remote-state preparation,
source-link lookup, local shell composition, or deployment mutation when the command can be remote
only. Local-only commands such as `serve`, `db`, `remote-state`, pure SSH quick `deploy`,
source-package/config bootstrap, terminal attach, webhook-signature-only ingestion, and
streaming/watch commands remain local or fail as unsupported in selected remote mode.

### GitHub Action

The deploy-action wrapper must expose equivalent inputs before Cloud/self-hosted mode is documented
as supported:

- `control-plane-mode`
- `control-plane-url`
- `appaloft-token` or accepted OIDC behavior
- `execution-mode` only when more than `github-action` is implemented

When these inputs are absent, the action remains pure SSH/`none` by default.

The first supported `self-hosted` Action slice is server API trigger mode for an existing resource
profile:

```text
GitHub Action
  -> resolve control-plane-mode self-hosted from trusted action input or non-secret config policy
  -> require control-plane-url
  -> call /api/version compatibility check
  -> call POST /api/action/deployments/from-source-link with a derived source fingerprint for deploy
  -> call POST /api/deployments/cleanup-preview with a preview source fingerprint for preview cleanup
```

In this slice the Action must not invoke the CLI deployment path, open SSH, select
`state-backend`, create or configure resource profile state, upload source archives, or mutate
SSH-server PGlite.
The source-link API route dispatches the internal
`CreateActionSourceLinkDeploymentCommand` to resolve project/environment/resource/server context
from existing server-owned source-link state or complete deploy-token scope. Explicit ids supplied
by the Action are advanced bootstrap/debug context: the server may bootstrap a missing source link
only after completeness, source-link, repository-fact, and token-scope conflict checks. If ids are
omitted and no link, token scope, source binding, or trusted bootstrap context resolves the target,
deployment fails before mutation with actionable recovery guidance. Preview cleanup must resolve
context from preview source-link state. Config bootstrap and source package handling are not part of
this source-link trigger route; they are owned by the active explicit `server-config-deploy` route
below. Broader adoption, Cloud reporting, and managed product-grade preview policy remain separate
control-plane workflows.

The active self-hosted server-config deploy slice is
[Action Server Config Deploy](../workflows/action-server-config-deploy.md), coordinated by the
[Action Server Config Deploy](../specs/050-action-server-config-deploy/spec.md) feature artifact.
That slice keeps the same state-owner boundary but lets the Action hand a bounded source package
reference and selected config path to the self-hosted server. The server, not the runner, validates
the package manifest, parses repository config, applies resource/environment/profile changes
through explicit operations, resolves source links from trusted context through the internal
`ResolveActionServerConfigDeploymentTargetCommand`, and dispatches ids-only deployment admission.
It must fail before source package mutation or state mutation when the
handshake does not advertise source package and server-side config bootstrap support.

### Web

Web may display the current mode as read-only before it can modify it.

When Web offers selection, it must provide an explicit select/radio affordance and must disable or
hide modes without authentication/API support. Web must not hardcode user-facing strings in Svelte
components; labels and errors use i18n keys.

### API/oRPC

Strict business commands remain unchanged. `deployments.create` is ids-only and does not accept
control-plane mode fields.

Additional config-aware backend workflow APIs beyond the active `server-config-deploy` route require
a separate ADR or accepted command/workflow contract.

### Future MCP/tools

Tools must use the same config workflow and command/query contracts. Tool parameters may be trusted
entrypoint overrides, but they must not become a separate deployment semantics path.

## Error Codes And Phases

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `control-plane-config` | No | Repository config declares an invalid mode, unsafe URL, identity selector, or secret-bearing control-plane field. |
| `validation_error` | `control-plane-resolution` | No | Selected mode cannot resolve the required URL, credential, or trusted source before mutation. |
| `control_plane_handshake_failed` | `control-plane-handshake` | Conditional | Endpoint is reachable but client/API/schema/feature/auth compatibility failed. |
| `control_plane_unavailable` | `control-plane-handshake` or `remote-operation-dispatch` | Yes | Selected control plane cannot be reached. |
| `control_plane_adoption_required` | `control-plane-resolution` | No | A server adoption marker says control-plane ownership exists, but the entrypoint attempted uncoordinated direct SSH state mutation. |
| `control_plane_unsupported` | `control-plane-capability` | No | The selected control plane does not support a requested feature such as managed config domain mapping or action-custodied credentials. |
| `infra_error` | `control-plane-adoption` | Conditional | Adoption export/import/marker write failed and recovery metadata must be surfaced. |
| `validation_error` | `control-plane-profile-write` or `control-plane-cli-parse` | No | CLI profile name, URL, mode, or local context input is invalid. |
| `control_plane_profile_not_found` | `control-plane-profile-read` or `control-plane-resolution` | No | The selected profile or active context does not exist. |
| `control_plane_profile_store_unavailable` | `control-plane-profile-read` or `control-plane-profile-write` | Conditional | Local CLI profile or credential storage cannot be read, written, locked, or permission-hardened. |
| `product_auth_missing` | `control-plane-auth` | No | Remote CLI dispatch requires a product session or token that is not available. |
| `product_auth_invalid` | `control-plane-auth` | No | The stored or supplied CLI profile token/session is rejected by the selected control plane. |
| `control_plane_unsupported` | `remote-operation-dispatch` | No | Remote mode was selected for a CLI command that is not remote-capable in the current bridge. |

Errors must include sanitized details such as selected mode, URL origin, client version, minimum
server version, feature flag, or adoption marker state. They must not include tokens, SSH keys,
database URLs, or raw secret values.

## Current Implementation Notes And Governed Follow-Ups

Current implementation has an active self-hosted control-plane baseline:

- `APPALOFT_CONTROL_PLANE_URL` or `APPALOFT_DATABASE_URL` selects `postgres-control-plane` in the
  CLI state backend resolver;
- remote SSH PGlite sync is skipped for that state backend;
- repository config parsing accepts safe `controlPlane.mode` and `controlPlane.url` values while
  rejecting identity selectors and secret-bearing fields;
- deploy-action self-hosted modes use `/api/version` as the compatibility handshake;
- deploy-action's composite wrapper still runs its shared binary install/setup step before dispatch,
  but self-hosted server API mode does not use that binary as the deployment executor;
- source-link server API deployments are available through
  `POST /api/action/deployments/from-source-link`;
- the active self-hosted server-config deploy slice is available through
  `POST /api/action/deployments/from-config-package` for compatible servers that advertise source
  package and server-side config bootstrap support.
- the CLI remote control-plane client bridge has local uncommitted profile storage,
  `appaloft login/logout`, `appaloft auth login/status/logout`, `appaloft context list/use/show`,
  flags/env/profile/config target resolution, dispatch-time handshake, and generic generated SDK
  non-streaming operation dispatch for active Cloud or self-hosted profiles.

Governed follow-ups remain:

- no adoption marker exists;
- Cloud-assisted Action API mode and OIDC/token exchange remain governed control-plane follow-ups;
- Additional config-aware backend workflow APIs beyond the active `server-config-deploy` route are
  governed follow-ups;
- default Cloud browser/device/OIDC login, remote streaming/watch, source-package quick deploy,
  terminal attach gateway, OS keychain storage, and future MCP exposure remain governed follow-ups;
- no Web selection surface exists.

## Open Questions

- Which control-plane auth mechanism ships first for GitHub Actions?
- Should the public Cloud URL be implicit for `mode: cloud`, or should config allow a Cloud URL only
  for private/enterprise endpoints?
- What is the exact break-glass flag name for direct SSH state mutation after adoption?
- Does first self-hosted install create a local anonymous admin session by default or require
  explicit auth before adoption?
