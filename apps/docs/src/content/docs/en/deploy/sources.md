---
title: "Deployment sources"
description: "Understand how folders, Git repositories, images, Compose files, and static sites become deployment input."
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "source"
  - "repository"
  - "docker image"
  - "static site"
relatedOperations:
  - deployments.create
  - system.integrations.list
  - system.github-app-connection.show
  - system.github-repositories.list
  - source-links.relink
  - resources.configure-auto-deploy
  - source-events.ingest
  - source-events.list
  - source-events.show
  - source-events.replay
  - source-events.prune
sidebar:
  label: "Sources"
  order: 2
---

<h2 id="deployment-source">Choose a deployment source</h2>

A deployment source answers what Appaloft should deploy. It can be a local folder, Git repository, Docker image, Compose file, or static site output.

The source is not a substitute for project, server, environment, or domain fields. Appaloft reads source evidence during detect and turns it into an explainable plan during plan.

Existing entrypoints should use the same source vocabulary. A Web source field, CLI positional source or `--source`, and API source input should all point here instead of redefining the concept.

<h2 id="deployment-source-kind">Source kinds</h2>

Common kinds:

| Kind | Fits | User should confirm |
| --- | --- | --- |
| Local folder | CLI local deployment and experiments. | Working directory, ignored files, build output. |
| Git repository | Repeatable deploys, CI, preview. | Repository URL, ref, base directory, access. |
| Docker/OCI image | Existing runtime artifact. | Image address, tag, exposed port. |
| Compose file | Multi-container or existing Compose setup. | Compose file path, service name, exposed port. |
| Static site | Frontend static output. | Build command and publish directory. |

If unsure, choose the kind closest to the artifact you already have. The runtime profile explains how Appaloft should run it.

<h2 id="deployment-source-integration-connection-modes">Integration connection modes</h2>

External source integrations can declare connection modes so Web, CLI, and tools share neutral language for who completes provider setup.

Common modes include:

| Mode | Meaning |
| --- | --- |
| `user-oauth` | The end user authorizes with their own provider account, useful for personal or team browsing flows. |
| `hosted-provider-app` | The operator provides a provider app, and the end user only installs or authorizes that app. |
| `operator-managed-app` | The instance operator creates the provider app and manages credential references in instance configuration. |

`GET /api/integrations` returns these modes and safe configuration status. It describes capabilities, audience, whether provider installation is required, and whether operator secret material is required; it does not return tokens, private keys, webhook secrets, or raw provider payloads.

When the GitHub integration uses `hosted-provider-app` or `operator-managed-app`, the Web console repository picker first asks the user to install the configured GitHub App. After installation, the GitHub setup URL returns to Appaloft, and Appaloft stores only readback data such as installation id, account login, repository selection mode, and update time. Repository browsing uses an installation access token and does not fall back to user OAuth.

CLI callers can inspect the tenant-scoped installation and browse only repositories granted to it:

```bash
appaloft github status
appaloft github repositories --search web
```

If `status` reports that the App is not installed for the current workspace, use its returned install
URL and select the intended GitHub account and repository before listing repositories again.

<h2 id="deployment-source-validation">Input checks</h2>

Users should see whether the source is readable, whether the ref or path exists, whether the static output is clear, and whether the source conflicts with the resource runtime profile.

The Web console should warn before submit when fields like Git ref, base directory, or static output are missing. The CLI should report unreadable paths, inaccessible repositories, and empty source as input errors. The HTTP API should return structured validation errors with field names and recovery hints.

CLI source examples:

```bash title="Local folder"
appaloft deploy ./apps/web --method static --publish-dir build
```

```bash title="Built static output"
appaloft deploy ./dist --as static-site
```

```bash title="Git repository"
appaloft deploy https://github.com/example/web \
  --method static \
  --publish-dir dist \
  --resource-name web
```

Resource source profile example:

```bash title="Configure Git source for an existing resource"
appaloft resource configure-source res_web \
  --kind git-repository \
  --locator https://github.com/example/web \
  --git-ref main \
  --base-directory apps/web
```

<h2 id="application-graph-dependencies">Share a dependency across applications</h2>

In an application graph, define a managed dependency once at the top level and reference its key
from every application that consumes it. A dependency shared by multiple applications requires a
stable `resourceName` so later consumers reuse the same managed Resource instead of provisioning a
second database:

```yaml
dependencies:
  database:
    resourceName: Acme Shared Postgres
    kind: postgres
    source: managed
    bind:
      env: DATABASE_URL

applications:
  api:
    resource:
      name: Acme API
    dependencies:
      - database
  worker:
    resource:
      name: Acme Worker
      kind: worker
    dependencies:
      - database
```

Appaloft reconciles one named Postgres Resource and creates a separate `DATABASE_URL` binding for
each consuming Resource. Every top-level dependency must be referenced, every reference must
resolve, and ephemeral preview dependencies cannot be shared. Connection values and dependency
Resource ids stay out of committed config.

<h2 id="local-static-output">Local static output</h2>

When you already have a `dist`, `build`, or similar static output directory, pass that directory as
the Appaloft source:

```bash
appaloft deploy ./dist --as static-site
```

This changes only the user-layer entry experience. It normalizes to a static-site Resource and an
ordinary deployment request; it does not add a `quick-deploy.create` operation or upload the
directory to an Appaloft hosted cloud. Unless you explicitly choose a hosted feature, the target is
still the server or environment you selected.

<h2 id="deployment-source-output">What you see after deployment</h2>

Once accepted, source becomes part of the deployment snapshot. Later resource source profile changes do not change completed or running deployments.

Deployment details should show a safe source summary, such as repository, ref, base directory, image tag, or static output directory. Secret tokens, private repository credentials, and sensitive local path fragments should not appear in logs or diagnostics.

<h2 id="deployment-source-errors">Common errors</h2>

Recovery examples:

- Local folder does not exist: check the CLI working directory or pass an absolute path.
- Git repository is inaccessible: check credentials, repository URL, ref, and network.
- Static output is empty: confirm the build command produced artifacts.
- Source and runtime profile conflict: update the runtime profile or choose a better source kind.

If the resource already points at an old source, use [Deployment recovery](/docs/en/deploy/recovery/#deployment-source-relink).

<h2 id="static-artifact-publishing">Static artifact publishing</h2>

Direct static artifact publishing is a deployment source extension point. Use it for an already
built `dist` directory or `.zip` archive; it enters the same operation catalog through
`static-artifacts.*` operations:

```bash
appaloft static-artifacts publish ./dist
appaloft static-artifacts publish ./dist.zip
```

API callers can use `POST /api/static-artifacts/publish`,
`POST /api/static-artifacts/publish-payload`, or
`POST /api/static-artifacts/publish-archive`. Read publication records through
`GET /api/static-artifacts/publications`. This entrypoint does not bypass Resource, Deployment,
route, or access-control boundaries; hosted alias/default-domain routing remains a separate
capability.

<h2 id="source-auto-deploy-setup">Auto-deploy setup</h2>

Source auto-deploy turns a verified source event into an ordinary deployment request, without adding
branch, webhook, or delivery fields to `deployments.create`. The first active ingestion route is the
Resource-scoped generic signed webhook:

```text
POST /api/resources/{resourceId}/source-events/generic-signed
```

When enabled, the policy belongs to one Resource and is bound to that Resource's current source
profile. If the Resource source changes later, the old policy becomes blocked until a user
explicitly acknowledges that the new source should still trigger auto-deploy.

<h2 id="source-auto-deploy-config-file">Declare auto-deploy in appaloft.yaml</h2>

For repository-driven deploys, the common git-push policy can live in the config file:

```yaml
autoDeploy:
  enabled: true
  trigger: git-push
  refs:
    - main
  events:
    - push
  includePaths:
    - apps/api/**
  excludePaths:
    - "**/*.md"
```

Config deploy reconciles this through `resources.configure-auto-deploy` before the next deployment
attempt. Generic signed webhook secret references and endpoint setup remain explicit operations.
Do not commit webhook secrets, provider tokens, source-event ids, or delivery ids in
`appaloft.yaml`.

Path rules are optional repository-root globs. Appaloft calculates the final `before..after` change
set for an updated ref (or empty tree to the new revision for a created ref), applies includes
first, then excludes. It never unions intermediate commit arrays. A deleted ref never deploys. If
the provider comparison is unavailable or truncated, path-filtered policies fail closed; policies
without path rules retain ref-only behavior.

<h2 id="source-auto-deploy-signatures">Signatures and secrets</h2>

Git provider webhooks and generic signed webhooks must be verified before policy matching. Generic
signed webhooks use `X-Appaloft-Signature` with `sha256=<hex>` or bare HMAC SHA-256 hex. The policy
secret reference must use `resource-secret:<KEY>`, where `<KEY>` is a runtime secret variable on the
same Resource. Appaloft stores only safe reference metadata, not secret values, signature headers, or
raw payloads.

To rotate a secret, replace the underlying secret reference first, then acknowledge the auto-deploy
policy when needed.

<h2 id="source-auto-deploy-dedupe">Duplicate deliveries</h2>

The source event is written to a durable record before deployment dispatch. Duplicate delivery uses
the provider delivery id, generic idempotency key, or a bounded-window key over source, ref,
revision, and event kind. Generic signed route dedupe is scoped to the route Resource.

A duplicate event must not create a second deployment. Users should be able to see `deduped` status
and the original source event id in the source event read model.

<h2 id="source-auto-deploy-ignored-events">Ignored and blocked events</h2>

A verified event may still create no deployment. Common reasons include unmatched ref, unmatched
final paths, unavailable/truncated final diff, deleted ref, no enabled policy, disabled policy, or a
policy blocked pending acknowledgement after a source binding change.

`source-events.list` and `source-events.show` should display safe reason codes, matched Resources,
and created deployment ids. Logs and UI must not expose webhook secrets, provider tokens, or raw
payloads.

<h2 id="source-auto-deploy-recovery">Auto-deploy recovery</h2>

The first Phase 7 ingestion path records source event state and synchronous dispatch results; it
does not promise automatic background retry. If dispatch fails, inspect source event detail first,
then fix the source profile, secret reference, policy state, or runtime blocker.

After the fix, use `appaloft source-event replay <sourceEventId> --resource <resourceId>` or
`POST /api/source-events/{sourceEventId}/replay` to replay retained safe delivery facts. Replay
re-matches current Resource policy and uses ordinary `deployments.create` admission; it does not
read raw webhook payloads, signatures, provider tokens, or webhook secrets.

If a deployment was created, use ordinary deployment recovery/readiness, retry, redeploy, or
rollback semantics rather than replaying the webhook payload.

<h2 id="source-auto-deploy-retention">Source event retention</h2>

Use `appaloft source-event prune --before <iso>` or `POST /api/source-events/prune` to inspect
retained source event deliveries before cleanup. Prune defaults to dry-run and returns matched
counts by status and source kind. Add `--dry-run false` only after the scope and cutoff are
reviewed.

Retention cleanup removes only persisted safe source event diagnostics. It does not delete
Resources, deployments, webhook secrets, provider tokens, raw payloads, or replay capability for
events outside the selected cutoff and filters.
