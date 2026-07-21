# CLI Remote Control-Plane Client

## Status

- Round: Code Round with Post-Implementation Sync for the ordinary CLI remote client bridge.
- Artifact state: local profile/context, explicit target resolution, pre-dispatch shell routing,
  handshake, default public Cloud endpoint selection, neutral browser auth-session exchange, and
  generic generated SDK non-streaming operation dispatch are implemented and synchronized. OS
  keychain storage, SSH PGlite adoption, source-package quick deploy, streaming/watch, and
  advanced MCP gateway discovery remain deferred.
- Roadmap target: Control-plane mode Phase 1/3 bridge. It makes local CLI login/profile, target
  resolution, and ordinary generated SDK remote operation dispatch concrete without completing
  Cloud-assisted Action, self-hosted adoption, or control-plane-owned source-package execution.
- Compatibility impact: `pre-1.0-policy`; additive public CLI behavior with strict secret and
  fallback boundaries.

## Business Outcome

Operators can keep using Appaloft as a pure local CLI or GitHub Action deployment tool while also
using the CLI as a client for Appaloft Cloud or a self-hosted Appaloft control plane.

After an operator logs in to a trusted control plane, ordinary CLI business commands that map to a
generated non-streaming HTTP/API operation can call the remote typed operation contract instead of
always bootstrapping a local shell composition and dispatching an in-process command or query bus.
The CLI must still use the same application operation keys and input schemas as HTTP/oRPC, Web, SDK,
and future MCP/tool surfaces.

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

`appaloft login` defaults to Appaloft Cloud at `https://app.appaloft.com`. `appaloft login --url
<cloud-or-self-hosted-url>` creates or updates a local CLI profile for an explicit endpoint only
after the endpoint is trusted, reachable, and compatible enough for the selected authentication
flow.

Initial accepted command shapes:

- `appaloft login [--url <url>] [--profile <name>] [--no-browser]`
- `appaloft auth login [--url <url>] [--profile <name>] [--no-browser]` as a namespaced alias when useful for CLI
  organization
- `appaloft auth mcp login [--url <url>] [--profile <name>] [--no-browser]` for remote MCP
  browser handoff that stores a bearer-backed `mcp` profile by default
- `appaloft auth mcp codex install [--profile <name>] [--server-name <name>]` for writing a
  token-free Codex stdio MCP bridge entry after MCP login
- `appaloft auth token login [--stdin | --token-file <path>] [--url <url>] [--profile <name>]`
  for noninteractive scoped token handoff without browser/user-code auth
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
- print the selected Cloud login URL and user code, then wait for explicit Enter before opening the
  browser unless `--no-browser`, `APPALOFT_CLI_OPEN_BROWSER=false`, or CI disables browser opening.

Login must not:

- write to `appaloft.yml`;
- add `controlPlane` to `deployments.create`;
- create projects, environments, resources, servers, source links, deployments, or domain bindings;
- adopt, import, upload, or reconcile SSH PGlite state;
- store raw token material in command history, committed config, logs, diagnostics, or JSON output.

The implemented auth acquisition mechanisms are:

- bearer token input from `APPALOFT_TOKEN`, `APPALOFT_AUTHORIZATION`, stdin, or a user-controlled
  token file for noninteractive automation and AI-agent handoff;
- legacy trusted local product-session cookie compatibility for local operator diagnostics only;
- neutral CLI browser auth-session exchange against the selected endpoint for human login;
- MCP browser auth-session exchange that requests bearer credential material, verifies current
  organization context, and writes a redacted local profile named `mcp` unless `--profile` is set.

`APPALOFT_TOKEN` takes precedence over legacy cookie material. AI-agent guidance must not ask the
agent to drive browser/user-code login, read cookies, or open token file contents. If no profile or
env token exists, the agent asks the user for a scoped token handoff and lets the CLI import it.

Browser auth-session exchange creates a short-lived session, prints `verificationUriComplete` and
the user code, waits for explicit Enter before opening the browser when browser opening is allowed,
polls until the session is authorized, exchanges the authorized session for control-plane credential
material, verifies current organization context, and writes the profile only after that verification
succeeds. If the selected control plane does not support the exchange contract, login fails with
structured `control_plane_auth_unsupported`.

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
contract. It must not redefine transport-only business input schemas for CLI remote mode. The
implemented dispatcher uses the application operation catalog to map constructed command/query
messages to operation keys, then uses generated SDK operation descriptors for method, path, query,
body, auth, and streaming metadata.

Remote dispatch may automatically replay a request only when the operation catalog classifies the
operation as a `query`. A query that receives an HTML gateway response with HTTP status 502, 503,
or 504 is retried once through the same authenticated typed request. Commands are never
automatically replayed, including commands whose HTTP method is `GET` or whose failure is marked
retriable. After the bounded query retry is exhausted, the CLI returns the structured
`control_plane_unexpected_html_response` error with `retryable = true`, safe method/URL/status and
content metadata, and no response body, credential, or secret material.

Commands that explicitly request secret material from standard input must capture it at the shell
entrypoint before parser or runtime initialization. This preserves both pipes and owner-readable
regular files whose descriptors may otherwise be consumed during module initialization. The
captured value is scoped to the selected command handler and typed remote request body, and must not
be rendered in argv, stdout, stderr, diagnostics, or logs.

### Fallback

Fallback is explicit and observable:

- No profile plus no trusted remote selection: use local mode, preserving current pure CLI behavior.
- `auto` plus no trusted remote source: use local mode and report the fallback reason in sanitized
  diagnostics when diagnostics are requested.
- Selected remote mode with missing profile/token, failed handshake, or unsupported operation: fail
  before local mutation. The CLI must not silently rerun the same command locally.
- Explicit local override: use the current local runtime and state backend rules.

## Initial Support Boundary

### Implemented Remote-Capable Slice

The implemented Code Round slice includes:

- local profile store and active context commands;
- `appaloft login/auth login`, `appaloft auth status`, and `appaloft logout/auth logout`;
- compatibility handshake against `/api/version`;
- authenticated product-session status through the existing current organization context contract
  when available;
- full CLI flags/env/profile/config resolver for `none`, `auto`, `cloud`, and `self-hosted`;
- pre-composition shell routing so selected remote commands avoid SSH PGlite sync and local shell
  composition;
- remote dispatch for generated SDK non-streaming command/query operations that are not explicitly
  webhook-signature-only, source-package, local gateway, or streaming/watch operations;
- namespaced ids-only deployment admission through `appaloft deployments create`, which reuses the
  generated `deployments.create` contract after Resource profile and target context already exist;
- clear unsupported-operation errors for local-only commands when remote mode is selected.

`projects.list`, `projects.show`, `projects.rename`, and `servers.list` are covered by automated
tests as proof points for the generic dispatcher, including both read and write operation shapes.

### Commands That Stay Local Or SSH-Only In The First Slice

These commands remain local or explicitly unsupported in selected remote mode unless a later
Spec/Test-First/Code Round remoteizes the missing transport/custody behavior:

- `appaloft serve`
- `appaloft db *`
- `appaloft remote-state *`
- `appaloft init`
- pure SSH `appaloft deploy` and repository config bootstrap
- source-package/config bootstrap quick deploy flows
- local terminal attach and other local gateway operations
- webhook-signature-only ingestion such as `source-events.ingest`
- runtime logs, deployment event streaming, and long-running watch behavior when streaming/follow is
  requested unless a remote stream contract is explicitly implemented

### Cloud Boundary

Cloud is supported as the default login endpoint and as an explicit endpoint mode:
`appaloft login`, `appaloft auth login`, `--mode cloud --url <url>`,
`--control-plane-mode cloud`, or `--control-plane-mode cloud --control-plane-url <url>` may use
trusted local token/session input and the same handshake/profile/dispatch path. When Cloud mode is
selected without a URL, the public CLI uses `https://app.appaloft.com` as the default endpoint.
Browser opening is part of the governed auth-session exchange. The CLI must not claim complete
browser login until session authorization, one-time exchange, and current-context verification all
succeed.

### Self-Hosted Boundary

Self-hosted is the first practical target for the CLI remote client because `/api/version`,
product-session auth routes, current organization context, and generated operation routes already
exist. The implemented slice accepts `APPALOFT_AUTH_COOKIE` or `APPALOFT_TOKEN` as trusted local
automation credential input, and otherwise uses the same neutral auth-session contract when the
selected endpoint supports it. Login performs `/api/version` plus current organization context
verification before storing or using a local profile. Self-hosted remote dispatch must require HTTPS
before release readiness unless an explicit local-development allowance is used for localhost or
loopback.

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

Every remote profile must pass a compatibility handshake before remote mutation. The implemented
bridge also handshakes before authenticated remote queries so users get one consistent failure
phase.

The handshake must eventually compare:

- CLI client version;
- control-plane app version and API version;
- minimum supported client version when exposed;
- supported features, including product-session auth, source links, remote operation dispatch,
  streaming support, managed domain mapping, and credential custody;
- selected execution mode and state/control-plane owner;
- auth scope and current organization context.

The current `/api/version` endpoint is the minimum discovery endpoint for the implemented bridge. If
it lacks a field needed for a remote operation, the operation must fail with
`control_plane_unsupported` or `control_plane_handshake_failed` before mutation.

## Error Phases

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `control-plane-profile-write` or `control-plane-cli-parse` | No | Profile name, URL, mode, or profile command input is invalid. |
| `validation_error` | `control-plane-resolution` | No | Explicit mode/profile/config selection is invalid, including profile-mode mismatch. |
| `control_plane_profile_not_found` | `control-plane-profile-read` or `control-plane-resolution` | No | The requested profile or active context does not exist. |
| `control_plane_profile_store_unavailable` | `control-plane-profile-read` or `control-plane-profile-write` | Conditional | Local profile or credential store cannot be read, written, locked, or permission-hardened. |
| `control_plane_unavailable` | `control-plane-handshake` or `remote-operation-dispatch` | Yes | Selected control plane cannot be reached. |
| `control_plane_handshake_failed` | `control-plane-handshake` | Conditional | Client/API/version/feature/auth compatibility failed. |
| `product_auth_missing` | `control-plane-auth` | No | Remote operation requires a product session or token that is not available. |
| `product_auth_invalid` | `control-plane-auth` | No | Stored or supplied token/session is rejected by the control plane. |
| `control_plane_unsupported` | `control-plane-resolution` | No | Explicit remote mode was selected for a command that remains local-only before dispatch. |
| `control_plane_unsupported` | `remote-operation-dispatch` | No | Remote mode was selected for an operation that is not remote-capable in this slice. |
| `control_plane_auth_unsupported` | `control-plane-auth` | No | The selected endpoint does not support CLI browser auth-session creation. |
| `control_plane_auth_denied` | `control-plane-auth` | No | The browser authorization session was denied by the user. |
| `control_plane_auth_expired` | `control-plane-auth` | No | The browser authorization session expired before exchange. |
| `control_plane_auth_timeout` | `control-plane-auth` | Yes | The CLI stopped polling before the browser authorization session completed. |
| `control_plane_auth_interrupted` | `control-plane-auth` | Yes | The user interrupted polling; the CLI attempted to cancel the auth session and did not write a profile. |

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
| CLI-RCPC-SPEC-005 | Remote generated operation dispatch | A compatible authenticated profile is active | The operator runs a generated non-streaming command/query such as `appaloft project list`, `appaloft project show <projectId>`, `appaloft project rename`, or `appaloft server list` | The CLI performs handshake, calls the remote typed operation client, sends auth, returns the same response shape as HTTP/oRPC, and does not create local shell composition, SSH PGlite sync, or local state mutation. |
| CLI-RCPC-SPEC-006 | Pure CLI remains the default without trust | No profile, URL, env token, or adoption marker exists | The operator runs an ordinary local CLI command | The CLI follows current local/pure SSH behavior, including `ssh-pglite` defaults for SSH deploys. |
| CLI-RCPC-SPEC-007 | Remote errors do not silently fall back | Remote mode/profile is selected and the operation is unsupported or handshake fails | The operator runs a non-remoteized command | The CLI fails before local mutation and reports the remote failure phase. |
| CLI-RCPC-SPEC-008 | `auto` does not adopt | An active profile exists or no trusted source exists | The operator runs with `auto` | With a profile, remote dispatch may be selected after handshake; without a trusted source, local mode is selected. In neither case does the CLI upload or adopt SSH PGlite state. |
| CLI-RCPC-SPEC-009 | Profile store secrets stay local | A command is run from a repository with `appaloft.yml` | The CLI reads/writes profile data | No token, database URL, SSH key, credential id, tenant/org secret identity, or raw secret value is written to committed config or diagnostics. |
| CLI-RCPC-SPEC-010 | Cloud login has a default endpoint | No explicit `--url` is supplied | The operator runs `appaloft login` or `appaloft auth login` | The CLI selects `https://app.appaloft.com`, derives the `cloud` profile name, and uses either trusted env credentials for noninteractive automation or the neutral browser auth-session exchange for human login. |
| CLI-RCPC-SPEC-011 | Explicit Cloud dispatch can use the default endpoint | No profile exists but trusted local Cloud credential input exists | The operator runs a remote-capable command with `--control-plane-mode cloud` and no URL | The CLI builds an ephemeral `cloud` target for `https://app.appaloft.com`, does not write a profile, and fails before local mutation if auth or handshake fails. |
| CLI-RCPC-SPEC-012 | Browser auth session completes login | No local credential is present and the selected control plane supports CLI auth exchange | The operator runs `appaloft login` | The CLI creates an auth session, prints `verificationUriComplete` and the user code, waits for explicit Enter before opening the browser unless disabled, polls pending states, exchanges only after authorization, verifies current context, writes the active profile, and never prints raw credential material. |
| CLI-RCPC-SPEC-013 | Browser auth session failure writes no profile | The auth session is pending, denied, expired, times out, is interrupted, exchange fails, or current context verification fails | The operator runs login | The CLI returns a structured auth error, attempts cancellation on interruption, and does not create, update, or activate a profile. |
| CLI-RCPC-SPEC-014 | Self-hosted auth exchange is capability-gated | A self-hosted URL is supplied and no local credential is present | The operator runs `appaloft login --url <self-hosted-url>` | The CLI uses the same neutral auth-session contract against that endpoint, or returns `control_plane_auth_unsupported` when the endpoint does not support it. |
| CLI-RCPC-SPEC-015 | MCP login requests bearer material | A remote HTTP MCP client needs bearer auth | The operator runs `appaloft auth mcp login` | The CLI creates the same browser auth session with `requestedCredential: "bearer"`, exchanges only after authorization, verifies current context with the bearer, writes a redacted local `mcp` profile by default, and never prints raw credential material. |
| CLI-RCPC-SPEC-016 | Codex MCP install keeps bearer outside Codex config | A local bearer-backed `mcp` profile exists | The operator runs `appaloft auth mcp codex install` | The CLI writes or updates a Codex MCP stdio entry that launches `appaloft mcp remote-stdio --profile mcp`, does not copy bearer material into Codex config or stdout, and fails if the profile is missing or not bearer-backed. |
| CLI-RCPC-SPEC-017 | Unknown command fails before runtime initialization | The operator misspells a top-level command or uses the wrong singular/plural form | The operator runs the invalid command with or without an active remote profile | The CLI returns a structured validation error before creating local shell composition, initializing PGlite, syncing SSH state, handshaking, or dispatching a remote operation. |
| CLI-RCPC-SPEC-018 | Secret stdin survives entrypoint initialization | A remote-capable command explicitly requests stdin and receives it through a pipe or owner-readable regular file | The operator runs a command such as `dependency import --connection-url-stdin` | The shell captures stdin before parser/runtime initialization, dispatches the exact value only in the typed request body, and never emits it through argv, output, diagnostics, or logs. |

## Public Surfaces

- API/oRPC: CLI auth-session creation, polling, exchange, and cancellation are neutral
  infrastructure/auth routes, not product business operations. Remote dispatch uses existing
  authenticated operation
  contracts such as `GET /api/projects`, `GET /api/projects/{projectId}`,
  `POST /api/projects/{projectId}/rename`, and `GET /api/servers`.
- CLI: new login/logout/status/context affordances plus remote dispatch selection for declared
  operations.
- Web/UI: no Web runtime change required; Web remains an HTTP/oRPC client.
- Config: no new committed secret fields. Existing `controlPlane.mode/url` policy remains governed
  by ADR-025.
- SDK: remote dispatch should reuse `@appaloft/sdk` generated operation descriptors or an extended
  `@appaloft/orpc/client` with auth support. It must not create CLI-only schemas.
- MCP/tools: no new tool semantics; generated tools continue to use operation catalog entries and
  remote API auth. Remote HTTP MCP bootstrap can use `appaloft auth mcp login` to obtain a local
  bearer profile through the same auth-session exchange contract, then `appaloft auth mcp codex
  install` to configure Codex through a token-free local stdio bridge.
- Public docs/help: covered by the CLI reference anchors
  `#cli-remote-control-plane-login` and `#cli-remote-control-plane-dispatch`.

## Non-Goals

- Completing Cloud-assisted Action.
- Implementing SSH PGlite adoption, import, upload, or adoption markers.
- Making `auto` silently contact Cloud or migrate state.
- Putting `controlPlane` on `deployments.create`.
- Storing tokens, database URLs, SSH keys, credential ids, tenant/org secret identity, or raw
  secrets in committed `appaloft.yml`.
- Remoteizing local-only, source-package, webhook-signature-only, or streaming/watch CLI behavior
  without the required transport and custody specs.
- Creating a new business operation for "CLI login" unless a later auth ADR/spec decides a
  product-level login operation is needed.
- Replacing pure CLI/GitHub Action SSH mode.

## Open Questions

- Should profile credential storage require OS keychain support for release readiness, or is a
  file-backed owner-only fallback acceptable for the current bridge?
- Should context eventually include project/environment/resource defaults, and what command should
  explicitly set them without making repository config an identity selector?
- Which local/source/streaming capability should be remoteized next: quick deploy source-package,
  remote streaming logs/events, terminal attach gateway, or MCP/public tool exposure?

## Current Implementation Notes And Migration Gaps

- `packages/adapters/cli/src/control-plane-profile.ts` implements a CLI-adapter-local profile
  store with an owner-only file-backed fallback under `APPALOFT_HOME` or the user's Appaloft home.
  It is intentionally outside `core` and `application`.
- `packages/adapters/cli/src/control-plane-service.ts` implements `auth login/status`, `logout`,
  `context list/use/show`, default Appaloft Cloud login endpoint selection, browser-open guidance,
  and active profile resolution for self-hosted and Cloud profiles.
- `packages/adapters/cli/src/control-plane-client.ts` reuses `@appaloft/sdk` generated operation
  descriptors for handshake and remote operation dispatch; it does not define parallel CLI schemas.
- `packages/adapters/cli/src/control-plane-target.ts` implements flags/env/profile/config target
  resolution, default Appaloft Cloud endpoint selection for explicit Cloud mode, and strips global
  control-plane options before normal CLI parsing.
- `packages/adapters/cli/src/remote-cli-program.ts` implements the remote CLI runtime over the
  generated SDK operation descriptors, including dispatch-time handshake, path/query/body mapping,
  streaming/follow rejection, and webhook-signature rejection.
- `apps/shell/src/run.ts` now calls `runStandaloneControlPlaneCli` and `resolveCliExecutionTarget`
  before SSH PGlite sync or shell composition. Selected remote business commands and
  profile/context commands therefore avoid local runtime setup.
- `packages/adapters/cli/src/runtime.ts` still executes non-remoteized CLI commands and queries
  through local `CommandBus` and `QueryBus` using the shell composition.
- OS keychain storage, source-package quick deploy, remote streaming/watch, terminal attach
  gateway, MCP exposure, and SSH PGlite adoption remain deferred governed work.
