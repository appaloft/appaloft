# CLI Remote Control-Plane Client

## Status

- Round: Code Round with Post-Implementation Sync for the first self-hosted read-only slice.
- Artifact state: first slice implemented and synchronized; Cloud auth, full target resolution,
  adoption, and broader remote command coverage remain deferred.
- Roadmap target: Control-plane mode Phase 1/3 bridge. It makes local CLI login/profile and
  read-only remote operation dispatch concrete without completing Cloud-assisted Action,
  self-hosted adoption, or control-plane-owned execution.
- Compatibility impact: `pre-1.0-policy`; additive public CLI behavior with strict secret and
  fallback boundaries.

## Business Outcome

Operators can keep using Appaloft as a pure local CLI or GitHub Action deployment tool while also
using the CLI as a client for Appaloft Cloud or a self-hosted Appaloft control plane.

After an operator logs in to a trusted control plane, ordinary CLI business commands that are
declared remote-capable can call the remote HTTP/oRPC operation contract instead of always
bootstrapping a local shell composition and dispatching an in-process command or query bus. The CLI
must still use the same application operation keys and input schemas as HTTP/oRPC, Web, SDK, and
future MCP/tool surfaces.

Login and context selection are not deployment admission, not adoption, and not migration. A normal
login must not upload SSH PGlite state, write control-plane fields to `deployments.create`, mutate
remote state on an SSH target, or rewrite committed repository config.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| CLI remote control-plane client | The CLI running as a client of Appaloft Cloud or a self-hosted Appaloft HTTP/oRPC API. | CLI entrypoint | remote CLI client |
| CLI profile | Local, uncommitted record for one control-plane endpoint, safe display metadata, and a token/session reference. | CLI adapter | login profile |
| CLI context | The active local selection used by ordinary CLI commands, initially the active profile plus safe current organization/user context returned by the control plane. | CLI adapter | active profile |
| Remote operation dispatch | Executing an existing Appaloft operation by calling the remote typed API client with the operation's schema-shaped input. | CLI adapter/API | API mode dispatch |
| Local operation dispatch | Executing an existing Appaloft operation through the local shell composition, `CommandBus`, or `QueryBus`. | CLI adapter/shell | local runtime dispatch |
| Control-plane handshake | Version, API, feature, auth-scope, and source-policy compatibility check before remote mutation and before remote-capable queries that require authenticated product context. | Control-plane mode workflow | version check |
| Adoption | Explicit workflow that imports or maps SSH-server PGlite state into a Cloud/self-hosted control plane and writes an adoption marker. | Control-plane mode workflow | migration |

## Pure SSH Mode Versus Remote Control-Plane Mode

| Concern | Pure CLI/SSH mode, `controlPlane.mode = none` | Remote control-plane client mode |
| --- | --- | --- |
| State owner | SSH server `ssh-pglite` by default for SSH targets. | Appaloft Cloud or a self-hosted Appaloft API. |
| Execution owner | CLI or GitHub Action process. | CLI process for client calls; remote control plane owns state and policy. Deployment execution remains operation-specific. |
| Identity source | SSH state source links, trusted flags/env, local prompts, or explicit relink. | Local CLI profile token/session, trusted flags/env, control-plane source links, and product-session authorization. |
| Repository config | May declare non-secret profile fields and `controlPlane.mode/url` policy only. | Same config safety rules; it must not store token, database URL, SSH key, credential id, tenant/org secret identity, or raw secret material. |
| Business dispatch | Local `CommandBus`/`QueryBus` after state backend resolution. | Remote typed API client for remote-capable operations; local dispatch only when resolver selects local mode. |
| Domains in config | Server-applied route state on the SSH target. | May map to managed domain workflows only in a later governed slice after trusted context exists. |
| Adoption | Not active. | Not a login side effect; explicit adoption command/workflow only. |

## User Behavior

### Login

`appaloft login --url <cloud-or-self-hosted-url>` creates or updates a local CLI profile only after
the endpoint is trusted, reachable, and compatible enough for the selected authentication flow.

Initial accepted command shapes:

- `appaloft login --url <url> [--profile <name>]`
- `appaloft auth login --url <url> [--profile <name>]` as a namespaced alias when useful for CLI
  organization
- `appaloft auth status [--profile <name>]`
- `appaloft logout [--profile <name>]`
- `appaloft auth logout [--profile <name>]` as a namespaced alias

Login must:

- normalize the URL and reject unsafe endpoint strings before any token is stored;
- perform `/api/version` compatibility discovery before storing the profile;
- complete the selected auth flow or token/session import from a trusted local input;
- verify the token/session against a product-session read such as current organization context when
  that route is available;
- store only local profile data outside the repository tree;
- make the new profile active only after profile write succeeds;
- print sanitized profile, URL origin, API version, selected mode, and current organization/user
  summary when available.

Login must not:

- write to `appaloft.yml`;
- add `controlPlane` to `deployments.create`;
- create projects, environments, resources, servers, source links, deployments, or domain bindings;
- adopt, import, upload, or reconcile SSH PGlite state;
- store raw token material in command history, committed config, logs, diagnostics, or JSON output.

The exact first auth acquisition mechanism remains a Code Round decision. Acceptable first slices
are browser/device flow, product-session cookie import, or token input through stdin or environment,
provided the stored result uses the same profile and handshake rules. Cloud public auth remains
deferred until the Cloud auth mechanism is accepted.

### Logout

Logout removes the local credential/session reference for the selected profile and leaves server
state untouched.

Logout may optionally call a remote session-revoke endpoint in a later governed auth slice, but the
first CLI client slice must treat logout as local credential removal only unless an accepted auth
spec says otherwise.

Logout must not revoke deploy tokens, delete source links, change organization membership, delete
profiles from committed config, or mutate project/resource/deployment state.

### Profile And Context Commands

`appaloft context list`, `appaloft context use <profile>`, and `appaloft context show` manage the
active local CLI context.

Initial context scope:

- active profile name;
- endpoint URL and mode;
- safe current user/organization summary from the last successful handshake or status refresh;
- token/session safe suffix or reference metadata only;
- handshake timestamp and compatible API/client range when known.

Context commands must not store default project, environment, resource, server, destination,
credential, organization secret identity, database URL, SSH key, or raw token material in committed
repository config. A future explicit project/environment default context requires its own governed
Spec Round because it can affect operation targeting.

### Remote API Dispatch

For ordinary business commands, the CLI resolves an execution target before local shell
composition, state backend resolution, source link lookup, or deployment mutation.

Resolution rules:

- Explicit local mode, such as `--control-plane-mode none`, selects local operation dispatch.
- Explicit remote mode or URL selects remote operation dispatch after handshake and auth
  resolution.
- An active CLI profile is a trusted remote source for interactive CLI commands when no explicit
  mode/URL override is supplied.
- `auto` may use an active CLI profile as a trusted source; without a trusted profile, endpoint,
  env token, or adoption marker, it falls back to `none`.
- `auto` must not contact public Cloud by default, scan networks, upload SSH state, or adopt an SSH
  server.
- Remote dispatch for an unsupported operation must fail before local mutation unless the operator
  explicitly selected local mode.

Remote dispatch must call a typed client generated from or shared with the HTTP/oRPC operation
contract. It must not redefine transport-only business input schemas for CLI remote mode.

### Fallback

Fallback is explicit and observable:

- No profile plus no trusted remote selection: use local mode, preserving current pure CLI behavior.
- `auto` plus no trusted remote source: use local mode and report the fallback reason in sanitized
  diagnostics when diagnostics are requested.
- Selected remote mode with missing profile/token, failed handshake, or unsupported operation: fail
  before local mutation. The CLI must not silently rerun the same command locally.
- Explicit local override: use the current local runtime and state backend rules.

## Initial Support Boundary

### First Required Remote-Capable Slice

The recommended first Code Round slice is:

- local profile store and active context commands;
- `appaloft login/auth login`, `appaloft auth status`, and `appaloft logout/auth logout`;
- compatibility handshake against `/api/version`;
- authenticated product-session status through the existing current organization context contract
  when available;
- remote dispatch for read-only `projects.list` and `projects.show`;
- clear unsupported-operation errors for non-remoteized commands when remote mode is selected.

`projects.list` and `projects.show` are chosen because they are active product-session member
queries in `CORE_OPERATIONS.md`, already exposed through HTTP/oRPC, and useful for proving remote
dispatch without mutating state.

### Commands That Stay Local Or SSH-Only In The First Slice

The first slice must keep these local unless a later Spec/Test-First/Code Round remoteizes them:

- `appaloft serve`
- `appaloft db *`
- `appaloft remote-state *`
- `appaloft init`
- pure SSH `appaloft deploy` and repository config bootstrap
- deployment create/retry/redeploy/rollback/cancel
- resource/server/environment/domain/certificate/deploy-token mutations
- terminal attach and other local gateway operations
- runtime logs, deployment event streaming, and long-running watch behavior unless a remote stream
  contract is explicitly implemented

### Cloud Boundary

Cloud is planned but not complete in the first CLI client slice. The CLI accepts `--mode cloud` only
far enough to return a structured `control_plane_unsupported` auth-phase error before profile
write. A Cloud URL or future default Cloud endpoint may become usable only after a trusted browser,
device, or OIDC auth mechanism and compatibility handshake are accepted.

### Self-Hosted Boundary

Self-hosted is the first practical target for the CLI remote client because `/api/version`,
product-session auth routes, current organization context, and project read routes already exist.
The first implemented slice accepts `APPALOFT_AUTH_COOKIE` or `APPALOFT_TOKEN` as trusted local
credential input, performs `/api/version` plus current organization context verification, then
stores an active local profile. Self-hosted remote dispatch must require HTTPS before release
readiness unless an explicit local-development allowance is used for localhost or loopback.

Self-hosted login does not install a control plane and does not adopt SSH state.

## Profile Store Security Boundary

CLI profile storage belongs to the CLI adapter/client layer, not `core` or `application`.

Profile storage must:

- live outside the repository and source checkout, using an OS config directory, `APPALOFT_HOME`, or
  an equivalent explicit local CLI home;
- prefer OS keychain or encrypted credential storage when available;
- use owner-only file permissions for any file-backed fallback;
- store raw credential material separately from safe profile display metadata when possible;
- record only safe suffixes, token kind, expiry, endpoint, profile name, and last handshake summary
  in list/show/status output;
- avoid writing token material, database URLs, SSH keys, raw cookies, credential ids, tenant/org
  secret identity, provider account ids, or source package secrets to committed files, logs, or
  errors.

Profile files may store a safe organization id or display name returned by the control plane only
as local user context. They must not make repository config select that organization, and they must
not bypass server-side authorization on any remote operation.

## Handshake And Compatibility

Every remote profile must pass a compatibility handshake before remote mutation. The first read-only
slice should also handshake before authenticated remote queries so users get one consistent failure
phase.

The handshake must eventually compare:

- CLI client version;
- control-plane app version and API version;
- minimum supported client version when exposed;
- supported features, including product-session auth, source links, remote operation dispatch,
  streaming support, managed domain mapping, and credential custody;
- selected execution mode and state/control-plane owner;
- auth scope and current organization context.

The current `/api/version` endpoint is the minimum discovery endpoint for the first self-hosted
slice. If it lacks a field needed for a remote operation, the operation must fail with
`control_plane_unsupported` or `control_plane_handshake_failed` before mutation.

## Error Phases

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `cli-profile-input` | No | Profile name, URL, mode, or command input is invalid. |
| `validation_error` | `cli-profile-resolution` | No | The requested profile or active context does not exist, is ambiguous, or lacks required auth. |
| `infra_error` | `cli-profile-store` | Conditional | Local profile or credential store cannot be read, written, locked, or permission-hardened. |
| `control_plane_unavailable` | `control-plane-connect` | Yes | Selected control plane cannot be reached. |
| `control_plane_handshake_failed` | `control-plane-handshake` | Conditional | Client/API/version/feature/auth compatibility failed. |
| `product_auth_missing` | `control-plane-auth` | No | Remote operation requires a product session or token that is not available. |
| `product_auth_invalid` | `control-plane-auth` | No | Stored or supplied token/session is rejected by the control plane. |
| `control_plane_unsupported` | `remote-operation-dispatch` | No | Remote mode was selected for an operation that is not remote-capable in this slice. |

All errors must include sanitized details such as profile name, URL origin, selected mode, client
version, API version, feature flag, and operation key when safe. They must not include raw tokens,
cookies, database URLs, SSH keys, credential payloads, or secret values.

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| CLI-RCPC-SPEC-001 | Login stores a safe profile | A self-hosted URL is supplied and handshake/auth status succeeds | The operator runs `appaloft login --url <url>` | A local profile is stored outside the repository, becomes active, prints sanitized status, and does not mutate projects, resources, deployments, SSH state, or `appaloft.yml`. |
| CLI-RCPC-SPEC-002 | Login failure stores nothing | The URL is unreachable, incompatible, unsafe, or auth fails | The operator runs login | The CLI returns a structured control-plane/profile error and leaves existing profiles unchanged. |
| CLI-RCPC-SPEC-003 | Logout is local credential removal | A profile exists | The operator runs logout for that profile | Local credential/session material is removed or marked logged out, safe metadata may remain, and no server-side business state is mutated. |
| CLI-RCPC-SPEC-004 | Context commands are safe selectors | Multiple profiles exist | The operator lists, shows, and switches context | The active profile changes locally, output is redacted, and no remote business operation runs except optional status refresh. |
| CLI-RCPC-SPEC-005 | Remote project list/show dispatch | A compatible authenticated profile is active | The operator runs `appaloft project list` or `appaloft project show <projectId>` | The CLI calls the remote typed operation client, sends auth, returns the same response shape as HTTP/oRPC, and does not create local shell composition, SSH PGlite sync, or local state mutation. |
| CLI-RCPC-SPEC-006 | Pure CLI remains the default without trust | No profile, URL, env token, or adoption marker exists | The operator runs an ordinary local CLI command | The CLI follows current local/pure SSH behavior, including `ssh-pglite` defaults for SSH deploys. |
| CLI-RCPC-SPEC-007 | Remote errors do not silently fall back | Remote mode/profile is selected and the operation is unsupported or handshake fails | The operator runs a non-remoteized command | The CLI fails before local mutation and reports the remote failure phase. |
| CLI-RCPC-SPEC-008 | `auto` does not adopt | An active profile exists or no trusted source exists | The operator runs with `auto` | With a profile, remote dispatch may be selected after handshake; without a trusted source, local mode is selected. In neither case does the CLI upload or adopt SSH PGlite state. |
| CLI-RCPC-SPEC-009 | Profile store secrets stay local | A command is run from a repository with `appaloft.yml` | The CLI reads/writes profile data | No token, database URL, SSH key, credential id, tenant/org secret identity, or raw secret value is written to committed config or diagnostics. |

## Public Surfaces

- API/oRPC: no new business operation for the first slice; remote dispatch uses existing
  authenticated operation contracts such as `GET /api/projects` and `GET /api/projects/{projectId}`.
- CLI: new login/logout/status/context affordances plus remote dispatch selection for declared
  operations.
- Web/UI: no Web change required for the first slice; Web remains an HTTP/oRPC client.
- Config: no new committed secret fields. Existing `controlPlane.mode/url` policy remains governed
  by ADR-025.
- SDK: remote dispatch should reuse `@appaloft/sdk` generated operation descriptors or an extended
  `@appaloft/orpc/client` with auth support. It must not create CLI-only schemas.
- Future MCP/tools: no new tool semantics; future generated tools continue to use operation catalog
  entries and remote API auth.
- Public docs/help: needs a Docs Round before release, with a stable public anchor for CLI login,
  context selection, local/pure SSH fallback, and remote unsupported-operation errors.

## Non-Goals

- Completing Cloud-assisted Action.
- Implementing SSH PGlite adoption, import, upload, or adoption markers.
- Making `auto` silently contact Cloud or migrate state.
- Putting `controlPlane` on `deployments.create`.
- Storing tokens, database URLs, SSH keys, credential ids, tenant/org secret identity, or raw
  secrets in committed `appaloft.yml`.
- Remoteizing every CLI command in the first slice.
- Creating a new business operation for "CLI login" unless a later auth ADR/spec decides a
  product-level login operation is needed.
- Replacing pure CLI/GitHub Action SSH mode.

## Open Questions

- Which first login credential acquisition path should ship: browser/device flow, product-session
  cookie import, token stdin, or more than one?
- Should public Cloud use an implicit default URL, or should `--url` be required until Cloud auth is
  accepted?
- Should profile credential storage require OS keychain support for release readiness, or is a
  file-backed owner-only fallback acceptable for the first self-hosted slice?
- Should context eventually include project/environment/resource defaults, and what command should
  explicitly set them without making repository config an identity selector?
- Which remote mutation should be the first after read-only `projects.list/show`: `projects.create`,
  `organizations.current-context/switch`, or a resource read path?

## Current Implementation Notes And Migration Gaps

- `packages/adapters/cli/src/control-plane-profile.ts` implements a CLI-adapter-local profile
  store with an owner-only file-backed fallback under `APPALOFT_HOME` or the user's Appaloft home.
  It is intentionally outside `core` and `application`.
- `packages/adapters/cli/src/control-plane-service.ts` implements self-hosted `auth login/status`,
  `logout`, `context list/use/show`, active profile resolution, and first-slice remote project
  dispatch.
- `packages/adapters/cli/src/control-plane-client.ts` reuses `@appaloft/sdk` generated operation
  descriptors for `organizations.current-context`, `projects.list`, and `projects.show`; it does
  not define parallel CLI schemas.
- `apps/shell/src/run.ts` now calls `runStandaloneControlPlaneCli` before SSH PGlite sync or shell
  composition. Remote `project list/show` and profile/context commands therefore avoid local
  runtime setup in the implemented slice.
- `packages/adapters/cli/src/runtime.ts` still executes non-remoteized CLI commands and queries
  through local `CommandBus` and `QueryBus` using the shell composition.
- Cloud browser/device/OIDC login, OS keychain storage, full flags/env/config/`auto` target
  resolution, broad unsupported-command blocking, remote mutations, remote streaming, MCP exposure,
  and SSH PGlite adoption remain deferred governed work.
