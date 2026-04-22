# GitHub Action Deploy Wrapper Implementation Plan

## Goal

Make repository-driven GitHub Actions deployment a release-ready product entrypoint for pure CLI
SSH deployments.

The first public shape is a thin `appaloft/deploy-action` wrapper around the released Appaloft CLI
binary. The wrapper installs a selected CLI release, verifies the artifact, maps trusted GitHub
Secrets into runner-local files or environment variables, and invokes the existing
`appaloft deploy` config workflow. It must not introduce a new deployment command, hidden hosted
service requirement, or parallel config schema.

## Product Boundary

`appaloft/deploy-action` is an entrypoint wrapper, not a business operation.

It must follow these boundaries:

- final deployment admission remains `deployments.create`;
- repository config remains the non-interactive Quick Deploy profile input;
- `appaloft.yml` must not contain project/resource/server/destination/credential identity or raw
  secret values;
- SSH-targeted runs default to `ssh-pglite` and do not require `DATABASE_URL`;
- `APPALOFT_PROJECT_ID`, `APPALOFT_RESOURCE_ID`, `APPALOFT_SERVER_ID`, and similar ids are optional
  trusted overrides, not required one-shot setup;
- domain intent in `appaloft.yml` maps to server-applied proxy route state in SSH mode and must not
  create managed `DomainBinding` or `Certificate` aggregates;
- hosted/self-hosted control-plane mode is selected explicitly through a control-plane endpoint or
  PostgreSQL state backend.
- control-plane mode selection follows ADR-025: GitHub Actions may remain the execution owner even
  when Appaloft Cloud or a self-hosted Appaloft server owns state, locks, source links, policy, and
  managed domain workflow state.

The action wrapper may live in a separate public repository because its release cadence and
Marketplace metadata are different from the main Appaloft repository. The wrapper should remain
small enough that Appaloft CLI releases do not require action-repo code changes unless the install
contract itself changes.

## Repository Shape

Recommended first repository:

```text
appaloft/deploy-action
  action.yml
  README.md
  scripts/install-appaloft.sh
  scripts/run-deploy.sh
  test/fixtures/minimal-workflow.yml
```

The main Appaloft repository owns:

- release assets for platform CLI archives;
- `checksums.txt`;
- `release-manifest.json`;
- release notes;
- CLI behavior, config parsing, remote state, and deployment semantics;
- docs and test matrices that define the wrapper contract.

The action repository owns:

- action metadata and Marketplace-facing README;
- binary download and checksum verification;
- GitHub runner secret mapping;
- shell-level invocation of the released binary;
- wrapper-level tests for install and command construction.

## Default Usage

Minimal config-driven deployment:

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
    steps:
      - uses: actions/checkout@v4

      - uses: appaloft/deploy-action@v1
        with:
          version: v0.1.0
          config: appaloft.yml
          ssh-host: ${{ secrets.APPALOFT_SSH_HOST }}
          ssh-user: ${{ secrets.APPALOFT_SSH_USER }}
          ssh-private-key: ${{ secrets.APPALOFT_SSH_PRIVATE_KEY }}
```

Recommended production workflows pin both:

- the action major version through `uses: appaloft/deploy-action@v1`;
- the Appaloft CLI version through `with.version`.

`version: latest` is allowed for quickstarts, but generated examples for production should prefer
an exact CLI release tag for repeatability.

## Pull Request Preview Usage

Action-based PR previews require a user-authored workflow. The action does not install a webhook
or cause GitHub to run on pull requests by itself.

Recommended first preview workflow:

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
          preview: pull-request
          preview-id: pr-${{ github.event.pull_request.number }}
          ssh-host: ${{ secrets.APPALOFT_SSH_HOST }}
          ssh-user: ${{ secrets.APPALOFT_SSH_USER }}
          ssh-private-key: ${{ secrets.APPALOFT_SSH_PRIVATE_KEY }}
```

This workflow deploys or updates a preview when a PR is opened, reopened, or receives new commits.
It intentionally skips fork PRs in the default example. Fork previews require a separate security
policy and reduced credentials because PR code is unmerged and may be untrusted.

The recommended preview example uses `appaloft.preview.yml` because the root `appaloft.yml` may be
production-oriented. The action must not mutate repository config files and must not assume the root
config is safe for PR deploys. Repositories that keep `appaloft.yml` environment-neutral may pass
that file deliberately, but preview docs should make the choice explicit.

Preview-specific application values should come from GitHub environment variables or secrets
selected by the job environment and referenced from config with `ci-env:<NAME>`. A future
config-profile or environment-overlay input may select overlay fields after the parser supports
them, but overlays must apply only after the action has selected the PR preview environment from
trusted GitHub event context.

When preview-specific profile input does not supply a runtime name, the action/CLI should derive a
preview runtime name seed `preview-{prNumber}` from trusted GitHub event context before resource
create/configure commands run. That seed is resource profile intent, not a deployment command
field, and runtime adapters may still append deterministic uniqueness scope to the effective
container/project name.

The first preview mode creates or reuses preview-scoped source link state and dispatches the same
ids-only `deployments.create` command. Explicit PR close cleanup now runs through
`deployments.cleanup-preview` from a user-authored close-event workflow, but pure Action mode still
has no retry/scheduler if that workflow never runs or fails.

Preview URL behavior:

- without `preview-domain-template`, the action relies on generated/default access and may output an
  `sslip` generated URL when the selected server has a public IPv4 address and proxy ingress works;
- with `preview-domain-template`, the user must configure wildcard DNS such as
  `*.preview.example.com` to the selected server in Action-only mode;
- production `access.domains[]` from a root config must not be reinterpreted as PR preview host
  intent; preview route intent must come from generated/default access, trusted
  `preview-domain-template`, an explicitly selected preview config file, or a future selected
  preview overlay;
- when no public route can be resolved and `require-preview-url` is false, deployment may still
  succeed with no `preview-url` output and a diagnostic explanation;
- when `require-preview-url` is true, missing access is a structured route-resolution failure.

## Action Inputs

Initial inputs:

| Input | Required | Rule |
| --- | --- | --- |
| `version` | No | CLI release tag such as `v0.1.0`; `latest` resolves the latest non-prerelease Appaloft release. |
| `config` | No | Path passed to `appaloft deploy --config`; defaults to `appaloft.yml` when present. PR preview examples should pass `appaloft.preview.yml` when the root config is production-oriented. |
| `source` | No | Source path or locator passed as the deploy positional argument; defaults to `.`. |
| `runtime-name` | No | Trusted override for `ResourceRuntimeProfile.runtimeName`; UI/docs may present this as "container name" for the current Docker/OCI substrate. |
| `ssh-host` | Yes for SSH mode | Trusted target host, mapped to `--server-host`. |
| `ssh-user` | No | Trusted SSH username, mapped to `--server-ssh-username`. |
| `ssh-port` | No | Trusted SSH port, mapped to `--server-port`. |
| `ssh-private-key` | Yes when no key file is supplied | Secret value written to a runner temp file with mode `0600`; the file path is passed to `--server-ssh-private-key-file`. |
| `ssh-private-key-file` | No | Existing runner-local private key path; mutually exclusive with `ssh-private-key`. |
| `server-proxy-kind` | No | Trusted proxy selection such as `traefik` or `caddy`, mapped to `--server-proxy-kind`. |
| `state-backend` | No | Optional explicit backend: `ssh-pglite`, `local-pglite`, or `postgres-control-plane`. |
| `control-plane-mode` | No | Future explicit mode: `none`, `auto`, `cloud`, or `self-hosted`. Defaults to `none` when absent. |
| `control-plane-url` | No | Future trusted endpoint for self-hosted/private control planes, mapped to CLI/env outside committed config. |
| `appaloft-token` | No | Future secret token for Cloud/self-hosted API mode; must never be logged or written to config. |
| `use-oidc` | No | Future boolean for GitHub OIDC exchange when the Cloud auth ADR accepts it. |
| `preview` | No | Accepted value `pull-request` enables preview-scoped source link and environment/resource identity behavior. |
| `preview-id` | Required when `preview=pull-request` | Trusted preview scope such as `pr-123`; examples derive it from `github.event.pull_request.number`. |
| `preview-domain-template` | No | Trusted preview hostname template rendered by the workflow/action, for example `pr-123.preview.example.com`; requires user-owned DNS in Action-only mode. |
| `require-preview-url` | No | Boolean that fails the workflow when no generated or custom public route is resolved. Defaults to false. |
| `appaloft-data-root` | No | Future install/runtime hint for local cache; must not change committed config semantics. |
| `args` | No | Escape hatch for additional CLI flags; examples should prefer explicit inputs. |

The wrapper must not accept raw `project`, `resource`, `server`, or `destination` values from
`appaloft.yml`. If it offers trusted id overrides later, they must be action inputs or workflow env
values documented as operator-selected state, and the CLI must still treat them as selection
overrides outside the committed config file.

Control-plane inputs are also trusted entrypoint inputs, not repository config identity selectors.
When absent, the wrapper must keep the current pure SSH behavior. When present before the matching
CLI/control-plane handshake implementation exists, the wrapper or CLI must fail before mutation with
structured control-plane errors rather than falling back silently.

When `preview = pull-request` and neither the wrapper inputs nor the selected preview profile set
`runtime-name`, the wrapper/CLI should derive `runtime-name = preview-{prNumber}` from trusted PR
context before resource profile mutation.

## Secret And Environment Handling

GitHub Secrets are mapped by the workflow into action inputs or environment variables. The action
does not read repository secrets implicitly.

Rules:

- SSH private key input is written to a temporary file and never passed as a command-line argument.
- The temporary key file must be removed at the end of the action step when possible.
- The action must avoid echoing secrets, private key paths with secret-bearing names, or resolved
  `ci-env:` values.
- Application secrets referenced by `appaloft.yml` use `ci-env:<NAME>` and are provided by the
  workflow `env` block, for example `DATABASE_URL: ${{ secrets.DATABASE_URL }}`.
- `DATABASE_URL` as an application secret is separate from Appaloft state. It is applied to the
  target application environment through `environments.set-variable` when referenced by config.
- `APPALOFT_DATABASE_URL` selects Appaloft PostgreSQL/control-plane state and is not required for
  SSH `ssh-pglite` mode.

Example application secret mapping:

```yaml
- uses: appaloft/deploy-action@v1
  env:
    DATABASE_URL: ${{ secrets.APP_DATABASE_URL }}
  with:
    version: v0.1.0
    ssh-host: ${{ secrets.APPALOFT_SSH_HOST }}
    ssh-user: ${{ secrets.APPALOFT_SSH_USER }}
    ssh-private-key: ${{ secrets.APPALOFT_SSH_PRIVATE_KEY }}
```

The matching config may reference the key without containing the value:

```yaml
secrets:
  DATABASE_URL:
    from: ci-env:DATABASE_URL
```

## Binary Install And Checksum Verification

The wrapper downloads release assets from the main Appaloft repository.

For `version: latest`, the wrapper resolves the latest non-prerelease release, then downloads:

- the platform-specific `appaloft-v<version>-<target>.tar.gz` or `.zip`;
- `checksums.txt`;
- optionally `release-manifest.json` for target discovery and diagnostics.

For an exact version, the wrapper downloads from that release tag directly.

Required verification:

- target selection must be deterministic from runner OS and architecture;
- the archive SHA-256 must match the corresponding `checksums.txt` entry before extraction;
- extraction must install the CLI into a runner temp directory or tool cache and prepend it to
  `PATH` only for the current job;
- install diagnostics must include version, target, asset name, and checksum source, but not
  secrets.

The main release workflow already generates `checksums.txt`, `release-manifest.json`, release notes,
and platform CLI archives. The wrapper must consume those artifacts instead of rebuilding the CLI.

## Version Propagation

Publishing a new Appaloft CLI release does not normally require a new `deploy-action` release.

Expected propagation model:

- `appaloft/deploy-action@v1` stays stable across many Appaloft CLI releases.
- `with.version: vX.Y.Z` downloads exactly that CLI release.
- `with.version: latest` resolves the newest stable Appaloft CLI release at runtime.
- The deploy-action repository releases only when wrapper inputs, install logic, Marketplace docs,
  or security behavior changes.
- A future docs automation may update example snippets to a newer pinned CLI version, but runtime
  users are not forced to update the action wrapper for every CLI release.
- Adding Cloud/self-hosted API support to the Appaloft CLI should not require a new action release
  unless the wrapper needs new inputs, token/OIDC handling, output handling, or security behavior.

## No-Config Behavior

If no config file is supplied or discovered, the action may still invoke `appaloft deploy`, but the
workflow must provide enough trusted input through action inputs or `args` to create/select context
and resource profile safely.

Rules:

- No-config SSH deploy still defaults to `ssh-pglite` when `ssh-host` is supplied.
- The source defaults to `.` when omitted.
- Missing source/profile/network information may be satisfied by CLI detection and defaults only
  when the existing CLI Quick Deploy contract allows it.
- If required non-interactive context cannot be inferred, the CLI must fail before mutation with a
  structured validation error rather than prompting.
- If no config and no `access.domains[]` equivalent is supplied, Appaloft deploys without a custom
  domain route. Generated/default access behavior still follows the selected server/proxy policy.

The action should document config-driven deployment as the primary path. No-config mode is a
compatibility path for simple repositories and smoke tests, not the recommended production shape.

## Output Contract

Initial outputs:

| Output | Rule |
| --- | --- |
| `appaloft-version` | The installed CLI version. |
| `appaloft-target` | The selected release target. |
| `preview-id` | Present when preview mode is selected. |
| `preview-url` | Present when generated/default access or custom preview route realization yields a public URL. |
| `deployment-id` | Present when the CLI emits a parseable accepted deployment id. |
| `resource-id` | Present when the CLI emits a parseable resource id. |
| `diagnostic-path` | Optional path to a sanitized diagnostic summary artifact when generated. |

The first implementation may omit structured outputs if the CLI does not yet expose stable
machine-readable deploy output. In that case, the gap must remain explicit and the wrapper should
not parse human text.

## Failure Semantics

Wrapper failures are entrypoint failures:

| Failure | Expected mapping |
| --- | --- |
| Missing version or asset | Action step fails before invoking Appaloft. |
| Checksum mismatch | Action step fails before extraction. |
| Missing SSH host for SSH mode | Action step or CLI fails before mutation. |
| Missing private key or unreadable key file | Action step fails before invoking Appaloft. |
| Unsupported control-plane mode | CLI returns structured Appaloft error before mutation until the selected Cloud/self-hosted handshake exists. |
| Missing PR context for preview mode | Action step or CLI fails before mutation with `validation_error`, phase `preview-context-resolution`. |
| Missing preview URL when required | CLI returns structured route/access error; no fake direct-port URL is emitted. |
| Preview cleanup runtime/state failure | Action step or CLI returns structured `preview-cleanup` failure from runtime cleanup, route-state delete, or source-link unlink. |
| Config validation failure | CLI returns structured Appaloft error. |
| Remote state ensure/lock/migration failure | CLI returns structured Appaloft error with remote-state phase. |
| Deployment accepted but runtime fails | CLI follows deployment workflow semantics; accepted id remains valid and failure is observed through state/read models. |

## Out Of Scope

- GitHub App webhooks and product-grade preview-environment lifecycle.
- Product-grade PR environment cleanup retries/scheduling beyond one explicit close-event workflow.
- Managed DNS/certificate lifecycle without a hosted/self-hosted control plane.
- Creating or rotating GitHub Secrets.
- Running an Appaloft cloud service or self-hosted control plane.
- GitHub App/webhook execution where the control plane, not the action, owns execution.
- Rebuilding Appaloft from source inside the action.
- Parsing human CLI output as a durable contract.

## Test Matrix Anchors

Next Test-First Round should add or cover these rows:

- `CONFIG-FILE-ENTRY-008` for headless binary behavior through the action contract;
- `CONFIG-FILE-ENTRY-009` for action install and checksum verification;
- `CONFIG-FILE-ENTRY-010` for action SSH secret to temp key mapping;
- `CONFIG-FILE-ENTRY-011` for action `version` resolution;
- `CONFIG-FILE-ENTRY-012` for no-config action deploy behavior;
- `CONFIG-FILE-ENTRY-013` for config without domains deploying without custom route mutation;
- `CONFIG-FILE-ENTRY-014` and `CONTROL-PLANE-ENTRY-002` for future control-plane mode inputs;
- `CONFIG-FILE-ENTRY-015` for Action PR preview trigger and trusted preview context mapping;
- `CONFIG-FILE-ENTRY-016` for Action PR preview generated access without user DNS;
- `CONFIG-FILE-ENTRY-017` for Action PR preview custom wildcard domain template behavior;
- `CONFIG-FILE-ENTRY-018` for Action PR preview fork-safety defaults;
- `CONFIG-FILE-ENTRY-019` for Action preview cleanup through the explicit cleanup command;
- `CONFIG-FILE-ENTRY-020` for Action PR preview using an explicit preview config path instead of
  the root config;
- `CONFIG-FILE-ENTRY-021` for Action PR preview refusing to reinterpret production root custom
  domains as preview hosts;
- `CONFIG-FILE-ENTRY-022` for future preview overlay boundaries after trusted preview environment
  selection;
- `QUICK-DEPLOY-ENTRY-011` for deploy-action parity with CLI config workflow.
- `QUICK-DEPLOY-ENTRY-012` for control-plane mode parity across entrypoints.

## Current Implementation Notes And Migration Gaps

The main repository already publishes release artifacts with CLI platform archives, the static
Docker self-host installer, checksums, release manifest, release notes, and release asset upload.

The main repository already has an opt-in SSH e2e harness that simulates GitHub Actions process
boundaries by running two separate CLI processes against the same SSH-server state. That proves the
underlying CLI behavior but not the public `deploy-action` install/download/checksum wrapper.

Missing pieces before public release:

- create the `appaloft/deploy-action` repository;
- add `action.yml`, install scripts, README examples, and wrapper tests;
- add a main-repo doc page that links release assets, action usage, and minimal `appaloft.yml`;
- add PR preview examples that explicitly require `on.pull_request`, skip fork PRs by default, and
  explain explicit preview config paths, generated/default access, and user-owned wildcard preview
  domains;
- add a wrapper-level CI test that verifies exact-version install from a fixture or real release;
- decide whether generated docs examples use `version: latest` or a pinned version by default;
- map wrapper preview inputs to the CLI `--preview`, `--preview-id`, and
  `--preview-domain-template` options;
- add stable CLI JSON output or diagnostic file support so the wrapper can expose `preview-url`
  without parsing human text;
- wire wrapper cleanup inputs or `args` examples to the active CLI preview cleanup command;
- add control-plane mode inputs only after the CLI resolver/parser and structured unsupported
  errors exist;
- add structured CLI deploy output if action outputs need deployment/resource ids.
