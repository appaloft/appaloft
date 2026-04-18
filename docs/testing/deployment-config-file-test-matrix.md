# Deployment Config File Spec-Driven Test Matrix

## Normative Contract

Repository deployment config file tests must prove that config files are entry-workflow profile
inputs and never hidden `deployments.create` schemas.

Canonical assertions:

- config discovery starts from the selected source root or explicit path;
- the parser is strict and rejects unknown, identity, secret, and unsupported fields;
- project/resource/server/destination/credential identity is resolved outside the committed file;
- first-run project/resource creation uses explicit operations and source-derived defaults;
- resource/runtime/network/health profile fields map to resource-owned commands before deployment;
- non-secret env values and resolved secret references map to environment commands before
  deployment;
- final `deployments.create` input remains ids-only;
- HTTP remains strict unless a future workflow command is accepted by ADR.

## Global References

This matrix inherits:

- [Repository Deployment Config File Bootstrap Workflow Spec](../workflows/deployment-config-file-bootstrap.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Quick Deploy Test Matrix](./quick-deploy-test-matrix.md)
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
| CONFIG-FILE-ID-008 | e2e-preferred | Relink requires explicit operation | Existing source is linked to one resource and operator wants another | Deploy does not move implicitly; relink command/spec is required | Future relink-specific code or preflight error | No accidental project/resource mutation |

## Profile Mapping Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| CONFIG-FILE-PROFILE-001 | e2e-preferred | Runtime profile from config | Config declares strategy, install/build/start commands, and safe static/Dockerfile/Compose paths | Values map to `ResourceRuntimeProfile`; deployment remains ids-only | None | `resources.create` or resource profile update -> `deployments.create` |
| CONFIG-FILE-PROFILE-002 | e2e-preferred | Network profile from config | Config declares `network.internalPort`, upstream protocol, exposure mode, and target service when needed | Values map to `ResourceNetworkProfile` | None | `resources.create` or network profile update -> `deployments.create` |
| CONFIG-FILE-PROFILE-003 | e2e-preferred | Health policy from config | Config declares HTTP health policy | Values map to resource runtime/health policy | None | Resource profile/health operation -> `deployments.create` |
| CONFIG-FILE-PROFILE-004 | integration | Unsafe source base directory | Config base directory contains `..`, URL, shell metacharacter, or host absolute path | Workflow stops before mutation | `validation_error`, phase `config-profile-resolution` | No write commands |
| CONFIG-FILE-PROFILE-005 | integration | Monorepo base directory | Config selects `/apps/api` under the source root | Resource source binding uses safe source-root-relative base directory | None | `resources.create(source.baseDirectory)` -> `deployments.create` |
| CONFIG-FILE-PROFILE-006 | integration | Existing resource profile drift without update operation | Existing resource profile differs from config and no accepted update operation exists | Workflow stops before deployment | `resource_profile_drift`, phase `resource-profile-resolution` | No `deployments.create` |
| CONFIG-FILE-PROFILE-007 | e2e-preferred | Existing resource profile update after operation exists | Existing resource profile differs and explicit profile update operations are active | Profile update commands run before deployment | None | Resource profile update command(s) -> `deployments.create` |
| CONFIG-FILE-PROFILE-008 | integration | Domains/TLS stay follow-up operations | Config declares desired domain/TLS behavior after specs allow it | Values do not enter `deployments.create`; explicit domain/certificate commands are required | None or structured unsupported error until implemented | `domain-bindings.create` separate from deployment |
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
| CONFIG-FILE-ENTRY-008 | integration | GitHub Actions headless binary | CI runs the Appaloft binary with repository config, defaults to embedded PGlite without `DATABASE_URL`, resolves GitHub secrets only after the workflow maps them into runner env vars, can bootstrap temporary project/server/environment/resource records without committed ids, and uses explicit env/resource/deployment commands before ids-only deployment admission. |

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
- `CONFIG-FILE-ENTRY-008` is covered in `packages/config/test/index.test.ts`, proving headless CI
  defaults to embedded PGlite without `DATABASE_URL`, and in
  `packages/adapters/cli/test/deployment-config.test.ts`, proving no-id non-TTY PGlite deploys
  bootstrap temporary project/server/environment/resource records before ids-only deployment
  admission.
- `DEP-CREATE-ADM-035` is covered in `packages/application/test/create-deployment.test.ts`, proving
  `deployments.create` remains ids-only.

Current implementation supports JSON and YAML target names in `@appaloft/deployment-config`, and
CLI/filesystem discovery use the same parser.

Current config schema rejects `project`, `environment`, `resource`, `targets`, `servers`, raw
secret material, secret-looking inline env values, unknown fields, and unsupported sizing/rollout
fields before mutation.

Current HTTP adapter serves a config schema endpoint, but strict deployment API behavior remains
ids-only.

Profile drift detection, existing-resource update operation sequencing, durable link/relink state,
stored/external secret adapters beyond `ci-env:`, config-file Dockerfile/Compose path mapping, and
resource sizing support remain target coverage rows, not implemented baseline behavior.

## Open Questions

- Which link-state store should be the durable non-versioned source-to-project/resource binding for
  CLI and future MCP/local-agent workflows?
- Should config-origin metadata appear first on deployment diagnostics, resource diagnostics, or a
  dedicated config resolution query?
