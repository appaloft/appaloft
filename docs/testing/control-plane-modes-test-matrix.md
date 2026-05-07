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
- [Control-Plane Mode Selection And Adoption](../workflows/control-plane-mode-selection-and-adoption.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Deployment Config File Test Matrix](./deployment-config-file-test-matrix.md)
- [Quick Deploy Test Matrix](./quick-deploy-test-matrix.md)
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
| CONTROL-PLANE-HANDSHAKE-008 | wrapper contract | Self-hosted Action server API trigger | `control-plane-mode: self-hosted` is selected with URL and an existing source link for the repository/config fingerprint | Action performs `/api/version`, then `POST /api/action/deployments/from-source-link`, writes deployment id and console URL outputs, and does not invoke CLI or SSH | None | Version check -> source-link deployment API request |
| CONTROL-PLANE-HANDSHAKE-009 | wrapper contract | Self-hosted Action rejects direct state inputs | `control-plane-mode: self-hosted` is selected with ssh credentials, `state-backend`, config/source/profile inputs, or preview flags | Wrapper stops before API mutation because server mode cannot mix with direct CLI/SSH state ownership | `validation_error`, phase `control-plane-resolution` or wrapper validation | No API mutation |
| CONTROL-PLANE-HANDSHAKE-010 | HTTP/adapter contract | Self-hosted Action bootstraps missing source link with trusted ids | `control-plane-mode: self-hosted` is selected with URL and trusted project/environment/resource/server ids; no source link exists yet | Action performs `/api/version`, then `POST /api/action/deployments/from-source-link`; server dispatches ids-only `deployments.create` and persists the source link for later id-free runs | None, or validation when explicit ids are incomplete or conflict with an existing source link | Version check -> source-link lookup -> deployment API request -> source-link upsert |
| CONTROL-PLANE-HANDSHAKE-011 | wrapper contract | Self-hosted Action preview cleanup | `control-plane-mode: self-hosted` is selected with URL and preview source context | Action performs `/api/version`, then `POST /api/deployments/cleanup-preview`, writes cleanup status and console URL outputs, and does not invoke CLI or SSH | None | Version check -> preview cleanup API request |

## Self-Hosted Install Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONTROL-PLANE-INSTALL-001 | script contract | Self-hosted Docker installer selects persistence backend | `install.sh` runs with default options or `--database pglite` | Default install writes a PostgreSQL Compose stack; PGlite install writes no database URL or PostgreSQL service and mounts durable Appaloft data at `/appaloft-data` | None | Validate inputs -> write compose/env -> docker compose pull/up |
| CONTROL-PLANE-INSTALL-002 | workflow contract | Repository console deploy workflow installs the control plane over SSH | `.github/workflows/deploy-console.yml` is dispatched with trusted SSH host/key settings | Workflow copies `install.sh` to the SSH host, runs it with configurable version/origin/database, defaults database to PGlite, verifies `/api/health`, and keeps secrets out of repository config | Missing SSH variable/secret, invalid version/database/port, or health timeout | Resolve trusted settings -> copy installer -> remote install/upgrade -> health check |

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

Current implementation has no automated rows in this matrix yet.

Existing tests in `deployment-state.test.ts` and `remote-pglite-state-sync.test.ts` partially cover
the older `postgres-control-plane` backend selection branch. Those tests should be renamed or
extended with the IDs above during Phase 1 Code Round.

`remote-pglite-state-sync.test.ts` now also covers SSH `ssh-pglite` final upload refresh/merge
behavior after remote revision conflict. That coverage belongs to the SSH state-backend path under
mode `none`; it is not evidence of Cloud/self-hosted control-plane handshake or adoption behavior.

Cloud/self-hosted rows remain target coverage until the handshake, adoption, and API mode contracts
exist.
