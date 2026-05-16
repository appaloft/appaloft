# Release

Appaloft uses a trunk-based release flow with a manually created Release Please PR. Normal merges to
`main` do not publish releases automatically. Run the `Release` GitHub Actions workflow manually to
create or update the release PR from Conventional Commits. The workflow also commits
`docs/PRODUCT_ROADMAP.md` release alignment into that same release PR. Merging the release PR is the
publishing confirmation: the `Release` workflow runs on the release merge commit, creates the tag,
GitHub Release, and distribution artifacts.

## Versioning And Changelog

- Use a single product SemVer version for backend, CLI, desktop, Docker, Homebrew, and npm.
- Release tags use `vX.Y.Z`.
- `CHANGELOG.md` is maintained by Release Please in the release PR.
- `docs/PRODUCT_ROADMAP.md` is the release gate before `1.0.0`; read it before every
  release workflow run and reject any Release Please PR whose version is not allowed by the
  roadmap checklist.
- Release Please is configured to keep pre-`1.0.0` feature and minor bumps on the current patch
  line by default. Use the `release_as` workflow input only when the roadmap gate explicitly allows
  a target minor, or when a hotfix needs an explicit version.
- The GitHub Release body is generated from `CHANGELOG.md` plus the built release artifact list,
  so the release page includes install commands, direct download links, known gaps, and the
  conventional-commit changelog.
- npm package versions are injected during the publish job so release PRs do not need to rewrite
  workspace package versions or `bun.lock`.

## Pre-RC Known Gap Rationale

The pre-`1.0.0-rc` closure artifact is
[`docs/specs/072-pre-rc-closure`](./specs/072-pre-rc-closure/spec.md). It is a hardening and
support-readiness sync artifact, not an RC release instruction.

If release notes are generated from that state, list these as accepted non-GA-blocking limitations
rather than hidden RC scope:

- optional future lifecycle/profile expansions: project description, project hard delete/restore,
  source-link day-two management, resource health reset/history, secret-reference CRUD, webhook
  delivery replay/rotation, and advanced provider/plugin diagnostics;
- route/admin maintenance beyond current safe route state, including admin route repair/prune
  diagnostics and future force-HTTPS policy controls;
- framework catalog expansion beyond the active supported set: Ruby, PHP, Go, .NET, Rust, Elixir,
  Micronaut, and real buildpack execution;
- automatic provider/runtime retry workers beyond current durable process attempt visibility and
  operation-specific retry commands;
- remote SSH PGlite repair/prune operations beyond current safe diagnostics;
- exhaustive help-affordance crawling for every possible Web/CLI/API/MCP link beyond current
  registered docs-topic coverage.

## Build Locally

```bash
bun run build
bun run package:binary-bundle
bun run package:binary-bundle -- --target linux-x64-gnu --version 0.1.0 --archive
bun run package:artifacts -- --version 0.1.0 --archives
bun run release:manifest -- --version 0.1.0
bun run release:notes -- --version 0.1.0
bun run checksums
docker build --build-arg APPALOFT_APP_VERSION=0.1.0 -t appaloft-all-in-one:local .
```

## GitHub Actions

- `ci.yml`: lint, typecheck, unit, integration, build, binary smoke, Docker build smoke.
- `e2e.yml`: real Postgres, started backend, CLI/API/deployment E2E, web smoke.
- `nightly.yml`: scheduled Compose/self-host smoke.
- `release.yml`: manually creates or updates a Release Please PR on `main`, adds roadmap release
  alignment to that PR, and publishes only when the merged release PR pushes a `chore: release ...`
  commit to `main`. Public docs deployment is no longer tied to product releases.
- `ssh-remote-state-e2e.yml` and `ssh-quick-deploy-e2e.yml`: GitHub Actions secret-gated SSH
  release-readiness smokes used by nightly and release, with local explicit reproduction through
  the matching e2e environment variables. They require SSH test-target secrets and can be made
  required for a manual release run with `require_ssh_remote_state_e2e=true` and
  `require_ssh_quick_deploy_e2e=true`. Local developer runs may skip the real SSH smokes when no
  target server is available; release-readiness runs that need SSH confidence should set the
  required inputs so the workflows fail closed when target secrets are absent. Each reusable
  workflow uploads a redacted SSH evidence JSON artifact after its suite passes.
- `framework-fixture-e2e.yml`: full supported-catalog real smoke gate used by nightly and release.
  It runs local Docker substrate smoke once, shards framework fixtures by
  `APPALOFT_E2E_FRAMEWORK_FIXTURE` on the GitHub Docker runner, and runs the same fixture matrix over
  generic SSH when SSH target secrets exist. A manual release can require the SSH framework gate with
  `require_framework_fixture_e2e=true`; without SSH secrets, the workflow fails closed only when
  required. The package scripts remain available for local reproduction:
  `bun run smoke:framework:docker`, `bun run smoke:framework:ssh`, and `bun run smoke:framework`.
- `scheduled-task-e2e.yml`: scheduled-task real runtime smoke gate used by nightly and release. It
  runs `bun run smoke:scheduled-task:docker` on the GitHub Docker runner and runs
  `bun run smoke:scheduled-task:ssh` after the shared SSH preflight when SSH target secrets exist. A
  manual release can require the SSH scheduled-task gate with
  `require_scheduled_task_e2e=true`; without SSH secrets, the workflow fails closed only when
  required. The package scripts remain available for local reproduction:
  `bun run smoke:scheduled-task:docker`, `bun run smoke:scheduled-task:ssh`, and
  `bun run smoke:scheduled-task`.
- `storage-cleanup-e2e.yml`: storage runtime cleanup smoke gate used by nightly and release. It
  runs `bun run smoke:storage-cleanup:docker` on the GitHub Docker runner and runs
  `bun run smoke:storage-cleanup:ssh` after the shared SSH preflight when SSH target secrets exist.
  A manual release can require the SSH storage-cleanup gate with
  `require_storage_cleanup_e2e=true`; without SSH secrets, the workflow fails closed only when
  required. The package scripts remain available for local reproduction:
  `bun run smoke:storage-cleanup:docker`, `bun run smoke:storage-cleanup:ssh`, and
  `bun run smoke:storage-cleanup`. These probes create scoped Appaloft-named Docker volumes and must
  not run broad Docker prune.
- `runtime-usage-e2e.yml`: runtime usage attribution smoke gate used by nightly and release. It
  runs `bun run smoke:runtime-usage:docker` on the GitHub Docker runner and runs
  `bun run smoke:runtime-usage:ssh` after the shared SSH preflight when SSH target secrets exist. A
  manual release can require the SSH runtime-usage gate with `require_runtime_usage_e2e=true`;
  without SSH secrets, the workflow fails closed only when required. The package scripts remain
  available for local reproduction: `bun run smoke:runtime-usage:docker`,
  `bun run smoke:runtime-usage:ssh`, and `bun run smoke:runtime-usage`. These probes inspect real
  runtime targets and remain read-only release-readiness gates.
- `capacity-prune-e2e.yml`: runtime capacity prune smoke gate used by nightly and release. It runs
  `bun run smoke:capacity-prune:local` against a temporary local runtime root and runs
  `bun run smoke:capacity-prune:ssh` after the shared SSH preflight when SSH target secrets exist. A
  manual release can require the SSH capacity-prune gate with `require_capacity_prune_e2e=true`;
  without SSH secrets, the workflow fails closed only when required. The package scripts remain
  available for local reproduction: `bun run smoke:capacity-prune:local`,
  `bun run smoke:capacity-prune:ssh`, and `bun run smoke:capacity-prune`. These probes create only
  scoped temporary Appaloft workspace roots and prove dry-run-first destructive prune behavior.
- `preview-provider-e2e.yml`: GitHub preview provider feedback smoke gate used by nightly and
  release. It runs `bun run smoke:preview-provider:github` only when
  `APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN`, `APPALOFT_GITHUB_PREVIEW_SMOKE_REPOSITORY`, and
  `APPALOFT_GITHUB_PREVIEW_SMOKE_PR` are configured. A manual release can require the gate with
  `require_preview_provider_e2e=true`; without these secrets, the workflow fails closed only when
  required. The probe creates or updates a marker comment on the configured pull request and
  verifies the provider writer returns safe metadata without token/body echo.
- `dependency-redis-backup-e2e.yml`: Redis dependency backup/restore smoke gate used by nightly and
  release. It provisions a Redis service in GitHub Actions, installs `redis-cli`, and runs
  `bun run smoke:dependency-redis-backup` with `APPALOFT_E2E_REDIS_BACKUP_RESTORE=true` to prove the
  shell native Redis logical backup/restore path against a real Redis server.
- `deploy-docs.yml`: deploys `apps/docs` as a standalone static site to `https://docs.appaloft.com`
  with Appaloft from the checked-out source and `appaloft.docs.yml`. Pushes to `main` auto-deploy
  when docs content, docs config, or the source-side deployment stack used by docs changes. Manual
  runs can redeploy docs from `main` or another ref without waiting for a release.
- `release-retry.yml`: rebuilds and reuploads assets for an existing tag without changing the version.
- `release-build.yml`: reusable release build for source archives, CLI binaries, desktop bundles, GHCR, npm, GitHub Release assets, checksums, attestations, and Homebrew tap updates.

## Release Artifacts

GitHub Release assets include:

- backend archive: `appaloft-backend-vX.Y.Z.tar.gz`
- static web archive: `appaloft-web-static-vX.Y.Z.tar.gz`
- CLI binary archives for macOS, Linux glibc, Linux musl, and Windows
- desktop installers for macOS, Linux, and Windows when the Tauri job succeeds
- `docker-compose.selfhost.yml`
- `Dockerfile`
- `install.sh` Docker self-host installer
- `release-manifest.json`
- `checksums.txt`

The root `install.sh` file is the source of truth for the public quick-start script. Release builds
upload it as the `install.sh` GitHub Release asset. The website should serve
`https://appaloft.com/install.sh` by redirecting or proxying to the latest release asset URL:
`https://github.com/appaloft/appaloft/releases/latest/download/install.sh`. Do not copy the script
from a local checkout during website builds.

The CLI binary bundle embeds:

- the Bun-compiled backend/CLI executable
- static web console assets
- PGlite runtime assets
- `.env.example`
- `run-appaloft.sh`

## Distribution Channels

- GitHub Release is the canonical artifact host.
- GHCR publishes `ghcr.io/appaloft/appaloft:X.Y.Z`, `X.Y`, `X`, and `latest` for stable releases.
- npm publishes `@appaloft/cli`, platform-specific optional dependency packages, and
  `@appaloft/sdk`.
- Homebrew publishes `appaloft` to `appaloft/homebrew-tap` when `HOMEBREW_TAP_TOKEN` is configured.
- Homebrew Cask for desktop is generated only when macOS desktop artifacts are present.

## Required Secrets

- `RELEASE_PLEASE_TOKEN`: recommended GitHub App token or PAT so release-created events can trigger downstream workflows when needed.
- `NPM_TOKEN`: optional fallback for npm publish. Prefer npm trusted publishing/OIDC. Because the
  source repository is private, npm provenance is not requested.
- `HOMEBREW_TAP_TOKEN`: token with write access to `appaloft/homebrew-tap`.
- `APPALOFT_E2E_SSH_HOST`: SSH release-readiness target host used by the explicit
  `smoke:ssh:remote-state` and `smoke:ssh:quick-deploy` suites.
- `APPALOFT_E2E_SSH_PRIVATE_KEY`: SSH private key for the release-readiness target. Workflows write
  this value to a temporary key file and pass only the file path to the tests.
- `APPALOFT_E2E_SSH_PORT`: optional SSH release-readiness target port; defaults to `22`.
- `APPALOFT_E2E_SSH_USERNAME`: optional SSH release-readiness target user; defaults to `root`.
  Blank whitespace-only values are rejected by the preflight.
- `APPALOFT_E2E_PUBLIC_ROUTE_HOST`: optional host template for SSH remote-state route checks. Use
  `{suffix}` in the value when the target needs per-run hostnames.
- `APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN`: optional GitHub token for the secret-gated product-grade
  preview provider feedback smoke. It must be able to create or update issue comments on the smoke
  pull request.
- `APPALOFT_GITHUB_PREVIEW_SMOKE_REPOSITORY`: optional `owner/repo` target used by the product-grade
  preview provider feedback smoke.
- `APPALOFT_GITHUB_PREVIEW_SMOKE_PR`: optional pull request number used by the product-grade preview
  provider feedback smoke.
- `APPALOFT_SSH_PRIVATE_KEY`: SSH private key used by `deploy-docs.yml` to deploy to the same
  server as `appaloft/www` when the docs workflow uses the pure SSH CLI fallback.
- `APPALOFT_TOKEN`: bearer token used by `deploy-docs.yml` when
  `APPALOFT_CONTROL_PLANE_MODE=self-hosted`.

## Required Variables

- `APPALOFT_SSH_HOST`: SSH host used by `deploy-docs.yml`; keep it aligned with `appaloft/www`.
- `APPALOFT_SSH_USER`: optional SSH username used by `deploy-docs.yml`; defaults to `root`.
- `APPALOFT_CONTROL_PLANE_MODE`: set to `self-hosted` to route docs deployment through the
  Appaloft server config deploy API.
- `APPALOFT_CONTROL_PLANE_URL`: Appaloft server URL used when
  `APPALOFT_CONTROL_PLANE_MODE=self-hosted`.
- `APPALOFT_PROJECT_ID`, `APPALOFT_ENVIRONMENT_ID`, `APPALOFT_DOCS_RESOURCE_ID`,
  `APPALOFT_SERVER_ID`: trusted Appaloft context used by the docs server config deploy workflow.

## Required DNS

- `docs.appaloft.com` must resolve through Cloudflare to the same public origin path used by
  `www.appaloft.com`. The docs deployment creates the Appaloft static-site resource and server-side
  reverse-proxy route, but DNS still has to send traffic to that server.

For npm trusted publishing, configure each npm package to trust GitHub Actions from
`appaloft/appaloft` with workflow filename `release.yml`. The publish command lives in the reusable
`release-build.yml`, but npm validates the calling workflow for `workflow_call`/manual dispatch
flows.

## Manual Release Steps

1. Merge normal feature and fix PRs into `main`.
2. Read `docs/PRODUCT_ROADMAP.md`, compare it with the implementation and release state, and choose
   the allowed version.
3. Before selecting any pre-`1.0.0` target whose roadmap requires SSH
   release-readiness, run `bun run smoke:ssh:preflight` to verify the `ssh` executable,
   `APPALOFT_E2E_SSH_HOST`, optional `APPALOFT_E2E_SSH_PORT`, optional
   `APPALOFT_E2E_SSH_USERNAME`, and the private-key path is a regular file with content and private
   permissions, then run `bun run smoke:ssh:evidence` with the target's optional SSH variables
   configured. The evidence command runs the aggregate `bun run smoke:ssh` suite and writes
   `dist/release/ssh-smoke-evidence.json` only after both SSH suites pass; the JSON records
   redacted configuration booleans and does not include host, username, key path, route host, or
   secret material. Verify the captured aggregate artifact with `bun run smoke:ssh:evidence:verify`
   before recording the evidence in the roadmap or release notes. In GitHub Actions, the reusable
   SSH workflows write
   `dist/release/ssh-remote-state-evidence.json` and
   `dist/release/ssh-quick-deploy-evidence.json` and upload them as workflow artifacts after the
   corresponding suite passes. If local SSH smoke cannot run because no target server is available,
   use the GitHub Actions reusable workflows as the release-readiness confidence layer and set the
   corresponding `require_*_e2e=true` inputs for suites that must block the release.
4. Open GitHub Actions and run `Release` from `main`. Set `release_as` only when the roadmap gate
   allows an explicit target such as `0.11.0`. For a `0.11.0` release-readiness run with SSH
   secrets available, set both `require_ssh_remote_state_e2e=true` and
   `require_ssh_quick_deploy_e2e=true`. Set `require_framework_fixture_e2e=true` when the same SSH
   target should also prove the full generic-SSH framework fixture gate. Set
   `require_scheduled_task_e2e=true` when the SSH target should also prove scheduled-task Docker
   runtime execution. Set `require_storage_cleanup_e2e=true` when the SSH target should also prove
   dry-run-first scoped storage runtime cleanup over generic SSH Docker. Set
   `require_runtime_usage_e2e=true` when the SSH target should also prove read-only runtime usage
   attribution. Set `require_capacity_prune_e2e=true` when the SSH target should also prove
   dry-run-first scoped runtime workspace prune over generic SSH. Set
   `require_preview_provider_e2e=true` when the release should prove live GitHub PR-comment preview
   feedback. When one of those inputs is true, missing SSH target secrets or GitHub preview provider
   smoke secrets fail the reusable workflow instead of silently accepting the release.
5. Review the single Release Please PR. It must include the generated version/changelog changes and
   the `docs/PRODUCT_ROADMAP.md` release alignment commit. When `release_as` is set, the workflow
   also enforces that the release PR title, body, version files, and changelog use that exact
   version.
6. Merge the Release Please PR when ready to publish. Use the default release PR title as the merge
   commit subject so it starts with `chore: release `. The merge commit is the publishing
   confirmation and triggers the release publish run automatically.

If you do not want to publish yet, do not run `Release`, or leave the Release Please PR unmerged.

## Docs-Only Redeploys

`Deploy Docs` runs automatically on `main` when docs content, docs config, or the docs deploy
dependency chain changes. Use it manually only when the docs source needs to be rebuilt from a
specific ref.

1. Open GitHub Actions and run `Deploy Docs`.
2. Leave `source_ref=main` to redeploy the latest merged docs source, or choose another branch,
   tag, or SHA for a targeted redeploy.

Docs deploys always run Appaloft from the checked-out source ref, so docs-recovery fixes in
unreleased CLI code can be used immediately without publishing a new product release first.

## Checksums And Provenance

`scripts/release/generate-checksums.ts` writes SHA-256 checksums for the final release directory. `release-build.yml` uses GitHub artifact attestations for release files and container images.
