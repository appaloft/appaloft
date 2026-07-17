# Appaloft Deploy Action

Run Appaloft deployments from GitHub Actions.

The action supports two Action-owned deployment shapes and points to a separate control-plane-owned
preview product line. Pick the shape from state ownership first, not from how many ids you have in a
workflow. The default mode is a thin wrapper around the released `appaloft` binary for pure SSH
deployments. Self-hosted server API mode is available for repositories that deploy through an
Appaloft server. In the common self-hosted path, the workflow supplies only the control-plane URL,
deploy token, config path, and GitHub repository/ref/revision/preview context; the server resolves
the deployment target from token scope, existing source-link state, source binding, or one-time
trusted bootstrap context. Credentials, tokens, and secret values still come from trusted workflow
inputs or secrets.

## Deployment Modes

| Mode | Use when | What the action does | Required Appaloft context |
| --- | --- | --- | --- |
| Pure SSH Action | You want the fastest BYOS deployment to an SSH server. | Installs/runs the Appaloft CLI, connects over SSH, and deploys with `control-plane-mode: none`. SSH targets default to server-owned `ssh-pglite` state. | SSH host/user/key. No Appaloft console, no `project-id`, no `resource-id`, no `server-id`, and no `appaloft-token` are required. Source-link state is created once and reused later. |
| Self-hosted Server Action | You already run a self-hosted Appaloft console/API and want it to own state. | Does not run the CLI deployment path, open SSH, or select `state-backend`; it calls the selected control-plane API. | `control-plane-url` selects the Appaloft instance explicitly, and `appaloft-token` must authenticate mutation endpoints. Prefer `server-config-deploy: true` so the server reads `appaloft.yml`, applies profile/env/domain changes, then dispatches ids-only `deployments.create`. |
| Product-grade Preview | You want Appaloft Cloud or a self-hosted control plane to own PR preview policy, webhook intake, comments/checks, cleanup retry, scheduler, audit, and quota. | The product workflow is owned by the control plane, not this Action-only workflow file. | Configure preview policy and GitHub integration in the selected Appaloft instance. This is different from a repository-maintained Action-only PR preview. |

Multiple Appaloft instances are selected explicitly with `control-plane-url`. The action does not
scan SSH targets or networks to discover a console.

## Pure SSH Action

This is the default BYOS path. When no control plane is selected, the action installs the Appaloft
CLI and deploys over SSH. For SSH targets, Appaloft state defaults to `ssh-pglite` on the target
server, not the ephemeral GitHub runner.

```yaml
name: Deploy

on:
  push:
    branches: [main]
    paths:
      - "apps/api/**"
      - "packages/shared/**"

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: appaloft/deploy-action@v1
        with:
          version: v0.9.0
          config: appaloft.yml
          ssh-host: ${{ secrets.APPALOFT_SSH_HOST }}
          ssh-user: ${{ secrets.APPALOFT_SSH_USER }}
          ssh-private-key: ${{ secrets.APPALOFT_SSH_PRIVATE_KEY }}
```

Pin `version` to an Appaloft CLI release for production workflows. `version: latest` is useful for
quick experiments, but it trades repeatability for convenience.

GitHub's `on.push.paths` decides whether this workflow starts and can save runner time. It is
separate from Appaloft Resource auto-deploy `includePaths` / `excludePaths`, which are persisted
control-plane policy and evaluate the provider's final `before..after` change set. Keep both aligned
when you use both surfaces; a workflow run only proves that GitHub matched its workflow filters.

Minimal `appaloft.yml`:

```yaml
runtime:
  strategy: workspace-commands
  buildCommand: bun install && bun run build
  startCommand: bun run start
network:
  internalPort: 3000
```

Application secrets should be mapped by the workflow and referenced from config, not committed as
values:

```yaml
secrets:
  DATABASE_URL:
    from: ci-env:DATABASE_URL
```

Pure SSH Action does not need an Appaloft console. The first trusted deploy can create source-link
context in the SSH-server state; later deploys reuse that link automatically. Use source relink or a
trusted one-time bootstrap override only when you intentionally move the repository to another
project/resource/server context.

## Install Self-Hosted Console

Use `command: install-console` when a workflow should install or upgrade an Appaloft console on an
SSH host before other repositories deploy through `control-plane-mode: self-hosted`.

```yaml
name: Install Appaloft Console

on:
  workflow_dispatch:

jobs:
  install:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    environment:
      name: appaloft-console
      url: ${{ steps.console.outputs.console-url }}
    steps:
      - uses: appaloft/deploy-action@v1
        id: console
        with:
          command: install-console
          version: latest
          ssh-host: ${{ secrets.APPALOFT_CONSOLE_SSH_HOST }}
          ssh-user: ${{ secrets.APPALOFT_CONSOLE_SSH_USER }}
          ssh-private-key: ${{ secrets.APPALOFT_CONSOLE_SSH_PRIVATE_KEY }}
          console-domain: console.example.com
          console-database: postgres
          console-proxy: traefik
          console-orchestrator: compose
          console-skip-docker-install: true
```

The action connects to the SSH host, downloads the matching Appaloft release `install.sh`, runs the
self-hosted Docker installer with the selected public console origin and Docker orchestrator, and
verifies `/api/health`. This command is separate from `deploy`, so the pure SSH CLI deployment path
remains available.

Non-secret console install settings can live in the selected config file. SSH host, SSH key, API
tokens, and raw database credentials still come from trusted workflow inputs or secrets.

```yaml
controlPlane:
  mode: self-hosted
  url: https://console.example.com
  install:
    database: postgres
    domain: console.example.com
    proxy: traefik
    orchestrator: swarm
    httpPort: 3721
    swarmStackName: appaloft-console
    swarmInit: true
```

When `command: install-console` is used, explicit action inputs override the matching
`controlPlane.install.*` values. If `console-url` is omitted, the action uses
`controlPlane.install.url`, then `controlPlane.url`, then `https://<console-domain>`, and finally
`http://<ssh-host>:<console-http-port>`.

## Self-Hosted Server Action

Use this mode when a self-hosted Appaloft server owns deployment state and the repository should
trigger deployment through the server API. The deployment path does not invoke the CLI, open SSH,
choose a state backend, or mutate SSH-server PGlite.

Recommended server-config deploy:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    environment:
      name: production
      url: ${{ steps.deploy.outputs.deployment-url }}
    steps:
      - uses: actions/checkout@v4

      - uses: appaloft/deploy-action@v1
        id: deploy
        with:
          control-plane-mode: self-hosted
          control-plane-url: https://console.example.com
          appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
          server-config-deploy: true
          config: appaloft.yml
          source-revision: ${{ github.sha }}
          secret-variables: |
            APP_SECRET=ci-env:APP_SECRET
```

With `server-config-deploy: true`, the action performs a compatibility check against `/api/version`
and calls `POST /api/action/deployments/from-config-package`. This selects the active self-hosted server config workflow. The self-hosted server validates the source/config reference, reads
`appaloft.yml`, applies resource source/runtime/network/health/env/domain intent through Appaloft
operations, resolves target context from source-link state, deploy-token scope, source binding, or
trusted bootstrap context, and dispatches ids-only `deployments.create`.

For private GitHub repositories, pass `github-token: ${{ github.token }}`. In server config deploy
mode the action sends that token as a transient source-package credential so the self-hosted server
can read the committed config file for the checked-out revision and materialize the deployment
source through the same request-scoped provider credential. The token is not written into resource
profiles or deployment state.

For pull request workflows, set `source-revision` to
`${{ github.event.pull_request.head.sha }}` when the checkout uses the pull request head commit.
GitHub's default `GITHUB_SHA` can point at a temporary merge ref, which is useful for tests but is
not always reachable from the head branch that the runtime source profile uses.

`control-plane-url` is how you select the Appaloft instance. It is not inferred by scanning the SSH
target. `appaloft-token` is required for self-hosted Action mutation endpoints and is sent as an
HTTP bearer token; keep it in GitHub Secrets, not in repository config.

Non-secret connection policy can live in `appaloft.yml`:

```yaml
controlPlane:
  mode: self-hosted
  url: https://console.example.com
```

Project, environment, resource, server, and destination ids are not the normal user mental model.
Prefer source-link state, repository binding, and deploy-token scope. Use ids only for first
bootstrap, advanced override, or debugging when the server cannot resolve context yet:

```yaml
- uses: appaloft/deploy-action@v1
  id: deploy
  with:
    control-plane-mode: self-hosted
    control-plane-url: https://console.example.com
    appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
    server-config-deploy: true
    config: appaloft.yml
    project-id: ${{ secrets.APPALOFT_PROJECT_ID }}
    environment-id: ${{ secrets.APPALOFT_ENVIRONMENT_ID }}
    resource-id: ${{ secrets.APPALOFT_RESOURCE_ID }}
    server-id: ${{ secrets.APPALOFT_SERVER_ID }}
```

The selected config file may also carry a narrow `controlPlane.deploymentContext` for a deliberate
repository-to-resource bootstrap or advanced override:

```yaml
controlPlane:
  mode: self-hosted
  url: https://console.example.com
  deploymentContext:
    projectId: prj_www
    environmentId: env_prod
    resourceId: res_www
    serverId: srv_prod
    # destinationId is optional.
```

Do not put credentials, tokens, organization ids, provider account ids, database URLs, SSH keys, or
raw secret values in committed config.

Existing source-link trigger mode remains available when the resource profile already exists and
you intentionally leave `server-config-deploy` unset. It calls
`POST /api/action/deployments/from-source-link`. If ids are omitted, the server resolves context
from existing source-link state or a token scope that uniquely selects the target. If ids are
supplied, they are trusted bootstrap/debug context and must be complete enough for the server to
conflict-check against source-link state, token scope, and repository facts before mutation.

## Pull Request Preview

Action-only pull request previews require a workflow file. The action does not install a webhook or
make GitHub run previews on its own.

Pure SSH PR preview example:

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
      pull-requests: write
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
          version: v0.9.0
          config: appaloft.preview.yml
          preview: pull-request
          preview-id: pr-${{ github.event.pull_request.number }}
          preview-domain-template: pr-${{ github.event.pull_request.number }}.preview.example.com
          preview-tls-mode: disabled
          require-preview-url: true
          pr-comment: true
          github-token: ${{ github.token }}
          ssh-host: ${{ secrets.APPALOFT_SSH_HOST }}
          ssh-user: ${{ secrets.APPALOFT_SSH_USER }}
          ssh-private-key: ${{ secrets.APPALOFT_SSH_PRIVATE_KEY }}
          environment-variables: |
            HOST=0.0.0.0
            PORT=3000
          secret-variables: |
            DATABASE_URL=ci-env:DATABASE_URL
```

The default example skips fork pull requests before deployment credentials are exposed. Fork
previews need an explicit reduced-credential policy.

Use `appaloft.preview.yml` when the root config is production-oriented. Preview route intent should
come from generated/default access, trusted `preview-domain-template`, or
`preview.pullRequest.domainTemplate` in an explicitly selected preview config file. Production
`access.domains[]` should not be reinterpreted as pull request preview hostnames.

Use `config-profile` when one config file contains reviewable named variants:

```yaml
- uses: appaloft/deploy-action@v1
  with:
    config: appaloft.yml
    config-profile: staging
```

```yaml
preview:
  pullRequest:
    domainTemplate: pr-{pr_number}.preview.example.com
    tlsMode: disabled
```

Self-hosted server-config preview uses the same control-plane API boundary:

```yaml
- uses: appaloft/deploy-action@v1
  id: deploy
  with:
    control-plane-mode: self-hosted
    control-plane-url: https://console.example.com
    appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
    server-config-deploy: true
    config: appaloft.preview.yml
    source-revision: ${{ github.event.pull_request.head.sha }}
    preview: pull-request
    preview-id: pr-${{ github.event.pull_request.number }}
    require-preview-url: true
    environment-variables: |
      HOST=0.0.0.0
      PORT=4321
```

In `server-config-deploy` mode, preview route and environment inputs are transient API payload.
They are not committed to `appaloft.yml`, and production config domains are not reused for PR
preview routing unless a future preview-safe policy explicitly selects them.

## Preview Cleanup

Action-only cleanup is explicit. Add a separate close-event workflow so preview runtime and route
state are cleaned when the pull request closes.

Pure SSH cleanup:

```yaml
name: Appaloft Preview Cleanup

on:
  pull_request:
    types: [closed]

jobs:
  cleanup:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - uses: appaloft/deploy-action@v1
        with:
          command: preview-cleanup
          version: v0.9.0
          config: appaloft.preview.yml
          preview: pull-request
          preview-id: pr-${{ github.event.pull_request.number }}
          pr-comment: true
          github-token: ${{ github.token }}
          ssh-host: ${{ secrets.APPALOFT_SSH_HOST }}
          ssh-user: ${{ secrets.APPALOFT_SSH_USER }}
          ssh-private-key: ${{ secrets.APPALOFT_SSH_PRIVATE_KEY }}
```

Self-hosted server cleanup:

```yaml
- uses: appaloft/deploy-action@v1
  with:
    command: preview-cleanup
    control-plane-mode: self-hosted
    control-plane-url: https://console.example.com
    appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
    config: appaloft.preview.yml
    preview: pull-request
    preview-id: pr-${{ github.event.pull_request.number }}
```

Cleanup is idempotent. It stops preview-owned runtime state when present, removes preview route
desired state, unlinks preview source identity, and preserves production deployments and ordinary
deployment history. In self-hosted server API mode, cleanup resolves context from server-owned
preview source-link state; project/resource/server ids are not accepted for cleanup.

## Pull Request Comments

When `pr-comment: true`, the action posts or updates one stable pull request comment with the
preview URL, console URL, deployment detail URL, or cleanup status that is available for the
selected mode.

The workflow must pass `github-token: ${{ github.token }}` and grant `pull-requests: write` or
`issues: write`. This is entrypoint feedback only; product-grade GitHub App comments/checks remain
control-plane features. Comment publishing is best-effort: GitHub API permission failures are
reported as warnings and do not fail an otherwise successful deployment or cleanup.

## Product-Grade Previews

This action supports workflow-file previews. Product-grade previews are owned by Appaloft Cloud or
a self-hosted control plane with preview policy, GitHub App webhook verification, comments/checks,
cleanup retries, scheduler ownership, quotas, audit, and managed route/domain follow-up.

Use product-grade previews when you want Appaloft to own preview lifecycle and cleanup instead of
requiring every repository to maintain deploy and close-event workflow files.
Explicit action inputs override config values. `config-profile` is a trusted selector for
`profiles.<key>` in the repository config; it is not an Appaloft Environment selector. Project,
environment, resource, and server ids are advanced bootstrap/debug inputs; ordinary deploys should
rely on source-link state, deploy-token scope, source binding, or the Appaloft server. Tokens, SSH
identity, database identity, and provider account identity must never come from committed config.

## Inputs

| Input | Default | Purpose |
| --- | --- | --- |
| `command` | `deploy` | `deploy`, `preview-cleanup`, or `install-console`. |
| `version` | `latest` | Appaloft release tag such as `v0.9.0`, `latest`, or `source`. `source` builds a deploy CLI from the checked-out Appaloft source tree without packaging embedded console or docs assets, and requires Bun on `PATH`. Release values are also used for self-hosted console install. |
| `config` | empty | Optional Appaloft config path. If omitted, `appaloft.yml` is used only when present. |
| `config-profile` | empty | Trusted selector for `profiles.<key>` in the selected config file. Does not select project, environment, resource, server, destination, or provider identity. |
| `source` | `.` | Source path or locator passed to the CLI. |
| `source-revision` | `GITHUB_SHA` | Explicit revision for self-hosted server config deploy source packages. Use the PR head SHA when deploying a checked-out pull request head. |
| `runtime-name` | empty | Trusted runtime name override for pure SSH deploy. |
| `ssh-host` | empty | SSH target host for pure SSH deployments. |
| `ssh-user` | empty | SSH username. |
| `ssh-port` | empty | SSH port. |
| `ssh-private-key` | empty | SSH private key value, written to a temp file before invoking Appaloft. |
| `ssh-private-key-file` | empty | Existing runner-local private key path. Mutually exclusive with `ssh-private-key`. |
| `console-url` | empty | Public console origin for `command: install-console`. Defaults to `https://<console-domain>` or `http://<ssh-host>:<console-http-port>`. |
| `console-domain` | empty | Public console domain used to derive `console-url` when `console-url` is empty. |
| `console-database` | config or `postgres` | Self-hosted console database backend for `command: install-console`; `pglite` or `postgres`. |
| `console-orchestrator` | config or `compose` | Self-hosted Docker orchestrator for `command: install-console`; `compose` or `swarm`. |
| `console-proxy` | config or `traefik` | Self-hosted console proxy mode for `command: install-console`; `traefik` or `none`. |
| `console-http-host` | config or `0.0.0.0` | Host bind address passed to the self-hosted console installer. |
| `console-http-port` | config or `3721` | Host HTTP port passed to the self-hosted console installer. |
| `console-install-dir` | empty | Remote install directory passed to the self-hosted console installer. Empty uses the installer default. |
| `console-compose-project-name` | config or `appaloft` | Docker Compose project name passed to the self-hosted console installer. |
| `console-swarm-stack-name` | config or `appaloft` | Docker Swarm stack name passed to the self-hosted console installer. |
| `console-swarm-init` | config or `false` | Initialize a single-node Swarm manager when `console-orchestrator` is `swarm`. |
| `console-swarm-advertise-addr` | empty | Optional advertise address passed to `docker swarm init`. |
| `console-image` | config or `ghcr.io/appaloft/appaloft` | Appaloft console image repository or full image reference passed to the self-hosted console installer. |
| `console-installer-url` | empty | Override URL for the self-hosted `install.sh` used by `command: install-console`. |
| `console-skip-docker-install` | `false` | Require Docker Engine to already exist on the SSH host during `command: install-console`. |
| `console-trace` | config or `none` | Optional trace collector for `command: install-console`; `none` or `jaeger`. |
| `console-jaeger-image` | empty | Jaeger all-in-one image passed to the installer when `console-trace` is `jaeger`. |
| `console-jaeger-ui-host` | empty | Jaeger UI bind host passed to the installer when `console-trace` is `jaeger`. |
| `console-jaeger-ui-port` | empty | Jaeger UI host port passed to the installer when `console-trace` is `jaeger`. |
| `server-provider` | `generic-ssh` | Server provider key for pure SSH deployments. |
| `server-proxy-kind` | empty | Server proxy kind such as `traefik` or `caddy`. |
| `state-backend` | empty | Explicit state backend. SSH targets default to `ssh-pglite`. |
| `environment-variables` | empty | Newline-separated values passed as repeated CLI `--env` flags in pure SSH CLI mode. In `server-config-deploy` pull request previews, sent as transient server API payload after committed `env` values. |
| `secret-variables` | empty | Newline-separated values passed as repeated CLI `--secret` flags in pure SSH CLI mode. In `server-config-deploy` mode, resolves committed `ci-env:` secret references and sends matched values as transient server API payload. |
| `preview` | empty | Use `pull-request` for PR preview deploy or cleanup. |
| `preview-id` | empty | Trusted preview scope, for example `pr-123`. Required for pull request previews. |
| `preview-domain-template` | empty | Trusted preview hostname for deploy, for example `pr-123.preview.example.com`. |
| `preview-tls-mode` | empty | Preview TLS mode for `preview-domain-template`. |
| `require-preview-url` | `false` | Fail deploy if no public preview URL can be resolved. |
| `pr-comment` | `false` | Post or update one pull request comment with preview, deployment, cleanup, and console feedback. |
| `github-token` | empty | GitHub token used for PR comments and, in `server-config-deploy` mode, as a transient credential for reading committed config from private repositories. |
| `control-plane-mode` | empty | Use `none` for pure SSH CLI mode or `self-hosted` for server API mode. When empty, `controlPlane.mode` from config may select the mode; otherwise the effective default is `none`. |
| `control-plane-url` | empty | Required for self-hosted server API mode unless `controlPlane.url` supplies the endpoint. Selects the Appaloft instance explicitly. |
| `appaloft-token` | empty | Bearer deploy token for self-hosted Action mutation endpoints. Required for server API deploy, server-config-deploy, and server-mode preview cleanup. |
| `use-oidc` | `false` | Reserved for future GitHub OIDC exchange. |
| `server-config-deploy` | `false` | Active self-hosted server config deploy mode that calls `POST /api/action/deployments/from-config-package` after the server advertises source package and server-side config bootstrap support. |
| `project-id` | config or empty | Advanced trusted bootstrap/debug project id for server API mode. Defaults to `controlPlane.deploymentContext.projectId` when present. |
| `environment-id` | config or empty | Advanced trusted bootstrap/debug environment id for server API mode. Defaults to `controlPlane.deploymentContext.environmentId` when present. Required only when any explicit deployment id is supplied. |
| `resource-id` | config or empty | Advanced trusted bootstrap/debug resource id for server API mode. Defaults to `controlPlane.deploymentContext.resourceId` when present. Required only when any explicit deployment id is supplied. |
| `server-id` | config or empty | Advanced trusted bootstrap/debug deployment target id for server API mode. Defaults to `controlPlane.deploymentContext.serverId` when present. Required only when any explicit deployment id is supplied. |
| `destination-id` | config or empty | Advanced trusted bootstrap/debug destination id for server API mode. Defaults to `controlPlane.deploymentContext.destinationId` when present. |

## Outputs

| Output | Purpose |
| --- | --- |
| `appaloft-version` | Installed CLI version. |
| `appaloft-target` | Selected release target. |
| `preview-id` | Preview id when preview mode is selected. |
| `preview-url` | Public preview URL when Appaloft resolves one during deploy. |
| `deployment-id` | Deployment id accepted by Appaloft. |
| `deployment-url` | Self-hosted Appaloft console deployment detail URL when available. |
| `console-url` | Self-hosted Appaloft console URL installed by `install-console` or used by server API mode. |
| `preview-cleanup-status` | Cleanup status returned by server API mode for `command: preview-cleanup`. |

## Security Notes

- `ssh-private-key` is written to a runner temp file with mode `0600`; raw key material is not
  passed as a command-line argument.
- Do not commit SSH keys, tokens, database URLs, production secret values, organization/tenant/
  provider account identity, or broad Appaloft target identity into `appaloft.yml`.
- The action defaults SSH deployments to server-owned `ssh-pglite` state when `ssh-host` is set and
  no control plane is selected.
- `control-plane-mode: self-hosted` does not accept SSH keys or `state-backend`; the action calls
  the Appaloft server API and leaves state ownership with the server.
- In self-hosted server API mode, mutation endpoints require `appaloft-token`. Missing or invalid
  tokens fail as `401`, and scope failures fail as `403`, before source-link, resource, route,
  preview cleanup, or deployment mutation.
- Current implementation note: the composite wrapper still runs its shared binary install/setup
  step before dispatch. In self-hosted server API mode that binary is not used as the deployment
  executor; deployment and cleanup mutations are API calls to the selected control plane.
- `server-config-deploy` requires explicit self-hosted server support. The action fails before
  source package handoff when the server handshake does not advertise the required capability.
- If the server cannot resolve a target from source-link state, token scope, source binding, or
  trusted bootstrap context, it returns a structured error before config/profile/route/deployment
  mutation. Link the repository in the console, run source-link relink, or pass one-time bootstrap
  ids.
- In `server-config-deploy` mode, `secret-variables` supports only `KEY=ci-env:NAME` references.
  Missing runner environment values fail before the server API request, and raw secret values are
  not written to step summaries or PR comments.
- `pr-comment` requires explicit workflow permission and token wiring. The action updates the same
  marker comment for the PR instead of creating a new comment on each run. Comment API failures are
  warnings so they do not mask a successful deployment.
