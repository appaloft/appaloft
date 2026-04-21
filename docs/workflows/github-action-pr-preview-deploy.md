# GitHub Action PR Preview Deploy Workflow Spec

## Normative Contract

GitHub Action PR preview deploy is an Action-owned entry workflow over repository config Quick
Deploy. It is not a new business command and it is not the product-grade GitHub App preview
lifecycle.

The first Action-supported shape is:

```text
GitHub pull_request event
  -> user-authored workflow checks out the PR source
  -> appaloft/deploy-action installs and verifies the Appaloft CLI
  -> action resolves trusted PR preview context from GitHub event metadata
  -> repository config bootstrap resolves profile fields, SSH state, source link, and identity
  -> existing environment/resource/deployment commands create or update the preview target
  -> deployments.create accepts the deployment attempt with ids-only input
  -> default or custom preview access route is realized through the edge proxy when available
  -> action emits a preview URL output when a public route exists
```

The workflow must keep these boundaries:

- A workflow file is required. Installing the action package does not make GitHub run anything.
- The action deploys only when the user workflow subscribes to `pull_request` events.
- The action can deploy or update a preview on `opened`, `reopened`, and `synchronize`.
- PR close cleanup is a separate explicit close-event workflow over `deployments.cleanup-preview`;
  it is not implied by preview deploy success and it is not retried automatically in pure Action
  mode.
- Product-grade preview creation, policy, cleanup, comments, audit, scheduler behavior, and
  no-workflow GitHub App execution remain future control-plane behavior.

## Global References

This workflow inherits:

- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [Repository Deployment Config File Bootstrap](./deployment-config-file-bootstrap.md)
- [Control-Plane Mode Selection And Adoption](./control-plane-mode-selection-and-adoption.md)
- [Default Access Domain And Proxy Routing](./default-access-domain-and-proxy-routing.md)
- [Edge Proxy Provider And Route Realization](./edge-proxy-provider-and-route-realization.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Control-Plane Modes Test Matrix](../testing/control-plane-modes-test-matrix.md)
- [GitHub Action Deploy Wrapper Implementation Plan](../implementation/github-action-deploy-action-plan.md)
- [Control-Plane Modes Roadmap](../implementation/control-plane-modes-roadmap.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Trigger Contract

The action does not subscribe to GitHub events by itself. A repository owner must add a workflow
similar to:

```yaml
name: Appaloft Preview

on:
  pull_request:
    types: [opened, reopened, synchronize]

jobs:
  preview:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    permissions:
      contents: read
    environment:
      name: preview-pr-${{ github.event.pull_request.number }}
      url: ${{ steps.deploy.outputs.preview-url }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}

      - uses: appaloft/deploy-action@v1
        id: deploy
        with:
          version: v0.1.0
          config: appaloft.preview.yml
          preview: "pull-request"
          preview-id: pr-${{ github.event.pull_request.number }}
          ssh-host: ${{ secrets.APPALOFT_SSH_HOST }}
          ssh-user: ${{ secrets.APPALOFT_SSH_USER }}
          ssh-private-key: ${{ secrets.APPALOFT_SSH_PRIVATE_KEY }}
```

When this workflow exists on the base branch, GitHub attempts the job for matching pull request
events according to GitHub Actions rules. If the workflow is absent, disabled, filtered by branch,
or guarded by an `if:` condition, no preview deployment is attempted.

Fork pull requests must be skipped by default in examples because repository secrets are not a safe
execution source for untrusted code. A repository may opt into fork previews only with deliberate
policy, reduced secrets, and an accepted security model.

## Preview Config Selection And Overrides

Preview mode must not rewrite repository config files. It resolves config in two separate steps:

1. Select the config file.
2. Apply the selected profile to the preview environment already chosen by trusted entrypoint
   context.

The first supported shape may use the action `config` input when the repository root config is
not preview-safe:

```yaml
with:
  config: appaloft.preview.yml
  preview: pull-request
  preview-id: pr-${{ github.event.pull_request.number }}
```

Using `appaloft.yml` is valid only when that file is intentionally environment-neutral or the
repository owner explicitly accepts it for previews. Preview docs and generated examples should not
assume a root config is safe for PR deploys because it may contain production runtime choices,
environment values, or custom domain intent.

Config files are not required for Action preview deploys. Trusted action inputs, workflow
environment, CLI flags, and future MCP/tool parameters may provide the same canonical profile
fields that repository config supports: runtime strategy and commands, publish directory, network
profile, health path, non-secret env values, `ci-env:` secret references, and preview custom-route
policy. These inputs feed the same config bootstrap/Quick Deploy profile path and must not be
translated into `deployments.create` fields. A workflow must not generate a temporary config file as
the normal way to pass values that the CLI/action input surface already models.

Field precedence after a config file is selected follows the repository config bootstrap contract:

```text
built-in defaults
  < source/framework detection
  < selected repository config base profile
  < selected repository config overlay for the already-selected preview environment
  < trusted action inputs, workflow env, CLI flags, or future MCP parameters
```

The current parser does not need to support preview overlays before Action preview can ship. The
preview-safe first implementation is a separate config path such as `appaloft.preview.yml` plus
trusted GitHub Actions environment variables and secrets. A future schema may add explicit
environment/profile overlays, but those overlays may apply only after the PR entrypoint has selected
`preview-pr-123`; a committed config overlay must not select or retarget the environment, project,
resource, server, destination, or credentials.

Application values that differ in preview should be supplied through preview-scoped GitHub
environment variables or secrets and referenced either from config with `ci-env:<NAME>` or from a
trusted action/CLI secret flag that resolves the same `ci-env:<NAME>` reference. The action sees
only the runner environment after GitHub policy has selected the job environment.

Custom route intent for PR previews should come from one of these sources:

- generated/default access;
- trusted `preview-domain-template`;
- an explicitly selected preview config file or future selected preview overlay.

The action/CLI must not infer that a production `access.domains[]` entry in an implicitly discovered
root config is a PR preview hostname simply because `preview=pull-request` is set.

## Preview Identity

PR preview identity is trusted entrypoint context, not committed repository config identity.

The action may pass these trusted context fields to the CLI:

- repository id or full name from the GitHub event;
- pull request number;
- head repository id/full name;
- head branch/ref;
- head commit SHA for source checkout;
- base branch/ref;
- workflow run id and attempt id for diagnostics.

The preview source fingerprint must include the PR scope so a PR preview does not reuse the normal
branch or production resource link:

```text
provider repository identity
  + source base directory
  + config file identity
  + preview scope kind `pull-request`
  + pull request number
  + head repository identity when different from base repository
```

The fingerprint should not include every commit SHA. New commits to the same PR should update the
same preview resource/environment unless the operator explicitly relinks or changes preview scope.

The default environment key should be derived from the PR id, for example `preview-pr-123`. This is
an entry-workflow selection rule over `environments.create` / `environments.list`, not a committed
config selector.

## Operation Sequence

For Action-only preview deploy, the workflow uses existing operations:

```text
resolve preview context
  -> resolve control-plane mode, defaulting to none
  -> resolve SSH target and credential from action inputs/secrets
  -> ensure, lock, migrate, and sync SSH-server PGlite when mode is none
  -> resolve or create preview-scoped source link
  -> create or select project from trusted source state/defaults
  -> create or select preview environment
  -> create or select preview resource from preview-scoped link
  -> apply config env and secret references through environment operations
  -> deployments.create(projectId, environmentId, resourceId, serverId, destinationId?)
  -> realize proxy route when the resolved resource/network/access state has a route
```

`deployments.create` remains ids-only. PR number, branch name, GitHub repository, preview domain
template, route host, proxy kind, and TLS mode must not become deployment command fields.

## Access, Proxy, And Domain Policy

Preview access uses the same access model as regular deployments.

### Edge Proxy

A public preview URL for an HTTP resource requires reverse-proxy exposure and an edge proxy on the
selected server. The proxy provider realizes routes to `ResourceNetworkProfile.internalPort`.
Appaloft must not publish random host ports as a fallback.

Multiple PR previews may use the same internal application port because route and workload
replacement are scoped by resource/deployment identity, not by the port number alone.

If the selected server has no proxy intent, proxy bootstrap failed, or the resource is not inbound
HTTP, the deployment may still succeed without a public preview URL when route policy says access is
optional. The action must surface that as "deployed, no public preview URL" rather than inventing a
direct-port route.

### Default Generated Access

If no custom preview domain is configured, the action should rely on the configured generated
default access provider.

For the default `sslip` provider, users do not need to create DNS records when:

- the server has a public IPv4 address;
- the edge proxy is reachable on the required public ports;
- the default access provider is enabled in the installation;
- the provider can generate a valid hostname from the server public address.

The generated hostname is provider-owned and may look like:

```text
<resource-label>.<server-ip>.sslip.io
```

It is not a durable custom domain binding, not proof of domain ownership, and not a managed
certificate lifecycle record. The scheme is provider/policy dependent. The current `sslip`
provider defaults to HTTP unless the installation configures HTTPS-capable generated access and
the edge proxy can satisfy TLS.

If the default provider is disabled, lacks a usable public address, or cannot generate a hostname,
the preview deploy should continue without a preview URL only when generated access is optional for
the selected workflow. Diagnostics must explain the missing URL using structured route phases.

### Custom Preview Domains

Stable custom PR hostnames such as `pr-123.preview.example.com` require user-owned DNS in
Action-only mode.

The user must point a wildcard record such as:

```text
*.preview.example.com -> selected server public address
```

to the deployment target before Appaloft can serve those hosts. Appaloft does not change public DNS
records in `controlPlane.mode: none`.

The preview host template is trusted entrypoint or installation policy, not `deployments.create`
input. The first accepted shape is an action input or static server/default-access policy such as:

```yaml
with:
  preview-domain-template: pr-${{ github.event.pull_request.number }}.preview.example.com
```

The action must render the template only from trusted GitHub event values and pass the resulting
host into the same server-applied route desired-state path used by `access.domains[]` in pure
SSH mode. The rendered host is stored as target-local route state in SSH-server PGlite and realized
through the edge proxy. It does not create a managed `DomainBinding`.

If `tlsMode = auto` is used for a custom preview host, the resident edge proxy/provider owns
certificate automation in Action-only mode. Users remain responsible for DNS pointing at the server
and for opening the required public challenge/ingress ports. If the selected provider has not been
configured for certificate automation yet, the preview workflow should select `tlsMode = disabled`
through trusted `preview-tls-mode`/route input and publish an HTTP preview URL instead of serving a
default TLS certificate.

## Secrets And Fork Safety

Action preview deployments run unmerged code. Examples must protect production secrets by default.

Rules:

- Use preview-scoped GitHub Secrets or environment secrets where possible.
- Map application secrets into environment variables and reference them from config as
  `ci-env:<NAME>`.
- Do not put raw secret values, SSH keys, tokens, database URLs, or provider credentials in
  `appaloft.yml`.
- Skip fork PR previews by default.
- If a repository opts into fork PR previews, use no production secrets and no high-privilege target
  credentials unless a future accepted policy says otherwise.

Production custom domain state and production environment variables must not be reused for preview
by default. A preview workflow may choose separate GitHub environment names such as
`preview-pr-123` so GitHub environment secret policy can also separate preview from production.

## GitHub Status And Comments

The first Action-only implementation should emit action outputs instead of requiring GitHub App
permissions:

| Output | Meaning |
| --- | --- |
| `preview-id` | Stable preview scope such as `pr-123`. |
| `preview-url` | Public URL when generated or custom access was realized. |
| `deployment-id` | Appaloft deployment attempt id when machine-readable CLI output supports it. |
| `resource-id` | Preview resource id when machine-readable CLI output supports it. |
| `diagnostic-path` | Optional sanitized diagnostic artifact path. |

GitHub's `environment.url` can display `preview-url` in the PR checks UI. A repository may add a
separate `actions/github-script` step to comment the URL, but bot comments are not required for the
first Appaloft Action contract.

Product-grade comments, check runs, deployment status synchronization, preview policies, and PR
close cleanup belong to the future GitHub App/control-plane track.

## Cleanup And Expiration

Action-only PR preview cleanup is supported only when a repository explicitly runs a close-event
workflow.

The close flow is:

```text
pull_request closed
  -> user workflow runs Appaloft CLI preview cleanup or a thin wrapper over the same CLI command
  -> Appaloft resolves preview-scoped source link
  -> deployments.cleanup-preview stops preview runtime state when present
  -> preview server-applied route desired state is deleted
  -> preview source link is unlinked
  -> command returns cleaned or already-clean
```

The command is idempotent when the preview source link is already absent. Product-grade GitHub App
previews still own cleanup through a control plane, scheduler, or server agent rather than relying
on one GitHub Actions close event always succeeding.

## Product-Grade Preview Path

Product-grade GitHub preview environments require a control plane. The future shape is:

```text
GitHub App installation
  -> Appaloft Cloud or self-hosted control plane receives pull_request/push webhooks
  -> control plane applies preview policy, fork policy, secret policy, and quotas
  -> control plane creates or updates preview environment/resource/source link
  -> runner/agent or GitHub Action execution deploys the preview
  -> control plane writes comments/checks/deployment statuses
  -> control plane cleans up on PR close and by scheduled expiry
```

That product line may support:

- no workflow file required when GitHub App execution is selected;
- PR comments and check runs from the Appaloft GitHub App;
- preview policy list/show/update;
- preview environment list/show/delete;
- scoped preview environment variables and secrets;
- durable audit and billing/cost visibility;
- cleanup retries and scheduled expiration;
- managed custom domains, DNS observation, and certificate lifecycle when the control plane owns
  those integrations.

The same repository config and operation contracts still apply. Product-grade preview orchestration
must not add source/runtime/domain fields to `deployments.create`.

## Error Semantics

Canonical preview-specific phases:

- `preview-context-resolution`;
- `preview-source-link-resolution`;
- `preview-domain-template-resolution`;
- `preview-access-resolution`;
- `preview-cleanup`;
- `github-action-output`.

Expected errors:

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `preview-context-resolution` | No | Required PR event context is missing or malformed. |
| `validation_error` | `validation` | `preview-domain-template-resolution` | No | A preview domain template renders an invalid host or uses untrusted variables. |
| `default_access_route_unavailable` | `application` or `integration` | `preview-access-resolution` | Conditional | No generated/custom preview route can be resolved when the workflow requires a URL. |
| `infra_error` or `provider_error` | `application` or `integration` | `preview-cleanup` | Conditional | Preview runtime cleanup, route-state deletion, or source-link unlink failed after preview context resolution. |

Errors must include sanitized preview id, repository identity, pull request number, selected access
mode, and route phase when useful. They must not include SSH keys, tokens, raw secret values,
database URLs, or resolved application secret values.

## Current Implementation Notes And Migration Gaps

Current implementation supports the underlying CLI config deploy path, SSH-server PGlite state,
preview-scoped source fingerprints, non-interactive preview environment selection,
`--preview-domain-template` server-applied route intent, explicit preview config paths, and the
implicit-root-domain skip rule needed for Action-style execution. CLI/action profile flags must
remain in sync with config profile fields so Action previews can be expressed without generating a
temporary config file. The public `appaloft/deploy-action` repository is not yet implemented.

Missing pieces before Action PR preview can be documented as supported:

- `appaloft/deploy-action` wrapper repository and Marketplace README;
- wrapper inputs that map `preview`, `preview-id`, and optional `preview-domain-template` to the
  CLI;
- stable machine-readable CLI output for `preview-url` or an action-safe diagnostic file the
  wrapper can parse;
- wrapper tests for install, secret mapping, fork-safety docs, generated access output, and cleanup
  unsupported behavior;
- public docs that distinguish Action-only preview deploy from product-grade GitHub App previews.

Missing pieces for product-grade previews:

- GitHub App/webhook ingestion;
- preview environment policy commands and read models;
- scheduler-owned close-event handling, retries, and audit around preview cleanup;
- scheduler/agent cleanup retries;
- Cloud/self-hosted source links, locks, audit, and managed domain mapping.
