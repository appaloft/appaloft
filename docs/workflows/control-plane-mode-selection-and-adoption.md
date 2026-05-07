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
- retarget project/resource/server identity from committed config.

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

Rules:

- `mode` may be `none`, `auto`, `cloud`, or `self-hosted`.
- `url` is allowed only as non-secret connection metadata for self-hosted or future private Cloud
  endpoints.
- Raw tokens, API keys, database URLs, SSH keys, certificate material, project ids, resource ids,
  server ids, destination ids, credential ids, organization ids, and tenant ids are rejected.
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

CLI flags win over config.

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

In this slice the Action must not install or invoke the CLI, open SSH, select `state-backend`,
create or configure resource profile state, upload source archives, or mutate SSH-server PGlite.
The source-link API route may resolve project/environment/resource/server context from existing
server-owned source-link state. If trusted ids are supplied by the Action for deploy, the server
may bootstrap a missing source link; if ids are omitted and no link exists, deployment fails before
mutation. Preview cleanup must resolve context from preview source-link state. Config bootstrap,
source package, and broader preview workflow contracts remain later server-side work.

### Web

Web may display the current mode as read-only before it can modify it.

When Web offers selection, it must provide an explicit select/radio affordance and must disable or
hide modes without authentication/API support. Web must not hardcode user-facing strings in Svelte
components; labels and errors use i18n keys.

### API/oRPC

Strict business commands remain unchanged. `deployments.create` is ids-only and does not accept
control-plane mode fields.

A future config-aware backend workflow API requires a separate ADR or accepted command/workflow
contract.

### Future MCP/tools

Tools must use the same config workflow and command/query contracts. Tool parameters may be trusted
entrypoint overrides, but they must not become a separate deployment semantics path.

## Error Codes And Phases

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `control-plane-config` | No | Repository config declares an invalid mode, unsafe URL, identity selector, or secret-bearing control-plane field. |
| `validation_error` | `control-plane-resolution` | No | Selected mode cannot resolve the required URL, credential, or trusted source before mutation. |
| `control_plane_handshake_failed` | `control-plane-handshake` | Conditional | Endpoint is reachable but client/API/schema/feature/auth compatibility failed. |
| `control_plane_unavailable` | `control-plane-connect` | Yes | Selected control plane cannot be reached. |
| `control_plane_adoption_required` | `control-plane-resolution` | No | A server adoption marker says control-plane ownership exists, but the entrypoint attempted uncoordinated direct SSH state mutation. |
| `control_plane_unsupported` | `control-plane-capability` | No | The selected control plane does not support a requested feature such as managed config domain mapping or action-custodied credentials. |
| `infra_error` | `control-plane-adoption` | Conditional | Adoption export/import/marker write failed and recovery metadata must be surfaced. |

Errors must include sanitized details such as selected mode, URL origin, client version, minimum
server version, feature flag, or adoption marker state. They must not include tokens, SSH keys,
database URLs, or raw secret values.

## Current Implementation Notes And Migration Gaps

Current implementation only has partial state-backend behavior:

- `APPALOFT_CONTROL_PLANE_URL` or `APPALOFT_DATABASE_URL` selects `postgres-control-plane` in the
  CLI state backend resolver;
- remote SSH PGlite sync is skipped for that state backend;
- no config `controlPlane` parser exists;
- no Cloud/self-hosted handshake exists;
- no adoption marker exists;
- no control-plane API mode exists for deploy-action;
- no Web selection surface exists.

Until Phase 1 is implemented, documentation and examples should describe Cloud/self-hosted
control-plane mode as roadmap, not as available behavior.

## Open Questions

- Which control-plane auth mechanism ships first for GitHub Actions?
- Should the public Cloud URL be implicit for `mode: cloud`, or should config allow a Cloud URL only
  for private/enterprise endpoints?
- What is the exact break-glass flag name for direct SSH state mutation after adoption?
- Does first self-hosted install create a local anonymous admin session by default or require
  explicit auth before adoption?
