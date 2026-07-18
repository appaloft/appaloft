# Plan: CLI Remote Control-Plane Client

## Governing Sources

- Domain model: [Domain Model](../../DOMAIN_MODEL.md)
- Operation map/catalog: [Business Operation Map](../../BUSINESS_OPERATION_MAP.md),
  [Core Operations](../../CORE_OPERATIONS.md), and `packages/application/src/operation-catalog.ts`
- Decisions/ADRs:
  - [ADR-024: Pure CLI SSH State And Server-Applied Domains](../../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
  - [ADR-025: Control-Plane Modes And Action Execution](../../decisions/ADR-025-control-plane-modes-and-action-execution.md)
  - [ADR-030: Public Documentation Round And Platform](../../decisions/ADR-030-public-documentation-round-and-platform.md)
  - [ADR-043: Self-Hosted Action Deploy Token Authorization](../../decisions/ADR-043-self-hosted-action-deploy-token-authorization.md)
  - [ADR-044: Self-Hosted First Admin Bootstrap](../../decisions/ADR-044-self-hosted-first-admin-bootstrap.md)
  - [ADR-045: Self-Hosted Organization Team Operations](../../decisions/ADR-045-self-hosted-organization-team-operations.md)
  - [ADR-046: TypeScript SDK Interface Parity](../../decisions/ADR-046-typescript-sdk-interface-parity.md)
- Global contracts:
  - [Error Model](../../errors/model.md)
  - [neverthrow Conventions](../../errors/neverthrow-conventions.md)
  - [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)
  - [Adapter Command/Query Boundary](../../architecture/adapter-command-query-boundary.md)
- Local workflow/spec/test sources:
  - [Control-Plane Mode Selection And Adoption](../../workflows/control-plane-mode-selection-and-adoption.md)
  - [Control-Plane Modes Roadmap](../../implementation/control-plane-modes-roadmap.md)
  - [Control-Plane Modes Test Matrix](../../testing/control-plane-modes-test-matrix.md)
  - [TypeScript SDK And Interface Parity](../052-typescript-sdk-interface-parity/spec.md)

## Decision And ADR Need

No new ADR is required for this CLI remote client bridge.

ADR-025 already decides the durable cross-cutting rules needed here:

- execution owner and state/control-plane owner are separate;
- `none` remains a long-term pure CLI/GitHub Action mode;
- local login state can be a trusted control-plane source;
- Cloud/self-hosted modes require handshake before mutation;
- `auto` must not silently contact Cloud or upload/adopt SSH state;
- repository config must not store tokens, database URLs, SSH keys, credential ids, tenant/org
  secret identity, or other raw secret material;
- `deployments.create` remains ids-only and does not accept control-plane fields.

ADR-025 should be updated, or a new ADR should be proposed, before a later Code Round if any of
these become part of the behavior:

- CLI login performs server-side credential issuance or revocation with durable custody rules;
- OS keychain versus file-backed credential storage becomes a required product-security guarantee;
- profile context starts carrying project/environment/resource defaults that affect business
  targeting;
- login/adoption becomes coupled to SSH PGlite import, marker writing, or break-glass ownership;
- remote CLI dispatch adds long-running mutation, streaming, or credential brokering semantics not
  already covered by ADR-025 and the operation specs.

## Architecture Approach

### Execution Target Resolver

Add a CLI-side resolver boundary, tentatively `CliExecutionTargetResolver` or
`CliControlPlaneTargetResolver`, that runs before shell composition and before SSH remote-state
preparation for remote-only commands.

Resolver output should be explicit:

```ts
type CliExecutionTarget =
  | {
      kind: "local";
      controlPlaneMode: "none" | "external-postgres";
      diagnostics: SanitizedControlPlaneDiagnostics;
    }
  | {
      kind: "remote";
      controlPlaneMode: "cloud" | "self-hosted";
      profileName: string;
      baseUrl: string;
      auth: RemoteProfileAuthReference;
      diagnostics: SanitizedControlPlaneDiagnostics;
    };
```

The resolver owns precedence among explicit CLI flags, env vars, active profile, repository config
policy, and `auto` fallback. It must never decide project/resource/server identity from committed
config.

### Operation Dispatcher

Add a CLI-side operation dispatcher boundary, tentatively `CliOperationDispatcher`.

Local implementation:

- uses the existing local `CommandBus`/`QueryBus`;
- preserves `ExecutionContextFactory`, locale, CLI actor metadata, progress observer, terminal
  gateway, source-link store, and server-applied route store behavior;
- remains the only dispatcher for pure SSH and local shell workflows.

Remote implementation:

- uses `@appaloft/sdk` generated operation descriptors;
- sends product-session cookie or bearer token auth from the active profile;
- maps each command/query message to the existing operation key and schema-shaped input through
  `packages/application/src/operation-catalog.ts`;
- returns structured operation results and errors without parsing human message text;
- fails before local mutation when remote mode is selected for an unsupported operation.

The implemented dispatcher remoteizes generated SDK non-streaming operations generically and blocks
streaming, webhook-signature-only, local gateway, and local/source-package entry flows before they
can mutate through the wrong owner.

### Command Helper Shape

The implemented bridge keeps existing CLI command modules calling `runCommand(Command.create(input))`
or `runQuery(Query.create(input))`. The remote runtime maps the constructed command/query message
class name back to an operation catalog entry and generated SDK operation descriptor. This avoids a
large command-module rewrite while still avoiding CLI-only business schemas.

A future local/remote `runOperation` helper remains a maintainability option if command modules
need operation-key-aware behavior before message construction, for example source-package dispatch,
streaming selection, or better route-specific diagnostics.

### Profile Store Package Boundary

Profile storage belongs outside `core` and `application`.

Recommended first location:

- `packages/adapters/cli/src/control-plane-profile-store.ts` or a small sibling module under
  `packages/adapters/cli/src/commands/control-plane-*` for the first CLI-only slice.

Promote to a package only when another client needs it:

- `packages/cli-control-plane` or `packages/control-plane-client` if desktop, future MCP tooling,
  or a public client package needs the same resolver/profile code.

The profile store may depend on local filesystem/keychain helpers and typed client packages. It
must not depend on repositories, shell composition, `core` aggregate internals, application ports,
or DI tokens.

### Remote Client Selection

Implemented client selection:

- use `@appaloft/sdk` for operation dispatch because it already has generated operation
  descriptors, product-session cookie auth, bearer token auth, structured errors, and no
  `core`/`application` runtime dependency;
- use direct fetch only for infrastructure endpoints outside the operation catalog, such as
  `/api/version`, `/api/auth/session`, and any auth-provider callback/status route.

Acceptable alternative:

- extend `@appaloft/orpc/client` to accept an auth/header resolver and use it for remote dispatch,
  while keeping route typing and generated contract parity intact.

Forbidden:

- hand-written CLI HTTP schemas that drift from application command/query schemas;
- calling application use cases or repositories directly from remote dispatch;
- making the CLI spin up a local Appaloft server in order to call remote operations.

## Entrypoint And Surface Impact

| Surface | Impact |
| --- | --- |
| CLI | New login/logout/status/context commands; generated non-streaming business commands can run remote dispatch when a remote target is selected. |
| HTTP/oRPC | Existing routes stay the remote contract. `/api/version` remains infrastructure handshake discovery. |
| Web | No runtime change; Web already consumes HTTP/oRPC. Future Web help can link to the same docs anchor. |
| SDK | Existing `@appaloft/sdk` is the best current typed remote operation client for CLI dispatch. |
| Future MCP/tools | No new MCP semantics; generated tools continue to use operation catalog entries and auth policy metadata. |
| Repository config | No secret fields. Existing `controlPlane.mode/url` connection policy remains separate from local profiles. |
| Public docs/help | CLI reference anchors now cover login/context/remote dispatch, local fallback, and unsupported-operation errors. |

## Roadmap And Compatibility

- Roadmap target: control-plane mode Phase 1/3 bridge, before full Cloud-assisted Action or
  self-hosted SSH PGlite adoption.
- Version target: pre-`1.0.0`; no release version assigned by this Spec Round.
- Compatibility impact: `pre-1.0-policy`, additive commands and dispatch selection.
- Migration requirement: no automatic migration. Existing pure CLI users remain on local/SSH mode
  unless they log in or pass trusted remote mode/URL input.
- Changelog/release-note requirement: when implemented, release notes must call out that login is a
  client profile only and not SSH state adoption.

## Testing Strategy

Use [Control-Plane Modes Test Matrix](../../testing/control-plane-modes-test-matrix.md) rows:

- `CONTROL-PLANE-CLI-001` through `CONTROL-PLANE-CLI-013` for profile/login/context/dispatch.
- Existing `CONTROL-PLANE-MODE-*` rows for resolver precedence and `auto` fallback.
- Existing `CONTROL-PLANE-HANDSHAKE-*` rows for compatibility failure and no-mutation behavior.

Expected test layers:

- unit tests for URL/profile validation, redaction, file permissions, and resolver precedence;
- CLI adapter tests for login/status/logout/context output and redaction;
- shell tests proving remote-capable commands do not create local shell composition or SSH PGlite
  sync when remote target is selected;
- running-server or stub HTTP tests for `/api/version`, auth failure propagation, and generated SDK
  remote dispatch;
- import-boundary tests proving profile store and remote dispatcher do not import `core`,
  repositories, use cases, shell composition, or DI tokens;
- operation parity tests proving remote generated SDK operations use the same operation descriptors
  and response/error shapes as HTTP/oRPC/SDK.

## Implemented Deliverable Slice

Code Round implemented:

1. Added a CLI-adapter-local profile store and active profile resolver.
2. Added `appaloft auth login/status/logout` plus top-level `appaloft login/logout` aliases.
3. Added default Appaloft Cloud login endpoint selection for `https://app.appaloft.com`, neutral
   browser auth-session exchange, and `--no-browser` for CI/noninteractive contexts.
4. Added `appaloft context list/use/show`.
5. Added `/api/version` and current organization context verification before profile write.
6. Added dispatch-time handshake before remote business operations.
7. Added full flags/env/profile/config target resolution for `none`, `auto`, `cloud`, and
   `self-hosted`, including mode mismatch guards.
8. Added pre-composition shell routing so selected remote commands skip local shell composition and
   SSH PGlite sync.
9. Added generic generated SDK non-streaming dispatch for command/query messages, with tests for
   project reads, project mutation, and a non-project read.
10. Kept top-level quick deploy, source-package/bootstrap paths, remote-state, DB, serve, terminal
   attach, webhook-signed source ingestion, and streaming/follow behavior local or explicitly
   unsupported in selected remote mode.
11. Added `appaloft deployments create` as a strict ids-only admission surface so a remote CLI
    profile can create the first deployment after explicit Resource profile and target setup,
    without remoteizing source-package/config bootstrap or top-level Quick Deploy.

This slice proves remote ids-only deployment admission without changing SSH state adoption, domain
mapping, source-package/config bootstrap, or control-plane-owned source-package execution.

The broader `CliExecutionTargetResolver` and generalized remote dispatcher are now implemented in
the CLI adapter as `control-plane-target.ts` and `remote-cli-program.ts`.

## Browser Auth Exchange Contract

The CLI auth exchange is a transport/auth contract, not a new product business operation:

1. `POST /api/cli-auth/sessions` creates a short-lived authorization session and returns
   `verificationUri`, `verificationUriComplete`, `userCode`, `deviceCode`, `expiresIn`, and
   `interval`.
2. The CLI prints `verificationUriComplete` and the user code, then waits for explicit Enter before
   opening the browser unless disabled by `--no-browser`, `APPALOFT_CLI_OPEN_BROWSER=false`, or CI.
3. `GET /api/cli-auth/sessions/{deviceCode}` returns `pending`, `authorized`, `denied`, or
   `expired`. The CLI continues polling while pending.
4. `POST /api/cli-auth/sessions/{deviceCode}/exchange` is called only after `authorized` and
   returns one-time credential material suitable for the existing profile auth shape.
5. The CLI performs `/api/version` and current organization context verification with the exchanged
   credential before writing the profile.
6. `POST /api/cli-auth/sessions/{deviceCode}/cancel` is best-effort on Ctrl-C or equivalent
   cancellation.

Endpoints that do not implement session creation return `control_plane_auth_unsupported`, letting
self-hosted instances remain explicit and structured instead of falling back to token paste.
Environment credentials remain trusted noninteractive paths and do not become the default human
flow.

## Risks And Migration Gaps

- `packages/orpc/src/client.ts` does not currently accept auth headers, so `@appaloft/sdk` remains
  the practical remote dispatch client unless oRPC client auth support is added.
- Browser auth exchange now uses a neutral one-time session contract. The private hosted
  implementation owns actual identity provider login UX and credential issuance policy.
- Long-running remote mutations need progress, streaming, and async acceptance alignment before
  remoteization.
- Project/environment/resource context defaults are intentionally deferred because they can change
  operation targeting and should not become hidden state.
- Top-level quick deploy still needs a source package/server-side config contract before it can be
  equivalent to remote `deployments.create` from the CLI.
- Adoption marker detection remains governed by ADR-025 but is not part of login.
