---
title: "Preview deployments"
description: "Run pull request previews safely, clean them up, and understand when control-plane previews are needed."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "pull request preview"
  - "PR preview"
  - "preview environment"
  - "deploy-action"
  - "GitHub App preview"
relatedOperations:
  - deployments.create
  - deployments.cleanup-preview
  - preview-policies.configure
  - preview-policies.show
  - preview-environments.list
  - preview-environments.show
  - preview-environments.delete
sidebar:
  label: "Previews"
  order: 3
---

<h2 id="deployment-pr-preview-action-workflow">Action-only pull request previews</h2>

Action-only previews run from a GitHub Actions workflow that you own. The workflow checks out a pull request, maps trusted GitHub context into Appaloft preview flags, deploys through the normal deployment path, and optionally publishes a preview URL.

The simplest BYOS shape is Pure SSH Action: default `control-plane-mode: none`; the Action
installs/runs the CLI, deploys over SSH, and uses server-owned `ssh-pglite` state on the SSH
target. This path does not require an Appaloft console, deploy token, project id, resource id, or
server id. After the first deploy creates source-link state, later deploys reuse it automatically.

Use this path when:

- your repository can run a workflow on `pull_request`;
- deployment credentials live in GitHub Secrets or another workflow secret store;
- you want Appaloft to reuse the same source, resource profile, environment, server, and route rules as normal CLI/config deployments;
- a separate close-event workflow can run cleanup.

For same-repository pull requests, a workflow can call the Appaloft CLI with preview context:

```bash
appaloft deploy . \
  --config appaloft.preview.yml \
  --preview pull-request \
  --preview-id "pr-${PR_NUMBER}" \
  --preview-domain-template "pr-${PR_NUMBER}.preview.example.com" \
  --preview-tls-mode disabled \
  --require-preview-url
```

The preview flags select preview identity and route policy outside committed config. They do not add pull request, branch, source, route, or preview fields to `deployments.create`.

The public `appaloft/deploy-action` wrapper maps trusted workflow inputs to the same preview flags. Use the CLI shape directly when you need local debugging or wrapper behavior that has not shipped yet.

<h2 id="deployment-action-self-hosted-server-mode">Self-hosted server Action mode</h2>

For repositories that already have a self-hosted Appaloft console/API,
`appaloft/deploy-action` can trigger the server API instead of running CLI/SSH from the GitHub
runner. `control-plane-url` must explicitly select the Appaloft instance, and `appaloft-token`
must authenticate the Action mutation endpoint:

```yaml
- uses: appaloft/deploy-action@v1
  id: deploy
  with:
    control-plane-mode: self-hosted
    control-plane-url: https://console.example.com
    appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
    server-config-deploy: true
    config: appaloft.yml
    secret-variables: |
      APP_SECRET=ci-env:APP_SECRET
```

Prefer `server-config-deploy: true`. In this mode the Action performs the server handshake, sends a
bounded GitHub source/config reference, resolves `ci-env:` secrets from the runner environment, and
calls the server API. The deployment path does not invoke the CLI, open SSH, select a state backend,
or mutate SSH-server PGlite state. The current composite wrapper may still run shared binary setup
before dispatch, but self-hosted deployment and cleanup mutations are API calls to the selected
control plane. The server validates committed config, applies
runtime/network/health/env/domain settings through Appaloft operations, resolves source-link or
repository binding context, then dispatches ids-only deployment admission.

Without `server-config-deploy`, this server API slice requires the project, environment, resource, and deployment target to already be resolvable by the Appaloft server. The Action calls the server source-link deployment route. The server resolves context from existing source-link state or a deploy token whose scope uniquely selects the target. Explicit ids are advanced bootstrap/debug inputs only and must match source-link state, token scope, and trusted repository facts. That path does not apply `appaloft.yml`, upload a source archive, create resources, open SSH, or mutate SSH-server PGlite state.

Project, environment, resource, and server ids should not be the default user mental model. Prefer
server resolution from source-link state, repository binding, deploy-token scope, and GitHub
repository/config fingerprints. When no binding exists, use one trusted bootstrap or advanced
override:

```yaml
- uses: appaloft/deploy-action@v1
  id: deploy
  with:
    control-plane-mode: self-hosted
    control-plane-url: https://console.example.com
    appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
    config: appaloft.yml
    server-config-deploy: true
    secret-variables: |
      APP_SECRET=ci-env:APP_SECRET
```

In this mode the Action performs the server handshake, sends a bounded GitHub source/config
reference, resolves `ci-env:` secrets from the runner environment, and calls the server API. The
runner still does not install the CLI, open SSH, select a state backend, or mutate SSH-server PGlite
state. The server validates the committed config, rejects identity and raw secret fields, applies
runtime/network/health/env/domain settings through Appaloft operations, then dispatches ids-only
deployment admission. If no existing source link, token scope, source binding, or trusted bootstrap
context identifies the target, the server fails before mutation and tells you to link the source,
run source-link relink, or pass one-time bootstrap ids.

Self-hosted server mode can also trigger PR preview deploys:

```yaml
- uses: appaloft/deploy-action@v1
  id: deploy
  with:
    control-plane-mode: self-hosted
    control-plane-url: https://console.example.com
    appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
    server-config-deploy: true
    config: appaloft.preview.yml
    preview: pull-request
    preview-id: pr-${{ github.event.pull_request.number }}
    preview-domain-template: pr-${{ github.event.pull_request.number }}.preview.example.com
    preview-tls-mode: disabled
    require-preview-url: true
```

Server-mode preview deploys use a preview-scoped source fingerprint and write `preview-id`,
`deployment-id`, `console-url`, and, when configured, `preview-url` outputs.
The preview fingerprint resolves independently from the production branch target unless an accepted
preview binding or token/source scope explicitly selects the same target. `preview-domain-template`
and `preview-tls-mode` are applied as transient server-side preview route intent;
`environment-variables` and `secret-variables` can carry preview-specific runtime values. Preview
cleanup resolves context from preview source-link state and does not accept project/resource/server
ids.

The non-secret control-plane connection policy may also live in `appaloft.yml`:

```yaml
controlPlane:
  mode: self-hosted
  url: https://console.example.com
```

Keep token, SSH, database identity, organization/tenant/provider account identity, and broad target identity out of committed config. Project, environment, resource, and server ids are optional advanced bootstrap context only; ordinary self-hosted Action deploys should let source links, token scope, source binding, or the Appaloft server resolve them.
`controlPlane.deploymentContext` is a narrow bootstrap/advanced override exception for intentionally
binding a repository to an existing self-hosted project/environment/resource/server. It is not a
default set of ids every workflow should maintain.

<h2 id="deployment-pr-preview-output">Preview URL output</h2>

Preview deploys can expose a URL from generated/default access or from a trusted preview domain template. Generated access works when the selected server has a usable generated access provider and public address. A custom preview host such as `pr-123.preview.example.com` requires wildcard DNS that already points at the selected server.

Use `--require-preview-url` when the workflow should fail if Appaloft cannot observe a public preview route. Without that flag, deployment may still be accepted and visible with diagnostics even when no public URL is available.

<h2 id="deployment-pr-preview-cleanup-workflow">Close-event cleanup</h2>

Action-only cleanup is explicit. Add a `pull_request.closed` workflow that runs:

```bash
appaloft preview cleanup . \
  --config appaloft.preview.yml \
  --preview pull-request \
  --preview-id "pr-${PR_NUMBER}"
```

Cleanup is idempotent. It stops preview-owned runtime state when present, removes preview route desired state, unlinks preview source identity, and preserves production deployments and ordinary deployment history.

<h2 id="deployment-preview-fork-safety">Fork safety and secrets</h2>

Do not expose deployment credentials to untrusted fork pull requests. The default safe pattern is to skip fork previews unless you have an explicit reduced-credential policy.

Secrets should come from GitHub Secrets or another trusted workflow secret store and be passed as secret references such as `ci-env:NAME`. Do not commit SSH keys, tokens, database URLs, production secret values, or Appaloft project/resource/server identity into `appaloft.yml`. Use narrow `controlPlane.deploymentContext` only for one-time bootstrap or advanced override.

<h2 id="product-grade-preview-deployments">Product-grade control-plane previews</h2>

Product-grade previews are an Appaloft Cloud or self-hosted control-plane workflow. They are not the same as Action-only previews maintained by each repository's workflow file.

That product line uses signed GitHub webhooks, preview policy, fork and secret policy, preview environment list/show/delete, comments/checks/status feedback, cleanup retries, quotas, audit, and managed domain follow-up. It still must deploy through ids-only `deployments.create` after the control plane selects or creates the preview context.

You can declare the Resource preview policy in `appaloft.yaml` with `preview.pullRequest.policy`.
Apply that config from trusted default-branch, Web, CLI, API, or control-plane context. PR preview
deploys do not let the PR branch mutate the policy that decides whether previews are admitted.

A preview environment is a temporary derived runtime environment under the selected Resource, not a long-lived Resource peer. The Resource detail preview area shows that Resource's pull request previews, expiry, source fingerprint, and cleanup state. The global preview environment page is only a cross-project troubleshooting rollup; normal inspection and cleanup should start from the Resource.

If a GitHub close event, provider callback, or workflow cleanup does not fire reliably, the control plane still keeps compensation paths: closed pull request webhooks trigger cleanup by preview source scope; the Resource preview area and preview detail can manually request `preview-environments.delete`; cleanup is idempotent; and retryable runtime, route, source-link, provider metadata, or feedback failures leave safe retry/manual-review state.

For self-hosted control planes, webhook verification uses `APPALOFT_GITHUB_WEBHOOK_SECRET`. Worker-side feedback publishing for webhook and cleanup scheduler contexts uses `APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN` when no request-scoped GitHub connection is present.

Use product-grade previews when you need Appaloft to own preview orchestration, policy, feedback, cleanup retries, and team-visible audit instead of relying on every repository to maintain its own workflow file.

<h2 id="deployment-preview-troubleshooting">Troubleshoot previews</h2>

Common checks:

- Missing preview URL: confirm generated access readiness or wildcard DNS, then decide whether the workflow should use `--require-preview-url`.
- Wrong route: confirm the preview domain template came from a trusted workflow input, not production `access.domains[]`.
- Duplicate deployments: confirm the preview id is stable for the pull request and cleanup is not using a different id.
- Cleanup did nothing: confirm the close-event workflow passes the same preview type, preview id, source path, and config path used for deploy.
- Fork skipped: confirm whether the pull request source repository is trusted before exposing deployment credentials.
