# Deployment Config File Spec-Driven Test Matrix

## Normative Contract

Repository deployment config file tests must prove that config files are entry-workflow profile
inputs, the non-interactive Quick Deploy draft expression, and never hidden `deployments.create`
schemas.

Canonical assertions:

- config discovery starts from the selected source root or explicit path;
- the parser is strict and rejects unknown, identity, secret, and unsupported fields;
- project/resource/server/destination/credential identity is resolved outside the committed file;
- first-run project/resource creation uses explicit operations and source-derived defaults;
- config-driven runs follow the same Quick Deploy project/server/environment/resource operation
  order as interactive entrypoints;
- resource/runtime/network/health profile fields map to resource-owned commands before deployment;
- trusted CLI/Action/Web/future-tool profile inputs mirror the repository config profile fields,
  override selected config values, and feed the same Quick Deploy bootstrap path without generating
  temporary config files;
- non-secret env values and resolved secret references map to environment commands before
  deployment;
- final `deployments.create` input remains ids-only;
- SSH-targeted CLI/Action runs default to SSH-server `ssh-pglite` state, not runner-local state;
- `access.domains[]` declarations become server-applied proxy routes in SSH CLI mode or managed
  domain intent in control-plane mode, and never become `deployments.create` fields;
- `controlPlane` declarations choose connection policy only, never durable identity or secrets;
- HTTP remains strict unless a future workflow command is accepted by ADR.

## Global References

This matrix inherits:

- [Repository Deployment Config File Bootstrap Workflow Spec](../workflows/deployment-config-file-bootstrap.md)
- [GitHub Action PR Preview Deploy Workflow Spec](../workflows/github-action-pr-preview-deploy.md)
- [GitHub Action Deploy Wrapper Implementation Plan](../implementation/github-action-deploy-action-plan.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Workload Framework Detection And Planning Test Matrix](./workload-framework-detection-and-planning-test-matrix.md)
- [Quick Deploy Test Matrix](./quick-deploy-test-matrix.md)
- [Control-Plane Modes Test Matrix](./control-plane-modes-test-matrix.md)
- [Source Link State Test Matrix](./source-link-state-test-matrix.md)
- [resources.create Test Matrix](./resources.create-test-matrix.md)
- [deployments.create Test Matrix](./deployments.create-test-matrix.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Test Layers

| Layer | Config-file focus |
| --- | --- |
| Parser/schema | Supported names, JSON/YAML parsing, strict unknown-field rejection, identity/secret/unsupported-field rejection. |
| Source/root resolver | Git root discovery, explicit path behavior, monorepo base directory safety, ambiguous file handling. |
| Entry workflow | Precedence, profile mapping, explicit operation sequencing, no hidden deployment fields. |
| Remote state | SSH-server `ssh-pglite` default, local-only override, locking, migration, and source identity reuse. |
| Quick Deploy parity | Config profile normalization must feed the same operation order and id-threading as interactive Quick Deploy. |
| Resource command | Resource source/runtime/network/health profile created or updated through resource-owned contracts. |
| Environment command | Non-secret variables and required secret references are handled before deployment snapshot. |
| CLI | `appaloft deploy --config` and implicit discovery are local entry workflows. |
| HTTP/oRPC | Strict ids-only deployment endpoint; schema serving only unless future workflow command exists. |
| Diagnostics/read models | Safe config-origin metadata appears without leaking secret values. |

## Discovery Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONFIG-FILE-DISC-001 | integration | Explicit JSON config path | CLI or local entry receives `--config ./appaloft.json` and file exists | File parsed and validated before workflow commands | None | Config read -> profile normalization -> explicit operations |
| CONFIG-FILE-DISC-002 | integration | Explicit missing config path | CLI or local entry receives `--config ./missing.json` | Workflow stops before mutation | `validation_error`, phase `config-discovery` | No write commands |
| CONFIG-FILE-DISC-003 | integration | Git root implicit discovery | Source path is a subdirectory in a Git worktree with `appaloft.json` at repo root | Config is discovered from Git root | None | Config read before resource profile normalization |
| CONFIG-FILE-DISC-004 | integration | Non-Git folder discovery | Source path is a local folder outside Git with `appaloft.json` in selected root | Config is discovered from selected folder root | None | Config read before resource profile normalization |
| CONFIG-FILE-DISC-005 | integration | Discovery does not scan arbitrary parents | Source folder has no config, parent outside selected root has config | Parent config is ignored | None | Workflow uses detection/defaults or explicit input |
| CONFIG-FILE-DISC-006 | integration | Ambiguous multiple config files | Discovery root contains `appaloft.json` and `appaloft.yaml` without explicit path | Workflow stops before mutation | `validation_error`, phase `config-discovery` | No write commands |
| CONFIG-FILE-DISC-007 | integration | JSON parse error | Config file is invalid JSON | Workflow stops before mutation | `validation_error`, phase `config-parse` | No write commands |
| CONFIG-FILE-DISC-008 | integration | YAML parse target | Config file is valid `appaloft.yaml` | File is parsed when YAML support is implemented; otherwise row remains failing target coverage | None when supported | Config read -> profile normalization |
| CONFIG-FILE-DISC-009 | integration | Unknown field strictness | Config contains an unknown top-level field | Workflow stops before mutation | `validation_error`, phase `config-schema` | No write commands |

## Identity Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONFIG-FILE-ID-001 | e2e-preferred | First-run auto-create project and resource | No explicit project/resource ids and no trusted link state | Project/resource are created from source-derived defaults outside config identity | None | `projects.create` -> `resources.create` -> `deployments.create` |
| CONFIG-FILE-ID-002 | e2e-preferred | Reuse trusted link state | Trusted Appaloft source binding/link state points at existing project/resource | Existing ids are reused even if config profile changes | None | Resource profile operation if needed -> `deployments.create` |
| CONFIG-FILE-ID-003 | integration | Config `project` field rejected | Committed config contains `project` or `projectId` | Workflow stops before mutation | `validation_error`, phase `config-identity` | No write commands |
| CONFIG-FILE-ID-004 | integration | Config resource selector rejected | Committed config contains `resourceId`, resource name as selector, or resource slug as selector | Workflow stops before mutation | `validation_error`, phase `config-identity` | No write commands |
| CONFIG-FILE-ID-005 | integration | Config target/server selector rejected | Committed config contains `serverId`, target host, destination id, destination name, provider account, or region as selector | Workflow stops before mutation | `validation_error`, phase `config-identity` | No write commands |
| CONFIG-FILE-ID-006 | e2e-preferred | Explicit ids override config profile | CLI/API/Web passes explicit project/environment/resource/server ids and config has only profile fields | Explicit ids are used; config cannot redirect identity | None | Profile normalization -> `deployments.create` ids-only |
| CONFIG-FILE-ID-007 | integration | Environment overlay does not select environment | Config has `environments.production` overlay but entry selected staging | Production overlay is not applied | None | Staging profile resolution only |
| CONFIG-FILE-ID-008 | e2e-preferred | Relink requires explicit operation | Existing source is linked to one resource and operator wants another | Deploy does not move implicitly; `source-links.relink` is required | `validation_error`, phase `source-link-resolution`, or relink-specific guidance | No accidental project/resource mutation |

## Profile Mapping Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONFIG-FILE-PROFILE-001 | e2e-preferred | Runtime profile from config | Config declares strategy, install/build/start commands, and safe static/Dockerfile/Compose paths | Values map to `ResourceRuntimeProfile`; deployment remains ids-only | None | `resources.create` or resource profile update -> `deployments.create` |
| CONFIG-FILE-PROFILE-001A | e2e-preferred | Runtime name from config | Config declares `runtime.name` | Value maps to `ResourceRuntimeProfile.runtimeName`; deployment remains ids-only and runtime adapters derive the effective runtime/container/project name later | None | `resources.create` or resource profile update -> `deployments.create` |
| CONFIG-FILE-PROFILE-002 | e2e-preferred | Network profile from config | Config declares `network.internalPort`, upstream protocol, exposure mode, and target service when needed | Values map to `ResourceNetworkProfile` | None | `resources.create` or network profile update -> `deployments.create` |
| CONFIG-FILE-PROFILE-003 | e2e-preferred | Health policy from config | Config declares HTTP health policy | Values map to resource runtime/health policy | None | Resource profile/health operation -> `deployments.create` |
| CONFIG-FILE-PROFILE-004 | integration | Unsafe source base directory | Config base directory contains `..`, URL, shell metacharacter, or host absolute path | Workflow stops before mutation | `validation_error`, phase `config-profile-resolution` | No write commands |
| CONFIG-FILE-PROFILE-005 | integration | Monorepo base directory | Config selects `/apps/api` under the source root | Resource source binding uses safe source-root-relative base directory | None | `resources.create(source.baseDirectory)` -> `deployments.create` |
| CONFIG-FILE-PROFILE-006 | integration | Existing resource profile drift before configuration commands are active | Existing resource profile differs from config and accepted `resources.configure-source` / `resources.configure-runtime` / `resources.configure-network` operations are not active | Workflow stops before deployment | `resource_profile_drift`, phase `resource-profile-resolution` | No `deployments.create` |
| CONFIG-FILE-PROFILE-007 | e2e-preferred | Existing resource profile configuration after operations are active | Existing resource profile differs and explicit resource profile configuration operations are active | Relevant `resources.configure-*` commands run before deployment | None | Resource profile configuration command(s) -> `deployments.create` |
| CONFIG-FILE-PROFILE-008 | integration | Domains/TLS stay out of deployment admission | Config declares `access.domains[]` | Values do not enter `deployments.create`; SSH mode persists server-applied route desired state and control-plane mode maps to managed domain intent | None when SSH route desired-state storage is available; `validation_error`, phase `config-domain-resolution` when the selected backend has no supported route-state or managed-domain mapping | SSH mode: route desired state -> `deployments.create` -> proxy realization. Control-plane mode: `domain-bindings.create` separate from deployment. |
| CONFIG-FILE-PROFILE-009 | integration | Final deployment input is ids-only | Config contains valid source/runtime/network/health profile fields | Final command input contains only project/server/destination/environment/resource ids | None | Assert no source/runtime/network fields on `deployments.create` |

## Secrets Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONFIG-FILE-SEC-001 | integration | Raw SSH private key rejected | Config contains an inline private key or password | Workflow stops before mutation and error details are sanitized | `validation_error`, phase `config-secret-validation` | No write commands |
| CONFIG-FILE-SEC-002 | integration | Raw token or API key rejected | Config contains token/password-like raw secret fields | Workflow stops before mutation and logs do not contain value | `validation_error`, phase `config-secret-validation` | No write commands |
| CONFIG-FILE-SEC-003 | integration | Required CI secret reference accepted | Config declares `secrets.DATABASE_URL.from: ci-env:DATABASE_URL` and the runner environment provides `DATABASE_URL` | Secret value is applied as an environment secret without appearing in logs or deployment input | None | `environments.set-variable(isSecret=true)` -> `deployments.create` |
| CONFIG-FILE-SEC-004 | e2e-preferred | SSH credential reference accepted | Config or entry references a reusable SSH credential created outside the file | Credential is resolved through credential/server commands, not raw material | None | credential/server selection -> deployment |
| CONFIG-FILE-SEC-005 | integration | Secret values masked in diagnostics | Config-origin diagnostics include secret-related fields | Diagnostics show only key/reference/status, never raw value | None | Query diagnostic summary/read model |
| CONFIG-FILE-SEC-006 | integration | Plain non-secret env values | Config declares non-secret plain config values, including `PUBLIC_` or `VITE_` build-time keys | Values are applied through environment variable commands before snapshot with build-time exposure only for public-prefixed keys | None | `environments.set-variable` -> `deployments.create` |
| CONFIG-FILE-SEC-007 | integration | Secret env value inline rejected | Config declares raw value for key marked secret or key matching secret policy | Workflow stops before mutation | `validation_error`, phase `config-secret-validation` | No write commands |
| CONFIG-FILE-SEC-008 | integration | Required CI secret reference missing | Config declares required `ci-env:API_TOKEN` but the entrypoint environment does not contain `API_TOKEN` | Workflow stops before mutation and does not include the secret key value in details | `validation_error`, phase `config-secret-resolution` | No write commands |
| CONFIG-FILE-SEC-009 | integration | Optional CI secret reference missing | Config declares optional `ci-env:OPTIONAL_TOKEN` and the entrypoint environment does not contain it | Workflow skips the optional variable and continues | None | No command for missing optional secret -> `deployments.create` |
| CONFIG-FILE-SEC-010 | integration | Unsupported secret resolver rejected | Config declares required `vault:prod/api` before that adapter is configured | Workflow stops before mutation | `validation_error`, phase `config-secret-resolution` | No write commands |

## Control-Plane Policy Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONFIG-FILE-CONTROL-001 | unit | Omitted control-plane config defaults to none | Config has no `controlPlane` section | Config workflow passes no control-plane selection; resolver uses built-in `none` unless trusted entrypoint overrides exist | None | Config parse -> mode resolution |
| CONFIG-FILE-CONTROL-002 | integration | Explicit none accepted | Config declares `controlPlane.mode: none` | SSH-targeted deploy keeps pure SSH `ssh-pglite` behavior and does not require Cloud token or `DATABASE_URL` | None | Config parse -> mode resolution -> remote SSH state lifecycle |
| CONFIG-FILE-CONTROL-003 | integration | Auto without trusted source falls back to none | Config declares `controlPlane.mode: auto`, no trusted endpoint/login/adoption marker is present | Effective mode is `none`; diagnostics record safe fallback | None | Config parse -> mode resolution -> remote SSH state lifecycle when SSH target exists |
| CONFIG-FILE-CONTROL-004 | integration | Cloud/self-hosted before handshake fails safely | Config declares `cloud` or `self-hosted` before control-plane handshake support exists | Workflow stops before identity/resource/domain/deployment mutation | `control_plane_unsupported`, phase `control-plane-capability`, or `validation_error`, phase `control-plane-resolution` | No write commands |
| CONFIG-FILE-CONTROL-005 | integration | Control-plane identity selector rejected | Config `controlPlane` contains project/resource/server/destination/credential/org/tenant identity | Workflow stops before mutation | `validation_error`, phase `control-plane-config` or `config-identity` | No write commands |
| CONFIG-FILE-CONTROL-006 | integration | Control-plane secret value rejected | Config `controlPlane` contains token, database URL, SSH key, certificate material, or raw credential | Workflow stops before mutation and diagnostics are sanitized | `validation_error`, phase `control-plane-config` or `config-secret-validation` | No write commands |
| CONFIG-FILE-CONTROL-007 | integration | Entrypoint override wins | Config declares `none`, but trusted CLI/action/env selects self-hosted URL | Resolver uses trusted entrypoint selection and records origin metadata | None or later handshake error | Config parse -> mode resolution -> handshake gate |

## Remote State Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONFIG-FILE-STATE-001 | unit | State backend resolver defaults SSH target to remote PGlite | GitHub Actions or CLI non-TTY deploy has trusted SSH target inputs, with no `DATABASE_URL` and no explicit state override | Resolver selects `ssh-pglite`, reports no `DATABASE_URL` requirement, and marks remote state lifecycle required | None | State backend selection only |
| CONFIG-FILE-STATE-002 | integration | Remote state ensure prepares durable root | SSH target has no Appaloft state root or has incomplete directories | Workflow creates/verifies data root, schema marker, lock area, backup/journal area, and permissions before identity resolution | `validation_error`, phase `remote-state-resolution` when ensure cannot make a safe state root | Ensure remote state -> identity resolution |
| CONFIG-FILE-STATE-003 | integration | State-root coordination protects remote backend maintenance | Two config deploys target the same SSH-server state root during ensure/migrate/sync work | One workflow owns backend maintenance at a time; the second may wait for a bounded retry window, then succeeds after release or fails with retriable lock error according to policy | `infra_error`, phase `remote-state-lock` when state-root coordination cannot be acquired within the retry window | Ensure/migrate/sync before identity/resource/env/deployment writes |
| CONFIG-FILE-STATE-003A | integration | Command coordination is scope-based after backend prepare | Two config deploys reach explicit operations against the same SSH server/state backend but different logical resources | Command-level waiting is decided by logical mutation scope such as `resource-runtime` or `source-link`; unrelated scopes must not be serialized only because they share the same server/state backend | `coordination_timeout`, phase `operation-coordination` only when the same logical scope cannot be acquired within the retry window | Ensure/migrate/sync -> resolve identity -> explicit operation coordination |
| CONFIG-FILE-STATE-004 | integration | Remote migrations run before workflow state resolution | SSH-server state exists at an older schema version | Migrations complete before project/resource/server/environment lookup or creation | `infra_error`, phase `remote-state-migration` when migration fails | Ensure remote state -> backup/journal -> migrate -> integrity check -> identity resolution |
| CONFIG-FILE-STATE-005 | integration | Remote migration recovery marker | Migration fails after backup/journal is created | Workflow stops before mutation and exposes recovery marker through diagnostics | `infra_error`, phase `remote-state-migration` | No identity/resource/deployment writes after failed migration |
| CONFIG-FILE-STATE-006 | integration | Abandoned lock recovers safely | Previous workflow left a stale lock or recovery marker | Workflow records recovered lock metadata, takes over with a fresh owner/correlation/heartbeat, and proceeds; active locks still fail with a retriable lock error | `infra_error`, phase `remote-state-lock` only when the existing lock is still active or recovery is unsafe | No write commands while the lock is actively owned by another workflow |
| CONFIG-FILE-STATE-007 | unit | State backend resolver honors explicit local-only mode | SSH target exists but entrypoint explicitly selects local-only/dry-run/smoke state | Resolver selects `local-pglite`, reports local-process scope, and does not require remote state lifecycle | None | State backend selection only |
| CONFIG-FILE-STATE-008 | unit | State backend resolver honors PostgreSQL/control-plane override | Entrypoint supplies `DATABASE_URL` or a control-plane endpoint | Resolver selects `postgres-control-plane`, reports control-plane scope, and does not initialize SSH PGlite | None or control-plane connection error when the selected backend is contacted later | State backend selection only |
| CONFIG-FILE-STATE-009 | e2e-preferred | Repeated CI deploy reuses remote identity | Two GitHub Actions runs deploy the same source/config to the same SSH target with no Appaloft ids | Second run reuses project/environment/server/resource identity from remote state/source fingerprint | None | First run creates identity and source link; second run resolves existing link before `deployments.create` |
| CONFIG-FILE-STATE-010 | e2e-preferred, opt-in SSH | SSH config deploy uses remote state before deployment | GitHub Actions or CLI non-TTY deploy has repository config and trusted SSH target inputs, with no `DATABASE_URL` and no explicit state override | Workflow uses SSH-server `ssh-pglite` as the Appaloft state source of truth, not runner-local PGlite | None | Resolve SSH target -> ensure remote state -> state-root coordination -> migrate -> identity resolution -> explicit operation coordination -> `deployments.create` |
| CONFIG-FILE-STATE-011 | integration | Interrupted download preserves local mirror | SSH archive download succeeds but local archive extraction fails before composition opens PGlite | Workflow returns sync download error and leaves the previous target-scoped local mirror intact | `infra_error`, phase `remote-state-sync-download` | Remote archive -> staged local extract fails -> keep previous mirror -> no command dispatch |
| CONFIG-FILE-STATE-012 | integration | Interrupted upload restores remote backup | Local archive creation succeeds but remote extraction/upload fails after command shutdown | Workflow returns sync upload error, remote command restores the pre-upload `pglite`/`source-links` backup when possible, and writes recovery metadata | `infra_error`, phase `remote-state-sync-upload` | Local archive -> remote backup -> staged remote extract fails -> restore backup -> recovery marker -> release lock |
| CONFIG-FILE-STATE-013 | integration | Remote revision conflict retries non-overlapping row changes | Final SSH `ssh-pglite` upload sees a newer remote revision and refreshed remote state changed only disjoint authoritative PG/PGlite rows | Workflow downloads a fresh remote snapshot, replays the local command's non-overlapping row changes, retries upload, and succeeds | None | Final upload conflict -> refresh remote snapshot -> merge disjoint rows -> retry upload |
| CONFIG-FILE-STATE-014 | integration | Remote revision conflict rejects overlapping row changes | Final SSH `ssh-pglite` upload sees a newer remote revision and refreshed remote state changed the same authoritative row incompatibly | Workflow fails with structured merge conflict details and does not overwrite the newer remote row | `infra_error`, phase `remote-state-sync-upload`, reason `remote_state_merge_conflict` | Final upload conflict -> refresh remote snapshot -> detect overlapping row conflict -> fail without blind overwrite |
| CONFIG-FILE-STATE-015 | e2e-preferred, opt-in SSH | Isolated GitHub Action runner process boundary | Two separate non-interactive CLI processes use different runner-local PGlite directories, the same GitHub repository identity, and the same trusted SSH target | First run creates remote state/source link; second run downloads the SSH-server state, reuses the linked project/environment/server/resource, and records a second deployment without duplicate resources | None | Runner A ensure/lock/migrate/download -> first deploy -> upload/release; Runner B ensure/lock/migrate/download -> source link reuse -> second deploy -> upload/release |
| CONFIG-FILE-STATE-016 | integration | Shell adopts legacy file-backed state into PG/PGlite | Downloaded or local PGlite data root contains legacy `source-links/` and `server-applied-routes/` files next to an initialized PG/PGlite store | Before identity resolution, shell imports legacy source-link and server-applied route records into PG/PGlite state and removes the legacy files | None | Download/prepare mirror -> migrate PG/PGlite -> adopt legacy source-link and route files -> identity resolution -> explicit operations |
| CONFIG-FILE-STATE-017 | integration | Existing PG/PGlite rows win over stale legacy files | PG/PGlite already owns the source fingerprint or target route set, while adjacent legacy files still point at an older resource or route target | Shell keeps the PG/PGlite rows authoritative, prunes the stale legacy files, and does not re-import the superseded target into durable state | None | Download/prepare mirror -> migrate PG/PGlite -> compare legacy files with current rows -> prune stale legacy files -> identity resolution |

## Server-Applied Domain Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONFIG-FILE-DOMAIN-001 | integration | Valid server-applied domain config | Config contains `access.domains[].host`, optional `pathPrefix`, and `tlsMode`, selected target supports reverse-proxy routes | Parser normalizes provider-neutral domain intent; SSH workflow persists server-applied route desired state and keeps final deployment ids-only; deployment planning reads exact destination state first and falls back to default-destination route state for first-run config bootstrap | None when SSH route desired-state storage is available; `validation_error`, phase `config-domain-resolution` when the selected backend has no route-state or managed-domain mapping | Config parse -> trusted context -> route desired state -> `deployments.create` -> edge proxy route realization |
| CONFIG-FILE-DOMAIN-002 | integration | Domain config rejects identity selectors | Domain entry contains server id, destination id, credential id, provider account, or DNS provider credential selector | Workflow stops before mutation | `validation_error`, phase `config-identity` or `config-domain-resolution` | No write commands |
| CONFIG-FILE-DOMAIN-003 | integration | Domain config rejects raw TLS material | Domain entry contains certificate private key, certificate body, token, password, or raw DNS credential | Workflow stops before mutation and diagnostics are sanitized | `validation_error`, phase `config-secret-validation` | No write commands |
| CONFIG-FILE-DOMAIN-004 | integration | Domain host shape rejected | Domain host includes scheme, port, path, wildcard syntax not accepted by policy, or an invalid domain label | Workflow stops before mutation | `validation_error`, phase `config-domain-resolution` | No write commands |
| CONFIG-FILE-DOMAIN-005 | e2e-preferred, opt-in SSH | Server-applied route reaches deployed service | SSH deploy has reverse-proxy network profile and `access.domains[]` with TLS disabled or provider-local TLS test mode | After deployment/proxy realization, request to target edge with `Host: <domain>` reaches the service and read model reports applied route | None or structured proxy error | Remote state -> `deployments.create` -> provider route apply/reload -> route verification/read model |
| CONFIG-FILE-DOMAIN-006 | integration | Control-plane mode maps config domain to managed workflow | Same config runs against hosted/self-hosted control-plane state | Executor creates managed domain intent through `domain-bindings.create` or reports unsupported managed mapping; it does not write server-applied SSH route state | None or stable unsupported mapping error until implemented | Config parse -> trusted context -> `deployments.create` -> managed domain follow-up command |
| CONFIG-FILE-DOMAIN-007 | integration | Canonical redirect config accepted | Config declares one served domain and one alias domain with `redirectTo` and optional `redirectStatus` | Parser normalizes redirect intent, persists server-applied route desired state in SSH mode, and keeps final deployment ids-only | None when redirect target is valid and route-state storage is available | Config parse -> trusted context -> route desired state with serve and redirect entries -> `deployments.create` -> edge proxy route realization |
| CONFIG-FILE-DOMAIN-008 | integration | Canonical redirect graph rejected | Config redirects to itself, to a missing host, to another redirect entry, or forms a loop | Workflow stops before mutation | `validation_error`, phase `config-domain-resolution` | No write commands |
| CONFIG-FILE-DOMAIN-009 | e2e-preferred, opt-in SSH | Canonical redirect reaches canonical host | SSH deploy has reverse-proxy network profile, a served canonical host, and an alias host redirecting to it | Request to target edge with `Host: <alias>` returns the configured redirect status and `Location` for the canonical host while `Host: <canonical>` reaches the service; read/proxy diagnostics report applied redirect route state | None or structured proxy error | Remote state -> `deployments.create` -> provider redirect route apply/reload -> alias redirect verification -> canonical route verification/read model |

## Resource Sizing And Runtime Target Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONFIG-FILE-SIZE-001 | integration | CPU/memory field before support | Config contains CPU or memory limit while no accepted sizing ADR/spec/runtime enforcement exists | Workflow stops before mutation | `unsupported_config_field`, phase `config-capability-resolution` | No write commands |
| CONFIG-FILE-SIZE-002 | integration | Replica field before orchestrator support | Config contains replicas or horizontal scaling while only single-server Docker/Compose is active | Workflow stops before mutation | `unsupported_config_field`, phase `config-capability-resolution` | No write commands |
| CONFIG-FILE-SIZE-003 | integration | Restart/teardown policy before support | Config contains restart policy, overlap, or drain settings before lifecycle specs accept them | Workflow stops before mutation | `unsupported_config_field`, phase `config-capability-resolution` | No write commands |
| CONFIG-FILE-SIZE-004 | e2e-preferred | Supported single-server Docker sizing after ADR | Config contains supported Docker CPU/memory values after sizing specs exist | Values are enforced by runtime adapter and snapshotted safely | None | Resource runtime profile command -> `deployments.create` -> runtime verification |
| CONFIG-FILE-SIZE-005 | integration | Target capability mismatch | Config contains a supported sizing field but selected target backend cannot enforce it | Admission fails before deploy or target resolution fails structurally | `unsupported_config_field` or `runtime_target_unsupported` | No silent ignore |

## Entry Matrix

| Test ID | Preferred automation | Entry | Expected test focus |
| --- | --- | --- |
| CONFIG-FILE-ENTRY-001 | e2e-preferred | CLI explicit `--config` | CLI reads config, rejects identity/secrets, maps profile fields to explicit operations, and dispatches ids-only `CreateDeploymentCommandInput`. |
| CONFIG-FILE-ENTRY-002 | e2e-preferred | CLI implicit discovery | CLI discovers config from source root and follows the same flow as explicit config. |
| CONFIG-FILE-ENTRY-003 | e2e-preferred | CLI non-TTY missing identity | Non-TTY deploy auto-creates only through accepted first-run rules or fails with structured input error; it must not use committed project/resource selectors. |
| CONFIG-FILE-ENTRY-004 | contract | HTTP deployment create | `POST /api/deployments` rejects config-file-only or source/runtime fields and accepts only the command schema ids. |
| CONFIG-FILE-ENTRY-005 | contract | HTTP schema endpoint | `/api/schemas/appaloft-config.json` exposes the current config schema and stays aligned with the parser. |
| CONFIG-FILE-ENTRY-006 | e2e-preferred | Web/local agent future | Any Web/local-agent file picker or future desktop workflow uses the same parser and operation sequence as CLI. |
| CONFIG-FILE-ENTRY-007 | e2e-preferred | Future MCP/automation | MCP tools may pass profile data only through the config workflow or explicit operations, not by extending `deployments.create`. |
| CONFIG-FILE-ENTRY-008 | integration | GitHub Actions headless binary | CI runs the Appaloft binary as a non-interactive Quick Deploy executor with repository config, defaults to SSH-server `ssh-pglite` when an SSH target is selected, does not require `DATABASE_URL`, resolves GitHub secrets only after the workflow maps them into runner env vars, reuses or bootstraps project/server/environment/resource records from remote state without committed ids, applies `access.domains[]` through server-applied proxy routes when declared, and uses explicit env/resource/deployment commands before ids-only deployment admission. |
| CONFIG-FILE-ENTRY-009 | contract | Deploy action install verifies binary | `appaloft/deploy-action` resolves the requested Appaloft CLI version and runner target, downloads the matching release archive plus `checksums.txt`, verifies SHA-256 before extraction, and adds the installed CLI to the job PATH only after verification. |
| CONFIG-FILE-ENTRY-010 | contract | Deploy action maps SSH secret safely | `ssh-private-key` input is written to a runner temp file with mode `0600`, only the file path is passed to `appaloft deploy --server-ssh-private-key-file`, and raw key material never appears in command args, logs, outputs, or diagnostics. |
| CONFIG-FILE-ENTRY-011 | contract | Deploy action version propagation | `version: vX.Y.Z` downloads that exact Appaloft release, `version: latest` resolves the latest stable release at runtime, and a new CLI release does not require changing the deploy-action repository unless wrapper behavior changes. |
| CONFIG-FILE-ENTRY-012 | integration | Deploy action no-config mode | When no config path is supplied or discovered, the action invokes the same CLI Quick Deploy path with trusted inputs; it defaults SSH targets to `ssh-pglite`, deploys only when non-interactive context can be inferred, and otherwise fails before mutation with structured validation. |
| CONFIG-FILE-ENTRY-013 | integration | Deploy action config without domain | Valid config with no `access.domains[]` deploys normally and does not persist server-applied route desired state; access remains generated/default or absent according to selected server policy. |
| CONFIG-FILE-ENTRY-014 | contract | Deploy action control-plane inputs | Future deploy-action inputs for `control-plane-mode`, `control-plane-url`, token/OIDC behavior, and execution mode mirror CLI resolver semantics; when absent, the action remains pure SSH `none` by default. |
| CONFIG-FILE-ENTRY-015 | integration | Deploy action PR preview context | User-authored workflow supplies trusted GitHub PR number, head SHA, repository identity, and `preview=pull-request`; the action/CLI builds a preview-scoped source fingerprint, creates or reuses preview environment/resource identity outside committed config, and dispatches ids-only `deployments.create`. |
| CONFIG-FILE-ENTRY-015A | integration | Deploy action PR preview runtime name default | User-authored workflow supplies trusted PR context, preview mode is enabled, and selected preview profile does not set `runtime.name` | The action/CLI derives `runtime.name = preview-{pr_number}` for preview resource creation/configuration, keeps that intent out of `deployments.create`, and preserves the preview prefix in effective runtime/container names when possible | None | Preview context resolution -> resource profile create/update -> `deployments.create` |
| CONFIG-FILE-ENTRY-016 | integration | Deploy action PR preview generated access | With no custom preview domain, default access provider enabled, public IPv4 server address, and ready proxy ingress, preview deploy emits `preview-url` from generated/default access, requires no user DNS, and creates no `DomainBinding`. |
| CONFIG-FILE-ENTRY-017 | integration | Deploy action PR preview wildcard domain template | With trusted `preview-domain-template` and user-configured wildcard DNS, the rendered host is stored as server-applied route desired state in SSH mode, realized through the edge proxy, emitted as `preview-url`, and kept out of `deployments.create`. |
| CONFIG-FILE-ENTRY-018 | contract | Deploy action PR preview fork safety | Default example workflow skips fork PR preview deployment before secrets or SSH credentials are exposed, and docs explain that fork previews require explicit reduced-credential policy. |
| CONFIG-FILE-ENTRY-019 | integration | Deploy action PR preview cleanup | A user-authored `pull_request.closed` workflow invokes CLI/action preview cleanup with trusted PR context; Appaloft derives the preview-scoped source fingerprint, stops preview runtime when present, deletes preview server-applied route desired state, unlinks the preview source link, and returns success when cleanup is done or already clean. |
| CONFIG-FILE-ENTRY-020 | integration | Deploy action PR preview explicit config path | With `preview=pull-request` and `config: appaloft.preview.yml`, the action/CLI uses the preview config origin, does not read production-only root config fields, creates/reuses preview environment/resource identity from trusted PR context, and dispatches ids-only `deployments.create`. |
| CONFIG-FILE-ENTRY-021 | integration | Deploy action PR preview avoids production root domains | With preview mode selected and an implicitly discovered root config that contains production `access.domains[]`, the action/CLI must not render those hosts as PR preview URLs; preview access comes from generated/default access, trusted `preview-domain-template`, explicitly selected preview config, or future selected preview overlay. |
| CONFIG-FILE-ENTRY-022 | integration | Deploy action PR preview overlay boundary | Future preview config overlays apply only after trusted PR entrypoint context selects the preview environment; a committed overlay cannot select environment/project/resource/server/destination identity or credentials and cannot retarget an existing preview source link. |
| CONFIG-FILE-ENTRY-023 | integration | Deploy action PR preview profile flag parity | Trusted CLI/Action flags provide or override runtime commands, network profile, health path, non-secret env values, `ci-env:` secret references, preview domain template, and preview TLS mode; the workflow persists env and route state through the same commands as config bootstrap and dispatches ids-only `deployments.create`. |
| CONFIG-FILE-ENTRY-024 | integration | Deploy action PR preview URL required | With `require-preview-url=true`, the CLI/action fails the workflow when the created deployment read model cannot expose a public route or the deployment finished failed during preview route verification; without the flag, the deployment may be accepted with diagnostics and no `preview-url`. |

## Current Implementation Notes And Migration Gaps

Current implemented coverage:

- `CONFIG-FILE-PARSE-001`, `CONFIG-FILE-DISC-001`, `CONFIG-FILE-ID-001`,
  `CONFIG-FILE-SEC-001`, and `CONFIG-FILE-UNSUPPORTED-001` are covered in
  `packages/deployment-config/test/appaloft-config.test.ts`.
- `CONFIG-FILE-DISC-002` and config identity rejection through the filesystem adapter are covered in
  `packages/adapters/filesystem/test/deployment-config-reader.test.ts`.
- `QUICK-DEPLOY-ENTRY-010` and `CONFIG-FILE-ENTRY-001` profile-to-quick-deploy resource draft
  mapping are covered in `packages/adapters/cli/test/deployment-config.test.ts`.
- `CONFIG-FILE-SEC-003`, `CONFIG-FILE-SEC-006`, `CONFIG-FILE-SEC-008`, and
  `CONFIG-FILE-SEC-010` are covered in `packages/adapters/cli/test/deployment-config.test.ts`,
  proving plain env mapping, public-prefix build-time exposure, supported `ci-env:` resolution,
  required missing-secret failure, and unsupported required resolver failure.
- `CONFIG-FILE-ENTRY-008` has migration coverage in `packages/config/test/index.test.ts`, proving
  the old headless CI default to embedded local PGlite without `DATABASE_URL`. After ADR-024, that
  coverage is local-only migration coverage, not the SSH target behavior.
- `CONFIG-FILE-STATE-001`, `CONFIG-FILE-STATE-007`, and `CONFIG-FILE-STATE-008` have resolver-level
  coverage in `packages/adapters/cli/test/deployment-state.test.ts`.
- `CONFIG-FILE-STATE-002` has CLI workflow coverage in
  `packages/adapters/cli/test/deployment-config.test.ts`, proving the remote-state lifecycle hook
  runs before identity queries and mutations when `ssh-pglite` is selected and releases after the
  config bootstrap mutation sequence.
- `CONFIG-FILE-STATE-002` through `CONFIG-FILE-STATE-006` have adapter-level coverage in
  `packages/adapters/cli/test/deployment-remote-state.test.ts`, proving durable root ensure,
  mutation lock, migration backup/journal, recovery marker, and lock diagnostics.
- `CONFIG-FILE-STATE-002`, `CONFIG-FILE-STATE-003`, and `CONFIG-FILE-STATE-010` have SSH transport
  adapter coverage in `packages/adapters/cli/test/deployment-ssh-remote-state.test.ts`, proving
  remote ensure/lock/migrate command construction, lock-conflict error mapping, SSH process
  arguments, and identity-file-only credential handling.
- `CONFIG-FILE-STATE-010` through `CONFIG-FILE-STATE-015` have shell-level remote PGlite mirror coverage in
  `apps/shell/test/remote-pglite-state-sync.test.ts`, proving SSH deploys plan a target-scoped
  local PGlite mirror before composition, skip remote sync for local/control-plane state, and
  download/upload the PGlite directory over SSH archive commands. The same file proves failed
  download extraction keeps the existing local mirror, failed remote upload uses remote
  backup/restore/recovery command sequencing, and remote revision conflicts can trigger a refreshed
  snapshot plus non-overlapping row merge before retry.
- `CONFIG-FILE-STATE-016` and `CONFIG-FILE-STATE-017` are covered in
  `apps/shell/test/legacy-pglite-state-adoption.test.ts`, proving shell startup adopts adjacent
  legacy `source-links/` and `server-applied-routes/` files into PG/PGlite state and prunes stale
  legacy files when PG/PGlite already owns the source fingerprint or route target.
- `SOURCE-LINK-STATE-004` and `SOURCE-LINK-STATE-005` have config workflow coverage in
  `packages/adapters/cli/test/deployment-config.test.ts`, proving first-run source link creation
  and repeated config deploy reuse through the CLI source link hook.
- `CONFIG-FILE-STATE-010` has current safe-failure coverage in
  `packages/adapters/cli/test/deployment-config.test.ts`, proving an SSH-targeted config deploy
  fails at `remote-state-resolution` before mutation when no remote lifecycle adapter is wired. The
  custom-runtime failure path stays explicit rather than falling back to runner-local PGlite.
- `CONFIG-FILE-STATE-009`, `CONFIG-FILE-STATE-010`, and `CONFIG-FILE-STATE-013` have an opt-in
  external SSH e2e harness in
  `apps/shell/test/e2e/github-action-ssh-state.workflow.e2e.ts`. The harness is disabled unless
  `APPALOFT_E2E_SSH_REMOTE_STATE=true` and proves the GitHub Actions style process boundary when
  run against a provisioned SSH/Docker target.
- The external SSH harness is wired into `.github/workflows/ssh-remote-state-e2e.yml`, the nightly
  smoke workflow, and the release workflow before release artifact publication. It runs when
  `APPALOFT_E2E_SSH_HOST` and `APPALOFT_E2E_SSH_PRIVATE_KEY` secrets are configured; release
  dispatch can set `require_ssh_remote_state_e2e=true` to fail fast when the secrets are missing.
- `CONFIG-FILE-DOMAIN-001` through `CONFIG-FILE-DOMAIN-004` have parser/schema coverage in
  `packages/deployment-config/test/appaloft-config.test.ts`, proving `access.domains[]` accepts
  safe host/path/TLS intent, normalizes defaults, rejects identity selectors, rejects raw TLS/secret
  material, and rejects unsafe host/path shapes. `packages/adapters/cli/test/deployment-config.test.ts`
  proves CLI config deploy maps invalid domain shape to `config-domain-resolution`, persists valid
  SSH server-applied route desired state before ids-only deployment admission when route-state
  storage is wired, and fails before mutation with `server_applied_route_store_missing` when a
  custom runtime cannot persist the desired state.
- `DEP-CREATE-ADM-035` is covered in `packages/application/test/create-deployment.test.ts`, proving
  `deployments.create` remains ids-only.

Current implementation supports JSON and YAML target names in `@appaloft/deployment-config`, and
CLI/filesystem discovery use the same parser.

Current config schema rejects `project`, `environment`, `resource`, `targets`, `servers`, raw
secret material, secret-looking inline env values, unknown fields, unsafe domain/TLS-like fields,
and unsupported sizing/rollout fields before mutation. It now accepts `access.domains[]` with
provider-neutral `host`, `pathPrefix`, and `tlsMode` fields. SSH CLI config deploy now persists
server-applied route desired state under the selected SSH-server state backend before
`deployments.create`; deployment planning consumes that desired state and records applied/failed
status after deployment-finished route outcomes. Resource access, health, and diagnostic summaries
expose the latest server-applied route URL/status. Provider-local TLS diagnostics for
`tlsMode = auto` routes are exposed through proxy configuration/resource diagnostics. Control-plane
managed-domain mapping remains follow-up work.

PG/PGlite durable server-applied route persistence is specified in
[Server-Applied Route Durable Persistence Plan](../implementation/server-applied-route-durable-persistence-plan.md).
The durable table, PG adapter, shell wiring, and `resources.delete` blocker coverage are tracked by
`SERVER-APPLIED-ROUTE-STATE-001` through `SERVER-APPLIED-ROUTE-STATE-005` in the edge proxy test
matrix and now have PG/PGlite integration coverage.

Control-plane policy rows `CONFIG-FILE-CONTROL-001` through `CONFIG-FILE-CONTROL-007` are roadmap
coverage under ADR-025. Current config schema does not accept `controlPlane` yet; existing
`postgres/control-plane` resolver tests only prove the older backend-selection branch and must be
extended or renamed during Phase 1.

Canonical redirect rows `CONFIG-FILE-DOMAIN-007` and `CONFIG-FILE-DOMAIN-008` now have parser,
remote-state, deployment planning, provider rendering, and proxy-configuration query coverage for
`redirectTo` / `redirectStatus`. `CONFIG-FILE-DOMAIN-009` remains opt-in SSH e2e target coverage for
real HTTP redirect behavior against an external target.

Current HTTP adapter serves a config schema endpoint, but strict deployment API behavior remains
ids-only.

`CONFIG-FILE-ENTRY-015`, `CONFIG-FILE-ENTRY-017`, `CONFIG-FILE-ENTRY-020`, and
`CONFIG-FILE-ENTRY-021` have CLI integration coverage in
`packages/adapters/cli/test/deployment-config.test.ts`, proving `appaloft deploy` accepts trusted
preview context inputs, creates preview-scoped source link/environment context outside committed
config, keeps `deployments.create` ids-only, persists `preview-domain-template` as server-applied
route desired state, uses explicit `appaloft.preview.yml` without reading root production-only
fields, and does not reinterpret implicitly discovered root `access.domains[]` as PR preview hosts.
`CONFIG-FILE-ENTRY-023` and `CONFIG-FILE-ENTRY-024` add flag-only preview profile parity and
required-preview-URL gating coverage in the same file.

`CONFIG-FILE-ENTRY-019` has application and CLI command coverage in
`packages/application/test/cleanup-preview.test.ts` and
`packages/adapters/cli/test/preview-command.test.ts`, proving cleanup idempotency, runtime-first
failure staging, and remote-state prepare/release around the preview cleanup command path.

Public `appaloft/deploy-action` wrapper coverage is not implemented yet. The main repository
release workflow already produces CLI archives, the static Docker self-host installer,
`checksums.txt`, `release-manifest.json`, and release notes, but `CONFIG-FILE-ENTRY-009` through
`CONFIG-FILE-ENTRY-014`, `CONFIG-FILE-ENTRY-016`, `CONFIG-FILE-ENTRY-018`,
`CONFIG-FILE-ENTRY-019`, and `CONFIG-FILE-ENTRY-022` still need wrapper repository coverage,
action metadata, SSH secret temp-key handling, generated access output handling, wrapper-level
cleanup input/examples, future overlay behavior, and tests.

Profile drift detection, existing-resource profile operation sequencing through
`resources.configure-source`, `resources.configure-runtime`, and `resources.configure-network`,
stored/external secret adapters beyond `ci-env:`, config-file Dockerfile/Compose path mapping,
operational provisioning of the external SSH e2e secrets/target, server-applied domain route
realization e2e, managed control-plane domain mapping, and resource sizing support remain target
coverage rows, not implemented baseline behavior.

## Open Questions

- Should config-origin metadata appear first on deployment diagnostics, resource diagnostics, or a
  dedicated config resolution query?
