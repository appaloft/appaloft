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

For normal deployments, `appaloft/deploy-action` can trigger an existing self-hosted Appaloft server instead of running CLI/SSH from the GitHub runner:

```yaml
- uses: appaloft/deploy-action@v1
  id: deploy
  with:
    control-plane-mode: self-hosted
    control-plane-url: https://console.example.com
    appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
    project-id: ${{ secrets.APPALOFT_PROJECT_ID }}
    environment-id: ${{ secrets.APPALOFT_ENVIRONMENT_ID }}
    resource-id: ${{ secrets.APPALOFT_RESOURCE_ID }}
    server-id: ${{ secrets.APPALOFT_SERVER_ID }}
```

Without `server-config-deploy`, this server API slice requires the project, environment, resource, and deployment target to already exist in the Appaloft server. The Action calls the server source-link deployment route. When explicit ids are supplied, the server can bootstrap a missing source link; later runs can omit the ids and let the server resolve context from its source-link state using the GitHub repository, ref, config path, and source base directory fingerprint. That path does not apply `appaloft.yml`, upload a source archive, create resources, open SSH, or mutate SSH-server PGlite state.

Use `server-config-deploy: true` when the self-hosted server should read the selected repository
config and apply it before creating the deployment:

```yaml
- uses: appaloft/deploy-action@v1
  id: deploy
  with:
    control-plane-mode: self-hosted
    control-plane-url: https://console.example.com
    appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
    config: appaloft.yml
    server-config-deploy: true
    project-id: ${{ secrets.APPALOFT_PROJECT_ID }}
    environment-id: ${{ secrets.APPALOFT_ENVIRONMENT_ID }}
    resource-id: ${{ secrets.APPALOFT_RESOURCE_ID }}
    server-id: ${{ secrets.APPALOFT_SERVER_ID }}
    secret-variables: |
      APP_SECRET=ci-env:APP_SECRET
```

In this mode the Action performs the server handshake, sends a bounded GitHub source/config
reference, resolves `ci-env:` secrets from the runner environment, and calls the server API. The
runner still does not install the CLI, open SSH, select a state backend, or mutate SSH-server PGlite
state. The server validates the committed config, rejects identity and raw secret fields, applies
runtime/network/health/env/domain settings through Appaloft operations, then dispatches ids-only
deployment admission.

Self-hosted server mode can also trigger PR preview deploys:

```yaml
- uses: appaloft/deploy-action@v1
  id: deploy
  with:
    control-plane-mode: self-hosted
    control-plane-url: https://console.example.com
    appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
    preview: pull-request
    preview-id: pr-${{ github.event.pull_request.number }}
    project-id: ${{ secrets.APPALOFT_PROJECT_ID }}
    environment-id: ${{ secrets.APPALOFT_PREVIEW_ENVIRONMENT_ID }}
    resource-id: ${{ secrets.APPALOFT_PREVIEW_RESOURCE_ID }}
    server-id: ${{ secrets.APPALOFT_SERVER_ID }}
```

Server-mode preview deploys use a preview-scoped source fingerprint and write `preview-id`, `deployment-id`, `console-url`, and, when configured, `preview-url` outputs. `preview-domain-template` and `preview-tls-mode` are applied as server-side preview route intent; `environment-variables` and `secret-variables` can carry preview-specific runtime values.

The non-secret control-plane connection policy may also live in `appaloft.yml`:

```yaml
controlPlane:
  mode: self-hosted
  url: https://console.example.com
```

Keep project, environment, resource, server, token, SSH, and database identity out of committed config. Those values must come from trusted workflow inputs, variables, secrets, existing source links, or the Appaloft server.

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

Secrets should come from GitHub Secrets or another trusted workflow secret store and be passed as secret references such as `ci-env:NAME`. Do not commit SSH keys, tokens, database URLs, production secret values, or Appaloft project/resource/server identity into `appaloft.yml`.

<h2 id="product-grade-preview-deployments">Product-grade control-plane previews</h2>

Product-grade previews are an Appaloft Cloud or self-hosted control-plane workflow. They are not the same as Action-only previews.

That product line uses signed GitHub webhooks, preview policy, fork and secret policy, preview environment list/show/delete, comments/checks/status feedback, cleanup retries, quotas, audit, and managed domain follow-up. It still must deploy through ids-only `deployments.create` after the control plane selects or creates the preview context.

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
