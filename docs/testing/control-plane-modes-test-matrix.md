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
| CONTROL-PLANE-HANDSHAKE-010 | HTTP/application contract | Self-hosted Action bootstraps missing source link with trusted ids | `control-plane-mode: self-hosted` is selected with URL and trusted project/environment/resource/server ids; no source link exists yet | Action performs `/api/version`, then `POST /api/action/deployments/from-source-link`; oRPC dispatches `CreateActionSourceLinkDeploymentCommand`; application code dispatches ids-only `deployments.create` and persists the source link for later id-free runs | None, or validation when explicit ids are incomplete or conflict with an existing source link | Version check -> source-link deployment command -> `deployments.create` -> source-link upsert |
| CONTROL-PLANE-HANDSHAKE-011 | wrapper contract | Self-hosted Action preview cleanup | `control-plane-mode: self-hosted` is selected with URL and preview source context | Action performs `/api/version`, then `POST /api/deployments/cleanup-preview`, writes cleanup status and console URL outputs, and does not invoke CLI or SSH | None | Version check -> preview cleanup API request |
| CONTROL-PLANE-HANDSHAKE-012 | wrapper contract | Self-hosted Action preview deploy trigger | `control-plane-mode: self-hosted` is selected with URL, `preview=pull-request`, `preview-id`, and either trusted ids or an existing preview source link | Action derives a preview-scoped source fingerprint, performs `/api/version`, then `POST /api/action/deployments/from-source-link`, writes preview id, deployment id, deployment detail URL, and console URL outputs, and does not invoke CLI or SSH | None, or validation when direct preview route/profile inputs are supplied | Version check -> preview source-link deployment API request |
| CONTROL-PLANE-HANDSHAKE-013 | wrapper contract | Self-hosted Action server config feature gate | A future server config deploy mode is selected and the self-hosted `/api/version` handshake lacks source package or server-side config bootstrap support | Wrapper stops before source package upload/reference handoff and before API mutation | `control_plane_unsupported` or `control_plane_handshake_failed`, phase `control-plane-handshake` or `control-plane-capability` | Version check -> feature check -> no source package or mutation |
| CONTROL-PLANE-HANDSHAKE-014 | wrapper contract | Self-hosted Action server config runner boundary | A future server config deploy mode is selected with a compatible server | Wrapper performs handshake, source package preparation or reference handoff, optional `ci-env:` secret resolution for server-side config bootstrap, API request, outputs, and optional feedback only; it does not install/invoke CLI, open SSH, select `state-backend`, or mutate SSH-server PGlite | Missing or unsupported `secret-variables` references fail before API mutation with sanitized key/ref details | Handshake -> source package handoff -> server config deploy API request |
| CONTROL-PLANE-HANDSHAKE-015 | HTTP/adapter contract | Server config deploy validates source package manifest | A server config deploy request includes config path, source root, revision, checksum, size, and source fingerprint metadata | API validates manifest shape, path boundaries, checksum/size policy, and config path before command dispatch | `validation_error`, phase `source-package-validation` | Parse request -> validate package manifest -> no mutation on invalid package |
| CONTROL-PLANE-HANDSHAKE-016 | HTTP/application contract | Server config deploy rejects identity and secrets in config | Source package contains committed config with project/resource/server/destination ids, tokens, database URLs, raw secrets, or credential material | Server-side config bootstrap fails before source-link, resource profile, route, or deployment mutation | `validation_error`, `unsupported_config_field`, or `raw_secret_config_field`, phase `config-bootstrap` or `config-identity` | Package validated -> config parsed -> validation failure -> no mutation |
| CONTROL-PLANE-HANDSHAKE-017 | integration | Server config deploy applies config through explicit operations | Source package and config are valid and trusted source context resolves existing or bootstrap-allowed identity; GitHub Action trusted context may include repository/ref/revision metadata in addition to Appaloft identity ids | Server resolves context through `ResolveActionServerConfigDeploymentTargetCommand`, accepts trusted GitHub metadata without treating it as source-link identity, applies resource/environment/profile changes, plain env values, resolved `ci-env:` secret references, managed domains, and pull request preview transient env/route values through explicit commands, then dispatches ids-only `deployments.create`; preview route requests do not apply committed production domains | Missing required `ci-env:` values or unsupported secret resolvers fail before mutation with `validation_error`, phase `config-secret-resolution`; preview route without pull request context fails with `validation_error`, phase `preview-config-resolution` | Handshake -> package accepted -> config bootstrap -> source-link target command -> profile/env/secret/route operations -> `deployments.create` |

## Self-Hosted Install Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONTROL-PLANE-INSTALL-001 | script contract | Self-hosted Docker installer selects persistence backend and orchestrator | `install.sh` runs with default options, `--database pglite`, or `--orchestrator swarm` | Default install writes a PostgreSQL Compose stack; PGlite install writes no database URL or PostgreSQL service and mounts durable Appaloft data at `/appaloft-data`; Swarm install writes the same safe stack shape, constrains local-volume state to manager nodes, requires an existing manager unless `--swarm-init` is explicit, and deploys through `docker stack deploy` | Invalid database/orchestrator/port, Docker unavailable, Compose plugin unavailable for Compose, or Swarm manager unavailable without explicit init | Validate inputs -> write compose/env -> docker compose pull/up or docker stack deploy |
| CONTROL-PLANE-INSTALL-002 | workflow/wrapper contract | Repository console deploy workflow or deploy action installs the control plane over SSH | `.github/workflows/deploy-console.yml` is dispatched with trusted SSH host/key settings, or `appaloft/deploy-action` runs with `command=install-console` and trusted SSH inputs | Workflow copies `install.sh`, or the action downloads the release installer on the SSH host; both run it with configurable version/origin/database/orchestrator/proxy/domain, default database to PostgreSQL, default direct host port to `3721`, default proxy to Traefik, verify `/api/health`, output the console URL, and keep secrets out of repository config | Missing SSH variable/secret/input, invalid version/database/orchestrator/port/proxy/domain, installer download failure, or health timeout | Resolve trusted settings -> transfer or download installer -> remote install/upgrade -> health check |
| CONTROL-PLANE-INSTALL-003 | config/parser + wrapper contract | Console install settings are repository-configurable | `command=install-console` runs with a selected config that contains non-secret `controlPlane.url` and `controlPlane.install.*` settings | The wrapper derives console origin, database, Docker orchestrator, proxy mode, host/port, image, installer URL, and Swarm/Compose names from config when matching Action inputs are omitted; explicit Action inputs remain trusted overrides, SSH host/key and API tokens stay outside config, and pure SSH CLI deploy remains separate | Invalid install database/orchestrator/proxy/port/URL, raw secret fields, or missing SSH target | Config parse -> trusted SSH input resolution -> remote installer invocation -> health check |
| CONTROL-PLANE-INSTALL-004 | script contract | Installer-owned console domain route | `install.sh` runs with `--domain console.example.com` and default proxy mode | Installer writes `APPALOFT_WEB_ORIGIN=https://console.example.com`, starts the resident Traefik edge, attaches Appaloft to the shared edge network, adds HTTP-to-HTTPS and TLS route labels for the Appaloft instance console, and keeps direct host access on `3721` as the fallback. The route is not represented as a Resource, DomainBinding, deployment snapshot, or project route. | Invalid domain, unsupported proxy mode, occupied host ports, Docker/Compose/Swarm failure, or ACME/DNS failure after startup | Validate domain/proxy -> write compose/env -> start Appaloft and Traefik -> health check |
| CONTROL-PLANE-INSTALL-005 | HTTP/adapter contract | Self-hosted console static deep-link refresh | The Appaloft app serves packaged or embedded Web console static assets after install, and the operator refreshes a clean URL or dynamic console route | Static route files such as `/domain-bindings` resolve before SPA fallback; dynamic console routes such as project/environment/resource detail return the SvelteKit `200.html` SPA fallback instead of the prerendered home `index.html`; docs assets under `/docs/*` remain separate. | Missing Web static assets return the existing backend fallback or `404` for missing extension-bearing assets. | HTTP request -> exact asset or clean-url HTML lookup -> directory index lookup -> `200.html` SPA fallback -> `index.html` compatibility fallback |
| CONTROL-PLANE-INSTALL-006 | HTTP/adapter contract | Public console readiness masks private database location | Self-hosted console readiness details include database driver, mode, and an internal database location or connection URL | `/api/readiness` and `/api/console-overview` expose only safe readiness details such as database driver and mode; database paths, URLs, credentials, and `databaseLocation` stay out of public responses. | None | Doctor query -> public HTTP readiness projection -> sensitive detail allowlist |
| CONTROL-PLANE-INSTALL-007 | workflow contract | Repository console preview workflow deploys a PR-scoped console backend | A same-repository pull request changes Web console, shared frontend contracts, shell/backend code, or repository deploy plumbing | `.github/workflows/deploy-console-preview.yml` classifies the change, deploys the PR source with the repository `Dockerfile` as an application Resource through the CLI to an SSH target with `ssh-pglite`, serves Web assets and `/api` from the same preview origin, configures preview-scoped auth origin values through trusted environment flags, publishes a PR-scoped preview URL, uses a backend-preview config fingerprint so it does not drift against earlier static preview Resources, and cleans up both backend and legacy static preview fingerprints when the PR closes. | Missing SSH variable/secret, runtime capacity/state preflight failure, image build failure, deploy failure, health timeout, or cleanup failure | Change classification -> trusted settings -> remote preflights -> legacy static preview cleanup -> backend Dockerfile CLI deploy -> same-origin preview URL output -> PR close cleanup |

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

## Current Implementation Notes And Migration Gaps

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
`scripts/test/deploy-console-preview-workflow.test.ts` covers the repository PR-scoped console
preview workflow (`CONTROL-PLANE-INSTALL-007`), including the dedicated preview config fingerprint,
same-origin backend deployment, trusted auth origin settings, legacy static preview cleanup, and PR
cleanup path.
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
admission. The same row now covers plain `env` bootstrap and resolved `ci-env:` secret bootstrap
through `environments.set-variable`, plus managed `access.domains[]` bootstrap through
`domain-bindings.create` before deployment admission, including destination lookup from resource
context and server proxy kind lookup. Pull request preview routes are written as preview-scoped
server-applied route desired state and must be present in the resulting runtime plan before the
Action publishes `preview-url`. Unsupported source fields still fail before mutation with
`profile-application`; unsupported secret resolvers fail with `config-secret-resolution`.
`scripts/test/deploy-docs-workflow.test.ts` covers the main repository dogfood path: production
docs deployment opts into `server-config-deploy: true` for self-hosted mode and keeps the pure SSH
CLI fallback separate.

Existing tests in `deployment-state.test.ts` and `remote-pglite-state-sync.test.ts` partially cover
the older `postgres-control-plane` backend selection branch. Those tests should be renamed or
extended with the IDs above during Phase 1 Code Round.

`remote-pglite-state-sync.test.ts` now also covers SSH `ssh-pglite` final upload refresh/merge
behavior after remote revision conflict. That coverage belongs to the SSH state-backend path under
mode `none`; it is not evidence of Cloud/self-hosted control-plane handshake or adoption behavior.

Cloud/self-hosted API rows beyond existing-resource/no-profile deployment remain target coverage
until source package storage, adoption, profile application, and broader API mode contracts exist.
Self-hosted Action deploy-token authentication and authorization coverage is tracked separately in
[Self-Hosted Auth Test Matrix](./self-hosted-auth-test-matrix.md); existing server-mode Action rows
are not evidence that Action mutation endpoints are protected.
