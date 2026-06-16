# Control-Plane Modes Spec-Driven Test Matrix

## Normative Contract

Control-plane mode tests must prove that execution ownership and state/control-plane ownership are
resolved before mutation and remain independent.

Canonical assertions:

- default config-aware SSH deploys remain pure Action/CLI with `none` plus SSH-server `ssh-pglite`;
- repository config may choose connection policy, not project/resource/server/credential identity;
- `auto` never contacts or adopts a control plane without a trusted source;
- Cloud/self-hosted modes fail before mutation until handshake support exists;
- once supported, Cloud/self-hosted handshakes gate all mutations;
- after adoption, direct SSH PGlite mutation is blocked unless explicitly selected as break-glass;
- Web, CLI, Action, API, and future MCP surfaces do not drift into separate semantics.

## Global References

This matrix inherits:

- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [ADR-042: Self-Hosted Instance Bootstrap Proxy](../decisions/ADR-042-self-hosted-instance-bootstrap-proxy.md)
- [Control-Plane Mode Selection And Adoption](../workflows/control-plane-mode-selection-and-adoption.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Deployment Config File Test Matrix](./deployment-config-file-test-matrix.md)
- [Quick Deploy Test Matrix](./quick-deploy-test-matrix.md)
- [Self-Hosted Auth Test Matrix](./self-hosted-auth-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)

## Mode Resolution Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONTROL-PLANE-MODE-001 | unit | Default mode is none | Config has no `controlPlane`, no control-plane env, and SSH target exists | Resolver selects control-plane mode `none`, execution owner from entrypoint, state backend `ssh-pglite`, and remote state lifecycle required | None | Mode resolution only |
| CONTROL-PLANE-MODE-002 | unit | Config `none` preserves pure SSH | Config declares `controlPlane.mode: none` and SSH target exists | Resolver selects `none` and does not require Cloud token or `DATABASE_URL` | None | Mode resolution -> remote SSH state lifecycle |
| CONTROL-PLANE-MODE-003 | unit | Config `auto` falls back safely | Config declares `auto` but no trusted endpoint/login/adoption marker exists | Resolver selects effective mode `none` and records fallback reason in sanitized diagnostics | None | Mode resolution only |
| CONTROL-PLANE-MODE-004 | unit | Env overrides config | Config declares `none`, but `APPALOFT_CONTROL_PLANE_MODE=self-hosted` and URL are present | Resolver selects self-hosted from trusted env and records env origin | None or later handshake failure | Mode resolution -> handshake gate |
| CONTROL-PLANE-MODE-005 | unit | CLI/action input overrides env and config | Config/env disagree with explicit CLI or deploy-action input | Resolver uses explicit trusted entrypoint input | None or later handshake failure | Mode resolution -> handshake gate |
| CONTROL-PLANE-MODE-006 | integration | Invalid config mode rejected | Config contains unknown control-plane mode | Workflow stops before mutation | `validation_error`, phase `control-plane-config` | No write commands |
| CONTROL-PLANE-MODE-007 | integration | Control-plane identity fields rejected | Config contains project id, resource id, server id, credential id, org id, tenant id, or project slug under `controlPlane` | Workflow stops before mutation | `validation_error`, phase `control-plane-config` or `config-identity` | No write commands |
| CONTROL-PLANE-MODE-008 | integration | Control-plane secret fields rejected | Config contains token, database URL, SSH key, certificate material, or raw credential under `controlPlane` | Workflow stops before mutation and diagnostics are sanitized | `validation_error`, phase `control-plane-config` or `config-secret-validation` | No write commands |
| CONTROL-PLANE-MODE-009 | integration | Unsafe control-plane URL rejected | Config `controlPlane.url` is malformed, non-HTTPS when policy requires HTTPS, contains credentials, or contains path/query fragments not accepted by policy | Workflow stops before mutation | `validation_error`, phase `control-plane-config` | No write commands |

## State Backend Ownership Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONTROL-PLANE-STATE-001 | unit/integration | SSH PGlite remains authoritative in standalone mode | A deploy/source-link/preview-cleanup command targets SSH with no control-plane URL or database URL | Resolver selects `ssh-pglite`, prepares remote state, writes `backend.json`, uses remote PGlite/source-links/server-applied-routes, and applies sync-back retention | None | Resolve backend -> SSH state marker/lock -> remote PGlite sync -> command -> retained sync backup cleanup |
| CONTROL-PLANE-STATE-002 | unit | Postgres control plane skips remote PGlite backup | A deploy command selects `postgres-control-plane` through flag/env and includes an SSH host for compatibility context | The workflow may read `backend.json`, returns no remote PGlite sync session, creates no `state/backups/sync-*`, and does not archive/upload PGlite/source-links/routes | None | Resolve backend -> optional marker read -> no remote PGlite sync |
| CONTROL-PLANE-STATE-003 | unit/integration | Backend marker mismatch is structured | Console/Postgres path discovers SSH state root marker `stateBackend: ssh-pglite` | Workflow stops before dual-write, backup, source-link mutation, route mutation, or deploy mutation | `server_state_backend_mismatch`, phase `server-state-backend`, reason `SERVER_STATE_BACKEND_MISMATCH` | Marker read -> structured reject -> no mutation |
| CONTROL-PLANE-STATE-004 | integration | Preview cleanup preserves standalone live PGlite state | A preview cleanup or runtime marker prune runs against an SSH standalone server with live `state/pglite`, source links, routes, locks, and sync revision | Cleanup removes only preview-owned runtime/route/source artifacts or old marker archives; live PGlite state remains present | None | Preview/source fingerprint cleanup or explicit marker prune -> live state excluded |

## Handshake Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONTROL-PLANE-HANDSHAKE-001 | contract | Cloud mode requires trusted auth | `mode: cloud` is selected without token/OIDC/login support | Workflow stops before mutation | `validation_error`, phase `control-plane-resolution` | No write commands |
| CONTROL-PLANE-HANDSHAKE-002 | contract | Self-hosted mode requires endpoint | `mode: self-hosted` is selected without URL or trusted local profile | Workflow stops before mutation | `validation_error`, phase `control-plane-resolution` | No write commands |
| CONTROL-PLANE-HANDSHAKE-003 | contract | Unsupported mode fails before mutation | Cloud/self-hosted is selected before API handshake implementation exists | Workflow returns unsupported control-plane error before identity or deployment mutation | `control_plane_unsupported`, phase `control-plane-capability` | No write commands |
| CONTROL-PLANE-HANDSHAKE-004 | integration | Version mismatch fails fast | Control plane responds with minimum client version greater than installed CLI/action version | Workflow stops before mutation with structured version details | `control_plane_handshake_failed`, phase `control-plane-handshake` | Handshake only |
| CONTROL-PLANE-HANDSHAKE-005 | integration | Feature mismatch fails fast | Control plane lacks required feature such as source links or managed config domain mapping | Workflow stops before the unsupported branch mutates state | `control_plane_handshake_failed` or `control_plane_unsupported`, phase `control-plane-handshake` or `control-plane-capability` | Handshake -> no downstream mutation |
| CONTROL-PLANE-HANDSHAKE-006 | integration | Cloud-assisted Action keeps Action execution | Cloud mode is selected and handshake succeeds with Action execution feature | GitHub Action remains execution owner while Cloud owns state/coordination/source links and receives final report | None | Handshake -> Cloud identity/coordination -> Action execution -> Cloud report |
| CONTROL-PLANE-HANDSHAKE-007 | integration | Action-custodied SSH credentials stay outside Cloud | Cloud-assisted Action uses SSH key from GitHub Secrets | Cloud receives no raw SSH key; Action writes key to temp file and only reports sanitized execution metadata | None | Action secret mapping -> Cloud handshake -> SSH execution |
| CONTROL-PLANE-HANDSHAKE-008 | wrapper contract | Self-hosted Action server API trigger | `control-plane-mode: self-hosted` is selected with URL and an existing source link for the repository/config fingerprint | Action performs `/api/version`, then `POST /api/action/deployments/from-source-link`, writes deployment id, deployment detail URL, and console URL outputs, and does not invoke CLI or SSH | None | Version check -> source-link deployment API request |
| CONTROL-PLANE-HANDSHAKE-009 | wrapper contract | Self-hosted Action rejects direct state/profile inputs | `control-plane-mode: self-hosted` is selected without `server-config-deploy` and includes ssh credentials, `state-backend`, non-default source, runtime/profile/env inputs, preview route inputs, or `require-preview-url` | Wrapper stops before API mutation because server mode cannot mix server-owned state with direct CLI/SSH state ownership or runner-applied profile mutation. `secret-variables`, preview route inputs, and preview environment variables are allowed only when `server-config-deploy=true` so the Action can send transient values to the server API. | `validation_error`, phase `control-plane-resolution` or wrapper validation | No API mutation |
| CONTROL-PLANE-HANDSHAKE-010 | HTTP/application contract | Self-hosted Action bootstraps missing source link with advanced trusted ids | `control-plane-mode: self-hosted` is selected with URL and complete trusted project/environment/resource/server ids; no source link exists yet | Action performs `/api/version`, then `POST /api/action/deployments/from-source-link`; oRPC dispatches `CreateActionSourceLinkDeploymentCommand`; application code dispatches ids-only `deployments.create` and persists the source link for later id-free runs | None, or validation when explicit ids are incomplete or conflict with an existing source link | Version check -> source-link deployment command -> `deployments.create` -> source-link upsert |
| CONTROL-PLANE-HANDSHAKE-011 | wrapper contract | Self-hosted Action preview cleanup | `control-plane-mode: self-hosted` is selected with URL and preview source context | Action performs `/api/version`, then `POST /api/deployments/cleanup-preview`, writes cleanup status and console URL outputs, and does not invoke CLI or SSH | None | Version check -> preview cleanup API request |
| CONTROL-PLANE-HANDSHAKE-012 | wrapper contract | Self-hosted Action preview deploy trigger | `control-plane-mode: self-hosted` is selected with URL, `preview=pull-request`, `preview-id`, and a resolvable preview target from source-link state, token scope, source binding, or advanced trusted ids | Action derives a preview-scoped source fingerprint, performs `/api/version`, then `POST /api/action/deployments/from-source-link`, writes preview id, deployment id, deployment detail URL, and console URL outputs, and does not invoke CLI or SSH | None, or validation when direct preview route/profile inputs are supplied | Version check -> preview source-link deployment API request |
| CONTROL-PLANE-HANDSHAKE-013 | wrapper contract | Self-hosted Action server config feature gate | The active explicit `server-config-deploy` mode is selected and the self-hosted `/api/version` handshake lacks source package or server-side config bootstrap support | Wrapper stops before source package upload/reference handoff and before API mutation | `control_plane_unsupported` or `control_plane_handshake_failed`, phase `control-plane-handshake` or `control-plane-capability` | Version check -> feature check -> no source package or mutation |
| CONTROL-PLANE-HANDSHAKE-014 | wrapper contract | Self-hosted Action server config runner boundary | The active explicit `server-config-deploy` mode is selected with a compatible server | Wrapper performs handshake, source package preparation or reference handoff, optional `ci-env:` secret resolution for server-side config bootstrap, API request, outputs, and optional feedback only; the deployment path does not invoke the CLI, open SSH, select `state-backend`, or mutate SSH-server PGlite. Current composite wrapper setup may still install the released binary before dispatch. | Missing or unsupported `secret-variables` references fail before API mutation with sanitized key/ref details | Handshake -> source package handoff -> server config deploy API request |
| CONTROL-PLANE-HANDSHAKE-015 | HTTP/adapter contract | Server config deploy validates source package manifest | A server config deploy request includes config path, source root, revision, checksum, size, and source fingerprint metadata | API validates manifest shape, path boundaries, checksum/size policy, and config path before command dispatch | `validation_error`, phase `source-package-validation` | Parse request -> validate package manifest -> no mutation on invalid package |
| CONTROL-PLANE-HANDSHAKE-016 | HTTP/application contract | Server config deploy rejects identity and secrets in config | Source package contains committed config with project/resource/server/destination ids, tokens, database URLs, raw secrets, or credential material | Server-side config bootstrap fails before source-link, resource profile, route, or deployment mutation | `validation_error`, `unsupported_config_field`, or `raw_secret_config_field`, phase `config-bootstrap` or `config-identity` | Package validated -> config parsed -> validation failure -> no mutation |
| CONTROL-PLANE-HANDSHAKE-017 | integration | Server config deploy applies config through explicit operations | Source package and config are valid and trusted source context resolves existing, token-scoped, or bootstrap-allowed identity; GitHub Action trusted context may include repository/ref/revision metadata and usually omits Appaloft ids | Server resolves context through `ResolveActionServerConfigDeploymentTargetCommand`, accepts trusted GitHub metadata as scope/conflict-check facts, applies resource/environment/profile changes, plain env values, resolved `ci-env:` secret references, managed domains, and pull request preview transient env/route values through explicit commands, then dispatches ids-only `deployments.create`; preview route requests do not apply committed production domains | Missing required `ci-env:` values or unsupported secret resolvers fail before mutation with `validation_error`, phase `config-secret-resolution`; preview route without pull request context fails with `validation_error`, phase `preview-config-resolution` | Handshake -> package accepted -> config bootstrap -> source-link target command -> profile/env/secret/route operations -> `deployments.create` |
| CONTROL-PLANE-HANDSHAKE-018 | application/HTTP contract | Action target resolves without ids | Source-link deploy or server-config deploy is called with no Appaloft ids and either an existing source link or a deploy token whose scope uniquely identifies project/environment/resource/server | Application target resolution succeeds, may persist the source link after admission when token scope supplied the missing target, and final deployment dispatch remains ids-only | None | Auth -> source-link target command -> existing link or token-scope target -> `deployments.create` -> optional source-link upsert |
| CONTROL-PLANE-HANDSHAKE-019 | application/HTTP contract | Action unresolved target fails safely | Source-link deploy or server-config deploy is called with no Appaloft ids, no existing source link, no unique token-scoped target, and no accepted source/repository binding | Request fails before config/profile/route/deployment mutation with safe next actions to create/link a source binding, run source-link relink, or pass one-time bootstrap ids | `action_deployment_target_unresolved`, phase `source-link-resolution` | Auth -> source-link target command -> unresolved -> no mutation |
| CONTROL-PLANE-HANDSHAKE-020 | application/HTTP contract | Explicit bootstrap ids conflict-check | Explicit Action ids or `controlPlane.deploymentContext` are supplied and an existing source link or deploy-token scope selects a different target | Request fails before deployment, profile, route, or source-link mutation; ids outside token scope return 403 | `action_deployment_target_conflict`, phase `source-link-resolution`, or `action_auth_forbidden`, phase `action-authorization` | Auth -> source-link target command -> conflict reject -> no mutation |
| CONTROL-PLANE-HANDSHAKE-021 | wrapper + HTTP contract | Server config preview target from policy without explicit resource id | `server-config-deploy=true`, `preview=pull-request`, trusted repository/base-ref context, and optional project/environment/server hints are supplied, but no explicit resource id is supplied | Wrapper calls `/api/action/deployments/from-config-package` without requiring a resource id; server-side preview policy resolves the complete preview target before ids-only deployment admission | Missing repository/base-ref or unmatched preview policy falls back to structured target-resolution failure before mutation | Wrapper payload -> preview policy query -> complete target command -> config bootstrap -> `deployments.create` |

## CLI Remote Client Matrix

These rows are governed by
[CLI Remote Control-Plane Client](../specs/074-cli-remote-control-plane-client/spec.md).

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONTROL-PLANE-CLI-001 | CLI/unit | Login writes safe profile after handshake | A self-hosted URL is supplied, `/api/version` is reachable, and accepted auth/session verification succeeds | `appaloft login --url` or `appaloft auth login --url` writes a local uncommitted profile, marks it active, and prints sanitized endpoint/profile/current-context details | None | URL validation -> version discovery -> auth/session verification -> profile store write |
| CONTROL-PLANE-CLI-002 | CLI/unit | Failed login leaves profile store unchanged | URL validation, version discovery, compatibility check, or auth/session verification fails | The CLI returns a structured error and does not create, update, or activate a profile | `validation_error`, `control_plane_unavailable`, `control_plane_handshake_failed`, `product_auth_missing`, or `product_auth_invalid` with phase `control-plane-profile-write`, `control-plane-cli-parse`, `control-plane-handshake`, or `control-plane-auth` | URL/handshake/auth failure -> no profile write |
| CONTROL-PLANE-CLI-003 | CLI/unit | Logout removes only local credential state | A profile exists and may be active | `appaloft logout` or `appaloft auth logout` removes or invalidates local credential/session material without revoking deploy tokens or mutating remote project/resource/deployment state | None or profile not found validation | Profile resolution -> local credential removal -> optional safe metadata update |
| CONTROL-PLANE-CLI-004 | CLI/unit | Status and context output are redacted | A profile contains token/session material | `appaloft auth status`, `appaloft context show`, or `appaloft context list` runs | Output includes safe profile, URL, mode, current user/org summary, token safe suffix/reference metadata, and handshake status only | None or auth/profile error | Profile read -> optional status refresh -> redacted output |
| CONTROL-PLANE-CLI-005 | CLI/unit | Context use switches active profile locally | Multiple profiles exist | `appaloft context use <profile>` runs | The active context switches locally and no business operation is dispatched except optional status refresh | None, `validation_error` with phase `control-plane-cli-parse`, or `control_plane_profile_not_found` with phase `control-plane-profile-read` | Profile resolution -> active context write |
| CONTROL-PLANE-CLI-006 | shell/CLI integration | Remote generated SDK dispatch | A compatible authenticated profile is active and a generated SDK non-streaming operation is remote-capable | Commands such as `appaloft project list`, `appaloft project show <projectId>`, `appaloft project rename`, or `appaloft server list` call the typed remote API client, send auth, return the HTTP/oRPC-compatible shape, and do not create local shell composition or SSH PGlite sync | Remote structured errors pass through with sanitized details | Target resolution -> dispatch-time handshake -> typed remote command/query -> render output |
| CONTROL-PLANE-CLI-007 | shell/CLI integration | No trusted remote source preserves local default | No profile, URL, token, or adoption marker exists, and mode is omitted or `auto` | Ordinary CLI commands use local dispatch; SSH-targeted deploys keep `ssh-pglite` defaults | None | Target resolution -> local dispatch and local state backend rules |
| CONTROL-PLANE-CLI-008 | CLI/integration | Unsupported remote operation fails before local mutation | Remote mode/profile is selected for a local-only, source-package, webhook-signature-only, streaming/follow, terminal attach, or otherwise unsupported command | The CLI fails before local bus dispatch, shell composition mutation, SSH state sync, or unsupported API mutation | `control_plane_unsupported`, phase `control-plane-resolution` or `remote-operation-dispatch`; `validation_error`, phase `control-plane-resolution` for mode/profile mismatch | Target resolution or remote capability check -> no local mutation |
| CONTROL-PLANE-CLI-009 | unit/import-boundary | Profile store secret boundary | Profile commands run inside a repository with `appaloft.yml` | No token, database URL, SSH key, credential id, tenant/org secret identity, provider account id, or raw secret is written to committed config, logs, diagnostics, or JSON output | `control_plane_profile_store_unavailable`, phase `control-plane-profile-read` or `control-plane-profile-write` only when local secure storage fails | Profile store read/write -> redacted diagnostics |
| CONTROL-PLANE-CLI-010 | import-boundary/contract | Remote dispatch reuses typed client contracts | A CLI command is marked remote-capable | The remote dispatcher uses `@appaloft/sdk` generated operation descriptors or authenticated `@appaloft/orpc/client` contract metadata and does not define parallel CLI schemas | Boundary violation test failure | Operation key/input -> typed client descriptor -> remote request |
| CONTROL-PLANE-CLI-011 | contract | Remote auth and handshake errors remain structured | Stored profile auth is missing/invalid or endpoint versions/features are incompatible | The CLI returns structured server/client error code, category, phase, retriable flag, and sanitized details without falling back to local dispatch | `product_auth_missing`, `product_auth_invalid`, `control_plane_handshake_failed`, or `control_plane_unsupported` | Target resolution -> handshake/auth -> structured error -> no local mutation |
| CONTROL-PLANE-CLI-012 | CLI/unit | Login defaults to Appaloft Cloud browser auth exchange | No `--url` is supplied and no local env credential exists | `appaloft login` or `appaloft auth login` selects `https://app.appaloft.com`, creates a CLI auth session, prints `verificationUriComplete` and the user code, waits for explicit Enter before opening the browser when browser opening is enabled, polls pending then authorized, exchanges once, verifies current organization context, writes the active `cloud` profile, and does not print raw credential material | Browser-open failure is non-fatal and prints the URL/code; profile write happens only after exchange and current-context verification | Default Cloud endpoint -> auth session create -> print/confirm/open -> poll -> exchange -> version/current-context -> profile store write |
| CONTROL-PLANE-CLI-013 | CLI/unit | Browser auth exchange failure writes no profile | A CLI auth session is pending, denied, expired, times out, is interrupted, exchange fails, or current-context verification fails | Login returns a structured auth error, attempts cancel on interrupt when possible, and leaves existing profiles unchanged | `control_plane_auth_denied`, `control_plane_auth_expired`, `control_plane_auth_timeout`, `control_plane_auth_interrupted`, `control_plane_auth_exchange_failed`, `product_auth_invalid`, or `product_auth_missing`, phase `control-plane-auth` | Auth session create/poll/exchange/failure -> optional cancel -> no profile write |
| CONTROL-PLANE-CLI-014 | CLI/unit | Self-hosted auth exchange is capability-gated | A self-hosted URL is supplied and no local env credential exists | `appaloft login --url <self-hosted-url>` uses the same neutral CLI auth session contract; if the endpoint does not support session creation, the CLI returns structured unsupported and does not ask for env credential paste as the default human flow | `control_plane_auth_unsupported`, phase `control-plane-auth` | URL validation -> auth session create or unsupported -> no profile write on unsupported |
| CONTROL-PLANE-CLI-016 / CLOUD-AI-CLI-AUTH-004 | CLI/unit | Scoped token login writes safe profile without browser auth | `APPALOFT_TOKEN`, stdin, or a user-controlled token file supplies bearer token material | `appaloft auth token login` validates the endpoint, verifies current organization context, writes a redacted local profile, never sends browser auth-session requests, and does not print raw token material | `control_plane_auth_missing`, `validation_error`, `control_plane_handshake_failed`, or `product_auth_invalid`; conflicting `--stdin` and `--token-file` fails before profile write | Token source resolution -> version/current-context -> profile store write |

## Self-Hosted Install Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONTROL-PLANE-INSTALL-001 | script contract | Self-hosted Docker installer selects persistence backend and orchestrator | `install.sh` runs with default options, `--database pglite`, or `--orchestrator swarm` | Default install writes a PostgreSQL Compose stack; PGlite install writes no database URL or PostgreSQL service and mounts durable Appaloft data at `/appaloft-data`; Swarm install writes the same safe stack shape, constrains local-volume state to manager nodes, requires an existing manager unless `--swarm-init` is explicit, and deploys through `docker stack deploy` | Invalid database/orchestrator/port, Docker unavailable, Compose plugin unavailable for Compose, or Swarm manager unavailable without explicit init | Validate inputs -> write compose/env -> docker compose pull/up or docker stack deploy |
| CONTROL-PLANE-INSTALL-002 | workflow/wrapper contract | Repository console deploy workflow or deploy action installs the control plane over SSH | `.github/workflows/deploy-console.yml` is dispatched with trusted SSH host/key settings, or `appaloft/deploy-action` runs with `command=install-console` and trusted SSH inputs | Workflow copies `install.sh`, or the action downloads the release installer on the SSH host; both run it with configurable version/origin/database/orchestrator/proxy/domain, default database to PostgreSQL, default direct host port to `3721`, default proxy to Traefik, verify `/api/health`, output the console URL, and keep secrets out of repository config | Missing SSH variable/secret/input, invalid version/database/orchestrator/port/proxy/domain, installer download failure, or health timeout | Resolve trusted settings -> transfer or download installer -> remote install/upgrade -> health check |
| CONTROL-PLANE-INSTALL-003 | config/parser + wrapper contract | Console install settings are repository-configurable | `command=install-console` runs with a selected config that contains non-secret `controlPlane.url` and `controlPlane.install.*` settings | The wrapper derives console origin, database, Docker orchestrator, proxy mode, host/port, image, installer URL, and Swarm/Compose names from config when matching Action inputs are omitted; explicit Action inputs remain trusted overrides, SSH host/key and API tokens stay outside config, and pure SSH CLI deploy remains separate | Invalid install database/orchestrator/proxy/port/URL, raw secret fields, or missing SSH target | Config parse -> trusted SSH input resolution -> remote installer invocation -> health check |
| CONTROL-PLANE-INSTALL-004 | script contract | Installer-owned console domain route | `install.sh` runs with `--domain console.example.com` and default proxy mode | Installer writes `APPALOFT_WEB_ORIGIN=https://console.example.com`, starts the resident Traefik edge, attaches Appaloft to the shared edge network, adds HTTP-to-HTTPS and TLS route labels for the Appaloft instance console, and keeps direct host access on `3721` as the fallback. The route is not represented as a Resource, DomainBinding, deployment snapshot, or project route. | Invalid domain, unsupported proxy mode, occupied host ports, Docker/Compose/Swarm failure, or ACME/DNS failure after startup | Validate domain/proxy -> write compose/env -> start Appaloft and Traefik -> health check |
| CONTROL-PLANE-INSTALL-005 | HTTP/adapter contract | Self-hosted console static deep-link refresh | The Appaloft app serves packaged or embedded Web console static assets after install, and the operator refreshes a clean URL or dynamic console route | Static route files such as `/domain-bindings` resolve before SPA fallback; dynamic console routes such as project/environment/resource detail return the SvelteKit `200.html` SPA fallback instead of the prerendered home `index.html`; docs assets under `/docs/*` remain separate. | Missing Web static assets return the existing backend fallback or `404` for missing extension-bearing assets. | HTTP request -> exact asset or clean-url HTML lookup -> directory index lookup -> `200.html` SPA fallback -> `index.html` compatibility fallback |
| CONTROL-PLANE-INSTALL-006 | HTTP/adapter contract | Public console readiness masks private database location | Self-hosted console readiness details include database driver, mode, and an internal database location or connection URL | `/api/readiness` exposes only safe readiness details such as database driver and mode; database paths, URLs, credentials, and `databaseLocation` stay out of public responses. | None | Doctor query -> public HTTP readiness projection -> sensitive detail allowlist |
| CONTROL-PLANE-INSTALL-007 | workflow contract | Repository console preview workflow is not installed by default | A same-repository pull request changes Web console, shared frontend contracts, shell/backend code, or repository deploy plumbing | This public repository does not carry a PR-triggered console preview deployment workflow. Downstream repositories that want preview deploys must add their own workflow and own the SSH/runtime capacity. | None | No repository-owned console preview deployment action is dispatched |

## Adoption Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONTROL-PLANE-ADOPT-001 | integration | Adoption exports SSH state under state-root coordination | Existing SSH-server PGlite state is adopted into a control plane | Workflow acquires SSH backend coordination, exports state/source links/routes, imports to control plane, and writes adoption marker | None | Acquire SSH state-root coordination -> export -> import -> marker -> release |
| CONTROL-PLANE-ADOPT-002 | integration | Interrupted adoption is recoverable | Import succeeds but marker write fails, or marker write succeeds but verification fails | Workflow records recovery metadata and does not report adoption complete | `infra_error`, phase `control-plane-adoption` | Acquire coordination -> partial import/marker -> recovery marker |
| CONTROL-PLANE-ADOPT-003 | integration | Auto mode detects adoption marker | SSH server has compatible adoption marker and entrypoint selects `auto` | Resolver selects the marked control plane and API mode instead of direct SSH PGlite mutation | None or handshake error | Marker read -> handshake -> API mode |
| CONTROL-PLANE-ADOPT-004 | integration | Direct PGlite mutation blocked after adoption | SSH server has compatible adoption marker, but entrypoint attempts default direct SSH state mutation | Workflow stops before mutating remote PGlite | `control_plane_adoption_required`, phase `control-plane-resolution` | Marker read -> no direct mutation |
| CONTROL-PLANE-ADOPT-005 | integration | Break-glass direct mutation is explicit | Operator supplies accepted break-glass flag and control plane is not concurrently using the PGlite state | Workflow records break-glass diagnostics and proceeds under backend state-root coordination | None or coordination/conflict error | Marker read -> break-glass confirmation -> acquire coordination -> mutation |

## Entrypoint Matrix

| Test ID | Preferred automation | Entry | Expected test focus |
| --- | --- | --- |
| CONTROL-PLANE-ENTRY-001 | e2e-preferred | CLI config deploy | CLI resolves config/env/flags into the same mode decision before state/backend/source-link/deploy steps. |
| CONTROL-PLANE-ENTRY-002 | contract | Deploy action wrapper | Action inputs mirror CLI mode selection and default to pure SSH `none` when absent. |
| CONTROL-PLANE-ENTRY-003 | contract | HTTP `deployments.create` | Strict deployment command rejects control-plane/config fields; control-plane mode remains entry workflow state. |
| CONTROL-PLANE-ENTRY-004 | e2e-preferred | Web future selector | Web exposes read-only mode until selection is implemented; when implemented it uses an explicit select/radio and does not call hidden deployment fields. |
| CONTROL-PLANE-ENTRY-005 | contract | Future MCP/tool | Tool parameters map to trusted entrypoint overrides over the same resolver, not separate deployment semantics. |

## Current Implementation Notes And Governed Follow-Ups

Current implementation covers the self-hosted Docker installer and console workflow rows
(`CONTROL-PLANE-INSTALL-001` and `CONTROL-PLANE-INSTALL-002`) in `scripts/test/install-sh.test.ts`,
`scripts/test/deploy-console-workflow.test.ts`, and `scripts/test/deploy-action-wrapper.test.ts`.
`packages/deployment-config/test/appaloft-config.test.ts` and
`scripts/test/deploy-action-wrapper.test.ts` cover config-driven console install settings
(`CONTROL-PLANE-INSTALL-003`). `scripts/test/install-sh.test.ts` covers the first
installer-owned Traefik console domain route contract (`CONTROL-PLANE-INSTALL-004`).
`packages/adapters/http-elysia/test/static-assets.test.ts` covers self-hosted console static
deep-link refresh behavior (`CONTROL-PLANE-INSTALL-005`).
`packages/adapters/http-elysia/test/readiness.test.ts` covers public readiness detail masking
(`CONTROL-PLANE-INSTALL-006`).
The repository no longer carries a PR-triggered console preview deployment workflow for
`CONTROL-PLANE-INSTALL-007`; downstream repositories that want this behavior must install and own
their own preview workflow.
`scripts/test/deploy-action-wrapper.test.ts` also covers unsupported control-plane input rejection
(`CONTROL-PLANE-ENTRY-002`), self-hosted source-link deployment and preview cleanup
(`CONTROL-PLANE-HANDSHAKE-011` and `CONTROL-PLANE-HANDSHAKE-012`), and the first Action Server
Config Deploy wrapper gate/dry-run rows (`CONTROL-PLANE-HANDSHAKE-013` and
`CONTROL-PLANE-HANDSHAKE-014`). `packages/orpc/test/deployment-create.http.test.ts` also covers
the first server endpoint source package validation slice (`CONTROL-PLANE-HANDSHAKE-015`), including
safe path rejection before command dispatch and the explicit `config-bootstrap` migration-gap error
after package validation. The same file now covers server-side committed config identity/secret
rejection (`CONTROL-PLANE-HANDSHAKE-016`) through a hermetic source package config reader.
It also covers the first `CONTROL-PLANE-HANDSHAKE-017` existing-resource slice: accepted config that
does not require profile application dispatches ids-only `deployments.create`, can reuse existing
source-link state after bootstrap, bootstraps source-link context from complete trusted ids, and
applies runtime/network/health profile fields through explicit resource commands before deployment
admission. `packages/application/test/action-source-link-deployment.test.ts` covers
`CONTROL-PLANE-HANDSHAKE-018` through `CONTROL-PLANE-HANDSHAKE-020`, proving id-free existing
source-link resolution, id-free token-scope resolution, actionable unresolved target errors, and
explicit id conflict/scope rejection before mutation. The same row now covers plain `env` bootstrap
and resolved `ci-env:` secret bootstrap through `environments.set-variable`, plus managed
`access.domains[]` bootstrap through `domain-bindings.create` before deployment admission, including
destination lookup from resource context and server proxy kind lookup. Pull request preview routes
are written as preview-scoped
server-applied route desired state and must be present in the resulting runtime plan before the
Action publishes `preview-url`. Unsupported source fields still fail before mutation with
`profile-application`; unsupported secret resolvers fail with `config-secret-resolution`.
`scripts/test/deploy-action-wrapper.test.ts` and
`packages/orpc/test/deployment-create.http.test.ts` cover `CONTROL-PLANE-HANDSHAKE-021`, proving
server-config pull request previews can forward partial placement hints and let server-side preview
policy complete the resource target before deployment admission.
The repository no longer carries a production docs deployment workflow, so the old docs-production
dogfood workflow coverage is intentionally removed.

Existing tests in `deployment-state.test.ts` and `remote-pglite-state-sync.test.ts` partially cover
the older `postgres-control-plane` backend selection branch. `remote-pglite-state-sync.test.ts`,
`deployment-remote-state.test.ts`, `deployment-ssh-remote-state.test.ts`, and
`runtime-target-capacity-prune.test.ts` now cover the first state backend ownership slice:
standalone `ssh-pglite` marker initialization and remote sync retention, Postgres control-plane
deploy paths skipping remote PGlite backups, stable `SERVER_STATE_BACKEND_MISMATCH` errors, and
live standalone PGlite state protection during explicit marker prune.

`packages/adapters/cli/test/control-plane-client.test.ts` now covers the CLI remote control-plane
client bridge:

- `CONTROL-PLANE-CLI-001`, `CONTROL-PLANE-CLI-002`, `CONTROL-PLANE-CLI-003`,
  `CONTROL-PLANE-CLI-004`, `CONTROL-PLANE-CLI-005`, `CONTROL-PLANE-CLI-007`,
  `CONTROL-PLANE-CLI-008`, `CONTROL-PLANE-CLI-009`, `CONTROL-PLANE-CLI-010`,
  `CONTROL-PLANE-CLI-011`, `CONTROL-PLANE-CLI-012`, and `CONTROL-PLANE-CLI-013`;
- the adapter-level `CONTROL-PLANE-CLI-006` binding for typed SDK `projects.list/show`,
  `projects.rename`, and `servers.list` remote dispatch;
- mode/profile mismatch and explicit local-only terminal/deploy unsupported checks under
  `CONTROL-PLANE-CLI-008`.

`apps/shell/test/run-control-plane-cli.test.ts` covers the shell pre-dispatch portion of
`CONTROL-PLANE-CLI-006`, proving remote `project list` and `project rename` return before local
shell composition or SSH PGlite sync. The implemented bridge has a CLI-adapter-local profile store,
login/logout/status commands, context command, self-hosted and explicit-URL Cloud token/cookie
handshake, full flags/env/profile/config target resolution, dispatch-time handshake, and ordinary
CLI remote dispatcher for generated SDK non-streaming operations.

OS keychain credential storage, source-package quick deploy, remote streaming/watch, terminal attach
gateway, MCP exposure, broader OIDC provider flows, and SSH PGlite adoption remain governed
follow-ups.

`remote-pglite-state-sync.test.ts` now also covers SSH `ssh-pglite` final upload refresh/merge
behavior after remote revision conflict. That coverage belongs to the SSH state-backend path under
mode `none`; it is not evidence of Cloud/self-hosted control-plane handshake or adoption behavior.

Cloud/self-hosted API rows beyond the active server-config deploy slices remain target coverage
until adoption, Cloud-assisted reporting, inline/remote archive package transport, durable source
package blob storage, archive diagnostics/cleanup, source profile bootstrap, broader API mode
contracts, and non-`ci-env:` secret resolvers exist.
Self-hosted Action deploy-token authentication and authorization coverage is tracked separately in
[Self-Hosted Auth Test Matrix](./self-hosted-auth-test-matrix.md); existing server-mode Action rows
are not evidence that Action mutation endpoints are protected.
