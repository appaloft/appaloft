---
name: release
description: Appaloft release runbook for manually triggered GitHub Actions releases, including mandatory roadmap alignment and version-gate checks before release. Use when Codex is asked to prepare, trigger, publish, monitor, retry, or explain an Appaloft release; choose or verify a release version from docs/PRODUCT_ROADMAP.md; create or inspect a Release Please PR; publish GitHub Release assets, npm packages, Homebrew tap updates, GHCR images, desktop bundles, or CLI binaries; or verify release prerequisites and secrets.
---

# Release

## Core Rules

- Before every release, align `docs/PRODUCT_ROADMAP.md` with the current implementation and use it
  to decide the allowed version.
- Do not merge a release PR while required roadmap updates are missing from that release PR.
- Treat release execution as a public publishing action. Before running `gh workflow run release.yml`, clearly state what will happen and get explicit user confirmation.
- Do not merge PRs, push branches, create tags, publish releases, create tokens, or edit secrets unless the user explicitly asks for that action.
- Never print token values. Check only secret names and update timestamps.
- Keep release PR creation manual. A normal merge to `main` does not publish by itself; merging a
  Release Please PR with a `chore: release ...` merge commit is the publishing confirmation.
- Merge Release Please PRs with the default release PR title as the merge commit subject so the
  pushed commit starts with `chore: release `.
- Remember that `workflow_dispatch` requires `.github/workflows/release.yml` to exist on the default branch before GitHub can run it.

## Release Model

- Workflow: `.github/workflows/release.yml`
- GitHub workflow name: `Release`
- Default repo: `appaloft/appaloft`
- Default branch: `main`
- Stable release input: `prerelease=false`
- Prerelease npm dist-tag input: `prerelease=true`
- Explicit version input: `release_as=X.Y.Z`, used only when the roadmap gate allows a target minor
  or explicit hotfix version.
- The manual run creates or updates the Release Please PR and adds roadmap release alignment to that
  same PR.
- After that PR is merged, the push-triggered publish run creates the tag and GitHub Release, then publishes assets, npm packages, Homebrew tap files, GHCR images, desktop bundles, and CLI binaries.
- Changelog source: `CHANGELOG.md`, maintained by Release Please.

## Roadmap And Version Gate

Run this before release preflight, Release Please PR creation, or release PR merge:

1. Read `docs/PRODUCT_ROADMAP.md`.
2. Compare the roadmap checklist with:
   - the latest published release and current package manifests;
   - `packages/application/src/operation-catalog.ts`;
   - `docs/BUSINESS_OPERATION_MAP.md`;
   - `docs/CORE_OPERATIONS.md`;
   - relevant command/query/workflow/test-matrix/implementation-plan docs;
   - relevant code and tests for completed or incomplete release claims.
3. Update or verify `docs/PRODUCT_ROADMAP.md` when work was completed early, not completed as
   planned, deferred, removed, or newly discovered.
4. The Release workflow must add the current release alignment to the Release Please PR. If the
   workflow cannot do that automatically, push the roadmap alignment commit to the Release Please PR
   branch before merge. Do not open a separate roadmap-only PR unless the release PR cannot be
   created.
5. Use the roadmap checklist to accept or reject the intended release version.

Version decision rules:

- A target minor version is allowed only when every required checklist item and exit criterion for
  that phase, and all earlier phases, is checked.
- If the next target minor is incomplete, choose the next patch version on the current minor line.
  Example: if the current line is `0.2.x` and any `0.3.0` roadmap item remains unchecked, release
  `0.2.(x+1)` instead of `0.3.0`.
- Apply the same rule at every boundary before `1.0.0`.
- If a later-phase item was implemented early, mark it checked in its owning phase before release;
  do not move it to the earlier phase unless the roadmap target changed.
- If a planned item is intentionally deferred, leave it unchecked and record why the selected
  version can still ship.
- If Release Please proposes a version that violates the roadmap gate, stop and report the mismatch
  instead of merging the release PR.

## Preflight

Run read-only checks first:

```bash
gh auth status -h github.com
gh repo view appaloft/appaloft --json nameWithOwner,defaultBranchRef,visibility
gh workflow list -R appaloft/appaloft
gh secret list -R appaloft/appaloft --app actions
gh repo view appaloft/homebrew-tap --json nameWithOwner,visibility,url
```

Confirm these facts before triggering:

- `release.yml` exists on `main`.
- Actions are enabled and the `Release` workflow is listed.
- `NPM_TOKEN` exists when npm publishing is expected.
- `HOMEBREW_TAP_TOKEN` exists when Homebrew publishing is expected.
- `appaloft/homebrew-tap` is public when public Homebrew distribution is expected.

`RELEASE_PLEASE_TOKEN` is optional; the workflow falls back to `github.token`.

## Trigger Commands

Ask for explicit confirmation before these commands.

Create or update the Release Please PR:

```bash
gh workflow run release.yml -R appaloft/appaloft -f prerelease=false
```

Create or update a Release Please PR for a roadmap-approved explicit version:

```bash
gh workflow run release.yml -R appaloft/appaloft -f release_as=0.4.0 -f prerelease=false
```

Publish with prerelease npm tagging only when the user asks for prerelease behavior:

```bash
gh workflow run release.yml -R appaloft/appaloft -f prerelease=true
```

Use `--ref main` if the user asks for an explicit ref:

```bash
gh workflow run release.yml -R appaloft/appaloft --ref main -f prerelease=false
```

## Monitor

Find and watch the latest release run:

```bash
gh run list -R appaloft/appaloft --workflow release.yml --limit 5
run_id=$(gh run list -R appaloft/appaloft --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch -R appaloft/appaloft "$run_id" --exit-status
```

Inspect failures:

```bash
gh run view -R appaloft/appaloft "$run_id" --log-failed
```

Find the Release Please PR:

```bash
gh pr list -R appaloft/appaloft --state open --json number,title,headRefName,url --jq '.[] | select(.headRefName | contains("release-please"))'
```

List recent releases:

```bash
gh release list -R appaloft/appaloft --limit 10
```

## Retry And Troubleshooting

- If the first run does not create a release, look for an open Release Please PR and report its URL.
- If merging the Release Please PR does not start a publish run, verify the merge commit starts with
  `chore: release ` and rerun `Release` manually only after explaining the fallback and getting
  confirmation.
- If npm publish fails, check whether the package already exists, whether `NPM_TOKEN` exists, and whether trusted publishing is configured for `appaloft/appaloft` workflow filename `release.yml`.
- If Homebrew fails, verify `HOMEBREW_TAP_TOKEN`, `appaloft/homebrew-tap` access, and whether generated files changed.
- If GitHub Release asset upload fails, inspect the `publish-release-assets` job and retry with `release-retry.yml` only after explaining the failed job and getting confirmation.

## User Response Shape

When reporting status, include:

- what was triggered or inspected
- the run URL or PR URL when available
- whether this was the PR-creation run or the publish run
- which distribution channels were expected to publish
- next action needed, if any
