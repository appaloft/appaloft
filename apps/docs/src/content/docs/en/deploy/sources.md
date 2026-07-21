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

## Choose a deployment source [#deployment-source]

A deployment source answers what Appaloft should deploy. It can be a local folder, Git repository, Docker image, Compose file, or static site output.

The source is not a substitute for project, server, environment, or domain fields. Appaloft reads source evidence during detect and turns it into an explainable plan during plan.

Existing entrypoints should use the same source vocabulary. A Web source field, CLI positional source or `--source`, and API source input should all point here instead of redefining the concept.

## Source kinds [#deployment-source-kind]

Common kinds:

| Kind | Fits | User should confirm |
| --- | --- | --- |
| Local folder | CLI local deployment and experiments. | Working directory, ignored files, build output. |
| Git repository | Repeatable deploys, CI, preview. | Repository URL, ref, base directory, access. |
| Docker/OCI image | Existing runtime artifact. | Image address, tag, exposed port. |
| Compose file | Multi-container or existing Compose setup. | Compose file path, service name, exposed port. |
| Static site | Frontend static output. | Build command and publish directory. |

If unsure, choose the kind closest to the artifact you already have. The runtime profile explains how Appaloft should run it.

## Zero-configuration support [#zero-configuration-support]

Here, zero-configuration means Appaloft can inspect one selected application directory, derive a
safe production build/start or static artifact plan, and pass the real Appaloft Docker path without
runtime-profile overrides. The generic-SSH gate is tracked separately. You still choose deployment context such as the server,
project, environment, credentials, secrets, and domain policy.

Status meanings:

- **Supported**: current detection/planning and matching real-smoke evidence exist.
- **Preview**: part of the path is implemented, but complete source-to-runtime smoke evidence is
  missing or explicit profile input is required. Preview is not a zero-configuration promise.
- **Unsupported**: Appaloft cannot safely derive the complete plan and stops instead of guessing.

| Source or application shape | Status | Evidence or reason |
| --- | --- | --- |
| Local single-app root: Next.js runtime/standalone/static export | Supported | Active real Docker and generic-SSH fixture descriptors cover these exact modes. |
| Local single-app root: Vite, React, Vue, Svelte, Solid, Angular static SPA | Supported | Active static fixture smoke builds and verifies the Appaloft static server. |
| Local single-app root: Astro static, Nuxt generate, SvelteKit adapter-static | Supported | Smoke covers only these static modes. |
| Local single-app root: Remix, Express, Fastify, NestJS, Hono, Koa, generic Node with a production start script | Supported | Active workspace-image fixture smoke covers build, start, and HTTP verification. |
| Local single-app root: FastAPI, Django, Flask, deterministic ASGI/WSGI, supported Poetry web app | Supported | Active Python fixture smoke covers current tool and app-target rules. |
| Local single-app root: Spring Boot Maven/Gradle, Quarkus Maven JVM mode, deterministic runnable jar | Supported | Active JVM fixture smoke covers these exact build and start paths. |
| Explicit Dockerfile, Compose, prebuilt image, or install/build/start commands | Supported | Real substrate/fixture smoke exists, but you supply the profile; this is an explicit fallback, not zero-configuration detection. |
| Local Sinatra/Rack, Go Gin, ASP.NET Core, or Rust Axum app | Supported | Real Appaloft Docker smoke passed build, run, and HTTP verification for these exact fixtures. The generic-SSH gate is wired separately. |
| Local Rails, Laravel, Symfony, or Phoenix app | Preview | Detection/planning exists, but these exact paths do not have passed real Appaloft Docker smoke. |
| Public remote Git relying on automatic framework/runtime detection | Unsupported | Appaloft does not clone remote repositories for framework inspection during create or plan. Clone the repository locally for automatic detection. |
| Public remote Git with an explicit Dockerfile, Compose, prebuilt-image, or install/build/start command profile | Preview | The explicit profile avoids automatic framework inspection, but dedicated remote source-to-runtime smoke is incomplete. Authenticated remote-Git parity is not claimed. |
| General workload `.zip` or source archive relying on detection | Unsupported | General archive extraction-to-framework planning is incomplete. Static artifact publishing is a separate workflow for already-built files. |
| Bounded local monorepo discovery with one app, or explicit `baseDirectory` | Preview | Discovery is implemented and explicit selection works in create and plan, but dedicated real Appaloft Docker monorepo smoke is incomplete. |
| Monorepo root with multiple candidate apps and no selection | Unsupported | Appaloft reports candidate roots and blocks until `baseDirectory` selects one; it never picks the first app. |
| SvelteKit server adapter, Astro SSR, Nuxt SSR, inferred worker, ambiguous hybrid mode, or buildpack execution | Unsupported | No complete deterministic planner plus current real-smoke support exists for these inferred paths. |

### What detection reads [#zero-configuration-detection]

Detection reads files only under the selected application root. It may use manifests, lockfiles,
framework configuration, production scripts, runtime version files, well-known project files, and
deterministic artifact paths. It does not install dependencies or execute project code while
detecting.

The plan should explain the selected root, detected runtime/framework/tool and files/scripts,
selected planner, inferred commands/artifact/port, or the blocked phase and reason. It also returns
`planVersion = "1"`, a stable `sha256:` fingerprint for the effective plan, and command provenance:
`planner` for inferred commands or `resource-runtime-profile` for explicit commands. Missing
evidence does not authorize a generic production command.

### Override order [#zero-configuration-overrides]

When you provide explicit values, Appaloft uses this order:

1. Dockerfile, Compose, prebuilt-image, or static strategy and its fields.
2. Explicit install/build/start commands and publish/artifact fields.
3. Explicit source `baseDirectory` selecting one application root.
4. Explicit Resource internal port and health policy.
5. Framework evidence, then generic language evidence.
6. Buildpack diagnostic evidence, then an Unsupported/ambiguous result.

Explicit profile values are not silently replaced by detection.

### Fail-closed recovery [#zero-configuration-troubleshooting]

If planning blocks, do not keep retrying the same deployment. Use the reported evidence and reason:

- pass the exact local application directory, or set `baseDirectory` for a repository root;
- choose Dockerfile, Compose, prebuilt image, or static strategy explicitly;
- provide install/build/start commands or the static publish directory;
- provide the Resource internal port and health policy for an inbound app;
- for remote Git automatic detection, clone locally; otherwise provide an explicit Dockerfile,
  Compose, prebuilt-image, or command profile and treat that remote path as Preview;
- extract a workload archive locally before relying on auto-detection;
- run `appaloft deployments plan ...` and confirm the selected root, planner, commands, artifact,
  port, and warnings before creating the deployment.

Appaloft fails closed rather than selecting the first monorepo app, guessing an archive layout, or
using a development/watch server in production.

## Integration connection modes [#deployment-source-integration-connection-modes]

External source integrations can declare connection modes so Web, CLI, and tools share neutral language for who completes provider setup.

Common modes include:

| Mode | Meaning |
| --- | --- |
| `user-oauth` | The end user authorizes with their own provider account, useful for personal or team browsing flows. |
| `hosted-provider-app` | The operator provides a provider app, and the end user only installs or authorizes that app. |
| `operator-managed-app` | The instance operator creates the provider app and manages credential references in instance configuration. |

`GET /api/integrations` returns these modes and safe configuration status. It describes capabilities, audience, whether provider installation is required, and whether operator secret material is required; it does not return tokens, private keys, webhook secrets, or raw provider payloads.

When the GitHub integration uses `hosted-provider-app` or `operator-managed-app`, the Web console repository picker first asks the user to install the configured GitHub App. Once installation is complete and repository browsing is available, untouched Quick Deploy state with no public Git URL opens the repository picker directly; an explicit public URL choice stays in URL mode. The GitHub setup URL returns to Appaloft, and Appaloft stores only readback data such as installation id, account login, repository selection mode, and update time. Repository browsing uses an installation access token and does not fall back to user OAuth.

CLI callers can inspect the tenant-scoped installation and browse only repositories granted to it:

```bash
appaloft github status
appaloft github repositories --search web
```

If `status` reports that the App is not installed for the current workspace, use its returned install
URL and select the intended GitHub account and repository before listing repositories again.

## Input checks [#deployment-source-validation]

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

## Share a dependency across applications [#application-graph-dependencies]

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

By default, one config deploy expands every declared application. To deploy only one application,
select its config key; repeat the option to select more than one:

```bash
appaloft deploy . --application site
appaloft deploy . --application api --application worker
```

An unknown key fails before Appaloft initializes deployment state or changes resources and reports
the available application keys.

## Local static output [#local-static-output]

When you already have a `dist`, `build`, or similar static output directory, pass that directory as
the Appaloft source:

```bash
appaloft deploy ./dist --as static-site
```

This changes only the user-layer entry experience. It normalizes to a static-site Resource and an
ordinary deployment request; it does not add a `quick-deploy.create` operation or upload the
directory to an Appaloft hosted cloud. Unless you explicitly choose a hosted feature, the target is
still the server or environment you selected.

## What you see after deployment [#deployment-source-output]

Once accepted, source becomes part of the deployment snapshot. Later resource source profile changes do not change completed or running deployments.

Deployment details should show a safe source summary, such as repository, ref, base directory, image tag, or static output directory. Secret tokens, private repository credentials, and sensitive local path fragments should not appear in logs or diagnostics.

## Common errors [#deployment-source-errors]

Recovery examples:

- Local folder does not exist: check the CLI working directory or pass an absolute path.
- Git repository is inaccessible: check credentials, repository URL, ref, and network.
- Static output is empty: confirm the build command produced artifacts.
- Source and runtime profile conflict: update the runtime profile or choose a better source kind.

If the resource already points at an old source, use [Deployment recovery](/docs/en/deploy/recovery/#deployment-source-relink).

## Static artifact publishing [#static-artifact-publishing]

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

## Auto-deploy setup [#source-auto-deploy-setup]

Source auto-deploy turns a verified source event into an ordinary deployment request, without adding
branch, webhook, or delivery fields to `deployments.create`. The first active ingestion route is the
Resource-scoped generic signed webhook:

```text
POST /api/resources/{resourceId}/source-events/generic-signed
```

When enabled, the policy belongs to one Resource and is bound to that Resource's current source
profile. If the Resource source changes later, the old policy becomes blocked until a user
explicitly acknowledges that the new source should still trigger auto-deploy.

## Declare auto-deploy in appaloft.yaml [#source-auto-deploy-config-file]

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

## Signatures and secrets [#source-auto-deploy-signatures]

Git provider webhooks and generic signed webhooks must be verified before policy matching. Generic
signed webhooks use `X-Appaloft-Signature` with `sha256=<hex>` or bare HMAC SHA-256 hex. The policy
secret reference must use `resource-secret:<KEY>`, where `<KEY>` is a runtime secret variable on the
same Resource. Appaloft stores only safe reference metadata, not secret values, signature headers, or
raw payloads.

To rotate a secret, replace the underlying secret reference first, then acknowledge the auto-deploy
policy when needed.

## Duplicate deliveries [#source-auto-deploy-dedupe]

The source event is written to a durable record before deployment dispatch. Duplicate delivery uses
the provider delivery id, generic idempotency key, or a bounded-window key over source, ref,
revision, and event kind. Generic signed route dedupe is scoped to the route Resource.

A duplicate event must not create a second deployment. Users should be able to see `deduped` status
and the original source event id in the source event read model.

## Ignored and blocked events [#source-auto-deploy-ignored-events]

A verified event may still create no deployment. Common reasons include unmatched ref, unmatched
final paths, unavailable/truncated final diff, deleted ref, no enabled policy, disabled policy, or a
policy blocked pending acknowledgement after a source binding change.

`source-events.list` and `source-events.show` should display safe reason codes, matched Resources,
and created deployment ids. Logs and UI must not expose webhook secrets, provider tokens, or raw
payloads.

## Auto-deploy recovery [#source-auto-deploy-recovery]

The first Phase 7 ingestion path records source event state and synchronous dispatch results; it
does not promise automatic background retry. If dispatch fails, inspect source event detail first,
then fix the source profile, secret reference, policy state, or runtime blocker.

After the fix, use `appaloft source-event replay <sourceEventId> --resource <resourceId>` or
`POST /api/source-events/{sourceEventId}/replay` to replay retained safe delivery facts. Replay
re-matches current Resource policy and uses ordinary `deployments.create` admission; it does not
read raw webhook payloads, signatures, provider tokens, or webhook secrets.

If a deployment was created, use ordinary deployment recovery/readiness, retry, redeploy, or
rollback semantics rather than replaying the webhook payload.

## Source event retention [#source-auto-deploy-retention]

Use `appaloft source-event prune --before <iso>` or `POST /api/source-events/prune` to inspect
retained source event deliveries before cleanup. Prune defaults to dry-run and returns matched
counts by status and source kind. Add `--dry-run false` only after the scope and cutoff are
reviewed.

Retention cleanup removes only persisted safe source event diagnostics. It does not delete
Resources, deployments, webhook secrets, provider tokens, raw payloads, or replay capability for
events outside the selected cutoff and filters.
