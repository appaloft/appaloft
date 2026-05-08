# Action Server Config Deploy Workflow Spec

## Normative Contract

Action Server Config Deploy is the self-hosted control-plane workflow where a GitHub Action triggers
a server-owned repository config deployment. The Action supplies trusted entrypoint context and a
bounded source package reference; the self-hosted Appaloft server owns package validation,
repository config parsing, source-link/context resolution, resource/environment/profile mutation,
route intent handling, deployment admission, audit, and console links.

The workflow is an entry workflow over existing operations. It is not a new aggregate command and
it must not add config, source package, runtime, route, or preview fields to `deployments.create`.

The supported shape is:

```text
GitHub Action
  -> resolve control-plane-mode self-hosted
  -> call /api/version compatibility check
  -> prepare or reference a bounded source package
  -> POST /api/action/deployments/from-config-package
  -> self-hosted server validates package manifest and config
  -> self-hosted server resolves source link and trusted context
  -> self-hosted server applies resource/environment/profile changes through explicit commands
  -> self-hosted server dispatches deployments.create with ids only
  -> Action publishes deployment id, deployment URL, console URL, and optional PR feedback
```

The Action must not install or invoke the CLI, open SSH, select `state-backend`, or mutate
SSH-server PGlite in this workflow. It is a trigger and package handoff client only.

## Global References

This workflow inherits:

- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Repository Deployment Config File Bootstrap](./deployment-config-file-bootstrap.md)
- [Control-Plane Mode Selection And Adoption](./control-plane-mode-selection-and-adoption.md)
- [Action Server Config Deploy](../specs/050-action-server-config-deploy/spec.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Control-Plane Modes Test Matrix](../testing/control-plane-modes-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Compatibility Gate

The Action must perform `/api/version` before source package upload/reference handoff.

The server handshake must advertise all features required by the selected workflow:

- API version compatible with the wrapper;
- server-side config bootstrap;
- source package manifest validation;
- the selected source package transport;
- source link lookup/bootstrap policy;
- preview source fingerprint support when `preview=pull-request`;
- deployment detail href output.

If any required feature is absent, the Action fails before source package mutation or state
mutation with `control_plane_unsupported` or `control_plane_handshake_failed` in phase
`control-plane-handshake` or `control-plane-capability`.

## API Contract

The first dedicated HTTP route is reserved as:

```text
POST /api/action/deployments/from-config-package
```

The route is an Action/control-plane workflow endpoint. It is not the public strict deployment
admission endpoint. Internally it may dispatch multiple existing commands before `deployments.create`.

Logical request shape:

```ts
type ActionServerConfigDeployRequest = {
  sourceFingerprint: string;
  configPath: string;
  sourceRoot: string;
  sourcePackage: SourcePackageManifest;
  preview?: {
    kind: "pull-request";
    previewId: string;
    pullRequestNumber?: number;
    headSha?: string;
    baseRef?: string;
    headRef?: string;
  };
  trustedContext?: {
    projectId?: string;
    environmentId?: string;
    resourceId?: string;
    serverId?: string;
    destinationId?: string;
    repositoryFullName?: string;
    repositoryId?: string;
    ref?: string;
    revision?: string;
  };
};
```

`trustedContext` is trusted entrypoint/server context, not committed repository config. If any
explicit deployment identity field is supplied, the same completeness and conflict checks as the
source-link trigger slice apply before mutation.

Success response:

```ts
type ActionServerConfigDeployResponse = {
  id: string;
  deploymentHref: string;
  deploymentUrl?: string;
  sourcePackageId?: string;
  configBootstrapId?: string;
};
```

The response means the deployment request has been accepted, not that runtime execution or route
verification has completed.

## Source Package Manifest

The source package manifest must be safe to persist and display:

```ts
type SourcePackageManifest = {
  transport: "inline-archive" | "remote-archive-url" | "server-github-fetch";
  sourceFingerprint: string;
  configPath: string;
  sourceRoot: string;
  revision?: string;
  repositoryFullName?: string;
  repositoryId?: string;
  archiveSha256?: string;
  archiveSizeBytes?: number;
  archiveUrlExpiresAt?: string;
};
```

Rules:

- `configPath` and `sourceRoot` must be relative to the package root and must not escape it.
- archive URLs must not contain credentials in logs, read models, errors, or public output.
- the server must enforce a maximum package size before storing or unpacking source material.
- checksums are required for archive transports unless a future authenticated provider fetch
  contract supplies equivalent integrity.
- package metadata may be persisted for diagnostics; raw source package content must be stored as
  bounded artifact/blob data with cleanup rules, not as business read-model text.
- package validation runs before config parsing, source-link mutation, resource mutation, route
  mutation, or deployment creation.

## Server-Side Config Bootstrap

After package validation, the server runs the repository config bootstrap contract in control-plane
mode:

```text
validate package
  -> read selected config from package
  -> parse and validate repository config
  -> reject committed identity and secret material
  -> resolve control-plane/source-link context from trusted inputs, token scope, source link state,
     preview context, or future adoption state
  -> apply resource source/runtime/network/health profile changes through explicit commands
  -> apply non-secret environment values and required secret references through environment commands
  -> map route/domain intent according to selected control-plane capabilities
  -> dispatch deployments.create(projectId, environmentId, resourceId, serverId, destinationId?)
```

The server must fail before mutation when config contains project/resource/server/destination ids,
organization ids, credential ids, database URLs, raw tokens, raw SSH keys, raw secret values,
certificate material, or unsupported future fields.

When a package/config is valid but the selected resource has protected profile drift, the workflow
must follow the existing resource profile drift contract instead of silently overwriting resource
profile state.

## Preview Context

When `preview.kind = "pull-request"`, the Action and server derive a preview-scoped source
fingerprint and identity context from trusted GitHub event facts. Production root config domains,
production secret references, and production runtime names must not be reinterpreted as preview
policy unless the selected config or a future accepted preview overlay is explicitly preview-safe.

Product-grade preview policy, GitHub App feedback, cleanup retry, scheduler behavior, and managed
domain lifecycle remain separate control-plane workflows.

## Error Phases

Expected phases:

- `control-plane-handshake`
- `control-plane-capability`
- `source-package-validation`
- `source-package-storage`
- `config-bootstrap`
- `config-identity`
- `source-link-resolution`
- `profile-application`
- `deployment-admission`

Pre-admission failures return structured errors from this endpoint. Post-admission runtime,
verification, route, and deployment execution failures are observed through deployment/event/log
read models and must not be reported as initial endpoint success.

Secrets, raw archive URLs with credentials, raw provider payloads, private keys, database URLs, and
raw secret values must not appear in errors, logs, read models, GitHub summaries, PR comments, or
console output.

## Current Implementation Notes And Migration Gaps

- The deploy-action wrapper accepts explicit `server-config-deploy: true` for self-hosted mode,
  feature-gates server support through `/api/version`, and fails before package handoff or state
  mutation when the server does not advertise source package plus server-side config bootstrap
  support.
- The wrapper dry-run path maps the selected mode to
  `POST /api/action/deployments/from-config-package`.
- The server route `POST /api/action/deployments/from-config-package` validates request shape,
  source package manifest fields, source package path boundaries, source fingerprint/path
  consistency, archive checksum presence, and size limits before any command dispatch.
- The route can use a server-side source package config reader and the same
  `@appaloft/deployment-config` parser used by CLI/local config deploy. Identity and raw secret
  fields in committed config fail with `config-identity` or `config-secret-validation` before
  source-link, resource, route, or deployment mutation.
- The self-hosted console composition wires a GitHub `server-github-fetch` config reader that reads
  the selected config file from `raw.githubusercontent.com` using trusted `repositoryFullName`,
  revision, and config path metadata. Unsupported package transports still fail closed until their
  storage/fetch contracts exist.
- When the validated config does not require server-side profile application and trusted
  project/environment/resource/server ids are supplied, the endpoint dispatches the existing
  ids-only `deployments.create` command, bootstraps the source-link context when the link is
  missing, and returns the accepted deployment id and console deployment href.
- When the validated config does not require server-side profile application and the source
  fingerprint already has source-link state, the endpoint can resolve project/environment/resource/
  server context from that link without requiring trusted ids on every Action run. Complete trusted
  ids still conflict-check against existing source-link state before deployment admission.
- When the validated config contains runtime, network, or health profile fields, the endpoint
  applies them through `resources.configure-runtime`, `resources.configure-network`, and
  `resources.configure-health` before dispatching `deployments.create`.
- When the validated config contains `access.domains[]`, the endpoint resolves the trusted
  resource/destination and server proxy context, applies each domain through
  `domain-bindings.create` with deterministic idempotency keys, creates served domains before
  canonical redirect aliases, and only then dispatches `deployments.create`.
- When the validated config contains source, environment, or secret profile fields,
  the endpoint fails before mutation with `profile-application`; these fields still require later
  explicit-operation bootstrap slices.
- `/api/version` advertises granular feature flags. Self-hosted console builds that wire the
  source package config reader advertise Action Server Config Deploy support; builds without the
  reader keep failing wrapper handshakes before source package handoff.
- The active implemented self-hosted server route remains
  `POST /api/action/deployments/from-source-link`, which triggers an existing resource profile from
  source-link context.
- Inline archive and remote archive URL transport, source package storage, diagnostics, cleanup
  rules, and source/env/secret profile bootstrap are not implemented yet. Domain bootstrap is
  currently the managed `DomainBinding` control-plane path; pure SSH CLI server-applied route state
  remains the non-server mode.
