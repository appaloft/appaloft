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
| RELEASE-HARDENING-006 | Local, Docker, Compose, prebuilt image, static, Swarm, install-auth, SSH preflight, aggregate SSH, SSH remote-state, SSH quick-deploy, and redacted SSH evidence-capture smoke commands remain first-class package scripts and release workflow gates for release readiness. | Smoke command contract | Automated in `scripts/test/release-build-workflow.test.ts` by checking package scripts, SSH preflight fail-closed behavior, evidence redaction, and workflow references; real execution remains environment-gated where Docker/SSH is required. |
| RELEASE-HARDENING-007 | The release alignment gate allows stable `0.11.0` only after Phase 9 release-readiness checklist items are checked or explicitly accepted as release-note gaps. | Roadmap release gate | Automated in `scripts/test/release-build-workflow.test.ts` by invoking `scripts/release/align-roadmap-for-release.ts --target-version 0.11.0 --check` and expecting the current accepted SSH evidence gap not to block roadmap alignment. |

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
- 2026-05-12 opt-in SSH workflow rerun: `bun test
  ./apps/shell/test/e2e/github-action-ssh-state.workflow.e2e.ts` skipped
  `[CONFIG-FILE-STATE-013]` because `APPALOFT_E2E_SSH_REMOTE_STATE=true` was not set. `bun test
  ./apps/shell/test/e2e/quick-deploy-ssh.workflow.e2e.ts` skipped `[QUICK-DEPLOY-WF-022]`,
  `[QUICK-DEPLOY-WF-060]`, `[QUICK-DEPLOY-WF-034]`, and `[QUICK-DEPLOY-WF-040]` because
  `APPALOFT_E2E_SSH_QUICK_DEPLOY=true` was not set. The current environment exposes only
  `SSH_AUTH_SOCK`; it does not provide `APPALOFT_E2E_SSH_HOST`,
  `APPALOFT_E2E_SSH_PRIVATE_KEY`, or the opt-in flags required for SSH release smoke evidence.
- 2026-05-12 current-state wiring update: `smoke:ssh` is the aggregate opt-in SSH release-readiness
  command over `smoke:ssh:remote-state` and `smoke:ssh:quick-deploy`; `ssh-remote-state-e2e` and
  `ssh-quick-deploy-e2e` are reusable GitHub workflows, nightly invokes both as optional
  environment-gated smokes, and release can require both through
  `require_ssh_remote_state_e2e` and `require_ssh_quick_deploy_e2e`. For `0.11.0`, missing real SSH
  evidence is an accepted deferred release-note gap because this local release-preparation
  environment has no SSH target server; `v0.11.x` publish runs no longer require both SSH workflows
  automatically, but the manual required inputs remain available when SSH secrets exist.
- 2026-05-12 fail-closed SSH smoke script check: `smoke:ssh:remote-state` and
  `smoke:ssh:quick-deploy` now pass explicit `./apps/...` file paths to `bun test`, so Bun executes
  the workflow-named e2e files instead of treating them as unmatched filters. With SSH credentials
  intentionally absent, both scripts fail at the opt-in `APPALOFT_E2E_SSH_HOST` requirement, which
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
- 2026-05-12 current-state gate check: `scripts/test/release-build-workflow.test.ts` proves the
  release alignment script allows `Release-As: 0.11.0` only after Phase 9 release readiness is
  checked or explicitly accepted as a release-note gap. The current accepted gap is missing real SSH
  smoke evidence in local release preparation because no SSH target server is available.

## Current Gaps

- Phase 9 release readiness carries an accepted `0.11.0` release-note gap for missing real SSH smoke
  evidence in this local release-preparation environment. Run `bun run smoke:ssh:evidence` and
  `bun run smoke:ssh:evidence:verify` in a later environment that has an SSH target server before
  removing this gap.
- The local smoke harness now isolates its control-plane HTTP port from the deployed workload port,
  skips best-effort Docker cleanup when Docker is absent, and reports deployment-log failures before
  trying to parse a runtime URL. The workspace-command smoke also now uses the
  `examples/express-hello` Node-compatible build command (`node build.mjs`) instead of a Bun-only
  build command for an npm-owned package.
- Opt-in SSH workflow smokes remain blocked until a target host, matching private key, and required
  `APPALOFT_E2E_SSH_*` variables are supplied for the release-readiness environment.
- The public deploy-action repository promotion/mirroring remains tracked outside this private
  repository; the in-repo reference wrapper and exported public layout are contract-tested here.
