# Release Hardening Test Matrix

This matrix governs the Phase 9 install, upgrade, packaging, release, static-asset, and smoke
readiness surface for `0.11.0`. It records release-gate evidence only; it does not authorize a
release while other Phase 9 roadmap items or exit criteria remain unchecked.

| Test ID | Scenario | Layer | Automation |
| --- | --- | --- | --- |
| RELEASE-HARDENING-001 | Self-hosted installer validates Compose/Swarm, PostgreSQL/PGlite, first-use handoff, console-domain proxy routing, optional Jaeger trace wiring, auth secret reuse, and safe output. | Installer script contract | Automated in `scripts/test/install-sh.test.ts`; opt-in real Docker/browser coverage is in `scripts/test/install-full-smoke.test.ts` and exposed as `bun run smoke:install-auth`. |
| RELEASE-HARDENING-002 | Static console and docs assets serve from packaged or override directories with clean-URL and SPA fallback behavior separated from `/docs/*`. | HTTP/static + binary bundle | Automated in `packages/adapters/http-elysia/test/static-assets.test.ts` and `scripts/test/binary-bundle.test.ts`. |
| RELEASE-HARDENING-003 | Release build publishes source archives, CLI binary archives, desktop artifacts, all-in-one GHCR image, npm packages including `@appaloft/sdk`, release manifest, checksums, release notes, final metadata, and optional Homebrew tap updates through governed jobs. | GitHub Actions release contract | Automated in `scripts/test/release-build-workflow.test.ts` and SDK package checks in `scripts/test/sdk-release-packaging.test.ts`. |
| RELEASE-HARDENING-004 | Binary bundle and Docker image packaging include PGlite/runtime assets and exclude heavyweight local artifacts from Docker build context. | Packaging script contract | Automated in `scripts/test/binary-bundle.test.ts`. |
| RELEASE-HARDENING-005 | Deploy-console and deploy-action install-console workflows use the released installer over SSH, keep pure SSH deploy separate, preserve trusted overrides, and keep secrets out of repository config. | Workflow/action wrapper contract | Automated in `scripts/test/deploy-console-workflow.test.ts` and `scripts/test/deploy-action-wrapper.test.ts`. |
| RELEASE-HARDENING-006 | Local, Docker, Compose, prebuilt image, static, full framework fixture Docker, full framework fixture SSH, aggregate framework, scheduled-task Docker, scheduled-task SSH, aggregate scheduled-task, storage-cleanup Docker, storage-cleanup SSH, aggregate storage-cleanup, runtime-usage Docker, runtime-usage SSH, aggregate runtime-usage, capacity-prune local, capacity-prune SSH, aggregate capacity-prune, GitHub preview provider smoke, dependency Redis backup smoke, Swarm, install-auth, SSH preflight, aggregate SSH, SSH remote-state, SSH quick-deploy, and redacted SSH evidence-capture smoke commands remain first-class package scripts and release workflow gates for release readiness. | Smoke command contract | Automated in `scripts/test/release-build-workflow.test.ts` by checking package scripts, framework fixture smoke entrypoints, scheduled-task real runtime smoke entrypoints, storage cleanup real runtime smoke entrypoints, runtime usage real target smoke entrypoints, capacity prune real target smoke entrypoints, GitHub preview provider smoke entrypoints, dependency Redis backup smoke entrypoints, SSH preflight fail-closed behavior, evidence redaction, and workflow references including `storage-cleanup-e2e.yml`, `runtime-usage-e2e.yml`, `capacity-prune-e2e.yml`, `preview-provider-e2e.yml`, and `dependency-redis-backup-e2e.yml`; real execution remains environment-gated where Docker/SSH/GitHub provider credentials or service containers are required. |
| RELEASE-HARDENING-007 | The release alignment gate allows stable `0.11.0` only after Phase 9 release-readiness checklist items are checked and the SSH confidence layer is represented by explicit local or GitHub Actions gates. | Roadmap release gate | Automated in `scripts/test/release-build-workflow.test.ts` by invoking `scripts/release/align-roadmap-for-release.ts --target-version 0.11.0 --check` and expecting the current real-gate release-readiness contract not to block roadmap alignment. |
| RELEASE-HARDENING-008 | Pre-`1.0.0-rc` closure verifies the seven remaining blocker decisions, eight RC selection gates, active operation catalog/docs/SDK/MCP parity, and accepted non-GA-blocking gap rationale without publishing the RC release. | Roadmap/spec/docs sync gate | Governed by `docs/specs/072-pre-rc-closure` and verified by targeted operation catalog, docs registry, SDK/MCP descriptor, access/domain/TLS, operator-work, retention, framework fixture, release-hardening, lint, typecheck, and `git diff --check` commands recorded in that artifact. |

## Verification Evidence

- 2026-05-12 current-state rerun: local contract verification passed 66 tests across
  `scripts/test/install-sh.test.ts`, `packages/adapters/http-elysia/test/static-assets.test.ts`,
  `scripts/test/binary-bundle.test.ts`, `scripts/test/release-build-workflow.test.ts`,
  `scripts/test/sdk-release-packaging.test.ts`, `scripts/test/deploy-console-workflow.test.ts`,
  and `scripts/test/deploy-action-wrapper.test.ts`.
- 2026-05-12 current-state rerun: bounded PGlite release-readiness verification passed 50 tests
  across `packages/persistence/pg/test/process-attempt-journal.pglite.test.ts`,
  `packages/persistence/pg/test/pglite.integration.test.ts`,
  `packages/persistence/pg/test/domain-event-stream-retention.pglite.test.ts`,
  `packages/persistence/pg/test/retention-defaults.pglite.test.ts`,
  `packages/persistence/pg/test/deployment-log-retention.pglite.test.ts`,
  `packages/persistence/pg/test/provider-job-log-retention.pglite.test.ts`,
  `packages/persistence/pg/test/resource-runtime-log-archive-store.pglite.test.ts`, and
  `packages/persistence/pg/test/scheduled-runtime-prune-policy-read-model.pglite.test.ts`.
- 2026-05-12 current-state rerun: PostgreSQL release-readiness verification passed
  `packages/persistence/pg/test/repositories.integration.test.ts` against an isolated temporary
  PostgreSQL cluster under `/private/tmp/appaloft-pg-release-1778579238`, with
  `APPALOFT_DATABASE_URL=postgresql://$USER@127.0.0.1:55432/appaloft_release_test`. A first
  sandboxed attempt failed at `initdb` shared-memory creation with `shmget` operation not
  permitted, and an initial escalated retry using a malformed Unix-socket URL failed before the
  corrected TCP rerun passed.
- 2026-05-12 current-state rerun: `bun run smoke:local:commands` failed inside the sandbox at
  loopback port reservation with `listen 127.0.0.1 EPERM`; an escalated rerun with
  `PATH=/opt/homebrew/Cellar/docker/29.4.3/bin:...` and
  `DOCKER_HOST=unix:///Users/nichenqin/.colima/default/docker.sock` passed against Colima Docker,
  returning a reachable Express health payload at `http://127.0.0.1:32768/health`.
- 2026-05-12 current-state Docker-backed local smoke rerun: the same escalated Colima environment
  passed `bun run smoke:local:static`, `bun run smoke:local:docker`,
  `bun run smoke:local:prebuilt`, and `bun run smoke:local:compose`. The static run returned the
  expected marker HTML, Dockerfile and prebuilt-image runs returned Express health payloads, and
  Compose reported a successful stack start.
- 2026-05-12 current-state Swarm smoke rerun: `bun run smoke:swarm` first failed the opt-in real
  Swarm check because Docker was not in Swarm mode (`inactive false`), and then timed out at the
  default 120 second test limit during the real authenticated-registry apply/cleanup path after a
  temporary Swarm manager was initialized. The first-class script now sets
  `APPALOFT_DOCKER_SWARM_SMOKE_TIMEOUT_MS=300000` and `bun test --timeout=300000`; with a temporary
  `appaloft-smoke-edge` overlay network, it passed 11 tests including the opt-in real Swarm
  apply/cleanup path in 68.25s and cleanup returned Docker to `inactive false`.
- 2026-05-12 current-state install-auth smoke rerun: `bun run smoke:install-auth` initially failed
  while building the current-source Docker image because `bun install --frozen-lockfile` reported
  an out-of-sync lockfile. After syncing `bun.lock`, `bun install --frozen-lockfile` passed locally
  and the install-auth smoke passed 1 test with 34 assertions in 50.14s against Colima Docker,
  covering the PGlite install, first-admin bootstrap, deploy-token creation, server-mode
  deployment probe, Action deploy-token admission, and console page readiness.
- 2026-05-12 GitHub Actions/local explicit SSH workflow rerun: `bun test
  ./apps/shell/test/e2e/github-action-ssh-state.workflow.e2e.ts` skipped
  `[CONFIG-FILE-STATE-013]` because `APPALOFT_E2E_SSH_REMOTE_STATE=true` was not set. `bun test
  ./apps/shell/test/e2e/quick-deploy-ssh.workflow.e2e.ts` skipped `[QUICK-DEPLOY-WF-022]`,
  `[QUICK-DEPLOY-WF-060]`, `[QUICK-DEPLOY-WF-034]`, and `[QUICK-DEPLOY-WF-040]` because
  `APPALOFT_E2E_SSH_QUICK_DEPLOY=true` was not set. The current environment exposes only
  `SSH_AUTH_SOCK`; it does not provide `APPALOFT_E2E_SSH_HOST`,
  `APPALOFT_E2E_SSH_PRIVATE_KEY`, or the local explicit flags required for SSH release smoke
  evidence.
- 2026-05-12 current-state wiring update: `smoke:ssh` is the aggregate local explicit SSH
  release-readiness command over `smoke:ssh:remote-state` and `smoke:ssh:quick-deploy`;
  `ssh-remote-state-e2e` and `ssh-quick-deploy-e2e` are reusable GitHub workflows, nightly invokes both as optional
  environment-gated smokes, and release can require both through
  `require_ssh_remote_state_e2e` and `require_ssh_quick_deploy_e2e`. Local preparation may skip SSH
  execution when no target server exists, but a release-readiness run that needs SSH confidence sets
  the required inputs so missing SSH secrets fail the reusable workflows.
- 2026-05-15 framework fixture smoke wiring update: `smoke:framework:docker`,
  `smoke:framework:ssh`, and `smoke:framework` are first-class package scripts over the full
  supported local Docker catalog gate and generic-SSH framework fixture gate. The Docker script
  composes Dockerfile/Compose/prebuilt-image substrate smoke with
  `APPALOFT_E2E_FRAMEWORK_DOCKER=true` fixture smoke; the SSH script runs `smoke:ssh:preflight`
  before enabling `APPALOFT_E2E_SSH_FRAMEWORK_DOCKER=true`, so an environment without a configured
  SSH target fails closed instead of silently skipping the full generic-SSH fixture gate.
- 2026-05-15 framework fixture workflow wiring update: `framework-fixture-e2e.yml` is a reusable
  GitHub Actions workflow for the same full supported-catalog fixture gates. Nightly invokes it as
  an optional environment-gated smoke. Release invokes it before `release-build`; local Docker
  catalog smoke runs on the GitHub Docker runner, and the SSH framework fixture gate can be made
  required for manual release runs with `require_framework_fixture_e2e=true`.
- 2026-05-15 scheduled-task runtime smoke wiring update: `smoke:scheduled-task:docker`,
  `smoke:scheduled-task:ssh`, and `smoke:scheduled-task` are first-class package scripts for
  local explicit real scheduled-task runtime execution. The Docker script enables
  `APPALOFT_E2E_SCHEDULED_TASK_DOCKER=true` and proves a real one-off task container can run beside
  a Resource container. The SSH script runs `smoke:ssh:preflight` before enabling
  `APPALOFT_E2E_SSH_SCHEDULED_TASK_DOCKER=true`, so generic-SSH scheduled-task execution cannot be
  claimed without a configured SSH Docker target. `scheduled-task-e2e.yml` is the reusable GitHub
  Actions gate for the same probes; nightly invokes it as an optional environment-gated smoke, and
  release can require the SSH scheduled-task gate with `require_scheduled_task_e2e=true`.
- 2026-05-15 storage cleanup runtime smoke wiring update: `smoke:storage-cleanup:docker`,
  `smoke:storage-cleanup:ssh`, and `smoke:storage-cleanup` are first-class package scripts for
  local explicit real storage runtime cleanup. The Docker script enables
  `APPALOFT_E2E_STORAGE_CLEANUP_DOCKER=true` and proves dry-run-first plus destructive scoped cleanup
  against a real Appaloft-named Docker volume. The SSH script runs `smoke:ssh:preflight` before
  enabling `APPALOFT_E2E_SSH_STORAGE_CLEANUP_DOCKER=true`. `storage-cleanup-e2e.yml` is the
  reusable GitHub Actions gate for the same probes; nightly invokes it as an optional
  environment-gated smoke, and release can require the SSH storage-cleanup gate with
  `require_storage_cleanup_e2e=true`.
- 2026-05-15 runtime usage smoke wiring update: `smoke:runtime-usage:docker`,
  `smoke:runtime-usage:ssh`, and `smoke:runtime-usage` are first-class package scripts for
  local explicit real runtime usage attribution. The Docker script enables
  `APPALOFT_RUNTIME_USAGE_DOCKER_SMOKE=1` and proves read-only capacity-to-usage translation against
  local runtime metadata. The SSH script runs `smoke:ssh:preflight` before enabling
  `APPALOFT_RUNTIME_USAGE_SSH_SMOKE=1`. `runtime-usage-e2e.yml` is the reusable GitHub Actions gate
  for the same probes; nightly invokes it as an optional environment-gated smoke, and release can
  require the SSH runtime-usage gate with `require_runtime_usage_e2e=true`.
- 2026-05-15 capacity prune smoke wiring update: `smoke:capacity-prune:local`,
  `smoke:capacity-prune:ssh`, and `smoke:capacity-prune` are first-class package scripts for
  local explicit real runtime workspace prune. The local script enables
  `APPALOFT_E2E_CAPACITY_PRUNE_LOCAL=true` and proves dry-run-first plus destructive scoped cleanup
  against a temporary Appaloft runtime root. The SSH script runs `smoke:ssh:preflight` before
  enabling `APPALOFT_E2E_SSH_CAPACITY_PRUNE=true`. `capacity-prune-e2e.yml` is the reusable GitHub
  Actions gate for the same probes; nightly invokes it as an optional environment-gated smoke, and
  release can require the SSH capacity-prune gate with `require_capacity_prune_e2e=true`.
- 2026-05-15 preview provider smoke wiring update: `smoke:preview-provider:github` is a
  first-class package script for secret-gated live GitHub preview PR-comment feedback. The script
  enables `APPALOFT_GITHUB_PREVIEW_PROVIDER_SMOKE=true` and requires
  `APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN`, `APPALOFT_GITHUB_PREVIEW_SMOKE_REPOSITORY`, and
  `APPALOFT_GITHUB_PREVIEW_SMOKE_PR`. `preview-provider-e2e.yml` is the reusable GitHub Actions
  gate; nightly invokes it as an optional environment-gated smoke, and release can require the gate
  with `require_preview_provider_e2e=true`.
- 2026-05-15 dependency Redis backup smoke wiring update:
  `smoke:dependency-redis-backup` is a first-class package script for real Redis logical
  backup/restore. The script enables `APPALOFT_E2E_REDIS_BACKUP_RESTORE=true` and runs
  `apps/shell/test/e2e/dependency-resource-redis-backup.workflow.e2e.ts`.
  `dependency-redis-backup-e2e.yml` is the reusable GitHub Actions gate; nightly and release invoke
  it with a Redis service container and host `redis-cli`.
- 2026-05-12 fail-closed SSH smoke script check: `smoke:ssh:remote-state` and
  `smoke:ssh:quick-deploy` now pass explicit `./apps/...` file paths to `bun test`, so Bun executes
  the workflow-named e2e files instead of treating them as unmatched filters. With SSH credentials
  intentionally absent, both scripts fail at the explicit `APPALOFT_E2E_SSH_HOST` requirement, which
  proves the scripts do not silently pass without real SSH release-readiness evidence.
- 2026-05-12 SSH preflight script check: `smoke:ssh:preflight` verifies
  the `ssh` executable, `APPALOFT_E2E_SSH_HOST`, optional `APPALOFT_E2E_SSH_PORT`, optional
  `APPALOFT_E2E_SSH_USERNAME`, and the `APPALOFT_E2E_SSH_PRIVATE_KEY` regular file path before the
  aggregate `smoke:ssh` run or either individual SSH smoke starts the long real SSH suites. It also
  rejects directory key paths, an empty key file, invalid SSH port values, whitespace-only SSH
  usernames, and, on POSIX runners, key-file permissions that are broader than `0600`. The reusable
  `ssh-remote-state-e2e` and `ssh-quick-deploy-e2e` workflows also run the same preflight after
  writing the SSH key to the runner temp directory and before starting the real SSH suites, passing
  the optional `APPALOFT_E2E_SSH_PORT` and `APPALOFT_E2E_SSH_USERNAME` secrets into preflight before
  the execution step applies its defaults of `22` and `root`. The preflight prints only variable
  names and status messages, not the configured private-key path, username, or secret material.
- 2026-05-12 SSH evidence capture check: `smoke:ssh:evidence` runs the aggregate `smoke:ssh` suite
  and writes `dist/release/ssh-smoke-evidence.json` only after both SSH suites pass. The evidence
  record uses schema `appaloft.ssh-smoke-evidence/v1`, binds the result to
  `RELEASE-HARDENING-006`, lists the two SSH smoke suites, and stores only redacted configuration
  booleans for host, key, port, username, and public-route host presence. It does not record host,
  username, private-key path, public-route host, or secret material.
  `smoke:ssh:evidence:verify` validates the captured schema, target version, suite mode, required
  suite list, pass result, required host/key presence booleans, and configured secret-like value
  redaction before the evidence is used to update the roadmap.
  `smoke:ssh:remote-state:evidence` and `smoke:ssh:quick-deploy:evidence` write the per-workflow
  `dist/release/ssh-remote-state-evidence.json` and
  `dist/release/ssh-quick-deploy-evidence.json` records used by GitHub Actions reusable workflows,
  which upload those files as `ssh-remote-state-evidence` and `ssh-quick-deploy-evidence`
  artifacts. Focused test coverage verifies successful redacted evidence capture with a fake smoke
  command, per-suite suite lists, workflow artifact wiring, evidence verification success, target
  mismatch rejection, leaked configured-value rejection, and verifies failed smoke commands do not
  write an evidence file.
- 2026-05-15 current-state gate check: `scripts/test/release-build-workflow.test.ts` proves the
  release alignment script allows `Release-As: 0.11.0` only after Phase 9 release readiness is
  checked and the SSH smoke confidence layer is exposed through local explicit scripts plus
  fail-closed reusable GitHub Actions gates.
- 2026-05-16 pre-RC closure sync: `docs/specs/072-pre-rc-closure` records that this is
  pre-`1.0.0-rc` closure/hardening, not the RC release itself. The artifact maps the remaining
  seven blockers to closed or accepted non-GA-blocking outcomes and maps all eight Phase 11 RC
  verification gates to evidence. Accepted gaps must be carried into RC release notes if a release
  is generated from this state.

## Current Governed Follow-Ups

- The local smoke harness now isolates its control-plane HTTP port from the deployed workload port,
  skips best-effort Docker cleanup when Docker is absent, and reports deployment-log failures before
  trying to parse a runtime URL. The workspace-command smoke also now uses the
  `examples/express-hello` Node-compatible build command (`node build.mjs`) instead of a Bun-only
  build command for an npm-owned package.
- SSH workflow smokes require a target host, matching private key, and required
  `APPALOFT_E2E_SSH_*` variables. Local runs can be skipped when no target exists; GitHub Actions
  release-readiness runs can set the matching `require_*_e2e=true` input and fail closed if secrets
  are absent.
- The GitHub preview provider smoke requires a configured repository, pull request, and token.
  Local runs can be skipped when no provider smoke target exists; GitHub Actions release-readiness
  runs can set `require_preview_provider_e2e=true` and fail closed if provider smoke secrets are
  absent.
- The public deploy-action repository promotion/mirroring remains tracked outside this private
  repository; the in-repo reference wrapper and exported public layout are contract-tested here.
