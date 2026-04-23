# Release

Appaloft uses a trunk-based release flow with manually triggered Release Please. Merges to `main`
do not publish releases automatically. Run the `Release` GitHub Actions workflow manually to create
or update the release PR from Conventional Commits. After merging that release PR, run `Release`
manually again to create the tag, GitHub Release, and distribution artifacts.

## Versioning And Changelog

- Use a single product SemVer version for backend, CLI, desktop, Docker, Homebrew, and npm.
- Release tags use `vX.Y.Z`.
- `CHANGELOG.md` is maintained by Release Please in the release PR.
- `docs/PRODUCT_ROADMAP.md` is the release gate before `1.0.0`; read it before every
  release workflow run and reject any Release Please PR whose version is not allowed by the
  roadmap checklist.
- Release Please is configured to keep pre-`1.0.0` feature and minor bumps on the current patch
  line by default. Use a `Release-As: X.Y.Z` commit footer only when the roadmap gate explicitly
  allows a target minor, or when a hotfix needs an explicit version.
- The GitHub Release body is generated from `CHANGELOG.md` plus the built release artifact list,
  so the release page includes install commands, direct download links, known gaps, and the
  conventional-commit changelog.
- npm package versions are injected during the publish job so release PRs do not need to rewrite
  workspace package versions or `bun.lock`.

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
- `release.yml`: manually runs Release Please on `main`; if a release is created, calls
  `release-build.yml` and then deploys the public docs site.
- `deploy-docs.yml`: deploys `apps/docs` as a standalone static site to `https://docs.appaloft.com`
  with the released Appaloft CLI and `appaloft.docs.yml`. Release-triggered runs deploy the tagged
  source; manual runs can redeploy docs from `main` or another ref without waiting for a new
  release tag.
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
- npm publishes `@appaloft/cli` plus platform-specific optional dependency packages.
- Homebrew publishes `appaloft` to `appaloft/homebrew-tap` when `HOMEBREW_TAP_TOKEN` is configured.
- Homebrew Cask for desktop is generated only when macOS desktop artifacts are present.

## Required Secrets

- `RELEASE_PLEASE_TOKEN`: recommended GitHub App token or PAT so release-created events can trigger downstream workflows when needed.
- `NPM_TOKEN`: optional fallback for npm publish. Prefer npm trusted publishing/OIDC. Because the
  source repository is private, npm provenance is not requested.
- `HOMEBREW_TAP_TOKEN`: token with write access to `appaloft/homebrew-tap`.
- `APPALOFT_SSH_PRIVATE_KEY`: SSH private key used by `deploy-docs.yml` to deploy to the same
  server as `appaloft/www`.

## Required Variables

- `APPALOFT_SSH_HOST`: SSH host used by `deploy-docs.yml`; keep it aligned with `appaloft/www`.
- `APPALOFT_SSH_USER`: optional SSH username used by `deploy-docs.yml`; defaults to `root`.

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
3. Open GitHub Actions and run `Release` from `main`. This creates or updates the Release Please PR.
4. Review the generated version and `CHANGELOG.md`; stop if the version violates the roadmap gate.
5. Merge the Release Please PR when ready to publish.
6. Run `Release` from `main` again. This creates `vX.Y.Z`, publishes the GitHub Release, and runs
   the artifact/npm/Homebrew/GHCR jobs.

If you do not want to publish yet, do not run `Release`, or leave the Release Please PR unmerged.

## Docs-Only Redeploys

Use `Deploy Docs` directly when the docs source needs to be rebuilt and deployed without publishing
a new Appaloft release.

1. Open GitHub Actions and run `Deploy Docs`.
2. Leave `appaloft_version=latest` unless docs deployment needs a specific released Appaloft CLI.
3. Set `source_ref=main` to redeploy the latest merged docs source, or choose another branch, tag,
   or SHA for a targeted redeploy.

This keeps docs recovery independent from the product release flow while still using a released
Appaloft deploy binary.

## Checksums And Provenance

`scripts/release/generate-checksums.ts` writes SHA-256 checksums for the final release directory. `release-build.yml` uses GitHub artifact attestations for release files and container images.
