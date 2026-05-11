# Action Server Config Deploy

## Status

- Round: Spec Round
- Artifact state: accepted-candidate for a `0.9.x` Code Round

## Business Outcome

Users who already run a self-hosted Appaloft server should be able to keep using a
user-authored GitHub Actions workflow while the server, not the GitHub runner, owns Appaloft state,
repository config application, source materialization, deployment admission, audit, and console
links.

The current self-hosted Action slice is a trigger for an existing resource profile. It sends a
source fingerprint to the server and the server resolves existing source-link context. This spec
defines the next slice: the Action may submit a trusted source package reference plus the selected
repository config file so the self-hosted server can run the config deploy workflow through API
state, without installing the CLI, opening SSH, or mutating SSH-server PGlite from the runner.

## Source Of Truth

- [ADR-010: Quick Deploy Workflow Boundary](../../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-025: Control-Plane Modes And Action Execution](../../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [Repository Deployment Config File Bootstrap](../../workflows/deployment-config-file-bootstrap.md)
- [Control-Plane Mode Selection And Adoption](../../workflows/control-plane-mode-selection-and-adoption.md)
- [Action Server Config Deploy Workflow](../../workflows/action-server-config-deploy.md)
- [Deployment Config File Test Matrix](../../testing/deployment-config-file-test-matrix.md)
- [Control-Plane Modes Test Matrix](../../testing/control-plane-modes-test-matrix.md)
- [Self-Hosted Action Deploy Token Auth](../052-self-hosted-action-deploy-token-auth/spec.md)
- [Error Model](../../errors/model.md)

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Action server config deploy | A GitHub Action triggered deployment where a self-hosted Appaloft server owns config bootstrap and deployment admission. | Release orchestration / entry workflow | server-mode config deploy |
| Source package | A trusted, bounded source snapshot or reference that the Action makes available to the control plane for one deployment request. | Source integration / workload delivery | source archive, repository snapshot |
| Source package manifest | Safe metadata for a source package, including source fingerprint, config path, source root, revision, provider repository facts, size, and checksum. | Source integration | package manifest |
| Server-side config bootstrap | Control-plane execution of the repository config workflow, including config validation, source-link resolution, resource profile mutation, env reference mapping, route intent handling, and ids-only deployment dispatch. | Workspace / release orchestration | config-aware backend workflow |
| Trusted execution context | Action inputs, GitHub event facts, token scope, source link state, and server-owned policy used to select identity outside committed config. | Entry workflow | trusted context |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ACTION-SERVER-CONFIG-SPEC-001 | Server applies repository config | `control-plane-mode: self-hosted` is selected, the Action has a compatible server URL/token or currently accepted anonymous self-host policy, and a source package manifest includes a safe config path | The Action submits the server config deploy request with Appaloft identity ids and optional trusted GitHub repository/ref/revision metadata | The server validates the package manifest and config, resolves identity from trusted context/source links or `controlPlane.deploymentContext`, accepts GitHub metadata without treating it as source-link identity, applies resource profile and env reference changes through explicit operations, then dispatches ids-only `deployments.create`. |
| ACTION-SERVER-CONFIG-SPEC-002 | Runner does not mutate Appaloft state | A self-hosted server config deploy is requested | The Action runs | The Action does not install or invoke the CLI, open SSH, select `state-backend`, or read/write SSH-server PGlite. It only performs handshake, package preparation/upload or reference handoff, API request, output, and feedback steps. |
| ACTION-SERVER-CONFIG-SPEC-003 | Committed config can only select narrow self-hosted deployment context | `appaloft.yml` contains `controlPlane.deploymentContext` with project/environment/resource/server and optional destination ids | The Action/server parses the config | The ids are treated as non-secret explicit deployment context for this repository and may bootstrap a missing source link after authorization. |
| ACTION-SERVER-CONFIG-SPEC-003A | Committed config cannot select secrets or broad identity | `appaloft.yml` contains credential ids, organization ids, tenant ids, provider account ids, tokens, database URLs, or secret values | The server parses the config | The request fails before mutation with structured validation details and no source link, resource profile, route, or deployment mutation. |
| ACTION-SERVER-CONFIG-SPEC-004 | Existing trigger mode remains supported | A repository already uses the source-link trigger mode for an existing resource profile | The wrapper and server are upgraded | The old `from-source-link` request shape continues to work, while server config deploy is selected only by an explicit supported input or endpoint. |
| ACTION-SERVER-CONFIG-SPEC-005 | Preview context is scoped by trusted event facts | `preview=pull-request` and `preview-id` are supplied by a user-authored PR workflow | Server-side config bootstrap runs | The server uses a preview-scoped source fingerprint and trusted preview context; root production config domains or secrets are not reused as preview route or secret policy unless an accepted preview-safe config/overlay selects them. |
| ACTION-SERVER-CONFIG-SPEC-005A | Preview Action inputs remain transient | A pull request preview workflow selects `server-config-deploy` and supplies `environment-variables`, `preview-domain-template`, `preview-tls-mode`, or `require-preview-url` | The Action submits the server config deploy request | The Action sends those values as transient API payload, the server applies preview environment values after committed `env` values, and preview route application writes only the trusted preview route as preview-scoped server-applied route desired state instead of committed production `access.domains[]` or durable DomainBinding state. If the resulting deployment does not contain that requested preview route, the server returns a structured `validation_error` at `preview-route-verification` and the Action does not publish `preview-url`. |
| ACTION-SERVER-CONFIG-SPEC-006 | Incompatible feature fails before upload mutation | The server handshake does not advertise source package or server-side config bootstrap support | The Action starts | The Action fails in `control-plane-handshake` or `control-plane-capability` before source upload, source-link mutation, resource mutation, route mutation, or deployment creation. |
| ACTION-SERVER-CONFIG-SPEC-007 | Source package is bounded and verifiable | A source package is prepared by the Action | The server accepts the package or reference | The server records safe package metadata, verifies checksum/size/path boundaries, rejects parent traversal or untrusted config paths, and does not persist raw secrets or oversized package content as read-model data. |
| ACTION-SERVER-CONFIG-SPEC-008 | CI secret references stay runner-scoped and server-applied | Committed config declares `secrets.KEY.from: ci-env:NAME` and the workflow maps `secret-variables: KEY=ci-env:NAME` from GitHub Secrets into the runner environment | The Action submits the server config deploy request | The Action sends only transient resolved secret values to the self-hosted server API, the server applies them through environment commands as runtime secrets, missing required references fail before mutation with sanitized details, and pure SSH CLI mode still handles `--secret` directly. |
| ACTION-SERVER-CONFIG-SPEC-009 | Source-link resolution is an application command | A source-link or server-config Action request reaches oRPC | The route needs deployment target context | The route dispatches `CreateActionSourceLinkDeploymentCommand` or `ResolveActionServerConfigDeploymentTargetCommand`; repository lookup/upsert and conflict policy are not embedded in the transport route. |

## Domain Ownership

- Bounded contexts: release orchestration, source integration, workspace/resource configuration,
  workload delivery, runtime topology.
- Aggregate/resource owner: `Resource` owns reusable source/runtime/network profile. `Deployment`
  owns one accepted attempt and its immutable snapshots. Source link state maps source fingerprint
  to selected Appaloft context. The Action does not become a state owner.
- Upstream/downstream contexts: control-plane mode selection and handshake run before source
  materialization, source-link work, resource profile commands, route intent handling, or
  deployment admission.

## Public Surfaces

- API: [Action Server Config Deploy Workflow](../../workflows/action-server-config-deploy.md)
  reserves `POST /api/action/deployments/from-config-package` as the dedicated workflow endpoint.
  It remains separate from strict `deployments.create` and must reuse application command/query
  schemas internally.
  Source-link target resolution uses internal application commands documented in
  [action-source-link-deployment.create](../../commands/action-source-link-deployment.create.md)
  and
  [action-server-config-deployment-target.resolve](../../commands/action-server-config-deployment-target.resolve.md).
- CLI: no new CLI command in this Spec Round. Pure SSH CLI mode remains the default and continues
  to own the local/SSH config workflow.
- GitHub Action: future wrapper inputs may select server config deploy and source package behavior;
  defaults remain pure SSH `none` or existing self-hosted source-link trigger when selected.
- Web/UI: Web may link to the accepted deployment detail and source package diagnostics; Web mode
  selection remains separate.
- Config: committed config may carry non-secret profile, `ci-env:` secret references,
  control-plane connection policy, and the narrow self-hosted `controlPlane.deploymentContext`.
  It must not carry credentials, org/tenant/provider account identity, tokens, database URLs, or
  raw secret material.
- Events: Code Round must define any new source package accepted/rejected events or process-state
  records before adding workers.
- Public docs/help: docs must keep distinguishing pure Action/SSH, self-hosted source-link trigger,
  and self-hosted server config deploy.

## Non-Goals

- Adding config, source, route, preview, or package fields to `deployments.create`.
- Making Cloud/self-hosted mode the default for repositories.
- Silent adoption of SSH-server PGlite state.
- Moving `auto` mode to API mode without an adoption marker and handshake.
- Persisting raw GitHub tokens, SSH keys, database URLs, secret env values, or raw provider
  payloads.
- Requiring product-grade GitHub App previews for user-authored Action workflows.

## Open Questions

- Should the first Code Round upload a tar archive directly to Appaloft, provide a short-lived
  GitHub archive URL, or use a server-side GitHub integration to fetch the source by revision?
- What is the maximum source package size for the first self-hosted slice?
- Should package storage be immediate-local PGlite/Postgres metadata plus filesystem blobs, or a
  pluggable artifact store from the start?
- Which source package diagnostics must be visible in Web before this can be documented as
  supported?

## Current Implementation Notes And Migration Gaps

- Existing implementation supports the first self-hosted Action API trigger:
  `/api/version`, `POST /api/action/deployments/from-source-link`, and
  `POST /api/deployments/cleanup-preview`.
- Existing server trigger mode does not install or invoke the CLI and does not mutate SSH-server
  PGlite from the runner.
- Existing server trigger mode does not read/apply repository config, upload source packages,
  apply runner-side resource profile inputs, or perform product-grade preview orchestration.
- The first Action Server Config Deploy code slices validate package metadata, read
  `server-github-fetch` config files from GitHub raw content, accept the narrow
  `controlPlane.deploymentContext`, reject broad committed identity/secrets,
  resolve/bootstrap source-link context, apply runtime/network/health profile fields through
  explicit resource commands, apply plain `env` values through `environments.set-variable`, apply
  `access.domains[]` through managed `domain-bindings.create` commands when trusted
  resource/destination/server proxy context is available, apply `ci-env:` secret references from
  transient Action-supplied values through `environments.set-variable`, accept transient
  Action-supplied preview `environmentVariables` and `previewRoute` for pull request previews, and
  dispatch ids-only deployment admission. Pull request previews do not reuse committed production
  `access.domains[]`; when a preview route is supplied, it is the only route intent applied for
  that request. Inline archive transport, remote archive URL transport, source package
  storage, diagnostics, cleanup, source profile application, non-`ci-env:` secret resolvers, and
  product-grade preview orchestration remain migration gaps.
- The next auth hardening slice must make Action mutation endpoints require an installer-generated
  deploy token or future OIDC exchange, return clear 401/403 errors, and fail before source-link,
  resource, route, or deployment mutation. This is now positioned by
  [Self-Hosted Action Deploy Token Auth](../052-self-hosted-action-deploy-token-auth/spec.md).
